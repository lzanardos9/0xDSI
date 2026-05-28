# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("incident_summarizer")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 17 - Incident Summarizer
# MAGIC Queries recent critical/high severity alerts within a 2-hour window, gathers
# MAGIC related events for context, and uses LLM to generate 3-part summaries:
# MAGIC one-liner, impact assessment, and recommended actions.
# MAGIC Stores in `alert_summaries` with deduplication (skips already-summarized alerts).

# COMMAND ----------

import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import StringType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

ALERTS_TABLE = cfg.get_table_path("alerts")
EVENTS_TABLE = cfg.get_table_path("events")
SUMMARIES_TABLE = cfg.get_table_path("alert_summaries")
LOOKBACK_HOURS = 2

result = {
    "agent": "17_incident_summarizer",
    "run_ts": datetime.utcnow().isoformat(),
    "alerts_processed": 0,
    "alerts_skipped_dedup": 0,
    "summaries_created": 0,
    "errors": []
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Critical/High Alerts in Time Window

# COMMAND ----------

mon.time("query_alerts")

cutoff_time = (datetime.utcnow() - timedelta(hours=LOOKBACK_HOURS)).isoformat()

alerts_df = spark.read.table(ALERTS_TABLE)

critical_alerts = (
    alerts_df
    .filter(F.col("severity").isin("critical", "high"))
    .filter(F.col("created_at") >= cutoff_time)
    .orderBy(F.desc("created_at"))
)

mon.log_event("critical_alerts_found", count=critical_alerts.count())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deduplicate Against Existing Summaries

# COMMAND ----------

mon.time("dedup_check")

existing_summaries_df = spark.read.table(SUMMARIES_TABLE)
already_summarized = (
    existing_summaries_df
    .select("alert_id")
    .distinct()
)

unsummarized_alerts = (
    critical_alerts
    .join(already_summarized, on="alert_id", how="left_anti")
)

total_alerts = critical_alerts.count()
unsummarized_count = unsummarized_alerts.count()
result["alerts_skipped_dedup"] = total_alerts - unsummarized_count

alerts_to_process = unsummarized_alerts.collect()
mon.log_event("dedup_complete", to_process=len(alerts_to_process), skipped=result["alerts_skipped_dedup"])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gather Related Events and Generate Summaries

# COMMAND ----------

mon.time("generate_summaries")

events_df = spark.read.table(EVENTS_TABLE)
summaries = []

for alert_row in alerts_to_process:
    alert_id = alert_row["alert_id"]
    alert_type = alert_row["alert_type"]
    severity = alert_row["severity"]
    source_ip = alert_row.get("source_ip")
    dest_ip = alert_row.get("dest_ip")
    description = alert_row.get("description", "")

    # Gather related events for context
    related_filter = F.lit(False)
    if source_ip:
        related_filter = related_filter | (F.col("source_ip") == source_ip)
    if dest_ip:
        related_filter = related_filter | (F.col("dest_ip") == dest_ip)

    related_events = (
        events_df
        .filter(related_filter)
        .filter(F.col("timestamp") >= cutoff_time)
        .orderBy(F.desc("timestamp"))
        .limit(20)
    )

    event_context = [row.asDict() for row in related_events.collect()]

    # Build LLM prompt
    prompt = f"""Analyze this security alert and its related events. Produce a structured summary.

Alert ID: {alert_id}
Type: {alert_type}
Severity: {severity}
Source IP: {source_ip}
Destination IP: {dest_ip}
Description: {description}

Related events ({len(event_context)} events):
{json.dumps(event_context, default=str)[:3000]}

Return a JSON object with exactly these three fields:
{{
  "one_liner": "A single sentence summarizing the incident in plain language",
  "impact_assessment": "Assessment of potential impact including affected systems, data at risk, and blast radius. Include confidence level (high/medium/low).",
  "recommended_actions": [
    "First recommended action",
    "Second recommended action",
    "Third recommended action"
  ]
}}"""

    try:
        summary_data = llm.extract_json(prompt)

        summary_record = {
            "summary_id": f"SUM-{alert_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "alert_id": alert_id,
            "alert_type": alert_type,
            "severity": severity,
            "one_liner": summary_data.get("one_liner", ""),
            "impact_assessment": summary_data.get("impact_assessment", ""),
            "recommended_actions": json.dumps(summary_data.get("recommended_actions", [])),
            "related_event_count": len(event_context),
            "generated_at": datetime.utcnow().isoformat(),
            "model_version": cfg.get("llm_model_version", "default")
        }

        summaries.append(summary_record)
        result["alerts_processed"] += 1
        mon.log_event("summary_generated", alert_id=alert_id, severity=severity)

    except Exception as e:
        error_msg = f"Failed to summarize alert {alert_id}: {str(e)}"
        result["errors"].append(error_msg)
        mon.log_event("summary_error", alert_id=alert_id, error=str(e))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Summaries to Table

# COMMAND ----------

mon.time("write_summaries")

if summaries:
    summaries_df = spark.createDataFrame(summaries)
    summaries_df.write.mode("append").saveAsTable(SUMMARIES_TABLE)
    result["summaries_created"] = len(summaries)
    mon.log_event("summaries_written", count=len(summaries))
else:
    mon.log_event("no_new_summaries")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

mon.log_complete(
    agent="17_incident_summarizer",
    summaries_created=result["summaries_created"],
    skipped=result["alerts_skipped_dedup"],
    errors=len(result["errors"])
)

dbutils.notebook.exit(json.dumps(result))
