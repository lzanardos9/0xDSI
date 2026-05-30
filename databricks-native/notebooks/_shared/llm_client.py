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
    - Specialized endpoint routing for psych/NLP analysis

    Model Hierarchy (all hosted in-workspace, zero data egress):
    ---------------------------------------------------------------
    Tier 1 (Primary - General SOC reasoning):
        databricks-meta-llama-3-1-70b-instruct
        Use: Triage, enrichment, investigation, tool calling

    Tier 2 (Fallback - Cost-effective):
        databricks-meta-llama-3-1-8b-instruct
        Use: Automatic fallback when Tier 1 unavailable

    Tier 3 (Specialized - Psychological/NLP analysis):
        databricks-dbrx-instruct (or fine-tuned sentiment model)
        Use: Communication analysis, sentiment scoring, intent classification
        Routing: Invoked explicitly via llm.analyze_communication()

    Tier 4 (Embeddings - Vector similarity):
        databricks-gte-large-en (or bge-large-en-v1.5)
        Use: Semantic embeddings for communication baseline drift detection

    Design Decision: All models hosted on Databricks Model Serving to ensure
    sensitive communication data (emails, chats, meetings) NEVER leaves the
    workspace perimeter. This eliminates the need for DPA/DPIA for external
    API providers while maintaining full analytical capability.

    Usage:
        from _shared.llm_client import SOCLLMClient
        from _shared.config import load_config

        cfg = load_config(dbutils)
        llm = SOCLLMClient(cfg)

        # Standard SOC agent reasoning
        response = llm.chat(
            system="You are a SOC triage agent.",
            user="Classify this alert: ...",
            temperature=0.1,
        )

        # Psychological/communication analysis
        psych = llm.analyze_communication(
            text="I'm so frustrated with this company...",
            analysis_type="sentiment",
        )
    """

    # Specialized endpoint defaults (overridable via system_settings)
    PSYCH_ENDPOINT_DEFAULT = "databricks-dbrx-instruct"
    EMBEDDING_ENDPOINT_DEFAULT = "databricks-gte-large-en"

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
        self._psych_endpoint = config.get(
            "psych_model_endpoint", self.PSYCH_ENDPOINT_DEFAULT
        )
        self._embedding_endpoint = config.get(
            "embedding_model_endpoint", self.EMBEDDING_ENDPOINT_DEFAULT
        )
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

    def analyze_communication(
        self,
        text: str,
        analysis_type: str = "full",
        context: Optional[str] = None,
        temperature: float = 0.05,
        max_tokens: int = 1024,
    ) -> LLMResponse:
        """
        Analyze communication text for psychological/behavioral signals.
        Uses the dedicated psych endpoint (DBRX) for higher accuracy on
        sentiment/intent tasks.

        Args:
            text: The communication text to analyze (message, email body, transcript)
            analysis_type: One of "sentiment", "intent", "toxicity", "topics", "full"
            context: Optional context (e.g., "slack_dm", "email_to_manager", "meeting")
            temperature: Low by default for consistent scoring
            max_tokens: Response budget

        Returns:
            LLMResponse containing structured JSON with scores and classifications

        Response format for analysis_type="full":
            {
                "sentiment_score": -0.4,
                "emotion": "frustration",
                "toxicity_score": 0.1,
                "intent": "venting",
                "topics": ["workload", "management"],
                "risk_signals": ["negative_sentiment_sustained"],
                "exfiltration_language": false,
                "job_search_indicators": false,
                "confidence": 0.87
            }
        """
        system_prompts = {
            "sentiment": (
                "You are a sentiment analysis engine for corporate communications monitoring. "
                "Analyze the provided text and return ONLY valid JSON with these fields: "
                "sentiment_score (float -1.0 to 1.0), emotion (primary emotion label), "
                "confidence (0.0 to 1.0). Be precise and consistent."
            ),
            "intent": (
                "You are an intent classification engine for insider threat detection. "
                "Classify the intent behind this communication. Return ONLY valid JSON: "
                "intent (one of: neutral, venting, planning, information_gathering, "
                "exfiltration_related, job_search, covering_tracks, social_engineering), "
                "confidence (0.0 to 1.0), reasoning (one sentence)."
            ),
            "toxicity": (
                "You are a toxicity detection engine for workplace communications. "
                "Score the toxicity level. Return ONLY valid JSON: "
                "toxicity_score (0.0 to 1.0), categories (list of: hostile, threatening, "
                "discriminatory, harassment, profanity, passive_aggressive, none), "
                "confidence (0.0 to 1.0)."
            ),
            "topics": (
                "You are a topic classification engine for corporate message monitoring. "
                "Extract topics discussed. Return ONLY valid JSON: "
                "topics (list of topic labels), sensitive_topics (list of any topics "
                "related to: credentials, access, security_tools, data_movement, "
                "resignation, legal, competitors), confidence (0.0 to 1.0)."
            ),
            "full": (
                "You are a psychological analysis engine for an insider threat detection "
                "program (UEBA). Analyze the communication text for behavioral signals. "
                "Return ONLY valid JSON with ALL of these fields:\n"
                "- sentiment_score: float -1.0 (very negative) to 1.0 (very positive)\n"
                "- emotion: primary emotion (neutral, joy, frustration, anger, fear, "
                "sadness, disgust, surprise, contempt)\n"
                "- toxicity_score: float 0.0 to 1.0\n"
                "- intent: one of (neutral, venting, planning, information_gathering, "
                "exfiltration_related, job_search, covering_tracks, social_engineering)\n"
                "- topics: list of topic labels\n"
                "- risk_signals: list of detected signals (empty if none)\n"
                "- exfiltration_language: boolean\n"
                "- job_search_indicators: boolean\n"
                "- confidence: float 0.0 to 1.0\n"
                "Be precise. Do not over-flag benign communications."
            ),
        }

        system = system_prompts.get(analysis_type, system_prompts["full"])
        user_msg = text
        if context:
            user_msg = f"[Context: {context}]\n\n{text}"

        self._ensure_client()

        # Use psych endpoint first, fall back to primary
        response = self._call_with_retry(
            endpoint=self._psych_endpoint,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            tools=None,
        )

        if response is not None:
            return response

        # Fall back to primary general-purpose model
        logger.warning(
            f"Psych endpoint '{self._psych_endpoint}' unavailable, "
            f"falling back to primary '{self._primary_endpoint}'"
        )
        response = self._call_with_retry(
            endpoint=self._primary_endpoint,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
            tools=None,
        )

        if response is not None:
            response.fallback_used = True
            return response

        raise LLMAllEndpointsFailed(
            f"Psych analysis failed on both '{self._psych_endpoint}' and '{self._primary_endpoint}'"
        )

    def embed_text(self, text: str) -> Optional[list]:
        """
        Generate text embedding for semantic similarity comparisons.
        Used to detect communication baseline drift (cosine distance from
        a user's historical communication embedding centroid).

        Args:
            text: Text to embed (max ~512 tokens for gte-large)

        Returns:
            List of floats (embedding vector) or None on failure
        """
        self._ensure_client()

        try:
            response = self._client.predict(
                endpoint=self._embedding_endpoint,
                inputs={"input": text},
            )
            # Databricks embedding response format
            data = response.get("data", [])
            if data:
                return data[0].get("embedding")
            return None
        except Exception as e:
            logger.warning(f"Embedding call failed: {type(e).__name__}: {e}")
            return None

    def batch_embed(self, texts: list, batch_size: int = 16) -> list:
        """
        Batch embed multiple texts efficiently.

        Args:
            texts: List of texts to embed
            batch_size: Number of texts per API call

        Returns:
            List of embedding vectors (None entries for failures)
        """
        self._ensure_client()
        all_embeddings = []

        for i in range(0, len(texts), batch_size):
            batch = texts[i:i + batch_size]
            try:
                response = self._client.predict(
                    endpoint=self._embedding_endpoint,
                    inputs={"input": batch},
                )
                data = response.get("data", [])
                for item in data:
                    all_embeddings.append(item.get("embedding"))
            except Exception as e:
                logger.warning(f"Batch embedding failed at offset {i}: {e}")
                all_embeddings.extend([None] * len(batch))

        return all_embeddings

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
