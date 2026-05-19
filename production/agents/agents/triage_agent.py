"""
Production Triage Agent
Performs initial alert classification, severity assessment, and routing.
"""

import json
from typing import Any

from ..core.agent_base import AgentBase, AgentContext, AgentDecision, EscalationReason
from ..config.prompts import TRIAGE_AGENT_PROMPT
from ..config.thresholds import CONFIDENCE, TIME_WINDOWS


class TriageAgent(AgentBase):
    """
    SOC Level 1 Triage Agent.

    Responsibilities:
    - Classify alert as TP/FP/Needs Investigation
    - Assign severity and priority
    - Route to appropriate next agent
    - Close obvious false positives with documentation
    """

    def __init__(self, llm_client: Any, tool_registry: Any, memory_store: Any, config: dict = None):
        super().__init__(
            agent_id="triage_agent",
            agent_name="Triage Agent",
            llm_client=llm_client,
            tool_registry=tool_registry,
            memory_store=memory_store,
            config=config or {
                "confidence_threshold": CONFIDENCE["auto_route_to_enrichment"],
                "escalation_threshold": CONFIDENCE["require_human_review"],
                "max_iterations": 5,
                "timeout_seconds": 60,
                "temperature": 0.1,
                "max_tokens": 2048,
            },
        )

        # Known false-positive patterns for fast classification
        self._fp_patterns = config.get("false_positive_patterns", []) if config else []

    def get_system_prompt(self) -> str:
        return TRIAGE_AGENT_PROMPT

    def get_available_tools(self) -> list[dict]:
        return self.tool_registry.get_tool_schemas(
            agent_id=self.agent_id,
            max_risk=None,  # Triage only needs read-only tools
        )

    def evaluate_confidence(self, context: AgentContext, response: str) -> float:
        """
        Evaluate triage confidence based on:
        - Number of evidence sources consulted
        - Clarity of classification signal
        - Historical accuracy for similar alerts
        """
        base_confidence = 0.7

        # More tool calls = more evidence = higher confidence
        successful_tools = [t for t in context.tool_results if t.success]
        evidence_bonus = min(len(successful_tools) * 0.05, 0.2)

        # Memory hits boost confidence (seen this before)
        memory_bonus = min(len(context.retrieved_memories) * 0.03, 0.1)

        # Check if response contains definitive language
        definitive_markers = ["clearly", "definitive", "confirmed", "known pattern"]
        uncertain_markers = ["unclear", "ambiguous", "might be", "possibly", "uncertain"]

        response_lower = response.lower()
        if any(m in response_lower for m in definitive_markers):
            language_bonus = 0.1
        elif any(m in response_lower for m in uncertain_markers):
            language_bonus = -0.15
        else:
            language_bonus = 0.0

        final = min(max(base_confidence + evidence_bonus + memory_bonus + language_bonus, 0.1), 1.0)
        return final

    def format_decision(self, context: AgentContext, final_response: str) -> AgentDecision:
        """Parse the LLM's triage response into a structured decision."""
        # Attempt to parse structured output from LLM
        classification = "needs_investigation"
        severity = "medium"
        next_action = "route_to_enrichment"
        reasoning = final_response
        evidence = []

        try:
            # Try to extract structured fields from response
            if "classification:" in final_response.lower():
                for line in final_response.split("\n"):
                    line_lower = line.lower().strip()
                    if line_lower.startswith("classification:"):
                        classification = line.split(":", 1)[1].strip().lower()
                    elif line_lower.startswith("severity:"):
                        severity = line.split(":", 1)[1].strip().lower()
                    elif line_lower.startswith("next_action:"):
                        next_action = line.split(":", 1)[1].strip().lower()
                    elif line_lower.startswith("reasoning:"):
                        reasoning = line.split(":", 1)[1].strip()
        except Exception:
            pass

        # Determine if response action requires approval
        requires_approval = False
        action = self._map_classification_to_action(classification, next_action)

        if classification == "false_positive" and context.confidence_score < CONFIDENCE["auto_close_false_positive"]:
            requires_approval = True

        # Collect evidence from tool results
        for tr in context.tool_results:
            if tr.success and tr.output:
                evidence.append({
                    "tool": tr.tool_name,
                    "summary": str(tr.output)[:500],
                })

        return AgentDecision(
            session_id=context.session_id,
            action=action,
            reasoning=reasoning,
            confidence=context.confidence_score,
            evidence=evidence,
            recommended_actions=self._get_recommendations(classification, severity),
            requires_approval=requires_approval,
            metadata={
                "agent_id": self.agent_id,
                "classification": classification,
                "severity": severity,
                "next_action": next_action,
                "iterations": context.iteration_count,
                "tokens_used": context.total_tokens_used,
            },
        )

    def _map_classification_to_action(self, classification: str, next_action: str) -> str:
        """Map triage classification to an orchestrator-understandable action."""
        action_map = {
            "true_positive": "ROUTE_TO_ENRICHMENT",
            "likely_true_positive": "ROUTE_TO_ENRICHMENT",
            "needs_investigation": "ROUTE_TO_INVESTIGATION",
            "false_positive": "CLOSE_FALSE_POSITIVE",
            "escalate": "ESCALATE_TO_HUMAN",
        }
        return action_map.get(classification, "ROUTE_TO_ENRICHMENT")

    def _get_recommendations(self, classification: str, severity: str) -> list[str]:
        """Generate recommended next actions based on classification."""
        if classification == "false_positive":
            return [
                "Close alert as false positive",
                "Consider adding exclusion rule for this pattern",
                "Update baseline if this is expected behavior",
            ]
        elif classification in ("true_positive", "likely_true_positive"):
            recs = ["Proceed with enrichment and investigation"]
            if severity in ("critical", "high"):
                recs.append("Notify SOC lead immediately")
                recs.append("Begin preliminary containment assessment")
            return recs
        elif classification == "escalate":
            return [
                "Manual analyst review required",
                "Conflicting signals or insufficient data",
                "Consider gathering additional context",
            ]
        return ["Continue investigation pipeline"]

    async def fast_triage(self, alert: dict) -> str:
        """
        Fast-path triage for common patterns without LLM call.
        Returns classification or None if LLM needed.
        """
        # Check known false-positive patterns
        for pattern in self._fp_patterns:
            field = pattern.get("field", "")
            value = pattern.get("value", "")
            if field in alert and value in str(alert[field]):
                return "false_positive"

        # Check if IOC already marked as known-bad
        if alert.get("src_ioc_match") and alert.get("src_ioc_threat_level") == "malicious":
            return "true_positive"

        # Check critical asset + high severity = always investigate
        if (alert.get("dst_asset_criticality") == "critical" and
                alert.get("severity_id", 0) >= 4):
            return "true_positive"

        return None  # Needs LLM reasoning
