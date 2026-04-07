# Graph-Based Correlation & Pattern Discovery Architecture

## Overview
Advanced correlation engine using **Spark Streaming**, **GraphX**, and **Databricks Lakehouse** for real-time graph-based threat detection and pattern discovery.

## Complete Architecture Stack

```
┌─────────────────────────────────────────────────────────────────┐
│                     Data Sources & Ingestion                     │
│  (Firewalls, IDS/IPS, EDR, Cloud Logs, Network Traffic, etc.)  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Supabase Event Buffer (PostgreSQL)              │
│              Real-time ingestion queue with RLS                  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Databricks Lakehouse (Delta Lake)                   │
│  ┌───────────┬────────────────┬─────────────────────────────┐  │
│  │ Bronze    │ Silver         │ Gold                        │  │
│  │ Raw Events│ Normalized     │ Enriched + Correlated      │  │
│  │ (1-7 days)│ (7-30 days)    │ (30-90 days)               │  │
│  └───────────┴────────────────┴─────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│            Spark Streaming Processing Engine                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  Stream 1: Event Normalization & Enrichment             │   │
│  │  Stream 2: Graph Construction (Entities & Relationships)│   │
│  │  Stream 3: Real-time Graph Analytics (GraphX)           │   │
│  │  Stream 4: Pattern Discovery (Graph Algorithms)         │   │
│  │  Stream 5: ML Anomaly Detection (Spark MLlib)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Graph Database Layer (Supabase)                │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  graph_nodes, graph_edges, graph_patterns              │   │
│  │  graph_correlations, detected_attack_sequences          │   │
│  │  threat_campaigns, databricks_sync_status               │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│              Correlation & Alert Generation                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  - Attack Chain Detection (path finding)               │   │
│  │  - Community Detection (insider threat groups)         │   │
│  │  - Centrality Analysis (key targets/attackers)         │   │
│  │  - PageRank (threat propagation)                       │   │
│  │  - Connected Components (campaign detection)           │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Real-time Visualization & Alerts                │
│        (Frontend UI with Supabase Realtime subscriptions)        │
└─────────────────────────────────────────────────────────────────┘
```

## Graph Data Model

### Nodes (Entities) - 9 Types
1. **ip_address** - Internal/external IP addresses
2. **user** - User accounts, service accounts
3. **asset** - Hosts, servers, endpoints, devices
4. **file** - Documents, executables, malware samples
5. **process** - Running processes, services
6. **domain** - DNS names, URLs, domains
7. **port** - Network ports and services
8. **vulnerability** - CVEs, exploits, weaknesses
9. **threat_actor** - Known APT groups, attackers

### Edges (Relationships) - 11 Types
1. **CONNECTS_TO** - Network connections between IPs
2. **AUTHENTICATES_AS** - User login events to systems
3. **ACCESSES** - File or resource access
4. **EXECUTES** - Process execution events
5. **RESOLVES_TO** - DNS resolution
6. **EXPLOITS** - Vulnerability exploitation
7. **DOWNLOADS** - File download events
8. **UPLOADS** - Data exfiltration, file uploads
9. **RELATED_TO** - IOC associations, threat intelligence
10. **PART_OF** - Campaign membership
11. **COMMUNICATES_WITH** - Bi-directional communication

### Edge Properties
- **weight**: Event frequency (higher = more events)
- **first_seen**: Timestamp of first occurrence
- **last_seen**: Timestamp of most recent occurrence
- **severity**: Risk level (critical, high, medium, low, info)
- **confidence**: Detection confidence (0.0 - 1.0)
- **event_ids**: Array of related event UUIDs
- **properties**: JSON metadata (ports, protocols, sizes, etc.)

## Databricks Lakehouse Architecture

### Bronze Layer - Raw Events
```
Path: /mnt/delta/bronze/raw_events
Format: Delta Lake (Parquet + transaction log)
Schema: Raw JSON/Parquet from Supabase
Retention: 7 days hot, then archive to S3/ADLS
Partitioning: By timestamp (hourly partitions)
Optimization: Z-ordering on (source_ip, event_type)
Compaction: Auto-compaction enabled
```

