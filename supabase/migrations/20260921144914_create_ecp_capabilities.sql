/*
# Ethical Control Plane — Phase 8/9: capability-lease ledger

## Summary
Phase 8 turned authorization into a signed, single-use, argument-bound capability
lease (the `_shared/capability.py` module) and added a connector-side
revalidation gate to the enforcement chokepoint. Until now the operator console's
"Capability Leases" view rendered fabricated demo rows. This migration creates the
table that stores REAL, code-produced lease records so the console shows honest
lifecycle outcomes instead of a simulation.

The seed rows are a faithful mirror of the output of
`databricks-native/tests/harness/capability_ledger.py`, which drives real leases
through the chokepoint's connector-revalidation gate across seven scenarios. Every
`status`, `reason_code` and `dispatch_outcome` below is exactly what the code
decided; only the display `capability_id`/`action_hash` are shortened
representations of a run.

## New Tables
- `ecp_capabilities` (append-only ledger of capability-lease redemptions)
  - `id` uuid pk
  - `capability_id` text — the lease id (display form), unique
  - `agent_key` / `agent_name` text — the holder agent
  - `action_type` / `target` text — the action the lease is bound to
  - `issued_by` text — the operator/authority that minted the lease
  - `issued_to` text — the identity the lease was issued to (the holder)
  - `action_hash` text — the canonical action fingerprint the lease binds to
  - `issued_at` / `expires_at` timestamptz — the validity window
  - `max_uses` int / `uses_consumed` int — single-use by default
  - `revoked` boolean — whether the lease was revoked
  - `status` text — ACTIVE | CONSUMED | EXHAUSTED | REVOKED | EXPIRED | INVALID
  - `reason_code` text — the stable reason the last redemption returned
  - `dispatched` boolean — whether the workspace was actually commanded
  - `dispatch_outcome` text — the chokepoint outcome (VERIFIED / NOT_AUTHORIZED / ...)
  - `provenance` text — 'simulated' | 'live' (defaults 'simulated', fail closed)
  - `scenario` text — human-readable description of the attempt
  - `sort_order` int — stable display ordering

## Security
- RLS enabled. This is a read-only public artifact for the operator console, so a
  single SELECT policy is granted TO anon, authenticated. No INSERT / UPDATE /
  DELETE policies exist for those roles: the ledger is append-only and is seeded
  server-side (service role), never written from the browser.

## Notes
1. No destructive operations; new table only. Seed is idempotent via a unique
   `capability_id` and ON CONFLICT DO NOTHING, so re-running is safe.
2. `provenance` mirrors the enforcement ledger: every current row is 'simulated'
   because nothing has run against a live workspace.
*/

CREATE TABLE IF NOT EXISTS ecp_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability_id text UNIQUE NOT NULL,
  agent_key text NOT NULL DEFAULT '',
  agent_name text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT '',
  target text NOT NULL DEFAULT '',
  issued_by text NOT NULL DEFAULT '',
  issued_to text NOT NULL DEFAULT '',
  action_hash text NOT NULL DEFAULT '',
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now(),
  max_uses int NOT NULL DEFAULT 1,
  uses_consumed int NOT NULL DEFAULT 0,
  revoked boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ACTIVE',
  reason_code text NOT NULL DEFAULT '',
  dispatched boolean NOT NULL DEFAULT false,
  dispatch_outcome text NOT NULL DEFAULT '',
  provenance text NOT NULL DEFAULT 'simulated',
  scenario text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE ecp_capabilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_capabilities" ON ecp_capabilities;
CREATE POLICY "select_capabilities" ON ecp_capabilities
  FOR SELECT TO anon, authenticated USING (true);

INSERT INTO ecp_capabilities
  (capability_id, agent_key, agent_name, action_type, target, issued_by, issued_to,
   action_hash, issued_at, expires_at, max_uses, uses_consumed, revoked, status,
   reason_code, dispatched, dispatch_outcome, provenance, scenario, sort_order)
VALUES
  ('cap-9f2a1c04e7', 'vanguard', 'VANGUARD Response', 'isolate_host', 'host:WIN-FIN-204',
   'op-ciso', 'vanguard', '3b9f0a7c1d2e4f60', to_timestamp(1700000000), to_timestamp(1700000120),
   1, 1, false, 'CONSUMED', 'OK', true, 'VERIFIED', 'simulated',
   'Clean single-use redemption: lease bound to this exact action, redeemed once, workspace verified by read-back.', 0),

  ('cap-9f2a1c04e7-replay', 'vanguard', 'VANGUARD Response', 'isolate_host', 'host:WIN-FIN-204',
   'op-ciso', 'vanguard', '3b9f0a7c1d2e4f60', to_timestamp(1700000000), to_timestamp(1700000120),
   1, 1, false, 'EXHAUSTED', 'CAPABILITY.EXHAUSTED', false, 'NOT_AUTHORIZED', 'simulated',
   'Replay of an already-spent single-use lease: refused as exhausted, workspace never touched.', 1),

  ('cap-3a7b52d9f1', 'vanguard', 'VANGUARD Response', 'block_ip', 'ip:45.9.13.7',
   'op-ciso', 'vanguard', '7c1d2e4f60a3b9f0', to_timestamp(1700000000), to_timestamp(1700000120),
   1, 0, false, 'ACTIVE', 'CAPABILITY.ARGUMENT_MISMATCH', false, 'NOT_AUTHORIZED', 'simulated',
   'Argument changed after approval (TOCTOU): lease minted for ip:5.188.10.7, redeemed for ip:45.9.13.7 — refused, no use burned.', 2),

  ('cap-c1140e6b83', 'edge', 'Edge Connector Control Plane', 'upgrade', 'collector:edge-eu-07',
   'op-fleet', 'edge', 'a3b9f07c1d2e4f60', to_timestamp(1700000000), to_timestamp(1700000300),
   2, 1, false, 'ACTIVE', 'OK', true, 'VERIFIED', 'simulated',
   'Multi-use lease (max 2), first redemption: workspace verified, one use remaining.', 3),

  ('cap-b40f7e2a95', 'active_list', 'Active List Manager', 'add_to_blocklist', 'ip:45.9.13.7',
   'op-soc', 'active_list', '2e4f60a3b9f07c1d', to_timestamp(1700000000), to_timestamp(1700000120),
   1, 0, true, 'REVOKED', 'CAPABILITY.REVOKED', false, 'NOT_AUTHORIZED', 'simulated',
   'Revoked before redemption: the chokepoint fails closed, workspace never touched.', 4),

  ('cap-d5518af06c', 'vanguard', 'VANGUARD Response', 'isolate_host', 'host:LNX-DB-31',
   'op-ciso', 'vanguard', '60a3b9f07c1d2e4f', to_timestamp(1700000000), to_timestamp(1700000060),
   1, 0, false, 'EXPIRED', 'CAPABILITY.EXPIRED', false, 'NOT_AUTHORIZED', 'simulated',
   'Expired lease: redemption attempted after the validity window closed — refused, workspace never touched.', 5),

  ('cap-e6629bf17d', 'vanguard', 'VANGUARD Response', 'isolate_host', 'host:WIN-FIN-204',
   'op-ciso', 'vanguard', 'f60a3b9f07c1d2e4', to_timestamp(1700000000), to_timestamp(1700000120),
   999, 0, false, 'INVALID', 'CAPABILITY.SIGNATURE_INVALID', false, 'NOT_AUTHORIZED', 'simulated',
   'Forged lease: max_uses widened to 999 after minting — the signature no longer verifies, refused before any check of the window.', 6)
ON CONFLICT (capability_id) DO NOTHING;
