import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Brain, Gauge, Network, Target, Users, Zap,
  GitBranch, Sparkles, ChevronRight, Layers, Workflow, Eye, Scale,
  Waves, Sigma, FlaskConical, Beaker, Bot, Cpu, Skull, ShieldAlert, Globe,
  Binary, GitMerge, Search, X
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type Lens = {
  id: string;
  display_name: string;
  category: string;
  description: string;
  default_weight: number;
  color_hex: string;
  icon_name: string;
  reasoning_type: string;
  enabled: boolean;
};

type Signal = {
  id: string;
  event_id: string;
  lens_id: string;
  score: number;
  confidence: number;
  verdict_label: string;
  evidence: Record<string, unknown>;
  latency_ms: number;
  model_version: string;
  emitted_at: string;
};

type Verdict = {
  id: string;
  incident_key: string;
  title: string;
  fused_score: number;
  priority: string;
  status: string;
  contributing_lenses: string[];
  contributing_event_ids: string[];
  asset_criticality: number;
  identity_blast_radius: number;
  kill_chain_stage: string;
  arbiter_mode: string;
  explanation_md: string;
  evidence_summary: Record<string, unknown>;
  created_at: string;
};

type Weight = {
  id: string;
  lens_id: string;
  weight: number;
  active: boolean;
};

const LENS_ICON: Record<string, typeof Zap> = {
  Zap, AlertTriangle, Network, Brain, Target, Gauge, Users, Activity,
  Workflow, ShieldAlert, Layers, Globe,
};

type MLInv = {
  id: string;
  verdict_id: string;
  model_id: string;
  model_name: string;
  model_category: string;
  model_family: string;
  model_version: string;
  inference_score: number;
  confidence: number;
  decision: string;
  feature_attribution: Record<string, unknown>;
  baseline_deviation: number;
  drift_psi: number;
  latency_ms: number;
  hardware: string;
  invoked_at: string;
};

type AgentAct = {
  id: string;
  verdict_id: string;
  agent_slug: string;
  agent_name: string;
  agent_role: string;
  agent_color: string;
  phase: number;
  action_type: string;
  action_summary: string;
  reasoning: string;
  confidence: number;
  decision: string;
  duration_ms: number;
  llm_tokens: number;
  cost_usd: number;
  status: string;
  occurred_at: string;
};

type Chain = {
  id: string;
  chain_code: string;
  campaign_name: string;
  threat_actor: string;
  motivation: string;
  sophistication: string;
  narrative: string;
  kill_chain_stages: string[];
  mitre_techniques: string[];
  verdict_ids: string[];
  ml_models_used: string[];
  agents_orchestrated: string[];
  glasswing_vulns: string[];
  negative_correlation_rules: string[];
  bytecode_artifacts: Array<Record<string, unknown>>;
  total_signals: number;
  fused_score: number;
  blast_radius: number;
  containment_status: string;
  detected_at: string;
};

const PRIORITY_STYLE: Record<string, { bg: string; ring: string; text: string }> = {
  P1: { bg: 'bg-red-500/20', ring: 'ring-red-500/60', text: 'text-red-300' },
  P2: { bg: 'bg-orange-500/20', ring: 'ring-orange-500/60', text: 'text-orange-300' },
  P3: { bg: 'bg-amber-500/20', ring: 'ring-amber-500/60', text: 'text-amber-300' },
  P4: { bg: 'bg-sky-500/20', ring: 'ring-sky-500/60', text: 'text-sky-300' },
};

type Tab = 'river' | 'verdicts' | 'sunburst' | 'lineage' | 'formula' | 'disagree' | 'ml' | 'agents' | 'chains';

