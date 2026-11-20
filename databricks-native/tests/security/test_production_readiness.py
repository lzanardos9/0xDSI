"""Production-readiness tests for the Databricks App backend, mocked at the Databricks boundary.

`databricks.sql`, `databricks.sdk` and `dotenv` are replaced with stubs before the
real `backend.server` module is imported, then the FastAPI app is driven with
TestClient. No workspace, warehouse or network is touched.

Run:  python3 databricks-native/tests/security/test_production_readiness.py
Requires: fastapi, httpx, pyyaml
"""

import importlib
import os
import re
import sys
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP_DIR = ROOT / "app"


def _install_stubs():
    databricks = types.ModuleType("databricks")
    sql_mod = types.ModuleType("databricks.sql")
    sql_mod.connect = lambda **kw: (_ for _ in ()).throw(RuntimeError("no warehouse in tests"))
    sdk_mod = types.ModuleType("databricks.sdk")

    class WorkspaceClient:  # noqa: D401 - stub
        def __init__(self, *a, **kw):
            raise RuntimeError("no workspace in tests")

    sdk_mod.WorkspaceClient = WorkspaceClient
    databricks.sql = sql_mod
    databricks.sdk = sdk_mod
    sys.modules.setdefault("databricks", databricks)
    sys.modules.setdefault("databricks.sql", sql_mod)
    sys.modules.setdefault("databricks.sdk", sdk_mod)
    if "dotenv" not in sys.modules:
        try:
            import dotenv  # noqa: F401
        except ImportError:
            dotenv_mod = types.ModuleType("dotenv")
            dotenv_mod.load_dotenv = lambda *a, **kw: False
            sys.modules["dotenv"] = dotenv_mod


def _load_server(env: dict):
    _install_stubs()
    for key in ("DATABRICKS_WAREHOUSE_ID", "UNITY_CATALOG", "UNITY_SCHEMA", "APP_DOMAIN",
                "LAKEWATCH_CATALOG", "LAKEWATCH_SCHEMA", "LAKEWATCH_TABLES", "WORKFLOW_ALLOWED_HOSTS"):
        os.environ.pop(key, None)
    os.environ.update(env)
    os.environ.setdefault("SOC_DATA_ACCESS_MODE", "app")
    if str(APP_DIR) not in sys.path:
        sys.path.insert(0, str(APP_DIR))
    for name in [m for m in sys.modules if m.startswith("backend")]:
        del sys.modules[name]
    return importlib.import_module("backend.server")


def _client(server):
    from fastapi.testclient import TestClient

    return TestClient(server.app, raise_server_exceptions=False)


ANALYST = {"X-Forwarded-Email": "analyst@example.com", "X-Forwarded-User": "analyst@example.com"}
CONFIGURED = {"DATABRICKS_WAREHOUSE_ID": "abcdef0123456789", "UNITY_CATALOG": "soc_platform",
              "UNITY_SCHEMA": "security", "SOC_ANALYST_EMAILS": "analyst@example.com"}


def test_health_up_and_ready_fails_when_config_missing():
    server = _load_server({})
    c = _client(server)
    assert c.get("/health").status_code == 200
    r = c.get("/ready")
    assert r.status_code == 503, r.text
    body = r.json()
    assert body["status"] == "not_ready"
    assert "DATABRICKS_WAREHOUSE_ID" in str(body)


def test_invalid_identifiers_rejected_by_config():
    server = _load_server({**CONFIGURED, "UNITY_CATALOG": "soc`; DROP", "DATABRICKS_WAREHOUSE_ID": "x"})
    missing = server.CONFIG.missing_required()
    assert "UNITY_CATALOG (invalid name)" in missing
    assert "DATABRICKS_WAREHOUSE_ID (invalid format)" in missing


def test_ready_does_not_leak_warehouse_error_text():
    server = _load_server(CONFIGURED)
    server.query = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("secret-host.cloud.databricks.com refused"))
    r = _client(server).get("/ready")
    assert r.status_code == 503
    assert "secret-host" not in r.text


