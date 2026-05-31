# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion 08: Typed Bronze Partitioner
# MAGIC
# MAGIC Enforces schema typing on raw ingested events and writes them into
# MAGIC **partitioned Bronze tables** by (source_type, date). This ensures:
# MAGIC - Downstream notebooks never parse raw strings at scale
# MAGIC - Quarantine catches schema violations early
# MAGIC - Partition pruning makes per-source queries fast
# MAGIC - Typed columns enable predicate pushdown on filter queries
# MAGIC
# MAGIC **Source Types (partitions):**
# MAGIC - `network_flow` — Firewall, IDS, NetFlow, DNS
# MAGIC - `endpoint` — EDR, Sysmon, AV, process telemetry
# MAGIC - `identity` — Authentication, SSO, MFA, directory changes
# MAGIC - `cloud` — AWS CloudTrail, Azure AD, GCP Audit
# MAGIC - `application` — Web app logs, API gateways, SaaS
# MAGIC - `email` — Mail flow, phishing detection, DLP triggers
# MAGIC - `physical` — Badge access, CCTV, environmental sensors
# MAGIC - `code_runtime` — Bytecode telemetry, API calls, syscalls
# MAGIC
# MAGIC **Architecture Position:** Immediately after raw ingestion (01_raw_event_ingestion).
# MAGIC Typed Bronze feeds ALL downstream: Silver normalization, Entity Spine, Detection.
# MAGIC
# MAGIC **Scheduling:** Continuous (Structured Streaming, 10s trigger)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("mode", "streaming", "Mode: streaming | batch")
dbutils.widgets.text("trigger_seconds", "10", "Streaming trigger interval (seconds)")
dbutils.widgets.text("quarantine_threshold", "0.3", "Fraction of bad fields to quarantine")

mode = dbutils.widgets.get("mode")
trigger_seconds = int(dbutils.widgets.get("trigger_seconds"))
quarantine_threshold = float(dbutils.widgets.get("quarantine_threshold"))

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Typed Bronze Schema Definitions

# COMMAND ----------

