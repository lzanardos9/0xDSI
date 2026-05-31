# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI - Seed Demo Data
# MAGIC Populates all tables with realistic security operations data for demonstration.
# MAGIC Run AFTER `01_create_catalog_schema`.
# MAGIC
# MAGIC **Note:** This notebook does NOT use `_shared/bootstrap` because it populates the
# MAGIC data that bootstrap-dependent notebooks consume. It operates at the infrastructure
# MAGIC level using direct widget-based configuration.

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
import random

# COMMAND ----------

# MAGIC %md
# MAGIC ## User Profiles

# COMMAND ----------

users = [
    Row(id="usr-001", display_name="Carlos Silva", email="carlos.silva@corp.com", username="csilva", department="Engineering", role="admin", risk_level="low"),
    Row(id="usr-002", display_name="Ana Torres", email="ana.torres@corp.com", username="atorres", department="Security", role="analyst", risk_level="low"),
    Row(id="usr-003", display_name="Marco Chen", email="marco.chen@corp.com", username="mchen", department="Finance", role="user", risk_level="medium"),
    Row(id="usr-004", display_name="Julia Nascimento", email="julia.nasc@corp.com", username="jnascimento", department="HR", role="user", risk_level="low"),
    Row(id="usr-005", display_name="David Kim", email="david.kim@corp.com", username="dkim", department="IT Ops", role="admin", risk_level="high"),
    Row(id="usr-006", display_name="Sarah Johnson", email="sarah.j@corp.com", username="sjohnson", department="Executive", role="user", risk_level="low"),
    Row(id="usr-007", display_name="Alex Petrov", email="alex.p@corp.com", username="apetrov", department="R&D", role="developer", risk_level="medium"),
    Row(id="usr-008", display_name="Liu Wei", email="liu.wei@corp.com", username="lwei", department="Engineering", role="developer", risk_level="low"),
    Row(id="usr-009", display_name="Maria Gonzalez", email="maria.g@corp.com", username="mgonzalez", department="Legal", role="user", risk_level="low"),
    Row(id="usr-010", display_name="James Morton", email="james.m@corp.com", username="jmorton", department="IT Ops", role="admin", risk_level="high"),
]

spark.createDataFrame(users).withColumn("created_at", current_timestamp()).withColumn("last_login", current_timestamp()).write.mode("overwrite").saveAsTable("user_profiles")
print(f"Seeded {len(users)} user profiles")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Security Events

# COMMAND ----------

event_types = ["authentication_failure", "authentication_success", "process_creation",
               "file_modification", "network_connection", "dns_query", "privilege_escalation",
               "lateral_movement", "data_exfiltration", "registry_modification"]
severities = ["info", "low", "medium", "high", "critical"]
sources = ["endpoint_agent", "firewall", "ids_sensor", "email_gateway", "cloud_trail", "siem_collector"]
ips = [f"10.0.{random.randint(1,254)}.{random.randint(1,254)}" for _ in range(50)]
ext_ips = [f"185.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}" for _ in range(20)]

events_data = []
for i in range(500):
    events_data.append(Row(
        event_type=random.choice(event_types),
        source=random.choice(sources),
        source_ip=random.choice(ips),
        dest_ip=random.choice(ext_ips + ips),
        user_id=random.choice([u.id for u in users]),
        username=random.choice([u.username for u in users]),
        action=random.choice(["allow", "deny", "block", "monitor", "alert"]),
        outcome=random.choice(["success", "failure", "unknown"]),
        severity=random.choices(severities, weights=[30, 25, 20, 15, 10])[0],
        raw_log=f"event_{i}: simulated security event for demo purposes"
    ))

