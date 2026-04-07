# Dazzle Intelligence Platform -- Complete Feature Description

## Platform Overview

Dazzle is an enterprise-grade AI-powered Security Operations Center (SOC) platform built on React, TypeScript, Supabase (PostgreSQL), and Three.js. It provides end-to-end security operations capabilities spanning event ingestion, real-time threat detection, automated incident response, behavioral analytics, compliance monitoring, and executive reporting. The platform is designed with a Databricks Lakehouse migration path for production-scale deployments.

**Technology Stack:** React 18 + TypeScript, Vite, Tailwind CSS, Supabase (PostgreSQL, Auth, Edge Functions, Realtime), Three.js, Lucide React, pgvector extension for AI-powered vector search.

---

## 1. Authentication and Access Control

### 1.1 Three-Factor Authentication

The login system implements a three-step progressive authentication flow:

- **Step 1 -- Credentials:** Traditional username and password authentication against Supabase Auth. Users sign in with their SOC credentials, which are validated server-side.
- **Step 2 -- Face Recognition:** A simulated biometric verification step that activates the user's webcam via an HTML5 Canvas interface. The system renders a face detection overlay with scanning animation, simulating enterprise-grade facial recognition.
- **Step 3 -- Movement Verification:** A behavioral biometrics step that tracks the user's mouse movements and keyboard patterns to establish a behavioral fingerprint. This captures typing cadence and pointer movement characteristics as an additional authentication factor.

The login page features the "Dazzle Intelligence Platform" branding with an animated gradient background.

### 1.2 Role-Based Access Control

The platform supports four user roles, each with different levels of access to sidebar navigation and features:

- **Analyst:** Access to detection, investigation, and case management features.
- **Engineer:** Access to architecture, data connectors, and configuration features.
- **Admin:** Full access to all features including user management and production settings.
- **CISO:** Executive-level dashboards, compliance, risk overview, and strategic reporting.

The sidebar dynamically filters navigation items based on the authenticated user's role, loaded from the `user_profiles` table.

---

## 2. Main Dashboard Shell

### 2.1 Sidebar Navigation

The dashboard provides a collapsible sidebar organized into 8 sections containing approximately 30 navigation views:

- **Detection and Intelligence:** Alerts, Events, IOCs, CEP Live Graph, Threat Globe, Attack Vectors
- **Investigation and Analytics:** Cases, Pattern Discovery, Risk Overview, User Behavior, Raw Data Analysis, Session Monitor, LLM Risk Profiling, CISO Assistant
- **Architecture and Platform:** Architecture Visualizations (2D, 3D, Documentation), Agent Code, ROI, SIEM Market Analysis
- **Threat Management:** Threat Feeds, Vulnerabilities, Threat Escalation, Smart Threat Modeling, Vector Threat Hunting
- **Automation and Response:** Workflows (n8n), Response Automation, Red Team Automation, Agent Orchestration
- **Compliance and Risk:** Compliance Dashboard, OCSF Schema Browser, Business Scorecard, Executive Dashboard, Public Sector Overview
- **Data and Configuration:** Data Connectors, Lucene Search, Streaming Graph, Lists Management, Databricks Notebooks, Internal Services Hub
- **Administration:** User Management, Production Settings, Reports

### 2.2 Command Palette

A global command palette accessible via `Ctrl+K` provides keyboard-navigable search across all navigation views. Users can quickly jump to any feature by typing its name.

### 2.3 Real-Time Subscriptions

The dashboard maintains five persistent Supabase real-time channels that listen for INSERT events on:

- `alerts` -- New security alerts
- `events` -- New security events
- `cases` -- New incident cases
- `agent_tasks` -- New AI agent tasks
- `user_behavior_events` -- New behavioral events

These subscriptions enable live data updates across all child components without manual refresh.

### 2.4 Header Bar

The top header displays a notification bell with unread count, user profile dropdown showing the current user's name and role, and a sign-out button.

---

## 3. Detection and Intelligence

### 3.1 Alerts Panel

A comprehensive alert management interface that lists all security alerts from the database. Each alert displays its severity (critical, high, medium, low), status, source, and timestamp. Analysts can transition alert statuses through a workflow: new -> investigating -> resolved or dismissed. Clicking an alert opens its details including correlated event IDs and enrichment data.

### 3.2 Event Stream

A real-time scrolling feed of security events displayed in chronological order. Each event shows its OCSF (Open Cybersecurity Schema Framework) class type, source, timestamp, and severity. The stream auto-scrolls as new events arrive via real-time subscription, providing a live view of all security telemetry flowing through the platform.

### 3.3 IOC Panel (Indicators of Compromise)

A two-tab interface for managing threat indicators:

- **IOCs Tab:** Lists all indicators (IP addresses, domains, file hashes, URLs, email addresses, CVEs) with type-based filtering and text search. Each IOC shows its threat type (malware, phishing, C2, ransomware), confidence score, and source feed. Analysts can activate or deactivate individual IOCs.
- **Matches Tab:** Displays where IOCs have been matched against event data, showing the matched field, match type (exact, similarity, pattern, behavioral), similarity score, and whether an alert was generated.

