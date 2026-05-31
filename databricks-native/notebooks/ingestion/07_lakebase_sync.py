# Databricks notebook source
# MAGIC %md
# MAGIC # Ingestion - Lakebase Sync Engine
# MAGIC
# MAGIC Production implementation of the **Lakebase** architecture layer:
# MAGIC - Delta Lake (analytics) -> Lakebase (low-latency serving tables in Delta)
# MAGIC - Uses Spark Structured Streaming with CDC (Change Data Feed)
# MAGIC - Materializes serving-optimized Delta tables with Z-ORDER indexing
# MAGIC - Manages session lists and active lists as stateful streaming tables
# MAGIC
# MAGIC Sync modes:
# MAGIC - **CDC (real-time)**: alerts, cases, session_lists, active_lists
# MAGIC - **Incremental (1-min)**: events, threat_feeds
# MAGIC - **Full (hourly)**: reference data, correlation_rules
# MAGIC
# MAGIC Target: Delta serving tables (lakebase_* prefix) optimized for point lookups.
# MAGIC Optionally syncs to external JDBC targets if secrets are configured.

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
dbutils.widgets.text("max_concurrent_streams", "6", "Max concurrent streaming queries")
dbutils.widgets.text("trigger_interval", "10 seconds", "Streaming trigger interval")

mode = dbutils.widgets.get("mode")
max_streams = int(dbutils.widgets.get("max_concurrent_streams"))
trigger_interval = dbutils.widgets.get("trigger_interval")
require_tables("events")

# Optional external JDBC target (not required -- Delta serving is the default)
JDBC_TARGET_ENABLED = False
JDBC_URL = None
JDBC_PROPERTIES = {}
try:
    JDBC_URL = secrets_mgr.get("lakebase-jdbc-url")
    JDBC_PROPERTIES = {
        "user": secrets_mgr.get("lakebase-jdbc-user"),
        "password": secrets_mgr.get("lakebase-jdbc-password"),
        "driver": secrets_mgr.get("lakebase-jdbc-driver", default="org.postgresql.Driver"),
        "batchsize": "1000",
        "isolationLevel": "READ_COMMITTED",
    }
    JDBC_TARGET_ENABLED = True
    mon.log_info("External JDBC target configured for Lakebase sync")
except Exception:
    mon.log_info("No external JDBC target; using Delta serving tables only")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Lakebase Serving Table Setup

# COMMAND ----------

def get_serving_table(table_name: str) -> str:
    """Get the lakebase serving table path (prefixed with lakebase_)."""
    return cfg.get_table_path(f"lakebase_{table_name}")


def ensure_serving_table(source_table: str, target_name: str):
    """Create serving table if not exists, mirroring source schema."""
    serving_path = get_serving_table(target_name)
    source_path = cfg.get_table_path(source_table)
    try:
        spark.table(serving_path)
    except Exception:
        # Create from source schema with CDC enabled
        spark.sql(f"""
            CREATE TABLE IF NOT EXISTS {serving_path}
            USING DELTA
            TBLPROPERTIES (
                'delta.enableChangeDataFeed' = 'true',
                'delta.autoOptimize.optimizeWrite' = 'true',
                'delta.autoOptimize.autoCompact' = 'true'
            )
            AS SELECT * FROM {source_path} WHERE 1=0
        """)
        mon.log_event("serving_table_created", {"table": serving_path})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Lakebase Sync Configuration

# COMMAND ----------

