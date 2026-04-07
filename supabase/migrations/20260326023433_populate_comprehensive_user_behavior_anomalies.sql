/*
  # Populate Comprehensive User Behavior Anomalies

  Adds rich anomaly data for all monitored users, correlated with LLM risk analysis findings.

  1. Changes
    - Expands outcome constraint to include 'flagged', 'blocked', 'detected' statuses
    - Adds event_type flexibility for LLM, network, USB, privilege, database events
    - ~60+ new user_behavior_events across all user profiles with realistic anomaly scenarios
    - Risk assessments for every major user profile
    - Behavior correlations linking LLM-assisted anomalies with physical/logical signals
    - Behavioral baselines for deviation detection

  2. Anomaly Scenarios (tied to LLM risk profiles)
    - Leonardo Zanardo: Financial data exfiltration via LLM-assisted DLP evasion
    - Marcus Chen: LLM jailbreak for credential harvesting, privilege escalation, C2
    - Sarah Mitchell: Source code & IP leakage through Copilot, credential exposure
    - Alan Silva: Database exfiltration prep, audit log tampering research
    - Kristin Dahl: Vendor fraud pattern via LLM-generated invoices
    - Sridhar Paladugu: Architecture diagrams & cloud credentials leaked to LLM
    - Matt Harris: CI/CD pipeline security bypass, container escape
    - Keegan Dubbs: Unauthorized offensive security operations
    - Others: Proportional low/medium anomalies for realistic distribution

  3. Tables Modified
    - user_behavior_events (constraint update + INSERT)
    - user_risk_assessments (INSERT)
    - behavior_correlations (INSERT)
    - behavioral_baselines (INSERT)
*/

-- Expand outcome constraint to support richer event statuses
ALTER TABLE user_behavior_events DROP CONSTRAINT IF EXISTS user_behavior_events_outcome_check;
ALTER TABLE user_behavior_events ADD CONSTRAINT user_behavior_events_outcome_check
  CHECK (outcome IN ('success', 'failed', 'denied', 'flagged', 'blocked', 'detected'));

-- =====================================================
-- BEHAVIORAL BASELINES
-- =====================================================
INSERT INTO behavioral_baselines (entity_type, entity_id, baseline_name, baseline_period_days, baseline_metrics, normal_patterns, statistical_bounds, sample_size, confidence_level) VALUES
('user', '6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'Leonardo Zanardo - Work Pattern', 90,
  '{"avg_login_hour": 8.5, "avg_logout_hour": 17.2, "avg_files_accessed": 12, "avg_queries_per_day": 45, "typical_data_volume_mb": 8.2}'::jsonb,
  '{"login_times": "08:00-09:00", "typical_apps": ["SAP", "Excel", "Bloomberg Terminal"], "usual_networks": ["10.0.12.0/24"], "normal_file_shares": ["/shares/finance/reports"]}'::jsonb,
  '{"login_hour_std": 0.8, "files_accessed_std": 4.2, "data_volume_std": 3.1, "query_count_std": 12}'::jsonb,
  2700, 0.95),
('user', 'd4baae05-596c-4fd3-b616-4967981aecbb', 'Marcus Chen - Work Pattern', 90,
  '{"avg_login_hour": 9.0, "avg_logout_hour": 18.5, "avg_files_accessed": 22, "avg_queries_per_day": 78, "typical_data_volume_mb": 45.6}'::jsonb,
  '{"login_times": "08:30-09:30", "typical_apps": ["Splunk", "Wireshark", "Burp Suite"], "usual_networks": ["10.0.50.0/24"], "normal_file_shares": ["/shares/security/investigations"]}'::jsonb,
  '{"login_hour_std": 1.0, "files_accessed_std": 8.5, "data_volume_std": 18.2, "query_count_std": 22}'::jsonb,
  2700, 0.95),
('user', '0d7c7328-ece3-480d-87f0-64f5ec396817', 'Sarah Mitchell - Work Pattern', 90,
  '{"avg_login_hour": 8.2, "avg_logout_hour": 17.8, "avg_files_accessed": 35, "avg_queries_per_day": 120, "typical_data_volume_mb": 125.0}'::jsonb,
  '{"login_times": "07:45-08:45", "typical_apps": ["VSCode", "GitHub", "Jira"], "usual_networks": ["10.0.30.0/24"], "normal_file_shares": ["/shares/engineering/project_alpha"]}'::jsonb,
  '{"login_hour_std": 0.6, "files_accessed_std": 12.0, "data_volume_std": 42.0, "query_count_std": 35}'::jsonb,
  2700, 0.95),
('user', '8832e8ca-6363-4e8e-a370-318178b1ebaf', 'Alan Silva - Work Pattern', 90,
  '{"avg_login_hour": 7.8, "avg_logout_hour": 16.5, "avg_files_accessed": 8, "avg_queries_per_day": 200, "typical_data_volume_mb": 320.0}'::jsonb,
  '{"login_times": "07:30-08:30", "typical_apps": ["pgAdmin", "DataGrip", "Grafana"], "usual_networks": ["10.0.40.0/24"], "normal_file_shares": ["/shares/dba/backups"]}'::jsonb,
  '{"login_hour_std": 0.5, "files_accessed_std": 3.0, "data_volume_std": 85.0, "query_count_std": 55}'::jsonb,
  2700, 0.95),
