# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI - Seed Complete Platform Data
# MAGIC
# MAGIC Populates ALL remaining tables required by the UI that are not produced by
# MAGIC automated pipelines. This ensures every tab in the platform displays real data.
# MAGIC
# MAGIC **Run AFTER:** `01_create_catalog_schema` and `02_seed_demo_data`
# MAGIC
# MAGIC **Tables seeded here (22):**
# MAGIC 1. system_settings - Platform configuration
# MAGIC 2. workflows - Automation workflows (n8n-style)
# MAGIC 3. reports - Scheduled/generated SOC reports
# MAGIC 4. compliance_frameworks - Compliance programs
# MAGIC 5. compliance_controls - Individual controls
# MAGIC 6. session_lists - Threat hunting session lists
# MAGIC 7. active_lists - Dynamic enrichment lists
# MAGIC 8. honeypot_deployments - Deception assets
# MAGIC 9. honeytoken_deployments - Deception tokens
# MAGIC 10. honeypot_interactions - Attacker interactions
# MAGIC 11. malware_samples - Sandbox analysis results
# MAGIC 12. mcp_servers - Model Context Protocol registry
# MAGIC 13. mcp_tools - MCP tool catalog
# MAGIC 14. llm_risk_profiles - LLM usage risk scoring
# MAGIC 15. glasswing_scans - Vulnerability scan runs
# MAGIC 16. glasswing_vulnerabilities - Discovered CVEs
# MAGIC 17. custom_dashboards - User dashboard layouts
# MAGIC 18. dashboard_widgets - Dashboard widget configs
# MAGIC 19. financial_transactions - Transaction monitoring
# MAGIC 20. financial_threat_intel - Financial threat data
# MAGIC 21. swarm_battlefields - Red vs Blue simulations
# MAGIC 22. threat_escalation_contracts - Data contracts

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql import Row
from datetime import datetime, timedelta
import random
import json

now = datetime.utcnow()

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. System Settings

# COMMAND ----------

settings_data = [
    Row(setting_key="platform_name", setting_value="0xDSI Agentic SOC", category="general"),
    Row(setting_key="retention_days", setting_value="90", category="storage"),
    Row(setting_key="alert_auto_close_days", setting_value="30", category="alerts"),
    Row(setting_key="max_concurrent_agents", setting_value="16", category="agents"),
    Row(setting_key="llm_token_budget_daily", setting_value="5000000", category="llm"),
    Row(setting_key="correlation_window_default", setting_value="300", category="correlation"),
    Row(setting_key="risk_score_critical_threshold", setting_value="85", category="risk"),
    Row(setting_key="risk_score_high_threshold", setting_value="70", category="risk"),
    Row(setting_key="ha_mode", setting_value="active-passive", category="high_availability"),
    Row(setting_key="ha_failover_timeout_seconds", setting_value="30", category="high_availability"),
    Row(setting_key="ha_replication_factor", setting_value="3", category="high_availability"),
    Row(setting_key="backup_schedule", setting_value="0 2 * * *", category="storage"),
    Row(setting_key="siem_ingest_rate_limit", setting_value="100000", category="ingestion"),
    Row(setting_key="notification_channels", setting_value='["slack", "email", "pagerduty"]', category="notifications"),
    Row(setting_key="default_severity_filter", setting_value="medium", category="ui"),
    Row(setting_key="formula_priority_weights", setting_value=json.dumps({
        "alert_severity": 0.20, "asset_criticality": 0.15, "user_privilege": 0.10,
        "ioc_matches": 0.15, "correlation_matches": 0.15, "campaign_association": 0.10,
        "temporal_anomaly": 0.05, "blast_radius": 0.10
    }), category="scoring"),
]

settings_df = spark.createDataFrame(settings_data)
settings_df = settings_df.withColumn("id", expr("uuid()")).withColumn("updated_at", current_timestamp())
settings_df.write.mode("overwrite").saveAsTable("system_settings")
print(f"Seeded {len(settings_data)} system settings")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Workflows

# COMMAND ----------

workflows_data = [
    Row(name="Alert to Slack Notification", workflow_type="notification", trigger_type="alert_created", trigger_condition='{"severity": ["critical", "high"]}', status="active", execution_count=1247, last_executed_at=now - timedelta(minutes=5)),
    Row(name="Auto-Enrich IOCs from VirusTotal", workflow_type="enrichment", trigger_type="ioc_detected", trigger_condition='{"confidence_min": 0.6}', status="active", execution_count=8934, last_executed_at=now - timedelta(minutes=2)),
    Row(name="Block IP on Firewall (High Confidence)", workflow_type="response", trigger_type="alert_created", trigger_condition='{"severity": "critical", "source": "threat_intel_matching", "confidence_min": 0.9}', status="active", execution_count=312, last_executed_at=now - timedelta(hours=1)),
    Row(name="Create Jira Ticket for Critical Cases", workflow_type="ticketing", trigger_type="case_created", trigger_condition='{"priority": "critical"}', status="active", execution_count=89, last_executed_at=now - timedelta(hours=3)),
    Row(name="Weekly Threat Report to CISO", workflow_type="reporting", trigger_type="schedule", trigger_condition='{"cron": "0 8 * * 1"}', status="active", execution_count=52, last_executed_at=now - timedelta(days=3)),
    Row(name="Quarantine Endpoint on Malware Detection", workflow_type="response", trigger_type="alert_created", trigger_condition='{"event_type": "malware_detected", "confidence_min": 0.85}', status="active", execution_count=43, last_executed_at=now - timedelta(hours=6)),
    Row(name="PagerDuty Escalation for P1 Cases", workflow_type="escalation", trigger_type="case_updated", trigger_condition='{"priority": "critical", "status": "open", "age_minutes_gt": 15}', status="active", execution_count=28, last_executed_at=now - timedelta(hours=2)),
    Row(name="Daily SOC Metrics to Dashboard", workflow_type="analytics", trigger_type="schedule", trigger_condition='{"cron": "0 6 * * *"}', status="active", execution_count=365, last_executed_at=now - timedelta(hours=18)),
    Row(name="Auto-Close Aged Low-Severity Alerts", workflow_type="housekeeping", trigger_type="schedule", trigger_condition='{"cron": "0 0 * * *", "age_days": 14, "severity": "low"}', status="active", execution_count=180, last_executed_at=now - timedelta(hours=24)),
    Row(name="Threat Intel Feed Sync (Hourly)", workflow_type="ingestion", trigger_type="schedule", trigger_condition='{"cron": "0 * * * *"}', status="paused", execution_count=4320, last_executed_at=now - timedelta(hours=48)),
]

