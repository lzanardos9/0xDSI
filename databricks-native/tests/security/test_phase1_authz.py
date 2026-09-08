"""Phase 1 security tests: authorization, protected tables, path traversal.

fastapi/databricks are not installed in this offline environment, so we extract
the pure decision functions out of ``app/backend/server.py`` by name (via ast)
and exec them in an isolated namespace with a stub HTTPException. This exercises
the *real shipped* logic without importing the web framework.

Run:  python3 databricks-native/tests/security/test_phase1_authz.py
"""

import ast
import os
import tempfile
from pathlib import Path
from typing import Optional  # noqa: F401  (used by exec'd _safe_static_file)

SERVER = os.path.join(
    os.path.dirname(__file__), "..", "..", "app", "backend", "server.py"
)


class HTTPException(Exception):
    def __init__(self, status_code=400, detail=""):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"{status_code}: {detail}")


def _load(names):
    """Extract the named top-level defs/assignments from server.py and exec them
    into a fresh namespace seeded with a stub HTTPException + stdlib helpers."""
    src = Path(SERVER).read_text(encoding="utf-8")
    tree = ast.parse(src)
    wanted = {}
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef,)) and node.name in names:
            wanted[node.name] = ast.get_source_segment(src, node)
        elif isinstance(node, ast.Assign):
            for t in node.targets:
                if isinstance(t, ast.Name) and t.id in names:
                    wanted[t.id] = ast.get_source_segment(src, node)
    missing = set(names) - set(wanted)
    assert not missing, f"could not extract from server.py: {missing}"
    ns = {"HTTPException": HTTPException, "Path": Path, "Optional": Optional}
    # deterministic order: assignments used by functions must exec first
    ordered = [wanted[n] for n in names if n in wanted]
    exec(compile("\n\n".join(ordered), SERVER, "exec"), ns)
    return ns


ROLE_NS = _load([
    "ADMIN_TABLES", "READONLY_TABLES", "PROTECTED_TABLES",
    "_resolve_roles", "_require_authenticated", "_require_admin",
    "_require_analyst", "_check_write_permission", "authorize",
    "_safe_static_file", "_action_originator",
])


def _set_roles(admin=frozenset(), analyst=frozenset(), trust_groups=False):
    ROLE_NS["ADMIN_EMAILS"] = frozenset(e.lower() for e in admin)
    ROLE_NS["ANALYST_EMAILS"] = frozenset(e.lower() for e in analyst)
    ROLE_NS["TRUST_FORWARDED_GROUPS"] = trust_groups


def _user(email="", username="", is_admin=False, is_analyst=False):
    return {
        "email": email,
        "username": username or (email.split("@")[0] if email else "unknown"),
        "is_admin": is_admin,
        "is_analyst": is_analyst,
    }


# ── role resolution: the header must NOT grant admin ────────────────────────

def test_forwarded_groups_cannot_escalate_by_default():
    _set_roles(admin={"boss@x.io"}, trust_groups=False)
    groups, is_admin, is_analyst = ROLE_NS["_resolve_roles"]("attacker@x.io", ["soc_admins"])
    assert is_admin is False, "spoofed X-Forwarded-Groups must not grant admin"
    assert is_analyst is False


def test_allowlisted_email_is_admin():
    _set_roles(admin={"boss@x.io"}, trust_groups=False)
    _, is_admin, is_analyst = ROLE_NS["_resolve_roles"]("BOSS@x.io", [])
    assert is_admin and is_analyst


def test_analyst_allowlist_is_not_admin():
    _set_roles(admin={"boss@x.io"}, analyst={"ana@x.io"}, trust_groups=False)
    _, is_admin, is_analyst = ROLE_NS["_resolve_roles"]("ana@x.io", [])
    assert is_analyst and not is_admin


def test_groups_honored_only_when_opted_in():
    _set_roles(trust_groups=True)
    _, is_admin, _ = ROLE_NS["_resolve_roles"]("x@x.io", ["soc_admins"])
    assert is_admin is True


def test_empty_email_never_authorized():
    _set_roles(admin={"boss@x.io"}, trust_groups=False)
    _, is_admin, is_analyst = ROLE_NS["_resolve_roles"]("", ["soc_admins", "soc_analysts"])
    assert not is_admin and not is_analyst


# ── authorize(): fail-closed, no alternate-path bypass ──────────────────────

def _raises(fn, code):
    try:
        fn()
    except HTTPException as e:
        assert e.status_code == code, f"expected {code} got {e.status_code}: {e.detail}"
        return
    raise AssertionError(f"expected HTTPException {code}, nothing raised")


def test_write_requires_identity():
    _raises(lambda: ROLE_NS["authorize"](_user(), "write", "alerts"), 401)


def test_viewer_cannot_write():
    u = _user(email="v@x.io", is_analyst=False)
    _raises(lambda: ROLE_NS["authorize"](u, "write", "alerts"), 403)


def test_analyst_can_write_normal_table():
    u = _user(email="a@x.io", is_analyst=True)
    ROLE_NS["authorize"](u, "write", "alerts")  # must not raise


def test_protected_table_blocks_generic_write_even_for_admin():
    u = _user(email="admin@x.io", is_admin=True, is_analyst=True)
    for table in ("response_actions", "unified_evidence_objects", "entity_spine", "agent_status"):
        _raises(lambda t=table: ROLE_NS["authorize"](u, "write", t), 403)


def test_admin_table_needs_admin():
    analyst = _user(email="a@x.io", is_analyst=True)
    _raises(lambda: ROLE_NS["authorize"](analyst, "write", "system_settings"), 403)
    admin = _user(email="admin@x.io", is_admin=True, is_analyst=True)
    ROLE_NS["authorize"](admin, "write", "system_settings")  # must not raise


def test_admin_action_requires_admin():
    analyst = _user(email="a@x.io", is_analyst=True)
    _raises(lambda: ROLE_NS["authorize"](analyst, "admin", "some_fn"), 403)


# ── static path traversal ───────────────────────────────────────────────────

def test_safe_static_file():
    with tempfile.TemporaryDirectory() as d:
        root = Path(d)
        (root / "index.html").write_text("ok")
        (root / "assets").mkdir()
        (root / "assets" / "app.js").write_text("x")
        secret = root.parent / "secret.txt"
        secret.write_text("top")

        f = ROLE_NS["_safe_static_file"]
        assert f(root, "index.html") is not None
        assert f(root, "assets/app.js") is not None
        assert f(root, "../secret.txt") is None
        assert f(root, "assets/../../secret.txt") is None
        assert f(root, "/etc/passwd") is None
        assert f(root, "does/not/exist.js") is None


def test_action_originator_normalizes():
    assert ROLE_NS["_action_originator"]({"requested_by": "Alice"}) == "alice"
    assert ROLE_NS["_action_originator"]({"created_by": "Bob"}) == "bob"
    assert ROLE_NS["_action_originator"]({}) == ""


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
