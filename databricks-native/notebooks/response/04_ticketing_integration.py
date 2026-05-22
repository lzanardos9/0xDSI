# Databricks notebook source
# MAGIC %md
# MAGIC # Ticketing System Integration - ServiceNow / Jira
# MAGIC
# MAGIC Bidirectional sync: creates tickets from cases, syncs status updates back.
# MAGIC Uses shared bootstrap for configuration, secrets, monitoring, and safe SQL.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime
import json
import uuid
import urllib.request
import ssl
import base64

# COMMAND ----------

# Configuration
dbutils.widgets.text("ticketing_system", "servicenow", "System: servicenow | jira")
dbutils.widgets.text("sync_direction", "bidirectional", "Direction: outbound | inbound | bidirectional")
dbutils.widgets.text("batch_size", "25", "Max tickets per run")

ticketing_system = dbutils.widgets.get("ticketing_system")
sync_direction = dbutils.widgets.get("sync_direction")
batch_size = int(dbutils.widgets.get("batch_size"))

# Table paths
CASES_TABLE = get_table_path(cfg, "cases")
TICKET_SYNC_LOG_TABLE = get_table_path(cfg, "ticket_sync_log")
AGENT_STATUS_TABLE = get_table_path(cfg, "agent_status")

# COMMAND ----------

# Secrets (all via secrets_mgr)
snow_instance = secrets_mgr.get_optional("servicenow_instance")
snow_username = secrets_mgr.get_optional("servicenow_username")
snow_password = secrets_mgr.get_optional("servicenow_password")
snow_assignment_group = secrets_mgr.get_optional("servicenow_assignment_group", "SOC Tier 1")

jira_url = secrets_mgr.get_optional("jira_url")
jira_email = secrets_mgr.get_optional("jira_email")
jira_api_token = secrets_mgr.get_optional("jira_api_token")
jira_project_key = secrets_mgr.get_optional("jira_project_key", "SOC")

# COMMAND ----------

# MAGIC %md
# MAGIC ## ServiceNow Client

# COMMAND ----------

class ServiceNowClient:
    """REST client for ServiceNow incident management."""

    def __init__(self, instance, username, password):
        self.base_url = f"https://{instance}/api/now"
        self.auth = base64.b64encode(f"{username}:{password}".encode()).decode()

    def _request(self, method, path, data=None):
        url = f"{self.base_url}{path}"
        headers = {"Authorization": f"Basic {self.auth}", "Content-Type": "application/json", "Accept": "application/json"}
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def create_incident(self, case):
        severity_map = {"critical": 1, "high": 2, "medium": 3, "low": 4}
        payload = {
            "short_description": case.get("title", "SOC Alert")[:160],
            "description": f"Case ID: {case['id']}\nSeverity: {case.get('severity')}\n\n{case.get('description', '')}",
            "category": "Security", "subcategory": "Security Incident",
            "impact": severity_map.get(case.get("severity"), 3),
            "assignment_group": snow_assignment_group,
            "correlation_id": case["id"],
        }
        result = self._request("POST", "/table/incident", payload)
        return result.get("result", {}).get("sys_id")

    def get_incident_status(self, sys_id):
        result = self._request("GET", f"/table/incident/{sys_id}?sysparm_fields=state,assigned_to,resolved_at")
        return result.get("result", {})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Jira Client

# COMMAND ----------

