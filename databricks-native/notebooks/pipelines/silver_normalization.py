# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Silver Layer (Production)
# MAGIC
# MAGIC Transforms Bronze raw events into normalized, enriched, deduplicated Silver tables:
# MAGIC - Full OCSF v1.1 schema normalization (class_uid, category_uid, activity_id, type_uid)
# MAGIC - Severity normalization with numeric severity_id
# MAGIC - Entity extraction (IPs, users, hosts)
# MAGIC - Timestamp normalization across timezones
# MAGIC - Deduplication by event ID
# MAGIC - Computed fields for downstream analytics

# COMMAND ----------

import dlt
from pyspark.sql.functions import *

# COMMAND ----------

# MAGIC %md
# MAGIC ## OCSF v1.1 Schema Mapping

# COMMAND ----------

# Full OCSF class map - maps event_type to OCSF numeric identifiers
OCSF_CLASS_MAP = {
    # Identity & Access (3xxx)
    "authentication_success": (3002, 3, 1, 300201),
    "authentication_failure": (3002, 3, 2, 300202),
    "account_change": (3001, 3, 1, 300101),
    "account_creation": (3001, 3, 1, 300101),
    "account_deletion": (3001, 3, 4, 300104),
    "account_lockout": (3001, 3, 99, 300199),
    "privilege_escalation": (3004, 3, 1, 300401),
    "group_membership_change": (3003, 3, 1, 300301),
    "password_change": (3001, 3, 3, 300103),
    "mfa_verification": (3002, 3, 1, 300201),
    "session_start": (3002, 3, 1, 300201),
    "session_end": (3002, 3, 3, 300203),
    "token_refresh": (3002, 3, 1, 300201),
    # System Activity (1xxx)
    "process_creation": (1001, 1, 1, 100101),
    "process_termination": (1001, 1, 2, 100102),
    "file_creation": (1004, 1, 1, 100401),
    "file_modification": (1004, 1, 3, 100403),
    "file_deletion": (1004, 1, 2, 100402),
    "file_read": (1004, 1, 4, 100404),
    "registry_modification": (1006, 1, 3, 100603),
    "registry_creation": (1006, 1, 1, 100601),
    "service_start": (1002, 1, 1, 100201),
    "service_stop": (1002, 1, 2, 100202),
    "module_load": (1005, 1, 1, 100501),
    "scheduled_task": (1003, 1, 1, 100301),
    "memory_access": (1001, 1, 99, 100199),
    # Network Activity (4xxx)
    "network_connection": (4001, 4, 1, 400101),
    "network_disconnect": (4001, 4, 2, 400102),
    "dns_query": (4003, 4, 1, 400301),
    "dns_response": (4003, 4, 2, 400302),
    "http_request": (4002, 4, 1, 400201),
    "http_response": (4002, 4, 2, 400202),
    "lateral_movement": (4002, 4, 99, 400299),
    "port_scan": (4001, 4, 99, 400199),
    "data_exfiltration": (4010, 4, 99, 401099),
    "firewall_block": (4001, 4, 5, 400105),
    "firewall_allow": (4001, 4, 1, 400101),
    "vpn_connection": (4001, 4, 1, 400101),
    "email_received": (4009, 4, 2, 400902),
    "email_sent": (4009, 4, 1, 400901),
    "email_blocked": (4009, 4, 5, 400905),
    # Findings (2xxx)
    "vulnerability_found": (2001, 2, 1, 200101),
    "compliance_violation": (2003, 2, 1, 200301),
    "malware_detected": (2001, 2, 1, 200101),
    "policy_violation": (2003, 2, 1, 200301),
    "anomaly_detected": (2001, 2, 1, 200101),
    # Discovery (5xxx)
    "asset_discovery": (5001, 5, 1, 500101),
    "service_discovery": (5001, 5, 1, 500101),
    # Application (6xxx)
    "application_access": (6001, 6, 1, 600101),
    "api_call": (6003, 6, 1, 600301),
    "cloud_api": (6003, 6, 1, 600301),
    "database_query": (6001, 6, 4, 600104),
    "configuration_change": (6001, 6, 3, 600103),
}

