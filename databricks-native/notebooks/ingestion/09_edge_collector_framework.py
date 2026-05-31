# Databricks notebook source
# MAGIC %md
# MAGIC # Edge Collector Ingestion Framework
# MAGIC
# MAGIC Receives OCSF-normalized events from the Edge Mesh fleet and writes to Delta Lake.
# MAGIC
# MAGIC ## Data Flow
# MAGIC ```
# MAGIC Edge Collectors → HTTPS/Kafka → This Notebook → Bronze Delta Table
# MAGIC                                       ↓
# MAGIC                           Entity Spine (auto-discovery)
# MAGIC                                       ↓
# MAGIC                           Telemetry Metrics (per-collector)
# MAGIC ```
# MAGIC
# MAGIC ## Modes
# MAGIC - **stream** - Structured Streaming from Kafka topic `edge-events`
# MAGIC - **batch** - Process batch uploads from disk buffer flush
# MAGIC - **replay** - Replay events from a specific collector within time range
# MAGIC - **metrics** - Compute and store ingestion metrics

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType,
    LongType, DoubleType, TimestampType, MapType, ArrayType
)

# COMMAND ----------

dbutils.widgets.text("mode", "stream", "Mode: stream | batch | replay | metrics")
dbutils.widgets.text("collector_id", "", "Filter by collector ID (optional)")
dbutils.widgets.text("replay_start", "", "Replay start time (ISO8601)")
dbutils.widgets.text("replay_end", "", "Replay end time (ISO8601)")

mode = dbutils.widgets.get("mode")
collector_id_filter = dbutils.widgets.get("collector_id")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema Definitions

# COMMAND ----------

OCSF_EVENT_SCHEMA = StructType([
    StructField("event_id", StringType(), False),
    StructField("collector_id", StringType(), False),
    StructField("dna_name", StringType(), False),
    StructField("site_name", StringType(), True),
    StructField("timestamp", TimestampType(), False),
    StructField("ingested_at", TimestampType(), False),
    StructField("event_class", IntegerType(), False),
    StructField("category_uid", IntegerType(), True),
    StructField("severity", IntegerType(), True),
    StructField("message", StringType(), True),
    StructField("src_endpoint_ip", StringType(), True),
    StructField("src_endpoint_port", IntegerType(), True),
    StructField("dst_endpoint_ip", StringType(), True),
    StructField("dst_endpoint_port", IntegerType(), True),
    StructField("actor_user_name", StringType(), True),
    StructField("actor_user_uid", StringType(), True),
    StructField("device_hostname", StringType(), True),
    StructField("device_ip", StringType(), True),
    StructField("process_name", StringType(), True),
    StructField("process_pid", IntegerType(), True),
    StructField("network_protocol", StringType(), True),
    StructField("http_url", StringType(), True),
    StructField("file_path", StringType(), True),
    StructField("file_hash_sha256", StringType(), True),
    StructField("finding_title", StringType(), True),
    StructField("finding_uid", StringType(), True),
    StructField("api_operation", StringType(), True),
    StructField("api_service_name", StringType(), True),
    StructField("cloud_region", StringType(), True),
    StructField("cloud_account_uid", StringType(), True),
    StructField("metadata_product_name", StringType(), True),
    StructField("metadata_event_code", StringType(), True),
    StructField("raw_event", StringType(), True),
    StructField("enrichment_tags", ArrayType(StringType()), True),
    StructField("ocsf_extensions", MapType(StringType(), StringType()), True),
])

# Table paths
bronze_events = get_table_path(cfg, "bronze_edge_events")
ingestion_metrics = get_table_path(cfg, "edge_ingestion_metrics")
entity_spine = get_table_path(cfg, "entity_spine")
deployments_table = get_table_path(cfg, "connector_deployments")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Ingestion (Kafka)

# COMMAND ----------

