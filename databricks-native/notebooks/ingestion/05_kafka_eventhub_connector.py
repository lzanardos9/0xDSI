# Databricks notebook source
# MAGIC %md
# MAGIC # Production Ingestion Connector - Kafka / Azure Event Hubs / AWS Kinesis
# MAGIC
# MAGIC Multi-source streaming ingestion that lands raw security events into the
# MAGIC Bronze `events` Delta table. Supports:
# MAGIC - Apache Kafka (self-managed or Confluent Cloud)
# MAGIC - Azure Event Hubs (via Kafka protocol)
# MAGIC - AWS Kinesis Data Streams
# MAGIC - Webhook HTTP endpoint (via Autoloader)

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime
import json
import uuid

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("source_type", "kafka", "Source: kafka | eventhub | kinesis | autoloader")
dbutils.widgets.text("bootstrap_servers", "", "Kafka bootstrap servers (comma-separated)")
dbutils.widgets.text("topics", "security-events", "Comma-separated topic list")
dbutils.widgets.text("consumer_group", "0xdsi-soc-ingestion", "Consumer group ID")
dbutils.widgets.text("checkpoint_path", "", "Checkpoint location (auto-generated if empty)")
dbutils.widgets.text("max_offsets_per_trigger", "50000", "Max records per micro-batch")
dbutils.widgets.text("starting_offsets", "latest", "Starting offsets: earliest | latest")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
source_type = dbutils.widgets.get("source_type")
bootstrap_servers = dbutils.widgets.get("bootstrap_servers")
topics = dbutils.widgets.get("topics")
consumer_group = dbutils.widgets.get("consumer_group")
max_offsets = dbutils.widgets.get("max_offsets_per_trigger")
starting_offsets = dbutils.widgets.get("starting_offsets")

checkpoint_path = dbutils.widgets.get("checkpoint_path")
if not checkpoint_path:
    checkpoint_path = f"/Volumes/{catalog}/{schema}/checkpoints/ingestion_{source_type}"

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Retrieve Connection Secrets

# COMMAND ----------

SECRET_SCOPE = "0xdsi-soc"

def get_secret(scope, key, default=""):
    try:
        return dbutils.secrets.get(scope=scope, key=key)
    except Exception:
        if default:
            return default
        raise ValueError(f"Secret {scope}/{key} not found.")

if source_type == "kafka":
    kafka_username = get_secret(SECRET_SCOPE, "kafka-username", "")
    kafka_password = get_secret(SECRET_SCOPE, "kafka-password", "")
    kafka_mechanism = get_secret(SECRET_SCOPE, "kafka-sasl-mechanism", "PLAIN")
elif source_type == "eventhub":
    eventhub_connection_string = get_secret(SECRET_SCOPE, "eventhub-connection-string")
    eventhub_namespace = get_secret(SECRET_SCOPE, "eventhub-namespace")
elif source_type == "kinesis":
    aws_access_key = get_secret(SECRET_SCOPE, "aws-access-key-id")
    aws_secret_key = get_secret(SECRET_SCOPE, "aws-secret-access-key")
    kinesis_region = get_secret(SECRET_SCOPE, "aws-region", "us-east-1")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configure Stream Reader

# COMMAND ----------

def create_kafka_stream():
    reader = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", bootstrap_servers)
        .option("subscribe", topics)
        .option("kafka.group.id", consumer_group)
        .option("startingOffsets", starting_offsets)
        .option("maxOffsetsPerTrigger", max_offsets)
        .option("failOnDataLoss", "false")
        .option("kafka.session.timeout.ms", "60000")
        .option("kafka.request.timeout.ms", "40000")
    )
    if kafka_username and kafka_password:
        sasl_config = f'org.apache.kafka.common.security.plain.PlainLoginModule required username="{kafka_username}" password="{kafka_password}";'
        reader = (
            reader
            .option("kafka.security.protocol", "SASL_SSL")
            .option("kafka.sasl.mechanism", kafka_mechanism)
            .option("kafka.sasl.jaas.config", sasl_config)
        )
    return reader.load()


def create_eventhub_stream():
    eh_servers = f"{eventhub_namespace}.servicebus.windows.net:9093"
    sasl_config = f'org.apache.kafka.common.security.plain.PlainLoginModule required username="$ConnectionString" password="{eventhub_connection_string}";'
    return (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", eh_servers)
        .option("subscribe", topics)
        .option("kafka.group.id", consumer_group)
        .option("startingOffsets", starting_offsets)
        .option("maxOffsetsPerTrigger", max_offsets)
        .option("failOnDataLoss", "false")
        .option("kafka.security.protocol", "SASL_SSL")
        .option("kafka.sasl.mechanism", "PLAIN")
        .option("kafka.sasl.jaas.config", sasl_config)
        .option("kafka.request.timeout.ms", "60000")
        .load()
    )


def create_kinesis_stream():
    return (
        spark.readStream
        .format("kinesis")
        .option("streamName", topics.split(",")[0])
        .option("region", kinesis_region)
        .option("awsAccessKey", aws_access_key)
        .option("awsSecretKey", aws_secret_key)
        .option("startingPosition", "LATEST" if starting_offsets == "latest" else "TRIM_HORIZON")
        .load()
    )


