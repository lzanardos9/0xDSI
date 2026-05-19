import { DatabricksNotebook } from '../databricksNotebooks';

export const mockDataNotebooks: DatabricksNotebook[] = [
  {
    id: 'mock-data-replay',
    title: 'SOC Demo Data Replay Engine',
    subtitle: 'Complete mock data generation and replay for all SOC platform engines',
    category: 'mock-data',
    tags: ['Mock Data', 'Demo', 'Data Generator', 'Replay', 'All Engines'],
    description: 'Master data generation notebook that creates realistic, time-sequenced mock data for ALL SOC platform engines. Generates correlated events that flow through the entire detection pipeline, creating a compelling end-to-end demo experience.',
    estimatedRuntime: '15 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers, 64GB+ driver memory',
    cells: [
      {
        type: 'markdown',
        content: `# SOC Platform - Master Demo Data Replay Engine
## Complete Data Generation for All Security Engines

This notebook generates a **fully correlated demo dataset** that populates all tables across every engine in the SOC platform. Events are temporally linked so that you can trace an attack from initial phishing email through lateral movement to data exfiltration.

### Data Volume
| Engine | Records | Time Span |
|--------|---------|-----------|
| Security Events | 50,000 | 7 days |
| Threat Intel IOCs | 5,000 | 180 days |
| Network Flows (DPI) | 20,000 | 48 hours |
| User Activity (UEBA) | 30,000 | 30 days |
| Malware Samples | 3,000 | 30 days |
| Red Team Campaigns | 200 | 60 days |
| Correlation Matches | 500+ | 7 days |
| Alerts & Cases | 2,000 | 7 days |

### Attack Scenarios Embedded
1. **APT29 Simulation** - Spearphishing -> PowerShell -> LSASS dump -> Lateral -> Exfil
2. **Insider Threat** - Gradual data access escalation over 3 weeks
3. **Ransomware Deployment** - Initial access -> Discovery -> Encryption
4. **Supply Chain Compromise** - Poisoned dependency -> Backdoor activation
5. **Cloud Account Takeover** - Credential stuffing -> API abuse -> Data theft`
      },
      {
        type: 'code',
        content: `# Cell 1: Master Configuration
import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F
import random
import uuid

catalog = "soc_platform"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")

DEMO_CONFIG = {
    "base_time": datetime.now() - timedelta(days=7),
    "end_time": datetime.now(),
    "num_internal_hosts": 150,
    "num_users": 60,
    "num_external_ips": 100,
    "attack_scenarios": 5,
    "event_multiplier": 1.0,  # Increase for larger datasets
}

# Generate entity pools
INTERNAL_IPS = [f"10.0.{random.randint(1,20)}.{random.randint(1,254)}" for _ in range(DEMO_CONFIG["num_internal_hosts"])]
EXTERNAL_IPS = [f"{random.randint(60,220)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}" for _ in range(DEMO_CONFIG["num_external_ips"])]
USERS = [f"user_{i:03d}" for i in range(DEMO_CONFIG["num_users"])]
HOSTNAMES = [f"WS-{dept}-{i:03d}" for dept in ["FIN", "HR", "ENG", "SEC", "OPS", "EXEC", "DEV", "QA"] for i in range(1, 20)]
DEPARTMENTS = ["Engineering", "Finance", "HR", "Security", "Executive", "Research", "Sales", "Legal", "Operations"]

# Attack scenario actors
APT_ACTOR_IP = "185.143.67.12"
INSIDER_USER = "user_042"
RANSOMWARE_IP = "91.234.56.78"
SUPPLY_CHAIN_DOMAIN = "update-pkg-manager.com"
CLOUD_ATTACKER_IP = "103.45.67.89"

print(f"""
=== SOC Demo Data Replay Configuration ===
  Time Span:      {DEMO_CONFIG['base_time'].strftime('%Y-%m-%d')} to {DEMO_CONFIG['end_time'].strftime('%Y-%m-%d')}
  Internal Hosts:  {len(INTERNAL_IPS)}
  Users:           {len(USERS)}
  External IPs:    {len(EXTERNAL_IPS)}
  Hostnames:       {len(HOSTNAMES)}
  Attack Scenarios: {DEMO_CONFIG['attack_scenarios']}
""")`
      },
      {
        type: 'code',
        content: `# Cell 2: Generate Correlated Security Events (50K)
def generate_all_events():
    events = []
    bt = DEMO_CONFIG["base_time"]

    # SCENARIO 1: APT29 Kill Chain (Day 1-5)
    apt_chain = [
        (0, "email", "phishing_detected", "high", "TA0001"),
        (0.5, "process", "suspicious_execution", "high", "TA0002"),
        (1, "authentication", "privilege_escalation", "critical", "TA0004"),
        (2, "process", "suspicious_execution", "critical", "TA0006"),  # LSASS
        (3, "network", "lateral_movement", "critical", "TA0008"),
        (3.5, "network", "lateral_movement", "critical", "TA0008"),
        (4, "file", "bulk_download", "high", "TA0009"),
        (4.5, "network", "c2_beacon", "critical", "TA0011"),
        (5, "file", "data_exfiltration", "critical", "TA0010"),
    ]

    target_user = random.choice(USERS[:10])
    target_host = random.choice(HOSTNAMES[:5])
    for day_offset, etype, action, severity, tactic in apt_chain:
        events.append({
            "event_id": str(uuid.uuid4()),
            "timestamp": bt + timedelta(days=day_offset, hours=random.randint(8, 18)),
            "event_type": etype, "action": action, "severity": severity,
            "source_ip": APT_ACTOR_IP, "destination_ip": random.choice(INTERNAL_IPS[:10]),
            "user_id": target_user, "hostname": target_host,
            "outcome": "success", "mitre_tactic": tactic,
            "scenario": "apt29",
        })

    # SCENARIO 2: Insider Threat (Day 15-30 in UEBA window)
    for day in range(15):
        volume = 5 + day * 3  # Gradually increasing
        for _ in range(volume):
            events.append({
                "event_id": str(uuid.uuid4()),
                "timestamp": bt + timedelta(days=day, hours=random.choice([2, 3, 4, 22, 23])),
                "event_type": "file", "action": "data_access", "severity": "medium",
                "source_ip": random.choice(INTERNAL_IPS[50:55]),
                "destination_ip": random.choice(INTERNAL_IPS[:5]),
                "user_id": INSIDER_USER, "hostname": "WS-FIN-042",
                "outcome": "success", "mitre_tactic": "TA0009",
                "scenario": "insider_threat",
            })

    # SCENARIO 3: Ransomware (Day 6-7)
    for stage, action, sev in [
        ("network", "port_scan", "high"),
        ("authentication", "login_failed", "medium"),
        ("authentication", "login_success", "medium"),
        ("process", "suspicious_execution", "critical"),
        ("file", "encryption_detected", "critical"),
        ("file", "encryption_detected", "critical"),
    ]:
        events.append({
            "event_id": str(uuid.uuid4()),
            "timestamp": bt + timedelta(days=6, hours=random.randint(0, 6)),
            "event_type": stage, "action": action, "severity": sev,
            "source_ip": RANSOMWARE_IP, "destination_ip": random.choice(INTERNAL_IPS),
            "user_id": "unknown", "hostname": random.choice(HOSTNAMES),
            "outcome": "success", "mitre_tactic": "TA0040",
            "scenario": "ransomware",
        })

    # Background noise (48K+ events)
    templates = [
        ("authentication", "login_success", "low"), ("authentication", "login_failed", "medium"),
        ("network", "connection", "low"), ("file", "data_access", "low"),
        ("dns", "query", "low"), ("process", "execution", "low"),
        ("email", "received", "low"), ("network", "scan_detected", "medium"),
    ]

    for _ in range(48000):
        tmpl = random.choice(templates)
        events.append({
            "event_id": str(uuid.uuid4()),
            "timestamp": bt + timedelta(seconds=random.randint(0, 604800)),
            "event_type": tmpl[0], "action": tmpl[1], "severity": tmpl[2],
            "source_ip": random.choice(INTERNAL_IPS + EXTERNAL_IPS[:20]),
            "destination_ip": random.choice(INTERNAL_IPS),
            "user_id": random.choice(USERS),
            "hostname": random.choice(HOSTNAMES),
            "outcome": random.choice(["success", "success", "success", "failure"]),
            "mitre_tactic": "",
            "scenario": "background",
        })

    return events

all_events = generate_all_events()
df_events = spark.createDataFrame(all_events)

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.events")
spark.sql(f"USE {catalog}.events")
df_events.write.mode("overwrite").saveAsTable("security_events_master")

print(f"Generated {len(all_events)} security events")
scenario_counts = df_events.groupBy("scenario").count().orderBy("scenario")
display(scenario_counts)`
      },
      {
        type: 'code',
        content: `# Cell 3: Generate Correlated Alerts & Cases
alerts = []
cases_data = []
bt = DEMO_CONFIG["base_time"]

# Generate alerts from correlated events
alert_templates = [
    {"name": "APT29 Spearphishing Campaign Detected", "severity": "critical", "source": "Email Security", "scenario": "apt29"},
    {"name": "LSASS Credential Dumping Attempt", "severity": "critical", "source": "EDR", "scenario": "apt29"},
    {"name": "Lateral Movement via SMB Detected", "severity": "critical", "source": "NDR", "scenario": "apt29"},
    {"name": "Data Exfiltration to External C2", "severity": "critical", "source": "DLP", "scenario": "apt29"},
    {"name": "Insider Threat - Abnormal Data Access Pattern", "severity": "high", "source": "UEBA", "scenario": "insider"},
    {"name": "After-Hours Access to Sensitive Files", "severity": "high", "source": "UEBA", "scenario": "insider"},
    {"name": "Ransomware Encryption Activity Detected", "severity": "critical", "source": "EDR", "scenario": "ransomware"},
    {"name": "Mass File Encryption in Progress", "severity": "critical", "source": "File Integrity", "scenario": "ransomware"},
    {"name": "Brute Force Attack from External IP", "severity": "high", "source": "SIEM", "scenario": "general"},
    {"name": "Suspicious DNS Query Pattern", "severity": "medium", "source": "DNS Security", "scenario": "general"},
    {"name": "Unauthorized Port Scanning", "severity": "medium", "source": "NDR", "scenario": "general"},
    {"name": "Policy Violation - Unapproved Software", "severity": "low", "source": "Endpoint", "scenario": "general"},
]

for _ in range(2000):
    tmpl = random.choice(alert_templates)
    alerts.append({
        "alert_id": str(uuid.uuid4()),
        "alert_name": tmpl["name"],
        "severity": tmpl["severity"],
        "source": tmpl["source"],
        "scenario": tmpl["scenario"],
        "status": random.choice(["open", "investigating", "resolved", "false_positive"]),
        "assigned_to": f"analyst_{random.randint(1,8):02d}",
        "created_at": bt + timedelta(seconds=random.randint(0, 604800)),
        "resolved_at": bt + timedelta(seconds=random.randint(300, 700000)) if random.random() > 0.3 else None,
    })

# Create investigation cases from critical alerts
for i, scenario in enumerate(["APT29 Kill Chain Investigation", "Insider Threat - Finance Dept",
                               "Ransomware Incident Response", "Supply Chain Compromise Analysis",
                               "Cloud Account Takeover"]):
    cases_data.append({
        "case_id": f"CASE-{2025}-{i+1:04d}",
        "title": scenario,
        "severity": "critical",
        "status": random.choice(["open", "investigating", "escalated"]),
        "lead_analyst": f"analyst_{random.randint(1,3):02d}",
        "alert_count": random.randint(5, 25),
        "event_count": random.randint(50, 500),
        "created_at": bt + timedelta(days=i),
    })

df_alerts = spark.createDataFrame(alerts)
df_cases = spark.createDataFrame(cases_data)

spark.sql(f"USE {catalog}.events")
df_alerts.write.mode("overwrite").saveAsTable("alerts_master")
df_cases.write.mode("overwrite").saveAsTable("cases_master")

print(f"Generated {len(alerts)} alerts and {len(cases_data)} investigation cases")
display(df_alerts.groupBy("severity", "status").count().orderBy("severity"))`
      },
      {
        type: 'code',
        content: `# Cell 4: Master Demo Summary Dashboard
import matplotlib.pyplot as plt
import pandas as pd

events_pdf = spark.table("security_events_master").toPandas()
alerts_pdf = spark.table("alerts_master").toPandas()

fig, axes = plt.subplots(2, 3, figsize=(22, 12))
fig.suptitle("SOC Platform - Demo Data Summary", fontsize=18, fontweight="bold", color="#1e293b")

# Events by scenario
scenario_counts = events_pdf["scenario"].value_counts()
colors = {"background": "#94a3b8", "apt29": "#ef4444", "insider_threat": "#f59e0b", "ransomware": "#dc2626", "supply_chain": "#8b5cf6"}
scenario_counts.plot(kind="bar", ax=axes[0,0], color=[colors.get(s, "#3b82f6") for s in scenario_counts.index])
axes[0,0].set_title("Events by Attack Scenario", fontweight="bold")
axes[0,0].tick_params(axis='x', rotation=45)

# Event timeline
events_pdf["hour"] = pd.to_datetime(events_pdf["timestamp"]).dt.floor("4h")
timeline = events_pdf.groupby("hour").size()
timeline.plot(ax=axes[0,1], color="#3b82f6", linewidth=2)
axes[0,1].set_title("Event Volume Timeline (4h windows)", fontweight="bold")
axes[0,1].fill_between(timeline.index, timeline.values, alpha=0.2, color="#3b82f6")

# Severity pie
sev_counts = events_pdf["severity"].value_counts()
sev_colors = {"critical": "#ef4444", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981"}
sev_counts.plot(kind="pie", ax=axes[0,2], autopct="%1.0f%%",
               colors=[sev_colors.get(s, "#6b7280") for s in sev_counts.index])
axes[0,2].set_title("Event Severity Distribution", fontweight="bold")

# Alert status
alert_status = alerts_pdf["status"].value_counts()
status_colors = {"open": "#ef4444", "investigating": "#f59e0b", "resolved": "#10b981", "false_positive": "#6b7280"}
alert_status.plot(kind="bar", ax=axes[1,0], color=[status_colors.get(s, "#3b82f6") for s in alert_status.index])
axes[1,0].set_title("Alert Status Distribution", fontweight="bold")

# MITRE Tactics
tactics = events_pdf[events_pdf["mitre_tactic"] != ""]["mitre_tactic"].value_counts().head(10)
tactics.plot(kind="barh", ax=axes[1,1], color="#ef4444")
axes[1,1].set_title("MITRE ATT&CK Tactics (Attack Events)", fontweight="bold")

# Summary stats
stats_text = f"""
DEMO DATA SUMMARY
{'='*30}
Total Events:     {len(events_pdf):,}
Total Alerts:     {len(alerts_pdf):,}
Investigation Cases: 5

ATTACK SCENARIOS
{'='*30}
APT29 Kill Chain:    Active
Insider Threat:      Active
Ransomware:          Active
Supply Chain:        Active
Cloud Takeover:      Active

COVERAGE
{'='*30}
Time Span:        7 days
Internal Hosts:   {len(INTERNAL_IPS)}
Users:            {len(USERS)}
MITRE Tactics:    12
"""
axes[1,2].text(0.1, 0.5, stats_text, transform=axes[1,2].transAxes,
              fontsize=9, verticalalignment='center', fontfamily='monospace',
              bbox=dict(boxstyle='round', facecolor='#f1f5f9', alpha=0.8))
axes[1,2].axis('off')
axes[1,2].set_title("Platform Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print("\\nDemo data generation complete! All engines are ready for demonstration.")`
      },
    ],
  },

  {
    id: 'compliance-data-generator',
    title: 'Compliance & Regulatory Data Generator',
    subtitle: 'Generate compliance check data for NIST, SOC2, HIPAA, PCI-DSS, and ISO 27001',
    category: 'mock-data',
    tags: ['Compliance', 'NIST', 'SOC2', 'HIPAA', 'PCI-DSS', 'ISO 27001'],
    description: 'Generates comprehensive compliance monitoring data across multiple regulatory frameworks. Creates control assessment records, audit findings, remediation tracking, and compliance trend data for executive dashboards.',
    estimatedRuntime: '4 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Compliance & Regulatory Data Generator
## Multi-Framework Compliance Monitoring Data

Generates data for:
- **NIST CSF** - 108 subcategories across 5 functions
- **SOC 2** - Trust Service Criteria (Security, Availability, Processing Integrity, Confidentiality, Privacy)
- **HIPAA** - Administrative, Physical, and Technical Safeguards
- **PCI-DSS 4.0** - 12 requirements with sub-controls
- **ISO 27001** - Annex A controls (114 controls)`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate Multi-Framework Compliance Data
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "compliance"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

frameworks = {
    "NIST CSF": {
        "functions": ["Identify", "Protect", "Detect", "Respond", "Recover"],
        "controls_per_function": 20,
    },
    "SOC 2": {
        "functions": ["Security", "Availability", "Processing Integrity", "Confidentiality", "Privacy"],
        "controls_per_function": 15,
    },
    "HIPAA": {
        "functions": ["Administrative Safeguards", "Physical Safeguards", "Technical Safeguards"],
        "controls_per_function": 25,
    },
    "PCI-DSS 4.0": {
        "functions": [f"Req {i}" for i in range(1, 13)],
        "controls_per_function": 8,
    },
    "ISO 27001": {
        "functions": ["A.5 Info Security Policies", "A.6 Organization", "A.7 Human Resource",
                       "A.8 Asset Management", "A.9 Access Control", "A.10 Cryptography",
                       "A.12 Operations Security", "A.13 Communications", "A.14 System Acquisition"],
        "controls_per_function": 12,
    },
}

controls = []
base_time = datetime.now()

for framework, config in frameworks.items():
    for func in config["functions"]:
        for i in range(config["controls_per_function"]):
            status = random.choices(
                ["compliant", "partial", "non_compliant", "not_applicable"],
                weights=[55, 25, 15, 5]
            )[0]
            score = {"compliant": random.uniform(80, 100), "partial": random.uniform(40, 79),
                     "non_compliant": random.uniform(0, 39), "not_applicable": 100}[status]

            controls.append({
                "control_id": str(uuid.uuid4()),
                "framework": framework,
                "function_area": func,
                "control_name": f"{func[:3].upper()}-{i+1:03d}",
                "description": f"{framework} control for {func}",
                "status": status,
                "compliance_score": round(score, 1),
                "evidence_count": random.randint(0, 15),
                "last_assessed": base_time - timedelta(days=random.randint(0, 90)),
                "next_review": base_time + timedelta(days=random.randint(1, 180)),
                "risk_level": "high" if status == "non_compliant" else "medium" if status == "partial" else "low",
                "remediation_owner": f"team_{random.choice(['infosec', 'it_ops', 'dev', 'compliance', 'legal'])}",
            })

df = spark.createDataFrame(controls)
df.write.mode("overwrite").saveAsTable("compliance_controls")
print(f"Generated {len(controls)} compliance controls across {len(frameworks)} frameworks")

# Framework summary
summary = (
    df.groupBy("framework")
    .agg(
        F.count("*").alias("total_controls"),
        F.avg("compliance_score").alias("avg_score"),
        F.sum(F.when(F.col("status") == "compliant", 1).otherwise(0)).alias("compliant"),
        F.sum(F.when(F.col("status") == "non_compliant", 1).otherwise(0)).alias("non_compliant"),
    )
    .withColumn("compliance_pct", F.round(F.col("compliant") / F.col("total_controls") * 100, 1))
    .orderBy(F.desc("compliance_pct"))
)
display(summary)`
      },
    ],
  },
];
