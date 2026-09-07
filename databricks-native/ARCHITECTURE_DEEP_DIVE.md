# 0xDSI Agentic SOC — `databricks-native` Deep Architecture Reference

> **Scope.** This document explains **every asset** under `databricks-native/` — the shared
> framework, all agent notebooks, analytics/correlation/detection/ML engines, the ingestion
> and medallion pipelines, the Memory-Cache RNN model lifecycle, operations, response,
> setup/seed notebooks, the deployment bundle, and the hosted app — and **how they interact
> with each other and with external systems** (Ray.io, the 0xDSI-CET engine, NetworkX,
> GraphFrames, MLflow, PyTorch, Databricks Vector Search, Kafka/ZeroBus, Supabase, and the
> Foundation Model API).
>
> **Bundle name:** `0xdsi-agentic-soc`. **Default catalog/schema:** `soc_platform.agentic_soc`
> (ML tables under `security_catalog.ml`; AI-governance / red-team / UEBA agents use
> `security_lakehouse.*`).

---

## 0. The 30,000-foot picture

The platform is a **Security Operations Center (SOC) built natively on the Databricks
Lakehouse**. It follows a **medallion architecture** (Bronze → Silver → Gold) and layers on
top of it three cooperating "brains":

1. **A fleet of ~55 agent notebooks** (triage, enrichment, hunting, response, red/blue team,
   AI-governance, vuln management, graph/vector memory) — orchestrated by a supervisor agent
   and gated by a Delta-table control plane.
2. **A statistical/graph detection stack** — CEP (Complex Event Processing), the CET
   (Complete Event Trend) engine, KS-adaptive thresholds, entity resolution, and an
   evidence-fusion decision layer.
3. **Two machine-learning lifecycles** — a **Ray-on-Databricks distributed SLM** that learns
   the *grammar* of normal machine-identity event sequences, and a **PyTorch Memory-Cache RNN
   (MC-RNN)** that gives long-range, explainable UEBA anomaly detection.

Everything is deployed as a **Databricks Asset Bundle (DAB)** — a FastAPI-hosted React app,
60+ Workflows jobs, and 2 Delta Live Tables pipelines — querying Unity Catalog through a
Serverless SQL Warehouse with **zero external egress**.

### Data-flow spine (one line)

```
edge/ingestion → Bronze events → Silver (OCSF) → Gold analytics
      → [ agents + CET/CEP detection + MC-RNN + SLM ] → alerts/cases
      → response/notification/ticketing → ops keeps it all healthy
```

---

## 1. `_shared/` — the framework backbone

Every notebook begins with `%run ../_shared/bootstrap`. That one line assembles the whole
stack into the notebook's namespace. These modules are the *contract* the rest of the
platform is written against.

| File | Role | Key exports | External deps |
|------|------|-------------|---------------|
| **bootstrap.py** | The "run-me-first" entry point. Fixes `sys.path`, imports every sibling module, and instantiates the global singletons. | `cfg`, `llm`, `mon`, `secrets_mgr`, `qb(table)` factory, `require_enabled(agent)`, `require_tables(*names)` | stdlib only (re-exports the rest) |
| **config.py** | Central config resolver. Reads Databricks widgets + the `system_settings` Delta table into an immutable config object. | `SOCConfig` dataclass, `load_config()`, `activate_catalog()`, `get_table_path()`, `get_checkpoint_path()`, `is_agent_enabled()` | stdlib only |
| **agent_framework.py** | Base classes implementing the **Databricks Mosaic AI Agent Framework** — MLflow ChatModel, MLflow Tracing, UC-Function tools, LangGraph-style supervisor. | `BaseAgent`, `BatchAgent`, `InteractiveAgent`, `SupervisorAgent`, `AgentResult`, `UCTool`, `create_soc_tools()` | lazy `mlflow`, `mlflow.deployments` |
| **llm_client.py** | The **single LLM gateway** — retry, model fallback, JSON extraction, token budgeting, specialized endpoint routing. Zero data egress (all models Databricks-hosted). | `SOCLLMClient` (`.chat`, `.chat_multi_turn`, `.analyze_communication`, `.embed_text`, `.extract_json`), `LLMResponse`, `TokenBudget` | lazy `mlflow.deployments` |
| **delta_helpers.py** | Guardrailed Delta writes — safe MERGE/UPSERT/append/overwrite-partition, schema evolution, dedup, OPTIMIZE/ZORDER/VACUUM, streaming helpers. | `safe_append`, `safe_merge`, `safe_overwrite_partition`, `streaming_append`, `streaming_foreach_batch`, `add_metadata_columns` | **PySpark** |
| **monitoring.py** | Observability + audit. Structured event logging to Delta, metric buffering, timing. | `Monitor` (`.log_event`, `.log_start/complete`, `.log_detection`, `.time()`), writes `notebook_audit_events`, `notebook_metrics`, `pipeline_health` | **PySpark** |
| **sdp_stream.py** | **Streaming Detection Pipeline** builder — a pre-configured Kafka `readStream` straight from **ZeroBus**, bypassing Delta latency for sub-second detection, with automatic Delta fallback. | `create_sdp_stream()`, `create_sdp_stream_with_fallback()`, `ZEROBUS_EVENT_SCHEMA` | **PySpark** + Kafka connector |
| **secrets.py** | Secret-scope abstraction with a known-secret registry (Kafka, threat-intel APIs, response tools, cloud, sandbox, GeoIP). | `SecretsManager` (`.get`, `.get_optional`, `.require`), `KNOWN_SECRETS`, `SecretRef` | Databricks `dbutils.secrets` |
| **sql_safe.py** | Mandatory SQL-injection defense for any dynamically built query. | `QueryBuilder` (fluent `qb()`), `safe_identifier`, `safe_value`, `build_insert`, `build_update` | stdlib only |
| **__init__.py** | Documentation-only signpost describing the two import patterns. Exports no symbols. | — | — |

