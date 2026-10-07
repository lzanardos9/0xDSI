# 0xDSI Agentic SOC — Installation Manual (Zero to First Detection)

**Scope:** the `databricks-native/` folder only. Nothing outside it is required or assumed.
**Audience:** a Databricks workspace admin / platform engineer installing 0xDSI for the first time.
**Status of this document:** written from a full read of the code, bundle, deploy script and tests. The offline checks were run; **nothing here has been executed against a live Databricks workspace**. Every step that depends on live behaviour is marked as such, and every known defect is listed with a workaround and a permanent fix.

---

## 0. Read this first — honest readiness verdict

| Area | State |
|------|-------|
| Python notebooks | 174 compile cleanly (offline gate). |
| Offline tests | 41 of 42 pass. The one failure is a stale inventory file (fix: `make inventory`). |
| App screens (frontend) | Builds cleanly from `app/` on its own. |
| Bundle definition | 102 jobs + 2 pipelines + 1 app; every referenced notebook exists. |
| One-command installer (`deploy.sh`) | **Does not work when only `databricks-native/` is present** (it builds the frontend from the parent folder). Use the manual path in this guide. |
| Table setup (`setup/01`) | **Probable blocker**: uses table definitions Databricks Delta is very likely to reject (see Gap G1). Must be verified/fixed on first run. |
| First real detection | Achievable today by following Section 9, after applying the workarounds in Section 5. |
| "100% production" | Not yet. See the gap register in Section 13: 6 install blockers, 9 functional gaps, 4 items that need real infrastructure to verify. |

Bottom line: you **can** go from zero to a real, pipeline-produced detection with this guide, but only by applying the listed workarounds. The one-command installer and an unattended production rollout need the repository fixes in Section 13 first.

---

## 1. What gets installed

```
 Sources (Kafka / Event Hubs / Kinesis / files in a Volume)
        │
        ▼
 Ingestion jobs ──► events (Delta)          DLT pipeline: bronze_raw_events → silver_* → gold_*
        │                                    (separate path, see Gap F2)
        ▼
 Detection jobs (threat-intel match, behavioral anomaly, SLM classifier, formula scoring)
        │
        ▼
 alerts (Delta) ──► correlation / fuse / dedup ──► cases ──► response (governed, approval-bound)
        │
        ▼
 Databricks App "0xdsi-agentic-soc" (FastAPI backend + React UI) via a SQL Warehouse
```

Installed objects (dev target):

| Object | Name |
|--------|------|
| Catalog / schema | `soc_platform_dev.agentic_soc` (staging: `soc_platform_staging`, prod: `soc_platform`) |
| Volumes | `models, checkpoints, artifacts, exports, quarantine` (+ `data`, `landing` — you must add these, Gap B3) |
| Tables | ~172 created by `notebooks/setup/01_create_catalog_schema.py` |
| Jobs | 102 (`resources/jobs.yml`), ~10 of them continuous |
| Pipelines | `bronze_silver_gold`, `attack_universe_realtime` (`resources/pipelines.yml`) |
| App | `0xdsi-agentic-soc` (`resources/app.yml`) |
| Secret scope | `soc-secrets` |
| Vector Search endpoint | `0xdsi-vector-search` |

---

## 2. Prerequisites

### 2.1 Workspace capabilities (must all be enabled)

| Capability | Why |
|-----------|-----|
| Unity Catalog (metastore attached) | All tables, volumes, functions, models |
| Serverless jobs compute (environment v2) | Most jobs run serverless |
| Classic job clusters (DBR 15.4 LTS) | GraphFrames trend engine and long-running streams |
| Serverless or Pro SQL Warehouse | The App reads everything through it |
| Databricks Apps | Hosts the UI/API |
| Foundation Model APIs | Agents and narratives (LLM + embeddings) |
| Vector Search | Memory / similarity agents |
| Delta Live Tables (serverless) | Medallion pipeline |

### 2.2 Your permissions

Metastore privilege to `CREATE CATALOG`, workspace admin (to create groups, secret scopes, apps, serving and vector endpoints), `CAN_USE` on the SQL Warehouse.

### 2.3 Local tools

| Tool | Version |
|------|---------|
| Databricks CLI | ≥ 0.220 (script tested against 0.299.x) |
| Python | 3.11+ (CI uses 3.13) with `pyyaml numpy scipy` for offline checks |
| Node.js / npm | ≥ 20 |
| make, bash | any recent |

