# Databricks notebook source
# MAGIC %md
# MAGIC # 03: OCSF Schema Enforcement & Normalization
# MAGIC
# MAGIC Validates and normalizes events against the Open Cybersecurity Schema Framework (OCSF).
# MAGIC - Maps event_type to OCSF class_uid and category_uid
# MAGIC - Normalizes severity, outcome, and status fields
# MAGIC - Adds OCSF metadata (activity_id, type_uid)
# MAGIC - Routes unmappable events for manual review
# MAGIC
# MAGIC Runs as a scheduled batch job (every 5 minutes) on recent un-normalized events.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "60", "Process events from last N minutes")
dbutils.widgets.text("batch_limit", "10000", "Max events per batch")

require_tables("events")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
batch_limit = int(dbutils.widgets.get("batch_limit"))

# COMMAND ----------

from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## OCSF Schema Definitions (v1.1)

# COMMAND ----------

# OCSF Category UIDs
OCSF_CATEGORIES = {
    1: "System Activity",
    2: "Findings",
    3: "Identity & Access Management",
    4: "Network Activity",
    5: "Discovery",
    6: "Application Activity",
}

# OCSF Class names for human-readable output
OCSF_CLASS_NAMES = {
    1001: "Process Activity",
    1002: "Module Activity",
    1003: "Scheduled Job Activity",
    1004: "File System Activity",
    1005: "Kernel Extension Activity",
    1006: "Registry Key Activity",
    2001: "Security Finding",
    2003: "Compliance Finding",
    3001: "Account Change",
    3002: "Authentication",
    3003: "Authorize Session",
    3004: "Entity Management",
    4001: "Network Activity",
    4002: "HTTP Activity",
    4003: "DNS Activity",
    4009: "Email Activity",
    4010: "Network File Activity",
    5001: "Device Inventory Info",
    6001: "Web Resources Activity",
    6003: "API Activity",
}

