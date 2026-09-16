"""
Honest connector/collector health: green requires real, recent collection (REV2-19).

The fleet endpoints previously reported health straight from a stored label
(`edge_collector_registry.status`, `connector_deployments.actual_state`). A
collector whose row still says "healthy"/"running" but whose last heartbeat is
hours old -- or that has forwarded zero events -- was still counted green. That
is a false green: operators believe telemetry is flowing when nothing is being
collected.

This module derives an *effective* health status from real signals (heartbeat
freshness plus recent event flow) and never lets a stored label override missing
evidence of collection. It is deny-by-default toward green: HEALTHY is returned
only when a heartbeat is fresh AND, when event flow is observable, events are
actually flowing. Pure stdlib so the logic is exercised by offline tests with no
database.
"""

from datetime import datetime, timezone

# --- Effective health states ---
HEALTHY = "healthy"      # fresh heartbeat and (if observable) events flowing
DEGRADED = "degraded"    # reporting, but the source flagged it degraded
SILENT = "silent"        # fresh heartbeat but no events -> collecting nothing
STALE = "stale"          # heartbeat too old -> collection cannot be confirmed
OFFLINE = "offline"      # source reports it down / stopped / decommissioned
UNKNOWN = "unknown"      # never sent a heartbeat -> nothing to confirm

STATES = (HEALTHY, DEGRADED, SILENT, STALE, OFFLINE, UNKNOWN)

# Only this state means "real collection confirmed". Everything else is a
# non-green state; listed explicitly so a state added later is non-green by
# default rather than silently counted as healthy.
GREEN_STATES = frozenset({HEALTHY})
NON_GREEN_STATES = frozenset(s for s in STATES if s not in GREEN_STATES)

# Stored labels that assert the source is down. These win over freshness because
# the source is telling us it is not collecting.
_OFFLINE_LABELS = frozenset({"offline", "dead", "stopped", "decommissioned", "disabled"})
# Stored labels that assert reduced-but-present operation.
_DEGRADED_LABELS = frozenset({"degraded", "error", "warning", "unhealthy"})

# A collector must have been heard from within this window to be trusted as live.
DEFAULT_HEARTBEAT_TIMEOUT_SECONDS = 300


def heartbeat_age_seconds(last_heartbeat, now=None):
    """Seconds since the last heartbeat, or None if it never reported.

    Accepts a datetime or an ISO-8601 string (naive timestamps are treated as
    UTC). Anything unparseable is treated as "never reported" (None) rather than
    silently fresh -- an unreadable timestamp must not produce a green.
    """
    if last_heartbeat is None or last_heartbeat == "":
        return None
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    ts = last_heartbeat
    if isinstance(ts, str):
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except ValueError:
            return None
    if not isinstance(ts, datetime):
        return None
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (now - ts).total_seconds()


def derive_health(
    stored_status,
    age_seconds,
    events_recent=None,
    heartbeat_timeout_seconds=DEFAULT_HEARTBEAT_TIMEOUT_SECONDS,
):
    """Effective health from real signals, never trusting the stored label alone.

    Precedence (first match wins):
      1. a stored down/stopped label -> OFFLINE (the source says it is down)
      2. no heartbeat ever -> UNKNOWN
      3. heartbeat older than the freshness budget -> STALE
      4. heartbeat fresh but observable events are zero -> SILENT
      5. a stored degraded label -> DEGRADED
      6. fresh heartbeat and (unobservable or non-zero) events -> HEALTHY

    `events_recent` is the recent event flow (24h count, events/sec, ...). When
    it is None the flow is not observable and freshness alone governs; when it is
    a number it must be > 0 for HEALTHY, so a live-but-silent source is never
    reported green.
    """
    label = (stored_status or "").strip().lower()
    if label in _OFFLINE_LABELS:
        return OFFLINE
    if age_seconds is None:
        return UNKNOWN
    if age_seconds > heartbeat_timeout_seconds:
        return STALE
    if events_recent is not None and events_recent <= 0:
        return SILENT
    if label in _DEGRADED_LABELS:
        return DEGRADED
    return HEALTHY


def summarize_fleet(effective_statuses):
    """Roll up derived statuses into honest fleet counts.

    Returns total, a per-state breakdown covering every known state (zero-filled
    so a state is never missing), and `collecting` -- the number of sources with
    confirmed real collection (green). `not_collecting` is everything else, so a
    caller cannot mistake "reporting" for "collecting".
    """
    counts = {state: 0 for state in STATES}
    total = 0
    for status in effective_statuses:
        total += 1
        counts[status] = counts.get(status, 0) + 1
    collecting = sum(counts[s] for s in GREEN_STATES)
    return {
        "total": total,
        "collecting": collecting,
        "not_collecting": total - collecting,
        "by_state": counts,
    }
