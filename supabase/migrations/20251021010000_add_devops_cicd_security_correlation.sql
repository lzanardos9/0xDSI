/*
  # DevOps & CI/CD Pipeline Security Correlation System

  1. New Tables
    - `cicd_pipeline_events`
      - Pipeline execution security monitoring
      - Secret exposure detection
      - Unsigned artifact tracking
      - Privilege escalation detection

    - `container_security_events`
      - Container and Kubernetes security monitoring
      - Vulnerability tracking per image
      - Runtime anomaly detection
      - Lateral movement in containers

    - `code_security_events`
      - Code repository security monitoring
      - Secret leak detection (API keys, passwords)
      - Malicious dependency detection
      - Author anomaly detection

    - `iac_drift_detection`
      - Infrastructure as Code drift monitoring
      - Unauthorized changes to cloud resources
      - Security group exposure detection
      - State vs. actual comparison

    - `pipeline_security_policies`
      - Security policy definitions for pipelines
      - Compliance checks (signed commits, scans)
      - Policy violations tracking

    - `software_supply_chain_attacks`
      - Dependency confusion attacks
      - Malicious package injection
      - Typosquatting detection
      - Build artifact tampering

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated and DevSecOps teams

  3. Features
    - Secret exposure correlation (code → build → runtime)
    - Malicious dependency → container compromise
    - IaC drift → production exploit
    - Build artifact tampering detection
*/

-- CI/CD Pipeline Security Events
CREATE TABLE IF NOT EXISTS cicd_pipeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id text NOT NULL,
  pipeline_name text NOT NULL,
  pipeline_type text CHECK (pipeline_type IN ('build', 'test', 'deploy', 'release', 'rollback')) NOT NULL,

  repo_name text NOT NULL,
  repo_url text,
  branch text NOT NULL,
  commit_hash text NOT NULL,
  commit_author text,
  commit_message text,

  triggered_by text NOT NULL,
  trigger_type text CHECK (trigger_type IN ('manual', 'automated', 'scheduled', 'webhook', 'api')) DEFAULT 'automated',

  build_number integer,
  build_status text CHECK (build_status IN ('success', 'failed', 'aborted', 'timeout')) NOT NULL,

  execution_start timestamptz DEFAULT now(),
  execution_end timestamptz,
  execution_duration_seconds integer,

  deployment_target text CHECK (deployment_target IN ('production', 'staging', 'development', 'test', 'none')),
  deployment_environment jsonb,

  build_artifacts jsonb DEFAULT '[]'::jsonb,
  artifact_hashes jsonb DEFAULT '{}'::jsonb,

  secret_exposure_detected boolean DEFAULT false,
  secrets_found jsonb DEFAULT '[]'::jsonb,

  unsigned_artifact boolean DEFAULT false,
  unsigned_commit boolean DEFAULT false,

  vulnerable_dependencies_count integer DEFAULT 0,
  critical_vulnerabilities integer DEFAULT 0,
  high_vulnerabilities integer DEFAULT 0,

  security_scan_passed boolean DEFAULT false,
  scan_results jsonb,

  privilege_escalation boolean DEFAULT false,
  privileged_containers_deployed boolean DEFAULT false,

  compliance_violations jsonb DEFAULT '[]'::jsonb,

  unusual_deployment_time boolean DEFAULT false,
  unusual_deployer boolean DEFAULT false,
  bypass_approvals boolean DEFAULT false,

  risk_score numeric(5,2) DEFAULT 0,

  alert_generated boolean DEFAULT false,
  alert_severity text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_cicd_pipeline ON cicd_pipeline_events(pipeline_id);
CREATE INDEX idx_cicd_repo ON cicd_pipeline_events(repo_name);
CREATE INDEX idx_cicd_branch ON cicd_pipeline_events(branch);
CREATE INDEX idx_cicd_time ON cicd_pipeline_events(execution_start DESC);
CREATE INDEX idx_cicd_secrets ON cicd_pipeline_events(secret_exposure_detected);
CREATE INDEX idx_cicd_unsigned ON cicd_pipeline_events(unsigned_artifact);
CREATE INDEX idx_cicd_risk ON cicd_pipeline_events(risk_score DESC);
CREATE INDEX idx_cicd_target ON cicd_pipeline_events(deployment_target);

