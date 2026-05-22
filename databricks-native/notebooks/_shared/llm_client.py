# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI LLM Client
# MAGIC Foundation Model wrapper with retry, fallback, structured output parsing,
# MAGIC and token budget management. All agent notebooks use this instead of
# MAGIC calling mlflow.deployments directly.

# COMMAND ----------

import json
import time
import logging
from dataclasses import dataclass, field
from typing import Optional, Any

logger = logging.getLogger("oxdsi.llm_client")


@dataclass
class LLMResponse:
    """Normalized response from any Foundation Model endpoint."""
    content: str
    tool_calls: list = field(default_factory=list)
    model: str = ""
    tokens_prompt: int = 0
    tokens_completion: int = 0
    tokens_total: int = 0
    latency_ms: float = 0.0
    fallback_used: bool = False
    raw: dict = field(default_factory=dict)


@dataclass
class TokenBudget:
    """Track cumulative token usage within a notebook run."""
    max_tokens: int = 500_000
    used_prompt: int = 0
    used_completion: int = 0

    @property
    def used_total(self) -> int:
        return self.used_prompt + self.used_completion

    @property
    def remaining(self) -> int:
        return max(0, self.max_tokens - self.used_total)

    @property
    def exhausted(self) -> bool:
        return self.remaining == 0

    def consume(self, prompt_tokens: int, completion_tokens: int):
        self.used_prompt += prompt_tokens
        self.used_completion += completion_tokens


