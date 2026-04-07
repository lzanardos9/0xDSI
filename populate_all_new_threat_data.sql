-- Comprehensive Mock Data for All New Threat Intelligence Tables

-- NIST NVD Vulnerabilities (Sample of critical CVEs)
INSERT INTO nist_nvd_vulnerabilities (cve_id, published_date, vulnerability_description, cvss_v3_score, cvss_v3_severity, cwe_ids, affected_products, exploit_available, patch_available, remediation_guidance) VALUES
('CVE-2024-21762', now() - interval '15 days', 'Out-of-bounds write vulnerability in Fortinet FortiOS allowing remote code execution', 9.8, 'CRITICAL', ARRAY['CWE-787'], '{"vendor": "Fortinet", "products": ["FortiOS 7.4.0-7.4.2", "FortiOS 7.2.0-7.2.6"]}'::jsonb, true, true, 'Upgrade to FortiOS 7.4.3 or 7.2.7 immediately'),
('CVE-2024-3094', now() - interval '30 days', 'Backdoor in XZ Utils liblzma library allowing unauthorized remote access', 10.0, 'CRITICAL', ARRAY['CWE-506'], '{"vendor": "XZ", "products": ["xz-utils 5.6.0", "xz-utils 5.6.1"]}'::jsonb, true, true, 'Downgrade to XZ Utils 5.4.x or earlier versions'),
('CVE-2024-4577', now() - interval '10 days', 'Argument injection vulnerability in PHP CGI allowing RCE on Windows', 9.8, 'CRITICAL', ARRAY['CWE-88'], '{"vendor": "PHP", "products": ["PHP 8.3.0-8.3.7", "PHP 8.2.0-8.2.19", "PHP 8.1.0-8.1.28"]}'::jsonb, true, true, 'Update to PHP 8.3.8, 8.2.20, or 8.1.29'),
('CVE-2023-4966', now() - interval '90 days', 'Buffer overflow in Citrix NetScaler (CitrixBleed) allowing session hijacking', 9.4, 'CRITICAL', ARRAY['CWE-119'], '{"vendor": "Citrix", "products": ["NetScaler ADC 13.0", "NetScaler ADC 13.1", "NetScaler Gateway 13.0"]}'::jsonb, true, true, 'Apply patches and reset all session tokens'),
('CVE-2023-46604', now() - interval '120 days', 'Apache ActiveMQ RCE via OpenWire protocol deserialization', 10.0, 'CRITICAL', ARRAY['CWE-502'], '{"vendor": "Apache", "products": ["ActiveMQ 5.18.0-5.18.2", "ActiveMQ 5.17.0-5.17.5"]}'::jsonb, true, true, 'Upgrade to ActiveMQ 5.18.3 or higher'),
('CVE-2024-6387', now() - interval '5 days', 'RegresshIOn signal handler race condition in OpenSSH allowing unauthenticated RCE', 8.1, 'HIGH', ARRAY['CWE-362'], '{"vendor": "OpenSSH", "products": ["OpenSSH 8.5p1-9.7p1 on glibc-based systems"]}'::jsonb, true, true, 'Update to OpenSSH 9.8p1 immediately'),
('CVE-2024-27198', now() - interval '25 days', 'Authentication bypass in TeamCity CI/CD server', 9.8, 'CRITICAL', ARRAY['CWE-287'], '{"vendor": "JetBrains", "products": ["TeamCity < 2023.11.4"]}'::jsonb, true, true, 'Upgrade to TeamCity 2023.11.4 or later');

-- CISA KEV Catalog
INSERT INTO cisa_kev_catalog (cve_id, vulnerability_name, date_added, short_description, required_action, due_date, known_ransomware_use, vendor_project, product) VALUES
('CVE-2024-21762', 'Fortinet FortiOS Out-of-bounds Write', now() - interval '10 days', 'Remote code execution via crafted HTTP requests', 'Apply patches immediately', current_date + interval '7 days', true, 'Fortinet', 'FortiOS'),
('CVE-2024-3094', 'XZ Utils Backdoor', now() - interval '25 days', 'Supply chain backdoor in compression library', 'Downgrade to safe version', current_date + interval '3 days', false, 'XZ', 'xz-utils'),
('CVE-2023-4966', 'Citrix NetScaler Buffer Overflow', now() - interval '85 days', 'Session hijacking via buffer overflow', 'Patch and reset all sessions', current_date - interval '30 days', true, 'Citrix', 'NetScaler ADC'),
('CVE-2023-46604', 'Apache ActiveMQ RCE', now() - interval '115 days', 'Remote code execution via deserialization', 'Update to patched version', current_date - interval '45 days', true, 'Apache', 'ActiveMQ'),
('CVE-2024-6387', 'OpenSSH RegresshIOn RCE', now() - interval '2 days', 'Race condition allowing RCE', 'Apply security update', current_date + interval '14 days', false, 'OpenSSH', 'sshd');

