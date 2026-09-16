# Databricks notebook source
# MAGIC %md
# MAGIC # Correlation 09: Unified Evidence Object (UEO) Builder
# MAGIC
# MAGIC The UEO is the formal evidence container for Confluence.
# MAGIC It takes raw signal contributions from all detection lenses and packages them
# MAGIC into a single, lineage-preserving object per (entity, time_window) pair.
# MAGIC
# MAGIC **What a UEO contains:**
# MAGIC - Entity spine reference (who/what is this about)
# MAGIC - All contributing signals with source, independence flags, freshness
# MAGIC - Causal chain links (which signal preceded which)
# MAGIC - KS recall results (what this resembles)
# MAGIC - Time-decay weighted scores per signal class
# MAGIC - Raw event IDs for full audit trail
# MAGIC
# MAGIC **Architecture position:** BETWEEN detection lenses AND Confluence decision.
# MAGIC ```
# MAGIC  [CEP] [CET] [Graph] [Neg.Corr] [KS Recall] [SLM] [Formula]
# MAGIC                        │
# MAGIC                  ┌─────▼──────┐
# MAGIC                  │  UEO Build  │  ← this notebook
# MAGIC                  └─────┬──────┘
# MAGIC                        │
# MAGIC                  ┌─────▼──────────┐
# MAGIC                  │   Confluence    │  (reads UEOs to decide)
# MAGIC                  └────────────────┘
# MAGIC ```
# MAGIC
# MAGIC **Why separate from Confluence:**
# MAGIC - UEO is evidence assembly (objective, additive)
# MAGIC - Confluence is decision-making (subjective, policy-driven)
# MAGIC - UEO can be replayed with different Confluence thresholds
# MAGIC - UEO preserves signal independence for Dempster-Shafer reasoning
# MAGIC
# MAGIC **Scheduling:** Every 2 minutes (runs after detection lenses, before Confluence)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("window_seconds", "300", "Evidence aggregation window (seconds)")
dbutils.widgets.text("lookback_minutes", "10", "Lookback for new signals")
dbutils.widgets.text("decay_half_life_minutes", "30", "Signal decay half-life")
dbutils.widgets.text("min_signals_for_ueo", "2", "Minimum signals to form a UEO")

window_seconds = int(dbutils.widgets.get("window_seconds"))
lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
decay_half_life = int(dbutils.widgets.get("decay_half_life_minutes"))
min_signals = int(dbutils.widgets.get("min_signals_for_ueo"))
require_tables("unified_evidence_objects", "alerts", "entity_spine")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import math
import uuid

from contracts import DETECTION_SIGNAL_COLUMNS, DETECTION_SIGNAL_CLASSES
# Invalidating a finding whose evidence changed is a real lifecycle transition,
# so it goes through the shared state machine, never an ad-hoc status edit.
from finding_revision import (
    initial_revision, next_revision, invalidate_revision,
    is_terminal, REVISION_COLUMNS,
)

