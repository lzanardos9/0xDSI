# Databricks notebook source
# MAGIC %md
# MAGIC # Report Generator Agent
# MAGIC
# MAGIC Generates scheduled security reports using data from Unity Catalog
# MAGIC and Foundation Models for narrative synthesis.
# MAGIC
# MAGIC **Writes to:** `reports` table (consumed by Reports.tsx)
# MAGIC
# MAGIC **Report Types:**
# MAGIC - executive: High-level summary for CISO/leadership
# MAGIC - operational: Daily SOC ops metrics
# MAGIC - compliance: Framework coverage status
# MAGIC - metrics: Detection/response KPIs
# MAGIC - threat_intel: Threat landscape analysis
# MAGIC - behavioral: User anomaly trends
# MAGIC - coverage: MITRE ATT&CK detection coverage
# MAGIC - system: Agent/platform health

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("report_type", "operational", "Report type to generate")
dbutils.widgets.text("lookback_hours", "24", "Data window for report")

report_type = dbutils.widgets.get("report_type")
lookback_hours = int(dbutils.widgets.get("lookback_hours"))

mon.log_event("config_loaded", {"report_type": report_type, "lookback_hours": lookback_hours})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gather Report Metrics

# COMMAND ----------

reports_table = cfg.get_table_path("reports")
alerts_table = cfg.get_table_path("alerts")
cases_table = cfg.get_table_path("cases")
events_table = cfg.get_table_path("events")
agents_table = cfg.get_table_path("agent_status")

with mon.time("gather_metrics"):
    metrics = {}

    metric_queries = {
        "total_events": f"SELECT COUNT(*) as cnt FROM {events_table} WHERE timestamp > current_timestamp() - INTERVAL {lookback_hours} HOURS",
        "total_alerts": f"SELECT COUNT(*) as cnt FROM {alerts_table} WHERE created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS",
        "critical_alerts": f"SELECT COUNT(*) as cnt FROM {alerts_table} WHERE created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS AND severity = 'critical'",
        "open_cases": f"SELECT COUNT(*) as cnt FROM {cases_table} WHERE status IN ('open', 'in_progress')",
        "closed_cases_period": f"SELECT COUNT(*) as cnt FROM {cases_table} WHERE status = 'closed' AND updated_at > current_timestamp() - INTERVAL {lookback_hours} HOURS",
        "active_agents": f"SELECT COUNT(*) as cnt FROM {agents_table} WHERE status IN ('running', 'active')",
        "false_positive_rate": f"SELECT ROUND(AVG(CASE WHEN false_positive = true THEN 1.0 ELSE 0.0 END) * 100, 1) as cnt FROM {alerts_table} WHERE created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS",
    }

    for key, sql in metric_queries.items():
        try:
            result = spark.sql(sql).collect()
            metrics[key] = float(result[0]["cnt"]) if result and result[0]["cnt"] is not None else 0
        except Exception:
            metrics[key] = 0

    print(f"Metrics gathered: {json.dumps(metrics)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Report Narrative

# COMMAND ----------

with mon.time("generate_narrative"):
    report_prompts = {
        "executive": f"Generate a brief executive security briefing. Key metrics: {json.dumps(metrics)}. Focus on risk posture, critical items, and recommendations.",
        "operational": f"Generate a SOC operations summary. Metrics: {json.dumps(metrics)}. Cover alert volume, case status, agent health, and efficiency.",
        "compliance": "Summarize compliance status across all frameworks. Highlight any degradation or upcoming audit deadlines.",
        "metrics": f"Generate a detection and response KPI report. Metrics: {json.dumps(metrics)}. Include MTTR, MTTD, detection rate.",
        "threat_intel": "Summarize the current threat landscape. Active campaigns, new IOCs, and recommended hunt hypotheses.",
        "behavioral": "Summarize user behavior anomaly trends. High-risk users, anomaly types, and insider threat indicators.",
        "coverage": "Report on MITRE ATT&CK detection coverage. Gaps in tactic/technique coverage and recommendations.",
        "system": f"Generate a platform health report. Active agents: {int(metrics.get('active_agents', 0))}. Cover uptime, performance, and capacity.",
    }

    prompt = report_prompts.get(report_type, report_prompts["operational"])

    try:
        response = llm.chat(
            system="You are a security report generator. Produce concise, professional reports with specific numbers and actionable insights. Use markdown formatting.",
            user=prompt,
            temperature=0.3,
            max_tokens=2048,
        )
        narrative = response.content
    except Exception as e:
        narrative = f"# {report_type.title()} Report\n\nAutomated metrics summary:\n\n"
        for k, v in metrics.items():
            narrative += f"- **{k.replace('_', ' ').title()}**: {v}\n"
        narrative += f"\n*Report generated at {datetime.utcnow().isoformat()}. LLM synthesis unavailable: {str(e)[:100]}*"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Report

# COMMAND ----------

REPORT_TITLES = {
    "executive": f"Executive Security Briefing - {datetime.utcnow().strftime('%B %d, %Y')}",
    "operational": f"Daily SOC Operations Summary - {datetime.utcnow().strftime('%Y-%m-%d')}",
    "compliance": f"Compliance Status Report - {datetime.utcnow().strftime('%B %Y')}",
    "metrics": f"Detection & Response KPIs - {datetime.utcnow().strftime('%Y-%m-%d')}",
    "threat_intel": f"Threat Landscape Analysis - {datetime.utcnow().strftime('%B %Y')}",
    "behavioral": f"User Behavior Anomaly Trends - {datetime.utcnow().strftime('%Y-%m-%d')}",
    "coverage": f"MITRE ATT&CK Coverage Report - {datetime.utcnow().strftime('%B %Y')}",
    "system": f"Platform Health Report - {datetime.utcnow().strftime('%Y-%m-%d')}",
}

FREQUENCY_MAP = {
    "executive": "weekly",
    "operational": "daily",
    "compliance": "monthly",
    "metrics": "daily",
    "threat_intel": "monthly",
    "behavioral": "weekly",
    "coverage": "monthly",
    "system": "daily",
}

with mon.time("persist_report"):
    report_record = [{
        "title": REPORT_TITLES.get(report_type, f"Report - {datetime.utcnow().isoformat()}"),
        "report_type": report_type,
        "frequency": FREQUENCY_MAP.get(report_type, "daily"),
        "status": "generated",
        "format": "html",
        "generated_by": "report_generator_agent",
        "content": narrative,
        "metrics_json": json.dumps(metrics),
    }]

    schema = StructType([
        StructField("title", StringType()),
        StructField("report_type", StringType()),
        StructField("frequency", StringType()),
        StructField("status", StringType()),
        StructField("format", StringType()),
        StructField("generated_by", StringType()),
        StructField("content", StringType()),
        StructField("metrics_json", StringType()),
    ])

    report_df = (
        spark.createDataFrame(report_record, schema=schema)
        .withColumn("id", expr("uuid()"))
        .withColumn("created_at", current_timestamp())
        .withColumn("generated_at", current_timestamp())
    )
    report_df.write.mode("append").saveAsTable(reports_table)
    print(f"Report persisted: {REPORT_TITLES.get(report_type)}")

# COMMAND ----------

result = {
    "notebook": "05_report_generator",
    "status": "completed",
    "report_type": report_type,
    "title": REPORT_TITLES.get(report_type, "unknown"),
    "metrics": metrics,
}
mon.log_complete(details=result)
dbutils.notebook.exit(json.dumps(result, default=str))
