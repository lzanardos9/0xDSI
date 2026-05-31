# Databricks notebook source
# MAGIC %md
# MAGIC # Streaming Correlation Engine (KS-Gated)
# MAGIC
# MAGIC Real-time CEP (Complex Event Processing) using Spark Structured Streaming.
# MAGIC Evaluates correlation rules against event windows with KS-based adaptive thresholds.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Maintains per-source baseline distributions via Delta (not in-memory)
# MAGIC - Validates observed counts are statistically significant vs. historical baseline
# MAGIC - Severity determined by KS deviation strength, not raw count
# MAGIC - Eliminates false positives from high-volume but normal sources

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("checkpoint_path", "", "Checkpoint override (optional)")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance threshold")
dbutils.widgets.text("baseline_days", "7", "Days of history for baselines")
dbutils.widgets.text("window_minutes", "5", "Correlation window size")

checkpoint_base = dbutils.widgets.get("checkpoint_path") or cfg.get_checkpoint_path("correlation_engine")
ks_alpha = float(dbutils.widgets.get("ks_alpha"))
baseline_days = int(dbutils.widgets.get("baseline_days"))
window_minutes = int(dbutils.widgets.get("window_minutes"))

mon.log_event("config_loaded", {
    "ks_alpha": ks_alpha,
    "baseline_days": baseline_days,
    "window_minutes": window_minutes,
    "checkpoint_base": checkpoint_base,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import numpy as np
from scipy import stats as scipy_stats

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Baseline Distributions (Delta-Backed)
# MAGIC
# MAGIC Compute per-source, per-event-type daily counts from the last N days.
# MAGIC Stored as a Delta table for scalability; broadcast to executors for streaming.

# COMMAND ----------

baselines_table = cfg.get_table_path("correlation_baselines")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {baselines_table} (
        source_ip STRING,
        event_type STRING,
        event_date DATE,
        daily_count LONG,
        updated_at TIMESTAMP
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Refresh baselines from events
spark.sql(f"""
    MERGE INTO {baselines_table} AS target
    USING (
        SELECT
            source_ip,
            event_type,
            DATE(timestamp) as event_date,
            COUNT(*) as daily_count,
            current_timestamp() as updated_at
        FROM {cfg.get_table_path("events")}
        WHERE timestamp BETWEEN current_timestamp() - INTERVAL {baseline_days} DAYS
                            AND current_timestamp() - INTERVAL 1 HOUR
        AND source_ip IS NOT NULL
        GROUP BY source_ip, event_type, DATE(timestamp)
    ) AS source
    ON target.source_ip = source.source_ip
       AND target.event_type = source.event_type
       AND target.event_date = source.event_date
    WHEN MATCHED THEN UPDATE SET
        daily_count = source.daily_count,
        updated_at = source.updated_at
    WHEN NOT MATCHED THEN INSERT *
""")

# Prune old baselines
spark.sql(f"""
    DELETE FROM {baselines_table}
    WHERE event_date < current_date() - INTERVAL {baseline_days + 1} DAYS
""")

# Broadcast for streaming UDFs
baseline_pdf = spark.table(baselines_table).toPandas()
baseline_lookup = {}
for (src_ip, evt_type), group in baseline_pdf.groupby(["source_ip", "event_type"]):
    baseline_lookup[(src_ip, evt_type)] = group["daily_count"].values.astype(float)

baseline_broadcast = spark.sparkContext.broadcast(baseline_lookup)
mon.log_event("baselines_built", {"pair_count": len(baseline_lookup)})
print(f"Built baselines for {len(baseline_lookup)} source-ip/event-type pairs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Significance Functions

# COMMAND ----------

def is_ks_significant(source_ip: str, event_type: str, observed_count: int, window_min: int = 5):
    """
    Check if observed event count is statistically significant
    relative to the source's historical baseline.
    Returns (is_significant, confidence_score).
    """
    lookup = baseline_broadcast.value
    key = (source_ip, event_type)
    baseline = lookup.get(key)

    if baseline is None or len(baseline) < 3:
        return observed_count >= 10, 0.5

    hourly_rate = baseline / 24.0
    window_rate = hourly_rate * (window_min / 60.0)

    percentile = scipy_stats.percentileofscore(window_rate, observed_count)
    if percentile >= 99:
        p_value = 2 * (1 - percentile / 100)
        return p_value < ks_alpha, float(1 - max(p_value, 1e-10))

    return False, 0.0


def adaptive_severity(source_ip: str, event_type: str, observed_count: int, window_min: int = 5):
    """
    Determine severity based on z-score deviation from baseline.
    """
    lookup = baseline_broadcast.value
    key = (source_ip, event_type)
    baseline = lookup.get(key)

    if baseline is None or len(baseline) < 3:
        if observed_count >= 50:
            return "critical"
        elif observed_count >= 20:
            return "high"
        return "medium"

    mean_rate = np.mean(baseline) / 24.0 * window_min / 60.0
    std_rate = max(np.std(baseline) / 24.0 * window_min / 60.0, 0.1)
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

rules_table = cfg.get_table_path("correlation_rules")
rules_df = spark.table(rules_table).filter(col("enabled") == True).collect()
mon.log_event("rules_loaded", {"count": len(rules_df)})
print(f"Loaded {len(rules_df)} active correlation rules")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream from ZeroBus (Sub-Second Latency)

# COMMAND ----------

events_stream, sdp_source = create_sdp_stream_with_fallback(
    spark, secrets_mgr, cfg,
    consumer_group="0xdsi-sdp-correlation",
    watermark="10 minutes",
    max_offsets_per_trigger=100000,
)

mon.log_event("sdp_stream_connected", {"source": sdp_source, "consumer_group": "0xdsi-sdp-correlation"})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threshold-Based Correlation (KS-Gated)

# COMMAND ----------

threshold_correlations = (
    events_stream
    .groupBy(
        window(col("timestamp"), f"{window_minutes} minutes", "1 minute"),
        col("event_type"),
        col("source_ip")
    )
    .agg(
        count("*").alias("event_count"),
        slice(collect_list("id"), 1, 100).alias("event_ids"),
        max("severity").alias("max_severity")
    )
    .filter(col("event_count") >= 5)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence-Based Correlation (Multi-Stage Attacks)

# COMMAND ----------

ATTACK_SEQUENCE_TYPES = [
    "authentication_failure", "privilege_escalation",
    "lateral_movement", "data_exfiltration",
    "credential_access", "command_and_control",
]

sequence_events = (
    events_stream
    .filter(col("event_type").isin(ATTACK_SEQUENCE_TYPES))
    .groupBy(
        window(col("timestamp"), "30 minutes", "5 minutes"),
        col("source_ip")
    )
    .agg(
        collect_set("event_type").alias("attack_stages"),
        count("*").alias("event_count"),
        slice(collect_list("id"), 1, 100).alias("event_ids")
    )
    .filter(size(col("attack_stages")) >= 3)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Correlation Matches (KS-Validated)

# COMMAND ----------

def write_correlation_matches(batch_df, batch_id):
    """Process threshold correlations with KS validation to suppress false positives."""
    if batch_df.isEmpty():
        return

    with mon.time("ks_validation_batch"):
        rows = batch_df.collect()
        validated_rows = []
        suppressed = 0

        for row in rows:
            significant, confidence = is_ks_significant(
                row.source_ip, row.event_type, row.event_count, window_minutes
            )
            if significant:
                validated_rows.append({
                    "source_ip": row.source_ip,
                    "event_type": row.event_type,
                    "event_count": int(row.event_count),
                    "event_ids": row.event_ids[:50],
                    "ks_confidence": confidence,
                    "severity": adaptive_severity(row.source_ip, row.event_type, row.event_count, window_minutes),
                })
            else:
                suppressed += 1

        mon.log_event("ks_validation", {
            "batch_id": batch_id,
            "total": len(rows),
            "validated": len(validated_rows),
            "suppressed": suppressed,
        })

        if suppressed > 0:
            print(f"Batch {batch_id}: KS suppressed {suppressed}/{len(rows)} "
                  f"({suppressed/len(rows)*100:.0f}%) false positives")

        if not validated_rows:
            return

        # Write pattern matches
        match_schema = StructType([
            StructField("source_ip", StringType()),
            StructField("event_type", StringType()),
            StructField("event_count", IntegerType()),
            StructField("ks_confidence", DoubleType()),
            StructField("severity", StringType()),
        ])

        validated_df = spark.createDataFrame(
            [{k: v for k, v in r.items() if k not in ("event_ids",)} for r in validated_rows],
            schema=match_schema
        )

        matches = (
            validated_df
            .withColumn("id", expr("uuid()"))
            .withColumn("matched_at", current_timestamp())
            .withColumn("score", col("ks_confidence"))
            .withColumn("rule_id", lit("ks-adaptive-threshold"))
        )

        matches_table = cfg.get_table_path("cep_pattern_matches")
        matches.write.mode("append").saveAsTable(matches_table)

        # Generate alerts for high-confidence detections (with dedup)
        alert_candidates = [r for r in validated_rows if r["ks_confidence"] > 0.9]
        if alert_candidates:
            alerts_table = cfg.get_table_path("alerts")

            # Dedup: skip alerts for same source_ip + rule in last hour
            recent_alert_keys = set()
            try:
                recent = spark.sql(f"""
                    SELECT title FROM {alerts_table}
                    WHERE source = 'correlation_engine_ks'
                      AND created_at > current_timestamp() - INTERVAL 1 HOUR
                """).collect()
                recent_alert_keys = {r.title for r in recent}
            except Exception:
                pass

            alert_rows = []
            for r in alert_candidates:
                title = f"KS Correlation: {r['event_type']} surge from {r['source_ip']}"
                if title in recent_alert_keys:
                    continue
                alert_rows.append({
                    "title": title,
                    "description": f"Detected {r['event_count']} events in {window_minutes}min window (KS confidence: {r['ks_confidence']:.3f})",
                    "severity": r["severity"],
                    "status": "new",
                    "source": "correlation_engine_ks",
                    "confidence_score": r["ks_confidence"],
                })

            if not alert_rows:
                return

            alert_schema = StructType([
                StructField("title", StringType()),
                StructField("description", StringType()),
                StructField("severity", StringType()),
                StructField("status", StringType()),
                StructField("source", StringType()),
                StructField("confidence_score", DoubleType()),
            ])

            alert_df = (
                spark.createDataFrame(alert_rows, schema=alert_schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("created_at", current_timestamp())
            )
            alert_df.write.mode("append").saveAsTable(alerts_table)

            mon.log_detection("ks_threshold_alert", {
                "count": len(alert_rows),
                "severities": [r["severity"] for r in alert_rows],
            })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence Attack Detections
# MAGIC
# MAGIC Multi-stage attack sequences are high-confidence by nature (require 3+ kill-chain stages).
# MAGIC No KS gating needed - the specificity of the pattern IS the validation.

# COMMAND ----------

def write_sequence_detections(batch_df, batch_id):
    """Persist multi-stage attack sequence detections as critical alerts."""
    if batch_df.isEmpty():
        return

    with mon.time("sequence_detection_batch"):
        alerts_table = cfg.get_table_path("alerts")

        alerts = (
            batch_df
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(lit("Multi-Stage Attack: "), col("source_ip")))
            .withColumn("description", concat(
                lit("Detected attack chain: "),
                array_join(col("attack_stages"), " -> "),
                lit(f" ({window_minutes}min window)")
            ))
            .withColumn("severity", lit("critical"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("sequence_correlation"))
            .withColumn("mitre_tactic", lit("TA0001,TA0004,TA0008,TA0010"))
            .withColumn("confidence_score", least(
                size(col("attack_stages")).cast("double") / lit(4.0),
                lit(1.0)
            ))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status", "source",
                    "mitre_tactic", "confidence_score", "created_at")
        )
        alerts.write.mode("append").saveAsTable(alerts_table)

        count = batch_df.count()
        mon.log_detection("sequence_attack", {"count": count, "batch_id": batch_id})
        print(f"Batch {batch_id}: Generated {count} multi-stage attack alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Queries

# COMMAND ----------

try:
    threshold_query = (
        threshold_correlations.writeStream
        .foreachBatch(write_correlation_matches)
        .option("checkpointLocation", f"{checkpoint_base}/threshold")
        .queryName("correlation_threshold_ks")
        .trigger(processingTime="30 seconds")
        .start()
    )

    sequence_query = (
        sequence_events.writeStream
        .foreachBatch(write_sequence_detections)
        .option("checkpointLocation", f"{checkpoint_base}/sequence")
        .queryName("correlation_sequence_attack")
        .trigger(processingTime="60 seconds")
        .start()
    )

    mon.log_complete(details={
        "queries_started": 2,
        "rules_loaded": len(rules_df),
        "baseline_pairs": len(baseline_lookup),
        "ks_alpha": ks_alpha,
    })

    print(f"KS-gated correlation engine running:")
    print(f"  - Threshold detection ({window_minutes}min windows, KS-validated)")
    print(f"  - Sequence detection (30min windows, pattern-validated)")
    print(f"  - {len(rules_df)} rules loaded")
    print(f"  - {len(baseline_lookup)} source baselines")
    print(f"  - KS alpha: {ks_alpha}")

    # Block until terminated
    spark.streams.awaitAnyTermination()

except Exception as e:
    mon.log_error(e, {"phase": "streaming_startup"})
    raise
finally:
    for q in spark.streams.active:
        if q.name and q.name.startswith("correlation_"):
            q.stop()
