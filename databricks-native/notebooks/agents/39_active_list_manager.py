# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 39 - Active List Manager
# MAGIC
# MAGIC Production active list management backed by Delta Lake (Lakebase layer):
# MAGIC - **Streaming ingestion** from threat intel feeds to update blocklists
# MAGIC - **Auto-expiration** of stale IOC entries based on freshness
# MAGIC - **Size management** enforcing max_size per list via eviction policy (LRU)
# MAGIC - **Cross-reference** with correlation engine for real-time enrichment
# MAGIC - **Delta CDC** enabled for downstream Lakebase sync to Postgres
# MAGIC
# MAGIC Active list types: blocklist, allowlist, watchlist
# MAGIC Categories: ip, domain, user, hash, url, email
# MAGIC
# MAGIC Outputs: active_lists (updated), active_list_audit_log

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("active_list_manager")

# COMMAND ----------

import json
import uuid
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from pyspark.sql.types import (
    StructType, StructField, StringType, IntegerType, DoubleType,
    TimestampType, BooleanType, ArrayType, MapType,
)

# COMMAND ----------

dbutils.widgets.text("mode", "streaming", "Execution mode: streaming | batch")
dbutils.widgets.text("ioc_freshness_days", "90", "Max IOC age before eviction (days)")
dbutils.widgets.text("auto_block_confidence", "0.85", "Min confidence to auto-add to blocklist")