('user', 'f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'Kristin Dahl - Work Pattern', 90,
  '{"avg_login_hour": 8.8, "avg_logout_hour": 17.0, "avg_files_accessed": 18, "avg_queries_per_day": 35, "typical_data_volume_mb": 5.5}'::jsonb,
  '{"login_times": "08:30-09:15", "typical_apps": ["SAP", "ServiceNow", "Outlook"], "usual_networks": ["10.0.15.0/24"], "normal_file_shares": ["/shares/operations/procedures"]}'::jsonb,
  '{"login_hour_std": 0.4, "files_accessed_std": 5.0, "data_volume_std": 2.1, "query_count_std": 10}'::jsonb,
  2700, 0.95),
('user', '8bb87049-e03e-4777-8548-f6408046c620', 'Matt Harris - Work Pattern', 90,
  '{"avg_login_hour": 9.2, "avg_logout_hour": 19.0, "avg_files_accessed": 28, "avg_queries_per_day": 95, "typical_data_volume_mb": 85.0}'::jsonb,
  '{"login_times": "09:00-09:45", "typical_apps": ["Jenkins", "Docker", "Terraform", "kubectl"], "usual_networks": ["10.0.35.0/24"], "normal_file_shares": ["/shares/engineering/devops"]}'::jsonb,
  '{"login_hour_std": 0.7, "files_accessed_std": 10.0, "data_volume_std": 30.0, "query_count_std": 28}'::jsonb,
  2700, 0.95);


-- =====================================================
-- LEONARDO ZANARDO - Financial Data Exfiltration
-- user_profile_id: 6cc820b1-ea37-4fbd-b01a-3bdca404c5de
-- =====================================================
INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details) VALUES
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'llm_interaction', 'logical', now() - interval '2 hours', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'LLM Query - PII Exfil', 'ChatGPT Enterprise', 'flagged', 94, '{"prompt_category": "data_extraction", "tokens": 4200, "model": "gpt-4", "llm_analysis": "User asked LLM to reformat financial data including account numbers and routing numbers into CSV for export. PII detected in prompt.", "policy_violations": ["PII_IN_PROMPT", "FINANCIAL_DATA_EXPOSURE"]}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'file_access', 'logical', now() - interval '2 hours 15 minutes', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'Bulk Download', '/shares/finance/accounts_payable/2025', 'success', 91, '{"bytes": 284000000, "file_count": 847, "file_types": [".xlsx", ".pdf", ".csv"], "deviation_from_baseline": "42x normal volume", "data_classification": "Confidential-Financial"}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'file_access', 'logical', now() - interval '1 hour 50 minutes', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'Cloud Upload Attempt', 'personal-drive.googleapis.com', 'denied', 96, '{"bytes_attempted": 198000000, "destination": "Personal Google Drive", "dlp_trigger": "Financial PII detected", "blocked_by": "DLP Gateway"}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'llm_interaction', 'logical', now() - interval '1 hour 30 minutes', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'LLM Query - DLP Evasion', 'ChatGPT Enterprise', 'flagged', 88, '{"prompt_category": "obfuscation", "tokens": 2800, "model": "gpt-4", "llm_analysis": "User requested help encoding financial data in base64 format to bypass DLP filters. Clear evasion intent.", "policy_violations": ["DLP_EVASION_ATTEMPT"]}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'badge_scan', 'physical', now() - interval '1 hour 10 minutes', 'Building A - Executive Floor', 'Badge Reader EXC-002', null, 'Entry Attempt', 'Executive Floor Server Closet', 'denied', 85, '{"door": "EXC-SVR-001", "reason": "Insufficient clearance - Finance staff not authorized", "after_hours": false, "repeated_attempt": true}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'file_access', 'logical', now() - interval '55 minutes', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'USB Mass Copy', 'USB Kingston DT100', 'success', 92, '{"bytes_written": 156000000, "files_copied": 234, "usb_serial": "KNG-44892", "data_classification": "Confidential-Financial", "dlp_status": "Agent offline during copy"}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'login', 'logical', now() - interval '45 minutes', 'VPN - Unusual Location', 'Personal MacBook', '186.42.115.203', 'VPN Login', 'Corporate VPN Gateway', 'success', 78, '{"auth_method": "MFA-SMS", "geo_location": "Sao Paulo, BR", "expected_location": "New York, US", "travel_impossible": true, "vpn_gateway": "vpn-east-01"}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'llm_interaction', 'logical', now() - interval '30 minutes', 'VPN - Remote', 'Personal MacBook', '186.42.115.203', 'LLM Query - Wire Transfer', 'Claude API', 'flagged', 90, '{"prompt_category": "wire_transfer", "tokens": 3400, "model": "claude-3-opus", "llm_analysis": "User queried LLM about wire transfer format for international SWIFT transactions. Combined with recent bulk download, indicates potential financial fraud preparation.", "policy_violations": ["SENSITIVE_FINANCIAL_QUERY", "UNUSUAL_LOCATION"]}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'file_access', 'logical', now() - interval '3 hours', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'Print Job', 'Account_Summary_All_Clients.pdf', 'success', 72, '{"pages": 342, "copies": 2, "duplex": false, "data_classification": "Confidential", "unusual": "Largest print job in 90 days for this user"}'::jsonb),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'file_access', 'logical', now() - interval '3 hours 30 minutes', 'Office Network', 'WS-FIN-012', '10.0.12.88', 'Full Table Scan', 'PROD-FIN-DB: accounts_receivable', 'success', 83, '{"query_type": "full_table_scan", "rows_returned": 48921, "tables_accessed": ["accounts_receivable", "client_bank_details", "wire_templates"], "execution_time_ms": 4200, "deviation": "First time querying wire_templates table"}'::jsonb),

