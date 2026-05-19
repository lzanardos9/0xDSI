# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 11 - Red Team Agent
# MAGIC Emulates adversary TTPs to validate detection coverage.
# MAGIC Generates synthetic attack sequences mapped to MITRE ATT&CK
# MAGIC and measures detection pipeline response times.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
import random
from datetime import datetime, timedelta

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Attack Scenario Library

# COMMAND ----------

ATTACK_SCENARIOS = [
    {
        "name": "Credential Stuffing Campaign",
        "tactics": ["initial-access", "credential-access"],
        "techniques": ["T1078", "T1110.004"],
        "events": [
            {"type": "authentication", "action": "login_failure", "count_range": (50, 200)},
            {"type": "authentication", "action": "login_success", "count_range": (1, 5)},
            {"type": "account", "action": "password_change", "count_range": (0, 2)},
        ]
    },
    {
        "name": "Lateral Movement via RDP",
        "tactics": ["lateral-movement", "discovery"],
        "techniques": ["T1021.001", "T1018"],
        "events": [
            {"type": "network", "action": "rdp_connection", "count_range": (5, 20)},
            {"type": "process", "action": "net_view_execution", "count_range": (3, 10)},
            {"type": "authentication", "action": "ntlm_auth", "count_range": (10, 30)},
        ]
    },
    {
        "name": "Data Exfiltration via DNS",
        "tactics": ["exfiltration", "command-and-control"],
        "techniques": ["T1048.003", "T1071.004"],
        "events": [
            {"type": "dns", "action": "query", "count_range": (100, 500)},
            {"type": "network", "action": "dns_tunnel_detected", "count_range": (5, 20)},
            {"type": "file", "action": "archive_created", "count_range": (1, 3)},
        ]
    },
    {
        "name": "Ransomware Kill Chain",
        "tactics": ["execution", "impact", "defense-evasion"],
        "techniques": ["T1059.001", "T1486", "T1562.001"],
        "events": [
            {"type": "process", "action": "powershell_encoded", "count_range": (3, 10)},
            {"type": "file", "action": "mass_encryption", "count_range": (50, 200)},
            {"type": "security", "action": "av_disabled", "count_range": (1, 3)},
            {"type": "file", "action": "ransom_note_created", "count_range": (1, 1)},
        ]
    },
    {
        "name": "Supply Chain Compromise",
        "tactics": ["initial-access", "persistence", "execution"],
        "techniques": ["T1195.002", "T1546", "T1059"],
        "events": [
            {"type": "software", "action": "package_install", "count_range": (1, 3)},
            {"type": "network", "action": "beacon_to_c2", "count_range": (10, 50)},
            {"type": "process", "action": "unexpected_child_process", "count_range": (3, 8)},
        ]
    },
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Synthetic Attack Events

# COMMAND ----------

def generate_attack_events(scenario):
    """Generate realistic attack event telemetry for a scenario."""
    events = []
    base_time = datetime.utcnow()
    source_ip = f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"
    target_ips = [f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}" for _ in range(3)]
    username = f"redteam_sim_{random.randint(1000,9999)}"

    time_offset = 0
    for event_template in scenario["events"]:
        count = random.randint(*event_template["count_range"])
        for i in range(count):
            time_offset += random.randint(1, 30)
            events.append({
                "id": f"rt-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{random.randint(10000,99999)}",
                "timestamp": (base_time + timedelta(seconds=time_offset)).isoformat(),
                "event_type": event_template["type"],
                "source_ip": source_ip,
                "dest_ip": random.choice(target_ips),
                "username": username,
                "action": event_template["action"],
                "outcome": "success" if random.random() > 0.3 else "failure",
                "severity": random.choice(["medium", "high", "critical"]),
                "is_simulation": True,
                "simulation_scenario": scenario["name"],
                "mitre_tactics": json.dumps(scenario["tactics"]),
                "mitre_techniques": json.dumps(scenario["techniques"]),
            })

    return events

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Red Team Simulation

# COMMAND ----------

scenario = random.choice(ATTACK_SCENARIOS)
print(f"Running scenario: {scenario['name']}")

attack_events = generate_attack_events(scenario)
print(f"Generated {len(attack_events)} synthetic events")

events_df = spark.createDataFrame(attack_events)
events_df.write.mode("append").saveAsTable("events")

simulation_start = datetime.utcnow()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Measure Detection Response

# COMMAND ----------

import time

time.sleep(30)  # Wait for detection pipeline to process

detection_check = spark.sql(f"""
    SELECT COUNT(*) as detected_alerts
    FROM alerts
    WHERE source_ip IN (
        SELECT DISTINCT source_ip FROM events
        WHERE is_simulation = true
        AND simulation_scenario = '{scenario["name"]}'
        AND timestamp > current_timestamp() - INTERVAL 5 MINUTES
    )
    AND created_at > '{simulation_start.isoformat()}'
""").collect()[0]

detected = detection_check.detected_alerts
total_expected = len(scenario["events"])
coverage = (detected / max(total_expected, 1)) * 100

print(f"Detection Coverage: {coverage:.1f}% ({detected}/{total_expected} event types detected)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Simulation Results

# COMMAND ----------

simulation_result = {
    "scenario_name": scenario["name"],
    "tactics_tested": json.dumps(scenario["tactics"]),
    "techniques_tested": json.dumps(scenario["techniques"]),
    "events_generated": len(attack_events),
    "alerts_detected": int(detected),
    "detection_coverage_pct": float(coverage),
    "simulation_start": simulation_start.isoformat(),
    "simulation_end": datetime.utcnow().isoformat(),
    "agent_name": "red-team",
}

result_df = spark.createDataFrame([simulation_result])
result_df.write.mode("append").saveAsTable("red_team_simulations")

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'red-team' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")
