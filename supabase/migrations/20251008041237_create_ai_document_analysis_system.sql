/*
  # AI Document Analysis System

  1. Purpose
    AI-powered analysis of contracts, reports, diagrams, and documents to
    automatically extract and generate risk assessments, asset inventories,
    Business Impact Analyses (BIAs), compliance mappings, and security insights.

  2. Tables Created
    - document_uploads: Source documents uploaded for analysis
    - ai_analysis_jobs: Processing jobs for document analysis
    - extracted_assets: Assets discovered from documents
    - risk_assessments: Risk assessments generated from document analysis
    - business_impact_analyses: BIA information extracted
    - compliance_mappings: Compliance frameworks identified
    - contract_obligations: Obligations extracted from contracts
    - diagram_entities: Entities extracted from architecture diagrams
    - ai_insights: AI-generated insights and recommendations

  3. Features
    - Multi-format document support (PDF, DOCX, diagrams, images)
    - NLP and computer vision analysis
    - Risk scoring and prioritization
    - Asset discovery and classification
    - BIA generation
    - Compliance framework mapping
    - Contract obligation extraction
    - Architecture diagram parsing

  4. Security
    - RLS enabled with anonymous read access
*/

-- Document Uploads
CREATE TABLE IF NOT EXISTS document_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_name text NOT NULL,
  document_type text NOT NULL, -- contract, report, diagram, policy, procedure, bia, architecture
  file_format text NOT NULL, -- pdf, docx, xlsx, png, jpg, svg, visio
  file_size_mb numeric(10,2),
  upload_timestamp timestamptz DEFAULT now(),
  uploaded_by text,
  status text DEFAULT 'pending', -- pending, processing, completed, failed
  processing_start_time timestamptz,
  processing_end_time timestamptz,
  processing_duration_seconds integer,
  ai_model text DEFAULT 'gpt-4-vision',
  confidence_score numeric(5,2),
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_doc_type CHECK (document_type IN (
    'contract', 'report', 'diagram', 'policy', 'procedure', 
    'bia', 'architecture', 'network_map', 'risk_register', 'audit'
  )),
  CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'archived'))
);

-- AI Analysis Jobs
CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_type text NOT NULL, -- full, risk_only, asset_only, bia_only, compliance_only
  job_status text DEFAULT 'queued',
  priority integer DEFAULT 5,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  tokens_used integer,
  cost_usd numeric(10,4),
  results_summary jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_analysis_type CHECK (analysis_type IN (
    'full', 'risk_only', 'asset_only', 'bia_only', 'compliance_only', 'contract_only', 'diagram_only'
  )),
  CONSTRAINT valid_job_status CHECK (job_status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

-- Extracted Assets
CREATE TABLE IF NOT EXISTS extracted_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  asset_name text NOT NULL,
  asset_type text NOT NULL, -- server, application, database, network_device, cloud_service, data
  asset_category text, -- hardware, software, data, people, facility
  description text,
  location text,
  owner text,
  criticality text, -- critical, high, medium, low
  data_classification text, -- public, internal, confidential, restricted
  dependencies jsonb DEFAULT '[]'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_criticality CHECK (criticality IN ('critical', 'high', 'medium', 'low'))
);

-- Risk Assessments
CREATE TABLE IF NOT EXISTS risk_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  risk_title text NOT NULL,
  risk_description text,
  risk_category text, -- operational, financial, strategic, compliance, reputational, technical
  threat_source text,
  vulnerability text,
  likelihood text, -- very_high, high, medium, low, very_low
  impact text, -- very_high, high, medium, low, very_low
  risk_score numeric(5,2),
  inherent_risk_level text,
  residual_risk_level text,
  affected_assets jsonb DEFAULT '[]'::jsonb,
  mitigation_strategies jsonb DEFAULT '[]'::jsonb,
  control_effectiveness text,
  recommendation text,
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_risk_category CHECK (risk_category IN (
    'operational', 'financial', 'strategic', 'compliance', 'reputational', 'technical', 'cyber'
  ))
);

-- Business Impact Analyses
CREATE TABLE IF NOT EXISTS business_impact_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  business_process text NOT NULL,
  process_owner text,
  criticality_tier integer, -- 1 (most critical) to 5 (least critical)
  rto_hours integer, -- Recovery Time Objective in hours
  rpo_hours integer, -- Recovery Point Objective in hours
  mtpd_hours integer, -- Maximum Tolerable Period of Disruption
  mbco text, -- Minimum Business Continuity Objective
  annual_revenue_impact_usd numeric(15,2),
  regulatory_impact text,
  reputational_impact text,
  dependencies jsonb DEFAULT '[]'::jsonb,
  recovery_strategies jsonb DEFAULT '[]'::jsonb,
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now()
);

