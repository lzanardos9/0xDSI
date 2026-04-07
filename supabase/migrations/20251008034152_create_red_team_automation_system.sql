/*
  # Red Team Automation System

  1. Purpose
    Advanced red team operations with AI-powered fuzzing and autonomous
    penetration testing using AgentBricks. Supports protocol fuzzing,
    application testing, and self-generating exploit techniques.

  2. Tables Created
    - fuzzing_campaigns: Fuzzing operation configurations
    - fuzzing_results: Crash analysis, coverage, anomalies
    - fuzzing_crashes: Detailed crash information
    - pentest_campaigns: Penetration testing operations
    - pentest_targets: Systems and services under test
    - pentest_findings: Vulnerabilities discovered
    - pentest_exploits: Exploit attempts and results
    - ai_generated_tools: Self-created tools by AgentBricks
    - agent_pentest_sessions: AI agent testing sessions
    - attack_chains: Multi-stage attack sequences

  3. Features
    - Protocol fuzzing (HTTP, DNS, SMB, SSH, etc.)
    - Application fuzzing (web apps, APIs, binaries)
    - AI-generated exploit techniques
    - Autonomous penetration testing
    - Attack chain orchestration
    - Coverage-guided fuzzing

  4. Security
    - RLS enabled with anonymous read access
    - Ethical hacking framework only
*/

-- Fuzzing Campaigns
CREATE TABLE IF NOT EXISTS fuzzing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  fuzzer_type text NOT NULL, -- afl, libfuzzer, honggfuzz, boofuzz, sulley, custom_ai
  target_type text NOT NULL, -- protocol, binary, web_app, api, network_service
  target_name text NOT NULL,
  target_protocol text, -- http, https, dns, smb, ssh, ftp, custom
  target_endpoint text,
  fuzzing_strategy text, -- mutation, generation, coverage_guided, ai_guided
  status text DEFAULT 'running',
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  duration_seconds integer,
  total_executions bigint DEFAULT 0,
  executions_per_second numeric(10,2) DEFAULT 0,
  total_crashes integer DEFAULT 0,
  unique_crashes integer DEFAULT 0,
  code_coverage_percent numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_fuzzer_type CHECK (fuzzer_type IN ('afl', 'libfuzzer', 'honggfuzz', 'boofuzz', 'sulley', 'custom_ai', 'peach', 'radamsa')),
  CONSTRAINT valid_status CHECK (status IN ('running', 'paused', 'completed', 'crashed', 'stopped'))
);

-- Fuzzing Results
CREATE TABLE IF NOT EXISTS fuzzing_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES fuzzing_campaigns(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  test_case_id text NOT NULL,
  input_data text,
  input_size integer,
  execution_time_ms numeric(10,3),
  result_type text NOT NULL, -- crash, hang, timeout, anomaly, normal
  crash_severity text, -- critical, high, medium, low
  crash_type text, -- segfault, assertion, memory_leak, buffer_overflow, null_deref
  stack_trace text,
  code_coverage_delta numeric(5,2),
  new_paths_discovered integer DEFAULT 0,
  interesting boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_result_type CHECK (result_type IN ('crash', 'hang', 'timeout', 'anomaly', 'normal', 'error'))
);

-- Fuzzing Crashes (Detailed Analysis)
CREATE TABLE IF NOT EXISTS fuzzing_crashes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES fuzzing_campaigns(id) ON DELETE CASCADE,
  crash_hash text NOT NULL,
  crash_type text NOT NULL,
  severity text NOT NULL,
  reproducible boolean DEFAULT false,
  reproduction_rate numeric(5,2) DEFAULT 0,
  exploit_potential text, -- high, medium, low, none
  cve_candidate boolean DEFAULT false,
  crash_input text,
  crash_input_size integer,
  registers jsonb DEFAULT '{}'::jsonb,
  stack_trace text,
  disassembly text,
  memory_map text,
  asan_report text,
  valgrind_report text,
  ai_analysis text,
  mitigation_bypass boolean DEFAULT false,
  first_seen timestamptz DEFAULT now(),
  last_seen timestamptz DEFAULT now(),
  occurrence_count integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Penetration Test Campaigns