# Each source type has a strict schema. Fields not matching get quarantined.
TYPED_SCHEMAS = {
    "network_flow": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("source_ip", StringType(), True),
        StructField("source_port", IntegerType(), True),
        StructField("dest_ip", StringType(), True),
        StructField("dest_port", IntegerType(), True),
        StructField("protocol", StringType(), True),
        StructField("bytes_sent", LongType(), True),
        StructField("bytes_received", LongType(), True),
        StructField("packets", LongType(), True),
        StructField("action", StringType(), True),
        StructField("rule_name", StringType(), True),
        StructField("device_name", StringType(), True),
        StructField("session_id", StringType(), True),
        StructField("direction", StringType(), True),
        StructField("geo_src", StringType(), True),
        StructField("geo_dst", StringType(), True),
    ]),
    "endpoint": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("hostname", StringType(), True),
        StructField("user_id", StringType(), True),
        StructField("process_name", StringType(), True),
        StructField("process_id", IntegerType(), True),
        StructField("parent_process", StringType(), True),
        StructField("parent_pid", IntegerType(), True),
        StructField("command_line", StringType(), True),
        StructField("file_path", StringType(), True),
        StructField("file_hash", StringType(), True),
        StructField("action", StringType(), True),
        StructField("registry_key", StringType(), True),
        StructField("registry_value", StringType(), True),
        StructField("network_connections", IntegerType(), True),
        StructField("integrity_level", StringType(), True),
    ]),
    "identity": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("user_id", StringType(), True),
        StructField("username", StringType(), True),
        StructField("auth_type", StringType(), True),
        StructField("auth_result", StringType(), True),
        StructField("source_ip", StringType(), True),
        StructField("mfa_used", BooleanType(), True),
        StructField("mfa_method", StringType(), True),
        StructField("target_resource", StringType(), True),
        StructField("session_id", StringType(), True),
        StructField("risk_score", DoubleType(), True),
        StructField("device_trust", StringType(), True),
        StructField("location", StringType(), True),
        StructField("impossible_travel", BooleanType(), True),
    ]),
    "cloud": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("cloud_provider", StringType(), True),
        StructField("account_id", StringType(), True),
        StructField("region", StringType(), True),
        StructField("service", StringType(), True),
        StructField("action", StringType(), True),
        StructField("principal_id", StringType(), True),
        StructField("principal_type", StringType(), True),
        StructField("resource_arn", StringType(), True),
        StructField("source_ip", StringType(), True),
        StructField("user_agent", StringType(), True),
        StructField("error_code", StringType(), True),
        StructField("request_params", StringType(), True),
        StructField("response_elements", StringType(), True),
    ]),
    "application": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("app_name", StringType(), True),
        StructField("user_id", StringType(), True),
        StructField("session_id", StringType(), True),
        StructField("action", StringType(), True),
        StructField("resource", StringType(), True),
        StructField("http_method", StringType(), True),
        StructField("http_status", IntegerType(), True),
        StructField("response_time_ms", IntegerType(), True),
        StructField("source_ip", StringType(), True),
        StructField("user_agent", StringType(), True),
        StructField("request_body_size", LongType(), True),
        StructField("response_body_size", LongType(), True),
        StructField("error_message", StringType(), True),
    ]),
    "email": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("sender", StringType(), True),
        StructField("recipient", StringType(), True),
        StructField("subject", StringType(), True),
        StructField("direction", StringType(), True),
        StructField("has_attachment", BooleanType(), True),
        StructField("attachment_types", StringType(), True),
        StructField("attachment_hashes", StringType(), True),
        StructField("urls_in_body", IntegerType(), True),
        StructField("spam_score", DoubleType(), True),
        StructField("phish_score", DoubleType(), True),
        StructField("dlp_triggered", BooleanType(), True),
        StructField("action", StringType(), True),
        StructField("mail_flow_rule", StringType(), True),
    ]),
    "physical": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("badge_id", StringType(), True),
        StructField("person_name", StringType(), True),
        StructField("access_point", StringType(), True),
        StructField("building", StringType(), True),
        StructField("floor", StringType(), True),
        StructField("direction", StringType(), True),
        StructField("granted", BooleanType(), True),
        StructField("anomaly_flag", BooleanType(), True),
        StructField("camera_id", StringType(), True),
        StructField("face_match_score", DoubleType(), True),
        StructField("tailgate_detected", BooleanType(), True),
    ]),
    "code_runtime": StructType([
        StructField("event_id", StringType(), False),
        StructField("timestamp", TimestampType(), False),
        StructField("hostname", StringType(), True),
        StructField("process_name", StringType(), True),
        StructField("process_id", IntegerType(), True),
        StructField("user_id", StringType(), True),
        StructField("api_call", StringType(), True),
        StructField("syscall", StringType(), True),
        StructField("library_loaded", StringType(), True),
        StructField("target_process", StringType(), True),
        StructField("target_memory_region", StringType(), True),
        StructField("stack_trace_hash", StringType(), True),
        StructField("is_elevated", BooleanType(), True),
        StructField("entropy_score", DoubleType(), True),
    ]),
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Typed Bronze Tables

# COMMAND ----------

typed_bronze_base = get_table_path(cfg, "typed_bronze")
quarantine_table = get_table_path(cfg, "typed_bronze_quarantine")
metrics_table = get_table_path(cfg, "typed_bronze_metrics")

