# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 05: Sage (Deep Enrichment)
# MAGIC
# MAGIC Enriches alerts with threat intel cross-referencing, asset context, geo-IP,
# MAGIC network flow analysis, and LLM-powered intelligent summarization.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("sage_enrichment")

# COMMAND ----------

dbutils.widgets.text("batch_size", "30", "Max alerts per run")
dbutils.widgets.text("lookback_hours", "1", "Alert window")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")
ioc_table = cfg.get_table_path("ioc_entries")
assets_table = cfg.get_table_path("asset_registry")
events_table = cfg.get_table_path("events")
enrichments_table = cfg.get_table_path("sage_enrichments")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {enrichments_table} (
        id STRING, alert_id STRING, threat_intel_summary STRING,
        asset_criticality STRING, geo_context STRING,
        network_flow_summary STRING, llm_narrative STRING,
        risk_adjustment INT, agent_name STRING, enriched_at TIMESTAMP
    ) USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Fetch unenriched alerts
alerts = spark.sql(f"""
    SELECT a.* FROM {alerts_table} a
    LEFT JOIN {enrichments_table} e ON a.id = e.alert_id
    WHERE a.status IN ('new', 'in_progress')
      AND a.created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
      AND e.alert_id IS NULL
    ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
    LIMIT {batch_size}
""").collect()

mon.log_event("alerts_fetched", {"count": len(alerts)})

if not alerts:
    mon.log_complete(details={"status": "idle"})
    dbutils.notebook.exit('{"status": "idle"}')

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enrichment Pipeline

# COMMAND ----------

results = []

with mon.time("sage_enrichment"):
    for alert in alerts:
        try:
            source_ip = getattr(alert, "source_ip", None)
            dest_ip = getattr(alert, "dest_ip", None)
            hostname = getattr(alert, "hostname", None)

            # Threat Intel lookup (safe)
            ips_to_check = [ip for ip in [source_ip, dest_ip] if ip]
            ti_summary = "No matches"
            if ips_to_check:
                ti_query = qb().select("value, threat_type, confidence").from_table(ioc_table).where_in("value", ips_to_check).build()
                ti_rows = spark.sql(ti_query).collect()
                if ti_rows:
                    ti_summary = "; ".join(f"{r.value}={r.threat_type}(conf:{r.confidence})" for r in ti_rows[:5])

            # Asset lookup
            asset_crit = "unknown"
            if source_ip:
                asset_query = qb().select("criticality, owner, department").from_table(assets_table).where_eq("ip_address", source_ip).limit(1).build()
                try:
                    asset_rows = spark.sql(asset_query).collect()
                    if asset_rows:
                        asset_crit = asset_rows[0].criticality or "medium"
                except Exception:
                    pass

            # Network flow context
            flow_summary = "No recent flows"
            if source_ip:
                flow_query = (
                    qb().select("COUNT(*) as cnt, COUNT(DISTINCT dest_ip) as dests")
                    .from_table(events_table)
                    .where_eq("source_ip", source_ip)
                    .where_raw("timestamp > current_timestamp() - INTERVAL 1 HOUR")
                    .build()
                )
                try:
                    flow = spark.sql(flow_query).collect()[0]
                    flow_summary = f"{flow.cnt} events to {flow.dests} destinations in last hour"
                except Exception:
                    pass

            # LLM narrative
            prompt = f"""Summarize this security context for an analyst:
Alert: {alert.title} ({alert.severity})
Threat Intel: {ti_summary}
Asset: {asset_crit} criticality
Network: {flow_summary}

Provide a 2-sentence actionable summary."""

            narrative = ""
            try:
                resp = llm.chat(prompt)
                narrative = resp.content[:500] if resp else ""
            except Exception:
                narrative = "LLM unavailable"

            results.append({
                "alert_id": alert.id,
                "threat_intel_summary": ti_summary[:500],
                "asset_criticality": asset_crit,
                "geo_context": "",
                "network_flow_summary": flow_summary,
                "llm_narrative": narrative,
                "risk_adjustment": 10 if ti_summary != "No matches" else 0,
            })

        except Exception as e:
            mon.log_event("sage_error", {"alert_id": alert.id, "error": str(e)[:200]})
            results.append({
                "alert_id": alert.id, "threat_intel_summary": "", "asset_criticality": "unknown",
                "geo_context": "", "network_flow_summary": "", "llm_narrative": f"Error: {str(e)[:100]}",
                "risk_adjustment": 0,
            })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist

# COMMAND ----------

if results:
    schema = StructType([
        StructField("alert_id", StringType()), StructField("threat_intel_summary", StringType()),
        StructField("asset_criticality", StringType()), StructField("geo_context", StringType()),
        StructField("network_flow_summary", StringType()), StructField("llm_narrative", StringType()),
        StructField("risk_adjustment", IntegerType()),
    ])
    df = (
        spark.createDataFrame(results, schema=schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("agent_name", lit("sage_enrichment"))
        .withColumn("enriched_at", current_timestamp())
    )
    df.write.mode("append").saveAsTable(enrichments_table)

mon.log_complete(details={"enriched": len(results)})
dbutils.notebook.exit(json.dumps({"status": "completed", "enriched": len(results)}))
