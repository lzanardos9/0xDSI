"""
Offline contract check for the entry-only E2E suite.

A real end-to-end run needs a Databricks workspace (Kafka, landing Volumes,
streaming Delta), so it is recorded as `blocked` by the baseline until one is
available — exactly like the other workspace-dependent tests. What CAN be
enforced with plain `python3`, and is enforced here, is the suite's own
discipline: the ten required journeys exist, each writes only to an ingestion
surface, asserts only on a published output, isolates its rows with a unique
probe, and the live driver still refuses to cross those boundaries at runtime.

Run:  python3 databricks-native/tests/e2e/test_e2e_entry_only.py
"""

import os
import sys

sys.path.insert(0, os.path.dirname(__file__))

from scenarios import (  # noqa: E402
    ENTRY_SURFACES, OUTPUT_TABLES, SCENARIOS, validate_suite,
)
import harness as H  # noqa: E402


class _FakeSql:
    def __init__(self, n):
        self._n = n

    def first(self):
        return {"n": self._n}


class _FakeSpark:
    """Just enough of a spark session to prove the readers/writers guard their
    surfaces; it never actually touches a workspace."""

    def sql(self, _query):
        return _FakeSql(0)


class _FakeCfg:
    catalog = "soc_platform_dev"
    schema = "soc"

    def get_table_path(self, name):
        return f"`{self.catalog}`.`{self.schema}`.`{name}`"


def test_suite_passes_its_own_contract():
    problems = validate_suite(SCENARIOS)
    assert not problems, "suite contract violations:\n  - " + "\n  - ".join(problems)


def test_exactly_ten_named_scenarios():
    names = [s.name for s in SCENARIOS]
    assert len(names) == 10, f"expected 10 scenarios, got {len(names)}"
    assert len(set(names)) == 10, "scenario names must be unique"


def test_every_entry_is_an_ingestion_surface():
    for s in SCENARIOS:
        for e in s.entries:
            assert e.surface in ENTRY_SURFACES, (
                f"{s.name} writes to non-ingestion surface '{e.surface}'"
            )


def test_every_assertion_reads_a_published_output():
    for s in SCENARIOS:
        for x in s.expectations:
            assert x.table in OUTPUT_TABLES, (
                f"{s.name} asserts on non-output table '{x.table}'"
            )


def test_writer_refuses_a_non_ingestion_surface():
    writer = H.EntryWriter(_FakeSpark(), _FakeCfg())

    class _Rec:
        surface = "unified_evidence_objects"  # an OUTPUT table, never writable
        channel = "x"
        payload = {"probe": "p"}

    try:
        writer.write(_Rec())
    except H.EntrySurfaceError:
        return
    raise AssertionError("writer must refuse to write outside ingestion surfaces")


def test_reader_refuses_a_non_output_table():
    reader = H.OutputReader(_FakeSpark(), _FakeCfg())
    try:
        reader.count("bronze_raw_events", "1=1")  # an intermediate table
    except H.OutputSurfaceError:
        return
    raise AssertionError("reader must refuse to read non-published tables")


def test_run_suite_refuses_a_broken_contract():
    # Drop one required scenario; run_suite must refuse before touching Spark.
    broken = SCENARIOS[:-1]
    try:
        H.run_suite(_FakeSpark(), _FakeCfg(), scenarios=broken)
    except H.EntrySurfaceError:
        return
    raise AssertionError("run_suite must refuse a contract-violating suite")


def test_ioc_kinds_are_covered():
    covered = {k for s in SCENARIOS for k in s.ioc_kinds}
    for needed in ("ip", "domain", "hash"):
        assert needed in covered, f"no scenario covers a '{needed}' IOC"


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
    print("NOTE: the live end-to-end run is BLOCKED offline (needs a Databricks "
          "workspace: Kafka, landing Volumes, streaming Delta). Drive it with "
          "harness.run_suite(spark, cfg) from a workspace notebook.")
    raise SystemExit(1 if failed else 0)
