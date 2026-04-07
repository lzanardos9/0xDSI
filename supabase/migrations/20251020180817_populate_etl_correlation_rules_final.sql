/*
  # Populate ETL System with Correlation Rules and Configuration

  1. Parsers Configuration
  2. Correlation Rules for threat detection
  3. Enrichment Sources
*/

-- Insert event parsers
INSERT INTO event_parsers (name, format_type, description, priority, enabled, regex_patterns, field_mappings) VALUES
('syslog_parser', 'syslog', 'RFC 3164 Syslog parser', 100, true, 
  '["^<(\\\\d+)>(\\\\w{3}\\\\s+\\\\d+\\\\s+\\\\d+:\\\\d+:\\\\d+)\\\\s+(\\\\S+)\\\\s+(\\\\S+):\\\\s*(.+)$"]'::jsonb,
  '{"priority": 1, "timestamp": 2, "hostname": 3, "process": 4, "message": 5}'::jsonb),

('cef_parser', 'cef', 'Common Event Format parser', 90, true,
  '["^CEF:(\\\\d+)\\\\|([^|]+)\\\\|([^|]+)\\\\|([^|]+)\\\\|([^|]+)\\\\|([^|]+)\\\\|([^|]+)\\\\|(.*)$"]'::jsonb,
  '{"version": 1, "vendor": 2, "product": 3, "signature": 5, "name": 6, "severity": 7}'::jsonb),

('json_parser', 'json', 'JSON log parser', 80, true,
  '[]'::jsonb,
  '{"timestamp": ["timestamp", "@timestamp", "time"], "severity": ["severity", "level"], "message": ["message", "msg"]}'::jsonb),

('leef_parser', 'leef', 'Log Event Extended Format parser', 85, true,
  '["^LEEF:([^|]+)\\\\|([^|]+)\\\\|([^|]+)\\\\|([^|]+)\\\\|(.*)$"]'::jsonb,
  '{"version": 1, "vendor": 2, "product": 3, "event_id": 4}'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Insert enrichment sources
INSERT INTO enrichment_sources (name, source_type, description, enabled, enrichment_fields) VALUES
('geoip_maxmind', 'geoip', 'MaxMind GeoIP2 database', true, 
  '["country", "city", "latitude", "longitude", "asn", "isp"]'::jsonb),

('threat_intel_abuse_ch', 'threat_intel', 'Abuse.ch threat feed', true,
  '["threat_type", "malware_family", "confidence", "tags"]'::jsonb),

('asset_inventory', 'internal', 'Internal asset inventory', true,
  '["asset_name", "owner", "criticality", "department", "tags"]'::jsonb),

('user_context', 'internal', 'User profile enrichment', true,
  '["full_name", "department", "title", "risk_score", "clearance_level"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Delete existing rules if any
DELETE FROM correlation_rules WHERE rule_name IN (
  'brute_force_ssh', 'brute_force_web', 'data_exfiltration', 'lateral_movement',
  'privilege_escalation', 'malware_indicators', 'port_scan_detection', 'ddos_detection',
  'credential_theft', 'insider_threat_data_access', 'ransomware_activity'
);

-- Insert correlation rules
INSERT INTO correlation_rules (rule_name, rule_description, rule_logic, severity, status, generated_by, tags) VALUES
('brute_force_ssh', 
  'Detect SSH brute force attempts - multiple failed logins from same source',
  '{
    "rule_type": "threshold",
    "event_types": ["authentication_failure", "ssh_failed_login", "failed_login"],
    "time_window_minutes": 5,
    "threshold": 5,
    "group_by": ["source_ip"]
  }'::jsonb,
  'high',
  'active',
  'manual',
  '["authentication", "brute_force", "ssh"]'::jsonb),

('brute_force_web', 
  'Detect web application brute force - multiple 401/403 from same IP',
  '{
    "rule_type": "threshold",
    "event_types": ["http_401", "http_403", "web_auth_failure"],
    "time_window_minutes": 10,
    "threshold": 10,
    "group_by": ["source_ip", "dest_ip"]
  }'::jsonb,
  'medium',
  'active',
  'manual',
  '["web", "brute_force", "http"]'::jsonb),

