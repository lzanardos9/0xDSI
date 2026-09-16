# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics 13 - MITRE ATT&CK Coverage
# MAGIC
# MAGIC Computes the detection-coverage snapshot behind the "MITRE ATT&CK Coverage
# MAGIC Matrix" tab, which previously rendered a hard-coded matrix (and a simulated
# MAGIC random-walk) in the browser. This notebook derives real per-technique
# MAGIC coverage from `alerts` and writes ONE latest snapshot row (plus history) to
# MAGIC `mitre_coverage_metrics`, which the frontend reads via
# MAGIC `/api/query/mitre_coverage_metrics` and overlays onto its canonical ATT&CK
# MAGIC layout (techniques with no live data keep their static baseline).
# MAGIC
# MAGIC **Derived from:** `alerts` (mitre_technique, mitre_tactic, rule_name,
# MAGIC risk_score, created_at).
# MAGIC
# MAGIC **Produces (single JSON snapshot row):** overall coverage %, per-status
# MAGIC counts, a `technique_metrics` JSON block (keyed by ATT&CK technique id), and
# MAGIC a `tactic_summary` JSON block.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import mitre_coverage as mcov

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Detection window in hours")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

require_tables("alerts")

metrics_table = cfg.get_table_path("mitre_coverage_metrics")
alerts_t = cfg.get_table_path("alerts")

mon.log_event("config_loaded", {"lookback_hours": lookback_hours})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ensure output table

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {metrics_table} (
    id STRING DEFAULT uuid(),
    window_hours INT,
    coverage_pct DOUBLE,
    technique_count INT,
    covered_count INT,
    detected_count INT,
    partial_count INT,
    gap_count INT,
    technique_metrics STRING,
    tactic_summary STRING,
    calculated_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Per-technique aggregates
# MAGIC
# MAGIC Rule coverage is counted over all alerts ever raised for a technique (it
# MAGIC reflects configured detection capability), while detections are counted only
# MAGIC within the lookback window (they reflect live, recent activity).

# COMMAND ----------

win = f"current_timestamp() - INTERVAL {lookback_hours} HOURS"

technique_rows = spark.sql(f"""
    SELECT
        mitre_technique AS technique_id,
        FIRST(mitre_tactic) AS tactic,
        COUNT(DISTINCT rule_name) AS rule_count,
        SUM(CASE WHEN created_at > {win} THEN 1 ELSE 0 END) AS detection_count,
        AVG(risk_score) AS avg_risk,
        SLICE(ARRAY_DISTINCT(
            FILTER(COLLECT_LIST(rule_name), r -> r IS NOT NULL)
        ), 1, 5) AS active_rules
    FROM {alerts_t}
    WHERE mitre_technique IS NOT NULL AND mitre_technique <> ''
    GROUP BY mitre_technique
    ORDER BY detection_count DESC, rule_count DESC
""").collect()

technique_metrics = []
statuses = []
for r in technique_rows:
    rule_count = int(r["rule_count"] or 0)
    detection_count = int(r["detection_count"] or 0)
    status = mcov.classify_status(rule_count, detection_count)
    statuses.append(status)
    technique_metrics.append({
        "technique_id": r["technique_id"],
        "tactic": r["tactic"] or "",
        "rule_count": rule_count,
        "detection_count": detection_count,
        "avg_risk": round(float(r["avg_risk"] or 0.0), 2),
        "risk_ten": mcov.risk_ten(r["avg_risk"]),
        "status": status,
        "active_rules": [x for x in (r["active_rules"] or []) if x],
    })

technique_count = len(technique_metrics)
covered_count = sum(1 for s in statuses if s == "covered")
detected_count = sum(1 for s in statuses if s == "detected")
partial_count = sum(1 for s in statuses if s == "partial")
gap_count = sum(1 for s in statuses if s == "gap")
coverage = mcov.coverage_pct(statuses)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Tactic summary

# COMMAND ----------

tactic_rows = spark.sql(f"""
    SELECT
        COALESCE(mitre_tactic, 'unmapped') AS tactic,
        COUNT(DISTINCT mitre_technique) AS techniques,
        SUM(CASE WHEN created_at > {win} THEN 1 ELSE 0 END) AS detections
    FROM {alerts_t}
    WHERE mitre_technique IS NOT NULL AND mitre_technique <> ''
    GROUP BY COALESCE(mitre_tactic, 'unmapped')
    ORDER BY detections DESC
""").collect()

tactic_summary = [{
    "tactic": r["tactic"],
    "techniques": int(r["techniques"] or 0),
    "detections": int(r["detections"] or 0),
} for r in tactic_rows]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist snapshot

# COMMAND ----------

snapshot = [(
    lookback_hours, float(coverage), int(technique_count),
    int(covered_count), int(detected_count), int(partial_count), int(gap_count),
    json.dumps(technique_metrics), json.dumps(tactic_summary),
)]

cols = [
    "window_hours", "coverage_pct", "technique_count",
    "covered_count", "detected_count", "partial_count", "gap_count",
    "technique_metrics", "tactic_summary",
]
df = spark.createDataFrame(snapshot, cols)
with mon.time("persist"):
    df.write.mode("append").saveAsTable(metrics_table)

# Retain 30 days of snapshots.
try:
    spark.sql(f"DELETE FROM {metrics_table} WHERE calculated_at < current_timestamp() - INTERVAL 30 DAYS")
except Exception:
    pass

# COMMAND ----------

result = {
    "notebook": "13_mitre_coverage",
    "status": "completed",
    "coverage_pct": coverage,
    "technique_count": technique_count,
    "detected_count": detected_count,
    "gap_count": gap_count,
}
mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
