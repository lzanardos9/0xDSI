/*
  # Epic Red Team Mock Data with Wow Factor

  1. Data Overview
    - Advanced fuzzing campaigns with impressive stats
    - AI-powered penetration testing with cutting-edge techniques
    - Elite AI-generated exploitation tools
    - Complex multi-stage attack chains with MITRE ATT&CK mapping

  2. Features
    - Zero-day discoveries
    - Advanced persistent threats (APT) simulations
    - Quantum-resistant cryptography attacks
    - Supply chain compromise scenarios
    - AI vs AI red/blue team exercises
*/

-- Clear and insert epic fuzzing campaigns
TRUNCATE TABLE fuzzing_campaigns CASCADE;

INSERT INTO fuzzing_campaigns (campaign_name, fuzzer_type, target_type, target_name, status, total_executions, executions_per_second, total_crashes, unique_crashes, code_coverage_percent, start_time) VALUES
('Zero-Day Hunter - Kernel', 'AFL++ QEMU', 'kernel', 'Linux Kernel 6.5', 'running', 847532100, 8947.3, 347, 89, 94.8, NOW() - INTERVAL '18 hours'),
('Crypto Library Breaker', 'LibFuzzer+ASAN', 'library', 'OpenSSL 3.0', 'completed', 623891200, 6789.4, 156, 43, 97.2, NOW() - INTERVAL '2 days'),
('Browser Engine Destroyer', 'Honggfuzz', 'browser', 'Chromium V8', 'running', 1245678900, 12456.8, 523, 167, 91.5, NOW() - INTERVAL '36 hours'),
('AI Model Poisoning', 'Custom Fuzzer', 'ml_model', 'LLaMA-3-70B', 'completed', 234567800, 2345.7, 78, 23, 88.9, NOW() - INTERVAL '4 days'),
('Quantum Crypto Attack', 'QFuzz', 'crypto', 'Post-Quantum TLS', 'running', 456789100, 4567.9, 234, 67, 85.7, NOW() - INTERVAL '12 hours'),
('Supply Chain Fuzzer', 'OSS-Fuzz', 'package', 'NPM Ecosystem', 'completed', 789123400, 7891.2, 445, 134, 92.3, NOW() - INTERVAL '6 days'),
('Container Escape Hunt', 'Syzkaller', 'container', 'Docker/K8s', 'running', 567234900, 5672.3, 189, 56, 89.4, NOW() - INTERVAL '24 hours'),
('IoT Firmware Breaker', 'IOTFUZZER', 'firmware', 'IoT Devices', 'completed', 345678200, 3456.8, 267, 89, 86.2, NOW() - INTERVAL '8 days'),
('Blockchain Smart Contract', 'Echidna', 'smart_contract', 'Ethereum DeFi', 'running', 234567100, 2345.7, 134, 45, 93.6, NOW() - INTERVAL '6 hours'),
('5G Protocol Fuzzer', 'Custom', 'protocol', '5G NR Stack', 'completed', 456123700, 4561.2, 201, 67, 87.9, NOW() - INTERVAL '10 days');

-- Clear and insert epic pentest campaigns
TRUNCATE TABLE pentest_campaigns CASCADE;

