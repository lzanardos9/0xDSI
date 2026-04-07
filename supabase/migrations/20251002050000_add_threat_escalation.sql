/*
  # Add Threat Escalation System

  1. New Tables
    - `threat_escalation_formulas`
      - `id` (uuid, primary key)
      - `name` (text) - Formula name
      - `description` (text) - What this formula does
      - `formula_version` (text) - Version identifier
      - `is_active` (boolean) - Currently in use
      - `severity_weight` (numeric) - Weight for severity factor
      - `mcr_weight` (numeric) - Weight for Model Confidence & Relevance
      - `threat_weight_multiplier` (numeric) - Threat intelligence multiplier
      - `asset_weight` (numeric) - Weight for asset criticality
      - `formula_expression` (text) - Human-readable formula
      - `custom_config` (jsonb) - Additional configuration
      - `created_by` (text)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `asset_registry`
      - `id` (uuid, primary key)
      - `asset_name` (text) - Asset identifier
      - `asset_type` (text) - server, workstation, network_device, database, application
      - `ip_address` (text) - Primary IP
      - `hostname` (text) - Hostname
      - `criticality` (text) - very_low, low, medium, high, very_high
      - `criticality_score` (numeric) - Numeric score (0.5 to 2.0)
      - `business_impact` (text) - Impact description
      - `model_confidence` (numeric) - How well-defined (0-10)
      - `discovery_method` (text) - manual, automated, agent
      - `exposed_ports` (jsonb) - Array of exposed ports
      - `known_vulnerabilities` (jsonb) - CVEs and vulnerabilities
      - `location` (text) - Physical/logical location
      - `owner` (text) - Business owner
      - `compliance_level` (text) - Compliance requirements
      - `is_active` (boolean) - Currently in production
      - `last_scan_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `threat_intelligence_sources`
      - `id` (uuid, primary key)
      - `source_name` (text) - TI source name
      - `source_type` (text) - ip_reputation, domain_reputation, file_hash, cve_feed
      - `threat_severity` (integer) - Severity contribution (0-10)
      - `indicator_value` (text) - IP, domain, hash, etc.
      - `indicator_type` (text) - Type of indicator
      - `threat_category` (text) - malware, botnet, phishing, etc.
      - `confidence_score` (numeric) - Source confidence (0-100)
      - `first_seen` (timestamptz)
      - `last_seen` (timestamptz)
      - `tags` (jsonb)
      - `metadata` (jsonb)
      - `expires_at` (timestamptz)
      - `is_active` (boolean)
      - `created_at` (timestamptz)

    - `event_priority_calculations`
      - `id` (uuid, primary key)
      - `event_id` (text) - Reference to event
      - `formula_id` (uuid, foreign key)
      - `initial_severity` (text) - very_low, low, medium, high, very_high
      - `severity_score` (numeric) - Numeric severity (0-10)
      - `model_confidence` (numeric) - MC score (0-10)
      - `relevance_score` (numeric) - Relevance (0-1)
      - `mcr_factor` (numeric) - Combined MC & R
      - `threat_weight` (numeric) - TI contribution
      - `asset_criticality` (numeric) - Asset importance
      - `final_priority` (numeric) - Calculated priority
      - `priority_level` (text) - very_low, low, medium, high, very_high, critical
      - `calculation_details` (jsonb) - Breakdown of calculation
      - `escalated` (boolean) - Whether escalated
      - `escalation_reason` (text) - Why escalated
      - `calculated_at` (timestamptz)

    - `escalation_rules`
      - `id` (uuid, primary key)
      - `rule_name` (text) - Rule identifier
      - `description` (text) - What triggers this
      - `priority_threshold` (numeric) - Min priority to trigger
      - `conditions` (jsonb) - Additional conditions
      - `actions` (jsonb) - Actions to take
      - `notification_targets` (jsonb) - Who to notify
      - `auto_escalate` (boolean) - Automatic escalation
      - `enabled` (boolean)
      - `trigger_count` (integer) - Times triggered
      - `last_triggered_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users

  3. Indexes
    - Optimize for priority calculations
    - Asset lookups
*/