events_df = spark.createDataFrame(events_data)
events_df = (events_df
    .withColumn("id", expr("uuid()"))
    .withColumn("timestamp", current_timestamp() - expr(f"INTERVAL {random.randint(0, 86400)} SECONDS"))
    .withColumn("ingested_at", current_timestamp())
)
events_df.write.mode("overwrite").saveAsTable("events")
print(f"Seeded {len(events_data)} security events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Alerts

# COMMAND ----------

alert_titles = [
    "Brute Force: Multiple Failed Logins from 185.x.x.x",
    "Lateral Movement: RDP from Engineering to Finance Subnet",
    "Data Exfiltration: Large Upload to External S3",
    "Privilege Escalation: Service Account Elevated",
    "Malware Detected: Emotet Variant on Endpoint",
    "Credential Stuffing: 200+ Login Attempts",
    "DNS Tunneling: High Entropy Subdomain Queries",
    "Insider Threat: Off-Hours Access to Sensitive Data",
    "Supply Chain: Unexpected Package in CI/CD Pipeline",
    "C2 Beacon: Periodic HTTPS Callbacks to Known Bad IP",
    "Ransomware Precursor: Vssadmin Shadow Delete",
    "Phishing: Credential Harvest Page Accessed",
    "Cloud Posture: S3 Bucket Made Public",
    "Zero-Day Exploit: CVE-2024-XXXX Attempted",
    "Account Takeover: Password Reset from New Location",
]

alerts_data = []
for i, title in enumerate(alert_titles):
    alerts_data.append(Row(
        title=title,
        description=f"Automated detection: {title}. Correlation confidence high. Investigate immediately.",
        severity=random.choice(["medium", "high", "critical"]),
        status=random.choice(["new", "in_progress", "closed"]),
        source=random.choice(["correlation_engine", "threat_intel_matching", "behavioral_anomaly", "temporal_correlator"]),
        rule_name=f"rule_{i:03d}",
        mitre_tactic=random.choice(["TA0001", "TA0003", "TA0004", "TA0005", "TA0008", "TA0010", "TA0040"]),
        mitre_technique=random.choice(["T1110", "T1021", "T1048", "T1078", "T1566", "T1071", "T1486"]),
        confidence_score=round(random.uniform(0.6, 0.99), 2),
        risk_score=random.randint(30, 100),
        false_positive=random.choice([False, False, False, True]),
    ))

alerts_df = spark.createDataFrame(alerts_data)
alerts_df = (alerts_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp() - expr(f"INTERVAL {random.randint(0, 172800)} SECONDS"))
    .withColumn("first_seen", col("created_at"))
    .withColumn("last_seen", current_timestamp())
)
alerts_df.write.mode("overwrite").saveAsTable("alerts")
print(f"Seeded {len(alerts_data)} alerts")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cases

# COMMAND ----------

cases_data = [
    Row(title="Critical: Multi-Stage APT Campaign", description="Coordinated attack spanning 3 days with lateral movement across 5 subnets.", status="open", priority="critical", severity="critical", case_type="incident"),
    Row(title="Insider Threat: Data Exfiltration by David Kim", description="Anomalous data transfers to personal cloud storage. HR notified.", status="in_progress", priority="high", severity="high", case_type="insider_threat"),
    Row(title="Ransomware Attempt: Blocked at Endpoint", description="Emotet dropper blocked by EDR. Investigating lateral spread.", status="in_progress", priority="high", severity="high", case_type="malware"),
    Row(title="Phishing Campaign Targeting Finance", description="12 users received credential harvest emails. 2 clicked. Passwords reset.", status="closed", priority="medium", severity="medium", case_type="phishing"),
    Row(title="Cloud Misconfiguration: Public S3 Bucket", description="Customer data temporarily exposed. Bucket secured within 15 minutes.", status="closed", priority="high", severity="high", case_type="misconfiguration"),
]

cases_df = spark.createDataFrame(cases_data)
cases_df = (cases_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp() - expr("INTERVAL 72 HOURS"))
    .withColumn("updated_at", current_timestamp())
)
cases_df.write.mode("overwrite").saveAsTable("cases")
print(f"Seeded {len(cases_data)} cases")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Correlation Rules

# COMMAND ----------

