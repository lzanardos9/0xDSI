# American Airlines Identity Datalake — 0xDSI Coverage & Databricks-Only Build Plan

**Scope.** This document takes the American Airlines "Identity Datalake" proposal (problem statement, design principles, capability table, and functional requirements FR-001 through FR-034) and states, item by item, whether the 0xDSI platform accomplishes it **today**, accomplishes it **partially**, or **does not** (a gap). For everything not covered natively, it gives a build plan that uses **Databricks-native features only** — no third-party analytics engine, no external graph database, no non-Databricks orchestration.

**Honesty note on "Databricks only."** AA's own design principle is *"do not be the actor"* — XSOAR, Saviynt, Entra ID, and PingFederate execute changes; the platform only decides and dispatches. So a small, deliberate set of items live **at the protocol edge by design** (SAML/OIDC/SCIM/Shared Signals receivers and the outbound calls to the IdPs). Those wire protocols are hosted as thin **Databricks Apps** endpoints or edge collectors; the decisioning, storage, graph, scoring, and AI all run inside the Databricks Workspace. Where an item cannot be *purely* Databricks, it is flagged.

---

## Legend

| Status | Meaning |
|--------|---------|
| **Native** | Accomplished today with existing 0xDSI capability; configuration only. |
| **Partial** | Core machinery exists and is reused; an identity-specific layer must be built on top. |
| **Gap** | Not present today; net-new build (plan below). |

**Databricks feature vocabulary used in the plan:** Delta Lake medallion (Bronze/Silver/Gold, ACID, time travel, Z-Order), Unity Catalog (RBAC, tags, lineage, column masking, row-level security), Lakeflow Connect / Auto Loader / Structured Streaming (ingest), Delta Live Tables (declarative pipelines), **GraphFrames on Spark** (native graph + motif/path analysis), Lakebase (CDC-synced Postgres, ~50 ms) and Brickstore / Online Tables (<10 ms) for sub-second reads, Foundation Model APIs + Mosaic AI Agent Framework + Model Serving (LLM/agents), Vector Search, Genie (NL→SQL), MLflow (versioning), Databricks Workflows + **Databricks Asset Bundles** (CI/CD / policy-as-code), Delta Sharing (scoped external views), Lakehouse Federation (query without copy), and system tables / audit logs.

---

## 1. Design Principles

| Principle | Status | Basis / Plan |
|-----------|--------|--------------|
| Do not be a SIEM (store contextual state + reference SIEM IDs) | **Native (by config)** | Medallion already stores contextual state; enforce a "reference-only" rule — timeline rows carry a `siem_txn_id` column, never raw log bodies. |
| Do not be the actor (decide/recommend; others execute) | **Native** | Ethical Control Plane / Omnigent is a recommend-and-dispatch engine with fail-closed chokepoint, human approval, single-use capability leases, and dispatch to authorized executors. This is the platform's strongest alignment point. |
| Be vendor agnostic (SAML, OAuth2/OIDC, SCIM, Shared Signals) | **Partial** | Edge collector supports REST/CEF/Syslog/STIX-TAXII; **SCIM and Shared Signals (CAEP/RISC) receivers are a gap** — build as Databricks Apps endpoints (Phase 4). |
| Be explainable (named, versioned score factors) | **Partial** | Reason codes + 8-dimension formula prioritization + SHAP/attention exist; identity-specific factor model to build (Phase 2). |
| Be fast (sub-second reads; 5-nines or fail-secure) | **Native** | Tiered serving: Brickstore <10 ms, Lakebase ~50 ms, Lucene ~100 ms, Delta ~1 s. Omnigent is fail-closed by design. |

---

## 2. Capability Table

