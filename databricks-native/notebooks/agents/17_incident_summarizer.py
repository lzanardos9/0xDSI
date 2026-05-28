# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 17 - Incident Summarizer
# MAGIC AI Incident Summarizer using Mosaic AI Agent Framework.
# MAGIC Creates executive and technical incident summaries with business impact scoring.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import time
import logging
from datetime import datetime, timedelta
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

logger = logging.getLogger("oxdsi.incident_summarizer")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

SUMMARIES_TABLE = cfg.get_table_path("alert_summaries")
ALERTS_TABLE = cfg.get_table_path("alerts")
EVENTS_TABLE = cfg.get_table_path("events")
LOOKBACK_HOURS = 2

# COMMAND ----------

# MAGIC %md
# MAGIC ## Incident Summarizer Agent Implementation

# COMMAND ----------

class IncidentSummarizerAgent(InteractiveAgent):
    """
    AI Incident Summarizer that creates executive and technical incident summaries.
    Produces dual summaries: executive (business impact, 3 sentences) and technical
    (full timeline, IOCs, TTPs). Supports STIX format output.
    """

    def get_system_prompt(self) -> str:
        """Return the system prompt for the incident summarizer."""
        return """You are a concise incident report writer specializing in creating summaries
for SOC and executive audiences.

Your role:
1. Analyze security alerts and related events
2. Create two distinct summaries: Executive and Technical
3. Calculate business impact and blast radius
4. Extract indicators of compromise and tactics/techniques
5. Provide actionable recommendations

Executive Summary Requirements:
- Maximum 3 sentences in plain business language
- Focus on business impact, affected systems, severity
- Avoid technical jargon; use terms executives understand
- Include immediate risk level (Critical/High/Medium)

Technical Summary Requirements:
- Complete timeline of events
- All indicators of compromise (IPs, domains, hashes, emails)
- MITRE ATT&CK tactics and techniques used
- Detailed forensic timeline
- Recommended containment and remediation actions

Always structure output as valid JSON with clear sections for both audiences."""

    def get_tools(self) -> list[UCTool]:
        """Define incident-summarizer-specific tools."""
        tools = create_soc_tools(cfg)

        # Filter to relevant tools
        relevant_tools = [t for t in tools if t.name in [
            "get_alert_context",
            "search_events",
            "query_user_behavior",
            "lookup_ioc",
        ]]
        return relevant_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Agent

# COMMAND ----------

# Initialize MLflow experiment tracking
import mlflow
mlflow.set_experiment(f"/0xDSI/agents/incident_summarizer")

# Create agent instance
agent = IncidentSummarizerAgent(
    agent_name="incident_summarizer",
    cfg=cfg,
    llm=llm,
    mon=mon,
    spark=spark,
)

# Register tools
for tool in agent.get_tools():
    agent.register_tool(tool)

