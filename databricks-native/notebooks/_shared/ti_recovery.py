"""
Recoverable threat-intel match -> alert reconciliation (H-030).

The original flow persisted a match, then persisted its alert, and used the
presence of the match to suppress duplicates. A crash *between* those two writes
left the match stored but its alert missing, and on retry the stored match
suppressed the item, so the alert was never created — a match with no alert.

This module owns the ordering as a durable *obligation* instead:

  1. upsert matches (idempotent, keyed on a deterministic match id);
  2. read the matches that still owe an alert (the durable obligation — a query,
     not an in-memory flag, so it survives a restart);
  3. upsert their alerts (idempotent, keyed on a deterministic alert id);
  4. mark those matches alert-emitted (last).

A fault after any step is safe: matches persisted but unmarked are rediscovered
in step 2 on the next run; a re-emitted alert collapses onto its deterministic id
in step 3; marking is last so it can never race ahead of the alert write. The net
guarantee is *exactly one* logical alert per match while every affected entity is
retained.

It is pure Python over an injected ``store`` so it runs — and is fault-injected —
with no Spark session. The notebook supplies a Spark-backed store; tests supply an
in-memory one.

Run tests:  python3 databricks-native/tests/property/test_ti_recovery.py
"""

import hashlib
from typing import Protocol

IDENTITY_SEPARATOR = "||"


def match_identity(matched_indicator, match_type, entity_key, window_bucket=None) -> str:
    """Deterministic id for a threat-intel *finding*, so a replay maps to the
    SAME row rather than a fresh uuid.

    Keyed on the affected entity as well as the indicator so two different hosts
    hitting the same IOC remain two distinct findings (and two alerts). The
    triggering ``event_id`` is deliberately NOT part of the identity: the finding
    is "this entity touched this IOC", not "this one packet". An optional
    ``window_bucket`` lets the caller re-open a finding in a later dedup window
    (fixed-window re-alerting) while staying idempotent within a window."""
    parts = [matched_indicator, match_type, entity_key]
    if window_bucket is not None:
        parts.append(window_bucket)
    basis = IDENTITY_SEPARATOR.join(str(p) for p in parts)
    return hashlib.sha256(basis.encode("utf-8")).hexdigest()


def alert_identity(match_id: str) -> str:
    """Deterministic alert id derived from the match id (one alert per match)."""
    return hashlib.sha256(("alert" + IDENTITY_SEPARATOR + match_id).encode("utf-8")).hexdigest()


def _severity(confidence) -> str:
    c = confidence if confidence is not None else 0.0
    if c >= 0.9:
        return "critical"
    if c >= 0.7:
        return "high"
    return "medium"


def build_alert(match: dict) -> dict:
    """Build the alert record for a match. Deterministic given the match."""
    indicator = match.get("matched_indicator")
    threat = match.get("threat_type")
    return {
        "id": alert_identity(match["match_id"]),
        "match_id": match["match_id"],
        "title": f"Threat Intel: {threat} ({indicator})",
        "description": (
            f"IOC matched on {match.get('match_type')} for entity "
            f"{match.get('entity_key')}. Event: {match.get('event_type')}. "
            f"Source: {match.get('ioc_source') or 'unknown'}. "
            f"Confidence: {match.get('confidence')}"
        ),
        "severity": _severity(match.get("confidence")),
        "status": "new",
        "source": "threat_intel_matching",
        "confidence_score": match.get("confidence"),
    }


class MatchAlertStore(Protocol):
    """Persistence boundary the reconciler drives. Every method must be safe to
    call again after a partial failure (idempotent upserts, a query for the
    obligation, and a set-based mark)."""

    def upsert_matches(self, matches: list[dict]) -> None: ...
    def pending_alert_matches(self) -> list[dict]: ...
    def upsert_alerts(self, alerts: list[dict]) -> None: ...
    def mark_alerts_emitted(self, match_ids: list[str]) -> None: ...


class MatchAlertReconciler:
    """Drives the four-step durable obligation. See module docstring."""

    def __init__(self, store: MatchAlertStore):
        self.store = store

    def process_batch(self, matches: list[dict]) -> dict:
        """Persist matches and settle every outstanding alert obligation.

        Returns a small summary. Raises whatever the store raises (the caller /
        stream must fail the batch so it retries) — but because each step is
        idempotent and the obligation is a query, the retry converges to exactly
        one alert per match.
        """
        prepared = [self._with_identity(m) for m in matches]

        # Step 1 — matches first, idempotent on match_id.
        self.store.upsert_matches(prepared)

        # Step 2 — the durable obligation: matches that still owe an alert. This
        # deliberately re-reads from the store (not `prepared`) so a match left
        # unmarked by an earlier crashed run is picked up now.
        pending = self.store.pending_alert_matches()

        # Step 3 — alerts, idempotent on the deterministic alert id.
        alerts = [build_alert(m) for m in pending]
        self.store.upsert_alerts(alerts)

        # Step 4 — mark last, so it can never run ahead of the alert write.
        self.store.mark_alerts_emitted([m["match_id"] for m in pending])

        return {"matches": len(prepared), "alerts_emitted": len(alerts)}

    @staticmethod
    def _with_identity(match: dict) -> dict:
        out = dict(match)
        out.setdefault(
            "match_id",
            match_identity(
                match.get("matched_indicator"),
                match.get("match_type"),
                match.get("entity_key"),
                match.get("window_bucket"),
            ),
        )
        out.setdefault("alert_emitted", False)
        return out