### How `_shared` ties the platform together

- **`config` is the root of the dependency graph.** Every other module takes a `SOCConfig`:
  the LLM client reads endpoints from it, the monitor reads catalog/schema/tags, the secrets
  manager reads the scope, and `get_table_path(cfg, name)` produces every three-part table
  name used everywhere.
- **Control-plane by Delta table.** `is_agent_enabled` (reads `agent_configs`) +
  `require_enabled(agent)` let operators disable any agent centrally; `require_tables(...)`
  fails fast on missing prerequisites. Enable/disable and tuning live in **Delta, not code**.
- **Uniform lifecycle.** `mon.log_start()` (bootstrap) → `mon.log_event/log_detection/time`
  during work → `mon.log_complete()` flushes buffered audit rows and updates `pipeline_health`.
- **Safety by construction.** No notebook hand-writes SQL (use `qb()`), calls the model API
  directly (use `llm`), or writes Delta unguarded (use `delta_helpers`).

---

## 2. External systems and where they plug in

| External system | What it is | Where it is used in this repo |
|-----------------|-----------|-------------------------------|
| **Ray.io** (`ray.util.spark`, `ray.train.torch`) | Distributed-computing framework. Stands up a Ray cluster **on Spark workers** and runs data-parallel PyTorch training with DDP/NCCL all-reduce. | `ml_training/07_ray_slm_distributed_training.py` — trains the 124M-param CET Small Language Model across 8 workers × A100 GPUs. Streams live telemetry to Supabase for the app's "Ray Training Theater." |
| **0xDSI-CET engine** (`git+…/0xDSI-CET`) | Native C/Python **Complete Event Trend** engine — M-CET/T-CET/H-CET strategy family, standing queries, temporal knowledge graph, additive explainable risk scorer, retraction support. | `analytics/07_cet_native_bridge.py` optionally swaps it in for the built-in GraphFrames engine; falls back to `analytics/01` when absent. |
| **NetworkX** | In-memory graph library. | `agents/26_realtime_graph_cep.py` maintains a **persistent driver-side NetworkX entity graph** (user→device→IP→domain), updated incrementally per micro-batch, for centrality-drift / fan-out / dense-subgraph CEP. Chosen over GraphFrames for dynamic incremental updates. |
| **GraphFrames** | Spark's distributed graph library (motif finding, connected components). | `analytics/01_trend_engine_cet.py` (Kleene multi-hop motif matching), `analytics/03_chronoweave.py`, `analytics/04_financial_threat_intel.py` (community detection). |
| **MLflow** | Experiment tracking, model registry, tracing, model serving, deployments client. | Pervasive: LLM client + agent framework tracing/metrics; every ML-training notebook registers models; interactive agents deploy as ChatModels. |
| **PyTorch** (+ einops) | Deep-learning framework. | The Ray SLM (`ml_training/07`) and the entire `memory_cache/` MC-RNN lifecycle. |
| **Databricks Vector Search** (`databricks.vector_search`) | Managed ANN vector index. | `agents/32`, `agents/59`, `agents/61`, `analytics/03_chronoweave`, `detection/07_ks_recall_lens`, `ml_training/04_graphrag_zero_day`. |
| **Kafka / ZeroBus / Event Hubs / Kinesis** | Streaming event transports. | `_shared/sdp_stream.py`, `ingestion/01`, `ingestion/05`. |
| **Foundation Model API** (Llama 3.1 70B/8B, DBRX, GTE-large, BGE-large) | Databricks-hosted LLMs + embeddings. | All LLM/embedding work routes through `_shared/llm_client.py`. Zero egress. |
| **Supabase** | The Postgres backend that the *main* app uses; also the sink for Ray training telemetry. | `ml_training/07` streams `dslm_ray_*` rows to Supabase REST; the app's Ray Training Theater reads them. The Databricks app replaces Supabase with a SQL-Warehouse shim (§9). |
| **Databricks SDK / SQL Connector / DLT / Workflows / Model Serving / Apps** | The Lakehouse platform primitives. | The deployment bundle (§8) and the FastAPI backend (§9). |

---

## 3. `agents/` — the agent fleet (~55 notebooks)

All agents `%run ../_shared/bootstrap` and subclass `BatchAgent` (scheduled), `InteractiveAgent`
(chat / model-serving endpoint) or `SupervisorAgent` (orchestration). Tools are Unity Catalog
functions (`UCTool`) from `create_soc_tools`. MLflow tracing is pervasive.

### 3.1 Core pipeline: triage → enrichment → hunt → orchestrate

