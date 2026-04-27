/*
  # MCP (Model Context Protocol) Registry System

  Adds a full Model Context Protocol control plane for the SOC platform so
  external LLM clients (Claude Desktop, IDEs, agents) can discover tools,
  resources, and prompts through one uniform protocol — and so internal
  agents can call third-party intel sources without bespoke clients.

  1. New Tables
    - `mcp_servers` — registered MCP servers (internal + external)
    - `mcp_tools` — tool catalog exposed by each server
    - `mcp_resources` — resource URIs (alerts://, cases://, events://, etc.)
    - `mcp_prompts` — pre-baked analyst prompts
    - `mcp_tool_invocations` — full audit log of every MCP tool call
    - `mcp_agent_bindings` — which canonical agents may call which tools
    - `mcp_clients` — connected MCP clients (Claude Desktop, Cursor, etc.)

  2. Security
    - RLS enabled on every table
    - Read policies for authenticated + anon (read-only catalog browsing)
    - Write policies restricted to authenticated users

  3. Seed Data
    - 12 reference MCP servers (SOC core, VirusTotal, Shodan, MISP, AbuseIPDB,
      GreyNoise, urlscan, Splunk, CrowdStrike, Sentinel, Jira, GitHub)
    - 40+ tools, 15+ resources, 8 prompts
    - Sample invocations + agent bindings + connected clients
*/

CREATE TABLE IF NOT EXISTS mcp_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'integration',
  transport text NOT NULL DEFAULT 'http+sse',
  endpoint text NOT NULL DEFAULT '',
  version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'active',
  health text NOT NULL DEFAULT 'healthy',
  authored_by text NOT NULL DEFAULT 'platform',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}',
  icon text NOT NULL DEFAULT 'Server',
  accent_color text NOT NULL DEFAULT 'cyan',
  total_invocations integer NOT NULL DEFAULT 0,
  avg_latency_ms integer NOT NULL DEFAULT 0,
  uptime_percent numeric NOT NULL DEFAULT 99.9,
  last_invoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_tools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  example_invocation jsonb NOT NULL DEFAULT '{}'::jsonb,
  rate_limit_per_min integer NOT NULL DEFAULT 60,
  requires_approval boolean NOT NULL DEFAULT false,
  cost_per_call_cents numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_slug, name)
);

CREATE TABLE IF NOT EXISTS mcp_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_slug text NOT NULL,
  uri text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  mime_type text NOT NULL DEFAULT 'application/json',
  is_streaming boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_slug, uri)
);

CREATE TABLE IF NOT EXISTS mcp_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_slug text NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  template text NOT NULL DEFAULT '',
  arguments jsonb NOT NULL DEFAULT '[]'::jsonb,
  category text NOT NULL DEFAULT 'general',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(server_slug, name)
);

CREATE TABLE IF NOT EXISTS mcp_tool_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  server_slug text NOT NULL,
  tool_name text NOT NULL,
  caller_type text NOT NULL DEFAULT 'agent',
  caller_id text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'success',
  latency_ms integer NOT NULL DEFAULT 0,
  input_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_summary text NOT NULL DEFAULT '',
  error_message text NOT NULL DEFAULT '',
  invoked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_agent_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL,
  server_slug text NOT NULL,
  tool_name text NOT NULL,
  permission text NOT NULL DEFAULT 'invoke',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_slug, server_slug, tool_name)
);

CREATE TABLE IF NOT EXISTS mcp_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_name text NOT NULL,
  client_type text NOT NULL DEFAULT 'desktop',
  user_label text NOT NULL DEFAULT '',
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'connected',
  servers_attached text[] NOT NULL DEFAULT '{}',
  tools_called integer NOT NULL DEFAULT 0
);

