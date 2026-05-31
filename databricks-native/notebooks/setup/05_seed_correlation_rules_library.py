# Databricks notebook source
# MAGIC %md
# MAGIC # Seed: Full Correlation Rules Library (50,000 Rules)
# MAGIC
# MAGIC Generates the complete correlation rules library for Unity Catalog,
# MAGIC mirroring the Supabase `correlation_rules_library` table.
# MAGIC
# MAGIC Covers 30 threat categories, 150+ subcategories, all MITRE ATT&CK tactics,
# MAGIC 60 techniques, 10 data source combinations, severity distribution, and
# MAGIC pseudo-code rule logic in JSONB.
# MAGIC
# MAGIC **Run after:** `01_create_catalog_schema.py`

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import random
import json
from datetime import datetime, timedelta, timezone
from pyspark.sql import Row
from pyspark.sql.types import (
    StructType, StructField, StringType, BooleanType,
    IntegerType, DoubleType, ArrayType, LongType
)
from pyspark.sql.functions import expr, current_timestamp, lit, col

# COMMAND ----------

# MAGIC %md
# MAGIC ## Reference Arrays (same as Supabase migration)

# COMMAND ----------

CATEGORIES = [
    "APT & State-Sponsored", "Ransomware", "Insider Threat", "Data Exfiltration",
    "Credential Attacks", "Lateral Movement", "Command & Control", "Privilege Escalation",
    "Defense Evasion", "Initial Access", "Persistence", "Discovery & Recon",
    "Cloud Security", "Container Security", "Supply Chain", "Zero-Day Exploits",
    "Phishing & Social Eng", "Malware Analysis", "Network Anomaly", "Identity & Access",
    "Compliance Violations", "OT/ICS/SCADA", "IoT Security", "Mobile Threats",
    "DNS Security", "Email Security", "Web Application", "Database Security",
    "Cryptojacking", "DDoS Protection",
]

SUBCATEGORIES = [
    "Cozy Bear", "Fancy Bear", "Lazarus Group", "Volt Typhoon", "APT33", "APT41",
    "Sandworm", "Turla", "Charming Kitten", "Kimsuky", "Pre-Encryption",
    "Double Extortion", "RaaS Ops", "Wiper Disguised", "Backup Destroy",
    "Shadow Copy Del", "Privilege Abuse", "Data Hoarding", "Unauth Access",
    "Anomalous Hours", "Chunked Transfer", "DNS Tunnel", "Steganography",
    "Cloud Storage", "Encrypted Chan", "Brute Force", "Pass Spraying",
    "Cred Stuffing", "Kerberoasting", "AS-REP Roast", "SMB Movement",
    "WMI Exec", "PSRemoting", "RDP Hopping", "SSH Tunnel", "HTTP Beacon",
    "DNS C2", "HTTPS C2", "Domain Front", "Fast Flux", "Token Manip",
    "UAC Bypass", "Sudo Abuse", "DLL Hijack", "Proc Injection", "Timestomping",
    "Log Tamper", "Proc Hollowing", "DLL Sideload", "AMSI Bypass",
    "Spearphish Link", "Drive-By", "Exploit App", "Watering Hole", "Valid Accounts",
    "Reg Run Keys", "Startup Folder", "Sched Tasks", "WMI Subscribe", "Cron Jobs",
    "Net Scanning", "Svc Enum", "AD Enum", "Cloud Disc", "SNMP Walk",
    "IAM Abuse", "S3 Exposure", "Lambda Hijack", "Cross-Account", "K8s RBAC",
    "Image Tamper", "Priv Container", "Pod Escape", "Miner Pod", "Sidecar Inject",
    "Dep Confusion", "Typosquat", "Compromised Pkg", "Build Pipeline", "CICD Takeover",
    "Mem Corrupt", "Logic Bug", "Race Condition", "Use-After-Free", "Buffer Overflow",
    "Cred Harvest", "BEC Attempt", "Spear Phish", "QR Phish", "Consent Phish",
    "Polymorphic", "Fileless", "Macro Analysis", "Shellcode", "RAT Activity",
    "Beacon Pattern", "Proto Anomaly", "Traffic Spike", "Enc Anomaly", "TLS Fingerprint",
    "Impossible Travel", "MFA Bypass", "Token Theft", "Session Hijack", "OAuth Abuse",
    "GDPR Violation", "PCI Breach", "HIPAA Violation", "SOX Fail", "NIST Gap",
    "PLC Manip", "HMI Tamper", "Modbus Anomaly", "OPCUA Exploit", "FW Implant",
    "Device Spoof", "MQTT Abuse", "Zigbee Sniff", "BLE Exploit", "Camera Hijack",
    "Mobile RAT", "Sideload App", "MDM Bypass", "SIM Swap", "Screen Overlay",
    "DGA Detect", "DNS Rebind", "Cache Poison", "Subdomain Take", "NXDOMAIN Spike",
    "Header Inject", "AutoFwd Rule", "Inbox Abuse", "DMARC Fail", "Enc Payload",
    "SQLi Detect", "XSS Attempt", "SSRF Attack", "Path Traversal", "API Abuse",
    "Query Inject", "Schema Exfil", "Backup Theft", "StoredProc", "Audit Tamper",
    "CPU Spike", "Miner Binary", "Stratum Proto", "Browser Mine", "Pool Connect",
    "Volume Attack", "SYN Flood", "Slowloris", "Reflect Attack", "Carpet Bomb",
]

