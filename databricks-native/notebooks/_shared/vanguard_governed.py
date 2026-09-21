"""
VANGUARD governed vertical slice (Phase 2).

VANGUARD (agents/07_vanguard_response.py) proposes containment actions --
block_ip, disable_user, isolate_host, quarantine_file, revoke_token. On their own
these are just a tool call the model wants to make. This module is the seam that
turns a proposed containment into a governed one:

  1. authority_kernel.decide() gives a deterministic, reason-coded verdict on
     whether the action may be attempted at all and under what condition. A DENY
     ends here -- the action never enters the lifecycle.
  2. Anything not denied becomes a PROPOSED action in the response_actions
     lifecycle, which then enforces separation of duties, revision-bound
     approval, and verified dispatch (a dispatch is not a completed action).

As of Phase 3 the governing logic lives in governed_agent.py so other
action-capable agents can be governed the same way; this module stays as
VANGUARD's stable entry point and keeps its original API. The kernel decides
eligibility; the lifecycle decides execution. Neither trusts the model's
confidence: it is carried through for downstream priority only.

Pure stdlib: importable in the notebook and by the app backend, and exercised by
offline tests with no Spark, database or live target.
"""

import governed_agent as G

_AGENT_KEY = "vanguard"

# VANGUARD's tool vocabulary mapped to the kernel's effect classes, derived from
# the shared catalog so the two never drift. Isolating a host is treated as
# irreversible; the others are access restrictions or credential use. All are
# hard-to-reverse effects, so the kernel routes every one of them to
# REQUIRE_APPROVAL.
ACTION_EFFECTS = {
    name: spec["effects"] for name, spec in G.AGENT_CATALOGS[_AGENT_KEY]["actions"].items()
}

# What "success" looks like for each action, used by verify_dispatch: a dispatch
# is only VERIFIED when the target is observed in this state.
INTENDED_EFFECT = {
    name: spec["intended_effect"] for name, spec in G.AGENT_CATALOGS[_AGENT_KEY]["actions"].items()
}


def to_kernel_request(proposal):
    """Translate a VANGUARD tool proposal into a kernel action request."""
    return G.to_kernel_request(_AGENT_KEY, proposal)


def govern(proposal, context):
    """Run one VANGUARD proposal through kernel + lifecycle, returning a trace."""
    return G.govern(_AGENT_KEY, proposal, context)
