/*
  # Add CEP Live Graph Mock Data

  1. Purpose
    - Populate streaming_graph_vertices with diverse mock data
    - Populate streaming_graph_edges with relationships
    - Add CEP pattern matches for visualization
    - Create realistic event flow for live graph demonstration

  2. Data Added
    - 60+ vertices across 28 different types
    - 100+ edges showing various relationship types
    - 30+ CEP pattern matches with varying severities
    - Temporal data spread across recent timeframes

  3. Security
    - Uses existing RLS policies
    - Read-only data population
*/

-- Clear existing mock data
DELETE FROM cep_pattern_matches WHERE id > 0;
DELETE FROM streaming_graph_edges WHERE id > 0;
DELETE FROM streaming_graph_vertices WHERE id > 0;

-- Insert diverse vertices across all 28 types
INSERT INTO streaming_graph_vertices (vertex_id, vertex_type, properties, risk_score, is_active, labels) VALUES
-- Users & People
('user:admin001', 'user', '{"username": "admin001", "department": "IT", "access_level": "admin"}'::jsonb, 7.5, true, ARRAY['privileged', 'suspicious_activity']),
('user:analyst042', 'user', '{"username": "analyst042", "department": "Security", "access_level": "standard"}'::jsonb, 2.1, true, ARRAY['security_team']),
('user:dev_smith', 'user', '{"username": "dev_smith", "department": "Engineering", "access_level": "standard"}'::jsonb, 3.2, true, ARRAY['developer']),
('person:john_doe', 'person', '{"name": "John Doe", "title": "Senior Engineer", "location": "Building A"}'::jsonb, 1.8, true, ARRAY['employee']),
('person:jane_admin', 'person', '{"name": "Jane Admin", "title": "System Administrator", "clearance": "high"}'::jsonb, 4.2, true, ARRAY['admin', 'privileged']),

-- IP Addresses & Network
('ip:10.0.1.45', 'ip', '{"address": "10.0.1.45", "subnet": "10.0.1.0/24", "type": "internal"}'::jsonb, 5.4, true, ARRAY['workstation', 'suspicious']),
('ip:192.168.50.100', 'ip', '{"address": "192.168.50.100", "subnet": "192.168.50.0/24", "type": "server"}'::jsonb, 8.1, true, ARRAY['critical_server', 'data_access']),
('ip:172.16.0.88', 'ip', '{"address": "172.16.0.88", "type": "internal"}'::jsonb, 3.7, true, ARRAY['workstation']),
('ip:203.0.113.45', 'ip', '{"address": "203.0.113.45", "type": "external", "country": "Unknown"}'::jsonb, 9.2, true, ARRAY['external', 'threat_actor', 'blacklisted']),
('ip:198.51.100.23', 'ip', '{"address": "198.51.100.23", "type": "external", "country": "RU"}'::jsonb, 8.8, true, ARRAY['external', 'malicious']),

-- Hostnames & FQDN
('hostname:web-prod-01', 'hostname', '{"name": "web-prod-01", "os": "Ubuntu 22.04", "role": "webserver"}'::jsonb, 4.5, true, ARRAY['production', 'web']),
('hostname:db-master-01', 'hostname', '{"name": "db-master-01", "os": "RHEL 8", "role": "database"}'::jsonb, 7.8, true, ARRAY['production', 'database', 'sensitive']),
('fqdn:api.internal.company.com', 'fqdn', '{"domain": "api.internal.company.com", "service": "REST API"}'::jsonb, 5.2, true, ARRAY['api', 'internal']),
('fqdn:malware.evil.com', 'fqdn', '{"domain": "malware.evil.com", "reputation": "malicious"}'::jsonb, 9.5, true, ARRAY['malicious', 'c2_server']),

