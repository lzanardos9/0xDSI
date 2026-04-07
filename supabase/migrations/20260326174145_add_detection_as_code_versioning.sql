/*
  # Add Detection-as-Code Versioning System

  Transforms the correlation rules library into a fully versioned, 
  auditable Detection-as-Code (DaC) system with lifecycle management,
  change tracking, test case management, and deployment history.

  1. Modified Tables
    - `correlation_rules_library`
      - `version` (text) - Semantic version string (e.g. "1.0.0")
      - `dac_status` (text) - Lifecycle status: draft, testing, staging, production, deprecated, archived
      - `changelog` (jsonb) - Array of version history entries with author, date, summary
      - `test_cases` (jsonb) - Array of test definitions with input, expected output, status
      - `deployment_history` (jsonb) - Array of deployment records with env, date, deployer
      - `review_status` (text) - Peer review status: pending_review, approved, rejected, changes_requested
      - `reviewed_by` (text) - Username of last reviewer
      - `reviewed_at` (timestamptz) - Timestamp of last review
      - `git_ref` (text) - Git commit hash or branch reference
      - `source_format` (text) - Rule source format: sigma, splunk_spl, elastic_kql, custom
      - `compliance_frameworks` (jsonb) - Mapped compliance frameworks (PCI-DSS, NIST, etc.)
      - `response_playbook` (text) - Link or reference to response playbook
      - `last_tested_at` (timestamptz) - When rule was last tested
      - `test_result` (text) - Last test result: pass, fail, untested

  2. New Tables
    - `correlation_rule_versions`
      - Stores complete snapshots of every rule version
      - Enables full rollback to any prior version
      - Tracks who changed what and why
      - Each version includes the full rule_logic snapshot

  3. Security
    - RLS enabled on `correlation_rule_versions`
    - Authenticated and anonymous read access
    - Authenticated write access

  4. Indexes
    - Composite index on rule_id + version for fast lookups
    - Index on dac_status for lifecycle filtering
    - Index on review_status for review queue
*/

-- Add DaC columns to correlation_rules_library
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'version') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN version text NOT NULL DEFAULT '1.0.0';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'dac_status') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN dac_status text NOT NULL DEFAULT 'production';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'changelog') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN changelog jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'test_cases') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN test_cases jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'deployment_history') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN deployment_history jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'review_status') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN review_status text NOT NULL DEFAULT 'approved';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'reviewed_by') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN reviewed_by text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'reviewed_at') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN reviewed_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'git_ref') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN git_ref text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'source_format') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN source_format text NOT NULL DEFAULT 'custom';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'compliance_frameworks') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN compliance_frameworks jsonb NOT NULL DEFAULT '[]';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'response_playbook') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN response_playbook text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'last_tested_at') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN last_tested_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'correlation_rules_library' AND column_name = 'test_result') THEN
    ALTER TABLE correlation_rules_library ADD COLUMN test_result text NOT NULL DEFAULT 'untested';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_crl_dac_status ON correlation_rules_library(dac_status);
CREATE INDEX IF NOT EXISTS idx_crl_review_status ON correlation_rules_library(review_status);
CREATE INDEX IF NOT EXISTS idx_crl_version ON correlation_rules_library(version);

-- Version history table
CREATE TABLE IF NOT EXISTS correlation_rule_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES correlation_rules_library(id) ON DELETE CASCADE,
  version text NOT NULL,
  rule_name text NOT NULL,
  rule_description text NOT NULL,
  rule_logic jsonb NOT NULL DEFAULT '{}',
  severity text NOT NULL DEFAULT 'medium',
  category text NOT NULL DEFAULT '',
  enabled boolean NOT NULL DEFAULT false,
  change_summary text NOT NULL DEFAULT '',
  changed_by text NOT NULL DEFAULT 'System',
  change_type text NOT NULL DEFAULT 'created',
  diff_summary jsonb DEFAULT '{}',
  promoted_from text,
  promoted_to text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crv_rule_version ON correlation_rule_versions(rule_id, version);
CREATE INDEX IF NOT EXISTS idx_crv_rule_id ON correlation_rule_versions(rule_id);
CREATE INDEX IF NOT EXISTS idx_crv_created ON correlation_rule_versions(created_at DESC);

ALTER TABLE correlation_rule_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_rule_versions"
  ON correlation_rule_versions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "anon_read_rule_versions"
  ON correlation_rule_versions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "auth_insert_rule_versions"
  ON correlation_rule_versions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_update_rule_versions"
  ON correlation_rule_versions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
