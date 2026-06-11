import { useState, useEffect } from 'react';
import { Fingerprint, GitBranch, Database, Shield, Crosshair, Users, TrendingUp, Lock } from 'lucide-react';
import AgentIdentityFabric from './AgentIdentityFabric';
import AgentLifecycleOrchestrator from './AgentLifecycleOrchestrator';
import ImmutableAuditLedger from './ImmutableAuditLedger';
import AdversarialRedTeamEngine from './AdversarialRedTeamEngine';
import CrossAgentConspiracyDetection from './CrossAgentConspiracyDetection';
import PredictiveThreatForecasting from './PredictiveThreatForecasting';

type TabId = 'identity' | 'lifecycle' | 'audit' | 'redteam' | 'conspiracy' | 'forecast';

interface TabConfig {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: any;
  color: string;
}

const TABS: TabConfig[] = [
  { id: 'identity', label: 'Agent Identity Fabric', shortLabel: 'Identity', icon: Fingerprint, color: 'text-cyan-400' },
  { id: 'lifecycle', label: 'Lifecycle Orchestrator', shortLabel: 'Lifecycle', icon: GitBranch, color: 'text-emerald-400' },
  { id: 'audit', label: 'Immutable Audit Ledger', shortLabel: 'Audit', icon: Database, color: 'text-amber-400' },
  { id: 'redteam', label: 'Adversarial Red Team', shortLabel: 'Red Team', icon: Crosshair, color: 'text-red-400' },
  { id: 'conspiracy', label: 'Conspiracy Detection', shortLabel: 'Conspiracy', icon: Users, color: 'text-orange-400' },
  { id: 'forecast', label: 'Predictive Forecasting', shortLabel: 'Forecast', icon: TrendingUp, color: 'text-blue-400' },
];

const Agent365ControlPlane = () => {
  const [activeTab, setActiveTab] = useState<TabId>('identity');
  const [pulseIndex, setPulseIndex] = useState(0);
  const [liveCounter, setLiveCounter] = useState({ agents: 60, transitions: 847, auditEntries: 1247832, threats: 2847 });

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex(prev => (prev + 1) % 4);
      setLiveCounter(prev => ({
        ...prev,
        auditEntries: prev.auditEntries + Math.floor(Math.random() * 3) + 1,
        threats: prev.threats + (Math.random() > 0.7 ? 1 : 0),
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-600/20 border border-cyan-500/30 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0A1628] animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-100">Agent 365 Control Plane</h1>
                <p className="text-xs text-slate-500">Identity, lifecycle, governance, and adversarial testing for all AI agents</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
              <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
              <span className="text-cyan-400 text-xs font-semibold">DECENTRALIZED IDENTITY</span>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Agents Governed', value: liveCounter.agents, icon: Lock, color: 'cyan', idx: 0 },
            { label: 'State Transitions', value: liveCounter.transitions, icon: GitBranch, color: 'emerald', idx: 1 },
            { label: 'Audit Entries', value: liveCounter.auditEntries.toLocaleString(), icon: Database, color: 'amber', idx: 2 },
            { label: 'Threats Blocked', value: liveCounter.threats.toLocaleString(), icon: Shield, color: 'red', idx: 3 },
          ].map((stat) => {
            const Icon = stat.icon;
            const isActive = pulseIndex === stat.idx;
            const colorMap: Record<string, string> = { cyan: 'from-cyan-500/10 to-cyan-600/5 border-cyan-500/20', emerald: 'from-emerald-500/10 to-emerald-600/5 border-emerald-500/20', amber: 'from-amber-500/10 to-amber-600/5 border-amber-500/20', red: 'from-red-500/10 to-red-600/5 border-red-500/20' };
            const iconColorMap: Record<string, string> = { cyan: 'text-cyan-400', emerald: 'text-emerald-400', amber: 'text-amber-400', red: 'text-red-400' };
            return (
              <div key={stat.label} className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${colorMap[stat.color]} border p-3 transition-all duration-500 ${isActive ? 'ring-1 ring-white/5 scale-[1.02]' : ''}`}>
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${iconColorMap[stat.color]}`} />
                  <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">{stat.label}</span>
                </div>
                <p className="text-xl font-bold text-white mt-1 tabular-nums">{stat.value}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-hide">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border whitespace-nowrap transition-all ${isActive ? 'bg-slate-700/50 border-slate-600/60 text-white shadow-lg shadow-black/20' : 'bg-slate-800/20 border-slate-700/30 text-slate-400 hover:text-slate-300 hover:border-slate-600/40 hover:bg-slate-800/40'}`}>
              <Icon className={`w-4 h-4 ${isActive ? tab.color : ''}`} />
              <span className="hidden md:inline">{tab.label}</span>
              <span className="md:hidden">{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="min-h-[600px]">
        {activeTab === 'identity' && <AgentIdentityFabric />}
        {activeTab === 'lifecycle' && <AgentLifecycleOrchestrator />}
        {activeTab === 'audit' && <ImmutableAuditLedger />}
        {activeTab === 'redteam' && <AdversarialRedTeamEngine />}
        {activeTab === 'conspiracy' && <CrossAgentConspiracyDetection />}
        {activeTab === 'forecast' && <PredictiveThreatForecasting />}
      </div>
    </div>
  );
};

export default Agent365ControlPlane;
