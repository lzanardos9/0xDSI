"""
Governed-agent engine (Phase 3).

Phase 2 wired a single agent -- VANGUARD -- end to end through the control plane.
The logic that did it was generic: map an agent's proposed action to the kernel's
effect classes, get a deterministic reason-coded verdict from authority_kernel,
and -- only if not denied -- run it through the response_actions
propose -> approve -> dispatch -> verify lifecycle. This module lifts that logic
out so any action-capable agent can be governed by registering a catalog, rather
than by copying the bridge.

An agent catalog is a dict mapping each action name to its effect classes and the
observed target state that counts as success:

    CATALOG = {
        "isolate_host": {"effects": ("access_restriction", "irreversible"),
                         "intended_effect": "isolated"},
        ...
    }

AGENT_CATALOGS registers the three action-capable agents from the coverage matrix
that can change external state: VANGUARD response (07), the Autonomous Response
Learner (47), and the Edge Control Plane (49).

The kernel decides eligibility; the lifecycle decides execution. Neither trusts
the model's confidence: it is carried through for downstream priority only and
never changes a decision.

Pure stdlib: importable in the notebook and by the app backend, and exercised by
offline tests with no Spark, database or live target.
"""

import authority_kernel as K
import response_actions as R

# Per-agent action vocabularies mapped to kernel effect classes + the observed
# state that verify_dispatch treats as success. Effects were chosen from each
# agent's real action set (see the notebook headers): isolating or rebuilding a
# host is irreversible; credential and token operations are credential_use;
# pushing config to or upgrading an edge collector is persistence (an upgrade is
# also irreversible), because it durably changes a remote host's state.
AGENT_CATALOGS = {
    "vanguard": {
        "agent_name": "VANGUARD Response",
        "actions": {
            "block_ip": {"effects": ("access_restriction",), "intended_effect": "blocked"},
            "disable_user": {"effects": ("access_restriction", "credential_use"), "intended_effect": "disabled"},
            "isolate_host": {"effects": ("access_restriction", "irreversible"), "intended_effect": "isolated"},
            "quarantine_file": {"effects": ("access_restriction",), "intended_effect": "quarantined"},
            "revoke_token": {"effects": ("credential_use",), "intended_effect": "revoked"},
        },
    },
    "arl": {
        "agent_name": "Autonomous Response Learner",
        "actions": {
            "isolate_host": {"effects": ("access_restriction", "irreversible"), "intended_effect": "isolated"},
            "revoke_credentials": {"effects": ("credential_use",), "intended_effect": "revoked"},
            "rebuild_all": {"effects": ("irreversible", "resource_commit"), "intended_effect": "rebuilt"},
        },
    },
    "edge": {
        "agent_name": "Edge Control Plane",
        "actions": {
            "config_push": {"effects": ("persistence",), "intended_effect": "applied"},
            "upgrade": {"effects": ("persistence", "irreversible"), "intended_effect": "upgraded"},
            "generate_token": {"effects": ("credential_use",), "intended_effect": "issued"},
            "revoke_token": {"effects": ("credential_use",), "intended_effect": "revoked"},
        },
    },
}


def catalog_for(agent_key):
    """Return the action catalog for a registered agent, or None if unknown."""
    return AGENT_CATALOGS.get(agent_key)


def to_kernel_request(agent_key, proposal):
    """Translate one agent proposal into a kernel action request.

    proposal: {action_type, target, reason, proposed_by, confidence,
               finding_id, claims_authorized, child_scope_exceeds_parent}
    Returns None if the agent or action is not registered.
    """
    catalog = AGENT_CATALOGS.get(agent_key)
    if catalog is None:
        return None
    action_type = (proposal.get("action_type") or "").strip().lower()
    spec = catalog["actions"].get(action_type)
    if spec is None:
        return None
    return {
        "tool": f"{agent_key}:{action_type}",
        "target": proposal.get("target"),
        "effects": list(spec["effects"]),
        "proposed_by": proposal.get("proposed_by"),
        "confidence": proposal.get("confidence", 0.0),
        "claims_authorized": bool(proposal.get("claims_authorized")),
        "child_scope_exceeds_parent": bool(proposal.get("child_scope_exceeds_parent")),
    }


