"""
Property tests for the bounded temporal sequence matcher (REV2-07/09/10).

temporal_matcher.py is pure stdlib, so putting notebooks/_shared on sys.path
makes it importable with no Spark. These tests pin the guarantees the correlation
layer relies on: an ordered multi-step sequence matches only in order and only
inside its time horizon (REV2-07), an absence guard kills a partial and a late
event expires rather than completes (REV2-09), and every completed or partial
match carries the exact supporting event ids while live state stays bounded
(REV2-10).

Run:  python3 databricks-native/tests/property/test_temporal_matcher.py
"""

import os
import sys

SHARED = os.path.join(os.path.dirname(__file__), "..", "..", "notebooks", "_shared")
sys.path.insert(0, os.path.abspath(SHARED))

import temporal_matcher as T  # noqa: E402


def _eq(field, value):
    return lambda e: e.get(field) == value


def _feed(matcher, events):
    """events: list of (event_dict, ts, event_id). Returns all results."""
    out = []
    for event, ts, eid in events:
        out.extend(matcher.advance(event, ts, eid))
    return out


# --- Pattern / Step validation ---

def test_pattern_must_open_with_match_step():
    try:
        T.Pattern("p", (T.Step("no", _eq("t", "x"), kind=T.ABSENCE),), within_seconds=60)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_match_step_rejects_bad_counts():
    try:
        T.Step("s", _eq("t", "a"), min_count=0)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_within_seconds_must_be_positive():
    try:
        T.Pattern("p", (T.Step("s", _eq("t", "a")),), within_seconds=0)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


# --- REV2-07: ordered, bounded matching ---

def test_ordered_sequence_completes_in_order():
    pat = T.Pattern("aXbXc", (
        T.Step("a", _eq("t", "a")),
        T.Step("b", _eq("t", "b")),
        T.Step("c", _eq("t", "c")),
    ), within_seconds=100)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [
        ({"t": "a"}, 0, "e1"),
        ({"t": "b"}, 10, "e2"),
        ({"t": "c"}, 20, "e3"),
    ])
    assert len(res) == 1
    assert res[0].outcome == T.COMPLETED
    assert res[0].supporting_event_ids == ("e1", "e2", "e3")


def test_out_of_order_does_not_complete():
    pat = T.Pattern("ab", (T.Step("a", _eq("t", "a")), T.Step("b", _eq("t", "b"))),
                    within_seconds=100)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [({"t": "b"}, 0, "e1"), ({"t": "b"}, 5, "e2")])
    assert res == []
    assert m.live_partials() == []


def test_bounded_repetition_requires_min_count():
    # need 3 'a' then a 'b'
    pat = T.Pattern("a3b", (
        T.Step("a", _eq("t", "a"), min_count=3, max_count=3),
        T.Step("b", _eq("t", "b")),
    ), within_seconds=100)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [
        ({"t": "a"}, 0, "a1"), ({"t": "a"}, 1, "a2"),
        ({"t": "b"}, 2, "early"),           # too early: only 2 a's so far
    ])
    assert res == []
    res = _feed(m, [({"t": "a"}, 3, "a3"), ({"t": "b"}, 4, "b1")])
    assert len(res) == 1 and res[0].outcome == T.COMPLETED
    assert res[0].supporting_event_ids == ("a1", "a2", "a3", "b1")


def test_single_step_pattern_completes_on_seed():
    pat = T.Pattern("justA", (T.Step("a", _eq("t", "a")),), within_seconds=10)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [({"t": "a"}, 0, "e1")])
    assert len(res) == 1 and res[0].outcome == T.COMPLETED
    assert res[0].supporting_event_ids == ("e1",)


# --- REV2-09: absence guards and late-arrival ---

