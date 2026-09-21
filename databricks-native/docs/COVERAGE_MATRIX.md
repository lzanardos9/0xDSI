# Ethical Control Plane — Phase 0 Coverage Matrix

**Status:** Phase 0 (inventory) complete. This document is the authoritative, honest
mapping of every agent notebook in `databricks-native/notebooks/agents/` to its real
autonomy level, coverage mode, and governance-in-code today.

**Honesty contract.** Every status here is one of:

- `VERIFIED_IN_CODE` — the described control exists in source in this repository.
- `PROPOSED` — coverage is intended/inferred but not fully confirmed in code; needs review.
- `SIMULATION` — the agent operates only on synthetic/simulated data or is red-team scoped.

We do **not** use `VERIFIED_IN_DEPLOYMENT`. Whether these controls are live-enforced on a
real Databricks workspace cannot be verified from the build environment, and the operator
console reflects this by rendering in **SHADOW / SIMULATION / NOT_ENFORCED** mode.

## Bounded-agency levels

| Level | Meaning |
|-------|---------|
| A0 | Observe — read/monitor, write findings only |
| A1 | Recommend — produce advice, reports, recommendations |
| A2 | Preapproved — take scoped, low-impact actions (create case, manage data/lists) |
| A3 | Scoped defensive — request containment, gated by approval + lifecycle |
| A4 | High-impact — autonomous or high-blast-radius actions, human-in-the-loop for critical |

## Coverage modes

| Mode | Meaning |
|------|---------|
| OBSERVE_ONLY | Reads and writes findings; no preventive claim |
| ADVISORY | Produces recommendations/documents; does not execute |
| GATEWAY_ENFORCED | Tool calls run through the hardened executor (arg validation, SQL-escaping) |
| RUNTIME_CONTAINED | State-changing actions pass the propose → approve → dispatch → verify lifecycle |
| SANDBOX_ONLY | Effects restricted to isolated replicas/sandboxes |
| SIMULATION | Operates on synthetic data / red-team scoped |

## Summary (57 agents)

- **13** agents are action-capable (can change external state).
- **3** run under `RUNTIME_CONTAINED` containment lifecycle (VANGUARD, Autonomous Response Learner, Edge Control Plane).
- **45** are `VERIFIED_IN_CODE`; **9** are `PROPOSED` (need review); **3** are `SIMULATION`.
- Genuine containment authority is concentrated in `07_vanguard_response.py` and
  `47_autonomous_response_learner.py`, both gated by `_shared/response_actions.py`
  (separation of duties, revision-bound approvals, dispatch ≠ done).

## Shared framework model

- `_shared/agent_framework.py` — all LLM tool calls pass through one hardened executor:
  arguments (attacker-steerable via alert text) are type/enum/required-validated,
  ordered to the declared schema, and SQL-escaped before invoking a Unity Catalog
  function. Standard tools are read-only except `execute_response_action`.
- `_shared/response_actions.py` — the containment guardrail engine. Lifecycle
  `PROPOSED → APPROVED/REJECTED → DISPATCHED → VERIFIED/FAILED`, separation of duties
  (proposer ≠ approver), approval bound to an exact finding revision (stale approvals
  cannot authorize), and `verify_dispatch` marks `VERIFIED` only when observed target
  state matches intent.
- `_shared/contracts.py` — cross-boundary schema contracts with a `SCHEMA_VERSION` drift net.

## Agents requiring review (`PROPOSED`)

These have side effects whose authorization/scoping should be confirmed before promotion:

- `24_threat_radar.py` — outbound TI fetch should be allowlisted.
- `29_connector_version_agent.py` — may write desired-version state.
- `31_vibe_connector_builder.py` — generates connector code (code-exec risk).
- `38_session_list_manager.py` / `39_active_list_manager.py` — mutate lists that influence enforcement.
- `41_glasswing_scanner.py` — triggers scans against targets.
- `48_ueba_entity_onboarding.py` — IdP sync + identity writes.
- `49_edge_control_plane.py` — config push, rolling upgrades, token issue/revoke.
- `56_ai_gateway_guardian.py` — may enforce gateway policy.