### 2.4 Model endpoints — verify names before installing

Defaults referenced by the bundle:

| Purpose | Default name |
|---------|--------------|
| Primary LLM | `databricks-meta-llama-3-1-70b-instruct` |
| Fallback LLM | `databricks-meta-llama-3-1-8b-instruct` |
| Embeddings | `databricks-bge-large-en` |

Databricks retires older Foundation Models over time. Open **Serving** in the workspace and confirm these exist; if not, pick current equivalents and pass them as variables (Section 6). Note the deploy script defaults the primary to the 8B model while the bundle defaults to 70B — choose one deliberately.

---

## 3. Step 1 — Get the code and verify it offline

```bash
cd databricks-native
pip install pyyaml numpy scipy
make inventory        # regenerates docs/engineering/artifact-manifest.json (fixes the one stale test)
make gate-offline     # expect: notebooks compiled 174 (0 failed), all test files pass
```

Expected result: `OFFLINE GATE: PASS`. If anything else fails, stop and fix before deploying.

---

## 4. Step 2 — Authenticate and prepare the workspace

```bash
databricks auth login --host https://<your-workspace-url>
databricks current-user me            # must succeed
```

### 4.1 Groups (the bundle grants permissions to these — deploy fails if they don't exist)

Create in **Settings → Identity and access → Groups**: `soc_admins`, `soc_analysts`, `soc_viewers`. Add yourself to `soc_admins`.

### 4.2 SQL Warehouse

Create (or reuse) a Serverless SQL Warehouse. Copy its **ID** (from the connection details). Referred to below as `<WAREHOUSE_ID>`.

---

## 5. Step 3 — Apply required workarounds (known blockers)

These are defects found in the code. Each has a **workaround for this install** and a **permanent fix** (tracked in Section 13).

### B1 — Installer builds the wrong frontend
`deploy.sh` step 9 runs `npm run build` in the **parent** of `databricks-native/`. With only this folder, it fails with "dist/index.html not found".
**Workaround:** do not use `deploy.sh`; follow this manual (bundle-first path).

### B2 — Slim placeholder `alerts` table blocks detections
`deploy.sh` pre-creates `alerts` with 10 columns. Because setup uses `CREATE TABLE IF NOT EXISTS`, the full 21-column table is never created, and the detection writers (`MERGE … INSERT *` with `description`, `status`, `confidence_score`) fail.
**Workaround:** the manual path does not create placeholders. If `deploy.sh` was already run, add the missing columns:
```sql
ALTER TABLE soc_platform_dev.agentic_soc.alerts ADD COLUMNS (
  description STRING, status STRING, rule_id STRING, rule_name STRING,
  event_ids ARRAY<STRING>, assigned_to STRING, confidence_score DOUBLE,
  risk_score INT, first_seen TIMESTAMP, last_seen TIMESTAMP,
  resolved_at TIMESTAMP, resolution_notes STRING, false_positive BOOLEAN,
  tags ARRAY<STRING>
);
```

### B3 — Landing volumes are never created
File ingestion reads `/Volumes/<catalog>/agentic_soc/data/landing/<topic>/` (jobs) and `/Volumes/<catalog>/agentic_soc/landing/events/` (DLT pipeline). Neither the `data` nor `landing` volume is created by anything.
**Workaround:** created in Section 6.1.

### B4 — Nobody is an analyst or admin inside the app
The app grants roles only from the `SOC_ADMIN_EMAILS` / `SOC_ANALYST_EMAILS` settings, which nothing sets. Result: every user is a viewer; sensitive reads, approvals and agent tools are refused (by design, fail-closed).
**Workaround:** edit `resources/app.yml`, under `env:` add:
```yaml
          - name: SOC_ADMIN_EMAILS
            value: "you@company.com"
          - name: SOC_ANALYST_EMAILS
            value: "analyst1@company.com,analyst2@company.com"
```

### B5 — Bundle references model versions that don't exist
`resources/app.yml` declares 6 Model Serving endpoints pointing at version `1` of registered models that are only placeholders. `bundle deploy` fails.
**Workaround:** temporarily remove the whole `model_serving_endpoints:` block from `resources/app.yml` (keep a copy). The app uses the Foundation Model endpoints directly, so nothing in the detection path depends on these.

