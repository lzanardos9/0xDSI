# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Agent Framework
# MAGIC Production-grade base classes for Mosaic AI Agent Framework.
# MAGIC Provides MLflow ChatModel integration, MLflow Tracing, UC Function tools,
# MAGIC and the LangGraph Supervisor pattern.
# MAGIC
# MAGIC ## Agent Types:
# MAGIC - **InteractiveAgent**: ChatModel-based, deployed to Model Serving
# MAGIC - **BatchAgent**: Notebook-based, runs on schedule via Workflows
# MAGIC - **SupervisorAgent**: LangGraph orchestrator that routes to sub-agents
# MAGIC
# MAGIC ## All agents get:
# MAGIC - MLflow Tracing (automatic span instrumentation)
# MAGIC - Token budget management
# MAGIC - Structured tool definitions via UC Functions
# MAGIC - Health check and readiness probes
# MAGIC - Graceful degradation on LLM failure

# COMMAND ----------

import json
import time
import logging
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, Any, Callable
from enum import Enum

logger = logging.getLogger("oxdsi.agent_framework")


# ──────────────────────────────────────────────────────────────────────
# Agent Status & Result Types
# ──────────────────────────────────────────────────────────────────────

class AgentStatus(str, Enum):
    IDLE = "idle"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    DEGRADED = "degraded"


@dataclass
class AgentResult:
    """Standardized result returned by every agent execution."""
    status: AgentStatus
    agent_name: str
    processed_count: int = 0
    error_count: int = 0
    duration_seconds: float = 0.0
    details: dict = field(default_factory=dict)
    error: Optional[str] = None
    trace_id: str = field(default_factory=lambda: str(uuid.uuid4()))

    def to_json(self) -> str:
        return json.dumps({
            "status": self.status.value,
            "agent_name": self.agent_name,
            "processed": self.processed_count,
            "errors": self.error_count,
            "duration_seconds": round(self.duration_seconds, 3),
            "details": self.details,
            "error": self.error,
            "trace_id": self.trace_id,
        })


# ──────────────────────────────────────────────────────────────────────
# UC Function Tool Definitions
# ──────────────────────────────────────────────────────────────────────

@dataclass
class UCTool:
    """
    Represents a Unity Catalog function that an agent can invoke.
    Maps to the Databricks Agent Framework tool format.
    """
    name: str
    description: str
    catalog: str
    schema: str
    function_name: str
    parameters: dict = field(default_factory=dict)

    @property
    def full_name(self) -> str:
        return f"{self.catalog}.{self.schema}.{self.function_name}"

    def to_tool_definition(self) -> dict:
        """Convert to Foundation Model tool-calling format."""
        return {
            "type": "function",
            "function": {
                "name": self.name,
                "description": self.description,
                "parameters": self.parameters or {"type": "object", "properties": {}},
            },
        }


# ──────────────────────────────────────────────────────────────────────
# Base Agent Classes
# ──────────────────────────────────────────────────────────────────────

