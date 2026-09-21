/*
# Ethical Control Plane — Agent Coverage Matrix (Phase 0)

1. New Tables
   - `ecp_agent_coverage` — one row per Databricks-native agent notebook, the
     honest Phase 0 inventory of what each agent is and how it is governed today.
     - `file` (text, primary key) — the notebook filename, e.g. `07_vanguard_response.py`.
     - `agent_name` (text) — human name/role of the agent.
     - `role` (text) — short functional category.
     - `autonomy` (text) — bounded-agency level A0..A4.
     - `coverage_mode` (text) — OBSERVE_ONLY / ADVISORY / GATEWAY_ENFORCED /
       RUNTIME_CONTAINED / SANDBOX_ONLY / SIMULATION.
     - `can_act` (boolean) — true only when the agent can change external state
       (containment, config push, token revoke, sending mail), false for read/analysis.
     - `honest_status` (text) — VERIFIED_IN_CODE / PROPOSED / SIMULATION. Never
       VERIFIED_IN_DEPLOYMENT — deployment cannot be verified from this environment.
     - `governance` (text) — plain description of the control actually in code today.
     - `notes` (text) — reviewer notes / caveats.
     - `sort_order` (int) — display ordering.
     - `updated_at` (timestamptz) — last refresh.

2. Security
   - Enable RLS on `ecp_agent_coverage`.
   - This is non-sensitive repository governance metadata surfaced read-only inside
     the operator app (which uses its own login, so it reads via the anon key).
     Allow SELECT to anon + authenticated. No client write policies — the matrix is
     seeded/maintained server-side only.

3. Notes
   1. The table is the source of truth the Ethical Control Plane console reads to
      render the real agent registry, replacing the earlier mock data.
   2. Nothing here enforces anything on a live workspace; it records what the code
      does, honestly labeled.
*/

CREATE TABLE IF NOT EXISTS ecp_agent_coverage (
  file text PRIMARY KEY,
  agent_name text NOT NULL,
  role text NOT NULL DEFAULT '',
  autonomy text NOT NULL DEFAULT 'A0',
  coverage_mode text NOT NULL DEFAULT 'OBSERVE_ONLY',
  can_act boolean NOT NULL DEFAULT false,
  honest_status text NOT NULL DEFAULT 'VERIFIED_IN_CODE',
  governance text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecp_agent_coverage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ecp_agent_coverage" ON ecp_agent_coverage;
CREATE POLICY "read_ecp_agent_coverage" ON ecp_agent_coverage FOR SELECT
  TO anon, authenticated USING (true);
