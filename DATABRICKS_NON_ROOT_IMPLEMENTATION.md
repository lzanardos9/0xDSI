# Databricks Non-Root Implementation Guide

Complete step-by-step guide to deploy the entire SIEM application on Databricks in a shared environment with no root access.

---

## 🎯 Overview

This guide shows you how to run your **Supabase SIEM application** on top of **Databricks** as the data lakehouse backend, while keeping Supabase for the UI, authentication, and API layer.

**Architecture:**
```
[Security Data Sources]
    ↓
[Databricks Unity Catalog] ← Data storage, processing, ML
    ↓
[Databricks Workflows] ← ETL, correlation, automation
    ↓
[Supabase via REST API] ← Frontend UI, Auth, Edge Functions
    ↓
[React Web App] ← User Interface
```

---

## 📋 Prerequisites

### 1. **Databricks Access**
- Access to a Databricks workspace (shared or personal)
- Ability to create notebooks
- Ability to create workflows/jobs
- Compute cluster access (shared or personal cluster)

### 2. **Permissions You'll Need** (Request from Admin)
```sql
-- Unity Catalog permissions
GRANT SELECT ON TABLE system.access.audit TO `your_email@company.com`;
GRANT SELECT ON TABLE system.access.table_lineage TO `your_email@company.com`;
GRANT USE CATALOG ON CATALOG <your_catalog> TO `your_email@company.com`;
GRANT USE SCHEMA ON SCHEMA <your_catalog>.<your_schema> TO `your_email@company.com`;
GRANT CREATE TABLE ON SCHEMA <your_catalog>.<your_schema> TO `your_email@company.com`;
GRANT SELECT ON SCHEMA <your_catalog>.<your_schema> TO `your_email@company.com`;
GRANT MODIFY ON SCHEMA <your_catalog>.<your_schema> TO `your_email@company.com`;

-- If you need to create your own catalog
GRANT CREATE CATALOG ON METASTORE TO `your_email@company.com`;
```

### 3. **Supabase Project** (Already Set Up)
- Your Supabase project URL
- Your Supabase anon key
- Service role key (for backend operations)

### 4. **Databricks CLI** (Optional, for automation)
```bash
pip install databricks-cli
databricks configure --token
```

---

## 🚀 Implementation Steps

---

## STEP 1: Set Up Your Databricks Catalog Structure

### 1.1 Create Your Catalog (if permitted)

```sql
-- Run in Databricks SQL Editor or Notebook

-- Option A: Create new catalog (if you have permission)
CREATE CATALOG IF NOT EXISTS siem_platform;
USE CATALOG siem_platform;

-- Option B: Use existing catalog
USE CATALOG <your_username_or_shared_catalog>;

-- Create schemas
CREATE SCHEMA IF NOT EXISTS security_events;
CREATE SCHEMA IF NOT EXISTS threat_intelligence;
CREATE SCHEMA IF NOT EXISTS user_analytics;
CREATE SCHEMA IF NOT EXISTS compliance;
CREATE SCHEMA IF NOT EXISTS unity_audit;
```

### 1.2 Verify Catalog Access

```sql
-- Test your access
SHOW CATALOGS;
SHOW SCHEMAS IN CATALOG siem_platform;

-- Check permissions
DESCRIBE CATALOG EXTENDED siem_platform;
```

---

## STEP 2: Create Core Data Tables in Unity Catalog

### 2.1 Create Security Events Table

