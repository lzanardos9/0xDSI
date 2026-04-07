/*
  # Fix RLS Access for LLM Tables
  
  Ensures anonymous users can read all LLM-related data.
*/

-- Drop existing policies
DROP POLICY IF EXISTS "Allow anonymous read access to llm_risk_profiles" ON llm_risk_profiles;
DROP POLICY IF EXISTS "Allow anonymous read access to llm_interactions" ON llm_interactions;
DROP POLICY IF EXISTS "Allow anonymous read access to llm_risk_incidents" ON llm_risk_incidents;

-- Disable RLS temporarily to ensure fresh setup
ALTER TABLE llm_risk_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE llm_interactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE llm_risk_incidents DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_psychological_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE psychological_risk_factors DISABLE ROW LEVEL SECURITY;
ALTER TABLE communication_sources DISABLE ROW LEVEL SECURITY;
ALTER TABLE cross_platform_behavioral_patterns DISABLE ROW LEVEL SECURITY;

-- Re-enable RLS
ALTER TABLE llm_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_risk_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_psychological_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE psychological_risk_factors ENABLE ROW LEVEL SECURITY;
ALTER TABLE communication_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE cross_platform_behavioral_patterns ENABLE ROW LEVEL SECURITY;

-- Create policies for EVERYONE (anon + authenticated)
CREATE POLICY "Enable read access for all users" ON llm_risk_profiles
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON llm_interactions
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON llm_risk_incidents
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON user_psychological_profiles
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON psychological_risk_factors
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON communication_sources
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON cross_platform_behavioral_patterns
  FOR SELECT USING (true);
