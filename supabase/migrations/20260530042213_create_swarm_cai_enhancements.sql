/*
  # Swarm Crucible CAI (Capture-the-Flag AI) Enhancements

  Inspired by the CAI research paper on evaluating autonomous AI agents in Attack/Defense CTF scenarios.
  Adds 5 new analytical dimensions to the Swarm Crucible simulation.

  1. New Tables
    - `swarm_patch_validations`
      - `id` (uuid, primary key)
      - `run_id` (uuid, FK to swarm_runs)
      - `patch_name` (text) - name of the defense patch applied
      - `target_cwe` (text) - CWE being patched
      - `service_name` (text) - service being patched
      - `patch_applied_at` (timestamptz)
      - `availability_before` (numeric) - service availability % before patch
      - `availability_after` (numeric) - service availability % after patch
      - `security_score_before` (numeric) - security posture before
      - `security_score_after` (numeric) - security posture after
      - `latency_impact_ms` (numeric) - added latency from patch
      - `service_disrupted` (boolean) - whether patch broke service
      - `rollback_required` (boolean) - whether rollback was needed
      - `validation_status` (text) - pass/fail/degraded
      - `side` (text) - blue (defender)
      - `generation` (int)

    - `swarm_cwe_difficulty`
      - `id` (uuid, primary key)
      - `run_id` (uuid, FK to swarm_runs)
      - `cwe_id` (text) - e.g. CWE-787
      - `cwe_name` (text)
      - `category` (text) - memory, injection, logic, race, crypto, auth
      - `red_success_rate` (numeric) - % of red team exploit attempts that succeed
      - `blue_patch_rate` (numeric) - % of blue team patches that hold
      - `avg_exploit_time_sec` (numeric)
      - `avg_patch_time_sec` (numeric)
      - `difficulty_tier` (text) - trivial/easy/medium/hard/extreme
      - `total_attempts` (int)
      - `generation` (int)
      - `updated_at` (timestamptz)

    - `swarm_token_costs`
      - `id` (uuid, primary key)
      - `run_id` (uuid, FK to swarm_runs)
      - `side` (text) - red/blue
      - `agent_name` (text)
      - `action_type` (text) - exploit/patch/recon/escalate/contain
      - `tokens_used` (int)
      - `cost_usd` (numeric)
      - `success` (boolean)
      - `tokens_per_success` (numeric) - efficiency metric
      - `cumulative_tokens` (int)
      - `cumulative_cost_usd` (numeric)
      - `generation` (int)
      - `tick` (int)
      - `recorded_at` (timestamptz)

    - `swarm_race_conditions`
      - `id` (uuid, primary key)
      - `run_id` (uuid, FK to swarm_runs)
      - `vulnerability_id` (text) - target vuln being raced
      - `cwe_id` (text)
      - `red_start_tick` (int) - when red began exploit attempt
      - `blue_start_tick` (int) - when blue began patch attempt
      - `red_complete_tick` (int, nullable) - when red succeeded (null = failed)
      - `blue_complete_tick` (int, nullable) - when blue succeeded (null = failed)
      - `winner` (text) - red/blue/draw
      - `margin_ticks` (int) - how close the race was
      - `red_technique` (text)
      - `blue_countermeasure` (text)
      - `generation` (int)

    - `swarm_defense_scores`
      - `id` (uuid, primary key)
      - `run_id` (uuid, FK to swarm_runs)
      - `defense_name` (text)
      - `mitre_technique_blocked` (text)
      - `security_effectiveness` (numeric) - 0-100
      - `availability_preserved` (numeric) - 0-100
      - `combined_score` (numeric) - weighted composite
      - `false_positive_rate` (numeric)
      - `mean_time_to_block_ms` (numeric)
      - `collateral_damage` (numeric) - 0-100 (legitimate traffic blocked)
      - `constraint_violations` (int) - number of service constraints broken
      - `generation` (int)
      - `tick` (int)
      - `evaluated_at` (timestamptz)

  2. Security
    - Enable RLS on all new tables
    - Authenticated users can read all data
    - Authenticated users can insert/update their own run data

  3. Seed Data
    - Pre-populate CWE difficulty data for immediate visualization
    - Sample race condition outcomes
    - Sample defense scores
*/

