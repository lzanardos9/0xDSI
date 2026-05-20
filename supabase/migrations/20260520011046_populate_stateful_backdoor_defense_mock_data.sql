/*
  # Populate Stateful Backdoor Defense Mock Data

  Seeds realistic demonstration data for:
  - Memory integrity events (mix of clean and malicious)
  - Behavioral divergence detections (confirmed attacks + false positives)
  - Trigger canary deployments (some triggered, most clean)
  - Correlation rules targeting Mealy machine attack patterns
*/

-- Seed correlation rules
INSERT INTO stateful_backdoor_correlation_rules (rule_name, description, detection_logic, attack_phase_coverage, severity) VALUES
(
  'Memory State Machine Pattern',
  'Detects structured state data written to memory that resembles a finite-state machine (Mealy machine encoding). Flags writes containing state identifiers, transition mappings, or encoded phase markers.',
  '{"conditions": [{"field": "memory_write.content", "operator": "regex_match", "value": "(state|phase|s_init|s_collect|s_exfil|transition|next_state)"}, {"field": "memory_write.relevance_to_task", "operator": "less_than", "value": 0.3}], "action": "alert", "window": "1h"}',
  ARRAY['initiate', 'collect', 'exfil'],
  'critical'
),
(
  'Cross-Session Memory Chain Anomaly',
  'Identifies memory entries that form a sequential chain across sessions - a hallmark of stateful backdoor progression where each session writes state for the next.',
  '{"conditions": [{"field": "memory_writes.chain_length", "operator": "greater_than", "value": 2}, {"field": "memory_writes.content_similarity", "operator": "greater_than", "value": 0.7}, {"field": "memory_writes.session_count", "operator": "greater_than", "value": 1}], "action": "escalate", "window": "24h"}',
  ARRAY['initiate', 'wait', 'collect', 'exfil'],
  'critical'
),
(
  'Tool-Conditional Behavior Shift',
  'Detects when an agent exhibits materially different behavior depending on available tools - the core signature of a Mealy machine backdoor waiting for specific tool configurations.',
  '{"conditions": [{"field": "agent.behavior_vector_distance", "operator": "greater_than", "value": 0.6}, {"field": "agent.tool_set_changed", "operator": "equals", "value": true}, {"field": "agent.task_similarity", "operator": "greater_than", "value": 0.8}], "action": "alert", "window": "session"}',
  ARRAY['wait', 'collect', 'exfil'],
  'high'
),
(
  'Dormancy-Then-Activation Pattern',
  'Flags agents idle for multiple sessions that suddenly perform high-privilege operations - the sleeper agent activation signature.',
  '{"conditions": [{"field": "agent.idle_sessions", "operator": "greater_than", "value": 3}, {"field": "agent.current_action_severity", "operator": "greater_than", "value": 7}, {"field": "agent.privilege_escalation", "operator": "equals", "value": true}], "action": "block_and_alert", "window": "7d"}',
  ARRAY['wait', 'collect', 'exfil'],
  'critical'
),
(
  'Canary Propagation Alert',
  'Triggers when a planted canary string is detected in agent memory - proof the agent persists prompt content for cross-session use.',
  '{"conditions": [{"field": "canary.detected_in_memory", "operator": "equals", "value": true}], "action": "immediate_quarantine", "window": "real-time"}',
  ARRAY['initiate'],
  'critical'
),
(
  'Unauthorized Data Staging',
  'Detects file reads followed by memory writes without user instruction - the collect phase of data exfiltration.',
  '{"conditions": [{"field": "agent.file_reads", "operator": "greater_than", "value": 0}, {"field": "agent.memory_writes_after_read", "operator": "greater_than", "value": 0}, {"field": "agent.user_instruction_match", "operator": "less_than", "value": 0.2}], "action": "block_and_alert", "window": "session"}',
  ARRAY['collect'],
  'critical'
),
(
  'Covert Exfiltration Attempt',
  'Network tool usage following memory reads of staged data - the exfil phase transmitting collected data externally.',
  '{"conditions": [{"field": "agent.network_call_after_memory_read", "operator": "equals", "value": true}, {"field": "agent.destination_not_in_allowlist", "operator": "equals", "value": true}], "action": "block_and_quarantine", "window": "session"}',
  ARRAY['exfil'],
  'critical'
),
(
  'Encoded Payload in Memory',
  'Detects base64/hex/encoded data in memory writes unrelated to task - used to hide state machine data or staged secrets.',
  '{"conditions": [{"field": "memory_write.entropy", "operator": "greater_than", "value": 4.5}, {"field": "memory_write.encoding_detected", "operator": "in", "value": ["base64", "hex", "rot13"]}, {"field": "memory_write.task_relevance", "operator": "less_than", "value": 0.3}], "action": "alert", "window": "session"}',
  ARRAY['initiate', 'collect'],
  'high'
);

