/*
  # Fix Red Team Missing Columns
  
  Add missing columns to support Red Team UI
*/

-- Add agent_model to agent_pentest_sessions if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'agent_pentest_sessions' AND column_name = 'agent_model') THEN
    ALTER TABLE agent_pentest_sessions ADD COLUMN agent_model text;
  END IF;
END $$;

-- Add session_log to agent_pentest_sessions if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'agent_pentest_sessions' AND column_name = 'session_log') THEN
    ALTER TABLE agent_pentest_sessions ADD COLUMN session_log jsonb;
  END IF;
END $$;

-- Now populate data
INSERT INTO fuzzing_results (campaign_id, test_case_id, result_type, crash_type, input_size, code_coverage_delta, new_paths_discovered, timestamp)
SELECT 
  (SELECT id FROM fuzzing_campaigns LIMIT 1),
  'TC-' || lpad(generate_series::text, 5, '0'),
  CASE (random() * 10)::int WHEN 0 THEN 'crash' WHEN 1 THEN 'crash' WHEN 2 THEN 'hang' WHEN 3 THEN 'anomaly' ELSE 'normal' END,
  CASE (random() * 6)::int WHEN 0 THEN 'heap-buffer-overflow' WHEN 1 THEN 'stack-buffer-overflow' WHEN 2 THEN 'use-after-free' WHEN 3 THEN 'null-pointer-dereference' WHEN 4 THEN 'integer-overflow' ELSE NULL END,
  (random() * 10000 + 100)::int,
  (random() * 5)::numeric(5,2),
  (random() * 50)::int,
  now() - (random() * interval '6 hours')
FROM generate_series(1, 50)
ON CONFLICT DO NOTHING;

INSERT INTO pentest_findings (campaign_id, vulnerability_name, cve_id, severity, cvss_score, description, affected_component, exploited, remediation, discovered_at, finding_type, category)
SELECT 
  (SELECT id FROM pentest_campaigns LIMIT 1),
  vulnerability_name, cve_id, severity, cvss_score, description, affected_component, exploited, remediation, discovered_at, finding_type, category
FROM (VALUES
  ('SMBv1 on DCs', 'CVE-2017-0144', 'critical', 9.3, 'EternalBlue vuln', '10.0.1.10', true, 'Disable SMBv1', now() - interval '2 days', 'vulnerability', 'network'),
  ('Weak Kerberos', 'CVE-2021-42287', 'high', 8.1, 'RC4-HMAC allowed', '10.0.1.0/24', false, 'Enforce AES', now() - interval '2 days', 'vulnerability', 'authentication'),
  ('Exchange RCE', 'CVE-2021-26855', 'critical', 9.8, 'ProxyLogon RCE', '10.0.5.25', true, 'Apply patches', now() - interval '1 day', 'vulnerability', 'application'),
  ('SQL Injection', 'N/A', 'high', 8.6, 'SQLi in search', '10.0.10.45', true, 'Parameterized queries', now() - interval '2 days', 'vulnerability', 'web'),
  ('Default Creds', 'N/A', 'critical', 9.1, 'Admin/admin', '10.0.20.0/24', true, 'Change creds', now() - interval '3 days', 'misconfiguration', 'network')
) AS v(vulnerability_name, cve_id, severity, cvss_score, description, affected_component, exploited, remediation, discovered_at, finding_type, category)
ON CONFLICT DO NOTHING;

INSERT INTO agent_pentest_sessions (campaign_id, agent_id, agent_name, agent_role, agent_model, session_start, session_end, actions_performed, vulnerabilities_discovered, successful_exploits, tools_created, session_log)
SELECT 
  (SELECT id FROM pentest_campaigns LIMIT 1),
  gen_random_uuid(), agent_name, agent_role, agent_model, session_start, session_end, actions_performed, vulnerabilities_discovered, successful_exploits, tools_created, session_log::jsonb
FROM (VALUES
  ('Recon Agent Alpha', 'reconnaissance', 'GPT-4', now() - interval '3 days', now() - interval '2 days 20 hours', 247, 15, 0, 3, '{"scans": ["nmap"]}'),
  ('Exploit Agent Beta', 'exploitation', 'GPT-4-Turbo', now() - interval '2 days 18 hours', now() - interval '2 days 12 hours', 89, 12, 18, 5, '{"exploits": 34}'),
  ('PrivEsc Agent', 'post_exploitation', 'GPT-4', now() - interval '2 days 10 hours', now() - interval '2 days 6 hours', 45, 8, 11, 2, '{"lateral": true}'),
  ('Web App Agent', 'web_testing', 'Claude-3', now() - interval '2 days', now() - interval '1 day 18 hours', 134, 23, 8, 4, '{"sqli": 3}'),
  ('Pivot Agent', 'network_analysis', 'GPT-4', now() - interval '1 day 16 hours', now() - interval '1 day 12 hours', 78, 11, 7, 1, '{"vlans": 8}')
) AS s(agent_name, agent_role, agent_model, session_start, session_end, actions_performed, vulnerabilities_discovered, successful_exploits, tools_created, session_log)
ON CONFLICT DO NOTHING;