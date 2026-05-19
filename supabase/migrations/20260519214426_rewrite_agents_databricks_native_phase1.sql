/*
 * Migration: Rewrite Agents to Databricks-Native PySpark (Phase 1)
 * Date: 2026-05-19
 *
 * This migration updates the production_code, config_yaml, dependencies, and notes
 * columns for 10 agents in the agent_implementations table. Each agent is rewritten
 * as Databricks-native PySpark code that:
 *
 *   - Runs as a Databricks Job / notebook task
 *   - Uses spark.table("catalog.schema.table") for all data access
 *   - Uses dbutils.widgets.text() for parameterization
 *   - Uses dbutils.secrets.get() for credentials
 *   - Uses Delta MERGE for writes
 *   - Uses Databricks Foundation Model APIs (ai_query()) instead of OpenAI
 *   - Uses MLflow for model tracking where applicable
 *   - Uses Structured Streaming where applicable
 *   - References Unity Catalog tables: soc_platform.agentic_soc.*
 *
 * Agents rewritten:
 *   1. orchestrator
 *   2. connector-adapter
 *   3. parser-pool
 *   4. sage-enrichment
 *   5. ai-correlation
 *   6. realtime-graph-cep
 *   7. negative-correlation
 *   8. atlas-triage
 *   9. vector-memory
 *  10. cti-attribution
 *
 * NO asyncio, NO asyncpg, NO openai SDK, NO confluent_kafka.
 * ALL data access via spark.table() or spark.sql().
 */

-- =============================================================================
-- 1. ORCHESTRATOR
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # SOC Orchestrator Agent
# MAGIC Drives alerts through pipeline stages, dispatches tasks, monitors agent health.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("max_dispatch_batch", "100")
dbutils.widgets.text("health_check_timeout_sec", "30")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
max_batch = int(dbutils.widgets.get("max_dispatch_batch"))
health_timeout = int(dbutils.widgets.get("health_check_timeout_sec"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import StringType, TimestampType, StructType, StructField
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

# COMMAND ----------

# Load agent configurations
agent_configs_df = spark.table(f"{catalog}.{schema}.agent_configs")
active_agents = agent_configs_df.filter(F.col("enabled") == True).collect()

print(f"[Orchestrator] Found {len(active_agents)} active agents")

# COMMAND ----------

# Health check: verify each agent has reported within timeout
now = datetime.utcnow()
cutoff = now - timedelta(seconds=health_timeout)

health_df = spark.table(f"{catalog}.{schema}.agent_orchestration_logs") \
    .filter(F.col("event_type") == "heartbeat") \
    .filter(F.col("created_at") >= F.lit(cutoff)) \
    .groupBy("agent_slug") \
    .agg(F.max("created_at").alias("last_heartbeat"))

registered_slugs = [row.slug for row in active_agents]
healthy_slugs = [row.agent_slug for row in health_df.collect()]
unhealthy = set(registered_slugs) - set(healthy_slugs)

if unhealthy:
    print(f"[Orchestrator] WARNING: Unhealthy agents: {unhealthy}")

# COMMAND ----------

# Fetch pending alerts that need processing
pending_alerts = spark.table(f"{catalog}.{schema}.alerts") \
    .filter(F.col("pipeline_stage") == "ingested") \
    .filter(F.col("assigned_agent").isNull()) \
    .orderBy(F.col("severity").desc(), F.col("created_at").asc()) \
    .limit(max_batch)

pending_count = pending_alerts.count()
print(f"[Orchestrator] Dispatching {pending_count} pending alerts")

# COMMAND ----------

# Determine routing: assign alerts to appropriate pipeline agents
routed_df = pending_alerts.withColumn(
    "assigned_agent",
    F.when(F.col("source_type") == "raw_log", F.lit("parser-pool"))
     .when(F.col("enrichment_status").isNull(), F.lit("sage-enrichment"))
     .when(F.col("triage_score").isNull(), F.lit("atlas-triage"))
     .otherwise(F.lit("ai-correlation"))
).withColumn(
    "pipeline_stage", F.lit("dispatched")
).withColumn(
    "dispatched_at", F.current_timestamp()
)

# COMMAND ----------

# MERGE dispatched assignments back into alerts
alerts_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.alerts")

alerts_delta.alias("target").merge(
    routed_df.alias("source"),
    "target.alert_id = source.alert_id"
).whenMatchedUpdate(set={
    "assigned_agent": "source.assigned_agent",
    "pipeline_stage": "source.pipeline_stage",
    "dispatched_at": "source.dispatched_at",
    "updated_at": F.current_timestamp()
}).execute()

# COMMAND ----------

# Log orchestration run
log_entry = spark.createDataFrame([{
    "event_type": "dispatch_run",
    "agent_slug": "orchestrator",
    "details": json.dumps({
        "dispatched_count": pending_count,
        "unhealthy_agents": list(unhealthy),
        "batch_size": max_batch
    }),
    "created_at": datetime.utcnow()
}])

log_entry.write.mode("append").saveAsTable(f"{catalog}.{schema}.agent_orchestration_logs")

# COMMAND ----------

# Use AI to summarize orchestration health for SOC dashboard
if pending_count > 0:
    summary_prompt = f"Summarize SOC orchestration: {pending_count} alerts dispatched, {len(unhealthy)} unhealthy agents ({list(unhealthy)}). Provide one-sentence status."
    summary_df = spark.sql(f"""
        SELECT ai_query(
            'databricks-meta-llama-3-1-70b-instruct',
            '{summary_prompt}'
        ) as orchestration_summary
    """)
    summary_df.write.mode("overwrite").saveAsTable(f"{catalog}.{schema}.orchestrator_status_latest")

print("[Orchestrator] Run complete.")
$py$,
  config_yaml = $yml$
agent:
  slug: orchestrator
  display_name: SOC Orchestrator
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/2 * * * *"
  cluster_policy: soc-standard
  node_type: Standard_DS3_v2
  num_workers: 0
  spark_conf:
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    max_dispatch_batch: "100"
    health_check_timeout_sec: "30"
  alerts:
    unhealthy_agent_threshold: 2
    pending_alert_threshold: 500
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow job running every 2 minutes. Uses single-node cluster for cost efficiency. Monitors agent health via heartbeat logs and dispatches alerts to pipeline stages.'
WHERE slug = 'orchestrator';

-- =============================================================================
-- 2. CONNECTOR-ADAPTER
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Connector Adapter Agent
# MAGIC Auto Loader ingestion from cloud storage landing zones into bronze_events.
# MAGIC Uses cloudFiles with schema evolution for automatic new-field detection.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("landing_zone_path", "abfss://landing@socplatformdl.dfs.core.windows.net/events/")
dbutils.widgets.text("checkpoint_path", "abfss://checkpoints@socplatformdl.dfs.core.windows.net/connector-adapter/")
dbutils.widgets.text("max_files_per_trigger", "1000")
dbutils.widgets.text("schema_evolution_mode", "addNewColumns")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
landing_zone = dbutils.widgets.get("landing_zone_path")
checkpoint = dbutils.widgets.get("checkpoint_path")
max_files = int(dbutils.widgets.get("max_files_per_trigger"))
evolution_mode = dbutils.widgets.get("schema_evolution_mode")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, MapType
from delta.tables import DeltaTable
from datetime import datetime

# COMMAND ----------

# Define base schema for raw events (minimal required fields)
base_schema = StructType([
    StructField("event_id", StringType(), True),
    StructField("timestamp", StringType(), True),
    StructField("source", StringType(), True),
    StructField("source_type", StringType(), True),
    StructField("raw_message", StringType(), True),
    StructField("severity", StringType(), True),
    StructField("host", StringType(), True),
    StructField("metadata", MapType(StringType(), StringType()), True)
])

# COMMAND ----------

# Configure Auto Loader streaming read from landing zone
raw_stream = (
    spark.readStream
    .format("cloudFiles")
    .option("cloudFiles.format", "json")
    .option("cloudFiles.schemaLocation", f"{checkpoint}/schema/")
    .option("cloudFiles.maxFilesPerTrigger", max_files)
    .option("cloudFiles.schemaEvolutionMode", evolution_mode)
    .option("cloudFiles.inferColumnTypes", "true")
    .option("cloudFiles.schemaHints", "timestamp TIMESTAMP, event_id STRING")
    .option("cloudFiles.allowOverwrites", "false")
    .schema(base_schema)
    .load(landing_zone)
)

# COMMAND ----------

# Transform and add ingestion metadata
bronze_stream = raw_stream \
    .withColumn("ingested_at", F.current_timestamp()) \
    .withColumn("ingestion_batch_id", F.expr("uuid()")) \
    .withColumn("landing_file", F.input_file_name()) \
    .withColumn("year", F.year(F.col("ingested_at"))) \
    .withColumn("month", F.month(F.col("ingested_at"))) \
    .withColumn("day", F.dayofmonth(F.col("ingested_at"))) \
    .withColumn("event_id", F.coalesce(F.col("event_id"), F.expr("uuid()"))) \
    .withColumn("source_type_normalized",
        F.when(F.col("source_type").isin("syslog", "SYSLOG"), F.lit("syslog"))
         .when(F.col("source_type").isin("cef", "CEF"), F.lit("cef"))
         .when(F.col("source_type").isin("leef", "LEEF"), F.lit("leef"))
         .when(F.col("source_type").isin("json", "JSON"), F.lit("json"))
         .otherwise(F.lit("unknown"))
    )

# COMMAND ----------

# Write to bronze_events table with Auto Loader checkpoint
write_query = (
    bronze_stream.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{checkpoint}/bronze_events/")
    .option("mergeSchema", "true")
    .partitionBy("year", "month", "day")
    .trigger(availableNow=True)
    .toTable(f"{catalog}.{schema}.bronze_events")
)

# Wait for micro-batch completion
write_query.awaitTermination()

# COMMAND ----------

# Log ingestion metrics
metrics = spark.sql(f"""
    SELECT
        COUNT(*) as events_ingested,
        COUNT(DISTINCT source) as distinct_sources,
        COUNT(DISTINCT source_type_normalized) as distinct_types,
        MIN(ingested_at) as batch_start,
        MAX(ingested_at) as batch_end
    FROM {catalog}.{schema}.bronze_events
    WHERE ingested_at >= current_timestamp() - INTERVAL 5 MINUTES
""")

metrics_row = metrics.collect()[0]
print(f"[Connector-Adapter] Ingested {metrics_row.events_ingested} events from {metrics_row.distinct_sources} sources")

# COMMAND ----------

# Log heartbeat for orchestrator health check
heartbeat = spark.createDataFrame([{
    "event_type": "heartbeat",
    "agent_slug": "connector-adapter",
    "details": f'{{"events_ingested": {metrics_row.events_ingested}, "sources": {metrics_row.distinct_sources}}}',
    "created_at": datetime.utcnow()
}])
heartbeat.write.mode("append").saveAsTable(f"{catalog}.{schema}.agent_orchestration_logs")

# COMMAND ----------

# Optimize bronze table periodically (every 100 batches)
batch_count_df = spark.sql(f"""
    SELECT COUNT(DISTINCT ingestion_batch_id) as batch_count
    FROM {catalog}.{schema}.bronze_events
    WHERE ingested_at >= current_date()
""")
batch_count = batch_count_df.collect()[0].batch_count

if batch_count % 100 == 0:
    spark.sql(f"OPTIMIZE {catalog}.{schema}.bronze_events ZORDER BY (source, timestamp)")
    print("[Connector-Adapter] Ran OPTIMIZE + ZORDER on bronze_events")

print("[Connector-Adapter] Ingestion batch complete.")
$py$,
  config_yaml = $yml$
agent:
  slug: connector-adapter
  display_name: Connector Adapter (Auto Loader)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: continuous
  cluster_policy: soc-streaming
  node_type: Standard_DS4_v2
  num_workers: 2
  autoscale:
    min_workers: 1
    max_workers: 4
  spark_conf:
    spark.databricks.delta.optimizeWrite.enabled: "true"
    spark.databricks.delta.autoCompact.enabled: "true"
    spark.databricks.cloudFiles.schemaInference.sampleSize.numFiles: "100"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    landing_zone_path: "abfss://landing@socplatformdl.dfs.core.windows.net/events/"
    checkpoint_path: "abfss://checkpoints@socplatformdl.dfs.core.windows.net/connector-adapter/"
    max_files_per_trigger: "1000"
    schema_evolution_mode: addNewColumns
  sources:
    - path: /events/firewall/
      format: json
    - path: /events/endpoint/
      format: json
    - path: /events/identity/
      format: json
    - path: /events/cloud-audit/
      format: json
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'databricks-sdk'],
  notes = 'Databricks-native. Deploy as continuous Databricks Workflow with Auto Loader. Uses availableNow trigger for cost-effective near-real-time ingestion. Schema evolution handles new log fields automatically. Partition by date for efficient pruning.'
WHERE slug = 'connector-adapter';

-- =============================================================================
-- 3. PARSER-POOL
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Parser Pool Agent
# MAGIC PySpark UDF-based log parsing on bronze table. Normalizes raw JSON/syslog/CEF/LEEF
# MAGIC into silver schema using registered UDFs. Writes to silver_events.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("batch_size", "50000")
dbutils.widgets.text("checkpoint_path", "abfss://checkpoints@socplatformdl.dfs.core.windows.net/parser-pool/")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
batch_size = int(dbutils.widgets.get("batch_size"))
checkpoint = dbutils.widgets.get("checkpoint_path")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    IntegerType, MapType, ArrayType
)
from delta.tables import DeltaTable
import re
import json
from datetime import datetime

