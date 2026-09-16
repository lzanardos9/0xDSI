"""
Threat escalation priority formula (server-side port of the app's engine).

The "Threat Escalation" tab computed event priority entirely in the browser
(`app/frontend/src/lib/threatEscalation.ts`, class `ThreatEscalationEngine`),
so scores only existed for events a human happened to open in that screen and
never landed in the lakehouse for correlation, response, or reporting. This
module is a faithful, line-for-line port of that engine so the exact same
priority can be computed for every event by the Databricks pipeline
(`notebooks/detection/08_threat_escalation_priority.py`) and persisted to
`event_priority_calculations`.

Pure stdlib (no Spark) so the notebook imports it on a cluster AND the offline
parity tests exercise the identical shipped logic. The reference implementation
is the TypeScript; any change here must keep `test_escalation_formula.py` green,
which pins the numeric outputs against hand-computed TS results.

Formula (ArcSight-style), matching the TS exactly:
    priority = (severity * severity_weight)
             * (mcr_factor * mcr_weight)
             * (threat_weight * (1 + threat_weight_multiplier * 100))
             * (asset_criticality * asset_weight)
where mcr_factor = (model_confidence / 10) * relevance_score.
"""

# Mirrors SEVERITY_SCORES in threatEscalation.ts (default 6 == medium).
SEVERITY_SCORES = {
    "very_low": 2,
    "low": 4,
    "medium": 6,
    "high": 8,
    "very_high": 10,
}
DEFAULT_SEVERITY_SCORE = 6

# CRITICALITY_SCORES.medium is the fallback when no asset row is found.
DEFAULT_ASSET_CRITICALITY = 1.0

# Formula-row defaults, matching the `formula?.x || default` fallbacks in TS.
DEFAULT_SEVERITY_WEIGHT = 1.0
DEFAULT_MCR_WEIGHT = 1.0
DEFAULT_THREAT_WEIGHT_MULTIPLIER = 0.03
DEFAULT_ASSET_WEIGHT = 1.0


def severity_score(initial_severity):
    return SEVERITY_SCORES.get(initial_severity, DEFAULT_SEVERITY_SCORE)


def calculate_mcr(event, asset):
    """Return (model_confidence, relevance_score), matching TS calculateMCR.

    `event` provides event_port and vulnerabilities; `asset` (or None) provides
    model_confidence, discovery_method, exposed_ports, known_vulnerabilities.
    """
    if not asset:
        return 3.0, 0.3

    model_confidence = asset.get("model_confidence") or 5.0
    discovery = asset.get("discovery_method")
    if discovery == "manual":
        model_confidence = min(model_confidence + 2, 10)
    elif discovery == "agent":
        model_confidence = min(model_confidence + 1, 10)

    relevance = 0.5
    event_port = event.get("event_port")
    exposed_ports = asset.get("exposed_ports") or []
    if event_port is not None and event_port in exposed_ports:
        relevance += 0.3

    vulns = event.get("vulnerabilities") or []
    known = asset.get("known_vulnerabilities") or []
    if vulns and known:
        known_ids = set()
        for kv in known:
            if isinstance(kv, dict):
                if kv.get("cve") is not None:
                    known_ids.add(kv["cve"])
                if kv.get("id") is not None:
                    known_ids.add(kv["id"])
            else:
                known_ids.add(kv)
        if any(v in known_ids for v in vulns):
            relevance += 0.4

    relevance = min(relevance, 1.0)
    return model_confidence, relevance


def calculate_threat_weight(source_ip, threat_intel):
    """Return the threat-intel weight, matching TS calculateThreatWeight."""
    if not source_ip or not threat_intel:
        return 1.0
    matching = [
        t for t in threat_intel
        if t.get("indicator_value") == source_ip and t.get("is_active")
    ]
    if not matching:
        return 1.0
    avg_severity = sum((t.get("threat_severity") or 5) for t in matching) / len(matching)
    return 1 + (avg_severity * 3) / 100


def asset_criticality(asset):
    if asset and asset.get("criticality_score") is not None:
        return asset["criticality_score"]
    return DEFAULT_ASSET_CRITICALITY


def priority_level(score):
    if score >= 9.0:
        return "critical"
    if score >= 7.0:
        return "very_high"
    if score >= 5.0:
        return "high"
    if score >= 3.0:
        return "medium"
    if score >= 1.0:
        return "low"
    return "very_low"


def calculate_priority(event, asset=None, threat_intel=None, formula=None):
    """Full port of ThreatEscalationEngine.calculatePriority.

    Returns a dict with the same fields the app persists to
    event_priority_calculations, so the notebook can write it directly.
    """
    formula = formula or {}
    sev = severity_score(event.get("initial_severity"))
    model_confidence, relevance = calculate_mcr(event, asset)
    mcr_factor = (model_confidence / 10.0) * relevance
    threat_weight = calculate_threat_weight(event.get("source_ip"), threat_intel)
    crit = asset_criticality(asset)

    severity_weight = formula.get("severity_weight") or DEFAULT_SEVERITY_WEIGHT
    mcr_weight = formula.get("mcr_weight") or DEFAULT_MCR_WEIGHT
    threat_multiplier = formula.get("threat_weight_multiplier") or DEFAULT_THREAT_WEIGHT_MULTIPLIER
    asset_weight = formula.get("asset_weight") or DEFAULT_ASSET_WEIGHT

    final_priority = (
        (sev * severity_weight)
        * (mcr_factor * mcr_weight)
        * (threat_weight * (1 + (threat_multiplier * 100)))
        * (crit * asset_weight)
    )
    final_priority = round(final_priority * 100) / 100
    level = priority_level(final_priority)

    return {
        "severity_score": sev,
        "model_confidence": model_confidence,
        "relevance_score": relevance,
        "mcr_factor": mcr_factor,
        "threat_weight": threat_weight,
        "asset_criticality": crit,
        "final_priority": final_priority,
        "priority_level": level,
        "details": {
            "severity_explanation": f"Initial severity: {event.get('initial_severity')} (score: {sev}/10)",
            "mcr_explanation": (
                f"Model Confidence: {model_confidence}/10, "
                f"Relevance: {relevance}, Combined MCR: {mcr_factor:.2f}"
            ),
            "threat_explanation": f"Threat intelligence weight: {threat_weight:.2f}",
            "asset_explanation": f"Asset criticality: {crit}x multiplier",
        },
    }
