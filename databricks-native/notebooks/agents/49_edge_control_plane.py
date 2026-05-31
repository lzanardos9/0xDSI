# Databricks notebook source
# MAGIC %md
# MAGIC # Edge Connector Control Plane Agent
# MAGIC
# MAGIC Manages the lifecycle of edge collectors deployed near data sources.
# MAGIC Responsibilities:
# MAGIC 1. **Registration** - Accept new collector registrations, validate tokens
# MAGIC 2. **Heartbeat Processing** - Update telemetry, detect dead collectors
# MAGIC 3. **Config Sync** - Push desired state (DNA version, params) to collectors
# MAGIC 4. **Health Monitoring** - Aggregate telemetry, alert on degraded collectors
# MAGIC 5. **Upgrade Orchestration** - Rolling upgrades across collector fleet
# MAGIC 6. **Token Management** - Generate/revoke install tokens
# MAGIC
# MAGIC ## Trigger: Continuous (streaming) or periodic (every 30s)

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import uuid
from datetime import datetime, timedelta

# COMMAND ----------

dbutils.widgets.text("mode", "health_check", "Mode: health_check | register | config_push | upgrade | generate_token | seed_dna")
dbutils.widgets.text("payload", "", "JSON payload for the operation")

mode = dbutils.widgets.get("mode")
payload = dbutils.widgets.get("payload")

deployments_table = get_table_path(cfg, "connector_deployments")
telemetry_table = get_table_path(cfg, "connector_telemetry")
dna_table = get_table_path(cfg, "connector_dna_registry")
tokens_table = get_table_path(cfg, "connector_install_tokens")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Registration

# COMMAND ----------