-- =====================================================
-- MARCUS CHEN - Credential Harvesting & Lateral Movement
-- user_profile_id: d4baae05-596c-4fd3-b616-4967981aecbb
-- =====================================================
('d4baae05-596c-4fd3-b616-4967981aecbb', 'llm_interaction', 'logical', now() - interval '4 hours', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'LLM Jailbreak Attempt', 'ChatGPT Enterprise', 'flagged', 97, '{"prompt_category": "jailbreak_attempt", "tokens": 5600, "model": "gpt-4", "llm_analysis": "User attempted DAN jailbreak to extract credential dumping techniques. Prompt included encoded references to mimikatz and lsass memory dumps.", "policy_violations": ["JAILBREAK_ATTEMPT", "OFFENSIVE_TOOL_REFERENCE"], "jailbreak_type": "DAN_variant_12"}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'login', 'logical', now() - interval '3 hours 45 minutes', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'Self-Elevation', 'Active Directory', 'success', 93, '{"from_group": "Security-Analysts", "to_group": "Domain-Admins", "method": "Self-service AD modification", "authorization_ticket": null, "change_approved": false, "ad_object": "CN=Marcus Chen,OU=Security,DC=corp,DC=local"}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'llm_interaction', 'logical', now() - interval '3 hours 30 minutes', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'LLM Credential Script Gen', 'GitHub Copilot', 'flagged', 89, '{"prompt_category": "credential_extraction", "tokens": 3200, "model": "copilot", "llm_analysis": "Used Copilot to generate PowerShell script for extracting service account credentials from Windows Credential Manager. Script targets LSASS process.", "policy_violations": ["CREDENTIAL_HARVESTING_CODE"]}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'login', 'logical', now() - interval '3 hours', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'Lateral Movement', 'DC-PRIMARY (10.0.1.10)', 'success', 95, '{"protocol": "SMB/PsExec", "target_systems": ["DC-PRIMARY", "DC-BACKUP", "FILE-SVR-01"], "credentials_used": "svc_backup (service account)", "ttps": ["T1021.002", "T1570"]}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'login', 'logical', now() - interval '2 hours 30 minutes', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'C2 Beacon Detected', '45.33.32.156 (Known C2)', 'detected', 98, '{"protocol": "DNS-over-HTTPS", "beacon_interval_sec": 300, "data_transferred_kb": 4200, "destination_reputation": "Known C2 infrastructure", "ioc_match": "APT-SIM-TEST-001", "ttps": ["T1071.004", "T1573.002"]}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'llm_interaction', 'logical', now() - interval '2 hours', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'LLM Anti-Forensic Research', 'ChatGPT Enterprise', 'flagged', 91, '{"prompt_category": "evasion", "tokens": 4100, "model": "gpt-4", "llm_analysis": "Queried methods to disable Windows Event Logging and clear Security.evtx without triggering SIEM alerts. Clear anti-forensic intent.", "policy_violations": ["ANTI_FORENSIC_TECHNIQUE", "LOG_TAMPERING_INTENT"]}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'file_access', 'logical', now() - interval '1 hour 45 minutes', 'Office Network', 'WS-SEC-007', '10.0.50.142', 'Read', '/shares/security/incident_response/playbooks', 'success', 76, '{"bytes": 28000000, "file_count": 42, "file_types": [".docx", ".pdf"], "deviation_from_baseline": "Accessing IR playbooks outside active incident"}'::jsonb),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'badge_scan', 'physical', now() - interval '1 hour', 'Building B - Data Center', 'Badge Reader DC-001', null, 'Entry', 'Data Center Floor', 'success', 68, '{"door": "DC-MAIN-001", "after_hours": false, "duration_inside_min": 47, "unusual": "No scheduled maintenance or incident ticket"}'::jsonb),

-- =====================================================
-- SARAH MITCHELL - Source Code & IP Theft
-- user_profile_id: 0d7c7328-ece3-480d-87f0-64f5ec396817
-- =====================================================
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'llm_interaction', 'logical', now() - interval '6 hours', 'Office Network', 'WS-2401', '10.0.30.67', 'LLM IP Leak', 'GitHub Copilot', 'flagged', 82, '{"prompt_category": "code_exfiltration", "tokens": 8900, "model": "copilot", "llm_analysis": "Pasted entire proprietary trading algorithm into Copilot for optimization. Contains trade secrets and proprietary IP.", "policy_violations": ["IP_LEAKAGE", "TRADE_SECRET_EXPOSURE"]}'::jsonb),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'file_access', 'logical', now() - interval '5 hours 30 minutes', 'Office Network', 'WS-2401', '10.0.30.67', 'Git Clone - Unusual Repos', 'github.internal/core-platform', 'success', 79, '{"bytes": 890000000, "repos_cloned": 3, "repos": ["ml-models", "trading-engine", "risk-calculator"], "deviation": "Never accessed ml-models or trading-engine repos before", "data_classification": "Top Secret-IP"}'::jsonb),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'llm_interaction', 'logical', now() - interval '5 hours', 'Office Network', 'WS-2401', '10.0.30.67', 'LLM Credential Exposure', 'ChatGPT Enterprise', 'flagged', 86, '{"prompt_category": "token_exposure", "tokens": 1200, "model": "gpt-4", "llm_analysis": "GitHub PAT (ghp_xxxx) and AWS_SECRET_ACCESS_KEY included in prompt context. Credentials rotated.", "policy_violations": ["CREDENTIAL_IN_PROMPT", "API_KEY_EXPOSURE"], "credentials_found": ["GitHub PAT", "AWS Secret Key"]}'::jsonb),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'file_access', 'logical', now() - interval '4 hours 30 minutes', 'Office Network', 'WS-2401', '10.0.30.67', 'Upload Attempt', 'pastebin.com', 'denied', 88, '{"bytes_attempted": 45000, "content_type": "text/plain", "dlp_trigger": "Source code pattern detected", "blocked_by": "Web Proxy DLP"}'::jsonb),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'login', 'logical', now() - interval '12 hours', 'Home Network', 'Personal Laptop', '73.162.44.189', 'SSH Login - After Hours', 'jump-host-prod.internal', 'success', 71, '{"auth_method": "SSH Key", "time": "02:14 AM", "session_duration_min": 95, "commands_executed": 47, "unusual": "Production access at 2 AM without on-call rotation"}'::jsonb),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'file_access', 'logical', now() - interval '11 hours', 'Home Network', 'Personal Laptop', '73.162.44.189', 'Database Dump', 'PROD-APP-DB: user_data', 'success', 87, '{"query_type": "full_database_dump", "rows_returned": 2400000, "tables_accessed": ["users", "transactions", "api_keys"], "data_volume_mb": 1200, "deviation": "No authorization for production data export"}'::jsonb),

