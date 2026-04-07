/*
  # Creative n8n InfoSec Workflow Automations

  1. New Workflows Added
    - Automated Phishing Response - Email analysis, user training, domain blocking
    - Insider Threat Detection - UEBA correlation, HR integration, evidence collection
    - Ransomware Kill Chain - File monitoring, process isolation, network segmentation
    - Zero-Day Vulnerability Response - Threat intel aggregation, patch deployment
    - Supply Chain Attack Detection - Dependency scanning, vendor monitoring
    - Credential Stuffing Defense - Password reset, MFA enforcement, session termination
    - Data Exfiltration Prevention - DLP triggers, bandwidth analysis, cloud monitoring
    - Compromised Certificate Response - Certificate revocation, rotation automation
    - APT Detection & Response - Behavioral analysis, threat hunting, IOC enrichment
    - Cloud Misconfig Remediation - AWS/Azure/GCP security auditing and auto-fix
    - Container Security Workflow - Image scanning, runtime protection, pod isolation
    - Compliance Violation Response - Policy enforcement, evidence preservation, reporting
    - Threat Intel Enrichment - OSINT gathering, reputation checks, context building
    - Security Alert Triage - ML-based classification, priority scoring, analyst assignment
    - Incident Communication - Stakeholder notification, status updates, war room creation

  2. Features
    - Multi-stage workflows with conditional branching
    - Integration with SIEM, EDR, SOAR, ticketing systems
    - Automated evidence collection and chain of custody
    - Rollback capabilities for reversible actions
    - Compliance reporting and audit trail generation

  3. Trigger Types
    - Real-time alert correlation
    - Behavioral anomaly detection
    - Scheduled threat hunting
    - Manual analyst initiation
    - External webhook events
*/

