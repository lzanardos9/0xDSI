"""
On-behalf-of user authorization for app reads (backend/user_auth.py).

fastapi is not installed offline, so a minimal stub stands in for
HTTPException/Request; the real shipped module is imported and its middleware
is driven directly.

Run:  python3 databricks-native/tests/security/test_user_auth.py
"""

import asyncio
import importlib
import os
import sys
import types

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
APP_DIR = os.path.join(ROOT, "app")


class _HTTPException(Exception):
    def __init__(self, status_code, detail=""):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _load(mode="user"):
    if "fastapi" not in sys.modules or not hasattr(sys.modules["fastapi"], "Request"):
        stub = types.ModuleType("fastapi")
        stub.HTTPException = _HTTPException
        stub.Request = object
        sys.modules["fastapi"] = stub
    if APP_DIR not in sys.path:
        sys.path.insert(0, APP_DIR)
    os.environ["SOC_DATA_ACCESS_MODE"] = mode
    sys.modules.pop("backend.user_auth", None)
    return importlib.import_module("backend.user_auth")


class _FakeApp:
    def __init__(self):
        self.mw = None

    def middleware(self, kind):
        def deco(fn):
            self.mw = fn
            return fn
        return deco


class _Req:
    def __init__(self, path, token=None):
        self.url = types.SimpleNamespace(path=path)
        self.headers = {"x-forwarded-access-token": token} if token is not None else {}


class _Conn:
    def __init__(self, token):
        self.token = token
        self.closed = False

    def close(self):
        self.closed = True


def _run(ua, req, handler):
    app = _FakeApp()
    ua.install(app)

    async def call_next(_):
        return handler()

    return asyncio.run(app.mw(req, call_next))


def test_outside_request_uses_app_identity():
    ua = _load("user")
    assert ua.user_connection(lambda t: _Conn(t)) is None


def test_reads_use_forwarded_token_and_connection_is_closed():
    ua = _load("user")
    opened = []

    def handler():
        c1 = ua.user_connection(lambda t: opened.append(_Conn(t)) or opened[-1])
        c2 = ua.user_connection(lambda t: opened.append(_Conn(t)) or opened[-1])
        assert c1 is c2, "one connection per request"
        return "ok"

    assert _run(ua, _Req("/api/identity/overview", "tok-alice"), handler) == "ok"
    assert len(opened) == 1 and opened[0].token == "tok-alice"
    assert opened[0].closed, "connection must be closed when the request ends"
    assert ua.user_connection(lambda t: _Conn(t)) is None, "no scope leaks past the request"


def test_missing_token_fails_closed_in_user_mode():
    ua = _load("user")

    def handler():
        try:
            ua.user_connection(lambda t: _Conn(t))
        except _HTTPException as e:
            return e.status_code
        return 200

    assert _run(ua, _Req("/api/identity/overview"), handler) == 401


def test_requests_do_not_share_tokens():
    ua = _load("user")
    seen = []
    for tok in ("tok-alice", "tok-bob"):
        _run(ua, _Req("/api/data", tok), lambda: seen.append(ua.user_connection(lambda t: _Conn(t)).token))
    assert seen == ["tok-alice", "tok-bob"]


def test_app_mode_never_uses_user_token():
    ua = _load("app")
    got = _run(ua, _Req("/api/data", "tok-alice"), lambda: ua.user_connection(lambda t: _Conn(t)))
    assert got is None


def test_invalid_mode_refuses_to_start():
    try:
        _load("both")
    except RuntimeError:
        return
    finally:
        os.environ["SOC_DATA_ACCESS_MODE"] = "user"
    raise AssertionError("unknown SOC_DATA_ACCESS_MODE must refuse to start")


def test_server_routes_reads_as_user_and_writes_as_app():
    src = open(os.path.join(APP_DIR, "backend", "server.py"), encoding="utf-8").read()
    q = src[src.index("def query("):src.index("@asynccontextmanager")]
    assert "user_auth.user_connection" in q
    w = src[src.index("def execute_write("):src.index("def resolve_job_id(")]
    assert "user_auth" not in w and "get_connection()" in w
    assert "user_auth.install(app)" in src


def test_bundle_requests_sql_user_scope():
    yml = open(os.path.join(ROOT, "resources", "app.yml"), encoding="utf-8").read()
    assert "user_api_scopes:" in yml and "- sql" in yml
    assert "SOC_DATA_ACCESS_MODE" in yml


if __name__ == "__main__":
    failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {e!r}")
    print(f"\n{'FAILED' if failed else 'OK'} ({failed} failed)")
    raise SystemExit(1 if failed else 0)
