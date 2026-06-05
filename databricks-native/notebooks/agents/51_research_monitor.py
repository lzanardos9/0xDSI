# Databricks notebook source
# MAGIC %md
# MAGIC # Pipeline 51 - Research Cortex: Continuous Paper Monitor
# MAGIC
# MAGIC Scheduled pipeline that runs on a Databricks Workflow (e.g., daily or 6-hourly)
# MAGIC to continuously monitor academic feeds for new cybersecurity research.
# MAGIC
# MAGIC Unlike the full agent (50_research_cortex), this is a lightweight scanner that:
# MAGIC 1. Checks for NEW papers since last scan (incremental)
# MAGIC 2. Performs fast relevance pre-filtering (keyword + venue match)
# MAGIC 3. Queues high-potential papers for full LLM analysis
# MAGIC 4. Updates exposure status by cross-referencing new CVEs with org assets
# MAGIC 5. Generates alerts for critical research findings
# MAGIC
# MAGIC ## Scheduling:
# MAGIC - Recommended: Every 6 hours via Databricks Workflows
# MAGIC - Trigger: `dbutils.widgets.get("trigger")` for manual/event-driven runs

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("research_cortex")

# COMMAND ----------

import json
import time
import hashlib
import re
import urllib.request
import ssl
import uuid
from datetime import datetime, timedelta, timezone
from pyspark.sql.types import *
from pyspark.sql import functions as F

# COMMAND ----------

dbutils.widgets.text("trigger", "scheduled", "Trigger type: scheduled | manual | event")
dbutils.widgets.text("max_papers", "30", "Max papers to scan per source")
dbutils.widgets.text("fast_mode", "true", "Skip LLM analysis, do keyword scoring only")

trigger = dbutils.widgets.get("trigger")
max_papers = int(dbutils.widgets.get("max_papers"))
fast_mode = dbutils.widgets.get("fast_mode").lower() == "true"

mon.log_event("research_monitor_started", {"trigger": trigger, "fast_mode": fast_mode})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Determine Last Scan Watermark

# COMMAND ----------

scan_history_table = get_table_path(cfg, "research_scan_history")
pub_table = get_table_path(cfg, "academic_publications")

try:
    last_scan_row = spark.sql(f"""
        SELECT MAX(created_at) as last_scan
        FROM {scan_history_table}
    """).collect()[0]
    last_scan = last_scan_row.last_scan
    if last_scan is None:
        last_scan = datetime.now(timezone.utc) - timedelta(days=7)
    else:
        last_scan = last_scan.replace(tzinfo=timezone.utc)
except Exception:
    last_scan = datetime.now(timezone.utc) - timedelta(days=7)

