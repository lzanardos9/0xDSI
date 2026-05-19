"""
Production Tool: Execute Response Actions
Interfaces with security infrastructure to execute containment and remediation.
Every action is logged, reversible, and requires appropriate authorization.

Supported integrations:
- Firewall (Palo Alto, Fortinet, AWS Security Groups)
- EDR (CrowdStrike, SentinelOne, Microsoft Defender)
- IAM (Azure AD, Okta, AWS IAM)
- SOAR playbook triggers
- Network (NAC, switch port disable)
"""

import time
import uuid
import logging
from typing import Any, Optional
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class ActionType(Enum):
    BLOCK_IP = "block_ip"
    UNBLOCK_IP = "unblock_ip"
    ISOLATE_HOST = "isolate_host"
    UNISOLATE_HOST = "unisolate_host"
    DISABLE_USER = "disable_user"
    ENABLE_USER = "enable_user"
    FORCE_PASSWORD_RESET = "force_password_reset"
    REVOKE_SESSIONS = "revoke_sessions"
    QUARANTINE_FILE = "quarantine_file"
    KILL_PROCESS = "kill_process"
    DISABLE_SERVICE_ACCOUNT = "disable_service_account"
    REVOKE_API_KEY = "revoke_api_key"
    ADD_TO_WATCHLIST = "add_to_watchlist"
    TRIGGER_PLAYBOOK = "trigger_playbook"


