/*
  # Populate Threat Campaigns and IOCs

  1. Populated Tables
    - `threat_campaigns` - 12 realistic APT/ransomware campaigns with threat actors
    - `iocs` - 40 indicators of compromise (IPs, domains, hashes, URLs, emails)

  2. Notes
    - threat_campaigns uses valid types: apt, ransomware, espionage, sabotage, financial
    - threat_campaigns uses valid statuses: active, monitoring, mitigated, archived
    - iocs confidence_score is 0-1 range
    - iocs indicator_type: ip, domain, url, hash_md5, hash_sha256, email
    - Added first_seen/last_activity columns to threat_campaigns for edge function compatibility
*/

-- Add first_seen and last_activity columns to threat_campaigns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'threat_campaigns' AND column_name = 'first_seen') THEN
    ALTER TABLE threat_campaigns ADD COLUMN first_seen timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'threat_campaigns' AND column_name = 'last_activity') THEN
    ALTER TABLE threat_campaigns ADD COLUMN last_activity timestamptz;
  END IF;
END $$;

-- Populate threat_campaigns
INSERT INTO threat_campaigns (campaign_name, campaign_type, threat_actor, severity, status, confidence, start_date, end_date, is_active, first_seen, last_activity, iocs, ttps) VALUES
('Operation ShadowDragon', 'apt', 'APT41 (Winnti)', 'critical', 'active', 0.92, now() - interval '30 days', NULL, true, now() - interval '30 days', now() - interval '1 day', '{"ips": ["185.220.101.34", "91.219.236.222"], "domains": ["update-service.cloud", "cdn-static.xyz"]}', '{"tactics": ["Initial Access", "Execution", "Persistence", "C2"], "techniques": ["T1566.001", "T1059.001", "T1547.001", "T1071.001"]}'),
('Volt Typhoon Infrastructure Probe', 'apt', 'Volt Typhoon (PRC)', 'critical', 'active', 0.88, now() - interval '45 days', NULL, true, now() - interval '45 days', now() - interval '1 day', '{"ips": ["103.224.182.251", "45.63.119.131"], "domains": ["vpn-gateway-corp.com"]}', '{"tactics": ["Initial Access", "Defense Evasion", "Lateral Movement"], "techniques": ["T1190", "T1218.011", "T1021.001"]}'),
('MuddyWater Spearphishing Wave', 'espionage', 'MuddyWater (Iran)', 'high', 'active', 0.85, now() - interval '20 days', NULL, true, now() - interval '20 days', now() - interval '2 days', '{"ips": ["5.34.178.92"], "domains": ["doc-share-portal.com", "ms-update-check.net"]}', '{"tactics": ["Initial Access", "Execution"], "techniques": ["T1566.001", "T1204.002", "T1059.001"]}'),
('Scattered Spider Social Eng', 'financial', 'Scattered Spider', 'high', 'active', 0.79, now() - interval '15 days', NULL, true, now() - interval '15 days', now() - interval '1 day', '{"ips": ["195.123.246.138"], "domains": ["helpdesk-portal-auth.com"]}', '{"tactics": ["Initial Access", "Credential Access", "Persistence"], "techniques": ["T1566.004", "T1621", "T1078"]}'),
('BlackCat Ransomware Campaign', 'ransomware', 'ALPHV/BlackCat', 'critical', 'mitigated', 0.94, now() - interval '60 days', now() - interval '45 days', false, now() - interval '60 days', now() - interval '45 days', '{"ips": ["142.93.124.73", "209.141.36.116"], "domains": ["alphv-support.onion"]}', '{"tactics": ["Impact", "Exfiltration", "Defense Evasion"], "techniques": ["T1486", "T1048.003", "T1562.001"]}'),
('Lazarus Crypto Heist Attempt', 'financial', 'Lazarus Group (DPRK)', 'critical', 'active', 0.76, now() - interval '12 days', NULL, true, now() - interval '12 days', now() - interval '1 day', '{"ips": ["175.45.176.99"], "domains": ["defi-bridge-update.com", "wallet-sync-service.io"]}', '{"tactics": ["Initial Access", "Collection", "Exfiltration"], "techniques": ["T1566.002", "T1005", "T1567"]}'),
('FIN7 POS Malware Distribution', 'financial', 'FIN7', 'high', 'monitoring', 0.82, now() - interval '35 days', NULL, true, now() - interval '35 days', now() - interval '5 days', '{"ips": ["193.56.28.103"], "domains": ["vendor-invoice-portal.com"]}', '{"tactics": ["Initial Access", "Execution", "Collection"], "techniques": ["T1566.001", "T1059.005", "T1119"]}'),
('Sandworm ICS Reconnaissance', 'sabotage', 'Sandworm (GRU Unit 74455)', 'critical', 'monitoring', 0.71, now() - interval '25 days', NULL, true, now() - interval '25 days', now() - interval '3 days', '{"ips": ["91.245.228.77", "185.174.100.56"], "domains": ["scada-firmware-update.net"]}', '{"tactics": ["Reconnaissance", "Initial Access", "Impact"], "techniques": ["T1595.002", "T1190", "T1485"]}'),
('QakBot Resurgence Wave 3', 'financial', 'QakBot Operators', 'medium', 'mitigated', 0.90, now() - interval '40 days', now() - interval '32 days', false, now() - interval '40 days', now() - interval '32 days', '{"ips": ["82.118.22.77"], "domains": ["invoice-doc-view.com"]}', '{"tactics": ["Initial Access", "Execution", "Lateral Movement"], "techniques": ["T1566.001", "T1059.005", "T1021.002"]}'),
('Kimsuky Academic Targeting', 'espionage', 'Kimsuky (DPRK)', 'medium', 'monitoring', 0.68, now() - interval '18 days', NULL, true, now() - interval '18 days', now() - interval '2 days', '{"ips": ["211.249.220.18"], "domains": ["research-collab-portal.org"]}', '{"tactics": ["Initial Access", "Credential Access"], "techniques": ["T1566.001", "T1555.003"]}'),
('Turla Watering Hole Operation', 'espionage', 'Turla (FSB)', 'high', 'monitoring', 0.73, now() - interval '50 days', NULL, true, now() - interval '50 days', now() - interval '5 days', '{"ips": ["185.56.89.44"], "domains": ["industry-news-daily.com"]}', '{"tactics": ["Initial Access", "Execution", "C2"], "techniques": ["T1189", "T1059.003", "T1071.001"]}'),
('DarkSide Affiliate Resurgence', 'ransomware', 'DarkSide Affiliates', 'high', 'mitigated', 0.86, now() - interval '55 days', now() - interval '48 days', false, now() - interval '55 days', now() - interval '48 days', '{"ips": ["23.106.122.196"], "domains": ["darkside-support.onion"]}', '{"tactics": ["Initial Access", "Impact", "Exfiltration"], "techniques": ["T1133", "T1486", "T1567.002"]}');

