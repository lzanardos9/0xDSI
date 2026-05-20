import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const IS_DATABRICKS = import.meta.env.VITE_DATABRICKS_MODE === 'true';

if (!supabaseUrl || !supabaseAnonKey) {
  if (!IS_DATABRICKS) {
    console.error('Missing Supabase configuration:', {
      hasUrl: !!supabaseUrl,
      hasKey: !!supabaseAnonKey,
    });
  }
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

export type SecurityEvent = {
  id: string;
  timestamp: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source_ip: string;
  destination_ip: string;
  user_id: string;
  device_id: string;
  action: string;
  result: 'success' | 'failure' | 'blocked';
  raw_data: any;
  session_id: string;
  created_at: string;
};

export type Session = {
  id: string;
  user_id: string;
  source_ip: string;
  start_time: string;
  end_time?: string;
  status: 'active' | 'closed' | 'suspicious';
  risk_score: number;
  event_count: number;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export type ActiveList = {
  id: string;
  name: string;
  list_type: 'blocklist' | 'allowlist' | 'watchlist';
  category: 'ip' | 'domain' | 'user' | 'hash';
  entries: any[];
  description: string;
  auto_update: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type Alert = {
  id: string;
  alert_name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'new' | 'investigating' | 'resolved' | 'false_positive';
  description: string;
  event_ids: string[];
  session_id?: string;
  assigned_to?: string;
  metadata: any;
  created_at: string;
  updated_at: string;
};

export type ThreatIntelligence = {
  id: string;
  indicator: string;
  indicator_type: 'ip' | 'domain' | 'hash' | 'url';
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  source: string;
  description: string;
  metadata: any;
  first_seen: string;
  last_seen: string;
  created_at: string;
};

export type N8nWorkflow = {
  id: string;
  name: string;
  description: string;
  n8n_webhook_url: string;
  n8n_workflow_id?: string;
  workflow_type: 'response' | 'investigation' | 'notification' | 'remediation';
  enabled: boolean;
  configuration: any;
  auth_method: 'header' | 'query' | 'basic' | 'none';
  auth_credentials: any;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowTrigger = {
  id: string;
  workflow_id: string;
  trigger_name: string;
  trigger_type: 'alert' | 'threshold' | 'schedule' | 'manual' | 'event_pattern';
  conditions: any;
  priority: number;
  enabled: boolean;
  cooldown_seconds: number;
  last_triggered_at?: string;
  trigger_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type WorkflowExecution = {
  id: string;
  workflow_id: string;
  trigger_id?: string;
  execution_status: 'pending' | 'running' | 'success' | 'failed' | 'timeout';
  trigger_data: any;
  response_data: any;
  error_message?: string;
  execution_time_ms?: number;
  started_at: string;
  completed_at?: string;
  created_at: string;
};

export type ResponseAction = {
  id: string;
  execution_id: string;
  action_type: 'block_ip' | 'isolate_user' | 'disable_account' | 'quarantine_file' | 'send_notification' | 'create_ticket' | 'custom';
  target_entity: string;
  action_details: any;
  action_status: 'pending' | 'completed' | 'failed' | 'rolled_back';
  result_message?: string;
  rollback_possible: boolean;
  rolled_back_at?: string;
  created_at: string;
};

export type ThreatFeed = {
  id: string;
  feed_name: string;
  feed_source: string;
  feed_url?: string;
  feed_type: 'ip' | 'domain' | 'url' | 'hash' | 'email' | 'mixed';
  enabled: boolean;
  auto_sync: boolean;
  sync_interval_hours: number;
  last_sync_at?: string;
  last_sync_status?: string;
  total_indicators: number;
  description?: string;
  metadata: any;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type IOC = {
  id: string;
  feed_id?: string;
  indicator: string;
  indicator_type: 'ip' | 'domain' | 'url' | 'hash_md5' | 'hash_sha1' | 'hash_sha256' | 'email' | 'cve';
  threat_type?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  confidence_score: number;
  tags: string[];
  description?: string;
  context: any;
  embedding?: number[];
  first_seen: string;
  last_seen: string;
  expiration_date?: string;
  is_active: boolean;
  match_count: number;
  false_positive_count: number;
  created_at: string;
  updated_at: string;
};

export type IOCMatch = {
  id: string;
  ioc_id: string;
  event_id?: string;
  match_type: 'exact' | 'similarity' | 'pattern' | 'behavioral';
  similarity_score?: number;
  matched_field: string;
  matched_value: string;
  alert_generated: boolean;
  alert_id?: string;
  action_taken?: string;
  response_time_ms?: number;
  metadata: any;
  matched_at: string;
  created_at: string;
};

export type FeedSyncLog = {
  id: string;
  feed_id: string;
  sync_status: 'success' | 'failed' | 'partial' | 'in_progress';
  indicators_fetched: number;
  indicators_added: number;
  indicators_updated: number;
  indicators_removed: number;
  error_message?: string;
  sync_duration_ms?: number;
  started_at: string;
  completed_at?: string;
  created_at: string;
};

export type Case = {
  id: string;
  case_number: string;
  title: string;
  description?: string;
  status: 'new' | 'investigating' | 'contained' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  assigned_to?: string;
  created_by: string;
  resolution?: string;
  related_event_ids: string[];
  related_alert_ids: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
};

export type CaseComment = {
  id: string;
  case_id: string;
  author: string;
  comment: string;
  is_internal: boolean;
  created_at: string;
};

export type CaseTimeline = {
  id: string;
  case_id: string;
  event_type: string;
  description: string;
  actor: string;
  metadata: any;
  created_at: string;
};

export type SessionList = {
  id: string;
  name: string;
  description?: string;
  list_category: 'login_logout' | 'ip_tracking' | 'hostile_activity' | 'operational_monitoring';
  tracking_attributes: string[];
  time_window_hours: number;
  rule_driven: boolean;
  correlation_enabled: boolean;
  entry_count: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type SessionListEntry = {
  id: string;
  session_list_id: string;
  session_id: string;
  user_id?: string;
  source_ip?: string;
  device_id?: string;
  login_time?: string;
  logout_time?: string;
  duration_seconds?: number;
  event_count: number;
  risk_score: number;
  status: 'active' | 'closed' | 'suspicious' | 'compromised';
  attributes: any;
  added_by_rule?: string;
  tags: string[];
  created_at: string;
  updated_at: string;
  expires_at?: string;
};

export type SessionListRule = {
  id: string;
  session_list_id: string;
  rule_name: string;
  rule_description?: string;
  event_type_filter?: string;
  conditions: any;
  attributes_to_capture: string[];
  enabled: boolean;
  priority: number;
  trigger_count: number;
  last_triggered_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type SessionCorrelation = {
  id: string;
  session_list_id: string;
  correlation_type: 'multiple_ips' | 'suspicious_timing' | 'anomalous_activity' | 'compromised_host';
  involved_sessions: string[];
  confidence_score: number;
  description: string;
  evidence: any;
  alert_generated: boolean;
  alert_id?: string;
  reviewed: boolean;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
};

export type DiscoveryProfile = {
  id: string;
  name: string;
  description?: string;
  profile_type: 'unknown_threats' | 'baseline_establishment' | 'anomaly_detection' | 'sequence_analysis';
  event_criteria: any;
  sequence_length_min: number;
  sequence_length_max: number;
  occurrence_threshold: number;
  time_window_hours: number;
  enabled: boolean;
  last_run_at?: string;
  next_run_at?: string;
  run_frequency_hours: number;
  created_by?: string;
  created_at: string;
  updated_at: string;
};

export type DiscoveredPattern = {
  id: string;
  snapshot_id: string;
  profile_id: string;
  pattern_name: string;
  pattern_type: 'threat_sequence' | 'anomaly' | 'baseline_deviation' | 'zero_day_indicator';
  event_sequence: string[];
  occurrence_count: number;
  confidence_score: number;
  threat_level: 'low' | 'medium' | 'high' | 'critical';
  is_baseline: boolean;
  is_anomaly: boolean;
  description?: string;
  event_ids: string[];
  graph_data: any;
  investigated: boolean;
  rule_created: boolean;
  rule_id?: string;
  alert_triggered: boolean;
  tags: string[];
  first_seen: string;
  last_seen: string;
  created_at: string;
  updated_at: string;
};
