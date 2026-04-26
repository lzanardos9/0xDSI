/*
  # Canonical Agents Registry

  ## Summary
  Creates a single source-of-truth registry that deduplicates the 43 raw
  agent references discovered across the codebase into a canonical list of
  ~30 unique agents. Phase-specific aliases (e.g. "Triage Agent" of Phase 5
  is the same persona as "Atlas") are folded into a single row with an
  `aliases` array so downstream views never double-count.

  ## New Tables
    - `canonical_agents`
      - `id` (uuid, primary key)
      - `slug` (text, unique) - kebab-case identifier
      - `name` (text) - canonical display name
      - `aliases` (text[]) - alternate names/codenames used in code/UI
      - `category` (text) - one of: soc_primary, pipeline, correlation, response,
                           discovery, learning, adversarial, assistant,
                           threat_intel, malware, build_time, infra
      - `role` (text) - one-line description of responsibility
      - `agent_type` (text) - deterministic | ml | llm | hybrid | human_in_loop
      - `cadence` (text) - real_time | streaming | batch | on_demand | scheduled
      - `owns_decision` (boolean) - true if it can autonomously decide outcomes
      - `phases` (int[]) - SOC pipeline phases (1-11) where it acts
      - `source_files` (text[]) - representative file paths
      - `created_at` (timestamptz)

  ## Security
    - RLS enabled
    - SELECT policy for authenticated users (read-only registry)
*/

CREATE TABLE IF NOT EXISTS canonical_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  category text NOT NULL DEFAULT 'soc_primary',
  role text NOT NULL DEFAULT '',
  agent_type text NOT NULL DEFAULT 'hybrid',
  cadence text NOT NULL DEFAULT 'real_time',
  owns_decision boolean NOT NULL DEFAULT false,
  phases int[] NOT NULL DEFAULT '{}',
  source_files text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE canonical_agents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canonical_agents' AND policyname = 'Authenticated can read canonical agents'
  ) THEN
    CREATE POLICY "Authenticated can read canonical agents"
      ON canonical_agents FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'canonical_agents' AND policyname = 'Anon can read canonical agents'
  ) THEN
    CREATE POLICY "Anon can read canonical agents"
      ON canonical_agents FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

