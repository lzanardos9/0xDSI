"""
Enforcement chokepoint (Phase 5).

Phases 1-4 proved, in code, how an action should be decided and governed. But a
decision the dispatch path can bypass is not enforcement. This module is the
single sanctioned way a governed agent executes an action, built so the real
side effect is *unreachable* except on a fully authorized path:

    result = guard_and_dispatch(agent_key, proposal, context, execute, record)

`execute` is the callback that performs the real side effect (block the IP, push
the config) and returns the observed target state. `guard_and_dispatch` calls it
only after the authority kernel permits the action AND a revision-bound approval
from a different operator clears `response_actions`. On any other path `execute`
is never invoked -- the chokepoint fails closed.

`record` is an injected audit sink (a list in tests, a Delta/Supabase writer in
deployment). It is called exactly once per attempt, on every path including a
denial, so the ledger is a complete, append-only account of what was allowed and
what actually happened. Nothing is decided by module-global state: the sink and
context are passed in.

This module decides nothing new -- it composes `authority_kernel`,
`governed_agent` and `response_actions`, so the enforced behaviour is exactly the
behaviour those modules' tests already pin. Pure stdlib: the same guard runs in a
notebook, in the app backend, and in the offline deployment harness.
"""

import time

import authority_kernel as K
import governed_agent as G
import response_actions as R

# Outcome codes for the audit ledger. Exactly one is recorded per attempt.
BLOCKED = "BLOCKED"                    # kernel denied; execute never called
NOT_AUTHORIZED = "NOT_AUTHORIZED"      # eligible but no valid approval; execute never called
EXECUTE_ERROR = "EXECUTE_ERROR"        # execute raised; effect state unknown -> treated as failed
VERIFIED = "VERIFIED"                  # executed and observed to match intent
FAILED = "FAILED"                      # executed but target not observed in intended state

OUTCOMES = (BLOCKED, NOT_AUTHORIZED, EXECUTE_ERROR, VERIFIED, FAILED)

# Outcomes in which the real side effect was actually invoked.
_EXECUTED_OUTCOMES = frozenset({EXECUTE_ERROR, VERIFIED, FAILED})


class EnforcementError(Exception):
    """Raised when the guard is called with an unusable execute/record sink."""


def _now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _audit(agent_key, agent_name, proposal, decision, outcome, steps, extra=None):
    rec = {
        "recorded_at": _now_iso(),
        "agent_key": agent_key,
        "agent_name": agent_name,
        "action_type": (proposal.get("action_type") or "").strip().lower(),
        "target": proposal.get("target"),
        "proposed_by": proposal.get("proposed_by"),
        "approved_by": None,
        "kernel_decision": decision["decision"] if decision else K.DENY,
        "kernel_reason_code": decision["reason_code"] if decision else K.R_SAFE_DEFAULT_DENY,
        "outcome": outcome,
        "executed": outcome in _EXECUTED_OUTCOMES,
        "observed_state": None,
        "steps": list(steps),
    }
    if extra:
        rec.update(extra)
    return rec


def guard_and_dispatch(agent_key, proposal, context, execute, record):
    """Execute an action only on a fully authorized path; always record the attempt.

    proposal: {action_type, target, reason, proposed_by, confidence, finding_id, ...}
    context:  kernel context plus {approver, live_finding} for the approval step.
    execute:  callable() -> observed_state. Invoked at most once, and only after
              the kernel permits and a revision-bound approval clears.
    record:   callable(audit_dict) -> None. Invoked exactly once, on every path.

    Returns the audit record (also handed to `record`). The record's `executed`
    flag and `outcome` are the source of truth: a caller can trust that
    `executed is False` means the side effect did not run.
    """
    if not callable(execute):
        raise EnforcementError("execute must be callable")
    if not callable(record):
        raise EnforcementError("record must be callable")

    catalog = G.AGENT_CATALOGS.get(agent_key)
    action_type = (proposal.get("action_type") or "").strip().lower()
    spec = catalog["actions"].get(action_type) if catalog else None
    agent_name = catalog["agent_name"] if catalog else agent_key

    # Unknown agent or action: deny by default, record, never execute.
    if spec is None:
        decision = K._decision(K.DENY, K.R_SAFE_DEFAULT_DENY,
                               f"unknown action {action_type!r} for agent {agent_key!r}")
        rec = _audit(agent_key, agent_name, proposal, decision, BLOCKED,
                     [{"state": BLOCKED, "note": decision["reason_code"]}])
        record(rec)
        return rec

    intended_effect = spec["intended_effect"]
    req = G.to_kernel_request(agent_key, proposal)
    decision = K.decide(req, context)
    steps = []

    # 1. Kernel gate. A denial ends here -- the side effect is unreachable.
    if decision["decision"] == K.DENY:
        steps.append({"state": BLOCKED, "note": decision["reason_code"]})
        rec = _audit(agent_key, agent_name, proposal, decision, BLOCKED, steps)
        record(rec)
        return rec

    steps.append({"state": R.PROPOSED, "note": decision["reason_code"]})

    # 2. Revision-bound approval by a different operator. Without a valid approval
    #    the action never reaches dispatch: fail closed.
    approver = context.get("approver")
    live_finding = context.get("live_finding")
    action = {
        "state": R.PROPOSED,
        "finding_id": proposal.get("finding_id"),
        "proposed_by": proposal.get("proposed_by"),
        "action_type": action_type,
        "target": proposal.get("target"),
    }

    if approver is None or live_finding is None:
        steps.append({"state": NOT_AUTHORIZED, "note": "no operator approval supplied"})
        rec = _audit(agent_key, agent_name, proposal, decision, NOT_AUTHORIZED, steps)
        record(rec)
        return rec

    ok, reason = R.can_approve(action, live_finding, approver)
    if not ok:
        steps.append({"state": NOT_AUTHORIZED, "note": reason})
        rec = _audit(agent_key, agent_name, proposal, decision, NOT_AUTHORIZED, steps)
        record(rec)
        return rec

    action = R.bind_approval(action, live_finding, approver)
    steps.append({"state": R.APPROVED, "note": f"bound to revision {action.get('approved_finding_revision')}"})

    ok, reason = R.can_execute(action, live_finding)
    if not ok:
        steps.append({"state": NOT_AUTHORIZED, "note": reason})
        rec = _audit(agent_key, agent_name, proposal, decision, NOT_AUTHORIZED, steps,
                     extra={"approved_by": approver})
        record(rec)
        return rec

    # 3. Authorized. Perform the real side effect exactly once. An exception is
    #    not swallowed into a success: the effect state is unknown, so it is
    #    recorded as an execute error and reported as not verified.
    steps.append({"state": R.DISPATCHED, "note": "command sent"})
    try:
        observed_state = execute()
    except Exception as exc:  # noqa: BLE001 - the whole point is to fail closed
        steps.append({"state": EXECUTE_ERROR, "note": str(exc)[:200]})
        rec = _audit(agent_key, agent_name, proposal, decision, EXECUTE_ERROR, steps,
                     extra={"approved_by": approver})
        record(rec)
        return rec

    # 4. Verify: a dispatch is not a completed action.
    final = R.verify_dispatch(intended_effect, observed_state)
    outcome = VERIFIED if final == R.VERIFIED else FAILED
    steps.append({
        "state": outcome,
        "note": "observed matches intent" if outcome == VERIFIED
                else f"observed {observed_state!r} != intended {intended_effect!r}",
    })
    rec = _audit(agent_key, agent_name, proposal, decision, outcome, steps,
                 extra={"approved_by": approver, "observed_state": observed_state})
    record(rec)
    return rec