mode = dbutils.widgets.get("mode")
ioc_freshness_days = int(dbutils.widgets.get("ioc_freshness_days"))
auto_block_confidence = float(dbutils.widgets.get("auto_block_confidence"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Delta Tables

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('active_list_entries')} (
    id STRING,
    list_id STRING NOT NULL,
    entry_type STRING,
    value STRING NOT NULL,
    confidence DOUBLE DEFAULT 0.5,
    source STRING,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    last_seen TIMESTAMP DEFAULT current_timestamp(),
    hit_count INT DEFAULT 0,
    metadata MAP<STRING, STRING>,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true')
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {cfg.get_table_path('active_list_audit_log')} (
    id STRING,
    list_id STRING,
    action STRING,
    entry_value STRING,
    reason STRING,
    performed_by STRING,
    performed_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

try:
    result = {"notebook": "39_active_list_manager", "status": "success", "started_at": datetime.utcnow().isoformat()}
    active_lists_table = cfg.get_table_path("active_lists")
    entries_table = cfg.get_table_path("active_list_entries")
    audit_table = cfg.get_table_path("active_list_audit_log")

    # --- Load current active lists ---
    with mon.time("load_active_lists"):
        lists_df = spark.table(active_lists_table)
        list_count = lists_df.count()
        mon.log_metric("active_lists_loaded", list_count)

    # --- Ingest from Threat Feeds (IOC entries) ---
    if mode == "streaming":
        with mon.time("stream_threat_feeds"):
            # Stream from IOC/threat feed Delta tables
            ioc_stream = (
                spark.readStream
                .format("delta")
                .option("readChangeFeed", "true")
                .option("startingVersion", "latest")
                .table(cfg.get_table_path("ioc_entries"))
            )

            def process_ioc_batch(batch_df, batch_id):
                """Ingest new IOCs into appropriate active lists."""
                if batch_df.count() == 0:
                    return

                # Only process new inserts/updates
                new_iocs = batch_df.filter(F.col("_change_type").isin("insert", "update_postimage"))
                if new_iocs.count() == 0:
                    return

                # Auto-add high-confidence IOCs to blocklists
                high_conf = new_iocs.filter(F.col("confidence") >= auto_block_confidence)

                if high_conf.count() > 0:
                    # Map IOC types to list IDs
                    new_entries = (
                        high_conf
                        .withColumn("id", F.expr("uuid()"))
                        .withColumn("list_id",
                            F.when(F.col("type") == "ip", "malicious_ips")
                            .when(F.col("type") == "domain", "malicious_domains")
                            .when(F.col("type").contains("hash"), "malware_hashes")
                            .when(F.col("type") == "url", "malicious_urls")
                            .otherwise("general_blocklist"))
                        .withColumn("entry_type", F.col("type"))
                        .withColumn("first_seen", F.coalesce(F.col("first_seen"), F.current_timestamp()))
                        .withColumn("last_seen", F.coalesce(F.col("last_seen"), F.current_timestamp()))
                        .withColumn("hit_count", F.lit(0))
                        .withColumn("metadata", F.map(
                            F.lit("source"), F.coalesce(F.col("source_feed"), F.lit("unknown")),
                            F.lit("threat_type"), F.coalesce(F.col("threat_type"), F.lit("unknown")),
                        ))
                        .withColumn("expires_at",
                            F.from_unixtime(
                                F.unix_timestamp(F.current_timestamp()) + ioc_freshness_days * 86400
                            ))
                        .withColumn("is_active", F.lit(True))
                        .select("id", "list_id", "entry_type", "value", "confidence",
                                F.col("source_feed").alias("source"),
                                "first_seen", "last_seen", "hit_count", "metadata",
                                "expires_at", "is_active")
                    )

                    # Deduplicate: only add if not already present
                    existing = spark.table(entries_table).select("value", "list_id")
                    truly_new = (
                        new_entries.alias("n")
                        .join(
                            existing.alias("e"),
                            (F.col("n.value") == F.col("e.value")) & (F.col("n.list_id") == F.col("e.list_id")),
                            "left_anti",
                        )
                    )

                    added_count = truly_new.count()
                    if added_count > 0:
                        safe_append(truly_new, "active_list_entries", catalog=cfg.catalog, schema=cfg.schema)

                        # Audit log
                        audit_entries = (
                            truly_new
                            .select(
                                F.expr("uuid()").alias("id"),
                                F.col("list_id"),
                                F.lit("auto_add").alias("action"),
                                F.col("value").alias("entry_value"),
                                F.concat(F.lit("Auto-added: confidence="), F.col("confidence").cast("string")).alias("reason"),
                                F.lit("active_list_agent").alias("performed_by"),
                                F.current_timestamp().alias("performed_at"),
                            )
                        )
                        safe_append(audit_entries, "active_list_audit_log", catalog=cfg.catalog, schema=cfg.schema)

                    mon.log_event("ioc_batch_ingested", {
                        "batch_id": batch_id,
                        "high_conf_iocs": high_conf.count(),
                        "truly_new_added": added_count,
                    })

            ioc_query = (
                ioc_stream
                .writeStream
                .foreachBatch(process_ioc_batch)
                .option("checkpointLocation", get_checkpoint_path(cfg, "active_list_ioc_ingest"))
                .trigger(processingTime="30 seconds")
                .queryName("active_list_ioc_ingest")
                .start()
            )

    else:
        # Batch mode: pull from IOC table directly
        with mon.time("batch_ioc_ingest"):
            recent_iocs = spark.sql(f"""
                SELECT type, value, confidence, source_feed, threat_type,
                       first_seen, last_seen
                FROM {cfg.get_table_path("ioc_entries")}
                WHERE confidence >= {auto_block_confidence}
                  AND active = true
                  AND last_seen > current_timestamp() - INTERVAL {ioc_freshness_days} DAYS
            """)

            ioc_count = recent_iocs.count()
            mon.log_metric("batch_iocs_eligible", ioc_count)

            if ioc_count > 0:
                new_entries = (
                    recent_iocs
                    .withColumn("id", F.expr("uuid()"))
                    .withColumn("list_id",
                        F.when(F.col("type") == "ip", "malicious_ips")
                        .when(F.col("type") == "domain", "malicious_domains")
                        .when(F.col("type").contains("hash"), "malware_hashes")
                        .otherwise("general_blocklist"))
                    .withColumn("entry_type", F.col("type"))
                    .withColumn("hit_count", F.lit(0))
                    .withColumn("metadata", F.map(
                        F.lit("source"), F.coalesce(F.col("source_feed"), F.lit("unknown")),
                        F.lit("threat_type"), F.coalesce(F.col("threat_type"), F.lit("unknown")),
                    ))
                    .withColumn("expires_at",
                        F.from_unixtime(F.unix_timestamp(F.current_timestamp()) + ioc_freshness_days * 86400))
                    .withColumn("is_active", F.lit(True))
                    .withColumn("source", F.col("source_feed"))
                    .select("id", "list_id", "entry_type", "value", "confidence",
                            "source", "first_seen", "last_seen", "hit_count",
                            "metadata", "expires_at", "is_active")
                )

                # Dedup
                existing = spark.table(entries_table).select("value", "list_id")
                truly_new = new_entries.join(existing, ["value", "list_id"], "left_anti")
                added = truly_new.count()

                if added > 0:
                    safe_append(truly_new, "active_list_entries", catalog=cfg.catalog, schema=cfg.schema)
                mon.log_metric("batch_entries_added", added)

    # --- Expiration: Remove stale entries ---
    with mon.time("expire_stale_entries"):
        expired_count_result = spark.sql(f"""
            SELECT count(*) as cnt FROM {entries_table}
            WHERE is_active = true AND expires_at < current_timestamp()
        """).first()
        expired_count = expired_count_result.cnt if expired_count_result else 0

        if expired_count > 0:
            spark.sql(f"""
                UPDATE {entries_table}
                SET is_active = false
                WHERE is_active = true AND expires_at < current_timestamp()
            """)
            mon.log_metric("entries_expired", expired_count)

    # --- Size Enforcement: Evict LRU entries if list exceeds max_size ---
    with mon.time("enforce_max_size"):
        list_sizes = spark.sql(f"""
            SELECT e.list_id, count(*) as entry_count, l.max_size
            FROM {entries_table} e
            JOIN {active_lists_table} l ON e.list_id = l.id
            WHERE e.is_active = true
            GROUP BY e.list_id, l.max_size
            HAVING count(*) > l.max_size
        """)

        oversized_lists = list_sizes.collect()
        evicted_total = 0

        for row in oversized_lists:
            excess = row.entry_count - row.max_size
            # Evict oldest entries by last_seen (LRU)
            evict_ids = spark.sql(f"""
                SELECT id FROM {entries_table}
                WHERE list_id = '{row.list_id}' AND is_active = true
                ORDER BY last_seen ASC
                LIMIT {excess}
            """).collect()

            if evict_ids:
                ids_list = [r.id for r in evict_ids]
                ids_str = "','".join(ids_list)
                spark.sql(f"""
                    UPDATE {entries_table}
                    SET is_active = false
                    WHERE id IN ('{ids_str}')
                """)
                evicted_total += len(ids_list)

        if evicted_total > 0:
            mon.log_metric("entries_evicted_lru", evicted_total)

    # --- Update Summary in active_lists table (entry counts, last_update) ---
    with mon.time("update_list_summaries"):
        summary = spark.sql(f"""
            SELECT
                list_id as id,
                count(*) as active_entry_count,
                max(last_seen) as last_entry_update
            FROM {entries_table}
            WHERE is_active = true
            GROUP BY list_id
        """)

        if summary.count() > 0:
            summary.createOrReplaceTempView("list_summary")
            spark.sql(f"""
                MERGE INTO {active_lists_table} t
                USING list_summary s
                ON t.id = s.id
                WHEN MATCHED THEN UPDATE SET
                    t.updated_at = current_timestamp()
            """)

    # --- Correlation: Match active list entries against recent events ---
    with mon.time("active_list_correlation"):
        # Check if recent events hit any blocklist entries
        blocklist_ips = spark.sql(f"""
            SELECT value FROM {entries_table}
            WHERE list_id = 'malicious_ips' AND is_active = true
        """)

        if blocklist_ips.count() > 0:
            recent_hits = (
                spark.table(cfg.get_table_path("silver_events"))
                .filter(F.col("timestamp") > F.expr("current_timestamp() - INTERVAL 15 MINUTES"))
                .join(blocklist_ips, F.col("source_ip") == F.col("value"), "inner")
            )

            hit_count = recent_hits.count()
            if hit_count > 0:
                # Increment hit_count for matched entries
                hit_values = recent_hits.select("value").distinct()
                hit_values.createOrReplaceTempView("hit_values")
                spark.sql(f"""
                    MERGE INTO {entries_table} t
                    USING hit_values h
                    ON t.value = h.value AND t.is_active = true
                    WHEN MATCHED THEN UPDATE SET
                        t.hit_count = t.hit_count + 1,
                        t.last_seen = current_timestamp()
                """)
                mon.log_metric("blocklist_hits", hit_count)

    # --- Await streaming if applicable ---
    if mode == "streaming":
        ioc_query.awaitTermination(timeout=600)

    result.update({
        "mode": mode,
        "lists_managed": list_count,
        "entries_expired": expired_count,
        "entries_evicted": evicted_total,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete()

except Exception as e:
    result = {
        "notebook": "39_active_list_manager",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="active_list_manager")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
