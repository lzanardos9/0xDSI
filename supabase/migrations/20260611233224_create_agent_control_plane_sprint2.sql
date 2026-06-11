
-- Sprint 2: Advanced Agent Governance, Trust Intelligence, Collaboration Network
-- Surpasses Microsoft Agent 365 with behavioral trust, permission governance, and multi-agent orchestration

-- 1. Agent Trust History - Continuous trust score tracking with anomaly detection
CREATE TABLE IF NOT EXISTS agent_trust_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  trust_score numeric(5,2) NOT NULL,
  previous_score numeric(5,2),
  delta numeric(5,2),
  evaluation_type text NOT NULL DEFAULT 'periodic', -- periodic, event_triggered, manual_override
  factors jsonb NOT NULL DEFAULT '{}', -- breakdown of trust factors
  anomaly_detected boolean DEFAULT false,
  anomaly_type text, -- behavioral_drift, performance_degradation, permission_abuse, output_deviation
  anomaly_severity text, -- low, medium, high, critical
  anomaly_details text,
  decay_rate numeric(5,4) DEFAULT 0.0,
  confidence_interval numeric(5,2) DEFAULT 95.0,
  evaluated_by text DEFAULT 'system', -- system, admin, peer_agent
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trust_history_agent_time ON agent_trust_history(agent_id, created_at DESC);
CREATE INDEX idx_trust_history_anomaly ON agent_trust_history(anomaly_detected, anomaly_severity) WHERE anomaly_detected = true;

-- 2. Agent Permission Governance - Fine-grained permission tracking with drift detection
CREATE TABLE IF NOT EXISTS agent_permission_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'global', -- global, category, agent_specific
  target_category text, -- when scope=category
  target_agent_id uuid REFERENCES agent_identities(id),
  rules jsonb NOT NULL DEFAULT '[]', -- array of permission rules
  enforcement_mode text NOT NULL DEFAULT 'enforce', -- enforce, audit, permissive
  max_autonomy_level integer DEFAULT 5,
  requires_approval_above integer DEFAULT 3,
  auto_revoke_on_anomaly boolean DEFAULT true,
  auto_revoke_threshold numeric(5,2) DEFAULT 60.0,
  created_by text DEFAULT 'system',
  approved_by text,
  approved_at timestamptz,
  is_active boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_permission_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  permission_type text NOT NULL, -- data_access, tool_use, network_call, api_invoke, model_query
  resource_path text NOT NULL,
  action text NOT NULL, -- granted, revoked, attempted, denied, escalated
  granted_by text,
  reason text,
  policy_id uuid REFERENCES agent_permission_policies(id),
  is_drift boolean DEFAULT false, -- permission used outside policy
  drift_severity text, -- minor, moderate, major, critical
  drift_details text,
  risk_score numeric(5,2) DEFAULT 0,
  session_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_perm_audit_agent_time ON agent_permission_audit(agent_id, created_at DESC);
CREATE INDEX idx_perm_audit_drift ON agent_permission_audit(is_drift, drift_severity) WHERE is_drift = true;

-- 3. Agent Collaboration Network - Inter-agent communication and workflow patterns
CREATE TABLE IF NOT EXISTS agent_collaborations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  target_agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  collaboration_type text NOT NULL, -- delegation, consultation, data_share, escalation, consensus
  workflow_id text,
  workflow_name text,
  message_count integer DEFAULT 0,
  avg_latency_ms numeric(8,2) DEFAULT 0,
  success_rate numeric(5,2) DEFAULT 100,
  data_volume_bytes bigint DEFAULT 0,
  last_interaction_at timestamptz,
  interaction_frequency text DEFAULT 'occasional', -- rare, occasional, frequent, continuous
  trust_between numeric(5,2) DEFAULT 80.0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_collab_source ON agent_collaborations(source_agent_id);
CREATE INDEX idx_collab_target ON agent_collaborations(target_agent_id);

CREATE TABLE IF NOT EXISTS agent_workflow_dags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_name text NOT NULL,
  workflow_description text,
  trigger_type text NOT NULL DEFAULT 'event', -- event, schedule, manual, alert, threshold
  trigger_config jsonb DEFAULT '{}',
  dag_definition jsonb NOT NULL DEFAULT '{}', -- nodes and edges of the workflow
  participating_agents text[] DEFAULT '{}',
  avg_completion_time_ms integer DEFAULT 0,
  success_rate numeric(5,2) DEFAULT 100,
  executions_total integer DEFAULT 0,
  executions_last_24h integer DEFAULT 0,
  is_active boolean DEFAULT true,
  last_executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Agent Threat Surface - Security posture per agent
CREATE TABLE IF NOT EXISTS agent_threat_surface (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
  attack_surface_score numeric(5,2) NOT NULL DEFAULT 50.0,
  vulnerability_count integer DEFAULT 0,
  critical_vulns integer DEFAULT 0,
  exposed_apis integer DEFAULT 0,
  data_sensitivity_level text DEFAULT 'medium', -- public, internal, confidential, restricted, top_secret
  network_exposure text DEFAULT 'internal', -- isolated, internal, dmz, public
  input_validation_score numeric(5,2) DEFAULT 80.0,
  output_sanitization_score numeric(5,2) DEFAULT 80.0,
  dependency_risk_score numeric(5,2) DEFAULT 30.0,
  isolation_level text DEFAULT 'standard', -- maximum, high, standard, minimal, none
  recommended_isolation text,
  last_pentest_at timestamptz,
  last_pentest_result text,
  threat_vectors jsonb DEFAULT '[]', -- array of threat vector assessments
  mitigations_applied jsonb DEFAULT '[]',
  compliance_gaps jsonb DEFAULT '[]',
  risk_acceptance_notes text,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  next_assessment_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_threat_surface_agent ON agent_threat_surface(agent_id);
CREATE INDEX idx_threat_surface_score ON agent_threat_surface(attack_surface_score DESC);

-- RLS
ALTER TABLE agent_trust_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_permission_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_permission_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_collaborations ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_workflow_dags ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_threat_surface ENABLE ROW LEVEL SECURITY;

-- Policies for authenticated + anon read access (admin platform)
CREATE POLICY "select_agent_trust_history" ON agent_trust_history FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "insert_agent_trust_history" ON agent_trust_history FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_agent_trust_history" ON agent_trust_history FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_agent_trust_history" ON agent_trust_history FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_agent_permission_policies" ON agent_permission_policies FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "insert_agent_permission_policies" ON agent_permission_policies FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_agent_permission_policies" ON agent_permission_policies FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_agent_permission_policies" ON agent_permission_policies FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_agent_permission_audit" ON agent_permission_audit FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "insert_agent_permission_audit" ON agent_permission_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_agent_permission_audit" ON agent_permission_audit FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_agent_permission_audit" ON agent_permission_audit FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_agent_collaborations" ON agent_collaborations FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "insert_agent_collaborations" ON agent_collaborations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_agent_collaborations" ON agent_collaborations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_agent_collaborations" ON agent_collaborations FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_agent_workflow_dags" ON agent_workflow_dags FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "insert_agent_workflow_dags" ON agent_workflow_dags FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_agent_workflow_dags" ON agent_workflow_dags FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_agent_workflow_dags" ON agent_workflow_dags FOR DELETE TO authenticated USING (true);

CREATE POLICY "select_agent_threat_surface" ON agent_threat_surface FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "insert_agent_threat_surface" ON agent_threat_surface FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_agent_threat_surface" ON agent_threat_surface FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "delete_agent_threat_surface" ON agent_threat_surface FOR DELETE TO authenticated USING (true);
