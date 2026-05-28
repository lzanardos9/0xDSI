# Databricks notebook source
# MAGIC %md
# MAGIC # VANGUARD Agent: Vigilant Automated Network Guard & Unified Automated Response & Defense
# MAGIC **Production InteractiveAgent for Mosaic AI Agent Framework**
# MAGIC
# MAGIC VANGUARD is a response orchestrator that recommends and executes containment/remediation.
# MAGIC It excels at:
# MAGIC - Evaluating response actions with confidence scoring
# MAGIC - Deciding between auto-response and human escalation
# MAGIC - Creating audit trails for all actions
# MAGIC - Chain of custody tracking for forensic integrity
# MAGIC
# MAGIC **Model Serving Endpoint**: Deployed as interactive chat agent
# MAGIC **Response Pattern**: Multi-turn decision-making with confidence thresholds

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from agent_framework import InteractiveAgent, UCTool
import json
import time
import logging

logger = logging.getLogger("oxdsi.vanguard")

# ──────────────────────────────────────────────────────────────────────
# VANGUARD Agent Implementation
# ──────────────────────────────────────────────────────────────────────

class VANGUARDAgent(InteractiveAgent):
    """
    Response orchestrator for automated and human-approved security actions.

    Specializes in:
    - Recommending response actions based on threat severity
    - Executing high-confidence automated responses
    - Escalating uncertain actions for human review
    - Creating audit trails with chain of custody
    - Tracking response effectiveness

    Uses confidence thresholds:
    - > 0.90: Auto-execute containment
    - 0.70-0.90: Require human approval
    - < 0.70: Reject or require investigation
    """

    # Confidence thresholds for automated decision-making
    THRESHOLD_AUTO_EXECUTE = 0.90
    THRESHOLD_APPROVAL_REQUIRED = 0.70

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._register_tools()

    def _register_tools(self):
        """Register all tools VANGUARD uses for response."""
        cat, sch = cfg.catalog, cfg.schema

        # Execute response actions
        self.register_tool(UCTool(
            name="execute_response_action",
            description="Execute a containment or remediation action: block IP, disable user account, isolate host, quarantine file, or revoke token. Requires justification and can auto-approve for high-confidence threats.",
            catalog=cat,
            schema=sch,
            function_name="execute_response_action",
            parameters={
                "type": "object",
                "properties": {
                    "action_type": {
                        "type": "string",
                        "enum": ["block_ip", "disable_user", "isolate_host", "quarantine_file", "revoke_token"],
                        "description": "Type of response action to execute"
                    },
                    "target": {
                        "type": "string",
                        "description": "Target of the action (IP, username, hostname, file_hash, token_id)"
                    },
                    "reason": {
                        "type": "string",
                        "description": "Justification for the action with reference to threat intel and analysis"
                    },
                    "auto_approve": {
                        "type": "boolean",
                        "description": "If true, execute immediately without human approval (confidence >= 0.90)"
                    },
                },
                "required": ["action_type", "target", "reason"],
            },
        ))

        # Get alert context for decisions
        self.register_tool(UCTool(
            name="get_alert_context",
            description="Get full context for an alert including related events, assets, users, and previous actions. Use to inform response decisions.",
            catalog=cat,
            schema=sch,
            function_name="get_alert_context",
            parameters={
                "type": "object",
                "properties": {
                    "alert_id": {
                        "type": "string",
                        "description": "The alert ID to get context for"
                    },
                },
                "required": ["alert_id"],
            },
        ))

        # Get asset info for impact assessment
        self.register_tool(UCTool(
            name="get_asset_info",
            description="Retrieve asset information to assess business impact of response actions (criticality, owner, services running, customer-facing).",
            catalog=cat,
            schema=sch,
            function_name="get_asset_info",
            parameters={
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "Asset identifier: IP, hostname, or asset ID"
                    },
                },
                "required": ["identifier"],
            },
        ))

        # Create investigation cases
        self.register_tool(UCTool(
            name="create_case",
            description="Create a new incident case from alerts or findings. Use for tracking investigation and response activities.",
            catalog=cat,
            schema=sch,
            function_name="create_case",
            parameters={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "Case title summarizing the incident"
                    },
                    "severity": {
                        "type": "string",
                        "enum": ["critical", "high", "medium", "low"],
                        "description": "Incident severity level"
                    },
                    "alert_ids": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of related alert IDs"
                    },
                    "description": {
                        "type": "string",
                        "description": "Detailed incident description with context"
                    },
                },
                "required": ["title", "severity"],
            },
        ))

    def get_system_prompt(self) -> str:
        """Return the system prompt for VANGUARD response orchestration."""
        return """You are VANGUARD (Vigilant Automated Network Guard & Unified Automated Response & Defense), a response orchestrator.

Your Role:
You make rapid, evidence-based decisions about security response actions. Your goal is to:
1. Contain active threats quickly
2. Prevent escalation and lateral movement
3. Maintain business continuity
4. Create audit trails for compliance

Your Decision Framework:
For each potential response action, evaluate:
- **Threat Certainty**: How confident are we this is a real threat? (0-100%)
- **Reversibility**: Can this action be undone? (yes/no/partial)
- **Business Impact**: How many users/systems affected? (low/medium/high)
- **Scope**: Is this targeted or broad? (single host/department/enterprise)
- **Urgency**: How fast must we act? (immediate/urgent/planned)

Confidence Thresholds:
- **> 0.90**: Auto-execute containment (you have my authority)
- **0.70-0.90**: Require human approval (escalate to SOC manager)
- **< 0.70**: Reject or require further investigation

Response Action Types:
1. **block_ip**: Blacklist an IP at firewall/proxy (reversible)
2. **disable_user**: Disable account (reversible)
3. **isolate_host**: Network isolation, quarantine host (reversible)
4. **quarantine_file**: Isolate suspicious file (reversible)
5. **revoke_token**: Invalidate session/API token (reversible)

Your Response Process:
1. Understand the threat: get_alert_context to review incident
2. Assess impact: get_asset_info on affected resources
3. Decide action: evaluate certainty, reversibility, impact
4. Score confidence: provide 0-1.0 confidence score
5. Recommend decision: auto-execute, approval_required, or reject
6. Create audit record: document decision rationale
7. Track outcome: log action execution status

Response Output Structure:
1. **Threat Assessment**: Summary of what we're responding to
2. **Action Recommendation**: What should be done (block_ip, disable_user, etc.)
3. **Target**: Specific IP, username, hostname, etc.
4. **Justification**: Why this action is appropriate
5. **Business Impact**: Expected impact on operations
6. **Reversibility**: Can it be undone?
7. **Confidence Score**: 0-1.0 (auto-execute if > 0.90)
8. **Decision**: auto_execute, require_approval, or reject
9. **Audit Trail**: Action ID, timestamp, reasoning

Guidelines for Safe Responses:
- Prefer narrowly scoped actions (single host) over broad (network)
- Consider time of day (business hours vs. off-hours)
- Account for known maintenance windows
- If uncertain, escalate rather than risk false positives
- Document all actions with full justification
- Report on action effectiveness to SOC leadership
- Review failed actions to refine decision logic

You have UC Function tools for executing and tracking responses. Use them to implement decisions safely."""