IOCs are stored with 384-dimensional vector embeddings enabling semantic similarity search via the pgvector extension.

### 3.4 CEP Live Graph (Complex Event Processing)

A Canvas-based visualization of the Complex Event Processing engine. It displays live pattern matches over time, with pattern types including brute force, data exfiltration, lateral movement, and privilege escalation. The graph shows event clustering on a timeline, and clicking a pattern opens a detail panel. New pattern matches appear in real-time via Supabase subscription.

### 3.5 Threat Globe

A Three.js 3D rotating globe visualization showing active threats worldwide. Animated arcs connect source and destination coordinates, color-coded by threat severity. The globe features procedurally generated Earth geometry with country outlines and supports mouse interaction for rotation and zoom. A stats overlay shows the count of active threats.

### 3.6 Attack Vector Graph

A Three.js 3D visualization of active attack progressions. It includes 5 predefined attack templates (phishing chain, ransomware deployment, supply chain compromise, insider threat, advanced persistent threat) and auto-generates new attack scenarios every 8 seconds. Each attack is visualized as a sequence of nodes representing kill chain stages connected by animated edges, color-coded by attack type.

### 3.7 Reports

A three-tab reporting interface:

- **Library:** 32 predefined report templates organized across four categories (Executive, Compliance, Technical, Operational). Each template includes a description, estimated generation time, and PDF export button.
- **Custom Reports:** A builder for creating custom queries and report layouts with configurable data sources and visualization types.
- **Scheduled Reports:** Configuration for recurring report generation with cron-like recurrence patterns and email delivery to specified recipients.

---

## 4. Investigation and Analytics

### 4.1 Cases Panel

A full incident case management system with:

- **Case List View:** Filterable and searchable list of all incident cases with status badges (new, investigating, contained, resolved, closed), priority levels (low, medium, high, critical), and severity indicators. Auto-generated case numbers follow the format `CASE-YYYY-####`.
- **Case Detail Modal:** Editable fields for title, description, status, priority, and assignee. Shows related alert IDs and event IDs.
- **Comment Thread:** A threaded discussion system where analysts can add timestamped comments to cases, supporting collaborative investigation.
- **Full CRUD:** Create, read, update, and delete operations for cases.

### 4.2 Pattern Discovery Panel

An AI-driven pattern discovery interface with three views:

- **Discovered Patterns List:** Shows patterns identified by the AI agent with confidence scores, pattern type (behavioral, temporal, entity-based), threat level, and occurrence count.
- **Pattern Detail View:** Displays the matched events that compose a pattern, with timeline and entity information.
- **Correlation Rule Creation:** Allows analysts to convert discovered patterns into active correlation rules with one click. The AI agent provides reasoning for each pattern it identifies.

The AI Correlation Agent automatically analyzes patterns with confidence >= 60% and generates correlation rules with human-readable reasoning.

### 4.3 Risk Overview

A risk dashboard combining data from multiple sources into a unified risk posture view. Displays an overall risk score, risk breakdown by category, trend indicators over time periods, and highlights the top risk items requiring attention.

### 4.4 User Behavior Analytics (UEBA)

A behavioral analytics dashboard tracking user activity patterns across physical and logical domains. Features include anomaly detection with per-user anomaly scores, behavioral baselines showing normal vs. abnormal activity, deviation alerts when users exhibit unusual patterns, risk scoring per user, and timeline views of user actions.

### 4.5 Raw Data Analysis

A data analysis interface for raw security telemetry with trend detection across event data, pattern discovery with configurable time windows, statistical analysis with anomaly highlighting, and a tabular data view with sorting and filtering capabilities.

### 4.6 CISO Assistant

An AI-powered chat assistant interface designed for CISO-level queries:

- **Voice Input:** Speech recognition via the Web Speech API allows spoken queries.
- **Voice Output:** Speech synthesis reads back responses.
- **Quick-Ask Buttons:** Predefined queries for common needs (threat summary, compliance status, risk posture).
- **Typing Animation:** Simulated AI responses appear with a realistic typing effect.

### 4.7 DPI Inspection (Deep Packet Inspection)

A network traffic analysis interface displaying protocol breakdown, suspicious packet identification, payload inspection details, and traffic flow visualization. Accessible both as a standalone view and embedded within the Network Topology physical view.

### 4.8 Session Monitor

An active session monitoring dashboard showing all currently active user sessions with session duration, source IP addresses, geolocation data, and risk indicators for suspicious sessions. Includes a force-terminate capability for compromised sessions.

### 4.9 LLM Risk Profiling

A four-tab interface for monitoring and assessing risks from LLM (Large Language Model) usage:

- **Overview:** Risk profiles per user with composite scores across categories including prompt injection, data leakage, and model abuse. Shows risk trends (decreasing, stable, increasing, rapidly increasing).
- **Psychological Profile:** Big Five (OCEAN) personality assessment visualization using radar charts, plus Dark Triad scores (narcissism, Machiavellianism, psychopathy) derived from interaction analysis. Includes insider threat score and manipulation tendency score.
- **Interactions:** Audit trail of all LLM interactions with risk flags for PII exposure, credential leaks, jailbreak attempts, and data exfiltration attempts.
- **Incidents:** LLM-related security incidents with evidence, severity, and remediation status.

