import { useEffect, useState } from 'react';
import { Activity, CheckCircle, AlertTriangle, XCircle, Play, Pause, RefreshCw } from 'lucide-react';
import { agentOrchestrator } from '../lib/agentOrchestrator';

interface AgentStatus {
  agent_type: string;
  enabled: boolean;
  health_status: string;
  pending_tasks: number;
  running_tasks: number;
  success_rate_percent: number;
  last_run_at: string | null;
  avg_execution_time_ms: number;
  tasks_completed_last_hour: number;
  tasks_failed_last_hour: number;
  oldest_pending_task_seconds: number;
}

interface PipelineStage {
  stage: string;
  count: number;
  oldest_item: string | null;
}

export default function AgentStatusPanel() {
  const [agents, setAgents] = useState<AgentStatus[]>([]);
  const [pipeline, setPipeline] = useState<PipelineStage[]>([]);
  const [orchestratorStats, setOrchestratorStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    loadAgentStatus();

    // Refresh every 10 seconds
    const interval = setInterval(loadAgentStatus, 10000);

    // Subscribe to real-time updates
    const subscription = agentOrchestrator.subscribeToAgentUpdates((status) => {
      setAgents(status);
    });

    return () => {
      clearInterval(interval);
      subscription?.unsubscribe();
    };
  }, []);

  const loadAgentStatus = async () => {
    try {
      const [agentStatus, pipelineStatus] = await Promise.all([
        agentOrchestrator.getAgentStatus(),
        agentOrchestrator.getPipelineStatus(),
      ]);

      setAgents(agentStatus);
      setPipeline(pipelineStatus);
      setOrchestratorStats(agentOrchestrator.getStats());
      setLoading(false);
    } catch (error) {
      console.error('Error loading agent status:', error);
      setLoading(false);
    }
  };

  const handleTriggerNow = async () => {
    setExecuting(true);
    try {
      await agentOrchestrator.triggerNow();
      await loadAgentStatus();
    } finally {
      setExecuting(false);
    }
  };

  const handleToggleOrchestrator = () => {
    const stats = agentOrchestrator.getStats();
    if (stats.intervalId) {
      agentOrchestrator.stop();
    } else {
      agentOrchestrator.start(60000); // 1 minute
    }
    setOrchestratorStats(agentOrchestrator.getStats());
  };

  const getHealthIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'unhealthy':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Activity className="w-5 h-5 text-gray-500" />;
    }
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'unhealthy':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const formatAgentType = (type: string) => {
    return type
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatTimestamp = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return `${Math.floor(diffMins / 1440)}d ago`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center justify-center">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading agent status...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Orchestrator Control */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg shadow-lg p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold mb-2">Agent Orchestrator</h2>
            <p className="text-blue-100">
              Automatic agent execution every {orchestratorStats?.intervalMs ? Math.floor(orchestratorStats.intervalMs / 1000) : 60} seconds
            </p>
            <div className="mt-2 space-y-1 text-sm">
              <p>Status: {orchestratorStats?.intervalId ? <span className="font-semibold text-green-300">Running</span> : <span className="font-semibold text-red-300">Stopped</span>}</p>
              <p>Last Run: {orchestratorStats?.lastRun ? formatTimestamp(orchestratorStats.lastRun.toISOString()) : 'Never'}</p>
              <p>Total Runs: {orchestratorStats?.runCount || 0}</p>
            </div>
          </div>
          <div className="flex flex-col space-y-2">
            <button
              onClick={handleToggleOrchestrator}
              className="bg-white text-blue-600 px-6 py-2 rounded-lg font-semibold hover:bg-blue-50 transition flex items-center space-x-2"
            >
              {orchestratorStats?.intervalId ? (
                <>
                  <Pause className="w-4 h-4" />
                  <span>Stop</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  <span>Start</span>
                </>
              )}
            </button>
            <button
              onClick={handleTriggerNow}
              disabled={executing}
              className="bg-white text-purple-600 px-6 py-2 rounded-lg font-semibold hover:bg-purple-50 transition flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${executing ? 'animate-spin' : ''}`} />
              <span>Run Now</span>
            </button>
          </div>
        </div>
      </div>

      {/* Processing Pipeline Status */}
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h3 className="text-lg font-bold mb-4">Processing Pipeline</h3>
        <div className="grid grid-cols-5 gap-4">
          {pipeline.map((stage) => {
            const stageNames: Record<string, string> = {
              new_alerts: 'New Alerts',
              triaged_alerts: 'Triaged',
              enriched_alerts: 'Enriched',
              investigated_alerts: 'Investigated',
              pending_tasks: 'Pending Tasks',
            };

            return (
              <div key={stage.stage} className="border border-gray-200 rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">{stageNames[stage.stage] || stage.stage}</div>
                <div className="text-3xl font-bold text-blue-600">{stage.count}</div>
                {stage.oldest_item && (
                  <div className="text-xs text-gray-500 mt-2">
                    Oldest: {formatTimestamp(stage.oldest_item)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {agents.map((agent) => (
          <div
            key={agent.agent_type}
            className={`border-2 rounded-lg p-4 ${getHealthColor(agent.health_status)}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                {getHealthIcon(agent.health_status)}
                <h4 className="font-bold">{formatAgentType(agent.agent_type)}</h4>
              </div>
              <span className={`px-2 py-1 rounded text-xs font-semibold ${agent.enabled ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-800'}`}>
                {agent.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-700">Success Rate:</span>
                <span className="font-semibold">{agent.success_rate_percent.toFixed(1)}%</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-700">Pending Tasks:</span>
                <span className={`font-semibold ${agent.pending_tasks > 50 ? 'text-red-600' : agent.pending_tasks > 10 ? 'text-yellow-600' : 'text-green-600'}`}>
                  {agent.pending_tasks}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-700">Running Tasks:</span>
                <span className="font-semibold">{agent.running_tasks}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-700">Last Hour:</span>
                <span className="font-semibold">
                  ✓ {agent.tasks_completed_last_hour} / ✗ {agent.tasks_failed_last_hour}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-700">Last Run:</span>
                <span className="font-semibold">{formatTimestamp(agent.last_run_at)}</span>
              </div>

              {agent.avg_execution_time_ms > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">Avg Time:</span>
                  <span className="font-semibold">{agent.avg_execution_time_ms}ms</span>
                </div>
              )}

              {agent.oldest_pending_task_seconds > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-700">Oldest Task:</span>
                  <span className={`font-semibold ${agent.oldest_pending_task_seconds > 600 ? 'text-red-600' : 'text-gray-800'}`}>
                    {Math.floor(agent.oldest_pending_task_seconds / 60)}m
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
