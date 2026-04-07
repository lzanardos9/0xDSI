/*
  # Populate New Correlation Systems with Mock Data

  Populates demo data for:
  1. Supply Chain & Third-Party Risk (6 tables)
  2. DevOps & CI/CD Security (6 tables)
  3. Cloud Posture & Configuration Drift (6 tables)

  Total: 18 new correlation tables with realistic attack scenarios
*/

-- ============================================================================
-- SUPPLY CHAIN & THIRD-PARTY RISK DATA
-- ============================================================================

-- Vendor Risk Profiles
INSERT INTO vendor_risk_profiles (vendor_id, vendor_name, vendor_type, risk_tier, risk_score, access_level, security_rating, has_network_access, has_data_access, has_code_access, data_access_scope, systems_accessed, incidents_count, breaches_count, contract_value, contract_status, criticality_level) VALUES
('VEN-001', 'CloudSecure Technologies', 'technology_vendor', 'high', 75.5, 'network_access', 65.0, true, true, false, '{"customer_data": true, "pii": true}'::jsonb, ARRAY['VPN', 'Internal APIs', 'Logging System'], 2, 1, 500000.00, 'active', 'essential'),
('VEN-002', 'DataProcessor Corp', 'service_provider', 'critical', 85.0, 'data_access', 55.0, true, true, false, '{"financial_data": true, "pii": true, "phi": true}'::jsonb, ARRAY['Database', 'S3 Buckets'], 1, 1, 1200000.00, 'active', 'essential'),
('VEN-003', 'DevOps Automation Inc', 'technology_vendor', 'high', 68.0, 'code_access', 70.0, true, false, true, '{"source_code": true, "ci_cd": true}'::jsonb, ARRAY['GitHub', 'Jenkins', 'Docker Registry'], 0, 0, 300000.00, 'active', 'important'),
('VEN-004', 'Security Contractor Services', 'contractor_firm', 'medium', 45.0, 'network_access', 80.0, true, false, false, '{"monitoring_only": true}'::jsonb, ARRAY['VPN', 'SIEM'], 0, 0, 150000.00, 'active', 'standard'),
('VEN-005', 'Global IT Support', 'service_provider', 'low', 25.0, 'read_only', 85.0, false, false, false, '{}'::jsonb, ARRAY['Help Desk Portal'], 0, 0, 50000.00, 'active', 'low');

-- Supply Chain Events (including SolarWinds-style attack)
INSERT INTO supply_chain_events (event_id, vendor_id, event_type, severity, event_description, our_exposure, our_data_compromised, cascading_risk, related_vendors, remediation_status) VALUES
('SCE-001', (SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-002'), 'vendor_breach', 'critical', 'DataProcessor Corp suffered ransomware attack. Customer data potentially compromised. Investigation ongoing.', true, true, true, ARRAY[(SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-001')], 'remediating'),
('SCE-002', (SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-003'), 'supply_chain_attack', 'critical', 'Malicious code injected into build pipeline. Similar to SolarWinds attack pattern. Affects downstream customers.', true, false, true, ARRAY[(SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-001'), (SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-004')], 'investigating'),
('SCE-003', (SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-001'), 'vulnerability_disclosed', 'high', 'Critical vulnerability (CVE-2024-1234) in CloudSecure VPN appliance. Patch available.', true, false, false, ARRAY[]::uuid[], 'mitigated');

-- Third-Party Access Logs (suspicious contractor activity)
INSERT INTO third_party_access_logs (vendor_id, access_id, access_type, user_identity, source_ip, target_system, session_start, data_transferred_gb, unusual_activity, unusual_time, privileged_access, risk_score) VALUES
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-002'), 'ACC-001', 'vpn', 'contractor_john_doe', '203.0.113.45', 'Production Database', NOW() - INTERVAL '2 hours', 15.5, true, true, true, 85.0),
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-003'), 'ACC-002', 'api', 'service_account_devops', '198.51.100.78', 'Source Code Repository', NOW() - INTERVAL '5 hours', 2.3, true, false, true, 72.0),
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-004'), 'ACC-003', 'contractor_badge', 'contractor_jane_smith', NULL, 'Server Room', NOW() - INTERVAL '1 day', 0, false, false, false, 15.0);

-- Vendor Dependencies
INSERT INTO vendor_dependencies (primary_vendor_id, dependent_vendor_id, dependency_type, criticality, single_point_of_failure) VALUES
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-001'), (SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-002'), 'subcontractor', 'high', true),
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-003'), (SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-001'), 'technology_provider', 'critical', true);