# Identity stamped onto every finding revision this run emits (REV2-05): a fresh
# execution_id per invocation keeps two evidence runs from collapsing.
_run_identity = {
    "execution_id": str(uuid.uuid4()),
    "run_id": cfg.tags.get("job_run_id", "interactive") if hasattr(cfg, "tags") else "interactive",
    "producer": "correlation_09_unified_evidence_object",
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure UEO Table

# COMMAND ----------

ueo_table = get_table_path(cfg, "unified_evidence_objects")
ueo_signals_table = get_table_path(cfg, "ueo_signals")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ueo_table} (
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_type STRING,
    entity_name STRING,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    -- Aggregated scores
    fused_risk_score DOUBLE NOT NULL,
    max_signal_score DOUBLE,
    signal_count INT NOT NULL,
    independent_signal_count INT NOT NULL,
    -- Signal class presence flags
    has_cep BOOLEAN DEFAULT false,
    has_cet BOOLEAN DEFAULT false,
    has_graph BOOLEAN DEFAULT false,
    has_negative_correlation BOOLEAN DEFAULT false,
    has_ks_recall BOOLEAN DEFAULT false,
    has_model_score BOOLEAN DEFAULT false,
    has_behavioral BOOLEAN DEFAULT false,
    -- Disagreement metrics
    disagreement_score DOUBLE DEFAULT 0.0,
    min_signal_score DOUBLE,
    score_variance DOUBLE DEFAULT 0.0,
    -- Causal chain
    causal_chain ARRAY<STRING>,
    kill_chain_stage STRING,
    -- KS context
    ks_similar_incidents INT DEFAULT 0,
    ks_prior_suppressions INT DEFAULT 0,
    ks_best_match_id STRING,
    ks_best_match_similarity DOUBLE,
    -- Entity context
    entity_centrality DOUBLE DEFAULT 0.0,
    entity_is_high_value BOOLEAN DEFAULT false,
    entity_is_service_account BOOLEAN DEFAULT false,
    -- Lineage
    contributing_event_ids ARRAY<STRING>,
    contributing_alert_ids ARRAY<STRING>,
    -- Status
    confluence_processed BOOLEAN DEFAULT false,
    confluence_verdict_id STRING,
    -- Revision bookkeeping: ueo_id is content-derived from (entity, window), so
    -- when new signals arrive for an existing entity/window the object is
    -- upserted and `revision` is bumped instead of the late evidence being
    -- dropped. `updated_at` tracks the last upsert.
    revision INT DEFAULT 1,
    updated_at TIMESTAMP DEFAULT current_timestamp(),
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {ueo_signals_table} (
    signal_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    signal_class STRING NOT NULL,
    signal_source STRING NOT NULL,
    raw_score DOUBLE NOT NULL,
    decayed_score DOUBLE NOT NULL,
    independence_weight DOUBLE DEFAULT 1.0,
    signal_timestamp TIMESTAMP NOT NULL,
    decay_age_minutes DOUBLE,
    source_event_ids ARRAY<STRING>,
    source_alert_id STRING,
    explanation STRING,
    metadata STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Existing deployments predate the revision columns; add them idempotently so
# the upsert MERGE below can bump `revision` on late-arriving evidence.
for _col, _decl in (("revision", "INT"), ("updated_at", "TIMESTAMP")):
    try:
        _existing = [c.name for c in spark.table(ueo_table).schema.fields]
        if _col not in _existing:
            spark.sql(f"ALTER TABLE {ueo_table} ADD COLUMN {_col} {_decl}")
            if _col == "revision":
                spark.sql(f"UPDATE {ueo_table} SET revision = 1 WHERE revision IS NULL")
    except Exception as e:
        mon.log_warning(f"UEO revision-column ensure failed for '{_col}': {str(e)[:200]}")

# Explicit schema for finding-revision rows: prev_revision/action/supersedes are
# None on an initial row, so inference would flip them to void and the append
# would fail.
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
    """Append immutable finding revisions to the durable ledger, ordered to the
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


def _invalidate_findings(ueo_ids):
    """WITHDRAW the still-live finding each revised-and-bound UEO produced.

    A finding rides on exactly one evidence object (finding_id == ueo_id), so
    when that object gains new signals the prior assertion — and any approval
    bound to its revision — must fall. Reads the latest revision per finding and
    appends a WITHDRAW for any that is not already terminal; findings with no
    revision yet, or already terminal, are left alone. Returns the count."""
    if not ueo_ids:
        return 0
    id_list = ", ".join("'" + str(u).replace("'", "''") + "'" for u in ueo_ids)
    try:
        latest = spark.sql(f"""
            WITH ranked AS (
                SELECT *, ROW_NUMBER() OVER (
                    PARTITION BY finding_id ORDER BY revision DESC
                ) AS _rn
                FROM {get_table_path(cfg, "finding_revisions")}
                WHERE finding_id IN ({id_list})
            )
            SELECT * FROM ranked WHERE _rn = 1
        """).collect()
    except Exception as e:
        if any(m in str(e) for m in _MISSING_TABLE_MARKERS):
            return 0
        raise

    produced_at = datetime.utcnow().isoformat()
    new_rows = []
    for row in latest:
        d = row.asDict()
        prev = {c: d.get(c) for c in REVISION_COLUMNS}
        if is_terminal(prev.get("state")):
            continue
        new_rows.append(invalidate_revision(prev, _run_identity, produced_at))
    _write_finding_revisions(new_rows)
    return len(new_rows)

# COMMAND ----------

# Independence matrix: signals from different classes are considered independent
# Signals from the same class are partially correlated
SIGNAL_CLASSES = {
    "cep": {"independence_group": "pattern", "base_weight": 1.0},
    "cet": {"independence_group": "behavioral", "base_weight": 0.9},
    "graph": {"independence_group": "structural", "base_weight": 0.95},
    "negative_correlation": {"independence_group": "absence", "base_weight": 0.85},
    "ks_recall": {"independence_group": "memory", "base_weight": 0.7},
    "slm_classification": {"independence_group": "model", "base_weight": 0.8},
    "formula_score": {"independence_group": "heuristic", "base_weight": 0.75},
    "behavioral_anomaly": {"independence_group": "behavioral", "base_weight": 0.9},
    "threat_intel": {"independence_group": "cti", "base_weight": 0.85},
}

# The lens weight table above and the harvest below both speak the shared
# vocabulary declared in contracts. If they ever drift apart this fails loudly
# at startup instead of quietly mislabeling signals downstream.
assert set(SIGNAL_CLASSES).issubset(set(DETECTION_SIGNAL_CLASSES)), (
    "SIGNAL_CLASSES contains classes not declared in contracts.DETECTION_SIGNAL_CLASSES: "
    f"{sorted(set(SIGNAL_CLASSES) - set(DETECTION_SIGNAL_CLASSES))}"
)


def compute_decay(age_minutes: float, half_life: float) -> float:
    """Exponential decay: signal strength decreases with age."""
    return math.pow(0.5, age_minutes / half_life)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Harvest Recent Signals from Detection Lenses

# COMMAND ----------

cutoff = datetime.utcnow() - timedelta(minutes=lookback_minutes)
now = datetime.utcnow()

# Each detection lens declares ONLY (1) the table it lives in and (2) a SELECT
# that maps its own private columns onto the canonical detection-signal shape
# (contracts.DETECTION_SIGNAL_COLUMNS). This list is the single place the
# builder is coupled to any lens's private schema; everything downstream speaks
# the canonical columns. `{table}`/`{cutoff}` are filled in per lens below.
LENS_SPECS = [
    ("cep_pattern_matches", """
        SELECT
            id AS source_alert_id,
            COALESCE(entity_id, pattern_name) AS entity_ref,
            'cep' AS signal_class,
            'cep_engine' AS signal_source,
            CAST(confidence AS DOUBLE) AS raw_score,
            matched_at AS signal_timestamp,
            matched_events AS source_event_ids,
            CONCAT('CEP: ', pattern_name, ' (', severity, ')') AS explanation
        FROM {table}
        WHERE matched_at > '{cutoff}'
    """),
    ("user_behavior_anomalies", """
        SELECT
            id AS source_alert_id,
            COALESCE(user_id, entity_id) AS entity_ref,
            'behavioral_anomaly' AS signal_class,
            'ueba_engine' AS signal_source,
            CAST(anomaly_score AS DOUBLE) AS raw_score,
            detected_at AS signal_timestamp,
            CAST(NULL AS ARRAY<STRING>) AS source_event_ids,
            CONCAT('UEBA: ', anomaly_type, ' risk=', risk_level) AS explanation
        FROM {table}
        WHERE detected_at > '{cutoff}'
    """),
    ("correlation_matches", """
        SELECT
            id AS source_alert_id,
            COALESCE(target_entity, source_entity) AS entity_ref,
            'graph' AS signal_class,
            'correlation_engine' AS signal_source,
            CAST(COALESCE(confidence_score, 0.7) AS DOUBLE) AS raw_score,
            matched_at AS signal_timestamp,
            matched_event_ids AS source_event_ids,
            CONCAT('Correlation: ', rule_name) AS explanation
        FROM {table}
        WHERE matched_at > '{cutoff}'
    """),
    ("alerts", """
        SELECT
            id AS source_alert_id,
            COALESCE(entity_id, source_ip, username) AS entity_ref,
            CASE
                WHEN source LIKE '%slm%' THEN 'slm_classification'
                WHEN source LIKE '%formula%' THEN 'formula_score'
                ELSE 'slm_classification'
            END AS signal_class,
            COALESCE(source, 'detection') AS signal_source,
            CAST(COALESCE(confidence_score, 0.5) AS DOUBLE) AS raw_score,
            created_at AS signal_timestamp,
            CAST(NULL AS ARRAY<STRING>) AS source_event_ids,
            CONCAT(title, ' [', severity, ']') AS explanation
        FROM {table}
        WHERE created_at > '{cutoff}'
          AND status NOT IN ('duplicate', 'closed', 'resolved')
    """),
    ("negative_correlation_detections", """
        SELECT
            id AS source_alert_id,
            COALESCE(entity_id, monitored_entity) AS entity_ref,
            'negative_correlation' AS signal_class,
            'negative_engine' AS signal_source,
            CAST(COALESCE(severity_score, 0.7) AS DOUBLE) AS raw_score,
            detected_at AS signal_timestamp,
            CAST(NULL AS ARRAY<STRING>) AS source_event_ids,
            CONCAT('Absence: ', rule_name, ' - ', description) AS explanation
        FROM {table}
        WHERE detected_at > '{cutoff}'
    """),
]

# Markers that mean "this lens simply isn't deployed here" — safe to skip. Any
# OTHER error (a renamed column, a type change) is real schema drift.
_MISSING_TABLE_MARKERS = (
    "TABLE_OR_VIEW_NOT_FOUND", "PATH_NOT_FOUND", "DELTA_TABLE_NOT_FOUND",
    "does not exist", "cannot be found",
)


def project_to_canonical(df):
    """Force a lens onto the canonical detection-signal shape, selected BY NAME.

    Selecting by name means a lens missing a canonical column raises here — which
    is exactly the drift we want surfaced, not swallowed — and it makes the later
    union order-independent.
    """
    return df.select(*[col(c) for c in DETECTION_SIGNAL_COLUMNS])


with mon.time("harvest_signals"):
    all_signals = []
    healthy_lenses = []       # queried AND projected onto the canonical shape
    failed_lenses = []        # a real fault: query error or schema drift
    not_deployed_lenses = []  # table absent — legitimate in a partial deployment

    for table_key, sql_template in LENS_SPECS:
        table_path = get_table_path(cfg, table_key)
        try:
            raw = spark.sql(sql_template.format(table=table_path, cutoff=cutoff.isoformat()))
        except Exception as e:
            msg = str(e)
            # A missing lens table is expected in a partial deployment and is
            # recorded, not treated as a fault. Anything else is a real problem
            # and is LOGGED (never swallowed) so a broken lens is visible.
            if any(m in msg for m in _MISSING_TABLE_MARKERS):
                not_deployed_lenses.append(table_key)
                continue
            failed_lenses.append(table_key)
            mon.log_error(e, context=f"UEO harvest: lens '{table_key}' query failed")
            continue
        try:
            all_signals.append(project_to_canonical(raw))
            healthy_lenses.append(table_key)
        except Exception as e:
            # A renamed/removed canonical column is schema drift — a real fault
            # that would otherwise silently drop this lens's whole contribution.
            failed_lenses.append(table_key)
            mon.log_error(
                e,
                context=(
                    f"UEO harvest: lens '{table_key}' no longer matches the canonical "
                    f"detection-signal shape ({', '.join(DETECTION_SIGNAL_COLUMNS)})"
                ),
            )

    # Health verdict. A lens fault or a total wipe-out is NEVER reported as a
    # normal empty run:
    #   HEALTHY     — every present lens harvested.
    #   DEGRADED    — at least one present lens harvested, but another faulted.
    #   UNAVAILABLE — no lens produced a usable dataset at all (every present
    #                 lens faulted, or none is deployed): the evidence layer is
    #                 blind and that must be surfaced, not hidden behind "0 signals".
    if not all_signals:
        harvest_status = "UNAVAILABLE"
    elif failed_lenses:
        harvest_status = "DEGRADED"
    else:
        harvest_status = "HEALTHY"

    harvest_health = {
        "status": harvest_status,
        "lenses_total": len(LENS_SPECS),
        "lenses_healthy": healthy_lenses,
        "lenses_failed": failed_lenses,
        "lenses_not_deployed": not_deployed_lenses,
    }

    if harvest_status == "UNAVAILABLE":
        # Every-lens-faulted is an incident; nothing-deployed is a
        # misconfiguration. Neither is a healthy empty run.
        if failed_lenses:
            mon.log_error(
                RuntimeError(f"UEO harvest UNAVAILABLE: every present lens faulted: {failed_lenses}"),
                context="UEO harvest health",
            )
        else:
            mon.log_warning(
                "UEO harvest UNAVAILABLE: no detection lens is deployed or queryable",
                details=json.dumps(harvest_health),
            )
        dbutils.notebook.exit(json.dumps({
            "status": "harvest_unavailable",
            "ueos_created": 0,
            "harvest_health": harvest_health,
        }))

    # Combine BY NAME so column-order drift can never silently mis-map a lens.
    combined_signals = all_signals[0]
    for s in all_signals[1:]:
        combined_signals = combined_signals.unionByName(s)
    signal_count = combined_signals.count()

    if harvest_status == "DEGRADED":
        mon.log_warning(
            f"UEO harvest DEGRADED: {len(failed_lenses)} of {len(LENS_SPECS)} lenses faulted: {failed_lenses}",
            details=json.dumps(harvest_health),
        )
    print(
        f"UEO harvest {harvest_status}: {signal_count} signals from "
        f"{len(healthy_lenses)}/{len(LENS_SPECS)} lenses "
        f"(failed={failed_lenses}, not_deployed={not_deployed_lenses})"
    )

    if signal_count == 0:
        # Lenses are healthy but produced nothing in-window: a valid state, but
        # reported WITH its health rather than as an implicit "normal" no-op.
        dbutils.notebook.exit(json.dumps({
            "status": "no_signals",
            "ueos_created": 0,
            "harvest_health": harvest_health,
        }))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Resolve Signals to Entity Spine

# COMMAND ----------

spine_table_path = get_table_path(cfg, "entity_spine")

with mon.time("resolve_to_spine"):
    try:
        spine_lookup = spark.table(spine_table_path).select(
            col("entity_id"), col("canonical_name"), col("entity_type"),
            col("centrality_pagerank").alias("entity_centrality"),
            col("is_high_value").alias("entity_is_high_value"),
            col("is_service_account").alias("entity_is_service_account"),
        )

        signals_with_spine = (
            combined_signals.alias("sig")
            .join(
                spine_lookup.alias("sp"),
                col("sig.entity_ref") == col("sp.canonical_name"),
                "left"
            )
            .select(
                col("sig.*"),
                coalesce(col("sp.entity_id"), md5(col("sig.entity_ref"))).alias("entity_id"),
                coalesce(col("sp.entity_type"), lit("unknown")).alias("entity_type"),
                col("sig.entity_ref").alias("entity_name"),
                coalesce(col("sp.entity_centrality"), lit(0.0)).alias("entity_centrality"),
                coalesce(col("sp.entity_is_high_value"), lit(False)).alias("entity_is_high_value"),
                coalesce(col("sp.entity_is_service_account"), lit(False)).alias("entity_is_service_account"),
            )
        )
    except Exception:
        # Spine not yet populated; use entity_ref as-is
        signals_with_spine = (
            combined_signals
            .withColumn("entity_id", md5(col("entity_ref")))
            .withColumn("entity_type", lit("unknown"))
            .withColumn("entity_name", col("entity_ref"))
            .withColumn("entity_centrality", lit(0.0))
            .withColumn("entity_is_high_value", lit(False))
            .withColumn("entity_is_service_account", lit(False))
        )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build UEOs: Group by Entity + Time Window

# COMMAND ----------

with mon.time("build_ueos"):
    # Assign time windows
    windowed = signals_with_spine.withColumn(
        "window_start",
        window(col("signal_timestamp"), f"{window_seconds} seconds").start
    ).withColumn(
        "window_end",
        window(col("signal_timestamp"), f"{window_seconds} seconds").end
    )

    # Compute decay per signal
    windowed = windowed.withColumn(
        "age_minutes",
        (unix_timestamp(current_timestamp()) - unix_timestamp(col("signal_timestamp"))) / 60.0
    ).withColumn(
        "decayed_score",
        col("raw_score") * pow(lit(0.5), col("age_minutes") / lit(decay_half_life))
    )

    # Group by entity + window
    ueo_groups = (
        windowed
        .groupBy("entity_id", "entity_type", "entity_name", "window_start", "window_end",
                 "entity_centrality", "entity_is_high_value", "entity_is_service_account")
        .agg(
            count("*").alias("signal_count"),
            max("decayed_score").alias("max_signal_score"),
            min("decayed_score").alias("min_signal_score"),
            avg("decayed_score").alias("avg_signal_score"),
            stddev("decayed_score").alias("score_stddev"),
            # Signal class presence
            max(when(col("signal_class") == "cep", True).otherwise(False)).alias("has_cep"),
            max(when(col("signal_class") == "cet", True).otherwise(False)).alias("has_cet"),
            max(when(col("signal_class") == "graph", True).otherwise(False)).alias("has_graph"),
            max(when(col("signal_class") == "negative_correlation", True).otherwise(False)).alias("has_negative_correlation"),
            max(when(col("signal_class") == "ks_recall", True).otherwise(False)).alias("has_ks_recall"),
            max(when(col("signal_class").isin("slm_classification", "formula_score"), True).otherwise(False)).alias("has_model_score"),
            max(when(col("signal_class") == "behavioral_anomaly", True).otherwise(False)).alias("has_behavioral"),
            # Independence: count distinct signal classes (different groups = independent)
            countDistinct("signal_class").alias("independent_signal_count"),
            # Collect lineage
            collect_set("source_alert_id").alias("contributing_alert_ids"),
            flatten(collect_set(coalesce(col("source_event_ids"), array()))).alias("contributing_event_ids"),
        )
        .filter(col("signal_count") >= min_signals)
    )

    # Compute fused risk score (Dempster-Shafer inspired combination)
    # For independent signals: combined = 1 - product(1 - score_i)
    # Approximation using avg + diversity bonus
    ueos = (
        ueo_groups
        # Canonical, deterministic identity: the same (entity, time-window) always
        # resolves to the same ueo_id, so replays are traceable and idempotent
        # instead of minting a fresh random UUID on every run.
        .withColumn("ueo_id", sha2(concat_ws(
            "||",
            col("entity_id"),
            col("window_start").cast("string"),
            col("window_end").cast("string"),
        ), 256))
        .withColumn("fused_risk_score",
            # Base: average of decayed scores
            col("avg_signal_score") +
            # Diversity bonus: more independent signals = higher confidence
            (col("independent_signal_count") - 1) * lit(0.05) +
            # High-value entity boost
            when(col("entity_is_high_value"), lit(0.1)).otherwise(lit(0.0))
        )
        .withColumn("fused_risk_score",
            least(greatest(col("fused_risk_score"), lit(0.0)), lit(1.0))
        )
        .withColumn("disagreement_score",
            coalesce(col("score_stddev"), lit(0.0)) /
            greatest(col("avg_signal_score"), lit(0.01))
        )
        .withColumn("score_variance", coalesce(col("score_stddev") * col("score_stddev"), lit(0.0)))
        .withColumn("causal_chain", lit(None).cast("array<string>"))
        .withColumn("kill_chain_stage", lit(None).cast("string"))
        .withColumn("ks_similar_incidents", lit(0))
        .withColumn("ks_prior_suppressions", lit(0))
        .withColumn("ks_best_match_id", lit(None).cast("string"))
        .withColumn("ks_best_match_similarity", lit(None).cast("double"))
        .withColumn("confluence_processed", lit(False))
        .withColumn("confluence_verdict_id", lit(None).cast("string"))
        .withColumn("created_at", current_timestamp())
    )

    ueo_count = ueos.count()
    ueo_revised = 0
    findings_invalidated = 0
    if ueo_count > 0:
        _ueo_rows = ueos.select(
            "ueo_id", "entity_id", "entity_type", "entity_name",
            "window_start", "window_end",
            "fused_risk_score", "max_signal_score", "signal_count", "independent_signal_count",
            "has_cep", "has_cet", "has_graph", "has_negative_correlation",
            "has_ks_recall", "has_model_score", "has_behavioral",
            "disagreement_score", "min_signal_score", "score_variance",
            "causal_chain", "kill_chain_stage",
            "ks_similar_incidents", "ks_prior_suppressions",
            "ks_best_match_id", "ks_best_match_similarity",
            "entity_centrality", "entity_is_high_value", "entity_is_service_account",
            "contributing_event_ids", "contributing_alert_ids",
            "confluence_processed", "confluence_verdict_id", "created_at"
        )
        _ueo_rows.createOrReplaceTempView("_ueo_incoming")

        # A UEO is "revised" when NEW evidence arrives for an entity/window that
        # already has one: more signals, or a contributing alert not seen before.
        _changed_predicate = (
            "s.signal_count > t.signal_count "
            "OR size(array_except("
            "  COALESCE(s.contributing_alert_ids, array()), "
            "  COALESCE(t.contributing_alert_ids, array()))) > 0"
        )

        # Findings/approvals bound to a UEO become stale the moment its evidence
        # changes. Capture — BEFORE the merge clears them — the UEOs that are
        # being revised AND already had a bound Confluence verdict, so we can
        # invalidate the finding they produced.
        _to_invalidate = [
            r["ueo_id"] for r in spark.sql(f"""
                SELECT s.ueo_id
                FROM _ueo_incoming s
                JOIN {ueo_table} t ON t.ueo_id = s.ueo_id
                WHERE t.confluence_verdict_id IS NOT NULL
                  AND ({_changed_predicate})
            """).collect()
        ]

        # Upsert: bump `revision` and refresh the aggregates + lineage on new
        # evidence (and reset the Confluence binding so it is re-decided);
        # insert fresh objects at revision 1. Replays with identical evidence
        # match the predicate's negation and change nothing.
        ueo_revised = spark.sql(f"""
            SELECT COUNT(*) AS n
            FROM _ueo_incoming s JOIN {ueo_table} t ON t.ueo_id = s.ueo_id
            WHERE {_changed_predicate}
        """).first()["n"]

        spark.sql(f"""
            MERGE INTO {ueo_table} t
            USING _ueo_incoming s
            ON t.ueo_id = s.ueo_id
            WHEN MATCHED AND ({_changed_predicate}) THEN UPDATE SET
                t.fused_risk_score = s.fused_risk_score,
                t.max_signal_score = s.max_signal_score,
                t.min_signal_score = s.min_signal_score,
                t.signal_count = s.signal_count,
                t.independent_signal_count = s.independent_signal_count,
                t.has_cep = s.has_cep,
                t.has_cet = s.has_cet,
                t.has_graph = s.has_graph,
                t.has_negative_correlation = s.has_negative_correlation,
                t.has_ks_recall = s.has_ks_recall,
                t.has_model_score = s.has_model_score,
                t.has_behavioral = s.has_behavioral,
                t.disagreement_score = s.disagreement_score,
                t.score_variance = s.score_variance,
                t.contributing_event_ids = s.contributing_event_ids,
                t.contributing_alert_ids = s.contributing_alert_ids,
                t.revision = t.revision + 1,
                t.confluence_processed = false,
                t.confluence_verdict_id = NULL,
                t.updated_at = current_timestamp()
            WHEN NOT MATCHED THEN INSERT (
                ueo_id, entity_id, entity_type, entity_name, window_start, window_end,
                fused_risk_score, max_signal_score, signal_count, independent_signal_count,
                has_cep, has_cet, has_graph, has_negative_correlation,
                has_ks_recall, has_model_score, has_behavioral,
                disagreement_score, min_signal_score, score_variance,
                causal_chain, kill_chain_stage,
                ks_similar_incidents, ks_prior_suppressions,
                ks_best_match_id, ks_best_match_similarity,
                entity_centrality, entity_is_high_value, entity_is_service_account,
                contributing_event_ids, contributing_alert_ids,
                confluence_processed, confluence_verdict_id, revision, updated_at, created_at
            ) VALUES (
                s.ueo_id, s.entity_id, s.entity_type, s.entity_name, s.window_start, s.window_end,
                s.fused_risk_score, s.max_signal_score, s.signal_count, s.independent_signal_count,
                s.has_cep, s.has_cet, s.has_graph, s.has_negative_correlation,
                s.has_ks_recall, s.has_model_score, s.has_behavioral,
                s.disagreement_score, s.min_signal_score, s.score_variance,
                s.causal_chain, s.kill_chain_stage,
                s.ks_similar_incidents, s.ks_prior_suppressions,
                s.ks_best_match_id, s.ks_best_match_similarity,
                s.entity_centrality, s.entity_is_high_value, s.entity_is_service_account,
                s.contributing_event_ids, s.contributing_alert_ids,
                s.confluence_processed, s.confluence_verdict_id, 1, current_timestamp(), s.created_at
            )
        """)

        # Invalidate the finding each revised-and-bound UEO produced, through the
        # shared lifecycle state machine (finding_id == ueo_id). We read the
        # latest revision per finding and WITHDRAW any still-live one; a finding
        # already terminal is left alone so it is never invalidated twice.
        if _to_invalidate:
            findings_invalidated = _invalidate_findings(_to_invalidate)

        # Write individual signals with UEO linkage
        signal_details = (
            windowed
            .join(
                ueos.select("ueo_id", "entity_id", "window_start"),
                ["entity_id", "window_start"],
                "inner"
            )
            .select(
                # Deterministic provenance id tied to the parent UEO and the
                # originating signal, so the same contribution is never recorded
                # under two different ids across replays.
                sha2(concat_ws(
                    "||",
                    col("ueo_id"),
                    coalesce(col("source_alert_id").cast("string"), lit("")),
                    col("signal_class"),
                    col("signal_source"),
                    col("signal_timestamp").cast("string"),
                ), 256).alias("signal_id"),
                col("ueo_id"),
                col("signal_class"),
                col("signal_source"),
                col("raw_score"),
                col("decayed_score"),
                lit(1.0).alias("independence_weight"),
                col("signal_timestamp"),
                col("age_minutes").alias("decay_age_minutes"),
                col("source_event_ids"),
                col("source_alert_id"),
                col("explanation"),
                lit(None).cast("string").alias("metadata"),
                current_timestamp().alias("created_at"),
            )
        )
        # signal_id is deterministic (sha2 over ueo_id + source signal), so the
        # same contribution is never recorded twice across replays (REV2-04).
        safe_append(
            signal_details, "ueo_signals", cfg.catalog, cfg.schema,
            idempotency_key="signal_id",
        )
        print(f"Built {ueo_count} UEOs from {signal_count} signals "
              f"({ueo_revised} revised, {findings_invalidated} findings invalidated)")
    else:
        print(f"No UEOs formed (need >= {min_signals} signals per entity-window)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Recall: Enrich UEOs with Knowledge Store Context

# COMMAND ----------

if ueo_count > 0:
    with mon.time("ks_recall"):
        ks_table_path = get_table_path(cfg, "knowledge_store")
        try:
            # Check for prior suppressions on involved entities
            new_ueos = spark.sql(f"""
                SELECT ueo_id, entity_name
                FROM {ueo_table}
                WHERE confluence_processed = false
                  AND created_at > '{cutoff.isoformat()}'
            """)

            suppression_counts = spark.sql(f"""
                SELECT u.ueo_id, COUNT(k.ks_id) as suppression_count
                FROM {ueo_table} u
                JOIN {ks_table_path} k
                    ON k.entry_type = 'suppression'
                    AND k.is_active = true
                    AND array_contains(k.tags, 'false_positive')
                WHERE u.confluence_processed = false
                  AND u.created_at > '{cutoff.isoformat()}'
                GROUP BY u.ueo_id
            """)

            if suppression_counts.count() > 0:
                suppression_counts.createOrReplaceTempView("_ks_suppressions")
                spark.sql(f"""
                    MERGE INTO {ueo_table} t
                    USING _ks_suppressions s
                    ON t.ueo_id = s.ueo_id
                    WHEN MATCHED THEN UPDATE SET
                        t.ks_prior_suppressions = s.suppression_count
                """)

            # Count similar incidents from KS
            incident_counts = spark.sql(f"""
                SELECT u.ueo_id, COUNT(k.ks_id) as incident_count
                FROM {ueo_table} u
                JOIN {ks_table_path} k
                    ON k.entry_type = 'incident'
                    AND k.is_active = true
                WHERE u.confluence_processed = false
                  AND u.created_at > '{cutoff.isoformat()}'
                GROUP BY u.ueo_id
            """)

            if incident_counts.count() > 0:
                incident_counts.createOrReplaceTempView("_ks_incidents")
                spark.sql(f"""
                    MERGE INTO {ueo_table} t
                    USING _ks_incidents s
                    ON t.ueo_id = s.ueo_id
                    WHEN MATCHED THEN UPDATE SET
                        t.ks_similar_incidents = s.incident_count
                """)

            print("KS recall enrichment complete")
        except Exception as e:
            if "TABLE_OR_VIEW_NOT_FOUND" not in str(e):
                mon.log_warning(f"KS recall failed: {str(e)[:200]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

total_ueos = spark.sql(f"SELECT COUNT(*) FROM {ueo_table}").first()[0]
pending = spark.sql(f"SELECT COUNT(*) FROM {ueo_table} WHERE confluence_processed = false").first()[0]

print(f"\nUEO Summary:")
print(f"  Created this run:    {ueo_count}")
print(f"  Total UEOs:          {total_ueos}")
print(f"  Pending Confluence:  {pending}")

result = {
    "notebook": "09_unified_evidence_object",
    "status": "completed",
    "ueos_created": ueo_count,
    "ueos_revised": ueo_revised if 'ueo_revised' in dir() else 0,
    "findings_invalidated": findings_invalidated if 'findings_invalidated' in dir() else 0,
    "total_ueos": total_ueos,
    "pending_confluence": pending,
    "signals_harvested": signal_count if 'signal_count' in dir() else 0,
    "harvest_health": harvest_health if 'harvest_health' in dir() else None,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result))
