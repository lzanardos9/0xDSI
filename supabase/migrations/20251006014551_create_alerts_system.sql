/*
  # Create Alerts System

  1. New Tables
    - `alerts` - Security alerts and detections from various sources
      - Tracks all security alerts with severity, status, and correlation data
      - Supports multiple alert sources (IDS, SIEM, EDR, etc.)
      - Links to related events and cases

  2. Security
    - Enable RLS on alerts table
    - Add policies for authenticated and anonymous users

  3. Indexes
    - Optimize queries by severity, status, and timestamps
*/

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  severity text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  alert_type text NOT NULL,
  source text NOT NULL,
  source_ip text,
  dest_ip text,
  user_id text,
  hostname text,
  rule_id text,
  rule_name text,
  mitre_tactic text,
  mitre_technique text,
  confidence_score int DEFAULT 0,
  false_positive boolean DEFAULT false,
  assigned_to text,
  case_id uuid,
  related_event_ids jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT valid_status CHECK (status IN ('open', 'acknowledged', 'investigating', 'resolved', 'closed', 'false_positive')),
  CONSTRAINT valid_confidence CHECK (confidence_score >= 0 AND confidence_score <= 100)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON alerts(status);
CREATE INDEX IF NOT EXISTS idx_alerts_alert_type ON alerts(alert_type);
CREATE INDEX IF NOT EXISTS idx_alerts_source ON alerts(source);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_source_ip ON alerts(source_ip);
CREATE INDEX IF NOT EXISTS idx_alerts_mitre_tactic ON alerts(mitre_tactic);

-- Enable Row Level Security
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all users to read alerts"
  ON alerts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert alerts"
  ON alerts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update alerts"
  ON alerts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_alerts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_update_alerts_timestamp ON alerts;
CREATE TRIGGER trigger_update_alerts_timestamp
  BEFORE UPDATE ON alerts
  FOR EACH ROW
  EXECUTE FUNCTION update_alerts_updated_at();