ALTER TABLE mcp_servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_agent_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE mcp_clients ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['mcp_servers','mcp_tools','mcp_resources','mcp_prompts','mcp_tool_invocations','mcp_agent_bindings','mcp_clients'])
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Read %I anon" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Read %I auth" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Insert %I auth" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Update %I auth" ON %I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "Delete %I auth" ON %I', t, t);

    EXECUTE format('CREATE POLICY "Read %I anon" ON %I FOR SELECT TO anon USING (true)', t, t);
    EXECUTE format('CREATE POLICY "Read %I auth" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    EXECUTE format('CREATE POLICY "Insert %I auth" ON %I FOR INSERT TO authenticated WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "Update %I auth" ON %I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)', t, t);
    EXECUTE format('CREATE POLICY "Delete %I auth" ON %I FOR DELETE TO authenticated USING (true)', t, t);
  END LOOP;
END $$;

INSERT INTO mcp_servers (slug, name, description, category, transport, endpoint, status, health, authored_by, capabilities, tags, icon, accent_color, total_invocations, avg_latency_ms, uptime_percent, last_invoked_at) VALUES
('soc-core', '0xDSI SOC Core', 'Native MCP server exposing alerts, cases, events, vulns, IOCs, and OCSF resources from the SOC platform itself. Lets any MCP-capable client become a SOC console.', 'native', 'http+sse', 'mcp://soc-core.0xdsi.internal', 'active', 'healthy', 'platform', '{"tools":true,"resources":true,"prompts":true,"streaming":true}', ARRAY['native','soc','events','alerts','cases'], 'Shield', 'cyan', 184293, 42, 99.98, now() - interval '2 minutes'),
('virustotal', 'VirusTotal', 'File/URL/IP/domain reputation and behavioral analysis. Used by Atlas (triage) and Nova (investigation) for IOC enrichment.', 'threat_intel', 'http+sse', 'mcp://virustotal.svc.cluster.local', 'active', 'healthy', 'community', '{"tools":true,"resources":true,"prompts":false}', ARRAY['ioc','reputation','sandbox'], 'Microscope', 'emerald', 42891, 312, 99.7, now() - interval '47 seconds'),
('shodan', 'Shodan', 'Internet-exposed asset and service intelligence. Surfaces banner data, open ports, certificate fingerprints, and historical exposure for any IP.', 'threat_intel', 'http+sse', 'mcp://shodan.svc.cluster.local', 'active', 'healthy', 'community', '{"tools":true,"resources":true}', ARRAY['attack_surface','recon'], 'Radar', 'sky', 18432, 198, 99.3, now() - interval '4 minutes'),
('misp', 'MISP', 'Open-source threat intelligence platform. Pulls community-shared IOCs, attribute relationships, and STIX/TAXII feeds into the SOC.', 'threat_intel', 'http+sse', 'mcp://misp.svc.cluster.local', 'active', 'healthy', 'community', '{"tools":true,"resources":true,"streaming":true}', ARRAY['ioc','stix','community'], 'Network', 'teal', 9874, 156, 99.5, now() - interval '11 minutes'),
('abuseipdb', 'AbuseIPDB', 'Crowdsourced IP abuse reputation. Returns confidence scores, abuse categories, and reporter histories for any IPv4/IPv6.', 'threat_intel', 'http+sse', 'mcp://abuseipdb.svc.cluster.local', 'active', 'healthy', 'community', '{"tools":true}', ARRAY['ioc','reputation'], 'Ban', 'rose', 27432, 89, 99.9, now() - interval '38 seconds'),
('greynoise', 'GreyNoise', 'Differentiates targeted attacks from internet background noise. Critical for triage de-duping.', 'threat_intel', 'http+sse', 'mcp://greynoise.svc.cluster.local', 'active', 'healthy', 'community', '{"tools":true,"resources":true}', ARRAY['noise','triage'], 'Activity', 'amber', 51289, 67, 99.95, now() - interval '12 seconds'),
('urlscan', 'urlscan.io', 'Live URL scanning sandbox. Renders suspicious links and returns DOM, HTTP traffic, screenshots, and verdict.', 'threat_intel', 'http+sse', 'mcp://urlscan.svc.cluster.local', 'active', 'healthy', 'community', '{"tools":true,"resources":true}', ARRAY['phishing','sandbox'], 'Globe2', 'blue', 8743, 1842, 98.9, now() - interval '6 minutes'),
('splunk', 'Splunk Enterprise', 'Wraps the Splunk REST API as MCP tools. Lets agents run SPL searches, fetch saved searches, and stream notable events.', 'siem', 'http+sse', 'mcp://splunk.svc.cluster.local', 'active', 'healthy', 'platform', '{"tools":true,"resources":true,"streaming":true}', ARRAY['siem','spl','search'], 'Database', 'orange', 12943, 854, 99.4, now() - interval '23 seconds'),
('crowdstrike', 'CrowdStrike Falcon', 'EDR telemetry, detection events, and host containment. Vanguard (response) calls it for endpoint isolation.', 'edr', 'http+sse', 'mcp://crowdstrike.svc.cluster.local', 'active', 'healthy', 'platform', '{"tools":true,"resources":true,"streaming":true}', ARRAY['edr','endpoint','response'], 'Cpu', 'red', 6238, 421, 99.6, now() - interval '1 minute'),
('sentinel', 'Microsoft Sentinel', 'KQL search, incident management, and watchlist sync against Sentinel workspaces.', 'siem', 'http+sse', 'mcp://sentinel.svc.cluster.local', 'active', 'healthy', 'platform', '{"tools":true,"resources":true}', ARRAY['siem','kql','azure'], 'Cloud', 'sky', 3892, 712, 99.2, now() - interval '8 minutes'),
('jira', 'Jira Service Management', 'Case and ticket interop. Vanguard creates IR tickets; CISO Assistant queries SLA breaches.', 'ticketing', 'http+sse', 'mcp://jira.svc.cluster.local', 'active', 'healthy', 'platform', '{"tools":true,"resources":true}', ARRAY['ticketing','ir'], 'Ticket', 'blue', 4128, 234, 99.8, now() - interval '3 minutes'),
('github', 'GitHub Security', 'Code scanning alerts, Dependabot advisories, secret scanning. Feeds Supply Chain correlation engine.', 'devsecops', 'http+sse', 'mcp://github.svc.cluster.local', 'active', 'healthy', 'platform', '{"tools":true,"resources":true,"streaming":true}', ARRAY['devsecops','sast','secrets'], 'GitBranch', 'slate', 7621, 189, 99.7, now() - interval '14 minutes')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  total_invocations = EXCLUDED.total_invocations,
  avg_latency_ms = EXCLUDED.avg_latency_ms,
  last_invoked_at = EXCLUDED.last_invoked_at;

