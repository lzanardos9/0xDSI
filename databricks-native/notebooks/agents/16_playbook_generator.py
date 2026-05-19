# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 16 - Playbook Generator
# MAGIC Generates SOAR playbooks from natural language descriptions and incident patterns.
# MAGIC Uses Foundation Models to create structured response procedures.

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
# MAGIC ## Identify Incidents Without Playbooks

# COMMAND ----------

unmatched_incidents = spark.sql("""
    SELECT a.mitre_tactic, a.mitre_technique,
           COUNT(*) as occurrence_count,
           AVG(a.risk_score) as avg_risk
    FROM alerts a
    LEFT JOIN playbooks p ON a.mitre_technique = p.mitre_technique
    WHERE p.id IS NULL
      AND a.created_at > current_timestamp() - INTERVAL 7 DAYS
      AND a.mitre_technique IS NOT NULL
    GROUP BY a.mitre_tactic, a.mitre_technique
    HAVING COUNT(*) >= 3
    ORDER BY avg_risk DESC
    LIMIT 5
""").collect()

print(f"Found {len(unmatched_incidents)} techniques without playbooks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Playbooks

# COMMAND ----------

generated_playbooks = []

for incident in unmatched_incidents:
    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a SOAR playbook engineer. Generate structured incident response playbooks in JSON format with steps, conditions, and automated actions."},
                {"role": "user", "content": f"""Generate a response playbook for:
Tactic: {incident.mitre_tactic}
Technique: {incident.mitre_technique}
Occurrences (7 days): {incident.occurrence_count}
Average Risk Score: {incident.avg_risk:.0f}

Output JSON with: name, description, severity_threshold, steps (array of {{action, type: auto|manual|approval, description, timeout_minutes}}), escalation_criteria, success_metrics"""}
            ],
            "max_tokens": 1000,
            "temperature": 0.3
        }
    )

    try:
        content = response.choices[0].message.content
        playbook = json.loads(content[content.find("{"):content.rfind("}")+1])
        playbook["mitre_tactic"] = incident.mitre_tactic
        playbook["mitre_technique"] = incident.mitre_technique
        playbook["created_at"] = datetime.utcnow().isoformat()
        playbook["agent_name"] = "playbook-generator"
        generated_playbooks.append(playbook)
    except Exception as e:
        print(f"Error generating playbook for {incident.mitre_technique}: {e}")

if generated_playbooks:
    # Flatten for Delta storage
    flat_playbooks = [{
        "name": p.get("name", ""),
        "description": p.get("description", ""),
        "mitre_tactic": p["mitre_tactic"],
        "mitre_technique": p["mitre_technique"],
        "steps_json": json.dumps(p.get("steps", [])),
        "severity_threshold": p.get("severity_threshold", "high"),
        "created_at": p["created_at"],
        "agent_name": p["agent_name"],
    } for p in generated_playbooks]

    spark.createDataFrame(flat_playbooks).write.mode("append").saveAsTable("playbooks")

print(f"Generated {len(generated_playbooks)} new playbooks")
