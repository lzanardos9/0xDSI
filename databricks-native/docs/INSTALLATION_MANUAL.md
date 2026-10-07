# 0xDSI Agentic SOC — Installation Manual (Zero to First Detection)

**Scope:** the `databricks-native/` folder only. Nothing outside it is required or assumed.
**Audience:** a Databricks workspace admin / platform engineer installing 0xDSI for the first time.
**Status of this document:** reflects the repository *after* the install-blocker fixes (B1–B7, G1–G2). The offline gate passes (174 notebooks compile, 42/42 test files pass) and the app UI builds from `app/`. **Nothing here has yet been executed against a live Databricks workspace**; steps whose outcome depends on live behaviour say so.

---

## 0. Readiness verdict

| Area | State |
|------|-------|
| Python notebooks | 174 compile cleanly (offline gate). |
| Offline tests | 42 of 42 pass. |
| App screens (frontend) | Built inside `app/` by the installer; uploaded via bundle `sync.include`. |
| Bundle definition | 105 jobs + 2 serverless pipelines + 1 app; every referenced notebook exists. Custom model serving is opt-in. |
| One-command installer | `./deploy.sh dev <WAREHOUSE_ID>` is the supported path. It builds, deploys, runs setup **and waits for it**, creates the agent tool functions, grants the app, and starts it. |
| Table setup (`setup/01`) | Rewritten to valid Delta DDL: no non-constant defaults, no expression partitions, column-defaults feature enabled wherever `DEFAULT` is used. Creates all volumes. |
| First real detection | Section 6 — five SQL/CLI steps after install. |
| "100% production" | Not yet. Section 10 lists what remains: 1 architectural gap (dual ingestion), 1 serving gap, 28 unscheduled experimental notebooks, a deployment-integrity manifest, and items that can only be proven on real infrastructure. |

---

## 1. What gets installed

```
 Sources (Kafka / Event Hubs / Kinesis / files in a Volume)
        │
        ▼
 Ingestion jobs ──► events (Delta)          DLT pipeline: bronze_raw_events → silver_* → gold_*
        │                                    (parallel path, see Gap F2)
        ▼
 Detection jobs (threat-intel match, behavioral anomaly, SLM classifier, formula scoring)
        │
        ▼
 alerts (Delta) ──► correlation / fuse / dedup ──► cases ──► response (governed, approval-bound)
        │
        ▼
 Databricks App "0xdsi-agentic-soc" (FastAPI backend + React UI) via a SQL Warehouse
```

| Object | Name (dev target) |
|--------|------|
| Catalog / schema | `soc_platform_dev.agentic_soc` (staging: `soc_platform_staging`, prod: `soc_platform`) |
| Volumes | `data, landing, checkpoints, models, artifacts, exports, quarantine` |
| Tables | ~260 definitions; core ones created by `notebooks/setup/01_create_catalog_schema.py` |
| UC tool functions | `lookup_ioc`, `get_alert_context`, `query_user_behavior`, `search_events`, `get_asset_info`, `create_case`, `execute_response_action` |
| Jobs | 105 (`resources/jobs.yml`), ~10 continuous, plus 3 ops jobs (health check, SLA alerting, checkpoint GC report) |
| Pipelines | `bronze_silver_gold`, `attack_universe_realtime` (serverless) |
| App | `0xdsi-agentic-soc` |
| Groups | `soc_admins`, `soc_analysts` (created if missing) |
| Secret scope | `soc-secrets` |
| Vector Search endpoint | `0xdsi-vector-search` |

---

## 2. Prerequisites

### 2.1 Workspace capabilities

| Capability | Why |
|-----------|-----|
| Unity Catalog (metastore attached) | Tables, volumes, functions, models |
| Serverless jobs compute (environment v2) | Most jobs |
| Classic job clusters (DBR 15.4 LTS) | GraphFrames trend engine, some long-running streams |
| Serverless or Pro SQL Warehouse | The app and the installer's SQL go through it |
| Databricks Apps | UI/API |
| Foundation Model APIs | Agents (LLM + embeddings) |
| Vector Search | Memory / similarity agents (not needed for first detection) |
| Delta Live Tables (serverless) | Medallion pipeline |