## Source of truth

The full row-by-row matrix is stored in the `ecp_agent_coverage` table and is what the
Ethical Control Plane console renders. Update the seed there (and this doc) when agents
change. This file is the human-readable mirror.

## Completed phases

- **Phase 0 — Inventory + coverage matrix.** The real agents from
  `databricks-native/` are catalogued with honest status, autonomy and coverage
  mode, persisted to `ecp_agent_coverage`, and rendered in the console.
- **Phase 1 — Deterministic authority kernel.** `_shared/authority_kernel.py`
  gives every action request a reason-coded verdict independent of any LLM;
  17 unit tests pin its rules, which are mirrored into `ecp_authority_rules`.
- **Phase 2 — VANGUARD vertical slice.** `_shared/vanguard_governed.py` wires the
  kernel in front of `07_vanguard_response.py`: every proposed containment first
  passes `decide()` for a reason-coded outcome, then — only if not denied —
  enters the `response_actions.py` propose → approve → dispatch → verify
  lifecycle. A dispatch is only `VERIFIED` when the target is observed to match
  intent. 10 unit tests pin the slice; representative traces are persisted to
  `ecp_vanguard_traces` and rendered in the console's Governed Actions tab, labelled
  `SIMULATION`.
- **Phase 3 — Broaden the governed perimeter.** The governing logic is lifted out
  of the VANGUARD bridge into `_shared/governed_agent.py`, a generic engine driven
  by per-agent action catalogs (`AGENT_CATALOGS`). All three action-capable agents
  are now registered and governed the same way: VANGUARD Response (07), the
  Autonomous Response Learner (47), and the Edge Control Plane (49).
  `vanguard_governed.py` keeps its original API as a thin wrapper. 11 unit tests
  pin the generic engine across every agent + action; the VANGUARD regression
  tests still pass. Traces for all three agents are persisted to
  `ecp_vanguard_traces` (now carrying `agent_key`/`agent_name`) and shown in the
  console's Governed Actions tab with a per-agent filter.
- **Phase 4 — Explicit authorization for the `PROPOSED` agents.** Each of the 9
  agents that sat at `PROPOSED` now carries an explicit `authz_decision` on its
  `ecp_agent_coverage` row (`GOVERN` / `RESTRICT`), with a plain rationale and
  conditions, rendered in the console's Agent Registry.
  - **GOVERN (admitted to the executable catalog + tests):** Glasswing Scanner (41)
    and Active List Manager (39) join the Edge Control Plane (49). The scanner's
    governance is scope — an in-scope scan is a purpose-limited permit, an
    out-of-scope one is denied. The list manager surfaces a real finding: a
    blocklist write is an access restriction (autonomy A3) but the agent is
    chartered A2, so the kernel denies the self-service block on the autonomy
    floor; a re-chartered A3 path then requires bound approval and verified
    dispatch. These three flip to `VERIFIED_IN_CODE`.
  - **RESTRICT (decision recorded, not admitted to the catalog):** Threat Radar
    (24, allowlisted egress only), Connector Version Manager (29, advisory /
    desired-state only), Vibe Connector Builder (31, sandbox + review), Session
    List Manager (38, scoped operational lists), UEBA Onboarding (48, validated
    IdP creds + input validation), AI Gateway Guardian (56, advisory).
  - The generic engine now spans five governed agents; `test_governed_agent.py`
    has 15 tests pinning scope denial, the autonomy floor, and the permit path.
