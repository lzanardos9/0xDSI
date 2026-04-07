/*
  # Smart Threat Modeling System

  1. New Tables
    - `threat_models`
      - `id` (uuid, primary key)
      - `name` (text) - Model name
      - `description` (text) - Model description
      - `model_type` (text) - Type: physical, logical, hybrid
      - `auto_generated` (boolean) - Whether auto-generated
      - `confidence_score` (numeric) - AI confidence 0-100
      - `assets` (jsonb) - Assets being protected
      - `attack_surface` (jsonb) - Attack surface analysis
      - `threat_actors` (jsonb) - Potential threat actors
      - `attack_vectors` (jsonb) - Attack vectors identified
      - `mitre_tactics` (text[]) - MITRE ATT&CK tactics
      - `mitre_techniques` (text[]) - MITRE ATT&CK techniques
      - `severity` (text) - Overall severity: low, medium, high, critical
      - `status` (text) - Status: draft, active, archived
      - `metadata` (jsonb) - Additional metadata
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `threat_scenarios`
      - `id` (uuid, primary key)
      - `threat_model_id` (uuid, foreign key)
      - `scenario_name` (text)
      - `description` (text)
      - `threat_type` (text) - Type of threat
      - `likelihood` (text) - low, medium, high, critical
      - `impact` (text) - low, medium, high, critical
      - `risk_score` (numeric) - Calculated risk score
      - `attack_chain` (jsonb) - Step-by-step attack chain
      - `affected_assets` (text[]) - Assets at risk
      - `data_flow` (jsonb) - Data flow diagram
      - `entry_points` (jsonb) - Entry points
      - `vulnerabilities` (text[]) - Vulnerabilities exploited
      - `indicators` (text[]) - IOCs related
      - `created_at` (timestamptz)

    - `threat_mitigations`
      - `id` (uuid, primary key)
      - `scenario_id` (uuid, foreign key)
      - `mitigation_type` (text) - preventive, detective, corrective
      - `control_name` (text)
      - `description` (text)
      - `implementation_status` (text) - planned, in_progress, implemented
      - `effectiveness` (text) - low, medium, high
      - `cost` (text) - low, medium, high
      - `priority` (integer)
      - `owner` (text)
      - `due_date` (timestamptz)
      - `created_at` (timestamptz)

    - `threat_model_sources`
      - `id` (uuid, primary key)
      - `threat_model_id` (uuid, foreign key)
      - `source_type` (text) - pattern_discovery, event, alert, manual
      - `source_id` (uuid) - Reference to source
      - `confidence` (numeric)
      - `data` (jsonb)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read/write their data

  3. Indexes
    - Add indexes for common queries
*/

-- Threat Models Table
CREATE TABLE IF NOT EXISTS threat_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  model_type text NOT NULL CHECK (model_type IN ('physical', 'logical', 'hybrid')),
  auto_generated boolean DEFAULT false,
  confidence_score numeric CHECK (confidence_score >= 0 AND confidence_score <= 100),
  assets jsonb DEFAULT '[]'::jsonb,
  attack_surface jsonb DEFAULT '{}'::jsonb,
  threat_actors jsonb DEFAULT '[]'::jsonb,
  attack_vectors jsonb DEFAULT '[]'::jsonb,
  mitre_tactics text[] DEFAULT ARRAY[]::text[],
  mitre_techniques text[] DEFAULT ARRAY[]::text[],
  severity text CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Threat Scenarios Table
CREATE TABLE IF NOT EXISTS threat_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_model_id uuid REFERENCES threat_models(id) ON DELETE CASCADE,
  scenario_name text NOT NULL,
  description text,
  threat_type text NOT NULL,
  likelihood text CHECK (likelihood IN ('low', 'medium', 'high', 'critical')),
  impact text CHECK (impact IN ('low', 'medium', 'high', 'critical')),
  risk_score numeric,
  attack_chain jsonb DEFAULT '[]'::jsonb,
  affected_assets text[] DEFAULT ARRAY[]::text[],
  data_flow jsonb DEFAULT '{}'::jsonb,
  entry_points jsonb DEFAULT '[]'::jsonb,
  vulnerabilities text[] DEFAULT ARRAY[]::text[],
  indicators text[] DEFAULT ARRAY[]::text[],
  created_at timestamptz DEFAULT now()
);