```sql
-- Run in Databricks SQL Editor

USE CATALOG siem_platform;
USE SCHEMA security_events;

-- Main events table with OCSF schema
CREATE TABLE IF NOT EXISTS events (
  event_id STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  event_type STRING,
  severity STRING,
  category STRING,

  -- OCSF fields
  class_uid INT,
  category_uid INT,
  activity_id INT,
  type_uid INT,

  -- Source information
  src_ip STRING,
  src_port INT,
  src_hostname STRING,

  -- Destination information
  dst_ip STRING,
  dst_port INT,
  dst_hostname STRING,

  -- User information
  user_id STRING,
  user_email STRING,
  user_name STRING,

  -- Additional context
  raw_data STRING,
  normalized_data STRING,
  metadata MAP<STRING, STRING>,

  -- ML/Vector fields
  embedding ARRAY<FLOAT>,
  risk_score DOUBLE,
  confidence_score DOUBLE,

  -- Timestamps
  ingestion_time TIMESTAMP DEFAULT current_timestamp(),
  processing_time TIMESTAMP,

  -- Partitioning
  event_date DATE GENERATED ALWAYS AS (CAST(event_time AS DATE))
)
USING DELTA
PARTITIONED BY (event_date, severity)
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);

-- Create indexes
CREATE INDEX idx_event_time ON events (event_time);
CREATE INDEX idx_user_email ON events (user_email);
CREATE INDEX idx_src_ip ON events (src_ip);
CREATE INDEX idx_risk_score ON events (risk_score);
```

### 2.2 Create Alerts Table

```sql
CREATE TABLE IF NOT EXISTS alerts (
  alert_id STRING NOT NULL,
  event_id STRING,
  alert_time TIMESTAMP DEFAULT current_timestamp(),
  alert_name STRING NOT NULL,
  alert_type STRING,
  severity STRING,
  status STRING DEFAULT 'open',

  -- Detection information
  rule_id STRING,
  rule_name STRING,
  correlation_ids ARRAY<STRING>,

  -- Risk scoring
  risk_score DOUBLE,
  confidence_score DOUBLE,
  false_positive_score DOUBLE,

  -- Assignment
  assigned_to STRING,
  assigned_time TIMESTAMP,

  -- Investigation
  investigation_notes STRING,
  resolution_status STRING,
  resolution_time TIMESTAMP,

  -- MITRE ATT&CK
  mitre_tactics ARRAY<STRING>,
  mitre_techniques ARRAY<STRING>,

  -- Context
  affected_assets ARRAY<STRING>,
  affected_users ARRAY<STRING>,

  metadata MAP<STRING, STRING>
)
USING DELTA
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true'
);
```

### 2.3 Create Threat Intelligence Tables

```sql
USE SCHEMA threat_intelligence;

CREATE TABLE IF NOT EXISTS iocs (
  ioc_id STRING NOT NULL,
  ioc_value STRING NOT NULL,
  ioc_type STRING NOT NULL,
  threat_type STRING,
  severity STRING,
  confidence_score DOUBLE,

  -- Source
  source STRING,
  feed_name STRING,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,

  -- Context
  description STRING,
  tags ARRAY<STRING>,

  -- Embedding for semantic search
  embedding ARRAY<FLOAT>,

  -- Metadata
  metadata MAP<STRING, STRING>,
  created_at TIMESTAMP DEFAULT current_timestamp(),
  updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA;

CREATE TABLE IF NOT EXISTS threat_feeds (
  feed_id STRING NOT NULL,
  feed_name STRING NOT NULL,
  feed_url STRING,
  feed_type STRING,
  last_updated TIMESTAMP,
  ioc_count BIGINT,
  status STRING,
  metadata MAP<STRING, STRING>
)
USING DELTA;
```

### 2.4 Create User Behavior Tables

```sql
USE SCHEMA user_analytics;

CREATE TABLE IF NOT EXISTS user_behavior_profiles (
  user_id STRING NOT NULL,
  user_email STRING NOT NULL,

  -- Behavioral baselines
  avg_login_time TIME,
  typical_locations ARRAY<STRING>,
  typical_devices ARRAY<STRING>,
  typical_applications ARRAY<STRING>,

  -- Risk metrics
  risk_score DOUBLE DEFAULT 0.0,
  anomaly_score DOUBLE DEFAULT 0.0,

  -- ML features
  behavior_embedding ARRAY<FLOAT>,

  -- Statistics
  total_events BIGINT DEFAULT 0,
  failed_logins_count BIGINT DEFAULT 0,
  privilege_escalations_count BIGINT DEFAULT 0,

  -- Timestamps
  profile_created TIMESTAMP DEFAULT current_timestamp(),
  last_updated TIMESTAMP DEFAULT current_timestamp(),
  last_seen TIMESTAMP
)
USING DELTA;

CREATE TABLE IF NOT EXISTS user_sessions (
  session_id STRING NOT NULL,
  user_id STRING NOT NULL,
  user_email STRING,

  session_start TIMESTAMP,
  session_end TIMESTAMP,
  duration_seconds BIGINT,

  source_ip STRING,
  location STRING,
  device_type STRING,

  events_count BIGINT,
  risk_score DOUBLE,
  anomaly_detected BOOLEAN DEFAULT false,

  metadata MAP<STRING, STRING>
)
USING DELTA
PARTITIONED BY (DATE(session_start));
```

