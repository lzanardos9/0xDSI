/*
  # Add Pattern Discovery System

  1. New Tables
    - `discovery_profiles`
      - `id` (uuid, primary key)
      - `name` (text) - Profile name
      - `description` (text) - What this profile searches for
      - `profile_type` (text) - unknown_threats, baseline_establishment, anomaly_detection, sequence_analysis
      - `event_criteria` (jsonb) - Criteria for events to analyze
      - `sequence_length_min` (integer) - Minimum event sequence length
      - `sequence_length_max` (integer) - Maximum event sequence length
      - `occurrence_threshold` (integer) - Minimum occurrences to flag as pattern
      - `time_window_hours` (integer) - Analysis time window
      - `enabled` (boolean) - Profile active status
      - `last_run_at` (timestamptz) - Last execution time
      - `next_run_at` (timestamptz) - Scheduled next run
      - `run_frequency_hours` (integer) - How often to run
      - `created_by` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `discovery_snapshots`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, foreign key)
      - `snapshot_name` (text) - Auto-generated name
      - `snapshot_status` (text) - collecting, analyzing, completed, failed
      - `event_count` (integer) - Events collected
      - `time_range_start` (timestamptz) - Snapshot start time
      - `time_range_end` (timestamptz) - Snapshot end time
      - `patterns_discovered` (integer) - Number of patterns found
      - `analysis_duration_ms` (integer) - Processing time
      - `error_message` (text) - If failed
      - `metadata` (jsonb) - Additional snapshot info
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)

    - `discovered_patterns`
      - `id` (uuid, primary key)
      - `snapshot_id` (uuid, foreign key)
      - `profile_id` (uuid, foreign key)
      - `pattern_name` (text) - Auto-generated or custom name
      - `pattern_type` (text) - threat_sequence, anomaly, baseline_deviation, zero_day_indicator
      - `event_sequence` (jsonb) - Array of event types in pattern
      - `occurrence_count` (integer) - How many times seen
      - `confidence_score` (numeric) - Pattern confidence (0-100)
      - `threat_level` (text) - low, medium, high, critical
      - `is_baseline` (boolean) - Normal behavior pattern
      - `is_anomaly` (boolean) - Deviation from baseline
      - `description` (text) - Pattern description
      - `event_ids` (jsonb) - Sample event IDs
      - `graph_data` (jsonb) - 3D visualization data
      - `investigated` (boolean) - Analyst reviewed
      - `rule_created` (boolean) - Rule generated from pattern
      - `rule_id` (uuid) - Reference to created rule
      - `alert_triggered` (boolean) - Generated alert
      - `tags` (jsonb) - Classification tags
      - `first_seen` (timestamptz)
      - `last_seen` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `pattern_investigations`
      - `id` (uuid, primary key)
      - `pattern_id` (uuid, foreign key)
      - `investigator` (text) - Analyst name
      - `investigation_status` (text) - open, in_progress, completed, false_positive
      - `findings` (text) - Investigation notes
      - `severity_assessment` (text) - Assessed threat level
      - `recommended_actions` (jsonb) - Suggested responses
      - `related_patterns` (jsonb) - Connected pattern IDs
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `pattern_baselines`
      - `id` (uuid, primary key)
      - `profile_id` (uuid, foreign key)
      - `baseline_name` (text) - Baseline identifier
      - `event_patterns` (jsonb) - Normal patterns
      - `statistical_data` (jsonb) - Mean, stddev, etc.
      - `confidence_interval` (numeric) - Baseline confidence
      - `sample_size` (integer) - Events in baseline
      - `valid_from` (timestamptz) - Baseline start date
      - `valid_until` (timestamptz) - Baseline expiry
      - `auto_update` (boolean) - Continuously update
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users

  3. Indexes
    - Optimize for pattern queries
    - Time-based lookups
*/

-- Discovery Profiles table
CREATE TABLE IF NOT EXISTS discovery_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  profile_type text NOT NULL,
  event_criteria jsonb DEFAULT '{}'::jsonb,
  sequence_length_min integer DEFAULT 2,
  sequence_length_max integer DEFAULT 10,
  occurrence_threshold integer DEFAULT 5,
  time_window_hours integer DEFAULT 24,
  enabled boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  run_frequency_hours integer DEFAULT 24,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_profile_type CHECK (profile_type IN ('unknown_threats', 'baseline_establishment', 'anomaly_detection', 'sequence_analysis'))
);

-- Discovery Snapshots table
CREATE TABLE IF NOT EXISTS discovery_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES discovery_profiles(id) ON DELETE CASCADE,
  snapshot_name text NOT NULL,
  snapshot_status text NOT NULL DEFAULT 'collecting',
  event_count integer DEFAULT 0,
  time_range_start timestamptz NOT NULL,
  time_range_end timestamptz NOT NULL,
  patterns_discovered integer DEFAULT 0,
  analysis_duration_ms integer,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT valid_snapshot_status CHECK (snapshot_status IN ('collecting', 'analyzing', 'completed', 'failed'))
);

