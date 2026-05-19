# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Temporal Window Correlator
# MAGIC Detects brute force, credential stuffing, beaconing, scanning, slow exfiltration.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/temporal", "Checkpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream

# COMMAND ----------

events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table("events")
    .withWatermark("timestamp", "10 minutes")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 1: Brute Force Detection

# COMMAND ----------

brute_force = (
    events_stream
    .filter(col("event_type").isin("authentication_failure", "login_failed"))
    .groupBy(
        window(col("timestamp"), "5 minutes"),
        col("source_ip"),
        col("username")
    )
    .agg(
        count("*").alias("failure_count"),
        countDistinct("username").alias("unique_targets")
    )
    .filter(col("failure_count") >= 10)
    .withColumn("detection_type", lit("brute_force"))
    .withColumn("severity",
        when(col("failure_count") >= 50, lit("critical"))
        .when(col("failure_count") >= 20, lit("high"))
        .otherwise(lit("medium"))
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 2: Credential Stuffing

# COMMAND ----------

credential_stuffing = (
    events_stream
    .filter(col("event_type").isin("authentication_failure", "login_failed"))
    .groupBy(
        window(col("timestamp"), "10 minutes"),
        col("source_ip")
    )
    .agg(
        count("*").alias("attempt_count"),
        countDistinct("username").alias("unique_usernames"),
        countDistinct("dest_ip").alias("unique_targets")
    )
    .filter(
        (col("unique_usernames") >= 5) &
        (col("attempt_count") >= 20)
    )
    .withColumn("detection_type", lit("credential_stuffing"))
    .withColumn("severity", lit("critical"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 3: Beacon Detection (Periodic C2 Callbacks)

# COMMAND ----------

beacon_detection = (
    events_stream
    .filter(col("event_type").isin("dns_query", "http_request", "network_connection"))
    .groupBy(
        window(col("timestamp"), "1 hour"),
        col("source_ip"),
        col("dest_ip")
    )
    .agg(
        count("*").alias("connection_count"),
        collect_list("timestamp").alias("timestamps")
    )
    .filter(col("connection_count") >= 10)
    .withColumn("detection_type", lit("beacon"))
    .withColumn("severity", lit("high"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pattern 4: Port Scanning

# COMMAND ----------

port_scanning = (
    events_stream
    .filter(col("event_type").isin("network_connection", "port_scan", "connection_attempt"))
    .groupBy(
        window(col("timestamp"), "5 minutes"),
        col("source_ip")
    )
    .agg(
        countDistinct("dest_ip").alias("unique_destinations"),
        count("*").alias("connection_count")
    )
    .filter(col("unique_destinations") >= 20)
    .withColumn("detection_type", lit("port_scan"))
    .withColumn("severity",
        when(col("unique_destinations") >= 100, lit("critical"))
        .otherwise(lit("high"))
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Detections

# COMMAND ----------

def write_temporal_detections(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    alerts = (
        batch_df
        .withColumn("id", expr("uuid()"))
        .withColumn("title", concat(
            lit("Temporal Detection: "), col("detection_type"),
            lit(" from "), col("source_ip")
        ))
        .withColumn("description", concat(
            lit("Pattern: "), col("detection_type"),
            lit(". Source: "), col("source_ip")
        ))
        .withColumn("status", lit("new"))
        .withColumn("source", lit("temporal_window_correlator"))
        .withColumn("confidence_score", lit(0.85))
        .withColumn("created_at", current_timestamp())
        .select("id", "title", "description", "severity", "status",
                "source", "confidence_score", "created_at")
    )
    alerts.write.mode("append").saveAsTable("alerts")

# Write all patterns
for pattern_name, pattern_df in [
    ("brute_force", brute_force),
    ("credential_stuffing", credential_stuffing),
    ("beacon", beacon_detection),
    ("port_scan", port_scanning)
]:
    (pattern_df.writeStream
        .foreachBatch(write_temporal_detections)
        .option("checkpointLocation", f"{checkpoint_path}/{pattern_name}")
        .trigger(processingTime="30 seconds")
        .start())

print("Temporal window correlator running: brute_force, credential_stuffing, beacon, port_scan")
