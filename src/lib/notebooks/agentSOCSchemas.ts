import { DatabricksNotebook } from '../databricksNotebooks';

export const agentSOCSchemasNotebook: DatabricksNotebook = {
  id: 'agent-soc-schemas',
  title: 'Agentic SOC - Unity Catalog Schema & Configuration',
  subtitle: 'Production Delta Lake schema, agent configs, ALHF tables, and data model for autonomous SOC',
  category: 'ml',
  tags: ['Agentic SOC', 'Unity Catalog', 'Delta Lake', 'Schema Design', 'ALHF', 'Agent Configuration'],
  description: 'Part 1 of the production Agentic SOC. Creates the complete data model for autonomous security operations: events with OCSF categorization, multi-stage alert pipeline, threat intelligence feeds, agent task queue, orchestration logs, agent performance metrics, ALHF (Agent Learning from Human Feedback) tables, response actions, active blocklists, correlation rules, and discovered patterns. Schema-only: does not generate mock data.',
  estimatedRuntime: '3 min',
  clusterRequirements: 'DBR 14.3 LTS, 1+ workers, Unity Catalog enabled',
  cells: [
    {
      type: 'markdown',
      content: `# Agentic SOC - Part 1: Unity Catalog Schema & Configuration

## Production Agentic Security Operations Center

This notebook creates the **complete data model** for autonomous security operations.
It is purely structural (DDL + agent configuration seeding) and does NOT generate synthetic data.

### Agent Architecture

\`\`\`
                    INCOMING EVENTS (Structured Streaming / Batch)
                          |
                          v
               +---------------------+
               |   TRIAGE AGENT      |   Score, prioritize, classify
               +---------------------+
                          |
               +---------------------+
               |   ENRICHMENT AGENT  |   Threat intel, behavioral baselines
               +---------------------+
                          |
               +---------------------+
               |   INVESTIGATION     |   Graph correlation, attack timeline
               |   AGENT             |
               +---------------------+
                          |
               +---------------------+
               |   RESPONSE AGENT    |   Block, isolate, rollback
               +---------------------+
                          |
               +---------------------+
               |   PATTERN DISCOVERY |   ML clustering, rule generation
               +---------------------+
                          |
               +---------------------+
               |   ALHF FEEDBACK     |   Analyst corrections, drift detection
               +---------------------+
\`\`\`

### Three-Notebook Structure
| Notebook | Content |
|----------|---------|
| **Part 1 (this)** | Schemas & agent configuration |
| **Part 2** | Agent implementations with scoring logic |
| **Part 3** | Orchestrator, circuit breakers, observability |`
    },
    {
      type: 'code',
      content: `# Cell 1: Configuration & Setup
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType, BooleanType, TimestampType, ArrayType, LongType
from delta.tables import DeltaTable
import json

dbutils.widgets.text("catalog", "main")
dbutils.widgets.text("schema", "agentic_soc")

CATALOG = dbutils.widgets.get("catalog")
SCHEMA = dbutils.widgets.get("schema")

spark.sql(f"CREATE CATALOG IF NOT EXISTS {CATALOG}")
spark.sql(f"USE CATALOG {CATALOG}")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS {SCHEMA}")
spark.sql(f"USE SCHEMA {SCHEMA}")

CONFIG = {
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
        "circuit_breaker_threshold": 5,
        "circuit_breaker_cooldown_seconds": 300,
    },
    "alhf": {
        "feedback_batch_size": 50,
        "adaptation_min_samples": 20,
        "threshold_adjustment_rate": 0.05,
        "drift_detection_window_days": 7,
    },
}

print(f"Schema: {CATALOG}.{SCHEMA}")
print(f"Agents: triage, enrichment, investigation, response, pattern_discovery")`
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

print("Created: events, alerts")`
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
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
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
) USING DELTA
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
) USING DELTA
""")

print("Created: threat_feed_items, user_behavior_baselines, user_anomalies")`
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
) USING DELTA
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
) USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
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
) USING DELTA
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
) USING DELTA
PARTITIONED BY (agent_type)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print("Created: agent_configs, agent_tasks, agent_orchestration_logs, agent_performance_metrics")`
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
) USING DELTA
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
) USING DELTA
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
) USING DELTA
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
) USING DELTA
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
) USING DELTA
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
) USING DELTA
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
) USING DELTA
""")

print("Created: agent_feedback, agent_threshold_history, cases, response_actions,")
print("         active_blocklist, correlation_rules, discovered_patterns")`
    },
    {
      type: 'code',
      content: `# Cell 6: Seed Agent Configurations (idempotent via MERGE)
import uuid

AGENT_CONFIGS = [
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "triage-agent-v2")),
        "agent_type": "triage",
        "name": "Triage Agent Alpha",
        "description": "Multi-factor alert scoring: severity weighting, IOC matching, repeat offender detection, event volume analysis.",
        "enabled": True, "auto_run": True,
        "interval_seconds": 30, "max_concurrent_tasks": 20, "batch_size": 200, "priority": 1,
        "optimization_method": "hybrid", "model_version": "v2.1",
        "config_json": json.dumps(CONFIG["triage"]),
        "health_status": "healthy",
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "enrichment-agent-v2")),
        "agent_type": "enrichment",
        "name": "Enrichment Agent Beta",
        "description": "Multi-source threat intelligence enrichment: 5+ feeds, behavioral baselines, geolocation anomalies, historical patterns.",
        "enabled": True, "auto_run": True,
        "interval_seconds": 60, "max_concurrent_tasks": 15, "batch_size": 100, "priority": 2,
        "optimization_method": "TAO", "model_version": "v2.0",
        "config_json": json.dumps(CONFIG["enrichment"]),
        "health_status": "healthy",
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "investigation-agent-v2")),
        "agent_type": "investigation",
        "name": "Investigation Agent Gamma",
        "description": "Graph-based event correlation and attack chain reconstruction: multi-hop traversal, lateral movement detection, timeline building.",
        "enabled": True, "auto_run": True,
        "interval_seconds": 120, "max_concurrent_tasks": 10, "batch_size": 50, "priority": 3,
        "optimization_method": "ALHF", "model_version": "v1.5",
        "config_json": json.dumps(CONFIG["investigation"]),
        "health_status": "healthy",
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "response-agent-v2")),
        "agent_type": "response",
        "name": "Response Agent Delta",
        "description": "Automated containment: IP blocks, host isolation, account lockout, firewall updates with rollback capability.",
        "enabled": True, "auto_run": True,
        "interval_seconds": 30, "max_concurrent_tasks": 5, "batch_size": 30, "priority": 4,
        "optimization_method": "hybrid", "model_version": "v1.8",
        "config_json": json.dumps(CONFIG["response"]),
        "health_status": "healthy",
    },
    {
        "id": str(uuid.uuid5(uuid.NAMESPACE_DNS, "pattern-discovery-agent-v2")),
        "agent_type": "pattern_discovery",
        "name": "Pattern Discovery Agent Epsilon",
        "description": "ML-powered attack pattern discovery: sequence analysis, statistical anomaly detection, clustering, auto rule generation.",
        "enabled": True, "auto_run": True,
        "interval_seconds": 300, "max_concurrent_tasks": 3, "batch_size": 10000, "priority": 5,
        "optimization_method": "hybrid", "model_version": "v1.2",
        "config_json": json.dumps(CONFIG["pattern_discovery"]),
        "health_status": "healthy",
    },
]

df_agents = spark.createDataFrame(AGENT_CONFIGS)
df_agents = df_agents.withColumn("created_at", F.current_timestamp()).withColumn("updated_at", F.current_timestamp())

# Idempotent upsert
if spark.catalog.tableExists(f"{SCHEMA}.agent_configs"):
    target = DeltaTable.forName(spark, f"{CATALOG}.{SCHEMA}.agent_configs")
    target.alias("t").merge(
        df_agents.alias("s"), "t.id = s.id"
    ).whenMatchedUpdate(set={
        "config_json": "s.config_json",
        "model_version": "s.model_version",
        "updated_at": "s.updated_at",
    }).whenNotMatchedInsertAll().execute()
else:
    df_agents.write.format("delta").saveAsTable(f"{SCHEMA}.agent_configs")

print(f"Agent configs seeded: {len(AGENT_CONFIGS)}")
for a in AGENT_CONFIGS:
    print(f"  [{a['priority']}] {a['agent_type']:20s} | interval={a['interval_seconds']}s | method={a['optimization_method']}")`
    },
    {
      type: 'code',
      content: `# Cell 7: Schema validation & summary
tables = [t.name for t in spark.catalog.listTables(SCHEMA)]
expected = [
    "events", "alerts", "threat_feed_items", "user_behavior_baselines",
    "user_anomalies", "agent_configs", "agent_tasks", "agent_orchestration_logs",
    "agent_performance_metrics", "agent_feedback", "agent_threshold_history",
    "cases", "response_actions", "active_blocklist", "correlation_rules", "discovered_patterns",
]

print(f"Schema: {CATALOG}.{SCHEMA}")
print(f"Tables created: {len(tables)}")
print()

missing = [t for t in expected if t not in tables]
if missing:
    print(f"WARNING - Missing tables: {missing}")
else:
    print("All expected tables present.")

print()
for t in sorted(tables):
    count = spark.table(f"{SCHEMA}.{t}").count()
    cols = len(spark.table(f"{SCHEMA}.{t}").columns)
    print(f"  {t:35s} | {cols:3d} columns | {count:>8,} rows")

print()
print("Schema ready for agent execution (Part 2 notebook).")`
    },
  ],
};
