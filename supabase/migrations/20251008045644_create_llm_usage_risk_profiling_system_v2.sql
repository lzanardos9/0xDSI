/*
  # LLM Usage Risk Profiling System

  1. New Tables
    - `llm_interactions` - Tracks every LLM interaction
    - `llm_risk_profiles` - Per-user risk profiles
    - `llm_risk_rules` - Configurable risk detection rules
    - `llm_risk_incidents` - Risk incidents requiring review

  2. Security
    - Enable RLS on all tables
    - Allow anonymous access for demo purposes
*/

-- LLM Interactions Table
CREATE TABLE IF NOT EXISTS llm_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  timestamp timestamptz DEFAULT now(),
  
  prompt_text text NOT NULL,
  prompt_tokens integer NOT NULL,
  response_text text,
  response_tokens integer,
  model_name text NOT NULL,
  model_version text,
  
  contains_pii boolean DEFAULT false,
  contains_credentials boolean DEFAULT false,
  contains_proprietary_data boolean DEFAULT false,
  contains_code boolean DEFAULT false,
  is_jailbreak_attempt boolean DEFAULT false,
  is_data_exfiltration boolean DEFAULT false,
  
  data_sensitivity_level text CHECK (data_sensitivity_level IN ('public', 'internal', 'confidential', 'restricted')) DEFAULT 'internal',
  
  interaction_risk_score integer DEFAULT 0 CHECK (interaction_risk_score >= 0 AND interaction_risk_score <= 100),
  risk_factors jsonb DEFAULT '[]'::jsonb,
  
  application_context text,
  ip_address inet,
  user_agent text,
  geo_location text,
  
  flagged_for_review boolean DEFAULT false,
  reviewed boolean DEFAULT false,
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  
  created_at timestamptz DEFAULT now()
);

-- LLM Risk Profiles Table
CREATE TABLE IF NOT EXISTS llm_risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  
  user_email text NOT NULL,
  user_name text NOT NULL,
  department text,
  role_title text,
  
  current_risk_score integer DEFAULT 0 CHECK (current_risk_score >= 0 AND current_risk_score <= 100),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')) DEFAULT 'low',
  risk_trend text CHECK (risk_trend IN ('decreasing', 'stable', 'increasing', 'rapidly_increasing')) DEFAULT 'stable',
  
  total_interactions integer DEFAULT 0,
  high_risk_interactions integer DEFAULT 0,
  flagged_interactions integer DEFAULT 0,
  average_session_duration_minutes numeric DEFAULT 0,
  
  typical_usage_hours integer[] DEFAULT ARRAY[9,10,11,12,13,14,15,16,17],
  typical_models text[] DEFAULT ARRAY[]::text[],
  average_tokens_per_prompt integer DEFAULT 0,
  
  has_anomalous_behavior boolean DEFAULT false,
  anomaly_types jsonb DEFAULT '[]'::jsonb,
  last_anomaly_detected_at timestamptz,
  
  pii_exposure_risk integer DEFAULT 0,
  credential_exposure_risk integer DEFAULT 0,
  data_exfiltration_risk integer DEFAULT 0,
  policy_violation_risk integer DEFAULT 0,
  jailbreak_attempt_risk integer DEFAULT 0,
  
  is_escalated boolean DEFAULT false,
  escalated_at timestamptz,
  escalation_reason text,
  assigned_to uuid,
  
  profile_updated_at timestamptz DEFAULT now(),
  first_interaction_at timestamptz DEFAULT now(),
  last_interaction_at timestamptz DEFAULT now(),
  
  created_at timestamptz DEFAULT now()
);

-- LLM Risk Rules Table
CREATE TABLE IF NOT EXISTS llm_risk_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  rule_name text NOT NULL,
  rule_description text,
  rule_type text CHECK (rule_type IN ('pattern', 'threshold', 'anomaly', 'ml_model')) NOT NULL,
  
  pattern_regex text,
  threshold_value numeric,
  threshold_operator text CHECK (threshold_operator IN ('gt', 'lt', 'eq', 'gte', 'lte')),
  anomaly_deviation_factor numeric,
  
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
  risk_points integer NOT NULL DEFAULT 10,
  auto_escalate boolean DEFAULT false,
  
  is_active boolean DEFAULT true,
  category text NOT NULL,
  tags text[] DEFAULT ARRAY[]::text[],
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- LLM Risk Incidents Table
CREATE TABLE IF NOT EXISTS llm_risk_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  incident_type text CHECK (incident_type IN ('pii_exposure', 'credential_leak', 'data_exfiltration', 'jailbreak', 'policy_violation', 'anomalous_behavior', 'other')) NOT NULL,
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
  
  user_id uuid NOT NULL,
  interaction_ids uuid[] DEFAULT ARRAY[]::uuid[],
  profile_id uuid,
  triggered_rule_ids uuid[] DEFAULT ARRAY[]::uuid[],
  
  title text NOT NULL,
  description text NOT NULL,
  risk_score integer NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb,
  
  status text CHECK (status IN ('open', 'investigating', 'resolved', 'false_positive', 'escalated')) DEFAULT 'open',
  assigned_to uuid,
  assigned_at timestamptz,
  priority integer DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),
  
  resolution text,
  resolved_at timestamptz,
  resolved_by uuid,
  actions_taken text,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_llm_interactions_user_id ON llm_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_interactions_timestamp ON llm_interactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_llm_interactions_risk_score ON llm_interactions(interaction_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_llm_interactions_flagged ON llm_interactions(flagged_for_review) WHERE flagged_for_review = true;

CREATE INDEX IF NOT EXISTS idx_llm_risk_profiles_user_id ON llm_risk_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_risk_profiles_risk_level ON llm_risk_profiles(risk_level);
CREATE INDEX IF NOT EXISTS idx_llm_risk_profiles_escalated ON llm_risk_profiles(is_escalated) WHERE is_escalated = true;

CREATE INDEX IF NOT EXISTS idx_llm_risk_incidents_user_id ON llm_risk_incidents(user_id);
CREATE INDEX IF NOT EXISTS idx_llm_risk_incidents_status ON llm_risk_incidents(status);
CREATE INDEX IF NOT EXISTS idx_llm_risk_incidents_severity ON llm_risk_incidents(severity);

-- Enable RLS
ALTER TABLE llm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_risk_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_risk_incidents ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow anonymous access for demo)
CREATE POLICY "Allow anonymous read access to llm_interactions"
  ON llm_interactions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to llm_risk_profiles"
  ON llm_risk_profiles FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to llm_risk_rules"
  ON llm_risk_rules FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anonymous read access to llm_risk_incidents"
  ON llm_risk_incidents FOR SELECT
  TO anon
  USING (true);
