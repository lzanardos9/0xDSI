"""
Deployment promotion gate (Phase 7).

The honest-status ladder ends at `VERIFIED_IN_DEPLOYMENT`, and that label is the
easiest one to lie with: a dry-run against a fake workspace produces `VERIFIED`
rows that look identical to real ones. This module is the single place that
decides whether an agent has earned the deployment label, and it is built so a
simulated success can never earn it.

The rule is deliberately narrow:

    VERIFIED_IN_DEPLOYMENT  <=  the agent has at least one ledger row whose
                                outcome is VERIFIED *and* whose provenance is
                                'live' (written by the real DatabricksWorkspace
                                client against the actual workspace).

Anything else keeps the agent at its binding-proven base status
(`DEPLOYMENT_READY` or `ENFORCED`). A row with no provenance is treated as
'simulated' -- the safe default -- so the gate fails closed: an unmarked row
cannot promote. A 'live' row that FAILED or errored does not promote either;
only an observed, verified, live effect does.

Pure stdlib, no side effects: it reads rows and returns a status string. The
console and any deployment job call it to label agents honestly; it never writes.
"""

LIVE = "live"
SIMULATED = "simulated"

VERIFIED = "VERIFIED"
VERIFIED_IN_DEPLOYMENT = "VERIFIED_IN_DEPLOYMENT"

# Base statuses that mean "the production binding is written and proven" and are
# therefore eligible to be promoted once a live-verified row appears.
_PROMOTABLE_BASES = frozenset({"DEPLOYMENT_READY", "ENFORCED"})


def _provenance(row):
    """Provenance of a row, defaulting to 'simulated' so unmarked rows never promote."""
    value = (row.get("provenance") or "").strip().lower()
    return value if value else SIMULATED


def has_live_verification(rows):
    """True iff any row is an observed, verified effect against the live workspace."""
    for row in rows:
        if row.get("outcome") == VERIFIED and row.get("executed") and _provenance(row) == LIVE:
            return True
    return False


def honest_status(base_status, agent_rows):
    """Return the honest status for one agent given its ledger rows.

    base_status: the status earned before deployment observation (typically
                 'DEPLOYMENT_READY' or 'ENFORCED').
    agent_rows:  the ledger rows for this agent (any iterable of dicts).

    Only a live, verified, executed row promotes to VERIFIED_IN_DEPLOYMENT; every
    other case returns base_status unchanged.
    """
    if base_status in _PROMOTABLE_BASES and has_live_verification(agent_rows):
        return VERIFIED_IN_DEPLOYMENT
    return base_status


def promote_all(base_by_agent, rows):
    """Label a fleet of agents at once.

    base_by_agent: {agent_key: base_status}.
    rows:          all ledger rows (each with an 'agent_key').
    Returns {agent_key: honest_status}. Agents with no rows keep their base.
    """
    by_agent = {}
    for row in rows:
        by_agent.setdefault(row.get("agent_key"), []).append(row)
    return {
        agent: honest_status(base, by_agent.get(agent, []))
        for agent, base in base_by_agent.items()
    }
