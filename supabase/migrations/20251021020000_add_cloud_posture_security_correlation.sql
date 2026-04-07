/*
  # Cloud Posture & Multi-Cloud Security Correlation System

  1. New Tables
    - `cloud_posture_violations`
      - Multi-cloud security posture violations
      - CIS benchmark compliance tracking
      - Public exposure detection
      - Weak encryption and missing logging

    - `cloud_config_drift`
      - Real-time configuration drift detection
      - Service-specific monitoring (S3, EC2, Lambda, RDS, etc.)
      - Unauthorized changes tracking
      - Change attribution (who, when, how)

    - `cloud_identity_events`
      - Cloud IAM security events
      - Role assumption tracking
      - Permission escalation detection
      - Golden ticket / forged token detection

    - `cloud_resource_inventory`
      - Complete multi-cloud asset inventory
      - Resource relationships and dependencies
      - Security configuration baseline

    - `cloud_security_groups`
      - Security group and firewall rule tracking
      - Overly permissive rule detection
      - Change history and audit trail

    - `cloud_attack_paths`
      - Attack path analysis across cloud resources
      - Privilege escalation paths
      - Data exfiltration routes

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated cloud security teams

  3. Features
    - Multi-cloud support (AWS, Azure, GCP, OCI)
    - Real-time drift detection
    - IAM attack correlation
    - Attack path visualization
    - CIS benchmark compliance
*/

-- Cloud Posture Violations
CREATE TABLE IF NOT EXISTS cloud_posture_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'alibaba', 'multi_cloud')) NOT NULL,
  account_id text NOT NULL,
  account_name text,
  region text,

  resource_id text NOT NULL,
  resource_type text NOT NULL,
  resource_name text,
  resource_arn text,

  violation_type text CHECK (violation_type IN ('public_exposure', 'weak_encryption', 'missing_logging', 'overly_permissive', 'unencrypted_data', 'missing_backup', 'non_compliant', 'misconfiguration', 'vulnerable_version')) NOT NULL,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  description text NOT NULL,
  remediation_steps text,

  cis_benchmark_reference text,
  cis_version text,
  cis_level integer,

  compliance_frameworks text[],
  nist_control text,
  pci_requirement text,

  publicly_accessible boolean DEFAULT false,
  internet_facing boolean DEFAULT false,

  encryption_enabled boolean DEFAULT false,
  encryption_type text,

  logging_enabled boolean DEFAULT false,
  monitoring_enabled boolean DEFAULT false,

  mfa_enabled boolean DEFAULT false,

  configuration_details jsonb,

  risk_score numeric(5,2) DEFAULT 0,

  first_detected timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),

  remediation_status text CHECK (remediation_status IN ('open', 'in_progress', 'remediated', 'risk_accepted', 'false_positive')) DEFAULT 'open',
  remediation_date timestamptz,
  remediated_by text,

  auto_remediation_available boolean DEFAULT false,
  auto_remediation_script text,

  recurrence_count integer DEFAULT 1,

  alert_sent boolean DEFAULT false,
  ticket_id text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cloud_violation_provider ON cloud_posture_violations(cloud_provider);
CREATE INDEX idx_cloud_violation_account ON cloud_posture_violations(account_id);
CREATE INDEX idx_cloud_violation_resource ON cloud_posture_violations(resource_id);
CREATE INDEX idx_cloud_violation_type ON cloud_posture_violations(violation_type);
CREATE INDEX idx_cloud_violation_severity ON cloud_posture_violations(severity);
CREATE INDEX idx_cloud_violation_public ON cloud_posture_violations(publicly_accessible);
CREATE INDEX idx_cloud_violation_status ON cloud_posture_violations(remediation_status);
CREATE INDEX idx_cloud_violation_risk ON cloud_posture_violations(risk_score DESC);

