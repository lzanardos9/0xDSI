# 0xDSI Agentic SOC Platform - Technical Demo Narrative

## For: Chris Evans (Security Research Lead, formerly Google Chrome Security)
## Date: June 11, 2026

---

## OPENING HOOK (2 minutes)

"What you're looking at is not a dashboard bolted onto an LLM. This is a fully autonomous Security Operations Center where 60 specialized AI agents collaborate in real-time across a production-grade data pipeline, with hard enforcement boundaries that prevent the AI from going rogue. Every agent decision is auditable, every tool call is gated by risk level, and the entire system runs on formal statistical tests -- not vibes."

**Key differentiator to state upfront:**
"Unlike Microsoft Security Copilot which is a single-model chatbot with RAG, this is a multi-agent orchestration system where each agent has a single responsibility, its own tool permissions, confidence thresholds, and human-in-the-loop gates. The agents don't just advise -- they *execute* containment actions with formal approval workflows."

---

## SECTION 1: ARCHITECTURE OVERVIEW (5 minutes)

### The Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Presentation** | React 18 + TypeScript + Three.js | 200+ components, 3D agent visualization, real-time subscriptions |
| **API/Auth** | Supabase (PostgreSQL + RLS + Edge Functions) | 200+ tables, row-level security, 23 serverless functions |
| **Orchestration** | Databricks Workflows + LangGraph patterns | 56 agent notebooks, scheduled + event-driven |
| **Compute** | Databricks (Photon + Serverless) | Bronze/Silver/Gold medallion architecture |
| **ML** | PySpark ML + MLflow + Foundation Models | GBT, KMeans, Isolation Forest, GraphRAG |
| **LLM** | Meta Llama 3.1 70B (primary) + 8B (fallback) | Agent reasoning, classification, zero-day detection |
| **Embedding** | BGE-Large-EN | Vector similarity for incident correlation |

### Why This Matters for Security

Every layer enforces security constraints:
- **RLS on every table** -- no anonymous writes, creator-owned resources
- **Tool Registry with risk levels** -- READ_ONLY, WRITE, DESTRUCTIVE, EXTERNAL
- **Confidence-gated escalation** -- agents cannot act below 40% confidence
- **MLflow tracing on all LLM calls** -- full audit trail of every token
- **KS-test gating on correlation** -- statistical rigor, not threshold heuristics

---

## SECTION 2: THE 60-AGENT ARCHITECTURE (10 minutes)

### Agent Taxonomy

**7 Tiers of Specialization:**

| Tier | Agents | Purpose |
|------|--------|---------|
| 1: SOC Pipeline | Triage, Enrichment, Threat Hunter, Orchestrator, SAGE, NOVA, VANGUARD | Core alert processing |
| 2: Threat Intel | CTI Attribution, Pattern Discovery, Vector Memory | APT group identification, semantic search |
| 3: Adversary Sim | Red Team, Blue Team, Forensics, Honeypot | Attack simulation + defense validation |
| 4: Strategic | CISO Assistant, Playbook Generator, Incident Summarizer, Document Analyzer | Executive-facing |
| 5: Infrastructure | Model Poisoning Guard, Threat Simulator, Realtime Graph CEP, AI Correlation | Security of the AI itself |
| 6: Advanced | Glasswing (supply chain), ExploitForge, OT Protocol Security | Specialized threat domains |
| 7: AI Safety | AI Gateway Guardian, Shadow AI Detector, Prompt Forensics, LLM Guardrails | Securing LLM usage |

### Agent Framework Architecture

```python
# Base classes defined in _shared/agent_framework.py
class AgentStatus(Enum):
    IDLE, RUNNING, COMPLETED, FAILED, SKIPPED, DEGRADED

class BaseAgent:        # Abstract - MLflow tracing, tool registration
class BatchAgent:       # Scheduled execution (fetch -> process -> write -> report)
class InteractiveAgent: # ChatModel-based (real-time request/response)
class SupervisorAgent:  # LangGraph orchestrator (routes to sub-agents)
```

### Named Agent Personas (Live in Production)

| Agent | Persona | Throughput | Specialty |
|-------|---------|-----------|-----------|
| **Atlas** (Triage) | Calm, efficient | 342 events/sec | Fast classification, MITRE references |
| **Sage** (Enrichment) | Analytical, encyclopedic | 923 IOCs/day | Cross-feed correlation, APT attribution |
| **Nova** (Investigation) | Methodical, forensic | 1,156 investigations/day | Kill chain reconstruction |
| **Vanguard** (Response) | Decisive, careful | 2,034 actions/day | Firewall rules, EDR, host isolation |
| **Commander** (Orchestrator) | Strategic, aware | 4,201 ops/day | Resource allocation, routing |

### Orchestration Patterns (4 modes)

```
1. SEQUENTIAL:  Triage -> Enrichment -> Investigation -> Response
2. PARALLEL:    Multi-source enrichment (all feeds simultaneously)
3. CONSENSUS:   Multiple agents vote, 70% threshold required
4. SUPERVISOR:  Orchestrator routes to specialist workers
```

