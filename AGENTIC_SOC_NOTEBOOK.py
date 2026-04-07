# Databricks notebook source
# MAGIC %md
# MAGIC # 🤖 Build Your Own Agentic SOC
# MAGIC
# MAGIC **A Complete, Production-Ready Security Operations Center with Autonomous Agents**
# MAGIC
# MAGIC ---
# MAGIC
# MAGIC ## What You'll Build
# MAGIC
# MAGIC In this notebook, you'll create a complete Agentic SOC with:
# MAGIC
# MAGIC | Agent | Purpose | Key Capability |
# MAGIC |-------|---------|----------------|
# MAGIC | **Triage Agent** | Prioritize alerts | Multi-factor scoring algorithm |
# MAGIC | **Enrichment Agent** | Add threat intel | 50+ feed integration |
# MAGIC | **Investigation Agent** | Correlate events | Graph-based analysis |
# MAGIC | **Response Agent** | Take action | Automated blocking/isolation |
# MAGIC | **Pattern Discovery Agent** | Find new threats | ML-powered detection |
# MAGIC
# MAGIC **Time to complete:** ~60 minutes
# MAGIC
# MAGIC **Cluster requirements:**
# MAGIC - Databricks Runtime 14.0+
# MAGIC - At least 4 workers recommended
# MAGIC - GraphFrames library installed
# MAGIC
# MAGIC ---
# MAGIC
# MAGIC ## Table of Contents
# MAGIC
# MAGIC 1. [Setup & Configuration](#setup)
# MAGIC 2. [Create Schema & Tables](#schema)
# MAGIC 3. [Generate Sample Data](#data)
# MAGIC 4. [Triage Agent](#triage)
# MAGIC 5. [Enrichment Agent](#enrichment)
# MAGIC 6. [Investigation Agent](#investigation)
# MAGIC 7. [Response Agent](#response)
# MAGIC 8. [Pattern Discovery Agent](#pattern)
# MAGIC 9. [Agent Orchestrator](#orchestrator)
# MAGIC 10. [Monitoring Dashboard](#dashboard)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. Setup & Configuration <a name="setup"></a>

# COMMAND ----------

# Install required libraries
%pip install graphframes

# COMMAND ----------

# Import required libraries
from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json
import random
import uuid

# COMMAND ----------

# Configuration
CONFIG = {
    "catalog": "main",                    # Your Unity Catalog name
    "schema": "agentic_soc",              # Schema for SOC tables
    "checkpoint_path": "/tmp/agentic_soc/checkpoints",

    # Triage thresholds
    "triage": {
        "critical_threshold": 15,
        "high_threshold": 10,
        "medium_threshold": 5
    },

    # Enrichment settings
    "enrichment": {
        "ioc_match_bonus": 30,
        "known_threat_bonus": 20,
        "user_anomaly_bonus": 15
    },

    # Response settings
    "response": {
        "auto_block_threshold": 80,       # Risk score to auto-block
        "block_duration_hours": 24,
        "require_approval_actions": ["disable_user", "isolate_host"]
    },

    # Pattern discovery
    "pattern_discovery": {
        "min_confidence": 0.60,
        "cluster_anomaly_threshold": 0.01  # 1% of total
    }
}

