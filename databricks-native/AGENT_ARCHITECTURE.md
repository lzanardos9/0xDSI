# 0xDSI Agentic SOC: Databricks-Native Agent Architecture

## Overview

All 43 SOC agents run natively on Databricks using the **Mosaic AI Agent Framework**. The architecture splits agents into three tiers based on their interaction pattern:

| Tier | Count | Runtime | Deployment |
|------|-------|---------|-----------|
| **Supervisor** | 1 | Notebooks + Model Serving | Dual-mode (batch pipeline + interactive) |
| **Interactive** | 11 | Model Serving endpoints | MLflow ChatModel via REST API |
| **Batch** | 31 | Databricks Workflows (scheduled) | Notebook jobs with Delta state |

---

## Architecture Diagram

```
                ┌─────────────────────────────────────────────────┐
                │         04 ORCHESTRATOR (SupervisorAgent)        │
                │         LangGraph-style dynamic routing          │
                │    Batch: run_pipeline() on schedule (5 min)     │
                │    Interactive: predict_messages() via REST      │
                └────────────────────┬────────────────────────────┘
                                     │
         ┌───────────────────────────┼────────────────────────────┐
         │                           │                            │
┌────────▼─────────┐    ┌───────────▼──────────┐    ┌───────────▼──────────┐
│  Interactive Tier │    │    Batch Pipeline    │    │   Batch Utility      │
│  (Model Serving)  │    │    (Core SOC Loop)   │    │   (Supporting)       │
├───────────────────┤    ├──────────────────────┤    ├──────────────────────┤
│ 05 SAGE           │    │ 01 Triage            │    │ 20 LLM Guardrails    │
│ 06 NOVA           │    │ 02 Enrichment        │    │ 21 Model Poisoning   │
│ 07 VANGUARD       │    │ 03 Threat Hunter     │    │ 23 Connector Health  │
│ 15 CISO Assistant │    │ 08 CTI Attribution   │    │ 25 ALHF Learning     │
│ 16 Playbook Gen   │    │ 09 Pattern Discovery │    │ 26 Graph CEP         │
│ 17 Incident Summ. │    │ 10 Vector Memory     │    │ 27 Vector Scoring    │
│ 18 Doc Analyzer   │    │ 11 Red Team          │    │ 28 AI Correlation    │
│ 19 Malware Sandbox│    │ 12 Blue Team         │    │ 29 Connector Version │
│ 22 Threat Sim.    │    │ 13 Forensics         │    │ 30 Backdoor Defense  │
│ 24 Threat Radar   │    │ 14 Honeypot          │    │ 32-37 Glasswing Vuln │
│ 31 Vibe Builder   │    │                      │    │ 38-43 Management     │
└───────────────────┘    └──────────────────────┘    └──────────────────────┘
```

---

## Shared Infrastructure

All agents inherit from a common framework (`_shared/agent_framework.py`):

```python
class BatchAgent(BaseAgent):
    def run(self) -> AgentResult:        # Full lifecycle: trace, execute, metrics
    def execute(self) -> AgentResult:    # Subclass implements this
    def llm_classify(...)  -> dict:      # LLM call with auto-tracing + JSON extraction
    def execute_tool(name, params):      # Call UC Function with audit

class InteractiveAgent(BaseAgent):
    def predict_messages(messages) -> dict:   # Model Serving entrypoint
    def get_system_prompt() -> str:           # Agent-specific persona
    def get_tools() -> list[UCTool]:          # Domain tools
    # Auto tool-calling loop: up to 10 iterations

class SupervisorAgent(InteractiveAgent):
    def register_sub_agent(SubAgent):     # Add agent to routing table
    def _invoke_sub_agent(name, task):    # Call via endpoint or notebook
```

Every agent automatically gets:
- **MLflow Tracing**: Spans on every LLM call and tool execution
- **MLflow Experiment Tracking**: Metrics (processed_count, tokens, latency) per run
- **Token Budget**: Capped at 500K tokens/run with graceful degradation
- **UC Function Tools**: Governed, auditable tool calls through Unity Catalog
- **Control Plane**: `agent_configs` table enables/disables agents without code changes

---

## Agent-by-Agent Deep Dive

### 01 Triage Agent

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes via Workflow |
| **Input** | `alerts` table (new/unprocessed) |
| **Output** | `agent_triage_results` table |
| **Tools** | `lookup_ioc`, `get_alert_context` |

