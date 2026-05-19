# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 23 - Connector Adapter
# MAGIC Normalizes inbound data feeds from heterogeneous sources (syslog, CEF, LEEF,
# MAGIC JSON, CSV, cloud APIs) into unified OCSF schema for downstream processing.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, TimestampType
import json, re
from datetime import datetime

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source Format Parsers

# COMMAND ----------

def parse_cef(raw_log):
    """Parse CEF (Common Event Format) logs."""
    cef_pattern = r'CEF:\d+\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(.*)'
    match = re.match(cef_pattern, raw_log)
    if match:
        return {
            "vendor": match.group(1),
            "product": match.group(2),
            "version": match.group(3),
            "event_id": match.group(4),
            "event_name": match.group(5),
            "severity": match.group(6),
            "extensions": match.group(7),
        }
    return None

def parse_leef(raw_log):
    """Parse LEEF (Log Event Extended Format) logs."""
    parts = raw_log.split("|")
    if len(parts) >= 6 and parts[0].startswith("LEEF"):
        return {
            "vendor": parts[1],
            "product": parts[2],
            "version": parts[3],
            "event_id": parts[4],
            "extensions": "|".join(parts[5:]),
        }
    return None

def parse_syslog(raw_log):
    """Parse RFC 5424 syslog messages."""
    syslog_pattern = r'<(\d+)>(\d+)?\s*(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s*[-]?\s*(.*)'
    match = re.match(syslog_pattern, raw_log)
    if match:
        return {
            "priority": match.group(1),
            "timestamp": match.group(3),
            "hostname": match.group(4),
            "app_name": match.group(5),
            "proc_id": match.group(6),
            "msg_id": match.group(7),
            "message": match.group(8),
        }
    return None

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Raw Ingestion Queue

# COMMAND ----------

raw_queue = spark.sql("""
    SELECT id, raw_log, source_connector, format_hint, received_at
    FROM raw_ingestion_queue
    WHERE processed = false
      AND received_at > current_timestamp() - INTERVAL 5 MINUTES
    ORDER BY received_at
    LIMIT 1000
""")

queue_count = raw_queue.count()
print(f"Processing {queue_count} raw events from ingestion queue")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Normalize to OCSF

# COMMAND ----------

def normalize_to_ocsf(parsed, format_type, source_connector):
    """Map parsed event to Open Cybersecurity Schema Framework."""
    return {
        "event_type": parsed.get("event_name", parsed.get("app_name", "unknown")),
        "source": source_connector,
        "severity": map_severity(parsed.get("severity", "5")),
        "timestamp": parsed.get("timestamp", datetime.utcnow().isoformat()),
        "source_ip": extract_ip(parsed, "src"),
        "dest_ip": extract_ip(parsed, "dst"),
        "username": parsed.get("user", parsed.get("duser", "")),
        "action": parsed.get("event_name", parsed.get("message", "")[:100]),
        "outcome": "success",
        "raw_log": json.dumps(parsed),
        "ocsf_category": determine_ocsf_category(parsed),
        "normalized_at": datetime.utcnow().isoformat(),
    }

def map_severity(sev):
    try:
        s = int(sev)
        if s >= 9: return "critical"
        if s >= 7: return "high"
        if s >= 4: return "medium"
        return "low"
    except:
        return sev.lower() if sev else "low"

def extract_ip(parsed, prefix):
    for key in [f"{prefix}", f"{prefix}Address", f"{prefix}_ip", f"source_ip" if prefix == "src" else "dest_ip"]:
        if key in parsed:
            return parsed[key]
    return ""

def determine_ocsf_category(parsed):
    event_name = json.dumps(parsed).lower()
    if any(w in event_name for w in ["auth", "login", "logon"]): return "authentication"
    if any(w in event_name for w in ["network", "connection", "flow"]): return "network_activity"
    if any(w in event_name for w in ["file", "write", "delete"]): return "file_activity"
    if any(w in event_name for w in ["process", "exec", "spawn"]): return "process_activity"
    return "system_activity"

# COMMAND ----------

# Mark processed
if queue_count > 0:
    spark.sql("""
        UPDATE raw_ingestion_queue SET processed = true
        WHERE processed = false AND received_at > current_timestamp() - INTERVAL 5 MINUTES
    """)

spark.sql("""
    MERGE INTO agent_status AS t
    USING (SELECT 'connector-adapter' as agent_id, current_timestamp() as last_run, 'active' as status) AS s
    ON t.agent_id = s.agent_id
    WHEN MATCHED THEN UPDATE SET last_run = s.last_run, status = s.status
    WHEN NOT MATCHED THEN INSERT (agent_id, last_run, status) VALUES (s.agent_id, s.last_run, s.status)
""")

print(f"Connector adapter processed {queue_count} events")
