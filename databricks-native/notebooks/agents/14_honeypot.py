# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 14 - Honeypot/Honeytoken Agent
# MAGIC Operates deception artifacts (honeypots, honeytokens, honey credentials).
# MAGIC Monitors for interactions indicating active adversary presence.
# MAGIC Zero false positives - any interaction is confirmed malicious.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import json
from datetime import datetime
from pyspark.sql import functions as F

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Honeypot Interactions

# COMMAND ----------

new_interactions = spark.sql("""
    SELECT hi.*,
           hp.honeypot_type, hp.location, hp.emulated_service
    FROM honeypot_interactions hi
    JOIN honeypots hp ON hi.honeypot_id = hp.id
    WHERE hi.processed = false
      AND hi.timestamp > current_timestamp() - INTERVAL 30 MINUTES
    ORDER BY hi.timestamp DESC
""")

interaction_count = new_interactions.count()
print(f"Found {interaction_count} new honeypot interactions")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Classify Interaction Severity

# COMMAND ----------

if interaction_count > 0:
    classified = new_interactions.withColumn(
        "threat_level",
        F.when(F.col("action").isin("file_access", "data_exfil", "credential_use"), "critical")
         .when(F.col("action").isin("port_scan", "service_probe", "login_attempt"), "high")
         .when(F.col("action").isin("connection", "dns_lookup"), "medium")
         .otherwise("low")
    ).withColumn(
        "is_lateral_movement",
        F.when(F.col("source_ip").startswith("10."), True).otherwise(False)
    )

    # Any honeypot interaction from internal IP = active breach
    internal_threats = classified.filter(F.col("is_lateral_movement") == True)
    if internal_threats.count() > 0:
        print(f"CRITICAL: {internal_threats.count()} internal honeypot interactions detected!")

        # Auto-generate critical alert
        for row in internal_threats.collect():
            spark.sql(f"""
                INSERT INTO alerts (id, title, description, severity, status, source_ip,
                    dest_ip, mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
                VALUES (
                    '{f"hp-alert-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"}',
                    'Honeypot Interaction - Active Adversary Detected',
                    'Internal host {row.source_ip} interacted with honeypot {row.honeypot_id}. Action: {row.action}. This confirms active lateral movement.',
                    'critical', 'new', '{row.source_ip}', '{row.honeypot_id}',
                    'lateral-movement', 'T1021',
                    1.0, 98, current_timestamp()
                )
            """)

    # Mark as processed
    spark.sql("""
        UPDATE honeypot_interactions
        SET processed = true
        WHERE processed = false
        AND timestamp > current_timestamp() - INTERVAL 30 MINUTES
    """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Honeytoken Usage

# COMMAND ----------

honeytoken_triggers = spark.sql("""
    SELECT ht.*, ht_def.token_type, ht_def.planted_location
    FROM honeytoken_triggers ht
    JOIN honeytokens ht_def ON ht.token_id = ht_def.id
    WHERE ht.processed = false
      AND ht.triggered_at > current_timestamp() - INTERVAL 30 MINUTES
""").collect()

if honeytoken_triggers:
    print(f"ALERT: {len(honeytoken_triggers)} honeytokens triggered!")

    for trigger in honeytoken_triggers:
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status,
                source_ip, mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
            VALUES (
                'ht-alert-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{trigger.token_id[:8]}',
                'Honeytoken Triggered - {trigger.token_type}',
                'Honeytoken planted at {trigger.planted_location} was accessed. Token type: {trigger.token_type}. This indicates credential theft or unauthorized data access.',
                'critical', 'new', '{trigger.source_ip}',
                'credential-access', 'T1552',
                1.0, 95, current_timestamp()
            )
        """)

    spark.sql("""
        UPDATE honeytoken_triggers SET processed = true
        WHERE processed = false AND triggered_at > current_timestamp() - INTERVAL 30 MINUTES
    """)

# COMMAND ----------

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'honeypot' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")

print(f"Honeypot agent complete. Interactions: {interaction_count}, Honeytokens: {len(honeytoken_triggers)}")
