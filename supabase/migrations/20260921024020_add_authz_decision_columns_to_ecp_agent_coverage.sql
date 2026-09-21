/*
# Ethical Control Plane — Phase 4: explicit authorization decisions

## Summary
The 9 agents previously left implicitly at honest_status = 'PROPOSED' now each
receive an explicit authorization decision recorded on their coverage row. This
migration adds three nullable columns to hold that decision, its rationale, and
its conditions. No data is dropped or retyped.

## Modified Tables
- `ecp_agent_coverage`
  - add `authz_decision` (text) — one of 'GOVERN' | 'RESTRICT' | 'DENY' | '' (none yet)
  - add `authz_rationale` (text) — plain rationale for the decision
  - add `authz_conditions` (text) — conditions attached to the decision

## Security
- RLS remains as-is (read-only SELECT policy for anon/authenticated). Adding
  columns does not change access.

## Notes
1. Columns are added conditionally so the migration is safe to re-run.
2. Existing rows default to empty strings (no decision recorded yet); the
   Phase 4 data seed fills them in a follow-up statement.
*/

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecp_agent_coverage' AND column_name = 'authz_decision') THEN
    ALTER TABLE ecp_agent_coverage ADD COLUMN authz_decision text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecp_agent_coverage' AND column_name = 'authz_rationale') THEN
    ALTER TABLE ecp_agent_coverage ADD COLUMN authz_rationale text NOT NULL DEFAULT '';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ecp_agent_coverage' AND column_name = 'authz_conditions') THEN
    ALTER TABLE ecp_agent_coverage ADD COLUMN authz_conditions text NOT NULL DEFAULT '';
  END IF;
END $$;
