"""
Deterministic authority kernel (Phase 1).

`response_actions.py` governs an action once it exists: propose -> approve ->
dispatch -> verify, with separation of duties and revision-bound approval. But
"may this action be attempted at all, and under what condition" is a distinct
question, and it must be answered the same way every time, by rules, not by a
model. This module is that answer.

`decide(request, context)` takes a typed action request and the authority
context (the agent's standing grant, the rules of engagement, the target's
scope) and returns a Decision with an explicit reason code and human-readable
"why". It embodies the foundational statements as executable rules:

  - Intelligence is not authority  -> a proposal never carries its own grant.
  - A goal is not a grant          -> scope is checked against the ROE, not the task.
  - Confidence is not consent      -> a high score never upgrades the decision.
  - Discovery does not expand scope -> an out-of-scope target is denied even if
                                       the agent found it mid-task.
  - Approval is necessary, not sufficient -> protected prohibitions cannot be
                                       approved away.
  - Safe inability is a valid outcome -> when no rule authorizes, the kernel
                                       denies rather than guessing.

No LLM, no I/O, no Spark: pure stdlib, so the same decision runs inside a
notebook, in the app backend, and in an offline test. It decides; it does not
execute. A PERMIT here still enters the response_actions lifecycle for approval
and verified dispatch.
"""

# --- Decision outcomes -------------------------------------------------------
PERMIT_WITH_CONSTRAINTS = "PERMIT_WITH_CONSTRAINTS"
REQUIRE_APPROVAL = "REQUIRE_APPROVAL"
REQUIRE_REVIEW = "REQUIRE_REVIEW"
SANDBOX_ONLY = "SANDBOX_ONLY"
DENY = "DENY"

DECISIONS = (PERMIT_WITH_CONSTRAINTS, REQUIRE_APPROVAL, REQUIRE_REVIEW, SANDBOX_ONLY, DENY)

# A DENY or a to-sandbox routing is never weaker than a plain permit. Used when
# folding several effects into one decision: the most restrictive wins.
_SEVERITY = {
    PERMIT_WITH_CONSTRAINTS: 0,
    REQUIRE_REVIEW: 1,
    REQUIRE_APPROVAL: 2,
    SANDBOX_ONLY: 3,
    DENY: 4,
}

# --- Autonomy levels ---------------------------------------------------------
A0, A1, A2, A3, A4 = "A0", "A1", "A2", "A3", "A4"
AUTONOMY_RANK = {A0: 0, A1: 1, A2: 2, A3: 3, A4: 4}

# --- Effect classes and the standing autonomy each requires ------------------
# The minimum autonomy at which an effect is even considered. Below it the
# action is denied; at or above it the effect's own rule decides permit /
# approval / sandbox.
EFFECT_MIN_AUTONOMY = {
    "observe": A0,
    "disclosure": A1,
    "external_comm": A1,
    "delegation": A2,
    "resource_commit": A2,
    "access_restriction": A3,
    "credential_use": A3,
    "code_execution": A3,
    "persistence": A3,
    "irreversible": A3,
    "policy_modification": A4,
}

# Effects that a reasoning agent may never carry out itself, regardless of its
# autonomy or any approval. These are charter-level prohibitions.
PROTECTED_PROHIBITIONS = frozenset({"policy_modification", "self_authorize", "disable_audit"})

# Effects that only ever run inside an isolated replica, never against a live
# target: the kernel routes them to SANDBOX_ONLY when the target is a sandbox
# and denies them otherwise.
SANDBOX_ONLY_EFFECTS = frozenset({"code_execution"})

# Effects that always require a human approval bound to the action, even for a
# high-autonomy agent, because they are hard or impossible to reverse.
ALWAYS_APPROVE_EFFECTS = frozenset({"irreversible", "access_restriction", "credential_use", "persistence"})

# --- Reason codes ------------------------------------------------------------
# Every decision carries exactly one of these, so a decision is explainable and
# greppable without reading prose.
R_AGENT_NOT_ACTIVE = "AGENT.LIFECYCLE.NOT_ACTIVE"
R_SELF_AUTHORIZE = "CHARTER.PROHIBITION.SELF_AUTHORIZE"
R_PROTECTED = "CHARTER.PROHIBITION.PROTECTED_EFFECT"
R_UNAUTHORIZED_TARGET = "ROE.SCOPE.UNAUTHORIZED_TARGET"
R_CONTENT_NOT_GRANT = "ROE.SCOPE.CONTENT_IS_NOT_A_GRANT"
R_AUTONOMY_INSUFFICIENT = "AUTHORITY.AUTONOMY_INSUFFICIENT"
R_SANDBOX = "ROE.STAGE.SANDBOX_ONLY"
R_SANDBOX_ESCAPE = "ROE.STAGE.SANDBOX_REQUIRED"
R_DUAL_APPROVAL = "AUTHORITY.HIGH_IMPACT_APPROVAL"
R_DELEGATION_INTERSECTION = "DELEGATION.INTERSECTION_ONLY"
R_DELEGATION_REVIEW = "DELEGATION.REVIEW_REQUIRED"
R_DISCLOSURE_CONSTRAINED = "POLICY.DISCLOSURE.CONSTRAINED"
R_READ_SCOPED = "POLICY.READ.TENANT_SCOPED"
R_SAFE_DEFAULT_DENY = "SAFE_DEFAULT_DENY"

