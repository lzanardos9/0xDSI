# Production Hardening — PLAN

Repository scope: `databricks-native/`. Platform is Databricks-native
(Unity Catalog, Lakeflow/Jobs, Structured Streaming, Model Serving, MLflow,
Vector Search). This effort does **not** introduce Supabase, Redis, Flink, or
any external control plane — rule 2 of the engagement forbids it, and the
generic "a Supabase database is available" environment hint is explicitly
overridden here.

## Architecture decisions

- **Single identity/envelope contract** in `notebooks/_shared/contracts.py`,
  invoked by every ingestion and detection path (Phase 2/3).
- **Deterministic content-addressed IDs** over source coordinates, not
  `uuid()`, so the real-time and durable paths agree and retries keep identity.
- **Immutable finding revisions** (`notebooks/_shared/finding_revision.py`):
  PROVISIONAL → CONFIRMED/WITHDRAWN/EXPIRED/SUPERSEDED, append-only, execution
  identity stamped. Evidence changes bump a revision and invalidate the bound
  finding/approval rather than mutating in place (Phase 5).
- **Truthful health**: HEALTHY / DEGRADED / UNAVAILABLE persisted; a completion
  path must never overwrite a degraded state with healthy; zero signals is not
  "normal" (Phase 6).
- **One tool-execution contract** with schema-ordered argument binding and
  required/unknown/type/enum validation before any SQL (Phase 7).
- **Entry-only E2E**: stimulus enters only at Kafka/landing; assertions read
  only published outputs (Phase 9).

## Phase dependency order

0 baseline → 1 deployable bundle → 2 event identity → 3 canonical signals →
4 recoverable writes/dedup → 5 revision propagation → 6 truthful health →
7 agent/tool/response security → 8 detector semantics → 9 entry-only E2E →
10 CI/migration/load/release evidence.

Phases 2–7 each depend on the contract chosen in the phase before it. Phase 9
exercises the whole chain; Phase 10 packages evidence.

## Rollout / rollback

- Work stays on a dedicated branch; no force-push, no merge to main, no
  production deploy, no real containment, no checkpoint deletion.
- Autonomy (auto-close, auto-approve, destructive actions, model/rule
  auto-promotion) stays disabled; detection/shadow mode is the default.
- Schema changes ship as idempotent upgrade migrations **and** clean-install
  setup; historical decisions are never rewritten in place.
- Live/staging validation requires an explicitly authorized target. Where a
  workspace is unavailable, the offline gate is finished and the live gate is
  recorded BLOCKED — never reported as PASSED.

## Current recommendation

`OFFLINE_VERIFIED_ONLY` — offline build/config/contract checks pass; staging and
live gates remain BLOCKED pending an authorized workspace.
