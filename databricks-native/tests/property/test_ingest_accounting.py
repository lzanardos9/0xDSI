"""
Property tests for ingestion accounting (REV2-21).

ingest_accounting.py is stdlib-only, so it is imported directly. The invariant
under test is simple and absolute: every record received in a micro-batch is
either written or quarantined, and any remainder is reported as unaccounted
rather than silently dropped.

Run:  python3 databricks-native/tests/property/test_ingest_accounting.py
"""

import os
import sys

SHARED = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "_shared"
)
sys.path.insert(0, os.path.abspath(SHARED))

import ingest_accounting as A  # noqa: E402


def test_balanced_when_valid_plus_quarantined_equals_received():
    r = A.reconcile(received=100, valid=90, quarantined=10)
    assert r["balanced"] is True
    assert r["unaccounted"] == 0


def test_empty_batch_balances():
    r = A.reconcile(0, 0, 0)
    assert r["balanced"] is True and r["unaccounted"] == 0


def test_all_valid_balances():
    r = A.reconcile(50, 50, 0)
    assert r["balanced"] is True


def test_all_quarantined_balances():
    r = A.reconcile(50, 0, 50)
    assert r["balanced"] is True


def test_dropped_records_are_flagged_not_hidden():
    """The whole point: 5 records neither written nor quarantined must show up
    as a positive unaccounted and an unbalanced batch."""
    r = A.reconcile(received=100, valid=80, quarantined=15)
    assert r["unaccounted"] == 5
    assert r["balanced"] is False


def test_double_count_is_flagged_negative():
    r = A.reconcile(received=100, valid=80, quarantined=30)
    assert r["unaccounted"] == -10
    assert r["balanced"] is False


def test_negative_inputs_never_balance():
    for args in [(-1, 0, 0), (10, -1, 11), (10, 11, -1)]:
        r = A.reconcile(*args)
        assert r["balanced"] is False, args


def test_reconcile_is_pure_conservation_identity():
    """received == valid + quarantined + unaccounted for any non-negative
    inputs. This is the algebraic guarantee the ledger relies on."""
    for received in range(0, 40, 7):
        for valid in range(0, received + 1, 3):
            quarantined = received - valid
            r = A.reconcile(received, valid, quarantined)
            assert r["valid"] + r["quarantined"] + r["unaccounted"] == r["received"]


def test_accounting_row_carries_lineage_and_verdict():
    row = A.build_accounting_row("batch-42", "kafka", 100, 90, 10)
    assert row["batch_id"] == "batch-42"
    assert row["source_type"] == "kafka"
    assert row["received"] == 100 and row["valid"] == 90 and row["quarantined"] == 10
    assert row["unaccounted"] == 0 and row["balanced"] is True
    assert row["schema_version"] == A.ACCOUNTING_SCHEMA_VERSION


def test_accounting_row_records_a_drop():
    row = A.build_accounting_row("b", "autoloader", 10, 3, 3)
    assert row["unaccounted"] == 4 and row["balanced"] is False


def test_batch_id_coerced_to_string():
    row = A.build_accounting_row(7, "kinesis", 1, 1, 0)
    assert row["batch_id"] == "7" and isinstance(row["batch_id"], str)


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