class SOCLLMClient:
    """
    Production LLM client for SOC agents.

    Features:
    - Automatic retry with exponential backoff (3 attempts)
    - Fallback to smaller model on primary failure
    - Token budget tracking per run
    - Structured JSON output extraction
    - Tool call parsing (Databricks Foundation Model format)

    Usage:
        from _shared.llm_client import SOCLLMClient
        from _shared.config import load_config

        cfg = load_config(dbutils)
        llm = SOCLLMClient(cfg)

        response = llm.chat(
            system="You are a SOC triage agent.",
            user="Classify this alert: ...",
            temperature=0.1,
        )
        print(response.content)
    """

    def __init__(self, config, deploy_client=None):
        """
        Args:
            config: SOCConfig instance
            deploy_client: Optional pre-initialized mlflow deploy client.
                           If None, creates one via mlflow.deployments.
        """
        self._config = config
        self._primary_endpoint = config.model_endpoint
        self._fallback_endpoint = config.model_fallback_endpoint
        self._budget = TokenBudget()
        self._client = deploy_client
        self._initialized = False

    def _ensure_client(self):
        """Lazy-init the mlflow deploy client."""
        if self._initialized:
            return
        if self._client is None:
            import mlflow.deployments
            self._client = mlflow.deployments.get_deploy_client("databricks")
        self._initialized = True

    @property
    def budget(self) -> TokenBudget:
        return self._budget

    def chat(
        self,
        system: str,
        user: str,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        tools: Optional[list] = None,
        json_mode: bool = False,
        timeout_seconds: int = 120,
    ) -> LLMResponse:
        """
        Send a chat completion request with retry and fallback.

        Args:
            system: System prompt
            user: User message
            temperature: Sampling temperature (0.0-1.0)
            max_tokens: Max completion tokens
            tools: Optional list of tool definitions (JSON Schema format)
            json_mode: If True, instruct model to return valid JSON
            timeout_seconds: Per-attempt timeout

        Returns:
            LLMResponse with content, tool_calls, and usage metrics

        Raises:
            LLMBudgetExhausted: If token budget is depleted
            LLMAllEndpointsFailed: If both primary and fallback fail
        """
        if self._budget.exhausted:
            raise LLMBudgetExhausted(
                f"Token budget exhausted: {self._budget.used_total}/{self._budget.max_tokens}"
            )

        self._ensure_client()

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ]

        if json_mode:
            messages[0]["content"] += "\n\nIMPORTANT: Respond with valid JSON only."

        # Try primary endpoint with retries
        response = self._call_with_retry(
            endpoint=self._primary_endpoint,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            timeout_seconds=timeout_seconds,
        )

        if response is not None:
            return response

        # Fallback to smaller model
        logger.warning(
            f"Primary endpoint '{self._primary_endpoint}' failed, "
            f"falling back to '{self._fallback_endpoint}'"
        )
        response = self._call_with_retry(
            endpoint=self._fallback_endpoint,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            timeout_seconds=timeout_seconds,
            max_retries=2,
        )

        if response is not None:
            response.fallback_used = True
            return response

        raise LLMAllEndpointsFailed(
            f"Both endpoints failed: '{self._primary_endpoint}' and '{self._fallback_endpoint}'"
        )

    def chat_multi_turn(
        self,
        messages: list,
        temperature: float = 0.1,
        max_tokens: int = 2048,
        tools: Optional[list] = None,
    ) -> LLMResponse:
        """
        Multi-turn conversation support for agent tool-use loops.

        Args:
            messages: Full conversation history [{"role": ..., "content": ...}, ...]
        """
        if self._budget.exhausted:
            raise LLMBudgetExhausted(
                f"Token budget exhausted: {self._budget.used_total}/{self._budget.max_tokens}"
            )

        self._ensure_client()

        response = self._call_with_retry(
            endpoint=self._primary_endpoint,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
        )

        if response is not None:
            return response

        response = self._call_with_retry(
            endpoint=self._fallback_endpoint,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools,
            max_retries=2,
        )

        if response is not None:
            response.fallback_used = True
            return response

        raise LLMAllEndpointsFailed("All endpoints failed for multi-turn chat")

    def extract_json(self, response: LLMResponse) -> Optional[dict]:
        """
        Extract JSON from an LLM response, handling common formatting issues.
        Returns None if no valid JSON found.
        """
        content = response.content.strip()

        # Direct JSON parse
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Extract from markdown code blocks
        if "```json" in content:
            start = content.index("```json") + 7
            end = content.index("```", start)
            try:
                return json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        if "```" in content:
            start = content.index("```") + 3
            end = content.index("```", start)
            try:
                return json.loads(content[start:end].strip())
            except (json.JSONDecodeError, ValueError):
                pass

        # Try to find JSON object boundaries
        first_brace = content.find("{")
        last_brace = content.rfind("}")
        if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
            try:
                return json.loads(content[first_brace:last_brace + 1])
            except json.JSONDecodeError:
                pass

        # Try JSON array
        first_bracket = content.find("[")
        last_bracket = content.rfind("]")
        if first_bracket != -1 and last_bracket != -1 and last_bracket > first_bracket:
            try:
                return json.loads(content[first_bracket:last_bracket + 1])
            except json.JSONDecodeError:
                pass

        return None

    def extract_fields(self, response: LLMResponse, fields: list) -> dict:
        """
        Extract named fields from LLM text response using line-based parsing.
        Handles formats like "classification: true_positive" or "severity: high".

        Args:
            response: LLM response
            fields: List of field names to extract

        Returns:
            Dict of extracted field values (missing fields omitted)
        """
        result = {}
        content = response.content.lower()

        for field_name in fields:
            key = field_name.lower()
            for line in content.split("\n"):
                line = line.strip()
                if line.startswith(f"{key}:"):
                    value = line.split(":", 1)[1].strip()
                    # Remove surrounding quotes
                    if value.startswith('"') and value.endswith('"'):
                        value = value[1:-1]
                    if value.startswith("'") and value.endswith("'"):
                        value = value[1:-1]
                    result[field_name] = value
                    break

        return result

    def _call_with_retry(
        self,
        endpoint: str,
        messages: list,
        temperature: float,
        max_tokens: int,
        tools: Optional[list],
        timeout_seconds: int = 120,
        max_retries: int = 3,
    ) -> Optional[LLMResponse]:
        """Execute LLM call with exponential backoff retry."""
        last_error = None

        for attempt in range(max_retries):
            try:
                start_time = time.time()

                payload = {
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": min(max_tokens, self._budget.remaining),
                }
                if tools:
                    payload["tools"] = tools

                raw_response = self._client.predict(
                    endpoint=endpoint,
                    inputs=payload,
                )

                latency_ms = (time.time() - start_time) * 1000
                return self._parse_response(raw_response, endpoint, latency_ms)

            except Exception as e:
                last_error = e
                logger.warning(
                    f"LLM call attempt {attempt + 1}/{max_retries} failed "
                    f"for endpoint '{endpoint}': {type(e).__name__}: {e}"
                )
                if attempt < max_retries - 1:
                    backoff = (2 ** attempt) * 1.0  # 1s, 2s, 4s
                    time.sleep(backoff)

        logger.error(
            f"All {max_retries} attempts failed for endpoint '{endpoint}': {last_error}"
        )
        return None

    def _parse_response(self, raw: dict, endpoint: str, latency_ms: float) -> LLMResponse:
        """Parse raw Foundation Model response into normalized LLMResponse."""
        # Databricks Foundation Model response format
        choices = raw.get("choices", [])
        if not choices:
            return LLMResponse(content="", model=endpoint, latency_ms=latency_ms, raw=raw)

        message = choices[0].get("message", {})
        content = message.get("content", "") or ""

        # Parse tool calls
        tool_calls = []
        raw_tool_calls = message.get("tool_calls", [])
        for tc in raw_tool_calls:
            func = tc.get("function", {})
            tool_calls.append({
                "id": tc.get("id", ""),
                "name": func.get("name", ""),
                "arguments": self._safe_parse_arguments(func.get("arguments", "{}")),
            })

        # Parse usage
        usage = raw.get("usage", {})
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)

        # Update budget
        self._budget.consume(prompt_tokens, completion_tokens)

        return LLMResponse(
            content=content,
            tool_calls=tool_calls,
            model=endpoint,
            tokens_prompt=prompt_tokens,
            tokens_completion=completion_tokens,
            tokens_total=total_tokens,
            latency_ms=latency_ms,
            raw=raw,
        )

    def _safe_parse_arguments(self, arguments) -> dict:
        """Parse tool call arguments safely."""
        if isinstance(arguments, dict):
            return arguments
        if isinstance(arguments, str):
            try:
                return json.loads(arguments)
            except json.JSONDecodeError:
                return {"raw": arguments}
        return {}


class LLMBudgetExhausted(Exception):
    """Raised when the token budget for a notebook run is depleted."""
    pass


class LLMAllEndpointsFailed(Exception):
    """Raised when both primary and fallback endpoints are unavailable."""
    pass