def test_absence_guard_violates_partial():
    # a then c, but NOT b in between
    pat = T.Pattern("a_notb_c", (
        T.Step("a", _eq("t", "a")),
        T.Step("no_b", _eq("t", "b"), kind=T.ABSENCE),
        T.Step("c", _eq("t", "c")),
    ), within_seconds=100)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [
        ({"t": "a"}, 0, "e1"),
        ({"t": "b"}, 5, "e2"),   # forbidden -> kills the partial
    ])
    assert len(res) == 1 and res[0].outcome == T.VIOLATED
    # a later 'c' must not complete anything
    res2 = _feed(m, [({"t": "c"}, 10, "e3")])
    assert res2 == []


def test_absence_absent_allows_completion():
    pat = T.Pattern("a_notb_c", (
        T.Step("a", _eq("t", "a")),
        T.Step("no_b", _eq("t", "b"), kind=T.ABSENCE),
        T.Step("c", _eq("t", "c")),
    ), within_seconds=100)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [({"t": "a"}, 0, "e1"), ({"t": "c"}, 10, "e3")])
    assert len(res) == 1 and res[0].outcome == T.COMPLETED
    assert res[0].supporting_event_ids == ("e1", "e3")


def test_late_event_expires_not_completes():
    pat = T.Pattern("ab", (T.Step("a", _eq("t", "a")), T.Step("b", _eq("t", "b"))),
                    within_seconds=30)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [
        ({"t": "a"}, 0, "e1"),
        ({"t": "b"}, 45, "e2"),   # past the 30s horizon
    ])
    assert len(res) == 1 and res[0].outcome == T.EXPIRED
    assert m.live_partials() == []


def test_sweep_expired_reports_timed_out_partials():
    pat = T.Pattern("ab", (T.Step("a", _eq("t", "a")), T.Step("b", _eq("t", "b"))),
                    within_seconds=30)
    m = T.TemporalMatcher(pat)
    _feed(m, [({"t": "a"}, 0, "e1")])
    assert len(m.live_partials()) == 1
    expired = m.sweep_expired(now_ts=100)
    assert len(expired) == 1 and expired[0].outcome == T.EXPIRED
    assert m.live_partials() == []


# --- REV2-10: supporting ids + bounded, durable partial state ---

def test_partial_state_is_serializable_and_carries_ids():
    pat = T.Pattern("abc", (
        T.Step("a", _eq("t", "a")), T.Step("b", _eq("t", "b")), T.Step("c", _eq("t", "c")),
    ), within_seconds=100)
    m = T.TemporalMatcher(pat)
    _feed(m, [({"t": "a"}, 0, "e1"), ({"t": "b"}, 5, "e2")])
    live = m.live_partials()
    assert len(live) == 1
    d = live[0].to_dict()
    assert d["supporting_event_ids"] == ["e1", "e2"]
    assert d["stage_index"] == 2 and d["start_ts"] == 0


def test_live_partials_are_capped():
    pat = T.Pattern("ab", (T.Step("a", _eq("t", "a")), T.Step("b", _eq("t", "b"))),
                    within_seconds=1000, max_partial=3)
    m = T.TemporalMatcher(pat)
    _feed(m, [({"t": "a"}, i, f"a{i}") for i in range(10)])
    assert len(m.live_partials()) == 3
    assert m.dropped_over_capacity == 7


def test_overlapping_matches_each_keep_their_own_ids():
    pat = T.Pattern("ab", (T.Step("a", _eq("t", "a")), T.Step("b", _eq("t", "b"))),
                    within_seconds=1000)
    m = T.TemporalMatcher(pat)
    res = _feed(m, [
        ({"t": "a"}, 0, "a1"),
        ({"t": "a"}, 1, "a2"),
        ({"t": "b"}, 2, "b1"),   # completes both partials on the same b
    ])
    completed = [r for r in res if r.outcome == T.COMPLETED]
    assert len(completed) == 2
    id_sets = sorted(r.supporting_event_ids for r in completed)
    assert id_sets == [("a1", "b1"), ("a2", "b1")]


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
