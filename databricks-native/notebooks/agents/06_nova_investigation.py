# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 06 - Nova Investigation
# MAGIC Builds investigation narratives for open cases, reconstructs kill chains via LLM,
# MAGIC and generates analyst-ready reports with timelines and recommended actions.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("nova_investigation")

# COMMAND ----------

import json
from datetime import datetime, timezone
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, FloatType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration and Table Setup

# COMMAND ----------

AGENT_NAME = "nova_investigation"
AGENT_VERSION = "1.0.0"
BATCH_SIZE = 20

cases_table = cfg.get_table_path("cases")
alerts_table = cfg.get_table_path("alerts")
events_table = cfg.get_table_path("events")
reports_table = cfg.get_table_path("investigation_reports")

# COMMAND ----------

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {reports_table} (
        report_id STRING,
        case_id STRING,
        investigation_summary STRING,
        timeline_json STRING,
        kill_chain_phase STRING,
        recommended_actions STRING,
        confidence_score FLOAT,
        generated_by STRING,
        generated_at TIMESTAMP,
        status STRING
    )
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gather Open Cases

# COMMAND ----------

def get_open_cases():
    """Retrieve cases in open or investigating status."""
    with mon.time("query_open_cases"):
        cases_df = (
            qb()
            .table(cases_table)
            .where("status IN ('open', 'investigating')")
            .where("assigned_agent IS NULL OR assigned_agent = 'nova_investigation'")
            .order_by("severity DESC, created_at ASC")
            .limit(BATCH_SIZE)
            .execute()
        )
        mon.log_event("open_cases_retrieved", {"count": cases_df.count()})
        return cases_df

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gather Related Evidence

# COMMAND ----------

def gather_case_evidence(case_id):
    """Collect alerts and events related to a specific case."""
    with mon.time("gather_evidence"):
        related_alerts = (
            qb()
            .table(alerts_table)
            .where("case_id = :case_id", case_id=case_id)
            .order_by("triggered_at ASC")
            .execute()
        )

        related_events = (
            qb()
            .table(events_table)
            .where("case_id = :case_id", case_id=case_id)
            .order_by("event_time ASC")
            .execute()
        )

        alerts_data = [row.asDict() for row in related_alerts.collect()]
        events_data = [row.asDict() for row in related_events.collect()]

        return {
            "alerts": alerts_data,
            "events": events_data,
            "alert_count": len(alerts_data),
            "event_count": len(events_data)
        }

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Investigation Analysis

# COMMAND ----------

def build_investigation_prompt(case_data, evidence):
    """Construct the LLM prompt for investigation analysis."""
    prompt = f"""You are a senior SOC analyst performing an investigation.

Case Details:
- Case ID: {case_data['case_id']}
- Title: {case_data['title']}
- Severity: {case_data['severity']}
- Description: {case_data['description']}

Related Alerts ({evidence['alert_count']}):
{json.dumps(evidence['alerts'], default=str, indent=2)[:3000]}

Related Events ({evidence['event_count']}):
{json.dumps(evidence['events'], default=str, indent=2)[:3000]}

Produce a JSON response with:
{{
    "summary": "Executive summary of findings (2-3 paragraphs)",
    "timeline": [
        {{"timestamp": "ISO timestamp", "event": "description", "significance": "high/medium/low"}}
    ],
    "kill_chain_phase": "One of: reconnaissance, weaponization, delivery, exploitation, installation, command_and_control, actions_on_objectives",
    "recommended_actions": ["action1", "action2", ...],
    "confidence_score": 0.0 to 1.0,
    "ioc_summary": ["list of key IOCs identified"]
}}"""
    return prompt

# COMMAND ----------

def analyze_case(case_data, evidence):
    """Use LLM to generate investigation analysis for a case."""
    with mon.time("llm_investigation_analysis"):
        prompt = build_investigation_prompt(case_data, evidence)
        result = llm.extract_json(prompt)

        if not result or "summary" not in result:
            mon.log_event("llm_analysis_failed", {"case_id": case_data["case_id"]})
            return None

        mon.log_event("llm_analysis_complete", {
            "case_id": case_data["case_id"],
            "kill_chain_phase": result.get("kill_chain_phase", "unknown"),
            "confidence": result.get("confidence_score", 0.0)
        })
        return result

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Investigation Reports

# COMMAND ----------

def store_report(case_id, analysis):
    """Persist the investigation report to the reports table."""
    with mon.time("store_report"):
        report_id = f"RPT-{case_id}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"
        now = datetime.now(timezone.utc)

        report_data = [(
            report_id,
            case_id,
            analysis["summary"],
            json.dumps(analysis.get("timeline", []), default=str),
            analysis.get("kill_chain_phase", "unknown"),
            json.dumps(analysis.get("recommended_actions", []), default=str),
            float(analysis.get("confidence_score", 0.0)),
            AGENT_NAME,
            now,
            "completed"
        )]

        schema = StructType([
            StructField("report_id", StringType(), False),
            StructField("case_id", StringType(), False),
            StructField("investigation_summary", StringType(), True),
            StructField("timeline_json", StringType(), True),
            StructField("kill_chain_phase", StringType(), True),
            StructField("recommended_actions", StringType(), True),
            StructField("confidence_score", FloatType(), True),
            StructField("generated_by", StringType(), True),
            StructField("generated_at", TimestampType(), True),
            StructField("status", StringType(), True),
        ])

        report_df = spark.createDataFrame(report_data, schema)
        report_df.write.mode("append").saveAsTable(reports_table)

        mon.log_event("report_stored", {"report_id": report_id, "case_id": case_id})
        return report_id

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution

# COMMAND ----------

def run():
    """Main execution loop for the Nova Investigation agent."""
    results = {
        "agent": AGENT_NAME,
        "version": AGENT_VERSION,
        "started_at": datetime.now(timezone.utc).isoformat(),
        "cases_processed": 0,
        "reports_generated": 0,
        "errors": []
    }

    try:
        open_cases = get_open_cases()
        case_list = open_cases.collect()
        results["total_open_cases"] = len(case_list)

        for case_row in case_list:
            case_data = case_row.asDict()
            case_id = case_data["case_id"]

            try:
                with mon.time(f"process_case_{case_id}"):
                    evidence = gather_case_evidence(case_id)

                    if evidence["alert_count"] == 0 and evidence["event_count"] == 0:
                        mon.log_event("case_skipped_no_evidence", {"case_id": case_id})
                        continue

                    analysis = analyze_case(case_data, evidence)

                    if analysis:
                        report_id = store_report(case_id, analysis)
                        results["reports_generated"] += 1
                    else:
                        results["errors"].append(f"LLM analysis failed for {case_id}")

                    results["cases_processed"] += 1

            except Exception as case_err:
                mon.log_error(f"Error processing case {case_id}", exception=case_err)
                results["errors"].append(f"{case_id}: {str(case_err)}")

        results["completed_at"] = datetime.now(timezone.utc).isoformat()
        results["status"] = "success"
        mon.log_complete(results)

    except Exception as e:
        results["status"] = "failed"
        results["error"] = str(e)
        mon.log_error("Nova Investigation agent failed", exception=e)

    return results

# COMMAND ----------

result = run()
dbutils.notebook.exit(json.dumps(result, default=str))
