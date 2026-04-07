/*
  # Add Session Lists System

  1. New Tables
    - `session_lists`
      - `id` (uuid, primary key)
      - `name` (text) - Name of the session list
      - `description` (text) - Purpose and details
      - `list_category` (text) - login_logout, ip_tracking, hostile_activity, operational_monitoring
      - `tracking_attributes` (jsonb) - Array of attributes being tracked (user_id, ip, device, etc.)
      - `time_window_hours` (integer) - Duration to track sessions
      - `rule_driven` (boolean) - Whether populated by rules or manual
      - `correlation_enabled` (boolean) - Enable for rule correlation
      - `entry_count` (integer) - Number of entries in list
      - `created_by` (text) - Creator
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `session_list_entries`
      - `id` (uuid, primary key)
      - `session_list_id` (uuid, foreign key)
      - `session_id` (text) - Session identifier
      - `user_id` (text) - User associated with session
      - `source_ip` (text) - IP address
      - `device_id` (text) - Device identifier
      - `login_time` (timestamptz) - Session start
      - `logout_time` (timestamptz) - Session end
      - `duration_seconds` (integer) - Session duration
      - `event_count` (integer) - Events in this session
      - `risk_score` (numeric) - Calculated risk
      - `status` (text) - active, closed, suspicious, compromised
      - `attributes` (jsonb) - Additional tracked attributes
      - `added_by_rule` (text) - Rule that added this entry
      - `tags` (jsonb) - Classification tags
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `expires_at` (timestamptz) - Auto-removal time

    - `session_list_rules`
      - `id` (uuid, primary key)
      - `session_list_id` (uuid, foreign key)
      - `rule_name` (text) - Name of the rule
      - `rule_description` (text) - What the rule does
      - `event_type_filter` (text) - Which events trigger this
      - `conditions` (jsonb) - Rule conditions
      - `attributes_to_capture` (jsonb) - Which attributes to store
      - `enabled` (boolean) - Rule active status
      - `priority` (integer) - Rule priority
      - `trigger_count` (integer) - Times triggered
      - `last_triggered_at` (timestamptz)
      - `created_by` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `session_correlations`
      - `id` (uuid, primary key)
      - `session_list_id` (uuid, foreign key)
      - `correlation_type` (text) - multiple_ips, suspicious_timing, anomalous_activity, compromised_host
      - `involved_sessions` (jsonb) - Array of session IDs
      - `confidence_score` (numeric) - Correlation confidence
      - `description` (text) - What was found
      - `evidence` (jsonb) - Supporting data
      - `alert_generated` (boolean)
      - `alert_id` (uuid)
      - `reviewed` (boolean)
      - `reviewed_by` (text)
      - `reviewed_at` (timestamptz)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users

  3. Indexes
    - Optimize for time-based queries
    - Session correlation lookups
*/

-- Session Lists table
CREATE TABLE IF NOT EXISTS session_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  list_category text NOT NULL,
  tracking_attributes jsonb DEFAULT '[]'::jsonb,
  time_window_hours integer DEFAULT 720,
  rule_driven boolean DEFAULT true,
  correlation_enabled boolean DEFAULT true,
  entry_count integer DEFAULT 0,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_list_category CHECK (list_category IN ('login_logout', 'ip_tracking', 'hostile_activity', 'operational_monitoring'))
);

-- Session List Entries table
CREATE TABLE IF NOT EXISTS session_list_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_list_id uuid NOT NULL REFERENCES session_lists(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  user_id text,
  source_ip text,
  device_id text,
  login_time timestamptz,
  logout_time timestamptz,
  duration_seconds integer,
  event_count integer DEFAULT 0,
  risk_score numeric(5,2) DEFAULT 0,
  status text DEFAULT 'active',
  attributes jsonb DEFAULT '{}'::jsonb,
  added_by_rule text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  CONSTRAINT valid_status CHECK (status IN ('active', 'closed', 'suspicious', 'compromised'))
);