class BaseAgent(ABC):
    """
    Abstract base for all 0xDSI SOC agents.

    Subclasses implement either:
    - execute() for batch agents (notebook-based)
    - predict() for interactive agents (ChatModel-based)
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark):
        self.agent_name = agent_name
        self.cfg = cfg
        self.llm = llm
        self.mon = mon
        self.spark = spark
        self._tools: list[UCTool] = []
        self._start_time: float = 0.0
        self._tracer = None
        self._run_id: str = str(uuid.uuid4())

    def register_tool(self, tool: UCTool):
        """Register a UC Function tool for this agent."""
        self._tools.append(tool)

    @property
    def tool_definitions(self) -> list[dict]:
        """Get all tool definitions in Foundation Model format."""
        return [t.to_tool_definition() for t in self._tools]

    def send_communication(
        self,
        to_agent: str,
        subject: str,
        body: str,
        message_type: str = "handoff",
        payload: Optional[dict] = None,
        alert_id: Optional[str] = None,
        case_id: Optional[str] = None,
        confidence: Optional[float] = None,
        priority: str = "medium",
    ):
        """
        Send a real communication to another agent.
        This writes to agent_communications table and creates an auditable
        record of inter-agent interaction.
        """
        try:
            comm_id = str(uuid.uuid4())
            payload_json = json.dumps(payload) if payload else None
            catalog = self.cfg.catalog
            schema = self.cfg.schema
            self.spark.sql(f"""
                INSERT INTO {catalog}.{schema}.agent_communications
                (id, run_id, from_agent, to_agent, message_type, subject, body,
                 payload, alert_id, case_id, confidence, priority, status)
                VALUES (
                    '{comm_id}', '{self._run_id}', '{self.agent_name}', '{to_agent}',
                    '{message_type}', '{self._escape(subject)}', '{self._escape(body)}',
                    '{self._escape(payload_json or "")}',
                    {f"'{alert_id}'" if alert_id else "NULL"},
                    {f"'{case_id}'" if case_id else "NULL"},
                    {confidence if confidence is not None else "NULL"},
                    '{priority}', 'delivered'
                )
            """)
            logger.info(f"[COMM] {self.agent_name} -> {to_agent}: {subject}")
        except Exception as e:
            logger.warning(f"Failed to log communication: {e}")

    def request_task(
        self,
        target_agent: str,
        task_type: str,
        input_data: dict,
        priority: int = 5,
    ) -> str:
        """
        Create a task in the agent_task_queue for another agent to pick up.
        Returns the task_id.
        """
        task_id = str(uuid.uuid4())
        try:
            catalog = self.cfg.catalog
            schema = self.cfg.schema
            input_json = json.dumps(input_data)
            self.spark.sql(f"""
                INSERT INTO {catalog}.{schema}.agent_task_queue
                (id, run_id, agent_name, task_type, input_data, status, priority)
                VALUES (
                    '{task_id}', '{self._run_id}', '{target_agent}',
                    '{task_type}', '{self._escape(input_json)}', 'pending', {priority}
                )
            """)
            self.send_communication(
                to_agent=target_agent,
                subject=f"Task assigned: {task_type}",
                body=f"New {task_type} task created with priority {priority}",
                message_type="task_assignment",
                payload={"task_id": task_id, "task_type": task_type},
                priority="high" if priority >= 8 else "medium",
            )
        except Exception as e:
            logger.warning(f"Failed to create task: {e}")
        return task_id

    def complete_task(self, task_id: str, output_data: dict):
        """Mark a task as completed with results."""
        try:
            catalog = self.cfg.catalog
            schema = self.cfg.schema
            output_json = json.dumps(output_data)
            self.spark.sql(f"""
                UPDATE {catalog}.{schema}.agent_task_queue
                SET status = 'completed',
                    output_data = '{self._escape(output_json)}',
                    completed_at = current_timestamp()
                WHERE id = '{task_id}'
            """)
        except Exception as e:
            logger.warning(f"Failed to complete task: {e}")

    def fetch_pending_tasks(self) -> list[dict]:
        """Fetch pending tasks assigned to this agent."""
        try:
            catalog = self.cfg.catalog
            schema = self.cfg.schema
            rows = self.spark.sql(f"""
                SELECT id, task_type, input_data, priority, created_at
                FROM {catalog}.{schema}.agent_task_queue
                WHERE agent_name = '{self.agent_name}'
                  AND status = 'pending'
                ORDER BY priority DESC, created_at ASC
                LIMIT 50
            """).collect()
            tasks = []
            for r in rows:
                tasks.append({
                    "task_id": r["id"],
                    "task_type": r["task_type"],
                    "input_data": json.loads(r["input_data"]) if r["input_data"] else {},
                    "priority": r["priority"],
                })
            return tasks
        except Exception:
            return []

    @staticmethod
    def _escape(text: str) -> str:
        """Escape single quotes for SQL insertion."""
        if not text:
            return ""
        return text.replace("'", "''").replace("\\", "\\\\")

    def _init_tracing(self):
        """Initialize MLflow Tracing for this agent run."""
        try:
            import mlflow
            mlflow.set_experiment(f"/0xDSI/agents/{self.agent_name}")
            self._tracer = mlflow
        except Exception as e:
            logger.warning(f"MLflow tracing unavailable: {e}")

    def _start_trace(self, operation: str) -> Optional[Any]:
        """Start a trace span for an operation."""
        if self._tracer is None:
            return None
        try:
            return self._tracer.start_span(name=f"{self.agent_name}.{operation}")
        except Exception:
            return None

    def _end_trace(self, span, result: Optional[dict] = None):
        """End a trace span."""
        if span is None:
            return
        try:
            if result:
                span.set_attributes(result)
            span.end()
        except Exception:
            pass


class BatchAgent(BaseAgent):
    """
    Production batch agent that runs as a Databricks notebook on schedule.

    Pattern:
    1. Fetch unprocessed work items from Delta table
    2. Process each item (rule-based fast path + LLM slow path)
    3. Write results back to Delta
    4. Report metrics via MLflow and Monitor

    Usage:
        class MyAgent(BatchAgent):
            def execute(self) -> AgentResult:
                items = self.fetch_work_items()
                results = self.process_batch(items)
                self.write_results(results)
                return AgentResult(status=AgentStatus.COMPLETED, ...)

        agent = MyAgent("my_agent", cfg, llm, mon, spark)
        result = agent.run()
    """

    def run(self) -> AgentResult:
        """Execute the agent with full lifecycle management."""
        self._start_time = time.time()
        self._init_tracing()
        self.mon.log_event(f"{self.agent_name}_started", {"tools": len(self._tools)})

        try:
            result = self.execute()
            result.duration_seconds = time.time() - self._start_time

            self.mon.log_event(f"{self.agent_name}_completed", {
                "processed": result.processed_count,
                "errors": result.error_count,
                "duration": result.duration_seconds,
            })
            self._log_mlflow_metrics(result)
            return result

        except Exception as e:
            duration = time.time() - self._start_time
            self.mon.log_event(f"{self.agent_name}_failed", {
                "error": str(e)[:500],
                "duration": duration,
            })
            return AgentResult(
                status=AgentStatus.FAILED,
                agent_name=self.agent_name,
                duration_seconds=duration,
                error=str(e)[:500],
            )

    @abstractmethod
    def execute(self) -> AgentResult:
        """Implement agent-specific logic. Called by run()."""
        ...

    def execute_tool(self, tool_name: str, params: dict) -> Any:
        """Execute a registered UC Function tool by name."""
        tool = next((t for t in self._tools if t.name == tool_name), None)
        if tool is None:
            raise ValueError(f"Tool '{tool_name}' not registered for agent '{self.agent_name}'")

        span = self._start_trace(f"tool.{tool_name}")
        try:
            result = self.spark.sql(
                f"SELECT {tool.full_name}({', '.join(self._format_params(params))})"
            ).collect()
            self._end_trace(span, {"tool": tool_name, "status": "success"})
            return result[0][0] if result else None
        except Exception as e:
            self._end_trace(span, {"tool": tool_name, "status": "error", "error": str(e)[:200]})
            raise

    def llm_classify(
        self, system: str, user: str, json_mode: bool = True, temperature: float = 0.1
    ) -> dict:
        """
        LLM classification with automatic tracing and JSON extraction.
        Returns parsed dict or raises on failure.
        """
        span = self._start_trace("llm_classify")
        try:
            response = self.llm.chat(
                system=system,
                user=user,
                temperature=temperature,
                json_mode=json_mode,
                tools=self.tool_definitions if self._tools else None,
            )

            if response.tool_calls:
                self._end_trace(span, {"tool_calls": len(response.tool_calls)})
                return {"tool_calls": response.tool_calls, "content": response.content}

            result = self.llm.extract_json(response)
            if result is None:
                result = {"raw_content": response.content}

            self._end_trace(span, {"tokens": response.tokens_total})
            return result

        except Exception as e:
            self._end_trace(span, {"error": str(e)[:200]})
            raise

    def _format_params(self, params: dict) -> list[str]:
        """Format params for SQL UC Function call."""
        formatted = []
        for v in params.values():
            if isinstance(v, str):
                formatted.append(f"'{v}'")
            elif isinstance(v, (int, float)):
                formatted.append(str(v))
            elif v is None:
                formatted.append("NULL")
            else:
                formatted.append(f"'{json.dumps(v)}'")
        return formatted

    def _log_mlflow_metrics(self, result: AgentResult):
        """Log agent metrics to MLflow experiment."""
        if self._tracer is None:
            return
        try:
            with self._tracer.start_run(run_name=f"{self.agent_name}_{int(time.time())}"):
                self._tracer.log_metrics({
                    "processed_count": result.processed_count,
                    "error_count": result.error_count,
                    "duration_seconds": result.duration_seconds,
                    "tokens_used": self.llm.budget.used_total,
                })
                self._tracer.log_params({
                    "agent_name": self.agent_name,
                    "status": result.status.value,
                    "environment": self.cfg.environment,
                })
        except Exception as e:
            logger.warning(f"MLflow metrics logging failed: {e}")


class InteractiveAgent(BaseAgent):
    """
    Production interactive agent deployed to Databricks Model Serving.

    Implements the MLflow ChatModel interface for real-time inference.
    Supports multi-turn conversation, tool calling, and streaming.

    To deploy:
        1. Log agent with mlflow.pyfunc.log_model()
        2. Register in Unity Catalog Models
        3. Deploy to Model Serving endpoint

    Usage in notebook (for development/testing):
        agent = MyCISOAgent("ciso_assistant", cfg, llm, mon, spark)
        response = agent.predict_messages([
            {"role": "user", "content": "What are today's critical alerts?"}
        ])
    """

    MAX_TOOL_ITERATIONS = 10

    def predict_messages(
        self, messages: list[dict], params: Optional[dict] = None
    ) -> dict:
        """
        Process a conversation and return a response.
        This is the core method called by Model Serving.

        Args:
            messages: Conversation history [{"role": "user/assistant/system", "content": "..."}]
            params: Optional parameters (temperature, max_tokens, etc.)

        Returns:
            {"content": "...", "tool_calls": [...], "metadata": {...}}
        """
        self._init_tracing()
        self._start_time = time.time()
        params = params or {}

        system_prompt = self.get_system_prompt()
        temperature = params.get("temperature", 0.2)
        max_tokens = params.get("max_tokens", 4096)

        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        iteration = 0
        while iteration < self.MAX_TOOL_ITERATIONS:
            iteration += 1
            span = self._start_trace(f"inference_turn_{iteration}")

            response = self.llm.chat_multi_turn(
                messages=full_messages,
                temperature=temperature,
                max_tokens=max_tokens,
                tools=self.tool_definitions if self._tools else None,
            )

            if not response.tool_calls:
                self._end_trace(span, {"final_turn": iteration})
                return {
                    "content": response.content,
                    "metadata": {
                        "agent": self.agent_name,
                        "turns": iteration,
                        "tokens_total": response.tokens_total,
                        "latency_ms": (time.time() - self._start_time) * 1000,
                        "model": response.model,
                        "fallback_used": response.fallback_used,
                    },
                }

            # Execute tool calls and continue the loop
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

        return {
            "content": "I've reached the maximum number of tool iterations. Here's what I found so far: " + (response.content or ""),
            "metadata": {"agent": self.agent_name, "turns": iteration, "max_iterations_reached": True},
        }

    def _execute_tool_call(self, tool_call: dict) -> Any:
        """Execute a tool call and return the result."""
        tool_name = tool_call["name"]
        arguments = tool_call["arguments"]

        tool = next((t for t in self._tools if t.name == tool_name), None)
        if tool is None:
            return {"error": f"Unknown tool: {tool_name}"}

        try:
            result = self.spark.sql(
                f"SELECT {tool.full_name}({', '.join(self._format_params(arguments))})"
            ).collect()
            return result[0][0] if result else None
        except Exception as e:
            return {"error": f"Tool execution failed: {str(e)[:200]}"}

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the system prompt for this agent."""
        ...

    def get_tools(self) -> list[UCTool]:
        """Override to define agent-specific tools."""
        return []


