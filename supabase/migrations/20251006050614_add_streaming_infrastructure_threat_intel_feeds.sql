/*
  # Streaming Infrastructure & Comprehensive Threat Intelligence Feeds

  1. New Tables
    - streaming_pipelines: Kafka/Kinesis-style message bus configuration
    - stream_partitions: Data partitioning for parallel processing
    - nist_nvd_vulnerabilities: NIST National Vulnerability Database (200K+ CVEs)
    - cisa_kev_catalog: CISA Known Exploited Vulnerabilities
    - stix_indicators: STIX/TAXII formatted threat intelligence
    - dark_web_intelligence: Underground forum monitoring
    - osint_sources: Open Source Intelligence collection
    - malware_sandbox_results: VirusTotal, MalwareBazaar, Any.Run integration
    - phishing_dataset: 247K+ phishing instances
    - historical_attacks: Sanitized incident data with dwell times

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated access

  3. Features
    - Real-time streaming simulation at scale
    - Comprehensive threat intelligence aggregation
    - Multi-source OSINT collection
    - Malware analysis integration
*/

-- Streaming Infrastructure
CREATE TABLE IF NOT EXISTS streaming_pipelines (
  id BIGSERIAL PRIMARY KEY,
  pipeline_name TEXT NOT NULL,
  pipeline_type TEXT CHECK (pipeline_type IN ('kafka', 'kinesis', 'lakebus', 'pubsub')),
  source_topics TEXT[],
  target_table TEXT,
  processing_mode TEXT CHECK (processing_mode IN ('real_time', 'micro_batch', 'batch')),
  throughput_records_per_sec INTEGER,
  latency_ms INTEGER,
  partition_count INTEGER DEFAULT 16,
  enabled BOOLEAN DEFAULT true,
  configuration JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stream_partitions (
  id BIGSERIAL PRIMARY KEY,
  pipeline_id BIGINT REFERENCES streaming_pipelines(id) ON DELETE CASCADE,
  partition_id INTEGER NOT NULL,
  partition_key TEXT,
  current_offset BIGINT DEFAULT 0,
  lag_seconds INTEGER DEFAULT 0,
  records_processed BIGINT DEFAULT 0,
  last_processed_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('active', 'paused', 'error', 'rebalancing'))
);

