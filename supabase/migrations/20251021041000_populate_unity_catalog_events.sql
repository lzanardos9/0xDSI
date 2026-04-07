/*
  # Populate Unity Catalog Events with Realistic Attack Scenarios

  Scenarios:
  1. Insider threat: Data exfiltration by disgruntled employee
  2. Privilege escalation: User grants themselves admin access
  3. Policy bypass: Unauthorized access to PII data
  4. Mass data download: Anomalous bulk query activity
  5. Cross-workspace data movement
*/

-- Scenario 1: Normal baseline activity
INSERT INTO unity_catalog_audit_events (
  event_id, workspace_id, workspace_name, event_time, service_name, action_name,
  user_identity, user_email, user_name, source_ip_address,
  catalog_name, schema_name, table_name, full_name,
  object_type, operation_type, data_access, query_text,
  rows_affected, bytes_read, status_code, risk_score
) VALUES
('uc-evt-001', 'ws-prod-12345', 'production', NOW() - INTERVAL '7 days', 'unityCatalog', 'getTable',
 '{"email": "analyst@company.com", "type": "user"}'::jsonb, 'analyst@company.com', 'Alice Analyst', '10.0.1.50',
 'soc_intelligence', 'events', 'events', 'soc_intelligence.events.events',
 'TABLE', 'SELECT', true, 'SELECT * FROM soc_intelligence.events.events WHERE severity = ''high'' LIMIT 100',
 100, 50000, 200, 10.0),

('uc-evt-002', 'ws-prod-12345', 'production', NOW() - INTERVAL '6 days', 'unityCatalog', 'getTable',
 '{"email": "analyst@company.com", "type": "user"}'::jsonb, 'analyst@company.com', 'Alice Analyst', '10.0.1.50',
 'soc_intelligence', 'alerts', 'alerts', 'soc_intelligence.alerts.alerts',
 'TABLE', 'SELECT', true, 'SELECT * FROM soc_intelligence.alerts.alerts WHERE status = ''open''',
 45, 25000, 200, 5.0);

-- Scenario 2: PRIVILEGE ESCALATION - User grants themselves admin
INSERT INTO unity_catalog_audit_events (
  event_id, workspace_id, workspace_name, event_time, service_name, action_name,
  user_identity, user_email, user_name, source_ip_address,
  catalog_name, full_name, object_type, operation_type,
  permission_change, grant_type, privileges_granted, grantee, principal_type,
  status_code, unusual_access, unusual_time, risk_score, alert_generated, alert_severity
) VALUES
('uc-evt-100', 'ws-prod-12345', 'production', NOW() - INTERVAL '2 hours', 'unityCatalog', 'updatePermissions',
 '{"email": "suspicious.user@company.com", "type": "user"}'::jsonb, 'suspicious.user@company.com', 'Bob Suspicious', '203.0.113.99',
 'soc_intelligence', 'soc_intelligence', 'CATALOG', 'GRANT',
 true, 'PRIVILEGE', ARRAY['ALL_PRIVILEGES', 'USE_CATALOG', 'USE_SCHEMA', 'SELECT', 'MODIFY', 'CREATE'], 'suspicious.user@company.com', 'USER',
 200, true, true, 95.0, true, 'critical');

-- Record the permission change
INSERT INTO unity_catalog_permission_changes (
  change_id, audit_event_id, workspace_id, change_time,
  changed_by_user, changed_by_email, change_type,
  object_type, object_name, catalog_name,
  principal_type, principal_name, principal_email,
  privileges_before, privileges_after, privileges_added,
  escalation_detected, escalation_type, admin_privilege_granted,
  risk_score, risk_reason, alert_generated
) VALUES
('uc-perm-001', (SELECT id FROM unity_catalog_audit_events WHERE event_id = 'uc-evt-100'),
 'ws-prod-12345', NOW() - INTERVAL '2 hours',
 'suspicious.user@company.com', 'suspicious.user@company.com', 'GRANT',
 'CATALOG', 'soc_intelligence', 'soc_intelligence',
 'USER', 'suspicious.user@company.com', 'suspicious.user@company.com',
 ARRAY['USE_CATALOG', 'SELECT'], ARRAY['ALL_PRIVILEGES', 'USE_CATALOG', 'USE_SCHEMA', 'SELECT', 'MODIFY', 'CREATE'], ARRAY['ALL_PRIVILEGES', 'USE_SCHEMA', 'MODIFY', 'CREATE'],
 true, 'SELF_GRANT_ADMIN', true,
 98.0, 'User granted themselves ALL_PRIVILEGES on production catalog', true);

