# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 50 - Research Cortex: Academic Intelligence Engine
# MAGIC Mosaic AI Agent Framework InteractiveAgent.
# MAGIC Autonomous intelligence cortex that ingests cutting-edge cybersecurity research from
# MAGIC academic venues (IEEE S&P, USENIX Security, ACM CCS, NDSS, RAID) and synthesizes
# MAGIC actionable capability proposals for the SOC platform.
# MAGIC
# MAGIC ## Capabilities:
# MAGIC - Ingests papers from arXiv, Semantic Scholar, and publisher APIs
# MAGIC - LLM-driven relevance scoring against organizational threat model
# MAGIC - MITRE ATT&CK technique extraction from paper content
# MAGIC - Automated capability proposal generation (detection rules, agents, ML models)
# MAGIC - Research frontier monitoring with trend detection
# MAGIC
# MAGIC ## Delta Tables:
# MAGIC - `academic_publications` - Ingested papers with metadata and AI analysis
# MAGIC - `research_capability_proposals` - Generated proposals from papers
# MAGIC - `research_scan_history` - Audit trail of scan runs

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
from typing import Optional
from pyspark.sql.types import *
from pyspark.sql import functions as F

from agent_framework import BatchAgent, AgentResult, AgentStatus, UCTool

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("max_papers_per_source", "50", "Max papers to fetch per source")
dbutils.widgets.text("relevance_threshold", "0.6", "Minimum relevance score to keep")
dbutils.widgets.text("generate_proposals", "true", "Generate capability proposals from papers")
dbutils.widgets.text("lookback_days", "30", "Days to look back for new papers")

