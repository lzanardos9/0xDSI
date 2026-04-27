/*
  # Detection Confluence System (Phase 1)

  Unified Signal Bus where every detection lens (rules, negative correlation,
  graph patterns, Detection SLM, vector hunting, formula prioritization, UEBA)
  emits into one stream. A Fusion Arbiter then collapses lens signals into a
  single prioritized verdict with full evidence lineage.

  1. New Tables
    - `confluence_lenses`        catalog of the seven scoring lenses
    - `confluence_signals`       one row per (event, lens, score) emission
    - `confluence_verdicts`      fused, prioritized incidents
    - `confluence_lineage`       graph edges raw_event -> signal -> verdict
    - `confluence_lens_weights`  per-tenant tunable weights (versioned)
    - `confluence_arbiter_runs`  every fusion evaluation with inputs/outputs

  2. Security
    - RLS enabled on every table
    - Anon + authenticated read (demo platform)
    - Authenticated write only

  3. Notes
    - Backwards compatible: existing engines keep running, they also emit signals
    - All scores normalized to [0,1]; confidence stored separately
    - Evidence stored as JSONB for flexibility across lens types
*/

CREATE TABLE IF NOT EXISTS confluence_lenses (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  category text NOT NULL DEFAULT 'detection',
  description text NOT NULL DEFAULT '',
  default_weight numeric NOT NULL DEFAULT 1.0,
  color_hex text NOT NULL DEFAULT '#38bdf8',
  icon_name text NOT NULL DEFAULT 'Activity',
  reasoning_type text NOT NULL DEFAULT 'symbolic',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS confluence_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text NOT NULL,
  lens_id text NOT NULL REFERENCES confluence_lenses(id) ON DELETE CASCADE,
  score numeric NOT NULL DEFAULT 0,
  confidence numeric NOT NULL DEFAULT 0,
  verdict_label text NOT NULL DEFAULT 'unknown',
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  latency_ms integer NOT NULL DEFAULT 0,
  model_version text NOT NULL DEFAULT 'v1',
  emitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confluence_signals_event ON confluence_signals(event_id);
CREATE INDEX IF NOT EXISTS idx_confluence_signals_lens ON confluence_signals(lens_id);
CREATE INDEX IF NOT EXISTS idx_confluence_signals_emitted ON confluence_signals(emitted_at DESC);

CREATE TABLE IF NOT EXISTS confluence_verdicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_key text NOT NULL,
  title text NOT NULL,
  fused_score numeric NOT NULL DEFAULT 0,
  priority text NOT NULL DEFAULT 'P3',
  status text NOT NULL DEFAULT 'open',
  contributing_lenses text[] NOT NULL DEFAULT '{}',
  contributing_event_ids text[] NOT NULL DEFAULT '{}',
  asset_criticality numeric NOT NULL DEFAULT 0.5,
  identity_blast_radius numeric NOT NULL DEFAULT 0.5,
  kill_chain_stage text NOT NULL DEFAULT 'reconnaissance',
  arbiter_mode text NOT NULL DEFAULT 'probabilistic',
  explanation_md text NOT NULL DEFAULT '',
  evidence_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confluence_verdicts_priority ON confluence_verdicts(priority);
CREATE INDEX IF NOT EXISTS idx_confluence_verdicts_score ON confluence_verdicts(fused_score DESC);
CREATE INDEX IF NOT EXISTS idx_confluence_verdicts_created ON confluence_verdicts(created_at DESC);

CREATE TABLE IF NOT EXISTS confluence_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_id uuid REFERENCES confluence_verdicts(id) ON DELETE CASCADE,
  signal_id uuid REFERENCES confluence_signals(id) ON DELETE CASCADE,
  source_event_id text NOT NULL,
  edge_type text NOT NULL DEFAULT 'contributes_to',
  weight numeric NOT NULL DEFAULT 1.0,
  rationale text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confluence_lineage_verdict ON confluence_lineage(verdict_id);

CREATE TABLE IF NOT EXISTS confluence_lens_weights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL DEFAULT 'default',
  lens_id text NOT NULL REFERENCES confluence_lenses(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1.0,
  active boolean NOT NULL DEFAULT true,
  rationale text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT 'system',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_confluence_weights_tenant ON confluence_lens_weights(tenant_id);

CREATE TABLE IF NOT EXISTS confluence_arbiter_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verdict_id uuid REFERENCES confluence_verdicts(id) ON DELETE CASCADE,
  arbiter_mode text NOT NULL DEFAULT 'probabilistic',
  inputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  outputs jsonb NOT NULL DEFAULT '{}'::jsonb,
  bayesian_updates jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer NOT NULL DEFAULT 0,
  ran_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE confluence_lenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_lineage ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_lens_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE confluence_arbiter_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lenses_anon_read') THEN
    CREATE POLICY "lenses_anon_read" ON confluence_lenses FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lenses_auth_write') THEN
    CREATE POLICY "lenses_auth_write" ON confluence_lenses FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lenses_auth_update') THEN
    CREATE POLICY "lenses_auth_update" ON confluence_lenses FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'signals_anon_read') THEN
    CREATE POLICY "signals_anon_read" ON confluence_signals FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'signals_auth_write') THEN
    CREATE POLICY "signals_auth_write" ON confluence_signals FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verdicts_anon_read') THEN
    CREATE POLICY "verdicts_anon_read" ON confluence_verdicts FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verdicts_auth_write') THEN
    CREATE POLICY "verdicts_auth_write" ON confluence_verdicts FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'verdicts_auth_update') THEN
    CREATE POLICY "verdicts_auth_update" ON confluence_verdicts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lineage_anon_read') THEN
    CREATE POLICY "lineage_anon_read" ON confluence_lineage FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'lineage_auth_write') THEN
    CREATE POLICY "lineage_auth_write" ON confluence_lineage FOR INSERT TO authenticated WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'weights_anon_read') THEN
    CREATE POLICY "weights_anon_read" ON confluence_lens_weights FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'weights_auth_write') THEN
    CREATE POLICY "weights_auth_write" ON confluence_lens_weights FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'weights_auth_update') THEN
    CREATE POLICY "weights_auth_update" ON confluence_lens_weights FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'arbiter_anon_read') THEN
    CREATE POLICY "arbiter_anon_read" ON confluence_arbiter_runs FOR SELECT TO anon, authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'arbiter_auth_write') THEN
    CREATE POLICY "arbiter_auth_write" ON confluence_arbiter_runs FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