# OCSF Class UIDs - comprehensive mapping
OCSF_CLASS_MAP = {
    # Identity & Access (3xxx)
    "authentication_success": {"class_uid": 3002, "category_uid": 3, "activity_id": 1, "type_uid": 300201},
    "authentication_failure": {"class_uid": 3002, "category_uid": 3, "activity_id": 2, "type_uid": 300202},
    "account_change": {"class_uid": 3001, "category_uid": 3, "activity_id": 1, "type_uid": 300101},
    "account_creation": {"class_uid": 3001, "category_uid": 3, "activity_id": 1, "type_uid": 300101},
    "account_deletion": {"class_uid": 3001, "category_uid": 3, "activity_id": 4, "type_uid": 300104},
    "account_lockout": {"class_uid": 3001, "category_uid": 3, "activity_id": 99, "type_uid": 300199},
    "privilege_escalation": {"class_uid": 3004, "category_uid": 3, "activity_id": 1, "type_uid": 300401},
    "group_membership_change": {"class_uid": 3003, "category_uid": 3, "activity_id": 1, "type_uid": 300301},
    "password_change": {"class_uid": 3001, "category_uid": 3, "activity_id": 3, "type_uid": 300103},
    "mfa_verification": {"class_uid": 3002, "category_uid": 3, "activity_id": 1, "type_uid": 300201},
    "session_start": {"class_uid": 3002, "category_uid": 3, "activity_id": 1, "type_uid": 300201},
    "session_end": {"class_uid": 3002, "category_uid": 3, "activity_id": 3, "type_uid": 300203},
    "token_refresh": {"class_uid": 3002, "category_uid": 3, "activity_id": 1, "type_uid": 300201},

    # System Activity (1xxx)
    "process_creation": {"class_uid": 1001, "category_uid": 1, "activity_id": 1, "type_uid": 100101},
    "process_termination": {"class_uid": 1001, "category_uid": 1, "activity_id": 2, "type_uid": 100102},
    "file_creation": {"class_uid": 1004, "category_uid": 1, "activity_id": 1, "type_uid": 100401},
    "file_modification": {"class_uid": 1004, "category_uid": 1, "activity_id": 3, "type_uid": 100403},
    "file_deletion": {"class_uid": 1004, "category_uid": 1, "activity_id": 2, "type_uid": 100402},
    "file_read": {"class_uid": 1004, "category_uid": 1, "activity_id": 4, "type_uid": 100404},
    "registry_modification": {"class_uid": 1006, "category_uid": 1, "activity_id": 3, "type_uid": 100603},
    "registry_creation": {"class_uid": 1006, "category_uid": 1, "activity_id": 1, "type_uid": 100601},
    "service_start": {"class_uid": 1002, "category_uid": 1, "activity_id": 1, "type_uid": 100201},
    "service_stop": {"class_uid": 1002, "category_uid": 1, "activity_id": 2, "type_uid": 100202},
    "module_load": {"class_uid": 1005, "category_uid": 1, "activity_id": 1, "type_uid": 100501},
    "scheduled_task": {"class_uid": 1003, "category_uid": 1, "activity_id": 1, "type_uid": 100301},
    "memory_access": {"class_uid": 1001, "category_uid": 1, "activity_id": 99, "type_uid": 100199},

    # Network Activity (4xxx)
    "network_connection": {"class_uid": 4001, "category_uid": 4, "activity_id": 1, "type_uid": 400101},
    "network_disconnect": {"class_uid": 4001, "category_uid": 4, "activity_id": 2, "type_uid": 400102},
    "dns_query": {"class_uid": 4003, "category_uid": 4, "activity_id": 1, "type_uid": 400301},
    "dns_response": {"class_uid": 4003, "category_uid": 4, "activity_id": 2, "type_uid": 400302},
    "http_request": {"class_uid": 4002, "category_uid": 4, "activity_id": 1, "type_uid": 400201},
    "http_response": {"class_uid": 4002, "category_uid": 4, "activity_id": 2, "type_uid": 400202},
    "lateral_movement": {"class_uid": 4002, "category_uid": 4, "activity_id": 99, "type_uid": 400299},
    "port_scan": {"class_uid": 4001, "category_uid": 4, "activity_id": 99, "type_uid": 400199},
    "data_exfiltration": {"class_uid": 4010, "category_uid": 4, "activity_id": 99, "type_uid": 401099},
    "firewall_block": {"class_uid": 4001, "category_uid": 4, "activity_id": 5, "type_uid": 400105},
    "firewall_allow": {"class_uid": 4001, "category_uid": 4, "activity_id": 1, "type_uid": 400101},
    "vpn_connection": {"class_uid": 4001, "category_uid": 4, "activity_id": 1, "type_uid": 400101},
    "email_received": {"class_uid": 4009, "category_uid": 4, "activity_id": 2, "type_uid": 400902},
    "email_sent": {"class_uid": 4009, "category_uid": 4, "activity_id": 1, "type_uid": 400901},
    "email_blocked": {"class_uid": 4009, "category_uid": 4, "activity_id": 5, "type_uid": 400905},

    # Findings (2xxx)
    "vulnerability_found": {"class_uid": 2001, "category_uid": 2, "activity_id": 1, "type_uid": 200101},
    "compliance_violation": {"class_uid": 2003, "category_uid": 2, "activity_id": 1, "type_uid": 200301},
    "malware_detected": {"class_uid": 2001, "category_uid": 2, "activity_id": 1, "type_uid": 200101},
    "policy_violation": {"class_uid": 2003, "category_uid": 2, "activity_id": 1, "type_uid": 200301},
    "anomaly_detected": {"class_uid": 2001, "category_uid": 2, "activity_id": 1, "type_uid": 200101},

    # Discovery (5xxx)
    "asset_discovery": {"class_uid": 5001, "category_uid": 5, "activity_id": 1, "type_uid": 500101},
    "service_discovery": {"class_uid": 5001, "category_uid": 5, "activity_id": 1, "type_uid": 500101},

    # Application (6xxx)
    "application_access": {"class_uid": 6001, "category_uid": 6, "activity_id": 1, "type_uid": 600101},
    "api_call": {"class_uid": 6003, "category_uid": 6, "activity_id": 1, "type_uid": 600301},
    "cloud_api": {"class_uid": 6003, "category_uid": 6, "activity_id": 1, "type_uid": 600301},
    "database_query": {"class_uid": 6001, "category_uid": 6, "activity_id": 4, "type_uid": 600104},
    "configuration_change": {"class_uid": 6001, "category_uid": 6, "activity_id": 3, "type_uid": 600103},
}

VALID_SEVERITIES = ["info", "low", "medium", "high", "critical"]
VALID_OUTCOMES = ["success", "failure", "unknown"]
VALID_STATUSES = ["new", "in_progress", "resolved", "suppressed"]

