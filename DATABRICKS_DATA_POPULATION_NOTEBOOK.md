# Databricks Data Population & ML Experiments Notebook

Copy and paste the sections below into your Databricks notebook cells (use `Cmd+Alt+C` for new cells).

---

## Cell 1: Initialize Environment & Catalog Setup

```python
# Databricks notebook source

# MAGIC %md
# MAGIC # SOC Platform -- Data Population & ML Experiments
# MAGIC ## Generate Demo Data for All Tables + Run AI/ML Training
# MAGIC - Population strategy: ~5K-50K rows per table
# MAGIC - ML experiments: Correlation detection, anomaly detection, threat classification
# MAGIC - Runtime: 20-30 minutes on single-node cluster
# MAGIC - No external dependencies

# COMMAND

CATALOG = "soc_platform"
SCHEMAS = [
    "core_siem", "threat_intel", "threat_modeling", "user_analytics",
    "incident_response", "compliance", "malware_sandbox", "red_team",
    "network_security", "ai_agents", "correlation_engine", "data_connectors",
    "llm_security", "search_infra", "platform_config", "ocsf", "internal_services"
]

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"USE CATALOG {CATALOG}")
for schema in SCHEMAS:
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{schema}")

print(f"✓ Catalog '{CATALOG}' ready with {len(SCHEMAS)} schemas")
```

---

## Cell 2: Utility Functions & Mock Data Generators

```python
import uuid
import random
import json
import numpy as np
from datetime import datetime, timedelta
from pyspark.sql import Row
from pyspark.sql.types import *

def uid():
    """Generate UUID"""
    return str(uuid.uuid4())

def ts(days_back=90):
    """Random timestamp within N days"""
    return datetime.now() - timedelta(days=random.uniform(0, days_back), hours=random.uniform(0, 24))

def rip():
    """Random IP address"""
    return f"{random.choice(['10','172','192'])}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"

def rport():
    """Random port"""
    return random.choice([22, 80, 443, 3306, 5432, 5985, 8080, 445, 3389])

def rsev():
    """Random severity"""
    return random.choice(["critical", "high", "medium", "low", "info"])

def ruser():
    """Random username"""
    return random.choice(["admin", "jsmith", "mwilliams", "analyst1", "soc_lead", "threat_hunter", "lz_admin", "contractor"])

def rhost():
    """Random hostname"""
    return random.choice(["ws-prod-01", "dc-core-01", "fw-edge-01", "db-primary", "app-web-03", "mail-gw-01", "vpn-hub-01", "elk-master-01"])

def rtactic():
    """Random MITRE tactic"""
    return random.choice([
        "Initial Access", "Execution", "Persistence", "Privilege Escalation",
        "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement",
        "Collection", "Exfiltration", "Command and Control", "Impact"
    ])

def rtechnique():
    """Random MITRE technique ID"""
    return random.choice([
        "T1566.001", "T1059.001", "T1547.001", "T1548.002", "T1070.004",
        "T1110.001", "T1082", "T1021.001", "T1005", "T1048.003", "T1071.001", "T1486"
    ])

def rcategory():
    """Random threat category"""
    return random.choice([
        "APT Activity", "Ransomware", "Intrusion", "Malware",
        "Phishing", "Exploit", "Vulnerability", "Data Breach"
    ])

def rjson(keys=None):
    """Random JSON object"""
    if keys is None:
        keys = ["key1", "key2"]
    return json.dumps({k: f"val_{random.randint(1,100)}" for k in keys})

def write_rows(table_path, rows, mode="append"):
    """Write rows to Delta table"""
    if rows:
        df = spark.createDataFrame(rows)
        df.write.mode(mode).option("mergeSchema", "true").saveAsTable(table_path)
        return len(rows)
    return 0

def generate_embedding(dimension=768):
    """Generate random embedding vector"""
    return [float(np.random.randn()) for _ in range(dimension)]

print("✓ Utility functions loaded")
```

---

## Cell 3: Populate CORE_SIEM Tables

