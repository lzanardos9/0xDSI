"""
Contract regression: the deployed detection path must persist idempotently.

Two Phase-1/Phase-4 findings converge here:

  * Bronze ingestion once wrote events with `.write.mode("append")` and a random
    `uuid()` id, so a replay of a source record produced a NEW row -- a duplicate
    observation. It must instead derive a stable id (`derive_event_id`) and MERGE.
  * Threat-intel matching once appended matches and alerts separately, so a crash
    between the two writes left a match with no alert (H-030). It must MERGE both
    on deterministic ids so any retry converges to exactly one alert per finding.

This test scans the real notebooks (not copies) and fails if either regresses to
the append/uuid pattern for these tables. It is a source contract, complementing
the runtime fault-injection test in tests/property/test_ti_recovery.py.

Run:  python3 databricks-native/tests/contract/test_idempotent_persistence.py
"""

import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
INGEST = os.path.join(ROOT, "notebooks", "ingestion", "01_raw_event_ingestion.py")
TI = os.path.join(ROOT, "notebooks", "detection", "02_threat_intel_matching.py")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def test_ingestion_derives_stable_event_id_and_merges():
    src = _read(INGEST)
    assert "from event_identity import derive_event_id" in src, \
        "ingestion must use the shared event identity helper"
    assert "derive_event_id(" in src, "events must get a stable derived id"
    assert re.search(r"MERGE INTO\s+\{events_table\}", src), \
        "events must be persisted with an idempotent MERGE"


def test_ingestion_does_not_append_events_with_random_ids():
    src = _read(INGEST)
    # The event write must not append; entity-spine and dead-letter quarantine
    # writes legitimately still append, so we assert specifically on the events
    # persistence helper.
    assert "valid_events.write.mode(\"append\")" not in src, \
        "events must not be appended (would duplicate on replay)"


def test_threat_intel_merges_matches_and_alerts():
    src = _read(TI)
    merge_targets = re.findall(r"MERGE INTO\s+\{(\w+)\}", src)
    assert "ti_matches_table" in merge_targets, "matches must be MERGEd, not appended"
    assert "alerts_table" in merge_targets, "alerts must be MERGEd, not appended"
    assert ".write.mode(\"append\").saveAsTable(ti_matches_table)" not in src
    assert ".write.mode(\"append\").saveAsTable(alerts_table)" not in src


def test_threat_intel_tracks_the_alert_obligation():
    src = _read(TI)
    assert "alert_emitted" in src, \
        "matches must carry a durable alert-emitted flag for crash recovery"


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
