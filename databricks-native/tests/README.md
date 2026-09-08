# Tests

Offline, dependency-light tests (plain `python3`, no pytest required — each file
has a `__main__` runner). Workspace-dependent smoke tests live at the top level
and are recorded as `blocked` by the baseline until a real Databricks workspace
is available.

## Layout

| Directory | Purpose | Status |
|-----------|---------|--------|
| `contract/` | Contracts between artifacts and the engineering inventory (manifest drift, registry validity, baseline shape, audit coverage) plus producer/consumer contracts (config public API, canonical table columns, execution-identity kernel). | active |
| `unit/` | Pure-function tests (e.g. evidence fusion math). Currently `test_fuse_math.py` at the top level; new unit tests land here. | growing |
| `integration/` | Cross-component flows that need Spark/Delta. | added per phase |
| `property/` | Property-based invariants. Phase 3: score calibration (neutral score returns the prior, significance is not maliciousness, freshness reverts to the prior not to zero) and D-S-vs-baseline ordering agreement (`test_calibration.py`). Phase 4: ingestion accounting conservation — every received record is written or quarantined, drops surface as unbalanced (`test_ingest_accounting.py`). Phase 5: finding-revision lifecycle — legal/illegal transitions, terminal dead-ends, immutable monotonic revisions, identity stamping (`test_finding_revision.py`). Phase 6: evidence idempotency — deterministic content keys (injective over boundaries, None distinct from empty), replay detection, and execution-identity stamping (`test_idempotency.py`). | active |
| `security/` | Path-traversal, authorization-matrix and self-approval tests for Phase 1. | active |
| `replay/` | Deterministic replay / crash-injection (Operation Borrowed Trust) for Phases 5-6. | planned |

Directories are created when their first real test exists — empty placeholder
folders are intentionally avoided.

## Run the Phase 0 gate

```bash
python3 tools/inventory/generate_manifest.py     # refresh the inventory
python3 tools/inventory/run_baseline.py          # record build/compile/test baseline
python3 tests/contract/test_phase0_inventory.py  # enforce inventory honesty
```