---

## STEP 3: Create Databricks Notebooks for Data Ingestion

### 3.1 Create Notebook: `01_ingest_security_events`

Create a new notebook in Databricks and paste:

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # Security Events Ingestion
# MAGIC Ingest security events from various sources into Unity Catalog

# COMMAND ----------

from pyspark.sql import SparkSession
from pyspark.sql.functions import *
from pyspark.sql.types import *
import requests
import json
from datetime import datetime, timedelta

# COMMAND ----------

# Configuration - Store in Databricks Secrets
SUPABASE_URL = dbutils.secrets.get(scope="siem", key="supabase_url")
SUPABASE_KEY = dbutils.secrets.get(scope="siem", key="supabase_service_key")

# Unity Catalog configuration
CATALOG_NAME = "siem_platform"
SCHEMA_NAME = "security_events"
TABLE_NAME = "events"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define Event Schema

# COMMAND ----------

event_schema = StructType([
    StructField("event_id", StringType(), False),
    StructField("event_time", TimestampType(), False),
    StructField("event_type", StringType(), True),
    StructField("severity", StringType(), True),
    StructField("category", StringType(), True),
    StructField("class_uid", IntegerType(), True),
    StructField("src_ip", StringType(), True),
    StructField("dst_ip", StringType(), True),
    StructField("user_email", StringType(), True),
    StructField("raw_data", StringType(), True),
    StructField("risk_score", DoubleType(), True)
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ingest from Supabase (Initial Sync)

# COMMAND ----------

def fetch_supabase_events(hours_back=24):
    """Fetch events from Supabase for initial sync"""

    start_time = (datetime.now() - timedelta(hours=hours_back)).isoformat()

    url = f"{SUPABASE_URL}/rest/v1/events"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    params = {
        "timestamp": f"gte.{start_time}",
        "order": "timestamp.asc",
        "limit": 10000
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Failed to fetch events: {response.text}")

# Fetch events
events_data = fetch_supabase_events(hours_back=24)
print(f"Fetched {len(events_data)} events from Supabase")

# Convert to DataFrame
if events_data:
    events_df = spark.createDataFrame(events_data)

    # Transform to match Unity Catalog schema
    events_df = events_df.select(
        col("id").alias("event_id"),
        col("timestamp").cast("timestamp").alias("event_time"),
        col("event_type"),
        col("severity"),
        col("category"),
        col("metadata.class_uid").cast("int").alias("class_uid"),
        col("source_ip").alias("src_ip"),
        col("destination_ip").alias("dst_ip"),
        col("user_id").alias("user_email"),
        col("raw_log").alias("raw_data"),
        col("risk_score").cast("double").alias("risk_score")
    )

    # Write to Unity Catalog
    events_df.write \
        .mode("append") \
        .format("delta") \
        .saveAsTable(f"{CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}")

    print(f"Ingested {events_df.count()} events into Unity Catalog")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Ingestion from Cloud Storage

# COMMAND ----------

# Option 1: Ingest from S3/ADLS/GCS
# Configure your cloud storage path
CLOUD_STORAGE_PATH = "s3://your-bucket/security-logs/"

# Read streaming data
streaming_df = spark.readStream \
    .format("json") \
    .schema(event_schema) \
    .option("maxFilesPerTrigger", 100) \
    .load(CLOUD_STORAGE_PATH)

# Enrich events with processing timestamp
enriched_df = streaming_df \
    .withColumn("ingestion_time", current_timestamp()) \
    .withColumn("processing_time", current_timestamp()) \
    .withColumn("event_date", to_date(col("event_time")))

# Write to Unity Catalog (streaming)
query = enriched_df.writeStream \
    .format("delta") \
    .outputMode("append") \
    .option("checkpointLocation", f"/tmp/{TABLE_NAME}_checkpoint") \
    .trigger(processingTime="30 seconds") \
    .toTable(f"{CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Ingest from Kafka/Event Hubs (Real-time)

# COMMAND ----------

# Option 2: Ingest from Kafka
kafka_df = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "your-kafka-broker:9092") \
    .option("subscribe", "security-events") \
    .option("startingOffsets", "latest") \
    .load()

# Parse JSON from Kafka
parsed_df = kafka_df.select(
    from_json(col("value").cast("string"), event_schema).alias("data")
).select("data.*")

# Write to Unity Catalog
kafka_query = parsed_df.writeStream \
    .format("delta") \
    .outputMode("append") \
    .option("checkpointLocation", "/tmp/kafka_checkpoint") \
    .trigger(processingTime="10 seconds") \
    .toTable(f"{CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## View Ingested Data

# COMMAND ----------

# Query recent events
recent_events = spark.sql(f"""
    SELECT
        event_id,
        event_time,
        event_type,
        severity,
        src_ip,
        user_email,
        risk_score
    FROM {CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}
    WHERE event_time >= current_timestamp() - INTERVAL 1 HOUR
    ORDER BY event_time DESC
    LIMIT 100
""")

display(recent_events)

# COMMAND ----------

# Statistics
stats = spark.sql(f"""
    SELECT
        COUNT(*) as total_events,
        COUNT(DISTINCT user_email) as unique_users,
        COUNT(DISTINCT src_ip) as unique_ips,
        AVG(risk_score) as avg_risk_score,
        MAX(event_time) as latest_event
    FROM {CATALOG_NAME}.{SCHEMA_NAME}.{TABLE_NAME}
    WHERE event_date = current_date()
""")

display(stats)
```

### 3.2 Create Notebook: `02_unity_catalog_audit_monitor`

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # Unity Catalog Audit Monitoring
# MAGIC Monitor Unity Catalog audit logs for security threats

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.window import Window
import requests
import json

# COMMAND ----------

# Configuration
CATALOG_NAME = "siem_platform"
SUPABASE_URL = dbutils.secrets.get(scope="siem", key="supabase_url")
SUPABASE_KEY = dbutils.secrets.get(scope="siem", key="supabase_service_key")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Read Unity Catalog Audit Logs

# COMMAND ----------

# Read system audit logs
audit_df = spark.table("system.access.audit") \
    .filter(col("event_time") >= current_timestamp() - expr("INTERVAL 1 HOUR"))

# Display sample
display(audit_df.limit(10))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detect Suspicious Activities

# COMMAND ----------

# Detect privilege escalation attempts
privilege_escalation = audit_df.filter(
    (col("action_name") == "updatePermissions") |
    (col("action_name") == "grantPrivileges")
).withColumn("risk_score", lit(80.0))

# Detect unauthorized access attempts
unauthorized_access = audit_df.filter(
    col("response.status_code") == 403
).withColumn("risk_score", lit(70.0))

# Detect mass data exports
window_spec = Window.partitionBy("user_identity.email").orderBy("event_time")

mass_exports = audit_df.filter(
    col("action_name").isin(["getTable", "readFiles"])
).withColumn(
    "export_count",
    count("*").over(window_spec.rangeBetween(-3600, 0))
).filter(
    col("export_count") > 100
).withColumn("risk_score", lit(90.0))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Combine and Enrich Threats

# COMMAND ----------

# Union all threat types
all_threats = privilege_escalation \
    .unionByName(unauthorized_access, allowMissingColumns=True) \
    .unionByName(mass_exports, allowMissingColumns=True)

# Enrich with additional context
enriched_threats = all_threats.select(
    col("request_id").alias("event_id"),
    col("workspace_id"),
    col("event_time"),
    col("user_identity.email").alias("user_email"),
    col("action_name"),
    col("request_params.catalog_name").alias("catalog_name"),
    col("request_params.schema_name").alias("schema_name"),
    col("request_params.table_name").alias("table_name"),
    col("response.status_code").alias("status_code"),
    col("risk_score"),
    current_timestamp().alias("detected_at")
)

display(enriched_threats)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Send Alerts to Supabase

# COMMAND ----------

def send_alert_to_supabase(alert_data):
    """Send high-risk alerts to Supabase SIEM"""

    url = f"{SUPABASE_URL}/rest/v1/unity_catalog_audit_events"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    response = requests.post(url, headers=headers, data=json.dumps(alert_data))
    return response.status_code

# Send high-risk threats to Supabase
high_risk_threats = enriched_threats.filter(col("risk_score") >= 70.0).collect()

sent_count = 0
for threat in high_risk_threats:
    alert_payload = {
        "event_id": threat.event_id,
        "workspace_id": threat.workspace_id,
        "event_time": threat.event_time.isoformat() if threat.event_time else None,
        "user_email": threat.user_email,
        "action_name": threat.action_name,
        "catalog_name": threat.catalog_name,
        "schema_name": threat.schema_name,
        "table_name": threat.table_name,
        "risk_score": float(threat.risk_score),
        "source": "databricks_unity_catalog"
    }

    status = send_alert_to_supabase(alert_payload)
    if status in [200, 201]:
        sent_count += 1

print(f"Sent {sent_count} high-risk alerts to Supabase")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save to Unity Catalog

# COMMAND ----------

# Save enriched threats to Unity Catalog for historical analysis
enriched_threats.write \
    .mode("append") \
    .format("delta") \
    .saveAsTable(f"{CATALOG_NAME}.unity_audit.audit_events")

print(f"Saved {enriched_threats.count()} audit events to Unity Catalog")
```

---

## STEP 4: Set Up Databricks Secrets

### 4.1 Create Secret Scope

```bash
# Using Databricks CLI
databricks secrets create-scope --scope siem

# Or use the UI: Settings → Secrets → Create Scope
```

### 4.2 Add Secrets

```bash
# Add Supabase credentials
databricks secrets put --scope siem --key supabase_url
# Paste your Supabase URL when prompted

databricks secrets put --scope siem --key supabase_anon_key
# Paste your anon key

databricks secrets put --scope siem --key supabase_service_key
# Paste your service role key
```

---

## STEP 5: Create Databricks Workflows

### 5.1 Create Workflow: Security Events ETL

In Databricks UI:

1. Go to **Workflows** → **Create Job**
2. Configure:

```yaml
Job Name: SIEM Security Events ETL
Schedule: Every 15 minutes (cron: 0 */15 * * * ?)

Tasks:
  - Task 1: Ingest Security Events
    Type: Notebook
    Notebook Path: /Workspace/siem/01_ingest_security_events
    Cluster: <your-cluster-id>

  - Task 2: Unity Catalog Audit Monitor
    Type: Notebook
    Notebook Path: /Workspace/siem/02_unity_catalog_audit_monitor
    Cluster: <your-cluster-id>
    Depends On: Task 1
```

### 5.2 Create Workflow: Real-time Correlation

```yaml
Job Name: SIEM Real-time Correlation Engine
Type: Continuous (Always Running)

Tasks:
  - Task 1: Stream Processor
    Type: Notebook
    Notebook Path: /Workspace/siem/03_streaming_correlation
    Cluster: <your-cluster-id>
```

---

## STEP 6: Create ML Models for Threat Detection

### 6.1 Create Notebook: `03_ml_threat_detection`

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # ML Threat Detection Models

# COMMAND ----------

from pyspark.ml.feature import VectorAssembler, StandardScaler
from pyspark.ml.clustering import KMeans
from pyspark.ml.classification import RandomForestClassifier
from pyspark.ml import Pipeline
import mlflow
import mlflow.spark

# COMMAND ----------

# Read events from Unity Catalog
events_df = spark.table("siem_platform.security_events.events") \
    .filter(col("event_date") >= current_date() - 7)

# COMMAND ----------

# MAGIC %md
# MAGIC ## User Behavior Anomaly Detection (Unsupervised)

# COMMAND ----------

# Feature engineering
user_features = events_df.groupBy("user_email").agg(
    count("*").alias("event_count"),
    countDistinct("src_ip").alias("unique_ips"),
    countDistinct("event_type").alias("unique_event_types"),
    avg("risk_score").alias("avg_risk_score"),
    sum(when(col("severity") == "critical", 1).otherwise(0)).alias("critical_events"),
    hour(max("event_time")).alias("last_activity_hour")
)

# Assemble features
assembler = VectorAssembler(
    inputCols=["event_count", "unique_ips", "unique_event_types",
               "avg_risk_score", "critical_events", "last_activity_hour"],
    outputCol="features"
)

scaler = StandardScaler(inputCol="features", outputCol="scaled_features")

# K-Means clustering
kmeans = KMeans(k=5, seed=42, featuresCol="scaled_features", predictionCol="cluster")

# Create pipeline
pipeline = Pipeline(stages=[assembler, scaler, kmeans])

# Train model
with mlflow.start_run(run_name="user_behavior_clustering"):
    model = pipeline.fit(user_features)

    # Log model
    mlflow.spark.log_model(model, "model")

    # Predictions
    predictions = model.transform(user_features)

    # Log metrics
    mlflow.log_metric("num_clusters", 5)
    mlflow.log_metric("num_users", user_features.count())

# Identify anomalous clusters (small clusters = anomalies)
cluster_sizes = predictions.groupBy("cluster").count().orderBy("count")
display(cluster_sizes)

# Tag users in small clusters as anomalous
anomalous_users = predictions.join(
    cluster_sizes.filter(col("count") < 10),
    on="cluster"
).select("user_email", "cluster", "count")

display(anomalous_users)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Save Anomalies to Unity Catalog

# COMMAND ----------

anomalous_users.withColumn("detected_at", current_timestamp()) \
    .withColumn("anomaly_type", lit("behavioral_clustering")) \
    .write \
    .mode("append") \
    .saveAsTable("siem_platform.user_analytics.user_anomalies")
```

---

## STEP 7: Connect Databricks to Supabase (Bi-directional Sync)

### 7.1 Create Notebook: `04_sync_to_supabase`

```python
# Databricks notebook source
# MAGIC %md
# MAGIC # Bi-directional Sync: Databricks ↔ Supabase

# COMMAND ----------

import requests
import json
from pyspark.sql.functions import *

# COMMAND ----------

SUPABASE_URL = dbutils.secrets.get(scope="siem", key="supabase_url")
SUPABASE_KEY = dbutils.secrets.get(scope="siem", key="supabase_service_key")
CATALOG_NAME = "siem_platform"

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sync Alerts from Databricks → Supabase

# COMMAND ----------

def sync_alerts_to_supabase():
    """Push new alerts from Databricks to Supabase"""

    # Get alerts from last hour that haven't been synced
    alerts_df = spark.sql(f"""
        SELECT
            alert_id,
            event_id,
            alert_time,
            alert_name,
            alert_type,
            severity,
            status,
            risk_score,
            rule_name,
            mitre_tactics,
            mitre_techniques
        FROM {CATALOG_NAME}.security_events.alerts
        WHERE alert_time >= current_timestamp() - INTERVAL 1 HOUR
          AND sync_status IS NULL
    """)

    alerts = alerts_df.collect()

    url = f"{SUPABASE_URL}/rest/v1/alerts"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal"
    }

    synced_count = 0
    for alert in alerts:
        payload = {
            "id": alert.alert_id,
            "event_id": alert.event_id,
            "timestamp": alert.alert_time.isoformat() if alert.alert_time else None,
            "name": alert.alert_name,
            "type": alert.alert_type,
            "severity": alert.severity,
            "status": alert.status,
            "risk_score": float(alert.risk_score) if alert.risk_score else 0,
            "source": "databricks"
        }

        response = requests.post(url, headers=headers, data=json.dumps(payload))

        if response.status_code in [200, 201]:
            synced_count += 1

            # Mark as synced in Databricks
            spark.sql(f"""
                UPDATE {CATALOG_NAME}.security_events.alerts
                SET sync_status = 'synced', sync_time = current_timestamp()
                WHERE alert_id = '{alert.alert_id}'
            """)

    return synced_count

synced = sync_alerts_to_supabase()
print(f"Synced {synced} alerts to Supabase")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Sync User Actions from Supabase → Databricks

# COMMAND ----------

def sync_user_actions_from_supabase():
    """Pull user actions (case updates, alert resolutions) from Supabase"""

    url = f"{SUPABASE_URL}/rest/v1/alert_updates"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }

    # Get updates from last hour
    params = {
        "updated_at": f"gte.{(datetime.now() - timedelta(hours=1)).isoformat()}",
        "synced_to_databricks": "is.false"
    }

    response = requests.get(url, headers=headers, params=params)

    if response.status_code == 200:
        updates = response.json()

        if updates:
            updates_df = spark.createDataFrame(updates)

            # Apply updates to Databricks alerts
            for update in updates:
                spark.sql(f"""
                    UPDATE {CATALOG_NAME}.security_events.alerts
                    SET
                        status = '{update['status']}',
                        assigned_to = '{update['assigned_to']}',
                        resolution_notes = '{update['notes']}',
                        updated_at = current_timestamp()
                    WHERE alert_id = '{update['alert_id']}'
                """)

            # Mark as synced in Supabase
            for update in updates:
                requests.patch(
                    f"{SUPABASE_URL}/rest/v1/alert_updates?id=eq.{update['id']}",
                    headers=headers,
                    data=json.dumps({"synced_to_databricks": True})
                )

            return len(updates)

    return 0

synced_actions = sync_user_actions_from_supabase()
print(f"Synced {synced_actions} user actions from Supabase")
```

---

## STEP 8: Deploy Supabase Edge Functions for Databricks Integration

The existing edge functions in your project already support this! Update them to query Databricks:

### 8.1 Update `supabase/functions/etl-ingest/index.ts`

Add Databricks SQL endpoint support:

```typescript
// Add this to your etl-ingest function
const DATABRICKS_HOST = Deno.env.get('DATABRICKS_HOST');
const DATABRICKS_TOKEN = Deno.env.get('DATABRICKS_TOKEN');
const DATABRICKS_HTTP_PATH = Deno.env.get('DATABRICKS_HTTP_PATH');

async function queryDatabricks(sql: string) {
  const response = await fetch(
    `https://${DATABRICKS_HOST}/api/2.0/sql/statements`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        statement: sql,
        warehouse_id: DATABRICKS_HTTP_PATH,
        wait_timeout: '30s',
      }),
    }
  );

  return await response.json();
}
```

---

## STEP 9: Test End-to-End Flow

### 9.1 Generate Test Security Event

```python
# Run in Databricks notebook
from datetime import datetime
import uuid

