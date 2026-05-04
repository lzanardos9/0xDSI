/*
  # CET Trend Engine - Production Extension

  1. New Tables
    - `trend_prds` - Product Requirement Docs for the three hard items
    - `trend_architecture_layers` - Databricks-native architecture (RocksDB hot + Lakebase warm)
    - `trend_still_missing` - Honest list of what remains non-native after phases complete
    - `trend_runtime_metrics` - Live engine metrics per phase
    - `trend_graph_nodes` / `trend_graph_edges` - Actual graph data for WOW visualization
    - `trend_benchmarks` - T-CET vs H-CET vs baseline throughput comparisons

  2. Updates
    - Advance phase statuses (p0 completed, p1-p5 progressed)
    - Add more trends, graphlets, queries

  3. Security
    - RLS enabled with auth + anon read
*/

CREATE TABLE IF NOT EXISTS trend_prds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prd_key text UNIQUE NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  motivation text NOT NULL,
  non_goals text[] DEFAULT '{}',
  requirements text[] DEFAULT '{}',
  open_questions text[] DEFAULT '{}',
  acceptance text[] DEFAULT '{}',
  owning_feature text NOT NULL,
  effort_days int DEFAULT 0,
  risk text DEFAULT 'medium',
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_architecture_layers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer text NOT NULL,
  component text NOT NULL,
  technology text NOT NULL,
  role text NOT NULL,
  rate text DEFAULT '',
  persistence text DEFAULT '',
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_still_missing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap text NOT NULL,
  impact text NOT NULL,
  mitigation text NOT NULL,
  severity text DEFAULT 'medium',
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_runtime_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_key text NOT NULL,
  metric text NOT NULL,
  value numeric NOT NULL,
  unit text NOT NULL,
  target numeric DEFAULT 0,
  trend_direction text DEFAULT 'stable',
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id text UNIQUE NOT NULL,
  label text NOT NULL,
  node_type text NOT NULL,
  x numeric NOT NULL,
  y numeric NOT NULL,
  risk numeric DEFAULT 0,
  cluster text DEFAULT 'default',
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS trend_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edge_id text UNIQUE NOT NULL,
  src_id text NOT NULL,
  dst_id text NOT NULL,
  edge_type text NOT NULL,
  ts_offset_s int DEFAULT 0,
  weight numeric DEFAULT 1,
  on_trend_key text DEFAULT '',
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS trend_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant text NOT NULL,
  eps numeric NOT NULL,
  p99_latency_ms numeric NOT NULL,
  memory_mb numeric NOT NULL,
  cpu_cores numeric NOT NULL,
  speedup_vs_baseline numeric DEFAULT 1,
  sort_order int DEFAULT 0
);

ALTER TABLE trend_prds ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_architecture_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_still_missing ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_runtime_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_benchmarks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_prds' AND policyname='auth read trend_prds') THEN
    CREATE POLICY "auth read trend_prds" ON trend_prds FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_prds" ON trend_prds FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_architecture_layers' AND policyname='auth read trend_arch') THEN
    CREATE POLICY "auth read trend_arch" ON trend_architecture_layers FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_arch" ON trend_architecture_layers FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_still_missing' AND policyname='auth read trend_miss') THEN
    CREATE POLICY "auth read trend_miss" ON trend_still_missing FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_miss" ON trend_still_missing FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_runtime_metrics' AND policyname='auth read trend_metrics') THEN
    CREATE POLICY "auth read trend_metrics" ON trend_runtime_metrics FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_metrics" ON trend_runtime_metrics FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_graph_nodes' AND policyname='auth read trend_gnodes') THEN
    CREATE POLICY "auth read trend_gnodes" ON trend_graph_nodes FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_gnodes" ON trend_graph_nodes FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_graph_edges' AND policyname='auth read trend_gedges') THEN
    CREATE POLICY "auth read trend_gedges" ON trend_graph_edges FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_gedges" ON trend_graph_edges FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_benchmarks' AND policyname='auth read trend_bench') THEN
    CREATE POLICY "auth read trend_bench" ON trend_benchmarks FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_bench" ON trend_benchmarks FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Advance phases
UPDATE trend_phases SET status='completed' WHERE phase_key='p0';
UPDATE trend_phases SET status='completed' WHERE phase_key='p1';
UPDATE trend_phases SET status='completed' WHERE phase_key='p2';
UPDATE trend_phases SET status='in_progress' WHERE phase_key='p3';
UPDATE trend_phases SET status='in_progress' WHERE phase_key='p4';

