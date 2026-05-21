# Databricks notebook source
# MAGIC %md
# MAGIC # Ticketing System Integration - ServiceNow / Jira
# MAGIC
# MAGIC Bidirectional sync: creates tickets from cases, syncs status updates back.

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

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("ticketing_system", "servicenow", "System: servicenow | jira")
dbutils.widgets.text("sync_direction", "bidirectional", "Direction: outbound | inbound | bidirectional")
dbutils.widgets.text("batch_size", "25", "Max tickets per run")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
ticketing_system = dbutils.widgets.get("ticketing_system")
sync_direction = dbutils.widgets.get("sync_direction")
batch_size = int(dbutils.widgets.get("batch_size"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

SECRET_SCOPE = "0xdsi-soc"

def get_secret(key, default=None):
    try:
        return dbutils.secrets.get(scope=SECRET_SCOPE, key=key)
    except Exception:
        return default

snow_instance = get_secret("servicenow-instance")
snow_username = get_secret("servicenow-username")
snow_password = get_secret("servicenow-password")
snow_assignment_group = get_secret("servicenow-assignment-group", "SOC Tier 1")

jira_url = get_secret("jira-url")
jira_email = get_secret("jira-email")
jira_api_token = get_secret("jira-api-token")
jira_project_key = get_secret("jira-project-key", "SOC")

# COMMAND ----------

# MAGIC %md
# MAGIC ## ServiceNow Client

# COMMAND ----------

class ServiceNowClient:
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
# MAGIC ## Outbound Sync: Create Tickets from Cases

# COMMAND ----------

sync_records = []
now = datetime.utcnow()

if sync_direction in ("outbound", "bidirectional"):
    pending_cases = spark.sql(f"""
        SELECT c.*
        FROM cases c
        LEFT JOIN ticket_sync_log tsl ON c.id = tsl.case_id
        WHERE tsl.case_id IS NULL
          AND c.status IN ('open', 'in_progress')
          AND c.severity IN ('critical', 'high')
          AND c.created_at >= current_timestamp() - INTERVAL 24 HOURS
        ORDER BY CASE c.severity WHEN 'critical' THEN 1 ELSE 2 END
        LIMIT {batch_size}
    """).collect()

    print(f"Found {len(pending_cases)} cases needing tickets")

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
    synced_tickets = spark.sql(f"""
        SELECT tsl.case_id, tsl.external_ticket_id, tsl.ticketing_system, c.status as case_status
        FROM ticket_sync_log tsl
        JOIN cases c ON tsl.case_id = c.id
        WHERE tsl.status = 'synced' AND tsl.external_ticket_id IS NOT NULL
          AND c.status NOT IN ('closed', 'resolved')
          AND tsl.synced_at >= current_timestamp() - INTERVAL 7 DAYS
        LIMIT {batch_size}
    """).collect()

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
                spark.sql(f"UPDATE cases SET status = '{external_status}', updated_at = current_timestamp() WHERE id = '{ticket.case_id}'")
                print(f"Case {ticket.case_id[:8]}: {ticket.case_status} -> {external_status}")
        except Exception as e:
            print(f"Failed to sync {ticket.external_ticket_id}: {e}")

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
    sync_df.write.mode("append").saveAsTable("ticket_sync_log")
    created = sum(1 for r in sync_records if r["status"] == "synced")
    print(f"Tickets created: {created} | Failed: {len(sync_records) - created}")

# COMMAND ----------

spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'ticketing_integration' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {len(sync_records)} as events_processed,
        0 as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

dbutils.notebook.exit(json.dumps({"status": "completed", "ticketing_system": ticketing_system, "synced": len(sync_records)}))
