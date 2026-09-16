# Databricks notebook source
# MAGIC %md
# MAGIC # Threat Escalation Priority Scoring
# MAGIC
# MAGIC Server-side port of the app's "Threat Escalation" tab
# MAGIC (`app/frontend/src/lib/threatEscalation.ts`). That engine only ran in the
# MAGIC browser, so priorities existed for events an analyst manually opened and
# MAGIC never reached the lakehouse. This notebook computes the identical
# MAGIC ArcSight-style priority for every recent event and persists it to
# MAGIC `event_priority_calculations`, making the score available to correlation,
# MAGIC response, and reporting.
# MAGIC
# MAGIC The formula itself lives in `_shared/escalation_formula.py` (pure Python,
# MAGIC parity-tested against the TypeScript in
# MAGIC `tests/property/test_escalation_formula.py`). This notebook only handles
# MAGIC I/O: loading the active formula + reference data, mapping lakehouse columns
# MAGIC onto the engine's inputs, and writing results.
# MAGIC
# MAGIC **Formula:** `priority = (severity·w) · (MCR·w) · (threatWeight·(1+mult·100)) · (assetCriticality·w)`
# MAGIC where `MCR = (model_confidence/10) · relevance`.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import escalation_formula as esc
from pyspark.sql import Row
from pyspark.sql.functions import col
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("lookback_minutes", "15", "Score events from the last N minutes")
dbutils.widgets.text("max_events", "5000", "Max events to score per run")

lookback_minutes = int(dbutils.widgets.get("lookback_minutes"))
max_events = int(dbutils.widgets.get("max_events"))

require_tables("events")