-- =====================================================
-- ALAN SILVA - Database Admin Anomalies
-- user_profile_id: 8832e8ca-6363-4e8e-a370-318178b1ebaf
-- =====================================================
('8832e8ca-6363-4e8e-a370-318178b1ebaf', 'file_access', 'logical', now() - interval '8 hours', 'Office Network', 'DBA-WS-003', '10.0.40.22', 'Non-Standard Backup', 'PROD-MASTER-DB', 'success', 85, '{"query_type": "full_backup", "database": "master_financial", "backup_size_gb": 48.2, "destination": "/tmp/alan_backup.bak", "deviation": "Backup to /tmp instead of backup share", "scheduled": false}'::jsonb),
('8832e8ca-6363-4e8e-a370-318178b1ebaf', 'llm_interaction', 'logical', now() - interval '7 hours 30 minutes', 'Office Network', 'DBA-WS-003', '10.0.40.22', 'LLM Exfil Planning', 'ChatGPT Enterprise', 'flagged', 80, '{"prompt_category": "data_extraction", "tokens": 3600, "model": "gpt-4", "llm_analysis": "Asked LLM how to compress and encrypt a database backup for transfer to external storage. Mentioned using gpg with personal key.", "policy_violations": ["UNAUTHORIZED_DATA_TRANSFER_PLANNING"]}'::jsonb),
('8832e8ca-6363-4e8e-a370-318178b1ebaf', 'file_access', 'logical', now() - interval '7 hours', 'Office Network', 'DBA-WS-003', '10.0.40.22', 'SCP Transfer Attempt', 'external-host.linode.com', 'denied', 93, '{"bytes_attempted": 51800000000, "protocol": "SCP", "destination_ip": "172.105.22.143", "blocked_by": "Firewall Egress Rule", "data_classification": "Critical-Database"}'::jsonb),
('8832e8ca-6363-4e8e-a370-318178b1ebaf', 'login', 'logical', now() - interval '6 hours', 'Office Network', 'DBA-WS-003', '10.0.40.22', 'Wildcard Account Creation', 'PROD-MASTER-DB', 'success', 78, '{"action": "GRANT ALL ON *.* TO alan_personal@%", "deviation": "Created personal wildcard account with full privileges", "change_ticket": null}'::jsonb),
('8832e8ca-6363-4e8e-a370-318178b1ebaf', 'llm_interaction', 'logical', now() - interval '5 hours', 'Office Network', 'DBA-WS-003', '10.0.40.22', 'LLM Audit Tampering', 'Claude API', 'flagged', 77, '{"prompt_category": "obfuscation", "tokens": 2100, "model": "claude-3-sonnet", "llm_analysis": "Asked about audit log manipulation - how to delete pg_audit_log entries without triggering integrity checks.", "policy_violations": ["AUDIT_TAMPERING_INTENT"]}'::jsonb),

-- =====================================================
-- KRISTIN DAHL - Vendor Fraud Pattern
-- user_profile_id: f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c
-- =====================================================
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'llm_interaction', 'logical', now() - interval '10 hours', 'Office Network', 'WS-OPS-045', '10.0.15.92', 'LLM Invoice Forgery', 'ChatGPT Enterprise', 'flagged', 76, '{"prompt_category": "document_forgery", "tokens": 2900, "model": "gpt-4", "llm_analysis": "Asked LLM to generate vendor invoice template matching approved vendor format. Invoice details matched no active PO.", "policy_violations": ["POTENTIAL_INVOICE_FRAUD"]}'::jsonb),
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'file_access', 'logical', now() - interval '9 hours', 'Office Network', 'WS-OPS-045', '10.0.15.92', 'Vendor Master Edit', '/shares/finance/vendor_master', 'success', 82, '{"files_modified": 3, "changes": "Added new vendor bank account details", "deviation": "Operations staff should not modify vendor master data"}'::jsonb),
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'file_access', 'logical', now() - interval '8 hours', 'Office Network', 'WS-OPS-045', '10.0.15.92', 'Direct Invoice Submission', 'accounts.payable@company.com', 'success', 74, '{"attachment_count": 2, "attachment_names": ["Invoice_VND-4892.pdf", "W9_NewVendor.pdf"], "deviation": "First time submitting vendor invoices directly"}'::jsonb),
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'login', 'logical', now() - interval '14 hours', 'VPN - Home', 'Personal Device', '24.56.112.78', 'VPN After Hours', 'Corporate VPN', 'success', 65, '{"auth_method": "MFA-Push", "time": "23:42", "after_hours": true, "session_duration_min": 128, "unusual": "Weekend late-night access"}'::jsonb),
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'llm_interaction', 'logical', now() - interval '13 hours', 'VPN - Home', 'Personal Device', '24.56.112.78', 'LLM Approval Bypass Query', 'ChatGPT Enterprise', 'flagged', 71, '{"prompt_category": "financial_manipulation", "tokens": 1800, "model": "gpt-4", "llm_analysis": "Queried procurement approval thresholds and segregation of duties bypass techniques.", "policy_violations": ["FRAUD_INDICATOR_QUERY"]}'::jsonb),

