"""
Shared pure logic for the MITRE ATT&CK coverage rollup (analytics/13).

Turns per-technique alert aggregates into the coverage classification the
"MITRE ATT&CK Coverage Matrix" tab renders. Kept pure (stdlib only, no Spark)
so the notebook imports it on a cluster AND the offline property tests in
tests/property/test_mitre_coverage.py pin its behavior. A fresh deploy has no
alerts, so every helper must degrade to a sane value rather than raise.

Status meaning (matches the frontend legend):
  detected - at least one detection fired in the window (live coverage)
  covered  - enough detection rules exist to consider the technique covered
  partial  - some rule coverage, but below the "covered" bar
  gap      - no rule coverage at all
"""

COVERED_RULE_THRESHOLD = 3


def classify_status(rule_count, detection_count):
    """Classify a technique from its rule count and in-window detections.

    A live detection always wins (it is observed, not just configured). Absent
    a detection, coverage is judged purely on how many distinct rules target the
    technique.
    """
    rc = int(rule_count or 0)
    dc = int(detection_count or 0)
    if dc > 0:
        return "detected"
    if rc >= COVERED_RULE_THRESHOLD:
        return "covered"
    if rc >= 1:
        return "partial"
    return "gap"


def coverage_pct(statuses):
    """Share of techniques that are 'covered' or 'detected', as a 0-100 percent.

    Returns 0.0 for an empty list (fresh deploy) rather than dividing by zero.
    """
    items = list(statuses or [])
    if not items:
        return 0.0
    good = sum(1 for s in items if s in ("covered", "detected"))
    return round(good / len(items) * 100.0, 1)


def risk_ten(avg_risk_score):
    """Map an averaged 0-100 risk score onto the frontend's 1-10 risk band.

    Returns 0 when there is no signal so the caller can keep a static baseline
    instead of forcing every unseen technique to risk 1.
    """
    if not avg_risk_score:
        return 0
    band = round(avg_risk_score / 10.0)
    return max(1, min(10, int(band)))
