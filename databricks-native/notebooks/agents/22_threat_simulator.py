# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 22 - Threat Simulator
# MAGIC Generates synthetic APT telemetry for pipeline testing. Defines attack scenarios
# MAGIC with realistic kill chain progression. Uses seeded random generation for
# MAGIC reproducibility. Inserts synthetic events marked with `is_simulation=true`.
# MAGIC Records simulation metadata in `threat_simulations` table.

# COMMAND ----------

import json
import random
import uuid
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, BooleanType,
    TimestampType, IntegerType, ArrayType
)

# COMMAND ----------

# Configuration
SIMULATION_SEED = 42
SIMULATION_ID = str(uuid.uuid4())
notebook_start = datetime.utcnow()
mon.time("threat_simulator_total")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define Attack Scenarios

# COMMAND ----------

ATTACK_SCENARIOS = [
    {
        "scenario_id": "apt_lateral_movement",
        "name": "APT29 Lateral Movement Campaign",
        "description": "Simulates credential theft followed by lateral movement across network segments",
        "kill_chain": [
            {"step": 1, "event_type": "phishing_click", "source_ip": "10.0.1.50", "dest_ip": "203.0.113.45", "action": "outbound_http_to_c2", "severity": "medium"},
            {"step": 2, "event_type": "malware_download", "source_ip": "203.0.113.45", "dest_ip": "10.0.1.50", "action": "payload_delivery_dll", "severity": "high"},
            {"step": 3, "event_type": "credential_dump", "source_ip": "10.0.1.50", "dest_ip": "10.0.1.50", "action": "lsass_memory_access", "severity": "critical"},
            {"step": 4, "event_type": "lateral_movement", "source_ip": "10.0.1.50", "dest_ip": "10.0.2.30", "action": "smb_psexec_remote", "severity": "high"},
            {"step": 5, "event_type": "lateral_movement", "source_ip": "10.0.2.30", "dest_ip": "10.0.3.10", "action": "wmi_remote_execution", "severity": "high"},
            {"step": 6, "event_type": "privilege_escalation", "source_ip": "10.0.3.10", "dest_ip": "10.0.3.10", "action": "token_impersonation", "severity": "critical"},
            {"step": 7, "event_type": "data_staging", "source_ip": "10.0.3.10", "dest_ip": "10.0.3.10", "action": "archive_sensitive_files", "severity": "high"},
            {"step": 8, "event_type": "exfiltration", "source_ip": "10.0.3.10", "dest_ip": "198.51.100.77", "action": "dns_tunnel_exfil", "severity": "critical"}
        ]
    },
    {
        "scenario_id": "ransomware_deployment",
        "name": "Ransomware Deployment via Supply Chain",
        "description": "Simulates supply chain compromise leading to ransomware across domain controllers",
        "kill_chain": [
            {"step": 1, "event_type": "supply_chain_compromise", "source_ip": "10.1.0.5", "dest_ip": "172.16.0.100", "action": "trojanized_update_install", "severity": "high"},
            {"step": 2, "event_type": "persistence", "source_ip": "10.1.0.5", "dest_ip": "10.1.0.5", "action": "scheduled_task_creation", "severity": "medium"},
            {"step": 3, "event_type": "discovery", "source_ip": "10.1.0.5", "dest_ip": "10.1.0.1", "action": "ad_enumeration_ldap", "severity": "medium"},
            {"step": 4, "event_type": "credential_access", "source_ip": "10.1.0.5", "dest_ip": "10.1.0.20", "action": "kerberoasting_attack", "severity": "high"},
            {"step": 5, "event_type": "lateral_movement", "source_ip": "10.1.0.5", "dest_ip": "10.1.0.20", "action": "rdp_with_stolen_creds", "severity": "high"},
            {"step": 6, "event_type": "defense_evasion", "source_ip": "10.1.0.20", "dest_ip": "10.1.0.20", "action": "disable_av_tamper_protection", "severity": "critical"},
            {"step": 7, "event_type": "encryption", "source_ip": "10.1.0.20", "dest_ip": "10.1.0.0/24", "action": "mass_file_encryption", "severity": "critical"}
        ]
    },
    {
        "scenario_id": "insider_data_theft",
        "name": "Insider Threat Data Exfiltration",
        "description": "Simulates a privileged insider systematically exfiltrating sensitive data",
        "kill_chain": [
            {"step": 1, "event_type": "abnormal_access", "source_ip": "10.5.1.100", "dest_ip": "10.5.2.50", "action": "access_outside_business_hours", "severity": "low"},
            {"step": 2, "event_type": "privilege_abuse", "source_ip": "10.5.1.100", "dest_ip": "10.5.3.200", "action": "access_unauthorized_share", "severity": "medium"},
            {"step": 3, "event_type": "data_collection", "source_ip": "10.5.1.100", "dest_ip": "10.5.3.200", "action": "bulk_file_copy_pii", "severity": "high"},
            {"step": 4, "event_type": "data_staging", "source_ip": "10.5.1.100", "dest_ip": "10.5.1.100", "action": "compress_and_encrypt_local", "severity": "medium"},
            {"step": 5, "event_type": "exfiltration", "source_ip": "10.5.1.100", "dest_ip": "104.18.32.7", "action": "upload_to_personal_cloud", "severity": "critical"}
        ]
    }
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Synthetic Events

# COMMAND ----------

mon.time("generate_events")
rng = random.Random(SIMULATION_SEED)

synthetic_events = []
base_time = datetime.utcnow()

for scenario in ATTACK_SCENARIOS:
    scenario_start = base_time - timedelta(minutes=rng.randint(60, 480))
    step_interval_minutes = rng.randint(5, 30)

    for step in scenario["kill_chain"]:
        event_time = scenario_start + timedelta(minutes=step["step"] * step_interval_minutes)
        jitter_seconds = rng.randint(-120, 120)
        event_time = event_time + timedelta(seconds=jitter_seconds)

        event = {
            "event_id": str(uuid.UUID(int=rng.getrandbits(128))),
            "simulation_id": SIMULATION_ID,
            "scenario_id": scenario["scenario_id"],
            "event_type": step["event_type"],
            "source_ip": step["source_ip"],
            "dest_ip": step["dest_ip"],
            "action": step["action"],
            "severity": step["severity"],
            "kill_chain_step": step["step"],
            "event_ts": event_time,
            "is_simulation": True,
            "generated_at": notebook_start
        }
        synthetic_events.append(event)

mon.log_event("events_generated", {"total_events": len(synthetic_events)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Synthetic Events via DataFrame

# COMMAND ----------

mon.time("write_events")

events_path = cfg.get_table_path("security_events")
events_df = spark.createDataFrame(synthetic_events)

events_df = events_df.withColumn(
    "ingestion_ts", F.current_timestamp()
).withColumn(
    "source_system", F.lit("threat_simulator")
)

events_df.write.mode("append").saveAsTable(events_path)

mon.log_event("events_written", {"count": events_df.count()})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Simulation Metadata

# COMMAND ----------

mon.time("write_metadata")

simulations_path = cfg.get_table_path("threat_simulations")

simulation_metadata = [{
    "simulation_id": SIMULATION_ID,
    "seed": SIMULATION_SEED,
    "scenarios_executed": len(ATTACK_SCENARIOS),
    "total_events_generated": len(synthetic_events),
    "scenario_ids": json.dumps([s["scenario_id"] for s in ATTACK_SCENARIOS]),
    "started_at": notebook_start,
    "completed_at": datetime.utcnow(),
    "status": "completed"
}]

metadata_df = spark.createDataFrame(simulation_metadata)
metadata_df.write.mode("append").saveAsTable(simulations_path)

mon.log_event("metadata_recorded", {"simulation_id": SIMULATION_ID})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

mon.log_complete()

result = {
    "status": "success",
    "agent": "22_threat_simulator",
    "simulation_id": SIMULATION_ID,
    "scenarios_executed": len(ATTACK_SCENARIOS),
    "total_events_generated": len(synthetic_events),
    "seed": SIMULATION_SEED,
    "execution_time_sec": (datetime.utcnow() - notebook_start).total_seconds()
}

dbutils.notebook.exit(json.dumps(result))
