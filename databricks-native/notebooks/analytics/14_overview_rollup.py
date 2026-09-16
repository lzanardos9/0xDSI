# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics 14 - Platform Overview Rollup
# MAGIC
# MAGIC Computes the platform-wide headline posture behind the "Overview" Command
# MAGIC Center and the "SOC 3D" situational view, which previously rendered a
# MAGIC *simulated* random-walk (event counters, threat count, alert level, and the
# MAGIC risk-posture gauge) in the browser. This notebook derives the real numbers
# MAGIC from the lakehouse and writes ONE latest snapshot row (plus history) to
# MAGIC `overview_metrics`, which the frontend reads via
# MAGIC `/api/query/overview_metrics` and falls back from to the local simulation
# MAGIC when no snapshot exists yet.
# MAGIC
# MAGIC **Derived from:** `events`, `alerts` (+ optional `agent_status`,
# MAGIC `agent_configs`, `cases`).
# MAGIC
# MAGIC **Produces (single JSON snapshot row):** total/24h event volume, EPS, open &
# MAGIC critical alert counts, headline alert level, active agents, open cases, and a
# MAGIC `risk_metrics` JSON block (5 posture categories) with a composite risk score
# MAGIC and DEFCON level.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import analytics_math as am
import overview_rollup as ov

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Metric window in hours")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

require_tables("events", "alerts")

metrics_table = cfg.get_table_path("overview_metrics")
events_t = cfg.get_table_path("events")
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
    total_events BIGINT,
    events_window BIGINT,
    eps DOUBLE,
    open_alerts BIGINT,
    critical_open BIGINT,
    high_open BIGINT,
    threats BIGINT,
    alert_level STRING,
    active_agents INT,
    open_cases INT,
    false_positives BIGINT,
    iocs_enriched BIGINT,
    automated_responses BIGINT,
    composite_risk_score DOUBLE,
    defcon_level INT,
    risk_metrics STRING,
    calculated_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event volume + alert pressure

# COMMAND ----------

def scalar(query, field, default=0):
    rows = spark.sql(query).collect()
    if not rows or rows[0][field] is None:
        return default
    return rows[0][field]


win = f"current_timestamp() - INTERVAL {lookback_hours} HOURS"

total_events = scalar(f"SELECT COUNT(*) AS n FROM {events_t}", "n")
events_window = scalar(f"SELECT COUNT(*) AS n FROM {events_t} WHERE timestamp > {win}", "n")
eps = ov.eps(events_window, lookback_hours * 3600)

open_clause = "status IN ('new','investigating')"
open_alerts = scalar(f"SELECT COUNT(*) AS n FROM {alerts_t} WHERE {open_clause}", "n")
critical_open = scalar(
    f"SELECT COUNT(*) AS n FROM {alerts_t} WHERE severity = 'critical' AND {open_clause}", "n")
high_open = scalar(
    f"SELECT COUNT(*) AS n FROM {alerts_t} WHERE severity = 'high' AND {open_clause}", "n")

alert_level = ov.alert_level(critical_open, high_open)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Risk posture by category (open-alert pressure)

# COMMAND ----------

CATEGORY_KEYWORDS = {
    "Network Perimeter": ["network", "firewall", "dns", "proxy", "port", "scan", "lateral", "remote", "c2"],
    "Endpoint Hygiene": ["endpoint", "process", "host", "edr", "malware", "execution", "powershell", "registry"],
    "Identity Risk": ["identity", "auth", "login", "credential", "kerberos", "account", "mfa", "brute"],
    "Data Exposure": ["data", "dlp", "exfil", "file", "database", "leak", "collection"],
    "Cloud Posture": ["cloud", "aws", "azure", "gcp", "s3", "iam", "container", "kubernetes"],
}

# One pass over open alerts, bucketed into categories in Python so a single alert
# can contribute to whichever category its text matches.
open_rows = spark.sql(f"""
    SELECT LOWER(CONCAT_WS(' ',
        COALESCE(source, ''), COALESCE(mitre_tactic, ''),
        COALESCE(mitre_technique, ''), COALESCE(title, ''))) AS blob
    FROM {alerts_t}
    WHERE {open_clause}
""").collect()

cat_counts = {cat: 0 for cat in CATEGORY_KEYWORDS}
for r in open_rows:
    blob = r["blob"] or ""
    for cat, keys in CATEGORY_KEYWORDS.items():
        if any(k in blob for k in keys):
            cat_counts[cat] += 1

max_open = max(cat_counts.values()) if cat_counts else 0

risk_metrics = []
for label, weight in ov.RISK_CATEGORIES:
    value = ov.category_risk(cat_counts.get(label, 0), max_open)
    risk_metrics.append({"label": label, "value": value, "weight": weight})

composite_risk_score = am.weighted_score([(m["value"], m["weight"]) for m in risk_metrics])
defcon_level = ov.defcon_from_score(composite_risk_score)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Optional operational counts (guarded)

# COMMAND ----------

active_agents = 0
try:
    st = cfg.get_table_path("agent_status")
    active_agents = scalar(
        f"SELECT COUNT(*) AS n FROM {st} WHERE LOWER(COALESCE(status,'')) IN ('active','running','online')", "n")
except Exception:
    active_agents = 0
if not active_agents:
    try:
        ac = cfg.get_table_path("agent_configs")
        active_agents = scalar(f"SELECT COUNT(*) AS n FROM {ac}", "n")
    except Exception:
        active_agents = 0

open_cases = 0
try:
    ct = cfg.get_table_path("cases")
    open_cases = scalar(
        f"SELECT COUNT(*) AS n FROM {ct} WHERE LOWER(COALESCE(status,'')) IN ('open','new','investigating','in_progress')", "n")
except Exception:
    open_cases = 0

threats = open_alerts

false_positives = scalar(
    f"SELECT COUNT(*) AS n FROM {alerts_t} WHERE status = 'false_positive' AND created_at > {win}", "n")

iocs_enriched = 0
try:
    ioc_t = cfg.get_table_path("ioc_entries")
    iocs_enriched = scalar(f"SELECT COUNT(*) AS n FROM {ioc_t}", "n")
except Exception:
    iocs_enriched = 0

automated_responses = 0
try:
    ra_t = cfg.get_table_path("response_actions")
    automated_responses = scalar(
        f"SELECT COUNT(*) AS n FROM {ra_t} WHERE LOWER(COALESCE(action_status,'')) = 'completed' AND created_at > {win}", "n")
except Exception:
    automated_responses = 0

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist snapshot

# COMMAND ----------

snapshot = [(
    lookback_hours, int(total_events), int(events_window), float(eps),
    int(open_alerts), int(critical_open), int(high_open), int(threats),
    alert_level, int(active_agents), int(open_cases),
    int(false_positives), int(iocs_enriched), int(automated_responses),
    float(composite_risk_score), int(defcon_level), json.dumps(risk_metrics),
)]

cols = [
    "window_hours", "total_events", "events_window", "eps",
    "open_alerts", "critical_open", "high_open", "threats",
    "alert_level", "active_agents", "open_cases",
    "false_positives", "iocs_enriched", "automated_responses",
    "composite_risk_score", "defcon_level", "risk_metrics",
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
    "notebook": "14_overview_rollup",
    "status": "completed",
    "events_window": int(events_window),
    "open_alerts": int(open_alerts),
    "alert_level": alert_level,
    "composite_risk_score": composite_risk_score,
    "defcon_level": defcon_level,
}
mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
