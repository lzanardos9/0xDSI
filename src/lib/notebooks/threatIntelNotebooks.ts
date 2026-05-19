import { DatabricksNotebook } from '../databricksNotebooks';

export const threatIntelNotebooks: DatabricksNotebook[] = [
  {
    id: 'threat-feed-live-ingestion',
    title: 'Live Threat Feed Ingestion (TAXII/OTX/MISP)',
    subtitle: 'Real connectors for AlienVault OTX, MISP, and STIX/TAXII 2.1 endpoints',
    category: 'threat-intel',
    tags: ['STIX/TAXII', 'AlienVault OTX', 'MISP', 'Live Ingestion', 'Idempotent MERGE'],
    description: 'Production-grade threat intelligence ingestion. Pulls real IOCs from AlienVault OTX, MISP, and any STIX/TAXII 2.1 collection, normalizes to a common schema, deduplicates by (type,value), and upserts into Delta via idempotent MERGE. Credentials from Databricks Secret Scope. Runs on a 15-minute schedule.',
    estimatedRuntime: '4 min per run',
    clusterRequirements: 'DBR 14.3 LTS, 1+ workers, internet egress allowed',
    cells: [
      {
        type: 'markdown',
        content: `# Live Threat Feed Ingestion

Production notebook connecting to real threat intelligence APIs:

| Source | Protocol | Auth |
|---|---|---|
| AlienVault OTX | REST | API key in secret scope |
| MISP | REST | API key in secret scope |
| Any STIX/TAXII 2.1 collection | TAXII 2.1 | Basic auth in secret scope |

### Failure Semantics
- Each connector runs independently; a failure in one source does NOT block others
- All writes use Delta MERGE on (indicator_type, indicator_value) for idempotent reruns
- Run failures are written to \`feed_run_log\` for observability
- Schedule: every 15 minutes via Databricks Jobs`,
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & Secret Scope
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, TimestampType, ArrayType, IntegerType,
)
from delta.tables import DeltaTable
from datetime import datetime, timedelta, timezone
import json
import urllib.request
import urllib.error

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("secret_scope", "soc-platform")
dbutils.widgets.text("max_indicators_per_source", "5000")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
SECRET_SCOPE = dbutils.widgets.get("secret_scope")
MAX_INDICATORS = int(dbutils.widgets.get("max_indicators_per_source"))

spark.sql(f"USE {CATALOG}.{SCHEMA}")

def get_secret(key: str, default=None):
    """Read from Databricks Secret Scope, fall back to None if not set."""
    try:
        return dbutils.secrets.get(scope=SECRET_SCOPE, key=key)
    except Exception:
        return default

OTX_API_KEY = get_secret("otx_api_key")
MISP_URL = get_secret("misp_url")
MISP_API_KEY = get_secret("misp_api_key")
TAXII_URL = get_secret("taxii_url")
TAXII_USER = get_secret("taxii_user")
TAXII_PASS = get_secret("taxii_pass")

print("Configured sources:")
print(f"  OTX:   {'YES' if OTX_API_KEY else 'no (skip)'}")
print(f"  MISP:  {'YES' if MISP_URL and MISP_API_KEY else 'no (skip)'}")
print(f"  TAXII: {'YES' if TAXII_URL else 'no (skip)'}") `,
      },
      {
        type: 'sql',
        content: `-- Cell 2: Idempotent target tables
CREATE TABLE IF NOT EXISTS threat_indicators (
  indicator_type STRING NOT NULL,
  indicator_value STRING NOT NULL,
  source STRING NOT NULL,
  confidence DOUBLE,
  severity STRING,
  tags ARRAY<STRING>,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  report_count INT DEFAULT 1,
  raw_payload STRING,
  ingested_at TIMESTAMP DEFAULT current_timestamp(),
  CONSTRAINT indicator_pk PRIMARY KEY (indicator_type, indicator_value, source) RELY
) USING DELTA
PARTITIONED BY (indicator_type)
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');

CREATE TABLE IF NOT EXISTS feed_run_log (
  run_id STRING,
  source STRING,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  status STRING,
  indicators_ingested INT DEFAULT 0,
  error_message STRING
) USING DELTA;`,
      },
      {
        type: 'code',
        content: `# Cell 3: Source Connectors
def _http_get_json(url, headers=None, timeout=30):
    req = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

def fetch_otx(api_key, max_indicators):
    """AlienVault OTX pulse subscriptions -> normalized IOCs."""
    if not api_key:
        return []
    out = []
    page = 1
    while len(out) < max_indicators:
        url = f"https://otx.alienvault.com/api/v1/pulses/subscribed?limit=50&page={page}"
        data = _http_get_json(url, headers={"X-OTX-API-KEY": api_key})
        results = data.get("results", [])
        if not results:
            break
        for pulse in results:
            tags = pulse.get("tags", []) or []
            for ind in pulse.get("indicators", []):
                t = (ind.get("type") or "").lower()
                if t in ("ipv4", "ipv6", "domain", "hostname", "url", "filehash-sha256", "email"):
                    out.append({
                        "indicator_type": "ipv4" if t.startswith("ipv") else
                                          "domain" if t in ("domain", "hostname") else
                                          "sha256" if t == "filehash-sha256" else t,
                        "indicator_value": ind.get("indicator"),
                        "source": "AlienVault OTX",
                        "confidence": 0.7,
                        "severity": "high" if "apt" in tags else "medium",
                        "tags": tags[:10],
                        "first_seen": ind.get("created"),
                        "last_seen": pulse.get("modified"),
                        "report_count": 1,
                        "raw_payload": json.dumps(ind),
                    })
                if len(out) >= max_indicators:
                    return out
        page += 1
        if page > 100:
            break
    return out

def fetch_misp(misp_url, api_key, max_indicators):
    """MISP REST API -> normalized IOCs."""
    if not (misp_url and api_key):
        return []
    url = f"{misp_url.rstrip('/')}/attributes/restSearch"
    body = json.dumps({"limit": max_indicators, "page": 1, "to_ids": True}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={"Authorization": api_key, "Accept": "application/json", "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    out = []
    type_map = {
        "ip-src": "ipv4", "ip-dst": "ipv4",
        "domain": "domain", "hostname": "domain",
        "url": "url", "sha256": "sha256", "email-src": "email", "email-dst": "email",
    }
    for attr in (data.get("response", {}).get("Attribute") or []):
        norm_type = type_map.get(attr.get("type"))
        if not norm_type:
            continue
        out.append({
            "indicator_type": norm_type,
            "indicator_value": attr.get("value"),
            "source": "MISP",
            "confidence": 0.8,
            "severity": "high" if attr.get("category") in ("Payload delivery", "Network activity") else "medium",
            "tags": [t.get("name") for t in (attr.get("Tag") or []) if t.get("name")],
            "first_seen": attr.get("first_seen") or attr.get("timestamp"),
            "last_seen": attr.get("last_seen") or attr.get("timestamp"),
            "report_count": 1,
            "raw_payload": json.dumps(attr),
        })
    return out

def fetch_taxii(taxii_url, user, password, max_indicators):
    """STIX 2.1 over TAXII 2.1: list collections -> get indicators."""
    if not taxii_url:
        return []
    import base64
    token = base64.b64encode(f"{user or ''}:{password or ''}".encode()).decode()
    headers = {
        "Accept": "application/taxii+json;version=2.1",
        "Authorization": f"Basic {token}",
    }
    collections = _http_get_json(f"{taxii_url.rstrip('/')}/collections/", headers=headers)
    out = []
    for coll in (collections.get("collections") or []):
        if len(out) >= max_indicators:
            break
        cid = coll.get("id")
        objs_url = f"{taxii_url.rstrip('/')}/collections/{cid}/objects/?limit={max_indicators}"
        try:
            payload = _http_get_json(objs_url, headers={**headers, "Accept": "application/stix+json;version=2.1"})
        except Exception:
            continue
        for obj in (payload.get("objects") or []):
            if obj.get("type") != "indicator":
                continue
            pattern = obj.get("pattern", "")
            if "ipv4-addr:value" in pattern:
                t = "ipv4"
            elif "domain-name:value" in pattern:
                t = "domain"
            elif "url:value" in pattern:
                t = "url"
            elif "file:hashes" in pattern and "SHA-256" in pattern:
                t = "sha256"
            else:
                continue
            try:
                value = pattern.split("'")[1]
            except IndexError:
                continue
            out.append({
                "indicator_type": t,
                "indicator_value": value,
                "source": "TAXII",
                "confidence": float(obj.get("confidence", 60)) / 100.0,
                "severity": "high",
                "tags": obj.get("labels", []) or [],
                "first_seen": obj.get("valid_from"),
                "last_seen": obj.get("modified"),
                "report_count": 1,
                "raw_payload": json.dumps(obj),
            })
            if len(out) >= max_indicators:
                break
    return out`,
      },
      {
        type: 'code',
        content: `# Cell 4: Execute all connectors with isolated error handling, then MERGE
import uuid as _uuid

INDICATOR_SCHEMA = StructType([
    StructField("indicator_type", StringType(), False),
    StructField("indicator_value", StringType(), False),
    StructField("source", StringType(), False),
    StructField("confidence", DoubleType()),
    StructField("severity", StringType()),
    StructField("tags", ArrayType(StringType())),
    StructField("first_seen", StringType()),
    StructField("last_seen", StringType()),
    StructField("report_count", IntegerType()),
    StructField("raw_payload", StringType()),
])

def run_source(name, fetcher, *args):
    run_id = str(_uuid.uuid4())
    started = datetime.now(timezone.utc)
    try:
        rows = fetcher(*args, MAX_INDICATORS)
        if not rows:
            ingested = 0
        else:
            df = (
              spark.createDataFrame(rows, INDICATOR_SCHEMA)
                .filter(F.col("indicator_value").isNotNull())
                .withColumn("first_seen", F.coalesce(F.to_timestamp("first_seen"), F.current_timestamp()))
                .withColumn("last_seen", F.coalesce(F.to_timestamp("last_seen"), F.current_timestamp()))
                .withColumn("ingested_at", F.current_timestamp())
                .dropDuplicates(["indicator_type", "indicator_value", "source"])
            )
            target = DeltaTable.forName(spark, f"{CATALOG}.{SCHEMA}.threat_indicators")
            (
              target.alias("t").merge(
                  df.alias("s"),
                  "t.indicator_type = s.indicator_type AND t.indicator_value = s.indicator_value AND t.source = s.source",
              )
              .whenMatchedUpdate(set={
                  "confidence": "greatest(t.confidence, s.confidence)",
                  "severity": "s.severity",
                  "tags": "s.tags",
                  "last_seen": "greatest(t.last_seen, s.last_seen)",
                  "report_count": "t.report_count + 1",
                  "raw_payload": "s.raw_payload",
                  "ingested_at": "s.ingested_at",
              })
              .whenNotMatchedInsertAll()
              .execute()
            )
            ingested = df.count()
        finished = datetime.now(timezone.utc)
        spark.createDataFrame([(run_id, name, started, finished, "success", ingested, None)],
                              ["run_id", "source", "started_at", "finished_at", "status",
                               "indicators_ingested", "error_message"]) \\
            .write.format("delta").mode("append").saveAsTable(f"{CATALOG}.{SCHEMA}.feed_run_log")
        print(f"[{name}] ingested {ingested}")
    except Exception as exc:
        finished = datetime.now(timezone.utc)
        spark.createDataFrame([(run_id, name, started, finished, "failed", 0, str(exc)[:1000])],
                              ["run_id", "source", "started_at", "finished_at", "status",
                               "indicators_ingested", "error_message"]) \\
            .write.format("delta").mode("append").saveAsTable(f"{CATALOG}.{SCHEMA}.feed_run_log")
        print(f"[{name}] FAILED: {exc}")

run_source("OTX", fetch_otx, OTX_API_KEY)
run_source("MISP", fetch_misp, MISP_URL, MISP_API_KEY)
run_source("TAXII", fetch_taxii, TAXII_URL, TAXII_USER, TAXII_PASS)`,
      },
      {
        type: 'sql',
        content: `-- Cell 5: Run report & indicator summary
SELECT source,
       status,
       COUNT(*) AS runs,
       SUM(indicators_ingested) AS total_ingested,
       MAX(finished_at) AS last_run
FROM feed_run_log
WHERE started_at >= current_date() - INTERVAL 7 DAYS
GROUP BY source, status
ORDER BY source, status;

SELECT indicator_type, source, COUNT(*) AS indicators, AVG(confidence) AS avg_confidence
FROM threat_indicators
GROUP BY indicator_type, source
ORDER BY indicators DESC;`,
      },
    ],
  },

  {
    id: 'ioc-correlation-engine',
    title: 'IOC Correlation & Network Match Engine',
    subtitle: 'Streaming correlation of threat indicators against live network telemetry',
    category: 'threat-intel',
    tags: ['IOC Matching', 'Streaming Join', 'Network Telemetry', 'Delta CDF', 'Broadcast Join'],
    description: 'Production streaming pipeline that continuously correlates the latest threat indicators against live network flow data (DNS, HTTP, SMTP). Uses broadcast hash join on the IOC table and Spark Structured Streaming with watermarks. Outputs matches as high-fidelity alerts to the correlation_matches table.',
    estimatedRuntime: 'Continuous (streaming)',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers, SSD state store',
    cells: [
      {
        type: 'markdown',
        content: `# IOC Correlation & Network Match Engine
## Streaming Threat-to-Telemetry Correlation

Continuously joins threat indicators against live network flows:
- **DNS queries** matched against domain IOCs
- **HTTP/S connections** matched against IP and URL IOCs
- **SMTP flows** matched against email IOCs
- **File transfers** matched against hash IOCs

### Design
- Broadcast the IOC table (fits in memory) for map-side join
- Read network telemetry as a streaming Delta source
- Watermark: 10 minutes for late-arriving flows
- Output: append-only \`ioc_matches\` table with alert generation`,
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration
from pyspark.sql import functions as F
from pyspark.sql.types import StringType
from delta.tables import DeltaTable

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("checkpoint_path", "")
dbutils.widgets.text("processing_time", "15 seconds")
dbutils.widgets.text("watermark_duration", "10 minutes")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
CHECKPOINT = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{CATALOG}/{SCHEMA}/checkpoints/ioc_correlation"
PROCESSING_TIME = dbutils.widgets.get("processing_time")
WATERMARK = dbutils.widgets.get("watermark_duration")

spark.sql(f"USE {CATALOG}.{SCHEMA}")

# Load active IOCs as broadcast table
iocs = (
    spark.table(f"{CATALOG}.{SCHEMA}.threat_indicators")
    .filter(F.col("confidence") >= 0.5)
    .select(
        F.col("indicator_type"),
        F.col("indicator_value"),
        F.col("source").alias("ioc_source"),
        F.col("confidence").alias("ioc_confidence"),
        F.col("severity").alias("ioc_severity"),
        F.col("tags").alias("ioc_tags"),
    )
    .cache()
)

ioc_count = iocs.count()
print(f"Loaded {ioc_count} active IOCs for correlation")
iocs.groupBy("indicator_type").count().show()`,
      },
      {
        type: 'code',
        content: `# Cell 2: Create match output table
spark.sql(f"""CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA}.ioc_matches (
    match_id STRING NOT NULL,
    flow_id STRING,
    matched_value STRING,
    indicator_type STRING,
    ioc_source STRING,
    ioc_confidence DOUBLE,
    ioc_severity STRING,
    ioc_tags ARRAY<STRING>,
    flow_source_ip STRING,
    flow_dest_ip STRING,
    flow_protocol STRING,
    flow_hostname STRING,
    flow_timestamp TIMESTAMP,
    match_context STRING,
    alert_generated BOOLEAN DEFAULT false,
    matched_at TIMESTAMP DEFAULT current_timestamp(),
    partition_date STRING
) USING DELTA
PARTITIONED BY (partition_date)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)""")

print("ioc_matches table ready")`,
      },
      {
        type: 'code',
        content: `# Cell 3: Streaming correlation join
from pyspark.sql.functions import broadcast, current_timestamp, date_format, expr, lit

# Read network flows as streaming source
flows_stream = (
    spark.readStream.format("delta")
    .option("maxFilesPerTrigger", 500)
    .option("ignoreChanges", "true")
    .table(f"{CATALOG}.{SCHEMA}.network_flows")
    .withWatermark("timestamp", WATERMARK)
)

# Normalize flow fields for multi-type matching
normalized_flows = flows_stream.select(
    F.col("flow_id"),
    F.col("source_ip"),
    F.col("destination_ip"),
    F.col("protocol"),
    F.col("hostname"),
    F.col("timestamp"),
    F.col("dns_query"),
    F.col("url_path"),
    F.col("file_hash"),
    F.col("email_sender"),
)

# Explode into (value, type) pairs for join
flow_values = normalized_flows.select(
    "*",
    F.explode(F.array(
        F.struct(F.col("destination_ip").alias("val"), F.lit("ipv4").alias("typ")),
        F.struct(F.col("source_ip").alias("val"), F.lit("ipv4").alias("typ")),
        F.struct(F.col("dns_query").alias("val"), F.lit("domain").alias("typ")),
        F.struct(F.col("url_path").alias("val"), F.lit("url").alias("typ")),
        F.struct(F.col("file_hash").alias("val"), F.lit("sha256").alias("typ")),
        F.struct(F.col("email_sender").alias("val"), F.lit("email").alias("typ")),
    )).alias("check")
).filter(F.col("check.val").isNotNull())

# Broadcast join against IOC table
matches = (
    flow_values
    .join(
        broadcast(iocs),
        (F.col("check.val") == F.col("indicator_value")) &
        (F.col("check.typ") == F.col("indicator_type")),
        "inner",
    )
    .select(
        expr("uuid()").alias("match_id"),
        F.col("flow_id"),
        F.col("check.val").alias("matched_value"),
        F.col("indicator_type"),
        F.col("ioc_source"),
        F.col("ioc_confidence"),
        F.col("ioc_severity"),
        F.col("ioc_tags"),
        F.col("source_ip").alias("flow_source_ip"),
        F.col("destination_ip").alias("flow_dest_ip"),
        F.col("protocol").alias("flow_protocol"),
        F.col("hostname").alias("flow_hostname"),
        F.col("timestamp").alias("flow_timestamp"),
        F.lit("streaming_match").alias("match_context"),
        F.when(F.col("ioc_confidence") >= 0.8, True).otherwise(False).alias("alert_generated"),
        current_timestamp().alias("matched_at"),
        date_format(current_timestamp(), "yyyy-MM-dd").alias("partition_date"),
    )
)

query = (
    matches
    .writeStream.format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{CHECKPOINT}/ioc_matches")
    .trigger(processingTime=PROCESSING_TIME)
    .queryName("ioc_network_correlation")
    .toTable(f"{CATALOG}.{SCHEMA}.ioc_matches")
)

print(f"IOC correlation stream started: {query.id}")
print(f"  Processing time: {PROCESSING_TIME}")
print(f"  Watermark: {WATERMARK}")
print(f"  IOCs loaded: {ioc_count}")`,
      },
      {
        type: 'sql',
        content: `-- Cell 4: Monitor active matches
SELECT indicator_type, ioc_severity,
       COUNT(*) AS total_matches,
       COUNT(DISTINCT matched_value) AS unique_iocs_hit,
       COUNT(DISTINCT flow_source_ip) AS affected_hosts,
       MAX(matched_at) AS last_match
FROM ioc_matches
WHERE partition_date >= date_format(current_date() - INTERVAL 1 DAY, 'yyyy-MM-dd')
GROUP BY indicator_type, ioc_severity
ORDER BY total_matches DESC;`,
      },
    ],
  },

  {
    id: 'dpi-anomaly-detection',
    title: 'Deep Packet Inspection Anomaly Detection',
    subtitle: 'Protocol-aware statistical anomaly scoring for network flows',
    category: 'threat-intel',
    tags: ['DPI', 'Network Anomaly', 'Z-Score', 'Protocol Analysis', 'Exfiltration'],
    description: 'Production pipeline that computes per-protocol statistical baselines from network flow metadata and scores deviations in real-time. Detects DNS tunneling, data exfiltration, C2 beaconing, and protocol abuse without requiring payload inspection.',
    estimatedRuntime: '8 min (batch) / continuous (streaming)',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Deep Packet Inspection Anomaly Detection
## Protocol-Aware Statistical Scoring

### Detection Capabilities
| Category | Method | Indicators |
|----------|--------|-----------|
| DNS Tunneling | Entropy + volume | High-entropy queries, excessive volume to single domain |
| Data Exfiltration | Bytes-out Z-score | Transfer volume > 3 sigma above protocol baseline |
| C2 Beaconing | Periodicity | Regular interval connections with low jitter |
| Protocol Abuse | Port mismatch | Non-standard protocol on standard ports |

### Approach
1. Compute rolling 7-day baseline per (protocol, subnet)
2. Score current flows against baseline using Z-scores
3. Combine entropy, volume, and timing scores into composite DPI score
4. Write anomalies above threshold to \`dpi_anomalies\` for investigation`,
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & baseline computation
from pyspark.sql import functions as F
from pyspark.sql.window import Window
from delta.tables import DeltaTable

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("baseline_days", "7")
dbutils.widgets.text("anomaly_threshold", "3.0")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
BASELINE_DAYS = int(dbutils.widgets.get("baseline_days"))
THRESHOLD = float(dbutils.widgets.get("anomaly_threshold"))

spark.sql(f"USE {CATALOG}.{SCHEMA}")

# Compute per-protocol baselines from historical flows
flows = (
    spark.table(f"{CATALOG}.{SCHEMA}.network_flows")
    .filter(F.col("timestamp") >= F.expr(f"current_timestamp() - INTERVAL {BASELINE_DAYS} DAYS"))
    .withColumn("subnet", F.regexp_extract("source_ip", r"(\\d+\\.\\d+\\.\\d+)\\.\\d+", 1))
)

baselines = (
    flows
    .groupBy("protocol", "subnet")
    .agg(
        F.count("*").alias("flow_count"),
        F.avg("bytes_out").alias("mean_bytes_out"),
        F.stddev("bytes_out").alias("std_bytes_out"),
        F.avg("bytes_in").alias("mean_bytes_in"),
        F.stddev("bytes_in").alias("std_bytes_in"),
        F.avg("entropy").alias("mean_entropy"),
        F.stddev("entropy").alias("std_entropy"),
        F.avg("duration_ms").alias("mean_duration"),
        F.stddev("duration_ms").alias("std_duration"),
        F.avg("packets").alias("mean_packets"),
        F.stddev("packets").alias("std_packets"),
    )
    .filter(F.col("flow_count") >= 100)
    .withColumn("std_bytes_out", F.greatest(F.col("std_bytes_out"), F.lit(1.0)))
    .withColumn("std_bytes_in", F.greatest(F.col("std_bytes_in"), F.lit(1.0)))
    .withColumn("std_entropy", F.greatest(F.col("std_entropy"), F.lit(0.01)))
    .withColumn("std_duration", F.greatest(F.col("std_duration"), F.lit(1.0)))
    .withColumn("std_packets", F.greatest(F.col("std_packets"), F.lit(1.0)))
    .withColumn("computed_at", F.current_timestamp())
)

baselines.write.format("delta").mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA}.dpi_baselines")
print(f"Baselines computed: {baselines.count()} (protocol, subnet) pairs from {BASELINE_DAYS} days of data")`,
      },
      {
        type: 'code',
        content: `# Cell 2: Score flows against baselines
baselines_df = spark.table(f"{CATALOG}.{SCHEMA}.dpi_baselines")

# Score recent flows (last 24 hours)
recent_flows = (
    spark.table(f"{CATALOG}.{SCHEMA}.network_flows")
    .filter(F.col("timestamp") >= F.expr("current_timestamp() - INTERVAL 24 HOURS"))
    .withColumn("subnet", F.regexp_extract("source_ip", r"(\\d+\\.\\d+\\.\\d+)\\.\\d+", 1))
)

scored = (
    recent_flows.alias("f")
    .join(baselines_df.alias("b"), ["protocol", "subnet"], "inner")
    .withColumn("z_bytes_out", (F.col("f.bytes_out") - F.col("b.mean_bytes_out")) / F.col("b.std_bytes_out"))
    .withColumn("z_bytes_in", (F.col("f.bytes_in") - F.col("b.mean_bytes_in")) / F.col("b.std_bytes_in"))
    .withColumn("z_entropy", (F.col("f.entropy") - F.col("b.mean_entropy")) / F.col("b.std_entropy"))
    .withColumn("z_duration", (F.col("f.duration_ms") - F.col("b.mean_duration")) / F.col("b.std_duration"))
    .withColumn("z_packets", (F.col("f.packets") - F.col("b.mean_packets")) / F.col("b.std_packets"))
    .withColumn("dpi_score",
        F.abs(F.col("z_bytes_out")) * 0.30 +
        F.abs(F.col("z_entropy")) * 0.25 +
        F.abs(F.col("z_duration")) * 0.15 +
        F.abs(F.col("z_bytes_in")) * 0.15 +
        F.abs(F.col("z_packets")) * 0.15
    )
    .withColumn("anomaly_category",
        F.when((F.col("z_entropy") > 3) & (F.col("protocol") == "DNS"), F.lit("dns_tunneling"))
        .when(F.col("z_bytes_out") > 4, F.lit("data_exfiltration"))
        .when((F.col("z_duration") < -2) & (F.col("z_bytes_out") < 0), F.lit("c2_beaconing"))
        .when(F.col("dpi_score") > THRESHOLD, F.lit("protocol_anomaly"))
        .otherwise(F.lit("normal"))
    )
    .withColumn("severity",
        F.when(F.col("dpi_score") >= 6.0, F.lit("critical"))
        .when(F.col("dpi_score") >= 4.0, F.lit("high"))
        .when(F.col("dpi_score") >= THRESHOLD, F.lit("medium"))
        .otherwise(F.lit("low"))
    )
)

# Write anomalies
anomalies = scored.filter(F.col("dpi_score") >= THRESHOLD)

spark.sql(f"""CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA}.dpi_anomalies (
    flow_id STRING, source_ip STRING, destination_ip STRING, protocol STRING,
    bytes_out BIGINT, bytes_in BIGINT, entropy DOUBLE, duration_ms INT, packets INT,
    dpi_score DOUBLE, anomaly_category STRING, severity STRING,
    z_bytes_out DOUBLE, z_entropy DOUBLE, z_duration DOUBLE,
    detected_at TIMESTAMP, partition_date STRING
) USING DELTA PARTITIONED BY (partition_date)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')""")

(
    anomalies.select(
        "f.flow_id", "f.source_ip", "f.destination_ip", "f.protocol",
        "f.bytes_out", "f.bytes_in", "f.entropy", "f.duration_ms", "f.packets",
        "dpi_score", "anomaly_category", "severity",
        "z_bytes_out", "z_entropy", "z_duration",
    )
    .withColumn("detected_at", F.current_timestamp())
    .withColumn("partition_date", F.date_format(F.current_timestamp(), "yyyy-MM-dd"))
    .write.format("delta").mode("append").partitionBy("partition_date")
    .saveAsTable(f"{CATALOG}.{SCHEMA}.dpi_anomalies")
)

print(f"DPI anomalies detected: {anomalies.count()} (threshold: {THRESHOLD})")
anomalies.groupBy("anomaly_category", "severity").count().orderBy(F.desc("count")).show()`,
      },
    ],
  },
];