### 2.2 Your permissions
`CREATE CATALOG` on the metastore, workspace admin (groups, secret scopes, apps, vector endpoints), `CAN_MANAGE` on the SQL Warehouse (so the installer can grant the app `CAN_USE`).

### 2.3 Local tools

| Tool | Version |
|------|---------|
| Databricks CLI | ≥ 0.220 (tested against 0.299.x) |
| Python | 3.11+ |
| Node.js / npm | ≥ 20 (required — the installer builds the UI) |
| bash, make | any recent |

### 2.4 Model endpoints
Installer and bundle now share one default: primary `databricks-meta-llama-3-1-70b-instruct`, fallback `databricks-meta-llama-3-1-8b-instruct`, embeddings `databricks-bge-large-en`. Databricks retires models over time — check **Serving** in your workspace. Override with environment variables before running the installer:

```bash
export DATABRICKS_LLM_ENDPOINT=<current primary model>
export DATABRICKS_LLM_FALLBACK=<current fallback model>
export DATABRICKS_EMBEDDING_ENDPOINT=<current embedding model>
```
The installer checks each endpoint and warns (does not stop) if one is missing.

---

## 3. Step 1 — Verify offline

```bash
cd databricks-native
pip install pyyaml numpy scipy
make gate-offline      # expect: OFFLINE GATE: PASS
```

---

## 4. Step 2 — Authenticate and pick a warehouse

```bash
databricks auth login --host https://<your-workspace-url>
databricks current-user me
```
Create or reuse a Serverless SQL Warehouse and copy its **ID** → `<WAREHOUSE_ID>`.

Optional — who gets which role inside the app (comma-separated emails). If you set nothing, **you** become the only admin and everyone else is read-only:
```bash
export SOC_ADMIN_EMAILS="you@corp.com,lead@corp.com"
export SOC_ANALYST_EMAILS="analyst1@corp.com,analyst2@corp.com"
```

---

## 5. Step 3 — Install (one command)

```bash
./deploy.sh dev <WAREHOUSE_ID>
```

What it does, in order:

| # | Step | Notes |
|---|------|-------|
| 1 | Pre-flight | CLI, auth, Node/npm, Python, warehouse ID; resolves app admin emails |
| 2 | Model check | Warns if an endpoint is missing |
| 3 | Secret scope | Creates `soc-secrets`, stores endpoint/catalog settings |
| 4 | UC objects | Catalog, schema, all 7 volumes; creates `soc_admins` / `soc_analysts` groups if missing |
| 5 | MLflow experiments | `/0xDSI/agents/*`, `/0xDSI/pipelines/*` |
| 6 | Model namespaces | Registers empty UC model names (no serving endpoints) |
| 7 | Vector Search | Requests `0xdsi-vector-search` (provisions in the background) |
| 8 | UI build | `npm ci` + build inside `app/` → `app/dist` |
| 9–10 | Bundle validate + deploy | Passes warehouse, model, role and scope variables |
| 11 | Setup | Runs `initial_setup` **and waits**: tables, volumes, demo data (dev/staging only), correlation rule library; then creates the 7 agent tool functions on the real tables; starts the medallion pipeline and Lakebase sync |
| 12 | Permissions, app, health | Grants groups; grants the **app's service principal** catalog/schema/volume rights and `CAN_USE` on the warehouse; deploys and starts the app; prints a health score |

Expected end: `Readiness: 5/5 post-deploy checks passed.` Anything less prints `[!!]` lines saying what to look at.

**Dev target behaviour:** schedules are paused (development mode), so jobs only run when you trigger them. That is what you want for first detection.

**Manual alternative** (bundle only, no setup/grants): `make deploy-dev WAREHOUSE_ID=<id>`, then run `initial_setup` yourself. Use the one-command path unless you have a reason not to.

**Rollback:** `./deploy.sh dev <WAREHOUSE_ID> --rollback` removes jobs, pipelines and the app; tables and volumes are kept.

---

## 6. Step 4 — First real detection (end to end)

