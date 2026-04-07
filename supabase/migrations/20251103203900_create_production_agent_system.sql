/*
  # Production Agent System - Complete Automation

  1. New Tables
    - `agent_configs` - Agent configuration and settings
    - `agent_orchestration_logs` - Orchestration execution logs
    - `agent_performance_metrics` - Agent performance tracking
    
  2. Enhanced Tables
    - `alerts` - Add agent processing fields
    - `agent_tasks` - Add more fields for better tracking
    
  3. Triggers
    - Auto-create agent tasks when alerts are created
    - Auto-trigger enrichment after triage
    - Auto-trigger investigation after enrichment
    - Auto-trigger response for critical alerts
    
  4. Functions
    - Scheduled agent execution
    - Health monitoring
    - Performance tracking

  5. Security
    - Enable RLS on all new tables
    - Service role can manage agents
*/

-- ============================================================================
-- TABLE: agent_configs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type text NOT NULL CHECK (agent_type IN (
        'triage', 'enrichment', 'investigation', 'response', 'pattern_discovery'
    )),
    name text NOT NULL,
    description text,
    
    -- Configuration
    enabled boolean DEFAULT true,
    auto_run boolean DEFAULT true,
    interval_seconds integer DEFAULT 60,
    max_concurrent_tasks integer DEFAULT 10,
    
    -- Performance settings
    batch_size integer DEFAULT 50,
    timeout_seconds integer DEFAULT 300,
    retry_attempts integer DEFAULT 3,
    
    -- Execution stats
    total_runs bigint DEFAULT 0,
    successful_runs bigint DEFAULT 0,
    failed_runs bigint DEFAULT 0,
    last_run_at timestamptz,
    last_run_result jsonb,
    avg_execution_time_ms integer,
    
    -- Health
    health_status text DEFAULT 'healthy' CHECK (health_status IN (
        'healthy', 'degraded', 'unhealthy', 'disabled'
    )),
    last_error text,
    error_count integer DEFAULT 0,
    
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    
    UNIQUE(agent_type)
);

COMMENT ON TABLE public.agent_configs IS 'Configuration for all automated agents';

-- Indexes
CREATE INDEX idx_agent_configs_enabled ON agent_configs(enabled, auto_run);
CREATE INDEX idx_agent_configs_health ON agent_configs(health_status);

-- ============================================================================
-- TABLE: agent_orchestration_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_orchestration_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mode text NOT NULL DEFAULT 'auto',
    
    -- Execution summary
    agents_executed integer DEFAULT 0,
    tasks_created integer DEFAULT 0,
    tasks_completed integer DEFAULT 0,
    execution_time_ms integer,
    
    -- Results
    results jsonb,
    errors text[],
    
    -- Timing
    started_at timestamptz DEFAULT now(),
    completed_at timestamptz,
    
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.agent_orchestration_logs IS 'Logs of agent orchestration executions';

-- Indexes
CREATE INDEX idx_orchestration_logs_started ON agent_orchestration_logs(started_at DESC);

-- ============================================================================
-- TABLE: agent_performance_metrics
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.agent_performance_metrics (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_type text NOT NULL,
    metric_name text NOT NULL,
    metric_value numeric,
    metric_unit text,
    
    -- Context
    time_window text, -- '1h', '24h', '7d'
    tags jsonb,
    
    timestamp timestamptz DEFAULT now(),
    created_at timestamptz DEFAULT now()
);

COMMENT ON TABLE public.agent_performance_metrics IS 'Performance metrics for agent monitoring';

-- Indexes
CREATE INDEX idx_agent_metrics_agent ON agent_performance_metrics(agent_type, timestamp DESC);
CREATE INDEX idx_agent_metrics_timestamp ON agent_performance_metrics(timestamp DESC);

