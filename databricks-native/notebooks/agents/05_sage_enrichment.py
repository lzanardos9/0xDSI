# Databricks notebook source
# MAGIC %md
# MAGIC # SAGE Agent: Security Analytics & Graphical Enrichment
# MAGIC **Production InteractiveAgent for Mosaic AI Agent Framework**
# MAGIC
# MAGIC SAGE is an enrichment specialist that builds comprehensive context around alerts.
# MAGIC It excels at:
# MAGIC - Enriching alerts with threat intelligence
# MAGIC - Building behavioral context from user/asset data
# MAGIC - Generating structured enrichment narratives with risk scoring
# MAGIC - Querying network topology and asset relationships
# MAGIC
# MAGIC **Model Serving Endpoint**: Deployed as interactive chat agent
# MAGIC **Conversation Model**: MLflow ChatModel with multi-turn tool calling

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from agent_framework import InteractiveAgent, UCTool
import json
import time
import logging

logger = logging.getLogger("oxdsi.sage")

# ──────────────────────────────────────────────────────────────────────
# SAGE Agent Implementation
# ──────────────────────────────────────────────────────────────────────

class SAGEAgent(InteractiveAgent):
    """
    Security Analytics & Graphical Enrichment Agent.

    Specializes in building rich context around alerts through:
    - Threat intelligence lookups (IOC correlation)
    - Asset information (criticality, owner, zone)
    - User behavior analysis (baseline comparison)
    - Event search (pattern detection)

    Each enrichment is tied to a risk score and confidence level.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._register_tools()

    def _register_tools(self):
        """Register all tools SAGE uses for enrichment."""
        cat, sch = cfg.catalog, cfg.schema

        # Threat intelligence lookup
        self.register_tool(UCTool(
            name="lookup_ioc",
            description="Look up an Indicator of Compromise (IP, domain, hash, URL, email) against threat intelligence feeds and internal blacklists. Returns reputation score, threat tags, and source feeds.",
            catalog=cat,
            schema=sch,
            function_name="lookup_ioc",
            parameters={
                "type": "object",
                "properties": {
                    "indicator": {
                        "type": "string",
                        "description": "The IOC value (IP address, domain, hash, URL, or email)"
                    },
                    "indicator_type": {
                        "type": "string",
                        "enum": ["ip", "domain", "hash", "url", "email"],
                        "description": "Type of indicator for proper categorization"
                    },
                },
                "required": ["indicator", "indicator_type"],
            },
        ))

        # Asset information
        self.register_tool(UCTool(
            name="get_asset_info",
            description="Retrieve comprehensive asset information including criticality tier, business owner, network zone (DMZ/internal/cloud), patch status, and last seen timestamp. Useful for context building.",
            catalog=cat,
            schema=sch,
            function_name="get_asset_info",
            parameters={
                "type": "object",
                "properties": {
                    "identifier": {
                        "type": "string",
                        "description": "Asset identifier: IP address, hostname, FQDN, or asset ID"
                    },
                },
                "required": ["identifier"],
            },
        ))

        # User behavior baseline
        self.register_tool(UCTool(
            name="query_user_behavior",
            description="Query user behavioral baseline including typical login hours, geographic patterns, device types, and access patterns. Compare recent activity against baseline to detect anomalies.",
            catalog=cat,
            schema=sch,
            function_name="query_user_behavior",
            parameters={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User identifier (email, username, employee_id)"
                    },
                    "days_back": {
                        "type": "integer",
                        "description": "Number of days of historical baseline data to fetch (default: 90)"
                    },
                },
                "required": ["user_id"],
            },
        ))

        # Event search
        self.register_tool(UCTool(
            name="search_events",
            description="Search raw security events by type, source IP, time range, and other filters. Returns event details for correlation and timeline building.",
            catalog=cat,
            schema=sch,
            function_name="search_events",
            parameters={
                "type": "object",
                "properties": {
                    "event_type": {
                        "type": "string",
                        "description": "Event type filter (e.g., 'login_success', 'login_failure', 'file_access', 'network_traffic')"
                    },
                    "source_ip": {
                        "type": "string",
                        "description": "Filter by source IP address"
                    },
                    "hours_back": {
                        "type": "integer",
                        "description": "Time window in hours (default: 24)"
                    },
                    "limit": {
                        "type": "integer",
                        "description": "Maximum number of results to return (default: 50, max: 500)"
                    },
                },
            },
        ))

    def get_system_prompt(self) -> str:
        """Return the system prompt for SAGE enrichment analysis."""
        return """You are SAGE (Security Analytics & Graphical Enrichment), an expert security enrichment analyst.

