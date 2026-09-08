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
BLOCKED = [
    {
        "id": "spark_e2e_smoke",
        "category": "integration",
        "target": "tests/smoke_test_e2e_pipeline.py",
        "reason": "Requires a live Spark session + seeded Delta tables (no workspace here).",
    },
    {
        "id": "schema_validate_smoke",
        "category": "schema",
        "target": "tests/smoke_validate_schema.py",
        "reason": "Requires Unity Catalog tables to introspect (no workspace here).",
    },
    {
        "id": "app_smoke",
        "category": "integration",
        "target": "tests/smoke_test_app.sh",
        "reason": "Requires the deployed Databricks App URL + auth (no deployment here).",
    },
    {
        "id": "bundle_validate",
        "category": "deployment",
        "target": "databricks.yml",
        "reason": "Requires the Databricks CLI + workspace auth (unsupported in this environment).",
    },
]


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
    parser.add_argument("--check", action="store_true", help="exit 1 if any check FAILED")
    args = parser.parse_args()

    checks = [
        check_py_compile(),
        check_fuse_math(),
        check_security(),
        check_contracts(),
        check_calibration(),
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

    results = {
        "baseline_schema_version": "1.0.0",
        "environment": {
            "python": sys.version.split()[0],
            "note": "No Databricks/Spark/GPU available; workspace-dependent checks are blocked.",
        },
        "summary": dict(sorted(counts.items())),
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

    if args.check and counts.get("failed"):
        print("baseline has FAILED checks", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