rules_data = [
    # -- Initial Access (TA0001) --
    Row(name="Brute Force Detection", rule_type="threshold", severity="high", enabled=True, window_seconds=300, threshold=10, mitre_tactic="TA0001", mitre_technique="T1110", confidence_score=0.9, conditions=["authentication_failure"], tags=["credential"], data_sources=["auth_logs"]),
    Row(name="Credential Stuffing", rule_type="threshold", severity="critical", enabled=True, window_seconds=600, threshold=20, mitre_tactic="TA0001", mitre_technique="T1110.004", confidence_score=0.85, conditions=["authentication_failure"], tags=["credential", "automated"], data_sources=["auth_logs"]),
    Row(name="Password Spraying", rule_type="statistical", severity="high", enabled=True, window_seconds=900, threshold=5, mitre_tactic="TA0001", mitre_technique="T1110.003", confidence_score=0.8, conditions=["authentication_failure"], tags=["credential"], data_sources=["auth_logs"]),
    Row(name="Supply Chain Compromise", rule_type="sequence", severity="critical", enabled=True, window_seconds=86400, threshold=2, mitre_tactic="TA0001", mitre_technique="T1195", confidence_score=0.6, conditions=["software_install", "outbound_connection"], tags=["supply_chain"], data_sources=["endpoint"]),
    Row(name="Phishing Link Click", rule_type="threshold", severity="high", enabled=True, window_seconds=300, threshold=3, mitre_tactic="TA0001", mitre_technique="T1566.002", confidence_score=0.75, conditions=["url_click", "email_link"], tags=["phishing"], data_sources=["email", "proxy"]),
    Row(name="Valid Account Login from New Country", rule_type="temporal", severity="high", enabled=True, window_seconds=3600, threshold=1, mitre_tactic="TA0001", mitre_technique="T1078", confidence_score=0.7, conditions=["authentication_success"], tags=["geo_anomaly"], data_sources=["auth_logs"]),

    # -- Execution (TA0002) --
    Row(name="PowerShell Encoded Command", rule_type="threshold", severity="high", enabled=True, window_seconds=300, threshold=3, mitre_tactic="TA0002", mitre_technique="T1059.001", confidence_score=0.85, conditions=["process_creation", "script_execution"], tags=["powershell"], data_sources=["endpoint"]),
    Row(name="WMI Remote Execution", rule_type="threshold", severity="medium", enabled=True, window_seconds=600, threshold=5, mitre_tactic="TA0002", mitre_technique="T1047", confidence_score=0.7, conditions=["process_creation"], tags=["wmi", "remote"], data_sources=["endpoint"]),
    Row(name="Scheduled Task Creation", rule_type="threshold", severity="medium", enabled=True, window_seconds=3600, threshold=3, mitre_tactic="TA0002", mitre_technique="T1053.005", confidence_score=0.65, conditions=["scheduled_task_creation"], tags=["persistence"], data_sources=["endpoint"]),

    # -- Persistence (TA0003) --
    Row(name="Off-Hours Admin Activity", rule_type="temporal", severity="medium", enabled=True, window_seconds=3600, threshold=3, mitre_tactic="TA0003", mitre_technique="T1078", confidence_score=0.65, conditions=["admin_login"], tags=["temporal"], data_sources=["auth_logs"]),
    Row(name="Registry Run Key Modification", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=2, mitre_tactic="TA0003", mitre_technique="T1547.001", confidence_score=0.8, conditions=["registry_modification"], tags=["persistence", "autorun"], data_sources=["endpoint"]),
    Row(name="New Service Creation", rule_type="threshold", severity="medium", enabled=True, window_seconds=1800, threshold=3, mitre_tactic="TA0003", mitre_technique="T1543.003", confidence_score=0.7, conditions=["service_creation"], tags=["persistence"], data_sources=["endpoint"]),

    # -- Privilege Escalation (TA0004) --
    Row(name="Privilege Escalation Sequence", rule_type="sequence", severity="critical", enabled=True, window_seconds=600, threshold=2, mitre_tactic="TA0004", mitre_technique="T1068", confidence_score=0.85, conditions=["privilege_escalation", "token_manipulation"], tags=["privesc"], data_sources=["endpoint"]),
    Row(name="Token Impersonation", rule_type="threshold", severity="high", enabled=True, window_seconds=300, threshold=2, mitre_tactic="TA0004", mitre_technique="T1134.001", confidence_score=0.8, conditions=["token_manipulation"], tags=["privesc"], data_sources=["endpoint"]),
    Row(name="Sudo Abuse Pattern", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=5, mitre_tactic="TA0004", mitre_technique="T1548.003", confidence_score=0.75, conditions=["privilege_escalation"], tags=["linux", "privesc"], data_sources=["endpoint"]),

    # -- Defense Evasion (TA0005) --
    Row(name="Log Clearing Detected", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=1, mitre_tactic="TA0005", mitre_technique="T1070.001", confidence_score=0.95, conditions=["log_clear", "audit_log_clear"], tags=["evasion"], data_sources=["endpoint", "siem"]),
    Row(name="Timestomp Activity", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=3, mitre_tactic="TA0005", mitre_technique="T1070.006", confidence_score=0.8, conditions=["file_modification"], tags=["evasion", "timestomp"], data_sources=["endpoint"]),
    Row(name="Process Injection", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=2, mitre_tactic="TA0005", mitre_technique="T1055", confidence_score=0.9, conditions=["process_injection"], tags=["evasion", "injection"], data_sources=["endpoint"]),

    # -- Credential Access (TA0006) --
    Row(name="LSASS Memory Dump", rule_type="threshold", severity="critical", enabled=True, window_seconds=60, threshold=1, mitre_tactic="TA0006", mitre_technique="T1003.001", confidence_score=0.95, conditions=["process_access", "credential_access"], tags=["credential_dump"], data_sources=["endpoint"]),
    Row(name="Kerberoasting Activity", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=5, mitre_tactic="TA0006", mitre_technique="T1558.003", confidence_score=0.85, conditions=["kerberos_ticket_request"], tags=["kerberos"], data_sources=["auth_logs"]),
    Row(name="DCSync Attack", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=1, mitre_tactic="TA0006", mitre_technique="T1003.006", confidence_score=0.95, conditions=["directory_service_access"], tags=["ad", "credential_dump"], data_sources=["auth_logs"]),

    # -- Discovery (TA0007) --
    Row(name="Port Scanning Detection", rule_type="threshold", severity="medium", enabled=True, window_seconds=300, threshold=20, mitre_tactic="TA0007", mitre_technique="T1046", confidence_score=0.9, conditions=["network_connection"], tags=["recon", "scanning"], data_sources=["network"]),
    Row(name="Active Directory Enumeration", rule_type="threshold", severity="medium", enabled=True, window_seconds=600, threshold=10, mitre_tactic="TA0007", mitre_technique="T1087.002", confidence_score=0.7, conditions=["directory_service_access"], tags=["recon", "ad"], data_sources=["auth_logs"]),
    Row(name="Network Share Discovery", rule_type="threshold", severity="low", enabled=True, window_seconds=900, threshold=15, mitre_tactic="TA0007", mitre_technique="T1135", confidence_score=0.6, conditions=["network_share_access"], tags=["recon"], data_sources=["network"]),

    # -- Lateral Movement (TA0008) --
    Row(name="Lateral Movement Chain", rule_type="sequence", severity="critical", enabled=True, window_seconds=1800, threshold=3, mitre_tactic="TA0008", mitre_technique="T1021", confidence_score=0.8, conditions=["lateral_movement", "remote_login", "remote_execution"], tags=["lateral"], data_sources=["auth_logs", "endpoint"]),
    Row(name="Pass-the-Hash", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=2, mitre_tactic="TA0008", mitre_technique="T1550.002", confidence_score=0.85, conditions=["authentication_success"], tags=["pth", "lateral"], data_sources=["auth_logs"]),
    Row(name="RDP Tunneling", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=3, mitre_tactic="TA0008", mitre_technique="T1021.001", confidence_score=0.75, conditions=["remote_login", "tunnel_creation"], tags=["rdp", "lateral"], data_sources=["network"]),

    # -- Collection (TA0009) --
    Row(name="Mass File Access", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=50, mitre_tactic="TA0009", mitre_technique="T1005", confidence_score=0.7, conditions=["file_access"], tags=["collection"], data_sources=["endpoint"]),
    Row(name="Email Collection", rule_type="threshold", severity="medium", enabled=True, window_seconds=3600, threshold=100, mitre_tactic="TA0009", mitre_technique="T1114", confidence_score=0.65, conditions=["email_access"], tags=["collection", "email"], data_sources=["email"]),

    # -- Exfiltration (TA0010) --
    Row(name="Data Exfiltration Volume", rule_type="threshold", severity="high", enabled=True, window_seconds=3600, threshold=5, mitre_tactic="TA0010", mitre_technique="T1048", confidence_score=0.75, conditions=["data_exfiltration", "large_upload"], tags=["exfiltration"], data_sources=["network", "dlp"]),
    Row(name="DNS Tunneling", rule_type="statistical", severity="high", enabled=True, window_seconds=900, threshold=100, mitre_tactic="TA0010", mitre_technique="T1071.004", confidence_score=0.7, conditions=["dns_query"], tags=["exfiltration", "dns"], data_sources=["dns"]),
    Row(name="Cloud Storage Exfiltration", rule_type="threshold", severity="high", enabled=True, window_seconds=1800, threshold=10, mitre_tactic="TA0010", mitre_technique="T1537", confidence_score=0.75, conditions=["cloud_upload", "data_transfer"], tags=["exfiltration", "cloud"], data_sources=["cloud"]),

    # -- Command & Control (TA0011) --
    Row(name="C2 Beacon Pattern", rule_type="periodic", severity="critical", enabled=True, window_seconds=7200, threshold=10, mitre_tactic="TA0011", mitre_technique="T1071.001", confidence_score=0.8, conditions=["outbound_connection", "command_and_control"], tags=["c2", "beaconing"], data_sources=["network"]),
    Row(name="Domain Generation Algorithm", rule_type="statistical", severity="high", enabled=True, window_seconds=600, threshold=50, mitre_tactic="TA0011", mitre_technique="T1568.002", confidence_score=0.85, conditions=["dns_query"], tags=["c2", "dga"], data_sources=["dns"]),
    Row(name="Non-Standard Port Communication", rule_type="threshold", severity="medium", enabled=True, window_seconds=3600, threshold=10, mitre_tactic="TA0011", mitre_technique="T1571", confidence_score=0.6, conditions=["network_connection"], tags=["c2"], data_sources=["network"]),

    # -- Impact (TA0040) --
    Row(name="Mass File Encryption (Ransomware)", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=20, mitre_tactic="TA0040", mitre_technique="T1486", confidence_score=0.95, conditions=["file_modification", "file_encryption"], tags=["ransomware"], data_sources=["endpoint"]),
    Row(name="Service Disruption", rule_type="threshold", severity="critical", enabled=True, window_seconds=600, threshold=5, mitre_tactic="TA0040", mitre_technique="T1489", confidence_score=0.85, conditions=["service_stop"], tags=["disruption"], data_sources=["endpoint"]),
    Row(name="Data Destruction", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=10, mitre_tactic="TA0040", mitre_technique="T1485", confidence_score=0.9, conditions=["file_deletion"], tags=["destruction"], data_sources=["endpoint"]),

    # -- Insider Threat --
    Row(name="After-Hours Data Access Spike", rule_type="temporal", severity="high", enabled=True, window_seconds=7200, threshold=20, mitre_tactic="TA0009", mitre_technique="T1005", confidence_score=0.7, conditions=["file_access"], tags=["insider", "temporal"], data_sources=["endpoint", "dlp"]),
    Row(name="Unusual Download Volume", rule_type="statistical", severity="high", enabled=True, window_seconds=3600, threshold=100, mitre_tactic="TA0010", mitre_technique="T1048", confidence_score=0.7, conditions=["file_download"], tags=["insider", "exfiltration"], data_sources=["proxy", "dlp"]),
    Row(name="Privilege Hoarding", rule_type="threshold", severity="medium", enabled=True, window_seconds=86400, threshold=5, mitre_tactic="TA0004", mitre_technique="T1078", confidence_score=0.6, conditions=["permission_change", "role_assignment"], tags=["insider"], data_sources=["iam"]),

    # -- Cloud-Specific --
    Row(name="Impossible Travel Login", rule_type="temporal", severity="high", enabled=True, window_seconds=3600, threshold=2, mitre_tactic="TA0001", mitre_technique="T1078.004", confidence_score=0.8, conditions=["authentication_success"], tags=["cloud", "geo_anomaly"], data_sources=["cloud_auth"]),
    Row(name="IAM Policy Weakening", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=1, mitre_tactic="TA0005", mitre_technique="T1562.007", confidence_score=0.9, conditions=["policy_change"], tags=["cloud", "iam"], data_sources=["cloud"]),
    Row(name="Snapshot Exfiltration", rule_type="threshold", severity="critical", enabled=True, window_seconds=1800, threshold=2, mitre_tactic="TA0010", mitre_technique="T1537", confidence_score=0.85, conditions=["snapshot_copy", "ami_share"], tags=["cloud", "exfiltration"], data_sources=["cloud"]),
    Row(name="Security Group Rule Change", rule_type="threshold", severity="high", enabled=True, window_seconds=600, threshold=3, mitre_tactic="TA0005", mitre_technique="T1562.007", confidence_score=0.75, conditions=["firewall_rule_change"], tags=["cloud", "network"], data_sources=["cloud"]),

    # -- Multi-Stage Attack Chains --
    Row(name="Full Kill Chain Progression", rule_type="sequence", severity="critical", enabled=True, window_seconds=7200, threshold=4, mitre_tactic="TA0001,TA0004,TA0008,TA0010", mitre_technique="T1078,T1068,T1021,T1048", confidence_score=0.95, conditions=["authentication_failure", "privilege_escalation", "lateral_movement", "data_exfiltration"], tags=["apt", "kill_chain"], data_sources=["endpoint", "network", "auth_logs"]),
    Row(name="Ransomware Precursor Chain", rule_type="sequence", severity="critical", enabled=True, window_seconds=3600, threshold=3, mitre_tactic="TA0001,TA0006,TA0040", mitre_technique="T1110,T1003,T1486", confidence_score=0.9, conditions=["credential_access", "lateral_movement", "file_encryption"], tags=["ransomware", "kill_chain"], data_sources=["endpoint"]),
    Row(name="APT Reconnaissance to Exfil", rule_type="sequence", severity="critical", enabled=True, window_seconds=86400, threshold=3, mitre_tactic="TA0007,TA0009,TA0010", mitre_technique="T1046,T1005,T1048", confidence_score=0.7, conditions=["network_scan", "file_access", "data_exfiltration"], tags=["apt", "kill_chain"], data_sources=["network", "endpoint"]),

    # -- OT/ICS Specific --
    Row(name="PLC Stop Command", rule_type="threshold", severity="critical", enabled=True, window_seconds=60, threshold=1, mitre_tactic="TA0040", mitre_technique="T0816", confidence_score=0.95, conditions=["plc_stop", "remote_stop"], tags=["ot", "ics"], data_sources=["ot_network"]),
    Row(name="Setpoint Manipulation", rule_type="threshold", severity="critical", enabled=True, window_seconds=300, threshold=3, mitre_tactic="TA0040", mitre_technique="T0836", confidence_score=0.9, conditions=["setpoint_change", "write_register"], tags=["ot", "ics"], data_sources=["ot_network"]),
    Row(name="Engineering Station Anomaly", rule_type="temporal", severity="high", enabled=True, window_seconds=3600, threshold=1, mitre_tactic="TA0001", mitre_technique="T0886", confidence_score=0.8, conditions=["engineering_access"], tags=["ot", "ics"], data_sources=["ot_network"]),
]

