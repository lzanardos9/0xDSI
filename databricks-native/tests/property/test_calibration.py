"""
Property tests for the score calibration used by the Fuse Engine.

calibration.py is stdlib-only (no Spark, no Databricks), so it is imported
directly. These tests assert the invariants that make calibration correct:
significance is not maliciousness (REV2-02/06), stale evidence reverts to the
prior rather than to "benign" (REV2-16), and the naive-Bayes baseline behaves
sensibly (REV2-28).

Run:  python3 databricks-native/tests/property/test_calibration.py
"""

import os
import sys

SHARED = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "_shared"
)
sys.path.insert(0, os.path.abspath(SHARED))

import calibration as C  # noqa: E402

import math  # noqa: E402

NOTEBOOK = os.path.join(
    os.path.dirname(__file__), "..", "..", "notebooks", "correlation", "10_fuse_engine.py"
)


def _load_ds_combine():
    """Extract the pure Dempster-Shafer combiner from the fuse notebook, same
    technique as tests/test_fuse_math.py, so this test exercises shipped code."""
    with open(NOTEBOOK, "r") as f:
        src = f.read()
    start = src.index("def _ds_combine_pair(")
    end = src.index("def compute_independence_weights(")
    ns = {"math": math}
    exec(compile(src[start:end], NOTEBOOK, "exec"), ns)
    return ns["dempster_shafer_combine"]


_ds_combine = _load_ds_combine()


def _pipeline(raws, base_rate=0.05):
    """Calibrate raw scores, then score with both fusion methods, exactly as the
    fuse engine now does: calibrate -> belief mass (D-S) and calibrate -> baseline."""
    cal = [C.calibrate_probability(r, base_rate) for r in raws]
    ds = _ds_combine([{"decayed_score": c, "independence_weight": 1.0} for c in cal])[0]
    base = C.baseline_probability(cal, base_rate)
    return ds, base


def test_ds_and_baseline_agree_threat_beats_benign():
    """The elaborate D-S fusion and the simple baseline must at least AGREE on
    ordering: a strongly-corroborated case scores above a weak one under both
    (REV2-28 sanity check)."""
    threat_ds, threat_base = _pipeline([0.9, 0.85, 0.88])
    benign_ds, benign_base = _pipeline([0.2, 0.15, 0.25])
    assert threat_ds > benign_ds, (threat_ds, benign_ds)
    assert threat_base > benign_base, (threat_base, benign_base)


def test_ds_and_baseline_both_stay_below_one():
    ds, base = _pipeline([0.95, 0.95, 0.95, 0.95])
    assert ds < 1.0 and base < 1.0, (ds, base)


def test_neutral_score_returns_base_rate():
    """A raw score of 0.5 carries no information beyond the prior."""
    for base in (0.01, 0.05, 0.2, 0.5):
        p = C.calibrate_probability(0.5, base_rate=base, sharpness=1.0)
        assert abs(p - base) < 1e-6, (base, p)


def test_calibration_monotonic_in_raw_score():
    prev = -1.0
    for raw in [i / 20.0 for i in range(1, 20)]:
        p = C.calibrate_probability(raw, base_rate=0.05)
        assert p > prev, (raw, p, prev)
        prev = p


def test_calibration_stays_strictly_inside_unit_interval():
    for raw in (0.0, 1e-9, 0.5, 1.0 - 1e-9, 1.0):
        p = C.calibrate_probability(raw, base_rate=0.05)
        assert 0.0 < p < 1.0, (raw, p)


def test_significance_is_not_maliciousness():
    """A high anomaly score under a rare base rate must yield a probability far
    below the score itself. This is the crux of REV2-02/06."""
    raw = 0.95
    p = C.calibrate_probability(raw, base_rate=0.05)
    assert p < raw, (raw, p)
    assert p < 0.5, p


def test_higher_base_rate_yields_higher_probability():
    low = C.calibrate_probability(0.8, base_rate=0.05)
    high = C.calibrate_probability(0.8, base_rate=0.4)
    assert high > low, (low, high)


def test_sharpness_shrinks_extreme_scores_toward_prior():
    base = 0.05
    sharp = C.calibrate_probability(0.9, base_rate=base, sharpness=1.0)
    dull = C.calibrate_probability(0.9, base_rate=base, sharpness=0.5)
    assert base < dull < sharp, (base, dull, sharp)


def test_freshness_reverts_to_prior_not_to_zero():
    base = 0.05
    p = C.calibrate_probability(0.9, base_rate=base)
    fully_stale = C.apply_freshness(p, base, decay=0.0)
    assert abs(fully_stale - base) < 1e-9, fully_stale
    assert fully_stale > 0.0


def test_freshness_fresh_is_identity():
    base = 0.05
    p = C.calibrate_probability(0.9, base_rate=base)
    assert abs(C.apply_freshness(p, base, decay=1.0) - p) < 1e-9


def test_freshness_monotonic_between_prior_and_probability():
    base = 0.05
    p = C.calibrate_probability(0.9, base_rate=base)
    prev = -1.0
    for d in [i / 10.0 for i in range(0, 11)]:
        aged = C.apply_freshness(p, base, decay=d)
        assert base - 1e-9 <= aged <= p + 1e-9, (d, aged)
        assert aged > prev, (d, aged, prev)
        prev = aged


def test_baseline_at_prior_is_prior():
    base = 0.05
    assert abs(C.baseline_probability([base, base, base], base) - base) < 1e-6


def test_baseline_agreeing_signals_reinforce():
    base = 0.05
    one = C.baseline_probability([0.6], base)
    three = C.baseline_probability([0.6, 0.6, 0.6], base)
    assert three > one > base, (base, one, three)


def test_baseline_monotonic_in_evidence():
    base = 0.05
    low = C.baseline_probability([0.3, 0.3], base)
    high = C.baseline_probability([0.8, 0.8], base)
    assert high > low


def test_baseline_below_prior_signal_pulls_down():
    base = 0.2
    below = C.baseline_probability([0.05], base)
    assert below < base, (base, below)


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