-- Cloud Configuration Drift
CREATE TABLE IF NOT EXISTS cloud_config_drift (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_id text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'alibaba')) NOT NULL,
  account_id text NOT NULL,
  region text,

  resource_id text NOT NULL,
  resource_type text NOT NULL,
  resource_name text,

  service text NOT NULL,

  drift_type text CHECK (drift_type IN ('unauthorized_change', 'privilege_escalation', 'security_exposure', 'configuration_deletion', 'policy_modification', 'access_control_change')) NOT NULL,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  previous_config jsonb NOT NULL,
  current_config jsonb NOT NULL,
  config_diff jsonb,

  changed_properties text[],

  security_impact_score numeric(5,2) DEFAULT 0,
  security_impact_description text,

  changed_by text,
  changed_by_type text CHECK (changed_by_type IN ('iam_user', 'iam_role', 'service_account', 'root_account', 'federated_user', 'unknown')),

  change_source text CHECK (change_source IN ('console', 'cli', 'api', 'terraform', 'cloudformation', 'ansible', 'sdk', 'unknown')) DEFAULT 'unknown',

  change_timestamp timestamptz,
  change_request_id text,

  approved_change boolean DEFAULT false,
  approval_ticket_id text,

  iac_managed boolean DEFAULT false,
  iac_tool text,
  iac_state_synced boolean DEFAULT true,

  baseline_deviation boolean DEFAULT false,

  auto_revert_available boolean DEFAULT false,
  revert_script text,

  investigation_status text CHECK (investigation_status IN ('new', 'investigating', 'confirmed_malicious', 'confirmed_benign', 'reverted')) DEFAULT 'new',

  alert_generated boolean DEFAULT false,

  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_drift_provider ON cloud_config_drift(cloud_provider);
CREATE INDEX idx_drift_account ON cloud_config_drift(account_id);
CREATE INDEX idx_drift_resource ON cloud_config_drift(resource_id);
CREATE INDEX idx_drift_service ON cloud_config_drift(service);
CREATE INDEX idx_drift_type ON cloud_config_drift(drift_type);
CREATE INDEX idx_drift_changed_by ON cloud_config_drift(changed_by);
CREATE INDEX idx_drift_severity ON cloud_config_drift(severity);
CREATE INDEX idx_drift_approved ON cloud_config_drift(approved_change);
CREATE INDEX idx_drift_security_impact ON cloud_config_drift(security_impact_score DESC);

-- Cloud Identity Events
CREATE TABLE IF NOT EXISTS cloud_identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'alibaba')) NOT NULL,
  account_id text NOT NULL,
  region text,

  event_type text CHECK (event_type IN ('assume_role', 'create_access_key', 'privilege_escalation', 'policy_attached', 'user_created', 'role_created', 'permission_granted', 'mfa_disabled', 'password_changed', 'credential_exposed', 'token_forged')) NOT NULL,

  principal_id text NOT NULL,
  principal_type text CHECK (principal_type IN ('user', 'role', 'service_account', 'root', 'federated_user', 'application')) NOT NULL,
  principal_name text,

  target_resource text,
  target_resource_type text,

  action_performed text NOT NULL,
  permissions_granted text[],
  permissions_abused jsonb DEFAULT '[]'::jsonb,

  privilege_level_before text,
  privilege_level_after text,
  privilege_escalated boolean DEFAULT false,

  source_ip inet,
  source_country text,
  user_agent text,

  mfa_used boolean DEFAULT false,
  session_duration_minutes integer,

  unusual_location boolean DEFAULT false,
  unusual_time boolean DEFAULT false,
  unusual_action boolean DEFAULT false,

  golden_ticket boolean DEFAULT false,
  forged_token boolean DEFAULT false,
  credential_stuffing boolean DEFAULT false,

  assumed_role text,
  role_session_name text,
  external_id text,

  api_calls_made integer DEFAULT 0,
  sensitive_apis_called text[],

  data_accessed boolean DEFAULT false,
  data_exfiltrated boolean DEFAULT false,

  attack_technique text,
  mitre_tactic text,
  mitre_technique text,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  risk_score numeric(5,2) DEFAULT 0,

  alert_generated boolean DEFAULT false,
  incident_created boolean DEFAULT false,

  event_timestamp timestamptz NOT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_identity_provider ON cloud_identity_events(cloud_provider);