INSERT INTO pentest_campaigns (campaign_name, campaign_type, methodology, agent_model, status, targets_count, vulnerabilities_found, critical_findings, high_findings, medium_findings, low_findings, exploited_count, risk_score, start_time) VALUES
('APT-42 Simulation', 'red_team', 'MITRE ATT&CK', 'GPT-4-Turbo', 'completed', 342, 156, 34, 56, 48, 18, 90, 9.8, NOW() - INTERVAL '15 days'),
('Zero-Trust Breach Test', 'red_team', 'Purple Team', 'Claude-3.5-Sonnet', 'running', 189, 89, 23, 34, 24, 8, 57, 9.2, NOW() - INTERVAL '5 days'),
('AI Infrastructure Attack', 'ai_security', 'Model Hijacking', 'GPT-4-Turbo', 'completed', 67, 45, 12, 18, 12, 3, 30, 8.9, NOW() - INTERVAL '20 days'),
('Supply Chain Compromise', 'supply_chain', 'SolarWinds Style', 'Custom-Agent', 'completed', 234, 123, 28, 45, 38, 12, 73, 9.5, NOW() - INTERVAL '30 days'),
('Quantum-Resistant Test', 'crypto', 'Post-Quantum', 'GPT-4-Turbo', 'running', 45, 34, 8, 14, 10, 2, 22, 8.4, NOW() - INTERVAL '3 days'),
('Cloud Native Breach', 'cloud', 'K8s + Serverless', 'Claude-3.5-Sonnet', 'completed', 456, 234, 45, 89, 78, 22, 134, 9.3, NOW() - INTERVAL '25 days'),
('Active Directory Takeover', 'active_directory', 'BloodHound AI', 'GPT-4-Turbo', 'completed', 1234, 456, 89, 167, 145, 55, 256, 9.7, NOW() - INTERVAL '18 days'),
('OT/ICS Security Test', 'ot_ics', 'SCADA Attack', 'Custom-Agent', 'running', 78, 67, 15, 28, 20, 4, 43, 9.1, NOW() - INTERVAL '7 days'),
('Blockchain/Web3 Audit', 'blockchain', 'Smart Contract', 'GPT-4-Turbo', 'completed', 123, 89, 23, 34, 26, 6, 57, 8.8, NOW() - INTERVAL '12 days'),
('AI Red Team vs Blue Team', 'ai_vs_ai', 'Adversarial ML', 'Dual-Agent', 'running', 89, 56, 12, 22, 18, 4, 34, 8.6, NOW() - INTERVAL '2 days'),
('6G Protocol Research', 'research', '6G Security', 'Custom-Agent', 'running', 34, 28, 7, 12, 8, 1, 19, 8.2, NOW() - INTERVAL '4 days'),
('Satellite Communication', 'space_security', 'Starlink Attack', 'GPT-4-Turbo', 'completed', 23, 19, 5, 8, 5, 1, 13, 8.5, NOW() - INTERVAL '40 days');

-- Clear and insert elite AI tools
TRUNCATE TABLE ai_generated_tools CASCADE;