# Severity mapping from numeric/alternate formats
SEVERITY_NORMALIZE = {
    "0": "info", "1": "low", "2": "medium", "3": "high", "4": "critical",
    "informational": "info", "warning": "medium",
    "error": "high", "emergency": "critical", "alert": "critical",
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Un-Normalized Events

# COMMAND ----------

with mon.time("fetch_unnormalized"):
    query = (
        qb("events")
        .select(["id", "event_type", "severity", "outcome", "timestamp"])
        .where_null("ocsf_class_uid")
        .where_time_window("timestamp", lookback_minutes * 60)
        .limit(batch_limit)
        .build()
    )
    unnormalized_events = spark.sql(query.sql)
    event_count = unnormalized_events.count()

mon.log_info(f"Events needing OCSF normalization: {event_count}")

if event_count == 0:
    mon.log_complete(rows_processed=0)
    dbutils.notebook.exit('{"status": "no_work", "events_normalized": 0}')

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply OCSF Normalization

# COMMAND ----------

with mon.time("normalize"):
    # Build the class_uid mapping as a chain of when() conditions
    class_uid_expr = lit(0)
    category_uid_expr = lit(0)
    activity_id_expr = lit(0)
    type_uid_expr = lit(0)

    for event_type, ocsf in OCSF_CLASS_MAP.items():
        class_uid_expr = when(col("event_type") == event_type, lit(ocsf["class_uid"])).otherwise(class_uid_expr)
        category_uid_expr = when(col("event_type") == event_type, lit(ocsf["category_uid"])).otherwise(category_uid_expr)
        activity_id_expr = when(col("event_type") == event_type, lit(ocsf["activity_id"])).otherwise(activity_id_expr)
        type_uid_expr = when(col("event_type") == event_type, lit(ocsf["type_uid"])).otherwise(type_uid_expr)

    # Build human-readable category name mapping
    category_name_expr = lit("Unknown")
    for cat_uid, cat_name in OCSF_CATEGORIES.items():
        category_name_expr = when(category_uid_expr == cat_uid, lit(cat_name)).otherwise(category_name_expr)

    # Build human-readable class name mapping
    class_name_expr = lit("Unknown")
    for cls_uid, cls_name in OCSF_CLASS_NAMES.items():
        class_name_expr = when(class_uid_expr == cls_uid, lit(cls_name)).otherwise(class_name_expr)

    # Severity normalization
    severity_norm_expr = col("severity")
    for alt, canonical in SEVERITY_NORMALIZE.items():
        severity_norm_expr = when(
            lower(col("severity")) == alt, lit(canonical)
        ).otherwise(severity_norm_expr)

    normalized = (
        unnormalized_events
        .withColumn("ocsf_class_uid", class_uid_expr)
        .withColumn("ocsf_category_uid", category_uid_expr)
        .withColumn("ocsf_activity_id", activity_id_expr)
        .withColumn("ocsf_type_uid", type_uid_expr)
        .withColumn("ocsf_category_name", category_name_expr)
        .withColumn("ocsf_class_name", class_name_expr)
        .withColumn("severity",
            when(lower(col("severity")).isin(VALID_SEVERITIES), lower(col("severity")))
            .otherwise(severity_norm_expr)
        )
        .withColumn("severity",
            when(col("severity").isin(VALID_SEVERITIES), col("severity"))
            .otherwise(lit("info"))
        )
        .withColumn("outcome",
            when(lower(col("outcome")).isin(VALID_OUTCOMES), lower(col("outcome")))
            .otherwise(lit("unknown"))
        )
        .withColumn("severity_id",
            when(col("severity") == "info", lit(1))
            .when(col("severity") == "low", lit(2))
            .when(col("severity") == "medium", lit(3))
            .when(col("severity") == "high", lit(4))
            .when(col("severity") == "critical", lit(5))
            .otherwise(lit(0))
        )
    )

    # Identify events that couldn't be mapped
    mapped_count = normalized.filter(col("ocsf_class_uid") > 0).count()
    unmapped_count = normalized.filter(col("ocsf_class_uid") == 0).count()

    mon.log_info(f"Mapped: {mapped_count}, Unmapped: {unmapped_count}")
    mon.log_metric("ocsf_mapped", mapped_count)
    mon.log_metric("ocsf_unmapped", unmapped_count)

# COMMAND ----------

# MAGIC %md
# MAGIC ## MERGE Normalized Fields Back

# COMMAND ----------

with mon.time("merge_normalized"):
    normalized.createOrReplaceTempView("_normalized_batch")

    events_table = get_table_path(cfg, "events")
    spark.sql(f"""
        MERGE INTO {events_table} AS target
        USING _normalized_batch AS source
        ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET
            target.ocsf_class_uid = source.ocsf_class_uid,
            target.ocsf_category_uid = source.ocsf_category_uid,
            target.ocsf_activity_id = source.ocsf_activity_id,
            target.ocsf_type_uid = source.ocsf_type_uid,
            target.ocsf_category_name = source.ocsf_category_name,
            target.ocsf_class_name = source.ocsf_class_name,
            target.severity = source.severity,
            target.severity_id = source.severity_id,
            target.outcome = source.outcome
    """)

    spark.catalog.dropTempView("_normalized_batch")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Log Unmapped Event Types for Review

# COMMAND ----------

if unmapped_count > 0:
    unmapped_types = (
        normalized
        .filter(col("ocsf_class_uid") == 0)
        .groupBy("event_type")
        .count()
        .orderBy(col("count").desc())
        .limit(20)
        .collect()
    )

    mon.log_warning(
        f"{unmapped_count} events have no OCSF mapping",
        details=str([(r.event_type, r["count"]) for r in unmapped_types])
    )

    print("\nUnmapped event types (add to OCSF_CLASS_MAP):")
    for row in unmapped_types:
        print(f"  {row.event_type}: {row['count']} events")

# COMMAND ----------

mon.log_complete(rows_processed=event_count)

result = {
    "status": "completed",
    "events_processed": event_count,
    "mapped": mapped_count,
    "unmapped": unmapped_count,
}
print(f"\nResult: {result}")
dbutils.notebook.exit(json.dumps(result))