# ──────────────────────────────────────────────────────────────────────
# Agent Initialization and Testing
# ──────────────────────────────────────────────────────────────────────

# COMMAND ----------

vanguard = VANGUARDAgent("vanguard_response", cfg, llm, mon, spark)
logger.info(f"VANGUARD Agent initialized with {len(vanguard._tools)} tools")
print(f"✓ VANGUARD Agent ready with tools: {[t.name for t in vanguard._tools]}")

# COMMAND ----------

def test_vanguard_response():
    """Test VANGUARD response capability."""
    test_messages = [
        {
            "role": "user",
            "content": """Recommend a response for this threat:

Alert: Confirmed ransomware C2 communication detected
- Threat: GPO ransomware variant (95% confidence)
- Source IP: 203.0.113.45 (known C2 server in Russia)
- Affected Host: file-server-prod-03 (critical asset, 500+ users)
- Time: 2024-01-15 14:30 UTC
- Status: Active communication ongoing

Should we block this IP? What's your confidence?"""
        }
    ]

    response = vanguard.predict_messages(test_messages)
    print("=" * 80)
    print("VANGUARD RESPONSE")
    print("=" * 80)
    print(response.get("content", "No content"))
    print("\nMetadata:", response.get("metadata"))
    return response

# Uncomment to test in notebook:
# test_response = test_vanguard_response()

# COMMAND ----------

# ──────────────────────────────────────────────────────────────────────
# MLflow Model Logging for Deployment to Model Serving
# ──────────────────────────────────────────────────────────────────────

import mlflow
from mlflow.pyfunc import PythonModel

class VANGUARDChatModel(PythonModel):
    """MLflow wrapper for VANGUARD agent for Model Serving deployment."""

    def load_context(self, context):
        """Load the agent and dependencies."""
        self.vanguard = VANGUARDAgent("vanguard_response", cfg, llm, mon, spark)

    def predict(self, context, model_input):
        """
        Predict method called by Model Serving.

        Args:
            model_input: dict with 'messages' key containing conversation history

        Returns:
            dict with 'content', 'tool_calls', and 'metadata'
        """
        messages = model_input.get("messages", [])
        params = model_input.get("params", {})

        try:
            result = self.vanguard.predict_messages(messages, params)
            return result
        except Exception as e:
            logger.error(f"VANGUARD prediction error: {e}")
            return {
                "content": f"I encountered an error during response evaluation: {str(e)[:200]}",
                "metadata": {"error": True, "agent": "vanguard_response"}
            }

# COMMAND ----------

with mlflow.start_run(run_name="vanguard_response_deploy"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "model_type": "ChatModel",
        "tools_count": len(vanguard._tools),
        "max_tool_iterations": vanguard.MAX_TOOL_ITERATIONS,
        "threshold_auto_execute": vanguard.THRESHOLD_AUTO_EXECUTE,
        "threshold_approval_required": vanguard.THRESHOLD_APPROVAL_REQUIRED,
    })

    mlflow.pyfunc.log_model(
        artifact_path="vanguard_agent",
        python_model=VANGUARDChatModel(),
        registered_model_name="0xdsi_vanguard_response",
        input_example={
            "messages": [
                {
                    "role": "user",
                    "content": "Recommend a response for confirmed C2 communication from file-server-prod-03 to Russian IP 203.0.113.45"
                }
            ]
        },
        pip_requirements=[
            "databricks-sdk>=0.20.0",
            "mlflow>=2.10.0",
        ],
    )

    mlflow.log_metrics({
        "timestamp": time.time(),
        "tools_count": len(vanguard._tools),
    })

print("✓ VANGUARD model logged to MLflow as '0xdsi_vanguard_response'")
print("✓ Ready for deployment to Model Serving via UC Models")

# COMMAND ----------

print(f"Model registered in: {cfg.catalog}.{cfg.schema}.0xdsi_vanguard_response")
print("Next steps: Deploy to endpoint via Databricks Model Serving")