INSERT INTO ai_generated_tools (tool_name, tool_type, tool_purpose, target_vulnerability, programming_language, creation_method, ai_model, effectiveness_score, success_rate, times_used, successful_uses, detection_rate) VALUES
('ZeroDayGen-AI', 'exploit_generator', 'Generate 0-days', 'Memory Corruption', 'Rust+LLVM', 'adversarial_rl', 'GPT-4-Turbo', 98.7, 96.3, 2347, 2260, 2.1),
('QuantumCracker', 'crypto_breaker', 'Quantum attacks', 'Post-Quantum Crypto', 'Python+Qiskit', 'quantum_ml', 'Custom-Quantum', 94.2, 89.8, 456, 410, 8.7),
('ShapeShifter', 'polymorphic_malware', 'Evade detection', 'EDR/XDR Bypass', 'C++/Assembly', 'adversarial_gan', 'GPT-4-Turbo', 97.8, 95.4, 1234, 1177, 3.4),
('BloodHound-AI', 'ad_exploiter', 'AD takeover', 'Active Directory', 'C#/.NET', 'graph_neural_net', 'Custom-GNN', 96.9, 94.2, 3456, 3256, 4.8),
('DeepExploit', 'autonomous_exploit', 'Auto-exploitation', 'Multi-Vector', 'Python+Rust', 'deep_rl', 'Claude-3.5-Sonnet', 95.3, 92.7, 2890, 2678, 6.2),
('ChainBreaker', 'blockchain_exploit', 'Smart contract', 'DeFi Protocols', 'Solidity+Python', 'symbolic_execution', 'GPT-4-Turbo', 93.4, 88.9, 789, 702, 9.8),
('CloudPwner', 'cloud_exploit', 'Multi-cloud attack', 'AWS/Azure/GCP', 'Go+Terraform', 'multi_agent_rl', 'Custom-Multi', 96.2, 93.5, 1567, 1465, 5.3),
('NeuralShell', 'ai_backdoor', 'Model poisoning', 'ML Models', 'Python+PyTorch', 'adversarial_ml', 'GPT-4-Turbo', 94.8, 91.2, 567, 517, 7.6),
('GhostPersist', 'persistence_tool', 'Undetectable persist', 'Rootkit/Bootkit', 'C/Assembly', 'adversarial_rl', 'Custom-Stealth', 97.1, 94.8, 890, 843, 3.9),
('APIBreaker-9000', 'api_fuzzer', 'GraphQL/REST break', 'API Security', 'TypeScript+Rust', 'evolutionary_ml', 'Claude-3.5-Sonnet', 95.7, 92.4, 2345, 2167, 6.1),
('PrivescBot', 'privilege_escalation', 'Auto privesc', 'Linux/Windows', 'Python+C', 'reinforcement_learning', 'GPT-4-Turbo', 93.8, 89.6, 1456, 1305, 8.9),
('DataExfilAgent', 'exfiltration_tool', 'Stealth data theft', 'DLP Bypass', 'Python+Go', 'adversarial_autoencoder', 'Custom-Stealth', 96.5, 93.9, 1234, 1159, 4.7),
('MalDocGen-AI', 'weaponizer', 'Weaponize docs', 'Phishing', 'Python+VBA', 'generative_adversarial', 'GPT-4-Turbo', 94.3, 90.7, 3456, 3135, 7.8),
('LateralMoveAI', 'lateral_movement', 'Network traversal', 'Network Segmentation', 'C#/PowerShell', 'graph_rl', 'Custom-Graph', 95.9, 93.1, 2123, 1976, 5.4),
('CobaltStrike-AI', 'c2_framework', 'AI-powered C2', 'Command & Control', 'C++/Go', 'multi_agent_system', 'GPT-4-Turbo', 97.4, 95.8, 1890, 1810, 3.2),
('ContainerEscape-X', 'container_exploit', 'Break containers', 'Docker/K8s', 'Go+Rust', 'fuzzing_rl', 'Custom-Container', 94.6, 90.3, 789, 712, 8.4),
('CredHarvesterAI', 'credential_theft', 'Steal creds', 'Authentication', 'Python+C', 'behavioral_ml', 'Claude-3.5-Sonnet', 96.8, 94.4, 4567, 4311, 4.1),
('RansomwareGen', 'ransomware_builder', 'Generate ransomware', 'Encryption', 'Rust+C', 'adversarial_gan', 'GPT-4-Turbo', 93.2, 88.6, 234, 207, 10.3),
('ZeroClickExploit', 'zero_click', 'No interaction', 'Browser/Mobile', 'C++/ObjC', 'fuzzing_symbolic', 'Custom-ZeroClick', 92.7, 87.9, 456, 401, 11.2),
('SupplyChainInjector', 'supply_chain', 'Inject backdoors', 'CI/CD Pipeline', 'Python+JavaScript', 'code_generation', 'GPT-4-Turbo', 95.1, 91.8, 890, 817, 7.3),
('EDRKiller', 'edr_evasion', 'Kill EDR/XDR', 'Endpoint Protection', 'C/C++/Rust', 'adversarial_rl', 'Custom-Evasion', 98.1, 96.7, 1567, 1515, 2.8),
('ImplantFactory', 'implant_generator', 'Custom implants', 'RAT/Backdoor', 'C++/Assembly', 'generative_model', 'GPT-4-Turbo', 96.3, 93.8, 2234, 2095, 4.9),
('NetworkPwner', 'network_exploit', 'Network takeover', 'Network Protocols', 'C/Scapy', 'packet_craft_ml', 'Custom-Network', 94.9, 91.5, 1345, 1231, 7.1),
('VulnScanner-Ultra', 'vulnerability_scanner', 'AI vuln detection', 'Multi-Platform', 'Python+Rust', 'deep_learning', 'GPT-4-Turbo', 97.6, 95.2, 5678, 5406, 3.7),
('SocialEngineerAI', 'social_engineering', 'AI phishing', 'Human Factor', 'Python+NLP', 'llm_fine_tuned', 'GPT-4-Turbo', 93.5, 89.2, 2890, 2578, 9.1);

-- Clear and insert epic attack chains
TRUNCATE TABLE attack_chains CASCADE;

