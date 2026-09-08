"""
Guard: backend modules must be imported the way the server is actually launched.

app/app.yaml starts the API as `uvicorn backend.server:app` with working
directory `app/`, so `app/` is on sys.path and the package is `backend`. A bare
`from audit import ...` inside server.py therefore fails at startup -- the module
is only importable as `backend.audit`. Syntax compilation does not catch this
(it never resolves imports) and the only check that boots the server needs a
live workspace, so this static guard stands in for that: it AST-parses every
module under app/backend and asserts each import of a sibling module uses the
`backend.` prefix (or an explicit relative import). It also imports the
dependency-free backend modules under the real launch path to prove they load.

Run:  python3 databricks-native/tests/contract/test_backend_imports.py
"""

import ast
import importlib.util
import os
import sys

APP_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "app"))
BACKEND_DIR = os.path.join(APP_DIR, "backend")

# Sibling modules a backend file might import (by bare stem).
SIBLINGS = {
    os.path.splitext(f)[0]
    for f in os.listdir(BACKEND_DIR)
    if f.endswith(".py") and f != "__init__.py"
}


def _bad_sibling_imports(path):
    """Return bare `import <sibling>` / `from <sibling> import` statements.

    A sibling imported without the `backend.` prefix and without a relative
    level (`from . import`) will not resolve under `uvicorn backend.server:app`.
    """
    tree = ast.parse(open(path, encoding="utf-8").read())
    bad = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            if node.level == 0 and node.module and node.module.split(".")[0] in SIBLINGS:
                bad.append(f"from {node.module} import ...")
        elif isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".")[0] in SIBLINGS:
                    bad.append(f"import {alias.name}")
    return bad


def test_no_bare_sibling_imports_anywhere_in_backend():
    offenders = {}
    for f in sorted(os.listdir(BACKEND_DIR)):
        if not f.endswith(".py"):
            continue
        bad = _bad_sibling_imports(os.path.join(BACKEND_DIR, f))
        if bad:
            offenders[f] = bad
    assert not offenders, (
        "backend modules must import siblings as `backend.<mod>` (uvicorn runs "
        f"`backend.server:app` from app/); offenders: {offenders}"
    )


def test_server_imports_audit_and_readiness_via_backend_prefix():
    bad = _bad_sibling_imports(os.path.join(BACKEND_DIR, "server.py"))
    assert bad == [], f"server.py has unresolvable sibling imports: {bad}"


def test_dependency_free_backend_modules_load_under_launch_path():
    # Reproduce the launch path: app/ on sys.path, import as backend.<mod>.
    if APP_DIR not in sys.path:
        sys.path.insert(0, APP_DIR)
    for mod in ("backend.audit", "backend.readiness"):
        assert importlib.util.find_spec(mod) is not None, f"cannot resolve {mod}"


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
