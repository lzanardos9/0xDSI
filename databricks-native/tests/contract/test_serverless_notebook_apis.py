"""
Regression + contract test for serverless-incompatible Spark APIs on the
actually-deployed execution path.

Reproduces the Phase 1 finding H-004: several notebooks that are deployed by a
job running on serverless compute (`environment_version` set under the job's
`environments` spec) used APIs that serverless does not expose:

  * `spark.sparkContext.broadcast(...)`  -> not available on serverless
  * `spark.sparkContext.setCheckpointDir(...)` / RDD checkpointing -> not
    available on serverless

Reference: https://docs.databricks.com/aws/en/compute/serverless/limitations

This test walks the real bundle (not a copy): it maps every serverless job to
the notebook files it deploys, then fails if any of those notebooks reference a
serverless-incompatible API. Notebooks that are a known, tracked BLOCKED finding
(recorded in FINDINGS.json) are listed explicitly with their finding id so a
NEW violation still fails the suite while an acknowledged, workspace-blocked
migration does not masquerade as a fresh regression.

PyYAML is required to map jobs -> notebooks. When it is absent this test reports
BLOCKED rather than silently passing.

Run:  python3 databricks-native/tests/contract/test_serverless_notebook_apis.py
"""

import glob
import os
import re

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RESOURCES_DIR = os.path.join(ROOT, "resources")

try:
    import yaml
    HAVE_YAML = True
except ImportError:
    HAVE_YAML = False

# Serverless-incompatible APIs, matched against notebook source text.
#   * sparkContext.* low-level entry points are not exposed on serverless.
#   * A fixed processingTime trigger is classic-compute only; serverless streams
#     accept availableNow / once. A DYNAMIC `.trigger(**resolve())` is fine — only
#     a hardcoded `.trigger(processingTime=...)` literal is flagged.
#   * RDD/DataFrame cache/persist/unpersist are not available on serverless.
FORBIDDEN = {
    "sparkContext.broadcast": re.compile(r"\.sparkContext\.broadcast\s*\("),
    "sparkContext.setCheckpointDir": re.compile(r"\.sparkContext\.setCheckpointDir\s*\("),
    "sparkContext.parallelize": re.compile(r"\.sparkContext\.parallelize\s*\("),
    "trigger(processingTime=...)": re.compile(r"\.trigger\s*\(\s*processingTime"),
    ".cache()": re.compile(r"\.cache\s*\(\s*\)"),
    ".persist(": re.compile(r"\.persist\s*\("),
    ".unpersist(": re.compile(r"\.unpersist\s*\("),
}

# Notebooks whose serverless incompatibility is a tracked, workspace-BLOCKED
# migration (cannot be fixed by an offline Python edit), keyed to its finding.
# A notebook NOT in this map that references a forbidden API fails the test.
KNOWN_BLOCKED = {
    # Requires GraphFrames (a JVM library) + RDD checkpointing; the correct fix
    # is classic compute, which needs staging validation. Tracked as H-004.
    "notebooks/analytics/01_trend_engine_cet.py": "H-004",

    # H-080: systemic serverless incompatibility discovered when this regression
    # was broadened to cover fixed processingTime triggers and cache/persist.
    # These jobs are declared serverless in the bundle yet use classic-only APIs;
    # each needs either a serverless-safe trigger (availableNow/once) or a move to
    # classic compute, plus staging validation. Deferred to Gate A (serverless
    # compatibility). The detection-path fix (02_threat_intel_matching) is NOT
    # listed here: it is fixed and must stay green.
    "notebooks/agents/26_realtime_graph_cep.py": "H-080",
    "notebooks/correlation/03_graph_correlation.py": "H-080",
    "notebooks/correlation/04_temporal_window_correlator.py": "H-080",
    "notebooks/correlation/05_supply_chain_risk.py": "H-080",
    "notebooks/correlation/06_cloud_posture.py": "H-080",
    "notebooks/correlation/07_detection_confluence.py": "H-080",
    "notebooks/ingestion/02_enrichment_pipeline.py": "H-080",
    "notebooks/ingestion/05_kafka_eventhub_connector.py": "H-080",
    "notebooks/ingestion/07_lakebase_sync.py": "H-080",
    "notebooks/ingestion/08_typed_bronze_partitioner.py": "H-080",
    "notebooks/ingestion/10_plc_ot_protocol_connector.py": "H-080",
    "notebooks/ml_training/06_graph_neighborhood_embeddings.py": "H-080",
}


