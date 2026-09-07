/*
# Seed "Operation Borrowed Trust" CET demo scenario

Adds a complete, clickable Complete Event Trend (CET) scenario to the Trend Engine
screen so the "Operation Borrowed Trust" narrative has real data behind it. The story:
one shared machine identity ("release-service") runs three executions. Execution A is a
benign deploy. Execution B is a reconciliation job that LOOKS malicious until a delayed
authorization event arrives out of order, at which point its trend is WITHDRAWN. Execution
C escalates privileges, reads restricted records, and exfiltrates them — a trend that
PERSISTS as critical. This demonstrates branching, out-of-order/event-time handling, and
the retraction lifecycle that differentiates the native CET engine.

## Tables seeded (existing tables, demo rows only — keyed with obt-* / cet-obt-* ids)

1. trend_queries        - two Kleene "skip-till-any-match" standing queries (export chain, recon chain)
2. trend_graph_nodes    - the identity, the three execution branches, resources, crown jewels, exfil sink
3. trend_graph_edges    - branch edges tagged by on_trend_key so the Live Graph filter shows each chain
4. trend_complete       - two detected trends: obt-c-export (critical, persists), obt-b-recon (withdrawn)
5. trend_graphlets      - two overlapping-window graphlets showing Lakebase reuse across the scenario

## Security

All five tables already have RLS enabled with anon+authenticated read policies from prior
migrations; no policy changes are made here. This migration only inserts/replaces demo rows.

## Idempotency

1. Each section first DELETEs only its own obt-* / cet-obt-* keyed demo rows, then re-inserts.
   No user data is touched — these keys are unique to this demo scenario.
*/

-- 1. Standing Kleene queries -------------------------------------------------
DELETE FROM trend_queries WHERE query_id IN ('cet-obt-export', 'cet-obt-recon');

INSERT INTO trend_queries (query_id, name, category, semantics, window_seconds, min_hops, max_hops, predicate_yaml, mitre_techniques, enabled) VALUES
('cet-obt-export', 'Borrowed Trust · privilege → restricted read → exfil', 'exfiltration', 'skip-till-any-match', 600, 3, 6,
$yaml$query: cet-obt-export
semantics: skip-till-any-match
window: 10m sliding, event-time
start:
  identity.kind: service
  identity.name: release-service
sequence:
  - privilege_change:        # T1078 valid-account escalation
      grants: [restricted-data:read]
  - data_access:             # T1005 data from local system
      target.tier: restricted
      NOT preceded_by: change_ticket   # absence predicate
  - outbound_transfer:       # T1041 exfil over C2/egress
      destination.trust: external
emit_when: all_matched
retract_when: NEVER          # authorized exfil is still exfil
$yaml$,
ARRAY['T1078', 'T1005', 'T1041'], true),

('cet-obt-recon', 'Borrowed Trust · shared identity reconciliation (retractable)', 'discovery', 'skip-till-any-match', 600, 2, 5,
$yaml$query: cet-obt-recon
semantics: skip-till-any-match
window: 10m sliding, event-time
start:
  identity.kind: service
  identity.name: release-service
sequence:
  - job_start:
      job.class: reconciliation
  - data_access:
      target.tier: production
      NOT preceded_by: authorization   # provisional: fires on ABSENCE
  - write_output:
      destination.trust: internal
emit_when: all_matched
retract_when: authorization.arrives    # late event withdraws the trend
$yaml$,
ARRAY['T1078', 'T1087'], true);

-- 2. Graph nodes -------------------------------------------------------------
DELETE FROM trend_graph_nodes WHERE node_id LIKE 'obt-%';

INSERT INTO trend_graph_nodes (node_id, label, node_type, x, y, risk, cluster, metadata) VALUES
('obt-rs',  'release-service', 'identity', 140, 280, 0.75, 'user',        '{"kind":"service","note":"shared machine identity — the borrowed trust"}'),
-- Execution C (malicious, persists)
('obt-pc',  'priv-change',     'privilege', 360, 150, 0.85, 'attack',      '{"grant":"restricted-data:read","event_time":"09:01","arrived":"09:06 (late)"}'),
('obt-rd',  'restricted-recs', 'resource',  600, 120, 0.90, 'crown_jewel', '{"tier":"restricted","records":48210}'),
('obt-xd',  'external-dest',   'endpoint',  860, 130, 0.95, 'attack',      '{"trust":"external","bytes":"1.4GB"}'),
-- Execution B (provisional, withdrawn)
('obt-rj',  'recon-job',       'process',   360, 400, 0.45, 'app',         '{"class":"reconciliation","event_time":"09:02"}'),
('obt-pr',  'prod-records',    'resource',  600, 400, 0.55, 'data',        '{"tier":"production"}'),
('obt-ro',  'recon-output',    'resource',  860, 400, 0.30, 'app',         '{"trust":"internal","note":"authorized after the fact"}'),
-- Execution A (benign deploy)
('obt-dep', 'deploy-step',     'process',   360, 280, 0.20, 'build',       '{"class":"deploy"}'),
('obt-cfg', 'config-store',    'resource',  600, 280, 0.25, 'build',       '{"tier":"config"}');

