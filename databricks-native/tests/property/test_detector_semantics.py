"""
Detector-semantics correctness (Phase 8 / Gate C).

Nine detectors were audited for math/logic defects that run clean but produce
wrong scores. This suite locks the five that were fixed:

  F2  Isolation-Forest confidence read the |magnitude| of a SIGNED score, so a
      strongly-NORMAL user scored as anomalous as a strongly-anomalous one.
  F4  The beacon detector declared "periodic" when inter-arrival times were
      "consistent with a uniform distribution" -- backwards; uniform spacing is
      the opposite of a fixed cadence.
  F6  KS-recall similarity normalised the token intersection by the alert length
      alone (a containment ratio), so a short alert inside a long entry scored
      1.0 and over-recalled. Now symmetric Jaccard.
  F7  Monte-Carlo transition probabilities were perturbed by additive noise and
      compared to a uniform draw WITHOUT clamping, so tail probabilities fired
      always/never and biased the simulated attack paths.
  F9  Negative-correlation "absence" fired on an empty window with no liveness
      check, so a fresh deploy or ingestion outage tripped every rule at once.

Two layers:
  * behaviour -- the pure math in _shared/detector_semantics.py is unit-tested;
  * wiring    -- each host notebook (dbutils/spark at import, so not importable)
                 is source-scanned to prove it delegates to the fixed helper and
                 the defective code path is gone.

Pure stdlib. Run:
  python3 databricks-native/tests/property/test_detector_semantics.py
"""

import os
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHARED = os.path.join(ROOT, "notebooks", "_shared")
sys.path.insert(0, SHARED)

import detector_semantics as DS  # noqa: E402


def _read(rel):
    with open(os.path.join(ROOT, "notebooks", rel), encoding="utf-8") as fh:
        return fh.read()


# --- F2: Isolation-Forest sign ---

def test_iforest_normal_point_scores_zero():
    # Positive decision_function == inlier: must contribute no anomaly evidence.
    assert DS.iforest_anomaly_norm(0.30, 0.3) == 0.0
    assert DS.iforest_anomaly_norm(0.01, 0.3) == 0.0


def test_iforest_anomalous_point_scores_positive_and_bounded():
    assert abs(DS.iforest_anomaly_norm(-0.15, 0.3) - 0.5) < 1e-9
    assert DS.iforest_anomaly_norm(-0.30, 0.3) == 1.0
    assert DS.iforest_anomaly_norm(-0.90, 0.3) == 1.0  # clamped
    assert 0.0 <= DS.iforest_anomaly_norm(-0.30, 0) <= 1.0    # scale fallback stays bounded


def test_iforest_fix_is_wired():
    src = _read("detection/01_behavioral_anomaly_detection.py")
    assert "iforest_anomaly_norm(" in src, "notebook must call the fixed helper"
    assert "abs(float(user_row[\"iforest_score\"])) / 0.3" not in src, "the abs() bug must be gone"


# --- F4: beacon periodicity ---

def test_constant_intervals_are_a_beacon():
    ok, conf = DS.is_periodic_beacon([60.0, 60.0, 60.0, 60.0, 60.0])
    assert ok and conf > 0.9


def test_uniform_spread_intervals_are_not_a_beacon():
    # Evenly spread over a wide range -> high CV -> not a fixed cadence. The old
    # uniform-KS test would have called this periodic.
    ok, _ = DS.is_periodic_beacon([5.0, 40.0, 75.0, 110.0, 145.0, 180.0])
    assert not ok


def test_borderline_regular_traffic_flagged_by_majority_near_median():
    # Mostly ~30s with a couple of jittered intervals: regular enough.
    ok, conf = DS.is_periodic_beacon([30.0, 31.0, 29.0, 30.0, 33.0, 27.0, 30.0])
    assert ok and 0.0 < conf <= 1.0


def test_too_few_intervals_is_not_a_beacon():
    assert DS.is_periodic_beacon([60.0, 60.0]) == (False, 0.0)


def test_beacon_fix_is_wired():
    src = _read("correlation/04_temporal_window_correlator.py")
    assert "is_periodic_beacon(" in src, "notebook must delegate to the fixed helper"
    assert "kstest(" not in src, "the inverted uniform KS test must be gone"


# --- F6: symmetric similarity ---

def test_short_text_contained_in_long_is_not_fully_similar():
    # 3 tokens all inside a 30-token entry: containment would say 1.0, Jaccard ~0.1.
    sim = DS.jaccard_similarity(size_a=3, size_b=30, common=3)
    assert sim < 0.2


def test_identical_sets_are_fully_similar():
    assert DS.jaccard_similarity(size_a=10, size_b=10, common=10) == 1.0


def test_recall_fix_is_wired():
    src = _read("detection/07_ks_recall_lens.py")
    assert "union_tokens" in src, "recall lens must use a union denominator (Jaccard)"


# --- F7: probability clamp ---

def test_clamp_keeps_probabilities_in_unit_interval():
    assert DS.clamp_unit(1.4) == 1.0
    assert DS.clamp_unit(-0.2) == 0.0
    assert DS.clamp_unit(0.5) == 0.5


def test_monte_carlo_fix_is_wired():
    src = _read("analytics/06_monte_carlo_threat_forecast.py")
    assert "clamp_unit(flow[\"calibrated_prob\"] + noise)" in src, \
        "effective_prob must be clamped before the uniform draw"


# --- F9: absence liveness gate ---

def test_absence_liveness_gate_is_wired():
    src = _read("correlation/02_negative_correlation.py")
    assert "ingestion_alive" in src, "absence detection must gate on ingestion liveness"
    assert "for rule in neg_rules if ingestion_alive else []" in src, \
        "the rule loop must not run when ingestion is dead"


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