-- Architecture layers: hot path + warm path
INSERT INTO trend_architecture_layers (layer, component, technology, role, rate, persistence, sort_order) VALUES
  ('ingestion', 'Auto Loader', 'Databricks Auto Loader + Delta', 'OCSF normalized events land in Bronze', '100K+ EPS', 'Delta Bronze (7d)', 1),
  ('ingestion', 'Lakeflow Pipelines', 'Databricks Lakeflow Declarative', 'Silver normalization, enrichment, identity resolution', '100K EPS', 'Delta Silver (30d)', 2),
  ('hot-state', 'Window matcher', 'Spark flatMapGroupsWithState', 'Partial CET matching inside a single sliding window', '1M ops/sec/executor', 'RocksDB state store (ephemeral)', 3),
  ('hot-state', 'Skip-till-any-match', 'Custom NFA over Spark state', 'Kleene closure with any-match semantics', '1M ops/sec/executor', 'RocksDB state store', 4),
  ('warm-state', 'Graphlet cache', 'Lakebase Postgres (OLTP)', 'Share graphlets across overlapping windows; durable', '10K writes/sec', 'Lakebase (persistent, synced to Delta)', 5),
  ('warm-state', 'Partial trend checkpoint', 'Lakebase Postgres', 'Warm-start on stream restart without Bronze replay', '5K writes/sec', 'Lakebase', 6),
  ('warm-state', 'Trend output + lineage', 'Lakebase Postgres + Delta', 'Complete trends, explanations, chain-of-custody', '1K writes/sec', 'Lakebase (serving) + Delta (audit)', 7),
  ('graph-offline', 'GraphFrames Kleene BFS', 'GraphFrames + AggregateMessages', 'Offline validation + oracle for correctness tests', 'batch', 'Delta', 8),
  ('analytics', 'Mosaic AI Vector Search', 'Databricks Mosaic AI', 'Auto-sync trend embeddings, similarity recall', 'sync from Delta', 'Managed vector index', 9),
  ('analytics', 'MLflow scoring', 'MLflow + Model Serving', 'Risk scoring on completed trends', '<50ms p99', 'MLflow registry', 10),
  ('governance', 'Unity Catalog', 'Databricks Unity Catalog', 'RBAC, lineage, audit across all layers', 'N/A', 'System tables', 11),
  ('serving', 'SOC UI', 'React app (this UI)', 'Reads trend output from Lakebase / Supabase mirror', 'interactive', 'Browser', 12)
ON CONFLICT DO NOTHING;

-- Still-missing (honest list)
INSERT INTO trend_still_missing (gap, impact, mitigation, severity, sort_order) VALUES
  ('Spark has no Kleene in GraphFrames find()', 'Custom BFS via AggregateMessages; slower than paper baseline on deep chains', 'PRD kleene-gf tracks native feature request; ship custom BFS in MVP', 'medium', 1),
  ('Spark has no skip-till-any-match CEP primitive', 'Must implement NFA matcher in flatMapGroupsWithState', 'PRD stam-spark; feasible but non-trivial; Flink parity not achievable without rewrite', 'medium', 2),
  ('Branch-and-bound M-CET partitioner (paper §5)', 'Without it we miss the 42x speedup; only get ~5-8x with greedy + graphlet sharing', 'PRD bnb-partitioner gated behind Phase 5 evaluation; may permanently defer', 'high', 3),
  ('GraphFrames motif depth >6 hops degrades fast', 'High-fanout deep trends (APT kill-chains) slow', 'Cap depth at 7 in MVP; evaluate Neo4j tier for hot windows post-MVP', 'medium', 4),
  ('Spark state store has no TTL-on-key (only watermark)', 'Stale graphlets can accumulate if windows overlap heavily', 'Lakebase cache handles explicit eviction via SQL TTL; hybrid resolves it', 'low', 5),
  ('Lakebase write latency ~2-5ms', 'Cannot be in Spark hot loop; only graphlet checkpoints and outputs', 'Architecture explicitly keeps Lakebase warm-path only', 'low', 6),
  ('No native CEP correctness oracle', 'Hard to prove skip-till-any-match matches paper semantics', 'Hand-curated 5-query oracle + GraphFrames offline baseline for cross-check', 'medium', 7),
  ('Changelog checkpointing overhead at 100K EPS', 'Adds ~15% CPU', 'Tune checkpoint interval; accept overhead; alternative is data loss on failure', 'low', 8)