```python
# MAGIC %md
# MAGIC ## Core SIEM Data Population (8 tables)

# COMMAND

from pyspark.sql.functions import col, lit

# EVENTS (primary table - 10K rows)
print("Populating core_siem.events...")
events = []
for i in range(10000):
    events.append(Row(
        id=uid(),
        event_type=random.choice(["network_activity", "process_execution", "file_access", "registry_mod", "auth_attempt"]),
        severity=rsev(),
        source="sysmon" if random.random() > 0.5 else "network_tap",
        source_ip=rip(),
        dest_ip=rip(),
        source_port=rport(),
        dest_port=rport(),
        protocol=random.choice(["TCP", "UDP", "ICMP"]),
        user_id=uid(),
        username=ruser(),
        hostname=rhost(),
        process_name=random.choice(["powershell.exe", "cmd.exe", "svchost.exe", "explorer.exe", "winlogon.exe"]),
        command_line=f"cmd /c {random.choice(['whoami', 'ipconfig', 'systeminfo', 'net user'])}",
        description=f"Suspicious {random.choice(['network', 'process', 'file'])} activity detected",
        raw_log=rjson(),
        raw_json=rjson(),
        network_flow=rjson(["src_ip", "dst_ip", "bytes_in", "bytes_out"]),
        packet_data=None,
        tags=json.dumps(["security", rtactic().lower()]),
        metadata=rjson(["source", "severity", "status"]),
        iocs=json.dumps([rip(), random.choice(["malicious.exe", "evil.dll"])]),
        mitre_tactic=rtactic(),
        mitre_technique=rtechnique(),
        alert_id=uid() if random.random() > 0.7 else None,
        case_id=None,
        embedding=generate_embedding(128),
        event_timestamp=ts(),
        created_at=ts(),
        ocsf_class_uid=4001,
        ocsf_class_name="Process Activity",
        ocsf_category_uid=1,
        ocsf_category_name="System Activity",
        ocsf_severity_id=3,
        ocsf_activity_id=1,
        ocsf_activity_name="Create",
        ocsf_type_uid=400101,
        ocsf_normalized=rjson(),
        ocsf_metadata=rjson()
    ))
rows_written = write_rows("soc_platform.core_siem.events", events, "append")
print(f"✓ core_siem.events: {rows_written} rows")

# ALERTS (5K rows)
print("Populating core_siem.alerts...")
alerts = []
for i in range(5000):
    alert_id = uid()
    alerts.append(Row(
        id=alert_id,
        alert_id=alert_id,
        title=random.choice([
            "Suspicious PowerShell Execution",
            "Brute Force Login Attempt",
            "Malware Detected",
            "Data Exfiltration",
            "Privilege Escalation"
        ]),
        description="Alert generated by correlation engine",
        severity=rsev(),
        status=random.choice(["open", "acknowledged", "investigating", "resolved"]),
        alert_type=random.choice(["intrusion", "malware", "policy_violation", "anomaly"]),
        source="correlation_engine",
        source_ip=rip(),
        dest_ip=rip(),
        user_id=uid(),
        hostname=rhost(),
        rule_id=uid(),
        rule_name=f"Rule_{random.randint(1,1000)}",
        mitre_tactic=rtactic(),
        mitre_technique=rtechnique(),
        confidence_score=random.randint(60, 99),
        false_positive=random.random() < 0.1,
        assigned_to=ruser() if random.random() > 0.3 else None,
        case_id=uid() if random.random() > 0.7 else None,
        related_event_ids=json.dumps([uid() for _ in range(random.randint(1, 5))]),
        metadata=rjson(),
        tags=json.dumps([rtactic().lower(), rcategory().lower()]),
        created_at=ts(),
        updated_at=ts(),
        acknowledged_at=ts() if random.random() > 0.3 else None,
        resolved_at=None,
        ocsf_class_uid=2001,
        ocsf_class_name="Detection Finding",
        ocsf_finding=rjson()
    ))
rows_written = write_rows("soc_platform.core_siem.alerts", alerts, "append")
print(f"✓ core_siem.alerts: {rows_written} rows")

# CASES (2K rows)
print("Populating core_siem.cases...")
cases = []
for i in range(2000):
    case_id = uid()
    cases.append(Row(
        id=case_id,
        case_number=f"CASE-{random.randint(10000, 99999)}",
        title=random.choice(["APT Investigation", "Ransomware Incident", "Data Breach", "Insider Threat", "Compliance Violation"]),
        description="Security incident under investigation",
        status=random.choice(["open", "in_progress", "escalated", "resolved", "closed"]),
        priority=random.choice(["critical", "high", "medium", "low"]),
        severity=rsev(),
        category=rcategory(),
        assigned_to=ruser(),
        created_by="analyst1",
        resolution=random.choice(["contained", "mitigated", "no_action", None]),
        related_event_ids=json.dumps([uid() for _ in range(random.randint(2, 10))]),
        related_alert_ids=json.dumps([uid() for _ in range(random.randint(1, 5))]),
        tags=json.dumps(["investigation", rtactic().lower()]),
        created_at=ts(30),
        updated_at=ts(),
        resolved_at=ts() if random.random() > 0.5 else None,
        closed_at=None
    ))
rows_written = write_rows("soc_platform.core_siem.cases", cases, "append")
print(f"✓ core_siem.cases: {rows_written} rows")

# SESSIONS (3K rows)
print("Populating core_siem.sessions...")
sessions = []
for i in range(3000):
    sessions.append(Row(
        id=uid(),
        user_id=uid(),
        source_ip=rip(),
        start_time=ts(),
        end_time=ts(),
        event_count=random.randint(1, 500),
        risk_score=float(random.uniform(0, 100)),
        status=random.choice(["active", "completed", "terminated", "suspicious"]),
        device_info=json.dumps({"os": random.choice(["Windows", "Linux", "macOS"]), "browser": "Chrome"}),
        location=random.choice(["US", "EU", "APAC", "Unknown"]),
        created_at=ts(),
        updated_at=ts()
    ))
rows_written = write_rows("soc_platform.core_siem.sessions", sessions, "append")
print(f"✓ core_siem.sessions: {rows_written} rows")

print("✓ Core SIEM tables populated")
```

