"""
Bounded temporal sequence matcher (REV2-07, REV2-09, REV2-10).

The temporal correlators in this repo detect single-window aggregates (N failures
in 5 minutes, K distinct destinations, periodic beacons). None of them match a
*multi-step sequence* -- "A then B then C, within a bounded window, with no D in
between" -- which the audit flagged three ways:

  REV2-07  arbitrary-length sequence claims emulated with fixed motifs. This
           module matches a real ordered pattern with *bounded* repetition
           (min/max occurrences per step) inside an explicit time horizon, and
           caps live state, so nothing is unbounded and nothing is faked.
  REV2-09  no absence / late-arrival policy. A step may be an ABSENCE guard
           ("B must NOT occur before C"); a partial match is killed the moment a
           forbidden event arrives, and any event past a partial's horizon
           expires it (timeout) instead of completing late.
  REV2-10  partial-match state and supporting-event IDs discarded. Every partial
           match carries the ordered list of the exact event ids that advanced
           it, and live partials are inspectable/serializable so they survive a
           restart rather than being collapsed to a motif.

Pure stdlib: predicates are plain callables over an event mapping, so the whole
matcher is exercised by offline tests with no Spark and no database. A driver
notebook feeds events in per-key, ascending timestamp order and persists the
completed matches and the live partial state.
"""

from dataclasses import dataclass, replace
from typing import Callable

MATCH = "match"
ABSENCE = "absence"
_KINDS = (MATCH, ABSENCE)

# Why a partial match ended, for honest accounting rather than a silent drop.
COMPLETED = "completed"
EXPIRED = "expired"        # horizon passed before the sequence finished
VIOLATED = "violated"      # an ABSENCE guard fired


@dataclass(frozen=True)
class Step:
    """One position in the ordered pattern.

    A MATCH step consumes between `min_count` and `max_count` events that satisfy
    `predicate` before the sequence advances. An ABSENCE step names a predicate
    that must NOT be satisfied while the matcher waits for the next MATCH step;
    it consumes no events and has no counts.
    """
    name: str
    predicate: Callable[[dict], bool]
    kind: str = MATCH
    min_count: int = 1
    max_count: int = 1

    def __post_init__(self):
        if self.kind not in _KINDS:
            raise ValueError(f"unknown step kind: {self.kind!r}")
        if self.kind == MATCH:
            if self.min_count < 1 or self.max_count < self.min_count:
                raise ValueError("MATCH step needs 1 <= min_count <= max_count")


@dataclass(frozen=True)
class Pattern:
    """An ordered sequence of steps that must complete within a time horizon.

    `within_seconds` bounds how long a partial match may live; `max_partial`
    bounds how many partial matches are kept concurrently. Both keep state
    finite -- the matcher can never retain unbounded history.
    """
    name: str
    steps: tuple
    within_seconds: float
    max_partial: int = 10000

    def __post_init__(self):
        if self.within_seconds <= 0:
            raise ValueError("within_seconds must be positive")
        if self.max_partial < 1:
            raise ValueError("max_partial must be >= 1")
        match_steps = [s for s in self.steps if s.kind == MATCH]
        if not match_steps:
            raise ValueError("pattern needs at least one MATCH step")
        if self.steps and self.steps[0].kind != MATCH:
            raise ValueError("pattern must open with a MATCH step")


def _stages(pattern):
    """Compress steps into (match_step, guarding_absence_predicates) stages.

    Each MATCH step becomes a stage; any ABSENCE steps that precede it guard the
    gap between the previous MATCH and this one.
    """
    stages = []
    pending_absence = []
    for step in pattern.steps:
        if step.kind == ABSENCE:
            pending_absence.append(step.predicate)
        else:
            stages.append((step, tuple(pending_absence)))
            pending_absence = []
    return stages


@dataclass(frozen=True)
class PartialMatch:
    """Durable, inspectable state for one in-flight sequence (REV2-10)."""
    match_id: str
    stage_index: int              # how many MATCH stages fully satisfied
    stage_count: int              # events consumed toward the current stage
    start_ts: float
    last_ts: float
    supporting_event_ids: tuple   # the exact events, in order, that advanced it

    def to_dict(self):
        return {
            "match_id": self.match_id,
            "stage_index": self.stage_index,
            "stage_count": self.stage_count,
            "start_ts": self.start_ts,
            "last_ts": self.last_ts,
            "supporting_event_ids": list(self.supporting_event_ids),
        }