Goal: a known-bad IP appears in an event, the threat-intel job matches it, and a new alert is written by the pipeline (not by the demo seed). Run the SQL in a SQL editor attached to your warehouse.

### 6.1 Add a known-bad indicator
```sql
INSERT INTO soc_platform_dev.agentic_soc.ioc_entries
  (id, indicator_type, value, threat_type, confidence, source, active, first_seen, last_seen)
VALUES
  (uuid(), 'ip', '203.0.113.66', 'c2', 0.95, 'install-test', true, current_timestamp(), current_timestamp());
```
`203.0.113.0/24` is a documentation range — safe to use. Check the agent tool sees it:
```sql
SELECT * FROM soc_platform_dev.agentic_soc.lookup_ioc('203.0.113.66');
```

### 6.2 Produce an event that touches it

**Path A — fastest (direct to `events`):**
```sql
INSERT INTO soc_platform_dev.agentic_soc.events
  (id, timestamp, event_type, source, source_ip, dest_ip, user_id, username,
   hostname, action, outcome, severity, raw_log)
VALUES
  (uuid(), current_timestamp(), 'network_connection', 'install-test',
   '10.0.5.20', '203.0.113.66', 'jdoe', 'jdoe', 'WS-042',
   'connect', 'success', 'info', 'install test outbound connection');
```

**Path B — full ingestion (file → Auto Loader → `events`):**
1. Create `test1.json` (one JSON object per line):
   ```json
   {"event_type":"network_connection","timestamp":"2026-10-07T12:00:00Z","source":"install-test","source_ip":"10.0.5.20","dest_ip":"203.0.113.66","username":"jdoe","hostname":"WS-042","action":"connect","outcome":"success","severity":"info"}
   ```
2. Upload it to `/Volumes/soc_platform_dev/agentic_soc/data/landing/security-events/` (Catalog Explorer → Volumes → `data` → Upload; create the folders in the dialog).
3. Open the deployed notebook `notebooks/ingestion/01_raw_event_ingestion` in the bundle folder, attach serverless compute, set widgets `catalog=soc_platform_dev`, `source_type=autoloader`, `topics=security-events`, `trigger_interval=availableNow`, and run all.
4. Confirm with `SELECT * FROM events WHERE source='install-test'`; the newest `ingestion_accounting` row should show `balanced = true`.

### 6.3 Run the detection
```bash
databricks bundle run threat_intel_matching -t dev --var="warehouse_id=<WAREHOUSE_ID>"
```
With no Kafka secrets configured, the job logs a fallback to the Delta `events` table, processes what is available, and stops.

### 6.4 See the detection
```sql
SELECT id, title, severity, status, source, confidence_score, created_at
FROM soc_platform_dev.agentic_soc.alerts
WHERE source = 'threat_intel_matching'
ORDER BY created_at DESC;
```
Expected: an alert for `203.0.113.66`, severity **critical** (confidence ≥ 0.9), status `new`. The underlying match is in `threat_intel_matches`.

### 6.5 Carry it through triage and casework (optional)
```bash
databricks bundle run triage_agent      -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle run case_management   -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle run soc_core_pipeline -t dev --var="warehouse_id=<WAREHOUSE_ID>"
```
Check `agent_triage_results`, `cases`, `formula_priority_scores`.

### 6.6 See it in the app
Open **Compute → Apps → 0xdsi-agentic-soc** and click the URL. `/ready` returns "not ready" until the warehouse answers a test query (by design — wait for the warehouse to start). The new critical alert appears in the alerts view. Admin/analyst emails from Section 4 can triage it; everyone else sees it read-only.

**You have reached first detection.**

---

## 7. Step 5 — Connect real data and intelligence

### 7.1 Event sources (pick one)
| Source | Secrets in `soc-secrets` | Job parameter `source_type` |
|--------|--------------------------|-----------------------------|
| Kafka / Confluent | `kafka_brokers`, `kafka_sasl_username`, `kafka_sasl_password` | `kafka` (default) |
| Azure Event Hubs | `eventhub_connection` | `eventhub` |
| AWS Kinesis | `kinesis_access_key`, `kinesis_secret_key` | `kinesis` |
| Files in a Volume | none | `autoloader` |