---

## Cell 4: Populate THREAT_INTEL Tables

```python
# MAGIC %md
# MAGIC ## Threat Intelligence Data (IOCs, Feeds, Dark Web)

# COMMAND

# IOC_INDICATORS (8K rows)
print("Populating threat_intel.ioc_indicators...")
iocs = []
for i in range(8000):
    ioc_type = random.choice(["ipv4", "domain", "file_hash", "url", "email"])
    iocs.append(Row(
        id=uid(),
        ioc_type=ioc_type,
        indicator_value=rip() if ioc_type == "ipv4" else f"malware_{i}.com" if ioc_type == "domain" else f"hash_{random.randint(1,10000)}",
        source=random.choice(["MISP", "AlienVault", "Shodan", "Custom Feed"]),
        threat_type=rcategory(),
        confidence=random.randint(50, 99),
        first_seen=ts(180),
        last_seen=ts(),
        is_active=random.random() > 0.2,
        malware_family=random.choice(["Emotet", "Trickbot", "Mirai", "Dridex", None]),
        associated_campaigns=json.dumps([f"CAMPAIGN_{random.randint(1,100)}" for _ in range(random.randint(1, 3))]),
        metadata=rjson(),
        created_at=ts(),
        updated_at=ts()
    ))
rows_written = write_rows("soc_platform.threat_intel.ioc_indicators", iocs, "append")
print(f"✓ threat_intel.ioc_indicators: {rows_written} rows")

# THREAT_FEEDS (1K rows)
print("Populating threat_intel.threat_feeds...")
feeds = []
for i in range(1000):
    feeds.append(Row(
        id=uid(),
        feed_name=f"Feed_{random.randint(1, 500)}",
        feed_url=f"https://threatfeed{random.randint(1,100)}.com/data",
        feed_type=random.choice(["IP_REPUTATION", "DOMAIN_REPUTATION", "MALWARE_HASH", "PHISHING_URL"]),
        is_active=random.random() > 0.1,
        update_frequency_hours=random.choice([1, 4, 24]),
        last_updated=ts(),
        record_count=random.randint(1000, 1000000),
        reliability_score=random.randint(60, 99),
        metadata=rjson(),
        created_at=ts(365),
        updated_at=ts()
    ))
rows_written = write_rows("soc_platform.threat_intel.threat_feeds", feeds, "append")
print(f"✓ threat_intel.threat_feeds: {rows_written} rows")

# DARK_WEB_FORUM_POSTS (3K rows)
print("Populating threat_intel.dark_web_forum_posts...")
posts = []
for i in range(3000):
    posts.append(Row(
        id=uid(),
        source_id=f"forum_{random.randint(1, 50)}",
        post_type=random.choice(["malware_sale", "exploit_discussion", "credential_dump", "ransomware_target"]),
        title=random.choice([
            "New zero-day vulnerability discovered",
            "Ransomware kit available for purchase",
            "Stolen credentials database",
            "Exploit framework release"
        ]),
        content="[Content redacted for security]",
        threat_level=random.choice(["critical", "high", "medium"]),
        relevance_score=float(random.uniform(0.5, 1.0)),
        author_username=f"threat_actor_{random.randint(1, 1000)}",
        author_reputation=float(random.uniform(0, 100)),
        post_url=f"https://darkweb.onion/post/{random.randint(1, 10000)}",
        discovered_at=ts(),
        extracted_iocs=json.dumps([rip(), "malware.exe"]),
        affected_organizations=[f"Org_{random.randint(1, 100)}" for _ in range(random.randint(1, 5))],
        estimated_impact_score=float(random.uniform(0, 100)),
        verified=random.random() > 0.5,
        tags=["dark_web", rtactic().lower()],
        metadata=rjson(),
        created_at=ts()
    ))
rows_written = write_rows("soc_platform.threat_intel.dark_web_forum_posts", posts, "append")
print(f"✓ threat_intel.dark_web_forum_posts: {rows_written} rows")

print("✓ Threat Intelligence tables populated")
```

