/*
# Ethical Control Plane — Phase 5: enforcement audit ledger

## Summary
Phase 5 introduces the enforcement chokepoint (enforcement.py), the single
sanctioned path from a proposed action to a real side effect. Every attempt it
processes -- allowed or blocked -- produces one append-only audit record. This
migration creates the table that stores those records so the console's Evidence
Ledger can render the real, code-produced audit trail instead of a simulation.

## New Tables
- `ecp_enforcement_ledger` (append-only audit of every guarded dispatch attempt)
  - `id` uuid pk
  - `recorded_at` timestamptz — when the attempt was processed
  - `agent_key` / `agent_name` text — the governed agent
  - `action_type` text, `target` text — what was attempted
  - `proposed_by` text, `approved_by` text — the two-person control
  - `kernel_decision` text, `kernel_reason_code` text — the authority verdict
  - `outcome` text — BLOCKED | NOT_AUTHORIZED | EXECUTE_ERROR | VERIFIED | FAILED
  - `executed` boolean — whether the real side effect was actually invoked
  - `observed_state` text — the state the target was observed in (nullable)
  - `steps` jsonb — the ordered lifecycle steps for this attempt
  - `sort_order` int — stable display ordering

## Security
- RLS enabled. This is a read-only public artifact for the operator console, so
  a single SELECT policy is granted TO anon, authenticated. No INSERT / UPDATE /
  DELETE policies exist for those roles: the ledger is append-only and is seeded
  server-side (service role), never written from the browser.

## Notes
1. No destructive operations; new table only.
*/

CREATE TABLE IF NOT EXISTS ecp_enforcement_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  agent_key text NOT NULL DEFAULT '',
  agent_name text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT '',
  target text NOT NULL DEFAULT '',
  proposed_by text NOT NULL DEFAULT '',
  approved_by text NOT NULL DEFAULT '',
  kernel_decision text NOT NULL DEFAULT '',
  kernel_reason_code text NOT NULL DEFAULT '',
  outcome text NOT NULL DEFAULT '',
  executed boolean NOT NULL DEFAULT false,
  observed_state text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE ecp_enforcement_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_enforcement_ledger" ON ecp_enforcement_ledger
  FOR SELECT TO anon, authenticated USING (true);