def register_collector(data: dict) -> dict:
    """Register a new edge collector. Validates token, creates deployment entry."""
    token = data.get("token", "")
    hostname = data.get("hostname", "unknown")
    ip_address = data.get("ip_address", "")
    os_type = data.get("os_type", "linux")
    os_version = data.get("os_version", "")
    binary_version = data.get("binary_version", "")

    # Validate token
    token_rows = spark.sql(f"""
        SELECT token_id, dna_name, site_name FROM {tokens_table}
        WHERE token = '{token.replace("'", "''")}'
          AND used = false
          AND (expires_at IS NULL OR expires_at > current_timestamp())
        LIMIT 1
    """).collect()

    if not token_rows:
        return {"error": "Invalid or expired token", "registered": False}

    token_row = token_rows[0]
    collector_id = str(uuid.uuid4())

    # Create deployment
    spark.sql(f"""
        INSERT INTO {deployments_table} (
            deployment_id, collector_id, dna_name, dna_version,
            hostname, ip_address, os_type, os_version,
            install_method, actual_state, binary_version,
            registration_token, site_name, registered_at, updated_at
        ) VALUES (
            '{str(uuid.uuid4())}', '{collector_id}', '{token_row.dna_name}', '1.0.0',
            '{hostname.replace("'", "''")}', '{ip_address}', '{os_type}', '{os_version}',
            'token', 'running', '{binary_version}',
            '{token}', '{token_row.site_name or "default"}',
            current_timestamp(), current_timestamp()
        )
    """)

    # Mark token as used
    spark.sql(f"""
        UPDATE {tokens_table}
        SET used = true, used_by_collector = '{collector_id}', used_at = current_timestamp()
        WHERE token_id = '{token_row.token_id}'
    """)

    return {
        "registered": True,
        "collector_id": collector_id,
        "dna_name": token_row.dna_name,
        "site_name": token_row.site_name,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Health Check (detect dead collectors, aggregate telemetry)

# COMMAND ----------

def health_check() -> dict:
    """Check all deployments, mark dead ones, compute fleet stats."""
    # Mark collectors with no heartbeat in 5 minutes as degraded
    spark.sql(f"""
        UPDATE {deployments_table}
        SET actual_state = 'degraded', updated_at = current_timestamp()
        WHERE actual_state = 'running'
          AND collector_id NOT IN (
              SELECT DISTINCT collector_id FROM {telemetry_table}
              WHERE timestamp > current_timestamp() - INTERVAL 5 MINUTES
          )
    """)

    # Mark collectors with no heartbeat in 15 minutes as dead
    spark.sql(f"""
        UPDATE {deployments_table}
        SET actual_state = 'dead', updated_at = current_timestamp()
        WHERE actual_state IN ('running', 'degraded')
          AND collector_id NOT IN (
              SELECT DISTINCT collector_id FROM {telemetry_table}
              WHERE timestamp > current_timestamp() - INTERVAL 15 MINUTES
          )
    """)

    # Fleet stats
    stats = spark.sql(f"""
        SELECT
            COUNT(*) as total_collectors,
            SUM(CASE WHEN actual_state = 'running' THEN 1 ELSE 0 END) as running,
            SUM(CASE WHEN actual_state = 'degraded' THEN 1 ELSE 0 END) as degraded,
            SUM(CASE WHEN actual_state = 'dead' THEN 1 ELSE 0 END) as dead,
            SUM(CASE WHEN actual_state = 'stopped' THEN 1 ELSE 0 END) as stopped
        FROM {deployments_table}
    """).collect()[0]

    # Aggregate EPS across fleet
    eps_stats = spark.sql(f"""
        SELECT
            COALESCE(SUM(events_per_second), 0) as total_eps,
            COALESCE(AVG(latency_ms), 0) as avg_latency_ms,
            COALESCE(SUM(error_count), 0) as total_errors
        FROM (
            SELECT collector_id, events_per_second, latency_ms, error_count,
                   ROW_NUMBER() OVER (PARTITION BY collector_id ORDER BY timestamp DESC) as rn
            FROM {telemetry_table}
            WHERE timestamp > current_timestamp() - INTERVAL 5 MINUTES
        ) WHERE rn = 1
    """).collect()[0]

    return {
        "total": stats.total_collectors,
        "running": stats.running,
        "degraded": stats.degraded,
        "dead": stats.dead,
        "stopped": stats.stopped,
        "total_eps": float(eps_stats.total_eps),
        "avg_latency_ms": float(eps_stats.avg_latency_ms),
        "total_errors": int(eps_stats.total_errors),
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Config Push (desired state reconciliation)

# COMMAND ----------

def config_push(data: dict) -> dict:
    """Push config update to a specific collector or fleet-wide."""
    collector_id = data.get("collector_id")
    target_state = data.get("desired_state")
    target_dna_version = data.get("desired_dna_version")
    custom_params = data.get("custom_params", {})

    if collector_id:
        where = f"collector_id = '{collector_id}'"
    elif data.get("dna_name"):
        where = f"dna_name = '{data['dna_name']}'"
    elif data.get("site_name"):
        where = f"site_name = '{data['site_name']}'"
    else:
        return {"error": "Must specify collector_id, dna_name, or site_name"}

    updates = []
    if target_state:
        updates.append(f"desired_state = '{target_state}'")
    if target_dna_version:
        updates.append(f"desired_dna_version = '{target_dna_version}'")
    if custom_params:
        updates.append(f"custom_params = '{json.dumps(custom_params).replace(chr(39), chr(39)+chr(39))}'")
    updates.append("updated_at = current_timestamp()")

    spark.sql(f"""
        UPDATE {deployments_table}
        SET {', '.join(updates)}
        WHERE {where}
    """)

    affected = spark.sql(f"SELECT COUNT(*) as cnt FROM {deployments_table} WHERE {where}").collect()[0].cnt
    return {"updated": affected, "target": where}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Upgrade Orchestration

# COMMAND ----------

def rolling_upgrade(data: dict) -> dict:
    """Orchestrate rolling upgrade of collector binaries or DNA versions."""
    target_version = data.get("target_version")
    dna_name = data.get("dna_name")
    batch_size = data.get("batch_size", 5)

    if not target_version:
        return {"error": "target_version required"}

    where = "1=1"
    if dna_name:
        where = f"dna_name = '{dna_name}'"

    # Get collectors that need upgrade
    to_upgrade = spark.sql(f"""
        SELECT collector_id, hostname, dna_version
        FROM {deployments_table}
        WHERE {where}
          AND actual_state = 'running'
          AND (dna_version != '{target_version}' OR dna_version IS NULL)
        ORDER BY registered_at ASC
        LIMIT {batch_size}
    """).collect()

    upgraded = 0
    for row in to_upgrade:
        spark.sql(f"""
            UPDATE {deployments_table}
            SET desired_dna_version = '{target_version}',
                updated_at = current_timestamp()
            WHERE collector_id = '{row.collector_id}'
        """)
        upgraded += 1

    remaining = spark.sql(f"""
        SELECT COUNT(*) as cnt FROM {deployments_table}
        WHERE {where}
          AND actual_state = 'running'
          AND (dna_version != '{target_version}' OR dna_version IS NULL)
    """).collect()[0].cnt

    return {
        "upgraded_this_batch": upgraded,
        "remaining": remaining,
        "target_version": target_version,
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Token Generation

# COMMAND ----------

def generate_install_token(data: dict) -> dict:
    """Generate a one-time install token for a new edge collector."""
    dna_name = data.get("dna_name", "generic_syslog")
    site_name = data.get("site_name", "default")
    expires_hours = data.get("expires_hours", 24)
    created_by = data.get("created_by", "admin")

    token = f"0xdsi-{uuid.uuid4().hex[:16]}"
    expires_at = datetime.utcnow() + timedelta(hours=expires_hours)

    spark.sql(f"""
        INSERT INTO {tokens_table} (
            token_id, token, dna_name, site_name, created_by, expires_at, created_at
        ) VALUES (
            '{str(uuid.uuid4())}', '{token}', '{dna_name}',
            '{site_name}', '{created_by}',
            '{expires_at.strftime("%Y-%m-%d %H:%M:%S")}',
            current_timestamp()
        )
    """)

    install_cmd = f'curl -sL https://install.0xdsi.io | sh -s -- --token={token} --dna={dna_name}'
    docker_cmd = f'docker run -d --name 0xdsi-{dna_name} -e TOKEN={token} 0xdsi/edge-collector:latest'

    return {
        "token": token,
        "dna_name": dna_name,
        "site_name": site_name,
        "expires_at": expires_at.isoformat(),
        "install_commands": {
            "linux": install_cmd,
            "docker": docker_cmd,
            "kubernetes": f"helm install 0xdsi-{dna_name} 0xdsi/edge-collector --set token={token} --set dna={dna_name}",
        },
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Seed Built-in DNA Registry

# COMMAND ----------

BUILTIN_DNA = [
    {
        "name": "palo_alto_firewall",
        "version": "2.1.0",
        "vendor": "Palo Alto Networks",
        "category": "network_security",
        "description": "Palo Alto NGFW via syslog (CEF format)",
        "input_type": "syslog", "input_protocol": "udp", "input_port": 514, "input_format": "cef",
        "auth_type": "none", "parser_engine": "cef", "ocsf_event_class": 4001,
    },
    {
        "name": "fortinet_fortigate",
        "version": "1.3.0",
        "vendor": "Fortinet",
        "category": "network_security",
        "description": "FortiGate firewall via syslog (key=value format)",
        "input_type": "syslog", "input_protocol": "tcp", "input_port": 514, "input_format": "kv",
        "auth_type": "none", "parser_engine": "kv_pairs", "ocsf_event_class": 4001,
    },
    {
        "name": "crowdstrike_falcon",
        "version": "3.0.0",
        "vendor": "CrowdStrike",
        "category": "endpoint_security",
        "description": "CrowdStrike Falcon via Streaming API (NDJSON)",
        "input_type": "api_stream", "input_protocol": "https", "input_port": 443, "input_format": "ndjson",
        "auth_type": "oauth2", "parser_engine": "json_path", "ocsf_event_class": 1001,
    },
    {
        "name": "cisco_asa",
        "version": "1.5.0",
        "vendor": "Cisco",
        "category": "network_security",
        "description": "Cisco ASA/Firepower via syslog",
        "input_type": "syslog", "input_protocol": "udp", "input_port": 1514, "input_format": "cisco_syslog",
        "auth_type": "none", "parser_engine": "regex", "ocsf_event_class": 4001,
    },
    {
        "name": "windows_event_log",
        "version": "2.0.0",
        "vendor": "Microsoft",
        "category": "endpoint_security",
        "description": "Windows Event Logs via WEF/WMI collection",
        "input_type": "wmi", "input_protocol": "tcp", "input_port": 5985, "input_format": "evtx",
        "auth_type": "kerberos", "parser_engine": "evtx", "ocsf_event_class": 3001,
    },
    {
        "name": "generic_syslog",
        "version": "1.0.0",
        "vendor": "Generic",
        "category": "infrastructure",
        "description": "Universal syslog receiver (RFC 5424/3164)",
        "input_type": "syslog", "input_protocol": "udp", "input_port": 514, "input_format": "rfc5424",
        "auth_type": "none", "parser_engine": "syslog", "ocsf_event_class": 6003,
    },
    {
        "name": "aws_cloudtrail",
        "version": "2.2.0",
        "vendor": "Amazon Web Services",
        "category": "cloud",
        "description": "AWS CloudTrail via S3 bucket polling + SQS notifications",
        "input_type": "s3_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "aws_iam", "parser_engine": "json_path", "ocsf_event_class": 6003,
    },
    {
        "name": "azure_activity_log",
        "version": "1.8.0",
        "vendor": "Microsoft Azure",
        "category": "cloud",
        "description": "Azure Activity & Diagnostic logs via Event Hub",
        "input_type": "eventhub", "input_protocol": "amqp", "input_port": 5671, "input_format": "json",
        "auth_type": "sas_token", "parser_engine": "json_path", "ocsf_event_class": 6003,
    },
    {
        "name": "splunk_hec_receiver",
        "version": "1.2.0",
        "vendor": "Splunk",
        "category": "siem_integration",
        "description": "Receive events from Splunk HEC forwarders (HTTP Event Collector protocol)",
        "input_type": "http_listener", "input_protocol": "https", "input_port": 8088, "input_format": "splunk_hec",
        "auth_type": "api_key", "parser_engine": "splunk_hec", "ocsf_event_class": 6003,
    },
    {
        "name": "modbus_scada",
        "version": "1.0.0",
        "vendor": "Generic OT",
        "category": "ot_ics",
        "description": "Modbus TCP/RTU protocol monitor for SCADA/ICS environments",
        "input_type": "pcap", "input_protocol": "tcp", "input_port": 502, "input_format": "modbus",
        "auth_type": "none", "parser_engine": "protocol_decode", "ocsf_event_class": 4001,
    },
]


def seed_dna_registry() -> dict:
    """Seed the DNA registry with built-in connector specifications."""
    seeded = 0
    for dna in BUILTIN_DNA:
        existing = spark.sql(f"""
            SELECT dna_id FROM {dna_table}
            WHERE name = '{dna["name"]}' AND version = '{dna["version"]}'
            LIMIT 1
        """).collect()

        if existing:
            continue

        spark.sql(f"""
            INSERT INTO {dna_table} (
                dna_id, name, version, vendor, category, description,
                input_type, input_protocol, input_port, input_format,
                auth_type, parser_engine, ocsf_event_class, is_builtin,
                created_at, updated_at
            ) VALUES (
                '{str(uuid.uuid4())}', '{dna["name"]}', '{dna["version"]}',
                '{dna["vendor"]}', '{dna["category"]}',
                '{dna["description"].replace("'", "''")}',
                '{dna["input_type"]}', '{dna["input_protocol"]}', {dna["input_port"]},
                '{dna["input_format"]}', '{dna["auth_type"]}', '{dna["parser_engine"]}',
                {dna["ocsf_event_class"]}, true,
                current_timestamp(), current_timestamp()
            )
        """)
        seeded += 1

    return {"seeded": seeded, "total_builtin": len(BUILTIN_DNA)}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute

# COMMAND ----------

result = {}

if mode == "health_check":
    result = health_check()
elif mode == "register":
    data = json.loads(payload) if payload else {}
    result = register_collector(data)
elif mode == "config_push":
    data = json.loads(payload) if payload else {}
    result = config_push(data)
elif mode == "upgrade":
    data = json.loads(payload) if payload else {}
    result = rolling_upgrade(data)
elif mode == "generate_token":
    data = json.loads(payload) if payload else {}
    result = generate_install_token(data)
elif mode == "seed_dna":
    result = seed_dna_registry()
else:
    result = {"error": f"Unknown mode: {mode}"}

mon.log_event("edge_control_plane", result)
print(json.dumps(result, indent=2, default=str))
dbutils.notebook.exit(json.dumps(result, default=str))
