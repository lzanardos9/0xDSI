# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 07 - Vanguard (Automated Response)
# MAGIC Executes containment playbooks with human-in-the-loop approval gates.
# MAGIC Supports automated actions for high-confidence detections and manual approval
# MAGIC for medium-confidence. Uses Foundation Models for response decision reasoning.

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

AUTO_EXECUTE_THRESHOLD = 0.90
APPROVAL_THRESHOLD = 0.70

# COMMAND ----------

# MAGIC %md
# MAGIC ## Pending Response Actions

# COMMAND ----------

pending_responses = spark.sql(f"""
    SELECT ra.*, a.title as alert_title, a.severity, a.risk_score,
           a.mitre_tactic, a.confidence_score
    FROM response_actions ra
    JOIN alerts a ON ra.alert_id = a.id
    WHERE ra.status = 'pending'
      AND ra.created_at > current_timestamp() - INTERVAL 2 HOURS
    ORDER BY a.risk_score DESC
    LIMIT 30
""").collect()

print(f"Found {len(pending_responses)} pending response actions")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Response Playbook Library

# COMMAND ----------

PLAYBOOKS = {
    "isolate_host": {
        "name": "Isolate Host",
        "severity_min": "high",
        "actions": ["disable_network", "kill_processes", "snapshot_memory"],
        "requires_approval": True,
        "auto_threshold": 0.95,
    },
    "block_ip": {
        "name": "Block IP Address",
        "severity_min": "medium",
        "actions": ["add_to_blocklist", "update_firewall", "notify_team"],
        "requires_approval": False,
        "auto_threshold": 0.85,
    },
    "disable_account": {
        "name": "Disable User Account",
        "severity_min": "high",
        "actions": ["disable_login", "revoke_tokens", "force_mfa_reset"],
        "requires_approval": True,
        "auto_threshold": 0.92,
    },
    "quarantine_file": {
        "name": "Quarantine Malicious File",
        "severity_min": "medium",
        "actions": ["move_to_quarantine", "hash_and_log", "scan_similar"],
        "requires_approval": False,
        "auto_threshold": 0.80,
    },
    "escalate_to_ir": {
        "name": "Escalate to Incident Response",
        "severity_min": "critical",
        "actions": ["create_ir_ticket", "page_on_call", "preserve_evidence"],
        "requires_approval": True,
        "auto_threshold": 0.98,
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Response Reasoning

# COMMAND ----------

def get_response_decision(action_row):
    """Use Foundation Model to reason about appropriate response."""

    prompt = f"""Analyze this security alert and recommend a response action.

Alert: {action_row.alert_title}
Severity: {action_row.severity}
Risk Score: {action_row.risk_score}/100
Confidence: {action_row.confidence_score}
MITRE Tactic: {action_row.mitre_tactic}
Proposed Action: {action_row.action_type}

Available playbooks: {json.dumps(list(PLAYBOOKS.keys()))}

Decide:
1. Should this execute automatically, require approval, or be rejected?
2. Which playbook best fits?
3. What's your confidence in this decision (0-1)?
4. Brief reasoning (1-2 sentences).

Respond in JSON: {{"decision": "auto_execute|require_approval|reject", "playbook": "...", "confidence": 0.X, "reasoning": "..."}}"""

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are Vanguard, an automated response agent. You make containment decisions based on alert severity, confidence scores, and threat context. Err on the side of caution for high-impact actions."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": 300,
            "temperature": 0.1
        }
    )

    try:
        content = response.choices[0].message.content
        start = content.find("{")
        end = content.rfind("}") + 1
        return json.loads(content[start:end])
    except:
        return {"decision": "require_approval", "playbook": "escalate_to_ir", "confidence": 0.5, "reasoning": "Parse error, defaulting to manual review"}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Response Pipeline

# COMMAND ----------

response_results = []

for action in pending_responses:
    try:
        decision = get_response_decision(action)

        if decision["decision"] == "auto_execute" and decision["confidence"] >= AUTO_EXECUTE_THRESHOLD:
            status = "executed"
            executed_at = datetime.utcnow().isoformat()
        elif decision["decision"] == "reject":
            status = "rejected"
            executed_at = None
        else:
            status = "awaiting_approval"
            executed_at = None

        result = {
            "response_id": action.id,
            "alert_id": action.alert_id,
            "decision": decision["decision"],
            "playbook": decision["playbook"],
            "confidence": decision["confidence"],
            "reasoning": decision["reasoning"],
            "status": status,
            "executed_at": executed_at,
            "agent_name": "vanguard",
            "decided_at": datetime.utcnow().isoformat(),
        }
        response_results.append(result)

        # Update the response action status
        spark.sql(f"""
            UPDATE response_actions
            SET status = '{status}', updated_at = current_timestamp()
            WHERE id = '{action.id}'
        """)

    except Exception as e:
        print(f"Error processing response {action.id}: {e}")

auto_count = sum(1 for r in response_results if r["status"] == "executed")
approval_count = sum(1 for r in response_results if r["status"] == "awaiting_approval")
reject_count = sum(1 for r in response_results if r["status"] == "rejected")

print(f"Results: {auto_count} auto-executed, {approval_count} awaiting approval, {reject_count} rejected")

# COMMAND ----------

if response_results:
    results_df = spark.createDataFrame(response_results)
    results_df.write.mode("append").saveAsTable("response_decisions")

    spark.sql("""
        MERGE INTO agent_status AS t
        USING (SELECT 'vanguard' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
        ON t.agent_id = s.agent_id
        WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
        WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
    """)
