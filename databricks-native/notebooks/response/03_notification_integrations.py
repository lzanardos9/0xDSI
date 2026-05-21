# Databricks notebook source
# MAGIC %md
# MAGIC # Notification & Alerting Integrations
# MAGIC
# MAGIC Routes escalated alerts to PagerDuty, Slack, Microsoft Teams, Email, Webhooks.

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import urllib.request
import ssl

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("notification_batch_size", "50", "Max notifications per run")
dbutils.widgets.text("dry_run", "false", "Dry run mode")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
notification_batch_size = int(dbutils.widgets.get("notification_batch_size"))
dry_run = dbutils.widgets.get("dry_run").lower() == "true"

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

SECRET_SCOPE = "0xdsi-soc"

def get_secret(key, default=None):
    try:
        return dbutils.secrets.get(scope=SECRET_SCOPE, key=key)
    except Exception:
        return default

pagerduty_routing_key = get_secret("pagerduty-routing-key")
slack_webhook_url = get_secret("slack-webhook-url")
teams_webhook_url = get_secret("teams-webhook-url")
smtp_host = get_secret("smtp-host", "smtp.gmail.com")
smtp_port = int(get_secret("smtp-port", "587"))
smtp_username = get_secret("smtp-username")
smtp_password = get_secret("smtp-password")
generic_webhook_url = get_secret("notification-webhook-url")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Notification Senders

# COMMAND ----------

def send_pagerduty(alert, priority):
    if not pagerduty_routing_key:
        return {"status": "skipped", "reason": "no_pagerduty_key"}
    severity_map = {"critical": "critical", "high": "error", "medium": "warning", "low": "info"}
    payload = {
        "routing_key": pagerduty_routing_key,
        "event_action": "trigger",
        "dedup_key": f"0xdsi-{alert['id']}",
        "payload": {
            "summary": f"[{priority}] {alert['title']}",
            "source": "0xDSI Agentic SOC",
            "severity": severity_map.get(alert["severity"], "warning"),
            "component": alert.get("source", "detection_engine"),
            "custom_details": {"alert_id": alert["id"], "description": alert.get("description", "")}
        },
    }
    if dry_run:
        return {"status": "dry_run", "channel": "pagerduty"}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request("https://events.pagerduty.com/v2/enqueue", data=data,
                                headers={"Content-Type": "application/json"}, method="POST")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return {"status": "sent", "channel": "pagerduty", "response_code": resp.status}


def send_slack(alert, priority):
    if not slack_webhook_url:
        return {"status": "skipped", "reason": "no_slack_webhook"}
    blocks = [
        {"type": "header", "text": {"type": "plain_text", "text": f"{priority} Alert: {alert['title'][:100]}"}},
        {"type": "section", "fields": [
            {"type": "mrkdwn", "text": f"*Severity:* {alert['severity']}"},
            {"type": "mrkdwn", "text": f"*Source:* {alert.get('source', 'unknown')}"},
            {"type": "mrkdwn", "text": f"*MITRE:* {alert.get('mitre_tactic', 'N/A')}"},
        ]},
        {"type": "section", "text": {"type": "mrkdwn", "text": f"```{(alert.get('description', '') or '')[:500]}```"}},
    ]
    payload = {"blocks": blocks}
    if dry_run:
        return {"status": "dry_run", "channel": "slack"}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(slack_webhook_url, data=data,
                                headers={"Content-Type": "application/json"}, method="POST")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return {"status": "sent", "channel": "slack", "response_code": resp.status}


def send_teams(alert, priority):
    if not teams_webhook_url:
        return {"status": "skipped", "reason": "no_teams_webhook"}
    card = {
        "@type": "MessageCard", "@context": "http://schema.org/extensions",
        "themeColor": "FF0000" if alert["severity"] == "critical" else "FF6600",
        "summary": f"{priority} - {alert['title']}",
        "sections": [{"activityTitle": f"{priority}: {alert['title']}",
                      "facts": [{"name": "Severity", "value": alert["severity"]},
                                {"name": "Source", "value": alert.get("source", "unknown")}],
                      "text": (alert.get("description", "") or "")[:500]}],
    }
    if dry_run:
        return {"status": "dry_run", "channel": "teams"}
    data = json.dumps(card).encode("utf-8")
    req = urllib.request.Request(teams_webhook_url, data=data,
                                headers={"Content-Type": "application/json"}, method="POST")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return {"status": "sent", "channel": "teams", "response_code": resp.status}


