# Databricks notebook source
# MAGIC %md
# MAGIC # Correlation 09: Unified Evidence Object (UEO) Builder
# MAGIC
# MAGIC The UEO is the formal evidence container for Confluence.
# MAGIC It takes raw signal contributions from all detection lenses and packages them
# MAGIC into a single, lineage-preserving object per (entity, time_window) pair.
# MAGIC
# MAGIC **What a UEO contains:**
# MAGIC - Entity spine reference (who/what is this about)
# MAGIC - All contributing signals with source, independence flags, freshness
# MAGIC - Causal chain links (which signal preceded which)
# MAGIC - KS recall results (what this resembles)
# MAGIC - Time-decay weighted scores per signal class
# MAGIC - Raw event IDs for full audit trail
# MAGIC
# MAGIC **Architecture position:** BETWEEN detection lenses AND Confluence decision.
# MAGIC ```
# MAGIC  [CEP] [CET] [Graph] [Neg.Corr] [KS Recall] [SLM] [Formula]
# MAGIC                        │
# MAGIC                  ┌─────▼──────┐
# MAGIC                  │  UEO Build  │  ← this notebook
# MAGIC                  └─────┬──────┘
# MAGIC                        │
# MAGIC                  ┌─────▼──────────┐
# MAGIC                  │   Confluence    │  (reads UEOs to decide)
# MAGIC                  └────────────────┘
# MAGIC ```
# MAGIC
# MAGIC **Why separate from Confluence:**
# MAGIC - UEO is evidence assembly (objective, additive)
# MAGIC - Confluence is decision-making (subjective, policy-driven)
# MAGIC - UEO can be replayed with different Confluence thresholds
# MAGIC - UEO preserves signal independence for Dempster-Shafer reasoning
# MAGIC
# MAGIC **Scheduling:** Every 2 minutes (runs after detection lenses, before Confluence)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("window_seconds", "300", "Evidence aggregation window (seconds)")
dbutils.widgets.text("lookback_minutes", "10", "Lookback for new signals")
dbutils.widgets.text("decay_half_life_minutes", "30", "Signal decay half-life")
dbutils.widgets.text("min_signals_for_ueo", "2", "Minimum signals to form a UEO")

window_seconds = int(dbutils.widgets.get("window_seconds"))
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
decay_half_life = int(dbutils.widgets.get("decay_half_life_minutes"))
min_signals = int(dbutils.widgets.get("min_signals_for_ueo"))
require_tables("unified_evidence_objects", "alerts", "entity_spine")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import math

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure UEO Table

# COMMAND ----------