-- Automated Phishing Response Workflow
INSERT INTO n8n_workflows (name, description, n8n_webhook_url, workflow_type, configuration) VALUES
(
  'Automated Phishing Response',
  'Detects phishing emails, analyzes threats, blocks domains, quarantines messages, notifies users with training, and creates incident tickets',
  'https://n8n.company.local/webhook/phishing-response',
  'response',
  '{
    "steps": [
      "Extract email headers and body",
      "Analyze URLs with VirusTotal & URLScan",
      "Check sender reputation (SPF/DKIM/DMARC)",
      "Quarantine email if malicious",
      "Block sender domain in email gateway",
      "Send phishing awareness training to recipient",
      "Create Jira ticket with IOCs",
      "Log to SIEM with enriched context"
    ],
    "integrations": ["Office365", "VirusTotal", "URLScan", "Proofpoint", "KnowBe4", "Jira"],
    "severity_threshold": "medium",
    "auto_block": true
  }'::jsonb
),
(
  'Insider Threat Detection & Response',
  'Correlates abnormal user behavior, HR data, and access patterns to detect insider threats with automated investigation',
  'https://n8n.company.local/webhook/insider-threat',
  'investigation',
  '{
    "steps": [
      "Correlate UEBA anomalies with HR events (termination, demotion)",
      "Analyze data access patterns and volume",
      "Check for USB/cloud uploads and printing activity",
      "Cross-reference with badge access and travel logs",
      "Collect evidence (emails, file access, screenshots)",
      "Notify HR and legal teams",
      "Initiate privileged account review",
      "Create forensic preservation snapshot"
    ],
    "integrations": ["UEBA", "DLP", "HR_System", "Badge_Access", "Forensics_Tool"],
    "risk_score_threshold": 85,
    "evidence_retention_days": 2555
  }'::jsonb
),
(
  'Ransomware Kill Chain Breaker',
  'Real-time ransomware detection with automated containment: process kill, network isolation, backup restoration',
  'https://n8n.company.local/webhook/ransomware-response',
  'remediation',
  '{
    "steps": [
      "Detect ransomware signatures (file encryption, ransom notes)",
      "Identify patient zero and lateral movement",
      "Isolate infected hosts from network immediately",
      "Kill malicious processes via EDR",
      "Block C2 domains at firewall and DNS",
      "Snapshot infected systems for forensics",
      "Restore from immutable backups",
      "Notify CISO and activate incident response team",
      "Generate ransom negotiation package (if needed)"
    ],
    "integrations": ["CrowdStrike", "Carbon_Black", "Palo_Alto", "Rubrik", "PagerDuty"],
    "auto_isolate": true,
    "backup_restore_auto": false,
    "max_response_time_seconds": 30
  }'::jsonb
),
(
  'Zero-Day Vulnerability Response',
  'Aggregates threat intel on emerging vulnerabilities and automates assessment, patching, and mitigation deployment',
  'https://n8n.company.local/webhook/zero-day-response',
  'remediation',
  '{
    "steps": [
      "Monitor feeds (NVD, CISA KEV, vendor advisories)",
      "Identify affected assets in CMDB",
      "Calculate exploitability and business impact",
      "Deploy virtual patches via WAF/IPS",
      "Schedule emergency patching window",
      "Test patches in staging environment",
      "Deploy patches to production with rollback plan",
      "Verify remediation with vulnerability scans",
      "Generate compliance report"
    ],
    "integrations": ["NVD", "CISA_KEV", "Tenable", "Qualys", "Ansible", "ServiceNow"],
    "cvss_threshold": 7.0,
    "auto_virtual_patch": true,
    "patch_testing_required": true
  }'::jsonb
),
(
  'Supply Chain Attack Detection',
  'Monitors software dependencies, vendor access, and third-party integrations for compromise indicators',
  'https://n8n.company.local/webhook/supply-chain-monitor',
  'investigation',
  '{
    "steps": [
      "Scan package manifests for malicious dependencies",
      "Monitor GitHub commits for suspicious changes",
      "Analyze vendor API access patterns",
      "Check npm/PyPI/Maven packages against threat intel",
      "Detect typosquatting and dependency confusion",
      "Review SBOMs for vulnerable components",
      "Audit third-party OAuth permissions",
      "Notify development and security teams",
      "Quarantine suspicious packages"
    ],
    "integrations": ["Snyk", "GitHub", "Sonatype", "SBOM_Tool", "Vendor_Portal"],
    "scan_frequency": "hourly",
    "auto_block_suspicious": true
  }'::jsonb
),
(
  'Credential Stuffing Defense',
  'Detects credential stuffing attacks and automates password resets, MFA enforcement, and session termination',
  'https://n8n.company.local/webhook/credential-stuffing',
  'response',
  '{
    "steps": [
      "Detect login attempts from compromised credential lists",
      "Identify successful logins with weak passwords",
      "Terminate active sessions immediately",
      "Force password reset with strong password policy",
      "Enforce MFA enrollment",
      "Block attacking IP ranges at CDN/WAF",
      "Check dark web for credential leaks",
      "Notify affected users via email/SMS",
      "Log to user behavior analytics"
    ],
    "integrations": ["Okta", "HaveIBeenPwned", "Cloudflare", "Auth0", "Twilio"],
    "failed_login_threshold": 5,
    "auto_terminate_sessions": true,
    "mfa_enforcement": "mandatory"
  }'::jsonb
),
(
  'Data Exfiltration Prevention',
  'Monitors for large data transfers, suspicious cloud uploads, and DLP violations with automated blocking',
  'https://n8n.company.local/webhook/data-exfiltration',
  'response',
  '{
    "steps": [
      "Detect abnormal data transfer volumes",
      "Identify sensitive data via DLP classification",
      "Block file uploads to unauthorized cloud services",
      "Terminate FTP/SCP sessions with high data volume",
      "Monitor DNS tunneling and covert channels",
      "Analyze network flows for beaconing",
      "Quarantine suspicious files",
      "Notify data owners and compliance team",
      "Generate forensic report with file hashes"
    ],
    "integrations": ["Forcepoint_DLP", "Netskope", "Zeek", "NetFlow_Analyzer"],
    "data_threshold_gb": 10,
    "auto_block": true,
    "sensitive_data_classes": ["PII", "PHI", "PCI", "IP"]
  }'::jsonb
),
(
  'Compromised Certificate Response',
  'Detects compromised SSL/TLS certificates and automates revocation, rotation, and CT log monitoring',
  'https://n8n.company.local/webhook/cert-compromise',
  'remediation',
  '{
    "steps": [
      "Monitor Certificate Transparency logs",
      "Detect unauthorized certificate issuance",
      "Verify certificate ownership via CAA records",
      "Revoke compromised certificates via ACME",
      "Issue new certificates automatically",
      "Update load balancers and CDN",
      "Notify certificate owners",
      "Audit private key security",
      "Generate incident report"
    ],
    "integrations": ["LetsEncrypt", "DigiCert", "Cloudflare", "cert-manager", "CT_Monitor"],
    "auto_rotate": true,
    "rotation_window_hours": 4
  }'::jsonb
),
(
  'APT Detection & Response',
  'Advanced Persistent Threat hunting with behavioral analysis, lateral movement detection, and IOC enrichment',
  'https://n8n.company.local/webhook/apt-detection',
  'investigation',
  '{
    "steps": [
      "Hunt for Living-off-the-Land (LOLBin) techniques",
      "Detect lateral movement via RDP/PSExec/WMI",
      "Analyze memory dumps for injected code",
      "Correlate multi-stage attack patterns",
      "Enrich IOCs with MITRE ATT&CK mapping",
      "Collect EDR telemetry and network flows",
      "Identify C2 infrastructure",
      "Create threat actor profile",
      "Coordinate with threat intelligence team",
      "Generate detailed timeline of attack"
    ],
    "integrations": ["Splunk", "Elastic_SIEM", "Velociraptor", "MITRE_ATT&CK", "Threat_Intel"],
    "hunting_interval_hours": 6,
    "ioc_enrichment": true,
    "attack_chain_correlation": true
  }'::jsonb
),
(
  'Cloud Misconfiguration Remediation',
  'Continuously audits AWS/Azure/GCP for security misconfigurations and auto-remediates via Infrastructure-as-Code',
  'https://n8n.company.local/webhook/cloud-security',
  'remediation',
  '{
    "steps": [
      "Scan cloud resources for CIS Benchmark violations",
      "Detect open S3 buckets and public snapshots",
      "Identify overly permissive IAM policies",
      "Check for unencrypted storage and databases",
      "Audit security group rules and network ACLs",
      "Remediate via Terraform/CloudFormation",
      "Enable CloudTrail and GuardDuty if missing",
      "Notify cloud architects of changes",
      "Generate compliance report (SOC2, HIPAA, PCI)"
    ],
    "integrations": ["AWS_Config", "Azure_Policy", "GCP_Security_Command", "Terraform", "Prisma_Cloud"],
    "auto_remediate": true,
    "compliance_frameworks": ["CIS", "NIST", "SOC2"],
    "rollback_enabled": true
  }'::jsonb
),
(
  'Container Security Workflow',
  'Scans container images, monitors runtime behavior, and isolates compromised pods in Kubernetes',
  'https://n8n.company.local/webhook/container-security',
  'remediation',
  '{
    "steps": [
      "Scan container images for vulnerabilities (Trivy/Clair)",
      "Enforce image signature verification (Cosign)",
      "Detect runtime anomalies (unexpected processes, network)",
      "Monitor for privilege escalation attempts",
      "Isolate compromised pods via NetworkPolicy",
      "Rollback to last known good image",
      "Alert DevSecOps team",
      "Update admission controller policies",
      "Generate container security posture report"
    ],
    "integrations": ["Trivy", "Falco", "Kubernetes", "Harbor", "OPA"],
    "vulnerability_threshold": "high",
    "auto_isolate_pods": true,
    "admission_control": true
  }'::jsonb
),
(
  'Compliance Violation Response',
  'Detects policy violations (data residency, encryption, retention) and automates remediation with audit trails',
  'https://n8n.company.local/webhook/compliance-violation',
  'remediation',
  '{
    "steps": [
      "Scan for unencrypted PII/PHI storage",
      "Detect data residency violations (GDPR, CCPA)",
      "Identify retention policy breaches",
      "Check for missing audit logs",
      "Remediate violations automatically",
      "Preserve evidence for compliance audits",
      "Notify legal and compliance officers",
      "Generate violation report with risk score",
      "Schedule remediation verification"
    ],
    "integrations": ["OneTrust", "BigID", "Varonis", "Compliance_Portal"],
    "auto_remediate": true,
    "frameworks": ["GDPR", "HIPAA", "CCPA", "SOX", "PCI-DSS"],
    "evidence_preservation": true
  }'::jsonb
),
(
  'Threat Intelligence Enrichment',
  'Aggregates OSINT, performs reputation checks, and builds context for IOCs from multiple threat feeds',
  'https://n8n.company.local/webhook/threat-intel-enrichment',
  'investigation',
  '{
    "steps": [
      "Query VirusTotal, AbuseIPDB, AlienVault OTX",
      "Perform WHOIS and DNS lookups",
      "Check malware sandboxes (Any.Run, Hybrid Analysis)",
      "Correlate with dark web monitoring",
      "Enrich with geolocation and ASN data",
      "Map to MITRE ATT&CK techniques",
      "Calculate threat score with ML model",
      "Update threat intel platform",
      "Share with information sharing groups (ISACs)"
    ],
    "integrations": ["VirusTotal", "AbuseIPDB", "AlienVault", "MISP", "ThreatConnect"],
    "enrichment_sources": ["OSINT", "Commercial", "Community"],
    "auto_share_isac": true
  }'::jsonb
),
(
  'Security Alert Triage & Classification',
  'Uses ML to classify, prioritize, and route security alerts to appropriate analysts based on expertise',
  'https://n8n.company.local/webhook/alert-triage',
  'notification',
  '{
    "steps": [
      "Ingest alerts from all security tools",
      "Deduplicate similar alerts",
      "Classify by attack type using ML model",
      "Calculate priority score (urgency x impact)",
      "Enrich with asset criticality and user context",
      "Route to analyst based on skills and workload",
      "Create case with pre-populated investigation steps",
      "Set SLA timer based on severity",
      "Escalate if SLA breach imminent"
    ],
    "integrations": ["SIEM", "SOAR", "ServiceNow", "PagerDuty", "ML_Model"],
    "ml_classification": true,
    "auto_routing": true,
    "sla_enforcement": true
  }'::jsonb
),
(
  'Incident Communication Orchestration',
  'Automates stakeholder notifications, status updates, and war room creation during security incidents',
  'https://n8n.company.local/webhook/incident-comms',
  'notification',
  '{
    "steps": [
      "Create Slack/Teams war room channel",
      "Notify stakeholders based on severity (CISO, legal, PR)",
      "Generate incident briefing document",
      "Schedule status update calls",
      "Send customer notifications (if data breach)",
      "Post updates to status page",
      "Coordinate with external partners (FBI, vendors)",
      "Generate press release draft (if public disclosure)",
      "Archive all communications for post-incident review"
    ],
    "integrations": ["Slack", "Teams", "PagerDuty", "StatusPage", "Email", "Zoom"],
    "stakeholder_matrix": {
      "critical": ["CISO", "CEO", "Legal", "PR"],
      "high": ["CISO", "IT_Director"],
      "medium": ["Security_Team"]
    },
    "customer_notification_required": false
  }'::jsonb
);

