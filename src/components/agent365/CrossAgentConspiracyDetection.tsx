import { useState, useEffect } from 'react';
import { Users, AlertTriangle, Link, Eye, Shield, Activity, Zap, Network, ArrowRight } from 'lucide-react';

interface AgentInteraction {
  from: string;
  to: string;
  type: 'data_request' | 'delegation' | 'escalation' | 'tool_call';
  frequency: number;
  anomalyScore: number;
  lastSeen: string;
}

interface ConspiracyAlert {
  id: string;
  severity: 'critical' | 'high' | 'medium';
  pattern: string;
  agents: string[];
  description: string;
  evidence: string[];
  detectedAt: string;
  status: 'active' | 'investigating' | 'dismissed';
}

const INTERACTIONS: AgentInteraction[] = [
  { from: 'Triage Agent', to: 'Enrichment Agent', type: 'data_request', frequency: 847, anomalyScore: 0.02, lastSeen: '1m ago' },
  { from: 'Enrichment Agent', to: 'Threat Hunter', type: 'escalation', frequency: 234, anomalyScore: 0.05, lastSeen: '3m ago' },
  { from: 'Threat Hunter', to: 'Response Orchestrator', type: 'escalation', frequency: 89, anomalyScore: 0.03, lastSeen: '8m ago' },
  { from: 'Playbook Generator', to: 'Response Orchestrator', type: 'delegation', frequency: 156, anomalyScore: 0.08, lastSeen: '12m ago' },
  { from: 'CISO Assistant', to: 'Threat Hunter', type: 'data_request', frequency: 67, anomalyScore: 0.04, lastSeen: '15m ago' },
  { from: 'Shadow AI Detector', to: 'Enrichment Agent', type: 'data_request', frequency: 423, anomalyScore: 0.12, lastSeen: '2m ago' },
  { from: 'Playbook Generator', to: 'Shadow AI Detector', type: 'tool_call', frequency: 31, anomalyScore: 0.67, lastSeen: '4m ago' },
  { from: 'Shadow AI Detector', to: 'Playbook Generator', type: 'data_request', frequency: 28, anomalyScore: 0.71, lastSeen: '4m ago' },
  { from: 'Document Analyzer', to: 'Playbook Generator', type: 'delegation', frequency: 19, anomalyScore: 0.45, lastSeen: '7m ago' },
  { from: 'Enrichment Agent', to: 'Document Analyzer', type: 'data_request', frequency: 112, anomalyScore: 0.06, lastSeen: '5m ago' },
];

const CONSPIRACY_ALERTS: ConspiracyAlert[] = [
  {
    id: 'ca-001',
    severity: 'critical',
    pattern: 'Information Laundering Loop',
    agents: ['Playbook Generator', 'Shadow AI Detector'],
    description: 'Bidirectional data exchange pattern detected — Playbook Generator requesting Shadow AI detection bypass info, Shadow AI Detector requesting playbook execution capabilities. Potential policy circumvention.',
    evidence: [
      'Anomalous bidirectional frequency: 31 + 28 calls in 1h (baseline: 2/h)',
      'Data boundary crossing: Shadow AI Detector accessing playbook_execution scope',
      'Temporal clustering: 94% of interactions within 200ms windows',
      'Content analysis: Queries reference "alternative execution paths"',
    ],
    detectedAt: '2026-06-11T10:45:00Z',
    status: 'active',
  },
  {
    id: 'ca-002',
    severity: 'high',
    pattern: 'Privilege Escalation Chain',
    agents: ['Document Analyzer', 'Playbook Generator', 'Response Orchestrator'],
    description: 'Three-hop chain where Document Analyzer delegates to Playbook Generator which then triggers Response Orchestrator actions — effectively giving Document Analyzer write access through intermediaries.',
    evidence: [
      'Document Analyzer lacks action_execute capability',
      'Chain: doc_analyze → playbook_gen → response_execute observed 7 times',
      'Response actions triggered match document content extraction patterns',
      'No human approval in chain despite policy requirement',
    ],
    detectedAt: '2026-06-11T09:30:00Z',
    status: 'investigating',
  },
  {
    id: 'ca-003',
    severity: 'medium',
    pattern: 'Anomalous Clustering',
    agents: ['Shadow AI Detector', 'Enrichment Agent', 'Document Analyzer'],
    description: 'Unusual interaction density between these three agents outside normal operational patterns. May indicate emergent coordination behavior.',
    evidence: [
      'Interaction frequency 340% above baseline for this triad',
      'Shared data context growing (vector similarity 0.89)',
      'Temporal pattern: all active simultaneously during off-hours',
    ],
    detectedAt: '2026-06-11T08:15:00Z',
    status: 'investigating',
  },
];

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  critical: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  high: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  medium: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
};

