/*
  # Agent Implementations Registry

  ## Summary
  Stores production-grade implementation code, configuration, and
  integration scaffolding for every agent in `canonical_agents`. Each
  row is keyed by `slug` matching `canonical_agents.slug`.

  ## New Tables
    - `agent_implementations`
      - `id` (uuid, primary key)
      - `slug` (text, unique, FK by convention to canonical_agents.slug)
      - `language` (text) - python | typescript | sql
      - `production_code` (text) - full production-grade source
      - `config_yaml` (text) - declarative configuration
      - `integration_code` (text) - example caller / wiring snippet
      - `llm_config` (jsonb) - model/temperature/system_prompt
      - `dependencies` (text[]) - runtime dependencies
      - `notes` (text) - operational notes
      - `created_at` (timestamptz)

  ## Security
    - RLS enabled, read-only for authenticated/anon
*/

CREATE TABLE IF NOT EXISTS agent_implementations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  language text NOT NULL DEFAULT 'python',
  production_code text NOT NULL DEFAULT '',
  config_yaml text NOT NULL DEFAULT '',
  integration_code text NOT NULL DEFAULT '',
  llm_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependencies text[] NOT NULL DEFAULT '{}',
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE agent_implementations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_implementations' AND policyname='Authenticated can read agent implementations') THEN
    CREATE POLICY "Authenticated can read agent implementations"
      ON agent_implementations FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='agent_implementations' AND policyname='Anon can read agent implementations') THEN
    CREATE POLICY "Anon can read agent implementations"
      ON agent_implementations FOR SELECT TO anon USING (true);
  END IF;
END $$;