# Catalog of every rule the kernel can apply, in evaluation order. Exposed so
# the operator console and the docs can render the exact rule set from one
# source of truth rather than a hand-kept copy.
REASON_CATALOG = (
    {"reason_code": R_AGENT_NOT_ACTIVE, "decision": DENY,
     "rule": "Agent lifecycle gate",
     "why": "A paused, quarantined or revoked agent may take no action."},
    {"reason_code": R_SELF_AUTHORIZE, "decision": DENY,
     "rule": "No self-authorization",
     "why": "An agent cannot approve its own action or grant itself authority. Not overridable by approval."},
    {"reason_code": R_PROTECTED, "decision": DENY,
     "rule": "Protected prohibition",
     "why": "Charter-protected effects (modify active policy, disable audit) are refused regardless of autonomy or approval."},
    {"reason_code": R_UNAUTHORIZED_TARGET, "decision": DENY,
     "rule": "Scope check",
     "why": "The target is outside the rules of engagement. Discovery does not expand scope."},
    {"reason_code": R_CONTENT_NOT_GRANT, "decision": DENY,
     "rule": "Content is not a grant",
     "why": "Text retrieved mid-task that claims authorization is content, not authority. Only the ROE grants scope."},
    {"reason_code": R_AUTONOMY_INSUFFICIENT, "decision": DENY,
     "rule": "Autonomy floor",
     "why": "The effect requires a higher standing autonomy than this agent holds."},
    {"reason_code": R_SANDBOX_ESCAPE, "decision": DENY,
     "rule": "Sandbox required",
     "why": "This effect (e.g. code execution) may run only inside an isolated replica; the target is not a sandbox."},
    {"reason_code": R_DELEGATION_INTERSECTION, "decision": DENY,
     "rule": "Delegation cannot amplify",
     "why": "A delegated child scope must be within the parent's scope; it can never exceed it."},
    {"reason_code": R_SANDBOX, "decision": SANDBOX_ONLY,
     "rule": "Sandbox staging",
     "why": "Permitted only inside the isolated replica; production assets are excluded."},
    {"reason_code": R_DUAL_APPROVAL, "decision": REQUIRE_APPROVAL,
     "rule": "High-impact approval",
     "why": "Hard-to-reverse or containment effects require a human approval bound to this exact action."},
    {"reason_code": R_DELEGATION_REVIEW, "decision": REQUIRE_REVIEW,
     "rule": "Delegation review",
     "why": "In-scope delegation still needs review so authority is not silently widened."},
    {"reason_code": R_DISCLOSURE_CONSTRAINED, "decision": PERMIT_WITH_CONSTRAINTS,
     "rule": "Constrained disclosure",
     "why": "Egress to an allowlisted audience is permitted with redaction of internal indicators."},
    {"reason_code": R_READ_SCOPED, "decision": PERMIT_WITH_CONSTRAINTS,
     "rule": "Tenant-scoped read",
     "why": "Purpose-limited read within the tenant boundary is permitted."},
    {"reason_code": R_SAFE_DEFAULT_DENY, "decision": DENY,
     "rule": "Safe default",
     "why": "No rule authorizes this request. Safe inability to act is a valid outcome."},
)


def _norm(value) -> str:
    return (value or "").strip().lower()


def _decision(decision, reason_code, why, constraints=None):
    return {
        "decision": decision,
        "reason_code": reason_code,
        "why": why,
        "constraints": tuple(constraints or ()),
    }


