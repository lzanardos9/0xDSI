"""
Property tests for honest readiness (REV2-25).

readiness.py is pure stdlib, so putting app/backend on sys.path makes it
importable with no database. These tests pin the guarantee the /ready probe
relies on: a bounded canary is only READY when it returns the expected answer
inside its time budget, a warehouse that is starting or a query that times out
or fails is never READY, and overall readiness is granted only when every
required dependency is READY (deny-by-default). A missing or wrong canary result
must never read as ready.

Run:  python3 databricks-native/tests/property/test_readiness.py
"""

import os
import sys

BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "app", "backend")
sys.path.insert(0, os.path.abspath(BACKEND))

import readiness as R  # noqa: E402


def test_canary_ready_on_correct_answer_in_budget():
    assert R.classify_canary(1, 1, elapsed_ms=40, budget_ms=2000) == R.READY


def test_canary_wrong_answer_is_failed():
    assert R.classify_canary(0, 1, elapsed_ms=40, budget_ms=2000) == R.FAILED


def test_canary_none_result_is_failed():
    assert R.classify_canary(None, 1, elapsed_ms=40, budget_ms=2000) == R.FAILED


def test_canary_overrun_is_timeout():
    assert R.classify_canary(1, 1, elapsed_ms=5000, budget_ms=2000) == R.TIMEOUT


def test_canary_starting_error_is_starting():
    state = R.classify_canary(None, 1, None, None, error_text="Warehouse is STARTING")
    assert state == R.STARTING


def test_canary_timeout_error_is_timeout():
    state = R.classify_canary(None, 1, None, None, error_text="query timed out after 10s")
    assert state == R.TIMEOUT


def test_canary_other_error_is_failed():
    state = R.classify_canary(None, 1, None, None, error_text="permission denied")
    assert state == R.FAILED


def test_starting_never_counts_as_ready():
    # The core REV2-25 regression: a starting dependency must not be ready.
    result = R.aggregate_readiness([
        R.probe("warehouse", R.STARTING),
    ])
    assert result["ready"] is False
    assert "warehouse" in result["not_ready"]


def test_all_required_ready_is_ready():
    result = R.aggregate_readiness([
        R.probe("config", R.READY),
        R.probe("warehouse", R.READY),
    ])
    assert result["ready"] is True
    assert result["not_ready"] == []


def test_one_failed_required_blocks():
    result = R.aggregate_readiness([
        R.probe("config", R.READY),
        R.probe("warehouse", R.FAILED),
    ])
    assert result["ready"] is False
    assert result["not_ready"] == ["warehouse"]


def test_optional_probe_does_not_block():
    result = R.aggregate_readiness([
        R.probe("warehouse", R.READY),
        R.probe("cache", R.FAILED, required=False),
    ])
    assert result["ready"] is True
    assert result["summary"]["optional"] == 1


def test_no_required_probes_is_not_ready():
    # An empty or all-optional probe set must not be a vacuous green.
    assert R.aggregate_readiness([]) ["ready"] is False
    assert R.aggregate_readiness([R.probe("x", R.READY, required=False)])["ready"] is False


def test_every_non_ready_state_blocks():
    for state in (R.STARTING, R.UNKNOWN, R.TIMEOUT, R.FAILED):
        result = R.aggregate_readiness([R.probe("dep", state)])
        assert result["ready"] is False, f"{state} should block"


def test_probe_rejects_unknown_state():
    try:
        R.probe("dep", "green")
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_non_ready_states_frozen_set_excludes_ready():
    assert R.READY not in R.NON_READY_STATES
    assert R.NON_READY_STATES == frozenset(s for s in R.STATES if s != R.READY)


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
