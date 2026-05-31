import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  GitBranch,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Layers,
  Network,
  ShieldAlert,
  ChevronRight,
  Database,
  Cpu,
  Workflow,
  FileText,
  Gauge,
  Zap,
  Server,
  Radio,
  Filter,
  FlaskConical,
} from 'lucide-react';

type Feasibility = { id: string; capability: string; databricks_native: string; notes: string; risk: string; sort_order: number };
type Phase = { id: string; phase_key: string; name: string; days: number; status: string; deliverables: string[]; acceptance: string; sort_order: number };
type Query = { id: string; query_id: string; name: string; category: string; semantics: string; window_seconds: number; min_hops: number; max_hops: number; predicate_yaml: string; mitre_techniques: string[]; enabled: boolean };
type TrendComplete = { id: string; query_id: string; trend_key: string; start_entity: string; end_entity: string; hops: number; path: Array<Record<string, unknown>>; severity: string; score: number; detected_at: string; explanation: string };
type Graphlet = { id: string; graphlet_id: string; window_start: string; window_end: string; node_count: number; edge_count: number; shared_with_windows: number; reuse_ratio: number; memory_kb: number };
type PRD = { id: string; prd_key: string; title: string; summary: string; motivation: string; non_goals: string[]; requirements: string[]; open_questions: string[]; acceptance: string[]; owning_feature: string; effort_days: number; risk: string; sort_order: number };
type ArchLayer = { id: string; layer: string; component: string; technology: string; role: string; rate: string; persistence: string; sort_order: number };
type StillMissing = { id: string; gap: string; impact: string; mitigation: string; severity: string; sort_order: number };
type Metric = { id: string; phase_key: string; metric: string; value: number; unit: string; target: number; trend_direction: string; sort_order: number };
type GraphNode = { id: string; node_id: string; label: string; node_type: string; x: number; y: number; risk: number; cluster: string; metadata: Record<string, unknown> };
type GraphEdge = { id: string; edge_id: string; src_id: string; dst_id: string; edge_type: string; ts_offset_s: number; weight: number; on_trend_key: string; metadata: Record<string, unknown> };
type Benchmark = { id: string; variant: string; eps: number; p99_latency_ms: number; memory_mb: number; cpu_cores: number; speedup_vs_baseline: number; sort_order: number };

type TabKey = 'overview' | 'architecture' | 'graph' | 'queries' | 'trends' | 'prds' | 'missing' | 'bench';

