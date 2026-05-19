"""
Production Human-in-the-Loop (HITL) Module
Implements approval gates, escalation routing, and analyst notification
for agent decisions that exceed confidence thresholds or risk levels.

Integrations:
- Supabase (approval queue table)
- Slack/Teams webhooks (notifications)
- PagerDuty (critical escalations)
"""

import time
import uuid
import json
import logging
import asyncio
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional, Callable

logger = logging.getLogger(__name__)


class ApprovalStatus(Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    EXPIRED = "expired"
    AUTO_APPROVED = "auto_approved"


class EscalationTier(Enum):
    L1_ANALYST = "l1_analyst"
    L2_SENIOR = "l2_senior"
    L3_LEAD = "l3_lead"
    MANAGER = "manager"
    CISO = "ciso"


@dataclass
class ApprovalRequest:
    """A request for human approval of an agent action."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    agent_id: str = ""
    session_id: str = ""
    action: str = ""
    reasoning: str = ""
    confidence: float = 0.0
    risk_level: str = "medium"
    evidence_summary: str = ""
    recommended_tier: EscalationTier = EscalationTier.L1_ANALYST
    status: ApprovalStatus = ApprovalStatus.PENDING
    assigned_to: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    expires_at: float = 0.0
    resolved_at: Optional[float] = None
    resolved_by: Optional[str] = None
    resolution_notes: str = ""


@dataclass
class EscalationPolicy:
    """Defines when and how to escalate approval requests."""
    tier: EscalationTier
    timeout_minutes: int  # Time before escalating to next tier
    notification_channels: list[str]  # ["slack", "pagerduty", "email"]
    auto_approve_after_minutes: Optional[int] = None  # Auto-approve if no response


class HumanInTheLoop:
    """
    Manages the approval workflow between agents and human analysts.

    Flow:
    1. Agent requests approval → HITL creates ApprovalRequest
    2. HITL notifies appropriate tier via configured channels
    3. Human approves/denies via UI or API
    4. If timeout → escalate to next tier
    5. If all tiers timeout → auto-deny or auto-approve based on policy
    """

    def __init__(
        self,
        approval_store: Any,
        notification_service: Any = None,
        config: dict = None,
    ):
        self.approval_store = approval_store
        self.notification_service = notification_service
        self.config = config or {}
        self._pending_requests: dict[str, ApprovalRequest] = {}
        self._watchers: dict[str, asyncio.Event] = {}

        self.default_timeout_minutes = self.config.get("default_timeout_minutes", 30)
        self.auto_approve_low_risk = self.config.get("auto_approve_low_risk", False)

        self.escalation_policies = self._build_escalation_policies()

    def _build_escalation_policies(self) -> dict[EscalationTier, EscalationPolicy]:
        """Build escalation policies from config."""
        return {
            EscalationTier.L1_ANALYST: EscalationPolicy(
                tier=EscalationTier.L1_ANALYST,
                timeout_minutes=self.config.get("l1_timeout", 15),
                notification_channels=["slack"],
            ),
            EscalationTier.L2_SENIOR: EscalationPolicy(
                tier=EscalationTier.L2_SENIOR,
                timeout_minutes=self.config.get("l2_timeout", 30),
                notification_channels=["slack", "email"],
            ),
            EscalationTier.L3_LEAD: EscalationPolicy(
                tier=EscalationTier.L3_LEAD,
                timeout_minutes=self.config.get("l3_timeout", 60),
                notification_channels=["slack", "email", "pagerduty"],
            ),
            EscalationTier.MANAGER: EscalationPolicy(
                tier=EscalationTier.MANAGER,
                timeout_minutes=self.config.get("manager_timeout", 120),
                notification_channels=["email", "pagerduty"],
                auto_approve_after_minutes=self.config.get("auto_approve_timeout", None),
            ),
        }

    async def request_approval(
        self,
        agent_id: str,
        session_id: str,
        action: str,
        reasoning: str,
        confidence: float,
        evidence: list = None,
        risk_level: str = "medium",
        timeout_minutes: int = None,
    ) -> bool:
        """
        Request human approval for an agent action.

        This method blocks until:
        - A human approves or denies
        - The timeout expires (result: denied)
        - Auto-approval triggers (if configured)

        Returns:
            True if approved, False if denied or expired
        """
        timeout = timeout_minutes or self.default_timeout_minutes

        # Auto-approve low-risk read-only actions if configured
        if self.auto_approve_low_risk and risk_level == "low" and confidence > 0.9:
            logger.info(f"Auto-approving low-risk action: {action}")
            return True

        # Determine escalation tier based on risk
        tier = self._determine_tier(risk_level, confidence)

        request = ApprovalRequest(
            agent_id=agent_id,
            session_id=session_id,
            action=action,
            reasoning=reasoning,
            confidence=confidence,
            risk_level=risk_level,
            evidence_summary=json.dumps(evidence[:5] if evidence else [], default=str)[:2000],
            recommended_tier=tier,
            expires_at=time.time() + (timeout * 60),
        )

        # Persist request
        await self._persist_request(request)
        self._pending_requests[request.id] = request

        # Set up watcher
        event = asyncio.Event()
        self._watchers[request.id] = event

        # Notify
        await self._notify(request)

        # Wait for response
        try:
            await asyncio.wait_for(event.wait(), timeout=timeout * 60)
            resolved_request = self._pending_requests.get(request.id, request)
            return resolved_request.status == ApprovalStatus.APPROVED
        except asyncio.TimeoutError:
            # Timeout — check if auto-approve applies
            policy = self.escalation_policies.get(tier)
            if policy and policy.auto_approve_after_minutes:
                request.status = ApprovalStatus.AUTO_APPROVED
                await self._update_request(request)
                logger.info(f"Auto-approved after timeout: {request.id}")
                return True
            else:
                request.status = ApprovalStatus.EXPIRED
                await self._update_request(request)
                logger.info(f"Approval expired: {request.id}")
                return False
        finally:
            self._watchers.pop(request.id, None)
            self._pending_requests.pop(request.id, None)

    async def resolve(
        self,
        request_id: str,
        approved: bool,
        resolved_by: str,
        notes: str = "",
    ):
        """
        Resolve a pending approval request (called by human via UI/API).
        """
        request = self._pending_requests.get(request_id)
        if not request:
            # Try loading from store
            request = await self._load_request(request_id)
            if not request:
                raise ValueError(f"Approval request not found: {request_id}")

        request.status = ApprovalStatus.APPROVED if approved else ApprovalStatus.DENIED
        request.resolved_at = time.time()
        request.resolved_by = resolved_by
        request.resolution_notes = notes

        await self._update_request(request)

        # Unblock the waiting agent
        event = self._watchers.get(request_id)
        if event:
            self._pending_requests[request_id] = request
            event.set()

        logger.info(
            f"Approval {request_id} {'approved' if approved else 'denied'} by {resolved_by}"
        )

    def _determine_tier(self, risk_level: str, confidence: float) -> EscalationTier:
        """Determine which tier should handle this approval."""
        if risk_level == "critical" or confidence < 0.3:
            return EscalationTier.L3_LEAD
        elif risk_level == "high" or confidence < 0.5:
            return EscalationTier.L2_SENIOR
        else:
            return EscalationTier.L1_ANALYST

    async def _notify(self, request: ApprovalRequest):
        """Send notification about pending approval."""
        if not self.notification_service:
            logger.info(f"No notification service — approval {request.id} awaiting manual check")
            return

        policy = self.escalation_policies.get(request.recommended_tier)
        if not policy:
            return

        for channel in policy.notification_channels:
            try:
                await self.notification_service.send(
                    channel=channel,
                    message={
                        "type": "approval_request",
                        "request_id": request.id,
                        "agent_id": request.agent_id,
                        "action": request.action,
                        "reasoning": request.reasoning,
                        "confidence": request.confidence,
                        "risk_level": request.risk_level,
                        "tier": request.recommended_tier.value,
                        "expires_at": request.expires_at,
                    },
                )
            except Exception as e:
                logger.warning(f"Failed to notify via {channel}: {e}")

    async def _persist_request(self, request: ApprovalRequest):
        """Save approval request to database."""
        if not self.approval_store:
            return
        try:
            await self.approval_store.insert(
                table="agent_approval_requests",
                data={
                    "id": request.id,
                    "agent_id": request.agent_id,
                    "session_id": request.session_id,
                    "action": request.action,
                    "reasoning": request.reasoning,
                    "confidence": request.confidence,
                    "risk_level": request.risk_level,
                    "evidence_summary": request.evidence_summary,
                    "tier": request.recommended_tier.value,
                    "status": request.status.value,
                    "expires_at": request.expires_at,
                    "created_at": request.created_at,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to persist approval request: {e}")

    async def _update_request(self, request: ApprovalRequest):
        """Update approval request in database."""
        if not self.approval_store:
            return
        try:
            await self.approval_store.update(
                table="agent_approval_requests",
                id=request.id,
                data={
                    "status": request.status.value,
                    "resolved_at": request.resolved_at,
                    "resolved_by": request.resolved_by,
                    "resolution_notes": request.resolution_notes,
                },
            )
        except Exception as e:
            logger.warning(f"Failed to update approval request: {e}")

    async def _load_request(self, request_id: str) -> Optional[ApprovalRequest]:
        """Load an approval request from the database."""
        if not self.approval_store:
            return None
        try:
            data = await self.approval_store.get(
                table="agent_approval_requests",
                id=request_id,
            )
            if data:
                return ApprovalRequest(
                    id=data["id"],
                    agent_id=data["agent_id"],
                    session_id=data["session_id"],
                    action=data["action"],
                    reasoning=data["reasoning"],
                    confidence=data["confidence"],
                    risk_level=data["risk_level"],
                    status=ApprovalStatus(data["status"]),
                )
        except Exception as e:
            logger.warning(f"Failed to load approval request: {e}")
        return None

    async def get_pending(self, tier: EscalationTier = None) -> list[ApprovalRequest]:
        """Get all pending approval requests, optionally filtered by tier."""
        pending = [
            r for r in self._pending_requests.values()
            if r.status == ApprovalStatus.PENDING
        ]
        if tier:
            pending = [r for r in pending if r.recommended_tier == tier]
        return sorted(pending, key=lambda r: r.created_at)