-- Container & Kubernetes Security Events
CREATE TABLE IF NOT EXISTS container_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,

  container_id text NOT NULL,
  container_name text,
  pod_name text,
  namespace text,
  cluster text,

  image_name text NOT NULL,
  image_registry text,
  image_tag text,
  image_digest text,

  base_image text,
  base_image_vulnerabilities integer DEFAULT 0,

  total_vulnerabilities integer DEFAULT 0,
  critical_vulnerabilities integer DEFAULT 0,
  high_vulnerabilities integer DEFAULT 0,
  medium_vulnerabilities integer DEFAULT 0,
  low_vulnerabilities integer DEFAULT 0,

  malware_detected boolean DEFAULT false,
  crypto_miner_detected boolean DEFAULT false,

  privileged_mode boolean DEFAULT false,
  host_network_access boolean DEFAULT false,
  host_pid_namespace boolean DEFAULT false,
  host_ipc_namespace boolean DEFAULT false,

  capabilities_added text[],
  dangerous_capabilities boolean DEFAULT false,

  secrets_mounted text[],
  sensitive_volumes_mounted text[],

  suspicious_process_spawned boolean DEFAULT false,
  suspicious_processes jsonb DEFAULT '[]'::jsonb,

  outbound_connections jsonb DEFAULT '[]'::jsonb,
  unusual_network_activity boolean DEFAULT false,
  external_connections_count integer DEFAULT 0,

  lateral_movement_detected boolean DEFAULT false,
  lateral_movement_targets text[],

  privilege_escalation_attempt boolean DEFAULT false,

  file_system_changes jsonb DEFAULT '[]'::jsonb,
  suspicious_file_modifications boolean DEFAULT false,

  runtime_anomalies jsonb DEFAULT '[]'::jsonb,

  compliance_violations text[],

  risk_score numeric(5,2) DEFAULT 0,
  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'low',

  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_container_id ON container_security_events(container_id);
CREATE INDEX idx_container_image ON container_security_events(image_name);
CREATE INDEX idx_container_cluster ON container_security_events(cluster, namespace);
CREATE INDEX idx_container_privileged ON container_security_events(privileged_mode);
CREATE INDEX idx_container_malware ON container_security_events(malware_detected);
CREATE INDEX idx_container_lateral ON container_security_events(lateral_movement_detected);
CREATE INDEX idx_container_risk ON container_security_events(risk_score DESC);
CREATE INDEX idx_container_severity ON container_security_events(severity);

-- Code Repository Security Events
CREATE TABLE IF NOT EXISTS code_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,

  repo_name text NOT NULL,
  repo_url text,
  repo_type text CHECK (repo_type IN ('git', 'svn', 'mercurial')) DEFAULT 'git',

  branch text NOT NULL,
  commit_hash text NOT NULL,
  commit_author text NOT NULL,
  commit_author_email text,
  commit_timestamp timestamptz NOT NULL,
  commit_message text,

  event_type text CHECK (event_type IN ('secret_leak', 'malicious_dependency', 'vulnerability_introduced', 'backdoor_detected', 'supply_chain_risk', 'author_anomaly', 'suspicious_code_pattern')) NOT NULL,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  secrets_found jsonb DEFAULT '[]'::jsonb,
  secret_types text[],
  api_keys_exposed boolean DEFAULT false,
  passwords_exposed boolean DEFAULT false,
  tokens_exposed boolean DEFAULT false,
  certificates_exposed boolean DEFAULT false,

  files_affected text[],
  lines_of_code_affected integer,

  malicious_code_detected boolean DEFAULT false,
  malicious_patterns jsonb DEFAULT '[]'::jsonb,

  dependency_changes jsonb DEFAULT '[]'::jsonb,
  new_dependencies text[],
  dependency_risk_score numeric(5,2) DEFAULT 0,
  known_malicious_dependency boolean DEFAULT false,
  typosquatting_detected boolean DEFAULT false,

  vulnerabilities_introduced integer DEFAULT 0,
  cve_ids text[],

  author_anomaly boolean DEFAULT false,
  anomaly_reasons text[],
  first_time_committer boolean DEFAULT false,
  unusual_commit_time boolean DEFAULT false,
  unusual_commit_volume boolean DEFAULT false,

  code_obfuscation_detected boolean DEFAULT false,

  risk_score numeric(5,2) DEFAULT 0,

  remediation_status text CHECK (remediation_status IN ('open', 'investigating', 'remediated', 'false_positive')) DEFAULT 'open',
  remediation_commit text,

  automated_fix_available boolean DEFAULT false,

  detected_by text,

  alert_sent boolean DEFAULT false,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_code_repo ON code_security_events(repo_name);
CREATE INDEX idx_code_commit ON code_security_events(commit_hash);
CREATE INDEX idx_code_author ON code_security_events(commit_author);
CREATE INDEX idx_code_event_type ON code_security_events(event_type);
CREATE INDEX idx_code_secrets ON code_security_events(api_keys_exposed);
CREATE INDEX idx_code_malicious ON code_security_events(malicious_code_detected);
CREATE INDEX idx_code_risk ON code_security_events(risk_score DESC);
CREATE INDEX idx_code_severity ON code_security_events(severity);

