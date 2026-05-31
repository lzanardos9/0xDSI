# 0xDSI Agentic SOC Platform - Databricks Native

Production-grade Security Operations Center running entirely within Databricks. 111 notebooks, 46 autonomous agents, 10 correlation engines, 8 detection models, real-time streaming from ZeroBus (Kafka), and LLM-powered investigation -- all orchestrated through Unity Catalog, Workflows, and Foundation Model APIs.

Zero external dependencies. Zero egress. Full data sovereignty.

---

## Platform Stats

| Metric | Count |
|--------|-------|
| Total Notebooks | 111 |
| Autonomous Agents | 46 |
| Correlation Engines | 10 |
| Detection Models | 8 |
| Delta Lake Tables | 130+ |
| Ingestion Connectors | 10 |
| Shared Modules | 10 |
| DLT Pipeline Stages | 3 |

---

## Architecture

```
                    ┌─────────────────────────────────────────────────────────┐
                    │              DATABRICKS WORKSPACE                        │
                    ├─────────────────────────────────────────────────────────┤
                    │                                                          │
                    │  ┌────────────────────────────────────────────────────┐ │
                    │  │  DATABRICKS APP (React + FastAPI)                   │ │
                    │  │  Workspace SSO | SQL Warehouse Queries             │ │
                    │  └──────────────────────┬─────────────────────────────┘ │
                    │                         │                                │
                    │  ┌──────────────────────▼─────────────────────────────┐ │
                    │  │            UNITY CATALOG (Delta Lake)               │ │
                    │  │  130+ tables | ML Models | Feature Store | Volumes │ │
                    │  └────────▲──────────────────────────────▲────────────┘ │
                    │           │                               │              │
                    │  ┌────────┴───────────┐    ┌─────────────┴───────────┐ │
                    │  │ DLT PIPELINE       │    │ WORKFLOWS (60+ Jobs)     │ │
                    │  │ Bronze→Silver→Gold │    │ Streaming | Scheduled    │ │
                    │  └────────────────────┘    └──────────────────────────┘ │
                    │                                                          │
                    │  ┌────────────────────────────────────────────────────┐ │
                    │  │ FOUNDATION MODEL APIs                               │ │
                    │  │ Llama 3.1 70B (primary) | 8B (fallback)            │ │
                    │  │ Budget control | Retry | JSON mode                  │ │
                    │  └────────────────────────────────────────────────────┘ │
                    │                                                          │
                    │  ┌────────────────────────────────────────────────────┐ │
                    │  │ MLFLOW MODEL REGISTRY                               │ │
                    │  │ Threat scoring | UEBA baseline | GraphRAG 0-day    │ │
                    │  └────────────────────────────────────────────────────┘ │
                    │                                                          │
                    └─────────────────────────────────────────────────────────┘
```

---

## Event Journey (End-to-End)