('data_exfiltration',
  'Detect large data transfers to external destinations',
  '{
    "rule_type": "pattern",
    "event_sequence": [
      {"event_type": "file_access", "file_size_gt": 104857600},
      {"event_type": "network_upload", "destination_external": true}
    ],
    "time_window_minutes": 15,
    "threshold": 1,
    "group_by": ["username", "source_ip"]
  }'::jsonb,
  'critical',
  'active',
  'manual',
  '["data_exfiltration", "insider_threat", "dlp"]'::jsonb),

('lateral_movement',
  'Detect lateral movement - authentication followed by remote execution',
  '{
    "rule_type": "pattern",
    "event_sequence": [
      {"event_type": "authentication_success"},
      {"event_type": "remote_execution"},
      {"event_type": "file_copy"}
    ],
    "time_window_minutes": 30,
    "threshold": 1,
    "group_by": ["username"]
  }'::jsonb,
  'critical',
  'active',
  'manual',
  '["lateral_movement", "apt", "attack_chain"]'::jsonb),

('privilege_escalation',
  'Detect privilege escalation attempts',
  '{
    "rule_type": "threshold",
    "event_types": ["privilege_escalation_attempt", "sudo_failure", "runas_failure"],
    "time_window_minutes": 10,
    "threshold": 3,
    "group_by": ["username", "source_ip"]
  }'::jsonb,
  'high',
  'active',
  'manual',
  '["privilege_escalation", "exploitation"]'::jsonb),

('malware_indicators',
  'Detect multiple malware indicators from same host',
  '{
    "rule_type": "threshold",
    "event_types": ["malware_detected", "suspicious_process", "c2_communication"],
    "time_window_minutes": 30,
    "threshold": 2,
    "group_by": ["source_ip"]
  }'::jsonb,
  'critical',
  'active',
  'manual',
  '["malware", "infection", "c2"]'::jsonb),

('port_scan_detection',
  'Detect port scanning activity',
  '{
    "rule_type": "threshold",
    "event_types": ["connection_attempt", "port_probe"],
    "time_window_minutes": 5,
    "threshold": 50,
    "group_by": ["source_ip"]
  }'::jsonb,
  'medium',
  'active',
  'manual',
  '["reconnaissance", "port_scan", "network"]'::jsonb),

('ddos_detection',
  'Detect distributed denial of service attacks',
  '{
    "rule_type": "threshold",
    "event_types": ["http_request", "syn_packet"],
    "time_window_minutes": 2,
    "threshold": 10000,
    "group_by": ["dest_ip"]
  }'::jsonb,
  'critical',
  'active',
  'manual',
  '["ddos", "dos", "availability"]'::jsonb),

('credential_theft',
  'Detect credential dumping and theft attempts',
  '{
    "rule_type": "threshold",
    "event_types": ["lsass_access", "credential_dump", "mimikatz_detected"],
    "time_window_minutes": 15,
    "threshold": 1,
    "group_by": ["source_ip"]
  }'::jsonb,
  'critical',
  'active',
  'manual',
  '["credential_theft", "credential_dumping", "mimikatz"]'::jsonb),

('insider_threat_data_access',
  'Detect unusual data access patterns indicating insider threat',
  '{
    "rule_type": "anomaly",
    "event_types": ["file_access", "database_query"],
    "anomaly_type": "volume",
    "baseline_period_days": 30,
    "deviation_threshold": 3.0,
    "time_window_minutes": 60,
    "threshold": 1,
    "group_by": ["username"]
  }'::jsonb,
  'high',
  'active',
  'manual',
  '["insider_threat", "anomaly", "behavioral"]'::jsonb),

('ransomware_activity',
  'Detect ransomware encryption activity',
  '{
    "rule_type": "pattern",
    "event_sequence": [
      {"event_type": "mass_file_modification"},
      {"event_type": "file_encryption_detected"},
      {"event_type": "ransom_note_created"}
    ],
    "time_window_minutes": 10,
    "threshold": 1,
    "group_by": ["source_ip"]
  }'::jsonb,
  'critical',
  'active',
  'manual',
  '["ransomware", "encryption", "malware"]'::jsonb);
