/*
  # Supply Chain & Third-Party Risk Correlation System

  1. New Tables
    - `vendor_risk_profiles`
      - Comprehensive vendor risk assessment and tracking
      - Security ratings, access levels, incident history
      - Contract value and data access scope

    - `third_party_access_logs`
      - Real-time monitoring of vendor/contractor access
      - VPN, API, portal, and physical access tracking
      - Data transfer monitoring and anomaly detection

    - `supply_chain_events`
      - Supply chain security events (breaches, vulnerabilities, audits)
      - Cascading risk analysis across vendor network
      - Impact assessment and vendor correlation

    - `vendor_dependencies`
      - Vendor-to-vendor dependency mapping
      - Critical path analysis for supply chain attacks
      - Transitive risk calculation

    - `third_party_api_usage`
      - API key usage tracking per vendor
      - Rate limiting violations and abuse detection
      - Sensitive data access monitoring

    - `contractor_sessions`
      - Contractor and temporary worker session tracking
      - Privileged access monitoring
      - Behavioral baseline for contractors

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated and admin access

  3. Features
    - SolarWinds-style attack detection
    - Vendor compromise correlation
    - Cascading risk analysis
    - API key leakage detection
    - Contractor abuse monitoring
*/

-- Vendor Risk Profiles
CREATE TABLE IF NOT EXISTS vendor_risk_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id text UNIQUE NOT NULL,
  vendor_name text NOT NULL,
  vendor_type text NOT NULL CHECK (vendor_type IN ('supplier', 'service_provider', 'technology_vendor', 'contractor_firm', 'partner', 'subcontractor')),

  risk_tier text NOT NULL CHECK (risk_tier IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',
  risk_score numeric(5,2) DEFAULT 50.0 CHECK (risk_score >= 0 AND risk_score <= 100),

  access_level text NOT NULL CHECK (access_level IN ('none', 'read_only', 'network_access', 'data_access', 'physical_access', 'code_access', 'admin_access')) DEFAULT 'none',
  security_rating numeric(5,2) DEFAULT 50.0,

  has_network_access boolean DEFAULT false,
  has_data_access boolean DEFAULT false,
  has_code_access boolean DEFAULT false,
  has_physical_access boolean DEFAULT false,

  data_access_scope jsonb DEFAULT '{}'::jsonb,
  systems_accessed text[],

  last_security_assessment timestamptz,
  next_assessment_due timestamptz,
  assessment_frequency_days integer DEFAULT 365,

  incidents_count integer DEFAULT 0,
  breaches_count integer DEFAULT 0,
  last_incident_date timestamptz,

  contract_value numeric(12,2),
  contract_start_date date,
  contract_end_date date,
  contract_status text CHECK (contract_status IN ('active', 'pending', 'expired', 'terminated')) DEFAULT 'active',

  security_questionnaire_completed boolean DEFAULT false,
  certifications jsonb DEFAULT '[]'::jsonb,
  insurance_coverage numeric(12,2),

  criticality_level text CHECK (criticality_level IN ('essential', 'important', 'standard', 'low')) DEFAULT 'standard',
  business_impact_if_compromised text,

  monitoring_enabled boolean DEFAULT true,
  alert_on_anomaly boolean DEFAULT true,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_vendor_risk_tier ON vendor_risk_profiles(risk_tier);
CREATE INDEX idx_vendor_risk_score ON vendor_risk_profiles(risk_score DESC);
CREATE INDEX idx_vendor_access_level ON vendor_risk_profiles(access_level);
CREATE INDEX idx_vendor_contract_status ON vendor_risk_profiles(contract_status);
CREATE INDEX idx_vendor_criticality ON vendor_risk_profiles(criticality_level);

-- Third-Party Access Logs
CREATE TABLE IF NOT EXISTS third_party_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendor_risk_profiles(id) ON DELETE CASCADE,

  access_id text NOT NULL,
  access_type text NOT NULL CHECK (access_type IN ('vpn', 'api', 'web_portal', 'ssh', 'rdp', 'contractor_badge', 'service_account', 'sftp', 'database')),

  user_identity text NOT NULL,
  source_ip inet,
  source_country text,

  target_system text,
  target_resource text,
  resources_accessed jsonb DEFAULT '[]'::jsonb,

  session_start timestamptz DEFAULT now(),
  session_end timestamptz,
  session_duration_minutes integer,

  actions_performed jsonb DEFAULT '[]'::jsonb,
  commands_executed text[],

  data_transferred_gb numeric(10,2) DEFAULT 0,
  files_downloaded integer DEFAULT 0,
  files_uploaded integer DEFAULT 0,

  unusual_activity boolean DEFAULT false,
  unusual_time boolean DEFAULT false,
  unusual_location boolean DEFAULT false,
  unusual_volume boolean DEFAULT false,

  privileged_access boolean DEFAULT false,
  sensitive_data_accessed boolean DEFAULT false,

  risk_score numeric(5,2) DEFAULT 0,
  anomaly_indicators jsonb DEFAULT '[]'::jsonb,

  alert_generated boolean DEFAULT false,
  alert_severity text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_third_party_access_vendor ON third_party_access_logs(vendor_id);
CREATE INDEX idx_third_party_access_type ON third_party_access_logs(access_type);
CREATE INDEX idx_third_party_access_time ON third_party_access_logs(session_start DESC);
CREATE INDEX idx_third_party_unusual ON third_party_access_logs(unusual_activity);
CREATE INDEX idx_third_party_risk ON third_party_access_logs(risk_score DESC);

-- Supply Chain Events
CREATE TABLE IF NOT EXISTS supply_chain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,
  vendor_id uuid REFERENCES vendor_risk_profiles(id) ON DELETE CASCADE,

  event_type text NOT NULL CHECK (event_type IN ('vendor_breach', 'data_leak', 'vulnerability_disclosed', 'audit_failure', 'cert_expiration', 'contract_violation', 'compromise_detected', 'ransomware', 'supply_chain_attack')),

  severity text NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  event_description text NOT NULL,
  event_source text,
  external_reference text,

  discovered_at timestamptz DEFAULT now(),
  confirmed boolean DEFAULT false,
  confirmation_source text,

  impact_assessment jsonb,
  affected_systems text[],
  affected_data_types text[],
  estimated_records_exposed integer,

  our_exposure boolean DEFAULT false,
  our_data_compromised boolean DEFAULT false,
  our_systems_at_risk boolean DEFAULT false,

  cascading_risk boolean DEFAULT false,
  related_vendors uuid[],
  downstream_impact_vendors text[],

  remediation_status text CHECK (remediation_status IN ('identified', 'investigating', 'remediating', 'mitigated', 'closed')) DEFAULT 'identified',
  remediation_plan text,
  remediation_deadline timestamptz,

  vendor_notified boolean DEFAULT false,
  vendor_response_received boolean DEFAULT false,
  vendor_response text,

  contract_implications text,
  financial_impact numeric(12,2),

  lessons_learned text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_supply_chain_event_vendor ON supply_chain_events(vendor_id);
CREATE INDEX idx_supply_chain_event_type ON supply_chain_events(event_type);
CREATE INDEX idx_supply_chain_severity ON supply_chain_events(severity);
CREATE INDEX idx_supply_chain_cascading ON supply_chain_events(cascading_risk);
CREATE INDEX idx_supply_chain_exposure ON supply_chain_events(our_exposure);
CREATE INDEX idx_supply_chain_status ON supply_chain_events(remediation_status);

-- Vendor Dependencies (for cascading risk analysis)
CREATE TABLE IF NOT EXISTS vendor_dependencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  primary_vendor_id uuid REFERENCES vendor_risk_profiles(id) ON DELETE CASCADE,
  dependent_vendor_id uuid REFERENCES vendor_risk_profiles(id) ON DELETE CASCADE,

  dependency_type text CHECK (dependency_type IN ('subcontractor', 'technology_provider', 'data_processor', 'service_dependency', 'infrastructure_provider')) NOT NULL,

  criticality text CHECK (criticality IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  data_flow_direction text CHECK (data_flow_direction IN ('to_dependent', 'from_dependent', 'bidirectional')),
  data_types_shared text[],

  single_point_of_failure boolean DEFAULT false,

  transitive_risk_score numeric(5,2) DEFAULT 0,

  documented boolean DEFAULT false,
  reviewed_date date,

  created_at timestamptz DEFAULT now(),
  UNIQUE(primary_vendor_id, dependent_vendor_id)
);

CREATE INDEX idx_vendor_dep_primary ON vendor_dependencies(primary_vendor_id);
CREATE INDEX idx_vendor_dep_dependent ON vendor_dependencies(dependent_vendor_id);
CREATE INDEX idx_vendor_dep_criticality ON vendor_dependencies(criticality);
CREATE INDEX idx_vendor_dep_spof ON vendor_dependencies(single_point_of_failure);

-- Third-Party API Usage Monitoring
CREATE TABLE IF NOT EXISTS third_party_api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendor_risk_profiles(id) ON DELETE CASCADE,

  api_key_id text NOT NULL,
  api_key_hash text,

  endpoint text NOT NULL,
  method text NOT NULL,

  request_timestamp timestamptz DEFAULT now(),
  response_status integer,
  response_time_ms integer,

  request_source_ip inet,
  user_agent text,

  data_accessed text[],
  sensitive_data_accessed boolean DEFAULT false,
  pii_accessed boolean DEFAULT false,

  rate_limit_exceeded boolean DEFAULT false,
  authentication_failed boolean DEFAULT false,

  unusual_endpoint boolean DEFAULT false,
  unusual_time boolean DEFAULT false,
  unusual_volume boolean DEFAULT false,

  potential_key_leak boolean DEFAULT false,
  key_used_from_unexpected_ip boolean DEFAULT false,

  risk_score numeric(5,2) DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_api_usage_vendor ON third_party_api_usage(vendor_id);
CREATE INDEX idx_api_usage_time ON third_party_api_usage(request_timestamp DESC);
CREATE INDEX idx_api_usage_risk ON third_party_api_usage(risk_score DESC);
CREATE INDEX idx_api_usage_key_leak ON third_party_api_usage(potential_key_leak);
CREATE INDEX idx_api_usage_sensitive ON third_party_api_usage(sensitive_data_accessed);

-- Contractor Sessions (behavioral tracking)
CREATE TABLE IF NOT EXISTS contractor_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid REFERENCES vendor_risk_profiles(id) ON DELETE CASCADE,

  contractor_id text NOT NULL,
  contractor_name text,
  contractor_role text,

  session_id text UNIQUE NOT NULL,
  session_start timestamptz DEFAULT now(),
  session_end timestamptz,

  access_type text CHECK (access_type IN ('temporary', 'recurring', 'emergency', 'scheduled')),

  systems_accessed text[],
  privileged_commands_count integer DEFAULT 0,

  files_accessed integer DEFAULT 0,
  files_modified integer DEFAULT 0,
  sensitive_files_accessed integer DEFAULT 0,

  baseline_deviation_score numeric(5,2) DEFAULT 0,
  unusual_behavior_detected boolean DEFAULT false,
  unusual_patterns jsonb DEFAULT '[]'::jsonb,

  approval_ticket_id text,
  supervisor_id text,

  session_extended boolean DEFAULT false,
  extension_approved boolean DEFAULT false,

  risk_score numeric(5,2) DEFAULT 0,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_contractor_vendor ON contractor_sessions(vendor_id);
CREATE INDEX idx_contractor_id ON contractor_sessions(contractor_id);
CREATE INDEX idx_contractor_time ON contractor_sessions(session_start DESC);
CREATE INDEX idx_contractor_risk ON contractor_sessions(risk_score DESC);
CREATE INDEX idx_contractor_unusual ON contractor_sessions(unusual_behavior_detected);

-- Enable RLS
ALTER TABLE vendor_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE third_party_access_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE supply_chain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_dependencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE third_party_api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE contractor_sessions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Auth users read vendor profiles" ON vendor_risk_profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage vendor profiles" ON vendor_risk_profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read third party access" ON third_party_access_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert third party access" ON third_party_access_logs FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read supply chain events" ON supply_chain_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage supply chain events" ON supply_chain_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read vendor deps" ON vendor_dependencies FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage vendor deps" ON vendor_dependencies FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read api usage" ON third_party_api_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert api usage" ON third_party_api_usage FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read contractor sessions" ON contractor_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert contractor sessions" ON contractor_sessions FOR INSERT TO authenticated WITH CHECK (true);

-- RLS Policies for anon (demo access)
CREATE POLICY "Anon read vendor profiles" ON vendor_risk_profiles FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read third party access" ON third_party_access_logs FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read supply chain events" ON supply_chain_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read vendor deps" ON vendor_dependencies FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read api usage" ON third_party_api_usage FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read contractor sessions" ON contractor_sessions FOR SELECT TO anon USING (true);