def start_streaming_ingestion():
    """
    Structured Streaming from Kafka topic where edge collectors publish events.
    Auto-scales with cluster, provides exactly-once via checkpointing.
    """
    kafka_bootstrap = cfg.get("kafka_bootstrap_servers", "kafka:9092")
    topic = cfg.get("edge_events_topic", "0xdsi.edge.events.ocsf")

    raw_stream = (
        spark.readStream
        .format("kafka")
        .option("kafka.bootstrap.servers", kafka_bootstrap)
        .option("subscribe", topic)
        .option("startingOffsets", "latest")
        .option("maxOffsetsPerTrigger", 500000)
        .option("kafka.security.protocol", "SASL_SSL")
        .load()
    )

    parsed_stream = (
        raw_stream
        .select(
            F.from_json(F.col("value").cast("string"), OCSF_EVENT_SCHEMA).alias("event"),
            F.col("timestamp").alias("kafka_timestamp"),
            F.col("partition"),
            F.col("offset"),
        )
        .select("event.*", "kafka_timestamp", "partition", "offset")
        .withColumn("ingestion_lag_ms",
            (F.col("kafka_timestamp").cast("long") - F.col("timestamp").cast("long")) * 1000
        )
        .withColumn("ingestion_date", F.to_date("timestamp"))
        .withColumn("ingestion_hour", F.hour("timestamp"))
    )

    checkpoint_path = f"{cfg['checkpoint_base']}/edge_collector_ingestion"

    query = (
        parsed_stream.writeStream
        .format("delta")
        .outputMode("append")
        .option("checkpointLocation", checkpoint_path)
        .partitionBy("ingestion_date", "dna_name")
        .trigger(processingTime="10 seconds")
        .foreachBatch(lambda df, epoch_id: _process_micro_batch(df, epoch_id))
        .start(bronze_events)
    )

    print(f"[STREAMING] Edge collector ingestion started")
    print(f"  Topic: {topic}")
    print(f"  Checkpoint: {checkpoint_path}")
    print(f"  Partitions: ingestion_date, dna_name")

    return query


