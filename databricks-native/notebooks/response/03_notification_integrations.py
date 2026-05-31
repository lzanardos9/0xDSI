# Databricks notebook source
# MAGIC %md
# MAGIC # Notification & Alerting Integrations
# MAGIC
# MAGIC Routes escalated alerts to PagerDuty, Slack, Microsoft Teams, Email, Webhooks.
# MAGIC Uses shared bootstrap for configuration, secrets, monitoring, and safe SQL.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import urllib.request
import ssl

# COMMAND ----------

# Configuration
dbutils.widgets.text("notification_batch_size", "50", "Max notifications per run")
dbutils.widgets.text("dry_run", "false", "Dry run mode")

notification_batch_size = int(dbutils.widgets.get("notification_batch_size"))
dry_run = dbutils.widgets.get("dry_run").lower() == "true"

require_tables("alerts", "notification_log")

# Table paths
ALERTS_TABLE = get_table_path(cfg, "alerts")
NOTIFICATION_LOG_TABLE = get_table_path(cfg, "notification_log")
AGENT_STATUS_TABLE = get_table_path(cfg, "agent_status")

# COMMAND ----------

# Secrets (all via secrets_mgr)
pagerduty_routing_key = secrets_mgr.get_optional("pagerduty_api_key")
slack_webhook_url = secrets_mgr.get_optional("slack_webhook_url")
teams_webhook_url = secrets_mgr.get_optional("teams_webhook_url")
smtp_host = secrets_mgr.get_optional("smtp_host", "smtp.gmail.com")
smtp_port = int(secrets_mgr.get_optional("smtp_port", "587"))
smtp_username = secrets_mgr.get_optional("smtp_username")
smtp_password = secrets_mgr.get_optional("smtp_password")
generic_webhook_url = secrets_mgr.get_optional("notification_webhook_url")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Notification Senders

# COMMAND ----------

def send_pagerduty(alert, priority):
    """Send alert to PagerDuty Events API v2."""
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
    """Send alert to Slack via incoming webhook."""
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
    """Send alert to Microsoft Teams via webhook connector."""
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
    """Send alert via SMTP email."""
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
    """Send alert to a generic webhook endpoint."""
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

try:
    # Fetch pending alerts (LEFT JOIN prevents use of simple QueryBuilder)
    pending_alerts_sql = f"""
        SELECT a.*
        FROM {ALERTS_TABLE} a
        LEFT JOIN {NOTIFICATION_LOG_TABLE} nl ON a.id = nl.alert_id
        WHERE a.status = 'new'
          AND a.severity IN ('critical', 'high', 'medium')
          AND nl.alert_id IS NULL
          AND a.created_at >= current_timestamp() - INTERVAL 4 HOURS
        ORDER BY CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 ELSE 3 END
        LIMIT {int(notification_batch_size)}
    """

    with mon.time("fetch_pending_alerts"):
        pending_alerts = spark.sql(pending_alerts_sql).collect()

    mon.log_info(f"Found {len(pending_alerts)} alerts pending notification")

    # COMMAND ----------

    # Route notifications
    notification_results = []
    now = datetime.utcnow()

    with mon.time("send_notifications"):
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

    # MAGIC %md
    # MAGIC ## Persist Notification Log

    # COMMAND ----------

    # Write notification results to Delta
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
        with mon.time("write_notification_log"):
            log_df.write.mode("append").saveAsTable(NOTIFICATION_LOG_TABLE)

    sent_count = sum(1 for r in notification_results if r["status"] == "sent")
    mon.log_metric("notifications_sent", sent_count)
    mon.log_metric("notifications_attempted", len(notification_results))
    mon.log_metric("alerts_processed", len(pending_alerts))

    # COMMAND ----------

    # MAGIC %md
    # MAGIC ## Update Agent Status

    # COMMAND ----------

    # MERGE into agent_status (safe - no user-provided data in SQL values)
    spark.sql(f"""
        MERGE INTO {AGENT_STATUS_TABLE} AS target
        USING (SELECT
            'notification_integrations' as agent_id,
            current_timestamp() as last_heartbeat,
            'running' as status,
            {int(len(pending_alerts))} as events_processed,
            {int(sent_count)} as alerts_generated
        ) AS source
        ON target.agent_id = source.agent_id
        WHEN MATCHED THEN UPDATE SET *
        WHEN NOT MATCHED THEN INSERT *
    """)

    # COMMAND ----------

    # Complete monitoring and exit
    mon.log_complete(rows_processed=len(pending_alerts))

    result = {
        "status": "completed",
        "notifications_sent": sent_count,
        "notifications_attempted": len(notification_results),
        "alerts_processed": len(pending_alerts),
        "dry_run": dry_run,
    }

except Exception as e:
    mon.log_error(e, context="notification_integrations")
    result = {"status": "error", "error": str(e)[:1000], "dry_run": dry_run}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Pending Notification Queue
# MAGIC Ops notebooks (health_check, sla_alerting) write to notification_log with status='pending'.
# MAGIC Deliver those and mark as sent.

# COMMAND ----------

try:
    with mon.time("process_notification_queue"):
        pending_queue = spark.sql(f"""
            SELECT id, channel, severity, subject, body, source
            FROM {NOTIFICATION_LOG_TABLE}
            WHERE status = 'pending'
            ORDER BY created_at
            LIMIT {notification_batch_size}
        """).collect()

        queue_sent = 0
        for notif in pending_queue:
            alert_like = {
                "id": notif.id,
                "title": notif.subject,
                "description": notif.body,
                "severity": notif.severity,
                "source": notif.source,
            }
            channel = notif.channel
            sender = CHANNEL_SENDERS.get(channel)
            if sender:
                try:
                    send_result = sender(alert_like, notif.severity.upper())
                    if send_result.get("status") in ("sent", "dry_run"):
                        queue_sent += 1
                except Exception:
                    pass

        # Mark processed entries
        if pending_queue:
            ids_list = ",".join(f"'{n.id}'" for n in pending_queue)
            spark.sql(f"""
                UPDATE {NOTIFICATION_LOG_TABLE}
                SET status = 'sent'
                WHERE id IN ({ids_list})
            """)

        mon.log_metric("queue_processed", len(pending_queue))
        mon.log_metric("queue_sent", queue_sent)

except Exception as e:
    mon.log_warning(f"Notification queue processing failed: {e}")

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