def govern(agent_key, proposal, context):
    """Run one agent proposal through kernel + lifecycle, returning a trace.

    context: kernel context plus optional lifecycle inputs:
      {agent:{autonomy, lifecycle}, target_in_scope, is_sandbox_target,
       audience_allowlisted, approver, live_finding, observed_state}

    The returned trace records the kernel decision and every lifecycle state the
    action actually reached, so it is a faithful, replayable account of how the
    action was governed -- never a claim it succeeded when it did not.
    """
    catalog = AGENT_CATALOGS.get(agent_key)
    action_type = (proposal.get("action_type") or "").strip().lower()
    spec = catalog["actions"].get(action_type) if catalog else None

    if spec is None:
        return {
            "agent_key": agent_key,
            "agent_name": catalog["agent_name"] if catalog else agent_key,
            "action_type": action_type,
            "kernel": K._decision(K.DENY, K.R_SAFE_DEFAULT_DENY,
                                   f"unknown action {action_type!r} for agent {agent_key!r}"),
            "lifecycle_state": None,
            "intended_effect": None,
            "steps": [],
        }

    req = to_kernel_request(agent_key, proposal)
    decision = K.decide(req, context)

    trace = {
        "agent_key": agent_key,
        "agent_name": catalog["agent_name"],
        "action_type": action_type,
        "target": proposal.get("target"),
        "tool": req["tool"],
        "effects": req["effects"],
        "confidence": req["confidence"],
        "kernel": decision,
        "intended_effect": spec["intended_effect"],
        "lifecycle_state": None,
        "steps": [],
    }

    # A DENY (or any non-actionable verdict) never enters the lifecycle. Safe
    # inability to act is a valid, recorded outcome.
    if decision["decision"] == K.DENY:
        trace["steps"].append({"state": "BLOCKED", "note": decision["reason_code"]})
        return trace

    # Eligible: create the PROPOSED lifecycle action.
    action = {
        "state": R.PROPOSED,
        "finding_id": proposal.get("finding_id"),
        "proposed_by": proposal.get("proposed_by"),
        "action_type": action_type,
        "target": proposal.get("target"),
    }
    trace["lifecycle_state"] = R.PROPOSED
    trace["steps"].append({"state": R.PROPOSED, "note": decision["reason_code"]})

    live_finding = context.get("live_finding")
    approver = context.get("approver")
    observed_state = context.get("observed_state")

    # Approval, if an approver and a live confirmed finding are supplied. This is
    # where separation of duties and revision binding are enforced by
    # response_actions -- the kernel does not duplicate them.
    if approver is not None and live_finding is not None:
        ok, reason = R.can_approve(action, live_finding, approver)
        if not ok:
            trace["steps"].append({"state": "APPROVAL_REFUSED", "note": reason})
            return trace
        action = R.bind_approval(action, live_finding, approver)
        trace["lifecycle_state"] = R.APPROVED
        trace["approved_by"] = approver
        trace["steps"].append({"state": R.APPROVED, "note": f"bound to revision {action.get('approved_finding_revision')}"})

        # Dispatch + verify, if we have an observed target state to reconcile.
        if observed_state is not None:
            ok, reason = R.can_execute(action, live_finding)
            if not ok:
                trace["steps"].append({"state": "DISPATCH_REFUSED", "note": reason})
                return trace
            action["state"] = R.DISPATCHED
            trace["lifecycle_state"] = R.DISPATCHED
            trace["steps"].append({"state": R.DISPATCHED, "note": "command sent"})
            final = R.verify_dispatch(trace["intended_effect"], observed_state)
            action["state"] = final
            trace["lifecycle_state"] = final
            trace["steps"].append({
                "state": final,
                "note": "observed matches intent" if final == R.VERIFIED
                        else f"observed {observed_state!r} != intended {trace['intended_effect']!r}",
            })

    return trace