**Example Bronze Schema:**
```json
{
  "id": "uuid",
  "source_id": "firewall-01",
  "source_type": "firewall",
  "raw_data": { /* original event */ },
  "received_at": "2025-10-20T10:30:00Z",
  "processing_status": "pending"
}
```

### Silver Layer - Normalized (OCSF)
```
Path: /mnt/delta/silver/events
Format: Delta Lake with schema enforcement
Schema: OCSF 1.0.0 compliant structured schema
Retention: 30 days
Features:
  - Deduplicated events
  - Standardized field names
  - Type enforcement
  - Basic enrichment (GeoIP, threat intel)
Partitioning: By date and event_category
Optimization: Z-ordering on (event_type, severity, source_ip)
```

**Example Silver Schema:**
```json
{
  "event_id": "uuid",
  "event_timestamp": "2025-10-20T10:30:00Z",
  "event_type": "authentication_failure",
  "severity": "high",
  "source_ip": "192.168.1.100",
  "dest_ip": "10.0.0.5",
  "username": "admin",
  "message": "Failed login attempt",
  "ocsf_class": "authentication",
  "ocsf_category": "iam"
}
```

### Gold Layer - Enriched & Correlated
```
Path: /mnt/delta/gold/
Subfolders:
  - events/ (fully enriched events)
  - graph_nodes/ (extracted entities)
  - graph_edges/ (relationships)
  - analytics/ (graph algorithm results)
  - patterns/ (detected patterns)
  - ml/ (anomaly detection results)

Retention: 90 days hot, 365 days warm
Features:
  - Complete enrichment (GeoIP, TI, asset, user context)
  - Graph relationships computed
  - Correlation results embedded
  - ML predictions included
  - Risk scoring applied
Partitioning: By date, severity, and pattern_type
Optimization: Liquid clustering for flexible queries
Time Travel: Enabled for forensics and audit
```

## Spark Streaming Jobs

### Job 1: Event Ingestion & Normalization
```python
# Read from Supabase via JDBC or REST API
events_stream = spark.readStream \
    .format("jdbc") \
    .option("url", SUPABASE_JDBC_URL) \
    .option("dbtable", "raw_event_buffer") \
    .load()

# Write to Bronze
events_stream.writeStream \
    .format("delta") \
    .option("checkpointLocation", "/checkpoints/bronze") \
    .start("/mnt/delta/bronze/raw_events")

# Parse and normalize to OCSF
normalized = events_stream \
    .select(parse_to_ocsf(col("raw_data")))

# Write to Silver
normalized.writeStream \
    .format("delta") \
    .option("checkpointLocation", "/checkpoints/silver") \
    .start("/mnt/delta/silver/events")
```

**Throughput**: 100,000+ EPS
**Latency**: < 100ms per event
**Window**: 30-second micro-batches

### Job 2: Graph Construction
```python
def extract_nodes_and_edges(batch_df, batch_id):
    # Extract IP nodes
    ip_nodes = batch_df.select(
        col("source_ip").alias("node_id"),
        lit("ip_address").alias("node_type"),
        struct(*).alias("properties")
    )

    # Extract edges
    edges = batch_df.select(
        col("source_ip").alias("src"),
        col("dest_ip").alias("dst"),
        lit("CONNECTS_TO").alias("relationship"),
        col("event_timestamp")
    )

    # Write to Gold + Supabase
    nodes.write.format("delta").mode("append") \
        .save("/mnt/delta/gold/graph_nodes")

    nodes.write.format("jdbc") \
        .option("url", SUPABASE_JDBC_URL) \
        .option("dbtable", "graph_nodes") \
        .mode("append").save()

# Apply with 5-minute tumbling windows
windowed_events.writeStream \
    .foreachBatch(extract_nodes_and_edges) \
    .start()
```

**Window**: 5-minute tumbling windows
**Watermark**: 2-minute late data tolerance
**Output**: Nodes and edges to Delta Lake + Supabase

