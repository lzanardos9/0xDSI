/*
  # Populate Smart Threat Models

  Adds sample threat models that are auto-generated from various sources including:
  - Physical security threats
  - Logical/cyber threats
  - Hybrid scenarios
  - Pattern discovery outputs
*/

-- Insert Threat Models
INSERT INTO threat_models (name, description, model_type, auto_generated, confidence_score, assets, attack_surface, threat_actors, attack_vectors, mitre_tactics, mitre_techniques, severity, status, metadata) VALUES
(
  'Ransomware Campaign via Phishing - Critical Infrastructure',
  'Advanced ransomware campaign targeting critical infrastructure through sophisticated phishing attacks with lateral movement capabilities.',
  'logical',
  true,
  94.5,
  '[{"name": "File Servers", "type": "data", "criticality": "critical"}, {"name": "Database Cluster", "type": "data", "criticality": "critical"}, {"name": "Backup Systems", "type": "data", "criticality": "high"}]'::jsonb,
  '{"external_facing": ["Web Server", "Email Gateway"], "internal": ["File Shares", "Domain Controllers", "Databases"], "cloud": ["S3 Buckets", "Cloud Workloads"]}'::jsonb,
  '[{"name": "APT28", "sophistication": "high", "motivation": "financial"}, {"name": "Ransomware-as-a-Service Groups", "sophistication": "medium", "motivation": "financial"}]'::jsonb,
  '[{"vector": "Spear Phishing", "likelihood": "high"}, {"vector": "SMB Exploitation", "likelihood": "medium"}, {"vector": "RDP Brute Force", "likelihood": "medium"}]'::jsonb,
  ARRAY['Initial Access', 'Execution', 'Persistence', 'Lateral Movement', 'Impact'],
  ARRAY['T1566.001', 'T1059.001', 'T1547.001', 'T1021.001', 'T1486'],
  'critical',
  'active',
  '{"auto_generated_from": "pattern_discovery", "last_updated": "2025-10-06T00:00:00Z", "review_status": "pending"}'::jsonb
),
(
  'Physical Breach + Network Infiltration',
  'Hybrid attack combining physical access to facilities with network exploitation for data exfiltration.',
  'hybrid',
  true,
  87.3,
  '[{"name": "Data Center", "type": "physical", "criticality": "critical"}, {"name": "Network Infrastructure", "type": "logical", "criticality": "critical"}, {"name": "Sensitive Documents", "type": "data", "criticality": "high"}]'::jsonb,
  '{"physical": ["Main Entrance", "Loading Dock", "Emergency Exits", "Server Room"], "network": ["Internal Network", "Management Interfaces", "Wireless Access Points"]}'::jsonb,
  '[{"name": "Insider Threat", "sophistication": "medium", "motivation": "financial"}, {"name": "Corporate Espionage", "sophistication": "high", "motivation": "competitive_advantage"}]'::jsonb,
  '[{"vector": "Tailgating", "likelihood": "medium"}, {"vector": "Stolen Badge", "likelihood": "medium"}, {"vector": "USB Drop Attack", "likelihood": "low"}, {"vector": "Rogue Access Point", "likelihood": "medium"}]'::jsonb,
  ARRAY['Initial Access', 'Persistence', 'Collection', 'Exfiltration'],
  ARRAY['T1200', 'T1091', 'T1119', 'T1041'],
  'high',
  'active',
  '{"auto_generated_from": "physical_security_events", "cameras_triggered": ["CAM-001", "CAM-045"], "badge_access_anomaly": true}'::jsonb
),
(
  'SCADA System Compromise',
  'Targeted attack on industrial control systems through compromised supply chain and remote access vulnerabilities.',
  'logical',
  true,
  91.2,
  '[{"name": "SCADA System", "type": "ics", "criticality": "critical"}, {"name": "PLCs", "type": "ics", "criticality": "critical"}, {"name": "HMI Workstations", "type": "endpoint", "criticality": "high"}]'::jsonb,
  '{"external": ["VPN Gateway", "Remote Desktop Services"], "internal": ["Engineering Workstations", "SCADA Network", "OT Zone"]}'::jsonb,
  '[{"name": "Nation-State Actor", "sophistication": "very_high", "motivation": "sabotage"}, {"name": "APT33", "sophistication": "high", "motivation": "disruption"}]'::jsonb,
  '[{"vector": "Supply Chain Compromise", "likelihood": "medium"}, {"vector": "VPN Exploitation", "likelihood": "high"}, {"vector": "Zero-Day", "likelihood": "low"}]'::jsonb,
  ARRAY['Initial Access', 'Lateral Movement', 'Command and Control', 'Impact'],
  ARRAY['T1195', 'T1021.001', 'T1071.001', 'T0831'],
  'critical',
  'active',
  '{"auto_generated_from": "ioc_correlation", "related_alerts": ["ALR-4532", "ALR-4589"], "confidence_factors": ["multiple_ioc_matches", "behavioral_analysis"]}'::jsonb
),
(
  'Data Center Physical Security Breach',
  'Physical intrusion scenario targeting data center with potential for equipment tampering and data theft.',
  'physical',
  true,
  79.8,
  '[{"name": "Server Racks", "type": "physical", "criticality": "critical"}, {"name": "Network Equipment", "type": "physical", "criticality": "high"}, {"name": "Backup Tapes", "type": "physical", "criticality": "high"}]'::jsonb,
  '{"entry_points": ["Main Entrance", "Emergency Exit", "Roof Access", "Ventilation"], "vulnerable_areas": ["Loading Dock", "Visitor Reception", "Maintenance Corridors"]}'::jsonb,
  '[{"name": "Organized Crime", "sophistication": "medium", "motivation": "theft"}, {"name": "Industrial Spy", "sophistication": "high", "motivation": "intelligence"}]'::jsonb,
  '[{"vector": "Social Engineering", "likelihood": "high"}, {"vector": "Lock Picking", "likelihood": "medium"}, {"vector": "Tailgating", "likelihood": "high"}]'::jsonb,
  ARRAY['Initial Access', 'Collection'],
  ARRAY['T1200', 'T1530'],
  'high',
  'active',
  '{"auto_generated_from": "physical_security_pattern", "security_incidents": 3, "access_anomalies": 7}'::jsonb
),
(
  'IoT Botnet Formation',
  'Large-scale IoT device compromise forming a botnet for DDoS attacks and cryptocurrency mining.',
  'logical',
  true,
  88.6,
  '[{"name": "IoT Devices", "type": "endpoint", "criticality": "medium"}, {"name": "Network Bandwidth", "type": "infrastructure", "criticality": "high"}, {"name": "Corporate Reputation", "type": "intangible", "criticality": "high"}]'::jsonb,
  '{"exposed_devices": ["Security Cameras", "Smart Thermostats", "Network Printers", "Badge Readers"], "vulnerable_services": ["Telnet", "SSH", "HTTP"]}'::jsonb,
  '[{"name": "Mirai Variants", "sophistication": "medium", "motivation": "financial"}, {"name": "Script Kiddies", "sophistication": "low", "motivation": "notoriety"}]'::jsonb,
  '[{"vector": "Default Credentials", "likelihood": "critical"}, {"vector": "Unpatched Vulnerabilities", "likelihood": "high"}, {"vector": "Weak Passwords", "likelihood": "high"}]'::jsonb,
  ARRAY['Initial Access', 'Execution', 'Command and Control', 'Impact'],
  ARRAY['T1078', 'T1059', 'T1071', 'T1498'],
  'high',
  'active',
  '{"auto_generated_from": "network_scanning_pattern", "compromised_device_count": 47, "botnet_activity_detected": true}'::jsonb
);

