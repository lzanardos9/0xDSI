#!/usr/bin/env python3
"""
Offline hardening gate (Phase 10 / Gate D).

One reproducible command that runs every check that does NOT need a live
Databricks workspace, so the offline evidence is regenerable by CI or a
reviewer instead of living only in a prose log:

  1. Notebook syntax gate -- py_compile every notebooks/**/*.py (a syntax error
     would only surface at deploy time otherwise).
  2. Offline test suite   -- run every tests/**/test_*.py (contract, property,
     security, e2e-contract). Each file is a self-contained script that exits
     non-zero on failure.

Exits non-zero if any check fails, so CI blocks on it. Live gates
(`databricks bundle validate`, job runs, streaming, load) are intentionally
NOT here -- they require an authorized workspace and are tracked BLOCKED.

Usage:
  python3 tools/ci/run_offline_gate.py
"""

import os
import py_compile
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _walk(rel, predicate):
    base = os.path.join(ROOT, rel)
    for dirpath, _dirs, files in os.walk(base):
        if "__pycache__" in dirpath:
            continue
        for name in files:
            if predicate(name):
                yield os.path.join(dirpath, name)


def compile_notebooks():
    failures = []
    count = 0
    for path in sorted(_walk("notebooks", lambda n: n.endswith(".py"))):
        count += 1
        try:
            py_compile.compile(path, doraise=True)
        except py_compile.PyCompileError as e:
            failures.append((path, str(e)))
    return count, failures


def run_test_files():
    results = []
    for path in sorted(_walk("tests", lambda n: n.startswith("test_") and n.endswith(".py"))):
        proc = subprocess.run(
            [sys.executable, path],
            cwd=ROOT,
            capture_output=True,
            text=True,
        )
        ok = proc.returncode == 0
        results.append((path, ok, proc.stdout + proc.stderr))
    return results


def main():
    print("== Offline hardening gate ==\n")

    print("[1/2] Notebook syntax (py_compile)")
    n_notebooks, compile_failures = compile_notebooks()
    if compile_failures:
        for path, err in compile_failures:
            print(f"  FAIL {os.path.relpath(path, ROOT)}\n{err}")
    else:
        print(f"  OK  {n_notebooks} notebooks compile")

    print("\n[2/2] Offline test suite (tests/**/test_*.py)")
    results = run_test_files()
    passed = [r for r in results if r[1]]
    failed = [r for r in results if not r[1]]
    for path, ok, output in results:
        rel = os.path.relpath(path, ROOT)
        if ok:
            print(f"  PASS {rel}")
        else:
            print(f"  FAIL {rel}")
            print("\n".join("      " + ln for ln in output.strip().splitlines()[-12:]))

    print("\n== Summary ==")
    print(f"  notebooks compiled : {n_notebooks} ({len(compile_failures)} failed)")
    print(f"  test files         : {len(results)} ({len(passed)} passed, {len(failed)} failed)")

    ok = not compile_failures and not failed
    print(f"\n  OFFLINE GATE: {'PASS' if ok else 'FAIL'}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