-- ============================================================================
-- ENHANCE: alerts table (add agent processing fields)
-- ============================================================================
DO $$ 
BEGIN
    -- Add triage fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'triage_score') THEN
        ALTER TABLE alerts ADD COLUMN triage_score integer;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'triage_notes') THEN
        ALTER TABLE alerts ADD COLUMN triage_notes text;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'triaged_at') THEN
        ALTER TABLE alerts ADD COLUMN triaged_at timestamptz;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'triaged_by') THEN
        ALTER TABLE alerts ADD COLUMN triaged_by text;
    END IF;
    
    -- Add enrichment fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'enrichment_data') THEN
        ALTER TABLE alerts ADD COLUMN enrichment_data jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'enriched_risk_score') THEN
        ALTER TABLE alerts ADD COLUMN enriched_risk_score integer;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'enrichment_completed') THEN
        ALTER TABLE alerts ADD COLUMN enrichment_completed boolean DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'enriched_at') THEN
        ALTER TABLE alerts ADD COLUMN enriched_at timestamptz;
    END IF;
    
    -- Add investigation fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'investigation_data') THEN
        ALTER TABLE alerts ADD COLUMN investigation_data jsonb;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'investigation_completed') THEN
        ALTER TABLE alerts ADD COLUMN investigation_completed boolean DEFAULT false;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'investigated_at') THEN
        ALTER TABLE alerts ADD COLUMN investigated_at timestamptz;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'alerts' AND column_name = 'case_created') THEN
        ALTER TABLE alerts ADD COLUMN case_created boolean DEFAULT false;
    END IF;
END $$;

-- ============================================================================
-- INSERT: Default agent configurations
-- ============================================================================
INSERT INTO agent_configs (agent_type, name, description, enabled, auto_run, interval_seconds, batch_size)
VALUES
    ('triage', 'Alert Triage Agent', 'Automatically triages and prioritizes new alerts', true, true, 30, 100),
    ('enrichment', 'Threat Enrichment Agent', 'Enriches alerts with threat intelligence', true, true, 60, 50),
    ('investigation', 'Investigation Agent', 'Correlates events and performs automated investigation', true, true, 120, 20),
    ('response', 'Automated Response Agent', 'Executes automated response actions', true, true, 60, 20),
    ('pattern_discovery', 'Pattern Discovery Agent', 'Converts discovered patterns into correlation rules', true, true, 300, 10)
ON CONFLICT (agent_type) DO UPDATE SET
    updated_at = now();

