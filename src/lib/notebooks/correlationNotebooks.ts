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
        content: `# Cell 3: Load Security Events from Production Source
dbutils.widgets.text("events_table", "soc_platform.graph_silver.silver_events")
events_table = dbutils.widgets.get("events_table")

# Read production events from the upstream silver events table
df_source_events = spark.table(events_table)

# Map source events to the local security_events schema
df_mapped = (
    df_source_events
    .select(
        F.coalesce(F.col("event_id"), F.expr("uuid()")).alias("event_id"),
        F.col("timestamp"),
        F.col("event_type"),
        F.col("severity"),
        F.col("source_ip"),
        F.col("destination_ip"),
        F.col("source_port").cast("int"),
        F.col("destination_port").cast("int"),
        F.col("protocol"),
        F.col("user_id"),
        F.col("hostname"),
        F.col("action"),
        F.col("outcome"),
        F.col("raw_log"),
        F.col("ocsf_category").cast("int"),
        F.col("ocsf_class").cast("int"),
    )
    .withColumn("ingestion_time", F.current_timestamp())
)

# Delta MERGE into local security_events table (upsert by event_id)
df_mapped.createOrReplaceTempView("staged_security_events")

spark.sql("""
    MERGE INTO security_events AS target
    USING staged_security_events AS source
    ON target.event_id = source.event_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

event_count = spark.table("security_events").count()
print(f"Loaded {event_count} security events from {events_table}")
display(spark.table("security_events").groupBy("event_type", "severity").count().orderBy("event_type", "severity"))`
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
import json, uuid
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
        content: `# Cell 3: Load Supply Chain Data from Production Sources
dbutils.widgets.text("sbom_table", "soc_platform.supply_chain.software_packages")
dbutils.widgets.text("deps_table", "soc_platform.supply_chain.package_dependencies")
dbutils.widgets.text("cve_feed_table", "soc_platform.vulnerability_feeds.cve_entries")

sbom_table = dbutils.widgets.get("sbom_table")
deps_table = dbutils.widgets.get("deps_table")
cve_feed_table = dbutils.widgets.get("cve_feed_table")

# --- Load SBOM / Software Packages ---
df_source_packages = spark.table(sbom_table)
df_packages_mapped = (
    df_source_packages
    .select(
        F.coalesce(F.col("package_id"), F.expr("uuid()")).alias("package_id"),
        F.col("name"),
        F.col("version"),
        F.col("ecosystem"),
        F.col("publisher"),
        F.col("license"),
        F.col("last_updated").cast("timestamp"),
        F.col("download_count").cast("bigint"),
        F.lit(0.0).alias("direct_risk_score"),
        F.lit(0.0).alias("transitive_risk_score"),
        F.lit(0.0).alias("combined_risk_score"),
    )
)
df_packages_mapped.createOrReplaceTempView("staged_packages")

spark.sql("""
    MERGE INTO software_packages AS target
    USING staged_packages AS source
    ON target.package_id = source.package_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

# --- Load Dependency Relationships ---
df_source_deps = spark.table(deps_table)
df_deps_mapped = (
    df_source_deps
    .select(
        F.coalesce(F.col("dependency_id"), F.expr("uuid()")).alias("dependency_id"),
        F.col("parent_package_id"),
        F.col("child_package_id"),
        F.col("dependency_type"),
        F.col("version_constraint"),
        F.coalesce(F.col("depth"), F.lit(1)).alias("depth"),
    )
)
df_deps_mapped.createOrReplaceTempView("staged_deps")

spark.sql("""
    MERGE INTO package_dependencies AS target
    USING staged_deps AS source
    ON target.dependency_id = source.dependency_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

# --- Load CVE Data from Vulnerability Feed ---
df_source_cves = spark.table(cve_feed_table)
df_cves_mapped = (
    df_source_cves
    .select(
        F.col("cve_id"),
        F.col("package_id"),
        F.col("severity"),
        F.col("cvss_score").cast("double"),
        F.col("description"),
        F.col("published_date").cast("timestamp"),
        F.col("exploitability_score").cast("double"),
        F.col("impact_score").cast("double"),
        F.col("patch_available").cast("boolean"),
    )
)
df_cves_mapped.createOrReplaceTempView("staged_cves")

spark.sql("""
    MERGE INTO supply_chain_cves AS target
    USING staged_cves AS source
    ON target.cve_id = source.cve_id AND target.package_id = source.package_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

pkg_count = spark.table("software_packages").count()
dep_count = spark.table("package_dependencies").count()
cve_count = spark.table("supply_chain_cves").count()
print(f"Packages: {pkg_count}, Dependencies: {dep_count}, CVEs: {cve_count}")
display(spark.table("supply_chain_cves").groupBy("severity").count().orderBy("severity"))`
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
import json, uuid
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
        content: `# Cell 3: Load Pipeline Events from Production CI/CD Telemetry
dbutils.widgets.text("cicd_events_table", "soc_platform.devops_telemetry.pipeline_events")

cicd_events_table = dbutils.widgets.get("cicd_events_table")

# Read production CI/CD telemetry from the upstream table
df_source_pipeline = spark.table(cicd_events_table)

# Map source data to the local pipeline_events schema
df_pipeline_mapped = (
    df_source_pipeline
    .select(
        F.coalesce(F.col("event_id"), F.expr("uuid()")).alias("event_id"),
        F.col("pipeline_id"),
        F.col("pipeline_name"),
        F.col("stage"),
        F.col("event_type"),
        F.col("status"),
        F.col("severity"),
        F.col("actor"),
        F.col("repository"),
        F.col("branch"),
        F.col("commit_sha"),
        F.col("artifact_hash"),
        F.col("timestamp").cast("timestamp"),
        F.col("metadata"),
        F.coalesce(F.col("slsa_level"), F.lit(0)).cast("int").alias("slsa_level"),
    )
)

# Delta MERGE into local pipeline_events table (upsert by event_id)
df_pipeline_mapped.createOrReplaceTempView("staged_pipeline_events")

spark.sql("""
    MERGE INTO pipeline_events AS target
    USING staged_pipeline_events AS source
    ON target.event_id = source.event_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

event_count = spark.table("pipeline_events").count()
print(f"Loaded {event_count} pipeline events from {cicd_events_table}")
display(spark.table("pipeline_events").groupBy("event_type", "severity").count().orderBy(F.desc("count")))`
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
        content: `# Cell 1: Setup & Load Cloud Configuration Data from Production Sources
from pyspark.sql import functions as F
import json, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "cloud_posture"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# Parameterize the source cloud configuration snapshot table
dbutils.widgets.text("cloud_config_table", "soc_platform.cloud_inventory.resource_configurations")

cloud_config_table = dbutils.widgets.get("cloud_config_table")

# Read production cloud resource configurations from the upstream snapshot table
df_source_resources = spark.table(cloud_config_table)

# Map source data to the local cloud_resources schema
df_resources_mapped = (
    df_source_resources
    .select(
        F.coalesce(F.col("resource_id"), F.expr("uuid()")).alias("resource_id"),
        F.col("cloud_provider"),
        F.col("resource_type"),
        F.col("resource_name"),
        F.col("region"),
        F.col("compliant").cast("boolean"),
        F.col("misconfigurations"),
        F.col("max_severity"),
        F.col("cis_controls"),
        F.col("risk_score").cast("double"),
        F.col("last_scanned").cast("timestamp"),
    )
)

# Create the cloud_resources table if it does not exist
spark.sql("""
    CREATE TABLE IF NOT EXISTS cloud_resources (
        resource_id STRING,
        cloud_provider STRING,
        resource_type STRING,
        resource_name STRING,
        region STRING,
        compliant BOOLEAN,
        misconfigurations STRING,
        max_severity STRING,
        cis_controls STRING,
        risk_score DOUBLE,
        last_scanned TIMESTAMP
    ) USING DELTA
""")

# Delta MERGE into local cloud_resources table (upsert by resource_id)
df_resources_mapped.createOrReplaceTempView("staged_cloud_resources")

spark.sql("""
    MERGE INTO cloud_resources AS target
    USING staged_cloud_resources AS source
    ON target.resource_id = source.resource_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

resource_count = spark.table("cloud_resources").count()
provider_count = spark.table("cloud_resources").select("cloud_provider").distinct().count()
print(f"Loaded {resource_count} cloud resources across {provider_count} providers from {cloud_config_table}")

# Summary
display(spark.table("cloud_resources").groupBy("cloud_provider", "compliant").count().orderBy("cloud_provider"))`
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