CREATE TABLE IF NOT EXISTS pentest_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_name text NOT NULL,
  campaign_type text NOT NULL, -- external, internal, web_app, api, wireless, social, physical
  scope text NOT NULL,
  methodology text, -- owasp, ptes, osstmm, custom
  automation_level text DEFAULT 'ai_autonomous', -- manual, semi_auto, ai_autonomous
  agent_model text DEFAULT 'agentbricks_v3',
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  status text DEFAULT 'in_progress',
  targets_count integer DEFAULT 0,
  vulnerabilities_found integer DEFAULT 0,
  critical_findings integer DEFAULT 0,
  high_findings integer DEFAULT 0,
  medium_findings integer DEFAULT 0,
  low_findings integer DEFAULT 0,
  exploited_count integer DEFAULT 0,
  risk_score numeric(5,2) DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_campaign_type CHECK (campaign_type IN ('external', 'internal', 'web_app', 'api', 'wireless', 'social', 'physical', 'red_team')),
  CONSTRAINT valid_status CHECK (status IN ('planning', 'in_progress', 'paused', 'completed', 'aborted'))
);

-- Penetration Test Targets
CREATE TABLE IF NOT EXISTS pentest_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pentest_campaigns(id) ON DELETE CASCADE,
  target_name text NOT NULL,
  target_type text NOT NULL, -- host, network, web_app, api, service, user
  ip_address inet,
  hostname text,
  port integer,
  service_name text,
  service_version text,
  os_detected text,
  firewall_detected boolean DEFAULT false,
  waf_detected boolean DEFAULT false,
  ids_ips_detected boolean DEFAULT false,
  scan_status text DEFAULT 'pending',
  vulnerabilities_found integer DEFAULT 0,
  exploited boolean DEFAULT false,
  compromised boolean DEFAULT false,
  privilege_level text, -- none, user, admin, system
  created_at timestamptz DEFAULT now()
);

-- Penetration Test Findings
CREATE TABLE IF NOT EXISTS pentest_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pentest_campaigns(id) ON DELETE CASCADE,
  target_id uuid REFERENCES pentest_targets(id) ON DELETE CASCADE,
  finding_type text NOT NULL, -- vulnerability, misconfiguration, weakness, exposure
  vulnerability_name text NOT NULL,
  cve_id text,
  cvss_score numeric(3,1),
  severity text NOT NULL,
  category text, -- injection, broken_auth, sensitive_data, xxe, broken_access, misconfig
  owasp_top10 text,
  description text,
  affected_component text,
  proof_of_concept text,
  exploitation_difficulty text, -- trivial, easy, medium, hard, very_hard
  exploited boolean DEFAULT false,
  remediation text,
  discovered_by text, -- scanner, agent, manual, ai_generated
  discovery_technique text,
  discovered_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Penetration Test Exploits
CREATE TABLE IF NOT EXISTS pentest_exploits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pentest_campaigns(id) ON DELETE CASCADE,
  finding_id uuid REFERENCES pentest_findings(id) ON DELETE CASCADE,
  target_id uuid REFERENCES pentest_targets(id) ON DELETE CASCADE,
  exploit_name text NOT NULL,
  exploit_type text, -- remote, local, web, client_side, social
  exploit_technique text,
  exploit_source text, -- metasploit, exploit_db, custom, ai_generated
  payload_type text,
  attempt_time timestamptz DEFAULT now(),
  success boolean DEFAULT false,
  result_description text,
  privileges_gained text,
  access_level text,
  persistence_established boolean DEFAULT false,
  lateral_movement boolean DEFAULT false,
  data_exfiltrated boolean DEFAULT false,
  detection_evaded boolean DEFAULT false,
  tool_used text,
  command_executed text,
  created_at timestamptz DEFAULT now()
);

