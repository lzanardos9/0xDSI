# Databricks notebook source
# MAGIC %md
# MAGIC # 04: Quarantine Handler (Production)
# MAGIC
# MAGIC Manages the dead-letter queue for events that failed ingestion:
# MAGIC - Attempts auto-recovery via structural parsing
# MAGIC - Uses LLM for intelligent field inference on ambiguous records
# MAGIC - Purges aged-out events (configurable TTL)
# MAGIC - Generates data quality metrics and alerts
# MAGIC - Retries with exponential backoff for transient failures

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("max_recovery_batch", "500", "Max events to attempt recovery per run")
dbutils.widgets.text("ttl_days", "7", "Days to keep unrecoverable quarantined events")
dbutils.widgets.text("enable_llm_recovery", "true", "Use LLM for ambiguous record parsing")

max_recovery_batch = int(dbutils.widgets.get("max_recovery_batch"))
ttl_days = int(dbutils.widgets.get("ttl_days"))
enable_llm_recovery = dbutils.widgets.get("enable_llm_recovery").lower() == "true"

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Quarantine Table Exists

# COMMAND ----------

ensure_table_exists(
    spark, "quarantined_events",
    schema_ddl="""
        id STRING DEFAULT uuid(),
        original_data STRING,
        quarantine_reason STRING,
        source STRING,
        source_connector STRING,
        quarantined_at TIMESTAMP DEFAULT current_timestamp(),
        recovered BOOLEAN DEFAULT false,
        recovered_at TIMESTAMP,
        recovery_method STRING,
        retry_count INT DEFAULT 0,
        last_retry_at TIMESTAMP
    """,
    catalog=cfg.catalog, schema=cfg.schema,
    partition_by=["recovered"],
    comment="Dead-letter queue for events that failed ingestion parsing",
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Quarantined Events for Recovery

# COMMAND ----------

with mon.time("fetch_quarantined"):
    quarantined_query = (
        qb("quarantined_events")
        .select(["id", "original_data", "quarantine_reason", "source", "retry_count", "quarantined_at"])
        .where_eq("recovered", False)
        .where_time_window("quarantined_at", ttl_days * 86400)
        .where_lt("retry_count", 3)
        .order_by("quarantined_at", desc=False)
        .limit(max_recovery_batch)
        .build()
    )
    quarantined_df = spark.sql(quarantined_query.sql)
    quarantine_count = quarantined_df.count()

mon.log_info(f"Quarantined events eligible for recovery: {quarantine_count}")

if quarantine_count == 0:
    mon.log_complete(rows_processed=0)
    dbutils.notebook.exit('{"status": "no_work", "recovered": 0, "purged": 0}')

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 1: Structural Auto-Recovery
# MAGIC Try to parse quarantined records using multiple format strategies.

# COMMAND ----------

# Common JSON event structure variants
PARSE_SCHEMAS = [
    # Standard format
    "event_type STRING, timestamp STRING, source STRING, source_ip STRING, dest_ip STRING, user_id STRING, severity STRING, action STRING, outcome STRING, description STRING",
    # Syslog-like format
    "facility STRING, priority STRING, message STRING, host STRING, timestamp STRING",
    # CEF format embedded
    "cef_header STRING, device_vendor STRING, device_product STRING, name STRING, severity STRING",
    # AWS CloudTrail format
    "eventName STRING, eventSource STRING, sourceIPAddress STRING, userIdentity STRUCT<type: STRING, arn: STRING>, eventTime STRING",
]

with mon.time("structural_recovery"):
    recovered_events = []
    structural_recovered_ids = []

    quarantined_rows = quarantined_df.collect()

    for row in quarantined_rows:
        raw_data = row.original_data
        if not raw_data or not raw_data.strip():
            continue

        # Try each parse schema
        event_parsed = None
        for schema_str in PARSE_SCHEMAS:
            try:
                test_df = spark.createDataFrame([(raw_data,)], ["raw"])
                parsed = test_df.select(
                    from_json(col("raw"), schema_str).alias("p")
                ).collect()[0].p

                if parsed and parsed.event_type:
                    event_parsed = {
                        "event_type": parsed.event_type,
                        "timestamp": parsed.timestamp,
                        "source_ip": getattr(parsed, "source_ip", None),
                        "source": getattr(parsed, "source", None),
                    }
                    break
            except Exception:
                continue

        # Try plain JSON parse for known fields
        if not event_parsed:
            try:
                data = json.loads(raw_data)
                if isinstance(data, dict):
                    event_type = (
                        data.get("event_type") or data.get("eventName") or
                        data.get("type") or data.get("name")
                    )
                    if event_type:
                        event_parsed = {
                            "event_type": str(event_type),
                            "timestamp": data.get("timestamp") or data.get("eventTime") or data.get("time"),
                            "source_ip": data.get("source_ip") or data.get("sourceIPAddress") or data.get("src_ip"),
                            "source": data.get("source") or data.get("eventSource"),
                        }
            except (json.JSONDecodeError, TypeError):
                pass

        if event_parsed:
            recovered_events.append(event_parsed)
            structural_recovered_ids.append(row.id)

    structural_count = len(recovered_events)
    mon.log_info(f"Structurally recovered: {structural_count}/{quarantine_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 2: LLM-Assisted Recovery
# MAGIC For records that failed structural parsing, use LLM to infer fields.

# COMMAND ----------

llm_recovered_ids = []

if enable_llm_recovery and quarantine_count > structural_count:
    unrecovered_rows = [
        r for r in quarantined_rows
        if r.id not in structural_recovered_ids and r.original_data
    ][:50]  # Limit LLM calls

    with mon.time("llm_recovery"):
        for row in unrecovered_rows:
            raw_data = row.original_data[:2000]  # Truncate for token budget
            try:
                response = llm.chat(
                    system=(
                        "You extract security event fields from malformed log data. "
                        "Return ONLY valid JSON with these fields: "
                        "event_type, timestamp, source_ip, dest_ip, user_id, severity, action, description. "
                        "Use null for fields you cannot determine. "
                        "event_type must be one of: authentication_failure, authentication_success, "
                        "process_creation, file_modification, network_connection, dns_query, "
                        "lateral_movement, data_exfiltration, privilege_escalation, or a reasonable category."
                    ),
                    user=f"Extract event fields from this raw data:\n{raw_data}",
                    temperature=0.0,
                    max_tokens=256,
                    json_mode=True,
                )

                parsed = llm.extract_json(response)
                if parsed and parsed.get("event_type"):
                    recovered_events.append({
                        "event_type": parsed["event_type"],
                        "timestamp": parsed.get("timestamp"),
                        "source_ip": parsed.get("source_ip"),
                        "source": parsed.get("source"),
                        "user_id": parsed.get("user_id"),
                        "severity": parsed.get("severity"),
                        "description": parsed.get("description"),
                    })
                    llm_recovered_ids.append(row.id)
                    mon.log_llm_call(
                        llm._primary_endpoint, response.tokens_total,
                        response.latency_ms, response.fallback_used
                    )

            except (LLMBudgetExhausted, LLMAllEndpointsFailed) as e:
                mon.log_warning(f"LLM recovery stopped: {e}")
                break
            except Exception as e:
                continue

    mon.log_info(f"LLM recovered: {len(llm_recovered_ids)} additional events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Recovered Events to Bronze Table

# COMMAND ----------

total_recovered = len(recovered_events)

if total_recovered > 0:
    with mon.time("write_recovered"):
        recovery_schema = StructType([
            StructField("event_type", StringType(), True),
            StructField("timestamp", StringType(), True),
            StructField("source_ip", StringType(), True),
            StructField("source", StringType(), True),
            StructField("user_id", StringType(), True),
            StructField("severity", StringType(), True),
            StructField("description", StringType(), True),
        ])

        recovered_df = (
            spark.createDataFrame(recovered_events, schema=recovery_schema)
            .withColumn("id", expr("uuid()"))
            .withColumn("timestamp",
                coalesce(to_timestamp(col("timestamp")), current_timestamp())
            )
            .withColumn("severity",
                when(col("severity").isin("info", "low", "medium", "high", "critical"), col("severity"))
                .otherwise(lit("info"))
            )
            .withColumn("ingested_at", current_timestamp())
            .withColumn("source_connector", lit("quarantine_recovery"))
        )

        safe_append(
            recovered_df,
            "events",
            catalog=cfg.catalog,
            schema=cfg.schema,
            deduplicate_on=["event_type", "timestamp", "source_ip"],
        )

    # Mark recovered in quarantine table
    all_recovered_ids = structural_recovered_ids + llm_recovered_ids
    if all_recovered_ids:
        ids_in = safe_in_list(all_recovered_ids[:500])
        recovery_method = "structural"
        update_sql = build_update(
            "quarantined_events",
            set_values={"recovered": "true", "recovered_at": "current_timestamp()"},
            where_conditions={},
            catalog=cfg.catalog, schema=cfg.schema,
        )
        # Use raw SQL for IN clause (safe_in_list already escapes)
        events_table = get_table_path(cfg, "quarantined_events")
        spark.sql(f"""
            UPDATE {events_table}
            SET recovered = true, recovered_at = current_timestamp(),
                recovery_method = CASE
                    WHEN id IN {safe_in_list(structural_recovered_ids)} THEN 'structural'
                    ELSE 'llm_assisted'
                END
            WHERE id IN {ids_in}
        """)

    mon.log_info(f"Total recovered: {total_recovered} (structural={structural_count}, llm={len(llm_recovered_ids)})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 3: Increment Retry Count for Failures

# COMMAND ----------

failed_ids = [
    r.id for r in quarantined_rows
    if r.id not in structural_recovered_ids and r.id not in llm_recovered_ids
]

if failed_ids:
    failed_in = safe_in_list(failed_ids[:500])
    events_table = get_table_path(cfg, "quarantined_events")
    spark.sql(f"""
        UPDATE {events_table}
        SET retry_count = retry_count + 1, last_retry_at = current_timestamp()
        WHERE id IN {failed_in}
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 4: Purge Aged-Out Events

# COMMAND ----------

with mon.time("purge_aged"):
    events_table = get_table_path(cfg, "quarantined_events")
    purge_result = spark.sql(f"""
        SELECT COUNT(*) as count FROM {events_table}
        WHERE recovered = false
        AND retry_count >= 3
        AND quarantined_at < current_timestamp() - INTERVAL {ttl_days} DAYS
    """).collect()[0]

    purge_count = purge_result["count"]

    if purge_count > 0:
        spark.sql(f"""
            DELETE FROM {events_table}
            WHERE recovered = false
            AND retry_count >= 3
            AND quarantined_at < current_timestamp() - INTERVAL {ttl_days} DAYS
        """)
        mon.log_info(f"Purged {purge_count} unrecoverable events (TTL={ttl_days} days)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Quality Report

# COMMAND ----------

events_table_path = get_table_path(cfg, "events")
quarantine_table_path = get_table_path(cfg, "quarantined_events")

quality_stats = spark.sql(f"""
    SELECT
        (SELECT COUNT(*) FROM {events_table_path}
         WHERE ingested_at > current_timestamp() - INTERVAL 1 HOUR) as events_1h,
        (SELECT COUNT(*) FROM {quarantine_table_path}
         WHERE quarantined_at > current_timestamp() - INTERVAL 1 HOUR AND recovered = false) as quarantined_1h,
        (SELECT COUNT(*) FROM {quarantine_table_path}
         WHERE recovered = true AND recovered_at > current_timestamp() - INTERVAL 1 HOUR) as recovered_1h
""").collect()[0]

total_ingested = quality_stats.events_1h + quality_stats.quarantined_1h
quality_rate = (quality_stats.events_1h / max(total_ingested, 1)) * 100

mon.log_metric("quality_rate_pct", quality_rate)
mon.log_metric("events_1h", quality_stats.events_1h)
mon.log_metric("quarantined_1h", quality_stats.quarantined_1h)
mon.log_metric("recovered_1h", quality_stats.recovered_1h)

# Alert if quality drops below threshold
if quality_rate < 95.0 and total_ingested > 100:
    mon.log_warning(
        f"Data quality below threshold: {quality_rate:.1f}% (target: 95%)",
        details=f"Events: {quality_stats.events_1h}, Quarantined: {quality_stats.quarantined_1h}"
    )

# COMMAND ----------

mon.log_complete(rows_processed=quarantine_count)

result = {
    "status": "completed",
    "reviewed": quarantine_count,
    "recovered_structural": structural_count,
    "recovered_llm": len(llm_recovered_ids),
    "total_recovered": total_recovered,
    "purged": purge_count,
    "quality_rate_pct": round(quality_rate, 1),
}
print(f"\nQuarantine Handler Result: {json.dumps(result, indent=2)}")
dbutils.notebook.exit(json.dumps(result))
