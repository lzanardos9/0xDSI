export interface GuardrailPolicy {
  id: string;
  policy_name: string;
  policy_type: string;
  description: string;
  enforcement_level: 'log' | 'warn' | 'block';
  priority: number;
  conditions: any;
  actions: any;
  enabled: boolean;
  hit_count: number;
  block_count: number;
  warn_count: number;
  false_positive_count: number;
  last_triggered_at: string;
  created_by: string;
  version: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ScanResult {
  id: string;
  scan_type: 'prompt' | 'response';
  user_id: string;
  user_email: string;
  model_name: string;
  application: string;
  input_text: string;
  output_text: string;
  verdict: 'pass' | 'warn' | 'block' | 'redact';
  triggered_policies: any[];
  risk_score: number;
  detections: any[];
  pii_found: number;
  tokens_used: number;
  latency_ms: number;
  session_id: string;
  scanned_at: string;
}

export interface PIIRedaction {
  id: string;
  scan_id: string;
  entity_type: string;
  original_snippet: string;
  redacted_snippet: string;
  redaction_strategy: 'mask' | 'hash' | 'tokenize' | 'remove';
  position_start: number;
  position_end: number;
  confidence: number;
  context_window: string;
  redacted_at: string;
}

export interface TokenBudget {
  id: string;
  scope_type: 'user' | 'department' | 'model' | 'application';
  scope_id: string;
  scope_name: string;
  daily_limit: number;
  weekly_limit: number;
  monthly_limit: number;
  daily_used: number;
  weekly_used: number;
  monthly_used: number;
  cost_limit_usd: number;
  cost_used_usd: number;
  alert_threshold_pct: number;
  hard_limit_pct: number;
  status: 'active' | 'warning' | 'throttled' | 'blocked';
  last_reset_at: string;
}

export interface ModelAccessRule {
  id: string;
  model_name: string;
  model_provider: string;
  model_version: string;
  risk_tier: 'tier1_internal' | 'tier2_commercial' | 'tier3_open_source' | 'tier4_experimental';
  allowed_roles: string[];
  allowed_departments: string[];
  requires_approval: boolean;
  approval_chain: any[];
  max_context_window: number;
  allowed_use_cases: string[];
  blocked_topics: string[];
  data_classification_max: string;
  status: 'approved' | 'under_review' | 'deprecated' | 'banned';
  approved_by: string;
  usage_count: number;
  last_used_at: string | null;
  notes: string;
  created_at: string;
}

export interface GuardrailIncident {
  id: string;
  incident_type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  user_id: string;
  user_email: string;
  policy_id: string | null;
  scan_id: string | null;
  title: string;
  description: string;
  evidence: any;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  assigned_to: string;
  resolved_at: string | null;
  resolution_notes: string;
  created_at: string;
}

export const POLICY_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  prompt_injection: { label: 'Prompt Injection', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  content_filter: { label: 'Content Filter', color: 'text-orange-400', bgColor: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
  pii_redaction: { label: 'PII Redaction', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  rate_limit: { label: 'Rate Limit', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
  cost_limit: { label: 'Cost Limit', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  output_filter: { label: 'Output Filter', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
  topic_block: { label: 'Topic Block', color: 'text-rose-400', bgColor: 'bg-rose-500/10', borderColor: 'border-rose-500/20' },
  model_access: { label: 'Model Access', color: 'text-teal-400', bgColor: 'bg-teal-500/10', borderColor: 'border-teal-500/20' },
};

export const VERDICT_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  pass: { label: 'Pass', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  warn: { label: 'Warned', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  block: { label: 'Blocked', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
  redact: { label: 'Redacted', color: 'text-cyan-400', bgColor: 'bg-cyan-500/10', borderColor: 'border-cyan-500/20' },
};

export const TIER_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string; icon: string }> = {
  tier1_internal: { label: 'Tier 1 - Internal', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20', icon: 'shield-check' },
  tier2_commercial: { label: 'Tier 2 - Commercial', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/20', icon: 'building' },
  tier3_open_source: { label: 'Tier 3 - Open Source', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20', icon: 'code' },
  tier4_experimental: { label: 'Tier 4 - Experimental', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20', icon: 'flask' },
};

export const MODEL_STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; borderColor: string }> = {
  approved: { label: 'Approved', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' },
  under_review: { label: 'Under Review', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' },
  deprecated: { label: 'Deprecated', color: 'text-slate-400', bgColor: 'bg-slate-500/10', borderColor: 'border-slate-500/20' },
  banned: { label: 'Banned', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' },
};
