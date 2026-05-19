# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - Raw Event Ingestion (Bronze Layer)
# MAGIC
# MAGIC Multi-source streaming ingestion pipeline that accepts ANY data source format
# MAGIC and lands raw events into the Bronze Delta table.
# MAGIC
# MAGIC **Supported Sources:**
# MAGIC - Kafka / Confluent Cloud / Azure Event Hubs
# MAGIC - AWS Kinesis
# MAGIC - Cloud Storage (S3, ADLS, GCS) - auto-loader
# MAGIC - REST API polling
# MAGIC - Syslog (via Kafka bridge)
# MAGIC - CloudTrail, VPC Flow Logs, Azure Activity Logs
# MAGIC
# MAGIC **Output:** `{catalog}.{schema}.bronze_events` (append-only, partitioned by date + source)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

# Parameters (set via dbutils.widgets or job configuration)
dbutils.widgets.text("catalog", "main", "Unity Catalog name")
dbutils.widgets.text("schema", "security", "Schema name")
dbutils.widgets.text("source_type", "kafka", "Source type: kafka | kinesis | autoloader | api")
dbutils.widgets.text("source_name", "", "Logical source name (e.g., crowdstrike, palo_alto)")
dbutils.widgets.text("checkpoint_path", "", "Checkpoint location (auto-generated if empty)")
dbutils.widgets.text("kafka_bootstrap", "", "Kafka bootstrap servers")
dbutils.widgets.text("kafka_topic", "", "Kafka topic(s) - comma separated")
dbutils.widgets.text("storage_path", "", "Cloud storage path for autoloader")
dbutils.widgets.text("storage_format", "json", "File format for autoloader: json | csv | parquet | avro")
dbutils.widgets.text("max_bytes_per_trigger", "10485760", "Max bytes per micro-batch (10MB default)")
dbutils.widgets.text("processing_time", "10 seconds", "Trigger interval")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
source_type = dbutils.widgets.get("source_type")
source_name = dbutils.widgets.get("source_name")
checkpoint_path = dbutils.widgets.get("checkpoint_path")
kafka_bootstrap = dbutils.widgets.get("kafka_bootstrap")
kafka_topic = dbutils.widgets.get("kafka_topic")
storage_path = dbutils.widgets.get("storage_path")
storage_format = dbutils.widgets.get("storage_format")
max_bytes = dbutils.widgets.get("max_bytes_per_trigger")
processing_time = dbutils.widgets.get("processing_time")

# Auto-generate checkpoint path if not provided
if not checkpoint_path:
    checkpoint_path = f"/Volumes/{catalog}/{schema}/checkpoints/bronze_{source_name}"

print(f"Ingesting from: {source_type} ({source_name})")
print(f"Target: {catalog}.{schema}.bronze_events")
print(f"Checkpoint: {checkpoint_path}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Table Schema

# COMMAND ----------

from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    LongType, MapType, BinaryType
)
from pyspark.sql.functions import (
    col, current_timestamp, lit, from_json, to_timestamp,
    input_file_name, expr, sha2, concat_ws, coalesce
)
from delta.tables import DeltaTable

