/*
  # ZeroBus, LakeBase & Brickstore Infrastructure

  1. New Tables
    - zerobus_commits: Direct commit tracking (reduces latency to 10 sec)
    - lakebase_sync_jobs: Delta to RDBMS sync for low-latency apps
    - brickstore_cache: Key-value cache for point lookups (<10ms)
    - data_optimization_jobs: Z-Order and vacuum operations
    - partition_metadata: Table partitioning information

  2. Features
    - 10-second data commits (vs minutes)
    - <10ms point lookups
    - Sub-100ms OLTP queries
    - Automatic data optimization

  3. Security
    - RLS enabled
*/

-- ZeroBus Direct Commits (Bypasses message queue)
CREATE TABLE IF NOT EXISTS zerobus_commits (
  id BIGSERIAL PRIMARY KEY,
  commit_id TEXT UNIQUE NOT NULL,
  target_table TEXT NOT NULL,
  commit_type TEXT CHECK (commit_type IN ('insert', 'update', 'merge', 'delete')) DEFAULT 'insert',
  record_count INTEGER,
  data_size_bytes BIGINT,
  commit_latency_ms NUMERIC(10,2),
  bypass_queue BOOLEAN DEFAULT true,
  commit_timestamp TIMESTAMPTZ DEFAULT now(),
  source_pipeline TEXT,
  partition_info JSONB,
  success BOOLEAN DEFAULT true,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_zerobus_table ON zerobus_commits(target_table);
CREATE INDEX IF NOT EXISTS idx_zerobus_timestamp ON zerobus_commits(commit_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_zerobus_latency ON zerobus_commits(commit_latency_ms);

-- LakeBase Sync Jobs (Delta → Managed Postgres for apps)
CREATE TABLE IF NOT EXISTS lakebase_sync_jobs (
  id BIGSERIAL PRIMARY KEY,
  sync_job_id TEXT UNIQUE NOT NULL,
  source_table TEXT NOT NULL,
  target_table TEXT NOT NULL,
  sync_type TEXT CHECK (sync_type IN ('full', 'incremental', 'cdc')) DEFAULT 'incremental',
  sync_frequency TEXT CHECK (sync_frequency IN ('real_time', 'every_minute', 'every_5_minutes', 'hourly')),
  last_sync_at TIMESTAMPTZ,
  next_sync_at TIMESTAMPTZ,
  records_synced BIGINT DEFAULT 0,
  sync_latency_ms NUMERIC(10,2),
  status TEXT CHECK (status IN ('active', 'paused', 'failed')) DEFAULT 'active',
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lakebase_source ON lakebase_sync_jobs(source_table);
CREATE INDEX IF NOT EXISTS idx_lakebase_status ON lakebase_sync_jobs(status);
CREATE INDEX IF NOT EXISTS idx_lakebase_next_sync ON lakebase_sync_jobs(next_sync_at);

-- Pre-populate LakeBase sync jobs for critical tables
INSERT INTO lakebase_sync_jobs (sync_job_id, source_table, target_table, sync_type, sync_frequency, next_sync_at, status) VALUES
('sync_alerts_to_lakebase', 'alerts', 'lakebase_alerts', 'cdc', 'real_time', now(), 'active'),
('sync_events_to_lakebase', 'events', 'lakebase_events', 'incremental', 'every_minute', now(), 'active'),
('sync_threats_to_lakebase', 'threat_feeds', 'lakebase_threats', 'incremental', 'every_5_minutes', now(), 'active'),
('sync_cases_to_lakebase', 'cases', 'lakebase_cases', 'cdc', 'real_time', now(), 'active')
ON CONFLICT (sync_job_id) DO NOTHING;

-- Brickstore Cache (Key-Value for <10ms lookups)
CREATE TABLE IF NOT EXISTS brickstore_cache (
  id BIGSERIAL PRIMARY KEY,
  cache_key TEXT UNIQUE NOT NULL,
  cache_namespace TEXT,
  value_data JSONB NOT NULL,
  value_size_bytes INTEGER,
  ttl_seconds INTEGER DEFAULT 3600,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '1 hour',
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  hit_rate NUMERIC(5,4)
);

CREATE INDEX IF NOT EXISTS idx_brickstore_namespace ON brickstore_cache(cache_namespace);
CREATE INDEX IF NOT EXISTS idx_brickstore_expires ON brickstore_cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_brickstore_key ON brickstore_cache(cache_key);

-- Data Optimization Jobs (Z-Order, Vacuum, Optimize)
CREATE TABLE IF NOT EXISTS data_optimization_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_id TEXT UNIQUE NOT NULL,
  target_table TEXT NOT NULL,
  optimization_type TEXT CHECK (optimization_type IN ('z_order', 'vacuum', 'optimize', 'compact', 'analyze')) NOT NULL,
  z_order_columns TEXT[],
  vacuum_days_trailing INTEGER DEFAULT 7,
  schedule TEXT CHECK (schedule IN ('every_4_hours', 'daily', 'weekly', 'on_demand')) DEFAULT 'every_4_hours',
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  files_processed INTEGER,
  bytes_processed BIGINT,
  space_saved_bytes BIGINT,
  status TEXT CHECK (status IN ('scheduled', 'running', 'completed', 'failed')) DEFAULT 'scheduled',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_optimization_table ON data_optimization_jobs(target_table);
CREATE INDEX IF NOT EXISTS idx_optimization_type ON data_optimization_jobs(optimization_type);
CREATE INDEX IF NOT EXISTS idx_optimization_next_run ON data_optimization_jobs(next_run_at);

-- Pre-populate optimization schedules
INSERT INTO data_optimization_jobs (job_id, target_table, optimization_type, z_order_columns, schedule, next_run_at) VALUES
('optimize_events_table', 'events', 'z_order', ARRAY['timestamp', 'source_ip', 'event_type'], 'every_4_hours', now() + interval '4 hours'),
('vacuum_events_table', 'events', 'vacuum', NULL, 'daily', now() + interval '1 day'),
('optimize_alerts_table', 'alerts', 'z_order', ARRAY['created_at', 'severity', 'status'], 'every_4_hours', now() + interval '4 hours'),
('optimize_threats_table', 'threat_feeds', 'z_order', ARRAY['timestamp', 'threat_type', 'confidence'], 'every_4_hours', now() + interval '4 hours')
ON CONFLICT (job_id) DO NOTHING;

-- Partition Metadata (15 PB tables need partitioning)
CREATE TABLE IF NOT EXISTS partition_metadata (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL,
  partition_strategy TEXT CHECK (partition_strategy IN ('date', 'event_type', 'hash', 'range', 'list')),
  partition_column TEXT,
  partition_count INTEGER,
  partition_size_avg_gb NUMERIC(10,2),
  largest_partition_gb NUMERIC(10,2),
  smallest_partition_gb NUMERIC(10,2),
  total_size_gb NUMERIC(10,2),
  retention_days INTEGER,
  auto_drop_old_partitions BOOLEAN DEFAULT true,
  last_maintenance_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(table_name, partition_strategy)
);

-- Pre-populate partition info
INSERT INTO partition_metadata (table_name, partition_strategy, partition_column, partition_count, total_size_gb, retention_days) VALUES
('events', 'date', 'timestamp', 365, 1500.0, 365),
('events', 'event_type', 'event_type', 50, 1500.0, 365),
('alerts', 'date', 'created_at', 180, 50.0, 180),
('threat_feeds', 'date', 'timestamp', 90, 25.0, 90)
ON CONFLICT (table_name, partition_strategy) DO NOTHING;

-- Query Performance Stats
CREATE TABLE IF NOT EXISTS query_performance_stats (
  id BIGSERIAL PRIMARY KEY,
  query_hash TEXT,
  query_text TEXT,
  table_names TEXT[],
  execution_time_ms NUMERIC(10,2),
  rows_scanned BIGINT,
  rows_returned INTEGER,
  cache_hit BOOLEAN,
  used_index BOOLEAN,
  optimization_applied TEXT,
  executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_query_perf_time ON query_performance_stats(execution_time_ms DESC);
CREATE INDEX IF NOT EXISTS idx_query_perf_executed ON query_performance_stats(executed_at DESC);

-- Low Latency Query Routing
CREATE TABLE IF NOT EXISTS query_routing_rules (
  id BIGSERIAL PRIMARY KEY,
  rule_name TEXT UNIQUE NOT NULL,
  query_pattern TEXT,
  source_type TEXT CHECK (source_type IN ('delta_lake', 'lakebase', 'brickstore', 'lucene')),
  latency_requirement_ms INTEGER,
  priority INTEGER DEFAULT 100,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO query_routing_rules (rule_name, query_pattern, source_type, latency_requirement_ms) VALUES
('point_lookup_to_brickstore', 'SELECT.*WHERE.*=.*LIMIT 1', 'brickstore', 10),
('full_text_to_lucene', 'SELECT.*LIKE.*OR.*ILIKE', 'lucene', 100),
('real_time_to_lakebase', 'SELECT.*FROM (alerts|cases|events).*ORDER BY.*DESC LIMIT', 'lakebase', 50),
('analytics_to_delta', 'SELECT.*GROUP BY.*HAVING', 'delta_lake', 1000)
ON CONFLICT (rule_name) DO NOTHING;

-- Enable RLS
ALTER TABLE zerobus_commits ENABLE ROW LEVEL SECURITY;
ALTER TABLE lakebase_sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE brickstore_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_optimization_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE partition_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_performance_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_routing_rules ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow authenticated read zerobus" ON zerobus_commits FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read lakebase_sync" ON lakebase_sync_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated all brickstore" ON brickstore_cache FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow authenticated read optimization" ON data_optimization_jobs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated read partitions" ON partition_metadata FOR SELECT TO authenticated USING (true);
CREATE POLICY "Allow authenticated insert perf_stats" ON query_performance_stats FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Allow authenticated read routing" ON query_routing_rules FOR SELECT TO authenticated USING (true);

-- Anon policies
CREATE POLICY "Allow anon read optimization" ON data_optimization_jobs FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon read partitions" ON partition_metadata FOR SELECT TO anon USING (true);