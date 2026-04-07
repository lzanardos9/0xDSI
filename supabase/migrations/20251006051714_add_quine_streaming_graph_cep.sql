/*
  # Quine Streaming Graph & Complex Event Processing (CEP)

  1. New Tables
    - streaming_graph_vertices: Real-time graph node streaming
    - streaming_graph_edges: Real-time relationship streaming
    - cep_patterns: Complex event pattern definitions
    - cep_pattern_matches: Detected pattern instances
    - graph_stream_windows: Temporal graph analysis windows
    - entity_resolution: Entity deduplication and merging

  2. Features
    - 10-second streaming graph updates
    - Complex event pattern matching
    - Temporal graph analysis
    - Entity resolution semantic model

  3. Security
    - RLS enabled
*/

-- Streaming Graph Vertices (Quine-style)
CREATE TABLE IF NOT EXISTS streaming_graph_vertices (
  id BIGSERIAL PRIMARY KEY,
  vertex_id TEXT UNIQUE NOT NULL,
  vertex_type TEXT CHECK (vertex_type IN ('finding', 'organization', 'product', 'collection', 'service_account', 'workflow', 'service', 'vpc', 'group', 'asset', 'url', 'subnet', 'person', 'fqdn', 'principal', 'repository', 'vulnerability', 'application', 'hardware', 'saas', 'interface', 'process', 'file', 'hostname', 'location', 'ip', 'user', 'software_component', 'platform_software')) NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  labels TEXT[],
  risk_score NUMERIC(5,2) DEFAULT 0,
  temporal_properties JSONB DEFAULT '{}'::jsonb,
  first_seen TIMESTAMPTZ DEFAULT now(),
  last_updated TIMESTAMPTZ DEFAULT now(),
  update_count INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  embedding vector(384)
);

