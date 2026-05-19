# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: Enrichment Agent (LLM-Powered)
# MAGIC Gathers context: threat intel, asset info, related events, MITRE mapping.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("model_endpoint", "databricks-meta-llama-3-1-70b-instruct", "LLM Endpoint")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
model_endpoint = dbutils.widgets.get("model_endpoint")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

import json
from pyspark.sql.functions import *
from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Find Alerts Needing Enrichment

# COMMAND ----------

alerts_to_enrich = spark.sql("""
    SELECT a.id, a.title, a.description, a.severity, a.source,
           a.event_ids, a.mitre_tactic, a.confidence_score
    FROM alerts a
    WHERE a.status = 'in_progress'
    AND a.false_positive = false
    AND (a.mitre_technique IS NULL OR a.mitre_tactic IS NULL)
    ORDER BY a.created_at DESC
    LIMIT 20
""").collect()

print(f"Alerts needing enrichment: {len(alerts_to_enrich)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Enrichment Functions

# COMMAND ----------

def get_threat_intel(indicator: str) -> dict:
    """Look up IOC in local threat intel."""
    results = spark.sql(f"""
        SELECT indicator_type, threat_type, confidence, source, tags
        FROM ioc_entries
        WHERE value = '{indicator}'
        AND (expiry IS NULL OR expiry > current_timestamp())
    """).collect()
    if results:
        r = results[0]
        return {"found": True, "type": r.indicator_type, "threat": r.threat_type,
                "confidence": r.confidence, "source": r.source}
    return {"found": False}


def get_asset_context(ip: str) -> dict:
    """Get asset information for an IP."""
    results = spark.sql(f"""
        SELECT hostname, asset_type, criticality, owner, department, os
        FROM asset_registry WHERE ip_address = '{ip}'
    """).collect()
    if results:
        r = results[0]
        return {"hostname": r.hostname, "type": r.asset_type,
                "criticality": r.criticality, "owner": r.owner, "department": r.department}
    return {"found": False}


def get_related_events(event_ids: list, window_minutes: int = 30) -> list:
    """Find related events within a time window."""
    if not event_ids:
        return []
    ids_str = ",".join([f"'{e}'" for e in event_ids[:10]])
    results = spark.sql(f"""
        SELECT e2.event_type, e2.source_ip, e2.user_id, e2.severity, e2.action
        FROM events e1
        JOIN events e2 ON (e2.source_ip = e1.source_ip OR e2.user_id = e1.user_id)
        WHERE e1.id IN ({ids_str})
        AND e2.timestamp BETWEEN e1.timestamp - INTERVAL {window_minutes} MINUTES
            AND e1.timestamp + INTERVAL {window_minutes} MINUTES
        AND e2.id != e1.id
        LIMIT 50
    """).collect()
    return [{"type": r.event_type, "ip": r.source_ip, "user": r.user_id,
             "severity": r.severity, "action": r.action} for r in results]


def get_user_context(user_id: str) -> dict:
    """Get user profile and risk info."""
    if not user_id:
        return {"found": False}
    results = spark.sql(f"""
        SELECT display_name, department, role, risk_level
        FROM user_profiles WHERE id = '{user_id}'
    """).collect()
    if results:
        r = results[0]
        return {"name": r.display_name, "department": r.department,
                "role": r.role, "risk_level": r.risk_level}
    return {"found": False}

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM-Powered MITRE Mapping

# COMMAND ----------

ENRICHMENT_PROMPT = """You are a cybersecurity enrichment agent. Given the alert details and context below,
provide MITRE ATT&CK mapping and risk assessment.

Respond in JSON:
{
  "mitre_tactic": "TA0001",
  "mitre_technique": "T1110.001",
  "tactic_name": "Initial Access",
  "technique_name": "Brute Force: Password Guessing",
  "risk_score": 75,
  "kill_chain_phase": "reconnaissance|weaponization|delivery|exploitation|installation|c2|exfiltration",
  "recommended_actions": ["action1", "action2"],
  "campaign_indicators": ["indicator1"]
}"""

def enrich_with_llm(alert, context: dict) -> dict:
    prompt = f"""Alert: {alert.title}
Description: {alert.description}
Severity: {alert.severity}
Source: {alert.source}
Current MITRE: {alert.mitre_tactic or 'Unknown'}

Context gathered:
- Threat Intel: {json.dumps(context.get('threat_intel', {}))}
- Asset: {json.dumps(context.get('asset', {}))}
- Related Events: {len(context.get('related_events', []))} events found
- User: {json.dumps(context.get('user', {}))}
"""
    try:
        response = w.serving_endpoints.query(
            name=model_endpoint,
            messages=[
                {"role": "system", "content": ENRICHMENT_PROMPT},
                {"role": "user", "content": prompt}
            ],
            max_tokens=512,
            temperature=0.1
        )
        return json.loads(response.choices[0].message.content)
    except Exception as e:
        return {"error": str(e)[:200]}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Enrichment Pipeline

# COMMAND ----------

for alert in alerts_to_enrich:
    context = {}

    # Gather all context
    if alert.event_ids:
        first_event = spark.sql(f"""
            SELECT source_ip, user_id FROM events WHERE id = '{alert.event_ids[0]}'
        """).collect()
        if first_event:
            ip = first_event[0].source_ip
            user_id = first_event[0].user_id
            if ip:
                context["threat_intel"] = get_threat_intel(ip)
                context["asset"] = get_asset_context(ip)
            if user_id:
                context["user"] = get_user_context(user_id)
        context["related_events"] = get_related_events(alert.event_ids)

    # LLM enrichment
    llm_result = enrich_with_llm(alert, context)

    if "error" not in llm_result:
        mitre_tactic = llm_result.get("mitre_tactic", alert.mitre_tactic)
        mitre_technique = llm_result.get("mitre_technique")
        risk_score = llm_result.get("risk_score", 50)

        spark.sql(f"""
            UPDATE alerts SET
                mitre_tactic = '{mitre_tactic}',
                mitre_technique = '{mitre_technique}',
                risk_score = {risk_score}
            WHERE id = '{alert.id}'
        """)
        print(f"  Enriched {alert.id[:8]}... -> {mitre_tactic}/{mitre_technique} (risk: {risk_score})")

# COMMAND ----------

print(f"Enrichment complete: {len(alerts_to_enrich)} alerts enriched")