INSERT INTO attack_chains (campaign_id, chain_name, attack_scenario, initial_access_technique, stages, current_stage, total_stages, success, objectives_completed, mitre_attack_tactics, start_time, duration_seconds, detection_events, blue_team_response)
SELECT
  (SELECT id FROM pentest_campaigns WHERE campaign_name = 'APT-42 Simulation' LIMIT 1),
  'APT-42 Full Kill Chain',
  'Nation-state APT simulation targeting critical infrastructure with multi-vector approach',
  'spearphishing_with_zero_day',
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'Initial Compromise', 'technique', 'Spearphishing with 0-day', 'status', 'completed', 'ttps', 'T1566.001'),
    jsonb_build_object('stage', 2, 'name', 'Execution', 'technique', 'PowerShell Empire', 'status', 'completed', 'ttps', 'T1059.001'),
    jsonb_build_object('stage', 3, 'name', 'Persistence', 'technique', 'UEFI Bootkit', 'status', 'completed', 'ttps', 'T1542.003'),
    jsonb_build_object('stage', 4, 'name', 'Privilege Escalation', 'technique', 'Kernel Exploit', 'status', 'completed', 'ttps', 'T1068'),
    jsonb_build_object('stage', 5, 'name', 'Defense Evasion', 'technique', 'EDR Killer', 'status', 'completed', 'ttps', 'T1562.001'),
    jsonb_build_object('stage', 6, 'name', 'Credential Access', 'technique', 'LSASS Dumping', 'status', 'completed', 'ttps', 'T1003.001'),
    jsonb_build_object('stage', 7, 'name', 'Discovery', 'technique', 'BloodHound AI', 'status', 'completed', 'ttps', 'T1087.002'),
    jsonb_build_object('stage', 8, 'name', 'Lateral Movement', 'technique', 'Pass-the-Hash', 'status', 'completed', 'ttps', 'T1550.002'),
    jsonb_build_object('stage', 9, 'name', 'Collection', 'technique', 'Archive via Tool', 'status', 'completed', 'ttps', 'T1560.001'),
    jsonb_build_object('stage', 10, 'name', 'Command & Control', 'technique', 'DNS Tunneling', 'status', 'completed', 'ttps', 'T1071.004'),
    jsonb_build_object('stage', 11, 'name', 'Exfiltration', 'technique', 'Encrypted Channel', 'status', 'completed', 'ttps', 'T1041'),
    jsonb_build_object('stage', 12, 'name', 'Impact', 'technique', 'Data Destruction', 'status', 'completed', 'ttps', 'T1485')
  ),
  12,
  12,
  true,
  jsonb_build_array('domain_admin_achieved', 'data_exfiltrated_2.3TB', 'ransomware_deployed'),
  jsonb_build_array('Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access', 'Discovery', 'Lateral Movement', 'Collection', 'Command and Control', 'Exfiltration', 'Impact'),
  NOW() - INTERVAL '15 days',
  86400,
  47,
  true
UNION ALL
SELECT
  (SELECT id FROM pentest_campaigns WHERE campaign_name = 'Supply Chain Compromise' LIMIT 1),
  'SolarWinds-Style Attack',
  'Supply chain attack via compromised software update mechanism',
  'supply_chain_compromise',
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'Supply Chain Infiltration', 'technique', 'CI/CD Compromise', 'status', 'completed', 'ttps', 'T1195.002'),
    jsonb_build_object('stage', 2, 'name', 'Trojanized Update', 'technique', 'Code Signing Cert Theft', 'status', 'completed', 'ttps', 'T1553.002'),
    jsonb_build_object('stage', 3, 'name', 'Mass Deployment', 'technique', 'Software Update', 'status', 'completed', 'ttps', 'T1195.002'),
    jsonb_build_object('stage', 4, 'name', 'Dormant Phase', 'technique', 'Time-based Activation', 'status', 'completed', 'ttps', 'T1497.003'),
    jsonb_build_object('stage', 5, 'name', 'Selective Targeting', 'technique', 'Target Profiling', 'status', 'completed', 'ttps', 'T1592'),
    jsonb_build_object('stage', 6, 'name', 'Second Stage Payload', 'technique', 'In-Memory Execution', 'status', 'completed', 'ttps', 'T1620'),
    jsonb_build_object('stage', 7, 'name', 'Stealth Persistence', 'technique', 'Registry Run Keys', 'status', 'completed', 'ttps', 'T1547.001'),
    jsonb_build_object('stage', 8, 'name', 'Credential Harvesting', 'technique', 'Keylogging', 'status', 'completed', 'ttps', 'T1056.001'),
    jsonb_build_object('stage', 9, 'name', 'Data Exfiltration', 'technique', 'Cloud Storage', 'status', 'completed', 'ttps', 'T1567.002')
  ),
  9,
  9,
  true,
  jsonb_build_array('infected_4567_endpoints', 'compromised_234_orgs', 'exfiltrated_credentials_89K'),
  jsonb_build_array('Initial Access', 'Execution', 'Persistence', 'Credential Access', 'Exfiltration'),
  NOW() - INTERVAL '30 days',
  2592000,
  23,
  true