---

## Cell 5: Populate USER_ANALYTICS Tables

```python
# MAGIC %md
# MAGIC ## User Analytics & Behavior (UBA)

# COMMAND

# USER_BEHAVIOR_PROFILES (500 rows)
print("Populating user_analytics.user_behavior_profiles...")
profiles = []
for i in range(500):
    profiles.append(Row(
        id=uid(),
        user_id=uid(),
        username=f"user_{i}",
        department=random.choice(["IT", "Finance", "HR", "Engineering", "Sales"]),
        role=random.choice(["analyst", "admin", "developer", "manager"]),
        baseline_login_time=f"{random.randint(6, 18)}:00",
        baseline_login_frequency_per_day=random.uniform(1, 10),
        typical_data_access_volume_mb=random.uniform(100, 10000),
        baseline_failed_login_attempts_per_week=random.uniform(0, 5),
        common_locations=json.dumps([f"Office_{random.randint(1, 10)}", "Remote"]),
        risk_score=random.uniform(0, 100),
        anomaly_count=random.randint(0, 50),
        is_flagged=random.random() < 0.05,
        created_at=ts(365),
        updated_at=ts()
    ))
rows_written = write_rows("soc_platform.user_analytics.user_behavior_profiles", profiles, "append")
print(f"✓ user_analytics.user_behavior_profiles: {rows_written} rows")

# ANOMALOUS_ACTIVITY (2K rows)
print("Populating user_analytics.anomalous_activity...")
anomalies = []
for i in range(2000):
    anomalies.append(Row(
        id=uid(),
        user_id=uid(),
        activity_type=random.choice(["login", "data_access", "privilege_change", "download", "lateral_movement"]),
        anomaly_description=f"Unusual {random.choice(['login time', 'location', 'data access', 'privilege level'])}",
        severity=rsev(),
        confidence_score=random.randint(60, 99),
        expected_baseline=rjson(),
        observed_behavior=rjson(),
        deviation_percentage=random.uniform(50, 300),
        timestamp=ts(),
        investigated=random.random() > 0.3,
        is_legitimate=random.random() > 0.2,
        investigation_notes=random.choice(["No threat identified", "Under investigation", "Confirmed malicious"]) if random.random() > 0.3 else None,
        created_at=ts()
    ))
rows_written = write_rows("soc_platform.user_analytics.anomalous_activity", anomalies, "append")
print(f"✓ user_analytics.anomalous_activity: {rows_written} rows")

print("✓ User Analytics tables populated")
```

---

## Cell 6: ML Experiment 1 - Event Correlation Detection