TACTICS_SETS = [
    ["Initial Access", "Execution", "Persistence"],
    ["Impact", "Defense Evasion", "Execution"],
    ["Collection", "Exfiltration", "Credential Access"],
    ["Exfiltration", "Command and Control", "Collection"],
    ["Credential Access", "Lateral Movement", "Initial Access"],
    ["Lateral Movement", "Execution", "Discovery"],
    ["Command and Control", "Defense Evasion", "Exfiltration"],
    ["Privilege Escalation", "Execution", "Persistence"],
    ["Defense Evasion", "Persistence", "Execution"],
    ["Initial Access", "Execution", "Collection"],
]

TECHNIQUES = [
    "T1195", "T1199", "T1078", "T1190", "T1566", "T1486", "T1490", "T1489",
    "T1074", "T1048", "T1110", "T1558", "T1021", "T1570", "T1071", "T1095",
    "T1068", "T1548", "T1134", "T1055", "T1070", "T1036", "T1027", "T1547",
    "T1053", "T1046", "T1018", "T1082", "T1537", "T1535", "T1610", "T1611",
    "T1609", "T1072", "T1203", "T1211", "T1598", "T1204", "T1059", "T1562",
    "T1564", "T1136", "T1098", "T1016", "T1033", "T1528", "T1552", "T1613",
    "T1556", "T1539", "T1550", "T1567", "T1041", "T1052", "T1080", "T1573",
    "T1572", "T1090", "T1546", "T1561",
]

DATA_SOURCES_SETS = [
    ["EDR Telemetry", "Network Flow", "DNS Logs", "Auth Logs"],
    ["File Integrity", "Process Monitor", "Registry", "Sysmon"],
    ["DLP Logs", "UEBA", "Badge Access", "HR Systems"],
    ["Proxy Logs", "NetFlow", "Firewall", "TLS Inspection"],
    ["Active Directory", "Kerberos", "LDAP", "Windows Events"],
    ["CloudTrail", "Azure Monitor", "GCP Audit", "IAM Logs"],
    ["K8s Audit", "Container Runtime", "Image Registry", "Pod Logs"],
    ["WAF Logs", "App Logs", "API Gateway", "CDN Logs"],
    ["Email Gateway", "O365 Audit", "DMARC Reports", "SMTP Logs"],
    ["OT Monitor", "Historian", "PLC Diagnostics", "HMI Logs"],
]

TAGS = [
    "nation-state", "apt", "espionage", "ransomware", "extortion", "insider",
    "behavioral", "exfiltration", "dlp", "credentials", "kerberos", "lateral",
    "c2", "beaconing", "privesc", "evasion", "fileless", "persistence", "recon",
    "cloud", "aws", "azure", "gcp", "container", "k8s", "supply-chain",
    "zero-day", "phishing", "social-eng", "malware", "trojan", "network",
    "anomaly", "identity", "sso", "mfa", "compliance", "gdpr", "pci", "ot",
    "ics", "scada", "iot", "mobile", "dns", "email", "webapp", "sqli", "xss",
    "database", "cryptomining", "ddos", "botnet", "wiper", "apt29", "apt41",
    "lazarus", "volt-typhoon",
]

SEVERITIES = ["critical", "high", "medium", "low"]
AUTHORS = [
    "Threat Intel Team", "SOC Automation", "Detection Engineering", "Red Team",
    "CISO Office", "ML Pipeline", "Community", "Incident Response",
    "Forensics Team", "Purple Team",
]
PREFIXES = [
    "Detect", "Identify", "Correlate", "Monitor", "Alert on",
    "Track", "Analyze", "Flag", "Intercept", "Investigate",
]
VERBS = [
    "multi-stage intrusion chain", "campaign across hosts",
    "TTPs with credential harvest", "activity with enumeration",
    "pattern with staging", "behavioral baseline deviation",
    "chunked exfiltration", "entropy timing analysis",
    "auth pattern analysis", "graph time-window analysis",
    "statistical beaconing JA3", "process lineage anomaly",
    "timestomping log gaps", "detonation browser exploit",
    "boot sequence autoruns", "scan rate port sweep",
    "cross-account IAM escalation", "runtime namespace escape",
    "dependency build integrity", "crash exploit heuristics",
]