### B6 — Built screens may be skipped on upload
The bundle uploader skips git-ignored files. If `databricks-native/` sits inside a git repo whose ignore file lists `dist`, `app/dist` will not be uploaded and the app serves a blank page.
**Workaround:** add to `databricks.yml`:
```yaml
sync:
  include:
    - app/dist/**
```

---

## 6. Step 4 — Create the foundation objects

Run in the **SQL editor** on your warehouse (dev catalog shown):

### 6.1 Catalog, schema, volumes
```sql
CREATE CATALOG IF NOT EXISTS soc_platform_dev;
CREATE SCHEMA  IF NOT EXISTS soc_platform_dev.agentic_soc;
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.models;
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.checkpoints;
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.artifacts;
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.exports;
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.quarantine;
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.data;      -- B3
CREATE VOLUME  IF NOT EXISTS soc_platform_dev.agentic_soc.landing;   -- B3
```

### 6.2 Secret scope
```bash
databricks secrets create-scope soc-secrets
databricks secrets put-secret soc-secrets catalog      --string-value soc_platform_dev
databricks secrets put-secret soc-secrets schema       --string-value agentic_soc
databricks secrets put-secret soc-secrets warehouse_id --string-value <WAREHOUSE_ID>
```
Source and integration secrets are optional for first detection (Section 10 lists them). With no Kafka secret, detection jobs fall back to reading the `events` table — that is what Section 9 uses.

### 6.3 Vector Search endpoint (optional for first detection)
```bash
databricks api post /api/2.0/vector-search/endpoints \
  --json '{"name":"0xdsi-vector-search","endpoint_type":"STANDARD"}'
```

---

## 7. Step 5 — Build and deploy the bundle

```bash
cd databricks-native/app
npm ci
VITE_DATABRICKS_MODE=true npm run build      # output: app/dist/
cd ..

databricks bundle validate -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle deploy   -t dev --var="warehouse_id=<WAREHOUSE_ID>"
```

Optional overrides (if model names differ, Section 2.4):
`--var="llm_endpoint=<name>" --var="llm_fallback_endpoint=<name>" --var="embedding_endpoint=<name>"`
Non-AWS workspaces must also override `classic_node_type_id` (e.g. `Standard_D8ds_v5` on Azure, `n2-standard-8` on GCP).

**About `app/package.json`:** the deploy script deletes it before upload so the Apps runtime does not attempt its own Node build. If the app fails to start with a Node/npm error, move `package.json` and `package-lock.json` out of `app/` before deploying and restore them afterwards. (Permanent fix: Gap F7.)

**If validation rejects the pipelines** (they set `serverless: true` *and* a `clusters:` block): remove the `clusters:` block from both pipelines in `resources/pipelines.yml`. (Unverified — Gap G2.)

**Development mode behaviour:** the `dev` target pauses all schedules and continuous jobs and prefixes names with `[dev <you>]`. Nothing runs on its own — you trigger each step (that is what this guide does). Staging/production run everything automatically (Section 11).

---

## 8. Step 6 — Create tables and seed data

```bash
databricks bundle run initial_setup -t dev --var="warehouse_id=<WAREHOUSE_ID>"
```
This runs four tasks: create ~172 tables → seed demo data → register model namespaces → seed the correlation rule library.

> **Expected risk — Gap G1.** The table-setup notebook contains 13 tables partitioned by expressions such as `DATE(timestamp)` and ~700 column `DEFAULT` values without enabling the column-defaults table feature. Delta normally rejects both. If `create_tables` fails with a partitioning or "DEFAULT not supported" error, apply the fix in Section 13 (G1) and re-run. This is the most likely point of failure in the whole install.

Verify:
```sql
USE soc_platform_dev.agentic_soc;
SHOW TABLES;                                  -- expect ~170+
SELECT COUNT(*) FROM events;                  -- ~500 seeded
SELECT COUNT(*) FROM alerts;                  -- seeded demo alerts
SELECT COUNT(*) FROM ioc_entries;             -- 100 seeded indicators
DESCRIBE alerts;                              -- must include description, status, confidence_score
```

Important: the seeded alerts are **demo data, not detections**. Section 9 produces a real one.

---

## 9. Step 7 — First real detection (end to end)

Goal: a known-bad IP appears in an event, the threat-intel detection job matches it, and a new alert is written by the pipeline (not by the seed).