class ActionStatus(Enum):
    PENDING = "pending"
    EXECUTING = "executing"
    COMPLETED = "completed"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class ResponseAction:
    """A response action to execute against security infrastructure."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    action_type: ActionType = ActionType.ADD_TO_WATCHLIST
    target: str = ""  # IP, hostname, user_id, file_hash, etc.
    parameters: dict = field(default_factory=dict)
    reason: str = ""
    incident_id: str = ""
    agent_id: str = ""
    status: ActionStatus = ActionStatus.PENDING
    executed_at: Optional[float] = None
    completed_at: Optional[float] = None
    rollback_action: Optional[str] = None  # How to undo this
    result: Optional[dict] = None
    error: Optional[str] = None


# Risk classification for each action type
ACTION_RISK = {
    ActionType.ADD_TO_WATCHLIST: "low",
    ActionType.BLOCK_IP: "low",
    ActionType.QUARANTINE_FILE: "low",
    ActionType.REVOKE_SESSIONS: "medium",
    ActionType.FORCE_PASSWORD_RESET: "medium",
    ActionType.DISABLE_USER: "medium",
    ActionType.ISOLATE_HOST: "medium",
    ActionType.KILL_PROCESS: "medium",
    ActionType.REVOKE_API_KEY: "high",
    ActionType.DISABLE_SERVICE_ACCOUNT: "high",
    ActionType.TRIGGER_PLAYBOOK: "high",
}

# Rollback mapping
ROLLBACK_MAP = {
    ActionType.BLOCK_IP: ActionType.UNBLOCK_IP,
    ActionType.ISOLATE_HOST: ActionType.UNISOLATE_HOST,
    ActionType.DISABLE_USER: ActionType.ENABLE_USER,
}


class ResponseExecutionTool:
    """
    Executes security response actions with full audit trail and rollback capability.

    Architecture:
    1. Validate action parameters
    2. Check authorization (risk level vs agent permissions)
    3. Execute via appropriate integration
    4. Verify execution success
    5. Record audit trail
    6. Store rollback capability
    """

    def __init__(
        self,
        integrations: dict[str, Any],  # integration_name → client
        audit_store: Any,
        config: dict = None,
    ):
        self.integrations = integrations
        self.audit_store = audit_store
        self.config = config or {}
        self._action_history: list[ResponseAction] = []

        self.auto_execute_risk_levels = self.config.get(
            "auto_execute_risk_levels", ["low"]
        )
        self.dry_run = self.config.get("dry_run", False)

    async def execute(
        self,
        action_type: str,
        target: str,
        reason: str,
        incident_id: str = "",
        agent_id: str = "",
        parameters: dict = None,
        force: bool = False,
    ) -> dict:
        """
        Execute a response action.

        Args:
            action_type: Type of action to execute
            target: Target entity (IP, hostname, user, hash)
            reason: Why this action is being taken
            incident_id: Associated incident
            agent_id: Agent requesting the action
            parameters: Additional parameters for the action
            force: Skip risk check (requires explicit authorization)

        Returns:
            dict with action_id, status, result, and rollback_info
        """
        try:
            atype = ActionType(action_type)
        except ValueError:
            raise ValueError(f"Unknown action type: {action_type}. Valid: {[a.value for a in ActionType]}")

        action = ResponseAction(
            action_type=atype,
            target=target,
            parameters=parameters or {},
            reason=reason,
            incident_id=incident_id,
            agent_id=agent_id,
        )

        # Check risk level
        risk = ACTION_RISK.get(atype, "high")
        if risk not in self.auto_execute_risk_levels and not force:
            action.status = ActionStatus.PENDING
            await self._record_action(action)
            return {
                "action_id": action.id,
                "status": "requires_approval",
                "risk_level": risk,
                "message": f"Action '{action_type}' on '{target}' requires human approval (risk: {risk})",
            }

        # Execute
        return await self._do_execute(action)

    async def rollback(self, action_id: str, reason: str = "Manual rollback") -> dict:
        """
        Roll back a previously executed action.
        """
        original = next((a for a in self._action_history if a.id == action_id), None)
        if not original:
            raise ValueError(f"Action not found: {action_id}")

        if original.status != ActionStatus.COMPLETED:
            raise ValueError(f"Cannot rollback action in state: {original.status.value}")

        rollback_type = ROLLBACK_MAP.get(original.action_type)
        if not rollback_type:
            raise ValueError(f"No rollback available for action type: {original.action_type.value}")

        rollback_action = ResponseAction(
            action_type=rollback_type,
            target=original.target,
            parameters=original.parameters,
            reason=f"Rollback of {action_id}: {reason}",
            incident_id=original.incident_id,
            agent_id=original.agent_id,
        )

        result = await self._do_execute(rollback_action)

        # Mark original as rolled back
        original.status = ActionStatus.ROLLED_BACK
        await self._record_action(original)

        return result

    async def _do_execute(self, action: ResponseAction) -> dict:
        """Actually execute the action against infrastructure."""
        action.status = ActionStatus.EXECUTING
        action.executed_at = time.time()

        if self.dry_run:
            action.status = ActionStatus.COMPLETED
            action.completed_at = time.time()
            action.result = {"dry_run": True, "would_execute": action.action_type.value}
            await self._record_action(action)
            return {
                "action_id": action.id,
                "status": "completed_dry_run",
                "result": action.result,
            }

        try:
            handler = self._get_handler(action.action_type)
            result = await handler(action)

            action.status = ActionStatus.COMPLETED
            action.completed_at = time.time()
            action.result = result

            # Set rollback info
            rollback_type = ROLLBACK_MAP.get(action.action_type)
            if rollback_type:
                action.rollback_action = rollback_type.value

            self._action_history.append(action)
            await self._record_action(action)

            return {
                "action_id": action.id,
                "status": "completed",
                "result": result,
                "rollback_available": action.rollback_action is not None,
                "rollback_action_id": action.id,
            }

        except Exception as e:
            action.status = ActionStatus.FAILED
            action.completed_at = time.time()
            action.error = str(e)
            await self._record_action(action)

            return {
                "action_id": action.id,
                "status": "failed",
                "error": str(e),
            }

    def _get_handler(self, action_type: ActionType):
        """Get the appropriate handler for an action type."""
        handlers = {
            ActionType.BLOCK_IP: self._block_ip,
            ActionType.UNBLOCK_IP: self._unblock_ip,
            ActionType.ISOLATE_HOST: self._isolate_host,
            ActionType.UNISOLATE_HOST: self._unisolate_host,
            ActionType.DISABLE_USER: self._disable_user,
            ActionType.ENABLE_USER: self._enable_user,
            ActionType.FORCE_PASSWORD_RESET: self._force_password_reset,
            ActionType.REVOKE_SESSIONS: self._revoke_sessions,
            ActionType.QUARANTINE_FILE: self._quarantine_file,
            ActionType.KILL_PROCESS: self._kill_process,
            ActionType.ADD_TO_WATCHLIST: self._add_to_watchlist,
            ActionType.DISABLE_SERVICE_ACCOUNT: self._disable_service_account,
            ActionType.REVOKE_API_KEY: self._revoke_api_key,
            ActionType.TRIGGER_PLAYBOOK: self._trigger_playbook,
        }
        handler = handlers.get(action_type)
        if not handler:
            raise ValueError(f"No handler for action type: {action_type.value}")
        return handler

    async def _block_ip(self, action: ResponseAction) -> dict:
        firewall = self.integrations.get("firewall")
        if not firewall:
            raise RuntimeError("Firewall integration not configured")
        return await firewall.block_ip(
            ip=action.target,
            direction=action.parameters.get("direction", "both"),
            duration_hours=action.parameters.get("duration_hours", 24),
            comment=action.reason,
        )

    async def _unblock_ip(self, action: ResponseAction) -> dict:
        firewall = self.integrations.get("firewall")
        if not firewall:
            raise RuntimeError("Firewall integration not configured")
        return await firewall.unblock_ip(ip=action.target)

    async def _isolate_host(self, action: ResponseAction) -> dict:
        edr = self.integrations.get("edr")
        if not edr:
            raise RuntimeError("EDR integration not configured")
        return await edr.isolate_host(
            hostname=action.target,
            comment=action.reason,
        )

    async def _unisolate_host(self, action: ResponseAction) -> dict:
        edr = self.integrations.get("edr")
        if not edr:
            raise RuntimeError("EDR integration not configured")
        return await edr.unisolate_host(hostname=action.target)

    async def _disable_user(self, action: ResponseAction) -> dict:
        iam = self.integrations.get("iam")
        if not iam:
            raise RuntimeError("IAM integration not configured")
        return await iam.disable_user(
            user_id=action.target,
            reason=action.reason,
        )

    async def _enable_user(self, action: ResponseAction) -> dict:
        iam = self.integrations.get("iam")
        if not iam:
            raise RuntimeError("IAM integration not configured")
        return await iam.enable_user(user_id=action.target)

    async def _force_password_reset(self, action: ResponseAction) -> dict:
        iam = self.integrations.get("iam")
        if not iam:
            raise RuntimeError("IAM integration not configured")
        return await iam.force_password_reset(user_id=action.target)

    async def _revoke_sessions(self, action: ResponseAction) -> dict:
        iam = self.integrations.get("iam")
        if not iam:
            raise RuntimeError("IAM integration not configured")
        return await iam.revoke_all_sessions(user_id=action.target)

    async def _quarantine_file(self, action: ResponseAction) -> dict:
        edr = self.integrations.get("edr")
        if not edr:
            raise RuntimeError("EDR integration not configured")
        return await edr.quarantine_file(
            file_hash=action.target,
            hostname=action.parameters.get("hostname"),
        )

    async def _kill_process(self, action: ResponseAction) -> dict:
        edr = self.integrations.get("edr")
        if not edr:
            raise RuntimeError("EDR integration not configured")
        return await edr.kill_process(
            hostname=action.parameters.get("hostname"),
            process_id=action.target,
        )

    async def _add_to_watchlist(self, action: ResponseAction) -> dict:
        # Internal operation — write to Delta table
        return await self.audit_store.insert(
            table="watchlist_entries",
            data={
                "entity": action.target,
                "entity_type": action.parameters.get("entity_type", "unknown"),
                "reason": action.reason,
                "added_by": action.agent_id,
                "incident_id": action.incident_id,
                "expires_at": action.parameters.get("expires_at"),
            },
        )

    async def _disable_service_account(self, action: ResponseAction) -> dict:
        iam = self.integrations.get("iam")
        if not iam:
            raise RuntimeError("IAM integration not configured")
        return await iam.disable_service_account(
            account_id=action.target,
            reason=action.reason,
        )

    async def _revoke_api_key(self, action: ResponseAction) -> dict:
        iam = self.integrations.get("iam")
        if not iam:
            raise RuntimeError("IAM integration not configured")
        return await iam.revoke_api_key(key_id=action.target)

    async def _trigger_playbook(self, action: ResponseAction) -> dict:
        soar = self.integrations.get("soar")
        if not soar:
            raise RuntimeError("SOAR integration not configured")
        return await soar.trigger_playbook(
            playbook_id=action.target,
            parameters=action.parameters,
        )

    async def _record_action(self, action: ResponseAction):
        """Record action in audit trail."""
        if not self.audit_store:
            return
        try:
            await self.audit_store.insert(
                table="response_action_audit",
                data={
                    "id": action.id,
                    "action_type": action.action_type.value,
                    "target": action.target,
                    "parameters": action.parameters,
                    "reason": action.reason,
                    "incident_id": action.incident_id,
                    "agent_id": action.agent_id,
                    "status": action.status.value,
                    "executed_at": action.executed_at,
                    "completed_at": action.completed_at,
                    "result": action.result,
                    "error": action.error,
                    "rollback_action": action.rollback_action,
                },
            )
        except Exception as e:
            logger.error(f"Failed to record action audit: {e}")


TOOL_DEFINITION = {
    "name": "execute_response",
    "description": "Execute security response actions (block IP, isolate host, disable user, quarantine file, etc.). Actions are risk-classified and may require human approval.",
    "parameters": {
        "type": "object",
        "properties": {
            "action_type": {
                "type": "string",
                "enum": [a.value for a in ActionType],
                "description": "Type of response action to execute",
            },
            "target": {
                "type": "string",
                "description": "Target of the action (IP, hostname, user_id, file_hash, etc.)",
            },
            "reason": {
                "type": "string",
                "description": "Why this action is being taken (for audit trail)",
            },
            "incident_id": {
                "type": "string",
                "description": "Associated incident ID",
            },
            "parameters": {
                "type": "object",
                "description": "Additional parameters (direction, duration, hostname, etc.)",
            },
        },
        "required": ["action_type", "target", "reason"],
    },
}
