# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 13 - Forensics Agent
# MAGIC Preserves digital evidence, reconstructs detailed timelines,
# MAGIC maintains chain of custody, and generates forensic reports
# MAGIC suitable for legal proceedings.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
import hashlib
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Cases Requiring Forensics

# COMMAND ----------

forensic_cases = spark.sql("""
    SELECT c.*, COUNT(DISTINCT e.id) as evidence_count
    FROM cases c
    JOIN case_alerts ca ON c.id = ca.case_id
    JOIN alerts a ON ca.alert_id = a.id
    LEFT JOIN events e ON a.source_event_id = e.id
    WHERE c.severity IN ('critical', 'high')
      AND c.status IN ('investigating', 'escalated')
      AND c.id NOT IN (SELECT case_id FROM forensic_reports WHERE created_at > current_timestamp() - INTERVAL 4 HOURS)
    GROUP BY c.id, c.title, c.description, c.status, c.priority,
             c.severity, c.assigned_to, c.created_at, c.updated_at
    ORDER BY c.severity DESC, c.created_at ASC
    LIMIT 5
""").collect()

print(f"Found {len(forensic_cases)} cases requiring forensic analysis")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Evidence Collection and Preservation

# COMMAND ----------

def collect_evidence(case_id):
    """Collect all digital evidence for a case with integrity hashes."""
    evidence_items = []

    # Network evidence
    network = spark.sql(f"""
        SELECT * FROM network_flows nf
        WHERE (nf.source_ip IN (
            SELECT DISTINCT source_ip FROM alerts a
            JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}'
        ) OR nf.dest_ip IN (
            SELECT DISTINCT dest_ip FROM alerts a
            JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}'
        ))
        AND nf.timestamp > (SELECT MIN(a.created_at) - INTERVAL 1 HOUR FROM alerts a
                            JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}')
        ORDER BY nf.timestamp
    """).collect()

    for flow in network:
        content = json.dumps(flow.asDict(), default=str)
        evidence_items.append({
            "type": "network_flow",
            "content_hash": hashlib.sha256(content.encode()).hexdigest(),
            "timestamp": str(flow.timestamp),
            "summary": f"{flow.source_ip} -> {flow.dest_ip} ({flow.protocol})",
        })

    # Log evidence
    logs = spark.sql(f"""
        SELECT * FROM events e
        WHERE e.source_ip IN (
            SELECT DISTINCT source_ip FROM alerts a
            JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}'
        )
        AND e.timestamp > (SELECT MIN(a.created_at) - INTERVAL 2 HOURS FROM alerts a
                          JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}')
        ORDER BY e.timestamp
        LIMIT 500
    """).collect()

    for log in logs:
        content = json.dumps(log.asDict(), default=str)
        evidence_items.append({
            "type": "event_log",
            "content_hash": hashlib.sha256(content.encode()).hexdigest(),
            "timestamp": str(log.timestamp),
            "summary": f"{log.event_type}: {log.action} by {log.username}",
        })

    return evidence_items

# COMMAND ----------

# MAGIC %md
# MAGIC ## Timeline Reconstruction

# COMMAND ----------

def build_forensic_timeline(case_id):
    """Build detailed forensic timeline with sub-second precision."""
    timeline = spark.sql(f"""
        SELECT timestamp, event_type, source_ip, dest_ip, username,
               action, outcome, severity, raw_log
        FROM events
        WHERE id IN (
            SELECT DISTINCT e.id FROM events e
            JOIN alerts a ON e.id = a.source_event_id
            JOIN case_alerts ca ON a.id = ca.alert_id
            WHERE ca.case_id = '{case_id}'
        )
        OR (source_ip IN (
            SELECT DISTINCT source_ip FROM alerts a
            JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}'
        ) AND timestamp BETWEEN
            (SELECT MIN(created_at) - INTERVAL 2 HOURS FROM alerts a JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}')
            AND
            (SELECT MAX(created_at) + INTERVAL 1 HOUR FROM alerts a JOIN case_alerts ca ON a.id = ca.alert_id WHERE ca.case_id = '{case_id}')
        )
        ORDER BY timestamp ASC
        LIMIT 1000
    """).collect()

    return [{"ts": str(e.timestamp), "type": e.event_type, "src": e.source_ip,
             "dst": e.dest_ip, "user": e.username, "action": e.action,
             "outcome": e.outcome, "severity": e.severity} for e in timeline]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Forensic Report

# COMMAND ----------

for case_row in forensic_cases:
    try:
        evidence = collect_evidence(case_row.id)
        timeline = build_forensic_timeline(case_row.id)

        prompt = f"""Generate a forensic investigation report for this security incident.

Case: {case_row.title}
Severity: {case_row.severity}
Evidence Items Collected: {len(evidence)}
Timeline Events: {len(timeline)}

Timeline (first 30 events):
{json.dumps(timeline[:30], indent=1)}

Produce a forensic report with:
1. Incident Summary
2. Detailed Timeline Reconstruction
3. Evidence Chain of Custody (reference hashes)
4. Root Cause Analysis
5. Scope of Compromise
6. Containment Verification
7. Recommendations for Remediation
8. Legal Considerations"""

        response = client.predict(
            endpoint="databricks-meta-llama-3-1-70b-instruct",
            inputs={
                "messages": [
                    {"role": "system", "content": "You are a digital forensics specialist. Produce detailed, evidence-based forensic reports suitable for legal proceedings. Maintain objectivity and reference specific evidence."},
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 2500,
                "temperature": 0.1
            }
        )

        report = {
            "case_id": case_row.id,
            "report": response.choices[0].message.content,
            "evidence_count": len(evidence),
            "timeline_events": len(timeline),
            "evidence_hashes": json.dumps([e["content_hash"] for e in evidence[:50]]),
            "created_at": datetime.utcnow().isoformat(),
            "agent_name": "forensics",
        }

        report_df = spark.createDataFrame([report])
        report_df.write.mode("append").saveAsTable("forensic_reports")

    except Exception as e:
        print(f"Error processing case {case_row.id}: {e}")

print("Forensics agent complete")
