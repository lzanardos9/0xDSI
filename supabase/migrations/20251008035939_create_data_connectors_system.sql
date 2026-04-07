/*
  # Data Connectors System

  1. Purpose
    Comprehensive data ingestion platform supporting multiple connector types
    including DPI, network taps, SIEM integrations, cloud APIs, and advanced
    bytecode weaving instrumentation for application-level monitoring.

  2. Tables Created
    - data_connectors: Connector configurations and status
    - connector_telemetry: Real-time metrics and health data
    - bytecode_instrumentation: Bytecode weaving configurations
    - intercepted_functions: Function interception data
    - string_intercepts: Intercepted string data between functions
    - memory_snapshots: Runtime memory analysis
    - stack_traces: Call stack captures
    - connector_events: Event stream from all connectors
    - connector_alerts: Anomalies and alerts from connectors

  3. Connector Types
    - DPI (Deep Packet Inspection)
    - Network TAP/SPAN
    - Syslog/CEF
    - Cloud APIs (AWS, Azure, GCP)
    - SIEM Integration (Splunk, QRadar, Sentinel)
    - Agent-based collectors
    - Bytecode Weaving (JVM, .NET, Python)
    - eBPF kernel probes
    - API webhooks

  4. Security
    - RLS enabled with anonymous read access
*/

-- Data Connectors Configuration
CREATE TABLE IF NOT EXISTS data_connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_name text NOT NULL,
  connector_type text NOT NULL,
  connector_category text NOT NULL, -- network, application, cloud, siem, instrumentation
  protocol text,
  endpoint text,
  port integer,
  authentication_method text,
  status text DEFAULT 'active',
  health_status text DEFAULT 'healthy', -- healthy, degraded, unhealthy, offline
  data_rate_mbps numeric(10,2) DEFAULT 0,
  events_per_second numeric(10,2) DEFAULT 0,
  total_events_received bigint DEFAULT 0,
  bytes_received bigint DEFAULT 0,
  last_event_timestamp timestamptz,
  uptime_percent numeric(5,2) DEFAULT 100.0,
  error_count integer DEFAULT 0,
  configuration jsonb DEFAULT '{}'::jsonb,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_connector_type CHECK (connector_type IN (
    'dpi', 'network_tap', 'span_mirror', 'syslog', 'cef', 'leef',
    'aws_cloudtrail', 'azure_monitor', 'gcp_logging',
    'splunk', 'qradar', 'sentinel', 'elastic',
    'agent_collector', 'bytecode_weaving', 'ebpf', 'api_webhook',
    'kafka', 'sqs', 'rabbitmq', 'custom'
  )),
  CONSTRAINT valid_status CHECK (status IN ('active', 'paused', 'stopped', 'error', 'configuring')),
  CONSTRAINT valid_health CHECK (health_status IN ('healthy', 'degraded', 'unhealthy', 'offline'))
);

-- Connector Telemetry
CREATE TABLE IF NOT EXISTS connector_telemetry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  cpu_usage_percent numeric(5,2),
  memory_usage_mb numeric(10,2),
  network_throughput_mbps numeric(10,2),
  events_processed integer,
  events_dropped integer,
  errors_count integer,
  latency_ms numeric(10,3),
  queue_depth integer,
  buffer_usage_percent numeric(5,2),
  connection_state text,
  metrics jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Bytecode Instrumentation Configuration
CREATE TABLE IF NOT EXISTS bytecode_instrumentation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  application_name text NOT NULL,
  runtime_type text NOT NULL, -- jvm, dotnet, python, nodejs, ruby
  instrumentation_level text DEFAULT 'method', -- method, class, package, bytecode
  weaving_technique text NOT NULL, -- compile_time, load_time, runtime, dynamic
  target_packages jsonb DEFAULT '[]'::jsonb,
  target_classes jsonb DEFAULT '[]'::jsonb,
  target_methods jsonb DEFAULT '[]'::jsonb,
  intercept_strings boolean DEFAULT true,
  intercept_parameters boolean DEFAULT true,
  intercept_return_values boolean DEFAULT true,
  capture_stack_traces boolean DEFAULT true,
  capture_memory_snapshots boolean DEFAULT false,
  sampling_rate numeric(5,2) DEFAULT 100.0,
  max_string_length integer DEFAULT 1024,
  filter_patterns jsonb DEFAULT '[]'::jsonb,
  active boolean DEFAULT true,
  agent_version text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_runtime CHECK (runtime_type IN ('jvm', 'dotnet', 'python', 'nodejs', 'ruby', 'go')),
  CONSTRAINT valid_weaving CHECK (weaving_technique IN ('compile_time', 'load_time', 'runtime', 'dynamic', 'aop'))
);