-- Third-Party API Usage (potential key leak)
INSERT INTO third_party_api_usage (vendor_id, api_key_id, endpoint, method, sensitive_data_accessed, potential_key_leak, key_used_from_unexpected_ip, risk_score) VALUES
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-001'), 'KEY-12345', '/api/v1/customers', 'GET', true, true, true, 90.0),
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-002'), 'KEY-67890', '/api/v1/financial-data', 'POST', true, false, false, 45.0);

-- Contractor Sessions (unusual behavior)
INSERT INTO contractor_sessions (vendor_id, contractor_id, contractor_name, session_id, access_type, privileged_commands_count, baseline_deviation_score, unusual_behavior_detected, risk_score) VALUES
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-004'), 'CNT-001', 'John Contractor', 'SES-001', 'temporary', 45, 78.5, true, 82.0),
((SELECT id FROM vendor_risk_profiles WHERE vendor_id = 'VEN-002'), 'CNT-002', 'Jane External', 'SES-002', 'recurring', 12, 25.0, false, 30.0);

-- ============================================================================
-- DEVOPS & CI/CD SECURITY DATA
-- ============================================================================

-- CI/CD Pipeline Events (secret exposure + unsigned artifact)
INSERT INTO cicd_pipeline_events (pipeline_id, pipeline_name, pipeline_type, repo_name, branch, commit_hash, triggered_by, build_status, deployment_target, secret_exposure_detected, secrets_found, unsigned_artifact, vulnerable_dependencies_count, risk_score) VALUES
('PIPE-001', 'prod-deployment-pipeline', 'deploy', 'web-application', 'main', 'a1b2c3d4e5f6', 'jenkins_bot', 'success', 'production', true, '[{"type": "aws_access_key", "value": "AKIA***"}, {"type": "database_password"}]'::jsonb, true, 15, 95.0),
('PIPE-002', 'staging-build-pipeline', 'build', 'api-service', 'develop', 'f6e5d4c3b2a1', 'developer_alice', 'success', 'staging', false, '[]'::jsonb, false, 3, 25.0),
('PIPE-003', 'security-scan-pipeline', 'test', 'web-application', 'feature-auth', '123abc456def', 'developer_bob', 'failed', 'none', false, '[]'::jsonb, false, 42, 65.0);

-- Container Security Events (privileged container + lateral movement)
INSERT INTO container_security_events (event_id, container_id, container_name, pod_name, namespace, cluster, image_name, image_tag, total_vulnerabilities, critical_vulnerabilities, privileged_mode, host_network_access, suspicious_process_spawned, lateral_movement_detected, risk_score, severity) VALUES
('CSE-001', 'cont-abc123', 'web-app-prod', 'web-app-pod-1', 'production', 'prod-cluster', 'myorg/web-app', 'v2.1.5', 28, 5, true, true, true, true, 92.0, 'critical'),
('CSE-002', 'cont-def456', 'database-sidecar', 'db-pod-1', 'production', 'prod-cluster', 'postgres', '14.2', 12, 0, false, false, false, false, 35.0, 'medium'),
('CSE-003', 'cont-ghi789', 'api-service', 'api-pod-5', 'staging', 'staging-cluster', 'myorg/api', 'latest', 67, 12, true, false, true, false, 75.0, 'high');

-- Code Security Events (secret leak + malicious dependency)
INSERT INTO code_security_events (event_id, repo_name, branch, commit_hash, commit_author, commit_timestamp, event_type, severity, secrets_found, api_keys_exposed, malicious_code_detected, dependency_risk_score, author_anomaly, risk_score) VALUES
('CODE-001', 'web-application', 'main', 'deadbeef1234', 'compromised_dev@example.com', NOW() - INTERVAL '3 hours', 'secret_leak', 'critical', '[{"type": "aws_secret_key", "file": "config.py", "line": 45}]'::jsonb, true, false, 0, true, 88.0),
('CODE-002', 'api-service', 'develop', '5678abcd9012', 'attacker@evil.com', NOW() - INTERVAL '1 day', 'malicious_dependency', 'critical', '[]'::jsonb, false, true, 95.0, true, 98.0),
('CODE-003', 'frontend-app', 'feature-auth', 'aabbccdd1122', 'developer_alice@example.com', NOW() - INTERVAL '5 hours', 'vulnerability_introduced', 'high', '[]'::jsonb, false, false, 55.0, false, 60.0);

