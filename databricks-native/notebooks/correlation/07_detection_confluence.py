# Databricks notebook source
# MAGIC %md
# MAGIC # Detection Confluence - Multi-Lens Fusion Engine (KS-Enhanced)
# MAGIC
# MAGIC Fuses signals from 7 detection lenses into unified verdicts using
# MAGIC Bayesian weighted scoring with KS-based signal validation.
# MAGIC
# MAGIC **Architecture:**
# MAGIC - Collects signals from all lens tables within the fusion window
# MAGIC - Groups signals by entity (user, IP, alert_id)
# MAGIC - Computes weighted Bayesian fusion score with diversity bonus
# MAGIC - KS-validated signals carry higher reliability weight
# MAGIC - Batch-checks historical scores to gate escalation (prevents chronic re-alerting)
# MAGIC - Persists verdicts + full signal lineage for audit trail
# MAGIC
# MAGIC **Lenses (7):**
# MAGIC 1. Correlation Rules (streaming CEP matches)
# MAGIC 2. Negative Correlation (absence-based detection)
# MAGIC 3. Graph Pattern Matching (entity relationship anomalies)
# MAGIC 4. Detection SLM (small language model rapid classification)
# MAGIC 5. Vector Hunting (embedding similarity to known threats)
# MAGIC 6. Formula Prioritization (risk-score weighted ranking)
# MAGIC 7. UEBA Behavioral Baseline (user/entity deviation, KS-validated)
# MAGIC
# MAGIC **Modes:** `batch` (default, single pass) | `streaming` (continuous foreachBatch)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("fusion_window_seconds", "60", "Signal fusion window in seconds")
dbutils.widgets.text("escalation_threshold", "0.78", "Score threshold for verdict escalation")
dbutils.widgets.text("conflict_threshold", "0.3", "Conflict mass threshold for disagreement escalation")
dbutils.widgets.text("max_signals_per_run", "5000", "Max signals to process per run")
dbutils.widgets.text("mode", "batch", "Execution mode: streaming | batch")
dbutils.widgets.text("novelty_percentile", "95", "Percentile threshold for novel escalation")

fusion_window = int(dbutils.widgets.get("fusion_window_seconds"))
escalation_threshold = float(dbutils.widgets.get("escalation_threshold"))
conflict_threshold = float(dbutils.widgets.get("conflict_threshold"))
max_signals = int(dbutils.widgets.get("max_signals_per_run"))
mode = dbutils.widgets.get("mode")
novelty_percentile = float(dbutils.widgets.get("novelty_percentile"))
require_tables("alerts", "confluence_verdicts", "confluence_lens_weights")