-- Threat Mitigations Table
CREATE TABLE IF NOT EXISTS threat_mitigations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id uuid REFERENCES threat_scenarios(id) ON DELETE CASCADE,
  mitigation_type text CHECK (mitigation_type IN ('preventive', 'detective', 'corrective')),
  control_name text NOT NULL,
  description text,
  implementation_status text DEFAULT 'planned' CHECK (implementation_status IN ('planned', 'in_progress', 'implemented')),
  effectiveness text CHECK (effectiveness IN ('low', 'medium', 'high')),
  cost text CHECK (cost IN ('low', 'medium', 'high')),
  priority integer DEFAULT 0,
  owner text,
  due_date timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Threat Model Sources Table
CREATE TABLE IF NOT EXISTS threat_model_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  threat_model_id uuid REFERENCES threat_models(id) ON DELETE CASCADE,
  source_type text CHECK (source_type IN ('pattern_discovery', 'event', 'alert', 'manual', 'ioc')),
  source_id uuid,
  confidence numeric CHECK (confidence >= 0 AND confidence <= 100),
  data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_threat_models_type ON threat_models(model_type);
CREATE INDEX IF NOT EXISTS idx_threat_models_status ON threat_models(status);
CREATE INDEX IF NOT EXISTS idx_threat_models_severity ON threat_models(severity);
CREATE INDEX IF NOT EXISTS idx_threat_scenarios_model_id ON threat_scenarios(threat_model_id);
CREATE INDEX IF NOT EXISTS idx_threat_scenarios_likelihood ON threat_scenarios(likelihood);
CREATE INDEX IF NOT EXISTS idx_threat_scenarios_impact ON threat_scenarios(impact);
CREATE INDEX IF NOT EXISTS idx_threat_mitigations_scenario_id ON threat_mitigations(scenario_id);
CREATE INDEX IF NOT EXISTS idx_threat_model_sources_model_id ON threat_model_sources(threat_model_id);
CREATE INDEX IF NOT EXISTS idx_threat_model_sources_type ON threat_model_sources(source_type);

-- Enable Row Level Security
ALTER TABLE threat_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_mitigations ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_model_sources ENABLE ROW LEVEL SECURITY;

-- RLS Policies for threat_models
CREATE POLICY "Users can view all threat models"
  ON threat_models FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert threat models"
  ON threat_models FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update threat models"
  ON threat_models FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete threat models"
  ON threat_models FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for threat_scenarios
CREATE POLICY "Users can view all threat scenarios"
  ON threat_scenarios FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert threat scenarios"
  ON threat_scenarios FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update threat scenarios"
  ON threat_scenarios FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete threat scenarios"
  ON threat_scenarios FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for threat_mitigations
CREATE POLICY "Users can view all threat mitigations"
  ON threat_mitigations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert threat mitigations"
  ON threat_mitigations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Users can update threat mitigations"
  ON threat_mitigations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Users can delete threat mitigations"
  ON threat_mitigations FOR DELETE
  TO authenticated
  USING (true);

-- RLS Policies for threat_model_sources
CREATE POLICY "Users can view all threat model sources"
  ON threat_model_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert threat model sources"
  ON threat_model_sources FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow anon access for demo
CREATE POLICY "Anon can view threat models"
  ON threat_models FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view threat scenarios"
  ON threat_scenarios FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view threat mitigations"
  ON threat_mitigations FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can view threat model sources"
  ON threat_model_sources FOR SELECT
  TO anon
  USING (true);