-- =====================================================
-- SRIDHAR PALADUGU - Architecture & Credential Exposure
-- user_profile_id: 19d39cf3-3ade-4feb-9889-550b29565a62
-- =====================================================
('19d39cf3-3ade-4feb-9889-550b29565a62', 'llm_interaction', 'logical', now() - interval '6 hours', 'Office Network', 'WS-ENG-018', '10.0.30.55', 'LLM Architecture Leak', 'ChatGPT Enterprise', 'flagged', 78, '{"prompt_category": "architecture_leak", "tokens": 12000, "model": "gpt-4", "llm_analysis": "Uploaded complete microservices architecture diagram including internal API endpoints and security boundaries.", "policy_violations": ["ARCHITECTURE_DIAGRAM_EXPOSURE", "INTERNAL_TOPOLOGY_LEAK"]}'::jsonb),
('19d39cf3-3ade-4feb-9889-550b29565a62', 'llm_interaction', 'logical', now() - interval '5 hours', 'Office Network', 'WS-ENG-018', '10.0.30.55', 'LLM Cloud Key Exposure', 'GitHub Copilot', 'flagged', 84, '{"prompt_category": "credential_exposure", "tokens": 4500, "model": "copilot", "llm_analysis": "Terraform files with AWS, Azure, GCP, and Databricks credentials in Copilot context. 4 cloud credentials exposed.", "policy_violations": ["CLOUD_CREDENTIAL_EXPOSURE"], "credentials_found": ["AWS_ACCESS_KEY_ID", "AZURE_CLIENT_SECRET", "GCP_SERVICE_ACCOUNT_KEY", "DATABRICKS_TOKEN"]}'::jsonb),
('19d39cf3-3ade-4feb-9889-550b29565a62', 'file_access', 'logical', now() - interval '4 hours', 'Office Network', 'WS-ENG-018', '10.0.30.55', 'Bulk Terraform Access', '/shares/engineering/infrastructure/terraform-prod', 'success', 68, '{"bytes": 45000000, "file_count": 128, "file_types": [".tf", ".tfvars", ".json"], "deviation": "Bulk access to production Terraform state files"}'::jsonb),

-- =====================================================
-- MATT HARRIS - CI/CD Pipeline Tampering
-- user_profile_id: 8bb87049-e03e-4777-8548-f6408046c620
-- =====================================================
('8bb87049-e03e-4777-8548-f6408046c620', 'llm_interaction', 'logical', now() - interval '8 hours', 'Office Network', 'WS-DEV-022', '10.0.35.98', 'LLM Security Bypass Plan', 'ChatGPT Enterprise', 'flagged', 73, '{"prompt_category": "pipeline_manipulation", "tokens": 3800, "model": "gpt-4", "llm_analysis": "Asked how to modify Jenkins pipeline to skip security scanning for faster deploys.", "policy_violations": ["SECURITY_CONTROL_BYPASS"]}'::jsonb),
('8bb87049-e03e-4777-8548-f6408046c620', 'file_access', 'logical', now() - interval '7 hours', 'Office Network', 'WS-DEV-022', '10.0.35.98', 'Pipeline Config Change', 'jenkins/pipelines/prod-deploy.groovy', 'success', 79, '{"changes": "Removed SAST scan, disabled container scanning, added --no-verify", "commit_msg": "Speed up deploys", "bypassed_review": true}'::jsonb),
('8bb87049-e03e-4777-8548-f6408046c620', 'login', 'logical', now() - interval '6 hours', 'Office Network', 'WS-DEV-022', '10.0.35.98', 'Container Escape Attempt', 'k8s-node-prod-04', 'denied', 91, '{"namespace": "production", "pod": "api-gateway-7b4f9c", "technique": "hostPath mount /var/run/docker.sock", "blocked_by": "OPA Gatekeeper", "ttps": ["T1611"]}'::jsonb),

-- =====================================================
-- KEEGAN DUBBS - Security Tool Misuse
-- user_profile_id: 9cd6147c-b2e9-4c85-ac4e-25d6a3601da2
-- =====================================================
('9cd6147c-b2e9-4c85-ac4e-25d6a3601da2', 'llm_interaction', 'logical', now() - interval '12 hours', 'Office Network', 'WS-SEC-015', '10.0.50.78', 'LLM IDS Bypass Research', 'ChatGPT Enterprise', 'flagged', 69, '{"prompt_category": "evasion_research", "tokens": 2400, "model": "gpt-4", "llm_analysis": "Researched IDS signature bypass techniques via LLM. No authorized red team engagement found.", "policy_violations": ["UNAUTHORIZED_OFFENSIVE_RESEARCH"]}'::jsonb),
('9cd6147c-b2e9-4c85-ac4e-25d6a3601da2', 'login', 'logical', now() - interval '11 hours', 'Office Network', 'WS-SEC-015', '10.0.50.78', 'Unauthorized Port Scan', '10.0.0.0/16 (Production)', 'detected', 75, '{"scanner": "nmap", "ports_scanned": 65535, "hosts_scanned": 254, "scan_type": "SYN stealth scan", "authorization": "None found"}'::jsonb),
('9cd6147c-b2e9-4c85-ac4e-25d6a3601da2', 'file_access', 'logical', now() - interval '10 hours', 'Office Network', 'WS-SEC-015', '10.0.50.78', 'Bulk Vuln Report Download', '/shares/security/vulnerability_reports/2025', 'success', 62, '{"bytes": 35000000, "file_count": 24, "deviation": "Downloaded all vuln reports at once"}'::jsonb),