mon.log_event("config_loaded", {
    "fusion_window": fusion_window,
    "escalation_threshold": escalation_threshold,
    "max_signals": max_signals,
    "mode": mode,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import numpy as np
from scipy import stats as scipy_stats

# COMMAND ----------

# MAGIC %md
# MAGIC ## Lens Weight Configuration

# COMMAND ----------

DEFAULT_LENS_WEIGHTS = {
    "correlation_rules": 0.25,
    "negative_correlation": 0.10,
    "graph_patterns": 0.20,
    "detection_slm": 0.15,
    "vector_hunting": 0.10,
    "formula_prioritization": 0.05,
    "ueba_behavioral": 0.15,
}

weights_table = cfg.get_table_path("confluence_lens_weights")
try:
    weights_df = spark.table(weights_table).filter(
        col("is_active") == True
    ).orderBy(col("version").desc()).limit(1)

    if weights_df.count() > 0:
        row = weights_df.collect()[0]
        lens_weights = json.loads(row.weights_json)
        print(f"Loaded custom lens weights v{row.version}")
    else:
        lens_weights = DEFAULT_LENS_WEIGHTS
        print("Using default lens weights")
except Exception:
    lens_weights = DEFAULT_LENS_WEIGHTS
    print("Using default lens weights (table not found)")

# Normalize weights to sum to 1.0
weight_total = sum(lens_weights.values())
if weight_total > 0 and abs(weight_total - 1.0) > 0.001:
    lens_weights = {k: v / weight_total for k, v in lens_weights.items()}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fusion Logic

# COMMAND ----------

KS_RELIABILITY_BOOST = 1.15
NON_KS_PENALTY = 0.85
KS_VALIDATED_SOURCES = {
    "behavioral_anomaly_detection_ks",
    "behavioral_anomaly_detection_ensemble",
    "ks_behavioral_deviation",
    "ensemble_kmeans+iforest",
    "isolation_forest",
    "kmeans_ks",
}


def compute_fused_score(signals, weights):
    """
    Bayesian fusion with KS-confidence weighting.
    - KS-validated signals get a reliability boost
    - Non-validated signals get a penalty
    - Diversity bonus: more independent lenses = higher confidence (non-linear)
    """
    if not signals:
        return 0.0

    weighted_sum = 0.0
    total_weight = 0.0
    contributing_lenses = set()
    ks_validated_count = 0

    for sig in signals:
        lens = sig["lens"]
        weight = weights.get(lens, 0.05)
        score = min(1.0, max(0.0, sig["raw_score"]))

        # Check if signal comes from a KS-validated detection pipeline
        detail_lower = str(sig.get("signal_detail", "")).lower()
        source_lower = str(sig.get("signal_source", "")).lower()
        is_ks = (
            any(src in detail_lower for src in KS_VALIDATED_SOURCES) or
            any(src in source_lower for src in KS_VALIDATED_SOURCES) or
            "ks_" in detail_lower or "ks-" in detail_lower
        )

        if is_ks:
            score = min(1.0, score * KS_RELIABILITY_BOOST)
            ks_validated_count += 1
        else:
            score *= NON_KS_PENALTY

        weighted_sum += weight * score
        total_weight += weight
        contributing_lenses.add(lens)

    if total_weight == 0:
        return 0.0

    base_score = weighted_sum / total_weight

    # Diversity factor: each additional lens contributes diminishing returns
    lens_count = len(contributing_lenses)
    ks_bonus = 0.067 + (0.02 * ks_validated_count / max(lens_count, 1))
    diversity_factor = 1.0 + (lens_count - 1) * ks_bonus

    return round(min(1.0, base_score * diversity_factor), 4)


def determine_priority(fused_score, lens_count):
    if fused_score >= 0.9 and lens_count >= 3:
        return "P1"
    elif fused_score >= 0.78:
        return "P2"
    elif fused_score >= 0.6:
        return "P3"
    return "P4"


def determine_kill_chain(signals):
    STAGE_ORDER = [
        "reconnaissance", "resource-development", "initial-access",
        "execution", "persistence", "privilege-escalation",
        "defense-evasion", "credential-access", "discovery",
        "lateral-movement", "collection", "command-and-control",
        "exfiltration", "impact",
    ]
    stages = [s["kill_chain_stage"] for s in signals if s.get("kill_chain_stage", "unknown") != "unknown"]
    if not stages:
        return "unknown"

    max_idx = -1
    for stage in stages:
        if stage in STAGE_ORDER:
            max_idx = max(max_idx, STAGE_ORDER.index(stage))

    return STAGE_ORDER[max_idx] if max_idx >= 0 else stages[0]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Novelty Check (avoids per-entity Spark queries)

# COMMAND ----------

verdicts_table = cfg.get_table_path("confluence_verdicts")


def batch_novelty_check(entity_ids, fused_scores_map):
    """
    Batch check: for each entity, determine if the new fused_score represents
    a genuine escalation vs. chronic high-scoring.
    Returns set of entity_ids that ARE novel escalations.
    """
    if not entity_ids:
        return set()

    try:
        # Load 7-day history for all entities in one query
        entity_list = ", ".join(f"'{eid}'" for eid in entity_ids)
        history_df = spark.sql(f"""
            SELECT entity_id, fused_score
            FROM {verdicts_table}
            WHERE entity_id IN ({entity_list})
              AND verdict_time > current_timestamp() - INTERVAL 7 DAYS
        """)

        if history_df.count() == 0:
            return set(entity_ids)

        history_pd = history_df.toPandas()
        novel_entities = set()

        for entity_id in entity_ids:
            entity_history = history_pd[history_pd["entity_id"] == entity_id]["fused_score"].values
            new_score = fused_scores_map[entity_id]

            if len(entity_history) < 5:
                novel_entities.add(entity_id)
            else:
                percentile = scipy_stats.percentileofscore(entity_history, new_score)
                if percentile >= novelty_percentile:
                    novel_entities.add(entity_id)

        return novel_entities

    except Exception as e:
        mon.log_event("novelty_check_fallback", {"error": str(e)[:200]})
        return set(entity_ids)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Signal Collection Queries

# COMMAND ----------

def build_lens_queries(cutoff_str):
    """Build SQL queries for each detection lens."""
    return {
        "correlation_rules": f"""
            SELECT id as signal_id, 'correlation_rules' as lens,
                   COALESCE(alert_id, id) as entity_id,
                   COALESCE(confidence, score, 0.8) as raw_score,
                   COALESCE(pattern_name, rule_id) as signal_detail,
                   matched_at as signal_time,
                   COALESCE(mitre_tactic, 'unknown') as kill_chain_stage
            FROM {cfg.get_table_path("cep_pattern_matches")}
            WHERE matched_at >= '{cutoff_str}'
        """,
        "negative_correlation": f"""
            SELECT id as signal_id, 'negative_correlation' as lens,
                   COALESCE(entity_id, rule_id) as entity_id,
                   COALESCE(confidence_score, 0.7) as raw_score,
                   rule_name as signal_detail,
                   detected_at as signal_time,
                   'defense-evasion' as kill_chain_stage
            FROM {cfg.get_table_path("negative_correlation_detections")}
            WHERE detected_at >= '{cutoff_str}'
        """,
        "graph_patterns": f"""
            SELECT id as signal_id, 'graph_patterns' as lens,
                   source_entity as entity_id,
                   anomaly_score as raw_score,
                   pattern_type as signal_detail,
                   detected_at as signal_time,
                   COALESCE(kill_chain_phase, 'lateral-movement') as kill_chain_stage
            FROM {cfg.get_table_path("graph_anomaly_detections")}
            WHERE detected_at >= '{cutoff_str}'
        """,
        "detection_slm": f"""
            SELECT id as signal_id, 'detection_slm' as lens,
                   alert_id as entity_id,
                   confidence as raw_score,
                   classification as signal_detail,
                   classified_at as signal_time,
                   COALESCE(mitre_tactic, 'unknown') as kill_chain_stage
            FROM {cfg.get_table_path("slm_classifications")}
            WHERE classified_at >= '{cutoff_str}'
              AND classification != 'benign'
        """,
        "vector_hunting": f"""
            SELECT id as signal_id, 'vector_hunting' as lens,
                   alert_id as entity_id,
                   similarity_score as raw_score,
                   matched_threat_pattern as signal_detail,
                   matched_at as signal_time,
                   COALESCE(kill_chain_phase, 'unknown') as kill_chain_stage
            FROM {cfg.get_table_path("vector_hunt_matches")}
            WHERE matched_at >= '{cutoff_str}'
              AND similarity_score >= 0.75
        """,
        "formula_prioritization": f"""
            SELECT id as signal_id, 'formula_prioritization' as lens,
                   entity_id,
                   priority_score / 100.0 as raw_score,
                   priority_reason as signal_detail,
                   scored_at as signal_time,
                   'unknown' as kill_chain_stage
            FROM {cfg.get_table_path("formula_priority_scores")}
            WHERE scored_at >= '{cutoff_str}'
              AND priority_score >= 70
        """,
        "ueba_behavioral": f"""
            SELECT id as signal_id, 'ueba_behavioral' as lens,
                   user_id as entity_id,
                   risk_score / 100.0 as raw_score,
                   anomaly_type as signal_detail,
                   detected_at as signal_time,
                   COALESCE(kill_chain_phase, 'initial-access') as kill_chain_stage
            FROM {cfg.get_table_path("user_behavior_anomalies")}
            WHERE detected_at >= '{cutoff_str}'
              AND risk_score >= 60
        """,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Core Fusion Pipeline

# COMMAND ----------

def run_fusion_pipeline(cutoff_str):
    """
    Execute the full confluence fusion pipeline.
    Returns (verdicts, lineage_edges, lens_counts, signal_count).
    """
    # --- Collect Signals ---
    lens_queries = build_lens_queries(cutoff_str)
    all_signal_dfs = []
    lens_counts = {}

    for lens_name, query in lens_queries.items():
        try:
            lens_df = spark.sql(query).limit(max_signals // 7)
            count = lens_df.count()
            lens_counts[lens_name] = count
            if count > 0:
                all_signal_dfs.append(lens_df)
        except Exception as e:
            lens_counts[lens_name] = 0
            mon.log_event("lens_query_failed", {"lens": lens_name, "error": str(e)[:200]})

    if not all_signal_dfs:
        return [], [], lens_counts, 0

    # Union all signals
    all_signals = all_signal_dfs[0]
    for df in all_signal_dfs[1:]:
        all_signals = all_signals.unionByName(df, allowMissingColumns=True)

    signal_count = all_signals.count()

    # --- Group by Entity ---
    signals_collected = all_signals.collect()
    entity_signals = {}
    for row in signals_collected:
        entity_id = row.entity_id
        if entity_id is None:
            continue
        if entity_id not in entity_signals:
            entity_signals[entity_id] = []
        entity_signals[entity_id].append({
            "signal_id": row.signal_id,
            "lens": row.lens,
            "raw_score": float(row.raw_score) if row.raw_score else 0.0,
            "signal_detail": row.signal_detail,
            "signal_source": getattr(row, "signal_source", ""),
            "signal_time": str(row.signal_time),
            "kill_chain_stage": row.kill_chain_stage,
        })

    # --- Compute Fused Scores ---
    fused_scores_map = {}
    verdicts_pre = []
    now = datetime.utcnow()

    for entity_id, signals in entity_signals.items():
        fused_score = compute_fused_score(signals, lens_weights)
        fused_scores_map[entity_id] = fused_score
        contributing_lenses = list(set(s["lens"] for s in signals))
        lens_count = len(contributing_lenses)

        verdicts_pre.append({
            "entity_id": entity_id,
            "fused_score": fused_score,
            "signals": signals,
            "contributing_lenses": contributing_lenses,
            "lens_count": lens_count,
            "kill_chain": determine_kill_chain(signals),
            "priority": determine_priority(fused_score, lens_count),
        })

    # --- Batch Novelty Check (single Spark query for all candidates) ---
    escalation_candidates = [
        v["entity_id"] for v in verdicts_pre if v["fused_score"] >= escalation_threshold
    ]
    novel_entities = batch_novelty_check(escalation_candidates, fused_scores_map)

    # --- Build Final Verdicts + Lineage ---
    verdicts = []
    lineage_edges = []

    for v in verdicts_pre:
        verdict_id = str(uuid.uuid4())
        should_escalate = (
            v["fused_score"] >= escalation_threshold and
            v["entity_id"] in novel_entities
        )

        verdicts.append({
            "id": verdict_id,
            "entity_id": v["entity_id"],
            "fused_score": v["fused_score"],
            "priority": v["priority"],
            "contributing_lenses": json.dumps(v["contributing_lenses"]),
            "lens_count": v["lens_count"],
            "kill_chain_stage": v["kill_chain"],
            "signal_count": len(v["signals"]),
            "arbiter_mode": "bayesian_ks_weighted",
            "escalated": should_escalate,
            "verdict_time": now,
            "fusion_window_seconds": fusion_window,
        })

        for sig in v["signals"]:
            lineage_edges.append({
                "id": str(uuid.uuid4()),
                "source_signal_id": sig["signal_id"],
                "source_lens": sig["lens"],
                "verdict_id": verdict_id,
                "entity_id": v["entity_id"],
                "contribution_weight": lens_weights.get(sig["lens"], 0.05),
                "raw_score": sig["raw_score"],
                "created_at": now,
            })

    return verdicts, lineage_edges, lens_counts, signal_count

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Results

# COMMAND ----------

def persist_verdicts(verdicts, lineage_edges):
    """Write verdicts and lineage to Delta tables."""
    if not verdicts:
        return

    verdict_schema = StructType([
        StructField("id", StringType(), False),
        StructField("entity_id", StringType(), False),
        StructField("fused_score", DoubleType(), False),
        StructField("priority", StringType(), False),
        StructField("contributing_lenses", StringType(), False),
        StructField("lens_count", IntegerType(), False),
        StructField("kill_chain_stage", StringType(), True),
        StructField("signal_count", IntegerType(), False),
        StructField("arbiter_mode", StringType(), False),
        StructField("escalated", BooleanType(), False),
        StructField("verdict_time", TimestampType(), False),
        StructField("fusion_window_seconds", IntegerType(), False),
    ])

    verdicts_df = spark.createDataFrame(verdicts, schema=verdict_schema)
    verdicts_df.write.mode("append").saveAsTable(verdicts_table)

    if lineage_edges:
        lineage_table = cfg.get_table_path("confluence_lineage")
        lineage_schema = StructType([
            StructField("id", StringType(), False),
            StructField("source_signal_id", StringType(), False),
            StructField("source_lens", StringType(), False),
            StructField("verdict_id", StringType(), False),
            StructField("entity_id", StringType(), False),
            StructField("contribution_weight", DoubleType(), False),
            StructField("raw_score", DoubleType(), False),
            StructField("created_at", TimestampType(), False),
        ])
        lineage_df = spark.createDataFrame(lineage_edges, schema=lineage_schema)
        lineage_df.write.mode("append").saveAsTable(lineage_table)


def escalate_verdicts(verdicts):
    """Generate alerts for escalated verdicts."""
    escalated = [v for v in verdicts if v["escalated"]]
    if not escalated:
        return 0

    alerts_table = cfg.get_table_path("alerts")
    alert_schema = StructType([
        StructField("id", StringType(), False),
        StructField("title", StringType(), False),
        StructField("description", StringType(), False),
        StructField("severity", StringType(), False),
        StructField("status", StringType(), False),
        StructField("source", StringType(), False),
        StructField("confidence_score", DoubleType(), False),
        StructField("mitre_tactic", StringType(), True),
        StructField("created_at", TimestampType(), False),
    ])

    now = datetime.utcnow()
    alert_rows = []
    for v in escalated:
        alert_rows.append({
            "id": str(uuid.uuid4()),
            "title": f"Confluence {v['priority']}: {v['kill_chain_stage']} ({v['lens_count']} lenses)",
            "description": (
                f"Multi-lens fusion on entity {v['entity_id']}. "
                f"Score: {v['fused_score']:.3f}, Lenses: {v['contributing_lenses']}"
            ),
            "severity": "critical" if v["priority"] == "P1" else "high",
            "status": "new",
            "source": "detection_confluence",
            "confidence_score": v["fused_score"],
            "mitre_tactic": v["kill_chain_stage"],
            "created_at": now,
        })

    alerts_df = spark.createDataFrame(alert_rows, schema=alert_schema)
    alerts_df.write.mode("append").saveAsTable(alerts_table)

    mon.log_detection("confluence_escalation", {
        "count": len(alert_rows),
        "priorities": [v["priority"] for v in escalated],
    })
    return len(alert_rows)


def record_arbiter_run(lens_counts, signal_count, verdicts):
    """Persist audit record of this arbiter run."""
    arbiter_table = cfg.get_table_path("confluence_arbiter_runs")
    arbiter_schema = StructType([
        StructField("id", StringType(), False),
        StructField("run_time", TimestampType(), False),
        StructField("fusion_window_seconds", IntegerType(), False),
        StructField("escalation_threshold", DoubleType(), False),
        StructField("signals_processed", IntegerType(), False),
        StructField("verdicts_generated", IntegerType(), False),
        StructField("verdicts_escalated", IntegerType(), False),
        StructField("weights_used", StringType(), True),
        StructField("lens_signal_counts", StringType(), True),
    ])

    escalated_count = sum(1 for v in verdicts if v["escalated"])
    arbiter_run = [{
        "id": str(uuid.uuid4()),
        "run_time": datetime.utcnow(),
        "fusion_window_seconds": fusion_window,
        "escalation_threshold": escalation_threshold,
        "signals_processed": signal_count,
        "verdicts_generated": len(verdicts),
        "verdicts_escalated": escalated_count,
        "weights_used": json.dumps(lens_weights),
        "lens_signal_counts": json.dumps(lens_counts),
    }]

    spark.createDataFrame(arbiter_run, schema=arbiter_schema).write.mode("append").saveAsTable(arbiter_table)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Mode

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fuse-Aware Mode: Read from Fuse Engine Output
# MAGIC
# MAGIC When the Fuse Engine (correlation/10_fuse_engine.py) has produced results,
# MAGIC Confluence reads those instead of re-computing fusion from raw signals.
# MAGIC This separates evidence alignment (Fuse) from decision-making (Confluence).

# COMMAND ----------

def run_fuse_aware_pipeline():
    """
    Read unconsumed Fuse results and produce Confluence verdicts.
    The Fuse Engine already did Dempster-Shafer combination, independence scoring,
    and disagreement detection. Confluence adds:
    - Policy-based escalation decision
    - Novelty gating (KS percentile check)
    - Priority assignment
    - Case/alert emission
    """
    fuse_path = cfg.get_table_path("fuse_results")
    try:
        fuse_df = spark.sql(f"""
            SELECT *
            FROM {fuse_path}
            WHERE confluence_consumed = false
            ORDER BY ds_combined_score DESC
            LIMIT {max_signals}
        """)
        fuse_count = fuse_df.count()
    except Exception:
        return None  # Fuse table doesn't exist yet

    if fuse_count == 0:
        return None

    print(f"[Fuse-Aware Mode] Processing {fuse_count} fused evidence records")

    fuse_rows = fuse_df.collect()
    fused_scores_map = {r.entity_id: r.ds_combined_score for r in fuse_rows}

    # Novelty check
    escalation_candidates = [r.entity_id for r in fuse_rows if r.ds_combined_score >= escalation_threshold]
    novel_entities = batch_novelty_check(escalation_candidates, fused_scores_map)

    verdicts = []
    now = datetime.utcnow()

    for row in fuse_rows:
        # Priority from Fuse score + independence count
        fused_score = row.ds_combined_score
        ind_groups = row.independence_groups or 1

        if fused_score >= 0.9 and ind_groups >= 3:
            priority = "P1"
        elif fused_score >= escalation_threshold:
            priority = "P2"
        elif fused_score >= 0.6:
            priority = "P3"
        else:
            priority = "P4"

        # Disagreement escalation: high-uncertainty cases get P2 minimum
        if row.has_disagreement and row.conflict_mass >= 0.3:
            priority = min(priority, "P2")  # alphabetical min = higher priority

        should_escalate = (
            fused_score >= escalation_threshold and
            row.entity_id in novel_entities
        ) or (
            row.has_disagreement and row.conflict_mass >= conflict_threshold
        )

        verdicts.append({
            "id": str(uuid.uuid4()),
            "entity_id": row.entity_id,
            "fused_score": fused_score,
            "priority": priority,
            "contributing_lenses": json.dumps(row.causal_chain_events or []),
            "lens_count": row.independent_signals or 0,
            "kill_chain_stage": row.kill_chain_progression or "unknown",
            "signal_count": row.total_signals or 0,
            "arbiter_mode": "dempster_shafer_fuse",
            "escalated": should_escalate,
            "verdict_time": now,
            "fusion_window_seconds": fusion_window,
        })

    # Mark fuse records as consumed
    fuse_ids = [r.fuse_id for r in fuse_rows]
    id_list = "','".join(fuse_ids)
    spark.sql(f"""
        UPDATE {fuse_path}
        SET confluence_consumed = true
        WHERE fuse_id IN ('{id_list}')
    """)

    return verdicts


# Try Fuse-aware mode first; fall back to legacy fusion
fuse_verdicts = run_fuse_aware_pipeline()

if fuse_verdicts is not None and len(fuse_verdicts) > 0:
    # Fuse-aware path
    persist_verdicts(fuse_verdicts, [])
    escalated_count = escalate_verdicts(fuse_verdicts)
    record_arbiter_run({}, len(fuse_verdicts), fuse_verdicts)

    result = {
        "notebook": "07_detection_confluence",
        "mode": "fuse_aware",
        "status": "success",
        "verdicts": len(fuse_verdicts),
        "escalated": escalated_count,
    }
    mon.log_complete(details=result)
    print(f"[Fuse-Aware] {len(fuse_verdicts)} verdicts, {escalated_count} escalated")
    dbutils.notebook.exit(json.dumps(result))

# COMMAND ----------

if mode == "streaming":
    # In streaming mode, use the alerts table as the trigger source
    # Each micro-batch of new alerts triggers a confluence fusion pass
    alerts_stream = (
        spark.readStream
        .format("delta")
        .option("maxFilesPerTrigger", 100)
        .table(cfg.get_table_path("alerts"))
    )

    def confluence_streaming_batch(batch_df, batch_id):
        """Run confluence fusion on each micro-batch trigger."""
        if batch_df.count() == 0:
            return

        cutoff = (datetime.utcnow() - timedelta(seconds=fusion_window)).strftime("%Y-%m-%dT%H:%M:%S")

        try:
            verdicts, lineage_edges, lens_counts, signal_count = run_fusion_pipeline(cutoff)

            if verdicts:
                persist_verdicts(verdicts, lineage_edges)
                escalated = escalate_verdicts(verdicts)
                record_arbiter_run(lens_counts, signal_count, verdicts)

                mon.log_event("confluence_streaming_batch", {
                    "batch_id": batch_id,
                    "signals": signal_count,
                    "verdicts": len(verdicts),
                    "escalated": escalated,
                })
        except Exception as e:
            mon.log_error(e, context=f"confluence_streaming_batch_{batch_id}")

    query = (
        alerts_stream
        .writeStream
        .foreachBatch(confluence_streaming_batch)
        .option("checkpointLocation", get_checkpoint_path(cfg, "detection_confluence"))
        .trigger(processingTime="30 seconds")
        .queryName("detection_confluence_fusion")
        .start()
    )
    query.awaitTermination(timeout=600)
    dbutils.notebook.exit(json.dumps({"status": "streaming_complete", "mode": "streaming"}))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Batch Mode Execution

# COMMAND ----------

result = {
    "notebook": "07_detection_confluence",
    "status": "success",
    "started_at": datetime.utcnow().isoformat(),
}

try:
    cutoff_str = (datetime.utcnow() - timedelta(seconds=fusion_window)).strftime("%Y-%m-%dT%H:%M:%S")

    with mon.time("fusion_pipeline"):
        verdicts, lineage_edges, lens_counts, signal_count = run_fusion_pipeline(cutoff_str)

    if not verdicts:
        mon.log_complete(details={"status": "idle", "signals": 0})
        print("No signals to fuse. Exiting.")
        dbutils.notebook.exit(json.dumps({"status": "idle", "signals": 0, "verdicts": 0}))

    print(f"Collected {signal_count} signals from {sum(1 for c in lens_counts.values() if c > 0)} lenses")
    for lens, count in sorted(lens_counts.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"  {lens}: {count}")

    escalated_count = sum(1 for v in verdicts if v["escalated"])
    print(f"Generated {len(verdicts)} verdicts, {escalated_count} escalated")

    # --- Persist ---
    with mon.time("persist"):
        persist_verdicts(verdicts, lineage_edges)

    with mon.time("escalate"):
        alerts_generated = escalate_verdicts(verdicts)

    with mon.time("audit"):
        record_arbiter_run(lens_counts, signal_count, verdicts)

    # --- Mark Processed Signals ---
    with mon.time("mark_processed"):
        signal_ids = [
            sig["signal_id"]
            for v in verdicts
            for edge in lineage_edges
            if edge["verdict_id"] == v["id"]
            for sig in [{"signal_id": edge["source_signal_id"]}]
        ]
        # Deduplicate
        signal_ids = list(set(edge["source_signal_id"] for edge in lineage_edges))

        if signal_ids:
            SIGNAL_TABLES = [
                "cep_pattern_matches",
                "negative_correlation_detections",
                "graph_anomaly_detections",
                "slm_classifications",
                "vector_hunt_matches",
                "formula_priority_scores",
                "user_behavior_anomalies",
            ]
            batch_size = 500
            for table_name in SIGNAL_TABLES:
                table_path = cfg.get_table_path(table_name)
                try:
                    for i in range(0, len(signal_ids), batch_size):
                        batch = signal_ids[i:i + batch_size]
                        id_list = ", ".join(f"'{sid}'" for sid in batch)
                        spark.sql(f"""
                            UPDATE {table_path}
                            SET processed_by_confluence = true
                            WHERE id IN ({id_list})
                        """)
                except Exception:
                    pass

    result.update({
        "signals_processed": signal_count,
        "verdicts_generated": len(verdicts),
        "verdicts_escalated": escalated_count,
        "alerts_generated": alerts_generated,
        "lens_counts": lens_counts,
    })

    mon.log_complete(details={
        "signals_processed": signal_count,
        "verdicts_generated": len(verdicts),
        "verdicts_escalated": escalated_count,
        "lens_counts": lens_counts,
    })

except Exception as e:
    result = {
        "notebook": "07_detection_confluence",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="detection_confluence")
    raise

finally:
    print(json.dumps(result, indent=2, default=str))
    dbutils.notebook.exit(json.dumps(result, default=str))
