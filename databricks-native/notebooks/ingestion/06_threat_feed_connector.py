# Databricks notebook source
# MAGIC %md
# MAGIC # 06: External Threat Intelligence Feed Connector (Production)
# MAGIC
# MAGIC Ingests IOCs from multiple threat intelligence sources:
# MAGIC - OTX AlienVault (pulse subscriptions)
# MAGIC - AbuseIPDB (blacklist and reported IPs)
# MAGIC - VirusTotal (file/URL/domain verdicts)
# MAGIC - MISP (attributes from events)
# MAGIC - STIX/TAXII 2.1 (standards-based feeds)
# MAGIC
# MAGIC Features:
# MAGIC - Per-source rate limiting
# MAGIC - Hash-based deduplication before MERGE
# MAGIC - Feed staleness detection and alerting
# MAGIC - Confidence decay for aged IOCs
# MAGIC - Automatic IOC expiry management
# MAGIC - Comprehensive feed health metrics

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

dbutils.widgets.text("feeds", "", "Comma-separated feed list (empty = read from threat_feeds table)")
dbutils.widgets.text("lookback_days", "7", "Days to look back for new IOCs")
dbutils.widgets.text("max_iocs_per_feed", "5000", "Max IOCs per feed per run")
dbutils.widgets.text("confidence_decay_days", "30", "Days after which confidence starts decaying")
dbutils.widgets.text("expiry_days", "90", "Days until IOC is marked expired")

feeds_override = dbutils.widgets.get("feeds").strip()
lookback_days = int(dbutils.widgets.get("lookback_days"))
max_iocs = int(dbutils.widgets.get("max_iocs_per_feed"))
confidence_decay_days = int(dbutils.widgets.get("confidence_decay_days"))
expiry_days = int(dbutils.widgets.get("expiry_days"))
require_tables("threat_feeds", "ioc_entries")

# Read enabled feeds from the control plane (threat_feeds table in Unity Catalog)
feeds = []
if feeds_override:
    feeds = [f.strip() for f in feeds_override.split(",") if f.strip()]
else:
    try:
        feeds_table = get_table_path(cfg, "threat_feeds")
        enabled_feeds_df = spark.sql(f"""
            SELECT feed_name, feed_source, feed_url, feed_type, sync_interval_hours
            FROM {feeds_table}
            WHERE enabled = true AND auto_sync = true
        """)
        enabled_rows = enabled_feeds_df.collect()
        # Map feed_source to our internal feed function names
        source_map = {
            "otx_alienvault": "otx", "otx": "otx", "alienvault": "otx",
            "abuseipdb": "abuseipdb", "abuse_ipdb": "abuseipdb",
            "virustotal": "virustotal", "virus_total": "virustotal",
            "misp": "misp",
            "taxii": "taxii", "stix_taxii": "taxii",
        }
        for row in enabled_rows:
            mapped = source_map.get(row.feed_source.lower().replace(" ", "_"))
            if mapped and mapped not in feeds:
                feeds.append(mapped)
        mon.log_event("feeds_from_control_plane", {"enabled_feeds": feeds, "total_in_table": len(enabled_rows)})
    except Exception as e:
        # Fallback to defaults if table doesn't exist
        feeds = ["otx", "abuseipdb", "misp", "virustotal"]
        mon.log_event("feeds_fallback", {"reason": str(e)[:200]})

if not feeds:
    feeds = ["otx", "abuseipdb", "misp", "virustotal"]

# COMMAND ----------

from pyspark.sql.functions import *
from pyspark.sql.types import *
from datetime import datetime, timedelta, timezone
import json as json_lib
import urllib.request
import ssl
import hashlib
import time
import uuid

# COMMAND ----------

# MAGIC %md
# MAGIC ## HTTP Client with Rate Limiting

# COMMAND ----------

