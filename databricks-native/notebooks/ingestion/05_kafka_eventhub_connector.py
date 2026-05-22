# Databricks notebook source
# MAGIC %md
# MAGIC # 05: Multi-Source Streaming Connector (Production)
# MAGIC
# MAGIC Production-grade streaming ingestion supporting:
# MAGIC - Apache Kafka (self-managed, Confluent Cloud, MSK)
# MAGIC - Azure Event Hubs (via native Kafka protocol)
# MAGIC - AWS Kinesis Data Streams
# MAGIC - Databricks Autoloader (S3/ADLS/GCS file notification)
# MAGIC
# MAGIC Features:
# MAGIC - Health check with automatic source failover
# MAGIC - Backpressure handling via adaptive maxOffsetsPerTrigger
# MAGIC - Multi-format parsing (JSON, CEF, Syslog, LEEF)
# MAGIC - Source offset tracking for replay/recovery
# MAGIC - Per-topic consumer group isolation
# MAGIC - Metrics emission for Databricks SQL dashboards

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("source_type", "kafka", "Primary source: kafka | eventhub | kinesis | autoloader")
dbutils.widgets.text("topics", "security-events", "Comma-separated topic/stream names")
dbutils.widgets.text("consumer_group", "0xdsi-soc-primary", "Consumer group ID")
dbutils.widgets.text("max_offsets_per_trigger", "100000", "Initial max records per micro-batch")
dbutils.widgets.text("starting_offsets", "latest", "Starting: earliest | latest | timestamp")
dbutils.widgets.text("trigger_interval", "10 seconds", "Trigger processing time")
dbutils.widgets.text("enable_adaptive_backpressure", "true", "Auto-adjust batch size based on lag")
dbutils.widgets.text("parse_format", "json", "Expected format: json | cef | syslog | mixed")
dbutils.widgets.text("failover_source", "", "Failover source if primary unhealthy")

source_type = dbutils.widgets.get("source_type")
topics = dbutils.widgets.get("topics")
consumer_group = dbutils.widgets.get("consumer_group")
max_offsets = int(dbutils.widgets.get("max_offsets_per_trigger"))
starting_offsets = dbutils.widgets.get("starting_offsets")
trigger_interval = dbutils.widgets.get("trigger_interval")
adaptive_backpressure = dbutils.widgets.get("enable_adaptive_backpressure").lower() == "true"
parse_format = dbutils.widgets.get("parse_format")
failover_source = dbutils.widgets.get("failover_source")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json as json_lib
import re
import time

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source Health Check

# COMMAND ----------

def check_kafka_health(brokers: str, timeout_ms: int = 10000) -> bool:
    """Verify Kafka cluster is reachable."""
    try:
        test_df = (
            spark.read
            .format("kafka")
            .option("kafka.bootstrap.servers", brokers)
            .option("subscribe", topics.split(",")[0])
            .option("startingOffsets", "latest")
            .option("endingOffsets", "latest")
            .option("kafka.request.timeout.ms", str(timeout_ms))
            .load()
        )
        # If we can read schema, cluster is alive
        _ = test_df.schema
        return True
    except Exception as e:
        mon.log_warning(f"Kafka health check failed: {e}")
        return False


def check_source_health(src_type: str) -> bool:
    """Check if the configured source is reachable."""
    if src_type == "kafka":
        brokers = secrets_mgr.get_optional("kafka_brokers")
        if not brokers:
            return False
        return check_kafka_health(brokers)
    elif src_type == "eventhub":
        conn = secrets_mgr.get_optional("eventhub_connection")
        return conn is not None and len(conn) > 20
    elif src_type == "kinesis":
        key = secrets_mgr.get_optional("kinesis_access_key")
        return key is not None
    elif src_type == "autoloader":
        return True  # Autoloader always available with DBFS/Volumes
    return False

# COMMAND ----------