### Job 3: GraphX Analytics
```python
# Load graph snapshot
nodes_df = spark.read.format("delta") \
    .load("/mnt/delta/gold/graph_nodes")
edges_df = spark.read.format("delta") \
    .load("/mnt/delta/gold/graph_edges")

# Create GraphFrame
graph = GraphFrame(nodes_df, edges_df)

# Algorithm 1: PageRank - Identify important nodes
pagerank = graph.pageRank(resetProbability=0.15, maxIter=10)
important_nodes = pagerank.vertices \
    .orderBy(desc("pagerank")).limit(100)

# Algorithm 2: Connected Components - Find attack clusters
components = graph.connectedComponents()

# Algorithm 3: Label Propagation - Community detection
communities = graph.labelPropagation(maxIter=5)

# Algorithm 4: Triangle Count - Detect complex relationships
triangles = graph.triangleCount()

# Algorithm 5: Shortest Paths - Attack propagation
landmarks = ["malicious_ip_1", "malicious_ip_2"]
paths = graph.shortestPaths(landmarks=landmarks)
```

**Frequency**: Every 5 minutes
**Algorithms**: 5 graph analytics algorithms
**Output**: Analytics results to Gold layer

### Job 4: Pattern Discovery (Motif Finding)
```python
# Pattern 1: Lateral Movement (3-hop)
lateral_movement = graph.find(
    "(user)-[auth]->(host1); " +
    "(host1)-[conn1]->(host2); " +
    "(host2)-[conn2]->(host3)"
).filter(
    "auth.relationship = 'AUTHENTICATES_AS' AND " +
    "conn1.relationship = 'CONNECTS_TO' AND " +
    "conn2.relationship = 'CONNECTS_TO' AND " +
    "auth.event_timestamp < conn1.event_timestamp AND " +
    "conn1.event_timestamp < conn2.event_timestamp"
)

# Pattern 2: Data Exfiltration
exfiltration = graph.find(
    "(internal)-[access]->(file); " +
    "(file)-[upload]->(external)"
).filter(
    "upload.relationship = 'UPLOADS' AND " +
    "external.is_external = true AND " +
    "upload.weight > 100"  # High volume
)

# Pattern 3: C2 Beaconing
beaconing = edges_df.filter(
    (col("relationship") == "COMMUNICATES_WITH") &
    (col("properties.periodic") == true) &
    (col("properties.interval_seconds").between(30, 600))
)

# Write detected patterns back to Supabase
lateral_movement.write.format("jdbc") \
    .option("dbtable", "graph_correlations") \
    .mode("append").save()
```

**Patterns Detected**: 8 pre-configured + auto-discovered
**Detection Time**: < 60 seconds
**MITRE Mapping**: Automatic ATT&CK technique mapping

### Job 5: ML Anomaly Detection
```python
from pyspark.ml.feature import VectorAssembler
from pyspark.ml.clustering import BisectingKMeans

# Feature engineering
features = nodes_df.join(pagerank, "node_id") \
    .select(
        "node_id",
        "event_count",
        "risk_score",
        col("pagerank"),
        udf_calculate_degree("node_id").alias("degree"),
        udf_betweenness("node_id").alias("betweenness")
    )

# Vector assembly
assembler = VectorAssembler(
    inputCols=["event_count", "risk_score", "pagerank", "degree"],
    outputCol="features"
)
feature_vectors = assembler.transform(features)

# Clustering model
kmeans = BisectingKMeans(k=10, seed=1)
model = kmeans.fit(feature_vectors)

# Predict and score
predictions = model.transform(feature_vectors)
anomalies = predictions.filter(col("prediction") == 9)  # Outlier cluster

# Write anomalies
anomalies.write.format("delta") \
    .mode("overwrite") \
    .save("/mnt/delta/gold/ml/anomalies")
```

**Model**: Bisecting K-Means (unsupervised)
**Features**: Graph metrics + behavioral data
**Inference**: < 50ms per node
**Retraining**: Daily with new baseline

## Graph Patterns Library

### 1. Lateral Movement Detection
```
Pattern: User → Auth → Host1 → Connect → Host2 → Connect → Host3
MITRE: T1021 (Remote Services), T1570 (Lateral Tool Transfer)
Confidence: 0.85
Time Window: 1 hour
Min Hops: 3
```