from pyspark.sql.types import StructType, StructField, StringType, BooleanType, IntegerType, DoubleType, ArrayType

rules_schema = StructType([
    StructField("name", StringType()),
    StructField("rule_type", StringType()),
    StructField("severity", StringType()),
    StructField("enabled", BooleanType()),
    StructField("window_seconds", IntegerType()),
    StructField("threshold", IntegerType()),
    StructField("mitre_tactic", StringType()),
    StructField("mitre_technique", StringType()),
    StructField("confidence_score", DoubleType()),
    StructField("conditions", ArrayType(StringType())),
    StructField("tags", ArrayType(StringType())),
    StructField("data_sources", ArrayType(StringType())),
])

rules_rows = []
for r in rules_data:
    rules_rows.append((
        r.name, r.rule_type, r.severity, r.enabled,
        r.window_seconds, r.threshold, r.mitre_tactic, r.mitre_technique,
        r.confidence_score, r.conditions, r.tags, r.data_sources,
    ))

rules_df = spark.createDataFrame(rules_rows, schema=rules_schema)
rules_df = (rules_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp())
    .withColumn("updated_at", current_timestamp())
    .withColumn("version", lit(1))
    .withColumn("author", lit("0xDSI Platform"))
    .withColumn("description", concat(lit("Auto-generated rule: "), col("name")))
    .withColumn("logic", lit("{}"))
)
rules_df.write.mode("overwrite").saveAsTable(get_table_path(cfg, "correlation_rules"))
print(f"Seeded {len(rules_data)} production correlation rules ({len([r for r in rules_data if r.rule_type == 'threshold'])} threshold, {len([r for r in rules_data if r.rule_type == 'sequence'])} sequence, {len([r for r in rules_data if r.rule_type in ('statistical', 'temporal', 'periodic')])} temporal/statistical)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threat Intelligence

# COMMAND ----------

feeds_data = [
    Row(name="AlienVault OTX", feed_type="osint", format="stix", enabled=True, ioc_count=15000, confidence=0.7),
    Row(name="Abuse.ch URLhaus", feed_type="osint", format="csv", enabled=True, ioc_count=8500, confidence=0.8),
    Row(name="MISP Community", feed_type="community", format="misp", enabled=True, ioc_count=25000, confidence=0.75),
    Row(name="VirusTotal", feed_type="commercial", format="json", enabled=True, ioc_count=50000, confidence=0.9),
    Row(name="CrowdStrike Falcon", feed_type="commercial", format="stix", enabled=True, ioc_count=100000, confidence=0.95),
]

feeds_df = spark.createDataFrame(feeds_data)
feeds_df = (feeds_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp())
    .withColumn("last_fetch", current_timestamp())
)
feeds_df.write.mode("overwrite").saveAsTable("threat_feeds")