**Production Pipeline (orchestrator.py, 494 lines):**
```
Stage 1: Triage (01_triage_agent) -- Classification
Stage 2: Enrichment + Threat Hunter (02 + 03) [parallel execution]
Stage 3: Correlation Engine
Stage 4: Investigation (NOVA)
Stage 5: Response (VANGUARD)
```

**Orchestration Result Tracking:**
```python
@dataclass
class OrchestrationResult:
    run_id: str                       # Unique execution ID
    final_decision: AgentDecision     # Final action taken
    agent_decisions: list             # All agent outputs
    handoffs: list[AgentHandoff]      # Inter-agent handoffs
    pattern_used: OrchestrationPattern
    total_duration_seconds: float
    total_tokens_used: int
    agents_involved: list[str]
```

### Human-in-the-Loop (Critical for Security Audience)

**Escalation triggers (6 conditions):**
```python
class EscalationReason(Enum):
    LOW_CONFIDENCE = "low_confidence"            # Agent confidence < 40%
    HIGH_RISK_ACTION = "high_risk_action"        # Destructive tool invocation
    CONFLICTING_SIGNALS = "conflicting_signals"  # Agents disagree
    TIMEOUT = "timeout"                          # Exceeded max iterations (20)
    TOOL_FAILURE = "tool_failure"                # Tool execution error
    POLICY_VIOLATION = "policy_violation"        # Action violates policy
```

**Tool risk levels and approval gates:**
```python
@dataclass
class ToolDefinition:
    name: str
    risk_level: ToolRiskLevel    # READ_ONLY | WRITE | DESTRUCTIVE | EXTERNAL
    requires_approval: bool
    rate_limit_per_minute: int
    timeout_seconds: int
    retry_count: int
```

| Tool | Risk | Approval |
|------|------|----------|
| query_delta_table | READ_ONLY | Never |
| lookup_threat_intel | READ_ONLY | Never |
| search_vector_index | READ_ONLY | Never |
| graph_traversal | READ_ONLY | Never |
| create_case | WRITE | Severity-dependent |
| execute_response (block IP, isolate host, disable user) | DESTRUCTIVE | ALWAYS |

**Key point:** "No agent can execute a destructive action without human sign-off. Period. The system enforces this at the tool registry level, not through prompt engineering."

### Agent Decision Framework

```python
@dataclass
class AgentDecision:
    session_id: str
    action: str                      # BLOCK_IP, ESCALATE_TO_HUMAN, etc.
    reasoning: str                   # Full reasoning chain
    confidence: float                # 0.0-1.0
    evidence: list                   # Supporting evidence
    recommended_actions: list        # Follow-up actions
    requires_approval: bool
    escalation_reason: Optional[EscalationReason]
```

**Confidence Thresholds (config/thresholds.py):**
```python
CONFIDENCE = {
    "auto_route_to_enrichment": 0.70,    # Auto-advance if >= 70%
    "require_human_review": 0.40,        # Escalate if < 40%
    "auto_close_fp": 0.95,              # Auto-close false positive at 95%
    "consensus_threshold": 0.70,         # 70% agent agreement needed
}
```

---

## SECTION 3: ML MODELS -- STATISTICAL RIGOR (8 minutes)

### Model 1: Threat Scoring (GBT Classifier)

- **Algorithm:** Gradient Boosted Trees (PySpark MLlib GBTClassifier)
- **Hyperparameters:** maxIter=100, maxDepth=5, stepSize=0.1, subsamplingRate=0.8
- **11 features:**
  - Categorical (StringIndexer + OneHotEncoder): event_type, source_ip_category, destination_port_category, user_risk_tier
  - Numeric: hour_of_day, day_of_week, bytes_transferred_bucket, session_duration_bucket, failed_attempts_last_hour, distinct_targets_last_hour, geo_velocity_flag
- **Training:** 90-day rolling window, 80/20 split, seed=42
- **Evaluation:** AUC-ROC + AUC-PR (handles class imbalance)
- **Registry:** MLflow `security_threat_scoring_gbt`

### Model 2: UEBA -- Dual-Gate Anomaly Detection

**This is the crown jewel. Not a simple threshold system.**

**Gate 1: Kolmogorov-Smirnov Two-Sample Test**
- Per-user feature distributions compared across baseline (60 days) vs. detection window (24 hours)
- Bonferroni correction: alpha_corrected = 0.05 / n_features
- 6 behavioral dimensions tested:
  1. event_hour
  2. daily_event_count
  3. bytes_transferred
  4. session_duration
  5. failed_attempts
  6. distinct_targets
- **Requirement:** 2+ features must be anomalous to pass gate (reduces FP dramatically)

**Gate 2: KMeans Clustering + Outlier Detection**
- k=5 clusters on 7 aggregated user features (StandardScaler normalized)
- Features: total_events, distinct_ips, avg_bytes, stddev_bytes, avg_session_duration, off_hours_count, failed_auths
- **Outlier definition:** Distance from cluster center > 95th percentile

**Composite Confidence Score:**
```
confidence = 0.40 * (anomalous_features_count / total_features)
           + 0.30 * avg_ks_statistic
           + 0.30 * (cluster_distance_percentile / 100)
```

