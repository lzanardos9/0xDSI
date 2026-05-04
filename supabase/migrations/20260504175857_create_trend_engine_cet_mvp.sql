/*
  # Complete Event Trend (CET) Engine - MVP Phase 0/1 Tables

  1. New Tables
    - `trend_queries` - YAML-style Kleene-closure query definitions
    - `trend_graphlets` - Shared graphlets across sliding windows
    - `trend_partial` - Partial trend state (per-window)
    - `trend_complete` - Materialized complete event trends
    - `trend_feasibility` - Honest capability matrix (Databricks native vs custom)
    - `trend_phases` - MVP phase tracker

  2. Security
    - RLS enabled on all tables
    - Authenticated read; writes via service role or authenticated with checks
*/

CREATE TABLE IF NOT EXISTS trend_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'lateral_movement',
  semantics text NOT NULL DEFAULT 'skip_till_any_match',
  window_seconds int NOT NULL DEFAULT 3600,
  min_hops int NOT NULL DEFAULT 2,
  max_hops int NOT NULL DEFAULT 7,
  predicate_yaml text NOT NULL DEFAULT '',
  mitre_techniques text[] DEFAULT '{}',
  enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trend_graphlets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graphlet_id text UNIQUE NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  node_count int NOT NULL DEFAULT 0,
  edge_count int NOT NULL DEFAULT 0,
  shared_with_windows int NOT NULL DEFAULT 0,
  reuse_ratio numeric DEFAULT 0,
  memory_kb int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trend_partial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id text NOT NULL,
  window_id text NOT NULL,
  path_head text NOT NULL,
  path_tail text NOT NULL,
  hops int NOT NULL DEFAULT 1,
  score numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS trend_complete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id text NOT NULL,
  trend_key text NOT NULL,
  start_entity text NOT NULL,
  end_entity text NOT NULL,
  hops int NOT NULL,
  path jsonb NOT NULL DEFAULT '[]'::jsonb,
  severity text NOT NULL DEFAULT 'medium',
  score numeric DEFAULT 0,
  detected_at timestamptz DEFAULT now(),
  explanation text DEFAULT ''
);

CREATE TABLE IF NOT EXISTS trend_feasibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text NOT NULL,
  databricks_native text NOT NULL,
  notes text NOT NULL,
  risk text NOT NULL DEFAULT 'low',
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_key text UNIQUE NOT NULL,
  name text NOT NULL,
  days int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  deliverables text[] DEFAULT '{}',
  acceptance text NOT NULL DEFAULT '',
  sort_order int DEFAULT 0
);

ALTER TABLE trend_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_graphlets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_partial ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_complete ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_feasibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read trend_queries" ON trend_queries FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read trend_graphlets" ON trend_graphlets FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read trend_partial" ON trend_partial FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read trend_complete" ON trend_complete FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read trend_feasibility" ON trend_feasibility FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth read trend_phases" ON trend_phases FOR SELECT TO authenticated USING (true);

CREATE POLICY "anon read trend_queries" ON trend_queries FOR SELECT TO anon USING (true);
CREATE POLICY "anon read trend_graphlets" ON trend_graphlets FOR SELECT TO anon USING (true);
CREATE POLICY "anon read trend_partial" ON trend_partial FOR SELECT TO anon USING (true);
CREATE POLICY "anon read trend_complete" ON trend_complete FOR SELECT TO anon USING (true);
CREATE POLICY "anon read trend_feasibility" ON trend_feasibility FOR SELECT TO anon USING (true);
CREATE POLICY "anon read trend_phases" ON trend_phases FOR SELECT TO anon USING (true);

