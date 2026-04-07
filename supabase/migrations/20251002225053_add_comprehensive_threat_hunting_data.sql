/*
  # Add Comprehensive Threat Hunting Mock Data
  
  Populates realistic hunting data including:
  - Security events from various attack scenarios
  - Threat hunt queries with findings
  - Vector correlations
*/

-- Clear existing data
TRUNCATE raw_security_events, threat_hunt_queries, vector_correlations RESTART IDENTITY CASCADE;

-- Insert mock security events across different attack scenarios
INSERT INTO raw_security_events (event_timestamp, raw_payload, event_summary, source_system, source_ip, destination_ip, event_type_detected, threat_indicators, similarity_cluster, processed) VALUES

-- Lateral Movement (Cluster 1)
(now() - interval '2 hours', '{"event_type": "authentication", "action": "login_success", "user": "svc_backup", "source_host": "web01.dmz.corp", "target_host": "db01.prod.corp", "auth_method": "ntlm"}'::jsonb, 'Service account authenticated from web server to production database', 'Windows Security', '10.1.1.10', '10.2.2.10', 'authentication', '[{"type": "ip", "value": "10.1.1.10"}, {"type": "user", "value": "svc_backup"}]'::jsonb, 1, true),
(now() - interval '2 hours' + interval '5 minutes', '{"event_type": "network", "action": "smb_connection", "source_host": "db01.prod.corp", "target_host": "app01.prod.corp", "protocol": "smb", "port": 445}'::jsonb, 'SMB connection from database server to application server', 'Network IDS', '10.2.2.10', '10.2.1.10', 'network', '[{"type": "ip", "value": "10.2.2.10"}, {"type": "port", "value": "445"}]'::jsonb, 1, true),
(now() - interval '2 hours' + interval '12 minutes', '{"event_type": "process", "action": "process_creation", "process": "powershell.exe", "command_line": "Invoke-Mimikatz", "parent_process": "services.exe"}'::jsonb, 'PowerShell credential dumping tool executed', 'EDR', '10.2.1.10', null, 'process', '[{"type": "process", "value": "powershell.exe"}]'::jsonb, 1, true),

-- Data Exfiltration (Cluster 2)
(now() - interval '4 hours', '{"event_type": "file_access", "action": "bulk_read", "user": "john.doe", "file_count": 547, "data_volume": "2.3GB"}'::jsonb, 'Bulk file access outside business hours - 547 files', 'DLP System', '10.4.1.50', '203.0.113.45', 'file_access', '[{"type": "user", "value": "john.doe"}]'::jsonb, 2, true),
(now() - interval '4 hours' + interval '15 minutes', '{"event_type": "network", "action": "large_upload", "protocol": "https", "destination": "cloud-storage-unknown.com", "bytes": 2400000000}'::jsonb, 'Large HTTPS upload to unknown cloud storage', 'Firewall', '10.4.1.50', '198.51.100.89', 'network', '[{"type": "domain", "value": "cloud-storage-unknown.com"}]'::jsonb, 2, true),

-- Ransomware (Cluster 3)
(now() - interval '1 hour', '{"event_type": "system", "action": "shadow_copy_delete", "command": "vssadmin delete shadows /all /quiet"}'::jsonb, 'Shadow copy deletion - ransomware indicator', 'Windows System', '10.3.1.10', null, 'process', '[{"type": "command", "value": "vssadmin"}]'::jsonb, 3, true),
(now() - interval '1 hour' + interval '3 minutes', '{"event_type": "file", "action": "mass_rename", "files_affected": 1247, "pattern": ".encrypted"}'::jsonb, 'Mass file encryption detected', 'File System Monitor', '10.3.1.10', null, 'file', '[{"type": "extension", "value": ".encrypted"}]'::jsonb, 3, true),

-- APT Activity (Cluster 4)
(now() - interval '6 hours', '{"event_type": "dns", "action": "tunneling_detected", "query_count": 347, "payload_size": 53, "destination": "malicious-c2.com"}'::jsonb, 'DNS tunneling to suspected C2 domain', 'DNS Monitor', '10.5.2.15', '185.220.101.45', 'network', '[{"type": "domain", "value": "malicious-c2.com"}]'::jsonb, 4, true),
(now() - interval '6 hours' + interval '20 minutes', '{"event_type": "file", "action": "dropper_execution", "hash": "a1b2c3d4e5f6", "signature": "APT29_Toolset"}'::jsonb, 'Known APT29 dropper executed', 'EDR', '10.5.2.15', null, 'malware', '[{"type": "hash", "value": "a1b2c3d4e5f6"}]'::jsonb, 4, true),