-- AI-Generated Tools (AgentBricks)
CREATE TABLE IF NOT EXISTS ai_generated_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_name text NOT NULL,
  tool_type text NOT NULL, -- scanner, exploit, fuzzer, recon, post_exploit, pivoting
  tool_purpose text NOT NULL,
  target_vulnerability text,
  programming_language text,
  source_code text,
  compiled_binary bytea,
  creation_method text, -- llm_generation, code_evolution, technique_combination
  ai_model text DEFAULT 'agentbricks_v3',
  effectiveness_score numeric(5,2) DEFAULT 0,
  success_rate numeric(5,2) DEFAULT 0,
  times_used integer DEFAULT 0,
  successful_uses integer DEFAULT 0,
  detection_rate numeric(5,2) DEFAULT 0,
  evasion_techniques jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  last_used_at timestamptz
);

-- Agent Penetration Test Sessions
CREATE TABLE IF NOT EXISTS agent_pentest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pentest_campaigns(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  agent_name text NOT NULL,
  agent_role text, -- reconnaissance, exploitation, privilege_escalation, persistence, exfiltration
  session_start timestamptz DEFAULT now(),
  session_end timestamptz,
  actions_performed integer DEFAULT 0,
  tools_created integer DEFAULT 0,
  vulnerabilities_discovered integer DEFAULT 0,
  successful_exploits integer DEFAULT 0,
  failed_attempts integer DEFAULT 0,
  evasion_techniques_used jsonb DEFAULT '[]'::jsonb,
  goals_achieved jsonb DEFAULT '[]'::jsonb,
  reasoning_log text,
  decision_tree jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Attack Chains (Multi-Stage Attacks)
CREATE TABLE IF NOT EXISTS attack_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES pentest_campaigns(id) ON DELETE CASCADE,
  chain_name text NOT NULL,
  attack_scenario text,
  initial_access_technique text,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  current_stage integer DEFAULT 1,
  total_stages integer NOT NULL,
  success boolean DEFAULT false,
  objectives_completed jsonb DEFAULT '[]'::jsonb,
  mitre_attack_tactics jsonb DEFAULT '[]'::jsonb,
  start_time timestamptz DEFAULT now(),
  end_time timestamptz,
  duration_seconds integer,
  detection_events integer DEFAULT 0,
  blue_team_response boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fuzzing_campaigns_status ON fuzzing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_fuzzing_results_campaign_id ON fuzzing_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_fuzzing_crashes_campaign_id ON fuzzing_crashes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pentest_campaigns_status ON pentest_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_pentest_targets_campaign_id ON pentest_targets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pentest_findings_campaign_id ON pentest_findings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pentest_exploits_campaign_id ON pentest_exploits(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ai_generated_tools_type ON ai_generated_tools(tool_type);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_campaign_id ON agent_pentest_sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_attack_chains_campaign_id ON attack_chains(campaign_id);

-- Enable RLS
ALTER TABLE fuzzing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuzzing_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE fuzzing_crashes ENABLE ROW LEVEL SECURITY;
ALTER TABLE pentest_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pentest_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE pentest_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE pentest_exploits ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_generated_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_pentest_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attack_chains ENABLE ROW LEVEL SECURITY;

-- Anonymous read policies
CREATE POLICY "Allow anonymous read fuzzing campaigns" ON fuzzing_campaigns FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read fuzzing results" ON fuzzing_results FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read fuzzing crashes" ON fuzzing_crashes FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read pentest campaigns" ON pentest_campaigns FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read pentest targets" ON pentest_targets FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read pentest findings" ON pentest_findings FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read pentest exploits" ON pentest_exploits FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read ai generated tools" ON ai_generated_tools FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read agent sessions" ON agent_pentest_sessions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read attack chains" ON attack_chains FOR SELECT TO anon USING (true);