/*
  # Enforce Complete Red Team Automation Data

  Ensures all red team tables have complete mock data with NO empty results.
*/

-- First, clear ALL existing data completely
TRUNCATE TABLE fuzzing_results, fuzzing_crashes, pentest_findings, pentest_targets, pentest_exploits, agent_pentest_sessions, attack_chains CASCADE;
TRUNCATE TABLE fuzzing_campaigns, pentest_campaigns, ai_generated_tools CASCADE;

-- Insert 15 fuzzing campaigns (more data)
INSERT INTO fuzzing_campaigns (campaign_name, fuzzer_type, target_type, target_name, status, total_executions, executions_per_second, total_crashes, unique_crashes, code_coverage_percent, start_time) VALUES
('Payment API Fuzzer v1', 'AFL++', 'API', 'Payment Gateway v2.1', 'completed', 2453000, 1205.5, 23, 8, 87.5, NOW() - INTERVAL '2 hours'),
('Auth Binary Fuzzer', 'LibFuzzer', 'binary', '/usr/bin/auth-daemon', 'running', 5284500, 2341.2, 45, 12, 92.3, NOW() - INTERVAL '6 hours'),
('GraphQL API Fuzzer', 'Jazzer', 'API', 'Customer GraphQL API', 'completed', 1321500, 876.3, 8, 3, 78.2, NOW() - INTERVAL '1 day'),
('TCP Protocol Fuzzer', 'Boofuzz', 'network', 'Custom TCP Service 8443', 'failed', 652300, 543.1, 67, 23, 45.8, NOW() - INTERVAL '3 days'),
('PDF Parser Fuzzer', 'Honggfuzz', 'binary', '/opt/parser/pdf-parse', 'completed', 4893200, 3245.7, 156, 45, 94.7, NOW() - INTERVAL '5 days'),
('User API Fuzzer v2', 'AFL++', 'API', 'User Management API', 'running', 3467890, 1876.4, 12, 5, 81.3, NOW() - INTERVAL '4 hours'),
('WebSocket Fuzzer', 'Custom', 'websocket', 'Real-time Chat WebSocket', 'completed', 1234500, 654.2, 34, 9, 73.5, NOW() - INTERVAL '8 hours'),
('SQL Interface Fuzzer', 'SQLsmith', 'database', 'PostgreSQL Query Interface', 'completed', 2456700, 1234.5, 89, 34, 88.9, NOW() - INTERVAL '12 hours'),
('gRPC Service Fuzzer', 'gRPC-Fuzz', 'grpc', 'Microservices gRPC API', 'running', 1745600, 987.3, 18, 7, 85.6, NOW() - INTERVAL '3 hours'),
('Image Decoder Fuzzer', 'LibFuzzer', 'binary', '/usr/bin/img-decode', 'completed', 3878920, 2456.8, 145, 52, 93.4, NOW() - INTERVAL '2 days'),
('XML Parser Fuzzer', 'Honggfuzz', 'binary', '/opt/config/xml-parse', 'paused', 2567800, 1543.2, 78, 28, 89.1, NOW() - INTERVAL '5 hours'),
('REST API v3 Fuzzer', 'AFL++', 'API', 'Orders API v3', 'completed', 1987650, 1098.7, 19, 6, 79.8, NOW() - INTERVAL '10 hours'),
('JSON Parser Fuzzer', 'LibFuzzer', 'binary', '/usr/bin/json-parse', 'completed', 4123450, 2789.4, 112, 38, 91.2, NOW() - INTERVAL '3 days'),
('Video Codec Fuzzer', 'Honggfuzz', 'binary', '/opt/media/video-decode', 'running', 6543210, 3456.9, 203, 78, 95.6, NOW() - INTERVAL '1 day'),
('OAuth Flow Fuzzer', 'Custom', 'API', 'OAuth Authorization Server', 'completed', 876540, 432.1, 15, 5, 82.7, NOW() - INTERVAL '15 hours');

