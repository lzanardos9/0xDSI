# Databricks notebook source
# MAGIC %md
# MAGIC # Agent 31: Vibe Connector Builder Agent
# MAGIC
# MAGIC **Production-Grade InteractiveAgent Implementation**
# MAGIC
# MAGIC Generates data connector code from natural language descriptions.
# MAGIC Expert data integration engineer that supports REST APIs, databases,
# MAGIC file systems, message queues, and cloud services.
# MAGIC
# MAGIC ## Key Features
# MAGIC - Natural language to connector code generation
# MAGIC - Support for multiple connector types
# MAGIC - Configuration and schema validation
# MAGIC - MLflow experiment tracking
# MAGIC - UC Function tool registration (search_events)
# MAGIC - Returns structured code, config, schema, and validation rules

# COMMAND ----------

# MAGIC %run ../_shared/bootstrap

# COMMAND ----------

# MAGIC %md
# MAGIC ## Initialization and Configuration

# COMMAND ----------

from agent_framework import (
    InteractiveAgent, AgentResult, AgentStatus, UCTool, create_soc_tools
)
import mlflow
import mlflow.tracing
from pyspark.sql.functions import *
from pyspark.sql.types import *
import json
import time
import logging
from datetime import datetime

logger = logging.getLogger("oxdsi.connector_builder_agent")

mon.log_event("connector_builder_config_loaded", {
    "agent_type": "interactive",
    "supported_types": ["rest_api", "database", "s3", "kafka", "elasticsearch", "snowflake", "webhook"],
})

# COMMAND ----------

# MAGIC %md
# MAGIC ## Define VibeConnectorBuilderAgent Class

# COMMAND ----------

class VibeConnectorBuilderAgent(InteractiveAgent):
    """
    Interactive agent that generates data connector code from natural language.

    Workflow:
    1. User describes data source in natural language
    2. Agent asks clarifying questions if needed
    3. Agent generates connector code, configuration, and validation rules
    4. Returns structured output with all artifacts

    Supported connector types:
    - REST APIs (with auth, pagination, rate limiting)
    - Databases (SQL, NoSQL)
    - File systems (S3, GCS, local)
    - Message queues (Kafka, Pub/Sub)
    - Search/analytics (Elasticsearch, Splunk)
    - Cloud services (Snowflake, BigQuery)
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._generated_code = None
        self._generated_config = None

        # Register UC tools
        soc_tools = create_soc_tools(cfg)
        for tool in soc_tools:
            if tool.name == "search_events":
                self.register_tool(tool)

    def get_system_prompt(self) -> str:
        """Return the expert data integration engineer system prompt."""
        return """You are an expert data integration engineer with deep knowledge of:
- REST API design and authentication (OAuth2, API keys, JWT)
- Database connectors (SQL, NoSQL, graph databases)
- Cloud storage integration (S3, GCS, Azure Blob)
- Event streaming (Kafka, Pub/Sub, Kinesis)
- Data transformation and schema mapping
- Error handling and retry strategies
- Security best practices and data validation

When a user describes a data source:

1. Ask clarifying questions if needed about:
   - Authentication requirements
   - Data format and schema
   - Update frequency and volume
   - Network accessibility
   - Performance requirements

2. Generate production-grade connector code including:
   - Proper error handling
   - Retry logic with exponential backoff
   - Connection pooling
   - Rate limiting compliance
   - Data validation
   - Logging and monitoring

3. Provide configuration template with:
   - All required parameters
   - Optional parameters with defaults
   - Environment variable examples
   - Security considerations

4. Include schema mapping showing:
   - Source field names and types
   - Target field mapping
   - Transformations applied
   - Null handling strategy

5. Suggest validation rules for:
   - Input data validation
   - Output data quality checks
   - Connection health checks