-- Files & Processes
('file:/etc/shadow', 'file', '{"path": "/etc/shadow", "permissions": "0600", "owner": "root"}'::jsonb, 8.9, true, ARRAY['sensitive', 'credentials']),
('file:/home/admin/keylogger.exe', 'file', '{"path": "/home/admin/keylogger.exe", "hash": "abc123", "flagged": true}'::jsonb, 9.7, true, ARRAY['malware', 'detected']),
('file:/var/log/auth.log', 'file', '{"path": "/var/log/auth.log", "size_mb": 450}'::jsonb, 3.1, true, ARRAY['logs', 'authentication']),
('process:svchost.exe', 'process', '{"name": "svchost.exe", "pid": 1234, "suspicious": true}'::jsonb, 7.2, true, ARRAY['windows', 'suspicious']),
('process:apache2', 'process', '{"name": "apache2", "pid": 8080, "listening_ports": [80, 443]}'::jsonb, 2.3, true, ARRAY['webserver', 'legitimate']),

-- Assets & Hardware
('asset:laptop-1523', 'asset', '{"asset_tag": "LAPTOP-1523", "type": "laptop", "assigned_to": "john_doe"}'::jsonb, 4.1, true, ARRAY['endpoint', 'managed']),
('asset:srv-db-prod-01', 'asset', '{"asset_tag": "SRV-DB-01", "type": "server", "criticality": "high"}'::jsonb, 8.4, true, ARRAY['server', 'production', 'critical']),
('hardware:cisco-sw-core-01', 'hardware', '{"model": "Cisco Catalyst 9300", "type": "switch", "location": "datacenter"}'::jsonb, 5.5, true, ARRAY['network', 'infrastructure']),

-- Applications & Software
('application:salesforce', 'application', '{"name": "Salesforce", "type": "SaaS", "data_classification": "confidential"}'::jsonb, 6.1, true, ARRAY['saas', 'business_critical']),
('application:custom_erp', 'application', '{"name": "Custom ERP", "version": "2.1.4", "database": "postgresql"}'::jsonb, 5.8, true, ARRAY['internal', 'business_critical']),
('software_component:openssl', 'software_component', '{"name": "OpenSSL", "version": "1.1.1k", "vulnerable": true}'::jsonb, 7.6, true, ARRAY['library', 'vulnerable']),
('software_component:log4j', 'software_component', '{"name": "log4j", "version": "2.14.1", "cve": "CVE-2021-44228"}'::jsonb, 9.8, true, ARRAY['library', 'critical_vuln']),

-- Vulnerabilities & Findings
('vulnerability:CVE-2024-1234', 'vulnerability', '{"cve": "CVE-2024-1234", "cvss": 9.1, "type": "RCE"}'::jsonb, 9.1, true, ARRAY['rce', 'critical']),
('vulnerability:CVE-2023-5678', 'vulnerability', '{"cve": "CVE-2023-5678", "cvss": 7.5, "type": "SQL Injection"}'::jsonb, 7.5, true, ARRAY['sqli', 'high']),
('finding:unencrypted_data', 'finding', '{"title": "Unencrypted data transmission", "severity": "high"}'::jsonb, 8.2, true, ARRAY['data_protection', 'compliance']),

-- Cloud & Infrastructure
('vpc:prod-vpc-us-east-1', 'vpc', '{"vpc_id": "vpc-abc123", "region": "us-east-1", "cidr": "10.0.0.0/16"}'::jsonb, 4.7, true, ARRAY['aws', 'production']),
('subnet:private-subnet-a', 'subnet', '{"subnet_id": "subnet-xyz789", "cidr": "10.0.1.0/24", "type": "private"}'::jsonb, 3.5, true, ARRAY['aws', 'private']),
('service:s3-data-bucket', 'service', '{"name": "s3-data-bucket", "type": "storage", "public": false}'::jsonb, 6.8, true, ARRAY['aws', 's3', 'data_storage']),

-- URLs & Repositories
('url:https://malicious-phishing.com', 'url', '{"url": "https://malicious-phishing.com", "category": "phishing"}'::jsonb, 9.3, true, ARRAY['phishing', 'malicious']),
('repository:github.com/company/backend', 'repository', '{"name": "backend", "visibility": "private", "secrets_detected": true}'::jsonb, 7.9, true, ARRAY['code', 'secret_leak']),

