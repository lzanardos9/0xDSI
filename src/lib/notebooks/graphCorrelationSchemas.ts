import { DatabricksNotebook } from '../databricksNotebooks';

export const graphCorrelationSchemasNotebook: DatabricksNotebook = {
  id: 'graph-correlation-schemas',
  title: 'SIEM Graph Correlation Engine - Schemas, Identity Graph & Ingestion',
  subtitle: 'Next-gen threat graph: Bronze/Silver layers, identity resolution, behavioral fingerprints, attack chain schemas',
  category: 'correlation',
  tags: ['GraphFrames', 'Structured Streaming', 'Delta Lake', 'Entity Resolution', 'SIEM', 'Identity Graph', 'Kill Chain', 'Campaign Tracking'],
  description: 'Part 1 of the SIEM Graph Correlation Engine solution accelerator. Defines the complete data model including attack_chains, campaigns, behavioral_fingerprints, identity_graph, sequence_templates, and deception_signals tables. Implements multi-source Bronze ingestion with honeypot signals, Silver normalization with rarity scoring, and a unified identity resolution graph across IAM/endpoint/network/SaaS/cloud.',
  estimatedRuntime: '14 min',
  clusterRequirements: 'DBR 14.3 LTS ML, 8+ workers, Delta Lake, Unity Catalog',
  cells: [
    {
      type: 'markdown',
      content: `# SIEM Graph Correlation Engine - Part 1: Schemas & Ingestion

## Next-Generation Graph-Native Threat Intelligence Platform

This three-notebook suite implements a **graph-native behavioral and predictive threat engine**
with temporal reasoning, partial pattern memory, multi-hop correlation, and 13 advanced
detection capabilities that go far beyond traditional rule-based SIEM correlation.

### Full Capability Matrix

| # | Capability | Notebook | Description |
|---|-----------|----------|-------------|
| 1 | Kill-Chain Reconstruction | 2 | Links events across time/entities into coherent attack graphs |
| 2 | Temporal Sequence Intelligence | 2 | Detects anomalous sequences, missing transitions, compressed timelines |
| 3 | Graph Risk Propagation | 2 | Weighted risk propagation with decay across entity relationships |
| 4 | Identity Resolution Graph | 1 | Unified identity across IAM, endpoint, network, SaaS, cloud |
| 5 | Behavioral Fingerprinting | 2 | Per-entity behavioral profiles with drift detection |
| 6 | Graph Rarity Detection | 3 | Rare edges, nodes, subgraphs as scoring multipliers |
| 7 | Lateral Movement Prediction | 3 | Predictive next-target estimation from graph topology |
| 8 | Real-Time Blast Radius | 3 | Reachable entity computation for high-risk nodes |
| 9 | Campaign Detection | 3 | Clusters alerts into campaigns via shared infrastructure |
| 10 | Adaptive Thresholding | 2 | Dynamic thresholds from rolling baselines and percentiles |
| 11 | Intent Inference | 3 | Maps graph patterns to attacker intent stages |
| 12 | Deception Detection | 1,3 | Honeypot/decoy signal integration with risk amplification |
| 13 | Graph Compression | 3 | Collapses low-value edges, highlights attack paths |

### Architecture

\`\`\`
                    NEXT-GEN SIEM GRAPH CORRELATION ENGINE
  +-------------------------------------------------------------------------+
  |                                                                         |
  |  INGESTION          ENRICHMENT            GRAPH INTELLIGENCE            |
  |  +-----------+      +--------------+      +------------------------+    |
  |  | IAM       |      | Silver       |      | LIVE THREAT GRAPH      |    |
  |  | VPN       |      | Normalization|      |   vertices_current     |    |
  |  | EDR       | ---> | + Entity IDs | ---> |   edges_current        |    |
  |  | DNS       |      | + Rarity     |      |   entity_state         |    |
  |  | Network   |      | + Identity   |      |   identity_graph       |    |
  |  | Cloud     |      |   Resolution |      |   behavioral_prints    |    |
  |  | Email     |      +--------------+      +------------------------+    |
  |  | Threat    |            |                         |                   |
  |  |   Intel   |            v                         v                   |
  |  | Honeypots |   transformWithState          DETECTION ENGINES          |
  |  +-----------+   (Notebook 2)                (Notebook 3)               |
  |                  - Kill-chain builder         - Blast radius            |
  |                  - Temporal sequences          - Campaign clustering    |
  |                  - Risk propagation            - Intent inference       |
  |                  - Behavioral prints           - Lateral prediction     |
  |                  - Adaptive thresholds         - Graph rarity           |
  |                  - Deception signals            - Graph compression     |
  |                                                                         |
  |  OUTPUTS: attack_chains | campaigns | detections_gold | SOAR alerts     |
  +-------------------------------------------------------------------------+
\`\`\`

### Extended Data Model

| Table | Layer | Purpose |
|-------|-------|---------|
| \`bronze_events\` | Bronze | Raw JSON including honeypot/deception signals |
| \`silver_events\` | Silver | Canonical schema with entity IDs and rarity scores |
| \`vertices_current\` | Graph | Entity vertices with rarity_score, intent_stage, propagated_risk |
| \`edges_current\` | Graph | Relationship edges with path_id, campaign_id, rarity_score |
| \`entity_state_current\` | Graph | Behavioral profiles with drift scores and fingerprints |
| \`identity_graph\` | Graph | Unified identity resolution across all sources |
| \`behavioral_fingerprints\` | Graph | Per-entity behavioral baselines and patterns |
| \`attack_chains\` | Graph | Reconstructed kill-chain paths with MITRE mapping |
| \`campaigns\` | Graph | Detected campaign clusters with evolution tracking |
| \`sequence_templates\` | Config | Expected event sequence patterns for anomaly detection |
| \`deception_signals\` | Graph | Honeypot/decoy interaction events |
| \`open_attack_patterns\` | Graph | Partial patterns in flight |
| \`detections_gold\` | Gold | Finalized detections with graph explanations |

### Modular Project Structure

\`\`\`
graph_correlation_engine/
  schemas/                          # Explicit PySpark StructType objects
  normalization/                    # Source-specific field mappers
  entity_resolution/                # Deterministic entity ID + identity graph
  identity/                         # Cross-source identity resolution
  stateful_runtime/
    processor.py                    # transformWithState core
    kill_chain_builder.py           # Multi-stage attack graph reconstruction
    sequence_tracker.py             # Temporal sequence intelligence
    risk_propagator.py              # Graph-based risk propagation
    behavioral_fingerprint.py       # Per-entity behavioral profiles
    adaptive_thresholds.py          # Dynamic threshold computation
    pattern_memory.py               # Partial pattern candidate manager
  graph_materialization/            # Delta MERGE for all graph tables
  graph_queries/
    rarity_engine.py                # Graph rarity detection
    lateral_predictor.py            # Next-target prediction
    blast_radius.py                 # Reachable entity computation
    campaign_detector.py            # Campaign clustering + evolution
    intent_inference.py             # Attacker intent stage mapping
    deception_detector.py           # Honeypot signal processing
    graph_compressor.py             # Low-value edge collapse
  scoring/                          # 10-dimension scoring engine
  outputs/                          # SOAR, Kafka, webhook emission
  tests/                            # Comprehensive unit + integration tests
\`\`\``
    },
    {
      type: 'code',
      content: `# Cell 1: Configuration & Catalog Setup
from pyspark.sql import functions as F
from pyspark.sql.types import *
import json
from datetime import datetime, timedelta
import uuid
import hashlib

CATALOG = "soc_platform"
SCHEMA_BRONZE = "graph_bronze"
SCHEMA_SILVER = "graph_silver"
SCHEMA_GRAPH = "graph_live"
SCHEMA_GOLD = "graph_detections"

for s in [SCHEMA_BRONZE, SCHEMA_SILVER, SCHEMA_GRAPH, SCHEMA_GOLD]:
    spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS {CATALOG}.{s}")

DETECTION_CONFIG = {
    "password_spray": {
        "min_distinct_users": 5, "window_seconds": 300,
        "max_success_ratio": 0.2, "cooldown_seconds": 600,
    },
    "lateral_movement": {
        "min_hops": 2, "window_seconds": 3600,
        "min_confidence": 0.6, "ttl_seconds": 7200,
    },
    "rare_process_domain": {
        "process_rarity_threshold": 0.01,
        "domain_rarity_threshold": 0.005, "lookback_days": 30,
    },
    "cloud_credential_abuse": {
        "max_region_spread": 3, "window_seconds": 1800,
        "api_burst_threshold": 50, "impossible_travel_km": 500,
    },
    "kill_chain": {
        "max_chain_duration_hours": 72,
        "min_stages_for_detection": 3,
        "merge_overlap_threshold": 0.3,
    },
    "sequence_anomaly": {
        "compressed_timeline_factor": 0.25,
        "missing_transition_penalty": 0.3,
        "unknown_sequence_boost": 0.5,
    },
    "risk_propagation": {
        "decay_factor": 0.7,
        "max_hops": 4,
        "privilege_escalation_multiplier": 2.5,
        "anomaly_density_multiplier": 1.8,
    },
    "identity_resolution": {
        "device_sharing_threshold": 3,
        "session_reuse_window_minutes": 30,
        "identity_hop_alert_count": 2,
    },
    "behavioral": {
        "drift_threshold_stddev": 2.5,
        "fingerprint_window_days": 30,
        "min_events_for_baseline": 50,
    },
    "campaign": {
        "infra_overlap_threshold": 0.4,
        "temporal_window_hours": 48,
        "behavioral_similarity_threshold": 0.6,
    },
    "blast_radius": {
        "max_depth": 5,
        "privilege_weight": 3.0,
        "recency_decay_hours": 24,
    },
    "deception": {
        "honeypot_risk_multiplier": 5.0,
        "decoy_confidence_boost": 0.4,
    },
    "adaptive_thresholds": {
        "baseline_window_hours": 168,
        "percentile_threshold": 95,
        "min_samples": 100,
    },
    "intent_inference": {
        "recon_weight": 0.15, "credential_weight": 0.20,
        "lateral_weight": 0.25, "persistence_weight": 0.15,
        "exfil_weight": 0.25,
    },
    "state_management": {
        "entity_profile_ttl_hours": 72, "adjacency_ttl_hours": 24,
        "pattern_candidate_ttl_hours": 4, "out_of_order_tolerance_minutes": 15,
    },
    "graph": {
        "vertex_ttl_hours": 168, "edge_ttl_hours": 72, "min_edge_weight": 1,
    },
}

spark.conf.set("spark.sql.shuffle.partitions", "200")
spark.conf.set("spark.databricks.delta.optimizeWrite.enabled", "true")
spark.conf.set("spark.databricks.delta.autoCompact.enabled", "true")

print(f"Next-Gen Graph Correlation Engine initialized")
print(f"  Catalog: {CATALOG}")
print(f"  Detection configs: {len(DETECTION_CONFIG)} modules")
print(f"  Advanced capabilities: 13")`
    },
    {
      type: 'sql',
      content: `-- Cell 2: Core Layer Schemas (Bronze + Silver)

CREATE TABLE IF NOT EXISTS soc_platform.graph_bronze.bronze_events (
  event_id         STRING       NOT NULL,
  ingestion_time   TIMESTAMP    NOT NULL DEFAULT current_timestamp(),
  source_system    STRING       NOT NULL,
  source_type      STRING       NOT NULL,
  event_time_raw   STRING,
  raw_payload      STRING       NOT NULL,
  raw_format       STRING       DEFAULT 'json',
  schema_version   INT          DEFAULT 1,
  is_deception     BOOLEAN      DEFAULT false,
  partition_date   DATE         GENERATED ALWAYS AS (CAST(ingestion_time AS DATE)),
  _rescued_data    STRING
)
USING DELTA
PARTITIONED BY (source_type, partition_date)
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.logRetentionDuration' = 'interval 30 days'
);

CREATE TABLE IF NOT EXISTS soc_platform.graph_silver.silver_events (
  event_id           STRING       NOT NULL,
  event_time         TIMESTAMP    NOT NULL,
  source_system      STRING       NOT NULL,
  source_type        STRING       NOT NULL,
  event_type         STRING       NOT NULL,
  event_subtype      STRING,
  user_id            STRING,
  host_id            STRING,
  src_ip             STRING,
  dst_ip             STRING,
  src_port           INT,
  dst_port           INT,
  process_name       STRING,
  process_hash       STRING,
  parent_process     STRING,
  domain             STRING,
  url                STRING,
  cloud_resource_id  STRING,
  cloud_provider     STRING,
  cloud_region       STRING,
  api_action         STRING,
  outcome            STRING,
  severity           STRING       NOT NULL DEFAULT 'info',
  risk_score         DOUBLE       DEFAULT 0.0,
  rarity_score       DOUBLE       DEFAULT 0.0,
  is_deception       BOOLEAN      DEFAULT false,
  geo_country        STRING,
  geo_city           STRING,
  user_agent         STRING,
  session_id         STRING,
  attrs              MAP<STRING, STRING>,
  entity_user_id     STRING,
  entity_host_id     STRING,
  entity_src_ip_id   STRING,
  entity_dst_ip_id   STRING,
  entity_process_id  STRING,
  entity_domain_id   STRING,
  entity_cloud_id    STRING,
  entity_alert_id    STRING,
  entity_session_id  STRING,
  normalized_at      TIMESTAMP    DEFAULT current_timestamp(),
  partition_date     DATE         GENERATED ALWAYS AS (CAST(event_time AS DATE))
)
USING DELTA
PARTITIONED BY (source_type, partition_date)
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);`
    },
    {
      type: 'sql',
      content: `-- Cell 3: Extended Graph Layer Schemas

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.vertices_current (
  vertex_id         STRING       NOT NULL,
  entity_type       STRING       NOT NULL,
  canonical_id      STRING       NOT NULL,
  display_name      STRING,
  properties        MAP<STRING, STRING>,
  risk_score        DOUBLE       DEFAULT 0.0,
  propagated_risk   DOUBLE       DEFAULT 0.0,
  rarity_score      DOUBLE       DEFAULT 0.0,
  intent_stage      STRING,
  criticality       STRING       DEFAULT 'normal',
  campaign_ids      ARRAY<STRING>,
  first_seen        TIMESTAMP    NOT NULL,
  last_seen         TIMESTAMP    NOT NULL,
  event_count       BIGINT       DEFAULT 0,
  is_active         BOOLEAN      DEFAULT true,
  is_honeypot       BOOLEAN      DEFAULT false,
  updated_at        TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.edges_current (
  edge_id           STRING       NOT NULL,
  src_vertex_id     STRING       NOT NULL,
  dst_vertex_id     STRING       NOT NULL,
  edge_type         STRING       NOT NULL,
  weight            DOUBLE       DEFAULT 1.0,
  evidence_count    BIGINT       DEFAULT 1,
  rarity_score      DOUBLE       DEFAULT 0.0,
  path_id           STRING,
  campaign_id       STRING,
  properties        MAP<STRING, STRING>,
  first_seen        TIMESTAMP    NOT NULL,
  last_seen         TIMESTAMP    NOT NULL,
  is_active         BOOLEAN      DEFAULT true,
  is_compressed     BOOLEAN      DEFAULT false,
  updated_at        TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.entity_state_current (
  entity_id           STRING       NOT NULL,
  entity_type         STRING       NOT NULL,
  rolling_risk_score  DOUBLE       DEFAULT 0.0,
  propagated_risk     DOUBLE       DEFAULT 0.0,
  rarity_score        DOUBLE       DEFAULT 0.0,
  intent_stage        STRING,
  intent_confidence   DOUBLE       DEFAULT 0.0,
  event_count_1h      BIGINT       DEFAULT 0,
  event_count_24h     BIGINT       DEFAULT 0,
  distinct_peers_1h   BIGINT       DEFAULT 0,
  distinct_peers_24h  BIGINT       DEFAULT 0,
  baseline_event_rate DOUBLE       DEFAULT 0.0,
  adaptive_threshold  DOUBLE       DEFAULT 0.0,
  deviation_score     DOUBLE       DEFAULT 0.0,
  behavioral_drift    DOUBLE       DEFAULT 0.0,
  recent_actions      ARRAY<STRING>,
  recent_edge_types   ARRAY<STRING>,
  campaign_ids        ARRAY<STRING>,
  last_event_time     TIMESTAMP,
  state_updated_at    TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.identity_graph (
  identity_id         STRING       NOT NULL,
  canonical_user_id   STRING       NOT NULL,
  identity_source     STRING       NOT NULL,
  source_identifier   STRING       NOT NULL,
  identity_type       STRING       NOT NULL,
  device_ids          ARRAY<STRING>,
  ip_addresses        ARRAY<STRING>,
  session_ids         ARRAY<STRING>,
  geo_locations       ARRAY<STRING>,
  confidence          DOUBLE       DEFAULT 1.0,
  is_anomalous        BOOLEAN      DEFAULT false,
  anomaly_type        STRING,
  first_seen          TIMESTAMP    NOT NULL,
  last_seen           TIMESTAMP    NOT NULL,
  updated_at          TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.behavioral_fingerprints (
  fingerprint_id      STRING       NOT NULL,
  entity_id           STRING       NOT NULL,
  entity_type         STRING       NOT NULL,
  fingerprint_type    STRING       NOT NULL,
  login_hour_histogram    ARRAY<DOUBLE>,
  login_day_histogram     ARRAY<DOUBLE>,
  geo_distribution        MAP<STRING, DOUBLE>,
  process_tree_signature  STRING,
  domain_affinity_top10   ARRAY<STRING>,
  domain_affinity_scores  ARRAY<DOUBLE>,
  api_usage_pattern       MAP<STRING, DOUBLE>,
  port_usage_pattern      MAP<STRING, DOUBLE>,
  session_duration_avg    DOUBLE,
  session_duration_stddev DOUBLE,
  bytes_sent_avg          DOUBLE,
  bytes_sent_stddev       DOUBLE,
  drift_score             DOUBLE       DEFAULT 0.0,
  baseline_computed_at    TIMESTAMP,
  baseline_event_count    BIGINT       DEFAULT 0,
  current_window_start    TIMESTAMP,
  updated_at              TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.attack_chains (
  chain_id            STRING       NOT NULL,
  chain_name          STRING,
  kill_chain_stage    STRING       NOT NULL,
  stages_completed    ARRAY<STRING>,
  stages_total        INT          NOT NULL,
  anchor_entity       STRING       NOT NULL,
  involved_entities   ARRAY<STRING>,
  involved_vertices   ARRAY<STRING>,
  involved_edges      ARRAY<STRING>,
  evidence_events     ARRAY<STRING>,
  mitre_tactics       ARRAY<STRING>,
  mitre_techniques    ARRAY<STRING>,
  confidence          DOUBLE       DEFAULT 0.0,
  risk_score          DOUBLE       DEFAULT 0.0,
  intent_stage        STRING,
  campaign_id         STRING,
  timeline_json       STRING,
  merged_from         ARRAY<STRING>,
  first_event_time    TIMESTAMP    NOT NULL,
  last_event_time     TIMESTAMP    NOT NULL,
  is_active           BOOLEAN      DEFAULT true,
  created_at          TIMESTAMP    DEFAULT current_timestamp(),
  updated_at          TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.campaigns (
  campaign_id          STRING       NOT NULL,
  campaign_name        STRING,
  campaign_type        STRING,
  shared_infrastructure ARRAY<STRING>,
  shared_techniques     ARRAY<STRING>,
  involved_chains       ARRAY<STRING>,
  involved_entities     ARRAY<STRING>,
  behavioral_signature  STRING,
  confidence            DOUBLE       DEFAULT 0.0,
  severity              STRING       DEFAULT 'medium',
  status                STRING       DEFAULT 'active',
  evolution_log         ARRAY<STRING>,
  first_seen            TIMESTAMP    NOT NULL,
  last_seen             TIMESTAMP    NOT NULL,
  created_at            TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.sequence_templates (
  template_id         STRING       NOT NULL,
  template_name       STRING       NOT NULL,
  entity_type         STRING       NOT NULL,
  expected_sequence   ARRAY<STRING>,
  typical_duration_sec DOUBLE,
  duration_stddev_sec  DOUBLE,
  frequency_per_day    DOUBLE,
  is_suspicious        BOOLEAN      DEFAULT false,
  created_at           TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.deception_signals (
  signal_id           STRING       NOT NULL,
  honeypot_id         STRING       NOT NULL,
  honeypot_type       STRING       NOT NULL,
  interacting_entity  STRING       NOT NULL,
  interaction_type    STRING       NOT NULL,
  source_ip           STRING,
  source_user         STRING,
  evidence_event_id   STRING,
  risk_amplification  DOUBLE       DEFAULT 5.0,
  detected_at         TIMESTAMP    DEFAULT current_timestamp()
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_live.open_attack_patterns (
  pattern_id      STRING       NOT NULL,
  pattern_type    STRING       NOT NULL,
  anchor_entity   STRING       NOT NULL,
  stage           STRING       NOT NULL,
  stage_index     INT          DEFAULT 0,
  total_stages    INT          NOT NULL,
  evidence        ARRAY<STRING>,
  involved_entities ARRAY<STRING>,
  confidence      DOUBLE       DEFAULT 0.0,
  chain_id        STRING,
  campaign_id     STRING,
  created_at      TIMESTAMP    NOT NULL,
  last_updated    TIMESTAMP    NOT NULL,
  expires_at      TIMESTAMP    NOT NULL,
  is_finalized    BOOLEAN      DEFAULT false,
  finalized_as    STRING
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');

CREATE TABLE IF NOT EXISTS soc_platform.graph_detections.detections_gold (
  detection_id      STRING       NOT NULL,
  detection_type    STRING       NOT NULL,
  detection_name    STRING       NOT NULL,
  severity          STRING       NOT NULL,
  confidence        DOUBLE       NOT NULL,
  risk_score        DOUBLE       NOT NULL,
  anchor_entity     STRING       NOT NULL,
  involved_entities ARRAY<STRING>,
  involved_vertices ARRAY<STRING>,
  involved_edges    ARRAY<STRING>,
  evidence_events   ARRAY<STRING>,
  evidence_summary  STRING,
  graph_explanation  STRING,
  mitre_tactics     ARRAY<STRING>,
  mitre_techniques  ARRAY<STRING>,
  graph_context     STRING,
  scoring_factors   MAP<STRING, DOUBLE>,
  chain_id          STRING,
  campaign_id       STRING,
  intent_stage      STRING,
  blast_radius_count INT,
  rarity_multiplier  DOUBLE      DEFAULT 1.0,
  deception_triggered BOOLEAN    DEFAULT false,
  first_event_time  TIMESTAMP    NOT NULL,
  last_event_time   TIMESTAMP    NOT NULL,
  detected_at       TIMESTAMP    DEFAULT current_timestamp(),
  status            STRING       DEFAULT 'open',
  partition_date    DATE         GENERATED ALWAYS AS (CAST(detected_at AS DATE))
) USING DELTA
PARTITIONED BY (severity, partition_date)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true');`
    },
    {
      type: 'code',
      content: `# Cell 4: Multi-Source Bronze Ingestion with Auto Loader
# Production ingestion pipeline for all telemetry sources using Auto Loader.
# Each source lands JSON in a dedicated prefix; Auto Loader handles schema
# inference, evolution, and exactly-once delivery into the bronze table.

dbutils.widgets.text("ingest_base_path", "s3://soc-events-raw/graph-engine/")
dbutils.widgets.text("checkpoint_root", f"/Volumes/{CATALOG}/{SCHEMA_BRONZE}/_checkpoints")
dbutils.widgets.text("max_files_per_trigger", "500")
dbutils.widgets.text("trigger_interval", "30 seconds")

INGEST_PATH = dbutils.widgets.get("ingest_base_path")
CHECKPOINT_ROOT = dbutils.widgets.get("checkpoint_root")
MAX_FILES = int(dbutils.widgets.get("max_files_per_trigger"))
TRIGGER = dbutils.widgets.get("trigger_interval")

SOURCE_PATHS = {
    "iam": f"{INGEST_PATH}iam/",
    "vpn": f"{INGEST_PATH}vpn/",
    "edr": f"{INGEST_PATH}edr/",
    "dns": f"{INGEST_PATH}dns/",
    "network": f"{INGEST_PATH}network/",
    "cloud_audit": f"{INGEST_PATH}cloud_audit/",
    "email": f"{INGEST_PATH}email/",
    "threat_intel": f"{INGEST_PATH}threat_intel/",
    "honeypot": f"{INGEST_PATH}honeypot/",
}
BRONZE_SCHEMA = StructType([
    StructField("event_id", StringType(), False),
    StructField("ingestion_time", TimestampType(), False),
    StructField("source_system", StringType(), False),
    StructField("source_type", StringType(), False),
    StructField("event_time_raw", StringType(), True),
    StructField("raw_payload", StringType(), False),
    StructField("raw_format", StringType(), True),
    StructField("schema_version", IntegerType(), True),
    StructField("is_deception", BooleanType(), True),
])

# Auto Loader reads all source directories, inferring source_type from path
df_raw = (
    spark.readStream.format("cloudFiles")
    .option("cloudFiles.format", "json")
    .option("cloudFiles.schemaLocation", f"{CHECKPOINT_ROOT}/_schema_bronze")
    .option("cloudFiles.inferColumnTypes", "true")
    .option("cloudFiles.schemaEvolutionMode", "addNewColumns")
    .option("maxFilesPerTrigger", MAX_FILES)
    .option("pathGlobFilter", "*.json")
    .load(INGEST_PATH)
)

# Add metadata columns and normalize to bronze schema
df_bronze = (
    df_raw
    .withColumn("event_id", F.coalesce(F.col("event_id"), F.expr("uuid()")))
    .withColumn("ingestion_time", F.current_timestamp())
    .withColumn("source_type", F.element_at(F.split(F.input_file_name(), "/"), -2))
    .withColumn("source_system", F.concat(F.col("source_type"), F.lit("-collector-01")))
    .withColumn("event_time_raw",
        F.coalesce(F.col("timestamp"), F.col("event_time"), F.col("_metadata.file_modification_time")).cast("string"))
    .withColumn("raw_payload", F.to_json(F.struct("*")))
    .withColumn("raw_format", F.lit("json"))
    .withColumn("schema_version", F.lit(1))
    .withColumn("is_deception", F.col("source_type") == "honeypot")
    .select([f.name for f in BRONZE_SCHEMA.fields])
)

# Write streaming to bronze table with exactly-once semantics
query = (
    df_bronze
    .writeStream.format("delta")
    .outputMode("append")
    .option("checkpointLocation", f"{CHECKPOINT_ROOT}/bronze_events")
    .trigger(processingTime=TRIGGER)
    .queryName("graph_bronze_ingestion")
    .toTable(f"{CATALOG}.{SCHEMA_BRONZE}.bronze_events")
)

print(f"Bronze ingestion stream started: {query.id}")
print(f"  Sources: {list(SOURCE_PATHS.keys())}")
print(f"  Trigger: {TRIGGER}, MaxFiles: {MAX_FILES}")
print(f"  Checkpoint: {CHECKPOINT_ROOT}/bronze_events")`
    },
    {
      type: 'code',
      content: `# Cell 5: Silver Normalization with Rarity Scoring & Identity Resolution

def entity_id(entity_type, value):
    if not value:
        return None
    return hashlib.sha256(f"{entity_type}::{value}".encode()).hexdigest()[:24]

entity_id_udf = F.udf(entity_id, StringType())

df_bronze = spark.table(f"{CATALOG}.{SCHEMA_BRONZE}.bronze_events")
df_parsed = df_bronze.withColumn("p", F.from_json("raw_payload", MapType(StringType(), StringType())))

df_silver = (
    df_parsed
    .withColumn("event_time", F.coalesce(F.to_timestamp(F.col("p.timestamp")), F.col("ingestion_time")))
    .withColumn("event_type", F.coalesce(F.col("p.type"), F.lit("unknown")))
    .withColumn("event_subtype", F.coalesce(F.col("p.action"), F.col("p.interaction")))
    .withColumn("user_id", F.coalesce(F.col("p.user"), F.col("p.recipient"), F.col("p.src_user")))
    .withColumn("host_id", F.coalesce(F.col("p.host"), F.col("p.honeypot_id")))
    .withColumn("src_ip", F.coalesce(F.col("p.src_ip"), F.col("p.honeypot_ip")))
    .withColumn("dst_ip", F.coalesce(F.col("p.dst_ip"), F.col("p.response_ip"), F.col("p.honeypot_ip")))
    .withColumn("src_port", F.col("p.src_port").cast(IntegerType()))
    .withColumn("dst_port", F.col("p.dst_port").cast(IntegerType()))
    .withColumn("process_name", F.col("p.process"))
    .withColumn("process_hash", F.col("p.process_hash"))
    .withColumn("parent_process", F.col("p.parent_process"))
    .withColumn("domain", F.coalesce(F.col("p.query"), F.col("p.ioc_value")))
    .withColumn("url", F.lit(None).cast(StringType()))
    .withColumn("cloud_resource_id", F.col("p.resource"))
    .withColumn("cloud_provider", F.col("p.cloud_provider"))
    .withColumn("cloud_region", F.col("p.region"))
    .withColumn("api_action", F.col("p.api_action"))
    .withColumn("outcome", F.coalesce(F.col("p.outcome"), F.col("p.verdict")))
    .withColumn("severity",
        F.coalesce(F.col("p.severity"),
            F.when(F.col("p.verdict") == "malicious", "critical")
             .when(F.col("p.verdict") == "suspicious", "high")
             .otherwise("info")))
    .withColumn("risk_score", F.lit(0.0))
    .withColumn("rarity_score", F.lit(0.0))
    .withColumn("geo_country", F.col("p.geo").getItem(0))
    .withColumn("geo_city", F.col("p.geo").getItem(1))
    .withColumn("user_agent", F.col("p.user_agent"))
    .withColumn("session_id", F.col("p.session_id"))
    .withColumn("attrs", F.col("p"))
    .withColumn("entity_user_id", entity_id_udf(F.lit("user"), F.col("user_id")))
    .withColumn("entity_host_id", entity_id_udf(F.lit("host"), F.col("host_id")))
    .withColumn("entity_src_ip_id", entity_id_udf(F.lit("ip"), F.col("src_ip")))
    .withColumn("entity_dst_ip_id", entity_id_udf(F.lit("ip"), F.col("dst_ip")))
    .withColumn("entity_process_id", entity_id_udf(F.lit("process"), F.col("process_name")))
    .withColumn("entity_domain_id", entity_id_udf(F.lit("domain"), F.col("domain")))
    .withColumn("entity_cloud_id", entity_id_udf(F.lit("cloud_resource"), F.col("cloud_resource_id")))
    .withColumn("entity_alert_id", F.lit(None).cast(StringType()))
    .withColumn("entity_session_id", entity_id_udf(F.lit("session"), F.col("session_id")))
    .select(
        "event_id", "event_time", "source_system", "source_type",
        "event_type", "event_subtype", "user_id", "host_id",
        "src_ip", "dst_ip", "src_port", "dst_port",
        "process_name", "process_hash", "parent_process", "domain", "url",
        "cloud_resource_id", "cloud_provider", "cloud_region", "api_action",
        "outcome", "severity", "risk_score", "rarity_score", "is_deception",
        "geo_country", "geo_city", "user_agent", "session_id", "attrs",
        "entity_user_id", "entity_host_id", "entity_src_ip_id", "entity_dst_ip_id",
        "entity_process_id", "entity_domain_id", "entity_cloud_id",
        "entity_alert_id", "entity_session_id",
    )
)

df_silver.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_SILVER}.silver_events")
print(f"Silver events: {df_silver.count():,}")
print(f"  Deception events: {df_silver.filter(F.col('is_deception')).count():,}")
display(df_silver.groupBy("source_type", "event_type").agg(
    F.count("*").alias("count"),
    F.countDistinct("entity_user_id").alias("users"),
    F.countDistinct("entity_host_id").alias("hosts"),
).orderBy(F.desc("count")))`
    },
    {
      type: 'code',
      content: `# Cell 6: Identity Resolution Graph Builder
# Builds a unified identity graph linking users across IAM, endpoint,
# network, SaaS, and cloud sources. Detects identity anomalies.

df_silver = spark.table(f"{CATALOG}.{SCHEMA_SILVER}.silver_events")

identity_records = []

user_source_agg = (
    df_silver
    .filter(F.col("user_id").isNotNull())
    .groupBy("user_id")
    .agg(
        F.collect_set("source_type").alias("sources"),
        F.collect_set("host_id").alias("devices"),
        F.collect_set("src_ip").alias("ips"),
        F.collect_set("session_id").alias("sessions"),
        F.collect_set("geo_country").alias("geos"),
        F.min("event_time").alias("first_seen"),
        F.max("event_time").alias("last_seen"),
        F.count("*").alias("event_count"),
    )
)

user_identities_pdf = user_source_agg.toPandas()

for _, row in user_identities_pdf.iterrows():
    user = row["user_id"]
    devices = [d for d in row["devices"] if d]
    ips = [ip for ip in row["ips"] if ip]
    sessions = [s for s in row["sessions"] if s]
    geos = [g for g in row["geos"] if g]

    is_device_sharing = len(devices) > DETECTION_CONFIG["identity_resolution"]["device_sharing_threshold"]
    is_identity_hopping = len(geos) > DETECTION_CONFIG["identity_resolution"]["identity_hop_alert_count"]
    is_anomalous = is_device_sharing or is_identity_hopping

    anomaly_type = None
    if is_device_sharing and is_identity_hopping:
        anomaly_type = "device_sharing+identity_hopping"
    elif is_device_sharing:
        anomaly_type = "device_sharing"
    elif is_identity_hopping:
        anomaly_type = "identity_hopping"

    for source in row["sources"]:
        if source:
            identity_records.append({
                "identity_id": str(uuid.uuid4())[:16],
                "canonical_user_id": entity_id("user", user),
                "identity_source": source,
                "source_identifier": user,
                "identity_type": "user_account",
                "device_ids": devices[:10],
                "ip_addresses": ips[:20],
                "session_ids": sessions[:10],
                "geo_locations": geos[:10],
                "confidence": min(1.0, row["event_count"] / 100),
                "is_anomalous": is_anomalous,
                "anomaly_type": anomaly_type,
                "first_seen": str(row["first_seen"]),
                "last_seen": str(row["last_seen"]),
            })

if identity_records:
    df_identity = spark.createDataFrame(identity_records)
    df_identity = (
        df_identity
        .withColumn("first_seen", F.to_timestamp("first_seen"))
        .withColumn("last_seen", F.to_timestamp("last_seen"))
        .withColumn("updated_at", F.current_timestamp())
    )
    df_identity.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_GRAPH}.identity_graph")

    total_ids = len(identity_records)
    anomalous = sum(1 for r in identity_records if r["is_anomalous"])
    print(f"Identity graph built: {total_ids:,} identity records")
    print(f"  Anomalous identities: {anomalous:,}")
    print(f"  Distinct users: {len(set(r['canonical_user_id'] for r in identity_records)):,}")
    display(df_identity.filter(F.col("is_anomalous")).select(
        "source_identifier", "identity_source", "anomaly_type",
        F.size("device_ids").alias("device_count"),
        F.size("ip_addresses").alias("ip_count"),
        F.size("geo_locations").alias("geo_count"),
    ).limit(20))
else:
    print("No identity records generated")`
    },
    {
      type: 'code',
      content: `# Cell 7: Sequence Template Initialization & Pipeline Health Dashboard

templates = [
    {"template_id": "seq-normal-login", "template_name": "Normal User Login Sequence",
     "entity_type": "user",
     "expected_sequence": ["vpn:connect", "authentication:login_success", "endpoint:process_create"],
     "typical_duration_sec": 300.0, "duration_stddev_sec": 120.0, "frequency_per_day": 2.0,
     "is_suspicious": False},
    {"template_id": "seq-password-spray", "template_name": "Password Spray Attack",
     "entity_type": "ip",
     "expected_sequence": ["authentication:login_failed", "authentication:login_failed",
                           "authentication:login_failed", "authentication:login_failed",
                           "authentication:login_success"],
     "typical_duration_sec": 180.0, "duration_stddev_sec": 60.0, "frequency_per_day": 0.01,
     "is_suspicious": True},
    {"template_id": "seq-lateral-move", "template_name": "Lateral Movement Chain",
     "entity_type": "user",
     "expected_sequence": ["authentication:login_success", "endpoint:network_connect",
                           "authentication:login_success", "endpoint:process_create"],
     "typical_duration_sec": 1800.0, "duration_stddev_sec": 600.0, "frequency_per_day": 0.005,
     "is_suspicious": True},
    {"template_id": "seq-data-exfil", "template_name": "Data Exfiltration Chain",
     "entity_type": "user",
     "expected_sequence": ["endpoint:file_write", "dns:query", "network_flow:None",
                           "cloud_api:PutObject"],
     "typical_duration_sec": 3600.0, "duration_stddev_sec": 1200.0, "frequency_per_day": 0.001,
     "is_suspicious": True},
    {"template_id": "seq-cloud-abuse", "template_name": "Cloud Credential Abuse",
     "entity_type": "user",
     "expected_sequence": ["cloud_api:CreateAccessKey", "cloud_api:AssumeRole",
                           "cloud_api:GetObject", "cloud_api:PutBucketPolicy"],
     "typical_duration_sec": 900.0, "duration_stddev_sec": 300.0, "frequency_per_day": 0.002,
     "is_suspicious": True},
    {"template_id": "seq-recon-to-exploit", "template_name": "Reconnaissance to Exploitation",
     "entity_type": "ip",
     "expected_sequence": ["network_flow:None", "dns:query", "authentication:login_failed",
                           "authentication:login_success", "endpoint:process_create"],
     "typical_duration_sec": 7200.0, "duration_stddev_sec": 3600.0, "frequency_per_day": 0.003,
     "is_suspicious": True},
    {"template_id": "seq-normal-dev", "template_name": "Normal Developer Workflow",
     "entity_type": "user",
     "expected_sequence": ["authentication:login_success", "endpoint:process_create",
                           "dns:query", "endpoint:file_write"],
     "typical_duration_sec": 28800.0, "duration_stddev_sec": 7200.0, "frequency_per_day": 1.0,
     "is_suspicious": False},
]

df_templates = spark.createDataFrame(templates)
df_templates = df_templates.withColumn("created_at", F.current_timestamp())
df_templates.write.mode("overwrite").saveAsTable(f"{CATALOG}.{SCHEMA_GRAPH}.sequence_templates")
print(f"Loaded {len(templates)} sequence templates ({sum(1 for t in templates if t['is_suspicious'])} suspicious)")

import matplotlib.pyplot as plt
import pandas as pd

df_s = spark.table(f"{CATALOG}.{SCHEMA_SILVER}.silver_events")
entity_cols = ["entity_user_id", "entity_host_id", "entity_src_ip_id",
               "entity_dst_ip_id", "entity_process_id", "entity_domain_id", "entity_cloud_id"]
total = df_s.count()
entity_stats = {}
for c in entity_cols:
    nn = df_s.filter(F.col(c).isNotNull()).count()
    dc = df_s.select(c).distinct().count()
    key = c.replace("entity_", "").replace("_id", "")
    entity_stats[key] = {"coverage_pct": round(nn / total * 100, 1), "distinct_count": dc}

fig, axes = plt.subplots(2, 3, figsize=(22, 13))
fig.suptitle("SIEM Graph Correlation - Pipeline & Identity Health", fontsize=16, fontweight="bold")

src = df_s.groupBy("source_type").count().toPandas()
src.set_index("source_type")["count"].plot(kind="bar", ax=axes[0, 0], color="#2563eb", edgecolor="#1e40af")
axes[0, 0].set_title("Events by Source", fontweight="bold")
axes[0, 0].tick_params(axis="x", rotation=45)

names = list(entity_stats.keys())
covs = [entity_stats[e]["coverage_pct"] for e in names]
colors = ["#10b981" if c > 50 else "#f59e0b" if c > 20 else "#ef4444" for c in covs]
axes[0, 1].barh(names, covs, color=colors)
axes[0, 1].set_title("Entity Coverage (%)", fontweight="bold")
axes[0, 1].set_xlim(0, 100)

try:
    id_graph = spark.table(f"{CATALOG}.{SCHEMA_GRAPH}.identity_graph")
    anom_counts = id_graph.filter(F.col("is_anomalous")).groupBy("anomaly_type").count().toPandas()
    if len(anom_counts) > 0:
        anom_counts.set_index("anomaly_type")["count"].plot(
            kind="bar", ax=axes[0, 2], color="#ef4444", edgecolor="#b91c1c")
    else:
        axes[0, 2].text(0.5, 0.5, "No identity anomalies", ha="center", va="center")
except:
    axes[0, 2].text(0.5, 0.5, "Identity graph pending", ha="center", va="center")
axes[0, 2].set_title("Identity Anomalies", fontweight="bold")

sev = df_s.groupBy("severity").count().toPandas()
sc = {"critical": "#ef4444", "high": "#f59e0b", "medium": "#3b82f6", "low": "#10b981", "info": "#6b7280"}
sev["color"] = sev["severity"].map(lambda s: sc.get(s, "#9ca3af"))
sev.set_index("severity")["count"].plot(kind="pie", ax=axes[1, 0], autopct="%1.1f%%",
                                         colors=sev["color"].tolist())
axes[1, 0].set_title("Severity Distribution", fontweight="bold")
axes[1, 0].set_ylabel("")

tl = df_s.withColumn("hour", F.hour("event_time")).groupBy("hour").count().orderBy("hour").toPandas()
axes[1, 1].fill_between(tl["hour"], tl["count"], alpha=0.3, color="#2563eb")
axes[1, 1].plot(tl["hour"], tl["count"], color="#2563eb", linewidth=2)
axes[1, 1].set_title("Event Volume (Hourly)", fontweight="bold")
axes[1, 1].set_xlabel("Hour")

deception = df_s.filter(F.col("is_deception")).groupBy("event_subtype").count().toPandas()
if len(deception) > 0:
    deception.set_index("event_subtype")["count"].plot(kind="barh", ax=axes[1, 2], color="#dc2626")
else:
    axes[1, 2].text(0.5, 0.5, "No deception events", ha="center", va="center")
axes[1, 2].set_title("Deception/Honeypot Signals", fontweight="bold")

plt.tight_layout()
plt.show()

print(f"""
================================================================
  PIPELINE & IDENTITY HEALTH
================================================================
  Silver Events:        {total:,}
  Source Types:         {src.shape[0]}
  Sequence Templates:  {len(templates)}
  Identity Records:    {len(identity_records):,}
  Identity Anomalies:  {sum(1 for r in identity_records if r['is_anomalous']):,}
  Deception Events:    {df_s.filter(F.col('is_deception')).count():,}
================================================================
""")`
    },
  ],
};