OCSF_CATEGORY_NAMES = {
    1: "System Activity",
    2: "Findings",
    3: "Identity & Access Management",
    4: "Network Activity",
    5: "Discovery",
    6: "Application Activity",
}

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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver Events: Normalized & Deduplicated

# COMMAND ----------

@dlt.table(
    name="silver_events",
    comment="Normalized, deduplicated, and OCSF-enriched security events",
    table_properties={
        "quality": "silver",
        "delta.autoOptimize.optimizeWrite": "true",
        "delta.autoOptimize.autoCompact": "true",
    },
    partition_cols=["ocsf_category_uid", "ingestion_date"],
)
@dlt.expect_all_or_drop({
    "has_event_type": "event_type IS NOT NULL AND event_type != 'unknown'",
    "has_timestamp": "timestamp IS NOT NULL",
    "has_entity": "source_ip IS NOT NULL OR user_id IS NOT NULL OR hostname IS NOT NULL",
})
def silver_events():
    """
    Merge events from both Autoloader and Kafka sources,
    normalize to OCSF v1.1 schema, add computed analytics columns.
    """
    # Read from both bronze sources
    autoloader_events = dlt.read_stream("bronze_raw_events")
    kafka_events = dlt.read_stream("bronze_kafka_events")

    # Union both sources with aligned schemas
    common_cols = [
        "id", "event_type", "timestamp", "source_ip", "dest_ip",
        "user_id", "hostname", "action", "severity", "description", "ingested_at",
    ]

    for col_name in common_cols:
        if col_name not in autoloader_events.columns:
            autoloader_events = autoloader_events.withColumn(col_name, lit(None).cast("string"))
        if col_name not in kafka_events.columns:
            kafka_events = kafka_events.withColumn(col_name, lit(None).cast("string"))

    unified = autoloader_events.select(*common_cols).union(kafka_events.select(*common_cols))

    # Build OCSF mapping expressions from the full class map
    ocsf_class_uid_expr = lit(0)
    ocsf_category_uid_expr = lit(0)
    ocsf_activity_id_expr = lit(0)
    ocsf_type_uid_expr = lit(0)

    for evt_type, (cls_uid, cat_uid, act_id, type_uid) in OCSF_CLASS_MAP.items():
        ocsf_class_uid_expr = when(col("event_type") == evt_type, lit(cls_uid)).otherwise(ocsf_class_uid_expr)
        ocsf_category_uid_expr = when(col("event_type") == evt_type, lit(cat_uid)).otherwise(ocsf_category_uid_expr)
        ocsf_activity_id_expr = when(col("event_type") == evt_type, lit(act_id)).otherwise(ocsf_activity_id_expr)
        ocsf_type_uid_expr = when(col("event_type") == evt_type, lit(type_uid)).otherwise(ocsf_type_uid_expr)

    # Build category name expression
    ocsf_category_name_expr = lit("Unknown")
    for cat_uid, cat_name in OCSF_CATEGORY_NAMES.items():
        ocsf_category_name_expr = when(ocsf_category_uid_expr == cat_uid, lit(cat_name)).otherwise(ocsf_category_name_expr)

    # Build class name expression
    ocsf_class_name_expr = lit("Unknown")
    for cls_uid, cls_name in OCSF_CLASS_NAMES.items():
        ocsf_class_name_expr = when(ocsf_class_uid_expr == cls_uid, lit(cls_name)).otherwise(ocsf_class_name_expr)

    return (
        unified
        .dropDuplicates(["id"])
        # OCSF v1.1 normalization - full numeric mapping
        .withColumn("ocsf_class_uid", ocsf_class_uid_expr)
        .withColumn("ocsf_category_uid", ocsf_category_uid_expr)
        .withColumn("ocsf_activity_id", ocsf_activity_id_expr)
        .withColumn("ocsf_type_uid", ocsf_type_uid_expr)
        .withColumn("ocsf_category_name", ocsf_category_name_expr)
        .withColumn("ocsf_class_name", ocsf_class_name_expr)
        # Severity normalization to numeric (OCSF severity_id)
        .withColumn("severity",
            when(lower(col("severity")).isin("info", "low", "medium", "high", "critical"), lower(col("severity")))
            .when(lower(col("severity")) == "informational", lit("info"))
            .when(lower(col("severity")) == "warning", lit("medium"))
            .when(lower(col("severity")) == "error", lit("high"))
            .when(lower(col("severity")) == "emergency", lit("critical"))
            .when(lower(col("severity")) == "alert", lit("critical"))
            .otherwise(lit("info"))
        )
        .withColumn("severity_id",
            when(col("severity") == "info", lit(1))
            .when(col("severity") == "low", lit(2))
            .when(col("severity") == "medium", lit(3))
            .when(col("severity") == "high", lit(4))
            .when(col("severity") == "critical", lit(5))
            .otherwise(lit(0))
        )
        # Outcome normalization
        .withColumn("outcome",
            when(lower(col("action")).isin("success", "allow", "granted", "accepted"), lit("success"))
            .when(lower(col("action")).isin("failure", "deny", "denied", "blocked", "rejected"), lit("failure"))
            .otherwise(lit("unknown"))
        )
        # Temporal features
        .withColumn("hour_of_day", hour(col("timestamp")))
        .withColumn("day_of_week", dayofweek(col("timestamp")))
        .withColumn("is_weekend", dayofweek(col("timestamp")).isin(1, 7))
        .withColumn("is_off_hours",
            (hour(col("timestamp")) < 6) | (hour(col("timestamp")) > 22)
        )
        .withColumn("is_business_hours",
            ~col("is_off_hours") & ~col("is_weekend")
        )
        # Entity flags
        .withColumn("has_source_ip", col("source_ip").isNotNull())
        .withColumn("has_user", col("user_id").isNotNull())
        .withColumn("has_host", col("hostname").isNotNull())
        # Ingestion date for partitioning
        .withColumn("ingestion_date", to_date(col("ingested_at")))
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver Alerts: Deduplicated with Metrics

# COMMAND ----------

@dlt.table(
    name="silver_alerts",
    comment="Deduplicated alerts with computed response metrics",
    table_properties={
        "quality": "silver",
        "delta.autoOptimize.optimizeWrite": "true",
    },
)
@dlt.expect("valid_severity", "severity IN ('info', 'low', 'medium', 'high', 'critical')")
@dlt.expect("valid_title", "title IS NOT NULL")
def silver_alerts():
    return (
        dlt.read_stream("bronze_alerts")
        .dropDuplicates(["id"])
        .withColumn("severity_id",
            when(col("severity") == "info", lit(1))
            .when(col("severity") == "low", lit(2))
            .when(col("severity") == "medium", lit(3))
            .when(col("severity") == "high", lit(4))
            .when(col("severity") == "critical", lit(5))
            .otherwise(lit(0))
        )
        .withColumn("response_time_seconds",
            when(col("resolved_at").isNotNull(),
                 unix_timestamp(col("resolved_at")) - unix_timestamp(col("created_at"))
            )
        )
        .withColumn("event_count",
            size(coalesce(col("event_ids"), array()))
        )
        .withColumn("is_false_positive", col("false_positive") == True)
        .withColumn("alert_age_hours",
            (unix_timestamp(current_timestamp()) - unix_timestamp(col("created_at"))) / 3600
        )
        .withColumn("sla_breach",
            when(col("severity").isin("critical", "high") & col("alert_age_hours") > 4 & col("status") == "open",
                 lit(True))
            .otherwise(lit(False))
        )
    )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver IOCs: Active & Confidence-Scored

# COMMAND ----------

@dlt.table(
    name="silver_iocs",
    comment="Active IOCs with normalized confidence and freshness scores",
    table_properties={"quality": "silver"},
)
@dlt.expect("has_value", "value IS NOT NULL")
@dlt.expect("valid_type", "type IN ('ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email')")
def silver_iocs():
    return (
        dlt.read_stream("bronze_ioc_feed")
        .filter(col("active") == True)
        .dropDuplicates(["value", "type"])
        .withColumn("freshness_score",
            when(datediff(current_date(), to_date(col("last_seen"))) < 7, lit(1.0))
            .when(datediff(current_date(), to_date(col("last_seen"))) < 30, lit(0.8))
            .when(datediff(current_date(), to_date(col("last_seen"))) < 90, lit(0.5))
            .otherwise(lit(0.2))
        )
        .withColumn("effective_confidence",
            col("confidence") * col("freshness_score")
        )
    )
