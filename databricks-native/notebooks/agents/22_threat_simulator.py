# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 22 - Threat Simulator
# MAGIC
# MAGIC Production attack simulation engine with three operating modes:
# MAGIC
# MAGIC 1. **PCAP/EVTX Replay**: Replays real captured attack traffic through ingestion
# MAGIC 2. **Sysmon Event Replay**: Injects real Sysmon event logs from curated attack archives
# MAGIC 3. **Structured Synthetic**: Generates kill-chain-aligned events for baseline coverage testing
# MAGIC
# MAGIC Unlike Agent 11 (Red Team) which measures detection coverage post-execution,
# MAGIC this agent focuses on:
# MAGIC - Generating realistic attack TRAFFIC for pipeline stress testing
# MAGIC - Validating parsing/normalization across different log formats
# MAGIC - Testing CEP (Complex Event Processing) temporal pattern detection
# MAGIC - Measuring ingestion throughput under adversarial event volume
# MAGIC
# MAGIC All events flow through the REAL ingestion pipeline (bronze -> silver -> detection).
# MAGIC Nothing bypasses the normal processing path.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("threat_simulator")

# COMMAND ----------

import json
import hashlib
import uuid
import random
import time
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, BooleanType,
    TimestampType, IntegerType, DoubleType, MapType,
)

# COMMAND ----------

dbutils.widgets.text("mode", "structured", "Mode: pcap_replay | sysmon_replay | structured")
dbutils.widgets.text("scenario", "all", "Scenario: all | apt_lateral | ransomware | insider | custom")
dbutils.widgets.text("event_rate_per_second", "100", "Target event injection rate")
dbutils.widgets.text("duration_minutes", "5", "Simulation duration (minutes)")
dbutils.widgets.text("seed", "42", "Random seed for reproducibility")

mode = dbutils.widgets.get("mode")
scenario_filter = dbutils.widgets.get("scenario")
target_eps = int(dbutils.widgets.get("event_rate_per_second"))
duration_minutes = int(dbutils.widgets.get("duration_minutes"))
sim_seed = int(dbutils.widgets.get("seed"))

SIMULATION_ID = hashlib.sha256(f"sim_{datetime.utcnow().isoformat()}_{sim_seed}".encode()).hexdigest()[:16]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Attack Scenario Library (MITRE ATT&CK Mapped)

# COMMAND ----------