iocs_data = []
for i in range(100):
    iocs_data.append(Row(
        indicator_type=random.choice(["ip", "domain", "sha256", "url"]),
        value=random.choice(ext_ips) if random.random() > 0.5 else f"malware-{i}.evil.com",
        threat_type=random.choice(["malware", "c2", "phishing", "scanner", "botnet"]),
        confidence=round(random.uniform(0.5, 0.99), 2),
        source=random.choice(["AlienVault OTX", "Abuse.ch", "VirusTotal"]),
    ))

iocs_df = spark.createDataFrame(iocs_data)
iocs_df = (iocs_df
    .withColumn("id", expr("uuid()"))
    .withColumn("first_seen", current_timestamp() - expr("INTERVAL 30 DAYS"))
    .withColumn("last_seen", current_timestamp())
)
iocs_df.write.mode("overwrite").saveAsTable("ioc_entries")
print(f"Seeded {len(feeds_data)} threat feeds, {len(iocs_data)} IOCs")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent Configurations

# COMMAND ----------

agents_data = [
    Row(name="Triage Agent", agent_type="llm_agent", description="L1 alert classification using Foundation Models", enabled=True),
    Row(name="Enrichment Agent", agent_type="llm_agent", description="Context gathering and MITRE mapping", enabled=True),
    Row(name="Threat Hunter", agent_type="llm_agent", description="Proactive hypothesis-driven hunting", enabled=True),
    Row(name="Correlation Engine", agent_type="streaming", description="Real-time CEP with sliding windows", enabled=True),
    Row(name="Negative Correlator", agent_type="scheduled", description="Detects absence of expected events", enabled=True),
    Row(name="Graph Correlator", agent_type="batch", description="Multi-hop lateral movement detection", enabled=True),
    Row(name="Temporal Correlator", agent_type="streaming", description="Brute force, beacon, scan detection", enabled=True),
    Row(name="Behavioral ML", agent_type="ml", description="User anomaly detection via clustering", enabled=True),
    Row(name="TI Matcher", agent_type="streaming", description="IOC matching against event stream", enabled=True),
    Row(name="Auto Responder", agent_type="scheduled", description="Automated response with approval flow", enabled=True),
    Row(name="Case Manager", agent_type="scheduled", description="Alert grouping into cases", enabled=True),
    Row(name="Feature Engineer", agent_type="batch", description="ML feature computation pipeline", enabled=True),
    Row(name="Model Trainer", agent_type="batch", description="Weekly threat scoring model retraining", enabled=True),
    Row(name="Orchestrator", agent_type="coordinator", description="Multi-agent pipeline coordination", enabled=True),
    Row(name="Schema Enforcer", agent_type="scheduled", description="OCSF normalization engine", enabled=True),
    Row(name="Quarantine Handler", agent_type="scheduled", description="Bad data recovery and quality reporting", enabled=True),
]

