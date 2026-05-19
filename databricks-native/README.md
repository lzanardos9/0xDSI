# 0xDSI Agentic SOC - Databricks Native Package

Complete deployment package for running the 0xDSI Agentic SOC platform natively on Databricks.

## What's Included

```
databricks-native/
├── databricks.yml              # DAB bundle manifest
├── deploy.sh                   # One-command deployment script
├── app/                        # Databricks App (React + FastAPI)
│   ├── app.yaml                # App runtime config
│   ├── package.json            # Node.js dependencies
│   ├── requirements.txt        # Python dependencies
│   ├── backend/server.py       # FastAPI backend (queries SQL Warehouse)
│   └── frontend/src/lib/       # Data client (replaces Supabase)
├── notebooks/
│   ├── setup/                  # Schema creation (run once)
│   ├── ingestion/              # Streaming event ingestion + enrichment
│   ├── correlation/            # CEP engine + negative correlation
│   ├── detection/              # Behavioral ML + threat intel matching
│   ├── response/               # Auto-response + case management
│   ├── ml_training/            # Threat scoring model (MLflow)
│   └── pipelines/              # DLT Bronze/Silver/Gold
└── resources/
    ├── jobs.yml                # All agent job definitions
    ├── pipelines.yml           # DLT pipeline definition
    └── app.yml                 # App resource definition
```

## Prerequisites

1. Databricks workspace with Unity Catalog enabled
2. Databricks CLI installed and authenticated (`databricks auth login`)
3. Node.js >= 20
4. Python >= 3.10
5. A Serverless SQL Warehouse (or provisioned)

## Deployment

```bash
# Deploy to dev (default)
./deploy.sh

# Deploy to production
./deploy.sh production
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Databricks Workspace                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐     ┌──────────────────────────────────┐ │
│  │ Databricks   │     │         Unity Catalog              │ │
│  │ App (React + │────▶│  soc_platform.agentic_soc.*       │ │
│  │ FastAPI)     │     │  (70+ Delta tables)               │ │
│  └──────────────┘     └──────────────────────────────────┘ │
│         │                           ▲                        │
│         │ SQL Warehouse             │ Write                  │
│         ▼                           │                        │
│  ┌──────────────┐     ┌──────────────────────────────────┐ │
│  │ Serverless   │     │         Agent Jobs                 │ │
│  │ SQL Warehouse│     │  - Ingestion (streaming)          │ │
│  └──────────────┘     │  - Enrichment (streaming)         │ │
│                        │  - Correlation (streaming)        │ │
│                        │  - Negative Correlation (5min)    │ │
│                        │  - Behavioral Detection (15min)   │ │
│                        │  - Threat Intel Matching          │ │
│                        │  - Auto Response (2min)           │ │
│                        │  - Case Management (5min)         │ │
│                        │  - ML Training (weekly)           │ │
│                        └──────────────────────────────────┘ │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            DLT Pipeline (Medallion)                    │   │
│  │  Bronze (raw) → Silver (normalized) → Gold (analytics)│   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            MLflow Model Registry                       │   │
│  │  threat_scoring_model (GBT, retrained weekly)         │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Post-Deployment Configuration

### 1. Set SQL Warehouse ID
In the Databricks Apps UI, set the `DATABRICKS_WAREHOUSE_ID` environment variable
to your Serverless SQL Warehouse ID.

### 2. Configure Data Sources
Edit the ingestion notebook parameters:
- Kafka: Set `kafka_brokers` in `soc-secrets` scope
- Event Hub: Set `eventhub_connection` in `soc-secrets` scope
- S3/ADLS: Set `s3_raw_events_path` in `soc-secrets` scope

### 3. Create Secret Scope
```bash
databricks secrets create-scope soc-secrets
databricks secrets put-secret soc-secrets kafka_brokers
databricks secrets put-secret soc-secrets eventhub_connection
```

### 4. Start Streaming Jobs
After setup completes, manually start the streaming jobs from the Workflows UI
or let their schedules trigger them.

## Migrating from Supabase Demo

To use this in your frontend code, replace:
```typescript
import { supabase } from './lib/supabase';
const { data } = await supabase.from('alerts').select('*');
```

With:
```typescript
import { db } from './lib/databricksClient';
const { data } = await db.from('alerts').select('*').execute();
```

The API shape is intentionally compatible - minimal code changes needed.

## Targets

| Target | Catalog | Use Case |
|--------|---------|----------|
| dev | soc_platform_dev | Development/testing |
| staging | soc_platform_staging | Pre-production |
| production | soc_platform | Live customer data |
