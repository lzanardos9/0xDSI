"""
Property tests for the VANGUARD governed vertical slice (Phase 2).

vanguard_governed.py wires authority_kernel.decide() in front of the
response_actions lifecycle for VANGUARD's containment actions. Both modules are
pure stdlib in notebooks/_shared, so putting that dir on sys.path makes the whole
slice importable with no Spark, database or live target. These tests pin the
end-to-end guarantees: an out-of-scope containment is blocked before it ever
enters the lifecycle, an eligible containment becomes PROPOSED and requires
approval, self-approval and stale-revision approval are refused, a dispatch is
only VERIFIED when the target is observed to match intent, and confidence never
changes the path.

Run:  python3 databricks-native/tests/property/test_vanguard_governed.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import authority_kernel as K  # noqa: E402
import response_actions as R  # noqa: E402
import vanguard_governed as V  # noqa: E402

CONFIRMED = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}


def _proposal(**over):
    p = {"action_type": "isolate_host", "target": "host:WIN-1", "reason": "ransomware",
         "proposed_by": "vanguard", "confidence": 0.95, "finding_id": "f1"}
    p.update(over)
    return p


def _ctx(**over):
    c = {"agent": {"autonomy": K.A3, "lifecycle": "active"}, "target_in_scope": True,
         "is_sandbox_target": False, "approver": None, "live_finding": None, "observed_state": None}
    c.update(over)
    return c


def test_out_of_scope_blocked_before_lifecycle():
    t = V.govern(_proposal(), _ctx(target_in_scope=False))
    assert t["kernel"]["decision"] == K.DENY
    assert t["lifecycle_state"] is None
    assert t["steps"][-1]["state"] == "BLOCKED"


def test_unknown_action_denied():
    t = V.govern(_proposal(action_type="reboot_datacenter"), _ctx())
    assert t["kernel"]["decision"] == K.DENY
    assert t["lifecycle_state"] is None


def test_eligible_containment_requires_approval_and_is_proposed():
    t = V.govern(_proposal(), _ctx())
    assert t["kernel"]["decision"] == K.REQUIRE_APPROVAL
    assert t["kernel"]["reason_code"] == K.R_DUAL_APPROVAL
    assert t["lifecycle_state"] == R.PROPOSED


def test_confidence_does_not_change_path():
    low = V.govern(_proposal(confidence=0.01), _ctx())
    high = V.govern(_proposal(confidence=0.99), _ctx())
    assert low["kernel"]["decision"] == high["kernel"]["decision"] == K.REQUIRE_APPROVAL
    assert low["lifecycle_state"] == high["lifecycle_state"] == R.PROPOSED


def test_self_approval_blocked_by_kernel():
    # The kernel catches proposer==approver before the lifecycle is ever entered.
    t = V.govern(_proposal(proposed_by="alice"),
                 _ctx(approver="alice", live_finding=CONFIRMED))
    assert t["kernel"]["decision"] == K.DENY
    assert t["kernel"]["reason_code"] == K.R_SELF_AUTHORIZE
    assert t["lifecycle_state"] is None
    assert t["steps"][-1]["state"] == "BLOCKED"


def test_approval_advances_to_approved():
    t = V.govern(_proposal(proposed_by="vanguard"),
                 _ctx(approver="ciso", live_finding=CONFIRMED))
    assert t["lifecycle_state"] == R.APPROVED
    assert t["approved_by"] == "ciso"


def test_unconfirmed_finding_refuses_approval():
    # Only a CONFIRMED finding authorizes a response; a WITHDRAWN one does not.
    withdrawn = {"finding_id": "f1", "state": "WITHDRAWN", "revision": 3}
    t = V.govern(_proposal(proposed_by="vanguard"),
                 _ctx(approver="ciso", live_finding=withdrawn))
    assert t["steps"][-1]["state"] == "APPROVAL_REFUSED"
    assert t["lifecycle_state"] == R.PROPOSED


def test_verified_only_when_observed_matches_intent():
    t = V.govern(_proposal(proposed_by="vanguard"),
                 _ctx(approver="ciso", live_finding=CONFIRMED, observed_state="isolated"))
    assert t["lifecycle_state"] == R.VERIFIED
    assert t["steps"][-1]["state"] == R.VERIFIED


def test_dispatch_failed_when_target_not_observed():
    t = V.govern(_proposal(proposed_by="vanguard"),
                 _ctx(approver="ciso", live_finding=CONFIRMED, observed_state="active"))
    assert t["lifecycle_state"] == R.FAILED
    assert t["steps"][-1]["state"] == R.FAILED


def test_effect_mapping_covers_every_action():
    for action_type in ("block_ip", "disable_user", "isolate_host", "quarantine_file", "revoke_token"):
        t = V.govern(_proposal(action_type=action_type), _ctx())
        assert t["kernel"]["decision"] == K.REQUIRE_APPROVAL, action_type
        assert t["intended_effect"] is not None, action_type


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
