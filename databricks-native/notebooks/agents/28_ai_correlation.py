# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("ai_correlation")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 28 - AI Correlation (KS Calibrated)
# MAGIC Identifies uncorrelated high-severity events, uses LLM to generate correlation
# MAGIC rules, then applies KS test to calibrate thresholds. Rules with >70% FP auto-disabled.

# COMMAND ----------

import json
import numpy as np
from datetime import datetime, timedelta
from scipy import stats as scipy_stats
from pyspark.sql import functions as F

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

LOOKBACK_HOURS = 6
MIN_SEVERITY = 7
MIN_UNCORRELATED_EVENTS = 5
FP_RATE_THRESHOLD = 0.70
HISTORICAL_DAYS = 30
KS_SIGNIFICANCE = 0.05
events_table = cfg.get_table_path("security_events")
alerts_table = cfg.get_table_path("alerts")
correlation_rules_table = cfg.get_table_path("correlation_rules")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Uncorrelated High-Severity Events (6h window)

# COMMAND ----------

mon.time("find_uncorrelated")
cutoff_time = datetime.utcnow() - timedelta(hours=LOOKBACK_HOURS)

uncorrelated_events = (
    spark.read.table(events_table)
    .filter(F.col("event_time") >= F.lit(cutoff_time))
    .filter(F.col("severity") >= MIN_SEVERITY)
    .filter(F.col("correlation_id").isNull())
    .select("event_id", "event_type", "src_entity", "dst_entity",
            "severity", "event_time", "mitre_tactic", "mitre_technique", "raw_log_summary")
    .cache()
)
uncorrelated_count = uncorrelated_events.count()
mon.log_event("uncorrelated_found", {"count": uncorrelated_count})

if uncorrelated_count < MIN_UNCORRELATED_EVENTS:
    result = {"agent": "28_ai_correlation", "status": "skipped",
              "reason": f"only {uncorrelated_count} events (min: {MIN_UNCORRELATED_EVENTS})",
              "timestamp": datetime.utcnow().isoformat()}
    mon.log_complete(result)
    dbutils.notebook.exit(json.dumps(result))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cluster Events by Type/Tactic for LLM Context

# COMMAND ----------

