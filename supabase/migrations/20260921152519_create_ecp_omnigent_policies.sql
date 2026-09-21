/*
# Omnigent policy bindings (Phase 9 — operator-authored PEP rules)

Introduces the operator-managed policy layer for the Omnigent Policy Enforcement
Point (PEP). Each row binds an agent action path to a runner-level decision
(ALLOW / DENY / ASK). The resolver in `_shared/omnigent_pep.py` reads these rows,
matches an action by agent + action type + target glob, and returns the effective
decision (deny-by-default, highest priority wins). These are real, code-resolved
records the operator can create, edit, enable/disable and delete from the console.

HONESTY NOTE: authoring a binding here does NOT mean a live Omnigent runner is
mediating that agent's action paths. The binding is resolved in code
(VERIFIED_IN_CODE); provenance defaults to 'proposed'. No agent is labelled
FULLY_GOVERNED until a real runner mediates it against a live workspace.

1. New Tables
   - `ecp_omnigent_policies`
     - `id` (uuid, pk)
     - `agent_key` (text) — stable key of the governed agent the rule applies to; '*' = any agent
     - `agent_name` (text) — human-readable agent name for display
     - `action_type` (text) — action the rule governs; '*' = any action
     - `target_glob` (text) — glob matched against the action target; '*' = any target
     - `decision` (text) — ALLOW | DENY | ASK (runner-level policy verdict)
     - `priority` (int) — higher wins when multiple rules match
     - `enabled` (boolean) — disabled rules are ignored by the resolver
     - `rationale` (text) — why this binding exists (operator note)
     - `created_by` (text) — operator label
     - `provenance` (text) — 'proposed' until a live runner mediates the path
     - `created_at`, `updated_at` (timestamptz)

2. Security
   - Enable RLS on `ecp_omnigent_policies`.
   - Single-tenant operator console (no per-user sign-in): grant full CRUD to
     anon + authenticated so the console can manage bindings. Data is shared
     operational state, not per-user private data.

3. Notes
   1. `decision` is constrained to the three PEP verdicts.
   2. Idempotent: safe to re-run. Seed uses ON CONFLICT DO NOTHING on a natural key.
*/

CREATE TABLE IF NOT EXISTS ecp_omnigent_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL,
  agent_name text NOT NULL,
  action_type text NOT NULL DEFAULT '*',
  target_glob text NOT NULL DEFAULT '*',
  decision text NOT NULL CHECK (decision IN ('ALLOW', 'DENY', 'ASK')),
  priority integer NOT NULL DEFAULT 100,
  enabled boolean NOT NULL DEFAULT true,
  rationale text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT 'operator',
  provenance text NOT NULL DEFAULT 'proposed',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ecp_omnigent_policies_natural_key
  ON ecp_omnigent_policies (agent_key, action_type, target_glob);

ALTER TABLE ecp_omnigent_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omnigent_policies_select" ON ecp_omnigent_policies;
CREATE POLICY "omnigent_policies_select" ON ecp_omnigent_policies FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "omnigent_policies_insert" ON ecp_omnigent_policies;
CREATE POLICY "omnigent_policies_insert" ON ecp_omnigent_policies FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "omnigent_policies_update" ON ecp_omnigent_policies;
CREATE POLICY "omnigent_policies_update" ON ecp_omnigent_policies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "omnigent_policies_delete" ON ecp_omnigent_policies;
CREATE POLICY "omnigent_policies_delete" ON ecp_omnigent_policies FOR DELETE
  TO anon, authenticated USING (true);

INSERT INTO ecp_omnigent_policies (agent_key, agent_name, action_type, target_glob, decision, priority, enabled, rationale, created_by)
VALUES
  ('*', 'All agents', '*', '*', 'DENY', 0, true, 'Deny-by-default backstop: nothing is authorized unless a higher-priority rule allows or asks.', 'system'),
  ('vanguard_response', 'VANGUARD Response', 'isolate_host', '*', 'ASK', 200, true, 'Host isolation is A3 autonomy: always require a human operator decision before the runner proceeds.', 'system'),
  ('vanguard_response', 'VANGUARD Response', 'block_ip', '10.*', 'ASK', 200, true, 'Blocking internal RFC1918 ranges can cause outages — escalate to a human.', 'system'),
  ('vanguard_response', 'VANGUARD Response', 'block_ip', '*', 'ALLOW', 150, true, 'External IP blocks on an approved, in-scope finding may proceed under lease control.', 'system'),
  ('sage_enrichment', 'SAGE Enrichment', 'enrich_ioc', '*', 'ALLOW', 120, true, 'Read-only enrichment is safe to allow at the runner level.', 'system'),
  ('nova_investigation', 'NOVA Investigation', 'query_delta', '*', 'ALLOW', 120, true, 'Investigative Delta queries are read-only and allowed.', 'system')
ON CONFLICT (agent_key, action_type, target_glob) DO NOTHING;
