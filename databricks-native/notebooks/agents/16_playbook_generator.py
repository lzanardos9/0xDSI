# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 16 - Playbook Generator
# MAGIC AI Playbook Generator using Mosaic AI Agent Framework.
# MAGIC Creates incident response playbooks on demand with step-by-step procedures,
# MAGIC decision trees, and SOAR-compatible output.

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

import json
import time
import logging
from datetime import datetime
from typing import Optional
from databricks.sdk.service.jobs import RunLifecycleState

# Import agent framework classes
from agent_framework import (
    InteractiveAgent,
    AgentResult,
    AgentStatus,
    UCTool,
    create_soc_tools,
)

logger = logging.getLogger("oxdsi.playbook_generator")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

PLAYBOOKS_TABLE = cfg.get_table_path("generated_playbooks")
MAX_PLAYBOOKS_PER_SESSION = 5

# Supported playbook types
SUPPORTED_PLAYBOOKS = [
    "ransomware",
    "phishing",
    "data_exfil",
    "insider_threat",
    "ddos",
    "supply_chain",
]

# COMMAND ----------

# MAGIC %md
# MAGIC ## Playbook Generator Agent Implementation

# COMMAND ----------

class PlaybookGeneratorAgent(InteractiveAgent):
    """
    AI Playbook Generator that creates incident response playbooks on demand.
    Generates SOAR-compatible playbooks with decision trees and automation hooks.
    """

    def get_system_prompt(self) -> str:
        """Return the system prompt for the playbook generator."""
        return f"""You are an expert incident response playbook author specializing in creating
structured, step-by-step response procedures for security incidents.

Your role:
1. Understand the incident type and context
2. Create comprehensive playbooks with clear steps, decision points, and automation hooks
3. Format all playbooks as structured JSON with proper hierarchy
4. Ensure playbooks are SOAR-compatible and immediately executable

Supported incident types: {', '.join(SUPPORTED_PLAYBOOKS)}

When generating a playbook, always include:
- Clear step-by-step procedures (enrich → investigate → contain → eradicate → recover)
- Decision points with branching logic
- Automation hooks for SOAR/orchestration platforms
- Escalation criteria and thresholds
- Success/failure conditions

Think like a seasoned incident commander creating procedures your team will execute under pressure.
Make every step clear, actionable, and testable."""

    def get_tools(self) -> list[UCTool]:
        """Define playbook-generator-specific tools."""
        tools = create_soc_tools(cfg)

        # Filter to relevant tools for playbook generation
        relevant_tools = [t for t in tools if t.name in [
            "search_events",
            "get_alert_context",
            "get_asset_info",
        ]]
        return relevant_tools

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialize Agent

# COMMAND ----------

# Initialize MLflow experiment tracking for this agent
import mlflow
mlflow.set_experiment(f"/0xDSI/agents/playbook_generator")

# Create agent instance
agent = PlaybookGeneratorAgent(
    agent_name="playbook_generator",
    cfg=cfg,
    llm=llm,
    mon=mon,
    spark=spark,
)

# Register tools
for tool in agent.get_tools():
    agent.register_tool(tool)