INSERT INTO trend_feasibility (capability, databricks_native, notes, risk, sort_order) VALUES
  ('Sliding-window streaming state', 'yes', 'flatMapGroupsWithState + watermarks handle it cleanly', 'low', 1),
  ('Event to node/edge Delta materialization', 'yes', 'Auto Loader + Delta MERGE, no gap', 'low', 2),
  ('Variable-length Kleene-closure paths', 'partial', 'GraphFrames find() is fixed-length only; must implement BFS via AggregateMessages (Pregel)', 'medium', 3),
  ('Graphlet sharing across overlapping windows', 'no', 'Not a Spark primitive; application code over RocksDB state store', 'medium', 4),
  ('Branch-and-bound partitioner (M-CET §5)', 'no', 'Pure application code; silent-miss risk if monotonicity bugs', 'high', 5),
  ('Skip-till-any-match semantics', 'no', 'Flink has it, Spark does not; we build the matcher', 'medium', 6),
  ('100K EPS stateful streaming', 'yes-caveats', 'RocksDB state store + changelog checkpointing required', 'medium', 7),
  ('Trend storage and serving', 'yes', 'Delta Lake for history; Supabase Postgres for UI', 'low', 8),
  ('Vector recall over trends', 'yes', 'Mosaic AI Vector Search auto-syncs from Delta', 'low', 9),
  ('Depth >7 hops at high fan-out', 'no', 'State store thrashes; consider Neo4j tier or depth cap', 'high', 10)
ON CONFLICT DO NOTHING;

INSERT INTO trend_phases (phase_key, name, days, status, deliverables, acceptance, sort_order) VALUES
  ('p0', 'Design lock', 2, 'in_progress', ARRAY['Scope to lateral-movement Kleene query', 'Routing contract CET vs rule engine', 'Red-team ground truth dataset'], 'Signed-off design doc, no code', 0),
  ('p1', 'Streaming substrate', 4, 'pending', ARRAY['Bronze to Silver OCSF flow', 'security_event_nodes + edges Delta', 'Watermark + late-data handling'], '10K EPS sustained 30min, <5s watermark lag', 1),
  ('p2', 'T-CET baseline', 5, 'pending', ARRAY['flatMapGroupsWithState matcher', 'Partial trends Delta table', 'Python reference oracle'], '100K-event replay matches reference output', 2),
  ('p3', 'Graphlet sharing', 4, 'pending', ARRAY['Cross-window graphlet reuse', 'RocksDB state keyed by window_id', 'Throughput benchmark'], '>=3x gain over Phase 2 baseline', 3),
  ('p4', 'Integration + routing', 3, 'pending', ARRAY['alerts.detection_source=cet_trend_engine', 'Confluence lens weight calibration', 'Dedup against rule engine'], 'No duplicate verdicts on overlap set', 4),
  ('p5', 'Evaluation gate', 2, 'pending', ARRAY['Red-team replay report', 'Trends found vs rule-engine missed', 'FP delta vs analyst triage'], 'Go/no-go decision on expansion', 5)
ON CONFLICT DO NOTHING;

INSERT INTO trend_queries (query_id, name, category, semantics, window_seconds, min_hops, max_hops, predicate_yaml, mitre_techniques) VALUES
  ('lm_001', 'Lateral Movement Kleene Chain', 'lateral_movement', 'skip_till_any_match', 3600, 3, 7,
   E'event:\n  type: [authentication, remote_exec]\n  protocols: [rdp, ssh, smb, winrm]\nchain:\n  start: {auth_result: success, src_internal: true}\n  repeat:\n    predicate: {dst != prev.src, same_credential_or_pivot: true}\n    min: 2\n    max: 6\n  end: {touched_privileged_asset: true}\nwindow: 1h',
   ARRAY['T1021.001','T1021.002','T1021.006','T1078']),
  ('pe_001', 'Privilege Escalation Chain', 'priv_escalation', 'skip_till_any_match', 7200, 2, 5,
   E'event:\n  type: [process_exec, token_change, group_change]\nchain:\n  start: {user_is_standard: true}\n  repeat:\n    predicate: {privilege_delta > 0}\n    min: 1\n    max: 4\n  end: {effective_privilege: admin_or_system}\nwindow: 2h',
   ARRAY['T1068','T1548','T1134']),
  ('exfil_001', 'Staged Exfiltration Trend', 'exfiltration', 'skip_till_any_match', 14400, 3, 8,
   E'event:\n  type: [file_access, compress, network_transfer]\nchain:\n  start: {action: bulk_read, bytes > 1e8}\n  repeat:\n    predicate: {action in [compress, encrypt, stage]}\n    min: 1\n    max: 4\n  end: {action: egress, dst_external: true}\nwindow: 4h',
   ARRAY['T1048','T1567','T1041'])
