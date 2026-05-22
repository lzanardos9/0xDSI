# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 14 - Honeypot/Honeytoken Monitor
# MAGIC Monitors honeypot/honeytoken tables for unprocessed interactions.
# MAGIC High-fidelity detection (near-zero false positives). Internal IP = lateral movement.

# COMMAND ----------

import json
from datetime import datetime, timezone
from pyspark.sql import functions as F
from pyspark.sql.types import StringType
from ipaddress import ip_address, ip_network

# COMMAND ----------

# Configuration
AGENT_ID = "agent_14_honeypot"
INTERNAL_CIDRS = cfg.get("internal_cidrs", ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"])

honeypot_table = cfg.get_table_path("honeypot_interactions")
honeytoken_table = cfg.get_table_path("honeytoken_access")
alerts_table = cfg.get_table_path("alerts")

result = {"agent_id": AGENT_ID, "status": "success", "alerts_generated": 0, "interactions_processed": 0}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Unprocessed Interactions

# COMMAND ----------

mon.time("fetch_interactions")

honeypot_df = (
    spark.read.table(honeypot_table)
    .filter(F.col("processed") == False)
    .select("interaction_id", "honeypot_id", "source_ip", "destination_port",
            "protocol", "payload_summary", "timestamp", "honeypot_type")
)
honeypot_count = honeypot_df.count()

honeytoken_df = (
    spark.read.table(honeytoken_table)
    .filter(F.col("processed") == False)
    .select("access_id", "token_id", "token_type", "accessing_entity",
            "source_ip", "access_method", "timestamp", "file_path")
)
honeytoken_count = honeytoken_df.count()

mon.log_event("unprocessed_found", {"honeypot": honeypot_count, "honeytoken": honeytoken_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## UDF: Internal IP Detection

# COMMAND ----------

def is_internal_ip(ip_str):
    if not ip_str:
        return "False"
    try:
        ip = ip_address(ip_str)
        return str(any(ip in ip_network(cidr) for cidr in INTERNAL_CIDRS))
    except ValueError:
        return "False"

is_internal_udf = F.udf(is_internal_ip, StringType())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts for Honeypot Interactions

# COMMAND ----------

mon.time("generate_honeypot_alerts")

if honeypot_count > 0:
    honeypot_alerts_df = (
        honeypot_df
        .withColumn("is_internal", is_internal_udf(F.col("source_ip")))
        .withColumn(
            "severity",
            F.when(F.col("is_internal") == "True", F.lit("critical"))
            .otherwise(F.lit("high"))
        )
        .withColumn(
            "alert_type",
            F.when(F.col("is_internal") == "True", F.lit("lateral_movement_honeypot"))
            .otherwise(F.lit("external_honeypot_probe"))
        )
        .withColumn("alert_id", F.expr("uuid()"))
        .withColumn("created_at", F.current_timestamp())
        .withColumn("agent_id", F.lit(AGENT_ID))
        .withColumn(
            "description",
            F.concat(
                F.lit("Honeypot interaction detected: "),
                F.col("source_ip"), F.lit(" -> "),
                F.col("honeypot_type"), F.lit(":"),
                F.col("destination_port").cast("string")
            )
        )
        .select(
            "alert_id", "alert_type", "severity", "description",
            "source_ip", "honeypot_id", "created_at", "agent_id"
        )
    )

    honeypot_alerts_df.write.mode("append").saveAsTable(alerts_table)
    result["alerts_generated"] += honeypot_alerts_df.count()
    mon.log_event("honeypot_alerts_written", {"count": result["alerts_generated"]})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Alerts for Honeytoken Access

# COMMAND ----------

mon.time("generate_honeytoken_alerts")

if honeytoken_count > 0:
    honeytoken_alerts_df = (
        honeytoken_df
        .withColumn("is_internal", is_internal_udf(F.col("source_ip")))
        .withColumn("severity", F.lit("critical"))
        .withColumn("alert_type", F.lit("honeytoken_accessed"))
        .withColumn("alert_id", F.expr("uuid()"))
        .withColumn("created_at", F.current_timestamp())
        .withColumn("agent_id", F.lit(AGENT_ID))
        .withColumn(
            "description",
            F.concat(
                F.lit("Honeytoken accessed: "),
                F.col("token_type"), F.lit(" token '"),
                F.col("token_id"), F.lit("' by "),
                F.col("accessing_entity"), F.lit(" from "),
                F.col("source_ip")
            )
        )
        .select(
            "alert_id", "alert_type", "severity", "description",
            "source_ip", F.col("token_id").alias("honeypot_id"),
            "created_at", "agent_id"
        )
    )

    honeytoken_alerts_df.write.mode("append").saveAsTable(alerts_table)
    result["alerts_generated"] += honeytoken_alerts_df.count()
    mon.log_event("honeytoken_alerts_written", {"count": result["alerts_generated"]})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark Interactions as Processed (MERGE)

# COMMAND ----------

mon.time("mark_processed")

from delta.tables import DeltaTable

if honeypot_count > 0:
    honeypot_target = DeltaTable.forName(spark, honeypot_table)
    honeypot_target.alias("target").merge(
        honeypot_df.select("interaction_id").alias("source"),
        "target.interaction_id = source.interaction_id"
    ).whenMatchedUpdate(set={
        "processed": F.lit(True), "processed_at": F.current_timestamp()
    }).execute()

if honeytoken_count > 0:
    honeytoken_target = DeltaTable.forName(spark, honeytoken_table)
    honeytoken_target.alias("target").merge(
        honeytoken_df.select("access_id").alias("source"),
        "target.access_id = source.access_id"
    ).whenMatchedUpdate(set={
        "processed": F.lit(True), "processed_at": F.current_timestamp()
    }).execute()

result["interactions_processed"] = honeypot_count + honeytoken_count
mon.log_event("interactions_marked_processed", {"count": result["interactions_processed"]})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Complete

# COMMAND ----------

mon.log_complete(AGENT_ID, result)
dbutils.notebook.exit(json.dumps(result))
