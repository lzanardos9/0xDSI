# Databricks notebook source
# MAGIC %md
# MAGIC # 02 - Temporal Window Correlator
# MAGIC
# MAGIC Detects attack patterns that span specific time windows using
# MAGIC sliding/tumbling/session windows with watermarks.
# MAGIC
# MAGIC **Patterns Detected:**
# MAGIC - Brute force (N failures in M minutes)
# MAGIC - Credential stuffing (distributed login attempts)
# MAGIC - Beacon detection (periodic callbacks to C2)
# MAGIC - Scan detection (port/host scanning)
# MAGIC - Slow exfiltration (consistent small transfers)
# MAGIC
# MAGIC **Input:** `{catalog}.{schema}.enriched_events`
# MAGIC **Output:** `{catalog}.{schema}.temporal_detections`

# COMMAND ----------

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("checkpoint_path", "")
dbutils.widgets.text("processing_time", "30 seconds")
dbutils.widgets.text("watermark_delay", "5 minutes")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/temporal"
processing_time = dbutils.widgets.get("processing_time")
watermark_delay = dbutils.widgets.get("watermark_delay")

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, sum as spark_sum, avg, stddev,
    window, session_window, current_timestamp, lit, when,
    collect_list, first, last, min as spark_min, max as spark_max,
    expr, date_format, array_distinct, size
)
from pyspark.sql.types import *
from datetime import datetime
import uuid

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Output Table

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.temporal_detections (
        detection_id STRING NOT NULL,
        detection_type STRING NOT NULL,
        severity STRING NOT NULL,
        entity_key STRING,
        entity_value STRING,
        window_start TIMESTAMP,
        window_end TIMESTAMP,
        event_count BIGINT,
        distinct_targets BIGINT,
        description STRING,
        evidence MAP<STRING, STRING>,
        mitre_technique STRING,
        confidence DOUBLE,
        created_at TIMESTAMP,
        partition_date STRING
    )
    USING DELTA
    PARTITIONED BY (partition_date)
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enriched Events Stream with Watermark

# COMMAND ----------

