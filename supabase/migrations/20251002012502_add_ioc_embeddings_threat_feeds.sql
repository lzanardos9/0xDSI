-- IOC (Indicators of Compromise) with Embeddings and Threat Feeds Schema
-- 
-- 1. New Tables
--    - threat_feeds: Configuration for external threat intelligence feeds
--    - iocs: Indicators of Compromise with embeddings for similarity matching
--    - ioc_matches: Real-time matches between events and known IOCs
--    - feed_sync_logs: Tracking of feed synchronization activities
--
-- 2. Security
--    - Enable RLS on all tables
--    - Policies allow authenticated users to view and manage IOCs
--
-- 3. Features
--    - Vector embeddings for semantic similarity matching
--    - Support for multiple feed sources (Abuse.ch, AlienVault OTX, CIRCL, etc.)
--    - Automatic feed synchronization with scheduling
--    - IOC enrichment with context and metadata
--    - Real-time matching against security events

-- Enable pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Threat Feeds Configuration
CREATE TABLE IF NOT EXISTS threat_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_name text NOT NULL,
  feed_source text NOT NULL CHECK (feed_source IN (
    'abuse_ch_urlhaus',
    'abuse_ch_sslblacklist',
    'abuse_ch_malwarebazaar',
    'abuse_ch_threatfox',
    'alienvault_otx',
    'circl',
    'misp_osint',
    'cybercrime_tracker',
    'malc0de',
    'openphish',
    'uscert',
    'shadowserver',
    'custom'
  )),
  feed_url text,
  feed_type text NOT NULL CHECK (feed_type IN ('ip', 'domain', 'url', 'hash', 'email', 'mixed')),
  enabled boolean DEFAULT true,
  auto_sync boolean DEFAULT true,
  sync_interval_hours integer DEFAULT 24,
  last_sync_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('success', 'failed', 'pending', 'never')),
  total_indicators integer DEFAULT 0,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threat_feeds_enabled ON threat_feeds(enabled);
CREATE INDEX IF NOT EXISTS idx_threat_feeds_source ON threat_feeds(feed_source);
CREATE INDEX IF NOT EXISTS idx_threat_feeds_auto_sync ON threat_feeds(auto_sync);

-- IOCs (Indicators of Compromise) with Embeddings
CREATE TABLE IF NOT EXISTS iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES threat_feeds(id) ON DELETE CASCADE,
  indicator text NOT NULL,
  indicator_type text NOT NULL CHECK (indicator_type IN ('ip', 'domain', 'url', 'hash_md5', 'hash_sha1', 'hash_sha256', 'email', 'cve')),
  threat_type text CHECK (threat_type IN ('malware', 'phishing', 'c2', 'ransomware', 'botnet', 'exploit', 'scanner', 'bruteforce', 'spam', 'unknown')),
  severity text NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')) DEFAULT 'medium',
  confidence_score numeric(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1) DEFAULT 0.5,
  tags text[] DEFAULT ARRAY[]::text[],
  description text,
  context jsonb DEFAULT '{}'::jsonb,
  embedding vector(384),
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  expiration_date timestamptz,
  is_active boolean DEFAULT true,
  match_count integer DEFAULT 0,
  false_positive_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_iocs_indicator ON iocs(indicator);
CREATE INDEX IF NOT EXISTS idx_iocs_type ON iocs(indicator_type);
CREATE INDEX IF NOT EXISTS idx_iocs_threat_type ON iocs(threat_type);
CREATE INDEX IF NOT EXISTS idx_iocs_severity ON iocs(severity);
CREATE INDEX IF NOT EXISTS idx_iocs_active ON iocs(is_active);
CREATE INDEX IF NOT EXISTS idx_iocs_feed_id ON iocs(feed_id);
CREATE INDEX IF NOT EXISTS idx_iocs_tags ON iocs USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_iocs_embedding ON iocs USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- IOC Matches (Real-time correlation)
CREATE TABLE IF NOT EXISTS ioc_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ioc_id uuid REFERENCES iocs(id) ON DELETE CASCADE,
  event_id uuid REFERENCES security_events(id) ON DELETE CASCADE,
  match_type text NOT NULL CHECK (match_type IN ('exact', 'similarity', 'pattern', 'behavioral')),
  similarity_score numeric(3,2) CHECK (similarity_score >= 0 AND similarity_score <= 1),
  matched_field text NOT NULL,
  matched_value text NOT NULL,
  alert_generated boolean DEFAULT false,
  alert_id uuid REFERENCES alerts(id),
  action_taken text,
  response_time_ms integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  matched_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ioc_matches_ioc_id ON ioc_matches(ioc_id);
