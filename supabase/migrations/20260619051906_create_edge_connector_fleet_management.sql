-- Edge Collector Fleet Management
-- Manages deployed edge collectors, their configurations, and heartbeats

-- Deployments table: tracks each deployed edge collector instance
CREATE TABLE IF NOT EXISTS edge_deployments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id text NOT NULL UNIQUE,
  agent_name text NOT NULL,
  site text NOT NULL DEFAULT 'default',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'degraded', 'offline', 'error')),
  version text NOT NULL DEFAULT '0.1.0',
  arch text NOT NULL DEFAULT 'x86_64-linux',
  ip_address text,
  hostname text,
  last_heartbeat timestamptz,
  uptime_secs bigint DEFAULT 0,
  events_collected bigint DEFAULT 0,
  events_shipped bigint DEFAULT 0,
  buffer_usage_mb numeric DEFAULT 0,
  cpu_percent numeric DEFAULT 0,
  memory_mb numeric DEFAULT 0,
  transport_kind text DEFAULT 'kafka',
  install_token text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Connector configurations: each connector enabled on a deployment
CREATE TABLE IF NOT EXISTS edge_connector_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid REFERENCES edge_deployments(id) ON DELETE CASCADE,
  connector_id text NOT NULL,
  connector_type text NOT NULL,
  connector_name text NOT NULL,
  vendor text NOT NULL,
  category text NOT NULL,
  enabled boolean DEFAULT true,
  protocol text NOT NULL DEFAULT 'REST API',
  poll_interval_secs integer DEFAULT 60,
  batch_size integer DEFAULT 100,
  max_retries integer DEFAULT 3,
  timeout_secs integer DEFAULT 30,
  workers integer DEFAULT 2,
  auth_method text DEFAULT 'api_key' CHECK (auth_method IN ('api_key', 'oauth2', 'mtls', 'basic', 'saml', 'none')),
  auth_config jsonb DEFAULT '{}',
  endpoint text,
  filters jsonb DEFAULT '[]',
  field_mappings jsonb DEFAULT '{}',
  bandwidth_limit_mbps numeric,
  compression text DEFAULT 'zstd',
  queue_strategy text DEFAULT 'persistent' CHECK (queue_strategy IN ('persistent', 'memory', 'hybrid')),
  backpressure_action text DEFAULT 'buffer' CHECK (backpressure_action IN ('buffer', 'drop_oldest', 'pause', 'sample')),
  eps_limit integer,
  sampling_config jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  status text DEFAULT 'configured' CHECK (status IN ('configured', 'active', 'paused', 'error')),
  last_event_at timestamptz,
  events_total bigint DEFAULT 0,
  errors_total bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Heartbeats table: time-series of health checks from edge collectors
CREATE TABLE IF NOT EXISTS edge_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid REFERENCES edge_deployments(id) ON DELETE CASCADE,
  agent_id text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  status text NOT NULL DEFAULT 'healthy',
  cpu_percent numeric,
  memory_mb numeric,
  buffer_usage_mb numeric,
  events_per_sec numeric,
  active_connectors integer,
  error_count integer DEFAULT 0,
  connector_statuses jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}'
);

-- Config push log: tracks when configs are pushed to edge collectors
CREATE TABLE IF NOT EXISTS edge_config_pushes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deployment_id uuid REFERENCES edge_deployments(id) ON DELETE CASCADE,
  pushed_by text,
  config_toml text NOT NULL,
  config_hash text NOT NULL,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'acked', 'applied', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  applied_at timestamptz
);

-- Install tokens for bootstrapping new edge collectors
CREATE TABLE IF NOT EXISTS edge_install_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  site text NOT NULL,
  arch text DEFAULT 'x86_64-linux',
  connectors jsonb DEFAULT '[]',
  transport_config jsonb DEFAULT '{}',
  expires_at timestamptz DEFAULT now() + interval '24 hours',
  used_by_deployment_id uuid REFERENCES edge_deployments(id),
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_edge_deployments_status ON edge_deployments(status);
CREATE INDEX idx_edge_deployments_site ON edge_deployments(site);
CREATE INDEX idx_edge_connector_configs_deployment ON edge_connector_configs(deployment_id);
CREATE INDEX idx_edge_connector_configs_type ON edge_connector_configs(connector_type);
CREATE INDEX idx_edge_heartbeats_deployment ON edge_heartbeats(deployment_id);
CREATE INDEX idx_edge_heartbeats_timestamp ON edge_heartbeats(timestamp DESC);
CREATE INDEX idx_edge_config_pushes_deployment ON edge_config_pushes(deployment_id);