-- Discovered Patterns table
CREATE TABLE IF NOT EXISTS discovered_patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid NOT NULL REFERENCES discovery_snapshots(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES discovery_profiles(id) ON DELETE CASCADE,
  pattern_name text NOT NULL,
  pattern_type text NOT NULL,
  event_sequence jsonb DEFAULT '[]'::jsonb,
  occurrence_count integer DEFAULT 0,
  confidence_score numeric(5,2) DEFAULT 0,
  threat_level text DEFAULT 'low',
  is_baseline boolean DEFAULT false,
  is_anomaly boolean DEFAULT false,
  description text,
  event_ids jsonb DEFAULT '[]'::jsonb,
  graph_data jsonb DEFAULT '{}'::jsonb,
  investigated boolean DEFAULT false,
  rule_created boolean DEFAULT false,
  rule_id uuid,
  alert_triggered boolean DEFAULT false,
  tags jsonb DEFAULT '[]'::jsonb,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_pattern_type CHECK (pattern_type IN ('threat_sequence', 'anomaly', 'baseline_deviation', 'zero_day_indicator')),
  CONSTRAINT valid_threat_level CHECK (threat_level IN ('low', 'medium', 'high', 'critical'))
);

-- Pattern Investigations table
CREATE TABLE IF NOT EXISTS pattern_investigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id uuid NOT NULL REFERENCES discovered_patterns(id) ON DELETE CASCADE,
  investigator text NOT NULL,
  investigation_status text NOT NULL DEFAULT 'open',
  findings text,
  severity_assessment text,
  recommended_actions jsonb DEFAULT '[]'::jsonb,
  related_patterns jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_investigation_status CHECK (investigation_status IN ('open', 'in_progress', 'completed', 'false_positive'))
);

-- Pattern Baselines table
CREATE TABLE IF NOT EXISTS pattern_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES discovery_profiles(id) ON DELETE CASCADE,
  baseline_name text NOT NULL,
  event_patterns jsonb DEFAULT '[]'::jsonb,
  statistical_data jsonb DEFAULT '{}'::jsonb,
  confidence_interval numeric(5,2) DEFAULT 95.0,
  sample_size integer DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  auto_update boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_discovery_profiles_enabled ON discovery_profiles(enabled);
CREATE INDEX IF NOT EXISTS idx_discovery_profiles_next_run ON discovery_profiles(next_run_at);
CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_profile_id ON discovery_snapshots(profile_id);
CREATE INDEX IF NOT EXISTS idx_discovery_snapshots_status ON discovery_snapshots(snapshot_status);
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_snapshot_id ON discovered_patterns(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_profile_id ON discovered_patterns(profile_id);
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_threat_level ON discovered_patterns(threat_level);
CREATE INDEX IF NOT EXISTS idx_discovered_patterns_investigated ON discovered_patterns(investigated);
CREATE INDEX IF NOT EXISTS idx_pattern_investigations_pattern_id ON pattern_investigations(pattern_id);
CREATE INDEX IF NOT EXISTS idx_pattern_baselines_profile_id ON pattern_baselines(profile_id);

-- Enable Row Level Security
ALTER TABLE discovery_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovered_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_investigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pattern_baselines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for discovery_profiles
CREATE POLICY "Allow authenticated users to read discovery profiles"
  ON discovery_profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert discovery profiles"
  ON discovery_profiles FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update discovery profiles"
  ON discovery_profiles FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for discovery_snapshots
CREATE POLICY "Allow authenticated users to read discovery snapshots"
  ON discovery_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert discovery snapshots"
  ON discovery_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update discovery snapshots"
  ON discovery_snapshots FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for discovered_patterns
CREATE POLICY "Allow authenticated users to read discovered patterns"
  ON discovered_patterns FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert discovered patterns"
  ON discovered_patterns FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update discovered patterns"
  ON discovered_patterns FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for pattern_investigations
CREATE POLICY "Allow authenticated users to read pattern investigations"
  ON pattern_investigations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert pattern investigations"
  ON pattern_investigations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update pattern investigations"
  ON pattern_investigations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for pattern_baselines
CREATE POLICY "Allow authenticated users to read pattern baselines"
  ON pattern_baselines FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert pattern baselines"
  ON pattern_baselines FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update pattern baselines"
  ON pattern_baselines FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_pattern_discovery_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_discovery_profiles_updated_at
  BEFORE UPDATE ON discovery_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_discovery_timestamp();

CREATE TRIGGER trigger_discovered_patterns_updated_at
  BEFORE UPDATE ON discovered_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_discovery_timestamp();

CREATE TRIGGER trigger_pattern_investigations_updated_at
  BEFORE UPDATE ON pattern_investigations
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_discovery_timestamp();

CREATE TRIGGER trigger_pattern_baselines_updated_at
  BEFORE UPDATE ON pattern_baselines
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_discovery_timestamp();

-- Function to update snapshot pattern count
CREATE OR REPLACE FUNCTION update_snapshot_pattern_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE discovery_snapshots
    SET patterns_discovered = patterns_discovered + 1
    WHERE id = NEW.snapshot_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_update_snapshot_pattern_count
  AFTER INSERT ON discovered_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_snapshot_pattern_count();