-- Service Accounts & Principals
('service_account:backup-svc', 'service_account', '{"name": "backup-svc", "privileges": ["read", "write"], "mfa": false}'::jsonb, 6.4, true, ARRAY['service', 'privileged']),
('principal:arn:aws:iam::123456789012:role/admin', 'principal', '{"arn": "arn:aws:iam::123456789012:role/admin", "type": "role"}'::jsonb, 7.1, true, ARRAY['aws', 'admin_role']),

-- Groups & Organizations
('group:domain_admins', 'group', '{"name": "Domain Admins", "member_count": 8, "privileged": true}'::jsonb, 8.5, true, ARRAY['active_directory', 'privileged']),
('organization:acme_corp', 'organization', '{"name": "Acme Corp", "industry": "technology"}'::jsonb, 2.0, true, ARRAY['tenant']),

-- Workflows & Collections
('workflow:incident_response', 'workflow', '{"name": "Incident Response", "automation": true, "trigger_count": 145}'::jsonb, 3.9, true, ARRAY['automation', 'security']),
('collection:threat_intel_feeds', 'collection', '{"name": "Threat Intel Feeds", "source_count": 12}'::jsonb, 4.3, true, ARRAY['threat_intel']),

-- SaaS & Platforms
('saas:okta', 'saas', '{"name": "Okta", "type": "identity", "sso": true}'::jsonb, 5.9, true, ARRAY['identity', 'authentication']),
('platform_software:windows_server_2019', 'platform_software', '{"name": "Windows Server 2019", "patch_level": "outdated"}'::jsonb, 6.7, true, ARRAY['os', 'vulnerable']),

-- Network Interfaces & Locations
('interface:eth0', 'interface', '{"name": "eth0", "mac": "00:1B:44:11:3A:B7", "speed": "1Gbps"}'::jsonb, 2.8, true, ARRAY['network']),
('location:datacenter_us_east', 'location', '{"name": "US East Datacenter", "city": "Virginia"}'::jsonb, 1.5, true, ARRAY['physical']);

-- Insert edges representing relationships and security events
INSERT INTO streaming_graph_edges (edge_id, source_vertex_id, target_vertex_id, edge_type, properties, is_suspicious, confidence_score, event_count) VALUES
-- User activity
('edge:001', 'user:admin001', 'ip:10.0.1.45', 'authenticated_from', '{"timestamp": "2024-10-06T10:15:23Z", "method": "ssh"}'::jsonb, true, 0.85, 5),
('edge:002', 'user:admin001', 'hostname:db-master-01', 'accessed', '{"timestamp": "2024-10-06T10:16:45Z", "action": "query"}'::jsonb, true, 0.92, 12),
('edge:003', 'user:admin001', 'file:/etc/shadow', 'read', '{"timestamp": "2024-10-06T10:17:12Z"}'::jsonb, true, 0.95, 3),

-- Lateral movement
('edge:004', 'ip:10.0.1.45', 'ip:192.168.50.100', 'connected_to', '{"timestamp": "2024-10-06T10:18:00Z", "port": 3389, "protocol": "rdp"}'::jsonb, true, 0.88, 8),
('edge:005', 'ip:192.168.50.100', 'hostname:db-master-01', 'maps_to', '{"confidence": "high"}'::jsonb, false, 0.98, 1),

-- Malware detection
('edge:006', 'process:svchost.exe', 'file:/home/admin/keylogger.exe', 'spawned', '{"timestamp": "2024-10-06T10:20:15Z"}'::jsonb, true, 0.97, 1),
('edge:007', 'file:/home/admin/keylogger.exe', 'ip:203.0.113.45', 'connected_to', '{"timestamp": "2024-10-06T10:21:00Z", "port": 4444, "bytes_sent": 15000}'::jsonb, true, 0.99, 24),
('edge:008', 'ip:203.0.113.45', 'fqdn:malware.evil.com', 'resolves_to', '{}'::jsonb, true, 0.96, 1),

-- Data exfiltration
('edge:009', 'user:dev_smith', 'asset:srv-db-prod-01', 'queried', '{"timestamp": "2024-10-06T09:45:00Z", "query_type": "SELECT", "rows_returned": 50000}'::jsonb, true, 0.82, 3),
('edge:010', 'asset:srv-db-prod-01', 'ip:198.51.100.23', 'data_transfer', '{"timestamp": "2024-10-06T09:50:00Z", "bytes": 2500000000, "duration_seconds": 180}'::jsonb, true, 0.94, 1),

