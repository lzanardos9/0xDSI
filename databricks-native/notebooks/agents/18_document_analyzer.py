# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 18 - Document Analyzer
# MAGIC Security Document Analysis Agent using Mosaic AI Agent Framework.
# MAGIC Analyzes PDFs, reports, and threat briefs to extract security-relevant information.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import time
import logging
import re
from datetime import datetime
from typing import Optional
from pyspark.sql import functions as F

# Import agent framework classes
from agent_framework import (
    InteractiveAgent,
    AgentResult,
    AgentStatus,
    UCTool,
    create_soc_tools,
)

logger = logging.getLogger("oxdsi.document_analyzer")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration and IOC Patterns

# COMMAND ----------

IOC_TABLE = cfg.get_table_path("ioc_entries")
ANALYSES_TABLE = cfg.get_table_path("document_analyses")
PENDING_DOCS_TABLE = cfg.get_table_path("pending_documents")

IOC_PATTERNS = {
    "ipv4": r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b",
    "domain": r"\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|ru|cn|xyz|top|tk|info|biz)\b",
    "md5": r"\b[a-fA-F0-9]{32}\b",
    "sha256": r"\b[a-fA-F0-9]{64}\b",
    "email": r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
    "url": r"https?://[^\s<>\"'\)]+",
    "cve": r"CVE-\d{4}-\d{4,7}",
}