-- Create workflow triggers for each workflow
INSERT INTO workflow_triggers (workflow_id, trigger_name, trigger_type, conditions, priority)
SELECT 
  w.id,
  'Alert Threshold Trigger',
  'threshold',
  jsonb_build_object(
    'alert_type', CASE w.name
      WHEN 'Automated Phishing Response' THEN 'phishing_email_detected'
      WHEN 'Insider Threat Detection & Response' THEN 'ueba_high_risk_score'
      WHEN 'Ransomware Kill Chain Breaker' THEN 'ransomware_signature_match'
      WHEN 'Zero-Day Vulnerability Response' THEN 'cve_published'
      WHEN 'Supply Chain Attack Detection' THEN 'malicious_dependency_found'
      WHEN 'Credential Stuffing Defense' THEN 'credential_stuffing_pattern'
      WHEN 'Data Exfiltration Prevention' THEN 'large_data_transfer'
      WHEN 'Compromised Certificate Response' THEN 'unauthorized_cert_issuance'
      WHEN 'APT Detection & Response' THEN 'apt_indicators_correlated'
      WHEN 'Cloud Misconfiguration Remediation' THEN 'cloud_misconfiguration_detected'
      WHEN 'Container Security Workflow' THEN 'container_vulnerability_critical'
      WHEN 'Compliance Violation Response' THEN 'compliance_policy_violated'
      WHEN 'Threat Intelligence Enrichment' THEN 'new_ioc_detected'
      WHEN 'Security Alert Triage & Classification' THEN 'new_security_alert'
      WHEN 'Incident Communication Orchestration' THEN 'incident_declared'
    END,
    'severity_min', 'medium',
    'auto_trigger', true
  ),
  CASE w.name
    WHEN 'Ransomware Kill Chain Breaker' THEN 10
    WHEN 'Credential Stuffing Defense' THEN 9
    WHEN 'Data Exfiltration Prevention' THEN 9
    WHEN 'Zero-Day Vulnerability Response' THEN 8
    WHEN 'Automated Phishing Response' THEN 7
    WHEN 'APT Detection & Response' THEN 8
    WHEN 'Insider Threat Detection & Response' THEN 7
    ELSE 5
  END
