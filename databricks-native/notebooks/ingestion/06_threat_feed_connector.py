# Databricks notebook source
# MAGIC %md
# MAGIC # External Threat Intelligence Feed Connector
# MAGIC
# MAGIC Ingests IOCs from: MISP, OTX AlienVault, AbuseIPDB, VirusTotal, STIX/TAXII.
# MAGIC Normalizes all feeds into the unified `ioc_entries` table.

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta
import json
import uuid
import urllib.request
import ssl
import time

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog name")
dbutils.widgets.text("schema", "agentic_soc", "Schema name")
dbutils.widgets.text("feeds", "otx,abuseipdb,misp", "Comma-separated feed list")
dbutils.widgets.text("lookback_days", "7", "Days to look back for new IOCs")
dbutils.widgets.text("max_iocs_per_feed", "5000", "Max IOCs per feed")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
feeds = [f.strip() for f in dbutils.widgets.get("feeds").split(",")]
lookback_days = int(dbutils.widgets.get("lookback_days"))
max_iocs = int(dbutils.widgets.get("max_iocs_per_feed"))

spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"USE SCHEMA `{schema}`")

# COMMAND ----------

SECRET_SCOPE = "0xdsi-soc"

def get_secret(key, default=None):
    try:
        return dbutils.secrets.get(scope=SECRET_SCOPE, key=key)
    except Exception:
        return default

otx_api_key = get_secret("otx-api-key")
abuseipdb_api_key = get_secret("abuseipdb-api-key")
virustotal_api_key = get_secret("virustotal-api-key")
misp_url = get_secret("misp-url")
misp_api_key = get_secret("misp-api-key")

# COMMAND ----------

def http_get(url, headers=None, timeout=30):
    if headers is None:
        headers = {}
    headers["User-Agent"] = "0xDSI-SOC/1.0"
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=headers, method="GET")
            ctx = ssl.create_default_context()
            with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception as e:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def http_post(url, data, headers=None, timeout=30):
    if headers is None:
        headers = {}
    headers["User-Agent"] = "0xDSI-SOC/1.0"
    headers["Content-Type"] = "application/json"
    body = json.dumps(data).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers=headers, method="POST")
    ctx = ssl.create_default_context()
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## OTX AlienVault

# COMMAND ----------