RULE_TYPES = ["threshold", "sequence", "statistical", "temporal", "periodic", "graph", "behavioral", "ml"]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate 50,000 Rules

# COMMAND ----------

NUM_RULES = 50000
BATCH_SIZE = 10000

library_table = get_table_path(cfg, "correlation_rules_library")

# Ensure table exists
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {library_table} (
    id STRING,
    rule_name STRING NOT NULL,
    rule_description STRING,
    category STRING NOT NULL,
    subcategory STRING,
    rule_type STRING DEFAULT 'threshold',
    severity STRING DEFAULT 'medium',
    confidence_score DOUBLE DEFAULT 0.75,
    mitre_tactics ARRAY<STRING>,
    mitre_techniques ARRAY<STRING>,
    data_sources ARRAY<STRING>,
    rule_logic STRING,
    enabled BOOLEAN DEFAULT false,
    tags ARRAY<STRING>,
    conditions ARRAY<STRING>,
    window_seconds INT DEFAULT 300,
    threshold INT DEFAULT 5,
    author STRING,
    version INT DEFAULT 1,
    trigger_count INT DEFAULT 0,
    false_positive_rate DOUBLE DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print(f"Generating {NUM_RULES} correlation rules...")

random.seed(42)
total_written = 0

for batch_start in range(0, NUM_RULES, BATCH_SIZE):
    batch_end = min(batch_start + BATCH_SIZE, NUM_RULES)
    batch_rows = []

    for i in range(batch_start, batch_end):
        ci = i % len(CATEGORIES)
        si = i % len(SUBCATEGORIES)
        ti = i % len(TACTICS_SETS)
        di = i % len(DATA_SOURCES_SETS)

        cat = CATEGORIES[ci]
        sub = SUBCATEGORIES[si]
        sev_rand = random.random()
        sev = SEVERITIES[0] if sev_rand < 0.15 else SEVERITIES[1] if sev_rand < 0.4 else SEVERITIES[2] if sev_rand < 0.75 else SEVERITIES[3]
        conf = round(0.5 + random.random() * 0.49, 3)
        win = (5 + (i % 55)) * 60  # convert minutes to seconds
        threshold = 3 + (i % 10)
        rule_type = RULE_TYPES[i % len(RULE_TYPES)]

        prefix = PREFIXES[i % len(PREFIXES)]
        verb = VERBS[i % len(VERBS)]
        name = f"{prefix} {cat} {sub} {verb}"
        desc = f"Detects {sub} activity in {cat}. Correlates {', '.join(DATA_SOURCES_SETS[di])} within {win // 60}m sliding window with adaptive thresholds."

        techs = [TECHNIQUES[i % len(TECHNIQUES)], TECHNIQUES[(i * 7) % len(TECHNIQUES)]]
        tags_sel = [TAGS[i % len(TAGS)], TAGS[(i * 3) % len(TAGS)], TAGS[(i * 7) % len(TAGS)]]
        author = AUTHORS[i % len(AUTHORS)]
        enabled = random.random() < 0.35

        # Build conditions from data sources
        conditions_sel = [DATA_SOURCES_SETS[di][0].lower().replace(" ", "_")]
        if rule_type == "sequence":
            conditions_sel.append(DATA_SOURCES_SETS[di][1].lower().replace(" ", "_"))

        logic = json.dumps({
            "pseudo_code": f'WHEN source IN [{DATA_SOURCES_SETS[di][0]}]\n  AND event.type MATCHES "{sub}"\n  AND COUNT(DISTINCT target) > {threshold}\n  WITHIN {win // 60} min\nTHEN ALERT("{name[:50]}", sev="{sev}")\n  ENRICH(threat_intel)\n  ESCALATE(tier_{"3" if sev == "critical" else "2" if sev == "high" else "1"})',
            "conditions": [
                {"field": "event.category", "op": "eq", "val": cat},
                {"field": "threat.technique", "op": "in", "val": sub},
            ],
            "time_window": f"{win // 60}m",
            "threshold": {"field": "event.count", "op": ">=", "val": threshold},
        })

        batch_rows.append((
            f"rule-{i+1:06d}",
            name, desc, cat, sub, rule_type, sev, conf,
            TACTICS_SETS[ti], techs, DATA_SOURCES_SETS[di],
            logic, enabled, tags_sel, conditions_sel,
            win, threshold, author, 1,
            random.randint(0, 5000),
            round(random.random() * 8, 2),
        ))

    schema = StructType([
        StructField("id", StringType()),
        StructField("rule_name", StringType()),
        StructField("rule_description", StringType()),
        StructField("category", StringType()),
        StructField("subcategory", StringType()),
        StructField("rule_type", StringType()),
        StructField("severity", StringType()),
        StructField("confidence_score", DoubleType()),
        StructField("mitre_tactics", ArrayType(StringType())),
        StructField("mitre_techniques", ArrayType(StringType())),
        StructField("data_sources", ArrayType(StringType())),
        StructField("rule_logic", StringType()),
        StructField("enabled", BooleanType()),
        StructField("tags", ArrayType(StringType())),
        StructField("conditions", ArrayType(StringType())),
        StructField("window_seconds", IntegerType()),
        StructField("threshold", IntegerType()),
        StructField("author", StringType()),
        StructField("version", IntegerType()),
        StructField("trigger_count", IntegerType()),
        StructField("false_positive_rate", DoubleType()),
    ])

    batch_df = spark.createDataFrame(batch_rows, schema=schema)
    batch_df = batch_df.withColumn("created_at", current_timestamp()).withColumn("updated_at", current_timestamp())

    if batch_start == 0:
        batch_df.write.mode("overwrite").saveAsTable(library_table)
    else:
        batch_df.write.mode("append").saveAsTable(library_table)

    total_written += batch_df.count()
    print(f"  Batch {batch_start // BATCH_SIZE + 1}: wrote {batch_end - batch_start} rules (total: {total_written})")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Activate Top Rules into correlation_rules Table
# MAGIC
# MAGIC Copy the highest-confidence enabled rules into the active `correlation_rules` table
# MAGIC used by the streaming correlation engine.

# COMMAND ----------

active_rules_table = get_table_path(cfg, "correlation_rules")
active_limit = 200  # top 200 rules activated for streaming evaluation

spark.sql(f"""
INSERT OVERWRITE {active_rules_table}
SELECT
    id,
    rule_name as name,
    rule_description as description,
    rule_type,
    severity,
    enabled,
    rule_logic as logic,
    conditions,
    window_seconds,
    threshold,
    mitre_tactics[0] as mitre_tactic,
    mitre_techniques[0] as mitre_technique,
    data_sources,
    false_positive_rate,
    confidence_score,
    tags,
    author,
    version,
    created_at,
    updated_at
FROM {library_table}
WHERE enabled = true
ORDER BY confidence_score DESC, trigger_count DESC
LIMIT {active_limit}
""")

active_count = spark.table(active_rules_table).count()
print(f"\nActivated {active_count} rules from library into streaming correlation engine")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

lib_count = spark.table(library_table).count()
enabled_count = spark.sql(f"SELECT COUNT(*) as cnt FROM {library_table} WHERE enabled = true").collect()[0].cnt

by_category = spark.sql(f"""
    SELECT category, COUNT(*) as cnt, ROUND(AVG(confidence_score), 2) as avg_confidence
    FROM {library_table}
    GROUP BY category
    ORDER BY cnt DESC
""").collect()

by_severity = spark.sql(f"""
    SELECT severity, COUNT(*) as cnt
    FROM {library_table}
    GROUP BY severity
    ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END
""").collect()

print("=" * 60)
print(" CORRELATION RULES LIBRARY - GENERATION COMPLETE")
print("=" * 60)
print(f"""
  Total Rules Generated:  {lib_count:,}
  Enabled Rules:          {enabled_count:,}
  Active (streaming):     {active_count}
  Categories:             {len(CATEGORIES)}
  Subcategories:          {len(SUBCATEGORIES)}
  MITRE Techniques:       {len(TECHNIQUES)}
  Rule Types:             {len(RULE_TYPES)}
""")

print("\nDistribution by Severity:")
for r in by_severity:
    print(f"  {r.severity:10s}: {r.cnt:,}")

print("\nTop 10 Categories:")
for r in by_category[:10]:
    print(f"  {r.category:25s}: {r.cnt:,} rules (avg confidence: {r.avg_confidence})")

mon.log_complete(details={
    "total_rules": lib_count,
    "enabled_rules": enabled_count,
    "active_rules": active_count,
})

dbutils.notebook.exit(json.dumps({
    "status": "COMPLETE",
    "total_rules": lib_count,
    "active_rules": active_count,
}))