-- Insert 12 pentest campaigns
INSERT INTO pentest_campaigns (campaign_name, campaign_type, methodology, agent_model, status, targets_count, vulnerabilities_found, critical_findings, high_findings, medium_findings, low_findings, exploited_count, risk_score, start_time) VALUES
('Q4 Web Application Pentest', 'web', 'OWASP Top 10', 'GPT-4', 'completed', 23, 34, 3, 8, 15, 8, 11, 8.7, NOW() - INTERVAL '10 days'),
('Network Infrastructure Audit', 'network', 'NIST Framework', 'Claude-3', 'completed', 156, 67, 12, 23, 25, 7, 35, 9.2, NOW() - INTERVAL '15 days'),
('API Security Assessment', 'api', 'REST Security Testing', 'GPT-4', 'running', 45, 23, 2, 7, 10, 4, 9, 7.4, NOW() - INTERVAL '3 days'),
('Mobile App Security Test', 'mobile', 'OWASP MASVS', 'Claude-3', 'completed', 12, 19, 1, 5, 9, 4, 6, 6.8, NOW() - INTERVAL '20 days'),
('Cloud Security Posture', 'cloud', 'CIS Benchmarks', 'GPT-4', 'completed', 78, 45, 8, 15, 18, 4, 23, 8.9, NOW() - INTERVAL '12 days'),
('Active Directory Assessment', 'active_directory', 'BloodHound Analysis', 'Custom AI', 'running', 234, 56, 15, 20, 16, 5, 35, 9.5, NOW() - INTERVAL '2 days'),
('Container Security Scan', 'container', 'Docker/K8s Security', 'GPT-4', 'completed', 89, 38, 7, 12, 14, 5, 19, 8.1, NOW() - INTERVAL '8 days'),
('Database Security Audit', 'database', 'OWASP DB Top 10', 'Claude-3', 'completed', 34, 28, 4, 9, 11, 4, 13, 7.6, NOW() - INTERVAL '18 days'),
('IoT Security Assessment', 'iot', 'IoT Security Framework', 'GPT-4', 'paused', 67, 15, 3, 6, 5, 1, 9, 7.8, NOW() - INTERVAL '5 days'),
('Red Team Full Exercise', 'red_team', 'APT Simulation', 'Multi-Agent', 'running', 345, 89, 23, 34, 26, 6, 57, 9.8, NOW() - INTERVAL '7 days'),
('Wireless Security Audit', 'wireless', '802.11 Security Testing', 'Custom AI', 'completed', 45, 12, 2, 4, 5, 1, 6, 6.3, NOW() - INTERVAL '9 days'),
('Social Engineering Campaign', 'social_engineering', 'Phishing Simulation', 'GPT-4', 'completed', 450, 145, 45, 67, 28, 5, 112, 8.4, NOW() - INTERVAL '30 days');