class RateLimitedHTTPClient:
    """HTTP client with per-source rate limiting and retry logic."""

    def __init__(self, requests_per_minute: int = 30):
        self._min_interval = 60.0 / requests_per_minute
        self._last_request_time = 0.0
        self._ctx = ssl.create_default_context()

    def _wait_for_rate_limit(self):
        elapsed = time.time() - self._last_request_time
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request_time = time.time()

    def get(self, url: str, headers: dict = None, timeout: int = 30, max_retries: int = 3) -> dict:
        """HTTP GET with retry and rate limiting."""
        if headers is None:
            headers = {}
        headers.setdefault("User-Agent", "0xDSI-SOC/2.0 (Threat Intelligence Connector)")

        for attempt in range(max_retries):
            self._wait_for_rate_limit()
            try:
                req = urllib.request.Request(url, headers=headers, method="GET")
                with urllib.request.urlopen(req, context=self._ctx, timeout=timeout) as resp:
                    status = resp.getcode()
                    if status == 429:  # Rate limited
                        retry_after = int(resp.headers.get("Retry-After", 60))
                        mon.log_warning(f"Rate limited on {url}, waiting {retry_after}s")
                        time.sleep(retry_after)
                        continue
                    return json_lib.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < max_retries - 1:
                    time.sleep(2 ** (attempt + 2))
                    continue
                if e.code >= 500 and attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise
            except Exception as e:
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise
        return {}

    def post(self, url: str, data: dict, headers: dict = None, timeout: int = 30) -> dict:
        """HTTP POST with rate limiting."""
        if headers is None:
            headers = {}
        headers.setdefault("User-Agent", "0xDSI-SOC/2.0")
        headers.setdefault("Content-Type", "application/json")

        self._wait_for_rate_limit()
        body = json_lib.dumps(data).encode("utf-8")
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, context=self._ctx, timeout=timeout) as resp:
            return json_lib.loads(resp.read().decode("utf-8"))


http = RateLimitedHTTPClient(requests_per_minute=30)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feed Implementations

# COMMAND ----------

IOC_TYPE_MAP = {
    "IPv4": "ip", "IPv6": "ip", "ip-src": "ip", "ip-dst": "ip",
    "domain": "domain", "hostname": "domain",
    "URL": "url", "url": "url",
    "FileHash-MD5": "hash_md5", "md5": "hash_md5",
    "FileHash-SHA1": "hash_sha1", "sha1": "hash_sha1",
    "FileHash-SHA256": "hash_sha256", "sha256": "hash_sha256",
    "email": "email", "email-src": "email",
}


def make_ioc(value: str, ioc_type: str, confidence: float, source_feed: str,
             threat_type: str = "unknown", description: str = "", tags: list = None,
             source_reference: str = "", first_seen: str = None) -> dict:
    """Create a standardized IOC record."""
    now = datetime.now(timezone.utc)
    return {
        "id": str(uuid.uuid4()),
        "value": value.strip(),
        "type": ioc_type,
        "threat_type": threat_type,
        "confidence": min(max(confidence, 0.0), 1.0),
        "source_feed": source_feed,
        "source_reference": source_reference,
        "description": description[:500] if description else "",
        "tags": json_lib.dumps(tags or []),
        "first_seen": first_seen or now.isoformat(),
        "last_seen": now.isoformat(),
        "expiry": (now + timedelta(days=expiry_days)).isoformat(),
        "created_at": now.isoformat(),
    }

# COMMAND ----------

