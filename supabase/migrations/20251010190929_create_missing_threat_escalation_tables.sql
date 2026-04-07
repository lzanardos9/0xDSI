/*
  # Create Missing Threat Escalation Tables

  Creates only the missing tables needed for threat escalation:
  - threat_escalation_formulas
  - event_priority_calculations
  - escalation_rules
  - threat_intelligence_sources
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

-- Add missing columns to asset_registry
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_registry' AND column_name = 'model_confidence') THEN
    ALTER TABLE asset_registry ADD COLUMN model_confidence numeric(5,2) DEFAULT 5.0;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'asset_registry' AND column_name = 'criticality_score') THEN
    ALTER TABLE asset_registry ADD COLUMN criticality_score numeric(5,2) DEFAULT 1.0;
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_threat_escalation_formulas_active ON threat_escalation_formulas(is_active);
CREATE INDEX IF NOT EXISTS idx_threat_intel_indicator ON threat_intelligence_sources(indicator_value);
CREATE INDEX IF NOT EXISTS idx_threat_intel_type ON threat_intelligence_sources(indicator_type);
CREATE INDEX IF NOT EXISTS idx_threat_intel_active ON threat_intelligence_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_event_priority_event_id ON event_priority_calculations(event_id);
CREATE INDEX IF NOT EXISTS idx_event_priority_level ON event_priority_calculations(priority_level);
CREATE INDEX IF NOT EXISTS idx_event_priority_calculated_at ON event_priority_calculations(calculated_at DESC);
CREATE INDEX IF NOT EXISTS idx_escalation_rules_enabled ON escalation_rules(enabled);

-- Enable RLS
ALTER TABLE threat_escalation_formulas ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_intelligence_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_priority_calculations ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalation_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Auth users read formulas" ON threat_escalation_formulas FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert formulas" ON threat_escalation_formulas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update formulas" ON threat_escalation_formulas FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read threat intel" ON threat_intelligence_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert threat intel" ON threat_intelligence_sources FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read calculations" ON event_priority_calculations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert calculations" ON event_priority_calculations FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read rules" ON escalation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert rules" ON escalation_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth users update rules" ON escalation_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for anon users
CREATE POLICY "Anon users read formulas" ON threat_escalation_formulas FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users read threat intel" ON threat_intelligence_sources FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users read calculations" ON event_priority_calculations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon users insert calculations" ON event_priority_calculations FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anon users read rules" ON escalation_rules FOR SELECT TO anon USING (true);

-- Insert default formula
INSERT INTO threat_escalation_formulas (
  name, description, formula_version, is_active,
  severity_weight, mcr_weight, threat_weight_multiplier, asset_weight,
  formula_expression, created_by
) VALUES (
  'Standard ArcSight-Style Formula',
  'Default threat escalation formula based on Severity * MCR * ThreatWeight * AssetCriticality',
  '1.0', true, 1.0, 1.0, 0.03, 1.0,
  'Priority = Severity * (MC/10 * Relevance) * (1 + ThreatSeverity * 3/100) * AssetCriticality',
  'system'
);