-- Patch Validations
CREATE TABLE IF NOT EXISTS swarm_patch_validations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  patch_name text NOT NULL,
  target_cwe text NOT NULL DEFAULT '',
  service_name text NOT NULL DEFAULT '',
  patch_applied_at timestamptz DEFAULT now(),
  availability_before numeric DEFAULT 99.9,
  availability_after numeric DEFAULT 99.9,
  security_score_before numeric DEFAULT 50,
  security_score_after numeric DEFAULT 75,
  latency_impact_ms numeric DEFAULT 0,
  service_disrupted boolean DEFAULT false,
  rollback_required boolean DEFAULT false,
  validation_status text DEFAULT 'pass',
  side text DEFAULT 'blue',
  generation int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE swarm_patch_validations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read patch validations"
  ON swarm_patch_validations FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert patch validations"
  ON swarm_patch_validations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- CWE Difficulty Heatmap
CREATE TABLE IF NOT EXISTS swarm_cwe_difficulty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  cwe_id text NOT NULL,
  cwe_name text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'memory',
  red_success_rate numeric DEFAULT 0,
  blue_patch_rate numeric DEFAULT 0,
  avg_exploit_time_sec numeric DEFAULT 0,
  avg_patch_time_sec numeric DEFAULT 0,
  difficulty_tier text DEFAULT 'medium',
  total_attempts int DEFAULT 0,
  generation int DEFAULT 0,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE swarm_cwe_difficulty ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cwe difficulty"
  ON swarm_cwe_difficulty FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert cwe difficulty"
  ON swarm_cwe_difficulty FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Token Cost Tracking
CREATE TABLE IF NOT EXISTS swarm_token_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  side text NOT NULL DEFAULT 'red',
  agent_name text NOT NULL DEFAULT '',
  action_type text NOT NULL DEFAULT 'exploit',
  tokens_used int DEFAULT 0,
  cost_usd numeric DEFAULT 0,
  success boolean DEFAULT false,
  tokens_per_success numeric DEFAULT 0,
  cumulative_tokens int DEFAULT 0,
  cumulative_cost_usd numeric DEFAULT 0,
  generation int DEFAULT 0,
  tick int DEFAULT 0,
  recorded_at timestamptz DEFAULT now()
);

ALTER TABLE swarm_token_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read token costs"
  ON swarm_token_costs FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert token costs"
  ON swarm_token_costs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Race Conditions
CREATE TABLE IF NOT EXISTS swarm_race_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  vulnerability_id text NOT NULL DEFAULT '',
  cwe_id text NOT NULL DEFAULT '',
  red_start_tick int DEFAULT 0,
  blue_start_tick int DEFAULT 0,
  red_complete_tick int,
  blue_complete_tick int,
  winner text DEFAULT 'draw',
  margin_ticks int DEFAULT 0,
  red_technique text DEFAULT '',
  blue_countermeasure text DEFAULT '',
  generation int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE swarm_race_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read race conditions"
  ON swarm_race_conditions FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert race conditions"
  ON swarm_race_conditions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Defense Scores (Constraint-Aware)
CREATE TABLE IF NOT EXISTS swarm_defense_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES swarm_runs(id) ON DELETE CASCADE,
  defense_name text NOT NULL DEFAULT '',
  mitre_technique_blocked text DEFAULT '',
  security_effectiveness numeric DEFAULT 0,
  availability_preserved numeric DEFAULT 100,
  combined_score numeric DEFAULT 0,
  false_positive_rate numeric DEFAULT 0,
  mean_time_to_block_ms numeric DEFAULT 0,
  collateral_damage numeric DEFAULT 0,
  constraint_violations int DEFAULT 0,
  generation int DEFAULT 0,
  tick int DEFAULT 0,
  evaluated_at timestamptz DEFAULT now()
);

ALTER TABLE swarm_defense_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read defense scores"
  ON swarm_defense_scores FOR SELECT
  TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert defense scores"
  ON swarm_defense_scores FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Seed CWE difficulty data
