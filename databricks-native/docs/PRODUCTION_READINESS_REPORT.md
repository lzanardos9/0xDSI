# 0xDSI on Databricks - Production Readiness Completion Report

Date: 2026-11-20. Scope: `databricks-native/` (primary) and the root Supabase app where the same code exists. Nothing was deployed and no remote Databricks workspace was modified.

## 1. What changed and the resulting architecture

```
Browser (SPA, no tokens)  --same origin-->  Databricks Apps proxy (SSO, X-Forwarded-* identity, user token)
                                              |
                                   FastAPI backend (backend.server:app, port ${DATABRICKS_APP_PORT})
                                     | reads: as user (user mode) or app SP (app mode)
                                     | writes + audit: app SP, fail-closed
                     SQL warehouse (CAN_USE) - Unity Catalog - Model Serving (CAN_QUERY) - Secret (READ)
```

| Area | Change |
|---|---|
| Runtime config | Single source in `resources/app.yml` (`config.command`, `config.env`); duplicate `app/app.yaml` (empty warehouse id) removed. CLI pinned `>= 0.283.0`. |
| Least privilege | App resources bound: SQL warehouse CAN_USE, two serving endpoints CAN_QUERY, custody secret READ. Production target permissions limited to `soc_admins`. Demo seeding off in production. |
| Startup / probes | Config validated (warehouse id format, catalog/schema identifier rules). `/health` always up; `/ready` returns 503 with `missing_config` names; canary errors no longer echo raw text. |
| Lakewatch | No invented tables. `LAKEWATCH_CATALOG/SCHEMA/TABLES` variables; `/api/lakewatch/status` and `/api/lakewatch/{table}` (allowlisted, analyst-only, parameterized limit) return `lakewatch_not_configured` with setup text until set. |
| Secrets | Custody key read via SDK from the bound secret (`SOC_SECRET_SCOPE`/`IDENTITY_CUSTODY_SECRET_KEY`), env fallback for local only. `deploy.sh` creates it once, never overwrites, never prints it. |
| Browser credentials | Workflow webhooks run server-side (`POST /api/workflows/execute`): https only, host allowlist (`WORKFLOW_ALLOWED_HOSTS`), no redirects, token from a secret. Root app: new `execute-workflow` server function; the `auth_credentials` column is no longer readable from the browser. |
| Error hygiene | 94 raw `str(e)` responses replaced by `Internal error (ref xxxx)`; detail logged server-side only. |
| CORS | Closed by default (same-origin SPA); opened only for `APP_DOMAIN`. |
| Query API | `limit` 1..5000 and `offset` 0..1,000,000 validated as integers; body must be an object. |
| Deploy safety | `make deploy-*` and `deploy.sh` run `tools/release_check.py` (dist present and newer than sources + secret scan). Rollback requires `CONFIRM_DESTROY=<target>`; production also asks for the typed name; destroy failures now fail loudly. |
| Local dev | `.env.example` (placeholders only), `.gitignore`, `.env` loaded locally only. |
| Go-Live Readiness | New Identity menu screen in both apps: 11 automated + 6 sign-off checks, score and verdict (Go / Go with risks / Not ready), admin sign/waive/revoke with audit, append-only `go_live_signoff` table. |
| Docs | `docs/INSTALLATION_MANUAL.md` new "Databricks App deployment" section (prereqs, build, local run, validate/deploy, grants, auth model, Lakewatch, go-live gate, diagnostics); section 7.4 updated. |

## 2. Validation commands run and results

| Command | Result |
|---|---|
| `npm run build` (root) | Pass |
| `npm run build` (`databricks-native/app`) | Pass |
| `python3 tools/release_check.py` | Pass (bundle fresh, no secrets) |
| `python3 -m py_compile app/backend/*.py` | Pass |
| `python3 tests/security/test_production_readiness.py` | 15 passed (FastAPI TestClient, Databricks SDK/SQL stubbed) |
| `python3 tests/property/test_golive.py` | 8 passed |
| All other `tests/security`, `tests/contract`, `tests/property`, `tests/test_fuse_math.py` | All pass (after regenerating the artifact manifest) |
| `bash -n deploy.sh` | Pass |
| `npm run typecheck` (root) | New files clean; pre-existing errors remain in older screens (unchanged) |

## 3. Not run / remaining workspace setup

- `databricks bundle validate` / `deploy`: the Databricks CLI is not available in this environment. Run `databricks bundle validate -t dev --var="warehouse_id=<id>"` first.
- Workspace steps: create groups `soc_admins`/`soc_analysts`; enable user authorization for apps (sql scope); UC grants (USE CATALOG, USE SCHEMA, SELECT, MODIFY on written tables) to the app service principal and analyst groups; READ on the secret scope for `workflow_webhook_token` if webhooks are used; set Lakewatch variables once the table names are known; run setup notebook 06 so `go_live_signoff` exists.
- `deploy.sh` secret creation pipes the value via stdin to `databricks secrets put-secret`; confirm on your CLI version.
- The live end-to-end detection harness (`tests/e2e`) needs a workspace and was not run.

## 4. Limitations and what is still mocked

- No deploy was performed, so the app starting on Databricks, the user-token flow, and Lakewatch querying are **not verified end to end**. A successful frontend build does not prove these.
- Tests stub `databricks.sql`, `databricks.sdk` and `dotenv`; pinned `databricks-sql-connector 3.4.0` could not be installed on Python 3.13 here.
- In the root app, Go-Live automated checks show a labelled sample staging snapshot (it has no Databricks deployment); sign-offs are real and saved per signed-in user. Blocker-waiver rules are enforced in the app there, and on the server in the Databricks app.
- The root app's wider database permissions (many tables open to anonymous access) were outside this scope and are unchanged except for the workflow credentials column.
- Correction to an earlier statement: Databricks Apps **does** substitute `${DATABRICKS_APP_PORT}` in the start command; the original command was fine.