-- 3. Graph edges -------------------------------------------------------------
DELETE FROM trend_graph_edges WHERE edge_id LIKE 'obte-%';

INSERT INTO trend_graph_edges (edge_id, src_id, dst_id, edge_type, ts_offset_s, weight, on_trend_key, metadata) VALUES
-- Execution C chain (critical, persists) -> on_trend_key obt-c-export
('obte-c1', 'obt-rs', 'obt-pc', 'privilege_change',  60, 0.85, 'obt-c-export', '{"technique":"T1078","out_of_order":true}'),
('obte-c2', 'obt-pc', 'obt-rd', 'data_access',      180, 0.90, 'obt-c-export', '{"technique":"T1005"}'),
('obte-c3', 'obt-rd', 'obt-xd', 'outbound_transfer',240, 0.95, 'obt-c-export', '{"technique":"T1041"}'),
-- Execution B chain (provisional -> withdrawn) -> on_trend_key obt-b-recon
('obte-b1', 'obt-rs', 'obt-rj', 'job_start',         30, 0.40, 'obt-b-recon', '{}'),
('obte-b2', 'obt-rj', 'obt-pr', 'data_access',      120, 0.55, 'obt-b-recon', '{"technique":"T1087","provisional":true}'),
('obte-b3', 'obt-pr', 'obt-ro', 'write_output',     200, 0.30, 'obt-b-recon', '{"trust":"internal"}'),
-- Execution A chain (benign, dim / no trend key)
('obte-a1', 'obt-rs', 'obt-dep', 'job_start',        20, 0.20, NULL, '{}'),
('obte-a2', 'obt-dep','obt-cfg', 'config_write',     90, 0.25, NULL, '{}');

-- 4. Detected trends ---------------------------------------------------------
DELETE FROM trend_complete WHERE trend_key IN ('obt-c-export', 'obt-b-recon');

INSERT INTO trend_complete (query_id, trend_key, start_entity, end_entity, hops, path, severity, score, detected_at, explanation) VALUES
('cet-obt-export', 'obt-c-export', 'release-service', 'external-dest', 3,
$json$[
  {"n":"release-service","t":"identity"},
  {"n":"priv-change","t":"privilege","via":"privilege_change"},
  {"n":"restricted-recs","t":"resource","via":"data_access"},
  {"n":"external-dest","t":"endpoint","via":"outbound_transfer"}
]$json$::jsonb,
'critical', 87.4, now() - interval '6 minutes',
'PERSISTS. The shared release-service identity escalated to restricted-data:read at event-time 09:01, read 48,210 restricted records at 09:03, and moved 1.4 GB to an external destination at 09:04. The privilege_change event arrived out of order at 09:06 (5 minutes late); the engine re-ordered on event-time and the trend still completed. Because exfiltration to an external sink is malicious even if later authorized, this query has retract_when: NEVER — the trend is not withdrawn.'),

('cet-obt-recon', 'obt-b-recon', 'release-service', 'recon-output', 3,
$json$[
  {"n":"release-service","t":"identity"},
  {"n":"recon-job","t":"process","via":"job_start"},
  {"n":"prod-records","t":"resource","via":"data_access"},
  {"n":"recon-output","t":"resource","via":"write_output"}
]$json$::jsonb,
'high', 71.6, now() - interval '5 minutes',
'WITHDRAWN. This trend fired provisionally at 09:04 because the same release-service identity ran a reconciliation job that touched production records with NO authorization event yet seen (absence predicate). At 09:09 the missing authorization event arrived late; retract_when: authorization.arrives triggered and the engine WITHDREW this trend. The row is retained for provenance/audit — the finding was real at the time it fired, then correctly retracted when the delayed evidence landed. This is the retraction lifecycle that separates a true CET engine from fire-once alerting.');

-- 5. Graphlets (overlapping-window reuse) ------------------------------------
DELETE FROM trend_graphlets WHERE graphlet_id LIKE 'obt-gl-%';

INSERT INTO trend_graphlets (graphlet_id, window_start, window_end, node_count, edge_count, shared_with_windows, reuse_ratio, memory_kb) VALUES
('obt-gl-w1', now() - interval '10 minutes', now() - interval '5 minutes', 9, 8, 3, 0.78, 42),
('obt-gl-w2', now() - interval '8 minutes',  now() - interval '3 minutes', 7, 6, 2, 0.66, 31);