```
 External Sources (EDR, SIEM, Firewall, Cloud, OT/ICS)
        │
        ▼
 ┌─────────────────────────────────────────────────────┐
 │  ZeroBus (Kafka)  topic: security-events            │  ← SASL_SSL Auth
 └────────┬─────────────────────────┬──────────────────┘
          │                         │
          │ (persistence)           │ (sub-second detection)
          ▼                         ▼
 ┌─────────────────┐    ┌──────────────────────────────┐
 │ Ingestion       │    │ SDP (Streaming Detection)    │
 │ Pipeline        │    │                              │
 │ 01_raw_event    │    │ Consumer groups:             │
 │ 02_enrichment   │    │  sdp-correlation (CEP)       │
 │ 03_schema_enf   │    │  sdp-temporal (windows)      │
 │ 04_quarantine   │    │  sdp-threat-intel (IOC)      │
 │                 │    │  sdp-graph-cep (NetworkX)    │
 │ → Delta: events │    │  sdp-supply-chain            │
 └────────┬────────┘    │  sdp-cloud-posture           │
          │             │                              │
          │             │ Latency: 1-5 seconds         │
          │             └──────────────┬───────────────┘
          │                            │
          ▼                            ▼
 ┌─────────────────┐    ┌──────────────────────────────┐
 │ DLT Pipeline    │    │ Detection Outputs            │
 │ Bronze→Silver   │    │  cep_pattern_matches         │
 │ Silver→Gold     │    │  graph_cep_detections        │
 └────────┬────────┘    │  threat_intel_matches        │
          │             │  → alerts (auto-generated)   │
          ▼             └──────────────┬───────────────┘
 ┌─────────────────┐                   │
 │ Batch Detection │                   │
 │ (every 5-15min) │                   │
 │                 │                   │
 │ UEBA anomaly    │                   │
 │ Entity drift    │                   │
 │ Formula scoring │                   │
 │ KS recall lens  │                   │
 │ Bytecode sem.   │                   │
 │ OT anomaly      │                   │
 └────────┬────────┘                   │
          │                            │
          ▼                            ▼
 ┌─────────────────────────────────────────────────────┐
 │  DETECTION CONFLUENCE (Dempster-Shafer Fusion)      │
 │  Multi-signal aggregation → Final verdict + score   │
 └────────────────────────┬────────────────────────────┘
                          │
                          ▼
 ┌─────────────────────────────────────────────────────┐
 │  AGENT ORCHESTRATION (46 Agents)                    │
 │                                                      │
 │  Triage → Enrichment → Investigation → Response     │
 │                                                      │
 │  LLM-powered: classification, attribution,          │
 │  playbook generation, executive summaries            │
 └────────────────────────┬────────────────────────────┘
                          │
                          ▼
 ┌─────────────────────────────────────────────────────┐
 │  RESPONSE + CASE MANAGEMENT                         │
 │  Auto-containment | Human approval gate | SLA       │
 └────────────────────────┬────────────────────────────┘
                          │
                          ▼
 ┌─────────────────────────────────────────────────────┐
 │  SERVING LAYER (Lakebase CDC → Frontend)            │
 │  Brickstore (<10ms) | Lakebase (50ms) | Delta (1s) │
 └─────────────────────────────────────────────────────┘
```

---

## Package Contents

```
databricks-native/
├── databricks.yml                         # DAB bundle manifest (multi-target)
├── deploy.sh                              # One-command deployment
├── AGENT_ARCHITECTURE.md                  # Agent design documentation
├── PRODUCTION_CONNECTOR_PLAN.md           # Connector deployment plan
│
├── app/                                   # Databricks App (web application)
│   ├── app.yaml                           # App runtime config
│   ├── package.json                       # Node.js deps
│   ├── requirements.txt                   # Python deps (FastAPI, databricks-sdk)
│   ├── backend/server.py                  # FastAPI API server
│   └── frontend/src/                      # React frontend
│       ├── lib/supabase.ts                # Query builder (routes to FastAPI)
│       ├── lib/databricksClient.ts        # Databricks SQL client
│       └── contexts/AuthContext.tsx        # Workspace SSO context
│
├── notebooks/
│   ├── _shared/                           # Shared infrastructure (10 modules)
│   ├── setup/                             # Initialization (3 notebooks)
│   ├── agents/                            # Autonomous agents (46 notebooks)
│   ├── ingestion/                         # Data ingestion (10 notebooks)
│   ├── correlation/                       # Correlation engines (10 notebooks)
│   ├── detection/                         # Detection models (8 notebooks)
│   ├── analytics/                         # Advanced analytics (5 notebooks)
│   ├── ml_training/                       # ML pipelines (5 notebooks)
│   ├── ops/                               # Operational jobs (5 notebooks)
│   ├── response/                          # Automated response (5 notebooks)
│   └── pipelines/                         # DLT Bronze/Silver/Gold (3 notebooks)
│
└── resources/
    ├── app.yml                            # Databricks App resource
    ├── jobs.yml                           # Workflow job definitions
    └── pipelines.yml                      # DLT pipeline definition
```

---

## Shared Infrastructure (`_shared/`)

