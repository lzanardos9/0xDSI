
-- Seed Sprint 2: Trust History, Permissions, Collaborations, Threat Surface

-- 1. Trust History - 30 days of trust evolution for top agents
INSERT INTO agent_trust_history (agent_id, trust_score, previous_score, delta, evaluation_type, factors, anomaly_detected, anomaly_type, anomaly_severity, anomaly_details, decay_rate, created_at)
SELECT 
  ai.id,
  GREATEST(40, LEAST(100, ai.trust_score + (random() * 10 - 5))),
  ai.trust_score,
  round((random() * 10 - 5)::numeric, 2),
  CASE WHEN random() > 0.8 THEN 'event_triggered' WHEN random() > 0.95 THEN 'manual_override' ELSE 'periodic' END,
  jsonb_build_object(
    'performance', round((70 + random() * 30)::numeric, 1),
    'reliability', round((75 + random() * 25)::numeric, 1),
    'accuracy', round((80 + random() * 20)::numeric, 1),
    'compliance', round((85 + random() * 15)::numeric, 1),
    'peer_feedback', round((60 + random() * 40)::numeric, 1)
  ),
  CASE WHEN random() > 0.85 THEN true ELSE false END,
  CASE WHEN random() > 0.85 THEN (ARRAY['behavioral_drift', 'performance_degradation', 'permission_abuse', 'output_deviation'])[floor(random()*4+1)] ELSE NULL END,
  CASE WHEN random() > 0.85 THEN (ARRAY['low', 'medium', 'high', 'critical'])[floor(random()*4+1)] ELSE NULL END,
  CASE WHEN random() > 0.85 THEN 'Detected deviation from established behavioral baseline' ELSE NULL END,
  round((random() * 0.05)::numeric, 4),
  now() - (gs.d || ' hours')::interval
FROM agent_identities ai
CROSS JOIN generate_series(1, 60) AS gs(d)
WHERE ai.lifecycle_state = 'active'
LIMIT 1500;

-- 2. Permission Policies
INSERT INTO agent_permission_policies (policy_name, description, scope, target_category, rules, enforcement_mode, max_autonomy_level, requires_approval_above, auto_revoke_on_anomaly, auto_revoke_threshold, is_active) VALUES
('Least Privilege - Triage Agents', 'Triage agents can read alerts and events but cannot modify cases or execute responses', 'category', 'triage', '[{"resource": "alerts", "actions": ["read", "annotate"]}, {"resource": "events", "actions": ["read", "query"]}, {"resource": "cases", "actions": ["read"]}]'::jsonb, 'enforce', 2, 2, true, 65.0, true),
('Response Authority - Vanguard', 'Response agents can execute containment within defined boundaries', 'category', 'response', '[{"resource": "firewall_rules", "actions": ["create", "modify"]}, {"resource": "endpoints", "actions": ["isolate", "scan"]}, {"resource": "accounts", "actions": ["disable", "reset"]}]'::jsonb, 'enforce', 4, 3, true, 55.0, true),
('Data Access - Enrichment Pipeline', 'Enrichment agents can query external threat intel and internal context', 'category', 'enrichment', '[{"resource": "threat_intel_apis", "actions": ["query"]}, {"resource": "asset_registry", "actions": ["read"]}, {"resource": "user_directory", "actions": ["read"]}]'::jsonb, 'enforce', 3, 3, true, 60.0, true),
('Model Access - Detection Agents', 'Detection agents can invoke ML models for scoring and classification', 'category', 'detection', '[{"resource": "ml_models", "actions": ["invoke", "query"]}, {"resource": "feature_store", "actions": ["read"]}, {"resource": "detection_rules", "actions": ["read", "evaluate"]}]'::jsonb, 'enforce', 3, 3, true, 60.0, true),
('Full Authority - Orchestrator', 'Master orchestrator has elevated permissions for coordination', 'category', 'orchestrator', '[{"resource": "all_agents", "actions": ["invoke", "pause", "resume", "configure"]}, {"resource": "workflows", "actions": ["create", "modify", "execute"]}, {"resource": "escalations", "actions": ["create", "route"]}]'::jsonb, 'enforce', 5, 4, true, 50.0, true),
('Network Isolation - Sandbox Agents', 'Sandbox agents operate in isolated network with no external access', 'category', 'analysis', '[{"resource": "sandbox_env", "actions": ["execute", "analyze"]}, {"resource": "malware_samples", "actions": ["read", "detonate"]}, {"resource": "network", "actions": ["none"]}]'::jsonb, 'enforce', 2, 2, true, 70.0, true),
('Audit-Only - Compliance Agents', 'Compliance agents can read all data but never modify operational systems', 'category', 'compliance', '[{"resource": "all_tables", "actions": ["read", "export"]}, {"resource": "audit_logs", "actions": ["read", "write"]}, {"resource": "reports", "actions": ["create"]}]'::jsonb, 'enforce', 2, 2, false, 80.0, true),
('Emergency Override Protocol', 'Emergency protocol allowing elevated permissions during active incidents', 'global', NULL, '[{"resource": "all_systems", "actions": ["all"], "condition": "active_incident_p1", "duration_minutes": 30, "requires_ciso_approval": true}]'::jsonb, 'audit', 5, 5, false, 40.0, true);

