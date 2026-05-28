# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 24 - Threat Radar Intelligence
# MAGIC Mosaic AI Agent Framework InteractiveAgent.
# MAGIC Threat intelligence analyst tracking emerging threats.
# MAGIC Assesses organizational exposure, produces threat briefs, correlates external feeds with internal telemetry.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("threat_radar")

# COMMAND ----------

import json
import time
from datetime import datetime, timezone

from agent_framework import InteractiveAgent, AgentResult, create_soc_tools, UCTool

# COMMAND ----------

class ThreatRadarAgent(InteractiveAgent):
    """
    Interactive agent providing real-time threat landscape awareness.
    - System prompt: Threat intelligence analyst
    - Tracks emerging threats from external feeds
    - Assesses organizational exposure
    - Produces threat briefs with relevance scoring and mitigation priorities
    - Correlates external threat feeds with internal telemetry
    """

    def get_system_prompt(self) -> str:
        """System prompt for threat intelligence analysis."""
        return """You are a threat intelligence analyst providing strategic threat landscape awareness.

Your expertise includes:
- Tracking emerging threats from reputable threat feeds
- Assessing organizational exposure to specific threats
- Correlating external threat intelligence with internal detection telemetry
- Producing actionable threat briefs with risk prioritization

When analyzing threats, you:
1. Evaluate threat relevance to the organization (industry, geography, technologies)
2. Assess impact severity if the threat materializes
3. Check organizational detection and prevention capabilities
4. Recommend priority mitigation actions
5. Identify intelligence gaps

Threat briefs should include:
- Threat actor name and aliases (if known)
- MITRE ATT&CK techniques used
- Targeted industries and technologies
- Known indicators of compromise (IOCs)
- Organizational exposure assessment (1-5 scale)
- Detection coverage analysis
- Recommended actions with timeline
- External references and threat feed sources

Always cite specific threat feeds and provide confidence levels for claims.
Use the available tools to search for related events and asset information."""

    def get_tools(self) -> list[UCTool]:
        """Register tools for threat intelligence analysis."""
        intelligence_tools = [
            UCTool(
                name="lookup_ioc",
                description="Look up indicators of compromise in threat intelligence feeds",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="lookup_ioc",
                parameters={
                    "type": "object",
                    "properties": {
                        "indicator": {"type": "string", "description": "IP, domain, hash, URL, or email"},
                        "indicator_type": {"type": "string", "enum": ["ip", "domain", "hash", "url", "email"]},
                    },
                    "required": ["indicator", "indicator_type"],
                },
            ),
            UCTool(
                name="search_events",
                description="Search for events matching IOCs in internal telemetry",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="search_events",
                parameters={
                    "type": "object",
                    "properties": {
                        "event_type": {"type": "string"},
                        "source_ip": {"type": "string"},
                        "hours_back": {"type": "integer"},
                        "limit": {"type": "integer"},
                    },
                },
            ),
            UCTool(
                name="get_asset_info",
                description="Get asset information including criticality and ownership",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="get_asset_info",
                parameters={
                    "type": "object",
                    "properties": {
                        "identifier": {"type": "string", "description": "IP, hostname, or asset ID"},
                    },
                    "required": ["identifier"],
                },
            ),
            UCTool(
                name="query_user_behavior",
                description="Query user behavioral patterns and anomalies",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="query_user_behavior",
                parameters={
                    "type": "object",
                    "properties": {
                        "user_id": {"type": "string"},
                        "days_back": {"type": "integer"},
                    },
                    "required": ["user_id"],
                },
            ),
        ]

        return intelligence_tools

# COMMAND ----------

# Initialize agent with tools
agent = ThreatRadarAgent(
    agent_name="threat_radar",
    cfg=cfg,
    llm=llm,
    mon=mon,
    spark=spark
)

# Register all tools
for tool in agent.get_tools():
    agent.register_tool(tool)

mon.log_event("threat_radar_initialized", {"tools_registered": len(agent._tools)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Testing the Threat Radar Agent

# COMMAND ----------

# Test with a sample threat intelligence request
try:
    test_messages = [
        {
            "role": "user",
            "content": """Analyze the current threat landscape for our financial services organization.

We operate:
- Public-facing web applications (e-commerce platform)
- Internal Microsoft AD domain with 5000 users
- AWS cloud infrastructure (payment processing, customer data)
- Multiple data centers in US and EU

Key concerns:
1. What's the current threat landscape relevant to fintech?
2. Have we seen any IOCs from major threat actors in recent days?
3. What's our exposure to ransomware threats?
4. What mitigation actions should be priorities this month?

Please provide a structured threat brief with risk prioritization."""
        }
    ]

    response = agent.predict_messages(test_messages)
    mon.log_event("threat_radar_inference_complete", {
        "turns": response.get("metadata", {}).get("turns", 0),
        "tokens": response.get("metadata", {}).get("tokens_total", 0),
    })
    print(json.dumps(response, indent=2))

except Exception as e:
    mon.log_error(e, context="threat_radar_inference")
    raise
finally:
    mon.log_complete({"status": "interactive_agent_ready"})
