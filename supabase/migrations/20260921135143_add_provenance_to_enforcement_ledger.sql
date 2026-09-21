-- Phase 7: provenance distinguishes dry-run rows (simulated) from rows written
-- against the live workspace (live). The promotion gate only lets a 'live',
-- executed, VERIFIED row lift an agent to VERIFIED_IN_DEPLOYMENT. Existing rows
-- are all dry-run output, so they default to 'simulated'.
ALTER TABLE ecp_enforcement_ledger
  ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'simulated';

ALTER TABLE ecp_enforcement_ledger
  DROP CONSTRAINT IF EXISTS ecp_enforcement_ledger_provenance_check;
ALTER TABLE ecp_enforcement_ledger
  ADD CONSTRAINT ecp_enforcement_ledger_provenance_check
  CHECK (provenance IN ('simulated', 'live'));