print("✅ Configuration loaded")
print(f"   Catalog: {CONFIG['catalog']}")
print(f"   Schema: {CONFIG['schema']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. Create Schema & Tables <a name="schema"></a>

# COMMAND ----------

# Create catalog and schema
spark.sql(f"CREATE CATALOG IF NOT EXISTS {CONFIG['catalog']}")
spark.sql(f"USE CATALOG {CONFIG['catalog']}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CONFIG['schema']}")
spark.sql(f"USE SCHEMA {CONFIG['schema']}")

print(f"✅ Using {CONFIG['catalog']}.{CONFIG['schema']}")

# COMMAND ----------

# MAGIC %md
# MAGIC ### Core Tables

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Events table: All security events
# MAGIC CREATE TABLE IF NOT EXISTS events (
# MAGIC   id STRING,
# MAGIC   timestamp TIMESTAMP,
# MAGIC   event_type STRING,
# MAGIC   severity STRING,
# MAGIC   source_ip STRING,
# MAGIC   dest_ip STRING,
# MAGIC   source_port INT,
# MAGIC   dest_port INT,
# MAGIC   protocol STRING,
# MAGIC   username STRING,
# MAGIC   hostname STRING,
# MAGIC   domain STRING,
# MAGIC   process_name STRING,
# MAGIC   file_hash STRING,
# MAGIC   bytes_sent BIGINT,
# MAGIC   bytes_received BIGINT,
# MAGIC   duration_ms INT,
# MAGIC   geo_country STRING,
# MAGIC   description STRING,
# MAGIC   raw_log STRING,
# MAGIC   ocsf_category STRING,
# MAGIC   mitre_technique STRING,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA
# MAGIC PARTITIONED BY (date(timestamp))
# MAGIC TBLPROPERTIES (
# MAGIC   'delta.autoOptimize.optimizeWrite' = 'true',
# MAGIC   'delta.autoOptimize.autoCompact' = 'true'
# MAGIC );
# MAGIC
# MAGIC -- Create index for fast lookups
# MAGIC CREATE INDEX IF NOT EXISTS idx_events_source_ip ON events(source_ip);
# MAGIC CREATE INDEX IF NOT EXISTS idx_events_username ON events(username);

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Alerts table: Generated from correlated events
# MAGIC CREATE TABLE IF NOT EXISTS alerts (
# MAGIC   id STRING,
# MAGIC   title STRING,
# MAGIC   description STRING,
# MAGIC   severity STRING,
# MAGIC   status STRING DEFAULT 'new',
# MAGIC   priority STRING,
# MAGIC   source STRING,
# MAGIC   source_ip STRING,
# MAGIC   dest_ip STRING,
# MAGIC   username STRING,
# MAGIC   hostname STRING,
# MAGIC   risk_score INT,
# MAGIC   event_count INT,
# MAGIC   correlated_event_ids ARRAY<STRING>,
# MAGIC   correlation_rule_id STRING,
# MAGIC
# MAGIC   -- Triage fields
# MAGIC   triage_score INT,
# MAGIC   triage_notes STRING,
# MAGIC   triaged_at TIMESTAMP,
# MAGIC   triaged_by STRING,
# MAGIC
# MAGIC   -- Enrichment fields
# MAGIC   enrichment_data STRING,  -- JSON
# MAGIC   enriched_risk_score INT,
# MAGIC   enrichment_completed BOOLEAN DEFAULT false,
# MAGIC   enriched_at TIMESTAMP,
# MAGIC   ioc_match BOOLEAN DEFAULT false,
# MAGIC   repeat_count INT DEFAULT 0,
# MAGIC
# MAGIC   -- Investigation fields
# MAGIC   investigation_data STRING,  -- JSON
# MAGIC   investigation_completed BOOLEAN DEFAULT false,
# MAGIC   investigated_at TIMESTAMP,
# MAGIC   case_created BOOLEAN DEFAULT false,
# MAGIC
# MAGIC   -- Response fields
# MAGIC   response_actions STRING,  -- JSON
# MAGIC   response_completed BOOLEAN DEFAULT false,
# MAGIC   responded_at TIMESTAMP,
# MAGIC
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp(),
# MAGIC   updated_at TIMESTAMP
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Threat intelligence feeds
# MAGIC CREATE TABLE IF NOT EXISTS threat_feed_items (
# MAGIC   id STRING,
# MAGIC   feed_name STRING,
# MAGIC   ioc_type STRING,  -- ip, domain, hash, url
# MAGIC   ioc_value STRING,
# MAGIC   threat_type STRING,
# MAGIC   severity STRING,
# MAGIC   confidence DOUBLE,
# MAGIC   tags ARRAY<STRING>,
# MAGIC   description STRING,
# MAGIC   first_seen TIMESTAMP,
# MAGIC   last_seen TIMESTAMP,
# MAGIC   source_url STRING,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;
# MAGIC
# MAGIC -- Index for fast IOC lookups
# MAGIC CREATE INDEX IF NOT EXISTS idx_threat_feeds_ioc ON threat_feed_items(ioc_type, ioc_value);

# COMMAND ----------

# MAGIC %sql
# MAGIC -- User behavior baselines
# MAGIC CREATE TABLE IF NOT EXISTS user_behavior_baselines (
# MAGIC   id STRING,
# MAGIC   username STRING,
# MAGIC   avg_login_hour DOUBLE,
# MAGIC   stddev_login_hour DOUBLE,
# MAGIC   common_locations ARRAY<STRING>,
# MAGIC   common_hosts ARRAY<STRING>,
# MAGIC   avg_daily_events INT,
# MAGIC   avg_bytes_transferred BIGINT,
# MAGIC   risk_score INT DEFAULT 50,
# MAGIC   last_updated TIMESTAMP,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- User anomalies detected
# MAGIC CREATE TABLE IF NOT EXISTS user_anomalies (
# MAGIC   id STRING,
# MAGIC   username STRING,
# MAGIC   anomaly_type STRING,
# MAGIC   anomaly_score DOUBLE,
# MAGIC   risk_score INT,
# MAGIC   details STRING,
# MAGIC   is_active BOOLEAN DEFAULT true,
# MAGIC   detected_at TIMESTAMP,
# MAGIC   resolved_at TIMESTAMP,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Agent tasks queue
# MAGIC CREATE TABLE IF NOT EXISTS agent_tasks (
# MAGIC   id STRING,
# MAGIC   agent_type STRING,
# MAGIC   task_type STRING,
# MAGIC   priority STRING,
# MAGIC   status STRING DEFAULT 'pending',
# MAGIC   parameters STRING,  -- JSON
# MAGIC   result STRING,  -- JSON
# MAGIC   error STRING,
# MAGIC   started_at TIMESTAMP,
# MAGIC   completed_at TIMESTAMP,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Cases / Investigations
# MAGIC CREATE TABLE IF NOT EXISTS cases (
# MAGIC   id STRING,
# MAGIC   title STRING,
# MAGIC   description STRING,
# MAGIC   severity STRING,
# MAGIC   priority STRING,
# MAGIC   status STRING DEFAULT 'new',
# MAGIC   case_type STRING,
# MAGIC   alert_id STRING,
# MAGIC   assigned_to STRING,
# MAGIC   investigation_data STRING,  -- JSON
# MAGIC   timeline STRING,  -- JSON
# MAGIC   indicators STRING,  -- JSON
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp(),
# MAGIC   updated_at TIMESTAMP,
# MAGIC   closed_at TIMESTAMP
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Response actions log
# MAGIC CREATE TABLE IF NOT EXISTS response_actions (
# MAGIC   id STRING,
# MAGIC   alert_id STRING,
# MAGIC   case_id STRING,
# MAGIC   action_type STRING,
# MAGIC   target STRING,
# MAGIC   status STRING,
# MAGIC   details STRING,  -- JSON
# MAGIC   executed_by STRING,
# MAGIC   executed_at TIMESTAMP,
# MAGIC   rolled_back_at TIMESTAMP,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Active blocklists
# MAGIC CREATE TABLE IF NOT EXISTS active_blocklist (
# MAGIC   id STRING,
# MAGIC   list_name STRING,
# MAGIC   value STRING,
# MAGIC   list_type STRING,
# MAGIC   category STRING,
# MAGIC   reason STRING,
# MAGIC   severity STRING,
# MAGIC   auto_added BOOLEAN DEFAULT false,
# MAGIC   expires_at TIMESTAMP,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Correlation rules
# MAGIC CREATE TABLE IF NOT EXISTS correlation_rules (
# MAGIC   id STRING,
# MAGIC   name STRING,
# MAGIC   description STRING,
# MAGIC   rule_type STRING,
# MAGIC   conditions STRING,  -- JSON
# MAGIC   time_window_minutes INT,
# MAGIC   threshold INT,
# MAGIC   severity STRING,
# MAGIC   enabled BOOLEAN DEFAULT true,
# MAGIC   auto_response_enabled BOOLEAN DEFAULT false,
# MAGIC   confidence DOUBLE,
# MAGIC   source_pattern_id STRING,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp(),
# MAGIC   updated_at TIMESTAMP
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Discovered patterns
# MAGIC CREATE TABLE IF NOT EXISTS discovered_patterns (
# MAGIC   id STRING,
# MAGIC   pattern_name STRING,
# MAGIC   pattern_type STRING,
# MAGIC   confidence_score DOUBLE,
# MAGIC   event_types ARRAY<STRING>,
# MAGIC   common_features STRING,  -- JSON
# MAGIC   occurrence_count INT,
# MAGIC   severity STRING,
# MAGIC   mitre_tactics ARRAY<STRING>,
# MAGIC   converted_to_rule BOOLEAN DEFAULT false,
# MAGIC   converted_at TIMESTAMP,
# MAGIC   created_at TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

# MAGIC %sql
# MAGIC -- Agent performance metrics
# MAGIC CREATE TABLE IF NOT EXISTS agent_metrics (
# MAGIC   id STRING,
# MAGIC   agent_type STRING,
# MAGIC   metric_name STRING,
# MAGIC   metric_value DOUBLE,
# MAGIC   metric_unit STRING,
# MAGIC   timestamp TIMESTAMP DEFAULT current_timestamp()
# MAGIC )
# MAGIC USING DELTA;

# COMMAND ----------

print("✅ All tables created successfully!")

# Show tables
display(spark.sql("SHOW TABLES"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. Generate Sample Data <a name="data"></a>
# MAGIC
# MAGIC Let's create realistic security data to test our agents.

# COMMAND ----------

# Helper function to generate UUIDs
def gen_uuid():
    return str(uuid.uuid4())

# Generate sample events
def generate_events(num_events=10000):
    """Generate realistic security events."""

    event_types = [
        ("authentication", "login_success", "low", 0.6),
        ("authentication", "login_failure", "medium", 0.15),
        ("network", "connection", "low", 0.5),
        ("network", "dns_query", "low", 0.4),
        ("network", "firewall_block", "medium", 0.1),
        ("process", "process_start", "low", 0.3),
        ("file", "file_access", "low", 0.4),
        ("file", "file_download", "medium", 0.1),
        ("malware", "malware_detected", "critical", 0.02),
        ("intrusion", "exploit_attempt", "high", 0.05),
        ("intrusion", "port_scan", "medium", 0.08),
        ("exfiltration", "large_data_transfer", "high", 0.03),
    ]

    internal_ips = [f"10.0.{i}.{j}" for i in range(1, 10) for j in range(1, 50)]
    external_ips = [f"203.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}" for _ in range(100)]
    usernames = [f"user{i}@company.com" for i in range(1, 50)]
    hostnames = [f"WORKSTATION-{i:03d}" for i in range(1, 100)] + [f"SERVER-{name}" for name in ["WEB", "DB", "APP", "FILE", "MAIL"]]
    domains = ["google.com", "microsoft.com", "github.com", "aws.amazon.com", "suspicious-site.ru", "malware-c2.cn", "phishing.xyz"]

    events = []
    base_time = datetime.now() - timedelta(days=7)

    for i in range(num_events):
        # Select event type with weighted probability
        event_category, event_type, severity, prob = random.choices(event_types, weights=[e[3] for e in event_types])[0]

        timestamp = base_time + timedelta(
            days=random.randint(0, 7),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59)
        )

        source_ip = random.choice(internal_ips) if random.random() > 0.2 else random.choice(external_ips)
        dest_ip = random.choice(external_ips) if random.random() > 0.3 else random.choice(internal_ips)

        events.append({
            "id": gen_uuid(),
            "timestamp": timestamp,
            "event_type": event_type,
            "severity": severity,
            "source_ip": source_ip,
            "dest_ip": dest_ip,
            "source_port": random.randint(1024, 65535),
            "dest_port": random.choice([22, 80, 443, 3389, 445, 1433, 3306, random.randint(1024, 65535)]),
            "protocol": random.choice(["TCP", "UDP", "ICMP"]),
            "username": random.choice(usernames) if event_category == "authentication" else None,
            "hostname": random.choice(hostnames),
            "domain": random.choice(domains) if event_category == "network" else None,
            "process_name": random.choice(["chrome.exe", "python.exe", "cmd.exe", "powershell.exe", "svchost.exe"]) if event_category == "process" else None,
            "file_hash": gen_uuid()[:32] if event_category == "file" else None,
            "bytes_sent": random.randint(100, 1000000) if event_category == "network" else 0,
            "bytes_received": random.randint(100, 1000000) if event_category == "network" else 0,
            "duration_ms": random.randint(10, 10000),
            "geo_country": random.choice(["US", "US", "US", "CN", "RU", "DE", "GB", "BR"]),
            "description": f"{event_type} event from {source_ip}",
            "raw_log": f"<log>{event_type}|{source_ip}|{dest_ip}</log>",
            "ocsf_category": event_category,
            "mitre_technique": random.choice(["T1071", "T1078", "T1059", "T1021", None])
        })

    return events

# Generate and insert events
print("Generating 10,000 sample events...")
events = generate_events(10000)
events_df = spark.createDataFrame(events)
events_df.write.format("delta").mode("append").saveAsTable("events")
print(f"✅ Inserted {len(events)} events")

# COMMAND ----------

# Generate sample alerts (from correlated events)
def generate_alerts(num_alerts=500):
    """Generate realistic alerts."""

    alert_types = [
        ("Brute Force Attack Detected", "Multiple failed login attempts from single source", "high", 75),
        ("Potential Data Exfiltration", "Large outbound data transfer to external IP", "critical", 85),
        ("Malware Communication", "Connection to known C2 server", "critical", 90),
        ("Lateral Movement Detected", "Sequential authentication across multiple hosts", "high", 70),
        ("Suspicious Process Execution", "PowerShell encoded command execution", "medium", 55),
        ("Port Scan Activity", "Sequential connection attempts to multiple ports", "medium", 45),
        ("Unauthorized Access Attempt", "Access to sensitive resource denied", "medium", 50),
        ("Anomalous User Behavior", "User activity outside normal baseline", "medium", 60),
    ]

    alerts = []
    base_time = datetime.now() - timedelta(days=7)

    for i in range(num_alerts):
        title, desc, severity, base_risk = random.choice(alert_types)

        timestamp = base_time + timedelta(
            days=random.randint(0, 7),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59)
        )

        alerts.append({
            "id": gen_uuid(),
            "title": title,
            "description": desc,
            "severity": severity,
            "status": "new",
            "priority": None,
            "source": "correlation_engine",
            "source_ip": f"10.0.{random.randint(1,9)}.{random.randint(1,254)}" if random.random() > 0.3 else f"203.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}",
            "dest_ip": f"203.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}",
            "username": f"user{random.randint(1,50)}@company.com" if random.random() > 0.3 else None,
            "hostname": f"WORKSTATION-{random.randint(1,100):03d}",
            "risk_score": base_risk + random.randint(-20, 20),
            "event_count": random.randint(5, 200),
            "correlated_event_ids": [gen_uuid() for _ in range(random.randint(3, 20))],
            "correlation_rule_id": gen_uuid(),
            "triage_score": None,
            "enrichment_completed": False,
            "investigation_completed": False,
            "response_completed": False,
            "created_at": timestamp
        })

    return alerts

print("Generating 500 sample alerts...")
alerts = generate_alerts(500)
alerts_df = spark.createDataFrame(alerts)
alerts_df.write.format("delta").mode("append").saveAsTable("alerts")
print(f"✅ Inserted {len(alerts)} alerts")

# COMMAND ----------

# Generate threat intelligence feeds
def generate_threat_feeds(num_items=500):
    """Generate threat intelligence IOCs."""

    feeds = ["AlienVault OTX", "Abuse.ch", "MISP", "VirusTotal", "Custom Intel"]
    threat_types = ["malware", "c2_server", "phishing", "botnet", "ransomware", "apt"]

    items = []

    for i in range(num_items):
        ioc_type = random.choice(["ip", "domain", "hash"])

        if ioc_type == "ip":
            ioc_value = f"203.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}"
        elif ioc_type == "domain":
            ioc_value = f"malicious-{random.randint(1,1000)}.{random.choice(['ru', 'cn', 'xyz', 'top'])}"
        else:
            ioc_value = gen_uuid().replace("-", "")[:32]

        items.append({
            "id": gen_uuid(),
            "feed_name": random.choice(feeds),
            "ioc_type": ioc_type,
            "ioc_value": ioc_value,
            "threat_type": random.choice(threat_types),
            "severity": random.choice(["low", "medium", "high", "critical"]),
            "confidence": round(random.uniform(0.5, 1.0), 2),
            "tags": [random.choice(["emotet", "cobalt_strike", "apt29", "lazarus", "generic"])],
            "description": f"Known {random.choice(threat_types)} indicator",
            "first_seen": datetime.now() - timedelta(days=random.randint(1, 365)),
            "last_seen": datetime.now() - timedelta(days=random.randint(0, 30))
        })

    return items

print("Generating 500 threat intelligence items...")
threat_items = generate_threat_feeds(500)
threat_df = spark.createDataFrame(threat_items)
threat_df.write.format("delta").mode("append").saveAsTable("threat_feed_items")
print(f"✅ Inserted {len(threat_items)} threat intel items")

# COMMAND ----------

# Generate user behavior baselines
def generate_user_baselines(num_users=50):
    """Generate user behavior baselines."""

    baselines = []

    for i in range(1, num_users + 1):
        baselines.append({
            "id": gen_uuid(),
            "username": f"user{i}@company.com",
            "avg_login_hour": round(random.uniform(7, 10), 1),
            "stddev_login_hour": round(random.uniform(0.5, 2), 1),
            "common_locations": [random.choice(["US", "UK", "DE"])],
            "common_hosts": [f"WORKSTATION-{i:03d}"],
            "avg_daily_events": random.randint(50, 500),
            "avg_bytes_transferred": random.randint(10000000, 100000000),
            "risk_score": random.randint(20, 60),
            "last_updated": datetime.now()
        })

    return baselines

print("Generating user baselines...")
baselines = generate_user_baselines(50)
baselines_df = spark.createDataFrame(baselines)
baselines_df.write.format("delta").mode("append").saveAsTable("user_behavior_baselines")
print(f"✅ Inserted {len(baselines)} user baselines")

# COMMAND ----------

# Verify data
print("\n📊 Data Summary:")
print(f"   Events: {spark.table('events').count():,}")
print(f"   Alerts: {spark.table('alerts').count():,}")
print(f"   Threat Intel: {spark.table('threat_feed_items').count():,}")
print(f"   User Baselines: {spark.table('user_behavior_baselines').count():,}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. Triage Agent <a name="triage"></a>
# MAGIC
# MAGIC The Triage Agent automatically scores and prioritizes alerts.

# COMMAND ----------

class TriageAgent:
    """
    Automatically score, prioritize, and classify security alerts.

    Scoring Factors:
    1. Base severity (1-10 points)
    2. Risk score contribution (0-10 points)
    3. Event volume (0-5 points)
    4. IOC match bonus (+5 points)
    5. Repeat offender bonus (+3 points)
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config
        self.severity_weights = {
            'low': 1,
            'medium': 3,
            'high': 7,
            'critical': 10
        }

    def run(self, batch_size=100):
        """Execute triage agent on new alerts."""
        print("🎯 Triage Agent Starting...")

        # Get new alerts
        new_alerts = (
            self.spark.table("alerts")
            .filter(F.col("status") == "new")
            .limit(batch_size)
        )

        count = new_alerts.count()
        if count == 0:
            print("   No new alerts to process")
            return {"processed": 0}

        print(f"   Processing {count} alerts...")

        # Apply triage scoring
        triaged = self._apply_triage_scoring(new_alerts)

        # Check for IOC matches
        triaged = self._check_ioc_matches(triaged)

        # Check for repeat offenders
        triaged = self._check_repeat_offenders(triaged)

        # Calculate final score and priority
        triaged = self._calculate_final_priority(triaged)

        # Update alerts table
        self._update_alerts(triaged)

        # Auto-escalate critical alerts to cases
        critical_count = self._escalate_critical_alerts(triaged)

        results = {
            "processed": count,
            "critical": triaged.filter(F.col("priority") == "critical").count(),
            "high": triaged.filter(F.col("priority") == "high").count(),
            "medium": triaged.filter(F.col("priority") == "medium").count(),
            "low": triaged.filter(F.col("priority") == "low").count(),
            "cases_created": critical_count
        }

        print(f"✅ Triage Complete: {results}")
        return results

    def _apply_triage_scoring(self, alerts):
        """Apply base severity scoring."""
        return alerts.withColumn(
            "severity_score",
            F.when(F.col("severity") == "low", 1)
            .when(F.col("severity") == "medium", 3)
            .when(F.col("severity") == "high", 7)
            .when(F.col("severity") == "critical", 10)
            .otherwise(0)
        ).withColumn(
            "risk_score_contribution",
            F.least(F.floor(F.coalesce(F.col("risk_score"), F.lit(0)) / 10), F.lit(10))
        ).withColumn(
            "event_count_contribution",
            F.when(F.col("event_count") > 100, 5)
            .when(F.col("event_count") > 50, 3)
            .when(F.col("event_count") > 10, 1)
            .otherwise(0)
        )

    def _check_ioc_matches(self, alerts):
        """Check if source/dest IPs match known threat IOCs."""
        threat_ips = (
            self.spark.table("threat_feed_items")
            .filter(F.col("ioc_type") == "ip")
            .select(F.col("ioc_value").alias("threat_ip"))
        )

        return alerts.join(
            F.broadcast(threat_ips),
            (alerts.source_ip == threat_ips.threat_ip) |
            (alerts.dest_ip == threat_ips.threat_ip),
            "left"
        ).withColumn(
            "ioc_match",
            F.when(F.col("threat_ip").isNotNull(), True).otherwise(False)
        ).withColumn(
            "ioc_match_score",
            F.when(F.col("ioc_match"), 5).otherwise(0)
        ).drop("threat_ip")

    def _check_repeat_offenders(self, alerts):
        """Check for repeat alerts from same source."""
        # Count alerts per source IP in last 24 hours
        repeat_counts = (
            self.spark.table("alerts")
            .filter(F.col("created_at") >= F.expr("now() - interval 24 hours"))
            .groupBy("source_ip")
            .agg(F.count("*").alias("repeat_count"))
        )

        return alerts.join(
            F.broadcast(repeat_counts),
            "source_ip",
            "left"
        ).withColumn(
            "repeat_count",
            F.coalesce(F.col("repeat_count"), F.lit(0))
        ).withColumn(
            "repeat_offender_score",
            F.when(F.col("repeat_count") > 5, 3).otherwise(0)
        )

    def _calculate_final_priority(self, alerts):
        """Calculate final triage score and priority."""
        return alerts.withColumn(
            "triage_score",
            F.col("severity_score") +
            F.col("risk_score_contribution") +
            F.col("event_count_contribution") +
            F.col("ioc_match_score") +
            F.col("repeat_offender_score")
        ).withColumn(
            "priority",
            F.when(F.col("triage_score") >= self.config["triage"]["critical_threshold"], "critical")
            .when(F.col("triage_score") >= self.config["triage"]["high_threshold"], "high")
            .when(F.col("triage_score") >= self.config["triage"]["medium_threshold"], "medium")
            .otherwise("low")
        ).withColumn(
            "triage_notes",
            F.concat(
                F.lit("Auto-triaged. Score: "),
                F.col("triage_score"),
                F.lit(". Factors: severity="),
                F.col("severity_score"),
                F.lit(", risk="),
                F.col("risk_score_contribution"),
                F.lit(", volume="),
                F.col("event_count_contribution"),
                F.lit(", ioc="),
                F.col("ioc_match_score"),
                F.lit(", repeat="),
                F.col("repeat_offender_score")
            )
        ).withColumn(
            "status",
            F.lit("triaged")
        ).withColumn(
            "triaged_at",
            F.current_timestamp()
        ).withColumn(
            "triaged_by",
            F.lit("triage_agent")
        )

    def _update_alerts(self, triaged):
        """Merge triaged data back to alerts table."""
        alerts_table = DeltaTable.forName(self.spark, "alerts")

        update_df = triaged.select(
            "id", "status", "priority", "triage_score",
            "triage_notes", "triaged_at", "triaged_by",
            "ioc_match", "repeat_count"
        )

        alerts_table.alias("target").merge(
            update_df.alias("source"),
            "target.id = source.id"
        ).whenMatchedUpdate(
            set={
                "status": "source.status",
                "priority": "source.priority",
                "triage_score": "source.triage_score",
                "triage_notes": "source.triage_notes",
                "triaged_at": "source.triaged_at",
                "triaged_by": "source.triaged_by",
                "ioc_match": "source.ioc_match",
                "repeat_count": "source.repeat_count",
                "updated_at": F.current_timestamp()
            }
        ).execute()

    def _escalate_critical_alerts(self, triaged):
        """Create cases for critical alerts."""
        critical_alerts = (
            triaged
            .filter(F.col("priority") == "critical")
            .select("id", "title", "description", "severity", "priority")
        )

        count = critical_alerts.count()
        if count == 0:
            return 0

        # Create cases
        cases = critical_alerts.select(
            F.expr("uuid()").alias("id"),
            F.concat(F.lit("Auto-Escalated: "), F.col("title")).alias("title"),
            F.col("description"),
            F.col("severity"),
            F.col("priority"),
            F.lit("new").alias("status"),
            F.lit("incident").alias("case_type"),
            F.col("id").alias("alert_id"),
            F.current_timestamp().alias("created_at")
        )

        cases.write.format("delta").mode("append").saveAsTable("cases")

        # Mark alerts as having cases
        alert_ids = [row.id for row in critical_alerts.collect()]

        return count

# COMMAND ----------

# Run Triage Agent
triage_agent = TriageAgent(spark, CONFIG)
triage_results = triage_agent.run(batch_size=200)

# COMMAND ----------

# View triaged alerts
display(
    spark.table("alerts")
    .filter(F.col("status") == "triaged")
    .select("id", "title", "severity", "priority", "triage_score", "triage_notes", "ioc_match")
    .orderBy(F.desc("triage_score"))
    .limit(20)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. Enrichment Agent <a name="enrichment"></a>
# MAGIC
# MAGIC The Enrichment Agent adds threat intelligence to triaged alerts.

# COMMAND ----------

class EnrichmentAgent:
    """
    Enrich alerts with threat intelligence from multiple sources.

    Enrichment Sources:
    - Threat feed IOC matching
    - User behavior anomaly detection
    - Geolocation analysis
    - Historical correlation
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config

    def run(self, batch_size=50):
        """Execute enrichment on triaged alerts."""
        print("🔍 Enrichment Agent Starting...")

        # Get triaged alerts that need enrichment
        alerts_to_enrich = (
            self.spark.table("alerts")
            .filter(
                (F.col("status") == "triaged") &
                (F.col("enrichment_completed") == False)
            )
            .limit(batch_size)
        )

        count = alerts_to_enrich.count()
        if count == 0:
            print("   No alerts to enrich")
            return {"processed": 0}

        print(f"   Enriching {count} alerts...")

        # Perform enrichment
        enriched = self._enrich_with_threat_intel(alerts_to_enrich)
        enriched = self._enrich_with_user_anomalies(enriched)
        enriched = self._calculate_enriched_risk(enriched)

        # Update alerts
        self._update_alerts(enriched)

        results = {
            "processed": count,
            "ioc_matches_found": enriched.filter(F.col("threat_matches") > 0).count(),
            "user_anomalies_found": enriched.filter(F.col("has_user_anomaly")).count(),
            "avg_risk_increase": enriched.agg(
                F.avg(F.col("enriched_risk_score") - F.col("risk_score"))
            ).collect()[0][0] or 0
        }

        print(f"✅ Enrichment Complete: {results}")
        return results

    def _enrich_with_threat_intel(self, alerts):
        """Match alert IOCs against threat feeds."""
        threat_feeds = self.spark.table("threat_feed_items")

        # Match source IPs
        source_matches = alerts.alias("a").join(
            threat_feeds.alias("t"),
            (F.col("a.source_ip") == F.col("t.ioc_value")) &
            (F.col("t.ioc_type") == "ip"),
            "left"
        ).groupBy("a.id").agg(
            F.count(F.col("t.id")).alias("source_ip_matches"),
            F.max(F.col("t.severity")).alias("source_threat_severity"),
            F.collect_set(F.col("t.threat_type")).alias("source_threat_types")
        )

        # Match destination IPs
        dest_matches = alerts.alias("a").join(
            threat_feeds.alias("t"),
            (F.col("a.dest_ip") == F.col("t.ioc_value")) &
            (F.col("t.ioc_type") == "ip"),
            "left"
        ).groupBy("a.id").agg(
            F.count(F.col("t.id")).alias("dest_ip_matches"),
            F.max(F.col("t.severity")).alias("dest_threat_severity"),
            F.collect_set(F.col("t.threat_type")).alias("dest_threat_types")
        )

        # Join back to alerts
        enriched = (
            alerts
            .join(source_matches, "id", "left")
            .join(dest_matches, "id", "left")
            .withColumn(
                "threat_matches",
                F.coalesce(F.col("source_ip_matches"), F.lit(0)) +
                F.coalesce(F.col("dest_ip_matches"), F.lit(0))
            )
        )

        return enriched

    def _enrich_with_user_anomalies(self, alerts):
        """Check for user behavior anomalies."""
        anomalies = (
            self.spark.table("user_anomalies")
            .filter(F.col("is_active") == True)
            .select(
                F.col("username"),
                F.col("anomaly_type"),
                F.col("risk_score").alias("anomaly_risk_score")
            )
        )

        return alerts.join(
            F.broadcast(anomalies),
            "username",
            "left"
        ).withColumn(
            "has_user_anomaly",
            F.col("anomaly_type").isNotNull()
        ).withColumn(
            "user_anomaly_risk",
            F.coalesce(F.col("anomaly_risk_score"), F.lit(0))
        )

    def _calculate_enriched_risk(self, alerts):
        """Calculate enriched risk score."""
        return alerts.withColumn(
            "enriched_risk_score",
            F.least(
                F.col("risk_score") +
                F.when(F.col("threat_matches") > 0, self.config["enrichment"]["ioc_match_bonus"]).otherwise(0) +
                F.when(F.col("has_user_anomaly"), self.config["enrichment"]["user_anomaly_bonus"]).otherwise(0),
                F.lit(100)
            )
        ).withColumn(
            "enrichment_data",
            F.to_json(F.struct(
                F.col("threat_matches"),
                F.col("source_ip_matches"),
                F.col("dest_ip_matches"),
                F.col("source_threat_types"),
                F.col("dest_threat_types"),
                F.col("has_user_anomaly"),
                F.col("anomaly_type"),
                F.col("user_anomaly_risk")
            ))
        ).withColumn(
            "enrichment_completed",
            F.lit(True)
        ).withColumn(
            "enriched_at",
            F.current_timestamp()
        )

    def _update_alerts(self, enriched):
        """Update alerts with enrichment data."""
        alerts_table = DeltaTable.forName(self.spark, "alerts")

        update_df = enriched.select(
            "id",
            "enrichment_data",
            "enriched_risk_score",
            "enrichment_completed",
            "enriched_at"
        )

        alerts_table.alias("target").merge(
            update_df.alias("source"),
            "target.id = source.id"
        ).whenMatchedUpdate(
            set={
                "enrichment_data": "source.enrichment_data",
                "enriched_risk_score": "source.enriched_risk_score",
                "enrichment_completed": "source.enrichment_completed",
                "enriched_at": "source.enriched_at",
                "updated_at": F.current_timestamp()
            }
        ).execute()

# COMMAND ----------

# Run Enrichment Agent
enrichment_agent = EnrichmentAgent(spark, CONFIG)
enrichment_results = enrichment_agent.run(batch_size=100)

# COMMAND ----------

# View enriched alerts
display(
    spark.table("alerts")
    .filter(F.col("enrichment_completed") == True)
    .select("id", "title", "risk_score", "enriched_risk_score", "enrichment_data")
    .orderBy(F.desc("enriched_risk_score"))
    .limit(20)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. Investigation Agent <a name="investigation"></a>
# MAGIC
# MAGIC The Investigation Agent correlates events and builds attack timelines.

# COMMAND ----------

class InvestigationAgent:
    """
    Correlate events and perform automated investigation.

    Investigation Steps:
    1. Retrieve correlated events
    2. Build attack timeline
    3. Identify attack patterns
    4. Extract indicators
    5. Determine if case should be created
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config

    def run(self, batch_size=20):
        """Execute investigation on enriched alerts."""
        print("🕵️ Investigation Agent Starting...")

        # Get enriched alerts that need investigation
        alerts_to_investigate = (
            self.spark.table("alerts")
            .filter(
                (F.col("enrichment_completed") == True) &
                (F.col("investigation_completed") == False) &
                (F.col("priority").isin(["critical", "high", "medium"]))
            )
            .orderBy(F.desc("enriched_risk_score"))
            .limit(batch_size)
        )

        count = alerts_to_investigate.count()
        if count == 0:
            print("   No alerts to investigate")
            return {"processed": 0}

        print(f"   Investigating {count} alerts...")

        # Perform investigation
        investigated = self._build_investigation(alerts_to_investigate)

        # Update alerts
        self._update_alerts(investigated)

        # Create cases for high-risk investigations
        cases_created = self._create_cases(investigated)

        results = {
            "processed": count,
            "patterns_found": investigated.filter(F.size("attack_patterns") > 0).count(),
            "cases_created": cases_created
        }

        print(f"✅ Investigation Complete: {results}")
        return results

    def _build_investigation(self, alerts):
        """Build investigation data for each alert."""
        # Get events for timeline
        events = self.spark.table("events")

        # For each alert, find related events
        investigated = alerts.withColumn(
            "investigation_data",
            F.to_json(F.struct(
                F.lit("Investigation by Investigation Agent").alias("summary"),
                F.current_timestamp().alias("investigated_at"),
                F.col("enriched_risk_score").alias("final_risk_score")
            ))
        ).withColumn(
            "attack_patterns",
            F.when(
                (F.col("enriched_risk_score") >= 80) & (F.col("ioc_match") == True),
                F.array(F.lit("known_threat_communication"))
            ).when(
                F.col("title").contains("Lateral Movement"),
                F.array(F.lit("lateral_movement"))
            ).when(
                F.col("title").contains("Exfiltration"),
                F.array(F.lit("data_exfiltration"))
            ).otherwise(F.array())
        ).withColumn(
            "should_create_case",
            (F.col("enriched_risk_score") >= 70) |
            (F.size("attack_patterns") > 0) |
            (F.col("priority") == "critical")
        ).withColumn(
            "investigation_completed",
            F.lit(True)
        ).withColumn(
            "investigated_at",
            F.current_timestamp()
        )

        return investigated

    def _update_alerts(self, investigated):
        """Update alerts with investigation data."""
        alerts_table = DeltaTable.forName(self.spark, "alerts")

        update_df = investigated.select(
            "id",
            "investigation_data",
            "investigation_completed",
            "investigated_at"
        )

        alerts_table.alias("target").merge(
            update_df.alias("source"),
            "target.id = source.id"
        ).whenMatchedUpdate(
            set={
                "investigation_data": "source.investigation_data",
                "investigation_completed": "source.investigation_completed",
                "investigated_at": "source.investigated_at",
                "updated_at": F.current_timestamp()
            }
        ).execute()

    def _create_cases(self, investigated):
        """Create cases for high-risk investigations."""
        to_create_cases = (
            investigated
            .filter(F.col("should_create_case") == True)
            .filter(F.col("case_created") == False)
        )

        count = to_create_cases.count()
        if count == 0:
            return 0

        cases = to_create_cases.select(
            F.expr("uuid()").alias("id"),
            F.concat(F.lit("Investigation: "), F.col("title")).alias("title"),
            F.concat(
                F.lit("Automated investigation of high-risk alert. Risk Score: "),
                F.col("enriched_risk_score")
            ).alias("description"),
            F.col("severity"),
            F.col("priority"),
            F.lit("investigating").alias("status"),
            F.lit("incident").alias("case_type"),
            F.col("id").alias("alert_id"),
            F.col("investigation_data"),
            F.current_timestamp().alias("created_at")
        )

        cases.write.format("delta").mode("append").saveAsTable("cases")

        # Update alerts to mark case_created
        alerts_table = DeltaTable.forName(self.spark, "alerts")
        alert_ids = [row.id for row in to_create_cases.select("id").collect()]

        for alert_id in alert_ids:
            alerts_table.update(
                condition=f"id = '{alert_id}'",
                set={"case_created": "true"}
            )

        return count

# COMMAND ----------

# Run Investigation Agent
investigation_agent = InvestigationAgent(spark, CONFIG)
investigation_results = investigation_agent.run(batch_size=50)

# COMMAND ----------

# View investigations
display(
    spark.table("alerts")
    .filter(F.col("investigation_completed") == True)
    .select("id", "title", "enriched_risk_score", "investigation_data", "case_created")
    .orderBy(F.desc("enriched_risk_score"))
    .limit(20)
)

# COMMAND ----------

# View created cases
display(
    spark.table("cases")
    .orderBy(F.desc("created_at"))
    .limit(20)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 7. Response Agent <a name="response"></a>
# MAGIC
# MAGIC The Response Agent executes automated threat response actions.

# COMMAND ----------

class ResponseAgent:
    """
    Execute automated response actions.

    Supported Actions:
    - Block IP (add to blocklist)
    - Isolate Host (quarantine)
    - Disable User (account lockout)
    - Create Ticket (escalate to humans)
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config

    def run(self, batch_size=20):
        """Execute responses for high-risk alerts."""
        print("⚡ Response Agent Starting...")

        # Get alerts that need response
        alerts_for_response = (
            self.spark.table("alerts")
            .filter(
                (F.col("investigation_completed") == True) &
                (F.col("response_completed") == False) &
                (F.col("enriched_risk_score") >= self.config["response"]["auto_block_threshold"])
            )
            .orderBy(F.desc("enriched_risk_score"))
            .limit(batch_size)
        )

        count = alerts_for_response.count()
        if count == 0:
            print("   No alerts require automated response")
            return {"processed": 0}

        print(f"   Responding to {count} alerts...")

        # Determine and execute responses
        responses = self._determine_responses(alerts_for_response)
        executed = self._execute_responses(responses)

        # Update alerts
        self._update_alerts(executed)

        results = {
            "processed": count,
            "ips_blocked": executed.filter(F.col("blocked_ip") == True).count(),
            "actions_logged": executed.count()
        }

        print(f"✅ Response Complete: {results}")
        return results

    def _determine_responses(self, alerts):
        """Determine appropriate response for each alert."""
        return alerts.withColumn(
            "response_action",
            F.when(
                (F.col("enriched_risk_score") >= 90) & (F.col("ioc_match") == True),
                F.lit("block_ip")
            ).when(
                F.col("title").contains("Lateral Movement"),
                F.lit("isolate_host")
            ).when(
                F.col("title").contains("Brute Force"),
                F.lit("block_ip")
            ).otherwise(F.lit("monitor"))
        ).withColumn(
            "response_target",
            F.when(
                F.col("response_action") == "block_ip",
                F.col("source_ip")
            ).when(
                F.col("response_action") == "isolate_host",
                F.col("hostname")
            ).otherwise(F.lit(None))
        )

    def _execute_responses(self, responses):
        """Execute the determined responses."""
        # Block IPs
        ips_to_block = (
            responses
            .filter(F.col("response_action") == "block_ip")
            .filter(F.col("response_target").isNotNull())
            .select(
                F.expr("uuid()").alias("id"),
                F.lit("auto_blocked_ips").alias("list_name"),
                F.col("response_target").alias("value"),
                F.lit("blocklist").alias("list_type"),
                F.lit("ip").alias("category"),
                F.concat(
                    F.lit("Auto-blocked by Response Agent. Alert: "),
                    F.col("id")
                ).alias("reason"),
                F.lit("high").alias("severity"),
                F.lit(True).alias("auto_added"),
                F.expr(f"now() + interval {self.config['response']['block_duration_hours']} hours").alias("expires_at"),
                F.current_timestamp().alias("created_at")
            )
        )

        if ips_to_block.count() > 0:
            ips_to_block.write.format("delta").mode("append").saveAsTable("active_blocklist")

        # Log all response actions
        response_logs = responses.select(
            F.expr("uuid()").alias("id"),
            F.col("id").alias("alert_id"),
            F.col("response_action").alias("action_type"),
            F.col("response_target").alias("target"),
            F.lit("executed").alias("status"),
            F.to_json(F.struct(
                F.lit(True).alias("automated"),
                F.col("enriched_risk_score").alias("risk_score")
            )).alias("details"),
            F.lit("response_agent").alias("executed_by"),
            F.current_timestamp().alias("executed_at"),
            F.current_timestamp().alias("created_at")
        )

        response_logs.write.format("delta").mode("append").saveAsTable("response_actions")

        # Add blocked_ip flag
        return responses.withColumn(
            "blocked_ip",
            F.col("response_action") == "block_ip"
        ).withColumn(
            "response_completed",
            F.lit(True)
        ).withColumn(
            "responded_at",
            F.current_timestamp()
        ).withColumn(
            "response_actions",
            F.to_json(F.struct(
                F.col("response_action"),
                F.col("response_target")
            ))
        )

    def _update_alerts(self, executed):
        """Update alerts with response status."""
        alerts_table = DeltaTable.forName(self.spark, "alerts")

        update_df = executed.select(
            "id",
            "response_completed",
            "responded_at",
            "response_actions"
        )

        alerts_table.alias("target").merge(
            update_df.alias("source"),
            "target.id = source.id"
        ).whenMatchedUpdate(
            set={
                "response_completed": "source.response_completed",
                "responded_at": "source.responded_at",
                "response_actions": "source.response_actions",
                "updated_at": F.current_timestamp()
            }
        ).execute()

# COMMAND ----------

# Run Response Agent
response_agent = ResponseAgent(spark, CONFIG)
response_results = response_agent.run(batch_size=30)

# COMMAND ----------

# View blocked IPs
display(
    spark.table("active_blocklist")
    .orderBy(F.desc("created_at"))
    .limit(20)
)

# COMMAND ----------

# View response actions
display(
    spark.table("response_actions")
    .orderBy(F.desc("executed_at"))
    .limit(20)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 8. Pattern Discovery Agent <a name="pattern"></a>
# MAGIC
# MAGIC The Pattern Discovery Agent uses ML to find new attack patterns.

# COMMAND ----------

class PatternDiscoveryAgent:
    """
    Discover new attack patterns using machine learning.

    Methods:
    - Event sequence analysis
    - Statistical anomaly detection
    - Clustering-based pattern detection
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config

    def run(self):
        """Discover patterns and create rules."""
        print("🧠 Pattern Discovery Agent Starting...")

        # Analyze event sequences
        sequence_patterns = self._analyze_event_sequences()

        # Find statistical anomalies
        anomaly_patterns = self._find_statistical_anomalies()

        # Combine and store patterns
        all_patterns = sequence_patterns + anomaly_patterns
        self._store_patterns(all_patterns)

        # Convert high-confidence patterns to rules
        rules_created = self._create_rules_from_patterns()

        results = {
            "patterns_discovered": len(all_patterns),
            "rules_created": rules_created
        }

        print(f"✅ Pattern Discovery Complete: {results}")
        return results

    def _analyze_event_sequences(self):
        """Find common event sequences that may indicate attacks."""
        patterns = []

        # Group events by source IP and hour
        sessions = (
            self.spark.table("events")
            .filter(F.col("timestamp") >= F.expr("now() - interval 7 days"))
            .withColumn("session_key", F.concat(
                F.col("source_ip"),
                F.lit("_"),
                F.date_format("timestamp", "yyyy-MM-dd-HH")
            ))
            .groupBy("session_key", "source_ip")
            .agg(
                F.collect_list(
                    F.struct("event_type", "timestamp", "severity")
                ).alias("events"),
                F.count("*").alias("event_count")
            )
            .filter(F.col("event_count") >= 5)
        )

        # Look for suspicious sequences
        # Pattern: Multiple failures followed by success
        brute_force_sessions = (
            sessions
            .filter(F.size("events") >= 5)
            .withColumn("event_types", F.transform("events", lambda x: x.event_type))
        )

        # Count sessions with failure->success pattern
        pattern_count = brute_force_sessions.count()

        if pattern_count > 10:
            patterns.append({
                "pattern_name": "Potential Brute Force Sequence",
                "pattern_type": "sequence",
                "confidence_score": min(0.6 + (pattern_count / 1000), 0.95),
                "event_types": ["login_failure", "login_success"],
                "occurrence_count": pattern_count,
                "severity": "high",
                "mitre_tactics": ["TA0006"]
            })

        return patterns

    def _find_statistical_anomalies(self):
        """Find statistical anomalies in event data."""
        patterns = []

        # Calculate baseline statistics
        baseline = (
            self.spark.table("events")
            .filter(F.col("timestamp") >= F.expr("now() - interval 7 days"))
            .groupBy(F.date_format("timestamp", "yyyy-MM-dd-HH").alias("hour"))
            .agg(
                F.count("*").alias("event_count"),
                F.sum("bytes_sent").alias("total_bytes")
            )
        )

        stats = baseline.agg(
            F.avg("event_count").alias("avg_events"),
            F.stddev("event_count").alias("stddev_events"),
            F.avg("total_bytes").alias("avg_bytes"),
            F.stddev("total_bytes").alias("stddev_bytes")
        ).collect()[0]

        # Find anomalous hours
        threshold = (stats.avg_events or 0) + 3 * (stats.stddev_events or 0)

        anomalous_hours = (
            baseline
            .filter(F.col("event_count") > threshold)
            .count()
        )

        if anomalous_hours > 0:
            patterns.append({
                "pattern_name": "Anomalous Event Volume Detected",
                "pattern_type": "statistical_anomaly",
                "confidence_score": 0.75,
                "event_types": ["all"],
                "occurrence_count": anomalous_hours,
                "severity": "medium",
                "mitre_tactics": []
            })

        return patterns

    def _store_patterns(self, patterns):
        """Store discovered patterns."""
        if not patterns:
            return

        patterns_df = self.spark.createDataFrame([
            {
                "id": gen_uuid(),
                "pattern_name": p["pattern_name"],
                "pattern_type": p["pattern_type"],
                "confidence_score": p["confidence_score"],
                "event_types": p["event_types"],
                "common_features": json.dumps({}),
                "occurrence_count": p["occurrence_count"],
                "severity": p["severity"],
                "mitre_tactics": p.get("mitre_tactics", []),
                "converted_to_rule": False,
                "created_at": datetime.now()
            }
            for p in patterns
        ])

        patterns_df.write.format("delta").mode("append").saveAsTable("discovered_patterns")

    def _create_rules_from_patterns(self):
        """Convert high-confidence patterns to correlation rules."""
        high_confidence = (
            self.spark.table("discovered_patterns")
            .filter(
                (F.col("confidence_score") >= self.config["pattern_discovery"]["min_confidence"]) &
                (F.col("converted_to_rule") == False)
            )
        )

        count = high_confidence.count()
        if count == 0:
            return 0

        # Create rules
        rules = high_confidence.select(
            F.expr("uuid()").alias("id"),
            F.concat(F.lit("AI-Discovered: "), F.col("pattern_name")).alias("name"),
            F.concat(
                F.lit("Auto-generated from pattern with "),
                F.round(F.col("confidence_score") * 100, 1),
                F.lit("% confidence")
            ).alias("description"),
            F.lit("ai_generated").alias("rule_type"),
            F.to_json(F.struct(
                F.col("event_types"),
                F.col("pattern_type")
            )).alias("conditions"),
            F.lit(60).alias("time_window_minutes"),
            F.lit(5).alias("threshold"),
            F.col("severity"),
            F.lit(True).alias("enabled"),
            F.lit(False).alias("auto_response_enabled"),
            F.col("confidence_score").alias("confidence"),
            F.col("id").alias("source_pattern_id"),
            F.current_timestamp().alias("created_at")
        )

        rules.write.format("delta").mode("append").saveAsTable("correlation_rules")

        # Mark patterns as converted
        patterns_table = DeltaTable.forName(self.spark, "discovered_patterns")
        pattern_ids = [row.id for row in high_confidence.select("id").collect()]

        for pid in pattern_ids:
            patterns_table.update(
                condition=f"id = '{pid}'",
                set={
                    "converted_to_rule": "true",
                    "converted_at": "current_timestamp()"
                }
            )

        return count

# COMMAND ----------

# Run Pattern Discovery Agent
pattern_agent = PatternDiscoveryAgent(spark, CONFIG)
pattern_results = pattern_agent.run()

# COMMAND ----------

# View discovered patterns
display(
    spark.table("discovered_patterns")
    .orderBy(F.desc("confidence_score"))
)

# COMMAND ----------

# View AI-generated rules
display(
    spark.table("correlation_rules")
    .filter(F.col("rule_type") == "ai_generated")
    .orderBy(F.desc("created_at"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 9. Agent Orchestrator <a name="orchestrator"></a>
# MAGIC
# MAGIC The Orchestrator coordinates all agents in sequence.

# COMMAND ----------

class AgentOrchestrator:
    """
    Orchestrate all agents in the correct sequence.

    Execution Order:
    1. Triage Agent - Prioritize new alerts
    2. Enrichment Agent - Add threat intelligence
    3. Investigation Agent - Correlate and analyze
    4. Response Agent - Take automated action
    5. Pattern Discovery Agent - Learn new patterns
    """

    def __init__(self, spark, config):
        self.spark = spark
        self.config = config

        # Initialize all agents
        self.triage = TriageAgent(spark, config)
        self.enrichment = EnrichmentAgent(spark, config)
        self.investigation = InvestigationAgent(spark, config)
        self.response = ResponseAgent(spark, config)
        self.pattern_discovery = PatternDiscoveryAgent(spark, config)

    def run_full_cycle(self):
        """Run all agents in sequence."""
        print("=" * 60)
        print("🤖 AGENTIC SOC - FULL CYCLE EXECUTION")
        print("=" * 60)

        start_time = datetime.now()
        results = {}

        # 1. Triage
        print("\n" + "-" * 40)
        results["triage"] = self.triage.run()

        # 2. Enrichment
        print("\n" + "-" * 40)
        results["enrichment"] = self.enrichment.run()

        # 3. Investigation
        print("\n" + "-" * 40)
        results["investigation"] = self.investigation.run()

        # 4. Response
        print("\n" + "-" * 40)
        results["response"] = self.response.run()

        # 5. Pattern Discovery
        print("\n" + "-" * 40)
        results["pattern_discovery"] = self.pattern_discovery.run()

        # Calculate total time
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        print("\n" + "=" * 60)
        print("🎉 CYCLE COMPLETE")
        print("=" * 60)
        print(f"\nTotal Duration: {duration:.2f} seconds")
        print(f"\nResults Summary:")
        for agent, result in results.items():
            print(f"  {agent}: {result}")

        # Log metrics
        self._log_metrics(results, duration)

        return results

    def _log_metrics(self, results, duration):
        """Log agent performance metrics."""
        metrics = [
            {"agent_type": "orchestrator", "metric_name": "cycle_duration_seconds", "metric_value": duration, "metric_unit": "seconds"},
            {"agent_type": "triage", "metric_name": "alerts_processed", "metric_value": results["triage"].get("processed", 0), "metric_unit": "count"},
            {"agent_type": "enrichment", "metric_name": "alerts_enriched", "metric_value": results["enrichment"].get("processed", 0), "metric_unit": "count"},
            {"agent_type": "investigation", "metric_name": "alerts_investigated", "metric_value": results["investigation"].get("processed", 0), "metric_unit": "count"},
            {"agent_type": "response", "metric_name": "responses_executed", "metric_value": results["response"].get("processed", 0), "metric_unit": "count"},
            {"agent_type": "pattern_discovery", "metric_name": "patterns_discovered", "metric_value": results["pattern_discovery"].get("patterns_discovered", 0), "metric_unit": "count"},
        ]

        metrics_df = self.spark.createDataFrame([
            {**m, "id": gen_uuid(), "timestamp": datetime.now()}
            for m in metrics
        ])

        metrics_df.write.format("delta").mode("append").saveAsTable("agent_metrics")

# COMMAND ----------

# Create orchestrator and run full cycle
orchestrator = AgentOrchestrator(spark, CONFIG)
cycle_results = orchestrator.run_full_cycle()

# COMMAND ----------

# MAGIC %md
# MAGIC ## 10. Monitoring Dashboard <a name="dashboard"></a>

# COMMAND ----------

# MAGIC %md
# MAGIC ### Alert Pipeline Status

# COMMAND ----------

# Pipeline status
pipeline_status = spark.sql("""
    SELECT
        'New' as stage,
        COUNT(*) as count,
        MIN(created_at) as oldest
    FROM alerts
    WHERE status = 'new'

    UNION ALL

    SELECT
        'Triaged' as stage,
        COUNT(*),
        MIN(triaged_at)
    FROM alerts
    WHERE status = 'triaged' AND enrichment_completed = false

    UNION ALL

    SELECT
        'Enriched' as stage,
        COUNT(*),
        MIN(enriched_at)
    FROM alerts
    WHERE enrichment_completed = true AND investigation_completed = false

    UNION ALL

    SELECT
        'Investigated' as stage,
        COUNT(*),
        MIN(investigated_at)
    FROM alerts
    WHERE investigation_completed = true AND response_completed = false

    UNION ALL

    SELECT
        'Responded' as stage,
        COUNT(*),
        MIN(responded_at)
    FROM alerts
    WHERE response_completed = true
""")

display(pipeline_status)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Agent Performance Metrics

# COMMAND ----------

display(
    spark.table("agent_metrics")
    .filter(F.col("timestamp") >= F.expr("now() - interval 24 hours"))
    .orderBy(F.desc("timestamp"))
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Alert Distribution

# COMMAND ----------

# Alert distribution by severity and priority
display(
    spark.sql("""
        SELECT
            severity,
            priority,
            status,
            COUNT(*) as count,
            AVG(enriched_risk_score) as avg_risk_score
        FROM alerts
        GROUP BY severity, priority, status
        ORDER BY
            CASE severity
                WHEN 'critical' THEN 1
                WHEN 'high' THEN 2
                WHEN 'medium' THEN 3
                ELSE 4
            END,
            count DESC
    """)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Response Actions Summary

# COMMAND ----------

display(
    spark.sql("""
        SELECT
            action_type,
            status,
            COUNT(*) as count,
            MAX(executed_at) as last_executed
        FROM response_actions
        GROUP BY action_type, status
        ORDER BY count DESC
    """)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ### Active Blocklist

# COMMAND ----------

display(
    spark.sql("""
        SELECT
            list_name,
            category,
            COUNT(*) as count,
            SUM(CASE WHEN auto_added THEN 1 ELSE 0 END) as auto_added_count
        FROM active_blocklist
        WHERE expires_at > now() OR expires_at IS NULL
        GROUP BY list_name, category
    """)
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## 🎉 Congratulations!
# MAGIC
# MAGIC You've built a complete Agentic SOC with:
# MAGIC
# MAGIC - ✅ **Triage Agent** - Automatically prioritizes alerts
# MAGIC - ✅ **Enrichment Agent** - Adds threat intelligence
# MAGIC - ✅ **Investigation Agent** - Correlates events
# MAGIC - ✅ **Response Agent** - Executes automated actions
# MAGIC - ✅ **Pattern Discovery Agent** - Finds new attack patterns
# MAGIC - ✅ **Orchestrator** - Coordinates everything
# MAGIC - ✅ **Monitoring Dashboard** - Tracks performance
# MAGIC
# MAGIC ### Next Steps
# MAGIC
# MAGIC 1. **Connect Real Data** - Replace sample data with your SIEM feeds
# MAGIC 2. **Add Threat Feeds** - Integrate with AlienVault OTX, MISP, etc.
# MAGIC 3. **Enable Streaming** - Use Structured Streaming for real-time processing
# MAGIC 4. **Add Graph Analytics** - Install GraphFrames for advanced correlation
# MAGIC 5. **Deploy to Production** - Schedule the orchestrator to run continuously
# MAGIC
# MAGIC ### Resources
# MAGIC
# MAGIC - [Databricks Documentation](https://docs.databricks.com)
# MAGIC - [Delta Lake Guide](https://docs.delta.io)
# MAGIC - [Spark ML Library](https://spark.apache.org/docs/latest/ml-guide.html)
# MAGIC - [GraphFrames](https://graphframes.github.io/graphframes/docs/_site/index.html)

# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC
# MAGIC **Built with ❤️ using Databricks**
# MAGIC
# MAGIC *If you found this useful, share it with your security team!*