wf_df = spark.createDataFrame(workflows_data)
wf_df = wf_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
wf_df.write.mode("overwrite").saveAsTable("workflows")
print(f"Seeded {len(workflows_data)} workflows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Reports

# COMMAND ----------

reports_data = [
    Row(title="Weekly Executive Security Briefing", report_type="executive", frequency="weekly", status="generated", format="pdf", generated_by="ciso_assistant_agent"),
    Row(title="Daily SOC Operations Summary", report_type="operational", frequency="daily", status="generated", format="html", generated_by="report_agent"),
    Row(title="Monthly Compliance Status Report", report_type="compliance", frequency="monthly", status="generated", format="pdf", generated_by="compliance_agent"),
    Row(title="Incident Response Metrics Q1 2026", report_type="metrics", frequency="quarterly", status="generated", format="pdf", generated_by="analytics_agent"),
    Row(title="Threat Landscape Analysis - May 2026", report_type="threat_intel", frequency="monthly", status="generated", format="html", generated_by="threat_radar_agent"),
    Row(title="User Behavior Anomaly Trends", report_type="behavioral", frequency="weekly", status="generated", format="html", generated_by="behavioral_ml_agent"),
    Row(title="Detection Coverage vs MITRE ATT&CK", report_type="coverage", frequency="monthly", status="generated", format="pdf", generated_by="detection_confluence"),
    Row(title="Agent Performance Dashboard", report_type="system", frequency="daily", status="generated", format="html", generated_by="orchestrator_agent"),
]

reports_df = spark.createDataFrame(reports_data)
reports_df = (reports_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp() - expr("INTERVAL 7 DAYS"))
    .withColumn("generated_at", current_timestamp() - expr("INTERVAL 1 HOUR"))
)
reports_df.write.mode("overwrite").saveAsTable("reports")
print(f"Seeded {len(reports_data)} reports")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4-5. Compliance Frameworks & Controls

# COMMAND ----------

frameworks_data = [
    Row(framework_name="NIST CSF 2.0", version="2.0", category="cybersecurity", compliance_score=82.5, total_controls=108, controls_passed=89, controls_failed=12, controls_not_applicable=7, last_assessed=now - timedelta(days=3)),
    Row(framework_name="ISO 27001:2022", version="2022", category="information_security", compliance_score=78.2, total_controls=93, controls_passed=73, controls_failed=14, controls_not_applicable=6, last_assessed=now - timedelta(days=5)),
    Row(framework_name="SOC 2 Type II", version="2024", category="trust_services", compliance_score=91.0, total_controls=64, controls_passed=58, controls_failed=4, controls_not_applicable=2, last_assessed=now - timedelta(days=1)),
    Row(framework_name="PCI DSS 4.0", version="4.0", category="payment_security", compliance_score=88.7, total_controls=79, controls_passed=70, controls_failed=6, controls_not_applicable=3, last_assessed=now - timedelta(days=7)),
    Row(framework_name="LGPD (Brazil)", version="2020", category="data_privacy", compliance_score=75.0, total_controls=45, controls_passed=34, controls_failed=8, controls_not_applicable=3, last_assessed=now - timedelta(days=10)),
    Row(framework_name="CIS Controls v8", version="8.0", category="cybersecurity", compliance_score=85.3, total_controls=153, controls_passed=131, controls_failed=15, controls_not_applicable=7, last_assessed=now - timedelta(days=2)),
]

fw_df = spark.createDataFrame(frameworks_data)
fw_df = fw_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
fw_df.write.mode("overwrite").saveAsTable("compliance_frameworks")

# Controls
controls_data = []
control_statuses = ["passed", "failed", "not_applicable", "in_progress"]
for fw in frameworks_data:
    for i in range(min(20, fw.total_controls)):
        controls_data.append(Row(
            framework_name=fw.framework_name,
            control_id=f"{fw.framework_name[:3].upper()}-{i+1:03d}",
            control_name=random.choice([
                "Access Control Policy", "Encryption at Rest", "Logging and Monitoring",
                "Incident Response Plan", "Vulnerability Management", "Asset Inventory",
                "Network Segmentation", "Data Classification", "Security Awareness Training",
                "Change Management", "Backup and Recovery", "Endpoint Protection",
                "Identity and Access Management", "Third-Party Risk", "Penetration Testing",
            ]),
            status=random.choices(control_statuses, weights=[60, 15, 10, 15])[0],
            severity=random.choice(["critical", "high", "medium", "low"]),
            evidence_count=random.randint(1, 15),
            last_tested=now - timedelta(days=random.randint(1, 30)),
            remediation_due=now + timedelta(days=random.randint(7, 90)) if random.random() > 0.7 else None,
        ))

