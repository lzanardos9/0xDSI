# Databricks notebook source
# MAGIC %md
# MAGIC # Agent: SOC L1 Triage Agent (LLM-Powered)
# MAGIC Performs initial alert classification, severity assessment, and routing.
# MAGIC Uses Databricks Foundation Model APIs for reasoning.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("model_endpoint", "databricks-meta-llama-3-1-70b-instruct", "LLM Endpoint")
dbutils.widgets.text("batch_size", "10", "Alerts per batch")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
model_endpoint = dbutils.widgets.get("model_endpoint")
batch_size = int(dbutils.widgets.get("batch_size"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

import json
import requests
from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

TRIAGE_SYSTEM_PROMPT = """You are a SOC Level 1 Triage Agent for the 0xDSI Agentic SOC platform.

Your job is to classify incoming security alerts as:
- TRUE_POSITIVE: Likely real threat requiring investigation
- FALSE_POSITIVE: Benign activity that matches a detection rule
- NEEDS_INVESTIGATION: Ambiguous, requires enrichment

For each alert, assess:
1. Severity (critical/high/medium/low/info)
2. Priority (P1/P2/P3/P4)
3. Recommended next action (escalate/enrich/close/investigate)
4. Confidence score (0.0-1.0)
5. Brief reasoning (1-2 sentences)

Respond ONLY in JSON format:
{
  "classification": "TRUE_POSITIVE|FALSE_POSITIVE|NEEDS_INVESTIGATION",
  "severity": "critical|high|medium|low|info",
  "priority": "P1|P2|P3|P4",
  "action": "escalate|enrich|close|investigate",
  "confidence": 0.85,
  "reasoning": "Brief explanation"
}
"""

FALSE_POSITIVE_PATTERNS = [
    "vulnerability scanner detected",
    "scheduled backup",
    "authorized penetration test",
    "health check endpoint",
    "monitoring system probe",
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Pending Alerts

# COMMAND ----------

pending_alerts = spark.sql(f"""
    SELECT id, title, description, severity, source,
           mitre_tactic, mitre_technique, confidence_score,
           event_ids, created_at
    FROM alerts
    WHERE status = 'new'
    ORDER BY
        CASE severity
            WHEN 'critical' THEN 1
            WHEN 'high' THEN 2
            WHEN 'medium' THEN 3
            ELSE 4
        END,
        created_at ASC
    LIMIT {batch_size}
""").collect()

print(f"Alerts to triage: {len(pending_alerts)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fast-Path: Known False Positive Patterns

# COMMAND ----------

fast_closed = []
needs_llm = []

for alert in pending_alerts:
    title_lower = (alert.title or "").lower()
    desc_lower = (alert.description or "").lower()
    combined = f"{title_lower} {desc_lower}"

    is_known_fp = any(pattern in combined for pattern in FALSE_POSITIVE_PATTERNS)

    if is_known_fp:
        fast_closed.append({
            "id": alert.id,
            "classification": "FALSE_POSITIVE",
            "confidence": 0.95,
            "reasoning": "Matched known false-positive pattern"
        })
    else:
        needs_llm.append(alert)

print(f"Fast-closed as FP: {len(fast_closed)}")
print(f"Requiring LLM triage: {len(needs_llm)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM-Powered Triage

# COMMAND ----------

from databricks.sdk import WorkspaceClient

w = WorkspaceClient()

def triage_alert(alert) -> dict:
    prompt = f"""Triage this security alert:

Title: {alert.title}
Description: {alert.description}
Severity: {alert.severity}
Source: {alert.source}
MITRE Tactic: {alert.mitre_tactic or 'Unknown'}
MITRE Technique: {alert.mitre_technique or 'Unknown'}
Confidence: {alert.confidence_score or 'N/A'}
Created: {alert.created_at}
"""
    try:
        response = w.serving_endpoints.query(
            name=model_endpoint,
            messages=[
                {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            max_tokens=512,
            temperature=0.1
        )
        content = response.choices[0].message.content
        result = json.loads(content)
        result["id"] = alert.id
        return result
    except Exception as e:
        return {
            "id": alert.id,
            "classification": "NEEDS_INVESTIGATION",
            "severity": alert.severity or "medium",
            "priority": "P3",
            "action": "investigate",
            "confidence": 0.5,
            "reasoning": f"LLM triage failed: {str(e)[:100]}"
        }

# COMMAND ----------

llm_results = [triage_alert(alert) for alert in needs_llm]
all_results = fast_closed + llm_results

print(f"Triage complete. Results: {len(all_results)}")
for r in all_results:
    print(f"  {r['id'][:8]}... -> {r['classification']} (confidence: {r.get('confidence', 'N/A')})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply Triage Decisions

# COMMAND ----------

for result in all_results:
    classification = result["classification"]
    alert_id = result["id"]
    confidence = result.get("confidence", 0.5)
    action = result.get("action", "investigate")

    if classification == "FALSE_POSITIVE":
        spark.sql(f"""
            UPDATE alerts SET
                status = 'closed',
                false_positive = true,
                resolution_notes = '{result.get("reasoning", "Auto-classified as FP")[:200]}',
                resolved_at = current_timestamp()
            WHERE id = '{alert_id}'
        """)
    elif classification == "TRUE_POSITIVE" and action == "escalate":
        spark.sql(f"""
            UPDATE alerts SET
                status = 'in_progress',
                severity = '{result.get("severity", "high")}'
            WHERE id = '{alert_id}'
        """)
    else:
        spark.sql(f"""
            UPDATE alerts SET status = 'in_progress'
            WHERE id = '{alert_id}'
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Agent Status

# COMMAND ----------

spark.sql(f"""
    MERGE INTO agent_status t
    USING (SELECT 'triage_agent' as agent_id) s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET
        status = 'idle',
        last_heartbeat = current_timestamp(),
        alerts_generated = alerts_generated + {len([r for r in all_results if r['classification'] == 'TRUE_POSITIVE'])},
        events_processed = events_processed + {len(all_results)}
    WHEN NOT MATCHED THEN INSERT (id, agent_id, status, last_heartbeat, events_processed, alerts_generated)
        VALUES (uuid(), 'triage_agent', 'idle', current_timestamp(), {len(all_results)}, 0)
""")

print(f"Triage agent cycle complete: {len(all_results)} alerts processed")