Every notebook runs `%run ../_shared/bootstrap` to initialize core services:

| Module | Purpose | Provides |
|--------|---------|----------|
| `config.py` | Configuration resolver | `cfg` (SOCConfig) |
| `secrets.py` | Secret scope manager | `secrets_mgr` |
| `llm_client.py` | LLM with retry/fallback/budget | `llm` (SOCLLMClient) |
| `monitoring.py` | Audit logging and timing | `mon` (Monitor) |
| `sql_safe.py` | SQL injection prevention | `qb()`, `build_insert`, `build_update` |
| `delta_helpers.py` | Safe Delta operations | `safe_append`, `safe_merge`, `streaming_append` |
| `agent_framework.py` | Agent base classes | `BatchAgent`, `StreamingAgent`, `InteractiveAgent` |
| `sdp_stream.py` | ZeroBus Kafka stream builder | `create_sdp_stream`, `create_sdp_stream_with_fallback` |
| `bootstrap.py` | Single-line initialization | All of the above |

---

## Agents (46)

### Core SOC Agents (01-04)
| # | Agent | Type | Schedule | Purpose |
|---|-------|------|----------|---------|
| 01 | Triage | Batch | Every 3min | LLM-powered L1 alert classification |
| 02 | Enrichment | Batch | Every 5min | Context enrichment (GeoIP, TI, asset) |
| 03 | Threat Hunter | Batch | Every 4hr | Autonomous hypothesis-driven hunting |
| 04 | Orchestrator | Batch | Every 10min | Multi-agent coordination & dispatch |

### Intelligence Agents (05-10)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 05 | Sage | Batch | Deep threat intel enrichment (MISP, OTX, VT) |
| 06 | Nova | Interactive | Deep investigation & network forensics |
| 07 | Vanguard | Batch | Automated response execution |
| 08 | CTI Attribution | Batch | APT group attribution analysis |
| 09 | Pattern Discovery | Batch | Cross-alert pattern mining |
| 10 | Vector Memory | Batch | Embedding-based similar incident recall |

### Offensive/Defensive Agents (11-14)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 11 | Red Team | Batch | Automated attack simulation |
| 12 | Blue Team | Batch | Defensive posture validation |
| 13 | Forensics | Batch | Timeline reconstruction & evidence |
| 14 | Honeypot | Batch | Honeypot/honeytoken management |

### LLM-Powered Assistants (15-22)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 15 | CISO Assistant | Interactive | Executive-level security Q&A |
| 16 | Playbook Generator | Batch | Incident-specific playbook creation |
| 17 | Incident Summarizer | Batch | Executive summary generation |
| 18 | Document Analyzer | Batch | Document/email threat analysis |
| 19 | Malware Sandbox | Batch | Malware detonation & behavioral analysis |
| 20 | LLM Guardrails | Batch | Prompt injection & data leakage detection |
| 21 | Model Poisoning Guard | Batch | ML model integrity monitoring |
| 22 | Threat Simulator | Batch | Attack scenario simulation |

### Infrastructure Agents (23-32)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 23 | Connector Adapter | Batch | Data source normalization |
| 24 | Threat Radar | Batch | Emerging threat monitoring |
| 25 | ALHF Learning | Batch | Analyst feedback loop (reinforcement) |
| 26 | Realtime Graph CEP | Streaming | Sub-second graph-based detection |
| 27 | Vector Scoring | Batch | Entity risk scoring via embeddings |
| 28 | AI Correlation | Batch | LLM-assisted rule generation |
| 29 | Connector Version | Batch | Connector health & version tracking |
| 30 | Stateful Backdoor | Batch | Persistent threat detection |
| 31 | Vibe Connector Builder | Interactive | Natural language connector creation |
| 32 | Vector Search Index | Batch | Embedding index maintenance |