def fetch_otx_iocs() -> list:
    """Fetch IOCs from OTX AlienVault pulse subscriptions."""
    api_key = secrets_mgr.get_optional("otx_api_key")
    if not api_key:
        mon.log_warning("OTX: No API key configured, skipping")
        return []

    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%dT%H:%M:%S")
    headers = {"X-OTX-API-KEY": api_key}
    iocs = []
    page = 1

    while len(iocs) < max_iocs:
        url = f"https://otx.alienvault.com/api/v1/pulses/subscribed?modified_since={since}&page={page}&limit=50"
        try:
            data = http.get(url, headers=headers)
        except Exception as e:
            mon.log_warning(f"OTX: Error page {page}: {e}")
            break

        pulses = data.get("results", [])
        if not pulses:
            break

        for pulse in pulses:
            pulse_name = pulse.get("name", "Unknown")
            adversary = pulse.get("adversary") or "unknown"
            tags = pulse.get("tags", [])[:10]

            for indicator in pulse.get("indicators", []):
                ioc_type = IOC_TYPE_MAP.get(indicator.get("type"))
                if not ioc_type:
                    continue
                iocs.append(make_ioc(
                    value=indicator.get("indicator", ""),
                    ioc_type=ioc_type,
                    confidence=0.7,
                    source_feed="otx_alienvault",
                    threat_type=adversary,
                    description=f"{pulse_name}: {indicator.get('description', '')}",
                    tags=tags,
                    source_reference=str(pulse.get("id", "")),
                    first_seen=indicator.get("created"),
                ))
                if len(iocs) >= max_iocs:
                    break
            if len(iocs) >= max_iocs:
                break
        page += 1

    mon.log_info(f"OTX: Fetched {len(iocs)} IOCs from {page - 1} pages")
    return iocs

# COMMAND ----------

