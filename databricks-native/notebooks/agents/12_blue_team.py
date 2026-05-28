# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("blue_team")

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 12 - Blue Team
# MAGIC Analyzes detection coverage against MITRE ATT&CK matrix. Identifies gaps,
# MAGIC calculates MTTD per severity, and uses LLM to recommend new detection rules.

# COMMAND ----------

import json
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.window import Window

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Correlation Rules for Technique Coverage

# COMMAND ----------

mon.time("blue_team_init")

rules_table = cfg.get_table_path("correlation_rules")
alerts_table = cfg.get_table_path("alerts")
events_table = cfg.get_table_path("events")
coverage_table = cfg.get_table_path("blue_team_coverage")

rules_df = spark.read.table(rules_table).filter(F.col("status") == "active")
covered_techniques = (
    rules_df
    .select(F.explode(F.from_json(F.col("mitre_mapping"), "array<string>")).alias("technique"))
    .distinct()
)

mon.log_event("rules_loaded", {"active_rules": rules_df.count()})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define Full MITRE ATT&CK Technique Set

# COMMAND ----------

MITRE_TECHNIQUES = [
    {"id": "T1566.001", "tactic": "initial_access", "name": "Spearphishing Attachment"},
    {"id": "T1059.001", "tactic": "execution", "name": "PowerShell"},
    {"id": "T1053.005", "tactic": "persistence", "name": "Scheduled Task"},
    {"id": "T1068", "tactic": "privilege_escalation", "name": "Exploitation for Privilege Escalation"},
    {"id": "T1070.004", "tactic": "defense_evasion", "name": "File Deletion"},
    {"id": "T1003.001", "tactic": "credential_access", "name": "LSASS Memory"},
    {"id": "T1083", "tactic": "discovery", "name": "File and Directory Discovery"},
    {"id": "T1021.002", "tactic": "lateral_movement", "name": "SMB/Windows Admin Shares"},
    {"id": "T1560.001", "tactic": "collection", "name": "Archive via Utility"},
    {"id": "T1048.003", "tactic": "exfiltration", "name": "Exfiltration Over Unencrypted Protocol"},
    {"id": "T1486", "tactic": "impact", "name": "Data Encrypted for Impact"},
    {"id": "T1110.004", "tactic": "credential_access", "name": "Credential Stuffing"},
    {"id": "T1195.002", "tactic": "initial_access", "name": "Compromise Software Supply Chain"},
    {"id": "T1078", "tactic": "initial_access", "name": "Valid Accounts"},
    {"id": "T1071.001", "tactic": "command_and_control", "name": "Web Protocols"},
    {"id": "T1562.001", "tactic": "defense_evasion", "name": "Disable or Modify Tools"},
    {"id": "T1046", "tactic": "discovery", "name": "Network Service Discovery"},
    {"id": "T1027", "tactic": "defense_evasion", "name": "Obfuscated Files or Information"},
    {"id": "T1105", "tactic": "command_and_control", "name": "Ingress Tool Transfer"},
    {"id": "T1036.005", "tactic": "defense_evasion", "name": "Match Legitimate Name or Location"},
]

mitre_df = spark.createDataFrame(MITRE_TECHNIQUES)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Coverage Gaps

# COMMAND ----------

mon.time("gap_analysis")

gaps_df = (
    mitre_df.alias("m")
    .join(covered_techniques.alias("c"), mitre_df["id"] == covered_techniques["technique"], "left_anti")
)

gap_count = gaps_df.count()
total_techniques = mitre_df.count()
covered_count = total_techniques - gap_count
coverage_pct = (covered_count / total_techniques) * 100 if total_techniques > 0 else 0.0

mon.log_event("coverage_gaps_identified", {
    "total_techniques": total_techniques,
    "covered": covered_count,
    "gaps": gap_count,
    "coverage_pct": round(coverage_pct, 2),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Calculate MTTD Per Severity

# COMMAND ----------

mon.time("mttd_calculation")

alerts_with_events = (
    spark.read.table(alerts_table).alias("a")
    .join(spark.read.table(events_table).alias("e"), F.col("a.source_event_id") == F.col("e.event_id"))
    .withColumn("detection_lag_seconds",
                F.unix_timestamp(F.col("a.created_at")) - F.unix_timestamp(F.col("e.timestamp")))
    .filter(F.col("detection_lag_seconds") > 0)
    .filter(F.col("detection_lag_seconds") < 86400)
)

mttd_by_severity = (
    alerts_with_events
    .groupBy("a.severity")
    .agg(
        F.avg("detection_lag_seconds").alias("avg_mttd_seconds"),
        F.expr("percentile_approx(detection_lag_seconds, 0.5)").alias("median_mttd_seconds"),
        F.expr("percentile_approx(detection_lag_seconds, 0.95)").alias("p95_mttd_seconds"),
        F.count("*").alias("sample_size"),
    )
)

mttd_results = mttd_by_severity.collect()
mttd_summary = {row.severity: {"avg": row.avg_mttd_seconds, "p95": row.p95_mttd_seconds} for row in mttd_results}

mon.log_event("mttd_calculated", {"severities_analyzed": len(mttd_results)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Recommendations for Top Gaps

# COMMAND ----------

mon.time("llm_recommendations")

top_gaps = gaps_df.collect()[:5]
recommendations = []

for gap in top_gaps:
    prompt = (
        f"Recommend a detection rule for MITRE ATT&CK technique {gap['id']} "
        f"({gap['name']}, tactic: {gap['tactic']}). "
        f"Return JSON with fields: rule_name, detection_logic, data_sources (array), "
        f"false_positive_notes, estimated_fidelity (high/medium/low)."
    )
    try:
        rec = llm.extract_json(prompt)
        rec["technique_id"] = gap["id"]
        rec["tactic"] = gap["tactic"]
        recommendations.append(rec)
    except Exception as e:
        mon.log_error("llm_recommendation_failed", {"technique": gap["id"], "error": str(e)})

mon.log_event("recommendations_generated", {"count": len(recommendations)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Store Analysis in blue_team_coverage Table

# COMMAND ----------

mon.time("store_results")

analysis_record = [{
    "analysis_id": f"bt_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
    "run_timestamp": datetime.utcnow(),
    "total_techniques": total_techniques,
    "covered_techniques": covered_count,
    "coverage_pct": coverage_pct,
    "gap_count": gap_count,
    "mttd_summary": json.dumps(mttd_summary, default=str),
    "gap_techniques": json.dumps([g["id"] for g in top_gaps]),
    "recommendations": json.dumps(recommendations, default=str),
    "status": "healthy" if coverage_pct >= 70 else "gaps_identified",
}]

analysis_df = spark.createDataFrame(analysis_record)
analysis_df.write.format("delta").mode("append").saveAsTable(coverage_table)

mon.log_complete("blue_team_analysis", {
    "coverage_pct": round(coverage_pct, 2),
    "gap_count": gap_count,
    "recommendations": len(recommendations),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Exit

# COMMAND ----------

result = {
    "agent": "12_blue_team",
    "coverage_pct": round(coverage_pct, 2),
    "total_techniques": total_techniques,
    "gaps_found": gap_count,
    "mttd_summary": mttd_summary,
    "recommendations_generated": len(recommendations),
    "status": analysis_record[0]["status"],
}

dbutils.notebook.exit(json.dumps(result, default=str))