-- Insider Threat (Cluster 5)
(now() - interval '8 hours', '{"event_type": "database", "action": "bulk_query", "rows_returned": 50000, "table": "customer_pii", "time": "02:15 AM"}'::jsonb, 'After-hours bulk database query on PII table', 'Database Audit', '10.6.1.25', '10.2.2.10', 'database', '[{"type": "table", "value": "customer_pii"}]'::jsonb, 5, true),
(now() - interval '8 hours' + interval '10 minutes', '{"event_type": "vpn", "action": "connection", "location": "Unknown Country", "device": "personal_laptop"}'::jsonb, 'VPN connection from suspicious location', 'VPN Gateway', '203.45.67.89', '10.0.0.1', 'network', '[{"type": "location", "value": "suspicious"}]'::jsonb, 5, true),

-- Web Attack (Cluster 6)
(now() - interval '3 hours', '{"event_type": "web", "action": "sql_injection", "payload": "1 OR 1=1", "target": "/api/users"}'::jsonb, 'SQL injection attempt detected', 'WAF', '198.51.100.42', '10.7.1.10', 'web_attack', '[{"type": "attack_type", "value": "sql_injection"}]'::jsonb, 6, true),
(now() - interval '3 hours' + interval '2 minutes', '{"event_type": "web", "action": "shell_upload", "file": "webshell.php", "target": "/uploads/"}'::jsonb, 'Web shell upload attempt', 'WAF', '198.51.100.42', '10.7.1.10', 'web_attack', '[{"type": "file", "value": "webshell.php"}]'::jsonb, 6, true),

-- Crypto Mining (Cluster 7)
(now() - interval '12 hours', '{"event_type": "process", "action": "high_cpu", "process": "xmrig.exe", "cpu_usage": 98}'::jsonb, 'Cryptocurrency miner detected', 'EDR', '10.8.3.45', null, 'malware', '[{"type": "process", "value": "xmrig.exe"}]'::jsonb, 7, true),
(now() - interval '12 hours' + interval '5 minutes', '{"event_type": "network", "action": "mining_pool_connection", "destination": "mining.pool.com", "port": 3333}'::jsonb, 'Connection to cryptocurrency mining pool', 'Firewall', '10.8.3.45', '45.67.89.123', 'network', '[{"type": "domain", "value": "mining.pool.com"}]'::jsonb, 7, true);

-- Insert threat hunt queries with findings
INSERT INTO threat_hunt_queries (query_name, natural_language_query, hunt_type, time_range_start, time_range_end, results_count, findings, status, hunter, created_at, completed_at) VALUES

('Lateral Movement Hunt', 'Find authentication events followed by unusual network connections indicating lateral movement across internal systems', 'behavioral_hunt', now() - interval '7 days', now(), 15, '[
  {"event_cluster": 1, "severity": "critical", "description": "Service account moving laterally through production network", "confidence": 0.94},
  {"technique": "MITRE T1021", "indicators": ["Multiple SMB connections", "Credential reuse", "Admin tool execution"]},
  {"recommendation": "Isolate affected systems and reset service account credentials"}
]'::jsonb, 'completed', 'Threat Hunter Alpha', now() - interval '2 hours', now() - interval '1 hour'),

('Data Exfiltration Investigation', 'Search for large data transfers to external destinations during off-hours combined with bulk file access', 'pattern_hunt', now() - interval '14 days', now(), 8, '[
  {"event_cluster": 2, "severity": "high", "description": "Employee exfiltrating customer data to personal cloud storage", "confidence": 0.89},
  {"data_volume": "2.3GB", "files": 547, "destination": "external_cloud"},
  {"recommendation": "Suspend user account and preserve evidence for investigation"}
]'::jsonb, 'completed', 'SOC Analyst', now() - interval '5 hours', now() - interval '4 hours'),

('Ransomware Pre-Execution Detection', 'Hunt for ransomware preparation activities including shadow copy deletion and backup service tampering', 'anomaly_hunt', now() - interval '24 hours', now(), 12, '[
  {"event_cluster": 3, "severity": "critical", "description": "Ransomware staging detected before encryption", "confidence": 0.97},
  {"indicators": ["Shadow copies deleted", "Mass file modifications", "Backup services stopped"]},
  {"recommendation": "Immediate containment - ransomware caught before execution"}
]'::jsonb, 'completed', 'Incident Response', now() - interval '1 hour', now() - interval '30 minutes'),

('APT C2 Communication Hunt', 'Identify command and control channels using DNS tunneling or periodic beaconing patterns', 'semantic_search', now() - interval '30 days', now(), 23, '[
  {"event_cluster": 4, "severity": "critical", "description": "APT29 infrastructure communicating via DNS tunneling", "confidence": 0.91},
  {"c2_domain": "malicious-c2.com", "beacon_interval": "120s", "data_exfiltrated": "estimated 500MB"},
  {"recommendation": "Block C2 domains and conduct full forensic investigation"}
]'::jsonb, 'completed', 'Threat Intel Team', now() - interval '6 hours', now() - interval '5 hours'),

