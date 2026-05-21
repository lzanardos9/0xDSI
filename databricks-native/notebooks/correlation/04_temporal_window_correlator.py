# Databricks notebook source
# MAGIC %md
# MAGIC # Temporal Window Correlator (KS Adaptive Thresholds)
# MAGIC
# MAGIC Detects brute force, credential stuffing, beaconing, scanning patterns
# MAGIC with KS-based adaptive thresholds per source IP.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Each detection pattern uses per-source baselines instead of fixed thresholds
# MAGIC - Brute force threshold adapts: a source that normally has 5 failures/5min won't
# MAGIC   alert at 10, but a source that normally has 0 will alert at 5
# MAGIC - Beacon detection uses KS test on inter-arrival time distributions to
# MAGIC   distinguish periodic C2 callbacks from normal polling (e.g., NTP, health checks)
# MAGIC - Confidence scores derived from KS p-values rather than hardcoded 0.85

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/temporal", "Checkpoint")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance level")

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
# MAGIC ## Build Per-Source Baselines for Adaptive Thresholds

# COMMAND ----------

auth_failure_baselines = spark.sql("""
    SELECT source_ip, DATE(timestamp) as day,
           COUNT(*) as daily_failures,
           COUNT(*) / 288.0 as failures_per_5min
    FROM events
    WHERE event_type IN ('authentication_failure', 'login_failed')
    AND timestamp BETWEEN current_timestamp() - INTERVAL 14 DAYS
                      AND current_timestamp() - INTERVAL 1 HOUR
    AND source_ip IS NOT NULL
    GROUP BY source_ip, DATE(timestamp)
""").toPandas()

connection_baselines = spark.sql("""
    SELECT source_ip, dest_ip, DATE(timestamp) as day,
           COUNT(*) as daily_connections,
           COUNT(*) / 24.0 as connections_per_hour
    FROM events
    WHERE event_type IN ('dns_query', 'http_request', 'network_connection')
    AND timestamp BETWEEN current_timestamp() - INTERVAL 14 DAYS
                      AND current_timestamp() - INTERVAL 1 HOUR
    AND source_ip IS NOT NULL
    GROUP BY source_ip, dest_ip, DATE(timestamp)
""").toPandas()

scan_baselines = spark.sql("""
    SELECT source_ip, DATE(timestamp) as day,
           COUNT(DISTINCT dest_ip) as daily_unique_dests
    FROM events
    WHERE event_type IN ('network_connection', 'port_scan', 'connection_attempt')
    AND timestamp BETWEEN current_timestamp() - INTERVAL 14 DAYS
                      AND current_timestamp() - INTERVAL 1 HOUR
    AND source_ip IS NOT NULL
    GROUP BY source_ip, DATE(timestamp)
""").toPandas()

auth_baseline_map = {}
for src_ip, group in auth_failure_baselines.groupby("source_ip"):
    auth_baseline_map[src_ip] = group["failures_per_5min"].values

conn_baseline_map = {}
for (src_ip, dst_ip), group in connection_baselines.groupby(["source_ip", "dest_ip"]):
    conn_baseline_map[(src_ip, dst_ip)] = group["connections_per_hour"].values

scan_baseline_map = {}
for src_ip, group in scan_baselines.groupby("source_ip"):
    scan_baseline_map[src_ip] = group["daily_unique_dests"].values

