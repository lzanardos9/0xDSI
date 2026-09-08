"""
Property tests for the evidence idempotency kernel (REV2-04) and evidence
execution-identity stamping (REV2-05).

idempotency.py imports the shared `contracts` vocabulary; both live in
notebooks/_shared, so putting that dir on sys.path makes them importable with no
Spark session. These tests pin the guarantees evidence producers rely on:
content-addressed keys are deterministic across calls, injective over part
boundaries, and distinguish None from the empty string; replay detection is a
pure membership test; and identity stamping fills the full kernel without
mutating the input row.

Run:  python3 databricks-native/tests/property/test_idempotency.py
"""

import os
import sys

SHARED = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "_shared"
)
sys.path.insert(0, os.path.abspath(SHARED))

import idempotency as I  # noqa: E402
from contracts import EXECUTION_IDENTITY_FIELDS, SCHEMA_VERSION  # noqa: E402

IDENTITY = {"execution_id": "exec-1", "run_id": "run-1", "producer": "ueo"}
TS = "2026-09-08T00:00:00"


def test_key_is_deterministic():
    a = I.idempotency_key("entity-9", "2026-09-08T00:00:00", "2026-09-08T01:00:00")
    b = I.idempotency_key("entity-9", "2026-09-08T00:00:00", "2026-09-08T01:00:00")
    assert a == b
    assert len(a) == 64
    assert all(c in "0123456789abcdef" for c in a)


def test_key_changes_with_content():
    a = I.idempotency_key("entity-9", "w0", "w1")
    b = I.idempotency_key("entity-9", "w0", "w2")
    assert a != b


def test_key_is_injective_over_boundaries():
    # Without length-prefixing these would collide.
    assert I.idempotency_key("a", "bc") != I.idempotency_key("ab", "c")
    assert I.idempotency_key("a|b", "c") != I.idempotency_key("a", "b|c")


def test_none_distinct_from_empty_string():
    assert I.idempotency_key("x", None) != I.idempotency_key("x", "")
    assert I.idempotency_key(None) == I.idempotency_key(None)


def test_order_matters():
    assert I.idempotency_key("a", "b") != I.idempotency_key("b", "a")


def test_non_string_parts_coerced_stably():
    assert I.idempotency_key(1, 2) == I.idempotency_key("1", "2")
    assert I.idempotency_key(1, 2) == I.idempotency_key(1, 2)


def test_empty_parts_rejected():
    try:
        I.idempotency_key()
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_is_replay():
    seen = {I.idempotency_key("k1"), I.idempotency_key("k2")}
    assert I.is_replay(I.idempotency_key("k1"), seen)
    assert not I.is_replay(I.idempotency_key("k3"), seen)


def test_stamp_fills_full_kernel():
    row = {"ueo_id": "u1", "score": 0.9}
    stamped = I.stamp_execution_identity(row, IDENTITY, produced_at=TS)
    for field in EXECUTION_IDENTITY_FIELDS:
        assert field in stamped
    assert stamped["execution_id"] == "exec-1"
    assert stamped["run_id"] == "run-1"
    assert stamped["producer"] == "ueo"
    assert stamped["schema_version"] == SCHEMA_VERSION
    assert stamped["produced_at"] == TS
    # Original columns preserved.
    assert stamped["ueo_id"] == "u1"
    assert stamped["score"] == 0.9


def test_stamp_does_not_mutate_input():
    row = {"ueo_id": "u1"}
    I.stamp_execution_identity(row, IDENTITY, produced_at=TS)
    assert "execution_id" not in row


def test_stamp_requires_identity_fields():
    for bad in ({"run_id": "r", "producer": "p"},
                {"execution_id": "e", "producer": "p"},
                {"execution_id": "e", "run_id": "r"},
                {"execution_id": "", "run_id": "r", "producer": "p"}):
        try:
            I.stamp_execution_identity({"x": 1}, bad, produced_at=TS)
            raise AssertionError("expected ValueError for %r" % bad)
        except ValueError:
            pass


def test_stamp_defaults_produced_at_when_absent():
    stamped = I.stamp_execution_identity({"x": 1}, IDENTITY)
    assert stamped["produced_at"]
    assert isinstance(stamped["produced_at"], str)


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
