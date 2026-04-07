/*
  # Create Events System with Raw Data Support

  1. New Tables
    - `events` - Security events with raw logs, flows, and packet data
      - Stores all security events from various sources
      - Includes raw log data for forensic analysis
      - Supports network flows and packet captures
      - Vector embeddings for similarity search

  2. Security
    - Enable RLS on events table
    - Add policies for authenticated and anonymous users

  3. Indexes
    - Optimize queries by event type, severity, and timestamps
    - Support vector similarity searches
*/

-- Events table with raw data support
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  severity text NOT NULL,
  source text NOT NULL,
  source_ip text,
  dest_ip text,
  source_port int,
  dest_port int,
  protocol text,
  user_id text,
  username text,
  hostname text,
  process_name text,
  command_line text,
  description text,
  
  -- Raw data fields for forensics
  raw_log text,
  raw_json jsonb,
  network_flow jsonb,
  packet_data text,
  
  -- Metadata and classification
  tags jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  iocs jsonb DEFAULT '[]'::jsonb,
  mitre_tactic text,
  mitre_technique text,
  
  -- Relationships
  alert_id uuid,
  case_id uuid,
  
  -- Vector embedding for similarity search
  embedding vector(384),
  
  -- Timestamps
  event_timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_severity ON events(severity);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_source_ip ON events(source_ip);
CREATE INDEX IF NOT EXISTS idx_events_dest_ip ON events(dest_ip);
CREATE INDEX IF NOT EXISTS idx_events_event_timestamp ON events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_mitre_tactic ON events(mitre_tactic);

-- Enable Row Level Security
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all users to read events"
  ON events FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert events"
  ON events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update events"
  ON events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
