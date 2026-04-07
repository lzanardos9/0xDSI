/*
  # Red Team Automation Mock Data - Working Version

  Populates all Red Team Automation tables with realistic mock data.
*/

-- Clear existing data
TRUNCATE TABLE fuzzing_results, pentest_findings, pentest_targets, agent_pentest_sessions, attack_chains CASCADE;
TRUNCATE TABLE fuzzing_campaigns, pentest_campaigns, ai_generated_tools CASCADE;

-- Insert fuzzing campaigns
INSERT INTO fuzzing_campaigns (campaign_name, fuzzer_type, target_type, target_name, status, total_executions, executions_per_second, total_crashes, unique_crashes, code_coverage_percent, start_time) VALUES
('Payment API Fuzzer', 'AFL++', 'API', 'Payment Gateway', 'completed', 2453000, 1205.5, 23, 8, 87.5, NOW() - INTERVAL '2 hours'),
('Auth Binary Fuzzer', 'LibFuzzer', 'binary', 'auth-daemon', 'running', 5284500, 2341.2, 45, 12, 92.3, NOW() - INTERVAL '6 hours'),
('GraphQL Fuzzer', 'Jazzer', 'API', 'Customer GraphQL', 'completed', 1321500, 876.3, 8, 3, 78.2, NOW() - INTERVAL '1 day'),
('TCP Fuzzer', 'Boofuzz', 'network', 'TCP Service', 'failed', 652300, 543.1, 67, 23, 45.8, NOW() - INTERVAL '3 days'),
('PDF Parser Fuzzer', 'Honggfuzz', 'binary', 'pdf-parse', 'completed', 4893200, 3245.7, 156, 45, 94.7, NOW() - INTERVAL '5 days'),
('User API Fuzzer', 'AFL++', 'API', 'User Mgmt', 'running', 3467890, 1876.4, 12, 5, 81.3, NOW() - INTERVAL '4 hours'),
('WebSocket Fuzzer', 'Custom', 'websocket', 'Chat WS', 'completed', 1234500, 654.2, 34, 9, 73.5, NOW() - INTERVAL '8 hours'),
('SQL Fuzzer', 'SQLsmith', 'database', 'PostgreSQL', 'completed', 2456700, 1234.5, 89, 34, 88.9, NOW() - INTERVAL '12 hours');

-- Insert fuzzing results
INSERT INTO fuzzing_results (campaign_id, test_case_id, result_type, crash_type, input_size, code_coverage_delta, new_paths_discovered, timestamp)
SELECT 
  fc.id,
  'TC-' || substr(md5(random()::text), 1, 8),
  CASE (random() * 3)::int WHEN 0 THEN 'crash' WHEN 1 THEN 'hang' ELSE 'new_coverage' END,
  CASE (random() * 5)::int WHEN 0 THEN 'segfault' WHEN 1 THEN 'heap_overflow' WHEN 2 THEN 'stack_overflow' WHEN 3 THEN 'null_pointer' ELSE 'timeout' END,
  (random() * 8192)::int + 128,
  (random() * 5.0)::numeric(5,2),
  (random() * 50)::int,
  fc.start_time + ((random() * 3600)::int || ' seconds')::interval
FROM fuzzing_campaigns fc
CROSS JOIN generate_series(1, 10)
WHERE fc.total_crashes > 0;

