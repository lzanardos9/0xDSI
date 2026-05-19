# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 22 - Threat Simulator
# MAGIC Runs deterministic attack scenarios to test detection pipeline reliability.
# MAGIC Generates synthetic telemetry mimicking real-world APT campaigns.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import json, random
from datetime import datetime, timedelta

# COMMAND ----------

# MAGIC %md
# MAGIC ## APT Campaign Simulations

# COMMAND ----------

APT_CAMPAIGNS = {
    "apt29_phishing": {
        "name": "APT29 Spear Phishing Campaign",
        "kill_chain": [
            {"phase": "delivery", "events": [("email", "phish_delivered", 5), ("email", "link_clicked", 2)]},
            {"phase": "exploitation", "events": [("process", "macro_execution", 2), ("process", "powershell_download", 1)]},
            {"phase": "installation", "events": [("file", "dll_sideload", 1), ("registry", "persistence_key", 1)]},
            {"phase": "c2", "events": [("network", "https_beacon", 20), ("dns", "dns_over_https", 10)]},
            {"phase": "actions", "events": [("file", "sensitive_access", 5), ("network", "data_staged", 2)]},
        ]
    },
    "lazarus_watering_hole": {
        "name": "Lazarus Watering Hole Attack",
        "kill_chain": [
            {"phase": "recon", "events": [("web", "target_profiling", 10)]},
            {"phase": "weaponize", "events": [("web", "compromised_site", 1)]},
            {"phase": "delivery", "events": [("web", "drive_by_download", 3)]},
            {"phase": "exploitation", "events": [("process", "browser_exploit", 2), ("process", "sandbox_escape", 1)]},
            {"phase": "c2", "events": [("network", "custom_protocol", 15)]},
            {"phase": "exfil", "events": [("file", "archive_compress", 3), ("network", "exfil_https", 2)]},
        ]
    },
    "ransomware_double_extortion": {
        "name": "Double Extortion Ransomware",
        "kill_chain": [
            {"phase": "access", "events": [("authentication", "vpn_brute_force", 50), ("authentication", "valid_login", 1)]},
            {"phase": "discovery", "events": [("process", "ad_enumeration", 5), ("network", "share_discovery", 10)]},
            {"phase": "lateral", "events": [("authentication", "pass_the_hash", 8), ("network", "smb_lateral", 5)]},
            {"phase": "exfil", "events": [("file", "rclone_sync", 3), ("network", "mega_upload", 2)]},
            {"phase": "impact", "events": [("file", "mass_encrypt", 100), ("process", "vss_delete", 1)]},
        ]
    },
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Simulation

# COMMAND ----------

campaign_key = random.choice(list(APT_CAMPAIGNS.keys()))
campaign = APT_CAMPAIGNS[campaign_key]
print(f"Simulating: {campaign['name']}")

events = []
base_time = datetime.utcnow()
source_ip = f"10.{random.randint(1,200)}.{random.randint(1,254)}.{random.randint(1,254)}"
offset = 0

for phase in campaign["kill_chain"]:
    for event_type, action, count in phase["events"]:
        for _ in range(count):
            offset += random.randint(5, 120)
            events.append({
                "id": f"sim-{random.randint(100000,999999)}-{offset}",
                "timestamp": (base_time + timedelta(seconds=offset)).isoformat(),
                "event_type": event_type,
                "source_ip": source_ip,
                "dest_ip": f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
                "username": f"sim_user_{random.randint(1,10)}",
                "action": action,
                "outcome": "success",
                "severity": "high" if phase["phase"] in ("exfil", "impact", "c2") else "medium",
                "is_simulation": True,
                "simulation_campaign": campaign["name"],
                "simulation_phase": phase["phase"],
            })

events_df = spark.createDataFrame(events)
events_df.write.mode("append").saveAsTable("events")

# Record simulation metadata
sim_record = {
    "campaign_name": campaign["name"],
    "campaign_key": campaign_key,
    "events_generated": len(events),
    "phases_count": len(campaign["kill_chain"]),
    "source_ip": source_ip,
    "started_at": base_time.isoformat(),
    "completed_at": datetime.utcnow().isoformat(),
    "agent_name": "threat-simulator",
}
spark.createDataFrame([sim_record]).write.mode("append").saveAsTable("threat_simulations")

print(f"Simulation complete: {len(events)} events across {len(campaign['kill_chain'])} phases")
