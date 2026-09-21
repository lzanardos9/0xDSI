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

## Next phase

**Phase 1 — Deterministic authority kernel.** Extract the propose/approve/dispatch/verify
checks from `_shared/response_actions.py` into a standalone, fully unit-tested authority
kernel with explicit ROE/scope rules and reason codes, so every action decision is
deterministic and explainable independent of any LLM.