def send_email(alert, priority):
    if not smtp_username or not smtp_password:
        return {"status": "skipped", "reason": "no_smtp_config"}
    import smtplib
    from email.mime.text import MIMEText
    subject = f"[0xDSI SOC] {priority} - {alert['title']}"
    body = f"Alert ID: {alert['id']}\nSeverity: {alert['severity']}\n\n{alert.get('description', '')}"
    if dry_run:
        return {"status": "dry_run", "channel": "email"}
    msg = MIMEText(body, "plain")
    msg["From"] = smtp_username
    msg["To"] = smtp_username
    msg["Subject"] = subject
    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_username, smtp_password)
        server.sendmail(smtp_username, [smtp_username], msg.as_string())
    return {"status": "sent", "channel": "email"}


def send_webhook(alert, priority):
    if not generic_webhook_url:
        return {"status": "skipped", "reason": "no_webhook_url"}
    payload = {"source": "0xDSI_SOC", "priority": priority, "alert": alert}
    if dry_run:
        return {"status": "dry_run", "channel": "webhook"}
    data = json.dumps(payload, default=str).encode("utf-8")
    req = urllib.request.Request(generic_webhook_url, data=data,
                                headers={"Content-Type": "application/json"}, method="POST")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=10) as resp:
        return {"status": "sent", "channel": "webhook", "response_code": resp.status}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Routing Rules

# COMMAND ----------

routing_rules = [
    {"severity": "critical", "channel": "pagerduty", "priority": "P1"},
    {"severity": "critical", "channel": "slack", "priority": "P1"},
    {"severity": "high", "channel": "slack", "priority": "P2"},
    {"severity": "high", "channel": "teams", "priority": "P2"},
    {"severity": "medium", "channel": "email", "priority": "P3"},
]

CHANNEL_SENDERS = {
    "pagerduty": send_pagerduty, "slack": send_slack, "teams": send_teams,
    "email": send_email, "webhook": send_webhook,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Pending and Route

# COMMAND ----------

pending_alerts = spark.sql(f"""
    SELECT a.*
    FROM alerts a
    LEFT JOIN notification_log nl ON a.id = nl.alert_id
    WHERE a.status = 'new'
      AND a.severity IN ('critical', 'high', 'medium')
      AND nl.alert_id IS NULL
      AND a.created_at >= current_timestamp() - INTERVAL 4 HOURS
    ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
    LIMIT {notification_batch_size}
""").collect()

print(f"Found {len(pending_alerts)} alerts pending notification")

notification_results = []
now = datetime.utcnow()

for alert_row in pending_alerts:
    alert = alert_row.asDict()
    matching_rules = [r for r in routing_rules if r["severity"] == alert["severity"]]
    for rule in matching_rules:
        channel = rule["channel"]
        priority = rule.get("priority", "P3")
        sender = CHANNEL_SENDERS.get(channel)
        if not sender:
            continue
        try:
            result = sender(alert, priority)
            notification_results.append({
                "id": str(uuid.uuid4()), "alert_id": alert["id"], "channel": channel,
                "priority": priority, "status": result.get("status", "unknown"),
                "response_detail": json.dumps(result), "sent_at": now,
            })
        except Exception as e:
            notification_results.append({
                "id": str(uuid.uuid4()), "alert_id": alert["id"], "channel": channel,
                "priority": priority, "status": "failed",
                "response_detail": json.dumps({"error": str(e)[:500]}), "sent_at": now,
            })

# COMMAND ----------

if notification_results:
    log_schema = StructType([
        StructField("id", StringType(), False),
        StructField("alert_id", StringType(), False),
        StructField("channel", StringType(), False),
        StructField("priority", StringType(), False),
        StructField("status", StringType(), False),
        StructField("response_detail", StringType(), True),
        StructField("sent_at", TimestampType(), False),
    ])
    log_df = spark.createDataFrame(notification_results, schema=log_schema)
    log_df.write.mode("append").saveAsTable("notification_log")

sent_count = sum(1 for r in notification_results if r["status"] == "sent")
print(f"Sent: {sent_count} | Total attempts: {len(notification_results)}")

# COMMAND ----------

spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'notification_integrations' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {len(pending_alerts)} as events_processed,
        {sent_count} as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

dbutils.notebook.exit(json.dumps({"status": "completed", "notifications_sent": sent_count, "dry_run": dry_run}))