-- 3. Permission Audit entries
INSERT INTO agent_permission_audit (agent_id, permission_type, resource_path, action, granted_by, reason, is_drift, drift_severity, drift_details, risk_score, created_at)
SELECT 
  ai.id,
  (ARRAY['data_access', 'tool_use', 'network_call', 'api_invoke', 'model_query'])[floor(random()*5+1)],
  CASE floor(random()*8+1)
    WHEN 1 THEN '/api/alerts/query'
    WHEN 2 THEN '/api/cases/create'
    WHEN 3 THEN '/api/firewall/modify'
    WHEN 4 THEN '/api/ml-models/invoke'
    WHEN 5 THEN '/api/threat-intel/fetch'
    WHEN 6 THEN '/api/endpoints/isolate'
    WHEN 7 THEN '/api/reports/generate'
    ELSE '/api/users/lookup'
  END,
  CASE WHEN random() > 0.15 THEN 'granted' WHEN random() > 0.5 THEN 'denied' ELSE 'escalated' END,
  'policy_engine',
  'Automatic policy evaluation',
  CASE WHEN random() > 0.88 THEN true ELSE false END,
  CASE WHEN random() > 0.88 THEN (ARRAY['minor', 'moderate', 'major', 'critical'])[floor(random()*4+1)] ELSE NULL END,
  CASE WHEN random() > 0.88 THEN 'Agent accessed resource outside defined policy boundary' ELSE NULL END,
  round((random() * 80)::numeric, 2),
  now() - (gs.d || ' hours')::interval
FROM agent_identities ai
CROSS JOIN generate_series(1, 20) AS gs(d)
WHERE ai.lifecycle_state = 'active'
LIMIT 600;

-- 4. Agent Collaborations - Network of inter-agent communications
INSERT INTO agent_collaborations (source_agent_id, target_agent_id, collaboration_type, workflow_name, message_count, avg_latency_ms, success_rate, data_volume_bytes, interaction_frequency, trust_between, last_interaction_at)
SELECT 
  s.id,
  t.id,
  (ARRAY['delegation', 'consultation', 'data_share', 'escalation', 'consensus'])[floor(random()*5+1)],
  (ARRAY['Alert Triage Pipeline', 'Threat Investigation', 'Incident Response', 'Compliance Audit', 'Threat Hunt Sweep', 'Malware Analysis Chain', 'Vulnerability Remediation'])[floor(random()*7+1)],
  floor(random() * 5000 + 100)::integer,
  round((random() * 500 + 10)::numeric, 2),
  round((75 + random() * 25)::numeric, 2),
  floor(random() * 50000000 + 10000)::bigint,
  (ARRAY['rare', 'occasional', 'frequent', 'continuous'])[floor(random()*4+1)],
  round((60 + random() * 40)::numeric, 2),
  now() - (random() * 24 || ' hours')::interval
FROM agent_identities s
CROSS JOIN agent_identities t
WHERE s.id != t.id 
  AND s.lifecycle_state = 'active' 
  AND t.lifecycle_state = 'active'
  AND random() > 0.85
LIMIT 120;

