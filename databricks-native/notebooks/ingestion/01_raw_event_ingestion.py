# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 01: Raw Event Ingestion (Streaming)
# MAGIC Ingests raw events from Kafka/Event Hub/S3 into Bronze layer.
# MAGIC Handles schema enforcement, quarantine for malformed events.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/raw_ingestion", "Checkpoint")
dbutils.widgets.text("source_type", "kafka", "Source Type (kafka|eventhub|s3)")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path")
source_type = dbutils.widgets.get("source_type")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

event_schema = StructType([
    StructField("timestamp", TimestampType(), True),
    StructField("event_type", StringType(), False),
    StructField("source", StringType(), True),
    StructField("source_ip", StringType(), True),
    StructField("dest_ip", StringType(), True),
    StructField("user_id", StringType(), True),
    StructField("username", StringType(), True),
    StructField("action", StringType(), True),
    StructField("outcome", StringType(), True),
    StructField("severity", StringType(), True),
    StructField("raw_log", StringType(), True),
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source Configuration

# COMMAND ----------

def create_stream_reader(source_type: str):
    if source_type == "kafka":
        return (
            spark.readStream
            .format("kafka")
            .option("kafka.bootstrap.servers", dbutils.secrets.get("soc-secrets", "kafka_brokers"))
            .option("subscribe", "security-events")
            .option("startingOffsets", "latest")
            .option("maxOffsetsPerTrigger", 100000)
            .load()
            .select(from_json(col("value").cast("string"), event_schema).alias("data"))
            .select("data.*")
        )
    elif source_type == "eventhub":
        conn_string = dbutils.secrets.get("soc-secrets", "eventhub_connection")
        eh_conf = {
            "eventhubs.connectionString": sc._jvm.org.apache.spark.eventhubs.EventHubsUtils.encrypt(conn_string)
        }
        return (
            spark.readStream
            .format("eventhubs")
            .options(**eh_conf)
            .load()
            .select(from_json(col("body").cast("string"), event_schema).alias("data"))
            .select("data.*")
        )
    elif source_type == "s3":
        return (
            spark.readStream
            .format("cloudFiles")
            .option("cloudFiles.format", "json")
            .option("cloudFiles.schemaLocation", f"{checkpoint_path}/schema")
            .option("cloudFiles.inferColumnTypes", "true")
            .schema(event_schema)
            .load(dbutils.secrets.get("soc-secrets", "s3_raw_events_path"))
        )
    else:
        raise ValueError(f"Unsupported source_type: {source_type}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Pipeline with Quality Checks

# COMMAND ----------

raw_stream = create_stream_reader(source_type)

enriched_stream = (
    raw_stream
    .withColumn("id", expr("uuid()"))
    .withColumn("ingested_at", current_timestamp())
    .withColumn("_is_valid",
        col("event_type").isNotNull() &
        col("timestamp").isNotNull()
    )
)

valid_events = enriched_stream.filter(col("_is_valid") == True).drop("_is_valid")
quarantined_events = enriched_stream.filter(col("_is_valid") == False).drop("_is_valid")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Valid Events to Bronze

# COMMAND ----------

valid_query = (
    valid_events.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{checkpoint_path}/valid")
    .option("mergeSchema", "true")
    .trigger(processingTime="10 seconds")
    .toTable("events")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Quarantined Events

# COMMAND ----------

quarantine_query = (
    quarantined_events.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{checkpoint_path}/quarantine")
    .trigger(processingTime="30 seconds")
    .toTable("quarantined_events")
)

# COMMAND ----------

print(f"Ingestion streaming started. Source: {source_type}")
print(f"Valid events -> events table")
print(f"Quarantined events -> quarantined_events table")