-- Insert Threat Scenarios for Ransomware Campaign
INSERT INTO threat_scenarios (threat_model_id, scenario_name, description, threat_type, likelihood, impact, risk_score, attack_chain, affected_assets, data_flow, entry_points, vulnerabilities, indicators) 
SELECT 
  id,
  'Initial Compromise via Spear Phishing',
  'Attacker sends targeted phishing email with malicious attachment to finance department, establishing initial foothold.',
  'Phishing Attack',
  'high',
  'critical',
  90,
  '[
    {"step": 1, "action": "Reconnaissance", "description": "Gather employee information from LinkedIn and company website"},
    {"step": 2, "action": "Craft Phishing Email", "description": "Create convincing invoice-themed email with malicious macro"},
    {"step": 3, "action": "Initial Execution", "description": "Victim opens attachment, macro executes PowerShell payload"},
    {"step": 4, "action": "C2 Establishment", "description": "Beacon to attacker C2 server established"},
    {"step": 5, "action": "Credential Harvesting", "description": "Dump credentials from memory using Mimikatz"},
    {"step": 6, "action": "Lateral Movement", "description": "Move to file servers using stolen credentials"},
    {"step": 7, "action": "Data Encryption", "description": "Deploy ransomware to encrypt critical files"},
    {"step": 8, "action": "Ransom Demand", "description": "Display ransom note demanding cryptocurrency payment"}
  ]'::jsonb,
  ARRAY['Finance Workstations', 'File Servers', 'Database Cluster', 'Backup Systems'],
  '{"flow": [{"from": "Internet", "to": "Email Gateway"}, {"from": "Email Gateway", "to": "User Workstation"}, {"from": "User Workstation", "to": "File Server"}, {"from": "File Server", "to": "Database"}]}'::jsonb,
  '[{"entry": "Email Gateway", "security_controls": ["Email filtering", "Attachment scanning"]}, {"entry": "User Endpoint", "security_controls": ["Antivirus", "EDR"]}]'::jsonb,
  ARRAY['Unpatched Office Suite', 'Weak Email Filtering', 'No MFA', 'Excessive File Share Permissions'],
  ARRAY['Suspicious PowerShell execution', 'Unusual outbound connections', 'Mimikatz signature', 'Mass file encryption', 'Ransom note creation']