---

## 5. Network and Topology

### 5.1 Network Topology (Three Views)

A comprehensive network visualization with three distinct perspectives:

#### 5.1.1 Logical View
An SVG-based 2D network topology organized into 5 security zones: Internet/External, DMZ, Production, Internal, and Office. Firewall icons separate zones. Each zone contains asset cards showing hostnames, IP addresses, operating systems, and services. Assets are expandable to reveal vulnerability details including CVE IDs, CVSS scores, and remediation status.

#### 5.1.2 Physical View
A data center floor plan rendered in SVG showing:

- **Server Racks:** 4 racks (A01, A02, B01, B02) with device inventories per rack
- **CCTV Coverage:** Camera positions with coverage circles showing monitored areas
- **Personnel Tracking:** Real-time simulation of 8 personnel (5 employees, 1 contractor, 1 visitor, 1 unknown) moving through the facility. Color-coded indicators: green for authorized, orange for visitor, red for unauthorized.
- **Security Events:** Physical security alerts rendered on the floor plan (e.g., unauthorized access attempts in restricted areas like the CRAC room)
- **Infrastructure Monitoring:** Power systems, UPS status, CRAC units, temperature readings
- **Facility Information:** Tier III classification, FM-200 fire suppression, 99.982% uptime SLA

Personnel movement is simulated on a 4-second interval, with the unknown person having a 30% probability of triggering an unauthorized access event.

#### 5.1.3 DPI View
Embeds the Deep Packet Inspection component for network traffic analysis within the topology context.

---

## 6. Threat Management

### 6.1 Threat Feeds Panel

A threat intelligence feed management interface listing configured feeds (abuse.ch, AlienVault OTX, Emerging Threats, CIRCL, etc.) with sync status, last sync timestamp, and record counts. Analysts can enable or disable individual feeds and view sync history logs showing indicators fetched, added, updated, and removed per sync cycle.

### 6.2 Vulnerabilities Panel

A vulnerability management interface pulling from three data sources:

- **Internal Scans:** Vulnerability data from the platform's own scanning capabilities
- **NIST NVD Integration:** Direct API calls to the National Vulnerability Database (`services.nvd.nist.gov`) for CVE details
- **Third-Party Feeds:** Additional vulnerability intelligence from configured external sources

Each vulnerability displays its CVE ID, CVSS score, affected asset, exploitability rating, and remediation tracking status. Vulnerabilities are prioritized by a combination of exploitability and asset criticality.

### 6.3 Threat Escalation Panel

A multi-factor threat priority scoring engine implementing the formula:

```
Priority = (Severity x SeverityWeight) x (MCR x MCRWeight) x (ThreatWeight x (1 + ThreatMultiplier)) x (AssetCriticality x AssetWeight)
```

Features include:
- **Asset Registry:** Lists all assets with their criticality scores
- **User Risk Scoring:** Per-user risk scores incorporating behavioral history
- **Escalation Rules:** Configurable routing rules determining where high-priority threats are sent
- **Visual Priority Matrix:** A matrix visualization mapping severity against asset criticality

### 6.4 Smart Threat Modeling

A three-column master-detail layout for managing threat models:

- **Column 1:** Threat model list filterable by type (physical, logical, hybrid) and severity. Shows AI-generated model badges for models created by the platform's AI agent.
- **Column 2:** Attack scenarios associated with the selected model, showing likelihood, impact, risk score, and attack chain details.
- **Column 3:** Mitigations for the selected scenario with type (preventive, detective, corrective), implementation status, effectiveness rating, cost, owner, and due date.
- **Attack Chain Analysis:** A horizontally scrollable visualization at the bottom showing multi-stage attack progression with MITRE ATT&CK technique mappings.

### 6.5 Vector Threat Hunting

An AI-powered threat hunting interface with five sub-tabs and 1,673 lines of implementation:

- **Hunt Sessions:** Create and manage threat hunting sessions with semantic search using vector embeddings for similarity-based detection.
- **Events:** Browse security events with rich filtering and detail views.
- **AI Correlations:** View AI-generated correlations between events based on vector similarity, behavioral patterns, and anomaly detection.
- **Vector Rules:** Manage vector correlation rules with types including semantic_similarity, behavioral_pattern, anomaly_detection, and attack_chain.
- **Search Events:** Execute semantic search queries against the event corpus.
- **Prompt-Based Rule Creator:** A specialized sub-component offering 18 prompt templates across 6 categories (APT Detection, Data Exfiltration, Ransomware, Cloud/Container Security, Identity/Access, Network/Communication) for creating vector correlation rules from natural language descriptions.

The system generates mock data for physical security scenarios (8 scenarios) and insider threat events (8 scenarios) to demonstrate detection capabilities.

---

## 7. Automation and Response

### 7.1 Workflows Panel (n8n Integration)

An n8n workflow automation management interface featuring:

- **Workflow List:** All configured workflows with status indicators (active, inactive, error)
- **Execution History:** Per-workflow execution records showing success/failure counts and timing
- **Trigger Configuration:** Supports webhook, schedule, and event-based triggers with configurable conditions and cooldown periods
- **Workflow Detail:** Shows the workflow's node graph and connection topology
- **Manual Trigger:** A button to immediately execute any workflow on demand

### 7.2 Response Automation

An automated response actions dashboard providing:

- **Action List:** Available response actions including block IP, isolate host, disable account, quarantine file, send notification, create ticket, and custom actions
- **Execution Tracking:** Real-time status of executed actions with timing and success indicators
- **Rollback Capability:** One-click rollback for reversible actions
- **Action History:** Complete audit trail of all automated responses

### 7.3 Red Team Automation

A four-tab interface for offensive security operations:

- **Fuzzing Campaigns:** Manage fuzzing operations across AFL, libFuzzer, honggfuzz, and other fuzzers. Displays executions per second, total and unique crashes, and code coverage percentage per campaign. Strategies include mutation, generation, coverage-guided, and AI-guided fuzzing.
- **Penetration Testing:** Campaign management with methodology tracking (OWASP, PTES, OSSTMM), automation levels (manual, semi-auto, AI-autonomous), agent model configuration, and severity breakdown of findings. Each campaign shows its exploitation count, risk score, and progress.
- **AI-Generated Tools:** A two-column grid of AI-created security tools showing tool name, purpose, target vulnerability, programming language, generating AI model, effectiveness score, success rate, and detection rate. Tool types include scanners, exploits, fuzzers, recon tools, post-exploitation utilities, and pivoting tools.
- **Attack Chains:** Multi-stage attack sequence visualization with progress bars showing completion percentage, initial access technique, duration, number of detection events triggered, and success/failure status.

Summary statistics show total fuzzing executions, crashes found, vulnerabilities discovered, and critical findings.

### 7.4 Agent Orchestration (AI Agent System)

#### 7.4.1 Agent Status Panel
A control panel for the multi-agent SOC system:

- **Orchestrator Controls:** Start, stop, and manual trigger buttons with run count and last execution timestamp
- **Processing Pipeline:** A 5-stage visual pipeline showing alert progression: New Alerts -> Triaged -> Enriched -> Investigated -> Pending Tasks, with counts at each stage
- **Agent Status Cards:** Grid of cards for each agent type (Triage, Enrichment, Investigation, Response, Pattern Discovery) showing health status (healthy, degraded, unhealthy), enabled state, success rate, pending/running task counts, completed/failed tasks in the last hour, average execution time, and age of the oldest pending task
- **Auto-Refresh:** Status updates every 10 seconds

#### 7.4.2 Agent Network Graph (3D)
A Three.js 3D visualization of the AI agent communication network showing 6 agent nodes (Orchestrator at center, plus Triage Alpha, Enrichment Beta, Investigation Gamma, Response Delta, and ML Model Engine) connected by static lines to the Orchestrator. Agent nodes pulse based on activity level. Mock communications are generated every 3 seconds with color-coded lines: red for alerts, yellow for tasks, green for results, and cyan for training data. Communication lines fade out over time.

#### 7.4.3 Agent Code Configuration
A detailed agent implementation browser with sidebar navigation and five content tabs:

- **Overview:** Agent description, optimization method (Hybrid, TAO, ALHF), and key capabilities
- **Implementation (Code):** Complete Python source code for each of the 5 agent types:
  - **Triage Agent:** Hybrid ML (Random Forest) + GPT-4 reasoning with 4-step triage pipeline
  - **Threat Enrichment Agent:** Parallel IOC enrichment from AlienVault OTX, Abuse.ch, and Emerging Threats with TTL-based caching
  - **Investigation Agent:** NetworkX graph-based analysis with 5-phase pipeline including lateral movement and persistence detection
  - **Automated Response Agent:** 7 response actions with safety checks, blast radius limits, rollback stack, dry-run mode, and ML-based risk scoring
  - **Orchestration Agent:** Multi-agent workflow engine with dependency graphs, parallel execution, and workflow templates
- **Configuration:** Agent configuration JSON with key-value parameter breakdown
- **Integration:** Input sources (Kafka/Redis, PostgreSQL, REST/GraphQL, RabbitMQ), output destinations (Alert Management, SOAR, Metrics, Audit), and external API integrations (Splunk, QRadar, CrowdStrike, SentinelOne, AWS GuardDuty, Azure Sentinel)
- **LLM and ML:** Detailed ML model configurations per agent type including GPT-4 prompt templates, Random Forest parameters, Graph Attention Networks, vector embedding specifications, and ensemble risk models

#### 7.4.4 AgentBricksSOC Dashboard
A high-level view of the multi-agent SOC architecture showing all agent types, their current statuses, task queue depths, and inter-agent communication flows.

---

## 8. Compliance and Risk

### 8.1 Compliance Dashboard

A multi-framework compliance tracking dashboard covering 6 frameworks:

- SOC 2
- ISO 27001
- GDPR
- HIPAA
- PCI DSS
- NIST CSF