SUPPORTED_DOC_TYPES = [
    "threat_brief",
    "vulnerability_advisory",
    "incident_report",
    "policy",
    "audit",
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Document Analyzer Agent Implementation

# COMMAND ----------

class DocumentAnalyzerAgent(InteractiveAgent):
    """
    Security Document Analysis Agent that extracts security-relevant information
    from PDFs, reports, and threat briefs. Extracts IOCs, CVEs, threat actor names,
    TTPs, and recommended mitigations.
    """

    def get_system_prompt(self) -> str:
        """Return the system prompt for the document analyzer."""
        return """You are a document intelligence analyst specializing in extracting
security-relevant information from various document types.

Your role:
1. Analyze security documents for threat intelligence
2. Classify document type (threat_brief, vulnerability_advisory, incident_report, policy, audit)
3. Extract threat actor names, malware families, and attack tools
4. Identify MITRE ATT&CK techniques and tactics used
5. Recommend mitigations and defensive measures

Supported document types: threat_brief, vulnerability_advisory, incident_report, policy, audit

When analyzing documents:
- Extract threat actors and their known TTPs
- Identify malware families and variants
- List recommended mitigations in priority order
- Note the confidence level based on source credibility
- Validate extracted IOCs are in proper format

Always structure output as valid JSON with clear sections."""

    def get_tools(self) -> list[UCTool]:
        """Define document-analyzer-specific tools."""
        tools = create_soc_tools(cfg)

        # Filter to relevant tools
        relevant_tools = [t for t in tools if t.name in [
            "lookup_ioc",
            "search_events",
        ]]
        return relevant_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Agent

# COMMAND ----------

# Initialize MLflow experiment tracking
import mlflow
mlflow.set_experiment(f"/0xDSI/agents/document_analyzer")

# Create agent instance
agent = DocumentAnalyzerAgent(
    agent_name="document_analyzer",
    cfg=cfg,
    llm=llm,
    mon=mon,
    spark=spark,
)

# Register tools
for tool in agent.get_tools():
    agent.register_tool(tool)

mon.log_event("document_analyzer_initialized", {
    "tools_registered": len(agent._tools),
    "supported_doc_types": len(SUPPORTED_DOC_TYPES),
    "ioc_patterns_count": len(IOC_PATTERNS),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Helper Functions

# COMMAND ----------

def extract_iocs_regex(text: str) -> dict:
    """Extract IOCs from text using compiled regex patterns."""
    extracted = {}
    for ioc_type, pattern in IOC_PATTERNS.items():
        try:
            matches = list(set(re.findall(pattern, text, re.IGNORECASE)))
            if matches:
                extracted[ioc_type] = matches
        except Exception as e:
            logger.warning(f"Error extracting {ioc_type}: {e}")

    return extracted


def validate_ioc(ioc_value: str, ioc_type: str) -> bool:
    """Validate IOC format before ingestion."""
    validators = {
        "ipv4": lambda x: all(0 <= int(p) <= 255 for p in x.split(".")),
        "sha256": lambda x: len(x) == 64,
        "md5": lambda x: len(x) == 32,
        "cve": lambda x: x.startswith("CVE-"),
    }
    validator = validators.get(ioc_type)
    return validator(ioc_value) if validator else True

# COMMAND ----------

# MAGIC %md
# MAGIC ## Document Analysis Function

# COMMAND ----------

def analyze_document(document_id: str, content: Optional[str] = None, filename: Optional[str] = None) -> dict:
    """
    Analyze a security document for threat intelligence.

    Args:
        document_id: Unique identifier for the document
        content: Document content text (can be fetched from table if not provided)
        filename: Document filename for context

    Returns:
        Analysis result with extracted IOCs, TTPs, threat actors, etc.
    """
    try:
        # If content not provided, fetch from table
        if not content:
            docs_df = spark.read.table(PENDING_DOCS_TABLE)
            doc_row = docs_df.filter(F.col("document_id") == document_id).first()
            if not doc_row:
                return {"error": f"Document {document_id} not found"}

            content = doc_row.asDict().get("content", "")
            filename = doc_row.asDict().get("filename", "unknown")

        if not content:
            return {"error": "Document has no content"}

        # Step 1: Regex-based IOC extraction
        regex_iocs = extract_iocs_regex(content)
        regex_ioc_count = sum(len(v) for v in regex_iocs.values())

        # Step 2: LLM semantic extraction via agent
        content_preview = content[:5000]  # First 5000 chars for context
        user_prompt = f"""Analyze this security document and extract threat intelligence.

Document ID: {document_id}
Filename: {filename}
Content Preview:
{content_preview}

Return a JSON object with this structure:
{{
  "document_type": "threat_brief|vulnerability_advisory|incident_report|policy|audit",
  "threat_actors": [
    {{"name": "actor name", "aliases": ["alias1", "alias2"]}}
  ],
  "malware_families": [
    {{"name": "malware name", "variants": ["variant1"], "file_types": ["exe", "dll"]}}
  ],
  "tactics_techniques": [
    {{
      "tactic_id": "TA####",
      "tactic_name": "Tactic Name",
      "technique_id": "T####",
      "technique_name": "Technique Name",
      "description": "How it's described in the document"
    }}
  ],
  "indicators_of_compromise": [
    {{"type": "ip|domain|hash|email|url", "value": "...", "context": "where it appears"}}
  ],
  "mitigations": [
    {{"priority": "critical|high|medium|low", "action": "mitigation action"}}
  ],
  "summary": "2-3 sentence summary of the document",
  "confidence": "high|medium|low",
  "source_credibility": "official|research|community|unknown"
}}"""

        response = agent.predict_messages(
            messages=[{"role": "user", "content": user_prompt}],
            params={"temperature": 0.1, "max_tokens": 4096},
        )

        content_response = response.get("content", "")

        # Extract JSON from response
        try:
            if "```json" in content_response:
                json_str = content_response.split("```json")[1].split("```")[0].strip()
            elif "{" in content_response:
                start_idx = content_response.find("{")
                end_idx = content_response.rfind("}") + 1
                json_str = content_response[start_idx:end_idx]
            else:
                json_str = content_response

            semantic_data = json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse analysis JSON: {e}")
            semantic_data = {"error": "JSON parse failed"}

        # Step 3: Validate and merge IOCs
        validated_iocs = []
        for ioc_type, ioc_values in regex_iocs.items():
            for value in ioc_values:
                if validate_ioc(value, ioc_type):
                    validated_iocs.append({
                        "type": ioc_type,
                        "value": value,
                        "source": "regex_extraction",
                    })

        # Add LLM-extracted IOCs if present
        for ioc in semantic_data.get("indicators_of_compromise", []):
            validated_iocs.append({
                "type": ioc.get("type"),
                "value": ioc.get("value"),
                "context": ioc.get("context"),
                "source": "semantic_extraction",
            })

        # Build final analysis result
        analysis_result = {
            "analysis_id": f"ANA-{document_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
            "document_id": document_id,
            "filename": filename or "unknown",
            "document_type": semantic_data.get("document_type", "unknown"),
            "analyzed_at": datetime.utcnow().isoformat(),
            "agent": "document_analyzer",

            # IOC data
            "indicators_of_compromise": validated_iocs,
            "ioc_count": len(validated_iocs),
            "regex_ioc_count": regex_ioc_count,

            # Threat intelligence
            "threat_actors": semantic_data.get("threat_actors", []),
            "malware_families": semantic_data.get("malware_families", []),
            "tactics_techniques": semantic_data.get("tactics_techniques", []),

            # Recommendations
            "mitigations": semantic_data.get("mitigations", []),
            "summary": semantic_data.get("summary", ""),

            # Confidence
            "confidence": semantic_data.get("confidence", "medium"),
            "source_credibility": semantic_data.get("source_credibility", "unknown"),
        }

        mon.log_event("document_analyzed", {
            "document_id": document_id,
            "doc_type": analysis_result.get("document_type"),
            "iocs_extracted": len(validated_iocs),
            "threat_actors": len(semantic_data.get("threat_actors", [])),
        })

        return analysis_result

    except Exception as e:
        error_msg = f"Document analysis failed: {str(e)}"
        mon.log_event("document_analysis_error", {
            "document_id": document_id,
            "error": error_msg,
        })
        logger.error(error_msg)
        return {"error": error_msg}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Interactive Interface

# COMMAND ----------

# For development/testing
if dbutils.widgets.get("document_id"):
    document_id_param = dbutils.widgets.get("document_id")
    content_param = dbutils.widgets.get("content", "")

    print(f"\n{'='*60}")
    print(f"Analyzing document: {document_id_param}")
    print(f"{'='*60}\n")

    start_time = time.time()
    result = analyze_document(document_id_param, content_param or None)
    duration = time.time() - start_time

    if "error" not in result:
        print(f"✓ Analysis completed in {duration:.2f}s")
        print(f"\nDocument Type: {result.get('document_type')}")
        print(f"Confidence: {result.get('confidence')}")

        print(f"\nExtracted Intelligence:")
        print(f"  IOCs: {result.get('ioc_count')}")
        print(f"  Threat Actors: {len(result.get('threat_actors', []))}")
        print(f"  Malware Families: {len(result.get('malware_families', []))}")
        print(f"  Tactics/Techniques: {len(result.get('tactics_techniques', []))}")
        print(f"  Mitigations: {len(result.get('mitigations', []))}")

        print(f"\nSummary: {result.get('summary')}")

        print(f"\nFull Analysis (JSON):")
        print(json.dumps(result, indent=2))
    else:
        print(f"✗ Error: {result.get('error')}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## MLflow Experiment Tracking

# COMMAND ----------

# Log agent metadata to MLflow
with mlflow.start_run(run_name=f"document_analyzer_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "ioc_pattern_types": len(IOC_PATTERNS),
        "supported_document_types": len(SUPPORTED_DOC_TYPES),
    })

    mlflow.log_metrics({
        "tools_registered": len(agent._tools),
        "temperature": 0.1,
    })

    mlflow.log_dict({
        "agent_name": "document_analyzer",
        "description": "Analyzes PDFs, reports, threat briefs for security-relevant info",
        "supported_doc_types": SUPPORTED_DOC_TYPES,
        "ioc_pattern_types": list(IOC_PATTERNS.keys()),
    }, artifact_file="document_analyzer_config.json")

print("Document Analyzer Agent initialized and ready.")
print(f"Registered tools: {[t.name for t in agent._tools]}")
print(f"IOC pattern types: {', '.join(IOC_PATTERNS.keys())}")
print(f"Supported document types: {', '.join(SUPPORTED_DOC_TYPES)}")