### Vulnerability & Scanning (33-41)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 33 | Glasswing Ingest | Batch | Vulnerability data ingestion |
| 34 | Glasswing Dedup | Batch | CVE deduplication |
| 35 | Glasswing Reachability | Batch | Network reachability analysis |
| 36 | Glasswing Blast Radius | Batch | Impact radius calculation |
| 37 | Glasswing Auto Patch | Batch | Automated patch recommendation |
| 38 | Session List Manager | Batch | Session-based entity tracking |
| 39 | Active List Manager | Batch | Dynamic watchlist management |
| 40 | LLM Risk Profiler | Batch | LLM usage risk scoring |
| 41 | Glasswing Scanner | Batch | Full vulnerability scan orchestration |

### Specialized (42-46)
| # | Agent | Type | Purpose |
|---|-------|------|---------|
| 42 | Knowledge Store | Batch | Vector knowledge base management |
| 43 | Guardian Compliance | Batch | Compliance posture monitoring |
| 44 | OT Protocol Security | Batch | ICS/SCADA protocol anomaly detection |
| 45 | ExploitForge | Batch | AI-driven exploit chain analysis |
| 46 | Communication Analyzer | Batch | Communication pattern profiling |

---

## Correlation Engines (10)

| # | Engine | Source | Type | Purpose |
|---|--------|--------|------|---------|
| 01 | Streaming Correlation | ZeroBus (Kafka) | Streaming | CEP with sliding windows, threshold rules |
| 02 | Negative Correlation | Delta (batch) | Scheduled | Detect absence of expected events |
| 03 | Graph Correlation | Delta (batch) | Scheduled | Multi-hop lateral movement via NetworkX |
| 04 | Temporal Window | ZeroBus (Kafka) | Streaming | Brute force, beaconing, port scan (KS-adaptive) |
| 05 | Supply Chain Risk | ZeroBus (Kafka) | Streaming | Third-party dependency compromise |
| 06 | Cloud Posture | ZeroBus (Kafka) | Streaming | CSPM drift & misconfiguration |
| 07 | Detection Confluence | Delta (fuse) | Hybrid | Dempster-Shafer multi-signal fusion |
| 08 | Entity Spine | Delta (events) | Batch | Entity relationship graph construction |
| 09 | Unified Evidence Object | Delta (all) | Batch | Signal consolidation per entity |
| 10 | Fuse Engine | Delta (UEO) | Batch | Multi-model ensemble verdict |

---

## Detection Models (8)

| # | Model | Technique | Schedule |
|---|-------|-----------|----------|
| 01 | Behavioral Anomaly | Isolation Forest + UEBA clustering | Every 15min |
| 02 | Threat Intel Matching | Real-time IOC join (IP, domain, hash) | Streaming |
| 03 | Detection SLM | Small Language Model classification | Every 10min |
| 04 | Formula Prioritization | Multi-factor risk scoring (8 dimensions) | Every 10min |
| 05 | Entity Drift CET | Behavioral baseline deviation | Every 10min |
| 06 | Bytecode Semantics | Code-level behavioral analysis | Every 30min |
| 07 | KS Recall Lens | Kolmogorov-Smirnov validated detection | Every 10min |
| 08 | OT Protocol Anomaly | ICS/SCADA protocol deviation | Every 5min |

---

## Ingestion Pipeline (10)

| # | Notebook | Mode | Purpose |
|---|----------|------|---------|
| 01 | Raw Event Ingestion | Streaming | Kafka/EventHub consumer with DLQ |
| 02 | Enrichment Pipeline | Streaming | GeoIP, DNS, reputation, asset context |
| 03 | Schema Enforcement | Batch | OCSF normalization & validation |
| 04 | Quarantine Handler | Batch | Bad data recovery & LLM repair |
| 05 | Kafka EventHub Connector | Streaming | Multi-source with failover & health check |
| 06 | Threat Feed Connector | Batch | STIX/TAXII, MISP, OTX feed ingestion |
| 07 | Lakebase Sync | Streaming | CDC to serving layer (50ms queries) |
| 08 | Typed Bronze Partitioner | Streaming | Source-typed partitioning |
| 09 | LLM Usage Interceptor | Batch | AI/LLM usage telemetry capture |
| 10 | PLC/OT Protocol Connector | Streaming | S7comm, Modbus, DNP3, IEC61850 |