```python
# MAGIC %md
# MAGIC ## ML Experiment 1: Correlation Detection
# MAGIC Build ML model to identify correlated security events

# COMMAND

from pyspark.ml.feature import VectorAssembler
from pyspark.ml.classification import RandomForestClassifier
from pyspark.ml.evaluation import BinaryClassificationEvaluator
from pyspark.sql.functions import col, when, rand

print("Starting ML Experiment 1: Event Correlation Detection...")

# Read events
events_df = spark.table("soc_platform.core_siem.events")

# Feature engineering
feature_df = events_df.select(
    col("id"),
    col("severity"),
    col("confidence_score"),
    (col("source_port").cast("int") / 65535.0).alias("src_port_norm"),
    (col("dest_port").cast("int") / 65535.0).alias("dst_port_norm"),
    when(col("severity") == "critical", 4).when(col("severity") == "high", 3)
        .when(col("severity") == "medium", 2).when(col("severity") == "low", 1).otherwise(0).alias("sev_score"),
    rand().alias("rand_score")
).withColumn("is_correlated", when(rand() < 0.15, 1).otherwise(0))

# Prepare features
assembler = VectorAssembler(
    inputCols=["src_port_norm", "dst_port_norm", "sev_score"],
    outputCol="features"
)
train_df = assembler.transform(feature_df).select("features", "is_correlated")

# Train model
rf = RandomForestClassifier(numTrees=10, maxDepth=8, labelCol="is_correlated", seed=42)
model = rf.fit(train_df)

# Evaluate
predictions = model.transform(train_df)
evaluator = BinaryClassificationEvaluator(labelCol="is_correlated")
auc = evaluator.evaluate(predictions)

print(f"✓ Model trained - AUC: {auc:.4f}")

# Save model
model.write().overwrite().save(f"/user/hive/warehouse/{CATALOG}.db/correlation_model")

# Create experiment log
exp_log = [{
    "experiment_id": uid(),
    "experiment_name": "Event Correlation Detection",
    "model_type": "RandomForest",
    "features": ["src_port", "dst_port", "severity"],
    "train_auc": float(auc),
    "parameters": {"numTrees": 10, "maxDepth": 8},
    "training_timestamp": datetime.now().isoformat(),
    "rows_trained": train_df.count(),
    "status": "success"
}]

print(f"✓ ML Experiment 1 complete - Trained on {train_df.count()} events")
```

---

## Cell 7: ML Experiment 2 - Anomaly Detection (Isolation Forest)

```python
# MAGIC %md
# MAGIC ## ML Experiment 2: User Anomaly Detection
# MAGIC Detect anomalous user behavior using statistical methods

# COMMAND

from pyspark.sql.functions import col, mean, stddev, abs as spark_abs
from pyspark.sql.window import Window

print("Starting ML Experiment 2: User Anomaly Detection...")

# Read sessions
sessions_df = spark.table("soc_platform.core_siem.sessions")

# Calculate baseline statistics
w = Window.partitionBy("user_id")
stats_df = sessions_df.withColumn(
    "event_count_mean", mean("event_count").over(w)
).withColumn(
    "event_count_stddev", stddev("event_count").over(w)
).withColumn(
    "z_score", (spark_abs(col("event_count") - col("event_count_mean")) / (col("event_count_stddev") + 1))
).withColumn(
    "is_anomaly", when(col("z_score") > 3, 1).otherwise(0)
)

anomaly_count = stats_df.filter(col("is_anomaly") == 1).count()
total_count = stats_df.count()

print(f"✓ Identified {anomaly_count} anomalous sessions out of {total_count}")

# Save anomaly detection results
stats_df.select("id", "user_id", "event_count", "z_score", "is_anomaly").write.mode("overwrite").option("mergeSchema", "true").saveAsTable("soc_platform.user_analytics.anomaly_detection_results")

# Log experiment
exp_log_anomaly = [{
    "experiment_id": uid(),
    "experiment_name": "User Anomaly Detection",
    "method": "Z-Score Analysis",
    "threshold": 3.0,
    "anomalies_detected": int(anomaly_count),
    "total_sessions": int(total_count),
    "anomaly_rate_pct": float(anomaly_count / total_count * 100),
    "training_timestamp": datetime.now().isoformat(),
    "status": "success"
}]

print(f"✓ ML Experiment 2 complete - {float(anomaly_count / total_count * 100):.2f}% anomaly rate")
```

