import { useState, useEffect } from 'react';
import { ShieldAlert, Brain, Eye, Database, AlertTriangle, CheckCircle, XCircle, Clock, Activity, Fingerprint, Link2, Zap, ChevronRight, RefreshCw, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface MemoryIntegrityEvent {
  id: string;
  agent_id: string;
  session_id: string;
  memory_key: string;
  content_hash: string;
  content_preview: string;
  task_context: string;
  relevance_score: number;
  anomaly_flags: Array<{ type: string; confidence: number }>;
  verdict: string;
  chain_hash: string;
  previous_hash: string;
  created_at: string;
}

interface BehavioralDivergence {
  id: string;
  agent_id: string;
  baseline_session_id: string;
  divergent_session_id: string;
  tool_config_baseline: string[];
  tool_config_divergent: string[];
  behavior_baseline: { actions: string[]; tool_calls: number; memory_writes: number; avg_response_relevance: number };
  behavior_divergent: { actions: string[]; tool_calls: number; memory_writes: number; avg_response_relevance: number };
  divergence_score: number;
  mealy_signature_match: boolean;
  attack_phase_estimate: string;
  status: string;
  created_at: string;
}

interface CanaryDeployment {
  id: string;
  canary_string: string;
  canary_hash: string;
  deployment_target: string;
  injection_point: string;
  expected_propagation: string;
  actual_propagation: string;
  triggered: boolean;
  alert_severity: string;
  deployed_at: string;
  last_checked_at: string;
}

interface CorrelationRule {
  id: string;
  rule_name: string;
  description: string;
  detection_logic: Record<string, unknown>;
  attack_phase_coverage: string[];
  severity: string;
  enabled: boolean;
  trigger_count: number;
  created_at: string;
}

type TabId = 'memory' | 'divergence' | 'canary' | 'rules';

export default function StatefulBackdoorDefense() {
  const [activeTab, setActiveTab] = useState<TabId>('memory');
  const [memoryEvents, setMemoryEvents] = useState<MemoryIntegrityEvent[]>([]);
  const [divergences, setDivergences] = useState<BehavioralDivergence[]>([]);
  const [canaries, setCanaries] = useState<CanaryDeployment[]>([]);
  const [rules, setRules] = useState<CorrelationRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    const [memRes, divRes, canRes, ruleRes] = await Promise.all([
      supabase.from('memory_integrity_events').select('*').order('created_at', { ascending: false }),
      supabase.from('behavioral_divergence_detections').select('*').order('created_at', { ascending: false }),
      supabase.from('trigger_canary_deployments').select('*').order('deployed_at', { ascending: false }),
      supabase.from('stateful_backdoor_correlation_rules').select('*').order('severity', { ascending: true }),
    ]);
    if (memRes.data) setMemoryEvents(memRes.data);
    if (divRes.data) setDivergences(divRes.data);
    if (canRes.data) setCanaries(canRes.data);
    if (ruleRes.data) setRules(ruleRes.data);
    setLoading(false);
  }

  const stats = {
    totalMemoryWrites: memoryEvents.length,
    maliciousWrites: memoryEvents.filter(e => e.verdict === 'malicious').length,
    suspiciousWrites: memoryEvents.filter(e => e.verdict === 'suspicious').length,
    confirmedAttacks: divergences.filter(d => d.status === 'confirmed').length,
    mealyMatches: divergences.filter(d => d.mealy_signature_match).length,
    canariesDeployed: canaries.length,
    canariesTriggered: canaries.filter(c => c.triggered).length,
    activeRules: rules.filter(r => r.enabled).length,
  };

  const tabs: Array<{ id: TabId; label: string; icon: typeof Brain; count?: number; alert?: boolean }> = [
    { id: 'memory', label: 'Memory Integrity', icon: Database, count: stats.maliciousWrites + stats.suspiciousWrites, alert: stats.maliciousWrites > 0 },
    { id: 'divergence', label: 'Behavioral Divergence', icon: Activity, count: stats.confirmedAttacks, alert: stats.mealyMatches > 0 },
    { id: 'canary', label: 'Trigger Canaries', icon: Fingerprint, count: stats.canariesTriggered, alert: stats.canariesTriggered > 0 },
    { id: 'rules', label: 'Detection Rules', icon: Zap, count: stats.activeRules },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
            <ShieldAlert className="w-6 h-6 text-red-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Stateful Agent Backdoor Defense</h2>
            <p className="text-sm text-slate-400">Cross-session Mealy machine attack detection (arXiv:2605.06158)</p>
          </div>
        </div>
        <button onClick={loadData} className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-300 hover:bg-slate-600/50 transition-colors flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Stats Banner */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard label="Memory Writes Monitored" value={stats.totalMemoryWrites} color="cyan" />
        <StatCard label="Malicious Detections" value={stats.maliciousWrites} color="red" alert={stats.maliciousWrites > 0} />
        <StatCard label="Mealy Signature Matches" value={stats.mealyMatches} color="orange" alert={stats.mealyMatches > 0} />
        <StatCard label="Canaries Triggered" value={stats.canariesTriggered} color="red" alert={stats.canariesTriggered > 0} />
      </div>

      {/* Attack Flow Visualization */}
      <MealyMachineVisualizer divergences={divergences} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700/50 pb-px">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === tab.id
                ? 'bg-slate-800 text-white border border-slate-700 border-b-slate-800'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className={`px-1.5 py-0.5 text-xs rounded-full ${
                tab.alert ? 'bg-red-500/20 text-red-300' : 'bg-slate-600/50 text-slate-300'
              }`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6">
        {activeTab === 'memory' && <MemoryIntegrityTab events={memoryEvents} />}
        {activeTab === 'divergence' && <BehavioralDivergenceTab divergences={divergences} />}
        {activeTab === 'canary' && <TriggerCanaryTab canaries={canaries} />}
        {activeTab === 'rules' && <DetectionRulesTab rules={rules} />}
      </div>
    </div>
  );
}

function StatCard({ label, value, color, alert }: { label: string; value: number; color: string; alert?: boolean }) {
  const colorMap: Record<string, string> = {
    cyan: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/5',
    red: 'text-red-400 border-red-500/30 bg-red-500/5',
    orange: 'text-orange-400 border-orange-500/30 bg-orange-500/5',
    green: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  };
  return (
    <div className={`p-4 rounded-xl border ${colorMap[color]} ${alert ? 'animate-pulse' : ''}`}>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-slate-400 mt-1">{label}</div>
    </div>
  );
}

function MealyMachineVisualizer({ divergences }: { divergences: BehavioralDivergence[] }) {
  const confirmed = divergences.filter(d => d.status === 'confirmed');
  const phases = ['initiate', 'wait', 'collect', 'wait', 'exfil'];
  const activePhases = confirmed.map(d => d.attack_phase_estimate);

  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Brain className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-white">Mealy Machine Attack Flow - Live Detection</span>
        {confirmed.length > 0 && (
          <span className="ml-auto px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded text-xs text-red-300">
            ACTIVE ATTACK DETECTED
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto py-2">
        {phases.map((phase, i) => {
          const isActive = activePhases.includes(phase);
          const isPast = i < phases.findIndex(p => p === activePhases[activePhases.length - 1]);
          return (
            <div key={`${phase}-${i}`} className="flex items-center gap-2">
              <div className={`px-4 py-2 rounded-lg border text-sm font-mono whitespace-nowrap ${
                isActive
                  ? 'bg-red-500/20 border-red-500/50 text-red-300 shadow-lg shadow-red-500/10'
                  : isPast
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                    : 'bg-slate-800/50 border-slate-700/50 text-slate-500'
              }`}>
                <div className="text-xs opacity-60 mb-0.5">S{i}</div>
                {phase}
              </div>
              {i < phases.length - 1 && (
                <ChevronRight className={`w-4 h-4 flex-shrink-0 ${isPast || isActive ? 'text-orange-400' : 'text-slate-600'}`} />
              )}
            </div>
          );
        })}
      </div>
      {confirmed.length > 0 && (
        <div className="mt-3 text-xs text-red-300/70 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          Agent <span className="font-mono text-red-300">{confirmed[0].agent_id}</span> has progressed through {confirmed.length} attack phase(s)
        </div>
      )}
    </div>
  );
}

function MemoryIntegrityTab({ events }: { events: MemoryIntegrityEvent[] }) {
  const [filter, setFilter] = useState<'all' | 'malicious' | 'suspicious' | 'clean'>('all');
  const filtered = filter === 'all' ? events : events.filter(e => e.verdict === filter);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Monitors every write to agent persistent memory. Flags state-machine patterns, encoded payloads, and low-relevance writes.
        </p>
        <div className="flex gap-1">
          {(['all', 'malicious', 'suspicious', 'clean'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 text-xs rounded ${
                filter === f ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filtered.map(event => (
          <MemoryEventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  );
}

function MemoryEventRow({ event }: { event: MemoryIntegrityEvent }) {
  const [expanded, setExpanded] = useState(false);
  const verdictColor = {
    clean: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    suspicious: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    malicious: 'text-red-400 bg-red-500/10 border-red-500/30',
  }[event.verdict] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';

  return (
    <div className={`border rounded-lg p-3 transition-colors ${
      event.verdict === 'malicious' ? 'border-red-500/30 bg-red-500/5' :
      event.verdict === 'suspicious' ? 'border-yellow-500/30 bg-yellow-500/5' :
      'border-slate-700/50 bg-slate-800/30'
    }`}>
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {event.verdict === 'malicious' ? <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" /> :
         event.verdict === 'suspicious' ? <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" /> :
         <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
        <span className="text-sm font-mono text-slate-300">{event.agent_id}</span>
        <span className="text-xs text-slate-500">{event.session_id}</span>
        <span className="text-xs font-mono text-cyan-400/70">{event.memory_key}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500">relevance: </span>
          <RelevanceBar score={event.relevance_score} />
          <span className={`px-1.5 py-0.5 text-xs rounded border ${verdictColor}`}>{event.verdict}</span>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pl-7 space-y-2 border-t border-slate-700/50 pt-3">
          <div className="grid grid-cols-2 gap-4 text-xs">
            <div>
              <span className="text-slate-500">Content Preview:</span>
              <pre className="mt-1 p-2 bg-slate-900/50 rounded text-slate-300 font-mono text-xs overflow-x-auto">{event.content_preview}</pre>
            </div>
            <div>
              <span className="text-slate-500">Task Context:</span>
              <p className="mt-1 text-slate-300">{event.task_context}</p>
            </div>
          </div>
          {event.anomaly_flags.length > 0 && (
            <div>
              <span className="text-xs text-slate-500">Anomaly Flags:</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {event.anomaly_flags.map((flag, i) => (
                  <span key={i} className="px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded text-xs text-red-300">
                    {flag.type} ({(flag.confidence * 100).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-4 text-xs text-slate-500">
            <span>Hash: <code className="text-slate-400">{event.content_hash}</code></span>
            <span>Chain: <code className="text-slate-400">{event.chain_hash}</code></span>
            {event.previous_hash && <span>Prev: <code className="text-slate-400">{event.previous_hash}</code></span>}
          </div>
        </div>
      )}
    </div>
  );
}

function RelevanceBar({ score }: { score: number }) {
  const color = score > 0.7 ? 'bg-emerald-400' : score > 0.3 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${score * 100}%` }} />
    </div>
  );
}

function BehavioralDivergenceTab({ divergences }: { divergences: BehavioralDivergence[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Detects agents whose behavior changes when different tools become available - the hallmark of a Mealy machine backdoor waiting for specific tool configurations to execute attack phases.
      </p>
      <div className="space-y-3">
        {divergences.map(d => (
          <DivergenceCard key={d.id} detection={d} />
        ))}
      </div>
    </div>
  );
}

function DivergenceCard({ detection }: { detection: BehavioralDivergence }) {
  const [expanded, setExpanded] = useState(false);
  const statusColor = {
    confirmed: 'text-red-400 bg-red-500/10 border-red-500/30',
    investigating: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    false_positive: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  }[detection.status] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';

  return (
    <div className={`border rounded-lg p-4 ${
      detection.mealy_signature_match ? 'border-red-500/40 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/30'
    }`}>
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        {detection.mealy_signature_match ? (
          <div className="p-1.5 bg-red-500/20 rounded">
            <Brain className="w-4 h-4 text-red-400" />
          </div>
        ) : (
          <div className="p-1.5 bg-slate-700/50 rounded">
            <Activity className="w-4 h-4 text-slate-400" />
          </div>
        )}
        <div>
          <span className="text-sm font-mono text-white">{detection.agent_id}</span>
          {detection.mealy_signature_match && (
            <span className="ml-2 px-1.5 py-0.5 text-xs bg-red-500/20 border border-red-500/40 rounded text-red-300">
              MEALY MATCH
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <DivergenceScoreRing score={detection.divergence_score} />
          <span className={`px-2 py-0.5 text-xs rounded border ${statusColor}`}>{detection.status.replace('_', ' ')}</span>
          {detection.attack_phase_estimate !== 'none' && detection.attack_phase_estimate !== 'unknown' && (
            <span className="px-2 py-0.5 text-xs bg-orange-500/20 border border-orange-500/30 rounded text-orange-300 font-mono">
              phase: {detection.attack_phase_estimate}
            </span>
          )}
        </div>
      </div>
      {expanded && (
        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-700/50 pt-4">
          <BehaviorPanel label="Baseline Behavior" session={detection.baseline_session_id} tools={detection.tool_config_baseline} behavior={detection.behavior_baseline} />
          <BehaviorPanel label="Divergent Behavior" session={detection.divergent_session_id} tools={detection.tool_config_divergent} behavior={detection.behavior_divergent} alert />
        </div>
      )}
    </div>
  );
}

function BehaviorPanel({ label, session, tools, behavior, alert }: {
  label: string; session: string; tools: string[]; behavior: BehavioralDivergence['behavior_baseline']; alert?: boolean;
}) {
  return (
    <div className={`p-3 rounded-lg border ${alert ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
      <div className="text-xs font-medium text-slate-300 mb-2">{label}</div>
      <div className="text-xs text-slate-500 mb-2">Session: <code>{session}</code></div>
      <div className="flex flex-wrap gap-1 mb-2">
        {tools.map((t, i) => (
          <span key={i} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-xs text-cyan-400 font-mono">{t}</span>
        ))}
      </div>
      <div className="space-y-1 text-xs">
        <div className="text-slate-400">Actions: <span className="text-slate-200">{behavior.actions?.join(' → ')}</span></div>
        <div className="text-slate-400">Tool calls: <span className="text-slate-200">{behavior.tool_calls}</span></div>
        <div className="text-slate-400">Memory writes: <span className="text-slate-200">{behavior.memory_writes}</span></div>
        <div className="text-slate-400">
          Task relevance:{' '}
          <span className={behavior.avg_response_relevance < 0.3 ? 'text-red-300' : 'text-emerald-300'}>
            {(behavior.avg_response_relevance * 100).toFixed(0)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function DivergenceScoreRing({ score }: { score: number }) {
  const color = score > 0.7 ? 'text-red-400' : score > 0.4 ? 'text-yellow-400' : 'text-emerald-400';
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative w-8 h-8">
        <svg className="w-8 h-8 -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-slate-700" />
          <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" className={color}
            strokeDasharray={`${score * 75.4} 75.4`} strokeLinecap="round" />
        </svg>
        <span className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold ${color}`}>
          {(score * 100).toFixed(0)}
        </span>
      </div>
    </div>
  );
}

function TriggerCanaryTab({ canaries }: { canaries: CanaryDeployment[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Unique canary strings are injected into agent prompts. If any canary appears in persistent memory, it proves the agent is persisting prompt content across sessions - a prerequisite for stateful backdoor attacks.
      </p>
      <div className="grid grid-cols-1 gap-2">
        {canaries.map(c => (
          <CanaryRow key={c.id} canary={c} />
        ))}
      </div>
    </div>
  );
}

function CanaryRow({ canary }: { canary: CanaryDeployment }) {
  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${
      canary.triggered ? 'border-red-500/40 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/30'
    }`}>
      {canary.triggered ? (
        <div className="p-1.5 bg-red-500/20 rounded-full">
          <AlertTriangle className="w-4 h-4 text-red-400" />
        </div>
      ) : (
        <div className="p-1.5 bg-emerald-500/10 rounded-full">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
        </div>
      )}
      <div className="flex-1 grid grid-cols-6 gap-4 items-center text-sm">
        <code className="text-cyan-400 font-mono text-xs">{canary.canary_string}</code>
        <span className="text-slate-300 font-mono text-xs">{canary.deployment_target}</span>
        <span className="text-slate-500 text-xs">{canary.injection_point.replace(/_/g, ' ')}</span>
        <div className="text-xs">
          {canary.triggered ? (
            <span className="text-red-300">Found in: <code className="text-red-400">{canary.actual_propagation}</code></span>
          ) : (
            <span className="text-emerald-400">No propagation</span>
          )}
        </div>
        <span className={`px-2 py-0.5 text-xs rounded text-center ${
          canary.alert_severity === 'critical' ? 'bg-red-500/20 text-red-300' :
          canary.alert_severity === 'high' ? 'bg-orange-500/20 text-orange-300' :
          'bg-slate-600/30 text-slate-400'
        }`}>
          {canary.alert_severity}
        </span>
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(canary.last_checked_at).toLocaleTimeString()}
        </span>
      </div>
    </div>
  );
}

function DetectionRulesTab({ rules }: { rules: CorrelationRule[] }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-400">
        Correlation rules specifically designed to detect stateful backdoor attack patterns across the Mealy machine lifecycle.
      </p>
      <div className="space-y-2">
        {rules.map(rule => (
          <RuleCard key={rule.id} rule={rule} />
        ))}
      </div>
    </div>
  );
}

function RuleCard({ rule }: { rule: CorrelationRule }) {
  const [expanded, setExpanded] = useState(false);
  const severityColor = {
    critical: 'text-red-400 bg-red-500/10 border-red-500/30',
    high: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
    medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    low: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
  }[rule.severity] || 'text-slate-400 bg-slate-500/10 border-slate-500/30';

  return (
    <div className="border border-slate-700/50 rounded-lg p-3 bg-slate-800/30">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <Shield className={`w-4 h-4 ${rule.enabled ? 'text-emerald-400' : 'text-slate-600'}`} />
        <span className="text-sm text-white font-medium">{rule.rule_name}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex gap-1">
            {rule.attack_phase_coverage.map((phase, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] font-mono text-cyan-400">
                {phase}
              </span>
            ))}
          </div>
          <span className={`px-1.5 py-0.5 text-xs rounded border ${severityColor}`}>{rule.severity}</span>
          <span className={`w-2 h-2 rounded-full ${rule.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
        </div>
      </div>
      {expanded && (
        <div className="mt-3 border-t border-slate-700/50 pt-3 space-y-2">
          <p className="text-xs text-slate-300">{rule.description}</p>
          <pre className="p-2 bg-slate-900/50 rounded text-xs text-slate-400 font-mono overflow-x-auto">
            {JSON.stringify(rule.detection_logic, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
