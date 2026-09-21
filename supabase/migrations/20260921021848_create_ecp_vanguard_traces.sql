/*
# Ethical Control Plane — governed VANGUARD action traces

## Summary
Adds a read-only table that stores governed VANGUARD containment traces produced
by the deterministic authority kernel + response-action lifecycle (Phase 2
vertical slice). Each row is one representative scenario: a proposed containment
run through decide() for a reason-coded verdict, then through the
approve -> dispatch -> verify lifecycle. These traces are generated in code /
simulation, never from a live Databricks deployment, and are labeled as such.

## New Tables
- `ecp_vanguard_traces`
  - `id` (uuid, primary key)
  - `scenario` (text) — short human name of the scenario
  - `action_type` (text) — VANGUARD tool: block_ip / disable_user / isolate_host / quarantine_file / revoke_token
  - `target` (text) — the asset the action would touch
  - `effects` (jsonb) — kernel effect classes for this action
  - `kernel_decision` (text) — deterministic verdict (DENY / REQUIRE_APPROVAL / ...)
  - `kernel_reason_code` (text) — the single reason code carried by the decision
  - `kernel_why` (text) — plain explanation of the verdict
  - `lifecycle_state` (text, nullable) — final lifecycle state reached, or null when blocked
  - `intended_effect` (text, nullable) — observed state that would count as success
  - `steps` (jsonb) — ordered lifecycle steps actually reached
  - `honest_status` (text) — always SIMULATION for this environment
  - `sort_order` (int) — display order
  - `created_at` (timestamptz)

## Security
- Enable RLS on `ecp_vanguard_traces`.
- Read-only governance metadata seeded server-side. The console reads it with the
  anon key, so SELECT is granted `TO anon, authenticated` with `USING (true)`.
  No INSERT/UPDATE/DELETE policies are defined, so the table is not writable by
  the anon or authenticated client — it can only be seeded via privileged tooling.
*/

CREATE TABLE IF NOT EXISTS ecp_vanguard_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario text NOT NULL,
  action_type text NOT NULL,
  target text NOT NULL,
  effects jsonb NOT NULL DEFAULT '[]'::jsonb,
  kernel_decision text NOT NULL,
  kernel_reason_code text NOT NULL,
  kernel_why text NOT NULL,
  lifecycle_state text,
  intended_effect text,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  honest_status text NOT NULL DEFAULT 'SIMULATION',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ecp_vanguard_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_ecp_vanguard_traces" ON ecp_vanguard_traces;
CREATE POLICY "anon_select_ecp_vanguard_traces" ON ecp_vanguard_traces FOR SELECT
  TO anon, authenticated USING (true);
