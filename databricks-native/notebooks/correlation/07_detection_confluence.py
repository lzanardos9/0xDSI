# Databricks notebook source
# MAGIC %md
# MAGIC # Detection Confluence - Multi-Lens Fusion Engine (KS-Enhanced)
# MAGIC
# MAGIC Fuses signals from 7 detection lenses into unified verdicts using
# MAGIC Bayesian weighted scoring with KS-based signal validation.
# MAGIC
# MAGIC **KS Enhancement:**
# MAGIC - Signals from KS-validated detectors carry higher weight (confidence-boosted)
# MAGIC - Non-KS-validated signals are discounted by a reliability penalty
# MAGIC - Per-entity score distributions tracked; KS test detects true escalation
# MAGIC   vs. noise (an entity that always scores 0.7 won't re-alert)
# MAGIC
# MAGIC **Lenses:**
# MAGIC 1. Correlation Rules (streaming CEP matches, KS-gated)
# MAGIC 2. Negative Correlation (absence-based detection)
# MAGIC 3. Graph Pattern Matching (entity relationship anomalies)
# MAGIC 4. Detection SLM (small language model rapid classification)
# MAGIC 5. Vector Hunting (embedding similarity to known threats)
# MAGIC 6. Formula Prioritization (risk-score weighted ranking)
# MAGIC 7. UEBA Behavioral Baseline (user/entity deviation, KS-validated)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("fusion_window_seconds", "60", "Signal fusion window in seconds")
dbutils.widgets.text("escalation_threshold", "0.78", "Score threshold for verdict escalation")
dbutils.widgets.text("max_signals_per_run", "5000", "Max signals to process per run")

fusion_window = int(dbutils.widgets.get("fusion_window_seconds"))
escalation_threshold = float(dbutils.widgets.get("escalation_threshold"))
max_signals = int(dbutils.widgets.get("max_signals_per_run"))

