# Databricks notebook source
# MAGIC %md
# MAGIC # Detection Confluence - Multi-Lens Fusion Engine
# MAGIC
# MAGIC Fuses signals from 7 detection lenses into unified verdicts using
# MAGIC Bayesian weighted scoring. This is the final decision layer that
# MAGIC determines whether correlated signals warrant escalation.
# MAGIC
# MAGIC **Lenses:**
# MAGIC 1. Correlation Rules (streaming CEP matches)
# MAGIC 2. Negative Correlation (absence-based detection)
# MAGIC 3. Graph Pattern Matching (entity relationship anomalies)
# MAGIC 4. Detection SLM (small language model rapid classification)
# MAGIC 5. Vector Hunting (embedding similarity to known threats)
# MAGIC 6. Formula Prioritization (risk-score weighted ranking)
# MAGIC 7. UEBA Behavioral Baseline (user/entity deviation)

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("fusion_window_seconds", "60", "Signal fusion window in seconds")
dbutils.widgets.text("escalation_threshold", "0.78", "Score threshold for verdict escalation")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
fusion_window = int(dbutils.widgets.get("fusion_window_seconds"))
escalation_threshold = float(dbutils.widgets.get("escalation_threshold"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

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

try:
    weights_df = spark.table("confluence_lens_weights").filter(
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

# Lens 1: Correlation Rules - CEP pattern matches
correlation_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'correlation_rules' as lens,
        alert_id as entity_id,
        COALESCE(confidence, 0.8) as raw_score,
        pattern_name as signal_detail,
        matched_at as signal_time,
        COALESCE(mitre_tactic, 'unknown') as kill_chain_stage
    FROM cep_pattern_matches
    WHERE matched_at >= '{cutoff_str}'
      AND processed_by_confluence = false
""")

# Lens 2: Negative Correlation - absence detections
negative_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'negative_correlation' as lens,
        entity_id,
        COALESCE(confidence_score, 0.7) as raw_score,
        rule_name as signal_detail,
        detected_at as signal_time,
        'defense-evasion' as kill_chain_stage
    FROM negative_correlation_detections
    WHERE detected_at >= '{cutoff_str}'
      AND processed_by_confluence = false
""")

# Lens 3: Graph Pattern Matching
graph_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'graph_patterns' as lens,
        source_entity as entity_id,
        anomaly_score as raw_score,
        pattern_type as signal_detail,
        detected_at as signal_time,
        COALESCE(kill_chain_phase, 'lateral-movement') as kill_chain_stage
    FROM graph_anomaly_detections
    WHERE detected_at >= '{cutoff_str}'
      AND processed_by_confluence = false
""")

# Lens 4: Detection SLM classifications
slm_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'detection_slm' as lens,
        alert_id as entity_id,
        confidence as raw_score,
        classification as signal_detail,
        classified_at as signal_time,
        COALESCE(mitre_tactic, 'unknown') as kill_chain_stage
    FROM slm_classifications
    WHERE classified_at >= '{cutoff_str}'
      AND classification != 'benign'
      AND processed_by_confluence = false
""")

# Lens 5: Vector Hunting - similarity matches
vector_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'vector_hunting' as lens,
        alert_id as entity_id,
        similarity_score as raw_score,
        matched_threat_pattern as signal_detail,
        matched_at as signal_time,
        COALESCE(kill_chain_phase, 'unknown') as kill_chain_stage
    FROM vector_hunt_matches
    WHERE matched_at >= '{cutoff_str}'
      AND similarity_score >= 0.75
      AND processed_by_confluence = false
""")

# Lens 6: Formula Prioritization - risk-weighted scores
formula_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'formula_prioritization' as lens,
        entity_id,
        priority_score / 100.0 as raw_score,
        priority_reason as signal_detail,
        scored_at as signal_time,
        'unknown' as kill_chain_stage
    FROM formula_priority_scores
    WHERE scored_at >= '{cutoff_str}'
      AND priority_score >= 70
      AND processed_by_confluence = false
""")