**Approach**: Hybrid fast/slow path. Rule-based patterns auto-close known false positives (health checks, monitoring probes, scheduled scans) at 95%+ confidence. Remaining alerts go through LLM classification with JSON-mode structured output.

**Why this approach**: Triage must be fast (hundreds of alerts/minute). Rule-based fast path avoids burning LLM tokens on obvious noise. The LEFT JOIN pattern (`WHERE triage_results.alert_id IS NULL`) guarantees exactly-once processing.

**Databricks-native problem**: None significant. This is the ideal use case for batch notebooks on Databricks -- high throughput, idempotent, Delta ACID guarantees.

---

### 02 Enrichment Agent

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | After triage (pipeline stage 2) |
| **Input** | Triaged alerts (INNER JOIN on `agent_triage_results`) |
| **Output** | `alert_enrichments` table |
| **Tools** | `lookup_ioc`, `get_asset_info`, `search_events` |

**Approach**: Multi-source context aggregation. Combines threat intel IOC matches (35% weight), asset criticality (25%), related event volume (20%), and LLM narrative risk assessment (20%) into a composite `enrichment_score`.

**Why this approach**: Enrichment is embarrassingly parallel -- each alert can be enriched independently. The composite score normalizes heterogeneous signals into a single sortable value for analyst prioritization.

**Databricks-native problem**: **Token budget pressure**. When alert volume spikes, the LLM narrative generation can exhaust the token budget. The agent degrades gracefully by skipping LLM narratives once budget hits 80% -- enrichment continues with just rule-based signals.

---

### 03 Threat Hunter Agent

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | After enrichment (pipeline stage 3) |
| **Input** | Enriched alerts + threat intel |
| **Output** | `threat_hunt_results` table |
| **Tools** | `search_events`, `lookup_ioc`, `query_user_behavior` |

**Approach**: LLM-generated hypotheses validated against data. The agent asks the LLM to generate 3-5 hunt hypotheses based on recent alerts, then executes structured SQL queries to confirm or refute each one. Tracks confirmation rate.

**Why this approach**: Automated hunting bridges the gap between alerts (reactive) and proactive threat discovery. LLM generates creative hypotheses that rule-based systems miss.

**Databricks-native problem**: **Hypothesis quality depends on context window**. The LLM needs to see enough recent alert context to generate useful hypotheses, but cramming too many alerts into the prompt reduces reasoning quality. We limit to the top 20 highest-severity alerts from the last hour.

---

### 04 Orchestrator (Supervisor)

| Property | Value |
|----------|-------|
| **Type** | SupervisorAgent (dual-mode) |
| **Batch mode** | `run_pipeline()` -- sequential/parallel stage execution |
| **Interactive mode** | `predict_messages()` -- LangGraph routing to sub-agents |
| **Output** | `orchestration_runs` table |

**Approach**: In batch mode, executes pipeline stages with ThreadPoolExecutor for parallel groups (e.g., Enrichment + SAGE run simultaneously). In interactive mode, uses LLM reasoning to decide which sub-agent to route a user query to, then synthesizes their responses.

**Why this approach**: The dual-mode design means the same orchestrator handles both scheduled SOC operations AND ad-hoc analyst questions. The LangGraph pattern (route-then-synthesize) is the Databricks-recommended approach for multi-agent systems.

**Databricks-native problem**: **Cold start latency for interactive mode**. If the Supervisor is deployed to a scale-to-zero Model Serving endpoint, the first query after idle takes 30-60 seconds to spin up. For SOC use cases where every second matters, we recommend `scale_to_zero_enabled: false` in production, which keeps a warm instance running.

---

### 05 SAGE (Security Analytics & Graphical Enrichment)

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint `0xdsi-sage-enrichment` |
| **Tools** | `lookup_ioc`, `get_asset_info`, `query_user_behavior`, `search_events` |

**Approach**: Multi-turn tool-calling agent that builds rich context narratives. Given an alert, SAGE queries behavioral baselines, network topology, and threat intel, then synthesizes a structured enrichment report with risk scoring.

**Why this approach**: Interactive (not batch) because enrichment depth varies per alert. Critical alerts need 5-6 tool calls; low-severity alerts need 1-2. The LLM decides how deep to go based on initial findings.

