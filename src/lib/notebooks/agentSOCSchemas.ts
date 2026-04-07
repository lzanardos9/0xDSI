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
import json, random, uuid, hashlib

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
      content: `# Cell 7: Generate Realistic Sample Events

def generate_events(num_events=10000):
    """Generate realistic security events with OCSF categorization."""

    event_templates = [
        {"event_type": "login_success", "category": "authentication", "ocsf_class": "Authentication", "severity": "low", "weight": 0.30, "tactic": "TA0001", "technique": "T1078"},
        {"event_type": "login_failure", "category": "authentication", "ocsf_class": "Authentication", "severity": "medium", "weight": 0.10, "tactic": "TA0006", "technique": "T1110"},
        {"event_type": "privilege_escalation", "category": "authentication", "ocsf_class": "Authorization", "severity": "high", "weight": 0.03, "tactic": "TA0004", "technique": "T1068"},
        {"event_type": "account_lockout", "category": "authentication", "ocsf_class": "Account Change", "severity": "medium", "weight": 0.02, "tactic": "TA0006", "technique": "T1110.003"},
        {"event_type": "connection", "category": "network", "ocsf_class": "Network Activity", "severity": "low", "weight": 0.20, "tactic": None, "technique": None},
        {"event_type": "dns_query", "category": "network", "ocsf_class": "DNS Activity", "severity": "low", "weight": 0.15, "tactic": "TA0011", "technique": "T1071.004"},
        {"event_type": "firewall_block", "category": "network", "ocsf_class": "Network Activity", "severity": "medium", "weight": 0.05, "tactic": None, "technique": None},
        {"event_type": "process_start", "category": "endpoint", "ocsf_class": "Process Activity", "severity": "low", "weight": 0.12, "tactic": "TA0002", "technique": "T1059"},
        {"event_type": "file_access", "category": "endpoint", "ocsf_class": "File Activity", "severity": "low", "weight": 0.10, "tactic": "TA0009", "technique": "T1005"},
        {"event_type": "file_download", "category": "endpoint", "ocsf_class": "File Activity", "severity": "medium", "weight": 0.05, "tactic": "TA0011", "technique": "T1105"},
        {"event_type": "registry_modification", "category": "endpoint", "ocsf_class": "Registry Activity", "severity": "medium", "weight": 0.03, "tactic": "TA0003", "technique": "T1547.001"},
        {"event_type": "malware_detected", "category": "security", "ocsf_class": "Security Finding", "severity": "critical", "weight": 0.015, "tactic": "TA0002", "technique": "T1204"},
        {"event_type": "exploit_attempt", "category": "security", "ocsf_class": "Security Finding", "severity": "high", "weight": 0.02, "tactic": "TA0001", "technique": "T1190"},
        {"event_type": "port_scan", "category": "network", "ocsf_class": "Network Activity", "severity": "medium", "weight": 0.04, "tactic": "TA0043", "technique": "T1046"},
        {"event_type": "large_data_transfer", "category": "network", "ocsf_class": "Network Activity", "severity": "high", "weight": 0.02, "tactic": "TA0010", "technique": "T1048"},
        {"event_type": "powershell_execution", "category": "endpoint", "ocsf_class": "Process Activity", "severity": "medium", "weight": 0.03, "tactic": "TA0002", "technique": "T1059.001"},
        {"event_type": "scheduled_task_created", "category": "endpoint", "ocsf_class": "Scheduled Job", "severity": "medium", "weight": 0.02, "tactic": "TA0003", "technique": "T1053"},
        {"event_type": "service_installed", "category": "endpoint", "ocsf_class": "Process Activity", "severity": "medium", "weight": 0.015, "tactic": "TA0003", "technique": "T1543"},
    ]

    internal_ips = [f"10.0.{i}.{j}" for i in range(1, 10) for j in range(1, 50)]
    external_ips = [f"203.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}" for _ in range(200)]
    malicious_ips = [f"185.{random.randint(100,200)}.{random.randint(0,255)}.{random.randint(0,255)}" for _ in range(30)]
    usernames = [f"user{i}@company.com" for i in range(1, 51)]
    admin_users = ["admin@company.com", "sysadmin@company.com", "dba@company.com"]
    hostnames = [f"WS-{i:03d}" for i in range(1, 101)] + [f"SRV-{n}" for n in ["DC-01", "DC-02", "FS-01", "WEB-01", "WEB-02", "DB-01", "APP-01", "MAIL-01"]]
    domains = ["google.com", "microsoft.com", "github.com", "aws.amazon.com", "office365.com",
               "suspicious-site.ru", "malware-c2.cn", "phishing.xyz", "evil-download.top", "data-exfil.onion"]
    processes = ["chrome.exe", "firefox.exe", "outlook.exe", "python.exe", "cmd.exe",
                 "powershell.exe", "svchost.exe", "explorer.exe", "notepad.exe",
                 "certutil.exe", "bitsadmin.exe", "mshta.exe", "regsvr32.exe", "rundll32.exe"]

    weights = [t["weight"] for t in event_templates]
    base_time = datetime.now() - timedelta(days=7)
    events = []

    for i in range(num_events):
        template = random.choices(event_templates, weights=weights, k=1)[0]

        is_suspicious = random.random() < 0.05
        timestamp = base_time + timedelta(
            days=random.randint(0, 7),
            hours=random.randint(0, 23) if not is_suspicious else random.choice([1, 2, 3, 22, 23]),
            minutes=random.randint(0, 59),
            seconds=random.randint(0, 59),
        )

        src_ip = random.choice(malicious_ips if is_suspicious and random.random() < 0.3 else internal_ips)
        dst_ip = random.choice(external_ips if random.random() > 0.3 else internal_ips)
        if is_suspicious and template["category"] == "network":
            dst_ip = random.choice(malicious_ips) if random.random() < 0.4 else dst_ip

        user = None
        if template["category"] == "authentication":
            user = random.choice(admin_users if is_suspicious and random.random() < 0.3 else usernames)
        elif random.random() < 0.5:
            user = random.choice(usernames)

        events.append({
            "id": gen_uuid(),
            "timestamp": timestamp,
            "event_type": template["event_type"],
            "event_category": template["category"],
            "severity": "critical" if is_suspicious and template["severity"] in ["high", "critical"] else template["severity"],
            "source_ip": src_ip,
            "dest_ip": dst_ip,
            "source_port": random.randint(1024, 65535),
            "dest_port": random.choice([22, 80, 443, 3389, 445, 1433, 3306, 8080, 8443, random.randint(1024, 65535)]),
            "protocol": random.choice(["TCP", "UDP"]) if template["category"] == "network" else "TCP",
            "username": user,
            "hostname": random.choice(hostnames),
            "domain": random.choice(domains) if template["category"] == "network" else None,
            "process_name": random.choice(processes) if template["category"] == "endpoint" else None,
            "file_hash": hashlib.md5(gen_uuid().encode()).hexdigest() if "file" in template["event_type"] else None,
            "bytes_sent": random.randint(100, 50000000 if is_suspicious else 1000000) if template["category"] == "network" else 0,
            "bytes_received": random.randint(100, 1000000) if template["category"] == "network" else 0,
            "duration_ms": random.randint(10, 30000),
            "geo_country": random.choice(["CN", "RU", "IR", "KP"]) if is_suspicious and random.random() < 0.4 else random.choice(["US", "US", "US", "GB", "DE"]),
            "description": f"{template['event_type']} from {src_ip}",
            "raw_log": f"<14>{template['event_type']}|{src_ip}|{dst_ip}|{user or '-'}",
            "ocsf_category": template["category"],
            "ocsf_class": template["ocsf_class"],
            "mitre_technique": template["technique"],
            "mitre_tactic": template["tactic"],
            "data_source": random.choice(["syslog", "edr", "firewall", "ids", "cloud_trail"]),
        })

    return events

events = generate_events(10000)
events_df = spark.createDataFrame(events)
events_df.write.format("delta").mode("overwrite").saveAsTable(f"{SCHEMA}.events")

event_counts = {}
for e in events:
    t = e["event_type"]
    event_counts[t] = event_counts.get(t, 0) + 1

print(f"Events generated: {len(events)}")
for et in sorted(event_counts.keys()):
    print(f"  {et:30s}: {event_counts[et]:>5,}")`
    },
    {
      type: 'code',
      content: `# Cell 8: Generate Alerts, Threat Intel, User Baselines & Anomalies

def generate_alerts(num_alerts=500):
    """Generate realistic correlated alerts."""
    alert_templates = [
        ("Brute Force Attack Detected", "Multiple failed login attempts from single source IP exceeding threshold", "high", 75, ["T1110.003"], ["TA0006"]),
        ("Potential Data Exfiltration", "Large outbound data transfer to external IP exceeding baseline by 3+ sigma", "critical", 85, ["T1048.003"], ["TA0010"]),
        ("Malware C2 Communication", "Connection to known command-and-control server identified by threat feeds", "critical", 90, ["T1071.001"], ["TA0011"]),
        ("Lateral Movement Detected", "Sequential RDP/SMB authentication across 3+ hosts within 30 minutes", "high", 70, ["T1021.001", "T1021.002"], ["TA0008"]),
        ("Suspicious PowerShell Execution", "Encoded PowerShell command execution with network callback", "medium", 55, ["T1059.001", "T1027"], ["TA0002"]),
        ("Port Scan Activity", "Sequential connection attempts to 50+ ports on single target", "medium", 45, ["T1046"], ["TA0043"]),
        ("Unauthorized Privilege Escalation", "Non-admin user gained elevated privileges outside change window", "high", 80, ["T1068", "T1078.002"], ["TA0004"]),
        ("Anomalous User Behavior", "User activity deviates from behavioral baseline by 4+ sigma", "medium", 60, ["T1078"], ["TA0001"]),
        ("Ransomware Indicators Detected", "Rapid file encryption pattern detected across network shares", "critical", 95, ["T1486"], ["TA0040"]),
        ("DNS Tunneling Suspected", "High-volume DNS queries with encoded payloads to rare domain", "high", 72, ["T1071.004"], ["TA0011"]),
        ("Credential Dumping Detected", "LSASS memory access or SAM database extraction attempt", "critical", 88, ["T1003.001", "T1003.002"], ["TA0006"]),
        ("Supply Chain Compromise", "Trusted binary modified or replaced with unsigned variant", "critical", 92, ["T1195.002"], ["TA0001"]),
    ]

    base_time = datetime.now() - timedelta(days=7)
    alerts = []

    for i in range(num_alerts):
        title, desc, severity, base_risk, techniques, tactics = random.choice(alert_templates)
        risk_score = min(100, max(0, base_risk + random.randint(-20, 20)))

        alerts.append({
            "id": gen_uuid(),
            "title": title,
            "description": desc,
            "severity": severity,
            "status": "new",
            "source": random.choice(["correlation_engine", "ml_detector", "threat_feed_match", "behavioral_analytics"]),
            "source_ip": f"10.0.{random.randint(1,9)}.{random.randint(1,254)}" if random.random() > 0.3 else f"185.{random.randint(100,200)}.{random.randint(0,255)}.{random.randint(0,255)}",
            "dest_ip": f"203.{random.randint(0,255)}.{random.randint(0,255)}.{random.randint(0,255)}",
            "username": f"user{random.randint(1,50)}@company.com" if random.random() > 0.3 else None,
            "hostname": f"WS-{random.randint(1,100):03d}",
            "risk_score": risk_score,
            "event_count": random.randint(5, 200),
            "correlated_event_ids": [gen_uuid() for _ in range(random.randint(3, 20))],
            "correlation_rule_id": gen_uuid(),
            "mitre_techniques": techniques,
            "mitre_tactics": tactics,
            "created_at": base_time + timedelta(days=random.randint(0, 7), hours=random.randint(0, 23), minutes=random.randint(0, 59)),
        })

    return alerts


def generate_threat_feeds(num_items=500):
    """Generate threat intelligence IOCs."""
    feeds = ["AlienVault OTX", "Abuse.ch", "MISP Community", "VirusTotal Livehunt", "Custom Intel", "Mandiant", "CrowdStrike"]
    threat_types = ["malware", "c2_server", "phishing", "botnet", "ransomware", "apt", "cryptominer"]
    tag_options = ["emotet", "cobalt_strike", "apt29", "lazarus", "fin7", "conti", "lockbit", "qakbot", "trickbot"]

    items = []
    for _ in range(num_items):
        ioc_type = random.choice(["ip", "domain", "hash", "url"])
        if ioc_type == "ip":
            ioc_value = f"185.{random.randint(100,200)}.{random.randint(0,255)}.{random.randint(0,255)}"
        elif ioc_type == "domain":
            ioc_value = f"malicious-{random.randint(1,2000)}.{random.choice(['ru', 'cn', 'xyz', 'top', 'onion'])}"
        elif ioc_type == "url":
            ioc_value = f"http://malicious-{random.randint(1,500)}.{random.choice(['ru', 'cn'])}/payload/{gen_uuid()[:8]}"
        else:
            ioc_value = hashlib.sha256(gen_uuid().encode()).hexdigest()

        items.append({
            "id": gen_uuid(),
            "feed_name": random.choice(feeds),
            "ioc_type": ioc_type,
            "ioc_value": ioc_value,
            "threat_type": random.choice(threat_types),
            "severity": random.choice(["low", "medium", "high", "critical"]),
            "confidence": round(random.uniform(0.5, 1.0), 2),
            "tags": random.sample(tag_options, random.randint(1, 3)),
            "description": f"Known {random.choice(threat_types)} indicator from {random.choice(feeds)}",
            "first_seen": datetime.now() - timedelta(days=random.randint(1, 365)),
            "last_seen": datetime.now() - timedelta(days=random.randint(0, 30)),
            "is_active": random.random() > 0.1,
        })

    return items


def generate_baselines(num_users=50):
    """Generate user behavioral baselines."""
    departments = ["Engineering", "Finance", "Sales", "HR", "IT", "Security", "Executive"]
    roles = ["analyst", "engineer", "manager", "director", "admin"]
    baselines = []

    for i in range(1, num_users + 1):
        dept = random.choice(departments)
        baselines.append({
            "id": gen_uuid(),
            "username": f"user{i}@company.com",
            "department": dept,
            "role": random.choice(roles),
            "avg_login_hour": round(random.uniform(7, 10), 1),
            "stddev_login_hour": round(random.uniform(0.5, 2), 1),
            "common_locations": random.sample(["US", "UK", "DE", "CA", "JP"], random.randint(1, 2)),
            "common_hosts": [f"WS-{i:03d}"],
            "common_processes": random.sample(["chrome.exe", "outlook.exe", "excel.exe", "python.exe", "vscode.exe"], 3),
            "avg_daily_events": random.randint(50, 500),
            "avg_bytes_transferred": random.randint(10_000_000, 100_000_000),
            "avg_session_duration_min": round(random.uniform(120, 600), 1),
            "risk_score": random.randint(20, 60),
            "peer_group": dept.lower(),
            "last_updated": datetime.now(),
        })

    return baselines


def generate_anomalies(baselines, count=100):
    """Generate user anomalies based on baselines."""
    anomaly_types = [
        ("unusual_login_time", "Login outside normal hours"),
        ("unusual_location", "Login from unusual geolocation"),
        ("excessive_data_transfer", "Data transfer exceeding 3-sigma baseline"),
        ("unusual_process", "Execution of rare process not in baseline"),
        ("privilege_anomaly", "Accessed resources outside normal scope"),
        ("velocity_anomaly", "Rapid sequential actions exceeding rate baseline"),
    ]

    anomalies = []
    for _ in range(count):
        baseline = random.choice(baselines)
        anomaly_type, desc = random.choice(anomaly_types)
        anomalies.append({
            "id": gen_uuid(),
            "username": baseline["username"],
            "anomaly_type": anomaly_type,
            "anomaly_score": round(random.uniform(0.5, 1.0), 3),
            "risk_score": random.randint(30, 95),
            "details": json.dumps({"description": desc, "baseline_user": baseline["username"]}),
            "baseline_value": str(baseline.get("avg_login_hour", "")),
            "observed_value": str(round(random.uniform(0, 5), 1)),
            "deviation_sigma": round(random.uniform(2.0, 6.0), 2),
            "is_active": random.random() > 0.3,
            "detected_at": datetime.now() - timedelta(hours=random.randint(1, 168)),
        })

    return anomalies


alerts = generate_alerts(500)
threat_items = generate_threat_feeds(500)
baselines = generate_baselines(50)
anomalies = generate_anomalies(baselines, 100)

spark.createDataFrame(alerts).write.format("delta").mode("overwrite").saveAsTable(f"{SCHEMA}.alerts")
spark.createDataFrame(threat_items).write.format("delta").mode("overwrite").saveAsTable(f"{SCHEMA}.threat_feed_items")
spark.createDataFrame(baselines).write.format("delta").mode("overwrite").saveAsTable(f"{SCHEMA}.user_behavior_baselines")
spark.createDataFrame(anomalies).write.format("delta").mode("overwrite").saveAsTable(f"{SCHEMA}.user_anomalies")

print(f"Sample data generated:")
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
