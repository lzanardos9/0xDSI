# Databricks Sizing & Deal Qualification — 315 GB/day Cyber Opportunity

**Purpose:** Give a defensible ballpark cost/scope for a Databricks-based (lakehouse SIEM) cyber engagement so you can decide whether to pursue, and answer the prospect's RFP-style checklist against what this platform (0xDSI, Databricks-native build) actually delivers today.

**Status of the inputs:** Early days. Sources, detections, and integrations are still being worked out. Everything below is a **planning ballpark with explicit ranges**, not a quote. Treat the midpoints as "safe to say out loud," the highs as "if they turn on everything."

---

## 0. The most important thing to get straight first: MRR vs. COGS

Your sizing tool threw **$3–7k MRR at list**. Before anything else, be clear on which number that is, because two very different numbers are floating around:

| Number | What it is | Who pays whom |
|---|---|---|
| **MRR (your revenue)** | What you bill the customer for the software/detections/managed layer | Customer → you |
| **Databricks consumption (COGS)** | The DBU + cloud (AWS) bill to actually run the workload | You (or customer) → Databricks/AWS |

**A $3–7k MRR at 315 GB/day is almost certainly the *software/platform* line, not the fully-loaded Databricks compute bill.** As shown below, the raw Databricks + AWS consumption for a *continuously running AI SOC* at this volume lands in the **~$8–15k/month expected range**. So one of two commercial models must be true, and you need to confirm which on the next call:

- **Model A — Customer owns the Databricks contract.** They pay Databricks/AWS directly for consumption; you layer $3–7k MRR on top for detections + agentic SOC + managed service. **This is the healthy version of the deal.**
- **Model B — You resell/absorb the Databricks consumption inside your MRR.** At $3–7k MRR this deal is **underwater** against ~$8–15k of consumption. Do not commit to a bundled number until sizing is locked.

**Recommendation:** Do not hand over a single blended number this early. Give them the *consumption* ballpark below, keep your MRR as a separate software line, and make explicit that Databricks/AWS consumption is either (a) on their paper or (b) a pass-through + margin.

---

## 1. Volume assumptions used for sizing

| Input | Value | Notes |
|---|---|---|
| Splunk ingest | ~275 GB/day | Bulk of the volume |
| Sentinel ingest | ~40 GB/day | Stays hot in Sentinel (hybrid model) |
| **Total ingest** | **~315 GB/day** | ~13 GB/hr avg, ~3.6 MB/s — *small* for Spark, but bursty |
| Annualized raw | ~115 TB/year | Before compression |
| Landed (Delta, ZSTD ~8–10x) | ~35–45 GB/day physical, ~13–16 TB/year | What you actually store |
| Named sources | Defender, Purview, Palo Alto, Horizon3, Wiz, GuardDuty, Arista, Halcyon, Abnormal | Coverage detail in §3 |

**Reality check:** 315 GB/day is a *modest* streaming volume for Databricks. The cost driver here is **not** raw ingest throughput — it's (1) how much of the workload runs 24/7, (2) the **agentic AI / LLM** triage layer, and (3) **interactive search compute** (SQL serverless / NL queries). Those three dominate the bill, not the GB count.

---

## 2. Cost model — bottoms-up, all-in (DBU + AWS)

Numbers are **all-in monthly** (Databricks DBU list + underlying AWS EC2/storage), rounded to honest ranges. DBU list rates assumed: Jobs/Structured Streaming ~$0.15–0.20/DBU, DLT ~$0.20–0.36/DBU, SQL Serverless ~$0.70/DBU, Model Serving/FM billed per-token or per-DBU-hour. AWS VM cost is roughly comparable to the DBU cost on Jobs compute.

| Layer | What runs | Expected $/mo (all-in) |
|---|---|---|
| **1. Streaming ingestion + OCSF normalization** | 24/7 structured streaming / DLT, small autoscaling cluster (2–5 nodes) | **$2,000 – $4,500** |
| **2. Detection & correlation engines** | Streaming + scheduled correlation, graph/CET analytics | **$1,500 – $4,000** |
| **3. Agentic AI SOC (LLM triage/enrichment)** | Foundation Model API tokens + model serving; scales with alert volume | **$1,500 – $5,000** |
| **4. Federated / interactive search** | SQL Serverless for hunting + NL queries (each query burns credits) | **$1,000 – $3,000** |
| **5. Storage** | S3/ADLS Delta, ~13–16 TB/yr growing with retention | **$800 – $2,500** |
| **6. Vector search + ML endpoints** | Embeddings, similarity, scoring models | **$500 – $1,500** |
| **7. Unity Catalog / Workflows / monitoring** | Governance + orchestration overhead | Minor / included |