ON CONFLICT DO NOTHING;

-- PRDs
INSERT INTO trend_prds (prd_key, title, summary, motivation, non_goals, requirements, open_questions, acceptance, owning_feature, effort_days, risk, sort_order) VALUES
  ('kleene-gf',
   'Kleene-closure path finding over GraphFrames',
   'Implement variable-length path matching (min..max hops) over GraphFrames with predicate push-down on nodes and edges, replicating the SIGMOD H-CET path enumeration over Spark GraphX.',
   'GraphFrames find() supports fixed-length motifs only. Kleene semantics are required for Complete Event Trends so that trend length is not hard-coded per query. Without this, every query needs N motif calls and deduplication, which is neither correct nor performant.',
   ARRAY['Replacing GraphFrames entirely', 'Rewriting in Scala UDFs (stay in PySpark)', 'Supporting cyclic trends in v1'],
   ARRAY['Input: GraphFrame g, src filter, dst filter, min_hops, max_hops, edge predicate, node predicate, max paths',
         'Output: DataFrame with columns [path_id, hop_idx, src_id, dst_id, edge_attrs, node_attrs]',
         'Must use AggregateMessages (Pregel) for distributed BFS',
         'Must terminate early when max_paths reached per (src,dst) pair',
         'Must support acyclic-only mode (flag prevent_cycles=true)',
         'Must push predicates before expansion (not after) to avoid state blowup'],
   ARRAY['Does GraphFrames AggregateMessages support returning non-scalar message payloads without custom UDTs?',
         'What is the memory profile at 1M edges, depth 7, fanout 10?',
         'Can we checkpoint intermediate BFS state to Delta mid-iteration?'],
   ARRAY['Unit tests on 6 synthetic graphs match networkx all_simple_paths',
         'At 1M edges, depth 5, finishes in <2 minutes on 4-node cluster',
         'Published as oxdsi_trend_engine.kleene Python module',
         'Integrated into offline validation harness for Phase 2 oracle'],
   'Feature Lab / Agent Bricks (offline validation + oracle)',
   10, 'medium', 1),

  ('stam-spark',
   'Skip-till-any-match NFA over Spark Structured Streaming',
   'Implement CEP skip-till-any-match semantics as a custom NFA executor inside flatMapGroupsWithState, so that event trends can skip interleaved unrelated events without breaking pattern match — the semantics Flink CEP library provides natively.',
   'Skip-till-any-match is the operational difference between "brittle rule" and "robust trend detection". Without it, one unrelated event between A and B kills the match. Flink ships it; Spark does not. Does implementing it on Spark make sense?\n\nYES, because: (a) our whole platform is on Databricks and migrating to Flink fragments the stack; (b) the NFA is bounded complexity — one class in Python; (c) it integrates cleanly with existing watermark + state store. The alternative (dual-engine Spark+Flink) costs more operationally than writing the matcher.',
   ARRAY['Re-implementing Flink CEP in full', 'Pattern DSL with all Flink quantifiers (we only need oneOrMore + optional + greedy)', 'Cross-pattern composition'],
   ARRAY['Input: keyed event stream, YAML pattern (start, repeat{min,max,predicate}, end)',
         'NFA states: START, REPEATING, FINAL',
         'State per key: {current_state, partial_match_events[], entry_watermark}',
         'On event: evaluate transitions, emit on FINAL, evict on watermark > entry + window',
         'Must use RocksDB state store (not default HDFSBackedStateStore)',
         'Must emit partial-match metrics for observability',
         'Must deduplicate trend outputs by (start_entity, end_entity, hash(path)) per window'],
   ARRAY['How do we unit-test NFA correctness against a brute-force reference?',
         'What is the state size ceiling before we spill to Lakebase?',
         'Do we need after-match skip strategy (SKIP_PAST_LAST_EVENT vs SKIP_TO_NEXT)?'],
   ARRAY['Matches Flink CEP on 10 canonical patterns from the CEP literature',
         'Sustains 50K EPS per executor with <5s watermark lag',
         'Memory footprint bounded to 500MB state per executor at p95',
         'Shipped as Spark Structured Streaming sink integrated with Detection Confluence'],
   'Correlation Rules / Detection Confluence',
   12, 'medium', 2),

  ('bnb-partitioner',
   'Branch-and-bound graphlet partitioner (H-CET §5)',
   'Implement the paper monotonicity-based graph partitioning optimizer that chooses which graphlets to materialize vs recompute, based on window overlap and predicate selectivity.',
   'This is the component that delivers the paper headline 42x speedup over T-CET baseline. Without it we get maybe 5-8x from graphlet sharing alone. Whether it is worth building depends on Phase 5 evaluation: if graphlet sharing alone beats our current rule engine on the red-team replay, BnB is optional optimization. If it does not, BnB is the difference between shipping and not shipping.',
   ARRAY['Proving the optimizer is globally optimal (paper only claims monotonicity)', 'Online retraining of partition decisions', 'Supporting non-monotonic predicates in v1'],
   ARRAY['Input: query set Q, window schedule W, observed predicate selectivities S',
         'Output: partition plan = subset of graphlets to materialize',
         'Algorithm: branch-and-bound over power set of candidate graphlets, pruned by monotonicity lemma',
         'Must cap search to <10s per replan cycle',
         'Must expose replan trigger (manual + on-selectivity-drift)',
         'Must log chosen plan + alternatives for explainability'],
   ARRAY['How often does the plan actually change in production streams?',
         'Is the monotonicity assumption violated by our predicate set (dynamic risk scores)?',
         'Can we get 80% of the win with a greedy top-k heuristic instead?'],
   ARRAY['Replan completes <10s on query set of 20',
         'Delivers measurable speedup >=2x over graphlet sharing alone',
         'Plan changes logged and visualized for SOC engineer review',
         'Gated behind Phase 5 go/no-go; may be deferred permanently'],
   'CET Trend Engine (internal optimizer; not user-facing)',
   15, 'high', 3)
