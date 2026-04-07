/*
  # Agent Cron Jobs - Automatic Scheduled Execution

  1. Scheduled Jobs
    - Run agent orchestrator every 30 seconds
    - Run triage agent every 1 minute
    - Run enrichment agent every 2 minutes
    - Run investigation agent every 5 minutes
    - Run response agent every 1 minute
    - Run pattern discovery agent every 10 minutes
    
  2. Monitoring
    - Health checks every 5 minutes
    - Performance metrics collection every 1 minute
    - Cleanup old logs daily
*/

-- Note: Supabase doesn't support pg_cron out of the box
-- Instead, we'll use these approaches:
-- 1. Supabase Edge Functions with scheduled triggers (via cron-job.org or similar)
-- 2. Client-side polling with setInterval
-- 3. Database functions that can be called via HTTP cron services

-- ============================================================================
-- FUNCTION: Run complete agent pipeline
-- ============================================================================
CREATE OR REPLACE FUNCTION run_agent_pipeline()
RETURNS jsonb AS $$
DECLARE
    result jsonb;
    triage_result jsonb;
    enrichment_result jsonb;
    investigation_result jsonb;
    response_result jsonb;
    pattern_result jsonb;
BEGIN
    -- This function orchestrates all agents
    -- It can be called via Edge Function or external cron
    
    result := jsonb_build_object(
        'execution_timestamp', now(),
        'agents_executed', 0,
        'total_tasks', 0
    );
    
    -- Get counts before execution
    DECLARE
        new_alerts_count int;
        triaged_alerts_count int;
        enriched_alerts_count int;
        pending_tasks_count int;
    BEGIN
        SELECT COUNT(*) INTO new_alerts_count FROM alerts WHERE status = 'new';
        SELECT COUNT(*) INTO triaged_alerts_count FROM alerts WHERE status = 'triaged' AND enrichment_completed = false;
        SELECT COUNT(*) INTO enriched_alerts_count FROM alerts WHERE enrichment_completed = true AND investigation_completed = false;
        SELECT COUNT(*) INTO pending_tasks_count FROM agent_tasks WHERE status = 'pending';
        
        result := result || jsonb_build_object(
            'before_counts', jsonb_build_object(
                'new_alerts', new_alerts_count,
                'triaged_alerts', triaged_alerts_count,
                'enriched_alerts', enriched_alerts_count,
                'pending_tasks', pending_tasks_count
            )
        );
    END;
    
    RETURN result;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Collect agent performance metrics
-- ============================================================================
CREATE OR REPLACE FUNCTION collect_agent_metrics()
RETURNS void AS $$
BEGIN
    -- Insert current metrics for each agent
    INSERT INTO agent_performance_metrics (agent_type, metric_name, metric_value, metric_unit, time_window)
    SELECT 
        agent_type,
        'success_rate',
        CASE 
            WHEN total_runs > 0 THEN (successful_runs::numeric / total_runs) * 100
            ELSE 0
        END,
        'percent',
        '1h'
    FROM agent_configs
    WHERE enabled = true;
    
    -- Collect pending tasks count
    INSERT INTO agent_performance_metrics (agent_type, metric_name, metric_value, metric_unit, time_window)
    SELECT 
        agent_type,
        'pending_tasks',
        COUNT(*),
        'count',
        'current'
    FROM agent_tasks
    WHERE status = 'pending'
    GROUP BY agent_type;
    
    -- Collect average task completion time
    INSERT INTO agent_performance_metrics (agent_type, metric_name, metric_value, metric_unit, time_window)
    SELECT 
        agent_type,
        'avg_completion_time',
        AVG(EXTRACT(EPOCH FROM (completed_at - started_at))),
        'seconds',
        '1h'
    FROM agent_tasks
    WHERE status = 'completed'
    AND completed_at >= now() - interval '1 hour'
    GROUP BY agent_type;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Cleanup old agent logs (retention policy)
-- ============================================================================
CREATE OR REPLACE FUNCTION cleanup_agent_logs()
RETURNS jsonb AS $$
DECLARE
    deleted_orchestration_logs int;
    deleted_metrics int;
    deleted_completed_tasks int;