**Databricks-native problem**: **Tool call latency stacking**. Each UC Function call goes through SQL Warehouse, adding 200-500ms per call. With 5-6 tool calls in sequence, total latency reaches 2-3 seconds. Mitigation: the agent framework caches UC Function results within a session, and the Supervisor can pre-warm tool results before routing.

---

### 06 NOVA (Network Observation & Vulnerability Assessment)

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint `0xdsi-nova-investigation` |
| **Tools** | `search_events`, `get_asset_info`, `lookup_ioc`, `query_user_behavior` |

**Approach**: Kill-chain methodology investigation. Follows the Lockheed Martin Cyber Kill Chain (Recon, Weaponize, Deliver, Exploit, Install, C2, Actions) to build attack path hypotheses and validate them against event data.

**Why this approach**: Structured investigation methodology ensures completeness. Analysts can miss lateral movement steps; NOVA systematically checks each kill chain phase.

**Databricks-native problem**: **Kill chain scope requires broad data access**. NOVA needs to query events across multiple time ranges (days for C2 patterns, hours for exploit chains). Unity Catalog row-level security may restrict visibility. Mitigation: NOVA runs with a service principal that has read access to the full `events` table, bounded by temporal filters.

---

### 07 VANGUARD (Automated Response & Defense)

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint `0xdsi-vanguard-response` |
| **Tools** | `execute_response_action`, `get_alert_context`, `get_asset_info`, `create_case` |

**Approach**: Response orchestrator with human-in-the-loop. For high-confidence threats (score > 0.9), VANGUARD can auto-execute containment (block IP, isolate host). For medium-confidence, it creates a case and recommends actions for analyst approval.

**Why this approach**: Automated response requires extreme caution. The confidence threshold ensures only obvious threats get auto-contained. The `execute_response_action` UC Function logs every action to an immutable audit table, creating a complete chain of custody.

**Databricks-native problem**: **Response latency is critical**. When VANGUARD decides to block a C2 IP, the action must execute in seconds, not minutes. UC Function calls through SQL Warehouse add latency. Mitigation: high-priority response actions bypass the UC Function path and use a direct API call through the secrets manager. The UC Function is still called for audit logging after the fact.

---

### 08 CTI Attribution

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 15 minutes |
| **Input** | IOCs from recent alerts + threat intel feeds |
| **Output** | `cti_attribution_results` table |
| **Tools** | `lookup_ioc`, `search_events` |

**Approach**: Campaign attribution through TTP overlap analysis. Correlates IOCs across STIX/TAXII feeds, maps to known threat actor groups (APT28, Lazarus, etc.), and computes attribution confidence based on TTP overlap percentage.

**Why this approach**: Attribution helps prioritize response -- a Lazarus Group campaign targeting your sector requires different urgency than opportunistic scanning.

**Databricks-native problem**: **Threat intel feed freshness**. External STIX feeds are ingested via Delta Live Tables on a schedule. If feeds lag, attribution misses new campaigns. Mitigation: the agent checks feed freshness metadata and flags stale attributions with a `data_staleness_warning`.

---

### 09 Pattern Discovery

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 30 minutes |
| **Input** | Event streams (last 24h) |
| **Output** | `discovered_patterns` table |
| **Tools** | `search_events`, `query_user_behavior` |

**Approach**: Statistical anomaly detection + LLM explanation. Runs 4 anomaly detection queries (connection patterns, process executions, auth anomalies, traffic volume), computes Z-scores, then uses LLM to explain significant patterns in analyst-friendly language.

**Why this approach**: Rules catch known threats; pattern discovery catches unknown unknowns. The LLM explanation bridges the gap between "statistical anomaly" and "actionable finding."

**Databricks-native problem**: **Compute cost for statistical queries**. Scanning 24h of raw events for Z-score computation requires significant SQL Warehouse resources. Mitigation: queries use partitioned reads (`WHERE dt >= current_date - 1`) and pre-aggregated materialized views where possible.

---

### 10 Vector Memory

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 10 minutes |
| **Input** | New alerts, investigation notes, resolved incidents |
| **Output** | `agent_vector_memory` table |
| **Tools** | None (this agent IS the tool) |

