# AA Identity Datalake — Delivery Plan and Status

This tracks the identity blueprint phase by phase. Each phase has a menu page under **Identity** in the app. A page shows "Not connected yet" until its phase is delivered, rather than sample numbers.

## Status

| Phase | Scope | Menu pages | Status |
|-------|-------|------------|--------|
| Pre-req | Human approval for every response action | — | **Done.** Auto-approve is opt-in and refused in production |
| Pre-req | On-behalf-of user auth | — | **Done.** App reads run with the signed-in user's Unity Catalog permissions (`sql` user scope); writes stay on the app identity behind role checks and a fail-closed audit record of the verified user |
| Pre-req | Lakebase leases and outbox for actions | — | Open (needed before Phase 4) |
| 0 | Canonical identity spine: deterministic resolution, personas, NHI/agents, steward review, source health | Identity Overview, Identity Explorer, Resolution Review, Non-Human & Agents | **Done** (offline-verified; awaiting real snapshots) |
| 1 | Entitlements, sign-in and HR lifecycle events on the spine | Identity Timeline | **Live on sample data** (offline-verified; awaiting real HR, sign-in, MFA and access event feeds) |
| 2 | Explainable risk, access graph, group context | Identity Risk, Access Graph & Paths, Group Context | **Live on sample data** (offline-verified; awaiting real group, entitlement and crown-jewel feeds and AA-agreed weights) |
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

## Phase 1 — Identity Timeline

| Piece | Location |
|-------|----------|
| Linker and detections (pure Python, same code in job and tests) | `notebooks/_shared/identity_timeline.py` |
| Tables `identity_event`, `identity_timeline_finding` (CDF on) | `notebooks/setup/06_identity_datalake_tables.py` |
| Sample events (demo only) | `notebooks/_shared/identity_event_fixtures.py`, written by `setup/07` |
| Job task `build_timeline` (runs after `resolve_identities` in the Identity 01 job) | `notebooks/identity/02_identity_timeline.py` |
| API `/api/identity/timeline/identities`, `/timeline/findings`, `/identities/{id}/timeline` | `app/backend/identity.py` |
| UI | `app/frontend/src/components/identity/IdentityTimeline.tsx` |
| Tests (13 property tests) | `tests/property/test_identity_timeline.py` |

Linking: an event attaches to an identity only by exact account key (`provider:tenant:object_id`) or, for HR events, by an employee ID that maps to exactly one non-guest person. Anything else is stored as `unlinked`, never guessed.

Detections: activity after termination, leaver accounts still enabled, mover keeping old-department access, MFA fatigue (3+ denials in 10 minutes), MFA reset followed by a new-country sign-in within 24 hours, privileged grant without a change ticket, and workload identities whose owner has left. A rehire clears leaver findings. Findings that stop reproducing are marked resolved.

Sample people and what each one shows:

| Person | Story | Finding |
|--------|-------|---------|
| Luiz Zanardo | Identity engineer given Domain Admins with no ticket | Privilege without a ticket |
| Keith Murry | Moved from Airport Operations to Finance, kept Ramp-Control-Console | Mover kept old access |
| Abhijit Tilak | MFA reset at 03:12 UTC, sign-in from Romania four hours later | MFA reset, then new country |
| Brian McDonald | Left 20 Oct; AD disabled but Entra still enabled and used on 24 Oct; owns svc-bag-reconcile | Activity after termination, leaver still has live accounts, owner has left |
| Todd Trncak | Five Duo push denials in seven minutes, then lockout | MFA fatigue |
| Blessy Baby, Rudi Himawan, Priya Raman, Marcus Bell | Conversion, password reset, grant then revoke, ticketed privilege | None (clean baselines) |

Real feeds: drop `*.jsonl` files into `/Volumes/<catalog>/<schema>/landing/identity_events/`, one event per line with `provider`, `tenant`, `object_id` (or `employee_id` for HR), `event_type`, `occurred_at`, optional `actor` and `detail`. Keep this folder outside `landing/identity/`, because every subfolder there is treated as a directory snapshot.

## Phase 2 — Identity Risk, Access Graph, Group Context

