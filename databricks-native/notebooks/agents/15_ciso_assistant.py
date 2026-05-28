# Databricks notebook source
# MAGIC %md
# MAGIC # CISO Assistant: Chief Information Security Officer AI Advisor
# MAGIC **Production InteractiveAgent for Mosaic AI Agent Framework**
# MAGIC
# MAGIC CISO Assistant is a strategic security advisor for C-level executives.
# MAGIC It excels at:
# MAGIC - Executive security briefings with business context
# MAGIC - Risk posture assessment and compliance guidance
# MAGIC - Strategic threat analysis for board presentations
# MAGIC - Regulatory impact assessment
# MAGIC
# MAGIC **Model Serving Endpoint**: Deployed as interactive chat agent
# MAGIC **Conversation Model**: MLflow ChatModel with executive formatting

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from agent_framework import InteractiveAgent, UCTool
import json
import time
import logging

logger = logging.getLogger("oxdsi.ciso")

# ──────────────────────────────────────────────────────────────────────
# CISO Assistant Agent Implementation
# ──────────────────────────────────────────────────────────────────────

class CISOAssistantAgent(InteractiveAgent):
    """
    Strategic security advisor for C-level executives.

    Specializes in:
    - Executive summaries with business impact focus
    - Risk posture assessments for board consumption
    - Compliance and regulatory guidance
    - Strategic threat analysis
    - Metrics interpretation for non-technical audience

    Translates security technical details into business language.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._register_tools()

    def _register_tools(self):
        """Register all tools CISO Assistant uses for strategic analysis."""
        cat, sch = cfg.catalog, cfg.schema

        # Search events for threat analysis
        self.register_tool(UCTool(
            name="search_events",
            description="Search security events to identify threat patterns, attack trends, and emerging threats affecting the organization.",
            catalog=cat,
            schema=sch,
            function_name="search_events",
            parameters={
                "type": "object",
                "properties": {
                    "event_type": {
                        "type": "string",
                        "description": "Event type filter to focus on specific threat categories"
                    },
                    "source_ip": {
                        "type": "string",
                        "description": "Source IP filter for targeted analysis"
                    },
                    "hours_back": {
                        "type": "integer",
                        "description": "Time window in hours (default: 168 for weekly briefing)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results (default: 50)"
                    },
                },
            },
        ))

        # Get alert context for incident status
        self.register_tool(UCTool(
            name="get_alert_context",
            description="Get full context on active alerts and incidents including severity, scope, and impact.",
            catalog=cat,
            schema=sch,
            function_name="get_alert_context",
            parameters={
                "type": "object",
                "properties": {
                    "alert_id": {
                        "type": "string",
                        "description": "Alert ID to retrieve context"
                    },
                },
                "required": ["alert_id"],
            },
        ))

        # Query user behavior for insider threat assessment
        self.register_tool(UCTool(
            name="query_user_behavior",
            description="Query user activity patterns to assess insider threat risk and privileged user behavior.",
            catalog=cat,
            schema=sch,
            function_name="query_user_behavior",
            parameters={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User identifier (admin account, privileged user)"
                    },
                    "days_back": {
                        "type": "integer",
                        "description": "Days of history for trend analysis (default: 90)"
                    },
                },
                "required": ["user_id"],
            },
        ))

        # Lookup IOCs for threat intelligence
        self.register_tool(UCTool(
            name="lookup_ioc",
            description="Look up indicators to assess if organization has been targeted by known threat actors.",
            catalog=cat,
            schema=sch,
            function_name="lookup_ioc",
            parameters={
                "type": "object",
                "properties": {
                    "indicator": {
                        "type": "string",
                        "description": "IOC value to look up"
                    },
                    "indicator_type": {
                        "type": "string",
                        "enum": ["ip", "domain", "hash", "url", "email"],
                        "description": "Type of indicator"
                    },
                },
                "required": ["indicator", "indicator_type"],
            },
        ))

        # Get asset info for asset security
        self.register_tool(UCTool(
            name="get_asset_info",
            description="Retrieve asset inventory and security status for compliance and risk assessments.",
            catalog=cat,
            schema=sch,
            function_name="get_asset_info",
            parameters={
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "Asset identifier for inventory lookup"
                    },
                },
                "required": ["identifier"],
            },
        ))

    def get_system_prompt(self) -> str:
        """Return the system prompt for CISO executive advisory."""
        return """You are the CISO Assistant, a strategic security advisor for C-level executives.

Your Role:
You translate complex security data into clear, actionable business insights. Your audience:
- CEO: Cares about business impact, brand risk, shareholder value
- CFO: Cares about cost, budget efficiency, ROI on security
- COO: Cares about operational disruption, continuity, incident response time
- Board: Cares about fiduciary duty, compliance, risk management
- General Counsel: Cares about regulatory, legal liability, compliance

Your Communication Style:
- Executive-first language: Business impact before technical details
- Metrics that matter: MTTD, MTTR, incident cost, risk reduction ROI
- Risk framing: Potential business impact in dollars, operational disruption, brand damage
- Compliance focus: Regulatory requirements, audit findings, remediation status
- Clarity first: One key insight per slide/paragraph
- Data-driven: Always cite specific metrics and trends
- Actionable: Specific recommendations with cost/benefit analysis