**Risk Level Mapping:**
- >= 0.8: CRITICAL
- >= 0.6: HIGH
- >= 0.4: MEDIUM
- < 0.4: LOW

**Anomaly Classification (by feature combination):**
- failed_attempts OR distinct_targets anomalous -> `lateral_movement_pattern`
- event_hour AND daily_event_count anomalous -> `temporal_anomaly`
- bytes_transferred anomalous -> `data_exfiltration_pattern`
- Other combinations -> `behavioral_deviation`

**Why this matters:** "We don't alert on a user doing 'more stuff'. We alert when their statistical distribution deviates from their personal baseline in specific combinations that map to known attack patterns."

### Model 3: Behavioral Anomaly Detection (Ensemble)

**Dual-model ensemble:**
1. **KMeans + KS Validation** (spherical anomalies)
   - Smallest cluster = anomaly cluster
   - KS validation per-user vs. normal population
2. **Isolation Forest** (non-convex anomalies)
   - n_estimators=200, contamination=5%, max_samples="auto"

**Ensemble Agreement Logic:**
- Both models agree: +15% confidence boost
- KMeans only: baseline confidence
- IForest only: blended 50/50 with KS validation

**Risk Score:**
- KMeans path: averaged KS confidence
- IForest path: 50% * KS_confidence + 50% * normalized_iforest_score
- Alert generated when risk_score > 70

### Model 4: GraphRAG Zero-Day Detection

**Architecture: Knowledge Graph + LLM Analysis**

**Graph nodes (3 types):**
- Techniques: MITRE techniques + tactics (90-day window)
- IOCs: IP/domain/hash indicators (30-day window)
- Actors: Threat attributions with confidence scores

**Zero-day candidate identification:**
- High-severity events NOT matching ANY known signature
- Grouped by source IP within 2-hour windows
- LLM classifies with temperature=0.2 (deterministic), JSON mode

**LLM System Prompt:** "You are a zero-day threat analyst. Determine if unsigned event sequences represent novel attack patterns."

**Output:** is_zero_day (bool), confidence (0-100), pattern_name, recommended_signature
**Threshold:** >= 60% confidence -> candidate flagged as CRITICAL alert

### Model 5: Model Monitoring (Continuous Drift Detection)

**Four mechanisms:**
1. **KS Test on feature distributions** -- compares recent vs. 8-day baseline (p < 0.01 = drift)
2. **Population Stability Index (PSI):** PSI = SUM((actual% - expected%) * ln(actual%/expected%)), threshold=0.25
3. **Prediction distribution drift** -- KS test on model output probabilities
4. **Model staleness** -- flags models older than 7 days with detected drift

**Auto-retraining:** Triggered ONLY on KS-confirmed drift. No scheduled retraining.

**Monitored experiments:**
- /Shared/0xDSI/experiments/behavioral_anomaly_detection
- /Shared/0xDSI/experiments/graphrag_zero_day_detection
- /Shared/0xDSI/experiments/threat_scoring_model
- /Shared/0xDSI/experiments/ueba_behavioral_baseline

---

## SECTION 4: DATA PIPELINE -- MEDALLION ARCHITECTURE (5 minutes)

### Bronze Layer (Raw Ingestion)

**Two concurrent sources:**
1. **Autoloader (Cloud Files):** S3/ADLS/GCS with schema drift detection
   - `maxFilesPerTrigger: 500` (backpressure control)
   - `rescuedDataColumn: _rescued_data` (corrupt record quarantine, never drops data)
2. **Kafka/Event Hub:** Streaming with `maxOffsetsPerTrigger: 100,000`
   - `failOnDataLoss: false` (fault-tolerant)
   - SASL/PLAIN authentication

**DLT Quality Expectations:**
```python
@dlt.expect("has_event_type", "event_type IS NOT NULL")
@dlt.expect("has_timestamp", "timestamp IS NOT NULL")
@dlt.expect_or_quarantine("valid_json_parse", "_rescued_data IS NULL")
```

### Silver Layer (OCSF v1.1 Normalization)

"We normalize everything to OCSF v1.1 -- the Open Cybersecurity Schema Framework. Vendor-agnostic analysis across 86 event type mappings."

**Example OCSF mappings:**
```python
OCSF_CLASS_MAP = {
    "authentication_success": (class_uid=3002, category=3, activity=1),
    "authentication_failure": (class_uid=3002, category=3, activity=2),
    "privilege_escalation":  (class_uid=3004, category=3, activity=1),
    "process_creation":      (class_uid=1001, category=1, activity=1),
    "network_connection":    (class_uid=4001, category=4, activity=1),
    "dns_query":             (class_uid=4003, category=4, activity=1),
    "data_exfiltration":     (class_uid=4010, category=4, activity=99),
    # ... 86 total mappings
}
```

**Transformations:** OCSF mapping, severity normalization (text -> severity_id 1-5), entity extraction, timezone UTC, deduplication, computed fields (is_off_hours, is_weekend).

### Gold Layer (Pre-aggregated Analytics)

