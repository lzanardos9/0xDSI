# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion 09: Edge Collector Framework
# MAGIC
# MAGIC Manages lightweight edge collectors that forward events from remote sites,
# MAGIC IoT/OT networks, cloud VPCs, and air-gapped enclaves into the SOC platform.
# MAGIC
# MAGIC **Edge Collector Architecture:**
# MAGIC ```
# MAGIC  [Remote Site]     [Cloud VPC]     [OT/SCADA]    [Container]
# MAGIC       │                 │               │              │
# MAGIC  ┌────▼────┐      ┌────▼────┐    ┌────▼────┐   ┌────▼────┐
# MAGIC  │Collector│      │Collector│    │Collector│   │Collector│
# MAGIC  │  Agent  │      │  Agent  │    │  Agent  │   │  Agent  │
# MAGIC  └────┬────┘      └────┬────┘    └────┬────┘   └────┬────┘
# MAGIC       │ gRPC/HTTPS      │ Kafka        │ MQTT        │ stdout
# MAGIC       └────────────┬────┴──────────┬───┘─────────────┘
# MAGIC              ┌─────▼──────────────▼───┐
# MAGIC              │  Edge Collector Hub     │  ← this notebook manages
# MAGIC              │  (Ingest + Route)       │
# MAGIC              └─────────┬──────────────┘
# MAGIC                        │
# MAGIC              ┌─────────▼──────────────┐
# MAGIC              │  Bronze Events Table    │
# MAGIC              └────────────────────────┘
# MAGIC ```
# MAGIC
# MAGIC **Responsibilities:**
# MAGIC 1. **Registry** — Track all collectors, their health, config versions
# MAGIC 2. **Heartbeat Monitoring** — Detect offline/degraded collectors
# MAGIC 3. **Config Distribution** — Push filter rules, sampling rates, buffer policies
# MAGIC 4. **Backpressure Management** — Detect and handle collector saturation
# MAGIC 5. **Bandwidth Optimization** — Manage compression, batching, dedup at edge
# MAGIC 6. **Certificate Rotation** — Track mTLS cert expiration for collectors
# MAGIC
# MAGIC **Scheduling:** Every 2 minutes (heartbeat check), hourly (config sync)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("mode", "heartbeat", "Mode: heartbeat | config_sync | register | decommission")
dbutils.widgets.text("heartbeat_timeout_seconds", "300", "Seconds before collector is considered offline")
dbutils.widgets.text("max_backpressure_events", "100000", "Queue depth before backpressure alert")
dbutils.widgets.text("collector_id", "", "Collector ID (for register/decommission modes)")

mode = dbutils.widgets.get("mode")
heartbeat_timeout = int(dbutils.widgets.get("heartbeat_timeout_seconds"))
max_backpressure = int(dbutils.widgets.get("max_backpressure_events"))
collector_id_param = dbutils.widgets.get("collector_id")
require_tables("edge_collector_registry", "edge_collector_heartbeats")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Collector Tables

# COMMAND ----------