-- IaC Drift Detection (security group exposed)
INSERT INTO iac_drift_detection (drift_id, cloud_provider, resource_id, resource_type, drift_type, severity, expected_state, actual_state, security_group_exposed, public_access_enabled, changed_by, change_method, risk_score) VALUES
('DRIFT-001', 'aws', 'sg-0123456789abcdef', 'security_group', 'security_exposure', 'critical', '{"ingress": [{"port": 443, "cidr": "10.0.0.0/8"}]}'::jsonb, '{"ingress": [{"port": 22, "cidr": "0.0.0.0/0"}, {"port": 443, "cidr": "0.0.0.0/0"}]}'::jsonb, true, true, 'unknown_user', 'console', 95.0),
('DRIFT-002', 'azure', 'rg-webapp-prod', 'resource_group', 'unauthorized_change', 'high', '{"encryption": true}'::jsonb, '{"encryption": false}'::jsonb, false, false, 'admin@example.com', 'cli', 72.0);

-- Pipeline Security Policies
INSERT INTO pipeline_security_policies (policy_id, policy_name, policy_type, require_signed_commits, require_security_scan, block_on_vulnerabilities, require_approval_for_production, enabled) VALUES
('POL-001', 'Production Deployment Policy', 'mandatory', true, true, true, true, true),
('POL-002', 'Code Review Policy', 'mandatory', true, false, false, false, true),
('POL-003', 'Container Security Policy', 'recommended', false, true, true, false, true);

-- Software Supply Chain Attacks (dependency confusion)
INSERT INTO software_supply_chain_attacks (attack_id, attack_type, package_manager, package_name, package_version, legitimate_package, affected_repos, severity, remediation_status) VALUES
('SSCA-001', 'dependency_confusion', 'npm', 'internal-auth-lib', '1.0.5', 'internal-auth-lib', ARRAY['web-application', 'api-service'], 'critical', 'investigating'),
('SSCA-002', 'typosquatting', 'pypi', 'requsts', '2.28.0', 'requests', ARRAY['data-pipeline'], 'high', 'resolved');

-- ============================================================================
-- CLOUD POSTURE & CONFIGURATION DRIFT DATA
-- ============================================================================

-- Cloud Posture Violations (public S3 bucket + missing encryption)
INSERT INTO cloud_posture_violations (violation_id, cloud_provider, account_id, region, resource_id, resource_type, violation_type, severity, publicly_accessible, encryption_enabled, cis_benchmark_reference, risk_score, remediation_status) VALUES
('CPV-001', 'aws', '123456789012', 'us-east-1', 's3://sensitive-data-bucket', 's3_bucket', 'public_exposure', 'critical', true, false, 'CIS AWS 2.1.5', 98.0, 'open'),
('CPV-002', 'aws', '123456789012', 'us-west-2', 'rds-prod-database-1', 'rds_instance', 'unencrypted_data', 'high', false, false, 'CIS AWS 2.3.1', 82.0, 'in_progress'),
('CPV-003', 'azure', 'sub-abc-123', 'eastus', 'vm-web-prod-01', 'virtual_machine', 'missing_logging', 'medium', false, true, 'CIS Azure 5.2.1', 55.0, 'remediated'),
('CPV-004', 'gcp', 'project-12345', 'us-central1', 'firewall-rule-allow-all', 'firewall_rule', 'overly_permissive', 'critical', true, true, 'CIS GCP 3.6', 92.0, 'open');

-- Cloud Config Drift (IAM role privilege escalation)
INSERT INTO cloud_config_drift (drift_id, cloud_provider, account_id, resource_id, resource_type, service, drift_type, severity, previous_config, current_config, changed_by, change_source, security_impact_score) VALUES
('CDRIFT-001', 'aws', '123456789012', 'arn:aws:iam::123456789012:role/developer-role', 'iam_role', 'iam', 'privilege_escalation', 'critical', '{"policies": ["ReadOnly"]}'::jsonb, '{"policies": ["ReadOnly", "AdminAccess"]}'::jsonb, 'suspicious_user', 'console', 95.0),
('CDRIFT-002', 'aws', '123456789012', 'sg-abc123', 'security_group', 'ec2', 'security_exposure', 'high', '{"ingress": [{"port": 443, "cidr": "10.0.0.0/8"}]}'::jsonb, '{"ingress": [{"port": 0-65535, "cidr": "0.0.0.0/0"}]}'::jsonb, 'unknown', 'cli', 88.0);

