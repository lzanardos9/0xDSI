# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI SDP Stream Builder
# MAGIC
# MAGIC Shared module for the Streaming Detection Pipeline (SDP).
# MAGIC Provides a pre-configured Kafka readStream directly from ZeroBus,
# MAGIC bypassing Delta table latency for sub-second detection.
# MAGIC
# MAGIC ## Architecture
# MAGIC ```
# MAGIC ZeroBus (Kafka) ─┬─► Ingestion Pipeline → events (Delta)   [persistence, 30-60s]
# MAGIC                  │
# MAGIC                  └─► SDP Stream (this module)               [sub-second]
# MAGIC                       ├─ streaming_correlation_engine
# MAGIC                       ├─ temporal_window_correlator
# MAGIC                       ├─ threat_intel_matching
# MAGIC                       └─ realtime_graph_cep (NetworkX)
# MAGIC ```
# MAGIC
# MAGIC ## Usage
# MAGIC ```python
# MAGIC from sdp_stream import create_sdp_stream, SDPStreamConfig
# MAGIC
# MAGIC stream = create_sdp_stream(
# MAGIC     spark, secrets_mgr, cfg,
# MAGIC     consumer_group="0xdsi-sdp-correlation",
# MAGIC     watermark="5 minutes",
# MAGIC )
# MAGIC ```

# COMMAND ----------

import logging
from dataclasses import dataclass
from typing import Optional

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql.functions import (
    col, from_json, expr, coalesce, lit, to_timestamp, current_timestamp, when
)
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType
)

logger = logging.getLogger("oxdsi.sdp_stream")


# COMMAND ----------

# Standard event schema on ZeroBus Kafka topic
ZEROBUS_EVENT_SCHEMA = StructType([
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
])

VALID_SEVERITIES = ["info", "low", "medium", "high", "critical"]

DEFAULT_TOPIC = "security-events"
DEFAULT_CONSUMER_GROUP_PREFIX = "0xdsi-sdp"


# COMMAND ----------

@dataclass
class SDPStreamConfig:
    """Configuration for an SDP stream consumer."""
    consumer_group: str
    topics: str = DEFAULT_TOPIC
    watermark_interval: str = "5 minutes"
    max_offsets_per_trigger: int = 50000
    starting_offsets: str = "latest"
    include_kafka_metadata: bool = False


