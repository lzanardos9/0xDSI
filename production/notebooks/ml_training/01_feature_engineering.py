# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - Feature Engineering for Security ML Models
# MAGIC
# MAGIC Computes features from enriched events and baselines for ML model training.
# MAGIC Stores features in the Databricks Feature Store for online/offline serving.
# MAGIC
# MAGIC **Feature Groups:**
# MAGIC - User behavioral features (login patterns, access patterns, risk indicators)
# MAGIC - Network features (traffic patterns, connection profiles)
# MAGIC - Entity features (device risk, service anomalies)
# MAGIC - Temporal features (time-series aggregations)
# MAGIC
# MAGIC **Output:** Feature Store tables in `{catalog}.{schema}`

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("feature_window_hours", "24")
dbutils.widgets.text("compute_mode", "batch")  # batch or streaming

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
feature_window = int(dbutils.widgets.get("feature_window_hours"))
compute_mode = dbutils.widgets.get("compute_mode")

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, avg, stddev, sum as spark_sum,
    max as spark_max, min as spark_min, when, lit, current_timestamp,
    expr, hour, dayofweek, percentile_approx, lag, datediff,
    unix_timestamp, window, struct, log, abs as spark_abs
)
from pyspark.sql.window import Window
from databricks.feature_engineering import FeatureEngineeringClient

fe = FeatureEngineeringClient()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Data

# COMMAND ----------

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {feature_window} HOURS")
)

baselines = spark.table(f"{catalog}.{schema}.behavioral_baselines")

