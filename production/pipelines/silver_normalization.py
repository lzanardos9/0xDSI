# Databricks notebook source
# MAGIC %md
# MAGIC # DLT Pipeline: Silver Normalization
# MAGIC
# MAGIC Normalizes Bronze events to OCSF v1.1 schema with data quality expectations.
# MAGIC Full class_uid, category_uid, activity_id, and type_uid mapping.

# COMMAND ----------

import dlt
from pyspark.sql.functions import (
    col, from_json, get_json_object, when, lit, coalesce,
    current_timestamp, to_timestamp, regexp_extract, date_format, expr
)

# COMMAND ----------

# OCSF v1.1 full class map: event_type -> (class_uid, category_uid, activity_id, type_uid)
OCSF_CLASS_MAP = {
    # Identity & Access (3xxx)
    "authentication_success": (3002, 3, 1, 300201),
    "authentication_failure": (3002, 3, 2, 300202),
    "auth_success": (3002, 3, 1, 300201),
    "auth_failure": (3002, 3, 2, 300202),
    "login": (3002, 3, 1, 300201),
    "login_failure": (3002, 3, 2, 300202),
    "logout": (3002, 3, 3, 300203),
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
    "connection": (4001, 4, 1, 400101),
    "flow": (4001, 4, 1, 400101),
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
    "alert": (2001, 2, 1, 200101),
    "detection": (2001, 2, 1, 200101),
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

# COMMAND ----------


@dlt.table(
    name="silver_events_dlt",
    comment="Normalized security events in OCSF v1.1 schema",
    table_properties={
        "quality": "silver",
        "delta.autoOptimize.optimizeWrite": "true",
    },
    partition_cols=["partition_date", "source_name"],
)
@dlt.expect_or_drop("valid_event_id", "event_id IS NOT NULL")
@dlt.expect_or_drop("valid_timestamp", "time IS NOT NULL")
@dlt.expect_or_drop("valid_source", "source_name IS NOT NULL")
@dlt.expect("has_category", "category_uid IS NOT NULL")
@dlt.expect("has_severity", "severity_id IS NOT NULL")
def silver_events_dlt():
    """Normalize bronze events to OCSF v1.1 silver format with full field mapping."""
    bronze = dlt.read_stream("bronze_events_dlt")

    # Build OCSF mapping expressions
    class_uid_expr = lit(0)
    category_uid_expr = lit(0)
    activity_id_expr = lit(0)
    type_uid_expr = lit(0)

    for evt_type, (cls_uid, cat_uid, act_id, t_uid) in OCSF_CLASS_MAP.items():
        class_uid_expr = when(col("type_name") == evt_type, lit(cls_uid)).otherwise(class_uid_expr)
        category_uid_expr = when(col("type_name") == evt_type, lit(cat_uid)).otherwise(category_uid_expr)
        activity_id_expr = when(col("type_name") == evt_type, lit(act_id)).otherwise(activity_id_expr)
        type_uid_expr = when(col("type_name") == evt_type, lit(t_uid)).otherwise(type_uid_expr)

    # Fallback regex-based classification for event types not in the map
    category_uid_fallback = (
        when(col("type_name").rlike("(?i)auth|login|session|password|mfa|token"), lit(3))
        .when(col("type_name").rlike("(?i)network|connection|flow|dns|http|firewall|vpn|email"), lit(4))
        .when(col("type_name").rlike("(?i)alert|detection|vulnerability|malware|compliance|anomaly"), lit(2))
        .when(col("type_name").rlike("(?i)file|process|registry|service|module|memory|scheduled"), lit(1))
        .when(col("type_name").rlike("(?i)discovery|scan|inventory"), lit(5))
        .otherwise(lit(6))
    )

    # Category name expression
    category_name_expr = lit("Unknown")
    for cat_uid, cat_name in OCSF_CATEGORY_NAMES.items():
        category_name_expr = when(col("_ocsf_category_uid") == cat_uid, lit(cat_name)).otherwise(category_name_expr)

    return (
        bronze
        .withColumn("_parsed", from_json(col("raw_event"), "MAP<STRING, STRING>"))
        # Map standard fields
        .withColumn("time", coalesce(
            col("event_timestamp"),
            to_timestamp(col("_parsed.timestamp")),
            to_timestamp(col("_parsed.@timestamp")),
            col("ingest_timestamp"),
        ))
        .withColumn("actor_user_id", coalesce(
            col("_parsed.user_id"), col("_parsed.userId"),
            col("_parsed.user"), col("_parsed.username"),
        ))
        .withColumn("src_ip", coalesce(
            col("_parsed.source_ip"), col("_parsed.sourceIp"),
            col("_parsed.src_ip"), col("_parsed.srcAddr"),
        ))
        .withColumn("dst_ip", coalesce(
            col("_parsed.dest_ip"), col("_parsed.destIp"),
            col("_parsed.dst_ip"), col("_parsed.dstAddr"),
        ))
        .withColumn("type_name", coalesce(
            col("_parsed.event_type"), col("_parsed.eventType"),
            col("_parsed.type"), col("_parsed.action"),
        ))
        .withColumn("src_port", coalesce(
            col("_parsed.source_port"), col("_parsed.srcPort"),
        ).cast("int"))
        .withColumn("dst_port", coalesce(
            col("_parsed.dest_port"), col("_parsed.dstPort"),
        ).cast("int"))
        .withColumn("protocol", coalesce(
            col("_parsed.protocol"), col("_parsed.proto"),
        ))
        .withColumn("resource_name", coalesce(
            col("_parsed.resource"), col("_parsed.resource_name"),
            col("_parsed.file_path"), col("_parsed.object"),
        ))
        .withColumn("bytes_in", coalesce(
            col("_parsed.bytes_in"), col("_parsed.bytesIn"),
        ).cast("long"))
        .withColumn("bytes_out", coalesce(
            col("_parsed.bytes_out"), col("_parsed.bytesOut"),
        ).cast("long"))
        # OCSF v1.1 full classification
        .withColumn("class_uid", class_uid_expr)
        .withColumn("_ocsf_category_uid",
            when(category_uid_expr > 0, category_uid_expr)
            .otherwise(category_uid_fallback)
        )
        .withColumn("category_uid", col("_ocsf_category_uid"))
        .withColumn("activity_id",
            when(activity_id_expr > 0, activity_id_expr)
            .otherwise(lit(0))
        )
        .withColumn("type_uid",
            when(type_uid_expr > 0, type_uid_expr)
            .otherwise(col("class_uid") * 100 + col("activity_id"))
        )
        .withColumn("category_name", category_name_expr)
        # Severity normalization (OCSF severity_id: 0=Unknown, 1=Info, 2=Low, 3=Medium, 4=High, 5=Critical)
        .withColumn("severity_id",
            when(coalesce(col("_parsed.severity"), lit("")).rlike("(?i)critical|5"), lit(5))
            .when(coalesce(col("_parsed.severity"), lit("")).rlike("(?i)high|alert|4"), lit(4))
            .when(coalesce(col("_parsed.severity"), lit("")).rlike("(?i)medium|warning|3"), lit(3))
            .when(coalesce(col("_parsed.severity"), lit("")).rlike("(?i)low|2"), lit(2))
            .when(coalesce(col("_parsed.severity"), lit("")).rlike("(?i)info|1"), lit(1))
            .otherwise(lit(1))
        )
        .withColumn("status_id",
            when(coalesce(col("_parsed.status"), col("_parsed.result"), lit(""))
                .rlike("(?i)success|200|allowed|granted"), lit(1))
            .when(coalesce(col("_parsed.status"), col("_parsed.result"), lit(""))
                .rlike("(?i)failure|denied|blocked|rejected"), lit(2))
            .otherwise(lit(0))
        )
        .withColumn("normalized_at", current_timestamp())
        .withColumn("normalization_version", lit("3.0.0"))
        .withColumn("raw_event_id", col("event_id"))
        .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd"))
        .drop("_parsed", "_ocsf_category_uid", "raw_event", "raw_bytes", "ingest_timestamp",
               "event_timestamp", "kafka_offset", "kafka_partition", "kafka_topic")
    )


@dlt.table(
    name="quarantine_events_dlt",
    comment="Events that failed quality checks",
    table_properties={"quality": "quarantine"},
)
def quarantine_events_dlt():
    """Capture events that fail silver quality expectations."""
    return (
        dlt.read_stream("bronze_events_dlt")
        .filter(
            col("raw_event").isNull() |
            (col("event_id").isNull())
        )
        .withColumn("quarantine_reason", lit("Failed DLT expectations"))
        .withColumn("quarantine_timestamp", current_timestamp())
    )