### 2. Data Exfiltration
```
Pattern: Internal IP → Access Large File → Upload → External IP
MITRE: T1041 (Exfiltration Over C2), T1048 (Exfiltration Over Alternative Protocol)
Confidence: 0.90
File Size Threshold: > 100 MB
External Destination: Must be external
```

### 3. Privilege Escalation Chain
```
Pattern: User → Auth → Host → Execute → Elevated Process
MITRE: T1068 (Exploitation for Privilege Escalation), T1548 (Abuse Elevation Control)
Confidence: 0.80
Process Requirements: elevated_privileges = true
```

### 4. C2 Beaconing
```
Pattern: Internal IP ←→ External IP (periodic communication)
MITRE: T1071 (Application Layer Protocol), T1095 (Non-Application Layer Protocol)
Confidence: 0.88
Interval: 30-600 seconds
Periodicity: Variance < 10%
```

### 5. Reconnaissance Sweep
```
Pattern: Source IP → Connect → 50+ Unique Destinations
MITRE: T1046 (Network Service Scanning), T1595 (Active Scanning)
Confidence: 0.75
Time Window: 5 minutes
Unique Ports: > 20
```

### 6. Credential Dumping
```
Pattern: Process → Access → LSASS/SAM/SYSTEM
MITRE: T1003 (OS Credential Dumping), T1558 (Steal or Forge Kerberos Tickets)
Confidence: 0.95
Target Processes: lsass.exe, registry hives
```

### 7. Persistence via Registry
```
Pattern: Process → Modify → Registry Run Keys
MITRE: T1547 (Boot or Logon Autostart), T1053 (Scheduled Task/Job)
Confidence: 0.82
Registry Paths: Run, RunOnce, Services
```

### 8. Defense Evasion (Log Deletion)
```
Pattern: Process → Delete → Log Files
MITRE: T1070 (Indicator Removal), T1562 (Impair Defenses)
Confidence: 0.87
Target Files: .log, .audit, Event Logs
```

## Performance Optimization

### Spark Configuration
```python
spark.conf.set("spark.sql.adaptive.enabled", "true")
spark.conf.set("spark.sql.adaptive.coalescePartitions.enabled", "true")
spark.conf.set("spark.sql.shuffle.partitions", "200")
spark.conf.set("spark.default.parallelism", "400")
spark.conf.set("spark.executor.memory", "8g")
spark.conf.set("spark.executor.cores", "4")
spark.conf.set("spark.dynamicAllocation.enabled", "true")
spark.conf.set("spark.dynamicAllocation.minExecutors", "5")
spark.conf.set("spark.dynamicAllocation.maxExecutors", "50")
```

### Delta Lake Optimization
```sql
-- Optimize files (compaction)
OPTIMIZE delta.`/mnt/delta/gold/graph_nodes`;

-- Z-ordering for faster queries
OPTIMIZE delta.`/mnt/delta/gold/graph_edges`
ZORDER BY (source_node_id, target_node_id, edge_type);

-- Vacuum old files (older than 7 days)
VACUUM delta.`/mnt/delta/silver/events` RETAIN 168 HOURS;

-- Analyze table for statistics
ANALYZE TABLE delta.`/mnt/delta/gold/graph_nodes` COMPUTE STATISTICS;
```

### Databricks Cluster Configuration
```yaml
cluster_name: "soc-streaming-correlation"
spark_version: "13.3.x-scala2.12"
node_type_id: "i3.2xlarge"
driver_node_type_id: "i3.xlarge"
num_workers: 10
autoscale:
  min_workers: 5
  max_workers: 50
spark_conf:
  "spark.databricks.delta.optimizeWrite.enabled": "true"
  "spark.databricks.delta.autoCompact.enabled": "true"
  "spark.sql.adaptive.enabled": "true"
libraries:
  - {pypi: {package: "graphframes"}}
  - {pypi: {package: "psycopg2-binary"}}
  - {maven: {coordinates: "io.delta:delta-core_2.12:2.4.0"}}
```

## Deployment Guide