-- 5. Workflow DAGs
INSERT INTO agent_workflow_dags (workflow_name, workflow_description, trigger_type, trigger_config, dag_definition, participating_agents, avg_completion_time_ms, success_rate, executions_total, executions_last_24h, is_active, last_executed_at) VALUES
('Critical Alert Triage', 'Full triage pipeline for P1/P2 alerts with enrichment and scoring', 'event', '{"event_type": "alert_created", "severity": ["critical", "high"]}'::jsonb, '{"nodes": [{"id": "triage", "agent": "sentinel_triage", "type": "start"}, {"id": "enrich", "agent": "sage_enrichment", "type": "process"}, {"id": "investigate", "agent": "nova_investigation", "type": "process"}, {"id": "respond", "agent": "vanguard_response", "type": "end"}], "edges": [{"from": "triage", "to": "enrich"}, {"from": "enrich", "to": "investigate"}, {"from": "investigate", "to": "respond"}]}'::jsonb, ARRAY['sentinel_triage', 'sage_enrichment', 'nova_investigation', 'vanguard_response'], 45000, 96.5, 8420, 47, true, now() - interval '12 minutes'),
('Threat Hunt Campaign', 'Proactive threat hunting with pattern discovery and correlation', 'schedule', '{"cron": "0 */4 * * *", "timezone": "UTC"}'::jsonb, '{"nodes": [{"id": "hunt", "agent": "nova_investigation", "type": "start"}, {"id": "patterns", "agent": "pattern_discovery", "type": "process"}, {"id": "correlate", "agent": "ai_correlation", "type": "process"}, {"id": "report", "agent": "ciso_assistant", "type": "end"}], "edges": [{"from": "hunt", "to": "patterns"}, {"from": "patterns", "to": "correlate"}, {"from": "correlate", "to": "report"}]}'::jsonb, ARRAY['nova_investigation', 'pattern_discovery', 'ai_correlation', 'ciso_assistant'], 180000, 92.1, 2100, 6, true, now() - interval '2 hours'),
('Malware Deep Analysis', 'Multi-stage malware analysis with sandbox, behavioral, and signature analysis', 'event', '{"event_type": "malware_submitted", "file_types": ["exe", "dll", "ps1", "bat"]}'::jsonb, '{"nodes": [{"id": "sandbox", "agent": "malware_sandbox", "type": "start"}, {"id": "behavioral", "agent": "backdoor_defense", "type": "process"}, {"id": "signature", "agent": "threat_intel_fusion", "type": "process"}, {"id": "verdict", "agent": "sentinel_triage", "type": "end"}], "edges": [{"from": "sandbox", "to": "behavioral"}, {"from": "sandbox", "to": "signature"}, {"from": "behavioral", "to": "verdict"}, {"from": "signature", "to": "verdict"}]}'::jsonb, ARRAY['malware_sandbox', 'backdoor_defense', 'threat_intel_fusion', 'sentinel_triage'], 120000, 98.2, 1560, 12, true, now() - interval '35 minutes'),
('Insider Threat Assessment', 'Behavioral analysis pipeline for potential insider threats', 'threshold', '{"metric": "user_risk_score", "threshold": 75, "window_minutes": 60}'::jsonb, '{"nodes": [{"id": "detect", "agent": "ueba_behavioral", "type": "start"}, {"id": "profile", "agent": "psych_profiler", "type": "process"}, {"id": "investigate", "agent": "nova_investigation", "type": "process"}, {"id": "escalate", "agent": "ciso_assistant", "type": "end"}], "edges": [{"from": "detect", "to": "profile"}, {"from": "profile", "to": "investigate"}, {"from": "investigate", "to": "escalate"}]}'::jsonb, ARRAY['ueba_behavioral', 'psych_profiler', 'nova_investigation', 'ciso_assistant'], 90000, 94.8, 890, 3, true, now() - interval '4 hours'),
('Vulnerability Remediation', 'Automated vulnerability assessment and remediation workflow', 'schedule', '{"cron": "0 2 * * *", "timezone": "UTC"}'::jsonb, '{"nodes": [{"id": "scan", "agent": "glasswing_scanner", "type": "start"}, {"id": "prioritize", "agent": "risk_scoring", "type": "process"}, {"id": "patch", "agent": "auto_remediator", "type": "process"}, {"id": "verify", "agent": "glasswing_scanner", "type": "end"}], "edges": [{"from": "scan", "to": "prioritize"}, {"from": "prioritize", "to": "patch"}, {"from": "patch", "to": "verify"}]}'::jsonb, ARRAY['glasswing_scanner', 'risk_scoring', 'auto_remediator'], 300000, 88.5, 365, 1, true, now() - interval '22 hours'),
('Compliance Continuous Audit', 'Real-time compliance monitoring across all frameworks', 'schedule', '{"cron": "0 */6 * * *", "timezone": "UTC"}'::jsonb, '{"nodes": [{"id": "audit", "agent": "compliance_guardian", "type": "start"}, {"id": "assess", "agent": "risk_scoring", "type": "process"}, {"id": "report", "agent": "report_generator", "type": "end"}], "edges": [{"from": "audit", "to": "assess"}, {"from": "assess", "to": "report"}]}'::jsonb, ARRAY['compliance_guardian', 'risk_scoring', 'report_generator'], 60000, 99.1, 1460, 4, true, now() - interval '5 hours'),
('Phishing Campaign Response', 'End-to-end phishing detection, analysis, and containment', 'event', '{"event_type": "email_suspicious", "confidence_above": 0.7}'::jsonb, '{"nodes": [{"id": "detect", "agent": "phishing_detector", "type": "start"}, {"id": "analyze", "agent": "document_analyzer", "type": "process"}, {"id": "contain", "agent": "vanguard_response", "type": "process"}, {"id": "notify", "agent": "notification_agent", "type": "end"}], "edges": [{"from": "detect", "to": "analyze"}, {"from": "analyze", "to": "contain"}, {"from": "contain", "to": "notify"}]}'::jsonb, ARRAY['phishing_detector', 'document_analyzer', 'vanguard_response', 'notification_agent'], 35000, 97.3, 4200, 28, true, now() - interval '8 minutes'),
('Red Team Simulation', 'Adversary emulation with blue team validation', 'manual', '{"initiated_by": "security_team", "approval_required": true}'::jsonb, '{"nodes": [{"id": "plan", "agent": "red_team_planner", "type": "start"}, {"id": "execute", "agent": "exploit_engine", "type": "process"}, {"id": "detect", "agent": "detection_validator", "type": "process"}, {"id": "report", "agent": "ciso_assistant", "type": "end"}], "edges": [{"from": "plan", "to": "execute"}, {"from": "execute", "to": "detect"}, {"from": "detect", "to": "report"}]}'::jsonb, ARRAY['red_team_planner', 'exploit_engine', 'detection_validator', 'ciso_assistant'], 600000, 100.0, 52, 0, true, now() - interval '3 days');

