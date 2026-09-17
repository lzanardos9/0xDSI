"""
Fault-injection regression for threat-intel match -> alert recovery (H-030).

Reproduces the Phase 4 finding and proves it is fixed: a crash between persisting
a match and persisting its alert must NOT leave a match without an alert, and
recovery must create exactly one logical alert per match while retaining every
affected entity.

Uses the real `ti_recovery` reconciler (pure Python) with an in-memory store that
can raise before any chosen step, so the partial-failure/retry path runs with no
Spark session.

Run:  python3 databricks-native/tests/property/test_ti_recovery.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import ti_recovery as R  # noqa: E402


class InMemoryStore:
    """Durable store double. Upserts are idempotent (keyed on id); one fault can
    be armed to raise before a named step, then it clears (models a single crash
    followed by a successful retry)."""

    def __init__(self):
        self.matches: dict = {}
        self.alerts: dict = {}
        self.fail_before = None

    def _maybe_fail(self, step):
        if self.fail_before == step:
            self.fail_before = None
            raise RuntimeError(f"injected crash before {step}")

    def upsert_matches(self, matches):
        self._maybe_fail("upsert_matches")
        for m in matches:
            if m["match_id"] not in self.matches:
                self.matches[m["match_id"]] = dict(m)  # preserves alert_emitted flag on retry

    def pending_alert_matches(self):
        self._maybe_fail("pending_alert_matches")
        return [dict(m) for m in self.matches.values() if not m.get("alert_emitted")]

    def upsert_alerts(self, alerts):
        self._maybe_fail("upsert_alerts")
        for a in alerts:
            self.alerts[a["id"]] = dict(a)

    def mark_alerts_emitted(self, match_ids):
        self._maybe_fail("mark_alerts_emitted")
        for mid in match_ids:
            if mid in self.matches:
                self.matches[mid]["alert_emitted"] = True


def _match(event_id, indicator, entity, match_type="dest_ip", conf=0.95):
    return {
        "event_id": event_id,
        "matched_indicator": indicator,
        "match_type": match_type,
        "entity_key": entity,
        "threat_type": "c2",
        "confidence": conf,
        "ioc_source": "test-feed",
        "event_type": "network",
    }


def test_happy_path_one_alert_per_match():
    store = InMemoryStore()
    R.MatchAlertReconciler(store).process_batch([_match("e1", "evil.com", "host-a")])
    assert len(store.matches) == 1
    assert len(store.alerts) == 1
    assert all(m["alert_emitted"] for m in store.matches.values())


def test_crash_between_match_and_alert_still_yields_the_alert():
    """The core H-030 regression: fail after matches persist, before alerts."""
    store = InMemoryStore()
    batch = [_match("e1", "evil.com", "host-a")]
    rec = R.MatchAlertReconciler(store)

    store.fail_before = "upsert_alerts"
    try:
        rec.process_batch(batch)
        raise AssertionError("injected crash should have propagated")
    except RuntimeError:
        pass

    # Match is persisted but has NO alert yet — exactly the dangerous state.
    assert len(store.matches) == 1
    assert len(store.alerts) == 0
    assert all(not m["alert_emitted"] for m in store.matches.values())

    # Retry (stream reprocesses the same batch). Recovery must emit the alert.
    rec.process_batch(batch)
    assert len(store.alerts) == 1, "recovery must create the missing alert"
    assert all(m["alert_emitted"] for m in store.matches.values())


def test_crash_after_alert_before_mark_does_not_duplicate():
    store = InMemoryStore()
    batch = [_match("e1", "evil.com", "host-a")]
    rec = R.MatchAlertReconciler(store)

    store.fail_before = "mark_alerts_emitted"
    try:
        rec.process_batch(batch)
        raise AssertionError("injected crash should have propagated")
    except RuntimeError:
        pass

    assert len(store.alerts) == 1  # alert written, but not marked
    assert all(not m["alert_emitted"] for m in store.matches.values())

    rec.process_batch(batch)  # retry
    assert len(store.alerts) == 1, "re-emit must collapse onto the same alert id"
    assert all(m["alert_emitted"] for m in store.matches.values())


def test_reprocessing_same_batch_is_idempotent():
    store = InMemoryStore()
    batch = [_match("e1", "evil.com", "host-a")]
    rec = R.MatchAlertReconciler(store)
    rec.process_batch(batch)
    rec.process_batch(batch)
    rec.process_batch(batch)
    assert len(store.matches) == 1
    assert len(store.alerts) == 1


def test_two_hosts_same_indicator_are_two_alerts():
    store = InMemoryStore()
    rec = R.MatchAlertReconciler(store)
    rec.process_batch([
        _match("e1", "evil.com", "host-a"),
        _match("e2", "evil.com", "host-b"),
    ])
    assert len(store.matches) == 2, "two entities must not collapse into one match"
    assert len(store.alerts) == 2


def test_alert_and_match_ids_are_deterministic():
    m1 = R.match_identity("evil.com", "dest_ip", "host-a")
    m2 = R.match_identity("evil.com", "dest_ip", "host-a")
    assert m1 == m2
    assert R.alert_identity(m1) == R.alert_identity(m2)
    # Different entity -> different match id.
    assert R.match_identity("evil.com", "dest_ip", "host-b") != m1
    # Different dedup window -> re-opened finding (a new match id).
    assert R.match_identity("evil.com", "dest_ip", "host-a", window_bucket=7) != m1


def test_same_entity_same_indicator_is_one_finding_regardless_of_event():
    """Two different triggering events for the same entity+IOC collapse to one
    finding (event_id is not part of identity)."""
    store = InMemoryStore()
    rec = R.MatchAlertReconciler(store)
    rec.process_batch([_match("e1", "evil.com", "host-a")])
    rec.process_batch([_match("e2", "evil.com", "host-a")])  # different event, same finding
    assert len(store.matches) == 1
    assert len(store.alerts) == 1


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