agents_df = spark.createDataFrame(agents_data)
agents_df = (agents_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp())
    .withColumn("updated_at", current_timestamp())
)
agents_df.write.mode("overwrite").saveAsTable("agent_configs")

# Agent status
status_data = []
for agent in agents_data:
    status_data.append(Row(
        agent_id="placeholder",
        status=random.choice(["running", "idle", "idle", "idle"]),
        events_processed=random.randint(1000, 500000),
        alerts_generated=random.randint(0, 200),
        errors=random.randint(0, 5)
    ))

status_df = spark.createDataFrame(status_data)
status_df = (status_df
    .withColumn("id", expr("uuid()"))
    .withColumn("last_heartbeat", current_timestamp() - expr(f"INTERVAL {random.randint(0, 300)} SECONDS"))
    .withColumn("updated_at", current_timestamp())
)
status_df.write.mode("overwrite").saveAsTable("agent_status")
print(f"Seeded {len(agents_data)} agent configurations")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Negative Correlation Rules

# COMMAND ----------

neg_rules = [
    Row(name="Missing EDR Heartbeat", expected_event_type="edr_heartbeat", absence_window_seconds=600, severity="high", enabled=True),
    Row(name="Missing Backup Confirmation", expected_event_type="backup_complete", absence_window_seconds=86400, severity="medium", enabled=True),
    Row(name="Missing Auth Token Refresh", expected_event_type="token_refresh", absence_window_seconds=3600, severity="medium", enabled=True),
    Row(name="Missing Vulnerability Scan", expected_event_type="vulnerability_scan_complete", absence_window_seconds=604800, severity="low", enabled=True),
]