MAX_PAPERS = int(dbutils.widgets.get("max_papers_per_source"))
RELEVANCE_THRESHOLD = float(dbutils.widgets.get("relevance_threshold"))
GENERATE_PROPOSALS = dbutils.widgets.get("generate_proposals").lower() == "true"
LOOKBACK_DAYS = int(dbutils.widgets.get("lookback_days"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table Schema Initialization

# COMMAND ----------

ensure_table_exists(
    spark, "academic_publications",
    schema_ddl="""
        id STRING NOT NULL,
        title STRING NOT NULL,
        authors STRING,
        venue STRING,
        venue_type STRING,
        published_date STRING,
        abstract STRING,
        doi STRING,
        arxiv_id STRING,
        url STRING,
        keywords STRING,
        category STRING,
        relevance_score DOUBLE,
        mitre_techniques STRING,
        ai_summary STRING,
        ai_key_contributions STRING,
        threat_families STRING,
        ingestion_source STRING,
        ingestion_batch_id STRING,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    """,
    catalog=cfg.catalog, schema=cfg.schema,
    comment="Academic cybersecurity publications ingested by Research Cortex agent"
)

ensure_table_exists(
    spark, "research_capability_proposals",
    schema_ddl="""
        id STRING NOT NULL,
        publication_id STRING NOT NULL,
        title STRING NOT NULL,
        proposal_type STRING,
        description STRING,
        status STRING DEFAULT 'draft',
        priority STRING DEFAULT 'medium',
        mitre_coverage STRING,
        architecture_layer STRING,
        integration_points STRING,
        compute_requirements STRING,
        estimated_effort STRING,
        dependencies STRING,
        generated_by STRING,
        approved_by STRING,
        created_at TIMESTAMP,
        updated_at TIMESTAMP
    """,
    catalog=cfg.catalog, schema=cfg.schema,
    comment="AI-generated capability proposals derived from academic research"
)

ensure_table_exists(
    spark, "research_scan_history",
    schema_ddl="""
        id STRING NOT NULL,
        scan_type STRING,
        source STRING,
        papers_found INT,
        papers_relevant INT,
        proposals_generated INT,
        duration_seconds DOUBLE,
        errors STRING,
        created_at TIMESTAMP
    """,
    catalog=cfg.catalog, schema=cfg.schema,
    comment="Audit trail for Research Cortex scan runs"
)

# COMMAND ----------

# MAGIC %md
# MAGIC ## HTTP Client

# COMMAND ----------

class ResearchHTTPClient:
    """Rate-limited HTTP client for academic APIs."""

    def __init__(self, requests_per_minute: int = 20):
        self._min_interval = 60.0 / requests_per_minute
        self._last_request = 0.0
        self._ctx = ssl.create_default_context()

    def _throttle(self):
        elapsed = time.time() - self._last_request
        if elapsed < self._min_interval:
            time.sleep(self._min_interval - elapsed)
        self._last_request = time.time()

    def get(self, url: str, headers: dict = None, timeout: int = 30) -> dict:
        if headers is None:
            headers = {}
        headers.setdefault("User-Agent", "0xDSI-ResearchCortex/1.0 (Academic Paper Ingestion)")

        self._throttle()
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, context=self._ctx, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def get_xml(self, url: str, headers: dict = None, timeout: int = 30) -> str:
        if headers is None:
            headers = {}
        headers.setdefault("User-Agent", "0xDSI-ResearchCortex/1.0")

        self._throttle()
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, context=self._ctx, timeout=timeout) as resp:
            return resp.read().decode("utf-8")


http_client = ResearchHTTPClient(requests_per_minute=20)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source: arXiv (cs.CR - Cryptography and Security)

# COMMAND ----------

ARXIV_CATEGORIES = ["cs.CR", "cs.AI", "cs.LG"]
ARXIV_KEYWORDS = [
    "malware detection", "intrusion detection", "threat intelligence",
    "vulnerability", "exploit", "ransomware", "phishing", "adversarial",
    "network security", "zero-day", "APT", "attack graph",
    "anomaly detection", "SIEM", "SOC", "incident response",
    "federated learning security", "LLM security", "prompt injection",
    "supply chain attack", "lateral movement", "command and control",
    "insider threat", "UEBA", "behavioral analysis",
]


def fetch_arxiv_papers(max_results: int = MAX_PAPERS) -> list:
    """Fetch recent cybersecurity papers from arXiv API."""
    papers = []
    query_terms = " OR ".join([f'all:"{kw}"' for kw in ARXIV_KEYWORDS[:8]])
    cat_filter = " OR ".join([f"cat:{c}" for c in ARXIV_CATEGORIES])
    query = f"({query_terms}) AND ({cat_filter})"

    url = (
        f"http://export.arxiv.org/api/query?"
        f"search_query={urllib.request.quote(query)}"
        f"&start=0&max_results={max_results}"
        f"&sortBy=submittedDate&sortOrder=descending"
    )

    try:
        xml_data = http_client.get_xml(url, timeout=60)
    except Exception as e:
        mon.log_warning(f"arXiv fetch failed: {e}")
        return []

    entries = re.findall(r"<entry>(.*?)</entry>", xml_data, re.DOTALL)
    for entry in entries:
        title_match = re.search(r"<title>(.*?)</title>", entry, re.DOTALL)
        abstract_match = re.search(r"<summary>(.*?)</summary>", entry, re.DOTALL)
        id_match = re.search(r"<id>(.*?)</id>", entry)
        published_match = re.search(r"<published>(.*?)</published>", entry)

        authors = re.findall(r"<name>(.*?)</name>", entry)
        categories = re.findall(r'<category[^>]*term="([^"]*)"', entry)

        if not title_match or not abstract_match:
            continue

        title = re.sub(r"\s+", " ", title_match.group(1).strip())
        abstract = re.sub(r"\s+", " ", abstract_match.group(1).strip())
        arxiv_url = id_match.group(1).strip() if id_match else ""
        arxiv_id = arxiv_url.split("/abs/")[-1] if "/abs/" in arxiv_url else ""
        published = published_match.group(1).strip()[:10] if published_match else ""

        # Filter by recency
        if published:
            try:
                pub_date = datetime.strptime(published, "%Y-%m-%d")
                if pub_date < datetime.now() - timedelta(days=LOOKBACK_DAYS):
                    continue
            except ValueError:
                pass

        papers.append({
            "title": title,
            "authors": ", ".join(authors[:8]),
            "venue": "arXiv",
            "venue_type": "preprint",
            "published_date": published,
            "abstract": abstract[:2000],
            "doi": None,
            "arxiv_id": arxiv_id,
            "url": arxiv_url,
            "keywords": json.dumps(categories[:10]),
            "category": "cs.CR" if "cs.CR" in categories else categories[0] if categories else "cs.CR",
            "ingestion_source": "arxiv_api",
        })

    mon.log_info(f"arXiv: Found {len(papers)} papers matching security criteria")
    return papers

# COMMAND ----------

# MAGIC %md
# MAGIC ## Source: Semantic Scholar (Conference Papers)

# COMMAND ----------

SECURITY_VENUES = [
    "IEEE Symposium on Security and Privacy",
    "USENIX Security Symposium",
    "ACM Conference on Computer and Communications Security",
    "Network and Distributed System Security Symposium",
    "International Symposium on Research in Attacks, Intrusions and Defenses",
    "Annual Computer Security Applications Conference",
    "European Symposium on Research in Computer Security",
    "ACM Asia Conference on Computer and Communications Security",
    "IEEE European Symposium on Security and Privacy",
]


def fetch_semantic_scholar_papers(max_results: int = MAX_PAPERS) -> list:
    """Fetch papers from Semantic Scholar API for top security venues."""
    papers = []
    api_key = secrets_mgr.get_optional("semantic_scholar_api_key")
    headers = {}
    if api_key:
        headers["x-api-key"] = api_key

    search_queries = [
        "malware detection machine learning",
        "intrusion detection deep learning",
        "threat intelligence automation",
        "LLM security vulnerability",
        "ransomware analysis defense",
        "zero-day exploit detection",
        "network anomaly detection",
        "APT advanced persistent threat",
    ]

    for query in search_queries[:4]:
        url = (
            f"https://api.semanticscholar.org/graph/v1/paper/search"
            f"?query={urllib.request.quote(query)}"
            f"&fields=title,authors,venue,year,abstract,externalIds,publicationDate,fieldsOfStudy"
            f"&limit={max_results // 4}"
            f"&year={datetime.now().year - 1}-{datetime.now().year}"
        )

        try:
            data = http_client.get(url, headers=headers, timeout=30)
        except Exception as e:
            mon.log_warning(f"Semantic Scholar query '{query}' failed: {e}")
            continue

        for paper in data.get("data", []):
            if not paper.get("abstract"):
                continue

            external_ids = paper.get("externalIds", {}) or {}
            author_names = [a.get("name", "") for a in (paper.get("authors") or [])[:8]]
            venue = paper.get("venue", "") or ""

            venue_type = "conference"
            if any(sv.lower() in venue.lower() for sv in SECURITY_VENUES):
                venue_type = "top_conference"
            elif "journal" in venue.lower() or "transactions" in venue.lower():
                venue_type = "journal"

            papers.append({
                "title": paper.get("title", "")[:500],
                "authors": ", ".join(author_names),
                "venue": venue[:200] if venue else "Unknown",
                "venue_type": venue_type,
                "published_date": paper.get("publicationDate", ""),
                "abstract": paper.get("abstract", "")[:2000],
                "doi": external_ids.get("DOI"),
                "arxiv_id": external_ids.get("ArXiv"),
                "url": f"https://api.semanticscholar.org/paper/{paper.get('paperId', '')}",
                "keywords": json.dumps(paper.get("fieldsOfStudy", [])[:10]),
                "category": "security",
                "ingestion_source": "semantic_scholar",
            })

    mon.log_info(f"Semantic Scholar: Found {len(papers)} papers")
    return papers

# COMMAND ----------

# MAGIC %md
# MAGIC ## LLM Analysis Pipeline

# COMMAND ----------

RELEVANCE_SYSTEM_PROMPT = """You are a cybersecurity research analyst for a SOC platform built on Databricks Lakehouse.
Analyze the given academic paper and assess its relevance to building advanced security detection and response capabilities.

Your organization operates:
- Databricks Lakehouse with medallion architecture (Bronze/Silver/Gold)
- Mosaic AI Agent Framework for SOC automation
- MITRE ATT&CK-aligned detection engineering
- ML-based threat detection and UEBA
- Real-time streaming ingestion from diverse security telemetry

Score relevance 0.0-1.0 based on:
- Direct applicability to detection engineering (0.3 weight)
- Novel ML/AI techniques applicable to security (0.25 weight)
- Threat intelligence advancement (0.2 weight)
- Feasibility on Databricks platform (0.15 weight)
- Recency and novelty of approach (0.1 weight)

Return ONLY valid JSON:
{
    "relevance_score": <float 0-1>,
    "category": "<one of: detection_engineering, threat_intelligence, ml_security, vulnerability_research, incident_response, privacy_security, adversarial_ml, network_security>",
    "mitre_techniques": ["<T-codes if applicable>"],
    "key_contributions": "<2-3 sentence summary of novel contributions>",
    "threat_families": ["<relevant threat families if any>"],
    "ai_summary": "<4-5 sentence executive summary for SOC engineers>",
    "applicable_to": ["<detection_rule|agent|ml_model|pipeline|correlation_engine|threat_feed>"]
}"""


def analyze_paper_relevance(paper: dict) -> dict:
    """Use LLM to score paper relevance and extract structured metadata."""
    user_prompt = f"""Paper Title: {paper['title']}
Authors: {paper['authors']}
Venue: {paper['venue']} ({paper['venue_type']})
Published: {paper['published_date']}

Abstract:
{paper['abstract'][:1500]}"""

    try:
        response = llm.chat(
            system=RELEVANCE_SYSTEM_PROMPT,
            user=user_prompt,
            temperature=0.1,
            json_mode=True,
            max_tokens=1024,
        )
        result = llm.extract_json(response)
        if result:
            return result
    except Exception as e:
        mon.log_warning(f"LLM analysis failed for '{paper['title'][:50]}': {e}")

    return {"relevance_score": 0.5, "category": "unknown", "mitre_techniques": [], "key_contributions": "", "ai_summary": "", "threat_families": [], "applicable_to": []}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Capability Proposal Generator

# COMMAND ----------

PROPOSAL_SYSTEM_PROMPT = """You are a security engineering architect designing new capabilities for a Databricks-native SOC platform.

Given an academic paper with its analysis, propose a concrete capability that could be built on the platform.

Platform architecture:
- Databricks Lakehouse (Bronze → Silver → Gold medallion)
- Mosaic AI Agent Framework (Python agents with UC Function tools)
- MLflow for model lifecycle management
- Delta Lake for all persistence
- Unity Catalog for governance
- Structured Streaming for real-time processing
- Model Serving for inference endpoints

Proposal types:
- "agent": New autonomous SOC agent (InteractiveAgent or BatchAgent)
- "detection_rule": New detection logic (Sigma/YARA/custom SQL)
- "ml_model": New ML model for classification/scoring
- "pipeline": New data processing pipeline (streaming or batch)
- "correlation_engine": New correlation pattern across data sources
- "threat_feed": New threat intelligence enrichment source

Return ONLY valid JSON:
{
    "title": "<Capability name - be specific and actionable>",
    "proposal_type": "<one of the types above>",
    "description": "<3-4 sentence description of what this capability does and how it works>",
    "priority": "<critical|high|medium|low>",
    "mitre_coverage": ["<MITRE technique IDs this would detect/prevent>"],
    "architecture_layer": "<ingestion|bronze|silver|gold|agent_mesh|response>",
    "integration_points": ["<existing components this integrates with>"],
    "compute_requirements": "<e.g., GPU cluster for training, single-node for inference>",
    "estimated_effort": "<1_week|2_weeks|1_month|2_months|quarter>",
    "dependencies": ["<required packages, models, or data sources>"]
}"""


def generate_proposal(paper: dict, analysis: dict) -> Optional[dict]:
    """Generate a capability proposal from an analyzed paper."""
    if analysis.get("relevance_score", 0) < 0.7:
        return None

    user_prompt = f"""Paper: {paper['title']}
Authors: {paper['authors']}
Venue: {paper['venue']}

Key Contributions: {analysis.get('key_contributions', '')}

AI Summary: {analysis.get('ai_summary', '')}

MITRE Techniques: {json.dumps(analysis.get('mitre_techniques', []))}

Applicable To: {json.dumps(analysis.get('applicable_to', []))}

Category: {analysis.get('category', 'unknown')}

Design a specific, implementable capability proposal based on this research."""

    try:
        response = llm.chat(
            system=PROPOSAL_SYSTEM_PROMPT,
            user=user_prompt,
            temperature=0.3,
            json_mode=True,
            max_tokens=1024,
        )
        result = llm.extract_json(response)
        if result and result.get("title"):
            return result
    except Exception as e:
        mon.log_warning(f"Proposal generation failed for '{paper['title'][:50]}': {e}")

    return None

# COMMAND ----------

# MAGIC %md
# MAGIC ## Main Execution Pipeline

# COMMAND ----------

class ResearchCortexAgent(BatchAgent):
    """
    Batch agent that scans academic sources, analyzes papers with LLM,
    and generates capability proposals stored in Delta tables.
    """

    def execute(self) -> AgentResult:
        batch_id = str(uuid.uuid4())
        start_time = time.time()
        errors = []

        # Phase 1: Collect papers from all sources
        mon.log_event("research_cortex_phase1_collection", {"batch_id": batch_id})
        all_papers = []

        try:
            arxiv_papers = fetch_arxiv_papers()
            all_papers.extend(arxiv_papers)
        except Exception as e:
            errors.append(f"arXiv: {str(e)[:200]}")
            mon.log_warning(f"arXiv collection failed: {e}")

        try:
            scholar_papers = fetch_semantic_scholar_papers()
            all_papers.extend(scholar_papers)
        except Exception as e:
            errors.append(f"Semantic Scholar: {str(e)[:200]}")
            mon.log_warning(f"Semantic Scholar collection failed: {e}")

        if not all_papers:
            return AgentResult(
                status=AgentStatus.COMPLETED,
                agent_name=self.agent_name,
                processed_count=0,
                details={"phase": "collection", "reason": "no papers found", "errors": errors},
            )

        # Deduplicate by title hash
        seen = set()
        unique_papers = []
        for p in all_papers:
            key = hashlib.sha256(p["title"].lower().strip().encode()).hexdigest()[:16]
            if key not in seen:
                seen.add(key)
                unique_papers.append(p)

        mon.log_event("research_cortex_papers_collected", {
            "total": len(all_papers),
            "unique": len(unique_papers),
            "sources": {"arxiv": len([p for p in unique_papers if p["ingestion_source"] == "arxiv_api"]),
                        "semantic_scholar": len([p for p in unique_papers if p["ingestion_source"] == "semantic_scholar"])},
        })

        # Phase 2: LLM Analysis (relevance scoring + metadata extraction)
        mon.log_event("research_cortex_phase2_analysis", {"papers_to_analyze": len(unique_papers)})
        analyzed_papers = []
        proposals = []

        for paper in unique_papers:
            if llm.budget.exhausted:
                mon.log_warning("Token budget exhausted during analysis phase")
                break

            analysis = analyze_paper_relevance(paper)
            score = analysis.get("relevance_score", 0)

            if score >= RELEVANCE_THRESHOLD:
                paper_record = {
                    "id": str(uuid.uuid4()),
                    "title": paper["title"],
                    "authors": paper["authors"],
                    "venue": paper["venue"],
                    "venue_type": paper["venue_type"],
                    "published_date": paper["published_date"],
                    "abstract": paper["abstract"],
                    "doi": paper.get("doi"),
                    "arxiv_id": paper.get("arxiv_id"),
                    "url": paper.get("url"),
                    "keywords": paper.get("keywords", "[]"),
                    "category": analysis.get("category", "unknown"),
                    "relevance_score": score,
                    "mitre_techniques": json.dumps(analysis.get("mitre_techniques", [])),
                    "ai_summary": analysis.get("ai_summary", ""),
                    "ai_key_contributions": analysis.get("key_contributions", ""),
                    "threat_families": json.dumps(analysis.get("threat_families", [])),
                    "ingestion_source": paper["ingestion_source"],
                    "ingestion_batch_id": batch_id,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
                analyzed_papers.append(paper_record)

                # Phase 3: Generate proposal if score is high enough
                if GENERATE_PROPOSALS and score >= 0.7:
                    proposal = generate_proposal(paper, analysis)
                    if proposal:
                        proposal_record = {
                            "id": str(uuid.uuid4()),
                            "publication_id": paper_record["id"],
                            "title": proposal.get("title", "Untitled Proposal"),
                            "proposal_type": proposal.get("proposal_type", "agent"),
                            "description": proposal.get("description", ""),
                            "status": "draft",
                            "priority": proposal.get("priority", "medium"),
                            "mitre_coverage": json.dumps(proposal.get("mitre_coverage", [])),
                            "architecture_layer": proposal.get("architecture_layer", "gold"),
                            "integration_points": json.dumps(proposal.get("integration_points", [])),
                            "compute_requirements": proposal.get("compute_requirements", ""),
                            "estimated_effort": proposal.get("estimated_effort", "2_weeks"),
                            "dependencies": json.dumps(proposal.get("dependencies", [])),
                            "generated_by": "research_cortex_agent",
                            "approved_by": None,
                            "created_at": datetime.now(timezone.utc).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat(),
                        }
                        proposals.append(proposal_record)

        mon.log_event("research_cortex_analysis_complete", {
            "analyzed": len(unique_papers),
            "relevant": len(analyzed_papers),
            "proposals_generated": len(proposals),
            "avg_relevance": sum(p["relevance_score"] for p in analyzed_papers) / len(analyzed_papers) if analyzed_papers else 0,
        })

        # Phase 4: Persist to Delta tables
        self._persist_papers(analyzed_papers, batch_id)
        self._persist_proposals(proposals, batch_id)
        self._log_scan_history(batch_id, len(unique_papers), len(analyzed_papers), len(proposals), time.time() - start_time, errors)

        return AgentResult(
            status=AgentStatus.COMPLETED,
            agent_name=self.agent_name,
            processed_count=len(analyzed_papers),
            details={
                "batch_id": batch_id,
                "papers_collected": len(all_papers),
                "papers_unique": len(unique_papers),
                "papers_relevant": len(analyzed_papers),
                "proposals_generated": len(proposals),
                "tokens_used": llm.budget.used_total,
                "errors": errors,
            },
        )

    def _persist_papers(self, papers: list, batch_id: str):
        """Write analyzed papers to Delta table via MERGE."""
        if not papers:
            return

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

        df = spark.createDataFrame(papers, schema=schema)
        df = df.withColumn("created_at", F.to_timestamp("created_at"))
        df = df.withColumn("updated_at", F.to_timestamp("updated_at"))

        safe_merge(
            spark, df,
            "academic_publications",
            merge_keys=["title"],
            update_columns=["relevance_score", "ai_summary", "ai_key_contributions", "mitre_techniques", "threat_families", "updated_at"],
            catalog=cfg.catalog, schema=cfg.schema,
        )
        mon.log_info(f"Persisted {len(papers)} papers to academic_publications")

    def _persist_proposals(self, proposals: list, batch_id: str):
        """Write proposals to Delta table."""
        if not proposals:
            return

        schema = StructType([
            StructField("id", StringType(), False),
            StructField("publication_id", StringType(), False),
            StructField("title", StringType(), False),
            StructField("proposal_type", StringType(), True),
            StructField("description", StringType(), True),
            StructField("status", StringType(), True),
            StructField("priority", StringType(), True),
            StructField("mitre_coverage", StringType(), True),
            StructField("architecture_layer", StringType(), True),
            StructField("integration_points", StringType(), True),
            StructField("compute_requirements", StringType(), True),
            StructField("estimated_effort", StringType(), True),
            StructField("dependencies", StringType(), True),
            StructField("generated_by", StringType(), True),
            StructField("approved_by", StringType(), True),
            StructField("created_at", StringType(), True),
            StructField("updated_at", StringType(), True),
        ])

        df = spark.createDataFrame(proposals, schema=schema)
        df = df.withColumn("created_at", F.to_timestamp("created_at"))
        df = df.withColumn("updated_at", F.to_timestamp("updated_at"))

        safe_merge(
            spark, df,
            "research_capability_proposals",
            merge_keys=["title", "publication_id"],
            update_columns=["description", "priority", "mitre_coverage", "updated_at"],
            catalog=cfg.catalog, schema=cfg.schema,
        )
        mon.log_info(f"Persisted {len(proposals)} proposals to research_capability_proposals")

    def _log_scan_history(self, batch_id: str, found: int, relevant: int, proposals: int, duration: float, errors: list):
        """Record scan run in audit table."""
        record = [{
            "id": batch_id,
            "scan_type": "full_scan",
            "source": "arxiv+semantic_scholar",
            "papers_found": found,
            "papers_relevant": relevant,
            "proposals_generated": proposals,
            "duration_seconds": round(duration, 2),
            "errors": json.dumps(errors) if errors else None,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }]

        schema = StructType([
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

        df = spark.createDataFrame(record, schema=schema)
        df = df.withColumn("created_at", F.to_timestamp("created_at"))
        safe_append(df, "research_scan_history", cfg.catalog, cfg.schema)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Execute Agent

# COMMAND ----------

agent = ResearchCortexAgent(
    agent_name="research_cortex",
    cfg=cfg,
    llm=llm,
    mon=mon,
    spark=spark,
)

result = agent.run()
print(f"\nResearch Cortex Agent Result:")
print(result.to_json())

# COMMAND ----------

# MAGIC %md
# MAGIC ## Post-Run Analytics

# COMMAND ----------

pub_table = get_table_path(cfg, "academic_publications")
prop_table = get_table_path(cfg, "research_capability_proposals")

try:
    paper_stats = spark.sql(f"""
        SELECT
            category,
            COUNT(*) as paper_count,
            ROUND(AVG(relevance_score), 3) as avg_relevance,
            COUNT(CASE WHEN relevance_score >= 0.8 THEN 1 END) as high_relevance
        FROM {pub_table}
        GROUP BY category
        ORDER BY avg_relevance DESC
    """)
    print("\n=== Papers by Category ===")
    paper_stats.show(truncate=False)

    proposal_stats = spark.sql(f"""
        SELECT
            proposal_type,
            status,
            priority,
            COUNT(*) as count
        FROM {prop_table}
        GROUP BY proposal_type, status, priority
        ORDER BY proposal_type, status
    """)
    print("\n=== Proposals by Type/Status ===")
    proposal_stats.show(truncate=False)

except Exception as e:
    mon.log_warning(f"Post-run analytics skipped: {e}")

# COMMAND ----------

mon.log_complete(details={"status": "batch_agent_complete", "result": json.loads(result.to_json())})
dbutils.notebook.exit(result.to_json())