Your Role:
You specialize in building comprehensive context around security alerts and incidents. When given an alert or security event, you systematically:
1. Enrich with threat intelligence (IOC lookups for IPs, domains, hashes)
2. Gather asset context (criticality, owner, network zone, patch status)
3. Analyze user behavior (baseline comparison, anomaly detection)
4. Search for related events (patterns, correlations, timeline building)

Your Approach:
- Start with what we know about the alert itself
- Query IOCs (IPs, domains, URLs, hashes) against threat feeds
- Get asset info for source and destination resources
- Check user behavioral baselines for anomalies
- Search for related events in the time window
- Build a coherent enrichment narrative with risk scoring

Output Structure:
Always structure your enrichment analysis as:
1. **Alert Summary**: What triggered
2. **Threat Intelligence**: IOC reputation, threat tags, source feeds
3. **Asset Context**: Criticality, owner, zone, last activity
4. **User Behavior**: Baseline analysis, anomaly indicators
5. **Related Events**: Event patterns, timeline, correlations
6. **Risk Score**: 1-100 based on threat intel, asset criticality, anomalies
7. **Confidence**: Your confidence in this assessment (High/Medium/Low)
8. **Recommended Next Steps**: Actions for NOVA (investigation) or VANGUARD (response)

Guidelines:
- Always query IOCs when you have indicators (IPs, domains, URLs)
- Compare user activity against behavioral baselines
- Look for patterns that indicate reconnaissance or lateral movement
- Consider asset criticality when scoring risk
- If you can't find data, acknowledge the limitation and suggest alternate approaches
- Be precise about what you found vs. what you inferred
- Flag high-risk scenarios (critical asset involved, insider threat indicators, etc.)

You have access to UC Function tools for enrichment. Use them systematically to build comprehensive context."""

# ──────────────────────────────────────────────────────────────────────
# Agent Initialization and Testing
# ──────────────────────────────────────────────────────────────────────

# COMMAND ----------

sage = SAGEAgent("sage_enrichment", cfg, llm, mon, spark)
logger.info(f"SAGE Agent initialized with {len(sage._tools)} tools")
print(f"✓ SAGE Agent ready with tools: {[t.name for t in sage._tools]}")

# COMMAND ----------

def test_sage_enrichment():
    """Test SAGE enrichment capability with a sample enrichment request."""
    test_messages = [
        {
            "role": "user",
            "content": """Enrich this alert for me:

Alert: Unusual login detected
- Source IP: 192.0.2.42
- User: alice@company.com
- Time: 2024-01-15 03:15 UTC
- Location: Shanghai (VPN terminated)
- Device: New Chrome browser (never seen before)

Please provide full enrichment with risk scoring."""
        }
    ]

    response = sage.predict_messages(test_messages)
    print("=" * 80)
    print("SAGE ENRICHMENT RESPONSE")
    print("=" * 80)
    print(response.get("content", "No content"))
    print("\nMetadata:", response.get("metadata"))
    return response

# Uncomment to test in notebook:
# test_response = test_sage_enrichment()

# COMMAND ----------

# ──────────────────────────────────────────────────────────────────────
# MLflow Model Logging for Deployment to Model Serving
# ──────────────────────────────────────────────────────────────────────

import mlflow
from mlflow.pyfunc import PythonModel

class SAGEChatModel(PythonModel):
    """MLflow wrapper for SAGE agent for Model Serving deployment."""

    def load_context(self, context):
        """Load the agent and dependencies."""
        self.sage = SAGEAgent("sage_enrichment", cfg, llm, mon, spark)

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
            result = self.sage.predict_messages(messages, params)
            return result
        except Exception as e:
            logger.error(f"SAGE prediction error: {e}")
            return {
                "content": f"I encountered an error during enrichment: {str(e)[:200]}",
                "metadata": {"error": True, "agent": "sage_enrichment"}
            }

# COMMAND ----------

with mlflow.start_run(run_name="sage_enrichment_deploy"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "model_type": "ChatModel",
        "tools_count": len(sage._tools),
        "max_tool_iterations": sage.MAX_TOOL_ITERATIONS,
    })

    mlflow.pyfunc.log_model(
        artifact_path="sage_agent",
        python_model=SAGEChatModel(),
        registered_model_name="0xdsi_sage_enrichment",
        input_example={
            "messages": [
                {
                    "role": "user",
                    "content": "Enrich this alert: Source IP 192.0.2.42, User alice@company.com, unusual login"
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
        "tools_count": len(sage._tools),
    })

print("✓ SAGE model logged to MLflow as '0xdsi_sage_enrichment'")
print("✓ Ready for deployment to Model Serving via UC Models")

# COMMAND ----------

print(f"Model registered in: {cfg.catalog}.{cfg.schema}.0xdsi_sage_enrichment")
print("Next steps: Deploy to endpoint via Databricks Model Serving")
