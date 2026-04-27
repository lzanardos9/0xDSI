import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AlertTriangle, Brain, Gauge, Network, Target, Users, Zap,
  GitBranch, Sparkles, ChevronRight, Layers, Workflow, Eye, Scale,
  Waves, Sigma, FlaskConical, Beaker
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
};

const PRIORITY_STYLE: Record<string, { bg: string; ring: string; text: string }> = {
  P1: { bg: 'bg-red-500/20', ring: 'ring-red-500/60', text: 'text-red-300' },
  P2: { bg: 'bg-orange-500/20', ring: 'ring-orange-500/60', text: 'text-orange-300' },
  P3: { bg: 'bg-amber-500/20', ring: 'ring-amber-500/60', text: 'text-amber-300' },
  P4: { bg: 'bg-sky-500/20', ring: 'ring-sky-500/60', text: 'text-sky-300' },
};

type Tab = 'river' | 'verdicts' | 'sunburst' | 'lineage' | 'formula' | 'disagree';

export default function DetectionConfluence() {
  const [tab, setTab] = useState<Tab>('river');
  const [lenses, setLenses] = useState<Lens[]>([]);
  const [signals, setSignals] = useState<Signal[]>([]);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [weights, setWeights] = useState<Weight[]>([]);
  const [selectedVerdict, setSelectedVerdict] = useState<Verdict | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [l, s, v, w] = await Promise.all([
        supabase.from('confluence_lenses').select('*').order('display_name'),
        supabase.from('confluence_signals').select('*').order('emitted_at', { ascending: false }).limit(200),
        supabase.from('confluence_verdicts').select('*').order('fused_score', { ascending: false }),
        supabase.from('confluence_lens_weights').select('*').eq('tenant_id', 'default'),
      ]);
      setLenses((l.data ?? []) as Lens[]);
      setSignals((s.data ?? []) as Signal[]);
      setVerdicts((v.data ?? []) as Verdict[]);
      setWeights((w.data ?? []) as Weight[]);
      setLoading(false);
    })();
  }, []);

  const lensById = useMemo(
    () => Object.fromEntries(lenses.map((l) => [l.id, l])),
    [lenses]
  );

  const stats = useMemo(() => {
    const p1 = verdicts.filter((v) => v.priority === 'P1').length;
    const p2 = verdicts.filter((v) => v.priority === 'P2').length;
    const consensus = verdicts.filter((v) => v.contributing_lenses.length >= 4).length;
    const avgScore = verdicts.length
      ? verdicts.reduce((a, v) => a + v.fused_score, 0) / verdicts.length
      : 0;
    return { p1, p2, consensus, avgScore, total: verdicts.length };
  }, [verdicts]);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <Header stats={stats} loading={loading} />
      <Tabs tab={tab} setTab={setTab} />

      <div className="flex-1 overflow-hidden">
        {tab === 'river' && (
          <RiverView lenses={lenses} signals={signals} verdicts={verdicts} weights={weights} />
        )}
        {tab === 'verdicts' && (
          <VerdictsView
            verdicts={verdicts}
            signals={signals}
            lensById={lensById}
            onSelect={(v) => { setSelectedVerdict(v); setTab('lineage'); }}
          />
        )}
        {tab === 'sunburst' && (
          <SunburstView verdicts={verdicts} signals={signals} lensById={lensById} />
        )}
        {tab === 'lineage' && (
          <LineageView
            verdict={selectedVerdict ?? verdicts[0]}
            signals={signals}
            lensById={lensById}
            allVerdicts={verdicts}
            onSelect={setSelectedVerdict}
          />
        )}
        {tab === 'formula' && (
          <FormulaView lenses={lenses} weights={weights} verdicts={verdicts} signals={signals} />
        )}
        {tab === 'disagree' && (
          <DisagreementView verdicts={verdicts} signals={signals} lensById={lensById} />
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
