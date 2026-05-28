# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 01: SOC L1 Triage Agent
# MAGIC
# MAGIC Classifies incoming alerts as TRUE_POSITIVE, FALSE_POSITIVE, or NEEDS_INVESTIGATION
# MAGIC using a combination of rule-based pattern matching and LLM classification.
# MAGIC
# MAGIC - Known false-positive patterns are auto-closed (fast path)
# MAGIC - Remaining alerts scored by LLM with structured JSON output
# MAGIC - Results written to Delta with full audit trail

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("triage_agent")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("batch_size", "50", "Max alerts to process per run")
dbutils.widgets.text("lookback_hours", "1", "Alert age window")
dbutils.widgets.text("auto_close_confidence", "0.95", "Confidence to auto-close FP")

batch_size = int(dbutils.widgets.get("batch_size"))
lookback_hours = int(dbutils.widgets.get("lookback_hours"))
auto_close_confidence = float(dbutils.widgets.get("auto_close_confidence"))

mon.log_event("config_loaded", {
    "batch_size": batch_size,
    "lookback_hours": lookback_hours,
})

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
import json

# COMMAND ----------

# MAGIC %md
# MAGIC ## Known False-Positive Patterns (Fast Path)

# COMMAND ----------

FP_PATTERNS = [
    {"event_type": "authentication_failure", "source_contains": "health-check", "reason": "Health check probe"},
    {"event_type": "network_connection", "source_contains": "monitoring", "reason": "Monitoring system"},
    {"event_type": "dns_query", "dest_contains": "internal.corp", "reason": "Internal DNS resolution"},
    {"event_type": "authentication_failure", "source_contains": "load-balancer", "reason": "LB health probe"},
    {"event_type": "port_scan", "source_contains": "vulnerability-scanner", "reason": "Scheduled vuln scan"},
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch New Alerts

# COMMAND ----------

alerts_table = cfg.get_table_path("alerts")
triage_table = cfg.get_table_path("agent_triage_results")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {triage_table} (
        id STRING,
        alert_id STRING,
        classification STRING,
        confidence DOUBLE,
        reasoning STRING,
        triage_method STRING,
        mitre_tactic STRING,
        recommended_severity STRING,
        agent_name STRING,
        triaged_at TIMESTAMP
    )
    USING DELTA
    TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

with mon.time("fetch_alerts"):
    new_alerts = spark.sql(f"""
        SELECT a.*
        FROM {alerts_table} a
        LEFT JOIN {triage_table} t ON a.id = t.alert_id
        WHERE a.status = 'new'
          AND a.created_at > current_timestamp() - INTERVAL {lookback_hours} HOURS
          AND t.alert_id IS NULL
        ORDER BY
            CASE a.severity
                WHEN 'critical' THEN 1 WHEN 'high' THEN 2
                WHEN 'medium' THEN 3 ELSE 4
            END,
            a.created_at DESC
        LIMIT {batch_size}
    """)

    alert_count = new_alerts.count()
    mon.log_event("alerts_fetched", {"count": alert_count})

    if alert_count == 0:
        mon.log_complete(details={"status": "idle", "alerts": 0})
        dbutils.notebook.exit('{"status": "idle", "triaged": 0}')

# COMMAND ----------

# MAGIC %md
# MAGIC ## Rule-Based Fast-Path Triage

# COMMAND ----------

alerts_data = new_alerts.collect()
fp_closed = []
needs_llm = []

with mon.time("rule_based_triage"):
    for alert in alerts_data:
        matched_fp = False
        for pattern in FP_PATTERNS:
            if alert.event_type and pattern.get("event_type") == alert.event_type:
                combined = f"{(alert.description or '').lower()} {(alert.title or '').lower()}"
                check_field = pattern.get("source_contains") or pattern.get("dest_contains", "")
                if check_field and check_field in combined:
                    fp_closed.append({
                        "alert_id": alert.id,
                        "classification": "FALSE_POSITIVE",
                        "confidence": 0.97,
                        "reasoning": pattern["reason"],
                        "triage_method": "rule_based",
                    })
                    matched_fp = True
                    break

        if not matched_fp:
            needs_llm.append(alert)

    print(f"Rule-based: {len(fp_closed)} auto-closed, {len(needs_llm)} need LLM triage")

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM-Based Triage

# COMMAND ----------

TRIAGE_PROMPT = """You are a SOC Level 1 analyst. Classify this alert.

Alert:
- Title: {title}
- Description: {description}
- Severity: {severity}
- Source: {source}
- Created: {created_at}

Respond with JSON only:
{{
  "classification": "TRUE_POSITIVE" | "FALSE_POSITIVE" | "NEEDS_INVESTIGATION",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "recommended_severity": "critical" | "high" | "medium" | "low",
  "mitre_tactic": "TA00XX or null"
}}"""

llm_results = []

with mon.time("llm_triage"):
    for alert in needs_llm:
        try:
            prompt = TRIAGE_PROMPT.format(
                title=alert.title or "N/A",
                description=(alert.description or "N/A")[:500],
                severity=alert.severity or "unknown",
                source=alert.source or "unknown",
                created_at=str(alert.created_at),
            )

            response = llm.extract_json(prompt)

            if response and isinstance(response, dict):
                llm_results.append({
                    "alert_id": alert.id,
                    "classification": response.get("classification", "NEEDS_INVESTIGATION"),
                    "confidence": min(1.0, max(0.0, float(response.get("confidence", 0.5)))),
                    "reasoning": str(response.get("reasoning", ""))[:500],
                    "triage_method": "llm",
                    "mitre_tactic": response.get("mitre_tactic"),
                    "recommended_severity": response.get("recommended_severity"),
                })
            else:
                llm_results.append({
                    "alert_id": alert.id,
                    "classification": "NEEDS_INVESTIGATION",
                    "confidence": 0.3,
                    "reasoning": "LLM returned invalid response",
                    "triage_method": "llm_fallback",
                })

        except Exception as e:
            mon.log_event("llm_triage_error", {"alert_id": alert.id, "error": str(e)[:200]})
            llm_results.append({
                "alert_id": alert.id,
                "classification": "NEEDS_INVESTIGATION",
                "confidence": 0.2,
                "reasoning": f"LLM error: {str(e)[:100]}",
                "triage_method": "llm_error",
            })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Triage Results

# COMMAND ----------

all_results = fp_closed + llm_results

if all_results:
    with mon.time("persist_results"):
        result_schema = StructType([
            StructField("alert_id", StringType()),
            StructField("classification", StringType()),
            StructField("confidence", DoubleType()),
            StructField("reasoning", StringType()),
            StructField("triage_method", StringType()),
            StructField("mitre_tactic", StringType()),
            StructField("recommended_severity", StringType()),
        ])

        results_df = (
            spark.createDataFrame(all_results, schema=result_schema)
            .withColumn("id", expr("uuid()"))
            .withColumn("agent_name", lit("triage_agent"))
            .withColumn("triaged_at", current_timestamp())
        )
        results_df.write.mode("append").saveAsTable(triage_table)

        # Auto-close high-confidence FPs via MERGE
        auto_close_ids = [
            r["alert_id"] for r in all_results
            if r["classification"] == "FALSE_POSITIVE"
            and r.get("confidence", 0) >= auto_close_confidence
        ]

        if auto_close_ids:
            ids_df = spark.createDataFrame([(i,) for i in auto_close_ids], ["id"])
            ids_df.createOrReplaceTempView("_triage_fp_ids")
            spark.sql(f"""
                MERGE INTO {alerts_table} AS target
                USING _triage_fp_ids AS source ON target.id = source.id
                WHEN MATCHED THEN UPDATE SET status = 'closed', false_positive = true
            """)
            spark.sql("DROP VIEW IF EXISTS _triage_fp_ids")

# COMMAND ----------

mon.log_complete(details={
    "alerts_triaged": len(all_results),
    "auto_closed_fp": len(fp_closed),
    "llm_triaged": len(llm_results),
})

result = {"status": "completed", "triaged": len(all_results), "auto_closed": len(fp_closed)}
print(json.dumps(result))
dbutils.notebook.exit(json.dumps(result))
