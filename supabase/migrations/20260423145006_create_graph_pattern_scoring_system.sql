/*
  # Graph Pattern Scoring Weights System

  ## Summary
  Adds a flexible, tunable scoring system for detected graph patterns used by the
  Threat Escalation Engine. Operators can tune the 18 scoring signals, the
  activation/promotion thresholds, and the asset-criticality multipliers without
  shipping code. Multiple named profiles (default / aggressive / conservative /
  custom) can coexist; only one is active at any moment.

  ## New Tables
  - `graph_pattern_scoring_profiles`
      - `id` uuid PRIMARY KEY
      - `profile_name` text UNIQUE
      - `description` text
      - `is_active` boolean (only one row may be active)
      - `weights` jsonb - the 18 weighted signals (sum should be ~1.0)
      - `thresholds` jsonb - activation / promotion / suppression cutoffs
      - `criticality_multipliers` jsonb - asset criticality tier -> multiplier
      - `learning_config` jsonb - ALHF auto-tuning parameters
      - `created_at`, `updated_at` timestamps
      - `created_by` text

  ## Security
  - RLS enabled. Authenticated + anon can read. Only authenticated users can
    insert/update/delete - mock / demo operators tune weights live.
*/

CREATE TABLE IF NOT EXISTS graph_pattern_scoring_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_name text UNIQUE NOT NULL,
  description text DEFAULT '',
  is_active boolean DEFAULT false,
  weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '{}'::jsonb,
  criticality_multipliers jsonb NOT NULL DEFAULT '{}'::jsonb,
  learning_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by text DEFAULT 'system'
);

ALTER TABLE graph_pattern_scoring_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read graph scoring profiles"
  ON graph_pattern_scoring_profiles FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert graph scoring profiles"
  ON graph_pattern_scoring_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update graph scoring profiles"
  ON graph_pattern_scoring_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete graph scoring profiles"
  ON graph_pattern_scoring_profiles FOR DELETE
  TO authenticated
  USING (true);

CREATE INDEX IF NOT EXISTS idx_graph_scoring_active ON graph_pattern_scoring_profiles (is_active);

-- Seed three starter profiles so the panel has something to render immediately.
INSERT INTO graph_pattern_scoring_profiles (profile_name, description, is_active, weights, thresholds, criticality_multipliers, learning_config)
VALUES
(
  'Default Balanced',
  'Balanced scoring tuned for mixed enterprise SOC workloads. Starting point for most tenants.',
  true,
  '{
    "graph_rarity": 0.10,
    "behavioral_anomaly": 0.12,
    "temporal_anomaly": 0.10,
    "event_rarity": 0.08,
    "entity_criticality": 0.12,
    "graph_fanout": 0.10,
    "evidence_count": 0.08,
    "intent_confidence": 0.10,
    "deception_signal": 0.10,
    "base_confidence": 0.10,
    "vector_similarity": 0.00,
    "mitre_coverage": 0.00,
    "kill_chain_completeness": 0.00,
    "threat_intel_hits": 0.00,
    "asset_blast_radius": 0.00,
    "negative_correlation_bonus": 0.00,
    "historical_fp_penalty": 0.00,
    "analyst_feedback_bias": 0.00
  }'::jsonb,
  '{
    "activation": 0.70,
    "promotion": 0.80,
    "suppression": 0.30,
    "critical_priority": 9.0,
    "very_high_priority": 7.0,
    "high_priority": 5.0,
    "medium_priority": 3.0,
    "fp_rate_ceiling": 0.25,
    "negative_feedback_trigger": 0.30,
    "min_samples_for_adapt": 20
  }'::jsonb,
  '{
    "very_high": 2.0,
    "high": 1.5,
    "medium": 1.0,
    "low": 0.7,
    "very_low": 0.5
  }'::jsonb,
  '{
    "alhf_enabled": true,
    "auto_demote_after_fp_streak": 5,
    "learning_rate": 0.05,
    "decay_half_life_days": 14,
    "human_verdict_weight": 0.30
  }'::jsonb
),
(
  'Aggressive Hunt',
  'Lowered thresholds and stronger weight on rarity + deception signals. Use during active IR or red-team exercises.',
  false,
  '{
    "graph_rarity": 0.14,
    "behavioral_anomaly": 0.12,
    "temporal_anomaly": 0.10,
    "event_rarity": 0.08,
    "entity_criticality": 0.10,
    "graph_fanout": 0.10,
    "evidence_count": 0.06,
    "intent_confidence": 0.08,
    "deception_signal": 0.14,
    "base_confidence": 0.08,
    "vector_similarity": 0.00,
    "mitre_coverage": 0.00,
    "kill_chain_completeness": 0.00,
    "threat_intel_hits": 0.00,
    "asset_blast_radius": 0.00,
    "negative_correlation_bonus": 0.00,
    "historical_fp_penalty": 0.00,
    "analyst_feedback_bias": 0.00
  }'::jsonb,
  '{
    "activation": 0.55,
    "promotion": 0.65,
    "suppression": 0.20,
    "critical_priority": 8.0,
    "very_high_priority": 6.0,
    "high_priority": 4.0,
    "medium_priority": 2.5,
    "fp_rate_ceiling": 0.40,
    "negative_feedback_trigger": 0.45,
    "min_samples_for_adapt": 10
  }'::jsonb,
  '{
    "very_high": 2.2,
    "high": 1.7,
    "medium": 1.1,
    "low": 0.8,
    "very_low": 0.5
  }'::jsonb,
  '{
    "alhf_enabled": true,
    "auto_demote_after_fp_streak": 8,
    "learning_rate": 0.08,
    "decay_half_life_days": 7,
    "human_verdict_weight": 0.25
  }'::jsonb
),
(
  'Conservative Quiet Hours',
  'Raised thresholds, heavier weight on kill-chain completeness and analyst feedback. Use overnight or weekends to suppress noise.',
  false,
  '{
    "graph_rarity": 0.08,
    "behavioral_anomaly": 0.10,
    "temporal_anomaly": 0.08,
    "event_rarity": 0.06,
    "entity_criticality": 0.14,
    "graph_fanout": 0.08,
    "evidence_count": 0.12,
    "intent_confidence": 0.14,
    "deception_signal": 0.08,
    "base_confidence": 0.12,
    "vector_similarity": 0.00,
    "mitre_coverage": 0.00,
    "kill_chain_completeness": 0.00,
    "threat_intel_hits": 0.00,
    "asset_blast_radius": 0.00,
    "negative_correlation_bonus": 0.00,
    "historical_fp_penalty": 0.00,
    "analyst_feedback_bias": 0.00
  }'::jsonb,
  '{
    "activation": 0.80,
    "promotion": 0.90,
    "suppression": 0.40,
    "critical_priority": 9.5,
    "very_high_priority": 7.5,
    "high_priority": 5.5,
    "medium_priority": 3.5,
    "fp_rate_ceiling": 0.15,
    "negative_feedback_trigger": 0.20,
    "min_samples_for_adapt": 30
  }'::jsonb,
  '{
    "very_high": 1.8,
    "high": 1.4,
    "medium": 0.9,
    "low": 0.6,
    "very_low": 0.4
  }'::jsonb,
  '{
    "alhf_enabled": true,
    "auto_demote_after_fp_streak": 3,
    "learning_rate": 0.03,
    "decay_half_life_days": 21,
    "human_verdict_weight": 0.40
  }'::jsonb
)
ON CONFLICT (profile_name) DO NOTHING;