UNION ALL
SELECT
  (SELECT id FROM pentest_campaigns WHERE campaign_name = 'Cloud Native Breach' LIMIT 1),
  'Cloud Infrastructure Takeover',
  'Multi-cloud breach targeting AWS, Azure, and GCP with container escape',
  'exposed_kubernetes_api',
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'K8s API Discovery', 'technique', 'Unauthenticated API', 'status', 'completed', 'ttps', 'T1552.007'),
    jsonb_build_object('stage', 2, 'name', 'Container Deployment', 'technique', 'Malicious Pod', 'status', 'completed', 'ttps', 'T1610'),
    jsonb_build_object('stage', 3, 'name', 'Container Escape', 'technique', 'Kernel Exploit', 'status', 'completed', 'ttps', 'T1611'),
    jsonb_build_object('stage', 4, 'name', 'Node Compromise', 'technique', 'Host Filesystem Access', 'status', 'completed', 'ttps', 'T1611'),
    jsonb_build_object('stage', 5, 'name', 'Cloud Credentials', 'technique', 'Instance Metadata', 'status', 'completed', 'ttps', 'T1552.005'),
    jsonb_build_object('stage', 6, 'name', 'Privilege Escalation', 'technique', 'IAM Policy Exploit', 'status', 'completed', 'ttps', 'T1098.001'),
    jsonb_build_object('stage', 7, 'name', 'Cross-Account Access', 'technique', 'AssumeRole', 'status', 'completed', 'ttps', 'T1550.001'),
    jsonb_build_object('stage', 8, 'name', 'Data Discovery', 'technique', 'S3 Enumeration', 'status', 'completed', 'ttps', 'T1619'),
    jsonb_build_object('stage', 9, 'name', 'Crypto Mining', 'technique', 'Lambda Abuse', 'status', 'completed', 'ttps', 'T1496'),
    jsonb_build_object('stage', 10, 'name', 'Persistence', 'technique', 'Lambda Backdoor', 'status', 'completed', 'ttps', 'T1546')
  ),
  10,
  10,
  true,
  jsonb_build_array('admin_access_aws', 'admin_access_azure', 'admin_access_gcp', 'mined_crypto_45_days'),
  jsonb_build_array('Initial Access', 'Execution', 'Persistence', 'Privilege Escalation', 'Discovery', 'Resource Hijacking'),
  NOW() - INTERVAL '25 days',
  432000,
  78,
  true
UNION ALL
SELECT
  (SELECT id FROM pentest_campaigns WHERE campaign_name = 'Active Directory Takeover' LIMIT 1),
  'Total AD Domination',
  'Complete Active Directory compromise using BloodHound AI and novel techniques',
  'kerberoasting',
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'Initial Foothold', 'technique', 'Phishing', 'status', 'completed', 'ttps', 'T1566.002'),
    jsonb_build_object('stage', 2, 'name', 'Kerberoasting', 'technique', 'Service Ticket Extraction', 'status', 'completed', 'ttps', 'T1558.003'),
    jsonb_build_object('stage', 3, 'name', 'Credential Cracking', 'technique', 'Hashcat GPU', 'status', 'completed', 'ttps', 'T1110.002'),
    jsonb_build_object('stage', 4, 'name', 'BloodHound Mapping', 'technique', 'AI Graph Analysis', 'status', 'completed', 'ttps', 'T1087.002'),
    jsonb_build_object('stage', 5, 'name', 'Lateral Movement', 'technique', 'WMI + DCOM', 'status', 'completed', 'ttps', 'T1021.003'),
    jsonb_build_object('stage', 6, 'name', 'DCSync Attack', 'technique', 'Directory Replication', 'status', 'completed', 'ttps', 'T1003.006'),
    jsonb_build_object('stage', 7, 'name', 'Golden Ticket', 'technique', 'KRBTGT Hash', 'status', 'completed', 'ttps', 'T1558.001'),
    jsonb_build_object('stage', 8, 'name', 'Domain Admin', 'technique', 'Pass-the-Ticket', 'status', 'completed', 'ttps', 'T1550.003'),
    jsonb_build_object('stage', 9, 'name', 'Persistence', 'technique', 'Skeleton Key', 'status', 'completed', 'ttps', 'T1556.001'),
    jsonb_build_object('stage', 10, 'name', 'Exfiltration', 'technique', 'NTDS.dit Theft', 'status', 'completed', 'ttps', 'T1003.003')
  ),
  10,
  10,
  true,
  jsonb_build_array('domain_admin', 'enterprise_admin', 'all_passwords_dumped_1234_accounts'),
  jsonb_build_array('Initial Access', 'Credential Access', 'Discovery', 'Lateral Movement', 'Persistence', 'Exfiltration'),
  NOW() - INTERVAL '18 days',
  28800,
  134,
  true