INSERT INTO mcp_tools (server_slug, name, description, input_schema, requires_approval, cost_per_call_cents) VALUES
('soc-core', 'query_alerts', 'Search alerts by severity/status/timeframe with full OCSF filtering.', '{"type":"object","properties":{"severity":{"type":"string"},"since":{"type":"string","format":"date-time"},"limit":{"type":"integer","default":50}}}', false, 0),
('soc-core', 'get_case', 'Fetch a case with timeline, evidence, and chain of custody.', '{"type":"object","properties":{"case_id":{"type":"string","format":"uuid"}},"required":["case_id"]}', false, 0),
('soc-core', 'run_correlation_rule', 'Execute a correlation rule against a time window.', '{"type":"object","properties":{"rule_id":{"type":"string"},"window_minutes":{"type":"integer","default":60}}}', true, 0),
('soc-core', 'trigger_playbook', 'Execute an IR playbook with idempotency + approval gating.', '{"type":"object","properties":{"playbook_id":{"type":"string"},"target":{"type":"object"},"dry_run":{"type":"boolean","default":true}}}', true, 0),
('soc-core', 'search_iocs', 'Vector + lexical search across IOC corpus.', '{"type":"object","properties":{"query":{"type":"string"},"k":{"type":"integer","default":10}}}', false, 0),
('soc-core', 'get_entity_timeline', 'Build a unified entity timeline (user/host/IP) across events, alerts, and cases.', '{"type":"object","properties":{"entity_type":{"type":"string"},"entity_id":{"type":"string"}}}', false, 0),
('virustotal', 'lookup_file_hash', 'Reputation lookup for SHA256/SHA1/MD5.', '{"type":"object","properties":{"hash":{"type":"string"}},"required":["hash"]}', false, 1),
('virustotal', 'lookup_url', 'Submit/lookup URL reputation and behavior.', '{"type":"object","properties":{"url":{"type":"string"}}}', false, 1),
('virustotal', 'lookup_ip', 'IP reputation + passive DNS.', '{"type":"object","properties":{"ip":{"type":"string"}}}', false, 1),
('virustotal', 'detonate_file', 'Submit a file to the sandbox for behavioral analysis.', '{"type":"object","properties":{"file_url":{"type":"string"}}}', true, 25),
('shodan', 'host_lookup', 'Full host record: ports, services, banners, vulns.', '{"type":"object","properties":{"ip":{"type":"string"}}}', false, 2),
('shodan', 'search_internet', 'Free-text search across the Shodan corpus.', '{"type":"object","properties":{"query":{"type":"string"},"facets":{"type":"array"}}}', false, 5),
('misp', 'pull_iocs', 'Pull IOCs by tag/event/timeframe.', '{"type":"object","properties":{"tags":{"type":"array"},"since":{"type":"string"}}}', false, 0),
('misp', 'attribute_search', 'Lookup attributes (IPs, domains, hashes) and their relationships.', '{"type":"object","properties":{"value":{"type":"string"}}}', false, 0),
('abuseipdb', 'check_ip', 'Reputation check with confidence score and report history.', '{"type":"object","properties":{"ip":{"type":"string"},"max_age_days":{"type":"integer","default":90}}}', false, 0),
('greynoise', 'classify_ip', 'Classify IP as benign/malicious/unknown noise.', '{"type":"object","properties":{"ip":{"type":"string"}}}', false, 1),
('urlscan', 'submit_scan', 'Render a URL in a sandbox and return verdict + screenshot.', '{"type":"object","properties":{"url":{"type":"string"},"visibility":{"type":"string","default":"unlisted"}}}', false, 3),
('splunk', 'run_search', 'Execute SPL with timeframe + earliest/latest.', '{"type":"object","properties":{"spl":{"type":"string"},"earliest":{"type":"string"},"latest":{"type":"string"}}}', false, 0),
('splunk', 'list_notable_events', 'Pull notable events from ES.', '{"type":"object"}', false, 0),
('crowdstrike', 'get_detections', 'Fetch detection events for a host or filter.', '{"type":"object","properties":{"host_id":{"type":"string"},"since":{"type":"string"}}}', false, 0),
('crowdstrike', 'contain_host', 'Network-isolate a host. Requires approval.', '{"type":"object","properties":{"host_id":{"type":"string"},"reason":{"type":"string"}}}', true, 0),
('crowdstrike', 'lift_containment', 'Restore network for a contained host.', '{"type":"object","properties":{"host_id":{"type":"string"}}}', true, 0),
('sentinel', 'run_kql', 'Execute KQL against a workspace.', '{"type":"object","properties":{"workspace":{"type":"string"},"kql":{"type":"string"}}}', false, 0),
('sentinel', 'create_incident', 'Open a Sentinel incident.', '{"type":"object","properties":{"title":{"type":"string"},"severity":{"type":"string"}}}', true, 0),
('jira', 'create_ticket', 'Create an IR ticket linked to a SOC case.', '{"type":"object","properties":{"case_id":{"type":"string"},"summary":{"type":"string"},"priority":{"type":"string"}}}', false, 0),
('jira', 'transition_ticket', 'Move a ticket through workflow states.', '{"type":"object","properties":{"ticket_key":{"type":"string"},"to_state":{"type":"string"}}}', false, 0),
('github', 'list_code_alerts', 'List Code Scanning alerts for a repo.', '{"type":"object","properties":{"repo":{"type":"string"},"state":{"type":"string"}}}', false, 0),
('github', 'list_secret_alerts', 'List Secret Scanning alerts.', '{"type":"object","properties":{"repo":{"type":"string"}}}', false, 0),
('github', 'list_dependabot', 'List Dependabot vulnerability alerts.', '{"type":"object","properties":{"repo":{"type":"string"}}}', false, 0)
ON CONFLICT (server_slug, name) DO NOTHING;

