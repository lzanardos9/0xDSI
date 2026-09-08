#!/usr/bin/env python3
"""Record a reproducible baseline of what actually builds, compiles and passes.

Writes ``docs/engineering/baseline-results.json``. Every check reports one of:

* ``passed``   — ran and succeeded
* ``failed``   — ran and failed (exit code / assertion)
* ``blocked``  — cannot run here (needs Spark/Databricks/credentials/hardware)

``blocked`` is a first-class outcome, never silently turned into ``passed`` — this
is the "no fictional success" rule. Checks that require a live workspace are
declared blocked up front with a reason rather than executed and swallowed.

Usage:
    python tools/inventory/run_baseline.py            # run + write results
    python tools/inventory/run_baseline.py --check    # fail if any check FAILED
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # databricks-native/
RESULTS_PATH = ROOT / "docs" / "engineering" / "baseline-results.json"

# Checks that need a live Databricks/Spark workspace or external credentials.
# They are recorded as blocked with a reason; they are NOT executed.
# `critical` marks a gate that proves the real source-to-finding path actually
# runs. A blocked critical gate can never count toward a release: the release
# verdict stays NOT_READY until it is validated in a live workspace. A developer
# baseline may still report partial progress with these blocked.
BLOCKED = [
    {
        "id": "spark_e2e_smoke",
        "category": "integration",
        "target": "tests/smoke_test_e2e_pipeline.py",
        "reason": "Requires a live Spark session + seeded Delta tables (no workspace here).",
        "critical": True,
    },
    {
        "id": "schema_validate_smoke",
        "category": "schema",
        "target": "tests/smoke_validate_schema.py",
        "reason": "Requires Unity Catalog tables to introspect (no workspace here).",
        "critical": True,
    },
    {
        "id": "app_smoke",
        "category": "integration",
        "target": "tests/smoke_test_app.sh",
        "reason": "Requires the deployed Databricks App URL + auth (no deployment here).",
        "critical": True,
    },
    {
        "id": "bundle_validate",
        "category": "deployment",
        "target": "databricks.yml",
        "reason": "Requires the Databricks CLI + workspace auth (unsupported in this environment).",
        "critical": True,
    },
]


def release_verdict(all_checks: list[dict]) -> dict:
    """Decide release readiness honestly (third-review Phase 0).

    A release is READY only when nothing failed and every *critical* gate was
    actually validated (status ``passed``). A critical gate that is blocked,
    skipped or failed keeps the verdict NOT_READY -- an unavailable workspace
    does not get to be a silent green. Non-critical blocked checks (helpers that
    cannot run here) do not by themselves sink a release, but they are reported.
    This is deliberately separate from the developer baseline, which may show
    partial progress without claiming a release passed.
    """
    blocking = []
    for c in all_checks:
        status = c.get("status")
        critical = c.get("critical", False)
        if status == "failed":
            blocking.append({"id": c["id"], "status": status, "critical": critical,
                             "reason": "check failed"})
        elif critical and status != "passed":
            blocking.append({"id": c["id"], "status": status, "critical": True,
                             "reason": c.get("reason", f"critical gate not validated ({status})")})
    ready = not blocking
    return {
        "release_ready": ready,
        "verdict": "READY" if ready else "NOT_READY",
        "blocking": blocking,
    }


def _run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    try:
        proc = subprocess.run(
            cmd, cwd=cwd, capture_output=True, text=True, timeout=1200
        )
    except FileNotFoundError as exc:
        return 127, f"command not found: {exc}"
    except subprocess.TimeoutExpired:
        return 124, "timed out"
    tail = (proc.stdout + proc.stderr).strip().splitlines()
    return proc.returncode, "\n".join(tail[-15:])


def check_py_compile() -> dict:
    """Syntax-compile every Python file (notebooks included). Syntax only:
    py_compile does not resolve spark/dbutils names, so it is safe offline."""
    py_files = [
        p for p in ROOT.rglob("*.py")
        if "__pycache__" not in p.parts and "node_modules" not in p.parts
    ]
    rel = [str(p.relative_to(ROOT)) for p in sorted(py_files)]
    code, tail = _run([sys.executable, "-m", "py_compile", *rel], ROOT)
    return {
        "id": "py_compile_all",
        "category": "syntax",
        "command": f"python -m py_compile <{len(rel)} files>",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail if code else f"compiled {len(rel)} python files",
    }


def check_fuse_math() -> dict:
    code, tail = _run(
        [sys.executable, "tests/test_fuse_math.py"], ROOT
    )
    return {
        "id": "unit_fuse_math",
        "category": "unit",
        "command": "python tests/test_fuse_math.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_security() -> dict:
    code, tail = _run(
        [sys.executable, "tests/security/test_phase1_authz.py"], ROOT
    )
    return {
        "id": "security_phase1_authz",
        "category": "security",
        "command": "python tests/security/test_phase1_authz.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_contracts() -> dict:
    code, tail = _run(
        [sys.executable, "tests/contract/test_phase2_contracts.py"], ROOT
    )
    return {
        "id": "contracts_phase2",
        "category": "contract",
        "command": "python tests/contract/test_phase2_contracts.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_calibration() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_calibration.py"], ROOT
    )
    return {
        "id": "calibration_phase3",
        "category": "property",
        "command": "python tests/property/test_calibration.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_ingest_accounting() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_ingest_accounting.py"], ROOT
    )
    return {
        "id": "ingest_accounting_phase4",
        "category": "property",
        "command": "python tests/property/test_ingest_accounting.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_finding_revision() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_finding_revision.py"], ROOT
    )
    return {
        "id": "finding_revision_phase5",
        "category": "property",
        "command": "python tests/property/test_finding_revision.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_idempotency() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_idempotency.py"], ROOT
    )
    return {
        "id": "idempotency_phase6",
        "category": "property",
        "command": "python tests/property/test_idempotency.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_model_eval() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_model_eval.py"], ROOT
    )
    return {
        "id": "model_eval_phase7",
        "category": "property",
        "command": "python tests/property/test_model_eval.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_response_actions() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_response_actions.py"], ROOT
    )
    return {
        "id": "response_actions_phase8",
        "category": "property",
        "command": "python tests/property/test_response_actions.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_release_readiness() -> dict:
    code, tail = _run(
        [sys.executable, "tests/contract/test_release_readiness.py"], ROOT
    )
    return {
        "id": "release_readiness",
        "category": "contract",
        "command": "python tests/contract/test_release_readiness.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_backend_imports() -> dict:
    code, tail = _run(
        [sys.executable, "tests/contract/test_backend_imports.py"], ROOT
    )
    return {
        "id": "backend_imports",
        "category": "contract",
        "command": "python tests/contract/test_backend_imports.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_audit_persistence() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_audit_persistence.py"], ROOT
    )
    return {
        "id": "audit_persistence_phase9",
        "category": "property",
        "command": "python tests/property/test_audit_persistence.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_readiness() -> dict:
    code, tail = _run(
        [sys.executable, "tests/property/test_readiness.py"], ROOT
    )
    return {
        "id": "readiness_phase10",
        "category": "property",
        "command": "python tests/property/test_readiness.py",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_frontend_build() -> dict:
    code, tail = _run(["npm", "run", "build"], ROOT / "app")
    return {
        "id": "frontend_build",
        "category": "build",
        "command": "npm run build (app/)",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def check_manifest_fresh() -> dict:
    code, tail = _run(
        [sys.executable, "tools/inventory/generate_manifest.py", "--check"], ROOT
    )
    return {
        "id": "manifest_fresh",
        "category": "inventory",
        "command": "generate_manifest.py --check",
        "status": "passed" if code == 0 else "failed",
        "exit_code": code,
        "detail": tail,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="developer baseline: exit 1 only if a runnable check FAILED")
    parser.add_argument("--release", action="store_true",
                        help="release gate: exit 1 unless every critical gate is validated (NOT_READY otherwise)")
    args = parser.parse_args()

    checks = [
        check_py_compile(),
        check_fuse_math(),
        check_security(),
        check_contracts(),
        check_calibration(),
        check_ingest_accounting(),
        check_finding_revision(),
        check_idempotency(),
        check_model_eval(),
        check_response_actions(),
        check_audit_persistence(),
        check_readiness(),
        check_backend_imports(),
        check_release_readiness(),
        check_manifest_fresh(),
        check_frontend_build(),
    ]
    blocked = [
        {**b, "status": "blocked", "command": None, "exit_code": None}
        for b in BLOCKED
    ]
    all_checks = checks + blocked

    counts: dict[str, int] = {}
    for c in all_checks:
        counts[c["status"]] = counts.get(c["status"], 0) + 1

    release = release_verdict(all_checks)
    results = {
        "baseline_schema_version": "1.1.0",
        "environment": {
            "python": sys.version.split()[0],
            "note": "No Databricks/Spark/GPU available; workspace-dependent checks are blocked.",
        },
        "summary": dict(sorted(counts.items())),
        "release": release,
        "checks": all_checks,
    }
    RESULTS_PATH.parent.mkdir(parents=True, exist_ok=True)
    RESULTS_PATH.write_text(
        json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )

    line = ", ".join(f"{k}={v}" for k, v in results["summary"].items())
    print(f"baseline: {line}")
    for c in all_checks:
        print(f"  [{c['status'].upper():7}] {c['id']}")

    print(f"release: {release['verdict']}")
    for b in release["blocking"]:
        print(f"  [BLOCKING] {b['id']} ({b['status']}): {b['reason']}")

    # Release gate: a blocked/failed critical gate means the release is NOT_READY.
    if args.release and not release["release_ready"]:
        print("RELEASE NOT_READY: critical gates were not validated", file=sys.stderr)
        return 1
    # Developer baseline: partial progress is allowed; only a real failure fails it.
    if args.check and counts.get("failed"):
        print("baseline has FAILED checks", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
