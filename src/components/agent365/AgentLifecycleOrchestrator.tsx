import { useState, useEffect } from 'react';
import { GitBranch, Play, Pause, XCircle, AlertTriangle, Clock, Zap, Shield, ArrowRight } from 'lucide-react';

type AgentState = 'draft' | 'staged' | 'active' | 'degraded' | 'quarantined' | 'retired';

const LIFECYCLE_AGENTS = [
  { id: 'agent-001', name: 'Triage Agent', version: 'v3.2.1', state: 'active' as AgentState, previousState: 'staged' as AgentState, stateChangedAt: '2026-06-09T08:00:00Z', uptime: '48h 14m', healthScore: 98, driftScore: 0.12, canaryStatus: 'passed', canaryTrafficPct: 100, deployedBy: 'CI/CD Pipeline', model: 'claude-3.5-sonnet', autoTransitionRules: [{ condition: 'drift_score > 0.7', target: 'quarantined' as AgentState }, { condition: 'health_score < 50', target: 'degraded' as AgentState }] },
  { id: 'agent-003', name: 'Threat Hunter v4', version: 'v4.0.0-rc1', state: 'staged' as AgentState, previousState: 'draft' as AgentState, stateChangedAt: '2026-06-11T09:00:00Z', uptime: '2h 14m', healthScore: 100, driftScore: 0.0, canaryStatus: 'running', canaryTrafficPct: 10, deployedBy: 'luiz@0xdsi.com', model: 'claude-3.5-opus', autoTransitionRules: [{ condition: 'canary_pass && error_rate < 0.01', target: 'active' as AgentState }, { condition: 'canary_fail', target: 'draft' as AgentState }] },
  { id: 'agent-005', name: 'Shadow AI Detector', version: 'v1.9.3', state: 'degraded' as AgentState, previousState: 'active' as AgentState, stateChangedAt: '2026-06-11T06:45:00Z', uptime: '4h 29m', healthScore: 42, driftScore: 0.31, canaryStatus: 'none', canaryTrafficPct: 100, deployedBy: 'CI/CD Pipeline', model: 'gpt-4-turbo', autoTransitionRules: [{ condition: 'health_score < 30 for 15m', target: 'quarantined' as AgentState }, { condition: 'health_score > 80 for 5m', target: 'active' as AgentState }] },
  { id: 'agent-007', name: 'Legacy Playbook Gen', version: 'v1.2.0', state: 'quarantined' as AgentState, previousState: 'degraded' as AgentState, stateChangedAt: '2026-06-10T22:15:00Z', uptime: '0h 0m', healthScore: 0, driftScore: 0.89, canaryStatus: 'failed', canaryTrafficPct: 0, deployedBy: 'auto-transition', model: 'gpt-3.5-turbo', autoTransitionRules: [{ condition: 'manual_review_approved', target: 'staged' as AgentState }, { condition: 'ttl_expired (72h)', target: 'retired' as AgentState }] },
  { id: 'agent-099', name: 'Old Correlation v1', version: 'v1.0.0', state: 'retired' as AgentState, previousState: 'quarantined' as AgentState, stateChangedAt: '2026-05-28T00:00:00Z', uptime: '0h 0m', healthScore: 0, driftScore: 0, canaryStatus: 'none', canaryTrafficPct: 0, deployedBy: 'auto-transition', model: 'gpt-3.5-turbo', autoTransitionRules: [] },
];

const STATE_SEQUENCE: AgentState[] = ['draft', 'staged', 'active', 'degraded', 'quarantined', 'retired'];
const STATE_STYLES: Record<AgentState, { bg: string; text: string; border: string }> = {
  draft: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' },
  staged: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  degraded: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  quarantined: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  retired: { bg: 'bg-slate-600/10', text: 'text-slate-500', border: 'border-slate-600/30' },
};

const AgentLifecycleOrchestrator = () => {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [pulseState, setPulseState] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setPulseState(p => (p + 1) % 6), 2000);
    return () => clearInterval(interval);
  }, []);

  const stateCount = (state: AgentState) => {
    const counts: Record<AgentState, number> = { draft: 3, staged: 2, active: 48, degraded: 4, quarantined: 2, retired: 1 };
    return counts[state];
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/20 to-teal-600/20 border border-emerald-500/30 flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Agent Lifecycle Orchestrator</h2>
            <p className="text-[10px] text-slate-500">Autonomous state transitions with canary deployments</p>
          </div>
        </div>
      </div>

      {/* State Machine */}
      <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/40">
        <div className="flex items-center gap-1">
          {STATE_SEQUENCE.map((state, i) => {
            const style = STATE_STYLES[state];
            return (
              <div key={state} className="flex items-center flex-1">
                <div className={`flex-1 p-2 rounded-lg border text-center transition-all duration-500 ${style.bg} ${style.border} ${pulseState === i ? 'ring-1 ring-white/10 scale-[1.03]' : ''}`}>
                  <div className={`text-lg font-bold ${style.text}`}>{stateCount(state)}</div>
                  <div className="text-[9px] text-slate-400 capitalize">{state}</div>
                </div>
                {i < STATE_SEQUENCE.length - 1 && <ArrowRight className="w-3 h-3 text-slate-600 mx-0.5 flex-shrink-0" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Agent List */}
      <div className="space-y-2">
        {LIFECYCLE_AGENTS.map((agent) => {
          const style = STATE_STYLES[agent.state];
          return (
            <div key={agent.id} onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${agent.id === selectedAgent ? 'bg-slate-800/60 border-cyan-500/40 ring-1 ring-cyan-500/20' : 'bg-slate-800/30 border-slate-700/40 hover:border-slate-600/60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`px-2 py-1 rounded border text-[9px] font-bold uppercase ${style.bg} ${style.text} ${style.border}`}>{agent.state}</div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{agent.name}</span>
                      <span className="text-[9px] text-slate-500 font-mono">{agent.version}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Model: {agent.model} | By: {agent.deployedBy}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {agent.canaryStatus === 'running' && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded">
                      <div className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                      <span className="text-[9px] text-blue-400">Canary {agent.canaryTrafficPct}%</span>
                    </div>
                  )}
                  <div className="text-right">
                    <div className="text-[10px] text-slate-400">Health: <span className={agent.healthScore > 80 ? 'text-emerald-400' : agent.healthScore > 50 ? 'text-amber-400' : 'text-red-400'}>{agent.healthScore}%</span></div>
                    <div className="text-[10px] text-slate-500">Drift: {agent.driftScore.toFixed(2)}</div>
                  </div>
                </div>
              </div>
              {agent.id === selectedAgent && (
                <div className="mt-3 pt-3 border-t border-slate-700/50">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider">Auto-Transition Rules</span>
                  <div className="space-y-1.5 mt-1.5">
                    {agent.autoTransitionRules.map((rule, i) => (
                      <div key={i} className="flex items-center gap-2 p-1.5 bg-slate-900/50 rounded">
                        <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        <span className="text-[9px] text-slate-300 font-mono flex-1">{rule.condition}</span>
                        <ArrowRight className="w-3 h-3 text-slate-600" />
                        <span className={`text-[9px] font-medium ${STATE_STYLES[rule.target].text}`}>{rule.target}</span>
                      </div>
                    ))}
                    {agent.autoTransitionRules.length === 0 && <span className="text-[9px] text-slate-500 italic">No active rules (retired)</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AgentLifecycleOrchestrator;