ON CONFLICT DO NOTHING;

-- Runtime metrics
INSERT INTO trend_runtime_metrics (phase_key, metric, value, unit, target, trend_direction, sort_order) VALUES
  ('p1', 'ingestion_eps', 104320, 'events/sec', 100000, 'up', 1),
  ('p1', 'watermark_lag', 3.4, 'seconds', 5, 'stable', 2),
  ('p2', 'tcet_throughput', 38400, 'trends/min', 30000, 'up', 3),
  ('p2', 'tcet_state_size', 412, 'MB', 500, 'stable', 4),
  ('p2', 'oracle_match_rate', 99.7, 'percent', 99, 'up', 5),
  ('p3', 'hcet_speedup', 7.2, 'x', 3, 'up', 6),
  ('p3', 'graphlet_reuse_ratio', 0.68, 'ratio', 0.5, 'up', 7),
  ('p3', 'lakebase_write_latency_p99', 4.8, 'ms', 10, 'stable', 8),
  ('p4', 'confluence_weight', 0.22, 'weight', 0.2, 'stable', 9),
  ('p4', 'dedup_collisions', 0.03, 'percent', 1, 'down', 10),
  ('p5', 'trends_found_vs_rules', 23, 'count', 10, 'up', 11),
  ('p5', 'fp_delta', -0.4, 'percent', 0, 'down', 12)
ON CONFLICT DO NOTHING;

-- Benchmarks
INSERT INTO trend_benchmarks (variant, eps, p99_latency_ms, memory_mb, cpu_cores, speedup_vs_baseline, sort_order) VALUES
  ('Rule engine (current)', 120000, 420, 280, 8, 1.0, 1),
  ('T-CET (Phase 2 baseline)', 38000, 1850, 520, 12, 0.3, 2),
  ('H-CET + graphlet sharing (Phase 3)', 91000, 620, 710, 12, 2.4, 3),
  ('H-CET + BnB (projected Phase 6)', 168000, 340, 780, 12, 4.4, 4)
ON CONFLICT DO NOTHING;

