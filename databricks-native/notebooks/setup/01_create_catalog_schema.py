# Databricks notebook source
# MAGIC %md
# MAGIC # 0xDSI Agentic SOC - Unity Catalog Setup
# MAGIC Creates the catalog, schema, and all tables required by the SOC platform.
# MAGIC Run this notebook ONCE to initialize your environment.
# MAGIC
# MAGIC **Note:** This notebook does NOT use `_shared/bootstrap` because it CREATES the
# MAGIC infrastructure (catalog, schema, tables) that bootstrap depends on. It must operate
# MAGIC independently using widget-based configuration.

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
    hostname STRING,
    action STRING,
    outcome STRING,
    severity STRING DEFAULT 'info',
    severity_id INT DEFAULT 1,
    raw_log STRING,
    normalized MAP<STRING, STRING>,
    ocsf_class_uid INT,
    ocsf_category_uid INT,
    ocsf_activity_id INT,
    ocsf_type_uid INT,
    ocsf_category_name STRING,
    ocsf_class_name STRING,
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
    acknowledged_at TIMESTAMP,
    resolved_at TIMESTAMP,
    resolution_notes STRING,
    false_positive BOOLEAN DEFAULT false,
    sla_breached BOOLEAN DEFAULT false,
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
    data_sources ARRAY<STRING>,
    sentiment_score_current DOUBLE DEFAULT 0.0,
    sentiment_volatility DOUBLE DEFAULT 0.0,
    toxicity_score_current DOUBLE DEFAULT 0.0,
    dominant_emotion STRING DEFAULT 'neutral',
    dominant_intent STRING DEFAULT 'neutral',
    communication_risk_score DOUBLE DEFAULT 0.0,
    exfiltration_language_ratio DOUBLE DEFAULT 0.0,
    job_search_indicator_ratio DOUBLE DEFAULT 0.0,
    risk_signals STRING,
    top_topics STRING,
    messages_analyzed INT DEFAULT 0,
    channel_breakdown STRING,
    sentiment_trend_7d DOUBLE,
    sentiment_trend_14d DOUBLE,
    sentiment_trend_30d DOUBLE,
    toxicity_trend_7d DOUBLE,
    toxicity_incidents_30d INT DEFAULT 0,
    analysis_window_hours INT DEFAULT 24,
    last_analyzed_at TIMESTAMP
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS behavioral_indicators (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    indicator_type STRING NOT NULL,
    indicator_name STRING,
    severity STRING DEFAULT 'low',
    score DOUBLE DEFAULT 0.0,
    value DOUBLE,
    context STRING,
    evidence STRING,
    detected_at TIMESTAMP DEFAULT current_timestamp(),
    source STRING DEFAULT 'manual'
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS bronze_communications (
    message_id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    channel_type STRING NOT NULL,
    message_body STRING,
    subject STRING,
    sent_at TIMESTAMP DEFAULT current_timestamp(),
    recipient_count INT DEFAULT 1,
    is_external BOOLEAN DEFAULT false,
    analyzed BOOLEAN DEFAULT false,
    analyzed_at TIMESTAMP,
    source_system STRING,
    metadata MAP<STRING, STRING>
)
USING DELTA
PARTITIONED BY (channel_type)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS communication_baselines (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    baseline_embedding STRING,
    messages_in_baseline INT DEFAULT 0,
    avg_sentiment_at_baseline DOUBLE DEFAULT 0.0,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS psychological_profiles_history (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    sentiment_score_current DOUBLE,
    sentiment_volatility DOUBLE,
    toxicity_score_current DOUBLE,
    dominant_emotion STRING,
    dominant_intent STRING,
    communication_risk_score DOUBLE,
    exfiltration_language_ratio DOUBLE,
    job_search_indicator_ratio DOUBLE,
    messages_analyzed INT,
    analysis_window_hours INT DEFAULT 24,
    analyzed_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (user_id)
""")

print("User & behavior tables created")
print("Communication analysis tables created (bronze_communications, baselines, history)")

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

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_cep_detections (
    pattern_id STRING,
    batch_id LONG,
    affected_entities ARRAY<STRING>,
    pattern_type STRING,
    subgraph_hash STRING,
    anomaly_score DOUBLE,
    description STRING,
    graph_snapshot STRING,
    detected_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (pattern_type)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS graph_cep_baseline (
    batch_id LONG,
    node_count INT,
    edge_count INT,
    component_count INT,
    top_centrality STRING,
    metrics_json STRING,
    snapshot_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Advanced analytics tables created")
print("Graph CEP detection and baseline tables created")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Operational & Agent Infrastructure Tables

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS streaming_queries (
    query_id STRING,
    query_name STRING NOT NULL,
    notebook_path STRING,
    checkpoint_location STRING,
    source_table STRING,
    sink_table STRING,
    trigger_interval STRING,
    status STRING DEFAULT 'active',
    last_batch_id LONG,
    last_progress_timestamp TIMESTAMP,
    started_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS checkpoint_gc_log (
    gc_id STRING DEFAULT uuid(),
    checkpoint_path STRING NOT NULL,
    query_name STRING,
    files_deleted INT DEFAULT 0,
    bytes_freed LONG DEFAULT 0,
    gc_status STRING DEFAULT 'completed',
    error_message STRING,
    executed_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS analyst_feedback (
    feedback_id STRING DEFAULT uuid(),
    alert_id STRING,
    case_id STRING,
    analyst_id STRING NOT NULL,
    feedback_type STRING NOT NULL,
    verdict STRING,
    confidence DOUBLE,
    reasoning STRING,
    corrections MAP<STRING, STRING>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS ot_security_findings (
    finding_id STRING DEFAULT uuid(),
    protocol STRING NOT NULL,
    severity STRING DEFAULT 'medium',
    finding_type STRING,
    device_ip STRING,
    device_name STRING,
    description STRING,
    raw_payload STRING,
    mitre_technique STRING,
    remediation STRING,
    status STRING DEFAULT 'open',
    detected_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (protocol)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS gold_exploit_chains (
    chain_id STRING DEFAULT uuid(),
    cve_ids ARRAY<STRING>,
    exploit_feasibility_score DOUBLE,
    attack_complexity STRING,
    primitive_stages STRING,
    mitigation_bypass_score DOUBLE,
    affected_assets ARRAY<STRING>,
    llm_reasoning STRING,
    status STRING DEFAULT 'analyzed',
    analyzed_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS bronze_communications (
    comm_id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    channel STRING,
    direction STRING,
    recipient STRING,
    subject STRING,
    body_preview STRING,
    sentiment_score DOUBLE,
    urgency_score DOUBLE,
    anomaly_indicators ARRAY<STRING>,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (channel)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS communication_baselines (
    baseline_id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    metric_type STRING NOT NULL,
    metric_value DOUBLE,
    stddev DOUBLE,
    sample_count INT,
    window_start TIMESTAMP,
    window_end TIMESTAMP,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS scan_orchestration_log (
    scan_id STRING DEFAULT uuid(),
    scan_type STRING NOT NULL,
    target STRING,
    status STRING DEFAULT 'queued',
    findings_count INT DEFAULT 0,
    critical_count INT DEFAULT 0,
    high_count INT DEFAULT 0,
    scanner_version STRING,
    duration_seconds DOUBLE,
    initiated_by STRING,
    started_at TIMESTAMP DEFAULT current_timestamp(),
    completed_at TIMESTAMP
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS scan_findings (
    finding_id STRING DEFAULT uuid(),
    scan_id STRING NOT NULL,
    vulnerability_id STRING,
    severity STRING DEFAULT 'medium',
    title STRING NOT NULL,
    description STRING,
    affected_component STRING,
    remediation STRING,
    cvss_score DOUBLE,
    exploitability_score DOUBLE,
    status STRING DEFAULT 'open',
    detected_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (severity)
""")

# --- Agent 47: Autonomous Response Learner tables ---

spark.sql("""
CREATE TABLE IF NOT EXISTS arl_q_tables (
    model_id STRING NOT NULL,
    q_table_json STRING,
    status STRING DEFAULT 'active',
    training_episodes INT DEFAULT 0,
    avg_reward DOUBLE DEFAULT 0.0,
    loss_rate DOUBLE DEFAULT 0.0,
    states_visited INT DEFAULT 0,
    blacklisted_pairs INT DEFAULT 0,
    noise_rate DOUBLE DEFAULT 0.15,
    gamma DOUBLE DEFAULT 0.015,
    learning_rate DOUBLE DEFAULT 0.2,
    feedback_corrections INT DEFAULT 0,
    trained_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS arl_decisions (
    decision_id STRING NOT NULL,
    state_tuple STRING,
    action_name STRING,
    q_value DOUBLE,
    confidence DOUBLE,
    autonomous BOOLEAN DEFAULT false,
    status STRING DEFAULT 'pending',
    observation_json STRING,
    outcome STRING,
    reward_received DOUBLE,
    analyst_override STRING,
    decided_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (action_name)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS arl_training_runs (
    run_id STRING NOT NULL,
    mlflow_run_id STRING,
    episodes INT,
    avg_reward DOUBLE,
    loss_rate DOUBLE,
    states_visited INT,
    blacklisted_pairs INT,
    noise_profile STRING,
    topology_variety STRING,
    training_duration_seconds DOUBLE,
    model_version INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

print("Operational and agent infrastructure tables created")
print("Agent 47 (Autonomous Response Learner) tables created")

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
# MAGIC ## Phase 1: Entity Spine, Knowledge Store, and UEO Tables

# COMMAND ----------

# Entity Spine: canonical identity graph
spark.sql("""
CREATE TABLE IF NOT EXISTS entity_spine (
    entity_id STRING NOT NULL,
    entity_type STRING NOT NULL,
    canonical_name STRING NOT NULL,
    display_name STRING,
    attributes MAP<STRING, STRING>,
    first_seen TIMESTAMP NOT NULL,
    last_seen TIMESTAMP NOT NULL,
    observation_count BIGINT DEFAULT 1,
    risk_score DOUBLE DEFAULT 0.0,
    centrality_degree DOUBLE DEFAULT 0.0,
    centrality_betweenness DOUBLE DEFAULT 0.0,
    centrality_pagerank DOUBLE DEFAULT 0.0,
    is_high_value BOOLEAN DEFAULT false,
    is_service_account BOOLEAN DEFAULT false,
    department STRING,
    owner STRING,
    tags ARRAY<STRING>,
    merged_from ARRAY<STRING>,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS entity_edges (
    edge_id STRING NOT NULL,
    source_entity_id STRING NOT NULL,
    target_entity_id STRING NOT NULL,
    edge_type STRING NOT NULL,
    weight DOUBLE DEFAULT 1.0,
    first_seen TIMESTAMP NOT NULL,
    last_seen TIMESTAMP NOT NULL,
    observation_count BIGINT DEFAULT 1,
    properties MAP<STRING, STRING>,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS entity_mentions (
    mention_id STRING NOT NULL,
    event_id STRING NOT NULL,
    entity_id STRING,
    entity_type STRING NOT NULL,
    raw_value STRING NOT NULL,
    source_field STRING NOT NULL,
    event_timestamp TIMESTAMP NOT NULL,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Knowledge Store: operational memory
spark.sql("""
CREATE TABLE IF NOT EXISTS knowledge_store (
    ks_id STRING NOT NULL,
    entry_type STRING NOT NULL,
    title STRING NOT NULL,
    content STRING NOT NULL,
    content_hash STRING NOT NULL,
    source_id STRING,
    source_table STRING,
    entity_ids ARRAY<STRING>,
    mitre_tactics ARRAY<STRING>,
    mitre_techniques ARRAY<STRING>,
    tags ARRAY<STRING>,
    severity STRING,
    confidence DOUBLE DEFAULT 0.5,
    outcome STRING,
    analyst_id STRING,
    valid_from TIMESTAMP DEFAULT current_timestamp(),
    valid_until TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    retrieval_count BIGINT DEFAULT 0,
    last_retrieved TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS knowledge_store_embeddings (
    ks_id STRING NOT NULL,
    embedding ARRAY<DOUBLE> NOT NULL,
    text_for_embedding STRING NOT NULL,
    model_name STRING NOT NULL,
    embedded_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Unified Evidence Objects (UEO): formal evidence container
spark.sql("""
CREATE TABLE IF NOT EXISTS unified_evidence_objects (
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_type STRING,
    entity_name STRING,
    window_start TIMESTAMP NOT NULL,
    window_end TIMESTAMP NOT NULL,
    fused_risk_score DOUBLE NOT NULL,
    max_signal_score DOUBLE,
    signal_count INT NOT NULL,
    independent_signal_count INT NOT NULL,
    has_cep BOOLEAN DEFAULT false,
    has_cet BOOLEAN DEFAULT false,
    has_graph BOOLEAN DEFAULT false,
    has_negative_correlation BOOLEAN DEFAULT false,
    has_ks_recall BOOLEAN DEFAULT false,
    has_model_score BOOLEAN DEFAULT false,
    has_behavioral BOOLEAN DEFAULT false,
    disagreement_score DOUBLE DEFAULT 0.0,
    min_signal_score DOUBLE,
    score_variance DOUBLE DEFAULT 0.0,
    causal_chain ARRAY<STRING>,
    kill_chain_stage STRING,
    ks_similar_incidents INT DEFAULT 0,
    ks_prior_suppressions INT DEFAULT 0,
    ks_best_match_id STRING,
    ks_best_match_similarity DOUBLE,
    entity_centrality DOUBLE DEFAULT 0.0,
    entity_is_high_value BOOLEAN DEFAULT false,
    entity_is_service_account BOOLEAN DEFAULT false,
    contributing_event_ids ARRAY<STRING>,
    contributing_alert_ids ARRAY<STRING>,
    confluence_processed BOOLEAN DEFAULT false,
    confluence_verdict_id STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS ueo_signals (
    signal_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    signal_class STRING NOT NULL,
    signal_source STRING NOT NULL,
    raw_score DOUBLE NOT NULL,
    decayed_score DOUBLE NOT NULL,
    independence_weight DOUBLE DEFAULT 1.0,
    signal_timestamp TIMESTAMP NOT NULL,
    decay_age_minutes DOUBLE,
    source_event_ids ARRAY<STRING>,
    source_alert_id STRING,
    explanation STRING,
    metadata STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print("Phase 1 tables created: Entity Spine (3), Knowledge Store (2), UEO (2)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 2: CET Drift, Bytecode Analysis, Delta Replay Tables

# COMMAND ----------

# CET Per-Entity Drift
spark.sql("""
CREATE TABLE IF NOT EXISTS entity_drift_scores (
    drift_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_type STRING,
    entity_name STRING,
    rate_drift DOUBLE DEFAULT 0.0,
    diversity_drift DOUBLE DEFAULT 0.0,
    temporal_drift DOUBLE DEFAULT 0.0,
    centrality_drift DOUBLE DEFAULT 0.0,
    pivot_potential DOUBLE DEFAULT 0.0,
    destination_novelty DOUBLE DEFAULT 0.0,
    composite_drift_score DOUBLE NOT NULL,
    drift_rank INT,
    baseline_event_count BIGINT,
    recent_event_count BIGINT,
    baseline_unique_dests INT,
    recent_unique_dests INT,
    new_destinations ARRAY<STRING>,
    trajectory STRING,
    days_trending INT DEFAULT 1,
    is_signal_emitted BOOLEAN DEFAULT false,
    signal_emitted_at TIMESTAMP,
    scored_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS entity_drift_history (
    entity_id STRING NOT NULL,
    scored_at TIMESTAMP NOT NULL,
    composite_drift_score DOUBLE NOT NULL,
    rate_drift DOUBLE,
    diversity_drift DOUBLE,
    temporal_drift DOUBLE,
    centrality_drift DOUBLE,
    pivot_potential DOUBLE,
    destination_novelty DOUBLE,
    trajectory STRING
)
USING DELTA
PARTITIONED BY (scored_at)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Bytecode / Semantics Analysis
spark.sql("""
CREATE TABLE IF NOT EXISTS bytecode_analysis (
    analysis_id STRING NOT NULL,
    artifact_id STRING,
    event_id STRING,
    hostname STRING,
    process_name STRING,
    process_path STRING,
    user_id STRING,
    service_name STRING,
    file_hash_sha256 STRING,
    file_name STRING,
    file_size BIGINT,
    is_signed BOOLEAN DEFAULT false,
    signer STRING,
    behavioral_score DOUBLE NOT NULL,
    category STRING NOT NULL,
    verdict STRING NOT NULL,
    reflective_loading_score DOUBLE DEFAULT 0.0,
    encryption_anomaly_score DOUBLE DEFAULT 0.0,
    serialization_score DOUBLE DEFAULT 0.0,
    network_primitive_score DOUBLE DEFAULT 0.0,
    persistence_score DOUBLE DEFAULT 0.0,
    privilege_escalation_score DOUBLE DEFAULT 0.0,
    evasion_score DOUBLE DEFAULT 0.0,
    data_access_score DOUBLE DEFAULT 0.0,
    injection_score DOUBLE DEFAULT 0.0,
    matched_patterns ARRAY<STRING>,
    api_sequence_anomalies ARRAY<STRING>,
    deviation_from_baseline DOUBLE DEFAULT 0.0,
    baseline_exists BOOLEAN DEFAULT false,
    mitre_techniques ARRAY<STRING>,
    entity_id STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS code_behavioral_features (
    feature_id STRING NOT NULL,
    event_id STRING NOT NULL,
    hostname STRING,
    process_name STRING,
    api_calls ARRAY<STRING>,
    api_call_count INT,
    unique_apis INT,
    syscalls ARRAY<STRING>,
    loaded_libraries ARRAY<STRING>,
    network_calls INT DEFAULT 0,
    file_operations INT DEFAULT 0,
    registry_operations INT DEFAULT 0,
    crypto_operations INT DEFAULT 0,
    process_operations INT DEFAULT 0,
    memory_operations INT DEFAULT 0,
    entropy_score DOUBLE DEFAULT 0.0,
    api_diversity_ratio DOUBLE DEFAULT 0.0,
    suspicious_api_ratio DOUBLE DEFAULT 0.0,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS code_behavioral_baselines (
    baseline_id STRING NOT NULL,
    service_name STRING NOT NULL,
    hostname STRING,
    expected_apis ARRAY<STRING>,
    expected_api_count_avg DOUBLE,
    expected_api_count_stddev DOUBLE,
    expected_network_calls_avg DOUBLE,
    expected_file_ops_avg DOUBLE,
    expected_entropy_avg DOUBLE,
    api_count_upper_bound DOUBLE,
    network_upper_bound DOUBLE,
    entropy_upper_bound DOUBLE,
    sample_count BIGINT,
    last_updated TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# Delta Replay Engine
spark.sql("""
CREATE TABLE IF NOT EXISTS replay_packs (
    pack_id STRING NOT NULL,
    mode STRING NOT NULL,
    replay_start TIMESTAMP NOT NULL,
    replay_end TIMESTAMP NOT NULL,
    target_timestamp TIMESTAMP,
    entity_id STRING,
    entity_name STRING,
    rule_id STRING,
    case_id STRING,
    event_count BIGINT DEFAULT 0,
    alert_count INT DEFAULT 0,
    entity_count INT DEFAULT 0,
    ueo_count INT DEFAULT 0,
    edge_count INT DEFAULT 0,
    ks_entries_count INT DEFAULT 0,
    events_version BIGINT,
    alerts_version BIGINT,
    spine_version BIGINT,
    ueo_version BIGINT,
    findings STRING,
    timeline_summary STRING,
    initiated_by STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS detection_evaluations (
    eval_id STRING NOT NULL,
    pack_id STRING,
    rule_id STRING NOT NULL,
    rule_name STRING,
    total_events_tested BIGINT,
    would_have_fired INT DEFAULT 0,
    actually_fired INT DEFAULT 0,
    true_positives INT DEFAULT 0,
    false_positives INT DEFAULT 0,
    false_negatives INT DEFAULT 0,
    true_negatives INT DEFAULT 0,
    precision DOUBLE,
    recall DOUBLE,
    f1_score DOUBLE,
    original_threshold DOUBLE,
    tested_threshold DOUBLE,
    predicted_daily_alerts INT,
    predicted_fp_rate DOUBLE,
    evaluation_window_hours INT,
    evaluated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS learning_data (
    sample_id STRING NOT NULL,
    pack_id STRING,
    event_ids ARRAY<STRING>,
    alert_id STRING,
    ueo_id STRING,
    entity_id STRING,
    feature_snapshot STRING,
    confluence_score DOUBLE,
    signal_classes ARRAY<STRING>,
    label STRING NOT NULL,
    label_source STRING,
    analyst_id STRING,
    label_confidence DOUBLE DEFAULT 1.0,
    mitre_technique STRING,
    severity STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print("Phase 2 tables created: CET Drift (2), Bytecode (3), Delta Replay (3)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 3: Fuse Engine, Model Disagreement, KS Recall Lens

# COMMAND ----------

# Fuse Engine output (Dempster-Shafer combined evidence)
spark.sql("""
CREATE TABLE IF NOT EXISTS fuse_results (
    fuse_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_name STRING,
    belief_threat DOUBLE NOT NULL,
    belief_benign DOUBLE NOT NULL,
    plausibility_threat DOUBLE NOT NULL,
    uncertainty_mass DOUBLE NOT NULL,
    conflict_mass DOUBLE NOT NULL,
    ds_combined_score DOUBLE NOT NULL,
    independence_weighted_score DOUBLE NOT NULL,
    total_signals INT NOT NULL,
    independent_signals INT NOT NULL,
    independence_groups INT NOT NULL,
    causal_chain_length INT DEFAULT 0,
    causal_chain_events ARRAY<STRING>,
    kill_chain_progression STRING,
    temporal_span_minutes DOUBLE DEFAULT 0.0,
    avg_signal_age_minutes DOUBLE,
    freshness_factor DOUBLE DEFAULT 1.0,
    has_disagreement BOOLEAN DEFAULT false,
    disagreement_type STRING,
    disagreeing_lenses ARRAY<STRING>,
    entity_centrality DOUBLE DEFAULT 0.0,
    entity_is_high_value BOOLEAN DEFAULT false,
    confluence_consumed BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

# Model Disagreement routing table
spark.sql("""
CREATE TABLE IF NOT EXISTS model_disagreements (
    disagreement_id STRING NOT NULL,
    fuse_id STRING NOT NULL,
    ueo_id STRING NOT NULL,
    entity_id STRING NOT NULL,
    entity_name STRING,
    disagreement_type STRING NOT NULL,
    high_signal_class STRING,
    high_signal_score DOUBLE,
    low_signal_class STRING,
    low_signal_score DOUBLE,
    score_gap DOUBLE NOT NULL,
    conflict_mass DOUBLE NOT NULL,
    entity_is_high_value BOOLEAN DEFAULT false,
    asset_criticality STRING,
    explanation STRING,
    routed_to STRING DEFAULT 'investigation_queue',
    priority STRING DEFAULT 'P2',
    resolved BOOLEAN DEFAULT false,
    resolution STRING,
    resolved_by STRING,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# KS Recall Lens output
spark.sql("""
CREATE TABLE IF NOT EXISTS ks_recall_signals (
    recall_id STRING NOT NULL,
    alert_id STRING,
    event_id STRING,
    entity_id STRING,
    ks_entry_id STRING NOT NULL,
    ks_entry_type STRING NOT NULL,
    ks_title STRING,
    similarity_score DOUBLE NOT NULL,
    recall_signal_score DOUBLE NOT NULL,
    signal_direction STRING NOT NULL,
    ks_outcome STRING,
    ks_severity STRING,
    ks_mitre_techniques ARRAY<STRING>,
    explanation STRING,
    emitted_as_signal BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print("Phase 3 tables created: Fuse Engine (1), Model Disagreement (1), KS Recall (1)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 4: Typed Bronze, MUSE, GUARDIAN, Edge Collector

# COMMAND ----------

# Typed Bronze quarantine and metrics
spark.sql("""
CREATE TABLE IF NOT EXISTS typed_bronze_quarantine (
    quarantine_id STRING NOT NULL,
    original_event_id STRING,
    source_type STRING NOT NULL,
    source_connector STRING,
    failure_reason STRING NOT NULL,
    failed_fields ARRAY<STRING>,
    raw_data STRING,
    quarantined_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (source_type)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS typed_bronze_metrics (
    metric_id STRING NOT NULL,
    source_type STRING NOT NULL,
    batch_timestamp TIMESTAMP NOT NULL,
    events_received BIGINT DEFAULT 0,
    events_typed BIGINT DEFAULT 0,
    events_quarantined BIGINT DEFAULT 0,
    quarantine_rate DOUBLE DEFAULT 0.0,
    avg_parse_latency_ms DOUBLE DEFAULT 0.0,
    schema_version STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# MUSE Learning Agent
spark.sql("""
CREATE TABLE IF NOT EXISTS tuning_proposals (
    proposal_id STRING NOT NULL,
    proposal_type STRING NOT NULL,
    target_rule_id STRING,
    target_lens STRING,
    target_entity STRING,
    current_value STRING,
    current_precision DOUBLE,
    current_fp_rate DOUBLE,
    proposed_value STRING,
    proposed_action STRING NOT NULL,
    supporting_samples INT NOT NULL,
    tp_count INT DEFAULT 0,
    fp_count INT DEFAULT 0,
    confidence DOUBLE NOT NULL,
    rationale STRING NOT NULL,
    sample_ids ARRAY<STRING>,
    status STRING DEFAULT 'pending',
    approved_by STRING,
    approved_at TIMESTAMP,
    applied BOOLEAN DEFAULT false,
    applied_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS lens_weight_proposals (
    proposal_id STRING NOT NULL,
    current_weights STRING NOT NULL,
    proposed_weights STRING NOT NULL,
    evaluation_window_hours INT,
    tp_contribution MAP<STRING, DOUBLE>,
    fp_contribution MAP<STRING, DOUBLE>,
    expected_precision_change DOUBLE,
    expected_recall_change DOUBLE,
    confidence DOUBLE NOT NULL,
    rationale STRING NOT NULL,
    status STRING DEFAULT 'pending',
    approved_by STRING,
    applied BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS muse_learning_metrics (
    metric_id STRING NOT NULL,
    run_timestamp TIMESTAMP NOT NULL,
    total_feedback INT,
    tp_feedback INT,
    fp_feedback INT,
    fn_feedback INT,
    suppression_proposals INT DEFAULT 0,
    threshold_proposals INT DEFAULT 0,
    weight_proposals INT DEFAULT 0,
    pattern_proposals INT DEFAULT 0,
    ks_entries_created INT DEFAULT 0,
    overall_precision DOUBLE,
    overall_recall DOUBLE,
    overall_f1 DOUBLE,
    lens_quality MAP<STRING, DOUBLE>,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

# GUARDIAN Compliance Agent
spark.sql("""
CREATE TABLE IF NOT EXISTS compliance_posture (
    posture_id STRING NOT NULL,
    assessed_at TIMESTAMP NOT NULL,
    overall_score DOUBLE NOT NULL,
    data_freshness_score DOUBLE DEFAULT 100.0,
    detection_coverage_score DOUBLE DEFAULT 100.0,
    entity_health_score DOUBLE DEFAULT 100.0,
    ks_quality_score DOUBLE DEFAULT 100.0,
    pipeline_latency_score DOUBLE DEFAULT 100.0,
    rule_drift_score DOUBLE DEFAULT 100.0,
    audit_integrity_score DOUBLE DEFAULT 100.0,
    retention_score DOUBLE DEFAULT 100.0,
    active_violations INT DEFAULT 0,
    total_checks INT DEFAULT 0,
    passed_checks INT DEFAULT 0,
    soc2_status STRING DEFAULT 'compliant',
    nist_detect_score DOUBLE DEFAULT 100.0,
    nist_respond_score DOUBLE DEFAULT 100.0,
    score_change_24h DOUBLE DEFAULT 0.0,
    degrading_dimensions ARRAY<STRING>
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS compliance_violations (
    violation_id STRING NOT NULL,
    dimension STRING NOT NULL,
    severity STRING NOT NULL,
    title STRING NOT NULL,
    description STRING NOT NULL,
    current_value STRING,
    threshold_value STRING,
    affected_tables ARRAY<STRING>,
    affected_pipelines ARRAY<STRING>,
    compliance_framework STRING,
    auto_remediation_available BOOLEAN DEFAULT false,
    remediation_suggestion STRING,
    status STRING DEFAULT 'open',
    acknowledged_by STRING,
    resolved_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS sla_breaches (
    id STRING NOT NULL,
    alert_id STRING NOT NULL,
    severity STRING NOT NULL,
    breach_type STRING NOT NULL,
    sla_ack_minutes INT,
    sla_resolve_minutes INT,
    alert_created_at TIMESTAMP,
    detected_at TIMESTAMP DEFAULT current_timestamp(),
    escalation_status STRING DEFAULT 'new'
)
USING DELTA
PARTITIONED BY (severity)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS sla_metrics (
    metric_id STRING NOT NULL,
    measured_at TIMESTAMP NOT NULL,
    metric_name STRING NOT NULL,
    metric_value DOUBLE NOT NULL,
    sla_target DOUBLE NOT NULL,
    is_within_sla BOOLEAN NOT NULL,
    dimension STRING,
    details STRING
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

# Edge Collector Framework
spark.sql("""
CREATE TABLE IF NOT EXISTS edge_collector_registry (
    collector_id STRING NOT NULL,
    collector_name STRING NOT NULL,
    collector_type STRING NOT NULL,
    site_name STRING,
    region STRING,
    environment STRING,
    network_zone STRING,
    transport_protocol STRING NOT NULL,
    supported_sources ARRAY<STRING>,
    max_eps INT DEFAULT 10000,
    compression STRING DEFAULT 'zstd',
    mtls_cert_fingerprint STRING,
    mtls_cert_expires TIMESTAMP,
    api_key_hash STRING,
    status STRING DEFAULT 'registered',
    version STRING,
    config_version INT DEFAULT 1,
    last_heartbeat TIMESTAMP,
    last_config_sync TIMESTAMP,
    events_forwarded_total BIGINT DEFAULT 0,
    events_forwarded_24h BIGINT DEFAULT 0,
    registered_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'true',
    'delta.autoOptimize.optimizeWrite' = 'true'
)
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS edge_collector_heartbeats (
    heartbeat_id STRING NOT NULL,
    collector_id STRING NOT NULL,
    received_at TIMESTAMP NOT NULL,
    cpu_percent DOUBLE,
    memory_percent DOUBLE,
    disk_percent DOUBLE,
    queue_depth BIGINT DEFAULT 0,
    events_per_second DOUBLE DEFAULT 0.0,
    bytes_per_second DOUBLE DEFAULT 0.0,
    latency_ms DOUBLE,
    dropped_events BIGINT DEFAULT 0,
    retry_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    last_error STRING,
    agent_version STRING,
    config_version INT
)
USING DELTA
PARTITIONED BY (collector_id)
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS edge_collector_configs (
    config_id STRING NOT NULL,
    collector_id STRING,
    config_scope STRING NOT NULL,
    filter_rules STRING,
    sampling_rate DOUBLE DEFAULT 1.0,
    batch_size INT DEFAULT 1000,
    batch_interval_ms INT DEFAULT 5000,
    buffer_max_bytes BIGINT DEFAULT 104857600,
    compression STRING DEFAULT 'zstd',
    source_includes ARRAY<STRING>,
    source_excludes ARRAY<STRING>,
    max_eps INT DEFAULT 10000,
    throttle_on_backpressure BOOLEAN DEFAULT true,
    version INT NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS edge_collector_incidents (
    incident_id STRING NOT NULL,
    collector_id STRING NOT NULL,
    incident_type STRING NOT NULL,
    severity STRING NOT NULL,
    title STRING NOT NULL,
    description STRING,
    events_at_risk BIGINT DEFAULT 0,
    data_loss_estimated BOOLEAN DEFAULT false,
    auto_resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP,
    resolution STRING,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print("Phase 4 tables created: Typed Bronze (2), MUSE (3), GUARDIAN (3), Edge Collector (4)")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Phase 5: Missing Pipeline Tables
# MAGIC Tables referenced by ML training, analytics, and correlation notebooks that need
# MAGIC to exist before pipelines run.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS enriched_security_events (
    id STRING DEFAULT uuid(),
    event_id STRING NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    event_type STRING NOT NULL,
    source STRING,
    user_id STRING,
    username STRING,
    source_ip STRING,
    dest_ip STRING,
    hostname STRING,
    action STRING,
    outcome STRING,
    severity STRING DEFAULT 'low',
    confidence DOUBLE DEFAULT 0.5,
    geo_country STRING,
    geo_city STRING,
    asn STRING,
    asn_org STRING,
    ip_reputation_score DOUBLE DEFAULT 0.0,
    threat_intel_match BOOLEAN DEFAULT false,
    matched_iocs ARRAY<STRING>,
    mitre_techniques ARRAY<STRING>,
    user_risk_score DOUBLE DEFAULT 0.0,
    asset_criticality STRING DEFAULT 'medium',
    enrichment_sources ARRAY<STRING>,
    raw_event STRING,
    enriched_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (event_type, DATE(timestamp))
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS user_sessions (
    id STRING DEFAULT uuid(),
    session_id STRING NOT NULL,
    user_id STRING NOT NULL,
    username STRING,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    source_ip STRING,
    device_fingerprint STRING,
    device_type STRING,
    os STRING,
    browser STRING,
    geo_country STRING,
    geo_city STRING,
    events_count BIGINT DEFAULT 0,
    bytes_transferred BIGINT DEFAULT 0,
    risk_score DOUBLE DEFAULT 0.0,
    anomaly_flags ARRAY<STRING>,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(start_time))
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS correlation_baselines (
    id STRING DEFAULT uuid(),
    rule_id STRING NOT NULL,
    baseline_key STRING NOT NULL,
    metric_name STRING NOT NULL,
    metric_value DOUBLE NOT NULL,
    sample_count BIGINT DEFAULT 0,
    mean DOUBLE DEFAULT 0.0,
    stddev DOUBLE DEFAULT 0.0,
    p95 DOUBLE DEFAULT 0.0,
    p99 DOUBLE DEFAULT 0.0,
    last_updated TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS temporal_baselines (
    id STRING DEFAULT uuid(),
    entity_type STRING NOT NULL,
    entity_id STRING NOT NULL,
    metric_name STRING NOT NULL,
    hour_of_day INT,
    day_of_week INT,
    mean DOUBLE DEFAULT 0.0,
    stddev DOUBLE DEFAULT 0.0,
    p95 DOUBLE DEFAULT 0.0,
    sample_count BIGINT DEFAULT 0,
    last_updated TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS threat_intel_matches (
    id STRING DEFAULT uuid(),
    event_id STRING NOT NULL,
    ioc_id STRING NOT NULL,
    ioc_type STRING NOT NULL,
    ioc_value STRING NOT NULL,
    feed_name STRING,
    confidence DOUBLE DEFAULT 0.0,
    severity STRING DEFAULT 'medium',
    matched_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS trend_graph_nodes (
    id STRING DEFAULT uuid(),
    node_type STRING NOT NULL,
    node_id STRING NOT NULL,
    label STRING,
    properties STRING,
    score DOUBLE DEFAULT 0.0,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    last_seen TIMESTAMP DEFAULT current_timestamp(),
    event_count BIGINT DEFAULT 0
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS trend_graph_edges (
    id STRING DEFAULT uuid(),
    source_node_id STRING NOT NULL,
    target_node_id STRING NOT NULL,
    edge_type STRING NOT NULL,
    weight DOUBLE DEFAULT 1.0,
    properties STRING,
    first_seen TIMESTAMP DEFAULT current_timestamp(),
    last_seen TIMESTAMP DEFAULT current_timestamp(),
    event_count BIGINT DEFAULT 0
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS trend_runtime_metrics (
    id STRING DEFAULT uuid(),
    metric_name STRING NOT NULL,
    metric_value DOUBLE NOT NULL,
    dimension STRING,
    dimension_value STRING,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
PARTITIONED BY (DATE(timestamp))
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS investigations (
    id STRING DEFAULT uuid(),
    case_id STRING,
    alert_id STRING,
    title STRING NOT NULL,
    description STRING,
    status STRING DEFAULT 'open',
    priority STRING DEFAULT 'medium',
    assigned_to STRING,
    findings STRING,
    mitre_techniques ARRAY<STRING>,
    affected_assets ARRAY<STRING>,
    timeline STRING,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    updated_at TIMESTAMP DEFAULT current_timestamp(),
    closed_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS correlation_matches (
    id STRING DEFAULT uuid(),
    rule_id STRING NOT NULL,
    rule_name STRING,
    matched_events ARRAY<STRING>,
    matched_at TIMESTAMP DEFAULT current_timestamp(),
    confidence DOUBLE DEFAULT 0.0,
    severity STRING DEFAULT 'medium',
    entity_type STRING,
    entity_id STRING,
    context STRING,
    promoted_to_alert BOOLEAN DEFAULT false,
    alert_id STRING
)
USING DELTA
PARTITIONED BY (DATE(matched_at))
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS user_profiles (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    username STRING,
    email STRING,
    department STRING,
    title STRING,
    manager STRING,
    location STRING,
    hire_date DATE,
    risk_score DOUBLE DEFAULT 0.0,
    risk_level STRING DEFAULT 'low',
    peer_group STRING,
    access_level STRING DEFAULT 'standard',
    last_activity TIMESTAMP,
    baseline_json STRING,
    anomaly_count_30d BIGINT DEFAULT 0,
    is_privileged BOOLEAN DEFAULT false,
    is_on_notice BOOLEAN DEFAULT false,
    updated_at TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS health_alerts (
    id STRING DEFAULT uuid(),
    component STRING NOT NULL,
    alert_type STRING NOT NULL,
    severity STRING DEFAULT 'warning',
    message STRING NOT NULL,
    details STRING,
    acknowledged BOOLEAN DEFAULT false,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT current_timestamp(),
    resolved_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS code_runtime_events (
    id STRING DEFAULT uuid(),
    user_id STRING NOT NULL,
    repo_name STRING,
    file_path STRING,
    action STRING NOT NULL,
    language STRING,
    lines_changed INT DEFAULT 0,
    secrets_detected BOOLEAN DEFAULT false,
    code_quality_score DOUBLE,
    timestamp TIMESTAMP DEFAULT current_timestamp()
)
USING DELTA
TBLPROPERTIES ('delta.autoOptimize.optimizeWrite' = 'true')
""")

print("Phase 5 tables created: enriched_security_events, user_sessions, correlation_baselines,")
print("  temporal_baselines, threat_intel_matches, trend_graph_nodes/edges, trend_runtime_metrics,")
print("  investigations, correlation_matches, user_profiles, health_alerts, code_runtime_events")

# COMMAND ----------

# MAGIC %md
# MAGIC ## System Audit Log

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS system_audit_log (
    id STRING DEFAULT uuid(),
    user_email STRING NOT NULL,
    username STRING NOT NULL,
    operation STRING NOT NULL,
    table_name STRING NOT NULL,
    detail STRING,
    timestamp TIMESTAMP DEFAULT current_timestamp(),
    ts STRING
) TBLPROPERTIES (
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
)
""")
print("Created: system_audit_log")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup Complete
# MAGIC All tables have been created in Unity Catalog.

# COMMAND ----------

tables = spark.sql(f"SHOW TABLES IN `{catalog}`.`{schema}`").collect()
print(f"\nTotal tables created: {len(tables)}")
print("\nAll tables:")
for t in sorted(tables, key=lambda x: x.tableName):
    print(f"  - {t.tableName}")
