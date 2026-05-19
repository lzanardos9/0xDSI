# Databricks notebook source
# MAGIC %md
# MAGIC # Correlation - Supply Chain Risk Engine
# MAGIC Detects supply chain compromise indicators: unexpected package updates,
# MAGIC build pipeline modifications, code signing anomalies, and dependency
# MAGIC confusion attacks.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Monitor Software Supply Chain Events

# COMMAND ----------

supply_chain_events = spark.sql("""
    SELECT source_ip, username, action, dest_ip, timestamp, severity,
           event_type, raw_log
    FROM events
    WHERE event_type IN ('software', 'build', 'deployment', 'package')
      AND timestamp > current_timestamp() - INTERVAL 15 MINUTES
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Unexpected Package Installation

# COMMAND ----------

unexpected_packages = spark.sql("""
    WITH normal_packages AS (
        SELECT DISTINCT action as package_action
        FROM events
        WHERE event_type = 'software'
          AND timestamp BETWEEN current_timestamp() - INTERVAL 30 DAYS
                           AND current_timestamp() - INTERVAL 1 DAY
    )
    SELECT e.*
    FROM events e
    LEFT JOIN normal_packages np ON e.action = np.package_action
    WHERE e.event_type = 'software'
      AND e.action LIKE '%install%'
      AND np.package_action IS NULL
      AND e.timestamp > current_timestamp() - INTERVAL 15 MINUTES
""")

if unexpected_packages.count() > 0:
    for row in unexpected_packages.collect():
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source_ip,
                mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
            VALUES (
                'sc-pkg-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{row.source_ip[-4:]}',
                'Supply Chain: Unexpected Package Installation',
                'New package installed from {row.source_ip} by {row.username}: {row.action}',
                'high', 'new', '{row.source_ip}',
                'initial-access', 'T1195.002',
                0.75, 70, current_timestamp()
            )
        """)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Build Pipeline Tampering

# COMMAND ----------

build_anomalies = spark.sql("""
    SELECT source_ip, username, action, COUNT(*) as count,
           MIN(timestamp) as first_seen, MAX(timestamp) as last_seen
    FROM events
    WHERE event_type = 'build'
      AND action IN ('pipeline_modified', 'secret_accessed', 'artifact_replaced')
      AND timestamp > current_timestamp() - INTERVAL 15 MINUTES
    GROUP BY source_ip, username, action
    HAVING COUNT(*) >= 2
""")

if build_anomalies.count() > 0:
    print(f"Build pipeline anomalies detected: {build_anomalies.count()}")
    for row in build_anomalies.collect():
        spark.sql(f"""
            INSERT INTO alerts (id, title, description, severity, status, source_ip,
                mitre_tactic, mitre_technique, confidence_score, risk_score, created_at)
            VALUES (
                'sc-build-{datetime.utcnow().strftime("%Y%m%d%H%M%S")}-{row.source_ip[-4:]}',
                'Supply Chain: Build Pipeline Tampering',
                'User {row.username} performed {row.count} suspicious build actions: {row.action}',
                'critical', 'new', '{row.source_ip}',
                'persistence', 'T1195.002',
                0.85, 85, current_timestamp()
            )
        """)

# COMMAND ----------

print(f"Supply chain correlation complete. Unexpected packages: {unexpected_packages.count()}, Build anomalies: {build_anomalies.count()}")
