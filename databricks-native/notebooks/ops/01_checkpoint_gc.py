# Databricks notebook source
# MAGIC %md
# MAGIC # Ops 01: Streaming Checkpoint Garbage Collection
# MAGIC
# MAGIC Cleans up stale Spark Structured Streaming checkpoint files to reclaim storage.
# MAGIC
# MAGIC - Lists all streaming queries registered in the `streaming_queries` table
# MAGIC - For each query, inspects the checkpoint location
# MAGIC - Removes checkpoint files older than the configurable retention period
# MAGIC - Reports checkpoint sizes and space recovered
# MAGIC - Supports dry-run mode for safe preview

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
from datetime import datetime, timezone, timedelta
from pyspark.sql.functions import col, lit, current_timestamp, expr
from pyspark.sql.types import StructType, StructField, StringType, LongType, TimestampType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("retention_days", "7", "Checkpoint retention in days")
dbutils.widgets.text("dry_run", "false", "Dry run mode (true/false)")

retention_days = int(dbutils.widgets.get("retention_days"))
dry_run = dbutils.widgets.get("dry_run").lower() == "true"

mon.log_info(f"Checkpoint GC started: retention={retention_days}d, dry_run={dry_run}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

try:
    # ---- Load streaming query registry ----
    STREAMING_QUERIES_TABLE = cfg.get_table_path("streaming_queries")
    GC_LOG_TABLE = cfg.get_table_path("checkpoint_gc_log")

    with mon.time("fetch_streaming_queries"):
        queries_df = spark.sql(f"""
            SELECT query_name, checkpoint_location, is_active
            FROM {STREAMING_QUERIES_TABLE}
            WHERE checkpoint_location IS NOT NULL
        """)
        queries = queries_df.collect()
        mon.log_metric("registered_queries", len(queries))

    print(f"Found {len(queries)} registered streaming queries")

    # ---- Calculate cutoff timestamp ----
    cutoff_time = datetime.now(timezone.utc) - timedelta(days=retention_days)
    cutoff_ms = int(cutoff_time.timestamp() * 1000)

    # ---- Process each checkpoint location ----
    gc_results = []
    total_files_removed = 0
    total_bytes_recovered = 0
    total_files_scanned = 0

    with mon.time("scan_checkpoints"):
        for query_row in queries:
            query_name = query_row.query_name
            checkpoint_path = query_row.checkpoint_location

            query_files_removed = 0
            query_bytes_recovered = 0
            query_files_scanned = 0

            try:
                # List all files recursively in the checkpoint directory
                dirs_to_scan = [checkpoint_path]
                files_to_remove = []

                while dirs_to_scan:
                    current_dir = dirs_to_scan.pop()
                    try:
                        entries = dbutils.fs.ls(current_dir)
                    except Exception:
                        # Directory may not exist or be inaccessible
                        continue

                    for entry in entries:
                        if entry.isDir():
                            dirs_to_scan.append(entry.path)
                        else:
                            query_files_scanned += 1
                            # Check file modification time against retention
                            if entry.modificationTime and entry.modificationTime < cutoff_ms:
                                files_to_remove.append(entry)
                                query_bytes_recovered += entry.size

                # Remove stale files (or report in dry-run)
                if not dry_run:
                    for file_entry in files_to_remove:
                        dbutils.fs.rm(file_entry.path, recurse=False)
                        query_files_removed += 1
                else:
                    query_files_removed = len(files_to_remove)

                total_files_removed += query_files_removed
                total_bytes_recovered += query_bytes_recovered
                total_files_scanned += query_files_scanned

                gc_results.append({
                    "query_name": query_name,
                    "checkpoint_location": checkpoint_path,
                    "files_scanned": query_files_scanned,
                    "files_removed": query_files_removed,
                    "bytes_recovered": query_bytes_recovered,
                    "status": "dry_run" if dry_run else "cleaned",
                })

            except Exception as scan_err:
                gc_results.append({
                    "query_name": query_name,
                    "checkpoint_location": checkpoint_path,
                    "files_scanned": query_files_scanned,
                    "files_removed": 0,
                    "bytes_recovered": 0,
                    "status": f"error: {str(scan_err)[:200]}",
                })
                mon.log_warning(
                    f"Error scanning checkpoint for {query_name}: {scan_err}",
                    details=checkpoint_path,
                )

    # ---- Log GC results to Delta ----
    with mon.time("persist_gc_log"):
        if gc_results:
            gc_schema = StructType([
                StructField("query_name", StringType()),
                StructField("checkpoint_location", StringType()),
                StructField("files_scanned", LongType()),
                StructField("files_removed", LongType()),
                StructField("bytes_recovered", LongType()),
                StructField("status", StringType()),
            ])

            gc_df = (
                spark.createDataFrame(gc_results, schema=gc_schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("retention_days", lit(retention_days))
                .withColumn("dry_run", lit(dry_run))
                .withColumn("executed_at", current_timestamp())
            )
            gc_df.write.mode("append").saveAsTable(GC_LOG_TABLE)

    # ---- Report summary ----
    bytes_recovered_mb = total_bytes_recovered / (1024 * 1024)

    mon.log_metric("total_files_scanned", total_files_scanned)
    mon.log_metric("total_files_removed", total_files_removed)
    mon.log_metric("bytes_recovered_mb", round(bytes_recovered_mb, 2))
    mon.log_complete(rows_processed=total_files_removed)

    result = {
        "status": "success",
        "mode": "dry_run" if dry_run else "executed",
        "queries_processed": len(queries),
        "total_files_scanned": total_files_scanned,
        "total_files_removed": total_files_removed,
        "bytes_recovered_mb": round(bytes_recovered_mb, 2),
        "retention_days": retention_days,
    }

    print(f"Checkpoint GC complete: {total_files_removed} files, "
          f"{bytes_recovered_mb:.2f} MB recovered ({'DRY RUN' if dry_run else 'EXECUTED'})")

except Exception as e:
    mon.log_error(e, context="checkpoint_gc")
    result = {
        "status": "error",
        "error": str(e),
        "error_type": type(e).__name__,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Exit

# COMMAND ----------

dbutils.notebook.exit(json.dumps(result))