-- Threat Escalation Formulas table
CREATE TABLE IF NOT EXISTS threat_escalation_formulas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  formula_version text DEFAULT '1.0',
  is_active boolean DEFAULT false,
  severity_weight numeric(5,2) DEFAULT 1.0,
  mcr_weight numeric(5,2) DEFAULT 1.0,
  threat_weight_multiplier numeric(5,2) DEFAULT 3.0,
  asset_weight numeric(5,2) DEFAULT 1.0,
  formula_expression text DEFAULT 'Priority = Severity * MCR * ThreatWeight * AssetCriticality',
  custom_config jsonb DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Asset Registry table
CREATE TABLE IF NOT EXISTS asset_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_name text NOT NULL,
  asset_type text NOT NULL,
  ip_address text,
  hostname text,
  criticality text NOT NULL DEFAULT 'medium',
  criticality_score numeric(5,2) DEFAULT 1.0,
  business_impact text,
  model_confidence numeric(5,2) DEFAULT 5.0,
  discovery_method text DEFAULT 'manual',
  exposed_ports jsonb DEFAULT '[]'::jsonb,
  known_vulnerabilities jsonb DEFAULT '[]'::jsonb,
  location text,
  owner text,
  compliance_level text,
  is_active boolean DEFAULT true,
  last_scan_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_asset_type CHECK (asset_type IN ('server', 'workstation', 'network_device', 'database', 'application', 'cloud_service')),
  CONSTRAINT valid_criticality CHECK (criticality IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  CONSTRAINT valid_discovery_method CHECK (discovery_method IN ('manual', 'automated', 'agent', 'imported'))
);

-- Threat Intelligence Sources table
CREATE TABLE IF NOT EXISTS threat_intelligence_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_type text NOT NULL,
  threat_severity integer DEFAULT 5,
  indicator_value text NOT NULL,
  indicator_type text NOT NULL,
  threat_category text,
  confidence_score numeric(5,2) DEFAULT 50.0,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  tags jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  expires_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_source_type CHECK (source_type IN ('ip_reputation', 'domain_reputation', 'file_hash', 'cve_feed', 'malware_signature', 'url_reputation')),
  CONSTRAINT valid_indicator_type CHECK (indicator_type IN ('ipv4', 'ipv6', 'domain', 'url', 'md5', 'sha1', 'sha256', 'cve'))
);

-- Event Priority Calculations table
CREATE TABLE IF NOT EXISTS event_priority_calculations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  formula_id uuid REFERENCES threat_escalation_formulas(id) ON DELETE SET NULL,
  initial_severity text NOT NULL,
  severity_score numeric(5,2) DEFAULT 5.0,
  model_confidence numeric(5,2) DEFAULT 5.0,
  relevance_score numeric(5,2) DEFAULT 0.5,
  mcr_factor numeric(5,2) DEFAULT 0.5,
  threat_weight numeric(5,2) DEFAULT 1.0,
  asset_criticality numeric(5,2) DEFAULT 1.0,
  final_priority numeric(5,2) DEFAULT 5.0,
  priority_level text DEFAULT 'medium',
  calculation_details jsonb DEFAULT '{}'::jsonb,
  escalated boolean DEFAULT false,
  escalation_reason text,
  calculated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_initial_severity CHECK (initial_severity IN ('very_low', 'low', 'medium', 'high', 'very_high')),
  CONSTRAINT valid_priority_level CHECK (priority_level IN ('very_low', 'low', 'medium', 'high', 'very_high', 'critical'))
);

