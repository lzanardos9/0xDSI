# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Bronze Ingestion
# MAGIC
# MAGIC Delta Live Tables pipeline for ingesting raw security events.
# MAGIC Deploy as a DLT pipeline in Databricks Workflows.

# COMMAND ----------

import dlt
from pyspark.sql.functions import (
    col, current_timestamp, lit, expr, date_format, input_file_name, coalesce
)

# Pipeline configuration (set in DLT pipeline settings)
CATALOG = spark.conf.get("pipeline.catalog", "main")
SCHEMA = spark.conf.get("pipeline.schema", "security")
KAFKA_BOOTSTRAP = spark.conf.get("pipeline.kafka_bootstrap", "")
KAFKA_TOPICS = spark.conf.get("pipeline.kafka_topics", "security-events")
STORAGE_PATH = spark.conf.get("pipeline.storage_path", "")


@dlt.table(
    name="bronze_events_dlt",
    comment="Raw security events from all sources (append-only)",
    table_properties={
        "quality": "bronze",
        "delta.autoOptimize.optimizeWrite": "true",
    },
    partition_cols=["partition_date", "source_name"],
)
@dlt.expect_or_drop("valid_raw_event", "raw_event IS NOT NULL AND LENGTH(raw_event) > 2")
@dlt.expect_or_drop("valid_event_id", "event_id IS NOT NULL")
def bronze_events_dlt():
    """Ingest raw events from Kafka into Bronze layer."""
    if KAFKA_BOOTSTRAP:
        raw = (
            spark.readStream
            .format("kafka")
            .option("kafka.bootstrap.servers", KAFKA_BOOTSTRAP)
            .option("subscribe", KAFKA_TOPICS)
            .option("startingOffsets", "latest")
            .option("failOnDataLoss", "false")
            .load()
        )
        return (
            raw
            .select(
                expr("uuid()").alias("event_id"),
                current_timestamp().alias("ingest_timestamp"),
                col("topic").alias("source_name"),
                lit("kafka").alias("source_type"),
                col("value").cast("string").alias("raw_event"),
                col("value").alias("raw_bytes"),
                col("timestamp").alias("event_timestamp"),
                date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
                col("offset").alias("kafka_offset"),
                col("partition").cast("long").alias("kafka_partition"),
                col("topic").alias("kafka_topic"),
            )
        )
    else:
        # Auto Loader from cloud storage
        raw = (
            spark.readStream
            .format("cloudFiles")
            .option("cloudFiles.format", "json")
            .option("cloudFiles.inferColumnTypes", "true")
            .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
            .load(STORAGE_PATH or f"/Volumes/{CATALOG}/{SCHEMA}/raw_events/")
        )
        from pyspark.sql.functions import to_json, struct
        return (
            raw
            .select(
                expr("uuid()").alias("event_id"),
                current_timestamp().alias("ingest_timestamp"),
                lit("autoloader").alias("source_name"),
                lit("file").alias("source_type"),
                to_json(struct("*")).alias("raw_event"),
                lit(None).cast("binary").alias("raw_bytes"),
                coalesce(
                    col("timestamp").cast("timestamp"),
                    col("event_time").cast("timestamp"),
                    current_timestamp()
                ).alias("event_timestamp"),
                date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
                lit(None).cast("long").alias("kafka_offset"),
                lit(None).cast("long").alias("kafka_partition"),
                lit(None).cast("string").alias("kafka_topic"),
            )
        )


@dlt.table(
    name="bronze_quality_metrics",
    comment="Data quality metrics for bronze layer monitoring",
)
@dlt.expect("has_events", "total_events > 0")
def bronze_quality_metrics():
    """Track data quality metrics."""
    return (
        dlt.read_stream("bronze_events_dlt")
        .groupBy(
            date_format(col("ingest_timestamp"), "yyyy-MM-dd HH:00:00").alias("hour"),
            col("source_name"),
        )
        .agg(
            {"*": "count", "event_id": "count"}
        )
        .withColumnRenamed("count(1)", "total_events")
        .withColumnRenamed("count(event_id)", "valid_events")
    )