Events must carry at least `event_type`; recognised fields are in `01_raw_event_ingestion.py` (`EVENT_SCHEMA`). Unparseable records are quarantined and counted, never silently dropped.

### 7.2 Threat intelligence feeds
`virustotal_api_key`, `abuseipdb_api_key`, `otx_api_key`, `misp_url`, `misp_api_key` (optional `greynoise_api_key`, `shodan_api_key`). Then run `threat_feed_ingestion`.

### 7.3 Notifications, ticketing, response targets
`slack_webhook_url`, `teams_webhook_url`, `pagerduty_api_key`, `servicenow_*`, `jira_*`, `crowdstrike_client_id/secret`. Response actions always need approval by a second person and are bound to a confirmed finding revision.

---

## 8. Step 6 — Staging and production

```bash
./deploy.sh staging    <WAREHOUSE_ID>
./deploy.sh production <WAREHOUSE_ID>
```
- **Demo data:** loaded only where `seed_demo_data` is `"true"` (dev and staging). Production defaults to `"false"`; the seed notebook exits immediately. The seed **overwrites** tables such as `events`, `alerts`, `cases` — never enable it on a catalog holding real data.
- **Cost:** outside dev, all 105 jobs and both pipelines run on their schedules immediately, including ~10 continuous streams and 2 continuous serverless pipelines. Pause what you don't need.
- **Roles:** set `SOC_ADMIN_EMAILS` / `SOC_ANALYST_EMAILS` for each run; they are written into the app's configuration.
- **Custom model serving (optional):** after real agent models are registered in UC, add `resources/optional/model_serving.yml` to `include:` in `databricks.yml` and redeploy.

---

## 9. Troubleshooting

| Symptom | Cause | Action |
|---------|-------|--------|
| Installer stops at "Group … could not be created" | Not a workspace admin | Ask an admin to create `soc_admins` / `soc_analysts`, re-run |
| Installer stops at "initial_setup failed" | A table/notebook error on first live run | Open Workflows → `[0xDSI] Setup` → failed task; fix and re-run (setup is idempotent) |
| `[!!] Function: …` warning | The table it reads is missing | Re-run setup, then re-run the installer |
| `[!!]` on warehouse `CAN_USE` grant | You lack `CAN_MANAGE` on the warehouse | Grant the app's service principal `CAN_USE` in SQL Warehouses → Permissions |
| App page blank | UI build missing from upload | Re-run installer (it rebuilds `app/dist`) |
| App: 403 on actions | Your email not in admin/analyst list | Re-run with `SOC_ADMIN_EMAILS` / `SOC_ANALYST_EMAILS` set |
| `/ready` returns 503 | Warehouse starting or slow | Wait; this is intentional |
| GraphFrames job fails | Runtime/library mismatch | Validate `graphframes_maven` against DBR 15.4 |
| A stream reprocesses everything | Checkpoint reset | Checkpoints now live in the `checkpoints` volume in every environment; don't delete it |

---

## 10. Gap register — what is still needed for 100%

### 10.1 Fixed in this revision

| ID | Was | Now |
|----|-----|-----|
| B1 | Installer built the UI from the parent folder | Builds inside `app/` |
| B2 | Installer created narrow placeholder tables (`alerts`, `asset_registry`, …) | Removed; tables come only from setup |
| B3 | `data` / `landing` volumes never created | Created by installer and by `setup/01` |
| B4 | Nobody had analyst/admin rights in the app | Role email variables wired into the app; deploying user is admin by default |
| B5 | Bundle referenced non-existent model versions | Serving endpoints moved to an opt-in file |
| B6 | Built UI could be skipped on upload | `sync.include: app/dist/**`; source and Node files excluded instead of deleted |
| B7 | App service principal had no data access | Installer grants catalog/schema/volume rights and warehouse `CAN_USE`, then starts the app |
| G1 | Invalid Delta DDL (`DEFAULT uuid()`, `DATE(col)` partitions, defaults without feature flag) | 259 table definitions corrected; IDs now generated by writers (app backend adds them automatically) |
| G2 | Serverless pipelines also declared clusters | `clusters:` removed |
| F1 (partial) | Demo seed could run in production | Guarded by `seed_demo_data` (off in production) |
| F3 | Agent tools read tables nothing filled | Re-pointed to `ioc_entries`, `events`, `alerts`, `asset_registry`, `user_behavior_anomalies`; created after setup |
| F4 (partial) | Ops health/SLA/GC never scheduled | Scheduled; GC runs **report-only** (see 10.2) |
| F6/F7 | Unused `.env.databricks`; installer deleted `package.json` | Both removed |
| F8 | Installer used 8B, bundle 70B | One default (70B) passed to the bundle |
| — | Non-production stream checkpoints in temporary storage (lost on serverless) | All environments use the `checkpoints` volume |