FROM n8n_workflows w
WHERE w.name IN (
  'Automated Phishing Response',
  'Insider Threat Detection & Response',
  'Ransomware Kill Chain Breaker',
  'Zero-Day Vulnerability Response',
  'Supply Chain Attack Detection',
  'Credential Stuffing Defense',
  'Data Exfiltration Prevention',
  'Compromised Certificate Response',
  'APT Detection & Response',
  'Cloud Misconfiguration Remediation',
  'Container Security Workflow',
  'Compliance Violation Response',
  'Threat Intelligence Enrichment',
  'Security Alert Triage & Classification',
  'Incident Communication Orchestration'
);

-- Add mock execution history
INSERT INTO workflow_executions (workflow_id, trigger_id, execution_status, trigger_data, response_data, execution_time_ms, started_at, completed_at)
SELECT 
  w.id,
  t.id,
  CASE (random() * 10)::int 
    WHEN 0 THEN 'failed'
    WHEN 1 THEN 'timeout'
    ELSE 'success'
  END,
  jsonb_build_object(
    'alert_id', gen_random_uuid(),
    'timestamp', now() - (random() * interval '7 days'),
    'source_ip', '192.168.' || (random()*255)::int || '.' || (random()*255)::int,
    'severity', (ARRAY['low', 'medium', 'high', 'critical'])[floor(random() * 4 + 1)]
  ),
  jsonb_build_object(
    'actions_taken', floor(random() * 5 + 1),
    'success', random() > 0.1,
    'remediation_time_seconds', floor(random() * 300)
  ),
  (random() * 5000 + 100)::int,
  now() - (random() * interval '7 days'),
  now() - (random() * interval '7 days') + (random() * interval '10 minutes')
FROM n8n_workflows w
JOIN workflow_triggers t ON t.workflow_id = w.id
ORDER BY random()
LIMIT 50;

-- Add response action logs
INSERT INTO response_actions (execution_id, action_type, target_entity, action_details, action_status, result_message)
SELECT 
  we.id,
  (ARRAY['block_ip', 'isolate_user', 'disable_account', 'quarantine_file', 'send_notification', 'create_ticket'])[floor(random() * 6 + 1)],
  CASE (random() * 3)::int
    WHEN 0 THEN '192.168.' || (random()*255)::int || '.' || (random()*255)::int
    WHEN 1 THEN 'user_' || (random()*1000)::int
    ELSE 'file_' || substr(md5(random()::text), 1, 8)
  END,
  jsonb_build_object(
    'reason', 'Automated security response',
    'method', 'n8n_workflow',
    'analyst_notified', true
  ),
  CASE (random() * 10)::int
    WHEN 0 THEN 'failed'
    ELSE 'completed'
  END,
  'Action executed successfully via automated workflow'
FROM workflow_executions we
WHERE we.execution_status = 'success'
ORDER BY random()
LIMIT 100;