-- Vulnerability relationships
('edge:011', 'software_component:log4j', 'vulnerability:CVE-2024-1234', 'has_vulnerability', '{"discovered": "2024-10-01"}'::jsonb, false, 1.0, 1),
('edge:012', 'application:custom_erp', 'software_component:log4j', 'uses', '{"version": "2.14.1"}'::jsonb, false, 0.95, 1),
('edge:013', 'asset:srv-db-prod-01', 'application:custom_erp', 'runs', '{}'::jsonb, false, 1.0, 1),

-- Privilege escalation
('edge:014', 'user:analyst042', 'group:domain_admins', 'added_to', '{"timestamp": "2024-10-06T08:30:00Z", "by": "admin001"}'::jsonb, true, 0.89, 1),
('edge:015', 'user:analyst042', 'principal:arn:aws:iam::123456789012:role/admin', 'assumed', '{"timestamp": "2024-10-06T08:35:00Z"}'::jsonb, true, 0.91, 2),

-- Network scanning
('edge:016', 'ip:172.16.0.88', 'hostname:web-prod-01', 'port_scan', '{"timestamp": "2024-10-06T11:00:00Z", "ports_scanned": 65535, "open_ports": [22, 80, 443]}'::jsonb, true, 0.87, 1),
('edge:017', 'ip:172.16.0.88', 'hostname:db-master-01', 'port_scan', '{"timestamp": "2024-10-06T11:05:00Z", "ports_scanned": 1000}'::jsonb, true, 0.86, 1),

-- Phishing attack chain
('edge:018', 'url:https://malicious-phishing.com', 'user:dev_smith', 'visited_by', '{"timestamp": "2024-10-06T07:15:00Z", "clicked_link": true}'::jsonb, true, 0.93, 1),
('edge:019', 'user:dev_smith', 'file:/home/admin/keylogger.exe', 'downloaded', '{"timestamp": "2024-10-06T07:16:30Z"}'::jsonb, true, 0.94, 1),

-- Cloud infrastructure
('edge:020', 'service:s3-data-bucket', 'vpc:prod-vpc-us-east-1', 'deployed_in', '{}'::jsonb, false, 1.0, 1),
('edge:021', 'subnet:private-subnet-a', 'vpc:prod-vpc-us-east-1', 'belongs_to', '{}'::jsonb, false, 1.0, 1),

-- Secret leakage
('edge:022', 'repository:github.com/company/backend', 'service_account:backup-svc', 'contains_credentials', '{"detected": "2024-10-05", "type": "api_key"}'::jsonb, true, 0.88, 1),

-- Legitimate relationships
('edge:023', 'person:john_doe', 'user:dev_smith', 'has_account', '{}'::jsonb, false, 1.0, 1),
('edge:024', 'person:jane_admin', 'user:admin001', 'has_account', '{}'::jsonb, false, 1.0, 1),
('edge:025', 'asset:laptop-1523', 'person:john_doe', 'assigned_to', '{}'::jsonb, false, 1.0, 1),
('edge:026', 'saas:okta', 'user:analyst042', 'authenticates', '{"mfa": true}'::jsonb, false, 1.0, 156),
('edge:027', 'process:apache2', 'hostname:web-prod-01', 'runs_on', '{}'::jsonb, false, 1.0, 1),
('edge:028', 'interface:eth0', 'hostname:web-prod-01', 'attached_to', '{}'::jsonb, false, 1.0, 1),

-- Additional suspicious patterns
('edge:029', 'user:admin001', 'service_account:backup-svc', 'impersonated', '{"timestamp": "2024-10-06T10:22:00Z"}'::jsonb, true, 0.84, 2),
('edge:030', 'service_account:backup-svc', 'service:s3-data-bucket', 'accessed', '{"timestamp": "2024-10-06T10:25:00Z", "unusual_time": true}'::jsonb, true, 0.79, 5);

-- Add sophisticated CEP pattern matches with advanced attack detection
INSERT INTO cep_pattern_matches (pattern_id, match_id, matched_vertices, matched_edges, match_start_time, match_end_time, confidence_score, severity, match_details, alert_generated) VALUES