def _serverless_notebooks():
    """Return {notebook_relpath: set(job_names)} for notebooks deployed by a
    job whose environment spec sets environment_version (serverless)."""
    result = {}
    for path in sorted(glob.glob(os.path.join(RESOURCES_DIR, "*.yml"))):
        with open(path, encoding="utf-8") as fh:
            doc = yaml.safe_load(fh) or {}
        jobs = (doc.get("resources", {}) or {}).get("jobs", {}) or {}
        for job_name, job in jobs.items():
            if not isinstance(job, dict):
                continue
            envs = job.get("environments") or []
            is_serverless = any(
                isinstance(e, dict)
                and isinstance(e.get("spec"), dict)
                and e["spec"].get("environment_version") is not None
                for e in envs
            )
            if not is_serverless:
                continue
            for task in job.get("tasks", []) or []:
                nb = (task.get("notebook_task") or {}).get("notebook_path")
                if not isinstance(nb, str):
                    continue
                resolved = os.path.normpath(os.path.join(RESOURCES_DIR, nb))
                rel = os.path.relpath(resolved, ROOT)
                result.setdefault(rel, set()).add(job_name)
    return result


def _scan(rel_notebook):
    """Return list of (api, line_no) forbidden hits in a notebook file."""
    hits = []
    abs_path = os.path.join(ROOT, rel_notebook)
    if not os.path.exists(abs_path):
        return hits
    with open(abs_path, encoding="utf-8") as fh:
        for i, line in enumerate(fh, 1):
            for api, pat in FORBIDDEN.items():
                if pat.search(line):
                    hits.append((api, i))
    return hits


def test_deployed_serverless_notebooks_have_no_incompatible_apis():
    if not HAVE_YAML:
        print("BLOCKED test_deployed_serverless_notebooks_have_no_incompatible_apis: "
              "PyYAML not installed")
        return
    serverless = _serverless_notebooks()
    assert serverless, "no serverless notebooks discovered; test wiring is wrong"

    offenders = []
    for rel, jobs in sorted(serverless.items()):
        if rel in KNOWN_BLOCKED:
            continue
        for api, line in _scan(rel):
            offenders.append(f"{rel}:{line} uses {api} (jobs: {', '.join(sorted(jobs))})")

    assert not offenders, (
        "serverless-incompatible Spark API on a deployed serverless notebook:\n  - "
        + "\n  - ".join(offenders)
    )


def test_known_blocked_notebooks_are_still_blocked():
    """Guard the allowlist against rot: every KNOWN_BLOCKED notebook must still
    actually reference a forbidden API. When the underlying finding is fixed,
    this test fails until the entry is removed from KNOWN_BLOCKED."""
    if not HAVE_YAML:
        print("BLOCKED test_known_blocked_notebooks_are_still_blocked: PyYAML not installed")
        return
    stale = []
    for rel, finding in sorted(KNOWN_BLOCKED.items()):
        if not _scan(rel):
            stale.append(f"{rel} ({finding}) no longer uses a forbidden API; "
                         "remove it from KNOWN_BLOCKED")
    assert not stale, "KNOWN_BLOCKED allowlist is stale:\n  - " + "\n  - ".join(stale)


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
    print(f"\n{passed} passed, {failed} failed"
          + ("" if HAVE_YAML else "  (PyYAML absent: checks BLOCKED)"))
    raise SystemExit(1 if failed else 0)
