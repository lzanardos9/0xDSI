"""
Response-action lifecycle, revision-bound authorization, and dry-run
verification (REV2-20, REV2-27).

Two guarantees a response pipeline must not get wrong:

- Approval bound to an exact finding revision (REV2-20): an analyst approves a
  containment action against the evidence as it stood at a specific finding
  revision. If that finding is later re-confirmed under a new revision,
  superseded, or withdrawn, the earlier approval is stale and must not authorize
  execution -- otherwise the platform acts on evidence nobody approved.
  `can_approve` records the revision an approval is bound to; `can_execute`
  refuses when the live finding has moved on. Separation of duties (the proposer
  may not approve their own action) is enforced at both points.

- A dispatch is not a completed action (REV2-27): sending a containment command
  is not proof it took effect. `verify_dispatch` marks an action VERIFIED only
  when the observed target state matches the intended effect, and FAILED
  otherwise, so the lifecycle never reports success it did not confirm.

Pure stdlib: importable inside notebooks and by the app backend, and exercised
directly by offline tests with no Spark, database or live target.
"""

# --- Lifecycle states ---
PROPOSED = "PROPOSED"
APPROVED = "APPROVED"
REJECTED = "REJECTED"
DISPATCHED = "DISPATCHED"
VERIFIED = "VERIFIED"
FAILED = "FAILED"

STATES = (PROPOSED, APPROVED, REJECTED, DISPATCHED, VERIFIED, FAILED)

INITIAL_STATE = PROPOSED

# VERIFIED and REJECTED are dead ends. FAILED is terminal too: a failed dispatch
# is not retried in place -- a new action must be proposed, so the audit trail
# keeps one row per attempt.
TERMINAL_STATES = frozenset({REJECTED, VERIFIED, FAILED})

APPROVE = "approve"
REJECT = "reject"
DISPATCH = "dispatch"
VERIFY = "verify"
FAIL = "fail"

# The only legal moves. Approval and rejection act on a proposal; dispatch acts
# on an approval; verify/fail act on a dispatched action.
ALLOWED_TRANSITIONS = {
    PROPOSED: {APPROVE: APPROVED, REJECT: REJECTED},
    APPROVED: {DISPATCH: DISPATCHED},
    DISPATCHED: {VERIFY: VERIFIED, FAIL: FAILED},
    REJECTED: {},
    VERIFIED: {},
    FAILED: {},
}

# The finding states that can authorize a response, mirroring
# finding_revision.py. Only a CONFIRMED finding justifies containment.
FINDING_CONFIRMED = "CONFIRMED"


def is_valid_state(state) -> bool:
    return state in STATES


def is_terminal(state) -> bool:
    return state in TERMINAL_STATES


def allowed_actions(state):
    return tuple(ALLOWED_TRANSITIONS.get(state, {}).keys())


def can_transition(current_state, action) -> bool:
    return action in ALLOWED_TRANSITIONS.get(current_state, {})


def next_state(current_state, action) -> str:
    """Return the state that `action` moves `current_state` to.

    Raises ValueError for an unknown state or an illegal transition, so callers
    cannot silently skip a step (e.g. PROPOSED straight to DISPATCHED).
    """
    if not is_valid_state(current_state):
        raise ValueError(f"unknown state: {current_state!r}")
    table = ALLOWED_TRANSITIONS[current_state]
    if action not in table:
        raise ValueError(
            f"illegal transition: {action!r} from {current_state!r}; "
            f"allowed: {tuple(table.keys())}"
        )
    return table[action]


def _norm(value) -> str:
    return (value or "").strip().lower()


def _finding_matches(action, live_finding):
    """Return (ok, reason) for the revision-binding checks shared by approve/execute."""
    if not live_finding:
        return False, "no live finding to authorize against"
    if _norm(action.get("finding_id")) != _norm(live_finding.get("finding_id")):
        return False, "action is not bound to this finding"
    if str(live_finding.get("state", "")).upper() != FINDING_CONFIRMED:
        return False, (
            f"finding is '{live_finding.get('state')}', only a "
            f"{FINDING_CONFIRMED} finding authorizes a response"
        )
    return True, ""


def can_approve(action, live_finding, approver):
    """Return (ok, reason) for approving a proposed action.

    Requires the action to be PROPOSED, the approver to differ from the
    proposer (separation of duties), and the finding to be CONFIRMED right now.
    The approval should then be stamped with live_finding['revision'] so
    execution can later detect drift.
    """
    if action.get("state") != PROPOSED:
        return False, f"only a {PROPOSED} action can be approved (is {action.get('state')})"
    approver_n = _norm(approver)
    if approver_n and approver_n == _norm(action.get("proposed_by")):
        return False, "separation of duties: proposer cannot approve their own action"
    ok, reason = _finding_matches(action, live_finding)
    if not ok:
        return False, reason
    return True, ""


def bind_approval(action, live_finding, approver):
    """Return a copy of action moved to APPROVED and bound to the live revision.

    Raises ValueError if approval is not permitted, so an unauthorized approval
    cannot be produced by mistake.
    """
    ok, reason = can_approve(action, live_finding, approver)
    if not ok:
        raise ValueError(reason)
    approved = dict(action)
    approved["state"] = APPROVED
    approved["approved_by"] = approver
    approved["approved_finding_revision"] = live_finding.get("revision")
    return approved


def can_execute(action, live_finding):
    """Return (ok, reason) for dispatching an approved action.

    Refuses unless the action is APPROVED, still separated from its proposer,
    the finding is CONFIRMED, and the finding revision has not changed since the
    approval was granted (a superseded/re-confirmed finding invalidates it).
    """
    if action.get("state") != APPROVED:
        return False, f"only an {APPROVED} action can be dispatched (is {action.get('state')})"
    if _norm(action.get("approved_by")) and _norm(action.get("approved_by")) == _norm(
        action.get("proposed_by")
    ):
        return False, "separation of duties: proposer approved their own action"
    ok, reason = _finding_matches(action, live_finding)
    if not ok:
        return False, reason
    bound = action.get("approved_finding_revision")
    if bound is None:
        return False, "approval is not bound to a finding revision"
    if bound != live_finding.get("revision"):
        return False, (
            f"stale approval: bound to revision {bound} but finding is now at "
            f"revision {live_finding.get('revision')}"
        )
    return True, ""


def verify_dispatch(intended_effect, observed_state):
    """Return VERIFIED only if the observed target state matches the intent.

    A dispatch that cannot be observed to have taken effect is FAILED, never
    silently treated as done (REV2-27).
    """
    if observed_state is None:
        return FAILED
    if observed_state == intended_effect:
        return VERIFIED
    return FAILED
