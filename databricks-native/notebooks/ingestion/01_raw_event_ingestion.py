# Databricks notebook source
# MAGIC %md
# MAGIC # 01: Raw Event Ingestion (Production Streaming)
# MAGIC
# MAGIC Ingests raw security events from Kafka, Event Hubs, Kinesis, or Autoloader
# MAGIC into the Bronze `events` table. Features:
# MAGIC - PERMISSIVE JSON parsing with corrupt record handling
# MAGIC - Dead-letter queue for unparseable messages
# MAGIC - Backpressure control via maxOffsetsPerTrigger
# MAGIC - Schema evolution support
# MAGIC - Throughput metrics and monitoring
# MAGIC - Automatic checkpoint management

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# Additional widgets specific to this notebook
dbutils.widgets.text("source_type", "kafka", "Source: kafka | eventhub | kinesis | autoloader")
dbutils.widgets.text("topics", "security-events", "Comma-separated topics")
dbutils.widgets.text("consumer_group", "0xdsi-soc-ingestion", "Consumer group ID")
dbutils.widgets.text("max_offsets_per_trigger", "100000", "Max records per micro-batch")
dbutils.widgets.text("starting_offsets", "latest", "Starting offsets: earliest | latest")
dbutils.widgets.text("trigger_interval", "10 seconds", "Trigger processing time")

source_type = dbutils.widgets.get("source_type")
topics = dbutils.widgets.get("topics")
consumer_group = dbutils.widgets.get("consumer_group")
max_offsets = int(dbutils.widgets.get("max_offsets_per_trigger"))
starting_offsets = dbutils.widgets.get("starting_offsets")
trigger_interval = dbutils.widgets.get("trigger_interval")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

# Expected event schema (PERMISSIVE mode will capture malformed records)
EVENT_SCHEMA = StructType([
    StructField("event_type", StringType(), True),
    StructField("timestamp", StringType(), True),
    StructField("source", StringType(), True),
    StructField("source_ip", StringType(), True),
    StructField("dest_ip", StringType(), True),
    StructField("user_id", StringType(), True),
    StructField("username", StringType(), True),
    StructField("hostname", StringType(), True),
    StructField("action", StringType(), True),
    StructField("outcome", StringType(), True),
    StructField("severity", StringType(), True),
    StructField("description", StringType(), True),
    StructField("raw_log", StringType(), True),
    StructField("_corrupt_record", StringType(), True),
])

VALID_SEVERITIES = ["info", "low", "medium", "high", "critical"]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configure Source Stream

# COMMAND ----------

def create_kafka_stream():
    """Create Kafka source with SASL authentication support."""
    kafka_brokers = secrets_mgr.get("kafka_brokers")
    reader = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", kafka_brokers)
        .option("subscribe", topics)
        .option("kafka.group.id", consumer_group)
        .option("startingOffsets", starting_offsets)
        .option("maxOffsetsPerTrigger", max_offsets)
        .option("failOnDataLoss", "false")
        .option("kafka.session.timeout.ms", "60000")
        .option("kafka.request.timeout.ms", "40000")
    )
    sasl_username = secrets_mgr.get_optional("kafka_sasl_username")
    sasl_password = secrets_mgr.get_optional("kafka_sasl_password")
    if sasl_username and sasl_password:
        mechanism = secrets_mgr.get_optional("kafka_sasl_mechanism") or "PLAIN"
        jaas_config = (
            'org.apache.kafka.common.security.plain.PlainLoginModule required '
            f'username="{sasl_username}" password="{sasl_password}";'
        )
        reader = (
            reader
            .option("kafka.security.protocol", "SASL_SSL")
            .option("kafka.sasl.mechanism", mechanism)
            .option("kafka.sasl.jaas.config", jaas_config)
        )
    return reader.load()


def create_eventhub_stream():
    """Create Azure Event Hub source using Kafka protocol."""
    conn_string = secrets_mgr.get("eventhub_connection")
    namespace = conn_string.split("//")[1].split(".")[0] if "//" in conn_string else "unknown"
    eh_servers = f"{namespace}.servicebus.windows.net:9093"
    jaas_config = (
        'org.apache.kafka.common.security.plain.PlainLoginModule required '
        f'username="$ConnectionString" password="{conn_string}";'
    )
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
        .option("kafka.sasl.jaas.config", jaas_config)
        .option("kafka.request.timeout.ms", "60000")
        .load()
    )