-- Escalation Rules table
CREATE TABLE IF NOT EXISTS escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  description text,
  priority_threshold numeric(5,2) DEFAULT 7.0,
  conditions jsonb DEFAULT '{}'::jsonb,
  actions jsonb DEFAULT '[]'::jsonb,
  notification_targets jsonb DEFAULT '[]'::jsonb,
  auto_escalate boolean DEFAULT true,
  enabled boolean DEFAULT true,
  trigger_count integer DEFAULT 0,
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_threat_escalation_formulas_active ON threat_escalation_formulas(is_active);
CREATE INDEX IF NOT EXISTS idx_asset_registry_ip ON asset_registry(ip_address);
CREATE INDEX IF NOT EXISTS idx_asset_registry_hostname ON asset_registry(hostname);
CREATE INDEX IF NOT EXISTS idx_asset_registry_criticality ON asset_registry(criticality);
CREATE INDEX IF NOT EXISTS idx_asset_registry_active ON asset_registry(is_active);
CREATE INDEX IF NOT EXISTS idx_threat_intel_indicator ON threat_intelligence_sources(indicator_value);
CREATE INDEX IF NOT EXISTS idx_threat_intel_type ON threat_intelligence_sources(indicator_type);
CREATE INDEX IF NOT EXISTS idx_threat_intel_active ON threat_intelligence_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_event_priority_event_id ON event_priority_calculations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_priority_level ON event_priority_calculations(priority_level);
CREATE INDEX IF NOT EXISTS idx_event_priority_calculated_at ON event_priority_calculations(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_enabled ON escalation_rules(enabled);

-- Enable Row Level Security
ALTER TABLE threat_escalation_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE asset_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_intelligence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_priority_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated users to read threat escalation formulas"
  ON threat_escalation_formulas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert threat escalation formulas"
  ON threat_escalation_formulas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update threat escalation formulas"
  ON threat_escalation_formulas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read asset registry"
  ON asset_registry FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert asset registry"
  ON asset_registry FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update asset registry"
  ON asset_registry FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read threat intelligence"
  ON threat_intelligence_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert threat intelligence"
  ON threat_intelligence_sources FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read event priority calculations"
  ON event_priority_calculations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert event priority calculations"
  ON event_priority_calculations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read escalation rules"
  ON escalation_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert escalation rules"
  ON escalation_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update escalation rules"
  ON escalation_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to calculate event priority
CREATE OR REPLACE FUNCTION calculate_event_priority(
  p_severity_score numeric,
  p_model_confidence numeric,
  p_relevance_score numeric,
  p_threat_weight numeric,
  p_asset_criticality numeric,
  p_formula_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_mcr_factor numeric;
  v_final_priority numeric;
  v_severity_weight numeric := 1.0;
  v_mcr_weight numeric := 1.0;
  v_threat_multiplier numeric := 3.0;
  v_asset_weight numeric := 1.0;
BEGIN
  IF p_formula_id IS NOT NULL THEN
    SELECT severity_weight, mcr_weight, threat_weight_multiplier, asset_weight
    INTO v_severity_weight, v_mcr_weight, v_threat_multiplier, v_asset_weight
    FROM threat_escalation_formulas
    WHERE id = p_formula_id AND is_active = true;
  END IF;

  v_mcr_factor := (p_model_confidence / 10.0) * p_relevance_score;

  v_final_priority := (p_severity_score * v_severity_weight)
                     * (v_mcr_factor * v_mcr_weight)
                     * (p_threat_weight * v_threat_multiplier)
                     * (p_asset_criticality * v_asset_weight);

  RETURN ROUND(v_final_priority, 2);
END;
$$;

-- Function to get priority level from numeric score
CREATE OR REPLACE FUNCTION get_priority_level(p_priority_score numeric)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  IF p_priority_score >= 9.0 THEN
    RETURN 'critical';
  ELSIF p_priority_score >= 7.0 THEN
    RETURN 'very_high';
  ELSIF p_priority_score >= 5.0 THEN
    RETURN 'high';
  ELSIF p_priority_score >= 3.0 THEN
    RETURN 'medium';
  ELSIF p_priority_score >= 1.0 THEN
    RETURN 'low';
  ELSE
    RETURN 'very_low';
  END IF;
END;
$$;

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_threat_escalation_timestamp()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_threat_escalation_formulas_updated_at
  BEFORE UPDATE ON threat_escalation_formulas
  FOR EACH ROW
  EXECUTE FUNCTION update_threat_escalation_timestamp();

CREATE TRIGGER trigger_asset_registry_updated_at
  BEFORE UPDATE ON asset_registry
  FOR EACH ROW
  EXECUTE FUNCTION update_threat_escalation_timestamp();

CREATE TRIGGER trigger_escalation_rules_updated_at
  BEFORE UPDATE ON escalation_rules
  FOR EACH ROW
  EXECUTE FUNCTION update_threat_escalation_timestamp();

-- Insert default formula
INSERT INTO threat_escalation_formulas (
  name,
  description,
  formula_version,
  is_active,
  severity_weight,
  mcr_weight,
  threat_weight_multiplier,
  asset_weight,
  formula_expression,
  created_by
) VALUES (
  'Standard ArcSight-Style Formula',
  'Default threat escalation formula based on Severity * MCR * ThreatWeight * AssetCriticality',
  '1.0',
  true,
  1.0,
  1.0,
  0.03,
  1.0,
  'Priority = Severity * (MC/10 * Relevance) * (1 + ThreatSeverity * 3/100) * AssetCriticality',
  'system'
);