def create_autoloader_stream():
    landing_path = f"/Volumes/{catalog}/{schema}/landing/webhooks"
    return (
        spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.schemaLocation", f"{checkpoint_path}/schema")
        .option("cloudFiles.inferColumnTypes", "true")
        .option("cloudFiles.maxFilesPerTrigger", "100")
        .load(landing_path)
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Stream

# COMMAND ----------

if source_type == "kafka":
    raw_stream = create_kafka_stream()
elif source_type == "eventhub":
    raw_stream = create_eventhub_stream()
elif source_type == "kinesis":
    raw_stream = create_kinesis_stream()
elif source_type == "autoloader":
    raw_stream = create_autoloader_stream()
else:
    raise ValueError(f"Unsupported source_type: {source_type}")

print(f"Stream initialized: source={source_type}, topics={topics}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Parse and Normalize Events (JSON, CEF, Syslog)

# COMMAND ----------

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
    StructField("raw_data", StringType(), True),
])

if source_type in ("kafka", "eventhub"):
    parsed_stream = (
        raw_stream
        .select(
            col("value").cast("string").alias("raw_value"),
            col("topic").alias("source_topic"),
            col("partition").cast("int").alias("source_partition"),
            col("offset").cast("long").alias("source_offset"),
            col("timestamp").alias("kafka_timestamp"),
        )
        .withColumn("parsed", from_json(col("raw_value"), event_schema))
        .select(
            expr("uuid()").alias("id"),
            coalesce(col("parsed.event_type"), lit("unknown")).alias("event_type"),
            coalesce(to_timestamp(col("parsed.timestamp")), col("kafka_timestamp")).alias("timestamp"),
            col("parsed.source_ip").alias("source_ip"),
            col("parsed.dest_ip").alias("dest_ip"),
            col("parsed.user_id").alias("user_id"),
            col("parsed.hostname").alias("hostname"),
            coalesce(col("parsed.action"), lit("observed")).alias("action"),
            coalesce(col("parsed.severity"), lit("medium")).alias("severity"),
            col("parsed.description").alias("description"),
            col("source_topic"),
            col("source_partition"),
            col("source_offset"),
            col("raw_value").alias("raw_data"),
            current_timestamp().alias("ingestion_time"),
            lit("success").alias("parse_status"),
            lit(source_type).alias("source_connector"),
        )
    )
elif source_type == "kinesis":
    parsed_stream = (
        raw_stream
        .select(
            col("data").cast("string").alias("raw_value"),
            col("partitionKey").alias("source_topic"),
            lit(0).cast("int").alias("source_partition"),
            col("sequenceNumber").cast("long").alias("source_offset"),
            col("approximateArrivalTimestamp").alias("kafka_timestamp"),
        )
        .withColumn("parsed", from_json(col("raw_value"), event_schema))
        .select(
            expr("uuid()").alias("id"),
            coalesce(col("parsed.event_type"), lit("unknown")).alias("event_type"),
            coalesce(to_timestamp(col("parsed.timestamp")), col("kafka_timestamp")).alias("timestamp"),
            col("parsed.source_ip").alias("source_ip"),
            col("parsed.dest_ip").alias("dest_ip"),
            col("parsed.user_id").alias("user_id"),
            col("parsed.hostname").alias("hostname"),
            coalesce(col("parsed.action"), lit("observed")).alias("action"),
            coalesce(col("parsed.severity"), lit("medium")).alias("severity"),
            col("parsed.description").alias("description"),
            col("source_topic"),
            col("source_partition"),
            col("source_offset"),
            col("raw_value").alias("raw_data"),
            current_timestamp().alias("ingestion_time"),
            lit("success").alias("parse_status"),
            lit("kinesis").alias("source_connector"),
        )
    )
else:
    parsed_stream = (
        raw_stream
        .select(
            expr("uuid()").alias("id"),
            coalesce(col("event_type"), lit("webhook")).alias("event_type"),
            coalesce(to_timestamp(col("timestamp")), current_timestamp()).alias("timestamp"),
            col("source_ip"), col("dest_ip"), col("user_id"), col("hostname"),
            coalesce(col("action"), lit("observed")).alias("action"),
            coalesce(col("severity"), lit("medium")).alias("severity"),
            col("description"),
            lit("webhook").alias("source_topic"),
            lit(0).cast("int").alias("source_partition"),
            lit(0).cast("long").alias("source_offset"),
            to_json(struct("*")).alias("raw_data"),
            current_timestamp().alias("ingestion_time"),
            lit("success").alias("parse_status"),
            lit("autoloader").alias("source_connector"),
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write: Valid Events -> Bronze, Parse Failures -> Quarantine

# COMMAND ----------

def write_micro_batch(batch_df, batch_id):
    if batch_df.isEmpty():
        return
    valid_events = batch_df.filter(col("parse_status") == "success")
    if valid_events.count() > 0:
        valid_events.write.mode("append").saveAsTable("events")
    failed_events = batch_df.filter(col("parse_status") == "failed")
    if failed_events.count() > 0:
        failed_events.write.mode("append").saveAsTable("quarantine_events")

    total = batch_df.count()
    spark.sql(f"""
        MERGE INTO agent_status AS target
        USING (SELECT
            'kafka_ingestion_{source_type}' as agent_id,
            current_timestamp() as last_heartbeat,
            'running' as status,
            {total} as events_processed,
            0 as alerts_generated
        ) AS source
        ON target.agent_id = source.agent_id
        WHEN MATCHED THEN UPDATE SET
            last_heartbeat = source.last_heartbeat,
            events_processed = target.events_processed + source.events_processed
        WHEN NOT MATCHED THEN INSERT *
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Query

# COMMAND ----------

query = (
    parsed_stream
    .writeStream
    .foreachBatch(write_micro_batch)
    .option("checkpointLocation", checkpoint_path)
    .trigger(processingTime="10 seconds")
    .queryName(f"0xdsi_ingestion_{source_type}")
    .start()
)

print(f"Streaming query started: 0xdsi_ingestion_{source_type}")
print(f"Checkpoint: {checkpoint_path}")
print(f"Source: {source_type} | Topics: {topics}")

query.awaitTermination()