-- Compliance Mappings
CREATE TABLE IF NOT EXISTS compliance_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  framework text NOT NULL, -- iso27001, nist, sox, gdpr, hipaa, pci_dss, etc
  control_id text,
  control_name text,
  control_description text,
  compliance_status text, -- compliant, partial, non_compliant, not_applicable
  evidence_location text,
  gap_analysis text,
  remediation_required boolean DEFAULT false,
  remediation_priority text,
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_framework CHECK (framework IN (
    'iso27001', 'iso27002', 'nist_csf', 'nist_800_53', 'sox', 'gdpr', 
    'hipaa', 'pci_dss', 'cobit', 'cis', 'fedramp', 'ccpa'
  ))
);

-- Contract Obligations
CREATE TABLE IF NOT EXISTS contract_obligations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  obligation_type text NOT NULL, -- sla, security_requirement, compliance, liability, penalty
  clause_reference text,
  obligation_description text NOT NULL,
  responsible_party text,
  deadline timestamptz,
  penalty_amount numeric(15,2),
  penalty_description text,
  monitoring_required boolean DEFAULT true,
  notification_days_before integer DEFAULT 30,
  status text DEFAULT 'active',
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_obligation_type CHECK (obligation_type IN (
    'sla', 'security_requirement', 'compliance', 'liability', 'penalty', 
    'data_protection', 'audit_rights', 'termination'
  ))
);

-- Diagram Entities (parsed from architecture diagrams)
CREATE TABLE IF NOT EXISTS diagram_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  entity_name text NOT NULL,
  entity_type text NOT NULL, -- server, database, firewall, load_balancer, user, network, cloud_service
  layer text, -- presentation, application, data, network, security
  coordinates jsonb DEFAULT '{}'::jsonb, -- x, y position in diagram
  connections jsonb DEFAULT '[]'::jsonb, -- connected entities
  properties jsonb DEFAULT '{}'::jsonb,
  security_zone text,
  data_flow_direction text, -- inbound, outbound, bidirectional
  protocols jsonb DEFAULT '[]'::jsonb,
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now()
);

-- AI Insights and Recommendations
CREATE TABLE IF NOT EXISTS ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES document_uploads(id) ON DELETE CASCADE,
  analysis_job_id uuid REFERENCES ai_analysis_jobs(id) ON DELETE CASCADE,
  insight_type text NOT NULL, -- recommendation, finding, gap, opportunity, concern
  severity text, -- critical, high, medium, low, info
  title text NOT NULL,
  description text NOT NULL,
  affected_area text,
  category text, -- security, compliance, operational, financial, strategic
  actionable boolean DEFAULT true,
  estimated_effort text, -- hours, days, weeks, months
  estimated_cost_usd numeric(15,2),
  priority_score numeric(5,2),
  related_entities jsonb DEFAULT '[]'::jsonb,
  implementation_steps jsonb DEFAULT '[]'::jsonb,
  confidence_score numeric(5,2),
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_insight_type CHECK (insight_type IN (
    'recommendation', 'finding', 'gap', 'opportunity', 'concern', 'best_practice'
  ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_documents_type ON document_uploads(document_type);
CREATE INDEX IF NOT EXISTS idx_documents_status ON document_uploads(status);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_document_id ON ai_analysis_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_analysis_jobs_status ON ai_analysis_jobs(job_status);
CREATE INDEX IF NOT EXISTS idx_extracted_assets_document_id ON extracted_assets(document_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_document_id ON risk_assessments(document_id);
CREATE INDEX IF NOT EXISTS idx_bia_document_id ON business_impact_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_compliance_document_id ON compliance_mappings(document_id);
CREATE INDEX IF NOT EXISTS idx_contracts_document_id ON contract_obligations(document_id);
CREATE INDEX IF NOT EXISTS idx_diagram_entities_document_id ON diagram_entities(document_id);
CREATE INDEX IF NOT EXISTS idx_insights_document_id ON ai_insights(document_id);

-- Enable RLS
ALTER TABLE document_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE risk_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_impact_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contract_obligations ENABLE ROW LEVEL SECURITY;
ALTER TABLE diagram_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_insights ENABLE ROW LEVEL SECURITY;

-- Anonymous read policies
CREATE POLICY "Allow anonymous read documents" ON document_uploads FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read jobs" ON ai_analysis_jobs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read assets" ON extracted_assets FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read risks" ON risk_assessments FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read bia" ON business_impact_analyses FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read compliance" ON compliance_mappings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read contracts" ON contract_obligations FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read entities" ON diagram_entities FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read insights" ON ai_insights FOR SELECT TO anon USING (true);