import { useCallback, useEffect, useState } from 'react';
import {
  Activity, GitBranch, Clock, Layers, ShieldAlert, Ban, Network, ShieldX, ToggleLeft, ToggleRight,
  Loader2, Play, Shuffle, Server, RefreshCw, Radar, CheckCircle2, AlertTriangle, EyeOff,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { AnalysisResult, CoverageState, RunMeta } from '../lib/borrowedAuthority/types';
import { SCENARIO } from '../lib/borrowedAuthority/scenarioMeta';
import {
  BranchesPanel, ConfluencePanel, DetectorReference, EvidencePanel, MessageNotAuthority,
  OverviewPanel, ResponsePanel, TimelinePanel,
} from './borrowedAuthority/panels';
import { GraphPanel } from './borrowedAuthority/GraphPanel';

type TabKey = 'overview' | 'branches' | 'graph' | 'timeline' | 'evidence' | 'confluence' | 'response';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof Activity }> = [
  { key: 'overview', label: 'Story', Icon: ShieldAlert },
  { key: 'branches', label: 'Three Branches', Icon: GitBranch },
  { key: 'graph', label: 'Security Graph', Icon: Network },
  { key: 'timeline', label: 'Timeline', Icon: Clock },
  { key: 'evidence', label: 'Evidence · FUSE', Icon: Layers },
  { key: 'confluence', label: 'Confluence', Icon: Activity },
  { key: 'response', label: 'Response', Icon: Ban },
];

const COVERAGE_STYLE: Record<CoverageState, string> = {
  operational: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
  partially_observable: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
  not_observable: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
  evaluation_failed: 'text-rose-300 border-rose-500/30 bg-rose-500/10',
};

type RunRow = { run_id: string; created_at: string; label_mode: string; identity_seed: string | null; engine_version: string; primary_status: string | null };

async function fetchLatestRun(mode: 'demo' | 'blind'): Promise<{ meta: RunMeta; pre: AnalysisResult; post: AnalysisResult } | null> {
  const runRes = await supabase
    .from('oba_analysis_runs').select('*').eq('label_mode', mode).order('created_at', { ascending: false }).limit(1);
  const runs = (runRes.data ?? []) as RunRow[];
  if (runRes.error || !runs.length) return null;
  const run = runs[0];
  const snapRes = await supabase.from('oba_analysis_snapshots').select('*').eq('run_id', run.run_id);
  if (snapRes.error) return null;
  const snaps = (snapRes.data ?? []) as Array<{ evidence_cut: string; payload: AnalysisResult }>;
  const pre = snaps.find((s) => s.evidence_cut === 'pre_late')?.payload;
  const post = snaps.find((s) => s.evidence_cut === 'post_late')?.payload;
  if (!pre || !post) return null;
  return {
    meta: {
      run_id: run.run_id, created_at: run.created_at, label_mode: run.label_mode,
      identity_seed: run.identity_seed, engine_version: run.engine_version, primary_status: run.primary_status,
    },
    pre, post,
  };
}

async function triggerEngine(mode: 'demo' | 'blind', seed?: number): Promise<void> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/oba-engine`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, seed }),
  });
  if (!res.ok) throw new Error(`Detection engine returned ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error);
}