**Approach**: Embedding-based agent memory. Generates vector embeddings for alert context, resolved investigations, and analyst decisions using the BGE embedding model via `mlflow.deployments`. Other agents query this memory for semantic similarity (deduplication, precedent lookup, pattern matching).

**Why this approach**: Agents need institutional memory. When a similar alert was seen 3 weeks ago and resolved as FP, the triage agent should know. Vector search enables this "have I seen this before?" capability.

**Databricks-native problem**: **Embedding endpoint throughput**. BGE embedding via Foundation Models has rate limits. Processing 500 new items at 10-item batches takes time. Mitigation: the agent prioritizes high-severity items, batches embeddings in groups of 20, and deduplicates (cosine similarity > 0.95) before inserting to avoid redundant entries.

---

### 11 Red Team

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Daily (off-hours) |
| **Input** | MITRE ATT&CK technique library + detection rules |
| **Output** | `red_team_simulations` table |
| **Tools** | `search_events` |

**Approach**: Adversary simulation and detection coverage validation. Generates attack simulation scenarios (Atomic Red Team-style), executes non-destructive probes, and checks whether existing detection rules fired.

**Why this approach**: Continuous validation ensures detection rules actually work. A rule might exist but never fire due to a misconfigured data source.

**Databricks-native problem**: **Cannot execute actual attack simulations from notebooks**. Databricks notebooks run in isolated cloud VMs with no network access to production infrastructure. The "simulation" is therefore a log-based replay: injecting synthetic events that mimic attack patterns, then verifying detection rules trigger. True active simulation requires an external attack framework (Caldera, Atomic Red Team) with results ingested back.

---

### 12 Blue Team

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Daily |
| **Input** | Detection rules + event coverage data |
| **Output** | `blue_team_assessments` table |
| **Tools** | `search_events`, `get_asset_info` |

**Approach**: Defense coverage gap analysis. Maps detection rules to MITRE ATT&CK matrix, identifies techniques without coverage, and calculates Mean Time To Detect (MTTD) per severity.

**Databricks-native problem**: None significant. Pure analytics workload well-suited to Spark.

---

### 13 Forensics

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | On-demand (triggered by high-severity cases) |
| **Input** | Open cases with severity >= high |
| **Output** | `forensic_collections`, `forensic_reports` tables |
| **Tools** | `search_events`, `get_alert_context` |

**Approach**: Automated evidence preservation. Collects all events related to a case, computes SHA256 integrity hashes, reconstructs timeline, and generates forensic report via LLM.

**Databricks-native problem**: **No access to raw disk/memory forensics**. Databricks can only collect log-level evidence (events, network flows, authentication records). Deep forensics (memory dumps, disk images, registry hives) requires endpoint agents (CrowdStrike, SentinelOne) with results ingested into Delta tables. The agent works with what's available in the lakehouse.

---

### 14 Honeypot

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes |
| **Input** | Honeypot interaction events |
| **Output** | `honeypot_detections` table |
| **Tools** | `lookup_ioc`, `search_events` |

**Approach**: Classifies honeypot interactions as automated scans vs. targeted attacks using interaction complexity scoring and IOC correlation.

**Databricks-native problem**: **Honeypot infrastructure lives outside Databricks**. The actual honeypots (SSH, HTTP, SMB traps) run on separate infrastructure. Events are ingested into Delta via streaming. If ingestion lags, detection lags. Mitigation: the agent monitors ingestion freshness and alerts on gaps > 5 minutes.

---

### 15 CISO Assistant

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint `0xdsi-ciso-assistant` |
| **Tools** | `search_events`, `get_alert_context`, `query_user_behavior`, `lookup_ioc`, `get_asset_info` |

**Approach**: Strategic security advisor for executives. Translates technical findings into business impact language. Formats responses for C-level consumption (clear, concise, risk-focused).

**Why this approach**: CISOs don't want raw alert data -- they want "what does this mean for the business?" The agent bridges that translation gap.

**Databricks-native problem**: **Context window vs. organizational knowledge**. The CISO agent needs awareness of business context (revenue per system, regulatory requirements, board priorities) that isn't in event data. Mitigation: a dedicated `organizational_context` table stores business metadata that the agent queries via the `get_asset_info` tool (which includes business_impact and data_classification fields).

---

### 16 Playbook Generator

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint |
| **Tools** | `search_events`, `get_alert_context`, `get_asset_info` |

