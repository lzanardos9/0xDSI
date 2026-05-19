# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Gold Layer
# MAGIC Aggregated analytics tables for dashboards and reporting.

# COMMAND ----------

import dlt
from pyspark.sql.functions import *

# COMMAND ----------

@dlt.table(
    name="gold_hourly_metrics",
    comment="Hourly aggregated SOC metrics",
    table_properties={"quality": "gold"}
)
def gold_hourly_metrics():
    return (
        dlt.read("silver_events")
        .groupBy(
            window(col("timestamp"), "1 hour").alias("time_window"),
            col("event_type"),
            col("severity")
        )
        .agg(
            count("*").alias("event_count"),
            countDistinct("source_ip").alias("unique_sources"),
            countDistinct("user_id").alias("unique_users"),
            avg("normalized_severity").alias("avg_severity"),
            sum(when(col("is_off_hours"), 1).otherwise(0)).alias("off_hours_count")
        )
    )

# COMMAND ----------

@dlt.table(
    name="gold_alert_summary",
    comment="Alert summary by severity and source",
    table_properties={"quality": "gold"}
)
def gold_alert_summary():
    return (
        dlt.read("silver_alerts")
        .groupBy(
            window(col("created_at"), "1 day").alias("date_window"),
            col("severity"),
            col("source"),
            col("status")
        )
        .agg(
            count("*").alias("alert_count"),
            avg("confidence_score").alias("avg_confidence"),
            avg("response_time_seconds").alias("avg_response_time"),
            sum(when(col("is_false_positive"), 1).otherwise(0)).alias("false_positive_count")
        )
    )

# COMMAND ----------

@dlt.table(
    name="gold_mitre_coverage",
    comment="MITRE ATT&CK coverage heatmap data",
    table_properties={"quality": "gold"}
)
def gold_mitre_coverage():
    return (
        dlt.read("silver_alerts")
        .filter(col("mitre_tactic").isNotNull())
        .groupBy("mitre_tactic", "mitre_technique")
        .agg(
            count("*").alias("detection_count"),
            avg("confidence_score").alias("avg_confidence"),
            max("created_at").alias("last_detection")
        )
    )

# COMMAND ----------

@dlt.table(
    name="gold_user_risk_scores",
    comment="Aggregated user risk scores",
    table_properties={"quality": "gold"}
)
def gold_user_risk_scores():
    return (
        dlt.read("silver_events")
        .filter(col("user_id").isNotNull())
        .groupBy("user_id")
        .agg(
            count("*").alias("total_events"),
            sum(when(col("severity").isin("high", "critical"), 1).otherwise(0)).alias("high_severity_events"),
            sum(when(col("is_off_hours"), 1).otherwise(0)).alias("off_hours_events"),
            countDistinct("source_ip").alias("unique_ips"),
            max("timestamp").alias("last_activity")
        )
        .withColumn("risk_score",
            (col("high_severity_events") * 10 +
             col("off_hours_events") * 5 +
             col("unique_ips") * 2).cast("int")
        )
    )
