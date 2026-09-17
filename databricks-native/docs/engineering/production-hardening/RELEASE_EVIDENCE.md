# Release Evidence — Offline Hardening Gate

Runtime: offline sandbox, `python3` 3.13, no Databricks workspace attached.
This document is the reproducible evidence for the offline portion of the
hardening effort. It is regenerated, not hand-maintained: run the gate and the
numbers below are what it prints.

## Reproduce the whole offline gate

```
cd databricks-native
python3 tools/ci/run_offline_gate.py     # notebook syntax + every test file
cd app && VITE_DATABRICKS_MODE=true npm run build   # frontend build
```

CI runs exactly this (`.github/workflows/offline-gate.yml`), plus a manifest
regeneration step so a stale `artifact-manifest.json` fails the build.

## Current offline result

```
notebooks compiled : 163 (0 failed)
test files         : 33 (33 passed, 0 failed)
OFFLINE GATE       : PASS
frontend build     : PASS
```

The gate is two layers:

1. **Notebook syntax** — `py_compile` over every `notebooks/**/*.py`. A syntax
   error in a notebook is otherwise invisible until deploy time (the frontend
   build does not touch them, and source-extraction tests do not import them).
   This layer caught a real regression during Gate D: `10_fuse_engine.py` had an
   unmatched parenthesis introduced while threading the revision columns.
2. **Offline test suite** — every `tests/**/test_*.py` (contract, property,
   security, and the entry-only E2E contract). Each file is a self-contained
   script that exits non-zero on failure.

## Gate status

| Gate | Scope | Status |
|------|-------|--------|
| A | Serverless compatibility (`trend_engine_cet` classic-compute migration; H-080 — 12 notebooks on classic-only APIs) | **BLOCKED** — needs a workspace/classic-compute migration + staging run |
| B | Recoverable detection path (event identity, canonical signals, recoverable writes, revision propagation, truthful health, agent/tool security) | **VERIFIED_OFFLINE** |
| C | Detector semantics (Phase 8) | **VERIFIED_OFFLINE** |
| D | CI / migration / release evidence (Phase 10) | **VERIFIED_OFFLINE** (this document + the gate runner + CI) |

## What is intentionally NOT in this gate (live gates — BLOCKED)

These require an explicitly authorized Databricks workspace and are never
reported as passed offline:

- `databricks bundle validate` and job-start / deploy checks.
- Structured-streaming runs and the end-to-end scenario suite against live
  Kafka/landing (the offline E2E test asserts only the contract shape).
- Load / soak testing.
- The serverless-to-classic compute migration for the notebooks tracked under
  H-080 and `trend_engine_cet` (Gate A).

## Detector-semantics fixes verified in this gate (Gate C)

All five are unit-tested via the pure helper `notebooks/_shared/detector_semantics.py`
and source-scanned in `tests/property/test_detector_semantics.py`:

- Isolation-Forest confidence now reads the **signed** score (a normal user no
  longer scores as anomalous as an attacker).
- The beaconing detector no longer calls a stream "periodic" because it is
  *consistent with uniform* spacing (which is the opposite of a fixed cadence).
- KS-recall similarity is now symmetric Jaccard, not a containment ratio that
  let a short alert inside a long entry score a perfect match. **Note:** the
  match threshold default moved from 0.72 to 0.4 because the metric's scale
  changed; this operating point should be re-tuned against live recall data.
- Monte-Carlo transition probabilities are clamped to [0, 1] before the draw,
  so tail probabilities no longer fire always/never.
- Negative-correlation "absence" detection now gates on ingestion liveness, so
  an empty window (fresh deploy / ingestion outage) no longer trips every rule.

## Detector-semantics findings NOT fixed (deferred — need live validation)

The audit found four more semantic issues that change a detector's statistical
operating point and should be tuned against live data rather than guessed:
the self-contaminated UEBA baseline/threshold, the daily-vs-window baseline
scale mismatch in the temporal correlator, the circular "KS validation" in the
behavioral-anomaly notebook, and the cross-window `reuse_ratio` / Kleene-closure
depth in the trend engine. These are recorded for a workspace-backed pass.

## Recommendation

`OFFLINE_VERIFIED_ONLY` — Gates B, C, D are verified offline with regressions and
a reproducible runner. Gate A and all live/staging/load gates remain BLOCKED
pending an authorized workspace.
