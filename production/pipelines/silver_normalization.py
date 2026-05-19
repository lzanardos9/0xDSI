# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Silver Normalization
# MAGIC
# MAGIC Normalizes Bronze events to OCSF schema with data quality expectations.

# COMMAND ----------

import dlt
from pyspark.sql.functions import (
    col, from_json, get_json_object, when, lit, coalesce,
    current_timestamp, to_timestamp, regexp_extract, date_format, expr
)


@dlt.table(
    name="silver_events_dlt",
    comment="Normalized security events in OCSF schema",
    table_properties={
        "quality": "silver",
        "delta.autoOptimize.optimizeWrite": "true",
    },
    partition_cols=["partition_date", "source_name"],
)
@dlt.expect_or_drop("valid_event_id", "event_id IS NOT NULL")
@dlt.expect_or_drop("valid_timestamp", "time IS NOT NULL")
@dlt.expect_or_drop("valid_source", "source_name IS NOT NULL")
@dlt.expect("has_category", "category_uid IS NOT NULL")
@dlt.expect("has_severity", "severity_id IS NOT NULL")
def silver_events_dlt():
    """Normalize bronze events to OCSF silver format."""
    bronze = dlt.read_stream("bronze_events_dlt")

    return (
        bronze
        .withColumn("_parsed", from_json(col("raw_event"), "MAP<STRING, STRING>"))
        # Map standard fields
        .withColumn("time", coalesce(
            col("event_timestamp"),
            to_timestamp(col("_parsed.timestamp")),
            to_timestamp(col("_parsed.@timestamp")),
            col("ingest_timestamp"),
        ))
        .withColumn("actor_user_id", coalesce(
            col("_parsed.user_id"), col("_parsed.userId"),
            col("_parsed.user"), col("_parsed.username"),
        ))
        .withColumn("src_ip", coalesce(
            col("_parsed.source_ip"), col("_parsed.sourceIp"),
            col("_parsed.src_ip"), col("_parsed.srcAddr"),
        ))
        .withColumn("dst_ip", coalesce(
            col("_parsed.dest_ip"), col("_parsed.destIp"),
            col("_parsed.dst_ip"), col("_parsed.dstAddr"),
        ))
        .withColumn("type_name", coalesce(
            col("_parsed.event_type"), col("_parsed.eventType"),
            col("_parsed.type"), col("_parsed.action"),
        ))
        .withColumn("src_port", coalesce(
            col("_parsed.source_port"), col("_parsed.srcPort"),
        ).cast("int"))
        .withColumn("dst_port", coalesce(
            col("_parsed.dest_port"), col("_parsed.dstPort"),
        ).cast("int"))
        .withColumn("protocol", coalesce(
            col("_parsed.protocol"), col("_parsed.proto"),
        ))
        .withColumn("resource_name", coalesce(
            col("_parsed.resource"), col("_parsed.resource_name"),
            col("_parsed.file_path"), col("_parsed.object"),
        ))
        .withColumn("bytes_in", coalesce(
            col("_parsed.bytes_in"), col("_parsed.bytesIn"),
        ).cast("long"))
        .withColumn("bytes_out", coalesce(
            col("_parsed.bytes_out"), col("_parsed.bytesOut"),
        ).cast("long"))
        # Classify
        .withColumn("category_uid",
            when(col("type_name").rlike("(?i)auth|login"), lit(3))
            .when(col("type_name").rlike("(?i)network|connection|flow"), lit(4))
            .when(col("type_name").rlike("(?i)alert|detection"), lit(2))
            .when(col("type_name").rlike("(?i)file|process"), lit(1))
            .otherwise(lit(6))
        )
        .withColumn("class_uid", col("category_uid") * 1000 + lit(1))
        .withColumn("severity_id",
            when(col("type_name").rlike("(?i)critical"), lit(5))
            .when(col("type_name").rlike("(?i)high|alert"), lit(4))
            .when(col("type_name").rlike("(?i)medium|warning"), lit(3))
            .when(col("type_name").rlike("(?i)low"), lit(2))
            .otherwise(lit(1))
        )
        .withColumn("status_id",
            when(coalesce(col("_parsed.status"), col("_parsed.result"))
                .isin("success", "200", "allowed"), lit(1))
            .when(coalesce(col("_parsed.status"), col("_parsed.result"))
                .isin("failure", "denied", "blocked"), lit(2))
            .otherwise(lit(0))
        )
        .withColumn("normalized_at", current_timestamp())
        .withColumn("normalization_version", lit("2.0.0"))
        .withColumn("raw_event_id", col("event_id"))
        .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd"))
        .drop("_parsed", "raw_event", "raw_bytes", "ingest_timestamp",
               "event_timestamp", "kafka_offset", "kafka_partition", "kafka_topic")
    )


@dlt.table(
    name="quarantine_events_dlt",
    comment="Events that failed quality checks",
    table_properties={"quality": "quarantine"},
)
def quarantine_events_dlt():
    """Capture events that fail silver quality expectations."""
    return (
        dlt.read_stream("bronze_events_dlt")
        .filter(
            col("raw_event").isNull() |
            (col("event_id").isNull())
        )
        .withColumn("quarantine_reason", lit("Failed DLT expectations"))
        .withColumn("quarantine_timestamp", current_timestamp())
    )
