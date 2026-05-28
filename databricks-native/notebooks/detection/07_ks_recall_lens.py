# Databricks notebook source
# MAGIC %md
# MAGIC # Detection 07: Knowledge Store Recall Lens
# MAGIC
# MAGIC Queries the Knowledge Store (KS) for semantic matches against recent alerts
# MAGIC and events. When current activity RESEMBLES prior incidents, suppressions,
# MAGIC CTI campaigns, or analyst decisions, this lens emits a signal.
# MAGIC
# MAGIC **What it asks:**
# MAGIC - "Does this alert look like a prior confirmed incident?"
# MAGIC - "Was a similar pattern previously suppressed as FP?"
# MAGIC - "Does this match known threat actor TTPs?"
# MAGIC - "Did a playbook succeed or fail on something similar?"
# MAGIC
# MAGIC **How it works:**
# MAGIC 1. Load recent alerts/events not yet KS-checked
# MAGIC 2. For each, query the KS embedding index for semantic similarity
# MAGIC 3. If match found above threshold → emit `ks_recall` signal
# MAGIC 4. Different match types produce different signal strengths:
# MAGIC    - Prior incident match → boosts threat belief
# MAGIC    - Prior suppression match → reduces threat belief (FP likely)
# MAGIC    - CTI match → boosts with actor context
# MAGIC    - Playbook failure → suggests caution on automation
# MAGIC
# MAGIC **Architecture Position:** Detection lens (runs in parallel with CEP, CET, etc.)
# MAGIC Outputs feed UEO builder as `ks_recall` signal class.
# MAGIC
# MAGIC **Scheduling:** Every 5 minutes

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "10", "Minutes to look back for unchecked alerts")
dbutils.widgets.text("similarity_threshold", "0.72", "Minimum similarity for KS match")
dbutils.widgets.text("max_items", "500", "Max items to check per run")
dbutils.widgets.text("embedding_model", "databricks-bge-large-en", "Embedding model endpoint")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
similarity_threshold = float(dbutils.widgets.get("similarity_threshold"))
max_items = int(dbutils.widgets.get("max_items"))
embedding_model = dbutils.widgets.get("embedding_model")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Output Table

# COMMAND ----------