def create_kinesis_stream():
    """Create AWS Kinesis source."""
    aws_key = secrets_mgr.get("kinesis_access_key")
    aws_secret = secrets_mgr.get("kinesis_secret_key")
    region = secrets_mgr.get_optional("aws_region") or "us-east-1"
    stream_name = topics.split(",")[0].strip()
    position = "LATEST" if starting_offsets == "latest" else "TRIM_HORIZON"
    return (
        spark.readStream
        .format("kinesis")
        .option("streamName", stream_name)
        .option("region", region)
        .option("awsAccessKey", aws_key)
        .option("awsSecretKey", aws_secret)
        .option("startingPosition", position)
        .load()
    )


def create_autoloader_stream():
    """Create Autoloader source for file-based ingestion (S3/ADLS/GCS)."""
    landing_path = f"{cfg.volume_base}/landing/{topics.replace(',', '_')}"
    return (
        spark.readStream
        .format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.schemaLocation", get_checkpoint_path(cfg, "ingestion_schema"))
        .option("cloudFiles.inferColumnTypes", "true")
        .option("cloudFiles.maxFilesPerTrigger", "100")
        .option("cloudFiles.useIncrementalListing", "true")
        .load(landing_path)
    )


SOURCE_FACTORIES = {
    "kafka": create_kafka_stream,
    "eventhub": create_eventhub_stream,
    "kinesis": create_kinesis_stream,
    "autoloader": create_autoloader_stream,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Source

# COMMAND ----------

if source_type not in SOURCE_FACTORIES:
    raise ValueError(
        f"Unsupported source_type: '{source_type}'. "
        f"Must be one of: {list(SOURCE_FACTORIES.keys())}"
    )

with mon.time("source_init"):
    raw_stream = SOURCE_FACTORIES[source_type]()

mon.log_info(f"Stream initialized: source={source_type}, topics={topics}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Parse Raw Messages

# COMMAND ----------

def parse_raw_stream(raw_df):
    """Parse raw stream bytes into structured events with corrupt record handling."""
    if source_type in ("kafka", "eventhub"):
        return (
            raw_df
            .select(
                col("value").cast("string").alias("_raw_value"),
                col("topic").alias("_source_topic"),
                col("partition").cast("int").alias("_source_partition"),
                col("offset").cast("long").alias("_source_offset"),
                col("timestamp").alias("_kafka_timestamp"),
            )
            .withColumn(
                "_parsed",
                from_json(col("_raw_value"), EVENT_SCHEMA, {"mode": "PERMISSIVE"})
            )
        )
    elif source_type == "kinesis":
        return (
            raw_df
            .select(
                col("data").cast("string").alias("_raw_value"),
                col("partitionKey").alias("_source_topic"),
                lit(0).cast("int").alias("_source_partition"),
                col("sequenceNumber").cast("long").alias("_source_offset"),
                col("approximateArrivalTimestamp").alias("_kafka_timestamp"),
            )
            .withColumn(
                "_parsed",
                from_json(col("_raw_value"), EVENT_SCHEMA, {"mode": "PERMISSIVE"})
            )
        )
    else:
        # Autoloader: data is already structured
        return (
            raw_df
            .withColumn("_raw_value", to_json(struct("*")))
            .withColumn("_source_topic", lit("autoloader"))
            .withColumn("_source_partition", lit(0).cast("int"))
            .withColumn("_source_offset", lit(0).cast("long"))
            .withColumn("_kafka_timestamp", current_timestamp())
            .withColumn("_parsed", struct(
                col("event_type"),
                col("timestamp").cast("string").alias("timestamp"),
                col("source"),
                col("source_ip"),
                col("dest_ip"),
                col("user_id"),
                col("username"),
                col("hostname"),
                col("action"),
                col("outcome"),
                col("severity"),
                col("description"),
                col("raw_log"),
                lit(None).cast("string").alias("_corrupt_record"),
            ))
        )


parsed_stream = parse_raw_stream(raw_stream)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Split Valid vs Quarantine

# COMMAND ----------

# Identify corrupt/unparseable records
classified_stream = (
    parsed_stream
    .withColumn("_is_corrupt",
        col("_parsed._corrupt_record").isNotNull() |
        col("_parsed.event_type").isNull()
    )
    .withColumn("_is_valid",
        ~col("_is_corrupt") &
        col("_parsed.event_type").isNotNull()
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## foreachBatch Processing with DLQ

# COMMAND ----------

# Counters for metrics
_batch_metrics = {"total": 0, "valid": 0, "quarantined": 0, "batches": 0}

_SERVICE_ACCOUNT_PATTERNS = [
    "svc_%", "svc-%", "service_%", "sa_%", "bot_%", "ci_%",
    "automation%", "system%", "noreply%", "daemon%", "cron%",
]


def _auto_discover_entities(valid_events):
    """
    Extract unique user/device/IP entities from a batch and MERGE into entity_spine.
    Called on every micro-batch to passively build the UEBA entity population.
    """
    entity_spine_table = get_table_path(cfg, "entity_spine")

    try:
        # Extract user entities (username or user_id)
        users = (
            valid_events
            .filter(col("username").isNotNull() | col("user_id").isNotNull())
            .select(
                coalesce(col("username"), col("user_id")).alias("canonical_name"),
                col("user_id").alias("entity_external_id"),
                col("source").alias("event_source"),
                col("hostname").alias("device"),
            )
            .filter(col("canonical_name") != "")
            .withColumn("entity_type", lit("user"))
            .groupBy("canonical_name", "entity_type")
            .agg(
                first("entity_external_id").alias("entity_external_id"),
                first("event_source").alias("event_source"),
                first("device").alias("device"),
                count("*").alias("batch_count"),
            )
        )

        # Extract device entities (hostname)
        devices = (
            valid_events
            .filter(col("hostname").isNotNull())
            .select(col("hostname").alias("canonical_name"))
            .filter(col("canonical_name") != "")
            .withColumn("entity_type", lit("device"))
            .groupBy("canonical_name", "entity_type")
            .agg(count("*").alias("batch_count"))
            .withColumn("entity_external_id", lit(None).cast("string"))
            .withColumn("event_source", lit(None).cast("string"))
            .withColumn("device", lit(None).cast("string"))
        )

        # Extract IP entities (source_ip, dest_ip)
        src_ips = valid_events.filter(col("source_ip").isNotNull()).select(col("source_ip").alias("canonical_name"))
        dst_ips = valid_events.filter(col("dest_ip").isNotNull()).select(col("dest_ip").alias("canonical_name"))
        ips = (
            src_ips.union(dst_ips)
            .filter(col("canonical_name") != "")
            .withColumn("entity_type", lit("ip"))
            .groupBy("canonical_name", "entity_type")
            .agg(count("*").alias("batch_count"))
            .withColumn("entity_external_id", lit(None).cast("string"))
            .withColumn("event_source", lit(None).cast("string"))
            .withColumn("device", lit(None).cast("string"))
        )

        # Union all entity types
        all_entities = users.unionByName(devices).unionByName(ips)

        if all_entities.isEmpty():
            return

        # Detect service accounts
        svc_condition = lit(False)
        for pattern in _SERVICE_ACCOUNT_PATTERNS:
            svc_condition = svc_condition | lower(col("canonical_name")).like(pattern)
        all_entities = all_entities.withColumn("is_service_account", svc_condition)

        # Create temp view and MERGE into entity_spine
        all_entities.createOrReplaceTempView("_batch_entities")

        spark.sql(f"""
            MERGE INTO {entity_spine_table} AS target
            USING _batch_entities AS source
            ON target.canonical_name = source.canonical_name
               AND target.entity_type = source.entity_type
            WHEN MATCHED THEN UPDATE SET
                target.last_seen = current_timestamp(),
                target.observation_count = target.observation_count + source.batch_count,
                target.updated_at = current_timestamp()
            WHEN NOT MATCHED THEN INSERT (
                entity_id, entity_type, canonical_name, display_name,
                first_seen, last_seen, observation_count, risk_score,
                is_service_account, is_high_value, updated_at
            ) VALUES (
                uuid(), source.entity_type, source.canonical_name,
                source.canonical_name,
                current_timestamp(), current_timestamp(), source.batch_count, 0.0,
                source.is_service_account, false, current_timestamp()
            )
        """)

    except Exception as e:
        logger.warning(f"Entity auto-discovery failed (non-critical): {e}")


def process_ingestion_batch(batch_df, batch_id):
    """Process a micro-batch: route valid events to Bronze, failures to DLQ."""
    if batch_df.isEmpty():
        return

    batch_df.cache()
    _batch_metrics["batches"] += 1

    try:
        # --- Valid Events ---
        valid_events = (
            batch_df
            .filter(col("_is_valid") == True)
            .select(
                expr("uuid()").alias("id"),
                coalesce(col("_parsed.event_type"), lit("unknown")).alias("event_type"),
                coalesce(
                    to_timestamp(col("_parsed.timestamp")),
                    col("_kafka_timestamp"),
                    current_timestamp()
                ).alias("timestamp"),
                col("_parsed.source").alias("source"),
                col("_parsed.source_ip").alias("source_ip"),
                col("_parsed.dest_ip").alias("dest_ip"),
                col("_parsed.user_id").alias("user_id"),
                col("_parsed.username").alias("username"),
                col("_parsed.hostname").alias("hostname"),
                coalesce(col("_parsed.action"), lit("observed")).alias("action"),
                coalesce(col("_parsed.outcome"), lit("unknown")).alias("outcome"),
                coalesce(col("_parsed.severity"), lit("info")).alias("severity"),
                col("_parsed.description").alias("description"),
                col("_parsed.raw_log").alias("raw_log"),
                col("_source_topic").alias("source_topic"),
                col("_source_partition").alias("source_partition"),
                col("_source_offset").alias("source_offset"),
                current_timestamp().alias("ingested_at"),
                lit(source_type).alias("source_connector"),
            )
            # Normalize severity to valid values
            .withColumn("severity",
                when(col("severity").isin(VALID_SEVERITIES), col("severity"))
                .otherwise(lit("info"))
            )
        )

        valid_count = valid_events.count()
        if valid_count > 0:
            valid_events.write.mode("append").option("mergeSchema", "true").saveAsTable(
                get_table_path(cfg, "events")
            )
            _batch_metrics["valid"] += valid_count

            # ── UEBA Auto-Discovery ──
            # Extract user entities from events and MERGE into entity_spine.
            # This creates the identity baseline passively as events flow in.
            _auto_discover_entities(valid_events)

        # --- Dead Letter Queue (quarantine) ---
        quarantined = (
            batch_df
            .filter(col("_is_corrupt") == True)
            .select(
                expr("uuid()").alias("id"),
                col("_raw_value").alias("original_data"),
                coalesce(col("_parsed._corrupt_record"), lit("unparseable")).alias("quarantine_reason"),
                col("_source_topic").alias("source"),
                lit(source_type).alias("source_connector"),
                current_timestamp().alias("quarantined_at"),
                lit(False).alias("recovered"),
            )
        )

        quarantine_count = quarantined.count()
        if quarantine_count > 0:
            quarantined.write.mode("append").option("mergeSchema", "true").saveAsTable(
                get_table_path(cfg, "quarantined_events")
            )
            _batch_metrics["quarantined"] += quarantine_count

        _batch_metrics["total"] += valid_count + quarantine_count

        # --- Update Agent Status ---
        total_processed = valid_count + quarantine_count
        status_query = build_update(
            "agent_status",
            set_values={
                "last_heartbeat": "current_timestamp()",
                "status": "running",
                "events_processed": str(total_processed),
            },
            where_conditions={"agent_id": f"ingestion_{source_type}"},
            catalog=cfg.catalog,
            schema=cfg.schema,
        )
        try:
            spark.sql(status_query.sql)
        except Exception:
            pass  # Agent status update is non-critical

    finally:
        batch_df.unpersist()


# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Query

# COMMAND ----------

checkpoint_location = get_checkpoint_path(cfg, f"ingestion_{source_type}")

query = (
    classified_stream
    .writeStream
    .foreachBatch(process_ingestion_batch)
    .option("checkpointLocation", checkpoint_location)
    .trigger(processingTime=trigger_interval)
    .queryName(f"0xdsi_ingestion_{source_type}")
    .start()
)

mon.log_info(
    f"Streaming started: source={source_type}, topics={topics}, "
    f"checkpoint={checkpoint_location}, trigger={trigger_interval}"
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Until Termination

# COMMAND ----------

try:
    query.awaitTermination()
except Exception as e:
    mon.log_error(e, context="Streaming query terminated unexpectedly")
    raise
finally:
    mon.log_complete(rows_processed=_batch_metrics["total"])
    print(f"\nIngestion Summary:")
    print(f"  Batches processed: {_batch_metrics['batches']}")
    print(f"  Valid events: {_batch_metrics['valid']}")
    print(f"  Quarantined: {_batch_metrics['quarantined']}")
    print(f"  Total: {_batch_metrics['total']}")