INSERT INTO swarm_cwe_difficulty (cwe_id, cwe_name, category, red_success_rate, blue_patch_rate, avg_exploit_time_sec, avg_patch_time_sec, difficulty_tier, total_attempts) VALUES
  ('CWE-787', 'Out-of-bounds Write', 'memory', 78.5, 62.1, 45.2, 120.8, 'easy', 847),
  ('CWE-79', 'Cross-site Scripting', 'injection', 82.3, 71.4, 22.1, 55.3, 'trivial', 1203),
  ('CWE-89', 'SQL Injection', 'injection', 76.1, 85.2, 18.7, 32.4, 'trivial', 956),
  ('CWE-416', 'Use After Free', 'memory', 54.2, 48.7, 180.5, 240.1, 'hard', 523),
  ('CWE-78', 'OS Command Injection', 'injection', 71.8, 88.3, 15.2, 28.9, 'easy', 712),
  ('CWE-125', 'Out-of-bounds Read', 'memory', 68.9, 55.3, 62.4, 95.7, 'medium', 634),
  ('CWE-22', 'Path Traversal', 'logic', 73.4, 79.8, 12.8, 41.2, 'easy', 891),
  ('CWE-352', 'Cross-Site Request Forgery', 'logic', 64.7, 91.2, 35.6, 22.1, 'medium', 445),
  ('CWE-434', 'Unrestricted Upload', 'logic', 81.2, 76.5, 28.3, 45.8, 'easy', 667),
  ('CWE-862', 'Missing Authorization', 'auth', 88.1, 82.4, 8.5, 18.7, 'trivial', 1102),
  ('CWE-476', 'NULL Pointer Deref', 'memory', 42.1, 72.3, 95.2, 45.6, 'medium', 389),
  ('CWE-287', 'Improper Authentication', 'auth', 71.3, 78.9, 42.1, 55.3, 'medium', 578),
  ('CWE-190', 'Integer Overflow', 'memory', 38.7, 45.2, 210.4, 180.2, 'hard', 312),
  ('CWE-502', 'Deserialization', 'injection', 62.4, 58.1, 85.3, 120.7, 'medium', 423),
  ('CWE-362', 'Race Condition', 'race', 24.8, 31.2, 320.5, 280.4, 'extreme', 198),
  ('CWE-798', 'Hard-coded Credentials', 'auth', 92.4, 95.1, 5.2, 12.1, 'trivial', 1456),
  ('CWE-611', 'XXE Injection', 'injection', 58.3, 82.7, 48.9, 35.2, 'medium', 367),
  ('CWE-918', 'SSRF', 'logic', 67.2, 64.8, 55.1, 72.4, 'medium', 498),
  ('CWE-327', 'Broken Crypto', 'crypto', 31.5, 42.8, 280.1, 350.2, 'extreme', 156),
  ('CWE-295', 'Improper Cert Validation', 'crypto', 45.2, 68.4, 120.3, 85.7, 'hard', 287),
  ('CWE-94', 'Code Injection', 'injection', 69.8, 72.1, 32.4, 48.9, 'easy', 734),
  ('CWE-269', 'Improper Privilege Mgmt', 'auth', 74.6, 65.3, 58.2, 92.1, 'medium', 512),
  ('CWE-400', 'Resource Exhaustion', 'logic', 85.3, 52.1, 8.1, 145.8, 'easy', 923),
  ('CWE-306', 'Missing Auth for Critical Fn', 'auth', 91.2, 87.4, 6.8, 15.2, 'trivial', 1089);