### 10.2 Remaining in-repo work

| ID | Gap | What is needed |
|----|-----|----------------|
| F2 | Two disconnected ingestion paths: DLT writes `bronze_raw_events/silver_events/gold_*`; detection jobs read `events` | Choose one canonical path (e.g. feed `events` from `silver_events`, or point detectors at the DLT tables) |
| F5 | Interactive agents can't run inside Model Serving (tools need Spark) | SQL-runner seam via the SQL Warehouse; package agents as MLflow models |
| F4 (rest) | 28 notebooks still unscheduled: 11 `memory_cache`, agents 38–39, 48, 53–58, others | Schedule or mark experimental |
| F4 (GC) | Checkpoint GC deletes any file older than the window, which can corrupt streams that run less often | Make it prune only superseded offsets/commits, then switch `dry_run` to `"false"` |
| F1 (rest) | Seed uses overwrite on live tables (dev/staging) | Make seeding append-only/idempotent |
| ID-1 | Some Spark DataFrame appends may omit `id` on tables that used to default it | Audit `saveAsTable` writers; add `uuid()` ids where missing (rows still write, `id` is null) |
| F9 / REV2-24 | Deployment-integrity manifest of shipped artifacts | Clean build + SHA/config fingerprint |

### 10.3 Needs real infrastructure to prove

| ID | What | Needs |
|----|------|-------|
| LIVE-1 | First end-to-end run of this installer | A dev workspace (Section 5) |
| REV2-12/13/15 | Real ML training (Ray SLM, MC-RNN) and trained-model → serving | Ray/GPU cluster, labelled data |
| REV2-23 | True Lakebase (Postgres) and Zerobus topology | Provisioned Lakebase + Zerobus |
| REV2-02/03/06 | Calibration base rates, detector independence | Labelled outcomes from live operation |
| REV2-04/07/09/10/20/21/25/26/27/29 | Proven offline; final proof on live streams, warehouse, response targets | Live workspace + controlled response targets |

### 10.4 Definition of "100% done"
1. `./deploy.sh dev <id>` passes 5/5 health checks on a clean workspace (LIVE-1).
2. One canonical ingestion path; a file or Kafka event produces an alert with no manual SQL (F2).
3. All production-relevant notebooks scheduled; GC safe to run for real (F4).
4. At least the CISO assistant served end to end (F5, REV2-15).
5. Offline gate green **and** Section 6 automated as a live smoke test in CI.
6. All REV2 items moved to *verified* with live evidence.

---

## Appendix A — Useful commands

```bash
make help
make gate-offline                                  # offline compile + tests
make inventory                                     # refresh artifact manifest
make deploy WAREHOUSE_ID=<id>                      # same as ./deploy.sh dev <id>
databricks bundle summary -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle run <job_key> -t dev --var="warehouse_id=<WAREHOUSE_ID>"
./deploy.sh dev <WAREHOUSE_ID> --rollback          # removes jobs/app; keeps data
```

## Appendix B — Related documents
`README.md`, `ARCHITECTURE_DEEP_DIVE.md`, `docs/COVERAGE_MATRIX.md`, `docs/engineering/audit-remediation-status.md`, `docs/engineering/compute-compatibility.md`, `notebooks/memory_cache/MEMORY_CACHING_GUIDE.md`.
