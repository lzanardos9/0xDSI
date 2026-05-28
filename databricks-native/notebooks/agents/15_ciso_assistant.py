# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("ciso_assistant")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 15 - CISO Assistant
# MAGIC Generates executive security briefings by computing key SOC metrics:
# MAGIC open critical alerts, active cases, MTTD/MTTR, top MITRE techniques, and risk trends.
# MAGIC Uses LLM to produce a structured executive summary with recommendations.

# COMMAND ----------

import json
from datetime import datetime, timezone, timedelta
from pyspark.sql import functions as F

# COMMAND ----------

# Configuration
AGENT_ID = "agent_15_ciso_assistant"
LOOKBACK_DAYS = 7

alerts_table = cfg.get_table_path("alerts")
cases_table = cfg.get_table_path("cases")
metrics_table = cfg.get_table_path("detection_metrics")
briefings_table = cfg.get_table_path("executive_briefings")

result = {"agent_id": AGENT_ID, "status": "success", "briefing_generated": False}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute Alert and Case Metrics

# COMMAND ----------

mon.time("compute_alert_case_metrics")

now = datetime.now(timezone.utc)
cutoff_current = now - timedelta(days=LOOKBACK_DAYS)
cutoff_previous = now - timedelta(days=LOOKBACK_DAYS * 2)

alerts_df = spark.read.table(alerts_table)
open_critical_count = alerts_df.filter(
    (F.col("severity") == "critical") & (F.col("status").isin("open", "new", "in_progress"))
).count()
open_high_count = alerts_df.filter(
    (F.col("severity") == "high") & (F.col("status").isin("open", "new", "in_progress"))
).count()

cases_df = spark.read.table(cases_table)
active_cases_count = cases_df.filter(F.col("status").isin("open", "investigating", "in_progress")).count()
escalated_cases_count = cases_df.filter(F.col("status") == "escalated").count()

mon.log_event("alert_case_metrics", {
    "critical": open_critical_count, "high": open_high_count,
    "active_cases": active_cases_count, "escalated": escalated_cases_count
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compute MTTD and MTTR

# COMMAND ----------

mon.time("compute_mttd_mttr")

metrics_df = spark.read.table(metrics_table)
current_metrics = metrics_df.filter(F.col("measured_at") >= F.lit(cutoff_current))
previous_metrics = metrics_df.filter(
    (F.col("measured_at") >= F.lit(cutoff_previous)) & (F.col("measured_at") < F.lit(cutoff_current))
)

avg_mttd = round(current_metrics.agg(F.avg("mttd_minutes")).collect()[0][0] or 0, 1)
avg_mttr = round(current_metrics.agg(F.avg("mttr_minutes")).collect()[0][0] or 0, 1)
prev_avg_mttd = round(previous_metrics.agg(F.avg("mttd_minutes")).collect()[0][0] or 0, 1)
prev_avg_mttr = round(previous_metrics.agg(F.avg("mttr_minutes")).collect()[0][0] or 0, 1)

mon.log_event("mttd_mttr_computed", {
    "mttd": avg_mttd, "mttr": avg_mttr, "prev_mttd": prev_avg_mttd, "prev_mttr": prev_avg_mttr
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Top MITRE Techniques and Risk Trend

# COMMAND ----------

mon.time("compute_mitre_and_trend")

top_techniques = (
    alerts_df
    .filter((F.col("created_at") >= F.lit(cutoff_current)) & (F.col("mitre_technique").isNotNull()))
    .groupBy("mitre_technique").agg(F.count("*").alias("count"))
    .orderBy(F.desc("count")).limit(10).collect()
)
top_mitre_list = [{"technique": r["mitre_technique"], "count": r["count"]} for r in top_techniques]

# Risk trend: compare current vs previous period alert volumes
current_alert_volume = alerts_df.filter(F.col("created_at") >= F.lit(cutoff_current)).count()
previous_alert_volume = alerts_df.filter(
    (F.col("created_at") >= F.lit(cutoff_previous)) & (F.col("created_at") < F.lit(cutoff_current))
).count()

risk_trend_pct = round(
    ((current_alert_volume - previous_alert_volume) / max(previous_alert_volume, 1)) * 100, 1
)
risk_direction = "increasing" if risk_trend_pct > 5 else "decreasing" if risk_trend_pct < -5 else "stable"

mon.log_event("mitre_and_trend", {"techniques": len(top_mitre_list), "direction": risk_direction})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Executive Summary via LLM

# COMMAND ----------

mon.time("generate_executive_summary")

briefing_context = {
    "reporting_period": f"{cutoff_current.strftime('%Y-%m-%d')} to {now.strftime('%Y-%m-%d')}",
    "open_critical_alerts": open_critical_count,
    "open_high_alerts": open_high_count,
    "active_cases": active_cases_count,
    "escalated_cases": escalated_cases_count,
    "mttd_minutes": avg_mttd,
    "mttr_minutes": avg_mttr,
    "mttd_trend": f"{'improved' if avg_mttd < prev_avg_mttd else 'degraded'} from {prev_avg_mttd}min",
    "mttr_trend": f"{'improved' if avg_mttr < prev_avg_mttr else 'degraded'} from {prev_avg_mttr}min",
    "top_mitre_techniques": top_mitre_list,
    "alert_volume_trend": f"{risk_direction} ({risk_trend_pct}%)",
    "current_alert_volume": current_alert_volume,
    "previous_alert_volume": previous_alert_volume,
}

prompt = f"""You are a cybersecurity executive briefing assistant. Generate a structured CISO briefing
in JSON format based on the following SOC metrics. Do NOT include any SQL, code, or commands.

Metrics: {json.dumps(briefing_context, indent=2)}

Respond ONLY with JSON keys: executive_summary (2-3 sentences), key_findings (3-5 strings),
risk_assessment (critical/high/medium/low with justification), recommendations (3-5 strings),
areas_of_concern (list of issues needing CISO attention)."""

llm_response = llm.extract_json(prompt)
mon.log_event("llm_briefing_generated", {"keys": list(llm_response.keys())})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Briefing in executive_briefings Table

# COMMAND ----------

mon.time("store_briefing")

briefing_id = spark.sql("SELECT uuid()").collect()[0][0]

briefing_record = [{
    "briefing_id": briefing_id,
    "generated_at": now.isoformat(),
    "reporting_period_start": cutoff_current.isoformat(),
    "reporting_period_end": now.isoformat(),
    "executive_summary": llm_response.get("executive_summary", ""),
    "key_findings": json.dumps(llm_response.get("key_findings", [])),
    "risk_assessment": llm_response.get("risk_assessment", ""),
    "recommendations": json.dumps(llm_response.get("recommendations", [])),
    "areas_of_concern": json.dumps(llm_response.get("areas_of_concern", [])),
    "metrics_snapshot": json.dumps(briefing_context),
    "agent_id": AGENT_ID,
}]

briefing_df = spark.createDataFrame(briefing_record)
briefing_df.write.mode("append").saveAsTable(briefings_table)

result["briefing_generated"] = True
result["briefing_id"] = briefing_id
result["risk_direction"] = risk_direction
result["open_critical"] = open_critical_count
mon.log_event("briefing_stored", {"briefing_id": briefing_id})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Complete

# COMMAND ----------

mon.log_complete(AGENT_ID, result)
dbutils.notebook.exit(json.dumps(result))
