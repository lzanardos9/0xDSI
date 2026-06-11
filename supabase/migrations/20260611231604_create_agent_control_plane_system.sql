-- Agent Control Plane: Identity, Lifecycle, Economics
-- Modeled after Microsoft Agent 365 but significantly more capable

-- Agent Identity & Governance Registry
CREATE TABLE IF NOT EXISTS agent_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  agent_type text NOT NULL DEFAULT 'autonomous' CHECK (agent_type IN ('autonomous', 'assistive', 'hybrid', 'sentinel')),
  category text NOT NULL DEFAULT 'detection' CHECK (category IN ('detection', 'investigation', 'response', 'enrichment', 'correlation', 'vulnerability', 'compliance', 'ml_ops', 'orchestration', 'deception', 'red_team', 'analytics')),
  
  -- Identity & Auth
  identity_fingerprint text,
  credential_type text DEFAULT 'service_account' CHECK (credential_type IN ('service_account', 'managed_identity', 'api_key', 'oauth2', 'mtls')),
  permissions_manifest jsonb DEFAULT '[]'::jsonb,
  allowed_tools jsonb DEFAULT '[]'::jsonb,
  allowed_tables jsonb DEFAULT '[]'::jsonb,
  max_autonomy_level int DEFAULT 3 CHECK (max_autonomy_level BETWEEN 1 AND 5),
  
  -- Lifecycle State
  lifecycle_state text NOT NULL DEFAULT 'draft' CHECK (lifecycle_state IN ('draft', 'pending_review', 'approved', 'active', 'degraded', 'quarantined', 'retired')),
  lifecycle_changed_at timestamptz DEFAULT now(),
  lifecycle_changed_by text,
  
  -- Ownership & Governance
  owner_id uuid,
  team text,
  approval_required boolean DEFAULT true,
  approved_by text,
  approved_at timestamptz,
  
  -- Trust & Reputation
  trust_score numeric(4,2) DEFAULT 50.00 CHECK (trust_score BETWEEN 0 AND 100),
  reputation_history jsonb DEFAULT '[]'::jsonb,
  false_positive_rate numeric(5,3) DEFAULT 0,
  true_positive_rate numeric(5,3) DEFAULT 0,
  avg_confidence numeric(4,2) DEFAULT 0,
  analyst_satisfaction_score numeric(3,1) DEFAULT 0,
  
  -- Health & Performance
  health_status text DEFAULT 'healthy' CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'offline', 'starting')),
  uptime_percent numeric(5,2) DEFAULT 100.00,
  last_heartbeat_at timestamptz,
  avg_response_time_ms int DEFAULT 0,
  p95_response_time_ms int DEFAULT 0,
  tasks_completed_total bigint DEFAULT 0,
  tasks_failed_total bigint DEFAULT 0,
  
  -- Economics
  cost_per_execution numeric(10,4) DEFAULT 0,
  total_cost_mtd numeric(12,2) DEFAULT 0,
  alerts_processed_mtd bigint DEFAULT 0,
  time_saved_hours_mtd numeric(8,2) DEFAULT 0,
  estimated_value_mtd numeric(12,2) DEFAULT 0,
  
  -- Metadata
  version text DEFAULT '1.0.0',
  runtime text DEFAULT 'databricks' CHECK (runtime IN ('databricks', 'supabase_edge', 'kubernetes', 'lambda', 'local')),
  source_notebook text,
  dependencies jsonb DEFAULT '[]'::jsonb,
  tags text[] DEFAULT '{}',
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Agent Lifecycle Events (Audit Trail)
CREATE TABLE IF NOT EXISTS agent_lifecycle_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('created', 'submitted_for_review', 'approved', 'deployed', 'activated', 'degraded', 'quarantined', 'retired', 'trust_updated', 'permission_changed', 'config_changed', 'error', 'recovered')),
  previous_state text,
  new_state text,
  triggered_by text NOT NULL DEFAULT 'system',
  reason text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Agent Permission Grants (fine-grained access control)
CREATE TABLE IF NOT EXISTS agent_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  resource_type text NOT NULL CHECK (resource_type IN ('table', 'api', 'tool', 'function', 'secret', 'model', 'external_service')),
  resource_name text NOT NULL,
  actions text[] NOT NULL DEFAULT '{read}',
  conditions jsonb DEFAULT '{}'::jsonb,
  granted_by text NOT NULL,
  granted_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_active boolean DEFAULT true
);

-- Agent Economics Tracking (per-day aggregates)
CREATE TABLE IF NOT EXISTS agent_economics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  executions int DEFAULT 0,
  successes int DEFAULT 0,
  failures int DEFAULT 0,
  alerts_triaged int DEFAULT 0,
  incidents_resolved int DEFAULT 0,
  false_positives_caught int DEFAULT 0,
  compute_cost_usd numeric(10,4) DEFAULT 0,
  time_saved_minutes numeric(8,2) DEFAULT 0,
  analyst_hours_equivalent numeric(6,2) DEFAULT 0,
  estimated_breach_prevention_value numeric(12,2) DEFAULT 0,
  UNIQUE(agent_id, date)
);

-- SOC Commander Conversations (NL interface)
CREATE TABLE IF NOT EXISTS soc_commander_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  session_id text NOT NULL DEFAULT gen_random_uuid()::text,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  agents_invoked text[] DEFAULT '{}',
  data_sources_accessed text[] DEFAULT '{}',
  actions_taken jsonb DEFAULT '[]'::jsonb,
  response_time_ms int,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE agent_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_lifecycle_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_economics ENABLE ROW LEVEL SECURITY;
ALTER TABLE soc_commander_conversations ENABLE ROW LEVEL SECURITY;

-- RLS Policies (allow all authenticated + anon for demo)
CREATE POLICY "agent_identities_select" ON agent_identities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "agent_identities_insert" ON agent_identities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "agent_identities_update" ON agent_identities FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "agent_identities_delete" ON agent_identities FOR DELETE TO authenticated USING (true);

CREATE POLICY "agent_lifecycle_events_select" ON agent_lifecycle_events FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "agent_lifecycle_events_insert" ON agent_lifecycle_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "agent_permissions_select" ON agent_permissions FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "agent_permissions_insert" ON agent_permissions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "agent_permissions_update" ON agent_permissions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "agent_economics_select" ON agent_economics FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "agent_economics_insert" ON agent_economics FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "soc_commander_select" ON soc_commander_conversations FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "soc_commander_insert" ON soc_commander_conversations FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Indexes
CREATE INDEX idx_agent_identities_lifecycle ON agent_identities(lifecycle_state);
CREATE INDEX idx_agent_identities_category ON agent_identities(category);
CREATE INDEX idx_agent_identities_health ON agent_identities(health_status);
CREATE INDEX idx_agent_lifecycle_events_agent ON agent_lifecycle_events(agent_id);
CREATE INDEX idx_agent_economics_agent_date ON agent_economics(agent_id, date);
CREATE INDEX idx_soc_commander_session ON soc_commander_conversations(session_id);