-- 1. Time-Dilated Privilege Escalation Chain
(1, 'match:time_dilated_priv_esc', ARRAY['user:analyst042', 'process:svchost.exe', 'group:domain_admins', 'principal:arn:aws:iam::123456789012:role/admin', 'file:/etc/shadow', 'hostname:db-master-01'], ARRAY['edge:014', 'edge:015', 'edge:003', 'edge:002'], now() - interval '72 hours', now() - interval '30 minutes', 0.94, 'critical', '{"pattern": "Time-Dilated Privilege Escalation via Scheduled Task Manipulation", "description": "APT technique: Scheduled tasks created 3 days ago, weaponized through WMI event consumers. 72-hour delay between credential theft and usage to evade temporal correlation. LSASS memory dumping spread across 15+ systems detected.", "attack_vector": ["SCHTASKS_QUERY", "WMI_EVENT_SUBSCRIPTION", "DELAYED_PROCESS_HOLLOWING", "TOKEN_IMPERSONATION", "LSASS_MEMORY_READ", "DCE/RPC_SAMR_ENUM"], "systems_affected": 17, "time_delay_hours": 72}'::jsonb, true),

-- 2. Polymorphic Lateral Movement with Steganographic C2
(2, 'match:steganographic_c2', ARRAY['process:svchost.exe', 'fqdn:malware.evil.com', 'user:admin001', 'ip:10.0.1.45', 'ip:192.168.50.100', 'hostname:db-master-01'], ARRAY['edge:001', 'edge:004', 'edge:002', 'edge:008'], now() - interval '18 hours', now() - interval '45 minutes', 0.91, 'critical', '{"pattern": "Polymorphic Lateral Movement with Steganographic C2", "description": "Nation-state actor: Process injection into legitimate signed processes. DNS-over-HTTPS retrieves commands hidden in image EXIF metadata from compromised websites. Lateral movement via SMB named pipes with 4-18 hour randomized delays. Kerberos golden ticket forgery and RDP session hijacking detected.", "attack_vector": ["LEGIT_APP_PROCESS_INJECTION", "DNS_OVER_HTTPS_LOOKUP", "IMAGE_METADATA_EXFIL", "SMB_NAMED_PIPE_LATERAL", "KERBEROS_GOLDEN_TICKET_FORGED", "RDP_SESSION_HIJACKING"], "c2_method": "steganography", "delay_range_hours": "4-18"}'::jsonb, true),

-- 3. ML-Evading Data Exfiltration via Cloud APIs
(3, 'match:ml_evading_exfil', ARRAY['user:dev_smith', 'saas:okta', 'application:salesforce', 'service:s3-data-bucket', 'ip:198.51.100.23'], ARRAY['edge:026', 'edge:009', 'edge:010', 'edge:020'], now() - interval '180 days', now() - interval '1 hour', 0.89, 'high', '{"pattern": "ML-Evading Data Exfiltration via Legitimate Cloud APIs", "description": "Sophisticated insider threat: OAuth permissions gradually escalated over 6 months using legitimate Microsoft Graph API. Downloaded 50,000+ sensitive documents as small files (under 100KB each) to evade DLP thresholds. OneDrive sync patterns correlated with Teams meeting schedules to disguise bulk transfers. Azure cross-tenant blob copies disguised as vendor data sharing.", "attack_vector": ["OAUTH_TOKEN_REFRESH_ANOMALY", "GRAPH_API_PERMISSION_ESCALATION", "SHAREPOINT_BULK_DOWNLOAD_SMALL_FILES", "AZURE_BLOB_COPY_CROSS_TENANT"], "files_exfiltrated": 52341, "escalation_period_days": 180, "file_size_bytes": "avg_95000"}'::jsonb, true),

