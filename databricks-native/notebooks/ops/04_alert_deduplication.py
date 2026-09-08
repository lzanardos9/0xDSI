# Databricks notebook source
# MAGIC %md
# MAGIC # Ops 04: Alert Deduplication Engine
# MAGIC
# MAGIC Prevents duplicate alerts from accumulating across repeated notebook runs.
# MAGIC Uses MERGE with fingerprinting to ensure each unique alert signal appears only once.
# MAGIC
# MAGIC **Problem:** Multiple detection notebooks (correlation, behavioral, Glasswing, etc.)
# MAGIC run on overlapping time windows. Without deduplication, the same detection can
# MAGIC produce multiple alert rows.
# MAGIC
# MAGIC **Strategy:**
# MAGIC 1. Compute a fingerprint from (title_hash, source, severity, time_bucket)
# MAGIC 2. MERGE new alerts: only INSERT if no matching fingerprint in the last N hours
# MAGIC 3. Increment `duplicate_count` on existing matches
# MAGIC 4. Optionally consolidate: close stale duplicates
# MAGIC
# MAGIC **Scheduling:** Every 2 minutes (runs between detection cycles)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("dedup_window_hours", "4", "Window to check for duplicates")
dbutils.widgets.text("consolidate_stale", "true", "Auto-close stale duplicate alerts")

dedup_window_hours = int(dbutils.widgets.get("dedup_window_hours"))
consolidate_stale = dbutils.widgets.get("consolidate_stale").lower() == "true"