neg_df = spark.createDataFrame(neg_rules)
neg_df = neg_df.withColumn("id", expr("uuid()")).withColumn("created_at", current_timestamp())
neg_df.write.mode("overwrite").saveAsTable("negative_correlation_rules")
print(f"Seeded {len(neg_rules)} negative correlation rules")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Asset Registry

# COMMAND ----------

assets_data = []
for i in range(30):
    assets_data.append(Row(
        hostname=f"{'srv' if i < 10 else 'ws'}-{i:03d}.corp.local",
        ip_address=f"10.0.{i // 10 + 1}.{i % 254 + 1}",
        asset_type=random.choice(["server", "workstation", "network_device", "cloud_instance"]),
        os=random.choice(["Windows Server 2022", "Ubuntu 22.04", "RHEL 9", "Windows 11", "macOS 14"]),
        criticality=random.choice(["low", "medium", "high", "critical"]),
        owner=random.choice([u.display_name for u in users]),
        department=random.choice(["Engineering", "Finance", "IT Ops", "Security", "HR"]),
        location=random.choice(["US-East", "US-West", "EU-West", "APAC", "Brazil"]),
    ))

assets_df = spark.createDataFrame(assets_data)
assets_df = (assets_df
    .withColumn("id", expr("uuid()"))
    .withColumn("created_at", current_timestamp())
    .withColumn("last_scan", current_timestamp() - expr("INTERVAL 7 DAYS"))
)
assets_df.write.mode("overwrite").saveAsTable("asset_registry")
print(f"Seeded {len(assets_data)} assets")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

print("\n" + "="*60)
print("  DEMO DATA SEEDED SUCCESSFULLY")
print("="*60)
tables_with_data = [
    "user_profiles", "events", "alerts", "cases",
    "correlation_rules", "threat_feeds", "ioc_entries",
    "agent_configs", "agent_status", "negative_correlation_rules",
    "asset_registry"
]
for t in tables_with_data:
    count = spark.table(t).count()
    print(f"  {t}: {count} rows")
print("="*60)
