/*
  # Operation Borrowed Authority — backend detection persistence

  Establishes a single source of detection truth. The detection engine runs
  server-side (in the `oba-engine` edge function), reads raw telemetry, and
  PERSISTS its computed findings here. The frontend only READS these tables;
  it never computes a verdict itself. Disconnect the engine and no new verdict
  can appear.

  1. New Tables
    - `oba_analysis_runs` — one row per engine execution.
      - `run_id` (uuid, pk)
      - `created_at` (timestamptz)
      - `label_mode` (text) — 'demo' (real seeded telemetry) or 'blind' (identities randomized, no labels given to the engine)
      - `identity_seed` (text, nullable) — seed used for a blind run
      - `engine_version` (text)
      - `source` (text) — always 'oba-engine'
      - `primary_status` (text, nullable) — the top finding's verdict
      - `is_active` (boolean)
      - `notes` (text, nullable)
    - `oba_analysis_snapshots` — the full structured AnalysisResult per evidence cut.
      - `id` (uuid, pk), `run_id` (fk), `evidence_cut` ('pre_late' | 'post_late'), `payload` (jsonb)
    - `oba_findings` — typed per-branch findings (queryable proof the verdict is data-derived).
      - `id`, `run_id`, `evidence_cut`, `kind`, `status`, `severity`, `subject_agent`,
        `execution_id`, `completeness`, `coverage_state`, `belief`, `plausibility`,
        `uncertainty`, `winning_hypothesis`, `narrative`, `matched_event_ids` (jsonb)
    - `oba_coverage` — per-source observability state (separate from the verdict).
      - `id`, `run_id`, `source_system`, `required`, `state`, `observed_events`, `detail`

  2. Security
    - RLS enabled on all four tables.
    - SELECT allowed for `anon, authenticated` (this is a shared read-only demo,
      consistent with the existing `oba_events` / `oba_authorizations` tables).
    - No INSERT/UPDATE/DELETE policies: only the edge function (service role,
      which bypasses RLS) writes here. The anon-key frontend cannot fabricate a run.

  3. Notes
    1. `oba_events` and `oba_authorizations` remain the raw-telemetry source of truth.
    2. These tables hold DERIVED output only; deleting them and re-running the
       engine reproduces identical findings from the raw rows.
*/

CREATE TABLE IF NOT EXISTS oba_analysis_runs (
  run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  label_mode text NOT NULL DEFAULT 'demo',
  identity_seed text,
  engine_version text NOT NULL DEFAULT 'v1',
  source text NOT NULL DEFAULT 'oba-engine',
  primary_status text,
  is_active boolean NOT NULL DEFAULT true,
  notes text
);

CREATE TABLE IF NOT EXISTS oba_analysis_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES oba_analysis_runs(run_id) ON DELETE CASCADE,
  evidence_cut text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oba_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES oba_analysis_runs(run_id) ON DELETE CASCADE,
  evidence_cut text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  severity text NOT NULL,
  subject_agent text NOT NULL,
  execution_id text NOT NULL,
  completeness numeric NOT NULL DEFAULT 0,
  coverage_state text NOT NULL DEFAULT 'operational',
  belief numeric NOT NULL DEFAULT 0,
  plausibility numeric NOT NULL DEFAULT 0,
  uncertainty numeric NOT NULL DEFAULT 0,
  winning_hypothesis text,
  narrative text,
  matched_event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS oba_coverage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES oba_analysis_runs(run_id) ON DELETE CASCADE,
  source_system text NOT NULL,
  required boolean NOT NULL DEFAULT true,
  state text NOT NULL,
  observed_events integer NOT NULL DEFAULT 0,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_oba_runs_created ON oba_analysis_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_oba_snapshots_run ON oba_analysis_snapshots (run_id);
CREATE INDEX IF NOT EXISTS idx_oba_findings_run ON oba_findings (run_id);
CREATE INDEX IF NOT EXISTS idx_oba_coverage_run ON oba_coverage (run_id);

ALTER TABLE oba_analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE oba_analysis_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE oba_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE oba_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "oba_runs_read" ON oba_analysis_runs;
CREATE POLICY "oba_runs_read" ON oba_analysis_runs FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "oba_snapshots_read" ON oba_analysis_snapshots;
CREATE POLICY "oba_snapshots_read" ON oba_analysis_snapshots FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "oba_findings_read" ON oba_findings;
CREATE POLICY "oba_findings_read" ON oba_findings FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "oba_coverage_read" ON oba_coverage;
CREATE POLICY "oba_coverage_read" ON oba_coverage FOR SELECT TO anon, authenticated USING (true);