registry_table = get_table_path(cfg, "edge_collector_registry")
heartbeats_table = get_table_path(cfg, "edge_collector_heartbeats")
config_table = get_table_path(cfg, "edge_collector_configs")
incidents_table = get_table_path(cfg, "edge_collector_incidents")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {registry_table} (
    collector_id STRING NOT NULL,
    collector_name STRING NOT NULL,
    collector_type STRING NOT NULL,
    -- Location
    site_name STRING,
    region STRING,
    environment STRING,
    network_zone STRING,
    -- Capabilities
    transport_protocol STRING NOT NULL,
    supported_sources ARRAY<STRING>,
    max_eps INT DEFAULT 10000,
    compression STRING DEFAULT 'zstd',
    -- Security
    mtls_cert_fingerprint STRING,
    mtls_cert_expires TIMESTAMP,
    api_key_hash STRING,
    -- State
    status STRING DEFAULT 'registered',
    version STRING,
    config_version INT DEFAULT 1,
    last_heartbeat TIMESTAMP,
    last_config_sync TIMESTAMP,
    events_forwarded_total BIGINT DEFAULT 0,
    events_forwarded_24h BIGINT DEFAULT 0,
    -- Metadata
    registered_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {heartbeats_table} (
    heartbeat_id STRING NOT NULL,
    collector_id STRING NOT NULL,
    received_at TIMESTAMP NOT NULL,
    -- Health metrics
    cpu_percent DOUBLE,
    memory_percent DOUBLE,
    disk_percent DOUBLE,
    queue_depth BIGINT DEFAULT 0,
    events_per_second DOUBLE DEFAULT 0.0,
    bytes_per_second DOUBLE DEFAULT 0.0,
    -- Connectivity
    latency_ms DOUBLE,
    dropped_events BIGINT DEFAULT 0,
    retry_count INT DEFAULT 0,
    -- Errors
    error_count INT DEFAULT 0,
    last_error STRING,
    -- Version info
    agent_version STRING,
    config_version INT
)
USING DELTA
PARTITIONED BY (collector_id)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {config_table} (
    config_id STRING NOT NULL,
    collector_id STRING,
    config_scope STRING NOT NULL,
    -- Configuration
    filter_rules STRING,
    sampling_rate DOUBLE DEFAULT 1.0,
    batch_size INT DEFAULT 1000,
    batch_interval_ms INT DEFAULT 5000,
    buffer_max_bytes BIGINT DEFAULT 104857600,
    compression STRING DEFAULT 'zstd',
    -- Source routing
    source_includes ARRAY<STRING>,
    source_excludes ARRAY<STRING>,
    -- Rate limiting
    max_eps INT DEFAULT 10000,
    throttle_on_backpressure BOOLEAN DEFAULT true,
    -- Version
    version INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {incidents_table} (
    incident_id STRING NOT NULL,
    collector_id STRING NOT NULL,
    incident_type STRING NOT NULL,
    severity STRING NOT NULL,
    title STRING NOT NULL,
    description STRING,
    -- Impact
    events_at_risk BIGINT DEFAULT 0,
    data_loss_estimated BOOLEAN DEFAULT false,
    -- Resolution
    auto_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Heartbeat Mode: Monitor Collector Health

# COMMAND ----------

if mode == "heartbeat":
    with mon.time("heartbeat_check"):
        now = datetime.utcnow()
        timeout_cutoff = now - timedelta(seconds=heartbeat_timeout)

        # Get all registered collectors
        collectors = spark.sql(f"""
            SELECT collector_id, collector_name, site_name, status,
                   last_heartbeat, max_eps, collector_type
            FROM {registry_table}
            WHERE status NOT IN ('decommissioned', 'disabled')
        """)

        total_collectors = collectors.count()
        if total_collectors == 0:
            print("No registered collectors")
            dbutils.notebook.exit(json.dumps({"status": "no_collectors"}))

        # Identify offline collectors
        offline = collectors.filter(
            (col("last_heartbeat") < lit(timeout_cutoff)) |
            col("last_heartbeat").isNull()
        )
        offline_count = offline.count()

        # Check for backpressure
        recent_heartbeats = spark.sql(f"""
            SELECT collector_id, queue_depth, events_per_second,
                   error_count, dropped_events, cpu_percent, memory_percent
            FROM {heartbeats_table}
            WHERE received_at > '{(now - timedelta(minutes=5)).isoformat()}'
        """)

        backpressured = recent_heartbeats.filter(col("queue_depth") > max_backpressure)
        bp_count = backpressured.count()

        # Check for high error rates
        erroring = recent_heartbeats.filter(col("error_count") > 10)
        error_count = erroring.count()

        # Check for resource exhaustion
        exhausted = recent_heartbeats.filter(
            (col("cpu_percent") > 90) | (col("memory_percent") > 90) | (col("disk_percent") > 90)
        )
        exhausted_count = exhausted.count() if "disk_percent" in recent_heartbeats.columns else 0

        # Update status for offline collectors
        if offline_count > 0:
            offline_ids = [r.collector_id for r in offline.collect()]
            for cid in offline_ids:
                spark.sql(f"""
                    UPDATE {registry_table}
                    SET status = 'offline', updated_at = current_timestamp()
                    WHERE collector_id = '{cid}' AND status != 'offline'
                """)

                # Create incident
                spark.createDataFrame([{
                    "incident_id": f"offline_{cid}_{now.strftime('%Y%m%d%H%M')}",
                    "collector_id": cid,
                    "incident_type": "collector_offline",
                    "severity": "high",
                    "title": f"Collector offline: {cid}",
                    "description": f"No heartbeat received in {heartbeat_timeout}s",
                    "events_at_risk": 0,
                    "data_loss_estimated": True,
                    "auto_resolved": False,
                }]).withColumn("created_at", current_timestamp()).withColumn(
                    "resolved_at", lit(None).cast("timestamp")
                ).withColumn("resolution", lit(None).cast("string")).write.mode(
                    "append"
                ).option("mergeSchema", "true").saveAsTable(incidents_table)

        # Backpressure incidents
        if bp_count > 0:
            for row in backpressured.collect():
                spark.createDataFrame([{
                    "incident_id": f"bp_{row.collector_id}_{now.strftime('%H%M')}",
                    "collector_id": row.collector_id,
                    "incident_type": "backpressure",
                    "severity": "medium",
                    "title": f"Backpressure on {row.collector_id}",
                    "description": f"Queue depth: {row.queue_depth} (threshold: {max_backpressure})",
                    "events_at_risk": int(row.queue_depth),
                    "data_loss_estimated": False,
                    "auto_resolved": False,
                }]).withColumn("created_at", current_timestamp()).withColumn(
                    "resolved_at", lit(None).cast("timestamp")
                ).withColumn("resolution", lit(None).cast("string")).write.mode(
                    "append"
                ).option("mergeSchema", "true").saveAsTable(incidents_table)

        # Update online collectors
        online_count = total_collectors - offline_count
        spark.sql(f"""
            UPDATE {registry_table}
            SET status = 'healthy', updated_at = current_timestamp()
            WHERE status = 'offline'
              AND last_heartbeat > '{timeout_cutoff.isoformat()}'
        """)

        print(f"\nEdge Collector Fleet Status:")
        print(f"  Total: {total_collectors}")
        print(f"  Online: {online_count}")
        print(f"  Offline: {offline_count}")
        print(f"  Backpressured: {bp_count}")
        print(f"  Erroring: {error_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Config Sync Mode: Push Configuration Updates

# COMMAND ----------

if mode == "config_sync":
    with mon.time("config_sync"):
        # Find collectors with outdated configs
        outdated = spark.sql(f"""
            SELECT r.collector_id, r.config_version as current_version,
                   c.version as latest_version, c.config_id
            FROM {registry_table} r
            JOIN {config_table} c ON (c.collector_id = r.collector_id OR c.config_scope = 'global')
              AND c.is_active = true
            WHERE r.config_version < c.version
              AND r.status IN ('healthy', 'degraded')
        """)

        sync_count = outdated.count()
        if sync_count > 0:
            for row in outdated.collect():
                spark.sql(f"""
                    UPDATE {registry_table}
                    SET config_version = {row.latest_version},
                        last_config_sync = current_timestamp(),
                        updated_at = current_timestamp()
                    WHERE collector_id = '{row.collector_id}'
                """)
            print(f"Synced config to {sync_count} collectors")
        else:
            print("All collectors have latest config")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Register Mode: Add New Collector

# COMMAND ----------

if mode == "register" and collector_id_param:
    with mon.time("register_collector"):
        existing = spark.sql(f"SELECT COUNT(*) FROM {registry_table} WHERE collector_id = '{collector_id_param}'").first()[0]

        if existing > 0:
            print(f"Collector {collector_id_param} already registered")
        else:
            new_collector = spark.createDataFrame([{
                "collector_id": collector_id_param,
                "collector_name": collector_id_param,
                "collector_type": "generic",
                "site_name": "default",
                "region": "unknown",
                "environment": "production",
                "network_zone": "dmz",
                "transport_protocol": "https",
                "supported_sources": ["syslog", "json", "cef"],
                "max_eps": 10000,
                "compression": "zstd",
                "status": "registered",
                "version": "1.0.0",
                "config_version": 1,
                "events_forwarded_total": 0,
                "events_forwarded_24h": 0,
            }])
            new_collector.withColumn("registered_at", current_timestamp()).withColumn(
                "updated_at", current_timestamp()
            ).withColumn("last_heartbeat", lit(None).cast("timestamp")).withColumn(
                "last_config_sync", lit(None).cast("timestamp")
            ).withColumn("mtls_cert_fingerprint", lit(None).cast("string")).withColumn(
                "mtls_cert_expires", lit(None).cast("timestamp")
            ).withColumn("api_key_hash", lit(None).cast("string")).write.mode(
                "append"
            ).option("mergeSchema", "true").saveAsTable(registry_table)
            print(f"Registered collector: {collector_id_param}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Decommission Mode

# COMMAND ----------

if mode == "decommission" and collector_id_param:
    with mon.time("decommission"):
        spark.sql(f"""
            UPDATE {registry_table}
            SET status = 'decommissioned', updated_at = current_timestamp()
            WHERE collector_id = '{collector_id_param}'
        """)
        print(f"Decommissioned collector: {collector_id_param}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Certificate Expiration Check

# COMMAND ----------

if mode == "heartbeat":
    with mon.time("cert_check"):
        expiring_soon = spark.sql(f"""
            SELECT collector_id, collector_name, mtls_cert_expires
            FROM {registry_table}
            WHERE mtls_cert_expires IS NOT NULL
              AND mtls_cert_expires < current_timestamp() + INTERVAL 7 DAYS
              AND status NOT IN ('decommissioned', 'disabled')
        """)

        expiring_count = expiring_soon.count()
        if expiring_count > 0:
            for row in expiring_soon.collect():
                spark.createDataFrame([{
                    "incident_id": f"cert_{row.collector_id}_{datetime.utcnow().strftime('%Y%m%d')}",
                    "collector_id": row.collector_id,
                    "incident_type": "cert_expiring",
                    "severity": "high",
                    "title": f"mTLS cert expiring: {row.collector_name}",
                    "description": f"Certificate expires {row.mtls_cert_expires}. Rotate immediately.",
                    "events_at_risk": 0,
                    "data_loss_estimated": False,
                    "auto_resolved": False,
                }]).withColumn("created_at", current_timestamp()).withColumn(
                    "resolved_at", lit(None).cast("timestamp")
                ).withColumn("resolution", lit(None).cast("string")).write.mode(
                    "append"
                ).option("mergeSchema", "true").saveAsTable(incidents_table)
            print(f"  Certificates expiring soon: {expiring_count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_collectors = spark.sql(f"SELECT COUNT(*) FROM {registry_table} WHERE status != 'decommissioned'").first()[0]
healthy = spark.sql(f"SELECT COUNT(*) FROM {registry_table} WHERE status = 'healthy'").first()[0]
open_incidents = spark.sql(f"SELECT COUNT(*) FROM {incidents_table} WHERE auto_resolved = false AND resolved_at IS NULL").first()[0]

result = {
    "notebook": "09_edge_collector_framework",
    "mode": mode,
    "status": "completed",
    "total_collectors": total_collectors,
    "healthy_collectors": healthy,
    "open_incidents": open_incidents,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