def create_sdp_stream(
    spark: SparkSession,
    secrets_mgr,
    cfg,
    consumer_group: str,
    watermark: str = "5 minutes",
    topics: Optional[str] = None,
    max_offsets_per_trigger: int = 50000,
    starting_offsets: str = "latest",
    include_kafka_metadata: bool = False,
) -> DataFrame:
    """
    Create a Structured Streaming DataFrame reading directly from ZeroBus (Kafka).

    This bypasses the Delta events table entirely, providing sub-second latency
    for detection engines. Events are parsed from JSON and normalized inline.

    Args:
        spark: Active SparkSession
        secrets_mgr: SecretsManager instance (from bootstrap)
        cfg: SOCConfig instance
        consumer_group: Kafka consumer group (unique per detection engine)
        watermark: Watermark interval for late data handling
        topics: Kafka topics (comma-separated), defaults to "security-events"
        max_offsets_per_trigger: Backpressure control per trigger
        starting_offsets: "latest" or "earliest"
        include_kafka_metadata: Include Kafka partition/offset/timestamp columns

    Returns:
        Streaming DataFrame with normalized event columns and watermark applied
    """
    kafka_brokers = secrets_mgr.get("kafka_brokers")
    resolved_topics = topics or DEFAULT_TOPIC

    # Build base Kafka reader
    reader = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", kafka_brokers)
        .option("subscribe", resolved_topics)
        .option("kafka.group.id", consumer_group)
        .option("startingOffsets", starting_offsets)
        .option("maxOffsetsPerTrigger", max_offsets_per_trigger)
        .option("failOnDataLoss", "false")
        .option("kafka.session.timeout.ms", "60000")
        .option("kafka.request.timeout.ms", "40000")
        .option("kafka.max.poll.records", "10000")
        .option("kafka.fetch.max.bytes", "52428800")
    )

    # Apply SASL/SSL authentication if configured
    sasl_username = secrets_mgr.get_optional("kafka_sasl_username")
    sasl_password = secrets_mgr.get_optional("kafka_sasl_password")

    if sasl_username and sasl_password:
        mechanism = secrets_mgr.get_optional("kafka_sasl_mechanism") or "PLAIN"
        jaas_config = (
            "org.apache.kafka.common.security.plain.PlainLoginModule required "
            f'username="{sasl_username}" password="{sasl_password}";'
        )
        reader = (
            reader
            .option("kafka.security.protocol", "SASL_SSL")
            .option("kafka.sasl.mechanism", mechanism)
            .option("kafka.sasl.jaas.config", jaas_config)
        )

    # Load raw Kafka stream
    raw_stream = reader.load()

    # Parse JSON payload from Kafka value
    parsed = (
        raw_stream
        .selectExpr("CAST(value AS STRING) as json_payload",
                    "topic as _kafka_topic",
                    "partition as _kafka_partition",
                    "offset as _kafka_offset",
                    "timestamp as _kafka_timestamp")
        .withColumn("_parsed", from_json(col("json_payload"), ZEROBUS_EVENT_SCHEMA))
    )

    # Normalize into flat event columns
    normalized = (
        parsed
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
            _normalize_severity(col("_parsed.severity")).alias("severity"),
            col("_parsed.description").alias("description"),
            col("_parsed.raw_log").alias("raw_log"),
            *(_kafka_metadata_cols(parsed) if include_kafka_metadata else []),
        )
        # Drop events that failed to parse entirely
        .filter(col("event_type") != "unknown")
        # Apply watermark for stateful operations
        .withWatermark("timestamp", watermark)
    )

    logger.info(
        f"SDP stream created: brokers={kafka_brokers[:30]}..., "
        f"topics={resolved_topics}, group={consumer_group}, "
        f"watermark={watermark}, max_offsets={max_offsets_per_trigger}"
    )

    return normalized


def _normalize_severity(severity_col):
    """Normalize severity to valid enum values."""
    return (
        when(severity_col.isin(VALID_SEVERITIES), severity_col)
        .otherwise(lit("info"))
    )


def _kafka_metadata_cols(df):
    """Return Kafka metadata columns for debugging/audit."""
    return [
        col("_kafka_topic"),
        col("_kafka_partition"),
        col("_kafka_offset"),
        col("_kafka_timestamp"),
    ]


# COMMAND ----------

def create_sdp_stream_with_fallback(
    spark: SparkSession,
    secrets_mgr,
    cfg,
    consumer_group: str,
    watermark: str = "5 minutes",
    topics: Optional[str] = None,
    max_offsets_per_trigger: int = 50000,
) -> tuple:
    """
    Create SDP stream with automatic fallback to Delta table if Kafka is unavailable.

    Returns:
        Tuple of (streaming_df, source_type) where source_type is "kafka" or "delta"

    This provides graceful degradation: if ZeroBus is unreachable (e.g., maintenance),
    the detection engine falls back to reading from the events Delta table (higher latency
    but still functional).
    """
    try:
        stream = create_sdp_stream(
            spark, secrets_mgr, cfg,
            consumer_group=consumer_group,
            watermark=watermark,
            topics=topics,
            max_offsets_per_trigger=max_offsets_per_trigger,
        )
        return stream, "kafka"
    except Exception as e:
        logger.warning(
            f"ZeroBus/Kafka unavailable ({e}), falling back to Delta events table. "
            f"Detection latency will increase to 30-90 seconds."
        )
        from config import get_table_path
        events_table = get_table_path(cfg, "events")

        fallback_stream = (
            spark.readStream
            .format("delta")
            .option("ignoreChanges", "true")
            .option("maxFilesPerTrigger", 500)
            .table(events_table)
            .withWatermark("timestamp", watermark)
        )
        return fallback_stream, "delta"