-- =====================================================
-- TRISTEN WENTLING - Shadow IT
-- user_profile_id: f82da72a-db48-46de-97ca-df4e5da65db5
-- =====================================================
('f82da72a-db48-46de-97ca-df4e5da65db5', 'login', 'logical', now() - interval '18 hours', 'Office Network', 'WS-IT-008', '10.0.20.44', 'Unapproved SaaS Registration', 'notion.so', 'detected', 64, '{"action": "Created workspace with corporate email", "approved_saas": false, "data_uploaded": true}'::jsonb),
('f82da72a-db48-46de-97ca-df4e5da65db5', 'llm_interaction', 'logical', now() - interval '16 hours', 'Office Network', 'WS-IT-008', '10.0.20.44', 'LLM VPN Tunnel Research', 'ChatGPT Enterprise', 'flagged', 58, '{"prompt_category": "infrastructure", "tokens": 2200, "model": "gpt-4", "llm_analysis": "Asked about personal VPN tunnel from corporate to home network to bypass monitoring.", "policy_violations": ["NETWORK_CONTROL_BYPASS_PLANNING"]}'::jsonb),
('f82da72a-db48-46de-97ca-df4e5da65db5', 'login', 'logical', now() - interval '15 hours', 'Office Network', 'WS-IT-008', '10.0.20.44', 'Unauthorized Container Deploy', 'srv-monitoring-02', 'success', 55, '{"command": "docker run -d --network host custom-agent", "image_source": "dockerhub (not internal registry)", "security_scan": "Not performed"}'::jsonb),

-- =====================================================
-- ROBERT JOHNSON - After-Hours Data Access
-- user_profile_id: 09e34c68-d016-4094-840b-c1ca7adf92b3
-- =====================================================
('09e34c68-d016-4094-840b-c1ca7adf92b3', 'login', 'logical', now() - interval '20 hours', 'VPN - Home', 'Personal Laptop', '68.47.233.91', 'VPN Login 1:23 AM', 'Corporate VPN', 'success', 52, '{"auth_method": "MFA-TOTP", "time": "01:23 AM", "after_hours": true, "session_duration_min": 215}'::jsonb),
('09e34c68-d016-4094-840b-c1ca7adf92b3', 'file_access', 'logical', now() - interval '19 hours', 'VPN - Home', 'Personal Laptop', '68.47.233.91', 'Cross-Table Payment Query', 'PROD-APP-DB', 'success', 67, '{"query_type": "JOIN across 5 tables", "rows_returned": 180000, "tables": ["orders", "customers", "payments", "refunds", "shipping"], "deviation": "Payment data access at 2 AM"}'::jsonb),
('09e34c68-d016-4094-840b-c1ca7adf92b3', 'llm_interaction', 'logical', now() - interval '18 hours', 'VPN - Home', 'Personal Laptop', '68.47.233.91', 'LLM Bulk PII Analysis', 'ChatGPT Enterprise', 'flagged', 61, '{"prompt_category": "data_analysis", "tokens": 3100, "model": "gpt-4", "llm_analysis": "Pasted 6,200 customer payment records into LLM. PII includes names, partial card numbers, billing addresses.", "policy_violations": ["BULK_PII_IN_PROMPT", "CUSTOMER_DATA_EXPOSURE"]}'::jsonb),

-- =====================================================
-- LOW RISK USERS - Minor anomalies
-- =====================================================
('7453a031-53e1-4d55-96c5-fa9fd269283d', 'llm_interaction', 'logical', now() - interval '24 hours', 'Office Network', 'WS-DEV-030', '10.0.30.112', 'LLM Competitor Reverse Eng', 'GitHub Copilot', 'flagged', 55, '{"prompt_category": "code_review", "tokens": 6800, "model": "copilot", "llm_analysis": "Pasted competitor API docs into Copilot to reverse-engineer the API.", "policy_violations": ["COMPETITOR_IP_ANALYSIS"]}'::jsonb),
('7453a031-53e1-4d55-96c5-fa9fd269283d', 'file_access', 'logical', now() - interval '22 hours', 'Office Network', 'WS-DEV-030', '10.0.30.112', 'Restricted File Access', '/shares/legal/contracts/competitors', 'denied', 48, '{"reason": "Insufficient clearance", "deviation": "Engineering accessing legal contracts"}'::jsonb),
('454bb639-c9dc-472d-88de-215bbe9abd76', 'llm_interaction', 'logical', now() - interval '28 hours', 'Office Network', 'WS-SALES-011', '10.0.18.55', 'LLM Client Data in Prompt', 'ChatGPT Enterprise', 'flagged', 38, '{"prompt_category": "customer_data", "tokens": 1400, "model": "gpt-4", "llm_analysis": "Included client names and deal values in prompt for proposal generation.", "policy_violations": ["MINOR_PII_IN_PROMPT"]}'::jsonb),
('454bb639-c9dc-472d-88de-215bbe9abd76', 'login', 'logical', now() - interval '26 hours', 'Airport WiFi', 'Corporate Laptop', '38.140.56.12', 'Public WiFi Login', 'Salesforce CRM', 'success', 32, '{"auth_method": "SSO", "geo_location": "DFW Airport, TX", "public_wifi": true, "deviation": "Public WiFi without VPN"}'::jsonb),
('c2151288-9835-4d1f-9dde-71759e6f573c', 'llm_interaction', 'logical', now() - interval '30 hours', 'Office Network', 'WS-HR-006', '10.0.16.33', 'LLM Employee Data Leak', 'ChatGPT Enterprise', 'flagged', 42, '{"prompt_category": "employee_data", "tokens": 2100, "model": "gpt-4", "llm_analysis": "Pasted employee performance data with names, salaries, and review scores into LLM.", "policy_violations": ["EMPLOYEE_PII_IN_PROMPT", "SALARY_DATA_EXPOSURE"]}'::jsonb),
('f9636957-6b7e-42f8-9239-11d0244c4014', 'llm_interaction', 'logical', now() - interval '32 hours', 'Office Network', 'WS-DEV-044', '10.0.30.89', 'LLM Hardcoded Creds', 'GitHub Copilot', 'flagged', 28, '{"prompt_category": "code_assistance", "tokens": 950, "model": "copilot", "llm_analysis": "Generated SQL with inline credentials. Minor security practice violation.", "policy_violations": ["HARDCODED_CREDENTIALS"]}'::jsonb);


