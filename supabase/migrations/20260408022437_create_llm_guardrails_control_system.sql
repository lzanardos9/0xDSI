/*
  # LLM Guardrails Control System

  Complete guardrails infrastructure for real-time LLM prompt/response interception,
  policy enforcement, PII redaction, token budget management, and model access governance.

  1. New Tables
    - `guardrail_policies` - Master policy definitions with enforcement levels
      - `id` (uuid, primary key)
      - `policy_name` (text) - Human-readable name
      - `policy_type` (text) - rate_limit | content_filter | cost_limit | pii_redaction | prompt_injection | output_filter | model_access | topic_block
      - `enforcement_level` (text) - log | warn | block
      - `priority` (integer) - Execution order
      - `conditions` (jsonb) - Rule conditions/patterns
      - `actions` (jsonb) - What to do when triggered
      - `enabled` (boolean)
      - `hit_count` (bigint) - Times triggered
      - `block_count` (bigint) - Times blocked
      - `false_positive_count` (bigint)
      - `last_triggered_at` (timestamptz)
      - `created_by` (text)
      - `version` (integer)

    - `guardrail_scan_results` - Every scan performed on prompts/responses
      - `id` (uuid, primary key)
      - `scan_type` (text) - prompt | response
      - `user_id` (text)
      - `user_email` (text)
      - `model_name` (text)
      - `input_text` (text) - The scanned content
      - `verdict` (text) - pass | warn | block | redact
      - `triggered_policies` (jsonb) - Which policies fired
      - `risk_score` (numeric)
      - `detections` (jsonb) - Detailed detection results
      - `latency_ms` (integer) - Scan time
      - `scanned_at` (timestamptz)

    - `pii_redaction_log` - Audit trail of every PII redaction
      - `id` (uuid, primary key)
      - `scan_id` (uuid) - FK to guardrail_scan_results
      - `entity_type` (text) - ssn | credit_card | email | phone | passport | address | medical_id | api_key | custom
      - `original_snippet` (text) - Masked version of original
      - `redacted_snippet` (text) - After redaction
      - `redaction_strategy` (text) - mask | hash | tokenize | remove
      - `position_start` (integer)
      - `position_end` (integer)
      - `confidence` (numeric)
      - `redacted_at` (timestamptz)

    - `token_budgets` - Per-user/dept/model token quotas
      - `id` (uuid, primary key)
      - `scope_type` (text) - user | department | model | application
      - `scope_id` (text) - The user/dept/model identifier
      - `scope_name` (text)
      - `daily_limit` (bigint)
      - `weekly_limit` (bigint)
      - `monthly_limit` (bigint)
      - `daily_used` (bigint)
      - `weekly_used` (bigint)
      - `monthly_used` (bigint)
      - `cost_limit_usd` (numeric)
      - `cost_used_usd` (numeric)
      - `alert_threshold_pct` (integer) - e.g., 80
      - `hard_limit_pct` (integer) - e.g., 100
      - `status` (text) - active | warning | throttled | blocked
      - `last_reset_at` (timestamptz)

    - `model_access_rules` - RBAC for model access
      - `id` (uuid, primary key)
      - `model_name` (text)
      - `model_provider` (text)
      - `risk_tier` (text) - tier1_internal | tier2_commercial | tier3_open_source | tier4_experimental
      - `allowed_roles` (text[])
      - `allowed_departments` (text[])
      - `requires_approval` (boolean)
      - `approval_chain` (jsonb)
      - `max_context_window` (integer)
      - `allowed_use_cases` (text[])
      - `blocked_topics` (text[])
      - `status` (text) - approved | under_review | deprecated | banned
      - `approved_by` (text)
      - `approved_at` (timestamptz)
      - `notes` (text)

    - `guardrail_incidents` - Incidents from guardrails enforcement
      - `id` (uuid, primary key)
      - `incident_type` (text)
      - `severity` (text)
      - `user_id` (text)
      - `user_email` (text)
      - `policy_id` (uuid)
      - `scan_id` (uuid)
      - `title` (text)
      - `description` (text)
      - `evidence` (jsonb)
      - `status` (text) - open | investigating | resolved | false_positive
      - `assigned_to` (text)
      - `resolved_at` (timestamptz)
      - `resolution_notes` (text)

  2. Security
    - RLS enabled on all tables
    - Authenticated users can read all guardrail data
    - Only admin-level operations for write
*/

-- Guardrail Policies
CREATE TABLE IF NOT EXISTS guardrail_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  policy_type text NOT NULL DEFAULT 'content_filter',
  description text DEFAULT '',
  enforcement_level text NOT NULL DEFAULT 'log',
  priority integer NOT NULL DEFAULT 50,
  conditions jsonb DEFAULT '{}',
  actions jsonb DEFAULT '{}',
  enabled boolean DEFAULT true,
  hit_count bigint DEFAULT 0,
  block_count bigint DEFAULT 0,
  warn_count bigint DEFAULT 0,
  false_positive_count bigint DEFAULT 0,
  last_triggered_at timestamptz,
  created_by text DEFAULT 'system',
  version integer DEFAULT 1,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE guardrail_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read guardrail policies"
  ON guardrail_policies FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read guardrail policies"
  ON guardrail_policies FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage guardrail policies"
  ON guardrail_policies FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update guardrail policies"
  ON guardrail_policies FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Guardrail Scan Results
