# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Gold Analytics
# MAGIC
# MAGIC Aggregated analytics tables for dashboards, reporting, and ML feature engineering.

# COMMAND ----------

import dlt
from pyspark.sql.functions import (
    col, count, countDistinct, sum as spark_sum, avg, max as spark_max,
    min as spark_min, window, current_timestamp, date_format, when, lit
)


@dlt.table(
    name="gold_hourly_metrics",
    comment="Hourly security metrics for executive dashboards",
    table_properties={
        "quality": "gold",
        "delta.autoOptimize.optimizeWrite": "true",
    },
)
def gold_hourly_metrics():
    """Aggregate hourly security metrics."""
    return (
        dlt.read_stream("silver_events_dlt")
        .groupBy(
            window(col("time"), "1 hour").alias("time_window"),
            col("source_name"),
            col("category_uid"),
        )
        .agg(
            count("*").alias("event_count"),
            countDistinct("actor_user_id").alias("unique_users"),
            countDistinct("src_ip").alias("unique_source_ips"),
            countDistinct("dst_ip").alias("unique_dest_ips"),
            spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("failure_count"),
            spark_sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("high_severity_count"),
            spark_sum(col("bytes_in")).alias("total_bytes_in"),
            spark_sum(col("bytes_out")).alias("total_bytes_out"),
        )
        .select(
            col("time_window.start").alias("hour_start"),
            col("time_window.end").alias("hour_end"),
            col("source_name"),
            col("category_uid"),
            col("event_count"),
            col("unique_users"),
            col("unique_source_ips"),
            col("unique_dest_ips"),
            col("failure_count"),
            col("high_severity_count"),
            col("total_bytes_in"),
            col("total_bytes_out"),
            (col("failure_count") / col("event_count") * 100).alias("failure_rate_pct"),
        )
    )


@dlt.table(
    name="gold_user_risk_scores",
    comment="Real-time user risk scores based on behavioral aggregation",
    table_properties={"quality": "gold"},
)
def gold_user_risk_scores():
    """Compute per-user risk scores from recent activity."""
    return (
        dlt.read_stream("silver_events_dlt")
        .filter(col("actor_user_id").isNotNull())
        .groupBy(
            window(col("time"), "24 hours").alias("time_window"),
            col("actor_user_id"),
        )
        .agg(
            count("*").alias("total_events"),
            spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("failures"),
            countDistinct("src_ip").alias("distinct_ips"),
            countDistinct("dst_ip").alias("distinct_destinations"),
            countDistinct("resource_name").alias("distinct_resources"),
            spark_sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("high_severity_events"),
            spark_sum(col("bytes_out")).alias("total_bytes_out"),
            spark_max("severity_id").alias("max_severity"),
        )
        .withColumn("risk_score",
            (col("failures") * 0.1) +
            (col("distinct_ips") * 0.05) +
            (col("high_severity_events") * 0.3) +
            when(col("total_bytes_out") > 100000000, 0.2).otherwise(0.0) +
            when(col("distinct_destinations") > 50, 0.15).otherwise(0.0)
        )
        .select(
            col("time_window.start").alias("window_start"),
            col("actor_user_id"),
            col("total_events"),
            col("failures"),
            col("distinct_ips"),
            col("distinct_destinations"),
            col("high_severity_events"),
            col("total_bytes_out"),
            col("risk_score"),
        )
    )


@dlt.table(
    name="gold_alert_summary",
    comment="Alert summary for SOC operational metrics",
    table_properties={"quality": "gold"},
)
def gold_alert_summary():
    """Summarize detection output for operational dashboards."""
    return (
        dlt.read_stream("silver_events_dlt")
        .filter(col("category_uid") == 2)  # Findings/detections
        .groupBy(
            window(col("time"), "1 hour").alias("time_window"),
            col("severity_id"),
            col("type_name"),
        )
        .agg(
            count("*").alias("alert_count"),
            countDistinct("actor_user_id").alias("affected_users"),
            countDistinct("src_ip").alias("source_ips"),
        )
        .select(
            col("time_window.start").alias("hour_start"),
            col("severity_id"),
            col("type_name"),
            col("alert_count"),
            col("affected_users"),
            col("source_ips"),
        )
    )