ctrl_df = spark.createDataFrame(controls_data)
ctrl_df = ctrl_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
ctrl_df.write.mode("overwrite").saveAsTable("compliance_controls")
print(f"Seeded {len(frameworks_data)} compliance frameworks, {len(controls_data)} controls")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6-7. Session Lists & Active Lists

# COMMAND ----------

session_lists_data = [
    Row(name="Active Threat Hunt: APT29 Indicators", list_type="ioc_watchlist", entries_count=47, description="IOCs from current Cozy Bear hunt campaign", owner="ana.torres@corp.com", status="active"),
    Row(name="Lateral Movement Source IPs", list_type="ip_list", entries_count=23, description="IPs observed in RDP lateral movement sequences", owner="ana.torres@corp.com", status="active"),
    Row(name="Suspicious DNS Domains (Last 24h)", list_type="domain_list", entries_count=156, description="High-entropy domains from DNS tunnel detection", owner="david.kim@corp.com", status="active"),
    Row(name="Compromised Credential Hashes", list_type="hash_list", entries_count=12, description="Password hashes found in dark web dump", owner="security-team", status="active"),
    Row(name="VIP Users Under Investigation", list_type="user_list", entries_count=3, description="Executive accounts with anomalous behavior patterns", owner="ana.torres@corp.com", status="active"),
]

sl_df = spark.createDataFrame(session_lists_data)
sl_df = sl_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp()).withColumn("updated_at", current_timestamp())
sl_df.write.mode("overwrite").saveAsTable("session_lists")

active_lists_data = [
    Row(name="Blocked IPs (Auto-Response)", list_type="blocklist", entries_count=342, description="IPs blocked by automated response workflows", ttl_seconds=86400, category="response"),
    Row(name="Known Good Processes", list_type="allowlist", entries_count=1247, description="Baseline process names for anomaly suppression", ttl_seconds=None, category="suppression"),
    Row(name="VPN Exit Nodes", list_type="reference", entries_count=89, description="Known corporate VPN egress IPs", ttl_seconds=None, category="enrichment"),
    Row(name="Service Account Registry", list_type="reference", entries_count=56, description="All service accounts with expected behavior profiles", ttl_seconds=None, category="enrichment"),
    Row(name="Geo-Impossible Travel Exclusions", list_type="exclusion", entries_count=15, description="Users with valid multi-region travel patterns", ttl_seconds=604800, category="suppression"),
    Row(name="Threat Campaign IOC Cache", list_type="ioc_cache", entries_count=2847, description="Aggregated IOCs from all active campaigns", ttl_seconds=3600, category="detection"),
    Row(name="High-Risk Departing Employees", list_type="watchlist", entries_count=4, description="Users in notice period with elevated monitoring", ttl_seconds=2592000, category="insider_threat"),
]

al_df = spark.createDataFrame(active_lists_data)
al_df = al_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp()).withColumn("updated_at", current_timestamp())
al_df.write.mode("overwrite").saveAsTable("active_lists")
print(f"Seeded {len(session_lists_data)} session lists, {len(active_lists_data)} active lists")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 8-10. Honeypots, Honeytokens & Interactions

# COMMAND ----------

honeypots = [
    Row(name="SSH Honeypot (DMZ-East)", honeypot_type="ssh", ip_address="10.99.1.10", port=22, status="active", location="US-East DMZ", interactions_total=2847, last_interaction=now - timedelta(minutes=12)),
    Row(name="RDP Honeypot (Finance VLAN)", honeypot_type="rdp", ip_address="10.99.2.20", port=3389, status="active", location="Finance Subnet", interactions_total=1203, last_interaction=now - timedelta(minutes=45)),
    Row(name="HTTP Honeypot (Admin Portal)", honeypot_type="http", ip_address="10.99.3.30", port=443, status="active", location="Internal Web", interactions_total=5612, last_interaction=now - timedelta(minutes=3)),
    Row(name="SMB Honeypot (File Share)", honeypot_type="smb", ip_address="10.99.4.40", port=445, status="active", location="Corporate LAN", interactions_total=987, last_interaction=now - timedelta(hours=2)),
    Row(name="Database Honeypot (MSSQL)", honeypot_type="database", ip_address="10.99.5.50", port=1433, status="active", location="Data Center", interactions_total=432, last_interaction=now - timedelta(hours=6)),
]

hp_df = spark.createDataFrame(honeypots)
hp_df = hp_df.withColumn("id", expr("uuid()")).withColumn("deployed_at", current_timestamp() - expr("INTERVAL 30 DAYS"))
hp_df.write.mode("overwrite").saveAsTable("honeypot_deployments")

honeytokens = [
    Row(name="AWS Canary Key (S3 Admin)", token_type="aws_key", location="/home/admin/.aws/credentials", status="active", triggered=False, description="Fake AWS key in admin home dir"),
    Row(name="Database Connection String", token_type="connection_string", location="/opt/app/config/db.conf", status="active", triggered=True, description="Fake DB credentials in app config"),
    Row(name="API Key in Git Repo", token_type="api_key", location="gitlab.corp.local/secrets.env", status="active", triggered=False, description="Planted API key in internal repo"),
    Row(name="Admin Password in SharePoint", token_type="password", location="sharepoint/IT/passwords.xlsx", status="active", triggered=True, description="Fake admin password in shared drive"),
    Row(name="SSH Private Key (CEO Laptop)", token_type="ssh_key", location="/Users/ceo/.ssh/id_rsa_backup", status="active", triggered=False, description="Canary SSH key on executive endpoint"),
]

