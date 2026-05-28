# Databricks notebook source
# MAGIC %md
# MAGIC # NOVA Agent: Network Observation & Vulnerability Assessment
# MAGIC **Production InteractiveAgent for Mosaic AI Agent Framework**
# MAGIC
# MAGIC NOVA is a deep investigation specialist that performs hypothesis-driven hunts.
# MAGIC It excels at:
# MAGIC - Hypothesis-driven threat hunting across events
# MAGIC - Kill chain analysis and attack path reconstruction
# MAGIC - Timeline building and pattern correlation
# MAGIC - Investigation narrative generation with confidence scoring
# MAGIC
# MAGIC **Model Serving Endpoint**: Deployed as interactive chat agent
# MAGIC **Investigation Pattern**: Multi-turn tool calling with hypothesis testing

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

from agent_framework import InteractiveAgent, UCTool
import json
import time
import logging

logger = logging.getLogger("oxdsi.nova")

# ──────────────────────────────────────────────────────────────────────
# NOVA Agent Implementation
# ──────────────────────────────────────────────────────────────────────

class NOVAAgent(InteractiveAgent):
    """
    Network Observation & Vulnerability Assessment Agent.

    Specializes in deep investigation through:
    - Event correlation and timeline reconstruction
    - Asset context for targeted systems
    - User behavior analysis for lateral movement detection
    - IOC tracking for attack progression

    Follows kill chain methodology to build coherent attack narratives.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._register_tools()

    def _register_tools(self):
        """Register all tools NOVA uses for investigation."""
        cat, sch = cfg.catalog, cfg.schema

        # Event search for timeline building
        self.register_tool(UCTool(
            name="search_events",
            description="Search raw security events by type, source, destination, and time range. Returns timestamped events for correlation, timeline building, and attack pattern analysis.",
            catalog=cat,
            schema=sch,
            function_name="search_events",
            parameters={
                "type": "object",
                "properties": {
                    "event_type": {
                        "type": "string",
                        "description": "Event type filter (e.g., 'login_success', 'login_failure', 'file_access', 'process_creation', 'network_connection')"
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

        # Asset information for targeted systems
        self.register_tool(UCTool(
            name="get_asset_info",
            description="Retrieve comprehensive asset information including criticality, business owner, network zone, installed software, and recent activity. Use to understand attack targets.",
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

        # IOC lookups for attack progression
        self.register_tool(UCTool(
            name="lookup_ioc",
            description="Look up indicators of compromise (IPs, domains, hashes, URLs) to track malicious infrastructure and payloads used throughout the attack chain.",
            catalog=cat,
            schema=sch,
            function_name="lookup_ioc",
            parameters={
                "type": "object",
                "properties": {
                    "indicator": {
                        "type": "string",
                        "description": "The IOC value (IP, domain, hash, URL, email)"
                    },
                    "indicator_type": {
                        "type": "string",
                        "enum": ["ip", "domain", "hash", "url", "email"],
                        "description": "Type of indicator for classification"
                    },
                },
                "required": ["indicator", "indicator_type"],
            },
        ))

        # User behavior for lateral movement detection
        self.register_tool(UCTool(
            name="query_user_behavior",
            description="Query user behavioral patterns to detect anomalous activity indicating lateral movement, privilege escalation, or insider threats.",
            catalog=cat,
            schema=sch,
            function_name="query_user_behavior",
            parameters={
                "type": "object",
                "properties": {
                    "user_id": {
                        "type": "string",
                        "description": "User identifier (email, username, SID, employee_id)"
                    },
                    "days_back": {
                        "type": "integer",
                        "description": "Days of historical data for baseline comparison (default: 90)"
                    },
                },
                "required": ["user_id"],
            },
        ))

    def get_system_prompt(self) -> str:
        """Return the system prompt for NOVA investigation."""
        return """You are NOVA (Network Observation & Vulnerability Assessment), a senior threat investigation analyst.

Your Role:
You perform deep, hypothesis-driven investigations into potential security incidents. You systematically reconstruct attack timelines, identify kill chain phases, and build coherent narratives connecting disparate events into attack patterns.

Kill Chain Methodology (Guide your investigation):
1. **Reconnaissance**: Initial scanning, information gathering, vulnerability research
2. **Weaponization**: Malware development, exploit development, payload creation
3. **Delivery**: Phishing, watering hole, removable media, supply chain
4. **Exploitation**: CVE exploitation, memory corruption, social engineering success
5. **Installation**: Persistence mechanisms, backdoors, lateral movement
6. **Command & Control**: C2 communication, data exfiltration, remote access
7. **Actions on Objectives**: Data theft, encryption, credential harvesting, destruction