def fetch_abuseipdb_iocs() -> list:
    """Fetch blacklisted IPs from AbuseIPDB."""
    api_key = secrets_mgr.get_optional("abuseipdb_api_key")
    if not api_key:
        mon.log_warning("AbuseIPDB: No API key, skipping")
        return []

    headers = {"Key": api_key, "Accept": "application/json"}
    url = f"https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=75&limit={min(max_iocs, 10000)}"

    try:
        data = http.get(url, headers=headers)
    except Exception as e:
        mon.log_warning(f"AbuseIPDB: Error: {e}")
        return []

    iocs = []
    for entry in data.get("data", [])[:max_iocs]:
        score = entry.get("abuseConfidenceScore", 75)
        iocs.append(make_ioc(
            value=entry.get("ipAddress", ""),
            ioc_type="ip",
            confidence=score / 100.0,
            source_feed="abuseipdb",
            threat_type="malicious_ip",
            description=f"Abuse score: {score}%, Country: {entry.get('countryCode', '?')}",
            tags=["abuseipdb", f"score_{score}"],
        ))

    mon.log_info(f"AbuseIPDB: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

def fetch_virustotal_iocs() -> list:
    """Fetch recent malicious indicators from VirusTotal."""
    api_key = secrets_mgr.get_optional("virustotal_api_key")
    if not api_key:
        mon.log_warning("VirusTotal: No API key, skipping")
        return []

    headers = {"x-apikey": api_key}
    iocs = []

    # Fetch popular threat indicators (IPs communicating with malware)
    endpoints = [
        ("https://www.virustotal.com/api/v3/ip_addresses/popular_threat_categories", "ip"),
    ]

    # Use VT intelligence search for recent detections
    since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).strftime("%Y-%m-%dT00:00:00")
    search_url = f"https://www.virustotal.com/api/v3/intelligence/search?query=positives:10+ ls:{since}&limit=40"

    try:
        data = http.get(search_url, headers=headers, timeout=60)
        for item in data.get("data", [])[:max_iocs]:
            attrs = item.get("attributes", {})
            item_type = item.get("type", "")

            if item_type == "file":
                sha256 = attrs.get("sha256", "")
                if sha256:
                    positives = attrs.get("last_analysis_stats", {}).get("malicious", 0)
                    total = sum(attrs.get("last_analysis_stats", {}).values()) or 1
                    iocs.append(make_ioc(
                        value=sha256,
                        ioc_type="hash_sha256",
                        confidence=min(positives / total, 1.0),
                        source_feed="virustotal",
                        threat_type=attrs.get("popular_threat_classification", {}).get("suggested_threat_label", "malware"),
                        description=f"VT: {positives}/{total} detections, names: {', '.join(attrs.get('names', [])[:3])}",
                        tags=attrs.get("tags", [])[:5],
                        source_reference=item.get("id", ""),
                    ))
            elif item_type == "domain":
                domain = item.get("id", "")
                if domain:
                    positives = attrs.get("last_analysis_stats", {}).get("malicious", 0)
                    total = sum(attrs.get("last_analysis_stats", {}).values()) or 1
                    iocs.append(make_ioc(
                        value=domain,
                        ioc_type="domain",
                        confidence=min(positives / total, 1.0),
                        source_feed="virustotal",
                        threat_type="malicious_domain",
                        description=f"VT: {positives}/{total} detections",
                        source_reference=domain,
                    ))
    except Exception as e:
        mon.log_warning(f"VirusTotal: Search error: {e}")

    mon.log_info(f"VirusTotal: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

def fetch_misp_iocs() -> list:
    """Fetch attributes from MISP instance."""
    misp_url = secrets_mgr.get_optional("misp_url")
    misp_key = secrets_mgr.get_optional("misp_api_key")
    if not misp_url or not misp_key:
        mon.log_warning("MISP: Not configured, skipping")
        return []

    headers = {"Authorization": misp_key, "Accept": "application/json", "Content-Type": "application/json"}
    since_ts = int((datetime.now(timezone.utc) - timedelta(days=lookback_days)).timestamp())

    search_payload = {
        "returnFormat": "json",
        "timestamp": since_ts,
        "limit": max_iocs,
        "enforceWarninglist": True,
        "to_ids": True,
    }

    try:
        data = http.post(f"{misp_url.rstrip('/')}/attributes/restSearch", search_payload, headers=headers)
    except Exception as e:
        mon.log_warning(f"MISP: Error: {e}")
        return []

    iocs = []
    for attr in data.get("response", {}).get("Attribute", []):
        ioc_type = IOC_TYPE_MAP.get(attr.get("type"))
        if not ioc_type:
            continue

        tags = [t.get("name", "") for t in attr.get("Tag", [])]
        iocs.append(make_ioc(
            value=attr.get("value", ""),
            ioc_type=ioc_type,
            confidence=0.85 if attr.get("to_ids", False) else 0.5,
            source_feed="misp",
            threat_type=attr.get("category", "unknown"),
            description=attr.get("comment", ""),
            tags=tags[:10],
            source_reference=str(attr.get("event_id", "")),
            first_seen=attr.get("first_seen"),
        ))

    mon.log_info(f"MISP: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

def fetch_taxii_iocs() -> list:
    """Fetch IOCs from STIX/TAXII 2.1 server."""
    taxii_url = secrets_mgr.get_optional("taxii_discovery_url")
    if not taxii_url:
        return []

    headers = {"Accept": "application/taxii+json;version=2.1"}
    taxii_user = secrets_mgr.get_optional("taxii_username")
    taxii_pass = secrets_mgr.get_optional("taxii_password")

    if taxii_user and taxii_pass:
        import base64
        creds = base64.b64encode(f"{taxii_user}:{taxii_pass}".encode()).decode()
        headers["Authorization"] = f"Basic {creds}"

    iocs = []
    try:
        # Discovery
        discovery = http.get(taxii_url, headers=headers)
        api_roots = discovery.get("api_roots", [])
        if not api_roots:
            return []

        # Get collections from first API root
        collections_url = f"{api_roots[0]}collections/"
        collections = http.get(collections_url, headers=headers)

        for collection in collections.get("collections", [])[:3]:
            objects_url = f"{api_roots[0]}collections/{collection['id']}/objects/?match[type]=indicator&limit=100"
            objects = http.get(objects_url, headers=headers)

            for obj in objects.get("objects", []):
                if obj.get("type") != "indicator":
                    continue
                pattern = obj.get("pattern", "")
                # Extract value from STIX pattern like [ipv4-addr:value = '1.2.3.4']
                import re
                match = re.search(r"'([^']+)'", pattern)
                if match:
                    value = match.group(1)
                    # Determine type from pattern
                    if "ipv4-addr" in pattern or "ipv6-addr" in pattern:
                        ioc_type = "ip"
                    elif "domain-name" in pattern:
                        ioc_type = "domain"
                    elif "file:hashes" in pattern:
                        ioc_type = "hash_sha256"
                    elif "url" in pattern:
                        ioc_type = "url"
                    else:
                        continue

                    iocs.append(make_ioc(
                        value=value,
                        ioc_type=ioc_type,
                        confidence=float(obj.get("confidence", 70)) / 100.0,
                        source_feed="taxii",
                        threat_type=obj.get("name", "unknown"),
                        description=obj.get("description", ""),
                        source_reference=obj.get("id", ""),
                        first_seen=obj.get("created"),
                    ))

    except Exception as e:
        mon.log_warning(f"TAXII: Error: {e}")

    mon.log_info(f"TAXII: Fetched {len(iocs)} IOCs")
    return iocs

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Feed Collection

# COMMAND ----------

FEED_FUNCTIONS = {
    "otx": fetch_otx_iocs,
    "abuseipdb": fetch_abuseipdb_iocs,
    "virustotal": fetch_virustotal_iocs,
    "misp": fetch_misp_iocs,
    "taxii": fetch_taxii_iocs,
}

all_iocs = []
feed_stats = {}

with mon.time("feed_collection"):
    for feed_name in feeds:
        fetcher = FEED_FUNCTIONS.get(feed_name)
        if not fetcher:
            mon.log_warning(f"Unknown feed: {feed_name}")
            continue
        try:
            with mon.time(f"feed_{feed_name}"):
                iocs = fetcher()
                all_iocs.extend(iocs)
                feed_stats[feed_name] = len(iocs)
        except Exception as e:
            mon.log_error(e, context=f"Feed '{feed_name}' collection failed")
            feed_stats[feed_name] = 0

mon.log_info(f"Total IOCs collected: {len(all_iocs)} from {len(feeds)} feeds")
mon.log_metric("total_iocs_collected", len(all_iocs))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deduplicate Before Persistence
# MAGIC Hash-based dedup: same value + same type = same IOC.

# COMMAND ----------

if all_iocs:
    with mon.time("dedup_and_persist"):
        # Deduplicate by value+type hash
        seen_hashes = set()
        unique_iocs = []
        for ioc in all_iocs:
            key = hashlib.sha256(f"{ioc['value']}:{ioc['type']}".encode()).hexdigest()
            if key not in seen_hashes:
                seen_hashes.add(key)
                unique_iocs.append(ioc)

        dedup_removed = len(all_iocs) - len(unique_iocs)
        if dedup_removed > 0:
            mon.log_info(f"Dedup removed {dedup_removed} duplicate IOCs")

        # Create DataFrame
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

        new_iocs_df = spark.createDataFrame(unique_iocs, schema=ioc_schema)
        new_iocs_df.createOrReplaceTempView("_new_iocs")

        # MERGE: update existing, insert new
        ioc_table = get_table_path(cfg, "ioc_entries")
        spark.sql(f"""
            MERGE INTO {ioc_table} AS target
            USING _new_iocs AS source
            ON target.value = source.value AND target.type = source.type
            WHEN MATCHED THEN UPDATE SET
                target.confidence = GREATEST(target.confidence, source.confidence),
                target.last_seen = source.last_seen,
                target.expiry = source.expiry,
                target.tags = source.tags,
                target.description = source.description
            WHEN NOT MATCHED THEN INSERT (
                id, value, type, threat_type, confidence, source_feed,
                source_reference, description, tags, first_seen, last_seen, expiry, created_at
            ) VALUES (
                source.id, source.value, source.type, source.threat_type, source.confidence,
                source.source_feed, source.source_reference, source.description, source.tags,
                source.first_seen, source.last_seen, source.expiry, source.created_at
            )
        """)

        spark.catalog.dropTempView("_new_iocs")
        mon.log_info(f"MERGE complete: {len(unique_iocs)} IOCs upserted")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Confidence Decay for Aged IOCs

# COMMAND ----------

with mon.time("confidence_decay"):
    ioc_table = get_table_path(cfg, "ioc_entries")

    # Apply confidence decay: reduce by 10% for each period past decay threshold
    decay_result = spark.sql(f"""
        UPDATE {ioc_table}
        SET confidence = GREATEST(confidence * 0.9, 0.1)
        WHERE active = true
        AND last_seen < current_timestamp() - INTERVAL {confidence_decay_days} DAYS
        AND confidence > 0.1
    """)

    # Expire fully stale IOCs
    expire_result = spark.sql(f"""
        UPDATE {ioc_table}
        SET active = false
        WHERE active = true
        AND (
            (expiry IS NOT NULL AND to_timestamp(expiry) < current_timestamp())
            OR last_seen < current_timestamp() - INTERVAL {expiry_days} DAYS
        )
    """)

    # Count expired
    expired_count = spark.sql(f"""
        SELECT COUNT(*) as cnt FROM {ioc_table}
        WHERE active = false
        AND last_seen < current_timestamp() - INTERVAL {expiry_days} DAYS
    """).collect()[0].cnt

    if expired_count > 0:
        mon.log_info(f"IOC lifecycle: {expired_count} IOCs expired")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Feed Health Check

# COMMAND ----------

with mon.time("feed_health"):
    ioc_table = get_table_path(cfg, "ioc_entries")

    # Check feed freshness
    feed_freshness = spark.sql(f"""
        SELECT source_feed,
               COUNT(*) as total_iocs,
               SUM(CASE WHEN active THEN 1 ELSE 0 END) as active_iocs,
               MAX(last_seen) as last_update,
               AVG(confidence) as avg_confidence
        FROM {ioc_table}
        GROUP BY source_feed
    """).collect()

    stale_feeds = []
    for row in feed_freshness:
        mon.log_metric(f"feed_{row.source_feed}_active", row.active_iocs)
        # Alert if feed hasn't been updated in 2x the lookback period
        if row.last_update:
            try:
                last_dt = datetime.fromisoformat(str(row.last_update).replace("Z", "+00:00"))
                staleness_days = (datetime.now(timezone.utc) - last_dt).days
                if staleness_days > lookback_days * 2:
                    stale_feeds.append(f"{row.source_feed} (last update: {staleness_days} days ago)")
            except Exception:
                pass

    if stale_feeds:
        mon.log_warning(
            f"Stale threat feeds detected: {', '.join(stale_feeds)}",
            details="These feeds may have broken API keys or connectivity issues"
        )

# COMMAND ----------

# MAGIC %md
# MAGIC ## Update Agent Status

# COMMAND ----------

agent_status_table = get_table_path(cfg, "agent_status")
try:
    spark.sql(f"""
        MERGE INTO {agent_status_table} AS target
        USING (SELECT
            'threat_feed_connector' as agent_id,
            'Threat Feed Connector' as agent_name,
            current_timestamp() as last_heartbeat,
            'idle' as status,
            {len(all_iocs)} as events_processed,
            0 as alerts_generated
        ) AS source
        ON target.agent_id = source.agent_id
        WHEN MATCHED THEN UPDATE SET
            target.last_heartbeat = source.last_heartbeat,
            target.status = source.status,
            target.events_processed = target.events_processed + source.events_processed
        WHEN NOT MATCHED THEN INSERT *
    """)
except Exception:
    pass  # Non-critical

# COMMAND ----------

mon.log_complete(rows_processed=len(all_iocs))

result = {
    "status": "completed",
    "feeds_pulled": feeds,
    "total_iocs_collected": len(all_iocs),
    "unique_after_dedup": len(unique_iocs) if all_iocs else 0,
    "per_feed": feed_stats,
    "stale_feeds": stale_feeds if stale_feeds else [],
}
print(f"\nThreat Feed Connector Result:")
print(json_lib.dumps(result, indent=2))
dbutils.notebook.exit(json_lib.dumps(result))
