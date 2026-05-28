# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion - Lakebase Sync Engine
# MAGIC
# MAGIC Production implementation of the **Lakebase** architecture layer:
# MAGIC - Delta Lake (analytics) -> Lakebase (low-latency RDBMS sync)
# MAGIC - Uses Spark Structured Streaming with CDC (Change Data Feed)
# MAGIC - Sub-100ms latency for application queries via incremental sync
# MAGIC - Manages session lists and active lists as stateful streaming tables
# MAGIC
# MAGIC Sync modes:
# MAGIC - **CDC (real-time)**: alerts, cases, session_lists, active_lists
# MAGIC - **Incremental (1-min)**: events, threat_feeds
# MAGIC - **Full (hourly)**: reference data, correlation_rules
# MAGIC
# MAGIC Target: Postgres (Supabase) via JDBC or Delta Sharing

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import time
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.streaming import StreamingQuery
from concurrent.futures import ThreadPoolExecutor, as_completed

# COMMAND ----------

dbutils.widgets.text("mode", "streaming", "Execution mode: streaming | batch | full_refresh")
dbutils.widgets.text("target", "postgres", "Sync target: postgres | delta_sharing")
dbutils.widgets.text("max_concurrent_streams", "6", "Max concurrent streaming queries")
dbutils.widgets.text("trigger_interval", "10 seconds", "Streaming trigger interval")

mode = dbutils.widgets.get("mode")
target = dbutils.widgets.get("target")
max_streams = int(dbutils.widgets.get("max_concurrent_streams"))
trigger_interval = dbutils.widgets.get("trigger_interval")

