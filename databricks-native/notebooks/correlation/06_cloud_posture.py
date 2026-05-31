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
dbutils.widgets.text("mode", "batch", "Execution mode: streaming | batch")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
max_alerts = int(dbutils.widgets.get("max_alerts"))
mode = dbutils.widgets.get("mode")

mon.log_event("config_loaded", {"lookback_minutes": lookback_minutes, "mode": mode})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Mode

# COMMAND ----------

events_table = cfg.get_table_path("events")
alerts_table = cfg.get_table_path("alerts")

CLOUD_EVENT_TYPES = ['cloud_config', 'cloud_audit', 'cloud_trail']

IAM_ESCALATION_ACTIONS = [
    'attach_admin_policy', 'create_access_key', 'assume_role',
    'put_role_policy', 'create_login_profile', 'attach_user_policy',
    'add_user_to_group', 'update_assume_role_policy',
]

ENCRYPTION_DISABLE_ACTIONS = [
    'put_bucket_encryption_disabled', 'modify_db_instance_unencrypted',
    'delete_kms_key', 'disable_encryption', 'remove_server_side_encryption',
    'delete_encryption_configuration',
]

PUBLIC_ACCESS_ACTIONS = [
    'put_public_access_block_disabled', 'make_bucket_public',
    'enable_public_access', 'set_public_ip', 'create_public_endpoint',
]

SG_OPEN_ACTIONS = [
    'authorize_security_group_ingress', 'modify_network_acl',
    'create_security_group_rule', 'update_firewall_rule',
]

if mode == "streaming":
    cspm_stream, sdp_source = create_sdp_stream_with_fallback(
        spark, secrets_mgr, cfg,
        consumer_group="0xdsi-sdp-cloud-posture",
        watermark="5 minutes",
        max_offsets_per_trigger=50000,
    )
    mon.log_event("sdp_stream_connected", {"source": sdp_source, "consumer_group": "0xdsi-sdp-cloud-posture"})

    def detect_cspm_batch(batch_df, batch_id):
        """Run all CSPM detections on each micro-batch."""
        cloud_events = batch_df.filter(col("event_type").isin(*CLOUD_EVENT_TYPES))
        if cloud_events.count() == 0:
            return

        alerts_to_write = []

        # Security groups opened to internet
        open_sg = cloud_events.filter(
            (col("action").isin(*SG_OPEN_ACTIONS)) &
            (col("raw_log").like("%0.0.0.0/0%") | col("raw_log").like("%::/0%"))
        )
        if open_sg.count() > 0:
            alerts_to_write.append(
                open_sg.limit(max_alerts)
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

        # IAM escalation
        iam_events = cloud_events.filter(col("action").isin(*IAM_ESCALATION_ACTIONS))
        if iam_events.count() > 0:
            alerts_to_write.append(
                iam_events.limit(max_alerts)
                .withColumn("id", expr("uuid()"))
                .withColumn("title", lit("Cloud: IAM Privilege Escalation"))
                .withColumn("description", concat(
                    coalesce(col("user_id"), lit("unknown")),
                    lit(" performed IAM escalation: "), col("action"),
                    lit(" from "), col("source_ip")
                ))
                .withColumn("severity", lit("high"))
                .withColumn("status", lit("new"))
                .withColumn("source", lit("cspm_correlation"))
                .withColumn("mitre_tactic", lit("privilege-escalation"))
                .withColumn("mitre_technique", lit("T1078.004"))
                .withColumn("confidence_score", lit(0.80))
                .withColumn("created_at", current_timestamp())
                .select("id", "title", "description", "severity", "status",
                        "source", "mitre_tactic", "confidence_score", "created_at")
            )

        # Encryption disabled
        enc_events = cloud_events.filter(col("action").isin(*ENCRYPTION_DISABLE_ACTIONS))
        if enc_events.count() > 0:
            alerts_to_write.append(
                enc_events.limit(max_alerts)
                .withColumn("id", expr("uuid()"))
                .withColumn("title", lit("Cloud: Encryption Disabled on Resource"))
                .withColumn("description", concat(
                    coalesce(col("user_id"), lit("unknown")),
                    lit(" disabled encryption via "), col("action"),
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

        # Public access enabled
        pub_events = cloud_events.filter(col("action").isin(*PUBLIC_ACCESS_ACTIONS))
        if pub_events.count() > 0:
            alerts_to_write.append(
                pub_events.limit(max_alerts)
                .withColumn("id", expr("uuid()"))
                .withColumn("title", lit("Cloud: Public Access Enabled on Resource"))
                .withColumn("description", concat(
                    coalesce(col("user_id"), lit("unknown")),
                    lit(" enabled public access: "), col("action")
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

        for alert_df in alerts_to_write:
            alert_df.write.mode("append").saveAsTable(alerts_table)

        mon.log_event("cspm_streaming_batch", {
            "batch_id": batch_id, "cloud_events": cloud_events.count(),
            "alert_groups": len(alerts_to_write)
        })

    query = (
        cspm_stream
        .writeStream
        .foreachBatch(detect_cspm_batch)
        .option("checkpointLocation", get_checkpoint_path(cfg, "cloud_posture"))
        .trigger(processingTime="30 seconds")
        .queryName("cspm_correlation_detector")
        .start()
    )

    try:
        query.awaitTermination()
    except Exception as e:
        mon.log_error(e, context="CSPM streaming terminated")
        raise
    finally:
        dbutils.notebook.exit(json.dumps({"status": "terminated", "mode": "streaming"}))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Mode: Security Group Opened to Internet

# COMMAND ----------

total_alerts = 0

with mon.time("open_sg_detection"):
    open_sg = spark.sql(f"""
        SELECT source_ip, user_id, action, dest_ip as resource,
               timestamp, raw_log, hostname
        FROM {events_table}
        WHERE event_type IN ({', '.join(f"'{t}'" for t in CLOUD_EVENT_TYPES)})
          AND action IN ({', '.join(f"'{a}'" for a in SG_OPEN_ACTIONS)})
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
    iam_escalation = spark.sql(f"""
        SELECT source_ip, user_id, action, COUNT(*) as action_count,
               collect_set(dest_ip) as affected_resources,
               MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
        FROM {events_table}
        WHERE event_type IN ({', '.join(f"'{t}'" for t in CLOUD_EVENT_TYPES)})
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
            WHERE event_type IN ({', '.join(f"'{t}'" for t in CLOUD_EVENT_TYPES)})
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
    encryption_disabled = spark.sql(f"""
        SELECT source_ip, user_id, action, dest_ip as resource,
               timestamp, hostname
        FROM {events_table}
        WHERE event_type IN ({', '.join(f"'{t}'" for t in CLOUD_EVENT_TYPES)})
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
        WHERE event_type IN ({', '.join(f"'{t}'" for t in CLOUD_EVENT_TYPES)})
          AND action IN ({', '.join(f"'{a}'" for a in PUBLIC_ACCESS_ACTIONS)})
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