def test_cors_closed_by_default():
    server = _load_server(CONFIGURED)
    r = _client(server).options("/api/health", headers={
        "Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in {k.lower() for k in r.headers}


def test_api_requires_identity():
    server = _load_server(CONFIGURED)
    r = _client(server).post("/api/query/alerts", json={})
    assert r.status_code == 401, r.text


def test_query_validates_limit_offset_and_allowlist():
    server = _load_server(CONFIGURED)
    captured = {}

    def fake_query(sql, params=None):
        captured["sql"], captured["params"] = sql, params
        return []

    server.query = fake_query
    c = _client(server)
    table = sorted(server.ALLOWED_TABLES)[0]
    assert c.post("/api/query/not_a_table", json={}, headers=ANALYST).status_code in (400, 403, 404)
    assert c.post(f"/api/query/{table}", json={"limit": "abc"}, headers=ANALYST).status_code == 400
    assert c.post(f"/api/query/{table}", json={"offset": -5}, headers=ANALYST).status_code == 400
    r = c.post(f"/api/query/{table}", json={"limit": 999999}, headers=ANALYST)
    assert r.status_code == 200, r.text
    assert str(server.QUERY_MAX_ROWS) in captured["sql"] or server.QUERY_MAX_ROWS in (captured["params"] or {}).values()


def test_internal_errors_are_generic():
    server = _load_server(CONFIGURED)
    server.query = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("Table soc_platform.security.x: token=abc"))
    table = sorted(server.ALLOWED_TABLES)[0]
    r = _client(server).post(f"/api/query/{table}", json={}, headers=ANALYST)
    if r.status_code == 500:
        assert "token=abc" not in r.text and "ref" in r.json()["detail"]


def test_lakewatch_unconfigured_returns_setup_error():
    server = _load_server(CONFIGURED)
    r = _client(server).get("/api/lakewatch/events", headers=ANALYST)
    assert r.status_code == 503
    assert r.json()["error"] == "lakewatch_not_configured"
    assert "LAKEWATCH_TABLES" in r.json()["setup"]


def test_lakewatch_only_reads_configured_tables():
    server = _load_server({**CONFIGURED, "LAKEWATCH_CATALOG": "lw", "LAKEWATCH_SCHEMA": "gold",
                           "LAKEWATCH_TABLES": "detections"})
    seen = {}
    server.query = lambda sql, params=None: seen.setdefault("sql", sql) and [{"id": 1}]
    c = _client(server)
    assert c.get("/api/lakewatch/other", headers=ANALYST).status_code == 404
    r = c.get("/api/lakewatch/detections?limit=5", headers=ANALYST)
    assert r.status_code == 200, r.text
    assert seen["sql"].startswith("SELECT * FROM `lw`.`gold`.`detections`")


def test_workflow_execution_disabled_without_allowlist():
    server = _load_server(CONFIGURED)
    r = _client(server).post("/api/workflows/execute", headers=ANALYST,
                             json={"workflow_id": "w1", "webhook_url": "https://hooks.example.com/x"})
    assert r.status_code == 503


def test_workflow_target_validation():
    _install_stubs()
    sys.path.insert(0, str(APP_DIR))
    from backend.workflow_runner import WorkflowRunError, validate_target

    hosts = {"hooks.example.com"}
    for url, code in [("http://hooks.example.com/x", 400), ("https://evil.example/x", 403),
                      ("https://user:pw@hooks.example.com/x", 400), ("https://hooks.example.com:8443/x", 403)]:
        try:
            validate_target(url, hosts)
            raise AssertionError(f"{url} should be rejected")
        except WorkflowRunError as e:
            assert e.status == code, (url, e.status)
    assert validate_target("https://hooks.example.com/x", hosts)


def test_bundle_binds_least_privilege_resources():
    import yaml

    app = yaml.safe_load((ROOT / "resources" / "app.yml").read_text())["resources"]["apps"]
    spec = next(iter(app.values()))
    perms = {next(k for k in r if k not in ("name", "description")): r for r in spec["resources"]}
    assert perms["sql_warehouse"]["sql_warehouse"]["permission"] == "CAN_USE"
    assert perms["serving_endpoint"]["serving_endpoint"]["permission"] == "CAN_QUERY"
    assert perms["secret"]["secret"]["permission"] == "READ"
    assert "${DATABRICKS_APP_PORT}" in spec["config"]["command"]
    assert not (APP_DIR / "app.yaml").exists(), "runtime config must live only in resources/app.yml"


def test_no_browser_secrets_in_frontend_or_bundle():
    pattern = re.compile(r"VITE_DATABRICKS_(TOKEN|PAT|CLIENT_SECRET)|dapi[0-9a-f]{32}|Authorization: `Bearer")
    targets = list((APP_DIR / "frontend" / "src").rglob("*.ts*"))
    dist = APP_DIR / "dist"
    if dist.exists():
        targets += [p for p in dist.rglob("*") if p.suffix in (".js", ".html")]
    hits = [str(p) for p in targets if pattern.search(p.read_text(encoding="utf-8", errors="ignore"))]
    assert not hits, f"browser-side credentials found in: {hits}"


if __name__ == "__main__":
    passed = failed = 0
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            try:
                fn()
                passed += 1
                print(f"PASS {name}")
            except Exception as e:  # noqa: BLE001
                failed += 1
                print(f"FAIL {name}: {type(e).__name__}: {e}")
    print(f"\n{passed} passed, {failed} failed")
    raise SystemExit(1 if failed else 0)
