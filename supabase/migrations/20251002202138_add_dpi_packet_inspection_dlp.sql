/*
  # Add DPI (Deep Packet Inspection) and DLP (Data Loss Prevention) System

  1. New Tables
    - **packet_captures**: Stores captured network packets with metadata
      - `id` (uuid, primary key)
      - `capture_time` (timestamptz) - When packet was captured
      - `source_ip` (text) - Source IP address
      - `destination_ip` (text) - Destination IP address
      - `source_port` (integer) - Source port
      - `destination_port` (integer) - Destination port
      - `protocol` (text) - TCP, UDP, ICMP, etc.
      - `packet_size` (integer) - Size in bytes
      - `content_type` (text) - email, image, video, document, compressed, encrypted, http, etc.
      - `reconstructed_content` (jsonb) - Metadata about reconstructed content
      - `flow_id` (text) - Flow identifier for grouping related packets
      - `status` (text) - capturing, reconstructing, completed, failed

    - **dlp_detections**: DLP policy violations and risk classifications
      - `id` (uuid, primary key)
      - `packet_id` (uuid) - Reference to packet_captures
      - `flow_id` (text) - Flow identifier
      - `risk_level` (text) - low, medium, high, critical
      - `violation_type` (text) - pii_leak, confidential_data, malware, policy_violation, etc.
      - `detected_patterns` (text[]) - Array of detected sensitive patterns
      - `content_classification` (text) - Classification of content
      - `action_taken` (text) - allow, block, quarantine, alert
      - `confidence_score` (numeric) - Detection confidence (0-100)
      - `details` (jsonb) - Additional detection details
      - `detected_at` (timestamptz)

    - **dpi_flows**: Network flows for packet grouping
      - `id` (uuid, primary key)
      - `flow_id` (text, unique) - Unique flow identifier
      - `source_ip` (text)
      - `destination_ip` (text)
      - `source_zone` (text) - Network zone
      - `destination_zone` (text) - Network zone
      - `protocol` (text)
      - `total_packets` (integer)
      - `total_bytes` (bigint)
      - `start_time` (timestamptz)
      - `end_time` (timestamptz)
      - `status` (text) - active, completed, blocked
      - `content_summary` (jsonb)

  2. Security
    - Enable RLS on all tables
    - Add policies for anonymous and authenticated access

  3. Indexes
    - Performance indexes on time-based queries
    - Indexes on IP addresses and flow IDs
    - GIN indexes on JSONB columns

  4. Notes
    - Packet captures are simulated for demonstration
    - DLP detection uses pattern matching and classification
    - Risk scoring based on content type and policy violations
*/

-- ============================================================================
-- Create Packet Captures Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS packet_captures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capture_time timestamptz DEFAULT now(),
  source_ip text NOT NULL,
  destination_ip text NOT NULL,
  source_port integer NOT NULL,
  destination_port integer NOT NULL,
  protocol text NOT NULL CHECK (protocol IN ('TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'SMTP', 'FTP')),
  packet_size integer NOT NULL,
  content_type text NOT NULL CHECK (content_type IN ('email', 'image', 'video', 'document', 'compressed', 'encrypted', 'http', 'database', 'unknown')),
  reconstructed_content jsonb DEFAULT '{}'::jsonb,
  flow_id text NOT NULL,
  status text DEFAULT 'capturing' CHECK (status IN ('capturing', 'reconstructing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

-- Indexes for packet_captures
CREATE INDEX IF NOT EXISTS idx_packet_captures_capture_time ON packet_captures(capture_time DESC);
CREATE INDEX IF NOT EXISTS idx_packet_captures_source_ip ON packet_captures(source_ip);
CREATE INDEX IF NOT EXISTS idx_packet_captures_destination_ip ON packet_captures(destination_ip);
CREATE INDEX IF NOT EXISTS idx_packet_captures_flow_id ON packet_captures(flow_id);
CREATE INDEX IF NOT EXISTS idx_packet_captures_content_type ON packet_captures(content_type);
CREATE INDEX IF NOT EXISTS idx_packet_captures_reconstructed_content ON packet_captures USING gin(reconstructed_content);

-- Enable RLS
ALTER TABLE packet_captures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read packet captures"
  ON packet_captures FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated to read packet captures"
  ON packet_captures FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Create DLP Detections Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS dlp_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  packet_id uuid REFERENCES packet_captures(id) ON DELETE CASCADE,
  flow_id text NOT NULL,
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
  violation_type text NOT NULL CHECK (violation_type IN ('pii_leak', 'confidential_data', 'malware', 'policy_violation', 'data_exfiltration', 'unauthorized_transfer', 'compliance_violation')),
  detected_patterns text[] DEFAULT ARRAY[]::text[],
  content_classification text NOT NULL,
  action_taken text NOT NULL CHECK (action_taken IN ('allow', 'block', 'quarantine', 'alert')),
  confidence_score numeric(5,2) NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
  details jsonb DEFAULT '{}'::jsonb,
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Indexes for dlp_detections
CREATE INDEX IF NOT EXISTS idx_dlp_detections_packet_id ON dlp_detections(packet_id);
CREATE INDEX IF NOT EXISTS idx_dlp_detections_flow_id ON dlp_detections(flow_id);
CREATE INDEX IF NOT EXISTS idx_dlp_detections_risk_level ON dlp_detections(risk_level);
CREATE INDEX IF NOT EXISTS idx_dlp_detections_violation_type ON dlp_detections(violation_type);
CREATE INDEX IF NOT EXISTS idx_dlp_detections_detected_at ON dlp_detections(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_dlp_detections_details ON dlp_detections USING gin(details);

-- Enable RLS
ALTER TABLE dlp_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read DLP detections"
  ON dlp_detections FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated to read DLP detections"
  ON dlp_detections FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================================
-- Create DPI Flows Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS dpi_flows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id text UNIQUE NOT NULL,
  source_ip text NOT NULL,
  destination_ip text NOT NULL,
  source_zone text NOT NULL,
  destination_zone text NOT NULL,
  protocol text NOT NULL,
  total_packets integer DEFAULT 0,
  total_bytes bigint DEFAULT 0,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'blocked')),
  content_summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes for dpi_flows
CREATE INDEX IF NOT EXISTS idx_dpi_flows_flow_id ON dpi_flows(flow_id);
CREATE INDEX IF NOT EXISTS idx_dpi_flows_source_ip ON dpi_flows(source_ip);
CREATE INDEX IF NOT EXISTS idx_dpi_flows_destination_ip ON dpi_flows(destination_ip);
CREATE INDEX IF NOT EXISTS idx_dpi_flows_status ON dpi_flows(status);
CREATE INDEX IF NOT EXISTS idx_dpi_flows_start_time ON dpi_flows(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_dpi_flows_content_summary ON dpi_flows USING gin(content_summary);

-- Enable RLS
ALTER TABLE dpi_flows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous to read DPI flows"
  ON dpi_flows FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated to read DPI flows"
  ON dpi_flows FOR SELECT
  TO authenticated
  USING (true);
