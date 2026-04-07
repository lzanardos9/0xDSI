/*
  # Add Vector-Based Threat Hunting System

  1. Extensions
    - Enable pgvector for vector similarity search

  2. New Tables
    - `raw_security_events`
      - `id` (uuid, primary key)
      - `event_timestamp` (timestamptz) - When event occurred
      - `raw_payload` (jsonb) - Complete raw event data
      - `event_embedding` (vector(1536)) - OpenAI embedding for semantic search
      - `event_summary` (text) - AI-generated summary
      - `source_system` (text) - Origin system
      - `source_ip` (text)
      - `destination_ip` (text)
      - `event_type_detected` (text) - AI-detected type
      - `threat_indicators` (jsonb) - Extracted indicators
      - `similarity_cluster` (integer) - Clustering ID
      - `processed` (boolean)
      - `created_at` (timestamptz)

    - `vector_correlation_rules`
      - `id` (uuid, primary key)
      - `rule_name` (text) - Rule identifier
      - `description` (text) - What this detects
      - `rule_type` (text) - semantic_similarity, behavioral_pattern, anomaly_detection
      - `pattern_embedding` (vector(1536)) - Vector representation of attack pattern
      - `similarity_threshold` (numeric) - Cosine similarity threshold (0-1)
      - `example_patterns` (jsonb) - Training examples
      - `detection_count` (integer) - Times triggered
      - `true_positive_rate` (numeric) - Accuracy metric
      - `false_positive_rate` (numeric) - FP metric
      - `confidence_score` (numeric) - Rule confidence
      - `enabled` (boolean)
      - `tags` (jsonb)
      - `created_by` (text)
      - `last_triggered_at` (timestamptz)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `vector_correlations`
      - `id` (uuid, primary key)
      - `rule_id` (uuid, foreign key)
      - `event_ids` (jsonb) - Array of correlated event IDs
      - `correlation_type` (text) - similarity_match, behavioral_cluster, temporal_sequence
      - `similarity_score` (numeric) - Cosine similarity
      - `event_embeddings` (jsonb) - Store embeddings for analysis
      - `attack_chain` (jsonb) - Reconstructed attack sequence
      - `threat_narrative` (text) - AI-generated explanation
      - `severity` (text) - low, medium, high, critical
      - `investigated` (boolean)
      - `findings` (text)
      - `created_at` (timestamptz)

    - `threat_hunt_queries`
      - `id` (uuid, primary key)
      - `query_name` (text) - Hunt name
      - `natural_language_query` (text) - Human query
      - `query_embedding` (vector(1536)) - Vectorized query
      - `hunt_type` (text) - semantic_search, pattern_hunt, anomaly_hunt
      - `time_range_start` (timestamptz)
      - `time_range_end` (timestamptz)
      - `filters` (jsonb) - Additional filters
      - `results_count` (integer)
      - `findings` (jsonb) - Hunt results
      - `status` (text) - running, completed, failed
      - `hunter` (text) - Analyst name
      - `created_at` (timestamptz)
      - `completed_at` (timestamptz)

    - `embedding_models`
      - `id` (uuid, primary key)
      - `model_name` (text) - Model identifier
      - `model_type` (text) - openai, sentence_transformer, custom
      - `embedding_dimension` (integer) - Vector size
      - `is_active` (boolean)
      - `performance_metrics` (jsonb)
      - `created_at` (timestamptz)

  3. Indexes
    - Vector similarity indexes (HNSW)
    - Time-based indexes for hunting

  4. Functions
    - Semantic search functions
    - Similarity matching
*/

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

