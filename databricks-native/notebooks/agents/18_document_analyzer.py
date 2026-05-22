# Databricks notebook source
# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC # Agent 18 - Document Analyzer
# MAGIC Processes uploaded documents from `pending_documents` table. Extracts IOCs
# MAGIC using regex (IPv4, domains, MD5/SHA256, emails, URLs, CVEs) and uses LLM for
# MAGIC semantic extraction (threat actors, malware families, TTPs).
# MAGIC Auto-ingests IOCs into `ioc_entries` and stores analysis in `document_analyses`.

# COMMAND ----------

import json
import re
from datetime import datetime
from pyspark.sql import functions as F
from pyspark.sql.types import StringType, TimestampType

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration and IOC Patterns

# COMMAND ----------

PENDING_DOCS_TABLE = cfg.get_table_path("pending_documents")
IOC_TABLE = cfg.get_table_path("ioc_entries")
ANALYSES_TABLE = cfg.get_table_path("document_analyses")
IOC_PATTERNS = {
    "ipv4": r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b",
    "domain": r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|ru|cn|xyz|top|tk|info|biz)\b",
    "md5": r"\b[a-fA-F0-9]{32}\b",
    "sha256": r"\b[a-fA-F0-9]{64}\b",
    "email": r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
    "url": r"https?://[^\s<>\"'\)]+",
    "cve": r"CVE-\d{4}-\d{4,7}"
}
result = {
    "agent": "18_document_analyzer",
    "run_ts": datetime.utcnow().isoformat(),
    "documents_processed": 0,
    "iocs_extracted": 0,
    "iocs_ingested": 0,
    "errors": []
}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Query Pending Documents

# COMMAND ----------

mon.time("query_pending_docs")
pending_docs_df = spark.read.table(PENDING_DOCS_TABLE)
docs_to_process = (
    pending_docs_df
    .filter(F.col("status") == "pending")
    .filter(F.col("content").isNotNull())
    .orderBy(F.asc("uploaded_at"))
    .limit(20)
)

documents = docs_to_process.collect()
mon.log_event("pending_docs_found", count=len(documents))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Regex-Based IOC Extraction

# COMMAND ----------

def extract_iocs_regex(text):
    """Extract IOCs from text using compiled regex patterns."""
    extracted = {}
    for ioc_type, pattern in IOC_PATTERNS.items():
        matches = list(set(re.findall(pattern, text)))
        if matches:
            extracted[ioc_type] = matches
    return extracted

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Documents

# COMMAND ----------

mon.time("process_documents")
all_ioc_records = []
all_analyses = []
for doc_row in documents:
    doc_id = doc_row["document_id"]
    doc_content = doc_row["content"]
    doc_name = doc_row.get("filename", "unknown")
    doc_source = doc_row.get("source", "upload")

    try:
        # Step 1: Regex IOC extraction
        regex_iocs = extract_iocs_regex(doc_content)
        regex_ioc_count = sum(len(v) for v in regex_iocs.values())

        # Step 2: LLM semantic extraction
        prompt = f"""Analyze this security document and extract threat intelligence.
Document: {doc_name}
Content (first 4000 chars): {doc_content[:4000]}

Return JSON: {{"threat_actors": ["names"], "malware_families": ["names"],
"ttps": [{{"technique_id": "T####", "technique_name": "...", "description": "..."}}],
"summary": "2-3 sentences", "confidence": "high|medium|low",
"document_type": "report|advisory|blog|ioc_list|other"}}"""

        semantic_data = llm.extract_json(prompt)

        # Step 3: Build IOC records for ingestion
        now_ts = datetime.utcnow().isoformat()
        actors_json = json.dumps(semantic_data.get("threat_actors", []))
        confidence = semantic_data.get("confidence", "medium")
        for ioc_type, ioc_values in regex_iocs.items():
            for value in ioc_values:
                all_ioc_records.append({
                    "ioc_id": f"IOC-{doc_id}-{ioc_type}-{abs(hash(value)) % 100000:05d}",
                    "ioc_type": ioc_type, "ioc_value": value,
                    "source_document_id": doc_id, "source_name": doc_name,
                    "threat_actors": actors_json, "confidence": confidence,
                    "extracted_at": now_ts, "status": "active"
                })

        # Step 4: Build analysis record
        all_analyses.append({
            "analysis_id": f"ANA-{doc_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "document_id": doc_id, "filename": doc_name, "source": doc_source,
            "regex_iocs_json": json.dumps(regex_iocs),
            "regex_ioc_count": regex_ioc_count,
            "threat_actors": actors_json,
            "malware_families": json.dumps(semantic_data.get("malware_families", [])),
            "ttps_json": json.dumps(semantic_data.get("ttps", [])),
            "summary": semantic_data.get("summary", ""),
            "document_type": semantic_data.get("document_type", "other"),
            "confidence": confidence, "analyzed_at": now_ts
        })

        result["documents_processed"] += 1
        result["iocs_extracted"] += regex_ioc_count
        mon.log_event("document_analyzed", doc_id=doc_id, iocs=regex_ioc_count)

    except Exception as e:
        error_msg = f"Failed to analyze document {doc_id}: {str(e)}"
        result["errors"].append(error_msg)
        mon.log_event("document_analysis_error", doc_id=doc_id, error=str(e))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Write Results: IOCs and Analyses

# COMMAND ----------

mon.time("write_results")
if all_ioc_records:
    iocs_df = spark.createDataFrame(all_ioc_records)
    iocs_df.write.mode("append").saveAsTable(IOC_TABLE)
    result["iocs_ingested"] = len(all_ioc_records)
    mon.log_event("iocs_ingested", count=len(all_ioc_records))

if all_analyses:
    analyses_df = spark.createDataFrame(all_analyses)
    analyses_df.write.mode("append").saveAsTable(ANALYSES_TABLE)
    mon.log_event("analyses_written", count=len(all_analyses))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Mark Documents as Processed

# COMMAND ----------

mon.time("update_status")
if documents:
    success_ids = [d["document_id"] for d in documents
                   if not any(d["document_id"] in e for e in result["errors"])]
    if success_ids:
        updated_docs = (
            pending_docs_df
            .filter(F.col("document_id").isin(success_ids))
            .withColumn("status", F.lit("processed"))
            .withColumn("processed_at", F.lit(datetime.utcnow().isoformat()))
        )
        updated_docs.write.mode("overwrite").option(
            "replaceWhere",
            "document_id IN (" + ",".join(f"'{x}'" for x in success_ids) + ")"
        ).saveAsTable(PENDING_DOCS_TABLE)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Finalize

# COMMAND ----------

mon.log_complete(
    agent="18_document_analyzer",
    documents_processed=result["documents_processed"],
    iocs_extracted=result["iocs_extracted"],
    iocs_ingested=result["iocs_ingested"],
    errors=len(result["errors"])
)

dbutils.notebook.exit(json.dumps(result))