-- =====================================================
-- USER RISK ASSESSMENTS
-- =====================================================
INSERT INTO user_risk_assessments (user_profile_id, assessment_time, risk_score, risk_level, risk_factors, correlated_events, recommendations, auto_generated) VALUES
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', now() - interval '30 minutes', 95.0, 'critical',
  '[{"factor": "LLM used to prepare financial data exfiltration (PII in prompts)", "weight": 30}, {"factor": "Bulk download of 847 confidential financial files (42x baseline)", "weight": 25}, {"factor": "Attempted upload to personal Google Drive (blocked by DLP)", "weight": 20}, {"factor": "USB data copy while DLP agent offline", "weight": 15}, {"factor": "VPN login from impossible travel location (NY to Sao Paulo)", "weight": 10}]'::jsonb,
  '{}', '{}', true),
('d4baae05-596c-4fd3-b616-4967981aecbb', now() - interval '1 hour', 88.5, 'critical',
  '[{"factor": "LLM jailbreak attempts targeting credential dumping techniques", "weight": 25}, {"factor": "Unauthorized self-promotion to Domain Admins group", "weight": 25}, {"factor": "Active C2 beaconing over DNS-over-HTTPS detected", "weight": 20}, {"factor": "Lateral movement via PsExec to domain controllers", "weight": 15}, {"factor": "LLM used to research anti-forensic log tampering", "weight": 15}]'::jsonb,
  '{}', '{}', true),
('0d7c7328-ece3-480d-87f0-64f5ec396817', now() - interval '3 hours', 78.2, 'high',
  '[{"factor": "Proprietary trading algorithm leaked to GitHub Copilot", "weight": 25}, {"factor": "GitHub PAT and AWS keys exposed in LLM prompt", "weight": 20}, {"factor": "Unauthorized production database dump at 2 AM (1.2GB)", "weight": 20}, {"factor": "Attempted code upload to Pastebin (blocked)", "weight": 15}, {"factor": "Cloned repos outside normal access pattern", "weight": 10}]'::jsonb,
  '{}', '{}', true),
('8832e8ca-6363-4e8e-a370-318178b1ebaf', now() - interval '4 hours', 72.5, 'high',
  '[{"factor": "Database backup to non-standard /tmp location", "weight": 20}, {"factor": "LLM used to plan encrypted data exfiltration", "weight": 20}, {"factor": "Attempted SCP transfer of 48GB to external Linode server", "weight": 25}, {"factor": "Created unauthorized wildcard DB account", "weight": 15}, {"factor": "LLM queries about audit log manipulation", "weight": 20}]'::jsonb,
  '{}', '{}', true),
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', now() - interval '6 hours', 68.8, 'high',
  '[{"factor": "LLM used to generate fraudulent vendor invoice template", "weight": 25}, {"factor": "Unauthorized modification of vendor master bank details", "weight": 25}, {"factor": "Direct invoice submission bypassing normal workflow", "weight": 15}, {"factor": "Late-night weekend VPN access researching approval thresholds", "weight": 15}, {"factor": "LLM queries about segregation of duties bypass", "weight": 20}]'::jsonb,
  '{}', '{}', true),
('19d39cf3-3ade-4feb-9889-550b29565a62', now() - interval '3 hours', 64.3, 'medium',
  '[{"factor": "Full microservices architecture diagram uploaded to LLM", "weight": 25}, {"factor": "4 cloud credentials (AWS/Azure/GCP/Databricks) exposed in Copilot", "weight": 35}, {"factor": "Bulk access to production Terraform state files", "weight": 20}]'::jsonb,
  '{}', '{}', true),
('8bb87049-e03e-4777-8548-f6408046c620', now() - interval '5 hours', 56.7, 'medium',
  '[{"factor": "LLM used to plan security scan bypass in CI/CD pipeline", "weight": 20}, {"factor": "Removed SAST and container scanning from prod pipeline", "weight": 25}, {"factor": "Container escape attempt blocked by OPA Gatekeeper", "weight": 30}]'::jsonb,
  '{}', '{}', true),
('9cd6147c-b2e9-4c85-ac4e-25d6a3601da2', now() - interval '8 hours', 52.1, 'medium',
  '[{"factor": "Unauthorized IDS bypass research via LLM", "weight": 20}, {"factor": "Full port scan of production subnet without authorization", "weight": 30}, {"factor": "Bulk download of vulnerability reports", "weight": 15}]'::jsonb,
  '{}', '{}', true),