ht_df = spark.createDataFrame(honeytokens)
ht_df = ht_df.withColumn("id", expr("uuid()")).withColumn("deployed_at", current_timestamp() - expr("INTERVAL 14 DAYS"))
ht_df.write.mode("overwrite").saveAsTable("honeytoken_deployments")

# Interactions
interactions_data = []
attack_types = ["credential_brute_force", "directory_traversal", "sql_injection", "port_scan", "credential_spray", "lateral_movement_attempt"]
for i in range(100):
    interactions_data.append(Row(
        honeypot_id="placeholder",
        source_ip=f"185.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
        attack_type=random.choice(attack_types),
        payload=f"simulated payload data for interaction {i}",
        severity=random.choice(["low", "medium", "high", "critical"]),
        geo_country=random.choice(["CN", "RU", "IR", "KP", "BR", "US", "DE", "unknown"]),
        session_duration_seconds=random.randint(1, 3600),
    ))

int_df = spark.createDataFrame(interactions_data)
int_df = (int_df
    .withColumn("id", expr("uuid()"))
    .withColumn("detected_at", current_timestamp() - expr(f"INTERVAL {random.randint(0, 604800)} SECONDS"))
)
int_df.write.mode("overwrite").saveAsTable("honeypot_interactions")
print(f"Seeded {len(honeypots)} honeypots, {len(honeytokens)} honeytokens, {len(interactions_data)} interactions")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 11. Malware Samples

# COMMAND ----------

malware_data = [
    Row(sha256="a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456", filename="invoice_2026.exe", family="Emotet", classification="trojan_downloader", severity="critical", confidence=0.97, sandbox_verdict="malicious", analysis_duration_seconds=120, network_iocs=5, file_iocs=3, behavior_iocs=8),
    Row(sha256="b2c3d4e5f67890123456789012345678901abcdef1234567890abcdef1234567", filename="update.dll", family="Cobalt Strike", classification="backdoor", severity="critical", confidence=0.99, sandbox_verdict="malicious", analysis_duration_seconds=180, network_iocs=12, file_iocs=2, behavior_iocs=15),
    Row(sha256="c3d4e5f678901234567890123456789012abcdef1234567890abcdef12345678", filename="resume.docm", family="Unknown", classification="macro_dropper", severity="high", confidence=0.85, sandbox_verdict="malicious", analysis_duration_seconds=90, network_iocs=2, file_iocs=1, behavior_iocs=4),
    Row(sha256="d4e5f6789012345678901234567890123abcdef1234567890abcdef123456789", filename="chrome_update.msi", family="QakBot", classification="banking_trojan", severity="critical", confidence=0.92, sandbox_verdict="malicious", analysis_duration_seconds=240, network_iocs=8, file_iocs=5, behavior_iocs=11),
    Row(sha256="e5f67890123456789012345678901234abcdef1234567890abcdef1234567890", filename="productivity_tool.exe", family="LockBit", classification="ransomware", severity="critical", confidence=0.98, sandbox_verdict="malicious", analysis_duration_seconds=60, network_iocs=3, file_iocs=7, behavior_iocs=20),
    Row(sha256="f678901234567890123456789012345abcdef1234567890abcdef12345678901", filename="vpn_client.exe", family="Benign", classification="clean", severity="low", confidence=0.95, sandbox_verdict="clean", analysis_duration_seconds=300, network_iocs=0, file_iocs=0, behavior_iocs=0),
]

mw_df = spark.createDataFrame(malware_data)
mw_df = (mw_df
    .withColumn("id", expr("uuid()"))
    .withColumn("submitted_at", current_timestamp() - expr("INTERVAL 48 HOURS"))
    .withColumn("analyzed_at", current_timestamp() - expr("INTERVAL 47 HOURS"))
)
mw_df.write.mode("overwrite").saveAsTable("malware_samples")
print(f"Seeded {len(malware_data)} malware samples")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 12-13. MCP Servers & Tools

# COMMAND ----------

mcp_servers_data = [
    Row(name="Databricks Unity Catalog", server_type="data_access", endpoint="databricks://unity-catalog", status="connected", tools_count=8, description="Query Delta tables, manage permissions, browse schemas"),
    Row(name="CrowdStrike Falcon", server_type="edr", endpoint="https://api.crowdstrike.com/mcp", status="connected", tools_count=12, description="Endpoint detection, quarantine, IOC search"),
    Row(name="Splunk Enterprise", server_type="siem", endpoint="https://splunk.corp.local:8089/mcp", status="connected", tools_count=6, description="Log search, saved searches, alerts"),
    Row(name="ServiceNow ITSM", server_type="ticketing", endpoint="https://corp.service-now.com/mcp", status="connected", tools_count=5, description="Incident creation, change management, CMDB"),
    Row(name="Slack Workspace", server_type="communication", endpoint="https://slack.com/api/mcp", status="connected", tools_count=4, description="Notifications, channel management, thread responses"),
    Row(name="AWS Security Hub", server_type="cloud_security", endpoint="aws://security-hub/mcp", status="connected", tools_count=7, description="Findings, compliance checks, resource inventory"),
    Row(name="VirusTotal", server_type="threat_intel", endpoint="https://www.virustotal.com/api/v3/mcp", status="connected", tools_count=5, description="File analysis, URL scanning, IP reputation"),
    Row(name="Jira Software", server_type="project_management", endpoint="https://corp.atlassian.net/mcp", status="disconnected", tools_count=4, description="Issue tracking, sprint management, automation"),
]

mcp_df = spark.createDataFrame(mcp_servers_data)
mcp_df = mcp_df.withColumn("id", expr("uuid()")).withColumn("registered_at", current_timestamp())
mcp_df.write.mode("overwrite").saveAsTable("mcp_servers")