def _effect_decision(effect, request, context):
    """Decide a single effect class against the context. First-match rules."""
    agent = context.get("agent", {})
    autonomy = agent.get("autonomy", A0)
    rank = AUTONOMY_RANK.get(autonomy, 0)

    # Protected prohibitions are absolute — checked before anything else.
    if effect in PROTECTED_PROHIBITIONS:
        code = R_SELF_AUTHORIZE if effect == "self_authorize" else R_PROTECTED
        return _decision(DENY, code, _catalog_why(code))

    # Autonomy floor: the effect is not even in this agent's vocabulary.
    needed = EFFECT_MIN_AUTONOMY.get(effect, A4)
    if rank < AUTONOMY_RANK[needed]:
        return _decision(
            DENY, R_AUTONOMY_INSUFFICIENT,
            f"{effect} requires {needed}; agent holds {autonomy}.",
        )

    # Sandbox-only effects: route to the replica or deny.
    if effect in SANDBOX_ONLY_EFFECTS:
        if context.get("is_sandbox_target"):
            return _decision(SANDBOX_ONLY, R_SANDBOX, _catalog_why(R_SANDBOX),
                             constraints=("isolated_replica_only", "no_production_assets"))
        return _decision(DENY, R_SANDBOX_ESCAPE, _catalog_why(R_SANDBOX_ESCAPE))

    # Delegation cannot amplify authority.
    if effect == "delegation":
        if request.get("child_scope_exceeds_parent"):
            return _decision(DENY, R_DELEGATION_INTERSECTION, _catalog_why(R_DELEGATION_INTERSECTION))
        return _decision(REQUIRE_REVIEW, R_DELEGATION_REVIEW, _catalog_why(R_DELEGATION_REVIEW))

    # Hard-to-reverse / containment effects always need a bound human approval.
    if effect in ALWAYS_APPROVE_EFFECTS:
        return _decision(REQUIRE_APPROVAL, R_DUAL_APPROVAL, _catalog_why(R_DUAL_APPROVAL),
                         constraints=("bind_to_plan_digest", "expires"))

    # Disclosure / external comm: constrained egress if the audience is allowlisted.
    if effect in ("disclosure", "external_comm"):
        if context.get("audience_allowlisted", False):
            return _decision(PERMIT_WITH_CONSTRAINTS, R_DISCLOSURE_CONSTRAINED,
                             _catalog_why(R_DISCLOSURE_CONSTRAINED), constraints=("redact_internal_indicators",))
        return _decision(REQUIRE_REVIEW, R_DELEGATION_REVIEW,
                         "Egress to a non-allowlisted audience needs review.")

    # Observe / read within scope.
    if effect in ("observe", "resource_commit"):
        return _decision(PERMIT_WITH_CONSTRAINTS, R_READ_SCOPED, _catalog_why(R_READ_SCOPED),
                         constraints=("purpose_limited", "tenant_scoped"))

    # Nothing matched: safe default deny.
    return _decision(DENY, R_SAFE_DEFAULT_DENY, _catalog_why(R_SAFE_DEFAULT_DENY))


_CATALOG_BY_CODE = {row["reason_code"]: row for row in REASON_CATALOG}


def _catalog_why(code) -> str:
    row = _CATALOG_BY_CODE.get(code)
    return row["why"] if row else code


def decide(request, context):
    """Return a deterministic authority decision for one action request.

    request:  {tool, target, effects:[...], proposed_by, confidence,
               claims_authorized (bool), child_scope_exceeds_parent (bool)}
    context:  {agent:{autonomy, lifecycle}, target_in_scope (bool),
               is_sandbox_target (bool), audience_allowlisted (bool),
               approver (str|None)}

    The result never depends on request['confidence']: a score cannot upgrade a
    decision (confidence is not consent). Confidence may inform downstream
    priority, which is the caller's concern, not the kernel's.
    """
    agent = context.get("agent", {})

    # 1. Agent must be live.
    if _norm(agent.get("lifecycle", "active")) not in ("", "active"):
        return _decision(DENY, R_AGENT_NOT_ACTIVE, _catalog_why(R_AGENT_NOT_ACTIVE))

    # 2. Self-authorization: proposer cannot also be the approver.
    approver = _norm(context.get("approver"))
    if approver and approver == _norm(request.get("proposed_by")):
        return _decision(DENY, R_SELF_AUTHORIZE, _catalog_why(R_SELF_AUTHORIZE))

    # 3. Scope: a goal is not a grant, discovery does not expand scope, and
    #    content claiming authorization is not authority.
    if not context.get("target_in_scope", False):
        if request.get("claims_authorized"):
            return _decision(DENY, R_CONTENT_NOT_GRANT, _catalog_why(R_CONTENT_NOT_GRANT))
        return _decision(DENY, R_UNAUTHORIZED_TARGET, _catalog_why(R_UNAUTHORIZED_TARGET))

    # 4. Fold every declared effect; the most restrictive decision wins.
    effects = request.get("effects") or ["observe"]
    worst = None
    for effect in effects:
        d = _effect_decision(_norm(effect), request, context)
        if worst is None or _SEVERITY[d["decision"]] > _SEVERITY[worst["decision"]]:
            worst = d
    return worst