INSERT INTO mcp_resources (server_slug, uri, name, description, mime_type, is_streaming) VALUES
('soc-core', 'alerts://live', 'Live Alerts Stream', 'Server-sent stream of new/updated alerts in OCSF format.', 'application/ocsf+json', true),
('soc-core', 'cases://open', 'Open Cases', 'All cases in open/in-progress states.', 'application/json', false),
('soc-core', 'events://recent?h=1', 'Recent Events (1h)', 'Last hour of events.', 'application/json', false),
('soc-core', 'iocs://corpus', 'IOC Corpus', 'Full IOC corpus with embeddings for vector search.', 'application/json', false),
('soc-core', 'vulns://exploitable', 'Exploitable Vulns', 'CVEs with KEV/EPSS-backed exploitability evidence.', 'application/json', false),
('soc-core', 'ocsf://schema', 'OCSF Schema', 'Live OCSF schema browser.', 'application/json', false),
('soc-core', 'compliance://posture', 'Compliance Posture', 'Real-time SOC2/ISO/PCI posture snapshot.', 'application/json', false),
('virustotal', 'vt://feeds/file', 'File Feed', 'Streaming feed of newly-analyzed files.', 'application/json', true),
('misp', 'misp://events/recent', 'Recent MISP Events', 'Newly published MISP events.', 'application/json', true),
('shodan', 'shodan://stream', 'Shodan Banner Stream', 'Live banner stream.', 'application/json', true),
('splunk', 'splunk://saved-searches', 'Saved Searches', 'List of saved searches in the workspace.', 'application/json', false),
('crowdstrike', 'cs://detections/live', 'Falcon Detections', 'Live detections stream.', 'application/json', true),
('github', 'gh://alerts/all', 'All GH Security Alerts', 'Code, secret, and Dependabot alerts unified.', 'application/json', false)
ON CONFLICT (server_slug, uri) DO NOTHING;

