/*
  # ML/AI Training & Monitoring Framework

  1. New Tables
    - foundation_models: Base models (DBRX, Llama, Claude) registry
    - model_fine_tuning_jobs: Custom model training on threat data
    - model_serving_endpoints: Production model deployment
    - model_evaluations: AI Playground comparison results
    - mlflow_experiments: MLflow-style tracking
    - mlflow_traces: Step-by-step request logging
    - model_monitoring_metrics: Quality, latency, toxicity metrics
    - model_feedback: Human analyst feedback loop
    - adversarial_training_data: Adversarial examples for robustness
    - ai_security_incidents: DASF 2.0 security events

  2. Security
    - Enable RLS on all tables
    - Model access control policies

  3. Features
    - Foundation model fine-tuning tracking
    - Production monitoring with MLflow
    - AI security framework implementation
    - Continuous learning and adaptation
*/

-- Foundation Models Registry
CREATE TABLE IF NOT EXISTS foundation_models (
  id BIGSERIAL PRIMARY KEY,
  model_name TEXT NOT NULL,
  model_provider TEXT CHECK (model_provider IN ('databricks', 'meta', 'anthropic', 'openai', 'mistral', 'cohere')),
  model_version TEXT,
  model_type TEXT CHECK (model_type IN ('base', 'instruct', 'chat', 'embedding', 'code')),
  parameter_count TEXT,
  context_window INTEGER,
  supports_fine_tuning BOOLEAN DEFAULT true,
  supports_rag BOOLEAN DEFAULT true,
  specialization TEXT[],
  performance_benchmarks JSONB,
  cost_per_1k_tokens NUMERIC(10,6),
  latency_p50_ms INTEGER,
  latency_p99_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Model Fine-Tuning Jobs
CREATE TABLE IF NOT EXISTS model_fine_tuning_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_name TEXT NOT NULL,
  base_model_id BIGINT REFERENCES foundation_models(id),
  training_data_path TEXT,
  training_data_format TEXT CHECK (training_data_format IN ('jsonl', 'parquet', 'delta')),
  training_data_size_mb NUMERIC(10,2),
  training_data_rows INTEGER,
  task_type TEXT CHECK (task_type IN ('chat_completion', 'classification', 'embedding', 'code_generation')),
  hyperparameters JSONB,
  training_duration_epochs INTEGER,
  learning_rate NUMERIC(10,8),
  batch_size INTEGER,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  progress_percent INTEGER DEFAULT 0,
  training_loss NUMERIC(10,6),
  validation_loss NUMERIC(10,6),
  output_model_path TEXT,
  output_model_size_gb NUMERIC(10,2),
  training_started_at TIMESTAMPTZ,
  training_completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finetuning_status ON model_fine_tuning_jobs(status);
CREATE INDEX IF NOT EXISTS idx_finetuning_created ON model_fine_tuning_jobs(created_at DESC);

-- Model Serving Endpoints
CREATE TABLE IF NOT EXISTS model_serving_endpoints (
  id BIGSERIAL PRIMARY KEY,
  endpoint_name TEXT UNIQUE NOT NULL,
  endpoint_url TEXT,
  model_id BIGINT REFERENCES foundation_models(id),
  fine_tuned_model_id BIGINT REFERENCES model_fine_tuning_jobs(id),
  endpoint_type TEXT CHECK (endpoint_type IN ('real_time', 'batch', 'streaming')),
  compute_type TEXT CHECK (compute_type IN ('cpu', 'gpu', 'serverless')),
  auto_scaling_enabled BOOLEAN DEFAULT true,
  min_instances INTEGER DEFAULT 1,
  max_instances INTEGER DEFAULT 10,
  current_instances INTEGER DEFAULT 1,
  requests_per_second INTEGER DEFAULT 0,
  average_latency_ms NUMERIC(10,2),
  p99_latency_ms NUMERIC(10,2),
  error_rate NUMERIC(5,4),
  deployment_status TEXT CHECK (deployment_status IN ('deploying', 'active', 'updating', 'failed', 'terminated')),
  last_health_check TIMESTAMPTZ,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_serving_status ON model_serving_endpoints(deployment_status);
CREATE INDEX IF NOT EXISTS idx_serving_endpoint_name ON model_serving_endpoints(endpoint_name);

-- Model Evaluations (AI Playground)
CREATE TABLE IF NOT EXISTS model_evaluations (
  id BIGSERIAL PRIMARY KEY,
  evaluation_name TEXT,
  model_a_id BIGINT REFERENCES foundation_models(id),
  model_b_id BIGINT REFERENCES foundation_models(id),
  evaluation_dataset TEXT,
  test_prompts JSONB,
  evaluation_metrics JSONB,
  model_a_results JSONB,
  model_b_results JSONB,
  model_a_avg_latency_ms NUMERIC(10,2),
  model_b_avg_latency_ms NUMERIC(10,2),
  model_a_toxicity_score NUMERIC(5,4),
  model_b_toxicity_score NUMERIC(5,4),
  model_a_accuracy NUMERIC(5,4),
  model_b_accuracy NUMERIC(5,4),
  model_a_token_usage INTEGER,
  model_b_token_usage INTEGER,
  model_a_cost_usd NUMERIC(10,4),
  model_b_cost_usd NUMERIC(10,4),
  winner TEXT,
  evaluation_notes TEXT,
  evaluated_by TEXT,
  evaluated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_date ON model_evaluations(evaluated_at DESC);

-- MLflow Experiments
CREATE TABLE IF NOT EXISTS mlflow_experiments (
  id BIGSERIAL PRIMARY KEY,
  experiment_name TEXT UNIQUE NOT NULL,
  experiment_description TEXT,
  artifact_location TEXT,
  lifecycle_stage TEXT CHECK (lifecycle_stage IN ('active', 'deleted')),
  tags JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- MLflow Traces (Request Logging)
CREATE TABLE IF NOT EXISTS mlflow_traces (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT UNIQUE NOT NULL,
  experiment_id BIGINT REFERENCES mlflow_experiments(id),
  endpoint_id BIGINT REFERENCES model_serving_endpoints(id),
  request_timestamp TIMESTAMPTZ NOT NULL,
  user_id TEXT,
  input_prompt TEXT,
  input_tokens INTEGER,
  output_response TEXT,
  output_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms NUMERIC(10,2),
  model_version TEXT,
  temperature NUMERIC(3,2),
  max_tokens INTEGER,
  intermediate_steps JSONB,
  metadata JSONB,
  status TEXT CHECK (status IN ('success', 'error', 'timeout')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traces_timestamp ON mlflow_traces(request_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_traces_endpoint ON mlflow_traces(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_traces_status ON mlflow_traces(status);

-- Model Monitoring Metrics
CREATE TABLE IF NOT EXISTS model_monitoring_metrics (
  id BIGSERIAL PRIMARY KEY,
  endpoint_id BIGINT REFERENCES model_serving_endpoints(id),
  metric_timestamp TIMESTAMPTZ NOT NULL,
  requests_count INTEGER,
  successful_requests INTEGER,
  failed_requests INTEGER,
  average_latency_ms NUMERIC(10,2),
  p50_latency_ms NUMERIC(10,2),
  p95_latency_ms NUMERIC(10,2),
  p99_latency_ms NUMERIC(10,2),
  total_input_tokens BIGINT,
  total_output_tokens BIGINT,
  average_toxicity_score NUMERIC(5,4),
  hallucination_rate NUMERIC(5,4),
  response_quality_score NUMERIC(5,4),
  context_relevance_score NUMERIC(5,4),
  prompt_injection_attempts INTEGER,
  jailbreak_attempts INTEGER,
  pii_leakage_incidents INTEGER,
  anomaly_score NUMERIC(5,4),
  cost_usd NUMERIC(10,4),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_monitoring_timestamp ON model_monitoring_metrics(metric_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_monitoring_endpoint ON model_monitoring_metrics(endpoint_id);

-- Model Feedback (Human in the Loop)
CREATE TABLE IF NOT EXISTS model_feedback (
  id BIGSERIAL PRIMARY KEY,
  trace_id TEXT REFERENCES mlflow_traces(trace_id),
  endpoint_id BIGINT REFERENCES model_serving_endpoints(id),
  analyst_id TEXT,
  feedback_type TEXT CHECK (feedback_type IN ('thumbs_up', 'thumbs_down', 'correction', 'false_positive', 'false_negative')),
  original_response TEXT,
  corrected_response TEXT,
  feedback_category TEXT CHECK (feedback_category IN ('accuracy', 'relevance', 'safety', 'hallucination', 'bias', 'incomplete')),
  feedback_notes TEXT,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  action_taken TEXT,
  used_for_retraining BOOLEAN DEFAULT false,
  feedback_timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_timestamp ON model_feedback(feedback_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON model_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_feedback_retraining ON model_feedback(used_for_retraining);

-- Adversarial Training Data
CREATE TABLE IF NOT EXISTS adversarial_training_data (
  id BIGSERIAL PRIMARY KEY,
  adversarial_type TEXT CHECK (adversarial_type IN ('prompt_injection', 'jailbreak', 'data_poisoning', 'model_inversion', 'membership_inference')),
  attack_technique TEXT,
  adversarial_prompt TEXT,
  expected_behavior TEXT,
  actual_behavior TEXT,
  model_vulnerable BOOLEAN,
  attack_success_rate NUMERIC(5,4),
  mitigation_applied TEXT,
  mitigation_effectiveness NUMERIC(5,4),
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  discovered_by TEXT,
  discovered_at TIMESTAMPTZ,
  used_in_training BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_adversarial_type ON adversarial_training_data(adversarial_type);
CREATE INDEX IF NOT EXISTS idx_adversarial_severity ON adversarial_training_data(severity);

-- AI Security Incidents (DASF 2.0)
CREATE TABLE IF NOT EXISTS ai_security_incidents (
  id BIGSERIAL PRIMARY KEY,
  incident_id TEXT UNIQUE,
  incident_type TEXT CHECK (incident_type IN ('model_poisoning', 'prompt_injection', 'data_leakage', 'bias_detected', 'hallucination', 'unauthorized_access', 'adversarial_attack')),
  affected_endpoint_id BIGINT REFERENCES model_serving_endpoints(id),
  affected_model TEXT,
  incident_description TEXT,
  attack_vector TEXT,
  indicators_of_compromise JSONB,
  impact_severity TEXT CHECK (impact_severity IN ('low', 'medium', 'high', 'critical')),
  affected_requests INTEGER,
  data_exposed BOOLEAN DEFAULT false,
  pii_involved BOOLEAN DEFAULT false,
  detection_method TEXT,
  detected_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  mitigated_at TIMESTAMPTZ,
  response_actions JSONB,
  root_cause TEXT,
  lessons_learned TEXT,
  status TEXT CHECK (status IN ('detected', 'investigating', 'contained', 'mitigated', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_incidents_type ON ai_security_incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_severity ON ai_security_incidents(impact_severity);
CREATE INDEX IF NOT EXISTS idx_ai_incidents_status ON ai_security_incidents(status);

-- Enable RLS
ALTER TABLE foundation_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_fine_tuning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_serving_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlflow_experiments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mlflow_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_monitoring_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE adversarial_training_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_security_incidents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read foundation_models" ON foundation_models FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read fine_tuning" ON model_fine_tuning_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read serving" ON model_serving_endpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read evaluations" ON model_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read experiments" ON mlflow_experiments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read traces" ON mlflow_traces FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read monitoring" ON model_monitoring_metrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all feedback" ON model_feedback FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read adversarial" ON adversarial_training_data FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read ai_incidents" ON ai_security_incidents FOR SELECT TO authenticated USING (true);

-- Allow anon read for demo
CREATE POLICY "Allow anon read foundation_models" ON foundation_models FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read serving" ON model_serving_endpoints FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read monitoring" ON model_monitoring_metrics FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read ai_incidents" ON ai_security_incidents FOR SELECT TO anon USING (true);