| Capability | Status | Basis today / What must be built |
|-----------|--------|----------------------------------|
| Unified identity graph | **Partial** | Entity spine (User-IP-Host-App) + GraphFrames correlation exist; **canonical cross-provider resolution is a gap** (Phase 0). |
| Unified risk score (0-100, explainable) | **Partial** | Dempster-Shafer fusion + formula scoring exist; identity factor composition from Entra/Duo/Ping/Saviynt/Akamai to build (Phase 2). |
| Attack path analytics (replace BloodHound, beyond AD) | **Partial** | Graph engine + Attack Path Forecaster (agent 60) + Glasswing reachability exist; multi-provider modeling + BloodHound parity to build (Phase 3). |
| Identity timeline (readable life history) | **Gap** | Build narrative timeline (Phase 1). |
| Policy as code | **Partial** | Detection-as-Code + Omnigent policy layer exist (not OPA); Databricks-native policy pipeline to build (Phase 4). |
| Closed-loop response | **Partial** | Omnigent dispatch + ALHF analyst-feedback loop (agent 25) exist; Entra CA / Ping / session-kill + SSF connectors to build (Phase 4). |
| What-if modeling | **Partial** | Monte Carlo / threat simulator exist; graph mutation what-if to build (Phase 3). |
| Group contextualization (purpose/owner + confidence) | **Gap** | Build with Vector Search + Foundation Models (Phase 5). |
| Agentic query interface (MCP) | **Native** | MCP Registry ships today; add graph/entitlement tools (Phase 3). |
| Operational answers on demand | **Partial** | CISO Assistant / Genie exist; curate repeatable identity answer packs (Phase 1/5). |
| Owner-routed remediation | **Partial** | Glasswing + ServiceNow + multi-tenant scoped views exist; GRC app-record linkage to build (Phase 4). |

---

## 3. Functional Requirements

### 3.1 Identity Aggregation & Resolution

| FR | Pri | Status | Basis / Gap |
|----|-----|--------|-------------|
| FR-001 Ingest identities (AD, Entra, PingDirectory, Saviynt, Duo, app-local) | M | **Partial** | Connectors exist for Entra/Okta/Ping-class sources; PingDirectory, Saviynt-as-identity-source, and app-local directories to configure (Phase 0). |
| FR-002 Resolve accounts → one canonical identity (deterministic + probabilistic + confidence) | M | **Gap** | The "nucleus." Build resolution pipeline (Phase 0). |
| FR-003 Personas as first-class typed entities | M | **Gap** | Typed persona model on the spine (Phase 0). |
| FR-004 Non-human identities (service/workload/API/cert-bound) | M | **Gap** | NHI typing on the spine (Phase 0). |
| FR-005 Agentic identities (source-of-truth, owning human, scopes, host) | M | **Gap** | Agentic identity model (Phase 0). |
| FR-006 Identity state model (Enabled/Suspended/Disabled/Locked) + per-directory mapping | M | **Gap** | State model + attribute mapping table (Phase 0). |
| FR-007 Correlate every NHI to a GRC application record; flag uncorrelated | M | **Gap** | Join to GRC app inventory; flag orphans (Phase 4). |
| FR-008 Preserve provider IDs; reverse-navigate canonical → source | M | **Partial** | Delta can hold cross-ref; build the provider-ID cross-reference table (Phase 0). |
| FR-009 Identity proofing state on the spine | M | **Gap** | Proofing columns (method, provider, assurance level, timestamps, expiry) (Phase 1). |

### 3.2 Telemetry & Timeline

| FR | Pri | Status | Basis / Gap |
|----|-----|--------|-------------|
| FR-010 Ingest auth/authz/enrollment/risk telemetry (Entra, Ping, Duo, Defender for Identity, Akamai AP, Semperis DSP, Sonrai/Wiz) | M | **Partial** | Many sources connectable; Akamai Account Protector, Semperis DSP, Sonrai/Wiz to add (Phase 1). |
| FR-011 Chronological human-readable timeline per identity | M | **Gap** | Timeline Gold table (Phase 1). |
| FR-012 Narrative rendering (not raw log format) | M | **Gap** | Foundation Model narrative generation (Phase 1). |
| FR-013 Reference SIEM log/txn ID, don't duplicate raw event | M | **Partial** | Enforce reference-only column contract (Phase 1). |
| FR-014 Record every risk transition with contributing factors | M | **Partial** | Reason codes exist; wire to identity score history (Phase 2). |
| FR-015 Lockout root-cause attribution | C | **Gap** | Correlation job attributing source host/process/stale credential (Phase 5). |
| FR-016 Retention tiers (hot/warm/cold) | M | **Native** | Delta lifecycle + tiered serving already provide this. |
| FR-017 Ingest PingFederate policy config + correlate to apps/identities/events | S | **Gap** | Ping policy parser + GraphFrames correlation (Phase 5). |
| FR-018 Policy drift/redundancy posture findings | S | **Gap** | Derived from FR-017 correlation (Phase 5). |

