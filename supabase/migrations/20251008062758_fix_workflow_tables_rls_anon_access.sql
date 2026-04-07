/*
  # Fix Workflow Tables RLS for Anonymous Access
  
  Ensures anonymous users can read workflow and execution data.
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Enable read access for all users" ON n8n_workflows;
DROP POLICY IF EXISTS "Authenticated users can manage workflows" ON n8n_workflows;
DROP POLICY IF EXISTS "Enable read access for all users" ON workflow_executions;
DROP POLICY IF EXISTS "Authenticated users can create executions" ON workflow_executions;

-- Create universal read policies for n8n_workflows
CREATE POLICY "Enable read for all users" ON n8n_workflows
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON n8n_workflows
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON n8n_workflows
  FOR UPDATE USING (true);

-- Create universal read policies for workflow_executions  
CREATE POLICY "Enable read for all users" ON workflow_executions
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for all users" ON workflow_executions
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for all users" ON workflow_executions
  FOR UPDATE USING (true);