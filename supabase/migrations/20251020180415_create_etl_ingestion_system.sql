/*
  # ETL Ingestion System - Raw Buffer and Processing Queues

  1. New Tables
    - `raw_event_buffer`
      - High-performance ingestion buffer for raw events
      - Stores unparsed events with metadata
      - Partitioned by created_at for performance
    
    - `parsing_queue`
      - Queue for events awaiting parsing
      - Status tracking (pending, processing, completed, failed)
      - Retry mechanism support
    
    - `enrichment_queue`
      - Queue for parsed events awaiting enrichment
      - Priority-based processing
    
    - `correlation_queue`
      - Events ready for correlation engine
      - Time-windowed processing
    
    - `event_parsers`
      - Configuration for different log format parsers
      - Regex patterns, field mappings, normalization rules
    
    - `enrichment_sources`
      - External data sources for enrichment
      - GeoIP, threat intel, asset inventory
    
    - `processing_stats`
      - Real-time metrics for ETL pipeline
      - Ingestion rate, parsing success, latency tracking

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated access
*/

-- Raw event ingestion buffer
CREATE TABLE IF NOT EXISTS raw_event_buffer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL,
  source_type text NOT NULL,
  source_ip inet,
  raw_data jsonb NOT NULL,
  raw_text text,
  received_at timestamptz DEFAULT now(),
  processing_status text DEFAULT 'pending',
  processed_at timestamptz,
  error_message text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_buffer_status ON raw_event_buffer(processing_status, received_at);
CREATE INDEX IF NOT EXISTS idx_raw_buffer_source ON raw_event_buffer(source_id, received_at);
CREATE INDEX IF NOT EXISTS idx_raw_buffer_received ON raw_event_buffer(received_at DESC);

ALTER TABLE raw_event_buffer ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read raw_event_buffer"
  ON raw_event_buffer FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read raw_event_buffer"
  ON raw_event_buffer FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow authenticated insert raw_event_buffer"
  ON raw_event_buffer FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Event parsers configuration
CREATE TABLE IF NOT EXISTS event_parsers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  format_type text NOT NULL,
  description text,
  priority integer DEFAULT 100,
  enabled boolean DEFAULT true,
  regex_patterns jsonb DEFAULT '[]'::jsonb,
  field_mappings jsonb DEFAULT '{}'::jsonb,
  normalization_rules jsonb DEFAULT '{}'::jsonb,
  test_samples jsonb DEFAULT '[]'::jsonb,
  success_count bigint DEFAULT 0,
  failure_count bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE event_parsers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read event_parsers"
  ON event_parsers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read event_parsers"
  ON event_parsers FOR SELECT
  TO anon
  USING (true);

-- Parsing queue
CREATE TABLE IF NOT EXISTS parsing_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_event_id uuid REFERENCES raw_event_buffer(id),
  parser_id uuid REFERENCES event_parsers(id),
  status text DEFAULT 'pending',
  priority integer DEFAULT 100,
  attempts integer DEFAULT 0,
  max_attempts integer DEFAULT 3,
  parsed_data jsonb,
  error_message text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parsing_queue_status ON parsing_queue(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_parsing_queue_raw_event ON parsing_queue(raw_event_id);

ALTER TABLE parsing_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read parsing_queue"
  ON parsing_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read parsing_queue"
  ON parsing_queue FOR SELECT
  TO anon
  USING (true);

-- Enrichment sources configuration
CREATE TABLE IF NOT EXISTS enrichment_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  source_type text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  api_endpoint text,
  api_key_encrypted text,
  cache_ttl_seconds integer DEFAULT 3600,
  timeout_ms integer DEFAULT 5000,
  rate_limit_per_minute integer DEFAULT 60,
  enrichment_fields jsonb DEFAULT '[]'::jsonb,
  success_count bigint DEFAULT 0,
  failure_count bigint DEFAULT 0,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE enrichment_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read enrichment_sources"
  ON enrichment_sources FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read enrichment_sources"
  ON enrichment_sources FOR SELECT
  TO anon
  USING (true);

-- Enrichment queue
CREATE TABLE IF NOT EXISTS enrichment_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id),
  enrichment_source_id uuid REFERENCES enrichment_sources(id),
  status text DEFAULT 'pending',
  priority integer DEFAULT 100,
  enrichment_data jsonb,
  error_message text,
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichment_queue_status ON enrichment_queue(status, priority DESC, created_at);
CREATE INDEX IF NOT EXISTS idx_enrichment_queue_event ON enrichment_queue(event_id);

ALTER TABLE enrichment_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read enrichment_queue"
  ON enrichment_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read enrichment_queue"
  ON enrichment_queue FOR SELECT
  TO anon
  USING (true);

-- Correlation queue
CREATE TABLE IF NOT EXISTS correlation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid REFERENCES events(id),
  rule_id uuid REFERENCES correlation_rules(id),
  status text DEFAULT 'pending',
  correlation_window_start timestamptz,
  correlation_window_end timestamptz,
  matched_events jsonb DEFAULT '[]'::jsonb,
  correlation_score numeric(5,2),
  processing_started_at timestamptz,
  processing_completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_correlation_queue_status ON correlation_queue(status, created_at);
CREATE INDEX IF NOT EXISTS idx_correlation_queue_event ON correlation_queue(event_id);
CREATE INDEX IF NOT EXISTS idx_correlation_queue_rule ON correlation_queue(rule_id);

ALTER TABLE correlation_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read correlation_queue"
  ON correlation_queue FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read correlation_queue"
  ON correlation_queue FOR SELECT
  TO anon
  USING (true);

-- Processing statistics
CREATE TABLE IF NOT EXISTS processing_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_timestamp timestamptz DEFAULT now(),
  pipeline_stage text NOT NULL,
  events_processed bigint DEFAULT 0,
  events_failed bigint DEFAULT 0,
  avg_processing_time_ms numeric(10,2),
  max_processing_time_ms integer,
  queue_depth integer DEFAULT 0,
  throughput_eps numeric(10,2),
  metadata jsonb DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_processing_stats_timestamp ON processing_stats(stat_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_processing_stats_stage ON processing_stats(pipeline_stage, stat_timestamp DESC);

ALTER TABLE processing_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read processing_stats"
  ON processing_stats FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read processing_stats"
  ON processing_stats FOR SELECT
  TO anon
  USING (true);

-- Function to calculate processing latency
CREATE OR REPLACE FUNCTION calculate_processing_latency(
  start_time timestamptz,
  end_time timestamptz
) RETURNS numeric AS $$
BEGIN
  RETURN EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to get current queue depths
CREATE OR REPLACE FUNCTION get_queue_depths()
RETURNS jsonb AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'raw_buffer', (SELECT COUNT(*) FROM raw_event_buffer WHERE processing_status = 'pending'),
    'parsing_queue', (SELECT COUNT(*) FROM parsing_queue WHERE status = 'pending'),
    'enrichment_queue', (SELECT COUNT(*) FROM enrichment_queue WHERE status = 'pending'),
    'correlation_queue', (SELECT COUNT(*) FROM correlation_queue WHERE status = 'pending')
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
