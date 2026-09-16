"""
Property tests for mitre_coverage.py (MITRE ATT&CK coverage rollup helpers).

Pure stdlib, offline. Every expected value is hand-computed. These pin the
classification thresholds and the fresh-deploy (empty / zero) behavior so the
matrix degrades to sane numbers rather than raising or emitting NaN.

Run:  python3 databricks-native/tests/property/test_mitre_coverage.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import mitre_coverage as mc  # noqa: E402


def test_detection_always_wins():
    # A detection classifies as 'detected' regardless of rule count.
    assert mc.classify_status(0, 1) == "detected"
    assert mc.classify_status(10, 5) == "detected"


def test_status_from_rule_count():
    assert mc.classify_status(3, 0) == "covered"
    assert mc.classify_status(5, 0) == "covered"
    assert mc.classify_status(2, 0) == "partial"
    assert mc.classify_status(1, 0) == "partial"
    assert mc.classify_status(0, 0) == "gap"


def test_status_handles_none():
    assert mc.classify_status(None, None) == "gap"
    assert mc.classify_status(None, 2) == "detected"


def test_coverage_pct_basic():
    # 2 of 4 count as good -> 50%.
    assert mc.coverage_pct(["covered", "detected", "partial", "gap"]) == 50.0
    # all good -> 100%.
    assert mc.coverage_pct(["covered", "detected"]) == 100.0
    # none good -> 0%.
    assert mc.coverage_pct(["partial", "gap"]) == 0.0


def test_coverage_pct_empty():
    assert mc.coverage_pct([]) == 0.0
    assert mc.coverage_pct(None) == 0.0


def test_coverage_pct_rounding():
    # 1 of 3 good -> 33.3%.
    assert mc.coverage_pct(["detected", "gap", "gap"]) == 33.3


def test_risk_ten_mapping():
    assert mc.risk_ten(0) == 0
    assert mc.risk_ten(None) == 0
    assert mc.risk_ten(95) == 10
    assert mc.risk_ten(84) == 8
    assert mc.risk_ten(5) == 1      # rounds to 0 but floored at 1 for real signal
    assert mc.risk_ten(150) == 10   # clamped


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