-- Seed sample race conditions
INSERT INTO swarm_race_conditions (vulnerability_id, cwe_id, red_start_tick, blue_start_tick, red_complete_tick, blue_complete_tick, winner, margin_ticks, red_technique, blue_countermeasure, generation) VALUES
  ('VULN-001', 'CWE-787', 120, 125, 145, 148, 'red', 3, 'T1190 - Buffer Overflow Exploit', 'ASLR + Stack Canary Patch', 3),
  ('VULN-002', 'CWE-89', 200, 195, 218, 212, 'blue', 6, 'T1190 - SQL Injection Payload', 'Parameterized Query Rewrite', 4),
  ('VULN-003', 'CWE-416', 310, 320, 395, NULL, 'red', 0, 'T1055 - UAF Heap Spray', 'Safe Pointer Wrapping', 5),
  ('VULN-004', 'CWE-78', 420, 418, 435, 430, 'blue', 5, 'T1059 - Command Chain', 'Input Sanitizer Deploy', 6),
  ('VULN-005', 'CWE-362', 500, 490, NULL, 545, 'blue', 0, 'T1068 - Race Exploit', 'Mutex Lock Enforcement', 7),
  ('VULN-006', 'CWE-434', 580, 590, 598, 605, 'red', 7, 'T1204 - Malicious Upload', 'MIME Validation + Sandbox', 8),
  ('VULN-007', 'CWE-125', 650, 645, 680, 678, 'blue', 2, 'T1005 - OOB Read Chain', 'Bounds Check Injection', 9),
  ('VULN-008', 'CWE-502', 720, 730, 765, 762, 'blue', 3, 'T1059 - Deser Gadget Chain', 'Allowlist Deserialization', 10),
  ('VULN-009', 'CWE-798', 800, 795, 805, 802, 'blue', 3, 'T1078 - Hardcoded Creds', 'Credential Rotation + Vault', 11),
  ('VULN-010', 'CWE-190', 880, 900, 960, NULL, 'red', 0, 'T1203 - Integer Overflow', 'SafeInt Wrapper Deploy', 12),
  ('VULN-011', 'CWE-287', 950, 940, 975, 968, 'blue', 7, 'T1110 - Auth Bypass', 'MFA + Session Binding', 13),
  ('VULN-012', 'CWE-79', 1020, 1025, 1035, 1038, 'red', 3, 'T1189 - Reflected XSS', 'CSP Header Deploy', 14);

-- Seed defense scores
INSERT INTO swarm_defense_scores (defense_name, mitre_technique_blocked, security_effectiveness, availability_preserved, combined_score, false_positive_rate, mean_time_to_block_ms, collateral_damage, constraint_violations, generation, tick) VALUES
  ('ASLR + DEP Enforcement', 'T1190', 85.2, 99.8, 91.3, 0.1, 0.5, 0.2, 0, 5, 200),
  ('WAF Rule Injection', 'T1190', 72.4, 97.2, 83.1, 3.8, 12.4, 4.5, 1, 5, 200),
  ('Network Micro-Segmentation', 'T1021', 91.8, 94.5, 92.8, 1.2, 2.1, 5.8, 2, 6, 300),
  ('EDR Process Isolation', 'T1055', 88.3, 96.1, 91.5, 2.4, 8.7, 3.2, 1, 7, 400),
  ('Zero-Trust MFA Gate', 'T1078', 94.7, 92.3, 93.2, 5.1, 450.0, 8.1, 3, 8, 500),
  ('SOAR Auto-Containment', 'T1486', 78.9, 88.4, 82.8, 7.2, 1200.0, 12.4, 4, 9, 600),
  ('DNS Sinkhole + Reputation', 'T1071', 82.1, 99.5, 89.6, 1.8, 3.2, 1.1, 0, 10, 700),
  ('Kernel Telemetry Monitor', 'T1059', 76.5, 99.9, 86.4, 0.5, 1.8, 0.3, 0, 11, 800),
  ('Deception Canary Assets', 'T1005', 68.4, 100.0, 81.2, 0.0, 0.0, 0.0, 0, 12, 900),
  ('Container Runtime Guard', 'T1610', 89.7, 95.8, 92.1, 2.1, 15.3, 4.2, 1, 13, 1000),
  ('Supply Chain SBOM Validator', 'T1195', 71.2, 98.7, 83.1, 1.5, 2400.0, 1.8, 0, 14, 1100),
  ('ML Anomaly Detector', 'T1027', 63.8, 99.1, 78.7, 8.4, 45.2, 2.1, 0, 15, 1200);

