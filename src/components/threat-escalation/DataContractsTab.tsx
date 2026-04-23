import { useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Banknote, Brain, Bug, Building2, CheckCircle2, ChevronRight,
  Cloud, Coins, Cpu, CreditCard, DoorClosed, Download, FileSpreadsheet, FileWarning,
  Gauge, GitBranch, HeartPulse, KeyRound, Landmark, Layers, Loader2, Network, Package,
  Power, Radar, Scale, Search, Shield, ShieldAlert, ShieldCheck, Sparkles, Timer,
  TrendingUp, UserCog, Users, UserX, Waves, Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

type Engine = 'regular' | 'graph' | 'user' | 'hybrid';
interface Contract {
  id: string;
  contract_code: string;
  contract_name: string;
  category: string;
  engine_type: Engine;
  description: string;
  compliance_frameworks: string[];
  severity_floor: string;
  sla_minutes: number;
  parameters: Record<string, any>;
  triggers: string[];
  escalation_path: string[];
  sample_signals: Record<string, any>;
  icon: string;
  color: string;
  is_active: boolean;
}

const ICONS: Record<string, any> = {
  CreditCard, FileSpreadsheet, Banknote, Scale, HeartPulse, ShieldCheck, DoorClosed, Cpu,
  Download, Network, KeyRound, UserX, Cloud, Brain, Bug, Package, Users, UserCog,
  FileWarning, Landmark, Building2, Coins, Shield, ShieldAlert, Radar, Sparkles,
};

const CATEGORIES: Array<{ key: string; label: string; accent: string }> = [
  { key: 'all', label: 'All Contracts', accent: 'slate' },
  { key: 'grc', label: 'GRC', accent: 'cyan' },
  { key: 'compliance', label: 'Compliance', accent: 'blue' },
  { key: 'transactions', label: 'Transactions', accent: 'rose' },
  { key: 'fraud', label: 'Fraud', accent: 'rose' },
  { key: 'physical', label: 'Physical', accent: 'amber' },
  { key: 'ot_ics', label: 'OT / ICS', accent: 'orange' },
  { key: 'logical', label: 'Logical', accent: 'emerald' },
  { key: 'network', label: 'Network', accent: 'blue' },
  { key: 'identity', label: 'Identity', accent: 'teal' },
  { key: 'cloud', label: 'Cloud', accent: 'sky' },
  { key: 'ai_governance', label: 'AI Governance', accent: 'emerald' },
  { key: 'supply_chain', label: 'Supply Chain', accent: 'amber' },
  { key: 'insider', label: 'Insider', accent: 'pink' },
  { key: 'data_protection', label: 'Data Protection', accent: 'emerald' },
];

const ENGINE_META: Record<Engine, { label: string; icon: any; color: string; gradient: string; bar: string; subtitle: string }> = {
  regular: { label: 'Priority Engine', icon: Gauge, color: 'text-amber-300', gradient: 'from-amber-500/30 to-amber-500/0 border-amber-500/40', bar: 'bg-amber-400', subtitle: 'S × MCR × TW × AC' },
  graph:   { label: 'Graph Pattern Engine', icon: Network, color: 'text-cyan-300', gradient: 'from-cyan-500/30 to-cyan-500/0 border-cyan-500/40', bar: 'bg-cyan-400', subtitle: 'Σ w·signal + criticality' },
  user:    { label: 'User Risk Engine', icon: UserCog, color: 'text-pink-300', gradient: 'from-pink-500/30 to-pink-500/0 border-pink-500/40', bar: 'bg-pink-400', subtitle: 'behavioral + psych + DLP' },
  hybrid:  { label: 'Hybrid Orchestrator', icon: Sparkles, color: 'text-emerald-300', gradient: 'from-emerald-500/30 to-emerald-500/0 border-emerald-500/40', bar: 'bg-emerald-400', subtitle: 'blended score' },
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-300 border-red-500/40',
  high: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
  low: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
};

const COLOR_GRAD: Record<string, string> = {
  rose:    'from-rose-500/25 via-rose-500/5 to-transparent border-rose-500/40',
  red:     'from-red-500/25 via-red-500/5 to-transparent border-red-500/40',
  amber:   'from-amber-500/25 via-amber-500/5 to-transparent border-amber-500/40',
  orange:  'from-orange-500/25 via-orange-500/5 to-transparent border-orange-500/40',
  cyan:    'from-cyan-500/25 via-cyan-500/5 to-transparent border-cyan-500/40',
  blue:    'from-blue-500/25 via-blue-500/5 to-transparent border-blue-500/40',
  sky:     'from-sky-500/25 via-sky-500/5 to-transparent border-sky-500/40',
  emerald: 'from-emerald-500/25 via-emerald-500/5 to-transparent border-emerald-500/40',
  teal:    'from-teal-500/25 via-teal-500/5 to-transparent border-teal-500/40',
  pink:    'from-pink-500/25 via-pink-500/5 to-transparent border-pink-500/40',
  slate:   'from-slate-500/25 via-slate-500/5 to-transparent border-slate-500/40',
};

const COLOR_TEXT: Record<string, string> = {
  rose: 'text-rose-300', red: 'text-red-300', amber: 'text-amber-300', orange: 'text-orange-300',
  cyan: 'text-cyan-300', blue: 'text-blue-300', sky: 'text-sky-300', emerald: 'text-emerald-300',
  teal: 'text-teal-300', pink: 'text-pink-300', slate: 'text-slate-300',
};

export default function DataContractsTab() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Contract | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from('threat_escalation_contracts').select('*').order('contract_code');
    setContracts((data || []) as Contract[]);
    if (data && data.length && !selected) setSelected(data[0] as Contract);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return contracts.filter(c => {
      if (category !== 'all' && c.category !== category) return false;
      if (!query) return true;
      const q = query.toLowerCase();
      return [c.contract_code, c.contract_name, c.description, ...(c.compliance_frameworks || [])].some(s => (s || '').toLowerCase().includes(q));
    });
  }, [contracts, category, query]);

  const stats = useMemo(() => {
    const total = contracts.length;
    const active = contracts.filter(c => c.is_active).length;
    const byEngine = contracts.reduce<Record<string, number>>((acc, c) => {
      acc[c.engine_type] = (acc[c.engine_type] || 0) + 1;
      return acc;
    }, {});
    const avgSla = total ? Math.round(contracts.reduce((s, c) => s + c.sla_minutes, 0) / total) : 0;
    return { total, active, byEngine, avgSla };
  }, [contracts]);

  const toggleActive = async (c: Contract) => {
    const next = !c.is_active;
    await supabase.from('threat_escalation_contracts').update({ is_active: next }).eq('id', c.id);
    setContracts(prev => prev.map(p => p.id === c.id ? { ...p, is_active: next } : p));
    if (selected?.id === c.id) setSelected({ ...c, is_active: next });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading data contracts...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-gradient-to-br from-[#05070f] via-[#0a1021] to-[#05070f] p-6">
        <div className="absolute inset-0 opacity-60 pointer-events-none" style={{
          backgroundImage:
            'radial-gradient(circle at 15% 20%, rgba(16,185,129,0.15), transparent 45%), radial-gradient(circle at 85% 30%, rgba(6,182,212,0.12), transparent 50%), radial-gradient(circle at 60% 95%, rgba(244,63,94,0.10), transparent 55%)'
        }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center gap-6 justify-between">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
                <Layers className="w-5 h-5 text-emerald-300" />
              </div>
              <h3 className="text-lg font-semibold text-white">Threat Escalation Data Contracts</h3>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold tracking-wider bg-emerald-500/10 border border-emerald-500/40 text-emerald-300">
                {contracts.length} REGISTERED
              </span>
            </div>
            <p className="text-sm text-slate-400 max-w-3xl leading-relaxed">
              A data contract declares the <span className="text-white font-semibold">GRC domain</span>, the
              <span className="text-white font-semibold"> engine</span> that scores it, the
              <span className="text-white font-semibold"> parameters</span> it loads, and the
              <span className="text-white font-semibold"> compliance frameworks</span> it satisfies. When an event fires a contract,
              the orchestrator swaps in those parameters so the same event is scored through the lens of the policy that governs it.
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 lg:w-[460px]">
            <HeroStat label="Total" value={String(stats.total)} icon={Layers} accent="emerald" />
            <HeroStat label="Active" value={String(stats.active)} icon={Power} accent="cyan" />
            <HeroStat label="Engines" value={String(Object.keys(stats.byEngine).length)} icon={GitBranch} accent="amber" />
            <HeroStat label="Avg SLA" value={`${stats.avgSla}m`} icon={Timer} accent="rose" />
          </div>
        </div>
      </div>

      {/* Engine flow diagram */}
      <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <div className="absolute inset-0 opacity-30 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(0deg, rgba(148,163,184,0.06) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }} />
        <div className="relative flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700">
            <Activity className="w-4 h-4 text-slate-300" />
            <span className="text-xs font-semibold text-slate-200">Raw Event</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-br from-emerald-500/15 to-slate-900 border border-emerald-500/40">
            <Layers className="w-4 h-4 text-emerald-300" />
            <span className="text-xs font-semibold text-emerald-200">Contract Match</span>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(ENGINE_META) as Engine[]).map(e => {
              const meta = ENGINE_META[e];
              const E = meta.icon;
              const count = stats.byEngine[e] || 0;
              return (
                <div key={e} className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-br ${meta.gradient} border`}>
                  <E className={`w-4 h-4 ${meta.color}`} />
                  <div className="leading-tight">
                    <div className={`text-[11px] font-bold ${meta.color}`}>{meta.label}</div>
                    <div className="text-[9px] font-mono text-slate-400">{count} contracts &middot; {meta.subtitle}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <ChevronRight className="w-4 h-4 text-slate-600" />
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-br from-red-500/15 to-slate-900 border border-red-500/40">
            <AlertTriangle className="w-4 h-4 text-red-300" />
            <span className="text-xs font-semibold text-red-200">Escalation Path</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search contracts, frameworks, triggers..."
            className="w-full bg-slate-900/60 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map(cat => (
            <button
              key={cat.key}
              onClick={() => setCategory(cat.key)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-semibold border transition ${
                category === cat.key
                  ? `bg-${cat.accent}-500/20 border-${cat.accent}-400/60 ${COLOR_TEXT[cat.accent] || 'text-white'}`
                  : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contract grid + detail pane */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 content-start">
          {filtered.map(c => (
            <ContractCard key={c.id} contract={c} isSelected={selected?.id === c.id} onClick={() => setSelected(c)} onToggle={() => toggleActive(c)} />
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12 text-slate-500 text-sm">No contracts match this filter.</div>
          )}
        </div>

        <div className="xl:col-span-1">
          {selected ? <ContractDetail contract={selected} /> : (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-slate-400 text-sm">
              Select a contract to view its specification.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HeroStat({ label, value, icon: Icon, accent }: { label: string; value: string; icon: any; accent: string }) {
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${COLOR_GRAD[accent] || COLOR_GRAD.slate} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={`w-3.5 h-3.5 ${COLOR_TEXT[accent]}`} />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold tabular-nums ${COLOR_TEXT[accent]}`}>{value}</div>
    </div>
  );
}

function ContractCard({ contract, isSelected, onClick, onToggle }: { contract: Contract; isSelected: boolean; onClick: () => void; onToggle: () => void }) {
  const Icon = ICONS[contract.icon] || Shield;
  const engineMeta = ENGINE_META[contract.engine_type];
  const EngineIcon = engineMeta.icon;

  return (
    <div
      onClick={onClick}
      className={`relative cursor-pointer overflow-hidden rounded-2xl border bg-gradient-to-br ${COLOR_GRAD[contract.color] || COLOR_GRAD.slate} p-4 transition hover:scale-[1.01] hover:shadow-lg ${
        isSelected ? 'ring-2 ring-emerald-400/60' : ''
      } ${!contract.is_active ? 'opacity-60' : ''}`}
    >
      {/* Glow */}
      <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30 pointer-events-none" style={{
        background: `radial-gradient(circle, ${colorHex(contract.color)}, transparent 70%)`
      }} />

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-lg bg-slate-900/80 border ${COLOR_GRAD[contract.color]?.split(' ').find(c => c.startsWith('border-')) || 'border-slate-700'}`}>
              <Icon className={`w-5 h-5 ${COLOR_TEXT[contract.color] || 'text-slate-200'}`} />
            </div>
            <div className="min-w-0">
              <div className="text-[9px] font-mono tracking-wider text-slate-500">{contract.contract_code}</div>
              <div className="text-sm font-semibold text-white leading-tight line-clamp-2">{contract.contract_name}</div>
            </div>
          </div>
          <button
            onClick={e => { e.stopPropagation(); onToggle(); }}
            className={`relative w-9 h-5 rounded-full transition shrink-0 ${contract.is_active ? 'bg-emerald-500/70' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition ${contract.is_active ? 'left-4' : 'left-0.5'}`} />
          </button>
        </div>

        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed mb-3">{contract.description}</p>

        <div className="flex flex-wrap gap-1.5 mb-3">
          {contract.compliance_frameworks?.slice(0, 3).map(f => (
            <span key={f} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-900/80 text-slate-300 border border-slate-700">{f}</span>
          ))}
          {contract.compliance_frameworks?.length > 3 && (
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-900/80 text-slate-500 border border-slate-800">+{contract.compliance_frameworks.length - 3}</span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border bg-slate-900/60 ${engineMeta.gradient.split(' ').find(c => c.startsWith('border-')) || 'border-slate-700'}`}>
            <EngineIcon className={`w-3 h-3 ${engineMeta.color}`} />
            <span className={`text-[10px] font-bold ${engineMeta.color}`}>{engineMeta.label}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${SEVERITY_COLOR[contract.severity_floor] || SEVERITY_COLOR.medium}`}>
              {contract.severity_floor.toUpperCase()}
            </span>
            <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-900/80 text-slate-300 border border-slate-700">
              <Timer className="w-2.5 h-2.5" /> {contract.sla_minutes}m
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContractDetail({ contract }: { contract: Contract }) {
  const Icon = ICONS[contract.icon] || Shield;
  const engineMeta = ENGINE_META[contract.engine_type];
  const EngineIcon = engineMeta.icon;
  const paramEntries = Object.entries(contract.parameters || {});
  const sampleEntries = Object.entries(contract.sample_signals || {});

  return (
    <div className="sticky top-4 space-y-4">
      <div className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br ${COLOR_GRAD[contract.color] || COLOR_GRAD.slate} p-5`}>
        <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full blur-3xl opacity-40 pointer-events-none" style={{
          background: `radial-gradient(circle, ${colorHex(contract.color)}, transparent 70%)`
        }} />
        <div className="relative">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-700">
              <Icon className={`w-6 h-6 ${COLOR_TEXT[contract.color] || 'text-slate-200'}`} />
            </div>
            <div>
              <div className="text-[10px] font-mono tracking-wider text-slate-400">{contract.contract_code}</div>
              <div className="text-base font-semibold text-white leading-tight">{contract.contract_name}</div>
            </div>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">{contract.description}</p>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="rounded-lg bg-slate-900/70 border border-slate-800 px-2 py-1.5">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Severity floor</div>
              <div className={`text-xs font-bold ${SEVERITY_COLOR[contract.severity_floor]?.split(' ').find(t => t.startsWith('text-')) || 'text-white'}`}>{contract.severity_floor}</div>
            </div>
            <div className="rounded-lg bg-slate-900/70 border border-slate-800 px-2 py-1.5">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">SLA</div>
              <div className="text-xs font-bold text-white">{contract.sla_minutes}m</div>
            </div>
            <div className="rounded-lg bg-slate-900/70 border border-slate-800 px-2 py-1.5">
              <div className="text-[9px] text-slate-500 uppercase tracking-wider">Category</div>
              <div className="text-xs font-bold text-white capitalize">{contract.category.replace('_', ' ')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Engine routing */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Routed To</div>
        <div className={`rounded-xl border bg-gradient-to-br ${engineMeta.gradient} p-3 flex items-center gap-3`}>
          <EngineIcon className={`w-5 h-5 ${engineMeta.color}`} />
          <div>
            <div className={`text-sm font-bold ${engineMeta.color}`}>{engineMeta.label}</div>
            <div className="text-[10px] font-mono text-slate-400">{engineMeta.subtitle}</div>
          </div>
        </div>
      </div>

      {/* Compliance */}
      {contract.compliance_frameworks?.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Scale className="w-3 h-3" /> Compliance Frameworks
          </div>
          <div className="flex flex-wrap gap-1.5">
            {contract.compliance_frameworks.map(f => (
              <span key={f} className="px-2 py-1 rounded-lg text-[10px] font-mono font-semibold bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Parameters */}
      {paramEntries.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" /> Engine Parameters
          </div>
          <div className="rounded-lg bg-[#020611] border border-slate-800 p-3 max-h-64 overflow-y-auto">
            <div className="space-y-1.5">
              {paramEntries.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between text-[11px] font-mono">
                  <span className="text-slate-400">{k}</span>
                  <span className={`${COLOR_TEXT[contract.color] || 'text-white'} font-semibold tabular-nums`}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Triggers */}
      {contract.triggers?.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Trigger Conditions
          </div>
          <div className="space-y-1.5">
            {contract.triggers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-[11px] font-mono text-slate-300 bg-slate-900/70 border border-slate-800 rounded-lg px-2.5 py-1.5">
                <span className="text-amber-400">◈</span>
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Escalation */}
      {contract.escalation_path?.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" /> Escalation Path
          </div>
          <div className="relative pl-4">
            <div className="absolute left-1.5 top-2 bottom-2 w-px bg-gradient-to-b from-red-500/60 via-amber-500/40 to-emerald-500/40" />
            {contract.escalation_path.map((step, i) => (
              <div key={i} className="relative flex items-start gap-2 py-1.5">
                <div className={`absolute -left-[9px] w-2.5 h-2.5 rounded-full ring-2 ring-slate-900 ${
                  i === 0 ? 'bg-red-400' : i === contract.escalation_path.length - 1 ? 'bg-emerald-400' : 'bg-amber-400'
                }`} />
                <span className="text-[11px] text-slate-300 leading-relaxed">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sample signals */}
      {sampleEntries.length > 0 && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2 flex items-center gap-1.5">
            <Activity className="w-3 h-3" /> Sample Signal Values
          </div>
          <div className="space-y-2">
            {sampleEntries.map(([k, v]) => {
              const num = typeof v === 'number' ? v : Number(v);
              const pct = !isNaN(num) ? Math.min(1, Math.max(0, num > 1 ? num / 10 : num)) : 0;
              return (
                <div key={k}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-slate-400 font-mono">{k}</span>
                    <span className={`${COLOR_TEXT[contract.color] || 'text-white'} font-bold tabular-nums`}>{String(v)}</span>
                  </div>
                  <div className="h-1 bg-slate-900 rounded-full overflow-hidden">
                    <div className={`h-full ${engineMeta.bar}`} style={{ width: `${pct * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function colorHex(c: string): string {
  const map: Record<string, string> = {
    rose: '#f43f5e', red: '#ef4444', amber: '#f59e0b', orange: '#f97316',
    cyan: '#06b6d4', blue: '#3b82f6', sky: '#0ea5e9', emerald: '#10b981',
    teal: '#14b8a6', pink: '#ec4899', slate: '#64748b',
  };
  return map[c] || map.slate;
}
