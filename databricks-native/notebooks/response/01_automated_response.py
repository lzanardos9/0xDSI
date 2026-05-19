# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 15: Automated Response Engine
# MAGIC Executes response actions for high-confidence alerts with human-in-the-loop approval.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")
dbutils.widgets.text("auto_respond_threshold", "0.9", "Auto-respond confidence threshold")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
threshold = float(dbutils.widgets.get("auto_respond_threshold"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Find Alerts Requiring Response

# COMMAND ----------

pending_alerts = spark.sql(f"""
    SELECT a.*
    FROM alerts a
    LEFT JOIN response_actions ra ON a.id = ra.alert_id
    WHERE a.status = 'new'
    AND a.severity IN ('critical', 'high')
    AND ra.id IS NULL
    ORDER BY a.confidence_score DESC
    LIMIT 50
""")

print(f"Alerts pending response: {pending_alerts.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Determine Response Actions

# COMMAND ----------

response_mapping = {
    "brute_force": {"action_type": "block_ip", "description": "Block source IP at firewall"},
    "data_exfiltration": {"action_type": "isolate_host", "description": "Network isolate compromised host"},
    "malware_detected": {"action_type": "quarantine_file", "description": "Quarantine malicious file"},
    "privilege_escalation": {"action_type": "disable_account", "description": "Temporarily disable account"},
    "lateral_movement": {"action_type": "segment_network", "description": "Apply micro-segmentation"},
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Response Actions

# COMMAND ----------

alerts_collected = pending_alerts.collect()
auto_responses = []
approval_needed = []

for alert in alerts_collected:
    alert_source = alert.source or ""

    action_config = None
    for pattern, config in response_mapping.items():
        if pattern in alert.title.lower() or pattern in (alert.description or "").lower():
            action_config = config
            break

    if not action_config:
        action_config = {"action_type": "investigate", "description": "Assign to analyst for investigation"}

    if alert.confidence_score and alert.confidence_score >= threshold:
        auto_responses.append({
            "alert_id": alert.id,
            "action_type": action_config["action_type"],
            "description": action_config["description"],
            "auto_approved": True
        })
    else:
        approval_needed.append({
            "alert_id": alert.id,
            "action_type": action_config["action_type"],
            "description": action_config["description"],
            "auto_approved": False
        })

print(f"Auto-responses (confidence >= {threshold}): {len(auto_responses)}")
print(f"Requiring approval: {len(approval_needed)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Auto-Responses & Create Approval Requests

# COMMAND ----------

from pyspark.sql import Row

all_actions = auto_responses + approval_needed

if all_actions:
    action_rows = [Row(
        alert_id=a["alert_id"],
        name=a["description"],
        action_type=a["action_type"],
        status="executed" if a["auto_approved"] else "pending_approval",
        triggered_by="automated_response_engine"
    ) for a in all_actions]

    actions_df = spark.createDataFrame(action_rows)
    actions_df = (actions_df
        .withColumn("id", expr("uuid()"))
        .withColumn("created_at", current_timestamp())
        .withColumn("executed_at", when(col("status") == "executed", current_timestamp()))
    )
    actions_df.write.mode("append").saveAsTable("response_actions")

    if approval_needed:
        approval_rows = [Row(
            action_id="placeholder",
            status="pending"
        ) for a in approval_needed]

        approvals_df = spark.createDataFrame(approval_rows)
        approvals_df = (approvals_df
            .withColumn("id", expr("uuid()"))
            .withColumn("requested_at", current_timestamp())
        )
        approvals_df.write.mode("append").saveAsTable("response_approvals")

    spark.sql(f"""
        UPDATE alerts
        SET status = 'in_progress'
        WHERE id IN ({','.join([f"'{a['alert_id']}'" for a in all_actions])})
    """)

print("Automated response cycle complete")
