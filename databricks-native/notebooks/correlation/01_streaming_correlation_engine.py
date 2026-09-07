# Databricks notebook source
# MAGIC %md
# MAGIC # Streaming Correlation Engine (KS-Gated)
# MAGIC
# MAGIC Real-time CEP (Complex Event Processing) using Spark Structured Streaming.
# MAGIC Evaluates correlation rules against event windows with KS-based adaptive thresholds.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Maintains per-source baseline distributions via Delta (not in-memory)
# MAGIC - Validates observed counts are statistically significant vs. historical baseline
# MAGIC - Severity determined by KS deviation strength, not raw count
# MAGIC - Eliminates false positives from high-volume but normal sources

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("checkpoint_path", "", "Checkpoint override (optional)")
dbutils.widgets.text("ks_alpha", "0.01", "KS significance threshold")
dbutils.widgets.text("baseline_days", "7", "Days of history for baselines")
dbutils.widgets.text("window_minutes", "5", "Correlation window size")

checkpoint_base = dbutils.widgets.get("checkpoint_path") or cfg.get_checkpoint_path("correlation_engine")
ks_alpha = float(dbutils.widgets.get("ks_alpha"))
baseline_days = int(dbutils.widgets.get("baseline_days"))
window_minutes = int(dbutils.widgets.get("window_minutes"))