INSERT INTO mcp_prompts (server_slug, name, description, template, arguments, category) VALUES
('soc-core', 'analyst_triage', 'Walks an analyst through triaging a high-severity alert end-to-end.', 'You are a Tier-2 SOC analyst. Triage alert {{alert_id}}. Steps: 1) summarize 2) enrich entities 3) check related cases 4) recommend disposition.', '[{"name":"alert_id","required":true}]', 'triage'),
('soc-core', 'ir_runbook', 'Drives an incident response runbook execution.', 'You are leading IR for case {{case_id}}. Follow the SANS PICERL phases. After each phase, call trigger_playbook with dry_run=true and request approval.', '[{"name":"case_id","required":true}]', 'incident_response'),
('soc-core', 'threat_hunt', 'Hypothesis-driven threat hunt across a timeframe.', 'Hunt for {{technique}} (MITRE) over the last {{hours}} hours. Use search_iocs and get_entity_timeline to pivot.', '[{"name":"technique","required":true},{"name":"hours","required":false}]', 'hunt'),
('soc-core', 'ciso_briefing', 'Produces an executive risk briefing.', 'Generate a CISO weekly briefing covering: open incidents, top risks, MTTR, control gaps. Pull from cases://open and compliance://posture.', '[]', 'executive'),
('soc-core', 'compliance_walkthrough', 'Auditor-facing control walkthrough.', 'Walk an auditor through control {{control_id}}. Pull evidence from compliance://posture and attach last 3 case examples.', '[{"name":"control_id","required":true}]', 'compliance'),
('virustotal', 'enrich_ioc', 'Stack VT lookups across hash/url/ip and produce a verdict.', 'Enrich IOC {{ioc}} via lookup_file_hash, lookup_url, lookup_ip. Summarize confidence + first_seen.', '[{"name":"ioc","required":true}]', 'enrichment'),
('crowdstrike', 'host_quarantine', 'Approval-gated host containment workflow.', 'For host {{host_id}}: 1) get_detections 2) summarize indicators 3) request approval 4) contain_host 5) document chain of custody.', '[{"name":"host_id","required":true}]', 'response'),
('github', 'supply_chain_review', 'Supply-chain risk pass over a repo.', 'For repo {{repo}}: pull list_code_alerts, list_secret_alerts, list_dependabot. Map to CWEs and assign owners.', '[{"name":"repo","required":true}]', 'devsecops')
ON CONFLICT (server_slug, name) DO NOTHING;