- **Phase 5 — Enforcement chokepoint + append-only ledger.** The kernel, the
  per-agent catalog and the `response_actions` lifecycle are composed into a
  single fail-closed dispatch chokepoint, `_shared/enforcement.py`. Its
  `guard_and_dispatch(agent_key, proposal, context, execute, record)` is the only
  sanctioned path from a proposed action to a real side effect: the injected
  `execute` callback runs at most once, and only after the kernel permits **and**
  a different operator binds an approval to the exact revision. On every path —
  blocked, not-authorized, execute-error, verified, failed — the `record` sink is
  called exactly once, so the audit ledger is append-only and complete. An
  `execute` exception is caught and recorded as `EXECUTE_ERROR` (fail closed, not
  a silent success). 10 property tests (`test_enforcement.py`) pin that the
  side-effect callback is unreachable on every rejected path and that each attempt
  writes exactly one row. A runnable deployment harness
  (`tests/harness/enforcement_harness.py`) drives the chokepoint against an
  in-memory `Fleet` across 9 scenarios and asserts the core invariant that the
  fleet mutates **iff** the guard executed; all 9 pass. The harness output seeds
  `ecp_enforcement_ledger` (append-only, RLS read-only), surfaced in the console's
  Evidence Ledger tab with each row's outcome, executed flag, kernel decision and
  reason code, two-person control (proposer vs approver), observed state and
  lifecycle steps. Agents proven through the live chokepoint are labelled
  `ENFORCED` — an honest intermediate between `VERIFIED_IN_CODE` and
  deployment: the binding is demonstrated in-process, **not** against a live
  workspace, so nothing is `VERIFIED_IN_DEPLOYMENT`.
- **Phase 6 — Production dispatch binding with independent read-back.** The
  enforcement chokepoint's `execute` callback is lifted out of the test closure
  into a deployment-shaped binding, `_shared/workspace_dispatch.py`. It builds
  `execute` from a `WorkspaceClient` whose two responsibilities are *separate*:
  `apply` issues the command (in deployment, the Unity Catalog
  `execute_response_action`) and `observe` reads the target's state back (in
  deployment, a status query). The state fed to verification is the independent
  read-back, **never** the command's own claim of success — so a command that
  returns without error but does not take effect (a firewall that silently drops
  the rule) is recorded `FAILED`, not a false success. The client and the ledger
  sink are injected, so the binding imports no Spark and runs offline like the
  rest of `_shared`. 12 property tests (`test_workspace_dispatch.py`) pin the
  read-back property, that the workspace is touched only on a fully authorized
  path, and that each attempt writes exactly one ledger row. A runnable dry-run
  (`tests/harness/deployment_dryrun.py`) drives the binding against a
  `SimulatedWorkspace` across 7 scenarios — including the silently-dropped-command
  case — and asserts the workspace is commanded **iff** the guard executed; all 7
  pass and their records reseed `ecp_enforcement_ledger`. VANGUARD Response, the
  Edge Connector Control Plane and the Active List Manager now carry the honest
  status `DEPLOYMENT_READY`: their production binding is written and proven end to
  end against a *simulated* workspace. This is **not** `VERIFIED_IN_DEPLOYMENT` —
  that requires running this same binding against the live Databricks workspace
  and observing the read-back there.
