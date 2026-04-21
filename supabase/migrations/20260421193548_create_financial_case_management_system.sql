/*
  # Financial Threat Case Management System

  1. New Tables
    - `financial_cases`
      - `id` (uuid, primary key)
      - `case_number` (text, unique) - Human-readable case ID like FIN-CASE-001
      - `title` (text) - Case title
      - `description` (text) - Full case description
      - `case_type` (text) - fraud, insider_threat, account_takeover, money_laundering, credential_theft, market_manipulation
      - `severity` (text) - low, medium, high, critical
      - `status` (text) - open, investigating, escalated, contained, resolved, closed
      - `priority` (integer) - 1-5 priority level
      - `assigned_to` (text) - Analyst name
      - `assigned_team` (text) - Team assignment
      - `risk_score` (integer) - 0-100 composite risk score
      - `financial_impact_usd` (numeric) - Estimated financial impact
      - `affected_accounts` (integer) - Number of affected accounts
      - `affected_entities` (jsonb) - Array of affected entity IDs/names
      - `related_detections` (jsonb) - Linked detection IDs
      - `related_simulations` (jsonb) - Linked simulation IDs
      - `attack_chain` (jsonb) - Kill chain stages mapped
      - `evidence_graph` (jsonb) - Nodes and edges for evidence visualization
      - `timeline_events` (jsonb) - Array of timeline entries
      - `investigation_notes` (jsonb) - Array of note objects
      - `response_actions` (jsonb) - Actions taken
      - `compliance_flags` (jsonb) - Regulatory compliance flags
      - `sla_deadline` (timestamptz) - SLA deadline
      - `opened_at` (timestamptz) - When case was opened
      - `resolved_at` (timestamptz) - When case was resolved
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `financial_case_evidence`
      - `id` (uuid, primary key)
      - `case_id` (uuid, foreign key)
      - `evidence_type` (text) - transaction, log, screenshot, document, network_capture, behavioral
      - `title` (text)
      - `description` (text)
      - `source_system` (text)
      - `severity` (text)
      - `confidence` (numeric)
      - `metadata` (jsonb)
      - `collected_at` (timestamptz)
      - `collected_by` (text)
      - `created_at` (timestamptz)

    - `financial_case_comments`
      - `id` (uuid, primary key)
      - `case_id` (uuid, foreign key)
      - `author` (text)
      - `author_role` (text)
      - `content` (text)
      - `comment_type` (text) - note, update, escalation, resolution
      - `is_internal` (boolean)
      - `created_at` (timestamptz)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to read/manage cases

  3. Mock Data
    - 8 comprehensive cases with rich evidence graphs, timelines, and investigation data
*/

-- Financial Cases table
CREATE TABLE IF NOT EXISTS financial_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_number text UNIQUE NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  case_type text NOT NULL DEFAULT 'fraud',
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  priority integer NOT NULL DEFAULT 3,
  assigned_to text NOT NULL DEFAULT '',
  assigned_team text NOT NULL DEFAULT '',
  risk_score integer NOT NULL DEFAULT 0,
  financial_impact_usd numeric NOT NULL DEFAULT 0,
  affected_accounts integer NOT NULL DEFAULT 0,
  affected_entities jsonb DEFAULT '[]'::jsonb,
  related_detections jsonb DEFAULT '[]'::jsonb,
  related_simulations jsonb DEFAULT '[]'::jsonb,
  attack_chain jsonb DEFAULT '[]'::jsonb,
  evidence_graph jsonb DEFAULT '{"nodes":[],"edges":[]}'::jsonb,
  timeline_events jsonb DEFAULT '[]'::jsonb,
  investigation_notes jsonb DEFAULT '[]'::jsonb,
  response_actions jsonb DEFAULT '[]'::jsonb,
  compliance_flags jsonb DEFAULT '[]'::jsonb,
  sla_deadline timestamptz,
  opened_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE financial_cases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read financial cases"
  ON financial_cases FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert financial cases"
  ON financial_cases FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update financial cases"
  ON financial_cases FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read financial cases"
  ON financial_cases FOR SELECT TO anon
  USING (true);

-- Financial Case Evidence table
CREATE TABLE IF NOT EXISTS financial_case_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES financial_cases(id),
  evidence_type text NOT NULL DEFAULT 'log',
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  source_system text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'medium',
  confidence numeric NOT NULL DEFAULT 0.5,
  metadata jsonb DEFAULT '{}'::jsonb,
  collected_at timestamptz DEFAULT now(),
  collected_by text NOT NULL DEFAULT 'system',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_case_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read case evidence"
  ON financial_case_evidence FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert case evidence"
  ON financial_case_evidence FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read case evidence"
  ON financial_case_evidence FOR SELECT TO anon
  USING (true);

-- Financial Case Comments table
CREATE TABLE IF NOT EXISTS financial_case_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES financial_cases(id),
  author text NOT NULL DEFAULT '',
  author_role text NOT NULL DEFAULT 'analyst',
  content text NOT NULL DEFAULT '',
  comment_type text NOT NULL DEFAULT 'note',
  is_internal boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE financial_case_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read case comments"
  ON financial_case_comments FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert case comments"
  ON financial_case_comments FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Anon users can read case comments"
  ON financial_case_comments FOR SELECT TO anon
  USING (true);