**Approach**: Generates SOAR-compatible incident response playbooks with decision trees, automation hooks, and step-by-step procedures for 6 incident types.

**Databricks-native problem**: **SOAR integration requires external API calls**. Generated playbooks need to be pushed to SOAR platforms (Palo Alto XSOAR, Splunk SOAR). This requires outbound API calls from Model Serving, which are supported but require network configuration (VPC peering or Private Link).

---

### 17 Incident Summarizer

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint |
| **Tools** | `get_alert_context`, `search_events`, `query_user_behavior`, `lookup_ioc` |

**Approach**: Dual-audience summarization. Produces executive summary (3 sentences, business impact) and technical summary (full timeline, IOCs, TTPs, STIX format).

**Databricks-native problem**: None significant. Pure LLM reasoning with tool-augmented context retrieval.

---

### 18 Document Analyzer

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint |
| **Tools** | `lookup_ioc` |

**Approach**: Extracts security-relevant information from documents (threat briefs, vulnerability advisories, audit reports). Returns structured extractions: IOCs, CVEs, threat actors, TTPs.

**Databricks-native problem**: **No native PDF parsing in Model Serving**. The agent expects pre-extracted text (not raw PDFs). Document preprocessing (OCR, PDF-to-text) must happen upstream in an ingestion pipeline before the agent sees it. Mitigation: a companion ingestion notebook extracts text from documents stored in Unity Catalog Volumes.

---

### 19 Malware Sandbox

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint |
| **Tools** | `lookup_ioc`, `search_events` |

**Approach**: Behavioral malware analysis. Analyzes sandbox execution reports (file behavior, network IOCs, persistence mechanisms) and generates YARA rules.

**Databricks-native problem**: **Cannot execute actual malware**. Databricks is not a sandbox execution environment. The agent analyzes pre-generated sandbox reports (from tools like Any.run, Joe Sandbox, or CuckooSandbox) that are ingested into Delta. The LLM reasons about behavioral artifacts, it does not run the malware.

---

### 20 LLM Guardrails

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes |
| **Input** | `llm_usage_logs` table |
| **Output** | `llm_guardrail_violations` table |

**Approach**: Monitors all organizational LLM interactions for prompt injection, PII leakage, jailbreak attempts, and policy violations.

**Databricks-native problem**: **Self-referential monitoring**. This agent uses an LLM to detect LLM misuse, creating a recursive dependency. If the LLM being monitored is the same one doing monitoring, a sophisticated attacker could craft prompts that also fool the monitor. Mitigation: the guardrails agent uses a different model endpoint than the one being monitored (Llama 3.1 70B monitors usage of Llama 3.1 8B, or vice versa).

---

### 21 Model Poisoning Guard

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Hourly |
| **Input** | Model serving inference tables, training logs |
| **Output** | `model_integrity_checks` table |

**Approach**: Statistical drift detection on model predictions. Compares current distribution to baseline using Z-scores on key metrics (confidence, output distribution, latency).

**Databricks-native problem**: **Baseline establishment requires historical data**. On first deployment, there is no baseline. The agent uses a 7-day warm-up period where it only collects metrics without alerting. After warm-up, the rolling 30-day baseline is used for drift detection.

---

### 22 Threat Simulator

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint `0xdsi-threat-simulator` |
| **Tools** | `search_events`, `lookup_ioc`, `get_asset_info` |

**Approach**: Interactive adversary emulation planner. Given an infrastructure description, generates multi-stage attack simulation plans with expected detection points and coverage gaps.

**Databricks-native problem**: Same as Red Team (Agent 11) -- cannot execute simulations, only plan them. The actual execution requires external tooling.

---

### 23 Connector Health

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 15 minutes |
| **Input** | `data_connector_configs` table |
| **Output** | `connector_health_checks` table |

**Approach**: Monitors data source health by checking last-received timestamps, gap durations, and schema drift.

**Databricks-native problem**: **Indirect health detection only**. The agent cannot ping external sources (Splunk, CrowdStrike, Azure Sentinel) from a notebook. It infers health from data freshness in Delta tables. If a connector is down but the last batch was recent, there's a detection blind spot until the next expected batch is missed.

---

### 24 Threat Radar

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint `0xdsi-threat-radar` |
| **Tools** | `lookup_ioc`, `search_events`, `get_asset_info`, `query_user_behavior` |