# Lens 7: UEBA Behavioral deviations
ueba_signals = spark.sql(f"""
    SELECT
        id as signal_id,
        'ueba_behavioral' as lens,
        user_id as entity_id,
        risk_score / 100.0 as raw_score,
        anomaly_type as signal_detail,
        detected_at as signal_time,
        COALESCE(kill_chain_phase, 'initial-access') as kill_chain_stage
    FROM user_behavior_anomalies
    WHERE detected_at >= '{cutoff_str}'
      AND risk_score >= 60
      AND processed_by_confluence = false
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Union All Signals and Compute Fused Scores

# COMMAND ----------

all_signals = (
    correlation_signals
    .unionByName(negative_signals, allowMissingColumns=True)
    .unionByName(graph_signals, allowMissingColumns=True)
    .unionByName(slm_signals, allowMissingColumns=True)
    .unionByName(vector_signals, allowMissingColumns=True)
    .unionByName(formula_signals, allowMissingColumns=True)
    .unionByName(ueba_signals, allowMissingColumns=True)
)

signal_count = all_signals.count()
print(f"Collected {signal_count} signals from all lenses in {fusion_window}s window")

if signal_count == 0:
    print("No signals to fuse. Exiting.")
    dbutils.notebook.exit(json.dumps({"status": "idle", "signals": 0, "verdicts": 0}))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Entity-Level Fusion (Bayesian Weighted Scoring)

# COMMAND ----------

signals_collected = all_signals.collect()

entity_signals = {}
for row in signals_collected:
    entity_id = row.entity_id
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

# COMMAND ----------

def compute_fused_score(signals, weights):
    """
    Bayesian fusion: weighted combination with diversity bonus.
    Multiple independent lenses agreeing increases confidence non-linearly.
    """
    if not signals:
        return 0.0

    weighted_sum = 0.0
    total_weight = 0.0
    contributing_lenses = set()

    for sig in signals:
        lens = sig["lens"]
        weight = weights.get(lens, 0.05)
        score = min(1.0, max(0.0, sig["raw_score"]))
        weighted_sum += weight * score
        total_weight += weight
        contributing_lenses.add(lens)

    if total_weight == 0:
        return 0.0

    base_score = weighted_sum / total_weight

    # Diversity bonus: more lenses agreeing = higher confidence
    lens_count = len(contributing_lenses)
    diversity_factor = 1.0 + (lens_count - 1) * 0.067

    fused = min(1.0, base_score * diversity_factor)
    return round(fused, 4)


def determine_priority(fused_score, lens_count):
    if fused_score >= 0.9 and lens_count >= 3:
        return "P1"
    elif fused_score >= 0.78:
        return "P2"
    elif fused_score >= 0.6:
        return "P3"
    else:
        return "P4"


def determine_kill_chain(signals):
    stage_order = [
        "reconnaissance", "resource-development", "initial-access",
        "execution", "persistence", "privilege-escalation",
        "defense-evasion", "credential-access", "discovery",
        "lateral-movement", "collection", "command-and-control",
        "exfiltration", "impact"
    ]
    stages = [s["kill_chain_stage"] for s in signals if s["kill_chain_stage"] != "unknown"]
    if not stages:
        return "unknown"

    max_idx = -1
    for stage in stages:
        if stage in stage_order:
            idx = stage_order.index(stage)
            max_idx = max(max_idx, idx)

    return stage_order[max_idx] if max_idx >= 0 else stages[0]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Verdicts

# COMMAND ----------

verdicts = []
lineage_edges = []
now = datetime.utcnow()

for entity_id, signals in entity_signals.items():
    fused_score = compute_fused_score(signals, lens_weights)
    contributing_lenses = list(set(s["lens"] for s in signals))
    lens_count = len(contributing_lenses)
    priority = determine_priority(fused_score, lens_count)
    kill_chain = determine_kill_chain(signals)

    verdict_id = str(uuid.uuid4())

    verdicts.append({
        "id": verdict_id,
        "entity_id": entity_id,
        "fused_score": fused_score,
        "priority": priority,
        "contributing_lenses": json.dumps(contributing_lenses),
        "lens_count": lens_count,
        "kill_chain_stage": kill_chain,
        "signal_count": len(signals),
        "arbiter_mode": "bayesian_weighted",
        "escalated": fused_score >= escalation_threshold,
        "verdict_time": now,
        "fusion_window_seconds": fusion_window,
        "weights_snapshot": json.dumps(lens_weights),
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

print(f"Generated {len(verdicts)} verdicts from {signal_count} signals")
print(f"Escalated: {sum(1 for v in verdicts if v['escalated'])}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Verdicts and Lineage

# COMMAND ----------

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
        StructField("weights_snapshot", StringType(), True),
    ])

    verdicts_df = spark.createDataFrame(verdicts, schema=verdict_schema)
    verdicts_df.write.mode("append").saveAsTable("confluence_verdicts")

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
    lineage_df.write.mode("append").saveAsTable("confluence_lineage")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Escalate High-Priority Verdicts to Alert Pipeline

# COMMAND ----------

escalated_verdicts = [v for v in verdicts if v["escalated"]]

if escalated_verdicts:
    alert_rows = []
    for v in escalated_verdicts:
        alert_rows.append({
            "id": str(uuid.uuid4()),
            "title": f"Confluence Verdict: {v['priority']} - {v['kill_chain_stage']} ({v['lens_count']} lenses)",
            "description": f"Multi-lens fusion detected threat on entity {v['entity_id']}. "
                          f"Fused score: {v['fused_score']:.2f}, "
                          f"Contributing: {v['contributing_lenses']}",
            "severity": "critical" if v["priority"] == "P1" else "high",
            "status": "new",
            "source": "detection_confluence",
            "confidence": v["fused_score"],
            "entity_id": v["entity_id"],
            "mitre_tactic": v["kill_chain_stage"],
            "confluence_verdict_id": v["id"],
            "created_at": now,
        })

    alert_schema = StructType([
        StructField("id", StringType(), False),
        StructField("title", StringType(), False),
        StructField("description", StringType(), False),
        StructField("severity", StringType(), False),
        StructField("status", StringType(), False),
        StructField("source", StringType(), False),
        StructField("confidence", DoubleType(), False),
        StructField("entity_id", StringType(), True),
        StructField("mitre_tactic", StringType(), True),
        StructField("confluence_verdict_id", StringType(), True),
        StructField("created_at", TimestampType(), False),
    ])

    alerts_df = spark.createDataFrame(alert_rows, schema=alert_schema)
    alerts_df.write.mode("append").saveAsTable("alerts")
    print(f"Escalated {len(alert_rows)} alerts from confluence verdicts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark Processed Signals

# COMMAND ----------

signal_ids = [s["signal_id"] for signals in entity_signals.values() for s in signals]

if signal_ids:
    tables_to_update = [
        "cep_pattern_matches",
        "negative_correlation_detections",
        "graph_anomaly_detections",
        "slm_classifications",
        "vector_hunt_matches",
        "formula_priority_scores",
        "user_behavior_anomalies",
    ]

    for table in tables_to_update:
        try:
            spark.sql(f"""
                UPDATE {table}
                SET processed_by_confluence = true
                WHERE id IN ({','.join(f"'{sid}'" for sid in signal_ids[:500])})
            """)
        except Exception:
            pass

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Arbiter Run for Audit

# COMMAND ----------

arbiter_run = {
    "id": str(uuid.uuid4()),
    "run_time": now,
    "fusion_window_seconds": fusion_window,
    "escalation_threshold": escalation_threshold,
    "signals_processed": signal_count,
    "verdicts_generated": len(verdicts),
    "verdicts_escalated": len(escalated_verdicts),
    "weights_used": json.dumps(lens_weights),
    "lens_signal_counts": json.dumps({
        lens: sum(1 for sigs in entity_signals.values() for s in sigs if s["lens"] == lens)
        for lens in set(s["lens"] for sigs in entity_signals.values() for s in sigs)
    }),
}

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

arbiter_df = spark.createDataFrame([arbiter_run], schema=arbiter_schema)
arbiter_df.write.mode("append").saveAsTable("confluence_arbiter_runs")

# COMMAND ----------

# Update agent status
spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'detection_confluence' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {signal_count} as events_processed,
        {len(escalated_verdicts)} as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {
    "status": "completed",
    "signals_processed": signal_count,
    "verdicts_generated": len(verdicts),
    "verdicts_escalated": len(escalated_verdicts),
    "run_time": now.isoformat(),
}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