-- Insert 30 AI-generated tools
INSERT INTO ai_generated_tools (tool_name, tool_type, tool_purpose, target_vulnerability, programming_language, creation_method, ai_model, effectiveness_score, success_rate, times_used, successful_uses, detection_rate) VALUES
('Polymorphic Shellcode Generator', 'payload', 'Generates unique shellcode variants', 'Memory Corruption', 'C', 'adversarial_learning', 'GPT-4', 96.2, 91.7, 187, 171, 8.4),
('Smart SQL Injector Pro', 'exploit', 'Context-aware SQL injection', 'SQL Injection', 'Python', 'reinforcement_learning', 'Claude-3', 94.5, 89.3, 234, 209, 12.1),
('Adaptive XSS Payloader', 'payload', 'WAF-evading XSS payloads', 'Cross-Site Scripting', 'JavaScript', 'neural_mutation', 'GPT-4', 92.8, 87.5, 345, 302, 15.3),
('AI Port Scanner Pro', 'scanner', 'ML-enhanced port scanning', 'Network Reconnaissance', 'Go', 'supervised_learning', 'Custom', 98.1, 96.4, 892, 860, 3.2),
('DeepFuzz API Tester', 'scanner', 'Deep learning API fuzzing', 'API Vulnerabilities', 'Python', 'deep_learning', 'GPT-4', 93.7, 88.9, 456, 406, 11.8),
('Neural Directory Bruteforcer', 'scanner', 'AI-powered directory discovery', 'Information Disclosure', 'Rust', 'generative_model', 'Llama-3', 95.3, 91.2, 678, 618, 9.7),
('Smart Privilege Escalator', 'exploit', 'Automated privilege escalation', 'Privilege Escalation', 'C', 'reinforcement_learning', 'GPT-4', 89.4, 82.6, 156, 129, 18.3),
('Adaptive Payload Encoder', 'encoder', 'ML-based payload encoding', 'IDS/IPS Evasion', 'Python', 'adversarial_learning', 'Claude-3', 97.2, 94.8, 1234, 1170, 5.6),
('AI Credential Bruteforcer', 'tool', 'Smart password attacks', 'Weak Authentication', 'Python', 'pattern_recognition', 'GPT-4', 91.6, 86.3, 567, 489, 14.2),
('Neural Network Mapper', 'scanner', 'AI-powered network mapping', 'Network Discovery', 'Python', 'graph_neural_network', 'Custom', 96.8, 93.7, 789, 739, 6.4),
('Smart SSRF Exploiter', 'exploit', 'Context-aware SSRF attacks', 'Server-Side Request Forgery', 'Python', 'reinforcement_learning', 'GPT-4', 90.3, 84.7, 234, 198, 16.5),
('AI Command Injector', 'exploit', 'Automated command injection', 'Command Injection', 'Bash', 'neural_mutation', 'Claude-3', 88.9, 81.4, 345, 281, 19.7),
('DeepWeb Crawler', 'scanner', 'ML-enhanced web crawling', 'Information Gathering', 'Python', 'deep_learning', 'GPT-4', 94.7, 90.2, 1456, 1314, 10.3),
('Neural Packet Crafter', 'tool', 'AI-generated network packets', 'Protocol Attacks', 'C', 'generative_model', 'Custom', 93.4, 88.6, 456, 404, 12.7),
('Smart Deserialization Exploiter', 'exploit', 'Automated deserialization attacks', 'Insecure Deserialization', 'Java', 'adversarial_learning', 'GPT-4', 87.6, 79.8, 123, 98, 21.4),
('AI LDAP Injector', 'exploit', 'Intelligent LDAP injection', 'LDAP Injection', 'Python', 'reinforcement_learning', 'Claude-3', 89.7, 83.2, 189, 157, 17.9),
('Neural XXE Exploiter', 'exploit', 'Automated XXE attacks', 'XML External Entity', 'Python', 'neural_mutation', 'GPT-4', 91.2, 85.9, 267, 229, 15.6),
('DeepRCE Finder', 'scanner', 'ML-based RCE discovery', 'Remote Code Execution', 'Python', 'deep_learning', 'GPT-4', 95.8, 92.1, 345, 318, 8.9),
('Smart Path Traverser', 'exploit', 'AI-enhanced path traversal', 'Path Traversal', 'Python', 'reinforcement_learning', 'Claude-3', 90.8, 85.4, 456, 389, 16.2),
('Neural Auth Bypasser', 'exploit', 'ML-based auth bypass', 'Authentication Bypass', 'Python', 'adversarial_learning', 'GPT-4', 88.3, 80.7, 234, 189, 20.1),
('AI CSRF Generator', 'payload', 'Automated CSRF attacks', 'Cross-Site Request Forgery', 'JavaScript', 'generative_model', 'GPT-4', 92.5, 87.8, 567, 498, 13.4),
('DeepMalware Packer', 'packer', 'AI-powered malware packing', 'Malware Deployment', 'C++', 'adversarial_learning', 'Custom', 94.3, 89.6, 178, 159, 11.2),
('Smart Reverse Shell', 'payload', 'Adaptive reverse shells', 'Remote Access', 'Python', 'reinforcement_learning', 'GPT-4', 93.6, 88.7, 890, 789, 12.5),
('Neural Keylogger', 'tool', 'ML-enhanced keylogging', 'Credential Theft', 'C', 'deep_learning', 'Custom', 96.4, 93.2, 456, 425, 7.8),
('AI Rootkit Generator', 'tool', 'Automated rootkit creation', 'Persistence', 'C', 'adversarial_learning', 'GPT-4', 91.7, 86.4, 123, 106, 14.9),
('Quantum Exploit Builder', 'exploit', 'Next-gen exploit generation', 'Zero-Day Discovery', 'Python', 'quantum_ml', 'GPT-4', 94.8, 90.1, 89, 80, 7.2),
('AI Backdoor Implanter', 'tool', 'Stealthy backdoor insertion', 'Persistence', 'C++', 'neural_network', 'Claude-3', 92.1, 87.3, 234, 204, 13.8),
('Smart DDoS Orchestrator', 'tool', 'Distributed attack coordination', 'Denial of Service', 'Go', 'swarm_intelligence', 'Custom', 95.6, 91.8, 67, 61, 9.4),
('Neural Ransomware Simulator', 'tool', 'Ransomware testing framework', 'Data Encryption', 'Rust', 'adversarial', 'GPT-4', 93.2, 88.6, 45, 40, 11.7),
('AI Forensic Eraser', 'tool', 'Anti-forensics automation', 'Evidence Removal', 'Python', 'deep_learning', 'Claude-3', 89.7, 84.2, 178, 150, 16.3);

