# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 06 - Nova (Investigation Agent)
# MAGIC Builds complete investigation narratives, reconstructs kill chains,
# MAGIC performs MITRE ATT&CK mapping, and generates analyst-ready investigation reports.

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
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Cases Needing Investigation

# COMMAND ----------

open_cases = spark.sql("""
    SELECT c.*,
           COUNT(a.id) as alert_count,
           MAX(a.risk_score) as max_risk_score,
           COLLECT_SET(a.mitre_tactic) as tactics,
           COLLECT_SET(a.mitre_technique) as techniques
    FROM cases c
    JOIN case_alerts ca ON c.id = ca.case_id
    JOIN alerts a ON ca.alert_id = a.id
    WHERE c.status IN ('open', 'investigating')
      AND c.updated_at < current_timestamp() - INTERVAL 10 MINUTES
    GROUP BY c.id, c.title, c.description, c.status, c.priority,
             c.severity, c.assigned_to, c.created_at, c.updated_at
    HAVING COUNT(a.id) >= 2
    ORDER BY max_risk_score DESC
    LIMIT 10
""").collect()

print(f"Found {len(open_cases)} cases needing investigation")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Kill Chain Reconstruction

# COMMAND ----------

def reconstruct_kill_chain(case_row):
    """Build temporal kill chain from case alerts and events."""
    timeline = spark.sql(f"""
        SELECT e.timestamp, e.event_type, e.source_ip, e.dest_ip,
               e.username, e.action, e.outcome, e.severity,
               a.mitre_tactic, a.mitre_technique, a.title as alert_title
        FROM events e
        LEFT JOIN alerts a ON e.id = a.source_event_id
        JOIN case_alerts ca ON a.id = ca.alert_id
        WHERE ca.case_id = '{case_row.id}'
        ORDER BY e.timestamp ASC
        LIMIT 100
    """).collect()

    kill_chain_phases = {
        "reconnaissance": [],
        "initial-access": [],
        "execution": [],
        "persistence": [],
        "privilege-escalation": [],
        "defense-evasion": [],
        "credential-access": [],
        "discovery": [],
        "lateral-movement": [],
        "collection": [],
        "exfiltration": [],
        "impact": []
    }

    for event in timeline:
        tactic = (event.mitre_tactic or "").lower().replace(" ", "-")
        if tactic in kill_chain_phases:
            kill_chain_phases[tactic].append({
                "timestamp": str(event.timestamp),
                "event_type": event.event_type,
                "source_ip": event.source_ip,
                "dest_ip": event.dest_ip,
                "action": event.action,
            })

    return timeline, {k: v for k, v in kill_chain_phases.items() if v}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Investigation Narrative

# COMMAND ----------

def generate_investigation_report(case_row, timeline, kill_chain):
    """Use Foundation Model to generate complete investigation narrative."""

    prompt = f"""Analyze this security incident and produce an investigation report.

Case: {case_row.title}
Priority: {case_row.priority} | Severity: {case_row.severity}
Alert Count: {case_row.alert_count} | Max Risk Score: {case_row.max_risk_score}
MITRE Tactics: {case_row.tactics}
MITRE Techniques: {case_row.techniques}

Kill Chain Phases Observed:
{json.dumps(kill_chain, indent=2, default=str)}

Timeline (first 20 events):
{json.dumps([{"ts": str(e.timestamp), "type": e.event_type, "src": e.source_ip, "dst": e.dest_ip, "action": e.action, "outcome": e.outcome} for e in timeline[:20]], indent=2)}

Produce a structured investigation report with:
1. Executive Summary (2-3 sentences)
2. Attack Narrative (chronological reconstruction)
3. Indicators of Compromise (IPs, domains, hashes found)
4. MITRE ATT&CK Mapping (tactics and techniques with evidence)
5. Impact Assessment (what was accessed/compromised)
6. Recommended Response Actions (prioritized list)
7. Confidence Level (low/medium/high with reasoning)"""

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are Nova, a senior threat analyst specializing in incident investigation. You reconstruct attack timelines, identify adversary TTPs, and produce detailed investigation reports. Be precise, evidence-based, and actionable."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 2000,
            "temperature": 0.2
        }
    )

    return response.choices[0].message.content

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Investigations

# COMMAND ----------

investigation_results = []

for case_row in open_cases:
    try:
        timeline, kill_chain = reconstruct_kill_chain(case_row)

        if not timeline:
            continue

        report = generate_investigation_report(case_row, timeline, kill_chain)

        result = {
            "case_id": case_row.id,
            "investigated_at": datetime.utcnow().isoformat(),
            "kill_chain_phases": json.dumps(list(kill_chain.keys())),
            "kill_chain_depth": len(kill_chain),
            "timeline_events": len(timeline),
            "investigation_report": report,
            "agent_name": "nova",
            "confidence": "high" if len(kill_chain) >= 3 else "medium" if len(kill_chain) >= 2 else "low",
        }
        investigation_results.append(result)

        # Update case status
        spark.sql(f"""
            UPDATE cases SET status = 'investigating',
                            updated_at = current_timestamp()
            WHERE id = '{case_row.id}'
        """)

    except Exception as e:
        print(f"Error investigating case {case_row.id}: {e}")

print(f"Completed {len(investigation_results)} investigations")

# COMMAND ----------

if investigation_results:
    inv_df = spark.createDataFrame(investigation_results)
    inv_df.write.mode("append").saveAsTable("case_investigations")

    spark.sql("""
        MERGE INTO agent_status AS t
        USING (SELECT 'nova' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
        ON t.agent_id = s.agent_id
        WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
        WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
    """)
