# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: ML Feature Engineering
# MAGIC Builds feature tables for threat scoring, user risk, and entity behavior models.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("lookback_days", "30", "Lookback Days")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback_days = int(dbutils.widgets.get("lookback_days"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## User Behavior Features

# COMMAND ----------

user_features = spark.sql(f"""
    SELECT
        user_id,
        -- Activity volume
        COUNT(*) as total_events,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        COUNT(*) / GREATEST(COUNT(DISTINCT DATE(timestamp)), 1) as events_per_day,

        -- Temporal patterns
        AVG(HOUR(timestamp)) as avg_hour,
        STDDEV(HOUR(timestamp)) as hour_stddev,
        SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours_count,
        SUM(CASE WHEN DAYOFWEEK(timestamp) IN (1, 7) THEN 1 ELSE 0 END) as weekend_count,

        -- Network diversity
        COUNT(DISTINCT source_ip) as unique_source_ips,
        COUNT(DISTINCT dest_ip) as unique_dest_ips,

        -- Security signals
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failure_count,
        SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as high_severity_count,
        SUM(CASE WHEN event_type LIKE '%exfil%' THEN 1 ELSE 0 END) as exfil_events,
        SUM(CASE WHEN event_type LIKE '%privilege%' THEN 1 ELSE 0 END) as priv_esc_events,

        -- Event diversity
        COUNT(DISTINCT event_type) as unique_event_types,
        COUNT(DISTINCT action) as unique_actions,

        -- Ratios
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) / GREATEST(COUNT(*), 1) as failure_ratio

    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_days} DAYS
    AND user_id IS NOT NULL
    GROUP BY user_id
    HAVING COUNT(*) >= 10
""")

print(f"User features computed for {user_features.count()} users")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity (IP) Features

# COMMAND ----------

ip_features = spark.sql(f"""
    SELECT
        source_ip as ip_address,
        COUNT(*) as total_events,
        COUNT(DISTINCT user_id) as unique_users,
        COUNT(DISTINCT dest_ip) as unique_destinations,
        COUNT(DISTINCT event_type) as unique_event_types,
        SUM(CASE WHEN outcome = 'failure' THEN 1 ELSE 0 END) as failures,
        SUM(CASE WHEN severity IN ('high', 'critical') THEN 1 ELSE 0 END) as high_severity,
        MAX(CASE WHEN enrichments['ioc_match'] = 'true' THEN 1 ELSE 0 END) as has_ioc_match,
        COUNT(DISTINCT DATE(timestamp)) as active_days,
        SUM(CASE WHEN HOUR(timestamp) < 6 OR HOUR(timestamp) > 22 THEN 1 ELSE 0 END) as off_hours
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL {lookback_days} DAYS
    AND source_ip IS NOT NULL
    GROUP BY source_ip
    HAVING COUNT(*) >= 5
""")

print(f"IP features computed for {ip_features.count()} IPs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Sequence Features (for sequence models)

# COMMAND ----------

# Build event sequences per user (last 100 events)
w = Window.partitionBy("user_id").orderBy("timestamp")

event_sequences = (
    spark.table("events")
    .filter(col("timestamp") > expr(f"current_timestamp() - INTERVAL {lookback_days} DAYS"))
    .filter(col("user_id").isNotNull())
    .withColumn("seq_num", row_number().over(w))
    .filter(col("seq_num") <= 100)
    .groupBy("user_id")
    .agg(
        collect_list(struct("event_type", "severity", "timestamp")).alias("event_sequence"),
        count("*").alias("sequence_length")
    )
)

print(f"Event sequences built for {event_sequences.count()} users")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Feature Tables

# COMMAND ----------

spark.sql("""
    CREATE TABLE IF NOT EXISTS ml_user_features (
        user_id STRING,
        total_events BIGINT,
        active_days BIGINT,
        events_per_day DOUBLE,
        avg_hour DOUBLE,
        hour_stddev DOUBLE,
        off_hours_count BIGINT,
        weekend_count BIGINT,
        unique_source_ips BIGINT,
        unique_dest_ips BIGINT,
        failure_count BIGINT,
        high_severity_count BIGINT,
        exfil_events BIGINT,
        priv_esc_events BIGINT,
        unique_event_types BIGINT,
        unique_actions BIGINT,
        failure_ratio DOUBLE,
        computed_at TIMESTAMP
    ) USING DELTA
""")

spark.sql("""
    CREATE TABLE IF NOT EXISTS ml_ip_features (
        ip_address STRING,
        total_events BIGINT,
        unique_users BIGINT,
        unique_destinations BIGINT,
        unique_event_types BIGINT,
        failures BIGINT,
        high_severity BIGINT,
        has_ioc_match INT,
        active_days BIGINT,
        off_hours BIGINT,
        computed_at TIMESTAMP
    ) USING DELTA
""")

(user_features
    .withColumn("computed_at", current_timestamp())
    .write.mode("overwrite").saveAsTable("ml_user_features"))

(ip_features
    .withColumn("computed_at", current_timestamp())
    .write.mode("overwrite").saveAsTable("ml_ip_features"))

print("Feature tables persisted: ml_user_features, ml_ip_features")
