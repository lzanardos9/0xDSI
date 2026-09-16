"""
Property tests for honest connector/collector health (REV2-19).

connector_health.py is pure stdlib, so putting app/backend on sys.path makes it
importable with no database. These tests pin the guarantee the fleet endpoints
rely on: a stored "healthy"/"running" label never produces green on its own --
green requires a fresh heartbeat AND, when event flow is observable, events
actually flowing. A stale heartbeat, a never-heard-from source, or a live but
silent source is never counted as collecting.

Run:  python3 databricks-native/tests/property/test_connector_health.py
"""

import os
import sys
from datetime import datetime, timedelta, timezone

BACKEND = os.path.join(os.path.dirname(__file__), "..", "..", "app", "backend")
sys.path.insert(0, os.path.abspath(BACKEND))

import connector_health as H  # noqa: E402

NOW = datetime(2026, 9, 16, 12, 0, 0, tzinfo=timezone.utc)


# --- derive_health: green only with real, recent collection ---

def test_fresh_heartbeat_with_events_is_healthy():
    assert H.derive_health("healthy", age_seconds=30, events_recent=1200) == H.HEALTHY


def test_fresh_heartbeat_unobservable_events_is_healthy():
    # events_recent None -> flow not observable, freshness alone governs.
    assert H.derive_health("running", age_seconds=30, events_recent=None) == H.HEALTHY


def test_healthy_label_but_stale_heartbeat_is_stale_not_green():
    assert H.derive_health("healthy", age_seconds=4000, events_recent=999) == H.STALE


def test_running_label_but_never_reported_is_unknown_not_green():
    assert H.derive_health("running", age_seconds=None, events_recent=None) == H.UNKNOWN


def test_fresh_heartbeat_but_zero_events_is_silent_not_green():
    assert H.derive_health("healthy", age_seconds=10, events_recent=0) == H.SILENT


def test_offline_label_wins_even_with_fresh_heartbeat():
    for label in ("offline", "dead", "stopped", "decommissioned", "disabled"):
        assert H.derive_health(label, age_seconds=5, events_recent=500) == H.OFFLINE


def test_degraded_label_with_fresh_flow_is_degraded():
    assert H.derive_health("degraded", age_seconds=5, events_recent=10) == H.DEGRADED


def test_boundary_at_timeout_is_healthy_just_past_is_stale():
    t = H.DEFAULT_HEARTBEAT_TIMEOUT_SECONDS
    assert H.derive_health("healthy", age_seconds=t, events_recent=1) == H.HEALTHY
    assert H.derive_health("healthy", age_seconds=t + 1, events_recent=1) == H.STALE


def test_only_healthy_is_a_green_state():
    assert H.GREEN_STATES == frozenset({H.HEALTHY})
    assert H.HEALTHY not in H.NON_GREEN_STATES
    for s in (H.STALE, H.SILENT, H.OFFLINE, H.UNKNOWN, H.DEGRADED):
        assert s in H.NON_GREEN_STATES


# --- heartbeat_age_seconds: unreadable timestamps are never fresh ---

def test_age_from_datetime():
    hb = NOW - timedelta(seconds=90)
    assert H.heartbeat_age_seconds(hb, NOW) == 90


def test_age_from_iso_string_with_z():
    hb = (NOW - timedelta(seconds=120)).isoformat().replace("+00:00", "Z")
    assert H.heartbeat_age_seconds(hb, NOW) == 120


def test_naive_timestamp_treated_as_utc():
    hb = (NOW - timedelta(seconds=60)).replace(tzinfo=None)
    assert H.heartbeat_age_seconds(hb, NOW) == 60


def test_missing_or_unparseable_timestamp_is_none():
    assert H.heartbeat_age_seconds(None, NOW) is None
    assert H.heartbeat_age_seconds("", NOW) is None
    assert H.heartbeat_age_seconds("not-a-date", NOW) is None
    assert H.heartbeat_age_seconds(12345, NOW) is None


def test_unparseable_timestamp_derives_unknown_not_green():
    age = H.heartbeat_age_seconds("garbage", NOW)
    assert H.derive_health("healthy", age, events_recent=999) == H.UNKNOWN


# --- summarize_fleet: reporting is not collecting ---

def test_summarize_counts_only_green_as_collecting():
    statuses = [H.HEALTHY, H.HEALTHY, H.STALE, H.SILENT, H.OFFLINE, H.UNKNOWN, H.DEGRADED]
    summary = H.summarize_fleet(statuses)
    assert summary["total"] == 7
    assert summary["collecting"] == 2
    assert summary["not_collecting"] == 5
    assert summary["by_state"]["stale"] == 1
    assert summary["by_state"]["silent"] == 1


def test_summarize_zero_fills_absent_states():
    summary = H.summarize_fleet([H.HEALTHY])
    for state in H.STATES:
        assert state in summary["by_state"]
    assert summary["by_state"]["offline"] == 0


def test_empty_fleet_reports_nothing_collecting():
    summary = H.summarize_fleet([])
    assert summary["total"] == 0
    assert summary["collecting"] == 0
    assert summary["not_collecting"] == 0


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
