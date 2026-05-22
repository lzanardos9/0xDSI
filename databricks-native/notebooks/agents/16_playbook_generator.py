# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 16 - Playbook Generator
# MAGIC Queries alerts grouped by MITRE ATT&CK technique that lack automated playbooks.
# MAGIC Uses LLM to generate structured SOAR playbooks with steps, conditions, actions,
# MAGIC and escalation paths. Stores results in `generated_playbooks` table.
# MAGIC Cap: 10 playbooks per run.

# COMMAND ----------

import json
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, IntegerType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

PLAYBOOKS_TABLE = cfg.get_table_path("generated_playbooks")
ALERTS_TABLE = cfg.get_table_path("alerts")
MAX_PLAYBOOKS_PER_RUN = 10

result = {
    "agent": "16_playbook_generator",
    "run_ts": datetime.utcnow().isoformat(),
    "playbooks_generated": 0,
    "techniques_processed": [],
    "errors": []
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Identify Techniques Lacking Playbooks

# COMMAND ----------

mon.time("query_techniques")

# Get alerts grouped by MITRE technique
alerts_df = spark.read.table(ALERTS_TABLE)

technique_counts = (
    alerts_df
    .filter(F.col("mitre_technique").isNotNull())
    .groupBy("mitre_technique", "mitre_tactic")
    .agg(
        F.count("*").alias("alert_count"),
        F.max("severity").alias("max_severity"),
        F.collect_set("alert_type").alias("alert_types")
    )
    .orderBy(F.desc("alert_count"))
)

# Filter out techniques that already have playbooks
existing_playbooks_df = spark.read.table(PLAYBOOKS_TABLE)
existing_techniques = (
    existing_playbooks_df
    .select("mitre_technique")
    .distinct()
)

techniques_needing_playbooks = (
    technique_counts
    .join(existing_techniques, on="mitre_technique", how="left_anti")
    .limit(MAX_PLAYBOOKS_PER_RUN)
)

techniques_list = techniques_needing_playbooks.collect()
mon.log_event("techniques_identified", count=len(techniques_list))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Playbooks via LLM

# COMMAND ----------

mon.time("generate_playbooks")

generated_playbooks = []

for row in techniques_list:
    technique = row["mitre_technique"]
    tactic = row["mitre_tactic"]
    alert_count = row["alert_count"]
    max_severity = row["max_severity"]
    alert_types = row["alert_types"]

    prompt = f"""Generate a structured SOAR playbook for the following MITRE ATT&CK technique.

Technique: {technique}
Tactic: {tactic}
Associated alert types: {json.dumps(alert_types)}
Alert frequency: {alert_count} alerts observed
Maximum severity seen: {max_severity}

Return a JSON object with:
{{
  "playbook_name": "descriptive name",
  "description": "brief description of what this playbook handles",
  "steps": [
    {{
      "order": 1,
      "action": "action description",
      "type": "enrich|contain|investigate|notify",
      "automated": true/false,
      "timeout_minutes": 5
    }}
  ],
  "conditions": [
    {{
      "field": "field to evaluate",
      "operator": "equals|contains|greater_than",
      "value": "threshold value",
      "branch_to_step": 3
    }}
  ],
  "escalation": {{
    "timeout_minutes": 30,
    "escalate_to": "tier2|tier3|management",
    "criteria": "when to escalate"
  }},
  "actions": {{
    "containment": ["list of containment actions"],
    "eradication": ["list of eradication actions"],
    "recovery": ["list of recovery actions"]
  }}
}}"""

    try:
        playbook_data = llm.extract_json(prompt)

        playbook_record = {
            "playbook_id": f"PB-{technique.replace('.', '-')}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "mitre_technique": technique,
            "mitre_tactic": tactic,
            "playbook_name": playbook_data.get("playbook_name", ""),
            "description": playbook_data.get("description", ""),
            "steps_json": json.dumps(playbook_data.get("steps", [])),
            "conditions_json": json.dumps(playbook_data.get("conditions", [])),
            "escalation_json": json.dumps(playbook_data.get("escalation", {})),
            "actions_json": json.dumps(playbook_data.get("actions", {})),
            "source_alert_count": alert_count,
            "max_severity_observed": max_severity,
            "generated_at": datetime.utcnow().isoformat(),
            "status": "draft",
            "version": 1
        }

        generated_playbooks.append(playbook_record)
        result["techniques_processed"].append(technique)
        mon.log_event("playbook_generated", technique=technique)

    except Exception as e:
        error_msg = f"Failed to generate playbook for {technique}: {str(e)}"
        result["errors"].append(error_msg)
        mon.log_event("playbook_generation_error", technique=technique, error=str(e))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Generated Playbooks to Table

# COMMAND ----------

mon.time("write_playbooks")

if generated_playbooks:
    playbooks_df = spark.createDataFrame(generated_playbooks)
    playbooks_df.write.mode("append").saveAsTable(PLAYBOOKS_TABLE)
    result["playbooks_generated"] = len(generated_playbooks)
    mon.log_event("playbooks_written", count=len(generated_playbooks))
else:
    mon.log_event("no_playbooks_needed")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

mon.log_complete(
    agent="16_playbook_generator",
    playbooks_generated=result["playbooks_generated"],
    errors=len(result["errors"])
)

dbutils.notebook.exit(json.dumps(result))
