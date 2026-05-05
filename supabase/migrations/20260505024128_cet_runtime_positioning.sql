/*
  # CET Runtime Positioning

  Reframes the gap correctly: we already have an entity-risk graph.
  The paper defines a query-local temporal CET graph + runtime.
  Those are different. Databricks gives us the substrate; the CET
  runtime is an 0xDSI application layer we must productize.
*/

CREATE TABLE IF NOT EXISTS trend_positioning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL,
  left_label text NOT NULL,
  left_body text NOT NULL,
  right_label text NOT NULL,
  right_body text NOT NULL,
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_runtime_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gap_key text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  customer_miss text NOT NULL,
  sort_order int DEFAULT 0
);

CREATE TABLE IF NOT EXISTS trend_already_have (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  capability text NOT NULL,
  layer text NOT NULL,
  sort_order int DEFAULT 0
);

ALTER TABLE trend_positioning ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_runtime_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE trend_already_have ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_positioning' AND policyname='auth read trend_pos') THEN
    CREATE POLICY "auth read trend_pos" ON trend_positioning FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_pos" ON trend_positioning FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_runtime_gaps' AND policyname='auth read trend_rg') THEN
    CREATE POLICY "auth read trend_rg" ON trend_runtime_gaps FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_rg" ON trend_runtime_gaps FOR SELECT TO anon USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='trend_already_have' AND policyname='auth read trend_ah') THEN
    CREATE POLICY "auth read trend_ah" ON trend_already_have FOR SELECT TO authenticated USING (true);
    CREATE POLICY "anon read trend_ah" ON trend_already_have FOR SELECT TO anon USING (true);
  END IF;
END $$;

INSERT INTO trend_positioning (section, left_label, left_body, right_label, right_body, sort_order) VALUES
  ('two_graphs',
   'Entity-risk graph (what 0xDSI already has)',
   'Says: this user / host / process / IP neighborhood is risky. Carries blast radius, privilege path, vector match, UEBA signals, threat intel, confluence scoring. Long-lived, cross-tenant, cross-time.',
   'Query-local temporal CET graph (what the paper introduces)',
   'Says: for this specific detection rule and time window, here are all valid complete event chains. Ephemeral, per-query, per-window. Reuses shared subchains (graphlets) instead of recomputing.',
   1),
  ('substrate_vs_app',
   'Databricks substrate (already available)',
   'Structured Streaming stateful ops, checkpointing, Delta Lake, Lakeflow pipelines, Unity Catalog governance, MLflow, Mosaic AI Vector Search, Lakebase. All the primitives are there.',
   '0xDSI CET runtime (what we must build on top)',
   'CET rule compiler, Kleene quantifiers (Event+ / Event*), skip-till-any-match semantics, complete/maximal chain emission, graphlet caching across overlapping windows, memory-aware CPU/memory optimizer.',
   2),
  ('customer_message',
   'What customer gets today',
   'SOC intelligence, confluence, entity graph, UEBA, rule correlation, negative correlation, vector threat hunting, escalation automation. Ahead of competitors on breadth.',
   'What paper exposes as the runtime gap',
   'Exact, scalable, variable-length attack-chain detection. Without it, long chains are approximated: missed campaigns, duplicate partial alerts, weaker forensic explanations.',
   3)
ON CONFLICT DO NOTHING;

INSERT INTO trend_runtime_gaps (gap_key, name, description, customer_miss, sort_order) VALUES
  ('cet_compiler',
   'CET rule compiler',
   'Compile high-level detection DSL (Event+ / Event* with predicates) into a state machine runnable inside Spark Structured Streaming.',
   'Without it, analysts write bespoke streaming code per detection. Slow to author, hard to audit, inconsistent semantics.',
   1),
  ('kleene_quantifiers',
   'Kleene quantifiers (Event+ / Event*)',
   'Match variable-length event chains: at-least-one-or-more (+), zero-or-more (*), bounded ({min,max}). Formal CEP semantics.',
   'Without it, chain length must be hard-coded per rule. Real attack chains have variable length. Miss the long tail.',
   2),
  ('skip_till_any_match',
   'Skip-till-any-match semantics',
   'Between pattern elements, skip any number of unrelated events without breaking the match. The operational difference between brittle rule and robust trend.',
   'Without it, one benign interleaved event kills the match. Either false negatives at high rates or over-relaxed rules that flood the SOC.',
   3),
  ('complete_maximal',
   'Complete and maximal chain emission',
   'Emit only chains that are complete (meet the pattern) and maximal (not a strict prefix of a longer chain). Paper core contribution.',
   'Without it, partial chains and sub-chains fire as duplicate alerts. Analyst fatigue and triage confusion.',
   4),
  ('graphlet_caching',
   'Graphlet caching across overlapping windows',
   'Cache shared subchain computations so overlapping windows do not recompute them. Paper measured 10 to 42x speedup.',
   'Without it, cost scales linearly with window overlap. At production volumes, either drop windows or over-provision cluster.',
   5),
  ('cpu_mem_optimizer',
   'Memory-aware CPU/memory optimizer (H-CET §5)',
   'Pick which graphlets to materialize vs recompute, based on window overlap and predicate selectivity, under a memory budget.',
   'Without it, graphlet cache grows unbounded or under-utilizes cluster. Either OOM risk or leaving throughput on the table.',
   6)
ON CONFLICT (gap_key) DO NOTHING;

INSERT INTO trend_already_have (capability, layer, sort_order) VALUES
  ('Databricks ingestion + Auto Loader', 'ingestion', 1),
  ('Delta Lake / Lakeflow pipelines', 'data_plane', 2),
  ('Enrichment + identity resolution', 'silver', 3),
  ('Rule correlation engine', 'detection', 4),
  ('Negative correlation', 'detection', 5),
  ('ML / UEBA', 'behavioral', 6),
  ('Mosaic AI Vector Search', 'recall', 7),
  ('Entity-risk graph (blast radius, privilege path)', 'graph', 8),
  ('Confluence scoring', 'correlation', 9),
  ('Escalation automation', 'response', 10),
  ('Unity Catalog governance', 'governance', 11),
  ('MLflow + Model Serving', 'ml_ops', 12)
ON CONFLICT DO NOTHING;