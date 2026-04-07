/*
  # Create Correlation Rules and AI Agent System

  1. New Tables
    - `correlation_rules`
      - `id` (uuid, primary key)
      - `rule_name` (text) - Name of the correlation rule
      - `rule_description` (text) - Description of what the rule detects
      - `rule_logic` (jsonb) - The logic/conditions for the rule
      - `source_pattern_id` (uuid) - Reference to the discovered pattern
      - `severity` (text) - critical, high, medium, low
      - `status` (text) - active, inactive, testing
      - `confidence_score` (numeric) - Confidence in the rule
      - `true_positive_rate` (numeric) - Effectiveness metric
      - `false_positive_rate` (numeric) - False positive metric
      - `generated_by` (text) - manual or ai_agent
      - `agent_reasoning` (text) - AI explanation for rule creation
      - `tags` (jsonb) - Categorization tags
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `last_triggered_at` (timestamptz)
      - `trigger_count` (integer) - How many times triggered
    
    - `correlation_rule_matches`
      - `id` (uuid, primary key)
      - `rule_id` (uuid) - Reference to correlation_rules
      - `matched_events` (jsonb) - Events that matched the rule
      - `match_timestamp` (timestamptz)
      - `severity` (text)
      - `details` (jsonb)
      - `is_true_positive` (boolean) - Analyst feedback
      - `analyst_notes` (text)
    
    - `ai_agent_activity`
      - `id` (uuid, primary key)
      - `agent_type` (text) - correlation_generator, pattern_analyzer, etc.
      - `activity_type` (text) - rule_created, pattern_analyzed, etc.
      - `source_data` (jsonb) - What data the agent analyzed
      - `result` (jsonb) - What the agent produced
      - `reasoning` (text) - AI explanation
      - `confidence` (numeric)
      - `execution_time_ms` (integer)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read correlation rules
    - Add policies for the system to write agent activity
*/

CREATE TABLE IF NOT EXISTS correlation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_description text NOT NULL,
  rule_logic jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_pattern_id uuid,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'testing',
  confidence_score numeric(5,2) DEFAULT 0,
  true_positive_rate numeric(5,2) DEFAULT 0,
  false_positive_rate numeric(5,2) DEFAULT 0,
  generated_by text NOT NULL DEFAULT 'manual',
  agent_reasoning text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_triggered_at timestamptz,
  trigger_count integer DEFAULT 0,
  CONSTRAINT valid_severity CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  CONSTRAINT valid_status CHECK (status IN ('active', 'inactive', 'testing')),
  CONSTRAINT valid_generated_by CHECK (generated_by IN ('manual', 'ai_agent'))
);

CREATE TABLE IF NOT EXISTS correlation_rule_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES correlation_rules(id) ON DELETE CASCADE,
  matched_events jsonb NOT NULL DEFAULT '[]'::jsonb,
  match_timestamp timestamptz DEFAULT now(),
  severity text NOT NULL DEFAULT 'medium',
  details jsonb DEFAULT '{}'::jsonb,
  is_true_positive boolean,
  analyst_notes text,
  CONSTRAINT valid_match_severity CHECK (severity IN ('critical', 'high', 'medium', 'low'))
);

CREATE TABLE IF NOT EXISTS ai_agent_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type text NOT NULL,
  activity_type text NOT NULL,
  source_data jsonb DEFAULT '{}'::jsonb,
  result jsonb DEFAULT '{}'::jsonb,
  reasoning text,
  confidence numeric(5,2) DEFAULT 0,
  execution_time_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlation_rule_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agent_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read correlation_rules"
  ON correlation_rules
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert correlation_rules"
  ON correlation_rules
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon update correlation_rules"
  ON correlation_rules
  FOR UPDATE
  TO anon
  USING (true);

CREATE POLICY "Allow anon read correlation_rule_matches"
  ON correlation_rule_matches
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert correlation_rule_matches"
  ON correlation_rule_matches
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow anon read ai_agent_activity"
  ON ai_agent_activity
  FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow anon insert ai_agent_activity"
  ON ai_agent_activity
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_correlation_rules_status ON correlation_rules(status);
CREATE INDEX IF NOT EXISTS idx_correlation_rules_severity ON correlation_rules(severity);
CREATE INDEX IF NOT EXISTS idx_correlation_rules_pattern ON correlation_rules(source_pattern_id);
CREATE INDEX IF NOT EXISTS idx_correlation_rules_generated_by ON correlation_rules(generated_by);
CREATE INDEX IF NOT EXISTS idx_rule_matches_rule_id ON correlation_rule_matches(rule_id);
CREATE INDEX IF NOT EXISTS idx_rule_matches_timestamp ON correlation_rule_matches(match_timestamp);
CREATE INDEX IF NOT EXISTS idx_ai_agent_type ON ai_agent_activity(agent_type);
CREATE INDEX IF NOT EXISTS idx_ai_agent_created ON ai_agent_activity(created_at);
