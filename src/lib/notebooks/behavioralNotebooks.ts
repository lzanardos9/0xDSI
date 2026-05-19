import { DatabricksNotebook } from '../databricksNotebooks';

export const behavioralNotebooks: DatabricksNotebook[] = [
  {
    id: 'ueba-engine',
    title: 'User & Entity Behavior Analytics (UEBA)',
    subtitle: 'Baseline modeling and deviation detection for insider threat identification',
    category: 'behavioral',
    tags: ['UEBA', 'Insider Threat', 'Behavioral Baseline', 'Anomaly Score', 'Risk Profile'],
    description: 'Builds behavioral baselines for users and entities using historical activity patterns. Detects deviations that indicate compromised accounts, insider threats, or policy violations. Implements multi-dimensional scoring across login patterns, data access, network activity, and temporal behaviors.',
    estimatedRuntime: '8 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# User & Entity Behavior Analytics (UEBA) Engine
## Behavioral Baseline Modeling & Insider Threat Detection

### Behavioral Dimensions Analyzed
1. **Login Patterns** - Time, location, device, success/failure rates
2. **Data Access** - Volume, sensitivity level, access frequency
3. **Network Activity** - Connections, data transfers, protocol usage
4. **Application Usage** - Apps accessed, session duration, activity patterns
5. **Temporal Patterns** - After-hours activity, weekend work, schedule deviations

### Scoring Model
\`\`\`
Risk Score = w1*Login_Anomaly + w2*Data_Anomaly + w3*Network_Anomaly + w4*Temporal_Anomaly
           = 0.25 * LA + 0.30 * DA + 0.25 * NA + 0.20 * TA
\`\`\``
      },
      {
        type: 'code',
        content: `# Cell 1: Setup & Generate User Activity Data
from pyspark.sql import functions as F
from pyspark.sql.window import Window
import numpy as np
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "ueba"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# User profiles with baseline behaviors
users = []
departments = ["Engineering", "Finance", "HR", "Security", "Executive", "Research", "Sales", "Legal"]
normal_hours = {
    "Engineering": (8, 20), "Finance": (7, 18), "HR": (8, 17),
    "Security": (0, 24), "Executive": (7, 22), "Research": (9, 21),
    "Sales": (8, 19), "Legal": (8, 18),
}

for i in range(60):
    dept = random.choice(departments)
    hours = normal_hours[dept]
    users.append({
        "user_id": f"user_{i:03d}",
        "department": dept,
        "title": random.choice(["Analyst", "Manager", "Director", "VP", "Engineer", "Specialist"]),
        "normal_login_hour_start": hours[0],
        "normal_login_hour_end": hours[1],
        "avg_daily_logins": random.randint(2, 8),
        "avg_daily_data_access_mb": random.randint(10, 500),
        "avg_daily_network_connections": random.randint(50, 500),
        "typical_locations": json.dumps(random.sample(["HQ-NYC", "Office-SF", "Office-LON", "Remote-US", "VPN"], random.randint(1, 3))),
        "risk_tier": random.choice(["standard", "elevated", "privileged"]),
    })

df_users = spark.createDataFrame(users)
df_users.write.mode("overwrite").saveAsTable("user_baselines")

# Generate 30 days of activity data
activities = []
base_date = datetime.now() - timedelta(days=30)

# Identify "insider threat" users (5% of population)
insider_threats = random.sample(range(60), 3)

for day in range(30):
    current_date = base_date + timedelta(days=day)
    for user in users:
        uid = int(user["user_id"].split("_")[1])
        is_insider = uid in insider_threats and day > 20  # Anomaly starts after day 20

        # Generate daily activities
        num_logins = user["avg_daily_logins"]
        if is_insider:
            num_logins = num_logins * random.randint(3, 5)

        for login_num in range(num_logins):
            if is_insider:
                login_hour = random.choice([2, 3, 4, 23, 0, 1])
                data_accessed_mb = user["avg_daily_data_access_mb"] * random.uniform(5, 20)
                location = random.choice(["Unknown-VPN", "TOR-Exit", "Foreign-IP"])
            else:
                login_hour = random.randint(user["normal_login_hour_start"], min(23, user["normal_login_hour_end"]))
                data_accessed_mb = user["avg_daily_data_access_mb"] * random.uniform(0.5, 1.5)
                location = random.choice(json.loads(user["typical_locations"]))

            activities.append({
                "activity_id": str(uuid.uuid4()),
                "user_id": user["user_id"],
                "department": user["department"],
                "timestamp": current_date.replace(hour=login_hour, minute=random.randint(0, 59)),
                "activity_type": random.choice(["login", "file_access", "email", "app_usage", "network"]),
                "login_hour": login_hour,
                "data_accessed_mb": round(data_accessed_mb, 2),
                "network_connections": int(user["avg_daily_network_connections"] * (random.uniform(3, 10) if is_insider else random.uniform(0.5, 1.5))),
                "location": location,
                "device": random.choice(["Laptop-Corp", "Desktop-Corp"]) if not is_insider else random.choice(["Personal-Device", "Unknown-Device"]),
                "failed_auth": random.randint(0, 1) if not is_insider else random.randint(2, 10),
                "sensitive_files_accessed": random.randint(0, 3) if not is_insider else random.randint(10, 50),
                "is_after_hours": login_hour < user["normal_login_hour_start"] or login_hour > user["normal_login_hour_end"],
                "is_weekend": current_date.weekday() >= 5,
                "is_anomalous": is_insider,
            })

df_activities = spark.createDataFrame(activities)
df_activities.write.mode("overwrite").saveAsTable("user_activities")
print(f"Generated {len(activities)} user activities over 30 days for {len(users)} users")
print(f"Insider threat users: {[f'user_{i:03d}' for i in insider_threats]}")`
      },
      {
        type: 'code',
        content: `# Cell 2: Build Behavioral Baselines (First 20 Days)
df = spark.table("user_activities")

# Split: first 20 days for baseline, last 10 for detection
df = df.withColumn("day_num", F.datediff(F.col("timestamp"), F.lit(datetime.now() - timedelta(days=30))))
baseline_df = df.filter(F.col("day_num") <= 20)
detection_df = df.filter(F.col("day_num") > 20)

# Compute baselines per user
baselines = (
    baseline_df
    .groupBy("user_id", "department")
    .agg(
        F.avg("login_hour").alias("baseline_avg_login_hour"),
        F.stddev("login_hour").alias("baseline_std_login_hour"),
        F.avg("data_accessed_mb").alias("baseline_avg_data_mb"),
        F.stddev("data_accessed_mb").alias("baseline_std_data_mb"),
        F.avg("network_connections").alias("baseline_avg_connections"),
        F.stddev("network_connections").alias("baseline_std_connections"),
        F.avg("failed_auth").alias("baseline_avg_failed_auth"),
        F.avg("sensitive_files_accessed").alias("baseline_avg_sensitive"),
        F.avg(F.when(F.col("is_after_hours"), 1).otherwise(0).cast("double")).alias("baseline_after_hours_ratio"),
    )
    .fillna(1.0)
)

baselines.write.mode("overwrite").saveAsTable("computed_baselines")
print("Behavioral baselines computed for first 20 days")
display(baselines.limit(10))`
      },
      {
        type: 'code',
        content: `# Cell 3: Anomaly Detection - Compare Detection Window to Baseline
baselines = spark.table("computed_baselines")
df = spark.table("user_activities")
detection_df = df.filter(F.datediff(F.col("timestamp"), F.lit(datetime.now() - timedelta(days=30))) > 20)

# Aggregate detection window per user
detection_agg = (
    detection_df
    .groupBy("user_id")
    .agg(
        F.avg("login_hour").alias("det_avg_login_hour"),
        F.avg("data_accessed_mb").alias("det_avg_data_mb"),
        F.avg("network_connections").alias("det_avg_connections"),
        F.avg("failed_auth").alias("det_avg_failed_auth"),
        F.avg("sensitive_files_accessed").alias("det_avg_sensitive"),
        F.avg(F.when(F.col("is_after_hours"), 1).otherwise(0).cast("double")).alias("det_after_hours_ratio"),
        F.sum(F.when(F.col("is_anomalous"), 1).otherwise(0)).alias("actual_anomalies"),
    )
)

# Compute Z-scores
scored = (
    detection_agg
    .join(baselines, "user_id")
    .withColumn("login_z", F.abs(F.col("det_avg_login_hour") - F.col("baseline_avg_login_hour")) /
                F.greatest(F.col("baseline_std_login_hour"), F.lit(0.1)))
    .withColumn("data_z", F.abs(F.col("det_avg_data_mb") - F.col("baseline_avg_data_mb")) /
                F.greatest(F.col("baseline_std_data_mb"), F.lit(0.1)))
    .withColumn("network_z", F.abs(F.col("det_avg_connections") - F.col("baseline_avg_connections")) /
                F.greatest(F.col("baseline_std_connections"), F.lit(0.1)))
    .withColumn("after_hours_z", F.abs(F.col("det_after_hours_ratio") - F.col("baseline_after_hours_ratio")) /
                F.lit(0.1))
    .withColumn("composite_risk_score",
        F.col("login_z") * 0.25 + F.col("data_z") * 0.30 +
        F.col("network_z") * 0.25 + F.col("after_hours_z") * 0.20)
    .withColumn("risk_level",
        F.when(F.col("composite_risk_score") > 5.0, "critical")
         .when(F.col("composite_risk_score") > 3.0, "high")
         .when(F.col("composite_risk_score") > 1.5, "medium")
         .otherwise("low"))
    .orderBy(F.desc("composite_risk_score"))
)

print("=== UEBA Risk Scores (Detection Window) ===")
display(scored.select("user_id", "department", "composite_risk_score", "risk_level",
                       "login_z", "data_z", "network_z", "actual_anomalies").limit(20))

# How well did we detect the insider threats?
high_risk = scored.filter(F.col("risk_level").isin(["critical", "high"]))
detected_insiders = high_risk.filter(F.col("actual_anomalies") > 0).count()
total_insiders = scored.filter(F.col("actual_anomalies") > 0).count()
print(f"\\nInsider Threat Detection: {detected_insiders}/{total_insiders} detected as high/critical risk")`
      },
      {
        type: 'code',
        content: `# Cell 4: UEBA Dashboard Visualization
import matplotlib.pyplot as plt
import pandas as pd

scored_pdf = scored.toPandas()
activities_pdf = spark.table("user_activities").toPandas()

fig, axes = plt.subplots(2, 3, figsize=(22, 12))
fig.suptitle("UEBA - User & Entity Behavior Analytics Dashboard", fontsize=16, fontweight="bold")

# Risk score distribution
axes[0,0].hist(scored_pdf["composite_risk_score"], bins=30, color="#3b82f6", edgecolor="#1e40af", alpha=0.8)
axes[0,0].axvline(x=3.0, color="#f59e0b", linestyle="--", label="High threshold")
axes[0,0].axvline(x=5.0, color="#ef4444", linestyle="--", label="Critical threshold")
axes[0,0].set_title("Composite Risk Score Distribution")
axes[0,0].legend()

# Risk level breakdown
risk_counts = scored_pdf["risk_level"].value_counts()
colors_map = {"critical": "#ef4444", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981"}
risk_counts.plot(kind="pie", ax=axes[0,1], autopct="%1.1f%%",
                colors=[colors_map.get(r, "#6b7280") for r in risk_counts.index])
axes[0,1].set_title("Users by Risk Level")

# Z-score components for top users
top10 = scored_pdf.nlargest(10, "composite_risk_score")
x = range(len(top10))
w = 0.2
axes[0,2].bar([i-1.5*w for i in x], top10["login_z"], w, label="Login", color="#3b82f6")
axes[0,2].bar([i-0.5*w for i in x], top10["data_z"], w, label="Data", color="#10b981")
axes[0,2].bar([i+0.5*w for i in x], top10["network_z"], w, label="Network", color="#f59e0b")
axes[0,2].bar([i+1.5*w for i in x], top10["after_hours_z"], w, label="After Hours", color="#ef4444")
axes[0,2].set_xticks(x)
axes[0,2].set_xticklabels(top10["user_id"], rotation=45, fontsize=7)
axes[0,2].set_title("Z-Score Components (Top 10 Users)")
axes[0,2].legend(fontsize=7)

# Activity timeline (anomalous vs normal)
activities_pdf["date"] = pd.to_datetime(activities_pdf["timestamp"]).dt.date
daily = activities_pdf.groupby(["date", "is_anomalous"]).size().unstack(fill_value=0)
if True in daily.columns:
    daily[True].plot(ax=axes[1,0], color="#ef4444", label="Anomalous", linewidth=2)
if False in daily.columns:
    daily[False].plot(ax=axes[1,0], color="#10b981", label="Normal", alpha=0.5)
axes[1,0].set_title("Activity Volume Over 30 Days")
axes[1,0].legend()

# Department risk
dept_risk = scored_pdf.groupby("department")["composite_risk_score"].mean().sort_values()
dept_risk.plot(kind="barh", ax=axes[1,1], color="#3b82f6")
axes[1,1].set_title("Average Risk by Department")

# Data access vs sensitive files scatter
axes[1,2].scatter(activities_pdf[~activities_pdf["is_anomalous"]]["data_accessed_mb"],
                  activities_pdf[~activities_pdf["is_anomalous"]]["sensitive_files_accessed"],
                  c="#10b981", alpha=0.1, s=5, label="Normal")
axes[1,2].scatter(activities_pdf[activities_pdf["is_anomalous"]]["data_accessed_mb"],
                  activities_pdf[activities_pdf["is_anomalous"]]["sensitive_files_accessed"],
                  c="#ef4444", alpha=0.5, s=15, label="Anomalous")
axes[1,2].set_title("Data Access vs Sensitive Files")
axes[1,2].set_xlabel("Data Accessed (MB)")
axes[1,2].set_ylabel("Sensitive Files")
axes[1,2].legend()

plt.tight_layout()
plt.show()`
      },
    ],
  },

  {
    id: 'threat-escalation-engine',
    title: 'Automated Threat Escalation Engine',
    subtitle: 'Multi-factor escalation scoring with SLA tracking and runbook automation',
    category: 'behavioral',
    tags: ['Escalation', 'SLA', 'Runbook', 'Prioritization', 'Triage'],
    description: 'Automates alert triage and escalation decisions using a multi-factor scoring model that considers alert severity, asset criticality, threat intelligence context, historical patterns, and analyst workload. Includes SLA tracking and automated runbook execution.',
    estimatedRuntime: '5 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Automated Threat Escalation Engine
## Multi-Factor Alert Triage & Escalation

### Escalation Score Formula
\`\`\`
Score = (severity_weight * 0.30) + (asset_criticality * 0.25) + (intel_context * 0.20)
      + (historical_pattern * 0.15) + (time_sensitivity * 0.10)
\`\`\`

### Escalation Tiers
- **Tier 1**: Score < 0.3 - Auto-close or low-priority queue
- **Tier 2**: Score 0.3-0.6 - Standard analyst review
- **Tier 3**: Score 0.6-0.8 - Senior analyst with SLA tracking
- **Tier 4**: Score > 0.8 - Immediate CISO notification + auto-runbook`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate Alert & Escalation Data
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "escalation"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

severity_weights = {"critical": 1.0, "high": 0.75, "medium": 0.50, "low": 0.25}
asset_categories = {"crown_jewel": 1.0, "critical_infra": 0.8, "business_app": 0.6, "standard": 0.3, "dev": 0.1}

alerts = []
base_time = datetime.now() - timedelta(hours=72)

alert_types = [
    {"name": "Brute Force Attack", "base_severity": "high", "mitre": "T1110"},
    {"name": "Data Exfiltration Attempt", "base_severity": "critical", "mitre": "T1041"},
    {"name": "Malware Detection", "base_severity": "critical", "mitre": "T1059"},
    {"name": "Privilege Escalation", "base_severity": "critical", "mitre": "T1068"},
    {"name": "Suspicious DNS Query", "base_severity": "medium", "mitre": "T1071"},
    {"name": "Policy Violation", "base_severity": "low", "mitre": "T1078"},
    {"name": "Anomalous Login", "base_severity": "medium", "mitre": "T1078"},
    {"name": "Ransomware Indicator", "base_severity": "critical", "mitre": "T1486"},
    {"name": "Insider Threat Signal", "base_severity": "high", "mitre": "T1567"},
    {"name": "C2 Communication", "base_severity": "critical", "mitre": "T1071.001"},
]

for _ in range(1500):
    alert_type = random.choice(alert_types)
    severity = alert_type["base_severity"]
    asset_cat = random.choice(list(asset_categories.keys()))

    sev_score = severity_weights[severity]
    asset_score = asset_categories[asset_cat]
    intel_score = round(random.uniform(0.0, 1.0), 3)
    hist_score = round(random.uniform(0.0, 1.0), 3)
    time_score = round(random.uniform(0.0, 1.0), 3)

    escalation_score = round(
        sev_score * 0.30 + asset_score * 0.25 + intel_score * 0.20 +
        hist_score * 0.15 + time_score * 0.10, 3)

    tier = 4 if escalation_score > 0.8 else 3 if escalation_score > 0.6 else 2 if escalation_score > 0.3 else 1
    sla_minutes = {1: 1440, 2: 240, 3: 60, 4: 15}[tier]

    created_at = base_time + timedelta(minutes=random.randint(0, 4320))
    response_time = random.randint(5, sla_minutes * 2)

    alerts.append({
        "alert_id": str(uuid.uuid4()),
        "alert_name": alert_type["name"],
        "severity": severity,
        "asset_category": asset_cat,
        "mitre_technique": alert_type["mitre"],
        "severity_score": sev_score,
        "asset_score": asset_score,
        "intel_score": intel_score,
        "historical_score": hist_score,
        "time_sensitivity_score": time_score,
        "escalation_score": escalation_score,
        "escalation_tier": tier,
        "sla_minutes": sla_minutes,
        "response_time_minutes": response_time,
        "sla_breached": response_time > sla_minutes,
        "status": random.choice(["open", "investigating", "resolved", "false_positive"]),
        "assigned_to": f"analyst_{random.randint(1,8):02d}",
        "created_at": created_at,
    })

df = spark.createDataFrame(alerts)
df.write.mode("overwrite").saveAsTable("escalation_alerts")
print(f"Generated {len(alerts)} alerts with escalation scoring")
display(df.groupBy("escalation_tier", "severity").count().orderBy("escalation_tier"))`
      },
      {
        type: 'code',
        content: `# Cell 2: Escalation Analytics & SLA Compliance
df = spark.table("escalation_alerts")

# SLA compliance by tier
sla_summary = (
    df.groupBy("escalation_tier")
    .agg(
        F.count("*").alias("total_alerts"),
        F.sum(F.when(F.col("sla_breached"), 1).otherwise(0)).alias("sla_breaches"),
        F.avg("response_time_minutes").alias("avg_response_min"),
        F.avg("escalation_score").alias("avg_score"),
    )
    .withColumn("sla_compliance_pct", F.round((1 - F.col("sla_breaches") / F.col("total_alerts")) * 100, 1))
    .orderBy("escalation_tier")
)
display(sla_summary)

# Analyst workload
analyst_load = (
    df.filter(F.col("status").isin(["open", "investigating"]))
    .groupBy("assigned_to")
    .agg(
        F.count("*").alias("active_alerts"),
        F.avg("escalation_score").alias("avg_severity"),
        F.sum(F.when(F.col("sla_breached"), 1).otherwise(0)).alias("sla_breaches"),
    )
    .orderBy(F.desc("active_alerts"))
)
print("\\n=== Analyst Workload ===")
display(analyst_load)

print(f"""
=== ESCALATION ENGINE SUMMARY ===
  Total Alerts:      {df.count()}
  Tier 4 (Critical): {df.filter(F.col('escalation_tier') == 4).count()}
  SLA Breaches:      {df.filter(F.col('sla_breached')).count()}
  Open Alerts:       {df.filter(F.col('status') == 'open').count()}
""")`
      },
    ],
  },

  {
    id: 'red-team-automation',
    title: 'Red Team Automation & Attack Simulation',
    subtitle: 'MITRE ATT&CK-based adversary simulation with detection validation',
    category: 'behavioral',
    tags: ['Red Team', 'MITRE ATT&CK', 'Purple Team', 'Detection Validation', 'Atomic Tests'],
    description: 'Automates adversary simulation campaigns based on MITRE ATT&CK framework. Generates realistic attack telemetry, validates detection coverage, measures mean time to detect (MTTD), and identifies gaps in defensive capabilities.',
    estimatedRuntime: '6 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Red Team Automation & Attack Simulation Engine
## MITRE ATT&CK-Based Purple Team Validation

Automates the full red team lifecycle:
1. **Campaign Planning** - Select ATT&CK techniques and objectives
2. **Attack Execution** - Generate realistic attack telemetry
3. **Detection Validation** - Verify which attacks were detected
4. **Gap Analysis** - Identify missing detection capabilities
5. **MTTD Measurement** - Mean Time to Detect across technique categories`
      },
      {
        type: 'code',
        content: `# Cell 1: MITRE ATT&CK Technique Library & Campaign Generation
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "red_team"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# MITRE ATT&CK technique library
techniques = [
    {"id": "T1566.001", "tactic": "Initial Access", "name": "Spearphishing Attachment", "difficulty": "easy"},
    {"id": "T1059.001", "tactic": "Execution", "name": "PowerShell", "difficulty": "easy"},
    {"id": "T1053.005", "tactic": "Persistence", "name": "Scheduled Task", "difficulty": "medium"},
    {"id": "T1548.002", "tactic": "Privilege Escalation", "name": "UAC Bypass", "difficulty": "medium"},
    {"id": "T1027", "tactic": "Defense Evasion", "name": "Obfuscated Files", "difficulty": "medium"},
    {"id": "T1003.001", "tactic": "Credential Access", "name": "LSASS Memory", "difficulty": "hard"},
    {"id": "T1087.002", "tactic": "Discovery", "name": "Domain Account Discovery", "difficulty": "easy"},
    {"id": "T1021.002", "tactic": "Lateral Movement", "name": "SMB/Windows Admin Shares", "difficulty": "medium"},
    {"id": "T1560.001", "tactic": "Collection", "name": "Archive via Utility", "difficulty": "easy"},
    {"id": "T1071.001", "tactic": "Command & Control", "name": "Web Protocols", "difficulty": "medium"},
    {"id": "T1041", "tactic": "Exfiltration", "name": "Exfiltration Over C2", "difficulty": "hard"},
    {"id": "T1486", "tactic": "Impact", "name": "Data Encrypted for Impact", "difficulty": "hard"},
    {"id": "T1190", "tactic": "Initial Access", "name": "Exploit Public-Facing App", "difficulty": "hard"},
    {"id": "T1547.001", "tactic": "Persistence", "name": "Registry Run Keys", "difficulty": "easy"},
    {"id": "T1055.001", "tactic": "Defense Evasion", "name": "DLL Injection", "difficulty": "hard"},
    {"id": "T1110.003", "tactic": "Credential Access", "name": "Password Spraying", "difficulty": "easy"},
]

# Generate attack campaigns
campaigns = []
for camp_idx in range(10):
    num_techniques = random.randint(4, 10)
    selected = random.sample(techniques, num_techniques)
    campaign_start = datetime.now() - timedelta(days=random.randint(1, 60))

    for step, tech in enumerate(selected):
        detected = random.random() < (0.8 if tech["difficulty"] == "easy" else 0.5 if tech["difficulty"] == "medium" else 0.3)
        detection_time = random.randint(5, 1440) if detected else None

        campaigns.append({
            "campaign_id": f"CAMP-{camp_idx+1:03d}",
            "campaign_name": f"Operation {random.choice(['Shadow', 'Phoenix', 'Cobra', 'Thunder', 'Eclipse', 'Storm'])} {random.choice(['Strike', 'Dawn', 'Rain', 'Wind', 'Fire'])}",
            "step_order": step + 1,
            "technique_id": tech["id"],
            "tactic": tech["tactic"],
            "technique_name": tech["name"],
            "difficulty": tech["difficulty"],
            "executed_at": campaign_start + timedelta(hours=step * random.randint(1, 4)),
            "was_detected": detected,
            "detection_time_minutes": detection_time,
            "detection_source": random.choice(["EDR", "SIEM", "NDR", "UEBA", "Firewall"]) if detected else None,
            "target_host": f"TARGET-{random.randint(1,20):03d}",
            "operator": f"operator_{random.randint(1,5):02d}",
        })

df = spark.createDataFrame(campaigns)
df.write.mode("overwrite").saveAsTable("red_team_campaigns")
print(f"Generated {len(campaigns)} attack simulation steps across 10 campaigns")
display(df.groupBy("tactic", "was_detected").count().orderBy("tactic"))`
      },
      {
        type: 'code',
        content: `# Cell 2: Detection Coverage & MTTD Analysis
df = spark.table("red_team_campaigns")

# Detection coverage by tactic
coverage = (
    df.groupBy("tactic")
    .agg(
        F.count("*").alias("total_tests"),
        F.sum(F.when(F.col("was_detected"), 1).otherwise(0)).alias("detected"),
        F.avg(F.when(F.col("was_detected"), F.col("detection_time_minutes"))).alias("avg_mttd_min"),
    )
    .withColumn("detection_rate", F.round(F.col("detected") / F.col("total_tests") * 100, 1))
    .orderBy("tactic")
)

display(coverage)

# Gap analysis
gaps = df.filter(~F.col("was_detected")).groupBy("technique_id", "technique_name", "tactic", "difficulty").count()
print("\\n=== Detection Gaps (Undetected Techniques) ===")
display(gaps.orderBy(F.desc("count")))

# Campaign success rates
campaign_summary = (
    df.groupBy("campaign_id", "campaign_name")
    .agg(
        F.count("*").alias("total_steps"),
        F.sum(F.when(F.col("was_detected"), 1).otherwise(0)).alias("detected_steps"),
        F.avg(F.when(F.col("was_detected"), F.col("detection_time_minutes"))).alias("avg_mttd"),
    )
    .withColumn("stealth_rate", F.round(1 - F.col("detected_steps") / F.col("total_steps"), 2))
    .orderBy(F.desc("stealth_rate"))
)
print("\\n=== Campaign Stealth Analysis ===")
display(campaign_summary)`
      },
    ],
  },
];
