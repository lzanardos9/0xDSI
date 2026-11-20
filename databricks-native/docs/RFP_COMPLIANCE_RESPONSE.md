# SGWS TechOps Intelligence & Automation Platform — Compliance, Gaps & Win Strategy

**Documents assessed**
1. *TechOps Intelligence & Automation Platform — Leadership Brief* (Executive Vision, Aug 2026)
2. *TechOps SMO Intelligence & Automation Platform — Business Architecture and Phased Capability Plan* (D. Meretsky / J. Eagle; approver M. Mcmanus; visibility S. Bronson)

**Positioned offer:** 0xDSI (agentic security & operations intelligence app, Databricks-native) + Databricks Lakewatch (Databricks' open, agentic SIEM — Private Preview) + the Databricks Data Intelligence Platform underneath both.

Legend: **C** = Comply today · **P** = Partial (pattern exists, needs extension/config) · **G** = Gap (needs build or partner) · **N/A** = not that product's role

---

## 0. Read this first — what SGWS is actually buying

| Fact from the documents | Implication for us |
|---|---|
| This is a **TechOps / SMO intelligence** platform (ServiceNow, Jira, KPIs, Wins/Risks/Issues, telemetry, cost, delivery). Security is **1 of 10 data domains**. | 0xDSI and Lakewatch are security-led. We must sell the **platform pattern** (lakehouse + governed agents + approvals + evidence) and show security as the first proven domain — not pitch a SIEM. |
| "Technology selection: **Databricks, Microsoft Fabric, Google** or another — not decided." | The real competition is Fabric (Power BI incumbency, Copilot) and Google. Our win is Databricks as the platform; 0xDSI is the accelerator that proves it is already working. |
| The decision requested is **Phase 0 Discovery + MVP planning**, not a product purchase. "Do not commit to a platform vendor … until requirements, governance, value and access are validated." | Do not lead with a license quote. Lead with a **fixed-scope, low-risk Phase 0/MVP offer** that produces their required exit evidence on Databricks. Platform choice follows from that MVP. |
| Value is a **directional $1.1M–$3.1M+**, explicitly not a commitment; Finance must validate. | Bring a benefits-register tool and baseline method, not bigger ROI claims. Credibility beats size here. |
| Heavy emphasis on **evidence, confidence, named owners, human approval, kill switch, rollback**. | This is where 0xDSI is strongest today (approval gates, signed chain of custody, audit log, OBO identity). Make it the headline. |

---

## 1. Executive summary

- **Architecture & controls fit: strong.** The six-layer architecture (sources → foundation → data products → intelligence → leadership products → decision intelligence) matches what 0xDSI already runs on Databricks: medallion pipelines, Unity Catalog governance, ML/forecasting jobs, cited LLM assistant, agents with approval gates, signed audit trail.
- **Security & risk domain: complies today**, and goes beyond the ask (identity graph, attack paths, MITRE, What-If, live feed with signed custody). Lakewatch adds a Databricks-supported SIEM with SQL detections, alerts and Genie agents for that domain.
- **Core TechOps content: the main gap.** ServiceNow and Jira are used today only to **create** tickets from alerts. The RFP needs them **read** as primary data products (incidents, problems, changes, CMDB, SLAs, Jira initiatives and dependencies). Also missing: the TechOps-specific products (Executive Briefing, Wins/Risks/Issues automation, change-risk scoring, Savings & Value register, planning/dependency view), a certified semantic layer, and a Power BI path.
- **Estimated coverage of the full RFP:** about **55–60% Comply/Partial with 0xDSI + Databricks today**, rising to **about 90%** after the gap work in Section 5. Lakewatch alone covers about **20%** because it is a security product.

---

## 2. Compliance matrix — Leadership Brief (Executive Vision)

| # | Requirement | 0xDSI | Lakewatch | Evidence / notes |
|---|---|---|---|---|
| V1 | **Sense** — read operational, service, delivery, security and cost signals continuously in real time | P | P (security only) | Continuous serverless Photon pipelines (bronze/silver/gold), Kafka/EventHub connector, raw ingestion and enrichment notebooks, typed bronze partitioner. Security and OT signals are live; service, delivery and cost sources are not yet connected. |
| V2 | **Understand** — explain what is happening and why, and answer any leadership question with cited evidence | P | P | CISO AI Assistant: Llama 3.1 70B via Model Serving, SQL grounding, vector search. It has security context today; it needs TechOps data and a citation display per answer. Lakewatch offers Genie Code / Genie Agents for security investigation. |
| V3 | **Forecast** — risk, demand, capacity and business impact | P | G | Trend Engine, attack-path forecaster agent, ML training notebooks, MLflow. No incident-volume, capacity or backlog forecast yet. |
| V4 | **Decide** — recommendation, options, tradeoffs and confidence, for C-suite through manager | P | G | What-If simulator, risk scoring, agent orchestrator recommendations. Needs a standard "decision card" (call / options / tradeoffs / confidence / evidence) and views by role. |
| V5 | **Build & Execute** — draft requirements, write and test code, run workflows, coordinate teams, execute approved action | P | P (alert export) | Response approvals, playbooks, ticketing integration (ServiceNow/Jira/PagerDuty create), Slack/Teams notify, Databricks Jobs. Code drafting and testing agents (change proposal → PR → test) are not built. |
| V6 | **Prove & Learn** — measure the result and feed it back | P | G | MLflow tracking, drift monitoring, detection feedback loops. No outcome-vs-promise ledger tied to decisions yet. |
| V7 | Continuously learning; never plateaus | P | P | Retraining jobs, memory cache, feedback tables. Needs a visible "learning" KPI (accuracy over time). |
| V8 | Measurable levers: problem mgmt, change mgmt, CI and executive briefings (30–35 h/week) | G | G | Requires ServiceNow problem/change ingestion plus briefing automation. See gaps G1, G4, G5, G6. |
| V9 | Incident scenario: detect a bad change, quantify affected accounts and locations, drive the correction | P | P | Correlation rules plus Detection Confluence give the detection pattern. Needs the CMDB / change → service → location relationship and business data. |
| V10 | Change priority: auto-score every change for risk and flag gaps before approval | G | N/A | Not built. High-value quick win (G4). |
| V11 | Planning: priorities, dependencies, ownership and cost in one place (10 L4 portfolios) | G | N/A | Not built (G7). |
| V12 | Per-leader products (CEO / CIO / VP / Director / Manager) | P | G | Executive, CISO, Public Sector and Business overview dashboards exist; they need TechOps content and role-based filtering. |
| V13 | Trust: evidence on everything, governed by design, human owns the call, proves itself | **C** | P | OBO identity, Unity Catalog, response approvals, `system_audit_log`, SHA-256 + HMAC sealed chain of custody. This is our strongest proof point. |

---

## 3. Compliance matrix — Business Architecture & Phased Plan

### 3.1 Capability groups (Section 3)

| Capability group | 0xDSI | Lakewatch | Evidence / gap |
|---|---|---|---|
| Data acquisition & integration (without changing the source of record) | P | P | Kafka/EventHub, SAP, PLC/OT, STIX/TAXII, Lakebase sync connectors; Lakewatch ingest and parse. **Missing: ServiceNow table API, Jira REST, cloud billing, APM/observability.** Lakeflow Connect has a managed ServiceNow connector we can use. |
| Data quality & standardization | P | C (security) | DLT expectations, OCSF normalization. Need ITSM quality rules (required fields, reconciliation) plus an exceptions view. |
| Relationship & graph intelligence | **C** | G | Identity graph, AccessGraphCanvas, attack paths, blast radius. Same engine extends to service → application → CI → owner → initiative → risk. |
| Semantic & metric management | G | G | No certified metric layer. Use Unity Catalog **Metric Views** plus a metric registry (owner, definition, refresh, quality). |
| Analytics & reporting from certified data products | P | P | Many dashboards; AI/BI dashboards possible. Need a "certified" flag and **Power BI** connectivity (Databricks connector, DirectQuery). |
| AI retrieval & assistance (structured + unstructured, evidence-backed) | P | P | Vector search, LLM, SQL grounding. Add **Genie spaces** on TechOps data plus knowledge-base retrieval with citations. |
| Prediction & decision support | P | G | ML jobs, MLflow, forecasting agents. Add ITSM forecasts and decision cards. |
| Workflow & agentic automation (controls, monitoring, rollback) | **C/P** | P | Agent orchestrator, approvals, playbooks, ticket creation, AI Gateway guardian. Rollback exists for response actions; formalize it for every action. |

### 3.2 Data domains (Section 4)

| Domain | 0xDSI | Lakewatch | Notes |
|---|---|---|---|
| Service management (incidents, problems, changes, SLA, CMDB) | G | G | **Gap G1 — the number one priority.** |
| Observability & telemetry | P | P | Log and event ingestion exists; APM / infra metrics (Datadog, Dynatrace, Splunk ITSI, Azure Monitor) connectors needed. |
| Network & infrastructure | P | P | Network telemetry for security; add availability and capacity. |
| Cloud & platforms (consumption, reliability, vulnerabilities) | P | P | Vulnerabilities and cloud security covered; **cloud cost** (FOCUS format billing) missing. |
| End-user services | G | N/A | Service Desk / endpoint experience data. |
| Security & risk | **C** | **C** | Full coverage: detections, identity, MITRE, compliance, honeypot, red team, phishing. |
| Delivery & portfolio (Jira) | G | N/A | **Gap G2.** |
| Financial & vendor | G | N/A | **Gap G8.** |
| Architecture & relationships | P | N/A | Graph engine ready; needs CMDB / EA feed. |
| Business operations & sales | P | N/A | SAP connector plus multi-tenant pattern; MVP must not depend on it (per RFP). |

### 3.3 Leadership & operational products (Section 6)

| Product | Phase | 0xDSI | Lakewatch | Notes |
|---|---|---|---|---|
| Operational reports | 1 | P | P | Pattern exists; needs ITSM content. |
| Executive briefing (Steve, Michael, Joel) | 1 | P | G | LLM briefing exists for security; build a weekly TechOps brief generator ("what changed, why it matters, decisions"). |
| Technology health dashboard | 1 | P | G | Overview dashboard (posture ring, KPIs, response targets) is reusable as a template. |
| Wins, Risks & Issues | 1 | G | G | **Gap G5.** Agent drafts WRI from data; a human edits and approves. |
| Savings & value dashboard | 1–2 | P | G | Business value / ROI widgets exist; needs a real benefits register (G6). |
| SMO / resilience scorecard | 1–2 | P | G | Scorecards exist (security). Add incident / problem / change / corrective-action KPIs. |
| AI Q&A assistant (permission-based) | 2 | **C/P** | P | OBO auth enforces source permissions; add citations UI and TechOps corpora. |
| Business-impact dashboard | 2–3 | P | G | Blast-radius pattern; needs service → process → location mapping. |
| Delivery & priority dashboard | 2–3 | G | N/A | G2 + G7. |
| Predictive operations | 3 | P | G | Forecast agents exist (security). |
| Decision intelligence | 4 | P | G | What-If + recommendations → decision cards. |
| Governed automation | 4 | **C/P** | P | Approvals, playbooks, tickets, notifications. |

**Product design standards**

| Standard | Status | Notes |
|---|---|---|
| Every metric has an owner, source, definition, refresh and quality status | G | Metric registry — part of G3. |
| Every insight shows source, confidence, assumptions and owner | P | Custody seals give provenance; a confidence and assumptions UI is needed. |
| Exceptions and decisions, not activity volume | P | The new Overview leads with posture and targets. Apply the same principle to TechOps views. |
| Assistant respects permissions and cites evidence | P | OBO = **C**; citations = P. |

### 3.4 Phased plan (Sections 7–8)

| Phase | Fit | What we bring | What is missing |
|---|---|---|---|
| 0 Discover & Baseline | **C** (services) | Discovery accelerator: KPI catalog template, source-readiness scoring, governance RACI, technology-neutral requirements pack. | Delivery team / partner capacity. |
| 1 Connect & Inform | P | Medallion pipelines, dashboards, audit, benefits widgets. | ServiceNow / Jira ingestion, WRI, briefing, benefits register, DQ rules. |
| 2 Relate & Explain | P | Graph engine, LLM + vector search, trend engine. | Semantic layer, service-to-business mapping, Genie spaces. |
| 3 Predict & Prioritize | P | MLflow, forecasters, back-testing pattern (detection FP tracking). | ITSM forecasts, risk ranking with explainability. |
| 4 Decide & Act | **C/P** | Approvals, orchestrator, playbooks, ticket creation, kill switch, rollback. | Code / test drafting agent, decision-outcome ledger. |
| 5 Expand beyond TechOps | P | Multi-tenant model, SAP connector, Delta Sharing, Unity Catalog. | Domain onboarding playbook. |

### 3.5 Governance, AI controls and automation levels (Sections 9–10)

| Requirement | 0xDSI | Lakewatch | Evidence |
|---|---|---|---|
| L1 Read within user permissions | **C** | C | On-behalf-of user token, `SOC_DATA_ACCESS_MODE=user`, Unity Catalog grants. |
| L2 Summarize with evidence | P | P | LLM summaries; citation coverage to add. |
| L3 Recommend | **C** | P | Agent recommendations, risk scoring, What-If. |
| L4 Draft | P | G | Drafted responses and tickets; add drafted WRI, plans and changes. |
| L5 Create with approval | **C** | P | Response approvals → ticket / workflow creation. |
| L6 Execute within controls (monitoring + rollback) | P | G | Response actions with approval; formalize per-action rollback and a global kill switch for all agents. |
| Identity-based access, least privilege | **C** | C | OBO, Unity Catalog. Row filters / column masks not yet applied (easy add). |
| Classification, retention, lineage, auditability | P | C | Unity Catalog lineage, Delta CDF, `system_audit_log`, HMAC custody. Add classification tags and retention policies. |
| Prompt / retrieval / output evaluation for groundedness | P | G | MLflow present; add **MLflow GenAI evaluation** (groundedness, citation) as a scheduled job and an AI-quality scorecard. |
| Human approval gates | **C** | P | Response approvals workflow. |
| Cost, performance, quality and drift monitoring | P | P | Drift jobs (MLflow), AI Gateway guardian. Add **system tables** billing dashboards. |
| Exception handling, kill switch, rollback | P | G | Present in parts; unify into one "Automation Safety" control panel. |
| Named roles (Exec approver, SMO, EA, D&A, InfoSec, Finance, stewards) | P | N/A | RBAC + multi-tenant exist. Map roles to Unity Catalog groups and approval routing. |

### 3.6 Success measures (Section 11)

| Measure | Ready? | How we evidence it |
|---|---|---|
| Data foundation | P | Pipeline health + DQ expectations dashboards. |
| Metric trust | G | Metric registry (G3). |
| Reporting productivity (hours) | G | Baseline-vs-measured hours tracker (G6). |
| Executive usefulness (decisions logged) | P | Approvals log → extend to a decision log. |
| Service outcomes (MTTR, repeat, change-caused) | G | Needs G1. |
| Question-to-answer time | P | Assistant telemetry already logged; expose as a KPI. |
| Benefits register | G | G6. |
| AI quality (groundedness, citations, escalations) | P | G9. |
| Automation safety (approval compliance, rollback, unintended actions) | P | Approvals + audit log; add a scorecard. |

---

## 4. Lakewatch vs 0xDSI — how to position them together

| Topic | Lakewatch (Databricks, Private Preview) | 0xDSI (our app) | Joint message |
|---|---|---|---|
| Scope | SIEM: ingest/parse, SQL detections, alerts, queries, Genie agents, content library, system health. | Security + identity + agents + executive views + governed response, built as a Databricks App. | Lakewatch = Databricks-supported security data and detection core. 0xDSI = the decision and action layer, extensible to TechOps. |
| RFP fit | Security & risk domain; telemetry ingest patterns. | Security domain fully; platform pattern for all domains. | "Same lakehouse, same governance — security is the first domain live on day one." |
| Risk | Private Preview; security-only. | Partner-built; must show supportability. | Offer Lakewatch where available, 0xDSI detections as the fallback; both write to the same Unity Catalog tables. |

Do not overstate Lakewatch. Confirm with the Databricks account team which features SGWS can access (preview enrolment) before naming them in a formal response.

---

## 5. Gap register and remediation plan

| ID | Gap | RFP reference | Close with | Effort | Priority |
|---|---|---|---|---|---|
| G1 | **ServiceNow ingestion** (incident, problem, change, request, SLA, CMDB, KB) | Brief V8–V10; §4, §7 P1 | Lakeflow Connect ServiceNow connector → bronze/silver/gold ITSM data products; MTTR, repeat-incident and change-caused-incident gold tables | M (3–4 wks) | P0 |
| G2 | **Jira ingestion** (issues, epics, initiatives, dependencies, sprints) | §4, §6 delivery dashboard | Jira REST incremental notebook (or partner connector) → delivery data product | S–M (2–3 wks) | P0 |
| G3 | **Semantic layer + metric registry** | §3, §6 standards, §11 | Unity Catalog Metric Views + `metric_registry` table (owner, source, definition, refresh, DQ status) + certified badge in UI | M | P0 |
| G4 | **Change-risk scoring** | Brief "Change priority" | MLflow model on change history (CI criticality, failure history, completeness, window) + gap flags; write score back to the ServiceNow change as a work note (with approval) | M | P1 — strong quick win |
| G5 | **Wins / Risks / Issues automation** | Brief; §6 P1 | Agent drafts weekly WRI from ITSM + Jira + KPIs, with a human editing and approving it; export to email / Teams / PDF | S–M | P0 — targets the 30–35 h/week |
| G6 | **Benefits register + effort baseline** | §2, §7 P1, §11 | Table and UI: baseline → SWAG → owner-validated → Finance-validated → realized; separate categories (savings / avoidance / capacity / protected value); double-count control | S | P0 — credibility |
| G7 | **Planning / portfolio & dependency view** | Brief "Planning"; §6 | Graph view of initiatives, dependencies, owners and cost across about 10 L4 portfolios; conflict detection ("strategies that undo each other") | M–L | P2 |
| G8 | **Cloud cost & vendor/licence data** | §4 financial | FOCUS billing ingestion (Azure/AWS/GCP) + Databricks system tables + contracts CSV | S–M | P2 |
| G9 | **AI quality harness** (groundedness, citation coverage, escalation rate) | §10, §11 | MLflow GenAI evaluation jobs + AI-quality scorecard + citations shown with every answer | S–M | P1 |
| G10 | **Executive briefing generator (TechOps)** | §6 P1 | Scheduled agent producing "what changed / why it matters / decisions / actions" with citations | S | P0 |
| G11 | **Decision card + decision-outcome ledger** | Brief Decide / Prove; §8 P4 | Standard decision object (options, tradeoffs, confidence, evidence, owner) → approval → outcome measured later | M | P1 |
| G12 | **Unified automation safety** (global kill switch, per-action rollback, unintended-action rate) | §10 | Single control panel + `automation_policy` table enforced by the orchestrator | S–M | P1 |
| G13 | **Power BI interoperability** | Appendix A (Power BI in the proposed architecture) | Databricks Power BI connector over certified gold / metric views; publish a template .pbix | S | P1 — neutralizes Fabric |
| G14 | **Observability / APM connectors** | §4 | Connectors for the SGWS tools in use (Datadog / Dynatrace / Splunk / Azure Monitor) | M per source | P2 |
| G15 | **Code / test drafting agent** | Brief Build & Execute; §8 technical assistance | Agent drafts change + tests as a PR in their repo for human review (never auto-merge) | M–L | P3 (later Phase 4) |
| G16 | **Row filters, column masks, classification tags, retention** | §10 controls | Unity Catalog ABAC tags, row filters and masks on sensitive tables | S | P1 |
| G17 | **TechOps role views** (CEO / CIO / VP / Director / Manager) | Brief p.4 | Role-filtered landing pages reusing the Overview layout | S–M | P1 |

Effort: S ≈ ≤2 weeks, M ≈ 3–5 weeks, L ≈ 6+ weeks (one small squad). These are planning estimates and need validation.

**Critical path to a credible MVP demo (Phase 1 proof):** G1 → G3 → G5 + G10 + G6 → G13. Everything else can follow in Phases 2–4.

---

## 6. Win themes — how to make this very favorable to us

1. **"Phase 0 delivered on a running platform, not slides."** Offer a fixed-fee, 6–8 week Phase 0 + MVP on Databricks that produces *every* exit artefact they listed (KPI catalog, source readiness ratings, governance framework, technology-neutral requirements pack, MVP charter) — plus working ServiceNow / Jira data products and an automated WRI. They will judge "platform evaluation" against something real.
2. **Governance is our headline, not an appendix.** Every control in Section 10 maps to something live: OBO identity, Unity Catalog lineage, approval gates, signed chain of custody, audit log. Demo a recommendation → approval → action → sealed audit record in under 3 minutes.
3. **Automation levels 1–6, shown as a dial.** Build a small "Automation Authority" setting per agent (Read → Execute within controls) so leadership can see the Section 10 table enforced in the product. Strong visual differentiator versus Fabric / Copilot.
4. **Security is day-one value.** The security domain is already complete (identity, attack paths, MITRE, Lakewatch). SGWS gets a live domain at MVP while TechOps sources are connected — de-risks the "prove value" gate.
5. **Open and no lock-in.** Delta / Iceberg open formats, Unity Catalog (open source), Delta Sharing, Power BI-friendly. Addresses their "technology-neutral" and "source-respecting" principles head-on and neutralizes the Fabric argument.
6. **Respect their value discipline.** Ship the benefits register with *their* categories (realized, avoidance, capacity, risk, protected value, decision efficiency) and Finance validation states. Show capacity hours separate from dollars, exactly as their document demands.
7. **The "bad routing change" replay.** Rebuild their order-entry outage story as a scripted demo: change lands → correlation spots it → blast radius shows accounts and locations → decision card → approved rollback ticket → outcome verified. Mirrors the "Imagine this" page in their brief.
8. **Change-risk scoring as the hook.** Their change gatekeeping is manual and inconsistent; a scored change list with gap flags is an immediately measurable lever (change-caused incidents) and feeds the $1.1–3.1M model.
9. **Graph intelligence they can see.** Reuse the identity graph canvas for service ↔ application ↔ CI ↔ owner ↔ initiative. "Strategies that quietly work against each other" becomes conflicting edges highlighted in red.
10. **Transparent cost model.** Present a consumption model sized for the MVP (small: serverless SQL + jobs, a few TB) separately from the 5 PB security-scale model (about $140K–$330K/month), with system-tables cost dashboards and budget alerts. This shows cost control from day one.
11. **Named-people alignment.** Map products to the people in their governance table: Executive Briefing for Steve, Michael and Joel; SMO scorecard for Daniel; Finance view for the Finance partner. Personalised demos land far better.
12. **Reference points they asked for.** They cite Freshservice, Jitterbit and BigPanda benchmarks. Bring Databricks customer references in ITSM / AIOps and position BigPanda-style correlation as a native feature, not another tool.

---

## 7. Recommended response structure

1. Cover letter — support for the Phase 0 decision; a technology-neutral stance, with evidence for Databricks.
2. Understanding of objectives — echo their Sense → Understand → Forecast → Decide → Build → Prove loop.
3. Compliance matrix — Sections 2–3 of this document (remove internal-only notes).
4. Phase 0 / MVP proposal — scope, 6–8 week plan, exit evidence, team, fixed fee.
5. Governance & AI controls — Section 3.5 with screenshots.
6. Value & benefits method — register, baseline approach, Finance validation.
7. Roadmap — Phases 1–5 with the gap closures from Section 5 placed in time.
8. Commercials — MVP consumption estimate + scale model + commit-discount options.
9. References and demo script.

---

## 8. Immediate next steps

1. Confirm with the Databricks account team: Lakewatch preview access for SGWS, Lakeflow Connect ServiceNow availability, Metric Views / Genie availability in their region.
2. Build the P0 gaps (G1, G3, G5, G6, G10) on sample ITSM data to create the TechOps demo.
3. Script the "bad routing change" and "change-risk scoring" demos.
4. Prepare the Phase 0 proposal and MVP cost model.