mcp_tools_data = []
tool_templates = [
    ("query_table", "data_access", "Execute SQL query against Unity Catalog table"),
    ("search_iocs", "threat_intel", "Search IOC database by indicator type and value"),
    ("quarantine_endpoint", "response", "Isolate endpoint from network"),
    ("create_incident", "ticketing", "Create incident ticket in ITSM"),
    ("send_notification", "communication", "Send message to SOC channel"),
    ("scan_file", "analysis", "Submit file hash for sandbox analysis"),
    ("get_asset_info", "enrichment", "Retrieve asset details from CMDB"),
    ("block_ip", "response", "Add IP to firewall blocklist"),
    ("get_user_sessions", "investigation", "List active sessions for a user"),
    ("run_hunt_query", "hunting", "Execute threat hunting query"),
    ("get_compliance_status", "governance", "Check control compliance status"),
    ("generate_report", "reporting", "Generate formatted security report"),
]

for server in mcp_servers_data:
    for tool_name, tool_type, desc in random.sample(tool_templates, min(server.tools_count, len(tool_templates))):
        mcp_tools_data.append(Row(
            server_name=server.name,
            tool_name=f"{server.name.lower().replace(' ', '_')}_{tool_name}",
            tool_type=tool_type,
            description=f"[{server.name}] {desc}",
            input_schema='{"type": "object"}',
            status="active" if server.status == "connected" else "inactive",
        ))

tools_df = spark.createDataFrame(mcp_tools_data)
tools_df = tools_df.withColumn("id", expr("uuid()")).withColumn("registered_at", current_timestamp())
tools_df.write.mode("overwrite").saveAsTable("mcp_tools")
print(f"Seeded {len(mcp_servers_data)} MCP servers, {len(mcp_tools_data)} tools")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 14. LLM Risk Profiles

# COMMAND ----------

llm_risk_data = []
for user_id in [f"usr-{i:03d}" for i in range(1, 11)]:
    llm_risk_data.append(Row(
        user_id=user_id,
        risk_score=random.randint(10, 95),
        total_queries=random.randint(50, 5000),
        sensitive_queries=random.randint(0, 200),
        policy_violations=random.randint(0, 15),
        pii_exposure_attempts=random.randint(0, 8),
        prompt_injection_attempts=random.randint(0, 3),
        data_exfil_risk=random.choice(["low", "medium", "high"]),
        last_violation_type=random.choice(["pii_query", "jailbreak_attempt", "data_extraction", "role_bypass", None]),
    ))

llm_df = spark.createDataFrame(llm_risk_data)
llm_df = (llm_df
    .withColumn("id", expr("uuid()"))
    .withColumn("assessed_at", current_timestamp())
    .withColumn("created_at", current_timestamp())
)
llm_df.write.mode("overwrite").saveAsTable("llm_risk_profiles")
print(f"Seeded {len(llm_risk_data)} LLM risk profiles")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 15-16. Glasswing Scans & Vulnerabilities

# COMMAND ----------

scans_data = [
    Row(scan_type="full_infrastructure", status="completed", assets_scanned=847, vulnerabilities_found=234, critical_count=12, high_count=45, medium_count=89, low_count=88, duration_seconds=3600, scanner_version="3.2.1"),
    Row(scan_type="web_application", status="completed", assets_scanned=23, vulnerabilities_found=67, critical_count=3, high_count=12, medium_count=28, low_count=24, duration_seconds=1800, scanner_version="3.2.1"),
    Row(scan_type="container_registry", status="completed", assets_scanned=156, vulnerabilities_found=412, critical_count=8, high_count=34, medium_count=187, low_count=183, duration_seconds=900, scanner_version="3.2.1"),
    Row(scan_type="cloud_posture", status="running", assets_scanned=0, vulnerabilities_found=0, critical_count=0, high_count=0, medium_count=0, low_count=0, duration_seconds=0, scanner_version="3.2.1"),
    Row(scan_type="network_discovery", status="completed", assets_scanned=2341, vulnerabilities_found=89, critical_count=2, high_count=15, medium_count=34, low_count=38, duration_seconds=7200, scanner_version="3.2.1"),
]

scans_df = spark.createDataFrame(scans_data)
scans_df = (scans_df
    .withColumn("id", expr("uuid()"))
    .withColumn("started_at", current_timestamp() - expr("INTERVAL 6 HOURS"))
    .withColumn("completed_at", when(col("status") == "completed", current_timestamp() - expr("INTERVAL 5 HOURS")))
)
scans_df.write.mode("overwrite").saveAsTable("glasswing_scans")

vulns_data = []
cves = ["CVE-2024-3400", "CVE-2024-21762", "CVE-2023-44487", "CVE-2024-0012", "CVE-2024-9474",
        "CVE-2023-46805", "CVE-2024-1709", "CVE-2024-27198", "CVE-2024-3094", "CVE-2024-6387",
        "CVE-2024-38063", "CVE-2024-47575", "CVE-2024-20353", "CVE-2024-29824", "CVE-2024-5910"]
for i, cve in enumerate(cves):
    vulns_data.append(Row(
        cve_id=cve,
        title=f"Critical vulnerability in {'Palo Alto' if i < 3 else 'Fortinet' if i < 6 else 'Cisco' if i < 9 else 'Linux'} component",
        severity=random.choice(["critical", "critical", "high", "high", "medium"]),
        cvss_score=round(random.uniform(7.0, 10.0), 1),
        affected_assets=random.randint(1, 50),
        status=random.choice(["open", "in_progress", "remediated", "accepted"]),
        exploitability=random.choice(["active_exploitation", "poc_available", "theoretical"]),
        remediation=random.choice(["patch_available", "workaround_only", "no_fix"]),
        first_detected=now - timedelta(days=random.randint(1, 60)),
    ))

