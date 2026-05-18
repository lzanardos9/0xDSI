# 0xDSI Platform — Complete Feature Manifest

> Last updated: 2026-05-18
> Total UI Views: 64 | Database Tables: 327 | Edge Functions: 23

---

## Table of Contents

1. [Platform Overview](#platform-overview)
2. [Overview & Command Center](#overview--command-center)
3. [Detection & Intelligence](#detection--intelligence)
4. [Investigation & Hunting](#investigation--hunting)
5. [Response & Automation](#response--automation)
6. [Innovation Engines](#innovation-engines)
7. [Industry Threat Intelligence](#industry-threat-intelligence)
8. [Data & Integration](#data--integration)
9. [Reports & Analytics](#reports--analytics)
10. [Administration](#administration)
11. [Backend Services (Edge Functions)](#backend-services-edge-functions)
12. [Database Schema (327 Tables)](#database-schema-327-tables)
13. [Architecture Layers](#architecture-layers)
14. [What Is Still Missing / Roadmap Gaps](#what-is-still-missing)

---

## Platform Overview

0xDSI is a next-generation **Detection-as-Data** Security Operations Center platform built on Databricks Lakehouse architecture with Supabase for real-time operational state. It combines:

- Real-time streaming correlation (CET/CEP engines)
- Graph-native threat reasoning (GraphFrames + Quine-inspired streaming graphs)
- Semantic/vector threat detection (embeddings, SLM/LLM reasoning)
- Agentic SOC orchestration (autonomous agents with human-in-the-loop)
- Temporal intelligence (ChronoWeave, event lineage, attack continuity)
- Full kill-chain coverage (from telemetry ingestion to executive reporting)

### Role-Based Access Control

| Role | Access Level |
|------|-------------|
| Analyst | Investigation, Detection, Response, Reports |
| Engineer | All Analyst + Data/Integration, Architecture |
| Admin | Full platform access + User Management |
| CISO | Executive view + Strategic metrics + All sections |

---

## Overview & Command Center

### 1. Analytics Dashboard
- Live streaming metrics: Total Events, Active Sessions, Critical Alerts, Threats Neutralized
- CISO Assistant (conversational AI advisor)
- Global Threat Intelligence Globe (3D Earth visualization)
- Compliance Dashboard summary
- Risk Overview
- Business / Public Sector scorecards
- OKR Cards: MTTD, MTTR, Detection Rate, False Positive Rate, Critical Resolved, Coverage
- Business Impact: Cost Avoidance, Downtime, Compliance Score, Risk Reduction
- ROI Breakdown & Efficiency Gains
- Recent Activity Feed (real-time Supabase subscription)

### 2. Command Center Mode
- **Threat Heartbeat** — real-time pulse of organizational risk
- **Risk Posture Gauge** — dynamic risk scoring
- **DEFCON Alert** — organizational threat level indicator
- **Kill Chain Waterfall** — active attack progression view
- **Threat Weather Map** — geographic threat heat mapping
- **OSI Layer View** — threats mapped by network layer
- **Realtime CEP Graph** — live Complex Event Processing visualization
- **Predictive Threat Analytics** — Monte Carlo forecasting
- **Low-and-Slow Tracker** — long-duration attack detection
- **Intelligence Monitoring** — consolidated intel feeds
- **Phase Explorer** — attack lifecycle phase analysis
- **Agent Comms Panel** — live agent-to-agent communication
- **Defense Shield** — active defense status
- **Domain Bridge** — cross-domain correlation view
- **Embedding Constellation** — vector space visualization
- **Camera Feed Modal** — physical security CCTV integration
- **Event Drilldown Modal** — deep event analysis
- **Shared Threat State** — cross-component threat awareness

#### Intelligence Sub-Modules (SCIF-level)
- Classified Info Flow
- Clearance Level Matrix
- Counter-Intel Dashboard
- Need-to-Know Compartments
- SCIF Access Control
- SIGINT Interceptor

### 3. Event Processing Funnel
- Multi-stage event pipeline visualization
- Ingestion → Parsing → Normalization → Enrichment → Correlation → Alert stages
- Volume metrics per stage
- Drop-off and enrichment ratios

### 4. SOC Agent Bricks
- Visual agent orchestration dashboard
- Agent status monitoring
- Task assignment and completion tracking
- Agent communication flows
- Agent learning feedback loop

### 5. 3D SOC Agents
- Three.js 3D visualization of agent mesh
- Real-time agent interaction visualization
- Spatial awareness of agent positioning

---

## Detection & Intelligence

### 6. MITRE ATT&CK Matrix
- Full framework visualization (all tactics + techniques)
- Coverage heatmap per technique
- Detection mapping per rule
- Gaps identification

### 7. Glasswing Vulnerability Scanner
- Active vulnerability scanning
- Exploit graph visualization (GlasswingExploitGraph)
- Scan history tracking
- CVE correlation with CISA KEV catalog
- Risk scoring per asset
- Remediation recommendations

### 8. Threat Radar Agent
- Autonomous threat intelligence gathering
- Feed streaming (real-time)
- Intelligence dossier generation
- Graph pattern preview
- Rule flow graph
- Radar HUD visualization
- Multiple intelligence sources: OSINT, Dark Web, Vendor Feeds

### 9. Threat Feeds Management
- Feed source management (enable/disable, sync intervals)
- Auto-sync with external intelligence sources
- Indicator ingestion and deduplication
- Feed health monitoring
- Sync logs and error tracking

### 10. IOC Management (Indicators of Compromise)
- Multi-type indicators: IP, Domain, URL, Hash (MD5/SHA1/SHA256), Email, CVE
- Confidence scoring
- Tagging and categorization
- Expiration management
- Match tracking and false positive counting
- Embedding-based similarity matching
- Feed correlation

### 11. STIX/TAXII Intel
- STIX indicator management
- TAXII server integration
- Structured threat intelligence exchange
- Indicator lifecycle management

### 12. Honeypot & Honeytoken Control
- Honeypot deployment map (geographic)
- Honeypot statistics and metrics
- Honeypot table management
- Honeytoken creation and tracking
- Interaction feed (real-time attacker behavior)

### 13. AI Malware Sandbox
- Malware sample submission and analysis
- Sandbox session management
- Behavioral analysis results
- Memory analysis
- String intercepts
- Stack traces
- Kernel activity monitoring
- Bytecode instrumentation
- Process behavior analysis

### 14. Model Poisoning Guard
- Adversarial training data detection
- Model defense configurations
- Poisoning detection alerts
- Training data audit trail
- Model evaluation integrity checks

### 15. LLM Guardrails Control
- **Guardrails Dashboard** — policy compliance overview
- **Policy Manager** — create/edit guardrail policies
- **Prompt Scanner** — real-time prompt injection detection
- **PII Redaction Engine** — automated sensitive data removal
- **Token Budget Controls** — usage governance and limits
- **Model Access Governance** — role-based model access

### 16. Attack Vector Visualization
- Interactive attack vector graph
- Kill chain mapping
- Lateral movement visualization

### 17. Smart Threat Modeling
- Automated threat model generation
- Threat scenario enumeration
- Risk assessment per model
- Mitigation tracking
- Multi-source intelligence fusion

### 18. Correlation Rules Engine
- Rule creation and management
- DaC (Detection-as-Code) versioning with git-like history
- Rule version drawer (diff view)
- Status badges per rule
- Confidence scoring
- Rule type classification (simple, complex, graph, behavioral, ML)
- Temporal window configuration
- Cross-source correlation
- Library of pre-built rules (200+)

### 19. Negative Correlation Engine
- Absence-based detection (detecting what SHOULD happen but DIDN'T)
- Negative correlation rules
- Negative correlation graph
- Detection timeline
- Missing-event patterns
- Baseline comparison

### 20. Threat Simulations
- Attack scenario simulation
- Red vs. Blue simulation engine
- Impact modeling
- Response validation

---

## Investigation & Hunting

### 21. Entity Investigation
- Entity-centric investigation workspace
- Cross-source entity resolution
- Relationship mapping
- Timeline reconstruction
- Evidence collection

### 22. AI Incident Summarizer
- Automated incident narrative generation
- Key findings extraction
- Evidence chain summary
- Recommendation generation
- MITRE ATT&CK alignment

### 23. Advanced Hunting (KQL/SPL)
- Query workspace with syntax highlighting
- Multi-language support
- Query history
- Saved queries
- Result visualization
- Performance metrics

### 24. User Behavior Analytics
- **Unified Risk Header** — consolidated user risk score
- **Cross-Domain Strip** — behavior across multiple systems
- **LLM Risk User Detail** — AI interaction risk profiling
- **Psychological User Detail** — behavioral psychology indicators
- Behavioral baselines
- Anomaly detection
- Peer group comparison
- Activity timeline
- Risk trending

### 25. Network & Physical Security
- Network topology visualization
- DPI (Deep Packet Inspection) flow analysis
- DLP (Data Loss Prevention) detections
- CCTV camera management
- Physical zone monitoring
- Personnel tracking
- Physical-cyber correlation
- Packet capture analysis

### 26. Vulnerabilities
- Asset vulnerability tracking
- CVSS scoring
- Remediation workflow
- SLA tracking
- Patch management integration
- NIST NVD correlation
- CISA KEV alignment

### 27. Sessions & Events
- Live event stream
- Session reconstruction
- Raw event analysis
- Event parsing and normalization
- Session correlation
- Active lists management (blocklist/allowlist/watchlist)
- Session list tracking (login/IP/hostile/operational)

### 28. AI Vector Threat Hunting
- Embedding-based threat search
- Semantic similarity hunting
- Vector correlation rules
- Behavioral embedding comparison
- Zero-day candidate identification
- Memory-based threat recall

### 29. Pattern Discovery
- Automated pattern mining from raw events
- Unknown threat detection
- Baseline establishment
- Anomaly classification
- Sequence analysis
- Graph-based pattern representation
- Pattern-to-rule conversion

---

## Response & Automation

### 30. Alerts Management
- Multi-severity alert triage (low/medium/high/critical)
- Alert lifecycle management (new → investigating → resolved → false positive)
- Alert assignment
- Alert correlation with events/sessions
- OCSF-enriched alert metadata

### 31. Case Management
- Full case lifecycle (new → investigating → contained → resolved → closed)
- Case evidence graph (CaseEvidenceGraph)
- Case templates
- Case timeline
- Case comments (internal/external)
- Case audit log
- Case MITRE technique mapping
- Case IOC linking
- Case watchers
- Case links (related cases)
- SLA tracking
- Priority/severity classification

### 32. Threat Escalation
- Escalation rules engine
- Threat escalation formulas
- **Data Contracts Tab** — cross-domain data contracts
- **Graph Scoring Tab** — graph-based severity scoring
- Automated escalation based on thresholds
- Manual escalation workflow

### 33. Response Automation
- Automated response actions
- Action types: block IP, isolate user, disable account, quarantine file, send notification, create ticket
- Rollback capability
- Response validation
- Execution logging
- Integration with n8n workflows

### 34. Response Approvals
- Human-in-the-loop approval workflows
- Multi-level approval chains
- Approval SLA tracking
- Approval audit trail
- Rejection with reasoning

### 35. Workflow Automation (n8n)
- Visual workflow builder
- Webhook-triggered workflows
- Scheduled workflows
- Event-pattern triggers
- Cooldown management
- Execution history
- Multi-type workflows: response, investigation, notification, remediation

### 36. AI Playbook Generator
- Automated playbook creation from incidents
- Response sequence optimization
- Decision tree generation
- Historical effectiveness scoring

### 37. Red Team Automation
- Campaign management
- Target enumeration
- Exploit execution tracking
- Finding documentation
- Agent-driven penetration testing
- Fuzzing campaigns
- Campaign reporting

---

## Innovation Engines

### 38. Swarm Crucible
- Multi-agent adversarial testing arena
- Battlefield run management
- Champion tracking
- Cohort evolution
- Embedding-based strategy comparison
- Matchup scheduling
- Micro-pattern extraction
- Extras panel (advanced analytics)

### 39. CET Trend Engine (Complete Event Trend)
- Trend phase tracking
- Feasibility analysis
- Architecture layer mapping
- Benchmark comparison
- Graph-based trend visualization (nodes + edges + graphlets)
- Runtime metrics
- Runtime gap identification
- PRD generation and tracking
- Positioning analysis
- Query interface
- "Already Have" / "Complete" / "Partial" / "Still Missing" categorization

### 40. Feature Lab
- Feature ideation and incubation
- **Architecture Diagram** — visual component design
- **BMAD Agent Panel** — agent-driven feature development
- **BMAD Live Theater** — real-time agent collaboration visualization
- **Code Viewer** — implementation preview
- **Lifecycle Panel** — feature maturity tracking
- **Plan Review** — design review workflow
- **Publish to SOC Button** — promotion to production

### 41. ChronoWeave
- Temporal intelligence fusion engine
- Session management (temporal analysis sessions)
- Node/edge graph construction
- "Bad centroid" detection (temporal anomaly clusters)
- Similarity hit tracking
- Cross-timeline correlation
- Temporal compression

### 42. Detection SLM (Small Language Model)
- Custom security-domain language model
- Training run management
- Checkpoint tracking
- Attention trace analysis
- Vocabulary management
- Distillation jobs (from larger models)
- Evaluation metrics
- Prediction logging

### 43. Detection Confluence
- Multi-lens detection fusion
- **Confluence Lenses** — multiple detection perspectives
- **Lens Weights** — configurable confidence per lens
- **Confluence Signals** — raw detection signals
- **Arbiter Runs** — automated verdict generation
- **Verdicts** — final detection decisions
- **Attack Chains** — multi-step detection correlation
- **Agent Actions** — agent-driven investigation steps
- **ML Invocations** — ML model calls per detection
- **Lineage** — full detection provenance

---

## Industry Threat Intelligence

### 44. Industry Threats Hub
- **Aviation Threats** — airline/airport-specific TTPs
- **CPG Threats** — consumer packaged goods supply chain
- **Education Threats** — academic institution targeting
- **Energy Threats** — critical infrastructure / ICS-SCADA
- **Healthcare Threats** — medical device and PHI targeting
- **Manufacturing Threats** — OT/IT convergence attacks
- **Retail Threats** — POS and e-commerce attacks
- **Telco Threats** — telecommunications infrastructure

### 45. Financial Threat Intelligence
- **Boleto Fraud Engine** — Brazilian payment fraud detection
- **Brazil Banking Trojans** — regional malware intelligence
- **Pix Fraud Intelligence** — instant payment fraud patterns
- **Transaction Risk Monitor** — real-time transaction scoring
- **Identity Graph Explorer** — financial identity relationships
- **Identity Trust Scores** — identity verification confidence
- **Credential Selling Graph** — dark web credential marketplace mapping
- **Insider Credential Selling** — internal threat detection
- **Conciliation Engine** — financial reconciliation anomalies
- **Financial Cases** — specialized case management
- **Threat Detections** — financial-specific IOCs
- **Threat Simulations** — financial attack scenarios
- **Response Decisions** — financial incident response
- **Case Evidence Graph** — evidence relationship mapping
- **Response Timeline Graph** — temporal response visualization
- **Simulation Attack Tree Graph** — attack path simulation
- **Threat Attack Chain Graph** — kill chain visualization

---

## Data & Integration

### 46. Dashboard Studio (Builder)
- Drag-and-drop dashboard creation
- Widget palette (charts, stats, tables, text)
- Chart renderer (multi-type)
- Dashboard grid layout
- Widget editor
- Dashboard migrations from other platforms
- **Databricks Export Panel** — push dashboards to Databricks
- **Migration Workflow** — Grafana/Kibana/Splunk/Superset/Metabase/Redash import

### 47. Databricks Notebooks
- Notebook viewer with cell execution
- Run history tracking
- Notebook export utilities
- Categories:
  - Agent SOC Orchestrator
  - Agent SOC Pipeline
  - Agent SOC Schemas
  - Behavioral notebooks
  - ChronoWeave notebooks
  - Correlation notebooks
  - Detection Confluence notebook
  - Feature Lab Runtime notebook
  - Geopolitical Correlation notebook
  - Graph Correlation (Detections, Runtime, Schemas, Vector Detection, Vector Memory)
  - Incident Drilldown notebook
  - ML notebooks
  - Mock Data notebooks
  - Negative Correlation notebook
  - Streaming notebooks
  - Threat Intel notebooks

### 48. OCSF Schema Browser
- Open Cybersecurity Schema Framework exploration
- Event class browser
- Category taxonomy
- Attribute definitions
- Source mapping configuration
- Event normalization rules

### 49. Data Connectors
- **Connector Catalog** — full connector marketplace
- **Cloud APIs Tab** — cloud provider integrations
- **Network Taps Tab** — network traffic sources
- **SIEM Integration Tab** — existing SIEM migration
- Connector health monitoring
- Telemetry ingestion metrics
- Alert generation per connector

### 50. SAP Security Connector
- SAP-specific security event ingestion
- Transaction monitoring
- Authorization analysis
- RFC/BAPI monitoring

### 51. Document Intelligence
- Document upload and analysis
- AI-powered content extraction
- Asset enrichment from documents
- Classification and tagging
- Entity extraction

### 52. Streaming Graph Visualization
- Real-time graph rendering
- Streaming graph vertices/edges
- Graph snapshot management
- Stream window configuration
- Metric tracking

### 53. Architecture Visualization
- 2D/3D architecture diagrams
- Component relationship mapping
- Architecture documentation
- System topology

---

## Reports & Analytics

### 54. Security Reports
- Pre-built report templates
- Report scheduling
- Report execution history
- Multi-format export

### 55. Report Builder
- Custom report creation
- Widget composition
- Data source selection
- Template management

### 56. Compliance Dashboard
- Framework management (SOC2, ISO27001, NIST, PCI-DSS, HIPAA, GDPR)
- Control assessment tracking
- Evidence collection
- Gap analysis
- Compliance mapping across frameworks

### 57. Platform Economics
- Cost analysis per capability
- Resource utilization metrics
- Efficiency scoring
- ROI calculations

### 58. SOC Optimization
- Analyst workload balancing
- Process efficiency metrics
- Alert fatigue analysis
- Response time optimization
- Coverage gap identification

---

## Administration

### 59. Multi-Tenant Manager
- Tenant provisioning
- Tenant isolation
- Resource allocation
- Cross-tenant analytics

### 60. Platform Users (User Management)
- User CRUD operations
- Role assignment
- Security clearance management
- Account lifecycle (pending → active → suspended → terminated)
- Password management (set/reset via admin UI)
- MFA configuration
- Session controls (max concurrent, timeout)
- IP allowlist/denylist
- Access schedule (time/day restrictions)
- Audit logging (all user management actions)
- Supervisor assignment
- Clearance compartments

### 61. MCP Registry
- MCP (Model Context Protocol) server registration
- Tool discovery and management
- Agent-tool bindings
- Prompt management
- Resource tracking
- Client management
- Tool invocation logging

### 62. Production Settings
- System configuration
- HA (High Availability) settings
- Performance tuning
- Feature flags
- Integration configuration

---

## Backend Services (Edge Functions)

| # | Function | Purpose |
|---|----------|---------|
| 1 | `verify-password` | Authentication verification |
| 2 | `create-user` | User provisioning + password setting |
| 3 | `update-username` | Username modification |
| 4 | `etl-ingest` | Raw event ingestion endpoint |
| 5 | `etl-processor` | Event parsing and normalization |
| 6 | `etl-orchestrator` | Pipeline orchestration |
| 7 | `correlation-engine` | Real-time event correlation |
| 8 | `enrichment-engine` | Threat intelligence enrichment |
| 9 | `agent-orchestrator` | Multi-agent task coordination |
| 10 | `agent-chat` | Agent conversational interface |
| 11 | `ai-assistant` | CISO/analyst AI assistant |
| 12 | `analyze-document` | Document intelligence processing |
| 13 | `generate-correlation-rule` | AI-driven rule generation |
| 14 | `migrate-dashboard` | Cross-platform dashboard migration |
| 15 | `simulate-threat` | Threat simulation execution |
| 16 | `mirofish-simulate` | Advanced simulation variant |
| 17 | `feature-lab` | Feature incubation service |
| 18 | `feature-runtime` | Feature execution runtime |
| 19 | `threat-radar-fetch` | Threat intelligence collection |
| 20 | `threat-radar-analyze` | Threat analysis processing |
| 21 | `threat-radar-probe` | Active threat probing |
| 22 | `geopolitical-risk-fetch` | Geopolitical event correlation |
| 23 | `soc-agent-chat` | SOC-specific agent conversation |

---

## Database Schema (327 Tables)

### Core Security Operations (28 tables)
- `events`, `alerts`, `cases`, `sessions`
- `case_actions`, `case_attack_techniques`, `case_audit_log`, `case_comments`
- `case_evidence`, `case_iocs`, `case_links`, `case_templates`, `case_timeline`, `case_watchers`
- `response_actions`, `response_action_approvals`
- `escalation_rules`, `correlation_queue`
- `correlation_rules`, `correlation_rules_library`, `correlation_rule_matches`, `correlation_rule_versions`
- `raw_event_buffer`, `raw_security_events`
- `event_parsers`, `event_priority_calculations`
- `processing_stats`, `parsing_queue`

### Threat Intelligence (32 tables)
- `iocs`, `threat_feeds`, `feed_sync_logs`
- `stix_indicators`, `threat_intelligence_sources`
- `threat_campaigns`, `threat_actor_attribution`
- `threat_graph_nodes`, `threat_graph_edges`
- `threat_models`, `threat_model_sources`, `threat_scenarios`, `threat_mitigations`
- `threat_radar_items`, `threat_radar_runs`, `threat_radar_sources`, `threat_radar_proposals`, `threat_radar_exposure_hits`
- `dark_web_intelligence`, `dark_web_forum_posts`, `dark_web_forum_sources`, `dark_web_threat_marketplace`, `dark_web_corporate_alerts`
- `osint_sources`, `historical_attacks`
- `cisa_kev_catalog`, `nist_nvd_vulnerabilities`
- `zero_day_candidates`
- `predictive_threat_models`
- `geopolitical_events`, `geopolitical_fetch_runs`
- `cyber_geo_correlations`

### User Behavior & Identity (22 tables)
- `user_profiles`, `user_roles`, `user_clearances`
- `user_behavior_events`, `user_risk_assessments`
- `user_psychological_profiles`, `psychological_profile_evidence`, `psychological_risk_factors`
- `user_activity_events`, `user_activity_lineage`, `user_activity_sessions`
- `user_audit_log`
- `behavioral_baselines`, `behavior_correlations`
- `unified_user_risk`
- `auth_attempts`, `demo_passwords`
- `slack_behavioral_analysis`, `email_behavioral_analysis`, `meeting_behavioral_analysis`, `teams_behavioral_analysis`
- `communication_sources`

### AI/ML Operations (38 tables)
- `ai_agents`, `ai_agent_activity`, `ai_generated_tools`, `ai_insights`
- `ai_analysis_jobs`, `ai_analysis_results`
- `ai_gateway_policies`, `ai_gateway_requests`, `ai_security_incidents`
- `ml_model_registry`, `mlflow_experiments`, `mlflow_traces`
- `model_access_rules`, `model_defense_configs`, `model_evaluations`, `model_feedback`
- `model_fine_tuning_jobs`, `model_monitoring_metrics`, `model_serving_endpoints`, `model_simulations`
- `embedding_models`, `foundation_models`
- `guardrail_policies`, `guardrail_incidents`, `guardrail_scan_results`
- `pii_redaction_log`, `token_budgets`
- `llm_interactions`, `llm_risk_incidents`, `llm_risk_profiles`, `llm_risk_rules`
- `poisoning_detections`, `adversarial_training_data`, `training_data_audits`
- `dslm_training_runs`, `dslm_checkpoints`, `dslm_attention_traces`, `dslm_vocab`, `dslm_eval_metrics`, `dslm_predictions`, `dslm_distillation_jobs`

### Graph & Correlation (24 tables)
- `graph_nodes`, `graph_edges`, `graph_patterns`, `graph_communities`
- `graph_correlations`, `graph_processing_jobs`
- `graph_stream_windows`, `graph_pattern_scoring_profiles`
- `streaming_graph_vertices`, `streaming_graph_edges`
- `rt_graph_snapshots`, `rt_streaming_metrics`
- `negative_correlation_rules`, `negative_correlation_detections`
- `cep_patterns`, `cep_pattern_matches`
- `vector_correlation_rules`, `vector_correlations`
- `detected_attack_sequences`, `attack_chains`
- `chronoweave_sessions`, `chronoweave_nodes`, `chronoweave_edges`, `chronoweave_bad_centroids`, `chronoweave_similarity_hits`

### Financial Security (14 tables)
- `financial_cases`, `financial_case_comments`, `financial_case_evidence`
- `financial_identity_graph_edges`, `financial_identity_profiles`
- `financial_response_decisions`
- `financial_threat_detections`, `financial_threat_simulations`
- `financial_transactions`
- `credential_dark_web_hits`, `credential_selling_cases`
- `cross_platform_behavioral_patterns`
- `interaction_linguistic_analysis`

### Malware & Red Team (18 tables)
- `malware_samples`, `malware_sandbox_results`
- `sandbox_sessions`, `memory_analysis`, `memory_snapshots`
- `stack_traces`, `string_intercepts`, `kernel_activity`
- `bytecode_instrumentation`, `intercepted_functions`, `process_behavior`
- `red_team_campaigns`, `pentest_campaigns`, `pentest_exploits`, `pentest_findings`, `pentest_targets`
- `agent_pentest_sessions`
- `fuzzing_campaigns`, `fuzzing_crashes`, `fuzzing_results`

### Honeypots & Deception (4 tables)
- `honeypots`, `honeypot_interactions`
- `honeytokens`

### Vulnerability Management (4 tables)
- `vulnerabilities`, `asset_vulnerabilities`, `physical_asset_vulnerabilities`
- `glasswing_exploits`, `glasswing_scans`, `glasswing_vulnerabilities`

### Network & Physical (12 tables)
- `asset_registry`, `dpi_flows`, `dlp_detections`, `packet_captures`
- `network_behavior`
- `cctv_cameras`, `physical_security_events`, `physical_zones`, `personnel_tracking`
- `connector_alerts`, `connector_events`, `connector_telemetry`

### Compliance (7 tables)
- `compliance_frameworks`, `compliance_controls`, `compliance_assessments`
- `compliance_evidence`, `compliance_gaps`, `compliance_mappings`
- `contract_obligations`

### Swarm Crucible (9 tables)
- `swarm_battlefields`, `swarm_battlefield_runs`
- `swarm_champions`, `swarm_cohorts`, `swarm_embeddings`
- `swarm_matchups`, `swarm_micro_patterns`, `swarm_runs`

### CET / Trend Engine (16 tables)
- `trend_already_have`, `trend_complete`, `trend_partial`, `trend_still_missing`
- `trend_feasibility`, `trend_architecture_layers`, `trend_benchmarks`
- `trend_graph_edges`, `trend_graph_nodes`, `trend_graphlets`
- `trend_phases`, `trend_positioning`, `trend_prds`
- `trend_queries`, `trend_runtime_gaps`, `trend_runtime_metrics`

### Detection Confluence (10 tables)
- `confluence_lenses`, `confluence_lens_weights`
- `confluence_signals`, `confluence_verdicts`
- `confluence_arbiter_runs`, `confluence_attack_chains`
- `confluence_agent_actions`, `confluence_ml_invocations`
- `confluence_lineage`

### MCP Registry (7 tables)
- `mcp_servers`, `mcp_tools`, `mcp_resources`, `mcp_prompts`
- `mcp_clients`, `mcp_agent_bindings`, `mcp_tool_invocations`

### Workflow & Automation (5 tables)
- `n8n_workflows`, `workflow_triggers`, `workflow_executions`
- `soc_automation_metrics`
- `agent_tasks`, `agent_learning_feedback`

### Agent Registry (4 tables)
- `canonical_agents`, `agent_implementations`
- `soc_agent_registry`

### Dashboard & Reports (8 tables)
- `custom_dashboards`, `dashboard_widgets`, `dashboard_templates`
- `dashboard_migrations`
- `custom_reports`, `report_executions`, `report_schedules`
- `databricks_export_history`

### Feature Lab (1 table)
- `feature_lab_creations`

### ETL & Data Pipeline (10 tables)
- `data_connectors`, `data_optimization_jobs`
- `enrichment_queue`, `enrichment_sources`
- `streaming_pipelines`, `stream_partitions`, `partition_metadata`
- `lucene_indices`, `lucene_shards`, `lucene_search_cache`
- `search_performance_metrics`, `query_performance_stats`, `query_routing_rules`
- `full_text_search_config`

### Infrastructure & Internal Services (12 tables)
- `system_settings`
- `databricks_notebook_runs`, `databricks_sync_status`, `databricks_threat_feed_runs`
- `db_apps_registry`
- `lakebase_sync_jobs`, `zerobus_commits`
- `brickstore_cache`
- `bolt_gpu_training`
- `cowboy_notebooks`
- `turi_metadata_registry`
- `hedwick_model_registry`
- `alkami_inference_service`

### Miscellaneous (10+ tables)
- `risk_assessments`, `business_impact_analyses`
- `diagram_entities`, `document_uploads`, `extracted_assets`, `asset_enrichment_log`
- `entity_resolution`
- `pattern_baselines`, `pattern_investigations`
- `discovery_profiles`, `discovery_snapshots`, `discovered_patterns`
- `code_pattern_analysis`, `phishing_dataset`
- `file_operations`, `registry_operations`
- `api_calls`
- `acmeco_exposure_zones`

---

## Architecture Layers

### 1. Presentation Layer
- React 18 + TypeScript + Tailwind CSS
- Three.js for 3D visualizations
- Lucide React icons
- Real-time Supabase subscriptions
- Command palette (Cmd+K)
- Role-based UI rendering

### 2. Backend Services Layer
- 23 Supabase Edge Functions (Deno runtime)
- CORS-enabled API endpoints
- JWT-authenticated and public endpoints
- Service role access for admin operations

### 3. Data Layer
- Supabase PostgreSQL (327 tables)
- Row-Level Security on all tables
- Real-time subscriptions
- Vector embeddings (pgvector)
- Full-text search
- JSON/JSONB document storage

### 4. Intelligence Layer
- LLM/SLM integration (detection reasoning)
- Vector similarity search
- Graph reasoning (GraphFrames-style)
- CEP engine (Complex Event Processing)
- Temporal correlation (ChronoWeave)
- Behavioral analytics (psychological profiling)

### 5. Integration Layer
- ETL pipeline (ingest → parse → normalize → enrich → correlate)
- OCSF normalization framework
- Multi-source connectors (Cloud, Network, SIEM, SAP)
- STIX/TAXII intelligence exchange
- n8n workflow automation
- Databricks notebook execution
- Dashboard migration (Grafana, Kibana, Splunk, Superset, Metabase, Redash)

---

## What Is Still Missing

### Known Technical Gaps (from CET Engine analysis)

| Gap | Severity |
|-----|----------|
| Spark has no Kleene in GraphFrames find() | Medium |
| Spark has no skip-till-any-match CEP primitive | Medium |
| Branch-and-bound M-CET partitioner (paper S5) | High |
| GraphFrames motif depth >6 hops degrades fast | Medium |
| Spark state store has no TTL-on-key (only watermark) | Low |
| Lakebase write latency ~2-5ms | Low |
| No native CEP correctness oracle | Medium |
| Changelog checkpointing overhead at 100K EPS | Low |

### Features Not Yet Implemented (Conceptual / Roadmap)

1. **True Realtime GraphFrames Patching** — current implementation uses mock streaming; needs Spark Structured Streaming + patched GraphFrames for production graph mutation
2. **Quine-style Standing Queries** — streaming graph state with distributed actor model not yet connected
3. **Production CET Engine** — temporal event trend engine needs Spark state store integration for production-scale event continuity
4. **Federated Security Reasoning** — multi-region, privacy-preserving vectorization not implemented
5. **Persistent Security Memory** — entity/attack/session memory survives in DB but lacks true memory fabric (vector recall + temporal weighting)
6. **Autonomous Investigation Chains** — agents execute single tasks; multi-step autonomous investigation with branching not complete
7. **Graph-Native Temporal Reasoning** — ChronoWeave stores data but graph-native temporal traversal (backward/forward through time) is mock
8. **Live Databricks Integration** — notebook execution is simulated; real Databricks SDK integration pending
9. **Production ML Pipeline** — MLflow integration is schematic; real model training/serving pipeline needs Databricks ML Runtime
10. **Real Dark Web Intelligence** — dark web sources are mock data; needs Tor-based collection infrastructure
11. **Production STIX/TAXII Server** — schema exists but no live TAXII server feeds connected
12. **Hardware Security Module (HSM) Integration** — key management for encryption at rest
13. **SOAR Bi-directional Sync** — n8n workflows run but lack bi-directional state sync with external SOAR platforms
14. **True Multi-Tenancy Isolation** — multi-tenant tables exist but no Postgres schema-per-tenant or RLS tenant isolation
15. **Offline/Edge Detection** — all detection is cloud-based; no edge agent for disconnected operation
16. **Custom Detection SLM Training** — DSLM schema exists but actual model training infrastructure not connected
17. **Alert Fatigue ML Model** — schema for false positive reduction exists; production model not trained
18. **Geopolitical Risk Live Feeds** — edge function exists but real geopolitical data sources not connected in production
19. **End-to-End Encryption** — data in transit is HTTPS; data at rest encryption and field-level encryption not implemented
20. **Disaster Recovery / Failover** — HA settings table exists; actual multi-region failover not configured

---

## Summary Statistics

| Metric | Count |
|--------|-------|
| UI Views / Feature Panels | 64 |
| Navigation Sections | 10 |
| Database Tables | 327 |
| Edge Functions | 23 |
| Notebook Categories | 17 |
| Industry Verticals | 8 |
| Dashboard Migration Parsers | 6 (Grafana, Kibana, Splunk, Superset, Metabase, Redash) |
| Compliance Frameworks | 6+ (SOC2, ISO27001, NIST, PCI-DSS, HIPAA, GDPR) |
| Agent Types | 20+ (canonical agents registry) |
| Correlation Rule Types | 5 (simple, complex, graph, behavioral, ML) |
| Connector Types | 3 categories (Cloud, Network, SIEM) |
| Financial Sub-modules | 17 |
| Command Center Sub-views | 18+ |