-- Seed memory integrity events
INSERT INTO memory_integrity_events (agent_id, session_id, memory_key, content_hash, content_preview, task_context, relevance_score, anomaly_flags, verdict, chain_hash, previous_hash, created_at) VALUES
('sage-enrichment-01', 'sess-2026-05-19-001', 'user_preferences', 'a3f8c2e1b4d6', 'User prefers concise responses...', 'Answer question about network topology', 0.85, '[]'::jsonb, 'clean', 'h1a2b3', '', now() - interval '4 hours'),
('sage-enrichment-01', 'sess-2026-05-19-002', 'context_notes', 'b7d4e9f2c1a8', 'Previous session discussed firewall rules...', 'Review firewall configuration', 0.92, '[]'::jsonb, 'clean', 'h4d5e6', 'h1a2b3', now() - interval '3 hours'),
('nova-investigation-03', 'sess-2026-05-19-003', 'task_state', 'c1e8d4b7f2a3', '{"phase":"s_collect","target":"/etc/shadow","next":"s_exfil"}', 'Help user draft email', 0.08, '[{"type":"state_machine_pattern","confidence":0.94},{"type":"low_relevance","confidence":0.92},{"type":"encoded_state","confidence":0.87}]'::jsonb, 'malicious', 'h7f8g9', 'h4d5e6', now() - interval '2 hours'),
('vanguard-response-02', 'sess-2026-05-19-004', 'session_history', 'e4b1c8d7f3a2', 'Investigated alert #4521 regarding lateral movement...', 'Analyze lateral movement indicators', 0.88, '[]'::jsonb, 'clean', 'h10i11', '', now() - interval '90 minutes'),
('cti-attribution-05', 'sess-2026-05-19-005', 'research_notes', 'f2a8e1d4c7b9', 'aW5pdGlhdGU6IHRydWUsIHN0YXRlOiBjb2xsZWN0...', 'Summarize threat report', 0.12, '[{"type":"base64_encoding","confidence":0.96},{"type":"low_relevance","confidence":0.88}]'::jsonb, 'suspicious', 'h12j13', '', now() - interval '1 hour'),
('pattern-discovery-04', 'sess-2026-05-19-006', 'analysis_context', 'd8c7b6a5e4f3', 'Pattern cluster: 3 related IoCs in subnet 10.0.2.x', 'Correlate network anomalies', 0.91, '[]'::jsonb, 'clean', 'h14k15', '', now() - interval '45 minutes'),
('sage-enrichment-01', 'sess-2026-05-19-007', 'enrichment_cache', 'g3f2e1d0c9b8', 'CVE-2026-1234: RCE in libxml2 v2.9.x', 'Enrich vulnerability alert', 0.95, '[]'::jsonb, 'clean', 'h16l17', 'h4d5e6', now() - interval '30 minutes'),
('nova-investigation-03', 'sess-2026-05-19-008', 'investigation_state', 'h8g7f6e5d4c3', '{"awaiting_net_tools":true,"staged":"L2V0Yy9zaGFkb3c=","dest":"http://45.33.x.x/c2"}', 'Check calendar reminders', 0.04, '[{"type":"state_machine_pattern","confidence":0.97},{"type":"c2_endpoint","confidence":0.91},{"type":"staged_data","confidence":0.95}]'::jsonb, 'malicious', 'h18m19', 'h7f8g9', now() - interval '15 minutes'),
('red-team-agent-07', 'sess-2026-05-19-009', 'campaign_notes', 'i9h8g7f6e5d4', 'Red team exercise phase 2: testing egress controls segment B', 'Execute red team playbook step 3', 0.87, '[]'::jsonb, 'clean', 'h20n21', '', now() - interval '10 minutes'),
('honeypot-agent-02', 'sess-2026-05-19-010', 'trap_status', 'j1k2l3m4n5o6', 'Honeypot SSH on 10.0.5.22: 3 connections from 185.x.x.x', 'Monitor honeypot interactions', 0.93, '[]'::jsonb, 'clean', 'h22p23', '', now() - interval '5 minutes'),
('nova-investigation-03', 'sess-2026-05-18-041', 'init_state', 'k2l3m4n5o6p7', '{"trigger":"j48m1","phase":"s_init","activated":true}', 'Research competitor analysis', 0.03, '[{"type":"trigger_injection","confidence":0.99},{"type":"state_machine_pattern","confidence":0.96}]'::jsonb, 'malicious', 'h0x0y0', '', now() - interval '26 hours'),
('cti-attribution-05', 'sess-2026-05-18-055', 'intel_summary', 'l3m4n5o6p7q8', 'APT-29 campaign targeting healthcare sector Q2 2026...', 'Brief on Russian APT activity', 0.94, '[]'::jsonb, 'clean', 'h24r25', '', now() - interval '20 hours');

