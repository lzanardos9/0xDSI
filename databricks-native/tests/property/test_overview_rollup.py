"""
Property tests for overview_rollup.py (platform Overview rollup helpers).

Pure stdlib, offline. Every expected value is hand-computed. These pin the
alert-level and DEFCON thresholds (which must agree with the frontend gauge)
and the fresh-deploy behavior: empty windows and zero pressure must degrade to
a calm baseline, never raise or divide by zero.

Run:  python3 databricks-native/tests/property/test_overview_rollup.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import overview_rollup as ov  # noqa: E402


def test_alert_level_thresholds():
    assert ov.alert_level(1, 0) == "CRITICAL"
    assert ov.alert_level(0, 5) == "HIGH"
    assert ov.alert_level(0, 4) == "ELEVATED"
    assert ov.alert_level(0, 0) == "ELEVATED"
    # critical dominates high
    assert ov.alert_level(2, 100) == "CRITICAL"


def test_alert_level_handles_none():
    assert ov.alert_level(None, None) == "ELEVATED"
    assert ov.alert_level(None, 6) == "HIGH"


def test_defcon_bands():
    assert ov.defcon_from_score(90) == 1
    assert ov.defcon_from_score(85) == 1
    assert ov.defcon_from_score(70) == 2
    assert ov.defcon_from_score(50) == 3
    assert ov.defcon_from_score(25) == 4
    assert ov.defcon_from_score(10) == 5
    assert ov.defcon_from_score(0) == 5
    assert ov.defcon_from_score(None) == 5


def test_category_risk_baseline_and_pressure():
    # No pressure anywhere -> baseline.
    assert ov.category_risk(0, 0) == 35.0
    # Busiest category (open == max) -> 100.
    assert ov.category_risk(10, 10) == 100.0
    # Half pressure -> baseline + half of the remaining headroom.
    assert ov.category_risk(5, 10) == 67.5
    # No open in this category but others busy -> baseline.
    assert ov.category_risk(0, 8) == 35.0


def test_category_risk_clamped():
    assert 0.0 <= ov.category_risk(3, 4) <= 100.0
    assert ov.category_risk(None, 5) == 35.0


def test_eps_zero_window():
    assert ov.eps(3600, 3600) == 1.0
    assert ov.eps(0, 3600) == 0.0
    assert ov.eps(100, 0) == 0.0
    assert ov.eps(None, 3600) == 0.0


if __name__ == "__main__":
    passed = failed = 0
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
