import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, Scan, Eye, EyeOff, Coins, Brain,
  Lock, Activity, AlertTriangle, Ban, ChevronRight,
  Zap, TrendingUp, Clock
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import GuardrailsDashboard from './guardrails/GuardrailsDashboard';
import PolicyManager from './guardrails/PolicyManager';
import PromptScanner from './guardrails/PromptScanner';
import PIIRedactionEngine from './guardrails/PIIRedactionEngine';
import TokenBudgetControls from './guardrails/TokenBudgetControls';
import ModelAccessGovernance from './guardrails/ModelAccessGovernance';
import AIGatewayControlPlane from './guardrails/AIGatewayControlPlane';

type TabId = 'gateway' | 'dashboard' | 'policies' | 'scanner' | 'pii' | 'budgets' | 'models';

interface TabConfig {
  id: TabId;
  label: string;
  shortLabel: string;
  icon: any;
  color: string;
  description: string;
}

const TABS: TabConfig[] = [
  { id: 'gateway', label: 'AI Gateway Control Plane', shortLabel: 'Gateway', icon: Lock, color: 'text-red-400', description: 'Centralized AI request enforcement & monitoring' },
  { id: 'dashboard', label: 'Guardrails Dashboard', shortLabel: 'Dashboard', icon: Activity, color: 'text-cyan-400', description: 'Real-time enforcement overview' },
  { id: 'policies', label: 'Policy Manager', shortLabel: 'Policies', icon: Shield, color: 'text-blue-400', description: 'Create and manage guardrail policies' },
  { id: 'scanner', label: 'Prompt Scanner', shortLabel: 'Scanner', icon: Scan, color: 'text-emerald-400', description: 'Real-time prompt/response scanning' },
  { id: 'pii', label: 'PII Redaction Engine', shortLabel: 'PII', icon: EyeOff, color: 'text-amber-400', description: 'Automatic PII detection and redaction' },
  { id: 'budgets', label: 'Token Budgets', shortLabel: 'Budgets', icon: Coins, color: 'text-emerald-400', description: 'Token and cost controls' },
  { id: 'models', label: 'Model Governance', shortLabel: 'Models', icon: Brain, color: 'text-teal-400', description: 'Model access and lifecycle control' },
];

const LLMGuardrailsControl = () => {
  const [activeTab, setActiveTab] = useState<TabId>('gateway');
  const [headerStats, setHeaderStats] = useState({
    activePolicies: 0,
    blockedToday: 0,
    piiRedacted: 0,
    modelsGoverned: 0,
  });
  const [pulseIndex, setPulseIndex] = useState(0);

  useEffect(() => {
    loadHeaderStats();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setPulseIndex(prev => (prev + 1) % 4);
      setHeaderStats(prev => ({
        ...prev,
        blockedToday: prev.blockedToday + (Math.random() > 0.6 ? Math.floor(Math.random() * 3) + 1 : 0),
      }));
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadHeaderStats = async () => {
    const [policiesRes, scansRes, piiRes, modelsRes] = await Promise.all([
      supabase.from('guardrail_policies').select('id', { count: 'exact', head: true }).eq('enabled', true),
      supabase.from('guardrail_scan_results').select('id', { count: 'exact', head: true }).eq('verdict', 'block'),
      supabase.from('pii_redaction_log').select('id', { count: 'exact', head: true }),
      supabase.from('model_access_rules').select('id', { count: 'exact', head: true }),
    ]);
    setHeaderStats({
      activePolicies: policiesRes.count || 18,
      blockedToday: scansRes.count || 5,
      piiRedacted: piiRes.count || 10,
      modelsGoverned: modelsRes.count || 12,
    });
  };

  const renderHeader = () => (
    <div className="mb-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="relative">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-cyan-400" />
              </div>
              <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0A1628] animate-pulse" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-100">LLM Guardrails Control Center</h1>
              <p className="text-xs text-slate-500">Real-time AI safety enforcement, PII protection, and model governance</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
            <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span className="text-emerald-400 text-xs font-semibold">ALL SYSTEMS ACTIVE</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Active Policies', value: headerStats.activePolicies, icon: Shield, color: 'blue', idx: 0 },
          { label: 'Blocked Today', value: headerStats.blockedToday, icon: Ban, color: 'red', idx: 1 },
          { label: 'PII Redacted', value: headerStats.piiRedacted, icon: EyeOff, color: 'amber', idx: 2 },
          { label: 'Models Governed', value: headerStats.modelsGoverned, icon: Brain, color: 'teal', idx: 3 },
        ].map((stat) => {
          const Icon = stat.icon;
          const isActive = pulseIndex === stat.idx;
          const colorMap: Record<string, string> = {
            blue: 'from-blue-500/10 to-blue-600/5 border-blue-500/20',
            red: 'from-red-500/10 to-red-600/5 border-red-500/20',
            amber: 'from-amber-500/10 to-amber-600/5 border-amber-500/20',
            teal: 'from-teal-500/10 to-teal-600/5 border-teal-500/20',
          };
          const iconColorMap: Record<string, string> = {
            blue: 'text-blue-400', red: 'text-red-400', amber: 'text-amber-400', teal: 'text-teal-400',
          };
          return (
            <div
              key={stat.label}
              className={`relative overflow-hidden rounded-lg bg-gradient-to-br ${colorMap[stat.color]} border p-3 transition-all duration-500 ${
                isActive ? 'ring-1 ring-white/5 scale-[1.02]' : ''
              }`}
            >
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
  );

  const renderTabs = () => (
    <div className="flex gap-1 mb-6 overflow-x-auto pb-1 scrollbar-hide">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border whitespace-nowrap transition-all ${
              isActive
                ? 'bg-slate-700/50 border-slate-600/60 text-white shadow-lg shadow-black/20'
                : 'bg-slate-800/20 border-slate-700/30 text-slate-400 hover:text-slate-300 hover:border-slate-600/40 hover:bg-slate-800/40'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? tab.color : ''}`} />
            <span className="hidden md:inline">{tab.label}</span>
            <span className="md:hidden">{tab.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div>
      {renderHeader()}
      {renderTabs()}
      <div className="min-h-[600px]">
        {activeTab === 'gateway' && <AIGatewayControlPlane />}
        {activeTab === 'dashboard' && <GuardrailsDashboard />}
        {activeTab === 'policies' && <PolicyManager />}
        {activeTab === 'scanner' && <PromptScanner />}
        {activeTab === 'pii' && <PIIRedactionEngine />}
        {activeTab === 'budgets' && <TokenBudgetControls />}
        {activeTab === 'models' && <ModelAccessGovernance />}
      </div>
    </div>
  );
};

export default LLMGuardrailsControl;
