-- SIEM Database Schema
-- 
-- 1. New Tables
--    - security_events: Stores all security events from various sources
--    - sessions: Tracks user sessions with risk scoring
--    - active_lists: Threat intelligence lists (blocklists, allowlists, watchlists)
--    - alerts: Security alerts generated from correlation rules
--    - correlation_rules: Rules for detecting security patterns
--    - threat_intelligence: External threat intelligence feeds
--
-- 2. Security
--    - Enable RLS on all tables
--    - Policies allow authenticated users to read and manage SIEM data
--
-- 3. Indexes for performance on time-based and network queries

-- Security Events Table
CREATE TABLE IF NOT EXISTS security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  timestamp timestamptz DEFAULT now(),
  event_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  source_ip inet,
  destination_ip inet,
  user_id text,
  device_id text,
  action text,
  result text CHECK (result IN ('success', 'failure', 'blocked')),
  raw_data jsonb DEFAULT '{}'::jsonb,
  session_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_timestamp ON security_events(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_security_events_source_ip ON security_events(source_ip);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_session_id ON security_events(session_id);
CREATE INDEX IF NOT EXISTS idx_security_events_raw_data ON security_events USING gin(raw_data);

-- Sessions Table
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  source_ip inet NOT NULL,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'closed', 'suspicious')),
  risk_score integer DEFAULT 0,
  event_count integer DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
CREATE INDEX IF NOT EXISTS idx_sessions_risk_score ON sessions(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_start_time ON sessions(start_time DESC);

-- Active Lists Table
CREATE TABLE IF NOT EXISTS active_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  list_type text NOT NULL CHECK (list_type IN ('blocklist', 'allowlist', 'watchlist')),
  category text NOT NULL CHECK (category IN ('ip', 'domain', 'user', 'hash')),
  entries jsonb DEFAULT '[]'::jsonb,
  description text,
  auto_update boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_active_lists_list_type ON active_lists(list_type);
CREATE INDEX IF NOT EXISTS idx_active_lists_category ON active_lists(category);
CREATE INDEX IF NOT EXISTS idx_active_lists_entries ON active_lists USING gin(entries);

-- Alerts Table
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_name text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text DEFAULT 'new' CHECK (status IN ('new', 'investigating', 'resolved', 'false_positive')),
  description text,
  event_ids uuid[],
  session_id uuid REFERENCES sessions(id),
  assigned_to uuid REFERENCES auth.users(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_assigned_to ON alerts(assigned_to);

-- Correlation Rules Table
CREATE TABLE IF NOT EXISTS correlation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  rule_type text NOT NULL,
  conditions jsonb NOT NULL,
  threshold integer DEFAULT 1,
  time_window interval DEFAULT '5 minutes',
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  enabled boolean DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correlation_rules_enabled ON correlation_rules(enabled);

-- Threat Intelligence Table
CREATE TABLE IF NOT EXISTS threat_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator text NOT NULL,
  indicator_type text NOT NULL CHECK (indicator_type IN ('ip', 'domain', 'hash', 'url')),
  threat_level text NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
  source text,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threat_intelligence_indicator ON threat_intelligence(indicator);
CREATE INDEX IF NOT EXISTS idx_threat_intelligence_type ON threat_intelligence(indicator_type);
CREATE INDEX IF NOT EXISTS idx_threat_intelligence_level ON threat_intelligence(threat_level);

-- Enable Row Level Security
ALTER TABLE security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_intelligence ENABLE ROW LEVEL SECURITY;

-- RLS Policies for security_events
CREATE POLICY "Authenticated users can view security events"
  ON security_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert security events"
  ON security_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for sessions
CREATE POLICY "Authenticated users can view sessions"
  ON sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage sessions"
  ON sessions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for active_lists
CREATE POLICY "Authenticated users can view active lists"
  ON active_lists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage their active lists"
  ON active_lists FOR ALL
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for alerts
CREATE POLICY "Authenticated users can view alerts"
  ON alerts FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage alerts"
  ON alerts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for correlation_rules
CREATE POLICY "Authenticated users can view correlation rules"
  ON correlation_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage their correlation rules"
  ON correlation_rules FOR ALL
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for threat_intelligence
CREATE POLICY "Authenticated users can view threat intelligence"
  ON threat_intelligence FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can add threat intelligence"
  ON threat_intelligence FOR INSERT
  TO authenticated
  WITH CHECK (true);