BEGIN
    -- Delete orchestration logs older than 30 days
    DELETE FROM agent_orchestration_logs
    WHERE created_at < now() - interval '30 days';
    
    GET DIAGNOSTICS deleted_orchestration_logs = ROW_COUNT;
    
    -- Delete performance metrics older than 90 days
    DELETE FROM agent_performance_metrics
    WHERE created_at < now() - interval '90 days';
    
    GET DIAGNOSTICS deleted_metrics = ROW_COUNT;
    
    -- Delete completed agent tasks older than 7 days
    DELETE FROM agent_tasks
    WHERE status = 'completed'
    AND completed_at < now() - interval '7 days';
    
    GET DIAGNOSTICS deleted_completed_tasks = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'deleted_orchestration_logs', deleted_orchestration_logs,
        'deleted_metrics', deleted_metrics,
        'deleted_completed_tasks', deleted_completed_tasks,
        'cleanup_timestamp', now()
    );
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Check agent health and update status
-- ============================================================================
CREATE OR REPLACE FUNCTION check_agent_health()
RETURNS void AS $$
BEGIN
    -- Update health status based on recent performance
    UPDATE agent_configs ac
    SET health_status = CASE
        -- Unhealthy: More than 50% failures in last 10 runs OR no runs in last hour
        WHEN (failed_runs::numeric / GREATEST(total_runs, 1)) > 0.5 
             OR last_run_at < now() - interval '1 hour' THEN 'unhealthy'
        -- Degraded: More than 20% failures OR high pending tasks
        WHEN (failed_runs::numeric / GREATEST(total_runs, 1)) > 0.2 
             OR EXISTS (
                 SELECT 1 FROM agent_tasks 
                 WHERE agent_type = ac.agent_type 
                 AND status = 'pending' 
                 AND created_at < now() - interval '10 minutes'
                 LIMIT 100
             ) THEN 'degraded'
        -- Healthy: Everything looks good
        ELSE 'healthy'
    END,
    updated_at = now()
    WHERE enabled = true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEW: Agent Dashboard Summary
-- ============================================================================
CREATE OR REPLACE VIEW agent_dashboard_summary AS
SELECT 
    ac.agent_type,
    ac.enabled,
    ac.auto_run,
    ac.health_status,
    ac.total_runs,
    ac.successful_runs,
    ac.failed_runs,
    CASE 
        WHEN ac.total_runs > 0 THEN 
            ROUND((ac.successful_runs::numeric / ac.total_runs) * 100, 2)
        ELSE 0
    END as success_rate_percent,
    ac.last_run_at,
    ac.avg_execution_time_ms,
    
    -- Pending tasks count
    COALESCE((
        SELECT COUNT(*)
        FROM agent_tasks at
        WHERE at.agent_type = ac.agent_type
        AND at.status = 'pending'
    ), 0) as pending_tasks,
    
    -- Running tasks count
    COALESCE((
        SELECT COUNT(*)
        FROM agent_tasks at
        WHERE at.agent_type = ac.agent_type
        AND at.status = 'running'
    ), 0) as running_tasks,
    
    -- Oldest pending task age
    (
        SELECT EXTRACT(EPOCH FROM (now() - MIN(created_at)))
        FROM agent_tasks at
        WHERE at.agent_type = ac.agent_type
        AND at.status = 'pending'
    ) as oldest_pending_task_seconds,
    
    -- Recent performance (last hour)
    (
        SELECT COUNT(*)
        FROM agent_tasks at
        WHERE at.agent_type = ac.agent_type
        AND at.status = 'completed'
        AND at.completed_at >= now() - interval '1 hour'
    ) as tasks_completed_last_hour,
    
    (
        SELECT COUNT(*)
        FROM agent_tasks at
        WHERE at.agent_type = ac.agent_type
        AND at.status = 'failed'
        AND at.updated_at >= now() - interval '1 hour'
    ) as tasks_failed_last_hour

FROM agent_configs ac
ORDER BY 
    CASE ac.health_status
        WHEN 'unhealthy' THEN 1
        WHEN 'degraded' THEN 2
        WHEN 'healthy' THEN 3
        ELSE 4
    END,
    ac.agent_type;

COMMENT ON VIEW agent_dashboard_summary IS 'Real-time dashboard view of all agent status and performance';

-- Grant access to view
GRANT SELECT ON agent_dashboard_summary TO authenticated, anon;
