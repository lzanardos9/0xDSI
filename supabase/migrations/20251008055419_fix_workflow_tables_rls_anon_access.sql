/*
  # Fix RLS for Workflow Tables
  
  Updates RLS policies to use 'anon' role instead of 'public' for anonymous access.
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Anyone can view workflows" ON n8n_workflows;
DROP POLICY IF EXISTS "Anyone can view executions" ON workflow_executions;
DROP POLICY IF EXISTS "Anyone can view triggers" ON workflow_triggers;

-- Create new policies with proper access
CREATE POLICY "Enable read access for all users" ON n8n_workflows
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON workflow_executions
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON workflow_triggers
  FOR SELECT USING (true);
