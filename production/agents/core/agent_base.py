"""
Production Agent Base Class
Implements a robust tool-use loop with LLM reasoning, memory retrieval,
confidence scoring, observability, and escalation logic.

Supports: Azure OpenAI, Anthropic Claude, Databricks Foundation Model APIs
"""

import json
import time
import uuid
import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Callable

logger = logging.getLogger(__name__)


class AgentState(Enum):
    IDLE = "idle"
    THINKING = "thinking"
    EXECUTING_TOOL = "executing_tool"
    WAITING_APPROVAL = "waiting_approval"
    ESCALATED = "escalated"
    COMPLETED = "completed"
    FAILED = "failed"


class EscalationReason(Enum):
    LOW_CONFIDENCE = "low_confidence"
    HIGH_RISK_ACTION = "high_risk_action"
    CONFLICTING_SIGNALS = "conflicting_signals"
    TIMEOUT = "timeout"
    TOOL_FAILURE = "tool_failure"
    POLICY_VIOLATION = "policy_violation"


@dataclass
class AgentContext:
    """Shared context passed between agent iterations."""
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    conversation_history: list = field(default_factory=list)
    tool_results: list = field(default_factory=list)
    retrieved_memories: list = field(default_factory=list)
    confidence_score: float = 1.0
    escalation_reason: Optional[EscalationReason] = None
    metadata: dict = field(default_factory=dict)
    start_time: float = field(default_factory=time.time)
    iteration_count: int = 0
    max_iterations: int = 20
    total_tokens_used: int = 0


@dataclass
class ToolCall:
    """Represents a tool invocation request from the LLM."""
    tool_name: str
    arguments: dict
    call_id: str = field(default_factory=lambda: str(uuid.uuid4()))


@dataclass
class ToolResult:
    """Result from a tool execution."""
    call_id: str
    tool_name: str
    output: Any
    success: bool
    execution_time_ms: float
    error: Optional[str] = None


@dataclass
class AgentDecision:
    """Final output of an agent run."""
    session_id: str
    action: str
    reasoning: str
    confidence: float
    evidence: list
    recommended_actions: list
    requires_approval: bool
    escalation_reason: Optional[EscalationReason] = None
    metadata: dict = field(default_factory=dict)