mon.log_event("config_loaded", {
    "ks_alpha": ks_alpha,
    "baseline_days": baseline_days,
    "window_minutes": window_minutes,
    "checkpoint_base": checkpoint_base,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import numpy as np
from scipy import stats as scipy_stats

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Baseline Distributions (Delta-Backed)
# MAGIC
# MAGIC Compute per-source, per-event-type daily counts from the last N days.
# MAGIC Stored as a Delta table for scalability; broadcast to executors for streaming.

# COMMAND ----------

baselines_table = cfg.get_table_path("correlation_baselines")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {baselines_table} (
        source_ip STRING,
        event_type STRING,
        event_date DATE,
        daily_count LONG,
        updated_at TIMESTAMP
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Refresh baselines from events
spark.sql(f"""
    MERGE INTO {baselines_table} AS target
    USING (
        SELECT
            source_ip,
            event_type,
            DATE(timestamp) as event_date,
            COUNT(*) as daily_count,
            current_timestamp() as updated_at
        FROM {cfg.get_table_path("events")}
        WHERE timestamp BETWEEN current_timestamp() - INTERVAL {baseline_days} DAYS
                            AND current_timestamp() - INTERVAL 1 HOUR
        AND source_ip IS NOT NULL
        GROUP BY source_ip, event_type, DATE(timestamp)
    ) AS source
    ON target.source_ip = source.source_ip
       AND target.event_type = source.event_type
       AND target.event_date = source.event_date
    WHEN MATCHED THEN UPDATE SET
        daily_count = source.daily_count,
        updated_at = source.updated_at
    WHEN NOT MATCHED THEN INSERT *
""")

# Prune old baselines
spark.sql(f"""
    DELETE FROM {baselines_table}
    WHERE event_date < current_date() - INTERVAL {baseline_days + 1} DAYS
""")

# Broadcast for streaming UDFs
baseline_pdf = spark.table(baselines_table).toPandas()
baseline_lookup = {}
for (src_ip, evt_type), group in baseline_pdf.groupby(["source_ip", "event_type"]):
    baseline_lookup[(src_ip, evt_type)] = group["daily_count"].values.astype(float)

baseline_broadcast = spark.sparkContext.broadcast(baseline_lookup)
mon.log_event("baselines_built", {"pair_count": len(baseline_lookup)})
print(f"Built baselines for {len(baseline_lookup)} source-ip/event-type pairs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Significance Functions

# COMMAND ----------

def is_ks_significant(source_ip: str, event_type: str, observed_count: int, window_min: int = 5):
    """
    Check if observed event count is statistically significant
    relative to the source's historical baseline.
    Returns (is_significant, confidence_score).
    """
    lookup = baseline_broadcast.value
    key = (source_ip, event_type)
    baseline = lookup.get(key)

    if baseline is None or len(baseline) < 3:
        return observed_count >= 10, 0.5

    # Historical per-window expected counts from the baseline samples.
    window_rates = np.asarray(baseline, dtype=float) / 24.0 * (window_min / 60.0)
    mu = float(np.mean(window_rates))

    if mu <= 0.0:
        # No historical activity for this key: cannot compute a calibrated
        # significance, so fall back to a simple volume gate with neutral
        # confidence rather than manufacturing a p-value.
        return observed_count >= 10, 0.5

    # Upper-tail Poisson probability of observing at least `observed_count`
    # events under the baseline rate. Unlike a percentile rank, this is a valid
    # significance for a count process: a small exceedance of the sample maximum
    # no longer collapses to near-certainty (e.g. 101 vs 10,000 against a ~100
    # baseline yield very different p-values).
    p_value = float(scipy_stats.poisson.sf(observed_count - 1, mu))
    return p_value < ks_alpha, float(1.0 - p_value)


def adaptive_severity(source_ip: str, event_type: str, observed_count: int, window_min: int = 5):
    """
    Determine severity based on z-score deviation from baseline.
    """
    lookup = baseline_broadcast.value
    key = (source_ip, event_type)
    baseline = lookup.get(key)

    if baseline is None or len(baseline) < 3:
        if observed_count >= 50:
            return "critical"
        elif observed_count >= 20:
            return "high"
        return "medium"

    mean_rate = np.mean(baseline) / 24.0 * window_min / 60.0
    std_rate = max(np.std(baseline) / 24.0 * window_min / 60.0, 0.1)
    z_score = (observed_count - mean_rate) / std_rate

    if z_score > 5:
        return "critical"
    elif z_score > 3:
        return "high"
    return "medium"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Active Correlation Rules

# COMMAND ----------

rules_table = cfg.get_table_path("correlation_rules")
rules_df = spark.table(rules_table).filter(col("enabled") == True).collect()
mon.log_event("rules_loaded", {"count": len(rules_df)})
print(f"Loaded {len(rules_df)} active correlation rules")

# Parse rules by type for dynamic evaluation
threshold_rules = [r for r in rules_df if r.rule_type in ("threshold", "statistical")]
sequence_rules = [r for r in rules_df if r.rule_type == "sequence"]
temporal_rules = [r for r in rules_df if r.rule_type in ("temporal", "periodic")]

# Build dynamic thresholds from rules
rule_thresholds = {}
for r in threshold_rules:
    rule_thresholds[r.id] = {
        "name": r.name,
        "threshold": int(r.threshold) if r.threshold else 5,
        "window_seconds": int(r.window_seconds) if r.window_seconds else window_minutes * 60,
        "severity": r.severity,
        "mitre_tactic": r.mitre_tactic or "",
        "mitre_technique": r.mitre_technique or "",
        "confidence_score": float(r.confidence_score) if r.confidence_score else 0.7,
        "conditions": r.conditions if r.conditions else [],
    }

# Build sequence patterns from rules
rule_sequences = {}
for r in sequence_rules:
    rule_sequences[r.id] = {
        "name": r.name,
        "threshold": int(r.threshold) if r.threshold else 3,
        "window_seconds": int(r.window_seconds) if r.window_seconds else 1800,
        "severity": r.severity,
        "mitre_tactic": r.mitre_tactic or "",
        "conditions": r.conditions if r.conditions else [],
    }

print(f"  Threshold rules: {len(threshold_rules)}")
print(f"  Sequence rules:  {len(sequence_rules)}")
print(f"  Temporal rules:  {len(temporal_rules)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Stream from ZeroBus (Sub-Second Latency)

# COMMAND ----------

events_stream, sdp_source = create_sdp_stream_with_fallback(
    spark, secrets_mgr, cfg,
    consumer_group="0xdsi-sdp-correlation",
    watermark="10 minutes",
    max_offsets_per_trigger=100000,
)

mon.log_event("sdp_stream_connected", {"source": sdp_source, "consumer_group": "0xdsi-sdp-correlation"})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threshold-Based Correlation (KS-Gated)

# COMMAND ----------

# Use minimum threshold from rules (most sensitive rule wins for streaming pre-filter)
# Actual rule evaluation happens in write_correlation_matches per-rule
min_threshold = min((r["threshold"] for r in rule_thresholds.values()), default=5)

threshold_correlations = (
    events_stream
    .groupBy(
        window(col("timestamp"), f"{window_minutes} minutes", "1 minute"),
        col("event_type"),
        col("source_ip")
    )
    .agg(
        count("*").alias("event_count"),
        slice(collect_list("id"), 1, 100).alias("event_ids"),
        max("severity").alias("max_severity")
    )
    .filter(col("event_count") >= min_threshold)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence-Based Correlation (Multi-Stage Attacks)

# COMMAND ----------

# Build sequence event types dynamically from loaded rules
ATTACK_SEQUENCE_TYPES = list(set(
    cond
    for r in rule_sequences.values()
    for cond in (r["conditions"] if r["conditions"] else [])
))
if not ATTACK_SEQUENCE_TYPES:
    ATTACK_SEQUENCE_TYPES = [
        "authentication_failure", "privilege_escalation",
        "lateral_movement", "data_exfiltration",
        "credential_access", "command_and_control",
    ]

# Minimum stages from sequence rules
min_stages = min((r["threshold"] for r in rule_sequences.values()), default=3)

# Ordered stage-sequences defined by the rules. A sequence rule is only meaningful
# when its stages occur in the declared ORDER, so we match ordered subsequences
# rather than counting distinct event types.
RULE_STAGE_SEQUENCES = [
    list(r["conditions"])
    for r in rule_sequences.values()
    if r["conditions"] and len(r["conditions"]) >= 2
]
if not RULE_STAGE_SEQUENCES:
    RULE_STAGE_SEQUENCES = [[
        "authentication_failure", "privilege_escalation",
        "lateral_movement", "data_exfiltration",
    ]]

_rule_seqs_bc = spark.sparkContext.broadcast(RULE_STAGE_SEQUENCES)


def _longest_ordered_match(ordered_types):
    """Return the longest rule stage-sequence that appears, in time order, as a
    subsequence of this entity/window's event types. Enforces order: A->B->C
    matches, C->B->A does not."""
    if not ordered_types:
        return []
    best = []
    for seq in _rule_seqs_bc.value:
        i = 0
        matched = []
        for et in ordered_types:
            if i < len(seq) and et == seq[i]:
                matched.append(et)
                i += 1
        if i == len(seq) and len(matched) > len(best):
            best = matched
    return best


longest_ordered_match_udf = udf(_longest_ordered_match, ArrayType(StringType()))

sequence_events = (
    events_stream
    .filter(col("event_type").isin(ATTACK_SEQUENCE_TYPES))
    .groupBy(
        window(col("timestamp"), "30 minutes", "5 minutes"),
        col("source_ip")
    )
    .agg(
        # Preserve event time so we can reconstruct the true order; collect_list
        # alone is unordered, so we sort by the event timestamp.
        sort_array(collect_list(struct(col("timestamp"), col("event_type")))).alias("_ordered"),
        count("*").alias("event_count"),
        slice(collect_list("id"), 1, 100).alias("event_ids")
    )
    .withColumn("_ordered_types", expr("transform(_ordered, x -> x.event_type)"))
    .withColumn("attack_stages", longest_ordered_match_udf(col("_ordered_types")))
    .filter(size(col("attack_stages")) >= min_stages)
    .drop("_ordered", "_ordered_types")
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Correlation Matches (KS-Validated)

# COMMAND ----------

def write_correlation_matches(batch_df, batch_id):
    """Process threshold correlations with dynamic rule evaluation + KS validation."""
    if batch_df.isEmpty():
        return

    with mon.time("ks_validation_batch"):
        rows = batch_df.collect()
        validated_rows = []
        suppressed = 0

        for row in rows:
            # Evaluate against each threshold rule
            matched_rules = []
            for rule_id, rule in rule_thresholds.items():
                # Check if event_type matches rule conditions
                conditions = rule["conditions"]
                type_match = (not conditions) or (row.event_type in conditions)
                threshold_match = row.event_count >= rule["threshold"]

                if type_match and threshold_match:
                    matched_rules.append(rule_id)

            if not matched_rules:
                # Fallback: apply KS adaptive threshold for rules without explicit conditions
                significant, confidence = is_ks_significant(
                    row.source_ip, row.event_type, row.event_count, window_minutes
                )
                if significant:
                    validated_rows.append({
                        "source_ip": row.source_ip,
                        "event_type": row.event_type,
                        "event_count": int(row.event_count),
                        "event_ids": row.event_ids[:50],
                        "ks_confidence": confidence,
                        "severity": adaptive_severity(row.source_ip, row.event_type, row.event_count, window_minutes),
                        "rule_id": "ks-adaptive-threshold",
                        "rule_name": "KS Adaptive Threshold",
                    })
                else:
                    suppressed += 1
            else:
                # Rule-matched: validate with KS then use rule metadata
                significant, confidence = is_ks_significant(
                    row.source_ip, row.event_type, row.event_count, window_minutes
                )
                if significant:
                    best_rule_id = matched_rules[0]
                    best_rule = rule_thresholds[best_rule_id]
                    validated_rows.append({
                        "source_ip": row.source_ip,
                        "event_type": row.event_type,
                        "event_count": int(row.event_count),
                        "event_ids": row.event_ids[:50],
                        "ks_confidence": confidence,
                        "severity": best_rule["severity"],
                        "rule_id": best_rule_id,
                        "rule_name": best_rule["name"],
                        "mitre_tactic": best_rule["mitre_tactic"],
                        "mitre_technique": best_rule["mitre_technique"],
                    })
                else:
                    suppressed += 1

        mon.log_event("ks_validation", {
            "batch_id": batch_id,
            "total": len(rows),
            "validated": len(validated_rows),
            "suppressed": suppressed,
        })

        if suppressed > 0:
            print(f"Batch {batch_id}: KS suppressed {suppressed}/{len(rows)} "
                  f"({suppressed/len(rows)*100:.0f}%) false positives")

        if not validated_rows:
            return

        # Write pattern matches
        match_schema = StructType([
            StructField("source_ip", StringType()),
            StructField("event_type", StringType()),
            StructField("event_count", IntegerType()),
            StructField("ks_confidence", DoubleType()),
            StructField("severity", StringType()),
            StructField("rule_id", StringType()),
            StructField("rule_name", StringType()),
        ])

        validated_df = spark.createDataFrame(
            [{k: v for k, v in r.items() if k not in ("event_ids", "mitre_tactic", "mitre_technique")} for r in validated_rows],
            schema=match_schema
        )

        matches = (
            validated_df
            .withColumn("id", expr("uuid()"))
            .withColumn("matched_at", current_timestamp())
            .withColumn("score", col("ks_confidence"))
        )

        matches_table = cfg.get_table_path("cep_pattern_matches")
        matches.write.mode("append").saveAsTable(matches_table)

        # Generate alerts for high-confidence detections (with dedup)
        alert_candidates = [r for r in validated_rows if r["ks_confidence"] > 0.9]
        if alert_candidates:
            alerts_table = cfg.get_table_path("alerts")

            # Dedup: skip alerts for same source_ip + rule in last hour
            recent_alert_keys = set()
            try:
                recent = spark.sql(f"""
                    SELECT title FROM {alerts_table}
                    WHERE source = 'correlation_engine_ks'
                      AND created_at > current_timestamp() - INTERVAL 1 HOUR
                """).collect()
                recent_alert_keys = {r.title for r in recent}
            except Exception:
                pass

            alert_rows = []
            for r in alert_candidates:
                rule_name = r.get("rule_name", "KS Adaptive Threshold")
                title = f"Correlation: {rule_name} - {r['event_type']} from {r['source_ip']}"
                if title in recent_alert_keys:
                    continue
                alert_rows.append({
                    "title": title,
                    "description": f"Rule '{rule_name}' matched: {r['event_count']} events in {window_minutes}min window (KS confidence: {r['ks_confidence']:.3f})",
                    "severity": r["severity"],
                    "status": "new",
                    "source": "correlation_engine_ks",
                    "confidence_score": r["ks_confidence"],
                })

            if not alert_rows:
                return

            alert_schema = StructType([
                StructField("title", StringType()),
                StructField("description", StringType()),
                StructField("severity", StringType()),
                StructField("status", StringType()),
                StructField("source", StringType()),
                StructField("confidence_score", DoubleType()),
            ])

            alert_df = (
                spark.createDataFrame(alert_rows, schema=alert_schema)
                .withColumn("id", expr("uuid()"))
                .withColumn("created_at", current_timestamp())
            )
            alert_df.write.mode("append").saveAsTable(alerts_table)

            mon.log_detection("ks_threshold_alert", {
                "count": len(alert_rows),
                "severities": [r["severity"] for r in alert_rows],
            })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sequence Attack Detections
# MAGIC
# MAGIC Multi-stage attack sequences are high-confidence by nature (require 3+ kill-chain stages).
# MAGIC No KS gating needed - the specificity of the pattern IS the validation.

# COMMAND ----------

def write_sequence_detections(batch_df, batch_id):
    """Persist multi-stage attack sequence detections as critical alerts."""
    if batch_df.isEmpty():
        return

    with mon.time("sequence_detection_batch"):
        alerts_table = cfg.get_table_path("alerts")

        alerts = (
            batch_df
            .withColumn("id", expr("uuid()"))
            .withColumn("title", concat(lit("Multi-Stage Attack: "), col("source_ip")))
            .withColumn("description", concat(
                lit("Detected attack chain: "),
                array_join(col("attack_stages"), " -> "),
                lit(f" ({window_minutes}min window)")
            ))
            .withColumn("severity", lit("critical"))
            .withColumn("status", lit("new"))
            .withColumn("source", lit("sequence_correlation"))
            .withColumn("mitre_tactic", lit("TA0001,TA0004,TA0008,TA0010"))
            .withColumn("confidence_score", least(
                size(col("attack_stages")).cast("double") / lit(4.0),
                lit(1.0)
            ))
            .withColumn("created_at", current_timestamp())
            .select("id", "title", "description", "severity", "status", "source",
                    "mitre_tactic", "confidence_score", "created_at")
        )
        alerts.write.mode("append").saveAsTable(alerts_table)

        count = batch_df.count()
        mon.log_detection("sequence_attack", {"count": count, "batch_id": batch_id})
        print(f"Batch {batch_id}: Generated {count} multi-stage attack alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Start Streaming Queries

# COMMAND ----------

try:
    threshold_query = (
        threshold_correlations.writeStream
        .foreachBatch(write_correlation_matches)
        .option("checkpointLocation", f"{checkpoint_base}/threshold")
        .queryName("correlation_threshold_ks")
        .trigger(processingTime="30 seconds")
        .start()
    )

    sequence_query = (
        sequence_events.writeStream
        .foreachBatch(write_sequence_detections)
        .option("checkpointLocation", f"{checkpoint_base}/sequence")
        .queryName("correlation_sequence_attack")
        .trigger(processingTime="60 seconds")
        .start()
    )

    mon.log_complete(details={
        "queries_started": 2,
        "rules_loaded": len(rules_df),
        "baseline_pairs": len(baseline_lookup),
        "ks_alpha": ks_alpha,
    })

    print(f"KS-gated correlation engine running:")
    print(f"  - Threshold detection ({window_minutes}min windows, KS-validated)")
    print(f"  - Sequence detection (30min windows, pattern-validated)")
    print(f"  - {len(rules_df)} rules loaded")
    print(f"  - {len(baseline_lookup)} source baselines")
    print(f"  - KS alpha: {ks_alpha}")

    # Block until terminated
    spark.streams.awaitAnyTermination()

except Exception as e:
    mon.log_error(e, {"phase": "streaming_startup"})
    raise
finally:
    for q in spark.streams.active:
        if q.name and q.name.startswith("correlation_"):
            q.stop()