- **Phase 7 — Real Unity Catalog client + a promotion gate that cannot lie.** The
  binding's simulated client is joined by the real one, `DatabricksWorkspaceClient`
  in `_shared/databricks_workspace.py`: `apply` invokes the Unity Catalog
  `execute_response_action(action_type, target)` function and `observe` reads the
  target's state back from the response-state table. `spark` is injected (duck-typed,
  no pyspark import, import-safe offline); object names come from operator config and
  are validated against a strict identifier whitelist, and action_type/target are
  passed as **bound parameters** (`spark.sql(sql, args=...)`), never concatenated, so
  a crafted target cannot inject SQL. `live_dispatch` wires this client through the
  same chokepoint and stamps the recorded row `provenance="live"`. The honesty is
  enforced by `_shared/deployment_promotion.py`: an agent becomes
  `VERIFIED_IN_DEPLOYMENT` **only** when it has a ledger row that is executed,
  `VERIFIED`, *and* `provenance="live"`; an unmarked row defaults to `simulated`, so
  the gate fails closed and a dry-run success can never promote. A new `provenance`
  column on `ecp_enforcement_ledger` (default `'simulated'`, checked in
  `('simulated','live')`) tags every row; all 7 current rows are `simulated`, so the
  gate holds every agent at `DEPLOYMENT_READY` — **zero** are `VERIFIED_IN_DEPLOYMENT`.
  13 property tests (`test_deployment_promotion.py`) pin the gate — simulated never
  promotes, live-`FAILED`/`EXECUTE_ERROR` never promotes, only live-`VERIFIED` does —
  and 8 (`test_databricks_workspace.py`, driven by a FakeSpark) pin the client's
  shape: apply calls the UC function, observe reads back and returns the state, values
  are bound not embedded, and a blocked path never touches the workspace. The console
  shows each row's provenance and reserves the `VERIFIED_IN_DEPLOYMENT` label,
  honestly held at zero.

- **Phase 8 — Capability leases: authorization as single-use, argument-bound currency.**
  Through Phase 7 an authorized action was a boolean state (a different operator had
  approved a proposal bound to a finding revision). Phase 8 turns authorization into a
  *lease* that cannot be replayed, raced, or reused after the target argument changes.
  `_shared/canonical_action.py` fingerprints an action's identity (agent, action,
  target, finding + revision) into a stable `action_hash`; `_shared/capability.py`
  mints leases signed with a server-held HMAC key the agent never sees, bound to that
  hash, time-boxed, revocable, and single-use by default. `verify` is a read-only
  check; `redeem` verifies **and** atomically claims one use through an injected
  consumption store, so concurrent redemptions of one single-use lease resolve to
  exactly one winner. `_shared/reason_codes.py` gives every refusal a stable,
  greppable code. The enforcement chokepoint gains an optional connector-side
  revalidation gate: after the kernel and approval clear, the connector re-derives the
  exact action and redeems the lease against it (`enforcement.guard_and_dispatch(...,
  connector_verify=...)`, forwarded through `workspace_dispatch.dispatch` and
  `databricks_workspace.live_dispatch`) — so a stale, replayed or argument-mismatched
  authorization fails closed and the workspace is never touched. 23 adversarial
  property tests (`test_capability.py`) probe each attack — TOCTOU argument change,
  forged/edited lease, expiry, revocation, replay, a 50-thread race, holder mismatch,
  and the same properties end-to-end through Gate 2. All pure stdlib and offline; the
  deployment consumption store (Delta/Supabase-backed) will implement the same
  four-method contract. This is `VERIFIED_IN_CODE`: no agent status changes — all
  remain `DEPLOYMENT_READY`.

## Next phase

Two tracks remain, both requiring resources this environment does not have:

- **Live-workspace execution (deployment milestone).** Everything up to the live call
  is built and tested offline: the real client, bound-parameter SQL, the promotion
  gate, the provenance-tagged ledger, and now argument-bound capability leases.
  Running `databricks_workspace.live_dispatch` for one agent against a live Databricks
  workspace — with the `execute_response_action` function and response-state table
  deployed, real credentials, and a redeemed capability — on an approved, in-scope
  target writes the first `provenance="live"` row; if its independent read-back
  confirms the effect, the promotion gate flips that one agent to
  `VERIFIED_IN_DEPLOYMENT`.
- **Omnigent PEP integration (Phase 9+).** Bind the 0xDSI decision as a runner-level
  Omnigent policy (ALLOW/DENY/ASK), persist the capability ledger and consumption
  store to Delta/Supabase (`ecp_capabilities`), and compute an honest
  EnforcementCoverage per agent — no agent labelled FULLY_GOVERNED until a real
  Omnigent runner mediates its action paths.
