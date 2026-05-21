# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Agentic SOC - Unity Catalog Setup
# MAGIC Creates the catalog, schema, and all tables required by the SOC platform.
# MAGIC Run this notebook ONCE to initialize your environment.

# COMMAND ----------

# MAGIC %md
# MAGIC ## Configuration

# COMMAND ----------

dbutils.widgets.text("catalog", "soc_platform", "Unity Catalog Name")
dbutils.widgets.text("schema", "agentic_soc", "Schema Name")

catalog = dbutils.widgets.get("catalog")
schema = dbutils.widgets.get("schema")

print(f"Setting up: {catalog}.{schema}")

# COMMAND ----------

spark.sql(f"CREATE CATALOG IF NOT EXISTS `{catalog}`")
spark.sql(f"USE CATALOG `{catalog}`")
spark.sql(f"CREATE SCHEMA IF NOT EXISTS `{schema}`")
spark.sql(f"USE SCHEMA `{schema}`")

print(f"Catalog and schema ready: {catalog}.{schema}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Core Security Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS events (
    id STRING DEFAULT uuid(),
    timestamp TIMESTAMP DEFAULT current_timestamp(),
    event_type STRING NOT NULL,
    source STRING,
    source_ip STRING,
    dest_ip STRING,
    user_id STRING,
    username STRING,
    action STRING,
    outcome STRING,
    severity STRING DEFAULT 'info',
    raw_log STRING,
    normalized MAP<STRING, STRING>,
    ocsf_class_uid INT,
    ocsf_category_uid INT,
    enrichments MAP<STRING, STRING>,
    geo_location STRUCT<country: STRING, city: STRING, lat: DOUBLE, lon: DOUBLE>,
    ingested_at TIMESTAMP DEFAULT current_timestamp(),
    _rescued_data STRING
)
USING DELTA
PARTITIONED BY (event_type, DATE(timestamp))
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS alerts (
    id STRING DEFAULT uuid(),
    title STRING NOT NULL,
    description STRING,
    severity STRING NOT NULL,
    status STRING DEFAULT 'new',
    source STRING,
    rule_id STRING,
    rule_name STRING,
    event_ids ARRAY<STRING>,
    assigned_to STRING,
    mitre_tactic STRING,
    mitre_technique STRING,
    confidence_score DOUBLE DEFAULT 0.0,
    risk_score INT DEFAULT 0,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    last_seen TIMESTAMP DEFAULT current_timestamp(),
    resolved_at TIMESTAMP,
    resolution_notes STRING,
    false_positive BOOLEAN DEFAULT false,
    tags ARRAY<STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (severity, DATE(created_at))
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS cases (
    id STRING DEFAULT uuid(),
    title STRING NOT NULL,
    description STRING,
    status STRING DEFAULT 'open',
    priority STRING DEFAULT 'medium',
    severity STRING DEFAULT 'medium',
    case_type STRING DEFAULT 'incident',
    assigned_to STRING,
    created_by STRING,
    alert_ids ARRAY<STRING>,
    event_ids ARRAY<STRING>,
    ioc_ids ARRAY<STRING>,
    mitre_tactics ARRAY<STRING>,
    mitre_techniques ARRAY<STRING>,
    evidence MAP<STRING, STRING>,
    timeline ARRAY<STRUCT<timestamp: TIMESTAMP, action: STRING, actor: STRING, details: STRING>>,
    resolution STRING,
    root_cause STRING,
    impact_assessment STRING,
    lessons_learned STRING,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp(),
    closed_at TIMESTAMP,
    sla_breach BOOLEAN DEFAULT false
)
USING DELTA
PARTITIONED BY (status)
""")

print("Core security tables created: events, alerts, cases")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Correlation & Detection Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS correlation_rules (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    rule_type STRING DEFAULT 'threshold',
    severity STRING DEFAULT 'medium',
    enabled BOOLEAN DEFAULT true,
    logic STRING,
    conditions ARRAY<STRING>,
    window_seconds INT DEFAULT 300,
    threshold INT DEFAULT 1,
    mitre_tactic STRING,
    mitre_technique STRING,
    data_sources ARRAY<STRING>,
    false_positive_rate DOUBLE DEFAULT 0.0,
    confidence_score DOUBLE DEFAULT 0.8,
    tags ARRAY<STRING>,
    author STRING,
    version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS cep_patterns (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    pattern_type STRING,
    definition STRING,
    window_ms BIGINT DEFAULT 300000,
    severity STRING DEFAULT 'medium',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS cep_pattern_matches (
    id STRING DEFAULT uuid(),
    rule_id STRING NOT NULL,
    matched_at TIMESTAMP DEFAULT current_timestamp(),
    event_ids ARRAY<STRING>,
    score DOUBLE,
    context MAP<STRING, STRING>
)
USING DELTA
PARTITIONED BY (DATE(matched_at))
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS negative_correlation_rules (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    expected_event_type STRING NOT NULL,
    absence_window_seconds INT DEFAULT 3600,
    severity STRING DEFAULT 'high',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS negative_correlation_detections (
    id STRING DEFAULT uuid(),
    rule_id STRING NOT NULL,
    detected_at TIMESTAMP DEFAULT current_timestamp(),
    context MAP<STRING, STRING>,
    severity STRING
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS detection_rules (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    detection_type STRING,
    logic STRING,
    sigma_rule STRING,
    version INT DEFAULT 1,
    status STRING DEFAULT 'active',
    git_hash STRING,
    test_results MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS rule_version_history (
    id STRING DEFAULT uuid(),
    rule_id STRING NOT NULL,
    version INT,
    changes STRING,
    changed_by STRING,
    changed_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Correlation & detection tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threat Intelligence Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_feeds (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    feed_type STRING,
    url STRING,
    format STRING DEFAULT 'stix',
    enabled BOOLEAN DEFAULT true,
    last_fetch TIMESTAMP,
    ioc_count INT DEFAULT 0,
    confidence DOUBLE DEFAULT 0.7,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS ioc_entries (
    id STRING DEFAULT uuid(),
    indicator_type STRING NOT NULL,
    value STRING NOT NULL,
    threat_type STRING,
    confidence DOUBLE DEFAULT 0.5,
    source STRING,
    feed_id STRING,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    last_seen TIMESTAMP DEFAULT current_timestamp(),
    expiry TIMESTAMP,
    tags ARRAY<STRING>,
    context MAP<STRING, STRING>
)
USING DELTA
PARTITIONED BY (indicator_type)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_campaigns (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    threat_actor STRING,
    status STRING DEFAULT 'active',
    confidence DOUBLE DEFAULT 0.7,
    mitre_techniques ARRAY<STRING>,
    target_sectors ARRAY<STRING>,
    ioc_ids ARRAY<STRING>,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_radar_items (
    id STRING DEFAULT uuid(),
    title STRING NOT NULL,
    category STRING,
    severity STRING,
    source STRING,
    confidence DOUBLE,
    description STRING,
    ioc_count INT DEFAULT 0,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    last_updated TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_radar_sources (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    source_type STRING,
    url STRING,
    enabled BOOLEAN DEFAULT true,
    last_fetch TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Threat intelligence tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Agent System Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS agent_configs (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    agent_type STRING NOT NULL,
    description STRING,
    enabled BOOLEAN DEFAULT true,
    config MAP<STRING, STRING>,
    schedule STRING,
    cluster_policy STRING,
    notebook_path STRING,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS agent_status (
    id STRING DEFAULT uuid(),
    agent_id STRING NOT NULL,
    status STRING DEFAULT 'idle',
    last_heartbeat TIMESTAMP DEFAULT current_timestamp(),
    events_processed BIGINT DEFAULT 0,
    alerts_generated INT DEFAULT 0,
    errors INT DEFAULT 0,
    last_error STRING,
    metrics MAP<STRING, DOUBLE>,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_agent_registry (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    agent_class STRING,
    description STRING,
    capabilities ARRAY<STRING>,
    status STRING DEFAULT 'registered',
    version STRING DEFAULT '1.0.0',
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS agent_implementations (
    id STRING DEFAULT uuid(),
    agent_id STRING NOT NULL,
    implementation_type STRING,
    code STRING,
    dependencies ARRAY<STRING>,
    config MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Agent system tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Response & Automation Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS response_actions (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    action_type STRING NOT NULL,
    target STRING,
    status STRING DEFAULT 'pending',
    triggered_by STRING,
    alert_id STRING,
    case_id STRING,
    parameters MAP<STRING, STRING>,
    result MAP<STRING, STRING>,
    executed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS response_approvals (
    id STRING DEFAULT uuid(),
    action_id STRING NOT NULL,
    approver STRING,
    status STRING DEFAULT 'pending',
    decision_notes STRING,
    requested_at TIMESTAMP DEFAULT current_timestamp(),
    decided_at TIMESTAMP
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS workflows (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    workflow_type STRING,
    trigger_type STRING,
    steps ARRAY<STRUCT<step_id: STRING, action: STRING, config: MAP<STRING, STRING>>>,
    enabled BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    run_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Response & automation tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## User & Behavior Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS user_profiles (
    id STRING DEFAULT uuid(),
    display_name STRING,
    email STRING,
    username STRING,
    department STRING,
    role STRING DEFAULT 'analyst',
    risk_level STRING DEFAULT 'low',
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS user_behavior_anomalies (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    anomaly_type STRING NOT NULL,
    risk_score INT DEFAULT 0,
    description STRING,
    baseline_deviation DOUBLE,
    detected_at TIMESTAMP DEFAULT current_timestamp(),
    resolved BOOLEAN DEFAULT false,
    context MAP<STRING, STRING>
)
USING DELTA
PARTITIONED BY (DATE(detected_at))
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    activity_type STRING,
    resource STRING,
    action STRING,
    outcome STRING,
    ip_address STRING,
    user_agent STRING,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(timestamp))
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS psychological_profiles (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    profile_type STRING,
    risk_indicators ARRAY<STRING>,
    behavioral_score DOUBLE DEFAULT 0.0,
    assessment_date TIMESTAMP DEFAULT current_timestamp(),
    data_sources ARRAY<STRING>
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS behavioral_indicators (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    indicator_type STRING,
    value DOUBLE,
    context STRING,
    detected_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("User & behavior tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Infrastructure & Asset Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS asset_registry (
    id STRING DEFAULT uuid(),
    hostname STRING,
    ip_address STRING,
    asset_type STRING,
    os STRING,
    criticality STRING DEFAULT 'medium',
    owner STRING,
    department STRING,
    location STRING,
    tags ARRAY<STRING>,
    last_scan TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS data_connectors (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    connector_type STRING,
    status STRING DEFAULT 'active',
    config MAP<STRING, STRING>,
    last_sync TIMESTAMP,
    events_ingested BIGINT DEFAULT 0,
    error_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS vulnerability_scans (
    id STRING DEFAULT uuid(),
    asset_id STRING,
    scanner STRING,
    cve_id STRING,
    severity STRING,
    cvss_score DOUBLE,
    status STRING DEFAULT 'open',
    description STRING,
    remediation STRING,
    discovered_at TIMESTAMP DEFAULT current_timestamp(),
    resolved_at TIMESTAMP
)
USING DELTA
""")