-- Cloud Identity Events (assume role + privilege escalation)
INSERT INTO cloud_identity_events (event_id, cloud_provider, account_id, event_type, principal_id, principal_type, principal_name, action_performed, privilege_escalated, golden_ticket, source_ip, severity, risk_score, event_timestamp) VALUES
('CIE-001', 'aws', '123456789012', 'assume_role', 'AIDAI1234567890ABCDE', 'user', 'attacker@example.com', 'AssumeRole', true, false, '203.0.113.99', 'critical', 92.0, NOW() - INTERVAL '2 hours'),
('CIE-002', 'azure', 'sub-abc-123', 'privilege_escalation', 'obj-id-xyz-789', 'user', 'compromised_admin@example.com', 'RoleAssignmentCreate', true, false, '198.51.100.123', 'critical', 95.0, NOW() - INTERVAL '1 day'),
('CIE-003', 'gcp', 'project-12345', 'create_access_key', 'service-account@project.iam.gserviceaccount.com', 'service_account', 'suspicious-sa', 'iam.serviceAccountKeys.create', false, false, '192.0.2.50', 'high', 75.0, NOW() - INTERVAL '5 hours');

-- Cloud Resource Inventory
INSERT INTO cloud_resource_inventory (resource_uuid, cloud_provider, account_id, region, resource_id, resource_type, resource_name, service, publicly_accessible, encryption_enabled, criticality, risk_score) VALUES
('RES-001', 'aws', '123456789012', 'us-east-1', 'i-0123456789abcdef0', 'ec2_instance', 'web-server-prod-1', 'ec2', true, false, 'critical', 78.0),
('RES-002', 'aws', '123456789012', 'us-west-2', 's3://prod-data-lake', 's3_bucket', 'prod-data-lake', 's3', false, true, 'critical', 45.0),
('RES-003', 'azure', 'sub-abc-123', 'eastus', '/subscriptions/sub-abc-123/resourceGroups/rg-prod', 'resource_group', 'rg-prod', 'resource_manager', false, true, 'high', 32.0);

-- Cloud Security Groups (overly permissive)
INSERT INTO cloud_security_groups (security_group_uuid, cloud_provider, account_id, security_group_id, security_group_name, allows_all_traffic, allows_public_internet, ssh_exposed, rdp_exposed, risk_score) VALUES
('SG-001', 'aws', '123456789012', 'sg-0123456789abcdef', 'production-web-sg', false, true, true, false, 85.0),
('SG-002', 'aws', '123456789012', 'sg-fedcba9876543210', 'default-sg', true, true, true, true, 98.0);

-- Cloud Attack Paths (privilege escalation path)
INSERT INTO cloud_attack_paths (attack_path_id, cloud_provider, account_ids, path_name, attack_type, starting_point, target_resource, path_steps, step_count, exploitability_score, impact_score, overall_risk_score, severity) VALUES
('AP-001', 'aws', ARRAY['123456789012'], 'IAM User to Admin via Lambda', 'privilege_escalation', '{"type": "iam_user", "name": "developer"}'::jsonb, '{"type": "iam_role", "name": "AdminRole"}'::jsonb, '[{"step": 1, "action": "Invoke Lambda with IAM role"}, {"step": 2, "action": "Lambda assumes AdminRole"}, {"step": 3, "action": "Full admin access gained"}]'::jsonb, 3, 75.0, 95.0, 92.0, 'critical'),
('AP-002', 'multi_cloud', ARRAY['123456789012', 'sub-abc-123'], 'Cross-Cloud Data Exfiltration', 'data_exfiltration', '{"type": "compromised_vm", "cloud": "aws"}'::jsonb, '{"type": "storage_account", "cloud": "azure"}'::jsonb, '[{"step": 1, "action": "Compromise AWS EC2"}, {"step": 2, "action": "Steal Azure credentials from EC2"}, {"step": 3, "action": "Access Azure Storage"}, {"step": 4, "action": "Exfiltrate data"}]'::jsonb, 4, 68.0, 88.0, 85.0, 'high');

-- Confirmation message
DO $$
BEGIN
  RAISE NOTICE 'Successfully populated 18 new correlation tables with realistic attack scenarios!';
  RAISE NOTICE 'Supply Chain: 6 tables with vendor breaches and SolarWinds-style attacks';
  RAISE NOTICE 'DevOps/CI/CD: 6 tables with secret leaks and container exploits';
  RAISE NOTICE 'Cloud Posture: 6 tables with misconfigurations and privilege escalation paths';
END $$;