class AgentBase(ABC):
    """
    Base class for all SOC agents. Implements the core reasoning loop:

    1. Retrieve relevant memory/context
    2. Call LLM with system prompt + context + tool definitions
    3. If LLM requests tool calls → execute tools → loop back to step 2
    4. If LLM produces final answer → evaluate confidence → decide or escalate
    5. Record decision + trace for observability
    """

    def __init__(
        self,
        agent_id: str,
        agent_name: str,
        llm_client: Any,
        tool_registry: Any,
        memory_store: Any,
        config: dict = None,
    ):
        self.agent_id = agent_id
        self.agent_name = agent_name
        self.llm_client = llm_client
        self.tool_registry = tool_registry
        self.memory_store = memory_store
        self.config = config or {}
        self.state = AgentState.IDLE
        self._approval_callback: Optional[Callable] = None
        self._trace_callback: Optional[Callable] = None

        self.confidence_threshold = self.config.get("confidence_threshold", 0.7)
        self.escalation_threshold = self.config.get("escalation_threshold", 0.4)
        self.max_iterations = self.config.get("max_iterations", 20)
        self.timeout_seconds = self.config.get("timeout_seconds", 300)

    @abstractmethod
    def get_system_prompt(self) -> str:
        """Return the system prompt for this agent's specialization."""
        pass

    @abstractmethod
    def get_available_tools(self) -> list[dict]:
        """Return tool definitions available to this agent."""
        pass

    @abstractmethod
    def evaluate_confidence(self, context: AgentContext, response: str) -> float:
        """Evaluate confidence in the current reasoning based on evidence quality."""
        pass

    @abstractmethod
    def format_decision(self, context: AgentContext, final_response: str) -> AgentDecision:
        """Format the final LLM response into a structured AgentDecision."""
        pass

    def set_approval_callback(self, callback: Callable):
        """Register a callback for human-in-the-loop approval gates."""
        self._approval_callback = callback

    def set_trace_callback(self, callback: Callable):
        """Register a callback for observability tracing."""
        self._trace_callback = callback

    async def run(self, input_data: dict, context: Optional[AgentContext] = None) -> AgentDecision:
        """
        Execute the full agent reasoning loop.

        Args:
            input_data: The alert, event, or task to process
            context: Optional pre-existing context (for multi-agent handoff)

        Returns:
            AgentDecision with action, reasoning, confidence, and evidence
        """
        context = context or AgentContext(max_iterations=self.max_iterations)
        self.state = AgentState.THINKING

        self._trace("agent_start", {
            "agent_id": self.agent_id,
            "input": input_data,
            "session_id": context.session_id,
        })

        # Step 1: Retrieve relevant memories
        await self._retrieve_context(input_data, context)

        # Step 2: Build initial message
        context.conversation_history.append({
            "role": "user",
            "content": self._format_input(input_data, context),
        })

        # Step 3: Reasoning loop
        while context.iteration_count < context.max_iterations:
            context.iteration_count += 1
            elapsed = time.time() - context.start_time

            if elapsed > self.timeout_seconds:
                self.state = AgentState.ESCALATED
                context.escalation_reason = EscalationReason.TIMEOUT
                self._trace("agent_timeout", {"elapsed": elapsed})
                return self._build_escalation_decision(context, "Agent timed out")

            try:
                response = await self._call_llm(context)
            except Exception as e:
                logger.error(f"LLM call failed: {e}")
                self._trace("llm_error", {"error": str(e)})
                if context.iteration_count >= 3:
                    self.state = AgentState.FAILED
                    return self._build_escalation_decision(context, f"LLM failure: {e}")
                continue

            # Check if LLM wants to call tools
            tool_calls = self._extract_tool_calls(response)

            if tool_calls:
                self.state = AgentState.EXECUTING_TOOL
                tool_results = await self._execute_tools(tool_calls, context)
                context.tool_results.extend(tool_results)

                # Add tool results to conversation
                context.conversation_history.append({
                    "role": "assistant",
                    "content": response.get("content", ""),
                    "tool_calls": [{"id": tc.call_id, "name": tc.tool_name, "arguments": tc.arguments} for tc in tool_calls],
                })
                context.conversation_history.append({
                    "role": "tool",
                    "content": json.dumps([{
                        "call_id": tr.call_id,
                        "output": tr.output,
                        "success": tr.success,
                        "error": tr.error,
                    } for tr in tool_results]),
                })

                self.state = AgentState.THINKING
                continue

            # No tool calls → final answer
            final_content = response.get("content", "")
            confidence = self.evaluate_confidence(context, final_content)
            context.confidence_score = confidence

            self._trace("confidence_evaluated", {
                "confidence": confidence,
                "iteration": context.iteration_count,
            })

            if confidence < self.escalation_threshold:
                self.state = AgentState.ESCALATED
                context.escalation_reason = EscalationReason.LOW_CONFIDENCE
                return self._build_escalation_decision(context, final_content)

            decision = self.format_decision(context, final_content)

            # Check if action requires approval
            if decision.requires_approval:
                self.state = AgentState.WAITING_APPROVAL
                approved = await self._request_approval(decision)
                if not approved:
                    self._trace("approval_denied", {"decision": decision.action})
                    self.state = AgentState.ESCALATED
                    context.escalation_reason = EscalationReason.HIGH_RISK_ACTION
                    decision.escalation_reason = EscalationReason.HIGH_RISK_ACTION
                    return decision

            # Store decision in memory for future reference
            await self._store_decision_memory(decision, context)

            self.state = AgentState.COMPLETED
            self._trace("agent_complete", {
                "decision": decision.action,
                "confidence": decision.confidence,
                "iterations": context.iteration_count,
                "tokens_used": context.total_tokens_used,
            })

            return decision

        # Max iterations reached
        self.state = AgentState.ESCALATED
        context.escalation_reason = EscalationReason.TIMEOUT
        return self._build_escalation_decision(context, "Max iterations reached")

    async def _retrieve_context(self, input_data: dict, context: AgentContext):
        """Retrieve relevant memories and context for the current task."""
        if not self.memory_store:
            return

        query = self._build_memory_query(input_data)
        try:
            memories = await self.memory_store.search(
                query=query,
                agent_id=self.agent_id,
                limit=self.config.get("memory_retrieval_limit", 10),
                min_relevance=self.config.get("memory_min_relevance", 0.7),
            )
            context.retrieved_memories = memories
            self._trace("memory_retrieved", {"count": len(memories)})
        except Exception as e:
            logger.warning(f"Memory retrieval failed: {e}")
            self._trace("memory_error", {"error": str(e)})

    def _build_memory_query(self, input_data: dict) -> str:
        """Build a search query from input data for memory retrieval."""
        parts = []
        if "alert_type" in input_data:
            parts.append(input_data["alert_type"])
        if "source_ip" in input_data:
            parts.append(f"IP:{input_data['source_ip']}")
        if "user" in input_data:
            parts.append(f"user:{input_data['user']}")
        if "description" in input_data:
            parts.append(input_data["description"])
        return " ".join(parts) if parts else json.dumps(input_data)[:500]

    def _format_input(self, input_data: dict, context: AgentContext) -> str:
        """Format the input data + retrieved memories into an LLM prompt."""
        parts = [
            "## Current Task",
            json.dumps(input_data, indent=2, default=str),
        ]

        if context.retrieved_memories:
            parts.append("\n## Relevant Past Context")
            for mem in context.retrieved_memories[:5]:
                parts.append(f"- [{mem.get('timestamp', 'unknown')}] {mem.get('summary', mem.get('content', ''))}")

        return "\n".join(parts)

    async def _call_llm(self, context: AgentContext) -> dict:
        """Call the LLM with current conversation state."""
        messages = [
            {"role": "system", "content": self.get_system_prompt()},
            *context.conversation_history,
        ]

        tools = self.get_available_tools()

        response = await self.llm_client.chat(
            messages=messages,
            tools=tools if tools else None,
            temperature=self.config.get("temperature", 0.1),
            max_tokens=self.config.get("max_tokens", 4096),
        )

        context.total_tokens_used += response.get("usage", {}).get("total_tokens", 0)
        return response

    def _extract_tool_calls(self, response: dict) -> list[ToolCall]:
        """Extract tool call requests from LLM response."""
        raw_calls = response.get("tool_calls", [])
        return [
            ToolCall(
                tool_name=tc["name"],
                arguments=tc.get("arguments", {}),
                call_id=tc.get("id", str(uuid.uuid4())),
            )
            for tc in raw_calls
        ]

    async def _execute_tools(self, tool_calls: list[ToolCall], context: AgentContext) -> list[ToolResult]:
        """Execute tool calls with error handling and timing."""
        results = []
        for tc in tool_calls:
            start = time.time()
            try:
                output = await self.tool_registry.execute(
                    tool_name=tc.tool_name,
                    arguments=tc.arguments,
                    agent_id=self.agent_id,
                    session_id=context.session_id,
                )
                elapsed_ms = (time.time() - start) * 1000
                results.append(ToolResult(
                    call_id=tc.call_id,
                    tool_name=tc.tool_name,
                    output=output,
                    success=True,
                    execution_time_ms=elapsed_ms,
                ))
                self._trace("tool_executed", {
                    "tool": tc.tool_name,
                    "success": True,
                    "elapsed_ms": elapsed_ms,
                })
            except Exception as e:
                elapsed_ms = (time.time() - start) * 1000
                logger.error(f"Tool {tc.tool_name} failed: {e}")
                results.append(ToolResult(
                    call_id=tc.call_id,
                    tool_name=tc.tool_name,
                    output=None,
                    success=False,
                    execution_time_ms=elapsed_ms,
                    error=str(e),
                ))
                self._trace("tool_failed", {
                    "tool": tc.tool_name,
                    "error": str(e),
                    "elapsed_ms": elapsed_ms,
                })
        return results

    async def _request_approval(self, decision: AgentDecision) -> bool:
        """Request human approval for high-risk actions."""
        if not self._approval_callback:
            logger.warning("No approval callback registered, auto-denying high-risk action")
            return False

        self._trace("approval_requested", {
            "action": decision.action,
            "confidence": decision.confidence,
        })

        return await self._approval_callback(decision)

    async def _store_decision_memory(self, decision: AgentDecision, context: AgentContext):
        """Store the decision in memory for future reference."""
        if not self.memory_store:
            return
        try:
            await self.memory_store.store(
                agent_id=self.agent_id,
                session_id=context.session_id,
                content={
                    "action": decision.action,
                    "reasoning": decision.reasoning,
                    "confidence": decision.confidence,
                    "evidence_count": len(decision.evidence),
                },
                metadata=decision.metadata,
            )
        except Exception as e:
            logger.warning(f"Failed to store decision memory: {e}")

    def _build_escalation_decision(self, context: AgentContext, reason: str) -> AgentDecision:
        """Build a decision that escalates to human."""
        return AgentDecision(
            session_id=context.session_id,
            action="ESCALATE_TO_HUMAN",
            reasoning=reason,
            confidence=context.confidence_score,
            evidence=[tr.__dict__ for tr in context.tool_results[-5:]],
            recommended_actions=["Review agent reasoning trace", "Manual investigation required"],
            requires_approval=False,
            escalation_reason=context.escalation_reason,
            metadata={
                "iterations": context.iteration_count,
                "tokens_used": context.total_tokens_used,
                "elapsed_seconds": time.time() - context.start_time,
            },
        )

    def _trace(self, event: str, data: dict):
        """Emit a trace event for observability."""
        trace_entry = {
            "timestamp": time.time(),
            "agent_id": self.agent_id,
            "agent_name": self.agent_name,
            "event": event,
            "state": self.state.value,
            **data,
        }
        logger.debug(f"TRACE: {json.dumps(trace_entry, default=str)}")
        if self._trace_callback:
            self._trace_callback(trace_entry)
