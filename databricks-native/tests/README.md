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
| `property/` | Property-based invariants (mass conservation, ordering independence) for Phase 3. | planned |
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
