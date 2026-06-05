# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 52 - Research Cortex: Proposal Lifecycle Manager
# MAGIC
# MAGIC Manages the lifecycle of capability proposals generated from academic research:
# MAGIC 1. Analyzes pending papers (category = 'pending_analysis') with full LLM pipeline
# MAGIC 2. Generates detailed capability proposals with architecture integration specs
# MAGIC 3. Enriches proposals with MITRE ATT&CK coverage mapping
# MAGIC 4. Scores proposals against current detection gaps
# MAGIC 5. Manages proposal state transitions (draft → under_review → approved → shipped)
# MAGIC
# MAGIC ## Scheduling:
# MAGIC - Recommended: Daily via Databricks Workflows (after 51_research_monitor runs)
# MAGIC - Chain: 51_research_monitor → 52_capability_proposer

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("research_cortex")

# COMMAND ----------

import json
import time
import uuid
from datetime import datetime, timezone
from pyspark.sql.types import *
from pyspark.sql import functions as F

from agent_framework import BatchAgent, AgentResult, AgentStatus

# COMMAND ----------

dbutils.widgets.text("max_papers_to_analyze", "20", "Max pending papers to analyze per run")
dbutils.widgets.text("proposal_threshold", "0.7", "Min relevance score to generate proposal")

MAX_ANALYZE = int(dbutils.widgets.get("max_papers_to_analyze"))
PROPOSAL_THRESHOLD = float(dbutils.widgets.get("proposal_threshold"))

# COMMAND ----------

# MAGIC %md
# MAGIC ## Fetch Pending Papers (Not Yet Fully Analyzed)

# COMMAND ----------

pub_table = get_table_path(cfg, "academic_publications")
prop_table = get_table_path(cfg, "research_capability_proposals")

pending_papers = spark.sql(f"""
    SELECT id, title, authors, venue, venue_type, published_date, abstract,
           doi, arxiv_id, url, keywords, relevance_score, ingestion_source
    FROM {pub_table}
    WHERE category = 'pending_analysis'
       OR ai_summary IS NULL
    ORDER BY relevance_score DESC
    LIMIT {MAX_ANALYZE}
""").collect()