| File | Role |
|------|------|
| **01_triage_agent** | L1 triage. Classifies alerts TRUE / FALSE_POSITIVE / NEEDS_INVESTIGATION via a rule-based fast path + LLM slow path; auto-closes at confidence ≥ 0.95. Pipeline entry. |
| **02_enrichment_agent** | Enriches triaged alerts with IOC/threat-intel matches, asset context, related events + network flow, and an LLM risk narrative → composite `enrichment_score`. |
| **03_threat_hunter_agent** | LLM generates 3–5 hunt hypotheses from high/critical alerts + active IOCs, builds/runs SQL hunts, scores confirmed/refuted → `threat_hunt_results`. |
| **04_orchestrator** | `SupervisorAgent`. LangGraph-style routing, dependency chains, parallel groups (`ThreadPoolExecutor`), retry/backoff, circuit breakers. Runs batch (`notebook.run`) or interactive endpoints. |

### 3.2 Named interactive specialists

| File | Role |
|------|------|
| **05_sage_enrichment** | **SAGE** — interactive enrichment specialist (IOC correlation, asset info, behavior baseline, structured narratives). |
| **06_nova_investigation** | **NOVA** — deep investigation: timeline reconstruction, kill-chain/attack-path, lateral-movement detection. |
| **07_vanguard_response** | **VANGUARD** — response orchestrator. Recommends/executes containment with confidence thresholds (>0.90 auto, 0.70–0.90 human approval, <0.70 reject) + chain of custody. |
| **08_cti_attribution** | Cross-correlates IOCs across feeds; LLM maps IOCs/TTPs to threat-actor groups/campaigns → `cti_attribution_results`. |
| **15_ciso_assistant** | Executive advisor — translates telemetry into board-level risk briefings and compliance guidance. |
| **24_threat_radar** | Threat-intel analyst tracking emerging threats and org exposure. |

### 3.3 Analytics / learning / memory

| File | Role |
|------|------|
| **09_pattern_discovery** | Statistical anomaly discovery (z-score / isolation-forest) outside existing rules; LLM proposes rule candidates → `discovered_patterns`. |
| **10_vector_memory** | Persistent agent memory. Embeds context (MLflow embeddings) into `agent_vector_memory`; exposes `APPROX_NEAREST_NEIGHBORS` semantic search for dedup/pattern matching. |
| **25_alhf_learning** | Active Learning from Human Feedback — mines analyst corrections → updated classification rules → `alhf_feedback_patterns`. |
| **27_vector_scoring** | Vector-based threat scoring — behavior vectors vs known-bad embeddings → `vector_threat_scores`. |
| **28_ai_correlation** | LLM discovers cross alert/event correlations analysts miss → `ai_correlation_discoveries`. |

### 3.4 Red / blue / forensics / deception + analyst copilots

| File | Role |
|------|------|
| **11_red_team** | Adversary simulation (Atomic Red Team / CALDERA); correlates executed techniques vs detections for real MITRE ATT&CK coverage gap analysis. |
| **12_blue_team** | Defensive validation — coverage vs the ATT&CK matrix, MTTD per severity (Spark `Window`). |
| **13_forensics** | Evidence collection, SHA256 chain-of-custody, timeline reconstruction, LLM forensic reports. |
| **14_honeypot** | Honeypot/honeytoken monitoring; classifies scan vs targeted; appends high-fidelity alerts. |
| **16_playbook_generator** | On-demand IR playbooks (SOAR-compatible). |
| **17_incident_summarizer** | Executive + technical incident summaries with business-impact scoring. |
| **18_document_analyzer** | Extracts security-relevant info from PDFs / reports / threat briefs. |
| **19_malware_sandbox** | Behavioral malware analysis → YARA-compatible rules. |
| **22_threat_simulator** | Interactive adversary-emulation planner over ATT&CK. |

### 3.5 AI / LLM security & guardrails

| File | Role |
|------|------|
| **20_llm_guardrails** | Monitors LLM usage for prompt injection / PII leakage / jailbreak → `llm_guardrail_violations`. |
| **21_model_poisoning_guard** | ML model-integrity monitor — drift, data poisoning, prediction anomalies → `model_integrity_checks`. |
| **40_llm_risk_profiler** | Per-user/department LLM-usage risk (sensitive data, excessive tokens, shadow AI) → `llm_risk_profiles`. |
| **56_ai_gateway_guardian** | AI-Gateway policy enforcement (`security_lakehouse.ai_*`) — 10-technique jailbreak taxonomy, behavioral drift, UEBA correlation. |
| **57_shadow_ai_detector** | Detects unauthorized AI use — DNS/provider-domain analysis, cert inspection, token-volume spikes. |
| **58_prompt_forensics_indexer** | Indexes all AI-gateway traffic (HashingTF/IDF), per-session drift, cost attribution, conversation-trajectory insider-threat analysis. |

### 3.6 Graph / vector infrastructure

| File | Role |
|------|------|
| **26_realtime_graph_cep** | **NetworkX** driver-side entity graph, incrementally updated per micro-batch from `events` (Delta CDF); detects centrality drift, new edges, fan-out, dense subgraphs; TTL edge decay → `graph_cep_detections`, `alerts`, `graph_cep_baseline`. |
| **32_vector_search_index** | Vector Search index manager for the Glasswing vuln pipeline (`VectorSearchClient` + BGE embeddings). |
| **59_vector_pattern_similarity** | Cosine similarity of current patterns vs historical attack embeddings → `gold_vector_pattern_matches` (feeds Attack Universe). |
| **61_graph_vector_index** | Builds/syncs the delta-sync `graph_neighborhood_index` over 128-dim embeddings from `ml_training/06`. |

