# Databricks notebook source
# MAGIC %md
# MAGIC # Cloud Security Posture Management (CSPM) Correlation
# MAGIC
# MAGIC Monitors cloud configuration changes, detects misconfigurations,
# MAGIC and correlates cloud control plane events with data plane anomalies.
# MAGIC
# MAGIC Detections:
# MAGIC - Security groups opened to 0.0.0.0/0
# MAGIC - IAM privilege escalation chains
# MAGIC - Encryption disabled on storage/databases
# MAGIC - Public access enabled on sensitive resources
# MAGIC - Cross-account activity from unusual sources

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "10", "Detection window in minutes")
dbutils.widgets.text("max_alerts", "30", "Maximum alerts per run")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
max_alerts = int(dbutils.widgets.get("max_alerts"))

mon.log_event("config_loaded", {"lookback_minutes": lookback_minutes})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Security Group Opened to Internet

# COMMAND ----------

events_table = cfg.get_table_path("events")
alerts_table = cfg.get_table_path("alerts")
total_alerts = 0

with mon.time("open_sg_detection"):
    open_sg = spark.sql(f"""
        SELECT source_ip, user_id, action, dest_ip as resource,
               timestamp, raw_log, hostname
        FROM {events_table}
        WHERE event_type = 'cloud_config'
          AND action IN ('authorize_security_group_ingress', 'modify_network_acl',
                         'create_security_group_rule', 'update_firewall_rule')
          AND (raw_log LIKE '%0.0.0.0/0%' OR raw_log LIKE '%::/0%')
          AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
    """)

    sg_count = open_sg.count()
    if sg_count > 0:
        sg_alerts = (
            open_sg
            .limit(max_alerts)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", lit("Cloud: Security Group Opened to Internet"))
            .withColumn("description", concat(
                lit("User "), coalesce(col("user_id"), lit("unknown")),
                lit(" opened security group to 0.0.0.0/0 via "), col("action"),
                lit(" from "), col("source_ip")
            ))
            .withColumn("severity", lit("critical"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("cspm_correlation"))
            .withColumn("mitre_tactic", lit("defense-evasion"))
            .withColumn("mitre_technique", lit("T1562.007"))
            .withColumn("confidence_score", lit(0.95))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        sg_alerts.write.mode("append").saveAsTable(alerts_table)
        total_alerts += min(sg_count, max_alerts)
        mon.log_detection("open_security_group", {"count": sg_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: IAM Privilege Escalation

# COMMAND ----------

with mon.time("iam_escalation_detection"):
    IAM_ESCALATION_ACTIONS = [
        'attach_admin_policy', 'create_access_key', 'assume_role',
        'put_role_policy', 'create_login_profile', 'attach_user_policy',
        'add_user_to_group', 'update_assume_role_policy',
    ]

    iam_escalation = spark.sql(f"""
        SELECT source_ip, user_id, action, COUNT(*) as action_count,
               collect_set(dest_ip) as affected_resources,
               MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
        FROM {events_table}
        WHERE event_type = 'cloud_config'
          AND action IN ({', '.join(f"'{a}'" for a in IAM_ESCALATION_ACTIONS)})
          AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
        GROUP BY source_ip, user_id, action
    """)

    iam_count = iam_escalation.count()
    if iam_count > 0:
        # Detect escalation chains: same user performing multiple IAM actions
        iam_chains = spark.sql(f"""
            SELECT source_ip, user_id,
                   COUNT(DISTINCT action) as unique_actions,
                   COUNT(*) as total_actions,
                   collect_set(action) as actions_performed
            FROM {events_table}
            WHERE event_type = 'cloud_config'
              AND action IN ({', '.join(f"'{a}'" for a in IAM_ESCALATION_ACTIONS)})
              AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
            GROUP BY source_ip, user_id
            HAVING COUNT(DISTINCT action) >= 2
        """)

        chain_count = iam_chains.count()

        iam_alerts = (
            iam_escalation
            .limit(max_alerts)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(
                lit("Cloud: IAM Privilege Escalation - "),
                coalesce(col("user_id"), lit("unknown"))
            ))
            .withColumn("description", concat(
                coalesce(col("user_id"), lit("unknown")),
                lit(" performed IAM escalation: "), col("action"),
                lit(" ("), col("action_count"), lit("x) from "), col("source_ip")
            ))
            .withColumn("severity",
                when(col("action_count") >= 3, lit("critical"))
                .otherwise(lit("high"))
            )
            .withColumn("status", lit("new"))
            .withColumn("source", lit("cspm_correlation"))
            .withColumn("mitre_tactic", lit("privilege-escalation"))
            .withColumn("mitre_technique", lit("T1078.004"))
            .withColumn("confidence_score", least(
                lit(0.7) + col("action_count").cast("double") * lit(0.05),
                lit(0.95)
            ))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        iam_alerts.write.mode("append").saveAsTable(alerts_table)
        total_alerts += min(iam_count, max_alerts)
        mon.log_detection("iam_escalation", {"count": iam_count, "chains": chain_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Encryption Disabled on Storage

# COMMAND ----------

with mon.time("encryption_disabled_detection"):
    ENCRYPTION_DISABLE_ACTIONS = [
        'put_bucket_encryption_disabled', 'modify_db_instance_unencrypted',
        'delete_kms_key', 'disable_encryption', 'remove_server_side_encryption',
        'delete_encryption_configuration',
    ]

    encryption_disabled = spark.sql(f"""
        SELECT source_ip, user_id, action, dest_ip as resource,
               timestamp, hostname
        FROM {events_table}
        WHERE event_type = 'cloud_config'
          AND action IN ({', '.join(f"'{a}'" for a in ENCRYPTION_DISABLE_ACTIONS)})
          AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
    """)

    enc_count = encryption_disabled.count()
    if enc_count > 0:
        enc_alerts = (
            encryption_disabled
            .limit(max_alerts)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", lit("Cloud: Encryption Disabled on Resource"))
            .withColumn("description", concat(
                coalesce(col("user_id"), lit("unknown")),
                lit(" disabled encryption via "), col("action"),
                lit(" on "), coalesce(col("resource"), lit("unknown resource")),
                lit(" from "), col("source_ip")
            ))
            .withColumn("severity", lit("critical"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("cspm_correlation"))
            .withColumn("mitre_tactic", lit("defense-evasion"))
            .withColumn("mitre_technique", lit("T1600"))
            .withColumn("confidence_score", lit(0.90))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        enc_alerts.write.mode("append").saveAsTable(alerts_table)
        total_alerts += min(enc_count, max_alerts)
        mon.log_detection("encryption_disabled", {"count": enc_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Public Access Enabled

# COMMAND ----------

with mon.time("public_access_detection"):
    public_access = spark.sql(f"""
        SELECT source_ip, user_id, action, dest_ip as resource, timestamp
        FROM {events_table}
        WHERE event_type = 'cloud_config'
          AND action IN ('put_public_access_block_disabled', 'make_bucket_public',
                         'enable_public_access', 'set_public_ip', 'create_public_endpoint')
          AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
    """)

    pub_count = public_access.count()
    if pub_count > 0:
        pub_alerts = (
            public_access
            .limit(max_alerts)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", lit("Cloud: Public Access Enabled on Resource"))
            .withColumn("description", concat(
                coalesce(col("user_id"), lit("unknown")),
                lit(" enabled public access: "), col("action"),
                lit(" on "), coalesce(col("resource"), lit("unknown"))
            ))
            .withColumn("severity", lit("high"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("cspm_correlation"))
            .withColumn("mitre_tactic", lit("initial-access"))
            .withColumn("mitre_technique", lit("T1190"))
            .withColumn("confidence_score", lit(0.85))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        pub_alerts.write.mode("append").saveAsTable(alerts_table)
        total_alerts += min(pub_count, max_alerts)
        mon.log_detection("public_access_enabled", {"count": pub_count})

# COMMAND ----------

mon.log_complete(details={
    "open_sg": sg_count,
    "iam_escalation": iam_count,
    "encryption_disabled": enc_count,
    "public_access": pub_count if 'pub_count' in dir() else 0,
    "total_alerts": total_alerts,
})
print(f"CSPM correlation complete. SG: {sg_count}, IAM: {iam_count}, "
      f"Encryption: {enc_count}, Total alerts: {total_alerts}")
