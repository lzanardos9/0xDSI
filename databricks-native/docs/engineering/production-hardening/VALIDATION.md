# VALIDATION

Runtime: offline sandbox, `python3` 3.13, no Databricks workspace attached.
Workspace/bundle/staging validation is **BLOCKED** (no authorized target); those
gates are not claimed as passed.

PyYAML is not stdlib; installed locally for config parsing
(`pip install --break-system-packages pyyaml` → 6.0.3).

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
  is **BLOCKED**: requires classic compute + the GraphFrames Maven library, which
  needs staging validation. Allowlisted in the regression with a rot guard so a
  new violation still fails and the allowlist cannot go stale.

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