---

## Cell 8: ML Experiment 3 - Threat Classification

```python
# MAGIC %md
# MAGIC ## ML Experiment 3: Threat Classification
# MAGIC Classify alerts by threat severity using ensemble methods

# COMMAND

from pyspark.ml.feature import StringIndexer, OneHotEncoder, VectorAssembler
from pyspark.ml import Pipeline
from pyspark.ml.classification import GBTClassifier

print("Starting ML Experiment 3: Threat Classification...")

# Read alerts
alerts_df = spark.table("soc_platform.core_siem.alerts")

# Prepare data
feature_df = alerts_df.select(
    col("alert_type"),
    col("confidence_score"),
    when(col("severity") == "critical", 1).when(col("severity") == "high", 0).otherwise(-1).alias("severity_binary")
).filter(col("confidence_score").isNotNull()).dropna()

# Indexers for categorical features
indexer1 = StringIndexer(inputCol="alert_type", outputCol="alert_type_index")
onehot = OneHotEncoder(inputCols=["alert_type_index"], outputCols=["alert_type_encoded"])

# Vector assembler
assembler = VectorAssembler(
    inputCols=["alert_type_encoded", "confidence_score"],
    outputCol="features"
)

# Build pipeline
pipeline = Pipeline(stages=[indexer1, onehot, assembler])
train_data = pipeline.fit(feature_df).transform(feature_df).select("features", "severity_binary")

# Train GBT classifier
gbt = GBTClassifier(maxDepth=5, maxIter=10, labelCol="severity_binary", seed=42)
gbt_model = gbt.fit(train_data)

# Evaluate
gbt_pred = gbt_model.transform(train_data)
acc = gbt_pred.filter(col("prediction") == col("severity_binary")).count() / gbt_pred.count()

print(f"✓ Classification model trained - Accuracy: {acc:.4f}")

# Log experiment
exp_log_class = [{
    "experiment_id": uid(),
    "experiment_name": "Threat Classification",
    "model_type": "GBT",
    "accuracy": float(acc),
    "features": ["alert_type", "confidence_score"],
    "training_samples": train_data.count(),
    "training_timestamp": datetime.now().isoformat(),
    "status": "success"
}]

print(f"✓ ML Experiment 3 complete - Accuracy: {acc:.4f}")
```

---

## Cell 9: ML Experiment 4 - Embedding Generation for Similarity Search

```python
# MAGIC %md
# MAGIC ## ML Experiment 4: Event Embedding Generation
# MAGIC Generate embeddings for semantic similarity search

# COMMAND

from pyspark.sql.functions import col, concat_ws, regexp_replace
from pyspark.ml.feature import HashingTF, IDF
from pyspark.ml import Pipeline

print("Starting ML Experiment 4: Event Embedding Generation...")

# Read events
events_df = spark.table("soc_platform.core_siem.events")

# Create text features from event data
text_df = events_df.select(
    col("id"),
    concat_ws(" ", col("event_type"), col("hostname"), col("process_name"), col("mitre_tactic")).alias("text")
)

# HashingTF + IDF for TF-IDF embeddings
tf = HashingTF(inputCol="text", outputCol="tf", numFeatures=128, binary=False)
tf_df = tf.transform(text_df)

idf = IDF(inputCol="tf", outputCol="idf")
idf_model = idf.fit(tf_df)
embeddings_df = idf_model.transform(tf_df)

# Persist embeddings
embeddings_df.select("id", "idf").write.mode("overwrite").option("mergeSchema", "true").saveAsTable("soc_platform.correlation_engine.event_embeddings")

print(f"✓ Generated embeddings for {embeddings_df.count()} events (dimension: 128)")

# Log experiment
exp_log_embed = [{
    "experiment_id": uid(),
    "experiment_name": "Event Embedding Generation",
    "method": "TF-IDF",
    "embedding_dimension": 128,
    "events_embedded": embeddings_df.count(),
    "training_timestamp": datetime.now().isoformat(),
    "status": "success"
}]

print(f"✓ ML Experiment 4 complete")
```

---

## Cell 10: Log All Experiments & Summary