For each framework, the dashboard shows assessment progress, control counts (total, compliant, non-compliant), compliance score percentage, identified gaps with severity and remediation status, and timeline to next audit date.

### 8.2 OCSF Schema Browser

A browser for the Open Cybersecurity Schema Framework v1.1.0 with four tabs:

- **Event Classes:** Browse all 30+ OCSF event class definitions (e.g., Process Activity, File Activity, Network Activity, Authentication, etc.)
- **Categories:** View the 6 event categories (System Activity, Findings, IAM, Network Activity, Discovery, Application Activity) and their class mappings
- **Objects:** Explore OCSF object types and their attribute definitions
- **Profiles:** View security profiles and extension mappings

All tabs support search and filtering, with expandable detail panels for each schema element.

### 8.3 Business Scorecard

A weighted security risk assessment presenting 10 risk factors:

1. Network Security
2. DNS Health
3. Patching Cadence
4. IP Reputation
5. Application Security
6. Endpoint Security
7. Hacker Chatter
8. Social Engineering
9. Information Leak
10. Cubit Score

Each factor has a weight contributing to a composite score with letter grades (A through F). Includes a bar chart showing score breakdown per factor, trend indicators, and summary statistics for total findings and critical issues.

### 8.4 Executive Dashboard

A C-level security overview designed for executive consumption:

- **8 KPI Cards:** Security Score (94/100), Critical Alerts (3), Mean Time to Respond (23 min), Compliance (98%), Active Cases (12), Cost Savings ($4.2M), Critical Vulnerabilities (7), High-Risk Accounts (4)
- **Embedded CISO Assistant:** Toggle button to open the AI chat assistant
- **Risk Assessment Matrix:** Breakdown by severity (Critical, High, Medium, Low) with counts
- **Strategic Initiatives Progress:** Zero Trust Architecture (65%), AI-Powered Detection (100%), Cloud Security Posture (30%), Automation Expansion (80%)
- **Compliance Status:** SOC 2, ISO 27001, GDPR, HIPAA with individual scores
- **SOC Performance Metrics:** Alert Resolution Rate 99.2%, SLA Compliance 99.9%, Automation Rate 80%, Analyst Efficiency 94%
- **Financial Impact:** $4.2M cost avoidance, $1.8M operational efficiency gains, 312% ROI
- **Executive Summary:** Key achievements, areas requiring focus, and strategic priorities

### 8.5 Public Sector Overview

A military-grade cyber scorecard tailored for government and defense use cases:

- **CMAI (Cyber Mission Assurance Index):** Composite readiness score
- **Government Framework Compliance:** NIST 800-171, CMMC, FedRAMP, FISMA
- **Operational Readiness Metrics:** Mission-critical system availability and status
- **Public Sector Risk Categories:** Threat categories specific to government infrastructure

### 8.6 ROI and Business Value

A return-on-investment presentation with static business case data: 387% ROI, $5.8M in savings, $14.89M annual benefit. Includes cost avoidance breakdown (breach prevention, reduced MTTR, compliance automation), year-over-year ROI projection, and comparison against manual SOC operations.

---

## 9. Data and Configuration

### 9.1 Data Connectors

A connector management interface supporting 20+ data source types:

- DPI (Deep Packet Inspection)
- Network TAP
- Syslog
- CEF (Common Event Format)
- AWS CloudTrail
- Azure Monitor
- Splunk
- Kafka
- eBPF probes
- Bytecode instrumentation (JVM, .NET, Python, Node.js, Ruby, Go)
- And more

Each connector shows its health status, events per second throughput, and configuration details. Includes test connection functionality and telemetry monitoring (CPU usage, memory, latency, queue depth).

### 9.2 Lucene Fast Search

A full-text search interface supporting Lucene-style query syntax. Features include index management showing index names, sizes, document counts, and health status. Search performance metrics display query latency and throughput. Results are displayed with highlighted keyword matches.

### 9.3 Streaming Graph Visualization

A two-tab streaming analytics interface:

- **Graph View:** An entity-relationship graph showing vertices (users, IP addresses, hosts, processes) and edges (connections, authentications, file accesses). Interactive node selection reveals related edges and properties. The graph updates in real-time as new events arrive.
- **CEP Tab:** A Correlation Rule Creator allowing analysts to build rules with configurable rule name, description, pattern type, time window, multi-condition builder, and action assignment.

### 9.4 Lists Management

A container with three sub-views:

- **Session Monitor:** (See section 4.8)
- **Session Lists:** User session tracking with correlation analysis. Browse sessions with search and status filtering. Each session entry shows user, source IP, duration, event count, and risk score. Session correlation links sessions sharing common attributes (IP, user agent, geolocation). Includes a timeline view of session activity.
- **Active Lists:** Blocklist, allowlist, and watchlist management with full CRUD operations. Entry details include value, type, description, creation date, and expiration. Supports bulk import of entries.

### 9.5 Databricks Notebooks Panel

A notebook browser and catalog interface displaying all platform notebooks with:

- **Category Filtering:** 7 categories (All, Correlation, ML, Streaming, Threat Intel, Behavioral, Mock Data)
- **Text Search:** Search across titles, subtitles, tags, and descriptions
- **Statistics:** Total notebooks, total cells, category count, estimated total runtime
- **Export:** Download All buttons for Python (.py) and Jupyter (.json) formats
- **Notebook Cards:** Grid layout showing title, subtitle, category badge, cell count, estimated runtime, and tags
- **Notebook Viewer:** Cell-by-cell rendering with markdown and code cells, copy-to-clipboard per code cell

The platform includes approximately 20 comprehensive notebooks covering:
- CEP Correlation Engine (12K events, 7 correlation rules)
- Supply Chain Risk Analysis (66+ packages across npm/pypi/maven/nuget/go)
- DevOps CI/CD Security (SLSA compliance, secret detection)
- Cloud Security Posture Management (multi-cloud CIS benchmarks)
- Vector Threat Hunting (FAISS index, 5000 IOCs, 384-dim embeddings)
- AI Malware Sandbox (3000 samples, 8 malware families)
- Pattern Discovery (K-Means + Isolation Forest)
- LLM Usage Risk Profiling (6000 interactions)
- GraphRAG Zero-Day Detection (330+ nodes, 5000 edges knowledge graph)
- Smart Threat Modeling (STRIDE/MITRE frameworks)
- UEBA Engine (60 users, 30 days, Z-score anomaly detection)
- Automated Threat Escalation
- Red Team Automation (16 MITRE ATT&CK techniques)
- Spark Structured Streaming Security Correlation (Medallion architecture)
- CEP Live Streaming Graph Analytics
- Threat Intelligence Feed Correlation (9 sources)
- Deep Packet Inspection and DLP
- SOC Demo Data Replay Engine (50K events, 5 attack scenarios)
- Compliance Data Generator
- 5-Part SIEM Graph Correlation Engine (the most advanced notebook suite)

### 9.6 Internal Services Hub

A Databricks-style internal services catalog showing 6 platform services:

1. **Turi:** ML Engine for model training and inference
2. **Cowboy:** Data Wrangling and transformation service
3. **Alkami:** Security Analytics processing engine
4. **Hedwick:** Notification and alerting service
5. **Bolt:** Real-time event processing engine
6. **DB Apps:** Application framework for custom extensions

Each service card shows status, version, uptime, description, and quick-action buttons.

---

## 10. Architecture and Documentation

### 10.1 Architecture 3D

A Three.js interactive 3D architecture diagram where nodes represent platform services and components, edges represent data flows between them. Supports rotation, zoom, and hover interactions to reveal component details.

### 10.2 Architecture 2D

A static 2D layered architecture diagram rendered in SVG/HTML showing the data flow from ingestion through processing to the presentation layer. Component boxes with interconnection lines illustrate the system's modular design.

### 10.3 Architecture Documentation

A comprehensive static documentation page (1,102 lines) covering:

- **Core Platform Capabilities:** Real-Time Threat Detection, Red Team Automation, LLM Risk Profiling, Behavioral Profiling, AI Malware Sandbox, Databricks Lakehouse
- **Advanced AI Agent Systems:** Multi-Agent Orchestrator, Pattern Discovery Agent, Response Automation Agent
- **Technical Infrastructure:** Databricks Lakehouse (Bronze/Silver/Gold medallion architecture), Streaming Infrastructure, AI/ML and Vector Search
- **OCSF Integration:** Event classification standards, source integration, implementation details
- **Security and Compliance:** Authentication methods, data protection (FIPS 140-2, E2EE)
- **Performance Metrics:** 23-75ms detection latency, 1M+ events/sec throughput, sub-100ms vector search, 94.7% ML accuracy
- **LLM Integration Prompts:** Full prompt templates for Triage Agent (GPT-4 Turbo), Investigation Agent (GPT-4), LLM Risk Profiling (GPT-4), Red Team Agent
- **ML Models and Embeddings:** text-embedding-3-large (3072 dims), Isolation Forest (94.7%), Random Forest (98.2%), LSTM+Attention (96.5%)
- **Integration Endpoints:** Splunk, QRadar, Elastic, CrowdStrike, SentinelOne, Defender, AlienVault, Abuse.ch, VirusTotal, Cortex XSOAR, ServiceNow, Jira
- **Infrastructure Requirements:** Databricks cluster specifications, Delta Lake storage tiers (Bronze 10TB, Silver 5TB, Gold 2TB), Kafka 3-node cluster

### 10.4 SIEM Market Analysis

A competitive analysis comparing Dazzle against 6 industry SIEM platforms: Splunk Enterprise Security, Microsoft Sentinel, IBM QRadar, Google Chronicle, Elastic Security, and Exabeam. Comparison dimensions include pricing model, detection capabilities, AI/ML features, scalability, and ease of deployment.

---

## 11. Administration

### 11.1 User Management

A user administration interface for managing platform users:

- **User List:** All users with their roles (analyst, engineer, admin, CISO), status (active, disabled), and contact information
- **User Creation:** Create new users with role assignment through the `create-user` edge function
- **Role Assignment:** Modify user roles to control access levels
- **Status Management:** Enable or disable user accounts
- **Profile Editing:** Update usernames via the `update-username` edge function

