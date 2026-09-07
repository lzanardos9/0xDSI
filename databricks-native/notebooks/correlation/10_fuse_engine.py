# Databricks notebook source
# MAGIC %md
# MAGIC # Correlation 10: Fuse Engine — Evidence Alignment & Independence Scoring
# MAGIC
# MAGIC The Fuse Engine is architecturally SEPARATE from Confluence.
# MAGIC - **Fuse** = objective evidence alignment (additive, measurable)
# MAGIC - **Confluence** = subjective decision-making (policy-driven, explainable)
# MAGIC
# MAGIC **What Fuse does:**
# MAGIC 1. Reads unprocessed UEOs (from Correlation 09)
# MAGIC 2. Aligns signals to the Entity Spine (canonical identity)
# MAGIC 3. Scores evidence INDEPENDENCE using Dempster-Shafer belief functions
# MAGIC 4. Builds causal chains (which signal preceded which, temporal ordering)
# MAGIC 5. Applies time-decay to stale evidence
# MAGIC 6. Detects MODEL DISAGREEMENT (signals that contradict each other)
# MAGIC 7. Outputs FUSED_EVIDENCE records that Confluence then reads to DECIDE
# MAGIC
# MAGIC **Dempster-Shafer Combination:**
# MAGIC Unlike Bayesian averaging (which collapses uncertainty), D-S preserves
# MAGIC independent evidence and accumulates belief without requiring priors.
# MAGIC When signals from different modalities agree → belief increases fast.
# MAGIC When signals disagree → conflict mass (K) rises and gets routed to investigation.
# MAGIC
# MAGIC **Causal Chain Construction:**
# MAGIC Signals are ordered by timestamp. If signal A preceded signal B on the same
# MAGIC entity, and B's event_type is a logical consequence of A's, they form a chain.
# MAGIC Longer chains with independent sources = higher conviction.
# MAGIC
# MAGIC **Scheduling:** Every 2 minutes (immediately after UEO builder)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("max_ueos_per_run", "2000", "Max UEOs to fuse per run")
dbutils.widgets.text("decay_half_life_minutes", "30", "Signal freshness decay half-life")
dbutils.widgets.text("conflict_threshold", "0.4", "Dempster-Shafer conflict threshold for disagreement routing")
dbutils.widgets.text("min_independence_score", "0.3", "Minimum independence for signal to count")

max_ueos = int(dbutils.widgets.get("max_ueos_per_run"))
decay_half_life = int(dbutils.widgets.get("decay_half_life_minutes"))
conflict_threshold = float(dbutils.widgets.get("conflict_threshold"))
min_independence = float(dbutils.widgets.get("min_independence_score"))
require_tables("fuse_results", "unified_evidence_objects")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import math
import uuid

# Stable namespace so fuse_id / disagreement_id are deterministic across runs
# and across processes (Python's built-in hash() is salted per-process and must
# never be used for identifiers that other tables reference).
FUSE_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "0xdsi://correlation/fuse_engine")


def make_fuse_id(ueo_id):
    return str(uuid.uuid5(FUSE_NAMESPACE, f"fuse::{ueo_id}"))


