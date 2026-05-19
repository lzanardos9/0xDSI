"""
Production Escalation Matrix
Defines when agents should escalate to humans, which tier handles what,
and routing rules based on severity, asset criticality, and confidence.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class EscalationRule:
    """A single escalation routing rule."""
    name: str
    conditions: dict  # Conditions that trigger this rule
    target_tier: str  # l1_analyst | l2_senior | l3_lead | manager | ciso
    notification_channels: list[str]
    sla_minutes: int
    auto_approve: bool = False
    auto_approve_after_minutes: Optional[int] = None


ESCALATION_RULES = [
    # Critical severity on critical asset → immediate L3 + CISO notification
    EscalationRule(
        name="critical_on_critical_asset",
        conditions={
            "severity": "critical",
            "asset_criticality": "critical",
        },
        target_tier="l3_lead",
        notification_channels=["slack", "pagerduty", "email"],
        sla_minutes=5,
    ),

    # Critical severity → L2 with fast SLA
    EscalationRule(
        name="critical_severity",
        conditions={
            "severity": "critical",
        },
        target_tier="l2_senior",
        notification_channels=["slack", "pagerduty"],
        sla_minutes=10,
    ),

    # High severity + low confidence → L2
    EscalationRule(
        name="high_low_confidence",
        conditions={
            "severity": "high",
            "confidence_below": 0.5,
        },
        target_tier="l2_senior",
        notification_channels=["slack", "email"],
        sla_minutes=30,
    ),

    # High severity + good confidence → L1
    EscalationRule(
        name="high_normal",
        conditions={
            "severity": "high",
        },
        target_tier="l1_analyst",
        notification_channels=["slack"],
        sla_minutes=60,
    ),

    # Destructive response action → L3 minimum
    EscalationRule(
        name="destructive_response",
        conditions={
            "response_risk": "critical",
        },
        target_tier="l3_lead",
        notification_channels=["slack", "pagerduty", "email"],
        sla_minutes=15,
    ),

    # Service account disable → L2
    EscalationRule(
        name="service_account_action",
        conditions={
            "response_risk": "high",
            "entity_type": "service_account",
        },
        target_tier="l2_senior",
        notification_channels=["slack", "email"],
        sla_minutes=30,
    ),

    # Conflicting agent signals → L2
    EscalationRule(
        name="agent_conflict",
        conditions={
            "escalation_reason": "conflicting_signals",
        },
        target_tier="l2_senior",
        notification_channels=["slack"],
        sla_minutes=45,
    ),

    # Insider threat indicators → L3 + Manager
    EscalationRule(
        name="insider_threat",
        conditions={
            "attack_category": "insider_threat",
        },
        target_tier="manager",
        notification_channels=["email"],
        sla_minutes=60,
    ),

    # Data exfiltration detected → L2 immediate
    EscalationRule(
        name="data_exfiltration",
        conditions={
            "attack_category": "data_exfiltration",
        },
        target_tier="l2_senior",
        notification_channels=["slack", "pagerduty"],
        sla_minutes=15,
    ),

    # Medium severity default → L1 with generous SLA
    EscalationRule(
        name="medium_default",
        conditions={
            "severity": "medium",
        },
        target_tier="l1_analyst",
        notification_channels=["slack"],
        sla_minutes=240,
    ),

    # Low severity default → L1 with auto-approve option
    EscalationRule(
        name="low_default",
        conditions={
            "severity": "low",
        },
        target_tier="l1_analyst",
        notification_channels=["slack"],
        sla_minutes=480,
        auto_approve=False,
        auto_approve_after_minutes=1440,  # Auto-approve after 24h if no response
    ),
]


# On-call rotation mappings (integrate with PagerDuty/OpsGenie)
ON_CALL_SCHEDULES = {
    "l1_analyst": {
        "schedule_id": "PDSCHD_L1",  # PagerDuty schedule ID
        "fallback_email": "soc-l1@company.com",
        "slack_channel": "#soc-alerts-l1",
    },
    "l2_senior": {
        "schedule_id": "PDSCHD_L2",
        "fallback_email": "soc-l2@company.com",
        "slack_channel": "#soc-alerts-l2",
    },
    "l3_lead": {
        "schedule_id": "PDSCHD_L3",
        "fallback_email": "soc-lead@company.com",
        "slack_channel": "#soc-incidents",
    },
    "manager": {
        "schedule_id": "PDSCHD_MGR",
        "fallback_email": "security-manager@company.com",
        "slack_channel": "#security-leadership",
    },
    "ciso": {
        "schedule_id": "PDSCHD_CISO",
        "fallback_email": "ciso@company.com",
        "slack_channel": "#security-executive",
    },
}


def find_matching_rule(
    severity: str = "medium",
    confidence: float = 1.0,
    asset_criticality: str = "medium",
    response_risk: str = "low",
    attack_category: str = None,
    escalation_reason: str = None,
    entity_type: str = None,
) -> EscalationRule:
    """
    Find the most specific matching escalation rule for given conditions.
    Rules are evaluated in order — first match wins.
    """
    for rule in ESCALATION_RULES:
        conditions = rule.conditions
        match = True

        if "severity" in conditions and conditions["severity"] != severity:
            match = False
        if "confidence_below" in conditions and confidence >= conditions["confidence_below"]:
            match = False
        if "asset_criticality" in conditions and conditions["asset_criticality"] != asset_criticality:
            match = False
        if "response_risk" in conditions and conditions["response_risk"] != response_risk:
            match = False
        if "attack_category" in conditions and conditions["attack_category"] != attack_category:
            match = False
        if "escalation_reason" in conditions and conditions["escalation_reason"] != escalation_reason:
            match = False
        if "entity_type" in conditions and conditions["entity_type"] != entity_type:
            match = False

        if match:
            return rule

    # Default fallback
    return EscalationRule(
        name="default_fallback",
        conditions={},
        target_tier="l1_analyst",
        notification_channels=["slack"],
        sla_minutes=480,
    )