hours_since_scan = (datetime.now(timezone.utc) - last_scan).total_seconds() / 3600
mon.log_event("research_monitor_watermark", {
    "last_scan": last_scan.isoformat(),
    "hours_since": round(hours_since_scan, 1),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Keyword-Based Fast Relevance Scoring
# MAGIC Pre-filters papers using keyword matching before expensive LLM calls.

# COMMAND ----------

CRITICAL_KEYWORDS = {
    "zero-day": 0.15, "0-day": 0.15, "exploit": 0.12,
    "ransomware": 0.12, "APT": 0.12, "advanced persistent": 0.10,
    "supply chain": 0.10, "lateral movement": 0.10,
    "command and control": 0.10, "C2": 0.08, "C&C": 0.08,
    "privilege escalation": 0.10, "data exfiltration": 0.10,
}

HIGH_KEYWORDS = {
    "malware": 0.08, "intrusion detection": 0.08, "SIEM": 0.08,
    "threat intelligence": 0.08, "anomaly detection": 0.07,
    "phishing": 0.07, "botnet": 0.07, "DDoS": 0.06,
    "vulnerability": 0.06, "CVE": 0.08, "exploit kit": 0.08,
    "network forensics": 0.06, "memory forensics": 0.06,
    "incident response": 0.06, "YARA": 0.07, "Sigma": 0.07,
    "detection rule": 0.07, "behavioral analysis": 0.06,
}

PLATFORM_KEYWORDS = {
    "machine learning": 0.05, "deep learning": 0.05, "transformer": 0.05,
    "graph neural": 0.06, "federated learning": 0.05, "LLM": 0.06,
    "large language model": 0.06, "reinforcement learning": 0.04,
    "streaming": 0.04, "real-time": 0.04, "distributed": 0.03,
}

VENUE_BONUS = {
    "IEEE S&P": 0.15, "IEEE Symposium on Security": 0.15,
    "USENIX Security": 0.15, "USENIX": 0.10,
    "CCS": 0.12, "ACM CCS": 0.12,
    "NDSS": 0.12, "RAID": 0.10,
    "ACSAC": 0.08, "ESORICS": 0.08,
    "AsiaCCS": 0.07, "Euro S&P": 0.08,
}


def fast_relevance_score(title: str, abstract: str, venue: str) -> float:
    """Compute relevance score using keyword matching (no LLM needed)."""
    text = f"{title} {abstract}".lower()
    score = 0.0

    for kw, weight in CRITICAL_KEYWORDS.items():
        if kw.lower() in text:
            score += weight

    for kw, weight in HIGH_KEYWORDS.items():
        if kw.lower() in text:
            score += weight

    for kw, weight in PLATFORM_KEYWORDS.items():
        if kw.lower() in text:
            score += weight

    for venue_kw, bonus in VENUE_BONUS.items():
        if venue_kw.lower() in venue.lower():
            score += bonus
            break

    return min(score, 1.0)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Incremental arXiv Scanner

# COMMAND ----------

def scan_arxiv_incremental(since: datetime, max_results: int = 30) -> list:
    """Fetch only papers published since the last scan."""
    ctx = ssl.create_default_context()

    search_terms = [
        "cat:cs.CR",
        'all:"intrusion detection"',
        'all:"malware"',
        'all:"threat intelligence"',
        'all:"vulnerability detection"',
        'all:"LLM security"',
    ]
    query = " OR ".join(search_terms)
    url = (
        f"http://export.arxiv.org/api/query?"
        f"search_query={urllib.request.quote(query)}"
        f"&start=0&max_results={max_results}"
        f"&sortBy=submittedDate&sortOrder=descending"
    )

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "0xDSI-ResearchMonitor/1.0"})
        with urllib.request.urlopen(req, context=ctx, timeout=45) as resp:
            xml_data = resp.read().decode("utf-8")
    except Exception as e:
        mon.log_warning(f"arXiv incremental scan failed: {e}")
        return []

    entries = re.findall(r"<entry>(.*?)</entry>", xml_data, re.DOTALL)
    papers = []

    for entry in entries:
        title_m = re.search(r"<title>(.*?)</title>", entry, re.DOTALL)
        abstract_m = re.search(r"<summary>(.*?)</summary>", entry, re.DOTALL)
        published_m = re.search(r"<published>(.*?)</published>", entry)
        id_m = re.search(r"<id>(.*?)</id>", entry)
        authors = re.findall(r"<name>(.*?)</name>", entry)

        if not title_m or not abstract_m or not published_m:
            continue

        published_str = published_m.group(1).strip()[:10]
        try:
            pub_date = datetime.strptime(published_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            if pub_date < since:
                continue
        except ValueError:
            continue

        title = re.sub(r"\s+", " ", title_m.group(1).strip())
        abstract = re.sub(r"\s+", " ", abstract_m.group(1).strip())
        arxiv_url = id_m.group(1).strip() if id_m else ""

        fast_score = fast_relevance_score(title, abstract, "arXiv")
        if fast_score < 0.15:
            continue

        papers.append({
            "title": title,
            "authors": ", ".join(authors[:6]),
            "venue": "arXiv",
            "abstract": abstract[:2000],
            "published_date": published_str,
            "arxiv_id": arxiv_url.split("/abs/")[-1] if "/abs/" in arxiv_url else "",
            "url": arxiv_url,
            "fast_score": fast_score,
        })

    papers.sort(key=lambda p: p["fast_score"], reverse=True)
    mon.log_info(f"arXiv incremental: {len(papers)} relevant papers since {since.date()}")
    return papers

# COMMAND ----------

# MAGIC %md
# MAGIC ## Cross-Reference with Existing Papers

# COMMAND ----------

def get_existing_titles() -> set:
    """Get set of already-ingested paper titles for dedup."""
    try:
        rows = spark.sql(f"SELECT LOWER(title) as title FROM {pub_table}").collect()
        return {row.title for row in rows}
    except Exception:
        return set()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Incremental Scan

# COMMAND ----------

existing_titles = get_existing_titles()
new_papers = scan_arxiv_incremental(last_scan, max_results=max_papers)

# Filter out already-ingested papers
truly_new = [p for p in new_papers if p["title"].lower().strip() not in existing_titles]

mon.log_event("research_monitor_scan_results", {
    "total_found": len(new_papers),
    "truly_new": len(truly_new),
    "already_ingested": len(new_papers) - len(truly_new),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist New Discoveries (Fast Mode)

# COMMAND ----------

if truly_new:
    records = []
    for paper in truly_new:
        records.append({
            "id": str(uuid.uuid4()),
            "title": paper["title"],
            "authors": paper["authors"],
            "venue": paper["venue"],
            "venue_type": "preprint",
            "published_date": paper["published_date"],
            "abstract": paper["abstract"],
            "doi": None,
            "arxiv_id": paper.get("arxiv_id"),
            "url": paper.get("url"),
            "keywords": "[]",
            "category": "pending_analysis",
            "relevance_score": paper["fast_score"],
            "mitre_techniques": "[]",
            "ai_summary": None,
            "ai_key_contributions": None,
            "threat_families": "[]",
            "ingestion_source": "incremental_monitor",
            "ingestion_batch_id": f"monitor_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M')}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    schema = StructType([
        StructField("id", StringType(), False),
        StructField("title", StringType(), False),
        StructField("authors", StringType(), True),
        StructField("venue", StringType(), True),
        StructField("venue_type", StringType(), True),
        StructField("published_date", StringType(), True),
        StructField("abstract", StringType(), True),
        StructField("doi", StringType(), True),
        StructField("arxiv_id", StringType(), True),
        StructField("url", StringType(), True),
        StructField("keywords", StringType(), True),
        StructField("category", StringType(), True),
        StructField("relevance_score", DoubleType(), True),
        StructField("mitre_techniques", StringType(), True),
        StructField("ai_summary", StringType(), True),
        StructField("ai_key_contributions", StringType(), True),
        StructField("threat_families", StringType(), True),
        StructField("ingestion_source", StringType(), True),
        StructField("ingestion_batch_id", StringType(), True),
        StructField("created_at", StringType(), True),
        StructField("updated_at", StringType(), True),
    ])

    df = spark.createDataFrame(records, schema=schema)
    df = df.withColumn("created_at", F.to_timestamp("created_at"))
    df = df.withColumn("updated_at", F.to_timestamp("updated_at"))

    safe_merge(
        spark, df,
        "academic_publications",
        merge_keys=["title"],
        catalog=cfg.catalog, schema=cfg.schema,
    )

    mon.log_info(f"Persisted {len(records)} new papers from incremental scan")

    # Queue high-scoring papers for full LLM analysis on next full run
    high_priority = [p for p in truly_new if p["fast_score"] >= 0.5]
    if high_priority:
        mon.log_event("research_monitor_high_priority", {
            "count": len(high_priority),
            "titles": [p["title"][:80] for p in high_priority[:5]],
        })

# COMMAND ----------

# MAGIC %md
# MAGIC ## Exposure Check: Cross-Reference New Research with Internal Telemetry
# MAGIC Checks if any newly discovered attack techniques are relevant to our environment.

# COMMAND ----------

if truly_new and not fast_mode:
    exposure_alerts = []

    for paper in truly_new:
        text = f"{paper['title']} {paper['abstract']}".lower()

        # Check for CVE mentions
        cves = re.findall(r"CVE-\d{4}-\d{4,7}", paper["abstract"], re.IGNORECASE)
        if cves:
            exposure_alerts.append({
                "paper": paper["title"][:100],
                "type": "cve_reference",
                "detail": f"References {len(cves)} CVEs: {', '.join(cves[:5])}",
                "score": paper["fast_score"],
            })

        # Check for tech stack mentions
        our_stack = ["kubernetes", "aws", "azure", "active directory", "windows server", "linux", "docker", "terraform"]
        matched_stack = [tech for tech in our_stack if tech in text]
        if matched_stack and paper["fast_score"] >= 0.4:
            exposure_alerts.append({
                "paper": paper["title"][:100],
                "type": "stack_match",
                "detail": f"Mentions our stack: {', '.join(matched_stack)}",
                "score": paper["fast_score"],
            })

    if exposure_alerts:
        mon.log_event("research_exposure_alerts", {
            "count": len(exposure_alerts),
            "alerts": exposure_alerts[:10],
        })
        print(f"\n{'='*60}")
        print(f"  EXPOSURE ALERTS: {len(exposure_alerts)} papers match our environment")
        print(f"{'='*60}")
        for alert in exposure_alerts[:5]:
            print(f"  [{alert['type']}] {alert['paper']}")
            print(f"    {alert['detail']}")
            print()

# COMMAND ----------

# MAGIC %md
# MAGIC ## Record Scan in History

# COMMAND ----------

scan_record = [{
    "id": str(uuid.uuid4()),
    "scan_type": "incremental_monitor",
    "source": "arxiv",
    "papers_found": len(new_papers),
    "papers_relevant": len(truly_new),
    "proposals_generated": 0,
    "duration_seconds": round(time.time() - mon._start_time, 2) if hasattr(mon, '_start_time') else 0,
    "errors": None,
    "created_at": datetime.now(timezone.utc).isoformat(),
}]

scan_schema = StructType([
    StructField("id", StringType(), False),
    StructField("scan_type", StringType(), True),
    StructField("source", StringType(), True),
    StructField("papers_found", IntegerType(), True),
    StructField("papers_relevant", IntegerType(), True),
    StructField("proposals_generated", IntegerType(), True),
    StructField("duration_seconds", DoubleType(), True),
    StructField("errors", StringType(), True),
    StructField("created_at", StringType(), True),
])

scan_df = spark.createDataFrame(scan_record, schema=scan_schema)
scan_df = scan_df.withColumn("created_at", F.to_timestamp("created_at"))
safe_append(scan_df, "research_scan_history", cfg.catalog, cfg.schema)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary

# COMMAND ----------

result = {
    "status": "completed",
    "trigger": trigger,
    "fast_mode": fast_mode,
    "papers_scanned": len(new_papers),
    "new_papers_ingested": len(truly_new),
    "hours_since_last_scan": round(hours_since_scan, 1),
    "high_priority_queued": len([p for p in truly_new if p.get("fast_score", 0) >= 0.5]),
}

mon.log_complete(rows_processed=len(truly_new))
print(f"\nResearch Monitor Result:")
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
