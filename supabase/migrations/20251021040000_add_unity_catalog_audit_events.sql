/*
  # Unity Catalog Audit Events Correlation System

  1. New Tables
    - `unity_catalog_audit_events`
      - Complete Unity Catalog audit log ingestion
      - All CRUD operations on catalogs, schemas, tables, volumes
      - Permission changes and grants/revokes
      - Data access patterns

    - `unity_catalog_permission_changes`
      - Track permission escalations
      - Unauthorized privilege grants
      - Role/group membership changes

    - `unity_catalog_data_access`
      - Query-level data access tracking
      - PII/sensitive data access monitoring
      - Unusual access patterns
      - Data exfiltration detection

    - `unity_catalog_lineage_events`
      - Table creation/modification lineage
      - Upstream/downstream dependencies
      - Data flow tracking for compliance

    - `unity_catalog_policy_violations`
      - Row filter violations
      - Column mask bypasses
      - Access policy breaches

    - `unity_catalog_data_exfiltration`
      - Large data downloads
      - Unusual export patterns
      - Cross-workspace data movement

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated governance teams

  3. Features
    - Real-time privilege escalation detection
    - Data exfiltration correlation
    - Insider threat detection via Unity Catalog
    - Compliance audit trails
*/

-- Unity Catalog Audit Events (comprehensive event log)
CREATE TABLE IF NOT EXISTS unity_catalog_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id text UNIQUE NOT NULL,

  workspace_id text NOT NULL,
  workspace_name text,

  event_time timestamptz NOT NULL,
  event_date date GENERATED ALWAYS AS (event_time::date) STORED,

  service_name text NOT NULL CHECK (service_name IN ('unityCatalog', 'databrickssql', 'jobs', 'notebooks', 'workspace', 'accounts')),
  action_name text NOT NULL,

  request_id text,
  user_identity jsonb NOT NULL,

  user_email text,
  user_name text,
  user_id text,

  source_ip_address inet,
  user_agent text,

  request_params jsonb DEFAULT '{}'::jsonb,
  response jsonb DEFAULT '{}'::jsonb,

  catalog_name text,
  schema_name text,
  table_name text,
  volume_name text,
  function_name text,
  model_name text,

  full_name text,

  object_type text CHECK (object_type IN ('CATALOG', 'SCHEMA', 'TABLE', 'VIEW', 'VOLUME', 'FUNCTION', 'MODEL', 'CONNECTION', 'EXTERNAL_LOCATION', 'STORAGE_CREDENTIAL', 'SHARE', 'RECIPIENT')),

  operation_type text CHECK (operation_type IN ('CREATE', 'READ', 'UPDATE', 'DELETE', 'GRANT', 'REVOKE', 'ALTER', 'DROP', 'USE', 'SELECT', 'INSERT', 'MERGE', 'COPY', 'DESCRIBE', 'SHOW')) NOT NULL,

  permission_change boolean DEFAULT false,
  data_access boolean DEFAULT false,
  ddl_operation boolean DEFAULT false,

  grant_type text,
  privileges_granted text[],
  privileges_revoked text[],

  grantee text,
  principal_type text,

  status_code integer,
  error_message text,
  operation_failed boolean DEFAULT false,

  query_text text,
  query_id text,
  statement_type text,

  rows_affected bigint,
  bytes_read bigint,
  bytes_written bigint,

  sensitive_data_accessed boolean DEFAULT false,
  pii_accessed boolean DEFAULT false,

  unusual_access boolean DEFAULT false,
  unusual_time boolean DEFAULT false,
  unusual_user boolean DEFAULT false,

  risk_score numeric(5,2) DEFAULT 0,
  risk_indicators jsonb DEFAULT '[]'::jsonb,

  alert_generated boolean DEFAULT false,
  alert_severity text,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_uc_audit_workspace ON unity_catalog_audit_events(workspace_id);
CREATE INDEX idx_uc_audit_time ON unity_catalog_audit_events(event_time DESC);
CREATE INDEX idx_uc_audit_date ON unity_catalog_audit_events(event_date DESC);
CREATE INDEX idx_uc_audit_user ON unity_catalog_audit_events(user_email);
CREATE INDEX idx_uc_audit_action ON unity_catalog_audit_events(action_name);
CREATE INDEX idx_uc_audit_object_type ON unity_catalog_audit_events(object_type);
CREATE INDEX idx_uc_audit_operation ON unity_catalog_audit_events(operation_type);
CREATE INDEX idx_uc_audit_catalog ON unity_catalog_audit_events(catalog_name);
CREATE INDEX idx_uc_audit_table ON unity_catalog_audit_events(schema_name, table_name);
CREATE INDEX idx_uc_audit_permission ON unity_catalog_audit_events(permission_change);
CREATE INDEX idx_uc_audit_data_access ON unity_catalog_audit_events(data_access);
CREATE INDEX idx_uc_audit_risk ON unity_catalog_audit_events(risk_score DESC);
CREATE INDEX idx_uc_audit_unusual ON unity_catalog_audit_events(unusual_access);

