# 0xDSI Production Connector Architecture Plan

## Overview

The connector ecosystem has three layers. Each uses only Databricks-native features
(no external orchestrators, no Lambda, no separate infrastructure).

---

## Layer 1: Streaming Ingestion (Real-Time Events)

**Existing Notebooks:**
- `ingestion/01_raw_event_ingestion.py` — Primary Kafka/EventHub/Kinesis consumer
- `ingestion/05_kafka_eventhub_connector.py` — Multi-source with failover + CEF/Syslog parsing

**Production Deployment:**

```
┌────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│ Your SIEM Sources  │────▶│ Kafka / EventHub     │────▶│  01 or 05       │
│ (Firewalls, EDR,   │     │ (Message Broker)     │     │  Ingestion      │
│  Cloud, Identity)  │     │                      │     │  Notebook       │
└────────────────────┘     └──────────────────────┘     └───────┬─────────┘
                                                                │
                                                    writes to Delta
                                                                │
                                                    ┌───────────▼─────────────┐
                                                    │  events (Bronze table)  │
                                                    └─────────────────────────┘
```

**How to Activate:**

1. Store broker credentials in Databricks Secret Scope (`soc-secrets`):
   ```
   databricks secrets put-secret soc-secrets kafka_brokers --string-value "broker1:9092,broker2:9092"
   databricks secrets put-secret soc-secrets kafka_sasl_username --string-value "your_username"
   databricks secrets put-secret soc-secrets kafka_sasl_password --string-value "your_password"
   ```

2. For Azure Event Hubs:
   ```
   databricks secrets put-secret soc-secrets eventhub_connection --string-value "Endpoint=sb://..."
   ```

3. For file-based ingestion (easiest to start):
   - Upload JSON/CEF files to Volume: `/Volumes/<catalog>/<schema>/data/landing/security-events/`
   - Set `source_type=autoloader` in the job parameter
   - Autoloader auto-discovers new files with no broker needed

4. Deploy the streaming job as **continuous** (not scheduled):
   ```yaml
   # In jobs.yml, change schedule to continuous:
   kafka_ingestion:
     continuous:
       pause_status: "UNPAUSED"
   ```

**Expected Event Format (JSON):**
```json
{
  "event_type": "authentication_failure",
  "timestamp": "2025-01-15T14:32:00Z",
  "source_ip": "10.0.1.55",
  "dest_ip": "192.168.1.10",
  "user_id": "usr_12345",
  "username": "john.smith",
  "hostname": "DC-PRIMARY",
  "action": "login",
  "outcome": "failure",
  "severity": "medium",
  "description": "Failed login attempt via RDP - 5th attempt in 2 minutes",
  "raw_log": "<raw syslog or CEF string>"
}
```

---

## Layer 2: Connector Adapter (Format Normalization)

**Existing Notebook:** `agents/23_connector_adapter.py`

**What it does:** Takes raw ingested events that are NOT in standard JSON format
and normalizes them to OCSF schema. Handles CEF, LEEF, Syslog RFC5424.

**Production flow:**
```
events (raw)  ──▶  23_connector_adapter  ──▶  events (OCSF-normalized)
                   (parses formats)            (enriched with ocsf_category,
                                                ocsf_class, normalized fields)
```

**No action needed** — this runs automatically every 5 minutes on the `raw_ingestion_queue`.

---

## Layer 3: Vibe Connector Builder (LLM-Generated Connectors)

**Existing Notebooks:**
- `agents/31_vibe_connector_builder.py` — LLM generates connector code from specs
- `agents/29_connector_version_agent.py` — Monitors schema drift between versions

**Production Architecture:**

```
┌──────────────────────┐     ┌────────────────────────┐     ┌───────────────────┐
│  UI: ConnectorVibe   │────▶│  connector_requests    │────▶│  31_vibe_builder  │
│  Builder page        │     │  (Delta table)         │     │  (LLM generation) │
└──────────────────────┘     └────────────────────────┘     └────────┬──────────┘
                                                                     │
                                                          generates Python code
                                                                     │
                                                         ┌───────────▼───────────┐
                                                         │  generated_connectors │
                                                         │  (code + config)      │
                                                         └───────────┬───────────┘
                                                                     │
                                                              human review
                                                                     │
                                                         ┌───────────▼───────────┐
                                                         │  Deploy to Volume     │
                                                         │  as runtime plugin    │
                                                         └───────────────────────┘
```

**Making Vibe Connectors Actually Run in Production:**

The generated connectors live in `generated_connectors` table as code strings.
To make them executable:

### Option A: Volume-Based Plugin Runtime (Recommended)

1. After human approval, the code is written to a Unity Catalog Volume:
   ```
   /Volumes/<catalog>/<schema>/connectors/<module_name>.py
   ```

2. A new notebook (`agents/42_connector_runtime.py`) dynamically imports and executes
   approved connectors on schedule:
   ```python
   # Load approved connectors from Volume
   import importlib.util
   connector_path = f"/Volumes/{catalog}/{schema}/connectors/{module_name}.py"
   spec = importlib.util.spec_from_file_location(module_name, connector_path)
   mod = importlib.util.module_from_spec(spec)
   spec.loader.exec_module(mod)
   connector = mod.ConnectorClass(config)
   events = connector.fetch()
   ```

