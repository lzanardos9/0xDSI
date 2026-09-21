"""
Property tests for the governed-agent engine (Phase 3).

governed_agent.py generalises the Phase 2 VANGUARD bridge so any action-capable
agent can be governed by registering a catalog. Both authority_kernel and
response_actions are pure stdlib in notebooks/_shared, so putting that dir on
sys.path makes the whole engine importable with no Spark, database or live
target. These tests pin the end-to-end guarantees for every registered agent:
an unregistered agent or action is denied, an out-of-scope action is blocked
before it ever enters the lifecycle, every containment requires approval,
self-approval is caught by the kernel, a valid approver + confirmed finding
advances the lifecycle, a dispatch is only VERIFIED when the target is observed
to match intent, and confidence never changes the path.

Run:  python3 databricks-native/tests/property/test_governed_agent.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import response_actions as R  # noqa: E402
import governed_agent as G  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}
WITHDRAWN = {"finding_id": "f1", "state": "WITHDRAWN", "revision": 3}


def _ctx(**over):
    c = {"agent": {"autonomy": K.A3, "lifecycle": "active"}, "target_in_scope": True,
         "is_sandbox_target": False, "approver": None, "live_finding": None, "observed_state": None}
    c.update(over)
    return c


def _req(agent_key, action_type, **over):
    p = {"action_type": action_type, "target": "asset:1", "reason": "threat",
         "proposed_by": "agent", "confidence": 0.9, "finding_id": "f1"}
    p.update(over)
    return agent_key, p


# Every registered action across every agent, for parametric coverage.
ALL_ACTIONS = [
    (key, action)
    for key, cat in G.AGENT_CATALOGS.items()
    for action in cat["actions"]
]


def test_three_action_capable_agents_registered():
    assert set(G.AGENT_CATALOGS) == {"vanguard", "arl", "edge"}


def test_unregistered_agent_denied():
    t = G.govern("nonexistent", {"action_type": "isolate_host"}, _ctx())
    assert t["kernel"]["decision"] == K.DENY
    assert t["lifecycle_state"] is None


def test_unregistered_action_denied():
    t = G.govern("arl", {"action_type": "launch_missiles"}, _ctx())
    assert t["kernel"]["decision"] == K.DENY
    assert t["lifecycle_state"] is None


def test_every_action_requires_approval_and_is_proposed():
    for key, action in ALL_ACTIONS:
        agent_key, p = _req(key, action)
        t = G.govern(agent_key, p, _ctx())
        assert t["kernel"]["decision"] == K.REQUIRE_APPROVAL, (key, action)
        assert t["lifecycle_state"] == R.PROPOSED, (key, action)
        assert t["intended_effect"], (key, action)
        assert t["agent_name"], (key, action)


def test_out_of_scope_blocked_before_lifecycle():
    for key, action in ALL_ACTIONS:
        agent_key, p = _req(key, action)
        t = G.govern(agent_key, p, _ctx(target_in_scope=False))
        assert t["kernel"]["decision"] == K.DENY, (key, action)
        assert t["lifecycle_state"] is None, (key, action)
        assert t["steps"][-1]["state"] == "BLOCKED", (key, action)


def test_confidence_does_not_change_path():
    for key, action in ALL_ACTIONS:
        agent_key, plo = _req(key, action, confidence=0.01)
        _, phi = _req(key, action, confidence=0.99)
        lo = G.govern(agent_key, plo, _ctx())
        hi = G.govern(agent_key, phi, _ctx())
        assert lo["kernel"]["decision"] == hi["kernel"]["decision"], (key, action)


def test_self_approval_blocked_by_kernel():
    agent_key, p = _req("edge", "config_push", proposed_by="edge-bot")
    t = G.govern(agent_key, p, _ctx(approver="edge-bot", live_finding=CONFIRMED))
    assert t["kernel"]["decision"] == K.DENY
    assert t["kernel"]["reason_code"] == K.R_SELF_AUTHORIZE
    assert t["lifecycle_state"] is None


def test_valid_approval_advances_to_approved():
    agent_key, p = _req("arl", "rebuild_all", proposed_by="learner")
    t = G.govern(agent_key, p, _ctx(approver="ciso", live_finding=CONFIRMED))
    assert t["lifecycle_state"] == R.APPROVED
    assert t["approved_by"] == "ciso"


def test_unconfirmed_finding_refuses_approval():
    agent_key, p = _req("arl", "isolate_host", proposed_by="learner")
    t = G.govern(agent_key, p, _ctx(approver="ciso", live_finding=WITHDRAWN))
    assert t["steps"][-1]["state"] == "APPROVAL_REFUSED"
    assert t["lifecycle_state"] == R.PROPOSED


def test_verified_only_when_observed_matches_intent():
    agent_key, p = _req("edge", "upgrade", proposed_by="edge-bot")
    t = G.govern(agent_key, p, _ctx(approver="ciso", live_finding=CONFIRMED, observed_state="upgraded"))
    assert t["lifecycle_state"] == R.VERIFIED
    assert t["steps"][-1]["state"] == R.VERIFIED


def test_dispatch_failed_when_target_not_observed():
    agent_key, p = _req("arl", "isolate_host", proposed_by="learner")
    t = G.govern(agent_key, p, _ctx(approver="ciso", live_finding=CONFIRMED, observed_state="online"))
    assert t["lifecycle_state"] == R.FAILED
    assert t["steps"][-1]["state"] == R.FAILED


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