print(f"Computing features from {events.count()} events ({feature_window}h window)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## User Behavioral Features

# COMMAND ----------

user_features = (
    events
    .filter(col("actor_user_id").isNotNull())
    .groupBy("actor_user_id")
    .agg(
        # Volume metrics
        count("*").alias("event_count_24h"),
        countDistinct("src_ip").alias("distinct_ips_24h"),
        countDistinct("dst_ip").alias("distinct_destinations_24h"),
        countDistinct("resource_name").alias("distinct_resources_24h"),
        countDistinct("type_name").alias("distinct_event_types_24h"),

        # Failure metrics
        spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("failure_count_24h"),

        # Risk metrics
        spark_sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("high_severity_count_24h"),
        spark_sum(when(col("src_ioc_match") == True, 1).otherwise(0)).alias("ioc_match_count_24h"),
        spark_sum(when(col("dst_ioc_match") == True, 1).otherwise(0)).alias("dst_ioc_match_count_24h"),
        spark_max("event_risk_score").alias("max_risk_score_24h"),
        avg("event_risk_score").alias("avg_risk_score_24h"),

        # Temporal patterns
        countDistinct(hour(col("time"))).alias("active_hours_24h"),
        spark_sum(when(
            (hour(col("time")) < 6) | (hour(col("time")) > 22), 1
        ).otherwise(0)).alias("off_hours_events_24h"),

        # Volume patterns
        spark_sum("bytes_out").alias("total_bytes_out_24h"),
        spark_sum("bytes_in").alias("total_bytes_in_24h"),
        avg("bytes_out").alias("avg_bytes_out_24h"),
        spark_max("bytes_out").alias("max_bytes_out_24h"),

        # Geo diversity
        countDistinct("src_geo_country").alias("distinct_countries_24h"),

        # Auth patterns
        spark_sum(when(col("type_name").rlike("(?i)auth|login"), 1).otherwise(0)).alias("auth_events_24h"),
    )
    .withColumn("failure_rate_24h", col("failure_count_24h") / col("event_count_24h"))
    .withColumn("off_hours_ratio_24h", col("off_hours_events_24h") / col("event_count_24h"))
    .withColumn("bytes_ratio_24h",
        when(col("total_bytes_in_24h") > 0,
            col("total_bytes_out_24h") / col("total_bytes_in_24h")
        ).otherwise(lit(0.0))
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deviation from Baseline Features

# COMMAND ----------

# Join with baselines to compute deviations
login_baselines_df = baselines.filter(
    (col("entity_type") == "user") &
    (col("baseline_type") == "login_behavior")
).select(
    col("entity_id"),
    col("metrics.avg_login_hour").alias("baseline_avg_hour"),
    col("metrics.stddev_login_hour").alias("baseline_stddev_hour"),
    col("metrics.distinct_source_ips").alias("baseline_distinct_ips"),
    col("metrics.logins_per_day").alias("baseline_logins_per_day"),
    col("metrics.failure_rate").alias("baseline_failure_rate"),
)

user_deviation_features = (
    user_features
    .join(login_baselines_df, user_features.actor_user_id == login_baselines_df.entity_id, "left")
    .withColumn("ip_deviation",
        when(col("baseline_distinct_ips").isNotNull() & (col("baseline_distinct_ips") > 0),
            (col("distinct_ips_24h") - col("baseline_distinct_ips")) / col("baseline_distinct_ips")
        ).otherwise(lit(0.0))
    )
    .withColumn("failure_rate_deviation",
        when(col("baseline_failure_rate").isNotNull(),
            col("failure_rate_24h") - col("baseline_failure_rate")
        ).otherwise(lit(0.0))
    )
    .withColumn("volume_deviation",
        when(col("baseline_logins_per_day").isNotNull() & (col("baseline_logins_per_day") > 0),
            (col("event_count_24h") / lit(feature_window / 24.0) - col("baseline_logins_per_day"))
            / col("baseline_logins_per_day")
        ).otherwise(lit(0.0))
    )
    .drop("entity_id", "baseline_avg_hour", "baseline_stddev_hour",
          "baseline_distinct_ips", "baseline_logins_per_day", "baseline_failure_rate")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Network Entity Features

# COMMAND ----------

network_features = (
    events
    .filter(col("src_ip").isNotNull())
    .groupBy("src_ip")
    .agg(
        count("*").alias("connections_24h"),
        countDistinct("dst_ip").alias("distinct_destinations_24h"),
        countDistinct("dst_port").alias("distinct_ports_24h"),
        countDistinct("protocol").alias("distinct_protocols_24h"),
        spark_sum("bytes_out").alias("total_bytes_out_24h"),
        spark_sum("bytes_in").alias("total_bytes_in_24h"),
        avg("bytes_out").alias("avg_bytes_per_conn_24h"),
        stddev("bytes_out").alias("stddev_bytes_24h"),
        spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("blocked_connections_24h"),
        spark_sum(when(col("dst_ioc_match") == True, 1).otherwise(0)).alias("ioc_connections_24h"),
        countDistinct("dst_geo_country").alias("distinct_dest_countries_24h"),
        countDistinct("actor_user_id").alias("distinct_users_24h"),
    )
    .withColumn("blocked_rate_24h", col("blocked_connections_24h") / col("connections_24h"))
    .withColumn("port_scan_indicator",
        when(col("distinct_ports_24h") > 20, lit(1.0)).otherwise(lit(0.0))
    )
    .withColumn("byte_variance_ratio",
        when(col("avg_bytes_per_conn_24h") > 0,
            col("stddev_bytes_24h") / col("avg_bytes_per_conn_24h")
        ).otherwise(lit(0.0))
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write to Feature Store

# COMMAND ----------

# Create Feature Store tables
fe.create_table(
    name=f"{catalog}.{schema}.user_security_features",
    primary_keys=["actor_user_id"],
    timestamp_keys=None,
    df=user_deviation_features,
    description="User behavioral security features (24h window)",
)

fe.create_table(
    name=f"{catalog}.{schema}.network_security_features",
    primary_keys=["src_ip"],
    timestamp_keys=None,
    df=network_features,
    description="Network entity security features (24h window)",
)

print(f"""
Feature Engineering Complete:
  User features: {user_deviation_features.count()} entities, {len(user_deviation_features.columns)} features
  Network features: {network_features.count()} entities, {len(network_features.columns)} features
  Feature window: {feature_window}h
""")
