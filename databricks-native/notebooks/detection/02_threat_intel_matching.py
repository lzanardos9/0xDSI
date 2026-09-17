# Databricks notebook source
# MAGIC %md
# MAGIC # Threat Intelligence Matching Engine
# MAGIC
# MAGIC Streaming IOC matching against incoming events with:
# MAGIC - IP, domain, and hash-based matching
# MAGIC - Confidence decay for aged IOCs
# MAGIC - Deduplication to prevent alert fatigue
# MAGIC - Broadcast join for performance (IOC table is small relative to events)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("checkpoint_path", "", "Checkpoint override (optional)")
dbutils.widgets.text("min_confidence", "0.5", "Minimum IOC confidence to match")
dbutils.widgets.text("dedup_window_hours", "4", "Suppress duplicate matches for N hours")
dbutils.widgets.text("trigger_mode", "availableNow", "Stream trigger: availableNow | once | <interval e.g. 30 seconds>")

checkpoint_base = dbutils.widgets.get("checkpoint_path") or cfg.get_checkpoint_path("threat_intel_matching")
min_confidence = float(dbutils.widgets.get("min_confidence"))
dedup_hours = int(dbutils.widgets.get("dedup_window_hours"))

require_tables("events", "ioc_entries", "alerts")

mon.log_event("config_loaded", {
    "min_confidence": min_confidence,
    "dedup_hours": dedup_hours,
    "checkpoint_base": checkpoint_base,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from pyspark.sql import Window


def _resolve_trigger():
    """Serverless compute only accepts availableNow / once; a fixed processingTime
    interval is CLASSIC-compute only. Default to availableNow so the job is
    serverless-safe out of the box."""
    raw = dbutils.widgets.get("trigger_mode").strip()
    low = raw.lower()
    if low in ("", "availablenow", "available_now"):
        return {"availableNow": True}
    if low == "once":
        return {"once": True}
    return {"processingTime": raw}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Active IOCs with Confidence Decay

# COMMAND ----------

ioc_table = cfg.get_table_path("ioc_entries")

with mon.time("ioc_load"):
    active_iocs = (
        spark.table(ioc_table)
        .filter(
            (col("expiry").isNull()) | (col("expiry") > current_timestamp())
        )
        # Confidence decay: older IOCs get lower effective confidence
        .withColumn("age_days",
            datediff(current_date(), to_date(coalesce(col("last_seen"), col("first_seen"))))
        )
        .withColumn("decay_factor",
            when(col("age_days") < 7, lit(1.0))
            .when(col("age_days") < 30, lit(0.9))
            .when(col("age_days") < 90, lit(0.7))
            .when(col("age_days") < 180, lit(0.5))
            .otherwise(lit(0.3))
        )
        .withColumn("effective_confidence",
            col("confidence") * col("decay_factor")
        )
        .filter(col("effective_confidence") >= min_confidence)
    )

    ip_iocs = (
        active_iocs
        .filter(col("indicator_type") == "ip")
        .select(
            col("value").alias("ioc_value"),
            col("threat_type"),
            col("effective_confidence").alias("confidence"),
            col("source").alias("ioc_source"),
        )
    )

    domain_iocs = (
        active_iocs
        .filter(col("indicator_type") == "domain")
        .select(
            col("value").alias("ioc_value"),
            col("threat_type"),
            col("effective_confidence").alias("confidence"),
            col("source").alias("ioc_source"),
        )
    )

    hash_iocs = (
        active_iocs
        .filter(col("indicator_type").isin("sha256", "md5", "sha1"))
        .select(
            col("value").alias("ioc_value"),
            col("indicator_type").alias("hash_type"),
            col("threat_type"),
            col("effective_confidence").alias("confidence"),
            col("source").alias("ioc_source"),
        )
    )

    ip_count = ip_iocs.count()
    domain_count = domain_iocs.count()
    hash_count = hash_iocs.count()

    mon.log_event("iocs_loaded", {
        "ip": ip_count,
        "domain": domain_count,
        "hash": hash_count,
        "total": ip_count + domain_count + hash_count,
    })
    print(f"Active IOCs: IPs={ip_count}, Domains={domain_count}, Hashes={hash_count}")

    # Broadcast for streaming joins
    ip_iocs_bc = broadcast(ip_iocs)
    domain_iocs_bc = broadcast(domain_iocs)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream from ZeroBus (Sub-Second Latency)

# COMMAND ----------

events_stream, sdp_source = create_sdp_stream_with_fallback(
    spark, secrets_mgr, cfg,
    consumer_group="0xdsi-sdp-threat-intel",
    watermark="10 minutes",
    max_offsets_per_trigger=100000,
)

mon.log_event("sdp_stream_connected", {"source": sdp_source, "consumer_group": "0xdsi-sdp-threat-intel"})

# COMMAND ----------

# MAGIC %md
# MAGIC ## IOC Matching: Source IP

# COMMAND ----------

source_ip_matches = (
    events_stream
    .join(ip_iocs_bc, events_stream.source_ip == ip_iocs_bc.ioc_value, "inner")
    .withColumn("match_type", lit("source_ip"))
    .withColumn("matched_indicator", col("source_ip"))
    .select(
        col("id").alias("event_id"),
        "match_type", "matched_indicator", "threat_type",
        "confidence", "ioc_source",
        "source_ip", "dest_ip", "user_id", "event_type", "timestamp",
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## IOC Matching: Destination IP

# COMMAND ----------

dest_ip_matches = (
    events_stream
    .join(ip_iocs_bc, events_stream.dest_ip == ip_iocs_bc.ioc_value, "inner")
    .withColumn("match_type", lit("dest_ip"))
    .withColumn("matched_indicator", col("dest_ip"))
    .select(
        col("id").alias("event_id"),
        "match_type", "matched_indicator", "threat_type",
        "confidence", "ioc_source",
        "source_ip", "dest_ip", "user_id", "event_type", "timestamp",
    )
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Union All Matches

# COMMAND ----------

all_matches = source_ip_matches.unionByName(dest_ip_matches)

# COMMAND ----------

# MAGIC %md
# MAGIC ## IOC Matching: Domain (DNS queries, URL hostnames)

# COMMAND ----------

domain_matches = (
    events_stream
    .filter(col("event_type").isin("dns_query", "http_request", "proxy_log", "url_access"))
    .withColumn("extracted_domain",
        coalesce(
            col("dest_domain"),
            col("hostname"),
            regexp_extract(col("url"), r"https?://([^/:]+)", 1),
        )
    )
    .filter(col("extracted_domain").isNotNull() & (col("extracted_domain") != ""))
    .join(domain_iocs_bc, col("extracted_domain") == domain_iocs_bc.ioc_value, "inner")
    .withColumn("match_type", lit("domain"))
    .withColumn("matched_indicator", col("extracted_domain"))
    .select(
        col("id").alias("event_id"),
        "match_type", "matched_indicator", "threat_type",
        "confidence", "ioc_source",
        "source_ip", "dest_ip", "user_id", "event_type", "timestamp",
    )
)

all_matches = all_matches.unionByName(domain_matches)

# COMMAND ----------

# MAGIC %md
# MAGIC ## IOC Matching: File Hashes (process creation, file events)

# COMMAND ----------

hash_iocs_bc = broadcast(hash_iocs.drop("hash_type"))

hash_matches = (
    events_stream
    .filter(col("event_type").isin("process_start", "file_create", "file_modify", "download"))
    .withColumn("extracted_hash",
        coalesce(col("file_hash"), col("process_hash"), col("sha256"))
    )
    .filter(col("extracted_hash").isNotNull() & (col("extracted_hash") != ""))
    .join(hash_iocs_bc, col("extracted_hash") == hash_iocs_bc.ioc_value, "inner")
    .withColumn("match_type", lit("file_hash"))
    .withColumn("matched_indicator", col("extracted_hash"))
    .select(
        col("id").alias("event_id"),
        "match_type", "matched_indicator", "threat_type",
        "confidence", "ioc_source",
        "source_ip", "dest_ip", "user_id", "event_type", "timestamp",
    )
)

all_matches = all_matches.unionByName(hash_matches)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Threat Intel Alerts (Deduplicated)

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")
ti_matches_table = cfg.get_table_path("threat_intel_matches")

# The match table doubles as the durable alert obligation: `id` is a DETERMINISTIC
# finding id (indicator + type + entity + dedup window), and `alert_emitted` marks
# whether its alert has been written. A crash after a match is stored but before
# its alert is written leaves alert_emitted = false, so the next batch rediscovers
# it and completes the alert (recoverable — see _shared/ti_recovery.py).
spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {ti_matches_table} (
        id STRING,
        event_id STRING,
        match_type STRING,
        matched_indicator STRING,
        entity_key STRING,
        threat_type STRING,
        confidence DOUBLE,
        ioc_source STRING,
        source_ip STRING,
        user_id STRING,
        event_type STRING,
        matched_at TIMESTAMP,
        alert_id STRING,
        alert_emitted BOOLEAN
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Idempotent, additive upgrade for tables created by an earlier version (no data
# loss: only adds missing columns).
_existing_cols = {f.name for f in spark.table(ti_matches_table).schema.fields}
for _cname, _ctype in (("entity_key", "STRING"), ("alert_id", "STRING"),
                       ("alert_emitted", "BOOLEAN")):
    if _cname not in _existing_cols:
        spark.sql(f"ALTER TABLE {ti_matches_table} ADD COLUMNS ({_cname} {_ctype})")

# Seconds in one dedup window; the finding id carries a window bucket so the SAME
# entity+IOC re-alerts in a later window but stays a single finding within one.
_dedup_window_seconds = dedup_hours * 3600


def write_ti_alerts(batch_df, batch_id):
    """Persist threat-intel findings and settle their alert obligation.

    Ordering mirrors _shared/ti_recovery.MatchAlertReconciler: (1) MERGE findings
    (idempotent on the deterministic id), (2) read findings that still owe an
    alert (the durable obligation — a query, so it survives a restart), (3) MERGE
    those alerts (idempotent on the deterministic alert id), (4) mark them last.
    Any partial failure retries safely to exactly one alert per finding."""
    if batch_df.isEmpty():
        return

    with mon.time("ti_match_batch"):
        # Affected entity: the internal host/user this IOC was observed on. For a
        # bad source_ip the entity IS that ip; for a host reaching a bad dest_ip /
        # domain / hash it is the internal source_ip (falling back to user_id).
        batch_keyed = batch_df.withColumn(
            "entity_key", coalesce(col("source_ip"), col("user_id"), lit("unknown"))
        )

        # Collapse within-batch repeats to ONE row per (indicator, entity,
        # match_type) so many events from the same host on the same IOC produce a
        # single finding — but two different hosts still produce two findings.
        dedup_window = Window.partitionBy(
            "matched_indicator", "entity_key", "match_type"
        ).orderBy(col("timestamp").asc())
        batch_dedup = (
            batch_keyed
            .withColumn("_rn", row_number().over(dedup_window))
            .filter(col("_rn") == 1)
            .drop("_rn")
        )

        # Deterministic finding id: indicator + type + entity + fixed dedup window
        # bucket. Cross-batch dedup falls out of the MERGE below — the same finding
        # in the same window can never insert twice — with no presence-based
        # left-anti that could hide an un-alerted survivor of a crash.
        _bucket = floor(unix_timestamp(current_timestamp()) / lit(_dedup_window_seconds))
        prepared = (
            batch_dedup
            .withColumn("id", sha2(concat_ws("||",
                col("matched_indicator"), col("match_type"),
                col("entity_key"), _bucket.cast("string")), 256))
            .withColumn("matched_at", current_timestamp())
            .withColumn("alert_id", lit(None).cast("string"))
            .withColumn("alert_emitted", lit(False))
            .select("id", "event_id", "match_type", "matched_indicator",
                    "entity_key", "threat_type", "confidence", "ioc_source",
                    "source_ip", "user_id", "event_type", "matched_at",
                    "alert_id", "alert_emitted")
        )

        # Step 1 — MERGE findings first (idempotent on id). WHEN NOT MATCHED only,
        # so an already-emitted finding keeps alert_emitted = true.
        prepared.createOrReplaceTempView("_ti_prepared_batch")
        spark.sql(f"""
            MERGE INTO {ti_matches_table} t
            USING _ti_prepared_batch s ON t.id = s.id
            WHEN NOT MATCHED THEN INSERT *
        """)

        # Step 2 — the durable obligation: findings that still owe an alert. Read
        # from the table (not the batch) so a survivor of an earlier crashed batch
        # is picked up here.
        pending = spark.sql(f"""
            SELECT * FROM {ti_matches_table}
            WHERE (alert_emitted IS NULL OR alert_emitted = false)
              AND matched_at > current_timestamp() - INTERVAL {dedup_hours} HOURS
        """)
        if pending.isEmpty():
            return

        # Step 3 — MERGE alerts (idempotent on the deterministic alert id).
        alerts = (
            pending
            .withColumn("alert_pk", sha2(concat(lit("alert||"), col("id")), 256))
            .withColumn("title", concat(
                lit("Threat Intel: "), col("threat_type"),
                lit(" ("), col("matched_indicator"), lit(")")
            ))
            .withColumn("description", concat(
                lit("IOC matched on "), col("match_type"),
                lit(" for entity "), col("entity_key"),
                lit(". Event: "), col("event_type"),
                lit(". Source: "), coalesce(col("ioc_source"), lit("unknown")),
                lit(". Confidence: "), format_number(col("confidence"), 2)
            ))
            .withColumn("severity",
                when(col("confidence") >= 0.9, lit("critical"))
                .when(col("confidence") >= 0.7, lit("high"))
                .otherwise(lit("medium"))
            )
            .withColumn("status", lit("new"))
            .withColumn("source", lit("threat_intel_matching"))
            .withColumn("confidence_score", col("confidence"))
            .withColumn("created_at", current_timestamp())
            .select(col("alert_pk").alias("id"), "title", "description", "severity",
                    "status", "source", "confidence_score", "created_at")
        )
        alerts.createOrReplaceTempView("_ti_alerts_batch")
        spark.sql(f"""
            MERGE INTO {alerts_table} t
            USING _ti_alerts_batch s ON t.id = s.id
            WHEN NOT MATCHED THEN INSERT *
        """)

        # Step 4 — mark the obligation settled LAST (after the alert is durable).
        spark.sql(f"""
            MERGE INTO {ti_matches_table} t
            USING (SELECT id, sha2(concat('alert||', id), 256) AS alert_id
                   FROM {ti_matches_table}
                   WHERE (alert_emitted IS NULL OR alert_emitted = false)
                     AND matched_at > current_timestamp() - INTERVAL {dedup_hours} HOURS) s
            ON t.id = s.id
            WHEN MATCHED THEN UPDATE SET t.alert_emitted = true, t.alert_id = s.alert_id
        """)

        emitted = pending.count()
        mon.log_detection("threat_intel_match", {
            "batch_id": batch_id,
            "matches": emitted,
        })
        print(f"TI batch {batch_id}: {emitted} IOC findings alerted")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Query

# COMMAND ----------

try:
    ti_query = (
        all_matches.writeStream
        .foreachBatch(write_ti_alerts)
        .option("checkpointLocation", f"{checkpoint_base}/ti_match")
        .queryName("threat_intel_matching")
        .trigger(**_resolve_trigger())
        .start()
    )

    mon.log_complete(details={
        "ip_iocs": ip_count,
        "domain_iocs": domain_count,
        "hash_iocs": hash_count,
        "min_confidence": min_confidence,
        "dedup_hours": dedup_hours,
    })

    print("Threat intelligence matching engine running")
    print(f"  Matching: source_ip, dest_ip against {ip_count} IP IOCs")
    print(f"  Min confidence: {min_confidence}, Dedup window: {dedup_hours}h")

    spark.streams.awaitAnyTermination()

except Exception as e:
    mon.log_error(e, {"phase": "ti_streaming"})
    raise
finally:
    for q in spark.streams.active:
        if q.name == "threat_intel_matching":
            q.stop()
