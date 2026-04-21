/*
  # Financial Threat Intelligence Platform

  1. New Tables
    - `financial_identity_profiles` - Behavioral identity profiles per user/entity
      - `id` (uuid, primary key)
      - `entity_id` (text) - unique entity identifier (CPF, account number, etc.)
      - `entity_name` (text) - display name
      - `entity_type` (text) - person, business, api_integration
      - `trust_score` (integer 0-100) - current identity trust score
      - `risk_level` (text) - low, medium, high, critical
      - `behavioral_baseline` (jsonb) - historical behavioral patterns
      - `device_fingerprints` (jsonb) - known device fingerprints
      - `geo_patterns` (jsonb) - location patterns
      - `session_patterns` (jsonb) - session behavior patterns
      - `anomaly_flags` (jsonb) - current anomaly indicators
      - `identity_status` (text) - verified, suspicious, compromised, synthetic, mule
      - `last_activity_at` (timestamptz)
      - `created_at` (timestamptz)

    - `financial_transactions` - Real-time transaction monitoring
      - `id` (uuid, primary key)
      - `transaction_id` (text) - external transaction ID
      - `transaction_type` (text) - pix, ted, doc, wire, card, crypto
      - `source_entity_id` (text) - sender entity
      - `dest_entity_id` (text) - receiver entity
      - `amount` (numeric) - transaction amount
      - `currency` (text)
      - `risk_score` (integer 0-100)
      - `risk_factors` (jsonb) - contributing risk factors
      - `decision` (text) - allowed, stepped_up, delayed, blocked, alerted
      - `decision_reason` (text)
      - `behavioral_deviation` (numeric) - deviation from baseline
      - `dest_risk_indicators` (jsonb) - destination risk signals
      - `session_integrity` (jsonb) - session signals
      - `status` (text) - pending, completed, blocked, reversed
      - `created_at` (timestamptz)

    - `financial_identity_graph_edges` - Identity graph relationships
      - `id` (uuid, primary key)
      - `source_node_id` (text)
      - `source_node_type` (text) - user, device, ip, session, transaction, beneficiary, entity
      - `target_node_id` (text)
      - `target_node_type` (text)
      - `edge_type` (text) - owns, uses, connects_from, transacts_with, etc.
      - `weight` (numeric) - relationship strength
      - `first_seen` (timestamptz)
      - `last_seen` (timestamptz)
      - `is_suspicious` (boolean)
      - `metadata` (jsonb)

    - `financial_threat_detections` - Detected threats and incidents
      - `id` (uuid, primary key)
      - `detection_id` (text)
      - `threat_type` (text) - phishing, ato, pix_fraud, banking_malware, ransomware, supply_chain, identity_theft, identity_selling, deepfake, mule_network
      - `severity` (text)
      - `confidence` (integer 0-100)
      - `affected_entities` (jsonb) - entities involved
      - `attack_chain` (jsonb) - attack chain stages
      - `llm_explanation` (text) - AI-generated explanation
      - `llm_classification` (text) - AI classification
      - `behavioral_evidence` (jsonb)
      - `graph_evidence` (jsonb)
      - `status` (text) - active, investigating, contained, resolved, false_positive
      - `response_actions` (jsonb)
      - `created_at` (timestamptz)

    - `financial_response_decisions` - Response orchestration log
      - `id` (uuid, primary key)
      - `decision_id` (text)
      - `trigger_type` (text) - transaction, session, detection, rule
      - `trigger_id` (text)
      - `entity_id` (text)
      - `risk_score` (integer)
      - `action` (text) - allow, step_up_auth, delay, block, alert_soc, freeze_account
      - `action_details` (jsonb)
      - `reasoning` (text)
      - `outcome` (text) - executed, overridden, expired, escalated
      - `responded_by` (text) - system, analyst name
      - `response_time_ms` (integer)
      - `created_at` (timestamptz)

    - `financial_threat_simulations` - Monte Carlo simulation results
      - `id` (uuid, primary key)
      - `simulation_id` (text)
      - `scenario_name` (text)
      - `scenario_type` (text) - pix_fraud, ato, mule_network, supply_chain, ransomware
      - `parameters` (jsonb) - simulation parameters
      - `results` (jsonb) - simulation results
      - `attack_paths` (jsonb) - generated attack paths
      - `detection_gaps` (jsonb) - identified gaps
      - `suggested_rules` (jsonb) - auto-suggested rules
      - `confidence_interval` (numeric)
      - `iterations` (integer)
      - `status` (text) - running, completed, failed
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to read data
*/

