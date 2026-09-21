"""
End-to-end tests for the Omnigent runner-level policy overlay (Phase 9).

`omnigent_pep.py` carries the resolver's own adversarial unit tests (run it
directly). This file proves the overlay end-to-end through the enforcement
chokepoint: an operator-authored DENY (or an unanswerable ASK) must refuse the
action path *before* the kernel is consulted, so the workspace is never touched
and the attempt is recorded BLOCKED; an ALLOW must let an otherwise-authorized
action proceed exactly as it did before Phase 9.

Everything runs offline: no Spark, no database, no live target.

Run:  python3 databricks-native/tests/property/test_omnigent_pep.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import enforcement as E  # noqa: E402
import omnigent_pep as P  # noqa: E402
import workspace_dispatch as W  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}


class FakeWorkspace:
    def __init__(self, observed="isolated"):
        self.observed = observed
        self.apply_calls = 0

    def apply(self, action_type, target):
        self.apply_calls += 1

    def observe(self, action_type, target):
        return self.observed


def _prop(**over):
    p = {"action_type": "isolate_host", "target": "host:1", "reason": "threat",
         "proposed_by": "vanguard", "confidence": 0.9, "finding_id": "f1"}
    p.update(over)
    return p


def _ctx():
    return {"agent": {"autonomy": "A3", "lifecycle": "active"}, "target_in_scope": True,
            "is_sandbox_target": False, "approver": "op-ciso", "live_finding": CONFIRMED}


def _pol(agent_key, action_type, target_glob, decision, priority=100, enabled=True):
    return {"id": f"{agent_key}:{action_type}:{decision}", "agent_key": agent_key,
            "action_type": action_type, "target_glob": target_glob, "decision": decision,
            "priority": priority, "enabled": enabled}


def test_policy_deny_blocks_before_the_workspace():
    overlay = P.policy_overlay([_pol("*", "*", "*", P.DENY, priority=0)])
    ws = FakeWorkspace(observed="isolated")
    ledger = []
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, ledger, policy_overlay=overlay)
    assert rec["outcome"] == E.BLOCKED
    assert rec["executed"] is False
    assert ws.apply_calls == 0
    assert len(ledger) == 1
    assert "omnigent policy" in ledger[0]["steps"][0]["note"]


def test_policy_ask_fails_closed_without_a_human():
    overlay = P.policy_overlay([
        _pol("*", "*", "*", P.DENY, priority=0),
        _pol("vanguard", "isolate_host", "*", P.ASK, priority=200),
    ])
    ws = FakeWorkspace()
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, [], policy_overlay=overlay)
    assert rec["outcome"] == E.BLOCKED
    assert ws.apply_calls == 0


def test_policy_allow_lets_authorized_action_proceed():
    overlay = P.policy_overlay([
        _pol("*", "*", "*", P.DENY, priority=0),
        _pol("vanguard", "isolate_host", "*", P.ALLOW, priority=200),
    ])
    ws = FakeWorkspace(observed="isolated")
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, [], policy_overlay=overlay)
    assert rec["outcome"] == E.VERIFIED
    assert ws.apply_calls == 1


def test_absent_overlay_preserves_prior_behaviour():
    ws = FakeWorkspace(observed="isolated")
    rec = W.dispatch("vanguard", _prop(), _ctx(), ws, [])
    assert rec["outcome"] == E.VERIFIED and ws.apply_calls == 1


def test_policy_denies_only_matching_target_glob():
    overlay = P.policy_overlay([
        _pol("*", "*", "*", P.DENY, priority=0),
        _pol("vanguard", "isolate_host", "host:9*", P.ALLOW, priority=200),
    ])
    # target host:1 does not match host:9* -> falls through to backstop DENY
    ws = FakeWorkspace()
    rec = W.dispatch("vanguard", _prop(target="host:1"), _ctx(), ws, [], policy_overlay=overlay)
    assert rec["outcome"] == E.BLOCKED and ws.apply_calls == 0


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
