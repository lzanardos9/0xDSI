/*
  # Create Negative Correlation Engine

  A detection system that identifies suspicious activity by finding events that
  SHOULD have occurred but DIDN'T, or events that CANNOT coexist but DO.

  1. New Tables
    - `negative_correlation_rules`
      - `id` (uuid, primary key)
      - `rule_name` (text) - human-readable rule name
      - `rule_code` (text) - unique rule identifier like NC-001
      - `category` (text) - 'missing_prerequisite', 'impossible_coexistence', 'missing_consequence', 'temporal_impossibility', 'physics_violation'
      - `description` (text) - what the rule detects
      - `observed_event` (text) - the event that WAS observed
      - `expected_event` (text) - the event that SHOULD have existed (or SHOULDN'T)
      - `time_window_seconds` (integer) - how long to wait for the expected event
      - `constraint_logic` (text) - human-readable constraint description
      - `constraint_query` (text) - pseudo-SQL or logic expression
      - `severity` (text) - 'critical', 'high', 'medium', 'low'
      - `confidence_base` (numeric) - base confidence score 0-100
      - `mitre_techniques` (text[]) - MITRE ATT&CK technique IDs
      - `false_positive_notes` (text) - known FP scenarios
      - `enabled` (boolean) - whether rule is active
      - `detection_count` (integer) - total times fired
      - `last_fired_at` (timestamptz) - last detection time
      - `created_at` (timestamptz)

    - `negative_correlation_detections`
      - `id` (uuid, primary key)
      - `rule_id` (uuid, FK to negative_correlation_rules)
      - `detection_time` (timestamptz) - when the absence was detected
      - `observed_event_detail` (jsonb) - details of what WAS observed
      - `missing_event_detail` (jsonb) - details of what was EXPECTED but missing
      - `entity_type` (text) - 'user', 'host', 'service', 'network'
      - `entity_id` (text) - the user/host/service involved
      - `confidence_score` (numeric) - calculated confidence
      - `severity` (text) - inherited or calculated severity
      - `status` (text) - 'open', 'investigating', 'confirmed', 'false_positive', 'resolved'
      - `evidence_chain` (jsonb) - array of evidence items
      - `analyst_notes` (text) - analyst comments
      - `time_gap_seconds` (integer) - how long the absence has persisted
      - `physics_violation` (jsonb) - physical constraint violation details
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated + anon read access
    - Authenticated write access for management

  3. Indexes
    - Index on detections by status, severity, rule_id
    - Index on rules by category, enabled
*/

CREATE TABLE IF NOT EXISTS negative_correlation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_code text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'missing_prerequisite',
  description text NOT NULL DEFAULT '',
  observed_event text NOT NULL DEFAULT '',
  expected_event text NOT NULL DEFAULT '',
  time_window_seconds integer NOT NULL DEFAULT 300,
  constraint_logic text NOT NULL DEFAULT '',
  constraint_query text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium',
  confidence_base numeric NOT NULL DEFAULT 75,
  mitre_techniques text[] DEFAULT '{}',
  false_positive_notes text DEFAULT '',
  enabled boolean NOT NULL DEFAULT true,
  detection_count integer NOT NULL DEFAULT 0,
  last_fired_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE negative_correlation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read negative correlation rules"
  ON negative_correlation_rules FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can manage negative correlation rules"
  ON negative_correlation_rules FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can update negative correlation rules"
  ON negative_correlation_rules FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read negative correlation rules"
  ON negative_correlation_rules FOR SELECT TO anon
  USING (true);


CREATE TABLE IF NOT EXISTS negative_correlation_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES negative_correlation_rules(id) ON DELETE CASCADE,
  detection_time timestamptz NOT NULL DEFAULT now(),
  observed_event_detail jsonb NOT NULL DEFAULT '{}',
  missing_event_detail jsonb NOT NULL DEFAULT '{}',
  entity_type text NOT NULL DEFAULT 'user',
  entity_id text NOT NULL DEFAULT '',
  confidence_score numeric NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  evidence_chain jsonb NOT NULL DEFAULT '[]',
  analyst_notes text DEFAULT '',
  time_gap_seconds integer DEFAULT 0,
  physics_violation jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE negative_correlation_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can read negative correlation detections"
  ON negative_correlation_detections FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can manage negative correlation detections"
  ON negative_correlation_detections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can update negative correlation detections"
  ON negative_correlation_detections FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read negative correlation detections"
  ON negative_correlation_detections FOR SELECT TO anon
  USING (true);

CREATE INDEX IF NOT EXISTS idx_neg_corr_rules_category ON negative_correlation_rules(category);
CREATE INDEX IF NOT EXISTS idx_neg_corr_rules_enabled ON negative_correlation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_neg_corr_rules_severity ON negative_correlation_rules(severity);
CREATE INDEX IF NOT EXISTS idx_neg_corr_det_status ON negative_correlation_detections(status);
CREATE INDEX IF NOT EXISTS idx_neg_corr_det_severity ON negative_correlation_detections(severity);
CREATE INDEX IF NOT EXISTS idx_neg_corr_det_rule_id ON negative_correlation_detections(rule_id);
CREATE INDEX IF NOT EXISTS idx_neg_corr_det_detection_time ON negative_correlation_detections(detection_time DESC);
CREATE INDEX IF NOT EXISTS idx_neg_corr_det_entity ON negative_correlation_detections(entity_type, entity_id);