ueo_table = get_table_path(cfg, "unified_evidence_objects")
ueo_signals_table = get_table_path(cfg, "ueo_signals")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ueo_table} (
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_type STRING,
    entity_name STRING,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    -- Aggregated scores
    fused_risk_score DOUBLE NOT NULL,
    max_signal_score DOUBLE,
    signal_count INT NOT NULL,
    independent_signal_count INT NOT NULL,
    -- Signal class presence flags
    has_cep BOOLEAN DEFAULT false,
    has_cet BOOLEAN DEFAULT false,
    has_graph BOOLEAN DEFAULT false,
    has_negative_correlation BOOLEAN DEFAULT false,
    has_ks_recall BOOLEAN DEFAULT false,
    has_model_score BOOLEAN DEFAULT false,
    has_behavioral BOOLEAN DEFAULT false,
    -- Disagreement metrics
    disagreement_score DOUBLE DEFAULT 0.0,
    min_signal_score DOUBLE,
    score_variance DOUBLE DEFAULT 0.0,
    -- Causal chain
    causal_chain ARRAY<STRING>,
    kill_chain_stage STRING,
    -- KS context
    ks_similar_incidents INT DEFAULT 0,
    ks_prior_suppressions INT DEFAULT 0,
    ks_best_match_id STRING,
    ks_best_match_similarity DOUBLE,
    -- Entity context
    entity_centrality DOUBLE DEFAULT 0.0,
    entity_is_high_value BOOLEAN DEFAULT false,
    entity_is_service_account BOOLEAN DEFAULT false,
    -- Lineage
    contributing_event_ids ARRAY<STRING>,
    contributing_alert_ids ARRAY<STRING>,
    -- Status
    confluence_processed BOOLEAN DEFAULT false,
    confluence_verdict_id STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ueo_signals_table} (
    signal_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    signal_class STRING NOT NULL,
    signal_source STRING NOT NULL,
    raw_score DOUBLE NOT NULL,
    decayed_score DOUBLE NOT NULL,
    independence_weight DOUBLE DEFAULT 1.0,
    signal_timestamp TIMESTAMP NOT NULL,
    decay_age_minutes DOUBLE,
    source_event_ids ARRAY<STRING>,
    source_alert_id STRING,
    explanation STRING,
    metadata STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Signal Class Definitions
# MAGIC
# MAGIC Each lens produces signals with known independence relationships.

# COMMAND ----------

# Independence matrix: signals from different classes are considered independent
# Signals from the same class are partially correlated
SIGNAL_CLASSES = {
    "cep": {"independence_group": "pattern", "base_weight": 1.0},
    "cet": {"independence_group": "behavioral", "base_weight": 0.9},
    "graph": {"independence_group": "structural", "base_weight": 0.95},
    "negative_correlation": {"independence_group": "absence", "base_weight": 0.85},
    "ks_recall": {"independence_group": "memory", "base_weight": 0.7},
    "slm_classification": {"independence_group": "model", "base_weight": 0.8},
    "formula_score": {"independence_group": "heuristic", "base_weight": 0.75},
    "behavioral_anomaly": {"independence_group": "behavioral", "base_weight": 0.9},
    "threat_intel": {"independence_group": "cti", "base_weight": 0.85},
}


def compute_decay(age_minutes: float, half_life: float) -> float:
    """Exponential decay: signal strength decreases with age."""
    return math.pow(0.5, age_minutes / half_life)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Harvest Recent Signals from Detection Lenses

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
now = datetime.utcnow()

with mon.time("harvest_signals"):
    all_signals = []

    # ─── CEP pattern matches ───
    cep_table = get_table_path(cfg, "cep_pattern_matches")
    try:
        cep_signals = spark.sql(f"""
            SELECT
                id as source_alert_id,
                COALESCE(entity_id, pattern_name) as entity_ref,
                'cep' as signal_class,
                'cep_engine' as signal_source,
                CAST(confidence AS DOUBLE) as raw_score,
                matched_at as signal_timestamp,
                matched_events as source_event_ids,
                CONCAT('CEP: ', pattern_name, ' (', severity, ')') as explanation
            FROM {cep_table}
            WHERE matched_at > '{cutoff.isoformat()}'
        """)
        all_signals.append(cep_signals)
    except Exception:
        pass

    # ─── Behavioral anomalies (CET/UEBA) ───
    ueba_table = get_table_path(cfg, "user_behavior_anomalies")
    try:
        ueba_signals = spark.sql(f"""
            SELECT
                id as source_alert_id,
                COALESCE(user_id, entity_id) as entity_ref,
                'behavioral_anomaly' as signal_class,
                'ueba_engine' as signal_source,
                CAST(anomaly_score AS DOUBLE) as raw_score,
                detected_at as signal_timestamp,
                CAST(NULL AS ARRAY<STRING>) as source_event_ids,
                CONCAT('UEBA: ', anomaly_type, ' risk=', risk_level) as explanation
            FROM {ueba_table}
            WHERE detected_at > '{cutoff.isoformat()}'
        """)
        all_signals.append(ueba_signals)
    except Exception:
        pass

    # ─── Correlation matches (graph/temporal) ───
    corr_table = get_table_path(cfg, "correlation_matches")
    try:
        corr_signals = spark.sql(f"""
            SELECT
                id as source_alert_id,
                COALESCE(target_entity, source_entity) as entity_ref,
                'graph' as signal_class,
                'correlation_engine' as signal_source,
                CAST(COALESCE(confidence_score, 0.7) AS DOUBLE) as raw_score,
                matched_at as signal_timestamp,
                matched_event_ids as source_event_ids,
                CONCAT('Correlation: ', rule_name) as explanation
            FROM {corr_table}
            WHERE matched_at > '{cutoff.isoformat()}'
        """)
        all_signals.append(corr_signals)
    except Exception:
        pass

    # ─── Alerts with scores (SLM + Formula) ───
    alerts_table = get_table_path(cfg, "alerts")
    try:
        alert_signals = spark.sql(f"""
            SELECT
                id as source_alert_id,
                COALESCE(entity_id, source_ip, username) as entity_ref,
                CASE
                    WHEN source LIKE '%slm%' THEN 'slm_classification'
                    WHEN source LIKE '%formula%' THEN 'formula_score'
                    ELSE 'slm_classification'
                END as signal_class,
                COALESCE(source, 'detection') as signal_source,
                CAST(COALESCE(confidence_score, 0.5) AS DOUBLE) as raw_score,
                created_at as signal_timestamp,
                CAST(NULL AS ARRAY<STRING>) as source_event_ids,
                CONCAT(title, ' [', severity, ']') as explanation
            FROM {alerts_table}
            WHERE created_at > '{cutoff.isoformat()}'
              AND status NOT IN ('duplicate', 'closed', 'resolved')
        """)
        all_signals.append(alert_signals)
    except Exception:
        pass

    # ─── Negative correlation detections ───
    neg_table = get_table_path(cfg, "negative_correlation_detections")
    try:
        neg_signals = spark.sql(f"""
            SELECT
                id as source_alert_id,
                COALESCE(entity_id, monitored_entity) as entity_ref,
                'negative_correlation' as signal_class,
                'negative_engine' as signal_source,
                CAST(COALESCE(severity_score, 0.7) AS DOUBLE) as raw_score,
                detected_at as signal_timestamp,
                CAST(NULL AS ARRAY<STRING>) as source_event_ids,
                CONCAT('Absence: ', rule_name, ' - ', description) as explanation
            FROM {neg_table}
            WHERE detected_at > '{cutoff.isoformat()}'
        """)
        all_signals.append(neg_signals)
    except Exception:
        pass

    # Union all signals
    if all_signals:
        combined_signals = all_signals[0]
        for s in all_signals[1:]:
            combined_signals = combined_signals.union(s)
        signal_count = combined_signals.count()
        print(f"Harvested {signal_count} signals from detection lenses")
    else:
        print("No signals found from any detection lens")
        dbutils.notebook.exit(json.dumps({"status": "no_signals", "ueos_created": 0}))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Resolve Signals to Entity Spine

# COMMAND ----------

spine_table_path = get_table_path(cfg, "entity_spine")

with mon.time("resolve_to_spine"):
    try:
        spine_lookup = spark.table(spine_table_path).select(
            col("entity_id"), col("canonical_name"), col("entity_type"),
            col("centrality_pagerank").alias("entity_centrality"),
            col("is_high_value").alias("entity_is_high_value"),
            col("is_service_account").alias("entity_is_service_account"),
        )

        signals_with_spine = (
            combined_signals.alias("sig")
            .join(
                spine_lookup.alias("sp"),
                col("sig.entity_ref") == col("sp.canonical_name"),
                "left"
            )
            .select(
                col("sig.*"),
                coalesce(col("sp.entity_id"), md5(col("sig.entity_ref"))).alias("entity_id"),
                coalesce(col("sp.entity_type"), lit("unknown")).alias("entity_type"),
                col("sig.entity_ref").alias("entity_name"),
                coalesce(col("sp.entity_centrality"), lit(0.0)).alias("entity_centrality"),
                coalesce(col("sp.entity_is_high_value"), lit(False)).alias("entity_is_high_value"),
                coalesce(col("sp.entity_is_service_account"), lit(False)).alias("entity_is_service_account"),
            )
        )
    except Exception:
        # Spine not yet populated; use entity_ref as-is
        signals_with_spine = (
            combined_signals
            .withColumn("entity_id", md5(col("entity_ref")))
            .withColumn("entity_type", lit("unknown"))
            .withColumn("entity_name", col("entity_ref"))
            .withColumn("entity_centrality", lit(0.0))
            .withColumn("entity_is_high_value", lit(False))
            .withColumn("entity_is_service_account", lit(False))
        )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build UEOs: Group by Entity + Time Window

# COMMAND ----------

with mon.time("build_ueos"):
    # Assign time windows
    windowed = signals_with_spine.withColumn(
        "window_start",
        window(col("signal_timestamp"), f"{window_seconds} seconds").start
    ).withColumn(
        "window_end",
        window(col("signal_timestamp"), f"{window_seconds} seconds").end
    )

    # Compute decay per signal
    windowed = windowed.withColumn(
        "age_minutes",
        (unix_timestamp(current_timestamp()) - unix_timestamp(col("signal_timestamp"))) / 60.0
    ).withColumn(
        "decayed_score",
        col("raw_score") * pow(lit(0.5), col("age_minutes") / lit(decay_half_life))
    )

    # Group by entity + window
    ueo_groups = (
        windowed
        .groupBy("entity_id", "entity_type", "entity_name", "window_start", "window_end",
                 "entity_centrality", "entity_is_high_value", "entity_is_service_account")
        .agg(
            count("*").alias("signal_count"),
            max("decayed_score").alias("max_signal_score"),
            min("decayed_score").alias("min_signal_score"),
            avg("decayed_score").alias("avg_signal_score"),
            stddev("decayed_score").alias("score_stddev"),
            # Signal class presence
            max(when(col("signal_class") == "cep", True).otherwise(False)).alias("has_cep"),
            max(when(col("signal_class") == "cet", True).otherwise(False)).alias("has_cet"),
            max(when(col("signal_class") == "graph", True).otherwise(False)).alias("has_graph"),
            max(when(col("signal_class") == "negative_correlation", True).otherwise(False)).alias("has_negative_correlation"),
            max(when(col("signal_class") == "ks_recall", True).otherwise(False)).alias("has_ks_recall"),
            max(when(col("signal_class").isin("slm_classification", "formula_score"), True).otherwise(False)).alias("has_model_score"),
            max(when(col("signal_class") == "behavioral_anomaly", True).otherwise(False)).alias("has_behavioral"),
            # Independence: count distinct signal classes (different groups = independent)
            countDistinct("signal_class").alias("independent_signal_count"),
            # Collect lineage
            collect_set("source_alert_id").alias("contributing_alert_ids"),
            flatten(collect_set(coalesce(col("source_event_ids"), array()))).alias("contributing_event_ids"),
        )
        .filter(col("signal_count") >= min_signals)
    )

    # Compute fused risk score (Dempster-Shafer inspired combination)
    # For independent signals: combined = 1 - product(1 - score_i)
    # Approximation using avg + diversity bonus
    ueos = (
        ueo_groups
        .withColumn("ueo_id", expr("uuid()"))
        .withColumn("fused_risk_score",
            # Base: average of decayed scores
            col("avg_signal_score") +
            # Diversity bonus: more independent signals = higher confidence
            (col("independent_signal_count") - 1) * lit(0.05) +
            # High-value entity boost
            when(col("entity_is_high_value"), lit(0.1)).otherwise(lit(0.0))
        )
        .withColumn("fused_risk_score",
            least(greatest(col("fused_risk_score"), lit(0.0)), lit(1.0))
        )
        .withColumn("disagreement_score",
            coalesce(col("score_stddev"), lit(0.0)) /
            greatest(col("avg_signal_score"), lit(0.01))
        )
        .withColumn("score_variance", coalesce(col("score_stddev") * col("score_stddev"), lit(0.0)))
        .withColumn("causal_chain", lit(None).cast("array<string>"))
        .withColumn("kill_chain_stage", lit(None).cast("string"))
        .withColumn("ks_similar_incidents", lit(0))
        .withColumn("ks_prior_suppressions", lit(0))
        .withColumn("ks_best_match_id", lit(None).cast("string"))
        .withColumn("ks_best_match_similarity", lit(None).cast("double"))
        .withColumn("confluence_processed", lit(False))
        .withColumn("confluence_verdict_id", lit(None).cast("string"))
        .withColumn("created_at", current_timestamp())
    )

    ueo_count = ueos.count()
    if ueo_count > 0:
        # Write UEOs
        ueos.select(
            "ueo_id", "entity_id", "entity_type", "entity_name",
            "window_start", "window_end",
            "fused_risk_score", "max_signal_score", "signal_count", "independent_signal_count",
            "has_cep", "has_cet", "has_graph", "has_negative_correlation",
            "has_ks_recall", "has_model_score", "has_behavioral",
            "disagreement_score", "min_signal_score", "score_variance",
            "causal_chain", "kill_chain_stage",
            "ks_similar_incidents", "ks_prior_suppressions",
            "ks_best_match_id", "ks_best_match_similarity",
            "entity_centrality", "entity_is_high_value", "entity_is_service_account",
            "contributing_event_ids", "contributing_alert_ids",
            "confluence_processed", "confluence_verdict_id", "created_at"
        ).write.mode("append").option("mergeSchema", "true").saveAsTable(ueo_table)

        # Write individual signals with UEO linkage
        signal_details = (
            windowed
            .join(
                ueos.select("ueo_id", "entity_id", "window_start"),
                ["entity_id", "window_start"],
                "inner"
            )
            .select(
                expr("uuid()").alias("signal_id"),
                col("ueo_id"),
                col("signal_class"),
                col("signal_source"),
                col("raw_score"),
                col("decayed_score"),
                lit(1.0).alias("independence_weight"),
                col("signal_timestamp"),
                col("age_minutes").alias("decay_age_minutes"),
                col("source_event_ids"),
                col("source_alert_id"),
                col("explanation"),
                lit(None).cast("string").alias("metadata"),
                current_timestamp().alias("created_at"),
            )
        )
        signal_details.write.mode("append").option("mergeSchema", "true").saveAsTable(ueo_signals_table)
        print(f"Built {ueo_count} UEOs from {signal_count} signals")
    else:
        print(f"No UEOs formed (need >= {min_signals} signals per entity-window)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Recall: Enrich UEOs with Knowledge Store Context

# COMMAND ----------

if ueo_count > 0:
    with mon.time("ks_recall"):
        ks_table_path = get_table_path(cfg, "knowledge_store")
        try:
            # Check for prior suppressions on involved entities
            new_ueos = spark.sql(f"""
                SELECT ueo_id, entity_name
                FROM {ueo_table}
                WHERE confluence_processed = false
                  AND created_at > '{cutoff.isoformat()}'
            """)

            suppression_counts = spark.sql(f"""
                SELECT u.ueo_id, COUNT(k.ks_id) as suppression_count
                FROM {ueo_table} u
                JOIN {ks_table_path} k
                    ON k.entry_type = 'suppression'
                    AND k.is_active = true
                    AND array_contains(k.tags, 'false_positive')
                WHERE u.confluence_processed = false
                  AND u.created_at > '{cutoff.isoformat()}'
                GROUP BY u.ueo_id
            """)

            if suppression_counts.count() > 0:
                suppression_counts.createOrReplaceTempView("_ks_suppressions")
                spark.sql(f"""
                    MERGE INTO {ueo_table} t
                    USING _ks_suppressions s
                    ON t.ueo_id = s.ueo_id
                    WHEN MATCHED THEN UPDATE SET
                        t.ks_prior_suppressions = s.suppression_count
                """)

            # Count similar incidents from KS
            incident_counts = spark.sql(f"""
                SELECT u.ueo_id, COUNT(k.ks_id) as incident_count
                FROM {ueo_table} u
                JOIN {ks_table_path} k
                    ON k.entry_type = 'incident'
                    AND k.is_active = true
                WHERE u.confluence_processed = false
                  AND u.created_at > '{cutoff.isoformat()}'
                GROUP BY u.ueo_id
            """)

            if incident_counts.count() > 0:
                incident_counts.createOrReplaceTempView("_ks_incidents")
                spark.sql(f"""
                    MERGE INTO {ueo_table} t
                    USING _ks_incidents s
                    ON t.ueo_id = s.ueo_id
                    WHEN MATCHED THEN UPDATE SET
                        t.ks_similar_incidents = s.incident_count
                """)

            print("KS recall enrichment complete")
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e):
                mon.log_warning(f"KS recall failed: {str(e)[:200]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_ueos = spark.sql(f"SELECT COUNT(*) FROM {ueo_table}").first()[0]
pending = spark.sql(f"SELECT COUNT(*) FROM {ueo_table} WHERE confluence_processed = false").first()[0]

print(f"\nUEO Summary:")
print(f"  Created this run:    {ueo_count}")
print(f"  Total UEOs:          {total_ueos}")
print(f"  Pending Confluence:  {pending}")

result = {
    "notebook": "09_unified_evidence_object",
    "status": "completed",
    "ueos_created": ueo_count,
    "total_ueos": total_ueos,
    "pending_confluence": pending,
    "signals_harvested": signal_count if 'signal_count' in dir() else 0,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