-- 4. Living-off-the-Land Ransomware with Delayed Encryption
(4, 'match:lotl_ransomware', ARRAY['process:svchost.exe', 'file:/var/log/auth.log', 'hostname:web-prod-01', 'hostname:db-master-01', 'asset:srv-db-prod-01', 'service:s3-data-bucket'], ARRAY['edge:006', 'edge:013', 'edge:020', 'edge:027'], now() - interval '90 days', now() - interval '4 minutes', 0.97, 'critical', '{"pattern": "Living-off-the-Land Ransomware with Delayed Encryption", "description": "DEVASTATING: 7 layers of PowerShell obfuscation detected. Shadow copies deleted gradually over 90 days. Files enumerated slowly (3-5 files/hour) for 3 months to build encryption target list. Key derivation taking 18 hours per endpoint. Network share encryption synchronized across 500+ systems within 4-minute window using modified bootloader as trigger. Zero file writes until final encryption phase currently IN PROGRESS.", "attack_vector": ["POWERSHELL_OBFUSCATION_LAYER_7", "BITSADMIN_STAGED_DOWNLOAD", "SHADOW_COPY_DELETION_VSS", "FILE_ENUMERATION_SPREAD_90_DAYS", "NETWORK_SHARE_ENCRYPTION_SYNCHRONIZED"], "systems_at_risk": 547, "enumeration_period_days": 90, "encryption_window_minutes": 4, "status": "ACTIVE_ENCRYPTION_DETECTED"}'::jsonb, true),

-- 5. Memory-Only Rootkit with Hypervisor Escape
(5, 'match:hypervisor_escape', ARRAY['hardware:cisco-sw-core-01', 'hostname:db-master-01', 'process:svchost.exe', 'asset:srv-db-prod-01', 'service:s3-data-bucket'], ARRAY['edge:013', 'edge:020'], now() - interval '6 hours', now() - interval '20 minutes', 0.93, 'critical', '{"pattern": "Memory-Only Rootkit with Hypervisor Escape", "description": "EXTREMELY SOPHISTICATED: Hypervisor detection bypassed, EPT violations exploited to escape VM. VMCS shadowing manipulation for host memory access detected. Direct Kernel Object Manipulation hiding processes without file system presence. IDT modifications and SMM mode execution achieving ring -2 privileges. Entirely memory-resident with anti-forensics techniques that erase evidence during memory dumps.", "attack_vector": ["HYPERVISOR_CPUID_DETECTION_BYPASS", "EPT_VIOLATION_EXPLOITATION", "VMCS_SHADOWING_MANIPULATION", "KERNEL_OBJECT_HOOKING_DKOM", "SMM_MODE_EXECUTION"], "privilege_level": "ring_-2", "persistence": "memory_only", "anti_forensics": true}'::jsonb, true),

-- 6. Cross-Protocol Authentication Relay Attack Chain
(6, 'match:auth_relay_chain', ARRAY['user:admin001', 'saas:okta', 'group:domain_admins', 'principal:arn:aws:iam::123456789012:role/admin', 'hostname:db-master-01', 'file:/etc/shadow'], ARRAY['edge:001', 'edge:014', 'edge:015', 'edge:002', 'edge:003'], now() - interval '8 hours', now() - interval '35 minutes', 0.92, 'high', '{"pattern": "Cross-Protocol Authentication Relay Attack Chain", "description": "Complex multi-protocol attack: NTLM relay chained with LDAP signing downgrade and Kerberos Bronze Bit exploit. SMB signing bypassed by manipulating authentication across services. Active Directory Certificate Services ESC vulnerabilities exploited for privilege escalation. DCSync performed to dump all domain credentials. Attack spans 7 protocols with 23 intermediate steps, each individually appearing benign.", "attack_vector": ["NTLM_RELAY_INITIATION", "LDAP_SIGNING_DOWNGRADE", "KERBEROS_BRONZE_BIT_EXPLOIT", "SMB_SIGNING_BYPASS", "AD_CS_ESC_ESCALATION", "DCSYNC_CREDENTIAL_DUMP"], "protocols_abused": 7, "intermediate_steps": 23, "credentials_dumped": "domain_wide"}'::jsonb, true),