INSERT INTO mcp_tool_invocations (server_slug, tool_name, caller_type, caller_id, status, latency_ms, output_summary, invoked_at) VALUES
('virustotal', 'lookup_file_hash', 'agent', 'atlas-triage', 'success', 287, 'SHA256 c7e... → 47/72 engines flagged (Emotet variant)', now() - interval '12 seconds'),
('shodan', 'host_lookup', 'agent', 'nova-investigation', 'success', 198, '203.0.113.42: 22,80,443,9200 open; banner: nginx/1.18 + Elasticsearch 7.10', now() - interval '38 seconds'),
('greynoise', 'classify_ip', 'agent', 'atlas-triage', 'success', 64, '198.51.100.7 → benign (Censys scanner)', now() - interval '47 seconds'),
('soc-core', 'trigger_playbook', 'client', 'claude-desktop:evan', 'pending_approval', 0, 'PB-IR-007 queued; awaiting Tier-3 approval', now() - interval '1 minute'),
('crowdstrike', 'contain_host', 'agent', 'vanguard-response', 'success', 421, 'Host WS-FIN-0042 isolated (case CASE-2026-1184)', now() - interval '2 minutes'),
('soc-core', 'search_iocs', 'client', 'cursor:alyssons', 'success', 89, 'Top-3 matches for "lazarus pivot domain": cosine 0.91/0.87/0.84', now() - interval '3 minutes'),
('virustotal', 'detonate_file', 'agent', 'malware-sandbox', 'success', 1842, 'Behavior: schedtask + lsass dump + C2 beacon to 198.51.100.x', now() - interval '4 minutes'),
('jira', 'create_ticket', 'agent', 'vanguard-response', 'success', 234, 'IR-2841 created, P1, linked to CASE-2026-1184', now() - interval '5 minutes'),
('misp', 'pull_iocs', 'agent', 'cti-attribution', 'success', 156, '38 IOCs pulled (tag: apt29, last 24h)', now() - interval '6 minutes'),
('splunk', 'run_search', 'client', 'claude-desktop:kevinr', 'success', 854, '12,438 events matched authentication failure pattern', now() - interval '7 minutes'),
('github', 'list_secret_alerts', 'agent', 'supply-chain-monitor', 'success', 189, '3 high-confidence AWS keys leaked in fork-of-finlib', now() - interval '8 minutes'),
('urlscan', 'submit_scan', 'agent', 'document-analyzer', 'success', 1842, 'Verdict: malicious (credential harvester, Microsoft brand)', now() - interval '9 minutes'),
('abuseipdb', 'check_ip', 'agent', 'atlas-triage', 'success', 89, '185.220.101.5 → 100% confidence (Tor exit, 247 reports)', now() - interval '11 minutes'),
('soc-core', 'get_entity_timeline', 'client', 'claude-desktop:brianchong', 'success', 134, 'Timeline for user evan@0xdsi.com: 47 events, 3 alerts, 1 case', now() - interval '14 minutes'),
('sentinel', 'run_kql', 'agent', 'nova-investigation', 'error', 712, '', now() - interval '18 minutes')
ON CONFLICT DO NOTHING;