-- 6. Agent Threat Surface assessments
INSERT INTO agent_threat_surface (agent_id, attack_surface_score, vulnerability_count, critical_vulns, exposed_apis, data_sensitivity_level, network_exposure, input_validation_score, output_sanitization_score, dependency_risk_score, isolation_level, recommended_isolation, last_pentest_at, last_pentest_result, threat_vectors, mitigations_applied, compliance_gaps, assessed_at)
SELECT 
  ai.id,
  round((20 + random() * 60)::numeric, 2),
  floor(random() * 8)::integer,
  floor(random() * 2)::integer,
  floor(random() * 12 + 2)::integer,
  (ARRAY['internal', 'confidential', 'restricted', 'top_secret'])[floor(random()*4+1)],
  (ARRAY['isolated', 'internal', 'dmz', 'internal'])[floor(random()*4+1)],
  round((60 + random() * 40)::numeric, 2),
  round((65 + random() * 35)::numeric, 2),
  round((10 + random() * 50)::numeric, 2),
  (ARRAY['maximum', 'high', 'standard', 'standard', 'minimal'])[floor(random()*5+1)],
  CASE WHEN random() > 0.7 THEN 'Upgrade to high isolation' WHEN random() > 0.4 THEN 'Maintain current level' ELSE NULL END,
  now() - (floor(random() * 30) || ' days')::interval,
  (ARRAY['pass', 'pass_with_findings', 'conditional_pass', 'fail'])[floor(random()*4+1)],
  jsonb_build_array(
    jsonb_build_object('vector', 'prompt_injection', 'risk', round((random() * 80)::numeric, 1), 'mitigated', random() > 0.3),
    jsonb_build_object('vector', 'data_exfiltration', 'risk', round((random() * 60)::numeric, 1), 'mitigated', random() > 0.4),
    jsonb_build_object('vector', 'privilege_escalation', 'risk', round((random() * 50)::numeric, 1), 'mitigated', random() > 0.5),
    jsonb_build_object('vector', 'supply_chain', 'risk', round((random() * 40)::numeric, 1), 'mitigated', random() > 0.6)
  ),
  jsonb_build_array(
    jsonb_build_object('mitigation', 'Input sanitization', 'status', 'applied', 'effectiveness', round((70 + random() * 30)::numeric, 1)),
    jsonb_build_object('mitigation', 'Output filtering', 'status', CASE WHEN random() > 0.3 THEN 'applied' ELSE 'pending' END, 'effectiveness', round((60 + random() * 40)::numeric, 1)),
    jsonb_build_object('mitigation', 'Rate limiting', 'status', 'applied', 'effectiveness', round((80 + random() * 20)::numeric, 1))
  ),
  CASE WHEN random() > 0.6 THEN jsonb_build_array('SOC2-CC6.1', 'ISO27001-A.12.6') ELSE '[]'::jsonb END,
  now() - (floor(random() * 7) || ' days')::interval
FROM agent_identities ai
WHERE ai.lifecycle_state = 'active';