Always return structured JSON with: code, config_template, schema_mapping, validation_rules, connector_type"""

    def predict_messages(self, messages: list[dict], params: dict = None) -> dict:
        """
        Generate connector code from natural language description.

        Args:
            messages: Conversation history
            params: Optional temperature, max_tokens

        Returns:
            Structured output with generated code and configuration
        """
        self._init_tracing()
        self._start_time = time.time()
        params = params or {}

        # System setup
        system_prompt = self.get_system_prompt()
        temperature = params.get("temperature", 0.2)
        max_tokens = params.get("max_tokens", 8000)

        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        iteration = 0
        max_iterations = 5

        while iteration < max_iterations:
            iteration += 1
            span = self._start_trace(f"generation_turn_{iteration}")

            try:
                response = self.llm.chat_multi_turn(
                    messages=full_messages,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    tools=self.tool_definitions if self._tools else None,
                )

                # If no tool calls, we have final response
                if not response.tool_calls:
                    self._end_trace(span, {"final_turn": iteration})

                    # Parse structured output
                    result = self._parse_connector_output(response.content)

                    return {
                        "content": response.content,
                        "structured_output": result,
                        "metadata": {
                            "agent": self.agent_name,
                            "turns": iteration,
                            "tokens_total": response.tokens_total,
                            "latency_ms": (time.time() - self._start_time) * 1000,
                            "model": response.model,
                        },
                    }

                # Handle tool calls for search_events (context gathering)
                full_messages.append({
                    "role": "assistant",
                    "content": response.content or "",
                    "tool_calls": [
                        {"id": tc["id"], "type": "function", "function": {"name": tc["name"], "arguments": json.dumps(tc["arguments"])}}
                        for tc in response.tool_calls
                    ],
                })

                for tc in response.tool_calls:
                    tool_result = self._execute_tool_call(tc)
                    full_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": json.dumps(tool_result) if isinstance(tool_result, dict) else str(tool_result),
                    })

                self._end_trace(span, {"tool_calls": len(response.tool_calls)})

            except Exception as e:
                logger.exception(f"Error in generation turn {iteration}: {e}")
                self._end_trace(span, {"error": str(e)[:200]})
                break

        return {
            "content": "Unable to generate connector code. Please try again with more specific details.",
            "metadata": {
                "agent": self.agent_name,
                "turns": iteration,
                "error": "Max iterations reached",
            },
        }

    def _parse_connector_output(self, response_text):
        """Extract structured connector output from LLM response."""
        result = {
            "code": "",
            "config_template": {},
            "schema_mapping": [],
            "validation_rules": [],
            "connector_type": "unknown",
        }

        try:
            # Try to extract JSON from response
            if "```json" in response_text:
                json_start = response_text.find("```json") + 7
                json_end = response_text.find("```", json_start)
                json_str = response_text[json_start:json_end].strip()
                parsed = json.loads(json_str)
                result.update(parsed)
            elif "{" in response_text:
                # Try to extract JSON object
                json_start = response_text.find("{")
                json_end = response_text.rfind("}") + 1
                if json_start < json_end:
                    json_str = response_text[json_start:json_end]
                    parsed = json.loads(json_str)
                    result.update(parsed)
        except Exception as e:
            logger.warning(f"Failed to parse JSON from response: {e}")
            # Fall back to extracting code sections
            if "```python" in response_text:
                code_start = response_text.find("```python") + 9
                code_end = response_text.find("```", code_start)
                if code_end > code_start:
                    result["code"] = response_text[code_start:code_end].strip()

        return result

    def _execute_tool_call(self, tool_call: dict) -> dict:
        """Execute tool calls (primarily search_events for context)."""
        tool_name = tool_call["name"]
        arguments = tool_call.get("arguments", {})

        if tool_name == "search_events":
            # Use search_events to gather example data format
            try:
                query = arguments.get("event_type", "")
                limit = arguments.get("limit", 5)

                # Query example events to understand data structure
                events_table = get_table_path(cfg, "raw_events")
                df = spark.sql(f"""
                    SELECT * FROM {events_table}
                    WHERE event_type LIKE '%{query}%'
                    LIMIT {limit}
                """)

                if df.count() > 0:
                    examples = df.limit(3).toPandas().to_dict('records')
                    return {
                        "event_type": query,
                        "sample_count": df.count(),
                        "example_records": examples,
                        "schema": [{"name": f.name, "type": str(f.dataType)} for f in df.schema.fields],
                    }
            except Exception as e:
                logger.warning(f"search_events tool failed: {e}")

        return {"error": f"Unknown tool: {tool_name}"}

    def _generate_rest_api_code(self, url, auth_type, method="GET"):
        """Generate code for REST API connector."""
        return f'''import requests
import json
import time
from typing import List, Dict, Any
import logging

logger = logging.getLogger(__name__)

class RESTConnector:
    def __init__(self, base_url: str, api_key: str, timeout: int = 30):
        self.base_url = base_url
        self.api_key = api_key
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({{"Authorization": f"Bearer {{api_key}}"}})

    def fetch(self, endpoint: str, params: Dict[str, Any] = None) -> List[Dict]:
        """Fetch data from REST API with retry logic."""
        max_retries = 3
        backoff = 1

        for attempt in range(max_retries):
            try:
                url = f"{{self.base_url}}/{{endpoint}}"
                response = self.session.get(url, params=params, timeout=self.timeout)
                response.raise_for_status()
                return response.json()

            except requests.exceptions.RequestException as e:
                logger.warning(f"Request failed (attempt {{attempt + 1}}/{{max_retries}}): {{e}}")
                if attempt < max_retries - 1:
                    time.sleep(backoff)
                    backoff *= 2
                else:
                    raise

    def close(self):
        self.session.close()
'''

# COMMAND ----------

# MAGIC %md
# MAGIC ## Deployment Example

# COMMAND ----------

# For development/testing, initialize the agent
agent = VibeConnectorBuilderAgent("vibe_connector_builder", cfg, llm, mon, spark)

# Log deployment info
mon.log_event("connector_builder_agent_ready", {
    "agent_type": "interactive",
    "model": "claude-3.5-sonnet",
    "max_turns": 5,
})

print("VibeConnectorBuilderAgent is ready for deployment to Model Serving")
print("To deploy:")
print("1. Register with Unity Catalog Models")
print("2. Deploy to Model Serving endpoint")
print("3. Call with: POST /serving-endpoints/connector-builder/invocations")