6 materialized tables refreshed hourly:
- `gold_hourly_metrics` -- Volume + severity distribution
- `gold_alert_summary` -- MTTD, MTTR, false positive rates
- `gold_user_risk_scores` -- Per-user risk scoring
- `gold_mitre_coverage` -- ATT&CK detection heatmap
- `gold_entity_risk_profiles` -- IP/user/host scoring
- `gold_data_quality_metrics` -- Pipeline health

**User Risk Scoring Formula:**
```python
risk_score = min(100,
    critical_events * 25 +
    high_severity_events * 10 +
    off_hours_events * 3 +
    auth_failures * 5 +
    privilege_escalations * 20 +
    data_exfiltration_events * 30 +
    (15 if unique_ips > 10 else 0)
)
```

---

## SECTION 5: CORRELATION ENGINES (5 minutes)

### KS-Gated Streaming Correlation

"Most SIEMs fire alerts on static thresholds. We use a Kolmogorov-Smirnov two-sample test to determine if observed behavior is statistically significant given the entity's personal baseline."

**How it works:**
```python
def is_ks_significant(source_ip, event_type, observed_count, window_min=5):
    baseline = lookup.get((source_ip, event_type))  # 7-day daily counts
    if baseline is None or len(baseline) < 3:
        return observed_count >= 10, 0.5  # Default threshold

    hourly_rate = baseline / 24.0
    window_rate = hourly_rate * (window_min / 60.0)
    percentile = percentileofscore(window_rate, observed_count)

    if percentile >= 99:
        p_value = 2 * (1 - percentile / 100)
        return p_value < ks_alpha, float(1 - max(p_value, 1e-10))
    return False, 0.0
```

**Adaptive severity (z-score based):**
- z > 5: CRITICAL
- z > 3: HIGH
- else: MEDIUM

**Why this eliminates false positives:** "A proxy server generating 10K events/hour won't alert because that's its baseline. But an endpoint that normally does 5/hour suddenly doing 50 will trigger."

### Graph-Based Lateral Movement Detection

**Architecture:** NetworkX DiGraph, 24-hour lookback
- Nodes: source IPs, users, hostnames
- Edges: connections with frequency weights + max_severity + timestamps
- Edge TTL: 24 hours (auto-prune)
- Max nodes: 500K (prune on overflow)

**Detection patterns:**
1. **Centrality drift:** Node degree_centrality increase > 2x baseline
2. **Fan-out anomalies:** Out-degree > 15
3. **Dense subgraphs:** Weakly-connected components with density > 0.6
4. **Multi-hop lateral movement:** Paths crossing entity types (user->device->IP->domain), max 4 hops, temporal ordering enforced

### Entity Behavioral Drift (CET - 6 Dimensions)

```
Composite Drift Score =
    0.20 * rate_drift
  + 0.20 * diversity_drift
  + 0.15 * temporal_drift
  + 0.15 * centrality_drift
  + 0.15 * pivot_potential
  + 0.15 * destination_novelty
```

**Trajectory Classification:**
- rate_ratio > 1.5 -> "accelerating"
- rate_ratio < 0.5 -> "decelerating"
- diversity_drift > 0.3 -> "expanding"
- destination_novelty > 0.5 -> "exploring"
- else -> "stable"

---

## SECTION 6: AI SAFETY -- THE GUARDRAILS (8 minutes)

**This section should really shine for Chris. Adversarial ML defense.**

### Jailbreak Detection Taxonomy (10 Techniques)

| ID | Technique | Severity | Detection Method | Confidence |
|----|-----------|----------|-----------------|------------|
| JB-001 | DAN (Do Anything Now) | CRITICAL | Persona injection regex | 0.85 |
| JB-002 | Token Manipulation | CRITICAL | Character splitting/encoding detection | 0.75 |
| JB-003 | Hypothetical Framing | HIGH | "Imagine if..." extraction | 0.70 |
| JB-004 | Multi-Turn Escalation | HIGH | Conversation trajectory analysis | 0.80 |
| JB-005 | System Prompt Extraction | CRITICAL | Pattern matching + NLP | 0.90 |
| JB-006 | Indirect Injection | HIGH | Embedded instruction detection | 0.80 |
| JB-007 | Persona Splitting | HIGH | Alter-ego/developer mode patterns | 0.85 |
| JB-008 | Tool Abuse | MEDIUM | Function-calling bypass detection | 0.75 |
| JB-009 | Language Switch | MEDIUM | Low-resource language detection | 0.70 |
| JB-010 | Crescendo Attack | HIGH | Progressive normalization tracking | 0.75 |

**Detection pipeline:**
```
Phase 1: Pattern matching (regex) for techniques 1-2, 5-8
Phase 2: Content policy evaluation (sensitive data, harmful content)
Phase 3: Behavioral drift check vs. user baseline
Phase 4: Rate limiting / token budget validation
```

**Verdict logic:**
- Any CRITICAL violation -> BLOCK
- Multiple HIGH violations -> BLOCK
- Single HIGH -> WARN
- No violations -> ALLOW

### Shadow AI Detection (Agent 57) -- 4 Channels