ATTACK_SCENARIOS = {
    "apt_lateral": {
        "name": "APT29 Lateral Movement Campaign",
        "description": "Credential theft followed by lateral movement across network segments",
        "mitre_group": "G0016",
        "kill_chain": [
            {"step": 1, "technique": "T1566.001", "tactic": "Initial Access", "event_type": "phishing_click", "severity": "medium", "sysmon_id": 3, "log_source": "proxy"},
            {"step": 2, "technique": "T1105", "tactic": "Command and Control", "event_type": "malware_download", "severity": "high", "sysmon_id": 11, "log_source": "endpoint"},
            {"step": 3, "technique": "T1003.001", "tactic": "Credential Access", "event_type": "credential_dump", "severity": "critical", "sysmon_id": 10, "log_source": "endpoint"},
            {"step": 4, "technique": "T1021.002", "tactic": "Lateral Movement", "event_type": "lateral_movement", "severity": "high", "sysmon_id": 3, "log_source": "endpoint"},
            {"step": 5, "technique": "T1047", "tactic": "Execution", "event_type": "wmi_execution", "severity": "high", "sysmon_id": 1, "log_source": "endpoint"},
            {"step": 6, "technique": "T1134", "tactic": "Privilege Escalation", "event_type": "privilege_escalation", "severity": "critical", "sysmon_id": 1, "log_source": "endpoint"},
            {"step": 7, "technique": "T1560.001", "tactic": "Collection", "event_type": "data_staging", "severity": "high", "sysmon_id": 11, "log_source": "endpoint"},
            {"step": 8, "technique": "T1048.003", "tactic": "Exfiltration", "event_type": "exfiltration", "severity": "critical", "sysmon_id": 22, "log_source": "dns"},
        ],
    },
    "ransomware": {
        "name": "Ransomware Deployment via Supply Chain",
        "description": "Supply chain compromise leading to ransomware across domain controllers",
        "mitre_group": "G0102",
        "kill_chain": [
            {"step": 1, "technique": "T1195.002", "tactic": "Initial Access", "event_type": "supply_chain_compromise", "severity": "high", "sysmon_id": 11, "log_source": "endpoint"},
            {"step": 2, "technique": "T1053.005", "tactic": "Persistence", "event_type": "persistence", "severity": "medium", "sysmon_id": 1, "log_source": "endpoint"},
            {"step": 3, "technique": "T1087.002", "tactic": "Discovery", "event_type": "ad_enumeration", "severity": "medium", "sysmon_id": 3, "log_source": "endpoint"},
            {"step": 4, "technique": "T1558.003", "tactic": "Credential Access", "event_type": "kerberoasting", "severity": "high", "sysmon_id": 3, "log_source": "endpoint"},
            {"step": 5, "technique": "T1021.001", "tactic": "Lateral Movement", "event_type": "rdp_lateral", "severity": "high", "sysmon_id": 3, "log_source": "network"},
            {"step": 6, "technique": "T1562.001", "tactic": "Defense Evasion", "event_type": "disable_av", "severity": "critical", "sysmon_id": 1, "log_source": "endpoint"},
            {"step": 7, "technique": "T1486", "tactic": "Impact", "event_type": "mass_encryption", "severity": "critical", "sysmon_id": 11, "log_source": "endpoint"},
        ],
    },
    "insider": {
        "name": "Insider Threat Data Exfiltration",
        "description": "Privileged insider systematically exfiltrating sensitive data",
        "mitre_group": "insider",
        "kill_chain": [
            {"step": 1, "technique": "T1078", "tactic": "Defense Evasion", "event_type": "abnormal_access", "severity": "low", "sysmon_id": 4624, "log_source": "auth"},
            {"step": 2, "technique": "T1530", "tactic": "Collection", "event_type": "privilege_abuse", "severity": "medium", "sysmon_id": 11, "log_source": "dlp"},
            {"step": 3, "technique": "T1119", "tactic": "Collection", "event_type": "data_collection", "severity": "high", "sysmon_id": 11, "log_source": "dlp"},
            {"step": 4, "technique": "T1560", "tactic": "Collection", "event_type": "data_staging", "severity": "medium", "sysmon_id": 11, "log_source": "endpoint"},
            {"step": 5, "technique": "T1567.002", "tactic": "Exfiltration", "event_type": "cloud_exfiltration", "severity": "critical", "sysmon_id": 3, "log_source": "proxy"},
        ],
    },
}

# Network topology for realistic event generation
NETWORK_TOPOLOGY = {
    "workstations": [f"10.0.1.{i}" for i in range(50, 200)],
    "servers": [f"10.0.2.{i}" for i in range(10, 50)],
    "domain_controllers": ["10.0.2.1", "10.0.2.2"],
    "dns_servers": ["10.0.2.3", "10.0.2.4"],
    "c2_servers": ["198.51.100.77", "203.0.113.45", "91.195.240.94", "185.220.101.12"],
    "cloud_storage": ["104.18.32.7", "13.107.42.12"],
    "internal_segments": ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24", "10.5.0.0/16"],
}

USERS = [f"user{i:03d}" for i in range(1, 50)] + ["svc_backup", "svc_deploy", "admin_ops"]
HOSTNAMES = [f"WS-{i:04d}" for i in range(1, 100)] + [f"SRV-{s}" for s in ["DC01", "DC02", "FS01", "DB01", "WEB01"]]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Event Generation Engine

# COMMAND ----------