-- Actual graph for WOW visualization (APT-style lateral movement)
INSERT INTO trend_graph_nodes (node_id, label, node_type, x, y, risk, cluster, metadata) VALUES
  ('n_jenkins', 'svc_jenkins', 'service_account', 80, 200, 0.35, 'build', '{"privilege":"service"}'::jsonb),
  ('n_build01', 'build01', 'host', 220, 180, 0.45, 'build', '{"os":"linux"}'::jsonb),
  ('n_dev02', 'dev02', 'host', 360, 120, 0.55, 'dev', '{"os":"linux"}'::jsonb),
  ('n_dev07', 'dev07', 'host', 360, 240, 0.40, 'dev', '{"os":"linux"}'::jsonb),
  ('n_app_tier', 'app-tier', 'subnet', 520, 180, 0.62, 'app', '{"zone":"internal"}'::jsonb),
  ('n_jump01', 'jump-01', 'bastion', 640, 220, 0.70, 'app', '{"role":"bastion"}'::jsonb),
  ('n_db_tier', 'db-tier', 'subnet', 760, 180, 0.78, 'data', '{"zone":"restricted"}'::jsonb),
  ('n_dc01', 'dc01.corp', 'domain_controller', 900, 200, 0.95, 'crown_jewel', '{"role":"DC"}'::jsonb),
  ('n_finance', 'finance-db', 'database', 900, 310, 0.88, 'crown_jewel', '{"classification":"restricted"}'::jsonb),
  ('n_hr_laptop', 'hr-laptop', 'host', 220, 340, 0.30, 'user', '{"os":"windows"}'::jsonb),
  ('n_fileserver', 'fileserver', 'host', 380, 360, 0.50, 'user', '{"os":"windows"}'::jsonb),
  ('n_contractor', 'kim', 'user', 80, 440, 0.25, 'user', '{"role":"contractor"}'::jsonb),
  ('n_core_app', 'core-app-01', 'host', 260, 470, 0.65, 'app', '{"os":"windows"}'::jsonb),
  ('n_token', 'token_steal', 'action', 420, 440, 0.85, 'attack', '{"technique":"T1134"}'::jsonb),
  ('n_system', 'SYSTEM', 'effective_priv', 580, 470, 0.97, 'crown_jewel', '{"privilege":"system"}'::jsonb)
ON CONFLICT (node_id) DO NOTHING;

INSERT INTO trend_graph_edges (edge_id, src_id, dst_id, edge_type, ts_offset_s, weight, on_trend_key, metadata) VALUES
  ('e1', 'n_jenkins', 'n_build01', 'ssh', 0, 1, 'lm-trend-001', '{"auth":"key"}'::jsonb),
  ('e2', 'n_build01', 'n_dev02', 'smb', 340, 1, 'lm-trend-001', '{}'::jsonb),
  ('e3', 'n_build01', 'n_dev07', 'smb', 480, 1, '', '{}'::jsonb),
  ('e4', 'n_dev02', 'n_app_tier', 'rdp', 820, 1, 'lm-trend-001', '{}'::jsonb),
  ('e5', 'n_app_tier', 'n_jump01', 'internal', 1100, 1, 'lm-trend-001', '{}'::jsonb),
  ('e6', 'n_jump01', 'n_db_tier', 'winrm', 1540, 1, 'lm-trend-001', '{}'::jsonb),
  ('e7', 'n_db_tier', 'n_dc01', 'kerberos', 1980, 1, 'lm-trend-001', '{"technique":"T1558"}'::jsonb),
  ('e8', 'n_db_tier', 'n_finance', 'sql', 2100, 1, '', '{}'::jsonb),
  ('e9', 'n_hr_laptop', 'n_fileserver', 'smb', 0, 1, 'lm-trend-002', '{}'::jsonb),
  ('e10', 'n_fileserver', 'n_jump01', 'ssh', 680, 1, 'lm-trend-002', '{}'::jsonb),
  ('e11', 'n_jump01', 'n_finance', 'sql', 1200, 1, 'lm-trend-002', '{}'::jsonb),
  ('e12', 'n_contractor', 'n_core_app', 'process_exec', 0, 1, 'pe-trend-001', '{}'::jsonb),
  ('e13', 'n_core_app', 'n_token', 'token_change', 420, 1, 'pe-trend-001', '{"technique":"T1134"}'::jsonb),
  ('e14', 'n_token', 'n_system', 'priv_escalate', 480, 1, 'pe-trend-001', '{}'::jsonb),
  ('e15', 'n_jenkins', 'n_dev07', 'ssh', 60, 0.4, '', '{"benign":true}'::jsonb),
  ('e16', 'n_dev07', 'n_app_tier', 'http', 300, 0.3, '', '{"benign":true}'::jsonb),
  ('e17', 'n_hr_laptop', 'n_fileserver', 'http', 120, 0.2, '', '{"benign":true}'::jsonb)
ON CONFLICT (edge_id) DO NOTHING;