-- Insert pentest campaigns
INSERT INTO pentest_campaigns (campaign_name, campaign_type, methodology, agent_model, status, targets_count, vulnerabilities_found, critical_findings, high_findings, medium_findings, low_findings, exploited_count, risk_score, start_time) VALUES
('Q4 Web Pentest', 'web', 'OWASP', 'GPT-4', 'completed', 23, 34, 3, 8, 15, 8, 11, 8.7, NOW() - INTERVAL '10 days'),
('Network Audit', 'network', 'NIST', 'Claude-3', 'completed', 156, 67, 12, 23, 25, 7, 35, 9.2, NOW() - INTERVAL '15 days'),
('API Security', 'api', 'REST', 'GPT-4', 'running', 45, 23, 2, 7, 10, 4, 9, 7.4, NOW() - INTERVAL '3 days'),
('Mobile App Test', 'mobile', 'MASVS', 'Claude-3', 'completed', 12, 19, 1, 5, 9, 4, 6, 6.8, NOW() - INTERVAL '20 days'),
('Cloud Security', 'cloud', 'CIS', 'GPT-4', 'completed', 78, 45, 8, 15, 18, 4, 23, 8.9, NOW() - INTERVAL '12 days'),
('AD Assessment', 'active_directory', 'BloodHound', 'Custom', 'running', 234, 56, 15, 20, 16, 5, 35, 9.5, NOW() - INTERVAL '2 days'),
('Container Sec', 'container', 'K8s', 'GPT-4', 'completed', 89, 38, 7, 12, 14, 5, 19, 8.1, NOW() - INTERVAL '8 days'),
('DB Security', 'database', 'OWASP', 'Claude-3', 'completed', 34, 28, 4, 9, 11, 4, 13, 7.6, NOW() - INTERVAL '18 days');

-- Insert pentest targets
INSERT INTO pentest_targets (campaign_id, target_name, target_type, ip_address, hostname, port, service_name, service_version, os_detected, firewall_detected, waf_detected, ids_ips_detected, scan_status, vulnerabilities_found, exploited, compromised, privilege_level)
SELECT 
  pc.id,
  'Target-' || generate_series,
  CASE (random() * 4)::int WHEN 0 THEN 'web_server' WHEN 1 THEN 'api_endpoint' WHEN 2 THEN 'database' ELSE 'workstation' END,
  ('10.' || (10 + (random() * 240)::int) || '.' || (random() * 255)::int || '.' || (1 + random() * 254)::int)::inet,
  'host-' || generate_series || '.local',
  CASE (random() * 4)::int WHEN 0 THEN 80 WHEN 1 THEN 443 WHEN 2 THEN 22 ELSE 3306 END,
  CASE (random() * 4)::int WHEN 0 THEN 'nginx' WHEN 1 THEN 'apache' WHEN 2 THEN 'ssh' ELSE 'mysql' END,
  (random() * 3)::int || '.' || (random() * 10)::int,
  CASE (random() * 3)::int WHEN 0 THEN 'Ubuntu' WHEN 1 THEN 'CentOS' ELSE 'Windows' END,
  random() > 0.5,
  random() > 0.7,
  random() > 0.6,
  CASE (random() * 3)::int WHEN 0 THEN 'scanned' WHEN 1 THEN 'vulnerable' ELSE 'exploited' END,
  (random() * 5)::int,
  random() > 0.7,
  random() > 0.8,
  CASE (random() * 3)::int WHEN 0 THEN 'none' WHEN 1 THEN 'user' ELSE 'admin' END
FROM pentest_campaigns pc
CROSS JOIN generate_series(1, 10);

-- Insert pentest findings
INSERT INTO pentest_findings (campaign_id, vulnerability_name, cve_id, severity, cvss_score, description, affected_component, exploited, remediation, discovered_at)
SELECT 
  pc.id,
  CASE (random() * 10)::int
    WHEN 0 THEN 'SQL Injection'
    WHEN 1 THEN 'XSS Stored'
    WHEN 2 THEN 'Auth Bypass'
    WHEN 3 THEN 'RCE via API'
    WHEN 4 THEN 'IDOR'
    WHEN 5 THEN 'SSRF'
    WHEN 6 THEN 'XXE'
    WHEN 7 THEN 'Broken Access'
    WHEN 8 THEN 'Misconfiguration'
    ELSE 'Data Exposure'
  END,
  CASE WHEN random() > 0.5 THEN 'CVE-2024-' || (10000 + (random() * 50000)::int) ELSE NULL END,
  CASE (random() * 4)::int WHEN 0 THEN 'critical' WHEN 1 THEN 'high' WHEN 2 THEN 'medium' ELSE 'low' END,
  (4.0 + random() * 6.0)::numeric(3,1),
  'Critical vulnerability discovered',
  'Component-' || generate_series,
  random() > 0.6,
  'Apply patches and validation',
  pc.start_time + ((random() * 300000)::int || ' seconds')::interval