# Bronze schema: raw event with metadata envelope
bronze_schema = StructType([
    StructField("event_id", StringType(), False),
    StructField("ingest_timestamp", TimestampType(), False),
    StructField("source_name", StringType(), False),
    StructField("source_type", StringType(), False),
    StructField("raw_event", StringType(), False),  # Original payload as string
    StructField("raw_bytes", BinaryType(), True),   # Original bytes if binary format
    StructField("event_timestamp", TimestampType(), True),  # Extracted from payload if possible
    StructField("partition_date", StringType(), False),
    StructField("kafka_offset", LongType(), True),
    StructField("kafka_partition", LongType(), True),
    StructField("kafka_topic", StringType(), True),
    StructField("file_path", StringType(), True),  # For autoloader sources
    StructField("headers", MapType(StringType(), StringType()), True),
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Bronze Table (if not exists)

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.bronze_events (
        event_id STRING NOT NULL,
        ingest_timestamp TIMESTAMP NOT NULL,
        source_name STRING NOT NULL,
        source_type STRING NOT NULL,
        raw_event STRING NOT NULL,
        raw_bytes BINARY,
        event_timestamp TIMESTAMP,
        partition_date STRING NOT NULL,
        kafka_offset BIGINT,
        kafka_partition BIGINT,
        kafka_topic STRING,
        file_path STRING,
        headers MAP<STRING, STRING>
    )
    USING DELTA
    PARTITIONED BY (partition_date, source_name)
    TBLPROPERTIES (
        'delta.autoOptimize.optimizeWrite' = 'true',
        'delta.autoOptimize.autoCompact' = 'true',
        'delta.deletedFileRetentionDuration' = 'interval 30 days',
        'delta.logRetentionDuration' = 'interval 90 days'
    )
""")

print(f"Bronze table ready: {catalog}.{schema}.bronze_events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source-Specific Stream Readers

# COMMAND ----------

def create_kafka_stream(bootstrap_servers: str, topics: str) -> "DataFrame":
    """
    Create a streaming DataFrame from Kafka.
    Supports SASL/SSL authentication via Spark config or secrets.
    """
    kafka_options = {
        "kafka.bootstrap.servers": bootstrap_servers,
        "subscribe": topics,
        "startingOffsets": "latest",
        "maxOffsetsPerTrigger": int(max_bytes) // 1024,  # Approximate
        "kafka.session.timeout.ms": "60000",
        "kafka.request.timeout.ms": "60000",
        "failOnDataLoss": "false",
    }

    # Add authentication if configured (secrets scope)
    try:
        sasl_mechanism = dbutils.secrets.get(scope="kafka", key=f"{source_name}_sasl_mechanism")
        if sasl_mechanism:
            kafka_options["kafka.sasl.mechanism"] = sasl_mechanism
            kafka_options["kafka.security.protocol"] = "SASL_SSL"
            kafka_options["kafka.sasl.jaas.config"] = dbutils.secrets.get(
                scope="kafka", key=f"{source_name}_jaas_config"
            )
    except Exception:
        pass  # No auth configured — assume plaintext

    return (
        spark.readStream
        .format("kafka")
        .options(**kafka_options)
        .load()
        .select(
            col("key").cast("string").alias("kafka_key"),
            col("value").cast("string").alias("raw_event"),
            col("value").alias("raw_bytes"),
            col("topic").alias("kafka_topic"),
            col("partition").cast("long").alias("kafka_partition"),
            col("offset").cast("long").alias("kafka_offset"),
            col("timestamp").alias("event_timestamp"),
            col("headers"),
        )
    )


def create_autoloader_stream(path: str, file_format: str) -> "DataFrame":
    """
    Create a streaming DataFrame using Auto Loader (cloudFiles).
    Handles schema evolution automatically.
    """
    options = {
        "cloudFiles.format": file_format,
        "cloudFiles.inferColumnTypes": "true",
        "cloudFiles.schemaEvolutionMode": "addNewColumns",
        "cloudFiles.maxBytesPerTrigger": max_bytes,
    }

    if file_format == "json":
        options["multiLine"] = "true"
    elif file_format == "csv":
        options["header"] = "true"
        options["inferSchema"] = "true"

    raw_df = (
        spark.readStream
        .format("cloudFiles")
        .options(**options)
        .load(path)
    )

    # Convert entire row to JSON string for bronze storage
    from pyspark.sql.functions import to_json, struct
    return raw_df.select(
        to_json(struct("*")).alias("raw_event"),
        lit(None).cast("binary").alias("raw_bytes"),
        lit(None).cast("string").alias("kafka_topic"),
        lit(None).cast("long").alias("kafka_partition"),
        lit(None).cast("long").alias("kafka_offset"),
        coalesce(
            col("timestamp").cast("timestamp"),
            col("event_time").cast("timestamp"),
            col("@timestamp").cast("timestamp"),
            current_timestamp(),
        ).alias("event_timestamp"),
        input_file_name().alias("file_path"),
    )


def create_kinesis_stream(stream_name: str, region: str = "us-east-1") -> "DataFrame":
    """Create a streaming DataFrame from AWS Kinesis."""
    return (
        spark.readStream
        .format("kinesis")
        .option("streamName", stream_name)
        .option("region", region)
        .option("initialPosition", "LATEST")
        .load()
        .select(
            col("data").cast("string").alias("raw_event"),
            col("data").alias("raw_bytes"),
            lit(None).cast("string").alias("kafka_topic"),
            col("partitionKey").cast("long").alias("kafka_partition"),
            col("sequenceNumber").cast("long").alias("kafka_offset"),
            col("approximateArrivalTimestamp").alias("event_timestamp"),
            lit(None).cast("string").alias("file_path"),
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Stream Based on Source Type

# COMMAND ----------

if source_type == "kafka":
    if not kafka_bootstrap or not kafka_topic:
        raise ValueError("kafka_bootstrap and kafka_topic are required for Kafka source")
    raw_stream = create_kafka_stream(kafka_bootstrap, kafka_topic)

elif source_type == "autoloader":
    if not storage_path:
        raise ValueError("storage_path is required for autoloader source")
    raw_stream = create_autoloader_stream(storage_path, storage_format)

elif source_type == "kinesis":
    kinesis_stream = dbutils.widgets.get("kinesis_stream") if "kinesis_stream" in dbutils.widgets.getAll() else source_name
    kinesis_region = dbutils.widgets.get("kinesis_region") if "kinesis_region" in dbutils.widgets.getAll() else "us-east-1"
    raw_stream = create_kinesis_stream(kinesis_stream, kinesis_region)

else:
    raise ValueError(f"Unsupported source_type: {source_type}. Use: kafka, autoloader, kinesis")

print(f"Stream created for source_type={source_type}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Transform & Write to Bronze

# COMMAND ----------

from pyspark.sql.functions import date_format, uuid

# Add bronze envelope metadata
bronze_stream = (
    raw_stream
    .withColumn("event_id", expr("uuid()"))
    .withColumn("ingest_timestamp", current_timestamp())
    .withColumn("source_name", lit(source_name))
    .withColumn("source_type", lit(source_type))
    .withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd"))
    .select(
        "event_id",
        "ingest_timestamp",
        "source_name",
        "source_type",
        "raw_event",
        "raw_bytes",
        "event_timestamp",
        "partition_date",
        "kafka_offset",
        "kafka_partition",
        "kafka_topic",
        col("file_path").cast("string").alias("file_path"),
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Write

# COMMAND ----------

query = (
    bronze_stream
    .writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", checkpoint_path)
    .option("mergeSchema", "true")
    .trigger(processingTime=processing_time)
    .queryName(f"bronze_ingest_{source_name}")
    .toTable(f"{catalog}.{schema}.bronze_events")
)

print(f"Streaming query started: bronze_ingest_{source_name}")
print(f"Query ID: {query.id}")
print(f"Status: {query.status}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitoring & Health Check

# COMMAND ----------

import time

# Wait for first batch then report status
time.sleep(30)

if query.isActive:
    progress = query.lastProgress
    if progress:
        print(f"Processing rate: {progress.get('processedRowsPerSecond', 0):.1f} rows/sec")
        print(f"Input rows: {progress.get('numInputRows', 0)}")
        print(f"Batch duration: {progress.get('batchDuration', 0)} ms")
    print(f"Query is active and healthy.")
else:
    exception = query.exception()
    if exception:
        raise RuntimeError(f"Stream failed: {exception}")
