"""
Production Tool: Create & Manage Cases
Creates structured incident cases with evidence, timeline, MITRE mapping,
and full chain of custody.
"""

import time
import uuid
import logging
from typing import Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class CaseEvidence:
    """A piece of evidence attached to a case."""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    evidence_type: str = ""  # alert, event, ioc, screenshot, memory_dump, network_capture
    source: str = ""
    content: dict = field(default_factory=dict)
    hash_value: str = ""
    collected_at: float = field(default_factory=time.time)
    collected_by: str = ""
    chain_of_custody: list = field(default_factory=list)


@dataclass
class CaseTimeline:
    """A timeline entry for the incident."""
    timestamp: str
    description: str
    source: str
    entity: str = ""
    mitre_technique: str = ""
    evidence_ids: list = field(default_factory=list)


class CaseManagementTool:
    """
    Creates and manages incident cases with:
    - Structured evidence collection with chain of custody
    - Timeline reconstruction
    - MITRE ATT&CK mapping
    - Collaboration and assignment
    - SLA tracking
    """

    def __init__(self, case_store: Any, config: dict = None):
        self.case_store = case_store
        self.config = config or {}

    async def create_case(
        self,
        title: str,
        description: str,
        severity: str,
        alert_ids: list[str] = None,
        assigned_to: str = None,
        mitre_techniques: list[str] = None,
        initial_evidence: list[dict] = None,
        tags: list[str] = None,
        agent_id: str = "",
    ) -> dict:
        """
        Create a new incident case.

        Args:
            title: Case title
            description: Detailed description of the incident
            severity: critical | high | medium | low
            alert_ids: Source alert IDs that triggered this case
            assigned_to: User ID to assign
            mitre_techniques: MITRE ATT&CK technique IDs
            initial_evidence: Initial evidence to attach
            tags: Classification tags
            agent_id: Creating agent

        Returns:
            dict with case_id, status, and created details
        """
        case_id = str(uuid.uuid4())
        now = time.time()

        case_data = {
            "id": case_id,
            "title": title,
            "description": description,
            "severity": severity,
            "status": "open",
            "priority": self._compute_priority(severity),
            "source_alert_ids": alert_ids or [],
            "assigned_to": assigned_to,
            "created_by": agent_id or "system",
            "created_at": now,
            "updated_at": now,
            "mitre_techniques": mitre_techniques or [],
            "tags": tags or [],
            "sla_breach_at": now + self._sla_seconds(severity),
            "evidence_count": len(initial_evidence or []),
            "timeline_count": 0,
        }

        try:
            await self.case_store.insert(table="cases", data=case_data)

            # Attach initial evidence
            if initial_evidence:
                for ev in initial_evidence:
                    await self._attach_evidence(case_id, ev, agent_id)

            logger.info(f"Created case {case_id}: {title} (severity: {severity})")

            return {
                "case_id": case_id,
                "status": "created",
                "severity": severity,
                "priority": case_data["priority"],
                "assigned_to": assigned_to,
                "sla_breach_at": case_data["sla_breach_at"],
            }

        except Exception as e:
            logger.error(f"Failed to create case: {e}")
            raise

    async def add_evidence(
        self,
        case_id: str,
        evidence_type: str,
        source: str,
        content: dict,
        collected_by: str = "",
    ) -> dict:
        """Add evidence to an existing case."""
        evidence = {
            "id": str(uuid.uuid4()),
            "case_id": case_id,
            "evidence_type": evidence_type,
            "source": source,
            "content": content,
            "collected_at": time.time(),
            "collected_by": collected_by,
        }

        await self.case_store.insert(table="case_evidence", data=evidence)
        return {"evidence_id": evidence["id"], "status": "attached"}

    async def add_timeline_entry(
        self,
        case_id: str,
        timestamp: str,
        description: str,
        source: str,
        entity: str = "",
        mitre_technique: str = "",
        evidence_ids: list[str] = None,
    ) -> dict:
        """Add a timeline entry to the case."""
        entry = {
            "id": str(uuid.uuid4()),
            "case_id": case_id,
            "timestamp": timestamp,
            "description": description,
            "source": source,
            "entity": entity,
            "mitre_technique": mitre_technique,
            "evidence_ids": evidence_ids or [],
            "created_at": time.time(),
        }

        await self.case_store.insert(table="case_timeline", data=entry)
        return {"timeline_entry_id": entry["id"], "status": "added"}

    async def update_case(
        self,
        case_id: str,
        updates: dict,
    ) -> dict:
        """Update case fields (status, severity, assignment, etc.)."""
        updates["updated_at"] = time.time()
        await self.case_store.update(table="cases", id=case_id, data=updates)
        return {"case_id": case_id, "status": "updated", "fields": list(updates.keys())}

    async def _attach_evidence(self, case_id: str, evidence: dict, collector: str):
        """Attach evidence to a case."""
        await self.case_store.insert(table="case_evidence", data={
            "id": str(uuid.uuid4()),
            "case_id": case_id,
            "evidence_type": evidence.get("type", "unknown"),
            "source": evidence.get("source", "agent"),
            "content": evidence,
            "collected_at": time.time(),
            "collected_by": collector,
        })

    def _compute_priority(self, severity: str) -> int:
        """Map severity to numeric priority (lower = more urgent)."""
        return {"critical": 1, "high": 2, "medium": 3, "low": 4}.get(severity, 3)

    def _sla_seconds(self, severity: str) -> float:
        """Get SLA in seconds based on severity."""
        sla_hours = {"critical": 1, "high": 4, "medium": 24, "low": 72}.get(severity, 24)
        return sla_hours * 3600


TOOL_DEFINITION = {
    "name": "create_case",
    "description": "Create an incident case with evidence, timeline, MITRE ATT&CK mapping, and assign to an analyst. Also add evidence or timeline entries to existing cases.",
    "parameters": {
        "type": "object",
        "properties": {
            "operation": {
                "type": "string",
                "enum": ["create", "add_evidence", "add_timeline", "update"],
                "description": "Operation to perform",
            },
            "case_id": {
                "type": "string",
                "description": "Case ID (required for add_evidence, add_timeline, update)",
            },
            "title": {"type": "string", "description": "Case title (for create)"},
            "description": {"type": "string", "description": "Detailed description"},
            "severity": {"type": "string", "enum": ["critical", "high", "medium", "low"]},
            "alert_ids": {"type": "array", "items": {"type": "string"}},
            "mitre_techniques": {"type": "array", "items": {"type": "string"}},
            "evidence": {
                "type": "object",
                "description": "Evidence to attach (type, source, content)",
            },
            "timeline_entry": {
                "type": "object",
                "properties": {
                    "timestamp": {"type": "string"},
                    "description": {"type": "string"},
                    "source": {"type": "string"},
                    "entity": {"type": "string"},
                    "mitre_technique": {"type": "string"},
                },
            },
            "updates": {
                "type": "object",
                "description": "Fields to update (for update operation)",
            },
        },
        "required": ["operation"],
    },
}