enriched_stream = (
    spark.readStream
    .format("delta")
    .option("maxFilesPerTrigger", 100)
    .table(f"{catalog}.{schema}.enriched_events")
    .withWatermark("time", watermark_delay)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 1: Brute Force Attack

# COMMAND ----------

# Brute force: >10 auth failures from same source in 5 minutes
brute_force = (
    enriched_stream
    .filter(
        (col("type_name").rlike("(?i)auth|login")) &
        (col("status_id") == 2)  # Failure
    )
    .groupBy(
        window(col("time"), "5 minutes", "1 minute"),
        col("src_ip"),
        col("dst_ip"),
    )
    .agg(
        count("*").alias("failure_count"),
        countDistinct("actor_user_id").alias("distinct_users"),
        collect_list("actor_user_id").alias("targeted_users"),
        spark_min("time").alias("first_event"),
        spark_max("time").alias("last_event"),
    )
    .filter(col("failure_count") >= 10)
    .select(
        expr("uuid()").alias("detection_id"),
        lit("brute_force").alias("detection_type"),
        when(col("failure_count") >= 50, lit("critical"))
        .when(col("failure_count") >= 20, lit("high"))
        .otherwise(lit("medium")).alias("severity"),
        lit("src_ip").alias("entity_key"),
        col("src_ip").alias("entity_value"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        col("failure_count").alias("event_count"),
        col("distinct_users").alias("distinct_targets"),
        expr("""
            concat('Brute force: ', failure_count, ' auth failures from ', src_ip,
                   ' targeting ', distinct_users, ' users in 5 min window')
        """).alias("description"),
        expr("""
            map('source_ip', src_ip, 'target_ip', dst_ip,
                'failure_count', CAST(failure_count AS STRING),
                'distinct_users', CAST(distinct_users AS STRING))
        """).alias("evidence"),
        lit("T1110").alias("mitre_technique"),
        (col("failure_count").cast("double") / lit(100.0)).alias("confidence"),
        current_timestamp().alias("created_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 2: Port Scanning

# COMMAND ----------

port_scan = (
    enriched_stream
    .filter(
        (col("category_uid") == 4) &  # Network activity
        (col("dst_port").isNotNull())
    )
    .groupBy(
        window(col("time"), "2 minutes"),
        col("src_ip"),
        col("dst_ip"),
    )
    .agg(
        countDistinct("dst_port").alias("distinct_ports"),
        count("*").alias("connection_count"),
        collect_list("dst_port").alias("ports_accessed"),
    )
    .filter(col("distinct_ports") >= 20)
    .select(
        expr("uuid()").alias("detection_id"),
        lit("port_scan").alias("detection_type"),
        when(col("distinct_ports") >= 100, lit("high"))
        .otherwise(lit("medium")).alias("severity"),
        lit("src_ip").alias("entity_key"),
        col("src_ip").alias("entity_value"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        col("connection_count").alias("event_count"),
        col("distinct_ports").alias("distinct_targets"),
        expr("""
            concat('Port scan: ', src_ip, ' → ', dst_ip, ' scanned ',
                   distinct_ports, ' ports in 2 min')
        """).alias("description"),
        expr("""
            map('source_ip', src_ip, 'target_ip', dst_ip,
                'distinct_ports', CAST(distinct_ports AS STRING))
        """).alias("evidence"),
        lit("T1046").alias("mitre_technique"),
        lit(0.85).alias("confidence"),
        current_timestamp().alias("created_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 3: Beacon Detection (Periodic C2 Communication)

# COMMAND ----------

# Detect periodic communication patterns (beaconing)
beacon_candidates = (
    enriched_stream
    .filter(
        (col("category_uid") == 4) &  # Network activity
        (col("dst_ip").isNotNull()) &
        (col("bytes_out").isNotNull())
    )
    .groupBy(
        window(col("time"), "1 hour"),
        col("src_ip"),
        col("dst_ip"),
        col("dst_port"),
    )
    .agg(
        count("*").alias("connection_count"),
        spark_sum("bytes_out").alias("total_bytes"),
        avg("bytes_out").alias("avg_bytes"),
        stddev("bytes_out").alias("stddev_bytes"),
    )
    .filter(
        (col("connection_count") >= 10) &
        # Low variance in packet size suggests automation
        (col("stddev_bytes") < col("avg_bytes") * 0.2)
    )
    .select(
        expr("uuid()").alias("detection_id"),
        lit("beacon_detection").alias("detection_type"),
        lit("high").alias("severity"),
        lit("src_ip").alias("entity_key"),
        col("src_ip").alias("entity_value"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        col("connection_count").alias("event_count"),
        lit(1).cast("long").alias("distinct_targets"),
        expr("""
            concat('Possible beacon: ', src_ip, ' → ', dst_ip, ':', dst_port,
                   ' (', connection_count, ' connections, avg ', CAST(ROUND(avg_bytes) AS INT),
                   'B ± ', CAST(ROUND(stddev_bytes) AS INT), 'B)')
        """).alias("description"),
        expr("""
            map('source_ip', src_ip, 'dest_ip', dst_ip, 'dest_port', CAST(dst_port AS STRING),
                'connections', CAST(connection_count AS STRING),
                'total_bytes', CAST(total_bytes AS STRING),
                'byte_variance', CAST(ROUND(stddev_bytes / avg_bytes, 3) AS STRING))
        """).alias("evidence"),
        lit("T1071").alias("mitre_technique"),
        lit(0.7).alias("confidence"),
        current_timestamp().alias("created_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 4: Data Exfiltration (Large Outbound Transfers)

# COMMAND ----------

exfil_detection = (
    enriched_stream
    .filter(
        (col("bytes_out").isNotNull()) &
        (col("bytes_out") > 0) &
        (col("dst_ioc_match") == False)  # Exclude known-bad (handled elsewhere)
    )
    .groupBy(
        window(col("time"), "15 minutes"),
        col("actor_user_id"),
        col("dst_ip"),
    )
    .agg(
        spark_sum("bytes_out").alias("total_bytes_out"),
        count("*").alias("transfer_count"),
        countDistinct("resource_name").alias("distinct_resources"),
    )
    .filter(
        (col("total_bytes_out") > 104857600) &  # > 100MB in 15 min
        (col("transfer_count") > 5)
    )
    .select(
        expr("uuid()").alias("detection_id"),
        lit("data_exfiltration").alias("detection_type"),
        when(col("total_bytes_out") > 1073741824, lit("critical"))  # > 1GB
        .otherwise(lit("high")).alias("severity"),
        lit("actor_user_id").alias("entity_key"),
        col("actor_user_id").alias("entity_value"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        col("transfer_count").alias("event_count"),
        col("distinct_resources").alias("distinct_targets"),
        expr("""
            concat('Possible exfiltration: user ', actor_user_id, ' transferred ',
                   CAST(ROUND(total_bytes_out / 1048576) AS INT), 'MB to ', dst_ip,
                   ' (', transfer_count, ' transfers, ', distinct_resources, ' resources)')
        """).alias("description"),
        expr("""
            map('user', actor_user_id, 'dest_ip', dst_ip,
                'total_mb', CAST(ROUND(total_bytes_out / 1048576) AS STRING),
                'transfers', CAST(transfer_count AS STRING))
        """).alias("evidence"),
        lit("T1048").alias("mitre_technique"),
        lit(0.75).alias("confidence"),
        current_timestamp().alias("created_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection 5: Credential Stuffing (Distributed Source)

# COMMAND ----------

credential_stuffing = (
    enriched_stream
    .filter(
        (col("type_name").rlike("(?i)auth|login")) &
        (col("status_id") == 2)  # Failure
    )
    .groupBy(
        window(col("time"), "10 minutes"),
        col("actor_user_id"),
    )
    .agg(
        count("*").alias("failure_count"),
        countDistinct("src_ip").alias("distinct_sources"),
        collect_list("src_ip").alias("source_ips"),
        countDistinct("src_geo_country").alias("distinct_countries"),
    )
    .filter(
        (col("distinct_sources") >= 5) &  # Multiple sources
        (col("failure_count") >= 10)
    )
    .select(
        expr("uuid()").alias("detection_id"),
        lit("credential_stuffing").alias("detection_type"),
        lit("high").alias("severity"),
        lit("actor_user_id").alias("entity_key"),
        col("actor_user_id").alias("entity_value"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        col("failure_count").alias("event_count"),
        col("distinct_sources").alias("distinct_targets"),
        expr("""
            concat('Credential stuffing: ', failure_count, ' failures for user ',
                   actor_user_id, ' from ', distinct_sources, ' IPs across ',
                   distinct_countries, ' countries')
        """).alias("description"),
        expr("""
            map('user', actor_user_id,
                'distinct_sources', CAST(distinct_sources AS STRING),
                'distinct_countries', CAST(distinct_countries AS STRING))
        """).alias("evidence"),
        lit("T1110.004").alias("mitre_technique"),
        lit(0.85).alias("confidence"),
        current_timestamp().alias("created_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Union All Detections & Write

# COMMAND ----------

from functools import reduce

all_detections = reduce(
    lambda a, b: a.unionByName(b),
    [brute_force, port_scan, beacon_candidates, exfil_detection, credential_stuffing]
)

query = (
    all_detections
    .writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", checkpoint_path)
    .trigger(processingTime=processing_time)
    .queryName("temporal_correlation")
    .toTable(f"{catalog}.{schema}.temporal_detections")
)

print(f"Temporal correlator started: {query.id}")
print("Active detections: brute_force, port_scan, beacon, exfiltration, credential_stuffing")
