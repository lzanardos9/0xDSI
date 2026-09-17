"""
End-to-end revision threading: UEO -> FUSE -> Confluence verdict -> approval (B6 / REV2-20).

A finding's `revision` originates at the Unified Evidence Object (finding_id ==
ueo_id). An analyst approves a containment action against the evidence as it
stood at ONE revision; if the finding is later re-confirmed under a new revision
the approval is stale and must not authorize execution. For that guarantee to
hold, the revision has to survive every hop:

  UEO(revision) -> fuse_results(revision) -> confluence_verdicts(finding_id,revision)
                -> response_actions.finding_id -> approval binds approved_finding_revision

The thread used to be severed: fuse_results had no revision column and verdicts
kept only entity_id, so a verdict could not be traced back to the finding whose
revision the approval binds. This locks every hop:

  * source scan   -- each table/schema/builder carries the lineage columns;
  * behavioural   -- response_actions.py binds an approval to a revision and
                     refuses to execute once the finding moves on.

Pure stdlib + source scan (no Spark). Run:
  python3 databricks-native/tests/contract/test_revision_thread.py
"""

import os
import re
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SHARED = os.path.join(ROOT, "notebooks", "_shared")
sys.path.insert(0, SHARED)

import response_actions as RA  # noqa: E402

FUSE = os.path.join(ROOT, "notebooks", "correlation", "10_fuse_engine.py")
CONFLUENCE = os.path.join(ROOT, "notebooks", "correlation", "07_detection_confluence.py")
DDL = os.path.join(ROOT, "notebooks", "setup", "01_create_catalog_schema.py")
UEO = os.path.join(ROOT, "notebooks", "correlation", "09_unified_evidence_object.py")


def _read(path):
    with open(path, encoding="utf-8") as fh:
        return fh.read()


def _ddl_block(src, table):
    m = re.search(rf"CREATE TABLE IF NOT EXISTS (?:\{{[^}}]*\}}|{table}) \((.*?)\)\s*USING DELTA",
                  src, re.DOTALL)
    assert m, f"could not find DDL for {table}"
    return m.group(1)


# --- Source: the revision thread is continuous across every hop ---

def test_ueo_is_the_revision_origin():
    src = _read(UEO)
    assert "revision INT" in src, "UEO must define the revision column (thread origin)"
    assert "finding_id == ueo_id" in src, "finding_id must equal ueo_id"


def test_fuse_carries_revision():
    src = _read(FUSE)
    block = _ddl_block(src, "fuse_results")
    assert re.search(r"\brevision\b", block), "fuse_results DDL missing revision"
    assert re.search(r"\bfinding_id\b", block), "fuse_results DDL missing finding_id"
    assert 'StructField("revision"' in src, "FUSE_SCHEMA missing revision"
    assert 'StructField("finding_id"' in src, "FUSE_SCHEMA missing finding_id"
    # fuse_id must be revision-scoped so re-fusion at a new revision is distinct.
    assert 'f"fuse::{ueo_id}::r{revision}"' in src, "fuse_id must be revision-scoped"
    assert 'make_fuse_id(ueo_id, revision)' in src, "producer must pass revision into fuse_id"
    assert '"revision": revision' in src, "fuse row must carry revision"


def test_confluence_verdict_carries_finding_lineage():
    src = _read(CONFLUENCE)
    for f in ('StructField("ueo_id"', 'StructField("finding_id"', 'StructField("revision"'):
        assert f in src, f"verdict schema missing {f}"
    # The fuse-aware builder must populate finding_id from the fuse row / ueo_id.
    assert 'row.finding_id if row.finding_id is not None else row.ueo_id' in src, \
        "fuse-aware verdict must set finding_id from the fuse lineage"


def test_confluence_verdicts_ddl_has_lineage_columns():
    block = _ddl_block(_read(DDL), "confluence_verdicts")
    for c in ("ueo_id", "finding_id", "revision"):
        assert re.search(rf"\b{c}\b", block), f"confluence_verdicts DDL missing '{c}'"


# --- Behaviour: the binding actually protects execution ---

def _confirmed(finding_id, revision):
    return {"finding_id": finding_id, "state": RA.FINDING_CONFIRMED, "revision": revision}


def test_approval_binds_revision_and_refuses_when_finding_moves_on():
    action = {"state": RA.PROPOSED, "finding_id": "ueo-42", "proposed_by": "analyst_a"}

    # Approve against revision 3 (a different analyst -- separation of duties).
    approved = RA.bind_approval(action, _confirmed("ueo-42", 3), "analyst_b")
    assert approved["approved_finding_revision"] == 3

    # Same revision -> executable.
    ok, _ = RA.can_execute(approved, _confirmed("ueo-42", 3))
    assert ok, "approval bound to the live revision must be executable"

    # Finding re-confirmed at revision 4 -> the earlier approval is stale.
    ok, reason = RA.can_execute(approved, _confirmed("ueo-42", 4))
    assert not ok and "stale" in reason.lower(), \
        "a superseded finding must invalidate the earlier approval"


def test_approval_rejects_action_bound_to_a_different_finding():
    action = {"state": RA.PROPOSED, "finding_id": "ueo-1", "proposed_by": "a"}
    ok, reason = RA.can_approve(action, _confirmed("ueo-2", 1), "b")
    assert not ok and "not bound" in reason.lower()


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
