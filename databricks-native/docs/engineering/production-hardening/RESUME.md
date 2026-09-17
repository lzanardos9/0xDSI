# RESUME

Branch: current working tree (no git in this environment; do not reset to the
audited baseline).

## Gate B — recoverable detection path (this session)
- **H-030 FIXED (offline)** — reframed threat-intel match->alert as a durable
  obligation. New pure, importable `notebooks/_shared/ti_recovery.py`
  (deterministic match/alert ids + 4-step reconciler: MERGE match, read
  un-alerted findings, MERGE alert, mark last). Rewrote
  `notebooks/detection/02_threat_intel_matching.py` to mirror it (MERGE both
  tables, `alert_emitted` flag, dropped the presence-based left-anti that
  suppressed crash survivors). Fault-injection regression
  `tests/property/test_ti_recovery.py` (7 tests) + source contract
  `tests/contract/test_idempotent_persistence.py` (4 tests).
- **B3 (H-010 strengthened)** — added shared `notebooks/_shared/event_identity.py`
  (`derive_event_id`), wired Bronze ingestion + realtime SDP onto it, switched
  Bronze event persistence to an idempotent MERGE on the stable id. Regression
  `tests/property/test_event_identity.py` (7 tests, functional pyspark-fn fake
  pins the exact hash basis).
- **B8 (H-004 + new H-080)** — replaced the hardcoded `processingTime="30
  seconds"` trigger in threat-intel with a widget-driven `_resolve_trigger`
  (defaults to serverless-safe `availableNow`). Broadened
  `tests/contract/test_serverless_notebook_apis.py` to flag processingTime
  triggers and cache/persist/unpersist; this surfaced **H-080**: 12 more
  serverless-declared notebooks using classic-only APIs — tracked BLOCKED
  (deferred to Gate A), allowlisted with a rot guard. threat-intel is NOT
  allowlisted (stays green).
- **B7 (H-060 fully closed)** — `log_complete` no longer hardcodes "healthy";
  status now derives from the worst severity logged (survives flushes) plus an
  optional coverage/override in details. Extended
  `tests/property/test_monitor_health.py` (8 tests).
- **B4 (H-020 closed)** — closed the CEP->UEO canonical boundary. The
  `cep_pattern_matches` table had three disagreeing shapes and the producer
  dropped `event_ids`/MITRE at the boundary. Added
  `contracts.CEP_PATTERN_MATCH_COLUMNS`/`CEP_LINEAGE_FIELDS` as the single
  source of truth; the producer (`01_streaming_correlation_engine.py`) now
  preserves lineage/MITRE; the setup DDL matches; and the UEO CEP lens now
  reads `event_ids` (was a nonexistent `matched_events`) and carries MITRE into
  the explanation. Regression `tests/contract/test_cep_signal_contract.py`
  (5 tests).
- **B6 (H-050 closed)** — proved the revision fencing chain end to end. The
  thread was severed: `fuse_results` had no revision column and
  `confluence_verdicts` kept only `entity_id`. Added `finding_id`+`revision` to
  `fuse_results` with a revision-scoped `fuse_id`, and `ueo_id`/`finding_id`/
  `revision` to `confluence_verdicts` (fuse-aware builder populates them, legacy
  signal-only builder leaves them NULL). The approval layer was already
  revision-bound; the thread now reaches it. Regression
  `tests/contract/test_revision_thread.py` (6 tests: source continuity + a
  behavioural stale-approval refusal).
- Offline suite: **32/32 test files pass.** Frontend build passes.
- Gates A/C/D deferred per "do gate b first". All live/workspace validation
  remains BLOCKED.

## Completed earlier this session
- Phase 0 baseline started: mapped the bundle (`databricks.yml`,
  `resources/jobs.yml` — 40+ jobs incl. `soc_core_pipeline`, `pipelines.yml`,
  `app.yml`).
- Phase 1: reproduced and fixed **H-001** (malformed `name`/`schedule` at
  `resources/jobs.yml:187`); confirmed no duplicate keys (H-002) and all 133
  notebook paths resolve (H-003).
- Added regression `tests/contract/test_bundle_config.py` (parse, duplicate-key,
  path existence, plus a stdlib-only guard for the exact H-001 shape).
- Phase 1 (finish): ran a deployment-aware serverless audit — mapped serverless
  jobs (`environment_version` set) to the notebooks they deploy, scanned those
  files, and found **H-004**: four deployed serverless notebooks using
  serverless-incompatible Spark APIs. Fixed the three `sparkContext.broadcast`
  cases with closure capture (`streaming_correlation_engine.py`,
  `temporal_window_correlator.py`, `graph_neighborhood_embeddings.py`);
  `analytics/01_trend_engine_cet.py` (GraphFrames + `setCheckpointDir`) needs
  classic compute and is tracked BLOCKED. Added regression
  `tests/contract/test_serverless_notebook_apis.py` (2 tests pass; blocked
  notebook allowlisted with a rot guard).
- Recorded PLAN / FINDINGS / VALIDATION.
- Phase 6 (**H-060**): confirmed and fixed a live durable-health defect —
  `Monitor.report_health` used `self._cfg` (real attr is `self._config`), so it
  always threw and a bare `except: pass` hid it; health was never written.
  Fixed the attribute + replaced the silent swallow with `logger.exception`.
  Regression `tests/property/test_monitor_health.py` (3 tests) imports the real
  module via an import-boundary pyspark shim.
- Phase 7 (**H-070**): added the permanent regression
  `tests/security/test_tool_arg_validation.py` (8 tests) against the real
  `BaseAgent` validators.
- Phase 1 (**H-005**): verified the setup notebooks are already idempotent
  upgrades (all `CREATE TABLE IF NOT EXISTS`, additive `ALTER ... ADD COLUMNS IF
  NOT EXISTS`, no `DROP`/`CREATE OR REPLACE TABLE`); added guard
  `tests/contract/test_migration_idempotency.py` (4 tests). No parallel migration
  hierarchy added.
- `npm run build` passes.

## Next exact steps (all require a Databricks workspace — BLOCKED offline)
1. Phase 1 residual (BLOCKED): migrate `trend_engine_cet` from serverless to a
   classic job cluster with the GraphFrames Maven library, then validate in
   staging. No in-repo cluster pattern exists to copy and node types / Spark
   version / Maven coords are cloud-specific; do not author blind.
2. Phase 4 (**H-030**, FIXED_STATIC): the durable obligation is proven offline
   via `tests/property/test_ti_recovery.py`; a live workspace run of the
   streaming detector is the remaining confidence step.
3. All `databricks bundle validate` / job-start / streaming / E2E live gates.

## Blockers
- No Databricks workspace: `databricks bundle validate` and all live/staging
  gates are BLOCKED. Do not report them as passed.
- PyYAML must be available wherever the bundle-config test runs (CI: add to the
  offline test job's deps).

## Recommendation
`OFFLINE_VERIFIED_ONLY`. Offline-verifiable defects (H-001, H-004 broadcast
cases, H-020, H-030, H-050, H-060, H-070) are fixed with regressions; the
`trend_engine_cet` compute migration and H-080 (12 serverless-incompatible
notebooks) are truthfully BLOCKED pending a workspace.