def make_disagreement_id(ueo_id, high_class, low_class):
    return str(uuid.uuid5(FUSE_NAMESPACE, f"disagree::{ueo_id}::{high_class}::{low_class}"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure Fuse Output Tables

# COMMAND ----------

fuse_table = get_table_path(cfg, "fuse_results")
disagreement_table = get_table_path(cfg, "model_disagreements")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {fuse_table} (
    fuse_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_name STRING,
    -- Dempster-Shafer belief masses
    belief_threat DOUBLE NOT NULL,
    belief_benign DOUBLE NOT NULL,
    plausibility_threat DOUBLE NOT NULL,
    uncertainty_mass DOUBLE NOT NULL,
    conflict_mass DOUBLE NOT NULL,
    -- Combined scores
    ds_combined_score DOUBLE NOT NULL,
    independence_weighted_score DOUBLE NOT NULL,
    -- Signal analysis
    total_signals INT NOT NULL,
    independent_signals INT NOT NULL,
    independence_groups INT NOT NULL,
    -- Causal chain
    causal_chain_length INT DEFAULT 0,
    causal_chain_events ARRAY<STRING>,
    kill_chain_progression STRING,
    temporal_span_minutes DOUBLE DEFAULT 0.0,
    -- Freshness
    avg_signal_age_minutes DOUBLE,
    freshness_factor DOUBLE DEFAULT 1.0,
    -- Disagreement
    has_disagreement BOOLEAN DEFAULT false,
    disagreement_type STRING,
    disagreeing_lenses ARRAY<STRING>,
    -- Entity context from spine
    entity_centrality DOUBLE DEFAULT 0.0,
    entity_is_high_value BOOLEAN DEFAULT false,
    -- Status
    confluence_consumed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {disagreement_table} (
    disagreement_id STRING NOT NULL,
    fuse_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_name STRING,
    -- What disagrees
    disagreement_type STRING NOT NULL,
    high_signal_class STRING,
    high_signal_score DOUBLE,
    low_signal_class STRING,
    low_signal_score DOUBLE,
    score_gap DOUBLE NOT NULL,
    conflict_mass DOUBLE NOT NULL,
    -- Why it matters
    entity_is_high_value BOOLEAN DEFAULT false,
    asset_criticality STRING,
    explanation STRING,
    -- Routing
    routed_to STRING DEFAULT 'investigation_queue',
    priority STRING DEFAULT 'P2',
    -- Resolution
    resolved BOOLEAN DEFAULT false,
    resolution STRING,
    resolved_by STRING,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dempster-Shafer Combination Logic
# MAGIC
# MAGIC For each signal, we define:
# MAGIC - m(threat) = signal score (belief it's malicious)
# MAGIC - m(benign) = 1 - score (when applicable, otherwise 0)
# MAGIC - m(uncertainty) = what's left
# MAGIC
# MAGIC Combination rule: m12(A) = sum[B∩C=A](m1(B)*m2(C)) / (1 - K)
# MAGIC where K = sum[B∩C=∅](m1(B)*m2(C)) is the conflict mass.

# COMMAND ----------

# Independence groups: signals from same group share information (correlated)
# Signals from different groups are treated as independent evidence
INDEPENDENCE_GROUPS = {
    "cep": "pattern_detection",
    "cet": "behavioral_analysis",
    "behavioral_anomaly": "behavioral_analysis",
    "graph": "structural_analysis",
    "negative_correlation": "absence_detection",
    "ks_recall": "memory_retrieval",
    "slm_classification": "model_inference",
    "formula_score": "heuristic_scoring",
    "threat_intel": "cti_matching",
    "bytecode_semantics": "code_analysis",
}

# Within-group correlation discount (signals in same group are 60% correlated)
INTRA_GROUP_DISCOUNT = 0.4


def _ds_combine_pair(a, b):
    """
    Combine two mass functions on the frame {threat, benign} plus the
    ignorance set Theta = {threat, benign}. Each argument is a 3-tuple
    (m_threat, m_benign, m_theta) whose components sum to 1.

    Returns ((m_threat, m_benign, m_theta), conflict_k) after applying
    Dempster's rule with normalization. conflict_k is the mass assigned to
    the empty set (threat vs benign contradiction) before normalization.
    """
    a_t, a_b, a_th = a
    b_t, b_b, b_th = b

    # Conflict: mass whose intersection is empty (one says threat, other benign)
    k = a_t * b_b + a_b * b_t
    norm = 1.0 - k
    if norm <= 1e-12:
        # Total conflict: nothing survives normalization. Fall back to full
        # ignorance and report maximal conflict so it routes to investigation.
        return (0.0, 0.0, 1.0), 1.0

    # threat survives from threat∩threat, threat∩Theta, Theta∩threat
    m_t = (a_t * b_t + a_t * b_th + a_th * b_t) / norm
    # benign survives from benign∩benign, benign∩Theta, Theta∩benign
    m_b = (a_b * b_b + a_b * b_th + a_th * b_b) / norm
    # ignorance survives only from Theta∩Theta
    m_th = (a_th * b_th) / norm
    return (m_t, m_b, m_th), k


def dempster_shafer_combine(signals_with_scores):
    """
    Combine multiple evidence masses using Dempster's rule of combination
    over the frame of discernment {threat, benign}.

    Each signal contributes, using its decayed score s in [0,1] and its
    independence weight w in [0,1] as a reliability/confidence factor:
      m(threat)  = s * w        (this signal argues threat)
      m(benign)  = (1 - s) * w  (this signal argues benign)
      m(Theta)   = 1 - w        (uncertainty from limited reliability)

    Because signals can now assign mass to benign, contradictory evidence
    produces genuine conflict mass K, which drives disagreement routing.

    Returns: (belief_threat, plausibility_threat, uncertainty, conflict_mass)
      belief_threat        = lower bound on threat belief  = m(threat)
      plausibility_threat  = upper bound on threat belief  = m(threat)+m(Theta)
      uncertainty          = m(Theta)
      conflict_mass        = aggregate conflict across the combination sequence
    """
    if not signals_with_scores:
        return (0.0, 0.0, 1.0, 0.0)

    # Start vacuous: all mass on the ignorance set Theta.
    combined = (0.0, 0.0, 1.0)
    conflict_accum = 0.0

    for sig in signals_with_scores:
        s = max(0.0, min(1.0, (sig.get("decayed_score", 0.0) or 0.0)))
        w = max(0.0, min(1.0, (sig.get("independence_weight", 0.0) or 0.0)))

        evidence = (s * w, (1.0 - s) * w, 1.0 - w)
        combined, k = _ds_combine_pair(combined, evidence)
        # Probability that any combination step landed in conflict.
        conflict_accum = 1.0 - (1.0 - conflict_accum) * (1.0 - k)

    belief_threat, belief_benign, uncertainty = combined
    plausibility = belief_threat + uncertainty  # == 1 - belief_benign

    return (
        round(belief_threat, 4),
        round(plausibility, 4),
        round(uncertainty, 4),
        round(conflict_accum, 4),
    )


def compute_independence_weights(signals):
    """
    Assign independence weights based on signal class groupings.
    First signal in each group gets weight=1.0.
    Subsequent signals in same group get discounted weight.
    """
    group_counts = {}
    weighted = []

    for sig in signals:
        signal_class = sig.get("signal_class", "unknown")
        group = INDEPENDENCE_GROUPS.get(signal_class, signal_class)
        group_counts[group] = group_counts.get(group, 0) + 1

        if group_counts[group] == 1:
            weight = 1.0
        else:
            weight = INTRA_GROUP_DISCOUNT / group_counts[group]

        sig["independence_weight"] = weight
        sig["independence_group"] = group
        weighted.append(sig)

    return weighted

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load Unprocessed UEOs

# COMMAND ----------

ueo_table_path = get_table_path(cfg, "unified_evidence_objects")
ueo_signals_path = get_table_path(cfg, "ueo_signals")

with mon.time("load_ueos"):
    pending_ueos = spark.sql(f"""
        SELECT *
        FROM {ueo_table_path}
        WHERE confluence_processed = false
        ORDER BY fused_risk_score DESC
        LIMIT {max_ueos}
    """)

    ueo_count = pending_ueos.count()
    if ueo_count == 0:
        print("No pending UEOs to fuse")
        dbutils.notebook.exit(json.dumps({"status": "no_pending_ueos", "fused": 0}))

    print(f"Processing {ueo_count} pending UEOs")

    # Load their associated signals
    ueo_ids = [row.ueo_id for row in pending_ueos.select("ueo_id").collect()]
    ueo_id_list = "','".join(ueo_ids)

    signals_df = spark.sql(f"""
        SELECT *
        FROM {ueo_signals_path}
        WHERE ueo_id IN ('{ueo_id_list}')
        ORDER BY ueo_id, signal_timestamp
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Apply Dempster-Shafer Fusion Per UEO

# COMMAND ----------

with mon.time("dempster_shafer_fusion"):
    # Collect signals grouped by UEO
    signals_pd = signals_df.toPandas()
    ueos_pd = pending_ueos.toPandas()

    fuse_results = []
    disagreements = []

    for _, ueo_row in ueos_pd.iterrows():
        ueo_id = ueo_row["ueo_id"]
        entity_id = ueo_row["entity_id"]
        entity_name = ueo_row.get("entity_name", "")
        fuse_id = make_fuse_id(ueo_id)

        ueo_signals = signals_pd[signals_pd["ueo_id"] == ueo_id].to_dict("records")

        if not ueo_signals:
            continue

        # Compute independence weights
        weighted_signals = compute_independence_weights(ueo_signals)

        # Apply time decay
        now_ts = datetime.utcnow()
        for sig in weighted_signals:
            age = sig.get("decay_age_minutes", 0) or 0
            decay = math.pow(0.5, age / decay_half_life) if decay_half_life > 0 else 1.0
            sig["decayed_score"] = sig.get("raw_score", 0) * decay

        # Filter by minimum independence
        effective_signals = [s for s in weighted_signals if s["independence_weight"] >= min_independence]
        if not effective_signals:
            effective_signals = weighted_signals[:1]

        # Run Dempster-Shafer
        belief_threat, plausibility, uncertainty, conflict = dempster_shafer_combine(effective_signals)

        # Count independence groups
        groups = set(s.get("independence_group", "unknown") for s in effective_signals)
        independent_count = len(groups)

        # Independence-weighted combined score (alternative to pure D-S)
        ind_weighted = sum(
            s["decayed_score"] * s["independence_weight"]
            for s in effective_signals
        ) / max(sum(s["independence_weight"] for s in effective_signals), 0.01)

        # Causal chain: temporal ordering of signals
        sorted_sigs = sorted(effective_signals, key=lambda s: str(s.get("signal_timestamp", "")))
        causal_chain = [s.get("signal_class", "unknown") for s in sorted_sigs]

        # Kill chain progression
        stages_present = []
        for s in sorted_sigs:
            exp = s.get("explanation", "")
            if "lateral" in str(exp).lower():
                stages_present.append("lateral-movement")
            elif "credential" in str(exp).lower():
                stages_present.append("credential-access")
            elif "exfil" in str(exp).lower():
                stages_present.append("exfiltration")
            elif "persist" in str(exp).lower():
                stages_present.append("persistence")
            elif "escalat" in str(exp).lower():
                stages_present.append("privilege-escalation")

        kill_chain_str = " → ".join(dict.fromkeys(stages_present)) if stages_present else "unknown"

        # Temporal span
        timestamps = [s.get("signal_timestamp") for s in sorted_sigs if s.get("signal_timestamp")]
        if len(timestamps) >= 2:
            first_ts = min(timestamps)
            last_ts = max(timestamps)
            if hasattr(first_ts, 'timestamp') and hasattr(last_ts, 'timestamp'):
                temporal_span = (last_ts.timestamp() - first_ts.timestamp()) / 60.0
            else:
                temporal_span = 0.0
        else:
            temporal_span = 0.0

        # Freshness
        ages = [s.get("decay_age_minutes", 0) or 0 for s in effective_signals]
        avg_age = sum(ages) / max(len(ages), 1)
        freshness = math.pow(0.5, avg_age / decay_half_life) if decay_half_life > 0 else 1.0

        # Detect model disagreement
        has_disagreement = False
        disagreement_type = None
        disagreeing_lenses = []

        if len(effective_signals) >= 2:
            scores_by_class = {}
            for s in effective_signals:
                sc = s.get("signal_class", "unknown")
                scores_by_class.setdefault(sc, []).append(s["decayed_score"])

            avg_per_class = {k: sum(v) / len(v) for k, v in scores_by_class.items()}

            if len(avg_per_class) >= 2:
                max_class = max(avg_per_class, key=avg_per_class.get)
                min_class = min(avg_per_class, key=avg_per_class.get)
                gap = avg_per_class[max_class] - avg_per_class[min_class]

                if gap >= conflict_threshold:
                    has_disagreement = True
                    disagreement_type = f"{max_class}_high_vs_{min_class}_low"
                    disagreeing_lenses = [max_class, min_class]

                    disagreements.append({
                        "disagreement_id": make_disagreement_id(ueo_id, max_class, min_class),
                        "fuse_id": fuse_id,
                        "ueo_id": ueo_id,
                        "entity_id": entity_id,
                        "entity_name": entity_name,
                        "disagreement_type": disagreement_type,
                        "high_signal_class": max_class,
                        "high_signal_score": avg_per_class[max_class],
                        "low_signal_class": min_class,
                        "low_signal_score": avg_per_class[min_class],
                        "score_gap": gap,
                        "conflict_mass": conflict,
                        "entity_is_high_value": bool(ueo_row.get("entity_is_high_value", False)),
                        "asset_criticality": "high" if ueo_row.get("entity_is_high_value") else "standard",
                        "explanation": f"{max_class} scores {avg_per_class[max_class]:.2f} but {min_class} scores {avg_per_class[min_class]:.2f}. Gap={gap:.2f}, conflict_mass={conflict:.2f}. Investigate — do not average away.",
                        "routed_to": "investigation_queue",
                        "priority": "P2" if gap >= 0.5 else "P3",
                        "resolved": False,
                    })

        fuse_results.append({
            "fuse_id": fuse_id,
            "ueo_id": ueo_id,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "belief_threat": belief_threat,
            "belief_benign": 1.0 - plausibility,
            "plausibility_threat": plausibility,
            "uncertainty_mass": uncertainty,
            "conflict_mass": conflict,
            "ds_combined_score": belief_threat,
            "independence_weighted_score": ind_weighted,
            "total_signals": len(effective_signals),
            "independent_signals": independent_count,
            "independence_groups": independent_count,
            "causal_chain_length": len(causal_chain),
            "causal_chain_events": causal_chain,
            "kill_chain_progression": kill_chain_str,
            "temporal_span_minutes": temporal_span,
            "avg_signal_age_minutes": avg_age,
            "freshness_factor": freshness,
            "has_disagreement": has_disagreement,
            "disagreement_type": disagreement_type,
            "disagreeing_lenses": disagreeing_lenses if disagreeing_lenses else None,
            "entity_centrality": float(ueo_row.get("entity_centrality", 0) or 0),
            "entity_is_high_value": bool(ueo_row.get("entity_is_high_value", False)),
            "confluence_consumed": False,
        })

    print(f"Fused {len(fuse_results)} UEOs, {len(disagreements)} disagreements detected")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Fuse Results

# COMMAND ----------

# Explicit schemas — never rely on createDataFrame inference. Inference reads
# types from the first row (so a leading None flips a column to void and the
# append fails) and cannot guarantee column order matches the Delta table.
FUSE_SCHEMA = StructType([
    StructField("fuse_id", StringType(), False),
    StructField("ueo_id", StringType(), False),
    StructField("entity_id", StringType(), False),
    StructField("entity_name", StringType(), True),
    StructField("belief_threat", DoubleType(), False),
    StructField("belief_benign", DoubleType(), False),
    StructField("plausibility_threat", DoubleType(), False),
    StructField("uncertainty_mass", DoubleType(), False),
    StructField("conflict_mass", DoubleType(), False),
    StructField("ds_combined_score", DoubleType(), False),
    StructField("independence_weighted_score", DoubleType(), False),
    StructField("total_signals", IntegerType(), False),
    StructField("independent_signals", IntegerType(), False),
    StructField("independence_groups", IntegerType(), False),
    StructField("causal_chain_length", IntegerType(), True),
    StructField("causal_chain_events", ArrayType(StringType()), True),
    StructField("kill_chain_progression", StringType(), True),
    StructField("temporal_span_minutes", DoubleType(), True),
    StructField("avg_signal_age_minutes", DoubleType(), True),
    StructField("freshness_factor", DoubleType(), True),
    StructField("has_disagreement", BooleanType(), True),
    StructField("disagreement_type", StringType(), True),
    StructField("disagreeing_lenses", ArrayType(StringType()), True),
    StructField("entity_centrality", DoubleType(), True),
    StructField("entity_is_high_value", BooleanType(), True),
    StructField("confluence_consumed", BooleanType(), True),
])

DISAGREEMENT_SCHEMA = StructType([
    StructField("disagreement_id", StringType(), False),
    StructField("fuse_id", StringType(), False),
    StructField("ueo_id", StringType(), False),
    StructField("entity_id", StringType(), False),
    StructField("entity_name", StringType(), True),
    StructField("disagreement_type", StringType(), False),
    StructField("high_signal_class", StringType(), True),
    StructField("high_signal_score", DoubleType(), True),
    StructField("low_signal_class", StringType(), True),
    StructField("low_signal_score", DoubleType(), True),
    StructField("score_gap", DoubleType(), False),
    StructField("conflict_mass", DoubleType(), False),
    StructField("entity_is_high_value", BooleanType(), True),
    StructField("asset_criticality", StringType(), True),
    StructField("explanation", StringType(), True),
    StructField("routed_to", StringType(), True),
    StructField("priority", StringType(), True),
    StructField("resolved", BooleanType(), True),
])


def _coerce(rows, schema):
    """Coerce dict values to the declared field types so the explicit schema
    never trips over ints where doubles are expected or numpy scalars."""
    typed = []
    for r in rows:
        out = {}
        for field in schema.fields:
            v = r.get(field.name)
            if v is not None:
                if isinstance(field.dataType, DoubleType):
                    v = float(v)
                elif isinstance(field.dataType, IntegerType):
                    v = int(v)
                elif isinstance(field.dataType, BooleanType):
                    v = bool(v)
                elif isinstance(field.dataType, StringType):
                    v = str(v)
            out[field.name] = v
        typed.append(out)
    return typed


with mon.time("write_fuse"):
    if fuse_results:
        fuse_df = spark.createDataFrame(_coerce(fuse_results, FUSE_SCHEMA), schema=FUSE_SCHEMA)
        fuse_df = fuse_df.withColumn("created_at", current_timestamp())
        fuse_df.write.mode("append").saveAsTable(fuse_table)

    if disagreements:
        disagree_df = spark.createDataFrame(_coerce(disagreements, DISAGREEMENT_SCHEMA), schema=DISAGREEMENT_SCHEMA)
        disagree_df = disagree_df.withColumn("created_at", current_timestamp())
        disagree_df = disagree_df.withColumn("resolution", lit(None).cast("string"))
        disagree_df = disagree_df.withColumn("resolved_by", lit(None).cast("string"))
        disagree_df = disagree_df.withColumn("resolved_at", lit(None).cast("timestamp"))
        disagree_df.write.mode("append").saveAsTable(disagreement_table)
        print(f"  Routed {len(disagreements)} model disagreements to investigation queue")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark UEOs as Fuse-Processed

# COMMAND ----------

with mon.time("mark_processed"):
    if fuse_results:
        fused_ueo_ids = [r["ueo_id"] for r in fuse_results]
        id_list = "','".join(fused_ueo_ids)
        spark.sql(f"""
            UPDATE {ueo_table_path}
            SET confluence_processed = true
            WHERE ueo_id IN ('{id_list}')
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_fused = spark.sql(f"SELECT COUNT(*) FROM {fuse_table}").first()[0]
total_disagreements = spark.sql(f"SELECT COUNT(*) FROM {disagreement_table} WHERE resolved = false").first()[0]

print(f"\nFuse Engine Summary:")
print(f"  Fused this run:         {len(fuse_results)}")
print(f"  Disagreements detected: {len(disagreements)}")
print(f"  Total fuse records:     {total_fused}")
print(f"  Open disagreements:     {total_disagreements}")

result = {
    "notebook": "10_fuse_engine",
    "status": "completed",
    "ueos_fused": len(fuse_results),
    "disagreements_routed": len(disagreements),
    "total_fused": total_fused,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
