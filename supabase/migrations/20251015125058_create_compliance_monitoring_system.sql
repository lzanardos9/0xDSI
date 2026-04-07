/*
  # Compliance Monitoring System

  1. New Tables
    - `compliance_frameworks`
      - Framework definitions (NIST, ISO 27001, GDPR, HIPAA, PCI DSS, SOC 2)
    - `compliance_controls`
      - Individual controls/requirements for each framework
    - `compliance_assessments`
      - Real-time compliance status assessments
    - `compliance_evidence`
      - Evidence artifacts for compliance validation
    - `compliance_gaps`
      - Identified compliance gaps and remediation tracking

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
*/

-- Compliance Frameworks
CREATE TABLE IF NOT EXISTS compliance_frameworks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_code text UNIQUE NOT NULL,
  framework_name text NOT NULL,
  version text NOT NULL,
  description text,
  category text NOT NULL,
  regulatory boolean DEFAULT false,
  last_updated timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE compliance_frameworks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to compliance_frameworks"
  ON compliance_frameworks FOR SELECT
  TO authenticated, anon
  USING (true);

-- Compliance Controls
CREATE TABLE IF NOT EXISTS compliance_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  control_id text NOT NULL,
  control_name text NOT NULL,
  description text,
  category text NOT NULL,
  priority text NOT NULL,
  implementation_status text DEFAULT 'not_started',
  automated_check boolean DEFAULT false,
  check_query text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(framework_id, control_id)
);

ALTER TABLE compliance_controls ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to compliance_controls"
  ON compliance_controls FOR SELECT
  TO authenticated, anon
  USING (true);

-- Compliance Assessments (Real-time status)
CREATE TABLE IF NOT EXISTS compliance_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  control_id uuid REFERENCES compliance_controls(id) ON DELETE CASCADE,
  status text NOT NULL,
  compliance_score numeric(5,2) NOT NULL,
  compliant_controls integer DEFAULT 0,
  total_controls integer DEFAULT 0,
  critical_gaps integer DEFAULT 0,
  high_gaps integer DEFAULT 0,
  medium_gaps integer DEFAULT 0,
  low_gaps integer DEFAULT 0,
  last_assessment timestamptz DEFAULT now(),
  next_assessment timestamptz,
  assessed_by text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE compliance_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to compliance_assessments"
  ON compliance_assessments FOR SELECT
  TO authenticated, anon
  USING (true);

-- Compliance Evidence
CREATE TABLE IF NOT EXISTS compliance_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  control_id uuid REFERENCES compliance_controls(id) ON DELETE CASCADE,
  evidence_type text NOT NULL,
  evidence_name text NOT NULL,
  evidence_location text,
  evidence_data jsonb,
  collection_method text,
  collected_at timestamptz DEFAULT now(),
  valid_until timestamptz,
  verified boolean DEFAULT false,
  verified_by text,
  verified_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE compliance_evidence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to compliance_evidence"
  ON compliance_evidence FOR SELECT
  TO authenticated, anon
  USING (true);

-- Compliance Gaps
CREATE TABLE IF NOT EXISTS compliance_gaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  framework_id uuid REFERENCES compliance_frameworks(id) ON DELETE CASCADE,
  control_id uuid REFERENCES compliance_controls(id) ON DELETE CASCADE,
  gap_title text NOT NULL,
  gap_description text,
  severity text NOT NULL,
  risk_level text NOT NULL,
  remediation_plan text,
  remediation_status text DEFAULT 'identified',
  assigned_to text,
  due_date timestamptz,
  resolved_at timestamptz,
  identified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE compliance_gaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow read access to compliance_gaps"
  ON compliance_gaps FOR SELECT
  TO authenticated, anon
  USING (true);

-- Insert Compliance Frameworks
INSERT INTO compliance_frameworks (framework_code, framework_name, version, description, category, regulatory) VALUES
('NIST-CSF', 'NIST Cybersecurity Framework', '2.0', 'Flexible framework with core functions: Identify, Protect, Detect, Respond, Recover, and Govern', 'Security', false),
('ISO-27001', 'ISO/IEC 27001', '2022', 'International standard for information security management systems', 'Security', false),
('GDPR', 'General Data Protection Regulation', '2018', 'EU regulation for data protection and privacy', 'Privacy', true),
('HIPAA', 'Health Insurance Portability and Accountability Act', '1996', 'US law for protecting sensitive patient health information', 'Healthcare', true),
('PCI-DSS', 'Payment Card Industry Data Security Standard', '4.0', 'Security standard for organizations that handle credit cards', 'Financial', true),
('SOC2', 'Service Organization Control 2', 'Type II', 'Trust Services Criteria for service organizations', 'Audit', false)
ON CONFLICT (framework_code) DO NOTHING;

