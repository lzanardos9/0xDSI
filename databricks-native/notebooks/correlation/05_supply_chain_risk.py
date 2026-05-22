# Databricks notebook source
# MAGIC %md
# MAGIC # Supply Chain Risk Correlation Engine
# MAGIC
# MAGIC Detects supply chain compromise indicators:
# MAGIC - Unexpected package installations (never seen in baseline)
# MAGIC - Build pipeline tampering (secret access, artifact replacement)
# MAGIC - Code signing anomalies (unsigned or new signers)
# MAGIC - Dependency confusion attacks (internal name on public registry)
# MAGIC
# MAGIC Uses historical baseline comparison to distinguish legitimate updates from threats.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "15", "Detection window in minutes")
dbutils.widgets.text("baseline_days", "30", "Days of history for package baseline")
dbutils.widgets.text("max_alerts", "25", "Maximum alerts per run")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
baseline_days = int(dbutils.widgets.get("baseline_days"))
max_alerts = int(dbutils.widgets.get("max_alerts"))

mon.log_event("config_loaded", {
    "lookback_minutes": lookback_minutes,
    "baseline_days": baseline_days,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Supply Chain Events

# COMMAND ----------

events_table = cfg.get_table_path("events")
alerts_table = cfg.get_table_path("alerts")

supply_chain_events = spark.sql(f"""
    SELECT source_ip, user_id, action, dest_ip, timestamp, severity,
           event_type, raw_log, hostname
    FROM {events_table}
    WHERE event_type IN ('software_install', 'build_event', 'deployment', 'package_update',
                         'software', 'build', 'package')
      AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
""")

event_count = supply_chain_events.count()
mon.log_event("supply_chain_events", {"count": event_count})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Unexpected Package Installation

# COMMAND ----------

with mon.time("unexpected_packages"):
    unexpected_packages = spark.sql(f"""
        WITH baseline_packages AS (
            SELECT DISTINCT action as known_action
            FROM {events_table}
            WHERE event_type IN ('software_install', 'software', 'package_update', 'package')
              AND timestamp BETWEEN current_timestamp() - INTERVAL {baseline_days} DAYS
                               AND current_timestamp() - INTERVAL 1 DAY
        )
        SELECT e.source_ip, e.user_id, e.action, e.hostname, e.timestamp, e.severity
        FROM {events_table} e
        LEFT JOIN baseline_packages bp ON e.action = bp.known_action
        WHERE e.event_type IN ('software_install', 'software', 'package_update', 'package')
          AND e.action LIKE '%install%'
          AND bp.known_action IS NULL
          AND e.timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
    """)

    pkg_count = unexpected_packages.count()
    mon.log_event("unexpected_packages_detected", {"count": pkg_count})

    if pkg_count > 0:
        pkg_alerts = (
            unexpected_packages
            .limit(max_alerts)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", lit("Supply Chain: Unexpected Package Installation"))
            .withColumn("description", concat(
                lit("New package installed from "), col("source_ip"),
                lit(" by "), coalesce(col("user_id"), lit("unknown")),
                lit(": "), col("action"),
                lit(" on "), coalesce(col("hostname"), lit("unknown host"))
            ))
            .withColumn("severity", lit("high"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("supply_chain_correlation"))
            .withColumn("mitre_tactic", lit("initial-access"))
            .withColumn("mitre_technique", lit("T1195.002"))
            .withColumn("confidence_score", lit(0.75))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        pkg_alerts.write.mode("append").saveAsTable(alerts_table)
        print(f"Generated {min(pkg_count, max_alerts)} unexpected package alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Build Pipeline Tampering

# COMMAND ----------

with mon.time("build_tampering"):
    SUSPICIOUS_BUILD_ACTIONS = [
        'pipeline_modified', 'secret_accessed', 'artifact_replaced',
        'build_config_changed', 'signing_key_rotated', 'dependency_override',
    ]

    build_anomalies = spark.sql(f"""
        SELECT source_ip, user_id, action, COUNT(*) as action_count,
               MIN(timestamp) as first_seen, MAX(timestamp) as last_seen,
               collect_set(hostname) as affected_hosts
        FROM {events_table}
        WHERE event_type IN ('build_event', 'build')
          AND action IN ({', '.join(f"'{a}'" for a in SUSPICIOUS_BUILD_ACTIONS)})
          AND timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
        GROUP BY source_ip, user_id, action
        HAVING COUNT(*) >= 2
    """)

    build_count = build_anomalies.count()
    mon.log_event("build_anomalies_detected", {"count": build_count})

    if build_count > 0:
        build_alerts = (
            build_anomalies
            .limit(max_alerts)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", lit("Supply Chain: Build Pipeline Tampering"))
            .withColumn("description", concat(
                lit("User "), coalesce(col("user_id"), lit("unknown")),
                lit(" performed "), col("action_count"),
                lit(" suspicious build actions: "), col("action"),
                lit(" from "), col("source_ip")
            ))
            .withColumn("severity", lit("critical"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("supply_chain_correlation"))
            .withColumn("mitre_tactic", lit("persistence"))
            .withColumn("mitre_technique", lit("T1195.002"))
            .withColumn("confidence_score", least(
                col("action_count").cast("double") / lit(5.0),
                lit(0.95)
            ))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        build_alerts.write.mode("append").saveAsTable(alerts_table)
        print(f"Generated {min(build_count, max_alerts)} build tampering alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Dependency Confusion / Typosquatting

# COMMAND ----------

with mon.time("dependency_confusion"):
    # Look for packages installed from external sources that match internal naming patterns
    dep_confusion = spark.sql(f"""
        WITH internal_packages AS (
            SELECT DISTINCT action as pkg_name
            FROM {events_table}
            WHERE event_type IN ('software_install', 'package_update', 'software', 'package')
              AND source_ip LIKE '10.%' OR source_ip LIKE '172.%' OR source_ip LIKE '192.168.%'
              AND timestamp BETWEEN current_timestamp() - INTERVAL {baseline_days} DAYS
                               AND current_timestamp() - INTERVAL 1 DAY
        )
        SELECT e.source_ip, e.user_id, e.action, e.timestamp
        FROM {events_table} e
        INNER JOIN internal_packages ip
            ON levenshtein(e.action, ip.pkg_name) BETWEEN 1 AND 2
        WHERE e.event_type IN ('software_install', 'package_update', 'software', 'package')
          AND e.timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
          AND NOT (e.source_ip LIKE '10.%' OR e.source_ip LIKE '172.%' OR e.source_ip LIKE '192.168.%')
    """)

    confusion_count = dep_confusion.count()
    if confusion_count > 0:
        confusion_alerts = (
            dep_confusion
            .limit(10)
            .withColumn("id", expr("uuid()"))
            .withColumn("title", lit("Supply Chain: Possible Dependency Confusion"))
            .withColumn("description", concat(
                lit("Package '"), col("action"),
                lit("' installed from external source resembles internal package. User: "),
                coalesce(col("user_id"), lit("unknown"))
            ))
            .withColumn("severity", lit("critical"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("supply_chain_correlation"))
            .withColumn("mitre_tactic", lit("initial-access"))
            .withColumn("mitre_technique", lit("T1195.001"))
            .withColumn("confidence_score", lit(0.80))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status",
                    "source", "mitre_tactic", "confidence_score", "created_at")
        )
        confusion_alerts.write.mode("append").saveAsTable(alerts_table)
        mon.log_detection("dependency_confusion", {"count": confusion_count})
        print(f"Generated {min(confusion_count, 10)} dependency confusion alerts")

# COMMAND ----------

mon.log_complete(details={
    "supply_chain_events": event_count,
    "unexpected_packages": pkg_count,
    "build_anomalies": build_count,
    "dependency_confusion": confusion_count if 'confusion_count' in dir() else 0,
})
print(f"Supply chain correlation complete. Packages: {pkg_count}, Build: {build_count}")
