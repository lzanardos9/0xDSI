# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Gold Layer (Production)
# MAGIC
# MAGIC Pre-aggregated analytics tables for dashboards, executive reporting,
# MAGIC and downstream ML feature consumption:
# MAGIC - Hourly SOC metrics (event volume, severity distribution)
# MAGIC - Alert summary (MTTD, MTTR, FP rate)
# MAGIC - User risk scores (behavioral aggregation)
# MAGIC - MITRE ATT&CK coverage (detection heatmap)
# MAGIC - Entity risk profiles (IP, user, host scoring)
# MAGIC - Data quality metrics (ingestion health)

# COMMAND ----------

import dlt
from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold: Hourly SOC Metrics

# COMMAND ----------

@dlt.table(
    name="gold_hourly_metrics",
    comment="Hourly aggregated SOC metrics for operational dashboards",
    table_properties={"quality": "gold"},
)
def gold_hourly_metrics():
    return (
        dlt.read("silver_events")
        .groupBy(
            window(col("timestamp"), "1 hour").alias("time_window"),
            col("event_type"),
            col("severity"),
            col("ocsf_category"),
        )
        .agg(
            count("*").alias("event_count"),
            countDistinct("source_ip").alias("unique_source_ips"),
            countDistinct("dest_ip").alias("unique_dest_ips"),
            countDistinct("user_id").alias("unique_users"),
            countDistinct("hostname").alias("unique_hosts"),
            avg("severity_id").alias("avg_severity"),
            sum(when(col("is_off_hours"), 1).otherwise(0)).alias("off_hours_count"),
            sum(when(col("is_weekend"), 1).otherwise(0)).alias("weekend_count"),
        )
        .withColumn("hour_start", col("time_window.start"))
        .withColumn("hour_end", col("time_window.end"))
        .drop("time_window")
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold: Alert Summary (MTTD/MTTR)

# COMMAND ----------

@dlt.table(
    name="gold_alert_summary",
    comment="Daily alert summary with MTTD, MTTR, and false positive metrics",
    table_properties={"quality": "gold"},
)
def gold_alert_summary():
    return (
        dlt.read("silver_alerts")
        .groupBy(
            to_date(col("created_at")).alias("alert_date"),
            col("severity"),
            col("status"),
        )
        .agg(
            count("*").alias("alert_count"),
            avg("confidence_score").alias("avg_confidence"),
            avg("response_time_seconds").alias("avg_response_time_sec"),
            percentile_approx("response_time_seconds", 0.5).alias("median_response_time_sec"),
            percentile_approx("response_time_seconds", 0.95).alias("p95_response_time_sec"),
            sum(when(col("is_false_positive"), 1).otherwise(0)).alias("false_positive_count"),
            sum(when(col("sla_breach"), 1).otherwise(0)).alias("sla_breaches"),
            avg("event_count").alias("avg_events_per_alert"),
            countDistinct("source").alias("unique_detection_sources"),
        )
        .withColumn("false_positive_rate",
            when(col("alert_count") > 0,
                 col("false_positive_count") / col("alert_count"))
            .otherwise(lit(0))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold: User Risk Scores

# COMMAND ----------

@dlt.table(
    name="gold_user_risk_scores",
    comment="Aggregated user risk scores based on behavioral signals",
    table_properties={"quality": "gold"},
)
def gold_user_risk_scores():
    return (
        dlt.read("silver_events")
        .filter(col("user_id").isNotNull())
        .groupBy("user_id")
        .agg(
            count("*").alias("total_events"),
            sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("high_severity_events"),
            sum(when(col("severity_id") == 5, 1).otherwise(0)).alias("critical_events"),
            sum(when(col("is_off_hours"), 1).otherwise(0)).alias("off_hours_events"),
            sum(when(col("is_weekend"), 1).otherwise(0)).alias("weekend_events"),
            countDistinct("source_ip").alias("unique_ips"),
            countDistinct("hostname").alias("unique_hosts"),
            countDistinct("event_type").alias("unique_event_types"),
            max("timestamp").alias("last_activity"),
            min("timestamp").alias("first_activity"),
            # Authentication-specific
            sum(when(col("event_type") == "authentication_failure", 1).otherwise(0)).alias("auth_failures"),
            sum(when(col("event_type") == "privilege_escalation", 1).otherwise(0)).alias("priv_escalations"),
            sum(when(col("event_type") == "data_exfiltration", 1).otherwise(0)).alias("exfil_events"),
        )
        .withColumn("activity_days",
            datediff(col("last_activity"), col("first_activity")) + 1
        )
        .withColumn("daily_event_rate",
            col("total_events") / greatest(col("activity_days"), lit(1))
        )
        .withColumn("risk_score",
            least(
                lit(100),
                (
                    col("critical_events") * 25 +
                    col("high_severity_events") * 10 +
                    col("off_hours_events") * 3 +
                    col("auth_failures") * 5 +
                    col("priv_escalations") * 20 +
                    col("exfil_events") * 30 +
                    when(col("unique_ips") > 10, lit(15)).otherwise(lit(0)) +
                    when(col("unique_hosts") > 5, lit(10)).otherwise(lit(0))
                ).cast("int")
            )
        )
        .withColumn("risk_level",
            when(col("risk_score") >= 80, lit("critical"))
            .when(col("risk_score") >= 60, lit("high"))
            .when(col("risk_score") >= 30, lit("medium"))
            .when(col("risk_score") >= 10, lit("low"))
            .otherwise(lit("info"))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold: MITRE ATT&CK Coverage

# COMMAND ----------

@dlt.table(
    name="gold_mitre_coverage",
    comment="MITRE ATT&CK detection coverage heatmap data",
    table_properties={"quality": "gold"},
)
def gold_mitre_coverage():
    return (
        dlt.read("silver_alerts")
        .filter(col("mitre_tactic").isNotNull())
        .groupBy("mitre_tactic", "mitre_technique")
        .agg(
            count("*").alias("detection_count"),
            avg("confidence_score").alias("avg_confidence"),
            min("created_at").alias("first_detection"),
            max("created_at").alias("last_detection"),
            countDistinct("source").alias("detection_sources"),
            sum(when(~col("is_false_positive"), 1).otherwise(0)).alias("true_positive_count"),
            avg("response_time_seconds").alias("avg_response_time"),
        )
        .withColumn("true_positive_rate",
            when(col("detection_count") > 0,
                 col("true_positive_count") / col("detection_count"))
            .otherwise(lit(0))
        )
        .withColumn("days_since_last",
            datediff(current_date(), to_date(col("last_detection")))
        )
        .withColumn("coverage_health",
            when(col("days_since_last") < 7, lit("active"))
            .when(col("days_since_last") < 30, lit("recent"))
            .when(col("days_since_last") < 90, lit("stale"))
            .otherwise(lit("dormant"))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold: Entity Risk Profiles (IP-based)

# COMMAND ----------

@dlt.table(
    name="gold_entity_risk_ips",
    comment="IP-based entity risk profiles for threat scoring",
    table_properties={"quality": "gold"},
)
def gold_entity_risk_ips():
    return (
        dlt.read("silver_events")
        .filter(col("source_ip").isNotNull())
        .groupBy("source_ip")
        .agg(
            count("*").alias("total_events"),
            countDistinct("event_type").alias("unique_event_types"),
            countDistinct("user_id").alias("unique_users"),
            countDistinct("hostname").alias("unique_targets"),
            sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("high_severity"),
            sum(when(col("event_type") == "port_scan", 1).otherwise(0)).alias("scan_events"),
            sum(when(col("event_type") == "lateral_movement", 1).otherwise(0)).alias("lateral_events"),
            max("timestamp").alias("last_seen"),
            min("timestamp").alias("first_seen"),
        )
        .withColumn("ip_risk_score",
            least(
                lit(100),
                (
                    col("high_severity") * 10 +
                    col("scan_events") * 15 +
                    col("lateral_events") * 25 +
                    when(col("unique_targets") > 10, lit(20)).otherwise(lit(0)) +
                    when(col("unique_event_types") > 8, lit(10)).otherwise(lit(0))
                ).cast("int")
            )
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold: Data Quality Metrics

# COMMAND ----------

@dlt.table(
    name="gold_ingestion_health",
    comment="Hourly data quality and ingestion health metrics",
    table_properties={"quality": "gold"},
)
def gold_ingestion_health():
    events = dlt.read("silver_events")
    return (
        events
        .groupBy(
            window(col("ingested_at"), "1 hour").alias("window"),
        )
        .agg(
            count("*").alias("total_events"),
            sum(when(col("event_type") == "unknown", 1).otherwise(0)).alias("unknown_type_count"),
            sum(when(col("has_source_ip"), 1).otherwise(0)).alias("events_with_ip"),
            sum(when(col("has_user"), 1).otherwise(0)).alias("events_with_user"),
            sum(when(col("has_host"), 1).otherwise(0)).alias("events_with_host"),
            countDistinct("source_ip").alias("unique_ips"),
            countDistinct("user_id").alias("unique_users"),
            avg("severity_id").alias("avg_severity"),
        )
        .withColumn("hour", col("window.start"))
        .withColumn("completeness_score",
            (
                col("events_with_ip") + col("events_with_user") + col("events_with_host")
            ) / (col("total_events") * 3) * 100
        )
        .withColumn("parse_success_rate",
            when(col("total_events") > 0,
                 (col("total_events") - col("unknown_type_count")) / col("total_events") * 100)
            .otherwise(lit(100))
        )
        .drop("window")
    )