**1. DNS Analysis**
- Regex patterns for: api.openai.com, api.anthropic.com, generativelanguage.googleapis.com, DeepSeek, HuggingFace
- Threshold: 3+ queries to same AI domain
- DeepSeek: flagged as CRITICAL (foreign LLM, data sovereignty risk)

**2. Network Traffic Analysis**
- TLS SNI inspection + LLM call fingerprinting:
  - bytes_sent: 500-50,000
  - bytes_received: 1,000-500,000
  - connection_duration: >2,000ms
- Streaming detection: bytes_received > 500KB + duration > 10s

**3. Browser Extension Audit**
- Pattern matching on extension names
- Flags: ChatGPT, Claude, Copilot, Gemini (if unauthorized)

**4. Behavioral Anomalies**
- Code complexity z-score: +3 sigma without training = likely AI assistance
- Writing sophistication delta detection
- Response time anomalies (solutions too fast for problem complexity)

### Prompt Forensics & Cost Attribution (Agent 58)

**Topic Taxonomy (10 categories):**
- code_generation (low risk)
- security_research (medium risk)
- offensive_security (HIGH risk)
- social_engineering (HIGH risk)
- data_exfiltration (CRITICAL risk)
- malware_development (CRITICAL risk)

**Behavioral Drift Scoring:**
```
drift_score = 0
if new_high_risk_topics:
    drift_score += 0.5
for topic in current_topics:
    delta = |current_pct - baseline_pct| / 100
    risk_weight = {low: 0.5, medium: 1.0, high: 2.0, critical: 3.0}
    drift_score += delta * risk_weight[topic_risk]
drift_score = min(1.0, drift_score / 3)
```

**Psychological Correlation Factors:**
- Stress * risky_queries
- Dark Triad indicators * jailbreak attempts
- Low conscientiousness * policy violations
- Neuroticism * off-hours usage patterns

### Model Poisoning Guard (Agent 21)

**Three integrity checks:**
1. **Prediction confidence baseline** -- median < 0.85 = drift_detected
2. **Statistical anomaly** -- z-score on predictions, flags > 3 sigma deviations
3. **Feature distribution validation** -- input distribution shift detection

### PII Redaction Engine

**6 detection categories (regex + NLP):**
- Credit cards: `\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}`
- SSN: `\d{3}-\d{2}-\d{4}`
- API keys: `(api_key|sk-|pk-)[a-zA-Z0-9_-]{20,}`
- Passwords, email, phone numbers
- Real-time scanning of all LLM prompts AND responses
- Redaction applied before data leaves corporate boundary

### Detection SLM (Small Language Model Alert Classifier)

**4-class classification:** MALICIOUS, SUSPICIOUS, BENIGN, NOISY
- Temperature: 0.05 (highly deterministic)
- JSON mode enabled
- Batch: 100 alerts/run, 15-minute lookback
- **KS-based confidence calibration:**
  - Maintains per-class historical baseline (7-day)
  - Batch drift detection: KS test on batch vs. historical
  - p-value < 0.01 = MODEL DRIFT flagged
  - Calibrated confidence = 0.7 * raw_conf + 0.3 * percentile_rank

---

## SECTION 7: FRONTEND -- 200+ COMPONENTS (3 minutes)

### Navigation Structure (10 Major Sections)

1. **Overview** -- Dashboard, SOC Agent Bricks, 3D SOC Agents
2. **Executive** -- CISO Dashboard (role-gated)
3. **Industry Threat Intel** -- 9 verticals (Financial, Healthcare, Energy, Manufacturing, Aviation, Telco, Retail, Education, CPG)
4. **Innovation** -- Swarm Crucible, CET Trend Engine, Feature Lab, ChronoWeave, Detection SLM, Detection Confluence
5. **Detection & Intelligence** -- MITRE ATT&CK, Glasswing Scanner, Threat Cortex, IOCs, STIX/TAXII, Honeypots, AI Malware Sandbox, AI Gateway, Correlation Rules, Simulations
6. **Investigation** -- Entity Investigation, AI Incident Summary, Advanced Hunting, User Behaviors, Network Topology, Vector Threat Hunting, Pattern Discovery
7. **Response & Automation** -- Alerts, Cases, Escalation, Response Automation, Approval Workflows, AI Playbook Builder, Red Team, Phishing Simulator
8. **Data & Integration** -- Dashboard Studio, Databricks Notebooks, OCSF Schema Browser, Data Connectors, SAP Security, Streaming Graph
9. **Reports & Analytics** -- Security Reports, Report Builder, Compliance Dashboard, Platform Economics, SOC Optimization
10. **Administration** -- Multi-Tenant Manager, Platform Users, MCP Registry, Production Settings

### Key Visualization Components

- **Three.js 3D Agent Network** -- Real-time agent topology with communication links
- **Threat Globe** -- Geographic threat visualization with WebGL
- **Kill Chain Waterfall** -- Interactive attack lifecycle
- **Monte Carlo Forecasting** -- Statistical threat prediction
- **CEP Live Graph** -- Complex event processing real-time
- **Identity Graph Explorer** -- Entity relationship mapping
- **Attack Universe** -- Complete attack surface visualization