try:
    result = {"notebook": "22_threat_simulator", "status": "success", "started_at": datetime.utcnow().isoformat()}
    rng = random.Random(sim_seed)
    notebook_start = datetime.utcnow()

    # Select scenarios to execute
    if scenario_filter == "all":
        scenarios_to_run = list(ATTACK_SCENARIOS.values())
    elif scenario_filter in ATTACK_SCENARIOS:
        scenarios_to_run = [ATTACK_SCENARIOS[scenario_filter]]
    else:
        raise ValueError(f"Unknown scenario: {scenario_filter}. Available: {list(ATTACK_SCENARIOS.keys())}")

    with mon.time("generate_events"):
        if mode == "pcap_replay":
            # --- PCAP/EVTX Replay from stored attack samples ---
            attack_archive_table = cfg.get_table_path("attack_sample_archive")

            technique_ids = []
            for sc in scenarios_to_run:
                for step in sc["kill_chain"]:
                    technique_ids.append(step["technique"])

            # Load REAL captured attack traffic matching these techniques
            archived_events = spark.sql(f"""
                SELECT raw_event, log_source, original_format, mitre_technique,
                       original_timestamp, packet_bytes, event_metadata
                FROM {attack_archive_table}
                WHERE mitre_technique IN ({','.join(f"'{t}'" for t in technique_ids)})
                  AND is_validated = true
                ORDER BY original_timestamp
                LIMIT {target_eps * duration_minutes * 60}
            """)

            archived_count = archived_events.count()

            if archived_count > 0:
                # Re-timestamp to current time window (preserving inter-event timing)
                replayed = (
                    archived_events
                    .withColumn("row_num", F.monotonically_increasing_id())
                    .withColumn("timestamp",
                        F.expr(f"current_timestamp() + make_interval(0,0,0,0,0,0, row_num * {1.0/target_eps})"))
                    .withColumn("simulation_id", F.lit(SIMULATION_ID))
                    .withColumn("is_simulation", F.lit(True))
                    .withColumn("replay_source", F.lit("pcap_archive"))
                    .drop("row_num")
                )

                # Write directly to bronze (real ingestion path)
                safe_append(replayed, "bronze_events", catalog=cfg.catalog, schema=cfg.schema)
                mon.log_metric("pcap_events_replayed", archived_count)
            else:
                mon.log_warning("No archived PCAP/EVTX samples found; falling back to structured mode")
                mode = "structured"

        if mode == "sysmon_replay":
            # --- Sysmon Event Log Replay ---
            sysmon_archive_table = cfg.get_table_path("sysmon_attack_archive")

            sysmon_ids = set()
            for sc in scenarios_to_run:
                for step in sc["kill_chain"]:
                    sysmon_ids.add(step["sysmon_id"])

            sysmon_events = spark.sql(f"""
                SELECT event_id, event_data, sysmon_event_id, process_name,
                       command_line, parent_process, image_hash, target_filename,
                       network_dest_ip, network_dest_port, mitre_technique
                FROM {sysmon_archive_table}
                WHERE sysmon_event_id IN ({','.join(str(s) for s in sysmon_ids)})
                  AND is_malicious = true
                ORDER BY RAND({sim_seed})
                LIMIT {target_eps * duration_minutes * 60}
            """)

            sysmon_count = sysmon_events.count()
            if sysmon_count > 0:
                replayed = (
                    sysmon_events
                    .withColumn("timestamp", F.current_timestamp())
                    .withColumn("simulation_id", F.lit(SIMULATION_ID))
                    .withColumn("is_simulation", F.lit(True))
                    .withColumn("log_source", F.lit("sysmon"))
                    .withColumn("source_system", F.lit("threat_simulator"))
                )
                safe_append(replayed, "bronze_events", catalog=cfg.catalog, schema=cfg.schema)
                mon.log_metric("sysmon_events_replayed", sysmon_count)
            else:
                mon.log_warning("No Sysmon archive data found; falling back to structured mode")
                mode = "structured"

        if mode == "structured":
            # --- Structured Synthetic Generation ---
            # Generates events that match real log schemas (Sysmon, CEF, proxy)
            # but with controlled kill-chain progression for testing temporal correlations
            all_events = []
            base_time = datetime.utcnow()

            for scenario in scenarios_to_run:
                # Assign realistic network entities for this scenario
                attacker_ws = rng.choice(NETWORK_TOPOLOGY["workstations"])
                target_servers = rng.sample(NETWORK_TOPOLOGY["servers"], min(3, len(NETWORK_TOPOLOGY["servers"])))
                c2 = rng.choice(NETWORK_TOPOLOGY["c2_servers"])
                user = rng.choice(USERS)
                hostname = rng.choice(HOSTNAMES)

                step_interval = rng.randint(120, 600)  # 2-10 min between steps

                for step in scenario["kill_chain"]:
                    event_time = base_time + timedelta(seconds=step["step"] * step_interval)
                    jitter = timedelta(seconds=rng.randint(-30, 30))
                    event_time += jitter

                    # Determine source/dest based on kill chain phase
                    if step["tactic"] in ("Initial Access", "Command and Control"):
                        src_ip = attacker_ws
                        dst_ip = c2
                    elif step["tactic"] == "Lateral Movement":
                        src_ip = attacker_ws if step["step"] <= 2 else target_servers[0]
                        dst_ip = rng.choice(target_servers)
                    elif step["tactic"] == "Exfiltration":
                        src_ip = target_servers[-1] if target_servers else attacker_ws
                        dst_ip = rng.choice(NETWORK_TOPOLOGY["c2_servers"] + NETWORK_TOPOLOGY["cloud_storage"])
                    else:
                        src_ip = attacker_ws
                        dst_ip = attacker_ws

                    event = {
                        "id": str(uuid.uuid4()),
                        "timestamp": event_time,
                        "event_type": step["event_type"],
                        "mitre_technique": step["technique"],
                        "mitre_tactic": step["tactic"],
                        "severity": step["severity"],
                        "severity_id": {"low": 1, "medium": 2, "high": 3, "critical": 4}.get(step["severity"], 2),
                        "source_ip": src_ip,
                        "dest_ip": dst_ip,
                        "username": user,
                        "hostname": hostname,
                        "sysmon_event_id": step["sysmon_id"],
                        "log_source": step["log_source"],
                        "scenario_name": scenario["name"],
                        "kill_chain_step": step["step"],
                        "simulation_id": SIMULATION_ID,
                        "is_simulation": True,
                        "source_system": "threat_simulator",
                    }

                    # Generate background noise events between kill chain steps
                    noise_count = rng.randint(5, 20)
                    for n in range(noise_count):
                        noise_time = event_time - timedelta(seconds=rng.randint(1, step_interval))
                        noise_event = {
                            "id": str(uuid.uuid4()),
                            "timestamp": noise_time,
                            "event_type": rng.choice(["dns_query", "http_request", "file_access", "process_start", "auth_success"]),
                            "mitre_technique": None,
                            "mitre_tactic": None,
                            "severity": "info",
                            "severity_id": 0,
                            "source_ip": rng.choice(NETWORK_TOPOLOGY["workstations"]),
                            "dest_ip": rng.choice(NETWORK_TOPOLOGY["servers"] + NETWORK_TOPOLOGY["dns_servers"]),
                            "username": rng.choice(USERS),
                            "hostname": rng.choice(HOSTNAMES),
                            "sysmon_event_id": rng.choice([1, 3, 11, 22]),
                            "log_source": rng.choice(["endpoint", "proxy", "dns"]),
                            "scenario_name": None,
                            "kill_chain_step": None,
                            "simulation_id": SIMULATION_ID,
                            "is_simulation": True,
                            "source_system": "threat_simulator",
                        }
                        all_events.append(noise_event)

                    all_events.append(event)

            # Write through real ingestion pipeline
            events_df = spark.createDataFrame(all_events)
            safe_append(events_df, "bronze_events", catalog=cfg.catalog, schema=cfg.schema)

            attack_events = len([e for e in all_events if e["scenario_name"] is not None])
            noise_events = len(all_events) - attack_events
            mon.log_metric("attack_events_generated", attack_events)
            mon.log_metric("noise_events_generated", noise_events)
            mon.log_metric("signal_to_noise_ratio", attack_events / max(1, noise_events))

    # --- Record Simulation Metadata ---
    with mon.time("record_metadata"):
        metadata = [{
            "simulation_id": SIMULATION_ID,
            "mode": mode,
            "seed": sim_seed,
            "scenarios_executed": len(scenarios_to_run),
            "scenario_names": json.dumps([s["name"] for s in scenarios_to_run]),
            "target_eps": target_eps,
            "duration_minutes": duration_minutes,
            "total_events_generated": len(all_events) if mode == "structured" else 0,
            "started_at": notebook_start,
            "completed_at": datetime.utcnow(),
            "status": "completed",
        }]
        meta_df = spark.createDataFrame(metadata)
        safe_append(meta_df, "threat_simulations", catalog=cfg.catalog, schema=cfg.schema)

    # --- Throughput Measurement ---
    with mon.time("measure_throughput"):
        elapsed = (datetime.utcnow() - notebook_start).total_seconds()
        total_events = len(all_events) if mode == "structured" else 0
        actual_eps = total_events / max(1, elapsed)
        mon.log_metric("actual_eps", actual_eps)
        mon.log_metric("elapsed_seconds", elapsed)

    result.update({
        "simulation_id": SIMULATION_ID,
        "mode": mode,
        "scenarios_executed": len(scenarios_to_run),
        "total_events": total_events if mode == "structured" else "replay_from_archive",
        "actual_eps": round(actual_eps, 1) if mode == "structured" else "N/A",
        "seed": sim_seed,
        "completed_at": datetime.utcnow().isoformat(),
    })
    mon.log_complete(rows_processed=total_events if mode == "structured" else 0)

except Exception as e:
    result = {
        "notebook": "22_threat_simulator",
        "status": "error",
        "error": str(e)[:500],
        "error_type": type(e).__name__,
        "failed_at": datetime.utcnow().isoformat(),
    }
    mon.log_error(e, context="threat_simulator")
    raise

finally:
    print(json.dumps(result, indent=2))
    dbutils.notebook.exit(json.dumps(result))