('Insider Threat Behavioral Analysis', 'Detect unusual data access patterns by privileged users including after-hours activity and bulk queries', 'behavioral_hunt', now() - interval '90 days', now(), 6, '[
  {"event_cluster": 5, "severity": "high", "description": "Database administrator accessing customer PII outside normal hours", "confidence": 0.86},
  {"access_pattern": "Weekly after-hours access", "data_accessed": "50000 customer records"},
  {"recommendation": "Engage HR and legal for insider threat investigation"}
]'::jsonb, 'completed', 'Security Operations', now() - interval '8 hours', now() - interval '7 hours'),

('Web Application Attack Campaign', 'Hunt for coordinated web attacks including SQL injection, XSS, and shell upload attempts', 'pattern_hunt', now() - interval '48 hours', now(), 34, '[
  {"event_cluster": 6, "severity": "high", "description": "Coordinated web application attack from single source", "confidence": 0.88},
  {"attack_types": ["SQL Injection", "Shell Upload", "Path Traversal"], "attempts": 34},
  {"recommendation": "Block source IP and patch vulnerable application"}
]'::jsonb, 'completed', 'Application Security', now() - interval '3 hours', now() - interval '2 hours'),

('Cryptocurrency Mining Detection', 'Search for unauthorized crypto mining based on CPU usage patterns and mining pool connections', 'anomaly_hunt', now() - interval '7 days', now(), 18, '[
  {"event_cluster": 7, "severity": "medium", "description": "Cryptominer deployed across multiple workstations", "confidence": 0.93},
  {"affected_systems": 18, "mining_pool": "mining.pool.com", "impact": "Degraded system performance"},
  {"recommendation": "Remove mining software and identify infection vector"}
]'::jsonb, 'completed', 'SOC Team', now() - interval '12 hours', now() - interval '11 hours'),

('Active Threat Hunt - Zero Day Exploitation', 'Ongoing hunt for exploitation of recently disclosed vulnerability CVE-2024-XXXX', 'semantic_search', now() - interval '6 hours', now(), 3, '[
  {"preliminary_findings": "3 systems showing exploitation indicators"},
  {"cve": "CVE-2024-XXXX", "affected_service": "Web Application Framework"},
  {"status": "Hunt in progress - preliminary indicators detected"}
]'::jsonb, 'running', 'Advanced Hunt Team', now() - interval '2 hours', null);

-- Insert vector correlations
INSERT INTO vector_correlations (rule_id, event_ids, correlation_type, similarity_score, threat_narrative, severity, investigated, findings) SELECT
  (SELECT id FROM vector_correlation_rules WHERE rule_name = 'Lateral Movement Detection' LIMIT 1),
  (SELECT jsonb_agg(id) FROM (SELECT id FROM raw_security_events WHERE similarity_cluster = 1 LIMIT 3) sub),
  'multi_stage_attack',
  0.94,
  'Attacker compromised service account on DMZ web server, moved laterally to production database, then to application server where credential dumping tool was executed. Classic post-exploitation lateral movement pattern.',
  'critical',
  true,
  'Confirmed lateral movement attack chain. Service account credentials compromised. Immediate containment and credential rotation required.'
WHERE (SELECT COUNT(*) FROM raw_security_events WHERE similarity_cluster = 1) > 0;

INSERT INTO vector_correlations (rule_id, event_ids, correlation_type, similarity_score, threat_narrative, severity, investigated, findings) SELECT
  (SELECT id FROM vector_correlation_rules WHERE rule_name = 'Data Exfiltration Pattern' LIMIT 1),
  (SELECT jsonb_agg(id) FROM (SELECT id FROM raw_security_events WHERE similarity_cluster = 2 LIMIT 2) sub),
  'temporal_sequence',
  0.89,
  'Employee accessed 547 files containing 2.3GB of customer data during early morning hours, immediately followed by large HTTPS upload to unknown cloud storage service. Strong indicators of data theft.',
  'high',
  true,
  'Insider threat confirmed. Data exfiltration in progress. User account suspended and forensic evidence preserved.'
WHERE (SELECT COUNT(*) FROM raw_security_events WHERE similarity_cluster = 2) > 0;

INSERT INTO vector_correlations (rule_id, event_ids, correlation_type, similarity_score, threat_narrative, severity, investigated, findings) SELECT
  (SELECT id FROM vector_correlation_rules WHERE rule_name = 'Command and Control Communication' LIMIT 1),
  (SELECT jsonb_agg(id) FROM (SELECT id FROM raw_security_events WHERE similarity_cluster = 4 LIMIT 2) sub),
  'behavioral_cluster',
  0.91,
  'DNS tunneling to known APT29 infrastructure detected. Regular beaconing every 120 seconds with 53-byte payloads containing encrypted data. APT29 dropper malware found on same system.',
  'critical',
  true,
  'Active APT29 C2 communication identified. System isolated and forensic analysis ongoing. Threat actor attempted data exfiltration via DNS tunneling.'
WHERE (SELECT COUNT(*) FROM raw_security_events WHERE similarity_cluster = 4) > 0;