export default function OperationBorrowedAuthority() {
  const [meta, setMeta] = useState<RunMeta | null>(null);
  const [pre, setPre] = useState<AnalysisResult | null>(null);
  const [post, setPost] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<null | 'demo' | 'blind'>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [includeLate, setIncludeLate] = useState(false);
  const [responseStates, setResponseStates] = useState<Record<string, number>>({});

  const load = useCallback(async (mode: 'demo' | 'blind', createIfMissing: boolean) => {
    setError(null);
    let run = await fetchLatestRun(mode);
    if (!run && createIfMissing) {
      await triggerEngine(mode);
      run = await fetchLatestRun(mode);
    }
    if (!run) {
      setError('No detection run is available yet.');
      return;
    }
    setMeta(run.meta);
    setPre(run.pre);
    setPost(run.post);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await load('demo', true); }
      catch { setError('Could not reach the detection engine.'); }
      finally { setLoading(false); }
    })();
  }, [load]);

  const run = async (mode: 'demo' | 'blind') => {
    setRunning(mode);
    try {
      await triggerEngine(mode, mode === 'blind' ? Math.floor(Math.random() * 1e9) : undefined);
      await load(mode, false);
      setIncludeLate(false);
    } catch {
      setError('The detection engine run did not complete.');
    } finally {
      setRunning(null);
    }
  };

  const advance = (id: string) =>
    setResponseStates((prev) => ({ ...prev, [id]: Math.min((prev[id] ?? -1) + 1, 4) }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Contacting the detection engine&hellip;
      </div>
    );
  }
  const analysis = includeLate ? post : pre;
  if (error || !analysis || !meta) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-rose-300 gap-3">
        <div className="flex items-center"><ShieldX className="w-5 h-5 mr-2" /> {error ?? 'Scenario unavailable.'}</div>
        <button onClick={() => run('demo')} className="text-[12px] px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20">
          <RefreshCw className="w-3.5 h-3.5 inline mr-1" /> Run the detection engine
        </button>
      </div>
    );
  }

  const attack = analysis.branches.find((b) => b.kind === 'attack');
  const provisional = analysis.branches.find((b) => b.kind === 'provisional');
  const isBlind = meta.label_mode === 'blind';
  const cov = analysis.coverage;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-400" />
              <h1 className="text-lg font-semibold text-slate-100">{SCENARIO.name}</h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-rose-500/30 bg-rose-500/10 text-rose-300">{SCENARIO.category}</span>
            </div>
            <p className="text-[13px] text-slate-400 mt-0.5">{SCENARIO.subtitle}</p>
            <p className="text-[10px] text-slate-500 mt-1 font-mono">{SCENARIO.id} &middot; {SCENARIO.mitreNote}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Primary verdict</p>
            <p className={`text-sm font-semibold ${attack?.status === 'CONFIRMED_MALICIOUS' ? 'text-rose-300' : 'text-amber-300'}`}>
              {(attack?.status ?? 'NONE').replace(/_/g, ' ')}
            </p>
            <p className="text-[10px] text-slate-500 flex items-center gap-1 justify-end">
              <Server className="w-3 h-3" /> engine {meta.engine_version}
            </p>
          </div>
        </div>

        {/* Backend-truth banner */}
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
          <span className="px-2 py-0.5 rounded-full border border-slate-600/50 bg-slate-800/50 text-slate-300 font-mono">
            run {meta.run_id.slice(0, 8)}
          </span>
          <span className={`px-2 py-0.5 rounded-full border ${isBlind ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-200' : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'}`}>
            {isBlind ? `blind · identities randomized (seed ${meta.identity_seed})` : 'demo · real telemetry'}
          </span>
          <span className="text-slate-500">Verdicts are computed by the server-side engine and read from the store — the page does not decide anything.</span>
        </div>

        {isBlind && (
          <div className="mt-3 rounded-xl border border-fuchsia-500/25 bg-fuchsia-500/5 p-3 text-[12px] text-fuchsia-100 flex items-start gap-2">
            <Shuffle className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Blind test: every agent name, execution id, credential and resource was scrambled and NO branch labels were given to the engine.
              It still resolved <span className="font-semibold text-rose-200">{attack?.status.replace(/_/g, ' ')}</span> for the malicious actor
              (<span className="font-mono">{attack?.agent}</span>). The verdict follows behaviour, not names.
            </span>
          </div>
        )}

        {/* Coverage strip (separate from the verdict) */}
        <div className="mt-3 border-t border-slate-700/40 pt-3">
          <div className="flex items-center gap-2 mb-2">
            <Radar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] uppercase tracking-wide text-slate-400">Detection coverage</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${COVERAGE_STYLE[cov.overall]}`}>{cov.overall.replace(/_/g, ' ')}</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {cov.sources.map((sc) => (
              <span key={sc.source_system} title={sc.detail}
                className={`text-[10px] px-2 py-0.5 rounded-md border font-mono ${COVERAGE_STYLE[sc.state]}`}>
                {sc.state === 'operational' ? <CheckCircle2 className="w-3 h-3 inline mr-1" />
                  : sc.state === 'not_observable' ? <EyeOff className="w-3 h-3 inline mr-1" />
                  : <AlertTriangle className="w-3 h-3 inline mr-1" />}
                {sc.source_system}
              </span>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">{cov.note}</p>
        </div>

        {/* Controls */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-700/40 pt-3">
          <button
            onClick={() => setIncludeLate((v) => !v)}
            className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition"
          >
            {includeLate ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {includeLate ? 'Late evidence revealed' : 'Reveal late-arriving evidence'}
          </button>
          <button
            onClick={() => run('demo')} disabled={running !== null}
            className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg border border-slate-600/50 bg-slate-800/50 text-slate-200 hover:bg-slate-700/50 transition disabled:opacity-50"
          >
            {running === 'demo' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Re-run engine
          </button>
          <button
            onClick={() => run('blind')} disabled={running !== null}
            className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-200 hover:bg-fuchsia-500/20 transition disabled:opacity-50"
          >
            {running === 'blind' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shuffle className="w-4 h-4" />} Run blind test
          </button>
          {isBlind && (
            <button onClick={() => { setLoading(true); load('demo', true).finally(() => setLoading(false)); }}
              className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg border border-slate-600/50 bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 transition">
              <RefreshCw className="w-4 h-4" /> Back to demo
            </button>
          )}
          <p className="text-[11px] text-slate-400 basis-full">
            {includeLate
              ? <>{provisional && <>Branch B is now <span className="text-emerald-300 font-semibold">{provisional.status.replace(/_/g, ' ')}</span> (late valid authorization arrived). </>}
                  The attack still <span className="text-rose-300 font-semibold">stands</span> &mdash; the late authorizations don&rsquo;t cover its terminal operations.</>
              : <>{analysis.lateEvidenceCount} authorization record(s) haven&rsquo;t arrived yet. {provisional && <>Branch B currently reads as <span className="text-amber-300 font-semibold">{provisional.status.replace(/_/g, ' ')}</span>.</>}</>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tk) => {
          const active = tab === tk.key;
          return (
            <button
              key={tk.key}
              onClick={() => setTab(tk.key)}
              className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition ${
                active ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              <tk.Icon className="w-3.5 h-3.5" /> {tk.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && <div className="space-y-4"><MessageNotAuthority /><OverviewPanel /><DetectorReference /></div>}
      {tab === 'branches' && <BranchesPanel analysis={analysis} />}
      {tab === 'graph' && <div className="space-y-4"><MessageNotAuthority /><GraphPanel analysis={analysis} /></div>}
      {tab === 'timeline' && <TimelinePanel analysis={analysis} />}
      {tab === 'evidence' && <EvidencePanel analysis={analysis} />}
      {tab === 'confluence' && <ConfluencePanel analysis={analysis} />}
      {tab === 'response' && <ResponsePanel states={responseStates} advance={advance} />}
    </div>
  );
}