-- Infrastructure as Code Drift Detection
CREATE TABLE IF NOT EXISTS iac_drift_detection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drift_id text UNIQUE NOT NULL,

  cloud_provider text CHECK (cloud_provider IN ('aws', 'azure', 'gcp', 'oci', 'digitalocean')) NOT NULL,
  region text,

  resource_id text NOT NULL,
  resource_type text NOT NULL,
  resource_name text,

  drift_type text CHECK (drift_type IN ('unauthorized_change', 'deleted_resource', 'security_exposure', 'compliance_violation', 'configuration_tampered', 'privilege_escalation')) NOT NULL,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  expected_state jsonb NOT NULL,
  actual_state jsonb NOT NULL,
  drift_details jsonb,

  changed_properties text[],

  security_impact text,
  security_group_exposed boolean DEFAULT false,
  public_access_enabled boolean DEFAULT false,
  encryption_disabled boolean DEFAULT false,
  logging_disabled boolean DEFAULT false,

  changed_by text,
  change_method text CHECK (change_method IN ('console', 'cli', 'api', 'terraform', 'cloudformation', 'unknown')),
  change_timestamp timestamptz,

  terraform_managed boolean DEFAULT false,
  terraform_state_mismatch boolean DEFAULT false,

  compliance_frameworks_affected text[],

  auto_remediation_available boolean DEFAULT false,
  remediation_script text,

  remediation_status text CHECK (remediation_status IN ('detected', 'investigating', 'approved', 'remediated', 'accepted_risk')) DEFAULT 'detected',

  risk_score numeric(5,2) DEFAULT 0,

  alert_sent boolean DEFAULT false,

  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_iac_resource ON iac_drift_detection(resource_id);
CREATE INDEX idx_iac_type ON iac_drift_detection(resource_type);
CREATE INDEX idx_iac_drift_type ON iac_drift_detection(drift_type);
CREATE INDEX idx_iac_provider ON iac_drift_detection(cloud_provider);
CREATE INDEX idx_iac_severity ON iac_drift_detection(severity);
CREATE INDEX idx_iac_exposure ON iac_drift_detection(security_group_exposed);
CREATE INDEX idx_iac_risk ON iac_drift_detection(risk_score DESC);

-- Pipeline Security Policies
CREATE TABLE IF NOT EXISTS pipeline_security_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id text UNIQUE NOT NULL,
  policy_name text NOT NULL,
  description text,

  policy_type text CHECK (policy_type IN ('mandatory', 'recommended', 'best_practice')) DEFAULT 'mandatory',

  applies_to_pipelines text[],
  applies_to_repos text[],
  applies_to_branches text[],

  require_signed_commits boolean DEFAULT false,
  require_code_review boolean DEFAULT false,
  minimum_reviewers integer DEFAULT 1,

  require_security_scan boolean DEFAULT true,
  block_on_vulnerabilities boolean DEFAULT true,
  vulnerability_threshold text,

  require_signed_artifacts boolean DEFAULT false,
  require_sbom boolean DEFAULT false,

  allowed_deployment_times jsonb,
  require_approval_for_production boolean DEFAULT true,

  max_secrets_score integer DEFAULT 0,

  compliance_frameworks text[],

  enabled boolean DEFAULT true,

  violations_count integer DEFAULT 0,
  last_violation_at timestamptz,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_policy_type ON pipeline_security_policies(policy_type);
CREATE INDEX idx_policy_enabled ON pipeline_security_policies(enabled);

-- Software Supply Chain Attacks
CREATE TABLE IF NOT EXISTS software_supply_chain_attacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attack_id text UNIQUE NOT NULL,

  attack_type text CHECK (attack_type IN ('dependency_confusion', 'malicious_package', 'typosquatting', 'build_artifact_tampering', 'compromised_maintainer', 'backdoor_injection')) NOT NULL,

  package_manager text CHECK (package_manager IN ('npm', 'pypi', 'maven', 'nuget', 'rubygems', 'cargo', 'go')) NOT NULL,
  package_name text NOT NULL,
  package_version text,

  legitimate_package text,
  malicious_package text,

  affected_repos text[],
  affected_pipelines text[],

  detection_method text,
  detection_timestamp timestamptz DEFAULT now(),

  malicious_behavior jsonb,

  public_disclosure boolean DEFAULT false,
  cve_id text,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'high',

  impact_assessment text,
  systems_compromised text[],

  remediation_status text CHECK (remediation_status IN ('detected', 'investigating', 'remediating', 'resolved')) DEFAULT 'detected',
  remediation_steps jsonb,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_supply_attack_type ON software_supply_chain_attacks(attack_type);
CREATE INDEX idx_supply_package ON software_supply_chain_attacks(package_name);
CREATE INDEX idx_supply_severity ON software_supply_chain_attacks(severity);

-- Enable RLS
ALTER TABLE cicd_pipeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE container_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE iac_drift_detection ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_security_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE software_supply_chain_attacks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Auth users read cicd events" ON cicd_pipeline_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert cicd events" ON cicd_pipeline_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read container events" ON container_security_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert container events" ON container_security_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read code events" ON code_security_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage code events" ON code_security_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read iac drift" ON iac_drift_detection FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert iac drift" ON iac_drift_detection FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read policies" ON pipeline_security_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage policies" ON pipeline_security_policies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read supply chain attacks" ON software_supply_chain_attacks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage supply chain attacks" ON software_supply_chain_attacks FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Anon policies for demo
CREATE POLICY "Anon read cicd events" ON cicd_pipeline_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read container events" ON container_security_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read code events" ON code_security_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read iac drift" ON iac_drift_detection FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read policies" ON pipeline_security_policies FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read supply chain attacks" ON software_supply_chain_attacks FOR SELECT TO anon USING (true);
