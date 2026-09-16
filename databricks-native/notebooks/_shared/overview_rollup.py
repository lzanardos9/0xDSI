"""
Shared pure logic for the platform Overview rollup (analytics/14).

Turns platform-wide aggregates into the headline posture the "Overview"
Command Center and the SOC 3D situational view render. Kept pure (stdlib only,
no Spark) so the notebook imports it on a cluster AND the offline property
tests in tests/property/test_overview_rollup.py pin its behavior. A fresh
deploy has no events or alerts, so every helper must degrade to a calm,
sane baseline rather than raise.

The DEFCON thresholds and risk-metric labels/weights intentionally mirror the
frontend's command-center/useSharedThreatState.ts so a server snapshot slots
straight into the existing gauge.
"""

# Risk posture categories rendered by the command-center gauge, with the same
# labels and weights the frontend falls back to when there is no live snapshot.
RISK_CATEGORIES = [
    ("Network Perimeter", 0.25),
    ("Endpoint Hygiene", 0.20),
    ("Identity Risk", 0.20),
    ("Data Exposure", 0.20),
    ("Cloud Posture", 0.15),
]


def alert_level(critical_open, high_open, high_threshold=5):
    """Headline alert level from open-alert pressure.

    CRITICAL as soon as any critical alert is open; HIGH once enough high-severity
    alerts pile up; ELEVATED as the calm baseline (never "all clear", because a
    live SOC always watches).
    """
    if (critical_open or 0) > 0:
        return "CRITICAL"
    if (high_open or 0) >= high_threshold:
        return "HIGH"
    return "ELEVATED"


def defcon_from_score(score):
    """Map a 0-100 composite risk score onto a 1 (worst) - 5 (calm) DEFCON level.

    Thresholds match the frontend's scoreToDefcon so server and client agree.
    """
    s = score or 0
    if s >= 85:
        return 1
    if s >= 70:
        return 2
    if s >= 50:
        return 3
    if s >= 25:
        return 4
    return 5


def category_risk(open_count, max_open, baseline=35.0):
    """Risk score (0-100, higher = worse) for one posture category.

    Blends a calm baseline with alert pressure measured relative to the busiest
    category, so a quiet deploy sits near the baseline instead of at zero and a
    hot category climbs toward 100. Returns the baseline when there is no
    pressure anywhere (max_open == 0).
    """
    if not max_open:
        return round(baseline, 1)
    pressure = (open_count or 0) / max_open  # 0..1
    score = baseline + (100.0 - baseline) * pressure
    return round(max(0.0, min(100.0, score)), 1)


def eps(events_in_window, window_seconds):
    """Events-per-second over a window; 0.0 when the window is empty/zero."""
    if not window_seconds:
        return 0.0
    return round((events_in_window or 0) / window_seconds, 2)
