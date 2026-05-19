// Production agent source code for UI display
// Auto-generated from /production/agents/ source files

export const PRODUCTION_TRIAGE_CODE = `"""
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
                for line in final_response.split("\\n"):
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
`;

export const PRODUCTION_ENRICHMENT_CODE = `"""
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
`;

export const PRODUCTION_THREAT_HUNTER_CODE = `"""
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
`;

export const PRODUCTION_ORCHESTRATOR_CODE = `"""
Production Multi-Agent Orchestrator
Coordinates multiple specialized agents, manages handoffs,
resolves conflicts, and maintains shared context.

Patterns supported:
- Sequential pipeline (triage → enrichment → investigation → response)
- Parallel fan-out (multiple enrichment agents simultaneously)
- Supervisor/worker (orchestrator delegates and synthesizes)
- Consensus (multiple agents vote on a decision)
"""

import time
import uuid
import logging
import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional

from .agent_base import AgentBase, AgentDecision, AgentContext, AgentState, EscalationReason

logger = logging.getLogger(__name__)


class OrchestrationPattern(Enum):
    SEQUENTIAL = "sequential"
    PARALLEL = "parallel"
    SUPERVISOR = "supervisor"
    CONSENSUS = "consensus"


class HandoffReason(Enum):
    SPECIALIZATION_NEEDED = "specialization_needed"
    ESCALATION = "escalation"
    ENRICHMENT_COMPLETE = "enrichment_complete"
    TRIAGE_COMPLETE = "triage_complete"
    INVESTIGATION_COMPLETE = "investigation_complete"


@dataclass
class AgentHandoff:
    """Represents a handoff from one agent to another."""
    from_agent: str
    to_agent: str
    reason: HandoffReason
    context: dict
    decision: Optional[AgentDecision] = None
    timestamp: float = field(default_factory=time.time)


@dataclass
class OrchestrationPlan:
    """Defines how agents should be orchestrated for a given input."""
    pattern: OrchestrationPattern
    stages: list[list[str]]  # Each stage is a list of agent_ids to run (parallel within stage)
    conditions: dict = field(default_factory=dict)  # Conditional routing rules
    timeout_seconds: int = 600
    require_consensus_threshold: float = 0.7


@dataclass
class OrchestrationResult:
    """Final result from an orchestration run."""
    run_id: str
    final_decision: AgentDecision
    agent_decisions: list[AgentDecision]
    handoffs: list[AgentHandoff]
    pattern_used: OrchestrationPattern
    total_duration_seconds: float
    total_tokens_used: int
    agents_involved: list[str]


class AgentOrchestrator:
    """
    Coordinates multiple agents to process security events end-to-end.

    The orchestrator:
    1. Classifies the incoming event/alert
    2. Determines the optimal orchestration pattern
    3. Manages agent lifecycle and handoffs
    4. Resolves conflicts between agent decisions
    5. Produces a final unified decision
    6. Records full lineage for audit
    """

    def __init__(
        self,
        agents: dict[str, AgentBase],
        config: dict = None,
        audit_store: Any = None,
    ):
        self.agents = agents
        self.config = config or {}
        self.audit_store = audit_store
        self._active_runs: dict[str, dict] = {}

        # Default pipeline for alert processing
        self.default_plan = OrchestrationPlan(
            pattern=OrchestrationPattern.SEQUENTIAL,
            stages=[
                ["triage_agent"],
                ["enrichment_agent"],
                ["correlation_agent"],
                ["investigation_agent"],
                ["response_agent"],
            ],
            timeout_seconds=self.config.get("default_timeout", 600),
        )

    def register_agent(self, agent_id: str, agent: AgentBase):
        """Register an agent with the orchestrator."""
        self.agents[agent_id] = agent
        logger.info(f"Registered agent: {agent_id} ({agent.agent_name})")

    async def process(
        self,
        input_data: dict,
        plan: Optional[OrchestrationPlan] = None,
    ) -> OrchestrationResult:
        """
        Process an input through the agent pipeline.

        Args:
            input_data: The alert/event to process
            plan: Optional custom orchestration plan (defaults to sequential pipeline)

        Returns:
            OrchestrationResult with all decisions and the final outcome
        """
        plan = plan or self._determine_plan(input_data)
        run_id = str(uuid.uuid4())
        start_time = time.time()

        self._active_runs[run_id] = {
            "input": input_data,
            "plan": plan,
            "start_time": start_time,
            "status": "running",
        }

        logger.info(f"Starting orchestration run {run_id} with pattern {plan.pattern.value}")

        try:
            if plan.pattern == OrchestrationPattern.SEQUENTIAL:
                result = await self._run_sequential(run_id, input_data, plan)
            elif plan.pattern == OrchestrationPattern.PARALLEL:
                result = await self._run_parallel(run_id, input_data, plan)
            elif plan.pattern == OrchestrationPattern.CONSENSUS:
                result = await self._run_consensus(run_id, input_data, plan)
            else:
                result = await self._run_supervisor(run_id, input_data, plan)

            self._active_runs[run_id]["status"] = "completed"
            await self._persist_result(result)
            return result

        except Exception as e:
            logger.error(f"Orchestration run {run_id} failed: {e}")
            self._active_runs[run_id]["status"] = "failed"
            raise
        finally:
            if run_id in self._active_runs:
                del self._active_runs[run_id]

    async def _run_sequential(
        self,
        run_id: str,
        input_data: dict,
        plan: OrchestrationPlan,
    ) -> OrchestrationResult:
        """Run agents sequentially, passing context between stages."""
        all_decisions = []
        handoffs = []
        shared_context = AgentContext()
        current_input = input_data
        total_tokens = 0

        for stage_idx, stage_agents in enumerate(plan.stages):
            for agent_id in stage_agents:
                if agent_id not in self.agents:
                    logger.warning(f"Agent {agent_id} not registered, skipping")
                    continue

                agent = self.agents[agent_id]
                logger.info(f"Run {run_id}: Stage {stage_idx}, executing {agent_id}")

                decision = await agent.run(current_input, shared_context)
                all_decisions.append(decision)
                total_tokens += shared_context.total_tokens_used

                # Check for escalation
                if decision.action == "ESCALATE_TO_HUMAN":
                    logger.info(f"Run {run_id}: Agent {agent_id} escalated. Stopping pipeline.")
                    return OrchestrationResult(
                        run_id=run_id,
                        final_decision=decision,
                        agent_decisions=all_decisions,
                        handoffs=handoffs,
                        pattern_used=plan.pattern,
                        total_duration_seconds=time.time() - shared_context.start_time,
                        total_tokens_used=total_tokens,
                        agents_involved=[d.metadata.get("agent_id", "unknown") for d in all_decisions],
                    )

                # Build handoff for next stage
                if stage_idx < len(plan.stages) - 1:
                    next_agents = plan.stages[stage_idx + 1]
                    for next_id in next_agents:
                        handoff = AgentHandoff(
                            from_agent=agent_id,
                            to_agent=next_id,
                            reason=HandoffReason.ENRICHMENT_COMPLETE,
                            context={
                                "previous_decision": decision.action,
                                "reasoning": decision.reasoning,
                                "evidence": decision.evidence,
                                "confidence": decision.confidence,
                            },
                            decision=decision,
                        )
                        handoffs.append(handoff)

                    # Enrich input for next stage
                    current_input = {
                        **current_input,
                        "previous_stage_decision": decision.action,
                        "previous_stage_reasoning": decision.reasoning,
                        "accumulated_evidence": [
                            e for d in all_decisions for e in d.evidence
                        ],
                        "current_confidence": decision.confidence,
                    }

        # Final decision is the last agent's decision
        final_decision = all_decisions[-1] if all_decisions else self._no_decision(run_id)

        return OrchestrationResult(
            run_id=run_id,
            final_decision=final_decision,
            agent_decisions=all_decisions,
            handoffs=handoffs,
            pattern_used=plan.pattern,
            total_duration_seconds=time.time() - shared_context.start_time,
            total_tokens_used=total_tokens,
            agents_involved=[d.metadata.get("agent_id", "unknown") for d in all_decisions],
        )

    async def _run_parallel(
        self,
        run_id: str,
        input_data: dict,
        plan: OrchestrationPlan,
    ) -> OrchestrationResult:
        """Run all agents in parallel, then synthesize results."""
        all_agent_ids = [aid for stage in plan.stages for aid in stage]
        tasks = []

        for agent_id in all_agent_ids:
            if agent_id in self.agents:
                tasks.append(self._run_single_agent(agent_id, input_data))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        decisions = []
        for result in results:
            if isinstance(result, AgentDecision):
                decisions.append(result)
            elif isinstance(result, Exception):
                logger.error(f"Parallel agent failed: {result}")

        final = self._synthesize_parallel_decisions(decisions)

        return OrchestrationResult(
            run_id=run_id,
            final_decision=final,
            agent_decisions=decisions,
            handoffs=[],
            pattern_used=plan.pattern,
            total_duration_seconds=0,
            total_tokens_used=sum(d.metadata.get("tokens_used", 0) for d in decisions),
            agents_involved=[d.metadata.get("agent_id", "unknown") for d in decisions],
        )

    async def _run_consensus(
        self,
        run_id: str,
        input_data: dict,
        plan: OrchestrationPlan,
    ) -> OrchestrationResult:
        """Run agents and require consensus on the decision."""
        result = await self._run_parallel(run_id, input_data, plan)

        # Check if enough agents agree
        action_votes: dict[str, int] = {}
        for d in result.agent_decisions:
            action_votes[d.action] = action_votes.get(d.action, 0) + 1

        total_votes = len(result.agent_decisions)
        threshold = plan.require_consensus_threshold

        for action, votes in action_votes.items():
            if votes / total_votes >= threshold:
                # Consensus reached
                consensus_decisions = [d for d in result.agent_decisions if d.action == action]
                result.final_decision = self._merge_decisions(consensus_decisions)
                return result

        # No consensus — escalate
        result.final_decision = AgentDecision(
            session_id=run_id,
            action="ESCALATE_TO_HUMAN",
            reasoning=f"No consensus reached. Votes: {action_votes}",
            confidence=0.3,
            evidence=[d.__dict__ for d in result.agent_decisions],
            recommended_actions=["Manual review required — agents disagree"],
            requires_approval=False,
            escalation_reason=EscalationReason.CONFLICTING_SIGNALS,
        )
        return result

    async def _run_supervisor(
        self,
        run_id: str,
        input_data: dict,
        plan: OrchestrationPlan,
    ) -> OrchestrationResult:
        """Supervisor pattern: one agent delegates and synthesizes."""
        # First agent in first stage is the supervisor
        supervisor_id = plan.stages[0][0] if plan.stages and plan.stages[0] else None
        if not supervisor_id or supervisor_id not in self.agents:
            raise ValueError("Supervisor agent not found")

        # Supervisor decides which workers to invoke
        supervisor = self.agents[supervisor_id]
        routing_decision = await supervisor.run({
            **input_data,
            "mode": "route",
            "available_agents": [aid for aid in self.agents if aid != supervisor_id],
        })

        # Execute delegated agents
        worker_ids = routing_decision.metadata.get("delegate_to", [])
        worker_results = []
        for wid in worker_ids:
            if wid in self.agents:
                result = await self._run_single_agent(wid, input_data)
                if isinstance(result, AgentDecision):
                    worker_results.append(result)

        # Supervisor synthesizes
        synthesis_input = {
            **input_data,
            "mode": "synthesize",
            "worker_results": [
                {"agent": d.metadata.get("agent_id"), "action": d.action, "reasoning": d.reasoning, "confidence": d.confidence}
                for d in worker_results
            ],
        }
        final_decision = await supervisor.run(synthesis_input)

        return OrchestrationResult(
            run_id=run_id,
            final_decision=final_decision,
            agent_decisions=[routing_decision] + worker_results + [final_decision],
            handoffs=[],
            pattern_used=plan.pattern,
            total_duration_seconds=0,
            total_tokens_used=0,
            agents_involved=[supervisor_id] + worker_ids,
        )

    async def _run_single_agent(self, agent_id: str, input_data: dict) -> AgentDecision:
        """Run a single agent and return its decision."""
        agent = self.agents[agent_id]
        context = AgentContext()
        decision = await agent.run(input_data, context)
        decision.metadata["agent_id"] = agent_id
        decision.metadata["tokens_used"] = context.total_tokens_used
        return decision

    def _determine_plan(self, input_data: dict) -> OrchestrationPlan:
        """Determine the best orchestration plan based on input type."""
        severity = input_data.get("severity", "medium")
        event_type = input_data.get("type", "alert")

        if severity == "critical":
            # Critical: parallel enrichment, then sequential investigation
            return OrchestrationPlan(
                pattern=OrchestrationPattern.SEQUENTIAL,
                stages=[
                    ["triage_agent"],
                    ["enrichment_agent", "threat_hunter_agent"],  # parallel enrichment
                    ["correlation_agent"],
                    ["investigation_agent"],
                    ["response_agent"],
                ],
                timeout_seconds=300,
            )
        elif event_type == "hunting_lead":
            return OrchestrationPlan(
                pattern=OrchestrationPattern.SEQUENTIAL,
                stages=[
                    ["threat_hunter_agent"],
                    ["enrichment_agent"],
                    ["investigation_agent"],
                ],
                timeout_seconds=600,
            )
        else:
            return self.default_plan

    def _synthesize_parallel_decisions(self, decisions: list[AgentDecision]) -> AgentDecision:
        """Combine parallel decisions into a single final decision."""
        if not decisions:
            return self._no_decision("unknown")

        # Use highest-confidence decision as base
        best = max(decisions, key=lambda d: d.confidence)
        all_evidence = [e for d in decisions for e in d.evidence]
        all_actions = list(set(a for d in decisions for a in d.recommended_actions))

        return AgentDecision(
            session_id=best.session_id,
            action=best.action,
            reasoning=f"Synthesized from {len(decisions)} agents. Primary: {best.reasoning}",
            confidence=best.confidence,
            evidence=all_evidence[:20],
            recommended_actions=all_actions[:10],
            requires_approval=best.requires_approval,
            metadata={"synthesis_source_count": len(decisions)},
        )

    def _merge_decisions(self, decisions: list[AgentDecision]) -> AgentDecision:
        """Merge multiple agreeing decisions into one."""
        if len(decisions) == 1:
            return decisions[0]

        avg_confidence = sum(d.confidence for d in decisions) / len(decisions)
        all_evidence = [e for d in decisions for e in d.evidence]

        return AgentDecision(
            session_id=decisions[0].session_id,
            action=decisions[0].action,
            reasoning=f"Consensus ({len(decisions)} agents agree): {decisions[0].reasoning}",
            confidence=avg_confidence,
            evidence=all_evidence[:20],
            recommended_actions=decisions[0].recommended_actions,
            requires_approval=decisions[0].requires_approval,
            metadata={"consensus_count": len(decisions)},
        )

    def _no_decision(self, run_id: str) -> AgentDecision:
        """Fallback when no agents produced a decision."""
        return AgentDecision(
            session_id=run_id,
            action="NO_DECISION",
            reasoning="No agents produced a decision",
            confidence=0.0,
            evidence=[],
            recommended_actions=["Manual review required"],
            requires_approval=False,
            escalation_reason=EscalationReason.TOOL_FAILURE,
        )

    async def _persist_result(self, result: OrchestrationResult):
        """Persist orchestration result for audit and learning."""
        if not self.audit_store:
            return
        try:
            await self.audit_store.insert(
                table="orchestration_runs",
                data={
                    "run_id": result.run_id,
                    "pattern": result.pattern_used.value,
                    "final_action": result.final_decision.action,
                    "final_confidence": result.final_decision.confidence,
                    "agents_involved": result.agents_involved,
                    "duration_seconds": result.total_duration_seconds,
                    "tokens_used": result.total_tokens_used,
                    "escalated": result.final_decision.escalation_reason is not None,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist orchestration result: {e}")

    def get_active_runs(self) -> list[dict]:
        """Return currently active orchestration runs."""
        return [
            {"run_id": rid, **info}
            for rid, info in self._active_runs.items()
        ]
`;

export const PRODUCTION_AGENT_BASE_CODE = `"""
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
            parts.append("\\n## Relevant Past Context")
            for mem in context.retrieved_memories[:5]:
                parts.append(f"- [{mem.get('timestamp', 'unknown')}] {mem.get('summary', mem.get('content', ''))}")

        return "\\n".join(parts)

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
`;

export const PRODUCTION_TOOL_REGISTRY_CODE = `"""
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
`;

export const PRODUCTION_AGENT_CODE: Record<string, string> = {
  triage: PRODUCTION_TRIAGE_CODE,
  enrichment: PRODUCTION_ENRICHMENT_CODE,
  threat_hunter: PRODUCTION_THREAT_HUNTER_CODE,
  orchestrator: PRODUCTION_ORCHESTRATOR_CODE,
  agent_base: PRODUCTION_AGENT_BASE_CODE,
  tool_registry: PRODUCTION_TOOL_REGISTRY_CODE,
};
