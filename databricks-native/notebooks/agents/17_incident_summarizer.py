# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 17 - Incident Summarizer
# MAGIC Creates analyst-ready incident narratives from raw alert data.
# MAGIC Produces structured summaries with timeline, impact, and recommendations.

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

unsummarized = spark.sql("""
    SELECT a.*, COUNT(e.id) as related_events
    FROM alerts a
    LEFT JOIN events e ON a.source_event_id = e.id
    LEFT JOIN alert_summaries s ON a.id = s.alert_id
    WHERE s.alert_id IS NULL
      AND a.severity IN ('critical', 'high')
      AND a.created_at > current_timestamp() - INTERVAL 2 HOURS
    GROUP BY a.id, a.title, a.description, a.severity, a.status,
             a.source_ip, a.dest_ip, a.mitre_tactic, a.mitre_technique,
             a.confidence_score, a.risk_score, a.created_at, a.source,
             a.rule_id, a.rule_name, a.source_event_id
    ORDER BY a.risk_score DESC
    LIMIT 20
""").collect()

print(f"Summarizing {len(unsummarized)} alerts")

# COMMAND ----------

summaries = []

for alert in unsummarized:
    related = spark.sql(f"""
        SELECT event_type, action, outcome, username, timestamp
        FROM events
        WHERE source_ip = '{alert.source_ip}'
          AND timestamp BETWEEN '{alert.created_at}' - INTERVAL 30 MINUTES AND '{alert.created_at}' + INTERVAL 10 MINUTES
        ORDER BY timestamp
        LIMIT 20
    """).collect()

    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a SOC analyst writing incident summaries. Be concise, factual, and actionable. Write for a security analyst audience."},
                {"role": "user", "content": f"""Summarize this alert:
Title: {alert.title}
Severity: {alert.severity} | Risk: {alert.risk_score}
Source: {alert.source_ip} -> {alert.dest_ip}
MITRE: {alert.mitre_tactic}/{alert.mitre_technique}
Related Events: {len(related)}
Event Types: {list(set(e.event_type for e in related))}

Write: 1) One-line summary, 2) Impact assessment, 3) Recommended actions (3 bullet points max)"""}
            ],
            "max_tokens": 400,
            "temperature": 0.2
        }
    )

    summaries.append({
        "alert_id": alert.id,
        "summary": response.choices[0].message.content,
        "created_at": datetime.utcnow().isoformat(),
        "agent_name": "incident-summarizer",
    })

if summaries:
    spark.createDataFrame(summaries).write.mode("append").saveAsTable("alert_summaries")

print(f"Generated {len(summaries)} summaries")