### 3.7 Connectors / edge management

| File | Role |
|------|------|
| **23_connector_adapter** | Connector health — staleness, data gaps, schema drift + LLM remediation. |
| **29_connector_version_agent** | Connector version/compatibility tracking → `connector_version_checks`. |
| **31_vibe_connector_builder** | Natural-language → connector code generator (REST/DB/FS/MQ/cloud). |
| **49_edge_control_plane** | Edge-collector lifecycle — registration/token validation, heartbeat, desired-state sync, rolling upgrades (~30s). |

### 3.8 Stateful / behavioral detection & lists

| File | Role |
|------|------|
| **30_stateful_backdoor_defense** | Stateful C2/beacon detection — state machines over long windows with jitter/periodicity analysis → `backdoor_detections`. |
| **38_session_list_manager** | Session tracking — impossible travel, concurrent sessions, hijacking → `session_anomalies`. |
| **39_active_list_manager** | Dynamic watchlists/blocklists with TTL auto-expiry + audit → `active_list_changes`. |
| **48_ueba_entity_onboarding** | UEBA entity onboarding — bulk import, IdP sync (Azure AD/Okta/Google), HR merge, dedup into `entity_spine`. |

### 3.9 Glasswing vulnerability pipeline (bronze → gold)

Sequential vuln-management arm; each stage a `BatchAgent` gated by `require_enabled`.

| File | Role |
|------|------|
| **33_glasswing_ingest** | Ingest Qualys/Tenable/Rapid7 scan results → common CVE schema, dedup. Pipeline entry. |
| **34_glasswing_dedup** | Cross-scanner semantic dedup → canonical vuln entries with confidence. |
| **35_glasswing_reachability** | Reachability analysis vs network topology / firewall zones (DMZ/Internal/Trusted). |
| **36_glasswing_blast_radius** | Maps trust relationships / lateral-movement paths; scores impact by asset criticality. |
| **37_glasswing_auto_patch** | LLM patch-compatibility, priorities, maintenance windows, rollback plans. |
| **41_glasswing_scanner** | Scanner **orchestrator** — schedules/queue, health, aggregation → `scans_table`, `vulns_table`. |
| **45_exploitforge** | Exploit-chain feasibility via LLM progressive-primitive-escalation reasoning over `gold_vulnerabilities` + feeds. |

### 3.10 OT/ICS, autonomous response, forecasting, insider-threat, knowledge/compliance

