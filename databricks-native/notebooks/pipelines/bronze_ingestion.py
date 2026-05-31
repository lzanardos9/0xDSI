# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Bronze Layer (Production)
# MAGIC
# MAGIC Real data ingestion from external sources into Bronze Delta tables.
# MAGIC Supports Autoloader (S3/ADLS/GCS), Kafka, and pre-landed files.
# MAGIC
# MAGIC Data Quality Expectations:
# MAGIC - Required fields: event_type, timestamp
# MAGIC - Severity validation
# MAGIC - Corrupt records quarantined (not dropped)

# COMMAND ----------

import dlt
from pyspark.sql.functions import *
from pyspark.sql.types import *

# Pipeline configuration (set in DLT pipeline settings or bundle variables)
CATALOG = spark.conf.get("catalog", "soc_platform")
SCHEMA = spark.conf.get("schema", "agentic_soc")
LANDING_PATH = spark.conf.get("landing_path", f"/Volumes/{CATALOG}/{SCHEMA}/landing")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Events: Autoloader from Landing Zone

# COMMAND ----------

@dlt.table(
    name="bronze_raw_events",
    comment="Raw security events from all sources - unprocessed Bronze layer",
    table_properties={
        "quality": "bronze",
        "delta.autoOptimize.optimizeWrite": "true",
        "delta.autoOptimize.autoCompact": "true",
    },
    partition_cols=["ingestion_date"],
)
@dlt.expect("has_event_type", "event_type IS NOT NULL")
@dlt.expect("has_timestamp", "timestamp IS NOT NULL")
@dlt.expect_or_quarantine("valid_json_parse", "_rescued_data IS NULL")
def bronze_raw_events():
    """Ingest raw JSON events from landing zone via Autoloader."""
    return (
        spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.schemaLocation", f"{LANDING_PATH}/_schemas/events")
        .option("cloudFiles.inferColumnTypes", "true")
        .option("cloudFiles.maxFilesPerTrigger", "500")
        .option("cloudFiles.useIncrementalListing", "true")
        .option("rescuedDataColumn", "_rescued_data")
        .load(f"{LANDING_PATH}/events/")
        .withColumn("id", expr("uuid()"))
        .withColumn("ingested_at", current_timestamp())
        .withColumn("ingestion_date", current_date())
        .withColumn("source_connector", lit("autoloader"))
        .withColumn("severity",
            when(col("severity").isin("info", "low", "medium", "high", "critical"), col("severity"))
            .otherwise(lit("info"))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Events: Kafka/Event Hub Streaming

# COMMAND ----------

@dlt.table(
    name="bronze_kafka_events",
    comment="Raw security events from Kafka/Event Hub streaming source",
    table_properties={
        "quality": "bronze",
        "delta.autoOptimize.optimizeWrite": "true",
    },
    partition_cols=["source_topic"],
)
@dlt.expect("has_event_type", "event_type IS NOT NULL")
@dlt.expect("has_raw_value", "raw_value IS NOT NULL AND LENGTH(raw_value) > 2")
def bronze_kafka_events():
    """Ingest from Kafka. Requires kafka_brokers and kafka_topics pipeline settings."""
    kafka_brokers = spark.conf.get("kafka_brokers", "")
    kafka_topics = spark.conf.get("kafka_topics", "security-events")

    if not kafka_brokers:
        # Return empty DataFrame with schema if Kafka not configured
        return spark.createDataFrame([], StructType([
            StructField("id", StringType()), StructField("event_type", StringType()),
            StructField("timestamp", TimestampType()), StructField("raw_value", StringType()),
            StructField("source_topic", StringType()),
        ]))

    event_schema = StructType([
        StructField("event_type", StringType(), True),
        StructField("timestamp", StringType(), True),
        StructField("source_ip", StringType(), True),
        StructField("dest_ip", StringType(), True),
        StructField("user_id", StringType(), True),
        StructField("hostname", StringType(), True),
        StructField("action", StringType(), True),
        StructField("severity", StringType(), True),
        StructField("description", StringType(), True),
    ])

    return (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", kafka_brokers)
        .option("subscribe", kafka_topics)
        .option("startingOffsets", "latest")
        .option("maxOffsetsPerTrigger", "100000")
        .option("failOnDataLoss", "false")
        .load()
        .select(
            col("value").cast("string").alias("raw_value"),
            col("topic").alias("source_topic"),
            col("partition").cast("int").alias("source_partition"),
            col("offset").cast("long").alias("source_offset"),
            col("timestamp").alias("kafka_timestamp"),
        )
        .withColumn("_parsed", from_json(col("raw_value"), event_schema, {"mode": "PERMISSIVE"}))
        .select(
            expr("uuid()").alias("id"),
            coalesce(col("_parsed.event_type"), lit("unknown")).alias("event_type"),
            coalesce(to_timestamp(col("_parsed.timestamp")), col("kafka_timestamp")).alias("timestamp"),
            col("_parsed.source_ip").alias("source_ip"),
            col("_parsed.dest_ip").alias("dest_ip"),
            col("_parsed.user_id").alias("user_id"),
            col("_parsed.hostname").alias("hostname"),
            coalesce(col("_parsed.action"), lit("observed")).alias("action"),
            coalesce(col("_parsed.severity"), lit("info")).alias("severity"),
            col("_parsed.description").alias("description"),
            col("raw_value"),
            col("source_topic"),
            col("source_partition"),
            col("source_offset"),
            current_timestamp().alias("ingested_at"),
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Alerts

# COMMAND ----------

@dlt.table(
    name="bronze_alerts",
    comment="Raw alerts from detection engines",
    table_properties={"quality": "bronze"},
)
@dlt.expect("valid_severity", "severity IN ('info', 'low', 'medium', 'high', 'critical')")
@dlt.expect("valid_title", "title IS NOT NULL AND LENGTH(title) > 0")
@dlt.expect("has_source", "source IS NOT NULL")
def bronze_alerts():
    """Ingest alert data from landing zone."""
    return (
        spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.schemaLocation", f"{LANDING_PATH}/_schemas/alerts")
        .option("cloudFiles.inferColumnTypes", "true")
        .option("rescuedDataColumn", "_rescued_data")
        .load(f"{LANDING_PATH}/alerts/")
        .withColumn("id", expr("uuid()"))
        .withColumn("ingested_at", current_timestamp())
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze IOC Feed

# COMMAND ----------

@dlt.table(
    name="bronze_ioc_feed",
    comment="Raw IOC indicators from threat intelligence feeds",
    table_properties={"quality": "bronze"},
)
@dlt.expect("has_value", "value IS NOT NULL AND LENGTH(value) > 0")
@dlt.expect("has_type", "type IS NOT NULL")
@dlt.expect("valid_confidence", "confidence >= 0 AND confidence <= 1.0")
def bronze_ioc_feed():
    """Ingest IOC data from feed landing zone."""
    return (
        spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.schemaLocation", f"{LANDING_PATH}/_schemas/iocs")
        .option("cloudFiles.inferColumnTypes", "true")
        .load(f"{LANDING_PATH}/iocs/")
        .withColumn("id", expr("uuid()"))
        .withColumn("ingested_at", current_timestamp())
        .withColumn("active", lit(True))
    )