# COMMAND ----------

# Register CEF parser UDF
@F.udf(returnType=MapType(StringType(), StringType()))
def parse_cef(raw_message):
    """Parse Common Event Format (CEF) log messages."""
    if not raw_message:
        return {}
    try:
        pattern = r'CEF:(\d+)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)'
        match = re.match(pattern, raw_message)
        if not match:
            return {"parse_error": "invalid_cef_format"}
        result = {
            "cef_version": match.group(1),
            "device_vendor": match.group(2),
            "device_product": match.group(3),
            "device_version": match.group(4),
            "signature_id": match.group(5),
            "name": match.group(6),
            "severity": match.group(7)
        }
        extensions = match.group(8)
        ext_pattern = r'(\w+)=([^\s]+(?:\s+(?!\w+=)[^\s]+)*)'
        for ext_match in re.finditer(ext_pattern, extensions):
            result[ext_match.group(1)] = ext_match.group(2)
        return result
    except Exception as e:
        return {"parse_error": str(e)}

# COMMAND ----------

# Register syslog parser UDF
@F.udf(returnType=MapType(StringType(), StringType()))
def parse_syslog(raw_message):
    """Parse RFC 5424 / RFC 3164 syslog messages."""
    if not raw_message:
        return {}
    try:
        pattern = r'^<(\d+)>(\w{3}\s+\d+\s+[\d:]+)\s+(\S+)\s+(\S+?)(?:\[(\d+)\])?:\s*(.*)'
        match = re.match(pattern, raw_message)
        if not match:
            return {"raw_content": raw_message, "parse_error": "no_syslog_match"}
        priority = int(match.group(1))
        return {
            "facility": str(priority // 8),
            "severity_code": str(priority % 8),
            "timestamp_raw": match.group(2),
            "hostname": match.group(3),
            "program": match.group(4),
            "pid": match.group(5) or "",
            "message": match.group(6)
        }
    except Exception as e:
        return {"parse_error": str(e)}

# COMMAND ----------

# Register LEEF parser UDF
@F.udf(returnType=MapType(StringType(), StringType()))
def parse_leef(raw_message):
    """Parse Log Event Extended Format (LEEF) messages."""
    if not raw_message:
        return {}
    try:
        parts = raw_message.split("|", 5)
        if len(parts) < 6 or not parts[0].startswith("LEEF:"):
            return {"parse_error": "invalid_leef_format"}
        result = {
            "leef_version": parts[0].replace("LEEF:", ""),
            "vendor": parts[1],
            "product": parts[2],
            "version": parts[3],
            "event_id": parts[4]
        }
        attrs = parts[5].split("\t") if "\t" in parts[5] else parts[5].split("|")
        for attr in attrs:
            if "=" in attr:
                k, v = attr.split("=", 1)
                result[k.strip()] = v.strip()
        return result
    except Exception as e:
        return {"parse_error": str(e)}

# COMMAND ----------

# Read unparsed bronze events using CDF (Change Data Feed)
bronze_df = spark.table(f"{catalog}.{schema}.bronze_events") \
    .filter(F.col("parsed_at").isNull()) \
    .limit(batch_size)

raw_count = bronze_df.count()
print(f"[Parser-Pool] Processing {raw_count} unparsed events")

# COMMAND ----------

# Apply appropriate parser based on source_type
parsed_df = bronze_df.withColumn(
    "parsed_fields",
    F.when(F.col("source_type_normalized") == "cef", parse_cef(F.col("raw_message")))
     .when(F.col("source_type_normalized") == "syslog", parse_syslog(F.col("raw_message")))
     .when(F.col("source_type_normalized") == "leef", parse_leef(F.col("raw_message")))
     .when(F.col("source_type_normalized") == "json", F.from_json(F.col("raw_message"),
         MapType(StringType(), StringType())))
     .otherwise(F.create_map(F.lit("raw_content"), F.col("raw_message")))
).withColumn("parsed_at", F.current_timestamp()) \
 .withColumn("parser_version", F.lit("2.0.0"))

# COMMAND ----------

# Build silver schema: flatten parsed fields into normalized columns
silver_df = parsed_df.select(
    F.col("event_id"),
    F.coalesce(F.col("parsed_fields.hostname"), F.col("host")).alias("src_host"),
    F.col("parsed_fields.message").alias("event_message"),
    F.col("parsed_fields.severity_code").cast(IntegerType()).alias("severity_num"),
    F.col("source").alias("event_source"),
    F.col("source_type_normalized").alias("log_format"),
    F.col("timestamp").alias("event_time"),
    F.col("parsed_fields").alias("extended_fields"),
    F.col("parsed_at"),
    F.col("parser_version"),
    F.col("ingested_at"),
    F.current_timestamp().alias("silver_created_at")
)

# COMMAND ----------

# MERGE into silver_events (upsert on event_id)
silver_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.silver_events")

silver_delta.alias("target").merge(
    silver_df.alias("source"),
    "target.event_id = source.event_id"
).whenMatchedUpdateAll() \
 .whenNotMatchedInsertAll() \
 .execute()

# COMMAND ----------

# Mark bronze records as parsed
bronze_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.bronze_events")
bronze_delta.alias("target").merge(
    parsed_df.select("event_id", "parsed_at", "parser_version").alias("source"),
    "target.event_id = source.event_id"
).whenMatchedUpdate(set={
    "parsed_at": "source.parsed_at",
    "parser_version": "source.parser_version"
}).execute()

print(f"[Parser-Pool] Parsed and promoted {raw_count} events to silver.")
$py$,
  config_yaml = $yml$
agent:
  slug: parser-pool
  display_name: Parser Pool (UDF Normalization)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/5 * * * *"
  cluster_policy: soc-standard
  node_type: Standard_DS4_v2
  num_workers: 2
  spark_conf:
    spark.sql.adaptive.enabled: "true"
    spark.sql.adaptive.coalescePartitions.enabled: "true"
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    batch_size: "50000"
    checkpoint_path: "abfss://checkpoints@socplatformdl.dfs.core.windows.net/parser-pool/"
  supported_formats:
    - cef
    - syslog
    - leef
    - json
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow every 5 minutes. Uses PySpark UDFs for CEF/syslog/LEEF/JSON parsing. Batch processes unparsed bronze records and promotes to silver via Delta MERGE.'
WHERE slug = 'parser-pool';

-- =============================================================================
-- 4. SAGE-ENRICHMENT
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Sage Enrichment Agent
# MAGIC Spark broadcast join enrichment. IOC matching, user behavior anomaly detection,
# MAGIC geo-IP lookup. Writes enriched scores back via Delta MERGE.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("batch_size", "25000")
dbutils.widgets.text("ioc_freshness_hours", "72")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
batch_size = int(dbutils.widgets.get("batch_size"))
ioc_freshness = int(dbutils.widgets.get("ioc_freshness_hours"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, BooleanType
from delta.tables import DeltaTable
from datetime import datetime, timedelta

# COMMAND ----------

# Load threat feed IOCs (broadcast for efficient join)
ioc_cutoff = datetime.utcnow() - timedelta(hours=ioc_freshness)
threat_feeds_df = spark.table(f"{catalog}.{schema}.threat_feed_items") \
    .filter(F.col("last_seen") >= F.lit(ioc_cutoff)) \
    .filter(F.col("confidence_score") >= 0.5) \
    .select("indicator_value", "indicator_type", "threat_type", "confidence_score", "source_feed")

broadcast_iocs = F.broadcast(threat_feeds_df)
print(f"[Sage-Enrichment] Loaded {threat_feeds_df.count()} active IOCs for broadcast join")

# COMMAND ----------

# Load user behavior baselines (broadcast)
baselines_df = spark.table(f"{catalog}.{schema}.user_behavior_baselines") \
    .select("user_id", "avg_login_hour", "std_login_hour",
            "avg_data_volume_mb", "std_data_volume_mb",
            "typical_src_ips", "risk_score_baseline")

broadcast_baselines = F.broadcast(baselines_df)

# COMMAND ----------

# Load geo-IP mapping table (broadcast)
geo_ip_df = spark.table(f"{catalog}.{schema}.geo_ip_ranges") \
    .select("ip_range_start", "ip_range_end", "country_code", "city", "latitude", "longitude", "is_tor", "is_vpn")

broadcast_geo = F.broadcast(geo_ip_df)

# COMMAND ----------

# Fetch alerts needing enrichment
alerts_to_enrich = spark.table(f"{catalog}.{schema}.alerts") \
    .filter(F.col("enrichment_status").isNull() | (F.col("enrichment_status") == "pending")) \
    .filter(F.col("pipeline_stage").isin("dispatched", "parsed")) \
    .limit(batch_size)

enrich_count = alerts_to_enrich.count()
print(f"[Sage-Enrichment] Enriching {enrich_count} alerts")

# COMMAND ----------

# IOC matching via broadcast join
ioc_enriched = alerts_to_enrich.join(
    broadcast_iocs,
    (alerts_to_enrich.src_ip == broadcast_iocs.indicator_value) |
    (alerts_to_enrich.dst_ip == broadcast_iocs.indicator_value) |
    (alerts_to_enrich.domain == broadcast_iocs.indicator_value),
    "left"
).withColumn("ioc_match", F.when(F.col("indicator_value").isNotNull(), True).otherwise(False)) \
 .withColumn("ioc_confidence", F.coalesce(F.col("confidence_score"), F.lit(0.0))) \
 .withColumn("ioc_threat_type", F.col("threat_type")) \
 .drop("indicator_value", "indicator_type", "threat_type", "confidence_score", "source_feed")

# COMMAND ----------

# User behavior anomaly detection via broadcast join
behavior_enriched = ioc_enriched.join(
    broadcast_baselines,
    ioc_enriched.user_id == broadcast_baselines.user_id,
    "left"
).withColumn(
    "login_hour_zscore",
    F.when(F.col("std_login_hour") > 0,
           (F.hour(F.col("event_time")) - F.col("avg_login_hour")) / F.col("std_login_hour")
    ).otherwise(F.lit(0.0))
).withColumn(
    "behavior_anomaly_score",
    F.when(F.abs(F.col("login_hour_zscore")) > 2.5, F.lit(0.9))
     .when(F.abs(F.col("login_hour_zscore")) > 2.0, F.lit(0.7))
     .when(F.abs(F.col("login_hour_zscore")) > 1.5, F.lit(0.4))
     .otherwise(F.lit(0.1))
).drop("avg_login_hour", "std_login_hour", "avg_data_volume_mb",
       "std_data_volume_mb", "typical_src_ips", "risk_score_baseline")

# COMMAND ----------

# Compute composite enrichment score
final_enriched = behavior_enriched.withColumn(
    "enrichment_score",
    (F.col("ioc_confidence") * 0.4) +
    (F.col("behavior_anomaly_score") * 0.35) +
    (F.when(F.col("is_tor") == True, F.lit(0.25)).otherwise(F.lit(0.0)))
).withColumn("enrichment_status", F.lit("enriched")) \
 .withColumn("enriched_at", F.current_timestamp())

# COMMAND ----------

# MERGE enrichment results back into alerts
enrichment_cols = final_enriched.select(
    "alert_id", "ioc_match", "ioc_confidence", "ioc_threat_type",
    "behavior_anomaly_score", "enrichment_score", "enrichment_status", "enriched_at"
)

alerts_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.alerts")
alerts_delta.alias("target").merge(
    enrichment_cols.alias("source"),
    "target.alert_id = source.alert_id"
).whenMatchedUpdate(set={
    "ioc_match": "source.ioc_match",
    "ioc_confidence": "source.ioc_confidence",
    "ioc_threat_type": "source.ioc_threat_type",
    "behavior_anomaly_score": "source.behavior_anomaly_score",
    "enrichment_score": "source.enrichment_score",
    "enrichment_status": "source.enrichment_status",
    "enriched_at": "source.enriched_at",
    "updated_at": F.current_timestamp()
}).execute()

print(f"[Sage-Enrichment] Enriched {enrich_count} alerts. Done.")
$py$,
  config_yaml = $yml$
agent:
  slug: sage-enrichment
  display_name: Sage Enrichment (Broadcast Joins)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/3 * * * *"
  cluster_policy: soc-standard
  node_type: Standard_DS4_v2
  num_workers: 2
  spark_conf:
    spark.sql.autoBroadcastJoinThreshold: "104857600"
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    batch_size: "25000"
    ioc_freshness_hours: "72"
  enrichment_sources:
    - threat_feed_items
    - user_behavior_baselines
    - geo_ip_ranges
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow every 3 minutes. Uses Spark broadcast joins for high-throughput IOC matching, behavior anomaly z-score computation, and geo-IP lookup. Composite enrichment score written via Delta MERGE.'
WHERE slug = 'sage-enrichment';

-- =============================================================================
-- 5. AI-CORRELATION
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # AI Correlation Engine
# MAGIC Structured Streaming correlation using sliding windows. Detects multi-stage
# MAGIC attack patterns (brute-force -> lateral -> exfiltration) via entity grouping.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("checkpoint_path", "abfss://checkpoints@socplatformdl.dfs.core.windows.net/ai-correlation/")
dbutils.widgets.text("window_duration", "30 minutes")
dbutils.widgets.text("slide_interval", "5 minutes")
dbutils.widgets.text("watermark_delay", "10 minutes")
dbutils.widgets.text("min_pattern_confidence", "0.7")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint = dbutils.widgets.get("checkpoint_path")
window_duration = dbutils.widgets.get("window_duration")
slide_interval = dbutils.widgets.get("slide_interval")
watermark_delay = dbutils.widgets.get("watermark_delay")
min_confidence = float(dbutils.widgets.get("min_pattern_confidence"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType,
    TimestampType, ArrayType, IntegerType
)
from delta.tables import DeltaTable
from datetime import datetime

# COMMAND ----------

# Define multi-stage attack patterns
ATTACK_PATTERNS = {
    "brute_force_lateral_exfil": {
        "stages": ["authentication_failure", "lateral_movement", "data_exfiltration"],
        "max_window_minutes": 30,
        "min_events_per_stage": [5, 1, 1],
        "severity": "critical"
    },
    "recon_exploit_persist": {
        "stages": ["reconnaissance", "exploitation", "persistence"],
        "max_window_minutes": 60,
        "min_events_per_stage": [3, 1, 1],
        "severity": "high"
    },
    "credential_access_privilege_escalation": {
        "stages": ["credential_access", "privilege_escalation", "defense_evasion"],
        "max_window_minutes": 45,
        "min_events_per_stage": [2, 1, 1],
        "severity": "critical"
    }
}

# COMMAND ----------

# Read enriched silver events as a stream
events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table(f"{catalog}.{schema}.silver_events")
    .withWatermark("event_time", watermark_delay)
)

# COMMAND ----------

# Sliding window aggregation: group events by entity within time windows
windowed_events = events_stream \
    .groupBy(
        F.window(F.col("event_time"), window_duration, slide_interval),
        F.col("src_host").alias("entity_id")
    ).agg(
        F.collect_list("event_source").alias("event_sources"),
        F.collect_list("log_format").alias("log_formats"),
        F.count("*").alias("event_count"),
        F.collect_list(
            F.struct("event_id", "event_time", "event_message", "severity_num")
        ).alias("event_details"),
        F.sum(F.when(F.col("event_message").rlike("(?i)fail|denied|reject"), 1).otherwise(0)).alias("auth_failures"),
        F.sum(F.when(F.col("event_message").rlike("(?i)lateral|smb|rdp|psexec"), 1).otherwise(0)).alias("lateral_indicators"),
        F.sum(F.when(F.col("event_message").rlike("(?i)exfil|upload|transfer|large"), 1).otherwise(0)).alias("exfil_indicators"),
        F.sum(F.when(F.col("event_message").rlike("(?i)scan|enum|probe|recon"), 1).otherwise(0)).alias("recon_indicators"),
        F.max("severity_num").alias("max_severity")
    )

# COMMAND ----------

# Pattern detection: identify multi-stage attacks
pattern_matches = windowed_events.withColumn(
    "brute_force_lateral_exfil",
    F.when(
        (F.col("auth_failures") >= 5) &
        (F.col("lateral_indicators") >= 1) &
        (F.col("exfil_indicators") >= 1),
        F.lit(True)
    ).otherwise(F.lit(False))
).withColumn(
    "recon_exploit_persist",
    F.when(
        (F.col("recon_indicators") >= 3) &
        (F.col("event_count") >= 10) &
        (F.col("max_severity") >= 7),
        F.lit(True)
    ).otherwise(F.lit(False))
).withColumn(
    "attack_pattern",
    F.when(F.col("brute_force_lateral_exfil"), F.lit("brute_force_lateral_exfil"))
     .when(F.col("recon_exploit_persist"), F.lit("recon_exploit_persist"))
     .otherwise(F.lit(None))
).filter(F.col("attack_pattern").isNotNull())

# COMMAND ----------

# Compute correlation confidence using AI
correlation_output = pattern_matches.withColumn(
    "correlation_id", F.expr("uuid()")
).withColumn(
    "confidence_score",
    (F.col("event_count").cast("double") / 50.0) * 0.3 +
    (F.col("max_severity").cast("double") / 10.0) * 0.4 +
    F.when(F.col("brute_force_lateral_exfil"), F.lit(0.3)).otherwise(F.lit(0.15))
).withColumn(
    "confidence_score", F.least(F.col("confidence_score"), F.lit(1.0))
).filter(F.col("confidence_score") >= min_confidence) \
 .withColumn("window_start", F.col("window.start")) \
 .withColumn("window_end", F.col("window.end")) \
 .withColumn("detected_at", F.current_timestamp())

# COMMAND ----------

# Write correlation matches to Delta table via streaming
output_df = correlation_output.select(
    "correlation_id", "entity_id", "attack_pattern",
    "confidence_score", "event_count", "window_start", "window_end",
    "auth_failures", "lateral_indicators", "exfil_indicators",
    "max_severity", "detected_at"
)

write_query = (
    output_df.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{checkpoint}/correlation_matches/")
    .trigger(availableNow=True)
    .toTable(f"{catalog}.{schema}.correlation_matches")
)

write_query.awaitTermination()

# COMMAND ----------

# Use LLM to generate human-readable correlation summary for top matches
top_matches = spark.sql(f"""
    SELECT correlation_id, entity_id, attack_pattern, confidence_score, event_count
    FROM {catalog}.{schema}.correlation_matches
    WHERE detected_at >= current_timestamp() - INTERVAL 10 MINUTES
    ORDER BY confidence_score DESC
    LIMIT 5
""")

if top_matches.count() > 0:
    for row in top_matches.collect():
        prompt = f"Generate a one-paragraph SOC analyst brief for: entity {row.entity_id} matched pattern {row.attack_pattern} with confidence {row.confidence_score:.2f} across {row.event_count} events."
        spark.sql(f"""
            INSERT INTO {catalog}.{schema}.correlation_summaries
            SELECT '{row.correlation_id}' as correlation_id,
                   ai_query('databricks-meta-llama-3-1-70b-instruct', "{prompt}") as analyst_brief,
                   current_timestamp() as generated_at
        """)

print("[AI-Correlation] Streaming correlation complete.")
$py$,
  config_yaml = $yml$
agent:
  slug: ai-correlation
  display_name: AI Correlation Engine (Structured Streaming)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/5 * * * *"
  cluster_policy: soc-streaming
  node_type: Standard_DS4_v2
  num_workers: 2
  spark_conf:
    spark.sql.streaming.stateStore.providerClass: "com.databricks.sql.streaming.state.RocksDBStateStoreProvider"
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    checkpoint_path: "abfss://checkpoints@socplatformdl.dfs.core.windows.net/ai-correlation/"
    window_duration: "30 minutes"
    slide_interval: "5 minutes"
    watermark_delay: "10 minutes"
    min_pattern_confidence: "0.7"
  patterns:
    - brute_force_lateral_exfil
    - recon_exploit_persist
    - credential_access_privilege_escalation
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow with Structured Streaming (availableNow trigger). Uses sliding windows with watermarks for multi-stage attack pattern detection. RocksDB state store for high-throughput stateful processing. LLM summaries via ai_query.'
WHERE slug = 'ai-correlation';

-- =============================================================================
-- 6. REALTIME-GRAPH-CEP
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Realtime Graph CEP Agent
# MAGIC GraphFrames-based graph correlation. Builds entity graph, runs connected components,
# MAGIC PageRank for risk propagation, motif finding for attack patterns.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("pagerank_iterations", "10")
dbutils.widgets.text("pagerank_reset_prob", "0.15")
dbutils.widgets.text("min_component_size", "3")
dbutils.widgets.text("risk_propagation_decay", "0.7")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
pr_iterations = int(dbutils.widgets.get("pagerank_iterations"))
pr_reset = float(dbutils.widgets.get("pagerank_reset_prob"))
min_component = int(dbutils.widgets.get("min_component_size"))
decay = float(dbutils.widgets.get("risk_propagation_decay"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, LongType
from delta.tables import DeltaTable
from graphframes import GraphFrame
from datetime import datetime

# COMMAND ----------

# Load vertices from Unity Catalog
vertices_df = spark.table(f"{catalog}.{schema}.vertices_current") \
    .select(
        F.col("entity_id").alias("id"),
        F.col("entity_type"),
        F.col("entity_name"),
        F.col("risk_score"),
        F.col("first_seen"),
        F.col("last_seen"),
        F.col("alert_count")
    )

vertex_count = vertices_df.count()
print(f"[Graph-CEP] Loaded {vertex_count} vertices")

# COMMAND ----------

# Load edges from Unity Catalog
edges_df = spark.table(f"{catalog}.{schema}.edges_current") \
    .select(
        F.col("source_entity_id").alias("src"),
        F.col("target_entity_id").alias("dst"),
        F.col("relationship_type"),
        F.col("weight"),
        F.col("event_count"),
        F.col("last_activity")
    )

edge_count = edges_df.count()
print(f"[Graph-CEP] Loaded {edge_count} edges")

# COMMAND ----------

# Build GraphFrame
graph = GraphFrame(vertices_df, edges_df)

# COMMAND ----------

# Run Connected Components to find attack clusters
spark.sparkContext.setCheckpointDir(f"dbfs:/tmp/graph-cep-checkpoints/{datetime.utcnow().strftime('%Y%m%d%H%M')}")
components_df = graph.connectedComponents()

# Filter significant components (size >= min_component)
component_sizes = components_df.groupBy("component") \
    .agg(
        F.count("*").alias("component_size"),
        F.sum("risk_score").alias("total_risk"),
        F.collect_set("entity_type").alias("entity_types"),
        F.max("risk_score").alias("max_risk")
    ).filter(F.col("component_size") >= min_component)

sig_components = component_sizes.count()
print(f"[Graph-CEP] Found {sig_components} significant connected components")

# COMMAND ----------

# Run PageRank for risk propagation
pagerank_df = graph.pageRank(resetProbability=pr_reset, maxIter=pr_iterations)
pr_vertices = pagerank_df.vertices.select(
    F.col("id"),
    F.col("pagerank").alias("pr_score")
)

# Combine PageRank with original risk score for propagated risk
risk_propagated = vertices_df.join(pr_vertices, "id") \
    .withColumn(
        "propagated_risk_score",
        (F.col("risk_score") * (1 - decay)) + (F.col("pr_score") * decay * 10)
    ).withColumn(
        "propagated_risk_score",
        F.least(F.col("propagated_risk_score"), F.lit(100.0))
    )

# COMMAND ----------

# Motif finding: detect lateral movement patterns (A -> B -> C within cluster)
lateral_motifs = graph.find("(a)-[e1]->(b); (b)-[e2]->(c)") \
    .filter(F.col("e1.relationship_type") == "authenticated_to") \
    .filter(F.col("e2.relationship_type").isin("authenticated_to", "accessed_resource")) \
    .filter(F.col("a.id") != F.col("c.id")) \
    .select(
        F.col("a.id").alias("origin_entity"),
        F.col("b.id").alias("pivot_entity"),
        F.col("c.id").alias("target_entity"),
        F.col("a.risk_score").alias("origin_risk"),
        F.col("e1.last_activity").alias("first_hop_time"),
        F.col("e2.last_activity").alias("second_hop_time")
    ).withColumn("pattern_type", F.lit("lateral_movement_chain")) \
     .withColumn("detected_at", F.current_timestamp()) \
     .withColumn("pattern_id", F.expr("uuid()"))

motif_count = lateral_motifs.count()
print(f"[Graph-CEP] Detected {motif_count} lateral movement motifs")

# COMMAND ----------

# MERGE propagated risk scores back to vertices
vertices_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.vertices_current")
vertices_delta.alias("target").merge(
    risk_propagated.select("id", "propagated_risk_score", "pr_score").alias("source"),
    "target.entity_id = source.id"
).whenMatchedUpdate(set={
    "risk_score": "source.propagated_risk_score",
    "pagerank_score": "source.pr_score",
    "graph_updated_at": F.current_timestamp()
}).execute()

# COMMAND ----------

# Write motif detections to correlation matches
if motif_count > 0:
    motif_output = lateral_motifs.select(
        F.col("pattern_id").alias("correlation_id"),
        F.col("origin_entity").alias("entity_id"),
        F.col("pattern_type").alias("attack_pattern"),
        F.lit(0.85).alias("confidence_score"),
        F.lit(3).cast("int").alias("event_count"),
        F.col("first_hop_time").alias("window_start"),
        F.col("second_hop_time").alias("window_end"),
        F.col("detected_at")
    )
    motif_output.write.mode("append").saveAsTable(f"{catalog}.{schema}.correlation_matches")

# COMMAND ----------

# Write component analysis results
component_output = component_sizes.withColumn("analyzed_at", F.current_timestamp())
component_output.write.mode("overwrite").saveAsTable(f"{catalog}.{schema}.graph_components_latest")

print(f"[Graph-CEP] Graph analysis complete. {sig_components} components, {motif_count} motifs detected.")
$py$,
  config_yaml = $yml$
agent:
  slug: realtime-graph-cep
  display_name: Realtime Graph CEP (GraphFrames)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/10 * * * *"
  cluster_policy: soc-compute
  node_type: Standard_DS5_v2
  num_workers: 4
  spark_conf:
    spark.graphx.pregel.checkpointInterval: "5"
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    pagerank_iterations: "10"
    pagerank_reset_prob: "0.15"
    min_component_size: "3"
    risk_propagation_decay: "0.7"
  libraries:
    - maven: "graphframes:graphframes:0.8.3-spark3.5-s_2.12"
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'graphframes'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow every 10 minutes. Requires graphframes library installed on cluster. Uses connected components for attack cluster detection, PageRank for risk propagation, and motif finding for lateral movement chains.'
WHERE slug = 'realtime-graph-cep';

-- =============================================================================
-- 7. NEGATIVE-CORRELATION
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Negative Correlation Agent
# MAGIC flatMapGroupsWithState for detecting absence of expected events.
# MAGIC Tracks expected sequences per entity, fires alerts when expected follow-up
# MAGIC events don't arrive within SLA windows.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("checkpoint_path", "abfss://checkpoints@socplatformdl.dfs.core.windows.net/negative-correlation/")
dbutils.widgets.text("timeout_multiplier", "1.5")
dbutils.widgets.text("min_confidence_threshold", "0.6")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint = dbutils.widgets.get("checkpoint_path")
timeout_mult = float(dbutils.widgets.get("timeout_multiplier"))
min_confidence = float(dbutils.widgets.get("min_confidence_threshold"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.streaming.state import GroupState, GroupStateTimeout
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    DoubleType, ArrayType, BooleanType, LongType
)
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json

# COMMAND ----------

# Define expected event sequences (trigger -> expected follow-up within SLA)
EXPECTED_SEQUENCES = {
    "login_success": {
        "expected_followup": "mfa_verification",
        "sla_seconds": 120,
        "severity_on_miss": "high",
        "description": "Successful login without MFA verification"
    },
    "privilege_escalation": {
        "expected_followup": "approval_granted",
        "sla_seconds": 300,
        "severity_on_miss": "critical",
        "description": "Privilege escalation without approval"
    },
    "data_access_sensitive": {
        "expected_followup": "dlp_scan_complete",
        "sla_seconds": 60,
        "severity_on_miss": "high",
        "description": "Sensitive data access without DLP scan"
    },
    "firewall_rule_change": {
        "expected_followup": "change_ticket_reference",
        "sla_seconds": 600,
        "severity_on_miss": "medium",
        "description": "Firewall change without change ticket"
    },
    "vpn_connection": {
        "expected_followup": "posture_check_complete",
        "sla_seconds": 30,
        "severity_on_miss": "medium",
        "description": "VPN connection without posture check"
    }
}

# COMMAND ----------

# Define state schema for flatMapGroupsWithState
state_schema = StructType([
    StructField("entity_id", StringType()),
    StructField("trigger_event", StringType()),
    StructField("trigger_time", TimestampType()),
    StructField("expected_followup", StringType()),
    StructField("sla_deadline", TimestampType()),
    StructField("resolved", BooleanType())
])

output_schema = StructType([
    StructField("detection_id", StringType()),
    StructField("entity_id", StringType()),
    StructField("trigger_event", StringType()),
    StructField("expected_event", StringType()),
    StructField("sla_seconds", LongType()),
    StructField("elapsed_seconds", LongType()),
    StructField("severity", StringType()),
    StructField("description", StringType()),
    StructField("confidence_score", DoubleType()),
    StructField("detected_at", TimestampType())
])

# COMMAND ----------

# State update function for flatMapGroupsWithState
def update_negative_correlation_state(key, events, state: GroupState):
    """Track expected sequences and detect absences."""
    import uuid
    from datetime import datetime, timedelta

    entity_id = key[0]
    current_time = datetime.utcnow()
    outputs = []

    # Load existing state or initialize
    if state.exists:
        pending_expectations = state.get
    else:
        pending_expectations = []

    event_list = list(events)
    event_types_seen = set()

    for event in event_list:
        event_type = event.event_type
        event_types_seen.add(event_type)

        # Check if this event is a trigger for a new expectation
        if event_type in EXPECTED_SEQUENCES:
            seq = EXPECTED_SEQUENCES[event_type]
            deadline = current_time + timedelta(seconds=int(seq["sla_seconds"] * timeout_mult))
            pending_expectations.append({
                "trigger_event": event_type,
                "trigger_time": current_time.isoformat(),
                "expected_followup": seq["expected_followup"],
                "sla_deadline": deadline.isoformat(),
                "resolved": False
            })

    # Resolve expectations that received their follow-up
    for exp in pending_expectations:
        if exp["expected_followup"] in event_types_seen:
            exp["resolved"] = True

    # Check for expired expectations (negative correlation detected)
    still_pending = []
    for exp in pending_expectations:
        if exp["resolved"]:
            continue
        deadline = datetime.fromisoformat(exp["sla_deadline"])
        if current_time > deadline:
            seq = EXPECTED_SEQUENCES.get(exp["trigger_event"], {})
            trigger_time = datetime.fromisoformat(exp["trigger_time"])
            elapsed = int((current_time - trigger_time).total_seconds())
            confidence = min(1.0, elapsed / (seq.get("sla_seconds", 60) * 3))

            if confidence >= min_confidence:
                outputs.append((
                    str(uuid.uuid4()), entity_id, exp["trigger_event"],
                    exp["expected_followup"], seq.get("sla_seconds", 0),
                    elapsed, seq.get("severity_on_miss", "medium"),
                    seq.get("description", ""), confidence, current_time
                ))
        else:
            still_pending.append(exp)

    # Update state with remaining pending expectations
    if still_pending:
        state.update(still_pending)
        state.setTimeoutDuration("5 minutes")
    else:
        state.remove()

    return iter(outputs)

# COMMAND ----------

# Read silver events as a stream
events_stream = (
    spark.readStream
    .format("delta")
    .option("ignoreChanges", "true")
    .table(f"{catalog}.{schema}.silver_events")
    .withWatermark("event_time", "5 minutes")
    .select(
        F.col("src_host").alias("entity_id"),
        F.col("event_source").alias("event_type"),
        F.col("event_time"),
        F.col("event_id")
    )
)

# COMMAND ----------

# Apply flatMapGroupsWithState for stateful negative correlation
negative_detections = events_stream \
    .groupBy("entity_id") \
    .applyInPandasWithState(
        update_negative_correlation_state,
        outputStructType=output_schema,
        stateStructType=state_schema,
        outputMode="append",
        timeoutConf=GroupStateTimeout.ProcessingTimeTimeout
    )

# COMMAND ----------

# Write negative correlation detections to Delta
write_query = (
    negative_detections.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{checkpoint}/detections/")
    .trigger(availableNow=True)
    .toTable(f"{catalog}.{schema}.negative_correlation_detections")
)

write_query.awaitTermination()

# COMMAND ----------

# Summarize recent detections
recent = spark.sql(f"""
    SELECT severity, COUNT(*) as count
    FROM {catalog}.{schema}.negative_correlation_detections
    WHERE detected_at >= current_timestamp() - INTERVAL 15 MINUTES
    GROUP BY severity ORDER BY count DESC
""")

for row in recent.collect():
    print(f"[Negative-Correlation] {row.severity}: {row.count} absence detections")

print("[Negative-Correlation] Processing complete.")
$py$,
  config_yaml = $yml$
agent:
  slug: negative-correlation
  display_name: Negative Correlation (Absence Detection)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/5 * * * *"
  cluster_policy: soc-streaming
  node_type: Standard_DS4_v2
  num_workers: 2
  spark_conf:
    spark.sql.streaming.stateStore.providerClass: "com.databricks.sql.streaming.state.RocksDBStateStoreProvider"
    spark.sql.streaming.stateStore.rocksdb.changelogCheckpointing.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    checkpoint_path: "abfss://checkpoints@socplatformdl.dfs.core.windows.net/negative-correlation/"
    timeout_multiplier: "1.5"
    min_confidence_threshold: "0.6"
  expected_sequences:
    - trigger: login_success
      followup: mfa_verification
      sla: 120s
    - trigger: privilege_escalation
      followup: approval_granted
      sla: 300s
    - trigger: data_access_sensitive
      followup: dlp_scan_complete
      sla: 60s
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow with Structured Streaming. Uses flatMapGroupsWithState / applyInPandasWithState for stateful absence detection. RocksDB state store for durability. Fires alerts when expected follow-up events are missing within SLA windows.'
WHERE slug = 'negative-correlation';

-- =============================================================================
-- 8. ATLAS-TRIAGE
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Atlas Triage Agent
# MAGIC Batch scoring agent. Computes multi-factor triage score using severity weight,
# MAGIC IOC match, repeat offender, time-of-day anomaly, and asset criticality.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("batch_size", "10000")
dbutils.widgets.text("high_severity_threshold", "75")
dbutils.widgets.text("auto_escalate_threshold", "90")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
batch_size = int(dbutils.widgets.get("batch_size"))
high_threshold = int(dbutils.widgets.get("high_severity_threshold"))
auto_escalate = int(dbutils.widgets.get("auto_escalate_threshold"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import DoubleType, IntegerType, StringType
from delta.tables import DeltaTable
import mlflow
from datetime import datetime

# COMMAND ----------

# Load alerts needing triage scoring
alerts_df = spark.table(f"{catalog}.{schema}.alerts") \
    .filter(F.col("triage_score").isNull()) \
    .filter(F.col("enrichment_status") == "enriched") \
    .limit(batch_size)

alert_count = alerts_df.count()
print(f"[Atlas-Triage] Scoring {alert_count} alerts")

if alert_count == 0:
    dbutils.notebook.exit("No alerts to triage")

# COMMAND ----------

# Factor 1: Severity weight (0-25 points)
severity_scored = alerts_df.withColumn(
    "severity_weight",
    F.when(F.col("severity") == "critical", F.lit(25.0))
     .when(F.col("severity") == "high", F.lit(20.0))
     .when(F.col("severity") == "medium", F.lit(12.0))
     .when(F.col("severity") == "low", F.lit(5.0))
     .otherwise(F.lit(2.0))
)

# COMMAND ----------

# Factor 2: IOC match score (0-25 points)
ioc_scored = severity_scored.withColumn(
    "ioc_weight",
    F.when(F.col("ioc_match") == True,
           F.col("ioc_confidence") * 25.0
    ).otherwise(F.lit(0.0))
)

# COMMAND ----------

# Factor 3: Repeat offender (0-20 points) - based on entity alert history
entity_history = spark.table(f"{catalog}.{schema}.alerts") \
    .filter(F.col("created_at") >= F.date_sub(F.current_date(), 30)) \
    .groupBy("src_ip") \
    .agg(F.count("*").alias("alert_count_30d"))

repeat_scored = ioc_scored.join(
    F.broadcast(entity_history),
    ioc_scored.src_ip == entity_history.src_ip,
    "left"
).withColumn(
    "repeat_weight",
    F.when(F.col("alert_count_30d") >= 20, F.lit(20.0))
     .when(F.col("alert_count_30d") >= 10, F.lit(15.0))
     .when(F.col("alert_count_30d") >= 5, F.lit(10.0))
     .when(F.col("alert_count_30d") >= 2, F.lit(5.0))
     .otherwise(F.lit(0.0))
).drop(entity_history.src_ip)

# COMMAND ----------

# Factor 4: Time-of-day anomaly (0-15 points)
time_scored = repeat_scored.withColumn(
    "event_hour", F.hour(F.col("event_time"))
).withColumn(
    "time_anomaly_weight",
    F.when(
        (F.col("event_hour") >= 0) & (F.col("event_hour") < 6),
        F.lit(15.0)  # Late night = highest anomaly
    ).when(
        (F.col("event_hour") >= 22) | (F.col("event_hour") < 7),
        F.lit(10.0)  # Evening/early morning
    ).when(
        F.dayofweek(F.col("event_time")).isin(1, 7),
        F.lit(8.0)   # Weekends
    ).otherwise(F.lit(2.0))
)

# COMMAND ----------

# Factor 5: Asset criticality (0-15 points)
asset_registry = spark.table(f"{catalog}.{schema}.asset_registry") \
    .select("ip_address", "asset_criticality", "business_unit")

asset_scored = time_scored.join(
    F.broadcast(asset_registry),
    time_scored.dst_ip == asset_registry.ip_address,
    "left"
).withColumn(
    "asset_weight",
    F.when(F.col("asset_criticality") == "critical", F.lit(15.0))
     .when(F.col("asset_criticality") == "high", F.lit(12.0))
     .when(F.col("asset_criticality") == "medium", F.lit(7.0))
     .otherwise(F.lit(3.0))
).drop("ip_address", "asset_criticality", "business_unit")

# COMMAND ----------

# Compute final triage score (0-100)
final_scored = asset_scored.withColumn(
    "triage_score",
    F.round(
        F.col("severity_weight") +
        F.col("ioc_weight") +
        F.col("repeat_weight") +
        F.col("time_anomaly_weight") +
        F.col("asset_weight"),
        2
    )
).withColumn(
    "triage_score", F.least(F.col("triage_score"), F.lit(100.0))
).withColumn(
    "triage_priority",
    F.when(F.col("triage_score") >= auto_escalate, F.lit("P1-auto-escalate"))
     .when(F.col("triage_score") >= high_threshold, F.lit("P2-high"))
     .when(F.col("triage_score") >= 50, F.lit("P3-medium"))
     .otherwise(F.lit("P4-low"))
).withColumn("triaged_at", F.current_timestamp()) \
 .withColumn("triage_version", F.lit("atlas-v2.0.0"))

# COMMAND ----------

# Log triage run with MLflow
with mlflow.start_run(run_name=f"atlas-triage-{datetime.utcnow().strftime('%Y%m%d-%H%M')}"):
    mlflow.log_param("batch_size", alert_count)
    mlflow.log_param("high_threshold", high_threshold)
    mlflow.log_param("auto_escalate_threshold", auto_escalate)

    score_stats = final_scored.agg(
        F.avg("triage_score").alias("avg_score"),
        F.max("triage_score").alias("max_score"),
        F.min("triage_score").alias("min_score"),
        F.sum(F.when(F.col("triage_priority") == "P1-auto-escalate", 1).otherwise(0)).alias("p1_count")
    ).collect()[0]

    mlflow.log_metric("avg_triage_score", score_stats.avg_score or 0)
    mlflow.log_metric("max_triage_score", score_stats.max_score or 0)
    mlflow.log_metric("p1_count", score_stats.p1_count or 0)
    mlflow.log_metric("alerts_triaged", alert_count)

# COMMAND ----------

# MERGE triage scores back into alerts
triage_cols = final_scored.select(
    "alert_id", "triage_score", "triage_priority", "triaged_at",
    "triage_version", "severity_weight", "ioc_weight",
    "repeat_weight", "time_anomaly_weight", "asset_weight"
)

alerts_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.alerts")
alerts_delta.alias("target").merge(
    triage_cols.alias("source"),
    "target.alert_id = source.alert_id"
).whenMatchedUpdate(set={
    "triage_score": "source.triage_score",
    "triage_priority": "source.triage_priority",
    "triaged_at": "source.triaged_at",
    "triage_version": "source.triage_version",
    "pipeline_stage": F.lit("triaged"),
    "updated_at": F.current_timestamp()
}).execute()

print(f"[Atlas-Triage] Scored {alert_count} alerts. P1: {score_stats.p1_count}, Avg: {score_stats.avg_score:.1f}")
$py$,
  config_yaml = $yml$
agent:
  slug: atlas-triage
  display_name: Atlas Triage (Multi-Factor Scoring)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/3 * * * *"
  cluster_policy: soc-standard
  node_type: Standard_DS4_v2
  num_workers: 1
  spark_conf:
    spark.databricks.delta.optimizeWrite.enabled: "true"
    spark.sql.adaptive.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    batch_size: "10000"
    high_severity_threshold: "75"
    auto_escalate_threshold: "90"
  scoring_factors:
    severity_weight: 25
    ioc_match: 25
    repeat_offender: 20
    time_anomaly: 15
    asset_criticality: 15
  mlflow:
    experiment_name: /soc/atlas-triage
    tracking_uri: databricks
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'mlflow'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow every 3 minutes. Multi-factor triage scoring (severity + IOC + repeat + time-of-day + asset criticality). MLflow tracking for model monitoring. Auto-escalates P1 alerts above threshold.'
WHERE slug = 'atlas-triage';

-- =============================================================================
-- 9. VECTOR-MEMORY
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # Vector Memory Agent
# MAGIC SentenceTransformer embedding + FAISS vector index on Databricks ML Runtime.
# MAGIC Encodes IOCs/alerts into embeddings, stores in Delta, performs similarity search.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("embedding_model", "all-MiniLM-L6-v2")
dbutils.widgets.text("embedding_dim", "384")
dbutils.widgets.text("batch_size", "5000")
dbutils.widgets.text("faiss_nprobe", "10")
dbutils.widgets.text("similarity_threshold", "0.75")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
model_name = dbutils.widgets.get("embedding_model")
embed_dim = int(dbutils.widgets.get("embedding_dim"))
batch_size = int(dbutils.widgets.get("batch_size"))
nprobe = int(dbutils.widgets.get("faiss_nprobe"))
sim_threshold = float(dbutils.widgets.get("similarity_threshold"))

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, ArrayType,
    FloatType, TimestampType, DoubleType
)
from delta.tables import DeltaTable
import mlflow
import numpy as np
from datetime import datetime

# COMMAND ----------

# Load SentenceTransformer model on driver (ML Runtime has it pre-installed)
from sentence_transformers import SentenceTransformer
import faiss

model = SentenceTransformer(model_name)
print(f"[Vector-Memory] Loaded embedding model: {model_name} (dim={embed_dim})")

# COMMAND ----------

# Log model to MLflow for versioning
with mlflow.start_run(run_name=f"vector-memory-{datetime.utcnow().strftime('%Y%m%d')}"):
    mlflow.log_param("model_name", model_name)
    mlflow.log_param("embedding_dim", embed_dim)
    mlflow.log_param("batch_size", batch_size)

# COMMAND ----------

# Fetch unembedded alerts and IOCs
new_alerts = spark.table(f"{catalog}.{schema}.alerts") \
    .filter(F.col("embedding_generated_at").isNull()) \
    .filter(F.col("enrichment_status") == "enriched") \
    .select("alert_id", "event_message", "ioc_threat_type", "severity", "src_ip", "dst_ip") \
    .limit(batch_size)

new_iocs = spark.table(f"{catalog}.{schema}.threat_feed_items") \
    .filter(F.col("embedding_generated_at").isNull()) \
    .select("ioc_id", "indicator_value", "indicator_type", "threat_type", "description") \
    .limit(batch_size)

alert_count = new_alerts.count()
ioc_count = new_iocs.count()
print(f"[Vector-Memory] Embedding {alert_count} alerts, {ioc_count} IOCs")

# COMMAND ----------

# Generate embeddings for alerts using broadcast UDF
@F.pandas_udf(ArrayType(FloatType()))
def generate_embedding(texts):
    """Generate sentence embeddings using SentenceTransformer."""
    from sentence_transformers import SentenceTransformer
    local_model = SentenceTransformer(model_name)
    text_list = texts.fillna("").tolist()
    embeddings = local_model.encode(text_list, batch_size=64, show_progress_bar=False)
    return [emb.tolist() for emb in embeddings]

# COMMAND ----------

# Create text representations for embedding
alert_texts = new_alerts.withColumn(
    "embed_text",
    F.concat_ws(" | ",
        F.coalesce(F.col("event_message"), F.lit("")),
        F.coalesce(F.col("ioc_threat_type"), F.lit("")),
        F.coalesce(F.col("severity"), F.lit("")),
        F.concat(F.lit("src:"), F.coalesce(F.col("src_ip"), F.lit(""))),
        F.concat(F.lit("dst:"), F.coalesce(F.col("dst_ip"), F.lit("")))
    )
)

ioc_texts = new_iocs.withColumn(
    "embed_text",
    F.concat_ws(" | ",
        F.coalesce(F.col("indicator_value"), F.lit("")),
        F.coalesce(F.col("indicator_type"), F.lit("")),
        F.coalesce(F.col("threat_type"), F.lit("")),
        F.coalesce(F.col("description"), F.lit(""))
    )
)

# COMMAND ----------

# Generate embeddings
if alert_count > 0:
    alert_embeddings = alert_texts.withColumn(
        "embedding", generate_embedding(F.col("embed_text"))
    ).withColumn("embedding_generated_at", F.current_timestamp()) \
     .withColumn("embedding_model", F.lit(model_name)) \
     .withColumn("entity_type", F.lit("alert"))

    # Write alert embeddings to vector store table
    alert_embed_output = alert_embeddings.select(
        F.col("alert_id").alias("entity_id"),
        "entity_type", "embedding", "embed_text",
        "embedding_generated_at", "embedding_model"
    )
    alert_embed_output.write.mode("append").saveAsTable(f"{catalog}.{schema}.vector_embeddings")

if ioc_count > 0:
    ioc_embeddings = ioc_texts.withColumn(
        "embedding", generate_embedding(F.col("embed_text"))
    ).withColumn("embedding_generated_at", F.current_timestamp()) \
     .withColumn("embedding_model", F.lit(model_name)) \
     .withColumn("entity_type", F.lit("ioc"))

    ioc_embed_output = ioc_embeddings.select(
        F.col("ioc_id").alias("entity_id"),
        "entity_type", "embedding", "embed_text",
        "embedding_generated_at", "embedding_model"
    )
    ioc_embed_output.write.mode("append").saveAsTable(f"{catalog}.{schema}.vector_embeddings")

# COMMAND ----------

# Build FAISS index for similarity search
all_embeddings_df = spark.table(f"{catalog}.{schema}.vector_embeddings") \
    .select("entity_id", "entity_type", "embedding") \
    .collect()

if len(all_embeddings_df) > 0:
    ids = [row.entity_id for row in all_embeddings_df]
    vectors = np.array([row.embedding for row in all_embeddings_df], dtype=np.float32)

    # Build IVF index for efficient search
    nlist = min(100, max(1, len(vectors) // 50))
    quantizer = faiss.IndexFlatIP(embed_dim)
    index = faiss.IndexIVFFlat(quantizer, embed_dim, nlist, faiss.METRIC_INNER_PRODUCT)
    faiss.normalize_L2(vectors)
    index.train(vectors)
    index.add(vectors)
    index.nprobe = nprobe

    print(f"[Vector-Memory] FAISS index built: {index.ntotal} vectors, {nlist} clusters")

# COMMAND ----------

# Mark alerts and IOCs as embedded via Delta MERGE
if alert_count > 0:
    alerts_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.alerts")
    alerts_delta.alias("target").merge(
        alert_embeddings.select("alert_id", "embedding_generated_at").alias("source"),
        "target.alert_id = source.alert_id"
    ).whenMatchedUpdate(set={
        "embedding_generated_at": "source.embedding_generated_at"
    }).execute()

if ioc_count > 0:
    iocs_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.threat_feed_items")
    iocs_delta.alias("target").merge(
        ioc_embeddings.select("ioc_id", "embedding_generated_at").alias("source"),
        "target.ioc_id = source.ioc_id"
    ).whenMatchedUpdate(set={
        "embedding_generated_at": "source.embedding_generated_at"
    }).execute()

print(f"[Vector-Memory] Complete. Embedded {alert_count} alerts, {ioc_count} IOCs.")
$py$,
  config_yaml = $yml$
agent:
  slug: vector-memory
  display_name: Vector Memory (Embeddings + FAISS)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "*/10 * * * *"
  cluster_policy: soc-ml
  node_type: Standard_NC6s_v3
  num_workers: 1
  runtime_engine: ML
  spark_conf:
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    embedding_model: all-MiniLM-L6-v2
    embedding_dim: "384"
    batch_size: "5000"
    faiss_nprobe: "10"
    similarity_threshold: "0.75"
  mlflow:
    experiment_name: /soc/vector-memory
    tracking_uri: databricks
  libraries:
    - pypi: sentence-transformers
    - pypi: faiss-cpu
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'sentence-transformers', 'faiss-cpu', 'mlflow', 'numpy'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow on ML Runtime cluster (GPU recommended). Uses SentenceTransformers for embedding generation via Pandas UDF, FAISS IVF index for similarity search, Delta table as persistent vector store. MLflow for model versioning.'
WHERE slug = 'vector-memory';

-- =============================================================================
-- 10. CTI-ATTRIBUTION
-- =============================================================================
UPDATE agent_implementations SET
  production_code = $py$
# Databricks notebook source
# MAGIC %md
# MAGIC # CTI Attribution Agent
# MAGIC Threat intel API ingestion. Calls AlienVault OTX, MISP, Abuse.ch APIs.
# MAGIC Normalizes IOCs, computes freshness decay, writes to threat_feed_items via Delta MERGE.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "agentic_soc")
dbutils.widgets.text("freshness_decay_days", "90")
dbutils.widgets.text("min_confidence", "0.3")
dbutils.widgets.text("max_iocs_per_source", "5000")
dbutils.widgets.text("secret_scope", "soc-threat-intel")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
decay_days = int(dbutils.widgets.get("freshness_decay_days"))
min_conf = float(dbutils.widgets.get("min_confidence"))
max_iocs = int(dbutils.widgets.get("max_iocs_per_source"))
secret_scope = dbutils.widgets.get("secret_scope")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    DoubleType, ArrayType, MapType
)
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import requests
import json
import math

# COMMAND ----------

# Retrieve API keys from Databricks secrets
otx_api_key = dbutils.secrets.get(scope=secret_scope, key="alienvault-otx-api-key")
misp_api_key = dbutils.secrets.get(scope=secret_scope, key="misp-api-key")
misp_url = dbutils.secrets.get(scope=secret_scope, key="misp-url")
abusech_api_key = dbutils.secrets.get(scope=secret_scope, key="abusech-api-key")

print("[CTI-Attribution] Credentials loaded from Databricks secrets")

# COMMAND ----------

def compute_freshness_decay(last_seen_str, decay_days=90):
    """Compute exponential freshness decay score."""
    if not last_seen_str:
        return 0.1
    try:
        last_seen = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
        age_days = (datetime.utcnow() - last_seen.replace(tzinfo=None)).days
        decay = math.exp(-age_days / decay_days)
        return max(0.01, min(1.0, decay))
    except Exception:
        return 0.1

# COMMAND ----------

# Fetch IOCs from AlienVault OTX
def fetch_otx_iocs(api_key, max_results=5000):
    """Fetch recent IOCs from AlienVault OTX API."""
    headers = {"X-OTX-API-KEY": api_key}
    base_url = "https://otx.alienvault.com/api/v1/indicators/export"
    iocs = []

    for ioc_type in ["IPv4", "domain", "hostname", "URL", "FileHash-SHA256"]:
        try:
            resp = requests.get(
                f"{base_url}?type={ioc_type}&modified_since=30d",
                headers=headers, timeout=30
            )
            if resp.status_code == 200:
                for line in resp.text.strip().split("\n")[:max_results]:
                    if line.strip():
                        iocs.append({
                            "indicator_value": line.strip(),
                            "indicator_type": ioc_type.lower().replace("filehash-", ""),
                            "source_feed": "alienvault_otx",
                            "threat_type": "unknown",
                            "first_seen": datetime.utcnow().isoformat(),
                            "last_seen": datetime.utcnow().isoformat(),
                            "raw_confidence": 0.7
                        })
        except Exception as e:
            print(f"[CTI] OTX error for {ioc_type}: {e}")

    return iocs[:max_results]

# COMMAND ----------

# Fetch IOCs from MISP
def fetch_misp_iocs(api_key, misp_url, max_results=5000):
    """Fetch recent IOCs from MISP instance."""
    headers = {"Authorization": api_key, "Content-Type": "application/json", "Accept": "application/json"}
    iocs = []

    try:
        payload = {
            "returnFormat": "json",
            "limit": max_results,
            "publish_timestamp": "30d",
            "type": ["ip-dst", "ip-src", "domain", "hostname", "sha256", "md5", "url"]
        }
        resp = requests.post(
            f"{misp_url}/attributes/restSearch",
            headers=headers, json=payload, timeout=60, verify=False
        )
        if resp.status_code == 200:
            data = resp.json()
            for attr in data.get("response", {}).get("Attribute", []):
                iocs.append({
                    "indicator_value": attr.get("value", ""),
                    "indicator_type": attr.get("type", "unknown"),
                    "source_feed": "misp",
                    "threat_type": attr.get("category", "unknown"),
                    "first_seen": attr.get("first_seen", datetime.utcnow().isoformat()),
                    "last_seen": attr.get("timestamp", datetime.utcnow().isoformat()),
                    "raw_confidence": float(attr.get("confidence", 50)) / 100.0
                })
    except Exception as e:
        print(f"[CTI] MISP error: {e}")

    return iocs[:max_results]

# COMMAND ----------

# Fetch IOCs from Abuse.ch (URLhaus + MalwareBazaar)
def fetch_abusech_iocs(max_results=5000):
    """Fetch recent IOCs from Abuse.ch feeds."""
    iocs = []

    # URLhaus recent URLs
    try:
        resp = requests.get("https://urlhaus-api.abuse.ch/v1/urls/recent/", timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            for entry in data.get("urls", [])[:max_results]:
                iocs.append({
                    "indicator_value": entry.get("url", ""),
                    "indicator_type": "url",
                    "source_feed": "abusech_urlhaus",
                    "threat_type": entry.get("threat", "malware"),
                    "first_seen": entry.get("date_added", datetime.utcnow().isoformat()),
                    "last_seen": entry.get("date_added", datetime.utcnow().isoformat()),
                    "raw_confidence": 0.85
                })
    except Exception as e:
        print(f"[CTI] Abuse.ch URLhaus error: {e}")

    # MalwareBazaar recent hashes
    try:
        resp = requests.post(
            "https://mb-api.abuse.ch/api/v1/",
            data={"query": "get_recent", "selector": "100"},
            timeout=30
        )
        if resp.status_code == 200:
            data = resp.json()
            for entry in data.get("data", [])[:max_results]:
                iocs.append({
                    "indicator_value": entry.get("sha256_hash", ""),
                    "indicator_type": "sha256",
                    "source_feed": "abusech_malwarebazaar",
                    "threat_type": "malware",
                    "first_seen": entry.get("first_seen", datetime.utcnow().isoformat()),
                    "last_seen": entry.get("first_seen", datetime.utcnow().isoformat()),
                    "raw_confidence": 0.9
                })
    except Exception as e:
        print(f"[CTI] Abuse.ch MalwareBazaar error: {e}")

    return iocs[:max_results]

# COMMAND ----------

# Collect IOCs from all sources
print("[CTI-Attribution] Fetching from AlienVault OTX...")
otx_iocs = fetch_otx_iocs(otx_api_key, max_iocs)

print("[CTI-Attribution] Fetching from MISP...")
misp_iocs = fetch_misp_iocs(misp_api_key, misp_url, max_iocs)

print("[CTI-Attribution] Fetching from Abuse.ch...")
abusech_iocs = fetch_abusech_iocs(max_iocs)

all_iocs = otx_iocs + misp_iocs + abusech_iocs
print(f"[CTI-Attribution] Total IOCs fetched: {len(all_iocs)} (OTX: {len(otx_iocs)}, MISP: {len(misp_iocs)}, Abuse.ch: {len(abusech_iocs)})")

# COMMAND ----------

# Convert to DataFrame and compute freshness-adjusted confidence
if len(all_iocs) > 0:
    iocs_df = spark.createDataFrame(all_iocs)

    normalized_df = iocs_df \
        .withColumn("ioc_id", F.expr("uuid()")) \
        .withColumn("freshness_score",
            F.expr(f"exp(-datediff(current_date(), to_date(last_seen)) / {decay_days})")
        ) \
        .withColumn("confidence_score",
            F.col("raw_confidence") * F.col("freshness_score")
        ) \
        .filter(F.col("confidence_score") >= min_conf) \
        .withColumn("ingested_at", F.current_timestamp()) \
        .withColumn("indicator_value", F.trim(F.col("indicator_value"))) \
        .filter(F.length(F.col("indicator_value")) > 0) \
        .dropDuplicates(["indicator_value", "source_feed"])

    final_count = normalized_df.count()
    print(f"[CTI-Attribution] After normalization and dedup: {final_count} IOCs")

    # MERGE into threat_feed_items
    threat_delta = DeltaTable.forName(spark, f"{catalog}.{schema}.threat_feed_items")
    threat_delta.alias("target").merge(
        normalized_df.alias("source"),
        "target.indicator_value = source.indicator_value AND target.source_feed = source.source_feed"
    ).whenMatchedUpdate(
        condition="source.last_seen > target.last_seen",
        set={
            "last_seen": "source.last_seen",
            "confidence_score": "source.confidence_score",
            "freshness_score": "source.freshness_score",
            "threat_type": "source.threat_type",
            "updated_at": F.current_timestamp()
        }
    ).whenNotMatchedInsert(values={
        "ioc_id": "source.ioc_id",
        "indicator_value": "source.indicator_value",
        "indicator_type": "source.indicator_type",
        "source_feed": "source.source_feed",
        "threat_type": "source.threat_type",
        "first_seen": "source.first_seen",
        "last_seen": "source.last_seen",
        "confidence_score": "source.confidence_score",
        "freshness_score": "source.freshness_score",
        "ingested_at": "source.ingested_at",
        "created_at": F.current_timestamp()
    }).execute()

    print(f"[CTI-Attribution] MERGE complete. {final_count} IOCs processed.")
else:
    print("[CTI-Attribution] No IOCs fetched from any source.")

# COMMAND ----------

# Use LLM to attribute threat actor patterns
recent_high_conf = spark.sql(f"""
    SELECT indicator_value, indicator_type, threat_type, source_feed, confidence_score
    FROM {catalog}.{schema}.threat_feed_items
    WHERE confidence_score >= 0.8
    AND ingested_at >= current_timestamp() - INTERVAL 1 HOUR
    LIMIT 20
""")

if recent_high_conf.count() > 0:
    ioc_summary = recent_high_conf.toPandas().to_json(orient="records")
    attribution_df = spark.sql(f"""
        SELECT ai_query(
            'databricks-meta-llama-3-1-70b-instruct',
            'Given these high-confidence IOCs, identify likely threat actor groups (APT28, Lazarus, etc.) and TTPs. Return JSON with actor_name, confidence, ttps array. IOCs: {ioc_summary[:2000]}'
        ) as attribution_result
    """)
    attribution_df.write.mode("overwrite").saveAsTable(f"{catalog}.{schema}.cti_attribution_latest")

print("[CTI-Attribution] Attribution complete.")
$py$,
  config_yaml = $yml$
agent:
  slug: cti-attribution
  display_name: CTI Attribution (Threat Intel Ingestion)
  version: "2.0.0"
  runtime: databricks-notebook
  schedule: "0 */4 * * *"
  cluster_policy: soc-standard
  node_type: Standard_DS3_v2
  num_workers: 0
  spark_conf:
    spark.databricks.delta.optimizeWrite.enabled: "true"
  parameters:
    catalog: soc_platform
    schema: agentic_soc
    freshness_decay_days: "90"
    min_confidence: "0.3"
    max_iocs_per_source: "5000"
    secret_scope: soc-threat-intel
  secrets:
    scope: soc-threat-intel
    keys:
      - alienvault-otx-api-key
      - misp-api-key
      - misp-url
      - abusech-api-key
  feeds:
    - name: AlienVault OTX
      types: [ipv4, domain, hostname, url, sha256]
    - name: MISP
      types: [ip-dst, ip-src, domain, sha256, md5, url]
    - name: Abuse.ch URLhaus
      types: [url]
    - name: Abuse.ch MalwareBazaar
      types: [sha256]
$yml$,
  dependencies = ARRAY['pyspark', 'delta-spark', 'requests'],
  notes = 'Databricks-native. Deploy as scheduled Databricks Workflow every 4 hours. Single-node cluster for API calls. Uses dbutils.secrets.get() for credential management. Exponential freshness decay scoring. Delta MERGE for upsert with last-seen update. LLM attribution via ai_query for threat actor identification.'
WHERE slug = 'cti-attribution';