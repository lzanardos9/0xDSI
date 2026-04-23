/*
  # Extend Feature Lab with architecture plans, backend code, and lifecycle

  1. New columns on feature_lab_creations
    - architecture_plan (jsonb) - structured design: components, data flows, diagram nodes/links, Databricks integrations
    - feature_type (text) - 'app' for HTML frontends, 'backend' for notebooks/agents/pipelines
    - generated_code (text) - Python/SQL code for backend features
    - code_language (text) - python | sql | yaml | typescript
    - status (text) - draft | testing | homologation | production
    - share_token (text, unique) - short shareable slug
    - test_results (jsonb) - automated validation output
    - homolog_results (jsonb) - manual QA sign-off notes
    - promoted_to_production_at (timestamptz)
    - databricks_features (jsonb) - list of Databricks products wired into the plan

  2. Security
    - Policies unchanged (broad read, anon insert demo)
    - New columns are additive; existing rows get safe defaults
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='architecture_plan') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN architecture_plan jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='feature_type') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN feature_type text DEFAULT 'app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='generated_code') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN generated_code text DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='code_language') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN code_language text DEFAULT 'python';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='status') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN status text DEFAULT 'draft';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='share_token') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN share_token text;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_lab_share_token ON feature_lab_creations(share_token) WHERE share_token IS NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='test_results') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN test_results jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='homolog_results') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN homolog_results jsonb DEFAULT '{}'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='promoted_to_production_at') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN promoted_to_production_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='feature_lab_creations' AND column_name='databricks_features') THEN
    ALTER TABLE feature_lab_creations ADD COLUMN databricks_features jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_feature_lab_status ON feature_lab_creations(status);
CREATE INDEX IF NOT EXISTS idx_feature_lab_feature_type ON feature_lab_creations(feature_type);
