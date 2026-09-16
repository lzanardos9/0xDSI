"""
Shared numeric helpers for the analytics rollup notebooks
(09_soc_optimization, 10_platform_economics, 11_executive_rollup,
12_industry_threat_posture).

These are the score/ratio compositions that turn Spark aggregates into the
scalar KPIs the dashboards render. Kept pure (stdlib only, no Spark) so the
notebooks import them on a cluster AND the offline property tests in
tests/property/test_analytics_math.py pin their behavior. Edge cases (empty
windows, zero denominators) matter here because a fresh deploy has no data and
these must degrade to sane numbers rather than raise or emit NaN/inf.
"""


def clamp(value, lo=0.0, hi=100.0):
    """Constrain value to [lo, hi]; None becomes lo."""
    if value is None:
        return lo
    return max(lo, min(hi, value))


def safe_rate(numerator, denominator, scale=100.0):
    """numerator/denominator * scale, returning 0.0 when denominator is 0/None."""
    if not denominator:
        return 0.0
    return (numerator or 0) / denominator * scale


def pct_change(current, previous):
    """Percentage change from previous to current.

    Returns 0.0 when there is no previous baseline (avoids a divide-by-zero and
    a misleading +100% on the first-ever run).
    """
    if not previous:
        return 0.0
    return ((current or 0) - previous) / previous * 100.0


def avg_minutes(seconds_values):
    """Average of a list of second-durations, expressed in minutes.

    Ignores None entries; returns 0.0 for an empty list.
    """
    vals = [v for v in (seconds_values or []) if v is not None]
    if not vals:
        return 0.0
    return round((sum(vals) / len(vals)) / 60.0, 2)


def weighted_score(components):
    """Weighted average of (value, weight) pairs, result clamped to [0, 100].

    Weights are normalized by their own sum, so callers need not pre-normalize.
    Returns 0.0 when there are no components or all weights are 0.
    """
    total_weight = sum(w for _, w in components) if components else 0
    if not total_weight:
        return 0.0
    acc = sum((v or 0) * w for v, w in components)
    return round(clamp(acc / total_weight), 2)


def health_score(detection, response, coverage):
    """Composite SOC health from three sub-scores (each 0-100).

    Detection and response are weighted above coverage because they reflect live
    operational effectiveness, whereas coverage is a slower-moving posture input.
    """
    return weighted_score([
        (detection, 0.4),
        (response, 0.4),
        (coverage, 0.2),
    ])


def savings(current_cost, optimized_cost):
    """Return (savings_amount, savings_pct) from current vs optimized spend."""
    cur = current_cost or 0
    opt = optimized_cost or 0
    amount = max(cur - opt, 0)
    pct = round(safe_rate(amount, cur), 1)
    return round(amount, 2), pct


def round2(value):
    """Round to 2 dp, mapping None to 0.0 (Delta-safe DOUBLE)."""
    return round(value or 0.0, 2)