def fetch_otx_iocs():
    if not otx_api_key:
        print("OTX: No API key configured, skipping")
        return []
    since = (datetime.utcnow() - timedelta(days=lookback_days)).strftime("%Y-%m-%dT%H:%M:%S")
    headers = {"X-OTX-API-KEY": otx_api_key}
    iocs = []
    page = 1
    while len(iocs) < max_iocs:
        url = f"https://otx.alienvault.com/api/v1/pulses/subscribed?modified_since={since}&page={page}&limit=50"
        try:
            data = http_get(url, headers=headers)
        except Exception as e:
            print(f"OTX: Error page {page}: {e}")
            break
        pulses = data.get("results", [])
        if not pulses:
            break
        for pulse in pulses:
            pulse_name = pulse.get("name", "Unknown")
            for indicator in pulse.get("indicators", []):
                ioc_type_map = {
                    "IPv4": "ip", "IPv6": "ip", "domain": "domain",
                    "hostname": "domain", "URL": "url",
                    "FileHash-MD5": "hash_md5", "FileHash-SHA1": "hash_sha1",
                    "FileHash-SHA256": "hash_sha256",
                }
                ioc_type = ioc_type_map.get(indicator.get("type"))
                if not ioc_type:
                    continue
                iocs.append({
                    "id": str(uuid.uuid4()),
                    "value": indicator.get("indicator", ""),
                    "type": ioc_type,
                    "threat_type": pulse.get("adversary", "unknown"),
                    "confidence": 0.7,
                    "source_feed": "otx_alienvault",
                    "source_reference": pulse.get("id", ""),
                    "description": f"{pulse_name}: {indicator.get('description', '')}",
                    "tags": json.dumps(pulse.get("tags", [])),
                    "first_seen": indicator.get("created"),
                    "last_seen": indicator.get("content", ""),
                    "expiry": (datetime.utcnow() + timedelta(days=30)).isoformat(),
                    "created_at": datetime.utcnow().isoformat(),
                })
                if len(iocs) >= max_iocs:
                    break
            if len(iocs) >= max_iocs:
                break
        page += 1
    print(f"OTX: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

# MAGIC %md
# MAGIC ## AbuseIPDB

# COMMAND ----------

def fetch_abuseipdb_iocs():
    if not abuseipdb_api_key:
        print("AbuseIPDB: No API key, skipping")
        return []
    headers = {"Key": abuseipdb_api_key, "Accept": "application/json"}
    url = "https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=75&limit=5000"
    try:
        data = http_get(url, headers=headers)
    except Exception as e:
        print(f"AbuseIPDB: Error: {e}")
        return []
    iocs = []
    for entry in data.get("data", [])[:max_iocs]:
        iocs.append({
            "id": str(uuid.uuid4()),
            "value": entry.get("ipAddress", ""),
            "type": "ip",
            "threat_type": "malicious_ip",
            "confidence": entry.get("abuseConfidenceScore", 75) / 100.0,
            "source_feed": "abuseipdb",
            "source_reference": "",
            "description": f"Score: {entry.get('abuseConfidenceScore')}%, Country: {entry.get('countryCode', '?')}",
            "tags": json.dumps(["abuseipdb"]),
            "first_seen": entry.get("lastReportedAt"),
            "last_seen": entry.get("lastReportedAt"),
            "expiry": (datetime.utcnow() + timedelta(days=14)).isoformat(),
            "created_at": datetime.utcnow().isoformat(),
        })
    print(f"AbuseIPDB: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

# MAGIC %md
# MAGIC ## MISP

# COMMAND ----------

def fetch_misp_iocs():
    if not misp_url or not misp_api_key:
        print("MISP: No config, skipping")
        return []
    headers = {"Authorization": misp_api_key, "Accept": "application/json", "Content-Type": "application/json"}
    since_ts = int((datetime.utcnow() - timedelta(days=lookback_days)).timestamp())
    search_payload = {"returnFormat": "json", "timestamp": since_ts, "limit": max_iocs, "enforceWarninglist": True}
    try:
        data = http_post(f"{misp_url}/attributes/restSearch", search_payload, headers=headers)
    except Exception as e:
        print(f"MISP: Error: {e}")
        return []
    type_map = {"ip-src": "ip", "ip-dst": "ip", "domain": "domain", "hostname": "domain",
                "url": "url", "md5": "hash_md5", "sha1": "hash_sha1", "sha256": "hash_sha256"}
    iocs = []
    for attr in data.get("response", {}).get("Attribute", []):
        ioc_type = type_map.get(attr.get("type"))
        if not ioc_type:
            continue
        iocs.append({
            "id": str(uuid.uuid4()),
            "value": attr.get("value", ""),
            "type": ioc_type,
            "threat_type": attr.get("category", "unknown"),
            "confidence": 0.8 if attr.get("to_ids", False) else 0.5,
            "source_feed": "misp",
            "source_reference": attr.get("event_id", ""),
            "description": attr.get("comment", ""),
            "tags": json.dumps([t.get("name", "") for t in attr.get("Tag", [])]),
            "first_seen": attr.get("first_seen"),
            "last_seen": attr.get("last_seen"),
            "expiry": (datetime.utcnow() + timedelta(days=30)).isoformat(),
            "created_at": datetime.utcnow().isoformat(),
        })
    print(f"MISP: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Feed Pulls

# COMMAND ----------

FEED_FUNCTIONS = {"otx": fetch_otx_iocs, "abuseipdb": fetch_abuseipdb_iocs, "misp": fetch_misp_iocs}

all_iocs = []
feed_stats = {}
for feed_name in feeds:
    fetcher = FEED_FUNCTIONS.get(feed_name)
    if not fetcher:
        print(f"Unknown feed: {feed_name}, skipping")
        continue
    try:
        iocs = fetcher()
        all_iocs.extend(iocs)
        feed_stats[feed_name] = len(iocs)
    except Exception as e:
        print(f"Error fetching {feed_name}: {e}")
        feed_stats[feed_name] = 0

print(f"\nTotal IOCs collected: {len(all_iocs)}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deduplicate and Persist via MERGE

# COMMAND ----------

if all_iocs:
    ioc_schema = StructType([
        StructField("id", StringType(), False),
        StructField("value", StringType(), False),
        StructField("type", StringType(), False),
        StructField("threat_type", StringType(), True),
        StructField("confidence", DoubleType(), True),
        StructField("source_feed", StringType(), True),
        StructField("source_reference", StringType(), True),
        StructField("description", StringType(), True),
        StructField("tags", StringType(), True),
        StructField("first_seen", StringType(), True),
        StructField("last_seen", StringType(), True),
        StructField("expiry", StringType(), True),
        StructField("created_at", StringType(), False),
    ])
    new_iocs_df = spark.createDataFrame(all_iocs, schema=ioc_schema)
    new_iocs_df.createOrReplaceTempView("new_iocs")

    spark.sql("""
        MERGE INTO ioc_entries AS target
        USING new_iocs AS source
        ON target.value = source.value AND target.type = source.type
        WHEN MATCHED THEN UPDATE SET
            target.confidence = GREATEST(target.confidence, source.confidence),
            target.last_seen = source.last_seen,
            target.expiry = source.expiry,
            target.tags = source.tags
        WHEN NOT MATCHED THEN INSERT (
            id, value, type, threat_type, confidence, source_feed,
            source_reference, description, tags, first_seen, last_seen, expiry, created_at
        ) VALUES (
            source.id, source.value, source.type, source.threat_type, source.confidence,
            source.source_feed, source.source_reference, source.description, source.tags,
            source.first_seen, source.last_seen, source.expiry, source.created_at
        )
    """)
    print(f"IOC table updated via MERGE")

# COMMAND ----------

# Expire stale IOCs
spark.sql("""
    UPDATE ioc_entries SET active = false
    WHERE expiry IS NOT NULL AND expiry < current_timestamp() AND active = true
""")

# COMMAND ----------

# Update agent status
spark.sql(f"""
    MERGE INTO agent_status AS target
    USING (SELECT
        'threat_feed_connector' as agent_id,
        current_timestamp() as last_heartbeat,
        'running' as status,
        {len(all_iocs)} as events_processed,
        0 as alerts_generated
    ) AS source
    ON target.agent_id = source.agent_id
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
""")

result = {"status": "completed", "feeds_pulled": feeds, "total_iocs": len(all_iocs), "per_feed": feed_stats}
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