### 3.3 Graph & Relationship Analytics

| FR | Pri | Status | Basis / Gap |
|----|-----|--------|-------------|
| FR-020 Graph of identities/groups/roles/entitlements/resources/devices/apps | M | **Partial** | GraphFrames graph exists; extend to full identity object model (Phase 3). |
| FR-021 Privilege escalation / attack paths beyond AD (Entra, Saviynt, Ping) | M | **Partial** | Path engine exists; multi-provider edges to model (Phase 3). |
| FR-022 Tier violations (Tier 0/1/2/Unassigned) | M | **Partial** | Tiering rules to formalize as GraphFrames motifs (Phase 3). |
| FR-023 BloodHound parity sufficient to retire it | M | **Gap** | AD-specific path classes (ACL abuse, delegation, ADCS) (Phase 3). |
| FR-024 What-if modeling (remove from group / delete group / collapse role) | M | **Partial** | Graph-mutation simulation on scratch Delta (Phase 3). |
| FR-025 Blast-radius (reachable resources ranked by criticality) | M | **Partial** | Glasswing reachability + GraphFrames BFS (Phase 3). |
| FR-026 Expose graph query via MCP | S | **Partial** | MCP Registry exists; add graph tool (Phase 3). |

### 3.4 Risk Scoring

| FR | Pri | Status | Basis / Gap |
|----|-----|--------|-------------|
| FR-030 Composite 0-100 score, recomputed on event arrival | M | **Partial** | Fusion + Structured Streaming exist; identity composite to build (Phase 2). |
| FR-031 Decompose into named/weighted/versioned factors in UI + API | M | **Partial** | Explainability primitives exist; surface identity factors (Phase 2). |
| FR-032 Declarative factors/weights/thresholds/decay (no code change) | M | **Partial** | Config-in-Delta + Unity Catalog functions + Asset Bundles versioning (Phase 2/4). |
| FR-033 Separate but linked identity / session / entitlement risk | M | **Gap** | Three linked dimensions on the score model (Phase 2). |
| FR-034 Time decay for transient, persistence for structural signals | M | **Partial** | Decay curves exist in formula prioritization; parameterize for identity (Phase 2). |

> The requirements list provided ends at FR-034 (FR-035 appears without text). Items beyond FR-034 are not assessed here and should be appended when supplied.

---

## 4. Scorecard Summary

| Bucket | Count (of the 34 FRs assessed) |
|--------|-------------------------------|
| **Native** (ready / config-only) | 1 (FR-016) — plus 5 design principles largely met |
| **Partial** (reuse + extend) | 15 |
| **Gap** (net-new build) | 18 |

**Verdict.** 0xDSI is not a drop-in Identity Datalake, but it supplies the hardest-to-build foundations — lakehouse, native graph, explainable fusion, agentic/MCP query, tiered sub-second serving, and (uniquely) the *recommend-not-execute* governance and analyst-feedback loop AA explicitly wants. The gaps cluster into a **canonical identity spine**, an **identity-specific data & scoring model**, **multi-provider graph depth**, and **protocol-edge connectors** — all buildable with Databricks-native features below.

---

## 5. Databricks-Only Build Plan for the Gaps

Each phase names only Databricks-native building blocks.

### Phase 0 — Canonical Identity Spine (FR-001, 002, 003, 004, 005, 006, 008)
- **Ingest** per-provider identity records with **Lakeflow Connect / Auto Loader / Structured Streaming** into **Bronze** Delta tables (one per provider), preserving native identifiers.
- **Resolve** to a canonical identity: deterministic join keys first (UPN, employeeID, SID, certificate thumbprint); probabilistic fallback via **Spark ML** similarity features feeding **GraphFrames `connectedComponents`** to cluster provider accounts into one canonical node; persist a **`confidence`** column.
- **Model** personas, non-human, and agentic identities as **typed rows + Unity Catalog tags**; hold the **state model** (Enabled/Suspended/Disabled/Locked) with a per-directory attribute-mapping table.
- **Cross-reference** table gives reverse navigation (canonical → each source record).
- **Serve** the spine through **Lakebase (~50 ms)** and **Brickstore / Online Tables (<10 ms)** for runtime decisioning.