ks_recall_table = get_table_path(cfg, "ks_recall_signals")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ks_recall_table} (
    recall_id STRING NOT NULL,
    alert_id STRING,
    event_id STRING,
    entity_id STRING,
    -- What was recalled
    ks_entry_id STRING NOT NULL,
    ks_entry_type STRING NOT NULL,
    ks_title STRING,
    similarity_score DOUBLE NOT NULL,
    -- Signal scoring
    recall_signal_score DOUBLE NOT NULL,
    signal_direction STRING NOT NULL,
    -- Context
    ks_outcome STRING,
    ks_severity STRING,
    ks_mitre_techniques ARRAY<STRING>,
    explanation STRING,
    -- State
    emitted_as_signal BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Unchecked Alerts/Events

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
alerts_table = get_table_path(cfg, "alerts")

with mon.time("load_unchecked"):
    # Get recent alerts not yet KS-checked
    unchecked = spark.sql(f"""
        SELECT a.id as alert_id, a.title, a.description, a.severity,
               a.entity_id, a.source, a.created_at
        FROM {alerts_table} a
        LEFT JOIN {ks_recall_table} r ON a.id = r.alert_id
        WHERE a.created_at > '{cutoff.isoformat()}'
          AND r.recall_id IS NULL
          AND a.status NOT IN ('duplicate', 'closed')
        ORDER BY a.created_at DESC
        LIMIT {max_items}
    """)

    item_count = unchecked.count()
    if item_count == 0:
        print("No unchecked alerts to process")
        dbutils.notebook.exit(json.dumps({"status": "no_items", "recalls": 0}))

    print(f"Checking {item_count} alerts against Knowledge Store")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Knowledge Store for Semantic Matches
# MAGIC
# MAGIC Strategy: text-based matching first (fast), embedding-based for high-priority.

# COMMAND ----------

ks_table = get_table_path(cfg, "knowledge_store")
ks_embeddings_table = get_table_path(cfg, "knowledge_store_embeddings")

with mon.time("ks_recall"):
    # Load active KS entries
    try:
        ks_entries = spark.sql(f"""
            SELECT ks_id, entry_type, title, content, severity, confidence,
                   outcome, mitre_techniques, tags
            FROM {ks_table}
            WHERE is_active = true
        """)
        ks_count = ks_entries.count()
        print(f"  KS has {ks_count} active entries")
    except Exception as e:
        print(f"Knowledge Store not available: {str(e)[:100]}")
        dbutils.notebook.exit(json.dumps({"status": "ks_unavailable", "recalls": 0}))

    if ks_count == 0:
        print("Knowledge Store is empty")
        dbutils.notebook.exit(json.dumps({"status": "ks_empty", "recalls": 0}))

    # Strategy 1: Keyword/token overlap matching (fast, no embedding needed)
    # Create alert text for matching
    alert_texts = unchecked.withColumn(
        "search_text",
        lower(concat_ws(" ", col("title"), coalesce(col("description"), lit(""))))
    )

    # Create KS search text
    ks_search = ks_entries.withColumn(
        "ks_search_text",
        lower(concat_ws(" ", col("title"), col("content")))
    )

    # Cross-join with token overlap scoring
    # For performance: use broadcast on KS (smaller table)
    from pyspark.sql.functions import size, split, array_intersect

    alert_tokenized = alert_texts.withColumn(
        "alert_tokens", split(col("search_text"), "\\s+")
    )

    ks_tokenized = ks_search.withColumn(
        "ks_tokens", split(col("ks_search_text"), "\\s+")
    )

    # Broadcast KS for join
    matches = (
        alert_tokenized.alias("a")
        .crossJoin(broadcast(ks_tokenized.alias("k")))
        .withColumn("common_tokens",
            size(array_intersect(col("a.alert_tokens"), col("k.ks_tokens")))
        )
        .withColumn("max_tokens",
            greatest(size(col("a.alert_tokens")), lit(1))
        )
        .withColumn("token_similarity",
            col("common_tokens").cast("double") / col("max_tokens").cast("double")
        )
        .filter(col("token_similarity") >= similarity_threshold)
        .select(
            col("a.alert_id"),
            col("a.entity_id"),
            col("k.ks_id").alias("ks_entry_id"),
            col("k.entry_type").alias("ks_entry_type"),
            col("k.title").alias("ks_title"),
            col("token_similarity").alias("similarity_score"),
            col("k.outcome").alias("ks_outcome"),
            col("k.severity").alias("ks_severity"),
            col("k.mitre_techniques").alias("ks_mitre_techniques"),
            col("k.confidence").alias("ks_confidence"),
        )
    )

    match_count = matches.count()
    print(f"  Found {match_count} KS matches above threshold {similarity_threshold}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Score Matches by Entry Type
# MAGIC
# MAGIC Different KS entry types produce different signal behaviors.

# COMMAND ----------

with mon.time("score_matches"):
    if match_count > 0:
        scored_matches = (
            matches
            # Signal score based on entry type
            .withColumn("recall_signal_score",
                when(col("ks_entry_type") == "incident",
                    col("similarity_score") * col("ks_confidence") * lit(0.9))
                .when(col("ks_entry_type") == "cti",
                    col("similarity_score") * col("ks_confidence") * lit(0.85))
                .when(col("ks_entry_type") == "suppression",
                    col("similarity_score") * col("ks_confidence") * lit(0.7))
                .when(col("ks_entry_type") == "playbook_outcome",
                    col("similarity_score") * lit(0.5))
                .when(col("ks_entry_type") == "analyst_decision",
                    col("similarity_score") * lit(0.6))
                .otherwise(col("similarity_score") * lit(0.5))
            )
            # Signal direction: suppressions REDUCE threat, others INCREASE
            .withColumn("signal_direction",
                when(col("ks_entry_type") == "suppression", lit("suppressive"))
                .when(col("ks_entry_type") == "incident", lit("confirmatory"))
                .when(col("ks_entry_type") == "cti", lit("confirmatory"))
                .otherwise(lit("informational"))
            )
            .withColumn("explanation",
                concat(
                    lit("KS Recall ["), col("ks_entry_type"), lit("]: "),
                    col("ks_title"),
                    lit(" (similarity="), round(col("similarity_score"), 3).cast("string"),
                    lit(", direction="), col("signal_direction"),
                    lit(")")
                )
            )
            .withColumn("recall_id", expr("uuid()"))
            .withColumn("event_id", lit(None).cast("string"))
            .withColumn("emitted_as_signal", lit(True))
            .withColumn("created_at", current_timestamp())
        )

        # Deduplicate: keep best match per (alert, ks_entry_type)
        from pyspark.sql.window import Window
        w = Window.partitionBy("alert_id", "ks_entry_type").orderBy(desc("similarity_score"))
        best_matches = scored_matches.withColumn("rn", row_number().over(w)).filter(col("rn") == 1).drop("rn")

        # Write recall signals
        best_matches.select(
            "recall_id", "alert_id", "event_id", "entity_id",
            "ks_entry_id", "ks_entry_type", "ks_title", "similarity_score",
            "recall_signal_score", "signal_direction",
            "ks_outcome", "ks_severity", "ks_mitre_techniques",
            "explanation", "emitted_as_signal", "created_at"
        ).write.mode("append").option("mergeSchema", "true").saveAsTable(ks_recall_table)

        recall_count = best_matches.count()
        print(f"  Wrote {recall_count} KS recall signals")

        # Emit as alerts for UEO builder pickup
        confirmatory = best_matches.filter(col("signal_direction") == "confirmatory")
        if confirmatory.count() > 0:
            alerts_output = get_table_path(cfg, "alerts")
            ks_alerts = (
                confirmatory
                .select(
                    expr("uuid()").alias("id"),
                    concat(lit("KS Recall: "), col("ks_title")).alias("title"),
                    col("explanation").alias("description"),
                    coalesce(col("ks_severity"), lit("medium")).alias("severity"),
                    lit("ks_recall_lens").alias("source"),
                    col("entity_id"),
                    col("recall_signal_score").alias("confidence_score"),
                    lit("open").alias("status"),
                    current_timestamp().alias("created_at"),
                )
            )
            ks_alerts.write.mode("append").option("mergeSchema", "true").saveAsTable(alerts_output)
            print(f"  Emitted {confirmatory.count()} confirmatory KS alerts")

        # Update KS retrieval counts
        recalled_ks_ids = [r.ks_entry_id for r in best_matches.select("ks_entry_id").distinct().collect()]
        if recalled_ks_ids:
            id_list = "','".join(recalled_ks_ids)
            spark.sql(f"""
                UPDATE {ks_table}
                SET retrieval_count = retrieval_count + 1,
                    last_retrieved = current_timestamp()
                WHERE ks_id IN ('{id_list}')
            """)
    else:
        recall_count = 0
        print("  No KS matches found")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

result = {
    "notebook": "07_ks_recall_lens",
    "status": "completed",
    "items_checked": item_count,
    "ks_entries_available": ks_count,
    "matches_found": match_count,
    "recalls_emitted": recall_count if 'recall_count' in dir() else 0,
}
mon.log_complete(details=result)
print(f"\nKS Recall Lens: {item_count} checked, {recall_count if 'recall_count' in dir() else 0} recalls")
dbutils.notebook.exit(json.dumps(result))
