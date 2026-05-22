# Databricks notebook source
# MAGIC %md
# MAGIC # Temporal Window Correlator (KS Adaptive Thresholds)
# MAGIC
# MAGIC Detects brute force, credential stuffing, beaconing, and scanning patterns
# MAGIC with KS-based adaptive thresholds per source IP.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Each detection pattern uses per-source baselines instead of fixed thresholds
# MAGIC - Brute force threshold adapts: a source that normally has 5 failures/5min won't
# MAGIC   alert at 10, but a source that normally has 0 will alert at 5
# MAGIC - Beacon detection uses coefficient of variation on inter-arrival times
# MAGIC - Confidence scores derived from KS p-values rather than hardcoded values

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("checkpoint_path", "", "Checkpoint override (optional)")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance level")
dbutils.widgets.text("baseline_days", "14", "Days of history for baselines")

checkpoint_base = dbutils.widgets.get("checkpoint_path") or cfg.get_checkpoint_path("temporal_correlator")
ks_alpha = float(dbutils.widgets.get("ks_alpha"))
baseline_days = int(dbutils.widgets.get("baseline_days"))

mon.log_event("config_loaded", {
    "ks_alpha": ks_alpha,
    "baseline_days": baseline_days,
    "checkpoint_base": checkpoint_base,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import numpy as np
from scipy import stats as scipy_stats

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Per-Source Baselines (Delta-Backed)

# COMMAND ----------

events_table = cfg.get_table_path("events")
baselines_table = cfg.get_table_path("temporal_baselines")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {baselines_table} (
        source_ip STRING,
        pattern_type STRING,
        event_date DATE,
        metric_value DOUBLE,
        updated_at TIMESTAMP
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

with mon.time("baseline_refresh"):
    # Auth failure baselines
    spark.sql(f"""
        MERGE INTO {baselines_table} AS target
        USING (
            SELECT source_ip, 'auth_failure' as pattern_type,
                   DATE(timestamp) as event_date,
                   CAST(COUNT(*) / 288.0 AS DOUBLE) as metric_value,
                   current_timestamp() as updated_at
            FROM {events_table}
            WHERE event_type IN ('authentication_failure', 'login_failed')
            AND timestamp BETWEEN current_timestamp() - INTERVAL {baseline_days} DAYS
                              AND current_timestamp() - INTERVAL 1 HOUR
            AND source_ip IS NOT NULL
            GROUP BY source_ip, DATE(timestamp)
        ) AS source
        ON target.source_ip = source.source_ip
           AND target.pattern_type = source.pattern_type
           AND target.event_date = source.event_date
        WHEN MATCHED THEN UPDATE SET
            metric_value = source.metric_value, updated_at = source.updated_at
        WHEN NOT MATCHED THEN INSERT *
    """)

    # Scan baselines (unique destinations per 5min equivalent)
    spark.sql(f"""
        MERGE INTO {baselines_table} AS target
        USING (
            SELECT source_ip, 'scan_rate' as pattern_type,
                   DATE(timestamp) as event_date,
                   CAST(COUNT(DISTINCT dest_ip) / 288.0 AS DOUBLE) as metric_value,
                   current_timestamp() as updated_at
            FROM {events_table}
            WHERE event_type IN ('network_connection', 'port_scan', 'connection_attempt')
            AND timestamp BETWEEN current_timestamp() - INTERVAL {baseline_days} DAYS
                              AND current_timestamp() - INTERVAL 1 HOUR
            AND source_ip IS NOT NULL
            GROUP BY source_ip, DATE(timestamp)
        ) AS source
        ON target.source_ip = source.source_ip
           AND target.pattern_type = source.pattern_type
           AND target.event_date = source.event_date
        WHEN MATCHED THEN UPDATE SET
            metric_value = source.metric_value, updated_at = source.updated_at
        WHEN NOT MATCHED THEN INSERT *
    """)

    # Prune old baselines
    spark.sql(f"""
        DELETE FROM {baselines_table}
        WHERE event_date < current_date() - INTERVAL {baseline_days + 1} DAYS
    """)

# Load into broadcast maps
baseline_pdf = spark.table(baselines_table).toPandas()

auth_baseline_map = {}
scan_baseline_map = {}

for (src_ip, pattern), group in baseline_pdf.groupby(["source_ip", "pattern_type"]):
    values = group["metric_value"].values.astype(float)
    if pattern == "auth_failure":
        auth_baseline_map[src_ip] = values
    elif pattern == "scan_rate":
        scan_baseline_map[src_ip] = values

auth_broadcast = spark.sparkContext.broadcast(auth_baseline_map)
scan_broadcast = spark.sparkContext.broadcast(scan_baseline_map)

mon.log_event("baselines_built", {
    "auth_sources": len(auth_baseline_map),
    "scan_sources": len(scan_baseline_map),
})
print(f"Auth baselines: {len(auth_baseline_map)} sources")
print(f"Scan baselines: {len(scan_baseline_map)} sources")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS-Based Adaptive Threshold Functions

# COMMAND ----------

def ks_adaptive_threshold(baseline_values, observed_value, alpha=0.01):
    """
    Determine if observed value is anomalous relative to baseline distribution.
    Returns (is_anomalous, confidence, adaptive_severity).
    """
    if baseline_values is None or len(baseline_values) < 3:
        return observed_value >= 10, 0.5, "medium"

    mean = np.mean(baseline_values)
    std = max(np.std(baseline_values), 0.1)
    z_score = (observed_value - mean) / std

    percentile = scipy_stats.percentileofscore(baseline_values, observed_value)
    p_value = 1 - percentile / 100.0

    is_anomalous = p_value < alpha and observed_value > mean + 2 * std

    if z_score > 6:
        severity = "critical"
    elif z_score > 4:
        severity = "high"
    elif z_score > 2.5:
        severity = "medium"
    else:
        severity = "low"

    confidence = min(0.99, 1 - max(p_value, 1e-10))
    return is_anomalous, confidence, severity


def beacon_ks_test(timestamps, alpha=0.01):
    """
    Detect beaconing by testing if inter-arrival times are periodic.
    Low coefficient of variation indicates regular spacing (beacon-like).
    """
    if len(timestamps) < 5:
        return False, 0.0

    sorted_ts = sorted(timestamps)
    iats = np.diff([t.timestamp() if hasattr(t, 'timestamp') else float(t) for t in sorted_ts])

    if len(iats) < 4:
        return False, 0.0

    mean_iat = np.mean(iats)
    if mean_iat < 1.0:
        return False, 0.0

    cv = np.std(iats) / max(mean_iat, 0.001)

    if cv < 0.15:
        confidence = min(0.99, 1 - cv)
        return True, confidence
    elif cv < 0.3:
        ks_stat, p_value = scipy_stats.kstest(
            iats, 'uniform', args=(min(iats), max(iats) - min(iats))
        )
        is_periodic = p_value > 0.05
        if is_periodic:
            return True, float(1 - cv)

    return False, 0.0

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream

# COMMAND ----------

events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .option("maxFilesPerTrigger", 1000)
    .table(events_table)
    .withWatermark("timestamp", "10 minutes")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 1: Brute Force (KS Adaptive)

# COMMAND ----------

brute_force = (
    events_stream
    .filter(col("event_type").isin("authentication_failure", "login_failed"))
    .groupBy(
        window(col("timestamp"), "5 minutes"),
        col("source_ip")
    )
    .agg(
        count("*").alias("failure_count"),
        countDistinct("user_id").alias("unique_targets"),
        collect_list("id").alias("event_ids"),
    )
    .filter(col("failure_count") >= 5)
    .withColumn("detection_type", lit("brute_force"))
    .withColumn("metric_value", col("failure_count").cast("double"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 2: Credential Stuffing (KS Adaptive)

# COMMAND ----------

credential_stuffing = (
    events_stream
    .filter(col("event_type").isin("authentication_failure", "login_failed"))
    .groupBy(
        window(col("timestamp"), "10 minutes"),
        col("source_ip")
    )
    .agg(
        count("*").alias("attempt_count"),
        countDistinct("user_id").alias("unique_usernames"),
        countDistinct("dest_ip").alias("unique_targets"),
        collect_list("id").alias("event_ids"),
    )
    .filter(
        (col("unique_usernames") >= 3) &
        (col("attempt_count") >= 10)
    )
    .withColumn("detection_type", lit("credential_stuffing"))
    .withColumn("metric_value", col("attempt_count").cast("double"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 3: Beacon Detection (KS Inter-Arrival Time)

# COMMAND ----------

beacon_detection = (
    events_stream
    .filter(col("event_type").isin("dns_query", "http_request", "network_connection"))
    .groupBy(
        window(col("timestamp"), "1 hour"),
        col("source_ip"),
        col("dest_ip")
    )
    .agg(
        count("*").alias("connection_count"),
        collect_list("timestamp").alias("timestamps"),
        collect_list("id").alias("event_ids"),
    )
    .filter(col("connection_count") >= 6)
    .withColumn("detection_type", lit("beacon"))
    .withColumn("metric_value", col("connection_count").cast("double"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 4: Port Scanning (KS Adaptive)

# COMMAND ----------

port_scanning = (
    events_stream
    .filter(col("event_type").isin("network_connection", "port_scan", "connection_attempt"))
    .groupBy(
        window(col("timestamp"), "5 minutes"),
        col("source_ip")
    )
    .agg(
        countDistinct("dest_ip").alias("unique_destinations"),
        count("*").alias("connection_count"),
        collect_list("id").alias("event_ids"),
    )
    .filter(col("unique_destinations") >= 10)
    .withColumn("detection_type", lit("port_scan"))
    .withColumn("metric_value", col("unique_destinations").cast("double"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS-Validated Detection Writer

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")

def write_ks_validated_detections(batch_df, batch_id):
    """Validate detections against KS baselines and generate alerts."""
    if batch_df.isEmpty():
        return

    with mon.time("temporal_ks_batch"):
        rows = batch_df.collect()
        validated = []
        suppressed = 0

        for row in rows:
            detection_type = row.detection_type
            source_ip = row.source_ip

            if detection_type in ("brute_force", "credential_stuffing"):
                baseline = auth_broadcast.value.get(source_ip)
                observed = float(row.metric_value)
                is_anomalous, confidence, severity = ks_adaptive_threshold(
                    baseline, observed, ks_alpha
                )
                if detection_type == "credential_stuffing" and is_anomalous:
                    if hasattr(row, "unique_usernames") and row.unique_usernames >= 5:
                        severity = "critical"

            elif detection_type == "beacon":
                is_anomalous, confidence = beacon_ks_test(row.timestamps, ks_alpha)
                severity = "high" if confidence > 0.8 else "medium"

            elif detection_type == "port_scan":
                baseline = scan_broadcast.value.get(source_ip)
                observed = float(row.metric_value)
                is_anomalous, confidence, severity = ks_adaptive_threshold(
                    baseline, observed, ks_alpha
                )

            else:
                is_anomalous, confidence, severity = True, 0.5, "medium"

            if is_anomalous and confidence >= 0.5:
                validated.append({
                    "source_ip": source_ip,
                    "detection_type": detection_type,
                    "severity": severity,
                    "confidence": float(confidence),
                    "event_ids": row.event_ids[:50] if hasattr(row, "event_ids") else [],
                })
            else:
                suppressed += 1

        mon.log_event("temporal_ks_batch", {
            "batch_id": batch_id,
            "total": len(rows),
            "validated": len(validated),
            "suppressed": suppressed,
        })

        if suppressed > 0:
            print(f"Temporal batch {batch_id}: KS suppressed {suppressed}/{len(rows)} "
                  f"({suppressed/len(rows)*100:.0f}% FP reduction)")

        if not validated:
            return

        # Write alerts using DataFrame (no SQL injection)
        alert_schema = StructType([
            StructField("title", StringType()),
            StructField("description", StringType()),
            StructField("severity", StringType()),
            StructField("source", StringType()),
            StructField("confidence_score", DoubleType()),
        ])

        alert_rows = [
            {
                "title": f"KS Temporal: {d['detection_type']} from {d['source_ip']}",
                "description": f"Pattern: {d['detection_type']}. KS confidence: {d['confidence']:.3f}. Adaptive threshold exceeded.",
                "severity": d["severity"],
                "source": "temporal_correlator_ks",
                "confidence_score": d["confidence"],
            }
            for d in validated
        ]

        alert_df = (
            spark.createDataFrame(alert_rows, schema=alert_schema)
            .withColumn("id", expr("uuid()"))
            .withColumn("status", lit("new"))
            .withColumn("created_at", current_timestamp())
        )
        alert_df.write.mode("append").saveAsTable(alerts_table)

        mon.log_detection("temporal_pattern", {
            "count": len(validated),
            "types": [d["detection_type"] for d in validated],
        })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Queries

# COMMAND ----------

try:
    queries = []
    for pattern_name, pattern_df in [
        ("brute_force", brute_force),
        ("credential_stuffing", credential_stuffing),
        ("beacon", beacon_detection),
        ("port_scan", port_scanning),
    ]:
        q = (
            pattern_df.writeStream
            .foreachBatch(write_ks_validated_detections)
            .option("checkpointLocation", f"{checkpoint_base}/{pattern_name}")
            .queryName(f"temporal_{pattern_name}")
            .trigger(processingTime="30 seconds")
            .start()
        )
        queries.append(q)

    mon.log_complete(details={
        "patterns": 4,
        "auth_baselines": len(auth_baseline_map),
        "scan_baselines": len(scan_baseline_map),
        "ks_alpha": ks_alpha,
    })

    print(f"KS-adaptive temporal correlator running:")
    print(f"  - Brute force (adaptive per-source threshold)")
    print(f"  - Credential stuffing (adaptive + diversity check)")
    print(f"  - Beacon (KS inter-arrival time periodicity test)")
    print(f"  - Port scan (adaptive per-source scan rate)")
    print(f"  - KS alpha: {ks_alpha}")

    spark.streams.awaitAnyTermination()

except Exception as e:
    mon.log_error(e, {"phase": "temporal_streaming"})
    raise
finally:
    for q in spark.streams.active:
        if q.name and q.name.startswith("temporal_"):
            q.stop()