class JiraClient:
    """REST client for Jira issue management."""

    def __init__(self, url, email, token, project_key):
        self.base_url = f"{url}/rest/api/3"
        self.auth = base64.b64encode(f"{email}:{token}".encode()).decode()
        self.project_key = project_key

    def _request(self, method, path, data=None):
        url = f"{self.base_url}{path}"
        headers = {"Authorization": f"Basic {self.auth}", "Content-Type": "application/json", "Accept": "application/json"}
        body = json.dumps(data).encode("utf-8") if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        ctx = ssl.create_default_context()
        with urllib.request.urlopen(req, context=ctx, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def create_issue(self, case):
        priority_map = {"P1": "Highest", "P2": "High", "P3": "Medium", "P4": "Low"}
        payload = {
            "fields": {
                "project": {"key": self.project_key},
                "summary": f"[{case.get('severity', 'medium').upper()}] {case.get('title', 'SOC Alert')[:200]}",
                "description": {"type": "doc", "version": 1, "content": [
                    {"type": "paragraph", "content": [{"type": "text", "text": f"Case: {case['id']}\n{case.get('description', '')}"}]}
                ]},
                "issuetype": {"name": "Bug"},
                "priority": {"name": priority_map.get(case.get("priority"), "Medium")},
                "labels": ["security-incident", "0xdsi-soc"],
            }
        }
        result = self._request("POST", "/issue", payload)
        return result.get("key")

    def get_issue_status(self, issue_key):
        result = self._request("GET", f"/issue/{issue_key}?fields=status,resolution")
        fields = result.get("fields", {})
        return {"status": fields.get("status", {}).get("name"), "resolution": fields.get("resolution", {}).get("name") if fields.get("resolution") else None}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Sync Logic

# COMMAND ----------

try:
    sync_records = []
    status_updates = []  # Collect case status changes for batch MERGE
    now = datetime.utcnow()

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Outbound Sync: Create Tickets from Cases

    # COMMAND ----------

    if sync_direction in ("outbound", "bidirectional"):
        outbound_sql = f"""
            SELECT c.*
            FROM {CASES_TABLE} c
            LEFT JOIN {TICKET_SYNC_LOG_TABLE} tsl ON c.id = tsl.case_id
            WHERE tsl.case_id IS NULL
              AND c.status IN ('open', 'in_progress')
              AND c.severity IN ('critical', 'high')
              AND c.created_at >= current_timestamp() - INTERVAL 24 HOURS
            ORDER BY CASE c.severity WHEN 'critical' THEN 1 ELSE 2 END
            LIMIT {int(batch_size)}
        """

        with mon.time("outbound_sync"):
            pending_cases = spark.sql(outbound_sql).collect()

        mon.log_info(f"Found {len(pending_cases)} cases needing tickets")

        for case_row in pending_cases:
            case = case_row.asDict()
            external_id = None
            error_msg = None
            try:
                if ticketing_system == "servicenow" and snow_instance:
                    client = ServiceNowClient(snow_instance, snow_username, snow_password)
                    external_id = client.create_incident(case)
                elif ticketing_system == "jira" and jira_url:
                    client = JiraClient(jira_url, jira_email, jira_api_token, jira_project_key)
                    external_id = client.create_issue(case)
                else:
                    error_msg = f"No {ticketing_system} credentials configured"
            except Exception as e:
                error_msg = str(e)[:500]

            sync_records.append({
                "id": str(uuid.uuid4()), "case_id": case["id"],
                "ticketing_system": ticketing_system, "external_ticket_id": external_id,
                "sync_direction": "outbound", "status": "synced" if external_id else "failed",
                "error_message": error_msg, "synced_at": now,
            })

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Inbound Sync: Update Cases from Ticket Status

    # COMMAND ----------

    if sync_direction in ("inbound", "bidirectional"):
        inbound_sql = f"""
            SELECT tsl.case_id, tsl.external_ticket_id, tsl.ticketing_system, c.status as case_status
            FROM {TICKET_SYNC_LOG_TABLE} tsl
            JOIN {CASES_TABLE} c ON tsl.case_id = c.id
            WHERE tsl.status = 'synced' AND tsl.external_ticket_id IS NOT NULL
              AND c.status NOT IN ('closed', 'resolved')
              AND tsl.synced_at >= current_timestamp() - INTERVAL 7 DAYS
            LIMIT {int(batch_size)}
        """

        with mon.time("inbound_sync"):
            synced_tickets = spark.sql(inbound_sql).collect()

        status_map_snow = {"1": "open", "2": "in_progress", "6": "resolved", "7": "closed"}
        status_map_jira = {"To Do": "open", "In Progress": "in_progress", "Done": "resolved"}

        for ticket in synced_tickets:
            try:
                external_status = None
                if ticket.ticketing_system == "servicenow" and snow_instance:
                    result = ServiceNowClient(snow_instance, snow_username, snow_password).get_incident_status(ticket.external_ticket_id)
                    external_status = status_map_snow.get(str(result.get("state", "")), ticket.case_status)
                elif ticket.ticketing_system == "jira" and jira_url:
                    result = JiraClient(jira_url, jira_email, jira_api_token, jira_project_key).get_issue_status(ticket.external_ticket_id)
                    external_status = status_map_jira.get(result.get("status", ""), ticket.case_status)

                if external_status and external_status != ticket.case_status:
                    status_updates.append({
                        "case_id": ticket.case_id,
                        "new_status": external_status,
                    })
                    mon.log_info(f"Case {ticket.case_id[:8]}: {ticket.case_status} -> {external_status}")
            except Exception as e:
                mon.log_warning(f"Failed to sync {ticket.external_ticket_id}: {e}")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Apply Case Status Updates via MERGE (safe - no f-string SQL injection)

    # COMMAND ----------

    if status_updates:
        # Build a DataFrame of status changes and MERGE into cases table
        update_schema = StructType([
            StructField("case_id", StringType(), False),
            StructField("new_status", StringType(), False),
        ])
        updates_df = spark.createDataFrame(status_updates, schema=update_schema)
        updates_df.createOrReplaceTempView("_ticket_status_updates")

        with mon.time("apply_status_updates"):
            spark.sql(f"""
                MERGE INTO {CASES_TABLE} AS target
                USING _ticket_status_updates AS source
                ON target.id = source.case_id
                WHEN MATCHED THEN UPDATE SET
                    target.status = source.new_status,
                    target.updated_at = current_timestamp()
            """)

        spark.catalog.dropTempView("_ticket_status_updates")
        mon.log_info(f"Applied {len(status_updates)} case status updates via MERGE")

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Persist Sync Log

    # COMMAND ----------

    if sync_records:
        sync_schema = StructType([
            StructField("id", StringType(), False),
            StructField("case_id", StringType(), False),
            StructField("ticketing_system", StringType(), False),
            StructField("external_ticket_id", StringType(), True),
            StructField("sync_direction", StringType(), False),
            StructField("status", StringType(), False),
            StructField("error_message", StringType(), True),
            StructField("synced_at", TimestampType(), False),
        ])
        sync_df = spark.createDataFrame(sync_records, schema=sync_schema)
        with mon.time("write_sync_log"):
            sync_df.write.mode("append").saveAsTable(TICKET_SYNC_LOG_TABLE)

    created_count = sum(1 for r in sync_records if r["status"] == "synced")
    mon.log_metric("tickets_created", created_count)
    mon.log_metric("tickets_failed", len(sync_records) - created_count)
    mon.log_metric("status_updates_applied", len(status_updates))

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Update Agent Status

    # COMMAND ----------

    # MERGE into agent_status (safe - no user-provided data in SQL values)
    spark.sql(f"""
        MERGE INTO {AGENT_STATUS_TABLE} AS target
        USING (SELECT
            'ticketing_integration' as agent_id,
            current_timestamp() as last_heartbeat,
            'running' as status,
            {int(len(sync_records))} as events_processed,
            {int(len(status_updates))} as alerts_generated
        ) AS source
        ON target.agent_id = source.agent_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    # COMMAND ----------

    # Complete monitoring and exit
    mon.log_complete(rows_processed=len(sync_records) + len(status_updates))

    result = {
        "status": "completed",
        "ticketing_system": ticketing_system,
        "sync_direction": sync_direction,
        "tickets_created": created_count,
        "status_updates_applied": len(status_updates),
    }

except Exception as e:
    mon.log_error(e, context="ticketing_integration")
    result = {"status": "error", "error": str(e)[:1000], "ticketing_system": ticketing_system}

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
