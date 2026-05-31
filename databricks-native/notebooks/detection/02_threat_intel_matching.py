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

# Ensure matches table exists for dedup
spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {ti_matches_table} (
        id STRING,
        event_id STRING,
        match_type STRING,
        matched_indicator STRING,
        threat_type STRING,
        confidence DOUBLE,
        ioc_source STRING,
        source_ip STRING,
        user_id STRING,
        event_type STRING,
        matched_at TIMESTAMP
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")


def write_ti_alerts(batch_df, batch_id):
    """Write threat intel matches with deduplication."""
    if batch_df.isEmpty():
        return

    with mon.time("ti_match_batch"):
        # Dedup: skip indicators already alerted in dedup window
        recent_matches = spark.sql(f"""
            SELECT DISTINCT matched_indicator
            FROM {ti_matches_table}
            WHERE matched_at > current_timestamp() - INTERVAL {dedup_hours} HOURS
        """)

        new_matches = batch_df.join(
            recent_matches,
            batch_df.matched_indicator == recent_matches.matched_indicator,
            "left_anti"
        )

        match_count = new_matches.count()
        if match_count == 0:
            return

        # Persist matches for dedup tracking
        matches_to_store = (
            new_matches
            .withColumn("id", expr("uuid()"))
            .withColumn("matched_at", current_timestamp())
            .select("id", "event_id", "match_type", "matched_indicator",
                    "threat_type", "confidence", "ioc_source",
                    "source_ip", "user_id", "event_type", "matched_at")
        )
        matches_to_store.write.mode("append").saveAsTable(ti_matches_table)

        # Generate alerts
        alerts = (
            new_matches
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(
                lit("Threat Intel: "), col("threat_type"),
                lit(" ("), col("matched_indicator"), lit(")")
            ))
            .withColumn("description", concat(
                lit("IOC matched on "), col("match_type"),
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
            .select("id", "title", "description", "severity", "status",
                    "source", "confidence_score", "created_at")
        )
        alerts.write.mode("append").saveAsTable(alerts_table)

        mon.log_detection("threat_intel_match", {
            "batch_id": batch_id,
            "matches": match_count,
        })
        print(f"TI batch {batch_id}: {match_count} new IOC matches")

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
        .trigger(processingTime="30 seconds")
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