CREATE INDEX IF NOT EXISTS idx_ioc_matches_event_id ON ioc_matches(event_id);
CREATE INDEX IF NOT EXISTS idx_ioc_matches_type ON ioc_matches(match_type);
CREATE INDEX IF NOT EXISTS idx_ioc_matches_matched_at ON ioc_matches(matched_at DESC);
CREATE INDEX IF NOT EXISTS idx_ioc_matches_alert_generated ON ioc_matches(alert_generated);

-- Feed Sync Logs
CREATE TABLE IF NOT EXISTS feed_sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id uuid REFERENCES threat_feeds(id) ON DELETE CASCADE,
  sync_status text NOT NULL CHECK (sync_status IN ('success', 'failed', 'partial', 'in_progress')),
  indicators_fetched integer DEFAULT 0,
  indicators_added integer DEFAULT 0,
  indicators_updated integer DEFAULT 0,
  indicators_removed integer DEFAULT 0,
  error_message text,
  sync_duration_ms integer,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_sync_logs_feed_id ON feed_sync_logs(feed_id);
CREATE INDEX IF NOT EXISTS idx_feed_sync_logs_status ON feed_sync_logs(sync_status);
CREATE INDEX IF NOT EXISTS idx_feed_sync_logs_started_at ON feed_sync_logs(started_at DESC);

-- Enable Row Level Security
ALTER TABLE threat_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE iocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ioc_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for threat_feeds
CREATE POLICY "Authenticated users can view threat feeds"
  ON threat_feeds FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage their threat feeds"
  ON threat_feeds FOR ALL
  TO authenticated
  USING (auth.uid() = created_by OR created_by IS NULL)
  WITH CHECK (auth.uid() = created_by);

-- RLS Policies for iocs
CREATE POLICY "Authenticated users can view IOCs"
  ON iocs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert IOCs"
  ON iocs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update IOCs"
  ON iocs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for ioc_matches
CREATE POLICY "Authenticated users can view IOC matches"
  ON ioc_matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create IOC matches"
  ON ioc_matches FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- RLS Policies for feed_sync_logs
CREATE POLICY "Authenticated users can view sync logs"
  ON feed_sync_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create sync logs"
  ON feed_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Function to find similar IOCs using embeddings
CREATE OR REPLACE FUNCTION find_similar_iocs(
  query_embedding vector(384),
  match_threshold numeric DEFAULT 0.7,
  match_count integer DEFAULT 10
)
RETURNS TABLE (
  ioc_id uuid,
  indicator text,
  indicator_type text,
  similarity numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    iocs.id,
    iocs.indicator,
    iocs.indicator_type,
    1 - (iocs.embedding <=> query_embedding) as similarity
  FROM iocs
  WHERE iocs.is_active = true
    AND iocs.embedding IS NOT NULL
    AND 1 - (iocs.embedding <=> query_embedding) > match_threshold
  ORDER BY iocs.embedding <=> query_embedding
  LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- Insert default threat feeds
INSERT INTO threat_feeds (feed_name, feed_source, feed_type, description, feed_url) VALUES
  ('Abuse.ch URLhaus', 'abuse_ch_urlhaus', 'url', 'Malicious URLs used for malware distribution', 'https://urlhaus.abuse.ch/downloads/csv/'),
  ('Abuse.ch SSL Blacklist', 'abuse_ch_sslblacklist', 'hash', 'SSL certificates associated with malware or botnet activities', 'https://sslbl.abuse.ch/blacklist/'),
  ('Abuse.ch ThreatFox', 'abuse_ch_threatfox', 'mixed', 'Indicators of malware and botnet C2 servers', 'https://threatfox.abuse.ch/export/'),
  ('AlienVault OTX', 'alienvault_otx', 'mixed', 'Open Threat Exchange community threat intelligence', 'https://otx.alienvault.com/api/v1/pulses/subscribed'),
  ('CIRCL OSINT', 'circl', 'mixed', 'Computer Incident Response Center Luxembourg threat feeds', 'https://www.circl.lu/doc/misp/feed-osint/'),
  ('OpenPhish', 'openphish', 'url', 'Real-time phishing URL intelligence', 'https://openphish.com/feed.txt'),
  ('Malc0de Database', 'malc0de', 'domain', 'Malware domain blocklist', 'http://malc0de.com/bl/'),
  ('Cybercrime Tracker', 'cybercrime_tracker', 'ip', 'Crimeware command and control servers', 'http://cybercrime-tracker.net/all.php')
ON CONFLICT DO NOTHING;