-- Intercepted Functions
CREATE TABLE IF NOT EXISTS intercepted_functions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumentation_id uuid NOT NULL REFERENCES bytecode_instrumentation(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  thread_id text NOT NULL,
  class_name text NOT NULL,
  method_name text NOT NULL,
  method_signature text,
  execution_time_ns bigint,
  entry_timestamp timestamptz,
  exit_timestamp timestamptz,
  parameters jsonb DEFAULT '[]'::jsonb,
  return_value text,
  exception_thrown text,
  caller_class text,
  caller_method text,
  invocation_depth integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- String Intercepts
CREATE TABLE IF NOT EXISTS string_intercepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumentation_id uuid NOT NULL REFERENCES bytecode_instrumentation(id) ON DELETE CASCADE,
  function_call_id uuid REFERENCES intercepted_functions(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  source_class text NOT NULL,
  source_method text NOT NULL,
  target_class text,
  target_method text,
  string_value text NOT NULL,
  string_type text, -- parameter, return, field_access, concat, manipulation
  string_length integer,
  is_sensitive boolean DEFAULT false,
  contains_credentials boolean DEFAULT false,
  contains_pii boolean DEFAULT false,
  encryption_detected boolean DEFAULT false,
  encoding_detected text,
  pattern_matches jsonb DEFAULT '[]'::jsonb,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Memory Snapshots
CREATE TABLE IF NOT EXISTS memory_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumentation_id uuid NOT NULL REFERENCES bytecode_instrumentation(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  thread_id text NOT NULL,
  heap_used_mb numeric(10,2),
  heap_max_mb numeric(10,2),
  heap_usage_percent numeric(5,2),
  non_heap_used_mb numeric(10,2),
  gc_count integer,
  gc_time_ms bigint,
  thread_count integer,
  loaded_classes integer,
  object_allocations jsonb DEFAULT '[]'::jsonb,
  hot_objects jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Stack Traces
CREATE TABLE IF NOT EXISTS stack_traces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instrumentation_id uuid NOT NULL REFERENCES bytecode_instrumentation(id) ON DELETE CASCADE,
  function_call_id uuid REFERENCES intercepted_functions(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  thread_id text NOT NULL,
  thread_name text,
  thread_state text,
  frames jsonb NOT NULL DEFAULT '[]'::jsonb,
  depth integer,
  is_blocked boolean DEFAULT false,
  lock_info jsonb DEFAULT '{}'::jsonb,
  cpu_time_ms bigint,
  created_at timestamptz DEFAULT now()
);

-- Connector Events (Unified event stream)
CREATE TABLE IF NOT EXISTS connector_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  timestamp timestamptz NOT NULL,
  event_type text NOT NULL,
  event_category text,
  source_ip inet,
  dest_ip inet,
  source_port integer,
  dest_port integer,
  protocol text,
  raw_data text,
  parsed_data jsonb DEFAULT '{}'::jsonb,
  severity text,
  tags jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Connector Alerts
CREATE TABLE IF NOT EXISTS connector_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connector_id uuid NOT NULL REFERENCES data_connectors(id) ON DELETE CASCADE,
  alert_type text NOT NULL, -- health, anomaly, security, performance
  severity text NOT NULL,
  title text NOT NULL,
  description text,
  metric_name text,
  threshold_value numeric,
  actual_value numeric,
  alert_timestamp timestamptz DEFAULT now(),
  acknowledged boolean DEFAULT false,
  resolved boolean DEFAULT false,
  resolution_notes text,
  created_at timestamptz DEFAULT now(),
  CONSTRAINT valid_alert_severity CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connectors_type ON data_connectors(connector_type);
CREATE INDEX IF NOT EXISTS idx_connectors_status ON data_connectors(status);
CREATE INDEX IF NOT EXISTS idx_telemetry_connector_id ON connector_telemetry(connector_id);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON connector_telemetry(timestamp);
CREATE INDEX IF NOT EXISTS idx_bytecode_connector_id ON bytecode_instrumentation(connector_id);
CREATE INDEX IF NOT EXISTS idx_intercepted_functions_instrumentation ON intercepted_functions(instrumentation_id);
CREATE INDEX IF NOT EXISTS idx_intercepted_functions_timestamp ON intercepted_functions(timestamp);
CREATE INDEX IF NOT EXISTS idx_string_intercepts_instrumentation ON string_intercepts(instrumentation_id);
CREATE INDEX IF NOT EXISTS idx_string_intercepts_timestamp ON string_intercepts(timestamp);
CREATE INDEX IF NOT EXISTS idx_memory_snapshots_instrumentation ON memory_snapshots(instrumentation_id);
CREATE INDEX IF NOT EXISTS idx_stack_traces_instrumentation ON stack_traces(instrumentation_id);
CREATE INDEX IF NOT EXISTS idx_connector_events_connector_id ON connector_events(connector_id);
CREATE INDEX IF NOT EXISTS idx_connector_events_timestamp ON connector_events(timestamp);
CREATE INDEX IF NOT EXISTS idx_connector_alerts_connector_id ON connector_alerts(connector_id);

-- Enable RLS
ALTER TABLE data_connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE bytecode_instrumentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE intercepted_functions ENABLE ROW LEVEL SECURITY;
ALTER TABLE string_intercepts ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE stack_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE connector_alerts ENABLE ROW LEVEL SECURITY;

-- Anonymous read policies
CREATE POLICY "Allow anonymous read connectors" ON data_connectors FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read telemetry" ON connector_telemetry FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read bytecode" ON bytecode_instrumentation FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read functions" ON intercepted_functions FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read strings" ON string_intercepts FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read memory" ON memory_snapshots FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read stacks" ON stack_traces FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read events" ON connector_events FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anonymous read alerts" ON connector_alerts FOR SELECT TO anon USING (true);