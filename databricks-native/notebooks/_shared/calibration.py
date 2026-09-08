# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Score Calibration
# MAGIC
# MAGIC Pure, dependency-free math that separates three things the fusion pipeline
# MAGIC previously conflated:
# MAGIC
# MAGIC 1. **Significance / anomaly strength** — how unusual a detector found an
# MAGIC    event (`raw_score` in [0,1]). Being unusual is NOT being malicious.
# MAGIC 2. **Calibrated probability of maliciousness** — P(malicious | score),
# MAGIC    which depends on the *base rate* of maliciousness, not just the score.
# MAGIC 3. **A simple, defensible baseline** — independent Bayesian (naive-Bayes)
# MAGIC    log-odds pooling, used to check that the elaborate Dempster-Shafer
# MAGIC    fusion is not doing something absurd or overfit.
# MAGIC
# MAGIC Addresses REV2-02 (anomaly score treated as posterior), REV2-06
# MAGIC (significance conflated with maliciousness) and REV2-28 (no baseline).
# MAGIC
# MAGIC Stdlib-only so it is imported by notebooks on a cluster AND by the offline
# MAGIC property tests without a Spark session.

# COMMAND ----------

import math

# Probabilities are clamped away from 0/1 so log-odds stay finite.
_EPS = 1e-6

# Default prior: malicious events are rare among the things detectors flag.
# A detector firing is evidence, but the prior that any given flagged entity is
# actually malicious is low. Per-class overrides refine this.
DEFAULT_BASE_RATE = 0.05

# Base rate of maliciousness given a signal of this class fired. Higher for
# high-precision sources (threat intel exact-match), lower for noisy anomaly
# detectors. These are conservative defaults, not fitted values, and are the
# single knob operators tune as labelled outcomes accumulate.
SIGNAL_BASE_RATES = {
    "threat_intel": 0.60,
    "ks_recall": 0.25,
    "slm_classification": 0.20,
    "cep": 0.15,
    "graph": 0.12,
    "negative_correlation": 0.10,
    "cet": 0.08,
    "behavioral_anomaly": 0.05,
    "formula_score": 0.05,
    "bytecode_semantics": 0.15,
}

# Sharpness < 1 shrinks an over-confident detector's score toward the prior
# (it distrusts extreme scores); 1.0 trusts the score's spread as-is. Kept at or
# below 1 because uncalibrated anomaly detectors are typically over-confident.
SIGNAL_SHARPNESS = {
    "threat_intel": 1.0,
    "formula_score": 0.7,
    "behavioral_anomaly": 0.7,
}
DEFAULT_SHARPNESS = 0.8


def _clamp01(p: float) -> float:
    return min(1.0 - _EPS, max(_EPS, float(p)))


def logit(p: float) -> float:
    p = _clamp01(p)
    return math.log(p / (1.0 - p))


def sigmoid(x: float) -> float:
    if x >= 0:
        z = math.exp(-x)
        return 1.0 / (1.0 + z)
    z = math.exp(x)
    return z / (1.0 + z)


def class_base_rate(signal_class: str) -> float:
    return SIGNAL_BASE_RATES.get(signal_class, DEFAULT_BASE_RATE)


def class_sharpness(signal_class: str) -> float:
    return SIGNAL_SHARPNESS.get(signal_class, DEFAULT_SHARPNESS)


def calibrate_probability(raw_score: float, base_rate: float = DEFAULT_BASE_RATE,
                          sharpness: float = 1.0) -> float:
    """Map a raw detector score (evidence strength / significance) in [0,1] to a
    calibrated posterior probability of maliciousness, anchored to ``base_rate``.

    Log-odds (Platt-style) calibration with a prior offset::

        logit(p) = logit(base_rate) + sharpness * logit(raw_score)

    Properties this guarantees (all proven in tests/property/test_calibration.py):
      * raw_score == 0.5  ->  p == base_rate   (a "neutral" score reveals nothing
        beyond the prior; it does not mean 50% malicious)
      * monotonically increasing in raw_score
      * for a rare base_rate, a high anomaly score yields a much smaller
        probability than the score itself — significance is not maliciousness
      * p stays strictly inside (0, 1)
    """
    return sigmoid(logit(base_rate) + sharpness * logit(raw_score))


def significance_to_probability(significance: float,
                                base_rate: float = DEFAULT_BASE_RATE,
                                sharpness: float = 1.0) -> float:
    """Alias that names the intent for REV2-06: a statistical significance
    (e.g. 1 - p_value, normalized to [0,1]) is converted to a probability of
    maliciousness via the base rate, never used as the probability directly."""
    return calibrate_probability(significance, base_rate, sharpness)


def apply_freshness(probability: float, base_rate: float, decay: float) -> float:
    """Age a calibrated probability toward the prior as evidence gets stale.

    ``decay`` in [0,1] is a freshness factor (1 = fresh, 0 = fully stale). Stale
    evidence should revert to the base rate (we know nothing new), NOT collapse
    to "benign" (probability 0), which would be its own miscalibration."""
    d = min(1.0, max(0.0, decay))
    return base_rate + (probability - base_rate) * d


def baseline_probability(independent_probs, base_rate: float = DEFAULT_BASE_RATE) -> float:
    """Simple, defensible fusion baseline: independent Bayesian (naive-Bayes)
    combination of calibrated per-signal probabilities in log-odds space::

        logit(post) = logit(base_rate) + Σ_i [logit(p_i) - logit(base_rate)]

    Each independent signal contributes its log-likelihood-ratio relative to the
    prior. A signal exactly at the base rate contributes nothing. This is the
    baseline the elaborate Dempster-Shafer fusion is checked against (REV2-28):
    if D-S disagrees with this on the *ordering* of cases, that is a red flag.
    """
    prior_lo = logit(base_rate)
    post_lo = prior_lo
    for p in independent_probs:
        post_lo += logit(p) - prior_lo
    return sigmoid(post_lo)