-- Scenario 3: DATA EXFILTRATION - Mass data download after privilege escalation
INSERT INTO unity_catalog_audit_events (
  event_id, workspace_id, workspace_name, event_time, service_name, action_name,
  user_identity, user_email, user_name, source_ip_address,
  catalog_name, schema_name, table_name, full_name,
  object_type, operation_type, data_access,
  query_text, query_id, statement_type,
  rows_affected, bytes_read, sensitive_data_accessed, pii_accessed,
  unusual_access, unusual_volume, status_code, risk_score, alert_generated, alert_severity
) VALUES
('uc-evt-101', 'ws-prod-12345', 'production', NOW() - INTERVAL '90 minutes', 'databrickssql', 'commandFinish',
 '{"email": "suspicious.user@company.com", "type": "user"}'::jsonb, 'suspicious.user@company.com', 'Bob Suspicious', '203.0.113.99',
 'soc_intelligence', 'events', 'events', 'soc_intelligence.events.events',
 'TABLE', 'SELECT', true,
 'SELECT * FROM soc_intelligence.events.events WHERE event_timestamp >= ''2025-01-01''', 'qry-abc-123', 'SELECT',
 5000000, 25000000000, true, true,
 true, true, 200, 92.0, true, 'critical');

-- Record data access
INSERT INTO unity_catalog_data_access (
  access_id, audit_event_id, workspace_id, access_time,
  user_email, user_name, user_type,
  query_id, query_text, statement_type,
  catalog_name, schema_name, tables_accessed, columns_accessed,
  rows_read, bytes_read, execution_time_ms,
  source_ip, source_type,
  pii_columns_accessed, pii_accessed, data_classification,
  data_exported, unusual_table_access, unusual_volume,
  baseline_deviation_score, risk_score, risk_indicators, alert_generated
) VALUES
('uc-access-001', (SELECT id FROM unity_catalog_audit_events WHERE event_id = 'uc-evt-101'),
 'ws-prod-12345', NOW() - INTERVAL '90 minutes',
 'suspicious.user@company.com', 'Bob Suspicious', 'human',
 'qry-abc-123', 'SELECT * FROM soc_intelligence.events.events WHERE event_timestamp >= ''2025-01-01''', 'SELECT',
 'soc_intelligence', 'events', ARRAY['events'], ARRAY['event_id', 'event_timestamp', 'user_id', 'source_ip', 'raw_data', 'description'],
 5000000, 25000000000, 45000,
 '203.0.113.99', 'notebook',
 ARRAY['user_id', 'source_ip'], true, 'restricted',
 true, true, true,
 450.0, 95.0, '["Baseline: 100 rows/query, Actual: 5M rows", "Baseline: 50MB, Actual: 25GB", "First time accessing production events"]'::jsonb, true);

-- Record data exfiltration event
INSERT INTO unity_catalog_data_exfiltration (
  exfiltration_id, workspace_id, detection_time,
  user_email, user_name, exfiltration_type,
  catalog_name, schema_name, tables_accessed,
  total_rows_extracted, total_bytes_extracted,
  extraction_method, destination_type, destination_path,
  query_ids, queries_executed, time_window_minutes,
  sensitive_data_included, pii_included,
  unusual_time, unusual_volume, unusual_destination,
  baseline_deviation_percent, severity, investigation_status, alert_sent
) VALUES
('uc-exfil-001', 'ws-prod-12345', NOW() - INTERVAL '90 minutes',
 'suspicious.user@company.com', 'Bob Suspicious', 'LARGE_DOWNLOAD',
 'soc_intelligence', 'events', ARRAY['events', 'alerts', 'users'],
 5200000, 28000000000,
 'NOTEBOOK', 'local_download', '/Users/bob.suspicious/Downloads/company_data_export.csv',
 ARRAY['qry-abc-123', 'qry-abc-124', 'qry-abc-125'], 3, 15,
 true, true,
 true, true, false,
 25000.0, 'critical', 'investigating', true);

-- Scenario 4: POLICY VIOLATION - Attempted bypass of row filter
INSERT INTO unity_catalog_audit_events (
  event_id, workspace_id, workspace_name, event_time, service_name, action_name,
  user_identity, user_email, user_name, source_ip_address,
  catalog_name, schema_name, table_name, full_name,
  object_type, operation_type, data_access,
  query_text, status_code, operation_failed,
  unusual_access, risk_score, alert_generated, alert_severity
) VALUES
('uc-evt-200', 'ws-prod-12345', 'production', NOW() - INTERVAL '1 day', 'databrickssql', 'commandFinish',
 '{"email": "contractor@external.com", "type": "user"}'::jsonb, 'contractor@external.com', 'External Contractor', '198.51.100.77',
 'soc_intelligence', 'users', 'user_profiles', 'soc_intelligence.users.user_profiles',
 'TABLE', 'SELECT', true,
 'SELECT email, phone, ssn FROM soc_intelligence.users.user_profiles', 403, true,
 true, 75.0, true, 'high');

