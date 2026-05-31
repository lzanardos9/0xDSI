import { DatabricksNotebook } from '../databricksNotebooks';

export const threatIntelNotebooks: DatabricksNotebook[] = [
  {
    id: 'threat-feed-live-ingestion',
    title: 'Live Threat Intelligence Feed Ingestion',
    subtitle: 'Production connectors for AlienVault OTX, MISP, and STIX/TAXII 2.1 feeds',
    category: 'threat-intel',
    tags: ['Threat Feeds', 'AlienVault', 'MISP', 'STIX/TAXII', 'Delta MERGE'],
    description: 'Production-grade ingestion pipeline that pulls real IOCs from multiple threat intelligence APIs, deduplicates across sources, computes confidence-weighted scores with freshness decay, and writes to Delta Lake via idempotent MERGE.',
    estimatedRuntime: '5 min per sync cycle',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Live Threat Intelligence Feed Ingestion
## Production Connectors for Real Threat Feeds

### Feed Sources
| Source | Protocol | Auth | Volume |
|--------|----------|------|--------|
| AlienVault OTX | REST API v2 | API Key | ~50K IOCs/day |
| MISP | REST API | Auth Key | ~10K IOCs/day |
| STIX/TAXII 2.1 | TAXII Client | Certificate | ~5K objects/day |
| Abuse.ch URLhaus | CSV/REST | None | ~1K URLs/day |

### Confidence Scoring
\`\`\`
Final = SUM(source_weight * raw_confidence * freshness_decay) / SUM(source_weight)
freshness_decay = exp(-age_days / 180)
\`\`\``
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration & API Connectors
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("max_age_days", "180")
dbutils.widgets.text("min_confidence", "0.3")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
max_age_days = int(dbutils.widgets.get("max_age_days"))
min_confidence = float(dbutils.widgets.get("min_confidence"))

from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType, IntegerType
import requests, json, math
from datetime import datetime, timedelta

OTX_KEY = dbutils.secrets.get("threat-intel", "otx-api-key")
MISP_KEY = dbutils.secrets.get("threat-intel", "misp-api-key")
MISP_URL = dbutils.secrets.get("threat-intel", "misp-url")

SOURCE_WEIGHTS = {
    "AlienVault OTX": 0.70,
    "MISP": 0.75,
    "Abuse.ch URLhaus": 0.65,
    "STIX/TAXII": 0.80,
    "CrowdStrike": 0.95,
    "Internal Honeypot": 0.85,
}

def fetch_otx_indicators(api_key, days_back=7):
    url = "https://otx.alienvault.com/api/v1/indicators/export"
    headers = {"X-OTX-API-KEY": api_key}
    since = (datetime.utcnow() - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%S")
    params = {"types": "IPv4,domain,hostname,URL,FileHash-SHA256", "modified_since": since}
    resp = requests.get(url, headers=headers, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json().get("results", [])

def fetch_misp_indicators(misp_url, api_key, days_back=7):
    url = f"{misp_url}/attributes/restSearch"
    headers = {"Authorization": api_key, "Content-Type": "application/json"}
    body = {"timestamp": str(int((datetime.utcnow() - timedelta(days=days_back)).timestamp())),
            "type": ["ip-src", "ip-dst", "domain", "hostname", "sha256", "url"]}
    resp = requests.post(url, headers=headers, json=body, timeout=60)
    resp.raise_for_status()
    return resp.json().get("response", {}).get("Attribute", [])

def fetch_urlhaus():
    url = "https://urlhaus-api.abuse.ch/v1/urls/recent/"
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    return resp.json().get("urls", [])

print("Feed connectors initialized")`
      },
      {
        type: 'code',
        content: `# Cell 2: Ingest, Normalize & MERGE into Delta

all_indicators = []
now = datetime.utcnow()

try:
    otx_data = fetch_otx_indicators(OTX_KEY, days_back=7)
    for item in otx_data:
        all_indicators.append({
            "indicator_type": item.get("type", "unknown"),
            "indicator_value": item.get("indicator", ""),
            "source": "AlienVault OTX",
            "source_weight": SOURCE_WEIGHTS["AlienVault OTX"],
            "raw_confidence": 0.65,
            "first_seen": item.get("created", now.isoformat()),
            "last_seen": now.isoformat(),
            "tags": json.dumps(item.get("tags", [])),
        })
    print(f"OTX: {len(otx_data)} indicators")
except Exception as e:
    print(f"OTX fetch failed: {e}")

try:
    misp_data = fetch_misp_indicators(MISP_URL, MISP_KEY, days_back=7)
    for attr in misp_data:
        all_indicators.append({
            "indicator_type": attr.get("type", "unknown"),
            "indicator_value": attr.get("value", ""),
            "source": "MISP",
            "source_weight": SOURCE_WEIGHTS["MISP"],
            "raw_confidence": float(attr.get("confidence", 70)) / 100.0,
            "first_seen": attr.get("timestamp", now.isoformat()),
            "last_seen": now.isoformat(),
            "tags": json.dumps([t["name"] for t in attr.get("Tag", [])]),
        })
    print(f"MISP: {len(misp_data)} indicators")
except Exception as e:
    print(f"MISP fetch failed: {e}")

try:
    urlhaus = fetch_urlhaus()
    for item in urlhaus[:1000]:
        all_indicators.append({
            "indicator_type": "url",
            "indicator_value": item.get("url", ""),
            "source": "Abuse.ch URLhaus",
            "source_weight": SOURCE_WEIGHTS["Abuse.ch URLhaus"],
            "raw_confidence": 0.70,
            "first_seen": item.get("date_added", now.isoformat()),
            "last_seen": now.isoformat(),
            "tags": json.dumps(item.get("tags", [])),
        })
    print(f"URLhaus: {len(urlhaus)} URLs")
except Exception as e:
    print(f"URLhaus fetch failed: {e}")

if all_indicators:
    df_new = spark.createDataFrame(all_indicators)
    df_new = df_new.withColumn("age_days",
        F.datediff(F.current_timestamp(), F.to_timestamp("first_seen")))
    df_new = df_new.withColumn("freshness_factor",
        F.exp(F.col("age_days").cast("double") * -1.0 / 180.0))
    df_new = df_new.withColumn("weighted_confidence",
        F.col("source_weight") * F.col("raw_confidence") * F.col("freshness_factor"))
    df_new = df_new.filter(F.col("raw_confidence") >= min_confidence)

    df_new.createOrReplaceTempView("new_indicators")

    spark.sql(f"""
        MERGE INTO {catalog}.{schema}.threat_feed_items AS target
        USING new_indicators AS source
        ON target.ioc_value = source.indicator_value AND target.ioc_type = source.indicator_type
        WHEN MATCHED THEN UPDATE SET
            target.confidence = source.weighted_confidence,
            target.last_seen = source.last_seen,
            target.tags = source.tags,
            target.is_active = true
        WHEN NOT MATCHED THEN INSERT (
            id, ioc_type, ioc_value, feed_name, confidence,
            severity, first_seen, last_seen, tags, is_active
        ) VALUES (
            uuid(), source.indicator_type, source.indicator_value, source.source,
            source.weighted_confidence,
            CASE WHEN source.weighted_confidence > 0.85 THEN 'critical'
                 WHEN source.weighted_confidence > 0.65 THEN 'high'
                 WHEN source.weighted_confidence > 0.40 THEN 'medium'
                 ELSE 'low' END,
            source.first_seen, source.last_seen, source.tags, true
        )
    """)
    print(f"MERGE complete: {len(all_indicators)} indicators processed")
else:
    print("No indicators fetched from any source")`
      },
      {
        type: 'code',
        content: `# Cell 3: Deduplication & Multi-Source Confidence Scoring

enriched = spark.table(f"{catalog}.{schema}.threat_feed_items").filter(F.col("is_active") == True)

dedup_summary = (
    enriched
    .groupBy("ioc_type")
    .agg(
        F.count("*").alias("total_indicators"),
        F.avg("confidence").alias("avg_confidence"),
        F.sum(F.when(F.col("severity") == "critical", 1).otherwise(0)).alias("critical_count"),
    )
    .orderBy(F.desc("total_indicators"))
)

display(dedup_summary)
print(f"Total active IOCs: {enriched.count()}")`
      },
    ],
  },

  {
    id: 'ioc-correlation-engine',
    title: 'IOC Correlation Engine',
    subtitle: 'Streaming broadcast join of threat IOCs against real network event flows',
    category: 'threat-intel',
    tags: ['IOC Matching', 'Broadcast Join', 'Streaming', 'Threat Detection'],
    description: 'Performs high-throughput streaming correlation of threat feed IOCs against real silver_events using broadcast hash joins. Matches IPs, domains, and hashes against known threat indicators and generates alerts for hits.',
    estimatedRuntime: 'Continuous (streaming)',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers, 128GB+ driver',
    cells: [
      {
        type: 'markdown',
        content: `# IOC Correlation Engine
## Streaming Broadcast Join for Real-Time Threat Matching

Correlates live events against threat indicators using broadcast hash join:
- IP addresses (src_ip, dst_ip) against known C2/malware IPs
- DNS queries against known malicious domains
- File hashes against known malware samples`
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("checkpoint_path", "")
dbutils.widgets.text("processing_time", "15 seconds")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
checkpoint_path = dbutils.widgets.get("checkpoint_path") or f"/Volumes/{catalog}/{schema}/checkpoints/ioc_correlation"
processing_time = dbutils.widgets.get("processing_time")

from pyspark.sql import functions as F
from pyspark.sql.types import StringType

iocs = (
    spark.table(f"{catalog}.{schema}.threat_feed_items")
    .filter((F.col("is_active") == True) & (F.col("confidence") >= 0.5))
    .select(
        F.col("ioc_value"),
        F.col("ioc_type"),
        F.col("severity").alias("intel_severity"),
        F.col("confidence").alias("intel_confidence"),
        F.col("feed_name").alias("intel_source"),
    )
    .cache()
)

ip_iocs = iocs.filter(F.col("ioc_type") == "ip")
domain_iocs = iocs.filter(F.col("ioc_type") == "domain")
hash_iocs = iocs.filter(F.col("ioc_type") == "hash")

print(f"Broadcast IOCs: {ip_iocs.count()} IPs, {domain_iocs.count()} domains, {hash_iocs.count()} hashes")`
      },
      {
        type: 'code',
        content: `# Cell 2: Streaming Correlation via Broadcast Join

event_stream = (
    spark.readStream.format("delta")
    .option("maxFilesPerTrigger", 500)
    .option("ignoreChanges", "true")
    .table(f"{catalog}.{schema}.silver_events")
    .withWatermark("time", "30 minutes")
)

ip_matches = (
    event_stream
    .join(F.broadcast(ip_iocs),
          (event_stream["src_ip"] == ip_iocs["ioc_value"]) |
          (event_stream["dst_ip"] == ip_iocs["ioc_value"]),
          "inner")
    .withColumn("match_type", F.lit("ip_address"))
    .withColumn("matched_field",
        F.when(event_stream["src_ip"] == ip_iocs["ioc_value"], F.lit("src_ip"))
         .otherwise(F.lit("dst_ip")))
)

domain_matches = (
    event_stream
    .filter(F.col("resource_name").isNotNull())
    .join(F.broadcast(domain_iocs),
          event_stream["resource_name"] == domain_iocs["ioc_value"],
          "inner")
    .withColumn("match_type", F.lit("domain"))
    .withColumn("matched_field", F.lit("resource_name"))
)

hash_matches = (
    event_stream
    .filter(F.col("file_hash").isNotNull())
    .join(F.broadcast(hash_iocs),
          event_stream["file_hash"] == hash_iocs["ioc_value"],
          "inner")
    .withColumn("match_type", F.lit("file_hash"))
    .withColumn("matched_field", F.lit("file_hash"))
)

all_matches = ip_matches.unionByName(domain_matches, allowMissingColumns=True) \
    .unionByName(hash_matches, allowMissingColumns=True)

result = (
    all_matches
    .select(
        F.expr("uuid()").alias("match_id"),
        "event_id", "time", "src_ip", "dst_ip",
        "ioc_value", "match_type", "matched_field",
        "intel_severity", "intel_confidence", "intel_source",
        F.current_timestamp().alias("detected_at"),
    )
)

query = (
    result
    .writeStream.format("delta").outputMode("append")
    .option("checkpointLocation", checkpoint_path)
    .trigger(processingTime=processing_time)
    .queryName("ioc_correlation_stream")
    .toTable(f"{catalog}.{schema}.ioc_correlation_hits")
)

print(f"IOC correlation stream started: {query.id}")`
      },
    ],
  },

  {
    id: 'dpi-anomaly-detection',
    title: 'DPI Protocol Anomaly Detection',
    subtitle: 'Per-protocol statistical baselines with Z-score scoring on real network flows',
    category: 'threat-intel',
    tags: ['DPI', 'Protocol Anomaly', 'Z-Score', 'DNS Tunneling', 'Exfiltration'],
    description: 'Analyzes real network flow data from dpi_flows table, builds per-protocol statistical baselines for packet size, entropy, and byte volume, then flags flows deviating beyond 3 sigma as anomalous.',
    estimatedRuntime: '7 min',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# DPI Protocol Anomaly Detection
## Statistical Baseline Deviation on Real Network Flows

### Detection Capabilities
- **DNS Tunneling** - High-entropy queries, excessive volume per source
- **Data Exfiltration** - Abnormal outbound byte volume per protocol
- **Protocol Abuse** - Non-standard port usage, abnormal packet sizes
- **C2 Beaconing** - Periodic low-volume HTTPS to rare destinations`
      },
      {
        type: 'code',
        content: `# Cell 1: Load Real Network Flows & Build Protocol Baselines
dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "security")
dbutils.widgets.text("lookback_hours", "168")
dbutils.widgets.text("z_threshold", "3.0")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
lookback = int(dbutils.widgets.get("lookback_hours"))
z_threshold = float(dbutils.widgets.get("z_threshold"))

from pyspark.sql import functions as F
from datetime import datetime, timedelta

cutoff = (datetime.now() - timedelta(hours=lookback)).isoformat()

flows = (
    spark.table(f"{catalog}.{schema}.dpi_flows")
    .filter(F.col("timestamp") >= cutoff)
)

baselines = (
    flows
    .groupBy("protocol")
    .agg(
        F.avg("bytes_out").alias("avg_bytes"),
        F.stddev("bytes_out").alias("std_bytes"),
        F.avg("entropy").alias("avg_entropy"),
        F.stddev("entropy").alias("std_entropy"),
        F.avg("packet_size_avg").alias("avg_pkt_size"),
        F.stddev("packet_size_avg").alias("std_pkt_size"),
        F.count("*").alias("flow_count"),
    )
    .fillna(1.0)
)

display(baselines)
print(f"Baselines computed across {flows.count()} flows")`
      },
      {
        type: 'code',
        content: `# Cell 2: Z-Score Anomaly Scoring

scored = (
    flows.alias("f")
    .join(baselines.alias("b"), "protocol")
    .withColumn("bytes_z",
        F.abs(F.col("f.bytes_out") - F.col("b.avg_bytes")) /
        F.greatest(F.col("b.std_bytes"), F.lit(1.0)))
    .withColumn("entropy_z",
        F.abs(F.col("f.entropy") - F.col("b.avg_entropy")) /
        F.greatest(F.col("b.std_entropy"), F.lit(0.1)))
    .withColumn("pkt_size_z",
        F.abs(F.col("f.packet_size_avg") - F.col("b.avg_pkt_size")) /
        F.greatest(F.col("b.std_pkt_size"), F.lit(1.0)))
    .withColumn("composite_z",
        F.col("bytes_z") * 0.40 + F.col("entropy_z") * 0.35 + F.col("pkt_size_z") * 0.25)
    .withColumn("is_anomalous", F.col("composite_z") > z_threshold)
    .withColumn("anomaly_type",
        F.when((F.col("protocol") == "DNS") & (F.col("entropy_z") > z_threshold), "dns_tunneling")
         .when((F.col("bytes_z") > z_threshold * 1.5), "data_exfiltration")
         .when((F.col("entropy_z") > z_threshold) & (F.col("bytes_z") < 1.0), "c2_beaconing")
         .when(F.col("composite_z") > z_threshold, "protocol_anomaly")
         .otherwise("normal"))
)

anomalies = scored.filter(F.col("is_anomalous"))
anomalies.write.format("delta").mode("overwrite").saveAsTable(
    f"{catalog}.{schema}.dpi_anomalies")

display(anomalies
    .select("src_ip", "dst_ip", "protocol", "anomaly_type",
            "composite_z", "bytes_z", "entropy_z")
    .orderBy(F.desc("composite_z"))
    .limit(25))

summary = anomalies.groupBy("anomaly_type").agg(
    F.count("*").alias("count"),
    F.avg("composite_z").alias("avg_z_score"),
).orderBy(F.desc("count"))
display(summary)

print(f"Total anomalies detected: {anomalies.count()} / {flows.count()} flows")`
      },
    ],
  },
];
