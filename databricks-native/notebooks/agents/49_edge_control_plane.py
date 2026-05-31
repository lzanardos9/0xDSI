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

dbutils.widgets.text("mode", "health_check", "Mode: health_check | register | config_push | upgrade | generate_token | seed_dna | seed_demo_fleet")
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
    {
        "name": "juniper_srx",
        "version": "1.5.0",
        "vendor": "Juniper Networks",
        "category": "network_firewall",
        "description": "Juniper SRX series firewall logs via structured syslog",
        "input_type": "syslog", "input_protocol": "udp", "input_port": 514, "input_format": "structured_syslog",
        "auth_type": "none", "parser_engine": "kv_pairs", "ocsf_event_class": 4001,
    },
    {
        "name": "check_point_firewall",
        "version": "1.3.0",
        "vendor": "Check Point",
        "category": "network_firewall",
        "description": "Check Point NGFW logs via OPSEC LEA / Log Exporter",
        "input_type": "syslog", "input_protocol": "tcp", "input_port": 514, "input_format": "cef",
        "auth_type": "certificate", "parser_engine": "cef", "ocsf_event_class": 4001,
    },
    {
        "name": "zscaler_zia",
        "version": "2.0.0",
        "vendor": "Zscaler",
        "category": "cloud_security",
        "description": "Zscaler Internet Access web/firewall logs via NSS",
        "input_type": "api_stream", "input_protocol": "https", "input_port": 443, "input_format": "nss_json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 6002,
    },
    {
        "name": "sentinelone_edr",
        "version": "1.4.0",
        "vendor": "SentinelOne",
        "category": "endpoint_security",
        "description": "SentinelOne Deep Visibility telemetry via API streaming",
        "input_type": "api_stream", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 1002,
    },
    {
        "name": "carbon_black_edr",
        "version": "1.6.0",
        "vendor": "VMware Carbon Black",
        "category": "endpoint_security",
        "description": "Carbon Black Cloud sensor telemetry via Event Forwarder",
        "input_type": "kafka", "input_protocol": "tcp", "input_port": 9092, "input_format": "json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 1007,
    },
    {
        "name": "suricata_ids",
        "version": "1.2.0",
        "vendor": "Open Source (OISF)",
        "category": "ids_ips",
        "description": "Suricata IDS/IPS EVE JSON log via file tail or syslog",
        "input_type": "file_tail", "input_protocol": "file", "input_port": 0, "input_format": "eve_json",
        "auth_type": "none", "parser_engine": "json_path", "ocsf_event_class": 4002,
    },
    {
        "name": "zeek_network",
        "version": "1.3.0",
        "vendor": "Open Source (Zeek Project)",
        "category": "network_monitoring",
        "description": "Zeek (formerly Bro) network analysis logs via JSON log output",
        "input_type": "file_tail", "input_protocol": "file", "input_port": 0, "input_format": "zeek_json",
        "auth_type": "none", "parser_engine": "json_path", "ocsf_event_class": 4001,
    },
    {
        "name": "f5_bigip_waf",
        "version": "1.1.0",
        "vendor": "F5 Networks",
        "category": "waf",
        "description": "F5 BIG-IP ASM/AWF web application firewall logs via syslog",
        "input_type": "syslog", "input_protocol": "tcp", "input_port": 1514, "input_format": "cef",
        "auth_type": "none", "parser_engine": "cef", "ocsf_event_class": 6002,
    },
    {
        "name": "okta_system_log",
        "version": "2.1.0",
        "vendor": "Okta",
        "category": "identity",
        "description": "Okta System Log events via REST API polling",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 3002,
    },
    {
        "name": "google_workspace",
        "version": "1.5.0",
        "vendor": "Google",
        "category": "identity",
        "description": "Google Workspace Admin SDK activity reports",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "oauth2", "parser_engine": "json_path", "ocsf_event_class": 3002,
    },
    {
        "name": "office365_management",
        "version": "2.0.0",
        "vendor": "Microsoft",
        "category": "cloud",
        "description": "Office 365 Management Activity API (Exchange, SharePoint, Azure AD, DLP)",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "oauth2", "parser_engine": "json_path", "ocsf_event_class": 6003,
    },
    {
        "name": "linux_auditd",
        "version": "1.8.0",
        "vendor": "Linux",
        "category": "endpoint_security",
        "description": "Linux audit daemon logs via audisp plugin or file tail",
        "input_type": "file_tail", "input_protocol": "file", "input_port": 0, "input_format": "audit_log",
        "auth_type": "none", "parser_engine": "kv_pairs", "ocsf_event_class": 1001,
    },
    {
        "name": "macos_unified_log",
        "version": "1.0.0",
        "vendor": "Apple",
        "category": "endpoint_security",
        "description": "macOS Unified Logging System via log stream command",
        "input_type": "file_tail", "input_protocol": "file", "input_port": 0, "input_format": "ndjson",
        "auth_type": "none", "parser_engine": "json_path", "ocsf_event_class": 1001,
    },
    {
        "name": "sophos_xg",
        "version": "1.2.0",
        "vendor": "Sophos",
        "category": "network_firewall",
        "description": "Sophos XG/XGS Firewall logs via syslog (key-value)",
        "input_type": "syslog", "input_protocol": "udp", "input_port": 514, "input_format": "kv_pairs",
        "auth_type": "none", "parser_engine": "kv_pairs", "ocsf_event_class": 4001,
    },
    {
        "name": "trend_micro_apex",
        "version": "1.4.0",
        "vendor": "Trend Micro",
        "category": "endpoint_security",
        "description": "Trend Micro Apex One / Vision One detection logs",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 1002,
    },
    {
        "name": "darktrace_detect",
        "version": "1.1.0",
        "vendor": "Darktrace",
        "category": "ndr",
        "description": "Darktrace Enterprise Immune System model breach alerts",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 2001,
    },
    {
        "name": "vectra_ai",
        "version": "1.2.0",
        "vendor": "Vectra AI",
        "category": "ndr",
        "description": "Vectra Cognito Detect AI-driven network threat detections",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 2001,
    },
    {
        "name": "proofpoint_tap",
        "version": "1.3.0",
        "vendor": "Proofpoint",
        "category": "email_security",
        "description": "Proofpoint TAP click and message events",
        "input_type": "api_poll", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "basic", "parser_engine": "json_path", "ocsf_event_class": 4011,
    },
    {
        "name": "cisco_meraki",
        "version": "1.5.0",
        "vendor": "Cisco Meraki",
        "category": "network_firewall",
        "description": "Cisco Meraki MX/MR appliance syslog events",
        "input_type": "syslog", "input_protocol": "udp", "input_port": 514, "input_format": "meraki_syslog",
        "auth_type": "none", "parser_engine": "regex", "ocsf_event_class": 4001,
    },
    {
        "name": "kafka_consumer",
        "version": "1.0.0",
        "vendor": "Apache",
        "category": "message_bus",
        "description": "Generic Apache Kafka topic consumer for event ingestion",
        "input_type": "kafka", "input_protocol": "tcp", "input_port": 9092, "input_format": "json",
        "auth_type": "sasl", "parser_engine": "json_path", "ocsf_event_class": 6003,
    },
    {
        "name": "gcp_audit_log",
        "version": "1.6.0",
        "vendor": "Google Cloud",
        "category": "cloud",
        "description": "GCP audit logs via Pub/Sub subscription",
        "input_type": "api_stream", "input_protocol": "https", "input_port": 443, "input_format": "json",
        "auth_type": "oauth2", "parser_engine": "json_path", "ocsf_event_class": 6003,
    },
    {
        "name": "elastic_beats_receiver",
        "version": "1.0.0",
        "vendor": "Elastic",
        "category": "siem_integration",
        "description": "Receive events from Elastic Beats agents (Filebeat, Winlogbeat)",
        "input_type": "http_listener", "input_protocol": "https", "input_port": 5044, "input_format": "elastic_bulk",
        "auth_type": "api_key", "parser_engine": "json_path", "ocsf_event_class": 6003,
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
# MAGIC ## Seed Demo Fleet (simulated running collectors for UI)

# COMMAND ----------

import random

DEMO_FLEET = [
    {"hostname": "fw-edge-nyc-01", "dna": "palo_alto_firewall", "site": "NYC-DC1", "ip": "10.1.1.10", "os": "PAN-OS 11.1", "eps": 12450, "lat": 2.1},
    {"hostname": "fw-edge-nyc-02", "dna": "palo_alto_firewall", "site": "NYC-DC1", "ip": "10.1.1.11", "os": "PAN-OS 11.1", "eps": 11200, "lat": 1.8},
    {"hostname": "forti-dmz-lon-01", "dna": "fortinet_fortigate", "site": "LON-DC2", "ip": "10.2.1.20", "os": "FortiOS 7.4", "eps": 8900, "lat": 3.4},
    {"hostname": "cs-sensor-gw-01", "dna": "crowdstrike_falcon", "site": "AWS-US-EAST", "ip": "172.31.5.100", "os": "linux", "eps": 45000, "lat": 1.2},
    {"hostname": "cs-sensor-gw-02", "dna": "crowdstrike_falcon", "site": "AWS-EU-WEST", "ip": "172.31.6.100", "os": "linux", "eps": 38000, "lat": 1.5},
    {"hostname": "asa-core-sfo-01", "dna": "cisco_asa", "site": "SFO-DC3", "ip": "10.3.1.5", "os": "ASA 9.18", "eps": 6500, "lat": 2.8},
    {"hostname": "wef-dc-corp-01", "dna": "windows_event_log", "site": "NYC-DC1", "ip": "10.1.10.50", "os": "Windows Server 2022", "eps": 18000, "lat": 4.2},
    {"hostname": "wef-dc-corp-02", "dna": "windows_event_log", "site": "LON-DC2", "ip": "10.2.10.50", "os": "Windows Server 2022", "eps": 15600, "lat": 5.1},
    {"hostname": "syslog-infra-01", "dna": "generic_syslog", "site": "NYC-DC1", "ip": "10.1.20.100", "os": "linux", "eps": 25000, "lat": 0.8},
    {"hostname": "syslog-infra-02", "dna": "generic_syslog", "site": "SFO-DC3", "ip": "10.3.20.100", "os": "linux", "eps": 22000, "lat": 0.9},
    {"hostname": "cloudtrail-ingest-01", "dna": "aws_cloudtrail", "site": "AWS-US-EAST", "ip": "172.31.8.10", "os": "linux", "eps": 3200, "lat": 8.5},
    {"hostname": "azure-hub-ingest-01", "dna": "azure_activity_log", "site": "AZURE-EASTUS2", "ip": "10.200.1.5", "os": "linux", "eps": 4100, "lat": 6.2},
    {"hostname": "splunk-bridge-01", "dna": "splunk_hec_receiver", "site": "NYC-DC1", "ip": "10.1.30.200", "os": "linux", "eps": 55000, "lat": 1.1},
    {"hostname": "scada-modbus-plant-01", "dna": "modbus_scada", "site": "PLANT-SP", "ip": "192.168.100.10", "os": "linux", "eps": 800, "lat": 0.5},
    {"hostname": "srx-branch-mia-01", "dna": "juniper_srx", "site": "MIA-BRANCH", "ip": "10.50.1.1", "os": "Junos 23.2", "eps": 4500, "lat": 2.3},
    {"hostname": "checkpoint-gw-fra-01", "dna": "check_point_firewall", "site": "FRA-DC4", "ip": "10.4.1.1", "os": "R81.20", "eps": 9800, "lat": 2.0},
    {"hostname": "zscaler-nss-01", "dna": "zscaler_zia", "site": "CLOUD-ZIA", "ip": "172.20.1.5", "os": "linux", "eps": 32000, "lat": 3.8},
    {"hostname": "s1-streaming-01", "dna": "sentinelone_edr", "site": "AWS-US-EAST", "ip": "172.31.9.20", "os": "linux", "eps": 12000, "lat": 2.5},
    {"hostname": "cb-forwarder-01", "dna": "carbon_black_edr", "site": "NYC-DC1", "ip": "10.1.40.15", "os": "linux", "eps": 18500, "lat": 1.9},
    {"hostname": "suricata-tap-01", "dna": "suricata_ids", "site": "NYC-DC1", "ip": "10.1.50.5", "os": "linux", "eps": 85000, "lat": 0.6},
    {"hostname": "zeek-sensor-01", "dna": "zeek_network", "site": "SFO-DC3", "ip": "10.3.50.5", "os": "linux", "eps": 120000, "lat": 0.4},
    {"hostname": "f5-waf-prod-01", "dna": "f5_bigip_waf", "site": "NYC-DC1", "ip": "10.1.60.10", "os": "BIG-IP 17.1", "eps": 7200, "lat": 1.5},
    {"hostname": "okta-poller-01", "dna": "okta_system_log", "site": "AWS-US-EAST", "ip": "172.31.10.5", "os": "linux", "eps": 1800, "lat": 12.0},
    {"hostname": "gws-poller-01", "dna": "google_workspace", "site": "GCP-US-CENTRAL", "ip": "10.128.0.5", "os": "linux", "eps": 950, "lat": 15.0},
    {"hostname": "o365-ingest-01", "dna": "office365_management", "site": "AZURE-EASTUS2", "ip": "10.200.2.5", "os": "linux", "eps": 2800, "lat": 10.5},
    {"hostname": "auditd-prod-web-01", "dna": "linux_auditd", "site": "NYC-DC1", "ip": "10.1.70.20", "os": "linux", "eps": 5500, "lat": 0.3},
    {"hostname": "auditd-prod-db-01", "dna": "linux_auditd", "site": "SFO-DC3", "ip": "10.3.70.20", "os": "linux", "eps": 4200, "lat": 0.4},
    {"hostname": "darktrace-bridge-01", "dna": "darktrace_detect", "site": "LON-DC2", "ip": "10.2.80.5", "os": "linux", "eps": 2200, "lat": 8.0},
    {"hostname": "vectra-bridge-01", "dna": "vectra_ai", "site": "NYC-DC1", "ip": "10.1.80.5", "os": "linux", "eps": 1500, "lat": 9.2},
    {"hostname": "proofpoint-ingest-01", "dna": "proofpoint_tap", "site": "AWS-US-EAST", "ip": "172.31.11.5", "os": "linux", "eps": 600, "lat": 18.0},
    {"hostname": "meraki-collector-01", "dna": "cisco_meraki", "site": "MIA-BRANCH", "ip": "10.50.2.10", "os": "linux", "eps": 3800, "lat": 1.8},
    {"hostname": "kafka-bridge-01", "dna": "kafka_consumer", "site": "NYC-DC1", "ip": "10.1.90.5", "os": "linux", "eps": 150000, "lat": 0.3},
    {"hostname": "gcp-audit-ingest-01", "dna": "gcp_audit_log", "site": "GCP-US-CENTRAL", "ip": "10.128.1.5", "os": "linux", "eps": 2900, "lat": 7.5},
    {"hostname": "elastic-bridge-01", "dna": "elastic_beats_receiver", "site": "LON-DC2", "ip": "10.2.90.5", "os": "linux", "eps": 68000, "lat": 1.0},
    {"hostname": "sophos-collector-tok-01", "dna": "sophos_xg", "site": "TOK-DC5", "ip": "10.5.1.10", "os": "linux", "eps": 7800, "lat": 2.2},
    {"hostname": "trendmicro-poller-01", "dna": "trend_micro_apex", "site": "TOK-DC5", "ip": "10.5.2.10", "os": "linux", "eps": 3400, "lat": 6.8},
]


def seed_demo_fleet() -> dict:
    """Seed the fleet with simulated running collectors and telemetry data."""
    import time

    seeded_deployments = 0
    seeded_telemetry = 0

    for c in DEMO_FLEET:
        collector_id = str(uuid.uuid4())
        deployment_id = str(uuid.uuid4())

        # Determine state (most running, a few degraded/stopped for realism)
        state = "running"
        if c["hostname"] in ("scada-modbus-plant-01",):
            state = "degraded"

        # Insert deployment
        spark.sql(f"""
            INSERT INTO {deployments_table} (
                deployment_id, collector_id, dna_name, dna_version,
                hostname, ip_address, os_type, os_version,
                install_method, actual_state, desired_state, binary_version,
                site_name, registered_at, updated_at
            ) VALUES (
                '{deployment_id}', '{collector_id}', '{c["dna"]}', '1.0.0',
                '{c["hostname"]}', '{c["ip"]}', '{c["os"].split()[0].lower() if " " in c["os"] else c["os"]}',
                '{c["os"]}', 'token', '{state}', 'running', '0.9.1',
                '{c["site"]}',
                current_timestamp() - INTERVAL {random.randint(1, 90)} DAYS,
                current_timestamp() - INTERVAL {random.randint(0, 2)} MINUTES
            )
        """)
        seeded_deployments += 1

        # Insert recent telemetry points (last 30 minutes, every 30s = 60 points)
        for i in range(60):
            eps_jitter = c["eps"] * random.uniform(0.85, 1.15)
            lat_jitter = c["lat"] * random.uniform(0.8, 1.3)
            cpu = random.uniform(5, 35)
            mem_mb = random.uniform(50, 250)

            spark.sql(f"""
                INSERT INTO {telemetry_table} (
                    telemetry_id, collector_id, timestamp,
                    events_per_second, bytes_per_second, error_count,
                    latency_ms, cpu_percent, memory_mb, uptime_seconds
                ) VALUES (
                    '{str(uuid.uuid4())}', '{collector_id}',
                    current_timestamp() - INTERVAL {i * 30} SECONDS,
                    {int(eps_jitter)}, {int(eps_jitter * 450)}, {random.randint(0, 3)},
                    {round(lat_jitter, 1)}, {round(cpu, 1)}, {round(mem_mb, 0)},
                    {random.randint(86400, 7776000)}
                )
            """)
            seeded_telemetry += 1

    return {
        "seeded_deployments": seeded_deployments,
        "seeded_telemetry_points": seeded_telemetry,
        "total_fleet_size": len(DEMO_FLEET),
    }

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
elif mode == "seed_demo_fleet":
    result = seed_demo_fleet()
else:
    result = {"error": f"Unknown mode: {mode}"}

mon.log_event("edge_control_plane", result)
print(json.dumps(result, indent=2, default=str))
dbutils.notebook.exit(json.dumps(result, default=str))
