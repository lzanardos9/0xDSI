"""
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