test_event = [{
    "event_id": str(uuid.uuid4()),
    "event_time": datetime.now(),
    "event_type": "authentication_failed",
    "severity": "high",
    "category": "authentication",
    "src_ip": "192.168.1.100",
    "user_email": "test@company.com",
    "raw_data": '{"login_attempt": "failed", "reason": "invalid_password"}',
    "risk_score": 75.0
}]

test_df = spark.createDataFrame(test_event)
test_df.write.mode("append").saveAsTable("siem_platform.security_events.events")

print("Test event created")
```

### 9.2 Verify in Supabase

```sql
-- Run in Supabase SQL Editor
SELECT * FROM events
WHERE source = 'databricks'
ORDER BY timestamp DESC
LIMIT 10;
```

### 9.3 Verify in Web UI

Open your React app → Dashboard → should see the test event appear!

---

## STEP 10: Production Configuration

### 10.1 Enable Delta Lake Optimizations

```sql
-- Run in Databricks SQL Editor
USE CATALOG siem_platform;

-- Enable auto-optimize for all tables
ALTER TABLE security_events.events SET TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
);

-- Enable change data feed (for streaming)
ALTER TABLE security_events.events SET TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true'
);

-- Set data retention
ALTER TABLE security_events.events SET TBLPROPERTIES (
    'delta.deletedFileRetentionDuration' = 'interval 7 days'
);
```

### 10.2 Set Up Table Maintenance

Create notebook `05_table_maintenance`:

```python
# Databricks notebook source
# Optimize and vacuum tables

