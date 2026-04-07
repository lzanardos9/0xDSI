/*
  # Populate User Behavior Mock Data

  Adds realistic user profiles with profile pictures and behavior events
  showing physical and logical activities with correlations and anomalies
*/

-- Insert User Profiles with mock profile pictures from UI Avatars
INSERT INTO user_profiles (user_id, full_name, email, department, title, clearance_level, profile_picture_url, risk_score, status) VALUES
('EMP001', 'Sarah Mitchell', 'sarah.mitchell@company.com', 'Engineering', 'Senior Software Engineer', 'standard', 'https://ui-avatars.com/api/?name=Sarah+Mitchell&background=3b82f6&color=fff&size=200', 15.2, 'active'),
('EMP002', 'Marcus Chen', 'marcus.chen@company.com', 'Security', 'Security Analyst', 'high', 'https://ui-avatars.com/api/?name=Marcus+Chen&background=10b981&color=fff&size=200', 8.5, 'active'),
('EMP003', 'Jennifer Brooks', 'jennifer.brooks@company.com', 'Finance', 'Financial Controller', 'standard', 'https://ui-avatars.com/api/?name=Jennifer+Brooks&background=f59e0b&color=fff&size=200', 72.8, 'investigation'),
('EMP004', 'David Rodriguez', 'david.rodriguez@company.com', 'IT Operations', 'Systems Administrator', 'high', 'https://ui-avatars.com/api/?name=David+Rodriguez&background=8b5cf6&color=fff&size=200', 34.6, 'active'),
('EMP005', 'Emily Thompson', 'emily.thompson@company.com', 'HR', 'HR Manager', 'standard', 'https://ui-avatars.com/api/?name=Emily+Thompson&background=ec4899&color=fff&size=200', 12.3, 'active'),
('EMP006', 'Robert Johnson', 'robert.johnson@company.com', 'Engineering', 'DevOps Engineer', 'high', 'https://ui-avatars.com/api/?name=Robert+Johnson&background=06b6d4&color=fff&size=200', 45.7, 'active'),
('EMP007', 'Lisa Anderson', 'lisa.anderson@company.com', 'Sales', 'Sales Director', 'standard', 'https://ui-avatars.com/api/?name=Lisa+Anderson&background=ef4444&color=fff&size=200', 18.9, 'active'),
('EMP008', 'Michael Brown', 'michael.brown@company.com', 'Engineering', 'Junior Developer', 'standard', 'https://ui-avatars.com/api/?name=Michael+Brown&background=6366f1&color=fff&size=200', 9.1, 'active');

-- Insert Recent Behavior Events (last 2 hours)
-- Sarah Mitchell - Normal activity
INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'badge_scan', 'physical', now() - interval '1 hour 45 minutes', 'Building A - Main Entrance', 'Badge Reader 001', 'Entry', 'Main Building', 'success', 5, '{"door": "Main-001", "floor": "Ground"}'::jsonb FROM user_profiles WHERE user_id = 'EMP001';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'login', 'logical', now() - interval '1 hour 44 minutes', 'Office Network', 'WS-2401', '10.0.45.23', 'Login', 'Windows Workstation', 'success', 3, '{"auth_method": "AD", "session_id": "sess_89234"}'::jsonb FROM user_profiles WHERE user_id = 'EMP001';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'file_access', 'logical', now() - interval '1 hour 20 minutes', 'Office Network', 'WS-2401', '10.0.45.23', 'Read', '/shares/engineering/project_alpha', 'success', 2, '{"file_count": 3, "bytes": 45632}'::jsonb FROM user_profiles WHERE user_id = 'EMP001';

-- Jennifer Brooks - SUSPICIOUS ACTIVITY (High risk user)
INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'badge_scan', 'physical', now() - interval '45 minutes', 'Building B - Server Room', 'Badge Reader 045', 'Entry Attempt', 'Server Room', 'denied', 85, '{"reason": "Insufficient clearance", "door": "SR-001"}'::jsonb FROM user_profiles WHERE user_id = 'EMP003';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'login', 'logical', now() - interval '40 minutes', 'Office Network', 'WS-1845', '10.0.28.156', 'Login', 'Windows Workstation', 'success', 45, '{"auth_method": "AD", "unusual_time": true}'::jsonb FROM user_profiles WHERE user_id = 'EMP003';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'file_access', 'logical', now() - interval '38 minutes', 'Office Network', 'WS-1845', '10.0.28.156', 'Copy', '/shares/finance/payroll_2025', 'success', 92, '{"file_count": 147, "bytes": 524288000, "unusual_volume": true}'::jsonb FROM user_profiles WHERE user_id = 'EMP003';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'file_access', 'logical', now() - interval '35 minutes', 'Office Network', 'WS-1845', '10.0.28.156', 'Access', '/shares/hr/employee_records', 'denied', 88, '{"reason": "Access denied", "unauthorized_attempt": true}'::jsonb FROM user_profiles WHERE user_id = 'EMP003';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'camera_detection', 'physical', now() - interval '32 minutes', 'Building B - 3rd Floor Corridor', 'CAM-089', 'Detected', 'Restricted Area', 'success', 78, '{"loitering": true, "duration_seconds": 180}'::jsonb FROM user_profiles WHERE user_id = 'EMP003';