Key Executive Metrics:
- **Open Critical Alerts**: Number and trend (industry benchmark: < 5 at any time)
- **MTTD (Mean Time to Detect)**: How fast we find incidents (industry: 200+ days, target: < 24h)
- **MTTR (Mean Time to Response)**: How fast we contain (industry: 60+ days, target: < 4h)
- **Risk Score**: 1-100 scale reflecting threat and vulnerability exposure
- **Compliance Status**: % controls effective, remediation schedule
- **Incident Cost**: Average cost per incident (includes downtime, recovery, reputation)
- **Security Investment**: Budget vs. industry peers as % of IT spend

Executive Briefing Structure:
1. **Executive Summary**: One paragraph summarizing security posture (threat level, key changes)
2. **Key Findings**: 3-5 bullet points on most important items (critical alerts, policy breaks, emerging threats)
3. **Risk Assessment**: Current threat level (green/yellow/red) with justification
4. **Trend Analysis**:
   - Alert volume: Up/down/stable (reason?)
   - MTTD/MTTR: Improving/degrading (why?)
   - New threats: What's changed in threat landscape?
5. **Compliance Status**:
   - Active audit findings
   - Remediation status
   - Regulatory deadlines
6. **Board-Level Risks**:
   - Potential business impact of active threats
   - Scenario: If compromise occurs, what's at risk?
   - Mitigation: What will prevent/limit damage?
7. **Recommendations**: Top 3 actions with business justification
8. **Budget Impact**: Investment needed, cost justification, ROI

Guidance for Different Audiences:
**For CEO/Board**: Focus on business impact, brand risk, competitive disadvantage, revenue impact
**For CFO**: Focus on incident cost avoidance, security ROI, compliance fines avoided, insurance implications
**For COO**: Focus on operational risk, incident response time, business continuity, SLA impact
**For General Counsel**: Focus on regulatory compliance, legal liability, audit findings, data privacy

Guidelines:
- Use percentages and trends, not just raw numbers (e.g., "alerts down 15% YoY")
- Compare to industry benchmarks when available
- Flag items that require board-level decisions
- Quantify business impact: "If compromised, X systems affecting Y users would be down Z hours"
- Provide 3-year strategy roadmap, not just current state
- Always include "what if we do nothing" scenario
- Be honest about gaps: "We have no visibility into IoT devices (50+ systems)"

You have access to UC Function tools to query security metrics and threat intelligence. Use them strategically to support your executive recommendations."""

# ──────────────────────────────────────────────────────────────────────
# Agent Initialization and Testing
# ──────────────────────────────────────────────────────────────────────

# COMMAND ----------

ciso = CISOAssistantAgent("ciso_assistant", cfg, llm, mon, spark)
logger.info(f"CISO Assistant initialized with {len(ciso._tools)} tools")
print(f"✓ CISO Assistant ready with tools: {[t.name for t in ciso._tools]}")

# COMMAND ----------

def test_ciso_briefing():
    """Test CISO Assistant with an executive briefing request."""
    test_messages = [
        {
            "role": "user",
            "content": """Prepare an executive briefing for our board meeting:

Key metrics:
- 12 open critical alerts (up from 3 last month)
- MTTD: 18 hours (target: 4 hours)
- MTTR: 8 hours (target: 1 hour)
- 2 suspected APT intrusions confirmed
- 0 confirmed data breaches

What should I tell the board about our security posture?"""
        }
    ]

    response = ciso.predict_messages(test_messages)
    print("=" * 80)
    print("CISO EXECUTIVE BRIEFING")
    print("=" * 80)
    print(response.get("content", "No content"))
    print("\nMetadata:", response.get("metadata"))
    return response

# Uncomment to test in notebook:
# test_response = test_ciso_briefing()

# COMMAND ----------

# ──────────────────────────────────────────────────────────────────────
# MLflow Model Logging for Deployment to Model Serving
# ──────────────────────────────────────────────────────────────────────

import mlflow
from mlflow.pyfunc import PythonModel

class CISOChatModel(PythonModel):
    """MLflow wrapper for CISO Assistant for Model Serving deployment."""

    def load_context(self, context):
        """Load the agent and dependencies."""
        self.ciso = CISOAssistantAgent("ciso_assistant", cfg, llm, mon, spark)

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
            result = self.ciso.predict_messages(messages, params)
            return result
        except Exception as e:
            logger.error(f"CISO Assistant prediction error: {e}")
            return {
                "content": f"I encountered an error generating the briefing: {str(e)[:200]}",
                "metadata": {"error": True, "agent": "ciso_assistant"}
            }

# COMMAND ----------

with mlflow.start_run(run_name="ciso_assistant_deploy"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "model_type": "ChatModel",
        "tools_count": len(ciso._tools),
        "max_tool_iterations": ciso.MAX_TOOL_ITERATIONS,
        "target_audience": "C-level executives",
    })

    mlflow.pyfunc.log_model(
        artifact_path="ciso_agent",
        python_model=CISOChatModel(),
        registered_model_name="0xdsi_ciso_assistant",
        input_example={
            "messages": [
                {
                    "role": "user",
                    "content": "Prepare an executive summary of our security posture for the board"
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
        "tools_count": len(ciso._tools),
    })

print("✓ CISO Assistant model logged to MLflow as '0xdsi_ciso_assistant'")
print("✓ Ready for deployment to Model Serving via UC Models")

# COMMAND ----------

print(f"Model registered in: {cfg.catalog}.{cfg.schema}.0xdsi_ciso_assistant")
print("Next steps: Deploy to endpoint via Databricks Model Serving")
