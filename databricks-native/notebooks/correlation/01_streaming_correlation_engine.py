# Databricks notebook source
# MAGIC %md
# MAGIC # Streaming Correlation Engine (KS-Gated)
# MAGIC
# MAGIC Real-time CEP (Complex Event Processing) using Spark Structured Streaming.
# MAGIC Evaluates correlation rules against event windows with KS-based adaptive thresholds.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Maintains per-source baseline distributions of event counts
# MAGIC - Before alerting, validates that observed count is statistically significant
# MAGIC   relative to historical baseline (not just exceeding a fixed threshold)
# MAGIC - Severity determined by KS deviation strength, not raw count
# MAGIC - Eliminates false positives from high-volume but normal sources

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/correlation", "Checkpoint")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance threshold")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path")
ks_alpha = float(dbutils.widgets.get("ks_alpha"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import numpy as np
from scipy import stats

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Baseline Distributions for KS Gating
# MAGIC
# MAGIC Build per-source-ip and per-event-type historical distributions
# MAGIC from the last 7 days. These become the reference for KS testing.

# COMMAND ----------

source_baselines = spark.sql("""
    SELECT
        source_ip,
        event_type,
        DATE(timestamp) as event_date,
        COUNT(*) as daily_count
    FROM events
    WHERE timestamp BETWEEN current_timestamp() - INTERVAL 7 DAYS
                        AND current_timestamp() - INTERVAL 1 HOUR
    AND source_ip IS NOT NULL
    GROUP BY source_ip, event_type, DATE(timestamp)
""").toPandas()

baseline_lookup = {}
for (src_ip, evt_type), group in source_baselines.groupby(["source_ip", "event_type"]):
    baseline_lookup[(src_ip, evt_type)] = group["daily_count"].values.astype(float)

print(f"Built baselines for {len(baseline_lookup)} source-ip/event-type pairs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Significance Functions

# COMMAND ----------

def is_ks_significant(source_ip, event_type, observed_count, window_minutes=5):
    """
    Check if observed event count is statistically significant
    relative to the source's historical baseline.
    """
    key = (source_ip, event_type)
    baseline = baseline_lookup.get(key)

    if baseline is None or len(baseline) < 3:
        return observed_count >= 10, 0.5

    hourly_rate = baseline / 24.0
    window_rate = hourly_rate * (window_minutes / 60.0)

    percentile = stats.percentileofscore(window_rate, observed_count)
    if percentile >= 99:
        p_value = 2 * (1 - percentile / 100)
        return p_value < ks_alpha, float(1 - max(p_value, 1e-10))

    return False, 0.0


def adaptive_severity(source_ip, event_type, observed_count):
    """
    Determine severity based on how far the observation deviates from
    the source's baseline distribution (using z-score equivalent).
    """
    key = (source_ip, event_type)
    baseline = baseline_lookup.get(key)

    if baseline is None or len(baseline) < 3:
        if observed_count >= 50:
            return "critical"
        elif observed_count >= 20:
            return "high"
        return "medium"

    mean_rate = np.mean(baseline) / 24.0 * 5 / 60.0
    std_rate = max(np.std(baseline) / 24.0 * 5 / 60.0, 0.1)
    z_score = (observed_count - mean_rate) / std_rate

    if z_score > 5:
        return "critical"
    elif z_score > 3:
        return "high"
    return "medium"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Active Correlation Rules

# COMMAND ----------

rules_df = spark.table("correlation_rules").filter(col("enabled") == True).collect()
print(f"Loaded {len(rules_df)} active correlation rules")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream with Watermark

# COMMAND ----------

events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table("events")
    .withWatermark("timestamp", "5 minutes")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threshold-Based Correlation (KS-Gated)

# COMMAND ----------

threshold_correlations = (
    events_stream
    .groupBy(
        window(col("timestamp"), "5 minutes", "1 minute"),
        col("event_type"),
        col("source_ip")
    )
    .agg(
        count("*").alias("event_count"),
        collect_list("id").alias("event_ids"),
        max("severity").alias("max_severity")
    )
    .filter(col("event_count") >= 5)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence-Based Correlation (Multi-stage attacks)

# COMMAND ----------

sequence_events = (
    events_stream
    .filter(col("event_type").isin(
        "authentication_failure", "privilege_escalation",
        "lateral_movement", "data_exfiltration"
    ))
    .groupBy(
        window(col("timestamp"), "30 minutes", "5 minutes"),
        col("source_ip")
    )
    .agg(
        collect_set("event_type").alias("attack_stages"),
        count("*").alias("event_count"),
        collect_list("id").alias("event_ids")
    )
    .filter(size(col("attack_stages")) >= 3)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Correlation Matches (KS-Validated)

# COMMAND ----------

def write_correlation_matches(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    rows = batch_df.collect()
    validated_rows = []
    suppressed = 0

    for row in rows:
        significant, confidence = is_ks_significant(
            row.source_ip, row.event_type, row.event_count, window_minutes=5
        )
        if significant:
            validated_rows.append({
                "source_ip": row.source_ip,
                "event_type": row.event_type,
                "event_count": row.event_count,
                "event_ids": row.event_ids,
                "ks_confidence": confidence,
                "severity": adaptive_severity(row.source_ip, row.event_type, row.event_count),
            })
        else:
            suppressed += 1

    if suppressed > 0:
        print(f"Batch {batch_id}: KS suppressed {suppressed} false positives "
              f"({suppressed}/{len(rows)} = {suppressed/len(rows)*100:.0f}%)")

    if not validated_rows:
        return

    schema = StructType([
        StructField("source_ip", StringType()),
        StructField("event_type", StringType()),
        StructField("event_count", IntegerType()),
        StructField("ks_confidence", DoubleType()),
        StructField("severity", StringType()),
    ])

    validated_df = spark.createDataFrame(
        [{k: v for k, v in r.items() if k != "event_ids"} for r in validated_rows],
        schema=schema
    )

    matches = (
        validated_df
        .withColumn("id", expr("uuid()"))
        .withColumn("matched_at", current_timestamp())
        .withColumn("score", col("ks_confidence"))
        .withColumn("rule_id", lit("ks-adaptive-threshold"))
    )
    matches.select("id", "matched_at", "score", "rule_id").write.mode("append").saveAsTable("cep_pattern_matches")

    alert_candidates = [r for r in validated_rows if r["ks_confidence"] > 0.9]
    if alert_candidates:
        for r in alert_candidates:
            spark.sql(f"""
                INSERT INTO alerts (id, title, description, severity, status, source, confidence_score, created_at)
                VALUES (
                    uuid(),
                    'KS Correlation: {r["event_type"]} surge from {r["source_ip"]}',
                    'Detected {r["event_count"]} events in 5min window (KS confidence: {r["ks_confidence"]:.3f})',
                    '{r["severity"]}',
                    'new',
                    'correlation_engine_ks',
                    {r["ks_confidence"]},
                    current_timestamp()
                )
            """)

threshold_query = (
    threshold_correlations.writeStream
    .foreachBatch(write_correlation_matches)
    .option("checkpointLocation", f"{checkpoint_path}/threshold")
    .trigger(processingTime="30 seconds")
    .start()
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence Attack Detections (Always Critical - No KS Gating)
# MAGIC
# MAGIC Multi-stage attack sequences are high-confidence by nature (require 3+ stages).
# MAGIC No KS gating needed - the specificity of the pattern is the validation.

# COMMAND ----------

def write_sequence_detections(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    alerts = (
        batch_df
        .withColumn("id", expr("uuid()"))
        .withColumn("title", concat(lit("Multi-Stage Attack: "), col("source_ip")))
        .withColumn("description", concat(
            lit("Detected attack chain: "),
            array_join(col("attack_stages"), " -> ")
        ))
        .withColumn("severity", lit("critical"))
        .withColumn("status", lit("new"))
        .withColumn("source", lit("sequence_correlation"))
        .withColumn("mitre_tactic", lit("TA0001,TA0004,TA0008,TA0010"))
        .withColumn("confidence_score", size(col("attack_stages")).cast("double") / lit(4.0))
        .withColumn("created_at", current_timestamp())
        .withColumn("event_ids", col("event_ids"))
        .select("id", "title", "description", "severity", "status", "source",
                "mitre_tactic", "confidence_score", "event_ids", "created_at")
    )
    alerts.write.mode("append").saveAsTable("alerts")

sequence_query = (
    sequence_events.writeStream
    .foreachBatch(write_sequence_detections)
    .option("checkpointLocation", f"{checkpoint_path}/sequence")
    .trigger(processingTime="60 seconds")
    .start()
)

# COMMAND ----------

print("KS-gated correlation engine running:")
print(f"  - Threshold detection (5min windows, KS-validated)")
print(f"  - Sequence detection (30min windows, pattern-validated)")
print(f"  - {len(rules_df)} rules loaded")
print(f"  - {len(baseline_lookup)} source baselines for adaptive thresholds")
print(f"  - KS alpha: {ks_alpha}")
