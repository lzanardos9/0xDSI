"""
Property tests for analytics_math.py (shared rollup helpers).

Pure stdlib, offline. Every expected value is hand-computed. These pin the
edge-case behavior that matters on a fresh deploy with no data: empty windows,
zero denominators, and clamping must degrade to sane numbers, never raise or
emit NaN/inf.

Run:  python3 databricks-native/tests/property/test_analytics_math.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import analytics_math as am  # noqa: E402


def approx(a, b, tol=1e-6):
    return abs(a - b) <= tol


def test_clamp_bounds_and_none():
    assert am.clamp(150) == 100.0
    assert am.clamp(-5) == 0.0
    assert am.clamp(None) == 0.0
    assert am.clamp(50) == 50.0
    assert am.clamp(5, 0, 10) == 5


def test_safe_rate_zero_denominator():
    assert am.safe_rate(50, 200) == 25.0
    assert am.safe_rate(1, 0) == 0.0
    assert am.safe_rate(None, 10) == 0.0
    assert am.safe_rate(3, 4, scale=1.0) == 0.75


def test_pct_change_no_baseline():
    assert am.pct_change(120, 100) == 20.0
    assert am.pct_change(80, 100) == -20.0
    assert am.pct_change(100, 0) == 0.0
    assert am.pct_change(100, None) == 0.0


def test_avg_minutes_ignores_none_and_empty():
    assert am.avg_minutes([120, 60, None]) == 1.5
    assert am.avg_minutes([]) == 0.0
    assert am.avg_minutes(None) == 0.0
    assert am.avg_minutes([300]) == 5.0


def test_weighted_score_normalizes_and_clamps():
    assert approx(am.weighted_score([(80, 0.4), (90, 0.4), (50, 0.2)]), 78.0)
    assert am.weighted_score([]) == 0.0
    assert am.weighted_score([(50, 0), (50, 0)]) == 0.0
    assert am.weighted_score([(200, 1)]) == 100.0  # clamped


def test_health_score_weighting():
    assert approx(am.health_score(80, 90, 50), 78.0)
    assert am.health_score(0, 0, 0) == 0.0
    assert am.health_score(100, 100, 100) == 100.0


def test_savings_amount_and_pct():
    assert am.savings(1000, 700) == (300.0, 30.0)
    assert am.savings(0, 0) == (0, 0.0)
    assert am.savings(500, 800) == (0, 0.0)  # never negative


def test_round2_handles_none():
    assert am.round2(1.239) == 1.24
    assert am.round2(None) == 0.0
    assert am.round2(2) == 2.0


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