vulns_df = spark.createDataFrame(vulns_data)
vulns_df = vulns_df.withColumn("id", expr("uuid()")).withColumn("scan_id", lit("latest"))
vulns_df.write.mode("overwrite").saveAsTable("glasswing_vulnerabilities")
print(f"Seeded {len(scans_data)} scans, {len(vulns_data)} vulnerabilities")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 17-18. Custom Dashboards & Widgets

# COMMAND ----------

dashboards_data = [
    Row(name="SOC Overview", owner="ana.torres@corp.com", layout_type="grid", is_default=True, widgets_count=8),
    Row(name="Threat Hunting Workspace", owner="david.kim@corp.com", layout_type="grid", is_default=False, widgets_count=6),
    Row(name="Executive Summary", owner="sarah.j@corp.com", layout_type="fixed", is_default=False, widgets_count=4),
    Row(name="Compliance Monitoring", owner="maria.g@corp.com", layout_type="grid", is_default=False, widgets_count=5),
]

dash_df = spark.createDataFrame(dashboards_data)
dash_df = dash_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
dash_df.write.mode("overwrite").saveAsTable("custom_dashboards")

widgets_data = []
widget_types = ["stat_counter", "time_series", "bar_chart", "pie_chart", "table", "heatmap", "gauge"]
for dash in dashboards_data:
    for w in range(dash.widgets_count):
        widgets_data.append(Row(
            dashboard_name=dash.name,
            widget_type=random.choice(widget_types),
            title=random.choice(["Critical Alerts", "Events/Hour", "MTTR", "Open Cases", "Agent Status", "Risk Score", "Coverage %", "Top IOCs"]),
            position_x=w % 4,
            position_y=w // 4,
            width=random.choice([1, 2]),
            height=1,
            data_source=random.choice(["alerts", "events", "cases", "agent_status", "correlation_rules"]),
        ))

widgets_df = spark.createDataFrame(widgets_data)
widgets_df = widgets_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
widgets_df.write.mode("overwrite").saveAsTable("dashboard_widgets")
print(f"Seeded {len(dashboards_data)} dashboards, {len(widgets_data)} widgets")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 19-20. Financial Threat Intel & Transactions

# COMMAND ----------

fin_intel_data = [
    Row(threat_name="PIX Trojan: BrazKing", threat_type="banking_trojan", target_region="BR", severity="critical", active=True, iocs_count=45, affected_institutions=12),
    Row(threat_name="Boleto Fraud Ring: PixPhish", threat_type="fraud_scheme", target_region="BR", severity="high", active=True, iocs_count=23, affected_institutions=8),
    Row(threat_name="ATM Jackpotting: Ploutus-D", threat_type="atm_malware", target_region="LATAM", severity="critical", active=True, iocs_count=15, affected_institutions=3),
    Row(threat_name="Card Skimming: MagecartV12", threat_type="web_skimmer", target_region="Global", severity="high", active=True, iocs_count=89, affected_institutions=200),
    Row(threat_name="Business Email Compromise: SilverTerrier", threat_type="bec", target_region="Global", severity="high", active=True, iocs_count=34, affected_institutions=50),
]

fi_df = spark.createDataFrame(fin_intel_data)
fi_df = fi_df.withColumn("id", expr("uuid()")).withColumn("first_seen", current_timestamp() - expr("INTERVAL 90 DAYS")).withColumn("last_updated", current_timestamp())
fi_df.write.mode("overwrite").saveAsTable("financial_threat_intel")

txn_data = []
for i in range(200):
    is_suspicious = random.random() < 0.15
    txn_data.append(Row(
        transaction_id=f"TXN-{i:06d}",
        transaction_type=random.choice(["pix", "ted", "card_present", "card_not_present", "boleto"]),
        amount=round(random.uniform(10, 50000 if is_suspicious else 5000), 2),
        currency="BRL",
        sender_id=f"usr-{random.randint(1, 10):03d}",
        receiver_id=f"ext-{random.randint(1, 100):04d}",
        risk_score=random.randint(70, 99) if is_suspicious else random.randint(5, 40),
        is_flagged=is_suspicious,
        flag_reason="anomalous_amount" if is_suspicious and random.random() > 0.5 else "new_receiver" if is_suspicious else None,
        geo_location=random.choice(["SP", "RJ", "MG", "BA", "RS", "PR"]),
    ))

txn_df = spark.createDataFrame(txn_data)
txn_df = (txn_df
    .withColumn("id", expr("uuid()"))
    .withColumn("timestamp", current_timestamp() - expr(f"INTERVAL {random.randint(0, 172800)} SECONDS"))
)
txn_df.write.mode("overwrite").saveAsTable("financial_transactions")
print(f"Seeded {len(fin_intel_data)} financial threats, {len(txn_data)} transactions")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 21. Swarm Battlefields

# COMMAND ----------

swarm_data = [
    Row(name="APT29 vs SOC Agents (Full Kill Chain)", scenario_type="apt_simulation", status="completed", red_team_score=45, blue_team_score=78, duration_seconds=7200, attacks_launched=34, attacks_detected=27, attacks_blocked=22),
    Row(name="Ransomware Deployment Race", scenario_type="ransomware", status="completed", red_team_score=30, blue_team_score=92, duration_seconds=3600, attacks_launched=12, attacks_detected=11, attacks_blocked=11),
    Row(name="Insider Threat: Data Exfiltration", scenario_type="insider_threat", status="running", red_team_score=55, blue_team_score=60, duration_seconds=1800, attacks_launched=8, attacks_detected=5, attacks_blocked=3),
    Row(name="Supply Chain Compromise (SolarWinds-Style)", scenario_type="supply_chain", status="completed", red_team_score=72, blue_team_score=45, duration_seconds=14400, attacks_launched=6, attacks_detected=3, attacks_blocked=2),
    Row(name="Cloud Infrastructure Takeover", scenario_type="cloud_attack", status="scheduled", red_team_score=0, blue_team_score=0, duration_seconds=0, attacks_launched=0, attacks_detected=0, attacks_blocked=0),
]

