"""
Production Enrichment Agent
Gathers context around alerts: threat intel, asset info, related events,
MITRE mapping, and campaign indicators.
"""

import json
from typing import Any

from ..core.agent_base import AgentBase, AgentContext, AgentDecision
from ..config.prompts import ENRICHMENT_AGENT_PROMPT
from ..config.thresholds import CONFIDENCE, TIME_WINDOWS


class EnrichmentAgent(AgentBase):
    """
    SOC Enrichment Agent.

    Responsibilities:
    - Query threat intel for IOC reputation
    - Gather asset and user context
    - Find related events within time windows
    - Map to MITRE ATT&CK
    - Identify campaign indicators
    """

    def __init__(self, llm_client: Any, tool_registry: Any, memory_store: Any, config: dict = None):
        super().__init__(
            agent_id="enrichment_agent",
            agent_name="Enrichment Agent",
            llm_client=llm_client,
            tool_registry=tool_registry,
            memory_store=memory_store,
            config=config or {
                "confidence_threshold": 0.6,
                "escalation_threshold": 0.3,
                "max_iterations": 8,
                "timeout_seconds": 120,
                "temperature": 0.1,
                "max_tokens": 4096,
            },
        )

    def get_system_prompt(self) -> str:
        return ENRICHMENT_AGENT_PROMPT

    def get_available_tools(self) -> list[dict]:
        return self.tool_registry.get_tool_schemas(agent_id=self.agent_id)

    def evaluate_confidence(self, context: AgentContext, response: str) -> float:
        """
        Enrichment confidence based on:
        - How many data sources were successfully queried
        - Whether key fields (threat intel, asset, user) are populated
        - Whether MITRE mapping was achieved
        """
        total_tools_needed = 4  # TI, asset, events, user context
        successful = [t for t in context.tool_results if t.success]
        data_completeness = min(len(successful) / total_tools_needed, 1.0)

        # Check if key enrichment fields are present
        response_lower = response.lower()
        key_fields_found = 0
        if "threat_intel" in response_lower or "reputation" in response_lower:
            key_fields_found += 1
        if "asset" in response_lower or "criticality" in response_lower:
            key_fields_found += 1
        if "related_events" in response_lower or "correlated" in response_lower:
            key_fields_found += 1
        if "mitre" in response_lower or "t1" in response_lower:
            key_fields_found += 1

        field_completeness = key_fields_found / 4.0

        return min((data_completeness * 0.6 + field_completeness * 0.4), 1.0)

    def format_decision(self, context: AgentContext, final_response: str) -> AgentDecision:
        """Format enrichment results into a decision for the next stage."""
        evidence = []
        for tr in context.tool_results:
            if tr.success and tr.output:
                evidence.append({
                    "tool": tr.tool_name,
                    "execution_time_ms": tr.execution_time_ms,
                    "result_summary": str(tr.output)[:1000] if tr.output else "No data",
                })

        # Determine risk level from enrichment
        risk_indicators = self._extract_risk_indicators(context)
        overall_risk = self._compute_risk(risk_indicators)

        return AgentDecision(
            session_id=context.session_id,
            action=f"ENRICHMENT_COMPLETE_{overall_risk.upper()}",
            reasoning=final_response,
            confidence=context.confidence_score,
            evidence=evidence,
            recommended_actions=self._get_recommendations(overall_risk, risk_indicators),
            requires_approval=False,
            metadata={
                "agent_id": self.agent_id,
                "risk_level": overall_risk,
                "risk_indicators": risk_indicators,
                "data_sources_queried": len(context.tool_results),
                "successful_queries": len([t for t in context.tool_results if t.success]),
                "iterations": context.iteration_count,
                "tokens_used": context.total_tokens_used,
            },
        )

    def _extract_risk_indicators(self, context: AgentContext) -> list[str]:
        """Extract risk indicators from tool results."""
        indicators = []

        for tr in context.tool_results:
            if not tr.success or not tr.output:
                continue

            output = tr.output if isinstance(tr.output, dict) else {}

            if tr.tool_name == "lookup_threat_intel":
                threat_level = output.get("threat_level", "unknown")
                if threat_level in ("malicious", "suspicious"):
                    indicators.append(f"IOC classified as {threat_level}")
                campaigns = output.get("campaigns", [])
                if campaigns:
                    indicators.append(f"Associated with campaigns: {', '.join(campaigns[:3])}")

            elif tr.tool_name == "query_delta_table":
                rows = output.get("rows", [])
                if len(rows) > 10:
                    indicators.append(f"High volume of related events ({len(rows)})")

            elif tr.tool_name == "graph_traversal":
                if output.get("lateral_movement_detected"):
                    indicators.append("Lateral movement patterns detected in graph")
                if output.get("critical_assets_at_risk", 0) > 0:
                    indicators.append(f"Critical assets in blast radius: {output['critical_assets_at_risk']}")

            elif tr.tool_name == "search_vector_index":
                results = output if isinstance(output, list) else []
                high_sim = [r for r in results if r.get("similarity", 0) > 0.9]
                if high_sim:
                    indicators.append(f"High similarity to {len(high_sim)} known attack patterns")

        return indicators

    def _compute_risk(self, indicators: list[str]) -> str:
        """Compute overall risk level from indicators."""
        if len(indicators) >= 4:
            return "critical"
        elif len(indicators) >= 2:
            return "high"
        elif len(indicators) >= 1:
            return "medium"
        return "low"

    def _get_recommendations(self, risk_level: str, indicators: list[str]) -> list[str]:
        """Generate recommendations based on risk level."""
        if risk_level == "critical":
            return [
                "Immediate investigation required",
                "Consider preemptive containment",
                "Notify SOC lead and incident commander",
                "Begin scope assessment",
            ]
        elif risk_level == "high":
            return [
                "Priority investigation within 30 minutes",
                "Assess containment options",
                "Check for additional compromised entities",
            ]
        elif risk_level == "medium":
            return [
                "Standard investigation workflow",
                "Monitor for escalation",
                "Check correlation with other recent alerts",
            ]
        return [
            "Low risk - continue monitoring",
            "Consider adding to watchlist",
        ]
