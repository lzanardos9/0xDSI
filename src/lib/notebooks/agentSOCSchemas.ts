import { DatabricksNotebook } from '../databricksNotebooks';

export const agentSOCSchemasNotebook: DatabricksNotebook = {
  id: 'agent-soc-schemas',
  title: 'Agentic SOC - Schemas, Configuration & Data Foundation',
  subtitle: 'Unity Catalog schema, agent configs, alert pipeline, threat intel, ALHF feedback loop, sample data',
  category: 'ml',
  tags: ['Agentic SOC', 'Agent Configuration', 'Delta Lake', 'Unity Catalog', 'ALHF', 'Alert Pipeline', 'Threat Intelligence', 'OCSF'],
  description: 'Part 1 of the production Agentic SOC. Creates the complete data model for autonomous security operations: events with OCSF categorization, multi-stage alert pipeline, threat intelligence feeds, agent task queue, orchestration logs, agent performance metrics, ALHF (Agent Learning from Human Feedback) tables, response actions, active blocklists, correlation rules, discovered patterns, and cases. Includes realistic sample data generation for 10K events, 500 alerts, 500 threat IOCs, and 50 user baselines.',
  estimatedRuntime: '18 min',
  clusterRequirements: 'DBR 14.3 LTS ML, 4+ workers, Delta Lake, Unity Catalog, GraphFrames',
  cells: [
    {
      type: 'markdown',
      content: `# Agentic SOC - Part 1: Schemas, Configuration & Data Foundation

## Production Agentic Security Operations Center

This three-notebook suite implements a **production-grade Agentic SOC** with five autonomous
agents, an orchestrator, ALHF feedback loop, and full observability. The system processes
the complete alert lifecycle from ingestion through automated response.

### Agent Architecture

\`\`\`
                    INCOMING EVENTS
                    (Structured Streaming / Batch)
                          |
                          v
               +----------+----------+
               |   TRIAGE AGENT      |   Score, prioritize, classify
               |   - Multi-factor    |   - Severity weight
               |   - IOC match       |   - Repeat offender
               |   - Risk score      |   - Auto-escalation
               +----------+----------+
                          |
                          v
               +----------+----------+
               |   ENRICHMENT AGENT  |   Add threat intelligence
               |   - Threat feeds    |   - AlienVault, MISP, VirusTotal
               |   - User anomalies  |   - Behavioral baselines
               |   - Geo analysis    |   - IP reputation
               +----------+----------+
                          |
                          v
               +----------+----------+
               |   INVESTIGATION     |   Correlate and analyze
               |   AGENT             |   - Attack timeline
               |   - Graph analysis  |   - Lateral movement
               |   - Event corr.     |   - Pattern matching
               +----------+----------+
                          |
                          v
               +----------+----------+
               |   RESPONSE AGENT    |   Take automated action
               |   - Block IP        |   - Isolate host
               |   - Disable user    |   - Create ticket
               |   - Rollback        |   - Approval workflow
               +----------+----------+
                          |
                          v
               +----------+----------+
               |   PATTERN DISCOVERY |   Learn new patterns
               |   AGENT             |   - Sequence analysis
               |   - Statistical     |   - Clustering
               |   - ML anomaly      |   - Rule generation
               +----------+----------+
                          |
                          v
               +----------+----------+
               |   ALHF FEEDBACK     |   Analyst feedback loop
               |   LOOP              |   - Positive/negative
               |   - Corrections     |   - Model adaptation
               |   - Drift detection |   - Threshold tuning
               +----------+----------+
\`\`\`

### Three-Notebook Structure

| Notebook | Content | Key Capabilities |
|----------|---------|-----------------|
| **Part 1 (this)** | Schemas & Data Foundation | 12 Delta tables, ALHF schema, sample data |
| **Part 2** | Agent Implementations | 5 production agents with full scoring logic |
| **Part 3** | Orchestrator & Observability | Scheduling, circuit breakers, monitoring, testing |

### Data Model Overview

| Table | Purpose | Rows (sample) |
|-------|---------|---------------|
| events | All security events (OCSF) | 10,000 |
| alerts | Multi-stage alert pipeline | 500 |
| threat_feed_items | IOC threat intelligence | 500 |
| user_behavior_baselines | Behavioral profiles | 50 |
| user_anomalies | Detected deviations | ~100 |
| agent_configs | Agent configuration & health | 5 |
| agent_tasks | Task queue & results | streaming |
| agent_orchestration_logs | Orchestration audit trail | streaming |
| agent_performance_metrics | Time-series agent metrics | streaming |
| agent_feedback | ALHF feedback loop | analyst-driven |
| cases | Investigation cases | ~50 |
| response_actions | Executed responses | streaming |
| active_blocklist | Dynamic block lists | streaming |
| correlation_rules | Detection rules (manual + AI) | ~20 |
| discovered_patterns | ML-discovered patterns | streaming |`
    },
    {
      type: 'code',
      content: `# Cell 1: Configuration & Setup

from pyspark.sql import functions as F
from pyspark.sql.types import *
from pyspark.sql.window import Window
from delta.tables import DeltaTable
from datetime import datetime, timedelta
import json, uuid, hashlib

CATALOG = "soc_platform"
SCHEMA = "agentic_soc"

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"USE CATALOG {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
spark.sql(f"USE SCHEMA {SCHEMA}")

CONFIG = {
    "catalog": CATALOG,
    "schema": SCHEMA,
    "checkpoint_path": f"/tmp/{SCHEMA}/checkpoints",

    "triage": {
        "critical_threshold": 15,
        "high_threshold": 10,
        "medium_threshold": 5,
        "batch_size": 200,
        "auto_escalate_critical": True,
        "suppress_fp_threshold": 0.80,
    },

    "enrichment": {
        "ioc_match_bonus": 30,
        "known_threat_bonus": 20,
        "user_anomaly_bonus": 15,
        "geo_anomaly_bonus": 10,
        "batch_size": 100,
        "max_risk_score": 100,
        "feeds": ["AlienVault OTX", "Abuse.ch", "MISP", "VirusTotal", "Custom Intel"],
    },

    "investigation": {
        "batch_size": 50,
        "case_creation_threshold": 70,
        "min_priority": "medium",
        "graph_hop_depth": 2,
        "timeline_window_hours": 24,
        "lateral_movement_threshold": 3,
    },

    "response": {
        "auto_block_threshold": 80,
        "block_duration_hours": 24,
        "batch_size": 30,
        "require_approval_actions": ["disable_user", "isolate_host"],
        "auto_actions": ["block_ip", "update_firewall", "quarantine_file"],
        "rollback_window_hours": 4,
    },

    "pattern_discovery": {
        "min_confidence": 0.60,
        "cluster_anomaly_threshold": 0.01,
        "sequence_min_events": 5,
        "lookback_days": 7,
        "max_patterns_per_run": 20,
    },

    "orchestrator": {
        "cycle_interval_seconds": 30,
        "max_concurrent_agents": 3,
        "health_check_interval_seconds": 300,
        "metrics_collection_interval_seconds": 60,
        "log_retention_days": 30,
        "metrics_retention_days": 90,
        "circuit_breaker_threshold": 5,
        "circuit_breaker_cooldown_seconds": 300,
    },

    "alhf": {
        "feedback_batch_size": 50,
        "adaptation_min_samples": 20,
        "threshold_adjustment_rate": 0.05,
        "drift_detection_window_days": 7,
        "min_feedback_confidence": 0.7,
    },
}

print(f"Configuration loaded for {CATALOG}.{SCHEMA}")
print(f"  Agents: triage, enrichment, investigation, response, pattern_discovery")
print(f"  Orchestrator cycle: {CONFIG['orchestrator']['cycle_interval_seconds']}s")
print(f"  ALHF adaptation min samples: {CONFIG['alhf']['adaptation_min_samples']}")`
    },
    {
      type: 'code',
      content: `# Cell 2: Core Event & Alert Tables

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.events (
    id                  STRING          NOT NULL,
    timestamp           TIMESTAMP       NOT NULL,
    event_type          STRING          NOT NULL,
    event_category      STRING,
    severity            STRING          DEFAULT 'low',
    source_ip           STRING,
    dest_ip             STRING,
    source_port         INT,
    dest_port           INT,
    protocol            STRING,
    username            STRING,
    hostname            STRING,
    domain              STRING,
    process_name        STRING,
    process_path        STRING,
    command_line        STRING,
    file_hash           STRING,
    file_path           STRING,
    bytes_sent          BIGINT          DEFAULT 0,
    bytes_received      BIGINT          DEFAULT 0,
    duration_ms         INT             DEFAULT 0,
    geo_country         STRING,
    geo_city            STRING,
    description         STRING,
    raw_log             STRING,
    ocsf_category       STRING,
    ocsf_class          STRING,
    mitre_technique     STRING,
    mitre_tactic        STRING,
    data_source         STRING,
    ingestion_time      TIMESTAMP       DEFAULT current_timestamp(),
    created_at          TIMESTAMP       DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (date(timestamp))
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true',
    'delta.enableChangeDataFeed' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.alerts (
    id                      STRING      NOT NULL,
    title                   STRING      NOT NULL,
    description             STRING,
    severity                STRING      DEFAULT 'medium',
    status                  STRING      DEFAULT 'new',
    priority                STRING,
    source                  STRING,
    source_ip               STRING,
    dest_ip                 STRING,
    username                STRING,
    hostname                STRING,
    risk_score              INT         DEFAULT 0,
    event_count             INT         DEFAULT 0,
    correlated_event_ids    ARRAY<STRING>,
    correlation_rule_id     STRING,
    mitre_techniques        ARRAY<STRING>,
    mitre_tactics           ARRAY<STRING>,

    -- Triage stage
    triage_score            INT,
    triage_notes            STRING,
    triage_factors          STRING,
    triaged_at              TIMESTAMP,
    triaged_by              STRING,

    -- Enrichment stage
    enrichment_data         STRING,
    enriched_risk_score     INT,
    enrichment_completed    BOOLEAN     DEFAULT false,
    enriched_at             TIMESTAMP,
    ioc_match               BOOLEAN     DEFAULT false,
    ioc_match_details       STRING,
    repeat_count            INT         DEFAULT 0,
    geo_anomaly             BOOLEAN     DEFAULT false,

    -- Investigation stage
    investigation_data      STRING,
    investigation_completed BOOLEAN     DEFAULT false,
    investigated_at         TIMESTAMP,
    attack_patterns         ARRAY<STRING>,
    attack_chain_id         STRING,
    lateral_movement_hops   INT         DEFAULT 0,
    case_created            BOOLEAN     DEFAULT false,
    case_id                 STRING,

    -- Response stage
    response_actions        STRING,
    response_completed      BOOLEAN     DEFAULT false,
    responded_at            TIMESTAMP,
    response_status         STRING,
    rollback_available      BOOLEAN     DEFAULT false,

    -- Feedback
    analyst_verdict         STRING,
    analyst_notes           STRING,
    is_false_positive       BOOLEAN,
    feedback_at             TIMESTAMP,

    created_at              TIMESTAMP   DEFAULT current_timestamp(),
    updated_at              TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.enableChangeDataFeed' = 'true'
)
""")

print("Core tables created: events, alerts")`
    },
    {
      type: 'code',
      content: `# Cell 3: Threat Intelligence & User Behavior Tables

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.threat_feed_items (
    id              STRING      NOT NULL,
    feed_name       STRING      NOT NULL,
    ioc_type        STRING      NOT NULL,
    ioc_value       STRING      NOT NULL,
    threat_type     STRING,
    severity        STRING      DEFAULT 'medium',
    confidence      DOUBLE      DEFAULT 0.5,
    tags            ARRAY<STRING>,
    description     STRING,
    first_seen      TIMESTAMP,
    last_seen       TIMESTAMP,
    source_url      STRING,
    is_active       BOOLEAN     DEFAULT true,
    created_at      TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.user_behavior_baselines (
    id                      STRING      NOT NULL,
    username                STRING      NOT NULL,
    department              STRING,
    role                    STRING,
    avg_login_hour          DOUBLE,
    stddev_login_hour       DOUBLE,
    common_locations        ARRAY<STRING>,
    common_hosts            ARRAY<STRING>,
    common_processes        ARRAY<STRING>,
    avg_daily_events        INT         DEFAULT 0,
    avg_bytes_transferred   BIGINT      DEFAULT 0,
    avg_session_duration_min DOUBLE     DEFAULT 0.0,
    risk_score              INT         DEFAULT 50,
    peer_group              STRING,
    last_updated            TIMESTAMP,
    created_at              TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.user_anomalies (
    id              STRING      NOT NULL,
    username        STRING      NOT NULL,
    anomaly_type    STRING      NOT NULL,
    anomaly_score   DOUBLE      DEFAULT 0.0,
    risk_score      INT         DEFAULT 0,
    details         STRING,
    baseline_value  STRING,
    observed_value  STRING,
    deviation_sigma DOUBLE      DEFAULT 0.0,
    is_active       BOOLEAN     DEFAULT true,
    detected_at     TIMESTAMP,
    resolved_at     TIMESTAMP,
    resolved_by     STRING,
    created_at      TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

print("Intelligence tables created: threat_feed_items, user_behavior_baselines, user_anomalies")`
    },
    {
      type: 'code',
      content: `# Cell 4: Agent Configuration & Task Queue Tables

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.agent_configs (
    id                      STRING      NOT NULL,
    agent_type              STRING      NOT NULL,
    name                    STRING      NOT NULL,
    description             STRING,
    enabled                 BOOLEAN     DEFAULT true,
    auto_run                BOOLEAN     DEFAULT true,
    interval_seconds        INT         DEFAULT 60,
    max_concurrent_tasks    INT         DEFAULT 10,
    batch_size              INT         DEFAULT 100,
    priority                INT         DEFAULT 5,
    optimization_method     STRING      DEFAULT 'hybrid',
    model_version           STRING      DEFAULT 'v1.0',
    config_json             STRING,

    -- Performance tracking
    total_runs              BIGINT      DEFAULT 0,
    successful_runs         BIGINT      DEFAULT 0,
    failed_runs             BIGINT      DEFAULT 0,
    avg_execution_time_ms   DOUBLE      DEFAULT 0.0,
    last_run_at             TIMESTAMP,
    last_success_at         TIMESTAMP,
    last_failure_at         TIMESTAMP,
    last_error              STRING,

    -- Health
    health_status           STRING      DEFAULT 'healthy',
    consecutive_failures    INT         DEFAULT 0,
    circuit_breaker_open    BOOLEAN     DEFAULT false,
    circuit_breaker_until   TIMESTAMP,

    -- ALHF tracking
    feedback_score          DOUBLE      DEFAULT 0.0,
    total_feedback_count    INT         DEFAULT 0,
    positive_feedback_count INT         DEFAULT 0,
    last_adaptation_at      TIMESTAMP,

    created_at              TIMESTAMP   DEFAULT current_timestamp(),
    updated_at              TIMESTAMP
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.agent_tasks (
    id                  STRING      NOT NULL,
    agent_type          STRING      NOT NULL,
    task_type           STRING      NOT NULL,
    priority            STRING      DEFAULT 'medium',
    status              STRING      DEFAULT 'pending',
    parameters          STRING,
    result              STRING,
    error               STRING,
    retry_count         INT         DEFAULT 0,
    max_retries         INT         DEFAULT 3,
    alert_id            STRING,
    parent_task_id      STRING,
    confidence_score    DOUBLE,
    escalated           BOOLEAN     DEFAULT false,
    processing_time_ms  INT,
    started_at          TIMESTAMP,
    completed_at        TIMESTAMP,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.agent_orchestration_logs (
    id                  STRING      NOT NULL,
    run_id              STRING      NOT NULL,
    mode                STRING      DEFAULT 'scheduled',
    agents_executed     ARRAY<STRING>,
    tasks_created       INT         DEFAULT 0,
    tasks_completed     INT         DEFAULT 0,
    tasks_failed        INT         DEFAULT 0,
    execution_time_ms   INT         DEFAULT 0,
    errors              ARRAY<STRING>,
    warnings            ARRAY<STRING>,
    config_snapshot     STRING,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.agent_performance_metrics (
    id                  STRING      NOT NULL,
    agent_type          STRING      NOT NULL,
    metric_name         STRING      NOT NULL,
    metric_value        DOUBLE      NOT NULL,
    metric_unit         STRING,
    time_window         STRING      DEFAULT 'point',
    tags                STRING,
    timestamp           TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (agent_type)
TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

print("Agent tables created: agent_configs, agent_tasks, agent_orchestration_logs, agent_performance_metrics")`
    },
    {
      type: 'code',
      content: `# Cell 5: ALHF Feedback, Cases, Response & Rule Tables

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.agent_feedback (
    id                  STRING      NOT NULL,
    agent_type          STRING      NOT NULL,
    task_id             STRING,
    alert_id            STRING,
    feedback_type       STRING      NOT NULL,
    feedback_score      INT         DEFAULT 3,
    analyst_id          STRING,
    analyst_comment     STRING,
    correction_data     STRING,
    original_output     STRING,
    expected_output     STRING,
    improvement_applied BOOLEAN     DEFAULT false,
    applied_at          TIMESTAMP,
    model_version       STRING,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.agent_threshold_history (
    id                  STRING      NOT NULL,
    agent_type          STRING      NOT NULL,
    threshold_name      STRING      NOT NULL,
    old_value           DOUBLE,
    new_value           DOUBLE,
    adjustment_reason   STRING,
    feedback_count      INT,
    positive_rate       DOUBLE,
    negative_rate       DOUBLE,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.cases (
    id                  STRING      NOT NULL,
    title               STRING      NOT NULL,
    description         STRING,
    severity            STRING      DEFAULT 'medium',
    priority            STRING      DEFAULT 'medium',
    status              STRING      DEFAULT 'new',
    case_type           STRING      DEFAULT 'incident',
    alert_id            STRING,
    alert_ids           ARRAY<STRING>,
    assigned_to         STRING,
    investigation_data  STRING,
    timeline            STRING,
    indicators          STRING,
    mitre_techniques    ARRAY<STRING>,
    affected_assets     ARRAY<STRING>,
    containment_status  STRING,
    created_by          STRING      DEFAULT 'agent',
    created_at          TIMESTAMP   DEFAULT current_timestamp(),
    updated_at          TIMESTAMP,
    closed_at           TIMESTAMP,
    resolution          STRING
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.response_actions (
    id                  STRING      NOT NULL,
    alert_id            STRING,
    case_id             STRING,
    action_type         STRING      NOT NULL,
    target              STRING,
    target_type         STRING,
    status              STRING      DEFAULT 'pending',
    details             STRING,
    executed_by         STRING,
    approved_by         STRING,
    requires_approval   BOOLEAN     DEFAULT false,
    executed_at         TIMESTAMP,
    rolled_back         BOOLEAN     DEFAULT false,
    rolled_back_at      TIMESTAMP,
    rolled_back_by      STRING,
    rollback_reason     STRING,
    expires_at          TIMESTAMP,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.response_action_approvals (
    action_id           STRING      NOT NULL,
    action_type         STRING      NOT NULL,
    target_entity       STRING,
    scope_summary       STRING,
    requested_by        STRING,
    requested_at        TIMESTAMP   DEFAULT current_timestamp(),
    status              STRING      DEFAULT 'pending',
    approved_by         STRING,
    approved_at         TIMESTAMP,
    rejection_reason    STRING,
    executed_at         TIMESTAMP,
    execution_result    STRING,
    ttl_minutes         INT         DEFAULT 60
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.active_blocklist (
    id                  STRING      NOT NULL,
    list_name           STRING      NOT NULL,
    value               STRING      NOT NULL,
    list_type           STRING      DEFAULT 'blocklist',
    category            STRING,
    reason              STRING,
    severity            STRING      DEFAULT 'medium',
    auto_added          BOOLEAN     DEFAULT false,
    source_alert_id     STRING,
    source_agent        STRING,
    expires_at          TIMESTAMP,
    is_active           BOOLEAN     DEFAULT true,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.correlation_rules (
    id                      STRING      NOT NULL,
    name                    STRING      NOT NULL,
    description             STRING,
    rule_type               STRING      DEFAULT 'manual',
    conditions              STRING,
    time_window_minutes     INT         DEFAULT 60,
    threshold               INT         DEFAULT 5,
    severity                STRING      DEFAULT 'medium',
    enabled                 BOOLEAN     DEFAULT true,
    auto_response_enabled   BOOLEAN     DEFAULT false,
    confidence              DOUBLE      DEFAULT 0.5,
    true_positive_rate      DOUBLE,
    false_positive_rate     DOUBLE,
    source_pattern_id       STRING,
    generated_by            STRING,
    ai_reasoning            STRING,
    created_at              TIMESTAMP   DEFAULT current_timestamp(),
    updated_at              TIMESTAMP
)
USING DELTA
""")

spark.sql(f"""
CREATE TABLE IF NOT EXISTS {SCHEMA}.discovered_patterns (
    id                  STRING      NOT NULL,
    pattern_name        STRING      NOT NULL,
    pattern_type        STRING,
    confidence_score    DOUBLE      DEFAULT 0.0,
    event_types         ARRAY<STRING>,
    common_features     STRING,
    occurrence_count    INT         DEFAULT 0,
    severity            STRING      DEFAULT 'medium',
    mitre_tactics       ARRAY<STRING>,
    mitre_techniques    ARRAY<STRING>,
    sample_event_ids    ARRAY<STRING>,
    converted_to_rule   BOOLEAN     DEFAULT false,
    rule_id             STRING,
    converted_at        TIMESTAMP,
    created_at          TIMESTAMP   DEFAULT current_timestamp()
)
USING DELTA
""")

print("ALHF, cases, response, and rule tables created")
print(f"Total tables in schema: {len(spark.catalog.listTables(SCHEMA))}")
for t in sorted(spark.catalog.listTables(SCHEMA), key=lambda x: x.name):
    print(f"  {t.name}")`
    },
    {
      type: 'code',
      content: `# Cell 6: Seed Agent Configurations

def gen_uuid():
    return str(uuid.uuid4())

AGENT_CONFIGS = [
    {
        "id": gen_uuid(),
        "agent_type": "triage",
        "name": "Triage Agent Alpha",
        "description": "Multi-factor alert scoring and priority classification. Uses severity weighting, IOC matching, repeat offender detection, and event volume analysis.",
        "enabled": True,
        "auto_run": True,
        "interval_seconds": 30,
        "max_concurrent_tasks": 20,
        "batch_size": 200,
        "priority": 1,
        "optimization_method": "hybrid",
        "model_version": "v2.1",
        "config_json": json.dumps(CONFIG["triage"]),
        "health_status": "healthy",
    },
    {
        "id": gen_uuid(),
        "agent_type": "enrichment",
        "name": "Enrichment Agent Beta",
        "description": "Multi-source threat intelligence enrichment. Correlates with 5+ threat feeds, user behavioral baselines, geolocation anomalies, and historical patterns.",
        "enabled": True,
        "auto_run": True,
        "interval_seconds": 60,
        "max_concurrent_tasks": 15,
        "batch_size": 100,
        "priority": 2,
        "optimization_method": "TAO",
        "model_version": "v2.0",
        "config_json": json.dumps(CONFIG["enrichment"]),
        "health_status": "healthy",
    },
    {
        "id": gen_uuid(),
        "agent_type": "investigation",
        "name": "Investigation Agent Gamma",
        "description": "Graph-based event correlation and attack chain reconstruction. Performs multi-hop graph traversal, lateral movement detection, and automated timeline building.",
        "enabled": True,
        "auto_run": True,
        "interval_seconds": 120,
        "max_concurrent_tasks": 10,
        "batch_size": 50,
        "priority": 3,
        "optimization_method": "ALHF",
        "model_version": "v1.5",
        "config_json": json.dumps(CONFIG["investigation"]),
        "health_status": "healthy",
    },
    {
        "id": gen_uuid(),
        "agent_type": "response",
        "name": "Response Agent Delta",
        "description": "Automated threat response and containment. Executes IP blocks, host isolation, account lockout, and firewall updates with rollback capability.",
        "enabled": True,
        "auto_run": True,
        "interval_seconds": 30,
        "max_concurrent_tasks": 5,
        "batch_size": 30,
        "priority": 4,
        "optimization_method": "hybrid",
        "model_version": "v1.8",
        "config_json": json.dumps(CONFIG["response"]),
        "health_status": "healthy",
    },
    {
        "id": gen_uuid(),
        "agent_type": "pattern_discovery",
        "name": "Pattern Discovery Agent Epsilon",
        "description": "ML-powered attack pattern discovery. Uses event sequence analysis, statistical anomaly detection, and clustering to discover new attack patterns and auto-generate correlation rules.",
        "enabled": True,
        "auto_run": True,
        "interval_seconds": 300,
        "max_concurrent_tasks": 3,
        "batch_size": 10000,
        "priority": 5,
        "optimization_method": "hybrid",
        "model_version": "v1.2",
        "config_json": json.dumps(CONFIG["pattern_discovery"]),
        "health_status": "healthy",
    },
]

df_agents = spark.createDataFrame(AGENT_CONFIGS)
df_agents = df_agents.withColumn("created_at", F.current_timestamp()).withColumn("updated_at", F.current_timestamp())
df_agents.write.mode("overwrite").saveAsTable(f"{SCHEMA}.agent_configs")

print(f"Agent configs seeded: {len(AGENT_CONFIGS)}")
for a in AGENT_CONFIGS:
    print(f"  [{a['priority']}] {a['agent_type']:20s} | {a['name']} | interval={a['interval_seconds']}s | method={a['optimization_method']}")`
    },
    {
      type: 'code',
      content: `# Cell 7: Ingest Events from Silver Layer

# --- Parameterize source table ---
dbutils.widgets.text("source_events_table", "soc_platform.graph_silver.silver_events")
SOURCE_EVENTS_TABLE = dbutils.widgets.get("source_events_table")

print(f"Reading events from: {SOURCE_EVENTS_TABLE}")

# --- Read from the existing silver events table ---
silver_events = spark.table(SOURCE_EVENTS_TABLE)

# --- Map / transform columns to fit the agentic_soc.events schema ---
events_mapped = (
    silver_events
    .select(
        F.coalesce(F.col("event_id"), F.expr("uuid()")).alias("id"),
        F.col("event_timestamp").alias("timestamp"),
        F.col("event_type"),
        F.col("event_category"),
        F.coalesce(F.col("severity"), F.lit("low")).alias("severity"),
        F.col("src_ip").alias("source_ip"),
        F.col("dst_ip").alias("dest_ip"),
        F.col("src_port").cast("int").alias("source_port"),
        F.col("dst_port").cast("int").alias("dest_port"),
        F.col("protocol"),
        F.col("username"),
        F.col("hostname"),
        F.col("domain"),
        F.col("process_name"),
        F.col("process_path"),
        F.col("command_line"),
        F.col("file_hash"),
        F.col("file_path"),
        F.coalesce(F.col("bytes_sent").cast("bigint"), F.lit(0)).alias("bytes_sent"),
        F.coalesce(F.col("bytes_received").cast("bigint"), F.lit(0)).alias("bytes_received"),
        F.coalesce(F.col("duration_ms").cast("int"), F.lit(0)).alias("duration_ms"),
        F.col("geo_country"),
        F.col("geo_city"),
        F.col("description"),
        F.col("raw_log"),
        F.col("ocsf_category"),
        F.col("ocsf_class"),
        F.col("mitre_technique"),
        F.col("mitre_tactic"),
        F.col("data_source"),
        F.current_timestamp().alias("ingestion_time"),
    )
)

# --- Delta MERGE (upsert) into the events table ---
target_events_table = f"{SCHEMA}.events"

if DeltaTable.isDeltaTable(spark, f"spark-warehouse/{CATALOG}/{SCHEMA}/events") or spark.catalog.tableExists(target_events_table):
    dt_events = DeltaTable.forName(spark, target_events_table)
    merge_result = (
        dt_events.alias("target")
        .merge(
            events_mapped.alias("source"),
            "target.id = source.id"
        )
        .whenMatchedUpdateAll()
        .whenNotMatchedInsertAll()
        .execute()
    )
    print("Delta MERGE completed for events table.")
else:
    events_mapped.write.format("delta").mode("overwrite").saveAsTable(target_events_table)
    print(f"Initial load written to {target_events_table}.")

# --- Show ingestion metrics ---
total_events = spark.table(target_events_table).count()
ingestion_stats = (
    spark.table(target_events_table)
    .groupBy("event_category")
    .agg(
        F.count("*").alias("count"),
        F.min("timestamp").alias("earliest"),
        F.max("timestamp").alias("latest"),
        F.countDistinct("source_ip").alias("unique_src_ips"),
        F.countDistinct("username").alias("unique_users"),
    )
    .orderBy(F.desc("count"))
)

print(f"\\nEvent ingestion metrics ({target_events_table}):")
print(f"  Total events: {total_events:,}")
ingestion_stats.show(truncate=False)

severity_dist = (
    spark.table(target_events_table)
    .groupBy("severity")
    .count()
    .orderBy(F.desc("count"))
)
print("Severity distribution:")
severity_dist.show(truncate=False)`
    },
    {
      type: 'code',
      content: `# Cell 8: Ingest Alerts, Threat Intel & Compute Baselines / Anomalies

# --- Parameterize source tables ---
dbutils.widgets.text("source_alerts_table", "soc_platform.graph_silver.silver_alerts")
dbutils.widgets.text("source_threat_feed_table", "soc_platform.graph_silver.threat_feed_items")
dbutils.widgets.text("baseline_lookback_days", "30")
dbutils.widgets.text("anomaly_z_threshold", "3.0")

SOURCE_ALERTS_TABLE = dbutils.widgets.get("source_alerts_table")
SOURCE_THREAT_FEED_TABLE = dbutils.widgets.get("source_threat_feed_table")
BASELINE_LOOKBACK_DAYS = int(dbutils.widgets.get("baseline_lookback_days"))
ANOMALY_Z_THRESHOLD = float(dbutils.widgets.get("anomaly_z_threshold"))

# =========================================================================
# 1. ALERTS - Read from existing source and MERGE into agentic_soc.alerts
# =========================================================================
print(f"Reading alerts from: {SOURCE_ALERTS_TABLE}")
silver_alerts = spark.table(SOURCE_ALERTS_TABLE)

alerts_mapped = (
    silver_alerts
    .select(
        F.coalesce(F.col("alert_id"), F.expr("uuid()")).alias("id"),
        F.col("title"),
        F.col("description"),
        F.coalesce(F.col("severity"), F.lit("medium")).alias("severity"),
        F.coalesce(F.col("status"), F.lit("new")).alias("status"),
        F.col("priority"),
        F.col("source"),
        F.col("source_ip"),
        F.col("dest_ip"),
        F.col("username"),
        F.col("hostname"),
        F.coalesce(F.col("risk_score").cast("int"), F.lit(0)).alias("risk_score"),
        F.coalesce(F.col("event_count").cast("int"), F.lit(0)).alias("event_count"),
        F.col("correlated_event_ids"),
        F.col("correlation_rule_id"),
        F.col("mitre_techniques"),
        F.col("mitre_tactics"),
        F.col("created_at"),
    )
)

target_alerts_table = f"{SCHEMA}.alerts"
dt_alerts = DeltaTable.forName(spark, target_alerts_table)
(
    dt_alerts.alias("target")
    .merge(alerts_mapped.alias("source"), "target.id = source.id")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute()
)
print(f"Alerts MERGE complete. Total: {spark.table(target_alerts_table).count():,}")

# =========================================================================
# 2. THREAT FEED ITEMS - Read from existing source and MERGE
# =========================================================================
print(f"\\nReading threat feed items from: {SOURCE_THREAT_FEED_TABLE}")
silver_threat = spark.table(SOURCE_THREAT_FEED_TABLE)

threat_mapped = (
    silver_threat
    .select(
        F.coalesce(F.col("ioc_id"), F.expr("uuid()")).alias("id"),
        F.col("feed_name"),
        F.col("ioc_type"),
        F.col("ioc_value"),
        F.col("threat_type"),
        F.coalesce(F.col("severity"), F.lit("medium")).alias("severity"),
        F.coalesce(F.col("confidence").cast("double"), F.lit(0.5)).alias("confidence"),
        F.col("tags"),
        F.col("description"),
        F.col("first_seen"),
        F.col("last_seen"),
        F.col("source_url"),
        F.coalesce(F.col("is_active"), F.lit(True)).alias("is_active"),
    )
)

target_threat_table = f"{SCHEMA}.threat_feed_items"
dt_threat = DeltaTable.forName(spark, target_threat_table)
(
    dt_threat.alias("target")
    .merge(threat_mapped.alias("source"), "target.id = source.id")
    .whenMatchedUpdateAll()
    .whenNotMatchedInsertAll()
    .execute()
)
print(f"Threat feed MERGE complete. Total: {spark.table(target_threat_table).count():,}")

# =========================================================================
# 3. USER BEHAVIOR BASELINES - Computed from agentic_soc.events
# =========================================================================
print(f"\\nComputing user behavior baselines from {SCHEMA}.events (lookback={BASELINE_LOOKBACK_DAYS}d)...")

events_for_baselines = (
    spark.table(f"{SCHEMA}.events")
    .filter(F.col("timestamp") >= F.date_sub(F.current_date(), BASELINE_LOOKBACK_DAYS))
    .filter(F.col("username").isNotNull())
)

baselines_computed = (
    events_for_baselines
    .groupBy("username")
    .agg(
        F.expr("uuid()").alias("id"),
        # Login hour statistics (from authentication events)
        F.avg(
            F.when(F.col("event_category") == "authentication", F.hour("timestamp"))
        ).alias("avg_login_hour"),
        F.stddev(
            F.when(F.col("event_category") == "authentication", F.hour("timestamp"))
        ).alias("stddev_login_hour"),
        # Common hosts (top 5 most frequent)
        F.slice(
            F.sort_array(F.collect_set("hostname"), asc=False), 1, 5
        ).alias("common_hosts"),
        # Common processes (top 5 most frequent)
        F.slice(
            F.sort_array(
                F.collect_set(
                    F.when(F.col("process_name").isNotNull(), F.col("process_name"))
                ), asc=False
            ), 1, 5
        ).alias("common_processes"),
        # Common geo locations
        F.slice(
            F.sort_array(
                F.collect_set(
                    F.when(F.col("geo_country").isNotNull(), F.col("geo_country"))
                ), asc=False
            ), 1, 3
        ).alias("common_locations"),
        # Average daily events
        F.expr(f"cast(count(*) / {BASELINE_LOOKBACK_DAYS} as int)").alias("avg_daily_events"),
        # Average bytes transferred
        F.avg(
            F.coalesce(F.col("bytes_sent"), F.lit(0)) + F.coalesce(F.col("bytes_received"), F.lit(0))
        ).cast("bigint").alias("avg_bytes_transferred"),
        # Average session duration
        F.avg(F.col("duration_ms")).alias("avg_session_duration_min_raw"),
    )
    .withColumn("avg_session_duration_min", F.round(F.col("avg_session_duration_min_raw") / 60000.0, 1))
    .withColumn("risk_score", F.lit(50))
    .withColumn("peer_group", F.lit("default"))
    .withColumn("last_updated", F.current_timestamp())
    .drop("avg_session_duration_min_raw")
)

target_baselines_table = f"{SCHEMA}.user_behavior_baselines"
dt_baselines = DeltaTable.forName(spark, target_baselines_table)
(
    dt_baselines.alias("target")
    .merge(baselines_computed.alias("source"), "target.username = source.username")
    .whenMatchedUpdate(set={
        "avg_login_hour": "source.avg_login_hour",
        "stddev_login_hour": "source.stddev_login_hour",
        "common_hosts": "source.common_hosts",
        "common_processes": "source.common_processes",
        "common_locations": "source.common_locations",
        "avg_daily_events": "source.avg_daily_events",
        "avg_bytes_transferred": "source.avg_bytes_transferred",
        "avg_session_duration_min": "source.avg_session_duration_min",
        "last_updated": "source.last_updated",
    })
    .whenNotMatchedInsertAll()
    .execute()
)
num_baselines = spark.table(target_baselines_table).count()
print(f"Baselines MERGE complete. Total user baselines: {num_baselines:,}")

# =========================================================================
# 4. ANOMALY DETECTION - Z-score comparison against baselines
# =========================================================================
print(f"\\nDetecting anomalies (Z-score threshold={ANOMALY_Z_THRESHOLD})...")

# Compute current-period activity per user (last 24 hours)
recent_window = (
    spark.table(f"{SCHEMA}.events")
    .filter(F.col("timestamp") >= F.expr("current_timestamp() - INTERVAL 24 HOURS"))
    .filter(F.col("username").isNotNull())
)

current_activity = (
    recent_window
    .groupBy("username")
    .agg(
        F.avg(
            F.when(F.col("event_category") == "authentication", F.hour("timestamp"))
        ).alias("current_login_hour"),
        F.count("*").alias("current_event_count"),
        F.sum(
            F.coalesce(F.col("bytes_sent"), F.lit(0)) + F.coalesce(F.col("bytes_received"), F.lit(0))
        ).alias("current_bytes_transferred"),
        F.collect_set("hostname").alias("current_hosts"),
        F.collect_set(
            F.when(F.col("process_name").isNotNull(), F.col("process_name"))
        ).alias("current_processes"),
        F.collect_set("geo_country").alias("current_locations"),
    )
)

baselines_df = spark.table(target_baselines_table)

# Join current activity with baselines and compute Z-scores
joined = current_activity.alias("curr").join(
    baselines_df.alias("bl"), "username", "inner"
)

# --- Login time anomaly ---
login_time_anomalies = (
    joined
    .filter(F.col("curr.current_login_hour").isNotNull())
    .filter(F.col("bl.stddev_login_hour") > 0)
    .withColumn(
        "z_login_hour",
        F.abs((F.col("curr.current_login_hour") - F.col("bl.avg_login_hour")) / F.col("bl.stddev_login_hour"))
    )
    .filter(F.col("z_login_hour") >= ANOMALY_Z_THRESHOLD)
    .select(
        F.expr("uuid()").alias("id"),
        F.col("username"),
        F.lit("unusual_login_time").alias("anomaly_type"),
        F.least(F.col("z_login_hour") / 10.0, F.lit(1.0)).alias("anomaly_score"),
        F.least((F.col("z_login_hour") * 15).cast("int"), F.lit(100)).alias("risk_score"),
        F.to_json(F.struct("current_login_hour", "avg_login_hour", "stddev_login_hour")).alias("details"),
        F.col("bl.avg_login_hour").cast("string").alias("baseline_value"),
        F.col("curr.current_login_hour").cast("string").alias("observed_value"),
        F.col("z_login_hour").alias("deviation_sigma"),
        F.lit(True).alias("is_active"),
        F.current_timestamp().alias("detected_at"),
    )
)

# --- Event volume anomaly ---
volume_anomalies = (
    joined
    .filter(F.col("bl.avg_daily_events") > 0)
    .withColumn(
        "z_volume",
        F.abs((F.col("curr.current_event_count") - F.col("bl.avg_daily_events")) / F.greatest(F.col("bl.avg_daily_events") * 0.2, F.lit(1)))
    )
    .filter(F.col("z_volume") >= ANOMALY_Z_THRESHOLD)
    .select(
        F.expr("uuid()").alias("id"),
        F.col("username"),
        F.lit("velocity_anomaly").alias("anomaly_type"),
        F.least(F.col("z_volume") / 10.0, F.lit(1.0)).alias("anomaly_score"),
        F.least((F.col("z_volume") * 15).cast("int"), F.lit(100)).alias("risk_score"),
        F.to_json(F.struct("current_event_count", "avg_daily_events")).alias("details"),
        F.col("bl.avg_daily_events").cast("string").alias("baseline_value"),
        F.col("curr.current_event_count").cast("string").alias("observed_value"),
        F.col("z_volume").alias("deviation_sigma"),
        F.lit(True).alias("is_active"),
        F.current_timestamp().alias("detected_at"),
    )
)

# --- Data transfer anomaly ---
transfer_anomalies = (
    joined
    .filter(F.col("bl.avg_bytes_transferred") > 0)
    .withColumn(
        "z_transfer",
        F.abs((F.col("curr.current_bytes_transferred") - F.col("bl.avg_bytes_transferred")) / F.greatest(F.col("bl.avg_bytes_transferred") * 0.3, F.lit(1)))
    )
    .filter(F.col("z_transfer") >= ANOMALY_Z_THRESHOLD)
    .select(
        F.expr("uuid()").alias("id"),
        F.col("username"),
        F.lit("excessive_data_transfer").alias("anomaly_type"),
        F.least(F.col("z_transfer") / 10.0, F.lit(1.0)).alias("anomaly_score"),
        F.least((F.col("z_transfer") * 15).cast("int"), F.lit(100)).alias("risk_score"),
        F.to_json(F.struct("current_bytes_transferred", "avg_bytes_transferred")).alias("details"),
        F.col("bl.avg_bytes_transferred").cast("string").alias("baseline_value"),
        F.col("curr.current_bytes_transferred").cast("string").alias("observed_value"),
        F.col("z_transfer").alias("deviation_sigma"),
        F.lit(True).alias("is_active"),
        F.current_timestamp().alias("detected_at"),
    )
)

# Union all anomaly types
all_anomalies = login_time_anomalies.unionByName(volume_anomalies).unionByName(transfer_anomalies)

# MERGE anomalies into user_anomalies table
target_anomalies_table = f"{SCHEMA}.user_anomalies"
dt_anomalies = DeltaTable.forName(spark, target_anomalies_table)
(
    dt_anomalies.alias("target")
    .merge(
        all_anomalies.alias("source"),
        "target.username = source.username AND target.anomaly_type = source.anomaly_type AND target.is_active = true"
    )
    .whenMatchedUpdate(set={
        "anomaly_score": "source.anomaly_score",
        "risk_score": "source.risk_score",
        "details": "source.details",
        "observed_value": "source.observed_value",
        "deviation_sigma": "source.deviation_sigma",
        "detected_at": "source.detected_at",
    })
    .whenNotMatchedInsertAll()
    .execute()
)

num_anomalies = spark.table(target_anomalies_table).count()
new_anomalies = all_anomalies.count()
print(f"Anomaly detection complete. New anomalies found: {new_anomalies}, Total in table: {num_anomalies:,}")

# =========================================================================
# Summary
# =========================================================================
print(f"\\n--- Ingestion Summary ---")
print(f"  Events:          {spark.table(f'{SCHEMA}.events').count():>6,}")
print(f"  Alerts:          {spark.table(f'{SCHEMA}.alerts').count():>6,}")
print(f"  Threat Intel:    {spark.table(f'{SCHEMA}.threat_feed_items').count():>6,}")
print(f"  User Baselines:  {spark.table(f'{SCHEMA}.user_behavior_baselines').count():>6,}")
print(f"  User Anomalies:  {spark.table(f'{SCHEMA}.user_anomalies').count():>6,}")`
    },
    {
      type: 'code',
      content: `# Cell 9: Data Validation & Summary Dashboard

import matplotlib.pyplot as plt

fig, axes = plt.subplots(2, 3, figsize=(22, 12))
fig.suptitle("Agentic SOC - Data Foundation Validation", fontsize=16, fontweight="bold")

event_dist = (
    spark.table(f"{SCHEMA}.events")
    .groupBy("event_category").count()
    .toPandas()
)
if len(event_dist) > 0:
    colors = ["#2563eb", "#10b981", "#f59e0b", "#ef4444", "#0ea5e9"]
    event_dist.set_index("event_category")["count"].plot(
        kind="bar", ax=axes[0, 0], color=colors[:len(event_dist)], edgecolor="#374151")
    axes[0, 0].tick_params(axis="x", rotation=45)
axes[0, 0].set_title("Events by Category", fontweight="bold")

alert_sev = (
    spark.table(f"{SCHEMA}.alerts")
    .groupBy("severity").count()
    .toPandas()
)
if len(alert_sev) > 0:
    sev_colors = {"low": "#10b981", "medium": "#f59e0b", "high": "#f97316", "critical": "#ef4444"}
    bars = alert_sev.set_index("severity")["count"]
    bars.plot(kind="bar", ax=axes[0, 1],
              color=[sev_colors.get(s, "#64748b") for s in bars.index], edgecolor="#374151")
axes[0, 1].set_title("Alerts by Severity", fontweight="bold")

threat_dist = (
    spark.table(f"{SCHEMA}.threat_feed_items")
    .groupBy("ioc_type").count()
    .toPandas()
)
if len(threat_dist) > 0:
    threat_dist.set_index("ioc_type")["count"].plot(
        kind="pie", ax=axes[0, 2], autopct="%1.0f%%",
        colors=["#2563eb", "#10b981", "#f59e0b", "#ef4444"])
axes[0, 2].set_title("Threat IOCs by Type", fontweight="bold")

anomaly_dist = (
    spark.table(f"{SCHEMA}.user_anomalies")
    .groupBy("anomaly_type").count()
    .toPandas()
)
if len(anomaly_dist) > 0:
    anomaly_dist.set_index("anomaly_type")["count"].plot(
        kind="barh", ax=axes[1, 0], color="#0ea5e9", edgecolor="#0369a1")
axes[1, 0].set_title("Anomalies by Type", fontweight="bold")

agents = spark.table(f"{SCHEMA}.agent_configs").toPandas()
if len(agents) > 0:
    axes[1, 1].barh(agents["agent_type"], agents["interval_seconds"],
                     color="#2563eb", edgecolor="#1e40af")
    axes[1, 1].set_xlabel("Interval (seconds)")
axes[1, 1].set_title("Agent Run Intervals", fontweight="bold")

summary_data = [
    ["Events", f'{spark.table(f"{SCHEMA}.events").count():,}', "OCSF categorized"],
    ["Alerts", f'{spark.table(f"{SCHEMA}.alerts").count():,}', "12 alert types"],
    ["Threat IOCs", f'{spark.table(f"{SCHEMA}.threat_feed_items").count():,}', "7 feeds"],
    ["User Baselines", f'{spark.table(f"{SCHEMA}.user_behavior_baselines").count():,}', "7 departments"],
    ["User Anomalies", f'{spark.table(f"{SCHEMA}.user_anomalies").count():,}', "6 anomaly types"],
    ["Agent Configs", f'{spark.table(f"{SCHEMA}.agent_configs").count():,}', "5 agents"],
    ["Total Tables", f'{len(spark.catalog.listTables(SCHEMA))}', f"in {SCHEMA}"],
]
axes[1, 2].axis("off")
table = axes[1, 2].table(
    cellText=summary_data,
    colLabels=["Component", "Count", "Notes"],
    cellLoc="left", loc="center",
)
table.auto_set_font_size(False)
table.set_fontsize(10)
table.scale(1.2, 1.5)
axes[1, 2].set_title("Data Foundation Summary", fontweight="bold")

plt.tight_layout()
plt.show()

print("Data foundation validated and ready for agent execution.")`
    },
  ],
};