### Phase 1 — Telemetry, Timeline & Proofing (FR-009, 010, 011, 012, 013, 016)
- **Structured Streaming + Auto Loader** land telemetry to Bronze; **Delta Live Tables** promote to Silver with a **`siem_txn_id`** reference column and **no raw log body** (enforces "not a SIEM").
- **Timeline** as a Gold Delta table keyed to canonical identity; entries generated as human-readable narrative by a **Foundation Model API** batch job on **Model Serving** ("User XYZ enrolled in MFA with authenticators A, B, C").
- **Proofing state** columns added to the spine (method, provider, assurance level, proofed-at, expires-at).
- **Retention tiers** via Delta table lifecycle + the existing tiered serving (hot/warm/cold).

### Phase 2 — Unified Explainable Risk (FR-014, 030, 031, 032, 033, 034)
- **Factor config in Delta** (factor name, weight, threshold, decay curve), versioned through **Databricks Asset Bundles** and **MLflow** so weights change without code.
- **Unity Catalog SQL/Python functions** compute the composite **0-100** score across three linked dimensions — **identity / session / entitlement** — recomputed on event via Structured Streaming.
- Persist a **score-transition history** row per change with named contributing factors (satisfies FR-014 + FR-031); surface in the **Databricks App** UI and DBSQL/API.

### Phase 3 — Identity Graph & Attack Path (FR-020, 021, 022, 023, 024, 025, 026)
- Build the full object graph in **GraphFrames on Spark** (identities, groups, roles, entitlements, resources, devices, apps) with provider-typed edges for **Entra role assignments, Saviynt entitlements, PingFederate scopes**.
- **Motif queries** for privilege-escalation and **tier-violation** detection (Tier 0/1/2/Unassigned); AD-specific path classes (ACL abuse, delegation, ADCS) to reach **BloodHound parity**.
- **Blast radius** via **BFS/shortest-path** ranked by resource criticality; **what-if** by mutating the graph in a scratch Delta table and recomputing.
- Expose a **graph query MCP tool** (over DBSQL / Model Serving) so agents answer directory questions without Cypher/LDAP.

### Phase 4 — Policy-as-Code, Closed Loop & Owner Routing (Policy, Closed-loop, FR-007, Owner-routed remediation)
- **Databricks-native policy-as-code** (the OPA substitute): declarative policy tables + **Unity Catalog functions**, versioned and shipped through **Databricks Asset Bundles** CI/CD — decisions stay explainable and diffable.
- **Closed loop:** Omnigent dispatches governed decisions to **XSOAR / Entra Conditional Access / PingFederate** via **Databricks Workflows** REST tasks; **ALHF (agent 25)** feeds analyst verdicts back to source engines.
- **Protocol edge (flagged non-pure-Databricks):** **SCIM** and **Shared Signals (CAEP/RISC)** receivers and the cross-plane session-revocation callouts are hosted as thin **Databricks Apps** endpoints — the decision is Databricks, the *execution* is intentionally external per AA's principle.
- **Owner routing (FR-007):** join findings to the **GRC application record**, flag NHIs with no correlation, and expose **scoped owner views** via **Unity Catalog row-level security** + **Delta Sharing** (each app team sees only its own exposure); export to the enterprise VM platform.

### Phase 5 — Group Context, Federation Policy & Lockout (FR-015, 017, 018, Group contextualization)
- **Group contextualization:** **Vector Search** over group membership/name/usage + **Foundation Models** infer purpose, owner, and app correlation with a **0-100 confidence** score.
- **PingFederate policy correlation (FR-017/018):** parse Ping policy config into Bronze, correlate to apps/identities/auth-events with **GraphFrames**, and emit drift/redundancy **posture findings**.
- **Lockout root cause (FR-015):** correlation job attributing lockouts to source host/process/stale credential across the telemetry tables.

---

## 6. What stays external by design

Per AA's "do not be the actor" and "vendor agnostic" principles, these are **not** built inside Databricks and that is correct:
- Actual enforcement (session kill, CA policy change, entitlement revoke) executes in **Entra ID, PingFederate, Saviynt, XSOAR**.
- Wire protocols (**SAML, OIDC, SCIM, Shared Signals**) terminate at thin edge/App adapters; Databricks consumes and emits standardized events.

Everything else — aggregation, resolution, graph, scoring, timeline, policy, decisioning, orchestration, serving, and the AI/agentic layer — runs natively on Databricks.
