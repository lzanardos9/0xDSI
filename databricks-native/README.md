# 0xDSI Agentic SOC - Databricks Native Platform

Production-ready deployment package. Runs entirely within Databricks: Unity Catalog for data, Databricks Apps for the web UI, Workflows for agent orchestration, DLT for pipelines, MLflow for models, Foundation Models for LLM agents.

Zero external dependencies.

## Package Contents

```
databricks-native/
├── databricks.yml                    # DAB bundle manifest (multi-target)
├── deploy.sh                         # One-command deployment
│
├── app/                              # Databricks App (full web application)
│   ├── app.yaml                      # App runtime config
│   ├── package.json                  # Node.js deps (React, serve, concurrently)
│   ├── requirements.txt              # Python deps (FastAPI, databricks-sdk)
│   ├── backend/
│   │   └── server.py                 # FastAPI API server (queries SQL Warehouse)
│   └── frontend/src/
│       ├── lib/supabase.ts           # API-compatible query builder (routes to FastAPI)
│       ├── lib/databricksClient.ts   # Direct Databricks data client
│       └── contexts/AuthContext.tsx  # Databricks workspace SSO auth context
│
├── notebooks/
│   ├── setup/
│   │   └── 01_create_catalog_schema.py       # Creates 70+ Delta tables
│   ├── agents/
│   │   ├── 01_triage_agent.py                # LLM-powered L1 triage
│   │   ├── 02_enrichment_agent.py            # LLM-powered enrichment
│   │   ├── 03_threat_hunter_agent.py         # Autonomous threat hunting
│   │   └── 04_orchestrator.py                # Multi-agent coordinator
│   ├── ingestion/
│   │   ├── 01_raw_event_ingestion.py         # Streaming (Kafka/EventHub/S3)
│   │   ├── 02_enrichment_pipeline.py         # Geo-IP, TI, asset enrichment
│   │   ├── 03_schema_enforcement.py          # OCSF normalization
│   │   └── 04_quarantine_handler.py          # Bad data recovery
│   ├── correlation/
│   │   ├── 01_streaming_correlation_engine.py # CEP with sliding windows
│   │   ├── 02_negative_correlation.py         # Absence detection
│   │   ├── 03_graph_correlation.py            # Multi-hop lateral movement
│   │   └── 04_temporal_window_correlator.py   # Brute force, beacon, scan
│   ├── detection/
│   │   ├── 01_behavioral_anomaly_detection.py # ML anomaly (Isolation Forest)
│   │   └── 02_threat_intel_matching.py        # IOC matching engine
│   ├── response/
│   │   ├── 01_automated_response.py           # SOAR with human-in-the-loop
│   │   └── 02_case_management.py              # Auto case grouping
│   ├── ml_training/
│   │   ├── 01_threat_scoring_model.py         # GBT model (MLflow)
│   │   └── 02_feature_engineering.py          # User + IP feature tables
│   └── pipelines/
│       ├── bronze_ingestion.py                # DLT Bronze (raw + quality)
│       ├── silver_normalization.py            # DLT Silver (dedup + enrich)
│       └── gold_analytics.py                  # DLT Gold (aggregates)
│
└── resources/
    ├── app.yml                       # Databricks App resource definition
    ├── jobs.yml                      # 17 scheduled/streaming agent jobs
    └── pipelines.yml                 # DLT pipeline definition
```

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                     DATABRICKS WORKSPACE                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌─────────────────┐                                                 │
│  │  DATABRICKS APP  │ ← Workspace SSO Authentication                 │
│  │  React + FastAPI │                                                 │
│  │  (Port 8000)    │                                                 │
│  └────────┬────────┘                                                 │
│           │ SQL Warehouse                                            │
│           ▼                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                    UNITY CATALOG                                  ││
│  │  soc_platform.agentic_soc.* (70+ Delta Lake tables)             ││
│  │  ML Models: threat_scoring_model                                 ││
│  │  Feature Tables: ml_user_features, ml_ip_features               ││
│  └─────────────────────────────────────────────────────────────────┘│
│           ▲                                                          │
│           │ Read/Write                                               │
│           │                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                   WORKFLOWS (17 Jobs)                             ││
│  │                                                                   ││
│  │  STREAMING (always-on):                                          ││
│  │    Agent 01 - Raw Event Ingestion (Kafka/EventHub/S3)            ││
│  │    Agent 02 - Event Enrichment Pipeline                          ││
│  │    Agent 05 - Streaming Correlation Engine (CEP)                 ││
│  │    Agent 09 - Temporal Window Correlator                         ││
│  │    Agent 12 - Threat Intel IOC Matching                          ││
│  │                                                                   ││
│  │  SCHEDULED (high-frequency):                                     ││
│  │    Agent 07 - Negative Correlation (every 5 min)                 ││
│  │    Agent 03 - Schema Enforcement (every 5 min)                   ││
│  │    Agent 15 - Automated Response (every 2 min)                   ││
│  │    Agent 25 - LLM Triage Agent (every 3 min)                     ││
│  │    Agent 26 - LLM Enrichment Agent (every 5 min)                 ││
│  │    Agent 16 - Case Management (every 5 min)                      ││
│  │    Agent 08 - Graph Correlation (every 10 min)                   ││
│  │    Agent 30 - Multi-Agent Orchestrator (every 10 min)            ││
│  │    Agent 10 - Behavioral Anomaly ML (every 15 min)               ││
│  │    Agent 04 - Quarantine Handler (every 15 min)                  ││
│  │                                                                   ││
│  │  BATCH:                                                          ││
│  │    Agent 21 - Feature Engineering (daily)                        ││
│  │    Agent 20 - ML Model Training (weekly, MLflow)                 ││
│  │    Agent 27 - Autonomous Threat Hunter (every 4 hours)           ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │               DELTA LIVE TABLES PIPELINE                          ││
│  │  Bronze (quality checks) → Silver (dedup/enrich) → Gold (aggs)  ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │               FOUNDATION MODEL APIS                               ││
│  │  Llama 3.1 70B (triage, enrichment, hunting, chat, rules)       ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                       │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │               MLFLOW MODEL REGISTRY                               ││
│  │  threat_scoring_model (GBT, retrained weekly, served via SQL)   ││
│  └─────────────────────────────────────────────────────────────────┘│
│                                                                       │
└──────────────────────────────────────────────────────────────────────┘
```

## Deployment

### Option A: Databricks CLI (Recommended)

```bash
cd databricks-native
./deploy.sh production
```

### Option B: Databricks UI (No CLI Required)

1. **Upload Notebooks**: Workspace > Import > Upload all `.py` files
2. **Run Setup**: Execute `setup/01_create_catalog_schema` (creates all tables)
3. **Create Jobs**: Workflows > Create Job for each agent notebook
4. **Create DLT Pipeline**: Workflows > DLT > Create with 3 pipeline notebooks
5. **Deploy App**: Apps > Create > Upload `app/` folder > Deploy

### Option C: Git Integration

1. Push this `databricks-native/` directory to a Git repo
2. Apps > Create > Connect Git repo > Select `app/` subdirectory
3. Workflows > Create jobs referencing notebook paths in the repo

## Prerequisites

- Databricks workspace with **Unity Catalog** enabled
- **Serverless SQL Warehouse** (or provisioned warehouse)
- **Foundation Model APIs** enabled (for LLM agents)
- Node.js >= 20 (for local builds; not needed for Git deploy)

## Post-Deployment

### 1. Configure SQL Warehouse
Set `DATABRICKS_WAREHOUSE_ID` in the App environment settings.

### 2. Create Secret Scope
```bash
databricks secrets create-scope soc-secrets
databricks secrets put-secret soc-secrets kafka_brokers
```

### 3. Start Streaming Jobs
Start the 5 streaming jobs from Workflows UI.

## Databricks Features Used

| Feature | How Used |
|---------|----------|
| Unity Catalog | 70+ Delta tables, ML models, feature tables |
| Databricks Apps | React + FastAPI web application with SSO |
| Serverless SQL Warehouse | Backend API queries |
| Structured Streaming | 5 real-time ingestion/correlation jobs |
| Workflows | 17 scheduled agent jobs |
| Delta Live Tables | Bronze/Silver/Gold medallion pipeline |
| Foundation Model APIs | LLM agents (triage, enrichment, hunting) |
| MLflow | Threat scoring model training & registry |
| Secrets | External service credentials (Kafka, etc.) |
| Compute | Auto-scaling job clusters |

## Targets

| Target | Catalog | Purpose |
|--------|---------|---------|
| dev | soc_platform_dev | Development |
| staging | soc_platform_staging | Pre-production |
| production | soc_platform | Live operations |