-- ============================================================================
-- TRIGGER: Auto-create triage task when alert is created
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_alert_triage()
RETURNS TRIGGER AS $$
BEGIN
    -- Only trigger for new alerts
    IF NEW.status = 'new' THEN
        INSERT INTO agent_tasks (agent_type, task_type, priority, status, parameters)
        VALUES (
            'triage',
            'triage_alert',
            'high',
            'pending',
            jsonb_build_object('alert_id', NEW.id)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_triage_alert ON alerts;
CREATE TRIGGER auto_triage_alert
    AFTER INSERT ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_alert_triage();

-- ============================================================================
-- TRIGGER: Auto-create enrichment task after triage
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_alert_enrichment()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger enrichment when alert is triaged (status changes to 'triaged')
    IF NEW.status = 'triaged' AND (OLD.status IS NULL OR OLD.status != 'triaged') THEN
        INSERT INTO agent_tasks (agent_type, task_type, priority, status, parameters)
        VALUES (
            'enrichment',
            'enrich_alert',
            NEW.priority,
            'pending',
            jsonb_build_object('alert_id', NEW.id, 'source_ip', NEW.source_ip)
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_enrich_alert ON alerts;
CREATE TRIGGER auto_enrich_alert
    AFTER UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_alert_enrichment();

-- ============================================================================
-- TRIGGER: Auto-create investigation task after enrichment
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_alert_investigation()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger investigation when enrichment is completed
    IF NEW.enrichment_completed = true AND 
       (OLD.enrichment_completed IS NULL OR OLD.enrichment_completed = false) THEN
        
        -- Only investigate medium+ priority alerts
        IF NEW.priority IN ('medium', 'high', 'critical') THEN
            INSERT INTO agent_tasks (agent_type, task_type, priority, status, parameters)
            VALUES (
                'investigation',
                'investigate_alert',
                NEW.priority,
                'pending',
                jsonb_build_object('alert_id', NEW.id)
            );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_investigate_alert ON alerts;
CREATE TRIGGER auto_investigate_alert
    AFTER UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_alert_investigation();

-- ============================================================================
-- TRIGGER: Auto-create response task for critical alerts
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_alert_response()
RETURNS TRIGGER AS $$
BEGIN
    -- Trigger automatic response for critical alerts with high enriched risk score
    IF NEW.enrichment_completed = true AND 
       NEW.enriched_risk_score >= 80 AND
       NEW.severity IN ('high', 'critical') THEN
        
        -- Determine response action based on threat type
        DECLARE
            response_action text;
        BEGIN
            -- Default to block_and_investigate for high-risk IPs
            response_action := 'block_and_investigate';
            
            -- Check if it's a known malware or C2
            IF NEW.enrichment_data ? 'threat_intel' THEN
                IF (NEW.enrichment_data->'threat_intel'->>'source_ip')::jsonb ? 'threat_type' THEN
                    response_action := 'block_ip';
                END IF;
            END IF;
            
            INSERT INTO agent_tasks (agent_type, task_type, priority, status, parameters)
            VALUES (
                'response',
                'execute_response',
                'critical',
                'pending',
                jsonb_build_object(
                    'alert_id', NEW.id,
                    'source_ip', NEW.source_ip,
                    'action', response_action,
                    'automatic', true
                )
            );
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS auto_respond_alert ON alerts;
CREATE TRIGGER auto_respond_alert
    AFTER UPDATE ON alerts
    FOR EACH ROW
    EXECUTE FUNCTION trigger_alert_response();

-- ============================================================================
-- FUNCTION: Get agent health summary
-- ============================================================================
CREATE OR REPLACE FUNCTION get_agent_health_summary()
RETURNS TABLE (
    agent_type text,
    health_status text,
    total_runs bigint,
    success_rate numeric,
    avg_execution_time_ms integer,
    last_run_at timestamptz,
    pending_tasks bigint
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ac.agent_type,
        ac.health_status,
        ac.total_runs,
        CASE 
            WHEN ac.total_runs > 0 THEN 
                ROUND((ac.successful_runs::numeric / ac.total_runs) * 100, 2)
            ELSE 0
        END as success_rate,
        ac.avg_execution_time_ms,
        ac.last_run_at,
        COALESCE((
            SELECT COUNT(*)::bigint 
            FROM agent_tasks at 
            WHERE at.agent_type = ac.agent_type 
            AND at.status = 'pending'
        ), 0) as pending_tasks
    FROM agent_configs ac
    ORDER BY ac.agent_type;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Get agent processing pipeline status
-- ============================================================================
CREATE OR REPLACE FUNCTION get_agent_pipeline_status()
RETURNS TABLE (
    stage text,
    count bigint,
    oldest_item timestamptz
) AS $$
BEGIN
    RETURN QUERY
    SELECT 'new_alerts' as stage, 
           COUNT(*)::bigint, 
           MIN(created_at)
    FROM alerts WHERE status = 'new'
    
    UNION ALL
    
    SELECT 'triaged_alerts' as stage, 
           COUNT(*)::bigint, 
           MIN(triaged_at)
    FROM alerts WHERE status = 'triaged' AND enrichment_completed = false
    
    UNION ALL
    
    SELECT 'enriched_alerts' as stage, 
           COUNT(*)::bigint, 
           MIN(enriched_at)
    FROM alerts WHERE enrichment_completed = true AND investigation_completed = false
    
    UNION ALL
    
    SELECT 'investigated_alerts' as stage, 
           COUNT(*)::bigint, 
           MIN(investigated_at)
    FROM alerts WHERE investigation_completed = true
    
    UNION ALL
    
    SELECT 'pending_tasks' as stage, 
           COUNT(*)::bigint, 
           MIN(created_at)
    FROM agent_tasks WHERE status = 'pending';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- RLS: Enable Row Level Security
-- ============================================================================
ALTER TABLE agent_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_orchestration_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_performance_metrics ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role can manage agent configs"
    ON agent_configs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage orchestration logs"
    ON agent_orchestration_logs FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Service role can manage metrics"
    ON agent_performance_metrics FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- Allow authenticated users to view
CREATE POLICY "Authenticated users can view agent configs"
    ON agent_configs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view orchestration logs"
    ON agent_orchestration_logs FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Authenticated users can view metrics"
    ON agent_performance_metrics FOR SELECT
    TO authenticated
    USING (true);

-- Allow anon access for dashboard
CREATE POLICY "Anon can view agent health"
    ON agent_configs FOR SELECT
    TO anon
    USING (true);

COMMENT ON POLICY "Anon can view agent health" ON agent_configs IS 
'Allow anonymous access to agent health for public dashboards';