-- NIST National Vulnerability Database
CREATE TABLE IF NOT EXISTS nist_nvd_vulnerabilities (
  id BIGSERIAL PRIMARY KEY,
  cve_id TEXT UNIQUE NOT NULL,
  published_date TIMESTAMPTZ,
  last_modified_date TIMESTAMPTZ,
  vulnerability_description TEXT,
  cvss_v3_score NUMERIC(3,1),
  cvss_v3_severity TEXT CHECK (cvss_v3_severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  cvss_v3_vector TEXT,
  cwe_ids TEXT[],
  affected_products JSONB,
  reference_urls TEXT[],
  exploit_available BOOLEAN DEFAULT false,
  patch_available BOOLEAN DEFAULT false,
  remediation_guidance TEXT,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nvd_cve_id ON nist_nvd_vulnerabilities(cve_id);
CREATE INDEX IF NOT EXISTS idx_nvd_severity ON nist_nvd_vulnerabilities(cvss_v3_severity);
CREATE INDEX IF NOT EXISTS idx_nvd_embedding ON nist_nvd_vulnerabilities USING ivfflat(embedding vector_cosine_ops);

-- CISA Known Exploited Vulnerabilities
CREATE TABLE IF NOT EXISTS cisa_kev_catalog (
  id BIGSERIAL PRIMARY KEY,
  cve_id TEXT NOT NULL,
  vulnerability_name TEXT,
  date_added TIMESTAMPTZ NOT NULL,
  short_description TEXT,
  required_action TEXT,
  due_date DATE,
  known_ransomware_use BOOLEAN DEFAULT false,
  vendor_project TEXT,
  product TEXT,
  priority_score INTEGER DEFAULT 100,
  exploitation_evidence JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kev_cve ON cisa_kev_catalog(cve_id);
CREATE INDEX IF NOT EXISTS idx_kev_date_added ON cisa_kev_catalog(date_added DESC);

-- STIX/TAXII Threat Intelligence
CREATE TABLE IF NOT EXISTS stix_indicators (
  id BIGSERIAL PRIMARY KEY,
  stix_id TEXT UNIQUE NOT NULL,
  stix_version TEXT DEFAULT '2.1',
  indicator_type TEXT CHECK (indicator_type IN ('malware', 'threat-actor', 'attack-pattern', 'campaign', 'tool', 'vulnerability')),
  pattern TEXT,
  pattern_type TEXT CHECK (pattern_type IN ('stix', 'snort', 'yara', 'sigma')),
  name TEXT,
  description TEXT,
  labels TEXT[],
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  kill_chain_phases JSONB,
  threat_actor_types TEXT[],
  sophistication TEXT,
  source_feed TEXT,
  external_refs JSONB,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stix_type ON stix_indicators(indicator_type);
CREATE INDEX IF NOT EXISTS idx_stix_confidence ON stix_indicators(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_stix_embedding ON stix_indicators USING ivfflat(embedding vector_cosine_ops);

-- Dark Web Intelligence
CREATE TABLE IF NOT EXISTS dark_web_intelligence (
  id BIGSERIAL PRIMARY KEY,
  source_platform TEXT,
  source_url TEXT,
  content_type TEXT CHECK (content_type IN ('forum_post', 'marketplace_listing', 'chat_message', 'paste', 'leak')),
  threat_category TEXT CHECK (threat_category IN ('credential_leak', 'malware_sale', 'exploit_kit', 'ransomware', 'data_breach', 'vulnerability_discussion')),
  content_preview TEXT,
  full_content TEXT,
  author_handle TEXT,
  author_reputation_score INTEGER,
  posted_at TIMESTAMPTZ,
  relevance_score NUMERIC(5,2),
  indicators_extracted JSONB,
  entities_mentioned TEXT[],
  sentiment_score NUMERIC(3,2),
  language_code TEXT,
  embedding vector(384),
  collected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_darkweb_category ON dark_web_intelligence(threat_category);
CREATE INDEX IF NOT EXISTS idx_darkweb_relevance ON dark_web_intelligence(relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_darkweb_embedding ON dark_web_intelligence USING ivfflat(embedding vector_cosine_ops);

-- OSINT Sources
CREATE TABLE IF NOT EXISTS osint_sources (
  id BIGSERIAL PRIMARY KEY,
  source_type TEXT CHECK (source_type IN ('twitter', 'security_blog', 'vulnerability_disclosure', 'research_paper', 'news_article', 'github', 'reddit')),
  source_name TEXT,
  source_url TEXT,
  title TEXT,
  content TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  tags TEXT[],
  iocs_extracted JSONB,
  cves_mentioned TEXT[],
  threat_actors_mentioned TEXT[],
  mitre_techniques TEXT[],
  relevance_score NUMERIC(5,2),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'alarming')),
  embedding vector(384),
  collected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_osint_type ON osint_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_osint_published ON osint_sources(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_osint_embedding ON osint_sources USING ivfflat(embedding vector_cosine_ops);

-- Malware Sandbox Results
CREATE TABLE IF NOT EXISTS malware_sandbox_results (
  id BIGSERIAL PRIMARY KEY,
  sandbox_platform TEXT CHECK (sandbox_platform IN ('virustotal', 'any_run', 'hybrid_analysis', 'cuckoo', 'joe_sandbox')),
  submission_id TEXT,
  file_hash_md5 TEXT,
  file_hash_sha1 TEXT,
  file_hash_sha256 TEXT,
  file_name TEXT,
  file_type TEXT,
  file_size_bytes BIGINT,
  detection_ratio TEXT,
  threat_classification TEXT[],
  malware_family TEXT,
  behavioral_patterns JSONB,
  network_activity JSONB,
  registry_modifications JSONB,
  file_operations JSONB,
  process_tree JSONB,
  anti_analysis_techniques TEXT[],
  c2_servers INET[],
  ttps_observed TEXT[],
  severity TEXT CHECK (severity IN ('benign', 'suspicious', 'malicious', 'highly_malicious')),
  analysis_date TIMESTAMPTZ,
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sandbox_sha256 ON malware_sandbox_results(file_hash_sha256);
CREATE INDEX IF NOT EXISTS idx_sandbox_severity ON malware_sandbox_results(severity);
CREATE INDEX IF NOT EXISTS idx_sandbox_family ON malware_sandbox_results(malware_family);
CREATE INDEX IF NOT EXISTS idx_sandbox_embedding ON malware_sandbox_results USING ivfflat(embedding vector_cosine_ops);

-- Phishing Dataset
CREATE TABLE IF NOT EXISTS phishing_dataset (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL,
  url_domain TEXT,
  url_length INTEGER,
  has_ip_address BOOLEAN,
  has_at_symbol BOOLEAN,
  url_depth INTEGER,
  redirection_count INTEGER,
  has_https BOOLEAN,
  tld TEXT,
  suspicious_keywords TEXT[],
  page_title TEXT,
  page_content_preview TEXT,
  external_links_count INTEGER,
  form_fields_count INTEGER,
  requests_credential BOOLEAN,
  uses_iframe BOOLEAN,
  uses_popup BOOLEAN,
  domain_age_days INTEGER,
  dns_record_present BOOLEAN,
  website_traffic_rank INTEGER,
  page_rank INTEGER,
  google_index BOOLEAN,
  phishing_classification TEXT CHECK (phishing_classification IN ('legitimate', 'suspicious', 'phishing')),
  confidence_score NUMERIC(5,2),
  reported_by TEXT[],
  screenshot_url TEXT,
  embedding vector(384),
  detected_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_phishing_classification ON phishing_dataset(phishing_classification);
CREATE INDEX IF NOT EXISTS idx_phishing_domain ON phishing_dataset(url_domain);
CREATE INDEX IF NOT EXISTS idx_phishing_embedding ON phishing_dataset USING ivfflat(embedding vector_cosine_ops);

-- Historical Attack Data
CREATE TABLE IF NOT EXISTS historical_attacks (
  id BIGSERIAL PRIMARY KEY,
  attack_id TEXT UNIQUE,
  incident_date TIMESTAMPTZ,
  attack_type TEXT CHECK (attack_type IN ('ransomware', 'phishing', 'apt', 'insider_threat', 'ddos', 'sql_injection', 'xss', 'zero_day', 'supply_chain')),
  threat_actor_group TEXT,
  target_industry TEXT,
  target_organization_size TEXT CHECK (target_organization_size IN ('small', 'medium', 'large', 'enterprise')),
  initial_access_vector TEXT,
  ttps_used TEXT[],
  mitre_tactics TEXT[],
  mitre_techniques TEXT[],
  dwell_time_days INTEGER,
  detection_method TEXT,
  impact_severity TEXT CHECK (impact_severity IN ('low', 'medium', 'high', 'critical')),
  financial_impact_usd BIGINT,
  data_compromised_records BIGINT,
  systems_affected INTEGER,
  containment_time_hours NUMERIC(10,2),
  eradication_time_hours NUMERIC(10,2),
  recovery_time_hours NUMERIC(10,2),
  remediation_steps JSONB,
  lessons_learned TEXT,
  successful_defenses TEXT[],
  failed_defenses TEXT[],
  embedding vector(384),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attacks_type ON historical_attacks(attack_type);
CREATE INDEX IF NOT EXISTS idx_attacks_date ON historical_attacks(incident_date DESC);
CREATE INDEX IF NOT EXISTS idx_attacks_actor ON historical_attacks(threat_actor_group);
CREATE INDEX IF NOT EXISTS idx_attacks_embedding ON historical_attacks USING ivfflat(embedding vector_cosine_ops);

-- Enable RLS
ALTER TABLE streaming_pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE stream_partitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE nist_nvd_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE cisa_kev_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE stix_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE dark_web_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE osint_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE malware_sandbox_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE phishing_dataset ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_attacks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow authenticated users to read all threat intelligence)
CREATE POLICY "Allow authenticated read streaming_pipelines" ON streaming_pipelines FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read stream_partitions" ON stream_partitions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read nvd" ON nist_nvd_vulnerabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read kev" ON cisa_kev_catalog FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read stix" ON stix_indicators FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read darkweb" ON dark_web_intelligence FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read osint" ON osint_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read sandbox" ON malware_sandbox_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read phishing" ON phishing_dataset FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read attacks" ON historical_attacks FOR SELECT TO authenticated USING (true);

-- Allow anon read for demo
CREATE POLICY "Allow anon read nvd" ON nist_nvd_vulnerabilities FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read kev" ON cisa_kev_catalog FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read stix" ON stix_indicators FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read darkweb" ON dark_web_intelligence FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read osint" ON osint_sources FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read sandbox" ON malware_sandbox_results FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read phishing" ON phishing_dataset FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read attacks" ON historical_attacks FOR SELECT TO anon USING (true);