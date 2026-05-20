/*
  # Stateful Agent Backdoor Defense System

  Implements three detection layers against cross-session stateful backdoor attacks
  (ref: arXiv:2605.06158 - Stateful Agent Backdoor).

  1. New Tables
    - `memory_integrity_events` - tracks all agent memory writes with integrity hashing
    - `behavioral_divergence_detections` - detects tool-conditional behavior shifts
    - `trigger_canary_deployments` - canary strings planted to detect memory persistence attacks
    - `stateful_backdoor_correlation_rules` - detection rules targeting Mealy machine patterns

  2. Security
    - Enable RLS on all tables
    - Authenticated users can read and write
*/

-- Memory Integrity Events
CREATE TABLE IF NOT EXISTS memory_integrity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  session_id text NOT NULL,
  memory_key text NOT NULL,
  content_hash text NOT NULL,
  content_preview text DEFAULT '',
  task_context text DEFAULT '',
  relevance_score numeric DEFAULT 0,
  anomaly_flags jsonb DEFAULT '[]'::jsonb,
  verdict text NOT NULL DEFAULT 'clean',
  chain_hash text DEFAULT '',
  previous_hash text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE memory_integrity_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read memory integrity"
  ON memory_integrity_events FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert memory integrity"
  ON memory_integrity_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Behavioral Divergence Detections
CREATE TABLE IF NOT EXISTS behavioral_divergence_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL,
  baseline_session_id text NOT NULL,
  divergent_session_id text NOT NULL,
  tool_config_baseline jsonb DEFAULT '[]'::jsonb,
  tool_config_divergent jsonb DEFAULT '[]'::jsonb,
  behavior_baseline jsonb DEFAULT '{}'::jsonb,
  behavior_divergent jsonb DEFAULT '{}'::jsonb,
  divergence_score numeric DEFAULT 0,
  mealy_signature_match boolean DEFAULT false,
  attack_phase_estimate text DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'investigating',
  analyst_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE behavioral_divergence_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read behavioral divergence"
  ON behavioral_divergence_detections FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert behavioral divergence"
  ON behavioral_divergence_detections FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update behavioral divergence"
  ON behavioral_divergence_detections FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Trigger Canary Deployments
CREATE TABLE IF NOT EXISTS trigger_canary_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canary_string text NOT NULL,
  canary_hash text NOT NULL,
  deployment_target text NOT NULL,
  injection_point text NOT NULL DEFAULT 'system_prompt_suffix',
  expected_propagation text NOT NULL DEFAULT 'none',
  actual_propagation text DEFAULT 'none',
  triggered boolean DEFAULT false,
  alert_severity text DEFAULT 'info',
  deployed_at timestamptz DEFAULT now(),
  last_checked_at timestamptz DEFAULT now()
);

ALTER TABLE trigger_canary_deployments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read canary deployments"
  ON trigger_canary_deployments FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert canary deployments"
  ON trigger_canary_deployments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update canary deployments"
  ON trigger_canary_deployments FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Stateful Backdoor Correlation Rules
CREATE TABLE IF NOT EXISTS stateful_backdoor_correlation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  description text NOT NULL DEFAULT '',
  detection_logic jsonb DEFAULT '{}'::jsonb,
  attack_phase_coverage text[] DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  enabled boolean DEFAULT true,
  last_triggered_at timestamptz,
  trigger_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE stateful_backdoor_correlation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read backdoor rules"
  ON stateful_backdoor_correlation_rules FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated insert backdoor rules"
  ON stateful_backdoor_correlation_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated update backdoor rules"
  ON stateful_backdoor_correlation_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_memory_integrity_agent ON memory_integrity_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_memory_integrity_verdict ON memory_integrity_events(verdict);
CREATE INDEX IF NOT EXISTS idx_memory_integrity_created ON memory_integrity_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_divergence_agent ON behavioral_divergence_detections(agent_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_divergence_mealy ON behavioral_divergence_detections(mealy_signature_match);
CREATE INDEX IF NOT EXISTS idx_canary_triggered ON trigger_canary_deployments(triggered);
CREATE INDEX IF NOT EXISTS idx_canary_target ON trigger_canary_deployments(deployment_target);