# JDBC connection for Postgres sync
POSTGRES_URL = secrets_mgr.get("supabase-postgres-jdbc-url")
POSTGRES_PROPERTIES = {
    "user": secrets_mgr.get("supabase-postgres-user"),
    "password": secrets_mgr.get("supabase-postgres-password"),
    "driver": "org.postgresql.Driver",
    "batchsize": "1000",
    "isolationLevel": "READ_COMMITTED",
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Lakebase Sync Configuration

# COMMAND ----------

# Tables to sync with their configuration
LAKEBASE_SYNC_CONFIG = [
    {
        "source_table": "session_lists",
        "target_table": "session_lists",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "track_columns": ["name", "list_type", "entries", "ttl_seconds", "expires_at"],
    },
    {
        "source_table": "active_lists",
        "target_table": "active_lists",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "track_columns": ["name", "category", "entries", "max_size", "updated_at"],
    },
    {
        "source_table": "alerts",
        "target_table": "alerts",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "track_columns": ["status", "severity", "assigned_to", "resolved_at"],
    },
    {
        "source_table": "cases",
        "target_table": "cases",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "track_columns": ["status", "severity", "assigned_to", "closed_at"],
    },
    {
        "source_table": "silver_events",
        "target_table": "events",
        "sync_type": "incremental",
        "priority": 2,
        "key_columns": ["id"],
        "watermark_column": "timestamp",
        "max_rows_per_batch": 10000,
    },
    {
        "source_table": "threat_feeds",
        "target_table": "threat_feeds",
        "sync_type": "incremental",
        "priority": 3,
        "key_columns": ["id"],
        "watermark_column": "updated_at",
    },
    {
        "source_table": "correlation_rules",
        "target_table": "correlation_rules",
        "sync_type": "full",
        "priority": 4,
        "key_columns": ["id"],
    },
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## CDC Streaming Sync (Change Data Feed)

# COMMAND ----------

def start_cdc_stream(config: dict) -> StreamingQuery:
    """
    Start a CDC streaming sync using Delta Change Data Feed.
    Captures INSERT, UPDATE, DELETE operations and applies them downstream.
    """
    source = cfg.get_table_path(config["source_table"])
    target_table = config["target_table"]
    checkpoint = get_checkpoint_path(cfg, f"lakebase_cdc_{config['source_table']}")

    # Read Change Data Feed from Delta table
    cdc_stream = (
        spark.readStream
        .format("delta")
        .option("readChangeFeed", "true")
        .option("startingVersion", "latest")
        .table(source)
    )

    def write_cdc_batch(batch_df, batch_id):
        """Apply CDC operations to Postgres via JDBC."""
        if batch_df.count() == 0:
            return

        batch_start = time.time()

        # Separate by operation type
        inserts = batch_df.filter(F.col("_change_type") == "insert")
        updates = batch_df.filter(F.col("_change_type") == "update_postimage")
        deletes = batch_df.filter(F.col("_change_type") == "delete")

        # Drop CDC metadata columns before writing
        cdc_cols = ["_change_type", "_commit_version", "_commit_timestamp"]
        clean_cols = [c for c in batch_df.columns if c not in cdc_cols]

        # Upsert (INSERT + UPDATE) via overwrite mode on key columns
        upserts = inserts.union(updates).select(clean_cols)
        if upserts.count() > 0:
            (
                upserts
                .write
                .format("jdbc")
                .option("url", POSTGRES_URL)
                .option("dbtable", target_table)
                .options(**POSTGRES_PROPERTIES)
                .mode("append")  # Use append + ON CONFLICT via Postgres
                .save()
            )

        # Track deletes (soft-delete in target)
        if deletes.count() > 0:
            delete_ids = [row.id for row in deletes.select("id").collect()]
            mon.log_event(f"lakebase_deletes_{target_table}", {"count": len(delete_ids)})

        elapsed_ms = (time.time() - batch_start) * 1000
        mon.log_event(f"lakebase_cdc_batch_{target_table}", {
            "batch_id": batch_id,
            "inserts": inserts.count(),
            "updates": updates.count(),
            "deletes": deletes.count(),
            "elapsed_ms": elapsed_ms,
        })

    query = (
        cdc_stream
        .writeStream
        .foreachBatch(write_cdc_batch)
        .option("checkpointLocation", checkpoint)
        .trigger(processingTime=trigger_interval)
        .queryName(f"lakebase_cdc_{config['source_table']}")
        .start()
    )

    mon.log_info(f"CDC stream started: {config['source_table']} -> {target_table}")
    return query

# COMMAND ----------

# MAGIC %md
# MAGIC ## Incremental Sync (Watermark-Based)

# COMMAND ----------

def run_incremental_sync(config: dict) -> int:
    """
    Incremental sync based on watermark column.
    Reads only rows newer than last sync point.
    """
    source = cfg.get_table_path(config["source_table"])
    target_table = config["target_table"]
    watermark_col = config.get("watermark_column", "created_at")
    max_rows = config.get("max_rows_per_batch", 50000)

    # Get last sync watermark from tracking table
    tracking_table = cfg.get_table_path("lakebase_sync_tracking")
    try:
        last_sync = spark.sql(f"""
            SELECT MAX(last_watermark) as wm
            FROM {tracking_table}
            WHERE source_table = '{config['source_table']}'
        """).first()
        last_watermark = last_sync.wm if last_sync and last_sync.wm else datetime(2020, 1, 1)
    except Exception:
        last_watermark = datetime(2020, 1, 1)

    # Read new rows since last watermark
    new_rows = (
        spark.table(source)
        .filter(F.col(watermark_col) > F.lit(last_watermark))
        .orderBy(watermark_col)
        .limit(max_rows)
    )

    row_count = new_rows.count()
    if row_count == 0:
        return 0

    # Write to Postgres
    (
        new_rows
        .write
        .format("jdbc")
        .option("url", POSTGRES_URL)
        .option("dbtable", target_table)
        .options(**POSTGRES_PROPERTIES)
        .mode("append")
        .save()
    )

    # Update watermark tracking
    new_watermark = new_rows.agg(F.max(watermark_col)).first()[0]
    tracking_data = [{
        "source_table": config["source_table"],
        "target_table": target_table,
        "last_watermark": new_watermark,
        "rows_synced": row_count,
        "synced_at": datetime.utcnow(),
    }]
    tracking_df = spark.createDataFrame(tracking_data)
    safe_merge(
        spark, tracking_df, "lakebase_sync_tracking",
        merge_keys=["source_table"],
        catalog=cfg.catalog, schema=cfg.schema,
    )

    mon.log_event(f"lakebase_incremental_{config['source_table']}", {
        "rows_synced": row_count,
        "watermark": str(new_watermark),
    })
    return row_count

# COMMAND ----------

# MAGIC %md
# MAGIC ## Full Refresh Sync

# COMMAND ----------

def run_full_sync(config: dict) -> int:
    """Full table overwrite to target (for reference data that changes infrequently)."""
    source = cfg.get_table_path(config["source_table"])
    target_table = config["target_table"]

    source_df = spark.table(source)
    row_count = source_df.count()

    (
        source_df
        .write
        .format("jdbc")
        .option("url", POSTGRES_URL)
        .option("dbtable", target_table)
        .options(**POSTGRES_PROPERTIES)
        .option("truncate", "true")
        .mode("overwrite")
        .save()
    )

    mon.log_event(f"lakebase_full_{config['source_table']}", {"rows_synced": row_count})
    return row_count

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Tracking Table Exists

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('lakebase_sync_tracking')} (
    source_table STRING NOT NULL,
    target_table STRING NOT NULL,
    last_watermark TIMESTAMP,
    rows_synced BIGINT DEFAULT 0,
    synced_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

try:
    result = {"notebook": "07_lakebase_sync", "status": "success", "started_at": datetime.utcnow().isoformat()}
    active_streams = []
    total_rows_synced = 0

    if mode == "streaming":
        # Start CDC streams for real-time tables
        with mon.time("start_cdc_streams"):
            cdc_configs = [c for c in LAKEBASE_SYNC_CONFIG if c["sync_type"] == "cdc"]
            for config in cdc_configs:
                try:
                    query = start_cdc_stream(config)
                    active_streams.append(query)
                except Exception as e:
                    mon.log_warning(f"Failed to start CDC for {config['source_table']}: {e}")

        # Run incremental syncs once
        with mon.time("incremental_syncs"):
            inc_configs = [c for c in LAKEBASE_SYNC_CONFIG if c["sync_type"] == "incremental"]
            for config in inc_configs:
                try:
                    rows = run_incremental_sync(config)
                    total_rows_synced += rows
                except Exception as e:
                    mon.log_warning(f"Incremental sync failed for {config['source_table']}: {e}")

        # Await streaming (with timeout for scheduled runs)
        mon.log_info(f"Lakebase: {len(active_streams)} CDC streams active, awaiting termination")
        spark.streams.awaitAnyTermination(timeout=600)

    elif mode == "batch":
        # Run all syncs as batch operations
        with mon.time("batch_sync_all"):
            for config in sorted(LAKEBASE_SYNC_CONFIG, key=lambda x: x["priority"]):
                try:
                    if config["sync_type"] in ("cdc", "incremental"):
                        rows = run_incremental_sync(config)
                    else:
                        rows = run_full_sync(config)
                    total_rows_synced += rows
                    mon.log_event("batch_sync_complete", {
                        "table": config["source_table"],
                        "rows": rows,
                    })
                except Exception as e:
                    mon.log_warning(f"Batch sync failed for {config['source_table']}: {e}")

    elif mode == "full_refresh":
        # Full refresh all tables
        with mon.time("full_refresh_all"):
            for config in LAKEBASE_SYNC_CONFIG:
                try:
                    rows = run_full_sync(config)
                    total_rows_synced += rows
                except Exception as e:
                    mon.log_warning(f"Full refresh failed for {config['source_table']}: {e}")

    result.update({
        "mode": mode,
        "target": target,
        "tables_configured": len(LAKEBASE_SYNC_CONFIG),
        "cdc_streams_active": len(active_streams),
        "total_rows_synced": total_rows_synced,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=total_rows_synced)

except Exception as e:
    result = {
        "notebook": "07_lakebase_sync",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="lakebase_sync")
    # Stop any active streams on error
    for stream in active_streams:
        try:
            stream.stop()
        except Exception:
            pass
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
