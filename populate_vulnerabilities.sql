-- Populate Vulnerabilities Tables with Comprehensive Data

-- Insert asset vulnerabilities using actual asset UUIDs
INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2024-0001',
    'critical',
    9.8,
    'Apache HTTP Server Remote Code Execution',
    'Critical RCE vulnerability in Apache HTTP Server 2.4.x allows remote attackers to execute arbitrary code',
    'Apache HTTP Server 2.4.58',
    'Upgrade to Apache 2.4.59 or later',
    'open',
    NOW() - INTERVAL '2 days',
    NULL
FROM asset_registry WHERE asset_name = 'WEB-DMZ-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2024-0002',
    'critical',
    9.9,
    'OpenSSH Authentication Bypass',
    'Critical authentication bypass in OpenSSH 9.x allowing unauthorized access',
    'OpenSSH 9.5p1',
    'Update to OpenSSH 9.6p1 immediately',
    'open',
    NOW() - INTERVAL '1 day',
    NULL
FROM asset_registry WHERE asset_name = 'RTR-EDGE-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2024-0003',
    'high',
    8.8,
    'Docker Container Escape',
    'Container escape vulnerability in Docker Engine allowing privilege escalation',
    'Docker Engine 24.0.7',
    'Upgrade to Docker Engine 25.0.0',
    'in_progress',
    NOW() - INTERVAL '5 days',
    NULL
FROM asset_registry WHERE asset_name = 'APP-K8S-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2024-0004',
    'critical',
    10.0,
    'Kubernetes API Server RCE',
    'Remote code execution in Kubernetes API Server affecting all versions',
    'Kubernetes 1.28.3',
    'Apply security patch v1.28.4',
    'open',
    NOW() - INTERVAL '3 days',
    NULL
FROM asset_registry WHERE asset_name = 'APP-K8S-02'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2024-0005',
    'high',
    8.1,
    'Redis Command Injection',
    'Command injection vulnerability in Redis allowing unauthorized operations',
    'Redis 7.0.12',
    'Update to Redis 7.2.4 with ACL enabled',
    'patched',
    NOW() - INTERVAL '10 days',
    NOW() - INTERVAL '2 days'
FROM asset_registry WHERE asset_name = 'DB-CACHE-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5678',
    'critical',
    9.4,
    'PostgreSQL SQL Injection',
    'SQL injection in PostgreSQL stored procedures allowing data exfiltration',
    'PostgreSQL 15.3',
    'Upgrade to PostgreSQL 16.1',
    'open',
    NOW() - INTERVAL '7 days',
    NULL
FROM asset_registry WHERE asset_name = 'DB-PROD-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5679',
    'high',
    8.6,
    'Nginx Buffer Overflow',
    'Buffer overflow in Nginx HTTP/2 module causing potential RCE',
    'Nginx 1.24.0',
    'Update to Nginx 1.25.3',
    'patched',
    NOW() - INTERVAL '15 days',
    NOW() - INTERVAL '5 days'
FROM asset_registry WHERE asset_name = 'LB-WEB-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5680',
    'medium',
    6.8,
    'Node.js Prototype Pollution',
    'Prototype pollution vulnerability in Node.js affecting Express apps',
    'Node.js 18.17.1',
    'Upgrade to Node.js 20.10.0',
    'in_progress',
    NOW() - INTERVAL '12 days',
    NULL
FROM asset_registry WHERE asset_name = 'APP-WEB-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5681',
    'high',
    8.2,
    'MongoDB Authentication Bypass',
    'Authentication bypass in MongoDB allowing unauthorized database access',
    'MongoDB 6.0.9',
    'Update to MongoDB 7.0.4',
    'open',
    NOW() - INTERVAL '8 days',
    NULL
FROM asset_registry WHERE asset_name = 'DB-MONGO-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5682',
    'critical',
    9.7,
    'Jenkins Remote Code Execution',
    'RCE in Jenkins allowing attackers to execute arbitrary code on server',
    'Jenkins 2.420',
    'Update to Jenkins 2.426.2',
    'open',
    NOW() - INTERVAL '4 days',
    NULL
FROM asset_registry WHERE asset_name = 'CICD-JENKINS-01'
ON CONFLICT (asset_id, cve_id) DO NOTHING;

-- Add more vulnerabilities to existing assets
INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5683',
    'high',
    7.9,
    'Elasticsearch Data Exposure',
    'Unauthorized data access in Elasticsearch due to misconfigured ACLs',
    'Elasticsearch 8.9.1',
    'Reconfigure security settings and update to 8.11.3',
    'in_progress',
    NOW() - INTERVAL '6 days',
    NULL
