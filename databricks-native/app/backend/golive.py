"""Go-live readiness: the checklist that decides whether this deployment may carry production load.

Automated checks are measured by the backend on every request; sign-off checks
are attested by an admin and stored append-only (latest decision per check wins).
Blockers must pass or be signed; advisories may be waived with a reason. The
verdict is never green while any blocker is failing, unknown or unsigned.
"""

CHECKS = (
    # id, group, title, kind, severity, what it proves / how to fix
    ("config", "Platform", "Required settings present", "auto", "blocker",
     "Warehouse, catalog and schema are configured and well-formed."),
    ("warehouse", "Platform", "SQL warehouse answers queries", "auto", "blocker",
     "A bounded SELECT 1 canary returns within budget."),
    ("access_mode", "Security", "Queries run as the signed-in user", "auto", "advisory",
     "With on-behalf-of user access, Unity Catalog row and column rules apply per person."),
    ("custody_key", "Security", "Chain-of-custody signing key loaded", "auto", "blocker",
     "Live identity events are signed, not only hashed, so evidence is tamper-evident."),
    ("roles", "Security", "Admin and analyst roles assigned", "auto", "blocker",
     "At least one admin and one analyst are mapped, so approvals can be separated."),
    ("identity_tables", "Identity data", "Identity tables exist", "auto", "blocker",
     "Every table the Identity menu reads is present in the app schema."),
    ("identity_populated", "Identity data", "Identities resolved", "auto", "blocker",
     "The resolver has produced canonical identities from at least one source."),
    ("identity_sources", "Identity data", "Identity sources reporting health", "auto", "advisory",
     "Each connected identity provider writes a health row the overview can show."),
    ("lakewatch", "Data sources", "Lakewatch tables configured", "auto", "advisory",
     "Lakewatch catalog, schema and tables are set so detections can be read."),
    ("llm", "AI", "Model serving endpoint configured", "auto", "advisory",
     "AI summaries and answers have a primary model endpoint."),
    ("workflows", "Automation", "Webhook allowlist set", "auto", "advisory",
     "Automation webhooks can only reach approved hosts."),
    ("uc_grants", "Sign-off", "Unity Catalog grants reviewed", "signoff", "blocker",
     "USE CATALOG/SCHEMA and SELECT/MODIFY granted to the app principal and analyst groups, nothing broader."),
    ("user_consent", "Sign-off", "User authorization approved", "signoff", "blocker",
     "Workspace admin enabled user authorization for apps and a pilot user approved the sql scope."),
    ("security_review", "Sign-off", "Security review completed", "signoff", "blocker",
     "Threat model and penetration test findings are closed or accepted."),
    ("restore_test", "Sign-off", "Rollback and restore rehearsed", "signoff", "advisory",
     "A rollback and a table restore (time travel) were rehearsed in staging."),
    ("runbook", "Sign-off", "On-call runbook and owners named", "signoff", "blocker",
     "Owners, escalation path and the diagnostics section of the manual are known to on-call."),
    ("business_approval", "Sign-off", "Business owner approval", "signoff", "blocker",
     "The accountable owner approves go-live for the agreed scope and date."),
)

CHECK_IDS = {c[0] for c in CHECKS}
SIGNOFF_IDS = {c[0] for c in CHECKS if c[3] == "signoff"}
SEVERITY = {c[0]: c[4] for c in CHECKS}
DECISIONS = {"signed", "waived", "revoked"}
AUTO_STATES = {"pass", "warn", "fail", "unknown"}


def validate_decision(check_id: str, decision: str, note: str) -> str:
    """Return an error message, or '' when the decision may be recorded."""
    if check_id not in CHECK_IDS:
        return "Unknown check"
    if decision not in DECISIONS:
        return "decision must be signed, waived or revoked"
    if decision == "signed" and check_id not in SIGNOFF_IDS:
        return "Automated checks cannot be signed; fix the cause or waive an advisory"
    if decision == "waived" and SEVERITY[check_id] == "blocker":
        return "Blockers cannot be waived"
    if decision in ("signed", "waived") and len(note.strip()) < 10:
        return "Add a note of at least 10 characters with the evidence or reason"
    return ""


def latest_decisions(rows: list) -> dict:
    """Latest decision per check from append-only rows (each has check_id, decided_at)."""
    out = {}
    for row in sorted(rows, key=lambda r: str(r.get("decided_at") or "")):
        out[row["check_id"]] = row
    return {k: v for k, v in out.items() if v.get("decision") != "revoked"}


def evaluate(auto: dict, decisions: dict) -> dict:
    """auto: {check_id: (state, detail)}; decisions: output of latest_decisions."""
    items = []
    for cid, group, title, kind, severity, why in CHECKS:
        decision = decisions.get(cid)
        if kind == "auto":
            state, detail = auto.get(cid, ("unknown", "Not measured"))
            state = state if state in AUTO_STATES else "unknown"
        else:
            state, detail = ("signed", "") if decision and decision.get("decision") == "signed" else ("pending", "Awaiting sign-off")
        if decision and decision.get("decision") == "waived" and severity == "advisory" and state != "pass":
            state = "waived"
        items.append({
            "id": cid, "group": group, "title": title, "kind": kind, "severity": severity, "why": why,
            "state": state, "detail": detail,
            "decision": None if not decision else {
                "decision": decision.get("decision"), "note": decision.get("note"),
                "decided_by": decision.get("decided_by"), "decided_at": str(decision.get("decided_at") or "") or None,
            },
        })

    done = {"pass", "signed", "waived"}
    blockers_open = [i["id"] for i in items if i["severity"] == "blocker" and i["state"] not in done]
    advisories_open = [i["id"] for i in items if i["severity"] == "advisory" and i["state"] not in done]
    weight = {"blocker": 3, "advisory": 1}
    total = sum(weight[i["severity"]] for i in items)
    earned = sum(weight[i["severity"]] for i in items if i["state"] in done)
    verdict = "no_go" if blockers_open else ("go_with_risks" if advisories_open else "go")
    return {
        "verdict": verdict,
        "score": round(100 * earned / total) if total else 0,
        "blockers_open": blockers_open,
        "advisories_open": advisories_open,
        "items": items,
    }
