/*
  # Populate Cases System with Mock Data

  This migration adds realistic security incident cases with comments and timeline events.

  ## Data Included
  - 15 diverse security cases (ransomware, phishing, data breaches, DDoS, malware, etc.)
  - Multiple comments per case showing investigation progress
  - Complete timeline events for audit trail
  - Various status levels: new, investigating, contained, resolved, closed
  - Different priority and severity combinations
*/

-- Insert realistic security cases
INSERT INTO cases (
  case_number, title, description, status, priority, severity, category,
  assigned_to, created_by, resolution, tags, created_at, updated_at
) VALUES
  (
    'CASE-2025-0001',
    'Ransomware Infection on File Server',
    'Critical ransomware variant detected on primary file server FS-PROD-01. Multiple file extensions encrypted (.locked). Immediate containment required.',
    'investigating',
    'critical',
    'critical',
    'ransomware',
    'SOC Team Alpha',
    'admin@company.com',
    NULL,
    '["ransomware", "critical-infrastructure", "data-encryption", "incident-response"]'::jsonb,
    NOW() - INTERVAL '3 hours',
    NOW() - INTERVAL '15 minutes'
  ),
  (
    'CASE-2025-0002',
    'Phishing Campaign Targeting Finance Department',
    'Sophisticated spear-phishing campaign detected targeting finance team. 47 emails received with fake invoice attachments. 3 users clicked malicious links.',
    'contained',
    'high',
    'high',
    'phishing',
    'Security Analyst - John Smith',
    'soc@company.com',
    NULL,
    '["phishing", "social-engineering", "finance", "credential-theft"]'::jsonb,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '1 hour'
  ),
  (
    'CASE-2025-0003',
    'Unauthorized Access to Customer Database',
    'Anomalous database queries detected from internal IP 192.168.50.142. User accessed 50,000+ customer records outside normal working hours.',
    'resolved',
    'critical',
    'high',
    'data_breach',
    'SOC Team Beta',
    'ids@company.com',
    'Investigation confirmed unauthorized access by contractor account. Account disabled, password reset enforced, full audit completed. No data exfiltration detected.',
    '["data-breach", "insider-threat", "database", "pii"]'::jsonb,
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '1 day'
  ),
  (
    'CASE-2025-0004',
    'DDoS Attack on Public Web Services',
    'Large-scale DDoS attack detected against company website and API endpoints. Traffic volume increased 1200% from baseline. Multiple source IPs across 45 countries.',
    'contained',
    'high',
    'medium',
    'ddos',
    'Network Operations',
    'noc@company.com',
    NULL,
    '["ddos", "availability", "network", "botnet"]'::jsonb,
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '30 minutes'
  ),
  (
    'CASE-2025-0005',
    'Malware Detected on Executive Laptop',
    'Advanced persistent threat (APT) malware discovered on CEO laptop during routine scan. Keylogger and backdoor components identified.',
    'investigating',
    'critical',
    'critical',
    'malware',
    'Incident Response Team',
    'edr@company.com',
    NULL,
    '["malware", "apt", "executive", "data-exfiltration", "keylogger"]'::jsonb,
    NOW() - INTERVAL '8 hours',
    NOW() - INTERVAL '10 minutes'
  ),
  (
    'CASE-2025-0006',
    'Multiple Failed Login Attempts - Brute Force',
    'Automated brute force attack detected against VPN gateway. 15,000+ failed authentication attempts from IP 203.0.113.45 in 2-hour window.',
    'resolved',
    'medium',
    'medium',
    'unauthorized_access',
    'Security Analyst - Sarah Chen',
    'soc@company.com',
    'IP address blocked at firewall. No successful authentications detected. Threat actor IP added to global blocklist.',
    '["brute-force", "vpn", "authentication", "blocked"]'::jsonb,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '6 hours'
  ),
  (
    'CASE-2025-0007',
    'Suspicious Outbound Data Transfer',
    'Unusual outbound data transfer detected. Employee workstation transmitted 15GB to external cloud storage service during non-business hours.',
    'investigating',
    'high',
    'high',
    'data_breach',
    'SOC Team Alpha',
    'dlp@company.com',
    NULL,
    '["data-exfiltration", "insider-threat", "dlp", "cloud-storage"]'::jsonb,
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '20 minutes'
  ),
  (
    'CASE-2025-0008',
    'Privilege Escalation Attempt Detected',
    'Security tools detected multiple privilege escalation attempts on Linux server PROD-WEB-03. Attacker attempting to gain root access through kernel exploit.',
    'contained',
    'critical',
    'high',
    'unauthorized_access',
    'SOC Team Beta',
    'hids@company.com',
    NULL,
    '["privilege-escalation", "linux", "exploit", "lateral-movement"]'::jsonb,
    NOW() - INTERVAL '4 hours',
    NOW() - INTERVAL '45 minutes'
  ),
  (
    'CASE-2025-0009',
    'Insider Threat - Policy Violation',
    'Employee detected attempting to bypass DLP controls by photographing sensitive documents with personal phone. Multiple policy violations documented.',
    'investigating',
    'medium',
    'medium',
    'insider_threat',
    'HR Security Team',
    'compliance@company.com',
    NULL,
    '["insider-threat", "policy-violation", "dlp-bypass", "physical-security"]'::jsonb,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '3 hours'
  ),
  (
    'CASE-2025-0010',
    'Zero-Day Exploit Attempt',
    'IDS detected exploitation attempt targeting unpatched vulnerability CVE-2025-XXXX. Multiple attack vectors observed from IP range 198.51.100.0/24.',
    'new',
    'critical',
    'critical',
    'apt',
    NULL,
    'ids@company.com',
    NULL,
    '["zero-day", "cve", "exploit", "apt", "unassigned"]'::jsonb,
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes'
  ),
  (
    'CASE-2025-0011',
    'Cryptocurrency Mining Activity Detected',
    'Unauthorized cryptocurrency mining software discovered on 12 workstations in R&D department. High CPU usage and network traffic to mining pools.',
    'resolved',
    'medium',
    'low',
    'malware',
    'Security Analyst - Mike Torres',
    'edr@company.com',
    'Mining software removed from all affected systems. Vulnerability in software deployment process patched. User awareness training scheduled.',
    '["cryptomining", "malware", "performance", "remediated"]'::jsonb,
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '12 hours'
  ),
  (
    'CASE-2025-0012',
    'Suspicious DNS Queries - C2 Communication',
    'Anomalous DNS queries detected matching known command and control (C2) patterns. Multiple internal hosts querying suspicious domains.',
    'investigating',
    'high',
    'high',
    'malware',
    'Threat Intel Team',
    'dns@company.com',
    NULL,
    '["c2", "dns", "malware", "threat-intel", "ioc"]'::jsonb,
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '25 minutes'
  ),
  (
    'CASE-2025-0013',
    'Compromised Service Account Credentials',
    'Service account credentials discovered in public GitHub repository. Account has elevated privileges to production databases.',
    'contained',
    'critical',
    'high',
    'data_breach',
    'DevSecOps Team',
    'devsecops@company.com',
    NULL,
    '["credential-leak", "github", "secrets-management", "production"]'::jsonb,
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '2 hours'
  ),
  (
    'CASE-2025-0014',
    'Rogue Access Point Detected',
    'Unauthorized wireless access point discovered on corporate network. Device configured with weak encryption and SSID mimicking corporate network.',
    'resolved',
    'high',
    'medium',
    'unauthorized_access',
    'Network Security Team',
    'wireless@company.com',
    'Rogue AP physically located and removed from premises. Network scans completed. No client devices connected to rogue AP during active period.',
    '["rogue-ap", "wireless", "physical-security", "evil-twin"]'::jsonb,
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '2 days'
  ),
  (
    'CASE-2025-0015',
    'SQL Injection Attempt on Web Application',
    'WAF detected multiple SQL injection attempts against customer portal login form. Attack patterns suggest automated scanning tool.',
    'closed',
    'medium',
    'low',
    'unauthorized_access',
    'AppSec Team',
    'waf@company.com',
    'All SQL injection attempts blocked by WAF. Application code reviewed and found to be using parameterized queries. No vulnerabilities identified. Attack IP blocked.',
    '["sql-injection", "waf", "web-app", "blocked", "no-impact"]'::jsonb,
    NOW() - INTERVAL '7 days',
    NOW() - INTERVAL '5 days'
  )