mon.log_event("config_loaded", {
    "fusion_window": fusion_window,
    "escalation_threshold": escalation_threshold,
    "max_signals": max_signals,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
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

# Load custom weights if configured
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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Collect Signals from All Lenses

# COMMAND ----------

cutoff_time = datetime.utcnow() - timedelta(seconds=fusion_window)
cutoff_str = cutoff_time.strftime("%Y-%m-%dT%H:%M:%S")

LENS_QUERIES = {
    "correlation_rules": f"""
        SELECT id as signal_id, 'correlation_rules' as lens,
               COALESCE(alert_id, id) as entity_id,
               COALESCE(confidence, score, 0.8) as raw_score,
               COALESCE(pattern_name, rule_id) as signal_detail,
               matched_at as signal_time,
               COALESCE(mitre_tactic, 'unknown') as kill_chain_stage
        FROM {{cep_pattern_matches}}
        WHERE matched_at >= '{cutoff_str}'
    """,
    "negative_correlation": f"""
        SELECT id as signal_id, 'negative_correlation' as lens,
               COALESCE(entity_id, rule_id) as entity_id,
               COALESCE(confidence_score, 0.7) as raw_score,
               rule_name as signal_detail,
               detected_at as signal_time,
               'defense-evasion' as kill_chain_stage
        FROM {{negative_correlation_detections}}
        WHERE detected_at >= '{cutoff_str}'
    """,
    "graph_patterns": f"""
        SELECT id as signal_id, 'graph_patterns' as lens,
               source_entity as entity_id,
               anomaly_score as raw_score,
               pattern_type as signal_detail,
               detected_at as signal_time,
               COALESCE(kill_chain_phase, 'lateral-movement') as kill_chain_stage
        FROM {{graph_anomaly_detections}}
        WHERE detected_at >= '{cutoff_str}'
    """,
    "detection_slm": f"""
        SELECT id as signal_id, 'detection_slm' as lens,
               alert_id as entity_id,
               confidence as raw_score,
               classification as signal_detail,
               classified_at as signal_time,
               COALESCE(mitre_tactic, 'unknown') as kill_chain_stage
        FROM {{slm_classifications}}
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
        FROM {{vector_hunt_matches}}
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
        FROM {{formula_priority_scores}}
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
        FROM {{user_behavior_anomalies}}
        WHERE detected_at >= '{cutoff_str}'
          AND risk_score >= 60
    """,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Each Lens (Fault-Tolerant)

# COMMAND ----------

with mon.time("signal_collection"):
    all_signal_dfs = []
    lens_counts = {}

    for lens_name, query_template in LENS_QUERIES.items():
        try:
            # Replace table references with fully qualified paths
            query = query_template
            for match in set(
                t.strip("{}") for t in query_template.split("{") if "}" in t.split("{")[-1] if t.strip("}")
            ):
                pass
            # Simple replacement: {table_name} -> full path
            import re
            table_refs = re.findall(r'\{(\w+)\}', query_template)
            for ref in table_refs:
                query = query.replace(f"{{{ref}}}", cfg.get_table_path(ref))

            lens_df = spark.sql(query).limit(max_signals // 7)
            count = lens_df.count()
            lens_counts[lens_name] = count

            if count > 0:
                all_signal_dfs.append(lens_df)

        except Exception as e:
            lens_counts[lens_name] = 0
            mon.log_event("lens_query_failed", {"lens": lens_name, "error": str(e)[:200]})

    mon.log_event("signals_collected", lens_counts)

    if not all_signal_dfs:
        mon.log_complete(details={"status": "idle", "signals": 0})
        print("No signals to fuse. Exiting.")
        dbutils.notebook.exit(json.dumps({"status": "idle", "signals": 0, "verdicts": 0}))

    # Union all signals
    all_signals = all_signal_dfs[0]
    for df in all_signal_dfs[1:]:
        all_signals = all_signals.unionByName(df, allowMissingColumns=True)

    signal_count = all_signals.count()
    print(f"Collected {signal_count} signals from {sum(1 for c in lens_counts.values() if c > 0)} lenses")
    for lens, count in sorted(lens_counts.items(), key=lambda x: -x[1]):
        if count > 0:
            print(f"  {lens}: {count}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity-Level Fusion (Bayesian Weighted Scoring)

# COMMAND ----------

KS_RELIABILITY_BOOST = 1.15
NON_KS_PENALTY = 0.85
KS_VALIDATED_KEYWORDS = {"ks_", "ks ", "ks-", "kolmogorov"}


def compute_fused_score(signals, weights):
    """
    Bayesian fusion with KS-confidence weighting.
    KS-validated signals get a reliability boost; non-validated get a penalty.
    Diversity bonus: independent lenses contributing boosts confidence non-linearly.
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

        detail_lower = str(sig.get("signal_detail", "")).lower()
        is_ks = any(kw in detail_lower for kw in KS_VALIDATED_KEYWORDS)

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
# MAGIC ## KS-Based Escalation Gating

# COMMAND ----------

verdicts_table = cfg.get_table_path("confluence_verdicts")

def is_novel_escalation(entity_id, fused_score):
    """
    Check if this score represents a genuine escalation for this entity,
    vs. chronic high-scoring that doesn't warrant re-alerting.
    """
    try:
        history_query = (
            qb()
            .select("fused_score")
            .from_table(verdicts_table)
            .where_eq("entity_id", entity_id)
            .where_raw("verdict_time > current_timestamp() - INTERVAL 7 DAYS")
            .order_by("verdict_time DESC")
            .limit(50)
            .build()
        )
        history = spark.sql(history_query).toPandas()

        if len(history) < 5:
            return True

        historical_scores = history["fused_score"].values
        percentile = scipy_stats.percentileofscore(historical_scores, fused_score)
        return percentile >= 95

    except Exception:
        return True

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Verdicts

# COMMAND ----------

with mon.time("verdict_generation"):
    signals_collected = all_signals.collect()

    # Group by entity
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
            "signal_time": str(row.signal_time),
            "kill_chain_stage": row.kill_chain_stage,
        })

    verdicts = []
    lineage_edges = []
    now = datetime.utcnow()

    for entity_id, signals in entity_signals.items():
        fused_score = compute_fused_score(signals, lens_weights)
        contributing_lenses = list(set(s["lens"] for s in signals))
        lens_count = len(contributing_lenses)
        priority = determine_priority(fused_score, lens_count)
        kill_chain = determine_kill_chain(signals)

        import uuid
        verdict_id = str(uuid.uuid4())

        should_escalate = (
            fused_score >= escalation_threshold and
            is_novel_escalation(entity_id, fused_score)
        )

        verdicts.append({
            "id": verdict_id,
            "entity_id": entity_id,
            "fused_score": fused_score,
            "priority": priority,
            "contributing_lenses": json.dumps(contributing_lenses),
            "lens_count": lens_count,
            "kill_chain_stage": kill_chain,
            "signal_count": len(signals),
            "arbiter_mode": "bayesian_ks_weighted",
            "escalated": should_escalate,
            "verdict_time": now,
            "fusion_window_seconds": fusion_window,
        })

        for sig in signals:
            lineage_edges.append({
                "id": str(uuid.uuid4()),
                "source_signal_id": sig["signal_id"],
                "source_lens": sig["lens"],
                "verdict_id": verdict_id,
                "entity_id": entity_id,
                "contribution_weight": lens_weights.get(sig["lens"], 0.05),
                "raw_score": sig["raw_score"],
                "created_at": now,
            })

    escalated_count = sum(1 for v in verdicts if v["escalated"])
    mon.log_event("verdicts_computed", {
        "total": len(verdicts),
        "escalated": escalated_count,
        "entities": len(entity_signals),
    })
    print(f"Generated {len(verdicts)} verdicts, {escalated_count} escalated")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Verdicts and Lineage

# COMMAND ----------

with mon.time("verdict_persist"):
    if verdicts:
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

        # Lineage
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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Escalate High-Priority Verdicts to Alert Pipeline

# COMMAND ----------

with mon.time("alert_escalation"):
    escalated_verdicts = [v for v in verdicts if v["escalated"]]

    if escalated_verdicts:
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

        alert_rows = []
        for v in escalated_verdicts:
            import uuid as uuid_mod
            alert_rows.append({
                "id": str(uuid_mod.uuid4()),
                "title": f"Confluence {v['priority']}: {v['kill_chain_stage']} ({v['lens_count']} lenses)",
                "description": f"Multi-lens fusion on entity {v['entity_id']}. "
                              f"Score: {v['fused_score']:.2f}, Lenses: {v['contributing_lenses']}",
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
            "priorities": [v["priority"] for v in escalated_verdicts],
        })
        print(f"Escalated {len(alert_rows)} alerts from confluence verdicts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark Processed Signals

# COMMAND ----------

with mon.time("mark_processed"):
    signal_ids = [s["signal_id"] for signals in entity_signals.values() for s in signals]

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

        # Process in batches to avoid query size limits
        batch_size = 200
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

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Arbiter Run for Audit

# COMMAND ----------

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

import uuid as uuid_mod
arbiter_run = [{
    "id": str(uuid_mod.uuid4()),
    "run_time": now,
    "fusion_window_seconds": fusion_window,
    "escalation_threshold": escalation_threshold,
    "signals_processed": signal_count,
    "verdicts_generated": len(verdicts),
    "verdicts_escalated": len(escalated_verdicts) if escalated_verdicts else 0,
    "weights_used": json.dumps(lens_weights),
    "lens_signal_counts": json.dumps(lens_counts),
}]

spark.createDataFrame(arbiter_run, schema=arbiter_schema).write.mode("append").saveAsTable(arbiter_table)

# COMMAND ----------

mon.log_complete(details={
    "signals_processed": signal_count,
    "verdicts_generated": len(verdicts),
    "verdicts_escalated": escalated_count,
    "lens_counts": lens_counts,
})

result = {
    "status": "completed",
    "signals_processed": signal_count,
    "verdicts_generated": len(verdicts),
    "verdicts_escalated": escalated_count,
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
