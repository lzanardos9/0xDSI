"""
Production Threat Hunter Agent
Proactively hunts for threats using hypothesis-driven investigation,
analytics-driven anomaly detection, and intelligence-driven searches.
"""

import json
from typing import Any

from ..core.agent_base import AgentBase, AgentContext, AgentDecision
from ..config.prompts import THREAT_HUNTER_AGENT_PROMPT
from ..config.thresholds import CONFIDENCE, RATE_LIMITS


class ThreatHunterAgent(AgentBase):
    """
    Autonomous Threat Hunting Agent.

    Methodologies:
    - Intelligence-driven: Start from known TTPs
    - Analytics-driven: Start from statistical anomalies
    - Situational-driven: Start from business context
    - Entity-driven: Trace all activity for specific entity
    """

    def __init__(self, llm_client: Any, tool_registry: Any, memory_store: Any, config: dict = None):
        super().__init__(
            agent_id="threat_hunter_agent",
            agent_name="Threat Hunter",
            llm_client=llm_client,
            tool_registry=tool_registry,
            memory_store=memory_store,
            config=config or {
                "confidence_threshold": CONFIDENCE["hunting_finding_minimum"],
                "escalation_threshold": 0.2,
                "max_iterations": 15,
                "timeout_seconds": 300,
                "temperature": 0.3,
                "max_tokens": 8192,
            },
        )

    def get_system_prompt(self) -> str:
        return THREAT_HUNTER_AGENT_PROMPT

    def get_available_tools(self) -> list[dict]:
        return self.tool_registry.get_tool_schemas(agent_id=self.agent_id)

    def evaluate_confidence(self, context: AgentContext, response: str) -> float:
        """
        Hunting confidence — null findings are valid.
        Confidence reflects how thorough the hunt was.
        """
        # More queries = more thorough hunt
        queries_executed = len([t for t in context.tool_results if t.success])
        thoroughness = min(queries_executed / 5.0, 1.0)

        # Check if findings are supported by evidence
        response_lower = response.lower()
        has_findings = "finding" in response_lower or "discovered" in response_lower
        has_evidence = "evidence" in response_lower or "indicator" in response_lower
        null_result = "no findings" in response_lower or "null result" in response_lower

        if null_result:
            return thoroughness * 0.9  # Null results are valid if thorough
        elif has_findings and has_evidence:
            return min(thoroughness + 0.2, 1.0)
        elif has_findings:
            return thoroughness * 0.7
        else:
            return thoroughness * 0.5

    def format_decision(self, context: AgentContext, final_response: str) -> AgentDecision:
        """Format hunting results into a structured decision."""
        evidence = []
        for tr in context.tool_results:
            if tr.success:
                evidence.append({
                    "tool": tr.tool_name,
                    "query_time_ms": tr.execution_time_ms,
                    "result_type": "data" if tr.output else "empty",
                })

        # Determine if this is an active threat (requires immediate response)
        active_threat = self._detect_active_threat(context, final_response)

        if active_threat:
            action = "ACTIVE_THREAT_FOUND"
            requires_approval = True
        else:
            action = "HUNT_COMPLETE"
            requires_approval = False

        return AgentDecision(
            session_id=context.session_id,
            action=action,
            reasoning=final_response,
            confidence=context.confidence_score,
            evidence=evidence,
            recommended_actions=self._get_recommendations(active_threat, context),
            requires_approval=requires_approval,
            metadata={
                "agent_id": self.agent_id,
                "active_threat": active_threat,
                "queries_executed": len(context.tool_results),
                "hunt_duration_seconds": context.metadata.get("elapsed_seconds", 0),
                "iterations": context.iteration_count,
                "tokens_used": context.total_tokens_used,
            },
        )

    def _detect_active_threat(self, context: AgentContext, response: str) -> bool:
        """Determine if hunting found an active, ongoing threat."""
        response_lower = response.lower()
        active_indicators = [
            "active threat", "currently active", "ongoing attack",
            "immediate action", "active c2", "live attacker",
            "exfiltration in progress", "lateral movement detected",
        ]
        return any(ind in response_lower for ind in active_indicators)

    def _get_recommendations(self, active_threat: bool, context: AgentContext) -> list[str]:
        """Generate recommendations based on hunting results."""
        if active_threat:
            return [
                "IMMEDIATE: Route to Investigation Agent for scope assessment",
                "IMMEDIATE: Prepare containment options",
                "Create high-priority case",
                "Notify SOC lead",
            ]

        # Non-urgent findings
        recs = []
        if context.confidence_score > 0.7:
            recs.append("Create new detection rule from findings")
            recs.append("Add discovered IOCs to watchlist")
        recs.append("Document hypothesis and results for team knowledge")
        recs.append("Schedule follow-up hunt in 7 days")
        return recs

    async def generate_hypothesis(self, context: dict) -> dict:
        """
        Generate a hunting hypothesis from available context.
        Called by the orchestrator to seed a hunt.
        """
        hypothesis_input = {
            "mode": "generate_hypothesis",
            "available_context": {
                "recent_alerts": context.get("recent_alerts", []),
                "threat_intel_updates": context.get("threat_intel", []),
                "environment_changes": context.get("changes", []),
                "time_since_last_hunt": context.get("last_hunt_age_days", 0),
            },
        }

        decision = await self.run(hypothesis_input)
        return {
            "hypothesis": decision.reasoning,
            "confidence": decision.confidence,
            "recommended_queries": decision.recommended_actions,
        }