### 1. Setup Databricks Workspace
```bash
# Install Databricks CLI
pip install databricks-cli

# Configure authentication
databricks configure --token

# Upload Python script
databricks fs cp spark_streaming_correlation.py \
    dbfs:/soc/scripts/correlation.py

# Upload configuration
databricks fs cp cluster_config.json \
    dbfs:/soc/config/cluster.json
```

### 2. Create Delta Lake Paths
```python
# Create directory structure
dbutils.fs.mkdirs("/mnt/delta/bronze/raw_events")
dbutils.fs.mkdirs("/mnt/delta/silver/events")
dbutils.fs.mkdirs("/mnt/delta/gold/graph_nodes")
dbutils.fs.mkdirs("/mnt/delta/gold/graph_edges")
dbutils.fs.mkdirs("/mnt/delta/gold/analytics")
dbutils.fs.mkdirs("/mnt/delta/gold/patterns")
dbutils.fs.mkdirs("/mnt/delta/gold/ml")
dbutils.fs.mkdirs("/mnt/delta/checkpoints")
```

### 3. Create Streaming Job
```bash
# Create job via API
curl -X POST https://<databricks-instance>/api/2.1/jobs/create \
  -H "Authorization: Bearer <token>" \
  -d '{
    "name": "SOC Streaming Correlation Engine",
    "new_cluster": {
      "spark_version": "13.3.x-scala2.12",
      "node_type_id": "i3.2xlarge",
      "num_workers": 10,
      "autoscale": {
        "min_workers": 5,
        "max_workers": 50
      }
    },
    "spark_python_task": {
      "python_file": "dbfs:/soc/scripts/correlation.py",
      "parameters": ["--mode", "production"]
    },
    "max_concurrent_runs": 1,
    "timeout_seconds": 0
  }'
```

### 4. Start Streaming Job
```bash
# Run job
databricks jobs run-now --job-id <JOB_ID>

# Monitor job
databricks jobs get-run --run-id <RUN_ID>

# View logs
databricks jobs get-run-output --run-id <RUN_ID>
```

### 5. Monitor Performance
```sql
-- Query processing stats from Supabase
SELECT
  pipeline_stage,
  AVG(events_processed) as avg_throughput,
  AVG(avg_processing_time_ms) as avg_latency,
  AVG(queue_depth) as avg_queue_depth
FROM processing_stats
WHERE stat_timestamp > now() - interval '1 hour'
GROUP BY pipeline_stage;

-- Check sync status
SELECT
  table_name,
  last_sync_timestamp,
  sync_status,
  records_synced,
  lag_seconds
FROM databricks_sync_status
ORDER BY last_sync_timestamp DESC;
```

## Monitoring & Alerting

### Key Metrics
- **Ingestion Rate**: Events per second into Bronze
- **Processing Latency**: Time from ingestion to Gold layer
- **Graph Size**: Node count, edge count
- **Pattern Detection Rate**: Patterns discovered per hour
- **Anomaly Rate**: Percentage of nodes flagged as anomalies
- **Correlation Latency**: Time to detect multi-hop patterns
- **Model Accuracy**: ML model precision/recall
- **Storage Growth**: Delta Lake size growth rate

### Dashboards
```sql
-- Real-time throughput dashboard
CREATE LIVE TABLE throughput_metrics AS
SELECT
  window(stat_timestamp, '1 minute') as time_window,
  pipeline_stage,
  SUM(events_processed) as total_events,
  AVG(avg_processing_time_ms) as avg_latency
FROM STREAM(processing_stats)
GROUP BY window(stat_timestamp, '1 minute'), pipeline_stage;

-- Graph growth metrics
CREATE LIVE TABLE graph_metrics AS
SELECT
  date_trunc('hour', created_at) as hour,
  node_type,
  COUNT(*) as node_count
FROM STREAM(graph_nodes)
GROUP BY date_trunc('hour', created_at), node_type;
```

---

**Technology Stack**: Apache Spark 3.5+, GraphX, GraphFrames, Delta Lake 2.4+, Databricks Runtime 13.3+, Spark MLlib, PostgreSQL 15+
**Scale**: 100,000+ EPS with graph analytics
**Latency**: Sub-minute for complex multi-hop correlations
**Storage**: Petabyte-scale with Delta Lake
**Integration**: Bi-directional sync with Supabase