def _process_micro_batch(batch_df, epoch_id):
    """Process each micro-batch: write to bronze, extract entities, compute metrics."""
    if batch_df.isEmpty():
        return

    batch_count = batch_df.count()

    (
        batch_df.write
        .format("delta")
        .mode("append")
        .partitionBy("ingestion_date", "dna_name")
        .save(bronze_events)
    )

    _auto_discover_entities(batch_df)
    _compute_batch_metrics(batch_df, epoch_id, batch_count)

    print(f"[BATCH {epoch_id}] Processed {batch_count} events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity Auto-Discovery

# COMMAND ----------

def _auto_discover_entities(df):
    """Extract unique users, devices, and IPs from ingested events into entity spine."""

    users_df = (
        df.filter(F.col("actor_user_name").isNotNull())
        .select(
            F.col("actor_user_name").alias("entity_name"),
            F.col("actor_user_uid").alias("entity_uid"),
            F.lit("user").alias("entity_type"),
            F.col("dna_name").alias("first_seen_source"),
            F.col("timestamp").alias("first_seen_at"),
        )
        .distinct()
    )

    devices_df = (
        df.filter(F.col("device_hostname").isNotNull())
        .select(
            F.col("device_hostname").alias("entity_name"),
            F.col("device_ip").alias("entity_uid"),
            F.lit("device").alias("entity_type"),
            F.col("dna_name").alias("first_seen_source"),
            F.col("timestamp").alias("first_seen_at"),
        )
        .distinct()
    )

    ips_df = (
        df.filter(
            (F.col("src_endpoint_ip").isNotNull()) &
            (~F.col("src_endpoint_ip").startswith("10.")) &
            (~F.col("src_endpoint_ip").startswith("172.16.")) &
            (~F.col("src_endpoint_ip").startswith("192.168.")) &
            (F.col("src_endpoint_ip") != "127.0.0.1")
        )
        .select(
            F.col("src_endpoint_ip").alias("entity_name"),
            F.col("src_endpoint_ip").alias("entity_uid"),
            F.lit("ip_address").alias("entity_type"),
            F.col("dna_name").alias("first_seen_source"),
            F.col("timestamp").alias("first_seen_at"),
        )
        .distinct()
    )

    entities = users_df.union(devices_df).union(ips_df)

    if entities.isEmpty():
        return

    entities.createOrReplaceTempView("new_entities")
    spark.sql(f"""
        MERGE INTO {entity_spine} AS target
        USING new_entities AS source
        ON target.entity_uid = source.entity_uid AND target.entity_type = source.entity_type
        WHEN NOT MATCHED THEN INSERT (
            entity_id, entity_name, entity_uid, entity_type,
            first_seen_source, first_seen_at, last_seen_at, status
        ) VALUES (
            uuid(), source.entity_name, source.entity_uid, source.entity_type,
            source.first_seen_source, source.first_seen_at, source.first_seen_at, 'active'
        )
        WHEN MATCHED THEN UPDATE SET
            target.last_seen_at = source.first_seen_at
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ingestion Metrics

# COMMAND ----------

def _compute_batch_metrics(df, epoch_id, total_count):
    """Compute per-collector ingestion metrics for observability."""

    metrics_df = (
        df.groupBy("collector_id", "dna_name", "site_name")
        .agg(
            F.count("*").alias("event_count"),
            F.avg("ingestion_lag_ms").alias("avg_lag_ms"),
            F.max("ingestion_lag_ms").alias("max_lag_ms"),
            F.min("timestamp").alias("window_start"),
            F.max("timestamp").alias("window_end"),
            F.countDistinct("src_endpoint_ip").alias("unique_sources"),
            F.countDistinct("actor_user_name").alias("unique_users"),
            F.sum(F.when(F.col("severity") >= 7, 1).otherwise(0)).alias("high_severity_count"),
        )
        .withColumn("epoch_id", F.lit(epoch_id))
        .withColumn("computed_at", F.current_timestamp())
        .withColumn("events_per_second",
            F.col("event_count") / F.greatest(
                (F.col("window_end").cast("long") - F.col("window_start").cast("long")),
                F.lit(1)
            )
        )
    )

    (
        metrics_df.write
        .format("delta")
        .mode("append")
        .save(ingestion_metrics)
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Ingestion (disk buffer uploads)

# COMMAND ----------

def batch_ingest(path: str = None):
    """Process batch uploads from edge collectors that flushed disk buffers."""
    upload_path = path or f"{cfg['landing_zone']}/edge_uploads/"

    raw_df = (
        spark.read
        .format("json")
        .schema(OCSF_EVENT_SCHEMA)
        .load(upload_path)
    )

    if raw_df.isEmpty():
        print("[BATCH] No files to process")
        return {"processed": 0}

    enriched = (
        raw_df
        .withColumn("ingested_at", F.current_timestamp())
        .withColumn("ingestion_date", F.to_date("timestamp"))
        .withColumn("ingestion_hour", F.hour("timestamp"))
        .withColumn("ingestion_lag_ms",
            (F.current_timestamp().cast("long") - F.col("timestamp").cast("long")) * 1000
        )
    )

    count = enriched.count()

    (
        enriched.write
        .format("delta")
        .mode("append")
        .partitionBy("ingestion_date", "dna_name")
        .save(bronze_events)
    )

    _auto_discover_entities(enriched)

    dbutils.fs.mv(upload_path, f"{cfg['archive_zone']}/edge_uploads/{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}/", True)

    print(f"[BATCH] Processed {count} events from disk buffer uploads")
    return {"processed": count}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Replay

# COMMAND ----------

def replay_events():
    """Replay events for a specific collector within a time range for investigation."""
    replay_start = dbutils.widgets.get("replay_start")
    replay_end = dbutils.widgets.get("replay_end")

    if not collector_id_filter or not replay_start or not replay_end:
        return {"error": "collector_id, replay_start, and replay_end are required"}

    replayed = spark.sql(f"""
        SELECT * FROM {bronze_events}
        WHERE collector_id = '{collector_id_filter}'
          AND timestamp BETWEEN '{replay_start}' AND '{replay_end}'
        ORDER BY timestamp ASC
    """)

    count = replayed.count()

    replay_table = get_table_path(cfg, "edge_replay_events")
    (
        replayed
        .withColumn("replayed_at", F.current_timestamp())
        .withColumn("replay_reason", F.lit("manual_investigation"))
        .write
        .format("delta")
        .mode("append")
        .save(replay_table)
    )

    print(f"[REPLAY] Replayed {count} events for collector {collector_id_filter}")
    return {"replayed": count, "collector_id": collector_id_filter}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Metrics Dashboard Queries

# COMMAND ----------

def compute_fleet_metrics():
    """Compute fleet-wide ingestion metrics for the observability dashboard."""

    current_throughput = spark.sql(f"""
        SELECT
            m.collector_id, m.dna_name, m.site_name, d.hostname,
            m.event_count, m.events_per_second, m.avg_lag_ms,
            m.unique_sources, m.high_severity_count, m.computed_at
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY collector_id ORDER BY computed_at DESC) as rn
            FROM {ingestion_metrics}
            WHERE computed_at > current_timestamp() - INTERVAL 10 MINUTES
        ) m
        JOIN {deployments_table} d ON m.collector_id = d.collector_id
        WHERE m.rn = 1
        ORDER BY m.events_per_second DESC
    """)

    fleet_agg = spark.sql(f"""
        SELECT
            COUNT(DISTINCT collector_id) as active_collectors,
            SUM(event_count) as total_events_10min,
            AVG(avg_lag_ms) as fleet_avg_lag_ms,
            MAX(max_lag_ms) as fleet_max_lag_ms,
            SUM(high_severity_count) as total_high_severity,
            SUM(unique_sources) as total_unique_sources
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY collector_id ORDER BY computed_at DESC) as rn
            FROM {ingestion_metrics}
            WHERE computed_at > current_timestamp() - INTERVAL 10 MINUTES
        ) WHERE rn = 1
    """)

    hourly_volume = spark.sql(f"""
        SELECT
            date_trunc('hour', computed_at) as hour,
            SUM(event_count) as events,
            AVG(avg_lag_ms) as avg_lag,
            COUNT(DISTINCT collector_id) as active_collectors
        FROM {ingestion_metrics}
        WHERE computed_at > current_timestamp() - INTERVAL 24 HOURS
        GROUP BY 1
        ORDER BY 1
    """)

    dna_breakdown = spark.sql(f"""
        SELECT
            dna_name,
            COUNT(DISTINCT collector_id) as collectors,
            SUM(event_count) as total_events,
            AVG(events_per_second) as avg_eps,
            AVG(avg_lag_ms) as avg_lag_ms
        FROM (
            SELECT *, ROW_NUMBER() OVER (PARTITION BY collector_id ORDER BY computed_at DESC) as rn
            FROM {ingestion_metrics}
            WHERE computed_at > current_timestamp() - INTERVAL 10 MINUTES
        ) WHERE rn = 1
        GROUP BY dna_name
        ORDER BY total_events DESC
    """)

    return {
        "current_throughput": current_throughput,
        "fleet_agg": fleet_agg,
        "hourly_volume": hourly_volume,
        "dna_breakdown": dna_breakdown,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

if mode == "stream":
    query = start_streaming_ingestion()
    query.awaitTermination()
elif mode == "batch":
    result = batch_ingest()
    print(json.dumps(result, default=str))
elif mode == "replay":
    result = replay_events()
    print(json.dumps(result, default=str))
elif mode == "metrics":
    metrics = compute_fleet_metrics()
    metrics["current_throughput"].display()
    metrics["fleet_agg"].display()
    metrics["hourly_volume"].display()
    metrics["dna_breakdown"].display()
else:
    print(f"Unknown mode: {mode}")

dbutils.notebook.exit(json.dumps({"mode": mode, "status": "completed"}, default=str))
