"""Phase 0 contract tests: keep the engineering inventory honest.

Pure Python, no pytest required (mirrors tests/test_fuse_math.py). Run:

    python3 databricks-native/tests/contract/test_phase0_inventory.py

These fail loudly if:
* the committed artifact-manifest.json has drifted from the actual tree,
* the capability registry is malformed or points at files that do not exist,
* the baseline results file is missing or has an unknown status,
* the audit remediation doc does not cover every REV2 finding.
"""

import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))  # databricks-native/
DOCS = os.path.join(ROOT, "docs", "engineering")
sys.path.insert(0, os.path.join(ROOT, "tools", "inventory"))

import generate_manifest  # noqa: E402

VALID_CAP_STATES = {
    "implemented", "integrated", "validated",
    "experimental", "simulated", "unavailable",
}
VALID_BASELINE_STATUS = {"passed", "failed", "blocked"}


def test_manifest_not_stale():
    rendered = generate_manifest._serialize(generate_manifest.build_manifest())
    committed_path = os.path.join(DOCS, "artifact-manifest.json")
    assert os.path.exists(committed_path), "artifact-manifest.json missing"
    with open(committed_path, encoding="utf-8") as f:
        committed = f.read()
    assert committed == rendered, (
        "artifact-manifest.json is STALE. Run "
        "tools/inventory/generate_manifest.py to regenerate."
    )


def test_manifest_hashes_are_real():
    manifest = generate_manifest.build_manifest()
    assert manifest["total_files"] > 100, manifest["total_files"]
    for rec in manifest["artifacts"][:5]:
        assert len(rec["sha256"]) == 64
        assert rec["bytes"] >= 0


def test_capability_registry_valid():
    with open(os.path.join(DOCS, "capability-registry.json"), encoding="utf-8") as f:
        reg = json.load(f)
    assert reg["registry_schema_version"]
    caps = reg["capabilities"]
    assert len(caps) >= 8, "expected the core capability set"
    ids = set()
    required = {"id", "title", "claim", "state", "evidence", "tests", "blockers", "notes"}
    for cap in caps:
        missing = required - set(cap)
        assert not missing, f"{cap.get('id')} missing keys {missing}"
        assert cap["id"] not in ids, f"duplicate capability id {cap['id']}"
        ids.add(cap["id"])
        assert cap["state"] in VALID_CAP_STATES, f"{cap['id']}: bad state {cap['state']}"
        for ev in cap["evidence"]:
            path = os.path.join(ROOT, ev.rstrip("/"))
            assert os.path.exists(path), f"{cap['id']}: evidence missing {ev}"
        for t in cap["tests"]:
            assert os.path.exists(os.path.join(ROOT, t)), f"{cap['id']}: test missing {t}"


def test_baseline_results_present_and_valid():
    path = os.path.join(DOCS, "baseline-results.json")
    assert os.path.exists(path), "run tools/inventory/run_baseline.py first"
    with open(path, encoding="utf-8") as f:
        res = json.load(f)
    assert res["checks"], "baseline has no checks"
    for c in res["checks"]:
        assert c["status"] in VALID_BASELINE_STATUS, f"{c['id']}: bad status {c['status']}"
    # blocked must carry a reason; never a silent pass
    for c in res["checks"]:
        if c["status"] == "blocked":
            assert c.get("reason"), f"{c['id']}: blocked without a reason"


def test_audit_status_covers_all_findings():
    with open(os.path.join(DOCS, "audit-remediation-status.md"), encoding="utf-8") as f:
        text = f.read()
    for n in range(1, 30):
        fid = f"REV2-{n:02d}"
        assert fid in text, f"audit-remediation-status.md is missing {fid}"


if __name__ == "__main__":
    passed = failed = 0
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