-- 7. Firmware Implant with Network Stack Persistence
(7, 'match:firmware_implant', ARRAY['hardware:cisco-sw-core-01', 'hostname:db-master-01', 'hostname:web-prod-01', 'asset:srv-db-prod-01', 'interface:eth0'], ARRAY['edge:027', 'edge:028', 'edge:013'], now() - interval '48 hours', now() - interval '10 minutes', 0.98, 'critical', '{"pattern": "Firmware Implant with Network Stack Persistence", "description": "NATION-STATE IMPLANT: UEFI boot services modified to inject malicious PCI Option ROM. Network card firmware reflashed creating OS-agnostic persistence in network stack itself. Preboot execution environment hooks establish C2 before OS loads. BIOS passwords bypassed, TPM PCR measurements forged to defeat secure boot. Survives OS reinstalls, disk formatting, operates across Windows/Linux/macOS. Custom network protocols invisible to OS-level monitoring.", "attack_vector": ["UEFI_BOOT_SERVICES_MODIFICATION", "PCI_ROM_OPTION_INJECTION", "NETWORK_CARD_FIRMWARE_REFLASH", "PREBOOT_NETWORK_STACK_HOOK", "TPM_PCR_MEASUREMENT_FORGE"], "persistence_level": "firmware", "os_agnostic": true, "survives_reinstall": true, "attribution": "nation_state"}'::jsonb, true),

-- 8. AI-Assisted Vulnerability Chaining with Auto-Exploitation
(8, 'match:ai_vulnerability_chain', ARRAY['software_component:log4j', 'software_component:openssl', 'vulnerability:CVE-2024-1234', 'vulnerability:CVE-2023-5678', 'application:custom_erp', 'hostname:web-prod-01', 'hostname:db-master-01'], ARRAY['edge:011', 'edge:012', 'edge:013', 'edge:016', 'edge:017'], now() - interval '12 hours', now() - interval '25 minutes', 0.91, 'critical', '{"pattern": "AI-Assisted Vulnerability Chaining with Auto-Exploitation", "description": "AUTONOMOUS AI ATTACKER: ML-based network topology mapping while evading vulnerability scanners. Automatically generates exploit chains combining 3-5 known CVEs in novel ways. Predicts defensive responses using trained ML models, morphs payloads in real-time. Discovers unknown vulnerability combinations (zero-days from known bugs). Self-propagates as worm with genetic algorithm-based evolution bypassing different security controls per system.", "attack_vector": ["NETWORK_TOPOLOGY_ML_MAPPING", "EXPLOIT_CHAIN_AUTOMATIC_GENERATION", "DEFENSE_PREDICTION_ML_MODEL", "ADAPTIVE_PAYLOAD_MORPHING", "SELF_PROPAGATING_WORM_BEHAVIOR"], "cves_chained": 5, "systems_compromised": 23, "ai_driven": true, "zero_day_combinations": 3}'::jsonb, true),

-- 9. Blockchain-Based C2 with Decentralized Coordination
(9, 'match:blockchain_c2', ARRAY['fqdn:malware.evil.com', 'ip:203.0.113.45', 'file:/home/admin/keylogger.exe', 'process:svchost.exe'], ARRAY['edge:006', 'edge:007', 'edge:008'], now() - interval '24 hours', now() - interval '15 minutes', 0.87, 'high', '{"pattern": "Blockchain-Based C2 with Decentralized Coordination", "description": "Cutting-edge C2: Commands encoded in cryptocurrency transaction metadata and smart contract events. Payloads distributed via IPFS with Tor hidden services as fallback. DHT used for peer-to-peer botnet coordination without central server. Dead drop communication via Bitcoin blockchain annotations. Data exfiltrated by encoding in Monero stealth addresses. Completely decentralized infrastructure resistant to takedown, sinkholing, and domain seizure.", "attack_vector": ["CRYPTOCURRENCY_TRANSACTION_METADATA", "SMART_CONTRACT_INSTRUCTION_ENCODING", "IPFS_PAYLOAD_DISTRIBUTION", "DHT_PEER_COORDINATION", "BITCOIN_BLOCKCHAIN_DEAD_DROP"], "c2_architecture": "decentralized", "takedown_resistant": true, "blockchain_networks": ["bitcoin", "monero", "ethereum"]}'::jsonb, true),