### Real-Time Architecture

- WebSocket subscriptions via Supabase Realtime
- Channels: alerts, events, cases, agent_tasks, user_behavior_events
- Metrics update every 100ms with realistic fluctuations
- Activity tracking for audit trail on every user action

---

## SECTION 8: DATABASE -- 200+ TABLES WITH RLS (3 minutes)

### Core Schema (PostgreSQL via Supabase)

**SIEM Foundation:**
- security_events, sessions, alerts, cases, correlation_rules, threat_intelligence
- All with RLS enabled, creator-owned resources
- Vector embeddings (pgvector extension, 384 dimensions) for semantic search

**ETL Pipeline:**
- raw_event_buffer, event_parsers, parsing_queue, enrichment_queue, enrichment_sources, correlation_queue, processing_stats
- Priority-based processing with exponential backoff
- Dead-letter tracking for post-failure analysis

**Data Connectors (18 types supported):**
- DPI, Network TAP, Syslog/CEF/LEEF
- AWS CloudTrail, Azure Monitor, GCP Logging
- Kafka, SQS, RabbitMQ
- Bytecode weaving (JVM, .NET, Python), eBPF probes

**Specialized:**
- 50,000+ pre-built correlation rules across 30 threat categories
- Case management with auto-generated case numbers (CASE-YYYY-####)
- Agent registry (soc_agent_registry) with runtime configuration
- Guardrail policies, scan results, PII redaction logs

### 23 Supabase Edge Functions

- agent-orchestrator, agent-chat
- enrichment-engine, correlation-engine
- etl-orchestrator, etl-ingest
- threat-radar (3 functions)
- geopolitical-risk-fetch, simulate-threat
- generate-correlation-rule, generate-connector
- exploit-chain-analyze, crash-analyze
- feature-lab, and more

---

## SECTION 9: DEPLOYMENT & OPERATIONS (3 minutes)

### Databricks Bundle Configuration

```yaml
bundle: 0xdsi-agentic-soc

variables:
  catalog: soc_platform
  schema: agentic_soc
  llm_endpoint: databricks-meta-llama-3-1-70b-instruct
  llm_fallback_endpoint: databricks-meta-llama-3-1-8b-instruct
  embedding_endpoint: databricks-bge-large-en
  secret_scope: soc-secrets

targets:
  dev:        soc_platform_dev
  staging:    soc_platform_staging
  production: soc_platform

pipelines:
  medallion:
    continuous: true
    photon: true
    serverless: true
    autoscale: 1-4 workers (ENHANCED mode)

  attack_universe_realtime:
    continuous: true
    photon: true
    serverless: true
    autoscale: 1-2 workers
```

### Job Schedule

| Job | Schedule | Workers | State Store |
|-----|----------|---------|-------------|
| Streaming Correlation | Every 5 min | 2-6 (auto-scale) | RocksDB |
| Temporal Correlation | Continuous (30s windows) | 2-4 | RocksDB |
| Graph Correlation | Hourly | 4 fixed | In-memory |
| Bronze/Silver/Gold | Continuous | 1-4 | Delta checkpoints |

### Infrastructure

- **Compute:** Photon engine (GPU-accelerated query execution)
- **Storage:** Delta Lake with ACID transactions
- **State:** RocksDB for fault-tolerant stateful streaming
- **Checkpoints:** Per-source automatic management
- **Spark Config:** `delta.optimizeWrite.enabled: true`, `streaming.stateStore.providerClass: RocksDBStateStoreProvider`

---

## SECTION 10: COMPLIANCE ENGINE (3 minutes)

### EU AI Act + NIST AI RMF Compliance Scorecard

**5 tabs:** Overview, EU AI Act, NIST AI RMF, Model Registry, Findings
- Automated risk classification per AI system
- Control mapping to both frameworks simultaneously
- Continuous monitoring with drift detection on compliance posture
- 14-dimension Microsoft Security Copilot comparison table

### Production Security Controls

| Control | Setting |
|---------|---------|
| Data retention | 90 days (configurable) |
| Max events/sec | 10,000 (ingestion throttle) |
| Session timeout | 30 minutes |
| Max failed logins | 5 |
| Password min length | 12 chars + special |
| Audit logging | Always on |
| Encryption at rest | Enabled |
| Rate limiting | 1000 req/min |
| Backup frequency | 24 hours |

---

## SECTION 11: COMPETITIVE DIFFERENTIATION (3 minutes)

### vs. Microsoft Security Copilot / Agents 365

| Capability | Microsoft | 0xDSI |
|-----------|-----------|-------|
| Agent count | 6 pre-built | 60 specialized |
| Orchestration | Single-turn RAG | Multi-pattern (sequential, parallel, consensus, supervisor) |
| Statistical rigor | Threshold-based | KS-test gated, PSI drift detection |
| Tool safety | Implicit trust | Explicit risk levels + approval gates |
| Model diversity | GPT-4 only | Llama 70B + 8B fallback + BGE embeddings |
| Correlation | Rule-based | Graph + temporal + KS-statistical |
| Schema | Proprietary | OCSF v1.1 (open standard, 86 mappings) |
| LLM Safety | Basic content filter | 10-technique jailbreak taxonomy + shadow AI detection |
| Deployment | Azure-only | Multi-cloud (Databricks + Supabase) |
| Compliance | Manual assessment | Automated EU AI Act + NIST RMF |
| UEBA | Simple rules | Dual-gate KS + KMeans with composite scoring |
| Zero-day | Signature-based | GraphRAG + LLM classification |

### Unique Capabilities Not Found Elsewhere

1. **Dual-gate UEBA** (KS + KMeans ensemble with Bonferroni correction)
2. **GraphRAG zero-day detection** (knowledge graph + LLM classification)
3. **KS-gated correlation** (eliminates false positives from high-volume sources)
4. **Shadow AI detection** across 4 channels (DNS, network, extensions, behavioral)
5. **Crescendo attack detection** (multi-turn jailbreak escalation tracking)
6. **Entity drift CET** (6-dimension behavioral trajectory with weighted scoring)
7. **Model poisoning defense** (3-check integrity with auto-fallback to rules)
8. **Financial crime specialization** (PIX fraud, banking trojans, credential selling graphs)
9. **Prompt forensics** with psychological correlation (stress * risky_queries)
10. **Detection SLM** with KS-calibrated confidence (not raw LLM scores)

---

## SECTION 12: LIVE DEMO FLOW (Click Path)

### Recommended Route (15-20 minutes interactive)

**1. AI Gateway Control Plane** (3 min)
- Show real-time violation feed (jailbreak attempts auto-blocked)
- Click through jailbreak taxonomy (10 techniques with detection confidence)
- Show shadow AI detections (DeepSeek flagged as CRITICAL)
- Demonstrate behavioral drift (user topic shift tracking)
- Show insider threat signals (off-hours + escalating queries)
- Show department cost attribution

**2. Guardrails Dashboard** (2 min)
- Live scan feed (real-time Supabase subscription)
- Policy hit distribution chart
- Active incidents with severity breakdown
- Real-time blocked count incrementing

**3. AI Governance / Compliance Scorecard** (3 min)
- EU AI Act risk classification by AI system
- NIST AI RMF control mapping
- Model registry with lifecycle status
- Microsoft comparison table (14 dimensions)

**4. Agent Communication** (2 min)
- Show Atlas -> Sage -> Nova -> Vanguard pipeline
- Inter-agent messaging with natural language narratives
- Orchestration results (run_id, decisions, handoffs, token usage)

**5. SOC Agents 3D Visualization** (1 min)
- Three.js agent network with live communication links
- Visual topology showing data flow between all 60 agents

**6. Command Center** (3 min)
- Threat Radar (geographic threat visualization)
- Kill Chain Waterfall (attack lifecycle)
- Monte Carlo Forecasting (statistical threat prediction)
- CEP graph (real-time event correlation)

**7. Entity Investigation** (2 min)
- Pick a high-risk user from UEBA
- Show behavioral baseline vs. current activity
- KS test results on specific features
- Anomaly classification (lateral_movement_pattern)

**8. Databricks Notebooks** (2 min)
- Notebook catalog (129 notebooks, organized by category)
- Run history with execution metrics
- Pipeline status (Bronze -> Silver -> Gold)

---

## Q&A TALKING POINTS

### If asked about adversarial robustness:
"Every agent runs in a constrained tool-use loop. The LLM cannot execute arbitrary code -- it can only invoke pre-registered tools with defined parameter schemas. Destructive tools always require human approval. If an attacker compromises a prompt, the worst case is a wrong classification, not lateral movement, because tool permissions are enforced at the registry level, not the prompt level."

### If asked about hallucination:
"Agents don't freestyle generate intelligence. They invoke tools (query_delta_table, lookup_threat_intel, search_vector_index) and work with the results. The enrichment agent doesn't *imagine* that an IP is malicious -- it checks VirusTotal, GreyNoise, and MISP via registered tool calls. Every claim is backed by tool output in the audit trail."

### If asked about model poisoning:
"Agent 21 runs three integrity checks: prediction confidence baseline monitoring, statistical anomaly detection via z-scores, and feature distribution validation. If any check fails, the model is flagged and the system falls back to the rule-based pipeline until investigated."

### If asked about scale:
"The streaming correlation engine processes 100,000 events per trigger interval with RocksDB state store for fault tolerance. Bronze handles 500 files per trigger from cloud storage and 100K offsets from Kafka. Auto-scaling goes up to 6 workers for correlation, 8 for ingestion. Gold aggregations are hourly."

### If asked about the KS test choice:
"Kolmogorov-Smirnov because it's non-parametric -- doesn't assume normal distributions. Security event data is highly skewed, bursty, and multimodal. KS works on any distribution shape. We apply Bonferroni correction for multiple comparisons and require 2+ features anomalous before alerting."

### If asked about cost:
"Platform Economics shows full cost attribution. Token budgets enforced per-user and per-department. LLM fallback from 70B to 8B reduces cost 10x for low-complexity classifications. Model monitoring auto-retrains only on confirmed drift, not on schedule."

### If asked about agent compromise:
"The tool registry is the last line of defense. Even if an agent's prompt is fully compromised, it cannot invoke tools outside its registered set, cannot bypass risk-level gates, and destructive actions always require a human to click approve. The audit trail shows exactly what the agent decided, why, and what evidence it used."

---

## CLOSING STATEMENT

"This isn't a proof of concept. It's 200+ database tables with RLS, 129 Databricks notebooks in production deployment configuration, 60 agents with formal orchestration patterns, statistical rigor on every detection, and hard safety boundaries that prevent AI from taking unauthorized actions. The question isn't whether AI can run a SOC. The question is whether you trust the constraints. We built the constraints first."

---

## APPENDIX A: KEY FILE PATHS FOR LIVE CODE WALKTHROUGH

| Component | Path |
|-----------|------|
| Agent Orchestrator | `production/agents/core/orchestrator.py` (494 lines) |
| Tool Registry | `production/agents/core/tool_registry.py` |
| Human-in-the-Loop | `production/agents/core/human_in_the_loop.py` |
| Agent Base Class | `production/agents/core/agent_base.py` |
| Triage Agent | `databricks-native/notebooks/agents/01_triage_agent.py` |
| AI Gateway Guardian | `databricks-native/notebooks/agents/56_ai_gateway_guardian.py` |
| Shadow AI Detector | `databricks-native/notebooks/agents/57_shadow_ai_detector.py` |
| UEBA Model | `databricks-native/notebooks/ml_training/03_ueba_behavioral_baseline.py` |
| GraphRAG Zero-Day | `databricks-native/notebooks/ml_training/04_graphrag_zero_day.py` |
| Model Monitoring | `databricks-native/notebooks/ml_training/05_model_monitoring.py` |
| KS Correlation | `databricks-native/notebooks/correlation/01_streaming_correlation_engine.py` |
| Bronze Pipeline | `databricks-native/notebooks/pipelines/bronze_ingestion.py` |
| Silver Pipeline | `databricks-native/notebooks/pipelines/silver_normalization.py` |
| Gold Pipeline | `databricks-native/notebooks/pipelines/gold_analytics.py` |
| Databricks Config | `databricks-native/databricks.yml` |
| Agent Communication | `src/lib/agentCommunication.ts` |
| Frontend Orchestrator | `src/lib/agentOrchestrator.ts` |
| Compliance Scorecard | `src/components/AIComplianceScorecard.tsx` |

## APPENDIX B: NOTEBOOK INVENTORY (129 Total)

| Category | Count | Key Notebooks |
|----------|-------|---------------|
| **Agents** | 56 | Triage, Enrichment, Threat Hunter, Orchestrator, SAGE, NOVA, VANGUARD, CTI Attribution, Red/Blue Team, Forensics, Honeypot, CISO, Guardrails, Model Poisoning Guard, Graph CEP, Shadow AI, Prompt Forensics, ExploitForge, OT Protocol |
| **Ingestion** | 11 | Raw event, enrichment pipeline, schema enforcement, quarantine, threat feed connectors, Kafka/EventHub, LLM interceptor |
| **Correlation** | 10 | Streaming (KS), temporal, graph, supply chain, cloud posture, negative, detection confluence |
| **Detection** | 8 | Behavioral anomaly, threat intel matching, Detection SLM, entity drift CET, OT anomalies |
| **ML Training** | 5 | Threat scoring GBT, feature engineering, UEBA baseline, GraphRAG zero-day, model monitoring |
| **Analytics** | 6 | Trend analysis, swarm crucible, financial threat intel, geopolitical, Monte Carlo |
| **Response** | 5 | Automated response, case management, notifications, ticketing, reports |
| **Operations** | 5 | Health checks, SLA alerting, deduplication, checkpoint GC, Delta replay |
| **Setup** | 5 | Catalog init, data seeding, model serving, correlation rules library |
| **Pipelines** | 4 | Bronze ingestion, Silver normalization, Gold analytics, Attack Universe realtime |
| **Shared** | 10 | agent_framework, bootstrap, config, llm_client, secrets, monitoring, delta_helpers, sql_safe, sdp_stream |

## APPENDIX C: TIMING GUIDE

| Section | Minutes | Energy Level |
|---------|---------|--------------|
| Opening Hook | 2 | HIGH -- grab attention |
| Architecture | 5 | Medium -- set context |
| Agent Deep Dive | 10 | HIGH -- this is the core |
| ML Models | 8 | HIGH -- KS tests impress |
| Data Pipeline | 5 | Medium -- production cred |
| Correlation | 5 | HIGH -- novel approach |
| AI Safety | 8 | HIGHEST -- Chris's expertise |
| Frontend | 3 | Medium -- visual wow |
| Database | 3 | Medium -- production proof |
| Deployment | 3 | Medium -- ops maturity |
| Compliance | 3 | Medium -- regulatory awareness |
| Competitive | 3 | HIGH -- positioning |
| **Total** | **~58 min** | Adjust based on Q&A |

**Recommended cut for 30-min version:** Opening + Agents (condensed) + ML Models + AI Safety + Live Demo + Closing