FROM pentest_campaigns pc
CROSS JOIN generate_series(1, 5);

-- Insert AI agent sessions with proper JSONB
INSERT INTO agent_pentest_sessions (campaign_id, agent_name, agent_role, agent_model, session_start, session_end, actions_performed, vulnerabilities_discovered, successful_exploits, tools_created, session_log)
SELECT
  pc.id,
  CASE (random() * 4)::int WHEN 0 THEN 'PentestGPT' WHEN 1 THEN 'AutoExploit' WHEN 2 THEN 'ReconAgent' ELSE 'VulnHunter' END,
  CASE (random() * 3)::int WHEN 0 THEN 'reconnaissance' WHEN 1 THEN 'exploitation' ELSE 'post_exploitation' END,
  CASE (random() * 3)::int WHEN 0 THEN 'GPT-4' WHEN 1 THEN 'Claude-3' ELSE 'Llama-3-70B' END,
  pc.start_time + ((random() * 43200)::int || ' seconds')::interval,
  pc.start_time + ((random() * 86400)::int + 3600 || ' seconds')::interval,
  (random() * 150)::int + 20,
  (random() * 15)::int,
  (random() * 8)::int,
  (random() * 5)::int,
  jsonb_build_object(
    'phase_1', 'Reconnaissance',
    'phase_2', 'Scanning',
    'phase_3', 'Exploitation',
    'actions', (random() * 50)::int
  )
FROM pentest_campaigns pc
CROSS JOIN generate_series(1, 2)
WHERE pc.agent_model IS NOT NULL;

-- Insert AI tools
INSERT INTO ai_generated_tools (tool_name, tool_type, tool_purpose, target_vulnerability, programming_language, creation_method, ai_model, effectiveness_score, success_rate, times_used, successful_uses, detection_rate) VALUES
('Polymorphic Shellcode', 'payload', 'Unique shellcode', 'Memory', 'C', 'adversarial', 'GPT-4', 96.2, 91.7, 187, 171, 8.4),
('Smart SQLi', 'exploit', 'SQLi attacks', 'SQL Injection', 'Python', 'RL', 'Claude-3', 94.5, 89.3, 234, 209, 12.1),
('XSS Payloader', 'payload', 'XSS payloads', 'XSS', 'JS', 'neural', 'GPT-4', 92.8, 87.5, 345, 302, 15.3),
('AI Scanner', 'scanner', 'Port scanning', 'Network', 'Go', 'ML', 'Custom', 98.1, 96.4, 892, 860, 3.2),
('DeepFuzz', 'scanner', 'API fuzzing', 'API', 'Python', 'DL', 'GPT-4', 93.7, 88.9, 456, 406, 11.8),
('Dir Bruteforcer', 'scanner', 'Directory enum', 'Info', 'Rust', 'generative', 'Llama-3', 95.3, 91.2, 678, 618, 9.7),
('Privesc Tool', 'exploit', 'Privilege esc', 'PrivEsc', 'C', 'RL', 'GPT-4', 89.4, 82.6, 156, 129, 18.3),
('Payload Encoder', 'encoder', 'Encode payloads', 'Evasion', 'Python', 'adversarial', 'Claude-3', 97.2, 94.8, 1234, 1170, 5.6),
('Cred Bruteforcer', 'tool', 'Password attacks', 'Auth', 'Python', 'pattern', 'GPT-4', 91.6, 86.3, 567, 489, 14.2),
('Network Mapper', 'scanner', 'Network mapping', 'Discovery', 'Python', 'GNN', 'Custom', 96.8, 93.7, 789, 739, 6.4),
('SSRF Exploiter', 'exploit', 'SSRF attacks', 'SSRF', 'Python', 'RL', 'GPT-4', 90.3, 84.7, 234, 198, 16.5),
('Command Injector', 'exploit', 'Command injection', 'Command Inj', 'Bash', 'neural', 'Claude-3', 88.9, 81.4, 345, 281, 19.7),
('Web Crawler', 'scanner', 'Web crawling', 'Info', 'Python', 'DL', 'GPT-4', 94.7, 90.2, 1456, 1314, 10.3),
('Packet Crafter', 'tool', 'Packet generation', 'Protocol', 'C', 'generative', 'Custom', 93.4, 88.6, 456, 404, 12.7),
('Deserial Exploiter', 'exploit', 'Deserialization', 'Deserial', 'Java', 'adversarial', 'GPT-4', 87.6, 79.8, 123, 98, 21.4),
('LDAP Injector', 'exploit', 'LDAP injection', 'LDAP Inj', 'Python', 'RL', 'Claude-3', 89.7, 83.2, 189, 157, 17.9),
('XXE Exploiter', 'exploit', 'XXE attacks', 'XXE', 'Python', 'neural', 'GPT-4', 91.2, 85.9, 267, 229, 15.6),
('RCE Finder', 'scanner', 'RCE discovery', 'RCE', 'Python', 'DL', 'GPT-4', 95.8, 92.1, 345, 318, 8.9),
('Path Traverser', 'exploit', 'Path traversal', 'Path Trav', 'Python', 'RL', 'Claude-3', 90.8, 85.4, 456, 389, 16.2),
('Auth Bypasser', 'exploit', 'Auth bypass', 'Auth', 'Python', 'adversarial', 'GPT-4', 88.3, 80.7, 234, 189, 20.1),
('CSRF Generator', 'payload', 'CSRF attacks', 'CSRF', 'JS', 'generative', 'GPT-4', 92.5, 87.8, 567, 498, 13.4),
('Malware Packer', 'packer', 'Malware packing', 'Evasion', 'C++', 'adversarial', 'Custom', 94.3, 89.6, 178, 159, 11.2),
('Reverse Shell', 'payload', 'Reverse shells', 'Remote', 'Python', 'RL', 'GPT-4', 93.6, 88.7, 890, 789, 12.5),
('Keylogger', 'tool', 'Keylogging', 'Cred Theft', 'C', 'DL', 'Custom', 96.4, 93.2, 456, 425, 7.8),
('Rootkit Gen', 'tool', 'Rootkit creation', 'Persistence', 'C', 'adversarial', 'GPT-4', 91.7, 86.4, 123, 106, 14.9);

