# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 05: Streaming Correlation Engine
# MAGIC Real-time CEP (Complex Event Processing) using Spark Structured Streaming.
# MAGIC Evaluates correlation rules against event windows.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/correlation", "Checkpoint")

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
# MAGIC ## Load Active Correlation Rules

# COMMAND ----------

rules_df = spark.table("correlation_rules").filter(col("enabled") == True).collect()
print(f"Loaded {len(rules_df)} active correlation rules")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream with Watermark

# COMMAND ----------

events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table("events")
    .withWatermark("timestamp", "5 minutes")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threshold-Based Correlation

# COMMAND ----------

threshold_rules = [r for r in rules_df if r.rule_type == "threshold"]

threshold_correlations = (
    events_stream
    .groupBy(
        window(col("timestamp"), "5 minutes", "1 minute"),
        col("event_type"),
        col("source_ip")
    )
    .agg(
        count("*").alias("event_count"),
        collect_list("id").alias("event_ids"),
        max("severity").alias("max_severity")
    )
    .filter(col("event_count") >= 5)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence-Based Correlation (Multi-stage attacks)

# COMMAND ----------

sequence_events = (
    events_stream
    .filter(col("event_type").isin(
        "authentication_failure", "privilege_escalation",
        "lateral_movement", "data_exfiltration"
    ))
    .groupBy(
        window(col("timestamp"), "30 minutes", "5 minutes"),
        col("source_ip")
    )
    .agg(
        collect_set("event_type").alias("attack_stages"),
        count("*").alias("event_count"),
        collect_list("id").alias("event_ids")
    )
    .filter(size(col("attack_stages")) >= 3)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Correlation Matches

# COMMAND ----------

def write_correlation_matches(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    matches = (
        batch_df
        .withColumn("id", expr("uuid()"))
        .withColumn("matched_at", current_timestamp())
        .withColumn("score", col("event_count").cast("double") / lit(10.0))
        .withColumn("context", map_from_arrays(
            array(lit("source_ip"), lit("event_count")),
            array(col("source_ip"), col("event_count").cast("string"))
        ))
        .select("id", "event_ids", "matched_at", "score", "context")
        .withColumn("rule_id", lit("auto-threshold"))
    )
    matches.write.mode("append").saveAsTable("cep_pattern_matches")

    alert_matches = batch_df.filter(col("event_count") >= 10)
    if alert_matches.count() > 0:
        alerts = (
            alert_matches
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(lit("Correlation: "), col("event_type"), lit(" surge from "), col("source_ip")))
            .withColumn("description", concat(lit("Detected "), col("event_count"), lit(" events in 5min window")))
            .withColumn("severity", when(col("event_count") >= 50, lit("critical")).otherwise(lit("high")))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("correlation_engine"))
            .withColumn("confidence_score", least(col("event_count").cast("double") / lit(100.0), lit(1.0)))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status", "source", "confidence_score", "created_at")
        )
        alerts.write.mode("append").saveAsTable("alerts")

threshold_query = (
    threshold_correlations.writeStream
    .foreachBatch(write_correlation_matches)
    .option("checkpointLocation", f"{checkpoint_path}/threshold")
    .trigger(processingTime="30 seconds")
    .start()
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Sequence Attack Detections

# COMMAND ----------

def write_sequence_detections(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    alerts = (
        batch_df
        .withColumn("id", expr("uuid()"))
        .withColumn("title", concat(lit("Multi-Stage Attack: "), col("source_ip")))
        .withColumn("description", concat(
            lit("Detected attack chain: "),
            array_join(col("attack_stages"), " -> ")
        ))
        .withColumn("severity", lit("critical"))
        .withColumn("status", lit("new"))
        .withColumn("source", lit("sequence_correlation"))
        .withColumn("mitre_tactic", lit("TA0001,TA0004,TA0008,TA0010"))
        .withColumn("confidence_score", size(col("attack_stages")).cast("double") / lit(4.0))
        .withColumn("created_at", current_timestamp())
        .withColumn("event_ids", col("event_ids"))
        .select("id", "title", "description", "severity", "status", "source",
                "mitre_tactic", "confidence_score", "event_ids", "created_at")
    )
    alerts.write.mode("append").saveAsTable("alerts")

sequence_query = (
    sequence_events.writeStream
    .foreachBatch(write_sequence_detections)
    .option("checkpointLocation", f"{checkpoint_path}/sequence")
    .trigger(processingTime="60 seconds")
    .start()
)

# COMMAND ----------

print("Correlation engine running:")
print(f"  - Threshold detection (5min windows)")
print(f"  - Sequence detection (30min windows)")
print(f"  - {len(rules_df)} rules loaded")
