# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 22 - Threat Simulator
# MAGIC Mosaic AI Agent Framework InteractiveAgent.
# MAGIC Expert adversary emulation planner using MITRE ATT&CK framework.
# MAGIC Plans multi-stage attack simulations, validates detection coverage, structures findings.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

require_enabled("threat_simulator")

# COMMAND ----------

import json
import time
from datetime import datetime, timezone

from agent_framework import InteractiveAgent, AgentResult, create_soc_tools, UCTool

# COMMAND ----------

class ThreatSimulatorAgent(InteractiveAgent):
    """
    Interactive agent that plans threat simulations using MITRE ATT&CK framework.
    - Receives simulation requests from SOC team
    - Designs multi-stage attack simulation plans
    - Validates coverage against existing detections
    - Returns structured simulation plan with expected detection points
    """

    def get_system_prompt(self) -> str:
        """System prompt for adversary emulation planning."""
        return """You are an expert adversary emulation planner and MITRE ATT&CK specialist.

Your role is to help the security team plan comprehensive threat simulations that:
1. Cover realistic attack techniques from MITRE ATT&CK
2. Test detection and response capabilities
3. Identify gaps in detection coverage
4. Generate attack scenarios that flow through the organization's infrastructure

When planning a simulation, consider:
- Kill chain progression (Initial Access -> Execution -> Exfiltration)
- Realistic attacker behavior and TTPs
- Detection evasion techniques
- Multi-stage campaigns over time
- Network segmentation and defensive layers

Always provide structured output with:
- Simulation ID (UUID)
- Attack scenario name
- MITRE techniques used (technique IDs)
- Expected timeline
- Detection points (where detection should occur)
- Gap analysis (where detection may fail)
- Infrastructure impact assessment

Use the available tools to search for existing detections, correlate with threat intel, and assess asset criticality."""

    def get_tools(self) -> list[UCTool]:
        """Register tools for threat simulation planning."""
        soc_tools = create_soc_tools(cfg)

        # Add simulation-specific tools
        simulation_tools = [
            UCTool(
                name="search_events",
                description="Search raw events by type, source, or time range",
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
                name="lookup_ioc",
                description="Look up indicators of compromise in threat intelligence",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="lookup_ioc",
                parameters={
                    "type": "object",
                    "properties": {
                        "indicator": {"type": "string"},
                        "indicator_type": {"type": "string", "enum": ["ip", "domain", "hash", "url", "email"]},
                    },
                    "required": ["indicator", "indicator_type"],
                },
            ),
            UCTool(
                name="get_asset_info",
                description="Get asset information including criticality and network zone",
                catalog=cfg.catalog,
                schema=cfg.schema,
                function_name="get_asset_info",
                parameters={
                    "type": "object",
                    "properties": {
                        "identifier": {"type": "string"},
                    },
                    "required": ["identifier"],
                },
            ),
        ]

        return simulation_tools

# COMMAND ----------

# Initialize agent with tools
agent = ThreatSimulatorAgent(
    agent_name="threat_simulator",
    cfg=cfg,
    llm=llm,
    mon=mon,
    spark=spark
)

# Register all tools
for tool in agent.get_tools():
    agent.register_tool(tool)

mon.log_event("threat_simulator_initialized", {"tools_registered": len(agent._tools)})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Testing the Interactive Agent

# COMMAND ----------

# Test with a sample threat simulation request
try:
    test_messages = [
        {
            "role": "user",
            "content": """Plan a threat simulation for our organization.
We want to test detection of ransomware deployment via supply chain compromise.
Target infrastructure: domain controllers and file servers.
Timeline: simulate 6-hour attack progression.
Expected detection technologies: EDR, network IDS, DNS monitoring.
Provide the simulation plan with specific MITRE techniques, detection points, and gap analysis."""
        }
    ]

    response = agent.predict_messages(test_messages)
    mon.log_event("threat_simulator_inference_complete", {
        "turns": response.get("metadata", {}).get("turns", 0),
        "tokens": response.get("metadata", {}).get("tokens_total", 0),
    })
    print(json.dumps(response, indent=2))

except Exception as e:
    mon.log_error(e, context="threat_simulator_inference")
    raise
finally:
    mon.log_complete({"status": "interactive_agent_ready"})
