# Databricks notebook source
# MAGIC %md
# MAGIC # Correlation - Cloud Security Posture Management (CSPM)
# MAGIC Monitors cloud configuration changes, detects misconfigurations,
# MAGIC and correlates cloud control plane events with data plane anomalies.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Cloud Configuration Changes

# COMMAND ----------

config_changes = spark.sql("""
    SELECT source_ip, username, action, dest_ip as resource,
           severity, timestamp, raw_log
    FROM events
    WHERE event_type = 'cloud_config'
      AND timestamp > current_timestamp() - INTERVAL 10 MINUTES
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Security Group Opened to 0.0.0.0/0

# COMMAND ----------

open_sg = spark.sql("""
    SELECT *
    FROM events
    WHERE event_type = 'cloud_config'
      AND action IN ('authorize_security_group_ingress', 'modify_network_acl')
      AND raw_log LIKE '%0.0.0.0/0%'
      AND timestamp > current_timestamp() - INTERVAL 10 MINUTES
""")

if open_sg.count() > 0:
    for row in open_sg.collect():
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source_ip,
                mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
            VALUES (
                'cspm-sg-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}',
                'Cloud: Security Group Opened to Internet',
                'User {row.username} opened security group to 0.0.0.0/0 from {row.source_ip}',
                'critical', 'new', '{row.source_ip}',
                'defense-evasion', 'T1562.007',
                0.95, 90, current_timestamp()
            )
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: IAM Policy Escalation

# COMMAND ----------

iam_escalation = spark.sql("""
    SELECT source_ip, username, action, COUNT(*) as action_count
    FROM events
    WHERE event_type = 'cloud_config'
      AND action IN ('attach_admin_policy', 'create_access_key', 'assume_role',
                     'put_role_policy', 'create_login_profile')
      AND timestamp > current_timestamp() - INTERVAL 10 MINUTES
    GROUP BY source_ip, username, action
""")

if iam_escalation.count() > 0:
    for row in iam_escalation.collect():
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source_ip,
                mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
            VALUES (
                'cspm-iam-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{row.username[:8]}',
                'Cloud: IAM Privilege Escalation',
                '{row.username} performed IAM escalation: {row.action} ({row.action_count}x)',
                'high', 'new', '{row.source_ip}',
                'privilege-escalation', 'T1078.004',
                0.80, 80, current_timestamp()
            )
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Encryption Disabled on Storage

# COMMAND ----------

encryption_disabled = spark.sql("""
    SELECT *
    FROM events
    WHERE event_type = 'cloud_config'
      AND action IN ('put_bucket_encryption_disabled', 'modify_db_instance_unencrypted',
                     'delete_kms_key', 'disable_encryption')
      AND timestamp > current_timestamp() - INTERVAL 10 MINUTES
""")

if encryption_disabled.count() > 0:
    for row in encryption_disabled.collect():
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source_ip,
                mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
            VALUES (
                'cspm-enc-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}',
                'Cloud: Encryption Disabled on Resource',
                '{row.username} disabled encryption: {row.action}',
                'critical', 'new', '{row.source_ip}',
                'defense-evasion', 'T1600',
                0.90, 85, current_timestamp()
            )
        """)

# COMMAND ----------

print(f"CSPM correlation complete. Open SGs: {open_sg.count()}, IAM escalations: {iam_escalation.count()}")