---

## Analytics Engines (5)

| # | Engine | Purpose |
|---|--------|---------|
| 01 | Trend Engine CET | Contextual Entity Trending with drift detection |
| 02 | Swarm Crucible | Multi-agent adversarial validation |
| 03 | ChronoWeave | Temporal branch analysis (what-if scenarios) |
| 04 | Financial Threat Intel | Pix fraud, boleto manipulation, banking trojans |
| 05 | Geopolitical Risk | Cyber-geopolitical correlation engine |

---

## ML Training (5)

| # | Notebook | Purpose |
|---|----------|---------|
| 01 | Threat Scoring Model | GBT model training (MLflow tracked) |
| 02 | Feature Engineering | User + IP + asset feature tables |
| 03 | UEBA Behavioral Baseline | Behavioral baseline refresh |
| 04 | GraphRAG Zero-Day | Graph-based zero-day pattern learning |
| 05 | Model Monitoring | Drift detection, recall tracking |

---

## Operational Jobs (5)

| # | Job | Schedule | Purpose |
|---|-----|----------|---------|
| 01 | Checkpoint GC | Daily | Clean orphaned streaming checkpoints |
| 02 | Health Check | Every 5min | Platform health & component status |
| 03 | SLA Alerting | Every 5min | Alert on SLA breaches |
| 04 | Alert Deduplication | Every 10min | Merge duplicate/correlated alerts |
| 05 | Delta Replay Engine | On-demand | Replay events through updated rules |

---

## Response Automation (5)

| # | Notebook | Purpose |
|---|----------|---------|
| 01 | Automated Response | SOAR execution with human-in-the-loop |
| 02 | Case Management | Auto case creation & grouping |
| 03 | Notification Integrations | Slack, Teams, PagerDuty, email |
| 04 | Ticketing Integration | ServiceNow, Jira auto-ticket |
| 05 | Report Generator | Scheduled & on-demand reporting |

---

## SDP (Streaming Detection Pipeline)

The SDP reads **directly from ZeroBus (Kafka)** for sub-second detection latency, bypassing the Delta table persistence layer:

```
ZeroBus (Kafka) ─┬──► Ingestion → events (Delta)          [30-60s latency]
                 │
                 └──► SDP Direct Consumers                  [1-5s latency]
                       ├─ 0xdsi-sdp-correlation
                       ├─ 0xdsi-sdp-temporal
                       ├─ 0xdsi-sdp-threat-intel
                       ├─ 0xdsi-sdp-graph-cep
                       ├─ 0xdsi-sdp-supply-chain
                       └─ 0xdsi-sdp-cloud-posture
```

**Fallback**: If ZeroBus is unavailable (maintenance), engines automatically degrade to reading from the Delta `events` table with a warning log.

---

## Serving Layer (ZeroBus Architecture)

| Tier | Latency | Use Case |
|------|---------|----------|
| Brickstore (KV cache) | <10ms | Entity point lookups, session state |
| Lakebase (Postgres CDC) | ~50ms | Real-time operational queries (alerts, cases) |
| Lucene (Full-text) | ~100ms | Raw log search, event content search |
| Delta Lake | ~1000ms | Analytics, historical queries, ML training |

---

## Deployment

### Option A: Databricks Asset Bundles (Recommended)

```bash
cd databricks-native
./deploy.sh production
```

This deploys all notebooks, creates all jobs, configures the DLT pipeline, and launches the Databricks App.

### Option B: Manual (Databricks UI)

1. **Upload Notebooks**: Workspace > Import > Upload all `.py` files preserving directory structure
2. **Run Setup**: Execute `setup/01_create_catalog_schema.py` (creates 130+ tables)
3. **Seed Data**: Execute `setup/02_seed_demo_data.py` and `setup/03_seed_all_platform_data.py`
4. **Create Jobs**: Workflows > Create Job for each agent/streaming notebook
5. **Create DLT Pipeline**: Workflows > DLT > Create with 3 pipeline notebooks
6. **Deploy App**: Apps > Create > Upload `app/` folder > Deploy