### 9.1 Add a known-bad indicator
```sql
INSERT INTO soc_platform_dev.agentic_soc.ioc_entries
  (id, indicator_type, value, threat_type, confidence, source, first_seen, last_seen)
VALUES
  (uuid(), 'ip', '203.0.113.66', 'c2', 0.95, 'install-test', current_timestamp(), current_timestamp());
```
(`203.0.113.0/24` is a documentation range — safe to use.)

### 9.2 Produce an event that touches it

**Path A — fastest (direct to the events table):**
```sql
INSERT INTO soc_platform_dev.agentic_soc.events
  (id, timestamp, event_type, source, source_ip, dest_ip, user_id, username,
   hostname, action, outcome, severity, raw_log)
VALUES
  (uuid(), current_timestamp(), 'network_connection', 'install-test',
   '10.0.5.20', '203.0.113.66', 'jdoe', 'jdoe', 'WS-042',
   'connect', 'success', 'info', 'install test outbound connection');
```

**Path B — full ingestion (file → Auto Loader → events):**
1. Create a file `test1.json` (one JSON object per line):
   ```json
   {"event_type":"network_connection","timestamp":"2026-10-07T12:00:00Z","source":"install-test","source_ip":"10.0.5.20","dest_ip":"203.0.113.66","username":"jdoe","hostname":"WS-042","action":"connect","outcome":"success","severity":"info"}
   ```
2. Upload it to `/Volumes/soc_platform_dev/agentic_soc/data/landing/security-events/` (Catalog Explorer → Volumes → Upload).
3. Open the deployed notebook `notebooks/ingestion/01_raw_event_ingestion` in the bundle folder, attach serverless compute, set widgets: `catalog=soc_platform_dev`, `source_type=autoloader`, `topics=security-events`, `trigger_interval=availableNow`. Run all.
4. Confirm: `SELECT * FROM events WHERE source='install-test'`. Also check `ingestion_accounting` — the latest row must show `balanced = true`.

### 9.3 Run the detection
```bash
databricks bundle run threat_intel_matching -t dev --var="warehouse_id=<WAREHOUSE_ID>"
```
The job has no Kafka secret, so it logs a fallback to the Delta `events` table and processes everything available, then stops.

### 9.4 See the detection
```sql
SELECT id, title, severity, status, source, confidence_score, created_at
FROM soc_platform_dev.agentic_soc.alerts
WHERE source = 'threat_intel_matching'
ORDER BY created_at DESC;
```
Expected: an alert for `203.0.113.66`, severity **critical** (confidence ≥ 0.9), status `new`. The underlying match is in `threat_intel_matches`.

### 9.5 Carry it through triage and casework (optional)
```bash
databricks bundle run triage_agent     -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle run case_management  -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle run soc_core_pipeline -t dev --var="warehouse_id=<WAREHOUSE_ID>"   # anomaly + SLM + priority
```
Check `agent_triage_results`, `cases`, `formula_priority_scores`.

### 9.6 See it in the app
1. **Compute → Apps → 0xdsi-agentic-soc** → Start (if stopped).
2. Grant the app's **service principal** (shown on the app page) access — the deploy grants groups, not the app (Gap B7):
   ```sql
   GRANT USE CATALOG ON CATALOG soc_platform_dev TO `<app-service-principal-id>`;
   GRANT USE SCHEMA, SELECT, MODIFY, EXECUTE ON SCHEMA soc_platform_dev.agentic_soc TO `<app-service-principal-id>`;
   ```
   and give it **CAN_USE** on the SQL Warehouse.
3. Open the app URL. Check `/ready` returns ready (it returns "not ready" until the warehouse answers a test query in time — by design).
4. The new critical alert appears in the alerts view.

**You have reached first detection.**

---

## 10. Step 8 — Connect real data and intelligence

### 10.1 Event sources (pick one)
| Source | Secrets in `soc-secrets` | Job parameter `source_type` |
|--------|--------------------------|-----------------------------|
| Kafka / Confluent | `kafka_brokers`, `kafka_sasl_username`, `kafka_sasl_password` | `kafka` (default) |
| Azure Event Hubs | `eventhub_connection` | `eventhub` |
| AWS Kinesis | `kinesis_access_key`, `kinesis_secret_key` | `kinesis` |
| Files in a Volume | none | `autoloader` |

Events must carry at least `event_type`; recognised fields are listed in `01_raw_event_ingestion.py` (`EVENT_SCHEMA`). Unparseable records go to quarantine and are counted, not dropped.