sw_df = spark.createDataFrame(swarm_data)
sw_df = (sw_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp() - expr("INTERVAL 7 DAYS"))
    .withColumn("started_at", when(col("status") != "scheduled", current_timestamp() - expr("INTERVAL 6 HOURS")))
)
sw_df.write.mode("overwrite").saveAsTable("swarm_battlefields")
print(f"Seeded {len(swarm_data)} swarm battlefields")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 22. Threat Escalation Contracts

# COMMAND ----------

contracts_data = [
    Row(contract_name="SOC L1 to L2 Escalation", domain="alert_triage", trigger_condition="risk_score > 70 AND confidence > 0.8", sla_minutes=15, escalation_target="soc_l2_team", priority="high"),
    Row(contract_name="Critical to CISO", domain="executive_escalation", trigger_condition="severity = 'critical' AND blast_radius > 50", sla_minutes=5, escalation_target="ciso", priority="critical"),
    Row(contract_name="Insider Threat to HR", domain="insider_threat", trigger_condition="insider_score > 85 AND evidence_count > 3", sla_minutes=30, escalation_target="hr_security", priority="high"),
    Row(contract_name="Compliance Violation to Legal", domain="compliance", trigger_condition="control_status = 'failed' AND framework = 'LGPD'", sla_minutes=60, escalation_target="legal_team", priority="medium"),
    Row(contract_name="Ransomware to Incident Commander", domain="incident_response", trigger_condition="classification = 'ransomware' AND confidence > 0.9", sla_minutes=2, escalation_target="incident_commander", priority="critical"),
    Row(contract_name="Data Exfil to DLP Team", domain="data_protection", trigger_condition="exfil_volume_mb > 100 OR sensitivity = 'confidential'", sla_minutes=10, escalation_target="dlp_team", priority="high"),
]

esc_df = spark.createDataFrame(contracts_data)
esc_df = (esc_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp())
    .withColumn("version", lit(1))
    .withColumn("is_active", lit(True))
)
esc_df.write.mode("overwrite").saveAsTable("threat_escalation_contracts")
print(f"Seeded {len(contracts_data)} escalation contracts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Additional Tables: SOC Agent Registry & Implementations

# COMMAND ----------

soc_agents = [
    Row(agent_name="Triage Agent", agent_type="llm_classifier", status="active", version="2.1", model_endpoint="databricks-meta-llama-3-1-70b-instruct", avg_latency_ms=1200, accuracy_score=0.94),
    Row(agent_name="Enrichment Agent", agent_type="tool_augmented", status="active", version="1.8", model_endpoint="databricks-meta-llama-3-1-70b-instruct", avg_latency_ms=2400, accuracy_score=0.91),
    Row(agent_name="Threat Hunter", agent_type="autonomous", status="active", version="1.5", model_endpoint="databricks-meta-llama-3-1-70b-instruct", avg_latency_ms=5000, accuracy_score=0.87),
    Row(agent_name="Correlation Engine", agent_type="streaming_cep", status="active", version="3.0", model_endpoint=None, avg_latency_ms=50, accuracy_score=0.96),
    Row(agent_name="Detection SLM", agent_type="llm_classifier", status="active", version="1.0", model_endpoint="databricks-meta-llama-3-1-8b-instruct", avg_latency_ms=400, accuracy_score=0.89),
    Row(agent_name="Formula Prioritizer", agent_type="deterministic", status="active", version="1.0", model_endpoint=None, avg_latency_ms=30, accuracy_score=0.98),
    Row(agent_name="Confluence Arbiter", agent_type="fusion_engine", status="active", version="2.0", model_endpoint=None, avg_latency_ms=200, accuracy_score=0.93),
    Row(agent_name="Auto Responder", agent_type="workflow_engine", status="active", version="1.3", model_endpoint=None, avg_latency_ms=150, accuracy_score=0.97),
    Row(agent_name="CISO Assistant", agent_type="advisory", status="active", version="1.2", model_endpoint="databricks-meta-llama-3-1-70b-instruct", avg_latency_ms=3000, accuracy_score=0.85),
    Row(agent_name="Red Team Simulator", agent_type="adversarial", status="active", version="1.1", model_endpoint="databricks-meta-llama-3-1-70b-instruct", avg_latency_ms=8000, accuracy_score=0.82),
]

sar_df = spark.createDataFrame(soc_agents)
sar_df = sar_df.withColumn("id", expr("uuid()")).withColumn("registered_at", current_timestamp())
sar_df.write.mode("overwrite").saveAsTable("soc_agent_registry")

# Agent implementations
impl_data = []
for agent in soc_agents:
    impl_data.append(Row(
        agent_name=agent.agent_name,
        notebook_path=f"/Workspace/0xDSI/agents/{agent.agent_name.lower().replace(' ', '_')}.py",
        schedule="*/2 * * * *" if agent.agent_type in ("llm_classifier", "streaming_cep") else "*/5 * * * *",
        last_run_status="success",
        last_run_duration_seconds=random.randint(10, 300),
        runs_today=random.randint(50, 720),
        errors_today=random.randint(0, 3),
    ))

impl_df = spark.createDataFrame(impl_data)
impl_df = (impl_df
    .withColumn("id", expr("uuid()"))
    .withColumn("deployed_at", current_timestamp() - expr("INTERVAL 14 DAYS"))
    .withColumn("last_run_at", current_timestamp() - expr("INTERVAL 2 MINUTES"))
)
impl_df.write.mode("overwrite").saveAsTable("agent_implementations")
print(f"Seeded {len(soc_agents)} SOC agents, {len(impl_data)} implementations")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Additional: Response Actions, Graph Nodes/Edges, Threat Campaigns

# COMMAND ----------

# Response actions
response_data = [
    Row(action_type="block_ip", target="185.23.45.67", status="completed", initiated_by="auto_responder", approval_status="auto_approved", risk_score=92),
    Row(action_type="quarantine_endpoint", target="ws-007.corp.local", status="completed", initiated_by="auto_responder", approval_status="approved", risk_score=88),
    Row(action_type="disable_account", target="usr-005", status="pending_approval", initiated_by="triage_agent", approval_status="pending", risk_score=75),
    Row(action_type="block_domain", target="malware-c2.evil.com", status="completed", initiated_by="threat_intel_matcher", approval_status="auto_approved", risk_score=95),
    Row(action_type="reset_password", target="usr-003", status="completed", initiated_by="manual", approval_status="approved", risk_score=70),
    Row(action_type="isolate_network_segment", target="VLAN-Finance", status="pending_approval", initiated_by="correlation_engine", approval_status="pending", risk_score=85),
]

ra_df = spark.createDataFrame(response_data)
ra_df = (ra_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp() - expr("INTERVAL 24 HOURS"))
    .withColumn("executed_at", when(col("status") == "completed", current_timestamp() - expr("INTERVAL 23 HOURS")))
)
ra_df.write.mode("overwrite").saveAsTable("response_actions")