-- Create HNSW indexes for vector similarity search (most efficient for high-dimensional vectors)
CREATE INDEX IF NOT EXISTS idx_raw_events_embedding_hnsw
  ON raw_security_events
  USING hnsw (event_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_correlation_rules_embedding_hnsw
  ON vector_correlation_rules
  USING hnsw (pattern_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

CREATE INDEX IF NOT EXISTS idx_hunt_queries_embedding_hnsw
  ON threat_hunt_queries
  USING hnsw (query_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Standard indexes
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

-- RLS Policies
CREATE POLICY "Allow authenticated users to read raw events"
  ON raw_security_events FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert raw events"
  ON raw_security_events FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update raw events"
  ON raw_security_events FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read correlation rules"
  ON vector_correlation_rules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert correlation rules"
  ON vector_correlation_rules FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update correlation rules"
  ON vector_correlation_rules FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read correlations"
  ON vector_correlations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert correlations"
  ON vector_correlations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update correlations"
  ON vector_correlations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read hunt queries"
  ON threat_hunt_queries FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert hunt queries"
  ON threat_hunt_queries FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update hunt queries"
  ON threat_hunt_queries FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to read embedding models"
  ON embedding_models FOR SELECT
  TO authenticated
  USING (true);

-- Function for semantic search of events
CREATE OR REPLACE FUNCTION search_similar_events(
  query_embedding vector(1536),
  match_threshold numeric DEFAULT 0.8,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  event_id uuid,
  similarity numeric,
  event_summary text,
  event_timestamp timestamptz,
  raw_payload jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    1 - (event_embedding <=> query_embedding) as similarity,
    raw_security_events.event_summary,
    raw_security_events.event_timestamp,
    raw_security_events.raw_payload
  FROM raw_security_events
  WHERE event_embedding IS NOT NULL
    AND 1 - (event_embedding <=> query_embedding) >= match_threshold
  ORDER BY event_embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Function to find events matching correlation rules
CREATE OR REPLACE FUNCTION match_correlation_rules(
  event_embedding vector(1536)
)
RETURNS TABLE (
  rule_id uuid,
  rule_name text,
  similarity numeric,
  rule_description text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    id,
    vector_correlation_rules.rule_name,
    1 - (pattern_embedding <=> event_embedding) as similarity,
    description
  FROM vector_correlation_rules
  WHERE enabled = true
    AND pattern_embedding IS NOT NULL
    AND 1 - (pattern_embedding <=> event_embedding) >= similarity_threshold
  ORDER BY pattern_embedding <=> event_embedding;
END;
$$;

-- Function to cluster similar events
CREATE OR REPLACE FUNCTION cluster_similar_events(
  cluster_threshold numeric DEFAULT 0.9,
  min_cluster_size integer DEFAULT 3
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  current_cluster integer := 0;
  event_record record;
BEGIN
  FOR event_record IN
    SELECT id, event_embedding
    FROM raw_security_events
    WHERE event_embedding IS NOT NULL
      AND similarity_cluster IS NULL
    ORDER BY created_at
  LOOP
    IF event_record.event_embedding IS NOT NULL THEN
      UPDATE raw_security_events
      SET similarity_cluster = current_cluster
      WHERE id IN (
        SELECT id FROM raw_security_events
        WHERE event_embedding IS NOT NULL
          AND similarity_cluster IS NULL
          AND 1 - (event_embedding <=> event_record.event_embedding) >= cluster_threshold
        LIMIT min_cluster_size
      );

      current_cluster := current_cluster + 1;
    END IF;
  END LOOP;
END;
$$;

-- Function to update correlation rule metrics
CREATE OR REPLACE FUNCTION update_rule_metrics()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.rule_id IS NOT NULL THEN
    UPDATE vector_correlation_rules
    SET
      detection_count = detection_count + 1,
      last_triggered_at = NOW()
    WHERE id = NEW.rule_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_rule_metrics
  AFTER INSERT ON vector_correlations
  FOR EACH ROW
  EXECUTE FUNCTION update_rule_metrics();

-- Insert default embedding model
INSERT INTO embedding_models (
  model_name,
  model_type,
  embedding_dimension,
  is_active,
  performance_metrics
) VALUES (
  'text-embedding-3-small',
  'openai',
  1536,
  true,
  '{"accuracy": 0.95, "speed": "fast", "cost": "low"}'::jsonb
) ON CONFLICT (model_name) DO NOTHING;

-- Insert example correlation rules with pattern descriptions
INSERT INTO vector_correlation_rules (
  rule_name,
  description,
  rule_type,
  similarity_threshold,
  example_patterns,
  enabled,
  tags,
  created_by
) VALUES
(
  'Lateral Movement Detection',
  'Detects lateral movement patterns including credential usage across multiple systems, SMB/RDP connections, and privilege escalation attempts',
  'behavioral_pattern',
  0.85,
  '["multiple authentication attempts from same source to different targets", "credential reuse across systems", "suspicious SMB traffic patterns"]'::jsonb,
  true,
  '["lateral-movement", "post-compromise", "mitre-att&ck-t1021"]'::jsonb,
  'system'
),
(
  'Data Exfiltration Pattern',
  'Identifies data exfiltration through unusual outbound transfers, DNS tunneling, and encrypted channel abuse',
  'behavioral_pattern',
  0.82,
  '["large outbound data transfers to external IPs", "DNS queries with unusual payload sizes", "encrypted traffic to uncommon destinations"]'::jsonb,
  true,
  '["exfiltration", "data-theft", "mitre-att&ck-t1048"]'::jsonb,
  'system'
),
(
  'Command and Control Communication',
  'Detects C2 beaconing patterns, suspicious callback frequencies, and known C2 protocols',
  'semantic_similarity',
  0.88,
  '["periodic network connections at regular intervals", "beaconing behavior", "callbacks to known malicious infrastructure"]'::jsonb,
  true,
  '["c2", "malware", "mitre-att&ck-t1071"]'::jsonb,
  'system'
);
