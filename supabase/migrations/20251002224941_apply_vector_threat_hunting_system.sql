-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Raw Security Events table with vector embeddings
CREATE TABLE IF NOT EXISTS raw_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_timestamp timestamptz NOT NULL,
  raw_payload jsonb NOT NULL,
  event_embedding vector(1536),
  event_summary text,
  source_system text,
  source_ip text,
  destination_ip text,
  event_type_detected text,
  threat_indicators jsonb DEFAULT '[]'::jsonb,
  similarity_cluster integer,
  processed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Vector Correlation Rules table
CREATE TABLE IF NOT EXISTS vector_correlation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  description text,
  rule_type text NOT NULL,
  pattern_embedding vector(1536),
  similarity_threshold numeric(5,4) DEFAULT 0.85,
  example_patterns jsonb DEFAULT '[]'::jsonb,
  detection_count integer DEFAULT 0,
  true_positive_rate numeric(5,2) DEFAULT 0,
  false_positive_rate numeric(5,2) DEFAULT 0,
  confidence_score numeric(5,2) DEFAULT 50.0,
  enabled boolean DEFAULT true,
  tags jsonb DEFAULT '[]'::jsonb,
  created_by text,
  last_triggered_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_rule_type CHECK (rule_type IN ('semantic_similarity', 'behavioral_pattern', 'anomaly_detection', 'attack_chain'))
);

-- Vector Correlations table
CREATE TABLE IF NOT EXISTS vector_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid REFERENCES vector_correlation_rules(id) ON DELETE SET NULL,
  event_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  correlation_type text NOT NULL,
  similarity_score numeric(5,4) DEFAULT 0,
  event_embeddings jsonb DEFAULT '[]'::jsonb,
  attack_chain jsonb DEFAULT '[]'::jsonb,
  threat_narrative text,
  severity text DEFAULT 'medium',
  investigated boolean DEFAULT false,
  findings text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_correlation_type CHECK (correlation_type IN ('similarity_match', 'behavioral_cluster', 'temporal_sequence', 'multi_stage_attack')),
  CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical'))
);

-- Threat Hunt Queries table
CREATE TABLE IF NOT EXISTS threat_hunt_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_name text NOT NULL,
  natural_language_query text NOT NULL,
  query_embedding vector(1536),
  hunt_type text NOT NULL,
  time_range_start timestamptz,
  time_range_end timestamptz,
  filters jsonb DEFAULT '{}'::jsonb,
  results_count integer DEFAULT 0,
  findings jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'running',
  hunter text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  CONSTRAINT valid_hunt_type CHECK (hunt_type IN ('semantic_search', 'pattern_hunt', 'anomaly_hunt', 'behavioral_hunt')),
  CONSTRAINT valid_status CHECK (status IN ('running', 'completed', 'failed', 'cancelled'))
);

-- Embedding Models table
CREATE TABLE IF NOT EXISTS embedding_models (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_name text NOT NULL UNIQUE,
  model_type text NOT NULL,
  embedding_dimension integer NOT NULL,
  is_active boolean DEFAULT false,
  performance_metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_model_type CHECK (model_type IN ('openai', 'sentence_transformer', 'huggingface', 'custom'))
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_raw_events_timestamp ON raw_security_events(event_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_raw_events_source_ip ON raw_security_events(source_ip);
CREATE INDEX IF NOT EXISTS idx_raw_events_dest_ip ON raw_security_events(destination_ip);
CREATE INDEX IF NOT EXISTS idx_raw_events_type ON raw_security_events(event_type_detected);
CREATE INDEX IF NOT EXISTS idx_raw_events_cluster ON raw_security_events(similarity_cluster);
CREATE INDEX IF NOT EXISTS idx_raw_events_processed ON raw_security_events(processed);
CREATE INDEX IF NOT EXISTS idx_correlation_rules_enabled ON vector_correlation_rules(enabled);
CREATE INDEX IF NOT EXISTS idx_correlations_severity ON vector_correlations(severity);
CREATE INDEX IF NOT EXISTS idx_correlations_investigated ON vector_correlations(investigated);
CREATE INDEX IF NOT EXISTS idx_hunt_queries_status ON threat_hunt_queries(status);

-- Enable Row Level Security
ALTER TABLE raw_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_correlation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE vector_correlations ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_hunt_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE embedding_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow anon access for demo
CREATE POLICY "Allow anon to read raw events" ON raw_security_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon to read correlation rules" ON vector_correlation_rules FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon to read correlations" ON vector_correlations FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon to read hunt queries" ON threat_hunt_queries FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon to read embedding models" ON embedding_models FOR SELECT TO anon USING (true);

CREATE POLICY "Allow authenticated users to manage raw events" ON raw_security_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to manage correlation rules" ON vector_correlation_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to manage correlations" ON vector_correlations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to manage hunt queries" ON threat_hunt_queries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated users to manage embedding models" ON embedding_models FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Insert default embedding model
INSERT INTO embedding_models (model_name, model_type, embedding_dimension, is_active, performance_metrics)
VALUES ('text-embedding-3-small', 'openai', 1536, true, '{"accuracy": 0.95, "speed": "fast", "cost": "low"}'::jsonb)
ON CONFLICT (model_name) DO NOTHING;

-- Insert example correlation rules
INSERT INTO vector_correlation_rules (rule_name, description, rule_type, similarity_threshold, example_patterns, enabled, tags, created_by) VALUES
('Lateral Movement Detection', 'Detects lateral movement patterns including credential usage across multiple systems', 'behavioral_pattern', 0.85, '["multiple authentication attempts", "credential reuse across systems"]'::jsonb, true, '["lateral-movement", "mitre-att&ck-t1021"]'::jsonb, 'system'),
('Data Exfiltration Pattern', 'Identifies data exfiltration through unusual outbound transfers', 'behavioral_pattern', 0.82, '["large outbound data transfers", "DNS tunneling"]'::jsonb, true, '["exfiltration", "mitre-att&ck-t1048"]'::jsonb, 'system'),
('Command and Control Communication', 'Detects C2 beaconing patterns', 'semantic_similarity', 0.88, '["periodic network connections", "beaconing behavior"]'::jsonb, true, '["c2", "mitre-att&ck-t1071"]'::jsonb, 'system')
ON CONFLICT DO NOTHING;