INSERT INTO confluence_lenses (id, display_name, category, description, default_weight, color_hex, icon_name, reasoning_type) VALUES
  ('rules',     'Correlation Rules / CEP',   'detection',     'Hard-rule pattern matches with deterministic MITRE mapping', 1.10, '#f97316', 'Zap',         'symbolic'),
  ('negative',  'Negative Correlation',      'detection',     'Expected-but-missing baseline anomalies (suppression of trust)', 1.20, '#ef4444', 'AlertTriangle','symbolic'),
  ('graph',     'Graph Pattern Match',       'graph',         'Subgraph isomorphism over identity, asset, and process graphs',  1.05, '#22d3ee', 'Network',     'symbolic'),
  ('slm',       'Detection SLM',             'ml',            'Autoregressive sequence model over OCSF token streams',          0.90, '#38bdf8', 'Brain',       'neural'),
  ('vector',    'Vector Threat Hunting',     'ml',            'Semantic neighbor risk via dense embeddings',                    0.85, '#10b981', 'Target',      'neural'),
  ('formula',   'Formula Prioritization',    'arithmetic',    'Tunable risk algebra over asset, identity, and exposure',        1.00, '#eab308', 'Gauge',       'symbolic'),
  ('behavior',  'Behavioral / UEBA',         'behavioral',    'Identity peer-deviation and psychological risk profiling',       0.95, '#f472b6', 'Users',       'neural')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description  = EXCLUDED.description,
  default_weight = EXCLUDED.default_weight,
  color_hex    = EXCLUDED.color_hex,
  reasoning_type = EXCLUDED.reasoning_type;

INSERT INTO confluence_lens_weights (tenant_id, lens_id, weight, rationale, updated_by)
SELECT 'default', id, default_weight, 'seeded from default', 'system'
FROM confluence_lenses
ON CONFLICT DO NOTHING;