| File | Role |
|------|------|
| **44_ot_protocol_security** | OT/ICS protocol anomaly monitor — behavioral baselines (Spark `Window`) + LLM, mapped to ATT&CK for ICS. |
| **47_autonomous_response_learner** | RL agent (Apple AISec '22 design) that learns *when* to act — percentile-bucket state, 4 abstract actions, high-avoidance Q-updates. Consumes Agent 07's alert stream. |
| **60_attack_path_forecaster** | Combines Monte Carlo forecasts + vector similarity (Agent 59) → ranked predicted paths → `gold_attack_path_predictions`; streams to Attack Universe via Delta Sharing. |
| **53_phishing_campaign_engine** | Red-team phishing — correlates Big Five / Dark Triad susceptibility (UEBA) with actor TTP emulation (APT29, Lazarus, Scattered Spider, FIN7). |
| **55_phishing_response_analyzer** | Processes campaign interactions (click/credential/report) and recomputes per-user vulnerability. Closes the loop with 53. |
| **42_knowledge_store** | Org knowledge base — indexes incidents/runbooks/notes with embeddings; RAG retrieval for other agents → `knowledge_entries`. |
| **43_guardian_compliance** | Multi-framework compliance (SOC2/ISO27001/PCI-DSS/HIPAA/NIST) — control-to-evidence mapping, gaps, remediation → `compliance_findings`. |
| **46_communication_analyzer** | Corporate-comms psychological risk via tiered LLMs (DBRX sentiment/intent, GTE-large drift, Llama 70B summarization) → `psychological_profiles`, `behavioral_indicators`. |

> **Two config conventions coexist.** Framework-native agents use `cfg.catalog/cfg.schema`
> from bootstrap; the newer AI-governance / red-team / UEBA agents (53, 55, 56, 57, 58)
> hard-code `security_lakehouse` with domain schemas (`red_team`, `ueba`, `ai_governance`).

---

## 4. Detection & analytics engines

### 4.1 `analytics/` — trend, swarm, chrono, financial, geo, forecast

| File | Role |
|------|------|
| **01_trend_engine_cet** | The flagship **CET (Complete Event Trend) engine** (built-in **GraphFrames**). Reads `silver_events`; builds an entity graph, runs `connectedComponents` for attack clusters, then **Kleene-closure multi-hop motif matching** (`(a)-[e1]->(b)-[e2]->(c)`) against 4 MITRE-mapped standing queries. Time-ordered/windowed, scored `hops × severity × time-tightness`, classified *partial* vs *complete* → `trend_*` tables. MLflow + Structured Streaming (30s). |
| **02_swarm_crucible** | Red-vs-blue **genetic algorithm** evolving attack "genes" against live correlation rules to measure real evasion/detection → `swarm_runs`, `swarm_champions`. |
| **03_chronoweave** | Compounding threat graph — BGE embeddings + Vector Search ANN + GraphFrames connected-components to cluster temporal threat sessions. |
| **04_financial_threat_intel** | Transaction fraud / identity graph — MLflow fraud model, Spark ML (KMeans), GraphFrames community detection, Z-score/IQR velocity checks. |
| **05_geopolitical_risk** | Maps geopolitical feeds (conflicts/sanctions/disasters) to exposure zones → `cyber_geo_correlations`. |
| **06_monte_carlo_threat_forecast** | Monte Carlo attack-path simulation → probability distributions, time-to-compromise CIs (feeds the 3D Attack Universe). |
| **07_cet_native_bridge** | Capability-detected adapter that swaps the built-in engine for the native **0xDSI-CET** engine (M/T/H-CET, retraction) with automatic fallback to `01`. |
| **08_operation_borrowed_trust_replay** | Didactic pure-Python replay of the CET **retraction / late-arrival** semantics (event-time reordering, watermark buffering, `skip-till-any-match` standing queries). Demonstrates Exec B WITHDRAWN vs Exec C PERSISTS. |

### 4.2 `correlation/` — CEP, negative correlation, fusion

| File | Role |
|------|------|
| **01_streaming_correlation_engine** | KS-gated streaming CEP — evaluates rules over event windows with **Kolmogorov-Smirnov adaptive thresholds** (statistical significance, not raw counts). |
| **02_negative_correlation** | Detects the **ABSENCE** of expected events (missing heartbeat/backup/token renewal). A zero count within `absence_window_seconds` triggers a detection. The logical negation of Kleene-star positive sequences. |
| **03_graph_correlation** | Graph traversal for lateral movement (2/3-hop paths, fan-out); lighter cousin of `analytics/01`. |
| **04_temporal_window_correlator** | Brute-force / credential-stuffing / beaconing via per-source-IP KS thresholds; beacon detection via coefficient-of-variation. |
| **05_supply_chain_risk** | Unexpected package installs, build-pipeline tampering, dependency confusion. |
| **06_cloud_posture** | CSPM — open security groups, IAM priv-esc chains, disabled encryption, public exposure. |
| **07_detection_confluence** | **Decision engine** fusing 7 detection lenses via Bayesian weighted scoring + diversity bonus; KS-validated signals weigh more. |
| **08_entity_spine** | Persistent **entity resolution** — every user/device/IP/session/process/role resolves to one `entity_id`. The identity layer everything else references. |
| **09_unified_evidence_object** | Packages lens signals into a lineage-preserving **UEO** per (entity, window) — producer for the Fuse engine. |
| **10_fuse_engine** | Aligns UEOs to the spine, scores evidence **independence via Dempster-Shafer** belief functions, builds causal chains, detects model disagreement → `fused_evidence`. |

### 4.3 `detection/` — lenses

| File | Role |
|------|------|
| **01_behavioral_anomaly_detection** | Dual-model UEBA — KMeans + KS validation *and* Isolation Forest; both-flagged = highest confidence. |
| **02_threat_intel_matching** | Streaming IOC matching with confidence decay + broadcast join. |
| **03_detection_slm** | **Inference-time SLM lens** — a lightweight Foundation Model classifies alerts MALICIOUS/SUSPICIOUS/BENIGN/NOISY + MITRE tactic → `slm_classifications` (Confluence Lens 4/7). Trained by `ml_training/07`. |
| **04_formula_prioritization** | Deterministic, auditable weighted formula — the non-drifting anchor alongside ML lenses. |
| **05_entity_drift_cet** | Entity-level (slow-drift) CET variant — rate/diversity/temporal/centrality drift per entity; attaches to the spine. |
| **06_bytecode_semantics** | Pre-signature behavioral code analysis (eBPF/JVM/.NET/Python telemetry) — catches signed/AV-clean binaries. |
| **07_ks_recall_lens** | Queries the Knowledge Store embedding index (BGE, 0.72 threshold) for semantic matches vs prior incidents/suppressions/CTI → `ks_recall` signal for the UEO. |
| **08_ot_protocol_anomaly_detection** | 5-layer OT/ICS detection (function-code allowlist, temporal, kill-chain, cross-protocol, physics-aware setpoint limits); ATT&CK for ICS. |

> **Cross-cutting concepts.** **CET** = `analytics/01` (default GraphFrames) → `analytics/07`
> (native engine bridge) → `analytics/08` (retraction proof) → `detection/05` (entity drift) →
> `ml_training/07` (trains the SLM that learns event grammar). **Kleene-star** sequence
> matching (GraphFrames motifs / standing queries) has its negation in **negative
> correlation** (`correlation/02`). **KS (Kolmogorov-Smirnov)** is the statistical spine for
> adaptive thresholds and drift across correlation, detection, and ML notebooks.

---

## 5. Machine-learning lifecycles

### 5.1 `ml_training/` — feature engineering, scoring, GraphRAG, embeddings, and the Ray SLM

| File | Role |
|------|------|
| **01_threat_scoring_model** | Spark ML **GBTClassifier** pipeline → MLflow-registered threat-scoring model. |
| **02_feature_engineering** | User/IP features + event sequences → feature tables for `01`. |
| **03_ueba_behavioral_baseline** | Per-user KS two-sample + KMeans dual-gate baselines (Bonferroni corrected). |
| **04_graphrag_zero_day** | **GraphRAG** — knowledge graphs from threat intel + vector similarity to flag signature-less zero-days. |
| **05_model_monitoring** | KS-based data/prediction/concept drift + staleness for registered models. |
| **06_graph_neighborhood_embeddings** | Pure-Spark (serverless-safe, no GraphFrames) 1/2-hop structural features → **128-dim** vectors feeding the `graph_neighborhood_index` (built by Agent 61). |
| **07_ray_slm_distributed_training** | **The Ray showcase.** See below. |

**`07_ray_slm_distributed_training.py` in depth.** Trains the **0xDSI CET Small Language
Model** (124M params, GPT-style `nn.Transformer`, d_model=512) that learns the *grammar* of
normal machine-identity OCSF event sequences — so anomalous chains like Operation Borrowed
Trust's Exec C read as "ungrammatical."

- **Ray mechanics.** `ray.util.spark.setup_ray_cluster` stands up a Ray cluster **on the
  Spark workers** (one Ray node per data-parallel actor, `gpus_per_worker` A100-80GB GPUs
  each). `ray.train.torch.TorchTrainer` + `ScalingConfig` shard the `gold.ocsf_event_language`
  corpus across workers; gradients synchronize every step via **DDP / NCCL all-reduce**
  (`prepare_model`, `train.get_dataset_shard`, `train.report`). Teardown via
  `shutdown_ray_cluster()` releases the GPUs.
- **Curriculum weighting.** Confirmed-incident sequences are up-weighted (default **3×** via
  `proven_incident_weight`) during sampling — the "hybrid" pretrain-on-all + up-weight-proven
  strategy.
- **Telemetry → Supabase → app.** `register_run` / `push_frame` / `finish_run` stream step,
  loss, per-worker GPU/throughput to Supabase REST tables **`dslm_ray_runs`,
  `dslm_ray_workers`, `dslm_ray_timeline`** (service-role secrets from the Databricks secret
  scope, never hard-coded). The app's **Ray Training Theater** tab (`src/components/
  DetectionSLM.tsx`) plays those frames back with the WOW-factor visualization: live status
  light, 8-worker fleet with GPU bars, aggregated loss curve, cluster config, and the
  curriculum-weighting card.
- **Relationship.** This is the *training-time* complement to the *inference-time*
  `detection/03_detection_slm` and the CET engines in `analytics/01`, `07`, `08`.

### 5.2 `memory_cache/` — the MC-RNN lifecycle (PyTorch)

Based on *"Memory Caching: RNNs with Growing Memory."* Solves the SOC dilemma: Transformers
give perfect recall at O(L²); RNNs are O(L) but forget. The **MC-RNN caches hidden-state
checkpoints at segment boundaries** → O(L) base + O(segments) recall, enabling multi-week APT
dwell detection *and* explainable "evidence-point" checkpoints. All ML tables live in
`security_catalog.ml`.

Lifecycle: **architecture → tokenizer → training → baseline/detection → cache mgmt → serving
→ monitoring → explainability.**

| File | Role |
|------|------|
| **61_mc_rnn_architecture** | Core PyTorch model (imported by most others): `MCConfig`, `LinearAttentionCore` (Katharopoulos linear attention, O(L)), memory-cache landmark layer, gating, anomaly head. |
| **62_mc_feature_tokenizer** | Raw events → **128-dim** vectors (learned categorical embeddings + numeric projection); manages `SecurityVocabulary` (PAD/UNK/SEG). |
| **63_mc_training_pipeline** | Distributed training via **TorchDistributor** (multi-GPU, NCCL), curriculum (segment 16→32→64), multi-objective loss, MLflow registry. |
| **64_mc_ueba_baseline** | Per-entity inference where **the hidden state IS the baseline**; detects via reconstruction error / hidden-state divergence / anomalous cache retrieval. |
| **65_mc_cache_manager** | Cache lifecycle in `mc_entity_caches` — LRU eviction with landmark protection, compaction, archival, integrity validation. |
| **66_mc_streaming_detector** | Real-time detection — Structured Streaming `foreachBatch` (10s): load Delta state → MC-RNN inference → alerts + updated state. |
| **67_mc_attack_chain_recall** | Long-range attack-chain detection via cache attention — reconnect-after-quiet, gradual escalation (cache-drift slope), living-off-the-land, coordinated multi-entity. |
| **68_mc_response_policy** | RL response policy — replaces Agent 47's Q-table with an MC-RNN encoder → **PPO** policy/value heads; keeps the high-avoidance safety constraint. |
| **69_mc_model_monitoring** | Anomaly precision/recall, cache health, model drift, latency/throughput SLAs. |
| **70_mc_serving_endpoint** | Packages the model as MLflow pyfunc → **Databricks Model Serving** (GPU + autoscaling). Bridges training → streaming. |
| **71_mc_explainability** | On an anomaly, analyzes cache attention to show *which* past memory checkpoints matched and *why* ("45% attention to June 3rd checkpoint"). |
| **MEMORY_CACHING_GUIDE.md** | Design doc — motivation (21-day APT dwell), four paradigm shifts, ASCII diagrams, notebook cross-references. |

---

## 6. `ingestion/` — Bronze connectors

| File | Role |
|------|------|
| **01_raw_event_ingestion** | Structured Streaming from Kafka/Event Hub/Kinesis/Autoloader; PERMISSIVE parse → Bronze `events`, corrupt → `quarantined_events`; passively MERGEs discovered entities into `entity_spine`. |
| **02_enrichment_pipeline** | Streaming enrichment — broadcast-joins `ioc_entries`/`asset_registry`/`user_profiles`/`geoip_blocks` → `enrichments` map + `enrichment_risk_score`. |
| **03_schema_enforcement** | Batch (~5min) **OCSF v1.1** normalization — maps `event_type` → class/category/activity/type UIDs, normalizes severity/outcome. |
| **04_quarantine_handler** | DLQ recovery — structural re-parse then **LLM-assisted field inference**; recovered rows → `events`; TTL purge. |
| **05_kafka_eventhub_connector** | Enhanced multi-source connector with health-check failover, adaptive backpressure, multi-format parsing (JSON/CEF/Syslog/LEEF), offset replay. Supersedes 01 in production. |
| **06_threat_feed_connector** | Ingests OTX/AbuseIPDB/VirusTotal/MISP/STIX-TAXII IOCs (control-plane `threat_feeds`) → `ioc_entries` with confidence decay. |
| **07_lakebase_sync** | **Lakebase serving layer** — Structured Streaming + Delta CDC materializes Z-ORDERed `lakebase_*` tables for low-latency UI lookups. |
| **08_typed_bronze_partitioner** | Typed, partitioned Bronze by `(source_type, date)` across 8 source types; violations → `typed_bronze_quarantine`. |
| **09_edge_collector_framework** | Edge-collector fleet management — registry/heartbeat, config distribution, mTLS cert rotation. |
| **09_llm_usage_interceptor** | Captures LLM usage from Foundation Model endpoints / inference logs → `llm_usage_logs` (feeds Agent 40). |
| **10_plc_ot_protocol_connector** | OT/ICS connector parsing 20+ industrial protocols (S7comm, Modbus, EtherNet/IP, OPC UA, DNP3, IEC 61850/60870, PROFINET, BACnet). |

---

## 7. `pipelines/`, `ops/`, `response/`, `setup/`

### 7.1 `pipelines/` — Delta Live Tables (formal medallion)

| File | Role |
|------|------|
| **bronze_ingestion** | DLT `bronze_raw_events` from Autoloader/Kafka; `@dlt.expect_or_quarantine` keeps corrupt records instead of dropping. |
| **silver_normalization** | `bronze_raw_events` → `silver_events` — full OCSF mapping, entity extraction, dedup by event ID. |
| **gold_analytics** | `silver_events` → `gold_*` — hourly metrics, alert summaries (MTTD/MTTR/FP), user risk, ATT&CK coverage heatmap. |
| **attack_universe_realtime** | Real-time DLT for the 3D Attack Universe — `gold_domain_health`, `gold_attack_flows`, `gold_scene_intercepts`, `gold_threat_forecasts`, `gold_attack_path_predictions`. |

### 7.2 `ops/` — platform operations

| File | Role |
|------|------|
| **01_checkpoint_gc** | Streaming checkpoint garbage collection (retention-based, dry-run capable). |
| **02_health_check** | Inter-notebook health + **circuit breaker** on `agent_status` heartbeats. |
| **03_sla_alerting** | SLA-breach detection with per-severity targets + deduplicated escalations. |
| **04_alert_deduplication** | MERGE-with-fingerprint dedup between detection cycles (~2min). |
| **05_delta_replay_engine** | Delta time-travel (`AS OF`) for forensic replay, detection back-testing (precision/recall), retroactive labeled training sets. |

### 7.3 `response/` — response & integrations

| File | Role |
|------|------|
| **01_automated_response** | Executes response actions on high/critical alerts with human-in-the-loop approval (can consume the MC-RNN policy net #68). |
| **02_case_management** | Groups related alerts into cases, tracks lifecycle, assigns analysts. |
| **03_notification_integrations** | Routes escalations to PagerDuty/Slack/Teams/Email/Webhooks. |
| **04_ticketing_integration** | Bidirectional ServiceNow / Jira sync from cases. |
| **05_report_generator** | Foundation-Model narrative reports (executive/operational/compliance/MITRE) → `reports`. |

### 7.4 `setup/` — bootstrap, seed, and demo docs

| File | Role |
|------|------|
| **01_create_catalog_schema** | Foundational DDL (~3,248 lines) — catalog, schema, **all** tables. Deliberately does NOT use bootstrap (it creates what bootstrap needs). Run first. |
| **02_seed_demo_data** | Seeds core tables with realistic demo SOC data. |
| **03_seed_all_platform_data** | Seeds 22 additional UI-supporting tables so every tab has data. |
| **04_register_model_serving** | Registers interactive agents as MLflow ChatModels + Model Serving endpoints. |
| **05_seed_correlation_rules_library** | Generates a **50,000-rule** correlation library (30 categories, all ATT&CK tactics). |
| **0xDSI_Operation_Borrowed_Trust_DEMO_SCRIPT.md** | 12–15 min presenter click-through: CET Trend Engine (Kleene queries `cet-obt-recon`/`cet-obt-export`, Trends, Live Graph), late-evidence withdrawal, then the Ray Training Theater. |
| **0xDSI_Operation_Borrowed_Trust_Narrative.md** | ~30 min conceptual narrative — Detection-as-Data, CEP vs CET, "the authorization record is an input to detection," an engine that withdraws a finding when better late evidence arrives while holding the one that still matters. |

---

## 8. Deployment — the Databricks Asset Bundle

```
databricks.yml (bundle 0xdsi-agentic-soc; targets dev/staging/prod; vars: catalog, schema,
   warehouse_id, llm_endpoint 70B/8B, embedding_endpoint bge-large, secret_scope soc-secrets)
   └── include resources/*.yml
         ├── app.yml        → Databricks App "oxdsi_soc" (uvicorn backend.server:app,
         │                     source ../app), 6 optional model-serving endpoints,
         │                     RBAC soc_admins/soc_analysts
         ├── jobs.yml       → 60+ Workflows jobs: continuous streaming (ingestion/correlation)
         │                     + cron (detection/negative-correlation), serverless env with
         │                     scipy/scikit-learn/networkx
         └── pipelines.yml  → 2 serverless Photon DLT pipelines (bronze_silver_gold,
                               attack_universe_realtime)
```

- **`deploy.sh`** — 14-step orchestrator: preflight → temporarily comment out the
  `model_serving_endpoints` block (Foundation Model API is the default) → provision catalog/
  schema/volumes/tables/UC functions/secrets/MLflow/Vector Search → **build the SPA from the
  main project `src/` with `VITE_DATABRICKS_MODE=true`**, copy `dist/` → `app/dist`, drop
  `app/package.json` → `bundle validate && deploy` → seed jobs, grants, health checks.
  `--rollback` = `bundle destroy`; `--restore-yaml` undoes the app.yml patch.
- **`Makefile`** — light dev path (`bundle deploy --target <env>`); `make deploy` delegates to
  `./deploy.sh production`; `make test` runs the two Python smoke tests.
- **`tests/`** — `smoke_test_app.sh` (HTTP health of the live app), `smoke_test_e2e_pipeline.py`
  (synthetic IOC → event → alert → triage → response, non-destructive),
  `smoke_validate_schema.py` (16 required tables + `geo_location` struct contract).

---

## 9. The hosted app — FastAPI + React on Unity Catalog

- **`app/backend/server.py`** — a **FastAPI** app (~3,300 lines). Data source is a
  **Databricks Serverless SQL Warehouse → Unity Catalog** via `databricks-sql-connector` +
  `WorkspaceClient`. **No Supabase, no egress.** It serves the built SPA from `app/dist`
  (SPA-fallback to `index.html`) and exposes a **Supabase-compatible API** so the frontend
  needs no rewrite: `POST /api/query/{table}` (Supabase filter/select semantics against an
  `ALLOWED_TABLES` whitelist), `POST /api/mutate/{table}`, `POST /api/rpc/{fn}` (UC SQL
  functions), `/api/auth/session` (workspace SSO via `X-Forwarded-*`), and `/api/ai-*`
  (Foundation Model serving).
- **Two component trees.** `app/frontend/src/` is a **Databricks-flavored fork/snapshot** of
  the main project `src/`. The linchpin is `app/frontend/src/lib/supabase.ts`, which is **not**
  a real Supabase client — it's a `LakehouseDataClient` shaped exactly like the Supabase JS API
  (`.from().select().eq()…`, `.auth`, `.rpc()`, `.channel()` no-op) that proxies every call to
  the FastAPI backend. So the same UI runs unchanged against the Lakehouse.
- **Which ships?** `deploy.sh` builds the **main `src/`** (superset, with the extra
  AgentControlPlane / CRUD features) in Databricks mode — so production ships the main tree;
  `app/frontend/` is a self-contained dev fallback that keeps `app/` buildable in isolation.

---

## 10. End-to-end interaction summary

1. **Collect.** Edge collectors / OT taps / cloud connectors land raw events via Kafka/
   ZeroBus/Event Hub → `ingestion/*` writes Bronze `events` (+ `quarantined_events`,
   `entity_spine`, `ioc_entries`, `llm_usage_logs`).
2. **Normalize.** DLT `pipelines/*` produce `silver_events` (OCSF) → `gold_*`; `lakebase_sync`
   materializes low-latency serving tables.
3. **Detect.** In parallel: **CEP/CET** (`analytics/01`+`07`+`08`, `correlation/*`), **KS**
   statistics, **NetworkX** graph CEP (Agent 26), the **MC-RNN** streaming detector, and the
   **SLM lens** (`detection/03`, trained by the **Ray** job `ml_training/07`). Signals flow
   through `entity_spine` → `unified_evidence_object` → `fuse_engine` → `detection_confluence`
   into alerts.
4. **Reason & act.** Agents triage (01) → enrich (02) → hunt (03) → attribute (08), the
   supervisor (04) orchestrates, and response (07/47/`response/*`) contains threats with
   human-in-the-loop approval; cases/tickets/notifications/reports go out.
5. **Learn.** ALHF (25), pattern discovery (09), AI correlation (28), vector/graph memory
   (10/26/27/32/59/61), and the ML training lifecycles feed improved detection back in.
6. **Operate.** `ops/*` keeps streams, agents, SLAs, and dedup healthy and enables Delta
   replay/back-testing.
7. **Present.** The FastAPI Databricks App serves the React SOC UI against Unity Catalog; the
   Ray Training Theater and Attack Universe visualizations read the live `dslm_ray_*` and
   `gold_*` tables.

Everything above is governed by the `_shared` backbone (config, secrets, safe SQL/Delta, LLM
gateway, monitoring) and the Delta-table control plane — so the whole platform is centrally
tunable, fully audited, and runs with zero data egress.