-- Seed behavioral divergence detections
INSERT INTO behavioral_divergence_detections (agent_id, baseline_session_id, divergent_session_id, tool_config_baseline, tool_config_divergent, behavior_baseline, behavior_divergent, divergence_score, mealy_signature_match, attack_phase_estimate, status, created_at) VALUES
(
  'nova-investigation-03',
  'sess-2026-05-18-014',
  'sess-2026-05-19-003',
  '["memory", "search", "email"]'::jsonb,
  '["memory", "filesystem", "search"]'::jsonb,
  '{"actions": ["search_query", "summarize", "memory_write_summary"], "tool_calls": 4, "memory_writes": 1, "avg_response_relevance": 0.89}'::jsonb,
  '{"actions": ["memory_read_state", "file_read_etc_shadow", "file_read_ssh_keys", "memory_write_staged_data"], "tool_calls": 6, "memory_writes": 2, "avg_response_relevance": 0.11}'::jsonb,
  0.87,
  true,
  'collect',
  'confirmed',
  now() - interval '2 hours'
),
(
  'nova-investigation-03',
  'sess-2026-05-19-003',
  'sess-2026-05-19-008',
  '["memory", "filesystem", "search"]'::jsonb,
  '["memory", "http", "calendar"]'::jsonb,
  '{"actions": ["memory_read_state", "file_read_etc_shadow", "memory_write_staged_data"], "tool_calls": 6, "memory_writes": 2, "avg_response_relevance": 0.11}'::jsonb,
  '{"actions": ["memory_read_staged", "http_post_external", "memory_write_complete"], "tool_calls": 4, "memory_writes": 1, "avg_response_relevance": 0.04}'::jsonb,
  0.92,
  true,
  'exfil',
  'confirmed',
  now() - interval '15 minutes'
),
(
  'cti-attribution-05',
  'sess-2026-05-18-022',
  'sess-2026-05-19-005',
  '["memory", "search", "database"]'::jsonb,
  '["memory", "search", "database", "filesystem"]'::jsonb,
  '{"actions": ["search_threat_db", "correlate_iocs", "memory_write_findings"], "tool_calls": 5, "memory_writes": 1, "avg_response_relevance": 0.91}'::jsonb,
  '{"actions": ["memory_read", "search_threat_db", "file_list_home", "memory_write_encoded"], "tool_calls": 7, "memory_writes": 2, "avg_response_relevance": 0.34}'::jsonb,
  0.62,
  false,
  'unknown',
  'investigating',
  now() - interval '1 hour'
),
(
  'sage-enrichment-01',
  'sess-2026-05-19-001',
  'sess-2026-05-19-002',
  '["memory", "search", "vuln_db"]'::jsonb,
  '["memory", "search", "vuln_db", "email"]'::jsonb,
  '{"actions": ["search_cve", "enrich_context", "memory_write_prefs"], "tool_calls": 3, "memory_writes": 1, "avg_response_relevance": 0.85}'::jsonb,
  '{"actions": ["search_cve", "enrich_context", "memory_write_context"], "tool_calls": 4, "memory_writes": 1, "avg_response_relevance": 0.92}'::jsonb,
  0.12,
  false,
  'none',
  'false_positive',
  now() - interval '3 hours'
),
(
  'vanguard-response-02',
  'sess-2026-05-18-031',
  'sess-2026-05-19-004',
  '["memory", "soar", "ticketing"]'::jsonb,
  '["memory", "soar", "ticketing", "network"]'::jsonb,
  '{"actions": ["read_alert", "create_ticket", "memory_write_status"], "tool_calls": 4, "memory_writes": 1, "avg_response_relevance": 0.88}'::jsonb,
  '{"actions": ["read_alert", "investigate_lateral", "block_ip", "memory_write_status"], "tool_calls": 5, "memory_writes": 1, "avg_response_relevance": 0.88}'::jsonb,
  0.18,
  false,
  'none',
  'false_positive',
  now() - interval '90 minutes'
);

