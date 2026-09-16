# Databricks notebook source
# MAGIC %md
# MAGIC # Analytics 10 - Platform Economics
# MAGIC
# MAGIC Computes the cost-intelligence snapshot behind the "Platform Economics" tab,
# MAGIC which previously rendered hard-coded dollar figures in the browser. This
# MAGIC notebook estimates spend from real ingest volume and writes ONE latest
# MAGIC snapshot row (plus history) to `platform_economics_metrics`, read by the
# MAGIC frontend via `/api/query/platform_economics_metrics`.
# MAGIC
# MAGIC **Derived from:** `events` (volume by source), `alerts` (count),
# MAGIC `data_connectors` (source inventory).
# MAGIC
# MAGIC **Cost model:** ~2 KB/event ingest, blended storage + compute + inference
# MAGIC rates, then the standard optimization levers (cold-tiering, dedup,
# MAGIC right-sizing) applied to project an optimized trajectory.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import analytics_math as am

# COMMAND ----------

dbutils.widgets.text("lookback_hours", "24", "Volume window in hours")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

require_tables("events")

metrics_table = cfg.get_table_path("platform_economics_metrics")
mon.log_event("config_loaded", {"lookback_hours": lookback_hours})

# COMMAND ----------

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {metrics_table} (
    id STRING DEFAULT uuid(),
    window_hours INT,
    monthly_cost DOUBLE,
    cost_per_event DOUBLE,
    cost_per_alert DOUBLE,
    projected_annual DOUBLE,
    total_gb_day DOUBLE,
    monthly_events BIGINT,
    ingestion STRING,
    billing_rows STRING,
    optimizations STRING,
    sentinel_analytics_cost DOUBLE,
    sentinel_lake_cost DOUBLE,
    savings_vs_sentinel_pct DOUBLE,
    current_line STRING,
    optimized_line STRING,
    calculated_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA
""")

# COMMAND ----------

def scalar(query, field, default=0):
    rows = spark.sql(query).collect()
    if not rows or rows[0][field] is None:
        return default
    return rows[0][field]


win = f"current_timestamp() - INTERVAL {lookback_hours} HOURS"
events_t = cfg.get_table_path("events")
alerts_t = cfg.get_table_path("alerts")

window_events = scalar(f"SELECT COUNT(*) AS n FROM {events_t} WHERE timestamp > {win}", "n")
window_alerts = 0
try:
    window_alerts = scalar(f"SELECT COUNT(*) AS n FROM {alerts_t} WHERE created_at > {win}", "n")
except Exception:
    pass

# Extrapolate the window to a 30-day month.
scale_to_month = (24.0 / max(lookback_hours, 1)) * 30
monthly_events = int(window_events * scale_to_month)
monthly_alerts = int(window_alerts * scale_to_month)

# Ingest volume by source, in GB/day (~2 KB/event).
BYTES_PER_EVENT = 2048
source_rows = spark.sql(f"""
    SELECT COALESCE(source, event_type, 'unknown') AS name, COUNT(*) AS cnt
    FROM {events_t} WHERE timestamp > {win}
    GROUP BY COALESCE(source, event_type, 'unknown')
    ORDER BY cnt DESC LIMIT 8
""").collect()

events_per_day_factor = 24.0 / max(lookback_hours, 1)
ingestion = []
for r in source_rows:
    gb_day = r["cnt"] * events_per_day_factor * BYTES_PER_EVENT / 1e9
    ingestion.append({"name": r["name"], "gb": round(gb_day, 3)})
total_gb_day = round(sum(i["gb"] for i in ingestion), 3)
gb_month = total_gb_day * 30

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cost model

# COMMAND ----------

# Blended rates (USD).
STORAGE_RATE_GB_MO = 0.23
COMPUTE_RATE_PER_EVENT = 0.0000042
INFERENCE_RATE_PER_EVENT = 0.0000128
PLATFORM_BASE = 12000.0

storage_cost = gb_month * STORAGE_RATE_GB_MO
compute_cost = monthly_events * COMPUTE_RATE_PER_EVENT
inference_cost = monthly_events * INFERENCE_RATE_PER_EVENT
monthly_cost = am.round2(PLATFORM_BASE + storage_cost + compute_cost + inference_cost)

cost_per_event = round(monthly_cost / monthly_events, 6) if monthly_events else 0.0
cost_per_alert = am.round2(monthly_cost / monthly_alerts) if monthly_alerts else 0.0
projected_annual = am.round2(monthly_cost * 12)

# Sentinel comparison (public list rates per GB/mo).
sentinel_analytics_cost = am.round2(gb_month * 2.46)
sentinel_lake_cost = am.round2(gb_month * 0.05)
_, savings_vs_sentinel_pct = am.savings(sentinel_analytics_cost, monthly_cost)

billing_rows = [
    {"item": "Compute (vCPU-hours)", "units": f"{int(monthly_events/20000):,} hrs",
     "rate": "$0.0042/event", "cost": am.round2(compute_cost)},
    {"item": "Hot Storage (SSD)", "units": f"{round(gb_month/1000,1)} TB",
     "rate": "$0.23/GB/mo", "cost": am.round2(storage_cost * 0.7)},
    {"item": "Cold Storage (Archive)", "units": f"{round(gb_month*6/1000,1)} TB",
     "rate": "$0.004/GB/mo", "cost": am.round2(storage_cost * 0.3)},
    {"item": "ML Inference", "units": f"{int(monthly_events/1000):,}K inf.",
     "rate": "$12.80/1K", "cost": am.round2(inference_cost)},
    {"item": "Platform Base", "units": "flat", "rate": "-", "cost": PLATFORM_BASE},
]

# Optimization levers, each a % reduction against its slice of spend.
optimizations = [
    {"title": "Cold-tier endpoint telemetry after 72h",
     "savings": am.round2(storage_cost * 0.28), "pct": 78},
    {"title": "Deduplicate network flow logs",
     "savings": am.round2(storage_cost * 0.12), "pct": 62},
    {"title": "Right-size ML inference batch sizes",
     "savings": am.round2(inference_cost * 0.18), "pct": 45},
    {"title": "Drop debug-level log payloads",
     "savings": am.round2(compute_cost * 0.15), "pct": 38},
]
total_opt_savings = sum(o["savings"] for o in optimizations)

# 12-month trajectories: current grows ~4%/mo, optimized declines as levers land.
current_line = [am.round2(monthly_cost * (1.04 ** i)) for i in range(12)]
optimized_line = [am.round2(monthly_cost - total_opt_savings * min(i / 6.0, 1.0))
                  for i in range(12)]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist snapshot

# COMMAND ----------

snapshot = [(
    lookback_hours, float(monthly_cost), float(cost_per_event), float(cost_per_alert),
    float(projected_annual), float(total_gb_day), int(monthly_events),
    json.dumps(ingestion), json.dumps(billing_rows), json.dumps(optimizations),
    float(sentinel_analytics_cost), float(sentinel_lake_cost),
    float(savings_vs_sentinel_pct), json.dumps(current_line), json.dumps(optimized_line),
)]
cols = [
    "window_hours", "monthly_cost", "cost_per_event", "cost_per_alert",
    "projected_annual", "total_gb_day", "monthly_events", "ingestion",
    "billing_rows", "optimizations", "sentinel_analytics_cost",
    "sentinel_lake_cost", "savings_vs_sentinel_pct", "current_line", "optimized_line",
]
df = spark.createDataFrame(snapshot, cols)
with mon.time("persist"):
    df.write.mode("append").saveAsTable(metrics_table)

try:
    spark.sql(f"DELETE FROM {metrics_table} WHERE calculated_at < current_timestamp() - INTERVAL 30 DAYS")
except Exception:
    pass

# COMMAND ----------

result = {
    "notebook": "10_platform_economics",
    "status": "completed",
    "monthly_cost": monthly_cost,
    "projected_annual": projected_annual,
    "total_gb_day": total_gb_day,
    "savings_vs_sentinel_pct": savings_vs_sentinel_pct,
}
mon.log_complete(details=result)
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
