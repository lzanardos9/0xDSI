# VALIDATION

Runtime: offline sandbox, `python3` 3.13, no Databricks workspace attached.
Workspace/bundle/staging validation is **BLOCKED** (no authorized target); those
gates are not claimed as passed.

PyYAML is not stdlib; installed locally for config parsing
(`pip install --break-system-packages pyyaml` → 6.0.3).

## Gate C + D — detector semantics & reproducible offline gate

The whole offline gate is now one command:
```
python3 tools/ci/run_offline_gate.py
# notebooks compiled : 163 (0 failed)
# test files         : 33 (33 passed, 0 failed)
# OFFLINE GATE       : PASS
```
It runs `py_compile` over every notebook plus every `tests/**/test_*.py`, and is
wired into `.github/workflows/offline-gate.yml` and `make gate-offline`. The
syntax layer caught a real latent regression (`10_fuse_engine.py` unmatched
parenthesis from the B6 edit) that the frontend build and source-extraction
tests could not see.

Gate C detector-semantics regression:
```
python3 tests/property/test_detector_semantics.py   # 14 passed
```
Proves the fixed math (Isolation-Forest sign, beacon regularity vs the inverted
uniform test, Jaccard vs containment, probability clamp) and that each host
notebook delegates to `_shared/detector_semantics.py` with the defective path
removed. The KS-recall threshold moved 0.72->0.4 for Jaccard's scale — flagged
in `RELEASE_EVIDENCE.md` for live re-tuning. Full gate status table lives in
`RELEASE_EVIDENCE.md`.

## Gate B — recoverable detection path

Offline suite (all script-style; run each directly): **32/32 test files pass.**

Key Gate B regressions:
```
python3 tests/property/test_ti_recovery.py            # 7 passed  (H-030 fault injection)
python3 tests/contract/test_idempotent_persistence.py # 4 passed  (append/uuid -> MERGE contract)
python3 tests/property/test_event_identity.py         # 7 passed  (deterministic source-scoped id)
python3 tests/property/test_monitor_health.py         # 8 passed  (severity/coverage-derived health)
python3 tests/contract/test_serverless_notebook_apis.py # 2 passed (now flags triggers + cache/persist)
python3 tests/contract/test_cep_signal_contract.py    # 5 passed  (B4 CEP->UEO lineage/MITRE contract)
python3 tests/contract/test_revision_thread.py        # 6 passed  (B6 revision thread + stale-approval refusal)
```

B4 (H-020) proof: `cep_pattern_matches` had three disagreeing shapes and the
producer dropped `event_ids`/MITRE. The regression pins the contract
(`CEP_PATTERN_MATCH_COLUMNS`) as the single source of truth and asserts the
producer emits it without stripping lineage, the setup DDL matches, and the UEO
CEP lens reads `event_ids` (not the vanished `matched_events`) and carries MITRE.

B6 (H-050) proof: the revision thread was severed at FUSE (no revision column)
and at the verdict (entity_id only). The regression asserts source continuity
UEO->`fuse_results`->`confluence_verdicts`->`response_actions`, and
behaviourally that an approval binds to the live revision and `can_execute`
refuses once the finding is re-confirmed at a new revision.

H-030 fault-injection proof: crash BEFORE the alert write leaves the match
un-alerted; the retry rediscovers it (obligation is a query) and emits exactly
one alert. Crash AFTER the alert but before the mark re-emits onto the same
deterministic alert id (no duplicate). Both asserted.

H-080 / H-004 (Gate A — serverless compatibility, FIXED_STATIC): with PyYAML
present, `tests/contract/test_serverless_notebook_apis.py` maps serverless jobs
to their notebooks and finds **zero** offenders across the 95 serverless
notebooks; `KNOWN_BLOCKED` is now empty. The seven always-on continuous
streaming jobs plus the GraphFrames `trend_engine_cet` were moved to classic job
clusters in `resources/jobs.yml`; the serverless-scheduled notebooks had
cache/persist removed and their fixed processingTime triggers replaced with the
shared `resolve_stream_trigger()` helper (default availableNow). All resource
YAML still parses.

Frontend build (`VITE_DATABRICKS_MODE=true npm run build`) passes.
Live validation still BLOCKED (no target): `databricks bundle validate` + a run
on classic and serverless compute, and confirming the classic node types /
GraphFrames Maven coordinate for the deployment cloud.

## Phase 0 / Phase 1 — bundle configuration

### Reproduce H-001 (before fix)
```
python3 - <<'PY'   # yaml.safe_load_all over databricks.yml + resources/*.yml
...
PY
# => FAIL resources/jobs.yml (line 187): expected <block end>, but found '<scalar>'
```

