/*
  # Fix Red Team Automation RLS Policies

  1. Overview
    - Ensure all Red Team tables have proper RLS policies for anonymous access
    - Add policies for authenticated users as well
    
  2. Tables Covered
    - fuzzing_campaigns
    - fuzzing_results
    - fuzzing_crashes
    - pentest_campaigns
    - pentest_targets
    - pentest_findings
    - pentest_exploits
    - agent_pentest_sessions
    - ai_generated_tools
    - attack_chains
*/

-- Drop all existing policies
DROP POLICY IF EXISTS "Allow anon read fuzzing_campaigns" ON fuzzing_campaigns;
DROP POLICY IF EXISTS "Allow anon read fuzzing_results" ON fuzzing_results;
DROP POLICY IF EXISTS "Allow anonymous read fuzzing crashes" ON fuzzing_crashes;
DROP POLICY IF EXISTS "Allow anon read pentest_campaigns" ON pentest_campaigns;
DROP POLICY IF EXISTS "Allow anonymous read pentest targets" ON pentest_targets;
DROP POLICY IF EXISTS "Allow anon read pentest_findings" ON pentest_findings;
DROP POLICY IF EXISTS "Allow anonymous read pentest exploits" ON pentest_exploits;
DROP POLICY IF EXISTS "Allow anon read agent_pentest_sessions" ON agent_pentest_sessions;
DROP POLICY IF EXISTS "Allow anon read ai_generated_tools" ON ai_generated_tools;
DROP POLICY IF EXISTS "Allow anon read attack_chains" ON attack_chains;

-- Create new policies for all Red Team tables allowing both anon and authenticated

-- Fuzzing Campaigns
CREATE POLICY "Enable read access for all users"
  ON fuzzing_campaigns FOR SELECT
  TO anon, authenticated
  USING (true);

-- Fuzzing Results
CREATE POLICY "Enable read access for all users"
  ON fuzzing_results FOR SELECT
  TO anon, authenticated
  USING (true);

-- Fuzzing Crashes
CREATE POLICY "Enable read access for all users"
  ON fuzzing_crashes FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pentest Campaigns
CREATE POLICY "Enable read access for all users"
  ON pentest_campaigns FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pentest Targets
CREATE POLICY "Enable read access for all users"
  ON pentest_targets FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pentest Findings
CREATE POLICY "Enable read access for all users"
  ON pentest_findings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Pentest Exploits
CREATE POLICY "Enable read access for all users"
  ON pentest_exploits FOR SELECT
  TO anon, authenticated
  USING (true);

-- Agent Pentest Sessions
CREATE POLICY "Enable read access for all users"
  ON agent_pentest_sessions FOR SELECT
  TO anon, authenticated
  USING (true);

-- AI Generated Tools
CREATE POLICY "Enable read access for all users"
  ON ai_generated_tools FOR SELECT
  TO anon, authenticated
  USING (true);

-- Attack Chains
CREATE POLICY "Enable read access for all users"
  ON attack_chains FOR SELECT
  TO anon, authenticated
  USING (true);
