# Audit remediation status

Maps the second-pass audit findings `REV2-01`..`REV2-29` (reference commit
`884e64464f3b42c74eae25571f2a32e7d7b15f5f`) to the remediation phase that owns
them and their current honest state. Scope is the `databricks-native/` tree only.

Finding **themes are inferred from the remediation prompt's phase-to-finding
mapping** — the original per-finding text is not stored in this repo, so themes
are summarized, not quoted. This file is the ordered "finding -> repair or
blocked verification" mapping required by the Phase 0 exit gate.

## Status legend

- `open` — not started
- `partial` — some sub-parts landed, work remains
- `blocked-external` — the code change is achievable in-repo, but the
  *verification* needs a live Databricks workspace, Zerobus, PostgreSQL/Lakebase,
  a Ray/GPU cluster, connector credentials, or a controlled response target that
  does not exist in this environment. Recorded as `BLOCKED/NOT RUN`, never passed.

## Findings

| ID | Theme (inferred) | Phase | Status | Evidence / notes |
|----|------------------|-------|--------|------------------|
| REV2-01 | Contract / schema drift between producers and consumers | 2 | partial | Landed: both smoke tests now use the canonical `load_config`/`SOCConfig` API and the 2-arg `Monitor(spark, cfg)`; the non-existent `PlatformConfig` is gone. `notebooks/_shared/contracts.py` pins the public config API and a contract test (`tests/contract/test_phase2_contracts.py`) fails if it drifts. |
| REV2-02 | Fusion math treats anomaly score as posterior | 3 | partial | Landed: `notebooks/_shared/calibration.py` maps each raw detector score to a calibrated posterior via prior-anchored log-odds before it becomes Dempster-Shafer belief mass; `10_fuse_engine.py` no longer feeds `raw_score` straight in. Proven in `tests/property/test_calibration.py` (neutral score returns the base rate; a rare-base-rate high score yields a probability well below the score). Remaining: fit per-class base rates from labelled outcomes (needs runtime). |
| REV2-03 | Correlated detectors counted as independent evidence | 3 | partial | Landed: the baseline scorer pools only the strongest calibrated probability per independence group before naive-Bayes combination, so correlated detectors in the same group are not double-counted; the existing D-S independence weighting is covered by `tests/test_fuse_math.py` (a correlation-discounted signal moves belief less than an independent one). Remaining: validate group assignments against real detector correlation (needs runtime). |
| REV2-04 | Non-idempotent / non-crash-safe evidence writes | 6 | partial | Landed (Phase 6): `notebooks/_shared/idempotency.py` derives deterministic, content-addressed keys; `delta_helpers.safe_append(idempotency_key=...)` now does an insert-if-absent MERGE so a replayed batch inserts nothing. Wired into the evidence producers: UEO objects (`ueo_id`), UEO signals (`signal_id`) and forensic collections (`collection_id`) all write idempotently on their deterministic ids; the same fix removes a latent crash where four agents passed an `idempotency_key` the function did not accept. `tests/property/test_idempotency.py` pins the key guarantees. Remaining: atomic multi-table (evidence + signals) Delta commit needs runtime to verify. |
| REV2-05 | Execution scope / identity binding collapses executions | 2, 5, 6 | partial | Landed (Phase 2 kernel): canonical execution-identity vocabulary (`execution_id`, `run_id`, `producer`, `schema_version`, `produced_at`) + `SCHEMA_VERSION` declared in `notebooks/_shared/contracts.py` and covered by the contract test. Phase 5 slice landed: `finding_revision.py` stamps and persists all five identity fields onto every `finding_revisions` row (a fresh `execution_id` per run so two dedup runs never collapse), enforced by the property test. Phase 6 slice landed: `idempotency.stamp_execution_identity` stamps the full five-field kernel onto an evidence row from the contract vocabulary without mutating the input, covered by the property test and ready to apply as evidence tables gain the identity columns. Remaining: persist those columns on evidence/detection/response tables at runtime. |
| REV2-06 | Statistical significance conflated with maliciousness | 3 | partial | Landed: `calibration.significance_to_probability` names the intent explicitly and routes a significance (evidence strength) through the base rate rather than using it as the probability of maliciousness; `tests/property/test_calibration.py` asserts significance is not maliciousness. Remaining: same per-class calibration fitting as REV2-02. |
| REV2-07 | Temporal engine correctness (arbitrary-length claims) | 5 | open | Ship a bounded matcher; do not emulate with fixed motifs. |
| REV2-08 | Finding-revision state machine missing | 5 | partial | Landed: `notebooks/_shared/finding_revision.py` implements the immutable lifecycle PROVISIONAL -> CONFIRMED/WITHDRAWN/EXPIRED/SUPERSEDED with a fixed transition table — terminal states are dead ends, re-confirming is rejected, and every state change appends a new revision (never mutates one). Persisted to the append-only `finding_revisions` ledger; the alert-dedup job now emits a real SUPERSEDED chain for duplicates and EXPIRED for stale alerts. Proven offline in `tests/property/test_finding_revision.py` (13 cases: legal/illegal transitions, terminal dead-ends, monotonic + immutable revisions). Remaining: migrate the primary detection writers to open every finding as a PROVISIONAL revision at creation. |
| REV2-09 | Standing-query / absence predicates | 5 | open | Absence + late-arrival policy needed. |
| REV2-10 | Partial-match state and supporting-event IDs | 5 | open | Preserve full supporting event IDs, durable partial matches. |
| REV2-11 | Producer/consumer schema drift | 2 | partial | Landed: the `system_settings` split (DDL/backend used `key`/`value`; seed, config loader and formula notebook used `setting_key`/`setting_value`, and the seed's overwrite clobbered the DDL schema) is reconciled onto canonical `key`/`value` everywhere. Contract test rejects the old aliases repo-wide. Remaining: extend typed column contracts to the rest of the cross-boundary tables. |
| REV2-12 | Ray training is not real training | 7 | blocked-external | Needs Ray cluster + GPU + versioned corpus. |
| REV2-13 | MC-RNN fresh-weight startup / no persisted state | 7 | blocked-external | Shared featurizer buildable; real training blocked. |
| REV2-14 | Model evaluation absent / leaky | 7 | partial | Landed (Phase 7): `notebooks/_shared/model_eval.py` gives a leakage-safe harness -- `temporal_split` (test strictly after train, boundary timestamp kept whole), `grouped_split` (an entity never spans train and test) and `leakage_keys` to prove a split is clean, plus rank-based ROC-AUC and precision/recall/F1. The threat-scoring notebook now replaces its leaky `randomSplit` with a temporal split and evaluates train and test AUC. `tests/property/test_model_eval.py` pins the invariants (17 cases). Remaining: real labelled artifacts and live workspace to run the harness on trained models. |
| REV2-15 | trained-artifact -> serving chain unverified | 7 | blocked-external | Registry->deploy chain needs a real artifact. |
| REV2-16 | Static file path traversal | 1 | partial | Landed: SPA serving resolves inside the dist root and rejects `../`/symlink/absolute escapes; `/api/*` no longer falls back to index.html. Tests: `tests/security/test_phase1_authz.py`. |
| REV2-17 | Authorization not centralized across paths | 1 | partial | Landed: central `authorize(user, action, resource)`; generic write + RPC routed through it; roles resolved from server-side allowlist (`SOC_ADMIN_EMAILS`/`SOC_ANALYST_EMAILS`) so the client `X-Forwarded-Groups` header can no longer escalate. Remaining: read-side authorization and agent/notebook tool paths. |
| REV2-18 | UI false-green / no staleness | 9 | partial | Genie relabel + honest latency copy landed; broader UI truth is Phase 9. |
| REV2-19 | Connector health reported without real collection | 8 | open | Stubs must advertise unavailable, not green coverage. |
| REV2-20 | Response fabrication / approval not bound to revision | 1, 6, 8 | partial | Landed: generic mutation of protected system-of-record tables (evidence, identity, approvals, response state, runtime health) blocked; response-action approval enforces separation of duties (no self-approval) and only reports success after confirming the action was pending. Remaining: binding approval to an exact evidence/finding revision (Phase 6). |
| REV2-21 | Ingestion not durable / drops tail events | 4 | partial | Landed: `notebooks/_shared/ingest_accounting.py` reconciles every micro-batch (`received == valid + quarantined`) and the raw ingestion job now routes any record that is neither valid nor corrupt to quarantine (`unclassified_no_bucket`) instead of dropping it, then persists a durable `ingestion_accounting` ledger row (received/valid/quarantined/unaccounted/balanced) that survives restart — replacing the in-memory-only counters. Proven offline in `tests/property/test_ingest_accounting.py` (conservation identity; a drop shows up as unbalanced). Remaining (needs workspace): true Zerobus/Delta durability across broker restarts and exactly-once offset commit. |
| REV2-22 | Latency claims untruthful | 4 | partial | Streaming trigger corrected; README/architecture latency claims made honest. |
| REV2-23 | Topology mislabeled (Zerobus/Lakebase) | 4 | blocked-external | Real PostgreSQL Lakebase + Zerobus need infra; naming corrected in docs. |
| REV2-24 | Deployment build integrity / manifest | 9 | open | Clean-output build + SHA/config fingerprint manifest. |
| REV2-25 | Readiness counts STARTING as ready | 9 | open | Real bounded dependency checks + canary. |
| REV2-26 | Observability metrics missing | 9 | open | Lag, quarantined/lost records, outbox backlog, verification metrics. |
| REV2-27 | Response not verified against a target | 8 | blocked-external | Dry-run adapters buildable; live verified target blocked. |
| REV2-28 | No baseline comparison / overfitting risk | 3, 7 | partial | Landed (Phase 3 fusion side): `calibration.baseline_probability` gives a simple independent naive-Bayes baseline, now persisted as `baseline_score` alongside every fused row so the elaborate D-S fusion can be compared to it; `tests/property/test_calibration.py` checks D-S and the baseline agree on ordering. Phase 7 model side landed: `model_eval.promotion_gate` refuses to register or serve a model that does not beat the coin-flip baseline (AUC 0.5) by a margin, is overfit (train-minus-test AUC gap too large), or was measured on a single-class test slice; the threat-scoring notebook only registers to the serving name and only scores production events when the gate passes, otherwise it keeps the artifact for audit and logs the rejection reasons. Remaining: the gate runs against real trained artifacts only on a live workspace. |
| REV2-29 | Audit writes swallowed on privileged mutation | 9 | open | Mandatory audit persistence must not be silently dropped. |

## Rollup

- **partial (some work landed):** REV2-01, REV2-02, REV2-03, REV2-04, REV2-05, REV2-06,
  REV2-08, REV2-11, REV2-14, REV2-16, REV2-17, REV2-18, REV2-20, REV2-21, REV2-22, REV2-28
- **blocked-external (needs infra/hardware to verify):** REV2-12,
  REV2-13, REV2-15, REV2-23, REV2-27
- **open (in-repo, achievable next):** all remaining findings

## How this file is kept honest

`docs/engineering/artifact-manifest.json` and `baseline-results.json` are
regenerated by `tools/inventory/generate_manifest.py` and
`tools/inventory/run_baseline.py`. The contract test
`tests/contract/test_phase0_inventory.py` fails if the manifest drifts from the
tree or the registry/baseline are malformed, so this remediation record cannot
silently diverge from the code it describes.
