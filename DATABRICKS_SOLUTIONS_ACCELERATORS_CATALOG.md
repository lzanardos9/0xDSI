# 0xDSI -- Databricks SOC Intelligence: Solutions Accelerator Catalog

> A comprehensive feature-by-feature catalog of the 0xDSI Agentic SOC platform, designed for Databricks Solutions Accelerator blog posts. 34 features across 8 sections, 100+ sub-views, powered by real-time data, ML models, vector embeddings, graph correlation, and 3D visualization.

---

## Table of Contents

1. [Overview Section](#1-overview)
2. [Executive Section](#2-executive)
3. [Detection & Intelligence Section](#3-detection--intelligence)
4. [Investigation Section](#4-investigation)
5. [Response & Automation Section](#5-response--automation)
6. [Data & Integration Section](#6-data--integration)
7. [Reports Section](#7-reports)
8. [Administration Section](#8-administration)
9. [Cross-Cutting Platform Capabilities](#9-cross-cutting-platform-capabilities)
10. [Summary Reference Table](#10-summary-reference-table)

---

## 1. Overview

### 1.1 Main Dashboard

**Navigation ID:** `overview`
**Component:** `Dashboard.tsx`

**What It Does:**
The main landing page aggregates the highest-level operational view of the entire SOC into a single pane of glass. It is the first screen analysts see after login and provides situational awareness across all security domains.

**Sub-Sections:**

- **Global Threat Intelligence Globe** -- An interactive 3D WebGL globe (THREE.js) visualizing live threat arcs between world cities. Arcs are severity-color-coded (red for critical, orange for high, yellow for medium) and animate in real time. A live attack feed scrolls alongside the globe showing source, destination, and attack type.

- **Live Metrics Dashboard** -- Four real-time metric cards (Total Events, Active Sessions, Critical Alerts, Blocked Threats) that update every 100 milliseconds with realistic fluctuation patterns. Provides an instant pulse of SOC health.

- **Composite Risk Overview** -- A calculated composite risk score drawn from alerts, events, cases, and user behavior data, broken into 6 risk categories: Threats, Vulnerabilities, Compliance, Incidents, Assets, and Users. Each category shows its own score and trend direction.

- **Business & Public Sector Scorecards** -- A toggleable view between:
  - *Business Mode:* SecurityScorecard-style letter grades (A-F) across 10 domains (Network Security, DNS Health, Patching Cadence, Endpoint Security, IP Reputation, Application Security, Hacker Chatter, Information Leak, Social Engineering, Email Security)
  - *Public Sector Mode:* Military-grade readiness tiers (DEFCON-style), CMAI (Cyber Mission Assurance Index) scores, and operational readiness percentages

- **OKR Performance Cards** -- 6 Objective & Key Result cards tracking: MTTD (Mean Time to Detect), MTTR (Mean Time to Respond), Threat Detection Rate, False Positive Rate, Critical Alerts Resolved, Security Coverage percentage

- **Business Impact Analysis** -- Cost Avoidance calculation ($2.4M+), Operational Downtime tracking, Compliance Score, Risk Reduction metrics. Includes ROI Breakdown with net benefit calculations and before/after efficiency comparisons.

- **Recent Activity Feed** -- A live feed pulling from alerts, events, cases, agent tasks, and user behavior events via Supabase real-time subscriptions. Shows the most recent security-relevant actions across the platform.

**Data Sources:** `alerts`, `events`, `sessions`, `cases`, `agent_tasks`, `user_behavior_events` (Supabase real-time subscriptions)

**Blog Post Angle:** "Building a Real-Time SOC Command Center with Databricks and 3D Threat Visualization"

---

### 1.2 SOC Agent Bricks

**Navigation ID:** `agentbricks`
**Component:** `AgentBricksSOC.tsx`

**What It Does:**
Displays all AI-powered SOC agents as interactive "bricks" (cards) with real-time status monitoring, task queues, performance metrics, and an inter-agent communication bus. This is the operational control panel for the multi-agent AI system.

**Key Capabilities:**

- **Agent Cards** -- Each agent (Triage, Enrichment, Orchestrator, Investigation, Response) shown as a card with: status indicator, performance score, tasks completed, accuracy rate, average response time

- **Task Queue Management** -- Per-agent task list with priority levels, status tracking, confidence scores, and processing time metrics

- **SOC Metrics Aggregation** -- Platform-wide agent metrics: alerts auto-triaged, alerts escalated, false positives filtered, IOCs enriched, automated responses executed, analyst time saved (hours)

- **3D Agent Network Graph** -- Interactive THREE.js visualization showing how agents communicate and pass data between each other. Edges represent message flows, node size represents workload.

- **Agent Communication Bus** -- Real-time inter-agent messaging system showing exactly what agents are telling each other (e.g., "Triage Agent -> Enrichment Agent: Requesting IOC lookup for 185.220.101.x")

- **Agent Narratives** -- Natural language descriptions of agent actions (e.g., "I analyzed 47 alerts in the last hour and escalated 3 as potential APT activity based on TTP pattern matching")

**Data Sources:** `soc_agents`, `agent_tasks`, `soc_agent_metrics`, `agent_narratives`

**Blog Post Angle:** "Multi-Agent AI Architecture for Autonomous SOC Operations on Databricks"

---

### 1.3 3D SOC Agents (Immersive Mode)

**Navigation ID:** `soc3d`
**Component:** `SOCAgents3D.tsx`

**What It Does:**
A fully immersive 3D virtual SOC room built with THREE.js where 5 AI agents are rendered as animated 3D characters sitting at workstations. Data packets visually fly between agents showing real-time inter-agent communication.

**Key Capabilities:**

- **3D Agent Characters** -- Five agents (Triage, Enrichment, Orchestrator, Investigation, Response) rendered as 3D models at individual workstations in a virtual operations center

- **Data Packet Animation** -- Visible "data packets" fly between agents along curved paths, showing the flow of intelligence as it moves through the analysis pipeline

- **Visual Effects** -- Energy beams connecting agents, floor pulse effects during high-activity periods, floating labels with agent names/status, colored auras indicating agent health

- **Central Hologram** -- A rotating holographic display in the center of the room showing aggregate threat data

- **Per-Agent Chat Interface** -- Click any agent to open a conversational interface with quick prompts. Ask Triage Agent about current alert volume, ask Investigation Agent about active hunts, etc.

- **Live Activity Feed** -- Color-coded message stream showing real-time agent actions

- **VR/Immersive HUD** -- A heads-up display overlay and SOC Command Screen for VR-style immersion

**Data Sources:** Agent communication bus, simulated real-time event streams

**Blog Post Angle:** "Immersive 3D SOC Visualization: Making AI Agent Operations Tangible"

---

### 1.4 CISO Assistant (AI Advisor)

**Component:** `CISOAssistant.tsx` (embedded in Dashboard Overview)

**What It Does:**
An AI-powered conversational security advisor with voice input/output capabilities. It can query live SOC data, generate detection rules, and provide strategic security recommendations.

**Key Capabilities:**

- **Conversational AI** -- Full chat interface backed by a Supabase Edge Function calling an LLM. Maintains conversation context across the session.

- **Voice Input/Output** -- Web Speech API integration for hands-free operation. Speak questions, receive spoken answers.

- **Live Data Querying** -- The AI can query real-time SOC metrics, alert counts, case statuses, and threat intelligence to provide grounded answers.

- **Correlation Rule Generation** -- Ask the AI to create detection rules. It generates valid pseudo-code with MITRE mappings, which can be inspected and saved.

- **Visual Rule Graph** -- Generated rules are visualized as correlation graphs showing event relationships

- **Detection-as-Code Inspector** -- A modal that lets you inspect AI-generated rules in DaC format before deployment

- **Processing Transparency** -- AgentStepLoader shows each processing step the AI takes (querying data, analyzing context, formulating response)

**Data Sources:** Supabase Edge Function (`ciso-assistant`), live Supabase data

**Blog Post Angle:** "Voice-Enabled AI Security Advisor: Natural Language SOC Querying with Databricks AI"

---

## 2. Executive

### 2.1 Executive Dashboard

**Navigation ID:** `executive`
**Component:** `ExecutiveDashboard.tsx`
**Access:** Restricted to CISO and Admin roles

**What It Does:**
A high-level strategic dashboard designed for CISOs and security executives. Surfaces key performance indicators, trend analysis, and cost metrics without operational noise.

**Key Capabilities:**

- **8 Strategic Metric Cards:**
  1. Security Score (composite rating with trend)
  2. Critical Alerts (count with week-over-week change)
  3. Active Cases (current open investigations)
  4. MTTR (Mean Time to Respond with improvement trend)
  5. Compliance Score (aggregate framework compliance)
  6. Cost Savings (quantified value from automation)
  7. Critical Vulnerabilities (unpatched critical CVEs)
  8. High-Risk Accounts (users flagged by UEBA)

- **Trend Indicators** -- Each metric includes directional trend percentage (up/down arrow with color coding)

- **Integrated CISO Assistant** -- The AI advisor is embedded directly for executive-level strategic queries

**Data Sources:** `alerts`, `cases`, `vulnerabilities`, `user_behavior_events`

**Blog Post Angle:** "CISO-Ready Dashboards: Executive Security Intelligence on Databricks"

---

## 3. Detection & Intelligence

### 3.1 Threat Feeds

**Navigation ID:** `feeds`
**Component:** `ThreatFeedsPanel.tsx`

**What It Does:**
Manages external threat intelligence feed subscriptions, synchronization schedules, and indicator ingestion tracking.

**Sub-Tabs:** Feeds | Sync Logs

**Key Capabilities:**

- **Feed Management** -- View all configured threat feeds with status (active/inactive/error), last sync timestamp, total indicators ingested
- **Manual Sync** -- Trigger on-demand synchronization for any feed
- **Sync History** -- Detailed sync logs with timing, success/failure status, indicators added/updated counts
- **Supported Sources:** abuse.ch URLhaus, abuse.ch ThreatFox, AlienVault OTX, CIRCL, OpenPhish, Shadowserver, and custom feeds

**Data Sources:** `threat_feeds`, `threat_feed_sync_logs`

**Blog Post Angle:** "Automating Threat Intelligence Ingestion Pipelines on Databricks"

---

### 3.2 Indicators of Compromise (IOCs)

**Navigation ID:** `iocs`
**Component:** `IOCPanel.tsx`

**What It Does:**
Central IOC management system for tracking, searching, and correlating indicators of compromise against live telemetry.

**Sub-Tabs:** IOCs | Matches

**Key Capabilities:**

- **IOC Inventory** -- Searchable/filterable repository of indicators: IP addresses, domains, file hashes (MD5/SHA1/SHA256), URLs, email addresses
- **Severity Classification** -- Each IOC tagged with severity (critical/high/medium/low), source attribution, and confidence score
- **Match Tracking** -- Real-time matching of IOCs against incoming events, with exact match counts and timestamps
- **Statistics Dashboard** -- Total IOCs, critical count, high priority count, recent match count

**Data Sources:** `iocs`, `ioc_matches`

**Blog Post Angle:** "Scalable IOC Management and Real-Time Matching with Databricks Delta Lake"

---

### 3.3 HoneyPot & HoneyToken Management

**Navigation ID:** `honeypot`
**Component:** `HoneypotControl.tsx`

**What It Does:**
Full deception technology platform for deploying and managing honeypots (fake services) and honeytokens (decoy credentials/files) to detect attackers who have breached the perimeter.

**Sub-Tabs:** Overview | Honeypots | Tokens | Feed

**Key Capabilities:**

- **Honeypot Deployment** -- Deploy and manage fake services (SSH, HTTP, SMB, RDP, databases) with status tracking and interaction counters
- **Honeytoken Management** -- Create and track decoy credentials, API keys, documents, and database records planted across the environment
- **Interaction Feed** -- Real-time feed of attacker interactions with deception assets (who touched what, when, from where)
- **Geographic Mapping** -- Interactive map showing the geographic origin of attacker interactions
- **Deception Statistics** -- Aggregate metrics across all deception assets

**Data Sources:** `honeypots`, `honeytokens`, `honeypot_interactions`

**Blog Post Angle:** "Deception Technology at Scale: Honeypots and Honeytokens Powered by Databricks"

---

### 3.4 AI Malware Sandbox

**Navigation ID:** `malwaresandbox`
**Component:** `AIMalwareSandbox.tsx`

**What It Does:**
Deep behavioral malware analysis platform with kernel-level monitoring, process tracking, network capture, memory forensics, and AI-powered classification.

**Sub-Tabs:** Overview | Kernel | Process | Network | Memory | AI Analysis | Submit PE

**Key Capabilities:**

- **Sample Inventory** -- Track all submitted malware samples with threat scores, analysis status, file types, and submission timestamps
- **Kernel-Level Monitoring** -- Syscall interception, kernel hook detection, driver loading analysis, privilege escalation attempts
- **Process Behavior Analysis** -- Process tree reconstruction, child process spawning, DLL injection detection, privilege escalation tracking
- **Network Behavior Capture** -- C2 communication detection, DNS query analysis, data exfiltration pattern recognition, protocol anomaly detection
- **Memory Forensics** -- Heap inspection, shellcode detection, ROP chain identification, memory injection analysis
- **AI Classification** -- Neural network-based malware classification with ML model explainability (which features drove the classification)
- **PE Submission** -- Drag-and-drop PE file upload with multi-stage automated analysis pipeline

**Data Sources:** `malware_samples`, `sandbox_sessions`, `kernel_activity`, `process_behavior`, `network_behavior`, `memory_analysis`, `ai_analysis_results`

**Blog Post Angle:** "AI-Powered Malware Analysis: From Kernel Monitoring to Neural Classification on Databricks"

---

### 3.5 Model Poisoning Guard

**Navigation ID:** `poisonguard`
**Component:** `ModelPoisoningGuard.tsx`

**What It Does:**
Protects the ML models used throughout the SOC platform from data poisoning attacks, adversarial manipulation, and model drift. A unique "security for the security AI" feature.

**Sub-Tabs:** Registry | Detections | Simulation | Integrity | Defense

**Key Capabilities:**

- **ML Model Registry** -- Catalog of all ML models in use with health status, accuracy tracking, drift scores, training data provenance
- **Poisoning Detection** -- Alerts when poisoning attempts are detected, with severity, confidence, attack vector, and MITRE ATT&CK technique mapping
- **Red-Team Simulation** -- Simulate poisoning attacks against your own models to test resilience. Shows accuracy impact before/after poisoning.
- **Training Data Integrity** -- Audit training data using spectral signature analysis, distribution anomaly detection, and label consistency checks
- **Defense Configuration** -- Configure sensitivity thresholds, auto-quarantine rules, alert triggers, and retraining schedules

**Data Sources:** `ml_model_registry`, `poisoning_detections`, `model_simulations`, `training_data_audits`, `defense_configs`

**Blog Post Angle:** "Guarding the Guards: Protecting SOC ML Models from Adversarial Attacks on Databricks"

---

### 3.6 Attack Vector Visualization (3D)

**Navigation ID:** `attackvectors`
**Component:** `AttackVectorGraph.tsx`

**What It Does:**
Real-time 3D visualization of active attack vectors traversing a network topology, rendered with THREE.js. Each attack type has a unique visual signature.

**Key Capabilities:**

- **3D Network Topology** -- 14 network nodes (Core Server, DB Cluster, Web Farm, API Gateway, Auth Service, SCADA/OT, Cloud VPC, Mail Exchange, DNS Server, etc.) arranged in 3D space

- **8 Attack Templates:**
  1. APT Lateral Movement
  2. DDoS Amplification
  3. Ransomware Deployment
  4. SQL Injection Chain
  5. Zero-Day SCADA Exploit
  6. Credential Stuffing
  7. DNS Tunneling Exfiltration
  8. Supply Chain Backdoor

- **6 Visual Attack Shapes** -- Each attack rendered with a distinct animation: worm, beam, pulse, swarm, wave, spiral

- **MITRE ATT&CK Mapping** -- Each attack links to specific MITRE techniques in its chain

- **Real-Time Stats** -- Total attacks, blocked count, in-progress count with live counters

**Data Sources:** Simulated attack data with MITRE technique mappings

**Blog Post Angle:** "Visualizing Attack Chains in 3D: Real-Time Threat Animation on Databricks"

---

### 3.7 Smart Threat Modeling

**Navigation ID:** `threatmodeling`
**Component:** `SmartThreatModeling.tsx`

**What It Does:**
AI-assisted threat modeling that automatically generates threat models with scenarios, risk scores, attack chains, and recommended mitigations.

**Key Capabilities:**

- **Auto-Generated Threat Models** -- AI creates threat models for assets/systems with confidence scores. Models categorized as physical, logical, or hybrid.
- **Three-Level Drill-Down:**
  1. *Model Level:* Overall threat model with type, status, MITRE tactics
  2. *Scenario Level:* Individual attack scenarios with likelihood, impact, risk score, and full attack chains
  3. *Mitigation Level:* Recommended mitigations with implementation status, effectiveness rating, cost estimate, and priority
- **MITRE Mapping** -- Every model maps to specific ATT&CK tactics and techniques
- **Asset & Vector Listing** -- Each model catalogs affected assets and attack vectors

**Data Sources:** `threat_models`, `threat_scenarios`, `threat_mitigations`

**Blog Post Angle:** "AI-Generated Threat Models: Automating Risk Assessment with Databricks ML"

---

### 3.8 Correlation Rules (Detection-as-Code)

**Navigation ID:** `correlationrules`
**Component:** `CorrelationRulesPanel.tsx`

**What It Does:**
The most comprehensive detection rule management system in the platform. Manages 11 distinct rule engine types with full Detection-as-Code (DaC) lifecycle, version control, testing, and YAML/Sigma export.

**11 Rule Engine Types:**

1. **Deterministic** -- Traditional threshold and pattern-matching rules
2. **ML Anomaly Detection** -- Unsupervised models (Isolation Forest, Autoencoders, LOF, VAE)
3. **ML Classification** -- Supervised models (XGBoost, Random Forest, Neural Networks)
4. **Vector Micro-Pattern** -- Embedding-based similarity search (cosine similarity in high-dimensional space)
5. **Graph Correlation** -- Graph traversal and pattern detection across entity relationships
6. **Temporal Sequence** -- Time-ordered event sequence detection with sliding windows
7. **Behavioral Baseline** -- Deviation from established user/entity baselines
8. **Bayesian Probabilistic** -- Bayesian inference with prior/posterior probability updates
9. **Ensemble Multi-Model** -- Multiple models voting on a detection decision
10. **Adversarial Simulation** -- Rules that model attacker behavior to detect evasion
11. **Cross-Domain Fusion** -- Rules correlating across physical, network, identity, and endpoint domains

**DaC Lifecycle:** Draft -> Review -> Staging -> Production

**Key Capabilities:**

- **Version Control** -- Changelog, git commit references, review status per version
- **Test Cases** -- Attach test cases to rules with pass/fail tracking
- **YAML Export** -- Individual and bulk export in YAML and Sigma formats
- **Complexity Scoring** -- Each rule scored for complexity (1-10)
- **MITRE Mapping** -- Tactics, techniques, and compliance framework references per rule
- **DaC Status Badges** -- Visual lifecycle indicators
- **Version Drawer** -- Slide-out panel showing full version history
- **Pagination** -- 50 rules per page for large rule libraries

**Data Sources:** `correlation_rules_library`

**Blog Post Angle:** "Detection-as-Code: 11 Correlation Engine Types from Deterministic to Bayesian on Databricks"

---

## 4. Investigation

### 4.1 User Behavior Analytics (UEBA)

**Navigation ID:** `userbehavior`
**Component:** `UserBehavior.tsx`

**What It Does:**
Full User and Entity Behavior Analytics (UEBA) platform with risk profiling, anomaly detection, behavioral correlation, and a unique LLM usage risk monitoring capability.

**Key Capabilities:**

- **User Risk Profiles** -- Every user scored with a composite risk score based on behavior patterns. Profiles sorted by risk for prioritized investigation.
- **Behavior Event Timeline** -- Chronological view of all user actions (logins, file access, network activity, privilege changes) with anomaly highlighting
- **Risk Assessment Engine** -- Individual risk factors identified per user with severity and contributing evidence
- **Behavioral Correlations** -- Cross-event correlation showing how seemingly unrelated actions form suspicious patterns
- **User Event Network Graph** -- Visual graph showing relationships between users, assets, and events
- **LLM Risk Profiling** -- Unique capability that monitors how users interact with AI/LLM tools, detecting:
  - PII exposure in LLM prompts
  - Credential leakage to AI systems
  - Jailbreak attempts against corporate AI
  - Data exfiltration via AI tools
  - Policy violations in AI usage
- **ML Model Explainer** -- Transparency into which ML features drive each risk score

**Data Sources:** `user_profiles`, `user_behavior_events`, `user_risk_assessments`, `behavior_correlations`, `llm_risk_profiles`, `llm_interactions`, `llm_risk_incidents`

**Blog Post Angle:** "Next-Gen UEBA: Behavioral Analytics and LLM Usage Risk Monitoring on Databricks"

---

### 4.2 Network & Physical Security Convergence

**Navigation ID:** `topology`
**Component:** `NetworkTopology.tsx`

**What It Does:**
A unified view that converges logical (cyber) and physical security into a single investigation surface, plus deep packet inspection capabilities.

**Sub-Tabs:** Logical | Physical | DPI

**Key Capabilities:**

- **Logical View:**
  - Asset registry grouped by physical location
  - Asset types: servers, databases, network devices, endpoints, cloud resources
  - Vulnerability overlay per asset with CVE details
  - Real-time asset change subscriptions

- **Physical View:**
  - Personnel tracking with location and movement patterns
  - CCTV camera management with status and zone assignment
  - Physical security events (badge access, door breaches, tailgating)
  - Physical zone management with access level requirements
  - Physical asset vulnerability tracking
  - Simulated personnel movement for demonstration

- **DPI (Deep Packet Inspection):**
  - Network flow analysis with protocol breakdown
  - Packet capture viewing with payload inspection
  - DLP (Data Loss Prevention) detection of sensitive data in transit
  - Content reconstruction from captured packets
  - Flow-based anomaly analysis

**Data Sources:** `asset_registry`, `asset_vulnerabilities`, `personnel_tracking`, `cctv_cameras`, `physical_security_events`, `physical_zones`, `physical_asset_vulnerabilities`, `dpi_flows`, `packet_captures`, `dlp_detections`

**Blog Post Angle:** "Converging Cyber and Physical Security: Unified Network and Physical Monitoring on Databricks"

---

### 4.3 Vulnerability Management

**Navigation ID:** `vulnerabilities`
**Component:** `VulnerabilitiesPanel.tsx`

**What It Does:**
Unified vulnerability management that aggregates vulnerabilities from three sources: internal asset scans, the NIST National Vulnerability Database (NVD), and physical infrastructure assessments.

**Key Capabilities:**

- **Three-Source Aggregation:**
  1. *Asset Vulnerabilities* -- From internal scanning tools, with CVE ID, CVSS score, severity, affected asset, remediation guidance, patch status
  2. *NIST NVD Feed* -- Top 50 vulnerabilities by CVSS score from the National Vulnerability Database
  3. *Physical Vulnerabilities* -- Physical infrastructure weaknesses (locks, cameras, access points)

- **Statistics Dashboard** -- Counts by severity (critical/high/medium/low), total count, patched vs. open
- **Search & Filter** -- Filter by severity, search by CVE ID or description

**Data Sources:** `asset_vulnerabilities`, `nist_nvd_vulnerabilities`, `physical_asset_vulnerabilities`

**Blog Post Angle:** "Three-Source Vulnerability Intelligence: Internal, NVD, and Physical on Databricks Delta Lake"

---

### 4.4 Sessions & Events

**Navigation ID:** `lists`
**Component:** `ListsPanel.tsx`

**What It Does:**
Real-time session monitoring and security list management for tracking active user sessions and maintaining threat/allow lists.

**Sub-Tabs:** Session Monitor | Session Lists | Active Lists

**Key Capabilities:**

- **Live Session Monitoring** -- Real-time view of all active sessions with status filtering (all, active, suspicious). Auto-refreshes every 5 seconds.
- **Session Lists** -- Manage named session lists for grouping and tracking related sessions
- **Active Lists** -- Maintain dynamic security lists (watchlists, allowlists, blocklists) that feed into correlation rules

**Data Sources:** `sessions`, `session_lists`, `active_lists`

**Blog Post Angle:** "Real-Time Session Intelligence: Monitoring and Security List Management"

---

### 4.5 AI Threat Hunting (Vector Search)

**Navigation ID:** `vectorhunt`
**Component:** `VectorThreatHunting.tsx`

**What It Does:**
AI-powered threat hunting using vector embeddings and similarity search to find previously unseen threats by their behavioral resemblance to known attack patterns.

**Key Capabilities:**

- **Vector Embedding Engine** -- Converts security events into 1536-dimensional vector representations for similarity comparison
- **AI Correlation Engine** -- Automated threat detection through embedding-based correlation
- **Micro-Pattern Detection** -- Identifies subtle attack micro-patterns with confidence scores and match counts against known pattern libraries
- **Physical-Cyber Fusion** -- Correlates physical security events (badge readers, tailgating, forced entry) with cyber events in vector space
- **Reasoning Graph** -- Visual graph showing how individual micro-patterns combine to form a complete detection, with weighted edges showing contribution strength
- **ML Model Explainer** -- Explains which features and dimensions drive each similarity match

**Data Sources:** Supabase tables, vector engine, mock physical security events

**Blog Post Angle:** "Vector-Embedding Threat Hunting: Finding Unknown Threats Through Behavioral Similarity on Databricks"

---

### 4.6 Pattern Discovery

**Navigation ID:** `patterns`
**Component:** `PatternDiscoveryPanel.tsx`

**What It Does:**
AI-driven discovery of previously unknown attack patterns in telemetry data, with automatic correlation rule generation from discovered patterns.

**Key Capabilities:**

- **Discovery Profiles** -- Configure what types of patterns to search for (event types, time windows, minimum confidence)
- **Discovered Patterns** -- View AI-identified patterns with event sequences, confidence scores, and frequency analysis
- **3D Pattern Graph** -- Interactive THREE.js visualization of pattern relationships and event clusters
- **Raw Data Analysis** -- Drill into the raw events that comprise each discovered pattern
- **AI Rule Generation** -- The AI Correlation Agent automatically generates deployable correlation rules from discovered patterns
- **DaC Inspector** -- Review and approve AI-generated rules before deployment
- **MITRE Mapping** -- Auto-maps discovered event sequences to ATT&CK techniques

**Data Sources:** `discovery_profiles`, `discovered_patterns`, AI Correlation Agent

**Blog Post Angle:** "Autonomous Pattern Discovery: AI That Writes Its Own Detection Rules on Databricks"

---

## 5. Response & Automation

### 5.1 Alert Management

**Navigation ID:** `alerts`
**Component:** `AlertsPanel.tsx`

**What It Does:**
Security alert lifecycle management with real-time updates, severity-based prioritization, and analyst assignment tracking.

**Key Capabilities:**

- **Alert Queue** -- All alerts with severity (critical/high/medium/low) and status (new/investigating/resolved/false_positive)
- **Status Management** -- Update alert status directly from the panel
- **Auto-Refresh** -- 5-second polling for new alerts
- **Analyst Assignment** -- Track which analyst owns each alert
- **Filtering** -- Filter by status and severity

**Data Sources:** `alerts`

**Blog Post Angle:** "Streamlining Alert Triage: Real-Time Alert Management Pipelines"

---

### 5.2 Case Management

**Navigation ID:** `cases`
**Component:** `CasesPanel.tsx`

**What It Does:**
Full incident case management system for tracking investigations from initial detection through resolution.

**Key Capabilities:**

- **Case Lifecycle** -- Track cases through: New -> Investigating -> Contained -> Resolved -> Closed
- **Case Creation** -- Create cases with title, description, category, priority, and assigned analyst
- **Search & Filter** -- Search by case number, title, or category. Filter by status and priority.
- **Case Details** -- Drill into individual cases for full context
- **Statistics Dashboard** -- Total cases, new, investigating, resolved counts

**Data Sources:** `cases`

**Blog Post Angle:** "Incident Case Management: End-to-End Investigation Tracking"

---

### 5.3 Threat Escalation Engine

**Navigation ID:** `escalation`
**Component:** `ThreatEscalationPanel.tsx`

**What It Does:**
A quantitative, formula-driven threat prioritization engine that calculates escalation priority using transparent, configurable mathematical formulas.

**Sub-Tabs:** Live Calculator | Asset Registry | Formula Config | User Risk

**Formula:** `Priority = Severity x MCR x ThreatWeight x AssetCriticality`

**Key Capabilities:**

- **Interactive Calculator** -- Input severity, target asset IP, source IP and get a calculated priority score in real time
- **Asset Registry View** -- Browse all assets with their criticality scores that feed into the formula
- **Formula Configuration** -- Adjust weights and multipliers for the escalation formula
- **User Risk Integration** -- Factor user risk scores into escalation decisions
- **Audit Trail** -- All calculations stored for compliance and review

**Data Sources:** `asset_registry`, `threat_escalation_formulas`

**Blog Post Angle:** "Transparent Threat Prioritization: Mathematical Escalation Engines on Databricks"

---

### 5.4 Workflow Automation (n8n Integration)

**Navigation ID:** `workflows`
**Component:** `WorkflowsPanel.tsx`

**What It Does:**
Manages automated response workflows through n8n integration, with execution tracking and manual trigger capabilities.

**Sub-Tabs:** Workflows | Executions

**Key Capabilities:**

- **Workflow Management** -- List, enable/disable, and configure automated response workflows
- **Manual Execution** -- Trigger any workflow on-demand via n8n webhook
- **Execution History** -- Track all workflow runs with status (pending/running/completed/failed) and timing
- **Workflow Creation** -- Create new workflows with webhook URLs and authentication
- **Auto-Refresh** -- 5-second polling for execution status updates

**Data Sources:** `n8n_workflows`, `workflow_executions`

**Blog Post Angle:** "Automated Security Response: n8n Workflow Orchestration for SOC Operations"

---

### 5.5 Red Team Automation

**Navigation ID:** `redteam`
**Component:** `RedTeamAutomation.tsx`

**What It Does:**
Automated offensive security operations including fuzz testing, penetration testing, AI-generated security tools, and multi-stage attack chain simulation.

**Sub-Tabs:** Fuzzing | Pentest | AI Tools | Attack Chains

**Key Capabilities:**

- **Fuzzing Campaigns:**
  - AFL, libFuzzer, and custom fuzzer management
  - Executions/second, crash detection, code coverage tracking
  - Campaign status and findings

- **Penetration Testing:**
  - Campaign management with multiple methodologies (OWASP, PTES, custom)
  - Agent-model-based automated testing
  - Findings by severity with exploit success rates
  - Methodology-specific scanning

- **AI-Generated Security Tools:**
  - AI creates custom security tools for specific testing scenarios
  - Effectiveness scores, success rates, detection evasion rates
  - Categorized by language and target vulnerability type

- **Attack Chain Simulation:**
  - Multi-stage attack playbooks executed automatically
  - Success/failure tracking per stage
  - Duration and detection event correlation
  - MITRE ATT&CK technique mapping per chain link

**Data Sources:** `fuzzing_campaigns`, `pentest_campaigns`, `ai_generated_tools`, `attack_chains`

**Blog Post Angle:** "Automated Red Teaming: AI-Generated Offensive Tools and Attack Simulation on Databricks"

---

## 6. Data & Integration

### 6.1 Dashboard Studio

**Navigation ID:** `dashboardstudio`
**Component:** `DashboardBuilder.tsx` / `DashboardMigrationsTab.tsx`

**What It Does:**
Custom dashboard builder with drag-and-drop widget creation and a migration engine for importing dashboards from other SIEM and analytics platforms.

**Sub-Tabs:** Dashboards | Migrations | Templates

**Key Capabilities:**

- **Custom Dashboard Builder:**
  - Drag-and-drop widget placement
  - Chart types: line, bar, pie, area, scatter, stat cards, tables, text
  - Configurable data sources per widget
  - Dashboard saving and sharing

- **SIEM Migration Engine:**
  - Import dashboards from Splunk, QRadar, Kibana, Grafana, Redash, Metabase, Superset
  - Multi-step migration workflow with validation
  - Automatic widget conversion to native format

- **Template Library:**
  - Pre-built dashboard templates with usage counts
  - One-click deployment of templates

- **Databricks Export:**
  - Export dashboards to Databricks SQL format
  - Export tracking and versioning

**Data Sources:** `custom_dashboards`, `dashboard_migrations`, `dashboard_templates`, `dashboard_widgets`

**Blog Post Angle:** "Dashboard Migration at Scale: From Splunk/QRadar/Kibana to Databricks in Minutes"

---

### 6.2 Databricks Notebooks

**Navigation ID:** `notebooks`
**Component:** `DatabricksNotebooksPanel.tsx`

**What It Does:**
A curated library of production-ready Databricks security analytics notebooks, ready for deployment as Solutions Accelerators.

**Key Capabilities:**

- **Notebook Catalog** -- Browsable library organized by category (threat intel, behavioral analytics, ML models, streaming, graph correlation, mock data generation)
- **Notebook Viewer** -- Cell-by-cell inspection of each notebook with syntax highlighting
- **Category Filtering** -- Filter notebooks by security domain
- **Bulk Download** -- Download all notebooks as .py or .json for direct Databricks import
- **Metadata** -- Per-notebook: description, tags, cell count, estimated runtime, language

**Data Sources:** Static notebook definitions from `lib/databricksNotebooks` and `lib/notebooks`

**Blog Post Angle:** "Security Analytics Notebook Library: Ready-to-Deploy Databricks Solutions Accelerators"

---

### 6.3 OCSF Schema Browser

**Navigation ID:** `ocsf`
**Component:** `OCSFSchemaBrowser.tsx`

**What It Does:**
An interactive browser for the Open Cybersecurity Schema Framework (OCSF), showing how raw vendor data maps to standardized security event schemas.

**Sub-Tabs:** Classes | Mappings | Attributes | Stats

**Key Capabilities:**

- **OCSF Class Browser** -- Navigate the full OCSF category and event class hierarchy
- **Source Mappings** -- See how vendor-specific data (CrowdStrike, Palo Alto, Okta, etc.) maps to OCSF classes with confidence scores
- **Attribute Reference** -- Browse all OCSF attributes with data types and requirement levels
- **Event Statistics** -- Live counts of events per OCSF class in your environment

**Data Sources:** `ocsf_categories`, `ocsf_event_classes`, `ocsf_attributes`, `ocsf_source_mappings`, `events`

**Blog Post Angle:** "OCSF Schema Normalization: Unifying Security Data on Databricks Delta Lake"

---

### 6.4 Data Connectors

**Navigation ID:** `dataconnectors`
**Component:** `DataConnectors.tsx`

**What It Does:**
Comprehensive data connector management for ingesting security data from every possible source, including a unique bytecode-level instrumentation capability.

**Sub-Tabs:** DPI | Network Taps | Cloud APIs | SIEM Integration | Connector Catalog

**Key Capabilities:**

- **20+ Connector Categories:** SIEM, Cloud (AWS/Azure/GCP), EDR, Firewall, IAM, Email Security, Vulnerability Scanners, Threat Intel, WAF, DLP, Container Security, DevSecOps, NDR, CASB, SOAR, Observability, ICS/OT

- **Bytecode-Level Instrumentation (Unique):**
  - JVM bytecode weaving via AspectJ
  - .NET CLR profiling via Profiler API
  - Python runtime instrumentation via sys.settrace
  - Linux kernel instrumentation via eBPF kprobes
  - Intercepts: SQL queries, connection strings, JWT tokens, API keys, PII in application memory

- **Document Analysis Integration** -- Ingest security intelligence from natural-language documents (contracts, risk assessments, compliance reports)

- **Connector Health Monitoring** -- Events per second (EPS), data rate, uptime percentage per connector

**Data Sources:** Mock data and Supabase connector configurations

**Blog Post Angle:** "Universal Security Data Ingestion: From Bytecode Instrumentation to Cloud APIs on Databricks"

---

### 6.5 Document Intelligence

**Navigation ID:** `docanalysis`
**Component:** `DocumentAnalysis.tsx`

**What It Does:**
AI-powered document analysis that extracts security-relevant findings, risk indicators, and asset enrichment data from uploaded documents.

**Key Capabilities:**

- **File Upload** -- Drag-and-drop or text paste interface
- **8 Document Types Supported:**
  1. Penetration Test Reports
  2. Business Impact Analyses
  3. Network Diagrams
  4. Security Policies
  5. Legal Agreements
  6. Incident Reports
  7. Vulnerability Assessments
  8. Compliance Audit Reports

- **Multi-Phase Analysis Pipeline** -- Upload -> Extract -> Analyze -> Enrich, with progress tracking at each stage

- **Findings Extraction** -- AI identifies security findings with severity, CVSS scores, affected assets, and recommended remediation

- **Asset Enrichment** -- Extracted findings can be applied to enrich existing assets in the asset registry (individually or in bulk)

- **Executive Recommendations** -- AI generates strategic recommendations from document content

- **Compliance Impact Analysis** -- Maps document findings to compliance framework gaps

**Data Sources:** Supabase Edge Function for AI analysis, asset registry for enrichment

**Blog Post Angle:** "Document Intelligence: AI-Powered Security Knowledge Extraction on Databricks"

---

### 6.6 Streaming Graph & CEP

**Navigation ID:** `streaminggraph`
**Component:** `StreamingGraphVisualization.tsx`

**What It Does:**
Real-time streaming graph database visualization with Complex Event Processing (CEP) pattern matching for detecting multi-event attack sequences.

**Sub-Tabs:** Graph | CEP | Real-time

**Key Capabilities:**

- **Graph Visualization** -- Interactive graph of vertices (entities) and edges (relationships) with risk scores and suspicious flags
- **Complex Event Processing (CEP):**
  - Pattern templates for multi-event sequence detection
  - Severity and confidence scoring per matched pattern
  - Vector similarity search for finding similar CEP patterns
  - Attack step enrichment with phase colors and severity indicators
- **Real-Time Streaming** -- Dedicated real-time graph streaming component
- **Correlation Rule Creation** -- Generate new correlation rules directly from detected CEP patterns
- **Configurable Parameters** -- Similarity threshold, time decay factor, max results
- **Graph Statistics** -- Vertex count, edge count, suspicious connections, high-risk vertices, average confidence

**Data Sources:** `streaming_graph_vertices`, `streaming_graph_edges`, `cep_pattern_matches`

**Blog Post Angle:** "Streaming Graph Analytics and CEP: Real-Time Multi-Event Attack Detection on Databricks"

---

### 6.7 Architecture & Business Value

**Navigation ID:** `architecture`
**Component:** `ArchitectureVisualization.tsx`

**What It Does:**
Comprehensive platform architecture documentation, interactive visualizations, and business value analysis.

**Sub-Tabs:** 3D Architecture | 2D Diagram | Technical Documentation | Agent Code & Config | ROI & Business Value | Market Analysis

**Key Capabilities:**

- **3D Architecture** -- Interactive THREE.js visualization of the platform's technical architecture
- **2D Architecture Diagram** -- Traditional architecture diagram for documentation
- **Technical Documentation** -- Full system documentation with component descriptions
- **Agent Code & Configuration** -- View the actual code and configuration of AI agents (transparency)
- **ROI & Business Value Calculator** -- Quantify the financial value of the platform (cost savings, efficiency gains, risk reduction)
- **SIEM Market Analysis** -- Competitive comparison against Splunk, QRadar, Sentinel, Chronicle, Elastic Security, etc.

**Data Sources:** Static documentation and analysis content

**Blog Post Angle:** "Platform Architecture Transparency: From 3D Visualization to ROI Calculation"

---

## 7. Reports

### 7.1 Security Reports

**Navigation ID:** `reports`
**Component:** `Reports.tsx`

**What It Does:**
Full report generation platform with a library of predefined reports, a custom report builder, and automated scheduling with email delivery.

**Sub-Tabs:** Library | Custom | Scheduled

**Key Capabilities:**

- **Predefined Report Library:**
  1. Executive Security Posture
  2. Risk Management Dashboard
  3. Threat Intelligence Summary
  4. Incident Response Report
  5. Vulnerability Assessment
  6. User Activity Audit
  7. Compliance Status Report
  8. Network Security Report

- **Custom Report Builder:**
  - Configurable data sources
  - Selectable metrics and dimensions
  - Filter configuration
  - Time range selection
  - Grouping options
  - Chart type selection

- **Report Scheduling:**
  - Frequencies: daily, weekly, monthly, quarterly, manual
  - Recipient management for email delivery
  - Schedule tracking with next run dates

- **Category Filtering** -- Executive, Operational, Compliance, Technical

**Data Sources:** `custom_reports`, aggregated from all platform data

**Blog Post Angle:** "Automated Security Reporting: From Custom Dashboards to Scheduled Executive Briefings"

---

### 7.2 Compliance Dashboard

**Navigation ID:** `compliance`
**Component:** `ComplianceDashboard.tsx`

**What It Does:**
Multi-framework compliance monitoring with control-level assessment and gap analysis tracking.

**Key Capabilities:**

- **Framework Monitoring** -- Track compliance across multiple frameworks simultaneously (SOC 2, ISO 27001, NIST CSF, PCI-DSS, HIPAA, GDPR, etc.)
- **Control-Level Assessment** -- Each framework broken into individual controls with compliant/non-compliant status
- **Gap Analysis** -- Identified gaps with severity, risk level, remediation status, responsible owner, and due dates
- **Aggregate Metrics** -- Total controls, compliant controls, critical/high/medium/low gap counts
- **Framework Drill-Down** -- Select any framework for detailed control-by-control view
- **Auto-Refresh** -- 30-second polling for compliance status updates

**Data Sources:** `compliance_frameworks`, `compliance_controls`, `compliance_assessments`

**Blog Post Angle:** "Multi-Framework Compliance Monitoring: Continuous Assessment and Gap Tracking on Databricks"

---

## 8. Administration

### 8.1 Platform User Management

**Navigation ID:** `usermanagement`
**Component:** `UserManagement.tsx`

**What It Does:**
User account lifecycle management with military-grade security clearance controls, role management, and comprehensive audit logging.

**Sub-Tabs:** Users | Audit

**Key Capabilities:**

- **User Lifecycle Management:**
  - Create, edit, disable, lock user accounts
  - Account status tracking: active, disabled, locked, pending
  - Account expiration date management

- **Role & Clearance Management:**
  - Roles: analyst, engineer, admin, CISO
  - Security clearance levels (Unclassified through TS/SCI)
  - Compartment/program access management
  - Supervisor assignment

- **Security Controls:**
  - MFA enforcement per user
  - Session timeout configuration
  - Maximum concurrent sessions
  - Password policy enforcement

- **Audit Logging:**
  - Full audit trail of all administrative actions
  - Action type, timestamp, actor, and affected user
  - Searchable and filterable

**Data Sources:** `user_profiles` (with extended security fields)

**Blog Post Angle:** "Enterprise User Management: Clearance-Level Access Controls for SOC Operations"

---

### 8.2 Production Settings

**Navigation ID:** `settings`
**Component:** `ProductionSettings.tsx`

**What It Does:**
System-wide configuration panel for all platform components, from Databricks integration to high availability and auto-scaling.

**Configuration Domains:**

- **Databricks Integration** -- Workspace URL, access token, cluster ID, Unity Catalog and schema
- **Email (SMTP)** -- Server configuration for alert and report delivery
- **SIEM Configuration** -- Retention policies, log levels, max events/second throughput
- **ML Settings** -- Enable/disable ML correlation, auto-response toggles
- **Authentication:**
  - Session timeout and lockout policies
  - Password complexity requirements
  - MFA enforcement
  - SAML SSO configuration
  - OAuth provider management (multiple providers)
  - LDAP directory integration
- **Security** -- Audit logging, encryption at rest, rate limiting, API rate limits
- **Backup** -- Automated backup scheduling
- **High Availability:**
  - HA mode enable/disable
  - Node count configuration
  - Sync mode (synchronous/asynchronous)
  - Heartbeat interval and failover timeout
  - Load balancer type and algorithm selection
- **Auto-Scaling:**
  - Enable/disable
  - Min/max instance counts
  - Scale-up and scale-down CPU thresholds

**Data Sources:** `system_settings`

**Blog Post Angle:** "Production-Grade Configuration: HA, Auto-Scaling, and Multi-Auth for Enterprise SOC Deployment"

---

## 9. Cross-Cutting Platform Capabilities

### 9.1 Command Palette
- Activated via Cmd/Ctrl+K from anywhere in the application
- Fuzzy search across all navigation items
- Role-filtered results (users only see what they can access)

### 9.2 Role-Based Access Control (RBAC)
- 4 roles: Analyst, Engineer, Admin, CISO
- Section-level access restrictions
- Executive section: CISO and Admin only
- Administration: Admin and CISO only
- Data & Integration: Engineer and Admin only

### 9.3 Real-Time Data Architecture
- Supabase `postgres_changes` subscriptions throughout the platform
- 100ms metric counter updates on the main dashboard
- 5-10 second polling intervals on data-heavy panels
- WebSocket-based live feeds

### 9.4 ML Model Explainability
- Reusable `MLModelExplainer` component used across 7+ features
- Provides transparency into which ML models and features power each detection
- Used in: Malware Sandbox, Model Poisoning Guard, Threat Modeling, Correlation Rules, UEBA, Vector Threat Hunting, Pattern Discovery

### 9.5 Detection-as-Code (DaC) Framework
- Full lifecycle management: Draft -> Review -> Staging -> Production
- Version control with git references
- Test case management
- YAML and Sigma export formats
- AI-assisted rule generation
- DaC Inspector modal for rule review

### 9.6 Physical-Cyber Convergence
- Physical security events (badge, CCTV, personnel) correlated with cyber events
- Unified investigation surface across both domains
- Vector-embedding fusion of physical and logical events

### 9.7 3D Visualization Engine
- THREE.js-powered 3D scenes for: Threat Globe, SOC Agents, Attack Vectors, Pattern Discovery, Architecture, Agent Network
- Interactive camera controls, particle effects, animated data flows
- VR/immersive mode support

---

## 10. Summary Reference Table

| # | Section | Feature Name | Nav ID | Key Innovation |
|---|---------|-------------|--------|----------------|
| 1 | Overview | Main Dashboard | overview | 3D Globe + 100ms real-time metrics + dual scorecards |
| 2 | Overview | SOC Agent Bricks | agentbricks | Multi-agent AI with communication bus |
| 3 | Overview | 3D SOC Agents | soc3d | Immersive 3D virtual SOC room with per-agent chat |
| 4 | Overview | CISO Assistant | (embedded) | Voice-enabled AI advisor with rule generation |
| 5 | Executive | Executive Dashboard | executive | CISO-focused KPIs with trend analysis |
| 6 | Detection | Threat Feeds | feeds | Automated threat intel ingestion pipeline |
| 7 | Detection | IOCs | iocs | Real-time IOC matching against live telemetry |
| 8 | Detection | HoneyPot & Tokens | honeypot | Full deception platform with geographic mapping |
| 9 | Detection | AI Malware Sandbox | malwaresandbox | 7-tab deep analysis from kernel to AI classification |
| 10 | Detection | Model Poisoning Guard | poisonguard | ML model security: protecting the AI itself |
| 11 | Detection | Attack Vectors 3D | attackvectors | 6 animated attack shapes with MITRE chains |
| 12 | Detection | Smart Threat Modeling | threatmodeling | AI auto-generates threat models with mitigations |
| 13 | Detection | Correlation Rules | correlationrules | 11 rule engine types with DaC lifecycle |
| 14 | Investigation | User Behavior (UEBA) | userbehavior | LLM usage risk monitoring (unique capability) |
| 15 | Investigation | Network & Physical | topology | Cyber-physical convergence + DPI + DLP |
| 16 | Investigation | Vulnerabilities | vulnerabilities | Three-source aggregation (internal + NVD + physical) |
| 17 | Investigation | Sessions & Events | lists | Real-time session monitoring with security lists |
| 18 | Investigation | AI Threat Hunting | vectorhunt | Vector-embedding similarity search with reasoning graphs |
| 19 | Investigation | Pattern Discovery | patterns | AI discovers patterns and writes its own detection rules |
| 20 | Response | Alerts | alerts | Real-time alert queue with lifecycle management |
| 21 | Response | Cases | cases | Full incident case lifecycle tracking |
| 22 | Response | Threat Escalation | escalation | Mathematical, transparent priority formula |
| 23 | Response | Automation | workflows | n8n workflow orchestration with execution tracking |
| 24 | Response | Red Team | redteam | AI-generated offensive tools + attack chain simulation |
| 25 | Data | Dashboard Studio | dashboardstudio | SIEM dashboard migration from 7 platforms |
| 26 | Data | Databricks Notebooks | notebooks | Ready-to-deploy notebook catalog |
| 27 | Data | OCSF Schema | ocsf | Interactive OCSF browser with live event stats |
| 28 | Data | Data Connectors | dataconnectors | Bytecode-level instrumentation (JVM/.NET/Python/eBPF) |
| 29 | Data | Document Intelligence | docanalysis | AI extracts security findings from natural-language docs |
| 30 | Data | Streaming Graph | streaminggraph | Streaming graph DB with CEP pattern matching |
| 31 | Data | Architecture | architecture | 3D/2D architecture + ROI calculator + market analysis |
| 32 | Reports | Security Reports | reports | Custom report builder with scheduled email delivery |
| 33 | Reports | Compliance | compliance | Multi-framework compliance with gap tracking |
| 34 | Admin | Platform Users | usermanagement | Military-grade clearance management with audit trail |
| 35 | Admin | Production Settings | settings | HA, auto-scaling, multi-auth (SAML/OAuth/LDAP) |

---

**Total: 35 features across 8 sections, 100+ sub-views, 60+ database tables, 11 correlation engine types, 7 ML-integrated features, 6 THREE.js 3D visualizations.**