### 10.2 Threat intelligence feeds
`virustotal_api_key`, `abuseipdb_api_key`, `otx_api_key`, `misp_url`, `misp_api_key` (optional: `greynoise_api_key`, `shodan_api_key`). Run `threat_feed_ingestion`.

### 10.3 Notifications, ticketing, response targets
`slack_webhook_url`, `teams_webhook_url`, `pagerduty_api_key`, `servicenow_*`, `jira_*`, `crowdstrike_client_id/secret`. Response actions always require approval by a different person and are bound to a confirmed finding revision.

Remove the demo data before production: the seed **overwrites** `events`, `alerts`, `cases`, `ioc_entries`, `user_profiles` and others. Never re-run `initial_setup` against a production catalog with real data.

---

## 11. Step 9 — Staging and production

```bash
databricks bundle deploy -t staging    --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle deploy -t production --var="warehouse_id=<WAREHOUSE_ID>"
```
- In staging/production, **all 102 jobs and both pipelines start on their schedules immediately**, including ~10 continuous streaming jobs and 2 continuous serverless pipelines. Budget accordingly; pause what you don't need.
- Run `initial_setup` **once, before** any streaming job starts (seed overwrites tables that streams read). In production, run only the `create_tables` and `seed_correlation_rules_library` tasks — skip demo seeding.
- Set the permanent `SOC_ADMIN_EMAILS` / `SOC_ANALYST_EMAILS` values (B4) for each target.

---

## 12. Troubleshooting

