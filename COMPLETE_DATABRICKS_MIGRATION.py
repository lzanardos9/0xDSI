# Databricks notebook source

# COMMAND ----------

# MAGIC %md
# MAGIC # Dazzle SOC Platform -- Complete Databricks Setup
# MAGIC ## Self-Contained Production-Ready Infrastructure
# MAGIC - 202 Delta Lake tables across 17 domain schemas
# MAGIC - Unity Catalog: `soc_platform`
# MAGIC - Embedded PySpark mock data generators for all tables
# MAGIC - Zero external dependencies -- runs standalone on any Databricks workspace
# MAGIC - Estimated runtime: 15-25 minutes

# COMMAND ----------

CATALOG = "soc_platform"
SCHEMAS = [
    "core_siem", "threat_intel", "threat_modeling", "user_analytics",
    "incident_response", "compliance", "malware_sandbox", "red_team",
    "network_security", "ai_agents", "correlation_engine", "data_connectors",
    "llm_security", "search_infra", "platform_config", "ocsf", "internal_services"
]

# COMMAND ----------

spark.sql("CREATE CATALOG IF NOT EXISTS soc_platform")
spark.sql("USE CATALOG soc_platform")
for schema in SCHEMAS:
    spark.sql(f"CREATE SCHEMA IF NOT EXISTS soc_platform.{schema}")
print(f"Catalog '{CATALOG}' ready with {len(SCHEMAS)} schemas")

# COMMAND ----------

import uuid, random, json
from datetime import datetime, timedelta
from pyspark.sql import Row
from pyspark.sql.types import *

def uid():
    return str(uuid.uuid4())

def ts(days_back=90):
    return datetime.now() - timedelta(days=random.uniform(0, days_back), hours=random.uniform(0, 24))

def rip():
    return f"{random.choice(['10','172','192'])}.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"

def rsev():
    return random.choice(["critical", "high", "medium", "low", "info"])

def ruser():
    return random.choice(["admin", "jsmith", "mwilliams", "analyst1", "soc_lead", "threat_hunter", "lz_admin"])

def rhost():
    return random.choice(["ws-prod-01", "dc-core-01", "fw-edge-01", "db-primary", "app-web-03", "mail-gw-01", "vpn-hub-01"])

def rtactic():
    return random.choice(["Initial Access", "Execution", "Persistence", "Privilege Escalation", "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement", "Collection", "Exfiltration", "Command and Control", "Impact"])

def rtechnique():
    return random.choice(["T1566.001", "T1059.001", "T1547.001", "T1548.002", "T1070.004", "T1110.001", "T1082", "T1021.001", "T1005", "T1048.003", "T1071.001", "T1486"])

def rjson(keys=None):
    if keys is None:
        keys = ["key1", "key2"]
    return json.dumps({k: f"val_{random.randint(1,100)}" for k in keys})

def write_rows(table, rows):
    if rows:
        df = spark.createDataFrame(rows)
        df.write.mode("append").saveAsTable(table)
        print(f"  {table}: {len(rows)} rows")