from delta.tables import DeltaTable

# COMMAND ----------

# Optimize tables
spark.sql("OPTIMIZE siem_platform.security_events.events ZORDER BY (event_time, user_email)")
spark.sql("OPTIMIZE siem_platform.security_events.alerts ZORDER BY (alert_time, severity)")

# COMMAND ----------

# Vacuum old files (7 days retention)
spark.sql("VACUUM siem_platform.security_events.events RETAIN 168 HOURS")
spark.sql("VACUUM siem_platform.security_events.alerts RETAIN 168 HOURS")

# COMMAND ----------

print("Table maintenance completed")
```

Schedule this to run daily.

---

## 📊 Architecture Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    DATA SOURCES                              │
│  (Firewalls, EDR, Cloud Logs, Applications, Users)          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│              DATABRICKS UNITY CATALOG                        │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐       │
│  │   Events     │  │   Alerts     │  │    IOCs     │       │
│  │  (Delta)     │  │  (Delta)     │  │  (Delta)    │       │
│  └──────────────┘  └──────────────┘  └─────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐       │
│  │ User Behavior│  │ Unity Audit  │  │  ML Models  │       │
│  │  (Delta)     │  │  (Delta)     │  │ (MLflow)    │       │
│  └──────────────┘  └──────────────┘  └─────────────┘       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│            DATABRICKS WORKFLOWS                              │
│  • Security Events ETL (Every 15 min)                        │
│  • Unity Audit Monitor (Every 15 min)                        │
│  • ML Threat Detection (Hourly)                              │
│  • Sync to Supabase (Every 5 min)                            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  SUPABASE LAYER                              │
│                                                              │
│  ┌──────────────────┐      ┌───────────────────┐           │
│  │  Edge Functions  │◄────►│  PostgreSQL DB    │           │
│  │  (API Gateway)   │      │  (UI State Only)  │           │
│  └────────┬─────────┘      └───────────────────┘           │
│           │                                                  │
│           │                 ┌───────────────────┐           │
│           └────────────────►│  Authentication   │           │
│                             │  (Auth.users)     │           │
│                             └───────────────────┘           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 REACT WEB APPLICATION                        │
│  • Dashboard • Alerts • Threat Hunting • Cases              │
│  • Reports • Compliance • User Management                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎯 What You Get

✅ **Data Storage**: All security data in Databricks Unity Catalog (Delta Lake)
✅ **Processing**: Spark-based ETL, correlation, and ML in Databricks
✅ **Governance**: Unity Catalog for access control and audit
✅ **Real-time**: Streaming ingestion and correlation
✅ **UI/Auth**: Supabase frontend with your React app
✅ **Scale**: Handles petabytes of security data
✅ **Cost**: Pay only for what you use in Databricks

---

## 📚 Next Steps

1. **Run the migration scripts** in Databricks SQL Editor
2. **Create the notebooks** for data ingestion
3. **Set up Databricks secrets** for Supabase credentials
4. **Schedule workflows** for automated processing
5. **Test end-to-end** with sample events
6. **Monitor performance** in Databricks UI

All data processing happens in Databricks, while your existing React UI and Supabase Auth remain unchanged!
