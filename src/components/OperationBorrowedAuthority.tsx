import { useEffect, useMemo, useState } from 'react';
import {
  Activity, GitBranch, Clock, Layers, ShieldAlert, Ban, Network, ShieldX, ToggleLeft, ToggleRight, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { analyze } from '../lib/borrowedAuthority/detector';
import type { ObaAuthorization, ObaEvent } from '../lib/borrowedAuthority/types';
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

export default function OperationBorrowedAuthority() {
  const [events, setEvents] = useState<ObaEvent[]>([]);
  const [auths, setAuths] = useState<ObaAuthorization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>('overview');
  const [includeLate, setIncludeLate] = useState(false);
  const [responseStates, setResponseStates] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [e, a] = await Promise.all([
        supabase.from('oba_events').select('*'),
        supabase.from('oba_authorizations').select('*'),
      ]);
      if (e.error || a.error) {
        setError('Could not load the scenario telemetry.');
      } else if (!e.data?.length) {
        setError('No scenario telemetry found.');
      } else {
        setEvents(e.data as ObaEvent[]);
        setAuths((a.data ?? []) as ObaAuthorization[]);
        setError(null);
      }
      setLoading(false);
    })();
  }, []);

  const analysis = useMemo(
    () => (events.length ? analyze(events, auths, includeLate) : null),
    [events, auths, includeLate],
  );

  const advance = (id: string) =>
    setResponseStates((prev) => ({ ...prev, [id]: Math.min((prev[id] ?? -1) + 1, 4) }));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading fragmented telemetry&hellip;
      </div>
    );
  }
  if (error || !analysis) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-rose-300">
        <ShieldX className="w-5 h-5 mr-2" /> {error ?? 'Scenario unavailable.'}
      </div>
    );
  }

  const attack = analysis.branches.find((b) => b.branch === 'C')!;
  const branchB = analysis.branches.find((b) => b.branch === 'B')!;

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
            <p className="text-[10px] uppercase tracking-wide text-slate-500">Execution C verdict</p>
            <p className={`text-sm font-semibold ${attack.status === 'CONFIRMED_MALICIOUS' ? 'text-rose-300' : 'text-amber-300'}`}>
              {attack.status.replace(/_/g, ' ')}
            </p>
            <p className="text-[10px] text-slate-500">computed live from {events.length} raw events</p>
          </div>
        </div>

        {/* Live evidence-cut control */}
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-slate-700/40 pt-3">
          <button
            onClick={() => setIncludeLate((v) => !v)}
            className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 transition"
          >
            {includeLate ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            {includeLate ? 'Late evidence revealed' : 'Reveal late-arriving evidence'}
          </button>
          <p className="text-[11px] text-slate-400">
            {includeLate
              ? <>Branch B is now <span className="text-emerald-300 font-semibold">{branchB.status.replace(/_/g, ' ')}</span> (late valid authorization arrived). Branch C still <span className="text-rose-300 font-semibold">stands</span> &mdash; the late authorizations don&rsquo;t cover its terminal operations.</>
              : <>{analysis.lateEvidenceCount} authorization record(s) haven&rsquo;t arrived yet. Branch B currently reads as <span className="text-amber-300 font-semibold">{branchB.status.replace(/_/g, ' ')}</span>.</>}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border transition ${
                active ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-slate-700/60 bg-slate-900/40 text-slate-400 hover:text-slate-200'
              }`}
            >
              <t.Icon className="w-3.5 h-3.5" /> {t.label}
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