-- David Rodriguez - Normal admin activity with slight anomaly
INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'badge_scan', 'physical', now() - interval '2 hours', 'Building B - Server Room', 'Badge Reader 045', 'Entry', 'Server Room', 'success', 8, '{"authorized": true, "door": "SR-001"}'::jsonb FROM user_profiles WHERE user_id = 'EMP004';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'login', 'logical', now() - interval '1 hour 58 minutes', 'Server Network', 'SRV-DC01', '10.0.1.5', 'Admin Login', 'Domain Controller', 'success', 15, '{"auth_method": "MFA", "elevated": true}'::jsonb FROM user_profiles WHERE user_id = 'EMP004';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'system_access', 'logical', now() - interval '1 hour 30 minutes', 'Server Network', 'SRV-DC01', '10.0.1.5', 'Account Created', 'Active Directory', 'success', 42, '{"account": "contractor_temp", "unusual_time": true, "no_ticket_reference": true}'::jsonb FROM user_profiles WHERE user_id = 'EMP004';

-- Robert Johnson - After hours VPN access
INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'vpn_login', 'logical', now() - interval '25 minutes', 'Remote', 'Home Laptop', '203.45.67.89', 'VPN Connect', 'Corporate VPN', 'success', 35, '{"location": "Unusual", "time": "After hours"}'::jsonb FROM user_profiles WHERE user_id = 'EMP006';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'database_access', 'logical', now() - interval '20 minutes', 'Remote VPN', 'Home Laptop', '10.8.0.45', 'Query', 'Customer Database', 'success', 48, '{"query_type": "SELECT", "records_returned": 15000, "large_dataset": true}'::jsonb FROM user_profiles WHERE user_id = 'EMP006';

-- Marcus Chen - Security analyst normal activity
INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'login', 'logical', now() - interval '3 hours', 'Office Network', 'WS-SEC01', '10.0.50.10', 'Login', 'Security Workstation', 'success', 2, '{"auth_method": "MFA", "session_id": "sess_78234"}'::jsonb FROM user_profiles WHERE user_id = 'EMP002';

INSERT INTO user_behavior_events (user_profile_id, event_type, event_category, timestamp, location, device, ip_address, action, resource_accessed, outcome, anomaly_score, details)
SELECT id, 'system_access', 'logical', now() - interval '15 minutes', 'Office Network', 'WS-SEC01', '10.0.50.10', 'Review', 'SIEM Console', 'success', 1, '{"activity": "Alert review", "alerts_reviewed": 23}'::jsonb FROM user_profiles WHERE user_id = 'EMP002';

-- Insert Risk Assessments
INSERT INTO user_risk_assessments (user_profile_id, risk_score, risk_level, risk_factors, auto_generated)
SELECT id, 72.8, 'critical',
'[
  {"factor": "Attempted unauthorized server room access", "weight": 25},
  {"factor": "Mass file downloads from finance share", "weight": 30},
  {"factor": "Unauthorized access attempts to HR data", "weight": 15},
  {"factor": "Unusual presence in restricted areas", "weight": 10}
]'::jsonb, true
FROM user_profiles WHERE user_id = 'EMP003';

INSERT INTO user_risk_assessments (user_profile_id, risk_score, risk_level, risk_factors, auto_generated)
SELECT id, 34.6, 'medium',
'[
  {"factor": "Account creation without ticket reference", "weight": 20},
  {"factor": "Administrative action during unusual hours", "weight": 10},
  {"factor": "Elevated privilege usage", "weight": 5}
]'::jsonb, true
FROM user_profiles WHERE user_id = 'EMP004';

INSERT INTO user_risk_assessments (user_profile_id, risk_score, risk_level, risk_factors, auto_generated)
SELECT id, 45.7, 'medium',
'[
  {"factor": "After-hours VPN access from unusual location", "weight": 15},
  {"factor": "Large database query outside normal hours", "weight": 25},
  {"factor": "Remote access pattern deviation", "weight": 8}
]'::jsonb, true
FROM user_profiles WHERE user_id = 'EMP006';

-- Insert Behavior Correlations
INSERT INTO behavior_correlations (user_profile_id, correlation_type, physical_event_id, logical_event_id, correlation_score, description, severity)
SELECT 
  up.id,
  'location_mismatch',
  pe.id,
  le.id,
  87.5,
  'Physical server room access denied, followed by suspicious file access attempts from workstation',
  'critical'
FROM user_profiles up
JOIN user_behavior_events pe ON pe.user_profile_id = up.id AND pe.event_type = 'badge_scan' AND pe.outcome = 'denied'
JOIN user_behavior_events le ON le.user_profile_id = up.id AND le.event_type = 'file_access' AND le.timestamp > pe.timestamp
WHERE up.user_id = 'EMP003'
LIMIT 1;

INSERT INTO behavior_correlations (user_profile_id, correlation_type, physical_event_id, logical_event_id, correlation_score, description, severity)
SELECT 
  up.id,
  'time_proximity',
  pe.id,
  le.id,
  92.3,
  'Camera detected loitering in restricted area coinciding with unauthorized data access attempts',
  'critical'
FROM user_profiles up
JOIN user_behavior_events pe ON pe.user_profile_id = up.id AND pe.event_type = 'camera_detection'
JOIN user_behavior_events le ON le.user_profile_id = up.id AND le.event_type = 'file_access' AND le.resource_accessed LIKE '%hr%'
WHERE up.user_id = 'EMP003'
LIMIT 1;

INSERT INTO behavior_correlations (user_profile_id, correlation_type, correlation_score, description, severity)
SELECT 
  up.id,
  'unusual_pattern',
  68.4,
  'Administrative account creation during off-hours without proper authorization workflow',
  'medium'
FROM user_profiles up
WHERE up.user_id = 'EMP004';