### After fix — parse + duplicate-key + path checks
```
python3 tests/contract/test_bundle_config.py
# PASS test_all_bundle_yaml_parses
# PASS test_h001_no_value_then_key_on_same_line
# PASS test_no_duplicate_job_or_pipeline_keys
# PASS test_referenced_notebook_paths_exist
# 4 passed, 0 failed
```
- All bundle YAML parses; no duplicate mapping keys.
- 133 `notebook_path` references checked; 0 missing.

### Frontend build (repo-level gate)
```
npm run build
# ✓ built in ~35s (only the routine >500 kB chunk-size notice)
```

## Phase 1 — serverless-incompatible Spark APIs (H-004)

Deployment-aware audit: mapped jobs whose environment spec sets
`environment_version` (serverless) to the notebooks they deploy, then scanned
those files for APIs serverless does not expose.

### Fix (three broadcast cases -> closure capture) + regression
```
python3 -m py_compile \
  notebooks/correlation/01_streaming_correlation_engine.py \
  notebooks/correlation/04_temporal_window_correlator.py \
  notebooks/ml_training/06_graph_neighborhood_embeddings.py
# => PYCOMPILE_OK

python3 tests/contract/test_serverless_notebook_apis.py
# PASS test_deployed_serverless_notebooks_have_no_incompatible_apis
# PASS test_known_blocked_notebooks_are_still_blocked
# 2 passed, 0 failed
```
- `sparkContext.broadcast` removed from all three streaming/ML notebooks;
  small lookup maps now captured by closure (semantically identical).
- `analytics/01_trend_engine_cet.py` (GraphFrames + `sparkContext.setCheckpointDir`)
  was migrated in Gate A: its job now runs on a dedicated classic cluster
  (`cet_classic`) with the GraphFrames Maven library from the `graphframes_maven`
  bundle variable, so it is off the serverless path. Live staging validation of
  the classic runtime + Maven coordinate on the target cloud remains BLOCKED.

## Phase 6 — durable health (H-060)

Confirmed live defect: `Monitor.report_health` read `self._cfg` (does not exist;
`__init__` stores `self._config`), raising AttributeError that a bare
`except: pass` swallowed, so `pipeline_health` was never written yet
`log_complete` believed it reported healthy. Fixed the attribute name and
replaced the silent swallow with `logger.exception`.
```
python3 tests/property/test_monitor_health.py
# PASS test_log_complete_reports_health
# PASS test_report_health_actually_writes_to_the_health_table
# PASS test_report_health_does_not_silently_swallow_a_write_failure
# 3 passed, 0 failed
```
- Regression imports the real `monitoring` module via an import-boundary pyspark
  shim (pyspark is not installed offline; it is used only for a type annotation,
  a few function symbols and the static audit-schema constructors).
- The `Failed to flush audit events...` line on stderr is the module's own error
  logging firing on the fake Spark during `_flush()` — the anti-silent-failure
  behavior working, not a test failure.

## Phase 7 — tool-argument validation (H-070)
```
python3 tests/security/test_tool_arg_validation.py
# 8 passed, 0 failed
```
- Permanent regression under `tests/security/`, imports the real `BaseAgent`
  validators: schema-order emission, unknown/missing/type/enum rejection, NULL
  padding for omitted optionals, and SQL-literal escaping of a crafted string.

## Phase 1 — migration idempotency (H-005)
```
python3 tests/contract/test_migration_idempotency.py
# 4 passed, 0 failed
```
- Setup notebooks already double as idempotent upgrades (all `CREATE TABLE IF NOT
  EXISTS`; column upgrades via `ALTER TABLE ... ADD COLUMNS IF NOT EXISTS`; no
  `CREATE OR REPLACE TABLE` / `DROP TABLE`). Guard locks the property; no parallel
  migration hierarchy added.

## Prior-session offline regressions re-confirmed
```
python3 tests/property/test_finding_revision.py     # 13 passed
python3 tests/contract/test_phase2_contracts.py      # 11 passed
python3 tests/contract/test_bundle_config.py         # 4 passed
python3 tests/contract/test_serverless_notebook_apis.py  # 2 passed
python3 tests/e2e/test_e2e_entry_only.py             # 8 passed (live run BLOCKED)
```

## Not yet executed (BLOCKED, needs workspace)
- `databricks bundle validate -t dev|staging|production`
- Any job start / streaming trigger / checkpoint behavior
- Live entry-only E2E via `harness.run_suite(spark, cfg)`
- `trend_engine_cet` serverless->classic compute migration (no in-repo cluster
  pattern; cloud-specific node types / Spark version / GraphFrames Maven coord).
- H-030 threat-intel fault-injection: the detection notebook runs
  `dbutils.widgets`/`spark.sql` at import, so an offline regression needs the
  match-persist/alert-emit step extracted into an importable helper (a
  streaming-detector refactor) or a workspace.