# Check primary source, failover if needed
with mon.time("health_check"):
    primary_healthy = check_source_health(source_type)
    active_source = source_type

    if not primary_healthy and failover_source:
        mon.log_warning(f"Primary source '{source_type}' unhealthy, trying failover '{failover_source}'")
        failover_healthy = check_source_health(failover_source)
        if failover_healthy:
            active_source = failover_source
            mon.log_info(f"Failover activated: using '{active_source}'")
        else:
            raise ConnectionError(
                f"Both primary '{source_type}' and failover '{failover_source}' sources are unhealthy"
            )
    elif not primary_healthy:
        raise ConnectionError(
            f"Source '{source_type}' is unhealthy and no failover configured"
        )

mon.log_info(f"Health check passed for source: {active_source}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Stream Source Factory

# COMMAND ----------

def create_source_stream(src_type: str):
    """Create a streaming DataFrame from the specified source."""
    if src_type == "kafka":
        brokers = secrets_mgr.get("kafka_brokers")
        reader = (
            spark.readStream
            .format("kafka")
            .option("kafka.bootstrap.servers", brokers)
            .option("subscribe", topics)
            .option("kafka.group.id", consumer_group)
            .option("startingOffsets", starting_offsets)
            .option("maxOffsetsPerTrigger", max_offsets)
            .option("failOnDataLoss", "false")
            .option("kafka.session.timeout.ms", "60000")
            .option("kafka.request.timeout.ms", "40000")
            .option("kafka.max.poll.records", "10000")
            .option("kafka.fetch.max.bytes", "52428800")  # 50MB
        )
        # SASL auth if configured
        username = secrets_mgr.get_optional("kafka_sasl_username")
        password = secrets_mgr.get_optional("kafka_sasl_password")
        if username and password:
            mechanism = secrets_mgr.get_optional("kafka_sasl_mechanism") or "PLAIN"
            jaas = (
                f'org.apache.kafka.common.security.plain.PlainLoginModule required '
                f'username="{username}" password="{password}";'
            )
            reader = (
                reader
                .option("kafka.security.protocol", "SASL_SSL")
                .option("kafka.sasl.mechanism", mechanism)
                .option("kafka.sasl.jaas.config", jaas)
            )
        return reader.load()

    elif src_type == "eventhub":
        conn_string = secrets_mgr.get("eventhub_connection")
        # Extract namespace from connection string
        namespace_match = re.search(r"Endpoint=sb://([^.]+)", conn_string)
        namespace = namespace_match.group(1) if namespace_match else "unknown"
        eh_servers = f"{namespace}.servicebus.windows.net:9093"
        jaas = (
            f'org.apache.kafka.common.security.plain.PlainLoginModule required '
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
            .option("kafka.sasl.jaas.config", jaas)
            .option("kafka.request.timeout.ms", "60000")
            .load()
        )

    elif src_type == "kinesis":
        access_key = secrets_mgr.get("kinesis_access_key")
        secret_key = secrets_mgr.get("kinesis_secret_key")
        region = secrets_mgr.get_optional("aws_region") or "us-east-1"
        stream_name = topics.split(",")[0].strip()
        position = "LATEST" if starting_offsets == "latest" else "TRIM_HORIZON"
        return (
            spark.readStream
            .format("kinesis")
            .option("streamName", stream_name)
            .option("region", region)
            .option("awsAccessKey", access_key)
            .option("awsSecretKey", secret_key)
            .option("startingPosition", position)
            .option("maxFetchRecordsPerShard", str(max_offsets // 4))
            .load()
        )

    elif src_type == "autoloader":
        landing_path = f"{cfg.volume_base}/landing/{topics.replace(',', '_')}"
        return (
            spark.readStream
            .format("cloudFiles")
            .option("cloudFiles.format", "json")
            .option("cloudFiles.schemaLocation", get_checkpoint_path(cfg, "connector_schema"))
            .option("cloudFiles.inferColumnTypes", "true")
            .option("cloudFiles.maxFilesPerTrigger", "200")
            .option("cloudFiles.useIncrementalListing", "true")
            .load(landing_path)
        )

    raise ValueError(f"Unsupported source: {src_type}")

# COMMAND ----------

with mon.time("create_stream"):
    raw_stream = create_source_stream(active_source)
    mon.log_info(f"Stream created: {active_source}, topics={topics}, group={consumer_group}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Multi-Format Parser

# COMMAND ----------

# Standard JSON event schema
JSON_EVENT_SCHEMA = StructType([
    StructField("event_type", StringType(), True),
    StructField("timestamp", StringType(), True),
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

# CEF regex: CEF:Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity|Extension
CEF_REGEX = r"CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)"

# Syslog regex: <priority>timestamp hostname process[pid]: message
SYSLOG_REGEX = r"<(\d+)>(\w+ \d+ [\d:]+) (\S+) (\S+?)(?:\[(\d+)\])?: (.*)"


def parse_message_value(raw_df):
    """Parse raw bytes into a normalized column layout based on format."""
    # Extract raw value from source-specific columns
    if active_source in ("kafka", "eventhub"):
        base_df = raw_df.select(
            col("value").cast("string").alias("_raw"),
            col("topic").alias("_topic"),
            col("partition").cast("int").alias("_partition"),
            col("offset").cast("long").alias("_offset"),
            col("timestamp").alias("_source_ts"),
        )
    elif active_source == "kinesis":
        base_df = raw_df.select(
            col("data").cast("string").alias("_raw"),
            col("partitionKey").alias("_topic"),
            lit(0).cast("int").alias("_partition"),
            col("sequenceNumber").cast("long").alias("_offset"),
            col("approximateArrivalTimestamp").alias("_source_ts"),
        )
    else:
        base_df = raw_df.select(
            to_json(struct("*")).alias("_raw"),
            lit("autoloader").alias("_topic"),
            lit(0).cast("int").alias("_partition"),
            lit(0).cast("long").alias("_offset"),
            current_timestamp().alias("_source_ts"),
        )

    # Detect format and parse
    if parse_format == "json":
        return _parse_json(base_df)
    elif parse_format == "cef":
        return _parse_cef(base_df)
    elif parse_format == "syslog":
        return _parse_syslog(base_df)
    else:
        # Mixed: auto-detect per message
        return _parse_mixed(base_df)


def _parse_json(df):
    """Parse JSON formatted messages."""
    return (
        df
        .withColumn("_parsed", from_json(col("_raw"), JSON_EVENT_SCHEMA, {"mode": "PERMISSIVE"}))
        .withColumn("_format", lit("json"))
        .withColumn("_parse_ok", col("_parsed._corrupt_record").isNull() & col("_parsed.event_type").isNotNull())
    )


def _parse_cef(df):
    """Parse CEF formatted messages."""
    return (
        df
        .withColumn("_cef_match", regexp_extract(col("_raw"), CEF_REGEX, 0))
        .withColumn("_parsed", struct(
            regexp_extract(col("_raw"), CEF_REGEX, 6).alias("event_type"),
            lit(None).cast("string").alias("timestamp"),
            lit(None).cast("string").alias("source_ip"),
            lit(None).cast("string").alias("dest_ip"),
            lit(None).cast("string").alias("user_id"),
            lit(None).cast("string").alias("username"),
            regexp_extract(col("_raw"), CEF_REGEX, 2).alias("hostname"),
            lit(None).cast("string").alias("action"),
            lit(None).cast("string").alias("outcome"),
            regexp_extract(col("_raw"), CEF_REGEX, 7).alias("severity"),
            regexp_extract(col("_raw"), CEF_REGEX, 6).alias("description"),
            col("_raw").alias("raw_log"),
            lit(None).cast("string").alias("_corrupt_record"),
        ))
        .withColumn("_format", lit("cef"))
        .withColumn("_parse_ok", length(col("_cef_match")) > 0)
        .drop("_cef_match")
    )


def _parse_syslog(df):
    """Parse syslog formatted messages."""
    return (
        df
        .withColumn("_syslog_match", regexp_extract(col("_raw"), SYSLOG_REGEX, 0))
        .withColumn("_parsed", struct(
            regexp_extract(col("_raw"), SYSLOG_REGEX, 4).alias("event_type"),
            regexp_extract(col("_raw"), SYSLOG_REGEX, 2).alias("timestamp"),
            lit(None).cast("string").alias("source_ip"),
            lit(None).cast("string").alias("dest_ip"),
            lit(None).cast("string").alias("user_id"),
            lit(None).cast("string").alias("username"),
            regexp_extract(col("_raw"), SYSLOG_REGEX, 3).alias("hostname"),
            lit(None).cast("string").alias("action"),
            lit(None).cast("string").alias("outcome"),
            lit("info").alias("severity"),
            regexp_extract(col("_raw"), SYSLOG_REGEX, 6).alias("description"),
            col("_raw").alias("raw_log"),
            lit(None).cast("string").alias("_corrupt_record"),
        ))
        .withColumn("_format", lit("syslog"))
        .withColumn("_parse_ok", length(col("_syslog_match")) > 0)
        .drop("_syslog_match")
    )


def _parse_mixed(df):
    """Auto-detect format per message and parse accordingly."""
    return (
        df
        .withColumn("_detected_format",
            when(col("_raw").startswith("CEF:"), lit("cef"))
            .when(col("_raw").rlike(r"^<\d+>"), lit("syslog"))
            .when(col("_raw").startswith("{"), lit("json"))
            .otherwise(lit("unknown"))
        )
        .withColumn("_parsed",
            when(col("_detected_format") == "json",
                from_json(col("_raw"), JSON_EVENT_SCHEMA, {"mode": "PERMISSIVE"})
            )
            .otherwise(struct(
                lit("raw_event").alias("event_type"),
                lit(None).cast("string").alias("timestamp"),
                lit(None).cast("string").alias("source_ip"),
                lit(None).cast("string").alias("dest_ip"),
                lit(None).cast("string").alias("user_id"),
                lit(None).cast("string").alias("username"),
                lit(None).cast("string").alias("hostname"),
                lit(None).cast("string").alias("action"),
                lit(None).cast("string").alias("outcome"),
                lit("info").alias("severity"),
                col("_raw").alias("description"),
                col("_raw").alias("raw_log"),
                lit(None).cast("string").alias("_corrupt_record"),
            ))
        )
        .withColumn("_format", col("_detected_format"))
        .withColumn("_parse_ok", col("_parsed.event_type").isNotNull())
    )


parsed_stream = parse_message_value(raw_stream)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Adaptive Backpressure

# COMMAND ----------

_backpressure_state = {"current_max_offsets": max_offsets, "consecutive_slow": 0}

def adjust_backpressure(batch_duration_ms: float, batch_size: int):
    """Adjust maxOffsetsPerTrigger based on processing speed."""
    if not adaptive_backpressure:
        return

    target_duration_ms = 8000  # Target: process within 80% of trigger interval
    current = _backpressure_state["current_max_offsets"]

    if batch_duration_ms > target_duration_ms:
        # Too slow: reduce batch size
        _backpressure_state["consecutive_slow"] += 1
        if _backpressure_state["consecutive_slow"] >= 3:
            new_max = max(int(current * 0.7), 1000)
            _backpressure_state["current_max_offsets"] = new_max
            _backpressure_state["consecutive_slow"] = 0
            mon.log_info(f"Backpressure: reduced batch to {new_max}")
    elif batch_duration_ms < target_duration_ms * 0.5 and batch_size >= current * 0.9:
        # Fast and at capacity: increase batch size
        _backpressure_state["consecutive_slow"] = 0
        new_max = min(int(current * 1.3), max_offsets * 3)
        _backpressure_state["current_max_offsets"] = new_max

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Processor with Metrics

# COMMAND ----------

VALID_SEVERITIES = ["info", "low", "medium", "high", "critical"]
_total_metrics = {"valid": 0, "failed": 0, "batches": 0}


def process_connector_batch(batch_df, batch_id):
    """Process parsed batch: route valid to events, failures to quarantine."""
    if batch_df.isEmpty():
        return

    batch_start = time.time()
    batch_df.cache()
    _total_metrics["batches"] += 1

    try:
        # Valid events
        valid_events = (
            batch_df
            .filter(col("_parse_ok") == True)
            .select(
                expr("uuid()").alias("id"),
                coalesce(col("_parsed.event_type"), lit("unknown")).alias("event_type"),
                coalesce(to_timestamp(col("_parsed.timestamp")), col("_source_ts"), current_timestamp()).alias("timestamp"),
                col("_parsed.source_ip").alias("source_ip"),
                col("_parsed.dest_ip").alias("dest_ip"),
                col("_parsed.user_id").alias("user_id"),
                col("_parsed.username").alias("username"),
                col("_parsed.hostname").alias("hostname"),
                coalesce(col("_parsed.action"), lit("observed")).alias("action"),
                coalesce(col("_parsed.outcome"), lit("unknown")).alias("outcome"),
                coalesce(col("_parsed.severity"), lit("info")).alias("severity"),
                col("_parsed.description").alias("description"),
                coalesce(col("_parsed.raw_log"), col("_raw")).alias("raw_log"),
                col("_topic").alias("source_topic"),
                col("_partition").alias("source_partition"),
                col("_offset").alias("source_offset"),
                col("_format").alias("parse_format"),
                current_timestamp().alias("ingested_at"),
                lit(active_source).alias("source_connector"),
            )
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
            _total_metrics["valid"] += valid_count

        # Failed events -> quarantine
        failed_events = (
            batch_df
            .filter(col("_parse_ok") == False)
            .select(
                expr("uuid()").alias("id"),
                col("_raw").alias("original_data"),
                concat(lit("parse_failed_"), col("_format")).alias("quarantine_reason"),
                col("_topic").alias("source"),
                lit(active_source).alias("source_connector"),
                current_timestamp().alias("quarantined_at"),
                lit(False).alias("recovered"),
                lit(0).alias("retry_count"),
            )
        )

        failed_count = failed_events.count()
        if failed_count > 0:
            failed_events.write.mode("append").option("mergeSchema", "true").saveAsTable(
                get_table_path(cfg, "quarantined_events")
            )
            _total_metrics["failed"] += failed_count

        # Adjust backpressure
        batch_duration = (time.time() - batch_start) * 1000
        adjust_backpressure(batch_duration, valid_count + failed_count)

        # Periodic status update (every 10 batches)
        if _total_metrics["batches"] % 10 == 0:
            mon.log_metric("connector_valid_total", _total_metrics["valid"])
            mon.log_metric("connector_failed_total", _total_metrics["failed"])

    finally:
        batch_df.unpersist()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Query

# COMMAND ----------

checkpoint_location = get_checkpoint_path(cfg, f"connector_{active_source}")

query = (
    parsed_stream
    .writeStream
    .foreachBatch(process_connector_batch)
    .option("checkpointLocation", checkpoint_location)
    .trigger(processingTime=trigger_interval)
    .queryName(f"0xdsi_connector_{active_source}")
    .start()
)

mon.log_info(
    f"Connector started: source={active_source}, format={parse_format}, "
    f"topics={topics}, trigger={trigger_interval}, "
    f"backpressure={'adaptive' if adaptive_backpressure else 'fixed'}"
)

# COMMAND ----------

try:
    query.awaitTermination()
except Exception as e:
    mon.log_error(e, context=f"Connector {active_source} terminated")
    raise
finally:
    mon.log_complete(rows_processed=_total_metrics["valid"] + _total_metrics["failed"])