mon.log_event("playbook_generator_initialized", {
    "tools_registered": len(agent._tools),
    "supported_types": len(SUPPORTED_PLAYBOOKS),
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generate Playbook Function

# COMMAND ----------

def generate_playbook(incident_type: str, context: Optional[str] = None) -> dict:
    """
    Generate a playbook for a given incident type.

    Args:
        incident_type: Type of incident (ransomware, phishing, etc.)
        context: Optional additional context about the incident

    Returns:
        Generated playbook as structured dict
    """
    if incident_type not in SUPPORTED_PLAYBOOKS:
        return {
            "error": f"Unsupported incident type: {incident_type}",
            "supported": SUPPORTED_PLAYBOOKS,
        }

    # Build user prompt
    user_prompt = f"""Generate a detailed incident response playbook for: {incident_type.upper()}

Incident Type: {incident_type}
"""
    if context:
        user_prompt += f"Additional Context: {context}\n"

    user_prompt += """
Return a JSON object with EXACTLY this structure:
{
  "playbook_id": "PB-<incident_type>-<timestamp>",
  "incident_type": "<incident type>",
  "playbook_name": "<descriptive name>",
  "description": "<2-3 sentence overview>",
  "severity_levels": ["critical", "high", "medium"],
  "steps": [
    {
      "order": <int>,
      "phase": "enrich|investigate|contain|eradicate|recover",
      "action": "<clear action description>",
      "type": "automated|manual|decision",
      "tools": ["<tool names>"],
      "success_criteria": "<how to know this step succeeded>",
      "timeout_minutes": <int>,
      "next_step": <int or null>,
      "branch_conditions": [
        {
          "condition": "<if condition>",
          "jump_to_step": <int>
        }
      ]
    }
  ],
  "decision_points": [
    {
      "order": <int>,
      "question": "<decision to make>",
      "options": [
        {
          "option": "<option text>",
          "action": "<what to do>",
          "severity_impact": "escalate|mitigate|resolve"
        }
      ]
    }
  ],
  "automation_hooks": [
    {
      "trigger": "<trigger condition>",
      "action_type": "block_ip|disable_user|isolate_host|quarantine_file|revoke_token",
      "target": "<target of automation>",
      "requires_approval": true|false
    }
  ],
  "escalation": {
    "criteria": "<when to escalate>",
    "escalate_to": "tier2|tier3|ciso|board",
    "timeout_minutes": <int>
  },
  "success_criteria": "<how to know the incident is resolved>",
  "communication_template": "<template for incident communications>",
  "post_incident_review": "<key items for retrospective>"
}"""

    try:
        # Call agent's predict_messages with the user prompt
        response = agent.predict_messages(
            messages=[{"role": "user", "content": user_prompt}],
            params={"temperature": 0.3, "max_tokens": 8192},
        )

        # Extract JSON from response
        content = response.get("content", "")

        # Try to parse JSON from response
        try:
            # Look for JSON block
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0].strip()
            elif "{" in content:
                start_idx = content.find("{")
                end_idx = content.rfind("}") + 1
                json_str = content[start_idx:end_idx]
            else:
                json_str = content

            playbook = json.loads(json_str)

            # Add metadata
            playbook["generated_at"] = datetime.utcnow().isoformat()
            playbook["agent"] = "playbook_generator"
            playbook["status"] = "draft"
            playbook["version"] = 1

            # Log successful generation
            mon.log_event("playbook_generated", {
                "incident_type": incident_type,
                "steps": len(playbook.get("steps", [])),
                "automation_hooks": len(playbook.get("automation_hooks", [])),
            })

            return playbook
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse playbook JSON: {e}")
            return {
                "error": "Failed to parse generated playbook",
                "raw_content": content[:1000],
            }

    except Exception as e:
        error_msg = f"Playbook generation failed: {str(e)}"
        mon.log_event("playbook_generation_error", {
            "incident_type": incident_type,
            "error": error_msg,
        })
        logger.error(error_msg)
        return {"error": error_msg}

# COMMAND ----------

# MAGIC %md
# MAGIC ## Interactive Interface

# COMMAND ----------

# For development/testing - demonstrate the agent in action
if dbutils.widgets.get("incident_type"):
    requested_type = dbutils.widgets.get("incident_type")
    context = dbutils.widgets.get("context", "")

    print(f"\n{'='*60}")
    print(f"Generating playbook for: {requested_type}")
    print(f"{'='*60}\n")

    start_time = time.time()
    result = generate_playbook(requested_type, context or None)
    duration = time.time() - start_time

    if "error" not in result:
        print(f"✓ Playbook generated in {duration:.2f}s")
        print(f"\nPlaybook Structure:")
        print(f"  ID: {result.get('playbook_id')}")
        print(f"  Name: {result.get('playbook_name')}")
        print(f"  Steps: {len(result.get('steps', []))}")
        print(f"  Decision Points: {len(result.get('decision_points', []))}")
        print(f"  Automation Hooks: {len(result.get('automation_hooks', []))}")
        print(f"\nFull playbook (JSON):")
        print(json.dumps(result, indent=2))
    else:
        print(f"✗ Error: {result.get('error')}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## MLflow Experiment Tracking

# COMMAND ----------

# Log agent metadata to MLflow for model registry
with mlflow.start_run(run_name=f"playbook_generator_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "supported_incident_types": len(SUPPORTED_PLAYBOOKS),
        "max_playbooks_per_session": MAX_PLAYBOOKS_PER_SESSION,
    })

    mlflow.log_metrics({
        "tools_registered": len(agent._tools),
        "temperature": 0.3,
    })

    # Log artifact with supported playbook types
    mlflow.log_dict({
        "supported_playbooks": SUPPORTED_PLAYBOOKS,
        "agent_name": "playbook_generator",
        "description": "AI Playbook Generator for incident response",
    }, artifact_file="playbook_generator_config.json")

print("Playbook Generator Agent initialized and ready.")
print(f"Supported incident types: {', '.join(SUPPORTED_PLAYBOOKS)}")
print(f"Registered tools: {[t.name for t in agent._tools]}")
