-- Populate threat feeds with mock data
INSERT INTO threat_feeds (feed_name, feed_source, feed_type, feed_url, description, enabled, sync_frequency_hours, last_sync_at, last_sync_status, total_indicators)
VALUES 
  ('URLhaus Malware URLs', 'abuse_ch_urlhaus', 'url', 'https://urlhaus.abuse.ch/downloads/json/', 'Malicious URLs used for malware distribution', true, 1, NOW() - INTERVAL '1 hour', 'success', 15432),
  ('ThreatFox IOCs', 'abuse_ch_threatfox', 'mixed', 'https://threatfox.abuse.ch/export/json/recent/', 'Recent IOCs from ThreatFox database', true, 2, NOW() - INTERVAL '2 hours', 'success', 8765),
  ('AlienVault OTX', 'alienvault_otx', 'mixed', 'https://otx.alienvault.com/api/v1/pulses/subscribed', 'Threat intelligence from AlienVault Open Threat Exchange', true, 6, NOW() - INTERVAL '6 hours', 'success', 23456),
  ('OpenPhish', 'openphish', 'url', 'https://openphish.com/feed.txt', 'Phishing URLs detected by OpenPhish', false, 4, NULL, NULL, 0),
  ('Blocklist.de SSH', 'blocklist_de', 'ip', 'https://lists.blocklist.de/lists/ssh.txt', 'IPs performing SSH brute force attacks', true, 12, NOW() - INTERVAL '3 hours', 'success', 4532),
  ('Spamhaus DROP', 'spamhaus', 'ip', 'https://www.spamhaus.org/drop/drop.txt', 'Spamhaus Don''t Route Or Peer list', true, 24, NOW() - INTERVAL '12 hours', 'success', 897),
  ('MISP Threat Sharing', 'misp', 'mixed', 'https://misp.example.com/events/restSearch', 'MISP threat intelligence sharing platform', true, 4, NOW() - INTERVAL '90 minutes', 'success', 12345),
  ('Feodo Tracker', 'abuse_ch_feodo', 'ip', 'https://feodotracker.abuse.ch/downloads/ipblocklist.json', 'Feodo Trojan C2 server IPs', true, 2, NOW() - INTERVAL '45 minutes', 'success', 234),
  ('SSL Blacklist', 'abuse_ch_sslbl', 'hash_sha1', 'https://sslbl.abuse.ch/blacklist/sslblacklist.csv', 'Malicious SSL certificates', true, 8, NOW() - INTERVAL '4 hours', 'success', 1876),
  ('DShield Block List', 'dshield', 'ip', 'https://www.dshield.org/block.txt', 'DShield recommended block list', true, 12, NOW() - INTERVAL '6 hours', 'success', 20000)
ON CONFLICT (feed_source) DO UPDATE SET
  feed_name = EXCLUDED.feed_name,
  feed_url = EXCLUDED.feed_url,
  description = EXCLUDED.description,
  enabled = EXCLUDED.enabled,
  sync_frequency_hours = EXCLUDED.sync_frequency_hours,
  total_indicators = EXCLUDED.total_indicators,
  updated_at = NOW();