export default function DetectionConfluence() {
  const [tab, setTab] = useState<Tab>('river');
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [mlInvocations, setMlInvocations] = useState<MLInv[]>([]);
  const [agentActions, setAgentActions] = useState<AgentAct[]>([]);
  const [chains, setChains] = useState<Chain[]>([]);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      const [l, s, v, w, m, a, c] = await Promise.all([
        supabase.from('confluence_lenses').select('*').order('display_name'),
        supabase.from('confluence_signals').select('*').order('emitted_at', { ascending: false }).limit(400),
        supabase.from('confluence_verdicts').select('*').order('fused_score', { ascending: false }),
        supabase.from('confluence_lens_weights').select('*').eq('tenant_id', 'default'),
        supabase.from('confluence_ml_invocations').select('*').order('invoked_at', { ascending: false }).limit(500),
        supabase.from('confluence_agent_actions').select('*').order('phase').limit(300),
        supabase.from('confluence_attack_chains').select('*').order('fused_score', { ascending: false }),
      ]);
      setLenses((l.data ?? []) as Lens[]);
      setSignals((s.data ?? []) as Signal[]);
      setVerdicts((v.data ?? []) as Verdict[]);
      setWeights((w.data ?? []) as Weight[]);
      setMlInvocations((m.data ?? []) as MLInv[]);
      setAgentActions((a.data ?? []) as AgentAct[]);
      setChains((c.data ?? []) as Chain[]);
      setLoading(false);
    })();
  }, []);

  const lensById = useMemo(
    () => Object.fromEntries(lenses.map((l) => [l.id, l])),
    [lenses]
  );

  const filteredVerdicts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return verdicts;
    return verdicts.filter((v) => {
      const haystack = [
        v.incident_key,
        v.title,
        v.priority,
        ...(v.contributing_lenses ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [verdicts, search]);

  const stats = useMemo(() => {
    const p1 = filteredVerdicts.filter((v) => v.priority === 'P1').length;
    const p2 = filteredVerdicts.filter((v) => v.priority === 'P2').length;
    const consensus = filteredVerdicts.filter((v) => v.contributing_lenses.length >= 4).length;
    const avgScore = filteredVerdicts.length
      ? filteredVerdicts.reduce((a, v) => a + v.fused_score, 0) / filteredVerdicts.length
      : 0;
    return { p1, p2, consensus, avgScore, total: filteredVerdicts.length };
  }, [filteredVerdicts]);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Header stats={stats} loading={loading} />
      <Tabs tab={tab} setTab={setTab} />
      <SearchBar
        search={search}
        setSearch={setSearch}
        total={verdicts.length}
        filtered={filteredVerdicts.length}
        onJump={(v) => { setSelectedVerdict(v); setTab('lineage'); }}
        results={filteredVerdicts}
      />

      <div className="flex-1 overflow-hidden">
        {tab === 'river' && (
          <RiverView lenses={lenses} signals={signals} verdicts={filteredVerdicts} weights={weights} />
        )}
        {tab === 'verdicts' && (
          <VerdictsView
            verdicts={filteredVerdicts}
            signals={signals}
            lensById={lensById}
            onSelect={(v) => { setSelectedVerdict(v); setTab('lineage'); }}
          />
        )}
        {tab === 'sunburst' && (
          <SunburstView verdicts={filteredVerdicts} signals={signals} lensById={lensById} />
        )}
        {tab === 'lineage' && (
          <LineageView
            verdict={selectedVerdict ?? filteredVerdicts[0] ?? verdicts[0]}
            signals={signals}
            lensById={lensById}
            allVerdicts={filteredVerdicts.length ? filteredVerdicts : verdicts}
            onSelect={setSelectedVerdict}
          />
        )}
        {tab === 'formula' && (
          <FormulaView lenses={lenses} weights={weights} verdicts={filteredVerdicts} signals={signals} />
        )}
        {tab === 'disagree' && (
          <DisagreementView verdicts={filteredVerdicts} signals={signals} lensById={lensById} />
        )}
        {tab === 'ml' && (
          <MLModelsView mlInvocations={mlInvocations} verdicts={filteredVerdicts} />
        )}
        {tab === 'agents' && (
          <AgentsView agentActions={agentActions} verdicts={filteredVerdicts} />
        )}
        {tab === 'chains' && (
          <AttackChainsView chains={chains} verdicts={filteredVerdicts} mlInvocations={mlInvocations} agentActions={agentActions} />
        )}
      </div>
    </div>
  );
}

function Header({ stats, loading }: { stats: { p1: number; p2: number; consensus: number; avgScore: number; total: number }; loading: boolean }) {
  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/40 border-b border-slate-800 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-cyan-500 rounded-xl blur-xl opacity-40 animate-pulse" />
            <div className="relative p-3 bg-gradient-to-br from-cyan-500 to-blue-700 rounded-xl">
              <Waves className="w-7 h-7 text-white" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight">Detection Confluence</h1>
              <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                Phase 1
              </span>
            </div>
            <p className="text-slate-400 text-sm">
              Where rules, graphs, SLM, vectors, formulas, negative correlation and UEBA converge into one prioritized verdict
            </p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-3">
          <Stat label="P1 verdicts" value={stats.p1} tone="red" />
          <Stat label="P2 verdicts" value={stats.p2} tone="orange" />
          <Stat label="4+ lens consensus" value={stats.consensus} tone="cyan" />
          <Stat label="avg fused score" value={stats.avgScore.toFixed(2)} tone="emerald" />
        </div>
      </div>
      {loading && (
        <div className="mt-3 text-xs text-cyan-400 flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          loading signal bus...
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone: 'red' | 'orange' | 'cyan' | 'emerald' }) {
  const tones = {
    red: 'border-red-500/30 text-red-300',
    orange: 'border-orange-500/30 text-orange-300',
    cyan: 'border-cyan-500/30 text-cyan-300',
    emerald: 'border-emerald-500/30 text-emerald-300',
  };
  return (
    <div className={`px-4 py-2 rounded-lg bg-slate-900/70 border ${tones[tone]} min-w-[140px]`}>
      <div className="text-[10px] uppercase tracking-wider text-slate-400">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: typeof Waves }[] = [
    { id: 'river', label: 'Pipeline River', icon: Waves },
    { id: 'verdicts', label: 'Verdicts', icon: AlertTriangle },
    { id: 'sunburst', label: 'Lens Contribution', icon: Sigma },
    { id: 'lineage', label: 'Evidence Lineage', icon: GitBranch },
    { id: 'formula', label: 'Formula Surgery', icon: Scale },
    { id: 'disagree', label: 'Disagreement Console', icon: FlaskConical },
    { id: 'ml', label: 'ML Model Fusion', icon: Cpu },
    { id: 'agents', label: 'Agentic Operations', icon: Bot },
    { id: 'chains', label: 'Complex Attack Chains', icon: Skull },
  ];
  return (
    <div className="border-b border-slate-800 bg-slate-900/60 px-6">
      <div className="flex gap-1 overflow-x-auto">
        {items.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition flex items-center gap-2 ${
              tab === id
                ? 'border-cyan-400 text-cyan-300'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SearchBar({
  search,
  setSearch,
  total,
  filtered,
  onJump,
  results,
}: {
  search: string;
  setSearch: (s: string) => void;
  total: number;
  filtered: number;
  onJump: (v: Verdict) => void;
  results: Verdict[];
}) {
  const [focused, setFocused] = useState(false);
  const trimmed = search.trim();
  const showDropdown = focused && trimmed.length > 0 && results.length > 0;
  const quickPicks = ['AC2023-CONVERGE', 'P1', 'CONVERGE', 'glasswing', 'behavior'];

  return (
    <div className="border-b border-slate-800 bg-slate-950/80 px-6 py-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            placeholder="Search verdicts (e.g. AC2023-CONVERGE, P1, glasswing, Cl0p)..."
            className="w-full bg-slate-900/80 border border-slate-700 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 rounded-lg pl-9 pr-9 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          {showDropdown && (
            <div className="absolute z-50 left-0 right-0 mt-1.5 max-h-80 overflow-auto rounded-lg border border-slate-700 bg-slate-900/95 backdrop-blur shadow-2xl">
              <div className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-800">
                {results.length} matching verdict{results.length === 1 ? '' : 's'}
              </div>
              {results.slice(0, 12).map((v) => (
                <button
                  key={v.id}
                  onMouseDown={(e) => { e.preventDefault(); onJump(v); }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-800/60 border-b border-slate-800/40 last:border-0 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${
                      v.priority === 'P1' || v.priority === 'critical'
                        ? 'bg-red-500/15 text-red-300 border-red-500/30'
                        : v.priority === 'P2'
                        ? 'bg-orange-500/15 text-orange-300 border-orange-500/30'
                        : 'bg-slate-500/15 text-slate-300 border-slate-500/30'
                    }`}>{v.priority}</span>
                    <span className="font-mono text-[11px] text-cyan-300">{v.incident_key}</span>
                    <span className="ml-auto font-mono text-[11px] text-emerald-300">{Number(v.fused_score).toFixed(2)}</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-300 truncate">{v.title}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(v.contributing_lenses ?? []).slice(0, 6).map((l) => (
                      <span key={l} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{l}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {quickPicks.map((q) => (
            <button
              key={q}
              onClick={() => setSearch(q)}
              className={`text-[10px] px-2 py-1 rounded border transition ${
                search === q
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-700 hover:border-slate-600 hover:text-slate-200'
              }`}
            >
              {q}
            </button>
          ))}
        </div>

        <div className="ml-auto text-[11px] text-slate-500 whitespace-nowrap">
          {trimmed ? (
            <span>
              <span className="text-cyan-300 font-semibold">{filtered}</span>
              <span className="text-slate-500"> / {total} verdicts</span>
            </span>
          ) : (
            <span>{total} verdicts</span>
          )}
        </div>
      </div>
    </div>
  );
}

function RiverView({ lenses, signals, verdicts, weights }: { lenses: Lens[]; signals: Signal[]; verdicts: Verdict[]; weights: Weight[] }) {
  const [tick, setTick] = useState(0);
  const ref = useRef<number>();
  useEffect(() => {
    const loop = () => {
      setTick((t) => (t + 1) % 1000);
      ref.current = window.setTimeout(loop, 80);
    };
    loop();
    return () => { if (ref.current) window.clearTimeout(ref.current); };
  }, []);

  const lensSignalCount = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of signals) m[s.lens_id] = (m[s.lens_id] ?? 0) + 1;
    return m;
  }, [signals]);

  const lensAvgScore = useMemo(() => {
    const sums: Record<string, { sum: number; n: number }> = {};
    for (const s of signals) {
      sums[s.lens_id] = sums[s.lens_id] || { sum: 0, n: 0 };
      sums[s.lens_id].sum += s.score;
      sums[s.lens_id].n += 1;
    }
    const m: Record<string, number> = {};
    for (const k of Object.keys(sums)) m[k] = sums[k].sum / sums[k].n;
    return m;
  }, [signals]);

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Waves className="w-5 h-5 text-cyan-400" />
              Live Signal River
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              One event, seven lenses, one verdict. Watch raw events fan out into parallel scoring lanes and converge into the Fusion Arbiter.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            streaming
          </div>
        </div>

        <div className="relative h-[460px] bg-slate-950/60 rounded-lg border border-slate-800 overflow-hidden">
          <div className="absolute left-4 top-4 bottom-4 w-32 flex flex-col items-center justify-center gap-1 z-10">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 border-2 border-slate-600 flex items-center justify-center mb-2">
              <Activity className="w-6 h-6 text-slate-300" />
            </div>
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Raw Events</div>
            <div className="text-[10px] text-slate-500">OCSF Bronze</div>
          </div>

          <div className="absolute left-44 right-44 top-4 bottom-4 flex flex-col justify-around">
            {lenses.map((l, idx) => {
              const Icon = LENS_ICON[l.icon_name] ?? Activity;
              const count = lensSignalCount[l.id] ?? 0;
              const avg = lensAvgScore[l.id] ?? 0;
              const phase = (tick + idx * 12) % 100;
              return (
                <div key={l.id} className="relative h-12 flex items-center">
                  <div className="absolute inset-0 flex items-center">
                    <div
                      className="h-px w-full"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${l.color_hex}55, ${l.color_hex}, ${l.color_hex}55, transparent)`,
                      }}
                    />
                  </div>
                  <div
                    className="absolute h-2.5 w-2.5 rounded-full shadow-lg"
                    style={{
                      left: `${phase}%`,
                      background: l.color_hex,
                      boxShadow: `0 0 14px ${l.color_hex}`,
                      transition: 'left 0.08s linear',
                    }}
                  />
                  <div
                    className="absolute h-1.5 w-1.5 rounded-full"
                    style={{
                      left: `${(phase + 25) % 100}%`,
                      background: l.color_hex,
                      opacity: 0.6,
                    }}
                  />
                  <div className="relative flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-900 border z-10"
                       style={{ borderColor: `${l.color_hex}66` }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: l.color_hex }} />
                    <div className="flex flex-col">
                      <span className="text-[11px] font-semibold text-slate-200">{l.display_name}</span>
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider">{l.reasoning_type}</span>
                    </div>
                  </div>
                  <div className="absolute right-0 flex items-center gap-2 text-[10px] text-slate-400 z-10">
                    <span className="font-mono px-1.5 py-0.5 rounded bg-slate-800">{count} sigs</span>
                    <span className="font-mono px-1.5 py-0.5 rounded bg-slate-800" style={{ color: l.color_hex }}>
                      avg {avg.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="absolute right-4 top-4 bottom-4 w-32 flex flex-col items-center justify-center z-10">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-cyan-500/30 blur-xl animate-pulse" />
              <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-blue-700 border-2 border-cyan-300 flex items-center justify-center">
                <Sigma className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-cyan-300 font-bold mt-3">Fusion Arbiter</div>
            <div className="text-[10px] text-slate-400 mt-0.5">{verdicts.length} verdicts</div>
            <div className="text-[10px] text-slate-500">neuro-symbolic</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            Recent Verdicts
          </h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {verdicts.slice(0, 8).map((v) => (
              <VerdictRow key={v.id} v={v} />
            ))}
          </div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Scale className="w-4 h-4 text-cyan-400" />
            Active Lens Weights
          </h3>
          <div className="space-y-2">
            {lenses.map((l) => {
              const w = weights.find((x) => x.lens_id === l.id);
              const weight = w?.weight ?? l.default_weight;
              return (
                <div key={l.id}>
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-slate-300">{l.display_name}</span>
                    <span className="font-mono" style={{ color: l.color_hex }}>{weight.toFixed(2)}×</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded">
                    <div
                      className="h-1.5 rounded"
                      style={{
                        width: `${Math.min(100, (weight / 1.5) * 100)}%`,
                        background: l.color_hex,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function VerdictRow({ v }: { v: Verdict }) {
  const ps = PRIORITY_STYLE[v.priority] ?? PRIORITY_STYLE.P3;
  return (
    <div className={`p-3 rounded-lg bg-slate-900 border border-slate-800 hover:border-cyan-500/40 transition cursor-pointer`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${ps.bg} ${ps.text} ring-1 ${ps.ring}`}>
            {v.priority}
          </span>
          <span className="text-xs font-mono text-slate-500">{v.incident_key}</span>
          <span className="text-sm font-medium text-slate-100 truncate">{v.title}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-slate-500">{v.kill_chain_stage.replace('_', ' ')}</span>
          <div className="flex -space-x-1">
            {v.contributing_lenses.slice(0, 5).map((id) => (
              <div
                key={id}
                className="w-5 h-5 rounded-full border-2 border-slate-900 flex items-center justify-center text-[8px] font-bold"
                style={{ background: '#1f2937', color: '#94a3b8' }}
                title={id}
              >
                {id.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
          <span className="font-mono text-sm text-cyan-300 w-12 text-right">{v.fused_score.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function VerdictsView({ verdicts, signals, lensById, onSelect }: { verdicts: Verdict[]; signals: Signal[]; lensById: Record<string, Lens>; onSelect: (v: Verdict) => void }) {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {verdicts.map((v) => {
          const ps = PRIORITY_STYLE[v.priority] ?? PRIORITY_STYLE.P3;
          const vSignals = signals.filter((s) => v.contributing_event_ids.includes(s.event_id));
          return (
            <div
              key={v.id}
              onClick={() => onSelect(v)}
              className={`bg-slate-900/60 border border-slate-800 rounded-xl p-5 cursor-pointer hover:border-cyan-500/40 hover:bg-slate-900 transition`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded text-[10px] font-bold ${ps.bg} ${ps.text} ring-1 ${ps.ring}`}>
                    {v.priority}
                  </span>
                  <span className="text-xs font-mono text-slate-500">{v.incident_key}</span>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-cyan-300">{v.fused_score.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-500 uppercase tracking-wider">{v.arbiter_mode}</div>
                </div>
              </div>
              <h3 className="text-sm font-semibold text-slate-100 mb-3">{v.title}</h3>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <Mini label="asset crit" value={v.asset_criticality} color="#f59e0b" />
                <Mini label="blast radius" value={v.identity_blast_radius} color="#ef4444" />
                <Mini label="kill chain" text={v.kill_chain_stage.replace('_', ' ')} color="#22d3ee" />
              </div>

              <div className="flex flex-wrap gap-1.5 mb-3">
                {v.contributing_lenses.map((id) => {
                  const l = lensById[id];
                  if (!l) return null;
                  return (
                    <span
                      key={id}
                      className="px-2 py-0.5 rounded text-[10px] font-medium border"
                      style={{
                        background: `${l.color_hex}22`,
                        borderColor: `${l.color_hex}55`,
                        color: l.color_hex,
                      }}
                    >
                      {l.display_name}
                    </span>
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{vSignals.length} signals</span>
                <span className="flex items-center gap-1 text-cyan-400">
                  Open lineage <ChevronRight className="w-3 h-3" />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Mini({ label, value, text, color }: { label: string; value?: number; text?: string; color: string }) {
  return (
    <div className="rounded bg-slate-950 border border-slate-800 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-xs font-mono" style={{ color }}>
        {text ?? (value != null ? value.toFixed(2) : '--')}
      </div>
    </div>
  );
}

function SunburstView({ verdicts, signals, lensById }: { verdicts: Verdict[]; signals: Signal[]; lensById: Record<string, Lens> }) {
  const [selected, setSelected] = useState<Verdict | null>(verdicts[0] ?? null);
  const vSignals = useMemo(
    () => (selected ? signals.filter((s) => selected.contributing_event_ids.includes(s.event_id)) : []),
    [selected, signals]
  );

  const slices = useMemo(() => {
    if (!selected) return [];
    const total = vSignals.reduce((a, s) => a + s.score, 0) || 1;
    let acc = 0;
    return vSignals.map((s) => {
      const frac = s.score / total;
      const start = acc;
      acc += frac;
      const lens = lensById[s.lens_id];
      return {
        signal: s,
        lens,
        startAngle: start * Math.PI * 2,
        endAngle: acc * Math.PI * 2,
        frac,
      };
    });
  }, [selected, vSignals, lensById]);

  const cx = 220;
  const cy = 220;
  const rOuter = 180;
  const rInner = 90;

  return (
    <div className="h-full overflow-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-3">Pick a verdict</h3>
        <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
          {verdicts.map((v) => {
            const ps = PRIORITY_STYLE[v.priority] ?? PRIORITY_STYLE.P3;
            return (
              <button
                key={v.id}
                onClick={() => setSelected(v)}
                className={`w-full text-left p-3 rounded-lg border transition ${
                  selected?.id === v.id ? 'border-cyan-500/60 bg-slate-900' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${ps.bg} ${ps.text}`}>{v.priority}</span>
                  <span className="font-mono text-xs text-cyan-300">{v.fused_score.toFixed(2)}</span>
                </div>
                <div className="text-xs font-medium text-slate-200 line-clamp-2">{v.title}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        {selected && (
          <>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-bold">Lens Contribution</h3>
                <p className="text-xs text-slate-400">{selected.title}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-cyan-300">{selected.fused_score.toFixed(2)}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">fused score</div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <svg width={440} height={440} viewBox="0 0 440 440">
                <defs>
                  {slices.map((s, i) => (
                    <radialGradient key={i} id={`grad-${i}`}>
                      <stop offset="0%" stopColor={s.lens?.color_hex ?? '#38bdf8'} stopOpacity={0.4} />
                      <stop offset="100%" stopColor={s.lens?.color_hex ?? '#38bdf8'} stopOpacity={0.95} />
                    </radialGradient>
                  ))}
                </defs>
                {slices.map((s, i) => {
                  const x1 = cx + rOuter * Math.cos(s.startAngle - Math.PI / 2);
                  const y1 = cy + rOuter * Math.sin(s.startAngle - Math.PI / 2);
                  const x2 = cx + rOuter * Math.cos(s.endAngle - Math.PI / 2);
                  const y2 = cy + rOuter * Math.sin(s.endAngle - Math.PI / 2);
                  const x3 = cx + rInner * Math.cos(s.endAngle - Math.PI / 2);
                  const y3 = cy + rInner * Math.sin(s.endAngle - Math.PI / 2);
                  const x4 = cx + rInner * Math.cos(s.startAngle - Math.PI / 2);
                  const y4 = cy + rInner * Math.sin(s.startAngle - Math.PI / 2);
                  const large = s.endAngle - s.startAngle > Math.PI ? 1 : 0;
                  const path = `M ${x1} ${y1} A ${rOuter} ${rOuter} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rInner} ${rInner} 0 ${large} 0 ${x4} ${y4} Z`;
                  const midAngle = (s.startAngle + s.endAngle) / 2;
                  const lx = cx + (rOuter + 18) * Math.cos(midAngle - Math.PI / 2);
                  const ly = cy + (rOuter + 18) * Math.sin(midAngle - Math.PI / 2);
                  return (
                    <g key={i}>
                      <path d={path} fill={`url(#grad-${i})`} stroke="#0f172a" strokeWidth={2} />
                      <text x={lx} y={ly} textAnchor="middle" fontSize="10" fill={s.lens?.color_hex ?? '#94a3b8'} fontWeight="700">
                        {s.lens?.display_name?.split(' ')[0]} {(s.frac * 100).toFixed(0)}%
                      </text>
                    </g>
                  );
                })}
                <circle cx={cx} cy={cy} r={rInner - 6} fill="#0f172a" stroke="#1e293b" strokeWidth={2} />
                <text x={cx} y={cy - 6} textAnchor="middle" fontSize="28" fill="#22d3ee" fontWeight="800">
                  {selected.fused_score.toFixed(2)}
                </text>
                <text x={cx} y={cy + 16} textAnchor="middle" fontSize="10" fill="#64748b" letterSpacing={2}>
                  {selected.priority}
                </text>
              </svg>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {slices.map((s, i) => (
                <div key={i} className="flex items-center justify-between p-2 rounded bg-slate-950 border border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: s.lens?.color_hex }} />
                    <span className="text-xs text-slate-200 truncate">{s.lens?.display_name}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 font-mono">{s.signal.event_id}</span>
                    <span className="font-mono text-xs" style={{ color: s.lens?.color_hex }}>{s.signal.score.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LineageView({ verdict, signals, lensById, allVerdicts, onSelect }: { verdict: Verdict | undefined; signals: Signal[]; lensById: Record<string, Lens>; allVerdicts: Verdict[]; onSelect: (v: Verdict) => void }) {
  if (!verdict) return <div className="p-6 text-slate-400">No verdict selected.</div>;
  const vSignals = signals.filter((s) => verdict.contributing_event_ids.includes(s.event_id));
  const events = Array.from(new Set(verdict.contributing_event_ids));

  return (
    <div className="h-full overflow-auto p-6 grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
        <h3 className="text-sm font-bold mb-2">Verdicts</h3>
        <div className="space-y-1">
          {allVerdicts.map((v) => (
            <button
              key={v.id}
              onClick={() => onSelect(v)}
              className={`w-full text-left p-2 rounded border text-xs transition ${
                v.id === verdict.id ? 'border-cyan-500/60 bg-slate-900' : 'border-slate-800 bg-slate-950 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-500">{v.incident_key}</span>
                <span className="font-mono text-cyan-300">{v.fused_score.toFixed(2)}</span>
              </div>
              <div className="text-slate-200 line-clamp-2 mt-0.5">{v.title}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PRIORITY_STYLE[verdict.priority]?.bg} ${PRIORITY_STYLE[verdict.priority]?.text}`}>
                  {verdict.priority}
                </span>
                <span className="text-xs font-mono text-slate-500">{verdict.incident_key}</span>
              </div>
              <h2 className="text-lg font-bold text-slate-100">{verdict.title}</h2>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-cyan-300">{verdict.fused_score.toFixed(2)}</div>
              <div className="text-[10px] text-slate-500 uppercase">{verdict.arbiter_mode}</div>
            </div>
          </div>
          <pre className="mt-3 text-xs text-slate-300 whitespace-pre-wrap font-sans bg-slate-950 border border-slate-800 rounded p-3">
{verdict.explanation_md}
          </pre>
        </div>

        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
            <GitBranch className="w-4 h-4 text-cyan-400" />
            Evidence Lineage DAG
          </h3>
          <div className="grid grid-cols-3 gap-4 items-start">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 text-center">Raw Events</div>
              <div className="space-y-2">
                {events.map((e) => (
                  <div key={e} className="px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 text-center">
                    {e}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 text-center">Lens Signals</div>
              <div className="space-y-2">
                {vSignals.map((s) => {
                  const l = lensById[s.lens_id];
                  return (
                    <div
                      key={s.id}
                      className="px-3 py-2 rounded border text-xs"
                      style={{
                        background: `${l?.color_hex ?? '#22d3ee'}11`,
                        borderColor: `${l?.color_hex ?? '#22d3ee'}55`,
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium" style={{ color: l?.color_hex }}>
                          {l?.display_name ?? s.lens_id}
                        </span>
                        <span className="font-mono">{s.score.toFixed(2)}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {s.event_id} · conf {s.confidence.toFixed(2)} · {s.latency_ms}ms
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-2 text-center">Fused Verdict</div>
              <div className="rounded-lg border-2 border-cyan-500/60 bg-cyan-500/10 p-4">
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-300">{verdict.fused_score.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400 uppercase mt-1">{verdict.priority} · {verdict.arbiter_mode}</div>
                </div>
                <div className="text-[10px] text-slate-400 mt-3 text-center">
                  {verdict.contributing_lenses.length} lenses agreed
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormulaView({ lenses, weights: _weights, verdicts, signals }: { lenses: Lens[]; weights: Weight[]; verdicts: Verdict[]; signals: Signal[] }) {
  const [editable, setEditable] = useState<Record<string, number>>(() =>
    Object.fromEntries(lenses.map((l) => [l.id, l.default_weight]))
  );

  useEffect(() => {
    if (lenses.length && Object.keys(editable).length === 0) {
      setEditable(Object.fromEntries(lenses.map((l) => [l.id, l.default_weight])));
    }
  }, [lenses, editable]);

  const recomputed = useMemo(() => {
    return verdicts.map((v) => {
      const vSigs = signals.filter((s) => v.contributing_event_ids.includes(s.event_id));
      let num = 0;
      let den = 0;
      for (const s of vSigs) {
        const w = editable[s.lens_id] ?? 1;
        num += s.score * w;
        den += w;
      }
      const base = den > 0 ? num / den : 0;
      const adj = base * (0.6 + 0.4 * v.asset_criticality) * (0.7 + 0.3 * v.identity_blast_radius);
      return { v, original: v.fused_score, recomputed: Math.min(1, adj) };
    });
  }, [editable, verdicts, signals]);

  return (
    <div className="h-full overflow-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <Scale className="w-4 h-4 text-cyan-400" />
          Lens Weight Surgery
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Tune the contribution of each lens. Effects replay against the last batch of verdicts in real time.
        </p>
        <div className="space-y-4">
          {lenses.map((l) => {
            const v = editable[l.id] ?? l.default_weight;
            return (
              <div key={l.id}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium" style={{ color: l.color_hex }}>{l.display_name}</span>
                  <span className="font-mono text-slate-300">{v.toFixed(2)}×</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={v}
                  onChange={(e) => setEditable({ ...editable, [l.id]: parseFloat(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
                <div className="flex justify-between text-[9px] text-slate-600 mt-0.5">
                  <span>off</span>
                  <span>1.0</span>
                  <span>2.0</span>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-5 p-3 rounded bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-mono leading-relaxed">
          priority = (Σ weight·score / Σ weight)<br />
          {'    '}× (0.6 + 0.4·asset_crit)<br />
          {'    '}× (0.7 + 0.3·blast_radius)
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-4 flex items-center gap-2">
          <Beaker className="w-4 h-4 text-cyan-400" />
          What-if Replay
        </h3>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {recomputed.map(({ v, original, recomputed: r }) => {
            const delta = r - original;
            const tone = delta > 0.02 ? 'text-red-300' : delta < -0.02 ? 'text-emerald-300' : 'text-slate-400';
            return (
              <div key={v.id} className="p-3 rounded bg-slate-950 border border-slate-800">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-mono text-slate-500">{v.incident_key}</span>
                  <span className="text-[10px] uppercase text-slate-600">{v.priority}</span>
                </div>
                <div className="text-xs text-slate-200 mb-2 line-clamp-1">{v.title}</div>
                <div className="flex items-center gap-3 text-xs">
                  <div>
                    <span className="text-slate-500">orig</span>
                    <span className="ml-1 font-mono text-slate-300">{original.toFixed(2)}</span>
                  </div>
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <div>
                    <span className="text-slate-500">new</span>
                    <span className="ml-1 font-mono text-cyan-300">{r.toFixed(2)}</span>
                  </div>
                  <div className={`ml-auto font-mono ${tone}`}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}
                  </div>
                </div>
                <div className="mt-2 h-1 bg-slate-800 rounded relative">
                  <div className="absolute h-1 bg-slate-600 rounded" style={{ width: `${original * 100}%` }} />
                  <div className="absolute h-1 bg-cyan-400 rounded opacity-80" style={{ width: `${r * 100}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DisagreementView({ verdicts, signals, lensById }: { verdicts: Verdict[]; signals: Signal[]; lensById: Record<string, Lens> }) {
  const ranked = useMemo(() => {
    return verdicts
      .map((v) => {
        const vSigs = signals.filter((s) => v.contributing_event_ids.includes(s.event_id));
        if (vSigs.length < 2) return null;
        const scores = vSigs.map((s) => s.score);
        const min = Math.min(...scores);
        const max = Math.max(...scores);
        const spread = max - min;
        return { v, vSigs, spread, min, max };
      })
      .filter(Boolean)
      .sort((a, b) => (b!.spread - a!.spread)) as Array<{ v: Verdict; vSigs: Signal[]; spread: number; min: number; max: number }>;
  }, [verdicts, signals]);

  return (
    <div className="h-full overflow-auto p-6 space-y-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-bold mb-1 flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-cyan-400" />
          Lens Disagreement Console
        </h2>
        <p className="text-xs text-slate-400">
          Verdicts where lenses disagree are the gold mine for tuning. Wide spread = signal worth investigating.
        </p>
      </div>

      <div className="space-y-3">
        {ranked.map(({ v, vSigs, spread, min, max }) => (
          <div key={v.id} className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${PRIORITY_STYLE[v.priority]?.bg} ${PRIORITY_STYLE[v.priority]?.text}`}>
                  {v.priority}
                </span>
                <span className="text-xs font-mono text-slate-500">{v.incident_key}</span>
                <span className="text-sm font-medium text-slate-100">{v.title}</span>
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-slate-500">spread</span>
                <span className="font-mono text-amber-300">{spread.toFixed(2)}</span>
                <span className="text-slate-600">({min.toFixed(2)}–{max.toFixed(2)})</span>
              </div>
            </div>

            <div className="relative h-10 bg-slate-950 rounded border border-slate-800">
              {vSigs.map((s) => {
                const l = lensById[s.lens_id];
                return (
                  <div
                    key={s.id}
                    className="absolute top-1 h-8 -translate-x-1/2 flex items-center"
                    style={{ left: `${s.score * 100}%` }}
                    title={`${l?.display_name ?? s.lens_id}: ${s.score.toFixed(2)}`}
                  >
                    <div
                      className="w-2 h-8 rounded-sm"
                      style={{ background: l?.color_hex ?? '#38bdf8', boxShadow: `0 0 10px ${l?.color_hex ?? '#38bdf8'}` }}
                    />
                    <span className="ml-1 text-[9px] font-mono whitespace-nowrap" style={{ color: l?.color_hex }}>
                      {(s.lens_id || '').slice(0, 3)} {s.score.toFixed(2)}
                    </span>
                  </div>
                );
              })}
              <div className="absolute left-0 right-0 bottom-0 flex justify-between px-1 text-[8px] text-slate-700">
                <span>0</span>
                <span>0.5</span>
                <span>1</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MLModelsView({ mlInvocations, verdicts }: { mlInvocations: MLInv[]; verdicts: Verdict[] }) {
  const verdictById = useMemo(() => Object.fromEntries(verdicts.map((v) => [v.id, v])), [verdicts]);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const modelStats = useMemo(() => {
    const m: Record<string, { name: string; category: string; family: string; count: number; avgScore: number; avgConf: number; avgLatency: number; avgDrift: number; }> = {};
    for (const inv of mlInvocations) {
      if (!m[inv.model_id]) {
        m[inv.model_id] = {
          name: inv.model_name,
          category: inv.model_category,
          family: inv.model_family,
          count: 0, avgScore: 0, avgConf: 0, avgLatency: 0, avgDrift: 0
        };
      }
      const e = m[inv.model_id];
      e.count++;
      e.avgScore += Number(inv.inference_score);
      e.avgConf += Number(inv.confidence);
      e.avgLatency += Number(inv.latency_ms);
      e.avgDrift += Number(inv.drift_psi);
    }
    for (const k of Object.keys(m)) {
      const e = m[k];
      e.avgScore /= e.count; e.avgConf /= e.count; e.avgLatency /= e.count; e.avgDrift /= e.count;
    }
    return m;
  }, [mlInvocations]);

  const byCategory = useMemo(() => {
    const c: Record<string, Array<{ id: string; stats: typeof modelStats[string] }>> = {};
    for (const [id, s] of Object.entries(modelStats)) {
      if (!c[s.category]) c[s.category] = [];
      c[s.category].push({ id, stats: s });
    }
    for (const k of Object.keys(c)) c[k].sort((a, b) => b.stats.count - a.stats.count);
    return c;
  }, [modelStats]);

  const categoryColors: Record<string, string> = {
    'behavioral':'#f472b6', 'malware':'#fb923c', 'vector':'#10b981',
    'threat-modeling':'#22d3ee', 'model-guard':'#ef4444', 'llm-risk':'#eab308',
    'correlation':'#a3e635', 'micro-pattern':'#60a5fa', 'pattern':'#34d399',
  };

  const recentForModel = useMemo(
    () => selectedModel ? mlInvocations.filter((m) => m.model_id === selectedModel).slice(0, 50) : [],
    [mlInvocations, selectedModel]
  );

  const totalModels = Object.keys(modelStats).length;

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-lime-400" />
              ML Model Fusion ({totalModels} active models)
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Every inference behind every verdict. Isolation forests, GBT classifiers, LSTM behavioral analyzers, sentence transformers, GNN attack-path predictors, Bayesian risk ensembles, drift detectors, voiceprint embeddings.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Mini2 label="invocations" value={mlInvocations.length} color="#a3e635" />
            <Mini2 label="categories" value={Object.keys(byCategory).length} color="#22d3ee" />
            <Mini2 label="avg latency" value={`${Math.round(mlInvocations.reduce((a, m) => a + m.latency_ms, 0) / Math.max(1, mlInvocations.length))}ms`} color="#eab308" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
          {Object.entries(byCategory).sort().map(([cat, list]) => {
            const color = categoryColors[cat] ?? '#94a3b8';
            return (
              <div key={cat} className="rounded-lg bg-slate-950 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                    <h3 className="text-sm font-bold text-slate-200 capitalize">{cat.replace('-', ' ')}</h3>
                  </div>
                  <span className="text-[10px] text-slate-500">{list.length} models</span>
                </div>
                <div className="space-y-2">
                  {list.map(({ id, stats }) => (
                    <button
                      key={id}
                      onClick={() => setSelectedModel(id === selectedModel ? null : id)}
                      className={`w-full text-left p-2 rounded border transition ${
                        selectedModel === id ? 'border-lime-400 bg-lime-500/10' : 'border-slate-800 hover:border-slate-700 bg-slate-900/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold text-slate-100 truncate">{stats.name}</div>
                        <span className="text-[9px] text-slate-500 font-mono ml-2">{stats.count}x</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-[9px]">
                        <span className="text-emerald-400">conf {(stats.avgConf * 100).toFixed(0)}%</span>
                        <span className="text-cyan-400">{Math.round(stats.avgLatency)}ms</span>
                        {stats.avgDrift > 0.15 && (
                          <span className="text-amber-400">drift {stats.avgDrift.toFixed(2)}</span>
                        )}
                      </div>
                      <div className="mt-1.5 h-1 bg-slate-800 rounded overflow-hidden">
                        <div
                          className="h-full"
                          style={{ width: `${stats.avgScore * 100}%`, background: color }}
                        />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectedModel && (
        <div className="bg-slate-900/60 border border-lime-500/40 rounded-xl p-5">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-lime-400" />
            Recent invocations - {modelStats[selectedModel]?.name}
          </h3>
          <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
            {recentForModel.map((inv) => {
              const v = verdictById[inv.verdict_id];
              return (
                <div key={inv.id} className="flex items-center gap-3 p-2 rounded bg-slate-950 border border-slate-800 text-xs">
                  <span className="font-mono text-[10px] text-slate-500 w-32">{new Date(inv.invoked_at).toLocaleTimeString()}</span>
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-lime-500/20 text-lime-300 w-20 text-center">
                    {(inv.inference_score * 100).toFixed(0)}%
                  </span>
                  <span className="text-slate-300 truncate flex-1">{v?.title ?? inv.verdict_id?.slice(0, 8)}</span>
                  <span className="text-cyan-400 font-mono text-[10px]">{inv.latency_ms}ms</span>
                  <span className="text-slate-500 text-[10px]">{inv.hardware}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Mini2({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded bg-slate-950 border border-slate-800 px-3 py-2 text-right">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

function AgentsView({ agentActions, verdicts }: { agentActions: AgentAct[]; verdicts: Verdict[] }) {
  const verdictById = useMemo(() => Object.fromEntries(verdicts.map((v) => [v.id, v])), [verdicts]);

  const byAgent = useMemo(() => {
    const m: Record<string, { name: string; role: string; color: string; actions: AgentAct[] }> = {};
    for (const a of agentActions) {
      if (!m[a.agent_slug]) m[a.agent_slug] = { name: a.agent_name, role: a.agent_role, color: a.agent_color, actions: [] };
      m[a.agent_slug].actions.push(a);
    }
    return m;
  }, [agentActions]);

  const totalCost = agentActions.reduce((a, x) => a + Number(x.cost_usd), 0);
  const totalTokens = agentActions.reduce((a, x) => a + x.llm_tokens, 0);
  const avgConf = agentActions.length ? agentActions.reduce((a, x) => a + Number(x.confidence), 0) / agentActions.length : 0;

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Bot className="w-5 h-5 text-emerald-400" />
              Agentic SOC Operations
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Atlas (triage), Sage (enrichment), Nova (investigation), Vanguard (response), Commander (orchestrator), plus AI-Correlation, Negative-Correlation, Pattern-Discovery, Sandbox, and BMAD build-time personas.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Mini2 label="agents" value={Object.keys(byAgent).length} color="#34d399" />
            <Mini2 label="actions" value={agentActions.length} color="#22d3ee" />
            <Mini2 label="LLM tokens" value={totalTokens.toLocaleString()} color="#a3e635" />
            <Mini2 label="cost" value={`$${totalCost.toFixed(2)}`} color="#eab308" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {Object.entries(byAgent).sort((a, b) => b[1].actions.length - a[1].actions.length).map(([slug, info]) => {
            const recent = info.actions.slice(0, 4);
            return (
              <div key={slug} className="rounded-lg bg-slate-950 border border-slate-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center"
                      style={{ background: `${info.color}22`, border: `1px solid ${info.color}` }}
                    >
                      <Bot className="w-5 h-5" style={{ color: info.color }} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-100">{info.name}</div>
                      <div className="text-[10px] text-slate-500 capitalize">{info.role.replace('_', ' ')}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold" style={{ color: info.color }}>{info.actions.length}</div>
                    <div className="text-[9px] text-slate-500">actions</div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  {recent.map((a) => {
                    const v = verdictById[a.verdict_id];
                    return (
                      <div key={a.id} className="p-2 rounded bg-slate-900/60 border border-slate-800/60">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: info.color }}>
                            {a.action_type}
                          </span>
                          <span className="text-[9px] text-slate-500 font-mono">{a.duration_ms}ms</span>
                        </div>
                        <div className="text-xs text-slate-300 mt-0.5 truncate">{a.action_summary}</div>
                        {v && <div className="text-[10px] text-slate-500 mt-0.5 truncate">- {v.title}</div>}
                        <div className="flex items-center gap-3 mt-1 text-[9px]">
                          <span className="text-emerald-400">{(a.confidence * 100).toFixed(0)}% conf</span>
                          <span className="text-slate-400">{a.decision}</span>
                          {a.llm_tokens > 0 && <span className="text-amber-400">{a.llm_tokens} tok</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
          <GitMerge className="w-4 h-4 text-emerald-400" />
          Live Action Stream (avg confidence {(avgConf * 100).toFixed(1)}%)
        </h3>
        <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
          {agentActions.slice(0, 50).map((a) => {
            const v = verdictById[a.verdict_id];
            return (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded bg-slate-950 border border-slate-800 text-xs">
                <span className="font-mono text-[10px] text-slate-500 w-24">{new Date(a.occurred_at).toLocaleTimeString()}</span>
                <div className="flex items-center gap-2 w-32">
                  <div className="w-2 h-2 rounded-full" style={{ background: a.agent_color }} />
                  <span className="font-semibold text-slate-200">{a.agent_name}</span>
                </div>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase w-24 text-center" style={{ background: `${a.agent_color}22`, color: a.agent_color }}>
                  {a.action_type}
                </span>
                <span className="text-slate-300 truncate flex-1">{v?.title ?? a.action_summary}</span>
                <span className="text-emerald-400 text-[10px]">{(a.confidence * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AttackChainsView({ chains, verdicts, mlInvocations, agentActions }: { chains: Chain[]; verdicts: Verdict[]; mlInvocations: MLInv[]; agentActions: AgentAct[] }) {
  const [selectedChain, setSelectedChain] = useState<Chain | null>(chains[0] ?? null);

  useMemo(() => { if (!selectedChain && chains[0]) setSelectedChain(chains[0]); }, [chains, selectedChain]);

  const chain = selectedChain ?? chains[0];
  const chainVerdicts = useMemo(
    () => chain ? verdicts.filter((v) => chain.verdict_ids.includes(v.id)) : [],
    [chain, verdicts]
  );
  const chainMl = useMemo(
    () => chain ? mlInvocations.filter((m) => chain.verdict_ids.includes(m.verdict_id)) : [],
    [chain, mlInvocations]
  );
  const chainAgents = useMemo(
    () => chain ? agentActions.filter((a) => chain.verdict_ids.includes(a.verdict_id)) : [],
    [chain, agentActions]
  );

  const sophColor = (s: string) => s === 'nation-state' ? '#ef4444' : s === 'expert' ? '#f59e0b' : s === 'high' ? '#eab308' : '#22d3ee';

  return (
    <div className="h-full overflow-auto p-6 space-y-6">
      <div className="bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-red-950/30 border border-slate-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Skull className="w-5 h-5 text-red-400" />
            Complex Multi-Engine Attack Chains
          </h2>
          <span className="text-xs text-slate-400">{chains.length} active campaigns</span>
        </div>
        <p className="text-xs text-slate-400">
          Each chain fuses ML inference, agentic actions, Glasswing vulns, Negative-correlation rules, and Bytecode Weaver artifacts into a single attack narrative.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 space-y-2">
          {chains.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedChain(c)}
              className={`w-full text-left p-3 rounded-lg border transition ${
                chain?.id === c.id ? 'border-red-500 bg-red-500/10' : 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono text-slate-500">{c.chain_code}</span>
                <span
                  className="px-1.5 py-0.5 text-[9px] font-bold rounded uppercase"
                  style={{ background: `${sophColor(c.sophistication)}22`, color: sophColor(c.sophistication) }}
                >
                  {c.sophistication}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-100">{c.campaign_name}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{c.threat_actor}</div>
              <div className="flex items-center gap-3 mt-2 text-[10px]">
                <span className="text-red-300">score {c.fused_score.toFixed(2)}</span>
                <span className="text-cyan-300">{c.kill_chain_stages.length} stages</span>
                <span className="text-amber-300">blast {c.blast_radius}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="col-span-8 space-y-4">
          {chain && (
            <>
              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-100">{chain.campaign_name}</h3>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                      <span><span className="text-slate-500">actor:</span> {chain.threat_actor}</span>
                      <span><span className="text-slate-500">motive:</span> {chain.motivation}</span>
                      <span><span className="text-slate-500">status:</span> {chain.containment_status}</span>
                    </div>
                  </div>
                  <span
                    className="px-3 py-1 rounded text-xs font-bold"
                    style={{ background: `${sophColor(chain.sophistication)}22`, color: sophColor(chain.sophistication) }}
                  >
                    {chain.fused_score.toFixed(2)}
                  </span>
                </div>
                <p className="text-sm text-slate-300 leading-relaxed">{chain.narrative}</p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
                  <Pill label="ML models" value={chain.ml_models_used.length} color="#a3e635" icon={Cpu} />
                  <Pill label="Agents" value={chain.agents_orchestrated.length} color="#34d399" icon={Bot} />
                  <Pill label="Glasswing CVEs" value={chain.glasswing_vulns.length} color="#fb923c" icon={ShieldAlert} />
                  <Pill label="NC rules fired" value={chain.negative_correlation_rules.length} color="#ef4444" icon={AlertTriangle} />
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <GitBranch className="w-4 h-4 text-cyan-400" />
                  Kill Chain Stages
                </h4>
                <div className="flex items-center gap-1 flex-wrap">
                  {chain.kill_chain_stages.map((s, idx) => (
                    <div key={s} className="flex items-center gap-1">
                      <span className="px-2 py-1 rounded text-[10px] font-bold uppercase bg-red-500/20 text-red-300 border border-red-500/30">{s}</span>
                      {idx < chain.kill_chain_stages.length - 1 && <ChevronRight className="w-3 h-3 text-slate-500" />}
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {chain.mitre_techniques.map((t) => (
                    <span key={t} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700">{t}</span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-lime-400" />
                    ML Models Used ({chain.ml_models_used.length})
                  </h4>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {chain.ml_models_used.map((m) => (
                      <div key={m} className="text-xs px-2 py-1.5 rounded bg-slate-950 border border-slate-800 font-mono text-lime-300">
                        {m}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    <span className="text-slate-500">live invocations on this chain:</span> <span className="text-lime-400 font-bold">{chainMl.length}</span>
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Bot className="w-4 h-4 text-emerald-400" />
                    Agents Orchestrated ({chain.agents_orchestrated.length})
                  </h4>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {chain.agents_orchestrated.map((a) => (
                      <div key={a} className="text-xs px-2 py-1.5 rounded bg-slate-950 border border-slate-800 font-mono text-emerald-300">
                        {a}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-slate-400">
                    <span className="text-slate-500">recorded actions:</span> <span className="text-emerald-400 font-bold">{chainAgents.length}</span>
                  </div>
                </div>
              </div>

              {chain.bytecode_artifacts.length > 0 && (
                <div className="bg-slate-900/60 border border-purple-500/30 rounded-xl p-5">
                  <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                    <Binary className="w-4 h-4 text-purple-400" />
                    Bytecode Weaver Artifacts
                  </h4>
                  <div className="space-y-2">
                    {chain.bytecode_artifacts.map((b, i) => (
                      <div key={i} className="p-3 rounded bg-slate-950 border border-purple-500/20">
                        <pre className="text-[10px] text-purple-200 whitespace-pre-wrap break-all font-mono">{JSON.stringify(b, null, 2)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(chain.glasswing_vulns.length > 0 || chain.negative_correlation_rules.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {chain.glasswing_vulns.length > 0 && (
                    <div className="bg-slate-900/60 border border-orange-500/30 rounded-xl p-5">
                      <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-orange-400" />
                        Glasswing Vulnerabilities
                      </h4>
                      <div className="space-y-1">
                        {chain.glasswing_vulns.map((g) => (
                          <div key={g} className="text-xs px-2 py-1.5 rounded bg-slate-950 border border-orange-500/20 font-mono text-orange-300">
                            {g}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {chain.negative_correlation_rules.length > 0 && (
                    <div className="bg-slate-900/60 border border-red-500/30 rounded-xl p-5">
                      <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        Negative Correlation Rules Fired
                      </h4>
                      <div className="space-y-1">
                        {chain.negative_correlation_rules.map((r) => (
                          <div key={r} className="text-xs px-2 py-1.5 rounded bg-slate-950 border border-red-500/20 font-mono text-red-300">
                            {r}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5">
                <h4 className="text-sm font-bold mb-3 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  Linked Verdicts ({chainVerdicts.length})
                </h4>
                <div className="space-y-1.5">
                  {chainVerdicts.map((v) => (
                    <div key={v.id} className="flex items-center gap-3 p-2 rounded bg-slate-950 border border-slate-800 text-xs">
                      <span className="font-mono text-[10px] text-slate-500 w-32">{v.incident_key}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${PRIORITY_STYLE[v.priority]?.bg ?? ''} ${PRIORITY_STYLE[v.priority]?.text ?? ''}`}>
                        {v.priority}
                      </span>
                      <span className="text-slate-200 truncate flex-1">{v.title}</span>
                      <span className="text-red-300 font-bold">{Number(v.fused_score).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ label, value, color, icon: Icon }: { label: string; value: number; color: string; icon: typeof Cpu }) {
  return (
    <div className="rounded bg-slate-950 border border-slate-800 px-3 py-2 flex items-center gap-2">
      <Icon className="w-4 h-4" style={{ color }} />
      <div>
        <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-base font-bold" style={{ color }}>{value}</div>
      </div>
    </div>
  );
}