FROM threat_models WHERE name = 'Ransomware Campaign via Phishing - Critical Infrastructure';

-- Insert Threat Scenarios for Physical Breach
INSERT INTO threat_scenarios (threat_model_id, scenario_name, description, threat_type, likelihood, impact, risk_score, attack_chain, affected_assets, data_flow, entry_points, vulnerabilities, indicators)
SELECT
  id,
  'Tailgating with Rogue Device Installation',
  'Attacker tailgates authorized employee into facility and installs rogue network device for persistent access.',
  'Physical + Network Intrusion',
  'medium',
  'high',
  75,
  '[
    {"step": 1, "action": "Social Engineering", "description": "Build rapport with employees through fake LinkedIn profile"},
    {"step": 2, "action": "Physical Reconnaissance", "description": "Observe entry/exit patterns and security procedures"},
    {"step": 3, "action": "Tailgating", "description": "Follow employee through security door during busy morning"},
    {"step": 4, "action": "Device Installation", "description": "Install Raspberry Pi with cellular modem in network closet"},
    {"step": 5, "action": "Network Access", "description": "Establish remote connection to internal network"},
    {"step": 6, "action": "Privilege Escalation", "description": "Exploit network vulnerabilities to gain admin access"},
    {"step": 7, "action": "Data Exfiltration", "description": "Copy sensitive documents to external server"}
  ]'::jsonb,
  ARRAY['Data Center', 'Network Infrastructure', 'Sensitive Documents'],
  '{"flow": [{"from": "Main Entrance", "to": "Office Area"}, {"from": "Office Area", "to": "Network Closet"}, {"from": "Network Closet", "to": "Internal Network"}, {"from": "Internal Network", "to": "Internet via Cellular"}]}'::jsonb,
  '[{"entry": "Main Entrance", "security_controls": ["Badge reader", "Security guard"]}, {"entry": "Network Closet", "security_controls": ["Locked door", "Access logging"]}]'::jsonb,
  ARRAY['No Anti-Tailgating Measures', 'Unsecured Network Closets', 'No Network Access Control', 'Weak Physical Security Monitoring'],
  ARRAY['Badge access without corresponding camera event', 'Rogue device on network', 'Unusual data transfer patterns', 'Unauthorized network device MAC address']
