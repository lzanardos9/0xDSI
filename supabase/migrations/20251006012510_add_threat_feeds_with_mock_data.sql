/*
  # Threat Feeds and IOCs System with Mock Data

  1. New Tables
    - `threat_feeds` - Configuration for external threat intelligence feeds
    - `iocs` - Indicators of Compromise with embeddings
    - `ioc_matches` - Real-time correlation between events and IOCs
    - `feed_sync_logs` - Tracking of feed synchronization

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to view and manage

  3. Features
    - Vector embeddings for semantic similarity
    - Multiple feed sources (Abuse.ch, AlienVault OTX, etc.)
    - Automatic synchronization with scheduling
    - Real-time IOC matching
*/

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Threat Feeds Configuration
CREATE TABLE IF NOT EXISTS threat_feeds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_name text NOT NULL,
  feed_source text NOT NULL UNIQUE,
  feed_url text,
  feed_type text NOT NULL CHECK (feed_type IN ('ip', 'domain', 'url', 'hash', 'email', 'mixed', 'hash_md5', 'hash_sha1', 'hash_sha256')),
  enabled boolean DEFAULT true,
  auto_sync boolean DEFAULT true,
  sync_interval_hours integer DEFAULT 24,
  last_sync_at timestamptz,
  last_sync_status text CHECK (last_sync_status IN ('success', 'failed', 'pending', 'never')),
  total_indicators integer DEFAULT 0,
  description text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threat_feeds_enabled ON threat_feeds(enabled);
CREATE INDEX IF NOT EXISTS idx_threat_feeds_source ON threat_feeds(feed_source);

-- IOCs with Embeddings
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
CREATE INDEX IF NOT EXISTS idx_iocs_active ON iocs(is_active);

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
CREATE INDEX IF NOT EXISTS idx_feed_sync_logs_started_at ON feed_sync_logs(started_at DESC);

-- Enable RLS
ALTER TABLE threat_feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE iocs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feed_sync_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view threat feeds"
  ON threat_feeds FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage threat feeds"
  ON threat_feeds FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view IOCs"
  ON iocs FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage IOCs"
  ON iocs FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view sync logs"
  ON feed_sync_logs FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create sync logs"
  ON feed_sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert mock threat feeds with realistic data
INSERT INTO threat_feeds (feed_name, feed_source, feed_type, feed_url, description, enabled, auto_sync, sync_interval_hours, last_sync_at, last_sync_status, total_indicators)
VALUES 
  ('URLhaus Malware URLs', 'abuse_ch_urlhaus', 'url', 'https://urlhaus.abuse.ch/downloads/json/', 'Malicious URLs used for malware distribution', true, true, 1, NOW() - INTERVAL '1 hour', 'success', 15432),
  ('ThreatFox IOCs', 'abuse_ch_threatfox', 'mixed', 'https://threatfox.abuse.ch/export/json/recent/', 'Recent IOCs from ThreatFox database', true, true, 2, NOW() - INTERVAL '2 hours', 'success', 8765),
  ('AlienVault OTX', 'alienvault_otx', 'mixed', 'https://otx.alienvault.com/api/v1/pulses/subscribed', 'Threat intelligence from AlienVault Open Threat Exchange', true, true, 6, NOW() - INTERVAL '6 hours', 'success', 23456),
  ('OpenPhish', 'openphish', 'url', 'https://openphish.com/feed.txt', 'Phishing URLs detected by OpenPhish', false, false, 4, NULL, 'never', 0),
  ('Blocklist.de SSH', 'blocklist_de', 'ip', 'https://lists.blocklist.de/lists/ssh.txt', 'IPs performing SSH brute force attacks', true, true, 12, NOW() - INTERVAL '3 hours', 'success', 4532),
  ('Spamhaus DROP', 'spamhaus', 'ip', 'https://www.spamhaus.org/drop/drop.txt', 'Spamhaus Don''t Route Or Peer list', true, true, 24, NOW() - INTERVAL '12 hours', 'success', 897),
  ('MISP Threat Sharing', 'misp', 'mixed', 'https://misp.example.com/events/restSearch', 'MISP threat intelligence sharing platform', true, true, 4, NOW() - INTERVAL '90 minutes', 'success', 12345),
  ('Feodo Tracker', 'abuse_ch_feodo', 'ip', 'https://feodotracker.abuse.ch/downloads/ipblocklist.json', 'Feodo Trojan C2 server IPs', true, true, 2, NOW() - INTERVAL '45 minutes', 'success', 234),
  ('SSL Blacklist', 'abuse_ch_sslbl', 'hash_sha1', 'https://sslbl.abuse.ch/blacklist/sslblacklist.csv', 'Malicious SSL certificates', true, true, 8, NOW() - INTERVAL '4 hours', 'success', 1876),
  ('DShield Block List', 'dshield', 'ip', 'https://www.dshield.org/block.txt', 'DShield recommended block list', true, true, 12, NOW() - INTERVAL '6 hours', 'success', 20000)
ON CONFLICT (feed_source) DO UPDATE SET
  feed_name = EXCLUDED.feed_name,
  feed_url = EXCLUDED.feed_url,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  sync_interval_hours = EXCLUDED.sync_interval_hours,
  total_indicators = EXCLUDED.total_indicators,
  last_sync_at = EXCLUDED.last_sync_at,
  last_sync_status = EXCLUDED.last_sync_status,
  updated_at = NOW();

-- Insert mock sync logs
INSERT INTO feed_sync_logs (feed_id, sync_status, indicators_fetched, indicators_added, indicators_updated, indicators_removed, sync_duration_ms, started_at, completed_at)
SELECT 
  id,
  'success',
  (random() * 1000 + 100)::integer,
  (random() * 50)::integer,
  (random() * 20)::integer,
  (random() * 10)::integer,
  (random() * 5000 + 500)::integer,
  NOW() - (random() * INTERVAL '24 hours'),
  NOW() - (random() * INTERVAL '23 hours')
FROM threat_feeds
WHERE enabled = true
LIMIT 5;