LAKEBASE_SYNC_CONFIG = [
    {
        "source_table": "session_lists",
        "target_table": "session_lists",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "z_order_cols": ["id", "name"],
    },
    {
        "source_table": "active_lists",
        "target_table": "active_lists",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "z_order_cols": ["id", "category"],
    },
    {
        "source_table": "alerts",
        "target_table": "alerts",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "z_order_cols": ["id", "severity", "created_at"],
    },
    {
        "source_table": "cases",
        "target_table": "cases",
        "sync_type": "cdc",
        "priority": 1,
        "key_columns": ["id"],
        "z_order_cols": ["id", "status"],
    },
    {
        "source_table": "silver_events",
        "target_table": "events",
        "sync_type": "incremental",
        "priority": 2,
        "key_columns": ["id"],
        "watermark_column": "timestamp",
        "max_rows_per_batch": 10000,
        "z_order_cols": ["timestamp", "source_ip", "event_type"],
    },
    {
        "source_table": "threat_feeds",
        "target_table": "threat_feeds",
        "sync_type": "incremental",
        "priority": 3,
        "key_columns": ["id"],
        "watermark_column": "updated_at",
        "z_order_cols": ["id"],
    },
    {
        "source_table": "correlation_rules",
        "target_table": "correlation_rules",
        "sync_type": "full",
        "priority": 4,
        "key_columns": ["id"],
        "z_order_cols": ["id", "severity"],
    },
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Helpers (Delta Serving + Optional JDBC)

# COMMAND ----------

def write_to_serving(df, config: dict, write_mode: str = "append"):
    """
    Write to Delta serving table. Optionally also to JDBC target.
    Uses MERGE for upserts based on key_columns.
    """
    serving_table = get_serving_table(config["target_table"])
    key_cols = config["key_columns"]

    if write_mode == "overwrite":
        df.write.mode("overwrite").saveAsTable(serving_table)
    else:
        # MERGE/upsert into serving table
        df.createOrReplaceTempView(f"_lakebase_batch_{config['target_table']}")
        merge_condition = " AND ".join([f"t.{k} = s.{k}" for k in key_cols])
        update_cols = [c for c in df.columns if c not in key_cols]
        update_set = ", ".join([f"t.{c} = s.{c}" for c in update_cols])
        insert_cols = ", ".join(df.columns)
        insert_vals = ", ".join([f"s.{c}" for c in df.columns])

        spark.sql(f"""
            MERGE INTO {serving_table} t
            USING _lakebase_batch_{config['target_table']} s
            ON {merge_condition}
            WHEN MATCHED THEN UPDATE SET {update_set}
            WHEN NOT MATCHED THEN INSERT ({insert_cols}) VALUES ({insert_vals})
        """)

    # Optional: also write to external JDBC target
    if JDBC_TARGET_ENABLED:
        try:
            (
                df.write
                .format("jdbc")
                .option("url", JDBC_URL)
                .option("dbtable", config["target_table"])
                .options(**JDBC_PROPERTIES)
                .mode("append")
                .save()
            )
        except Exception as jdbc_err:
            mon.log_warning(f"JDBC write failed for {config['target_table']}: {jdbc_err}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## CDC Streaming Sync (Change Data Feed)

# COMMAND ----------

def start_cdc_stream(config: dict) -> StreamingQuery:
    """
    Start a CDC streaming sync using Delta Change Data Feed.
    Captures INSERT, UPDATE, DELETE operations and materializes to serving table.
    """
    source = cfg.get_table_path(config["source_table"])
    checkpoint = get_checkpoint_path(cfg, f"lakebase_cdc_{config['source_table']}")

    # Ensure serving table exists
    ensure_serving_table(config["source_table"], config["target_table"])

    cdc_stream = (
        spark.readStream
        .format("delta")
        .option("readChangeFeed", "true")
        .option("startingVersion", "latest")
        .table(source)
    )

    def write_cdc_batch(batch_df, batch_id):
        """Apply CDC operations to Delta serving table."""
        if batch_df.count() == 0:
            return

        batch_start = time.time()

        # Separate by operation type
        inserts = batch_df.filter(F.col("_change_type") == "insert")
        updates = batch_df.filter(F.col("_change_type") == "update_postimage")
        deletes = batch_df.filter(F.col("_change_type") == "delete")

        # Drop CDC metadata columns
        cdc_cols = ["_change_type", "_commit_version", "_commit_timestamp"]
        clean_cols = [c for c in batch_df.columns if c not in cdc_cols]

        # Upsert (INSERT + UPDATE) via MERGE
        upserts = inserts.union(updates).select(clean_cols)
        if upserts.count() > 0:
            write_to_serving(upserts, config, write_mode="append")

        # Handle deletes via soft-delete flag or MERGE DELETE
        if deletes.count() > 0:
            serving_table = get_serving_table(config["target_table"])
            key_cols = config["key_columns"]
            delete_df = deletes.select(clean_cols).select(key_cols)
            delete_df.createOrReplaceTempView(f"_lakebase_deletes_{config['target_table']}")
            merge_cond = " AND ".join([f"t.{k} = d.{k}" for k in key_cols])
            spark.sql(f"""
                MERGE INTO {serving_table} t
                USING _lakebase_deletes_{config['target_table']} d
                ON {merge_cond}
                WHEN MATCHED THEN DELETE
            """)
            mon.log_event(f"lakebase_deletes_{config['target_table']}", {"count": deletes.count()})

        elapsed_ms = (time.time() - batch_start) * 1000
        mon.log_event(f"lakebase_cdc_batch_{config['target_table']}", {
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

    mon.log_info(f"CDC stream started: {config['source_table']} -> lakebase_{config['target_table']}")
    return query

# COMMAND ----------

# MAGIC %md
# MAGIC ## Incremental Sync (Watermark-Based)

# COMMAND ----------

def run_incremental_sync(config: dict) -> int:
    """
    Incremental sync based on watermark column.
    Reads only rows newer than last sync point, writes to serving table.
    """
    source = cfg.get_table_path(config["source_table"])
    watermark_col = config.get("watermark_column", "created_at")
    max_rows = config.get("max_rows_per_batch", 50000)

    ensure_serving_table(config["source_table"], config["target_table"])

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

    # Write to serving table
    write_to_serving(new_rows, config, write_mode="append")

    # Update watermark tracking
    new_watermark = new_rows.agg(F.max(watermark_col)).first()[0]
    tracking_data = [{
        "source_table": config["source_table"],
        "target_table": config["target_table"],
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
    """Full table overwrite to serving table (for reference data)."""
    source = cfg.get_table_path(config["source_table"])

    ensure_serving_table(config["source_table"], config["target_table"])

    source_df = spark.table(source)
    row_count = source_df.count()

    write_to_serving(source_df, config, write_mode="overwrite")

    # Optimize serving table with Z-ORDER for fast point lookups
    serving_table = get_serving_table(config["target_table"])
    z_cols = config.get("z_order_cols", config["key_columns"])
    z_order_expr = ", ".join(z_cols)
    try:
        spark.sql(f"OPTIMIZE {serving_table} ZORDER BY ({z_order_expr})")
    except Exception:
        pass  # Table may be too small to benefit from optimization

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
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
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
                except Exception as e:
                    mon.log_warning(f"Batch sync failed for {config['source_table']}: {e}")

    elif mode == "full_refresh":
        # Full refresh all tables with Z-ORDER optimization
        with mon.time("full_refresh_all"):
            for config in LAKEBASE_SYNC_CONFIG:
                try:
                    rows = run_full_sync(config)
                    total_rows_synced += rows
                except Exception as e:
                    mon.log_warning(f"Full refresh failed for {config['source_table']}: {e}")

    result.update({
        "mode": mode,
        "jdbc_target_enabled": JDBC_TARGET_ENABLED,
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
    for stream in active_streams:
        try:
            stream.stop()
        except Exception:
            pass
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