| Piece | Location |
|-------|----------|
| Access model, attack paths, group context and risk scoring (pure Python, same code in job and tests) | `notebooks/_shared/identity_access.py` |
| Tables `identity_resource`, `identity_group`, `identity_group_member`, `identity_access_edge`, `identity_attack_path`, `identity_group_finding`, `identity_risk_score`, `identity_risk_history` (CDF on) | `notebooks/setup/06_identity_datalake_tables.py` |
| Sample resources, groups and edges (demo only) | `notebooks/_shared/identity_access_fixtures.py`, written by `setup/07` |
| Job task `score_access_risk` (runs after `build_timeline` in the Identity 01 job) | `notebooks/identity/03_identity_access_risk.py` |
| API `/api/identity/risk`, `/risk/{id}`, `/graph/resources`, `/graph/paths`, `/groups`, `/groups/{key}` (analyst role, read-only) | `app/backend/identity_access.py` |
| UI | `IdentityRisk.tsx`, `AccessGraph.tsx`, `GroupContext.tsx` in `app/frontend/src/components/identity/` |
| Tests (13 property tests) | `tests/property/test_identity_access.py` |

Rules:
- **Attack paths** are the shortest route (breadth-first) from each identity's active accounts to each crown-jewel resource, through group membership, nesting, grants and `can_take_over` edges (for example a helpdesk group that can reset an admin's password). Disabled, deleted and suspended accounts are never traversed. Nesting cycles terminate.
- **Risk score** (0-100) = exposure + behaviour + hygiene, each capped. Every point is a named factor with evidence: crown-jewel access, takeover path, privileged access through a standard account, standing privilege, segregation-of-duties conflict, open timeline findings, open resolver findings, no MFA enrolment and disabled accounts left in groups. Bands: 70+ critical, 40+ high, 20+ medium. Weights live in `DEFAULT_WEIGHTS` and can be overridden by `landing/identity_access/risk_weights.json`; the weights version is stored with each score. Score changes are appended to `identity_risk_history` for drift.
- **Group findings**: hidden privilege through nesting, departed owner, no owner, direct members outside the group's department, inactive members. Findings that stop reproducing are marked resolved.

Sample results:

| Identity | Score | Why |
|----------|-------|-----|
| Keith Murry | 80 critical | Can both approve payments and create vendors in SAP Finance (segregation-of-duties conflict); still in Airport-Ramp-Ops after moving to Finance |
| Abhijit Tilak | 70 critical | Admin account in Tier0-Operations (Domain Controllers) and his own Entra account owns Azure production, plus the MFA-reset finding |
| Brian McDonald | 65 high | Leaver findings; disabled AD account still in Airport-Ramp-Ops, which he still owns |
| Rudi Himawan | 40 high | Standard account in NOC-OnCall, which is nested in Tier0-Operations and so reaches Domain Controllers |
| Luiz Zanardo | 30 medium | Domain Admins through his admin account, plus the no-ticket finding |
| Blessy Baby | 20 medium | In Helpdesk-Tier1, which can reset Marcus Bell's admin password and so reach the loyalty database (takeover path) |
| Priya Raman | 0 low | Clean baseline |

Group findings on the sample: Airport-Ramp-Ops (owner departed, Keith outside purpose, Brian's disabled account still a member), NOC-OnCall (hidden privilege), Helpdesk-Tier1 (no owner, Blessy outside purpose).

Real feeds, in `/Volumes/<catalog>/<schema>/landing/identity_access/`:
- `resources.jsonl`: `resource_id`, `name`, `crown_jewel`, optional `tier`, `owner`, `description`.
- `groups.jsonl`: `provider`, `tenant`, `object_id`, `name`, optional `owner` (email), `purpose`, `department`, `privileged`, and `members` (account refs `{provider, tenant, object_id}` or `provider:tenant:object_id` strings; a member that matches a group becomes nesting).
- `edges.jsonl`: `source` (account or group ref), `edge_type` (`grants` or `can_take_over`), `target` (resource ID or account/group ref), optional `permission`.
- Optional `risk_weights.json` with any keys from `DEFAULT_WEIGHTS` and a `version`.

Rows that do not resolve are counted as quarantined and skipped, never guessed.

## Inputs only AA can provide
1. Read-only exports or connector access for AD, Entra ID, PingDirectory, Saviynt, Duo and key app-local stores.
2. The authoritative person key (HR worker ID) and the employee-ID reuse policy.
3. The state vocabulary per provider, especially custom states such as Ping `pending_review`.
4. The GRC application register, so non-human identities can be linked to applications, and an owner of record for each.
5. The list of identity stewards (analyst role) who decide review items.
6. Crown-jewel systems, segregation-of-duties rules and the risk-factor weights (sample values are in place for Phase 2).