ON CONFLICT (case_number) DO NOTHING;

-- Insert case comments
INSERT INTO case_comments (case_id, author, comment, is_internal, created_at)
SELECT 
  c.id,
  'SOC Team Alpha',
  'Initial triage completed. Ransomware variant identified as BlackCat/ALPHV. File server isolated from network. Backup integrity check in progress.',
  false,
  NOW() - INTERVAL '2 hours 45 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0001'

UNION ALL

SELECT 
  c.id,
  'Incident Commander',
  '[INTERNAL] Contacted cyber insurance provider. Legal team notified. Do not discuss externally until comms plan approved.',
  true,
  NOW() - INTERVAL '2 hours 30 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0001'

UNION ALL

SELECT 
  c.id,
  'Security Analyst - John Smith',
  'All malicious emails quarantined. Password resets enforced for users who clicked links. Conducting forensic analysis on one compromised workstation.',
  false,
  NOW() - INTERVAL '1 day 22 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0002'

UNION ALL

SELECT 
  c.id,
  'Security Analyst - John Smith',
  'Phishing infrastructure taken down in cooperation with hosting provider. No credential compromise detected. Closing case after 48-hour monitoring period.',
  false,
  NOW() - INTERVAL '1 hour 15 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0002'

UNION ALL

SELECT 
  c.id,
  'SOC Team Beta',
  'Database access logs exported. Contractor had valid credentials but accessed data outside scope of work. HR and Legal involved for investigation.',
  false,
  NOW() - INTERVAL '4 days 20 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0003'