### 11.2 Production Settings

A seven-tab configuration interface for production deployment:

- **Databricks Integration:** Workspace URL, access token, cluster ID, Unity Catalog name, schema configuration, and connection testing with a quick setup guide
- **Authentication:** 6 authentication methods (Username/Password, MFA/TOTP, SAML SSO, OAuth 2.0, LDAP/AD, Biometric placeholder), plus password policy configuration (minimum length, complexity requirements, expiration)
- **Security and Compliance:** Audit logging toggle, encryption at rest (AES-256), API rate limiting configuration, session timeout, data retention period, and compliance standard toggles (SOC 2, ISO 27001, GDPR, HIPAA, PCI DSS, NIST)
- **Notifications:** SMTP email configuration (host, port, username, password, from address)
- **Performance:** Maximum events per second, log level, ML correlation engine toggle, auto-response toggle
- **High Availability:** HA mode selection (active-passive, active-active, multi-master), node count, synchronization mode, heartbeat interval, failover timeout, load balancer type and algorithm, auto-scaling with minimum/maximum instances and scale up/down thresholds
- **Backup and Recovery:** Automated backup toggle with frequency configuration

Also includes a 7-step Production Deployment Guide.

### 11.3 Reports

(See section 3.7)

---

## 12. AI Malware Sandbox

A six-tab malware analysis interface for examining captured specimens:

- **Overview:** Composite threat score, sample metadata (file name, malware family, SHA-256 hash, category, file type, size), and flags for packed binaries and anti-analysis techniques
- **Kernel Activity:** Table of kernel-level events (hook installations, interrupt modifications, driver loads, syscall intercepts) with rootkit behavior flagging and hook type classification (SSDT, IDT, IAT, inline)
- **Process Behavior:** Process creation, injection (DLL injection, process hollowing, APC injection, reflective loading), privilege escalation, and shell code detection metrics with detailed table
- **Network:** Connection counts, C2 server identification, data exfiltration metrics, and network activity table showing connection types (C2 beacon, data exfiltration, lateral movement, DNS tunneling)
- **Memory Analysis:** Memory event counts, shellcode detection, injection identification, and ROP chain detection with detailed forensics table
- **AI Analysis:** ML-powered threat classification showing AI threat score, confidence score, number of MITRE ATT&CK techniques mapped, detected capabilities, anti-analysis techniques identified, and malware family classification

Features a sample selector showing the top 4 samples as clickable cards and 10-second auto-refresh for live analysis updates.

---

## 13. Backend: ETL Pipeline

The platform implements a multi-stage ETL (Extract, Transform, Load) pipeline via Supabase Edge Functions:

### 13.1 Ingestion (`etl-ingest`)
Accepts raw security events via POST requests, buffering them in the `raw_event_buffer` table with `pending` status. Captures metadata including user-agent and ingestion method.

### 13.2 Processing (`etl-processor`)
Reads up to 100 pending events from the buffer, auto-detects their format (Syslog, CEF, LEEF, JSON), parses them using built-in parsers, inserts normalized events into the `events` table, and updates buffer status. Records processing statistics.

### 13.3 Enrichment (`enrichment-engine`)
Fetches up to 50 unenriched events and adds: mock GeoIP geolocation (8 countries), threat intelligence matching against known-bad IPs, user profile context, and asset registry context. Computes risk score adjustments (+30 for threat intel match, +20 for critical asset, plus user risk score).

### 13.4 Correlation (`correlation-engine`)
Loads all enabled correlation rules, fetches events from the last 60 minutes (up to 1000), evaluates each rule's conditions (event types, severity, source IP, username, group-by), checks thresholds, and creates alerts when rules trigger. Executes rule actions including case creation, IP blocking, and workflow triggering.

### 13.5 Orchestration (`etl-orchestrator`)
Chains the three stages sequentially: processor -> enrichment -> correlation. Returns HTTP 207 if any stage fails, 200 if all succeed.

### 13.6 Agent Orchestration (`agent-orchestrator`)
Runs all 5 SOC agents in sequence:

1. **Triage Agent:** 5-factor scoring of new alerts (severity, risk, event volume, IOC match, repeat offender), priority assignment, auto-escalation to cases
2. **Enrichment Agent:** Multi-source threat intelligence queries, IOC embedding lookups, user anomaly correlation, enriched risk scoring
3. **Investigation Agent:** Event correlation, timeline building, attack sequence checking, case creation for high-risk alerts
4. **Response Agent:** Executes response actions (block IP, isolate host, disable user), audit logging
5. **Pattern Discovery Agent:** Converts high-confidence patterns to correlation rules

---

## 14. Backend: User Management Functions

### 14.1 Create User (`create-user`)
Creates or deletes Supabase Auth users tied to user profiles. Handles existing user cleanup, auth user creation with automatic email confirmation, and profile linkage.

### 14.2 Update Username (`update-username`)
Updates the username field in a user's profile record.

### 14.3 Verify Password (`verify-password`)
Validates credentials without creating a persistent session. Used for re-authentication flows and the multi-factor authentication steps.