mon.log_event("proposal_lifecycle_pending", {"papers_pending": len(pending_papers)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Full LLM Analysis for Pending Papers

# COMMAND ----------

ANALYSIS_PROMPT = """You are a cybersecurity research analyst for a Databricks-native SOC platform.
Analyze this academic paper and provide a comprehensive assessment.

Platform context:
- Databricks Lakehouse (Bronze/Silver/Gold medallion architecture)
- 49+ Mosaic AI agents for SOC automation
- MITRE ATT&CK-aligned detection engineering
- Real-time streaming (sub-second) event processing
- ML models for threat scoring, UEBA, malware analysis
- Unity Catalog governance and lineage tracking

Return ONLY valid JSON:
{
    "relevance_score": <float 0.0-1.0>,
    "category": "<detection_engineering|threat_intelligence|ml_security|vulnerability_research|incident_response|privacy_security|adversarial_ml|network_security>",
    "mitre_techniques": ["<MITRE ATT&CK T-codes relevant to this paper>"],
    "key_contributions": "<2-3 sentences on novel contributions>",
    "threat_families": ["<relevant threat actor groups or malware families>"],
    "ai_summary": "<5 sentence executive summary for SOC leadership>",
    "detection_gaps_addressed": ["<what gaps in current detection would this paper's approach fill>"],
    "implementation_complexity": "<low|medium|high|very_high>",
    "data_requirements": ["<what data sources are needed to implement this>"]
}"""


PROPOSAL_PROMPT = """You are a senior security engineering architect designing capabilities for a production SOC platform.

Platform architecture:
- Databricks Lakehouse: Bronze (raw) → Silver (normalized) → Gold (analytics-ready)
- Mosaic AI Agent Framework: InteractiveAgent (real-time) + BatchAgent (scheduled)
- MLflow for model lifecycle, Feature Store for ML features
- Delta Live Tables for declarative ETL pipelines
- Structured Streaming with Apache Kafka (ZeroBus) for real-time
- Unity Catalog: governance, lineage, access control
- Model Serving: GPU-accelerated inference endpoints

Existing agent capabilities:
- Triage, Enrichment, Threat Hunter, Orchestrator, SAGE Enrichment
- Nova Investigation, Vanguard Response, CTI Attribution, Pattern Discovery
- Vector Memory, Red Team, Blue Team, Forensics, Honeypot
- CISO Assistant, Playbook Generator, Incident Summarizer, Document Analyzer
- Malware Sandbox, LLM Guardrails, Model Poisoning Guard, Threat Simulator
- Connector Adapter, Threat Radar, ALHF Learning, Realtime Graph CEP
- Vector Scoring, AI Correlation, Connector Version, Stateful Backdoor
- Glasswing (Ingest, Dedup, Reachability, Blast Radius, Auto Patch)
- Session/Active List Managers, LLM Risk Profiler, Knowledge Store
- Guardian Compliance, OT Protocol Security, ExploitForge
- Communication Analyzer, Autonomous Response Learner, UEBA Entity Onboarding
- Edge Control Plane

Given this paper's analysis, design a SPECIFIC, IMPLEMENTABLE capability proposal.
Be concrete about what Delta tables it reads/writes, what models it uses, and how it
integrates with existing agents.

Return ONLY valid JSON:
{
    "title": "<Specific capability name>",
    "proposal_type": "<agent|detection_rule|ml_model|pipeline|correlation_engine|threat_feed>",
    "description": "<4-5 sentence description with technical specifics>",
    "priority": "<critical|high|medium|low>",
    "mitre_coverage": ["<MITRE technique IDs this would detect/prevent>"],
    "architecture_layer": "<ingestion|bronze|silver|gold|agent_mesh|response>",
    "integration_points": ["<specific existing agents/tables this connects to>"],
    "compute_requirements": "<GPU cluster / single-node / serverless SQL / streaming cluster>",
    "estimated_effort": "<1_week|2_weeks|1_month|2_months|quarter>",
    "dependencies": ["<specific packages, models, APIs, or data sources needed>"],
    "delta_tables": {
        "reads": ["<tables this capability would read from>"],
        "writes": ["<tables this capability would write to>"]
    },
    "success_metrics": ["<how we measure if this capability is working>"],
    "risk_if_not_built": "<what attacks we remain blind to without this>"
}"""

# COMMAND ----------

# MAGIC %md
# MAGIC ## Process Pending Papers

# COMMAND ----------

analyzed_updates = []
new_proposals = []
analysis_errors = []

for row in pending_papers:
    if llm.budget.exhausted:
        mon.log_warning("Token budget exhausted, stopping analysis")
        break

    paper_text = f"""Title: {row.title}
Authors: {row.authors}
Venue: {row.venue} ({row.venue_type})
Published: {row.published_date}

Abstract:
{row.abstract[:1800]}"""

    # Full LLM analysis
    try:
        response = llm.chat(
            system=ANALYSIS_PROMPT,
            user=paper_text,
            temperature=0.1,
            json_mode=True,
            max_tokens=1024,
        )
        analysis = llm.extract_json(response)
        if not analysis:
            analysis_errors.append(f"JSON parse failed for: {row.title[:60]}")
            continue
    except Exception as e:
        analysis_errors.append(f"LLM failed for '{row.title[:60]}': {str(e)[:100]}")
        continue

    # Update paper record
    analyzed_updates.append({
        "id": row.id,
        "category": analysis.get("category", "unknown"),
        "relevance_score": analysis.get("relevance_score", row.relevance_score or 0.5),
        "mitre_techniques": json.dumps(analysis.get("mitre_techniques", [])),
        "ai_summary": analysis.get("ai_summary", ""),
        "ai_key_contributions": analysis.get("key_contributions", ""),
        "threat_families": json.dumps(analysis.get("threat_families", [])),
    })

    # Generate proposal if high enough relevance
    score = analysis.get("relevance_score", 0)
    if score >= PROPOSAL_THRESHOLD:
        try:
            prop_response = llm.chat(
                system=PROPOSAL_PROMPT,
                user=f"""{paper_text}

Analysis Results:
- Category: {analysis.get('category')}
- Key Contributions: {analysis.get('key_contributions')}
- MITRE Techniques: {json.dumps(analysis.get('mitre_techniques', []))}
- Detection Gaps Addressed: {json.dumps(analysis.get('detection_gaps_addressed', []))}
- Data Requirements: {json.dumps(analysis.get('data_requirements', []))}
- Implementation Complexity: {analysis.get('implementation_complexity', 'medium')}""",
                temperature=0.3,
                json_mode=True,
                max_tokens=1280,
            )
            proposal = llm.extract_json(prop_response)
            if proposal and proposal.get("title"):
                new_proposals.append({
                    "id": str(uuid.uuid4()),
                    "publication_id": row.id,
                    "title": proposal["title"],
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
                    "generated_by": "research_cortex_proposer",
                    "approved_by": None,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                })
        except Exception as e:
            analysis_errors.append(f"Proposal gen failed for '{row.title[:60]}': {str(e)[:100]}")

mon.log_event("proposal_lifecycle_analysis_done", {
    "papers_analyzed": len(analyzed_updates),
    "proposals_generated": len(new_proposals),
    "errors": len(analysis_errors),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist Updated Analysis

# COMMAND ----------

if analyzed_updates:
    for update in analyzed_updates:
        try:
            spark.sql(f"""
                UPDATE {pub_table}
                SET category = '{update["category"]}',
                    relevance_score = {update["relevance_score"]},
                    mitre_techniques = '{update["mitre_techniques"].replace("'", "''")}',
                    ai_summary = '{update["ai_summary"][:500].replace("'", "''")}',
                    ai_key_contributions = '{update["ai_key_contributions"][:500].replace("'", "''")}',
                    threat_families = '{update["threat_families"].replace("'", "''")}',
                    updated_at = current_timestamp()
                WHERE id = '{update["id"]}'
            """)
        except Exception as e:
            mon.log_warning(f"Update failed for paper {update['id']}: {e}")

    mon.log_info(f"Updated {len(analyzed_updates)} paper records with full analysis")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Persist New Proposals

# COMMAND ----------

if new_proposals:
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

    df = spark.createDataFrame(new_proposals, schema=schema)
    df = df.withColumn("created_at", F.to_timestamp("created_at"))
    df = df.withColumn("updated_at", F.to_timestamp("updated_at"))

    safe_merge(
        spark, df,
        "research_capability_proposals",
        merge_keys=["title", "publication_id"],
        catalog=cfg.catalog, schema=cfg.schema,
    )
    mon.log_info(f"Persisted {len(new_proposals)} new capability proposals")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Detection Gap Analysis
# MAGIC Cross-reference proposals with existing MITRE coverage to identify gaps.

# COMMAND ----------

try:
    # Get all MITRE techniques from proposals
    all_proposal_techniques = spark.sql(f"""
        SELECT DISTINCT explode(from_json(mitre_coverage, 'array<string>')) as technique
        FROM {prop_table}
        WHERE mitre_coverage IS NOT NULL AND mitre_coverage != '[]'
    """).collect()

    # Get existing detection coverage (from detection rules / agents)
    detection_table = get_table_path(cfg, "detection_rules")
    try:
        existing_coverage = spark.sql(f"""
            SELECT DISTINCT explode(from_json(mitre_techniques, 'array<string>')) as technique
            FROM {detection_table}
            WHERE enabled = true
        """).collect()
        existing_set = {r.technique for r in existing_coverage}
    except Exception:
        existing_set = set()

    proposed_set = {r.technique for r in all_proposal_techniques}
    new_coverage = proposed_set - existing_set

    if new_coverage:
        mon.log_event("detection_gap_analysis", {
            "existing_techniques_covered": len(existing_set),
            "proposed_new_techniques": len(new_coverage),
            "new_techniques": sorted(list(new_coverage))[:20],
            "coverage_improvement_pct": round(len(new_coverage) / max(len(existing_set), 1) * 100, 1),
        })
        print(f"\n{'='*60}")
        print(f"  DETECTION GAP ANALYSIS")
        print(f"{'='*60}")
        print(f"  Current MITRE coverage: {len(existing_set)} techniques")
        print(f"  Proposals would add: {len(new_coverage)} new techniques")
        print(f"  New techniques: {', '.join(sorted(list(new_coverage))[:15])}")
        print(f"{'='*60}")

except Exception as e:
    mon.log_warning(f"Gap analysis skipped: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Proposal Priority Scoring
# MAGIC Re-score proposals based on gap analysis and organizational risk.

# COMMAND ----------

try:
    # Auto-escalate proposals that cover undetected critical techniques
    critical_techniques = {
        "T1059", "T1053", "T1547", "T1055", "T1003", "T1071",
        "T1486", "T1566", "T1190", "T1210", "T1048", "T1041",
    }

    proposals_df = spark.sql(f"""
        SELECT id, title, mitre_coverage, priority
        FROM {prop_table}
        WHERE status = 'draft' AND priority != 'critical'
    """).collect()

    escalated = 0
    for prop in proposals_df:
        try:
            techniques = json.loads(prop.mitre_coverage or "[]")
        except Exception:
            techniques = []

        covers_critical = any(
            any(ct in t for ct in critical_techniques)
            for t in techniques
        )

        if covers_critical and prop.priority in ("medium", "low"):
            spark.sql(f"""
                UPDATE {prop_table}
                SET priority = 'high', updated_at = current_timestamp()
                WHERE id = '{prop.id}'
            """)
            escalated += 1

    if escalated:
        mon.log_event("proposals_auto_escalated", {"count": escalated})

except Exception as e:
    mon.log_warning(f"Priority scoring skipped: {e}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary Dashboard Data

# COMMAND ----------

try:
    summary = spark.sql(f"""
        SELECT
            (SELECT COUNT(*) FROM {pub_table}) as total_papers,
            (SELECT COUNT(*) FROM {pub_table} WHERE relevance_score >= 0.7) as high_relevance_papers,
            (SELECT COUNT(*) FROM {prop_table}) as total_proposals,
            (SELECT COUNT(*) FROM {prop_table} WHERE status = 'draft') as draft_proposals,
            (SELECT COUNT(*) FROM {prop_table} WHERE status = 'under_review') as review_proposals,
            (SELECT COUNT(*) FROM {prop_table} WHERE status = 'approved') as approved_proposals,
            (SELECT COUNT(*) FROM {prop_table} WHERE status = 'shipped') as shipped_proposals,
            (SELECT COUNT(*) FROM {prop_table} WHERE priority = 'critical') as critical_proposals
    """).collect()[0]

    print(f"\n{'='*60}")
    print(f"  RESEARCH CORTEX DASHBOARD SUMMARY")
    print(f"{'='*60}")
    print(f"  Papers: {summary.total_papers} total | {summary.high_relevance_papers} high-relevance")
    print(f"  Proposals: {summary.total_proposals} total")
    print(f"    Draft: {summary.draft_proposals} | Review: {summary.review_proposals}")
    print(f"    Approved: {summary.approved_proposals} | Shipped: {summary.shipped_proposals}")
    print(f"    Critical: {summary.critical_proposals}")
    print(f"{'='*60}")

except Exception as e:
    pass

# COMMAND ----------

result = {
    "status": "completed",
    "papers_analyzed": len(analyzed_updates),
    "proposals_generated": len(new_proposals),
    "errors": analysis_errors[:5],
    "tokens_used": llm.budget.used_total,
}

mon.log_complete(rows_processed=len(analyzed_updates) + len(new_proposals))
print(f"\nCapability Proposer Result:")
print(json.dumps(result, indent=2))
dbutils.notebook.exit(json.dumps(result))