UNION ALL

SELECT 
  c.id,
  'Forensics Team',
  'Complete forensic analysis completed. No evidence of data exfiltration. All accessed records logged. Contractor account terminated. Implemented additional access controls.',
  false,
  NOW() - INTERVAL '1 day 6 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0003'

UNION ALL

SELECT 
  c.id,
  'Network Operations',
  'DDoS mitigation activated. Traffic routed through scrubbing center. Services restored to normal operation. Attack appears to be subsiding.',
  false,
  NOW() - INTERVAL '11 hours 45 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0004'

UNION ALL

SELECT 
  c.id,
  'Incident Response Team',
  'Laptop secured and removed from network. Forensic image created. Malware samples sent to threat intel team for analysis. CEO provided clean replacement device.',
  false,
  NOW() - INTERVAL '7 hours 50 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0005'

UNION ALL

SELECT 
  c.id,
  'Threat Intel Team',
  '[INTERNAL] Malware matches known APT29 (Cozy Bear) tools. Possible nation-state actor. FBI notification required. Full network sweep initiated.',
  true,
  NOW() - INTERVAL '7 hours 15 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0005'

UNION ALL

SELECT 
  c.id,
  'SOC Team Alpha',
  'Data transfer investigation ongoing. Employee claims legitimate work backup. Reviewing file contents and metadata. DLP policy review recommended.',
  false,
  NOW() - INTERVAL '5 hours 45 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0007'

UNION ALL

SELECT 
  c.id,
  'SOC Team Beta',
  'Server isolated and patched. Attack attempts ceased. No evidence of successful root access. Vulnerability scanner updated to detect this exploit.',
  false,
  NOW() - INTERVAL '4 hours 10 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0008'

UNION ALL

SELECT 
  c.id,
  'Threat Intel Team',
  'C2 domains added to blocklist. Identified 5 infected hosts. EDR deployed remediation across all systems. Root cause analysis points to malicious email attachment.',
  false,
  NOW() - INTERVAL '4 hours 50 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0012'

UNION ALL

SELECT 
  c.id,
  'DevSecOps Team',
  'Credentials immediately rotated. GitHub repository access revoked. Implementing automated secrets scanning in CI/CD pipeline. No unauthorized database access detected in logs.',
  false,
  NOW() - INTERVAL '23 hours 30 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0013';

-- Insert timeline events
INSERT INTO case_timeline (case_id, event_type, description, actor, metadata, created_at)
SELECT 
  c.id,
  'created',
  'Case created from automated alert',
  'admin@company.com',
  '{"source": "EDR Alert", "alert_id": "ALR-2025-89234"}'::jsonb,
  NOW() - INTERVAL '3 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0001'

UNION ALL

SELECT 
  c.id,
  'status_changed',
  'Status changed from new to investigating',
  'admin@company.com',
  '{"old_status": "new", "new_status": "investigating"}'::jsonb,
  NOW() - INTERVAL '2 hours 55 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0001'