UNION ALL
SELECT
  (SELECT id FROM pentest_campaigns WHERE campaign_name = 'AI Infrastructure Attack' LIMIT 1),
  'ML Model Hijacking',
  'Advanced attack on AI/ML infrastructure with model poisoning and data exfiltration',
  'model_inference_api',
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'API Enumeration', 'technique', 'Model Discovery', 'status', 'completed', 'ttps', 'T1592.004'),
    jsonb_build_object('stage', 2, 'name', 'Model Inversion', 'technique', 'Training Data Extraction', 'status', 'completed', 'ttps', 'T1530'),
    jsonb_build_object('stage', 3, 'name', 'Adversarial Examples', 'technique', 'FGSM Attack', 'status', 'completed', 'ttps', 'T1499'),
    jsonb_build_object('stage', 4, 'name', 'Model Poisoning', 'technique', 'Backdoor Injection', 'status', 'completed', 'ttps', 'T1565.001'),
    jsonb_build_object('stage', 5, 'name', 'Model Theft', 'technique', 'Knowledge Distillation', 'status', 'completed', 'ttps', 'T1212'),
    jsonb_build_object('stage', 6, 'name', 'GPU Hijacking', 'technique', 'Compute Theft', 'status', 'completed', 'ttps', 'T1496')
  ),
  6,
  6,
  true,
  jsonb_build_array('model_stolen_llama_70b', 'backdoor_injected', 'gpu_hijacked_30_days'),
  jsonb_build_array('Resource Development', 'Initial Access', 'Impact'),
  NOW() - INTERVAL '20 days',
  18000,
  34,
  false
UNION ALL
SELECT
  (SELECT id FROM pentest_campaigns WHERE campaign_name = 'Quantum-Resistant Test' LIMIT 1),
  'Post-Quantum Cryptanalysis',
  'Testing quantum-resistant cryptography with hybrid quantum-classical attacks',
  'quantum_key_exchange_exploit',
  jsonb_build_array(
    jsonb_build_object('stage', 1, 'name', 'Quantum Circuit Analysis', 'technique', 'Shor Algorithm Sim', 'status', 'completed', 'ttps', 'Custom'),
    jsonb_build_object('stage', 2, 'name', 'Classical Precompute', 'technique', 'Rainbow Tables', 'status', 'completed', 'ttps', 'T1110'),
    jsonb_build_object('stage', 3, 'name', 'Hybrid Attack', 'technique', 'Quantum+Classical', 'status', 'completed', 'ttps', 'Custom'),
    jsonb_build_object('stage', 4, 'name', 'Key Recovery', 'technique', 'Lattice Reduction', 'status', 'completed', 'ttps', 'Custom'),
    jsonb_build_object('stage', 5, 'name', 'Decryption', 'technique', 'TLS Downgrade', 'status', 'in_progress', 'ttps', 'T1557.001')
  ),
  4,
  5,
  false,
  jsonb_build_array('kyber_weakened', 'dilithium_analyzed'),
  jsonb_build_array('Credential Access', 'Collection'),
  NOW() - INTERVAL '3 days',
  12000,
  12,
  true;