Your Investigation Approach:
1. Start with the triggering event or alert
2. Query for related events in the timeframe (search_events)
3. Build a timeline from earliest to latest
4. Map events to kill chain phases
5. Query IOCs to identify malicious infrastructure (lookup_ioc)
6. Check user behavior for anomalies (query_user_behavior)
7. Get asset context for targeted systems (get_asset_info)
8. Form hypotheses about attack progression
9. Test hypotheses with additional queries
10. Build final narrative connecting all evidence

Investigation Output Structure:
1. **Initial Assessment**: What we're investigating and why
2. **Timeline**: Chronological sequence of events with annotations
3. **Kill Chain Analysis**: Mapping events to kill chain phases
4. **Affected Assets & Users**: Systems and accounts involved
5. **IOCs Identified**: Malicious infrastructure used
6. **Attack Hypothesis**: Your best interpretation of the attack
7. **Confidence**: How confident you are (based on evidence quality)
8. **Evidence Gaps**: What we don't know yet
9. **Recommended Actions**: Investigation steps for SAGE (enrichment) or VANGUARD (response)

Guidelines for Quality Investigations:
- Always build timelines with timestamps
- Look for patterns: multiple failed logins before success, unusual destinations, after-hours activity
- Consider multiple hypotheses and test each one
- Distinguish between confirmed facts and inferences
- Flag critical findings: lateral movement, privilege escalation, data access anomalies
- Consider business context: is this suspicious for this user/system?
- Use kill chain as analytical framework, not prescription
- If gaps exist, be explicit about what queries would help

You have access to UC Function tools for multi-turn investigation. Use them iteratively to build your analysis."""

# ──────────────────────────────────────────────────────────────────────
# Agent Initialization and Testing
# ──────────────────────────────────────────────────────────────────────

# COMMAND ----------

nova = NOVAAgent("nova_investigation", cfg, llm, mon, spark)
logger.info(f"NOVA Agent initialized with {len(nova._tools)} tools")
print(f"✓ NOVA Agent ready with tools: {[t.name for t in nova._tools]}")

# COMMAND ----------

def test_nova_investigation():
    """Test NOVA investigation capability."""
    test_messages = [
        {
            "role": "user",
            "content": """Investigate this incident:

Timeline start: 2024-01-15 02:00 UTC

Alert: Suspicious process execution detected
- Host: db-prod-01 (192.0.2.100)
- User: svc_backup
- Process: powershell.exe with base64 encoded script
- Command: -NoProfile -EncodedCommand <base64 blob>
- Time: 2024-01-15 03:15 UTC

Investigate the full kill chain. Did this compromise other systems?"""
        }
    ]

    response = nova.predict_messages(test_messages)
    print("=" * 80)
    print("NOVA INVESTIGATION RESPONSE")
    print("=" * 80)
    print(response.get("content", "No content"))
    print("\nMetadata:", response.get("metadata"))
    return response

# Uncomment to test in notebook:
# test_response = test_nova_investigation()

# COMMAND ----------

# ──────────────────────────────────────────────────────────────────────
# MLflow Model Logging for Deployment to Model Serving
# ──────────────────────────────────────────────────────────────────────

import mlflow
from mlflow.pyfunc import PythonModel

class NOVAChatModel(PythonModel):
    """MLflow wrapper for NOVA agent for Model Serving deployment."""

    def load_context(self, context):
        """Load the agent and dependencies."""
        self.nova = NOVAAgent("nova_investigation", cfg, llm, mon, spark)

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
            result = self.nova.predict_messages(messages, params)
            return result
        except Exception as e:
            logger.error(f"NOVA prediction error: {e}")
            return {
                "content": f"I encountered an error during investigation: {str(e)[:200]}",
                "metadata": {"error": True, "agent": "nova_investigation"}
            }

# COMMAND ----------

with mlflow.start_run(run_name="nova_investigation_deploy"):
    mlflow.log_params({
        "agent_type": "InteractiveAgent",
        "model_type": "ChatModel",
        "tools_count": len(nova._tools),
        "max_tool_iterations": nova.MAX_TOOL_ITERATIONS,
    })

    mlflow.pyfunc.log_model(
        artifact_path="nova_agent",
        python_model=NOVAChatModel(),
        registered_model_name="0xdsi_nova_investigation",
        input_example={
            "messages": [
                {
                    "role": "user",
                    "content": "Investigate suspicious PowerShell execution on db-prod-01 at 2024-01-15 03:15 UTC"
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
        "tools_count": len(nova._tools),
    })

print("✓ NOVA model logged to MLflow as '0xdsi_nova_investigation'")
print("✓ Ready for deployment to Model Serving via UC Models")

# COMMAND ----------

print(f"Model registered in: {cfg.catalog}.{cfg.schema}.0xdsi_nova_investigation")
print("Next steps: Deploy to endpoint via Databricks Model Serving")
