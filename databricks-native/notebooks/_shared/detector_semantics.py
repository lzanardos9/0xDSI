"""
Pure detector-semantics helpers (Phase 8 / Gate C).

Several streaming detectors compute a score with subtly wrong math and then
persist it as a confidence/probability. The notebooks that host them run
`dbutils`/`spark` at import time, so the math cannot be unit-tested in place.
This module holds the fixed math as pure stdlib functions (no numpy, no Spark)
so the notebooks delegate to it and the offline suite can pin the behaviour.

Each fix is documented against the defect it closes:

- iforest_anomaly_norm  -- an Isolation-Forest decision_function is SIGNED
  (negative = anomalous, positive = normal); the magnitude of a NORMAL point
  must not be read as anomaly strength.
- is_periodic_beacon    -- a periodic beacon has near-constant inter-arrival
  times; "consistent with a uniform distribution" is the OPPOSITE of periodic,
  so a uniform goodness-of-fit test must never be used to assert periodicity.
- clamp_unit            -- a probability perturbed by additive noise must stay
  in [0, 1] before it is compared against a uniform draw, or transitions fire
  always / never at the tails.
- jaccard_similarity    -- token overlap normalised by the SHORTER side is a
  containment ratio, not a symmetric similarity; use the union.
"""

from statistics import median, pstdev, mean as _mean


def clamp_unit(x):
    """Clamp x into the closed unit interval [0, 1]."""
    if x < 0.0:
        return 0.0
    if x > 1.0:
        return 1.0
    return x


def iforest_anomaly_norm(score, scale):
    """Normalise a signed Isolation-Forest score to an anomaly strength in [0, 1].

    `sklearn`'s `decision_function` is negative for anomalies and positive for
    inliers, the magnitude being the distance from the decision boundary. Only
    the anomalous (negative) side carries anomaly evidence: a strongly NORMAL
    point (large positive score) must map to 0, not to 1 as `abs(score)/scale`
    would. `scale` sets how negative counts as "fully anomalous"; a non-positive
    scale falls back to 1.0 so the result is still bounded.
    """
    if scale is None or scale <= 0.0:
        scale = 1.0
    anomalous_depth = -float(score)  # positive only when score < 0
    if anomalous_depth <= 0.0:
        return 0.0
    return clamp_unit(anomalous_depth / scale)


def is_periodic_beacon(iats, tight_cv=0.15, loose_cv=0.30,
                        band=0.25, min_regular_fraction=0.70):
    """Decide whether a sequence of inter-arrival times looks like a beacon.

    Returns (is_beacon, confidence in [0, 1]).

    A beacon fires on a near-fixed cadence, so its inter-arrival times cluster
    tightly. Two regimes:
      * cv < tight_cv          -- unambiguously regular; confidence ~ 1 - cv.
      * tight_cv <= cv < loose_cv -- borderline: confirm regularity directly by
        requiring a strong majority of the intervals to fall within +/-`band`
        of the MEDIAN interval. This replaces the previous test that declared a
        beacon when the intervals were "consistent with uniform" (p > 0.05),
        which is backwards -- uniform spacing is the opposite of periodic, and
        failing to reject a null is not evidence for it.
    Anything looser is not a beacon.
    """
    if iats is None or len(iats) < 4:
        return False, 0.0
    m = _mean(iats)
    if m < 1.0:
        return False, 0.0
    cv = pstdev(iats) / max(m, 0.001)

    if cv < tight_cv:
        return True, min(0.99, 1.0 - cv)

    if cv < loose_cv:
        med = median(iats)
        if med <= 0.0:
            return False, 0.0
        within = sum(1 for x in iats if abs(x - med) <= band * med)
        fraction = within / len(iats)
        if fraction >= min_regular_fraction:
            # Confidence blends the spread (1 - cv) with how much of the traffic
            # actually sits on the cadence, so a barely-regular stream scores low.
            return True, clamp_unit((1.0 - cv) * fraction)

    return False, 0.0


def jaccard_similarity(size_a, size_b, common):
    """Symmetric token-set similarity: |A n B| / |A u B|.

    Normalising the intersection by one side's length (a containment ratio)
    lets a short text that is fully contained in a long one score 1.0; the union
    denominator makes the score symmetric and length-aware.
    """
    union = size_a + size_b - common
    if union <= 0:
        return 0.0
    return clamp_unit(common / union)
