# 0xDSI Platform - Complete Feature Description

> **Version:** 2026.05.13
> **Scope:** All modules currently shipped in the application, grouped by the navigation taxonomy used in the product.
> **Persistence layer:** Supabase (Postgres + RLS + Edge Functions). Every feature described here reads/writes through Supabase tables, RLS-protected views, or Edge Functions; nothing is in-memory only unless explicitly noted as a visualization layer over persisted data.

---

## Table of Contents

1. [Platform Foundations](#1-platform-foundations)
2. [Overview Section](#2-overview-section)
3. [Executive Section](#3-executive-section)
4. [Industry Threat Intelligence](#4-industry-threat-intelligence)
5. [Innovation Lab](#5-innovation-lab)
6. [Detection and Intelligence](#6-detection-and-intelligence)
7. [Investigation](#7-investigation)
8. [Response and Automation](#8-response-and-automation)
9. [Data and Integration](#9-data-and-integration)
10. [Reports and Analytics](#10-reports-and-analytics)
11. [Administration](#11-administration)
12. [Cross-Cutting Capabilities](#12-cross-cutting-capabilities)

---

## 1. Platform Foundations

### 1.1 Authentication and Session Management
- Email/password authentication backed by Supabase Auth.
- Three-factor (3FA) scaffolding (`add_three_factor_authentication.sql`) plus a custom `verify-password` Edge Function for dual-secret confirmation.
- Per-user role gating (`analyst`, `engineer`, `admin`, `ciso`) controls which navigation sections render.
- Global activity tracker (`src/lib/activityTracker.ts`) installs window-level listeners that log clicks, navigations, and dwell time. A session row is created on `ensureSession()` boot, feeding User Activity Lineage and the unified risk surfaces.

### 1.2 Row Level Security
Every domain table (events, alerts, cases, IOCs, assets, vulnerabilities, agent registry, escalation contracts, financial fraud tables, etc.) ships with RLS enabled and per-operation policies (SELECT/INSERT/UPDATE/DELETE separately). Anonymous access is permitted only on demo-friendly tables where the read is explicitly safe; everywhere else `auth.uid()` ownership/membership/role checks gate access.

### 1.3 Edge Functions (Supabase)
The platform's secure proxy and AI-orchestration layer:
- `agent-chat`, `agent-orchestrator` - SOC agent dispatch and conversational execution.
- `ai-assistant` - CISO Assistant LLM bridge.
- `analyze-document` - Document intelligence (asset enrichment, OCR-to-graph).
- `correlation-engine`, `enrichment-engine` - rule evaluation and IOC enrichment.
- `etl-ingest`, `etl-orchestrator`, `etl-processor` - ingestion pipelines.
- `feature-lab`, `feature-runtime` - BMAD agent and feature publishing.
- `generate-correlation-rule` - LLM-authored detection rules.
- `geopolitical-risk-fetch` - geopolitical event ingestion.
- `migrate-dashboard` - dashboard parsing/migration from Splunk, Kibana, Grafana, Metabase, Superset, Redash.
- `simulate-threat` - red team scenario emulator.
- `threat-radar-fetch`, `threat-radar-analyze`, `threat-radar-probe` - bleeding-edge feed acquisition + AI scoring + safe probing.
- `verify-password`, `update-username`, `create-user` - account management.

All edge functions implement the mandatory CORS contract (Access-Control-Allow-Origin / Methods / Headers) and OPTIONS preflight handling.

---

## 2. Overview Section

### 2.1 Dashboard (Operations Overview)
A multi-row mission console showing live event throughput, top risk users, alert severity distribution, MTTR/MTTD KPIs, and the streaming Command Center widgets. Links into Event Stream (with raw drilldown), Alerts Panel (segmented by severity and confluence), Cases Panel (with SLA timers), and the Threat Globe.

### 2.2 SOC Agent Bricks (`AgentBricksSOC.tsx`)
A live registry of every autonomous SOC agent, backed by `agent_registry` and `agent_implementations`:
- 30+ canonical agents (Triage, Enrichment, Hunt, Response, Custodian, Compliance, BMAD, etc.).
- Each agent ships with a JSON contract (inputs, outputs, MITRE coverage, SLA), a code viewer, and Run/Pause/Schedule controls wired to `agent_cron_jobs`.
- 3D Agent Network Graph visualizes data exchange between agents in real time.
- Agent Code Configuration panel lets engineers edit prompt templates, tool registries, and guardrail policies.

### 2.3 3D SOC Agents (`SOCAgents3D.tsx`)
A WebGL command room showing each agent as a glowing entity orbiting a central core. Live message edges animate when agents collaborate; a holographic VR HUD overlay (`VRImmersiveHUD.tsx`) presents per-agent telemetry, queue depth, and active hypotheses.

---

## 3. Executive Section

### 3.1 Executive Dashboard (`ExecutiveDashboard.tsx`)
Built for the CISO persona:
- Risk Posture Gauge with quarter-over-quarter delta.
- Top 5 unresolved cases with monetary impact.
- Compliance heatmap across SOC2, ISO 27001, NIST CSF, PCI-DSS, LGPD.
- ROI calculator (analyst-hours saved, breach avoidance, automation coverage).
- Geopolitical risk strip pulled from `cyber_geo_correlations`.

---

## 4. Industry Threat Intelligence

### 4.1 All Industries (`IndustryThreatsHub.tsx`)
Vertical playbooks for Aviation, CPG, Education, Energy, Healthcare, Manufacturing, Retail, and Telco. Each tab carries an industry-specific MITRE technique heatmap, top adversary clusters (e.g., FIN6 for retail, Sandworm for energy), and detection logic tuned to the vertical.

### 4.2 Financial Threats (`FinancialThreatIntel.tsx`)
A full LATAM-focused fraud platform:
- **Brazil Banking Trojans** (Grandoreiro, Mekotio, Casbaneiro, Banker.GT) with live family attribution.
- **PIX Fraud Intelligence** stream with mule-network identity graphs.
- **Boleto Fraud Engine** scoring barcode tampering and beneficiary anomalies.
- **Conciliation Engine** matches authorized vs. settled vs. cleared events.
- **Insider Credential Selling** detection joining typing biometrics, dark-web seller telemetry, and psychological risk scores.
- **Identity Trust Scores**, **Identity Graph Explorer**, **Transaction Risk Monitor**, **Threat Detections / Simulations / Cases**, **Response Decisions** with full audit trail and **Response Timeline Graph** for executive replay.

---

## 5. Innovation Lab

### 5.1 Swarm Crucible (`SwarmCrucible.tsx`)
Multi-agent battlefield: red-team swarm vs. blue-team swarm. Micro-agents share embeddings and memory; a tactical map shows engagements, kill counts, and TTP coverage. Outcomes feed back into the rule library.

### 5.2 CET Trend Engine (`TrendEngineCET.tsx`)
Cyber Emerging Threats forecaster. Pulls signal from threat radar, geopolitical risk, and internal telemetry, then runs Monte Carlo forecasts of which technique families will spike next. A PRD generator drafts a productization plan for each forecasted feature need.

### 5.3 Feature Lab (`FeatureLab.tsx` + BMAD theater)
A live BMAD (Business / Modeling / Architecture / Delivery) agent environment that takes a security feature idea, co-writes a PRD, generates an architecture diagram, scaffolds the code, and publishes the feature into the SOC. Includes:
- Plan Review pane (Analyst / PM / Architect / SecEng / QA debate).
- Lifecycle Panel (Idea -> PRD -> Spike -> MVP -> GA).
- Code Viewer with on-the-fly diff of generated TypeScript.
- "Publish to SOC" button registers the feature into `soc_agent_registry` and the rule library.

### 5.4 ChronoWeave (`ChronoWeave.tsx`) - Vector Space Threat Atlas
A WebGL temporal/vector hybrid view of threat activity:
- **Three view modes:** Raw graph, Vector embedding space, Fusion (events gravitate toward their best-matching bad centroid).
- **Bad Centroids** glow with electron rings, beams, and aura sprites; each represents a tracked adversary cluster (APT class, criminal, insider, supply chain).
- **Click-to-Focus:** clicking a centroid highlights only its related malicious events, hides benign nodes, drops other centroids to ~15% opacity, and filters edges to those touching the focused cluster. A floating "FOCUSED THREAT" panel shows actor name, related event count, and a Clear button. Clicking empty space clears.
- **Multi-dimensional Filter Rack:** Actor Class (state-sponsored / criminal / insider / supply-chain), Region (Americas / EMEA / APAC / Unattributed), Severity (critical / high / medium), MITRE Tactic (11 tactics including ML model tampering), Activity (active in last 8s / dormant). Filters compose with AND semantics; a "reset all" link appears whenever anything is active.
- **Inter-bad similarity edges** when cosine similarity > 0.84 between centroids, revealing actor convergence.
- **Emerge Flash** banner pops when a new bad centroid materializes.

### 5.5 Detection SLM (Beta) (`DetectionSLM.tsx`)
A small language model fine-tuned on detection corpora. Live prompt panel for one-shot rule synthesis; ships rules to the Correlation Rules library after human approval.

### 5.6 Detection Confluence (`DetectionConfluence.tsx`)
Multi-signal correlation surface: shows the moment when ML scores, MITRE behavior, IOC matches, UEBA anomalies, and geopolitical indicators all confluence on the same entity. Built from `detection_confluence_*` tables with ML/agent/attack enrichment.

---

## 6. Detection and Intelligence

### 6.1 MITRE ATT&CK Matrix (`MitreAttackMatrix.tsx`)
Full Enterprise matrix with technique-level coverage heat (rules / detections / open cases). Click a cell for live evidence drilldown.

### 6.2 Glasswing Vulnerability Scanner (`glasswing/`)
Internal SAST/IAST/DAST scanner: Scanner with target selection, Results ranked by exploit graph depth, Exploit Graph showing attacker pivot paths, Scan History, and Stats panels.

### 6.3 Threat Radar Agent (`ThreatRadar.tsx`, `threat-radar/`)
Bleeding-edge intel ingestion: Feed Stream (CVE, CISA KEV, vendor advisories, dark-web chatter), Intelligence Dossier with auto-summary, Rule Flow Graph showing how a feed item became a detection, Graph Pattern Preview, and Radar HUD. Uses `threat-radar-fetch`, `threat-radar-analyze`, and `threat-radar-probe` Edge Functions.

### 6.4 Threat Feeds (`ThreatFeedsPanel.tsx`)
Subscription manager for STIX/TAXII, MISP, OTX, abuse.ch, and custom HTTP feeds; per-feed cadence, last-pull telemetry, and indicator counts.

### 6.5 IOCs (`IOCPanel.tsx`)
IOC table with enrichment status, confidence, sightings, and graph drilldown. Backed by `iocs` and `ioc_embeddings` (pgvector).

### 6.6 STIX/TAXII Intel (`StixTaxiiManager.tsx`)
Native STIX 2.1 bundle browser with TAXII 2.1 collection management.

### 6.7 HoneyPot and Tokens (`HoneypotControl.tsx`)
Deception fabric: HoneypotMap (geo of decoys), HoneypotStats, HoneypotTable, HoneytokenTable for canary credentials and AWS keys, and InteractionFeed of every probe.

### 6.8 AI Malware Sandbox (`AIMalwareSandbox.tsx`)
Detonate suspicious binaries in an AI-instrumented sandbox; behaviors are summarized, mapped to MITRE, scored, and fed into the IOC pipeline.

### 6.9 Model Poisoning Guard (`ModelPoisoningGuard.tsx`)
Defends ML pipelines from data and model poisoning. Tracks training-set drift, gradient anomaly events, model fingerprint mismatches, and alerts on supply-chain-tampered checkpoints.

### 6.10 LLM Guardrails (`LLMGuardrailsControl.tsx` + `guardrails/`)
Production LLM safety stack:
- **Guardrails Dashboard** with pass/block ratios.
- **Prompt Scanner** for jailbreak / injection / PII leak attempts.
- **PII Redaction Engine** with Brazilian + global PII catalog and comprehensive mock corpora.
- **Policy Manager** for rule authoring.
- **Token Budget Controls** per-user, per-team, per-model.
- **Model Access Governance** for tenant model allowlists.

### 6.11 Attack Vectors (`AttackVectorGraph.tsx`)
3D graph of attacker entry-points across the estate (cloud APIs, identities, exposed services, third parties).

### 6.12 Smart Threat Modeling (`SmartThreatModeling.tsx`)
STRIDE/PASTA modeler that auto-generates threat models from architecture diagrams or live infrastructure scans, with ML-assisted scoring.

### 6.13 Correlation Rules (`CorrelationRulesPanel.tsx` + `correlation/`)
The detection-as-code (DaC) library:
- 100+ showcase rules across three batches plus negative correlation rules.
- DaC Status Badge, DaC Inspector Modal, **Rule Version Drawer** with full version history.
- Rule type / complexity metadata, confidence-score index, MITRE tactic/technique tagging.
- LLM rule generation via `generate-correlation-rule`.

### 6.14 Negative Correlation (`negative-correlation/`)
Detects the *absence* of expected events (missed heartbeats, dropped audit logs, "what should be there but isn't"). Includes Detections, Graph, Timeline, and Rules tabs and is linked into the main rules library.

### 6.15 Simulations (`ThreatSimulator.tsx`)
End-to-end attack chain simulator with kill-chain progression, evidence creation, and analyst tabletop replay.

---

## 7. Investigation

### 7.1 Entity Investigation (`EntityInvestigation.tsx`)
360-degree view of any user, host, IP, file, or domain. Pulls from events, alerts, cases, IOCs, vulnerabilities, behavioral anomalies, LLM risk, psychological profile, and chain-of-custody.

### 7.2 AI Incident Summary (`AIIncidentSummarizer.tsx`)
LLM-generated incident write-ups with citations to evidence rows.

### 7.3 Advanced Hunting (`AdvancedHuntingQuery.tsx`)
Lucene/KQL hybrid query bar with autocomplete, schema awareness, saved hunts, and a Lucene fast-search index (`add_lucene_fast_search_infrastructure.sql`).

### 7.4 User Behavior (`UserBehavior.tsx` + `user-behavior/`)
UEBA + psychological + LLM-risk fused panel:
- **Unified Risk Header** combining behavioral, LLM, and psychological scores.
- **Cross-Domain Strip** of anomalies (auth, data access, network, GenAI).
- **LLM Risk User Detail** (prompts, tokens, sensitive concepts).
- **Psychological User Detail** (multi-source signal: comms, sentiment, sleep/idle deltas, peer-group divergence) backed by `unified_user_risk_view`.

### 7.5 Network and Physical (`NetworkTopology.tsx`)
Combined logical and physical security:
- Logical: assets, segments, peering, exposure zones.
- Physical: CCTV badge access, intruder face vs. authorized face comparison, datacenter feeds.
- DPI / DLP packet inspection (`DPIInspection.tsx`).

### 7.6 Vulnerabilities (`VulnerabilitiesPanel.tsx`)
CVE-level view with asset linkage, exploit-graph context, EPSS, and remediation SLA timers.

### 7.7 Sessions and Events (`SessionListsPanel.tsx`, `EventStream.tsx`, `RawDataAnalysis.tsx`)
Full session/event explorer with active lists (allow/deny, hot indicators, OCSF normalization), raw data drilldown, and OCSF schema browser.

### 7.8 AI Threat Hunting (`VectorThreatHunting.tsx`)
Vector-similarity hunting using pgvector: paste an event, find the n nearest semantic neighbors across the historical corpus.

### 7.9 Pattern Discovery (`PatternDiscoveryPanel.tsx`, `MicroPatternsPanel.tsx`)
Insider-threat and micro-pattern miner; the `pattern_discovery` migrations seed canonical insider-threat patterns and a 3D pattern graph (`PatternGraph3D.tsx`).

---

## 8. Response and Automation

### 8.1 Alerts (`AlertsPanel.tsx`)
Tri-pane alert console (queue / detail / evidence) supporting OCSF-normalized payloads.

### 8.2 Cases (`CasesPanel.tsx`)
World-class case manager (per `upgrade_cases_to_world_class.sql`): SLAs, evidence locker with chain-of-custody hashes, MITRE pinning, collaborator audit trail, attached IOCs, and case timeline.

### 8.3 Threat Escalation (`ThreatEscalationPanel.tsx` + `threat-escalation/`)
Auto-escalation matrix with Data Contracts and Graph Scoring tabs; supports tier-based routing, on-call rotation, and acknowledgement workflows.

### 8.4 Response Automation (`ResponseAutomation.tsx`)
Catalog of response actions (block-IP, isolate-host, disable-user, revoke-token, snapshot-asset). Each action has a per-tenant policy and a backout plan.

### 8.5 Response Approvals (`ResponseApprovalsPanel.tsx`)
Two-person-rule queue for high-impact actions; integrated with audit log.

### 8.6 Workflows (`WorkflowsPanel.tsx`)
n8n-compatible automation library; ships with 50+ creative infosec workflows.

### 8.7 AI Playbook Builder (`AIPlaybookGenerator.tsx`)
LLM playbook authoring with simulated dry-run and live publish.

### 8.8 Red Team (`RedTeamAutomation.tsx`)
Continuous offensive simulation with epic campaign data, RLS-protected campaign tables, and tabletop scenario kits.

---

## 9. Data and Integration

### 9.1 Dashboard Studio (`dashboard-builder/`)
Drag-and-drop dashboard builder: Widget palette (Stat, Chart, Table, Text), Chart Renderer with adaptive sampling, Migration Workflow that imports from Splunk, Kibana, Grafana, Metabase, Superset, and Redash via dedicated parsers and the `migrate-dashboard` Edge Function. Databricks Export Panel pushes the dashboard to a Lakehouse workspace.

### 9.2 Databricks Notebooks (`DatabricksNotebooksPanel.tsx`, `notebooks/`)
Catalog of pre-built notebooks (behavioral, correlation, ML, mock data, streaming, threat intel, agent SOC orchestrator, graph correlation runtime, vector detection/memory). Run history persisted in `databricks_notebook_runs`; approvals via `databricks_notebook_approvals`.

### 9.3 OCSF Schema (`OCSFSchemaBrowser.tsx`)
Browse the Open Cybersecurity Schema Framework taxonomy with click-through to live event examples.

### 9.4 Data Connectors (`DataConnectors.tsx`, `connectors/`)
Connector catalog covering Cloud APIs (AWS, Azure, GCP, Okta, Salesforce, ServiceNow), Network Taps, and SIEM Integration. Per-connector health, throughput, and last-event timestamp.

### 9.5 SAP Security (`SAPSecurityConnector.tsx`)
Native SAP audit-event ingestion (SM19/SM20, RFC, role assignment, financial postings).

### 9.6 Document Intelligence (`DocumentAnalysis.tsx`)
LLM document analysis pipeline that extracts entities, asset enrichments, and policy mappings from PDFs, contracts, and runbooks via `analyze-document`.

### 9.7 Streaming Graph (`StreamingGraphVisualization.tsx`, `RealTimeGraphStreaming.tsx`)
Real-time graph CEP using Quine plus streaming infrastructure (Zerobus / Lakebase / Brickstore migrations). Visualizes nodes/edges materializing as events stream.

### 9.8 Architecture (`Architecture2D.tsx`, `Architecture3D.tsx`, `ArchitectureVisualization.tsx`, `ArchitectureDocumentation.tsx`)
Live-rendered architecture diagrams of the platform itself (data plane, control plane, agent fabric, ML plane, ETL plane), with documentation tabs.

---

## 10. Reports and Analytics

### 10.1 Security Reports (`Reports.tsx`)
Pre-built executive, compliance, and operational reports with PDF export.

### 10.2 Report Builder (`ReportBuilder.tsx`)
Custom-report authoring with parameter binding, scheduling, and recipient lists.

### 10.3 Compliance Dashboard (`ComplianceDashboard.tsx`)
Control-by-control posture across SOC2, ISO 27001, NIST CSF, HIPAA, PCI-DSS, LGPD, GDPR. Backed by `create_compliance_monitoring_system.sql`.

### 10.4 Platform Economics (`PlatformEconomics.tsx`)
TCO/ROI calculator vs. Splunk/Sentinel/Chronicle, including ingest unit economics and analyst-hour deflection.

### 10.5 SOC Optimization (`SOCOptimization.tsx`)
Tier-1/2/3 workload analyzer, auto-tuning recommendations, and analyst burn-out indicators.

---

## 11. Administration

### 11.1 Multi-Tenant Manager (`MultiTenantManager.tsx`)
Tenant CRUD, data-segregation policy, per-tenant model allowlist, and cross-tenant analytics opt-in.

### 11.2 Platform Users (`UserManagement.tsx`)
User CRUD with role assignment, MFA reset, session revocation, and activity lineage.

### 11.3 MCP Registry (`MCPRegistry.tsx`)
Model Context Protocol server registry: register, discover, and gate MCP tools used by agents. Backed by `create_mcp_registry_system.sql`.

### 11.4 Production Settings (`ProductionSettings.tsx`)
HA settings, retention policies, encryption keys, integration secrets reference, and feature flags. Backed by `system_settings` with HA columns.

---

## 12. Cross-Cutting Capabilities

### 12.1 Command Center (Operations Bridge)
The `command-center/` module is a NORAD-style superpanel surfacing:
- DEFCON Alert escalation.
- Defense Shield / Domain Bridge live posture.
- Embedding Constellation, Realtime CEP Graph, Threat Heartbeat, Threat Radar, Threat Weather Map.
- Event Processing Funnel + Event Drilldown Modal.
- Kill Chain Waterfall, Low-and-Slow Tracker, Monte Carlo Forecasting.
- OSI Layer View, Phase Explorer, Predictive Threat Analytics, Risk Posture Gauge.
- **Intel sub-panels:** SCIF Access Control, Clearance Level Matrix, Need-to-Know Compartments, Classified Info Flow, SIGINT Interceptor, Counter-Intel Dashboard.

### 12.2 Geopolitical Risk and Threat Globe
- 3D Earth (`ThreatGlobe.tsx`) with live attack arcs, exposure zones, and city pulses.
- Globe surface uses an unlit basic-material so the texture stays evenly visible while spinning (no dark side as it rotates).
- Atmosphere shader, source/target rings, and arc trails preserved with additive blending.
- Cyber-geo correlations (`cyber_geo_correlations` + `geopolitical-risk-fetch`) cross-reference geopolitical events with live cyber telemetry.

### 12.3 Chain of Custody
Cryptographic evidence ledger (`add_chain_of_custody_system.sql`) attaches hashed, signed records to every case/alert evidence entry. Tamper-evident timeline replayable in the case viewer.

### 12.4 Activity Lineage
`UserActivityLineage.tsx` plus the user activity tracking migration record every analyst action (page view, query, response action, approval) and visualize the lineage as a DAG.

### 12.5 Vector Search and pgvector
- `ioc_embeddings` for IOC similarity hunting.
- `graph_correlation_vector_memory` for agent long-term memory.
- `vector_threat_hunting` system with 1536-dim embeddings.

### 12.6 ETL Ingestion System
`create_etl_ingestion_system.sql` plus `etl-ingest`/`etl-orchestrator`/`etl-processor` Edge Functions provide a multi-stage ingestion pipeline (raw -> parsed -> normalized OCSF -> enriched). The ETL Architecture and ETL Usage Guide docs describe operator-level usage.

### 12.7 Demo Personas and Scenarios
Pre-seeded admin users (Estee Lauder breach scenario, iFood admins, Itau analyst batch, named-CISO demo accounts) with full mock evidence, alerts, cases, MITRE pinning, financial transactions, PIX/trojan unified events, and psychological profiles for high/medium-risk users.

### 12.8 Voice and Conversation
`voiceConversation.ts` provides a CISO Assistant voice loop (speech-in / LLM / speech-out) for hands-free executive briefings.

### 12.9 Three.js Visualization Layer
A consistent Three.js-based 3D fabric powers ChronoWeave, ThreatGlobe, AttackVectorGraph, AgentNetworkGraph3D, PatternGraph3D, SOCAgents3D, RealtimeCEPGraph, and the VR HUD - all sharing helper utilities (`soc3dHelpers.ts`, `soc3dEffects.ts`, `globeGeometry.ts`).

### 12.10 Detection-as-Code Versioning
Every correlation rule has version history (`add_detection_as_code_versioning.sql`, `populate_rule_version_history.sql`) with diff view, author, approver, and rollback action.

---

## Appendix A - Persistence Map

| Domain | Primary Tables (selected) |
|---|---|
| Identity | `auth.users`, `user_profiles`, `user_management`, `sessions`, `active_lists` |
| Telemetry | `events`, `alerts`, `iocs`, `ioc_embeddings`, `vulnerabilities`, `assets` |
| Casework | `cases`, `case_evidence`, `case_collaborators`, `case_audit`, `chain_of_custody` |
| Detection | `correlation_rules`, `correlation_matches`, `negative_correlation_rules`, `detection_confluence_*`, `rule_versions` |
| Agents | `agent_registry`, `agent_implementations`, `soc_agent_registry`, `agent_cron_jobs`, `mcp_registry` |
| AI/LLM | `llm_risk_*`, `llm_guardrails_*`, `pii_redaction_*`, `psychological_profiles`, `multi_source_behavioral` |
| Financial | `financial_transactions`, `pix_trojan_events`, `boleto_*`, `insider_credential_selling`, `financial_cases` |
| Threat Intel | `threat_feeds`, `stix_taxii_*`, `threat_radar_items`, `geopolitical_events`, `cyber_geo_correlations` |
| Physical | `physical_security_events`, `personnel_tracking`, `dpi_packet_inspection` |
| ML/Data | `ml_training_runs`, `model_poisoning_*`, `vector_threat_hunting`, `databricks_export_*` |
| Compliance | `compliance_controls`, `compliance_assessments`, `ocsf_*` |
| Workflow | `workflows`, `response_actions`, `response_approvals`, `escalation_rules` |

All tables ship with RLS enabled and granular SELECT/INSERT/UPDATE/DELETE policies.

---

## Appendix B - Edge Function Index

`agent-chat`, `agent-orchestrator`, `ai-assistant`, `analyze-document`, `correlation-engine`, `create-user`, `enrichment-engine`, `etl-ingest`, `etl-orchestrator`, `etl-processor`, `feature-lab`, `feature-runtime`, `generate-correlation-rule`, `geopolitical-risk-fetch`, `migrate-dashboard`, `simulate-threat`, `threat-radar-analyze`, `threat-radar-fetch`, `threat-radar-probe`, `update-username`, `verify-password`.

All functions implement the standard CORS contract and OPTIONS preflight handling, and rely on Supabase-injected secrets (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).

---

*End of document.*
