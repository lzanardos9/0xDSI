# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 02: Enrichment Agent
# MAGIC
# MAGIC Gathers context for alerts: threat intel cross-referencing, asset info,
# MAGIC related events, user data, and MITRE ATT&CK mapping via LLM.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("enrichment_agent")

# COMMAND ----------

dbutils.widgets.text("batch_size", "50", "Max alerts to enrich per run")
dbutils.widgets.text("lookback_hours", "2", "Alert age window")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Unenriched Alerts

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")
enrichments_table = cfg.get_table_path("alert_enrichments")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {enrichments_table} (
        id STRING, alert_id STRING, threat_intel_matches STRING,
        asset_context STRING, related_events_count INT,
        mitre_mapping STRING, risk_score INT, enrichment_summary STRING,
        agent_name STRING, enriched_at TIMESTAMP
    ) USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

unenriched = spark.sql(f"""
    SELECT a.* FROM {alerts_table} a
    LEFT JOIN {enrichments_table} e ON a.id = e.alert_id
    WHERE a.created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
      AND a.status IN ('new', 'in_progress')
      AND e.alert_id IS NULL
    ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
    LIMIT {batch_size}
""")

alerts_to_enrich = unenriched.collect()
mon.log_event("alerts_fetched", {"count": len(alerts_to_enrich)})

if not alerts_to_enrich:
    mon.log_complete(details={"status": "idle"})
    dbutils.notebook.exit('{"status": "idle", "enriched": 0}')

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enrichment Functions

# COMMAND ----------

ioc_table = cfg.get_table_path("ioc_entries")
assets_table = cfg.get_table_path("asset_registry")
events_table = cfg.get_table_path("events")


def get_threat_intel(alert):
    """Cross-reference alert IPs against IOC database."""
    source_ip = getattr(alert, "source_ip", None)
    dest_ip = getattr(alert, "dest_ip", None)
    ips = [ip for ip in [source_ip, dest_ip] if ip]
    if not ips:
        return []

    query = (
        qb().select("value, threat_type, confidence, source")
        .from_table(ioc_table)
        .where_in("value", ips)
        .build()
    )
    try:
        return [row.asDict() for row in spark.sql(query).collect()]
    except Exception:
        return []


def get_asset_context(alert):
    """Look up asset criticality and ownership."""
    source_ip = getattr(alert, "source_ip", None)
    hostname = getattr(alert, "hostname", None)
    if not source_ip and not hostname:
        return {}

    conditions = []
    if source_ip:
        conditions.append(f"ip_address = '{source_ip}'")
    if hostname:
        conditions.append(f"hostname = '{hostname}'")

    try:
        query = f"SELECT * FROM {assets_table} WHERE {' OR '.join(conditions)} LIMIT 1"
        rows = spark.sql(query).collect()
        return rows[0].asDict() if rows else {}
    except Exception:
        return {}


def get_related_events_count(alert):
    """Count related events in the past hour."""
    source_ip = getattr(alert, "source_ip", None)
    if not source_ip:
        return 0

    query = (
        qb().select("COUNT(*) as cnt")
        .from_table(events_table)
        .where_eq("source_ip", source_ip)
        .where_raw("timestamp > current_timestamp() - INTERVAL 1 HOUR")
        .build()
    )
    try:
        return spark.sql(query).collect()[0].cnt
    except Exception:
        return 0

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enrich with LLM MITRE Mapping

# COMMAND ----------

ENRICH_PROMPT = """Given this security alert and its context, provide MITRE ATT&CK mapping and risk assessment.

Alert: {title} - {description}
Severity: {severity}
Threat Intel Matches: {ti_matches}
Asset Context: {asset_context}
Related Events: {related_count}

Respond with JSON:
{{
  "mitre_tactic": "tactic name",
  "mitre_technique": "T-ID",
  "risk_score": 0-100,
  "summary": "one paragraph enrichment summary"
}}"""

enrichment_results = []

with mon.time("enrichment_loop"):
    for alert in alerts_to_enrich:
        try:
            ti_matches = get_threat_intel(alert)
            asset_ctx = get_asset_context(alert)
            related_count = get_related_events_count(alert)

            prompt = ENRICH_PROMPT.format(
                title=alert.title or "N/A",
                description=(alert.description or "N/A")[:300],
                severity=alert.severity or "unknown",
                ti_matches=json.dumps(ti_matches)[:300] if ti_matches else "None",
                asset_context=json.dumps(asset_ctx)[:200] if asset_ctx else "None",
                related_count=related_count,
            )

            llm_result = llm.extract_json(prompt)
            risk_score = int(llm_result.get("risk_score", 50)) if llm_result else 50
            mitre = json.dumps({"tactic": llm_result.get("mitre_tactic"), "technique": llm_result.get("mitre_technique")}) if llm_result else "{}"
            summary = llm_result.get("summary", "") if llm_result else ""

            enrichment_results.append({
                "alert_id": alert.id,
                "threat_intel_matches": json.dumps(ti_matches)[:1000],
                "asset_context": json.dumps(asset_ctx)[:500],
                "related_events_count": related_count,
                "mitre_mapping": mitre,
                "risk_score": risk_score,
                "enrichment_summary": summary[:500],
            })

        except Exception as e:
            mon.log_event("enrichment_error", {"alert_id": alert.id, "error": str(e)[:200]})
            enrichment_results.append({
                "alert_id": alert.id,
                "threat_intel_matches": "[]",
                "asset_context": "{}",
                "related_events_count": 0,
                "mitre_mapping": "{}",
                "risk_score": 50,
                "enrichment_summary": f"Enrichment failed: {str(e)[:100]}",
            })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Enrichments

# COMMAND ----------

if enrichment_results:
    schema = StructType([
        StructField("alert_id", StringType()),
        StructField("threat_intel_matches", StringType()),
        StructField("asset_context", StringType()),
        StructField("related_events_count", IntegerType()),
        StructField("mitre_mapping", StringType()),
        StructField("risk_score", IntegerType()),
        StructField("enrichment_summary", StringType()),
    ])

    df = (
        spark.createDataFrame(enrichment_results, schema=schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("agent_name", lit("enrichment_agent"))
        .withColumn("enriched_at", current_timestamp())
    )
    df.write.mode("append").saveAsTable(enrichments_table)

mon.log_complete(details={"enriched": len(enrichment_results)})
result = {"status": "completed", "enriched": len(enrichment_results)}
print(json.dumps(result))
dbutils.notebook.exit(json.dumps(result))
