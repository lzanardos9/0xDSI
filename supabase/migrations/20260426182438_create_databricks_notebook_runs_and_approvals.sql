/*
  # Databricks Notebook Runs & Response Approval Gates

  This migration adds production-grade tracking for Databricks notebook
  executions and a formal approval workflow for SOC response actions.

  1. New Tables
    - `databricks_notebook_runs`
      Tracks every notebook export, scheduled execution, and ingestion job.
      Columns: id, notebook_id, notebook_title, run_type (export/manual/scheduled/api),
      status (queued/running/succeeded/failed/cancelled), cluster_id, started_at,
      finished_at, duration_seconds, rows_processed, error_message, triggered_by,
      databricks_run_id, output_summary (jsonb), created_at.
    - `databricks_threat_feed_runs`
      Per-source threat feed pull log mirroring the Delta `feed_run_log`.
      Columns: id, source, status, indicators_ingested, started_at, finished_at,
      error_message.
    - `response_action_approvals`
      Approval gate enforcement for automated response actions. The response
      agent MUST insert an action with status='pending' and wait for an
      approver row before executing.
      Columns: id, action_id, action_type, target_entity, scope_summary (jsonb),
      requested_by, requested_at, status (pending/approved/rejected/expired),
      approved_by, approved_at, rejection_reason, executed_at, execution_result,
      ttl_minutes, created_at.

  2. Security
    - RLS enabled on all 3 tables.
    - SELECT/INSERT/UPDATE policies scoped to authenticated users.
    - Approvals: only authenticated users can approve, and the requester
      cannot approve their own request (enforced via policy + check).
*/

CREATE TABLE IF NOT EXISTS databricks_notebook_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notebook_id text NOT NULL,
  notebook_title text NOT NULL DEFAULT '',
  run_type text NOT NULL DEFAULT 'manual'
    CHECK (run_type IN ('export', 'manual', 'scheduled', 'api')),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  cluster_id text DEFAULT '',
  databricks_run_id text DEFAULT '',
  started_at timestamptz,
  finished_at timestamptz,
  duration_seconds integer DEFAULT 0,
  rows_processed bigint DEFAULT 0,
  error_message text DEFAULT '',
  triggered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  output_summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notebook_runs_notebook_id
  ON databricks_notebook_runs(notebook_id);
CREATE INDEX IF NOT EXISTS idx_notebook_runs_status
  ON databricks_notebook_runs(status);
CREATE INDEX IF NOT EXISTS idx_notebook_runs_created_at
  ON databricks_notebook_runs(created_at DESC);

ALTER TABLE databricks_notebook_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view notebook runs"
  ON databricks_notebook_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert notebook runs"
  ON databricks_notebook_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update their own notebook runs"
  ON databricks_notebook_runs FOR UPDATE
  TO authenticated
  USING (triggered_by = auth.uid() OR triggered_by IS NULL)
  WITH CHECK (triggered_by = auth.uid() OR triggered_by IS NULL);

CREATE TABLE IF NOT EXISTS databricks_threat_feed_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'success', 'failed')),
  indicators_ingested integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  error_message text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_runs_source
  ON databricks_threat_feed_runs(source);
CREATE INDEX IF NOT EXISTS idx_feed_runs_started_at
  ON databricks_threat_feed_runs(started_at DESC);

ALTER TABLE databricks_threat_feed_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view feed runs"
  ON databricks_threat_feed_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert feed runs"
  ON databricks_threat_feed_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update feed runs"
  ON databricks_threat_feed_runs FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS response_action_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id text NOT NULL UNIQUE,
  action_type text NOT NULL,
  target_entity text NOT NULL DEFAULT '',
  scope_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'executed')),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  rejection_reason text DEFAULT '',
  executed_at timestamptz,
  execution_result jsonb DEFAULT '{}'::jsonb,
  ttl_minutes integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT no_self_approval CHECK (
    approved_by IS NULL OR requested_by IS NULL OR approved_by <> requested_by
  )
);

CREATE INDEX IF NOT EXISTS idx_action_approvals_status
  ON response_action_approvals(status);
CREATE INDEX IF NOT EXISTS idx_action_approvals_action_id
  ON response_action_approvals(action_id);
CREATE INDEX IF NOT EXISTS idx_action_approvals_requested_at
  ON response_action_approvals(requested_at DESC);

ALTER TABLE response_action_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view approval requests"
  ON response_action_approvals FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can request approvals"
  ON response_action_approvals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND requested_by = auth.uid());

CREATE POLICY "Authenticated users can approve or reject (not their own)"
  ON response_action_approvals FOR UPDATE
  TO authenticated
  USING (
    auth.uid() IS NOT NULL
    AND (requested_by IS NULL OR requested_by <> auth.uid())
  )
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (requested_by IS NULL OR requested_by <> auth.uid())
  );
