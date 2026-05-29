/*
  # Add Sarbanes-Oxley (SOX) Compliance Framework

  1. New Data
    - Adds SOX framework to `compliance_frameworks` table
      - `framework_code`: SOX
      - `framework_name`: Sarbanes-Oxley Act
      - `version`: 2002
      - `category`: Financial
      - `regulatory`: true
    - Adds 14 SOX controls to `compliance_controls` covering:
      - Section 302: CEO/CFO Certification of Financial Reports
      - Section 404: Internal Controls over Financial Reporting (ICFR)
      - Section 409: Real-Time Disclosure
      - Section 802: Document Retention and Tampering
      - IT General Controls (ITGC) mapped to SOX requirements

  2. Assessment Data
    - Adds compliance assessment records for each SOX control
    - Adds sample compliance gaps for identified weaknesses

  3. Notes
    - SOX is a US federal law that mandates financial reporting transparency
    - Critical for publicly traded companies
    - Heavily focuses on IT controls that ensure integrity of financial data
*/

-- Insert SOX Framework
INSERT INTO compliance_frameworks (framework_code, framework_name, version, description, category, regulatory)
VALUES (
  'SOX',
  'Sarbanes-Oxley Act',
  '2002',
  'US federal law mandating financial reporting transparency and internal controls for publicly traded companies',
  'Financial',
  true
)
ON CONFLICT (framework_code) DO NOTHING;

-- Insert SOX Controls
INSERT INTO compliance_controls (framework_id, control_id, control_name, description, category, priority, implementation_status, automated_check)
SELECT
  f.id,
  unnest(ARRAY[
    'SOX-302.1',
    'SOX-302.2',
    'SOX-404.1',
    'SOX-404.2',
    'SOX-404.3',
    'SOX-404.4',
    'SOX-409.1',
    'SOX-802.1',
    'SOX-802.2',
    'SOX-ITGC.1',
    'SOX-ITGC.2',
    'SOX-ITGC.3',
    'SOX-ITGC.4',
    'SOX-ITGC.5'
  ]),
  unnest(ARRAY[
    'CEO/CFO Financial Certification',
    'Disclosure Controls Effectiveness',
    'Internal Control Assessment',
    'Control Deficiency Reporting',
    'Segregation of Duties',
    'Change Management Controls',
    'Real-Time Material Event Disclosure',
    'Document Retention Policy',
    'Anti-Tampering Controls',
    'Logical Access Controls',
    'Program Change Controls',
    'IT Operations Controls',
    'Database Integrity Controls',
    'Audit Trail Completeness'
  ]),
  unnest(ARRAY[
    'CEO and CFO must certify accuracy and completeness of financial reports and effectiveness of internal controls',
    'Procedures ensuring material information is captured and reported within required time periods',
    'Management assessment of effectiveness of internal control over financial reporting (ICFR)',
    'Identification and reporting of material weaknesses and significant deficiencies in internal controls',
    'Proper separation of authorization, custody, and recording functions to prevent fraud',
    'Formal change management process for systems affecting financial reporting with proper approvals',
    'Rapid disclosure of material changes to financial condition or operations on an urgent basis',
    'Retention policies for financial records, audit workpapers, and supporting documentation',
    'Prevention and detection of unauthorized alteration or destruction of financial records',
    'Restrict system access to authorized personnel with role-based permissions on financial systems',
    'Controlled promotion of changes to production financial systems with testing and approval',
    'Backup, recovery, and job scheduling for financial processing systems',
    'Integrity validation of financial databases including referential integrity and reconciliation',
    'Complete and immutable audit logs of all transactions affecting financial reporting'
  ]),
  unnest(ARRAY[
    'Management Certification',
    'Disclosure',
    'Internal Controls',
    'Internal Controls',
    'Internal Controls',
    'Internal Controls',
    'Disclosure',
    'Records Management',
    'Records Management',
    'IT General Controls',
    'IT General Controls',
    'IT General Controls',
    'IT General Controls',
    'IT General Controls'
  ]),
  unnest(ARRAY[
    'critical',
    'critical',
    'critical',
    'critical',
    'critical',
    'high',
    'high',
    'high',
    'critical',
    'critical',
    'high',
    'high',
    'high',
    'critical'
  ]),
  unnest(ARRAY[
    'implemented',
    'implemented',
    'implemented',
    'implemented',
    'in_progress',
    'implemented',
    'partially',
    'implemented',
    'implemented',
    'implemented',
    'implemented',
    'implemented',
    'in_progress',
    'implemented'
  ]),
  unnest(ARRAY[
    false,
    true,
    true,
    true,
    true,
    true,
    true,
    false,
    true,
    true,
    true,
    true,
    true,
    true
  ])
FROM compliance_frameworks f
WHERE f.framework_code = 'SOX'
ON CONFLICT (framework_id, control_id) DO NOTHING;

-- Insert SOX compliance assessments (one per control, like the other frameworks)
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
  CASE WHEN c.implementation_status = 'in_progress' AND c.priority = 'critical' THEN 1 ELSE 0 END,
  CASE WHEN c.implementation_status = 'partially' AND c.priority = 'high' THEN 1 ELSE 0 END,
  0,
  0,
  now() - interval '3 days',
  'external_auditor'
FROM compliance_controls c
JOIN compliance_frameworks f ON c.framework_id = f.id
WHERE f.framework_code = 'SOX';

-- Insert SOX compliance gaps for non-compliant controls
INSERT INTO compliance_gaps (framework_id, control_id, gap_title, gap_description, severity, risk_level, remediation_plan, remediation_status, assigned_to, due_date)
SELECT
  c.framework_id,
  c.id,
  gap.title,
  gap.description,
  gap.severity,
  gap.risk_level,
  gap.remediation_plan,
  gap.remediation_status,
  gap.assigned_to,
  gap.due_date
FROM compliance_controls c
JOIN compliance_frameworks f ON c.framework_id = f.id
CROSS JOIN LATERAL (
  SELECT *
  FROM (VALUES
    ('SOX-404.3', 'Incomplete Segregation of Duties in ERP',
     'Several users in the ERP system retain conflicting roles (e.g., ability to both create and approve purchase orders) that violate SoD requirements',
     'critical', 'high',
     'Implement automated SoD conflict detection in ERP with compensating controls for exceptions. Target: remove 100% of critical conflicts by Q3.',
     'in_progress', 'compliance_team', (now() + interval '45 days')::timestamptz),
    ('SOX-409.1', 'Delayed Material Event Reporting',
     'Current process for identifying and disclosing material events has a 48-72 hour lag instead of the required rapid timeline',
     'high', 'high',
     'Deploy real-time event classification engine integrated with SEC EDGAR filing system to reduce disclosure latency to under 4 hours.',
     'planned', 'finance_ops', (now() + interval '60 days')::timestamptz),
    ('SOX-ITGC.4', 'Database Integrity Checks Not Fully Automated',
     'Monthly reconciliation between sub-ledger and general ledger databases relies on manual processes for 3 of 12 entity codes',
     'medium', 'medium',
     'Extend automated reconciliation scripts to cover all 12 entity codes with daily validation runs and exception alerting.',
     'in_progress', 'data_engineering', (now() + interval '30 days')::timestamptz)
  ) AS t(ctl_id, title, description, severity, risk_level, remediation_plan, remediation_status, assigned_to, due_date)
) gap
WHERE f.framework_code = 'SOX'
  AND c.control_id = gap.ctl_id;