### Option C: Git Integration

1. Connect repository to Databricks workspace (Repos)
2. Apps > Create > Connect to `app/` subdirectory
3. Workflows > Create jobs referencing notebook paths from the repo

---

## Prerequisites

- Databricks workspace with **Unity Catalog** enabled
- **Serverless SQL Warehouse** (recommended) or provisioned Pro warehouse
- **Foundation Model APIs** enabled (Llama 3.1 70B + 8B fallback)
- **MLflow** (included with workspace)
- Kafka/Event Hub for event ingestion (ZeroBus)

---

## Post-Deployment Configuration

### 1. Create Secret Scope

```bash
databricks secrets create-scope soc-secrets

# Required
databricks secrets put-secret soc-secrets kafka_brokers
databricks secrets put-secret soc-secrets kafka_sasl_username
databricks secrets put-secret soc-secrets kafka_sasl_password

# Threat Intelligence (recommended)
databricks secrets put-secret soc-secrets virustotal_api_key
databricks secrets put-secret soc-secrets abuseipdb_api_key
databricks secrets put-secret soc-secrets otx_api_key
databricks secrets put-secret soc-secrets misp_url
databricks secrets put-secret soc-secrets misp_api_key

# Response Integrations (optional)
databricks secrets put-secret soc-secrets crowdstrike_client_id
databricks secrets put-secret soc-secrets crowdstrike_client_secret
databricks secrets put-secret soc-secrets pagerduty_api_key
databricks secrets put-secret soc-secrets slack_webhook_url
```

### 2. Configure SQL Warehouse

Set `DATABRICKS_WAREHOUSE_ID` in the App environment settings.

### 3. Start Streaming Jobs

Start the always-on streaming jobs from the Workflows UI:
- Raw Event Ingestion
- Enrichment Pipeline
- Streaming Correlation Engine
- Temporal Window Correlator
- Threat Intel Matching
- Graph CEP
- Lakebase Sync

---

## Databricks Features Used

| Feature | Usage |
|---------|-------|
| Unity Catalog | 130+ Delta tables, ML models, feature store, volumes |
| Databricks Apps | React + FastAPI with workspace SSO |
| Serverless SQL Warehouse | Backend API queries |
| Structured Streaming | 8+ real-time ingestion/correlation/detection jobs |
| Workflows | 60+ scheduled agent and operational jobs |
| Delta Live Tables | Bronze/Silver/Gold medallion with expectations |
| Foundation Model APIs | 46 LLM-powered agents (Llama 3.1 70B/8B) |
| MLflow | 5 ML models with training, registry, and monitoring |
| Secrets | 25+ external service credentials |
| Volumes | Checkpoint storage, model artifacts, exported data |
| Vector Search | Embedding-based similarity for threat hunting |
| Auto-Scaling Compute | Job clusters scale 1-16 workers |

---

## Targets

| Target | Catalog | Purpose |
|--------|---------|---------|
| dev | oxdsi_soc_dev | Development & testing |
| staging | oxdsi_soc_staging | Pre-production validation |
| production | oxdsi_soc | Live operations |

---

## Performance Benchmarks

| Scenario | Latency |
|----------|---------|
| Known IOC match (IP/domain/hash) | 1-5 seconds |
| Multi-stage attack correlation (CEP) | 10-60 seconds |
| Behavioral anomaly detection (UEBA) | 5-10 minutes |
| Full investigation + response | 1-5 minutes |
| LLM-powered triage classification | 3-8 seconds |
| Entity risk re-scoring | 30-60 seconds |

---

## Security Model

- All data encrypted at rest (Delta Lake default)
- SASL_SSL authentication to ZeroBus/Kafka
- Workspace SSO for application access
- Secret scope for all external credentials
- Unity Catalog RBAC for table-level access control
- Human-in-the-loop approval gate for critical response actions
- Audit logging for all agent executions (Monitor framework)
