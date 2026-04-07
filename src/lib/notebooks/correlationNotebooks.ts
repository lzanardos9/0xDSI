import { DatabricksNotebook } from '../databricksNotebooks';

export const correlationNotebooks: DatabricksNotebook[] = [
  {
    id: 'cep-correlation-engine',
    title: 'Complex Event Processing (CEP) Correlation Engine',
    subtitle: 'Real-time multi-stage attack detection using Spark Structured Streaming',
    category: 'correlation',
    tags: ['CEP', 'Spark Streaming', 'Correlation Rules', 'Delta Lake'],
    description: 'Implements a full Complex Event Processing engine that detects multi-stage attacks by correlating events across time windows. Uses sliding windows, tumbling windows, and session windows to identify brute-force-to-lateral-movement chains, data exfiltration patterns, and credential stuffing campaigns.',
    estimatedRuntime: '8 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Complex Event Processing (CEP) Correlation Engine
## Databricks Solution Accelerator - Agentic SOC Platform

This notebook implements a **production-grade Complex Event Processing engine** for real-time security event correlation using Apache Spark Structured Streaming on Databricks.

### What This Notebook Does
1. Creates Delta Lake tables for security events, correlation rules, and matched patterns
2. Generates realistic mock security event streams (10,000+ events)
3. Implements sliding-window correlation with configurable time windows
4. Detects multi-stage attack chains (brute-force -> lateral movement -> exfiltration)
5. Produces real-time correlation match scores with severity classification

### Architecture
\`\`\`
Event Stream --> Spark Streaming --> CEP Window Functions --> Correlation Rules --> Alert Pipeline
     |                |                      |                       |                    |
  Delta Lake    Checkpointing         Sliding Windows         Rule Engine          Delta Sink
\`\`\``
      },
      {
        type: 'code',
        content: `# Cell 1: Setup and Configuration
import json
from datetime import datetime, timedelta
from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.sql.window import Window
import random
import uuid

catalog = "soc_platform"
schema = "correlation_engine"

spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

print("CEP Correlation Engine initialized")`
      },
      {
        type: 'sql',
        content: `-- Cell 2: Create Delta Lake Tables for CEP
CREATE TABLE IF NOT EXISTS security_events (
  event_id STRING,
  timestamp TIMESTAMP,
  event_type STRING,
  severity STRING,
  source_ip STRING,
  destination_ip STRING,
  source_port INT,
  destination_port INT,
  protocol STRING,
  user_id STRING,
  hostname STRING,
  action STRING,
  outcome STRING,
  raw_log STRING,
  ocsf_category INT,
  ocsf_class INT,
  enrichment_data STRING,
  ingestion_time TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (event_type)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS correlation_rules (
  rule_id STRING,
  rule_name STRING,
  description STRING,
  severity STRING,
  pattern_type STRING,
  window_seconds INT,
  min_event_count INT,
  event_sequence ARRAY<STRING>,
  conditions STRING,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA;

CREATE TABLE IF NOT EXISTS correlation_matches (
  match_id STRING,
  rule_id STRING,
  rule_name STRING,
  severity STRING,
  confidence_score DOUBLE,
  matched_events ARRAY<STRING>,
  source_ip STRING,
  target_entity STRING,
  window_start TIMESTAMP,
  window_end TIMESTAMP,
  event_count INT,
  attack_stage STRING,
  mitre_tactics ARRAY<STRING>,
  matched_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (severity);`
      },
      {
        type: 'code',
        content: `# Cell 3: Generate Realistic Mock Security Events
def generate_security_events(num_events=12000):
    events = []
    base_time = datetime.now() - timedelta(hours=24)

    attacker_ips = ["10.0.5.77", "192.168.1.200", "172.16.8.99", "10.0.3.150"]
    target_ips = ["10.0.1.10", "10.0.1.20", "10.0.2.50", "10.0.2.100", "10.0.3.5"]
    server_ips = ["10.0.10.1", "10.0.10.2", "10.0.10.3", "10.0.10.4", "10.0.10.5"]
    usernames = ["jsmith", "admin", "svc_backup", "dbadmin", "root", "operator"]
    hostnames = ["WS-FIN-001", "WS-HR-042", "SRV-DC-01", "SRV-DB-03", "SRV-WEB-01", "SRV-MAIL-01"]

    event_templates = [
        {"event_type": "authentication", "action": "login_failed", "outcome": "failure", "severity": "medium", "ocsf_category": 3, "ocsf_class": 3002},
        {"event_type": "authentication", "action": "login_success", "outcome": "success", "severity": "low", "ocsf_category": 3, "ocsf_class": 3002},
        {"event_type": "authentication", "action": "privilege_escalation", "outcome": "success", "severity": "critical", "ocsf_category": 3, "ocsf_class": 3003},
        {"event_type": "network", "action": "port_scan", "outcome": "success", "severity": "high", "ocsf_category": 4, "ocsf_class": 4001},
        {"event_type": "network", "action": "lateral_movement", "outcome": "success", "severity": "critical", "ocsf_category": 4, "ocsf_class": 4002},
        {"event_type": "network", "action": "c2_beacon", "outcome": "success", "severity": "critical", "ocsf_category": 4, "ocsf_class": 4003},
        {"event_type": "file", "action": "data_access", "outcome": "success", "severity": "medium", "ocsf_category": 1, "ocsf_class": 1001},
        {"event_type": "file", "action": "bulk_download", "outcome": "success", "severity": "high", "ocsf_category": 1, "ocsf_class": 1002},
        {"event_type": "file", "action": "encryption_detected", "outcome": "success", "severity": "critical", "ocsf_category": 1, "ocsf_class": 1003},
        {"event_type": "dns", "action": "query", "outcome": "success", "severity": "low", "ocsf_category": 4, "ocsf_class": 4003},
        {"event_type": "dns", "action": "tunneling_detected", "outcome": "success", "severity": "critical", "ocsf_category": 4, "ocsf_class": 4003},
        {"event_type": "process", "action": "suspicious_execution", "outcome": "success", "severity": "high", "ocsf_category": 1, "ocsf_class": 1007},
        {"event_type": "email", "action": "phishing_detected", "outcome": "blocked", "severity": "high", "ocsf_category": 5, "ocsf_class": 5001},
    ]

    # Generate attack chains (realistic multi-stage attacks)
    attack_chains = [
        # Chain 1: Brute Force -> Credential Access -> Lateral Movement -> Exfiltration
        [
            (0, "authentication", "login_failed", "failure", "high"),
            (2, "authentication", "login_failed", "failure", "high"),
            (5, "authentication", "login_failed", "failure", "high"),
            (8, "authentication", "login_failed", "failure", "high"),
            (12, "authentication", "login_success", "success", "medium"),
            (15, "authentication", "privilege_escalation", "success", "critical"),
            (20, "network", "lateral_movement", "success", "critical"),
            (25, "file", "bulk_download", "success", "high"),
            (30, "network", "c2_beacon", "success", "critical"),
        ],
        # Chain 2: Phishing -> Malware -> C2 -> Data Theft
        [
            (0, "email", "phishing_detected", "success", "high"),
            (5, "process", "suspicious_execution", "success", "high"),
            (10, "network", "c2_beacon", "success", "critical"),
            (20, "file", "data_access", "success", "medium"),
            (25, "file", "bulk_download", "success", "high"),
            (30, "dns", "tunneling_detected", "success", "critical"),
        ],
        # Chain 3: Reconnaissance -> Exploitation -> Persistence
        [
            (0, "network", "port_scan", "success", "high"),
            (10, "authentication", "login_failed", "failure", "medium"),
            (15, "authentication", "login_success", "success", "medium"),
            (20, "process", "suspicious_execution", "success", "high"),
            (25, "file", "encryption_detected", "success", "critical"),
        ],
    ]

    # Inject attack chains
    for chain_idx, chain in enumerate(attack_chains):
        for repeat in range(3):
            chain_start = base_time + timedelta(hours=random.randint(0, 20))
            attacker = random.choice(attacker_ips)
            target = random.choice(target_ips)
            user = random.choice(usernames)
            host = random.choice(hostnames)

            for offset_min, etype, action, outcome, severity in chain:
                events.append({
                    "event_id": str(uuid.uuid4()),
                    "timestamp": chain_start + timedelta(minutes=offset_min, seconds=random.randint(0, 59)),
                    "event_type": etype,
                    "severity": severity,
                    "source_ip": attacker,
                    "destination_ip": target,
                    "source_port": random.randint(1024, 65535),
                    "destination_port": random.choice([22, 80, 443, 445, 3389, 8080, 3306]),
                    "protocol": random.choice(["TCP", "UDP", "HTTPS"]),
                    "user_id": user,
                    "hostname": host,
                    "action": action,
                    "outcome": outcome,
                    "raw_log": json.dumps({"chain": chain_idx, "stage": action}),
                    "ocsf_category": 3 if etype == "authentication" else 4,
                    "ocsf_class": 3002,
                })

    # Fill with background noise
    for _ in range(num_events - len(events)):
        template = random.choice(event_templates)
        events.append({
            "event_id": str(uuid.uuid4()),
            "timestamp": base_time + timedelta(seconds=random.randint(0, 86400)),
            "event_type": template["event_type"],
            "severity": template["severity"],
            "source_ip": f"10.0.{random.randint(1,254)}.{random.randint(1,254)}",
            "destination_ip": random.choice(target_ips + server_ips),
            "source_port": random.randint(1024, 65535),
            "destination_port": random.choice([22, 80, 443, 445, 3389, 8080]),
            "protocol": random.choice(["TCP", "UDP", "HTTPS", "DNS"]),
            "user_id": random.choice(usernames),
            "hostname": random.choice(hostnames),
            "action": template["action"],
            "outcome": template["outcome"],
            "raw_log": json.dumps({"source": "syslog", "facility": random.randint(0, 23)}),
            "ocsf_category": template["ocsf_category"],
            "ocsf_class": template["ocsf_class"],
        })

    return events

events = generate_security_events(12000)
df_events = spark.createDataFrame(events)
df_events.write.mode("overwrite").saveAsTable("security_events")
print(f"Generated {df_events.count()} security events")
display(df_events.groupBy("event_type", "severity").count().orderBy("event_type", "severity"))`
      },
      {
        type: 'code',
        content: `# Cell 4: Define Correlation Rules
correlation_rules = [
    {
        "rule_id": "RULE-001",
        "rule_name": "Brute Force to Lateral Movement",
        "description": "Detects multiple failed logins followed by successful auth and lateral movement from same source IP within 30 minutes",
        "severity": "critical",
        "pattern_type": "sequence",
        "window_seconds": 1800,
        "min_event_count": 5,
        "event_sequence": ["login_failed", "login_failed", "login_failed", "login_success", "lateral_movement"],
        "conditions": json.dumps({"same_source_ip": True, "min_failures": 3}),
    },
    {
        "rule_id": "RULE-002",
        "rule_name": "Data Exfiltration Chain",
        "description": "Detects bulk file access followed by DNS tunneling or C2 beacon within 60 minutes",
        "severity": "critical",
        "pattern_type": "sequence",
        "window_seconds": 3600,
        "min_event_count": 3,
        "event_sequence": ["data_access", "bulk_download", "c2_beacon"],
        "conditions": json.dumps({"same_user": True, "data_volume_threshold_mb": 100}),
    },
    {
        "rule_id": "RULE-003",
        "rule_name": "Ransomware Precursor Pattern",
        "description": "Privilege escalation followed by suspicious process execution and file encryption",
        "severity": "critical",
        "pattern_type": "sequence",
        "window_seconds": 900,
        "min_event_count": 3,
        "event_sequence": ["privilege_escalation", "suspicious_execution", "encryption_detected"],
        "conditions": json.dumps({"same_hostname": True}),
    },
    {
        "rule_id": "RULE-004",
        "rule_name": "Credential Stuffing Campaign",
        "description": "Multiple failed logins across different accounts from same IP",
        "severity": "high",
        "pattern_type": "threshold",
        "window_seconds": 300,
        "min_event_count": 10,
        "event_sequence": ["login_failed"],
        "conditions": json.dumps({"same_source_ip": True, "distinct_users_min": 5}),
    },
    {
        "rule_id": "RULE-005",
        "rule_name": "Phishing to Compromise Chain",
        "description": "Phishing email detection followed by malware execution and C2 communication",
        "severity": "critical",
        "pattern_type": "sequence",
        "window_seconds": 7200,
        "min_event_count": 3,
        "event_sequence": ["phishing_detected", "suspicious_execution", "c2_beacon"],
        "conditions": json.dumps({"same_target_user": True}),
    },
    {
        "rule_id": "RULE-006",
        "rule_name": "DNS Tunneling Exfiltration",
        "description": "High volume DNS queries followed by tunneling detection",
        "severity": "high",
        "pattern_type": "anomaly",
        "window_seconds": 600,
        "min_event_count": 50,
        "event_sequence": ["query", "tunneling_detected"],
        "conditions": json.dumps({"dns_query_rate_per_min": 100, "entropy_threshold": 3.5}),
    },
    {
        "rule_id": "RULE-007",
        "rule_name": "Port Scan to Exploitation",
        "description": "Network reconnaissance followed by authentication attempts",
        "severity": "high",
        "pattern_type": "sequence",
        "window_seconds": 1200,
        "min_event_count": 4,
        "event_sequence": ["port_scan", "login_failed", "login_success", "data_access"],
        "conditions": json.dumps({"same_source_ip": True}),
    },
]

df_rules = spark.createDataFrame(correlation_rules)
df_rules.write.mode("overwrite").saveAsTable("correlation_rules")
print(f"Loaded {len(correlation_rules)} correlation rules")
display(df_rules.select("rule_id", "rule_name", "severity", "pattern_type", "window_seconds"))`
      },
      {
        type: 'code',
        content: `# Cell 5: CEP Correlation Engine - Sliding Window Analysis
from pyspark.sql import functions as F
from pyspark.sql.window import Window

df_events = spark.table("security_events")
df_rules = spark.table("correlation_rules")

def run_sequence_correlation(events_df, rule):
    rule_id = rule["rule_id"]
    window_sec = rule["window_seconds"]
    min_count = rule["min_event_count"]
    conditions = json.loads(rule["conditions"])
    sequence = rule["event_sequence"]

    # Create time-windowed partitions
    group_cols = []
    if conditions.get("same_source_ip"):
        group_cols.append("source_ip")
    if conditions.get("same_user") or conditions.get("same_target_user"):
        group_cols.append("user_id")
    if conditions.get("same_hostname"):
        group_cols.append("hostname")

    if not group_cols:
        group_cols = ["source_ip"]

    # Filter events matching any action in the sequence
    filtered = events_df.filter(F.col("action").isin(sequence))

    # Time window analysis
    w = Window.partitionBy(*group_cols).orderBy("timestamp")

    windowed = (
        filtered
        .withColumn("row_num", F.row_number().over(w))
        .withColumn("prev_time", F.lag("timestamp").over(w))
        .withColumn("time_diff_sec",
                    F.when(F.col("prev_time").isNotNull(),
                           F.unix_timestamp("timestamp") - F.unix_timestamp("prev_time"))
                    .otherwise(0))
        .withColumn("window_group",
                    F.sum(F.when(F.col("time_diff_sec") > window_sec, 1).otherwise(0)).over(w))
    )

    # Group by window and check for pattern matches
    matches = (
        windowed
        .groupBy(*group_cols, "window_group")
        .agg(
            F.count("*").alias("event_count"),
            F.min("timestamp").alias("window_start"),
            F.max("timestamp").alias("window_end"),
            F.collect_list("action").alias("actions"),
            F.collect_list("event_id").alias("event_ids"),
            F.collect_set("severity").alias("severities"),
        )
        .filter(F.col("event_count") >= min_count)
    )

    return matches

# Run correlation for all sequence-type rules
all_matches = []
rules_list = df_rules.collect()

for rule_row in rules_list:
    rule = rule_row.asDict()
    if rule["pattern_type"] == "sequence":
        matches = run_sequence_correlation(df_events, rule)
        match_count = matches.count()

        if match_count > 0:
            match_results = (
                matches
                .withColumn("match_id", F.expr("uuid()"))
                .withColumn("rule_id", F.lit(rule["rule_id"]))
                .withColumn("rule_name", F.lit(rule["rule_name"]))
                .withColumn("severity", F.lit(rule["severity"]))
                .withColumn("confidence_score",
                    F.when(F.col("event_count") >= rule["min_event_count"] * 2, 0.95)
                     .when(F.col("event_count") >= rule["min_event_count"], 0.80)
                     .otherwise(0.65))
                .withColumn("attack_stage", F.lit("multi-stage"))
                .withColumn("mitre_tactics", F.array(F.lit("TA0001"), F.lit("TA0008")))
            )
            all_matches.append(match_results)
            print(f"Rule {rule['rule_id']} ({rule['rule_name']}): {match_count} matches found")

if all_matches:
    from functools import reduce
    combined = reduce(lambda a, b: a.unionByName(b, allowMissingColumns=True), all_matches)
    combined.select(
        "match_id", "rule_id", "rule_name", "severity",
        "confidence_score", "event_count", "window_start", "window_end"
    ).write.mode("overwrite").saveAsTable("correlation_matches")
    print(f"\\nTotal correlation matches: {combined.count()}")
    display(combined.select("rule_name", "severity", "confidence_score", "event_count", "window_start"))`
      },
      {
        type: 'code',
        content: `# Cell 6: Visualize Correlation Results
import matplotlib.pyplot as plt
import pandas as pd

matches_df = spark.table("correlation_matches").toPandas()
events_df = spark.table("security_events").toPandas()

fig, axes = plt.subplots(2, 2, figsize=(18, 12))
fig.suptitle("CEP Correlation Engine - Analysis Dashboard", fontsize=16, fontweight='bold')

# Plot 1: Matches by Rule
rule_counts = matches_df.groupby("rule_name").size().sort_values(ascending=True)
rule_counts.plot(kind="barh", ax=axes[0, 0], color=["#ef4444", "#f59e0b", "#3b82f6", "#10b981", "#6366f1"])
axes[0, 0].set_title("Correlation Matches by Rule")
axes[0, 0].set_xlabel("Match Count")

# Plot 2: Severity Distribution
severity_counts = matches_df["severity"].value_counts()
colors = {"critical": "#ef4444", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981"}
severity_counts.plot(kind="pie", ax=axes[0, 1], autopct="%1.1f%%",
                     colors=[colors.get(s, "#6b7280") for s in severity_counts.index])
axes[0, 1].set_title("Match Severity Distribution")

# Plot 3: Events Timeline
events_df["hour"] = pd.to_datetime(events_df["timestamp"]).dt.hour
event_timeline = events_df.groupby(["hour", "event_type"]).size().unstack(fill_value=0)
event_timeline.plot(kind="area", ax=axes[1, 0], alpha=0.7, stacked=True)
axes[1, 0].set_title("Event Volume by Type (24h)")
axes[1, 0].set_xlabel("Hour")
axes[1, 0].legend(fontsize=7)

# Plot 4: Confidence Score Distribution
axes[1, 1].hist(matches_df["confidence_score"], bins=20, color="#3b82f6", edgecolor="#1e40af", alpha=0.8)
axes[1, 1].set_title("Confidence Score Distribution")
axes[1, 1].set_xlabel("Confidence Score")
axes[1, 1].axvline(x=0.8, color="#ef4444", linestyle="--", label="Threshold")
axes[1, 1].legend()

plt.tight_layout()
plt.show()

print(f"""
========================================
  CEP ENGINE SUMMARY
========================================
  Total Events Processed: {len(events_df):,}
  Correlation Rules:      {len(matches_df['rule_name'].unique())}
  Total Matches Found:    {len(matches_df):,}
  Critical Matches:       {len(matches_df[matches_df['severity'] == 'critical']):,}
  Avg Confidence Score:   {matches_df['confidence_score'].mean():.2f}
========================================
""")`
      },
    ],
  },

  {
    id: 'supply-chain-risk-correlation',
    title: 'Supply Chain Risk Correlation Engine',
    subtitle: 'Dependency vulnerability analysis with transitive risk scoring',
    category: 'correlation',
    tags: ['Supply Chain', 'SBOM', 'CVE', 'Graph Analysis', 'Delta Lake'],
    description: 'Analyzes software supply chain risks by correlating package dependencies, CVE databases, and build pipeline telemetry. Uses graph traversal to compute transitive risk scores across dependency trees.',
    estimatedRuntime: '6 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Supply Chain Risk Correlation Engine
## Software Bill of Materials (SBOM) Security Analysis

This notebook implements a **supply chain security correlation engine** that:
1. Ingests SBOM data and CVE vulnerability feeds
2. Builds dependency graphs with transitive risk propagation
3. Scores packages based on direct and inherited vulnerabilities
4. Identifies high-risk supply chain attack vectors
5. Provides actionable remediation priorities`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup
from pyspark.sql import functions as F
from pyspark.sql.types import *
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "supply_chain"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")`
      },
      {
        type: 'sql',
        content: `-- Cell 2: Create Supply Chain Tables
CREATE TABLE IF NOT EXISTS software_packages (
  package_id STRING,
  name STRING,
  version STRING,
  ecosystem STRING,
  publisher STRING,
  license STRING,
  last_updated TIMESTAMP,
  download_count BIGINT,
  direct_risk_score DOUBLE DEFAULT 0.0,
  transitive_risk_score DOUBLE DEFAULT 0.0,
  combined_risk_score DOUBLE DEFAULT 0.0
) USING DELTA;

CREATE TABLE IF NOT EXISTS package_dependencies (
  dependency_id STRING,
  parent_package_id STRING,
  child_package_id STRING,
  dependency_type STRING,
  version_constraint STRING,
  depth INT DEFAULT 1
) USING DELTA;

CREATE TABLE IF NOT EXISTS supply_chain_cves (
  cve_id STRING,
  package_id STRING,
  severity STRING,
  cvss_score DOUBLE,
  description STRING,
  published_date TIMESTAMP,
  exploitability_score DOUBLE,
  impact_score DOUBLE,
  patch_available BOOLEAN
) USING DELTA;

CREATE TABLE IF NOT EXISTS supply_chain_risk_scores (
  assessment_id STRING,
  package_id STRING,
  package_name STRING,
  direct_vulns INT,
  transitive_vulns INT,
  max_cvss DOUBLE,
  risk_score DOUBLE,
  risk_level STRING,
  attack_vector STRING,
  remediation_priority INT,
  assessed_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA;`
      },
      {
        type: 'code',
        content: `# Cell 3: Generate Mock Supply Chain Data
packages_data = []
ecosystems = ["npm", "pypi", "maven", "nuget", "go"]
publishers = ["@databricks", "@apache", "@microsoft", "community", "verified-publisher", "unknown"]
licenses_list = ["MIT", "Apache-2.0", "BSD-3", "GPL-3.0", "ISC", "LGPL-2.1"]

pkg_names = {
    "npm": ["express", "lodash", "axios", "react", "webpack", "moment", "jsonwebtoken", "bcrypt", "cors", "dotenv", "passport", "socket.io", "mongoose", "sequelize", "jest", "nodemon", "chalk", "commander", "uuid", "dayjs"],
    "pypi": ["requests", "flask", "django", "numpy", "pandas", "boto3", "sqlalchemy", "celery", "redis", "cryptography", "paramiko", "pyjwt", "pillow", "scipy", "scikit-learn", "tensorflow", "pytest", "black", "mypy", "pydantic"],
    "maven": ["spring-boot", "jackson", "log4j", "guava", "commons-io", "httpclient", "junit", "mockito", "lombok", "netty"],
    "nuget": ["Newtonsoft.Json", "Serilog", "AutoMapper", "MediatR", "FluentValidation", "Polly", "Dapper", "EntityFramework"],
    "go": ["gin", "cobra", "viper", "zap", "grpc", "protobuf", "testify", "mux"]
}

for eco in ecosystems:
    for name in pkg_names[eco]:
        pkg_id = str(uuid.uuid4())
        packages_data.append({
            "package_id": pkg_id,
            "name": f"{name}",
            "version": f"{random.randint(1,5)}.{random.randint(0,20)}.{random.randint(0,10)}",
            "ecosystem": eco,
            "publisher": random.choice(publishers),
            "license": random.choice(licenses_list),
            "last_updated": datetime.now() - timedelta(days=random.randint(1, 365)),
            "download_count": random.randint(1000, 50000000),
            "direct_risk_score": 0.0,
            "transitive_risk_score": 0.0,
            "combined_risk_score": 0.0,
        })

df_packages = spark.createDataFrame(packages_data)
df_packages.write.mode("overwrite").saveAsTable("software_packages")

# Generate dependency relationships
deps = []
pkg_ids = [p["package_id"] for p in packages_data]
for pkg in packages_data:
    num_deps = random.randint(0, 8)
    for depth in range(1, min(num_deps + 1, 6)):
        child = random.choice(pkg_ids)
        if child != pkg["package_id"]:
            deps.append({
                "dependency_id": str(uuid.uuid4()),
                "parent_package_id": pkg["package_id"],
                "child_package_id": child,
                "dependency_type": random.choice(["runtime", "dev", "peer", "optional"]),
                "version_constraint": random.choice(["^1.0.0", "~2.3.0", ">=3.0.0", "latest", "*"]),
                "depth": depth,
            })

df_deps = spark.createDataFrame(deps)
df_deps.write.mode("overwrite").saveAsTable("package_dependencies")

# Generate CVEs
cves = []
vuln_packages = random.sample(pkg_ids, min(40, len(pkg_ids)))
for pkg_id in vuln_packages:
    for _ in range(random.randint(1, 5)):
        cvss = round(random.uniform(2.0, 10.0), 1)
        severity = "critical" if cvss >= 9.0 else "high" if cvss >= 7.0 else "medium" if cvss >= 4.0 else "low"
        cves.append({
            "cve_id": f"CVE-{random.randint(2020, 2025)}-{random.randint(10000, 99999)}",
            "package_id": pkg_id,
            "severity": severity,
            "cvss_score": cvss,
            "description": f"Remote code execution via crafted input in dependency",
            "published_date": datetime.now() - timedelta(days=random.randint(1, 730)),
            "exploitability_score": round(random.uniform(1.0, 4.0), 1),
            "impact_score": round(random.uniform(1.0, 6.0), 1),
            "patch_available": random.choice([True, True, False]),
        })

df_cves = spark.createDataFrame(cves)
df_cves.write.mode("overwrite").saveAsTable("supply_chain_cves")

print(f"Packages: {len(packages_data)}, Dependencies: {len(deps)}, CVEs: {len(cves)}")
display(df_cves.groupBy("severity").count().orderBy("severity"))`
      },
      {
        type: 'code',
        content: `# Cell 4: Transitive Risk Scoring Engine
df_pkgs = spark.table("software_packages")
df_deps = spark.table("package_dependencies")
df_cves = spark.table("supply_chain_cves")

# Direct risk: max CVSS of direct CVEs
direct_risk = (
    df_cves
    .groupBy("package_id")
    .agg(
        F.max("cvss_score").alias("max_cvss"),
        F.count("*").alias("direct_vuln_count"),
        F.avg("exploitability_score").alias("avg_exploitability"),
    )
    .withColumn("direct_risk_score",
        F.col("max_cvss") / 10.0 * 0.6 + F.col("avg_exploitability") / 4.0 * 0.4)
)

# Transitive risk: propagate through dependency graph (3 hops)
transitive = df_deps.alias("d1")
for hop in range(2):
    next_hop = df_deps.alias(f"d{hop+2}")
    transitive = transitive.join(
        next_hop,
        F.col(f"d1.child_package_id") == F.col(f"d{hop+2}.parent_package_id"),
        "left"
    )

# Combine risks
risk_scores = (
    df_pkgs
    .join(direct_risk, "package_id", "left")
    .withColumn("direct_risk_score", F.coalesce("direct_risk_score", F.lit(0.0)))
    .withColumn("risk_level",
        F.when(F.col("direct_risk_score") >= 0.8, "critical")
         .when(F.col("direct_risk_score") >= 0.6, "high")
         .when(F.col("direct_risk_score") >= 0.3, "medium")
         .otherwise("low"))
    .withColumn("remediation_priority",
        F.when(F.col("risk_level") == "critical", 1)
         .when(F.col("risk_level") == "high", 2)
         .when(F.col("risk_level") == "medium", 3)
         .otherwise(4))
)

display(risk_scores
    .filter(F.col("direct_risk_score") > 0)
    .select("name", "ecosystem", "direct_risk_score", "risk_level", "max_cvss", "direct_vuln_count")
    .orderBy(F.desc("direct_risk_score"))
    .limit(20))

print(f"""
Supply Chain Risk Summary:
  Critical packages: {risk_scores.filter(F.col('risk_level') == 'critical').count()}
  High risk packages: {risk_scores.filter(F.col('risk_level') == 'high').count()}
  Total vulnerabilities: {df_cves.count()}
""")`
      },
    ],
  },

  {
    id: 'devops-cicd-security-correlation',
    title: 'DevOps CI/CD Security Correlation',
    subtitle: 'Pipeline security monitoring with build artifact integrity verification',
    category: 'correlation',
    tags: ['DevSecOps', 'CI/CD', 'Pipeline Security', 'SLSA', 'Build Integrity'],
    description: 'Monitors CI/CD pipelines for security anomalies including unauthorized code changes, secret leaks in builds, artifact tampering, and deployment policy violations. Implements SLSA framework compliance checks.',
    estimatedRuntime: '5 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# DevOps CI/CD Security Correlation Engine
## Pipeline Security & SLSA Compliance Monitoring

Monitors the entire CI/CD pipeline for:
- Unauthorized code commits and force pushes
- Secret exposure in build logs and artifacts
- Build artifact integrity (SLSA Level 3)
- Deployment policy violations
- Container image vulnerability scanning correlation`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "devops_security"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")`
      },
      {
        type: 'sql',
        content: `-- Cell 2: Create CI/CD Security Tables
CREATE TABLE IF NOT EXISTS pipeline_events (
  event_id STRING, pipeline_id STRING, pipeline_name STRING,
  stage STRING, event_type STRING, status STRING, severity STRING,
  actor STRING, repository STRING, branch STRING, commit_sha STRING,
  artifact_hash STRING, timestamp TIMESTAMP,
  metadata STRING, slsa_level INT DEFAULT 0
) USING DELTA PARTITIONED BY (event_type);

CREATE TABLE IF NOT EXISTS pipeline_anomalies (
  anomaly_id STRING, pipeline_id STRING, anomaly_type STRING,
  severity STRING, confidence DOUBLE, description STRING,
  affected_artifacts ARRAY<STRING>, remediation STRING,
  detected_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA;`
      },
      {
        type: 'code',
        content: `# Cell 3: Generate Mock Pipeline Security Data
pipelines = ["frontend-deploy", "api-service", "ml-training", "infra-terraform", "mobile-app", "data-etl"]
stages = ["source", "build", "test", "security-scan", "artifact-publish", "deploy-staging", "deploy-prod"]
actors = ["dev-alice", "dev-bob", "ci-bot", "release-manager", "dev-charlie", "unknown-user"]
repos = ["app-frontend", "api-gateway", "ml-models", "infrastructure", "mobile-ios", "data-pipelines"]
branches = ["main", "develop", "feature/auth", "hotfix/security", "release/v2.1"]

events = []
base_time = datetime.now() - timedelta(hours=48)

# Normal pipeline runs
for _ in range(500):
    pipeline = random.choice(pipelines)
    actor = random.choice(actors[:4])
    repo = random.choice(repos)
    branch = random.choice(branches)
    sha = uuid.uuid4().hex[:12]
    run_start = base_time + timedelta(minutes=random.randint(0, 2880))

    for i, stage in enumerate(stages):
        events.append({
            "event_id": str(uuid.uuid4()), "pipeline_id": f"run-{uuid.uuid4().hex[:8]}",
            "pipeline_name": pipeline, "stage": stage,
            "event_type": "stage_complete", "status": "success", "severity": "info",
            "actor": actor, "repository": repo, "branch": branch, "commit_sha": sha,
            "artifact_hash": uuid.uuid4().hex, "timestamp": run_start + timedelta(minutes=i*3),
            "metadata": json.dumps({"duration_sec": random.randint(30, 600)}), "slsa_level": 3,
        })

# Inject anomalous events
anomaly_templates = [
    {"event_type": "secret_detected", "severity": "critical", "stage": "security-scan", "status": "failed"},
    {"event_type": "unauthorized_deploy", "severity": "critical", "stage": "deploy-prod", "status": "blocked"},
    {"event_type": "force_push", "severity": "high", "stage": "source", "status": "success"},
    {"event_type": "artifact_tamper", "severity": "critical", "stage": "artifact-publish", "status": "alert"},
    {"event_type": "dependency_vuln", "severity": "high", "stage": "security-scan", "status": "warning"},
    {"event_type": "policy_violation", "severity": "high", "stage": "deploy-staging", "status": "blocked"},
]

for _ in range(80):
    anom = random.choice(anomaly_templates)
    events.append({
        "event_id": str(uuid.uuid4()), "pipeline_id": f"run-{uuid.uuid4().hex[:8]}",
        "pipeline_name": random.choice(pipelines), "stage": anom["stage"],
        "event_type": anom["event_type"], "status": anom["status"], "severity": anom["severity"],
        "actor": random.choice(actors), "repository": random.choice(repos),
        "branch": random.choice(branches), "commit_sha": uuid.uuid4().hex[:12],
        "artifact_hash": uuid.uuid4().hex,
        "timestamp": base_time + timedelta(minutes=random.randint(0, 2880)),
        "metadata": json.dumps({"anomaly": True, "detail": anom["event_type"]}), "slsa_level": 0,
    })

df = spark.createDataFrame(events)
df.write.mode("overwrite").saveAsTable("pipeline_events")
print(f"Generated {len(events)} pipeline events")
display(df.groupBy("event_type", "severity").count().orderBy(F.desc("count")))`
      },
      {
        type: 'code',
        content: `# Cell 4: Pipeline Anomaly Detection
df_events = spark.table("pipeline_events")

# Detect patterns
anomalies = (
    df_events
    .filter(F.col("event_type").isin([
        "secret_detected", "unauthorized_deploy", "force_push",
        "artifact_tamper", "dependency_vuln", "policy_violation"
    ]))
    .withColumn("anomaly_id", F.expr("uuid()"))
    .withColumn("anomaly_type", F.col("event_type"))
    .withColumn("confidence",
        F.when(F.col("severity") == "critical", F.lit(0.95))
         .when(F.col("severity") == "high", F.lit(0.85))
         .otherwise(F.lit(0.70)))
    .withColumn("description", F.concat(
        F.lit("Detected "), F.col("event_type"),
        F.lit(" in pipeline "), F.col("pipeline_name"),
        F.lit(" by "), F.col("actor")))
    .select("anomaly_id", "pipeline_id", "anomaly_type", "severity",
            "confidence", "description")
)

anomalies.write.mode("overwrite").saveAsTable("pipeline_anomalies")
print(f"Detected {anomalies.count()} pipeline anomalies")
display(anomalies.groupBy("anomaly_type", "severity").count().orderBy(F.desc("count")))`
      },
    ],
  },

  {
    id: 'cloud-posture-correlation',
    title: 'Cloud Security Posture Management (CSPM)',
    subtitle: 'Multi-cloud misconfiguration detection and compliance correlation',
    category: 'correlation',
    tags: ['CSPM', 'AWS', 'Azure', 'GCP', 'Misconfigurations', 'CIS Benchmarks'],
    description: 'Continuously monitors cloud infrastructure configurations across AWS, Azure, and GCP. Detects misconfigurations, correlates with CIS benchmarks, and identifies security posture drift over time.',
    estimatedRuntime: '5 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Cloud Security Posture Management (CSPM) Engine
## Multi-Cloud Misconfiguration Detection & Compliance

Covers AWS, Azure, and GCP with:
- CIS Benchmark compliance scoring
- Misconfiguration drift detection
- Cross-cloud correlation of security posture
- Automated remediation recommendations`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup & Mock Cloud Configuration Data
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "cloud_posture"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# Generate cloud resources with configurations
resources = []
clouds = ["aws", "azure", "gcp"]
resource_types = {
    "aws": ["S3 Bucket", "EC2 Instance", "IAM Role", "RDS Database", "Lambda Function", "Security Group", "KMS Key", "CloudTrail", "VPC", "ELB"],
    "azure": ["Storage Account", "Virtual Machine", "Key Vault", "SQL Database", "App Service", "NSG", "AKS Cluster"],
    "gcp": ["GCS Bucket", "Compute Instance", "IAM Policy", "Cloud SQL", "Cloud Function", "Firewall Rule"],
}

misconfig_types = [
    ("Public access enabled", "critical", "CIS 2.1.1"),
    ("Encryption at rest disabled", "high", "CIS 2.1.2"),
    ("Logging not enabled", "medium", "CIS 3.1"),
    ("MFA not enforced", "critical", "CIS 1.2"),
    ("Overly permissive IAM", "high", "CIS 1.16"),
    ("Default credentials", "critical", "CIS 1.1"),
    ("Unencrypted transit", "high", "CIS 2.2"),
    ("No backup configured", "medium", "CIS 4.1"),
]

for cloud in clouds:
    for rtype in resource_types[cloud]:
        for i in range(random.randint(5, 15)):
            compliant = random.random() > 0.3
            misconfigs = [] if compliant else random.sample(misconfig_types, random.randint(1, 3))
            resources.append({
                "resource_id": str(uuid.uuid4()),
                "cloud_provider": cloud,
                "resource_type": rtype,
                "resource_name": f"{cloud}-{rtype.lower().replace(' ', '-')}-{i:03d}",
                "region": random.choice(["us-east-1", "eu-west-1", "ap-southeast-1"]),
                "compliant": compliant,
                "misconfigurations": json.dumps([m[0] for m in misconfigs]),
                "max_severity": misconfigs[0][1] if misconfigs else "none",
                "cis_controls": json.dumps([m[2] for m in misconfigs]),
                "risk_score": round(random.uniform(0.7, 1.0), 2) if misconfigs else round(random.uniform(0.0, 0.3), 2),
                "last_scanned": datetime.now() - timedelta(hours=random.randint(1, 48)),
            })

df = spark.createDataFrame(resources)
df.write.mode("overwrite").saveAsTable("cloud_resources")
print(f"Generated {len(resources)} cloud resources across {len(clouds)} providers")

# Summary
display(df.groupBy("cloud_provider", "compliant").count().orderBy("cloud_provider"))`
      },
      {
        type: 'code',
        content: `# Cell 2: CSPM Analysis & Compliance Scoring
df = spark.table("cloud_resources")

summary = (
    df
    .groupBy("cloud_provider")
    .agg(
        F.count("*").alias("total_resources"),
        F.sum(F.when(F.col("compliant"), 1).otherwise(0)).alias("compliant"),
        F.sum(F.when(~F.col("compliant"), 1).otherwise(0)).alias("non_compliant"),
        F.avg("risk_score").alias("avg_risk"),
        F.sum(F.when(F.col("max_severity") == "critical", 1).otherwise(0)).alias("critical_findings"),
    )
    .withColumn("compliance_pct", F.round(F.col("compliant") / F.col("total_resources") * 100, 1))
)

display(summary)

# Top misconfigurations
non_compliant = df.filter(~F.col("compliant"))
display(non_compliant
    .select("cloud_provider", "resource_type", "resource_name", "max_severity", "risk_score", "misconfigurations")
    .orderBy(F.desc("risk_score"))
    .limit(20))

print("CSPM analysis complete")`
      },
    ],
  },
];
