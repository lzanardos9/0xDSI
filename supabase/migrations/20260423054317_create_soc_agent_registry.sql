/*
  # SOC Agent Registry

  Adds a registry table so new SOC agents created via Feature Lab can join the
  five existing hardcoded agents in the 3D SOC scene and in the Agent Bricks
  SOC panel.

  1. New Table: soc_agent_registry
    - agent_key (unique text key), name, role, agent_type, color, status, task
    - system_prompt used by the agent-chat edge function for custom personas
    - accuracy / throughput / tasks_completed metrics for the HUD
    - is_custom flag + source_creation_id linking back to Feature Lab
  2. Seed Data
    - Inserts the 5 built-in agents (Atlas, Sage, Commander, Nova, Vanguard)
      with is_custom=false so the scene can load them from DB uniformly.
  3. Security
    - RLS enabled, public read, insert/update/delete restricted to is_custom=true.
*/

CREATE TABLE IF NOT EXISTS soc_agent_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL DEFAULT 'Custom Agent',
  agent_type text NOT NULL DEFAULT 'custom',
  color text NOT NULL DEFAULT '#06b6d4',
  status text NOT NULL DEFAULT 'active',
  task text NOT NULL DEFAULT 'Standing by for orchestrator dispatch',
  system_prompt text NOT NULL DEFAULT '',
  accuracy numeric NOT NULL DEFAULT 95.0,
  throughput integer NOT NULL DEFAULT 100,
  tasks_completed integer NOT NULL DEFAULT 0,
  is_custom boolean NOT NULL DEFAULT true,
  source_creation_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_soc_agent_registry_is_custom ON soc_agent_registry(is_custom);
CREATE INDEX IF NOT EXISTS idx_soc_agent_registry_agent_type ON soc_agent_registry(agent_type);

ALTER TABLE soc_agent_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read SOC agents" ON soc_agent_registry;
CREATE POLICY "Anyone can read SOC agents"
  ON soc_agent_registry FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Anyone can insert custom SOC agents" ON soc_agent_registry;
CREATE POLICY "Anyone can insert custom SOC agents"
  ON soc_agent_registry FOR INSERT
  TO anon, authenticated
  WITH CHECK (is_custom = true);

DROP POLICY IF EXISTS "Anyone can update custom SOC agents" ON soc_agent_registry;
CREATE POLICY "Anyone can update custom SOC agents"
  ON soc_agent_registry FOR UPDATE
  TO anon, authenticated
  USING (is_custom = true)
  WITH CHECK (is_custom = true);

DROP POLICY IF EXISTS "Anyone can delete custom SOC agents" ON soc_agent_registry;
CREATE POLICY "Anyone can delete custom SOC agents"
  ON soc_agent_registry FOR DELETE
  TO anon, authenticated
  USING (is_custom = true);

INSERT INTO soc_agent_registry (agent_key, name, role, agent_type, color, status, task, system_prompt, accuracy, throughput, tasks_completed, is_custom)
VALUES
  ('triage', 'Atlas', 'Triage Agent', 'triage', '#f59e0b', 'busy',
   'Classifying 14 new alerts by severity and confidence scoring',
   '', 96.2, 342, 1847, false),
  ('enrich', 'Sage', 'Enrichment Agent', 'enrichment', '#14b8a6', 'active',
   'Cross-referencing IOCs with 12 threat intelligence feeds',
   '', 94.8, 128, 923, false),
  ('orch', 'Commander', 'Orchestrator', 'orchestrator', '#06b6d4', 'active',
   'Coordinating investigation pipeline across all agents',
   '', 99.1, 56, 4201, false),
  ('invest', 'Nova', 'Investigation Agent', 'investigation', '#3b82f6', 'active',
   'Deep-dive analysis of lateral movement kill chain',
   '', 97.5, 89, 1156, false),
  ('respond', 'Vanguard', 'Response Agent', 'response', '#ef4444', 'alert',
   'Executing automated IP block on 185.220.101.34',
   '', 98.7, 201, 2034, false)
ON CONFLICT (agent_key) DO NOTHING;