-- Insert NIST CSF Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY['ID.AM-1', 'ID.AM-2', 'ID.RA-1', 'PR.AC-1', 'PR.AC-3', 'PR.DS-1', 'PR.DS-5', 'DE.AE-1', 'DE.AE-3', 'DE.CM-1', 'RS.RP-1', 'RS.CO-2', 'RS.AN-1', 'RC.RP-1', 'RC.CO-1', 'GV.PO-1']),
  unnest(ARRAY['Asset Inventory', 'Software Inventory', 'Risk Assessment', 'Identity Management', 'Remote Access', 'Data Protection', 'Data Leak Prevention', 'Baseline Monitoring', 'Event Analysis', 'Security Monitoring', 'Response Planning', 'Incident Reporting', 'Incident Analysis', 'Recovery Planning', 'Recovery Communication', 'Policy Management']),
  unnest(ARRAY['Physical and software assets are inventoried', 'Software platforms are inventoried', 'Vulnerabilities are identified and prioritized', 'Identities and credentials are managed', 'Remote access is managed', 'Data at rest is protected', 'Protections against data leaks', 'Network operations are monitored', 'Event data are analyzed', 'The network is monitored', 'Response processes and procedures are executed', 'Incidents are reported', 'Incidents are investigated', 'Recovery activities are performed', 'Recovery activities are coordinated', 'Policy for cybersecurity is established']),
  unnest(ARRAY['Identify', 'Identify', 'Identify', 'Protect', 'Protect', 'Protect', 'Protect', 'Detect', 'Detect', 'Detect', 'Respond', 'Respond', 'Respond', 'Recover', 'Recover', 'Govern']),
  unnest(ARRAY['high', 'high', 'critical', 'critical', 'high', 'critical', 'high', 'critical', 'high', 'critical', 'high', 'medium', 'high', 'high', 'medium', 'high']),
  unnest(ARRAY['implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'in_progress', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'partially', 'partially', 'implemented']),
  unnest(ARRAY[true, true, true, true, true, true, true, true, true, true, false, false, true, false, false, false])
FROM compliance_frameworks f
WHERE f.framework_code = 'NIST-CSF'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Insert ISO 27001 Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY['A.5.1', 'A.5.10', 'A.8.1', 'A.8.2', 'A.8.3', 'A.8.8', 'A.8.23', 'A.8.24', 'A.5.7', 'A.8.10', 'A.8.16', 'A.5.29', 'A.5.30']),
  unnest(ARRAY['Information Security Policies', 'Acceptable Use', 'User Endpoint Devices', 'Privileged Access', 'Information Access', 'Management of Technical Vulnerabilities', 'Web Filtering', 'Cryptography', 'Threat Intelligence', 'Information Deletion', 'Monitoring Activities', 'ICT Readiness', 'ICT Continuity']),
  unnest(ARRAY['Policies for information security defined', 'Rules for acceptable use of information', 'Security requirements for endpoint devices', 'Use of privileged access rights restricted', 'Access to information restricted', 'Vulnerabilities identified and addressed', 'Access to external websites filtered', 'Use of cryptography policy', 'Information about threats collected', 'Information deleted when no longer needed', 'Networks, systems monitored for anomalies', 'ICT for business continuity planned', 'ICT continuity secured']),
  unnest(ARRAY['Organizational', 'Organizational', 'Technological', 'Technological', 'Technological', 'Technological', 'Technological', 'Technological', 'Organizational', 'Technological', 'Technological', 'Organizational', 'Organizational']),
  unnest(ARRAY['critical', 'medium', 'high', 'critical', 'critical', 'critical', 'medium', 'critical', 'high', 'high', 'critical', 'high', 'high']),
  unnest(ARRAY['implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'in_progress', 'implemented', 'partially', 'partially']),
  unnest(ARRAY[false, false, true, true, true, true, true, true, true, true, true, false, false])
FROM compliance_frameworks f
WHERE f.framework_code = 'ISO-27001'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Insert GDPR Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY['Art.5', 'Art.6', 'Art.25', 'Art.30', 'Art.32', 'Art.33', 'Art.35', 'Art.44-50']),
  unnest(ARRAY['Principles', 'Lawfulness', 'Data Protection by Design', 'Records of Processing', 'Security of Processing', 'Breach Notification', 'DPIA', 'International Transfers']),
  unnest(ARRAY['Principles relating to processing of personal data', 'Lawfulness of processing', 'Data protection by design and by default', 'Records of processing activities', 'Security of processing', 'Notification of personal data breach', 'Data protection impact assessment', 'Transfers of personal data to third countries']),
  unnest(ARRAY['Principles', 'Legal', 'Technical', 'Administrative', 'Technical', 'Administrative', 'Risk Management', 'Legal']),
  unnest(ARRAY['critical', 'critical', 'critical', 'high', 'critical', 'critical', 'high', 'high']),
  unnest(ARRAY['implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'partially', 'in_progress']),
  unnest(ARRAY[false, false, true, true, true, true, false, false])
FROM compliance_frameworks f
WHERE f.framework_code = 'GDPR'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Insert HIPAA Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY['164.308(a)(1)', '164.308(a)(3)', '164.308(a)(4)', '164.308(a)(5)', '164.310(a)(1)', '164.310(d)(1)', '164.312(a)(1)', '164.312(c)(1)', '164.312(e)(1)']),
  unnest(ARRAY['Security Management', 'Workforce Security', 'Information Access', 'Security Awareness', 'Facility Access', 'Workstation Use', 'Access Control', 'Integrity Controls', 'Transmission Security']),
  unnest(ARRAY['Security management process', 'Workforce security procedures', 'Information access management', 'Security awareness and training', 'Facility access controls', 'Workstation use policies', 'Unique user identification', 'Mechanism to authenticate ePHI', 'Transmission security measures']),
  unnest(ARRAY['Administrative', 'Administrative', 'Administrative', 'Administrative', 'Physical', 'Physical', 'Technical', 'Technical', 'Technical']),
  unnest(ARRAY['critical', 'high', 'critical', 'medium', 'high', 'medium', 'critical', 'critical', 'critical']),
  unnest(ARRAY['implemented', 'implemented', 'implemented', 'implemented', 'partially', 'implemented', 'implemented', 'implemented', 'implemented']),
  unnest(ARRAY[false, true, true, false, true, false, true, true, true])
FROM compliance_frameworks f
WHERE f.framework_code = 'HIPAA'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Insert PCI DSS Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY['1.1', '2.1', '3.1', '4.1', '5.1', '6.1', '7.1', '8.1', '9.1', '10.1', '11.1', '12.1']),
  unnest(ARRAY['Install Firewalls', 'Change Defaults', 'Protect Stored Data', 'Encrypt Transmission', 'Use Antivirus', 'Secure Systems', 'Restrict Access', 'Identify Users', 'Physical Access', 'Track Access', 'Test Security', 'Maintain Policy']),
  unnest(ARRAY['Install and maintain network security controls', 'Apply secure configurations to all system components', 'Protect stored account data', 'Protect cardholder data with strong cryptography during transmission', 'Protect all systems and networks from malicious software', 'Develop and maintain secure systems and software', 'Restrict access to system components and cardholder data by business need to know', 'Identify users and authenticate access to system components', 'Restrict physical access to cardholder data', 'Log and monitor all access to system components and cardholder data', 'Test security of systems and networks regularly', 'Support information security with organizational policies and programs']),
  unnest(ARRAY['Network', 'System', 'Data', 'Data', 'System', 'Development', 'Access', 'Access', 'Physical', 'Monitoring', 'Testing', 'Policy']),
  unnest(ARRAY['critical', 'critical', 'critical', 'critical', 'high', 'critical', 'critical', 'critical', 'high', 'critical', 'high', 'high']),
  unnest(ARRAY['implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'in_progress', 'implemented', 'implemented', 'partially', 'implemented', 'implemented', 'implemented']),
  unnest(ARRAY[true, true, true, true, true, true, true, true, true, true, true, false])
FROM compliance_frameworks f
WHERE f.framework_code = 'PCI-DSS'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Insert SOC 2 Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY['CC1.1', 'CC2.1', 'CC3.1', 'CC6.1', 'CC7.1', 'CC8.1', 'A1.1', 'PI1.1', 'C1.1']),
  unnest(ARRAY['Control Environment', 'Communication', 'Risk Assessment', 'Logical Access', 'System Operations', 'Change Management', 'Availability', 'Processing Integrity', 'Confidentiality']),
  unnest(ARRAY['Organization demonstrates commitment to integrity and ethical values', 'Internal and external communication', 'Entity specifies objectives with sufficient clarity', 'Entity implements logical access security software', 'Entity implements controls over system operations', 'Entity implements a change management process', 'Availability commitments are met', 'Processing is complete, valid, accurate, timely', 'Confidential information is protected']),
  unnest(ARRAY['Security', 'Security', 'Security', 'Security', 'Security', 'Security', 'Availability', 'Processing Integrity', 'Confidentiality']),
  unnest(ARRAY['critical', 'high', 'critical', 'critical', 'high', 'critical', 'high', 'high', 'critical']),
  unnest(ARRAY['implemented', 'implemented', 'implemented', 'implemented', 'implemented', 'in_progress', 'partially', 'implemented', 'implemented']),
  unnest(ARRAY[false, false, false, true, true, true, true, true, true])
FROM compliance_frameworks f
WHERE f.framework_code = 'SOC2'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Generate real-time compliance assessments
INSERT INTO compliance_assessments (framework_id, control_id, status, compliance_score, compliant_controls, total_controls, critical_gaps, high_gaps, medium_gaps, low_gaps, last_assessment, assessed_by)
SELECT
  c.framework_id,
  c.id as control_id,
  CASE
    WHEN c.implementation_status = 'implemented' THEN 'compliant'
    WHEN c.implementation_status = 'partially' THEN 'partial'
    WHEN c.implementation_status = 'in_progress' THEN 'in_progress'
    ELSE 'non_compliant'
  END,
  CASE
    WHEN c.implementation_status = 'implemented' THEN 100.00
    WHEN c.implementation_status = 'partially' THEN 60.00
    WHEN c.implementation_status = 'in_progress' THEN 40.00
    ELSE 0.00
  END,
  CASE WHEN c.implementation_status = 'implemented' THEN 1 ELSE 0 END,
  1,
  CASE WHEN c.implementation_status != 'implemented' AND c.priority = 'critical' THEN 1 ELSE 0 END,
  CASE WHEN c.implementation_status != 'implemented' AND c.priority = 'high' THEN 1 ELSE 0 END,
  CASE WHEN c.implementation_status != 'implemented' AND c.priority = 'medium' THEN 1 ELSE 0 END,
  CASE WHEN c.implementation_status != 'implemented' AND c.priority = 'low' THEN 1 ELSE 0 END,
  now() - interval '1 hour' * (random() * 24),
  'Automated Assessment System'
FROM compliance_controls c;

-- Create compliance gaps
INSERT INTO compliance_gaps (framework_id, control_id, gap_title, gap_description, severity, risk_level, remediation_plan, remediation_status, assigned_to, due_date)
SELECT
  c.framework_id,
  c.id,
  'Incomplete implementation of ' || c.control_name,
  c.description || ' is not fully implemented according to framework requirements.',
  CASE
    WHEN c.priority = 'critical' THEN 'critical'
    WHEN c.priority = 'high' THEN 'high'
    WHEN c.priority = 'medium' THEN 'medium'
    ELSE 'low'
  END,
  CASE
    WHEN c.priority = 'critical' THEN 'critical'
    WHEN c.priority = 'high' THEN 'high'
    WHEN c.priority = 'medium' THEN 'medium'
    ELSE 'low'
  END,
  'Complete implementation and validation of control ' || c.control_id,
  CASE
    WHEN c.implementation_status = 'in_progress' THEN 'in_progress'
    WHEN c.implementation_status = 'partially' THEN 'planned'
    ELSE 'identified'
  END,
  'Security Team',
  now() + interval '30 days'
FROM compliance_controls c
WHERE c.implementation_status IN ('partially', 'in_progress', 'not_started');

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_compliance_controls_framework ON compliance_controls(framework_id);
CREATE INDEX IF NOT EXISTS idx_compliance_assessments_framework ON compliance_assessments(framework_id);
CREATE INDEX IF NOT EXISTS idx_compliance_assessments_control ON compliance_assessments(control_id);
CREATE INDEX IF NOT EXISTS idx_compliance_gaps_framework ON compliance_gaps(framework_id);
CREATE INDEX IF NOT EXISTS idx_compliance_gaps_severity ON compliance_gaps(severity);
CREATE INDEX IF NOT EXISTS idx_compliance_gaps_status ON compliance_gaps(remediation_status);
