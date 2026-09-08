"""
Property tests for the response-action lifecycle, revision-bound authorization,
and dry-run verification (REV2-20, REV2-27).

response_actions.py is pure stdlib and lives in notebooks/_shared, so putting
that dir on sys.path makes it importable with no Spark, database or live target.
These tests pin the guarantees the response pipeline relies on: the lifecycle
allows only legal moves with terminal dead-ends, an approval is bound to an
exact finding revision and goes stale when the finding moves on, separation of
duties holds at approve and execute time, and a dispatch is only VERIFIED when
the target is observed to match intent.

Run:  python3 databricks-native/tests/property/test_response_actions.py
"""

import os
import sys

SHARED = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "_shared"
)
sys.path.insert(0, os.path.abspath(SHARED))

import response_actions as R  # noqa: E402

CONFIRMED_FINDING = {"finding_id": "f1", "state": "CONFIRMED", "revision": 3}


def _proposed(**over):
    action = {"state": R.PROPOSED, "finding_id": "f1", "proposed_by": "alice"}
    action.update(over)
    return action


def test_states_and_terminals():
    assert R.INITIAL_STATE == R.PROPOSED
    assert R.is_terminal(R.VERIFIED)
    assert R.is_terminal(R.REJECTED)
    assert R.is_terminal(R.FAILED)
    assert not R.is_terminal(R.PROPOSED)
    assert not R.is_terminal(R.APPROVED)
    assert not R.is_terminal(R.DISPATCHED)


def test_legal_transitions_only():
    assert R.next_state(R.PROPOSED, R.APPROVE) == R.APPROVED
    assert R.next_state(R.PROPOSED, R.REJECT) == R.REJECTED
    assert R.next_state(R.APPROVED, R.DISPATCH) == R.DISPATCHED
    assert R.next_state(R.DISPATCHED, R.VERIFY) == R.VERIFIED
    assert R.next_state(R.DISPATCHED, R.FAIL) == R.FAILED


def test_cannot_skip_approval():
    for bad in (R.DISPATCH, R.VERIFY, R.FAIL):
        try:
            R.next_state(R.PROPOSED, bad)
            raise AssertionError(f"expected illegal transition for {bad}")
        except ValueError:
            pass


def test_terminal_states_are_dead_ends():
    for term in (R.REJECTED, R.VERIFIED, R.FAILED):
        assert R.allowed_actions(term) == ()


def test_unknown_state_rejected():
    try:
        R.next_state("BOGUS", R.APPROVE)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_can_approve_happy_path():
    ok, reason = R.can_approve(_proposed(), CONFIRMED_FINDING, approver="bob")
    assert ok and reason == ""


def test_separation_of_duties_at_approval():
    ok, reason = R.can_approve(_proposed(), CONFIRMED_FINDING, approver="alice")
    assert not ok
    assert "separation of duties" in reason


def test_cannot_approve_unconfirmed_finding():
    finding = {"finding_id": "f1", "state": "PROVISIONAL", "revision": 3}
    ok, reason = R.can_approve(_proposed(), finding, approver="bob")
    assert not ok
    assert "CONFIRMED" in reason


def test_cannot_approve_wrong_finding():
    finding = {"finding_id": "OTHER", "state": "CONFIRMED", "revision": 3}
    ok, reason = R.can_approve(_proposed(), finding, approver="bob")
    assert not ok
    assert "bound" in reason


def test_only_proposed_can_be_approved():
    ok, reason = R.can_approve(_proposed(state=R.APPROVED), CONFIRMED_FINDING, "bob")
    assert not ok


def test_bind_approval_records_revision():
    approved = R.bind_approval(_proposed(), CONFIRMED_FINDING, approver="bob")
    assert approved["state"] == R.APPROVED
    assert approved["approved_by"] == "bob"
    assert approved["approved_finding_revision"] == 3


def test_bind_approval_refuses_when_not_allowed():
    try:
        R.bind_approval(_proposed(), CONFIRMED_FINDING, approver="alice")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_can_execute_happy_path():
    approved = R.bind_approval(_proposed(), CONFIRMED_FINDING, approver="bob")
    ok, reason = R.can_execute(approved, CONFIRMED_FINDING)
    assert ok and reason == ""


def test_execute_refused_when_revision_superseded():
    approved = R.bind_approval(_proposed(), CONFIRMED_FINDING, approver="bob")
    # Finding was re-confirmed under a new revision after approval.
    moved = {"finding_id": "f1", "state": "CONFIRMED", "revision": 4}
    ok, reason = R.can_execute(approved, moved)
    assert not ok
    assert "stale approval" in reason


def test_execute_refused_when_finding_withdrawn():
    approved = R.bind_approval(_proposed(), CONFIRMED_FINDING, approver="bob")
    withdrawn = {"finding_id": "f1", "state": "WITHDRAWN", "revision": 3}
    ok, reason = R.can_execute(approved, withdrawn)
    assert not ok
    assert "CONFIRMED" in reason


def test_execute_requires_bound_revision():
    action = _proposed(state=R.APPROVED, approved_by="bob")  # no bound revision
    ok, reason = R.can_execute(action, CONFIRMED_FINDING)
    assert not ok
    assert "not bound" in reason


def test_execute_only_from_approved():
    ok, _ = R.can_execute(_proposed(), CONFIRMED_FINDING)
    assert not ok


def test_verify_dispatch_matches_intent():
    assert R.verify_dispatch("isolated", "isolated") == R.VERIFIED


def test_verify_dispatch_mismatch_is_failed():
    assert R.verify_dispatch("isolated", "active") == R.FAILED


def test_verify_dispatch_unobserved_is_failed():
    assert R.verify_dispatch("isolated", None) == R.FAILED


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