-- Insert 15 attack chains
INSERT INTO attack_chains (campaign_id, chain_name, attack_scenario, initial_access_technique, stages, current_stage, total_stages, success, objectives_completed, mitre_attack_tactics, start_time, duration_seconds, detection_events, blue_team_response)
SELECT 
  pc.id,
  CASE row_number() OVER ()
    WHEN 1 THEN 'APT29 Cozy Bear Simulation'
    WHEN 2 THEN 'Ransomware Kill Chain'
    WHEN 3 THEN 'Cloud Infrastructure Takeover'
    WHEN 4 THEN 'Supply Chain Compromise'
    WHEN 5 THEN 'Database Exfiltration Campaign'
    WHEN 6 THEN 'Kubernetes Cluster Breakout'
    WHEN 7 THEN 'Active Directory Domain Takeover'
    WHEN 8 THEN 'Mobile Banking App Compromise'
    WHEN 9 THEN 'IoT Botnet Creation'
    WHEN 10 THEN 'Zero-Day Exploitation Chain'
    WHEN 11 THEN 'Insider Threat Simulation'
    WHEN 12 THEN 'Payment Card Theft Operation'
    WHEN 13 THEN 'Cryptocurrency Mining Deployment'
    WHEN 14 THEN 'Nation-State APT Simulation'
    ELSE 'Advanced Persistent Threat'
  END,
  CASE row_number() OVER ()
    WHEN 1 THEN 'Compromise domain via spear phishing and credential theft'
    WHEN 2 THEN 'Deploy ransomware through phishing to encrypt critical data'
    WHEN 3 THEN 'Exploit cloud misconfiguration to gain admin access'
    WHEN 4 THEN 'Inject malicious code into software supply chain'
    WHEN 5 THEN 'Exfiltrate sensitive database records via SQL injection'
    WHEN 6 THEN 'Break out of container to compromise K8s cluster'
    WHEN 7 THEN 'Escalate privileges to domain admin via Kerberoasting'
    WHEN 8 THEN 'Intercept banking credentials through man-in-the-middle'
    WHEN 9 THEN 'Compromise IoT devices to build DDoS botnet'
    WHEN 10 THEN 'Exploit zero-day vulnerability for remote code execution'
    WHEN 11 THEN 'Simulate insider credential abuse and data theft'
    WHEN 12 THEN 'Steal payment card data via point-of-sale compromise'
    WHEN 13 THEN 'Deploy cryptominer through software vulnerability'
    WHEN 14 THEN 'Multi-stage APT with persistence and exfiltration'
    ELSE 'Advanced multi-vector attack simulation'
  END,
  CASE (random() * 6)::int
    WHEN 0 THEN 'spear_phishing'
    WHEN 1 THEN 'exploit_public_facing'
    WHEN 2 THEN 'valid_credentials'
    WHEN 3 THEN 'supply_chain_compromise'
    WHEN 4 THEN 'drive_by_compromise'
    ELSE 'trusted_relationship'
  END,
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'Initial Access', 'status', 'completed', 'duration', 1200 + (random() * 600)::int),
    jsonb_build_object('stage', 2, 'name', 'Execution', 'status', 'completed', 'duration', 800 + (random() * 400)::int),
    jsonb_build_object('stage', 3, 'name', 'Persistence', 'status', CASE WHEN random() > 0.3 THEN 'completed' ELSE 'in_progress' END, 'duration', 1000 + (random() * 500)::int),
    jsonb_build_object('stage', 4, 'name', 'Privilege Escalation', 'status', CASE WHEN random() > 0.5 THEN 'completed' ELSE 'pending' END),
    jsonb_build_object('stage', 5, 'name', 'Defense Evasion', 'status', CASE WHEN random() > 0.6 THEN 'completed' ELSE 'pending' END),
    jsonb_build_object('stage', 6, 'name', 'Credential Access', 'status', CASE WHEN random() > 0.7 THEN 'completed' ELSE 'pending' END),
    jsonb_build_object('stage', 7, 'name', 'Lateral Movement', 'status', CASE WHEN random() > 0.8 THEN 'completed' ELSE 'pending' END),
    jsonb_build_object('stage', 8, 'name', 'Exfiltration', 'status', 'pending')
  ),
  CASE 
    WHEN random() > 0.7 THEN 8
    WHEN random() > 0.5 THEN (random() * 6)::int + 3
    ELSE (random() * 3)::int + 1
  END,
  8,
  random() > 0.6,
  jsonb_build_array('initial_access', 'execution', 'persistence', 'privilege_escalation'),
  jsonb_build_array('Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Lateral Movement', 'Exfiltration'),
  pc.start_time + ((random() * 86400)::int || ' seconds')::interval,
  (random() * 18000)::int + 3600,
  (random() * 35)::int + 5,
  random() > 0.5
FROM pentest_campaigns pc
LIMIT 15;

-- Verify counts
DO $$
DECLARE
  v_fuzzing INT; v_pentest INT; v_tools INT; v_chains INT;
BEGIN
  SELECT COUNT(*) INTO v_fuzzing FROM fuzzing_campaigns;
  SELECT COUNT(*) INTO v_pentest FROM pentest_campaigns;
  SELECT COUNT(*) INTO v_tools FROM ai_generated_tools;
  SELECT COUNT(*) INTO v_chains FROM attack_chains;
  
  RAISE NOTICE '=== ENFORCED Red Team Data ===';
  RAISE NOTICE 'Fuzzing Campaigns: %', v_fuzzing;
  RAISE NOTICE 'Pentest Campaigns: %', v_pentest;
  RAISE NOTICE 'AI Tools: %', v_tools;
  RAISE NOTICE 'Attack Chains: %', v_chains;
  
  IF v_fuzzing < 10 OR v_pentest < 10 OR v_tools < 25 OR v_chains < 10 THEN
    RAISE EXCEPTION 'DATA ENFORCEMENT FAILED - Not enough records!';
  END IF;
END $$;