CREATE INDEX IF NOT EXISTS idx_stream_vertices_type ON streaming_graph_vertices(vertex_type);
CREATE INDEX IF NOT EXISTS idx_stream_vertices_active ON streaming_graph_vertices(is_active);
CREATE INDEX IF NOT EXISTS idx_stream_vertices_updated ON streaming_graph_vertices(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_stream_vertices_embedding ON streaming_graph_vertices USING ivfflat(embedding vector_cosine_ops);

-- Streaming Graph Edges (Real-time relationships)
CREATE TABLE IF NOT EXISTS streaming_graph_edges (
  id BIGSERIAL PRIMARY KEY,
  edge_id TEXT UNIQUE NOT NULL,
  source_vertex_id TEXT REFERENCES streaming_graph_vertices(vertex_id) ON DELETE CASCADE,
  target_vertex_id TEXT REFERENCES streaming_graph_vertices(vertex_id) ON DELETE CASCADE,
  edge_type TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  weight NUMERIC(5,2) DEFAULT 1.0,
  temporal_start TIMESTAMPTZ DEFAULT now(),
  temporal_end TIMESTAMPTZ,
  event_count INTEGER DEFAULT 1,
  last_event_time TIMESTAMPTZ DEFAULT now(),
  is_suspicious BOOLEAN DEFAULT false,
  confidence_score NUMERIC(5,2) DEFAULT 0.5
);

CREATE INDEX IF NOT EXISTS idx_stream_edges_source ON streaming_graph_edges(source_vertex_id);
CREATE INDEX IF NOT EXISTS idx_stream_edges_target ON streaming_graph_edges(target_vertex_id);
CREATE INDEX IF NOT EXISTS idx_stream_edges_type ON streaming_graph_edges(edge_type);
CREATE INDEX IF NOT EXISTS idx_stream_edges_suspicious ON streaming_graph_edges(is_suspicious);
CREATE INDEX IF NOT EXISTS idx_stream_edges_time ON streaming_graph_edges(last_event_time DESC);

-- CEP Pattern Definitions
CREATE TABLE IF NOT EXISTS cep_patterns (
  id BIGSERIAL PRIMARY KEY,
  pattern_name TEXT UNIQUE NOT NULL,
  pattern_description TEXT,
  pattern_type TEXT CHECK (pattern_type IN ('sequence', 'conjunction', 'disjunction', 'negation', 'temporal')),
  pattern_definition JSONB NOT NULL,
  time_window_seconds INTEGER DEFAULT 300,
  min_occurrences INTEGER DEFAULT 1,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pre-populate common threat patterns
INSERT INTO cep_patterns (pattern_name, pattern_description, pattern_type, pattern_definition, time_window_seconds, severity) VALUES
('lateral_movement_sequence', 'Detect lateral movement patterns across network', 'sequence', 
  '{"steps": [{"vertex_type": "user", "action": "login"}, {"vertex_type": "asset", "action": "access", "within_seconds": 60}, {"edge_type": "lateral_movement", "count": ">3"}]}'::jsonb, 
  600, 'high'),
('privilege_escalation', 'User gaining elevated privileges followed by sensitive access', 'sequence',
  '{"steps": [{"vertex_type": "user", "property_change": "privilege_level"}, {"vertex_type": "asset", "asset_type": "sensitive", "action": "access"}]}'::jsonb,
  300, 'critical'),
('data_exfiltration', 'Large data transfers to external IPs', 'temporal',
  '{"conditions": [{"edge_type": "data_transfer", "property": "bytes", "operator": ">", "value": 1000000000}, {"target_vertex_type": "ip", "property": "external", "value": true}]}'::jsonb,
  900, 'critical'),
('reconnaissance_scan', 'Port scanning or network enumeration', 'conjunction',
  '{"conditions": [{"edge_type": "network_connection", "count": ">100"}, {"property": "distinct_ports", "operator": ">", "value": 20}]}'::jsonb,
  60, 'medium')
ON CONFLICT (pattern_name) DO NOTHING;

-- CEP Pattern Matches
CREATE TABLE IF NOT EXISTS cep_pattern_matches (
  id BIGSERIAL PRIMARY KEY,
  pattern_id BIGINT REFERENCES cep_patterns(id) ON DELETE CASCADE,
  match_id TEXT UNIQUE NOT NULL,
  matched_vertices TEXT[],
  matched_edges TEXT[],
  match_start_time TIMESTAMPTZ,
  match_end_time TIMESTAMPTZ,
  confidence_score NUMERIC(5,2),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  match_details JSONB,
  alert_generated BOOLEAN DEFAULT false,
  analyst_reviewed BOOLEAN DEFAULT false,
  false_positive BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cep_matches_pattern ON cep_pattern_matches(pattern_id);
CREATE INDEX IF NOT EXISTS idx_cep_matches_severity ON cep_pattern_matches(severity);
CREATE INDEX IF NOT EXISTS idx_cep_matches_time ON cep_pattern_matches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cep_matches_reviewed ON cep_pattern_matches(analyst_reviewed);

-- Graph Stream Windows (for temporal analysis)
CREATE TABLE IF NOT EXISTS graph_stream_windows (
  id BIGSERIAL PRIMARY KEY,
  window_id TEXT UNIQUE NOT NULL,
  window_type TEXT CHECK (window_type IN ('tumbling', 'sliding', 'session')) DEFAULT 'sliding',
  window_size_seconds INTEGER NOT NULL,
  window_slide_seconds INTEGER,
  window_start TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ NOT NULL,
  vertex_count INTEGER DEFAULT 0,
  edge_count INTEGER DEFAULT 0,
  pattern_matches_count INTEGER DEFAULT 0,
  anomaly_score NUMERIC(5,2),
  summary_stats JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_windows_start ON graph_stream_windows(window_start DESC);
CREATE INDEX IF NOT EXISTS idx_windows_type ON graph_stream_windows(window_type);

-- Entity Resolution (for semantic model)
CREATE TABLE IF NOT EXISTS entity_resolution (
  id BIGSERIAL PRIMARY KEY,
  canonical_entity_id TEXT UNIQUE NOT NULL,
  entity_type TEXT NOT NULL,
  merged_entity_ids TEXT[],
  resolution_method TEXT CHECK (resolution_method IN ('exact_match', 'fuzzy_match', 'ml_similarity', 'manual')),
  confidence_score NUMERIC(5,2),
  properties JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_merged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_entity_resolution_type ON entity_resolution(entity_type);
CREATE INDEX IF NOT EXISTS idx_entity_resolution_canonical ON entity_resolution(canonical_entity_id);

-- Graph Processing Jobs
CREATE TABLE IF NOT EXISTS graph_processing_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  job_type TEXT CHECK (job_type IN ('pagerank', 'community_detection', 'centrality', 'path_finding', 'anomaly_detection')),
  graph_snapshot_id TEXT,
  parameters JSONB,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')) DEFAULT 'pending',
  progress_percent INTEGER DEFAULT 0,
  vertices_processed BIGINT DEFAULT 0,
  edges_processed BIGINT DEFAULT 0,
  results JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_jobs_status ON graph_processing_jobs(status);
CREATE INDEX IF NOT EXISTS idx_graph_jobs_type ON graph_processing_jobs(job_type);

-- Enable RLS
ALTER TABLE streaming_graph_vertices ENABLE ROW LEVEL SECURITY;
ALTER TABLE streaming_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE cep_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cep_pattern_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_stream_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_resolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_processing_jobs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read vertices" ON streaming_graph_vertices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read edges" ON streaming_graph_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read patterns" ON cep_patterns FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read matches" ON cep_pattern_matches FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read windows" ON graph_stream_windows FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read resolution" ON entity_resolution FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read jobs" ON graph_processing_jobs FOR SELECT TO authenticated USING (true);

-- Anon policies
CREATE POLICY "Allow anon read vertices" ON streaming_graph_vertices FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read edges" ON streaming_graph_edges FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read patterns" ON cep_patterns FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read matches" ON cep_pattern_matches FOR SELECT TO anon USING (true);