**Approach**: Real-time threat landscape awareness. Correlates external threat feeds with internal telemetry to assess organizational exposure to emerging threats.

**Databricks-native problem**: **"Real-time" is relative**. External threat feeds are batch-ingested (every 15-30 minutes). The agent cannot subscribe to live feeds from Model Serving. True real-time awareness requires the ingestion pipeline to have low latency, which depends on Autoloader/Delta Live Tables configuration.

---

### 25 ALHF (Active Learning from Human Feedback)

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Daily |
| **Input** | Analyst feedback on triage decisions |
| **Output** | `alhf_feedback_patterns` table |

**Approach**: Identifies patterns in analyst overrides (when analysts disagree with automated triage). Generates updated classification rules from accumulated feedback.

**Databricks-native problem**: **No online learning loop**. Databricks does not support real-time model updates from feedback. The learning loop is batch: collect feedback, identify patterns, generate rules, apply rules in next cycle. The gap between feedback and rule application is 24 hours. For faster adaptation, the rules would need to be deployed to a Feature Serving endpoint.

---

### 26 Real-Time Graph CEP

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes |
| **Input** | Event streams (entities and relationships) |
| **Output** | `graph_cep_detections` table |

**Approach**: Maintains a NetworkX graph of entity relationships (user -> device -> IP -> domain). Detects anomalies: new edges (never-before-seen connections), centrality shifts (entity suddenly becomes a hub), unusual path lengths.

**Databricks-native problem**: **Graph state does not persist between runs**. NetworkX graphs are in-memory. Each 5-minute run must rebuild the graph from Delta tables, which adds startup latency. For a graph with 100K edges, rebuild takes 10-15 seconds. Mitigation: the agent maintains a Delta table of edges and only processes the incremental diff since last run. True streaming graph would require Apache TinkerPop or Neo4j integration.

---

### 27 Vector Scoring

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 10 minutes |
| **Input** | Entity behavior vectors |
| **Output** | `vector_threat_scores` table |

**Approach**: Computes behavior vectors from entity activity (login times, data volumes, process patterns) and scores them against known-bad pattern embeddings using cosine similarity.

**Databricks-native problem**: **Embedding computation at scale**. Computing embeddings for all active entities every 10 minutes requires significant Foundation Model throughput. Mitigation: incremental processing -- only entities with new activity get re-scored.

---

### 28 AI Correlation

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 15 minutes |
| **Input** | Recent alerts + events |
| **Output** | `ai_correlation_discoveries` table |

**Approach**: Uses LLM to discover correlations that human-written rules miss. Presents recent alerts to the LLM and asks it to identify non-obvious connections, then validates each suggested correlation against event data.

**Databricks-native problem**: **LLM hallucination risk**. The LLM may "discover" correlations that are coincidental, not causal. Mitigation: every LLM-suggested correlation must pass a statistical validation step (the suggested events must actually co-occur more than random chance). A minimum confidence threshold of 0.7 filters out hallucinated correlations.

---

### 29 Connector Version Agent

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Daily |
| **Input** | `data_connector_configs` table |
| **Output** | `connector_version_checks` table |

**Approach**: Checks connector versions against a known-good registry, identifies deprecated versions, breaking changes, and upgrade risks.

**Databricks-native problem**: **No access to external registries from notebooks**. The agent cannot check PyPI, GitHub, or vendor APIs for latest versions. Mitigation: an ingestion pipeline periodically fetches version metadata from external sources into a `connector_registry` Delta table that this agent reads.

---

### 30 Stateful Backdoor Defense

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes |
| **Input** | Network flow events (src_ip, dst_ip, timestamp, bytes) |
| **Output** | `backdoor_detections` table |

**Approach**: Detects slow-and-low C2 beaconing using statistical timing analysis. Computes inter-arrival time distributions, jitter coefficients, and beacon periodicity across multi-day windows.

**Databricks-native problem**: **Long-window state management**. Detecting a beacon with a 4-hour interval requires state spanning days of data. Spark is not optimized for per-connection stateful processing across long windows. Mitigation: pre-aggregate connection pairs into the `connection_state` table (src_ip, dst_ip, connection_timestamps[]), then analyze the timestamp arrays in a second pass using Python UDFs.

---

### 31 Vibe Connector Builder

