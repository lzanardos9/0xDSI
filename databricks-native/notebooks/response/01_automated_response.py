# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 15: Automated Response Engine
# MAGIC Executes response actions for high-confidence alerts with human-in-the-loop approval.
# MAGIC
# MAGIC **Inputs:** Alerts table (new, high/critical severity without existing response actions)
# MAGIC **Outputs:** Response actions, approval requests, alert status updates
# MAGIC **Pattern:** Bootstrap + monitoring + MERGE-based updates (no raw f-string SQL)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from pyspark.sql.functions import (
    col, current_timestamp, expr, lit, when
)
from pyspark.sql.types import (
    StructType, StructField, StringType
)

# COMMAND ----------

# Widget for auto-response confidence threshold (catalog/schema handled by bootstrap)
dbutils.widgets.text("auto_respond_threshold", "0.9", "Auto-respond confidence threshold")
threshold = float(dbutils.widgets.get("auto_respond_threshold"))

# Table paths
ALERTS_TABLE = get_table_path(cfg, "alerts")
RESPONSE_ACTIONS_TABLE = get_table_path(cfg, "response_actions")
RESPONSE_APPROVALS_TABLE = get_table_path(cfg, "response_approvals")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Response Mapping

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
# MAGIC ## Main Execution

# COMMAND ----------

try:
    # ---- Fetch pending alerts ----
    with mon.time("fetch_pending_alerts"):
        pending_alerts = spark.sql(f"""
            SELECT a.*
            FROM {ALERTS_TABLE} a
            LEFT JOIN {RESPONSE_ACTIONS_TABLE} ra ON a.id = ra.alert_id
            WHERE a.status = 'new'
            AND a.severity IN ('critical', 'high')
            AND ra.id IS NULL
            ORDER BY a.confidence_score DESC
            LIMIT 50
        """)
        pending_count = pending_alerts.count()
        mon.log_metric("pending_alerts", pending_count)

    print(f"Alerts pending response: {pending_count}")

    # ---- Determine response actions ----
    with mon.time("determine_responses"):
        alerts_collected = pending_alerts.collect()
        auto_responses = []
        approval_needed = []

        for alert in alerts_collected:
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
                    "auto_approved": True,
                })
            else:
                approval_needed.append({
                    "alert_id": alert.id,
                    "action_type": action_config["action_type"],
                    "description": action_config["description"],
                    "auto_approved": False,
                })

        mon.log_metric("auto_responses", len(auto_responses))
        mon.log_metric("approval_needed", len(approval_needed))

    print(f"Auto-responses (confidence >= {threshold}): {len(auto_responses)}")
    print(f"Requiring approval: {len(approval_needed)}")

    # ---- Execute responses and create approvals ----
    with mon.time("execute_responses"):
        all_actions = auto_responses + approval_needed

        if all_actions:
            # Build actions DataFrame with explicit schema
            actions_schema = StructType([
                StructField("alert_id", StringType(), False),
                StructField("name", StringType(), False),
                StructField("action_type", StringType(), False),
                StructField("status", StringType(), False),
                StructField("triggered_by", StringType(), False),
            ])

            action_data = [
                (
                    a["alert_id"],
                    a["description"],
                    a["action_type"],
                    "executed" if a["auto_approved"] else "pending_approval",
                    "automated_response_engine",
                )
                for a in all_actions
            ]

            actions_df = spark.createDataFrame(action_data, schema=actions_schema)
            actions_df = (
                actions_df
                .withColumn("id", expr("uuid()"))
                .withColumn("created_at", current_timestamp())
                .withColumn("executed_at", when(col("status") == "executed", current_timestamp()))
            )
            actions_df.write.mode("append").saveAsTable(RESPONSE_ACTIONS_TABLE)
            mon.log_metric("actions_written", len(all_actions))

            # Create approval requests for actions requiring human review
            if approval_needed:
                approvals_schema = StructType([
                    StructField("action_id", StringType(), False),
                    StructField("status", StringType(), False),
                ])
                approval_data = [("placeholder", "pending") for _ in approval_needed]
                approvals_df = spark.createDataFrame(approval_data, schema=approvals_schema)
                approvals_df = (
                    approvals_df
                    .withColumn("id", expr("uuid()"))
                    .withColumn("requested_at", current_timestamp())
                )
                approvals_df.write.mode("append").saveAsTable(RESPONSE_APPROVALS_TABLE)

            # Update alert statuses via MERGE (safe -- no SQL injection)
            alert_ids_to_update = [a["alert_id"] for a in all_actions]
            update_schema = StructType([
                StructField("alert_id", StringType(), False),
            ])
            update_data = [(aid,) for aid in alert_ids_to_update]
            update_df = spark.createDataFrame(update_data, schema=update_schema)
            update_df.createOrReplaceTempView("_tmp_alert_ids_to_update")

            spark.sql(f"""
                MERGE INTO {ALERTS_TABLE} AS target
                USING _tmp_alert_ids_to_update AS source
                ON target.id = source.alert_id
                WHEN MATCHED THEN UPDATE SET
                    target.status = 'in_progress'
            """)

            mon.log_metric("alerts_updated", len(alert_ids_to_update))
            mon.log_info(f"Updated {len(alert_ids_to_update)} alerts to in_progress via MERGE")
        else:
            mon.log_info("No actions to execute this cycle")

    # ---- Summary ----
    total_actions = len(auto_responses) + len(approval_needed)
    mon.log_complete(rows_processed=total_actions)

    result = {
        "status": "success",
        "pending_alerts": pending_count,
        "auto_responses": len(auto_responses),
        "approval_needed": len(approval_needed),
        "total_actions": total_actions,
        "threshold": threshold,
    }

except Exception as e:
    mon.log_error(e, context="automated_response_engine")
    result = {
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Exit

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
