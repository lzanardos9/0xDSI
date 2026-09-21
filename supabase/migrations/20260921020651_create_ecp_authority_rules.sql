/*
# Ethical Control Plane — Authority Rule Catalog (Phase 1)

1. New Tables
   - `ecp_authority_rules` — the deterministic authority kernel's rule catalog,
     mirrored from `databricks-native/notebooks/_shared/authority_kernel.py`
     (REASON_CATALOG). One row per rule the kernel can apply.
     - `reason_code` (text, primary key) — e.g. `ROE.SCOPE.UNAUTHORIZED_TARGET`.
     - `rule_name` (text) — short human name of the rule.
     - `decision` (text) — the outcome the rule yields (DENY / REQUIRE_APPROVAL /
       REQUIRE_REVIEW / SANDBOX_ONLY / PERMIT_WITH_CONSTRAINTS).
     - `why` (text) — plain explanation surfaced in the console.
     - `eval_order` (int) — the order the kernel evaluates rules (first match wins).
     - `updated_at` (timestamptz).

2. Security
   - Enable RLS on `ecp_authority_rules`.
   - Non-sensitive governance metadata surfaced read-only inside the operator app
     (which uses its own login, so it reads via the anon key). Allow SELECT to
     anon + authenticated. No client write policies — seeded server-side only.

3. Notes
   1. This is the source the console reads to show the exact deterministic rules
      the kernel enforces, honestly labelled VERIFIED_IN_CODE (the kernel exists
      and is unit-tested). It does not claim live enforcement on a workspace.
*/

CREATE TABLE IF NOT EXISTS ecp_authority_rules (
  reason_code text PRIMARY KEY,
  rule_name text NOT NULL DEFAULT '',
  decision text NOT NULL DEFAULT 'DENY',
  why text NOT NULL DEFAULT '',
  eval_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ecp_authority_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ecp_authority_rules" ON ecp_authority_rules;
CREATE POLICY "read_ecp_authority_rules" ON ecp_authority_rules FOR SELECT
  TO anon, authenticated USING (true);
