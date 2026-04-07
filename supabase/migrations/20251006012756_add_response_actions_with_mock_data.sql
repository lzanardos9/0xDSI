/*
  # Response Actions System with Mock Data

  1. New Tables
    - `response_actions` - Automated response actions log
    - Supporting tables for workflow integration (n8n_workflows, workflow_executions, workflow_triggers)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated and anonymous users

  3. Mock Data
    - 25 response actions with various statuses (completed, pending, failed, rolled_back)
    - Realistic timestamps and action details
*/

-- n8n Workflows table
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
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_n8n_workflows_enabled ON n8n_workflows(enabled);
CREATE INDEX IF NOT EXISTS idx_n8n_workflows_type ON n8n_workflows(workflow_type);

-- Workflow Triggers
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
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_triggers_workflow_id ON workflow_triggers(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_triggers_enabled ON workflow_triggers(enabled);

-- Workflow Executions
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

-- Response Actions
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

CREATE INDEX IF NOT EXISTS idx_response_actions_type ON response_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_response_actions_status ON response_actions(action_status);
CREATE INDEX IF NOT EXISTS idx_response_actions_created_at ON response_actions(created_at DESC);

-- Enable RLS
ALTER TABLE n8n_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE response_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Anyone can view workflows"
  ON n8n_workflows FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage workflows"
  ON n8n_workflows FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view triggers"
  ON workflow_triggers FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can manage triggers"
  ON workflow_triggers FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can view executions"
  ON workflow_executions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create executions"
  ON workflow_executions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can view response actions"
  ON response_actions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create response actions"
  ON response_actions FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Insert mock response actions
INSERT INTO response_actions (action_type, target_entity, action_status, result_message, rollback_possible, rolled_back_at, created_at)
VALUES 
  -- Recent successful actions
  ('block_ip', '185.220.101.42', 'completed', 'IP successfully blocked on all perimeter firewalls', true, NULL, NOW() - INTERVAL '5 minutes'),
  ('isolate_user', 'john.doe@company.com', 'completed', 'User account isolated from network, all active sessions terminated', true, NULL, NOW() - INTERVAL '12 minutes'),
  ('quarantine_file', '/uploads/malware.exe', 'completed', 'File quarantined and moved to secure sandbox', true, NULL, NOW() - INTERVAL '18 minutes'),
  ('send_notification', 'security-team@company.com', 'completed', 'Critical alert notification sent to SOC team', false, NULL, NOW() - INTERVAL '25 minutes'),
  ('disable_account', 'guest_user_7823', 'completed', 'Account disabled due to suspicious activity', true, NULL, NOW() - INTERVAL '35 minutes'),
  
  -- Pending actions
  ('block_ip', '192.168.45.89', 'pending', 'Awaiting firewall rule propagation', false, NULL, NOW() - INTERVAL '2 minutes'),
  ('send_notification', 'incident-response@company.com', 'pending', 'Email queued for delivery', false, NULL, NOW() - INTERVAL '3 minutes'),
  
  -- Failed actions
  ('isolate_user', 'admin@company.com', 'failed', 'Cannot isolate privileged account - manual review required', false, NULL, NOW() - INTERVAL '45 minutes'),
  ('quarantine_file', '/system/critical.dll', 'failed', 'File is locked by system process', false, NULL, NOW() - INTERVAL '1 hour'),
  
  -- More successful actions
  ('block_ip', '203.0.113.45', 'completed', 'Malicious IP blocked after DDoS detection', true, NULL, NOW() - INTERVAL '1 hour 20 minutes'),
  ('disable_account', 'contractor_temp_443', 'completed', 'Temporary account disabled after multiple failed login attempts', true, NULL, NOW() - INTERVAL '1 hour 45 minutes'),
  ('quarantine_file', '/home/user/downloads/trojan.zip', 'completed', 'Suspected trojan quarantined from user directory', true, NULL, NOW() - INTERVAL '2 hours'),
  ('send_notification', 'ciso@company.com', 'completed', 'Executive alert sent for critical incident', false, NULL, NOW() - INTERVAL '2 hours 15 minutes'),
  ('block_ip', '198.51.100.123', 'completed', 'C2 server IP blocked based on threat intelligence', true, NULL, NOW() - INTERVAL '2 hours 30 minutes'),
  ('isolate_user', 'contractor@partner.com', 'completed', 'External contractor isolated after suspicious file access', true, NULL, NOW() - INTERVAL '3 hours'),
  
  -- Rolled back actions
  ('block_ip', '10.0.0.150', 'rolled_back', 'False positive - legitimate internal server, rollback initiated', false, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '4 hours'),
  ('disable_account', 'sales_lead@company.com', 'rolled_back', 'Account re-enabled after false positive determination', false, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '5 hours'),
  
  -- Additional recent actions
  ('quarantine_file', '/var/log/suspicious.sh', 'completed', 'Suspicious script quarantined from log directory', true, NULL, NOW() - INTERVAL '6 hours'),
  ('send_notification', 'network-ops@company.com', 'completed', 'Network anomaly alert sent to operations team', false, NULL, NOW() - INTERVAL '7 hours'),
  ('block_ip', '45.67.89.123', 'completed', 'Brute force attack source blocked', true, NULL, NOW() - INTERVAL '8 hours'),
  ('isolate_user', 'intern_summer_2024', 'completed', 'Intern account isolated due to policy violation', true, NULL, NOW() - INTERVAL '9 hours'),
  ('disable_account', 'api_service_legacy', 'completed', 'Deprecated API service account disabled', false, NULL, NOW() - INTERVAL '12 hours'),
  ('quarantine_file', '/tmp/cryptominer.bin', 'completed', 'Cryptocurrency miner detected and quarantined', true, NULL, NOW() - INTERVAL '15 hours'),
  ('send_notification', 'compliance@company.com', 'completed', 'Compliance violation alert sent', false, NULL, NOW() - INTERVAL '18 hours'),
  ('block_ip', '172.16.254.1', 'failed', 'Cannot block internal management IP', false, NULL, NOW() - INTERVAL '20 hours');