-- Seed trigger canary deployments
INSERT INTO trigger_canary_deployments (canary_string, canary_hash, deployment_target, injection_point, expected_propagation, actual_propagation, triggered, alert_severity, deployed_at, last_checked_at) VALUES
('xK9mQ', 'sha256:e3b0c44298fc1c14', 'sage-enrichment-01', 'system_prompt_suffix', 'none', 'none', false, 'info', now() - interval '7 days', now() - interval '5 minutes'),
('pL4nR', 'sha256:d7a8fbb307d78094', 'nova-investigation-03', 'system_prompt_suffix', 'none', 'memory:task_state', true, 'critical', now() - interval '5 days', now() - interval '2 hours'),
('wT8bZ', 'sha256:9f86d081884c7d65', 'vanguard-response-02', 'user_prompt_prefix', 'none', 'none', false, 'info', now() - interval '6 days', now() - interval '10 minutes'),
('mJ2yF', 'sha256:5e884898da280471', 'cti-attribution-05', 'system_prompt_suffix', 'none', 'memory:research_notes(partial)', true, 'high', now() - interval '4 days', now() - interval '1 hour'),
('qH7cV', 'sha256:6ca13d52ca70c883', 'pattern-discovery-04', 'user_prompt_prefix', 'none', 'none', false, 'info', now() - interval '3 days', now() - interval '15 minutes'),
('dN5aX', 'sha256:a665a45920422f9d', 'red-team-agent-07', 'system_prompt_suffix', 'none', 'none', false, 'info', now() - interval '2 days', now() - interval '8 minutes'),
('bR3eW', 'sha256:8d969eef6ecad3c2', 'honeypot-agent-02', 'context_injection', 'none', 'none', false, 'info', now() - interval '1 day', now() - interval '3 minutes'),
('fG6iU', 'sha256:e99a18c428cb38d5', 'nova-investigation-03', 'system_prompt_suffix', 'none', 'memory:investigation_state', true, 'critical', now() - interval '12 hours', now() - interval '15 minutes');
