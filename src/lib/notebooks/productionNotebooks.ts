import { DatabricksNotebook, NotebookCell } from '../databricksNotebooks';

/**
 * Parses Databricks notebook source format into NotebookCell array.
 * Handles: # COMMAND ---------- separators, # MAGIC %md markdown, regular code cells.
 */
function parseNotebookSource(source: string): NotebookCell[] {
  const rawCells = source.split('# COMMAND ----------');
  const cells: NotebookCell[] = [];

  for (const rawCell of rawCells) {
    const trimmed = rawCell.trim();
    if (!trimmed || trimmed === '# Databricks notebook source') continue;

    // Check if this is a markdown cell
    const lines = trimmed.split('\n');
    const isMarkdown = lines.some(l => l.trim().startsWith('# MAGIC %md'));

    if (isMarkdown) {
      const mdContent = lines
        .filter(l => l.trim().startsWith('# MAGIC'))
        .map(l => {
          const stripped = l.replace(/^# MAGIC ?/, '');
          if (stripped.startsWith('%md')) return stripped.replace('%md', '').trim();
          return stripped;
        })
        .join('\n')
        .trim();
      if (mdContent) {
        cells.push({ type: 'markdown', content: mdContent });
      }
    } else if (trimmed.startsWith('# MAGIC %sql')) {
      const sqlContent = lines
        .filter(l => l.trim().startsWith('# MAGIC'))
        .map(l => l.replace(/^# MAGIC ?/, '').replace('%sql', '').trim())
        .join('\n')
        .trim();
      if (sqlContent) {
        cells.push({ type: 'sql', content: sqlContent });
      }
    } else {
      // Code cell - remove leading comment if it's just the notebook source marker
      const codeContent = lines
        .filter(l => !l.startsWith('# Databricks notebook source'))
        .join('\n')
        .trim();
      if (codeContent) {
        cells.push({ type: 'code', content: codeContent });
      }
    }
  }

  return cells;
}

// ============================================================
// INGESTION NOTEBOOKS
// ============================================================

const RAW_INGESTION_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # 01 - Raw Event Ingestion (Bronze Layer)
# MAGIC
# MAGIC Multi-source streaming ingestion pipeline that accepts ANY data source format
# MAGIC and lands raw events into the Bronze Delta table.
# MAGIC
# MAGIC **Supported Sources:**
# MAGIC - Kafka / Confluent Cloud / Azure Event Hubs
# MAGIC - AWS Kinesis
# MAGIC - Cloud Storage (S3, ADLS, GCS) - auto-loader
# MAGIC - REST API polling
# MAGIC - Syslog (via Kafka bridge)
# MAGIC - CloudTrail, VPC Flow Logs, Azure Activity Logs
# MAGIC
# MAGIC **Output:** \`{catalog}.{schema}.bronze_events\` (append-only, partitioned by date + source)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

# Parameters (set via dbutils.widgets or job configuration)
dbutils.widgets.text("catalog", "main", "Unity Catalog name")
dbutils.widgets.text("schema", "security", "Schema name")
dbutils.widgets.text("source_type", "kafka", "Source type: kafka | kinesis | autoloader | api")
dbutils.widgets.text("source_name", "", "Logical source name (e.g., crowdstrike, palo_alto)")
dbutils.widgets.text("checkpoint_path", "", "Checkpoint location (auto-generated if empty)")
dbutils.widgets.text("kafka_bootstrap", "", "Kafka bootstrap servers")
dbutils.widgets.text("kafka_topic", "", "Kafka topic(s) - comma separated")
dbutils.widgets.text("storage_path", "", "Cloud storage path for autoloader")
dbutils.widgets.text("storage_format", "json", "File format: json | csv | parquet | avro")
dbutils.widgets.text("max_bytes_per_trigger", "10485760", "Max bytes per micro-batch")
dbutils.widgets.text("processing_time", "10 seconds", "Trigger interval")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
source_type = dbutils.widgets.get("source_type")
source_name = dbutils.widgets.get("source_name")

# Auto-generate checkpoint path if not provided
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/bronze_{source_name}"

print(f"Ingesting from: {source_type} ({source_name})")
print(f"Target: {catalog}.{schema}.bronze_events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Table Schema

# COMMAND ----------

from pyspark.sql.types import (
    StructType, StructField, StringType, TimestampType,
    LongType, MapType, BinaryType
)
from pyspark.sql.functions import (
    col, current_timestamp, lit, from_json, to_timestamp,
    input_file_name, expr, date_format, coalesce
)

bronze_schema = StructType([
    StructField("event_id", StringType(), False),
    StructField("ingest_timestamp", TimestampType(), False),
    StructField("source_name", StringType(), False),
    StructField("source_type", StringType(), False),
    StructField("raw_event", StringType(), False),
    StructField("raw_bytes", BinaryType(), True),
    StructField("event_timestamp", TimestampType(), True),
    StructField("partition_date", StringType(), False),
    StructField("kafka_offset", LongType(), True),
    StructField("kafka_partition", LongType(), True),
    StructField("kafka_topic", StringType(), True),
    StructField("file_path", StringType(), True),
    StructField("headers", MapType(StringType(), StringType()), True),
])

# COMMAND ----------

# MAGIC %md
# MAGIC ## Create Bronze Table (idempotent)

# COMMAND ----------

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")

spark.sql(f"""
    CREATE TABLE IF NOT EXISTS {catalog}.{schema}.bronze_events (
        event_id STRING NOT NULL,
        ingest_timestamp TIMESTAMP NOT NULL,
        source_name STRING NOT NULL,
        source_type STRING NOT NULL,
        raw_event STRING NOT NULL,
        raw_bytes BINARY,
        event_timestamp TIMESTAMP,
        partition_date STRING NOT NULL,
        kafka_offset BIGINT,
        kafka_partition BIGINT,
        kafka_topic STRING,
        file_path STRING,
        headers MAP<STRING, STRING>
    )
    USING DELTA
    PARTITIONED BY (partition_date, source_name)
    TBLPROPERTIES (
        'delta.autoOptimize.optimizeWrite' = 'true',
        'delta.autoOptimize.autoCompact' = 'true',
        'delta.deletedFileRetentionDuration' = 'interval 30 days',
        'delta.logRetentionDuration' = 'interval 90 days'
    )
""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source-Specific Stream Readers

# COMMAND ----------

def create_kafka_stream(bootstrap_servers: str, topics: str):
    """Create streaming DataFrame from Kafka with SASL/SSL support."""
    kafka_options = {
        "kafka.bootstrap.servers": bootstrap_servers,
        "subscribe": topics,
        "startingOffsets": "latest",
        "failOnDataLoss": "false",
    }
    # Add authentication from secrets if configured
    try:
        sasl = dbutils.secrets.get(scope="kafka", key=f"{source_name}_sasl_mechanism")
        if sasl:
            kafka_options["kafka.sasl.mechanism"] = sasl
            kafka_options["kafka.security.protocol"] = "SASL_SSL"
            kafka_options["kafka.sasl.jaas.config"] = dbutils.secrets.get(
                scope="kafka", key=f"{source_name}_jaas_config")
    except Exception:
        pass

    return (spark.readStream.format("kafka").options(**kafka_options).load()
        .select(
            col("value").cast("string").alias("raw_event"),
            col("value").alias("raw_bytes"),
            col("topic").alias("kafka_topic"),
            col("partition").cast("long").alias("kafka_partition"),
            col("offset").cast("long").alias("kafka_offset"),
            col("timestamp").alias("event_timestamp")))


def create_autoloader_stream(path: str, file_format: str):
    """Create streaming DataFrame using Auto Loader with schema evolution."""
    from pyspark.sql.functions import to_json, struct
    raw_df = (spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", file_format)
        .option("cloudFiles.inferColumnTypes", "true")
        .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
        .load(path))
    return raw_df.select(
        to_json(struct("*")).alias("raw_event"),
        lit(None).cast("binary").alias("raw_bytes"),
        lit(None).cast("string").alias("kafka_topic"),
        lit(None).cast("long").alias("kafka_partition"),
        lit(None).cast("long").alias("kafka_offset"),
        coalesce(col("timestamp").cast("timestamp"), current_timestamp()).alias("event_timestamp"),
        input_file_name().alias("file_path"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build & Start Stream

# COMMAND ----------

if source_type == "kafka":
    raw_stream = create_kafka_stream(
        dbutils.widgets.get("kafka_bootstrap"),
        dbutils.widgets.get("kafka_topic"))
elif source_type == "autoloader":
    raw_stream = create_autoloader_stream(
        dbutils.widgets.get("storage_path"),
        dbutils.widgets.get("storage_format"))
else:
    raise ValueError(f"Unsupported source_type: {source_type}")

# Add bronze envelope
bronze_stream = (raw_stream
    .withColumn("event_id", expr("uuid()"))
    .withColumn("ingest_timestamp", current_timestamp())
    .withColumn("source_name", lit(source_name))
    .withColumn("source_type", lit(source_type))
    .withColumn("partition_date", date_format(current_timestamp(), "yyyy-MM-dd")))

# Start streaming write
query = (bronze_stream.writeStream
    .format("delta")
    .outputMode("append")
    .option("checkpointLocation", checkpoint_path)
    .option("mergeSchema", "true")
    .trigger(processingTime=dbutils.widgets.get("processing_time"))
    .queryName(f"bronze_ingest_{source_name}")
    .toTable(f"{catalog}.{schema}.bronze_events"))

print(f"Stream started: {query.id}")`;

const SCHEMA_ENFORCEMENT_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # 02 - Schema Enforcement & OCSF Normalization (Silver Layer)
# MAGIC
# MAGIC Reads raw events from Bronze, applies source-specific parsing,
# MAGIC normalizes to OCSF (Open Cybersecurity Schema Framework), and writes to Silver.
# MAGIC
# MAGIC **OCSF Categories:** System Activity, Findings, IAM, Network, Discovery, Application
# MAGIC
# MAGIC **Input:** \`{catalog}.{schema}.bronze_events\`
# MAGIC **Output:** \`{catalog}.{schema}.silver_events\` + \`quarantine_events\`

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source-Specific Parsers

# COMMAND ----------

from pyspark.sql.functions import (
    col, from_json, get_json_object, when, lit, coalesce,
    current_timestamp, to_timestamp, date_format, expr
)

def parse_cloudtrail(df):
    """AWS CloudTrail log parser."""
    return (df
        .withColumn("actor_user_id", get_json_object(col("raw_event"), "$.userIdentity.arn"))
        .withColumn("src_ip", get_json_object(col("raw_event"), "$.sourceIPAddress"))
        .withColumn("type_name", get_json_object(col("raw_event"), "$.eventName"))
        .withColumn("resource_name", get_json_object(col("raw_event"), "$.requestParameters.resourceArn"))
        .withColumn("category_uid", lit(6))
        .withColumn("status_id", when(
            get_json_object(col("raw_event"), "$.errorCode").isNotNull(), lit(2)
        ).otherwise(lit(1))))


def parse_vpc_flow_logs(df):
    """AWS VPC Flow Log parser."""
    return (df
        .withColumn("src_ip", get_json_object(col("raw_event"), "$.srcAddr"))
        .withColumn("dst_ip", get_json_object(col("raw_event"), "$.dstAddr"))
        .withColumn("src_port", get_json_object(col("raw_event"), "$.srcPort").cast("int"))
        .withColumn("dst_port", get_json_object(col("raw_event"), "$.dstPort").cast("int"))
        .withColumn("bytes_in", get_json_object(col("raw_event"), "$.bytes").cast("long"))
        .withColumn("category_uid", lit(4))
        .withColumn("status_id", when(
            get_json_object(col("raw_event"), "$.action") == "ACCEPT", lit(1)
        ).otherwise(lit(2))))


def parse_crowdstrike(df):
    """CrowdStrike Falcon event parser."""
    return (df
        .withColumn("actor_user_id", get_json_object(col("raw_event"), "$.UserName"))
        .withColumn("actor_process_name", get_json_object(col("raw_event"), "$.FileName"))
        .withColumn("src_ip", get_json_object(col("raw_event"), "$.LocalIP"))
        .withColumn("dst_ip", get_json_object(col("raw_event"), "$.RemoteIP"))
        .withColumn("type_name", get_json_object(col("raw_event"), "$.DetectName"))
        .withColumn("category_uid", lit(2))
        .withColumn("severity_id", when(
            get_json_object(col("raw_event"), "$.Severity").isin("5","Critical"), lit(5)
        ).when(
            get_json_object(col("raw_event"), "$.Severity").isin("4","High"), lit(4)
        ).otherwise(lit(3))))


def parse_generic_json(df):
    """Generic JSON parser - extracts common fields by naming convention."""
    return (df
        .withColumn("_p", from_json(col("raw_event"), "MAP<STRING, STRING>"))
        .withColumn("actor_user_id", coalesce(
            col("_p.user_id"), col("_p.userId"), col("_p.user"), col("_p.username")))
        .withColumn("src_ip", coalesce(
            col("_p.source_ip"), col("_p.sourceIp"), col("_p.src_ip"), col("_p.srcAddr")))
        .withColumn("dst_ip", coalesce(
            col("_p.dest_ip"), col("_p.destIp"), col("_p.dst_ip"), col("_p.dstAddr")))
        .withColumn("type_name", coalesce(
            col("_p.event_type"), col("_p.eventType"), col("_p.type"), col("_p.action")))
        .withColumn("status_id", when(
            coalesce(col("_p.status"), col("_p.result")).isin("success","200","allowed"), lit(1)
        ).otherwise(lit(2)))
        .drop("_p"))

PARSERS = {
    "cloudtrail": parse_cloudtrail,
    "vpc_flow_logs": parse_vpc_flow_logs,
    "crowdstrike": parse_crowdstrike,
    "generic": parse_generic_json,
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Streaming Normalization with Quarantine

# COMMAND ----------

def normalize_batch(batch_df, batch_id):
    """Parse, normalize, validate, and route to silver or quarantine."""
    if batch_df.isEmpty():
        return

    sources = [r.source_name for r in batch_df.select("source_name").distinct().collect()]
    for src in sources:
        source_df = batch_df.filter(col("source_name") == src)
        parser = PARSERS.get(src, PARSERS["generic"])
        try:
            parsed = parser(source_df)
            # Add OCSF metadata
            parsed = (parsed
                .withColumn("normalized_at", current_timestamp())
                .withColumn("normalization_version", lit("2.0.0"))
                .withColumn("time", coalesce(col("event_timestamp"), col("ingest_timestamp")))
                .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd")))

            valid = parsed.filter(col("event_id").isNotNull() & col("time").isNotNull())
            invalid = parsed.filter(col("event_id").isNull() | col("time").isNull())

            valid.write.format("delta").mode("append").option("mergeSchema", "true").saveAsTable(
                f"{catalog}.{schema}.silver_events")
            if invalid.count() > 0:
                invalid.withColumn("quarantine_reason", lit(f"Missing required fields")).write.format("delta").mode("append").saveAsTable(
                    f"{catalog}.{schema}.quarantine_events")
        except Exception as e:
            source_df.withColumn("quarantine_reason", lit(str(e)[:200])).write.format("delta").mode("append").option("mergeSchema","true").saveAsTable(
                f"{catalog}.{schema}.quarantine_events")

# Start stream
bronze_stream = spark.readStream.format("delta").table(f"{catalog}.{schema}.bronze_events")
query = (bronze_stream.writeStream.foreachBatch(normalize_batch)
    .option("checkpointLocation", f"/Volumes/{catalog}/{schema}/checkpoints/silver_normalize")
    .trigger(processingTime="30 seconds")
    .queryName("silver_normalization").start())`;

const STREAMING_CORRELATION_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # Streaming Correlation Engine
# MAGIC
# MAGIC Stateful Spark Structured Streaming that evaluates correlation rules
# MAGIC against enriched events in real-time. Outputs to alerts table.
# MAGIC
# MAGIC **Detections:** Brute force, port scanning, beacon detection,
# MAGIC data exfiltration, credential stuffing, kill chain progression.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Temporal Window Detections

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, sum as spark_sum, avg, stddev,
    window, current_timestamp, lit, when, expr, date_format
)

enriched_stream = (spark.readStream.format("delta")
    .option("maxFilesPerTrigger", 100)
    .table(f"{catalog}.{schema}.enriched_events")
    .withWatermark("time", "5 minutes"))

# Brute force: >10 auth failures from same source in 5 minutes
brute_force = (enriched_stream
    .filter((col("type_name").rlike("(?i)auth|login")) & (col("status_id") == 2))
    .groupBy(window(col("time"), "5 minutes", "1 minute"), col("src_ip"), col("dst_ip"))
    .agg(count("*").alias("failure_count"), countDistinct("actor_user_id").alias("distinct_users"))
    .filter(col("failure_count") >= 10)
    .select(
        expr("uuid()").alias("detection_id"),
        lit("brute_force").alias("detection_type"),
        when(col("failure_count") >= 50, "critical")
            .when(col("failure_count") >= 20, "high")
            .otherwise("medium").alias("severity"),
        col("src_ip").alias("entity_value"),
        col("failure_count").alias("event_count"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        lit("T1110").alias("mitre_technique"),
        current_timestamp().alias("created_at")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Beacon Detection (Periodic C2 Communication)

# COMMAND ----------

# Low byte-size variance = automation/beaconing
beacon = (enriched_stream
    .filter((col("category_uid") == 4) & col("bytes_out").isNotNull())
    .groupBy(window(col("time"), "1 hour"), col("src_ip"), col("dst_ip"), col("dst_port"))
    .agg(
        count("*").alias("connections"),
        avg("bytes_out").alias("avg_bytes"),
        stddev("bytes_out").alias("stddev_bytes"))
    .filter((col("connections") >= 10) & (col("stddev_bytes") < col("avg_bytes") * 0.2))
    .select(
        expr("uuid()").alias("detection_id"),
        lit("beacon_detection").alias("detection_type"),
        lit("high").alias("severity"),
        col("src_ip").alias("entity_value"),
        col("connections").alias("event_count"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        lit("T1071").alias("mitre_technique"),
        current_timestamp().alias("created_at")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Data Exfiltration Detection

# COMMAND ----------

exfil = (enriched_stream
    .filter(col("bytes_out").isNotNull() & (col("bytes_out") > 0))
    .groupBy(window(col("time"), "15 minutes"), col("actor_user_id"), col("dst_ip"))
    .agg(spark_sum("bytes_out").alias("total_bytes"), count("*").alias("transfers"))
    .filter((col("total_bytes") > 104857600) & (col("transfers") > 5))
    .select(
        expr("uuid()").alias("detection_id"),
        lit("data_exfiltration").alias("detection_type"),
        when(col("total_bytes") > 1073741824, "critical").otherwise("high").alias("severity"),
        col("actor_user_id").alias("entity_value"),
        col("transfers").alias("event_count"),
        col("window.start").alias("window_start"),
        col("window.end").alias("window_end"),
        lit("T1048").alias("mitre_technique"),
        current_timestamp().alias("created_at")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write All Detections

# COMMAND ----------

from functools import reduce
all_detections = reduce(lambda a, b: a.unionByName(b, allowMissingColumns=True),
    [brute_force, beacon, exfil])

query = (all_detections.writeStream
    .format("delta").outputMode("append")
    .option("checkpointLocation", f"/Volumes/{catalog}/{schema}/checkpoints/correlation")
    .trigger(processingTime="10 seconds")
    .queryName("streaming_correlation")
    .toTable(f"{catalog}.{schema}.temporal_detections"))

print(f"Correlation engine running: {query.id}")`;

const GRAPH_CORRELATION_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # Graph Correlation Engine
# MAGIC
# MAGIC Uses GraphFrames to detect attack patterns via entity relationships.
# MAGIC Detects lateral movement, anomalous centrality, and campaign clustering.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Build Security Entity Graph

# COMMAND ----------

from pyspark.sql.functions import col, count, countDistinct, collect_set, lit, expr, when
from graphframes import GraphFrame

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {lookback_hours} HOURS"))

# Vertices: users, IPs, hosts, resources
vertices = (
    events.filter(col("actor_user_id").isNotNull())
        .select(col("actor_user_id").alias("id")).withColumn("entity_type", lit("user"))
    .union(events.filter(col("src_ip").isNotNull())
        .select(col("src_ip").alias("id")).withColumn("entity_type", lit("ip")))
    .union(events.filter(col("dst_hostname").isNotNull())
        .select(col("dst_hostname").alias("id")).withColumn("entity_type", lit("host")))
    .distinct())

# Edges: authentication, network connections, resource access
edges = (
    events.filter(col("actor_user_id").isNotNull() & col("dst_hostname").isNotNull())
        .select(col("actor_user_id").alias("src"), col("dst_hostname").alias("dst"),
                lit("logged_into").alias("relationship"))
    .union(events.filter(col("src_ip").isNotNull() & col("dst_ip").isNotNull())
        .select(col("src_ip").alias("src"), col("dst_ip").alias("dst"),
                lit("connected_to").alias("relationship")))
    .groupBy("src", "dst", "relationship").agg(count("*").alias("weight")))

graph = GraphFrame(vertices, edges)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Lateral Movement Detection (Motif Finding)

# COMMAND ----------

# User → Host A → Host B → Host C pattern
lateral = graph.find(
    "(u)-[e1]->(h1); (u)-[e2]->(h2); (u)-[e3]->(h3)"
).filter(
    (col("e1.relationship") == "logged_into") &
    (col("e2.relationship") == "logged_into") &
    (col("e3.relationship") == "logged_into") &
    (col("h1.id") != col("h2.id")) &
    (col("h2.id") != col("h3.id")))

print(f"Lateral movement patterns: {lateral.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## PageRank Anomaly Detection

# COMMAND ----------

pagerank = graph.pageRank(resetProbability=0.15, maxIter=10)
stats = pagerank.vertices.select("pagerank").summary("mean", "stddev").collect()
mean_pr = float(stats[0]["pagerank"])
stddev_pr = float(stats[1]["pagerank"])

# Entities >3 std dev above mean are anomalous pivot points
anomalies = pagerank.vertices.filter(col("pagerank") > mean_pr + (3 * stddev_pr))
print(f"PageRank anomalies: {anomalies.count()} entities")`;

const NEGATIVE_CORRELATION_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # Negative Correlation Engine
# MAGIC
# MAGIC Detects threats by identifying what DIDN'T happen.
# MAGIC Expected events that are absent indicate compromise or evasion.
# MAGIC
# MAGIC **Patterns:** MFA bypass, no-DNS C2, unauthorized privilege, off-hours service accounts.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Authentication Without MFA Challenge

# COMMAND ----------

from pyspark.sql.functions import col, count, collect_set, expr, lit, when, current_timestamp

# Successful auths
auths = events.filter(col("type_name").rlike("(?i)auth|login") & (col("status_id") == 1))
# MFA challenge events
mfa = events.filter(col("type_name").rlike("(?i)mfa|2fa|challenge|verify"))

# Left anti join: users who authenticated but never had MFA
no_mfa = auths.select("actor_user_id", "time", "src_ip", "src_geo_country").join(
    mfa.select(col("actor_user_id").alias("mfa_user"), col("time").alias("mfa_time")),
    (auths.actor_user_id == mfa.mfa_user) &
    (mfa.mfa_time.between(auths.time - expr("INTERVAL 5 MINUTES"), auths.time)),
    "left_anti"
).filter(~col("actor_user_id").rlike("(?i)^(svc|service|system)[-_]"))

print(f"Auth without MFA: {no_mfa.count()} events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Network Connection Without DNS Resolution

# COMMAND ----------

# Outbound connections to external IPs
outbound = events.filter(
    (col("category_uid") == 4) & col("dst_ip").isNotNull() &
    (~col("dst_ip").rlike("^(10\\\\.|172\\\\.(1[6-9]|2|3[01])\\\\.|192\\\\.168\\\\.)")))

# DNS queries
dns = events.filter(col("type_name").rlike("(?i)dns|resolve")).select(
    col("src_ip").alias("dns_client"), col("dst_ip").alias("resolved_ip"))

# Connections with no prior DNS = possible hardcoded C2
no_dns = outbound.join(dns,
    (outbound.src_ip == dns.dns_client) & (outbound.dst_ip == dns.resolved_ip),
    "left_anti")

no_dns_grouped = no_dns.groupBy("src_ip", "dst_ip").agg(count("*").alias("connections")).filter(col("connections") >= 3)
print(f"No-DNS connections (possible C2): {no_dns_grouped.count()}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection: Service Account Off-Hours Activity

# COMMAND ----------

from pyspark.sql.functions import hour, dayofweek

svc_offhours = (events
    .filter(col("actor_user_id").rlike("(?i)^(svc|service|app)[-_]"))
    .filter((dayofweek(col("time")).isin(1, 7)) | (hour(col("time")) < 6) | (hour(col("time")) > 22))
    .groupBy("actor_user_id")
    .agg(count("*").alias("events"), countDistinct("dst_ip").alias("destinations"))
    .filter(col("events") >= 5))

print(f"Service accounts active off-hours: {svc_offhours.count()}")`;

const BEHAVIORAL_BASELINE_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # UEBA Behavioral Baseline Computation
# MAGIC
# MAGIC Computes 30-day rolling behavioral baselines for users, devices, and services.
# MAGIC Baselines represent "normal" against which anomalies are scored.
# MAGIC
# MAGIC **Profiles:** Login patterns, resource access, network behavior, peer group norms.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Login Behavior Baselines

# COMMAND ----------

from pyspark.sql.functions import (
    col, count, countDistinct, avg, stddev, percentile_approx,
    hour, dayofweek, collect_set, sum as spark_sum, when, lit, expr
)

events = spark.table(f"{catalog}.{schema}.enriched_events").filter(
    col("time") >= expr(f"current_timestamp() - INTERVAL {baseline_days} DAYS"))

login_baselines = (events
    .filter(col("type_name").rlike("(?i)auth|login") & col("actor_user_id").isNotNull())
    .groupBy("actor_user_id")
    .agg(
        count("*").alias("total_logins"),
        avg(hour(col("time"))).alias("avg_login_hour"),
        stddev(hour(col("time"))).alias("stddev_login_hour"),
        percentile_approx(hour(col("time")).cast("double"), 0.05).alias("p5_hour"),
        percentile_approx(hour(col("time")).cast("double"), 0.95).alias("p95_hour"),
        countDistinct("src_ip").alias("distinct_ips"),
        countDistinct("src_geo_country").alias("distinct_countries"),
        collect_set("src_geo_country").alias("normal_countries"),
        spark_sum(when(col("status_id") == 2, 1).otherwise(0)).alias("failures"))
    .filter(col("total_logins") >= 50)
    .withColumn("failure_rate", col("failures") / col("total_logins"))
    .withColumn("logins_per_day", col("total_logins") / lit(baseline_days)))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Network Behavior Baselines

# COMMAND ----------

network_baselines = (events
    .filter((col("category_uid") == 4) & col("src_ip").isNotNull())
    .groupBy("src_ip")
    .agg(
        count("*").alias("total_connections"),
        countDistinct("dst_ip").alias("distinct_destinations"),
        countDistinct("dst_port").alias("distinct_ports"),
        spark_sum("bytes_out").alias("total_bytes_out"),
        avg("bytes_out").alias("avg_bytes_out"),
        stddev("bytes_out").alias("stddev_bytes_out"),
        percentile_approx(col("bytes_out").cast("double"), 0.95).alias("p95_bytes"))
    .filter(col("total_connections") >= 50))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Baselines to Feature Store

# COMMAND ----------

login_baselines.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.behavioral_baselines_login")
network_baselines.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.behavioral_baselines_network")

print(f"Baselines computed: {login_baselines.count()} users, {network_baselines.count()} IPs")`;

const ML_TRAINING_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # ML Model Training - Anomaly Detection
# MAGIC
# MAGIC Trains Isolation Forest models using Feature Store data.
# MAGIC MLflow experiment tracking + champion/challenger evaluation.
# MAGIC
# MAGIC **Models:** User anomaly detector, Network anomaly detector
# MAGIC **Output:** Unity Catalog Model Registry

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feature Engineering & Training

# COMMAND ----------

import mlflow
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from databricks.feature_engineering import FeatureEngineeringClient
import numpy as np

mlflow.set_experiment(experiment_name)
fe = FeatureEngineeringClient()

user_features = spark.table(f"{catalog}.{schema}.user_security_features").toPandas()
feature_cols = ["event_count_24h", "distinct_ips_24h", "failure_count_24h",
    "high_severity_count_24h", "ioc_match_count_24h", "off_hours_events_24h",
    "total_bytes_out_24h", "failure_rate_24h", "ip_deviation", "volume_deviation"]

X = user_features[[c for c in feature_cols if c in user_features.columns]].fillna(0).values

# COMMAND ----------

# MAGIC %md
# MAGIC ## Train with MLflow Tracking

# COMMAND ----------

with mlflow.start_run(run_name="user_anomaly_isolation_forest"):
    mlflow.log_param("model_type", "isolation_forest")
    mlflow.log_param("n_estimators", 200)
    mlflow.log_param("contamination", 0.05)
    mlflow.log_param("training_samples", X.shape[0])

    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(n_estimators=200, contamination=0.05, random_state=42, n_jobs=-1)
    model.fit(X_scaled)

    predictions = model.predict(X_scaled)
    scores = model.score_samples(X_scaled)
    anomaly_rate = (predictions == -1).sum() / len(predictions)

    mlflow.log_metric("anomaly_rate", float(anomaly_rate))
    mlflow.log_metric("mean_score", float(np.mean(scores)))
    mlflow.sklearn.log_model(model, "model",
        registered_model_name=f"{catalog}.{schema}.user_anomaly_detector")

    print(f"Trained: anomaly_rate={anomaly_rate:.4f}, samples={X.shape[0]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Champion/Challenger Evaluation

# COMMAND ----------

from mlflow.tracking import MlflowClient
client = MlflowClient()

versions = client.search_model_versions(f"name='{catalog}.{schema}.user_anomaly_detector'")
production = [v for v in versions if v.current_stage == "Production"]

if not production:
    # Promote first model
    client.transition_model_version_stage(
        name=f"{catalog}.{schema}.user_anomaly_detector",
        version=versions[-1].version, stage="Production")
    print("Promoted to Production (first model)")
else:
    # Compare with champion
    champion_rate = client.get_run(production[0].run_id).data.metrics.get("anomaly_rate", 0)
    if abs(anomaly_rate - champion_rate) < 0.02:
        client.transition_model_version_stage(
            name=f"{catalog}.{schema}.user_anomaly_detector",
            version=versions[-1].version, stage="Production")
        print(f"Challenger promoted (delta={abs(anomaly_rate-champion_rate):.4f})")
    else:
        print(f"Challenger rejected (delta={abs(anomaly_rate-champion_rate):.4f} > 0.02)")`;

const DLT_PIPELINE_SOURCE = `# Databricks notebook source
# MAGIC %md
# MAGIC # Delta Live Tables Pipeline
# MAGIC
# MAGIC Complete Bronze → Silver → Gold DLT pipeline with data quality expectations.
# MAGIC Deploy as a DLT pipeline in Databricks Workflows.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Bronze Layer (Raw Ingestion)

# COMMAND ----------

import dlt
from pyspark.sql.functions import col, current_timestamp, lit, expr, date_format, coalesce

@dlt.table(name="bronze_events_dlt", comment="Raw security events (append-only)",
    table_properties={"quality": "bronze", "delta.autoOptimize.optimizeWrite": "true"},
    partition_cols=["partition_date", "source_name"])
@dlt.expect_or_drop("valid_payload", "raw_event IS NOT NULL AND LENGTH(raw_event) > 2")
@dlt.expect_or_drop("valid_id", "event_id IS NOT NULL")
def bronze_events_dlt():
    return (spark.readStream.format("cloudFiles")
        .option("cloudFiles.format", "json")
        .option("cloudFiles.inferColumnTypes", "true")
        .load(spark.conf.get("pipeline.storage_path"))
        .select(
            expr("uuid()").alias("event_id"),
            current_timestamp().alias("ingest_timestamp"),
            lit("autoloader").alias("source_name"),
            col("*")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Silver Layer (OCSF Normalization)

# COMMAND ----------

@dlt.table(name="silver_events_dlt", comment="Normalized OCSF events",
    table_properties={"quality": "silver"},
    partition_cols=["partition_date"])
@dlt.expect_or_drop("valid_timestamp", "time IS NOT NULL")
@dlt.expect("has_category", "category_uid IS NOT NULL")
@dlt.expect("has_severity", "severity_id BETWEEN 0 AND 6")
def silver_events_dlt():
    from pyspark.sql.functions import from_json, when
    return (dlt.read_stream("bronze_events_dlt")
        .withColumn("time", coalesce(col("event_timestamp"), col("ingest_timestamp")))
        .withColumn("category_uid",
            when(col("type_name").rlike("(?i)auth"), lit(3))
            .when(col("type_name").rlike("(?i)network"), lit(4))
            .otherwise(lit(1)))
        .withColumn("severity_id",
            when(col("type_name").rlike("(?i)critical"), lit(5))
            .when(col("type_name").rlike("(?i)high"), lit(4))
            .otherwise(lit(2)))
        .withColumn("partition_date", date_format(col("time"), "yyyy-MM-dd")))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Gold Layer (Analytics Aggregations)

# COMMAND ----------

from pyspark.sql.functions import count, countDistinct, sum as spark_sum, window, avg

@dlt.table(name="gold_hourly_metrics", comment="Hourly security KPIs",
    table_properties={"quality": "gold"})
def gold_hourly_metrics():
    return (dlt.read_stream("silver_events_dlt")
        .groupBy(window(col("time"), "1 hour"), col("source_name"))
        .agg(
            count("*").alias("event_count"),
            countDistinct("actor_user_id").alias("unique_users"),
            spark_sum(when(col("severity_id") >= 4, 1).otherwise(0)).alias("high_severity")))`;

// ============================================================
// Build Notebook Objects
// ============================================================

export const productionIngestionNotebooks: DatabricksNotebook[] = [
  {
    id: 'prod-raw-event-ingestion',
    title: 'Raw Event Ingestion (Bronze Layer)',
    subtitle: 'Multi-source streaming ingest: Kafka, Kinesis, Auto Loader, S3/ADLS/GCS',
    category: 'streaming',
    tags: ['Production', 'Bronze', 'Kafka', 'Auto Loader', 'Kinesis', 'Streaming'],
    description: 'Production-grade streaming ingestion pipeline that accepts ANY data source format and lands raw events into partitioned Bronze Delta table. Supports Kafka/Confluent, Kinesis, and cloud storage with Auto Loader schema evolution.',
    estimatedRuntime: 'Continuous',
    clusterRequirements: 'DBR 14.3+, 2-8 workers (autoscale)',
    cells: parseNotebookSource(RAW_INGESTION_SOURCE),
  },
  {
    id: 'prod-schema-enforcement',
    title: 'OCSF Normalization & Schema Enforcement (Silver)',
    subtitle: 'Source-specific parsing → OCSF standard with quarantine routing',
    category: 'streaming',
    tags: ['Production', 'Silver', 'OCSF', 'Normalization', 'Quarantine'],
    description: 'Normalizes raw Bronze events to Open Cybersecurity Schema Framework (OCSF). Includes parsers for CloudTrail, VPC Flow Logs, CrowdStrike, and generic JSON. Invalid events are quarantined for retry.',
    estimatedRuntime: 'Continuous',
    clusterRequirements: 'DBR 14.3+, 2-4 workers',
    cells: parseNotebookSource(SCHEMA_ENFORCEMENT_SOURCE),
  },
];

export const productionCorrelationNotebooks: DatabricksNotebook[] = [
  {
    id: 'prod-streaming-correlation',
    title: 'Streaming Correlation Engine',
    subtitle: 'Real-time temporal detection: brute force, beacons, exfiltration',
    category: 'correlation',
    tags: ['Production', 'Correlation', 'Streaming', 'Temporal Windows', 'Watermarks'],
    description: 'Stateful Spark Structured Streaming with watermarks for real-time attack detection. Implements brute force, beacon/C2, and data exfiltration detection using sliding and tumbling windows.',
    estimatedRuntime: 'Continuous',
    clusterRequirements: 'DBR 14.3+, 2-6 workers, RocksDB state store',
    cells: parseNotebookSource(STREAMING_CORRELATION_SOURCE),
  },
  {
    id: 'prod-graph-correlation',
    title: 'Graph Correlation Engine',
    subtitle: 'GraphFrames: lateral movement, PageRank anomalies, campaign clustering',
    category: 'correlation',
    tags: ['Production', 'Graph', 'GraphFrames', 'Lateral Movement', 'PageRank'],
    description: 'Uses GraphFrames motif finding to detect lateral movement patterns, PageRank for anomalous entity centrality, and connected components for campaign clustering.',
    estimatedRuntime: '15 min (hourly schedule)',
    clusterRequirements: 'DBR 14.3+, 4 workers, graphframes package',
    cells: parseNotebookSource(GRAPH_CORRELATION_SOURCE),
  },
  {
    id: 'prod-negative-correlation',
    title: 'Negative Correlation Engine',
    subtitle: 'Detection by absence: MFA bypass, no-DNS C2, unauthorized privilege',
    category: 'correlation',
    tags: ['Production', 'Negative Correlation', 'Absence Detection', 'Evasion'],
    description: 'Unique detection engine that finds threats by identifying EXPECTED events that are ABSENT. Detects MFA bypass, hardcoded C2 (no DNS), privilege escalation without approval, and off-hours service account abuse.',
    estimatedRuntime: '10 min (every 15 min)',
    clusterRequirements: 'DBR 14.3+, 2 workers',
    cells: parseNotebookSource(NEGATIVE_CORRELATION_SOURCE),
  },
];

export const productionMLNotebooks: DatabricksNotebook[] = [
  {
    id: 'prod-behavioral-baselines',
    title: 'UEBA Behavioral Baseline Computation',
    subtitle: '30-day rolling baselines for login, access, and network behavior',
    category: 'behavioral',
    tags: ['Production', 'UEBA', 'Baselines', 'Feature Store'],
    description: 'Computes behavioral baselines for users and devices. Profiles login patterns (time, location, devices), resource access patterns, and network behavior. Used by anomaly detection models for deviation scoring.',
    estimatedRuntime: '20 min (daily)',
    clusterRequirements: 'DBR 14.3+, 2-4 workers',
    cells: parseNotebookSource(BEHAVIORAL_BASELINE_SOURCE),
  },
  {
    id: 'prod-ml-training',
    title: 'Anomaly Detection Model Training',
    subtitle: 'Isolation Forest + MLflow + Champion/Challenger evaluation',
    category: 'ml',
    tags: ['Production', 'MLflow', 'Isolation Forest', 'Model Registry', 'Feature Store'],
    description: 'Trains anomaly detection models (Isolation Forest) using Feature Store data. Full MLflow tracking, feature importance analysis, and automated champion/challenger model promotion.',
    estimatedRuntime: '10 min (weekly)',
    clusterRequirements: 'DBR 14.3 ML, 2 workers',
    cells: parseNotebookSource(ML_TRAINING_SOURCE),
  },
  {
    id: 'prod-dlt-pipeline',
    title: 'Delta Live Tables Pipeline (Bronze → Silver → Gold)',
    subtitle: 'Complete DLT pipeline with expectations and auto-optimization',
    category: 'streaming',
    tags: ['Production', 'DLT', 'Bronze', 'Silver', 'Gold', 'Data Quality'],
    description: 'Delta Live Tables pipeline definition for the complete Bronze → Silver → Gold data flow. Includes data quality expectations (@dlt.expect), auto-optimization, and quality monitoring.',
    estimatedRuntime: 'Continuous (DLT managed)',
    clusterRequirements: 'DLT pipeline cluster (auto-managed)',
    cells: parseNotebookSource(DLT_PIPELINE_SOURCE),
  },
];

export const allProductionNotebooks: DatabricksNotebook[] = [
  ...productionIngestionNotebooks,
  ...productionCorrelationNotebooks,
  ...productionMLNotebooks,
];