# ──────────────────────────────────────────────────────────────────────
# Supervisor Agent (LangGraph Pattern)
# ──────────────────────────────────────────────────────────────────────

@dataclass
class SubAgent:
    """A sub-agent that the Supervisor can route to."""
    name: str
    description: str
    endpoint: Optional[str] = None  # Model Serving endpoint (for interactive agents)
    notebook: Optional[str] = None  # Notebook path (for batch agents)
    agent_type: str = "interactive"  # "interactive" or "batch"


class SupervisorAgent(InteractiveAgent):
    """
    LangGraph-style Supervisor that dynamically routes to sub-agents.

    The Supervisor:
    1. Receives a user query
    2. Decides which sub-agent(s) to invoke (via LLM reasoning)
    3. Invokes sub-agents (interactive via REST, batch via notebook.run)
    4. Synthesizes results into a final response

    This is the recommended Databricks pattern for multi-agent systems.
    """

    def __init__(self, agent_name: str, cfg, llm, mon, spark, dbutils=None):
        super().__init__(agent_name, cfg, llm, mon, spark)
        self._sub_agents: list[SubAgent] = []
        self._dbutils = dbutils

    def register_sub_agent(self, sub_agent: SubAgent):
        """Register a sub-agent for the supervisor to route to."""
        self._sub_agents.append(sub_agent)

    def get_system_prompt(self) -> str:
        agent_descriptions = "\n".join(
            f"- **{a.name}**: {a.description}"
            for a in self._sub_agents
        )
        return f"""You are the 0xDSI SOC Supervisor Agent. You orchestrate a team of specialized security agents.

Your role:
1. Analyze the user's request
2. Decide which agent(s) to invoke
3. Synthesize their results into a coherent response

Available agents:
{agent_descriptions}

When you need to invoke an agent, use the route_to_agent tool with the agent name and the task.
If the request can be answered directly from your knowledge, respond without routing.
Always explain your reasoning briefly before routing."""

    def predict_messages(self, messages: list[dict], params: Optional[dict] = None) -> dict:
        """Override to add supervisor routing logic."""
        self._init_tracing()
        self._start_time = time.time()
        params = params or {}

        # Add routing tool
        routing_tool = UCTool(
            name="route_to_agent",
            description="Route a task to a specialized agent",
            catalog=self.cfg.catalog,
            schema=self.cfg.schema,
            function_name="route_to_agent",
            parameters={
                "type": "object",
                "properties": {
                    "agent_name": {"type": "string", "description": "Name of the agent to invoke"},
                    "task": {"type": "string", "description": "Task description for the agent"},
                },
                "required": ["agent_name", "task"],
            },
        )

        system_prompt = self.get_system_prompt()
        full_messages = [{"role": "system", "content": system_prompt}]
        full_messages.extend(messages)

        response = self.llm.chat_multi_turn(
            messages=full_messages,
            temperature=0.2,
            max_tokens=4096,
            tools=[routing_tool.to_tool_definition()] + self.tool_definitions,
        )

        if not response.tool_calls:
            return {
                "content": response.content,
                "metadata": {"agent": self.agent_name, "routing": "direct"},
            }

        # Execute routing decisions
        agent_results = []
        for tc in response.tool_calls:
            if tc["name"] == "route_to_agent":
                agent_name = tc["arguments"].get("agent_name", "")
                task = tc["arguments"].get("task", "")
                result = self._invoke_sub_agent(agent_name, task)
                agent_results.append({"agent": agent_name, "result": result})

        # Synthesize results
        synthesis_messages = full_messages + [
            {"role": "assistant", "content": response.content or "Routing to agents..."},
            {"role": "user", "content": f"Agent results:\n{json.dumps(agent_results, indent=2)}\n\nSynthesize these results into a clear, actionable response."},
        ]

        final = self.llm.chat_multi_turn(
            messages=synthesis_messages,
            temperature=0.2,
            max_tokens=4096,
        )

        return {
            "content": final.content,
            "metadata": {
                "agent": self.agent_name,
                "routing": [r["agent"] for r in agent_results],
                "tokens_total": response.tokens_total + final.tokens_total,
                "latency_ms": (time.time() - self._start_time) * 1000,
            },
        }

    def _invoke_sub_agent(self, agent_name: str, task: str) -> str:
        """Invoke a sub-agent by name."""
        sub = next((a for a in self._sub_agents if a.name == agent_name), None)
        if sub is None:
            return f"Error: Unknown agent '{agent_name}'"

        try:
            if sub.agent_type == "interactive" and sub.endpoint:
                return self._call_serving_endpoint(sub.endpoint, task)
            elif sub.notebook and self._dbutils:
                return self._run_notebook(sub.notebook, task)
            else:
                return f"Agent '{agent_name}' is not available in this execution context."
        except Exception as e:
            return f"Agent '{agent_name}' failed: {str(e)[:300]}"

    def _call_serving_endpoint(self, endpoint: str, task: str) -> str:
        """Call an interactive agent via Model Serving endpoint."""
        import mlflow.deployments
        client = mlflow.deployments.get_deploy_client("databricks")
        response = client.predict(
            endpoint=endpoint,
            inputs={"messages": [{"role": "user", "content": task}]},
        )
        choices = response.get("choices", [])
        if choices:
            return choices[0].get("message", {}).get("content", "")
        return str(response)

    def _run_notebook(self, notebook_path: str, task: str) -> str:
        """Run a batch agent notebook and return its result."""
        result = self._dbutils.notebook.run(
            notebook_path,
            timeout_seconds=300,
            arguments={"task": task},
        )
        return result


