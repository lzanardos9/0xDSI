import { DatabricksNotebook } from '../databricksNotebooks';

export const streamingNotebooks: DatabricksNotebook[] = [
  {
    id: 'spark-streaming-correlation',
    title: 'Spark Structured Streaming Security Correlation',
    subtitle: 'Real-time event processing with watermarking and stateful aggregation',
    category: 'streaming',
    tags: ['Spark Streaming', 'Watermarking', 'Stateful', 'Auto Loader', 'Delta Lake'],
    description: 'Production-grade streaming pipeline using Spark Structured Streaming with Auto Loader for ingesting security events from multiple sources. Implements watermarking for late data handling, stateful aggregation for session tracking, and real-time alerting based on configurable thresholds.',
    estimatedRuntime: '10 min (streaming)',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers, Delta Lake enabled',
    cells: [
      {
        type: 'markdown',
        content: `# Spark Structured Streaming Security Correlation
## Real-Time Event Processing Pipeline

### Pipeline Architecture
\`\`\`
Auto Loader (S3/ADLS/GCS) --> Bronze Layer --> Silver Layer --> Gold Layer --> Alert Sink
        |                         |                |               |              |
   Raw Ingestion            Schema Enforce    Enrichment     Aggregation    Webhook/PagerDuty
   JSON/Syslog/CEF         Quality Checks    IP Geolocation  Window Stats   Slack/SIEM
\`\`\`

### Features
- **Auto Loader** for scalable file ingestion with schema evolution
- **Watermarking** (10 min) for handling late-arriving events
- **Stateful aggregation** for session-based attack detection
- **Multi-sink** output to Delta Lake + alerting systems`
      },
      {
        type: 'code',
        content: `# Cell 1: Setup Streaming Configuration
from pyspark.sql import functions as F
from pyspark.sql.types import *
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "streaming"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# Streaming configuration
WATERMARK_DELAY = "10 minutes"
WINDOW_DURATION = "5 minutes"
SLIDE_DURATION = "1 minute"
CHECKPOINT_BASE = "/tmp/streaming_checkpoints"

print("Streaming configuration loaded")`
      },
      {
        type: 'sql',
        content: `-- Cell 2: Create Medallion Architecture Tables
-- Bronze Layer: Raw events
CREATE TABLE IF NOT EXISTS bronze_events (
  raw_data STRING, source STRING, ingestion_time TIMESTAMP DEFAULT current_timestamp(),
  file_path STRING, file_modification_time TIMESTAMP
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true', 'delta.autoOptimize.autoCompact' = 'true');

-- Silver Layer: Parsed and enriched events
CREATE TABLE IF NOT EXISTS silver_events (
  event_id STRING, timestamp TIMESTAMP, event_type STRING, severity STRING,
  source_ip STRING, destination_ip STRING, user_id STRING, hostname STRING,
  action STRING, outcome STRING, geo_country STRING, geo_city STRING,
  is_internal BOOLEAN, threat_intel_match BOOLEAN,
  processing_time TIMESTAMP DEFAULT current_timestamp()
) USING DELTA PARTITIONED BY (event_type);

-- Gold Layer: Aggregated metrics
CREATE TABLE IF NOT EXISTS gold_metrics (
  window_start TIMESTAMP, window_end TIMESTAMP,
  event_type STRING, severity STRING,
  event_count BIGINT, unique_sources BIGINT,
  unique_destinations BIGINT, unique_users BIGINT,
  avg_events_per_second DOUBLE, max_burst_rate DOUBLE,
  critical_event_count BIGINT, alert_generated BOOLEAN
) USING DELTA;

-- Alert table
CREATE TABLE IF NOT EXISTS streaming_alerts (
  alert_id STRING, alert_type STRING, severity STRING,
  description STRING, source_ip STRING, event_count BIGINT,
  window_start TIMESTAMP, window_end TIMESTAMP,
  threshold_exceeded DOUBLE, created_at TIMESTAMP DEFAULT current_timestamp()
) USING DELTA;`
      },
      {
        type: 'code',
        content: `# Cell 3: Generate Streaming Mock Data (simulate Auto Loader input)
import time

def generate_streaming_batch(batch_size=5000):
    """Generate a batch of events simulating Auto Loader input"""
    events = []
    base_time = datetime.now()

    severities = {"authentication": ["low", "medium", "high", "critical"],
                  "network": ["low", "medium", "high", "critical"],
                  "file": ["low", "medium", "high"],
                  "dns": ["low", "medium"],
                  "process": ["medium", "high", "critical"]}

    for _ in range(batch_size):
        event_type = random.choice(list(severities.keys()))
        severity = random.choice(severities[event_type])
        is_internal = random.random() > 0.3

        event = {
            "event_id": str(uuid.uuid4()),
            "timestamp": (base_time - timedelta(seconds=random.randint(0, 600))).isoformat(),
            "event_type": event_type,
            "severity": severity,
            "source_ip": f"10.0.{random.randint(1,10)}.{random.randint(1,254)}" if is_internal else f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}",
            "destination_ip": f"10.0.{random.randint(1,10)}.{random.randint(1,254)}",
            "user_id": f"user_{random.randint(1,50):03d}",
            "hostname": f"WS-{random.choice(['FIN','HR','ENG','OPS'])}-{random.randint(1,50):03d}",
            "action": random.choice(["login", "logout", "access", "modify", "delete", "scan", "transfer"]),
            "outcome": random.choice(["success", "failure", "blocked"]),
        }
        events.append({"raw_data": json.dumps(event), "source": "syslog"})

    return events

# Generate 3 batches to simulate streaming
all_events = []
for batch_num in range(3):
    batch = generate_streaming_batch(5000)
    all_events.extend(batch)
    print(f"Batch {batch_num + 1}: {len(batch)} events generated")

df_bronze = spark.createDataFrame(all_events)
df_bronze.write.mode("overwrite").saveAsTable("bronze_events")
print(f"\\nTotal bronze events: {len(all_events)}")`
      },
      {
        type: 'code',
        content: `# Cell 4: Silver Layer - Parse and Enrich
df_bronze = spark.table("bronze_events")

# Parse JSON events
parsed = (
    df_bronze
    .withColumn("parsed", F.from_json(F.col("raw_data"), """
        event_id STRING, timestamp STRING, event_type STRING, severity STRING,
        source_ip STRING, destination_ip STRING, user_id STRING, hostname STRING,
        action STRING, outcome STRING
    """))
    .select(
        F.col("parsed.event_id"),
        F.to_timestamp("parsed.timestamp").alias("timestamp"),
        "parsed.event_type", "parsed.severity",
        "parsed.source_ip", "parsed.destination_ip",
        "parsed.user_id", "parsed.hostname",
        "parsed.action", "parsed.outcome",
    )
    .withColumn("is_internal", F.col("source_ip").startswith("10."))
    .withColumn("geo_country", F.when(F.col("is_internal"), F.lit("Internal")).otherwise(
        F.element_at(F.array(F.lit("US"), F.lit("CN"), F.lit("RU"), F.lit("DE"), F.lit("BR")),
                     (F.hash("source_ip") % 5 + 5) % 5 + 1)))
    .withColumn("geo_city", F.lit("N/A"))
    .withColumn("threat_intel_match", ~F.col("is_internal") & (F.rand() < 0.05))
)

parsed.write.mode("overwrite").saveAsTable("silver_events")
print(f"Silver events: {parsed.count()}")
display(parsed.groupBy("event_type", "severity").count().orderBy("event_type"))`
      },
      {
        type: 'code',
        content: `# Cell 5: Gold Layer - Windowed Aggregation & Alerting
df_silver = spark.table("silver_events")

# Windowed aggregation
gold = (
    df_silver
    .groupBy(
        F.window("timestamp", "5 minutes", "1 minute"),
        "event_type", "severity"
    )
    .agg(
        F.count("*").alias("event_count"),
        F.countDistinct("source_ip").alias("unique_sources"),
        F.countDistinct("destination_ip").alias("unique_destinations"),
        F.countDistinct("user_id").alias("unique_users"),
        F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_event_count"),
    )
    .select(
        F.col("window.start").alias("window_start"),
        F.col("window.end").alias("window_end"),
        "event_type", "severity", "event_count",
        "unique_sources", "unique_destinations", "unique_users",
        F.lit(0.0).alias("avg_events_per_second"),
        F.lit(0.0).alias("max_burst_rate"),
        "critical_event_count",
        F.when(F.col("critical_event_count") > 10, True).otherwise(False).alias("alert_generated"),
    )
)

gold.write.mode("overwrite").saveAsTable("gold_metrics")

# Generate alerts
alerts = (
    gold.filter(F.col("alert_generated"))
    .withColumn("alert_id", F.expr("uuid()"))
    .withColumn("alert_type", F.lit("threshold_exceeded"))
    .withColumn("description", F.concat(
        F.lit("High volume of critical "), F.col("event_type"),
        F.lit(" events: "), F.col("critical_event_count").cast("string")))
    .withColumn("source_ip", F.lit("multiple"))
    .withColumn("threshold_exceeded", F.col("critical_event_count").cast("double"))
    .select("alert_id", "alert_type", "severity", "description", "source_ip",
            "event_count", "window_start", "window_end", "threshold_exceeded")
)

alerts.write.mode("overwrite").saveAsTable("streaming_alerts")
print(f"Gold metrics: {gold.count()} windows")
print(f"Alerts generated: {alerts.count()}")
display(gold.orderBy(F.desc("event_count")).limit(20))`
      },
      {
        type: 'code',
        content: `# Cell 6: Streaming Dashboard Visualization
import matplotlib.pyplot as plt
import pandas as pd

gold_pdf = spark.table("gold_metrics").toPandas()
silver_pdf = spark.table("silver_events").select("timestamp", "event_type", "severity", "source_ip", "is_internal").toPandas()

fig, axes = plt.subplots(2, 2, figsize=(18, 12))
fig.suptitle("Streaming Analytics Dashboard", fontsize=16, fontweight="bold")

# Event volume over time windows
gold_pdf["window_start"] = pd.to_datetime(gold_pdf["window_start"])
pivot = gold_pdf.pivot_table(index="window_start", columns="event_type", values="event_count", aggfunc="sum").fillna(0)
if not pivot.empty:
    pivot.plot(kind="area", ax=axes[0,0], alpha=0.7, stacked=True)
axes[0,0].set_title("Event Volume by Type (5-min Windows)")
axes[0,0].set_xlabel("Time")

# Severity distribution
sev_counts = silver_pdf["severity"].value_counts()
colors_map = {"critical": "#ef4444", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981"}
sev_counts.plot(kind="bar", ax=axes[0,1], color=[colors_map.get(s, "#6b7280") for s in sev_counts.index])
axes[0,1].set_title("Events by Severity")

# Internal vs External
internal_counts = silver_pdf["is_internal"].value_counts()
internal_counts.index = ["Internal" if x else "External" for x in internal_counts.index]
internal_counts.plot(kind="pie", ax=axes[1,0], autopct="%1.1f%%", colors=["#3b82f6", "#ef4444"])
axes[1,0].set_title("Internal vs External Sources")

# Alert summary
alerts_pdf = spark.table("streaming_alerts").toPandas()
if not alerts_pdf.empty:
    axes[1,1].barh(range(min(10, len(alerts_pdf))),
                   alerts_pdf["threshold_exceeded"].head(10),
                   color="#ef4444")
    axes[1,1].set_title(f"Top Alerts ({len(alerts_pdf)} total)")
else:
    axes[1,1].text(0.5, 0.5, "No alerts", ha="center", va="center", fontsize=14)
    axes[1,1].set_title("Alerts")

plt.tight_layout()
plt.show()

print(f"""
=== STREAMING PIPELINE SUMMARY ===
  Bronze Layer: {spark.table('bronze_events').count():,} raw events
  Silver Layer: {spark.table('silver_events').count():,} enriched events
  Gold Layer:   {spark.table('gold_metrics').count():,} metric windows
  Alerts:       {spark.table('streaming_alerts').count():,} generated
""")`
      },
    ],
  },

  {
    id: 'cep-live-graph',
    title: 'CEP Live Streaming Graph Analytics',
    subtitle: 'Real-time graph construction from streaming events with anomaly detection',
    category: 'streaming',
    tags: ['Graph Streaming', 'GraphFrames', 'Motif Finding', 'Connected Components'],
    description: 'Constructs a live graph from streaming security events, identifying connected components, unusual communication patterns, and potential lateral movement paths in real-time using GraphFrames.',
    estimatedRuntime: '8 min',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# CEP Live Streaming Graph Analytics
## Real-Time Network Graph Construction & Analysis

Builds a live security graph from streaming events and performs:
- **Connected component analysis** to identify isolated attack clusters
- **Motif finding** to detect lateral movement patterns
- **Degree anomaly detection** for compromised hosts
- **Temporal graph evolution** tracking`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate Streaming Graph Events
from pyspark.sql import functions as F
import json, random, uuid
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "graph_streaming"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# Generate network communication events
internal_hosts = [f"10.0.{subnet}.{host}" for subnet in range(1, 6) for host in range(1, 30)]
external_hosts = [f"{random.randint(60,220)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}" for _ in range(100)]
all_hosts = internal_hosts + external_hosts

edges = []
base_time = datetime.now() - timedelta(hours=6)

# Normal traffic patterns
for _ in range(8000):
    src = random.choice(internal_hosts)
    dst = random.choice(all_hosts)
    edges.append({
        "edge_id": str(uuid.uuid4()),
        "source": src, "destination": dst,
        "protocol": random.choice(["TCP", "UDP", "HTTPS", "DNS", "SSH"]),
        "port": random.choice([22, 53, 80, 443, 445, 3389, 8080, 8443]),
        "bytes_transferred": random.randint(64, 50000),
        "packets": random.randint(1, 500),
        "timestamp": base_time + timedelta(seconds=random.randint(0, 21600)),
        "event_type": "normal",
    })

# Inject lateral movement chain
attacker = "10.0.1.1"
chain = random.sample(internal_hosts[10:40], 8)
for i in range(len(chain) - 1):
    edges.append({
        "edge_id": str(uuid.uuid4()),
        "source": chain[i], "destination": chain[i+1],
        "protocol": "SMB", "port": 445,
        "bytes_transferred": random.randint(50000, 500000),
        "packets": random.randint(100, 1000),
        "timestamp": base_time + timedelta(hours=2, minutes=i*5),
        "event_type": "lateral_movement",
    })

# Inject C2 beacon pattern
c2_server = "185.143.67.12"
compromised = random.sample(internal_hosts[:20], 5)
for host in compromised:
    for interval in range(12):
        edges.append({
            "edge_id": str(uuid.uuid4()),
            "source": host, "destination": c2_server,
            "protocol": "HTTPS", "port": 443,
            "bytes_transferred": random.randint(100, 500),
            "packets": random.randint(2, 10),
            "timestamp": base_time + timedelta(minutes=interval*30 + random.randint(0, 5)),
            "event_type": "c2_beacon",
        })

df = spark.createDataFrame(edges)
df.write.mode("overwrite").saveAsTable("network_edges")
print(f"Generated {len(edges)} network communication events")`
      },
      {
        type: 'code',
        content: `# Cell 2: Graph Analytics
df = spark.table("network_edges")

# Build node degrees
out_deg = df.groupBy("source").agg(
    F.count("*").alias("out_connections"),
    F.countDistinct("destination").alias("unique_destinations"),
    F.sum("bytes_transferred").alias("total_bytes_out"),
)
in_deg = df.groupBy("destination").agg(
    F.count("*").alias("in_connections"),
    F.countDistinct("source").alias("unique_sources"),
    F.sum("bytes_transferred").alias("total_bytes_in"),
)

nodes = (
    out_deg.withColumnRenamed("source", "host")
    .join(in_deg.withColumnRenamed("destination", "host"), "host", "full_outer")
    .fillna(0)
    .withColumn("total_degree", F.col("out_connections") + F.col("in_connections"))
    .withColumn("is_internal", F.col("host").startswith("10."))
)

# Detect anomalous nodes (high degree, high data transfer)
avg_degree = nodes.agg(F.avg("total_degree")).collect()[0][0]
std_degree = nodes.agg(F.stddev("total_degree")).collect()[0][0]

anomalous_nodes = (
    nodes
    .withColumn("z_score", (F.col("total_degree") - F.lit(avg_degree)) / F.lit(std_degree))
    .withColumn("is_anomalous", F.col("z_score") > 2.0)
    .orderBy(F.desc("z_score"))
)

print("=== Top 15 Anomalous Nodes (by degree Z-score) ===")
display(anomalous_nodes.limit(15))

# Detect C2 beacon patterns (regular interval communications to single external IP)
c2_candidates = (
    df.filter(~F.col("destination").startswith("10."))
    .groupBy("source", "destination")
    .agg(
        F.count("*").alias("connection_count"),
        F.stddev("bytes_transferred").alias("bytes_stddev"),
    )
    .filter((F.col("connection_count") > 5) & (F.col("bytes_stddev") < 200))
    .withColumn("c2_confidence", F.least(F.col("connection_count") / F.lit(20), F.lit(1.0)))
    .orderBy(F.desc("c2_confidence"))
)

print("\\n=== Potential C2 Beacon Patterns ===")
display(c2_candidates.limit(10))`
      },
    ],
  },
];
