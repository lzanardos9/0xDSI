import { useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';

type Feasibility = {
  id: string;
  capability: string;
  databricks_native: string;
  notes: string;
  risk: string;
  sort_order: number;
};

type Phase = {
  id: string;
  phase_key: string;
  name: string;
  days: number;
  status: string;
  deliverables: string[];
  acceptance: string;
  sort_order: number;
};

type Query = {
  id: string;
  query_id: string;
  name: string;
  category: string;
  semantics: string;
  window_seconds: number;
  min_hops: number;
  max_hops: number;
  predicate_yaml: string;
  mitre_techniques: string[];
  enabled: boolean;
};

type TrendComplete = {
  id: string;
  query_id: string;
  trend_key: string;
  start_entity: string;
  end_entity: string;
  hops: number;
  path: Array<Record<string, unknown>>;
  severity: string;
  score: number;
  detected_at: string;
  explanation: string;
};

type Graphlet = {
  id: string;
  graphlet_id: string;
  window_start: string;
  window_end: string;
  node_count: number;
  edge_count: number;
  shared_with_windows: number;
  reuse_ratio: number;
  memory_kb: number;
};

const nativeBadge = (val: string) => {
  if (val === 'yes') return { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', label: 'Native', Icon: CheckCircle2 };
  if (val === 'partial') return { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', label: 'Partial', Icon: AlertTriangle };
  if (val === 'yes-caveats') return { cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30', label: 'Native w/ caveats', Icon: AlertTriangle };
  return { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', label: 'Not native', Icon: XCircle };
};

const riskColor = (r: string) => {
  if (r === 'low') return 'text-emerald-300';
  if (r === 'medium') return 'text-amber-300';
  return 'text-rose-300';
};

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

export default function TrendEngineCET() {
  const [feasibility, setFeasibility] = useState<Feasibility[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [queries, setQueries] = useState<Query[]>([]);
  const [trends, setTrends] = useState<TrendComplete[]>([]);
  const [graphlets, setGraphlets] = useState<Graphlet[]>([]);
  const [activeQuery, setActiveQuery] = useState<string | null>(null);
  const [activeTrend, setActiveTrend] = useState<TrendComplete | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [f, p, q, t, g] = await Promise.all([
        supabase.from('trend_feasibility').select('*').order('sort_order'),
        supabase.from('trend_phases').select('*').order('sort_order'),
        supabase.from('trend_queries').select('*').order('query_id'),
        supabase.from('trend_complete').select('*').order('detected_at', { ascending: false }),
        supabase.from('trend_graphlets').select('*').order('window_start', { ascending: false }),
      ]);
      setFeasibility(f.data ?? []);
      setPhases(p.data ?? []);
      setQueries(q.data ?? []);
      setTrends((t.data ?? []) as TrendComplete[]);
      setGraphlets(g.data ?? []);
      if (q.data && q.data.length > 0) setActiveQuery(q.data[0].query_id);
      setLoading(false);
    })();
  }, []);

  const selectedQuery = useMemo(
    () => queries.find(q => q.query_id === activeQuery) ?? null,
    [queries, activeQuery]
  );

  const trendsForQuery = useMemo(
    () => trends.filter(t => !activeQuery || t.query_id === activeQuery),
    [trends, activeQuery]
  );

  const headline = useMemo(() => {
    const nat = feasibility.filter(f => f.databricks_native === 'yes').length;
    const part = feasibility.filter(f => f.databricks_native === 'partial').length;
    const caveat = feasibility.filter(f => f.databricks_native === 'yes-caveats').length;
    const no = feasibility.filter(f => f.databricks_native === 'no').length;
    const total = feasibility.length || 1;
    const coverage = Math.round(((nat + part * 0.6 + caveat * 0.8) / total) * 100);
    return { nat, part, caveat, no, total, coverage };
  }, [feasibility]);

  if (loading) {
    return (
      <div className="p-8 text-slate-400 flex items-center gap-3">
        <Activity className="w-5 h-5 animate-pulse text-cyan-400" />
        Loading CET Trend Engine blueprint...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-900 to-cyan-950/40 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30">
              <GitBranch className="w-7 h-7 text-cyan-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold text-slate-50">0xDSI Complete Trend Engine</h1>
                <span className="text-[11px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  MVP proposal
                </span>
              </div>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl leading-relaxed">
                Kleene-closure complete event trend detection over sliding windows with skip-till-any-match
                semantics. Based on Poppe et al. SIGMOD 2017 (H-CET). Honest Databricks feasibility below.
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
            <span>Estimated Databricks-native coverage</span>
            <span className="text-slate-200 font-medium">{headline.coverage}%</span>
          </div>
          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
              style={{ width: `${headline.coverage}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            Reading: ~70% of the spec runs on pure Databricks (Spark Structured Streaming + Delta + RocksDB state).
            ~20% is application code Spark does not ship (skip-till-any-match matcher, graphlet sharing across windows,
            B&B partitioner). ~10% (deep-fanout Kleene &gt;7 hops) may need an external graph tier or a depth cap.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-300" />
              <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
                Feasibility matrix
              </h2>
            </div>
            <span className="text-xs text-slate-500">Databricks stack vs CET paper scope</span>
          </div>
          <div className="space-y-2">
            {feasibility.map(f => {
              const b = nativeBadge(f.databricks_native);
              return (
                <div
                  key={f.id}
                  className="flex items-start gap-3 p-3 rounded-xl border border-slate-800 bg-slate-950/40 hover:border-slate-700 transition"
                >
                  <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-[11px] font-medium ${b.cls}`}>
                    <b.Icon className="w-3.5 h-3.5" />
                    {b.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm text-slate-100 font-medium truncate">{f.capability}</div>
                      <div className={`text-[11px] uppercase tracking-wider ${riskColor(f.risk)}`}>
                        {f.risk} risk
                      </div>
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
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
              MVP phase plan
            </h2>
          </div>
          <div className="space-y-3">
            {phases.map((p, idx) => (
              <div key={p.id} className="relative pl-7">
                <div
                  className={`absolute left-0 top-1.5 w-5 h-5 rounded-full border-2 ${
                    p.status === 'in_progress'
                      ? 'border-cyan-400 bg-cyan-500/30'
                      : p.status === 'completed'
                      ? 'border-emerald-400 bg-emerald-500/30'
                      : 'border-slate-600 bg-slate-800'
                  } flex items-center justify-center`}
                >
                  <span className="text-[10px] font-bold text-slate-100">{idx}</span>
                </div>
                {idx < phases.length - 1 && (
                  <div className="absolute left-[9px] top-7 bottom-[-12px] w-px bg-slate-700" />
                )}
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm text-slate-100 font-medium">{p.name}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider ${phaseStatusBadge(p.status)}`}>
                    {p.status.replace('_', ' ')}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  {p.days} day{p.days > 1 ? 's' : ''}
                </div>
                <ul className="text-xs text-slate-300 mt-1.5 space-y-0.5">
                  {p.deliverables.map((d, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <ChevronRight className="w-3 h-3 mt-0.5 text-slate-500 shrink-0" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
                <div className="text-[11px] text-cyan-300/80 mt-1.5 italic">Accept: {p.acceptance}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-4 h-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Kleene queries</h2>
          </div>
          <div className="space-y-2">
            {queries.map(q => {
              const active = q.query_id === activeQuery;
              return (
                <button
                  key={q.id}
                  onClick={() => setActiveQuery(q.query_id)}
                  className={`w-full text-left p-3 rounded-xl border transition ${
                    active
                      ? 'border-cyan-500/50 bg-cyan-500/10'
                      : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-slate-100 font-medium">{q.name}</div>
                    <span className="text-[10px] text-slate-400">{q.query_id}</span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {q.category.replace('_', ' ')} · {q.min_hops}-{q.max_hops} hops · {Math.round(q.window_seconds / 60)}m window
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {q.mitre_techniques.map(m => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {m}
                      </span>
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
              <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
                Query DSL (YAML)
              </h2>
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
          <div className="grid grid-cols-3 gap-3 mt-4">
            <Mini label="Window" value={`${Math.round((selectedQuery?.window_seconds ?? 0) / 60)} min`} icon={Clock} />
            <Mini label="Min hops" value={selectedQuery?.min_hops ?? 0} icon={GitBranch} />
            <Mini label="Max hops" value={selectedQuery?.max_hops ?? 0} icon={GitBranch} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-rose-300" />
              <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
                Detected complete trends
              </h2>
            </div>
            <div className="text-[11px] text-slate-500">{trendsForQuery.length} trends</div>
          </div>
          <div className="space-y-2">
            {trendsForQuery.map(t => {
              const expanded = activeTrend?.id === t.id;
              return (
                <div
                  key={t.id}
                  className={`rounded-xl border transition ${
                    expanded ? 'border-cyan-500/50 bg-cyan-500/5' : 'border-slate-800 bg-slate-950/40'
                  }`}
                >
                  <button
                    onClick={() => setActiveTrend(expanded ? null : t)}
                    className="w-full text-left p-3 flex items-center gap-3"
                  >
                    <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border ${severityBadge(t.severity)}`}>
                      {t.severity}
                    </span>
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
                                  {String(rec.t)}
                                  {rec.via ? ` · ${rec.via}` : ''}
                                </div>
                              </div>
                              {idx < t.path.length - 1 && (
                                <ChevronRight className="w-3.5 h-3.5 text-cyan-400/60" />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {trendsForQuery.length === 0 && (
              <div className="text-sm text-slate-500 italic">No trends for this query in current window.</div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">
              Graphlet reuse (sliding)
            </h2>
          </div>
          <div className="space-y-2">
            {graphlets.map(g => (
              <div key={g.id} className="p-3 rounded-xl border border-slate-800 bg-slate-950/40">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-mono text-slate-100">{g.graphlet_id}</div>
                  <div className="text-[10px] text-slate-500">
                    {new Date(g.window_start).toLocaleTimeString()}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-2 text-[11px]">
                  <div>
                    <div className="text-slate-500">Nodes</div>
                    <div className="text-slate-100">{g.node_count}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Edges</div>
                    <div className="text-slate-100">{g.edge_count}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Shared</div>
                    <div className="text-slate-100">{g.shared_with_windows} wins</div>
                  </div>
                </div>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-0.5">
                    <span>Reuse ratio</span>
                    <span className="text-cyan-300">{Math.round(g.reuse_ratio * 100)}%</span>
                  </div>
                  <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400"
                      style={{ width: `${Math.round(g.reuse_ratio * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 mt-1.5">Memory: {g.memory_kb} KB</div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-200 leading-relaxed">
            Graphlet sharing is the paper's core win (10-42x). Spark has no primitive for this. We implement over
            RocksDB state store keyed by window_id. Gate: Phase 3 must show &gt;=3x throughput vs T-CET baseline.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5">
        <h2 className="text-sm font-semibold text-slate-100 tracking-wide uppercase mb-3">
          What Databricks does NOT ship (honest list)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-rose-300 font-medium mb-1">Skip-till-any-match CEP</div>
            Flink has it via the CEP library with <span className="font-mono">oneOrMore().greedy()</span>. Spark does
            not. We write the matcher.
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-rose-300 font-medium mb-1">Kleene paths in GraphFrames</div>
            <span className="font-mono">find()</span> is fixed-length motif only. Use{' '}
            <span className="font-mono">AggregateMessages</span> (Pregel) or a custom BFS over state.
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-rose-300 font-medium mb-1">Branch-and-bound partitioner</div>
            Paper §5 optimizer. Pure app code. Deferred until after Phase 5 evaluation gate.
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-amber-300 font-medium mb-1">Deep fanout &gt;7 hops</div>
            RocksDB state store thrashes. Either cap depth or tier hot windows into Neo4j/TigerGraph.
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-amber-300 font-medium mb-1">100K EPS stateful ops</div>
            Native but needs RocksDB state store + changelog checkpointing + tuned executors.
          </div>
          <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800">
            <div className="text-emerald-300 font-medium mb-1">Everything else</div>
            Auto Loader, Delta MERGE, watermarks, Mosaic AI Vector Search auto-sync, Model Serving, MLflow. All native.
          </div>
        </div>
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

function Mini({ label, value, icon: Icon }: { label: string; value: string | number; icon: typeof Clock }) {
  return (
    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-sm text-slate-100 font-medium mt-1">{value}</div>
    </div>
  );
}
