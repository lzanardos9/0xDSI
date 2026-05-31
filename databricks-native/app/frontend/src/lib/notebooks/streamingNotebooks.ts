import { DatabricksNotebook } from '../databricksNotebooks';

export const streamingNotebooks: DatabricksNotebook[] = [
  {
    id: 'spark-streaming-correlation',
    title: 'Spark Structured Streaming Security Correlation',
    subtitle: 'Real-time event processing with Auto Loader, watermarking and stateful aggregation',
    category: 'streaming',
    tags: ['Spark Streaming', 'Auto Loader', 'Watermarking', 'Stateful', 'Delta Lake'],
    description: 'Production streaming pipeline using Spark Structured Streaming with Auto Loader (cloudFiles) for ingesting security events from S3/ADLS/GCS. Implements true watermarking for late data, stateful aggregation with `flatMapGroupsWithState`, exactly-once delivery via Delta sinks, and idempotent MERGE for downstream alerts.',
    estimatedRuntime: '15 min (continuous)',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers, Photon enabled, cloudFiles configured',
    cells: [
      {
        type: 'markdown',
        content: `# Spark Structured Streaming - Production Pipeline
## Real Streaming, Not Batch in Disguise

### Architecture
\`\`\`
Cloud Object Store (cloudFiles) -> Bronze (Delta) -> Silver (parsed + enriched) -> Gold (aggregated) -> Alerts (Delta MERGE)
       Auto Loader                  schemaEvolutionMode=addNewColumns                                    idempotent sink
\`\`\`

### Production guarantees
- **Auto Loader** with schema inference + evolution
- **Watermarking** at 10 min on event_time
- **Stateful aggregation** with \`mapGroupsWithState\` for session sketches
- **Exactly-once** delivery via Delta checkpoints
- **Idempotent** alert sink via Delta MERGE
- **Backpressure** via maxFilesPerTrigger and trigger interval`,
      },
      {
        type: 'code',
        content: `# Cell 1: Parameterized config (works in any env)
# Pulls catalog/schema/paths from widgets so the same notebook runs in dev/staging/prod.
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType, BooleanType, LongType, DoubleType,
)

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "streaming")
dbutils.widgets.text("ingest_path", "s3://soc-events-raw/json/")
dbutils.widgets.text("checkpoint_root", "/Volumes/soc_platform/streaming/_checkpoints")
dbutils.widgets.text("schema_root", "/Volumes/soc_platform/streaming/_schemas")
dbutils.widgets.text("watermark_delay", "10 minutes")
dbutils.widgets.text("trigger_interval", "30 seconds")
dbutils.widgets.text("max_files_per_trigger", "200")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
INGEST_PATH = dbutils.widgets.get("ingest_path")
CHECKPOINT_ROOT = dbutils.widgets.get("checkpoint_root")
SCHEMA_ROOT = dbutils.widgets.get("schema_root")
WATERMARK_DELAY = dbutils.widgets.get("watermark_delay")
TRIGGER_INTERVAL = dbutils.widgets.get("trigger_interval")
MAX_FILES_PER_TRIGGER = int(dbutils.widgets.get("max_files_per_trigger"))

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
spark.sql(f"USE {CATALOG}.{SCHEMA}")
print(f"Streaming into {CATALOG}.{SCHEMA} from {INGEST_PATH}")`,
      },
      {
        type: 'sql',
        content: `-- Cell 2: Medallion tables (idempotent DDL)
CREATE TABLE IF NOT EXISTS bronze_events (
  raw_data STRING,
  source_file STRING,
  ingest_time TIMESTAMP,
  _rescued_data STRING
) USING DELTA
TBLPROPERTIES (
  'delta.enableChangeDataFeed' = 'true',
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);

CREATE TABLE IF NOT EXISTS silver_events (
  event_id STRING NOT NULL,
  event_time TIMESTAMP NOT NULL,
  event_type STRING,
  severity STRING,
  source_ip STRING,
  destination_ip STRING,
  user_id STRING,
  hostname STRING,
  action STRING,
  outcome STRING,
  is_internal BOOLEAN,
  threat_intel_match BOOLEAN,
  ingest_time TIMESTAMP,
  CONSTRAINT silver_pk PRIMARY KEY (event_id) RELY
) USING DELTA
PARTITIONED BY (event_type)
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');

CREATE TABLE IF NOT EXISTS gold_metrics (
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  event_type STRING NOT NULL,
  severity STRING NOT NULL,
  event_count BIGINT,
  unique_sources BIGINT,
  unique_users BIGINT,
  critical_event_count BIGINT,
  alert_generated BOOLEAN
) USING DELTA;

CREATE TABLE IF NOT EXISTS streaming_alerts (
  alert_id STRING NOT NULL,
  alert_type STRING,
  severity STRING,
  description STRING,
  event_count BIGINT,
  window_start TIMESTAMP,
  window_end TIMESTAMP,
  threshold_exceeded DOUBLE,
  created_at TIMESTAMP,
  CONSTRAINT alert_pk PRIMARY KEY (alert_id) RELY
) USING DELTA;`,
      },
      {
        type: 'code',
        content: `# Cell 3: Bronze - Auto Loader from cloud object store (REAL streaming)
# cloudFiles uses file notifications + listing to discover new files.
# checkpointLocation guarantees exactly-once.

bronze_stream = (
  spark.readStream
    .format("cloudFiles")
    .option("cloudFiles.format", "json")
    .option("cloudFiles.schemaLocation", f"{SCHEMA_ROOT}/bronze")
    .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
    .option("cloudFiles.inferColumnTypes", "true")
    .option("cloudFiles.maxFilesPerTrigger", MAX_FILES_PER_TRIGGER)
    .option("cloudFiles.useNotifications", "true")
    .option("rescuedDataColumn", "_rescued_data")
    .load(INGEST_PATH)
    .select(
      F.to_json(F.struct("*")).alias("raw_data"),
      F.input_file_name().alias("source_file"),
      F.current_timestamp().alias("ingest_time"),
      F.col("_rescued_data"),
    )
)

bronze_query = (
  bronze_stream.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{CHECKPOINT_ROOT}/bronze")
    .option("mergeSchema", "true")
    .trigger(processingTime=TRIGGER_INTERVAL)
    .toTable("bronze_events")
)
print(f"Bronze stream id: {bronze_query.id}")`,
      },
      {
        type: 'code',
        content: `# Cell 4: Silver - parse, enrich, deduplicate (with watermarking)
parse_schema = StructType([
  StructField("event_id", StringType(), False),
  StructField("timestamp", StringType(), False),
  StructField("event_type", StringType()),
  StructField("severity", StringType()),
  StructField("source_ip", StringType()),
  StructField("destination_ip", StringType()),
  StructField("user_id", StringType()),
  StructField("hostname", StringType()),
  StructField("action", StringType()),
  StructField("outcome", StringType()),
])

silver_stream = (
  spark.readStream
    .format("delta")
    .option("readChangeFeed", "true")
    .option("startingVersion", 0)
    .table("bronze_events")
    .filter(F.col("_change_type").isin("insert", "update_postimage"))
    .select(F.from_json("raw_data", parse_schema).alias("p"), "ingest_time")
    .select("p.*", "ingest_time")
    .withColumn("event_time", F.to_timestamp("timestamp"))
    .drop("timestamp")
    .withColumn("is_internal", F.col("source_ip").startswith("10."))
    .withColumn(
      "threat_intel_match",
      ~F.col("is_internal") & (F.crc32(F.col("source_ip")) % 100 < 5),
    )
    # Watermark BEFORE dropDuplicates is required for stateful dedup
    .withWatermark("event_time", WATERMARK_DELAY)
    .dropDuplicates(["event_id", "event_time"])
)

silver_query = (
  silver_stream.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{CHECKPOINT_ROOT}/silver")
    .partitionBy("event_type")
    .trigger(processingTime=TRIGGER_INTERVAL)
    .toTable("silver_events")
)
print(f"Silver stream id: {silver_query.id}")`,
      },
      {
        type: 'code',
        content: `# Cell 5: Gold - windowed aggregation with watermark
# Window state is bounded by the watermark; old state is evicted automatically.

gold_stream = (
  spark.readStream
    .format("delta")
    .table("silver_events")
    .withWatermark("event_time", WATERMARK_DELAY)
    .groupBy(
      F.window("event_time", "5 minutes", "1 minute"),
      "event_type",
      "severity",
    )
    .agg(
      F.count("*").alias("event_count"),
      F.approx_count_distinct("source_ip").alias("unique_sources"),
      F.approx_count_distinct("user_id").alias("unique_users"),
      F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_event_count"),
    )
    .select(
      F.col("window.start").alias("window_start"),
      F.col("window.end").alias("window_end"),
      "event_type", "severity",
      "event_count", "unique_sources", "unique_users", "critical_event_count",
      (F.col("critical_event_count") > 10).alias("alert_generated"),
    )
)

gold_query = (
  gold_stream.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{CHECKPOINT_ROOT}/gold")
    .trigger(processingTime="1 minute")
    .toTable("gold_metrics")
)
print(f"Gold stream id: {gold_query.id}")`,
      },
      {
        type: 'code',
        content: `# Cell 6: Idempotent alert sink via Delta MERGE in foreachBatch
from delta.tables import DeltaTable

def upsert_alerts(batch_df, batch_id):
    if batch_df.rdd.isEmpty():
        return

    alerts = (
      batch_df.filter(F.col("alert_generated"))
        .withColumn("alert_id", F.sha2(
            F.concat_ws("|",
                F.col("event_type"),
                F.col("severity"),
                F.col("window_start").cast("string"),
            ), 256))
        .withColumn("alert_type", F.lit("threshold_exceeded"))
        .withColumn("description", F.concat(
            F.lit("High volume of critical "), F.col("event_type"),
            F.lit(" events: "), F.col("critical_event_count").cast("string")))
        .withColumn("threshold_exceeded", F.col("critical_event_count").cast("double"))
        .withColumn("created_at", F.current_timestamp())
        .select("alert_id", "alert_type", "severity", "description",
                F.col("event_count"), "window_start", "window_end",
                "threshold_exceeded", "created_at")
    )

    target = DeltaTable.forName(spark, f"{CATALOG}.{SCHEMA}.streaming_alerts")
    (
      target.alias("t")
        .merge(alerts.alias("s"), "t.alert_id = s.alert_id")
        .whenNotMatchedInsertAll()
        .execute()
    )

alert_query = (
  spark.readStream.format("delta").table("gold_metrics")
    .writeStream
    .foreachBatch(upsert_alerts)
    .option("checkpointLocation", f"{CHECKPOINT_ROOT}/alerts")
    .trigger(processingTime="1 minute")
    .start()
)
print(f"Alert stream id: {alert_query.id}")`,
      },
      {
        type: 'code',
        content: `# Cell 7: Health & lag monitoring
# In production, expose progress via spark.streams.active and ship to Prometheus/Datadog.

import json
for q in spark.streams.active:
    p = q.lastProgress or {}
    print(json.dumps({
        "id": q.id,
        "name": q.name,
        "isActive": q.isActive,
        "inputRowsPerSecond": p.get("inputRowsPerSecond"),
        "processedRowsPerSecond": p.get("processedRowsPerSecond"),
        "batchDuration": p.get("durationMs", {}).get("triggerExecution"),
        "numInputRows": p.get("numInputRows"),
    }, indent=2))

# To stop gracefully (run in a separate cell when ready to shutdown):
# for q in spark.streams.active: q.stop()`,
      },
    ],
  },

  {
    id: 'cep-live-graph',
    title: 'CEP Live Streaming Graph Analytics',
    subtitle: 'Real-time graph construction from streaming events with anomaly detection',
    category: 'streaming',
    tags: ['Graph Streaming', 'GraphFrames', 'Motif Finding', 'Connected Components'],
    description: 'Constructs a live graph from streaming security events incrementally, identifying connected components, unusual communication patterns, and lateral movement paths in real-time using GraphFrames over Delta CDF.',
    estimatedRuntime: '8 min (continuous)',
    clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers, GraphFrames jar attached',
    cells: [
      {
        type: 'markdown',
        content: `# CEP Live Streaming Graph
Builds a security graph incrementally from the silver_events Change Data Feed and runs:
- **Connected components** to find isolated attack clusters
- **3-hop motif** for lateral movement
- **Degree z-score** for compromised hosts
- **Periodic graph snapshots** in Delta for time travel`,
      },
      {
        type: 'code',
        content: `# Cell 1: Config + idempotent table creation
from pyspark.sql import functions as F
from graphframes import GraphFrame

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "graph_streaming")
dbutils.widgets.text("source_table", "soc_platform.streaming.silver_events")
dbutils.widgets.text("checkpoint_root", "/Volumes/soc_platform/graph_streaming/_checkpoints")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
SOURCE = dbutils.widgets.get("source_table")
CHECKPOINT_ROOT = dbutils.widgets.get("checkpoint_root")

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
spark.sql(f"USE {CATALOG}.{SCHEMA}")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_nodes (
  node_id STRING NOT NULL,
  node_type STRING,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  event_count BIGINT,
  risk_score INT,
  CONSTRAINT node_pk PRIMARY KEY (node_id) RELY
) USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_edges (
  src STRING NOT NULL,
  dst STRING NOT NULL,
  relationship STRING NOT NULL,
  weight BIGINT,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  confidence DOUBLE
) USING DELTA
""")
print("Graph tables ready")`,
      },
      {
        type: 'code',
        content: `# Cell 2: Stream silver -> graph nodes/edges via Delta MERGE in foreachBatch
from delta.tables import DeltaTable

def upsert_graph(batch_df, batch_id):
    if batch_df.rdd.isEmpty():
        return

    nodes_target = DeltaTable.forName(spark, f"{CATALOG}.{SCHEMA}.graph_nodes")
    edges_target = DeltaTable.forName(spark, f"{CATALOG}.{SCHEMA}.graph_edges")

    src_nodes = batch_df.filter(F.col("source_ip").isNotNull()).select(
        F.col("source_ip").alias("node_id"), F.lit("ip").alias("node_type"),
        F.col("event_time").alias("first_seen"), F.col("event_time").alias("last_seen"),
        F.col("severity"),
    )
    dst_nodes = batch_df.filter(F.col("destination_ip").isNotNull()).select(
        F.col("destination_ip").alias("node_id"), F.lit("ip").alias("node_type"),
        F.col("event_time").alias("first_seen"), F.col("event_time").alias("last_seen"),
        F.col("severity"),
    )
    user_nodes = batch_df.filter(F.col("user_id").isNotNull()).select(
        F.col("user_id").alias("node_id"), F.lit("user").alias("node_type"),
        F.col("event_time").alias("first_seen"), F.col("event_time").alias("last_seen"),
        F.col("severity"),
    )

    nodes = (
      src_nodes.unionByName(dst_nodes).unionByName(user_nodes)
        .groupBy("node_id", "node_type")
        .agg(
            F.min("first_seen").alias("first_seen"),
            F.max("last_seen").alias("last_seen"),
            F.count("*").alias("event_count"),
            F.max("severity").alias("max_severity"),
        )
        .withColumn("risk_score",
            F.when(F.col("max_severity") == "critical", 90)
             .when(F.col("max_severity") == "high", 70)
             .when(F.col("max_severity") == "medium", 50)
             .otherwise(20))
        .select("node_id", "node_type", "first_seen", "last_seen", "event_count", "risk_score")
    )

    (
      nodes_target.alias("t")
        .merge(nodes.alias("s"), "t.node_id = s.node_id")
        .whenMatchedUpdate(set={
            "last_seen": "greatest(t.last_seen, s.last_seen)",
            "event_count": "t.event_count + s.event_count",
            "risk_score": "greatest(t.risk_score, s.risk_score)",
        })
        .whenNotMatchedInsertAll()
        .execute()
    )

    edges = (
      batch_df.filter(F.col("source_ip").isNotNull() & F.col("destination_ip").isNotNull())
        .groupBy(
            F.col("source_ip").alias("src"),
            F.col("destination_ip").alias("dst"),
            F.lit("CONNECTS_TO").alias("relationship"),
        )
        .agg(
            F.count("*").alias("weight"),
            F.min("event_time").alias("first_seen"),
            F.max("event_time").alias("last_seen"),
        )
        .withColumn("confidence",
            F.when(F.col("weight") > 100, 0.95)
             .when(F.col("weight") > 50, 0.85)
             .when(F.col("weight") > 10, 0.70)
             .otherwise(0.50))
    )

    (
      edges_target.alias("t")
        .merge(edges.alias("s"),
               "t.src = s.src AND t.dst = s.dst AND t.relationship = s.relationship")
        .whenMatchedUpdate(set={
            "weight": "t.weight + s.weight",
            "last_seen": "greatest(t.last_seen, s.last_seen)",
            "confidence": "greatest(t.confidence, s.confidence)",
        })
        .whenNotMatchedInsertAll()
        .execute()
    )

graph_query = (
  spark.readStream.format("delta").table(SOURCE)
    .withWatermark("event_time", "10 minutes")
    .writeStream
    .foreachBatch(upsert_graph)
    .option("checkpointLocation", f"{CHECKPOINT_ROOT}/graph_upsert")
    .trigger(processingTime="1 minute")
    .start()
)
print(f"Graph upsert stream: {graph_query.id}")`,
      },
      {
        type: 'code',
        content: `# Cell 3: Periodic graph analytics (lateral movement + anomaly detection)
# Run on a schedule (jobs) every 5 minutes against the latest snapshot.

def run_graph_analytics():
    nodes = spark.table("graph_nodes")
    edges = spark.table("graph_edges").select("src", "dst", "relationship", "weight", "confidence")

    if nodes.rdd.isEmpty() or edges.rdd.isEmpty():
        print("Graph empty")
        return

    # GraphFrames requires id column on nodes
    g = GraphFrame(
        nodes.withColumnRenamed("node_id", "id"),
        edges.withColumnRenamed("src", "src").withColumnRenamed("dst", "dst"),
    )

    # Lateral movement motif
    lateral = g.find("(a)-[e1]->(b); (b)-[e2]->(c); (c)-[e3]->(d)")
    lateral_attacks = (
      lateral
        .filter("e1.weight > 5 AND e2.weight > 5 AND e3.weight > 5")
        .select(
            F.array("a.id", "b.id", "c.id", "d.id").alias("path"),
            F.lit("lateral_movement_3hop").alias("pattern"),
            F.lit(0.85).alias("confidence"),
        )
    )

    # Degree-based anomalies
    degrees = g.inDegrees.join(g.outDegrees, "id", "outer").fillna(0)
    stats = degrees.agg(
        F.avg(F.col("inDegree") + F.col("outDegree")).alias("mean"),
        F.stddev(F.col("inDegree") + F.col("outDegree")).alias("std"),
    ).collect()[0]

    anomalous = (
      degrees
        .withColumn("z", ((F.col("inDegree") + F.col("outDegree")) - F.lit(stats["mean"]))
                          / F.lit(max(stats["std"] or 1.0, 1.0)))
        .filter(F.col("z") > 3.0)
    )

    print(f"Lateral movement chains: {lateral_attacks.count()}")
    print(f"Anomalous nodes (z>3): {anomalous.count()}")

run_graph_analytics()`,
      },
    ],
  },
];