3. Benefits:
   - No redeployment needed for new connectors
   - Hot-reload: new connectors activate on next scheduled run
   - Unity Catalog governs access (who can write to the Volume)
   - Audit trail: connector code is versioned in Delta via `generated_connectors`

### Option B: Databricks App Webhook (For Pull-Based APIs)

For sources that push data (webhooks), deploy a lightweight endpoint via
Databricks Apps that receives HTTP and writes to a landing Volume:

```python
# databricks-native/app/backend/webhook_receiver.py
@app.post("/webhook/{source_name}")
async def receive_webhook(source_name: str, request: Request):
    body = await request.json()
    # Write to landing path for Autoloader pickup
    path = f"/Volumes/{catalog}/{schema}/data/landing/{source_name}/{uuid4()}.json"
    with open(path, "w") as f:
        json.dump(body, f)
    return {"status": "queued"}
```

This turns webhook-based sources (GitHub, Slack, PagerDuty, etc.) into
file-based events that the Autoloader connector picks up automatically.

---

## Layer 4: External Threat Intel Feeds

**Existing Notebook:** `ingestion/06_threat_feed_connector.py`

**Supported feeds:** OTX, AbuseIPDB, MISP, VirusTotal

**To activate:**
```
databricks secrets put-secret soc-secrets otx_api_key --string-value "your_key"
databricks secrets put-secret soc-secrets abuseipdb_api_key --string-value "your_key"
databricks secrets put-secret soc-secrets misp_url --string-value "https://misp.example.com"
databricks secrets put-secret soc-secrets misp_api_key --string-value "your_key"
databricks secrets put-secret soc-secrets virustotal_api_key --string-value "your_key"
```

---

## Layer 5: UI Bridge (Databricks → Supabase)

**New Notebook:** `ingestion/08_supabase_ui_sync.py`

**What it does:** Reads Delta tables and pushes rows to Supabase via PostgREST API.
This makes detection results visible in the React UI without switching the frontend
data source.

**To activate:**
```
databricks secrets put-secret soc-secrets supabase_url --string-value "https://xxx.supabase.co"
databricks secrets put-secret soc-secrets supabase_service_role_key --string-value "eyJ..."
```

**Sync frequency:** Every 1 minute for critical tables (alerts, cases, events).

---

## Deployment Sequence (Day 1)

| Step | Action | Time |
|------|--------|------|
| 1 | Run `initial_setup` job (creates tables, seeds reference data) | 5 min |
| 2 | Configure secrets (broker + Supabase credentials) | 10 min |
| 3 | Start `kafka_ingestion` job (or `autoloader` for file-based) | 2 min |
| 4 | Verify events flowing: `SELECT COUNT(*) FROM events WHERE ingested_at > now() - INTERVAL 5 MINUTES` | 1 min |
| 5 | Start `soc_core_pipeline` (detection → confluence → triage → response → sync) | 2 min |
| 6 | Start `supabase_ui_sync` for continuous UI updates | 1 min |
| 7 | Verify UI shows real data in alerts/cases/events panels | 2 min |

**Total time to first real detection: ~25 minutes** (includes KS baseline cold-start warm-up)

---

## Connector Catalog (What Can Be Connected Today)

| Source Type | Protocol | Notebook | Config Required |
|-------------|----------|----------|-----------------|
| Kafka (any) | Kafka protocol | 01 / 05 | `kafka_brokers`, optional SASL |
| Azure Event Hubs | Kafka protocol | 01 / 05 | `eventhub_connection` |
| AWS Kinesis | Kinesis SDK | 01 / 05 | `kinesis_access_key`, `kinesis_secret_key` |
| File drops (S3/ADLS/GCS) | Autoloader | 01 / 05 | Just drop files in Volume |
| OTX AlienVault | REST API | 06 | `otx_api_key` |
| AbuseIPDB | REST API | 06 | `abuseipdb_api_key` |
| MISP | REST API | 06 | `misp_url`, `misp_api_key` |
| VirusTotal | REST API | 06 | `virustotal_api_key` |
| Webhooks (any) | HTTP POST | App webhook | Deploy Databricks App |
| Custom (Vibe) | LLM-generated | 31 → Volume | Describe in UI, approve |

---

## Artifacts That Live Outside Databricks

| Artifact | Location | Purpose |
|----------|----------|---------|
| React UI | Deployed web app (Supabase hosting or Vercel) | Analyst interface |
| Supabase DB | Managed PostgreSQL | UI data store + auth |
| Secret Scope | Databricks workspace | API keys, broker creds |
| Kafka/EventHub | Cloud-managed (Confluent/Azure/AWS) | Event bus |
| Landing Volume | Unity Catalog Volume | File-based ingestion |

---

## Scaling Considerations

- **10K EPS:** Single-node cluster, 10s trigger, default `maxOffsetsPerTrigger=100000`
- **100K EPS:** Multi-node cluster, adaptive backpressure enabled, topics sharded
- **1M+ EPS:** Multiple connector instances (one per topic group), Photon enabled,
  Delta Lake auto-optimize handles file compaction automatically

The Lakebase sync (`07_lakebase_sync.py`) adds a serving layer with Z-ORDER indexing
for sub-second point queries without impacting the streaming pipeline.