-- Seed patch validations
INSERT INTO swarm_patch_validations (patch_name, target_cwe, service_name, availability_before, availability_after, security_score_before, security_score_after, latency_impact_ms, service_disrupted, rollback_required, validation_status, generation) VALUES
  ('Stack Canary + NX Enable', 'CWE-787', 'nginx-proxy', 99.99, 99.97, 45, 82, 0.3, false, false, 'pass', 3),
  ('Parameterized Query Migration', 'CWE-89', 'api-gateway', 99.95, 99.94, 38, 95, 1.2, false, false, 'pass', 4),
  ('Input Length Validation', 'CWE-78', 'admin-console', 99.90, 99.88, 52, 88, 0.8, false, false, 'pass', 5),
  ('ASLR Full Randomization', 'CWE-416', 'render-engine', 99.95, 98.20, 61, 79, 15.4, true, true, 'fail', 6),
  ('CSP Strict-Dynamic', 'CWE-79', 'web-frontend', 99.98, 97.50, 42, 91, 0.1, true, false, 'degraded', 7),
  ('Mutex Lock + Atomic Ops', 'CWE-362', 'payment-service', 99.99, 99.85, 35, 72, 8.2, false, false, 'pass', 8),
  ('MIME Type Enforcement', 'CWE-434', 'file-upload-svc', 99.92, 99.91, 48, 86, 2.1, false, false, 'pass', 9),
  ('SafeInt Math Library', 'CWE-190', 'calc-engine', 99.97, 99.96, 55, 78, 0.4, false, false, 'pass', 10),
  ('Credential Vault Rotation', 'CWE-798', 'auth-service', 99.99, 95.20, 28, 97, 450.0, true, true, 'fail', 11),
  ('TLS Certificate Pinning', 'CWE-295', 'mobile-api', 99.88, 99.85, 62, 89, 3.5, false, false, 'pass', 12),
  ('Deser Allowlist Filter', 'CWE-502', 'rpc-gateway', 99.94, 99.90, 44, 83, 5.8, false, false, 'pass', 13),
  ('Rate Limiter + Circuit Breaker', 'CWE-400', 'public-api', 99.96, 94.80, 51, 76, 0.2, true, false, 'degraded', 14);

-- Seed token costs
INSERT INTO swarm_token_costs (side, agent_name, action_type, tokens_used, cost_usd, success, tokens_per_success, cumulative_tokens, cumulative_cost_usd, generation, tick) VALUES
  ('red', 'Exploit-GPT', 'exploit', 4200, 0.042, true, 4200, 4200, 0.042, 1, 50),
  ('red', 'Exploit-GPT', 'exploit', 6800, 0.068, false, 0, 11000, 0.110, 2, 100),
  ('red', 'Exploit-GPT', 'exploit', 3100, 0.031, true, 3650, 14100, 0.141, 3, 150),
  ('red', 'Recon-Agent', 'recon', 1800, 0.018, true, 1800, 15900, 0.159, 3, 160),
  ('red', 'Escalation-Bot', 'escalate', 8500, 0.085, true, 8500, 24400, 0.244, 4, 200),
  ('red', 'Exploit-GPT', 'exploit', 12400, 0.124, false, 0, 36800, 0.368, 5, 250),
  ('red', 'Exploit-GPT', 'exploit', 5200, 0.052, true, 5700, 42000, 0.420, 6, 300),
  ('blue', 'Patch-Synthesizer', 'patch', 3800, 0.038, true, 3800, 3800, 0.038, 1, 55),
  ('blue', 'Patch-Synthesizer', 'patch', 5200, 0.052, false, 0, 9000, 0.090, 2, 105),
  ('blue', 'Patch-Synthesizer', 'patch', 2900, 0.029, true, 3350, 11900, 0.119, 3, 155),
  ('blue', 'Containment-AI', 'contain', 1200, 0.012, true, 1200, 13100, 0.131, 3, 165),
  ('blue', 'Patch-Synthesizer', 'patch', 7800, 0.078, true, 4175, 20900, 0.209, 4, 205),
  ('blue', 'Detection-Agent', 'recon', 2100, 0.021, true, 2100, 23000, 0.230, 5, 255),
  ('blue', 'Patch-Synthesizer', 'patch', 4500, 0.045, true, 4033, 27500, 0.275, 6, 305);