CREATE INDEX idx_identity_account ON cloud_identity_events(account_id);
CREATE INDEX idx_identity_type ON cloud_identity_events(event_type);
CREATE INDEX idx_identity_principal ON cloud_identity_events(principal_id);
CREATE INDEX idx_identity_escalation ON cloud_identity_events(privilege_escalated);
CREATE INDEX idx_identity_golden ON cloud_identity_events(golden_ticket);
CREATE INDEX idx_identity_severity ON cloud_identity_events(severity);
CREATE INDEX idx_identity_time ON cloud_identity_events(event_timestamp DESC);

-- Cloud Resource Inventory
CREATE TABLE IF NOT EXISTS cloud_resource_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_uuid text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'alibaba')) NOT NULL,
  account_id text NOT NULL,
  region text,

  resource_id text NOT NULL,
  resource_type text NOT NULL,
  resource_name text,
  resource_arn text,

  service text NOT NULL,

  tags jsonb DEFAULT '{}'::jsonb,
  labels jsonb DEFAULT '{}'::jsonb,

  creation_date timestamptz,
  created_by text,

  status text CHECK (status IN ('running', 'stopped', 'terminated', 'pending', 'active', 'inactive')) DEFAULT 'active',

  publicly_accessible boolean DEFAULT false,
  internet_facing boolean DEFAULT false,

  encryption_enabled boolean DEFAULT false,
  encryption_type text,
  kms_key_id text,

  backup_enabled boolean DEFAULT false,
  last_backup_date timestamptz,

  monitoring_enabled boolean DEFAULT false,
  logging_enabled boolean DEFAULT false,

  security_groups text[],
  network_acls text[],
  vpc_id text,
  subnet_id text,

  iam_role text,
  permissions jsonb,

  dependencies jsonb DEFAULT '[]'::jsonb,
  dependents jsonb DEFAULT '[]'::jsonb,

  criticality text CHECK (criticality IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  data_classification text,

  compliance_requirements text[],

  cost_monthly numeric(10,2),

  vulnerabilities_count integer DEFAULT 0,
  misconfigurations_count integer DEFAULT 0,

  risk_score numeric(5,2) DEFAULT 0,

  last_scanned timestamptz,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_inventory_provider ON cloud_resource_inventory(cloud_provider);
CREATE INDEX idx_inventory_account ON cloud_resource_inventory(account_id);
CREATE INDEX idx_inventory_resource ON cloud_resource_inventory(resource_id);
CREATE INDEX idx_inventory_type ON cloud_resource_inventory(resource_type);
CREATE INDEX idx_inventory_service ON cloud_resource_inventory(service);
CREATE INDEX idx_inventory_public ON cloud_resource_inventory(publicly_accessible);
CREATE INDEX idx_inventory_criticality ON cloud_resource_inventory(criticality);
CREATE INDEX idx_inventory_risk ON cloud_resource_inventory(risk_score DESC);

-- Cloud Security Groups
CREATE TABLE IF NOT EXISTS cloud_security_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_group_uuid text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'alibaba')) NOT NULL,
  account_id text NOT NULL,
  region text,

  security_group_id text NOT NULL,
  security_group_name text,
  description text,

  vpc_id text,

  rules jsonb NOT NULL,
  ingress_rules jsonb DEFAULT '[]'::jsonb,
  egress_rules jsonb DEFAULT '[]'::jsonb,

  allows_all_traffic boolean DEFAULT false,
  allows_public_internet boolean DEFAULT false,
  allows_all_ports boolean DEFAULT false,

  overly_permissive_rules jsonb DEFAULT '[]'::jsonb,

  dangerous_ports_exposed text[],
  ssh_exposed boolean DEFAULT false,
  rdp_exposed boolean DEFAULT false,
  database_ports_exposed boolean DEFAULT false,

  attached_resources text[],
  attached_resources_count integer DEFAULT 0,

  last_modified timestamptz,
  modified_by text,
  change_history jsonb DEFAULT '[]'::jsonb,

  compliance_violations text[],

  risk_score numeric(5,2) DEFAULT 0,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_secgroup_provider ON cloud_security_groups(cloud_provider);