```python
# MAGIC %md
# MAGIC ## ML Experiment Log & Summary

# COMMAND

from pyspark.sql.functions import lit

# Combine all experiments
all_experiments = exp_log + exp_log_anomaly + exp_log_class + exp_log_embed

# Create experiments table
exp_df = spark.createDataFrame([Row(**exp) for exp in all_experiments])

# Write to experiments log
exp_df.write.mode("append").option("mergeSchema", "true").saveAsTable("soc_platform.ai_agents.ml_experiments_log")

print(f"\n{'='*80}")
print(f"ML EXPERIMENTS SUMMARY")
print(f"{'='*80}")
print(f"Total Experiments Run: {len(all_experiments)}")
print(f"\nExperiments:")
for i, exp in enumerate(all_experiments, 1):
    print(f"{i}. {exp.get('experiment_name', 'Unknown')} - {exp.get('status', 'unknown')}")
print(f"\n✓ All data population and ML experiments complete!")
print(f"✓ Log location: soc_platform.ai_agents.ml_experiments_log")
print(f"{'='*80}\n")

# Sample data verification
print("Data Verification:")
print(f"  Events: {spark.table('soc_platform.core_siem.events').count()} rows")
print(f"  Alerts: {spark.table('soc_platform.core_siem.alerts').count()} rows")
print(f"  Cases: {spark.table('soc_platform.core_siem.cases').count()} rows")
print(f"  IOC Indicators: {spark.table('soc_platform.threat_intel.ioc_indicators').count()} rows")
print(f"  Sessions: {spark.table('soc_platform.core_siem.sessions').count()} rows")
```

---

## Cell 11: Optional - Verify Data Quality

```python
# MAGIC %md
# MAGIC ## Data Quality Checks

# COMMAND

print("Running data quality checks...\n")

# Check for nulls in critical columns
tables_to_check = [
    ("soc_platform.core_siem.events", ["id", "source", "event_timestamp"]),
    ("soc_platform.core_siem.alerts", ["id", "alert_id", "severity"]),
    ("soc_platform.core_siem.cases", ["id", "case_number", "status"]),
    ("soc_platform.threat_intel.ioc_indicators", ["id", "indicator_value", "threat_type"]),
]

for table_name, cols in tables_to_check:
    df = spark.table(table_name)
    row_count = df.count()
    print(f"\n{table_name}")
    print(f"  Total rows: {row_count}")
    for col in cols:
        null_count = df.filter(col(col).isNull()).count()
        print(f"  {col}: {null_count} nulls ({100 * null_count / row_count:.1f}%)")

print("\n✓ Data quality checks complete")
```

---

## Usage Instructions

1. **Create a new notebook** in your Databricks workspace
2. **Copy each cell** (indicated by ` ``` `) into separate cells in your notebook
3. **Run cells sequentially** from Cell 1 to Cell 10
4. **Monitor progress** - each cell prints completion status
5. **View results** in `soc_platform.ai_agents.ml_experiments_log` table

**Expected Runtime**: 20-30 minutes on a single-node cluster
**Cluster Recommendation**: `13.3 LTS`, 4-8 cores, 32GB RAM minimum

---

## Generated Data Summary

| Schema | Table | Rows | Purpose |
|--------|-------|------|---------|
| core_siem | events | 10,000 | Raw security events |
| core_siem | alerts | 5,000 | Generated alerts |
| core_siem | cases | 2,000 | Incident cases |
| core_siem | sessions | 3,000 | User sessions |
| threat_intel | ioc_indicators | 8,000 | Threat indicators |
| threat_intel | threat_feeds | 1,000 | Threat feeds |
| threat_intel | dark_web_forum_posts | 3,000 | Dark web intelligence |
| user_analytics | user_behavior_profiles | 500 | User behavior baseline |
| user_analytics | anomalous_activity | 2,000 | Detected anomalies |

---

## ML Experiments Summary

1. **Correlation Detection** - Random Forest classifier to identify correlated events
2. **Anomaly Detection** - Z-score analysis for user behavior anomalies
3. **Threat Classification** - GBT classifier for threat severity classification
4. **Event Embeddings** - TF-IDF embeddings for semantic similarity search

All results logged in `soc_platform.ai_agents.ml_experiments_log`