-- Financial Identity Profiles
CREATE TABLE IF NOT EXISTS financial_identity_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id text NOT NULL,
  entity_name text NOT NULL,
  entity_type text NOT NULL DEFAULT 'person',
  trust_score integer NOT NULL DEFAULT 50,
  risk_level text NOT NULL DEFAULT 'medium',
  behavioral_baseline jsonb DEFAULT '{}'::jsonb,
  device_fingerprints jsonb DEFAULT '[]'::jsonb,
  geo_patterns jsonb DEFAULT '{}'::jsonb,
  session_patterns jsonb DEFAULT '{}'::jsonb,
  anomaly_flags jsonb DEFAULT '[]'::jsonb,
  identity_status text NOT NULL DEFAULT 'verified',
  last_activity_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_identity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial identity profiles"
  ON financial_identity_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Financial Transactions
CREATE TABLE IF NOT EXISTS financial_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL,
  transaction_type text NOT NULL DEFAULT 'pix',
  source_entity_id text NOT NULL,
  dest_entity_id text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'BRL',
  risk_score integer NOT NULL DEFAULT 0,
  risk_factors jsonb DEFAULT '[]'::jsonb,
  decision text NOT NULL DEFAULT 'allowed',
  decision_reason text DEFAULT '',
  behavioral_deviation numeric DEFAULT 0,
  dest_risk_indicators jsonb DEFAULT '[]'::jsonb,
  session_integrity jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial transactions"
  ON financial_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Identity Graph Edges
CREATE TABLE IF NOT EXISTS financial_identity_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id text NOT NULL,
  source_node_type text NOT NULL,
  target_node_id text NOT NULL,
  target_node_type text NOT NULL,
  edge_type text NOT NULL,
  weight numeric DEFAULT 1.0,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  is_suspicious boolean DEFAULT false,
  metadata jsonb DEFAULT '{}'::jsonb
);

ALTER TABLE financial_identity_graph_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read identity graph edges"
  ON financial_identity_graph_edges FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Threat Detections
CREATE TABLE IF NOT EXISTS financial_threat_detections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detection_id text NOT NULL,
  threat_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  confidence integer NOT NULL DEFAULT 50,
  affected_entities jsonb DEFAULT '[]'::jsonb,
  attack_chain jsonb DEFAULT '[]'::jsonb,
  llm_explanation text DEFAULT '',
  llm_classification text DEFAULT '',
  behavioral_evidence jsonb DEFAULT '{}'::jsonb,
  graph_evidence jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'active',
  response_actions jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_threat_detections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial threat detections"
  ON financial_threat_detections FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Response Decisions
CREATE TABLE IF NOT EXISTS financial_response_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id text NOT NULL,
  trigger_type text NOT NULL,
  trigger_id text NOT NULL,
  entity_id text NOT NULL,
  risk_score integer NOT NULL DEFAULT 0,
  action text NOT NULL,
  action_details jsonb DEFAULT '{}'::jsonb,
  reasoning text DEFAULT '',
  outcome text NOT NULL DEFAULT 'executed',
  responded_by text DEFAULT 'system',
  response_time_ms integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_response_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial response decisions"
  ON financial_response_decisions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Threat Simulations
CREATE TABLE IF NOT EXISTS financial_threat_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id text NOT NULL,
  scenario_name text NOT NULL,
  scenario_type text NOT NULL,
  parameters jsonb DEFAULT '{}'::jsonb,
  results jsonb DEFAULT '{}'::jsonb,
  attack_paths jsonb DEFAULT '[]'::jsonb,
  detection_gaps jsonb DEFAULT '[]'::jsonb,
  suggested_rules jsonb DEFAULT '[]'::jsonb,
  confidence_interval numeric DEFAULT 0.95,
  iterations integer DEFAULT 10000,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_threat_simulations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial threat simulations"
  ON financial_threat_simulations FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fin_identity_trust ON financial_identity_profiles(trust_score);
CREATE INDEX IF NOT EXISTS idx_fin_identity_status ON financial_identity_profiles(identity_status);
CREATE INDEX IF NOT EXISTS idx_fin_tx_risk ON financial_transactions(risk_score);
CREATE INDEX IF NOT EXISTS idx_fin_tx_type ON financial_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_fin_tx_created ON financial_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_fin_graph_source ON financial_identity_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_fin_graph_target ON financial_identity_graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_fin_detection_type ON financial_threat_detections(threat_type);
CREATE INDEX IF NOT EXISTS idx_fin_detection_status ON financial_threat_detections(status);
CREATE INDEX IF NOT EXISTS idx_fin_response_action ON financial_response_decisions(action);
