# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 12: Threat Intelligence Matching
# MAGIC Matches incoming events against IOC feeds, generates alerts for matches.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("checkpoint_path", "/tmp/checkpoints/threat_intel", "Checkpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Active IOCs

# COMMAND ----------

active_iocs = spark.table("ioc_entries").filter(
    (col("expiry").isNull()) | (col("expiry") > current_timestamp())
).cache()

ip_iocs = active_iocs.filter(col("indicator_type") == "ip").select("value", "threat_type", "confidence")
domain_iocs = active_iocs.filter(col("indicator_type") == "domain").select("value", "threat_type", "confidence")
hash_iocs = active_iocs.filter(col("indicator_type").isin("sha256", "md5", "sha1")).select("value", "threat_type", "confidence")

print(f"Active IOCs loaded: {active_iocs.count()}")
print(f"  IPs: {ip_iocs.count()}, Domains: {domain_iocs.count()}, Hashes: {hash_iocs.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming IOC Match

# COMMAND ----------

events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table("events")
    .filter(col("timestamp") > current_timestamp() - expr("INTERVAL 1 HOUR"))
)

ip_matches = (
    events_stream
    .join(ip_iocs, events_stream.source_ip == ip_iocs.value, "inner")
    .withColumn("match_type", lit("source_ip"))
    .withColumn("matched_indicator", col("source_ip"))
    .select("id", "match_type", "matched_indicator", "threat_type", "confidence",
            "source_ip", "user_id", "event_type", "timestamp")
)

dest_ip_matches = (
    events_stream
    .join(ip_iocs, events_stream.dest_ip == ip_iocs.value, "inner")
    .withColumn("match_type", lit("dest_ip"))
    .withColumn("matched_indicator", col("dest_ip"))
    .select("id", "match_type", "matched_indicator", "threat_type", "confidence",
            "source_ip", "user_id", "event_type", "timestamp")
)

all_matches = ip_matches.union(dest_ip_matches)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Threat Intel Alerts

# COMMAND ----------

def write_ti_alerts(batch_df, batch_id):
    if batch_df.count() == 0:
        return

    alerts = (
        batch_df
        .withColumn("alert_id", expr("uuid()"))
        .withColumn("title", concat(
            lit("Threat Intel Match: "), col("threat_type"),
            lit(" ("), col("matched_indicator"), lit(")")
        ))
        .withColumn("description", concat(
            lit("IOC matched on "), col("match_type"),
            lit(". Event type: "), col("event_type"),
            lit(". Confidence: "), col("confidence")
        ))
        .withColumn("severity",
            when(col("confidence") >= 0.9, lit("critical"))
            .when(col("confidence") >= 0.7, lit("high"))
            .otherwise(lit("medium"))
        )
        .withColumn("status", lit("new"))
        .withColumn("source", lit("threat_intel_matching"))
        .withColumn("confidence_score", col("confidence"))
        .withColumn("created_at", current_timestamp())
        .withColumnRenamed("alert_id", "id")
        .select("id", "title", "description", "severity", "status",
                "source", "confidence_score", "created_at")
    )
    alerts.write.mode("append").saveAsTable("alerts")

ti_query = (
    all_matches.writeStream
    .foreachBatch(write_ti_alerts)
    .option("checkpointLocation", f"{checkpoint_path}/ti_match")
    .trigger(processingTime="30 seconds")
    .start()
)

# COMMAND ----------

print("Threat intelligence matching engine running")
print("Matching: source_ip, dest_ip against known IOCs")