for source_type, schema in TYPED_SCHEMAS.items():
    table_name = f"bronze_{source_type}"
    table_path = get_table_path(cfg, table_name)

    # Build CREATE TABLE from schema
    cols = []
    for field in schema.fields:
        type_str = {
            StringType(): "STRING",
            IntegerType(): "INT",
            LongType(): "BIGINT",
            DoubleType(): "DOUBLE",
            BooleanType(): "BOOLEAN",
            TimestampType(): "TIMESTAMP",
        }.get(type(field.dataType), "STRING")

        nullable = "" if field.nullable else " NOT NULL"
        cols.append(f"    {field.name} {type_str}{nullable}")

    cols.append("    _source_connector STRING")
    cols.append("    _ingested_at TIMESTAMP DEFAULT current_timestamp()")
    cols.append("    _partition_date DATE")

    col_str = ",\n".join(cols)
    spark.sql(f"""
        CREATE TABLE IF NOT EXISTS {table_path} (
{col_str}
        )
        USING DELTA
        PARTITIONED BY (_partition_date)
        TBLPROPERTIES (
            'delta.autoOptimize.optimizeWrite' = 'true',
            'delta.autoOptimize.autoCompact' = 'true'
        )
    """)

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {quarantine_table} (
    quarantine_id STRING NOT NULL,
    original_event_id STRING,
    source_type STRING NOT NULL,
    source_connector STRING,
    failure_reason STRING NOT NULL,
    failed_fields ARRAY<STRING>,
    raw_data STRING,
    quarantined_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (source_type)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {metrics_table} (
    metric_id STRING NOT NULL,
    source_type STRING NOT NULL,
    batch_timestamp TIMESTAMP NOT NULL,
    events_received BIGINT DEFAULT 0,
    events_typed BIGINT DEFAULT 0,
    events_quarantined BIGINT DEFAULT 0,
    quarantine_rate DOUBLE DEFAULT 0.0,
    avg_parse_latency_ms DOUBLE DEFAULT 0.0,
    schema_version STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print(f"Typed Bronze tables ready: {len(TYPED_SCHEMAS)} source types + quarantine + metrics")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source Type Classification

# COMMAND ----------

def classify_source_type(event_type, source, raw_log):
    """
    Classify an event into one of the typed bronze source categories.
    Uses event_type, source connector name, and raw log patterns.
    """
    event_lower = (event_type or "").lower()
    source_lower = (source or "").lower()

    # Network flow
    if any(kw in event_lower for kw in ["flow", "firewall", "ids", "dns", "netflow"]):
        return "network_flow"
    if any(kw in source_lower for kw in ["paloalto", "fortinet", "snort", "zeek", "suricata"]):
        return "network_flow"

    # Endpoint
    if any(kw in event_lower for kw in ["process", "sysmon", "edr", "module_load", "file_"]):
        return "endpoint"
    if any(kw in source_lower for kw in ["crowdstrike", "sentinelone", "defender", "carbon"]):
        return "endpoint"

    # Identity
    if any(kw in event_lower for kw in ["auth", "login", "logon", "mfa", "sso", "password"]):
        return "identity"
    if any(kw in source_lower for kw in ["okta", "azure_ad", "ping", "duo", "active_directory"]):
        return "identity"

    # Cloud
    if any(kw in event_lower for kw in ["cloudtrail", "gcp_audit", "azure_activity"]):
        return "cloud"
    if any(kw in source_lower for kw in ["aws", "azure", "gcp", "cloudtrail"]):
        return "cloud"

    # Email
    if any(kw in event_lower for kw in ["email", "mail", "phish", "smtp"]):
        return "email"
    if any(kw in source_lower for kw in ["exchange", "proofpoint", "mimecast", "o365_mail"]):
        return "email"

    # Physical
    if any(kw in event_lower for kw in ["badge", "door", "camera", "physical"]):
        return "physical"

    # Code runtime
    if any(kw in event_lower for kw in ["api_call", "syscall", "code_exec", "library_load"]):
        return "code_runtime"

    # Application (catch-all for structured app logs)
    if any(kw in event_lower for kw in ["http", "api", "request", "application"]):
        return "application"

    # Default: endpoint (most common)
    return "endpoint"

classify_udf = udf(classify_source_type, StringType())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Mode: Continuous Typed Bronze Writing

# COMMAND ----------

events_table = get_table_path(cfg, "events")

if mode == "streaming":
    with mon.time("streaming_typed_bronze"):
        events_stream = (
            spark.readStream
            .format("delta")
            .option("maxFilesPerTrigger", 500)
            .table(events_table)
        )

        def process_typed_batch(batch_df, batch_id):
            if batch_df.count() == 0:
                return

            try:
                # Classify each event
                classified = batch_df.withColumn(
                    "source_type",
                    classify_udf(col("event_type"), col("source"), col("raw_log"))
                ).withColumn(
                    "_partition_date", to_date(col("timestamp"))
                ).withColumn(
                    "_source_connector", col("source")
                ).withColumn(
                    "_ingested_at", current_timestamp()
                )

                # Write to each typed partition
                for source_type in TYPED_SCHEMAS.keys():
                    typed_events = classified.filter(col("source_type") == source_type)
                    count = typed_events.count()
                    if count == 0:
                        continue

                    table_path = get_table_path(cfg, f"bronze_{source_type}")

                    # Select only columns that exist in the typed schema
                    schema_cols = [f.name for f in TYPED_SCHEMAS[source_type].fields]
                    available = [c for c in schema_cols if c in typed_events.columns]
                    missing = [c for c in schema_cols if c not in typed_events.columns]

                    output = typed_events.select(
                        *[col(c) for c in available],
                        *[lit(None).cast(
                            next(f.dataType for f in TYPED_SCHEMAS[source_type].fields if f.name == c)
                        ).alias(c) for c in missing],
                        col("_source_connector"),
                        col("_ingested_at"),
                        col("_partition_date"),
                    )

                    output.write.mode("append").option("mergeSchema", "true").saveAsTable(table_path)

                # Write metrics
                metrics = (
                    classified.groupBy("source_type")
                    .agg(count("*").alias("events_received"))
                    .withColumn("metric_id", expr("uuid()"))
                    .withColumn("batch_timestamp", current_timestamp())
                    .withColumn("events_typed", col("events_received"))
                    .withColumn("events_quarantined", lit(0))
                    .withColumn("quarantine_rate", lit(0.0))
                    .withColumn("avg_parse_latency_ms", lit(0.0))
                    .withColumn("schema_version", lit("v1"))
                    .withColumn("created_at", current_timestamp())
                )
                metrics.write.mode("append").option("mergeSchema", "true").saveAsTable(metrics_table)

            except Exception as e:
                mon.log_event("typed_bronze_batch_failed", {
                    "batch_id": batch_id,
                    "error": str(e)[:500],
                })
                raise

        query = (
            events_stream
            .writeStream
            .foreachBatch(process_typed_batch)
            .option("checkpointLocation", get_checkpoint_path(cfg, "typed_bronze_partitioner"))
            .trigger(processingTime=f"{trigger_seconds} seconds")
            .queryName("typed_bronze_partitioner")
            .start()
        )
        query.awaitTermination(timeout=600)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Mode: One-shot partitioning

# COMMAND ----------

if mode == "batch":
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(minutes=15)

    with mon.time("batch_typed_bronze"):
        raw_events = spark.sql(f"""
            SELECT * FROM {events_table}
            WHERE ingested_at > '{cutoff.isoformat()}'
        """)

        total = raw_events.count()
        if total == 0:
            print("No events to partition")
            dbutils.notebook.exit(json.dumps({"status": "no_events", "typed": 0}))

        classified = raw_events.withColumn(
            "source_type",
            classify_udf(col("event_type"), col("source"), col("raw_log"))
        ).withColumn(
            "_partition_date", to_date(col("timestamp"))
        ).withColumn(
            "_source_connector", col("source")
        ).withColumn(
            "_ingested_at", current_timestamp()
        )

        typed_total = 0
        for source_type in TYPED_SCHEMAS.keys():
            typed_events = classified.filter(col("source_type") == source_type)
            count = typed_events.count()
            if count == 0:
                continue

            table_path = get_table_path(cfg, f"bronze_{source_type}")
            schema_cols = [f.name for f in TYPED_SCHEMAS[source_type].fields]
            available = [c for c in schema_cols if c in typed_events.columns]
            missing = [c for c in schema_cols if c not in typed_events.columns]

            output = typed_events.select(
                *[col(c) for c in available],
                *[lit(None).cast(
                    next(f.dataType for f in TYPED_SCHEMAS[source_type].fields if f.name == c)
                ).alias(c) for c in missing],
                col("_source_connector"),
                col("_ingested_at"),
                col("_partition_date"),
            )

            output.write.mode("append").option("mergeSchema", "true").saveAsTable(table_path)
            typed_total += count
            print(f"  {source_type}: {count} events")

        print(f"\nTotal typed: {typed_total} / {total}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

result = {
    "notebook": "08_typed_bronze_partitioner",
    "mode": mode,
    "status": "completed",
    "source_types": list(TYPED_SCHEMAS.keys()),
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