const nativeBadge = (val: string) => {
  if (val === 'yes') return { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Native', Icon: CheckCircle2 };
  if (val === 'partial') return { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Partial', Icon: AlertTriangle };
  if (val === 'yes-caveats') return { cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', label: 'Native w/ caveats', Icon: AlertTriangle };
  return { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Not native', Icon: XCircle };
};

const riskColor = (r: string) => (r === 'low' ? 'text-emerald-300' : r === 'medium' ? 'text-amber-300' : 'text-rose-300');

const phaseStatusBadge = (s: string) => {
  if (s === 'in_progress') return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30';
  if (s === 'completed') return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
  return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
};

const severityBadge = (sev: string) => {
  if (sev === 'critical') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  if (sev === 'high') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
};

const layerColor = (layer: string) => {
  const map: Record<string, string> = {
    ingestion: 'from-cyan-500/20 to-cyan-500/5 border-cyan-500/30',
    'hot-state': 'from-rose-500/20 to-rose-500/5 border-rose-500/30',
    'warm-state': 'from-amber-500/20 to-amber-500/5 border-amber-500/30',
    'graph-offline': 'from-sky-500/20 to-sky-500/5 border-sky-500/30',
    analytics: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
    governance: 'from-slate-500/20 to-slate-500/5 border-slate-500/30',
    serving: 'from-teal-500/20 to-teal-500/5 border-teal-500/30',
  };
  return map[layer] || 'from-slate-500/20 to-slate-500/5 border-slate-500/30';
};

const nodeColor = (cluster: string) => {
  const m: Record<string, string> = {
    build: '#22d3ee',
    dev: '#06b6d4',
    app: '#10b981',
    data: '#f59e0b',
    user: '#64748b',
    attack: '#ef4444',
    crown_jewel: '#f43f5e',
    default: '#94a3b8',
  };
  return m[cluster] || '#94a3b8';
};

export default function TrendEngineCET() {
  const [feasibility, setFeasibility] = useState<Feasibility[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [queries, setQueries] = useState<Query[]>([]);
  const [trends, setTrends] = useState<TrendComplete[]>([]);
  const [graphlets, setGraphlets] = useState<Graphlet[]>([]);
  const [prds, setPrds] = useState<PRD[]>([]);
  const [arch, setArch] = useState<ArchLayer[]>([]);
  const [missing, setMissing] = useState<StillMissing[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [gNodes, setGNodes] = useState<GraphNode[]>([]);
  const [gEdges, setGEdges] = useState<GraphEdge[]>([]);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('overview');
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [activeTrend, setActiveTrend] = useState<TrendComplete | null>(null);
  const [highlightedTrendKey, setHighlightedTrendKey] = useState<string>('lm-trend-001');
  const [activePrd, setActivePrd] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    (async () => {
      const [f, p, q, t, g, pr, a, m, me, gn, ge, bn] = await Promise.all([
        supabase.from('trend_feasibility').select('*').order('sort_order'),
        supabase.from('trend_phases').select('*').order('sort_order'),
        supabase.from('trend_queries').select('*').order('query_id'),
        supabase.from('trend_complete').select('*').order('detected_at', { ascending: false }),
        supabase.from('trend_graphlets').select('*').order('window_start', { ascending: false }),
        supabase.from('trend_prds').select('*').order('sort_order'),
        supabase.from('trend_architecture_layers').select('*').order('sort_order'),
        supabase.from('trend_still_missing').select('*').order('sort_order'),
        supabase.from('trend_runtime_metrics').select('*').order('sort_order'),
        supabase.from('trend_graph_nodes').select('*'),
        supabase.from('trend_graph_edges').select('*').order('ts_offset_s'),
        supabase.from('trend_benchmarks').select('*').order('sort_order'),
      ]);
      setFeasibility(f.data ?? []);
      setPhases(p.data ?? []);
      setQueries(q.data ?? []);
      setTrends((t.data ?? []) as TrendComplete[]);
      setGraphlets(g.data ?? []);
      setPrds(pr.data ?? []);
      setArch(a.data ?? []);
      setMissing(m.data ?? []);
      setMetrics(me.data ?? []);
      setGNodes(gn.data ?? []);
      setGEdges(ge.data ?? []);
      setBenchmarks(bn.data ?? []);
      if (q.data && q.data.length > 0) setActiveQuery(q.data[0].query_id);
      if (pr.data && pr.data.length > 0) setActivePrd(pr.data[0].prd_key);
      setLoading(false);
    })();
  }, []);

  // Pulse animation driver
  useEffect(() => {
    const id = window.setInterval(() => setPulse(p => (p + 1) % 1000), 80);
    return () => window.clearInterval(id);
  }, []);

  const selectedQuery = useMemo(() => queries.find(q => q.query_id === activeQuery) ?? null, [queries, activeQuery]);
  const trendsForQuery = useMemo(() => trends.filter(t => !activeQuery || t.query_id === activeQuery), [trends, activeQuery]);
  const selectedPrd = useMemo(() => prds.find(p => p.prd_key === activePrd) ?? null, [prds, activePrd]);

  const headline = useMemo(() => {
    const nat = feasibility.filter(f => f.databricks_native === 'yes').length;
    const part = feasibility.filter(f => f.databricks_native === 'partial').length;
    const caveat = feasibility.filter(f => f.databricks_native === 'yes-caveats').length;
    const no = feasibility.filter(f => f.databricks_native === 'no').length;
    const total = feasibility.length || 1;
    const coverage = Math.round(((nat + part * 0.6 + caveat * 0.8) / total) * 100);
    return { nat, part, caveat, no, total, coverage };
  }, [feasibility]);

  const nodeMap = useMemo(() => new Map(gNodes.map(n => [n.node_id, n])), [gNodes]);
  const trendKeys = useMemo(() => Array.from(new Set(gEdges.map(e => e.on_trend_key).filter(Boolean))), [gEdges]);

  if (loading) {
    return (
      <div className="p-8 text-slate-400 flex items-center gap-3">
        <Activity className="w-5 h-5 animate-pulse text-cyan-400" />
        Loading CET Trend Engine...
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; icon: typeof Gauge }[] = [
    { key: 'overview', label: 'Overview', icon: Gauge },
    { key: 'architecture', label: 'Architecture', icon: Server },
    { key: 'graph', label: 'Live Graph', icon: Network },
    { key: 'queries', label: 'Kleene Queries', icon: FileText },
    { key: 'trends', label: 'Trends', icon: ShieldAlert },
    { key: 'prds', label: 'PRDs', icon: FlaskConical },
    { key: 'missing', label: 'Still Missing', icon: XCircle },
    { key: 'bench', label: 'Benchmarks', icon: Zap },
  ];

  return (
    <div className="p-6 space-y-6">
      <HeaderBanner headline={headline} />

      <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-800 pb-0">
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium flex items-center gap-2 whitespace-nowrap border-b-2 transition ${
                active
                  ? 'text-cyan-300 border-cyan-400'
                  : 'text-slate-400 border-transparent hover:text-slate-200 hover:border-slate-700'
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <OverviewTab feasibility={feasibility} phases={phases} metrics={metrics} />
      )}
      {tab === 'architecture' && <ArchitectureTab arch={arch} pulse={pulse} />}
      {tab === 'graph' && (
        <GraphTab
          nodes={gNodes}
          edges={gEdges}
          nodeMap={nodeMap}
          trendKeys={trendKeys}
          highlightedTrendKey={highlightedTrendKey}
          setHighlightedTrendKey={setHighlightedTrendKey}
          pulse={pulse}
          trends={trends}
          graphlets={graphlets}
        />
      )}
      {tab === 'queries' && (
        <QueriesTab
          queries={queries}
          activeQuery={activeQuery}
          setActiveQuery={setActiveQuery}
          selectedQuery={selectedQuery}
        />
      )}
      {tab === 'trends' && (
        <TrendsTab
          trendsForQuery={trendsForQuery}
          activeTrend={activeTrend}
          setActiveTrend={setActiveTrend}
          queries={queries}
          activeQuery={activeQuery}
          setActiveQuery={setActiveQuery}
        />
      )}
      {tab === 'prds' && <PrdsTab prds={prds} activePrd={activePrd} setActivePrd={setActivePrd} selectedPrd={selectedPrd} />}
      {tab === 'missing' && <MissingTab missing={missing} />}
      {tab === 'bench' && <BenchTab benchmarks={benchmarks} />}
    </div>
  );
}

function HeaderBanner({ headline }: { headline: { nat: number; part: number; caveat: number; no: number; coverage: number } }) {
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 shadow-xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
            <GitBranch className="w-7 h-7 text-cyan-300" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-slate-50">0xDSI Complete Trend Engine</h1>
              <span className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Production-ready MVP
              </span>
            </div>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl leading-relaxed">
              Kleene-closure Complete Event Trend detection on Databricks. Hot path: Spark + RocksDB state.
              Warm path: <span className="text-amber-300">Lakebase Postgres</span> for graphlet sharing,
              checkpointing, and trend serving.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 min-w-[420px]">
          <Stat label="Native" value={headline.nat} tone="emerald" />
          <Stat label="Partial" value={headline.part} tone="amber" />
          <Stat label="Caveats" value={headline.caveat} tone="cyan" />
          <Stat label="Not native" value={headline.no} tone="rose" />
        </div>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
          <span>Databricks-native coverage (Lakebase-augmented)</span>
          <span className="text-slate-200 font-medium">{headline.coverage}%</span>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-teal-300" style={{ width: `${headline.coverage}%` }} />
        </div>
      </div>
    </div>
  );
}

function OverviewTab({ feasibility, phases, metrics }: { feasibility: Feasibility[]; phases: Phase[]; metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Feasibility Matrix</h2>
        </div>
        <div className="space-y-2">
          {feasibility.map(f => {
            const b = nativeBadge(f.databricks_native);
            return (
              <div key={f.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-slate-700 transition">
                <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium ${b.cls}`}>
                  <b.Icon className="w-3.5 h-3.5" />
                  {b.label}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm text-slate-100 font-medium truncate">{f.capability}</div>
                    <div className={`text-[11px] uppercase tracking-wider ${riskColor(f.risk)}`}>{f.risk} risk</div>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 leading-relaxed">{f.notes}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Workflow className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Phase Execution</h2>
        </div>
        <div className="space-y-3">
          {phases.map((p, idx) => {
            const phaseMetrics = metrics.filter(m => m.phase_key === p.phase_key);
            return (
              <div key={p.id} className="relative pl-7">
                <div
                  className={`absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    p.status === 'in_progress'
                      ? 'border-cyan-400 bg-cyan-500/30 animate-pulse'
                      : p.status === 'completed'
                      ? 'border-emerald-400 bg-emerald-500/30'
                      : 'border-slate-600 bg-slate-800'
                  }`}
                >
                  <span className="text-[10px] font-bold text-slate-100">{idx}</span>
                </div>
                {idx < phases.length - 1 && <div className="absolute left-[9px] top-7 bottom-[-12px] w-px bg-slate-700" />}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-slate-100 font-medium">{p.name}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${phaseStatusBadge(p.status)}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {p.days}d
                </div>
                {phaseMetrics.length > 0 && (
                  <div className="grid grid-cols-2 gap-1 mt-2">
                    {phaseMetrics.map(m => (
                      <div key={m.id} className="text-[10px] p-1.5 rounded bg-slate-950/60 border border-slate-800">
                        <div className="text-slate-500 truncate">{m.metric}</div>
                        <div className="text-slate-100 font-mono">{m.value.toLocaleString()} {m.unit}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ArchitectureTab({ arch, pulse }: { arch: ArchLayer[]; pulse: number }) {
  const layers = ['ingestion', 'hot-state', 'warm-state', 'graph-offline', 'analytics', 'governance', 'serving'];
  const byLayer = Object.fromEntries(layers.map(l => [l, arch.filter(a => a.layer === l)]));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-amber-100">Lakebase is warm-path only</div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-4xl">
              Lakebase cannot replace RocksDB in the Spark hot loop (network RTT kills per-key state ops at millions/sec/executor).
              Architecture uses Lakebase for graphlet sharing across overlapping windows, partial-trend checkpointing (warm-start on restart),
              and trend output serving to the UI. This is a deliberate split, not a workaround. RocksDB stays embedded for the hot match loop.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase mb-4">Data Flow (left to right)</h2>
        <div className="relative overflow-x-auto">
          <svg viewBox="0 0 1200 400" className="w-full h-auto min-w-[1000px]">
            <defs>
              <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0" />
                <stop offset="50%" stopColor="#22d3ee" stopOpacity="1" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </linearGradient>
              <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
              </marker>
            </defs>

            {/* layer bands */}
            {['ingestion', 'hot-state', 'warm-state', 'analytics'].map((l, i) => (
              <g key={l}>
                <rect x={20 + i * 290} y="40" width="270" height="320" rx="14" fill="#0f172a" stroke="#1e293b" />
                <text x={155 + i * 290} y="70" fontSize="11" fill="#94a3b8" textAnchor="middle" fontFamily="ui-monospace, monospace">
                  {l.toUpperCase()}
                </text>
              </g>
            ))}

            {/* ingestion boxes */}
            <ArchBox x={40} y={100} w={230} h={60} title="Auto Loader" sub="Bronze: 100K+ EPS" color="#22d3ee" />
            <ArchBox x={40} y={180} w={230} h={60} title="Lakeflow Pipelines" sub="Silver: OCSF normalized" color="#22d3ee" />
            <ArchBox x={40} y={260} w={230} h={60} title="Delta Gold" sub="Enriched + partitioned" color="#22d3ee" />

            {/* hot-state boxes */}
            <ArchBox x={330} y={100} w={230} h={60} title="flatMapGroupsWithState" sub="per-window matcher" color="#f43f5e" />
            <ArchBox x={330} y={180} w={230} h={60} title="Skip-till-any-match NFA" sub="Kleene closure matcher" color="#f43f5e" />
            <ArchBox x={330} y={260} w={230} h={60} title="RocksDB state store" sub="~1M ops/sec/executor (hot)" color="#f43f5e" highlight={pulse} />

            {/* warm-state boxes (Lakebase) */}
            <ArchBox x={620} y={100} w={230} h={60} title="Graphlet cache" sub="Lakebase Postgres (shared)" color="#f59e0b" highlight={pulse} />
            <ArchBox x={620} y={180} w={230} h={60} title="Partial-trend checkpoint" sub="Lakebase (warm-start)" color="#f59e0b" />
            <ArchBox x={620} y={260} w={230} h={60} title="Trend output + lineage" sub="Lakebase + Delta audit" color="#f59e0b" />

            {/* analytics boxes */}
            <ArchBox x={910} y={100} w={270} h={60} title="Mosaic AI Vector Search" sub="Trend embeddings auto-sync" color="#10b981" />
            <ArchBox x={910} y={180} w={270} h={60} title="MLflow + Model Serving" sub="Risk scoring <50ms p99" color="#10b981" />
            <ArchBox x={910} y={260} w={270} h={60} title="SOC UI (serving)" sub="Reads from Lakebase" color="#10b981" />

            {/* flow arrows */}
            {[
              [270, 130, 330, 130],
              [270, 210, 330, 210],
              [560, 130, 620, 130],
              [560, 210, 620, 210],
              [560, 290, 620, 290],
              [850, 130, 910, 130],
              [850, 210, 910, 210],
              [850, 290, 910, 290],
            ].map(([x1, y1, x2, y2], i) => (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth="1.5" markerEnd="url(#arrow)" />
                <circle r="2.5" fill="#22d3ee">
                  <animate attributeName="cx" values={`${x1};${x2}`} dur="2.2s" repeatCount="indefinite" begin={`${i * 0.18}s`} />
                  <animate attributeName="cy" values={`${y1};${y2}`} dur="2.2s" repeatCount="indefinite" begin={`${i * 0.18}s`} />
                  <animate attributeName="opacity" values="0;1;0" dur="2.2s" repeatCount="indefinite" begin={`${i * 0.18}s`} />
                </circle>
              </g>
            ))}

            {/* feedback: warm-state back into hot-state */}
            <path d="M 620 300 Q 580 360 460 340 L 460 320" stroke="#f59e0b" strokeWidth="1.2" strokeDasharray="4 3" fill="none" markerEnd="url(#arrow)" opacity="0.7" />
            <text x={540} y={378} fontSize="10" fill="#f59e0b" textAnchor="middle">graphlet reuse across windows</text>
          </svg>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {layers.map(layer => {
          const items = byLayer[layer];
          if (!items || items.length === 0) return null;
          return (
            <div key={layer} className={`rounded-2xl border bg-gradient-to-br ${layerColor(layer)} p-4`}>
              <div className="text-xs uppercase tracking-widest font-semibold text-slate-200 mb-3">{layer.replace('-', ' ')}</div>
              <div className="space-y-2">
                {items.map(item => (
                  <div key={item.id} className="p-3 rounded-lg bg-slate-950/50 border border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm text-slate-100 font-medium">{item.component}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{item.rate}</div>
                    </div>
                    <div className="text-[11px] text-cyan-300/80 font-mono mt-0.5">{item.technology}</div>
                    <div className="text-xs text-slate-400 mt-1 leading-relaxed">{item.role}</div>
                    {item.persistence && (
                      <div className="text-[10px] text-slate-500 mt-1">
                        <span className="text-slate-600">persist:</span> {item.persistence}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArchBox({ x, y, w, h, title, sub, color, highlight }: { x: number; y: number; w: number; h: number; title: string; sub: string; color: string; highlight?: number }) {
  const glow = highlight ? 0.4 + 0.3 * Math.sin(highlight / 8) : 0;
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx="10" fill="#0b1220" stroke={color} strokeWidth="1.5" opacity={0.95} />
      {glow > 0 && <rect x={x} y={y} width={w} height={h} rx="10" fill="none" stroke={color} strokeWidth="2" opacity={glow} />}
      <text x={x + 14} y={y + 24} fontSize="13" fill="#f1f5f9" fontWeight="600">{title}</text>
      <text x={x + 14} y={y + 44} fontSize="11" fill="#94a3b8">{sub}</text>
    </g>
  );
}

function GraphTab({
  nodes,
  edges,
  nodeMap,
  trendKeys,
  highlightedTrendKey,
  setHighlightedTrendKey,
  pulse,
  trends,
  graphlets,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  nodeMap: Map<string, GraphNode>;
  trendKeys: string[];
  highlightedTrendKey: string;
  setHighlightedTrendKey: (k: string) => void;
  pulse: number;
  trends: TrendComplete[];
  graphlets: Graphlet[];
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const trendEdges = edges.filter(e => e.on_trend_key === highlightedTrendKey);
  const benignEdges = edges.filter(e => !e.on_trend_key);
  const highlightedTrend = trends.find(t => t.trend_key === highlightedTrendKey);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
      <div className="xl:col-span-3 rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-950 to-slate-900 p-5 overflow-hidden relative">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Live CET Graph</h2>
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <select
              value={highlightedTrendKey}
              onChange={e => setHighlightedTrendKey(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-md px-2 py-1.5"
            >
              {trendKeys.map(k => (
                <option key={k} value={k}>{k}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="relative">
          <svg ref={svgRef} viewBox="0 0 1000 560" className="w-full h-auto">
            <defs>
              <radialGradient id="nodeGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="trendEdge" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#f59e0b" />
              </linearGradient>
              <marker id="arrowTrend" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#f43f5e" />
              </marker>
              <marker id="arrowBenign" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
              </marker>
              <filter id="blur2"><feGaussianBlur stdDeviation="3" /></filter>
            </defs>

            {/* cluster bubbles */}
            {['build', 'dev', 'app', 'data', 'user', 'crown_jewel'].map(cluster => {
              const clusterNodes = nodes.filter(n => n.cluster === cluster);
              if (clusterNodes.length === 0) return null;
              const minX = Math.min(...clusterNodes.map(n => n.x)) - 40;
              const maxX = Math.max(...clusterNodes.map(n => n.x)) + 40;
              const minY = Math.min(...clusterNodes.map(n => n.y)) - 32;
              const maxY = Math.max(...clusterNodes.map(n => n.y)) + 32;
              return (
                <g key={cluster}>
                  <rect
                    x={minX}
                    y={minY}
                    width={maxX - minX}
                    height={maxY - minY}
                    rx="22"
                    fill={nodeColor(cluster)}
                    opacity="0.05"
                    stroke={nodeColor(cluster)}
                    strokeOpacity="0.25"
                    strokeDasharray="5 4"
                  />
                  <text x={minX + 10} y={minY + 16} fontSize="10" fill={nodeColor(cluster)} opacity="0.85" fontFamily="ui-monospace, monospace">
                    {cluster.replace('_', ' ').toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* benign edges (dim) */}
            {benignEdges.map(e => {
              const s = nodeMap.get(e.src_id);
              const d = nodeMap.get(e.dst_id);
              if (!s || !d) return null;
              return (
                <line
                  key={e.id}
                  x1={s.x}
                  y1={s.y}
                  x2={d.x}
                  y2={d.y}
                  stroke="#1f2937"
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  markerEnd="url(#arrowBenign)"
                  opacity="0.6"
                />
              );
            })}

            {/* trend edges (glowing, animated) */}
            {trendEdges.map((e, i) => {
              const s = nodeMap.get(e.src_id);
              const d = nodeMap.get(e.dst_id);
              if (!s || !d) return null;
              const midX = (s.x + d.x) / 2;
              const midY = (s.y + d.y) / 2 - 10;
              return (
                <g key={e.id}>
                  <line x1={s.x} y1={s.y} x2={d.x} y2={d.y} stroke="#f43f5e" strokeWidth="5" opacity="0.2" filter="url(#blur2)" />
                  <line x1={s.x} y1={s.y} x2={d.x} y2={d.y} stroke="url(#trendEdge)" strokeWidth="2.2" markerEnd="url(#arrowTrend)" />
                  <circle r="3.5" fill="#fbbf24">
                    <animate attributeName="cx" values={`${s.x};${d.x}`} dur="2s" repeatCount="indefinite" begin={`${i * 0.25}s`} />
                    <animate attributeName="cy" values={`${s.y};${d.y}`} dur="2s" repeatCount="indefinite" begin={`${i * 0.25}s`} />
                    <animate attributeName="opacity" values="0;1;1;0" dur="2s" repeatCount="indefinite" begin={`${i * 0.25}s`} />
                  </circle>
                  <text x={midX} y={midY} fontSize="9" fill="#fbbf24" textAnchor="middle" fontFamily="ui-monospace, monospace">
                    {e.edge_type} · +{e.ts_offset_s}s
                  </text>
                </g>
              );
            })}

            {/* nodes */}
            {nodes.map(n => {
              const onTrend = trendEdges.some(e => e.src_id === n.node_id || e.dst_id === n.node_id);
              const r = 18 + n.risk * 10;
              const color = nodeColor(n.cluster);
              const ringR = r + 6 + (onTrend ? Math.sin(pulse / 6) * 3 : 0);
              return (
                <g key={n.id}>
                  {onTrend && <circle cx={n.x} cy={n.y} r={ringR} fill="none" stroke={color} strokeWidth="1.2" opacity="0.6" />}
                  {onTrend && <circle cx={n.x} cy={n.y} r={r + 14} fill="url(#nodeGlow)" opacity="0.7" />}
                  <circle cx={n.x} cy={n.y} r={r} fill={color} opacity={onTrend ? 0.95 : 0.5} stroke="#0f172a" strokeWidth="2" />
                  <text x={n.x} y={n.y + 3} fontSize="10" fill="#0f172a" textAnchor="middle" fontWeight="700" fontFamily="ui-monospace, monospace">
                    {n.node_type.slice(0, 2).toUpperCase()}
                  </text>
                  <text x={n.x} y={n.y + r + 14} fontSize="10" fill={onTrend ? '#f1f5f9' : '#64748b'} textAnchor="middle" fontFamily="ui-monospace, monospace">
                    {n.label}
                  </text>
                </g>
              );
            })}
          </svg>

          <div className="absolute bottom-3 left-3 flex items-center gap-3 text-[10px] text-slate-400 bg-slate-950/80 border border-slate-800 rounded-md px-3 py-1.5">
            <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-400" /> Trend edge</div>
            <div className="flex items-center gap-1.5"><div className="w-2 h-0.5 bg-slate-600" /> Benign</div>
            <div className="flex items-center gap-1.5"><Radio className="w-3 h-3 text-amber-300" /> Live propagation</div>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {highlightedTrend && (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4">
            <div className="text-[10px] uppercase tracking-widest text-rose-300 font-semibold">Active trend</div>
            <div className="text-sm text-slate-100 font-mono mt-1">{highlightedTrend.trend_key}</div>
            <div className="text-xs text-slate-400 mt-0.5">
              {highlightedTrend.start_entity} → {highlightedTrend.end_entity}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-500">Hops</div>
                <div className="text-sm text-slate-100 font-semibold">{highlightedTrend.hops}</div>
              </div>
              <div className="p-2 rounded bg-slate-950/60 border border-slate-800">
                <div className="text-[10px] text-slate-500">Score</div>
                <div className="text-sm text-slate-100 font-semibold">{highlightedTrend.score.toFixed(2)}</div>
              </div>
            </div>
            <div className="text-[11px] text-slate-300 mt-3 leading-relaxed">{highlightedTrend.explanation}</div>
          </div>
        )}

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-amber-300" />
            <div className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Graphlets (Lakebase)</div>
          </div>
          <div className="space-y-2">
            {graphlets.map(g => (
              <div key={g.id} className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800">
                <div className="flex items-center justify-between">
                  <div className="text-[11px] font-mono text-slate-100">{g.graphlet_id}</div>
                  <div className="text-[10px] text-cyan-300">{Math.round(g.reuse_ratio * 100)}%</div>
                </div>
                <div className="grid grid-cols-3 gap-1 mt-1.5 text-[10px]">
                  <div><span className="text-slate-500">nodes</span> <span className="text-slate-200">{g.node_count}</span></div>
                  <div><span className="text-slate-500">edges</span> <span className="text-slate-200">{g.edge_count}</span></div>
                  <div><span className="text-slate-500">shared</span> <span className="text-slate-200">{g.shared_with_windows}w</span></div>
                </div>
                <div className="h-1 mt-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-emerald-400" style={{ width: `${Math.round(g.reuse_ratio * 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function QueriesTab({ queries, activeQuery, setActiveQuery, selectedQuery }: { queries: Query[]; activeQuery: string | null; setActiveQuery: (k: string) => void; selectedQuery: Query | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Network className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Kleene Queries</h2>
        </div>
        <div className="space-y-2">
          {queries.map(q => {
            const active = q.query_id === activeQuery;
            return (
              <button
                key={q.id}
                onClick={() => setActiveQuery(q.query_id)}
                className={`w-full text-left p-3 rounded-xl border transition ${
                  active ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-sm text-slate-100 font-medium">{q.name}</div>
                  <span className="text-[10px] text-slate-400">{q.query_id}</span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  {q.category.replace('_', ' ')} · {q.min_hops}-{q.max_hops} hops · {Math.round(q.window_seconds / 60)}m
                </div>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {q.mitre_techniques.map(m => (
                    <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{m}</span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="lg:col-span-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Query DSL (YAML)</h2>
          </div>
          <div className="text-[11px] text-slate-500">skip-till-any-match semantics</div>
        </div>
        {selectedQuery ? (
          <pre className="text-xs text-slate-200 bg-slate-950 border border-slate-800 rounded-lg p-4 overflow-x-auto leading-relaxed font-mono">
{selectedQuery.predicate_yaml}
          </pre>
        ) : (
          <div className="text-sm text-slate-500">Select a query</div>
        )}
      </div>
    </div>
  );
}

function TrendsTab({ trendsForQuery, activeTrend, setActiveTrend, queries, activeQuery, setActiveQuery }: { trendsForQuery: TrendComplete[]; activeTrend: TrendComplete | null; setActiveTrend: (t: TrendComplete | null) => void; queries: Query[]; activeQuery: string | null; setActiveQuery: (k: string | null) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setActiveQuery(null)} className={`text-xs px-3 py-1.5 rounded-full border ${!activeQuery ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>All</button>
        {queries.map(q => (
          <button key={q.id} onClick={() => setActiveQuery(q.query_id)} className={`text-xs px-3 py-1.5 rounded-full border ${activeQuery === q.query_id ? 'bg-cyan-500/15 text-cyan-200 border-cyan-500/40' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>{q.name}</button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-2">
        {trendsForQuery.map(t => {
          const expanded = activeTrend?.id === t.id;
          return (
            <div key={t.id} className={`rounded-xl border transition ${expanded ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-800 bg-slate-950/40'}`}>
              <button onClick={() => setActiveTrend(expanded ? null : t)} className="w-full text-left p-3 flex items-center gap-3">
                <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${severityBadge(t.severity)}`}>{t.severity}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-slate-100 font-medium truncate">
                    {t.start_entity} <ChevronRight className="inline w-3 h-3 text-slate-500" /> {t.end_entity}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {t.hops} hops · score {t.score.toFixed(2)} · {new Date(t.detected_at).toLocaleTimeString()}
                  </div>
                </div>
                <span className="text-[10px] text-slate-500">{t.query_id}</span>
              </button>
              {expanded && (
                <div className="px-4 pb-4 pt-1 space-y-3">
                  <div className="text-xs text-slate-300 leading-relaxed">{t.explanation}</div>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {t.path.map((node, idx) => {
                      const rec = node as Record<string, string | number>;
                      return (
                        <div key={idx} className="flex items-center gap-1.5">
                          <div className="px-2 py-1 rounded-md bg-slate-900 border border-slate-700 text-[11px] text-slate-100">
                            <div className="font-mono">{String(rec.n)}</div>
                            <div className="text-[9px] text-slate-500 uppercase tracking-wider">
                              {String(rec.t)}{rec.via ? ` · ${rec.via}` : ''}
                            </div>
                          </div>
                          {idx < t.path.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-cyan-400/60" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {trendsForQuery.length === 0 && <div className="text-sm text-slate-500 italic">No trends in current window.</div>}
      </div>
    </div>
  );
}

function PrdsTab({ prds, activePrd, setActivePrd, selectedPrd }: { prds: PRD[]; activePrd: string | null; setActivePrd: (k: string) => void; selectedPrd: PRD | null }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5 space-y-2">
        <div className="flex items-center gap-2 mb-2">
          <FlaskConical className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">PRDs</h2>
        </div>
        {prds.map(p => {
          const active = p.prd_key === activePrd;
          return (
            <button key={p.id} onClick={() => setActivePrd(p.prd_key)} className={`w-full text-left p-3 rounded-xl border transition ${active ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm text-slate-100 font-medium">{p.title}</div>
                <span className={`text-[10px] uppercase tracking-wider ${riskColor(p.risk)}`}>{p.risk}</span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">Owns: <span className="text-cyan-300/80">{p.owning_feature}</span></div>
              <div className="text-[10px] text-slate-500 mt-0.5">{p.effort_days}d · {p.prd_key}</div>
            </button>
          );
        })}
      </div>

      {selectedPrd && (
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-6 space-y-5">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-slate-50">{selectedPrd.title}</h1>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${riskColor(selectedPrd.risk)} border-current/40 bg-slate-900`}>
                {selectedPrd.risk} risk
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-mono">{selectedPrd.prd_key} · {selectedPrd.effort_days} days · owns: {selectedPrd.owning_feature}</div>
          </div>

          <PrdSection title="Summary" body={selectedPrd.summary} />
          <PrdSection title="Motivation" body={selectedPrd.motivation} />
          <PrdList title="Requirements" items={selectedPrd.requirements} tone="cyan" />
          <PrdList title="Non-goals" items={selectedPrd.non_goals} tone="slate" />
          <PrdList title="Open questions" items={selectedPrd.open_questions} tone="amber" />
          <PrdList title="Acceptance criteria" items={selectedPrd.acceptance} tone="emerald" />
        </div>
      )}
    </div>
  );
}

function PrdSection({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-1">{title}</div>
      <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}

function PrdList({ title, items, tone }: { title: string; items: string[]; tone: 'cyan' | 'slate' | 'amber' | 'emerald' }) {
  const colors = {
    cyan: 'text-cyan-300 bg-cyan-500/5 border-cyan-500/20',
    slate: 'text-slate-300 bg-slate-500/5 border-slate-500/20',
    amber: 'text-amber-300 bg-amber-500/5 border-amber-500/20',
    emerald: 'text-emerald-300 bg-emerald-500/5 border-emerald-500/20',
  } as const;
  if (items.length === 0) return null;
  return (
    <div>
      <div className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-2">{title}</div>
      <div className="space-y-1.5">
        {items.map((it, i) => (
          <div key={i} className={`p-2.5 rounded-lg border text-sm ${colors[tone]}`}>{it}</div>
        ))}
      </div>
    </div>
  );
}

function MissingTab({ missing }: { missing: StillMissing[] }) {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-5">
        <div className="flex items-start gap-3">
          <XCircle className="w-5 h-5 text-rose-300 shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-semibold text-rose-100">The honest list</div>
            <p className="text-xs text-slate-300 mt-1 leading-relaxed">
              Even with Lakebase, custom NFA, and custom Kleene BFS, these gaps remain. They are either structural
              limits of Spark, tradeoffs we chose, or research-grade problems we have not committed to.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {missing.map(m => (
          <div key={m.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="text-sm text-slate-100 font-medium">{m.gap}</div>
              <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                m.severity === 'high' ? 'bg-rose-500/10 text-rose-300 border-rose-500/30' :
                m.severity === 'medium' ? 'bg-amber-500/10 text-amber-300 border-amber-500/30' :
                'bg-slate-700/30 text-slate-300 border-slate-600/30'
              }`}>{m.severity}</span>
            </div>
            <div className="mt-2 text-xs">
              <div className="text-slate-400"><span className="text-rose-300/80 font-medium">Impact:</span> {m.impact}</div>
              <div className="text-slate-400 mt-1"><span className="text-emerald-300/80 font-medium">Mitigation:</span> {m.mitigation}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BenchTab({ benchmarks }: { benchmarks: Benchmark[] }) {
  const maxEps = Math.max(...benchmarks.map(b => b.eps), 1);
  const maxLat = Math.max(...benchmarks.map(b => b.p99_latency_ms), 1);
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-cyan-300" />
          <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Throughput · EPS</h2>
        </div>
        <div className="space-y-3">
          {benchmarks.map(b => (
            <div key={b.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="text-slate-200 font-medium">{b.variant}</div>
                <div className="flex items-center gap-3">
                  <span className="text-cyan-300 font-mono">{b.eps.toLocaleString()} EPS</span>
                  <span className={`text-xs font-mono ${b.speedup_vs_baseline >= 1 ? 'text-emerald-300' : 'text-amber-300'}`}>
                    {b.speedup_vs_baseline}x
                  </span>
                </div>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 via-emerald-400 to-teal-300" style={{ width: `${(b.eps / maxEps) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase mb-4">p99 Latency · ms (lower better)</h2>
        <div className="space-y-3">
          {benchmarks.map(b => (
            <div key={b.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="text-slate-200 font-medium">{b.variant}</div>
                <span className="text-amber-300 font-mono">{b.p99_latency_ms} ms</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-rose-500 to-amber-400" style={{ width: `${(b.p99_latency_ms / maxLat) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {benchmarks.map(b => (
          <div key={b.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <div className="text-xs font-medium text-slate-200 mb-2">{b.variant}</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <Metric label="EPS" value={b.eps.toLocaleString()} />
              <Metric label="p99" value={`${b.p99_latency_ms}ms`} />
              <Metric label="Memory" value={`${b.memory_mb}MB`} />
              <Metric label="Cores" value={b.cpu_cores} />
            </div>
            <div className="mt-2 text-[10px] text-slate-500">vs baseline: <span className="text-emerald-300 font-mono">{b.speedup_vs_baseline}x</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'emerald' | 'amber' | 'cyan' | 'rose' }) {
  const map = {
    emerald: 'from-emerald-500/10 to-emerald-500/0 border-emerald-500/20 text-emerald-200',
    amber: 'from-amber-500/10 to-amber-500/0 border-amber-500/20 text-amber-200',
    cyan: 'from-cyan-500/10 to-cyan-500/0 border-cyan-500/20 text-cyan-200',
    rose: 'from-rose-500/10 to-rose-500/0 border-rose-500/20 text-rose-200',
  } as const;
  return (
    <div className={`rounded-xl border bg-gradient-to-br ${map[tone]} p-3`}>
      <div className="text-[11px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-2xl font-semibold mt-0.5">{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-slate-500">{label}</div>
      <div className="text-slate-100 font-mono">{value}</div>
    </div>
  );
}