-- STIX Indicators
INSERT INTO stix_indicators (stix_id, indicator_type, pattern, pattern_type, name, description, labels, confidence, valid_from, kill_chain_phases, source_feed) VALUES
('indicator--8e2e2d2b-17d4-4cbf-938f-98ee46b3cd3f', 'malware', '[file:hashes.''SHA-256'' = ''3c1b374c8f3e3a8d2e1c9a7b5d6e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5'']', 'stix', 'TrickBot Variant', 'Advanced banking trojan with worm capabilities', ARRAY['trojan', 'credential-theft', 'lateral-movement'], 95, now() - interval '5 days', '{"kill_chain": [{"phase": "delivery"}, {"phase": "exploitation"}, {"phase": "command-and-control"}]}'::jsonb, 'US-CERT'),
('indicator--1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d', 'attack-pattern', '[network-traffic:dst_port = 445 AND network-traffic:protocols[*] = ''smb'']', 'stix', 'EternalBlue Exploit', 'SMBv1 exploitation technique', ARRAY['exploit', 'lateral-movement', 'worm'], 98, now() - interval '180 days', '{"kill_chain": [{"phase": "exploitation"}, {"phase": "lateral-movement"}]}'::jsonb, 'MITRE ATT&CK'),
('indicator--9f8e7d6c-5b4a-3210-fedc-ba9876543210', 'threat-actor', '[ipv4-addr:value = ''45.141.84.0/24'']', 'stix', 'APT29 (Cozy Bear)', 'Russian state-sponsored threat group', ARRAY['apt', 'espionage', 'nation-state'], 90, now() - interval '1 year', '{"kill_chain": [{"phase": "reconnaissance"}, {"phase": "command-and-control"}]}'::jsonb', 'CISA'),
('indicator--f1e2d3c4-b5a6-9877-8654-321fedcba098', 'malware', '[domain-name:value = ''malicious-c2-server[.]xyz'']', 'stix', 'Cobalt Strike Beacon', 'Post-exploitation framework C2 beacon', ARRAY['post-exploitation', 'c2'], 85, now() - interval '30 days', '{"kill_chain": [{"phase": "command-and-control"}, {"phase": "exfiltration"}]}'::jsonb, 'Commercial TI');

-- Dark Web Intelligence
INSERT INTO dark_web_intelligence (source_platform, content_type, threat_category, content_preview, author_handle, posted_at, relevance_score, indicators_extracted, sentiment_score) VALUES
('BreachForums', 'marketplace_listing', 'data_breach', 'Selling database dump from Healthcare Corp - 2.5M patient records including PII, SSN, medical history. Fresh dump from Q4 2024. Bitcoin accepted.', 'DataBroker_X', now() - interval '2 days', 9.5, '{"entities": ["Healthcare Corp"], "file_sizes": ["350GB"], "record_count": "2.5M", "data_types": ["PII", "SSN", "Medical Records"]}'::jsonb, -0.85),
('RaidForums', 'forum_post', 'exploit_kit', 'New 0day in popular CMS software. DM for details. Affecting versions 8.x-9.2. Price: $25K. Serious buyers only.', 'ExploitDev_42', now() - interval '5 days', 8.7, '{"vulnerability_hints": ["CMS", "versions 8.x-9.2"], "price": "$25000"}'::jsonb, -0.92),
('XSS Forum', 'forum_post', 'vulnerability_discussion', 'Found interesting bug in FortiOS SSL VPN. Looks similar to CVE-2024-21762 but different attack vector. Working on PoC.', 'researcher_007', now() - interval '8 days', 9.2, '{"products": ["FortiOS"], "related_cves": ["CVE-2024-21762"]}'::jsonb, -0.60),
('Russian Marketplace', 'marketplace_listing', 'malware_sale', 'Selling custom ransomware builder. Double extortion features, undetectable by AV. Includes negotiation portal. $50K or revenue share.', 'CriminalDev', now() - interval '12 days', 9.8, '{"malware_type": "ransomware", "features": ["double_extortion", "AV_evasion"], "price": "$50000"}'::jsonb, -0.95),
('Paste Site', 'paste', 'credential_leak', 'Corporate VPN credentials dump - Fortune 500 company. 1,247 username/password pairs. Compromised via phishing campaign.', 'Anonymous', now() - interval '3 days', 9.0, '{"credential_count": 1247, "attack_method": "phishing"}'::jsonb, -0.80);

-- OSINT Sources
INSERT INTO osint_sources (source_type, source_name, source_url, title, content, author, published_at, tags, cves_mentioned, relevance_score) VALUES
('twitter', '@MalwareHunterTeam', 'https://twitter.com/malwrhunterteam/status/...', 'New ransomware strain observed', 'Seeing new LockBit 4.0 variant in the wild. Uses improved encryption and faster propagation. Targets Windows and Linux. #ransomware #threat', 'Malware Hunter Team', now() - interval '1 day', ARRAY['ransomware', 'lockbit', 'malware'], ARRAY[], 9.1),
('security_blog', 'Krebs on Security', 'https://krebsonsecurity.com/2024/...', 'Major Healthcare Data Breach', 'Healthcare Corp confirms breach affecting 2.5M patients. Attackers exploited unpatched Fortinet vulnerability CVE-2024-21762. Data now being sold on dark web forums.', 'Brian Krebs', now() - interval '3 days', ARRAY['breach', 'healthcare', 'fortinet'], ARRAY['CVE-2024-21762'], 9.8),
('vulnerability_disclosure', 'Full Disclosure', 'https://seclists.org/fulldisclosure/...', 'TeamCity Authentication Bypass', 'Multiple authentication bypass vulnerabilities found in JetBrains TeamCity versions prior to 2023.11.4. Allows unauthenticated attackers to execute arbitrary code.', 'Security Researcher', now() - interval '20 days', ARRAY['vulnerability', 'authentication', 'rce'], ARRAY['CVE-2024-27198'], 9.5),
('github', 'exploit-db', 'https://github.com/exploitdb/...', 'OpenSSH RegresshIOn PoC', 'Proof of concept for CVE-2024-6387. Demonstrates signal handler race condition leading to RCE. Educational purposes only.', 'exploit-db contributors', now() - interval '4 days', ARRAY['poc', 'openssh', 'rce'], ARRAY['CVE-2024-6387'], 9.7),
('security_blog', 'The Hacker News', 'https://thehackernews.com/2024/...', 'Supply Chain Attack via XZ Backdoor', 'Sophisticated supply chain attack discovered in XZ Utils. Backdoor provides SSH access. Affects major Linux distributions. CVE-2024-3094 assigned.', 'THN Editor', now() - interval '28 days', ARRAY['supply-chain', 'backdoor', 'linux'], ARRAY['CVE-2024-3094'], 10.0);

-- Malware Sandbox Results
INSERT INTO malware_sandbox_results (sandbox_platform, file_hash_sha256, file_name, file_type, detection_ratio, threat_classification, malware_family, behavioral_patterns, severity, analysis_date) VALUES
('virustotal', 'a1b2c3d4e5f6789012345678901234567890123456789012345678901234abcd', 'invoice.pdf.exe', 'PE32', '65/70', ARRAY['trojan', 'backdoor', 'stealer'], 'TrickBot', '{"network": ["C2 beacon to 45.141.84.23:443", "DNS queries to malicious domains"], "file": ["Drops payloads in %TEMP%", "Creates autorun registry keys"], "process": ["Process injection into explorer.exe", "Credential dumping via lsass"]}'::jsonb, 'highly_malicious', now() - interval '2 days'),
('any_run', 'f9e8d7c6b5a4321098765432109876543210987654321098765432109876fedc', 'update.zip', 'Archive', '58/70', ARRAY['ransomware', 'file-encryptor'], 'LockBit', '{"file": ["Encrypts files with .lockbit extension", "Deletes shadow copies"], "network": ["Contacts TOR C2 servers"], "process": ["Terminates database processes", "Disables Windows Defender"]}'::jsonb, 'highly_malicious', now() - interval '5 days'),
('hybrid_analysis', '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef', 'resume.docm', 'Office Document', '42/70', ARRAY['downloader', 'macro-malware'], 'Emotet', '{"network": ["Downloads additional payloads from hxxps://malicious-cdn.com"], "process": ["Spawns powershell.exe with encoded command"], "anti_analysis": ["Checks for sandbox environment", "VM detection"]}'::jsonb, 'malicious', now() - interval '7 days');

-- Phishing Dataset
INSERT INTO phishing_dataset (url, url_domain, url_length, has_ip_address, has_https, suspicious_keywords, phishing_classification, confidence_score, detected_at) VALUES
('http://paypaI-security-verify.com/login', 'paypaI-security-verify.com', 42, false, false, ARRAY['paypal', 'security', 'verify', 'login'], 'phishing', 0.96, now() - interval '1 day'),
('https://microsofl-login-authentication.xyz/office365', 'microsofl-login-authentication.xyz', 53, false, true, ARRAY['microsoft', 'login', 'office365'], 'phishing', 0.94, now() - interval '3 days'),
('http://192.168.1.100/secure/banking/', '192.168.1.100', 35, true, false, ARRAY['secure', 'banking'], 'phishing', 0.88, now() - interval '5 days'),
('https://chase-account-verification.net/signin', 'chase-account-verification.net', 47, false, true, ARRAY['chase', 'account', 'verification'], 'phishing', 0.92, now() - interval '2 days');

-- Historical Attacks
INSERT INTO historical_attacks (attack_id, incident_date, attack_type, threat_actor_group, target_industry, initial_access_vector, ttps_used, dwell_time_days, impact_severity, containment_time_hours, remediation_steps, lessons_learned) VALUES
('INCIDENT-2024-0157', now() - interval '45 days', 'ransomware', 'LockBit 3.0', 'Healthcare', 'Unpatched VPN gateway (CVE-2024-21762)', ARRAY['T1190', 'T1486', 'T1490', 'T1567'], 12, 'critical', 72.5, '{"containment": ["Isolated affected networks", "Disabled VPN gateway"], "eradication": ["Removed malware from 243 systems", "Patched VPN vulnerability"], "recovery": ["Restored from backups", "Rebuilt compromised systems"]}'::jsonb, 'Patch management failures and lack of network segmentation allowed rapid lateral movement'),
('INCIDENT-2023-0892', now() - interval '180 days', 'apt', 'APT29 (Cozy Bear)', 'Government', 'Spear phishing email', ARRAY['T1566', 'T1055', 'T1003', 'T1071'], 127, 'high', 168.0, '{"containment": ["Blocked C2 domains", "Isolated compromised systems"], "eradication": ["Removed implants from 45 systems", "Reset all credentials"], "recovery": ["Enhanced monitoring", "Deployed EDR"]}'::jsonb, 'Nation-state actors maintain long-term persistence. Behavioral analytics critical for detection'),
('INCIDENT-2024-0231', now() - interval '90 days', 'supply_chain', 'Unknown', 'Technology', 'Compromised software update', ARRAY['T1195', 'T1059', 'T1569'], 3, 'critical', 24.0, '{"containment": ["Rolled back software updates", "Quarantined affected systems"], "eradication": ["Identified and removed backdoor", "Forensic analysis"], "recovery": ["Implemented update verification", "Enhanced SBOM monitoring"]}'::jsonb, 'Supply chain attacks require verification of all third-party software and dependencies');

-- Zero-Day Candidates
INSERT INTO zero_day_candidates (candidate_id, detection_method, anomalous_behavior, affected_system, baseline_deviation_score, exploit_likelihood, detected_at) VALUES
('ZD-2024-0042', 'behavioral_anomaly', 'Unusual memory allocation patterns in web server process followed by privilege escalation attempts', 'nginx/1.24.0', 8.7, 0.82, now() - interval '6 hours'),
('ZD-2024-0043', 'code_pattern', 'Buffer overflow vulnerability detected in proprietary protocol parser', 'Custom IoT Gateway', 9.1, 0.89, now() - interval '2 days'),
('ZD-2024-0044', 'ml_prediction', 'Abnormal system call sequence indicating kernel-level exploit', 'Linux Kernel 6.5.x', 8.9, 0.85, now() - interval '12 hours');

-- Threat Graph Nodes (Sample)
INSERT INTO threat_graph_nodes (node_id, node_type, node_label, properties, risk_score, first_seen, is_malicious) VALUES
('ip_45.141.84.23', 'ip_address', '45.141.84.23', '{"country": "RU", "asn": "AS12345", "reputation": "malicious"}'::jsonb, 9.5, now() - interval '30 days', true),
('user_jsmith', 'user', 'jsmith@company.com', '{"department": "Finance", "access_level": "standard"}'::jsonb, 2.3, now() - interval '2 years', false),
('file_trickbot', 'file_hash', 'a1b2c3d4e5f6...', '{"malware_family": "TrickBot", "threat_type": "trojan"}'::jsonb, 9.8, now() - interval '5 days', true),
('apt29', 'threat_actor', 'APT29 (Cozy Bear)', '{"sophistication": "high", "motivation": "espionage"}'::jsonb, 9.9, now() - interval '5 years', true);

-- Threat Graph Edges
INSERT INTO threat_graph_edges (edge_id, source_node_id, target_node_id, relationship_type, weight, is_suspicious) VALUES
('edge_001', 'ip_45.141.84.23', 'file_trickbot', 'drops', 1.0, true),
('edge_002', 'user_jsmith', 'ip_45.141.84.23', 'communicates_with', 0.8, true),
('edge_003', 'apt29', 'ip_45.141.84.23', 'uses_technique', 1.0, true);