### Scenario totals (Databricks + AWS consumption only)

| Scenario | Description | All-in $/month |
|---|---|---|
| **Lean** | Micro-batch windows, minimal always-on AI, hunting on-demand only | **~$5,000 – $7,500** |
| **Expected** | Streaming detections + moderate agentic triage + regular hunting | **~$8,000 – $13,000** |
| **Rich** | Continuous real-time detection + heavy LLM triage on every alert + always-hot search | **~$15,000 – $25,000** |

**Ballpark to work around:** for a genuinely *continuously running AI SOC* at 315 GB/day, plan on **~$10–13k/month of Databricks + AWS consumption**, with strong levers (below) to push it toward ~$6–8k if the customer accepts micro-batch latency and on-demand hunting.

### Year-1 vs. steady-state

Storage and long-retention cost **grow over time** as the lake fills. Year 1 average is lower (lake is filling); by year 2–3 with full retention, storage and replay/backfill compute rise. Budget a **~15–25% escalation** into a multi-year forecast.

---

## 3. Connector coverage (their key feeds) — honest status

Coverage is drawn from the edge-collector connector suite (`edge-collector/crates/connectors/…`) plus the OCSF normalizer. Green = shipping connector exists; Amber = adjacent connector exists / straightforward build; Red = net-new build.

| Requested source | Status | Where / notes |
|---|---|---|
| **Microsoft Defender** (Endpoint / O365 / Cloud) | 🟢 | `edr/defender_endpoint.rs`, `email-security/defender_o365.rs`, `cloud-azure/defender_cloud.rs` |
| **Microsoft Purview** | 🟢 | `dlp/purview.rs` |
| **Microsoft Sentinel** | 🟢 | `siem/sentinel.rs` — supports the hybrid "Sentinel stays hot" model |
| **Palo Alto** | 🟢 | `firewall/palo_alto.rs` |
| **Wiz** | 🟢 | `vuln/wiz.rs` |
| **AWS GuardDuty** | 🟢 | `cloud-aws/guardduty.rs` |
| **Horizon3** (NodeZero) | 🔴 | Net-new connector; REST API, straightforward but not built |
| **Arista** | 🟠 | Syslog/CEF parsers exist; needs a device profile, not a from-scratch build |
| **Halcyon** (anti-ransomware) | 🔴 | Net-new connector |
| **Abnormal Security** (email) | 🔴 | Net-new connector; sits alongside existing email-security connectors |

**Takeaway for the call:** ~6 of their named feeds are covered today; **Horizon3, Halcyon, and Abnormal are net-new** and Arista is a profile/parser task. Scope 3–4 connector builds into the SOW. Every connector normalizes to **OCSF** via `edge-collector/crates/ocsf/normalizer.rs`.

---

## 4. RFP checklist — mapped to what the platform does today

### Data Ingestion & Normalization
- **Multi-source ingest (cloud/on-prem/SaaS/custom):** Yes — Rust edge-collector fleet + Databricks bronze ingestion (`notebooks/ingestion/`).
- **OCSF normalization:** Yes, native in the edge collector; every event lands OCSF-typed.
- **Coexistence with upstream normalizers (DataBahn):** Supported — if data is already OCSF-normalized upstream, you skip the normalization stage and land directly in bronze/silver. Worth confirming their DataBahn output schema to avoid double-normalization cost.
- **Land in customer's own object storage (S3/ADLS) in open formats (Delta/Iceberg):** Yes — this is the core lakehouse model. Data stays in *their* cloud account in open Delta.

### Sentinel & Lake Connectivity
- **Query Sentinel (incidents/alerts/analytics/tables):** Sentinel connector exists; supports pulling incidents/alerts into the lake.
- **Query lake telemetry in S3/ADLS:** Native.
- **Hybrid (Sentinel hot SIEM + lake for high-volume/long-retention):** This is the recommended architecture — route the 275 GB/day Splunk-class volume to the lake, keep the 40 GB/day Sentinel-critical data hot. Directly addresses their cost problem.

### Federated Search & Correlation
- **Search across Sentinel + lake together:** Achievable via federation; some Sentinel data pulled/mirrored to lake for unified query.
- **Entity correlation (user/host/IP/domain/URL/process/cloud resource):** Yes — entity-spine + graph correlation (`notebooks/correlation/08_entity_spine.py`, `03_graph_correlation.py`).
- **NL + SQL/KQL:** SQL native; NL query layer exists. **Yes, NL queries consume compute/credits** (SQL Serverless + LLM tokens) — flag this as a cost lever, not free.