mon.time("prepare_llm_context")
event_clusters = (
    uncorrelated_events.groupBy("event_type", "mitre_tactic")
    .agg(F.count("*").alias("event_count"),
         F.collect_list("mitre_technique").alias("techniques"),
         F.collect_list("raw_log_summary").alias("sample_logs"),
         F.avg("severity").alias("avg_severity"))
    .filter(F.col("event_count") >= 3)
    .orderBy(F.col("event_count").desc())
    .limit(10)
)
clusters_data = event_clusters.collect()
mon.log_event("clusters_prepared", {"cluster_count": len(clusters_data)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Correlation Rules via LLM

# COMMAND ----------

mon.time("llm_rule_generation")
generated_rules = []
for cluster in clusters_data:
    prompt = (f"Analyze uncorrelated security events and generate a correlation rule as JSON.\n"
              f"Event Type: {cluster['event_type']}, MITRE Tactic: {cluster['mitre_tactic']}\n"
              f"Count: {cluster['event_count']}, Techniques: {list(set(cluster['techniques'][:10]))}\n"
              f"Avg Severity: {cluster['avg_severity']:.1f}, Samples: {cluster['sample_logs'][:3]}\n"
              f"Fields: rule_name, conditions(list), time_window_minutes, threshold_count, "
              f"severity(1-10), mitre_tactic, mitre_technique, description. JSON only.")
    response = llm(prompt)
    try:
        rule = json.loads(response)
        rule["source_event_type"] = cluster["event_type"]
        rule["source_cluster_count"] = int(cluster["event_count"])
        generated_rules.append(rule)
    except (json.JSONDecodeError, KeyError):
        mon.log_event("llm_parse_error", {"event_type": cluster["event_type"]})
mon.log_event("rules_generated", {"count": len(generated_rules)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## KS Test Calibration on Historical Data

# COMMAND ----------

mon.time("ks_calibration")
historical_cutoff = datetime.utcnow() - timedelta(days=HISTORICAL_DAYS)
historical_events = (
    spark.read.table(events_table)
    .filter(F.col("event_time") >= F.lit(historical_cutoff)).cache()
)
historical_alerts = (
    spark.read.table(alerts_table)
    .filter(F.col("created_at") >= F.lit(historical_cutoff))
    .filter(F.col("disposition").isNotNull()).cache()
)

calibrated_rules = []
for rule in generated_rules:
    evt_type = rule.get("source_event_type", "")
    threshold = rule.get("threshold_count", 5)
    win = rule.get("time_window_minutes", 15)
    matching = (historical_events.filter(F.col("event_type") == evt_type)
        .withColumn("tb", F.window(F.col("event_time"), f"{win} minutes"))
        .groupBy("tb").agg(F.count("*").alias("cnt")).select("cnt").collect())
    if len(matching) < 10:
        rule.update({"ks_pvalue": None, "fp_rate": None,
                     "calibration_status": "insufficient_data", "status": "pending_review"})
        calibrated_rules.append(rule); continue
    counts = np.array([r["cnt"] for r in matching])
    if len(counts[counts >= threshold]) == 0:
        rule.update({"ks_pvalue": None, "fp_rate": 1.0,
                     "calibration_status": "no_triggers", "status": "disabled"})
        calibrated_rules.append(rule); continue
    related = (historical_alerts.filter(F.col("source_type") == evt_type)
        .filter(F.col("disposition").isin("true_positive", "false_positive"))
        .select("disposition").collect())
    if related:
        fp_rate = float(np.mean([1.0 if r["disposition"] == "false_positive" else 0.0 for r in related]))
        ks_stat, ks_pv = scipy_stats.ks_2samp(counts[counts >= threshold], counts[counts < threshold])
    else:
        ks_stat, ks_pv, fp_rate = 0.0, 1.0, 0.0
    if fp_rate > FP_RATE_THRESHOLD:
        rule["status"], rule["calibration_status"] = "disabled", "high_fp_rate"
    elif ks_pv < KS_SIGNIFICANCE:
        rule["status"], rule["calibration_status"] = "pending_review", "statistically_significant"
        rule["threshold_count"] = int(np.percentile(counts, 90))
    else:
        rule["status"], rule["calibration_status"] = "pending_review", "calibrated"
    rule.update({"ks_pvalue": round(float(ks_pv), 6), "ks_statistic": round(float(ks_stat), 6),
                 "fp_rate": round(fp_rate, 4)})
    calibrated_rules.append(rule)

mon.log_event("calibration_complete", {
    "total": len(calibrated_rules),
    "disabled": sum(1 for r in calibrated_rules if r.get("status") == "disabled"),
    "pending": sum(1 for r in calibrated_rules if r.get("status") == "pending_review"),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Rules in correlation_rules Table

# COMMAND ----------

mon.time("store_rules")
rules_stored = 0
if calibrated_rules:
    run_ts = datetime.utcnow()
    rows = [{
        "rule_id": f"auto_{run_ts.strftime('%Y%m%d%H%M%S')}_{i}",
        "rule_name": r.get("rule_name", "unnamed"), "description": r.get("description", ""),
        "conditions": json.dumps(r.get("conditions", [])),
        "time_window_minutes": int(r.get("time_window_minutes", 15)),
        "threshold_count": int(r.get("threshold_count", 5)),
        "severity": int(r.get("severity", 5)),
        "mitre_tactic": r.get("mitre_tactic", ""), "mitre_technique": r.get("mitre_technique", ""),
        "status": r.get("status", "pending_review"),
        "calibration_status": r.get("calibration_status", ""),
        "ks_pvalue": r.get("ks_pvalue"), "ks_statistic": r.get("ks_statistic"),
        "fp_rate": r.get("fp_rate"), "created_at": run_ts.isoformat(),
        "source": "agent_28_ai_correlation",
    } for i, r in enumerate(calibrated_rules)]
    rules_stored = len(rows)
    spark.createDataFrame(rows).write.mode("append").saveAsTable(correlation_rules_table)
    mon.log_event("rules_stored", {"count": rules_stored})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

disabled_count = sum(1 for r in calibrated_rules if r.get("status") == "disabled")
pending_count = sum(1 for r in calibrated_rules if r.get("status") == "pending_review")
result = {
    "agent": "28_ai_correlation", "status": "success",
    "uncorrelated_events": uncorrelated_count,
    "clusters_analyzed": len(clusters_data),
    "rules_generated": len(generated_rules), "rules_stored": rules_stored,
    "rules_disabled_high_fp": disabled_count, "rules_pending_review": pending_count,
    "fp_rate_threshold": FP_RATE_THRESHOLD, "timestamp": datetime.utcnow().isoformat(),
}
mon.log_complete(result)
dbutils.notebook.exit(json.dumps(result))