FROM asset_registry WHERE asset_type = 'server' LIMIT 1
ON CONFLICT (asset_id, cve_id) DO NOTHING;

INSERT INTO asset_vulnerabilities (asset_id, cve_id, severity, cvss_score, title, description, affected_component, remediation, status, discovered_at, patched_at)
SELECT
    id,
    'CVE-2023-5684',
    'medium',
    6.5,
    'MySQL Privilege Escalation',
    'Local privilege escalation in MySQL server',
    'MySQL 8.0.34',
    'Apply security patch 8.0.36',
    'patched',
    NOW() - INTERVAL '20 days',
    NOW() - INTERVAL '10 days'
FROM asset_registry WHERE asset_type = 'server' OFFSET 1 LIMIT 1
ON CONFLICT (asset_id, cve_id) DO NOTHING;

-- Add NVD vulnerabilities
INSERT INTO nist_nvd_vulnerabilities (cve_id, vulnerability_description, cvss_v3_score, cvss_v3_severity, published_date, last_modified_date, affected_products, remediation_guidance) VALUES
('CVE-2024-1111', 'Critical remote code execution vulnerability in Microsoft Exchange Server allowing attackers to execute arbitrary code', 9.8, 'critical', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days', '{"products": ["Microsoft Exchange Server 2019", "Microsoft Exchange Server 2016"]}', 'Apply latest security updates from Microsoft'),
('CVE-2024-1112', 'Authentication bypass in Cisco ASA firewall allowing unauthorized network access', 9.4, 'critical', NOW() - INTERVAL '8 days', NOW() - INTERVAL '3 days', '{"products": ["Cisco ASA 5500", "Cisco ASA 5500-X"]}', 'Upgrade to latest firmware version'),
('CVE-2024-1113', 'Zero-day vulnerability in VMware vCenter Server enabling privilege escalation', 9.0, 'critical', NOW() - INTERVAL '3 days', NOW() - INTERVAL '1 day', '{"products": ["VMware vCenter Server 7.0", "VMware vCenter Server 8.0"]}', 'Apply emergency patch from VMware'),
('CVE-2024-1114', 'SQL injection vulnerability in Oracle Database Server', 8.8, 'high', NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days', '{"products": ["Oracle Database 19c", "Oracle Database 21c"]}', 'Install Oracle Critical Patch Update'),
('CVE-2024-1115', 'Buffer overflow in Fortinet FortiOS allowing remote code execution', 9.6, 'critical', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day', '{"products": ["FortiOS 7.0", "FortiOS 7.2"]}', 'Upgrade to patched FortiOS version'),
('CVE-2024-1116', 'Privilege escalation in Linux kernel affecting multiple distributions', 7.8, 'high', NOW() - INTERVAL '12 days', NOW() - INTERVAL '6 days', '{"products": ["Linux Kernel 5.15", "Linux Kernel 6.1"]}', 'Update to kernel version with patch'),
('CVE-2024-1117', 'Cross-site scripting in WordPress core affecting all versions below 6.4.2', 6.5, 'medium', NOW() - INTERVAL '15 days', NOW() - INTERVAL '8 days', '{"products": ["WordPress < 6.4.2"]}', 'Update to WordPress 6.4.2 or higher'),
('CVE-2024-1118', 'Remote code execution in F5 BIG-IP allowing attackers to compromise load balancers', 9.8, 'critical', NOW() - INTERVAL '6 days', NOW() - INTERVAL '2 days', '{"products": ["F5 BIG-IP 15.x", "F5 BIG-IP 16.x", "F5 BIG-IP 17.x"]}', 'Apply F5 security hotfix'),
('CVE-2024-1119', 'Authentication bypass in Palo Alto Networks PAN-OS', 9.3, 'critical', NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days', '{"products": ["PAN-OS 10.2", "PAN-OS 11.0"]}', 'Upgrade to recommended PAN-OS version'),
('CVE-2024-1120', 'Directory traversal in IIS allowing unauthorized file access', 7.5, 'high', NOW() - INTERVAL '14 days', NOW() - INTERVAL '7 days', '{"products": ["IIS 10.0"]}', 'Install Windows security update'),
('CVE-2023-9001', 'Insecure deserialization in Java applications using Jackson library', 8.1, 'high', NOW() - INTERVAL '20 days', NOW() - INTERVAL '10 days', '{"products": ["Jackson 2.14.x", "Jackson 2.15.x"]}', 'Upgrade Jackson library to 2.16.0'),
('CVE-2023-9002', 'Server-side request forgery in AWS SDK allowing access to metadata service', 8.6, 'high', NOW() - INTERVAL '18 days', NOW() - INTERVAL '9 days', '{"products": ["AWS SDK Java < 2.21.0"]}', 'Update AWS SDK to latest version'),
('CVE-2023-9003', 'Path traversal in Spring Framework', 7.4, 'high', NOW() - INTERVAL '22 days', NOW() - INTERVAL '11 days', '{"products": ["Spring Framework 5.3.x", "Spring Framework 6.0.x"]}', 'Upgrade to Spring Framework 6.1.0'),
('CVE-2023-9004', 'XML external entity injection in .NET Framework', 8.2, 'high', NOW() - INTERVAL '25 days', NOW() - INTERVAL '12 days', '{"products": [".NET Framework 4.8"]}', 'Apply .NET Framework security patch'),
('CVE-2023-9005', 'Command injection in Python pip package manager', 7.8, 'high', NOW() - INTERVAL '28 days', NOW() - INTERVAL '14 days', '{"products": ["pip < 23.3"]}', 'Upgrade pip to version 23.3 or higher'),
('CVE-2023-9006', 'Improper access control in GitHub Enterprise Server', 8.5, 'high', NOW() - INTERVAL '30 days', NOW() - INTERVAL '15 days', '{"products": ["GitHub Enterprise Server 3.9", "GitHub Enterprise Server 3.10"]}', 'Upgrade GitHub Enterprise Server'),
('CVE-2023-9007', 'Weak cryptography in OpenSSL affecting TLS connections', 7.5, 'high', NOW() - INTERVAL '35 days', NOW() - INTERVAL '18 days', '{"products": ["OpenSSL 3.0.x", "OpenSSL 3.1.x"]}', 'Update OpenSSL to 3.2.0'),
('CVE-2023-9008', 'Memory corruption in Chrome browser', 8.8, 'high', NOW() - INTERVAL '40 days', NOW() - INTERVAL '20 days', '{"products": ["Google Chrome < 120.0.6099.62"]}', 'Update Chrome to latest version'),
('CVE-2023-9009', 'Privilege escalation in Windows Active Directory', 9.0, 'critical', NOW() - INTERVAL '16 days', NOW() - INTERVAL '8 days', '{"products": ["Windows Server 2019", "Windows Server 2022"]}', 'Install Windows security updates'),
('CVE-2023-9010', 'Heap overflow in ImageMagick image processing library', 8.4, 'high', NOW() - INTERVAL '32 days', NOW() - INTERVAL '16 days', '{"products": ["ImageMagick < 7.1.1-20"]}', 'Update ImageMagick to latest version'),
('CVE-2023-9011', 'Cross-site scripting in React framework', 6.1, 'medium', NOW() - INTERVAL '45 days', NOW() - INTERVAL '23 days', '{"products": ["React < 18.2.0"]}', 'Upgrade React to version 18.2.0'),
('CVE-2023-9012', 'SQL injection in phpMyAdmin', 9.8, 'critical', NOW() - INTERVAL '11 days', NOW() - INTERVAL '5 days', '{"products": ["phpMyAdmin < 5.2.1"]}', 'Update phpMyAdmin immediately'),
('CVE-2023-9013', 'Remote code execution in Drupal CMS', 9.8, 'critical', NOW() - INTERVAL '13 days', NOW() - INTERVAL '6 days', '{"products": ["Drupal 9.x", "Drupal 10.x"]}', 'Apply Drupal security advisory patch'),
('CVE-2023-9014', 'Authentication bypass in Joomla CMS', 9.1, 'critical', NOW() - INTERVAL '17 days', NOW() - INTERVAL '8 days', '{"products": ["Joomla < 4.4.2"]}', 'Upgrade Joomla to 4.4.2 or higher'),
('CVE-2023-9015', 'File upload vulnerability in Magento e-commerce platform', 8.1, 'high', NOW() - INTERVAL '19 days', NOW() - INTERVAL '9 days', '{"products": ["Magento 2.4.x"]}', 'Apply Magento security patches'),
('CVE-2023-9016', 'Insecure direct object reference in Salesforce', 7.7, 'high', NOW() - INTERVAL '21 days', NOW() - INTERVAL '10 days', '{"products": ["Salesforce Platform"]}', 'Configure proper access controls'),
('CVE-2023-9017', 'XML injection in SAP NetWeaver', 8.6, 'high', NOW() - INTERVAL '23 days', NOW() - INTERVAL '11 days', '{"products": ["SAP NetWeaver 7.5"]}', 'Install SAP security note'),
('CVE-2023-9018', 'Command injection in Splunk Enterprise', 9.0, 'critical', NOW() - INTERVAL '9 days', NOW() - INTERVAL '4 days', '{"products": ["Splunk Enterprise 9.0", "Splunk Enterprise 9.1"]}', 'Upgrade Splunk Enterprise'),
('CVE-2023-9019', 'Path traversal in Atlassian Confluence', 8.3, 'high', NOW() - INTERVAL '26 days', NOW() - INTERVAL '13 days', '{"products": ["Confluence Server", "Confluence Data Center"]}', 'Apply Atlassian security bulletin patch'),
('CVE-2023-9020', 'Privilege escalation in Atlassian Jira', 8.8, 'high', NOW() - INTERVAL '24 days', NOW() - INTERVAL '12 days', '{"products": ["Jira Server", "Jira Data Center"]}', 'Update Jira to patched version')
ON CONFLICT (cve_id) DO NOTHING;

-- Add physical asset vulnerabilities
INSERT INTO physical_asset_vulnerabilities (location, vulnerability_type, severity, description, risk_score, status, discovered_at, remediation_plan) VALUES
('Building A - Server Room', 'inadequate_cooling', 'high', 'Server room cooling system operates at 80% capacity, risk of thermal shutdown during peak loads', 7.8, 'open', NOW() - INTERVAL '3 days', 'Install redundant HVAC system by end of quarter'),
('Building B - Data Center', 'fire_suppression', 'critical', 'Fire suppression system failed annual inspection, non-functional sprinkler heads detected', 9.2, 'open', NOW() - INTERVAL '1 day', 'Emergency repair scheduled within 48 hours'),
('Building A - Main Entrance', 'access_control', 'high', 'Malfunctioning card reader allows tailgating, door remains unlocked intermittently', 8.1, 'in_progress', NOW() - INTERVAL '5 days', 'Replace card reader and install anti-tailgating sensors'),
('Building C - Network Operations Center', 'physical_monitoring', 'medium', 'CCTV camera blind spots identified in critical areas, 30% coverage gap', 6.5, 'open', NOW() - INTERVAL '7 days', 'Install 4 additional cameras to eliminate blind spots'),
('Building A - Backup Power', 'power_redundancy', 'critical', 'UPS battery bank at 60% capacity, cannot sustain full load for required 15 minutes', 8.9, 'open', NOW() - INTERVAL '2 days', 'Replace UPS batteries and test under full load'),
('Building B - Perimeter', 'physical_barrier', 'medium', 'Perimeter fence damaged in 3 locations, potential unauthorized access points', 6.8, 'in_progress', NOW() - INTERVAL '6 days', 'Repair fence sections and install motion sensors'),
('Building D - Communications Room', 'environmental_monitoring', 'high', 'No environmental monitoring system, unable to detect water leaks or humidity issues', 7.5, 'open', NOW() - INTERVAL '4 days', 'Deploy IoT environmental sensors with alerting'),
('Building A - Loading Dock', 'access_control', 'high', 'Loading dock security protocols not enforced, unescorted vendor access to facility', 7.9, 'open', NOW() - INTERVAL '8 days', 'Implement escort policy and install additional cameras'),
('Building C - Electrical Room', 'fire_detection', 'critical', 'Smoke detectors in electrical room expired, not operational', 9.0, 'open', NOW() - INTERVAL '1 day', 'Replace all smoke detectors immediately'),
('Building B - Roof Access', 'physical_security', 'medium', 'Roof access hatch lock broken, potential unauthorized roof access', 6.2, 'patched', NOW() - INTERVAL '10 days', 'Lock replaced and access logged'),
('Building A - Generator Room', 'fuel_storage', 'high', 'Diesel generator fuel level critically low, insufficient for emergency operations', 8.3, 'open', NOW() - INTERVAL '2 days', 'Refuel generator and implement automated monitoring'),
('Building E - Archive Storage', 'climate_control', 'medium', 'Archive room humidity levels exceed acceptable range, risk to physical media', 6.7, 'in_progress', NOW() - INTERVAL '9 days', 'Install dehumidification system'),
('Building C - Secure Area', 'biometric_system', 'high', 'Biometric scanner failure rate at 15%, allowing unauthorized access attempts', 7.6, 'open', NOW() - INTERVAL '5 days', 'Upgrade biometric system and recalibrate'),
('Building A - Parking Structure', 'vehicle_barriers', 'medium', 'Vehicle barrier gates malfunction intermittently, unauthorized vehicle entry possible', 6.4, 'open', NOW() - INTERVAL '11 days', 'Service barrier system and replace motors'),
('Building B - Emergency Exits', 'life_safety', 'critical', 'Two emergency exits have delayed release mechanism failures', 9.1, 'in_progress', NOW() - INTERVAL '3 days', 'Emergency repair in progress, completion within 24 hours')
ON CONFLICT DO NOTHING;
