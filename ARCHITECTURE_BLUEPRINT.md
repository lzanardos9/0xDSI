# 0xDSI -- Databricks SOC Intelligence Platform
## Complete Architecture Blueprint
### Version 2.4.1 | Comprehensive Reference for Presentations & Diagrams

---

## TABLE OF CONTENTS

1. [System Overview](#1-system-overview)
2. [The 11-Phase Event Evaluation Pipeline](#2-the-11-phase-event-evaluation-pipeline)
3. [ML Models Inventory (38 Models)](#3-ml-models-inventory)
4. [AI Agent System (5 Agents)](#4-ai-agent-system)
5. [Correlation Engines](#5-correlation-engines)
6. [Data Connectors & Ingestion Layer](#6-data-connectors--ingestion-layer)
7. [Infrastructure Services](#7-infrastructure-services)
8. [Security Modules](#8-security-modules)
9. [Database Schema](#9-database-schema)
10. [Authentication Flow (3-Factor)](#10-authentication-flow)
11. [Navigation & Role-Based Access](#11-navigation--role-based-access)
12. [Key Data Flows (Arrows/Directions)](#12-key-data-flows)
13. [Lucidchart Diagram Specifications](#13-lucidchart-diagram-specifications)

---

## 1. SYSTEM OVERVIEW

**Platform Name:** 0xDSI -- Databricks SOC Intelligence
**Tagline:** Real-time security monitoring and threat detection
**Tech Stack:** React + TypeScript + Tailwind CSS + Three.js (frontend), Supabase (database + auth + edge functions), Vite (build)

### High-Level Architecture Layers

```
+-----------------------------------------------------------------------+
|                        PRESENTATION LAYER                             |
|  React + TypeScript + Tailwind CSS + Three.js                         |
|  35 views, 4 roles, command palette, 3D visualizations                |
+-----------------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+------------------+  +------------------+  +------------------+
| DETECTION &      |  | INTELLIGENCE &   |  | RESPONSE &       |
| CORRELATION      |  | ANALYSIS         |  | AUTOMATION       |
| - CEP Engine     |  | - 38 ML Models   |  | - SOAR Engine    |
| - 50K+ Rules     |  | - Vector Engine   |  | - n8n Workflows  |
| - Graph Engine   |  | - LLM Profiling   |  | - Playbooks      |
| - Micro-Patterns |  | - UEBA            |  | - Auto-Response  |
+------------------+  +------------------+  +------------------+
         |                    |                    |
         v                    v                    v
+-----------------------------------------------------------------------+
|                      DATA PLATFORM LAYER                              |
|  Supabase (PostgreSQL + Realtime + RLS + Edge Functions)              |
|  80+ tables, 12 edge functions, real-time subscriptions               |
+-----------------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+------------------+  +------------------+  +------------------+
| INGESTION        |  | ML PLATFORM      |  | EXTERNAL         |
| - 108 Connectors |  | - Turi (Meta)    |  | - Threat Feeds   |
| - ETL Pipeline   |  | - Cowboy (Notebk)|  | - NIST NVD       |
| - DPI Engine     |  | - Alkami (Infer) |  | - MITRE ATT&CK   |
| - OCSF Normalizn |  | - Hedwick (Reg)  |  | - OCSF v1.1.0    |
| - 7 Stream Lanes |  | - Bolt (GPU)     |  | - n8n Webhooks   |
+------------------+  +------------------+  +------------------+
```

---

## 2. THE 11-PHASE EVENT EVALUATION PIPELINE

This is the core processing chain. Every security event traverses these phases sequentially (with parallel branches at phases 4-11).

### Phase 1: Event Ingestion (ETL Layer)

- **Entry point:** `ETLClient.ingestEvent(sourceId, sourceType, rawData, sourceIp)`
- **Edge function:** `etl-ingest` (HTTP POST)
- **Target table:** `raw_event_buffer`
- **Supported source types:** firewall, web_server, ids, authentication, database
- **Raw event fields:** timestamp, event_type, severity, source_ip, dest_ip, dest_port, username, message
- **Polling:** `etl-orchestrator` edge function runs every 5 seconds

### Phase 2: Normalization & OCSF Classification

- **Standard:** Open Cybersecurity Schema Framework (OCSF) v1.1.0
- **Process:** Raw events are normalized into OCSF event classes
- **Mapping:** Vendor-specific events (e.g., CrowdStrike "ProcessCreate") mapped to OCSF class UIDs via `ocsf_source_mappings` table with confidence scores
- **Output table:** `events` (normalized, OCSF-tagged with `ocsf_class_name`, `ocsf_class_uid`)
- **Fields preserved:** event_type, severity, source_ip, destination_ip, user_id, action, result, event_timestamp

### Phase 3: Stream Classification (7 Lanes)

Events are routed into one of 7 parallel processing streams via regex pattern matching:

| Stream | Label | Color | Example Patterns |
|--------|-------|-------|-----------------|
| `network` | Network / Firewall | #0ea5e9 | scan, dns, c2, lateral, firewall, smb, rdp |
| `endpoint` | Endpoint / EDR | #22c55e | malware, exploit, ransomware, rootkit, dll, registry |
| `auth` | Identity / Auth | #f59e0b | login, credential, brute, kerberos, mfa, ldap |
| `cloud` | Cloud / SaaS | #06b6d4 | aws, azure, s3, lambda, kubernetes, terraform |
| `threat_intel` | Threat Intel | #ef4444 | ioc, apt, campaign, mitre, yara, stix |
| `physical` | Physical / CCTV | #14b8a6 | badge, camera, door, biometric, rfid, tailgating |
| `behavioral` | Behavioral / UEBA | #f97316 | anomaly, insider, risk_score, deviation, unusual |

- **Spread algorithm:** Ensures diversity across streams within a batch
- **Visual:** Canvas 1200x650, label width 160px, 7 equal lane heights

### Phase 4: Pattern Discovery

- **Engine:** Unsupervised ML (Isolation Forest, K-Means, DBSCAN, Autoencoder)
- **Output table:** `discovered_patterns`
- **Pattern types:** `threat_sequence`, `zero_day_indicator`, anomalous patterns
- **Key fields:** pattern_name, pattern_type, event_sequence (array), occurrence_count, confidence_score, threat_level (critical/high/medium/low), is_anomaly, indicators
- **Profiles:** Configurable via `discovery_profiles` table

### Phase 5: Micro-Pattern Vector Matching

- **Embedding dimension:** 1536 (OpenAI text-embedding-ada-002 compatible)
- **Categories:** Identity, Movement, Exfiltration, Escalation, Execution, Cloud, Insider
- **Similarity threshold:** Configurable (default 0.82)
- **Reasoning weight:** 0-1 float for weighted scoring

**10-Node Reasoning Pipeline:**

```
[1] Incoming Event (confidence 1.00)
     |-- "encode" --> [2] Vector Embedding (0.99)
     |-- "parse"  --> [3] Normalization (0.98)
                           |
[2] -- "query VectorDB" --> [4] Micro Pattern Search (0.95)
[2] -- "compare"        --> [5] Cosine Similarity (0.92)
[3] -- "enrich"         --> [6] Context Enrichment (0.90)
[3] -- "features"       --> [5]
                           |
[4] -- "top-K matches"  --> [7] Pattern Aggregation (0.88)
[5] -- "scores"         --> [7]
[6] -- "context"        --> [8] Threshold Gate (0.85)
[7] -- "weighted sum"   --> [9] Correlation Engine (0.91)
[8] -- "gate pass"      --> [9]
[9] -- "trigger"        --> [10] Alert / Action (0.94)
```

**Scoring formulas:**
- Weighted Pattern Score: `SUM(w_i * sim_i)`
- Context Bonus: `+temporal_decay`
- Threshold Gate: `score > threshold`
- Multi-Pattern Boost: `n_patterns * 1.15`

### Phase 6: Complex Event Processing (CEP) -- 7 Internal Stages

The CEP engine processes events through 7 sub-stages:

| Stage | Name | Description |
|-------|------|-------------|
| 1 | Event Ingestion | Receive normalized events into CEP buffer |
| 2 | Temporal Correlation | Correlate events across time windows |
| 3 | Behavioral Analysis | Compare against behavioral baselines |
| 4 | Anomaly Detection | Flag statistical outliers |
| 5 | Pattern Matching | Match against known attack patterns |
| 6 | Threat Classification | Classify by MITRE ATT&CK tactic |
| 7 | Risk Scoring | Calculate composite risk score |

- **Batch processing:** 3-5 events per parallel batch
- **Cross-stream correlations:** `(n * (n-1)) / 2` for n streams
- **Processing delay:** 200-800ms per event (adjustable 0.5x-10x speed)
- **Output table:** `cep_pattern_matches`
- **Metrics tracked:** eventsProcessed, patternsDetected, anomaliesFound, confidenceScore, parallelBatches, crossStreamCorrelations

### Phase 7: MITRE ATT&CK Enrichment

Every detected attack step is enriched with full MITRE ATT&CK metadata:

**12 Kill Chain Phases:**

| Phase | Color | Detection Source |
|-------|-------|-----------------|
| Initial Access | #f59e0b | perimeter-ids |
| Execution | #ef4444 | edr-agent |
| Persistence | #8b5cf6 | edr-agent |
| Privilege Escalation | #dc2626 | edr-agent |
| Defense Evasion | #6366f1 | behavioral-analytics |
| Credential Access | #e11d48 | identity-provider |
| Discovery | #0ea5e9 | network-monitor |
| Lateral Movement | #f97316 | network-ndr |
| Collection | #14b8a6 | dlp-sensor |
| Exfiltration | #ec4899 | proxy-gateway |
| Command & Control | #6366f1 | dns-firewall |
| Impact | #dc2626 | siem-correlator |

- **Keyword database:** 100+ keywords mapped to tactics/phases/severity
- **Technique database:** 60+ keywords mapped to MITRE technique IDs (e.g., T1059.001)
- **Enriched output:** name, tactic, technique, description, source, severity, phase, timestamp

### Phase 8: AI Correlation Rule Generation

The `AICorrelationAgent` automatically converts patterns into correlation rules:

- **Input:** Patterns with `confidence_score >= 60`, sorted by threat_level DESC
- **Output:** Correlation rules with `conditions` + `actions` + `metadata`
- **Rule naming:** Prefixed with "Auto: "
- **Status logic:** confidence >= 70 -> `active`, else -> `testing`

**Confidence calculation:**
```
Start: pattern.confidence_score
+10 if occurrence_count > 20 (or +5 if > 10)
+5  if is_anomaly
+10 if threat_level === 'critical' (or +5 if 'high')
+5  if event_sequence.length >= 3
Cap at 100
```

- **Output table:** `correlation_rules`
- **Audit table:** `ai_agent_activity`

### Phase 9: Real-Time Graph Streaming (4-Stage Sub-Pipeline)

| Stage | Engine | Description | Throughput |
|-------|--------|-------------|------------|
| Spark Ingestion | Spark Structured Streaming | Kafka/EventHub ingestion, watermark, schema parsing | 15K+ events/sec |
| GraphFrames | GraphFrames Processing | PageRank (alpha=0.85), connected components, motif finding | Vertex/Edge DataFrames |
| VectorDB | Vector Similarity Search | node2vec embedding (dim=128), ANN index, cosine similarity | Sub-millisecond queries |
| CEP Engine | CEP Pattern Detection | Temporal pattern matching, risk aggregation, alert thresholds | Pattern matches |

**Graph Node Types (11):**

| Type | Color |
|------|-------|
| user | #3b82f6 |
| host | #22c55e |
| server | #06b6d4 |
| ip | #f59e0b |
| service | #14b8a6 |
| process | #ef4444 |
| file | #f97316 |
| credential | #dc2626 |
| application | #0ea5e9 |
| device | #10b981 |
| cloud | #0891b2 |

**Force-directed simulation:**
- Center gravity: `force = distance * 0.001`
- Repulsion: `force = 800 / distance^2`
- Edge spring: `force = (distance - 120) * 0.005`
- Damping: `velocity *= 0.85`

### Phase 10: Threat Escalation & Priority Scoring

**Priority Formula:**
```
Priority = (SeverityScore * severity_weight) *
           (MCR_Factor * mcr_weight) *
           (ThreatWeight * (1 + threat_multiplier * 100)) *
           (AssetCriticality * asset_weight)
```

**Severity Scores:**

| Level | Score |
|-------|-------|
| very_low | 2 |
| low | 4 |
| medium | 6 |
| high | 8 |
| very_high | 10 |

**MCR (Model Confidence x Relevance) Calculation:**
- Model Confidence base = 5.0 (+2 if manual discovery, +1 if agent)
- Relevance base = 0.5 (+0.3 if port matches, +0.4 if CVE matches)
- MCR Factor = (MC / 10) * R

**Threat Weight:** 1 + (avgThreatSeverity * 3) / 100

**Asset Criticality Multipliers:**

| Level | Multiplier |
|-------|-----------|
| very_low | 0.5x |
| low | 0.75x |
| medium | 1.0x |
| high | 1.5x |
| very_high | 2.0x |

**Priority Level Thresholds:**

| Score | Level |
|-------|-------|
| >= 9.0 | critical |
| >= 7.0 | very_high |
| >= 5.0 | high |
| >= 3.0 | medium |
| >= 1.0 | low |
| < 1.0 | very_low |

**User Risk Score (additional dimension):**
```
User Risk = SUM(Behavioral Risk) + SUM(LLM Risk) + SUM(Communication Risk)
```

Risk factor contributions:
- Physical security events: +8 to +25
- Data access anomalies: +10 to +30
- Administrative actions: +5 to +25
- Temporal/location anomalies: +8 to +20
- LLM interaction risk: +10 to +50
- Communication pattern risk: +8 to +30
- Psychological profiling: +5 to +35

**User Risk Levels:** 0-20 Low, 20-50 Medium, 50-70 High, 70-100 Critical

### Phase 11: Alert Generation & Lifecycle

**Alert sources (converging from all prior phases):**
1. Correlation rule actions (`create_alert`)
2. AI Correlation Agent rules
3. CEP Pattern Engine detections
4. Micro-Pattern threshold gate triggers
5. Threat escalation critical findings

**Alert Lifecycle:**
```
                    +---> resolved
new --> investigating |
                    +---> false_positive

resolved ---------> new (reopen)
false_positive ----> new (reopen)
```

**Alert fields:** id, alert_name, description, severity (critical/high/medium/low), status, assigned_to, event_ids[], created_at, updated_at
**Real-time:** Supabase channel subscription for INSERT events, polled every 5 seconds

---

## 3. ML MODELS INVENTORY

### 3A. Pattern Discovery Engine (5 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 1 | Isolation Forest | sklearn IsolationForest (n_estimators=200, contamination=0.05) | Anomalous event detection via ensemble random trees | Anomaly Score, Path Length |
| 2 | K-Means Clustering | sklearn KMeans (init=k-means++) | Attack campaign grouping | Dynamic cluster count via elbow method |
| 3 | DBSCAN Density Clustering | sklearn DBSCAN (eps=auto, min_samples=5) | Arbitrary-shape cluster detection, noise = zero-day indicators | Noise Ratio, Core Points |
| 4 | Autoencoder Anomaly Detector | PyTorch (256->128->64->32->64->128->256) | Learns normal event representation; MSE flags anomalies | Trained on normal baseline only |
| 5 | AI Correlation Agent | LLM + MITRE ATT&CK knowledge graph | Converts anomalies into correlation rules | Multi-step reasoning chain |

### 3B. Vector Threat Hunting (5 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 6 | Sentence Transformer | all-MiniLM-L6-v2 (384d) / ada-002 (1536d) | Event-to-vector embedding | Fine-tuned on MITRE + CVE |
| 7 | FAISS ANN Index | IVF-PQ index (nprobe=16) | Sub-ms nearest neighbor search | >95% recall, 100x faster |
| 8 | Cosine Similarity Engine | dot(A,B)/(||A||*||B||) | Vector similarity measurement | >0.92 near-dupe, >0.85 strong, >0.75 weak |
| 9 | DBSCAN Vector Clustering | DBSCAN on L2-normalized space (eps=0.3) | Threat campaign clustering in vector space | Noise = novel threats |
| 10 | Semantic Query Engine | Embedding + FAISS + cross-encoder re-rank | Natural language threat hunting | Two-stage retrieve-then-rerank |

### 3C. LLM Usage Risk Profiling (5 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 11 | NLP Risk Classifier | Fine-tuned DeBERTa-v3 (12 categories) | Classifies LLM interactions by risk | Trained on 50K labeled interactions |
| 12 | Behavioral Baseline | EMA + adaptive Z-score thresholds | Per-user normal LLM usage patterns | 15+ behavioral features |
| 13 | Psychological Profile Engine | Multi-task BERT (Big Five + Dark Triad) | Insider threat risk from interaction patterns | OCEAN + Machiavellianism scores |
| 14 | Prompt Injection Detector | Regex + fine-tuned DistilBERT ensemble | Detects jailbreak/injection in real-time | Two-pass: fast regex + ML |
| 15 | Data Leakage Scorer | spaCy NER + PII regex + sensitivity taxonomy | Three-layer PII/credential detection | Composite leakage score |

### 3D. Model Poisoning Guard (5 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 16 | Model Drift Detector | PSI + Kolmogorov-Smirnov test | Prediction distribution shift detection | PSI: <0.1 stable, >0.25 significant |
| 17 | Spectral Signature Analyzer | SVD on weight matrices + spectral clustering | Detects backdoor injection via spectral properties | Effective against dirty/clean-label poisoning |
| 18 | Adversarial Input Detector | Feature squeezing ensemble | Rejects adversarial inputs via transformation consistency | Bit-depth, spatial smoothing, JPEG |
| 19 | Integrity Hash Validator | SHA-256 + weight distribution fingerprinting | Catches subtle backdoor weight modifications | Gradient norm baseline tracking |
| 20 | Defense Ensemble Orchestrator | Weighted voting + risk-priority matrix | Combines all poisoning signals | Maps to: quarantine, rollback, retrain |

### 3E. User Behavior Analytics / UEBA (4 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 21 | Behavioral Anomaly Detector | Isolation Forest + LOF ensemble | Flags unusual user activity | Feature-level explanations |
| 22 | Multi-Factor Risk Scorer | Gradient-boosted (35 features, 5 domains) | Holistic risk score 0-100 | SHAP explanations |
| 23 | Physical-Logical Correlator | Temporal correlation + Haversine distance | Badge-login correlation, impossible travel | Detects credential sharing |
| 24 | Insider Threat Predictor | XGBoost (CERT Dataset v6.2) | Insider threat probability + stage classification | Stages: recon, prep, exec, exfil |

### 3F. Smart Threat Modeling (4 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 25 | STRIDE Auto-Classifier | Fine-tuned BERT (6 categories) | Classifies threats into STRIDE | 10K+ labeled scenarios |
| 26 | MITRE ATT&CK Mapper | Semantic similarity (1536d embeddings) | Maps to 500+ techniques, 1000+ sub-techniques | Refined by analyst feedback |
| 27 | Attack Path Predictor | GNN + PageRank on asset-vuln-threat graph | Predicts likely attack paths | Heterogeneous graph propagation |
| 28 | Risk Assessment Ensemble | Bayesian network + Monte Carlo | Calibrated risk with confidence intervals | Includes control gap analysis |

### 3G. AI Malware Sandbox (4 Models)

| # | Model | Algorithm | Purpose | Key Detail |
|---|-------|-----------|---------|------------|
| 29 | Gradient Boosted Trees | XGBoost (depth=8, 500 trees, lr=0.05) | Primary PE classifier (847 static features) | Trained on 2M samples |
| 30 | LSTM Behavioral Analyzer | Bi-LSTM (hidden=256, 3 layers) | System call sequence analysis | Attention for suspicious subsequences |
| 31 | Random Forest Classifier | sklearn RF (1000 trees, sqrt features) | Byte n-gram/opcode analysis | Malware family classification |
| 32 | Ensemble Voting Orchestrator | Soft voting (GBT:0.40 + LSTM:0.35 + RF:0.25) | Combines all classifiers | Platt-calibrated probabilities |

### 3H. Additional Specialized Models (6 Models)

| # | Model | Category | Purpose |
|---|-------|----------|---------|
| 33 | Vector Embedding Engine | Micro-Patterns | Custom 768d security Sentence Transformer (contrastive learning, triplet loss) |
| 34 | Confidence Calibrator | Micro-Patterns | Temperature-scaled Platt calibration on similarity scores |
| 35 | Reasoning Weight Optimizer | Micro-Patterns | Multi-armed bandit (Thompson Sampling) for dynamic weight optimization |
| 36 | Rule Confidence Scorer | Correlation | Logistic regression predicting rule true positive rate |
| 37 | Adaptive Threshold Engine | Correlation | Online percentile estimation (P-squared algorithm) |
| 38 | False Positive Optimizer | Correlation | Gradient-boosted classifier with analyst feedback loop |

---

## 4. AI AGENT SYSTEM

### 4A. The 5 SOC Agents

| Agent | Type | Role | Key Capabilities |
|-------|------|------|-----------------|
| **Triage Agent Alpha** | triage | Alert classification & prioritization | Random Forest + GPT-4 pipeline, 6 input features, rule-based FP filtering, ML classification, LLM enhancement |
| **Enrichment Agent Beta** | enrichment | Threat intelligence & OSINT | IOC lookups, threat feed correlation, context enrichment |
| **Investigation Agent Gamma** | investigation | Deep incident analysis | NetworkX graph analysis, parallel data gathering (network/endpoint/auth), attack chain reconstruction |
| **Response Agent Delta** | response | Automated containment | 7 actions: block_ip, isolate_host, disable_account, update_firewall, kill_process, quarantine_file, revoke_token |
| **Orchestrator Agent** | orchestrator | Agent coordination | Task dispatch, workflow management, pipeline coordination |

### 4B. Agent Communication Flow

```
Orchestrator --> Triage (task_assignment, low)
Triage --> Enrichment (threat_detection, high)
Enrichment --> Investigation (intelligence_sharing, high)
Investigation --> Response (escalation, critical)
Response --> Orchestrator (status_update, medium)
Triage --> Orchestrator (status_report, low)
```

Communication bus: Event-driven pub/sub pattern with `subscribe()`, `emit()`, `getRecentCommunications()`

### 4C. 5 Agent Optimization Methods

| Method | Algorithm | Cycle | Description |
|--------|-----------|-------|-------------|
| **TAO** | Meta-learning (Adam, SGD, CMA-ES, TPE) | 3 phases: Exploration, Exploitation, Ensemble | Tests multiple optimization algorithms, selects best |
| **ALHF** | PPO + DPO from analyst feedback | Continuous | Trains reward model from analyst preference pairs |
| **Hybrid** | TAO + ALHF | TAO: 24-72h, ALHF: 1-4h | Meta-controller mediates conflicts between structural and policy optimization |
| **Reinforcement** | Actor-critic (PPO + GAE) | Continuous | Curriculum learning in sandboxed simulation environment |
| **Evolutionary** | Population of 50-100 configs | Generational | Crossover, Gaussian mutation, elitism, diversity preservation |

### 4D. Response Agent Safety Controls

- Blast radius limits
- Critical account protection
- ML-based action risk scoring
- Approval workflows for high-risk actions
- Dry-run mode
- Rollback capability
- Comprehensive audit logging

### 4E. Triage Agent Input Features (6)

1. Source encoding
2. Severity encoding
3. Indicator count
4. IOC reputation score
5. Time-of-day risk factor
6. Historical occurrence rate

### 4F. Agent Orchestration Engine

- **Singleton service:** `AgentOrchestratorService`
- **Backend:** Supabase Edge Function `agent-orchestrator` with mode `auto`
- **Interval:** Default 60 seconds (configurable)
- **Concurrency guard:** `isRunning` flag prevents overlap
- **Real-time:** Subscribes to `agent_configs` and `agent_tasks` for live updates
- **Views:** `agent_dashboard_summary`
- **RPCs:** `get_agent_pipeline_status`, `get_agent_health_summary`

### 4G. SOC Automation Metrics Tracked

| Metric | Description |
|--------|-------------|
| alerts_auto_triaged | Alerts automatically classified |
| alerts_escalated | Alerts escalated to human analysts |
| false_positives_filtered | False positives removed automatically |
| avg_triage_time_seconds | Mean time for automatic triage |
| iocs_enriched | IOCs enriched with threat intel |
| automated_responses | Response actions executed automatically |
| analyst_time_saved_hours | Human hours saved by automation |
| accuracy_rate | Overall agent accuracy |

---

## 5. CORRELATION ENGINES

### 5A. Correlation Rules Library

- **Volume:** 50,000+ rules
- **Versioning:** Detection-as-Code lifecycle: `draft -> testing -> staging -> production -> deprecated -> archived`

**10 Rule Types:**

| Type | Short Code | Description |
|------|-----------|-------------|
| Deterministic | DET | Exact match rules |
| ML Anomaly Detection | ML-AD | Statistical anomaly rules |
| ML Classification | ML-CL | Supervised classification rules |
| Vector Micro-Pattern | VEC | Embedding similarity rules |
| Graph Correlation | GRAPH | Graph-based entity correlation |
| Temporal Sequence | TEMP | Time-ordered event sequences |
| Behavioral Baseline | BEHAV | Deviation from behavioral baselines |
| Bayesian Probabilistic | BAYES | Probabilistic inference rules |
| Ensemble Multi-Model | ENS | Combined multi-model rules |
| Adversarial Simulation | ADVSIM | Red team scenario rules |
| Cross-Domain Fusion | FUSION | Multi-domain correlation rules |

**Rule Fields (comprehensive):**

rule_name, rule_description, category, subcategory, severity, confidence_score, mitre_tactics[], mitre_techniques[], data_sources[], rule_logic (pseudo_code + conditions), enabled, tags[], author, trigger_count, false_positive_rate, last_triggered, rule_type, complexity_score, version, dac_status, changelog[], test_cases[], deployment_history[], review_status, reviewed_by, reviewed_at, git_ref, source_format (SIGMA/YARA/etc.), compliance_frameworks[], response_playbook, last_tested_at, test_result

### 5B. Similarity-Based Pattern Correlation

Score computation between CEP patterns:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Severity match | +0.30 | Exact match: 0.30, adjacent: 0.15 |
| Confidence proximity | +0.25 | 0.25 * (1 - diff * 5) |
| Name word overlap | +0.35 | 0.35 * (overlap / max_words) |
| Temporal decay | +0.10 | 0.10 * (timeDecay ^ hours_apart) |

Configurable: similarity threshold (0.50-0.99), time decay (0.80-1.00), max results (3-25)

### 5C. Version Promotion Logic

- Promotion to `production`: Increments major version, resets patch, sets review_status = `approved`
- Other promotions: Increments minor version, resets patch, sets review_status = `pending_review`
- Creates version record in `correlation_rule_versions` table
- Rollback: Restores from specific version in version history

---

## 6. DATA CONNECTORS & INGESTION LAYER

### 6A. Connector Catalog (108+ Connectors, 25 Categories)

| Category | Vendors |
|----------|---------|
| SIEM | Splunk, QRadar, Microsoft Sentinel, Elastic SIEM, ArcSight, LogRhythm |
| Cloud AWS | CloudTrail, GuardDuty, Security Hub |
| Cloud Azure | Sentinel, Defender, Monitor |
| Cloud GCP | Security Command Center, Cloud Logging |
| EDR | CrowdStrike Falcon, SentinelOne, Carbon Black |
| Firewall | Palo Alto Networks, Fortinet FortiGate, Check Point |
| IAM | Okta, CyberArk, Active Directory |
| Email Security | Proofpoint, Mimecast |
| Vulnerability | Qualys, Tenable, Rapid7 |
| Threat Intel | MISP, Recorded Future, VirusTotal |
| WAF | Cloudflare WAF, Imperva |
| DLP | Symantec DLP |
| Container | Aqua Security, Snyk |
| NDR | Darktrace, Vectra |
| CASB | Netskope, Zscaler |
| ICS/OT | Claroty, Nozomi Networks |
| DNS | Infoblox |
| Endpoint Mgmt | Tanium |
| GRC | ServiceNow GRC |
| Collaboration | Slack, Microsoft Teams |
| Database | CockroachDB, MongoDB |
| Zero Trust | Zscaler ZPA |
| DevSecOps | Snyk |
| SOAR | (integrated) |
| Observability | (integrated) |

### 6B. Bytecode Weaving Instrumentation (5 Runtimes)

| Runtime | Technology | Intercepted Functions |
|---------|------------|----------------------|
| JVM | AspectJ | executeQuery, prepareStatement, getConnection |
| .NET CLR | Profiler API | SqlCommand.ExecuteReader, HttpClient.SendAsync |
| Python | sys.settrace | cursor.execute, requests.get, open |
| eBPF | kprobe | sys_read, sys_write, sys_connect, sys_execve |
| Node.js | Module Shimming | mysql.query, http.request, fs.readFile |

**String intercept targets:** SQL queries, database connection strings, API keys, JWT tokens, PII patterns

### 6C. Deep Packet Inspection (DPI)

- **Layer 7 visibility** with full content reconstruction
- **Content types:** Email (from/to/subject/body/attachments), Images (with OCR), Video (codec/duration), Documents, Compressed archives
- **DLP integration:** Policy enforcement directly in DPI pipeline
- **Enforcement actions:** block, quarantine, alert, allow
- **Tables:** `dpi_flows`, `packet_captures`, `dlp_detections`

---

## 7. INFRASTRUCTURE SERVICES

### 7A. Internal ML Platform (6 Services)

| Service | Role | Key Feature |
|---------|------|-------------|
| **Turi** | Metadata Registry | 150+ metadata assets |
| **Cowboy** | Notebook Service (Jupyter/AWS) | cpu_cores, memory_gb, gpu_count |
| **Alkami** | Model Inference | 12+ active inference endpoints |
| **Hedwick** | Model Registry (MLflow-based) | model_stage, model_version, model_size_mb |
| **Bolt** | GPU Training | gpu_type, gpu_count, progress_percent, epochs |
| **DB Apps** | Serverless Hosting (Dash/Gradio/Streamlit) | health_status, active_users, avg_response_time_ms |

### 7B. Edge Functions (12 Supabase Edge Functions)

| Function | Purpose |
|----------|---------|
| `agent-orchestrator` | Runs automated agent orchestration |
| `ai-assistant` | Powers the CISO "Genie" assistant |
| `analyze-document` | AI document analysis pipeline |
| `correlation-engine` | Executes correlation rule matching |
| `create-user` | User provisioning |
| `enrichment-engine` | Threat intelligence enrichment |
| `etl-ingest` | Raw event ingestion |
| `etl-orchestrator` | ETL pipeline coordination |
| `etl-processor` | Event normalization & processing |
| `generate-correlation-rule` | AI-generated correlation rules |
| `migrate-dashboard` | Dashboard migration from external tools |
| `verify-password` | 3-factor auth password verification |
| `update-username` | Username updates |

### 7C. Workflow Automation (n8n Integration)

- **Workflow types:** response, investigation, notification, remediation
- **Auth:** Header-based Bearer token
- **Execution flow:** Create record -> POST to webhook -> Update status (completed/failed)
- **Tables:** `n8n_workflows`, `workflow_executions`

### 7D. Threat Feeds (6 Sources)

| Feed Source | Color |
|-------------|-------|
| abuse.ch URLhaus | Red |
| abuse.ch ThreatFox | Red |
| AlienVault OTX | Blue |
| CIRCL | Green |
| OpenPhish | Yellow |
| ShadowServer | Purple |

Sync: Creates log entry -> Fetches indicators -> Records fetched/added/updated/removed counts

### 7E. Dashboard Migration (8 Source Tools)

| Tool | File Types | Brand Color |
|------|-----------|-------------|
| Grafana | .json | Orange |
| Kibana | .ndjson, .json | Green |
| Splunk | .xml, .json | Green |
| Redash | .json | Yellow |
| Superset | .json, .zip | Teal |
| Metabase | .json, .yaml | Blue |
| OpenSearch | .ndjson, .json | Blue |
| Banana | .json | Yellow |

**Migration lifecycle:** `pending -> parsing -> translating -> review -> completed / failed`

---

## 8. SECURITY MODULES

### 8A. Honeypot & Honeytoken System

- **Honeypots:** Emulated services deployed across network zones (name, type, status, zone, IP)
- **Honeytokens:** Planted fake credentials/documents/data (token_type, location, triggered status)
- **Interactions:** Real-time attacker engagement feed
- **Tables:** `honeypots`, `honeytokens`, `honeypot_interactions`

### 8B. Red Team Automation (4 Systems)

| System | Table | Key Metrics |
|--------|-------|-------------|
| Fuzzing Campaigns | `fuzzing_campaigns` | fuzzer_type, executions/sec, unique_crashes, code_coverage |
| Pentest Campaigns | `pentest_campaigns` | methodology, AI agent_model, findings by severity, risk_score |
| AI-Generated Tools | `ai_generated_tools` | tool_purpose, target_vulnerability, effectiveness_score |
| Attack Chains | `attack_chains` | attack_scenario, stages[], detection_events, success |

### 8C. Case Management

- **Categories:** malware, phishing, data_breach, unauthorized_access, ddos, insider_threat, ransomware, other
- **Workflow:** `new -> investigating -> contained -> resolved -> closed`
- **Features:** Threaded comments, timeline, related events/alerts, status progression
- **Tables:** `cases`, `case_comments`

### 8D. Response Automation (SOAR)

- **Actions:** block_ip, isolate_user, disable_account, send_notification, quarantine_file
- **Statuses:** completed, pending, failed, rolled_back
- **Rollback:** Eligible completed actions can be reversed
- **Table:** `response_actions`

### 8E. Compliance Monitoring

**Frameworks:** SOC 2 Type II, ISO 27001, GDPR, HIPAA, PCI-DSS (and extensible)

Scoring: per-framework compliance percentage, gap counts by severity
Color thresholds: >= 90% green, >= 75% yellow, >= 60% orange, < 60% red
Tables: `compliance_frameworks`, `compliance_controls`, `compliance_assessments`, `compliance_gaps`

### 8F. Vulnerability Management (3 Sources)

| Source | Table | Key Fields |
|--------|-------|------------|
| Asset Vulnerabilities | `asset_vulnerabilities` | cve_id, cvss_score, affected_component, status |
| NIST NVD | `nist_nvd_vulnerabilities` | cve_id, cvss_v3_score, affected_products |
| Physical Asset Vulns | `physical_asset_vulnerabilities` | Physical infrastructure vulnerabilities |

**Workflow:** `open -> in_progress -> patched`

### 8G. AI Malware Sandbox (6 Analysis Tabs)

| Tab | Table | Analyzes |
|-----|-------|----------|
| Overview | `malware_samples` | Threat score, metadata, classification |
| Kernel | `kernel_activity` | Rootkit behavior, hooks, syscall interception |
| Process | `process_behavior` | Code injection, privilege escalation, shellcode |
| Network | `network_behavior` | C2 communication, exfiltration, bytes transferred |
| Memory | `memory_analysis` | Shellcode scanning, injection, executable regions |
| AI | `ai_analysis_results` | MITRE mapping, family classification, evasion techniques |

### 8H. Smart Threat Modeling

- **Model types:** physical, logical, hybrid
- **Components:** Threat models -> Threat scenarios (with attack chains) -> Mitigations
- **Scenario fields:** likelihood, impact, risk_score, attack_chain[], vulnerabilities[], indicators[]
- **Mitigation fields:** control_name, implementation_status, effectiveness, cost, priority, owner

### 8I. CISO Assistant ("Genie")

- **Backend:** `ai-assistant` edge function
- **Context:** Last 8 messages for conversation history
- **Capabilities:** Natural language Q&A, correlation rule generation, voice input (Web Speech API), voice output (SpeechSynthesis)
- **Rule generation:** Detects keywords ("correlation rule", "create rule", "detect when") and calls `generate-correlation-rule` edge function
- **Output:** Detection flow graph (nodes + edges), MITRE mapping, enhancement suggestions

### 8J. Threat Globe

- **Tech:** Three.js with custom WebGL shaders (atmospheric glow)
- **Visualization:** Animated severity-coded arcs between geographic coordinates
- **Feed:** Real-time attack entries with source/target cities
- **Limits:** Max 15 concurrent arcs, new arc every 2.5 seconds
- **Interaction:** Mouse drag orbit, scroll zoom, auto-rotate, touch support

---

## 9. DATABASE SCHEMA (80+ TABLES)

### Core Event Pipeline
`raw_event_buffer`, `events`, `alerts`, `cases`, `case_comments`

### Correlation & Detection
`correlation_rules`, `correlation_rules_library`, `correlation_rule_versions`, `cep_pattern_matches`, `discovered_patterns`, `discovery_profiles`

### Vector & Graph
`raw_security_events`, `vector_correlations`, `vector_correlation_rules`, `threat_hunt_queries`, `streaming_graph_vertices`, `streaming_graph_edges`, `rt_graph_snapshots`, `rt_streaming_metrics`

### Threat Intelligence
`iocs`, `ioc_matches`, `threat_feeds`, `feed_sync_logs`, `threat_intelligence_sources`

### Assets & Vulnerabilities
`asset_registry`, `asset_vulnerabilities`, `asset_enrichment_log`, `nist_nvd_vulnerabilities`, `physical_asset_vulnerabilities`

### User Behavior & LLM Risk
`user_profiles`, `user_behavior_events`, `user_risk_assessments`, `behavior_correlations`, `llm_risk_profiles`, `llm_interactions`, `llm_risk_incidents`, `user_psychological_profiles`, `psychological_risk_factors`, `communication_sources`, `cross_platform_behavioral_patterns`

### Response & Automation
`response_actions`, `n8n_workflows`, `workflow_executions`

### Deception & Red Team
`honeypots`, `honeytokens`, `honeypot_interactions`, `fuzzing_campaigns`, `pentest_campaigns`, `ai_generated_tools`, `attack_chains`

### Physical Security
`personnel_tracking`, `cctv_cameras`, `physical_security_events`, `physical_zones`

### Compliance & OCSF
`compliance_frameworks`, `compliance_controls`, `compliance_assessments`, `compliance_gaps`, `ocsf_categories`, `ocsf_event_classes`, `ocsf_attributes`, `ocsf_source_mappings`

### ML Platform
`ml_model_registry`, `poisoning_detections`, `model_simulations`, `training_data_audits`, `model_defense_configs`, `cowboy_notebooks`, `hedwick_model_registry`, `bolt_gpu_training`, `db_apps_registry`

### Malware Analysis
`malware_samples`, `sandbox_sessions`, `kernel_activity`, `process_behavior`, `network_behavior`, `memory_analysis`, `ai_analysis_results`

### Threat Modeling
`threat_models`, `threat_scenarios`, `threat_mitigations`

### Search & Dashboard
`lucene_indices`, `search_performance_metrics`, `custom_dashboards`, `dashboard_widgets`

### Agent System
`ai_agents`, `agent_configs`, `agent_tasks`, `ai_agent_activity`, `soc_automation_metrics`

### Auth & Escalation
`auth_attempts`, `event_priority_calculations`, `threat_escalation_formulas`

### DPI & Network
`dpi_flows`, `packet_captures`, `dlp_detections`

---

## 10. AUTHENTICATION FLOW (3-FACTOR)

```
+-------------------+    +-------------------+    +-------------------+
|   FACTOR 1        |    |   FACTOR 2        |    |   FACTOR 3        |
|   KNOWLEDGE       |--->|   BIOMETRIC       |--->|   BEHAVIORAL      |
|                   |    |                   |    |                   |
| Username+Password |    | Face Recognition  |    | Movement Verify   |
| POST to           |    | Webcam capture    |    | Nod/Shake/Smile   |
| verify-password   |    | JPEG frame via    |    | Must match pattern|
| edge function     |    | canvas element    |    | from Factor 1     |
|                   |    |                   |    |                   |
| Returns:          |    | Stores face       |    | On success:       |
| - userId          |    | encoding in       |    | - signInWithPwd   |
| - movementPattern |    | user_profiles     |    | - Update last_login|
+-------------------+    +-------------------+    +-------------------+
```

All attempts logged to `auth_attempts` table with: user_id, username, factor_1_success, factor_2_success, factor_3_success, success, ip_address, user_agent

---

## 11. NAVIGATION & ROLE-BASED ACCESS

### 4 Roles
| Role | Access |
|------|--------|
| **CISO** | Overview, Executive, Reports, Administration |
| **Admin** | All 8 sections (full access) |
| **Analyst** | Overview, Detection, Investigation, Response, Reports |
| **Engineer** | Overview, Detection, Investigation, Response, Data & Integration, Reports |

### 8 Navigation Sections (35 Views)

**Overview (4 roles)**
1. Dashboard (main overview with globe, metrics, compliance)
2. SOC Agent Bricks (agent management)
3. 3D SOC Agents (Three.js agent visualization)

**Executive (ciso, admin)**
4. Executive Dashboard (KPIs, strategic initiatives, financial impact)

**Detection & Intelligence (analyst, engineer, admin)**
5. Threat Feeds
6. IOCs
7. HoneyPot & Tokens
8. AI Malware Sandbox
9. Model Poisoning Guard
10. Attack Vectors
11. Smart Threat Modeling
12. Correlation Rules

**Investigation (analyst, engineer, admin)**
13. User Behaviors (UEBA)
14. Network & Physical (topology)
15. Vulnerabilities
16. Sessions & Events
17. AI Threat Hunting
18. Pattern Discovery

**Response & Automation (analyst, engineer, admin)**
19. Alerts
20. Cases
21. Threat Escalation
22. Automation (n8n workflows)
23. Red Team

**Data & Integration (engineer, admin)**
24. Dashboard Studio (migration)
25. Databricks Notebooks
26. OCSF Schema
27. Data Connectors
28. Document Intelligence
29. Streaming Graph
30. Architecture

**Reports (4 roles)**
31. Security Reports
32. Compliance Dashboard

**Administration (admin, ciso)**
33. Platform Users
34. Production Settings

**Global:** Command Palette (Cmd/Ctrl+K) -- searchable navigation overlay

---

## 12. KEY DATA FLOWS (ARROWS / DIRECTIONS)

### Flow 1: Event Ingestion to Alert (Primary Pipeline)

```
External Sources (108+ connectors)
        |
        v [HTTP POST]
etl-ingest (Edge Function)
        |
        v [INSERT]
raw_event_buffer
        |
        v [5s polling]
etl-orchestrator (Edge Function)
        |
        v [NORMALIZE + OCSF TAG]
events table
        |
        +---> [CLASSIFY] Stream Classification (7 lanes)
        |
        +---> [ANALYZE] Pattern Discovery (4 ML models)
        |         |
        |         v [INSERT]
        |     discovered_patterns
        |         |
        |         v [AI PROCESS]
        |     AI Correlation Agent
        |         |
        |         v [INSERT]
        |     correlation_rules
        |
        +---> [EMBED] Vector Engine (1536d)
        |         |
        |         v [SEARCH]
        |     FAISS ANN Index
        |         |
        |         v [MATCH]
        |     vector_correlations
        |
        +---> [PROCESS] CEP Engine (7 stages)
        |         |
        |         v [INSERT]
        |     cep_pattern_matches
        |         |
        |         v [ENRICH]
        |     MITRE ATT&CK Mapping
        |
        +---> [GRAPH] Real-Time Graph Streaming
        |         |
        |         v [4 stages: Spark -> GraphFrames -> VectorDB -> CEP]
        |     rt_graph_snapshots
        |
        +---> [SCORE] Threat Escalation Engine
                  |
                  v [FORMULA: S * MCR * TW * AC]
              event_priority_calculations
                  |
                  v
              ALL PATHS CONVERGE
                  |
                  v [CREATE ALERT]
              alerts table
                  |
                  v [LIFECYCLE]
              new -> investigating -> resolved/false_positive
```

### Flow 2: Agent Communication Chain

```
SIEM/Events --> Orchestrator Agent
                     |
                     v [task_assignment]
                Triage Agent Alpha
                     |
                     v [threat_detection]
                Enrichment Agent Beta
                     |
                     v [intelligence_sharing]
                Investigation Agent Gamma
                     |
                     v [escalation]
                Response Agent Delta
                     |
                     v [status_update]
                Orchestrator Agent
```

### Flow 3: LLM Risk Assessment

```
LLM Interactions (logged per-user)
        |
        +---> NLP Risk Classifier (DeBERTa-v3)
        |         |
        |         v
        |     Risk categories (12 types)
        |
        +---> Behavioral Baseline (EMA + Z-score)
        |         |
        |         v
        |     Deviation from personal baseline
        |
        +---> Psychological Profile (BERT Big Five + Dark Triad)
        |         |
        |         v
        |     Insider threat risk indicators
        |
        +---> Prompt Injection Detector (regex + DistilBERT)
        |         |
        |         v
        |     Jailbreak/injection flags
        |
        +---> Data Leakage Scorer (NER + PII regex)
                  |
                  v
              Composite leakage score
                  |
                  v
              ALL SIGNALS --> User Risk Score (0-100)
                  |
                  v
              Escalation if score > 70
```

### Flow 4: Malware Analysis Pipeline

```
Sample Upload
        |
        v
malware_samples (metadata, hashes)
        |
        +---> GBT Classifier (847 static features) --> 0.40 weight
        |
        +---> LSTM Analyzer (system call sequences) --> 0.35 weight
        |
        +---> Random Forest (byte n-grams) ----------> 0.25 weight
        |
        v [SOFT VOTING]
Ensemble Orchestrator (Platt-calibrated)
        |
        +---> kernel_activity (rootkit detection)
        +---> process_behavior (injection/escalation)
        +---> network_behavior (C2/exfiltration)
        +---> memory_analysis (shellcode/injection)
        +---> ai_analysis_results (MITRE mapping, family classification)
```

### Flow 5: Model Poisoning Guard Pipeline

```
ML Model in Production
        |
        +---> Model Drift Detector (PSI + KS test)
        |         |
        |         v
        |     Drift score (<0.1 stable, >0.25 significant)
        |
        +---> Spectral Signature Analyzer (SVD)
        |         |
        |         v
        |     Backdoor injection score
        |
        +---> Adversarial Input Detector (feature squeezing)
        |         |
        |         v
        |     Adversarial input rejection
        |
        +---> Integrity Hash Validator (SHA-256 + fingerprinting)
                  |
                  v
              Tampering probability
                  |
                  v
              Defense Ensemble Orchestrator (weighted voting)
                  |
                  v
              Composite Risk 0-100 --> Remediation:
              quarantine / rollback / retrain / enhanced monitoring
```

---

## 13. LUCIDCHART DIAGRAM SPECIFICATIONS

### Diagram 1: System Architecture Overview
- **Layout:** 4-tier horizontal layers (Presentation -> Processing -> Data -> Infrastructure)
- **Shapes:** Rounded rectangles for services, cylinders for databases, hexagons for ML models, cloud shapes for external
- **Arrows:** Solid for data flow, dashed for control flow
- **Color scheme:** Blue (core pipeline), Green (ML/AI), Orange (security modules), Teal (infrastructure), Red (alerts/threats)

### Diagram 2: The 11-Phase Pipeline
- **Layout:** Left-to-right flow with vertical branches
- **Shapes:** Stadium shapes for each phase, numbered 1-11
- **Key detail:** Phases 4-11 branch in parallel from Phase 3
- **Arrows:** Show data flow direction and table writes at each stage
- **Annotations:** Include table names, polling intervals, batch sizes

### Diagram 3: ML Model Landscape
- **Layout:** 8 clusters (one per model collection)
- **Per cluster:** Model cards showing name, algorithm, and purpose
- **Connections:** Show which models feed into which pipeline phases
- **Color coding:** By model type (Unsupervised=blue, Supervised=green, Deep Learning=red, NLP=yellow, Ensemble=purple, Statistical=gray)

### Diagram 4: Agent Communication Network
- **Layout:** Circular arrangement of 5 agents around central Orchestrator
- **Arrows:** Labeled with communication type and severity
- **Show:** The sequential pipeline flow plus feedback loops

### Diagram 5: Data Connector Map
- **Layout:** Hub-and-spoke with platform at center, 25 categories radiating outward
- **Per spoke:** Show vendor logos/names
- **Protocols:** Label each connection with protocol type

### Diagram 6: Database Entity Relationship
- **Layout:** Grouped by domain (Events, Agents, ML, Security, etc.)
- **Show:** Table names with key columns and foreign key relationships
- **Color coding:** Match the domain groups from Section 9

### Diagram 7: Authentication Flow
- **Layout:** 3-column sequential flow (Factor 1 -> Factor 2 -> Factor 3)
- **Show:** Decision points (pass/fail), data stored, APIs called

### Diagram 8: Threat Escalation Formula
- **Layout:** Formula diagram showing inputs converging to final score
- **Show:** Each variable's calculation with thresholds
- **Visual:** Gauge/meter showing priority level ranges

### Diagram 9: Correlation Rule Lifecycle
- **Layout:** Linear flow: draft -> testing -> staging -> production -> deprecated -> archived
- **Show:** Version promotion logic, review gates, rollback paths

### Diagram 10: MITRE ATT&CK Kill Chain Integration
- **Layout:** 12 phases in horizontal chain
- **Per phase:** Show detection source, color code, example techniques
- **Overlay:** Show which ML models and engines detect each phase

---

*This document contains the complete architectural specification for the 0xDSI platform. Every component, model, agent, data flow, table, and interaction documented herein is derived from the actual source code.*