@dataclass(frozen=True)
class MatchResult:
    """A partial that ended -- completed, expired, or violated."""
    match_id: str
    pattern: str
    outcome: str
    start_ts: float
    end_ts: float
    supporting_event_ids: tuple

    def to_dict(self):
        return {
            "match_id": self.match_id,
            "pattern": self.pattern,
            "outcome": self.outcome,
            "start_ts": self.start_ts,
            "end_ts": self.end_ts,
            "supporting_event_ids": list(self.supporting_event_ids),
        }


class TemporalMatcher:
    """Event-at-a-time bounded sequence matcher for a single grouping key.

    Feed events in ascending timestamp order via `advance`; it returns the
    MatchResults that terminated on that event (completions and absence
    violations). Timed-out partials are swept lazily and reported through
    `sweep_expired`. `live_partials()` exposes durable state for persistence.
    """

    def __init__(self, pattern, id_seq=None):
        self.pattern = pattern
        self._stages = _stages(pattern)
        self._live = []            # list[PartialMatch]
        self._counter = 0
        self._id_seq = id_seq      # optional deterministic id generator
        self.dropped_over_capacity = 0

    def _new_id(self):
        if self._id_seq is not None:
            return self._id_seq(self._counter)
        return f"{self.pattern.name}:{self._counter}"

    def _expired(self, partial, now_ts):
        return (now_ts - partial.start_ts) > self.pattern.within_seconds

    def advance(self, event, ts, event_id):
        """Process one event; return MatchResults that terminated on it."""
        results = []
        survivors = []
        for p in self._live:
            if self._expired(p, ts):
                results.append(self._result(p, EXPIRED, p.last_ts))
                continue
            stage_step, guards = self._stages[p.stage_index]
            if any(g(event) for g in guards):
                results.append(self._result(p, VIOLATED, ts))
                continue
            if stage_step.predicate(event):
                advanced = self._consume(p, stage_step, ts, event_id)
                if advanced.stage_index >= len(self._stages):
                    results.append(self._result(advanced, COMPLETED, ts))
                    continue
                survivors.append(advanced)
            else:
                survivors.append(p)
        self._live = survivors
        results.extend(self._seed(event, ts, event_id))
        return results

    def _consume(self, partial, stage_step, ts, event_id):
        count = partial.stage_count + 1
        ids = partial.supporting_event_ids + (event_id,)
        if count >= stage_step.min_count:
            return replace(partial, stage_index=partial.stage_index + 1,
                           stage_count=0, last_ts=ts, supporting_event_ids=ids)
        return replace(partial, stage_count=count, last_ts=ts,
                       supporting_event_ids=ids)

    def _seed(self, event, ts, event_id):
        """Start a new partial if the event opens the pattern.

        Returns any MatchResult that completed immediately (a single-stage
        pattern completes on its opening event).
        """
        first_step, first_guards = self._stages[0]
        if any(g(event) for g in first_guards):
            return []
        if not first_step.predicate(event):
            return []
        if len(self._live) >= self.pattern.max_partial:
            self.dropped_over_capacity += 1
            return []
        seed = PartialMatch(
            match_id=self._new_id(), stage_index=0, stage_count=0,
            start_ts=ts, last_ts=ts, supporting_event_ids=(),
        )
        self._counter += 1
        advanced = self._consume(seed, first_step, ts, event_id)
        if advanced.stage_index >= len(self._stages):
            return [self._result(advanced, COMPLETED, ts)]
        self._live.append(advanced)
        return []

    def sweep_expired(self, now_ts):
        """Expire and return every live partial past its horizon at now_ts."""
        expired = [self._result(p, EXPIRED, p.last_ts)
                   for p in self._live if self._expired(p, now_ts)]
        self._live = [p for p in self._live if not self._expired(p, now_ts)]
        return expired

    def _result(self, partial, outcome, end_ts):
        return MatchResult(
            match_id=partial.match_id, pattern=self.pattern.name,
            outcome=outcome, start_ts=partial.start_ts, end_ts=end_ts,
            supporting_event_ids=partial.supporting_event_ids,
        )

    def live_partials(self):
        return list(self._live)