print("Infrastructure & asset tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## AI/ML & LLM Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS llm_usage_logs (
    id STRING DEFAULT uuid(),
    user_id STRING,
    model STRING,
    prompt_tokens INT,
    completion_tokens INT,
    request_type STRING,
    risk_flags ARRAY<STRING>,
    pii_detected BOOLEAN DEFAULT false,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(timestamp))
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS llm_risk_profiles (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    risk_score DOUBLE DEFAULT 0.0,
    risk_category STRING DEFAULT 'low',
    flags ARRAY<STRING>,
    last_assessed TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS llm_guardrail_policies (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    policy_type STRING,
    rules ARRAY<STRING>,
    action STRING DEFAULT 'block',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS llm_guardrail_violations (
    id STRING DEFAULT uuid(),
    policy_id STRING,
    user_id STRING,
    violation_type STRING,
    severity STRING,
    prompt_snippet STRING,
    action_taken STRING,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS pii_redaction_rules (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    pattern STRING,
    entity_type STRING,
    action STRING DEFAULT 'redact',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS model_poisoning_monitors (
    id STRING DEFAULT uuid(),
    model_name STRING NOT NULL,
    monitor_type STRING,
    baseline_metrics MAP<STRING, DOUBLE>,
    threshold_config MAP<STRING, DOUBLE>,
    status STRING DEFAULT 'active',
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS model_poisoning_detections (
    id STRING DEFAULT uuid(),
    monitor_id STRING NOT NULL,
    detection_type STRING,
    severity STRING,
    drift_score DOUBLE,
    details MAP<STRING, STRING>,
    detected_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("AI/ML & LLM tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Honeypot & Deception Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS honeypot_deployments (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    honeypot_type STRING,
    ip_address STRING,
    port INT,
    protocol STRING,
    status STRING DEFAULT 'active',
    location STRING,
    interactions_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS honeytoken_deployments (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    token_type STRING,
    location STRING,
    status STRING DEFAULT 'active',
    triggered BOOLEAN DEFAULT false,
    triggered_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS honeypot_interactions (
    id STRING DEFAULT uuid(),
    honeypot_id STRING NOT NULL,
    source_ip STRING,
    source_port INT,
    protocol STRING,
    payload STRING,
    threat_level STRING DEFAULT 'medium',
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(timestamp))
""")

print("Honeypot & deception tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Red Team & Malware Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS red_team_campaigns (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    campaign_type STRING,
    status STRING DEFAULT 'planning',
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    objectives ARRAY<STRING>,
    techniques_used ARRAY<STRING>,
    findings ARRAY<STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS malware_samples (
    id STRING DEFAULT uuid(),
    sha256 STRING NOT NULL,
    file_name STRING,
    file_type STRING,
    file_size BIGINT,
    malware_family STRING,
    threat_level STRING DEFAULT 'medium',
    analysis_status STRING DEFAULT 'pending',
    static_analysis MAP<STRING, STRING>,
    dynamic_analysis MAP<STRING, STRING>,
    ioc_extracted ARRAY<STRING>,
    submitted_at TIMESTAMP DEFAULT current_timestamp(),
    analyzed_at TIMESTAMP
)
USING DELTA
""")

print("Red team & malware tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Compliance & Governance Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS compliance_frameworks (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    version STRING,
    description STRING,
    control_count INT DEFAULT 0,
    status STRING DEFAULT 'active',
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS compliance_controls (
    id STRING DEFAULT uuid(),
    framework_id STRING NOT NULL,
    control_id STRING NOT NULL,
    title STRING,
    description STRING,
    status STRING DEFAULT 'not_assessed',
    evidence ARRAY<STRING>,
    last_assessed TIMESTAMP,
    assessor STRING
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS unity_catalog_audit_events (
    id STRING DEFAULT uuid(),
    event_type STRING,
    user_id STRING,
    resource_type STRING,
    resource_name STRING,
    action STRING,
    outcome STRING,
    details MAP<STRING, STRING>,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(timestamp))
""")

print("Compliance & governance tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Dashboard & Platform Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS custom_dashboards (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    layout STRING,
    owner STRING,
    shared_with ARRAY<STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS dashboard_widgets (
    id STRING DEFAULT uuid(),
    dashboard_id STRING NOT NULL,
    widget_type STRING,
    title STRING,
    config MAP<STRING, STRING>,
    position STRUCT<x: INT, y: INT, w: INT, h: INT>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS system_settings (
    id STRING DEFAULT uuid(),
    key STRING NOT NULL,
    value STRING,
    category STRING,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS reports (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    report_type STRING,
    schedule STRING,
    last_generated TIMESTAMP,
    config MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS notebook_runs (
    id STRING DEFAULT uuid(),
    notebook_path STRING NOT NULL,
    status STRING DEFAULT 'running',
    started_at TIMESTAMP DEFAULT current_timestamp(),
    completed_at TIMESTAMP,
    duration_seconds INT,
    output MAP<STRING, STRING>,
    error STRING
)
USING DELTA
""")

print("Dashboard & platform tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Financial Threat & Specialized Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS financial_threat_intel (
    id STRING DEFAULT uuid(),
    threat_type STRING NOT NULL,
    target_institution STRING,
    attack_vector STRING,
    severity STRING DEFAULT 'high',
    indicators ARRAY<STRING>,
    description STRING,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    status STRING DEFAULT 'active'
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS financial_transactions (
    id STRING DEFAULT uuid(),
    transaction_type STRING,
    amount DOUBLE,
    currency STRING DEFAULT 'BRL',
    source_account STRING,
    dest_account STRING,
    risk_score DOUBLE DEFAULT 0.0,
    flagged BOOLEAN DEFAULT false,
    flag_reason STRING,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(timestamp))
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS insider_credential_cases (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    case_type STRING,
    risk_level STRING DEFAULT 'high',
    indicators ARRAY<STRING>,
    status STRING DEFAULT 'investigating',
    evidence MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Financial threat tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Advanced Analytics Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS feature_lab_features (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    feature_type STRING,
    description STRING,
    status STRING DEFAULT 'experimental',
    config MAP<STRING, STRING>,
    metrics MAP<STRING, DOUBLE>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS glasswing_scans (
    id STRING DEFAULT uuid(),
    target STRING NOT NULL,
    scan_type STRING,
    status STRING DEFAULT 'running',
    findings_count INT DEFAULT 0,
    critical_count INT DEFAULT 0,
    started_at TIMESTAMP DEFAULT current_timestamp(),
    completed_at TIMESTAMP
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS glasswing_vulnerabilities (
    id STRING DEFAULT uuid(),
    scan_id STRING NOT NULL,
    cve_id STRING,
    severity STRING,
    title STRING,
    description STRING,
    affected_component STRING,
    remediation STRING,
    exploit_available BOOLEAN DEFAULT false
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS detection_confluence_signals (
    id STRING DEFAULT uuid(),
    signal_type STRING NOT NULL,
    source STRING,
    confidence DOUBLE DEFAULT 0.5,
    context MAP<STRING, STRING>,
    correlated_with ARRAY<STRING>,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_streaming_nodes (
    id STRING DEFAULT uuid(),
    node_type STRING NOT NULL,
    label STRING,
    properties MAP<STRING, STRING>,
    risk_score DOUBLE DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_streaming_edges (
    id STRING DEFAULT uuid(),
    source_id STRING NOT NULL,
    target_id STRING NOT NULL,
    edge_type STRING,
    weight DOUBLE DEFAULT 1.0,
    properties MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Advanced analytics tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Geopolitical & Temporal Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS geopolitical_events (
    id STRING DEFAULT uuid(),
    title STRING NOT NULL,
    event_type STRING,
    region STRING,
    country STRING,
    severity STRING DEFAULT 'medium',
    cyber_relevance DOUBLE DEFAULT 0.0,
    description STRING,
    source STRING,
    event_date TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS geopolitical_risk_scores (
    id STRING DEFAULT uuid(),
    country STRING NOT NULL,
    risk_score DOUBLE DEFAULT 0.0,
    cyber_threat_level STRING DEFAULT 'low',
    factors MAP<STRING, DOUBLE>,
    assessed_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS chronoweave_timelines (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    event_count INT DEFAULT 0,
    status STRING DEFAULT 'active',
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS chronoweave_branches (
    id STRING DEFAULT uuid(),
    timeline_id STRING NOT NULL,
    branch_point TIMESTAMP,
    hypothesis STRING,
    probability DOUBLE DEFAULT 0.5,
    events ARRAY<STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Geopolitical & temporal tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## MCP & Integration Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS mcp_servers (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    server_type STRING,
    url STRING,
    status STRING DEFAULT 'active',
    capabilities ARRAY<STRING>,
    config MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS mcp_tools (
    id STRING DEFAULT uuid(),
    server_id STRING NOT NULL,
    name STRING NOT NULL,
    description STRING,
    input_schema STRING,
    enabled BOOLEAN DEFAULT true,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS swarm_battlefields (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    scenario STRING,
    status STRING DEFAULT 'active',
    agents ARRAY<STRING>,
    results MAP<STRING, STRING>,
    started_at TIMESTAMP DEFAULT current_timestamp(),
    completed_at TIMESTAMP
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS trend_signals (
    id STRING DEFAULT uuid(),
    signal_type STRING NOT NULL,
    source STRING,
    value DOUBLE,
    trend_direction STRING,
    confidence DOUBLE DEFAULT 0.5,
    context MAP<STRING, STRING>,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("MCP & integration tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## ETL & Ingestion Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS etl_ingestion_configs (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    source_type STRING,
    config MAP<STRING, STRING>,
    schedule STRING,
    enabled BOOLEAN DEFAULT true,
    last_run TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS etl_ingestion_runs (
    id STRING DEFAULT uuid(),
    config_id STRING NOT NULL,
    status STRING DEFAULT 'running',
    records_processed BIGINT DEFAULT 0,
    records_failed BIGINT DEFAULT 0,
    started_at TIMESTAMP DEFAULT current_timestamp(),
    completed_at TIMESTAMP,
    error STRING
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS session_lists (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    list_type STRING,
    entries ARRAY<STRING>,
    ttl_seconds INT DEFAULT 3600,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    expires_at TIMESTAMP
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS active_lists (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    category STRING,
    entries ARRAY<MAP<STRING, STRING>>,
    max_size INT DEFAULT 10000,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS pattern_discoveries (
    id STRING DEFAULT uuid(),
    pattern_type STRING NOT NULL,
    description STRING,
    confidence DOUBLE DEFAULT 0.5,
    supporting_events ARRAY<STRING>,
    discovered_at TIMESTAMP DEFAULT current_timestamp(),
    status STRING DEFAULT 'new'
)
USING DELTA
""")

print("ETL & ingestion tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Threat Escalation & Scoring Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_escalation_rules (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    description STRING,
    conditions ARRAY<STRING>,
    escalation_level INT DEFAULT 1,
    notify_roles ARRAY<STRING>,
    auto_respond BOOLEAN DEFAULT false,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_escalation_contracts (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    domain STRING,
    schema_definition STRING,
    sla_seconds INT DEFAULT 300,
    owner STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_pattern_scores (
    id STRING DEFAULT uuid(),
    pattern_type STRING NOT NULL,
    entity_id STRING,
    score DOUBLE DEFAULT 0.0,
    contributing_factors ARRAY<STRING>,
    calculated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Threat escalation & scoring tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Production Integration Tables (Detection Confluence, Notifications, Ticketing, Vector Search)

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS confluence_verdicts (
    id STRING NOT NULL,
    entity_id STRING NOT NULL,
    fused_score DOUBLE NOT NULL,
    priority STRING,
    contributing_lenses STRING,
    lens_count INT,
    kill_chain_stage STRING,
    signal_count INT,
    arbiter_mode STRING DEFAULT 'bayesian_weighted',
    escalated BOOLEAN DEFAULT false,
    verdict_time TIMESTAMP DEFAULT current_timestamp(),
    fusion_window_seconds INT,
    weights_snapshot STRING
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS confluence_lineage (
    id STRING NOT NULL,
    source_signal_id STRING NOT NULL,
    source_lens STRING,
    verdict_id STRING NOT NULL,
    entity_id STRING,
    contribution_weight DOUBLE,
    raw_score DOUBLE,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS confluence_lens_weights (
    id STRING DEFAULT uuid(),
    weights_json STRING NOT NULL,
    version INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    description STRING,
    updated_by STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS confluence_arbiter_runs (
    id STRING NOT NULL,
    run_time TIMESTAMP NOT NULL,
    fusion_window_seconds INT,
    escalation_threshold DOUBLE,
    signals_processed INT,
    verdicts_generated INT,
    verdicts_escalated INT,
    weights_used STRING,
    lens_signal_counts STRING
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS vector_hunt_matches (
    id STRING DEFAULT uuid(),
    alert_id STRING NOT NULL,
    similarity_score DOUBLE NOT NULL,
    matched_threat_pattern STRING,
    kill_chain_phase STRING,
    matched_at TIMESTAMP DEFAULT current_timestamp(),
    processed_by_confluence BOOLEAN DEFAULT false
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS formula_priority_scores (
    id STRING DEFAULT uuid(),
    entity_id STRING NOT NULL,
    priority_score DOUBLE NOT NULL,
    priority_reason STRING,
    scored_at TIMESTAMP DEFAULT current_timestamp(),
    processed_by_confluence BOOLEAN DEFAULT false
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS slm_classifications (
    id STRING DEFAULT uuid(),
    alert_id STRING NOT NULL,
    classification STRING NOT NULL,
    confidence DOUBLE,
    mitre_tactic STRING,
    classified_at TIMESTAMP DEFAULT current_timestamp(),
    processed_by_confluence BOOLEAN DEFAULT false
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_anomaly_detections (
    id STRING DEFAULT uuid(),
    source_entity STRING NOT NULL,
    anomaly_score DOUBLE NOT NULL,
    pattern_type STRING,
    kill_chain_phase STRING,
    detected_at TIMESTAMP DEFAULT current_timestamp(),
    processed_by_confluence BOOLEAN DEFAULT false
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS notification_log (
    id STRING NOT NULL,
    alert_id STRING NOT NULL,
    channel STRING NOT NULL,
    priority STRING,
    status STRING DEFAULT 'pending',
    response_detail STRING,
    sent_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS notification_routes (
    id STRING DEFAULT uuid(),
    severity STRING NOT NULL,
    channel STRING NOT NULL,
    priority STRING DEFAULT 'P3',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS analyst_oncall (
    id STRING DEFAULT uuid(),
    email STRING NOT NULL,
    name STRING,
    is_active BOOLEAN DEFAULT true,
    shift_start TIMESTAMP,
    shift_end TIMESTAMP,
    team STRING DEFAULT 'soc_tier1'
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS ticket_sync_log (
    id STRING NOT NULL,
    case_id STRING NOT NULL,
    ticketing_system STRING NOT NULL,
    external_ticket_id STRING,
    sync_direction STRING DEFAULT 'outbound',
    status STRING DEFAULT 'pending',
    error_message STRING,
    synced_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS connector_registry (
    id STRING DEFAULT uuid(),
    name STRING NOT NULL,
    connector_type STRING,
    source_system STRING,
    health_check_url STRING,
    health_status STRING DEFAULT 'unknown',
    enabled BOOLEAN DEFAULT true,
    last_health_check TIMESTAMP,
    config MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS connector_health_log (
    id STRING NOT NULL,
    connector_id STRING NOT NULL,
    connector_name STRING,
    status STRING NOT NULL,
    health_detail STRING,
    throughput_detail STRING,
    issues STRING,
    checked_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS connector_metrics (
    id STRING DEFAULT uuid(),
    connector_id STRING NOT NULL,
    events_per_minute DOUBLE,
    error_rate DOUBLE DEFAULT 0.0,
    latency_ms DOUBLE,
    recorded_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS connector_schema_history (
    id STRING DEFAULT uuid(),
    connector_id STRING NOT NULL,
    schema_hash STRING NOT NULL,
    schema_fields STRING,
    checked_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS quarantine_events (
    id STRING DEFAULT uuid(),
    event_type STRING,
    timestamp TIMESTAMP,
    source_ip STRING,
    dest_ip STRING,
    user_id STRING,
    hostname STRING,
    action STRING,
    severity STRING,
    description STRING,
    source_topic STRING,
    source_partition INT,
    source_offset BIGINT,
    raw_data STRING,
    ingestion_time TIMESTAMP DEFAULT current_timestamp(),
    parse_status STRING DEFAULT 'failed',
    source_connector STRING
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS ml_model_monitoring (
    experiment STRING NOT NULL,
    status STRING NOT NULL,
    last_run STRING,
    staleness_days INT,
    drift_detected BOOLEAN DEFAULT false,
    drift_details STRING,
    checked_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Production integration tables created (18 tables)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup Complete
# MAGIC All 90+ tables have been created in Unity Catalog.

# COMMAND ----------

tables = spark.sql(f"SHOW TABLES IN `{catalog}`.`{schema}`").collect()
print(f"\nTotal tables created: {len(tables)}")
print("\nAll tables:")
for t in sorted(tables, key=lambda x: x.tableName):
    print(f"  - {t.tableName}")