-- RLS
ALTER TABLE edge_deployments ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_connector_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_config_pushes ENABLE ROW LEVEL SECURITY;
ALTER TABLE edge_install_tokens ENABLE ROW LEVEL SECURITY;

-- Allow authenticated + anon access for demo
CREATE POLICY "allow_read_edge_deployments" ON edge_deployments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_insert_edge_deployments" ON edge_deployments FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "allow_update_edge_deployments" ON edge_deployments FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_edge_deployments" ON edge_deployments FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "allow_read_edge_connector_configs" ON edge_connector_configs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_insert_edge_connector_configs" ON edge_connector_configs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "allow_update_edge_connector_configs" ON edge_connector_configs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_edge_connector_configs" ON edge_connector_configs FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "allow_read_edge_heartbeats" ON edge_heartbeats FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_insert_edge_heartbeats" ON edge_heartbeats FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "allow_update_edge_heartbeats" ON edge_heartbeats FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_edge_heartbeats" ON edge_heartbeats FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "allow_read_edge_config_pushes" ON edge_config_pushes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_insert_edge_config_pushes" ON edge_config_pushes FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "allow_update_edge_config_pushes" ON edge_config_pushes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_edge_config_pushes" ON edge_config_pushes FOR DELETE TO anon, authenticated USING (true);

CREATE POLICY "allow_read_edge_install_tokens" ON edge_install_tokens FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "allow_insert_edge_install_tokens" ON edge_install_tokens FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "allow_update_edge_install_tokens" ON edge_install_tokens FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_delete_edge_install_tokens" ON edge_install_tokens FOR DELETE TO anon, authenticated USING (true);

-- Seed demo deployments with realistic data
INSERT INTO edge_deployments (agent_id, agent_name, site, status, version, arch, ip_address, hostname, last_heartbeat, uptime_secs, events_collected, events_shipped, buffer_usage_mb, cpu_percent, memory_mb, transport_kind) VALUES
('edge-nyc-prod-01', '0xDSI Edge NYC Primary', 'nyc-datacenter', 'running', '0.4.2', 'x86_64-linux', '10.0.1.50', 'edge-nyc-01.internal', now() - interval '12 seconds', 864000, 45230000, 45128000, 24, 12.4, 256, 'kafka'),
('edge-nyc-prod-02', '0xDSI Edge NYC Secondary', 'nyc-datacenter', 'running', '0.4.2', 'x86_64-linux', '10.0.1.51', 'edge-nyc-02.internal', now() - interval '8 seconds', 864000, 38100000, 38050000, 18, 9.8, 210, 'kafka'),
('edge-lon-prod-01', '0xDSI Edge London', 'london-dc', 'running', '0.4.1', 'x86_64-linux', '10.1.2.10', 'edge-lon-01.internal', now() - interval '15 seconds', 432000, 22400000, 22350000, 32, 15.2, 312, 'eventhub'),
('edge-sgp-prod-01', '0xDSI Edge Singapore', 'singapore-dc', 'running', '0.4.2', 'aarch64-linux', '10.2.1.5', 'edge-sgp-01.internal', now() - interval '22 seconds', 259200, 15600000, 15580000, 12, 8.1, 180, 'kafka'),
('edge-fra-prod-01', '0xDSI Edge Frankfurt', 'frankfurt-dc', 'degraded', '0.4.0', 'x86_64-linux', '10.3.0.20', 'edge-fra-01.internal', now() - interval '45 seconds', 172800, 12300000, 12100000, 89, 45.2, 480, 'kafka'),
('edge-sao-ot-01', '0xDSI Edge Sao Paulo OT', 'sao-paulo-plant', 'running', '0.4.2', 'armv7-linux', '192.168.10.5', 'edge-sao-ot.internal', now() - interval '5 seconds', 604800, 8900000, 8890000, 8, 22.0, 128, 'http'),
('edge-tok-prod-01', '0xDSI Edge Tokyo', 'tokyo-dc', 'running', '0.4.2', 'x86_64-linux', '10.4.1.30', 'edge-tok-01.internal', now() - interval '10 seconds', 518400, 19800000, 19780000, 15, 11.3, 245, 'kafka'),
('edge-chi-staging', '0xDSI Edge Chicago Staging', 'chicago-staging', 'offline', '0.3.9', 'x86_64-linux', '10.5.0.100', 'edge-chi-stg.internal', now() - interval '2 hours', 0, 520000, 520000, 0, 0, 0, 'kafka');