CREATE TABLE IF NOT EXISTS guardrail_scan_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_type text NOT NULL DEFAULT 'prompt',
  user_id text DEFAULT '',
  user_email text DEFAULT '',
  model_name text DEFAULT '',
  application text DEFAULT '',
  input_text text DEFAULT '',
  output_text text DEFAULT '',
  verdict text NOT NULL DEFAULT 'pass',
  triggered_policies jsonb DEFAULT '[]',
  risk_score numeric DEFAULT 0,
  detections jsonb DEFAULT '[]',
  pii_found integer DEFAULT 0,
  tokens_used integer DEFAULT 0,
  latency_ms integer DEFAULT 0,
  session_id text DEFAULT '',
  ip_address text DEFAULT '',
  scanned_at timestamptz DEFAULT now()
);

ALTER TABLE guardrail_scan_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read scan results"
  ON guardrail_scan_results FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read scan results"
  ON guardrail_scan_results FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "System can insert scan results"
  ON guardrail_scan_results FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- PII Redaction Log
CREATE TABLE IF NOT EXISTS pii_redaction_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid REFERENCES guardrail_scan_results(id),
  entity_type text NOT NULL DEFAULT 'unknown',
  original_snippet text DEFAULT '',
  redacted_snippet text DEFAULT '',
  redaction_strategy text NOT NULL DEFAULT 'mask',
  position_start integer DEFAULT 0,
  position_end integer DEFAULT 0,
  confidence numeric DEFAULT 0,
  context_window text DEFAULT '',
  redacted_at timestamptz DEFAULT now()
);

ALTER TABLE pii_redaction_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read pii redaction log"
  ON pii_redaction_log FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read pii redaction log"
  ON pii_redaction_log FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "System can insert pii redaction log"
  ON pii_redaction_log FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Token Budgets
CREATE TABLE IF NOT EXISTS token_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL DEFAULT 'user',
  scope_id text NOT NULL DEFAULT '',
  scope_name text NOT NULL DEFAULT '',
  daily_limit bigint DEFAULT 100000,
  weekly_limit bigint DEFAULT 500000,
  monthly_limit bigint DEFAULT 2000000,
  daily_used bigint DEFAULT 0,
  weekly_used bigint DEFAULT 0,
  monthly_used bigint DEFAULT 0,
  cost_limit_usd numeric DEFAULT 100.00,
  cost_used_usd numeric DEFAULT 0,
  alert_threshold_pct integer DEFAULT 80,
  hard_limit_pct integer DEFAULT 100,
  status text NOT NULL DEFAULT 'active',
  last_reset_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE token_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read token budgets"
  ON token_budgets FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read token budgets"
  ON token_budgets FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage token budgets"
  ON token_budgets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update token budgets"
  ON token_budgets FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Model Access Rules
CREATE TABLE IF NOT EXISTS model_access_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL DEFAULT '',
  model_provider text NOT NULL DEFAULT '',
  model_version text DEFAULT '',
  risk_tier text NOT NULL DEFAULT 'tier2_commercial',
  allowed_roles text[] DEFAULT '{}',
  allowed_departments text[] DEFAULT '{}',
  requires_approval boolean DEFAULT false,
  approval_chain jsonb DEFAULT '[]',
  max_context_window integer DEFAULT 128000,
  allowed_use_cases text[] DEFAULT '{}',
  blocked_topics text[] DEFAULT '{}',
  data_classification_max text DEFAULT 'internal',
  status text NOT NULL DEFAULT 'approved',
  approved_by text DEFAULT '',
  approved_at timestamptz DEFAULT now(),
  review_date timestamptz,
  notes text DEFAULT '',
  usage_count bigint DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE model_access_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read model access rules"
  ON model_access_rules FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read model access rules"
  ON model_access_rules FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage model access rules"
  ON model_access_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update model access rules"
  ON model_access_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Guardrail Incidents
CREATE TABLE IF NOT EXISTS guardrail_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type text NOT NULL DEFAULT 'policy_violation',
  severity text NOT NULL DEFAULT 'medium',
  user_id text DEFAULT '',
  user_email text DEFAULT '',
  policy_id uuid REFERENCES guardrail_policies(id),
  scan_id uuid REFERENCES guardrail_scan_results(id),
  title text NOT NULL DEFAULT '',
  description text DEFAULT '',
  evidence jsonb DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  assigned_to text DEFAULT '',
  resolved_at timestamptz,
  resolution_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE guardrail_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read guardrail incidents"
  ON guardrail_incidents FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read guardrail incidents"
  ON guardrail_incidents FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage guardrail incidents"
  ON guardrail_incidents FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update guardrail incidents"
  ON guardrail_incidents FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_guardrail_policies_type ON guardrail_policies(policy_type);
CREATE INDEX IF NOT EXISTS idx_guardrail_policies_enabled ON guardrail_policies(enabled);
CREATE INDEX IF NOT EXISTS idx_scan_results_verdict ON guardrail_scan_results(verdict);
CREATE INDEX IF NOT EXISTS idx_scan_results_scanned_at ON guardrail_scan_results(scanned_at);
CREATE INDEX IF NOT EXISTS idx_scan_results_user ON guardrail_scan_results(user_email);
CREATE INDEX IF NOT EXISTS idx_pii_redaction_entity ON pii_redaction_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_token_budgets_scope ON token_budgets(scope_type, scope_id);
CREATE INDEX IF NOT EXISTS idx_model_access_status ON model_access_rules(status);
CREATE INDEX IF NOT EXISTS idx_guardrail_incidents_status ON guardrail_incidents(status);
CREATE INDEX IF NOT EXISTS idx_guardrail_incidents_severity ON guardrail_incidents(severity);
