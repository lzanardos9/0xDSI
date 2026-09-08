"""
Property tests for the finding-revision state machine (REV2-08) and its
execution-identity stamping (REV2-05).

finding_revision.py imports the shared `contracts` vocabulary; both live in
notebooks/_shared, so putting that dir on sys.path makes them importable with no
Spark session. These tests pin the lifecycle rules: legal transitions only,
terminal states are dead ends, revisions are immutable and monotonic, and every
revision carries the identity fields.

Run:  python3 databricks-native/tests/property/test_finding_revision.py
"""

import os
import sys

SHARED = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "_shared"
)
sys.path.insert(0, os.path.abspath(SHARED))

import finding_revision as F  # noqa: E402
from contracts import EXECUTION_IDENTITY_FIELDS, SCHEMA_VERSION  # noqa: E402

IDENTITY = {"execution_id": "exec-1", "run_id": "run-1", "producer": "test"}
TS = "2026-09-08T00:00:00"


def test_states_and_terminals():
    assert F.INITIAL_STATE == F.PROVISIONAL
    assert F.TERMINAL_STATES == {F.WITHDRAWN, F.EXPIRED, F.SUPERSEDED}
    for s in F.TERMINAL_STATES:
        assert F.is_terminal(s) and F.allowed_actions(s) == ()
    assert not F.is_terminal(F.PROVISIONAL)
    assert not F.is_terminal(F.CONFIRMED)


def test_legal_transitions():
    assert F.next_state(F.PROVISIONAL, F.CONFIRM) == F.CONFIRMED
    assert F.next_state(F.PROVISIONAL, F.WITHDRAW) == F.WITHDRAWN
    assert F.next_state(F.PROVISIONAL, F.EXPIRE) == F.EXPIRED
    assert F.next_state(F.PROVISIONAL, F.SUPERSEDE) == F.SUPERSEDED
    assert F.next_state(F.CONFIRMED, F.WITHDRAW) == F.WITHDRAWN
    assert F.next_state(F.CONFIRMED, F.SUPERSEDE) == F.SUPERSEDED


def test_cannot_reconfirm_confirmed():
    try:
        F.next_state(F.CONFIRMED, F.CONFIRM)
    except ValueError:
        return
    raise AssertionError("re-confirming CONFIRMED should be illegal")


def test_terminal_states_reject_all_transitions():
    for s in F.TERMINAL_STATES:
        for action in (F.CONFIRM, F.WITHDRAW, F.EXPIRE, F.SUPERSEDE):
            try:
                F.next_state(s, action)
            except ValueError:
                continue
            raise AssertionError(f"{action} from terminal {s} should raise")


def test_unknown_state_raises():
    try:
        F.next_state("BOGUS", F.CONFIRM)
    except ValueError:
        return
    raise AssertionError("unknown state should raise")


def test_initial_revision_shape_and_identity():
    r = F.initial_revision("f1", IDENTITY, TS, fingerprint="abc")
    assert r["finding_id"] == "f1"
    assert r["revision"] == 1 and r["prev_revision"] is None
    assert r["state"] == F.PROVISIONAL and r["action"] is None
    assert r["fingerprint"] == "abc"
    for field in EXECUTION_IDENTITY_FIELDS:
        assert r.get(field) not in (None, ""), field
    assert r["schema_version"] == SCHEMA_VERSION
    assert r["produced_at"] == TS


def test_next_revision_increments_and_links():
    r1 = F.initial_revision("f1", IDENTITY, TS)
    r2 = F.next_revision(r1, F.CONFIRM, IDENTITY, TS)
    assert r2["revision"] == 2 and r2["prev_revision"] == 1
    assert r2["state"] == F.CONFIRMED and r2["action"] == F.CONFIRM
    assert r2["finding_id"] == "f1"


def test_next_revision_does_not_mutate_previous():
    r1 = F.initial_revision("f1", IDENTITY, TS)
    snapshot = dict(r1)
    F.next_revision(r1, F.WITHDRAW, IDENTITY, TS)
    assert r1 == snapshot, "previous revision must be immutable"


def test_cannot_revise_terminal_revision():
    r1 = F.initial_revision("f1", IDENTITY, TS)
    r2 = F.next_revision(r1, F.EXPIRE, IDENTITY, TS)
    try:
        F.next_revision(r2, F.CONFIRM, IDENTITY, TS)
    except ValueError:
        return
    raise AssertionError("revising a terminal revision should raise")


def test_supersede_requires_target():
    r1 = F.initial_revision("f1", IDENTITY, TS)
    try:
        F.next_revision(r1, F.SUPERSEDE, IDENTITY, TS)
    except ValueError:
        pass
    else:
        raise AssertionError("supersede without target should raise")
    r2 = F.next_revision(r1, F.SUPERSEDE, IDENTITY, TS, supersedes_finding_id="f2")
    assert r2["state"] == F.SUPERSEDED and r2["supersedes_finding_id"] == "f2"


def test_identity_validation():
    for bad in ({}, {"execution_id": "x"}, {"execution_id": "x", "run_id": "y"},
                {"execution_id": "", "run_id": "y", "producer": "p"}):
        try:
            F.initial_revision("f1", bad, TS)
        except ValueError:
            continue
        raise AssertionError(f"identity {bad} should be rejected")


def test_full_chain_is_monotonic():
    r = F.initial_revision("f1", IDENTITY, TS)
    chain = [r]
    r = F.next_revision(r, F.CONFIRM, IDENTITY, TS)
    chain.append(r)
    r = F.next_revision(r, F.SUPERSEDE, IDENTITY, TS, supersedes_finding_id="f2")
    chain.append(r)
    revisions = [c["revision"] for c in chain]
    assert revisions == [1, 2, 3]
    assert [c["state"] for c in chain] == [F.PROVISIONAL, F.CONFIRMED, F.SUPERSEDED]


def test_revision_columns_cover_identity_fields():
    for field in EXECUTION_IDENTITY_FIELDS:
        assert field in F.REVISION_COLUMNS, field


if __name__ == "__main__":
    passed = 0
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                passed += 1
                print(f"PASS {name}")
            except AssertionError as e:
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