-- Insert attack chains
INSERT INTO attack_chains (campaign_id, chain_name, attack_scenario, initial_access_technique, stages, current_stage, total_stages, success, objectives_completed, mitre_attack_tactics, start_time, duration_seconds, detection_events, blue_team_response)
SELECT 
  pc.id,
  CASE (random() * 5)::int WHEN 0 THEN 'APT Simulation' WHEN 1 THEN 'Ransomware Chain' WHEN 2 THEN 'Cloud Takeover' WHEN 3 THEN 'Data Exfil' ELSE 'AD Takeover' END,
  'Multi-stage attack simulation for red team exercise',
  CASE (random() * 3)::int WHEN 0 THEN 'phishing' WHEN 1 THEN 'exploit' ELSE 'credentials' END,
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'Initial Access', 'status', 'completed'),
    jsonb_build_object('stage', 2, 'name', 'Execution', 'status', 'completed'),
    jsonb_build_object('stage', 3, 'name', 'Persistence', 'status', 'in_progress'),
    jsonb_build_object('stage', 4, 'name', 'Privilege Escalation', 'status', 'pending'),
    jsonb_build_object('stage', 5, 'name', 'Lateral Movement', 'status', 'pending'),
    jsonb_build_object('stage', 6, 'name', 'Exfiltration', 'status', 'pending')
  ),
  3,
  6,
  random() > 0.5,
  jsonb_build_array('initial_access', 'execution'),
  jsonb_build_array('Initial Access', 'Execution', 'Persistence'),
  pc.start_time + ((random() * 43200)::int || ' seconds')::interval,
  (random() * 10000)::int + 2000,
  (random() * 20)::int,
  random() > 0.6
FROM pentest_campaigns pc
WHERE pc.campaign_type IN ('red_team', 'network', 'web')
LIMIT 10;