UNION ALL

SELECT 
  c.id,
  'assigned',
  'Case assigned to SOC Team Alpha',
  'admin@company.com',
  '{"assigned_to": "SOC Team Alpha"}'::jsonb,
  NOW() - INTERVAL '2 hours 55 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0001'

UNION ALL

SELECT 
  c.id,
  'priority_changed',
  'Priority escalated to critical',
  'SOC Team Alpha',
  '{"old_priority": "high", "new_priority": "critical"}'::jsonb,
  NOW() - INTERVAL '2 hours 50 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0001'

UNION ALL

SELECT 
  c.id,
  'created',
  'Case created from email security alert',
  'soc@company.com',
  '{"source": "Email Gateway", "campaign_id": "PHISH-2025-442"}'::jsonb,
  NOW() - INTERVAL '2 days'
FROM cases c WHERE c.case_number = 'CASE-2025-0002'

UNION ALL

SELECT 
  c.id,
  'status_changed',
  'Status changed from investigating to contained',
  'Security Analyst - John Smith',
  '{"old_status": "investigating", "new_status": "contained"}'::jsonb,
  NOW() - INTERVAL '1 day 20 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0002'

UNION ALL

SELECT 
  c.id,
  'created',
  'Case created from DLP policy violation',
  'ids@company.com',
  '{"source": "Database Monitoring", "query_count": 50247}'::jsonb,
  NOW() - INTERVAL '5 days'
FROM cases c WHERE c.case_number = 'CASE-2025-0003'

UNION ALL

SELECT 
  c.id,
  'status_changed',
  'Status changed from investigating to resolved',
  'SOC Team Beta',
  '{"old_status": "investigating", "new_status": "resolved"}'::jsonb,
  NOW() - INTERVAL '1 day 8 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0003'

UNION ALL

SELECT 
  c.id,
  'resolution_added',
  'Case resolved with full documentation',
  'SOC Team Beta',
  '{"resolution_time_hours": 96}'::jsonb,
  NOW() - INTERVAL '1 day 8 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0003'

UNION ALL

SELECT 
  c.id,
  'created',
  'Case created from network monitoring alert',
  'noc@company.com',
  '{"source": "DDoS Detection", "traffic_increase": "1200%"}'::jsonb,
  NOW() - INTERVAL '12 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0004'

UNION ALL

SELECT 
  c.id,
  'status_changed',
  'Status changed from new to contained',
  'Network Operations',
  '{"old_status": "new", "new_status": "contained"}'::jsonb,
  NOW() - INTERVAL '11 hours 50 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0004'

UNION ALL

SELECT 
  c.id,
  'created',
  'Case created from EDR detection',
  'edr@company.com',
  '{"source": "CrowdStrike", "detection_name": "APT.Malware.Keylogger"}'::jsonb,
  NOW() - INTERVAL '8 hours'
FROM cases c WHERE c.case_number = 'CASE-2025-0005'

UNION ALL

SELECT 
  c.id,
  'priority_changed',
  'Priority escalated due to executive involvement',
  'Incident Response Team',
  '{"old_priority": "high", "new_priority": "critical", "reason": "executive_device"}'::jsonb,
  NOW() - INTERVAL '7 hours 55 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0005'

UNION ALL

SELECT 
  c.id,
  'created',
  'Case created from automated detection',
  'soc@company.com',
  '{"source": "VPN Gateway Logs", "failed_attempts": 15234}'::jsonb,
  NOW() - INTERVAL '1 day'
FROM cases c WHERE c.case_number = 'CASE-2025-0006'

UNION ALL

SELECT 
  c.id,
  'status_changed',
  'Status changed from investigating to resolved',
  'Security Analyst - Sarah Chen',
  '{"old_status": "investigating", "new_status": "resolved"}'::jsonb,
  NOW() - INTERVAL '6 hours 15 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0006'

UNION ALL

SELECT 
  c.id,
  'created',
  'Case created from zero-day detection system',
  'ids@company.com',
  '{"source": "IDS Signature", "cve": "CVE-2025-XXXX"}'::jsonb,
  NOW() - INTERVAL '30 minutes'
FROM cases c WHERE c.case_number = 'CASE-2025-0010';
