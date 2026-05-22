# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 11 - Red Team
# MAGIC Generates synthetic attack events matching MITRE kill chains for detection testing.
# MAGIC Injects simulated APT scenarios and measures detection pipeline coverage.

# COMMAND ----------

import json
import time
import hashlib
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, BooleanType, TimestampType

# COMMAND ----------

# MAGIC %md
# MAGIC ## APT Scenario Definitions

# COMMAND ----------

mon.time("red_team_init")

APT_SCENARIOS = [
    {
        "name": "credential_lateral_exfil",
        "description": "Credential stuffing -> lateral movement -> data exfiltration",
        "kill_chain": [
            {"phase": "initial_access", "technique": "T1110.004", "event_type": "brute_force_login", "severity": "medium"},
            {"phase": "credential_access", "technique": "T1003.001", "event_type": "lsass_memory_dump", "severity": "high"},
            {"phase": "lateral_movement", "technique": "T1021.002", "event_type": "smb_admin_share", "severity": "high"},
            {"phase": "collection", "technique": "T1560.001", "event_type": "archive_collected_data", "severity": "medium"},
            {"phase": "exfiltration", "technique": "T1048.003", "event_type": "dns_tunnel_exfil", "severity": "critical"},
        ],
    },
    {
        "name": "supply_chain_persistence",
        "description": "Supply chain compromise -> persistence via scheduled tasks",
        "kill_chain": [
            {"phase": "initial_access", "technique": "T1195.002", "event_type": "compromised_package_install", "severity": "critical"},
            {"phase": "execution", "technique": "T1059.001", "event_type": "powershell_encoded_command", "severity": "high"},
            {"phase": "persistence", "technique": "T1053.005", "event_type": "scheduled_task_creation", "severity": "high"},
            {"phase": "defense_evasion", "technique": "T1070.004", "event_type": "indicator_removal_file_delete", "severity": "medium"},
        ],
    },
    {
        "name": "ransomware_deployment",
        "description": "Phishing -> privilege escalation -> ransomware deployment",
        "kill_chain": [
            {"phase": "initial_access", "technique": "T1566.001", "event_type": "spearphishing_attachment", "severity": "medium"},
            {"phase": "privilege_escalation", "technique": "T1068", "event_type": "exploit_privilege_escalation", "severity": "high"},
            {"phase": "discovery", "technique": "T1083", "event_type": "file_directory_discovery", "severity": "low"},
            {"phase": "impact", "technique": "T1486", "event_type": "data_encrypted_for_impact", "severity": "critical"},
        ],
    },
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Synthetic Attack Events

# COMMAND ----------

mon.time("event_generation")

simulation_id = hashlib.sha256(f"redteam_{datetime.utcnow().isoformat()}".encode()).hexdigest()[:16]
events_table = cfg.get_table_path("events")
simulations_table = cfg.get_table_path("red_team_simulations")

synthetic_events = []
base_time = datetime.utcnow()

for scenario in APT_SCENARIOS:
    scenario_start = base_time
    for idx, step in enumerate(scenario["kill_chain"]):
        event_time = scenario_start + timedelta(minutes=idx * 5)
        synthetic_events.append({
            "event_id": f"sim_{simulation_id}_{scenario['name']}_{idx}",
            "timestamp": event_time,
            "event_type": step["event_type"],
            "mitre_technique": step["technique"],
            "mitre_phase": step["phase"],
            "severity": step["severity"],
            "source_ip": f"10.0.{idx}.{100 + idx}",
            "destination_ip": f"192.168.1.{50 + idx}",
            "scenario_name": scenario["name"],
            "simulation_id": simulation_id,
            "is_simulation": True,
        })

mon.log_event("synthetic_events_generated", {"count": len(synthetic_events), "simulation_id": simulation_id})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Inject Events into Detection Pipeline

# COMMAND ----------

mon.time("event_injection")

events_df = spark.createDataFrame(synthetic_events)
events_df.write.format("delta").mode("append").saveAsTable(events_table)

mon.log_event("events_injected", {"table": events_table, "row_count": len(synthetic_events)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Wait and Measure Detection Coverage

# COMMAND ----------

mon.time("detection_measurement")

DETECTION_WAIT_SECONDS = 30
time.sleep(DETECTION_WAIT_SECONDS)

alerts_table = cfg.get_table_path("alerts")
alerts_df = (
    spark.read.table(alerts_table)
    .filter(F.col("source_event_id").startswith(f"sim_{simulation_id}"))
    .filter(F.col("timestamp") >= F.lit(base_time))
)

detected_techniques = set(
    row.mitre_technique for row in alerts_df.select("mitre_technique").distinct().collect()
)

all_techniques = set()
for scenario in APT_SCENARIOS:
    for step in scenario["kill_chain"]:
        all_techniques.add(step["technique"])

missed_techniques = all_techniques - detected_techniques
detection_rate = len(detected_techniques) / len(all_techniques) if all_techniques else 0.0

mon.log_event("detection_coverage_measured", {
    "detection_rate": detection_rate,
    "detected_count": len(detected_techniques),
    "missed_count": len(missed_techniques),
    "missed_techniques": list(missed_techniques),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Simulation Results

# COMMAND ----------

mon.time("record_results")

run_status = "pass" if detection_rate >= 0.8 else "needs_improvement"

simulation_results = [{
    "simulation_id": simulation_id,
    "run_timestamp": datetime.utcnow(),
    "scenarios_executed": len(APT_SCENARIOS),
    "total_events_injected": len(synthetic_events),
    "techniques_tested": len(all_techniques),
    "techniques_detected": len(detected_techniques),
    "techniques_missed": json.dumps(list(missed_techniques)),
    "detection_rate": detection_rate,
    "detection_wait_seconds": DETECTION_WAIT_SECONDS,
    "status": run_status,
}]

results_df = spark.createDataFrame(simulation_results)
results_df.write.format("delta").mode("append").saveAsTable(simulations_table)

mon.log_complete("red_team_simulation", {
    "simulation_id": simulation_id,
    "detection_rate": detection_rate,
    "status": run_status,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Exit

# COMMAND ----------

result = {
    "agent": "11_red_team",
    "simulation_id": simulation_id,
    "scenarios_executed": len(APT_SCENARIOS),
    "events_injected": len(synthetic_events),
    "detection_rate": round(detection_rate, 4),
    "missed_techniques": list(missed_techniques),
    "status": run_status,
}

dbutils.notebook.exit(json.dumps(result))