INSERT INTO canonical_agents (slug, name, aliases, category, role, agent_type, cadence, owns_decision, phases, source_files) VALUES
  ('orchestrator', 'SOC Orchestrator', ARRAY['Commander','Agent Orchestrator','Pipeline Orchestrator'], 'pipeline',
    'Routes events through the 11-phase pipeline, coordinates handoffs and enforces SLAs across all SOC agents.',
    'deterministic', 'real_time', true, ARRAY[1,2,3,4,5,6,7,8,9,10,11],
    ARRAY['src/lib/agentOrchestrator.ts','supabase/functions/agent-orchestrator/index.ts','src/lib/notebooks/agentSOCOrchestrator.ts']),

  ('connector-adapter', 'Connector Adapter', ARRAY['Auto Loader','Ingest Adapter'], 'pipeline',
    'Normalizes inbound feeds (Syslog, Kafka, S3, REST, AWS/Azure/GCP) into the canonical event envelope.',
    'deterministic', 'streaming', false, ARRAY[1],
    ARRAY['src/lib/connectorsCatalog.ts','src/components/connectors/ConnectorCatalog.tsx','supabase/functions/etl-ingest/index.ts']),

  ('parser-pool', 'Parser Pool', ARRAY['OCSF Mapper','Log Parser'], 'pipeline',
    'Parses raw payloads (Splunk, Kibana, Grafana, Redash, Superset, Metabase) and maps fields to OCSF.',
    'deterministic', 'streaming', false, ARRAY[2],
    ARRAY['src/lib/parsers/index.ts','src/lib/logParsers.ts','supabase/functions/etl-processor/index.ts']),

  ('sage-enrichment', 'Sage', ARRAY['Enrichment Agent','IOC Match Agent','Identity Hydration Agent','Enrichment Engine'], 'pipeline',
    'Enriches events with threat intel, identity context, asset metadata and IOC matches in fast and deep tiers.',
    'hybrid', 'real_time', false, ARRAY[3,6],
    ARRAY['supabase/functions/enrichment-engine/index.ts','src/lib/notebooks/threatIntelNotebooks.ts']),

  ('ai-correlation', 'AI Correlation Agent', ARRAY['Correlation Engine','Rule Synthesis Agent'], 'correlation',
    'Evaluates Lucene/SQL/CEP correlation rules and synthesizes new rules from analyst feedback.',
    'hybrid', 'real_time', true, ARRAY[4,9],
    ARRAY['src/lib/aiCorrelationAgent.ts','supabase/functions/correlation-engine/index.ts','supabase/functions/generate-correlation-rule/index.ts']),

  ('realtime-graph-cep', 'Real-time Graph CEP Agent', ARRAY['Streaming Graph Agent','CEP Graph Agent'], 'correlation',
    'Materializes streaming event graphs and detects multi-step temporal patterns across nodes/edges.',
    'deterministic', 'streaming', false, ARRAY[4],
    ARRAY['src/components/command-center/RealtimeCEPGraph.tsx','src/lib/notebooks/graphCorrelationRuntime.ts']),

  ('negative-correlation', 'Negative Correlation Agent', ARRAY['Absence Detector'], 'correlation',
    'Detects threats by the absence of expected signals (missing heartbeats, suppressed logs, dormant accounts).',
    'deterministic', 'streaming', false, ARRAY[4],
    ARRAY['src/components/negative-correlation/NegativeCorrelationPanel.tsx']),

  ('atlas-triage', 'Atlas', ARRAY['Triage Agent','Repeat Offender Tracker'], 'soc_primary',
    'Scores severity, deduplicates alerts and tracks repeat offenders to feed the response pipeline.',
    'ml', 'real_time', true, ARRAY[5],
    ARRAY['src/components/AgentBricksSOC.tsx','src/lib/agentCommunication.ts']),

  ('vector-memory', 'Vector Memory Agent', ARRAY['Embedding Memory','Similarity Recall'], 'pipeline',
    'Stores and retrieves event/IOC embeddings for similarity search and historical context recall.',
    'ml', 'on_demand', false, ARRAY[6,10],
    ARRAY['src/lib/vectorEngine.ts','src/lib/notebooks/graphCorrelationVectorMemory.ts']),

  ('cti-attribution', 'CTI Attribution Agent', ARRAY['Threat Actor Attribution'], 'threat_intel',
    'Maps observed TTPs to known threat actor groups and campaigns using STIX/TAXII intel.',
    'llm', 'on_demand', false, ARRAY[6],
    ARRAY['src/components/StixTaxiiManager.tsx','src/components/ThreatFeedsPanel.tsx']),

  ('nova-investigation', 'Nova', ARRAY['Investigation Agent','MITRE ATT&CK Mapper','Evidence Collector'], 'soc_primary',
    'Builds investigation narratives, maps to MITRE ATT&CK and assembles evidence chains for cases.',
    'llm', 'on_demand', true, ARRAY[7],
    ARRAY['src/components/EntityInvestigation.tsx','src/components/MitreAttackMatrix.tsx']),

  ('vanguard-response', 'Vanguard', ARRAY['Response Agent','SOAR Executor','Approval Gate'], 'response',
    'Executes containment playbooks (block IP, isolate host, revoke token) with human-in-loop approval gates.',
    'hybrid', 'real_time', true, ARRAY[8],
    ARRAY['src/components/ResponseAutomation.tsx','src/components/ResponseApprovalsPanel.tsx','src/lib/responseApprovals.ts']),

  ('pattern-discovery', 'Pattern Discovery Agent', ARRAY['Micro Pattern Miner'], 'discovery',
    'Mines streaming data for emergent attack patterns and proposes new correlation rules.',
    'ml', 'batch', false, ARRAY[9],
    ARRAY['src/components/PatternDiscoveryPanel.tsx','src/components/MicroPatternsPanel.tsx']),

  ('vector-augmented-scoring', 'Vector Augmented Scoring Agent', ARRAY['False-Positive Suppressor','VAS'], 'learning',
    'Re-scores alerts using embedding similarity against past dispositions to suppress false positives.',
    'ml', 'real_time', true, ARRAY[10],
    ARRAY['src/lib/notebooks/graphCorrelationVectorDetection.ts']),

  ('alhf-learning', 'ALHF Learning Agent', ARRAY['Drift Monitor','Disposition Capture','Analyst Feedback Loop'], 'learning',
    'Captures analyst dispositions, monitors model drift and feeds reinforcement signals back to upstream agents.',
    'ml', 'scheduled', false, ARRAY[11],
    ARRAY['src/lib/agentOrchestrator.ts']),

  ('red-team', 'Red Team Agent', ARRAY['Adversary Emulator','Pentest Agent'], 'adversarial',
    'Continuously emulates adversary TTPs against the environment to validate detections.',
    'hybrid', 'on_demand', true, ARRAY[]::int[],
    ARRAY['src/components/RedTeamAutomation.tsx']),

  ('blue-team', 'Blue Team Agent', ARRAY['Defender Validator'], 'adversarial',
    'Validates blue-team coverage by replaying red-team events and grading detection/response quality.',
    'hybrid', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/RedTeamAutomation.tsx']),

  ('forensics', 'Forensics Agent', ARRAY['Chain of Custody Agent'], 'adversarial',
    'Preserves evidence with cryptographic chain-of-custody and reconstructs timelines for legal review.',
    'deterministic', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/CasesPanel.tsx']),

  ('ciso-assistant', 'CISO Assistant', ARRAY['Executive Copilot'], 'assistant',
    'Conversational executive assistant that summarizes risk posture and answers strategic questions.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/CISOAssistant.tsx','supabase/functions/ai-assistant/index.ts']),

  ('playbook-generator', 'Playbook Generator', ARRAY['AI Playbook Author'], 'assistant',
    'Generates SOAR playbooks from natural-language incident descriptions.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/AIPlaybookGenerator.tsx','src/lib/playbookLibrary.ts']),

  ('incident-summarizer', 'Incident Summarizer', ARRAY['AI Case Narrator'], 'assistant',
    'Summarizes incidents and cases into analyst-ready narratives with key findings and next steps.',
    'llm', 'on_demand', false, ARRAY[7],
    ARRAY['src/components/AIIncidentSummarizer.tsx']),

  ('document-analyzer', 'Document Analysis Agent', ARRAY['Document Intelligence'], 'assistant',
    'Parses uploaded documents (PDF/DOCX) for IOCs, threat context and asset enrichment.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/DocumentAnalysis.tsx','supabase/functions/analyze-document/index.ts']),

  ('threat-radar', 'Threat Radar Agent', ARRAY['Threat Radar Fetch','Threat Radar Analyze','Threat Radar Probe'], 'threat_intel',
    'Fetches bleeding-edge threat intel from external sources, analyzes relevance and probes exposure.',
    'hybrid', 'scheduled', false, ARRAY[]::int[],
    ARRAY['supabase/functions/threat-radar-fetch/index.ts','supabase/functions/threat-radar-analyze/index.ts','supabase/functions/threat-radar-probe/index.ts']),

  ('malware-sandbox', 'Malware Sandbox Agent', ARRAY['Detonation Agent'], 'malware',
    'Detonates suspicious artifacts in an isolated sandbox and extracts behavioral IOCs.',
    'hybrid', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/AIMalwareSandbox.tsx','src/lib/malwareSandboxMockData.ts']),

  ('honeypot', 'Honeypot/Honeytoken Agent', ARRAY['Deception Agent'], 'adversarial',
    'Operates honeypots and honeytokens, capturing attacker interactions and seeding deception artifacts.',
    'deterministic', 'real_time', false, ARRAY[]::int[],
    ARRAY['src/components/HoneypotControl.tsx','src/components/honeypot/HoneypotMap.tsx']),

  ('llm-guardrails', 'LLM Guardrails Agent', ARRAY['PII Redactor','Prompt Scanner','Token Budget Controller','Model Access Governor'], 'infra',
    'Enforces PII redaction, prompt safety, token budgets and model access policies across all LLM agents.',
    'deterministic', 'real_time', true, ARRAY[]::int[],
    ARRAY['src/components/LLMGuardrailsControl.tsx','src/components/guardrails/PIIRedactionEngine.tsx','src/components/guardrails/PromptScanner.tsx']),

  ('model-poisoning-guard', 'Model Poisoning Guard', ARRAY['ML Integrity Agent'], 'infra',
    'Detects training-data poisoning, drift and adversarial perturbations against deployed ML models.',
    'ml', 'scheduled', false, ARRAY[]::int[],
    ARRAY['src/components/ModelPoisoningGuard.tsx']),

  ('threat-simulator', 'Threat Simulator', ARRAY['Scenario Replay Agent'], 'adversarial',
    'Runs deterministic attack scenarios end-to-end to validate full pipeline behavior.',
    'deterministic', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/ThreatSimulator.tsx','supabase/functions/simulate-threat/index.ts']),

  ('feature-runtime', 'Feature Lab Runtime', ARRAY['Live Feature Executor'], 'build_time',
    'Hot-loads experimental features published from Feature Lab into the running SOC.',
    'hybrid', 'on_demand', false, ARRAY[]::int[],
    ARRAY['supabase/functions/feature-runtime/index.ts','src/components/FeatureLab.tsx']),

  ('bmad-mary', 'Mary (BMAD Analyst)', ARRAY['BMAD Analyst'], 'build_time',
    'Build-time analyst persona that scopes problems and writes the brief for new SOC features.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/feature-lab/BMADAgentPanel.tsx']),

  ('bmad-john', 'John (BMAD PM)', ARRAY['BMAD Product Manager'], 'build_time',
    'Build-time product manager that turns the brief into a prioritized PRD with acceptance criteria.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/feature-lab/BMADAgentPanel.tsx']),

  ('bmad-winston', 'Winston (BMAD Architect)', ARRAY['BMAD Architect'], 'build_time',
    'Build-time architect that designs the technical approach and module boundaries for new features.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/feature-lab/BMADAgentPanel.tsx']),

  ('bmad-sally', 'Sally (BMAD UX)', ARRAY['BMAD UX Designer'], 'build_time',
    'Build-time UX designer that produces flows, layouts and interaction specs for new features.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/feature-lab/BMADAgentPanel.tsx']),

  ('bmad-amelia', 'Amelia (BMAD Dev)', ARRAY['BMAD Developer'], 'build_time',
    'Build-time developer that implements the feature against the architect''s plan.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/feature-lab/BMADAgentPanel.tsx']),

  ('bmad-paige', 'Paige (BMAD QA)', ARRAY['BMAD QA Engineer'], 'build_time',
    'Build-time QA persona that writes acceptance tests and validates the feature before publish.',
    'llm', 'on_demand', false, ARRAY[]::int[],
    ARRAY['src/components/feature-lab/BMADAgentPanel.tsx'])
ON CONFLICT (slug) DO NOTHING;