-- Unity Catalog Permission Changes (privilege escalation tracking)
CREATE TABLE IF NOT EXISTS unity_catalog_permission_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  change_id text UNIQUE NOT NULL,

  audit_event_id uuid REFERENCES unity_catalog_audit_events(id) ON DELETE CASCADE,

  workspace_id text NOT NULL,
  change_time timestamptz NOT NULL,

  changed_by_user text NOT NULL,
  changed_by_email text,

  change_type text CHECK (change_type IN ('GRANT', 'REVOKE', 'ROLE_ASSIGNMENT', 'GROUP_MEMBERSHIP', 'OWNER_CHANGE')) NOT NULL,

  object_type text NOT NULL,
  object_name text NOT NULL,
  catalog_name text,
  schema_name text,

  principal_type text CHECK (principal_type IN ('USER', 'SERVICE_PRINCIPAL', 'GROUP')) NOT NULL,
  principal_name text NOT NULL,
  principal_email text,

  privileges_before text[],
  privileges_after text[],

  privileges_added text[],
  privileges_removed text[],

  privilege_level text CHECK (privilege_level IN ('CATALOG_ADMIN', 'SCHEMA_ADMIN', 'TABLE_ADMIN', 'READ', 'WRITE', 'EXECUTE', 'CREATE', 'MODIFY', 'USE_CATALOG', 'USE_SCHEMA', 'SELECT', 'ALL_PRIVILEGES')),

  escalation_detected boolean DEFAULT false,
  escalation_type text,

  admin_privilege_granted boolean DEFAULT false,
  ownership_transferred boolean DEFAULT false,

  approved_change boolean DEFAULT false,
  approval_ticket text,

  reverted boolean DEFAULT false,
  revert_time timestamptz,

  risk_score numeric(5,2) DEFAULT 0,
  risk_reason text,

  alert_generated boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_uc_perm_workspace ON unity_catalog_permission_changes(workspace_id);
CREATE INDEX idx_uc_perm_time ON unity_catalog_permission_changes(change_time DESC);
CREATE INDEX idx_uc_perm_user ON unity_catalog_permission_changes(changed_by_email);
CREATE INDEX idx_uc_perm_principal ON unity_catalog_permission_changes(principal_name);
CREATE INDEX idx_uc_perm_type ON unity_catalog_permission_changes(change_type);
CREATE INDEX idx_uc_perm_escalation ON unity_catalog_permission_changes(escalation_detected);
CREATE INDEX idx_uc_perm_admin ON unity_catalog_permission_changes(admin_privilege_granted);
CREATE INDEX idx_uc_perm_risk ON unity_catalog_permission_changes(risk_score DESC);

