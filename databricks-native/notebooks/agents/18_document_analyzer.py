# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 18 - Document Analysis Agent
# MAGIC Parses uploaded documents (PDFs, DOCX, emails) for IOCs, threat indicators,
# MAGIC and intelligence. Extracts structured data from unstructured threat reports.

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog")
dbutils.widgets.text("schema", "agentic_soc", "Schema")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")
spark.sql(f"USE CATALOG {catalog}")
spark.sql(f"USE SCHEMA {schema}")

# COMMAND ----------

import mlflow.deployments
import json
import re
from datetime import datetime

client = mlflow.deployments.get_deploy_client("databricks")

# COMMAND ----------

# MAGIC %md
# MAGIC ## IOC Pattern Extraction

# COMMAND ----------

IOC_PATTERNS = {
    "ipv4": r'\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b',
    "domain": r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|ru|cn|xyz|top|info|biz)\b',
    "md5": r'\b[a-fA-F0-9]{32}\b',
    "sha256": r'\b[a-fA-F0-9]{64}\b',
    "email": r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b',
    "url": r'https?://[^\s<>"{}|\\^`\[\]]+',
    "cve": r'CVE-\d{4}-\d{4,7}',
}

def extract_iocs(text):
    """Extract all IOC types from text using regex patterns."""
    found_iocs = {}
    for ioc_type, pattern in IOC_PATTERNS.items():
        matches = list(set(re.findall(pattern, text)))
        if matches:
            found_iocs[ioc_type] = matches
    return found_iocs

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Pending Documents

# COMMAND ----------

pending_docs = spark.sql("""
    SELECT id, filename, content_text, uploaded_at, uploaded_by
    FROM document_uploads
    WHERE processed = false
      AND uploaded_at > current_timestamp() - INTERVAL 24 HOURS
    ORDER BY uploaded_at DESC
    LIMIT 10
""").collect()

print(f"Processing {len(pending_docs)} documents")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Analyze Documents

# COMMAND ----------

analysis_results = []

for doc in pending_docs:
    # Extract IOCs via regex
    iocs = extract_iocs(doc.content_text or "")

    # Use Foundation Model for intelligent extraction
    response = client.predict(
        endpoint="databricks-meta-llama-3-1-70b-instruct",
        inputs={
            "messages": [
                {"role": "system", "content": "You are a threat intelligence analyst extracting structured data from security documents. Extract: threat actors, malware families, TTPs, campaign names, target industries, and key findings."},
                {"role": "user", "content": f"""Analyze this document and extract threat intelligence:

Filename: {doc.filename}
Content (first 3000 chars): {(doc.content_text or '')[:3000]}

Extracted IOCs: {json.dumps(iocs)}

Respond as JSON: {{"threat_actors": [...], "malware_families": [...], "ttps": [...], "campaign_name": "...", "target_industries": [...], "key_findings": [...], "severity": "critical|high|medium|low", "confidence": 0-100}}"""}
            ],
            "max_tokens": 600,
            "temperature": 0.2
        }
    )

    try:
        content = response.choices[0].message.content
        analysis = json.loads(content[content.find("{"):content.rfind("}")+1])
    except:
        analysis = {"threat_actors": [], "malware_families": [], "ttps": [], "key_findings": [], "severity": "medium", "confidence": 50}

    analysis_results.append({
        "document_id": doc.id,
        "filename": doc.filename,
        "iocs_extracted": json.dumps(iocs),
        "ioc_count": sum(len(v) for v in iocs.values()),
        "threat_actors": json.dumps(analysis.get("threat_actors", [])),
        "malware_families": json.dumps(analysis.get("malware_families", [])),
        "ttps": json.dumps(analysis.get("ttps", [])),
        "key_findings": json.dumps(analysis.get("key_findings", [])),
        "severity": analysis.get("severity", "medium"),
        "confidence": analysis.get("confidence", 50),
        "analyzed_at": datetime.utcnow().isoformat(),
        "agent_name": "document-analyzer",
    })

    # Auto-ingest extracted IOCs
    for ioc_type, values in iocs.items():
        for value in values[:20]:
            spark.sql(f"""
                INSERT INTO ioc_entries (indicator_type, value, threat_type, source, confidence, created_at)
                VALUES ('{ioc_type}', '{value}', 'document_extraction', '{doc.filename}', 70, current_timestamp())
            """)

    spark.sql(f"UPDATE document_uploads SET processed = true WHERE id = '{doc.id}'")

if analysis_results:
    spark.createDataFrame(analysis_results).write.mode("append").saveAsTable("document_analyses")

print(f"Analyzed {len(analysis_results)} documents, extracted {sum(r['ioc_count'] for r in analysis_results)} IOCs")