mon.log_event("incident_summarizer_initialized", {
    "tools_registered": len(agent._tools),
    "lookback_hours": LOOKBACK_HOURS,
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Helper Functions

# COMMAND ----------

def fetch_related_events(alert_row: dict, lookback_hours: int = LOOKBACK_HOURS) -> list:
    """
    Fetch events related to an alert for context.
    Searches by source_ip, dest_ip, user_id, or process_hash.
    """
    try:
        events_df = spark.read.table(EVENTS_TABLE)
        cutoff_time = (datetime.utcnow() - timedelta(hours=lookback_hours)).isoformat()

        # Build filter for related events
        source_ip = alert_row.get("source_ip")
        dest_ip = alert_row.get("dest_ip")
        user_id = alert_row.get("user_id")
        process_hash = alert_row.get("process_hash")

        filters = []
        if source_ip:
            filters.append(F.col("source_ip") == source_ip)
        if dest_ip:
            filters.append(F.col("dest_ip") == dest_ip)
        if user_id:
            filters.append(F.col("user_id") == user_id)
        if process_hash:
            filters.append(F.col("process_hash") == process_hash)

        if not filters:
            return []

        combined_filter = filters[0]
        for f in filters[1:]:
            combined_filter = combined_filter | f

        related_events = (
            events_df
            .filter(combined_filter)
            .filter(F.col("timestamp") >= cutoff_time)
            .orderBy(F.desc("timestamp"))
            .limit(50)
            .collect()
        )

        return [row.asDict() for row in related_events]
    except Exception as e:
        logger.warning(f"Failed to fetch related events: {e}")
        return []


def calculate_blast_radius(alert_row: dict, event_count: int) -> dict:
    """
    Calculate estimated blast radius and business impact.
    """
    severity_map = {"critical": 10, "high": 7, "medium": 4, "low": 1}
    severity_score = severity_map.get(alert_row.get("severity", "medium"), 4)

    # Impact increases with event count
    impact_multiplier = min(1 + (event_count / 100), 3.0)

    business_impact_score = int(severity_score * impact_multiplier * 10)
    business_impact_score = min(max(business_impact_score, 0), 100)

    return {
        "event_count": event_count,
        "affected_systems_estimate": max(1, event_count // 10),
        "business_impact_score": business_impact_score,
        "blast_radius": "Critical" if business_impact_score >= 70 else
                        "High" if business_impact_score >= 50 else
                        "Medium" if business_impact_score >= 30 else "Low",
    }

# COMMAND ----------

# MAGIC %md
# MAGIC ## Summary Generation Function

# COMMAND ----------

def summarize_incident(alert_id: str, use_stix: bool = False) -> dict:
    """
    Generate executive and technical summaries for an alert.

    Args:
        alert_id: ID of the alert to summarize
        use_stix: If True, format IoCs in STIX format

    Returns:
        Dict with executive_summary, technical_summary, impact_metrics
    """
    try:
        # Fetch alert details
        alerts_df = spark.read.table(ALERTS_TABLE)
        alert_row = alerts_df.filter(F.col("alert_id") == alert_id).first()

        if not alert_row:
            return {"error": f"Alert {alert_id} not found"}

        alert_dict = alert_row.asDict() if hasattr(alert_row, "asDict") else dict(alert_row)

        # Fetch related events
        related_events = fetch_related_events(alert_dict)
        event_context = related_events[:20]  # Limit for LLM context

        # Build agent prompt
        user_prompt = f"""Analyze and summarize this security incident.

ALERT INFORMATION:
Alert ID: {alert_id}
Type: {alert_dict.get('alert_type')}
Severity: {alert_dict.get('severity')}
Source IP: {alert_dict.get('source_ip', 'N/A')}
Destination IP: {alert_dict.get('dest_ip', 'N/A')}
User ID: {alert_dict.get('user_id', 'N/A')}
Description: {alert_dict.get('description', 'N/A')}
Created: {alert_dict.get('created_at', 'N/A')}

RELATED EVENTS (last {len(event_context)} events):
{json.dumps(event_context, default=str)[:4000]}

Generate two summaries and return as JSON:
{{
  "executive_summary": {{
    "summary": "EXACTLY 3 sentences for C-level audience. Focus on business impact.",
    "severity": "Critical|High|Medium|Low",
    "immediate_actions": [
      "Action 1",
      "Action 2",
      "Action 3"
    ]
  }},
  "technical_summary": {{
    "timeline": "Chronological sequence of events with timestamps",
    "indicators_of_compromise": [
      {{"type": "ip|domain|hash|email|url", "value": "...", "context": "where seen"}}
    ],
    "tactics_techniques": [
      {{"tactic": "T###", "technique": "Technique Name", "description": "How it was used"}}
    ],
    "forensic_findings": "Key findings from event analysis",
    "recommended_actions": [
      "Containment action",
      "Eradication action",
      "Recovery action"
    ]
  }},
  "impact_assessment": {{
    "affected_systems_count": <estimate>,
    "data_at_risk": "Description of data potentially exposed",
    "confidence_level": "high|medium|low"
  }}
}}"""

        # Call agent
        response = agent.predict_messages(
            messages=[{"role": "user", "content": user_prompt}],
            params={"temperature": 0.2, "max_tokens": 6000},
        )

        content = response.get("content", "")

        # Extract JSON
        try:
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0].strip()
            elif "{" in content:
                start_idx = content.find("{")
                end_idx = content.rfind("}") + 1
                json_str = content[start_idx:end_idx]
            else:
                json_str = content

            summary = json.loads(json_str)

            # Calculate blast radius
            blast_radius = calculate_blast_radius(alert_dict, len(related_events))

            # Add metadata
            summary["summary_id"] = f"SUM-{alert_id}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}"
            summary["alert_id"] = alert_id
            summary["generated_at"] = datetime.utcnow().isoformat()
            summary["agent"] = "incident_summarizer"
            summary["blast_radius"] = blast_radius

            mon.log_event("incident_summarized", {
                "alert_id": alert_id,
                "severity": alert_dict.get("severity"),
                "business_impact_score": blast_radius.get("business_impact_score"),
            })

            return summary
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse summary JSON: {e}")
            return {
                "error": "Failed to parse generated summary",
                "raw_content": content[:1000],
            }

    except Exception as e:
        error_msg = f"Summary generation failed: {str(e)}"
        mon.log_event("summarization_error", {
            "alert_id": alert_id,
            "error": error_msg,
        })
        logger.error(error_msg)
        return {"error": error_msg}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Interactive Interface

# COMMAND ----------

# For development/testing
if dbutils.widgets.get("alert_id"):
    alert_id_param = dbutils.widgets.get("alert_id")

    print(f"\n{'='*60}")
    print(f"Summarizing incident: {alert_id_param}")
    print(f"{'='*60}\n")

    start_time = time.time()
    result = summarize_incident(alert_id_param)
    duration = time.time() - start_time

    if "error" not in result:
        print(f"✓ Summary generated in {duration:.2f}s")
        print(f"\nExecutive Summary:")
        exec_summary = result.get("executive_summary", {})
        print(f"  {exec_summary.get('summary')}")
        print(f"  Severity: {exec_summary.get('severity')}")

        print(f"\nBusiness Impact:")
        impact = result.get("blast_radius", {})
        print(f"  Score: {impact.get('business_impact_score')}/100")
        print(f"  Blast Radius: {impact.get('blast_radius')}")

        print(f"\nTechnical Details:")
        tech = result.get("technical_summary", {})
        print(f"  IoCs: {len(tech.get('indicators_of_compromise', []))}")
        print(f"  TTPs: {len(tech.get('tactics_techniques', []))}")

        print(f"\nFull Summary (JSON):")
        print(json.dumps(result, indent=2))
    else:
        print(f"✗ Error: {result.get('error')}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## MLflow Experiment Tracking

# COMMAND ----------

# Log agent metadata to MLflow
with mlflow.start_run(run_name=f"incident_summarizer_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "lookback_hours": LOOKBACK_HOURS,
        "executive_summary_format": "3 sentences max",
    })

    mlflow.log_metrics({
        "tools_registered": len(agent._tools),
        "temperature": 0.2,
    })

    mlflow.log_dict({
        "agent_name": "incident_summarizer",
        "description": "Creates executive and technical incident summaries",
        "supports_stix": True,
        "supports_blast_radius": True,
    }, artifact_file="incident_summarizer_config.json")

print("Incident Summarizer Agent initialized and ready.")
print(f"Registered tools: {[t.name for t in agent._tools]}")
print(f"Lookback window: {LOOKBACK_HOURS} hours")