| Symptom | Cause | Action |
|---------|-------|--------|
| `bundle validate`: no value for `warehouse_id` | Variable has no default | Always pass `--var="warehouse_id=…"` (the `make deploy-*` targets don't) |
| `bundle deploy` fails on serving endpoints | B5 | Remove `model_serving_endpoints` block |
| Deploy fails on permissions / group not found | 4.1 skipped | Create `soc_admins`, `soc_analysts` |
| `create_tables` fails on partitioning or DEFAULT | G1 | Apply G1 fix, re-run |
| Detection job: cannot resolve `description`/`status` | B2 | `ALTER TABLE alerts ADD COLUMNS …` |
| Auto Loader: path does not exist | B3 | Create `data` / `landing` volumes |
| App: blank page | B6, or build skipped | Add `sync.include`, rebuild `app/dist` |
| App: 403 on everything useful | B4 | Set role email lists |
| App: data calls fail / permission denied | B7 | Grant the app service principal |
| `/ready` returns 503 | Warehouse starting or slow | Wait for warehouse; this is intentional |
| Agent chat tools return empty results | F3 | Known gap: tools read tables nothing fills |
| GraphFrames job fails | Runtime/library mismatch | Validate `graphframes_maven` against DBR 15.4 |

---

## 13. Gap register — what is needed to reach 100%

### 13.1 Install blockers (fix in this repository)

| ID | Gap | Permanent fix |
|----|-----|---------------|
| B1 | `deploy.sh` builds the frontend from the parent folder | Build in `app/` (`cd "$SCRIPT_DIR/app" && npm ci && npm run build`); drop the copy from `$PROJECT_ROOT/dist` |
| B2 | Placeholder `alerts` (and `asset_registry`, `agent_configs`) created by `deploy.sh` with a narrower schema than setup | Remove placeholder creation; create tables only from `setup/01` |
| B3 | `data` and `landing` volumes never created | Add both to `deploy.sh` step 4 and/or `setup/01` |
| B4 | Role allowlists never configured | Add `SOC_ADMIN_EMAILS` / `SOC_ANALYST_EMAILS` as bundle variables wired into `resources/app.yml` |
| B5 | Serving endpoints reference non-existent model versions | Move endpoints into an opt-in target, or create them from `setup/04` after real models exist |
| B6 | `app/dist` can be excluded from upload by git ignore rules | Add `sync.include: [app/dist/**]` to `databricks.yml` |
| B7 | App service principal never granted catalog/warehouse access | Add `resources` grants for the app principal (or SQL grants in deploy) |

### 13.2 Probable blockers — need first live run to confirm

| ID | Gap | Fix |
|----|-----|-----|
| G1 | 13 tables use `PARTITIONED BY (… DATE(col))` and ~700 `DEFAULT` values without `'delta.feature.allowColumnDefaults'='supported'` | Replace expression partitions with generated date columns (`event_date DATE GENERATED ALWAYS AS (CAST(timestamp AS DATE))`) or liquid clustering; add the column-defaults table property to every table that uses `DEFAULT` |
| G2 | Pipelines declare `serverless: true` together with a `clusters:` block | Remove `clusters:` from serverless pipelines |

### 13.3 Functional gaps (in-repo work)

| ID | Gap | Fix |
|----|-----|-----|
| F1 | Seed notebook uses `mode("overwrite")` on live tables, can strip schema-defined columns and disrupts streaming readers | Make seeding append-only/idempotent and dev-only; never in production |
| F2 | Two disconnected ingestion paths: DLT writes `bronze_raw_events/silver_events/gold_*`; detection jobs read `events` | Pick one canonical path; feed `events` from `silver_events` or point detectors at the DLT tables |
| F3 | Agent tool functions (`lookup_ioc`, `search_events`, `query_user_behavior`) read `ioc_indicators`, `events_silver`, `user_behavior_analytics` — nothing populates them | Re-point functions at `ioc_entries`, `events`, `user_behavior_anomalies`; create them in `setup/01` instead of `deploy.sh` |
| F4 | 31 notebooks never scheduled, including `ops/02_health_check`, `ops/03_sla_alerting`, `ops/01_checkpoint_gc`, all 11 `memory_cache` notebooks, phishing / shadow-AI / AI-gateway agents (53–58), session/active list managers (38–39), UEBA onboarding (48) | Add jobs (ops ones are essential for production), or mark the rest as manual/experimental |
| F5 | Interactive agents cannot run inside Model Serving (tool execution needs a Spark session) | Add a SQL-runner seam backed by the SQL Warehouse; package real agents as MLflow models (see `compute-compatibility.md`) |
| F6 | `.env.databricks` written by `deploy.sh` is never read by the app | Remove it, or load it in the backend; keep `app.yml` as the single source |
| F7 | `deploy.sh` deletes `app/package.json` and lockfile from the source tree | Exclude them from upload via bundle `sync.exclude` instead of deleting |
| F8 | Primary model default differs (deploy 8B vs bundle 70B); model names may be retired | One source of truth for endpoints; validate existence in pre-flight and fail clearly |
| F9 | Deployment integrity manifest (audit item REV2-24) still open | Clean build + SHA/config fingerprint manifest of shipped artifacts |

### 13.4 Verification gaps — need real infrastructure (from `audit-remediation-status.md`)

| ID | What | Needs |
|----|------|-------|
| REV2-12/13/15 | Real ML training (Ray SLM, MC-RNN) and trained-model → serving chain | Ray/GPU cluster, labelled data |
| REV2-23 | True Lakebase (Postgres) and Zerobus topology | Provisioned Lakebase + Zerobus |
| REV2-02/03/06 | Calibration base rates and detector independence groups | Labelled outcomes from live operation |
| REV2-04/07/09/10/20/21/25/26/27/29 | Code landed and proven offline; final proof on live streams, warehouse, response targets | A live workspace and controlled response targets |

### 13.5 Definition of "100% done"

1. `./deploy.sh dev <id>` succeeds from a clean workspace with only `databricks-native/` present (B1–B7 fixed).
2. `initial_setup` completes with no manual edits (G1, G2 fixed).
3. One canonical ingestion path; a file or Kafka event produces an alert with no manual SQL (F2).
4. Agent tools return real data (F3); ops health/SLA/GC jobs scheduled (F4).
5. At least the CISO assistant runs as a served model end to end (F5, REV2-15).
6. Offline gate green **and** a live smoke test (Section 9 automated) green in CI against a dev workspace.
7. All REV2 items moved from *partial / blocked* to *verified* with live evidence.

---

## Appendix A — Useful commands

```bash
make help                 # all make targets
make gate-offline         # offline compile + tests
make inventory            # refresh artifact manifest
databricks bundle summary -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle run <job_key> -t dev --var="warehouse_id=<WAREHOUSE_ID>"
databricks bundle destroy -t dev --var="warehouse_id=<WAREHOUSE_ID>"   # removes jobs/app; keeps tables
```

## Appendix B — Related documents

`README.md`, `ARCHITECTURE_DEEP_DIVE.md`, `docs/COVERAGE_MATRIX.md`, `docs/engineering/audit-remediation-status.md`, `docs/engineering/compute-compatibility.md`, `notebooks/memory_cache/MEMORY_CACHING_GUIDE.md`.
