-- n8n Workflow Integration Schema
-- 
-- 1. New Tables
--    - n8n_workflows: Stores n8n workflow configurations and endpoints
--    - workflow_executions: Tracks workflow execution history
--    - workflow_triggers: Defines conditions that trigger workflows
--    - response_actions: Logs automated response actions taken
--
-- 2. Security
--    - Enable RLS on all tables
--    - Policies allow authenticated users to manage workflows
--
-- 3. Features
--    - Support for multiple trigger types (alert-based, threshold-based, schedule-based)
--    - Execution tracking with success/failure status
--    - Automatic response logging for audit trails

CREATE TABLE IF NOT EXISTS n8n_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  n8n_webhook_url text NOT NULL,
  n8n_workflow_id text,
  workflow_type text NOT NULL CHECK (workflow_type IN ('response', 'investigation', 'notification', 'remediation')),
  enabled boolean DEFAULT true,
  configuration jsonb DEFAULT '{}'::jsonb,
  auth_method text DEFAULT 'header' CHECK (auth_method IN ('header', 'query', 'basic', 'none')),
  auth_credentials jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_n8n_workflows_enabled ON n8n_workflows(enabled);
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_type ON n8n_workflows(workflow_type);

CREATE TABLE IF NOT EXISTS workflow_triggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid REFERENCES n8n_workflows(id) ON DELETE CASCADE,
  trigger_name text NOT NULL,
  trigger_type text NOT NULL CHECK (trigger_type IN ('alert', 'threshold', 'schedule', 'manual', 'event_pattern')),
  conditions jsonb NOT NULL,
  priority integer DEFAULT 5,
  enabled boolean DEFAULT true,
  cooldown_seconds integer DEFAULT 0,
  last_triggered_at timestamptz,
  trigger_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_enabled ON workflow_triggers(enabled);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_type ON workflow_triggers(trigger_type);

CREATE TABLE IF NOT EXISTS workflow_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid REFERENCES n8n_workflows(id) ON DELETE CASCADE,
  trigger_id uuid REFERENCES workflow_triggers(id),
  execution_status text DEFAULT 'pending' CHECK (execution_status IN ('pending', 'running', 'success', 'failed', 'timeout')),
  trigger_data jsonb DEFAULT '{}'::jsonb,
  response_data jsonb DEFAULT '{}'::jsonb,
  error_message text,
  execution_time_ms integer,
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id ON workflow_executions(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_status ON workflow_executions(execution_status);
CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at ON workflow_executions(started_at DESC);

CREATE TABLE IF NOT EXISTS response_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid REFERENCES workflow_executions(id) ON DELETE CASCADE,
  action_type text NOT NULL CHECK (action_type IN ('block_ip', 'isolate_user', 'disable_account', 'quarantine_file', 'send_notification', 'create_ticket', 'custom')),
  target_entity text NOT NULL,
  action_details jsonb DEFAULT '{}'::jsonb,
  action_status text DEFAULT 'completed' CHECK (action_status IN ('pending', 'completed', 'failed', 'rolled_back')),
  result_message text,
  rollback_possible boolean DEFAULT false,
  rolled_back_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_response_actions_execution_id ON response_actions(execution_id);
CREATE INDEX IF NOT EXISTS idx_response_actions_type ON response_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_response_actions_status ON response_actions(action_status);
CREATE INDEX IF NOT EXISTS idx_response_actions_target ON response_actions(target_entity);

ALTER TABLE n8n_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view workflows"
  ON n8n_workflows FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage their workflows"
  ON n8n_workflows FOR ALL
  TO authenticated
  USING (auth.uid() = created_by OR created_by IS NULL)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can view triggers"
  ON workflow_triggers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage their triggers"
  ON workflow_triggers FOR ALL
  TO authenticated
  USING (auth.uid() = created_by OR created_by IS NULL)
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can view executions"
  ON workflow_executions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create executions"
  ON workflow_executions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update executions"
  ON workflow_executions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view response actions"
  ON response_actions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create response actions"
  ON response_actions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update response actions"
  ON response_actions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);