-- Populate IOCs (confidence_score 0-1 range, valid indicator_type and threat_type)
INSERT INTO iocs (indicator, indicator_type, threat_type, severity, confidence_score, description, first_seen, last_seen, is_active, match_count, false_positive_count, feed_id) VALUES
('185.220.101.34', 'ip', 'c2', 'critical', 0.95, 'APT41 command and control server - Operation ShadowDragon', now() - interval '30 days', now() - interval '1 day', true, 847, 2, (SELECT id FROM threat_feeds LIMIT 1)),
('91.219.236.222', 'ip', 'c2', 'critical', 0.92, 'Secondary C2 node linked to Winnti infrastructure', now() - interval '28 days', now() - interval '2 days', true, 312, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('103.224.182.251', 'ip', 'c2', 'critical', 0.88, 'Volt Typhoon SOHO router relay node', now() - interval '45 days', now() - interval '1 day', true, 1205, 5, (SELECT id FROM threat_feeds LIMIT 1)),
('45.63.119.131', 'ip', 'scanner', 'high', 0.85, 'Volt Typhoon reconnaissance scanning infrastructure', now() - interval '40 days', now() - interval '3 days', true, 2341, 12, (SELECT id FROM threat_feeds LIMIT 1)),
('5.34.178.92', 'ip', 'c2', 'high', 0.84, 'MuddyWater PowerShell Empire C2 endpoint', now() - interval '20 days', now() - interval '1 day', true, 156, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('195.123.246.138', 'ip', 'phishing', 'high', 0.79, 'Scattered Spider phishing infrastructure', now() - interval '15 days', now() - interval '2 days', true, 89, 3, (SELECT id FROM threat_feeds LIMIT 1)),
('142.93.124.73', 'ip', 'ransomware', 'critical', 0.96, 'ALPHV/BlackCat ransomware payment portal relay', now() - interval '60 days', now() - interval '45 days', false, 4521, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('82.118.22.77', 'ip', 'malware', 'medium', 0.90, 'QakBot distribution server', now() - interval '40 days', now() - interval '32 days', false, 1876, 8, (SELECT id FROM threat_feeds LIMIT 1)),
('175.45.176.99', 'ip', 'c2', 'critical', 0.76, 'Lazarus Group cryptocurrency theft C2', now() - interval '12 days', now() - interval '1 day', true, 67, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('91.245.228.77', 'ip', 'scanner', 'critical', 0.71, 'Sandworm ICS/SCADA reconnaissance probe', now() - interval '25 days', now() - interval '5 days', true, 432, 4, (SELECT id FROM threat_feeds LIMIT 1)),
('193.56.28.103', 'ip', 'malware', 'high', 0.82, 'FIN7 Carbanak C2 infrastructure', now() - interval '35 days', now() - interval '5 days', true, 567, 3, (SELECT id FROM threat_feeds LIMIT 1)),
('185.56.89.44', 'ip', 'c2', 'high', 0.74, 'Turla Kazuar backdoor C2 server', now() - interval '50 days', now() - interval '5 days', true, 234, 2, (SELECT id FROM threat_feeds LIMIT 1)),
('23.106.122.196', 'ip', 'ransomware', 'high', 0.87, 'DarkSide affiliate payment infrastructure', now() - interval '55 days', now() - interval '48 days', false, 1290, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('211.249.220.18', 'ip', 'phishing', 'medium', 0.68, 'Kimsuky reconnaissance and C2 server', now() - interval '18 days', now() - interval '2 days', true, 45, 2, (SELECT id FROM threat_feeds LIMIT 1)),
('94.23.148.66', 'ip', 'malware', 'high', 0.85, 'Emotet epoch 5 distribution server', now() - interval '7 days', now() - interval '1 day', true, 3456, 15, (SELECT id FROM threat_feeds LIMIT 1)),
('update-service.cloud', 'domain', 'c2', 'critical', 0.94, 'APT41 DGA-generated C2 domain masquerading as update service', now() - interval '30 days', now() - interval '1 day', true, 523, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('cdn-static.xyz', 'domain', 'c2', 'high', 0.89, 'Data exfiltration endpoint disguised as CDN', now() - interval '28 days', now() - interval '3 days', true, 201, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('vpn-gateway-corp.com', 'domain', 'phishing', 'critical', 0.87, 'Volt Typhoon credential harvesting domain', now() - interval '42 days', now() - interval '2 days', true, 1456, 7, (SELECT id FROM threat_feeds LIMIT 1)),
('doc-share-portal.com', 'domain', 'phishing', 'high', 0.85, 'MuddyWater document lure hosting domain', now() - interval '20 days', now() - interval '1 day', true, 345, 2, (SELECT id FROM threat_feeds LIMIT 1)),
('ms-update-check.net', 'domain', 'malware', 'high', 0.83, 'MuddyWater malware distribution domain impersonating Microsoft', now() - interval '19 days', now() - interval '2 days', true, 278, 3, (SELECT id FROM threat_feeds LIMIT 1)),
('helpdesk-portal-auth.com', 'domain', 'phishing', 'high', 0.80, 'Scattered Spider fake IT helpdesk for MFA phishing', now() - interval '14 days', now() - interval '1 day', true, 92, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('defi-bridge-update.com', 'domain', 'phishing', 'critical', 0.77, 'Lazarus cryptocurrency bridge phishing domain', now() - interval '11 days', now() - interval '1 day', true, 34, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('wallet-sync-service.io', 'domain', 'malware', 'critical', 0.75, 'Lazarus wallet drainer malware distribution', now() - interval '10 days', now() - interval '1 day', true, 28, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('vendor-invoice-portal.com', 'domain', 'phishing', 'high', 0.82, 'FIN7 invoice-themed phishing domain', now() - interval '35 days', now() - interval '5 days', true, 567, 4, (SELECT id FROM threat_feeds LIMIT 1)),
('scada-firmware-update.net', 'domain', 'c2', 'critical', 0.72, 'Sandworm fake SCADA firmware update delivery', now() - interval '24 days', now() - interval '3 days', true, 156, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('invoice-doc-view.com', 'domain', 'malware', 'medium', 0.88, 'QakBot HTML smuggling delivery domain', now() - interval '38 days', now() - interval '30 days', false, 2341, 9, (SELECT id FROM threat_feeds LIMIT 1)),
('a3f5b8c2d1e4f6a7b8c9d0e1f2a3b4c5', 'hash_md5', 'malware', 'critical', 0.97, 'APT41 ShadowPad backdoor variant', now() - interval '29 days', now() - interval '2 days', true, 12, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('e7d3f1a2b5c8d9e0f1a2b3c4d5e6f7a8', 'hash_md5', 'malware', 'critical', 0.91, 'Volt Typhoon living-off-the-land binary proxy', now() - interval '43 days', now() - interval '5 days', true, 7, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6', 'hash_sha256', 'ransomware', 'critical', 0.98, 'BlackCat/ALPHV ransomware encryptor binary', now() - interval '58 days', now() - interval '44 days', false, 156, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3', 'hash_sha256', 'malware', 'critical', 0.78, 'Lazarus TraderTraitor cryptocurrency stealer', now() - interval '11 days', now() - interval '1 day', true, 3, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6', 'hash_sha256', 'malware', 'high', 0.83, 'FIN7 Carbanak backdoor variant', now() - interval '34 days', now() - interval '6 days', true, 14, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('hxxps://update-service.cloud/api/v2/check', 'url', 'c2', 'critical', 0.93, 'APT41 C2 check-in URL with encrypted beacon', now() - interval '29 days', now() - interval '1 day', true, 445, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('hxxps://cdn-static.xyz/assets/logo.png', 'url', 'malware', 'high', 0.88, 'Data exfiltration endpoint masquerading as image download', now() - interval '27 days', now() - interval '2 days', true, 167, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('hxxps://helpdesk-portal-auth.com/login', 'url', 'phishing', 'high', 0.81, 'Scattered Spider Okta MFA phishing page', now() - interval '13 days', now() - interval '1 day', true, 56, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('hxxps://defi-bridge-update.com/sync', 'url', 'phishing', 'critical', 0.76, 'Lazarus fake DeFi bridge wallet connection page', now() - interval '10 days', now() - interval '1 day', true, 23, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('hxxps://vendor-invoice-portal.com/doc/INV-2024', 'url', 'malware', 'high', 0.84, 'FIN7 malicious invoice download URL', now() - interval '33 days', now() - interval '4 days', true, 389, 2, (SELECT id FROM threat_feeds LIMIT 1)),
('finance-dept@update-service.cloud', 'email', 'phishing', 'high', 0.91, 'APT41 spearphishing sender address', now() - interval '28 days', now() - interval '3 days', true, 78, 0, (SELECT id FROM threat_feeds LIMIT 1)),
('it-support@helpdesk-portal-auth.com', 'email', 'phishing', 'high', 0.80, 'Scattered Spider fake IT support email', now() - interval '14 days', now() - interval '1 day', true, 45, 1, (SELECT id FROM threat_feeds LIMIT 1)),
('noreply@ms-update-check.net', 'email', 'phishing', 'high', 0.82, 'MuddyWater fake Microsoft notification sender', now() - interval '18 days', now() - interval '2 days', true, 123, 3, (SELECT id FROM threat_feeds LIMIT 1)),
('CVE-2024-21762', 'cve', 'exploit', 'critical', 0.99, 'FortiOS SSL VPN RCE - actively exploited in the wild by multiple APT groups', now() - interval '60 days', now() - interval '1 day', true, 8934, 0, (SELECT id FROM threat_feeds LIMIT 1));
