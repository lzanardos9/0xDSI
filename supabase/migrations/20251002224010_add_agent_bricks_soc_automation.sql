/*
  # Add AgentBricks SOC Automation System

  ## Overview
  This migration creates the infrastructure for AI-powered SOC Level 1 automation using AgentBricks-inspired architecture.
  Automates triage, investigation, enrichment, and response tasks typically performed by L1 analysts.

  ## New Tables

  ### `ai_agents`
  Stores AI agent configurations and their specializations
  - `id` (uuid, primary key)
  - `name` (text) - Agent name (e.g., "Triage Agent", "Enrichment Agent")
  - `type` (text) - Agent type: triage, enrichment, investigation, response, orchestrator
  - `description` (text) - Agent purpose and capabilities
  - `status` (text) - active, paused, training
  - `task_description` (text) - Natural language task description
  - `optimization_method` (text) - TAO, ALHF, or hybrid
  - `performance_score` (numeric) - Agent effectiveness score (0-100)
  - `tasks_completed` (integer) - Total tasks handled
  - `accuracy_rate` (numeric) - Success rate percentage
  - `avg_response_time` (integer) - Average response time in seconds
  - `config` (jsonb) - Agent configuration and parameters
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

  ### `agent_tasks`
  Tracks individual tasks processed by agents
  - `id` (uuid, primary key)
  - `agent_id` (uuid, foreign key)
  - `task_type` (text) - alert_triage, threat_enrichment, log_analysis, incident_response
  - `priority` (text) - critical, high, medium, low
  - `status` (text) - queued, processing, completed, failed, escalated
  - `input_data` (jsonb) - Task input data
  - `output_data` (jsonb) - Agent's analysis and recommendations
  - `confidence_score` (numeric) - Agent's confidence in decision (0-1)
  - `escalated` (boolean) - Whether task was escalated to L2/L3
  - `escalation_reason` (text) - Why it was escalated
  - `processing_time_ms` (integer) - Time taken to process
  - `related_alert_id` (uuid) - Reference to alerts table
  - `created_at` (timestamptz)
  - `completed_at` (timestamptz)

  ### `agent_learning_feedback`
  Stores feedback for Agent Learning from Human Feedback (ALHF)
  - `id` (uuid, primary key)
  - `agent_id` (uuid, foreign key)
  - `task_id` (uuid, foreign key)
  - `feedback_type` (text) - positive, negative, correction
  - `feedback_score` (integer) - 1-5 rating
  - `analyst_comment` (text)
  - `correct_action` (text) - What should have been done
  - `improvement_applied` (boolean)
  - `created_by` (text) - Analyst who provided feedback
  - `created_at` (timestamptz)

  ### `soc_automation_metrics`
  Real-time metrics for SOC automation dashboard
  - `id` (uuid, primary key)
  - `metric_timestamp` (timestamptz)
  - `alerts_auto_triaged` (integer)
  - `alerts_escalated` (integer)
  - `false_positives_filtered` (integer)
  - `avg_triage_time_seconds` (integer)
  - `iocs_enriched` (integer)
  - `automated_responses` (integer)
  - `analyst_time_saved_hours` (numeric)
  - `accuracy_rate` (numeric)

  ## Security
  - Enable RLS on all tables
  - Anonymous users can read agent configurations and metrics for dashboard display
  - Authenticated users have full access for SOC operations
*/

-- Create ai_agents table
CREATE TABLE IF NOT EXISTS ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('triage', 'enrichment', 'investigation', 'response', 'orchestrator')),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'training')),
  task_description text NOT NULL,
  optimization_method text DEFAULT 'hybrid' CHECK (optimization_method IN ('TAO', 'ALHF', 'hybrid')),
  performance_score numeric DEFAULT 0 CHECK (performance_score >= 0 AND performance_score <= 100),
  tasks_completed integer DEFAULT 0,
  accuracy_rate numeric DEFAULT 0 CHECK (accuracy_rate >= 0 AND accuracy_rate <= 100),
  avg_response_time integer DEFAULT 0,
  config jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create agent_tasks table