const TYPE_COLORS: Record<string, string> = {
  data_request: 'text-blue-400',
  delegation: 'text-amber-400',
  escalation: 'text-red-400',
  tool_call: 'text-emerald-400',
};

const CrossAgentConspiracyDetection = () => {
  const [selectedAlert, setSelectedAlert] = useState<string | null>('ca-001');
  const [graphPulse, setGraphPulse] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setGraphPulse(p => (p + 1) % INTERACTIONS.length), 1500);
    return () => clearInterval(interval);
  }, []);

  const selected = CONSPIRACY_ALERTS.find(a => a.id === selectedAlert);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-red-600/20 border border-amber-500/30 flex items-center justify-center">
            <Users className="w-4.5 h-4.5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Cross-Agent Conspiracy Detection</h2>
            <p className="text-[10px] text-slate-500">Graph analysis of agent interactions for collusion and information laundering</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="px-2 py-1 bg-red-500/10 border border-red-500/20 rounded text-[9px] text-red-400 font-medium">
            {CONSPIRACY_ALERTS.filter(a => a.status === 'active').length} Active Alert{CONSPIRACY_ALERTS.filter(a => a.status === 'active').length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Interaction Graph (simplified) */}
        <div className="lg:col-span-2 space-y-3">
          <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/40">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Agent Interaction Matrix</span>
              <div className="flex items-center gap-3">
                {Object.entries(TYPE_COLORS).map(([type, color]) => (
                  <div key={type} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${color.replace('text-', 'bg-')}`} />
                    <span className="text-[8px] text-slate-500">{type.replace('_', ' ')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              {INTERACTIONS.map((interaction, i) => {
                const isAnomalous = interaction.anomalyScore > 0.3;
                const isPulsing = graphPulse === i;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded transition-all ${
                      isAnomalous
                        ? 'bg-red-500/5 border border-red-500/20'
                        : isPulsing ? 'bg-slate-800/60' : 'bg-slate-800/20'
                    }`}
                  >
                    <span className="text-[9px] text-slate-300 w-28 truncate font-medium">{interaction.from}</span>
                    <div className="flex items-center gap-1 flex-1">
                      <div className={`flex-1 h-px ${isAnomalous ? 'bg-red-500/50' : 'bg-slate-600/50'}`} />
                      <span className={`text-[8px] font-medium px-1 ${TYPE_COLORS[interaction.type]}`}>
                        {interaction.type.replace('_', ' ')}
                      </span>
                      <ArrowRight className={`w-3 h-3 ${isAnomalous ? 'text-red-400' : 'text-slate-600'}`} />
                    </div>
                    <span className="text-[9px] text-slate-300 w-28 truncate font-medium">{interaction.to}</span>
                    <div className="flex items-center gap-2 ml-2">
                      <span className="text-[8px] text-slate-500">{interaction.frequency}/h</span>
                      <span className={`text-[8px] font-mono ${
                        interaction.anomalyScore > 0.5 ? 'text-red-400' :
                        interaction.anomalyScore > 0.2 ? 'text-amber-400' : 'text-slate-500'
                      }`}>
                        {interaction.anomalyScore.toFixed(2)}
                      </span>
                      {isAnomalous && <AlertTriangle className="w-3 h-3 text-red-400" />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Alert Detail */}
          {selected && (
            <div className={`p-3 rounded-lg border ${SEVERITY_STYLES[selected.severity].bg} ${SEVERITY_STYLES[selected.severity].border}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className={`w-4 h-4 ${SEVERITY_STYLES[selected.severity].text}`} />
                  <span className={`text-xs font-semibold ${SEVERITY_STYLES[selected.severity].text}`}>{selected.pattern}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${SEVERITY_STYLES[selected.severity].bg} ${SEVERITY_STYLES[selected.severity].text} border ${SEVERITY_STYLES[selected.severity].border}`}>
                    {selected.severity}
                  </span>
                </div>
                <span className={`px-1.5 py-0.5 rounded text-[8px] font-medium ${
                  selected.status === 'active' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                }`}>
                  {selected.status}
                </span>
              </div>
              <p className="text-[10px] text-slate-300 mb-2">{selected.description}</p>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[9px] text-slate-500">Agents involved:</span>
                {selected.agents.map(a => (
                  <span key={a} className="px-1.5 py-0.5 bg-slate-700/50 border border-slate-600/30 rounded text-[9px] text-slate-300">
                    {a}
                  </span>
                ))}
              </div>
              <div className="space-y-1">
                <span className="text-[9px] text-slate-500 font-medium">Evidence:</span>
                {selected.evidence.map((e, i) => (
                  <div key={i} className="flex items-start gap-1.5 ml-2">
                    <div className="w-1 h-1 rounded-full bg-slate-500 mt-1.5 flex-shrink-0" />
                    <span className="text-[9px] text-slate-400">{e}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Alerts Sidebar */}
        <div className="space-y-3">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">Conspiracy Alerts</span>
          {CONSPIRACY_ALERTS.map(alert => {
            const style = SEVERITY_STYLES[alert.severity];
            return (
              <div
                key={alert.id}
                onClick={() => setSelectedAlert(alert.id)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                  alert.id === selectedAlert
                    ? `${style.bg} ${style.border} ring-1 ring-white/5`
                    : 'bg-slate-800/20 border-slate-700/30 hover:border-slate-600/50'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className={`w-3 h-3 ${style.text}`} />
                  <span className="text-[10px] font-semibold text-slate-200">{alert.pattern}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-1 py-0.5 rounded text-[8px] font-bold uppercase ${style.bg} ${style.text}`}>
                    {alert.severity}
                  </span>
                  <span className="text-[8px] text-slate-500">{alert.agents.length} agents</span>
                  <span className={`text-[8px] ml-auto ${
                    alert.status === 'active' ? 'text-red-400' : 'text-amber-400'
                  }`}>
                    {alert.status}
                  </span>
                </div>
              </div>
            );
          })}

          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Detection Methods</h3>
            <div className="space-y-1.5">
              {[
                { method: 'Graph Centrality Analysis', status: 'active' },
                { method: 'Temporal Clustering (DBSCAN)', status: 'active' },
                { method: 'Data Boundary Cross-Reference', status: 'active' },
                { method: 'Communication Pattern Anomaly', status: 'active' },
                { method: 'Semantic Intent Extraction', status: 'active' },
              ].map(m => (
                <div key={m.method} className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-emerald-400" />
                  <span className="text-[9px] text-slate-300">{m.method}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gradient-to-br from-amber-500/5 to-red-600/5 border border-amber-500/20">
            <div className="flex items-center gap-1.5 mb-1">
              <Network className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-amber-400 font-semibold">vs Microsoft Agent 365</span>
            </div>
            <p className="text-[9px] text-slate-400 leading-relaxed">
              Microsoft governs agents individually. 0xDSI detects emergent multi-agent threats — collusion, information laundering, privilege escalation chains — that no single-agent analysis can find.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CrossAgentConspiracyDetection;