-- Session List Rules table
CREATE TABLE IF NOT EXISTS session_list_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_list_id uuid NOT NULL REFERENCES session_lists(id) ON DELETE CASCADE,
  rule_name text NOT NULL,
  rule_description text,
  event_type_filter text,
  conditions jsonb DEFAULT '{}'::jsonb,
  attributes_to_capture jsonb DEFAULT '[]'::jsonb,
  enabled boolean DEFAULT true,
  priority integer DEFAULT 5,
  trigger_count integer DEFAULT 0,
  last_triggered_at timestamptz,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Session Correlations table
CREATE TABLE IF NOT EXISTS session_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_list_id uuid NOT NULL REFERENCES session_lists(id) ON DELETE CASCADE,
  correlation_type text NOT NULL,
  involved_sessions jsonb DEFAULT '[]'::jsonb,
  confidence_score numeric(5,2) DEFAULT 0,
  description text NOT NULL,
  evidence jsonb DEFAULT '{}'::jsonb,
  alert_generated boolean DEFAULT false,
  alert_id uuid,
  reviewed boolean DEFAULT false,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_correlation_type CHECK (correlation_type IN ('multiple_ips', 'suspicious_timing', 'anomalous_activity', 'compromised_host'))
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_session_lists_category ON session_lists(list_category);
CREATE INDEX IF NOT EXISTS idx_session_list_entries_list_id ON session_list_entries(session_list_id);
CREATE INDEX IF NOT EXISTS idx_session_list_entries_user_id ON session_list_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_session_list_entries_source_ip ON session_list_entries(source_ip);
CREATE INDEX IF NOT EXISTS idx_session_list_entries_login_time ON session_list_entries(login_time DESC);
CREATE INDEX IF NOT EXISTS idx_session_list_entries_status ON session_list_entries(status);
CREATE INDEX IF NOT EXISTS idx_session_list_entries_expires_at ON session_list_entries(expires_at);
CREATE INDEX IF NOT EXISTS idx_session_list_rules_list_id ON session_list_rules(session_list_id);
CREATE INDEX IF NOT EXISTS idx_session_list_rules_enabled ON session_list_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_session_correlations_list_id ON session_correlations(session_list_id);
CREATE INDEX IF NOT EXISTS idx_session_correlations_reviewed ON session_correlations(reviewed);

-- Enable Row Level Security
ALTER TABLE session_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_list_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_list_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_correlations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for session_lists
CREATE POLICY "Allow authenticated users to read session lists"
  ON session_lists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert session lists"
  ON session_lists FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update session lists"
  ON session_lists FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for session_list_entries
CREATE POLICY "Allow authenticated users to read session list entries"
  ON session_list_entries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert session list entries"
  ON session_list_entries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update session list entries"
  ON session_list_entries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete session list entries"
  ON session_list_entries FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for session_list_rules
CREATE POLICY "Allow authenticated users to read session list rules"
  ON session_list_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert session list rules"
  ON session_list_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update session list rules"
  ON session_list_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for session_correlations
CREATE POLICY "Allow authenticated users to read session correlations"
  ON session_correlations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert session correlations"
  ON session_correlations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update session correlations"
  ON session_correlations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to update entry count
CREATE OR REPLACE FUNCTION update_session_list_entry_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE session_lists
    SET entry_count = entry_count + 1, updated_at = NOW()
    WHERE id = NEW.session_list_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE session_lists
    SET entry_count = GREATEST(entry_count - 1, 0), updated_at = NOW()
    WHERE id = OLD.session_list_id;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trigger_update_entry_count_insert
  AFTER INSERT ON session_list_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_session_list_entry_count();

CREATE TRIGGER trigger_update_entry_count_delete
  AFTER DELETE ON session_list_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_session_list_entry_count();

-- Function to auto-expire old entries
CREATE OR REPLACE FUNCTION cleanup_expired_session_entries()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM session_list_entries
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
END;
$$;

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_session_list_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_session_lists_updated_at
  BEFORE UPDATE ON session_lists
  FOR EACH ROW
  EXECUTE FUNCTION update_session_list_timestamp();

CREATE TRIGGER trigger_session_list_entries_updated_at
  BEFORE UPDATE ON session_list_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_session_list_timestamp();

CREATE TRIGGER trigger_session_list_rules_updated_at
  BEFORE UPDATE ON session_list_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_session_list_timestamp();