# Threat campaigns
campaigns_data = [
    Row(name="Cozy Bear (APT29) - SolarWinds Follow-up", status="active", attribution="Russia/SVR", confidence=0.85, target_sectors="government,technology", first_seen=now - timedelta(days=180), last_seen=now - timedelta(hours=6)),
    Row(name="Lazarus Group - Crypto Exchange Targeting", status="active", attribution="North Korea/RGB", confidence=0.92, target_sectors="financial,crypto", first_seen=now - timedelta(days=90), last_seen=now - timedelta(hours=12)),
    Row(name="Volt Typhoon - Critical Infrastructure", status="active", attribution="China/MSS", confidence=0.78, target_sectors="energy,telecom,water", first_seen=now - timedelta(days=365), last_seen=now - timedelta(days=2)),
    Row(name="LockBit 4.0 - Ransomware-as-a-Service", status="active", attribution="CIS Region", confidence=0.95, target_sectors="healthcare,manufacturing,education", first_seen=now - timedelta(days=60), last_seen=now - timedelta(hours=1)),
    Row(name="Scattered Spider - Identity Attacks", status="active", attribution="UK/US English-speaking", confidence=0.88, target_sectors="telecom,hospitality,financial", first_seen=now - timedelta(days=120), last_seen=now - timedelta(hours=3)),
]

camp_df = spark.createDataFrame(campaigns_data)
camp_df = camp_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
camp_df.write.mode("overwrite").saveAsTable("threat_campaigns")

# Graph nodes and edges
graph_nodes = []
for i in range(50):
    graph_nodes.append(Row(
        node_id=f"node-{i:03d}",
        node_type=random.choice(["ip", "user", "host", "domain", "process"]),
        label=random.choice(["10.0.1.5", "usr-003", "srv-001", "evil.com", "cmd.exe"]),
        risk_score=random.randint(0, 100),
    ))

gn_df = spark.createDataFrame(graph_nodes)
gn_df = gn_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
gn_df.write.mode("overwrite").saveAsTable("graph_streaming_nodes")

graph_edges = []
for i in range(100):
    graph_edges.append(Row(
        source_id=f"node-{random.randint(0, 49):03d}",
        target_id=f"node-{random.randint(0, 49):03d}",
        edge_type=random.choice(["connected_to", "authenticated_as", "executed", "queried", "transferred_data"]),
        weight=round(random.uniform(0.1, 1.0), 2),
    ))

ge_df = spark.createDataFrame(graph_edges)
ge_df = ge_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
ge_df.write.mode("overwrite").saveAsTable("graph_streaming_edges")

print(f"Seeded {len(response_data)} response actions, {len(campaigns_data)} campaigns, {len(graph_nodes)} graph nodes, {len(graph_edges)} graph edges")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Final Summary

# COMMAND ----------

print("\n" + "="*70)
print("  COMPLETE PLATFORM DATA SEEDED")
print("="*70)

all_tables = [
    "system_settings", "workflows", "reports",
    "compliance_frameworks", "compliance_controls",
    "session_lists", "active_lists",
    "honeypot_deployments", "honeytoken_deployments", "honeypot_interactions",
    "malware_samples", "mcp_servers", "mcp_tools",
    "llm_risk_profiles", "glasswing_scans", "glasswing_vulnerabilities",
    "custom_dashboards", "dashboard_widgets",
    "financial_threat_intel", "financial_transactions",
    "swarm_battlefields", "threat_escalation_contracts",
    "soc_agent_registry", "agent_implementations",
    "response_actions", "threat_campaigns",
    "graph_streaming_nodes", "graph_streaming_edges",
]

for t in all_tables:
    try:
        count = spark.table(t).count()
        print(f"  {t}: {count} rows")
    except Exception as e:
        print(f"  {t}: ERROR - {str(e)[:50]}")

print("="*70)
print("  All UI tabs should now display real data.")
print("="*70)