# MAGIC %md
# MAGIC ## Schema 1: core_siem (8 tables)
# MAGIC Core SIEM tables for events, alerts, cases, and sessions.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.alerts (
  id STRING NOT NULL,
  alert_id STRING NOT NULL,
  title STRING NOT NULL,
  description STRING,
  severity STRING NOT NULL,
  status STRING NOT NULL,
  alert_type STRING NOT NULL,
  source STRING NOT NULL,
  source_ip STRING,
  dest_ip STRING,
  user_id STRING,
  hostname STRING,
  rule_id STRING,
  rule_name STRING,
  mitre_tactic STRING,
  mitre_technique STRING,
  confidence_score INT,
  false_positive BOOLEAN,
  assigned_to STRING,
  case_id STRING,
  related_event_ids STRING COMMENT 'JSON data',
  metadata STRING COMMENT 'JSON data',
  tags STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  acknowledged_at TIMESTAMP,
  resolved_at TIMESTAMP,
  ocsf_class_uid INT,
  ocsf_class_name STRING,
  ocsf_finding STRING COMMENT 'JSON data'
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.case_comments (
  id STRING NOT NULL,
  case_id STRING NOT NULL,
  author STRING NOT NULL,
  comment STRING NOT NULL,
  is_internal BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.case_timeline (
  id STRING NOT NULL,
  case_id STRING NOT NULL,
  event_type STRING NOT NULL,
  description STRING NOT NULL,
  actor STRING NOT NULL,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.cases (
  id STRING NOT NULL,
  case_number STRING NOT NULL,
  title STRING NOT NULL,
  description STRING,
  status STRING NOT NULL,
  priority STRING NOT NULL,
  severity STRING NOT NULL,
  category STRING NOT NULL,
  assigned_to STRING,
  created_by STRING NOT NULL,
  resolution STRING,
  related_event_ids STRING COMMENT 'JSON data',
  related_alert_ids STRING COMMENT 'JSON data',
  tags STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  resolved_at TIMESTAMP,
  closed_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.events (
  id STRING NOT NULL,
  event_type STRING NOT NULL,
  severity STRING NOT NULL,
  source STRING NOT NULL,
  source_ip STRING,
  dest_ip STRING,
  source_port INT,
  dest_port INT,
  protocol STRING,
  user_id STRING,
  username STRING,
  hostname STRING,
  process_name STRING,
  command_line STRING,
  description STRING,
  raw_log STRING,
  raw_json STRING COMMENT 'JSON data',
  network_flow STRING COMMENT 'JSON data',
  packet_data STRING,
  tags STRING COMMENT 'JSON data',
  metadata STRING COMMENT 'JSON data',
  iocs STRING COMMENT 'JSON data',
  mitre_tactic STRING,
  mitre_technique STRING,
  alert_id STRING,
  case_id STRING,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  event_timestamp TIMESTAMP,
  created_at TIMESTAMP,
  ocsf_class_uid INT,
  ocsf_class_name STRING,
  ocsf_category_uid INT,
  ocsf_category_name STRING,
  ocsf_severity_id INT,
  ocsf_activity_id INT,
  ocsf_activity_name STRING,
  ocsf_type_uid INT,
  ocsf_normalized STRING COMMENT 'JSON data',
  ocsf_metadata STRING COMMENT 'JSON data',
  event_date DATE GENERATED ALWAYS AS (CAST(created_at AS DATE)) COMMENT 'Partition column derived from created_at'
)
USING DELTA
PARTITIONED BY (event_date)
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.raw_event_buffer (
  id STRING NOT NULL,
  source_id STRING NOT NULL,
  source_type STRING NOT NULL,
  source_ip STRING COMMENT 'IP address',
  raw_data STRING NOT NULL COMMENT 'JSON data',
  raw_text STRING,
  received_at TIMESTAMP,
  processing_status STRING,
  processed_at TIMESTAMP,
  error_message STRING,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.raw_security_events (
  id STRING NOT NULL,
  event_timestamp TIMESTAMP NOT NULL,
  raw_payload STRING NOT NULL COMMENT 'JSON data',
  event_embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  event_summary STRING,
  source_system STRING,
  source_ip STRING,
  destination_ip STRING,
  event_type_detected STRING,
  threat_indicators STRING COMMENT 'JSON data',
  similarity_cluster INT,
  processed BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.core_siem.sessions (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  source_ip STRING NOT NULL,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  event_count INT,
  risk_score DECIMAL(38,10),
  status STRING,
  device_info STRING COMMENT 'JSON data',
  location STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 2: threat_intel (17 tables)
# MAGIC Threat intelligence including IOCs, feeds, dark web intel, STIX indicators, and phishing data.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.cisa_kev_catalog (
  id BIGINT NOT NULL,
  cve_id STRING NOT NULL,
  vulnerability_name STRING,
  date_added TIMESTAMP NOT NULL,
  short_description STRING,
  required_action STRING,
  due_date DATE,
  known_ransomware_use BOOLEAN,
  vendor_project STRING,
  product STRING,
  priority_score INT,
  exploitation_evidence STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.dark_web_corporate_alerts (
  id STRING NOT NULL,
  post_id STRING,
  alert_type STRING NOT NULL,
  alert_content STRING NOT NULL,
  context STRING,
  severity STRING NOT NULL,
  is_confirmed BOOLEAN,
  requires_action BOOLEAN,
  assigned_to STRING,
  status STRING,
  discovered_at TIMESTAMP NOT NULL,
  mitigated_at TIMESTAMP,
  response_notes STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.dark_web_forum_posts (
  id STRING NOT NULL,
  source_id STRING,
  post_type STRING NOT NULL,
  title STRING NOT NULL,
  content STRING,
  threat_level STRING NOT NULL,
  relevance_score DECIMAL(38,10),
  author_username STRING,
  author_reputation DECIMAL(38,10),
  post_url STRING,
  discovered_at TIMESTAMP NOT NULL,
  extracted_iocs STRING COMMENT 'JSON data',
  affected_organizations ARRAY<STRING>,
  estimated_impact_score DECIMAL(38,10),
  verified BOOLEAN,
  tags ARRAY<STRING>,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.dark_web_forum_sources (
  id STRING NOT NULL,
  source_name STRING NOT NULL,
  source_url STRING,
  source_type STRING NOT NULL,
  risk_level STRING NOT NULL,
  is_active BOOLEAN,
  last_scan_time TIMESTAMP,
  scan_frequency_minutes INT,
  requires_authentication BOOLEAN,
  tags ARRAY<STRING>,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.dark_web_intelligence (
  id BIGINT NOT NULL,
  source_platform STRING,
  source_url STRING,
  content_type STRING,
  threat_category STRING,
  content_preview STRING,
  full_content STRING,
  author_handle STRING,
  author_reputation_score INT,
  posted_at TIMESTAMP,
  relevance_score DECIMAL(38,10),
  indicators_extracted STRING COMMENT 'JSON data',
  entities_mentioned ARRAY<STRING>,
  sentiment_score DECIMAL(38,10),
  language_code STRING,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  collected_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.dark_web_threat_marketplace (
  id STRING NOT NULL,
  source_id STRING,
  listing_type STRING NOT NULL,
  title STRING NOT NULL,
  description STRING,
  seller_username STRING NOT NULL,
  seller_reputation DECIMAL(38,10),
  price_usd DECIMAL(38,10),
  currency STRING,
  listing_url STRING,
  target_software STRING,
  target_version STRING,
  effectiveness_rating DECIMAL(38,10),
  sales_count INT,
  is_available BOOLEAN,
  first_seen TIMESTAMP NOT NULL,
  last_seen TIMESTAMP NOT NULL,
  threat_score DECIMAL(38,10),
  related_cves ARRAY<STRING>,
  tags ARRAY<STRING>,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.feed_sync_logs (
  id STRING NOT NULL,
  feed_id STRING,
  sync_status STRING NOT NULL,
  indicators_fetched INT,
  indicators_added INT,
  indicators_updated INT,
  indicators_removed INT,
  error_message STRING,
  sync_duration_ms INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.historical_attacks (
  id BIGINT NOT NULL,
  attack_id STRING,
  incident_date TIMESTAMP,
  attack_type STRING,
  threat_actor_group STRING,
  target_industry STRING,
  target_organization_size STRING,
  initial_access_vector STRING,
  ttps_used ARRAY<STRING>,
  mitre_tactics ARRAY<STRING>,
  mitre_techniques ARRAY<STRING>,
  dwell_time_days INT,
  detection_method STRING,
  impact_severity STRING,
  financial_impact_usd BIGINT,
  data_compromised_records BIGINT,
  systems_affected INT,
  containment_time_hours DECIMAL(38,10),
  eradication_time_hours DECIMAL(38,10),
  recovery_time_hours DECIMAL(38,10),
  remediation_steps STRING COMMENT 'JSON data',
  lessons_learned STRING,
  successful_defenses ARRAY<STRING>,
  failed_defenses ARRAY<STRING>,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.iocs (
  id STRING NOT NULL,
  feed_id STRING,
  indicator STRING NOT NULL,
  indicator_type STRING NOT NULL,
  threat_type STRING,
  severity STRING NOT NULL,
  confidence_score DECIMAL(38,10),
  tags ARRAY<STRING>,
  description STRING,
  context STRING COMMENT 'JSON data',
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  expiration_date TIMESTAMP,
  is_active BOOLEAN,
  match_count INT,
  false_positive_count INT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.osint_sources (
  id BIGINT NOT NULL,
  source_type STRING,
  source_name STRING,
  source_url STRING,
  title STRING,
  content STRING,
  author STRING,
  published_at TIMESTAMP,
  tags ARRAY<STRING>,
  iocs_extracted STRING COMMENT 'JSON data',
  cves_mentioned ARRAY<STRING>,
  threat_actors_mentioned ARRAY<STRING>,
  mitre_techniques ARRAY<STRING>,
  relevance_score DECIMAL(38,10),
  sentiment STRING,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  collected_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.phishing_dataset (
  id BIGINT NOT NULL,
  url STRING NOT NULL,
  url_domain STRING,
  url_length INT,
  has_ip_address BOOLEAN,
  has_at_symbol BOOLEAN,
  url_depth INT,
  redirection_count INT,
  has_https BOOLEAN,
  tld STRING,
  suspicious_keywords ARRAY<STRING>,
  page_title STRING,
  page_content_preview STRING,
  external_links_count INT,
  form_fields_count INT,
  requests_credential BOOLEAN,
  uses_iframe BOOLEAN,
  uses_popup BOOLEAN,
  domain_age_days INT,
  dns_record_present BOOLEAN,
  website_traffic_rank INT,
  page_rank INT,
  google_index BOOLEAN,
  phishing_classification STRING,
  confidence_score DECIMAL(38,10),
  reported_by ARRAY<STRING>,
  screenshot_url STRING,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  detected_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.stix_indicators (
  id BIGINT NOT NULL,
  stix_id STRING NOT NULL,
  stix_version STRING,
  indicator_type STRING,
  pattern STRING,
  pattern_type STRING,
  name STRING,
  description STRING,
  labels ARRAY<STRING>,
  confidence INT,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  kill_chain_phases STRING COMMENT 'JSON data',
  threat_actor_types ARRAY<STRING>,
  sophistication STRING,
  source_feed STRING,
  external_refs STRING COMMENT 'JSON data',
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.threat_actor_attribution (
  id BIGINT NOT NULL,
  attribution_id STRING,
  attack_event_ids ARRAY<BIGINT>,
  attributed_actor_group STRING,
  confidence_score DECIMAL(38,10),
  attribution_method STRING,
  ttps_matched ARRAY<STRING>,
  infrastructure_overlap STRING COMMENT 'JSON data',
  malware_families_used ARRAY<STRING>,
  tools_used ARRAY<STRING>,
  target_industries ARRAY<STRING>,
  geopolitical_indicators STRING COMMENT 'JSON data',
  linguistic_markers ARRAY<STRING>,
  timezone_analysis STRING COMMENT 'JSON data',
  operating_hours STRING COMMENT 'JSON data',
  capability_assessment STRING,
  motivation STRING,
  sophistication_level STRING,
  supporting_evidence STRING COMMENT 'JSON data',
  analyst_notes STRING,
  attributed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.threat_campaigns (
  id STRING NOT NULL,
  campaign_name STRING NOT NULL,
  campaign_type STRING,
  threat_actor STRING,
  sequence_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  is_active BOOLEAN,
  severity STRING NOT NULL,
  confidence DECIMAL(38,10),
  iocs STRING COMMENT 'JSON data',
  ttps STRING COMMENT 'JSON data',
  graph_signature STRING COMMENT 'JSON data',
  status STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.threat_feeds (
  id STRING NOT NULL,
  feed_name STRING NOT NULL,
  feed_source STRING NOT NULL,
  feed_url STRING,
  feed_type STRING NOT NULL,
  enabled BOOLEAN,
  auto_sync BOOLEAN,
  sync_interval_hours INT,
  last_sync_at TIMESTAMP,
  last_sync_status STRING,
  total_indicators INT,
  description STRING,
  metadata STRING COMMENT 'JSON data',
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  ocsf_threat_category STRING,
  ocsf_class_uid INT,
  ocsf_enrichment STRING COMMENT 'JSON data'
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.threat_intelligence_sources (
  id STRING NOT NULL,
  source_name STRING NOT NULL,
  source_type STRING NOT NULL,
  threat_severity INT,
  indicator_value STRING NOT NULL,
  indicator_type STRING NOT NULL,
  threat_category STRING,
  confidence_score DECIMAL(38,10),
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  tags STRING COMMENT 'JSON data',
  metadata STRING COMMENT 'JSON data',
  expires_at TIMESTAMP,
  is_active BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_intel.zero_day_candidates (
  id BIGINT NOT NULL,
  candidate_id STRING,
  detection_method STRING,
  anomaly_type STRING,
  affected_system STRING,
  affected_process STRING,
  anomalous_behavior STRING,
  baseline_deviation_score DECIMAL(38,10),
  behavioral_indicators STRING COMMENT 'JSON data',
  network_indicators STRING COMMENT 'JSON data',
  file_indicators STRING COMMENT 'JSON data',
  process_indicators STRING COMMENT 'JSON data',
  similarity_to_known_exploits DECIMAL(38,10),
  exploit_likelihood DECIMAL(38,10),
  potential_cve_match STRING,
  requires_investigation BOOLEAN,
  analyst_notes STRING,
  verified_zero_day BOOLEAN,
  reported_to_vendor BOOLEAN,
  detected_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 3: threat_modeling (8 tables)
# MAGIC Threat modeling including models, scenarios, escalation rules, and predictive models.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.escalation_rules (
  id STRING NOT NULL,
  rule_name STRING NOT NULL,
  description STRING,
  priority_threshold DECIMAL(38,10),
  conditions STRING COMMENT 'JSON data',
  actions STRING COMMENT 'JSON data',
  notification_targets STRING COMMENT 'JSON data',
  auto_escalate BOOLEAN,
  enabled BOOLEAN,
  trigger_count INT,
  last_triggered_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.event_priority_calculations (
  id STRING NOT NULL,
  event_id STRING NOT NULL,
  formula_id STRING,
  initial_severity STRING NOT NULL,
  severity_score DECIMAL(38,10),
  model_confidence DECIMAL(38,10),
  relevance_score DECIMAL(38,10),
  mcr_factor DECIMAL(38,10),
  threat_weight DECIMAL(38,10),
  asset_criticality DECIMAL(38,10),
  final_priority DECIMAL(38,10),
  priority_level STRING,
  calculation_details STRING COMMENT 'JSON data',
  escalated BOOLEAN,
  escalation_reason STRING,
  calculated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.predictive_threat_models (
  id BIGINT NOT NULL,
  prediction_id STRING,
  threat_type STRING,
  prediction_timeframe STRING,
  predicted_probability DECIMAL(38,10),
  prediction_confidence DECIMAL(38,10),
  risk_factors STRING COMMENT 'JSON data',
  leading_indicators STRING COMMENT 'JSON data',
  historical_patterns_matched ARRAY<STRING>,
  environmental_factors STRING COMMENT 'JSON data',
  threat_intelligence_signals STRING COMMENT 'JSON data',
  ml_model_used STRING,
  model_accuracy DECIMAL(38,10),
  recommended_mitigations ARRAY<STRING>,
  priority_level STRING,
  prediction_made_at TIMESTAMP,
  prediction_expires_at TIMESTAMP,
  actual_outcome STRING,
  prediction_correct BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.threat_escalation_formulas (
  id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  formula_version STRING,
  is_active BOOLEAN,
  severity_weight DECIMAL(38,10),
  mcr_weight DECIMAL(38,10),
  threat_weight_multiplier DECIMAL(38,10),
  asset_weight DECIMAL(38,10),
  formula_expression STRING,
  custom_config STRING COMMENT 'JSON data',
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.threat_mitigations (
  id STRING NOT NULL,
  scenario_id STRING,
  mitigation_type STRING,
  control_name STRING NOT NULL,
  description STRING,
  implementation_status STRING,
  effectiveness STRING,
  cost STRING,
  priority INT,
  owner STRING,
  due_date TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.threat_model_sources (
  id STRING NOT NULL,
  threat_model_id STRING,
  source_type STRING,
  source_id STRING,
  confidence DECIMAL(38,10),
  data STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.threat_models (
  id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  model_type STRING NOT NULL,
  auto_generated BOOLEAN,
  confidence_score DECIMAL(38,10),
  assets STRING COMMENT 'JSON data',
  attack_surface STRING COMMENT 'JSON data',
  threat_actors STRING COMMENT 'JSON data',
  attack_vectors STRING COMMENT 'JSON data',
  mitre_tactics ARRAY<STRING>,
  mitre_techniques ARRAY<STRING>,
  severity STRING,
  status STRING,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.threat_modeling.threat_scenarios (
  id STRING NOT NULL,
  threat_model_id STRING,
  scenario_name STRING NOT NULL,
  description STRING,
  threat_type STRING NOT NULL,
  likelihood STRING,
  impact STRING,
  risk_score DECIMAL(38,10),
  attack_chain STRING COMMENT 'JSON data',
  affected_assets ARRAY<STRING>,
  data_flow STRING COMMENT 'JSON data',
  entry_points STRING COMMENT 'JSON data',
  vulnerabilities ARRAY<STRING>,
  indicators ARRAY<STRING>,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 4: user_analytics (18 tables)
# MAGIC User behavior analytics, psychological profiling, and risk assessments.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.auth_attempts (
  id STRING NOT NULL,
  user_id STRING,
  username STRING NOT NULL,
  factor_1_success BOOLEAN,
  factor_2_success BOOLEAN,
  factor_3_success BOOLEAN,
  success BOOLEAN,
  ip_address STRING,
  user_agent STRING,
  attempt_timestamp TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.behavior_correlations (
  id STRING NOT NULL,
  user_profile_id STRING,
  correlation_type STRING NOT NULL,
  physical_event_id STRING,
  logical_event_id STRING,
  correlation_score DECIMAL(38,10),
  description STRING,
  severity STRING,
  detected_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.behavioral_baselines (
  id BIGINT NOT NULL,
  entity_type STRING,
  entity_id STRING,
  baseline_name STRING,
  baseline_period_days INT,
  baseline_metrics STRING COMMENT 'JSON data',
  normal_patterns STRING COMMENT 'JSON data',
  statistical_bounds STRING COMMENT 'JSON data',
  sample_size INT,
  confidence_level DECIMAL(38,10),
  last_updated TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.cross_platform_behavioral_patterns (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  pattern_type STRING NOT NULL,
  pattern_name STRING NOT NULL,
  description STRING NOT NULL,
  severity STRING NOT NULL,
  confidence_level INT,
  evidence_sources STRING COMMENT 'JSON data',
  email_evidence_count INT,
  slack_evidence_count INT,
  teams_evidence_count INT,
  meetings_evidence_count INT,
  llm_evidence_count INT,
  first_observed_at TIMESTAMP NOT NULL,
  last_observed_at TIMESTAMP NOT NULL,
  pattern_duration_days INT,
  trend STRING,
  cross_platform_correlation_score DECIMAL(38,10),
  requires_intervention BOOLEAN,
  flagged_for_hr BOOLEAN,
  flagged_for_security BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.demo_passwords (
  user_profile_id STRING NOT NULL,
  username STRING NOT NULL,
  password_hash STRING NOT NULL,
  plain_password STRING NOT NULL,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.email_behavioral_analysis (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  email_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  is_sent BOOLEAN NOT NULL,
  recipients_count INT,
  subject_line STRING,
  word_count INT,
  sentiment_score DECIMAL(38,10),
  sentiment_label STRING,
  emotional_tone STRING,
  formality_score INT,
  urgency_score INT,
  politeness_score INT,
  contains_apology BOOLEAN,
  contains_blame BOOLEAN,
  contains_excuse BOOLEAN,
  contains_threat BOOLEAN,
  shows_defensiveness BOOLEAN,
  shows_confidence BOOLEAN,
  shows_uncertainty BOOLEAN,
  sent_after_hours BOOLEAN,
  sent_weekend BOOLEAN,
  response_time_minutes INT,
  contains_sensitive_data BOOLEAN,
  forwarded_externally BOOLEAN,
  unusual_recipients BOOLEAN,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.interaction_linguistic_analysis (
  id STRING NOT NULL,
  interaction_id STRING NOT NULL,
  user_id STRING NOT NULL,
  sentiment_score DECIMAL(38,10),
  sentiment_label STRING,
  detected_emotions ARRAY<STRING>,
  dominant_emotion STRING,
  emotional_intensity INT,
  urgency_level INT,
  formality_level INT,
  complexity_level INT,
  shows_deception_markers BOOLEAN,
  shows_manipulation_intent BOOLEAN,
  shows_aggression BOOLEAN,
  shows_desperation BOOLEAN,
  shows_boundary_testing BOOLEAN,
  uses_imperative_language BOOLEAN,
  uses_evasive_language BOOLEAN,
  uses_technical_obfuscation BOOLEAN,
  question_to_statement_ratio DECIMAL(38,10),
  linguistic_risk_score INT,
  detected_red_flags ARRAY<STRING>,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.meeting_behavioral_analysis (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  meeting_id STRING NOT NULL,
  meeting_date TIMESTAMP NOT NULL,
  meeting_duration_minutes INT,
  meeting_type STRING,
  meeting_title STRING,
  attended BOOLEAN,
  arrived_late BOOLEAN,
  left_early BOOLEAN,
  spoke_duration_seconds INT,
  interruptions_count INT,
  speech_pace STRING,
  speech_clarity_score INT,
  confidence_in_speech INT,
  vocal_stress_detected BOOLEAN,
  vocal_emotion STRING,
  sentiment_score DECIMAL(38,10),
  dominated_conversation BOOLEAN,
  passive_participation BOOLEAN,
  supportive_comments BOOLEAN,
  critical_comments BOOLEAN,
  asks_questions BOOLEAN,
  provides_solutions BOOLEAN,
  team_player_score INT,
  leadership_shown BOOLEAN,
  conflict_created BOOLEAN,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.psychological_risk_factors (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  psychological_profile_id STRING,
  factor_type STRING NOT NULL,
  severity STRING NOT NULL,
  factor_name STRING NOT NULL,
  description STRING NOT NULL,
  evidence STRING COMMENT 'JSON data',
  example_interaction_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  confidence_level INT,
  first_detected_at TIMESTAMP,
  last_observed_at TIMESTAMP,
  occurrence_count INT,
  requires_escalation BOOLEAN,
  escalated BOOLEAN,
  escalated_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.slack_behavioral_analysis (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  message_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  channel_type STRING,
  channel_name STRING,
  thread_participation BOOLEAN,
  is_edit BOOLEAN,
  is_delete BOOLEAN,
  message_length INT,
  emoji_count INT,
  mentions_count INT,
  uses_formal_language BOOLEAN,
  uses_casual_language BOOLEAN,
  sentiment_score DECIMAL(38,10),
  dominant_emotion STRING,
  message_frequency_per_hour DECIMAL(38,10),
  rapid_fire_messages BOOLEAN,
  late_night_activity BOOLEAN,
  responds_to_mentions BOOLEAN,
  isolation_score INT,
  engagement_score INT,
  influence_score INT,
  shares_sensitive_info BOOLEAN,
  confrontational_tone BOOLEAN,
  bypasses_channels BOOLEAN,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.teams_behavioral_analysis (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  message_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  channel_name STRING,
  is_private_chat BOOLEAN,
  message_type STRING,
  collaboration_score INT,
  responsiveness_score INT,
  sentiment_score DECIMAL(38,10),
  professional_tone_score INT,
  shares_files_frequently BOOLEAN,
  attends_meetings_regularly BOOLEAN,
  participates_in_discussions BOOLEAN,
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_audit_log (
  id STRING NOT NULL,
  action_type STRING NOT NULL,
  target_user_id STRING,
  performed_by STRING,
  timestamp TIMESTAMP,
  ip_address STRING COMMENT 'IP address',
  user_agent STRING,
  details STRING COMMENT 'JSON data',
  previous_state STRING COMMENT 'JSON data',
  new_state STRING COMMENT 'JSON data',
  success BOOLEAN,
  failure_reason STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_behavior_events (
  id STRING NOT NULL,
  user_profile_id STRING,
  event_type STRING NOT NULL,
  event_category STRING NOT NULL,
  timestamp TIMESTAMP,
  location STRING,
  device STRING,
  ip_address STRING,
  action STRING,
  resource_accessed STRING,
  outcome STRING,
  anomaly_score DECIMAL(38,10),
  details STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true',
  'delta.enableChangeDataFeed' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_clearances (
  id STRING NOT NULL,
  user_profile_id STRING,
  clearance_level STRING NOT NULL,
  granted_by STRING,
  granted_at TIMESTAMP,
  expires_at TIMESTAMP,
  investigation_date TIMESTAMP,
  reinvestigation_due TIMESTAMP,
  compartments ARRAY<STRING>,
  special_access_programs ARRAY<STRING>,
  caveats ARRAY<STRING>,
  justification STRING NOT NULL,
  status STRING,
  revoked_by STRING,
  revoked_at TIMESTAMP,
  revocation_reason STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_profiles (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  full_name STRING NOT NULL,
  email STRING,
  department STRING,
  title STRING,
  clearance_level STRING,
  profile_picture_url STRING,
  risk_score DECIMAL(38,10),
  behavior_baseline STRING COMMENT 'JSON data',
  status STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  username STRING,
  face_encoding STRING,
  movement_pattern STRING,
  is_active BOOLEAN,
  failed_attempts INT,
  last_login TIMESTAMP,
  role STRING,
  security_clearance STRING,
  clearance_compartments ARRAY<STRING>,
  need_to_know_categories ARRAY<STRING>,
  account_status STRING,
  account_approved_by STRING,
  account_approved_at TIMESTAMP,
  max_concurrent_sessions INT,
  session_timeout_minutes INT,
  require_mfa BOOLEAN,
  access_start_time STRING COMMENT 'Time value stored as string',
  access_end_time STRING COMMENT 'Time value stored as string',
  access_days_of_week ARRAY<INT>,
  allowed_ip_ranges ARRAY<STRING> COMMENT 'Array of IP addresses',
  denied_ip_ranges ARRAY<STRING> COMMENT 'Array of IP addresses',
  account_expires_at TIMESTAMP,
  last_password_change TIMESTAMP,
  password_expires_at TIMESTAMP,
  separation_of_duty_groups ARRAY<STRING>,
  prohibited_actions ARRAY<STRING>,
  supervisor_id STRING,
  emergency_contact STRING,
  notes STRING
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_psychological_profiles (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  llm_profile_id STRING,
  openness_score INT,
  conscientiousness_score INT,
  extraversion_score INT,
  agreeableness_score INT,
  neuroticism_score INT,
  narcissism_score INT,
  machiavellianism_score INT,
  psychopathy_score INT,
  insider_threat_score INT,
  manipulation_tendency_score INT,
  impulsivity_score INT,
  aggression_score INT,
  deception_likelihood_score INT,
  stress_level INT,
  burnout_risk INT,
  emotional_stability INT,
  frustration_level INT,
  writing_urgency_level STRING,
  communication_style STRING,
  linguistic_complexity STRING,
  overall_psychological_risk_score INT,
  risk_classification STRING,
  is_potential_insider_threat BOOLEAN,
  is_social_engineering_risk BOOLEAN,
  is_data_theft_risk BOOLEAN,
  shows_sabotage_indicators BOOLEAN,
  shows_espionage_indicators BOOLEAN,
  typical_prompt_length_avg INT,
  uses_technical_jargon BOOLEAN,
  attempts_system_manipulation BOOLEAN,
  shows_boundary_testing BOOLEAN,
  exhibits_urgency_patterns BOOLEAN,
  sentiment_trend STRING,
  dominant_emotion STRING,
  confidence_score INT,
  sample_size INT,
  last_analyzed_at TIMESTAMP,
  profile_updated_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_risk_assessments (
  id STRING NOT NULL,
  user_profile_id STRING,
  assessment_time TIMESTAMP,
  risk_score DECIMAL(38,10),
  risk_level STRING,
  risk_factors STRING COMMENT 'JSON data',
  correlated_events ARRAY<STRING> COMMENT 'Array of UUIDs',
  recommendations STRING COMMENT 'JSON data',
  auto_generated BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.user_analytics.user_roles (
  id STRING NOT NULL,
  role_name STRING NOT NULL,
  display_name STRING NOT NULL,
  description STRING,
  permissions STRING COMMENT 'JSON data',
  can_create_users BOOLEAN,
  can_modify_users BOOLEAN,
  can_delete_users BOOLEAN,
  can_assign_roles BOOLEAN,
  can_grant_clearances BOOLEAN,
  can_view_audit_logs BOOLEAN,
  max_clearance_level STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 5: incident_response (4 tables)
# MAGIC Incident response workflows, triggers, and automated response actions.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.incident_response.n8n_workflows (
  id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  n8n_webhook_url STRING NOT NULL,
  n8n_workflow_id STRING,
  workflow_type STRING NOT NULL,
  enabled BOOLEAN,
  configuration STRING COMMENT 'JSON data',
  auth_method STRING,
  auth_credentials STRING COMMENT 'JSON data',
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.incident_response.response_actions (
  id STRING NOT NULL,
  execution_id STRING,
  action_type STRING NOT NULL,
  target_entity STRING NOT NULL,
  action_details STRING COMMENT 'JSON data',
  action_status STRING,
  result_message STRING,
  rollback_possible BOOLEAN,
  rolled_back_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.incident_response.workflow_executions (
  id STRING NOT NULL,
  workflow_id STRING,
  trigger_id STRING,
  execution_status STRING,
  trigger_data STRING COMMENT 'JSON data',
  response_data STRING COMMENT 'JSON data',
  error_message STRING,
  execution_time_ms INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.incident_response.workflow_triggers (
  id STRING NOT NULL,
  workflow_id STRING,
  trigger_name STRING NOT NULL,
  trigger_type STRING NOT NULL,
  conditions STRING NOT NULL COMMENT 'JSON data',
  priority INT,
  enabled BOOLEAN,
  cooldown_seconds INT,
  last_triggered_at TIMESTAMP,
  trigger_count INT,
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 6: compliance (10 tables)
# MAGIC Compliance frameworks, controls, assessments, evidence, and risk tracking.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.access_control_matrix (
  id STRING NOT NULL,
  role STRING NOT NULL,
  resource_type STRING NOT NULL,
  resource_id STRING,
  action STRING NOT NULL,
  min_clearance_required STRING,
  compartments_required ARRAY<STRING>,
  time_restrictions STRING COMMENT 'JSON data',
  ip_restrictions ARRAY<STRING> COMMENT 'Array of IP addresses',
  additional_conditions STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.business_impact_analyses (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_job_id STRING,
  business_process STRING NOT NULL,
  process_owner STRING,
  criticality_tier INT,
  rto_hours INT,
  rpo_hours INT,
  mtpd_hours INT,
  mbco STRING,
  annual_revenue_impact_usd DECIMAL(38,10),
  regulatory_impact STRING,
  reputational_impact STRING,
  dependencies STRING COMMENT 'JSON data',
  recovery_strategies STRING COMMENT 'JSON data',
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.compliance_assessments (
  id STRING NOT NULL,
  framework_id STRING,
  control_id STRING,
  status STRING NOT NULL,
  compliance_score DECIMAL(38,10) NOT NULL,
  compliant_controls INT,
  total_controls INT,
  critical_gaps INT,
  high_gaps INT,
  medium_gaps INT,
  low_gaps INT,
  last_assessment TIMESTAMP,
  next_assessment TIMESTAMP,
  assessed_by STRING,
  notes STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.compliance_controls (
  id STRING NOT NULL,
  framework_id STRING,
  control_id STRING NOT NULL,
  control_name STRING NOT NULL,
  description STRING,
  category STRING NOT NULL,
  priority STRING NOT NULL,
  implementation_status STRING,
  automated_check BOOLEAN,
  check_query STRING,
  created_at TIMESTAMP,
  ocsf_event_classes ARRAY<INT>,
  ocsf_required_attributes ARRAY<STRING>
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.compliance_evidence (
  id STRING NOT NULL,
  control_id STRING,
  evidence_type STRING NOT NULL,
  evidence_name STRING NOT NULL,
  evidence_location STRING,
  evidence_data STRING COMMENT 'JSON data',
  collection_method STRING,
  collected_at TIMESTAMP,
  valid_until TIMESTAMP,
  verified BOOLEAN,
  verified_by STRING,
  verified_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.compliance_frameworks (
  id STRING NOT NULL,
  framework_code STRING NOT NULL,
  framework_name STRING NOT NULL,
  version STRING NOT NULL,
  description STRING,
  category STRING NOT NULL,
  regulatory BOOLEAN,
  last_updated TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.compliance_gaps (
  id STRING NOT NULL,
  framework_id STRING,
  control_id STRING,
  gap_title STRING NOT NULL,
  gap_description STRING,
  severity STRING NOT NULL,
  risk_level STRING NOT NULL,
  remediation_plan STRING,
  remediation_status STRING,
  assigned_to STRING,
  due_date TIMESTAMP,
  resolved_at TIMESTAMP,
  identified_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.compliance_mappings (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_job_id STRING,
  framework STRING NOT NULL,
  control_id STRING,
  control_name STRING,
  control_description STRING,
  compliance_status STRING,
  evidence_location STRING,
  gap_analysis STRING,
  remediation_required BOOLEAN,
  remediation_priority STRING,
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.contract_obligations (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_job_id STRING,
  obligation_type STRING NOT NULL,
  clause_reference STRING,
  obligation_description STRING NOT NULL,
  responsible_party STRING,
  deadline TIMESTAMP,
  penalty_amount DECIMAL(38,10),
  penalty_description STRING,
  monitoring_required BOOLEAN,
  notification_days_before INT,
  status STRING,
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.compliance.risk_assessments (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_job_id STRING,
  risk_title STRING NOT NULL,
  risk_description STRING,
  risk_category STRING,
  threat_source STRING,
  vulnerability STRING,
  likelihood STRING,
  impact STRING,
  risk_score DECIMAL(38,10),
  inherent_risk_level STRING,
  residual_risk_level STRING,
  affected_assets STRING COMMENT 'JSON data',
  mitigation_strategies STRING COMMENT 'JSON data',
  control_effectiveness STRING,
  recommendation STRING,
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 7: malware_sandbox (12 tables)
# MAGIC Malware analysis sandbox with samples, sessions, behavioral analysis, and AI results.

# COMMAND ----------


spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.ai_analysis_jobs (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_type STRING NOT NULL,
  job_status STRING,
  priority INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message STRING,
  tokens_used INT,
  cost_usd DECIMAL(38,10),
  results_summary STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.ai_analysis_results (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  sample_id STRING NOT NULL,
  analysis_timestamp TIMESTAMP,
  malware_family STRING,
  family_confidence DECIMAL(38,10),
  malware_category STRING,
  threat_classification STRING,
  behavior_summary STRING,
  mitre_attack_techniques STRING COMMENT 'JSON data',
  capabilities_detected STRING COMMENT 'JSON data',
  anti_analysis_techniques STRING COMMENT 'JSON data',
  persistence_mechanisms STRING COMMENT 'JSON data',
  privilege_escalation STRING COMMENT 'JSON data',
  defense_evasion STRING COMMENT 'JSON data',
  credential_access STRING COMMENT 'JSON data',
  discovery_techniques STRING COMMENT 'JSON data',
  lateral_movement STRING COMMENT 'JSON data',
  collection_methods STRING COMMENT 'JSON data',
  exfiltration_methods STRING COMMENT 'JSON data',
  command_control STRING COMMENT 'JSON data',
  impact_actions STRING COMMENT 'JSON data',
  iocs_extracted STRING COMMENT 'JSON data',
  yara_signatures STRING COMMENT 'JSON data',
  similarity_analysis STRING COMMENT 'JSON data',
  threat_score DECIMAL(38,10),
  confidence_score DECIMAL(38,10),
  ai_model_version STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.api_calls (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  process_id INT NOT NULL,
  process_name STRING,
  api_category STRING NOT NULL,
  api_name STRING NOT NULL,
  module_name STRING,
  parameters STRING COMMENT 'JSON data',
  return_value STRING,
  return_code INT,
  suspicious_pattern BOOLEAN,
  threat_indicator STRING,
  call_stack STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.file_operations (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  operation_type STRING NOT NULL,
  file_path STRING NOT NULL,
  file_name STRING,
  file_extension STRING,
  file_size INT,
  file_hash_sha256 STRING,
  process_id INT,
  process_name STRING,
  original_file_path STRING,
  encryption_detected BOOLEAN,
  ransom_note_created BOOLEAN,
  encryption_algorithm STRING,
  file_extension_changed BOOLEAN,
  original_extension STRING,
  new_extension STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.kernel_activity (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  activity_type STRING NOT NULL,
  kernel_module STRING,
  hook_type STRING,
  target_function STRING,
  original_address STRING,
  hooked_address STRING,
  interrupt_vector INT,
  driver_name STRING,
  driver_path STRING,
  driver_signed BOOLEAN,
  syscall_number INT,
  syscall_name STRING,
  parameters STRING COMMENT 'JSON data',
  return_value STRING,
  stack_trace STRING COMMENT 'JSON data',
  threat_indicator BOOLEAN,
  rootkit_behavior BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.malware_samples (
  id STRING NOT NULL,
  sample_hash_md5 STRING NOT NULL,
  sample_hash_sha256 STRING NOT NULL,
  sample_name STRING NOT NULL,
  file_type STRING NOT NULL,
  file_size INT NOT NULL,
  source_type STRING NOT NULL,
  capture_timestamp TIMESTAMP,
  dpi_session_id STRING,
  network_source_ip STRING COMMENT 'IP address',
  network_dest_ip STRING COMMENT 'IP address',
  original_filename STRING,
  malware_family STRING,
  threat_category STRING,
  severity STRING,
  is_packed BOOLEAN,
  packer_type STRING,
  anti_analysis_detected BOOLEAN,
  yara_matches STRING COMMENT 'JSON data',
  static_analysis_complete BOOLEAN,
  sandbox_status STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.malware_sandbox_results (
  id BIGINT NOT NULL,
  sandbox_platform STRING,
  submission_id STRING,
  file_hash_md5 STRING,
  file_hash_sha1 STRING,
  file_hash_sha256 STRING,
  file_name STRING,
  file_type STRING,
  file_size_bytes BIGINT,
  detection_ratio STRING,
  threat_classification ARRAY<STRING>,
  malware_family STRING,
  behavioral_patterns STRING COMMENT 'JSON data',
  network_activity STRING COMMENT 'JSON data',
  registry_modifications STRING COMMENT 'JSON data',
  file_operations STRING COMMENT 'JSON data',
  process_tree STRING COMMENT 'JSON data',
  anti_analysis_techniques ARRAY<STRING>,
  c2_servers ARRAY<STRING> COMMENT 'Array of IP addresses',
  ttps_observed ARRAY<STRING>,
  severity STRING,
  analysis_date TIMESTAMP,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.memory_analysis (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  analysis_type STRING NOT NULL,
  process_id INT NOT NULL,
  process_name STRING,
  memory_address STRING NOT NULL,
  memory_region_size INT,
  memory_protection STRING,
  is_executable BOOLEAN,
  shellcode_detected BOOLEAN,
  shellcode_size INT,
  shellcode_hash STRING,
  injection_source_process STRING,
  encoded_payload BOOLEAN,
  decoding_stub_found BOOLEAN,
  rop_gadgets_found INT,
  heap_spray_pattern STRING,
  strings_extracted STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.network_behavior (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  protocol STRING NOT NULL,
  source_ip STRING COMMENT 'IP address',
  source_port INT,
  dest_ip STRING COMMENT 'IP address',
  dest_port INT,
  domain STRING,
  url STRING,
  http_method STRING,
  user_agent STRING,
  bytes_sent INT,
  bytes_received INT,
  connection_type STRING,
  c2_server BOOLEAN,
  exfiltration_detected BOOLEAN,
  encryption_used BOOLEAN,
  encryption_type STRING,
  geo_location STRING COMMENT 'JSON data',
  threat_intel_match BOOLEAN,
  payload_sample STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.process_behavior (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  action_type STRING NOT NULL,
  process_id INT NOT NULL,
  process_name STRING NOT NULL,
  process_path STRING,
  parent_process_id INT,
  parent_process_name STRING,
  command_line STRING,
  user_context STRING,
  integrity_level STRING,
  injection_technique STRING,
  target_process_id INT,
  target_process_name STRING,
  injected_code_size INT,
  injected_code_hash STRING,
  persistence_method STRING,
  privilege_escalation BOOLEAN,
  shellcode_detected BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.registry_operations (
  id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  operation_type STRING NOT NULL,
  registry_hive STRING NOT NULL,
  registry_path STRING NOT NULL,
  value_name STRING,
  value_type STRING,
  value_data STRING,
  process_id INT,
  process_name STRING,
  persistence_technique BOOLEAN,
  autostart_entry BOOLEAN,
  security_modification BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.malware_sandbox.sandbox_sessions (
  id STRING NOT NULL,
  sample_id STRING NOT NULL,
  session_name STRING NOT NULL,
  environment_type STRING NOT NULL,
  vm_id STRING NOT NULL,
  cpu_arch STRING,
  execution_start TIMESTAMP NOT NULL,
  execution_end TIMESTAMP,
  execution_duration_seconds INT,
  session_status STRING,
  detonation_method STRING,
  network_allowed BOOLEAN,
  internet_simulation BOOLEAN,
  artifacts_captured INT,
  screenshots_captured INT,
  memory_dumps INT,
  pcap_file_size INT,
  ai_analysis_complete BOOLEAN,
  threat_score DECIMAL(38,10),
  confidence_score DECIMAL(38,10),
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 8: red_team (12 tables)
# MAGIC Red team operations including pentest campaigns, attack chains, fuzzing, and AI-generated tools.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.adversarial_training_data (
  id BIGINT NOT NULL,
  adversarial_type STRING,
  attack_technique STRING,
  adversarial_prompt STRING,
  expected_behavior STRING,
  actual_behavior STRING,
  model_vulnerable BOOLEAN,
  attack_success_rate DECIMAL(38,10),
  mitigation_applied STRING,
  mitigation_effectiveness DECIMAL(38,10),
  severity STRING,
  discovered_by STRING,
  discovered_at TIMESTAMP,
  used_in_training BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.agent_pentest_sessions (
  id STRING NOT NULL,
  campaign_id STRING,
  agent_name STRING NOT NULL,
  agent_role STRING NOT NULL,
  agent_model STRING,
  session_start TIMESTAMP,
  session_end TIMESTAMP,
  actions_performed INT,
  vulnerabilities_discovered INT,
  successful_exploits INT,
  tools_created INT,
  session_log STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.ai_generated_tools (
  id STRING NOT NULL,
  tool_name STRING NOT NULL,
  tool_type STRING NOT NULL,
  tool_purpose STRING NOT NULL,
  target_vulnerability STRING,
  programming_language STRING,
  creation_method STRING,
  ai_model STRING,
  effectiveness_score DECIMAL(38,10),
  success_rate DECIMAL(38,10),
  times_used INT,
  successful_uses INT,
  detection_rate DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.attack_chains (
  id STRING NOT NULL,
  campaign_id STRING,
  chain_name STRING NOT NULL,
  attack_scenario STRING,
  initial_access_technique STRING,
  stages STRING NOT NULL COMMENT 'JSON data',
  current_stage INT,
  total_stages INT NOT NULL,
  success BOOLEAN,
  objectives_completed STRING COMMENT 'JSON data',
  mitre_attack_tactics STRING COMMENT 'JSON data',
  start_time TIMESTAMP,
  duration_seconds INT,
  detection_events INT,
  blue_team_response BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.detected_attack_sequences (
  id STRING NOT NULL,
  sequence_name STRING NOT NULL,
  kill_chain_stages ARRAY<STRING>,
  correlation_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  initial_access_node STRING,
  target_nodes ARRAY<STRING>,
  attacker_ips ARRAY<STRING>,
  compromised_users ARRAY<STRING>,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  is_ongoing BOOLEAN,
  severity STRING NOT NULL,
  confidence DECIMAL(38,10),
  mitre_tactics STRING COMMENT 'JSON data',
  mitre_techniques STRING COMMENT 'JSON data',
  graph_visualization STRING COMMENT 'JSON data',
  timeline STRING COMMENT 'JSON data',
  alert_id STRING,
  case_id STRING,
  status STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.fuzzing_campaigns (
  id STRING NOT NULL,
  campaign_name STRING NOT NULL,
  fuzzer_type STRING NOT NULL,
  target_type STRING NOT NULL,
  target_name STRING NOT NULL,
  status STRING,
  total_executions BIGINT,
  executions_per_second DECIMAL(38,10),
  total_crashes INT,
  unique_crashes INT,
  code_coverage_percent DECIMAL(38,10),
  start_time TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.fuzzing_crashes (
  id STRING NOT NULL,
  campaign_id STRING NOT NULL,
  crash_hash STRING NOT NULL,
  crash_type STRING NOT NULL,
  severity STRING NOT NULL,
  reproducible BOOLEAN,
  reproduction_rate DECIMAL(38,10),
  exploit_potential STRING,
  cve_candidate BOOLEAN,
  crash_input STRING,
  crash_input_size INT,
  registers STRING COMMENT 'JSON data',
  stack_trace STRING,
  disassembly STRING,
  memory_map STRING,
  asan_report STRING,
  valgrind_report STRING,
  ai_analysis STRING,
  mitigation_bypass BOOLEAN,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  occurrence_count INT,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.fuzzing_results (
  id STRING NOT NULL,
  campaign_id STRING,
  test_case_id STRING NOT NULL,
  result_type STRING NOT NULL,
  crash_type STRING,
  input_size INT,
  code_coverage_delta DECIMAL(38,10),
  new_paths_discovered INT,
  timestamp TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.pentest_campaigns (
  id STRING NOT NULL,
  campaign_name STRING NOT NULL,
  campaign_type STRING NOT NULL,
  methodology STRING,
  agent_model STRING,
  status STRING,
  targets_count INT,
  vulnerabilities_found INT,
  critical_findings INT,
  high_findings INT,
  medium_findings INT,
  low_findings INT,
  exploited_count INT,
  risk_score DECIMAL(38,10),
  start_time TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.pentest_exploits (
  id STRING NOT NULL,
  campaign_id STRING NOT NULL,
  finding_id STRING,
  target_id STRING,
  exploit_name STRING NOT NULL,
  exploit_type STRING,
  exploit_technique STRING,
  exploit_source STRING,
  payload_type STRING,
  attempt_time TIMESTAMP,
  success BOOLEAN,
  result_description STRING,
  privileges_gained STRING,
  access_level STRING,
  persistence_established BOOLEAN,
  lateral_movement BOOLEAN,
  data_exfiltrated BOOLEAN,
  detection_evaded BOOLEAN,
  tool_used STRING,
  command_executed STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.pentest_findings (
  id STRING NOT NULL,
  campaign_id STRING,
  vulnerability_name STRING NOT NULL,
  cve_id STRING,
  severity STRING NOT NULL,
  cvss_score DECIMAL(38,10),
  description STRING,
  affected_component STRING,
  exploited BOOLEAN,
  remediation STRING,
  discovered_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.red_team.pentest_targets (
  id STRING NOT NULL,
  campaign_id STRING NOT NULL,
  target_name STRING NOT NULL,
  target_type STRING NOT NULL,
  ip_address STRING COMMENT 'IP address',
  hostname STRING,
  port INT,
  service_name STRING,
  service_version STRING,
  os_detected STRING,
  firewall_detected BOOLEAN,
  waf_detected BOOLEAN,
  ids_ips_detected BOOLEAN,
  scan_status STRING,
  vulnerabilities_found INT,
  exploited BOOLEAN,
  compromised BOOLEAN,
  privilege_level STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 9: network_security (11 tables)
# MAGIC Network security including assets, vulnerabilities, DPI flows, DLP, and physical security.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.asset_registry (
  id STRING NOT NULL,
  asset_name STRING NOT NULL,
  asset_type STRING NOT NULL,
  ip_address STRING NOT NULL,
  location STRING NOT NULL,
  criticality STRING NOT NULL,
  exposed_ports ARRAY<INT>,
  known_vulnerabilities ARRAY<STRING>,
  last_scan TIMESTAMP,
  is_active BOOLEAN,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  model_confidence DECIMAL(38,10),
  criticality_score DECIMAL(38,10)
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.asset_vulnerabilities (
  id STRING NOT NULL,
  asset_id STRING,
  cve_id STRING NOT NULL,
  severity STRING NOT NULL,
  cvss_score DECIMAL(38,10),
  title STRING NOT NULL,
  description STRING,
  affected_component STRING,
  remediation STRING,
  status STRING,
  discovered_at TIMESTAMP,
  patched_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.cctv_cameras (
  id STRING NOT NULL,
  camera_id STRING NOT NULL,
  zone_id STRING,
  position STRING NOT NULL COMMENT 'JSON data',
  coverage_radius DECIMAL(38,10),
  status STRING,
  last_ping TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.dlp_detections (
  id STRING NOT NULL,
  packet_id STRING,
  flow_id STRING NOT NULL,
  risk_level STRING NOT NULL,
  violation_type STRING NOT NULL,
  detected_patterns ARRAY<STRING>,
  content_classification STRING NOT NULL,
  action_taken STRING NOT NULL,
  confidence_score DECIMAL(38,10) NOT NULL,
  details STRING COMMENT 'JSON data',
  detected_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.dpi_flows (
  id STRING NOT NULL,
  flow_id STRING NOT NULL,
  source_ip STRING NOT NULL,
  destination_ip STRING NOT NULL,
  source_zone STRING NOT NULL,
  destination_zone STRING NOT NULL,
  protocol STRING NOT NULL,
  total_packets INT,
  total_bytes BIGINT,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  status STRING,
  content_summary STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.nist_nvd_vulnerabilities (
  id BIGINT NOT NULL,
  cve_id STRING NOT NULL,
  published_date TIMESTAMP,
  last_modified_date TIMESTAMP,
  vulnerability_description STRING,
  cvss_v3_score DECIMAL(38,10),
  cvss_v3_severity STRING,
  cvss_v3_vector STRING,
  cwe_ids ARRAY<STRING>,
  affected_products STRING COMMENT 'JSON data',
  reference_urls ARRAY<STRING>,
  exploit_available BOOLEAN,
  patch_available BOOLEAN,
  remediation_guidance STRING,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.packet_captures (
  id STRING NOT NULL,
  capture_time TIMESTAMP,
  source_ip STRING NOT NULL,
  destination_ip STRING NOT NULL,
  source_port INT NOT NULL,
  destination_port INT NOT NULL,
  protocol STRING NOT NULL,
  packet_size INT NOT NULL,
  content_type STRING NOT NULL,
  reconstructed_content STRING COMMENT 'JSON data',
  flow_id STRING NOT NULL,
  status STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.personnel_tracking (
  id STRING NOT NULL,
  person_id STRING NOT NULL,
  person_name STRING NOT NULL,
  clearance_level STRING NOT NULL,
  current_zone_id STRING,
  position STRING NOT NULL COMMENT 'JSON data',
  last_seen TIMESTAMP,
  badge_type STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.physical_asset_vulnerabilities (
  id STRING NOT NULL,
  location STRING NOT NULL,
  vulnerability_type STRING NOT NULL,
  severity STRING NOT NULL,
  title STRING NOT NULL,
  description STRING,
  affected_systems ARRAY<STRING>,
  remediation STRING,
  status STRING,
  discovered_at TIMESTAMP,
  resolved_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.physical_security_events (
  id STRING NOT NULL,
  event_type STRING NOT NULL,
  severity STRING NOT NULL,
  zone_id STRING,
  camera_id STRING,
  person_id STRING,
  description STRING NOT NULL,
  position STRING NOT NULL COMMENT 'JSON data',
  status STRING,
  assigned_to STRING,
  created_at TIMESTAMP,
  resolved_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.network_security.physical_zones (
  id STRING NOT NULL,
  zone_name STRING NOT NULL,
  zone_type STRING NOT NULL,
  security_level STRING NOT NULL,
  coordinates STRING NOT NULL COMMENT 'JSON data',
  access_rules STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 10: ai_agents (16 tables)
# MAGIC AI agent infrastructure, model registry, MLflow, serving endpoints, and automation metrics.

# COMMAND ----------


spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.agent_learning_feedback (
  id STRING NOT NULL,
  agent_id STRING,
  task_id STRING,
  feedback_type STRING NOT NULL,
  feedback_score INT,
  analyst_comment STRING,
  correct_action STRING,
  improvement_applied BOOLEAN,
  created_by STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.agent_tasks (
  id STRING NOT NULL,
  agent_id STRING,
  task_type STRING NOT NULL,
  priority STRING NOT NULL,
  status STRING NOT NULL,
  input_data STRING COMMENT 'JSON data',
  output_data STRING COMMENT 'JSON data',
  confidence_score DECIMAL(38,10),
  escalated BOOLEAN,
  escalation_reason STRING,
  processing_time_ms INT,
  related_alert_id STRING,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.ai_agent_activity (
  id STRING NOT NULL,
  agent_type STRING NOT NULL,
  activity_type STRING NOT NULL,
  source_data STRING COMMENT 'JSON data',
  result STRING COMMENT 'JSON data',
  reasoning STRING,
  confidence DECIMAL(38,10),
  execution_time_ms INT,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.ai_agents (
  id STRING NOT NULL,
  name STRING NOT NULL,
  type STRING NOT NULL,
  description STRING NOT NULL,
  status STRING NOT NULL,
  task_description STRING NOT NULL,
  optimization_method STRING,
  performance_score DECIMAL(38,10),
  tasks_completed INT,
  accuracy_rate DECIMAL(38,10),
  avg_response_time INT,
  config STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.ai_insights (
  id STRING NOT NULL,
  document_id STRING,
  analysis_job_id STRING,
  insight_type STRING NOT NULL,
  severity STRING,
  title STRING NOT NULL,
  description STRING NOT NULL,
  affected_area STRING,
  category STRING,
  actionable BOOLEAN,
  estimated_effort STRING,
  estimated_cost_usd DECIMAL(38,10),
  priority_score DECIMAL(38,10),
  related_entities STRING COMMENT 'JSON data',
  implementation_steps STRING COMMENT 'JSON data',
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.embedding_models (
  id STRING NOT NULL,
  model_name STRING NOT NULL,
  model_type STRING NOT NULL,
  embedding_dimension INT NOT NULL,
  is_active BOOLEAN,
  performance_metrics STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.foundation_models (
  id BIGINT NOT NULL,
  model_name STRING NOT NULL,
  model_provider STRING,
  model_version STRING,
  model_type STRING,
  parameter_count STRING,
  context_window INT,
  supports_fine_tuning BOOLEAN,
  supports_rag BOOLEAN,
  specialization ARRAY<STRING>,
  performance_benchmarks STRING COMMENT 'JSON data',
  cost_per_1k_tokens DECIMAL(38,10),
  latency_p50_ms INT,
  latency_p99_ms INT,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.hedwick_model_registry (
  id BIGINT NOT NULL,
  model_id STRING NOT NULL,
  model_name STRING NOT NULL,
  model_version STRING NOT NULL,
  model_stage STRING,
  model_framework STRING,
  model_type STRING,
  model_artifact_path STRING,
  model_size_mb DECIMAL(38,10),
  training_dataset_id STRING,
  hyperparameters STRING COMMENT 'JSON data',
  metrics STRING COMMENT 'JSON data',
  feature_importance STRING COMMENT 'JSON data',
  input_schema STRING COMMENT 'JSON data',
  output_schema STRING COMMENT 'JSON data',
  created_by STRING,
  approved_by STRING,
  approval_date TIMESTAMP,
  tags ARRAY<STRING>,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.mlflow_experiments (
  id BIGINT NOT NULL,
  experiment_name STRING NOT NULL,
  experiment_description STRING,
  artifact_location STRING,
  lifecycle_stage STRING,
  tags STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.mlflow_traces (
  id BIGINT NOT NULL,
  trace_id STRING NOT NULL,
  experiment_id BIGINT,
  endpoint_id BIGINT,
  request_timestamp TIMESTAMP NOT NULL,
  user_id STRING,
  input_prompt STRING,
  input_tokens INT,
  output_response STRING,
  output_tokens INT,
  total_tokens INT,
  latency_ms DECIMAL(38,10),
  model_version STRING,
  temperature DECIMAL(38,10),
  max_tokens INT,
  intermediate_steps STRING COMMENT 'JSON data',
  metadata STRING COMMENT 'JSON data',
  status STRING,
  error_message STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.model_evaluations (
  id BIGINT NOT NULL,
  evaluation_name STRING,
  model_a_id BIGINT,
  model_b_id BIGINT,
  evaluation_dataset STRING,
  test_prompts STRING COMMENT 'JSON data',
  evaluation_metrics STRING COMMENT 'JSON data',
  model_a_results STRING COMMENT 'JSON data',
  model_b_results STRING COMMENT 'JSON data',
  model_a_avg_latency_ms DECIMAL(38,10),
  model_b_avg_latency_ms DECIMAL(38,10),
  model_a_toxicity_score DECIMAL(38,10),
  model_b_toxicity_score DECIMAL(38,10),
  model_a_accuracy DECIMAL(38,10),
  model_b_accuracy DECIMAL(38,10),
  model_a_token_usage INT,
  model_b_token_usage INT,
  model_a_cost_usd DECIMAL(38,10),
  model_b_cost_usd DECIMAL(38,10),
  winner STRING,
  evaluation_notes STRING,
  evaluated_by STRING,
  evaluated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.model_feedback (
  id BIGINT NOT NULL,
  trace_id STRING,
  endpoint_id BIGINT,
  analyst_id STRING,
  feedback_type STRING,
  original_response STRING,
  corrected_response STRING,
  feedback_category STRING,
  feedback_notes STRING,
  severity STRING,
  action_taken STRING,
  used_for_retraining BOOLEAN,
  feedback_timestamp TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.model_fine_tuning_jobs (
  id BIGINT NOT NULL,
  job_name STRING NOT NULL,
  base_model_id BIGINT,
  training_data_path STRING,
  training_data_format STRING,
  training_data_size_mb DECIMAL(38,10),
  training_data_rows INT,
  task_type STRING,
  hyperparameters STRING COMMENT 'JSON data',
  training_duration_epochs INT,
  learning_rate DECIMAL(38,10),
  batch_size INT,
  status STRING,
  progress_percent INT,
  training_loss DECIMAL(38,10),
  validation_loss DECIMAL(38,10),
  output_model_path STRING,
  output_model_size_gb DECIMAL(38,10),
  training_started_at TIMESTAMP,
  training_completed_at TIMESTAMP,
  error_message STRING,
  created_by STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.model_monitoring_metrics (
  id BIGINT NOT NULL,
  endpoint_id BIGINT,
  metric_timestamp TIMESTAMP NOT NULL,
  requests_count INT,
  successful_requests INT,
  failed_requests INT,
  average_latency_ms DECIMAL(38,10),
  p50_latency_ms DECIMAL(38,10),
  p95_latency_ms DECIMAL(38,10),
  p99_latency_ms DECIMAL(38,10),
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  average_toxicity_score DECIMAL(38,10),
  hallucination_rate DECIMAL(38,10),
  response_quality_score DECIMAL(38,10),
  context_relevance_score DECIMAL(38,10),
  prompt_injection_attempts INT,
  jailbreak_attempts INT,
  pii_leakage_incidents INT,
  anomaly_score DECIMAL(38,10),
  cost_usd DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.model_serving_endpoints (
  id BIGINT NOT NULL,
  endpoint_name STRING NOT NULL,
  endpoint_url STRING,
  model_id BIGINT,
  fine_tuned_model_id BIGINT,
  endpoint_type STRING,
  compute_type STRING,
  auto_scaling_enabled BOOLEAN,
  min_instances INT,
  max_instances INT,
  current_instances INT,
  requests_per_second INT,
  average_latency_ms DECIMAL(38,10),
  p99_latency_ms DECIMAL(38,10),
  error_rate DECIMAL(38,10),
  deployment_status STRING,
  last_health_check TIMESTAMP,
  deployed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ai_agents.soc_automation_metrics (
  id STRING NOT NULL,
  metric_timestamp TIMESTAMP,
  alerts_auto_triaged INT,
  alerts_escalated INT,
  false_positives_filtered INT,
  avg_triage_time_seconds INT,
  iocs_enriched INT,
  automated_responses INT,
  analyst_time_saved_hours DECIMAL(38,10),
  accuracy_rate DECIMAL(38,10)
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 11: correlation_engine (24 tables)
# MAGIC Graph-based correlation engine with streaming graphs, threat graphs, pattern discovery, and vector correlations.

# COMMAND ----------


spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.cep_pattern_matches (
  id BIGINT NOT NULL,
  pattern_id BIGINT,
  match_id STRING NOT NULL,
  matched_vertices ARRAY<STRING>,
  matched_edges ARRAY<STRING>,
  match_start_time TIMESTAMP,
  match_end_time TIMESTAMP,
  confidence_score DECIMAL(38,10),
  severity STRING,
  match_details STRING COMMENT 'JSON data',
  alert_generated BOOLEAN,
  analyst_reviewed BOOLEAN,
  false_positive BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.cep_patterns (
  id BIGINT NOT NULL,
  pattern_name STRING NOT NULL,
  pattern_description STRING,
  pattern_type STRING,
  pattern_definition STRING NOT NULL COMMENT 'JSON data',
  time_window_seconds INT,
  min_occurrences INT,
  severity STRING,
  enabled BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.correlation_rule_matches (
  id STRING NOT NULL,
  rule_id STRING NOT NULL,
  matched_events STRING NOT NULL COMMENT 'JSON data',
  match_timestamp TIMESTAMP,
  severity STRING NOT NULL,
  details STRING COMMENT 'JSON data',
  is_true_positive BOOLEAN,
  analyst_notes STRING
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.correlation_rules (
  id STRING NOT NULL,
  rule_name STRING NOT NULL,
  rule_description STRING NOT NULL,
  rule_logic STRING NOT NULL COMMENT 'JSON data',
  source_pattern_id STRING,
  severity STRING NOT NULL,
  status STRING NOT NULL,
  confidence_score DECIMAL(38,10),
  true_positive_rate DECIMAL(38,10),
  false_positive_rate DECIMAL(38,10),
  generated_by STRING NOT NULL,
  agent_reasoning STRING,
  tags STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  last_triggered_at TIMESTAMP,
  trigger_count INT
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.discovered_patterns (
  id STRING NOT NULL,
  snapshot_id STRING NOT NULL,
  profile_id STRING NOT NULL,
  pattern_name STRING NOT NULL,
  pattern_type STRING NOT NULL,
  event_sequence STRING COMMENT 'JSON data',
  occurrence_count INT,
  confidence_score DECIMAL(38,10),
  threat_level STRING,
  is_baseline BOOLEAN,
  is_anomaly BOOLEAN,
  description STRING,
  event_ids STRING COMMENT 'JSON data',
  graph_data STRING COMMENT 'JSON data',
  investigated BOOLEAN,
  rule_created BOOLEAN,
  rule_id STRING,
  alert_triggered BOOLEAN,
  tags STRING COMMENT 'JSON data',
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.discovery_profiles (
  id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  profile_type STRING NOT NULL,
  event_criteria STRING COMMENT 'JSON data',
  sequence_length_min INT,
  sequence_length_max INT,
  occurrence_threshold INT,
  time_window_hours INT,
  enabled BOOLEAN,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  run_frequency_hours INT,
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.discovery_snapshots (
  id STRING NOT NULL,
  profile_id STRING NOT NULL,
  snapshot_name STRING NOT NULL,
  snapshot_status STRING NOT NULL,
  event_count INT,
  time_range_start TIMESTAMP NOT NULL,
  time_range_end TIMESTAMP NOT NULL,
  patterns_discovered INT,
  analysis_duration_ms INT,
  error_message STRING,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  completed_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.entity_resolution (
  id BIGINT NOT NULL,
  canonical_entity_id STRING NOT NULL,
  entity_type STRING NOT NULL,
  merged_entity_ids ARRAY<STRING>,
  resolution_method STRING,
  confidence_score DECIMAL(38,10),
  properties STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  last_merged_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_communities (
  id BIGINT NOT NULL,
  community_id STRING NOT NULL,
  community_name STRING,
  community_type STRING,
  node_ids ARRAY<STRING>,
  node_count INT,
  edge_count INT,
  avg_risk_score DECIMAL(38,10),
  community_characteristics STRING COMMENT 'JSON data',
  detection_algorithm STRING,
  first_detected TIMESTAMP,
  last_updated TIMESTAMP,
  status STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_correlations (
  id STRING NOT NULL,
  correlation_name STRING NOT NULL,
  pattern_id STRING,
  path_nodes ARRAY<STRING> NOT NULL,
  path_edges ARRAY<STRING> NOT NULL,
  hop_count INT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  severity STRING NOT NULL,
  confidence DECIMAL(38,10),
  risk_score DECIMAL(38,10),
  event_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  affected_entities STRING COMMENT 'JSON data',
  graph_metrics STRING COMMENT 'JSON data',
  alert_generated BOOLEAN,
  case_created BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_edges (
  id STRING NOT NULL,
  source_node_id STRING NOT NULL,
  target_node_id STRING NOT NULL,
  edge_type STRING NOT NULL,
  weight DECIMAL(38,10),
  event_count INT,
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  properties STRING COMMENT 'JSON data',
  severity STRING,
  confidence DECIMAL(38,10),
  event_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_nodes (
  id STRING NOT NULL,
  node_id STRING NOT NULL,
  node_type STRING NOT NULL,
  properties STRING COMMENT 'JSON data',
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  event_count INT,
  risk_score DECIMAL(38,10),
  is_malicious BOOLEAN,
  tags ARRAY<STRING>,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_patterns (
  id STRING NOT NULL,
  pattern_name STRING NOT NULL,
  pattern_type STRING NOT NULL,
  pattern_query STRING NOT NULL,
  node_sequence ARRAY<STRING>,
  edge_sequence ARRAY<STRING>,
  min_occurrences INT,
  confidence DECIMAL(38,10),
  severity STRING,
  mitre_tactics ARRAY<STRING>,
  mitre_techniques ARRAY<STRING>,
  description STRING,
  discovered_at TIMESTAMP,
  last_matched_at TIMESTAMP,
  match_count INT,
  enabled BOOLEAN,
  created_by STRING,
  metadata STRING COMMENT 'JSON data'
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_processing_jobs (
  id BIGINT NOT NULL,
  job_name STRING NOT NULL,
  job_type STRING,
  graph_snapshot_id STRING,
  parameters STRING COMMENT 'JSON data',
  status STRING,
  progress_percent INT,
  vertices_processed BIGINT,
  edges_processed BIGINT,
  results STRING COMMENT 'JSON data',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.graph_stream_windows (
  id BIGINT NOT NULL,
  window_id STRING NOT NULL,
  window_type STRING,
  window_size_seconds INT NOT NULL,
  window_slide_seconds INT,
  window_start TIMESTAMP NOT NULL,
  window_end TIMESTAMP NOT NULL,
  vertex_count INT,
  edge_count INT,
  pattern_matches_count INT,
  anomaly_score DECIMAL(38,10),
  summary_stats STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.pattern_baselines (
  id STRING NOT NULL,
  profile_id STRING NOT NULL,
  baseline_name STRING NOT NULL,
  event_patterns STRING COMMENT 'JSON data',
  statistical_data STRING COMMENT 'JSON data',
  confidence_interval DECIMAL(38,10),
  sample_size INT,
  valid_from TIMESTAMP,
  valid_until TIMESTAMP,
  auto_update BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.pattern_investigations (
  id STRING NOT NULL,
  pattern_id STRING NOT NULL,
  investigator STRING NOT NULL,
  investigation_status STRING NOT NULL,
  findings STRING,
  severity_assessment STRING,
  recommended_actions STRING COMMENT 'JSON data',
  related_patterns STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.streaming_graph_edges (
  id BIGINT NOT NULL,
  edge_id STRING NOT NULL,
  source_vertex_id STRING,
  target_vertex_id STRING,
  edge_type STRING NOT NULL,
  properties STRING COMMENT 'JSON data',
  weight DECIMAL(38,10),
  temporal_start TIMESTAMP,
  temporal_end TIMESTAMP,
  event_count INT,
  last_event_time TIMESTAMP,
  is_suspicious BOOLEAN,
  confidence_score DECIMAL(38,10)
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.streaming_graph_vertices (
  id BIGINT NOT NULL,
  vertex_id STRING NOT NULL,
  vertex_type STRING NOT NULL,
  properties STRING COMMENT 'JSON data',
  labels ARRAY<STRING>,
  risk_score DECIMAL(38,10),
  temporal_properties STRING COMMENT 'JSON data',
  first_seen TIMESTAMP,
  last_updated TIMESTAMP,
  update_count INT,
  is_active BOOLEAN,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector'
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.threat_graph_edges (
  id BIGINT NOT NULL,
  edge_id STRING NOT NULL,
  source_node_id STRING,
  target_node_id STRING,
  relationship_type STRING,
  properties STRING COMMENT 'JSON data',
  weight DECIMAL(38,10),
  frequency INT,
  first_observed TIMESTAMP,
  last_observed TIMESTAMP,
  is_suspicious BOOLEAN,
  anomaly_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.threat_graph_nodes (
  id BIGINT NOT NULL,
  node_id STRING NOT NULL,
  node_type STRING,
  node_label STRING,
  properties STRING COMMENT 'JSON data',
  risk_score DECIMAL(38,10),
  first_seen TIMESTAMP,
  last_seen TIMESTAMP,
  observation_count INT,
  is_malicious BOOLEAN,
  confidence_score DECIMAL(38,10),
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.threat_hunt_queries (
  id STRING NOT NULL,
  query_name STRING NOT NULL,
  natural_language_query STRING NOT NULL,
  query_embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  hunt_type STRING NOT NULL,
  time_range_start TIMESTAMP,
  time_range_end TIMESTAMP,
  filters STRING COMMENT 'JSON data',
  results_count INT,
  findings STRING COMMENT 'JSON data',
  status STRING,
  hunter STRING,
  created_at TIMESTAMP,
  completed_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.vector_correlation_rules (
  id STRING NOT NULL,
  rule_name STRING NOT NULL,
  description STRING,
  rule_type STRING NOT NULL,
  pattern_embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  similarity_threshold DECIMAL(38,10),
  example_patterns STRING COMMENT 'JSON data',
  detection_count INT,
  true_positive_rate DECIMAL(38,10),
  false_positive_rate DECIMAL(38,10),
  confidence_score DECIMAL(38,10),
  enabled BOOLEAN,
  tags STRING COMMENT 'JSON data',
  created_by STRING,
  last_triggered_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.correlation_engine.vector_correlations (
  id STRING NOT NULL,
  rule_id STRING,
  event_ids STRING NOT NULL COMMENT 'JSON data',
  correlation_type STRING NOT NULL,
  similarity_score DECIMAL(38,10),
  event_embeddings STRING COMMENT 'JSON data',
  attack_chain STRING COMMENT 'JSON data',
  threat_narrative STRING,
  severity STRING,
  investigated BOOLEAN,
  findings STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 12: data_connectors (10 tables)
# MAGIC Data connector infrastructure with telemetry, bytecode instrumentation, and code analysis.

# COMMAND ----------


spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.bytecode_instrumentation (
  id STRING NOT NULL,
  connector_id STRING NOT NULL,
  application_name STRING NOT NULL,
  runtime_type STRING NOT NULL,
  instrumentation_level STRING,
  weaving_technique STRING NOT NULL,
  target_packages STRING COMMENT 'JSON data',
  target_classes STRING COMMENT 'JSON data',
  target_methods STRING COMMENT 'JSON data',
  intercept_strings BOOLEAN,
  intercept_parameters BOOLEAN,
  intercept_return_values BOOLEAN,
  capture_stack_traces BOOLEAN,
  capture_memory_snapshots BOOLEAN,
  sampling_rate DECIMAL(38,10),
  max_string_length INT,
  filter_patterns STRING COMMENT 'JSON data',
  active BOOLEAN,
  agent_version STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.code_pattern_analysis (
  id BIGINT NOT NULL,
  analysis_id STRING,
  source_type STRING,
  source_url STRING,
  code_snippet STRING,
  language STRING,
  vulnerability_patterns_detected ARRAY<STRING>,
  potential_cwe_ids ARRAY<STRING>,
  potential_cve_ids ARRAY<STRING>,
  exploit_primitives ARRAY<STRING>,
  dangerous_functions ARRAY<STRING>,
  security_risk_score DECIMAL(38,10),
  exploitability_score DECIMAL(38,10),
  impact_score DECIMAL(38,10),
  ml_confidence DECIMAL(38,10),
  similar_known_vulns ARRAY<STRING>,
  analysis_notes STRING,
  embedding ARRAY<FLOAT> COMMENT 'Embedding vector',
  analyzed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.connector_alerts (
  id STRING NOT NULL,
  connector_id STRING NOT NULL,
  alert_type STRING NOT NULL,
  severity STRING NOT NULL,
  title STRING NOT NULL,
  description STRING,
  metric_name STRING,
  threshold_value DECIMAL(38,10),
  actual_value DECIMAL(38,10),
  alert_timestamp TIMESTAMP,
  acknowledged BOOLEAN,
  resolved BOOLEAN,
  resolution_notes STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.connector_events (
  id STRING NOT NULL,
  connector_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  event_type STRING NOT NULL,
  event_category STRING,
  source_ip STRING COMMENT 'IP address',
  dest_ip STRING COMMENT 'IP address',
  source_port INT,
  dest_port INT,
  protocol STRING,
  raw_data STRING,
  parsed_data STRING COMMENT 'JSON data',
  severity STRING,
  tags STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.connector_telemetry (
  id STRING NOT NULL,
  connector_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  cpu_usage_percent DECIMAL(38,10),
  memory_usage_mb DECIMAL(38,10),
  network_throughput_mbps DECIMAL(38,10),
  events_processed INT,
  events_dropped INT,
  errors_count INT,
  latency_ms DECIMAL(38,10),
  queue_depth INT,
  buffer_usage_percent DECIMAL(38,10),
  connection_state STRING,
  metrics STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.data_connectors (
  id STRING NOT NULL,
  connector_name STRING NOT NULL,
  connector_type STRING NOT NULL,
  connector_category STRING NOT NULL,
  protocol STRING,
  endpoint STRING,
  port INT,
  authentication_method STRING,
  status STRING,
  health_status STRING,
  data_rate_mbps DECIMAL(38,10),
  events_per_second DECIMAL(38,10),
  total_events_received BIGINT,
  bytes_received BIGINT,
  last_event_timestamp TIMESTAMP,
  uptime_percent DECIMAL(38,10),
  error_count INT,
  configuration STRING COMMENT 'JSON data',
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.intercepted_functions (
  id STRING NOT NULL,
  instrumentation_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  thread_id STRING NOT NULL,
  class_name STRING NOT NULL,
  method_name STRING NOT NULL,
  method_signature STRING,
  execution_time_ns BIGINT,
  entry_timestamp TIMESTAMP,
  exit_timestamp TIMESTAMP,
  parameters STRING COMMENT 'JSON data',
  return_value STRING,
  exception_thrown STRING,
  caller_class STRING,
  caller_method STRING,
  invocation_depth INT,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.memory_snapshots (
  id STRING NOT NULL,
  instrumentation_id STRING NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  thread_id STRING NOT NULL,
  heap_used_mb DECIMAL(38,10),
  heap_max_mb DECIMAL(38,10),
  heap_usage_percent DECIMAL(38,10),
  non_heap_used_mb DECIMAL(38,10),
  gc_count INT,
  gc_time_ms BIGINT,
  thread_count INT,
  loaded_classes INT,
  object_allocations STRING COMMENT 'JSON data',
  hot_objects STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.stack_traces (
  id STRING NOT NULL,
  instrumentation_id STRING NOT NULL,
  function_call_id STRING,
  timestamp TIMESTAMP NOT NULL,
  thread_id STRING NOT NULL,
  thread_name STRING,
  thread_state STRING,
  frames STRING NOT NULL COMMENT 'JSON data',
  depth INT,
  is_blocked BOOLEAN,
  lock_info STRING COMMENT 'JSON data',
  cpu_time_ms BIGINT,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.data_connectors.string_intercepts (
  id STRING NOT NULL,
  instrumentation_id STRING NOT NULL,
  function_call_id STRING,
  timestamp TIMESTAMP NOT NULL,
  source_class STRING NOT NULL,
  source_method STRING NOT NULL,
  target_class STRING,
  target_method STRING,
  string_value STRING NOT NULL,
  string_type STRING,
  string_length INT,
  is_sensitive BOOLEAN,
  contains_credentials BOOLEAN,
  contains_pii BOOLEAN,
  encryption_detected BOOLEAN,
  encoding_detected STRING,
  pattern_matches STRING COMMENT 'JSON data',
  context STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 13: llm_security (11 tables)
# MAGIC LLM security monitoring, AI gateway, risk profiling, and interaction analysis.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.ai_gateway_policies (
  id BIGINT NOT NULL,
  policy_name STRING NOT NULL,
  policy_type STRING,
  policy_definition STRING NOT NULL COMMENT 'JSON data',
  enforcement_level STRING,
  enabled BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.ai_gateway_requests (
  id BIGINT NOT NULL,
  request_id STRING NOT NULL,
  user_id STRING,
  app_id STRING,
  model_endpoint STRING,
  request_type STRING,
  input_tokens INT,
  output_tokens INT,
  total_tokens INT,
  prompt_text STRING,
  response_text STRING,
  latency_ms DECIMAL(38,10),
  cost_usd DECIMAL(38,10),
  content_filtered BOOLEAN,
  pii_detected BOOLEAN,
  toxicity_score DECIMAL(38,10),
  policy_violations ARRAY<STRING>,
  approved BOOLEAN,
  timestamp TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.ai_security_incidents (
  id BIGINT NOT NULL,
  incident_id STRING,
  incident_type STRING,
  affected_endpoint_id BIGINT,
  affected_model STRING,
  incident_description STRING,
  attack_vector STRING,
  indicators_of_compromise STRING COMMENT 'JSON data',
  impact_severity STRING,
  affected_requests INT,
  data_exposed BOOLEAN,
  pii_involved BOOLEAN,
  detection_method STRING,
  detected_at TIMESTAMP,
  responded_at TIMESTAMP,
  mitigated_at TIMESTAMP,
  response_actions STRING COMMENT 'JSON data',
  root_cause STRING,
  lessons_learned STRING,
  status STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.communication_sources (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  email_connected BOOLEAN,
  slack_connected BOOLEAN,
  teams_connected BOOLEAN,
  zoom_connected BOOLEAN,
  calendar_connected BOOLEAN,
  file_system_connected BOOLEAN,
  total_emails_analyzed INT,
  total_slack_messages_analyzed INT,
  total_teams_messages_analyzed INT,
  total_meetings_analyzed INT,
  analysis_start_date TIMESTAMP,
  analysis_end_date TIMESTAMP,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.document_uploads (
  id STRING NOT NULL,
  document_name STRING NOT NULL,
  document_type STRING NOT NULL,
  file_format STRING NOT NULL,
  file_size_mb DECIMAL(38,10),
  upload_timestamp TIMESTAMP,
  uploaded_by STRING,
  status STRING,
  processing_start_time TIMESTAMP,
  processing_end_time TIMESTAMP,
  processing_duration_seconds INT,
  ai_model STRING,
  confidence_score DECIMAL(38,10),
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.extracted_assets (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_job_id STRING,
  asset_name STRING NOT NULL,
  asset_type STRING NOT NULL,
  asset_category STRING,
  description STRING,
  location STRING,
  owner STRING,
  criticality STRING,
  data_classification STRING,
  dependencies STRING COMMENT 'JSON data',
  metadata STRING COMMENT 'JSON data',
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.llm_interactions (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  session_id STRING NOT NULL,
  timestamp TIMESTAMP,
  prompt_text STRING NOT NULL,
  prompt_tokens INT NOT NULL,
  response_text STRING,
  response_tokens INT,
  model_name STRING NOT NULL,
  model_version STRING,
  contains_pii BOOLEAN,
  contains_credentials BOOLEAN,
  contains_proprietary_data BOOLEAN,
  contains_code BOOLEAN,
  is_jailbreak_attempt BOOLEAN,
  is_data_exfiltration BOOLEAN,
  data_sensitivity_level STRING,
  interaction_risk_score INT,
  risk_factors STRING COMMENT 'JSON data',
  application_context STRING,
  ip_address STRING COMMENT 'IP address',
  user_agent STRING,
  geo_location STRING,
  flagged_for_review BOOLEAN,
  reviewed BOOLEAN,
  reviewed_by STRING,
  reviewed_at TIMESTAMP,
  review_notes STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.llm_risk_incidents (
  id STRING NOT NULL,
  incident_type STRING NOT NULL,
  severity STRING NOT NULL,
  user_id STRING NOT NULL,
  interaction_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  profile_id STRING,
  triggered_rule_ids ARRAY<STRING> COMMENT 'Array of UUIDs',
  title STRING NOT NULL,
  description STRING NOT NULL,
  risk_score INT NOT NULL,
  evidence STRING COMMENT 'JSON data',
  status STRING,
  assigned_to STRING,
  assigned_at TIMESTAMP,
  priority INT,
  resolution STRING,
  resolved_at TIMESTAMP,
  resolved_by STRING,
  actions_taken STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.llm_risk_profiles (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  user_email STRING NOT NULL,
  user_name STRING NOT NULL,
  department STRING,
  role_title STRING,
  current_risk_score INT,
  risk_level STRING,
  risk_trend STRING,
  total_interactions INT,
  high_risk_interactions INT,
  flagged_interactions INT,
  average_session_duration_minutes DECIMAL(38,10),
  typical_usage_hours ARRAY<INT>,
  typical_models ARRAY<STRING>,
  average_tokens_per_prompt INT,
  has_anomalous_behavior BOOLEAN,
  anomaly_types STRING COMMENT 'JSON data',
  last_anomaly_detected_at TIMESTAMP,
  pii_exposure_risk INT,
  credential_exposure_risk INT,
  data_exfiltration_risk INT,
  policy_violation_risk INT,
  jailbreak_attempt_risk INT,
  is_escalated BOOLEAN,
  escalated_at TIMESTAMP,
  escalation_reason STRING,
  assigned_to STRING,
  profile_updated_at TIMESTAMP,
  first_interaction_at TIMESTAMP,
  last_interaction_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.llm_risk_rules (
  id STRING NOT NULL,
  rule_name STRING NOT NULL,
  rule_description STRING,
  rule_type STRING NOT NULL,
  pattern_regex STRING,
  threshold_value DECIMAL(38,10),
  threshold_operator STRING,
  anomaly_deviation_factor DECIMAL(38,10),
  severity STRING NOT NULL,
  risk_points INT NOT NULL,
  auto_escalate BOOLEAN,
  is_active BOOLEAN,
  category STRING NOT NULL,
  tags ARRAY<STRING>,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.llm_security.psychological_profile_evidence (
  id STRING NOT NULL,
  user_id STRING NOT NULL,
  psychological_profile_id STRING,
  evidence_type STRING NOT NULL,
  trait_or_factor STRING NOT NULL,
  evidence_description STRING NOT NULL,
  source_platforms ARRAY<STRING>,
  email_references ARRAY<STRING> COMMENT 'Array of UUIDs',
  slack_references ARRAY<STRING> COMMENT 'Array of UUIDs',
  teams_references ARRAY<STRING> COMMENT 'Array of UUIDs',
  meeting_references ARRAY<STRING> COMMENT 'Array of UUIDs',
  llm_references ARRAY<STRING> COMMENT 'Array of UUIDs',
  evidence_strength STRING NOT NULL,
  confidence_score INT,
  supporting_data STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 14: search_infra (8 tables)
# MAGIC Search infrastructure including Lucene indices, query routing, and performance metrics.

# COMMAND ----------


spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.full_text_search_config (
  id BIGINT NOT NULL,
  config_name STRING NOT NULL,
  analyzer_type STRING,
  language STRING,
  stopwords ARRAY<STRING>,
  custom_filters STRING COMMENT 'JSON data',
  char_filters STRING COMMENT 'JSON data',
  tokenizer_config STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.lucene_indices (
  id BIGINT NOT NULL,
  index_name STRING NOT NULL,
  source_table STRING NOT NULL,
  indexed_columns ARRAY<STRING> NOT NULL,
  index_type STRING,
  shard_count INT,
  replica_count INT,
  analyzer_config STRING COMMENT 'JSON data',
  index_size_bytes BIGINT,
  document_count BIGINT,
  last_optimized_at TIMESTAMP,
  status STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.lucene_search_cache (
  id BIGINT NOT NULL,
  cache_key STRING NOT NULL,
  index_name STRING NOT NULL,
  query_text STRING NOT NULL,
  query_params STRING COMMENT 'JSON data',
  result_ids ARRAY<BIGINT>,
  result_count INT,
  cached_at TIMESTAMP,
  expires_at TIMESTAMP,
  hit_count INT,
  last_hit_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.lucene_shards (
  id BIGINT NOT NULL,
  index_id BIGINT,
  shard_id INT NOT NULL,
  shard_role STRING,
  node_location STRING,
  document_count BIGINT,
  shard_size_bytes BIGINT,
  query_count BIGINT,
  avg_query_time_ms DECIMAL(38,10),
  last_query_at TIMESTAMP,
  health_status STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.partition_metadata (
  id BIGINT NOT NULL,
  table_name STRING NOT NULL,
  partition_strategy STRING,
  partition_column STRING,
  partition_count INT,
  partition_size_avg_gb DECIMAL(38,10),
  largest_partition_gb DECIMAL(38,10),
  smallest_partition_gb DECIMAL(38,10),
  total_size_gb DECIMAL(38,10),
  retention_days INT,
  auto_drop_old_partitions BOOLEAN,
  last_maintenance_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.query_performance_stats (
  id BIGINT NOT NULL,
  query_hash STRING,
  query_text STRING,
  table_names ARRAY<STRING>,
  execution_time_ms DECIMAL(38,10),
  rows_scanned BIGINT,
  rows_returned INT,
  cache_hit BOOLEAN,
  used_index BOOLEAN,
  optimization_applied STRING,
  executed_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.query_routing_rules (
  id BIGINT NOT NULL,
  rule_name STRING NOT NULL,
  query_pattern STRING,
  source_type STRING,
  latency_requirement_ms INT,
  priority INT,
  enabled BOOLEAN,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.search_infra.search_performance_metrics (
  id BIGINT NOT NULL,
  index_name STRING NOT NULL,
  query_text STRING,
  query_type STRING,
  shard_count_used INT,
  documents_scanned BIGINT,
  results_returned INT,
  query_time_ms DECIMAL(38,10),
  cache_hit BOOLEAN,
  timestamp TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 15: platform_config (19 tables)
# MAGIC Platform configuration including pipelines, parsers, enrichment, reports, and system settings.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.active_lists (
  id STRING NOT NULL,
  name STRING NOT NULL,
  list_type STRING NOT NULL,
  category STRING NOT NULL,
  description STRING,
  entries STRING COMMENT 'JSON data',
  auto_update BOOLEAN,
  source_url STRING,
  last_updated TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.correlation_queue (
  id STRING NOT NULL,
  event_id STRING,
  rule_id STRING,
  status STRING,
  correlation_window_start TIMESTAMP,
  correlation_window_end TIMESTAMP,
  matched_events STRING COMMENT 'JSON data',
  correlation_score DECIMAL(38,10),
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.custom_reports (
  id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  category STRING,
  type STRING,
  configuration STRING COMMENT 'JSON data',
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.data_optimization_jobs (
  id BIGINT NOT NULL,
  job_id STRING NOT NULL,
  target_table STRING NOT NULL,
  optimization_type STRING NOT NULL,
  z_order_columns ARRAY<STRING>,
  vacuum_days_trailing INT,
  schedule STRING,
  last_run_at TIMESTAMP,
  next_run_at TIMESTAMP,
  duration_seconds INT,
  files_processed INT,
  bytes_processed BIGINT,
  space_saved_bytes BIGINT,
  status STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.databricks_sync_status (
  id STRING NOT NULL,
  table_name STRING NOT NULL,
  last_sync_timestamp TIMESTAMP NOT NULL,
  sync_status STRING,
  records_synced BIGINT,
  delta_lake_path STRING,
  streaming_query_id STRING,
  watermark_timestamp TIMESTAMP,
  metadata STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.enrichment_queue (
  id STRING NOT NULL,
  event_id STRING,
  enrichment_source_id STRING,
  status STRING,
  priority INT,
  enrichment_data STRING COMMENT 'JSON data',
  error_message STRING,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.enrichment_sources (
  id STRING NOT NULL,
  name STRING NOT NULL,
  source_type STRING NOT NULL,
  description STRING,
  enabled BOOLEAN,
  api_endpoint STRING,
  api_key_encrypted STRING,
  cache_ttl_seconds INT,
  timeout_ms INT,
  rate_limit_per_minute INT,
  enrichment_fields STRING COMMENT 'JSON data',
  success_count BIGINT,
  failure_count BIGINT,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.event_parsers (
  id STRING NOT NULL,
  name STRING NOT NULL,
  format_type STRING NOT NULL,
  description STRING,
  priority INT,
  enabled BOOLEAN,
  regex_patterns STRING COMMENT 'JSON data',
  field_mappings STRING COMMENT 'JSON data',
  normalization_rules STRING COMMENT 'JSON data',
  test_samples STRING COMMENT 'JSON data',
  success_count BIGINT,
  failure_count BIGINT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.parsing_queue (
  id STRING NOT NULL,
  raw_event_id STRING,
  parser_id STRING,
  status STRING,
  priority INT,
  attempts INT,
  max_attempts INT,
  parsed_data STRING COMMENT 'JSON data',
  error_message STRING,
  processing_started_at TIMESTAMP,
  processing_completed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.processing_stats (
  id STRING NOT NULL,
  stat_timestamp TIMESTAMP,
  pipeline_stage STRING NOT NULL,
  events_processed BIGINT,
  events_failed BIGINT,
  avg_processing_time_ms DECIMAL(38,10),
  max_processing_time_ms INT,
  queue_depth INT,
  throughput_eps DECIMAL(38,10),
  metadata STRING COMMENT 'JSON data'
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.report_executions (
  id STRING NOT NULL,
  report_id STRING,
  report_name STRING NOT NULL,
  report_type STRING NOT NULL,
  status STRING,
  start_time TIMESTAMP,
  end_time TIMESTAMP,
  duration_seconds INT,
  rows_processed INT,
  output_format STRING,
  output_path STRING,
  error_message STRING,
  executed_by STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.report_schedules (
  id STRING NOT NULL,
  report_id STRING,
  report_type STRING NOT NULL,
  schedule_type STRING NOT NULL,
  cron_expression STRING,
  recipients ARRAY<STRING>,
  format STRING,
  enabled BOOLEAN,
  next_run TIMESTAMP,
  last_run TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.session_correlations (
  id STRING NOT NULL,
  session_list_id STRING NOT NULL,
  correlation_type STRING NOT NULL,
  involved_sessions STRING COMMENT 'JSON data',
  confidence_score DECIMAL(38,10),
  description STRING NOT NULL,
  evidence STRING COMMENT 'JSON data',
  alert_generated BOOLEAN,
  alert_id STRING,
  reviewed BOOLEAN,
  reviewed_by STRING,
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.session_list_entries (
  id STRING NOT NULL,
  session_list_id STRING NOT NULL,
  session_id STRING NOT NULL,
  user_id STRING,
  source_ip STRING,
  device_id STRING,
  login_time TIMESTAMP,
  logout_time TIMESTAMP,
  duration_seconds INT,
  event_count INT,
  risk_score DECIMAL(38,10),
  status STRING,
  attributes STRING COMMENT 'JSON data',
  added_by_rule STRING,
  tags STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  expires_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.session_list_rules (
  id STRING NOT NULL,
  session_list_id STRING NOT NULL,
  rule_name STRING NOT NULL,
  rule_description STRING,
  event_type_filter STRING,
  conditions STRING COMMENT 'JSON data',
  attributes_to_capture STRING COMMENT 'JSON data',
  enabled BOOLEAN,
  priority INT,
  trigger_count INT,
  last_triggered_at TIMESTAMP,
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.session_lists (
  id STRING NOT NULL,
  name STRING NOT NULL,
  description STRING,
  list_category STRING NOT NULL,
  tracking_attributes STRING COMMENT 'JSON data',
  time_window_hours INT,
  rule_driven BOOLEAN,
  correlation_enabled BOOLEAN,
  entry_count INT,
  created_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.stream_partitions (
  id BIGINT NOT NULL,
  pipeline_id BIGINT,
  partition_id INT NOT NULL,
  partition_key STRING,
  current_offset BIGINT,
  lag_seconds INT,
  records_processed BIGINT,
  last_processed_at TIMESTAMP,
  status STRING
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.streaming_pipelines (
  id BIGINT NOT NULL,
  pipeline_name STRING NOT NULL,
  pipeline_type STRING,
  source_topics ARRAY<STRING>,
  target_table STRING,
  processing_mode STRING,
  throughput_records_per_sec INT,
  latency_ms INT,
  partition_count INT,
  enabled BOOLEAN,
  configuration STRING COMMENT 'JSON data',
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.platform_config.system_settings (
  id STRING NOT NULL,
  databricks_workspace_url STRING,
  databricks_access_token STRING,
  databricks_cluster_id STRING,
  databricks_catalog STRING,
  databricks_schema STRING,
  smtp_host STRING,
  smtp_port INT,
  smtp_username STRING,
  smtp_password STRING,
  smtp_from_email STRING,
  siem_retention_days INT,
  log_level STRING,
  max_events_per_second INT,
  enable_ml_correlation BOOLEAN,
  enable_auto_response BOOLEAN,
  session_timeout_minutes INT,
  max_failed_login_attempts INT,
  password_min_length INT,
  password_require_special BOOLEAN,
  enable_mfa BOOLEAN,
  enable_saml_sso BOOLEAN,
  enable_oauth BOOLEAN,
  oauth_providers ARRAY<STRING>,
  enable_ldap BOOLEAN,
  ldap_server STRING,
  ldap_base_dn STRING,
  enable_audit_logging BOOLEAN,
  enable_encryption_at_rest BOOLEAN,
  enable_rate_limiting BOOLEAN,
  api_rate_limit INT,
  backup_enabled BOOLEAN,
  backup_frequency_hours INT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  enable_ha BOOLEAN,
  ha_mode STRING,
  ha_nodes INT,
  ha_sync_mode STRING,
  ha_heartbeat_interval INT,
  ha_failover_timeout INT,
  load_balancer_type STRING,
  load_balancer_algorithm STRING,
  enable_auto_scaling BOOLEAN,
  min_instances INT,
  max_instances INT,
  scale_up_threshold INT,
  scale_down_threshold INT
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 16: ocsf (6 tables)
# MAGIC Open Cybersecurity Schema Framework (OCSF) event classes, categories, and mappings.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ocsf.diagram_entities (
  id STRING NOT NULL,
  document_id STRING NOT NULL,
  analysis_job_id STRING,
  entity_name STRING NOT NULL,
  entity_type STRING NOT NULL,
  layer STRING,
  coordinates STRING COMMENT 'JSON data',
  connections STRING COMMENT 'JSON data',
  properties STRING COMMENT 'JSON data',
  security_zone STRING,
  data_flow_direction STRING,
  protocols STRING COMMENT 'JSON data',
  confidence_score DECIMAL(38,10),
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ocsf.ocsf_attributes (
  id STRING NOT NULL,
  attribute_name STRING NOT NULL,
  attribute_type STRING NOT NULL,
  description STRING,
  requirement STRING,
  applies_to ARRAY<INT>,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ocsf.ocsf_categories (
  id STRING NOT NULL,
  category_uid INT NOT NULL,
  category_name STRING NOT NULL,
  description STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ocsf.ocsf_enrichments (
  id STRING NOT NULL,
  event_id STRING,
  enrichment_type STRING NOT NULL,
  enrichment_data STRING COMMENT 'JSON data',
  enriched_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ocsf.ocsf_event_classes (
  id STRING NOT NULL,
  class_uid INT NOT NULL,
  class_name STRING NOT NULL,
  category_uid INT,
  description STRING,
  caption STRING,
  attributes STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.ocsf.ocsf_source_mappings (
  id STRING NOT NULL,
  source_vendor STRING NOT NULL,
  source_type STRING NOT NULL,
  source_event_type STRING NOT NULL,
  ocsf_class_uid INT,
  mapping_rules STRING COMMENT 'JSON data',
  confidence_score INT,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")


# COMMAND ----------

# MAGIC %md
# MAGIC ## Schema 17: internal_services (8 tables)
# MAGIC Internal Databricks service infrastructure including GPU training, caching, and metadata.

# COMMAND ----------

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.alkami_inference_service (
  id BIGINT NOT NULL,
  service_id STRING NOT NULL,
  service_name STRING NOT NULL,
  model_id STRING,
  model_version STRING,
  inference_type STRING,
  endpoint_url STRING,
  compute_type STRING,
  instance_count INT,
  auto_scaling_enabled BOOLEAN,
  min_instances INT,
  max_instances INT,
  requests_per_second INT,
  avg_latency_ms DECIMAL(38,10),
  p95_latency_ms DECIMAL(38,10),
  p99_latency_ms DECIMAL(38,10),
  error_rate DECIMAL(38,10),
  total_requests BIGINT,
  deployment_status STRING,
  health_check_url STRING,
  last_health_check TIMESTAMP,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.bolt_gpu_training (
  id BIGINT NOT NULL,
  training_job_id STRING NOT NULL,
  job_name STRING NOT NULL,
  model_name STRING,
  training_script_path STRING,
  dataset_path STRING,
  gpu_type STRING,
  gpu_count INT,
  distributed_training BOOLEAN,
  training_framework STRING,
  hyperparameters STRING COMMENT 'JSON data',
  status STRING,
  progress_percent INT,
  current_epoch INT,
  total_epochs INT,
  training_loss DECIMAL(38,10),
  validation_loss DECIMAL(38,10),
  validation_accuracy DECIMAL(38,10),
  estimated_completion_time TIMESTAMP,
  compute_cost_usd DECIMAL(38,10),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message STRING,
  output_model_id STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.brickstore_cache (
  id BIGINT NOT NULL,
  cache_key STRING NOT NULL,
  cache_namespace STRING,
  value_data STRING NOT NULL COMMENT 'JSON data',
  value_size_bytes INT,
  ttl_seconds INT,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  access_count INT,
  last_accessed_at TIMESTAMP,
  hit_rate DECIMAL(38,10)
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.cowboy_notebooks (
  id BIGINT NOT NULL,
  notebook_id STRING NOT NULL,
  notebook_name STRING NOT NULL,
  notebook_path STRING,
  kernel_type STRING,
  compute_instance_type STRING,
  cpu_cores INT,
  memory_gb INT,
  gpu_count INT,
  owner_id STRING,
  collaborators ARRAY<STRING>,
  status STRING,
  last_execution_time TIMESTAMP,
  execution_count INT,
  last_cell_output STRING COMMENT 'JSON data',
  environment_config STRING COMMENT 'JSON data',
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.db_apps_registry (
  id BIGINT NOT NULL,
  app_id STRING NOT NULL,
  app_name STRING NOT NULL,
  app_type STRING,
  app_framework_version STRING,
  source_path STRING,
  app_url STRING,
  compute_tier STRING,
  auto_scaling BOOLEAN,
  environment_variables STRING COMMENT 'JSON data',
  dependencies STRING COMMENT 'JSON data',
  deployment_status STRING,
  health_status STRING,
  active_users INT,
  total_requests BIGINT,
  avg_response_time_ms DECIMAL(38,10),
  memory_usage_mb INT,
  cpu_usage_percent DECIMAL(38,10),
  last_deployment_at TIMESTAMP,
  last_health_check TIMESTAMP,
  created_by STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.lakebase_sync_jobs (
  id BIGINT NOT NULL,
  sync_job_id STRING NOT NULL,
  source_table STRING NOT NULL,
  target_table STRING NOT NULL,
  sync_type STRING,
  sync_frequency STRING,
  last_sync_at TIMESTAMP,
  next_sync_at TIMESTAMP,
  records_synced BIGINT,
  sync_latency_ms DECIMAL(38,10),
  status STRING,
  error_count INT,
  last_error STRING,
  created_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.turi_metadata_registry (
  id BIGINT NOT NULL,
  metadata_id STRING NOT NULL,
  resource_type STRING,
  resource_name STRING NOT NULL,
  resource_path STRING,
  owner_id STRING,
  team STRING,
  tags ARRAY<STRING>,
  description STRING,
  schema_version STRING,
  metadata_json STRING COMMENT 'JSON data',
  lineage_upstream ARRAY<STRING>,
  lineage_downstream ARRAY<STRING>,
  access_level STRING,
  last_modified_by STRING,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);
""")

spark.sql("""
CREATE TABLE IF NOT EXISTS soc_platform.internal_services.zerobus_commits (
  id BIGINT NOT NULL,
  commit_id STRING NOT NULL,
  target_table STRING NOT NULL,
  commit_type STRING,
  record_count INT,
  data_size_bytes BIGINT,
  commit_latency_ms DECIMAL(38,10),
  bypass_queue BOOLEAN,
  commit_timestamp TIMESTAMP,
  source_pipeline STRING,
  partition_info STRING COMMENT 'JSON data',
  success BOOLEAN,
  error_message STRING
)
USING DELTA
TBLPROPERTIES (
  'delta.autoOptimize.optimizeWrite' = 'true',
  'delta.autoOptimize.autoCompact' = 'true'
);""")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Generic Mock Data Population
# MAGIC Automatically generates 3-5 rows of realistic mock data for every table.

# COMMAND ----------

def generate_mock_value(col_name, data_type, comment=""):
    """Generate a realistic mock value based on column name and type."""
    dt = data_type.upper()
    cn = col_name.lower()
    
    if "ARRAY<FLOAT>" in dt:
        return []
    if "ARRAY<STRING>" in dt:
        return [f"item_{i}" for i in range(random.randint(1,3))]
    if "ARRAY<INT>" in dt:
        return [random.randint(1,7) for _ in range(random.randint(1,3))]
    if "ARRAY<BIGINT>" in dt:
        return [random.randint(1,1000) for _ in range(random.randint(1,3))]
    
    if dt == "STRING":
        if cn == "id" or cn.endswith("_id"):
            return uid()
        if "ip" in cn:
            return rip()
        if "severity" in cn:
            return rsev()
        if "status" in cn:
            return random.choice(["active", "completed", "pending", "resolved"])
        if "email" in cn:
            return f"{ruser()}@dazzle.com"
        if "url" in cn:
            return f"https://example.com/{uid()[:8]}"
        if "name" in cn:
            return f"Item-{random.randint(1000,9999)}"
        if "description" in cn or "content" in cn or "summary" in cn or "notes" in cn:
            return f"Auto-generated description {random.randint(1,100)}"
        if "json" in comment.lower():
            return rjson()
        if "tactic" in cn:
            return rtactic()
        if "technique" in cn:
            return rtechnique()
        if "host" in cn:
            return rhost()
        if cn in ("username", "user", "author", "created_by", "assigned_to", "owner", "performed_by"):
            return ruser()
        if "hash" in cn:
            return uuid.uuid4().hex
        if "path" in cn:
            return f"/var/log/security/{uid()[:8]}.log"
        if "version" in cn:
            return f"{random.randint(1,5)}.{random.randint(0,9)}.{random.randint(0,9)}"
        return f"value-{random.randint(1,1000)}"
    
    if dt == "TIMESTAMP":
        return ts()
    if dt == "DATE":
        return (datetime.now() - timedelta(days=random.randint(1,90))).date()
    if dt == "INT":
        return random.randint(0, 1000)
    if dt == "BIGINT":
        return random.randint(0, 100000)
    if dt == "BOOLEAN":
        return random.choice([True, False])
    if "DECIMAL" in dt:
        return float(random.uniform(0, 100))
    return None

def populate_table_generic(full_table_name, num_rows=3):
    """Auto-populate a table with mock data based on its schema."""
    try:
        cols_df = spark.sql(f"DESCRIBE TABLE {full_table_name}").collect()
        columns = []
        for row in cols_df:
            col_name = row["col_name"]
            data_type = row["data_type"]
            comment = row["comment"] if row["comment"] else ""
            if col_name.startswith("#") or "GENERATED" in data_type.upper() or col_name in ("event_date",):
                continue
            columns.append((col_name, data_type, comment))
        
        if not columns:
            return
        
        rows = []
        for i in range(num_rows):
            row_dict = {}
            for col_name, data_type, comment in columns:
                if col_name == "id" and "BIGINT" in data_type.upper():
                    row_dict[col_name] = i + 1
                else:
                    row_dict[col_name] = generate_mock_value(col_name, data_type, comment)
            rows.append(Row(**row_dict))
        
        write_rows(full_table_name, rows)
    except Exception as e:
        print(f"  WARN: {full_table_name}: {str(e)[:80]}")

# COMMAND ----------

# Populate all tables with mock data
all_tables = {}
for schema in SCHEMAS:
    tables_df = spark.sql(f"SHOW TABLES IN soc_platform.{schema}").collect()
    all_tables[schema] = [row["tableName"] for row in tables_df]

print("Populating all tables with mock data...")
for schema, tables in all_tables.items():
    print(f"\nPopulating {schema} ({len(tables)} tables)...")
    for table in tables:
        populate_table_generic(f"soc_platform.{schema}.{table}")

print("\nMock data population complete!")

# COMMAND ----------

# MAGIC %md
# MAGIC ## OCSF Events View

# COMMAND ----------

spark.sql("""CREATE OR REPLACE VIEW soc_platform.ocsf.ocsf_events_view AS
SELECT 
  e.id, e.event_type, e.severity, e.source, e.source_ip, e.dest_ip,
  e.source_port, e.dest_port, e.protocol, e.user_id, e.username,
  e.hostname, e.process_name, e.command_line, e.description,
  e.raw_log, e.raw_json, e.network_flow, e.packet_data,
  e.tags, e.metadata, e.iocs, e.mitre_tactic, e.mitre_technique,
  e.alert_id, e.case_id, e.embedding, e.event_timestamp, e.created_at,
  e.ocsf_class_uid, e.ocsf_class_name, e.ocsf_category_uid,
  e.ocsf_category_name, e.ocsf_severity_id, e.ocsf_activity_id,
  e.ocsf_activity_name, e.ocsf_type_uid, e.ocsf_normalized, e.ocsf_metadata,
  ec.class_name AS ocsf_class_display,
  ec.caption AS ocsf_caption,
  cat.category_name AS ocsf_category_display,
  CASE e.ocsf_severity_id
    WHEN 0 THEN 'Unknown' WHEN 1 THEN 'Informational' WHEN 2 THEN 'Low'
    WHEN 3 THEN 'Medium' WHEN 4 THEN 'High' WHEN 5 THEN 'Critical'
    ELSE 'Unknown'
  END AS ocsf_severity_name
FROM soc_platform.core_siem.events e
LEFT JOIN soc_platform.ocsf.ocsf_event_classes ec ON e.ocsf_class_uid = ec.class_uid
LEFT JOIN soc_platform.ocsf.ocsf_categories cat ON e.ocsf_category_uid = cat.category_uid
WHERE e.ocsf_class_uid IS NOT NULL""")

print("✓ Created ocsf_events_view")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Table Optimization

# COMMAND ----------

optimize_statements = [
    "OPTIMIZE soc_platform.core_siem.events ZORDER BY (severity, source)",
    "OPTIMIZE soc_platform.core_siem.alerts ZORDER BY (severity, status)",
    "OPTIMIZE soc_platform.threat_intel.iocs ZORDER BY (indicator_type, severity)",
    "OPTIMIZE soc_platform.user_analytics.user_behavior_events ZORDER BY (event_type, user_profile_id)",
    "OPTIMIZE soc_platform.correlation_engine.correlation_rules ZORDER BY (status, severity)"
]

print("Running OPTIMIZE commands...")
for stmt in optimize_statements:
    try:
        spark.sql(stmt)
        print(f"  ✓ {stmt[:60]}...")
    except Exception as e:
        print(f"  WARN: {str(e)[:60]}")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Infrastructure Verification

# COMMAND ----------

print("=" * 70)
print("DAZZLE SOC PLATFORM - INFRASTRUCTURE VERIFICATION")
print("=" * 70)

total_tables = 0
for schema in SCHEMAS:
    tables = spark.sql(f"SHOW TABLES IN soc_platform.{schema}").collect()
    count = len(tables)
    total_tables += count
    print(f"  soc_platform.{schema}: {count} tables")

print(f"\nTotal: {total_tables} tables across {len(SCHEMAS)} schemas")
print("=" * 70)

print("\nSample Row Counts:")
sample_tables = ["core_siem.events", "core_siem.alerts", "threat_intel.iocs"]
for table_ref in sample_tables:
    try:
        cnt = spark.sql(f"SELECT COUNT(*) as c FROM soc_platform.{table_ref}").collect()[0]["c"]
        print(f"  soc_platform.{table_ref}: {cnt:,} rows")
    except:
        print(f"  soc_platform.{table_ref}: N/A")

print("\n" + "=" * 70)

# COMMAND ----------

# MAGIC %md
# MAGIC ## Setup Complete
# MAGIC 
# MAGIC | Component | Count |
# MAGIC |-----------|-------|
# MAGIC | Unity Catalog | `soc_platform` |
# MAGIC | Schemas | 17 |
# MAGIC | Delta Lake Tables | 202 |
# MAGIC | Views | 1 (ocsf_events_view) |
# MAGIC | Vector-enabled Tables | 15 |
# MAGIC 
# MAGIC ### Next Steps
# MAGIC 1. Set up Mosaic AI Vector Search endpoints for embedding-enabled tables
# MAGIC 2. Create Delta Live Tables pipelines for real-time event ingestion
# MAGIC 3. Configure Unity Catalog row/column level security policies
# MAGIC 4. Set up scheduled OPTIMIZE + VACUUM jobs for maintenance
# MAGIC 5. Deploy Databricks SQL dashboards for SOC analysts
# MAGIC 
# MAGIC ### Architecture Highlights
# MAGIC - **Zero external dependencies**: Fully self-contained, runs on any Databricks workspace
# MAGIC - **Unity Catalog**: Multi-schema catalog with fine-grained access control
# MAGIC - **Delta Lake**: ACID transactions, time travel, change data feed
# MAGIC - **Vector Search Ready**: 15 tables with embedding columns for AI/ML workloads
# MAGIC - **OCSF Compliant**: Open Cybersecurity Schema Framework integration
# MAGIC - **Production-Ready**: Optimized tables, partitioning, Z-ordering