-- Seed connector configs for NYC primary deployment
INSERT INTO edge_connector_configs (deployment_id, connector_id, connector_type, connector_name, vendor, category, enabled, protocol, poll_interval_secs, endpoint, auth_method, status, events_total) VALUES
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-nyc-prod-01'), 'cs-falcon-01', 'crowdstrike_falcon', 'CrowdStrike Falcon', 'CrowdStrike', 'edr', true, 'Streaming API', 5, 'https://api.crowdstrike.com/sensors/entities/datafeed/v2', 'oauth2', 'active', 12500000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-nyc-prod-01'), 'pa-panorama-01', 'palo_alto_panorama', 'Palo Alto Panorama', 'Palo Alto Networks', 'firewall', true, 'Syslog TLS', 1, 'syslog-tls://10.0.1.50:6514', 'mtls', 'active', 18900000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-nyc-prod-01'), 'splunk-hec-01', 'splunk_hec', 'Splunk HEC Forwarder', 'Splunk', 'siem', true, 'HEC', 10, 'https://splunk.internal:8088/services/collector', 'api_key', 'active', 8200000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-nyc-prod-01'), 'okta-sys-01', 'okta_system_log', 'Okta System Log', 'Okta', 'iam', true, 'REST API', 30, 'https://org.okta.com/api/v1/logs', 'api_key', 'active', 3400000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-nyc-prod-01'), 'aws-ct-01', 'aws_cloudtrail', 'AWS CloudTrail', 'AWS', 'cloud_aws', true, 'SQS/S3', 15, 'sqs://us-east-1/cloudtrail-events', 'oauth2', 'active', 2230000);

-- Seed connector configs for Sao Paulo OT deployment
INSERT INTO edge_connector_configs (deployment_id, connector_id, connector_type, connector_name, vendor, category, enabled, protocol, poll_interval_secs, endpoint, auth_method, status, events_total) VALUES
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-sao-ot-01'), 'modbus-plc-01', 'modbus_tcp', 'Modbus TCP Monitor', '0xDSI', 'plc_ot_protocols', true, 'Modbus/TCP', 1, 'modbus://192.168.10.100:502', 'none', 'active', 4500000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-sao-ot-01'), 's7-siemens-01', 's7comm', 'Siemens S7 Monitor', '0xDSI', 'plc_ot_protocols', true, 'S7comm', 1, 's7://192.168.10.101:102', 'none', 'active', 2200000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-sao-ot-01'), 'dpi-ot-01', 'dpi_engine', 'DPI OT Network', '0xDSI', 'dpi', true, 'Passive TAP', 0, 'tap://eth1', 'none', 'active', 1800000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-sao-ot-01'), 'claroty-01', 'claroty_ctd', 'Claroty CTD', 'Claroty', 'ics_ot', true, 'REST API', 60, 'https://claroty.internal/api/v1', 'api_key', 'active', 400000);

-- Seed connector configs for London deployment
INSERT INTO edge_connector_configs (deployment_id, connector_id, connector_type, connector_name, vendor, category, enabled, protocol, poll_interval_secs, endpoint, auth_method, status, events_total) VALUES
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-lon-prod-01'), 'sentinel-01', 'azure_sentinel', 'Microsoft Sentinel', 'Microsoft', 'siem', true, 'Azure Monitor API', 15, 'https://management.azure.com/subscriptions/xxx/providers/Microsoft.OperationalInsights', 'oauth2', 'active', 9800000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-lon-prod-01'), 'entra-01', 'azure_entra_id', 'Entra ID Audit', 'Microsoft', 'cloud_azure', true, 'Graph API', 30, 'https://graph.microsoft.com/v1.0/auditLogs', 'oauth2', 'active', 5200000),
((SELECT id FROM edge_deployments WHERE agent_id = 'edge-lon-prod-01'), 'darktrace-01', 'darktrace', 'Darktrace Enterprise', 'Darktrace', 'ndr', true, 'REST API', 10, 'https://darktrace.internal/dtapi', 'api_key', 'active', 7400000);