| Property | Value |
|----------|-------|
| **Type** | InteractiveAgent |
| **Deployment** | Model Serving endpoint |
| **Tools** | `search_events` |

**Approach**: Generates data connector code from natural language descriptions. User describes a data source, agent generates Python/SQL connector code, config templates, schema mappings, and validation rules.

**Databricks-native problem**: **Generated code cannot be auto-deployed**. The agent generates code but cannot deploy it to a running cluster. Deployment requires a separate CI/CD pipeline (DAB bundle or manual notebook upload). The agent outputs ready-to-deploy code that a human or CI system must push.

---

### 32-37 Glasswing Vulnerability Pipeline

| Agent | Function | Output Table |
|-------|----------|-------------|
| 32 Vector Search Index | Maintains embedding indexes | `vector_index_status` |
| 33 Glasswing Ingest | Ingests scanner results (Qualys, Tenable, Rapid7) | `vulnerability_findings` |
| 34 Glasswing Dedup | Deduplicates across scanners | `vulnerability_canonical` |
| 35 Glasswing Reachability | Assesses exposure from attack surface | `vulnerability_reachability` |
| 36 Glasswing Blast Radius | Maps lateral movement impact | `vulnerability_blast_radius` |
| 37 Glasswing Auto-Patch | Generates patch recommendations | `patch_recommendations` |

**Pipeline flow**: 33 (Ingest) -> 34 (Dedup) -> 35 (Reachability) -> 36 (Blast Radius) -> 37 (Auto-Patch)

**Databricks-native problem**: **Scanner integration is ingestion-dependent**. Qualys/Tenable/Rapid7 results must be exported and ingested into Delta. There is no native Databricks connector for these scanners. Mitigation: the ingest agent reads from a staging table that is populated by external ETL (Lambda functions, Azure Data Factory, or custom scripts writing to cloud storage that Autoloader picks up).

**Databricks-native problem (Dedup)**: **Semantic dedup requires embedding endpoint**. The dedup agent uses embeddings to detect fuzzy-duplicate vulnerabilities (same vuln described differently by different scanners). This requires the BGE embedding endpoint to be available. If the endpoint is cold, first dedup run after deploy may time out.

---

### 38 Session List Manager

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes |
| **Output** | `session_anomalies` table |

**Approach**: Tracks active sessions and detects anomalies (impossible travel, concurrent sessions from different geolocations, session hijacking patterns).

**Databricks-native problem**: **Session state is approximated**. Real session state lives in identity providers (Okta, Azure AD). The agent reconstructs sessions from authentication events in Delta, which may miss session invalidations or token refreshes not captured in logs.

---

### 39 Active List Manager

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 5 minutes |
| **Output** | `active_list_changes` table |

**Approach**: Manages dynamic lists (watchlists, whitelists, blocklists) with TTL-based expiration and behavioral signal-driven promotion/demotion.

**Databricks-native problem**: **No real-time list enforcement**. Changes to active lists take effect on the next pipeline cycle (5 min). If an IP is added to the blocklist, existing connections are not terminated immediately -- only new alerts referencing that IP will match. True real-time enforcement requires firewall/WAF integration.

---

### 40 LLM Risk Profiler

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Daily |
| **Output** | `llm_risk_profiles` table |

**Approach**: Profiles organizational LLM usage for risk (sensitive data in prompts, shadow AI, excessive consumption). Generates per-user and per-department risk scores.

**Databricks-native problem**: **Privacy considerations**. Scanning employee LLM prompts for risk requires careful governance. The agent must operate under strict access controls (only security team sees results). Unity Catalog RLS policies must restrict profile access to authorized security personnel only.

---

### 41 Glasswing Scanner Orchestrator

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every hour |
| **Output** | `scan_orchestration_log` table |

**Approach**: Schedules and monitors vulnerability scans across infrastructure.

**Databricks-native problem**: **Cannot trigger external scanners directly**. The agent manages scheduling logic but cannot invoke Qualys/Tenable APIs from a notebook without outbound network access. Mitigation: uses a webhook pattern -- writes scan requests to a Delta table that an external orchestrator (Lambda/Azure Function) polls and executes.

---

### 42 Knowledge Store

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Every 30 minutes |
| **Output** | `knowledge_entries` table |

**Approach**: Indexes resolved incidents, runbooks, and analyst notes into a searchable knowledge base with embeddings for semantic retrieval.

