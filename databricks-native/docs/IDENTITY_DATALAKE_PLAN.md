# AA Identity Datalake — Delivery Plan and Status

This tracks the identity blueprint phase by phase. Each phase has a menu page under **Identity** in the app. A page shows "Not connected yet" until its phase is delivered, rather than sample numbers.

## Status

| Phase | Scope | Menu pages | Status |
|-------|-------|------------|--------|
| Pre-req | Human approval for every response action | — | **Done.** Auto-approve is opt-in and refused in production |
| Pre-req | On-behalf-of user auth | — | **Done.** App reads run with the signed-in user's Unity Catalog permissions (`sql` user scope); writes stay on the app identity behind role checks and a fail-closed audit record of the verified user |
| Pre-req | Lakebase leases and outbox for actions | — | Open (needed before Phase 4) |
| 0 | Canonical identity spine: deterministic resolution, personas, NHI/agents, steward review, source health | Identity Overview, Identity Explorer, Resolution Review, Non-Human & Agents | **Done** (offline-verified; awaiting real snapshots) |
| 1 | Entitlements, sign-in and HR lifecycle events on the spine | Identity Timeline | Not started |
| 2 | Explainable risk, access graph, group context | Identity Risk, Access Graph & Paths, Group Context | Not started |
| 3 | What-if simulation, federation posture | What-If Simulator, Federation Posture | Not started |
| 4 | Approved, reversible remediation | Identity Remediation | Not started (needs OBO + outbox) |
| 5 | Governed natural-language answers | Identity Answers | Not started |

## Phase 0 — what was built

| Piece | Location |
|-------|----------|
| Resolver (pure Python, same code in job and tests) | `notebooks/_shared/identity_resolution.py` |
| Tables (CDF on) | `notebooks/setup/06_identity_datalake_tables.py` |
| Synthetic fixtures (demo only, `seed_demo_data` guard) | `notebooks/_shared/identity_fixtures.py`, `notebooks/setup/07_seed_identity_fixtures.py` |
| Daily job `[0xDSI] Identity 01 - Canonical Identity Spine` | `notebooks/identity/01_identity_spine.py`, `resources/jobs.yml` |
| API `/api/identity/*` (analyst role, audited steward writes) | `app/backend/identity.py` |
| UI | `app/frontend/src/components/identity/` |
| Tests (19 property tests) | `tests/property/test_identity_resolution.py` |

### Resolution rules
- Source key is `provider:tenant:object_id`, so the same object ID in two tenants never collides.
- Automatic links use only deterministic evidence: steward decision > authoritative cross-reference > employee ID > UPN within the same tenant.
- Name or email similarity only creates a **review item**. It never merges on its own.
- Hard safety rules cannot be overridden by a steward:
  - never link a person to a workload or agent;
  - never link two non-human identities without an authoritative cross-reference;
  - never link accounts with conflicting employee IDs or conflicting HR records (this blocks rehire mix-ups);
  - never re-link a pair a steward rejected.
- Guest accounts are never linked automatically by employee ID or UPN. They can only reach a home identity through review.
- Canonical IDs stay stable across runs. Merges and splits are recorded with their impact.
- If a source sends an incomplete snapshot, missing accounts are marked stale and never deleted.
- Provider states map to `ENABLED / SUSPENDED / LOCKED / DISABLED / DELETED / UNKNOWN` with a versioned map. Unknown states raise a finding instead of being guessed.

### Feeding real data
Drop one folder per provider into `/Volumes/<catalog>/<schema>/landing/identity/<provider>/`, containing:
- `accounts.jsonl`: one account per line, using the fields of the `Account` record in the resolver;
- `manifest.json`: `{"tenant": "...", "snapshot_at": "...", "snapshot_complete": true}`.

Then run the job, or use **Run resolver now** on Identity Overview.

## Inputs only AA can provide
1. Read-only exports or connector access for AD, Entra ID, PingDirectory, Saviynt, Duo and key app-local stores.
2. The authoritative person key (HR worker ID) and the employee-ID reuse policy.
3. The state vocabulary per provider, especially custom states such as Ping `pending_review`.
4. The GRC application register, so non-human identities can be linked to applications, and an owner of record for each.
5. The list of identity stewards (analyst role) who decide review items.
6. Crown-jewel systems and the risk-factor weights (needed for Phase 2).
