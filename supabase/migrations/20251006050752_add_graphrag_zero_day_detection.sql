/*
  # GraphRAG & Zero-Day Detection Systems

  1. New Tables
    - threat_graph_nodes: Graph nodes for entities (IPs, users, assets, threats)
    - threat_graph_edges: Relationships between entities
    - graph_communities: Detected threat communities
    - zero_day_candidates: Behavioral anomaly-based zero-day detection
    - behavioral_baselines: Normal system behavior profiles
    - code_pattern_analysis: Vulnerability pattern recognition
    - threat_actor_attribution: ML-based threat actor grouping
    - predictive_threat_models: Proactive threat prediction

  2. Security
    - Enable RLS on all tables
    - Graph query optimization

  3. Features
    - GraphRAG for relationship-based threat detection
    - Zero-day vulnerability detection
    - Threat actor attribution
    - Predictive defense strategies
*/

-- Threat Graph Nodes
CREATE TABLE IF NOT EXISTS threat_graph_nodes (
  id BIGSERIAL PRIMARY KEY,
  node_id TEXT UNIQUE NOT NULL,
  node_type TEXT CHECK (node_type IN ('ip_address', 'domain', 'user', 'asset', 'file_hash', 'process', 'threat_actor', 'vulnerability', 'technique', 'campaign')),
  node_label TEXT,
  properties JSONB,
  risk_score NUMERIC(5,2),
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ,
  observation_count INTEGER DEFAULT 1,
  is_malicious BOOLEAN DEFAULT false,
  confidence_score NUMERIC(5,2),
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_nodes_type ON threat_graph_nodes(node_type);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_label ON threat_graph_nodes(node_label);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_risk ON threat_graph_nodes(risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_embedding ON threat_graph_nodes USING ivfflat(embedding vector_cosine_ops);

-- Threat Graph Edges (Relationships)
CREATE TABLE IF NOT EXISTS threat_graph_edges (
  id BIGSERIAL PRIMARY KEY,
  edge_id TEXT UNIQUE NOT NULL,
  source_node_id TEXT REFERENCES threat_graph_nodes(node_id),
  target_node_id TEXT REFERENCES threat_graph_nodes(node_id),
  relationship_type TEXT CHECK (relationship_type IN ('communicates_with', 'accesses', 'exploits', 'drops', 'executes', 'lateral_movement', 'exfiltrates_to', 'c2_connection', 'belongs_to', 'uses_technique')),
  properties JSONB,
  weight NUMERIC(5,2) DEFAULT 1.0,
  frequency INTEGER DEFAULT 1,
  first_observed TIMESTAMPTZ,
  last_observed TIMESTAMPTZ,
  is_suspicious BOOLEAN DEFAULT false,
  anomaly_score NUMERIC(5,2),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_graph_edges_source ON threat_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_target ON threat_graph_edges(target_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_type ON threat_graph_edges(relationship_type);
CREATE INDEX IF NOT EXISTS idx_graph_edges_suspicious ON threat_graph_edges(is_suspicious);

-- Graph Communities (Threat Clustering)
CREATE TABLE IF NOT EXISTS graph_communities (
  id BIGSERIAL PRIMARY KEY,
  community_id TEXT UNIQUE NOT NULL,
  community_name TEXT,
  community_type TEXT CHECK (community_type IN ('botnet', 'apt_campaign', 'insider_ring', 'legitimate', 'unknown')),
  node_ids TEXT[],
  node_count INTEGER,
  edge_count INTEGER,
  avg_risk_score NUMERIC(5,2),
  community_characteristics JSONB,
  detection_algorithm TEXT,
  first_detected TIMESTAMPTZ,
  last_updated TIMESTAMPTZ,
  status TEXT CHECK (status IN ('active', 'contained', 'historical')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_communities_type ON graph_communities(community_type);
CREATE INDEX IF NOT EXISTS idx_communities_status ON graph_communities(status);
CREATE INDEX IF NOT EXISTS idx_communities_risk ON graph_communities(avg_risk_score DESC);

-- Zero-Day Candidates (Behavioral Analysis)
CREATE TABLE IF NOT EXISTS zero_day_candidates (
  id BIGSERIAL PRIMARY KEY,
  candidate_id TEXT UNIQUE,
  detection_method TEXT CHECK (detection_method IN ('behavioral_anomaly', 'code_pattern', 'ml_prediction', 'heuristic')),
  anomaly_type TEXT,
  affected_system TEXT,
  affected_process TEXT,
  anomalous_behavior TEXT,
  baseline_deviation_score NUMERIC(5,2),
  behavioral_indicators JSONB,
  network_indicators JSONB,
  file_indicators JSONB,
  process_indicators JSONB,
  similarity_to_known_exploits NUMERIC(5,2),
  exploit_likelihood NUMERIC(5,2),
  potential_cve_match TEXT,
  requires_investigation BOOLEAN DEFAULT true,
  analyst_notes TEXT,
  verified_zero_day BOOLEAN DEFAULT false,
  reported_to_vendor BOOLEAN DEFAULT false,
  detected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zeroday_method ON zero_day_candidates(detection_method);
CREATE INDEX IF NOT EXISTS idx_zeroday_likelihood ON zero_day_candidates(exploit_likelihood DESC);
CREATE INDEX IF NOT EXISTS idx_zeroday_verified ON zero_day_candidates(verified_zero_day);

-- Behavioral Baselines
CREATE TABLE IF NOT EXISTS behavioral_baselines (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT CHECK (entity_type IN ('user', 'system', 'application', 'network', 'process')),
  entity_id TEXT,
  baseline_name TEXT,
  baseline_period_days INTEGER,
  baseline_metrics JSONB,
  normal_patterns JSONB,
  statistical_bounds JSONB,
  sample_size INTEGER,
  confidence_level NUMERIC(5,4),
  last_updated TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id, baseline_name)
);

CREATE INDEX IF NOT EXISTS idx_baselines_entity ON behavioral_baselines(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_baselines_updated ON behavioral_baselines(last_updated DESC);

-- Code Pattern Analysis
CREATE TABLE IF NOT EXISTS code_pattern_analysis (
  id BIGSERIAL PRIMARY KEY,
  analysis_id TEXT UNIQUE,
  source_type TEXT CHECK (source_type IN ('github', 'gitlab', 'vulnerability_report', 'malware_sample', 'exploit_code')),
  source_url TEXT,
  code_snippet TEXT,
  language TEXT,
  vulnerability_patterns_detected TEXT[],
  potential_cwe_ids TEXT[],
  potential_cve_ids TEXT[],
  exploit_primitives TEXT[],
  dangerous_functions TEXT[],
  security_risk_score NUMERIC(5,2),
  exploitability_score NUMERIC(5,2),
  impact_score NUMERIC(5,2),
  ml_confidence NUMERIC(5,4),
  similar_known_vulns TEXT[],
  analysis_notes TEXT,
  embedding vector(384),
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_code_analysis_source ON code_pattern_analysis(source_type);
CREATE INDEX IF NOT EXISTS idx_code_analysis_risk ON code_pattern_analysis(security_risk_score DESC);
CREATE INDEX IF NOT EXISTS idx_code_analysis_embedding ON code_pattern_analysis USING ivfflat(embedding vector_cosine_ops);

-- Threat Actor Attribution
CREATE TABLE IF NOT EXISTS threat_actor_attribution (
  id BIGSERIAL PRIMARY KEY,
  attribution_id TEXT UNIQUE,
  attack_event_ids BIGINT[],
  attributed_actor_group TEXT,
  confidence_score NUMERIC(5,4),
  attribution_method TEXT CHECK (attribution_method IN ('ttp_matching', 'infrastructure_overlap', 'code_similarity', 'ml_clustering', 'manual_analysis')),
  ttps_matched TEXT[],
  infrastructure_overlap JSONB,
  malware_families_used TEXT[],
  tools_used TEXT[],
  target_industries TEXT[],
  geopolitical_indicators JSONB,
  linguistic_markers TEXT[],
  timezone_analysis JSONB,
  operating_hours JSONB,
  capability_assessment TEXT,
  motivation TEXT CHECK (motivation IN ('financial', 'espionage', 'sabotage', 'hacktivism', 'unknown')),
  sophistication_level TEXT CHECK (sophistication_level IN ('low', 'medium', 'high', 'advanced', 'nation_state')),
  supporting_evidence JSONB,
  analyst_notes TEXT,
  attributed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attribution_actor ON threat_actor_attribution(attributed_actor_group);
CREATE INDEX IF NOT EXISTS idx_attribution_confidence ON threat_actor_attribution(confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_attribution_sophistication ON threat_actor_attribution(sophistication_level);

-- Predictive Threat Models
CREATE TABLE IF NOT EXISTS predictive_threat_models (
  id BIGSERIAL PRIMARY KEY,
  prediction_id TEXT UNIQUE,
  threat_type TEXT,
  prediction_timeframe TEXT CHECK (prediction_timeframe IN ('1_day', '7_days', '30_days', '90_days')),
  predicted_probability NUMERIC(5,4),
  prediction_confidence NUMERIC(5,4),
  risk_factors JSONB,
  leading_indicators JSONB,
  historical_patterns_matched TEXT[],
  environmental_factors JSONB,
  threat_intelligence_signals JSONB,
  ml_model_used TEXT,
  model_accuracy NUMERIC(5,4),
  recommended_mitigations TEXT[],
  priority_level TEXT CHECK (priority_level IN ('low', 'medium', 'high', 'critical')),
  prediction_made_at TIMESTAMPTZ,
  prediction_expires_at TIMESTAMPTZ,
  actual_outcome TEXT,
  prediction_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_predictive_type ON predictive_threat_models(threat_type);
CREATE INDEX IF NOT EXISTS idx_predictive_probability ON predictive_threat_models(predicted_probability DESC);
CREATE INDEX IF NOT EXISTS idx_predictive_timeframe ON predictive_threat_models(prediction_timeframe);

-- Enable RLS
ALTER TABLE threat_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE graph_communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE zero_day_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE behavioral_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_pattern_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE threat_actor_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE predictive_threat_models ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read graph_nodes" ON threat_graph_nodes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read graph_edges" ON threat_graph_edges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read communities" ON graph_communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read zero_day" ON zero_day_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read baselines" ON behavioral_baselines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read code_analysis" ON code_pattern_analysis FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read attribution" ON threat_actor_attribution FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read predictive" ON predictive_threat_models FOR SELECT TO authenticated USING (true);

-- Allow anon read for demo
CREATE POLICY "Allow anon read graph_nodes" ON threat_graph_nodes FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read graph_edges" ON threat_graph_edges FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read communities" ON graph_communities FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read zero_day" ON zero_day_candidates FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read attribution" ON threat_actor_attribution FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read predictive" ON predictive_threat_models FOR SELECT TO anon USING (true);