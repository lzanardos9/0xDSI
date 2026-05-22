# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Silver Layer (Production)
# MAGIC
# MAGIC Transforms Bronze raw events into normalized, enriched, deduplicated Silver tables:
# MAGIC - OCSF schema normalization
# MAGIC - Entity extraction (IPs, users, hosts)
# MAGIC - Timestamp normalization across timezones
# MAGIC - Deduplication by event ID
# MAGIC - Computed fields for downstream analytics

# COMMAND ----------

import dlt
from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver Events: Normalized & Deduplicated

# COMMAND ----------

@dlt.table(
    name="silver_events",
    comment="Normalized, deduplicated, and enriched security events",
    table_properties={
        "quality": "silver",
        "delta.autoOptimize.optimizeWrite": "true",
        "delta.autoOptimize.autoCompact": "true",
    },
    partition_cols=["severity", "ingestion_date"],
)
@dlt.expect_all_or_drop({
    "has_event_type": "event_type IS NOT NULL AND event_type != 'unknown'",
    "has_timestamp": "timestamp IS NOT NULL",
    "has_entity": "source_ip IS NOT NULL OR user_id IS NOT NULL OR hostname IS NOT NULL",
})
def silver_events():
    """
    Merge events from both Autoloader and Kafka sources,
    normalize fields, add computed analytics columns.
    """
    # Read from both bronze sources
    autoloader_events = dlt.read_stream("bronze_raw_events")
    kafka_events = dlt.read_stream("bronze_kafka_events")

    # Union both sources with aligned schemas
    common_cols = [
        "id", "event_type", "timestamp", "source_ip", "dest_ip",
        "user_id", "hostname", "action", "severity", "description", "ingested_at",
    ]

    # Ensure both have same columns (add missing as null)
    for col_name in common_cols:
        if col_name not in autoloader_events.columns:
            autoloader_events = autoloader_events.withColumn(col_name, lit(None).cast("string"))
        if col_name not in kafka_events.columns:
            kafka_events = kafka_events.withColumn(col_name, lit(None).cast("string"))

    unified = autoloader_events.select(*common_cols).union(kafka_events.select(*common_cols))

    return (
        unified
        .dropDuplicates(["id"])
        # Severity normalization to numeric
        .withColumn("severity_id",
            when(col("severity") == "info", lit(1))
            .when(col("severity") == "low", lit(2))
            .when(col("severity") == "medium", lit(3))
            .when(col("severity") == "high", lit(4))
            .when(col("severity") == "critical", lit(5))
            .otherwise(lit(0))
        )
        # OCSF class mapping (top categories)
        .withColumn("ocsf_category",
            when(col("event_type").contains("auth"), lit("Identity & Access"))
            .when(col("event_type").contains("network") | col("event_type").contains("dns") |
                  col("event_type").contains("http"), lit("Network Activity"))
            .when(col("event_type").contains("process") | col("event_type").contains("file") |
                  col("event_type").contains("registry"), lit("System Activity"))
            .when(col("event_type").contains("vulnerability") | col("event_type").contains("malware"),
                  lit("Findings"))
            .otherwise(lit("Other"))
        )
        # Temporal features
        .withColumn("hour_of_day", hour(col("timestamp")))
        .withColumn("day_of_week", dayofweek(col("timestamp")))
        .withColumn("is_weekend", dayofweek(col("timestamp")).isin(1, 7))
        .withColumn("is_off_hours",
            (hour(col("timestamp")) < 6) | (hour(col("timestamp")) > 22)
        )
        .withColumn("is_business_hours",
            ~col("is_off_hours") & ~col("is_weekend")
        )
        # Entity flags
        .withColumn("has_source_ip", col("source_ip").isNotNull())
        .withColumn("has_user", col("user_id").isNotNull())
        .withColumn("has_host", col("hostname").isNotNull())
        # Ingestion date for partitioning
        .withColumn("ingestion_date", to_date(col("ingested_at")))
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver Alerts: Deduplicated with Metrics

# COMMAND ----------

@dlt.table(
    name="silver_alerts",
    comment="Deduplicated alerts with computed response metrics",
    table_properties={
        "quality": "silver",
        "delta.autoOptimize.optimizeWrite": "true",
    },
)
@dlt.expect("valid_severity", "severity IN ('info', 'low', 'medium', 'high', 'critical')")
@dlt.expect("valid_title", "title IS NOT NULL")
def silver_alerts():
    return (
        dlt.read_stream("bronze_alerts")
        .dropDuplicates(["id"])
        .withColumn("severity_id",
            when(col("severity") == "info", lit(1))
            .when(col("severity") == "low", lit(2))
            .when(col("severity") == "medium", lit(3))
            .when(col("severity") == "high", lit(4))
            .when(col("severity") == "critical", lit(5))
            .otherwise(lit(0))
        )
        .withColumn("response_time_seconds",
            when(col("resolved_at").isNotNull(),
                 unix_timestamp(col("resolved_at")) - unix_timestamp(col("created_at"))
            )
        )
        .withColumn("event_count",
            size(coalesce(col("event_ids"), array()))
        )
        .withColumn("is_false_positive", col("false_positive") == True)
        .withColumn("alert_age_hours",
            (unix_timestamp(current_timestamp()) - unix_timestamp(col("created_at"))) / 3600
        )
        .withColumn("sla_breach",
            when(col("severity").isin("critical", "high") & col("alert_age_hours") > 4 & col("status") == "open",
                 lit(True))
            .otherwise(lit(False))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver IOCs: Active & Confidence-Scored

# COMMAND ----------

@dlt.table(
    name="silver_iocs",
    comment="Active IOCs with normalized confidence and freshness scores",
    table_properties={"quality": "silver"},
)
@dlt.expect("has_value", "value IS NOT NULL")
@dlt.expect("valid_type", "type IN ('ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email')")
def silver_iocs():
    return (
        dlt.read_stream("bronze_ioc_feed")
        .filter(col("active") == True)
        .dropDuplicates(["value", "type"])
        .withColumn("freshness_score",
            when(datediff(current_date(), to_date(col("last_seen"))) < 7, lit(1.0))
            .when(datediff(current_date(), to_date(col("last_seen"))) < 30, lit(0.8))
            .when(datediff(current_date(), to_date(col("last_seen"))) < 90, lit(0.5))
            .otherwise(lit(0.2))
        )
        .withColumn("effective_confidence",
            col("confidence") * col("freshness_score")
        )
    )