('f82da72a-db48-46de-97ca-df4e5da65db5', now() - interval '12 hours', 48.4, 'medium',
  '[{"factor": "Registered corporate email on unapproved SaaS (Notion)", "weight": 20}, {"factor": "LLM queries about personal VPN tunneling from corp network", "weight": 20}, {"factor": "Deployed unauthorized Docker container on monitoring server", "weight": 25}]'::jsonb,
  '{}', '{}', true),
('454bb639-c9dc-472d-88de-215bbe9abd76', now() - interval '20 hours', 29.8, 'low',
  '[{"factor": "Client deal values included in LLM prompts", "weight": 15}, {"factor": "CRM access from public WiFi without VPN", "weight": 15}]'::jsonb,
  '{}', '{}', true),
('c2151288-9835-4d1f-9dde-71759e6f573c', now() - interval '24 hours', 26.2, 'low',
  '[{"factor": "Employee salary and performance data pasted into LLM", "weight": 25}]'::jsonb,
  '{}', '{}', true),
('f9636957-6b7e-42f8-9239-11d0244c4014', now() - interval '26 hours', 22.7, 'low',
  '[{"factor": "Hardcoded credentials in Copilot-generated SQL", "weight": 15}]'::jsonb,
  '{}', '{}', true),
('7453a031-53e1-4d55-96c5-fa9fd269283d', now() - interval '18 hours', 42.3, 'medium',
  '[{"factor": "Competitor API reverse-engineering via Copilot", "weight": 20}, {"factor": "Attempted access to restricted legal contracts", "weight": 20}]'::jsonb,
  '{}', '{}', true);


-- =====================================================
-- BEHAVIOR CORRELATIONS
-- =====================================================
INSERT INTO behavior_correlations (user_profile_id, correlation_type, correlation_score, description, severity, detected_at) VALUES
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'llm_data_exfiltration_chain', 94.2,
  'LLM used to reformat financial data for export, followed by 847-file bulk download, blocked cloud upload, then successful USB copy while DLP was offline. Classic exfiltration kill chain assisted by AI.',
  'critical', now() - interval '1 hour'),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'impossible_travel', 88.5,
  'VPN login from Sao Paulo, Brazil within 45 minutes of physical badge scan in New York office. Credential compromise or account sharing detected.',
  'critical', now() - interval '40 minutes'),
('6cc820b1-ea37-4fbd-b01a-3bdca404c5de', 'llm_evasion_pattern', 86.0,
  'After DLP blocked cloud upload, user immediately asked LLM about base64 encoding to bypass content inspection. Demonstrates adaptive evasion behavior.',
  'high', now() - interval '1 hour 20 minutes'),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'llm_credential_harvesting', 96.8,
  'LLM jailbreak to extract credential dumping techniques, followed by self-elevation to Domain Admins, then lateral movement to DCs using service account. Full attack chain detected.',
  'critical', now() - interval '2 hours'),
('d4baae05-596c-4fd3-b616-4967981aecbb', 'c2_with_anti_forensics', 93.1,
  'Active C2 beaconing detected over DoH, combined with LLM queries about disabling Windows event logging. Attacker attempting to establish persistence while covering tracks.',
  'critical', now() - interval '1 hour 30 minutes'),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'ip_theft_via_llm', 85.7,
  'Proprietary trading algorithm pasted into Copilot, combined with unauthorized repo cloning and attempted upload to Pastebin. Systematic IP exfiltration pattern.',
  'high', now() - interval '4 hours'),
('0d7c7328-ece3-480d-87f0-64f5ec396817', 'credential_chain_exposure', 82.3,
  'GitHub PAT and AWS secret key exposed in LLM prompt, followed by 2 AM production database dump (1.2GB). Credentials may have been used for unauthorized access.',
  'high', now() - interval '10 hours'),
('8832e8ca-6363-4e8e-a370-318178b1ebaf', 'dba_exfiltration_prep', 89.4,
  'Non-standard backup to /tmp, LLM queries about encryption for external transfer, attempted SCP to Linode, wildcard account creation. Complete DBA data theft preparation.',
  'critical', now() - interval '5 hours'),
('f91a68ed-58fa-4ed8-8bd2-c8a8a0a6dc9c', 'vendor_fraud_pattern', 79.6,
  'LLM-generated invoice template, unauthorized vendor master modification, direct AP submission, combined with after-hours approval threshold research. Vendor fraud pattern.',
  'high', now() - interval '7 hours'),
('19d39cf3-3ade-4feb-9889-550b29565a62', 'mass_credential_leak', 84.2,
  'Four distinct cloud provider credentials (AWS, Azure, GCP, Databricks) exposed in single Copilot session alongside full architecture diagrams. Critical exposure surface.',
  'high', now() - interval '4 hours'),
('8bb87049-e03e-4777-8548-f6408046c620', 'pipeline_sabotage_pattern', 77.3,
  'LLM-planned security bypass, pipeline modification removing SAST/container scanning, followed by container escape attempt. Supply chain security compromise pattern.',
  'high', now() - interval '5 hours'),
('9cd6147c-b2e9-4c85-ac4e-25d6a3601da2', 'unauthorized_offensive_ops', 72.1,
  'IDS bypass research via LLM followed by unauthorized stealth port scan of production subnet. Security analyst conducting offensive operations without authorization.',
  'medium', now() - interval '9 hours'),
('f82da72a-db48-46de-97ca-df4e5da65db5', 'shadow_it_deployment', 62.8,
  'Unauthorized SaaS registration, VPN tunneling research, and deployment of unscanned Docker container from public registry. Shadow IT and monitoring bypass pattern.',
  'medium', now() - interval '14 hours');