**Databricks-native problem**: **Knowledge freshness lag**. Analyst notes written in external systems (Jira, Confluence, ServiceNow) must be ingested before they appear in the knowledge store. The lag between an analyst writing a note and it being queryable by other agents depends on external connector refresh rates.

---

### 43 Guardian Compliance

| Property | Value |
|----------|-------|
| **Type** | BatchAgent |
| **Runs** | Daily |
| **Output** | `compliance_findings` table |

**Approach**: Maps security controls to compliance frameworks (SOC2, ISO 27001, PCI-DSS, HIPAA, NIST). Identifies gaps by checking evidence availability for each control.

**Databricks-native problem**: **Compliance evidence spans systems outside Databricks**. Many SOC2/ISO controls require evidence from HR systems, physical security, vendor management, etc. The agent can only validate controls for which evidence exists in Delta. Mitigation: a `control_evidence_mapping` table explicitly defines which controls can be auto-validated and which require manual attestation.

---

## Deployment Architecture

### Model Serving Endpoints (Interactive Agents)

```yaml
# app.yml - Deployed via DAB bundle
model_serving_endpoints:
  ciso_assistant:     { endpoint: "0xdsi-ciso-assistant", scale_to_zero: true }
  sage_enrichment:    { endpoint: "0xdsi-sage-enrichment", scale_to_zero: true }
  nova_investigation: { endpoint: "0xdsi-nova-investigation", scale_to_zero: true }
  vanguard_response:  { endpoint: "0xdsi-vanguard-response", scale_to_zero: false }  # always hot
  threat_simulator:   { endpoint: "0xdsi-threat-simulator", scale_to_zero: true }
  threat_radar:       { endpoint: "0xdsi-threat-radar", scale_to_zero: true }
```

### Workflow Jobs (Batch Agents)

| Schedule | Agents |
|----------|--------|
| Every 5 min | 01 Triage, 14 Honeypot, 20 Guardrails, 26 Graph CEP, 30 Backdoor, 38 Session, 39 Active Lists |
| Every 10 min | 02 Enrichment, 10 Vector Memory, 27 Vector Scoring |
| Every 15 min | 03 Hunter, 08 CTI, 23 Connector Health, 24 Radar, 28 AI Correlation |
| Every 30 min | 09 Pattern Discovery, 42 Knowledge Store |
| Every hour | 33-37 Glasswing Pipeline, 41 Scanner |
| Daily | 11 Red Team, 12 Blue Team, 21 Model Poisoning, 25 ALHF, 29 Versions, 40 Risk Profiler, 43 Compliance |
| On-demand | 13 Forensics |

---

## Common Databricks-Native Limitations (Cross-Cutting)

### 1. No True Real-Time Streaming Agents

Databricks notebooks execute in batch micro-windows. The minimum practical scheduling interval is 1 minute (for Triggered Streaming), with most agents running every 5 minutes. Sub-second response times require a dedicated streaming framework (Flink, Kafka Streams) external to Databricks.

### 2. UC Function Call Overhead

Every UC Function tool call goes through SQL Warehouse, adding 200-500ms of latency. Agents with 5+ tool calls per inference can accumulate 1-3 seconds of pure overhead. This is acceptable for batch agents but noticeable for interactive ones.

### 3. Foundation Model Rate Limits

Databricks Foundation Models have per-endpoint rate limits (tokens per minute). During alert storms, multiple agents competing for the same endpoint can cause throttling. Mitigation: token budgets per agent and the fallback endpoint pattern (primary -> smaller model).

### 4. No Persistent Agent State Between Runs

Each notebook run starts fresh. Agent "memory" must be explicitly persisted to Delta tables and re-loaded. This adds I/O overhead but provides full auditability (every state change is versioned by Delta time travel).

### 5. Cold Start for Scale-to-Zero Endpoints

Model Serving endpoints configured with `scale_to_zero: true` take 30-60 seconds to wake up after idle periods. For SOC use cases, critical agents (VANGUARD) should disable scale-to-zero.

### 6. Network Isolation

Databricks notebooks run in managed VPCs. Outbound calls to external APIs (VirusTotal, Shodan, external SIEM) require Private Link, VPC peering, or explicit firewall rules. Agents that need external data rely on pre-ingested Delta tables rather than direct API calls.
