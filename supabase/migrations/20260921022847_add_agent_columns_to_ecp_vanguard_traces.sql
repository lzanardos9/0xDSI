/*
# Ethical Control Plane — generalize governed traces to all action-capable agents

## Summary
Phase 3 extends the governed pattern beyond VANGUARD to the other two
action-capable agents (Autonomous Response Learner, Edge Control Plane). To let
the console show which agent each governed trace belongs to, this migration adds
two nullable columns to the existing `ecp_vanguard_traces` table. No data is
dropped or retyped; existing VANGUARD rows keep working and are backfilled to the
'vanguard' agent.

## Modified Tables
- `ecp_vanguard_traces`
  - add `agent_key` (text, default 'vanguard') — stable key of the governed agent
    (vanguard / arl / edge)
  - add `agent_name` (text, default 'VANGUARD Response') — display name of the agent

## Security
- RLS is already enabled on the table with a read-only `TO anon, authenticated`
  SELECT policy; adding columns does not change that. The table remains
  seed-only (no INSERT/UPDATE/DELETE policies for anon/authenticated).

## Notes
1. Columns are added conditionally so the migration is safe to re-run.
2. Existing rows are backfilled to the VANGUARD agent to preserve current display.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecp_vanguard_traces' AND column_name = 'agent_key'
  ) THEN
    ALTER TABLE ecp_vanguard_traces ADD COLUMN agent_key text NOT NULL DEFAULT 'vanguard';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecp_vanguard_traces' AND column_name = 'agent_name'
  ) THEN
    ALTER TABLE ecp_vanguard_traces ADD COLUMN agent_name text NOT NULL DEFAULT 'VANGUARD Response';
  END IF;
END $$;