### Detection & Analytics
- **Detection-as-code (author/test/version/deploy):** Yes — versioned DaC system (migration `…add_detection_as_code_versioning`, `RuleVersionDrawer`, `DaCStatusBadge`).
- **Reuse/translate existing Sentinel KQL:** Partial — detection SLM assists translation, but expect a **migration project** for their KQL library, not a one-click import. Scope it.
- **MITRE ATT&CK mapping + gap analysis:** Yes (`MitreAttackMatrix`).
- **OOTB content vs. build-your-own:** Ships a correlation-rules library; expect a **blend** — meaningful OOTB coverage plus customer-specific detections to build.

### Investigation, Triage & Response
- **AI triage/enrichment/recommended actions:** Yes — agentic SOC (TRIAGE/SAGE/NOVA/VANGUARD agents). This is the layer that justifies your MRR.
- **Evidence-backed investigation summaries:** Yes (incident summarizer + unified evidence object).
- **Historical investigation beyond Sentinel hot retention:** This is the lake's core value — long retention at object-storage cost.
- **Response/SOAR:** Automated response + approvals exist; deep bi-directional SOAR into *their* tooling is partly build-your-own. Scope it.

### Governance, Risk & Compliance (Unity Catalog)
- **Lineage / granular permissions / central audit:** Unity Catalog native.
- **Coexistence with Microsoft Purview:** Complementary — UC governs the lake; Purview governs M365/data estate. Confirm boundary, avoid overlap.
- **Audit of searches/queries/detection changes/investigations:** Yes — UC audit events + activity lineage (`…add_unity_catalog_audit_events`, `create_user_activity_tracking_lineage`).

### Cost Model & Forecasting
- **DBU/compute breakdown:** §2 above.
- **AI/LLM pricing (token/hour):** Foundation Model APIs bill per-token; model serving can be per-DBU-hour. **This is the most variable line** — scales with alert volume × tokens/alert.
- **Forecasting a continuous AI SOC + cost levers:** See §5.
- **Storage/compute separation + egress:** Fully separated (lakehouse). Watch **cross-region/cross-cloud egress** — keep compute in the same region as their S3/ADLS.

### Security of the Platform Itself
- **Native workspace audit/access logging (for their CSPM of Databricks-in-AWS):** Databricks provides workspace audit logs + UC access logs, deliverable to their S3 for CSPM ingestion. Answer: **yes, natively available.**

---

## 5. Cost-control levers (say these out loud — they build trust)

1. **Hybrid routing:** high-volume/low-value telemetry → lake (cheap Delta); keep only critical detections hot in Sentinel. Biggest single saver at this volume.
2. **Micro-batch vs. real-time:** 30–60s micro-batch triggers instead of continuous mode cuts always-on cluster cost materially. Reserve real-time for the few detections that need sub-second.
3. **Scale-to-zero serving endpoints:** agentic/model endpoints idle to zero; pay only on invocation (accept a cold-start tradeoff).
4. **Token budgets on agentic triage:** cap tokens/alert and gate LLM triage to alerts above a severity/confidence threshold — don't LLM every event.
5. **SQL Serverless discipline:** NL/interactive queries burn credits; put guardrails on ad-hoc hunting compute.
6. **Photon + Z-ORDER / liquid clustering:** faster scans = fewer DBUs for the same detections.
7. **Tiered retention:** hot (recent) vs. cold (archived Delta) to control storage growth.

---

## 6. Bottom line — does it make sense to pursue?

**Yes, worth pursuing — with two conditions confirmed on the next call:**

1. **Commercial model (Model A vs. B in §0).** If the customer owns the Databricks/AWS contract and your $3–7k MRR is the software/managed layer on top, the deal is healthy. If your MRR must *absorb* ~$8–13k of consumption, it's underwater — reprice or restructure.
2. **Connector scope.** ~6 named feeds covered; **Horizon3, Halcyon, Abnormal are net-new** and Arista needs a profile — bake 3–4 connector builds into the SOW.

**Number to work around:** Databricks + AWS consumption of **~$10–13k/month expected** (~$6–8k lean, up to ~$20–25k rich) for a continuously running AI SOC at 315 GB/day, **separate from** your platform MRR. Hold off on a single blended figure until sources/detections and the commercial model are locked — this is still early days and a wrong number now is hard to walk back.

---

*Sizing is a planning ballpark, not a quote. DBU list rates and Foundation Model token pricing change; validate against current Databricks pricing and a short paid POC (2–4 weeks) before committing contract numbers.*