---

## 15. Database Schema

The platform's database consists of approximately 87 tables and 1 view across 20+ domains, all with Row Level Security (RLS) enabled. Key domains include:

- **Core SIEM:** security_events, sessions, active_lists, alerts, correlation_rules, threat_intelligence
- **Workflow Automation:** n8n_workflows, workflow_triggers, workflow_executions, response_actions
- **Threat Intelligence:** threat_feeds, iocs (with 384-dim vector embeddings), ioc_matches, feed_sync_logs
- **Case Management:** cases (auto-numbered CASE-YYYY-####), case_comments, case_timeline
- **Events:** events (with raw forensic data, OCSF normalization, 384-dim embeddings)
- **Threat Modeling:** threat_models, threat_scenarios, threat_mitigations, threat_model_sources
- **User Behavior:** user_profiles, user_behavior_events, user_risk_assessments, behavior_correlations
- **AI Correlation:** correlation_rules (v2 with AI generation), correlation_rule_matches, ai_agent_activity
- **Malware Sandbox:** malware_samples, sandbox_sessions, kernel_activity, process_behavior, network_behavior, file_operations, registry_operations, memory_analysis, api_calls, ai_analysis_results
- **Red Team:** fuzzing_campaigns/results/crashes, pentest_campaigns/targets/findings/exploits, ai_generated_tools, agent_pentest_sessions, attack_chains
- **Data Connectors:** data_connectors, connector_telemetry, bytecode_instrumentation, intercepted_functions, string_intercepts, memory_snapshots, stack_traces, connector_events, connector_alerts
- **LLM Risk:** llm_interactions, llm_risk_profiles, llm_risk_rules, llm_risk_incidents
- **Psychological Profiling:** user_psychological_profiles, psychological_risk_factors, interaction_linguistic_analysis
- **Compliance:** compliance_frameworks, compliance_controls, compliance_assessments, compliance_evidence, compliance_gaps
- **OCSF:** ocsf_categories, ocsf_event_classes, ocsf_attributes, ocsf_source_mappings, ocsf_enrichments, ocsf_events_view
- **ETL Pipeline:** raw_event_buffer, event_parsers, parsing_queue, enrichment_sources, enrichment_queue, correlation_queue, processing_stats
- **Agent System:** agent_configs, agent_orchestration_logs, agent_performance_metrics
- **Administration:** system_settings, custom_reports, report_schedules, report_executions

Database triggers automate the agent pipeline: new alerts trigger triage, triaged alerts trigger enrichment, enriched alerts trigger investigation, and critical alerts trigger response.

The pgvector extension enables AI-powered semantic similarity search on both IOCs and security events.

---

## 16. Visualization Technologies

The platform employs multiple rendering technologies for data visualization:

- **Three.js 3D:** Threat Globe, Architecture 3D, Pattern Graph 3D, Agent Network Graph 3D, Attack Vector Graph (5 components)
- **HTML5 Canvas 2D:** CEP Live Graph, User Event Network (2 components)
- **SVG:** Network Topology logical and physical views (1 component with multiple SVG scenes)
- **CSS/Tailwind:** All dashboard cards, tables, metrics, and standard UI components

---

## 17. Data Flow Architecture

```
External Sources
      |
      v
  etl-ingest (Edge Function)
      |
      v
  raw_event_buffer (Supabase Table)
      |
      v
  etl-processor (Edge Function) -- Parses Syslog/CEF/LEEF/JSON
      |
      v
  events (Supabase Table, OCSF normalized, vector embedded)
      |
      v
  enrichment-engine (Edge Function) -- GeoIP, Threat Intel, User Context, Asset Context
      |
      v
  correlation-engine (Edge Function) -- Rule evaluation, threshold checking
      |
      v
  alerts (Supabase Table)
      |
      v
  agent-orchestrator (Edge Function)
      |
      +---> Triage Agent -----> Scored/prioritized alerts
      +---> Enrichment Agent -> Multi-source enriched alerts
      +---> Investigation Agent -> Cases created
      +---> Response Agent -----> Blocklist updated, hosts isolated
      +---> Pattern Discovery --> New correlation rules generated
      |
      v
  Dashboard (React, Real-time Subscriptions)
      |
      +---> Analyst Views (Alerts, Cases, Events, Hunting)
      +---> Executive Views (KPIs, Compliance, ROI)
      +---> 3D Visualizations (Globe, Architecture, Agents)
```

---

## 18. Platform Statistics

| Metric | Count |
|--------|-------|
| React Components | 58 TSX files + 1 TS utility |
| Library/Utility Files | 11 core + 13 notebook modules |
| Supabase Edge Functions | 9 |
| Database Tables | ~87 |
| Database Views | 1 |
| Database Triggers | 6+ |
| Supabase Migrations | 70+ |
| Three.js 3D Visualizations | 5 |
| Compliance Frameworks | 6 |
| AI Agent Types | 5 |
| Databricks Notebooks | ~20 |
| OCSF Event Classes | 30+ |
| Data Connector Types | 20+ |
| Lines of Code (largest component) | 2,467 (AgentCodeConfiguration) |