ON CONFLICT (query_id) DO NOTHING;

INSERT INTO trend_graphlets (graphlet_id, window_start, window_end, node_count, edge_count, shared_with_windows, reuse_ratio, memory_kb) VALUES
  ('gl_w0001', now() - interval '3 hours', now() - interval '2 hours', 847, 2104, 3, 0.62, 1248),
  ('gl_w0002', now() - interval '2 hours', now() - interval '1 hour', 913, 2387, 4, 0.71, 1344),
  ('gl_w0003', now() - interval '1 hour', now(), 978, 2641, 2, 0.48, 1456)
ON CONFLICT DO NOTHING;

INSERT INTO trend_complete (query_id, trend_key, start_entity, end_entity, hops, path, severity, score, explanation) VALUES
  ('lm_001', 'lm-trend-001', 'svc_jenkins@build01', 'dc01.corp.local', 5,
   '[{"n":"svc_jenkins@build01","t":"service_account"},{"n":"build01","t":"host","via":"ssh"},{"n":"dev02","t":"host","via":"smb"},{"n":"app-tier","t":"subnet","via":"rdp"},{"n":"db-tier","t":"subnet","via":"winrm"},{"n":"dc01.corp.local","t":"domain_controller"}]'::jsonb,
   'critical', 0.94,
   'Complete lateral movement trend: build service account pivoted through 4 hosts to domain controller in 43 minutes. Skip-till-any-match found 2 intermediary hops that rule-based would have missed due to interleaved benign traffic.'),
  ('lm_001', 'lm-trend-002', 'jdoe@hr-laptop', 'finance-db-prod', 4,
   '[{"n":"jdoe@hr-laptop","t":"user"},{"n":"hr-laptop","t":"host","via":"rdp"},{"n":"shared-fileserver","t":"host","via":"smb"},{"n":"jump-01","t":"bastion","via":"ssh"},{"n":"finance-db-prod","t":"database"}]'::jsonb,
   'high', 0.81,
   'User with HR role reached finance database through 3 hops in 22 minutes. CET detected even though intermediate hops had mixed benign activity.'),
  ('pe_001', 'pe-trend-001', 'contractor_kim', 'SYSTEM@core-app-01', 3,
   '[{"n":"contractor_kim","t":"user","priv":"standard"},{"n":"core-app-01","t":"host","via":"process_exec","priv":"user"},{"n":"token_steal","t":"action","via":"token_change","priv":"admin"},{"n":"SYSTEM@core-app-01","t":"effective","priv":"system"}]'::jsonb,
   'critical', 0.89,
   'Privilege chain from standard contractor to SYSTEM via token manipulation. 3-hop chain matched T1134 within 18 minutes.'),
  ('exfil_001', 'exfil-trend-001', 'ml_researcher_ok', 'external-s3-unknown', 6,
   '[{"n":"ml_researcher_ok","t":"user"},{"n":"model-artifacts-bucket","t":"data","action":"bulk_read","bytes":4.2e9},{"n":"staging-vm","t":"host","action":"compress"},{"n":"staging-vm","t":"host","action":"encrypt"},{"n":"staging-vm","t":"host","action":"stage"},{"n":"external-s3-unknown","t":"egress","bytes":3.8e9}]'::jsonb,
   'critical', 0.91,
   'Full exfiltration trend: 4.2GB read, compressed, encrypted, staged, egressed to unknown S3 bucket in 2h41m. 6-hop Kleene match with skip-till-any-match handled 11 interleaved benign file accesses.')
ON CONFLICT DO NOTHING;

INSERT INTO trend_partial (query_id, window_id, path_head, path_tail, hops, score) VALUES
  ('lm_001', 'w0003', 'admin_temp', 'jump-02', 2, 0.42),
  ('lm_001', 'w0003', 'svc_scanner', 'infra-mgmt', 3, 0.58),
  ('pe_001', 'w0003', 'intern_05', 'build-agent-03', 1, 0.31),
  ('exfil_001', 'w0003', 'analyst_14', 'stage-nas-01', 2, 0.49)
ON CONFLICT DO NOTHING;