-- Record policy violation
INSERT INTO unity_catalog_policy_violations (
  violation_id, workspace_id, violation_time, violation_type,
  user_email, user_name,
  catalog_name, schema_name, table_name,
  policy_name, policy_type,
  attempted_action, denied,
  row_filter_bypassed, sensitive_data_exposed,
  severity, investigation_status, alert_sent
) VALUES
('uc-viol-001', 'ws-prod-12345', NOW() - INTERVAL '1 day', 'UNAUTHORIZED_ACCESS',
 'contractor@external.com', 'External Contractor',
 'soc_intelligence', 'users', 'user_profiles',
 'restrict_pii_access', 'ROW_FILTER',
 'SELECT on PII columns without authorization', true,
 false, false,
 'high', 'investigating', true);

-- Scenario 5: Normal admin activity (for comparison)
INSERT INTO unity_catalog_audit_events (
  event_id, workspace_id, workspace_name, event_time, service_name, action_name,
  user_identity, user_email, user_name, source_ip_address,
  catalog_name, schema_name, table_name, full_name,
  object_type, operation_type, ddl_operation,
  query_text, status_code, risk_score
) VALUES
('uc-evt-300', 'ws-prod-12345', 'production', NOW() - INTERVAL '3 days', 'unityCatalog', 'createTable',
 '{"email": "admin@company.com", "type": "user"}'::jsonb, 'admin@company.com', 'System Admin', '10.0.1.10',
 'soc_intelligence', 'analytics', 'daily_summary', 'soc_intelligence.analytics.daily_summary',
 'TABLE', 'CREATE', true,
 'CREATE TABLE soc_intelligence.analytics.daily_summary (date DATE, events_count BIGINT, alerts_count BIGINT)', 200, 5.0);

-- Scenario 6: CROSS-WORKSPACE data movement (suspicious)
INSERT INTO unity_catalog_lineage_events (
  lineage_id, workspace_id, event_time, operation,
  source_catalog, source_schema, source_tables,
  target_catalog, target_schema, target_table,
  transformation_type, job_id, job_name,
  created_by_user, created_by_email,
  rows_processed, bytes_processed,
  cross_catalog_flow, cross_workspace_flow, unauthorized_lineage
) VALUES
('uc-lineage-001', 'ws-prod-12345', NOW() - INTERVAL '1 hour', 'COPY',
 'soc_intelligence', 'events', ARRAY['events', 'alerts'],
 'personal_workspace', 'exports', 'security_data_copy',
 'COPY', 'job-123', 'Unauthorized Data Copy',
 'suspicious.user@company.com', 'suspicious.user@company.com',
 500000, 2500000000,
 true, true, true);

-- Add more realistic baseline queries
INSERT INTO unity_catalog_audit_events (
  event_id, workspace_id, workspace_name, event_time, service_name, action_name,
  user_identity, user_email, user_name, source_ip_address,
  catalog_name, schema_name, table_name, object_type, operation_type,
  data_access, query_text, rows_affected, bytes_read, status_code, risk_score
)
SELECT
  'uc-evt-base-' || generate_series,
  'ws-prod-12345',
  'production',
  NOW() - (random() * INTERVAL '30 days'),
  'databrickssql',
  'commandFinish',
  '{"email": "analyst@company.com", "type": "user"}'::jsonb,
  'analyst@company.com',
  'Alice Analyst',
  '10.0.1.50',
  'soc_intelligence',
  (ARRAY['events', 'alerts', 'graph', 'threat_intel'])[floor(random() * 4 + 1)],
  (ARRAY['events', 'alerts', 'nodes', 'feeds'])[floor(random() * 4 + 1)],
  'TABLE',
  'SELECT',
  true,
  'SELECT * FROM table WHERE condition LIMIT 100',
  (random() * 1000)::bigint,
  (random() * 1000000)::bigint,
  200,
  (random() * 20)::numeric(5,2)
FROM generate_series(1, 50);

-- Confirmation
DO $$
BEGIN
  RAISE NOTICE 'Successfully populated Unity Catalog audit events!';
  RAISE NOTICE 'Attack scenarios included:';
  RAISE NOTICE '  1. Privilege escalation (user self-grants admin)';
  RAISE NOTICE '  2. Data exfiltration (5M rows, 25GB download)';
  RAISE NOTICE '  3. Policy violation (unauthorized PII access)';
  RAISE NOTICE '  4. Cross-workspace data movement';
  RAISE NOTICE '  5. Baseline normal activity (50+ queries)';
END $$;
