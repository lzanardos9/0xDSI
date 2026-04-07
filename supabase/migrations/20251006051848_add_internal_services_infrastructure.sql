/*
  # Internal Services Infrastructure (Turi, Cowboy, Alkami, Hedwick, Bolt)

  1. New Tables
    - turi_metadata_registry: Shared metadata interface
    - cowboy_notebooks: Jupyter notebook service
    - alkami_inference_service: Model inference endpoints
    - hedwick_model_registry: MLflow-based model registry
    - bolt_gpu_training: GPU training job abstraction
    - db_apps_registry: Serverless app hosting

  2. Features
    - Comprehensive ML lifecycle management
    - Notebook-based development
    - GPU training orchestration
    - App hosting platform

  3. Security
    - RLS enabled
*/

-- Turi Metadata Registry (Shared metadata interface)
CREATE TABLE IF NOT EXISTS turi_metadata_registry (
  id BIGSERIAL PRIMARY KEY,
  metadata_id TEXT UNIQUE NOT NULL,
  resource_type TEXT CHECK (resource_type IN ('dataset', 'model', 'pipeline', 'notebook', 'app', 'dashboard')),
  resource_name TEXT NOT NULL,
  resource_path TEXT,
  owner_id TEXT,
  team TEXT,
  tags TEXT[],
  description TEXT,
  schema_version TEXT,
  metadata_json JSONB,
  lineage_upstream TEXT[],
  lineage_downstream TEXT[],
  access_level TEXT CHECK (access_level IN ('public', 'team', 'private')) DEFAULT 'team',
  last_modified_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_turi_type ON turi_metadata_registry(resource_type);
CREATE INDEX IF NOT EXISTS idx_turi_owner ON turi_metadata_registry(owner_id);
CREATE INDEX IF NOT EXISTS idx_turi_tags ON turi_metadata_registry USING gin(tags);

-- Cowboy Notebooks (Jupyter/AWS managed)
CREATE TABLE IF NOT EXISTS cowboy_notebooks (
  id BIGSERIAL PRIMARY KEY,
  notebook_id TEXT UNIQUE NOT NULL,
  notebook_name TEXT NOT NULL,
  notebook_path TEXT,
  kernel_type TEXT CHECK (kernel_type IN ('python', 'scala', 'r', 'sql')) DEFAULT 'python',
  compute_instance_type TEXT,
  cpu_cores INTEGER,
  memory_gb INTEGER,
  gpu_count INTEGER DEFAULT 0,
  owner_id TEXT,
  collaborators TEXT[],
  status TEXT CHECK (status IN ('stopped', 'starting', 'running', 'stopping', 'failed')) DEFAULT 'stopped',
  last_execution_time TIMESTAMPTZ,
  execution_count INTEGER DEFAULT 0,
  last_cell_output JSONB,
  environment_config JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cowboy_owner ON cowboy_notebooks(owner_id);
CREATE INDEX IF NOT EXISTS idx_cowboy_status ON cowboy_notebooks(status);

-- Alkami Inference Service (Model serving)
CREATE TABLE IF NOT EXISTS alkami_inference_service (
  id BIGSERIAL PRIMARY KEY,
  service_id TEXT UNIQUE NOT NULL,
  service_name TEXT NOT NULL,
  model_id TEXT,
  model_version TEXT,
  inference_type TEXT CHECK (inference_type IN ('real_time', 'batch', 'streaming')),
  endpoint_url TEXT,
  compute_type TEXT CHECK (compute_type IN ('cpu', 'gpu', 'tpu')) DEFAULT 'cpu',
  instance_count INTEGER DEFAULT 1,
  auto_scaling_enabled BOOLEAN DEFAULT true,
  min_instances INTEGER DEFAULT 1,
  max_instances INTEGER DEFAULT 10,
  requests_per_second INTEGER DEFAULT 0,
  avg_latency_ms NUMERIC(10,2),
  p95_latency_ms NUMERIC(10,2),
  p99_latency_ms NUMERIC(10,2),
  error_rate NUMERIC(5,4),
  total_requests BIGINT DEFAULT 0,
  deployment_status TEXT CHECK (deployment_status IN ('deploying', 'active', 'updating', 'failed', 'terminated')) DEFAULT 'active',
  health_check_url TEXT,
  last_health_check TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alkami_status ON alkami_inference_service(deployment_status);
CREATE INDEX IF NOT EXISTS idx_alkami_model ON alkami_inference_service(model_id);

-- Hedwick Model Registry (MLflow-based)
CREATE TABLE IF NOT EXISTS hedwick_model_registry (
  id BIGSERIAL PRIMARY KEY,
  model_id TEXT UNIQUE NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  model_stage TEXT CHECK (model_stage IN ('development', 'staging', 'production', 'archived')) DEFAULT 'development',
  model_framework TEXT CHECK (model_framework IN ('sklearn', 'pytorch', 'tensorflow', 'xgboost', 'lightgbm', 'custom')),
  model_type TEXT CHECK (model_type IN ('classification', 'regression', 'clustering', 'anomaly_detection', 'nlp', 'cv')),
  model_artifact_path TEXT,
  model_size_mb NUMERIC(10,2),
  training_dataset_id TEXT,
  hyperparameters JSONB,
  metrics JSONB,
  feature_importance JSONB,
  input_schema JSONB,
  output_schema JSONB,
  created_by TEXT,
  approved_by TEXT,
  approval_date TIMESTAMPTZ,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(model_name, model_version)
);

CREATE INDEX IF NOT EXISTS idx_hedwick_stage ON hedwick_model_registry(model_stage);
CREATE INDEX IF NOT EXISTS idx_hedwick_name ON hedwick_model_registry(model_name);
CREATE INDEX IF NOT EXISTS idx_hedwick_created ON hedwick_model_registry(created_at DESC);

-- Bolt GPU Training (Training job abstraction)
CREATE TABLE IF NOT EXISTS bolt_gpu_training (
  id BIGSERIAL PRIMARY KEY,
  training_job_id TEXT UNIQUE NOT NULL,
  job_name TEXT NOT NULL,
  model_name TEXT,
  training_script_path TEXT,
  dataset_path TEXT,
  gpu_type TEXT CHECK (gpu_type IN ('V100', 'A100', 'H100', 'T4', 'A10G')),
  gpu_count INTEGER DEFAULT 1,
  distributed_training BOOLEAN DEFAULT false,
  training_framework TEXT CHECK (training_framework IN ('pytorch', 'tensorflow', 'jax', 'mxnet')),
  hyperparameters JSONB,
  status TEXT CHECK (status IN ('queued', 'provisioning', 'running', 'completing', 'completed', 'failed', 'cancelled')) DEFAULT 'queued',
  progress_percent INTEGER DEFAULT 0,
  current_epoch INTEGER,
  total_epochs INTEGER,
  training_loss NUMERIC(10,6),
  validation_loss NUMERIC(10,6),
  validation_accuracy NUMERIC(5,4),
  estimated_completion_time TIMESTAMPTZ,
  compute_cost_usd NUMERIC(10,2),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  output_model_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bolt_status ON bolt_gpu_training(status);
CREATE INDEX IF NOT EXISTS idx_bolt_created ON bolt_gpu_training(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bolt_model ON bolt_gpu_training(model_name);

-- DB Apps Registry (Serverless app hosting)
CREATE TABLE IF NOT EXISTS db_apps_registry (
  id BIGSERIAL PRIMARY KEY,
  app_id TEXT UNIQUE NOT NULL,
  app_name TEXT NOT NULL,
  app_type TEXT CHECK (app_type IN ('dash', 'gradio', 'streamlit', 'panel', 'voila', 'custom')),
  app_framework_version TEXT,
  source_path TEXT,
  app_url TEXT,
  compute_tier TEXT CHECK (compute_tier IN ('small', 'medium', 'large', 'xlarge')) DEFAULT 'medium',
  auto_scaling BOOLEAN DEFAULT true,
  environment_variables JSONB,
  dependencies JSONB,
  deployment_status TEXT CHECK (deployment_status IN ('building', 'deploying', 'active', 'failed', 'stopped')) DEFAULT 'building',
  health_status TEXT CHECK (health_status IN ('healthy', 'degraded', 'unhealthy')) DEFAULT 'healthy',
  active_users INTEGER DEFAULT 0,
  total_requests BIGINT DEFAULT 0,
  avg_response_time_ms NUMERIC(10,2),
  memory_usage_mb INTEGER,
  cpu_usage_percent NUMERIC(5,2),
  last_deployment_at TIMESTAMPTZ,
  last_health_check TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_db_apps_status ON db_apps_registry(deployment_status);
CREATE INDEX IF NOT EXISTS idx_db_apps_type ON db_apps_registry(app_type);
CREATE INDEX IF NOT EXISTS idx_db_apps_health ON db_apps_registry(health_status);

-- AI Gateway (Governance layer)
CREATE TABLE IF NOT EXISTS ai_gateway_requests (
  id BIGSERIAL PRIMARY KEY,
  request_id TEXT UNIQUE NOT NULL,
  user_id TEXT,
  app_id TEXT,
  model_endpoint TEXT,
  request_type TEXT CHECK (request_type IN ('chat', 'completion', 'embedding', 'fine_tune', 'inference')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  prompt_text TEXT,
  response_text TEXT,
  latency_ms NUMERIC(10,2),
  cost_usd NUMERIC(10,6),
  content_filtered BOOLEAN DEFAULT false,
  pii_detected BOOLEAN DEFAULT false,
  toxicity_score NUMERIC(5,4),
  policy_violations TEXT[],
  approved BOOLEAN DEFAULT true,
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gateway_user ON ai_gateway_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_gateway_timestamp ON ai_gateway_requests(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_gateway_violations ON ai_gateway_requests(policy_violations) WHERE policy_violations IS NOT NULL;

-- AI Gateway Policies
CREATE TABLE IF NOT EXISTS ai_gateway_policies (
  id BIGSERIAL PRIMARY KEY,
  policy_name TEXT UNIQUE NOT NULL,
  policy_type TEXT CHECK (policy_type IN ('rate_limit', 'content_filter', 'cost_limit', 'pii_redaction', 'model_access')),
  policy_definition JSONB NOT NULL,
  enforcement_level TEXT CHECK (enforcement_level IN ('log', 'warn', 'block')) DEFAULT 'block',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO ai_gateway_policies (policy_name, policy_type, policy_definition, enforcement_level) VALUES
('rate_limit_user', 'rate_limit', '{"requests_per_minute": 60, "requests_per_hour": 1000}'::jsonb, 'block'),
('pii_redaction', 'pii_redaction', '{"redact_ssn": true, "redact_credit_card": true, "redact_email": false}'::jsonb, 'warn'),
('toxicity_filter', 'content_filter', '{"max_toxicity_score": 0.7, "categories": ["hate", "violence", "sexual"]}'::jsonb, 'block'),
('cost_limit_per_user', 'cost_limit', '{"daily_limit_usd": 100, "monthly_limit_usd": 1000}'::jsonb, 'warn')
ON CONFLICT (policy_name) DO NOTHING;

-- Enable RLS
ALTER TABLE turi_metadata_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE cowboy_notebooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE alkami_inference_service ENABLE ROW LEVEL SECURITY;
ALTER TABLE hedwick_model_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE bolt_gpu_training ENABLE ROW LEVEL SECURITY;
ALTER TABLE db_apps_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_gateway_policies ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read turi" ON turi_metadata_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read cowboy" ON cowboy_notebooks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read alkami" ON alkami_inference_service FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read hedwick" ON hedwick_model_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read bolt" ON bolt_gpu_training FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read db_apps" ON db_apps_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read gateway" ON ai_gateway_requests FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read policies" ON ai_gateway_policies FOR SELECT TO authenticated USING (true);

-- Anon policies
CREATE POLICY "Allow anon read db_apps" ON db_apps_registry FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read hedwick" ON hedwick_model_registry FOR SELECT TO anon USING (true);