CREATE INDEX idx_secgroup_account ON cloud_security_groups(account_id);
CREATE INDEX idx_secgroup_id ON cloud_security_groups(security_group_id);
CREATE INDEX idx_secgroup_all_traffic ON cloud_security_groups(allows_all_traffic);
CREATE INDEX idx_secgroup_public ON cloud_security_groups(allows_public_internet);
CREATE INDEX idx_secgroup_risk ON cloud_security_groups(risk_score DESC);

-- Cloud Attack Paths
CREATE TABLE IF NOT EXISTS cloud_attack_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attack_path_id text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'multi_cloud')) NOT NULL,
  account_ids text[],

  path_name text NOT NULL,
  description text,

  attack_type text CHECK (attack_type IN ('privilege_escalation', 'data_exfiltration', 'lateral_movement', 'resource_hijacking', 'persistence')) NOT NULL,

  starting_point jsonb NOT NULL,
  target_resource jsonb NOT NULL,

  path_steps jsonb NOT NULL,
  step_count integer NOT NULL,

  exploitability_score numeric(5,2) DEFAULT 0,
  impact_score numeric(5,2) DEFAULT 0,
  overall_risk_score numeric(5,2) DEFAULT 0,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  mitre_tactics text[],
  mitre_techniques text[],

  attack_prerequisites jsonb,
  required_permissions text[],

  vulnerable_resources text[],
  misconfigurations_exploited text[],

  detection_difficulty text CHECK (detection_difficulty IN ('easy', 'medium', 'hard', 'very_hard')) DEFAULT 'medium',

  remediation_priority integer DEFAULT 5,
  remediation_steps jsonb,

  blocked boolean DEFAULT false,
  blocked_at_step integer,
  blocking_controls text[],

  discovered_at timestamptz DEFAULT now(),
  last_validated timestamptz DEFAULT now(),
  path_still_valid boolean DEFAULT true,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_attack_path_provider ON cloud_attack_paths(cloud_provider);
CREATE INDEX idx_attack_path_type ON cloud_attack_paths(attack_type);
CREATE INDEX idx_attack_path_risk ON cloud_attack_paths(overall_risk_score DESC);
CREATE INDEX idx_attack_path_severity ON cloud_attack_paths(severity);
CREATE INDEX idx_attack_path_valid ON cloud_attack_paths(path_still_valid);

-- Enable RLS
ALTER TABLE cloud_posture_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_config_drift ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_identity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_resource_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_security_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE cloud_attack_paths ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Auth users read posture violations" ON cloud_posture_violations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage posture violations" ON cloud_posture_violations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read config drift" ON cloud_config_drift FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert config drift" ON cloud_config_drift FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read identity events" ON cloud_identity_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert identity events" ON cloud_identity_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read resource inventory" ON cloud_resource_inventory FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage resource inventory" ON cloud_resource_inventory FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read security groups" ON cloud_security_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage security groups" ON cloud_security_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read attack paths" ON cloud_attack_paths FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage attack paths" ON cloud_attack_paths FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon policies for demo
CREATE POLICY "Anon read posture violations" ON cloud_posture_violations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read config drift" ON cloud_config_drift FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read identity events" ON cloud_identity_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read resource inventory" ON cloud_resource_inventory FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read security groups" ON cloud_security_groups FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read attack paths" ON cloud_attack_paths FOR SELECT TO anon USING (true);