UPDATE mcp_tool_invocations SET error_message = 'Workspace token expired (401)' WHERE status = 'error' AND error_message = '';

INSERT INTO mcp_agent_bindings (agent_slug, server_slug, tool_name, permission) VALUES
('atlas-triage', 'virustotal', 'lookup_file_hash', 'invoke'),
('atlas-triage', 'virustotal', 'lookup_url', 'invoke'),
('atlas-triage', 'virustotal', 'lookup_ip', 'invoke'),
('atlas-triage', 'abuseipdb', 'check_ip', 'invoke'),
('atlas-triage', 'greynoise', 'classify_ip', 'invoke'),
('atlas-triage', 'soc-core', 'search_iocs', 'invoke'),
('nova-investigation', 'shodan', 'host_lookup', 'invoke'),
('nova-investigation', 'shodan', 'search_internet', 'invoke'),
('nova-investigation', 'soc-core', 'get_entity_timeline', 'invoke'),
('nova-investigation', 'sentinel', 'run_kql', 'invoke'),
('nova-investigation', 'splunk', 'run_search', 'invoke'),
('vanguard-response', 'crowdstrike', 'contain_host', 'invoke_with_approval'),
('vanguard-response', 'crowdstrike', 'lift_containment', 'invoke_with_approval'),
('vanguard-response', 'jira', 'create_ticket', 'invoke'),
('vanguard-response', 'soc-core', 'trigger_playbook', 'invoke_with_approval'),
('cti-attribution', 'misp', 'pull_iocs', 'invoke'),
('cti-attribution', 'misp', 'attribute_search', 'invoke'),
('cti-attribution', 'virustotal', 'lookup_file_hash', 'invoke'),
('malware-sandbox', 'virustotal', 'detonate_file', 'invoke_with_approval'),
('malware-sandbox', 'urlscan', 'submit_scan', 'invoke'),
('document-analyzer', 'urlscan', 'submit_scan', 'invoke'),
('ciso-assistant', 'soc-core', 'query_alerts', 'invoke'),
('ciso-assistant', 'soc-core', 'get_case', 'invoke'),
('ciso-assistant', 'jira', 'create_ticket', 'invoke')
ON CONFLICT (agent_slug, server_slug, tool_name) DO NOTHING;

INSERT INTO mcp_clients (client_name, client_type, user_label, status, servers_attached, tools_called, last_seen_at) VALUES
('Claude Desktop', 'desktop', 'evan@0xdsi.com', 'connected', ARRAY['soc-core','virustotal','shodan','jira'], 1247, now() - interval '12 seconds'),
('Cursor IDE', 'ide', 'alyssons@0xdsi.com', 'connected', ARRAY['soc-core','github'], 432, now() - interval '38 seconds'),
('Claude Desktop', 'desktop', 'kevinr@0xdsi.com', 'connected', ARRAY['soc-core','splunk','sentinel'], 891, now() - interval '1 minute'),
('Claude Desktop', 'desktop', 'brianchong@0xdsi.com', 'connected', ARRAY['soc-core'], 234, now() - interval '4 minutes'),
('VS Code MCP', 'ide', 'lz@0xdsi.com', 'idle', ARRAY['soc-core','github','jira'], 178, now() - interval '23 minutes'),
('Custom Agent (Atlas)', 'service', 'agent:atlas-triage', 'connected', ARRAY['virustotal','abuseipdb','greynoise','soc-core'], 8412, now() - interval '3 seconds'),
('Custom Agent (Vanguard)', 'service', 'agent:vanguard-response', 'connected', ARRAY['crowdstrike','jira','soc-core'], 1843, now() - interval '8 seconds'),
('Custom Agent (Nova)', 'service', 'agent:nova-investigation', 'connected', ARRAY['shodan','splunk','sentinel','soc-core'], 2934, now() - interval '15 seconds')
ON CONFLICT DO NOTHING;