mon.log_event("config_loaded", {
    "dedup_window_hours": dedup_window_hours,
    "consolidate_stale": consolidate_stale,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid

# Immutable finding-lifecycle revisions (REV2-08). Marking a duplicate or a
# stale alert is a real lifecycle transition, so we also append a durable,
# append-only revision instead of only mutating status in place.
from finding_revision import (
    initial_revision, next_revision, SUPERSEDE, EXPIRE, REVISION_COLUMNS,
)

# Identity stamped onto every revision this run emits (REV2-05). A fresh
# execution_id per invocation keeps two dedup runs from collapsing.
_run_identity = {
    "execution_id": str(uuid.uuid4()),
    "run_id": cfg.tags.get("job_run_id", "interactive"),
    "producer": "ops_04_alert_deduplication",
}

# Explicit schema — prev_revision/action/supersedes are None on the first row, so
# inference would flip them to void and the append would fail.
_REVISION_SCHEMA = StructType([
    StructField("finding_id", StringType(), False),
    StructField("revision", IntegerType(), False),
    StructField("prev_revision", IntegerType(), True),
    StructField("state", StringType(), False),
    StructField("action", StringType(), True),
    StructField("supersedes_finding_id", StringType(), True),
    StructField("execution_id", StringType(), False),
    StructField("run_id", StringType(), True),
    StructField("producer", StringType(), False),
    StructField("schema_version", StringType(), True),
    StructField("produced_at", StringType(), True),
])


def _write_finding_revisions(revision_rows):
    """Append immutable finding revisions to the durable ledger. Ordered to the
    canonical column list so the row shape never drifts from the DDL."""
    if not revision_rows:
        return
    ordered = [{c: r.get(c) for c in REVISION_COLUMNS} for r in revision_rows]
    (
        spark.createDataFrame(ordered, schema=_REVISION_SCHEMA)
        .withColumn("produced_at", to_timestamp(col("produced_at")))
        .write.mode("append").option("mergeSchema", "true")
        .saveAsTable(get_table_path(cfg, "finding_revisions"))
    )


# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Fingerprint Column Exists

# COMMAND ----------

alerts_table = get_table_path(cfg, "alerts")

# Add fingerprint and duplicate_count columns if they don't exist
with mon.time("ensure_schema"):
    try:
        cols = [c.name for c in spark.table(alerts_table).schema.fields]
        if "fingerprint" not in cols:
            spark.sql(f"ALTER TABLE {alerts_table} ADD COLUMN fingerprint STRING")
        if "duplicate_count" not in cols:
            spark.sql(f"ALTER TABLE {alerts_table} ADD COLUMN duplicate_count INT DEFAULT 1")
    except Exception as e:
        mon.log_warning(f"Schema update failed: {str(e)[:200]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Fingerprints for Unprocessed Alerts

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(hours=dedup_window_hours)

with mon.time("compute_fingerprints"):
    # Find alerts without fingerprints (newly inserted by detection notebooks)
    unfingerprinted = spark.sql(f"""
        SELECT id, title, source, severity, created_at,
               COALESCE(source_ip, '') as src_ip,
               COALESCE(dest_ip, '') as dst_ip
        FROM {alerts_table}
        WHERE (fingerprint IS NULL OR fingerprint = '')
          AND created_at > '{cutoff.isoformat()}'
    """)

    unfp_count = unfingerprinted.count()

    if unfp_count > 0:
        # Fingerprint = md5(normalized_title + source + severity + time_bucket_10min)
        fingerprinted = (
            unfingerprinted
            .withColumn("_title_norm",
                lower(regexp_replace(col("title"), r"[^a-zA-Z0-9]", "")))
            .withColumn("_time_bucket",
                date_trunc("hour", col("created_at")))
            .withColumn("fingerprint",
                md5(concat_ws("|",
                    col("_title_norm"),
                    col("source"),
                    col("severity"),
                    col("src_ip"),
                    col("dst_ip"),
                    col("_time_bucket").cast("string"),
                )))
            .select("id", "fingerprint")
        )

        # Update fingerprints in-place
        fingerprinted.createOrReplaceTempView("_new_fingerprints")
        spark.sql(f"""
            MERGE INTO {alerts_table} t
            USING _new_fingerprints s
            ON t.id = s.id
            WHEN MATCHED THEN UPDATE SET t.fingerprint = s.fingerprint
        """)
        print(f"Computed fingerprints for {unfp_count} new alerts")
    else:
        print("No unfingerprinted alerts found")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify and Consolidate Duplicates

# COMMAND ----------

with mon.time("consolidate_duplicates"):
    # Find duplicate groups (same fingerprint, multiple rows)
    duplicates = spark.sql(f"""
        SELECT fingerprint,
               COUNT(*) as cnt,
               MIN(created_at) as first_seen,
               MAX(created_at) as last_seen,
               COLLECT_SET(id) as alert_ids
        FROM {alerts_table}
        WHERE fingerprint IS NOT NULL
          AND created_at > '{cutoff.isoformat()}'
          AND status NOT IN ('closed', 'resolved', 'duplicate')
        GROUP BY fingerprint
        HAVING COUNT(*) > 1
    """)

    dup_groups = duplicates.count()

    if dup_groups > 0:
        dup_data = duplicates.collect()
        total_consolidated = 0
        revision_rows = []

        for row in dup_data:
            alert_ids = row.alert_ids
            # Keep the first alert (earliest), mark rest as duplicates
            primary_id = None
            for aid in sorted(alert_ids):
                if primary_id is None:
                    primary_id = aid
                else:
                    # Mark as duplicate
                    spark.sql(f"""
                        UPDATE {alerts_table}
                        SET status = 'duplicate',
                            description = CONCAT(
                                COALESCE(description, ''),
                                ' [Duplicate of: {primary_id}]'
                            )
                        WHERE id = '{aid}'
                          AND status NOT IN ('closed', 'resolved', 'duplicate')
                    """)
                    total_consolidated += 1

                    # Record the lifecycle transition immutably: this finding was
                    # asserted (PROVISIONAL) and is now SUPERSEDED by the primary.
                    produced_at = datetime.utcnow().isoformat()
                    rev1 = initial_revision(aid, _run_identity, produced_at)
                    rev2 = next_revision(
                        rev1, SUPERSEDE, _run_identity, produced_at,
                        supersedes_finding_id=primary_id,
                    )
                    revision_rows.extend([rev1, rev2])

            # Update primary with duplicate count
            spark.sql(f"""
                UPDATE {alerts_table}
                SET duplicate_count = {len(alert_ids)}
                WHERE id = '{primary_id}'
            """)

        _write_finding_revisions(revision_rows)
        print(f"Consolidated {total_consolidated} duplicate alerts across {dup_groups} groups")
    else:
        total_consolidated = 0
        print("No duplicate groups found")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Stale Alert Cleanup (Optional)

# COMMAND ----------

stale_closed = 0
if consolidate_stale:
    with mon.time("close_stale"):
        # Capture the ids first so each expiry can be recorded as an immutable
        # revision, then close them in place for existing consumers.
        stale_ids = [
            r.id for r in spark.sql(f"""
                SELECT id FROM {alerts_table}
                WHERE status = 'new'
                  AND created_at < current_timestamp() - INTERVAL 24 HOURS
                  AND (updated_at IS NULL OR updated_at < current_timestamp() - INTERVAL 24 HOURS)
            """).collect()
        ]

        # Close alerts that have been 'new' for more than 24h with no activity
        spark.sql(f"""
            UPDATE {alerts_table}
            SET status = 'stale'
            WHERE status = 'new'
              AND created_at < current_timestamp() - INTERVAL 24 HOURS
              AND (updated_at IS NULL OR updated_at < current_timestamp() - INTERVAL 24 HOURS)
        """)

        stale_closed = len(stale_ids)
        if stale_closed > 0:
            expiry_rows = []
            for sid in stale_ids:
                produced_at = datetime.utcnow().isoformat()
                rev1 = initial_revision(sid, _run_identity, produced_at)
                rev2 = next_revision(rev1, EXPIRE, _run_identity, produced_at)
                expiry_rows.extend([rev1, rev2])
            _write_finding_revisions(expiry_rows)
            print(f"Marked {stale_closed} stale alerts (untouched >24h)")

# COMMAND ----------

result = {
    "notebook": "04_alert_deduplication",
    "status": "completed",
    "unfingerprinted_processed": unfp_count,
    "duplicate_groups": dup_groups,
    "alerts_consolidated": total_consolidated,
    "stale_closed": stale_closed,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
