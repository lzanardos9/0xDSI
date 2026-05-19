# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 26 - Real-time Graph CEP Agent
# MAGIC Detects multi-step temporal patterns using graph-based Complex Event Processing.
# MAGIC Maintains in-memory graph of entity relationships and detects attack patterns
# MAGIC spanning multiple events and entities.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.window import Window
import json
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Entity Relationship Graph

# COMMAND ----------

entity_graph = spark.sql("""
    SELECT
        source_ip as entity_a,
        dest_ip as entity_b,
        'network' as edge_type,
        COUNT(*) as weight,
        MIN(timestamp) as first_seen,
        MAX(timestamp) as last_seen,
        COLLECT_SET(event_type) as event_types,
        COLLECT_SET(username) as usernames
    FROM events
    WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR
    GROUP BY source_ip, dest_ip
    HAVING COUNT(*) >= 3
""")

print(f"Graph edges: {entity_graph.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Multi-Hop Pattern Detection

# COMMAND ----------

# Detect lateral movement chains (A -> B -> C -> D)
lateral_chains = spark.sql("""
    WITH hop1 AS (
        SELECT source_ip as origin, dest_ip as hop1_target, MIN(timestamp) as t1
        FROM events
        WHERE event_type IN ('authentication', 'network')
          AND action IN ('login_success', 'rdp_connection', 'smb_connect')
          AND timestamp > current_timestamp() - INTERVAL 1 HOUR
        GROUP BY source_ip, dest_ip
    ),
    hop2 AS (
        SELECT h1.origin, h1.hop1_target, e.dest_ip as hop2_target,
               h1.t1, MIN(e.timestamp) as t2
        FROM hop1 h1
        JOIN events e ON e.source_ip = h1.hop1_target
        WHERE e.event_type IN ('authentication', 'network')
          AND e.action IN ('login_success', 'rdp_connection', 'smb_connect')
          AND e.timestamp > h1.t1
          AND e.timestamp < h1.t1 + INTERVAL 30 MINUTES
          AND e.dest_ip != h1.origin
        GROUP BY h1.origin, h1.hop1_target, e.dest_ip, h1.t1
    ),
    hop3 AS (
        SELECT h2.origin, h2.hop1_target, h2.hop2_target, e.dest_ip as hop3_target,
               h2.t1, h2.t2, MIN(e.timestamp) as t3
        FROM hop2 h2
        JOIN events e ON e.source_ip = h2.hop2_target
        WHERE e.event_type IN ('authentication', 'network')
          AND e.action IN ('login_success', 'rdp_connection', 'smb_connect')
          AND e.timestamp > h2.t2
          AND e.timestamp < h2.t2 + INTERVAL 30 MINUTES
          AND e.dest_ip NOT IN (h2.origin, h2.hop1_target)
        GROUP BY h2.origin, h2.hop1_target, h2.hop2_target, e.dest_ip, h2.t1, h2.t2
    )
    SELECT origin, hop1_target, hop2_target, hop3_target, t1, t2, t3,
           UNIX_TIMESTAMP(t3) - UNIX_TIMESTAMP(t1) as chain_duration_seconds
    FROM hop3
    WHERE UNIX_TIMESTAMP(t3) - UNIX_TIMESTAMP(t1) < 3600
    ORDER BY chain_duration_seconds ASC
""")

chain_count = lateral_chains.count()
if chain_count > 0:
    print(f"ALERT: {chain_count} lateral movement chains detected!")

    for chain in lateral_chains.collect():
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status,
                source_ip, dest_ip, mitre_tactic, mitre_technique,
                confidence_score, risk_score, created_at)
            VALUES (
                'gcep-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{chain.origin[:8]}',
                'Multi-Hop Lateral Movement Detected',
                'Chain: {chain.origin} -> {chain.hop1_target} -> {chain.hop2_target} -> {chain.hop3_target} in {chain.chain_duration_seconds}s',
                'critical', 'new', '{chain.origin}', '{chain.hop3_target}',
                'lateral-movement', 'T1021',
                0.92, 90, current_timestamp()
            )
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Temporal Sequence Detection

# COMMAND ----------

# Detect recon -> exploit -> persist sequences
attack_sequences = spark.sql("""
    WITH user_timeline AS (
        SELECT username, event_type, action, timestamp,
               LAG(event_type, 1) OVER (PARTITION BY username ORDER BY timestamp) as prev_type,
               LAG(event_type, 2) OVER (PARTITION BY username ORDER BY timestamp) as prev2_type,
               LAG(action, 1) OVER (PARTITION BY username ORDER BY timestamp) as prev_action,
               LAG(action, 2) OVER (PARTITION BY username ORDER BY timestamp) as prev2_action
        FROM events
        WHERE timestamp > current_timestamp() - INTERVAL 1 HOUR
          AND username IS NOT NULL AND username != ''
    )
    SELECT username, event_type, action, timestamp,
           prev_type, prev2_type, prev_action, prev2_action
    FROM user_timeline
    WHERE prev2_type IN ('network', 'dns') AND prev2_action LIKE '%scan%'
      AND prev_type IN ('process', 'authentication') AND prev_action LIKE '%exploit%'
      AND event_type IN ('file', 'registry') AND action LIKE '%persist%'
""")

seq_count = attack_sequences.count()
print(f"Attack sequences detected: {seq_count}")

# COMMAND ----------

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'realtime-graph-cep' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")

print(f"Graph CEP complete. Chains: {chain_count}, Sequences: {seq_count}")