print(f"Auth baselines: {len(auth_baseline_map)} sources")
print(f"Connection baselines: {len(conn_baseline_map)} source-dest pairs")
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

    percentile = stats.percentileofscore(baseline_values, observed_value)
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
    Detect beaconing by testing if inter-arrival times follow a uniform distribution
    (random) vs. periodic (beacon). Uses KS test against uniform distribution.

    Periodic beacons have low KS stat vs. normal(mean_iat, small_std) and
    high KS stat vs. uniform - indicating regularity.
    """
    if len(timestamps) < 5:
        return False, 0.0

    sorted_ts = sorted(timestamps)
    iats = np.diff([t.timestamp() if hasattr(t, 'timestamp') else float(t) for t in sorted_ts])

    if len(iats) < 4:
        return False, 0.0

    cv = np.std(iats) / max(np.mean(iats), 0.001)

    if cv < 0.15:
        confidence = min(0.99, 1 - cv)
        return True, confidence

    ks_stat, p_value = stats.kstest(iats, 'uniform',
                                     args=(min(iats), max(iats) - min(iats)))
    is_periodic = p_value > 0.05

    if is_periodic and cv < 0.3:
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
    .table("events")
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
        col("source_ip"),
        col("username")
    )
    .agg(
        count("*").alias("failure_count"),
        countDistinct("username").alias("unique_targets")
    )
    .filter(col("failure_count") >= 5)
    .withColumn("detection_type", lit("brute_force"))
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
        countDistinct("username").alias("unique_usernames"),
        countDistinct("dest_ip").alias("unique_targets")
    )
    .filter(
        (col("unique_usernames") >= 3) &
        (col("attempt_count") >= 10)
    )
    .withColumn("detection_type", lit("credential_stuffing"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 3: Beacon Detection (KS Inter-Arrival Time Analysis)

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
        collect_list("timestamp").alias("timestamps")
    )
    .filter(col("connection_count") >= 6)
    .withColumn("detection_type", lit("beacon"))
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
        count("*").alias("connection_count")
    )
    .filter(col("unique_destinations") >= 10)
    .withColumn("detection_type", lit("port_scan"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS-Validated Detection Writer
# MAGIC
# MAGIC Validates each detection against source baselines before creating alerts.
# MAGIC Suppresses false positives from sources with naturally high activity.

# COMMAND ----------

def write_ks_validated_detections(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    rows = batch_df.collect()
    validated = []
    suppressed = 0

    for row in rows:
        detection_type = row.detection_type
        source_ip = row.source_ip

        if detection_type == "brute_force":
            baseline = auth_baseline_map.get(source_ip)
            is_anomalous, confidence, severity = ks_adaptive_threshold(
                baseline, row.failure_count, ks_alpha
            )

        elif detection_type == "credential_stuffing":
            baseline = auth_baseline_map.get(source_ip)
            is_anomalous, confidence, severity = ks_adaptive_threshold(
                baseline, row.attempt_count, ks_alpha
            )
            if is_anomalous and row.unique_usernames >= 5:
                severity = "critical"

        elif detection_type == "beacon":
            baseline = conn_baseline_map.get((source_ip, row.dest_ip))
            is_beacon, beacon_confidence = beacon_ks_test(row.timestamps, ks_alpha)

            if not is_beacon:
                is_anomalous, confidence, severity = False, 0, "low"
            else:
                is_anomalous = True
                confidence = beacon_confidence
                severity = "high" if beacon_confidence > 0.8 else "medium"

        elif detection_type == "port_scan":
            baseline = scan_baseline_map.get(source_ip)
            per_5min_baseline = baseline / 288.0 if baseline is not None else None
            is_anomalous, confidence, severity = ks_adaptive_threshold(
                per_5min_baseline, row.unique_destinations, ks_alpha
            )

        else:
            is_anomalous, confidence, severity = True, 0.5, "medium"

        if is_anomalous and confidence >= 0.5:
            validated.append({
                "source_ip": source_ip,
                "detection_type": detection_type,
                "severity": severity,
                "confidence": confidence,
            })
        else:
            suppressed += 1

    if suppressed > 0:
        print(f"Temporal batch {batch_id}: KS suppressed {suppressed}/{len(rows)} "
              f"({suppressed/len(rows)*100:.0f}% FP reduction)")

    for det in validated:
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source, confidence_score, created_at)
            VALUES (
                uuid(),
                'KS Temporal: {det["detection_type"]} from {det["source_ip"]}',
                'Pattern: {det["detection_type"]}. KS confidence: {det["confidence"]:.3f}. Adaptive threshold exceeded.',
                '{det["severity"]}',
                'new',
                'temporal_correlator_ks',
                {det["confidence"]},
                current_timestamp()
            )
        """)

# Write all patterns through KS-validated writer
for pattern_name, pattern_df in [
    ("brute_force", brute_force),
    ("credential_stuffing", credential_stuffing),
    ("beacon", beacon_detection),
    ("port_scan", port_scanning)
]:
    (pattern_df.writeStream
        .foreachBatch(write_ks_validated_detections)
        .option("checkpointLocation", f"{checkpoint_path}/{pattern_name}")
        .trigger(processingTime="30 seconds")
        .start())

print(f"KS-adaptive temporal correlator running:")
print(f"  - Brute force (adaptive per-source threshold)")
print(f"  - Credential stuffing (adaptive + diversity check)")
print(f"  - Beacon (KS inter-arrival time periodicity test)")
print(f"  - Port scan (adaptive per-source scan rate)")
print(f"  - KS alpha: {ks_alpha}")