FROM threat_models WHERE name = 'Physical Breach + Network Infiltration';

-- Insert Mitigations
INSERT INTO threat_mitigations (scenario_id, mitigation_type, control_name, description, implementation_status, effectiveness, cost, priority, owner)
SELECT
  ts.id,
  'preventive',
  'Multi-Factor Authentication (MFA)',
  'Implement MFA for all user accounts, especially privileged accounts and remote access.',
  'in_progress',
  'high',
  'medium',
  1,
  'Security Team'
FROM threat_scenarios ts
JOIN threat_models tm ON ts.threat_model_id = tm.id
WHERE tm.name = 'Ransomware Campaign via Phishing - Critical Infrastructure'
AND ts.scenario_name = 'Initial Compromise via Spear Phishing';

INSERT INTO threat_mitigations (scenario_id, mitigation_type, control_name, description, implementation_status, effectiveness, cost, priority, owner)
SELECT
  ts.id,
  'detective',
  'Advanced Email Security',
  'Deploy advanced email filtering and sandboxing solution to detect malicious attachments.',
  'implemented',
  'high',
  'high',
  1,
  'IT Operations'
FROM threat_scenarios ts
JOIN threat_models tm ON ts.threat_model_id = tm.id
WHERE tm.name = 'Ransomware Campaign via Phishing - Critical Infrastructure'
AND ts.scenario_name = 'Initial Compromise via Spear Phishing';

INSERT INTO threat_mitigations (scenario_id, mitigation_type, control_name, description, implementation_status, effectiveness, cost, priority, owner)
SELECT
  ts.id,
  'preventive',
  'Anti-Tailgating Mantrap',
  'Install mantrap entrance system that only allows one person at a time.',
  'planned',
  'high',
  'high',
  1,
  'Facilities Management'
FROM threat_scenarios ts
JOIN threat_models tm ON ts.threat_model_id = tm.id
WHERE tm.name = 'Physical Breach + Network Infiltration'
AND ts.scenario_name = 'Tailgating with Rogue Device Installation';

INSERT INTO threat_mitigations (scenario_id, mitigation_type, control_name, description, implementation_status, effectiveness, cost, priority, owner)
SELECT
  ts.id,
  'detective',
  'Network Access Control (NAC)',
  'Implement NAC to detect and isolate unauthorized devices on the network.',
  'in_progress',
  'high',
  'medium',
  2,
  'Network Team'
FROM threat_scenarios ts
JOIN threat_models tm ON ts.threat_model_id = tm.id
WHERE tm.name = 'Physical Breach + Network Infiltration'
AND ts.scenario_name = 'Tailgating with Rogue Device Installation';

-- Insert Threat Model Sources
INSERT INTO threat_model_sources (threat_model_id, source_type, confidence, data)
SELECT
  id,
  'pattern_discovery',
  94.5,
  '{"pattern_id": "PATTERN-001", "correlation_score": 0.945, "events_analyzed": 15234, "timeframe": "7_days"}'::jsonb
FROM threat_models WHERE name = 'Ransomware Campaign via Phishing - Critical Infrastructure';

INSERT INTO threat_model_sources (threat_model_id, source_type, confidence, data)
SELECT
  id,
  'event',
  87.3,
  '{"event_ids": ["EVT-4521", "EVT-4532", "EVT-4589"], "camera_detections": 3, "badge_anomalies": 2}'::jsonb
FROM threat_models WHERE name = 'Physical Breach + Network Infiltration';

INSERT INTO threat_model_sources (threat_model_id, source_type, confidence, data)
SELECT
  id,
  'ioc',
  91.2,
  '{"ioc_matches": 47, "threat_feeds": ["AlienVault", "VirusTotal", "MISP"], "confirmed_malware": true}'::jsonb
FROM threat_models WHERE name = 'SCADA System Compromise';