# ──────────────────────────────────────────────────────────────────────
# Agent Registration Helpers
# ──────────────────────────────────────────────────────────────────────

def create_soc_tools(cfg) -> list[UCTool]:
    """Standard set of UC Function tools available to all SOC agents."""
    cat, sch = cfg.catalog, cfg.schema
    return [
        UCTool(
            name="lookup_ioc",
            description="Look up an Indicator of Compromise (IP, domain, hash) in threat intel",
            catalog=cat, schema=sch, function_name="lookup_ioc",
            parameters={
                "type": "object",
                "properties": {
                    "indicator": {"type": "string", "description": "The IOC value to look up"},
                    "indicator_type": {"type": "string", "enum": ["ip", "domain", "hash", "url", "email"]},
                },
                "required": ["indicator", "indicator_type"],
            },
        ),
        UCTool(
            name="get_alert_context",
            description="Get full context for an alert including related events and assets",
            catalog=cat, schema=sch, function_name="get_alert_context",
            parameters={
                "type": "object",
                "properties": {
                    "alert_id": {"type": "string", "description": "The alert ID to get context for"},
                },
                "required": ["alert_id"],
            },
        ),
        UCTool(
            name="query_user_behavior",
            description="Query user behavioral baseline and recent activity",
            catalog=cat, schema=sch, function_name="query_user_behavior",
            parameters={
                "type": "object",
                "properties": {
                    "user_id": {"type": "string", "description": "User ID or email to query"},
                    "days_back": {"type": "integer", "description": "Number of days of history"},
                },
                "required": ["user_id"],
            },
        ),
        UCTool(
            name="search_events",
            description="Search raw events by type, source, or time range",
            catalog=cat, schema=sch, function_name="search_events",
            parameters={
                "type": "object",
                "properties": {
                    "event_type": {"type": "string", "description": "Event type filter"},
                    "source_ip": {"type": "string", "description": "Source IP filter"},
                    "hours_back": {"type": "integer", "description": "Time window in hours"},
                    "limit": {"type": "integer", "description": "Max results (default 50)"},
                },
            },
        ),
        UCTool(
            name="get_asset_info",
            description="Get asset information including criticality, owner, and network zone",
            catalog=cat, schema=sch, function_name="get_asset_info",
            parameters={
                "type": "object",
                "properties": {
                    "identifier": {"type": "string", "description": "IP, hostname, or asset ID"},
                },
                "required": ["identifier"],
            },
        ),
        UCTool(
            name="create_case",
            description="Create a new investigation case from an alert or finding",
            catalog=cat, schema=sch, function_name="create_case",
            parameters={
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
                    "alert_ids": {"type": "array", "items": {"type": "string"}},
                    "description": {"type": "string"},
                },
                "required": ["title", "severity"],
            },
        ),
        UCTool(
            name="execute_response_action",
            description="Execute an automated response action (block IP, disable user, isolate host)",
            catalog=cat, schema=sch, function_name="execute_response_action",
            parameters={
                "type": "object",
                "properties": {
                    "action_type": {"type": "string", "enum": ["block_ip", "disable_user", "isolate_host", "quarantine_file", "revoke_token"]},
                    "target": {"type": "string", "description": "Target of the action"},
                    "reason": {"type": "string", "description": "Justification for the action"},
                    "auto_approve": {"type": "boolean", "description": "If true, skip human approval"},
                },
                "required": ["action_type", "target", "reason"],
            },
        ),
    ]