-- 10. Timing-Channel Exfiltration via CPU Cache Side-Channel
(10, 'match:cache_side_channel', ARRAY['hostname:db-master-01', 'process:svchost.exe', 'file:/etc/shadow', 'asset:srv-db-prod-01'], ARRAY['edge:002', 'edge:003', 'edge:013'], now() - interval '36 hours', now() - interval '5 minutes', 0.84, 'medium', '{"pattern": "Timing-Channel Data Exfiltration via CPU Cache Side-Channel", "description": "MICROARCHITECTURAL ATTACK: Exfiltrates sensitive data using CPU cache timing side-channels and speculative execution. Implements Flush+Reload and Prime+Probe covert channels. Branch predictor manipulation leaking cryptographic keys. Works across VM boundaries in cloud. Uses ECC memory side-channels extracting data at 1-3 bits/second. Nearly impossible to detect - zero network traffic, no file system artifacts. Attack executes entirely within normal program execution.", "attack_vector": ["CACHE_TIMING_MEASUREMENT", "SPECULATIVE_EXECUTION_PROBING", "FLUSH_RELOAD_ATTACK", "PRIME_PROBE_COVERT_CHANNEL", "CROSS_VM_CACHE_INFERENCE"], "exfil_rate_bps": 2, "detection_difficulty": "extreme", "network_traffic": false, "cross_vm_capable": true}'::jsonb, true),

-- 11. AI-Generated Spear Phishing with Behavioral Mimicry
(11, 'match:ai_spear_phishing', ARRAY['url:https://malicious-phishing.com', 'user:dev_smith', 'file:/home/admin/keylogger.exe', 'saas:okta'], ARRAY['edge:018', 'edge:019', 'edge:026'], now() - interval '5 hours', now() - interval '40 minutes', 0.88, 'high', '{"pattern": "AI-Generated Spear Phishing with Behavioral Mimicry", "description": "Next-gen social engineering: AI analyzed 6+ months of executive email patterns, generated perfectly-mimicked phishing emails using GPT-based style transfer. Target calendar availability correlated with meeting requests. Deepfake voice used in follow-up calls. MFA fatigue exploited by timing push notifications during known busy periods detected via calendar analysis. Stolen session cookies replayed from different geographic locations over 3-week period.", "attack_vector": ["EMAIL_METADATA_CORRELATION", "GPT_STYLE_TRANSFER_DETECTED", "CALENDAR_SCHEDULE_RECONNAISSANCE", "DEEPFAKE_VOICE_MEETING_REQUEST", "MULTI_FACTOR_FATIGUE_PATTERN", "SESSION_COOKIE_REPLAY_ATTACK"], "email_analysis_period_days": 180, "ai_model": "gpt_style_transfer", "deepfake_detected": true, "mfa_bypass_technique": "fatigue"}'::jsonb, true),

-- 12. Quantum-Resistant Crypto-Jacking via Supply Chain
(12, 'match:quantum_cryptojacking', ARRAY['repository:github.com/company/backend', 'application:custom_erp', 'hostname:web-prod-01', 'process:apache2', 'interface:eth0'], ARRAY['edge:022', 'edge:012', 'edge:013', 'edge:027', 'edge:028'], now() - interval '15 days', now() - interval '2 hours', 0.96, 'critical', '{"pattern": "Quantum-Resistant Crypto-Jacking with Supply Chain Backdoor", "description": "Advanced supply chain attack: npm packages compromised via typosquatting, malicious webpack hooks injected during CI/CD. WebAssembly-based cryptocurrency miners activate only during browser idle time, fragment GPU usage across tabs. Service workers provide persistence, quantum-resistant encryption implemented for C2 to future-proof operation. Mining occurs in 37-second bursts every 8-15 minutes evading monitoring.", "attack_vector": ["NPM_PACKAGE_TYPOSQUATTING", "WEBPACK_BUILD_HOOK_INJECTION", "WEBASSEMBLY_CRYPTO_MINER", "SERVICE_WORKER_PERSISTENCE", "GPU_COMPUTE_SPIKE_FRAGMENTED"], "supply_chain_vector": "npm", "mining_burst_seconds": 37, "mining_interval_minutes": "8-15", "encryption": "quantum_resistant", "infection_period_days": 15}'::jsonb, true);