CREATE TABLE IF NOT EXISTS agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
  task_type text NOT NULL CHECK (task_type IN ('alert_triage', 'threat_enrichment', 'log_analysis', 'incident_response')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('critical', 'high', 'medium', 'low')),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'escalated')),
  input_data jsonb DEFAULT '{}',
  output_data jsonb DEFAULT '{}',
  confidence_score numeric CHECK (confidence_score >= 0 AND confidence_score <= 1),
  escalated boolean DEFAULT false,
  escalation_reason text,
  processing_time_ms integer,
  related_alert_id uuid,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create agent_learning_feedback table
CREATE TABLE IF NOT EXISTS agent_learning_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES ai_agents(id) ON DELETE CASCADE,
  task_id uuid REFERENCES agent_tasks(id) ON DELETE CASCADE,
  feedback_type text NOT NULL CHECK (feedback_type IN ('positive', 'negative', 'correction')),
  feedback_score integer CHECK (feedback_score >= 1 AND feedback_score <= 5),
  analyst_comment text,
  correct_action text,
  improvement_applied boolean DEFAULT false,
  created_by text DEFAULT 'analyst',
  created_at timestamptz DEFAULT now()
);

-- Create soc_automation_metrics table
CREATE TABLE IF NOT EXISTS soc_automation_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_timestamp timestamptz DEFAULT now(),
  alerts_auto_triaged integer DEFAULT 0,
  alerts_escalated integer DEFAULT 0,
  false_positives_filtered integer DEFAULT 0,
  avg_triage_time_seconds integer DEFAULT 0,
  iocs_enriched integer DEFAULT 0,
  automated_responses integer DEFAULT 0,
  analyst_time_saved_hours numeric DEFAULT 0,
  accuracy_rate numeric DEFAULT 0 CHECK (accuracy_rate >= 0 AND accuracy_rate <= 100)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON agent_tasks(status);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_created_at ON agent_tasks(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feedback_agent_id ON agent_learning_feedback(agent_id);
CREATE INDEX IF NOT EXISTS idx_soc_metrics_timestamp ON soc_automation_metrics(metric_timestamp DESC);

-- Enable RLS
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_learning_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE soc_automation_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for ai_agents
CREATE POLICY "Anonymous users can view agents"
  ON ai_agents FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage agents"
  ON ai_agents FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for agent_tasks
CREATE POLICY "Anonymous users can view agent tasks"
  ON agent_tasks FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage agent tasks"
  ON agent_tasks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for agent_learning_feedback
CREATE POLICY "Anonymous users can view feedback"
  ON agent_learning_feedback FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage feedback"
  ON agent_learning_feedback FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- RLS Policies for soc_automation_metrics
CREATE POLICY "Anonymous users can view metrics"
  ON soc_automation_metrics FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Authenticated users can manage metrics"
  ON soc_automation_metrics FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert initial AI agents
INSERT INTO ai_agents (name, type, description, task_description, optimization_method, performance_score, tasks_completed, accuracy_rate, avg_response_time, config) VALUES
(
  'Alert Triage Agent',
  'triage',
  'Automatically triages incoming security alerts, filters false positives, and assigns severity levels',
  'Analyze security alerts, determine if they are true positives or false positives, assign appropriate severity levels, and recommend immediate actions',
  'hybrid',
  94.5,
  15847,
  94.5,
  2,
  '{"auto_escalate_threshold": 0.7, "false_positive_patterns": ["known_scanner", "scheduled_maintenance"], "severity_rules": {"high_confidence_malware": "critical", "suspicious_login": "high"}}'
),
(
  'Threat Enrichment Agent',
  'enrichment',
  'Enriches IOCs with threat intelligence from multiple feeds and correlates with historical data',
  'Take IP addresses, domains, file hashes, and other IOCs and enrich them with threat intelligence, geolocation, reputation scores, and historical context',
  'TAO',
  96.2,
  23451,
  96.2,
  5,
  '{"threat_feeds": ["alienvault", "abuse.ch", "emergingthreats"], "enrichment_fields": ["reputation", "geolocation", "first_seen", "last_seen", "related_campaigns"]}'
),
(
  'Investigation Agent',
  'investigation',
  'Conducts automated investigations by correlating logs, network traffic, and endpoint data',
  'Perform deep investigations into security incidents by analyzing logs, network flows, endpoint telemetry, and user behavior to identify attack patterns and lateral movement',
  'ALHF',
  91.8,
  8234,
  91.8,
  45,
  '{"investigation_scope": ["network_logs", "endpoint_logs", "authentication_logs"], "correlation_window_hours": 24, "behavioral_analysis": true}'
),
(
  'Automated Response Agent',
  'response',
  'Executes automated response actions like blocking IPs, isolating hosts, and updating firewall rules',
  'Execute predefined and dynamic response actions to contain threats including blocking malicious IPs, isolating compromised endpoints, and updating security controls',
  'hybrid',
  98.1,
  12678,
  98.1,
  1,
  '{"allowed_actions": ["block_ip", "isolate_host", "disable_account", "update_firewall"], "approval_required": false, "rollback_enabled": true}'
),
(
  'Orchestration Agent',
  'orchestrator',
  'Coordinates multiple agents and manages complex multi-step security workflows',
  'Orchestrate multiple specialized agents to handle complex security incidents requiring coordinated triage, investigation, enrichment, and response actions',
  'hybrid',
  93.7,
  5621,
  93.7,
  15,
  '{"max_parallel_agents": 5, "workflow_templates": ["malware_outbreak", "data_exfiltration", "credential_compromise"], "escalation_rules": {"low_confidence": "human_review", "critical_severity": "immediate_alert"}}'
);

-- Insert sample agent tasks
INSERT INTO agent_tasks (agent_id, task_type, priority, status, input_data, output_data, confidence_score, escalated, processing_time_ms, created_at, completed_at) 
SELECT 
  (SELECT id FROM ai_agents WHERE type = 'triage' LIMIT 1),
  'alert_triage',
  CASE WHEN random() < 0.2 THEN 'critical' WHEN random() < 0.5 THEN 'high' ELSE 'medium' END,
  CASE WHEN random() < 0.8 THEN 'completed' WHEN random() < 0.95 THEN 'escalated' ELSE 'processing' END,
  jsonb_build_object(
    'alert_id', gen_random_uuid()::text,
    'source_ip', '192.168.' || floor(random() * 255)::text || '.' || floor(random() * 255)::text,
    'destination_ip', '10.0.' || floor(random() * 255)::text || '.' || floor(random() * 255)::text,
    'alert_type', (ARRAY['malware_detected', 'suspicious_login', 'port_scan', 'data_exfiltration'])[floor(random() * 4 + 1)],
    'raw_severity', (ARRAY['high', 'medium', 'low'])[floor(random() * 3 + 1)]
  ),
  jsonb_build_object(
    'verdict', CASE WHEN random() < 0.85 THEN 'true_positive' ELSE 'false_positive' END,
    'adjusted_severity', (ARRAY['critical', 'high', 'medium', 'low'])[floor(random() * 4 + 1)],
    'recommended_action', (ARRAY['escalate', 'block_ip', 'monitor', 'ignore'])[floor(random() * 4 + 1)],
    'reasoning', 'Automated analysis based on threat intelligence and behavioral patterns'
  ),
  0.75 + random() * 0.25,
  random() < 0.15,
  floor(1000 + random() * 4000)::integer,
  now() - (random() * interval '7 days'),
  now() - (random() * interval '6 days')
FROM generate_series(1, 50);

-- Insert SOC automation metrics
INSERT INTO soc_automation_metrics (metric_timestamp, alerts_auto_triaged, alerts_escalated, false_positives_filtered, avg_triage_time_seconds, iocs_enriched, automated_responses, analyst_time_saved_hours, accuracy_rate)
SELECT 
  now() - (interval '1 hour' * i),
  floor(100 + random() * 200)::integer,
  floor(10 + random() * 30)::integer,
  floor(50 + random() * 100)::integer,
  floor(2 + random() * 5)::integer,
  floor(150 + random() * 250)::integer,
  floor(20 + random() * 50)::integer,
  round((8 + random() * 12)::numeric, 1),
  round((90 + random() * 8)::numeric, 1)
FROM generate_series(0, 23) as i;
