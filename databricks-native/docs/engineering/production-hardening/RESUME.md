# RESUME

Branch: current working tree (no git in this environment; do not reset to the
audited baseline).

## Gate A — serverless compatibility (this session)
- **H-080 + H-004 residual (FIXED_STATIC)** — reconciled every notebook's Spark
  API usage with the compute its job actually runs on. Seven always-on
  continuous streaming jobs (`enrichment_pipeline`, `kafka_ingestion`,
  `temporal_window_correlator`, `realtime_graph_cep`, `typed_bronze_partitioner`,
  `lakebase_sync_streaming`, `ot_protocol_ingestion`) plus the GraphFrames
  `trend_engine_cet` were moved from serverless to **classic job clusters** in
  `resources/jobs.yml` (`job_clusters` + `new_cluster`, `data_security_mode:
  SINGLE_USER`, runtime/node type from new `classic_spark_version` /
  `classic_node_type_id` / `graphframes_maven` bundle variables, pip deps
  re-declared as task `libraries`) — there continuous `processingTime` streaming,
  `cache/persist`, RDD checkpointing and JVM libraries are all supported.
- The serverless-scheduled notebooks were instead made serverless-safe:
  `graph_correlation` and `graph_neighborhood_embeddings` had all
  `.cache()`/`.unpersist()` removed; `supply_chain_risk`, `cloud_posture`,
  `detection_confluence` and `lakebase_sync` had hardcoded
  `.trigger(processingTime=...)` replaced with a shared `resolve_stream_trigger()`
  helper added to `_shared/delta_helpers.py` (and routed the previously-
  `processingTime` `streaming_append`/`streaming_foreach_batch` writers through
  it, default `availableNow`), exported via `bootstrap`.
- `KNOWN_BLOCKED` in `tests/contract/test_serverless_notebook_apis.py` is now
  **empty**; with PyYAML present both contract tests pass and the serverless set
  (95 notebooks) has zero offenders. **Still BLOCKED:** the live
  `databricks bundle validate` + a run on classic and serverless compute, and
  confirming the classic node types / GraphFrames coordinate for the target cloud.

## Gate C — detector semantics + Gate D — offline evidence/CI (this session)
- **Gate C (H-040, FIXED_STATIC)** — audited the statistical/ML detectors and
  fixed five clear defects, extracting the corrected math into the pure,
  importable `notebooks/_shared/detector_semantics.py` (mirrors `calibration.py`):
  Isolation-Forest sign bug (F2), inverted uniform beacon test (F4), asymmetric
  KS-recall similarity -> Jaccard (F6, threshold default 0.72->0.4, flag for live
  re-tuning), unclamped Monte-Carlo probability (F7), and the negative-correlation
  empty-window liveness gate (F9). Regression
  `tests/property/test_detector_semantics.py` (14 tests). Four operating-point
  issues (self-contaminated UEBA baseline, daily-vs-window scale mismatch,
  circular 'KS validation', cross-window reuse_ratio/Kleene depth) are recorded,
  deferred to a workspace-backed pass rather than tuned blind.
- **Gate D (H-100, VERIFIED_OFFLINE)** — made the offline evidence reproducible.
  New `tools/ci/run_offline_gate.py` (py_compile over all 163 notebooks + every
  `tests/**/test_*.py`), wired into `.github/workflows/offline-gate.yml` and a
  `make gate-offline` target, plus `RELEASE_EVIDENCE.md`. The syntax layer
  immediately caught a real latent regression: `10_fuse_engine.py` had an
  unmatched parenthesis from the B6 revision-column edit (the frontend build and
  source-extraction tests never import notebooks, so it had slipped through) —
  fixed.
- Offline gate: **163 notebooks compile, 33/33 test files pass.** Frontend build
  passes. Gate A + all live/workspace validation remain BLOCKED.

## Gate B — recoverable detection path (earlier this session)
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
1. Gate A live validation (BLOCKED): run `databricks bundle validate`, then start
   the classic streaming jobs and confirm the `classic_spark_version` /
   `classic_node_type_id` values and the `graphframes_maven` coordinate resolve on
   the target cloud; confirm the serverless-scheduled notebooks drain correctly
   under `availableNow`.
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
`OFFLINE_VERIFIED_ONLY`. Offline-verifiable defects (H-001, H-004, H-020, H-030,
H-050, H-060, H-070, H-080) are fixed with regressions; the Gate A serverless->
classic migration is code-complete and offline-verified, with only the live
`databricks bundle validate` + staging run on classic/serverless compute truthfully
BLOCKED pending an authorized workspace.