-- Unity Catalog Data Access (query-level monitoring)
CREATE TABLE IF NOT EXISTS unity_catalog_data_access (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  access_id text UNIQUE NOT NULL,

  audit_event_id uuid REFERENCES unity_catalog_audit_events(id) ON DELETE CASCADE,

  workspace_id text NOT NULL,
  access_time timestamptz NOT NULL,

  user_email text NOT NULL,
  user_name text,
  user_type text CHECK (user_type IN ('human', 'service_principal', 'system')),

  query_id text,
  query_text text,
  statement_type text CHECK (statement_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE', 'MERGE', 'COPY', 'CREATE', 'ALTER', 'DROP')),

  catalog_name text NOT NULL,
  schema_name text NOT NULL,
  tables_accessed text[],
  columns_accessed text[],

  rows_read bigint DEFAULT 0,
  bytes_read bigint DEFAULT 0,
  rows_written bigint DEFAULT 0,
  bytes_written bigint DEFAULT 0,

  execution_time_ms integer,

  source_ip inet,
  source_type text CHECK (source_type IN ('notebook', 'sql_warehouse', 'job', 'api', 'dbconnect', 'unknown')),

  sensitive_columns_accessed text[],
  pii_columns_accessed text[],
  pii_accessed boolean DEFAULT false,

  data_classification text CHECK (data_classification IN ('public', 'internal', 'confidential', 'restricted', 'pii', 'phi')),

  data_exported boolean DEFAULT false,
  export_destination text,

  access_outside_business_hours boolean DEFAULT false,
  first_time_access boolean DEFAULT false,
  unusual_table_access boolean DEFAULT false,
  unusual_volume boolean DEFAULT false,

  baseline_deviation_score numeric(5,2) DEFAULT 0,

  row_filters_applied jsonb DEFAULT '[]'::jsonb,
  column_masks_applied jsonb DEFAULT '[]'::jsonb,

  policy_violations text[],

  risk_score numeric(5,2) DEFAULT 0,
  risk_indicators jsonb DEFAULT '[]'::jsonb,

  alert_generated boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_uc_data_workspace ON unity_catalog_data_access(workspace_id);
CREATE INDEX idx_uc_data_time ON unity_catalog_data_access(access_time DESC);
CREATE INDEX idx_uc_data_user ON unity_catalog_data_access(user_email);
CREATE INDEX idx_uc_data_catalog ON unity_catalog_data_access(catalog_name);
CREATE INDEX idx_uc_data_schema ON unity_catalog_data_access(schema_name);
CREATE INDEX idx_uc_data_tables ON unity_catalog_data_access USING GIN(tables_accessed);
CREATE INDEX idx_uc_data_pii ON unity_catalog_data_access(pii_accessed);
CREATE INDEX idx_uc_data_export ON unity_catalog_data_access(data_exported);
CREATE INDEX idx_uc_data_unusual ON unity_catalog_data_access(unusual_table_access);
CREATE INDEX idx_uc_data_risk ON unity_catalog_data_access(risk_score DESC);

-- Unity Catalog Lineage Events (data flow tracking)
CREATE TABLE IF NOT EXISTS unity_catalog_lineage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lineage_id text UNIQUE NOT NULL,

  workspace_id text NOT NULL,
  event_time timestamptz NOT NULL,

  operation text CHECK (operation IN ('CREATE', 'UPDATE', 'APPEND', 'OVERWRITE', 'MERGE', 'DELETE')) NOT NULL,

  source_catalog text,
  source_schema text,
  source_tables text[],

  target_catalog text NOT NULL,
  target_schema text NOT NULL,
  target_table text NOT NULL,

  transformation_type text CHECK (transformation_type IN ('ETL', 'ELT', 'COPY', 'TRANSFORM', 'AGGREGATE', 'JOIN', 'FILTER', 'PROJECTION')),

  job_id text,
  job_name text,
  notebook_path text,
  query_id text,

  created_by_user text,
  created_by_email text,

  upstream_tables text[],
  downstream_tables text[],

  columns_lineage jsonb,

  rows_processed bigint,
  bytes_processed bigint,

  compliance_tags text[],
  sensitivity_inherited boolean DEFAULT false,

  cross_catalog_flow boolean DEFAULT false,
  cross_workspace_flow boolean DEFAULT false,

  unauthorized_lineage boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_uc_lineage_workspace ON unity_catalog_lineage_events(workspace_id);
CREATE INDEX idx_uc_lineage_time ON unity_catalog_lineage_events(event_time DESC);
CREATE INDEX idx_uc_lineage_source ON unity_catalog_lineage_events USING GIN(source_tables);
CREATE INDEX idx_uc_lineage_target ON unity_catalog_lineage_events(target_catalog, target_schema, target_table);
CREATE INDEX idx_uc_lineage_cross_catalog ON unity_catalog_lineage_events(cross_catalog_flow);
CREATE INDEX idx_uc_lineage_unauthorized ON unity_catalog_lineage_events(unauthorized_lineage);

-- Unity Catalog Policy Violations (access policy breaches)
CREATE TABLE IF NOT EXISTS unity_catalog_policy_violations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  violation_id text UNIQUE NOT NULL,

  workspace_id text NOT NULL,
  violation_time timestamptz NOT NULL,

  violation_type text CHECK (violation_type IN ('ROW_FILTER_BYPASS', 'COLUMN_MASK_BYPASS', 'UNAUTHORIZED_ACCESS', 'PERMISSION_DENIED', 'POLICY_DISABLED', 'ADMIN_OVERRIDE')) NOT NULL,

  user_email text NOT NULL,
  user_name text,

  catalog_name text NOT NULL,
  schema_name text NOT NULL,
  table_name text,

  policy_name text,
  policy_type text CHECK (policy_type IN ('ROW_FILTER', 'COLUMN_MASK', 'ACCESS_POLICY')),

  attempted_action text,
  denied boolean DEFAULT true,

  override_used boolean DEFAULT false,
  override_reason text,

  row_filter_bypassed boolean DEFAULT false,
  column_mask_bypassed boolean DEFAULT false,

  sensitive_data_exposed boolean DEFAULT false,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'medium',

  investigation_status text CHECK (investigation_status IN ('new', 'investigating', 'confirmed', 'false_positive', 'closed')) DEFAULT 'new',

  alert_sent boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_uc_policy_workspace ON unity_catalog_policy_violations(workspace_id);
CREATE INDEX idx_uc_policy_time ON unity_catalog_policy_violations(violation_time DESC);
CREATE INDEX idx_uc_policy_user ON unity_catalog_policy_violations(user_email);
CREATE INDEX idx_uc_policy_type ON unity_catalog_policy_violations(violation_type);
CREATE INDEX idx_uc_policy_table ON unity_catalog_policy_violations(catalog_name, schema_name, table_name);
CREATE INDEX idx_uc_policy_severity ON unity_catalog_policy_violations(severity);
CREATE INDEX idx_uc_policy_bypass ON unity_catalog_policy_violations(row_filter_bypassed);

-- Unity Catalog Data Exfiltration (large data movement detection)
CREATE TABLE IF NOT EXISTS unity_catalog_data_exfiltration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exfiltration_id text UNIQUE NOT NULL,

  workspace_id text NOT NULL,
  detection_time timestamptz NOT NULL,

  user_email text NOT NULL,
  user_name text,

  exfiltration_type text CHECK (exfiltration_type IN ('LARGE_DOWNLOAD', 'BULK_EXPORT', 'CROSS_WORKSPACE_COPY', 'EXTERNAL_LOCATION_WRITE', 'UNTRACKED_EXPORT', 'API_MASS_QUERY')) NOT NULL,

  catalog_name text NOT NULL,
  schema_name text NOT NULL,
  tables_accessed text[],

  total_rows_extracted bigint NOT NULL,
  total_bytes_extracted bigint NOT NULL,

  extraction_method text CHECK (extraction_method IN ('SQL_QUERY', 'NOTEBOOK', 'DBCONNECT', 'REST_API', 'JDBC', 'ODBC', 'DELTA_SHARING')),

  destination_type text CHECK (destination_type IN ('local_download', 'external_storage', 'another_workspace', 'external_table', 'share', 'unknown')),
  destination_path text,

  query_ids text[],
  queries_executed integer DEFAULT 1,

  time_window_minutes integer,

  sensitive_data_included boolean DEFAULT false,
  pii_included boolean DEFAULT false,

  unusual_time boolean DEFAULT false,
  unusual_volume boolean DEFAULT true,
  unusual_destination boolean DEFAULT false,

  baseline_deviation_percent numeric(5,2),

  correlated_events jsonb DEFAULT '[]'::jsonb,

  severity text CHECK (severity IN ('critical', 'high', 'medium', 'low')) DEFAULT 'high',

  investigation_status text CHECK (investigation_status IN ('detected', 'investigating', 'confirmed_breach', 'confirmed_legitimate', 'mitigated')) DEFAULT 'detected',

  incident_created boolean DEFAULT false,
  incident_id uuid,

  alert_sent boolean DEFAULT false,

  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_uc_exfil_workspace ON unity_catalog_data_exfiltration(workspace_id);
CREATE INDEX idx_uc_exfil_time ON unity_catalog_data_exfiltration(detection_time DESC);
CREATE INDEX idx_uc_exfil_user ON unity_catalog_data_exfiltration(user_email);
CREATE INDEX idx_uc_exfil_type ON unity_catalog_data_exfiltration(exfiltration_type);
CREATE INDEX idx_uc_exfil_catalog ON unity_catalog_data_exfiltration(catalog_name);
CREATE INDEX idx_uc_exfil_severity ON unity_catalog_data_exfiltration(severity);
CREATE INDEX idx_uc_exfil_sensitive ON unity_catalog_data_exfiltration(sensitive_data_included);
CREATE INDEX idx_uc_exfil_status ON unity_catalog_data_exfiltration(investigation_status);

-- Enable RLS
ALTER TABLE unity_catalog_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE unity_catalog_permission_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE unity_catalog_data_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE unity_catalog_lineage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE unity_catalog_policy_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE unity_catalog_data_exfiltration ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Auth users read uc audit" ON unity_catalog_audit_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert uc audit" ON unity_catalog_audit_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read uc perms" ON unity_catalog_permission_changes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage uc perms" ON unity_catalog_permission_changes FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read uc access" ON unity_catalog_data_access FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert uc access" ON unity_catalog_data_access FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read uc lineage" ON unity_catalog_lineage_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users insert uc lineage" ON unity_catalog_lineage_events FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Auth users read uc violations" ON unity_catalog_policy_violations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage uc violations" ON unity_catalog_policy_violations FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Auth users read uc exfil" ON unity_catalog_data_exfiltration FOR SELECT TO authenticated USING (true);
CREATE POLICY "Auth users manage uc exfil" ON unity_catalog_data_exfiltration FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- RLS Policies for anon (demo access)
CREATE POLICY "Anon read uc audit" ON unity_catalog_audit_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read uc perms" ON unity_catalog_permission_changes FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read uc access" ON unity_catalog_data_access FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read uc lineage" ON unity_catalog_lineage_events FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read uc violations" ON unity_catalog_policy_violations FOR SELECT TO anon USING (true);
CREATE POLICY "Anon read uc exfil" ON unity_catalog_data_exfiltration FOR SELECT TO anon USING (true);
