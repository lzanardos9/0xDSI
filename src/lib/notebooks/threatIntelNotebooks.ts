import { DatabricksNotebook } from '../databricksNotebooks';

export const threatIntelNotebooks: DatabricksNotebook[] = [
  {
    id: 'threat-feed-correlation',
    title: 'Threat Intelligence Feed Correlation',
    subtitle: 'Multi-source threat feed aggregation with confidence-weighted scoring',
    category: 'threat-intel',
    tags: ['Threat Feeds', 'IOC Enrichment', 'STIX/TAXII', 'Confidence Scoring', 'Deduplication'],
    description: 'Aggregates threat intelligence from multiple OSINT and commercial feeds, deduplicates indicators, computes confidence-weighted scores, and correlates with internal security events to identify active threats.',
    estimatedRuntime: '6 min',
    clusterRequirements: 'DBR 14.3 LTS, 2+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Threat Intelligence Feed Correlation Engine
## Multi-Source IOC Aggregation & Confidence Scoring

### Feed Sources
- AlienVault OTX, VirusTotal, AbuseIPDB, MISP, Shodan
- CrowdStrike, Recorded Future, Mandiant
- Internal Honeypot & Sandbox Results

### Confidence Scoring Model
\`\`\`
Final Score = SUM(source_weight * source_confidence * freshness_factor) / SUM(source_weight)
\`\`\`
Where freshness_factor decays exponentially with age`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate Multi-Source Threat Feed Data
from pyspark.sql import functions as F
import json, random, uuid, hashlib
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "threat_intel"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

# Feed sources with reliability weights
feed_sources = {
    "AlienVault OTX": {"weight": 0.7, "avg_confidence": 0.65, "volume": "high"},
    "VirusTotal": {"weight": 0.9, "avg_confidence": 0.85, "volume": "high"},
    "AbuseIPDB": {"weight": 0.75, "avg_confidence": 0.70, "volume": "high"},
    "MISP Community": {"weight": 0.6, "avg_confidence": 0.60, "volume": "medium"},
    "Shodan": {"weight": 0.65, "avg_confidence": 0.55, "volume": "medium"},
    "CrowdStrike": {"weight": 0.95, "avg_confidence": 0.90, "volume": "low"},
    "Recorded Future": {"weight": 0.90, "avg_confidence": 0.85, "volume": "low"},
    "Internal Honeypot": {"weight": 0.80, "avg_confidence": 0.95, "volume": "low"},
    "Sandbox Analysis": {"weight": 0.85, "avg_confidence": 0.90, "volume": "low"},
}

# Generate IOCs across sources with overlapping indicators
all_indicators = []
base_time = datetime.now()

# Create a pool of indicators that may appear across multiple feeds
indicator_pool = []
for _ in range(500):
    itype = random.choice(["ipv4", "domain", "sha256", "url", "email"])
    if itype == "ipv4":
        value = f"{random.randint(1,223)}.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(1,254)}"
    elif itype == "domain":
        value = f"{uuid.uuid4().hex[:8]}.{random.choice(['com','net','xyz','top','ru','cn'])}"
    elif itype == "sha256":
        value = hashlib.sha256(f"sample-{random.randint(1,10000)}".encode()).hexdigest()
    elif itype == "url":
        value = f"https://{uuid.uuid4().hex[:6]}.com/{random.choice(['payload','login','update'])}"
    else:
        value = f"{uuid.uuid4().hex[:6]}@{random.choice(['evil.com','phish.net','malware.org'])}"
    indicator_pool.append({"type": itype, "value": value})

# Each feed reports a subset of indicators
for source_name, source_info in feed_sources.items():
    num_indicators = {"high": 300, "medium": 150, "low": 50}[source_info["volume"]]
    selected = random.sample(indicator_pool, min(num_indicators, len(indicator_pool)))

    for ind in selected:
        confidence = min(1.0, max(0.0, round(random.gauss(source_info["avg_confidence"], 0.15), 3)))
        age_days = random.randint(0, 180)
        freshness = round(max(0.1, 1.0 - (age_days / 365.0)), 3)

        all_indicators.append({
            "indicator_id": str(uuid.uuid4()),
            "source": source_name,
            "source_weight": source_info["weight"],
            "indicator_type": ind["type"],
            "indicator_value": ind["value"],
            "confidence": confidence,
            "freshness_factor": freshness,
            "severity": "critical" if confidence > 0.85 else "high" if confidence > 0.65 else "medium" if confidence > 0.40 else "low",
            "tags": json.dumps(random.sample(["apt", "botnet", "c2", "phishing", "malware", "scanner", "tor", "ransomware"], random.randint(1, 3))),
            "first_seen": base_time - timedelta(days=age_days),
            "last_seen": base_time - timedelta(hours=random.randint(0, 72)),
            "report_count": random.randint(1, 50),
        })

df_raw = spark.createDataFrame(all_indicators)
df_raw.write.mode("overwrite").saveAsTable("raw_threat_feeds")
print(f"Generated {len(all_indicators)} raw threat indicators from {len(feed_sources)} sources")`
      },
      {
        type: 'code',
        content: `# Cell 2: Deduplicate & Compute Weighted Confidence Scores
df = spark.table("raw_threat_feeds")

# Aggregate duplicate indicators across sources
deduped = (
    df.groupBy("indicator_type", "indicator_value")
    .agg(
        F.count("*").alias("source_count"),
        F.collect_set("source").alias("sources"),
        F.sum(F.col("source_weight") * F.col("confidence") * F.col("freshness_factor")).alias("weighted_score_sum"),
        F.sum("source_weight").alias("weight_sum"),
        F.max("confidence").alias("max_confidence"),
        F.max("freshness_factor").alias("max_freshness"),
        F.max("last_seen").alias("last_seen"),
        F.min("first_seen").alias("first_seen"),
        F.sum("report_count").alias("total_reports"),
    )
    .withColumn("final_confidence",
        F.round(F.col("weighted_score_sum") / F.col("weight_sum"), 3))
    .withColumn("multi_source_bonus",
        F.when(F.col("source_count") >= 4, 0.10)
         .when(F.col("source_count") >= 2, 0.05)
         .otherwise(0.0))
    .withColumn("adjusted_confidence",
        F.least(F.col("final_confidence") + F.col("multi_source_bonus"), F.lit(1.0)))
    .withColumn("severity",
        F.when(F.col("adjusted_confidence") > 0.85, "critical")
         .when(F.col("adjusted_confidence") > 0.65, "high")
         .when(F.col("adjusted_confidence") > 0.40, "medium")
         .otherwise("low"))
    .orderBy(F.desc("adjusted_confidence"))
)

deduped.write.mode("overwrite").saveAsTable("enriched_indicators")
print(f"Deduplicated to {deduped.count()} unique indicators from {df.count()} raw entries")

display(deduped.select("indicator_type", "indicator_value", "source_count", "adjusted_confidence", "severity", "sources")
    .limit(20))

# Source contribution analysis
source_stats = (
    df.groupBy("source")
    .agg(
        F.count("*").alias("indicators_reported"),
        F.avg("confidence").alias("avg_confidence"),
        F.countDistinct("indicator_value").alias("unique_indicators"),
    )
    .orderBy(F.desc("indicators_reported"))
)
print("\\n=== Feed Source Statistics ===")
display(source_stats)`
      },
      {
        type: 'code',
        content: `# Cell 3: Internal Event Correlation
from pyspark.sql import functions as F

enriched = spark.table("enriched_indicators")

# Simulate internal network logs to correlate against
import random, uuid
from datetime import datetime, timedelta

internal_logs = []
indicator_values = enriched.select("indicator_value").rdd.flatMap(lambda x: x).collect()

for _ in range(20000):
    # 5% of logs match known threat indicators
    if random.random() < 0.05:
        value = random.choice(indicator_values[:100])
    else:
        value = f"10.0.{random.randint(1,10)}.{random.randint(1,254)}"

    internal_logs.append({
        "log_id": str(uuid.uuid4()),
        "observed_value": value,
        "event_type": random.choice(["dns_query", "http_request", "smtp_connection", "file_download"]),
        "source_host": f"WS-{random.choice(['FIN','HR','ENG'])}-{random.randint(1,50):03d}",
        "timestamp": datetime.now() - timedelta(hours=random.randint(0, 48)),
    })

df_logs = spark.createDataFrame(internal_logs)

# Correlate internal logs with threat indicators
correlated = (
    df_logs.alias("log")
    .join(enriched.alias("intel"),
          F.col("log.observed_value") == F.col("intel.indicator_value"),
          "inner")
    .select(
        "log.log_id", "log.observed_value", "log.event_type", "log.source_host", "log.timestamp",
        "intel.indicator_type", "intel.adjusted_confidence", "intel.severity", "intel.source_count"
    )
)

print(f"=== Threat Intel Matches Found: {correlated.count()} ===")
display(correlated.orderBy(F.desc("adjusted_confidence")).limit(20))

# Summary
match_summary = (
    correlated.groupBy("severity")
    .agg(F.count("*").alias("matches"), F.countDistinct("source_host").alias("affected_hosts"))
    .orderBy("severity")
)
display(match_summary)`
      },
    ],
  },

  {
    id: 'dpi-dlp-engine',
    title: 'Deep Packet Inspection & DLP Engine',
    subtitle: 'Network traffic analysis with protocol anomaly detection and data loss prevention',
    category: 'threat-intel',
    tags: ['DPI', 'DLP', 'Network Analysis', 'Protocol Anomaly', 'Data Classification'],
    description: 'Analyzes network packet metadata for protocol anomalies, tunneling detection, and data loss prevention. Classifies data sensitivity levels in network flows and detects exfiltration attempts through DNS tunneling, HTTP encoding abuse, and encrypted channel misuse.',
    estimatedRuntime: '7 min',
    clusterRequirements: 'DBR 14.3 LTS, 4+ workers',
    cells: [
      {
        type: 'markdown',
        content: `# Deep Packet Inspection & Data Loss Prevention Engine
## Network Traffic Analysis for Security Operations

### Detection Capabilities
- **Protocol Anomaly Detection** - Unusual protocol usage, non-standard ports
- **DNS Tunneling** - High-entropy DNS queries, excessive query volume
- **Data Classification** - Detect sensitive data patterns in flows
- **Encrypted Traffic Analysis** - JA3 fingerprinting, certificate anomalies
- **Exfiltration Detection** - Unusual data volumes, timing patterns`
      },
      {
        type: 'code',
        content: `# Cell 1: Generate Network Traffic Data
from pyspark.sql import functions as F
import json, random, uuid, math
from datetime import datetime, timedelta

catalog = "soc_platform"
schema = "dpi_dlp"
spark.sql(f"CREATE CATALOG IF NOT EXISTS {catalog}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {catalog}.{schema}")
spark.sql(f"USE {catalog}.{schema}")

flows = []
base_time = datetime.now() - timedelta(hours=24)

protocols = {
    "HTTP": {"ports": [80, 8080], "normal_size": 5000},
    "HTTPS": {"ports": [443, 8443], "normal_size": 8000},
    "DNS": {"ports": [53], "normal_size": 200},
    "SSH": {"ports": [22], "normal_size": 1000},
    "SMTP": {"ports": [25, 587], "normal_size": 3000},
    "FTP": {"ports": [21, 20], "normal_size": 10000},
    "SMB": {"ports": [445, 139], "normal_size": 5000},
}

# Normal traffic
for _ in range(15000):
    proto = random.choice(list(protocols.keys()))
    info = protocols[proto]
    flow_bytes = max(64, int(random.gauss(info["normal_size"], info["normal_size"] * 0.5)))

    flows.append({
        "flow_id": str(uuid.uuid4()),
        "source_ip": f"10.0.{random.randint(1,10)}.{random.randint(1,254)}",
        "destination_ip": f"{random.randint(1,223)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}",
        "protocol": proto,
        "source_port": random.randint(1024, 65535),
        "destination_port": random.choice(info["ports"]),
        "bytes_in": flow_bytes,
        "bytes_out": max(64, int(flow_bytes * random.uniform(0.1, 2.0))),
        "packets": max(1, flow_bytes // random.randint(100, 1500)),
        "duration_ms": random.randint(10, 30000),
        "entropy": round(random.uniform(3.0, 5.5), 3),
        "timestamp": base_time + timedelta(seconds=random.randint(0, 86400)),
        "dlp_classification": "none",
        "anomaly_type": "normal",
        "is_anomalous": False,
    })

# Inject anomalies
anomaly_types = [
    {"type": "dns_tunneling", "proto": "DNS", "port": 53, "entropy": (6.5, 7.5), "bytes": (500, 5000)},
    {"type": "data_exfiltration", "proto": "HTTPS", "port": 443, "entropy": (5.0, 6.0), "bytes": (100000, 5000000)},
    {"type": "protocol_abuse", "proto": "HTTP", "port": 80, "entropy": (6.0, 7.0), "bytes": (50000, 500000)},
    {"type": "c2_communication", "proto": "HTTPS", "port": 443, "entropy": (4.0, 5.0), "bytes": (100, 500)},
    {"type": "pii_leakage", "proto": "SMTP", "port": 587, "entropy": (4.5, 5.5), "bytes": (10000, 100000)},
]

for _ in range(500):
    anom = random.choice(anomaly_types)
    ent_lo, ent_hi = anom["entropy"]
    bytes_lo, bytes_hi = anom["bytes"]
    flow_bytes = random.randint(bytes_lo, bytes_hi)

    flows.append({
        "flow_id": str(uuid.uuid4()),
        "source_ip": f"10.0.{random.randint(50,55)}.{random.randint(1,254)}",
        "destination_ip": f"{random.randint(60,220)}.{random.randint(1,255)}.{random.randint(1,255)}.{random.randint(1,254)}",
        "protocol": anom["proto"],
        "source_port": random.randint(1024, 65535),
        "destination_port": anom["port"],
        "bytes_in": random.randint(64, 1000),
        "bytes_out": flow_bytes,
        "packets": max(1, flow_bytes // random.randint(100, 1500)),
        "duration_ms": random.randint(100, 60000),
        "entropy": round(random.uniform(ent_lo, ent_hi), 3),
        "timestamp": base_time + timedelta(seconds=random.randint(0, 86400)),
        "dlp_classification": random.choice(["pii", "credentials", "proprietary", "financial"]) if anom["type"] in ["data_exfiltration", "pii_leakage"] else "none",
        "anomaly_type": anom["type"],
        "is_anomalous": True,
    })

df = spark.createDataFrame(flows)
df.write.mode("overwrite").saveAsTable("network_flows")
print(f"Generated {len(flows)} network flows ({sum(1 for f in flows if f['is_anomalous'])} anomalous)")
display(df.groupBy("anomaly_type").count().orderBy(F.desc("count")))`
      },
      {
        type: 'code',
        content: `# Cell 2: DPI Anomaly Detection & DLP Classification
df = spark.table("network_flows")

# Statistical baseline for each protocol
baselines = (
    df.filter(~F.col("is_anomalous"))
    .groupBy("protocol")
    .agg(
        F.avg("bytes_out").alias("baseline_bytes"),
        F.stddev("bytes_out").alias("std_bytes"),
        F.avg("entropy").alias("baseline_entropy"),
        F.stddev("entropy").alias("std_entropy"),
        F.avg("duration_ms").alias("baseline_duration"),
    )
)

# Score all flows against baselines
scored = (
    df.join(baselines, "protocol")
    .withColumn("bytes_z", F.abs(F.col("bytes_out") - F.col("baseline_bytes")) / F.greatest(F.col("std_bytes"), F.lit(1)))
    .withColumn("entropy_z", F.abs(F.col("entropy") - F.col("baseline_entropy")) / F.greatest(F.col("std_entropy"), F.lit(0.1)))
    .withColumn("dpi_score", F.col("bytes_z") * 0.4 + F.col("entropy_z") * 0.6)
    .withColumn("dpi_verdict",
        F.when(F.col("dpi_score") > 5.0, "critical")
         .when(F.col("dpi_score") > 3.0, "suspicious")
         .when(F.col("dpi_score") > 1.5, "elevated")
         .otherwise("normal"))
)

print("=== Top 20 Suspicious Flows ===")
display(scored.filter(F.col("dpi_verdict").isin(["critical", "suspicious"]))
    .select("flow_id", "source_ip", "destination_ip", "protocol", "bytes_out", "entropy", "dpi_score", "dpi_verdict", "anomaly_type")
    .orderBy(F.desc("dpi_score")).limit(20))

# DLP summary
dlp = df.filter(F.col("dlp_classification") != "none")
print(f"\\n=== DLP Alerts: {dlp.count()} flows with classified data ===")
display(dlp.groupBy("dlp_classification", "protocol").count().orderBy(F.desc("count")))`
      },
    ],
  },

  {
    id: 'threat-feed-live-ingestion',
    title: 'Live Threat Feed Ingestion (TAXII/OTX/MISP)',
    subtitle: 'Real connectors for AlienVault OTX, MISP, and STIX/TAXII 2.1 endpoints',
    category: 'threat-intel',
    tags: ['STIX/TAXII', 'AlienVault OTX', 'MISP', 'Live Ingestion', 'Idempotent MERGE'],
    description: 'Production-grade threat intelligence ingestion. Pulls real IOCs from AlienVault OTX, MISP, and any STIX/TAXII 2.1 collection, normalizes them to a common schema, deduplicates by (type,value), and upserts into Delta via idempotent MERGE. Credentials sourced from Databricks Secret Scope. Designed to run on a schedule (every 15 minutes).',
    estimatedRuntime: '4 min per run',
    clusterRequirements: 'DBR 14.3 LTS, 1+ workers, internet egress allowed',
    cells: [
      {
        type: 'markdown',
        content: `# Live Threat Feed Ingestion

This notebook is the production replacement for mock-data feed generators. It connects to **real** threat intelligence APIs:

| Source | Protocol | Auth |
|---|---|---|
| AlienVault OTX | REST | API key in secret scope |
| MISP | REST | API key in secret scope |
| Any STIX/TAXII 2.1 collection | TAXII 2.1 | Basic auth in secret scope |

### Failure semantics
- Each connector runs in its own try/except. A failure in one source does NOT block others.
- All writes use Delta MERGE on (indicator_type, indicator_value) -> idempotent reruns.
- Run failures are written to \`feed_run_log\` for observability.`,
      },
      {
        type: 'code',
        content: `# Cell 1: Configuration + secret scope
from pyspark.sql import functions as F
from pyspark.sql.types import (
    StructType, StructField, StringType, DoubleType, TimestampType, ArrayType, IntegerType,
)
from delta.tables import DeltaTable
from datetime import datetime, timedelta, timezone
import json
import urllib.request
import urllib.error

dbutils.widgets.text("catalog", "soc_platform")
dbutils.widgets.text("schema", "threat_intel")
dbutils.widgets.text("secret_scope", "soc-platform")
dbutils.widgets.text("max_indicators_per_source", "5000")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")
SECRET_SCOPE = dbutils.widgets.get("secret_scope")
MAX_INDICATORS = int(dbutils.widgets.get("max_indicators_per_source"))

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA}")
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
print(f"  TAXII: {'YES' if TAXII_URL else 'no (skip)'}")`,
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
  report_count INT,
  raw_payload STRING,
  ingested_at TIMESTAMP,
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
  indicators_ingested INT,
  error_message STRING
) USING DELTA;`,
      },
      {
        type: 'code',
        content: `# Cell 3: Connectors
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
                        "tags": tags,
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
            # Naive STIX pattern parsing for the most common cases
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
        content: `# Cell 4: Run all connectors with isolated error handling, then MERGE
import uuid

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
    run_id = str(uuid.uuid4())
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
            .write.format("delta").mode("append").saveAsTable("feed_run_log")
        print(f"[{name}] ingested {ingested}")
    except Exception as exc:
        finished = datetime.now(timezone.utc)
        spark.createDataFrame([(run_id, name, started, finished, "failed", 0, str(exc)[:1000])],
                              ["run_id", "source", "started_at", "finished_at", "status",
                               "indicators_ingested", "error_message"]) \\
            .write.format("delta").mode("append").saveAsTable("feed_run_log")
        print(f"[{name}] FAILED: {exc}")

run_source("OTX", fetch_otx, OTX_API_KEY)
run_source("MISP", fetch_misp, MISP_URL, MISP_API_KEY)
run_source("TAXII", fetch_taxii, TAXII_URL, TAXII_USER, TAXII_PASS)`,
      },
      {
        type: 'sql',
        content: `-- Cell 5: Run report
SELECT source,
       status,
       COUNT(*) AS runs,
       SUM(indicators_ingested) AS total_ingested,
       MAX(finished_at) AS last_run
FROM feed_run_log
WHERE started_at >= current_date() - INTERVAL 7 DAYS
GROUP BY source, status
ORDER BY source, status;

SELECT indicator_type, source, COUNT(*) AS indicators
FROM threat_indicators
GROUP BY indicator_type, source
ORDER BY indicators DESC;`,
      },
    ],
  },
];
