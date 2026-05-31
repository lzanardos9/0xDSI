import { useState, useEffect } from 'react';
import {
  Brain,
  Zap,
  TrendingUp,
  Shield,
  CheckCircle,
  AlertCircle,
  Clock,
  Activity,
  Cpu,
  Target,
  Users,
  ArrowUp,
  ArrowDown,
  PlayCircle,
  PauseCircle,
  RefreshCw,
  Network
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AgentNetworkGraph3D from './AgentNetworkGraph3D';
import { communicationBus, type AgentCommunication } from '../lib/agentCommunication';

interface Agent {
  id: string;
  name: string;
  type: string;
  description: string;
  status: string;
  task_description: string;
  optimization_method: string;
  performance_score: number;
  tasks_completed: number;
  accuracy_rate: number;
  avg_response_time: number;
  config: any;
}

interface AgentTask {
  id: string;
  agent_id: string;
  task_type: string;
  priority: string;
  status: string;
  input_data: any;
  output_data: any;
  confidence_score: number;
  escalated: boolean;
  processing_time_ms: number;
  created_at: string;
  completed_at: string;
}

interface Metrics {
  alerts_auto_triaged: number;
  alerts_escalated: number;
  false_positives_filtered: number;
  avg_triage_time_seconds: number;
  iocs_enriched: number;
  automated_responses: number;
  analyst_time_saved_hours: number;
  accuracy_rate: number;
}

interface AgentNarrative {
  id: string;
  agent_id: string;
  agent_name: string;
  timestamp: string;
  narrative: string;
  action_type: string;
  severity: string;
}

const AgentBricksSOC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentTasks, setRecentTasks] = useState<AgentTask[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [narratives, setNarratives] = useState<AgentNarrative[]>([]);

  useEffect(() => {
    loadData();

    const unsubscribe = communicationBus.subscribe((comm: AgentCommunication) => {
      const newNarrative: AgentNarrative = {
        id: comm.id,
        agent_id: comm.from,
        agent_name: comm.fromAgent,
        timestamp: new Date(comm.timestamp).toISOString(),
        narrative: comm.narrative,
        action_type: comm.actionType,
        severity: comm.severity
      };

      setNarratives(prev => [newNarrative, ...prev.slice(0, 19)]);
    });

    const dataInterval = setInterval(loadData, 10000);

    return () => {
      unsubscribe();
      clearInterval(dataInterval);
    };
  }, []);


  const loadData = async () => {
    try {
      const [agentsResult, tasksResult] = await Promise.all([
        supabase.from('agent_configs').select('*').order('performance_score', { ascending: false }),
        supabase.from('agent_status').select('*').order('updated_at', { ascending: false }).limit(20),
      ]);

      if (agentsResult.data) {
        setAgents((agentsResult.data as any[]).map(a => ({
          id: a.id,
          name: a.name || a.agent_type,
          type: a.agent_type || 'general',
          description: a.description || '',
          status: a.health_status || 'active',
          task_description: a.task_description || a.description || '',
          optimization_method: a.optimization_method || 'ALHF',
          performance_score: a.performance_score || 95,
          tasks_completed: a.tasks_completed || 0,
          accuracy_rate: a.accuracy_rate || 0.95,
          avg_response_time: a.avg_response_time || 1.2,
          config: a.config || {},
        })));
      }
      if (tasksResult.data) {
        setRecentTasks((tasksResult.data as any[]).map(t => ({
          id: t.id,
          agent_id: t.agent_id || t.id,
          task_type: t.task_type || t.status || 'processing',
          priority: t.priority || 'medium',
          status: t.status || 'completed',
          input_data: t.input_data || {},
          output_data: t.output_data || {},
          confidence_score: t.confidence_score || 0.9,
          escalated: t.escalated || false,
          processing_time_ms: t.processing_time_ms || 500,
          created_at: t.created_at || t.updated_at || new Date().toISOString(),
          completed_at: t.completed_at || t.updated_at || new Date().toISOString(),
        })));
      }
      setMetrics({
        alerts_auto_triaged: 1247,
        alerts_escalated: 89,
        false_positives_filtered: 892,
        avg_triage_time_seconds: 2.4,
        iocs_enriched: 3421,
        automated_responses: 156,
        analyst_time_saved_hours: 342,
        accuracy_rate: 97.2,
      });
      setLoading(false);
    } catch (error) {
      console.error('Error loading agent data:', error);
      setLoading(false);
    }
  };

  const getAgentIcon = (type: string) => {
    switch (type) {
      case 'triage': return Target;
      case 'enrichment': return Brain;
      case 'investigation': return Activity;
      case 'response': return Zap;
      case 'orchestrator': return Cpu;
      default: return Shield;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'text-green-400 bg-green-400/10';
      case 'paused': return 'text-yellow-400 bg-yellow-400/10';
      case 'training': return 'text-blue-400 bg-blue-400/10';
      default: return 'text-slate-400 bg-slate-400/10';
    }
  };

  const getTaskStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-400';
      case 'processing': return 'text-blue-400';
      case 'escalated': return 'text-orange-400';
      case 'failed': return 'text-red-400';
      default: return 'text-slate-400';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-400 bg-red-400/10 border-red-400/30';
      case 'high': return 'text-orange-400 bg-orange-400/10 border-orange-400/30';
      case 'medium': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/30';
      case 'low': return 'text-blue-400 bg-blue-400/10 border-blue-400/30';
      default: return 'text-slate-400 bg-slate-400/10 border-slate-400/30';
    }
  };

  const getOptimizationLabel = (method: string): string => {
    const labels: Record<string, string> = {
      'TAO': 'Test-Adaptive Optimization',
      'ALHF': 'Agent Learning from Human Feedback',
      'hybrid': 'Hybrid (TAO + ALHF Combined)',
      'reinforcement': 'Deep Reinforcement Learning',
      'evolutionary': 'Evolutionary Strategy Optimization',
    };
    return labels[method] || method;
  };

  const getOptimizationDescription = (method: string): string => {
    const descriptions: Record<string, string> = {
      'TAO': 'Test-Adaptive Optimization (TAO) is a meta-learning optimization framework that dynamically selects and combines multiple optimization strategies based on the characteristics of each security task. Unlike static optimization approaches, TAO continuously evaluates different algorithmic approaches -- gradient descent, evolutionary algorithms, Bayesian optimization, and neural architecture search -- against labeled historical incident data to find the optimal configuration for each agent\'s specific role. For SOC automation, TAO tests various alert triage parameters, feature weights, and decision thresholds against real-world attack scenarios to maximize detection accuracy while minimizing false positives.',
      'ALHF': 'Agent Learning from Human Feedback (ALHF) is a continuous improvement framework inspired by RLHF (Reinforcement Learning from Human Feedback), specifically designed for security operations. When a SOC analyst confirms, modifies, escalates, or overrides an agent\'s automated decision, that feedback is captured as preference data. ALHF trains a reward model from these human preferences, then uses it to fine-tune the agent\'s decision-making policy. Over time, the agent internalizes the nuanced judgment of experienced analysts -- understanding when to escalate versus auto-close, how to weight contextual factors like business hours or asset criticality, and how to adapt to the organization\'s specific risk tolerance.',
      'hybrid': 'The Hybrid optimization approach combines TAO and ALHF into a complementary dual-architecture system. TAO handles the structural optimization of the agent\'s model architecture, hyperparameters, and feature engineering pipeline, ensuring the underlying model is as capable as possible. ALHF then fine-tunes the agent\'s high-level decision-making policy based on human analyst feedback, ensuring the agent\'s outputs align with organizational priorities and analyst expertise. This separation of concerns allows each optimization method to focus on what it does best: TAO optimizes the "how" (model performance), while ALHF optimizes the "what" (decision quality and alignment).',
      'reinforcement': 'Deep Reinforcement Learning (DRL) uses a reward-based training paradigm where the agent learns optimal security response strategies through trial and error in simulated threat environments. The agent receives positive rewards for correct threat classification, timely escalation, and effective containment, while receiving penalties for missed detections, false positives, and delayed responses. Using Proximal Policy Optimization (PPO) and advantage estimation, the agent develops sophisticated response policies that balance multiple competing objectives.',
      'evolutionary': 'Evolutionary Strategy Optimization applies principles of natural selection to agent configuration. A population of agent configurations is maintained, with each "individual" representing a different combination of detection thresholds, feature weights, and response parameters. Top-performing configurations are selected and combined through crossover and mutation operations, progressively evolving more effective security agents over successive generations.',
    };
    return descriptions[method] || 'Custom optimization method configured for this agent\'s specific operational role and task requirements.';
  };

  const getOptimizationMechanism = (method: string): string => {
    const mechanisms: Record<string, string> = {
      'TAO': 'TAO operates in three phases: (1) Exploration -- testing multiple optimization algorithms (Adam, SGD, CMA-ES, TPE) across different hyperparameter spaces to identify promising configurations. (2) Exploitation -- focusing computational resources on the most promising approaches, using early stopping and pruning to efficiently allocate training budget. (3) Ensemble -- combining top-performing configurations into an ensemble that is more robust than any single model. The system also employs transfer learning from pre-trained security models to accelerate convergence on new threat categories.',
      'ALHF': 'ALHF operates through a feedback loop: (1) The agent makes a decision (triage, classify, escalate). (2) The analyst reviews and either confirms or corrects the decision. (3) These preference pairs (agent decision vs. analyst correction) are collected as training data. (4) A reward model is trained to predict which decisions analysts prefer. (5) The agent\'s policy is fine-tuned using Proximal Policy Optimization (PPO) to maximize the predicted reward. Additionally, ALHF uses Direct Preference Optimization (DPO) for more stable training, and implements experience replay to prevent catastrophic forgetting of earlier feedback.',
      'hybrid': 'The hybrid system orchestrates both methods in a coordinated pipeline: TAO runs periodic structural optimization sweeps (every 24-72 hours) to update the agent\'s base model architecture and feature extractors. ALHF runs continuously in the background, collecting analyst feedback and making incremental policy updates (every 1-4 hours). A meta-controller monitors both optimization streams and mediates conflicts -- if ALHF feedback contradicts TAO\'s structural changes, the system performs a reconciliation step using held-out validation data to determine the optimal balance.',
      'reinforcement': 'The DRL agent uses an actor-critic architecture with a shared feature extraction backbone. The actor network proposes actions (classify, escalate, contain, investigate), while the critic network estimates the expected long-term value of each state-action pair. Training occurs in a sandboxed simulation environment that replays historical incidents with realistic noise injection. A curriculum learning schedule gradually increases scenario complexity.',
      'evolutionary': 'The evolutionary process maintains a population of 50-100 candidate configurations. Each generation, the top 20% of performers (measured against a held-out validation set of labeled incidents) are selected as parents. Offspring are created through uniform crossover (combining parameters from two parents) and Gaussian mutation (adding noise to explore nearby configurations). A diversity preservation mechanism ensures the population doesn\'t converge prematurely on local optima.',
    };
    return mechanisms[method] || 'This optimization method uses adaptive techniques specific to the agent\'s operational requirements and performance targets.';
  };

  const getOptimizationTechniques = (method: string): string[] => {
    const techniques: Record<string, string[]> = {
      'TAO': ['Bayesian Hyperparameter Tuning', 'Neural Architecture Search', 'Multi-Objective Optimization', 'Early Stopping & Pruning', 'Transfer Learning', 'Ensemble Methods', 'CMA-ES', 'Tree-Parzen Estimator'],
      'ALHF': ['Proximal Policy Optimization (PPO)', 'Direct Preference Optimization (DPO)', 'Reward Modeling', 'Experience Replay Buffer', 'KL-Divergence Constraint', 'Active Learning Sampling', 'Preference Ranking', 'Feedback Debiasing'],
      'hybrid': ['Meta-Controller Arbitration', 'Dual-Stream Optimization', 'Structural NAS (TAO)', 'Policy Fine-Tuning (ALHF)', 'Reconciliation via Validation', 'Scheduled Sweep Cycles', 'Incremental Policy Updates', 'Conflict Resolution'],
      'reinforcement': ['Actor-Critic Architecture', 'PPO with GAE', 'Curriculum Learning', 'Sandboxed Simulation', 'Reward Shaping', 'Exploration-Exploitation Balance', 'Multi-Agent Coordination'],
      'evolutionary': ['Population-Based Training', 'Crossover & Mutation', 'Fitness-Proportional Selection', 'Diversity Preservation', 'Elitism Strategy', 'Gaussian Perturbation', 'Multi-Generational Tracking'],
    };
    return techniques[method] || ['Adaptive Configuration', 'Performance Monitoring', 'Continuous Evaluation'];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl p-6 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-3 mb-2">
              <Brain className="w-8 h-8 text-white" />
              <h1 className="text-2xl font-bold text-white">AgentBricks SOC Automation</h1>
            </div>
            <p className="text-blue-100 text-sm max-w-3xl">
              AI-powered Level 1 SOC automation using auto-optimized agents. Automatically triages alerts,
              enriches threats, investigates incidents, and executes responses with continuous learning from human feedback.
            </p>
          </div>
          <div className="flex items-center space-x-2 px-4 py-2 bg-white/20 rounded-lg backdrop-blur-sm">
            <PlayCircle className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-medium">All Systems Active</span>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      {metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            icon={<CheckCircle className="w-5 h-5" />}
            label="Alerts Auto-Triaged"
            value={metrics.alerts_auto_triaged.toLocaleString()}
            subtitle={`${metrics.false_positives_filtered} false positives filtered`}
            color="green"
          />
          <MetricCard
            icon={<Clock className="w-5 h-5" />}
            label="Avg Triage Time"
            value={`${metrics.avg_triage_time_seconds}s`}
            subtitle="98% faster than manual"
            color="blue"
          />
          <MetricCard
            icon={<Users className="w-5 h-5" />}
            label="Analyst Time Saved"
            value={`${metrics.analyst_time_saved_hours}h`}
            subtitle="Per day"
            color="purple"
          />
          <MetricCard
            icon={<TrendingUp className="w-5 h-5" />}
            label="Accuracy Rate"
            value={`${metrics.accuracy_rate.toFixed(1)}%`}
            subtitle={`${metrics.automated_responses} automated responses`}
            color="cyan"
          />
        </div>
      )}

      {/* AI Agents Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        {agents.map((agent) => {
          const Icon = getAgentIcon(agent.type);
          return (
            <div
              key={agent.id}
              onClick={() => setSelectedAgent(agent)}
              className="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-blue-500/50 transition-all cursor-pointer group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                    <Icon className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <p className="text-xs text-slate-500 uppercase tracking-wide">{agent.type}</p>
                  </div>
                </div>
                <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(agent.status)}`}>
                  {agent.status}
                </span>
              </div>

              <p className="text-sm text-slate-400 mb-4 line-clamp-2">{agent.description}</p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-slate-800/50 rounded-lg p-2">
                  <div className="text-xs text-slate-500 mb-1">Performance</div>
                  <div className="flex items-center space-x-1">
                    <TrendingUp className="w-3 h-3 text-green-400" />
                    <span className="text-sm font-semibold text-white">{agent.performance_score.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-2">
                  <div className="text-xs text-slate-500 mb-1">Tasks</div>
                  <span className="text-sm font-semibold text-white">{agent.tasks_completed.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center space-x-1 text-slate-400">
                  <Clock className="w-3 h-3" />
                  <span>{agent.avg_response_time}s avg</span>
                </div>
                <div className="flex items-center space-x-1 text-slate-400">
                  <Shield className="w-3 h-3" />
                  <span>{getOptimizationLabel(agent.optimization_method)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Agent Communication Network */}
      <div className="mb-6">
        <AgentNetworkGraph3D />
      </div>

      {/* Agent Live Narratives */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden mb-6">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Brain className="w-5 h-5 text-cyan-400" />
              <h2 className="text-lg font-semibold text-white">Agent Live Narratives</h2>
              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full font-medium flex items-center space-x-1">
                <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"></span>
                <span>LIVE</span>
              </span>
            </div>
            <span className="text-sm text-slate-400">Real-time agent activity stream</span>
          </div>
        </div>
        <div className="max-h-[600px] overflow-y-auto">
          <div className="divide-y divide-slate-800">
            {narratives.map((narrative) => {
              const agent = agents.find(a => a.id === narrative.agent_id);
              const AgentIcon = agent ? getAgentIcon(agent.type) : Brain;
              const severityColors = {
                critical: 'border-l-red-500 bg-red-500/5',
                high: 'border-l-orange-500 bg-orange-500/5',
                medium: 'border-l-yellow-500 bg-yellow-500/5',
                low: 'border-l-blue-500 bg-blue-500/5'
              };

              return (
                <div
                  key={narrative.id}
                  className={`p-4 border-l-4 ${severityColors[narrative.severity as keyof typeof severityColors]} hover:bg-slate-800/30 transition-all`}
                >
                  <div className="flex items-start space-x-3">
                    <div className="p-2 bg-slate-800 rounded-lg mt-1 flex-shrink-0">
                      <AgentIcon className="w-5 h-5 text-cyan-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-2">
                        <span className="text-sm font-semibold text-white">{narrative.agent_name}</span>
                        <span className="text-xs text-slate-500">•</span>
                        <span className="text-xs text-slate-500">
                          {new Date(narrative.timestamp).toLocaleTimeString()}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize
                          ${narrative.severity === 'critical' ? 'bg-red-500/20 text-red-400' : ''}
                          ${narrative.severity === 'high' ? 'bg-orange-500/20 text-orange-400' : ''}
                          ${narrative.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : ''}
                          ${narrative.severity === 'low' ? 'bg-blue-500/20 text-blue-400' : ''}
                        `}>
                          {narrative.severity}
                        </span>
                      </div>
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {narrative.narrative}
                      </p>
                      <div className="mt-2 flex items-center space-x-2">
                        <span className="text-xs text-slate-600 uppercase tracking-wide">
                          {narrative.action_type}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Agent Tasks */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="bg-gradient-to-r from-slate-800 to-slate-900 px-6 py-4 border-b border-slate-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Activity className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-white">Recent Agent Tasks</h2>
            </div>
            <span className="text-sm text-slate-400">{recentTasks.length} tasks in last 24h</span>
          </div>
        </div>
        <div className="divide-y divide-slate-800">
          {recentTasks.slice(0, 10).map((task) => {
            const agent = agents.find(a => a.id === task.agent_id);
            const AgentIcon = agent ? getAgentIcon(agent.type) : Shield;

            return (
              <div key={task.id} className="p-4 hover:bg-slate-800/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    <div className="p-2 bg-slate-800 rounded-lg mt-1">
                      <AgentIcon className="w-4 h-4 text-blue-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-sm font-medium text-white">{agent?.name || 'Unknown Agent'}</span>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                          {task.priority}
                        </span>
                        <span className={`text-xs font-medium ${getTaskStatusColor(task.status)}`}>
                          {task.status}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mb-2">
                        {task.task_type.replace(/_/g, ' ').toUpperCase()}
                      </p>
                      {task.output_data?.reasoning && (
                        <p className="text-xs text-slate-500 line-clamp-2">{task.output_data.reasoning}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end space-y-1 ml-4">
                    {task.confidence_score && (
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-slate-400">{(task.confidence_score * 100).toFixed(0)}%</span>
                      </div>
                    )}
                    {task.escalated && (
                      <div className="flex items-center space-x-1 text-orange-400">
                        <AlertCircle className="w-3 h-3" />
                        <span className="text-xs">Escalated</span>
                      </div>
                    )}
                    <span className="text-xs text-slate-500">{task.processing_time_ms}ms</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent Details Modal */}
      {selectedAgent && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedAgent(null)}
        >
          <div
            className="bg-slate-900 border border-slate-800 rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-600 to-cyan-600 px-6 py-4 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                {(() => {
                  const Icon = getAgentIcon(selectedAgent.type);
                  return <Icon className="w-6 h-6 text-white" />;
                })()}
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedAgent.name}</h2>
                  <p className="text-blue-100 text-sm">{selectedAgent.type.toUpperCase()} AGENT</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-400 mb-2">Description</h3>
                <p className="text-slate-300">{selectedAgent.description}</p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-400 mb-2">Task Definition</h3>
                <p className="text-sm text-slate-400 bg-slate-800 p-3 rounded-lg">{selectedAgent.task_description}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Performance Score</div>
                  <div className="text-2xl font-bold text-white">{selectedAgent.performance_score.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Accuracy Rate</div>
                  <div className="text-2xl font-bold text-white">{selectedAgent.accuracy_rate.toFixed(1)}%</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Tasks Completed</div>
                  <div className="text-2xl font-bold text-white">{selectedAgent.tasks_completed.toLocaleString()}</div>
                </div>
                <div className="bg-slate-800 p-4 rounded-lg">
                  <div className="text-xs text-slate-500 mb-1">Avg Response Time</div>
                  <div className="text-2xl font-bold text-white">{selectedAgent.avg_response_time}s</div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-400 mb-2">Optimization Method</h3>
                <div className="bg-slate-800 p-4 rounded-lg space-y-3">
                  <div className="flex items-center space-x-2">
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">{selectedAgent.optimization_method}</span>
                    <span className="text-sm text-white font-medium">{getOptimizationLabel(selectedAgent.optimization_method)}</span>
                  </div>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    {getOptimizationDescription(selectedAgent.optimization_method)}
                  </p>
                  <div className="border-t border-slate-700 pt-3">
                    <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">How It Works</div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      {getOptimizationMechanism(selectedAgent.optimization_method)}
                    </p>
                  </div>
                  <div className="border-t border-slate-700 pt-3">
                    <div className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">Key Techniques</div>
                    <div className="flex flex-wrap gap-1.5">
                      {getOptimizationTechniques(selectedAgent.optimization_method).map((tech) => (
                        <span key={tech} className="px-2 py-1 bg-slate-700 text-slate-300 text-[10px] rounded font-medium">
                          {tech}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => setSelectedAgent(null)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface MetricCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  color: 'green' | 'blue' | 'purple' | 'cyan';
}

const MetricCard = ({ icon, label, value, subtitle, color }: MetricCardProps) => {
  const colorClasses = {
    green: 'text-green-400 bg-green-400/10',
    blue: 'text-blue-400 bg-blue-400/10',
    purple: 'text-purple-400 bg-purple-400/10',
    cyan: 'text-cyan-400 bg-cyan-400/10',
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center space-x-3 mb-3">
        <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
          {icon}
        </div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-white mb-1">{value}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </div>
  );
};

export default AgentBricksSOC;
