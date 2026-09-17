"""
Producer <-> consumer contract for the CEP signal boundary (B4 / H-020 family).

The cep_pattern_matches table is written by a CEP producer
(notebooks/correlation/01_streaming_correlation_engine.py) and read by the
Unified Evidence Object builder (notebooks/correlation/09). It had three
disagreeing shapes, and the producer explicitly dropped event_ids + MITRE, so
event lineage and technique attribution were destroyed before the UEO could read
them. This binds all three to contracts.CEP_PATTERN_MATCH_COLUMNS:

  * the producer must EMIT the columns the UEO lens reads, and must NOT strip the
    lineage/MITRE fields;
  * the UEO CEP lens must READ the event lineage (event_ids) and carry MITRE into
    its explanation;
  * the authoritative DDL must DEFINE the canonical columns.

Pure source/contract scan (no Spark). Run:
  python3 databricks-native/tests/contract/test_cep_signal_contract.py
"""

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHARED = os.path.join(ROOT, "notebooks", "_shared")
sys.path.insert(0, SHARED)

import contracts as C  # noqa: E402

PRODUCER = os.path.join(ROOT, "notebooks", "correlation", "01_streaming_correlation_engine.py")
UEO = os.path.join(ROOT, "notebooks", "correlation", "09_unified_evidence_object.py")
DDL = os.path.join(ROOT, "notebooks", "setup", "01_create_catalog_schema.py")

# Columns the UEO CEP lens actually reads from cep_pattern_matches.
UEO_READS = ("id", "entity_id", "pattern_name", "confidence", "severity",
             "matched_at", "event_ids")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _ddl_block(src, table):
    m = re.search(rf"CREATE TABLE IF NOT EXISTS {table} \((.*?)\)\s*USING DELTA",
                  src, re.DOTALL)
    assert m, f"could not find DDL for {table}"
    return m.group(1)


def test_contract_covers_every_column_the_ueo_reads():
    for c in UEO_READS:
        assert c in C.CEP_PATTERN_MATCH_COLUMNS, \
            f"UEO reads '{c}' but it is not in CEP_PATTERN_MATCH_COLUMNS"
    for c in C.CEP_LINEAGE_FIELDS:
        assert c in C.CEP_PATTERN_MATCH_COLUMNS


def test_producer_emits_canonical_columns():
    src = _read(PRODUCER)
    # The match_schema for the cep_pattern_matches write must declare each column.
    for c in ("entity_id", "pattern_name", "confidence", "severity", "rule_id",
              "mitre_tactic", "mitre_technique", "event_ids"):
        assert f'StructField("{c}"' in src, f"producer does not emit '{c}'"


def test_producer_does_not_strip_lineage_or_mitre():
    src = _read(PRODUCER)
    # The exact bug: a comprehension that filtered out event_ids + MITRE before
    # writing. It must not reappear.
    assert 'if k not in ("event_ids"' not in src, \
        "producer must not strip event_ids / MITRE before writing cep_pattern_matches"
    assert '"event_ids": list(' in src, "producer must carry event_ids through"


def test_ueo_lens_reads_event_lineage_and_carries_mitre():
    src = _read(UEO)
    m = re.search(r'\("cep_pattern_matches",\s*"""(.*?)"""\)', src, re.DOTALL)
    assert m, "could not find the cep_pattern_matches lens spec"
    lens = m.group(1)
    assert "event_ids AS source_event_ids" in lens, \
        "UEO CEP lens must project event_ids as the event lineage (was 'matched_events')"
    assert "mitre_technique" in lens, "UEO CEP lens must carry MITRE into the explanation"


def test_ddl_defines_canonical_columns():
    block = _ddl_block(_read(DDL), "cep_pattern_matches")
    for c in ("entity_id", "pattern_name", "confidence", "severity",
              "event_ids", "mitre_tactic", "mitre_technique"):
        assert re.search(rf"\b{c}\b", block), f"DDL missing canonical column '{c}'"


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
