"""
Production Tool Registry
Manages tool definitions, execution permissions, rate limiting,
and audit logging for all agent-callable tools.
"""

import time
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional
from enum import Enum

logger = logging.getLogger(__name__)


class ToolRiskLevel(Enum):
    READ_ONLY = "read_only"
    WRITE = "write"
    DESTRUCTIVE = "destructive"
    EXTERNAL = "external"


@dataclass
class ToolDefinition:
    """Schema definition for a callable tool."""
    name: str
    description: str
    parameters: dict  # JSON Schema for parameters
    risk_level: ToolRiskLevel
    handler: Callable
    requires_approval: bool = False
    rate_limit_per_minute: int = 60
    timeout_seconds: int = 30
    retry_count: int = 2
    enabled: bool = True


@dataclass
class ToolExecutionLog:
    """Audit record for a tool execution."""
    tool_name: str
    agent_id: str
    session_id: str
    arguments: dict
    output: Any
    success: bool
    execution_time_ms: float
    timestamp: float = field(default_factory=time.time)
    error: Optional[str] = None


class ToolRegistry:
    """
    Central registry for all tools available to agents.
    Handles:
    - Tool registration with schema validation
    - Permission checks based on risk level
    - Rate limiting per agent per tool
    - Execution with timeout and retry
    - Full audit logging
    """

    def __init__(self, audit_store: Any = None):
        self._tools: dict[str, ToolDefinition] = {}
        self._rate_limits: dict[str, list[float]] = {}
        self._audit_store = audit_store
        self._execution_log: list[ToolExecutionLog] = []

    def register(self, tool: ToolDefinition):
        """Register a tool definition."""
        if tool.name in self._tools:
            logger.warning(f"Overwriting existing tool: {tool.name}")
        self._tools[tool.name] = tool
        logger.info(f"Registered tool: {tool.name} (risk: {tool.risk_level.value})")

    def register_function(
        self,
        name: str,
        description: str,
        parameters: dict,
        handler: Callable,
        risk_level: ToolRiskLevel = ToolRiskLevel.READ_ONLY,
        requires_approval: bool = False,
    ):
        """Convenience method to register a function as a tool."""
        self.register(ToolDefinition(
            name=name,
            description=description,
            parameters=parameters,
            risk_level=risk_level,
            handler=handler,
            requires_approval=requires_approval,
        ))

    def get_tool_schemas(self, agent_id: str = None, max_risk: ToolRiskLevel = None) -> list[dict]:
        """
        Return tool schemas in LLM function-calling format.
        Optionally filter by maximum risk level.
        """
        risk_order = [ToolRiskLevel.READ_ONLY, ToolRiskLevel.WRITE, ToolRiskLevel.DESTRUCTIVE, ToolRiskLevel.EXTERNAL]
        max_idx = risk_order.index(max_risk) if max_risk else len(risk_order) - 1

        schemas = []
        for tool in self._tools.values():
            if not tool.enabled:
                continue
            if risk_order.index(tool.risk_level) > max_idx:
                continue
            schemas.append({
                "type": "function",
                "function": {
                    "name": tool.name,
                    "description": tool.description,
                    "parameters": tool.parameters,
                },
            })
        return schemas

    async def execute(
        self,
        tool_name: str,
        arguments: dict,
        agent_id: str,
        session_id: str,
    ) -> Any:
        """
        Execute a tool with validation, rate limiting, and audit logging.

        Raises:
            ValueError: If tool doesn't exist or is disabled
            PermissionError: If rate limit exceeded
            TimeoutError: If tool execution exceeds timeout
            RuntimeError: If tool execution fails after retries
        """
        if tool_name not in self._tools:
            raise ValueError(f"Unknown tool: {tool_name}")

        tool = self._tools[tool_name]

        if not tool.enabled:
            raise ValueError(f"Tool is disabled: {tool_name}")

        # Rate limiting
        rate_key = f"{agent_id}:{tool_name}"
        now = time.time()
        if rate_key not in self._rate_limits:
            self._rate_limits[rate_key] = []

        # Clean old entries
        self._rate_limits[rate_key] = [
            t for t in self._rate_limits[rate_key]
            if now - t < 60
        ]

        if len(self._rate_limits[rate_key]) >= tool.rate_limit_per_minute:
            raise PermissionError(
                f"Rate limit exceeded for {tool_name}: "
                f"{tool.rate_limit_per_minute}/min"
            )

        self._rate_limits[rate_key].append(now)

        # Execute with retry
        last_error = None
        for attempt in range(tool.retry_count + 1):
            start = time.time()
            try:
                import asyncio
                result = tool.handler(**arguments)
                if asyncio.iscoroutine(result):
                    result = await asyncio.wait_for(
                        result,
                        timeout=tool.timeout_seconds,
                    )
                elapsed_ms = (time.time() - start) * 1000

                log_entry = ToolExecutionLog(
                    tool_name=tool_name,
                    agent_id=agent_id,
                    session_id=session_id,
                    arguments=arguments,
                    output=self._truncate_output(result),
                    success=True,
                    execution_time_ms=elapsed_ms,
                )
                self._execution_log.append(log_entry)
                await self._persist_audit(log_entry)

                return result

            except asyncio.TimeoutError:
                elapsed_ms = (time.time() - start) * 1000
                last_error = f"Timeout after {tool.timeout_seconds}s"
                logger.warning(f"Tool {tool_name} timed out (attempt {attempt + 1})")

            except Exception as e:
                elapsed_ms = (time.time() - start) * 1000
                last_error = str(e)
                logger.warning(f"Tool {tool_name} failed (attempt {attempt + 1}): {e}")

                if attempt < tool.retry_count:
                    await asyncio.sleep(min(2 ** attempt, 10))

        # All retries exhausted
        log_entry = ToolExecutionLog(
            tool_name=tool_name,
            agent_id=agent_id,
            session_id=session_id,
            arguments=arguments,
            output=None,
            success=False,
            execution_time_ms=elapsed_ms,
            error=last_error,
        )
        self._execution_log.append(log_entry)
        await self._persist_audit(log_entry)

        raise RuntimeError(f"Tool {tool_name} failed after {tool.retry_count + 1} attempts: {last_error}")

    def _truncate_output(self, output: Any, max_len: int = 10000) -> Any:
        """Truncate large outputs for audit logging."""
        if isinstance(output, str) and len(output) > max_len:
            return output[:max_len] + f"... [truncated, total {len(output)} chars]"
        return output

    async def _persist_audit(self, log_entry: ToolExecutionLog):
        """Persist audit log to external store."""
        if not self._audit_store:
            return
        try:
            await self._audit_store.insert(
                table="agent_tool_audit_log",
                data={
                    "tool_name": log_entry.tool_name,
                    "agent_id": log_entry.agent_id,
                    "session_id": log_entry.session_id,
                    "arguments": log_entry.arguments,
                    "success": log_entry.success,
                    "execution_time_ms": log_entry.execution_time_ms,
                    "error": log_entry.error,
                    "timestamp": log_entry.timestamp,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist audit log: {e}")

    def get_execution_stats(self, agent_id: str = None) -> dict:
        """Return execution statistics for monitoring."""
        relevant = self._execution_log
        if agent_id:
            relevant = [l for l in relevant if l.agent_id == agent_id]

        if not relevant:
            return {"total_calls": 0}

        success_count = sum(1 for l in relevant if l.success)
        return {
            "total_calls": len(relevant),
            "success_rate": success_count / len(relevant),
            "avg_execution_ms": sum(l.execution_time_ms for l in relevant) / len(relevant),
            "tools_used": list(set(l.tool_name for l in relevant)),
            "error_count": len(relevant) - success_count,
        }