mon.log_event("config_loaded", {
    "lookback_minutes": lookback_minutes,
    "max_events": max_events,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure escalation tables exist
# MAGIC
# MAGIC The core setup notebook does not create these (they originated in the app
# MAGIC database). We create them here as Delta so the pipeline is self-contained,
# MAGIC and seed the default formula if the table is empty.

# COMMAND ----------

formulas_table = cfg.get_table_path("threat_escalation_formulas")
intel_table = cfg.get_table_path("threat_intelligence_sources")
calc_table = cfg.get_table_path("event_priority_calculations")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {formulas_table} (
    id STRING DEFAULT uuid(),
    name STRING,
    description STRING,
    formula_version STRING DEFAULT '1.0',
    is_active BOOLEAN DEFAULT false,
    severity_weight DOUBLE DEFAULT 1.0,
    mcr_weight DOUBLE DEFAULT 1.0,
    threat_weight_multiplier DOUBLE DEFAULT 0.03,
    asset_weight DOUBLE DEFAULT 1.0,
    formula_expression STRING,
    created_by STRING,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {intel_table} (
    id STRING DEFAULT uuid(),
    source_name STRING,
    source_type STRING,
    threat_severity INT DEFAULT 5,
    indicator_value STRING,
    indicator_type STRING,
    threat_category STRING,
    confidence_score DOUBLE DEFAULT 50.0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {calc_table} (
    id STRING DEFAULT uuid(),
    event_id STRING NOT NULL,
    formula_id STRING,
    initial_severity STRING,
    severity_score DOUBLE,
    model_confidence DOUBLE,
    relevance_score DOUBLE,
    mcr_factor DOUBLE,
    threat_weight DOUBLE,
    asset_criticality DOUBLE,
    final_priority DOUBLE,
    priority_level STRING,
    calculation_details STRING,
    escalated BOOLEAN DEFAULT false,
    escalation_reason STRING,
    calculated_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

# Seed the default formula if none is active (matches the app migration default).
active_count = spark.sql(
    f"SELECT COUNT(*) AS n FROM {formulas_table} WHERE is_active = true"
).collect()[0]["n"]
if active_count == 0:
    spark.sql(f"""
        INSERT INTO {formulas_table}
            (name, description, formula_version, is_active,
             severity_weight, mcr_weight, threat_weight_multiplier, asset_weight,
             formula_expression, created_by)
        VALUES (
            'Standard ArcSight-Style Formula',
            'Priority = Severity * MCR * ThreatWeight * AssetCriticality',
            '1.0', true, 1.0, 1.0, 0.03, 1.0,
            'Priority = Severity * (MC/10 * Relevance) * (1 + ThreatSeverity * 3/100) * AssetCriticality',
            'pipeline'
        )
    """)
    mon.log_event("seeded_default_formula", {})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Load the active formula

# COMMAND ----------

formula_rows = spark.sql(f"""
    SELECT id, severity_weight, mcr_weight, threat_weight_multiplier, asset_weight
    FROM {formulas_table}
    WHERE is_active = true
    ORDER BY updated_at DESC
    LIMIT 1
""").collect()

if formula_rows:
    fr = formula_rows[0]
    formula = {
        "severity_weight": fr["severity_weight"],
        "mcr_weight": fr["mcr_weight"],
        "threat_weight_multiplier": fr["threat_weight_multiplier"],
        "asset_weight": fr["asset_weight"],
    }
    formula_id = fr["id"]
else:
    formula = {}
    formula_id = None

print(f"Active formula: {formula_id} -> {formula}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build reference lookups (assets + threat intel)
# MAGIC
# MAGIC These are reference-sized tables, so we collect them to the driver as
# MAGIC dictionaries keyed by the values events join on. Lakehouse asset columns
# MAGIC differ from the app's, so we map what exists and leave the rest to the
# MAGIC engine's defaults (missing model_confidence/discovery_method/ports simply
# MAGIC yield fewer relevance signals -- the score stays deterministic).

# COMMAND ----------

# Map the lakehouse `criticality` string onto the app's numeric criticality_score.
CRITICALITY_TO_SCORE = {
    "critical": 2.0, "very_high": 2.0,
    "high": 1.5,
    "medium": 1.0,
    "low": 0.75,
    "very_low": 0.5,
}

asset_lookup = {}
try:
    asset_cols = set(spark.table(cfg.get_table_path("asset_registry")).columns)
    has_crit_score = "criticality_score" in asset_cols
    has_model_conf = "model_confidence" in asset_cols
    for a in spark.sql(f"SELECT * FROM {cfg.get_table_path('asset_registry')}").collect():
        ad = a.asDict()
        crit_score = ad.get("criticality_score") if has_crit_score else None
        if crit_score is None:
            crit_score = CRITICALITY_TO_SCORE.get(ad.get("criticality"), 1.0)
        asset = {
            "criticality_score": crit_score,
            "model_confidence": ad.get("model_confidence") if has_model_conf else None,
            "discovery_method": ad.get("discovery_method"),
            "exposed_ports": ad.get("exposed_ports") or [],
            "known_vulnerabilities": ad.get("known_vulnerabilities") or [],
        }
        if ad.get("ip_address"):
            asset_lookup[ad["ip_address"]] = asset
        if ad.get("hostname"):
            asset_lookup.setdefault(ad["hostname"], asset)
except Exception as e:
    mon.log_event("asset_lookup_fallback", {"error": str(e)[:200]})

print(f"Asset lookup: {len(asset_lookup)} keys")

# COMMAND ----------

# Threat intel keyed by indicator_value. Primary source is
# threat_intelligence_sources; we also fold in active ioc_entries so real IOC
# data contributes even before the intel table is populated.
IOC_SEVERITY = {"critical": 9, "high": 7, "medium": 5, "low": 3}

threat_lookup = {}


def _add_threat(value, is_active, severity):
    if not value:
        return
    threat_lookup.setdefault(value, []).append({
        "indicator_value": value,
        "is_active": bool(is_active),
        "threat_severity": severity,
    })


try:
    for t in spark.sql(f"""
        SELECT indicator_value, is_active, threat_severity
        FROM {intel_table}
    """).collect():
        _add_threat(t["indicator_value"], t["is_active"], t["threat_severity"] or 5)
except Exception as e:
    mon.log_event("intel_lookup_fallback", {"error": str(e)[:200]})

try:
    for i in spark.sql(f"""
        SELECT value, is_active, severity
        FROM {cfg.get_table_path('ioc_entries')}
        WHERE is_active = true
    """).collect():
        _add_threat(i["value"], i["is_active"], IOC_SEVERITY.get(i["severity"], 5))
except Exception as e:
    mon.log_event("ioc_lookup_fallback", {"error": str(e)[:200]})

print(f"Threat lookup: {len(threat_lookup)} indicators")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Select recent, not-yet-scored events

# COMMAND ----------

# Map lakehouse severity onto the engine's five-level scale.
SEVERITY_MAP = {
    "critical": "very_high",
    "high": "high",
    "medium": "medium",
    "low": "low",
    "info": "very_low",
    "informational": "very_low",
}

events_df = spark.sql(f"""
    SELECT e.id AS event_id, e.source_ip, e.hostname, e.severity, e.normalized
    FROM {cfg.get_table_path('events')} e
    LEFT ANTI JOIN {calc_table} c ON c.event_id = e.id
    WHERE e.timestamp > current_timestamp() - INTERVAL {lookback_minutes} MINUTES
    LIMIT {max_events}
""")

pending = events_df.collect()
print(f"Events to score: {len(pending)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Score events

# COMMAND ----------

ESCALATE_LEVELS = {"very_high", "critical"}


def _event_port(normalized):
    if not normalized:
        return None
    raw = normalized.get("dest_port") or normalized.get("port")
    try:
        return int(raw) if raw is not None else None
    except (TypeError, ValueError):
        return None


rows = []
with mon.time("score_events"):
    for ev in pending:
        d = ev.asDict()
        entity = d.get("source_ip") or d.get("hostname")
        event_input = {
            "initial_severity": SEVERITY_MAP.get(d.get("severity"), "very_low"),
            "source_ip": d.get("source_ip"),
            "event_port": _event_port(d.get("normalized")),
            "vulnerabilities": [],
        }
        asset = asset_lookup.get(entity) if entity else None
        threat_intel = threat_lookup.get(d.get("source_ip")) if d.get("source_ip") else None

        calc = esc.calculate_priority(event_input, asset, threat_intel, formula)
        escalated = calc["priority_level"] in ESCALATE_LEVELS
        rows.append(Row(
            event_id=d["event_id"],
            formula_id=formula_id,
            initial_severity=event_input["initial_severity"],
            severity_score=float(calc["severity_score"]),
            model_confidence=float(calc["model_confidence"]),
            relevance_score=float(calc["relevance_score"]),
            mcr_factor=float(calc["mcr_factor"]),
            threat_weight=float(calc["threat_weight"]),
            asset_criticality=float(calc["asset_criticality"]),
            final_priority=float(calc["final_priority"]),
            priority_level=calc["priority_level"],
            calculation_details=json.dumps(calc["details"]),
            escalated=escalated,
            escalation_reason=(
                f"Priority {calc['final_priority']} -> {calc['priority_level']}"
                if escalated else None
            ),
            calculated_at=datetime.utcnow(),
        ))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist

# COMMAND ----------

written = 0
escalated_count = 0
if rows:
    out_df = spark.createDataFrame(rows).select(
        "event_id", "formula_id", "initial_severity", "severity_score",
        "model_confidence", "relevance_score", "mcr_factor", "threat_weight",
        "asset_criticality", "final_priority", "priority_level",
        "calculation_details", "escalated", "escalation_reason", "calculated_at",
    )
    with mon.time("persist"):
        out_df.write.mode("append").saveAsTable(calc_table)
    written = out_df.count()
    escalated_count = out_df.filter(col("escalated") == True).count()  # noqa: E712
    print(f"Persisted {written} priority calculations ({escalated_count} escalated)")
else:
    print("No events to score this run")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Prune old calculations (keep 30 days)

# COMMAND ----------

try:
    spark.sql(f"""
        DELETE FROM {calc_table}
        WHERE calculated_at < current_timestamp() - INTERVAL 30 DAYS
    """)
except Exception:
    pass

# COMMAND ----------

result = {
    "notebook": "08_threat_escalation_priority",
    "status": "completed",
    "events_scored": written,
    "escalated": escalated_count,
    "formula_id": formula_id,
    "assets_loaded": len(asset_lookup),
    "threat_indicators": len(threat_lookup),
}
mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
