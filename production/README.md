# 0xDSI Production Deployment

Production-grade code for deploying the 0xDSI Security Intelligence Platform
on Databricks Lakehouse.

## Architecture

```
production/
├── agents/           # AI Agent orchestration (Python, deploy as serving endpoints)
│   ├── core/         # Base agent framework (LLM loop, tools, memory, HITL)
│   ├── agents/       # Specialized agents (triage, enrichment, hunting, response)
│   ├── tools/        # Agent-callable tools (Delta queries, TI, graph, response actions)
│   └── config/       # Prompts, thresholds, escalation matrix
│
├── notebooks/        # Databricks notebooks (deploy via DABs)
│   ├── ingestion/    # Bronze/Silver pipeline (multi-source streaming ingest)
│   ├── correlation/  # Detection engines (streaming, temporal, graph, negative)
│   ├── detection/    # ML-based detection (UEBA baselines, anomaly scoring)
│   ├── response/     # Automated response orchestration
│   ├── ml_training/  # Model lifecycle (features, training, evaluation, serving)
│   └── operational/  # Health monitoring, data quality, cost optimization
│
├── pipelines/        # Delta Live Tables definitions
│   ├── bronze_ingestion.py
│   ├── silver_normalization.py
│   ├── gold_analytics.py
│   └── expectations.py
│
├── streaming/        # Standalone streaming jobs
│
├── deployment/       # Databricks Asset Bundles config
│   └── databricks.yml
│
└── tests/            # Test suite
```

## Deployment

### Prerequisites
- Databricks workspace with Unity Catalog enabled
- Service principal with appropriate grants
- Kafka/Event Hub or cloud storage for event sources
- Databricks CLI configured

### Deploy with DABs

```bash
# Validate configuration
databricks bundle validate --target prod

# Deploy all resources
databricks bundle deploy --target prod

# Start streaming jobs
databricks bundle run streaming_correlation --target prod
databricks bundle run temporal_correlation --target prod
databricks bundle run enrichment_pipeline --target prod
```

### Agent Deployment

Agents are deployed as Databricks Model Serving endpoints:

```bash
# Package agent code
cd production/agents
pip install -e .

# Register agent model with MLflow
python -m agents.deploy --agent triage_agent --endpoint security-triage

# Verify endpoint
curl -X POST https://<workspace>/serving-endpoints/security-triage/invocations \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"alert": {...}}'
```

## Configuration

All configuration is parameterized via:
1. **DABs variables** (databricks.yml) — environment-level settings
2. **Notebook widgets** (dbutils.widgets) — runtime parameters
3. **Secrets scope** (dbutils.secrets) — API keys, credentials
4. **Agent config** (config/) — thresholds, prompts, escalation rules

## Data Flow

```
Sources (Kafka/S3/APIs)
    ↓
[Bronze] Raw events (append-only, immutable)
    ↓
[Silver] Normalized OCSF (schema-enforced, enriched)
    ↓
[Gold] Aggregated metrics (dashboards, features)
    ↓
[Correlation Engine] → Alerts
    ↓
[Agent Pipeline] Triage → Enrich → Investigate → Respond
    ↓
[Cases] Full incident lifecycle
```

## Key Design Decisions

1. **OCSF normalization** — All events normalized to Open Cybersecurity Schema Framework
   for cross-source correlation regardless of original format.

2. **Stateful streaming** — Correlation uses watermarks and checkpoints for exactly-once
   processing and late-event handling.

3. **Feature Store** — ML features are versioned and served via Databricks Feature Store
   for consistent online/offline computation.

4. **Agent tool-use loop** — Agents reason via LLM + tool calls, not scripted workflows.
   They adapt to novel situations rather than following fixed playbooks.

5. **Human-in-the-loop** — Architecturally enforced approval gates for all response actions
   above "low" risk level. Agents cannot bypass HITL.

6. **Negative correlation** — Unique detection of threat evasion by identifying
   expected events that didn't occur (MFA bypass, missing DNS, etc.)
