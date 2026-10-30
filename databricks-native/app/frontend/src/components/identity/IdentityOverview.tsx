import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Users, Cpu, Bot, AlertTriangle, GitMerge, RefreshCw, Database, CheckCircle2, CircleDashed, XCircle, Activity, Radio, ArrowRight } from 'lucide-react';
import { identityApi, Overview } from '../../lib/identityApi';
import { Card, PageHeader, Loading, ErrorBanner, Empty, Tag, fmtTime, providerLabel, FINDING_LABEL } from './identityUi';
import { AnimatedNumber, useLiveFeed, useNow } from './identityLive';
import { LiveBadge, LiveEventRow } from './LiveFeed';

const REFRESH_MS = 12000;

interface Props {
  onNavigate: (view: string) => void;
}

const TYPE_META = {
  person: { label: 'People', icon: Users, tone: 'text-blue-300' },
  workload: { label: 'Workloads & services', icon: Cpu, tone: 'text-teal-300' },
  agent: { label: 'AI agents', icon: Bot, tone: 'text-amber-300' },
} as const;

export default function IdentityOverview({ onNavigate }: Props) {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');

  const load = useCallback(() => {
    setError('');
    identityApi.overview().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    const t = setInterval(() => {
      identityApi.overview().then(setData).catch(() => undefined);
    }, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const live = useLiveFeed();
  const now = useNow(4000);

  const runResolver = async () => {
    setRunning(true);
    setRunMsg('');
    try {
      await identityApi.runResolver();
      setRunMsg('Resolver started. New results appear here when the run finishes.');
    } catch (e) {
      setRunMsg((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const totalAccounts = data?.by_type.reduce((s, t) => s + Number(t.accounts || 0), 0) ?? 0;
  const conflicts = data?.by_type.reduce((s, t) => s + Number(t.state_conflicts || 0), 0) ?? 0;

  return (
    <div className="identity-page">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Fingerprint}
          title="Identity Overview"
          subtitle="One canonical view of every person, workload and agent across your directories. Accounts are linked only when the evidence is strong; anything ambiguous waits for a reviewer."
          actions={
            <div className="flex flex-col items-end gap-1">
              <button
                onClick={runResolver}
                disabled={running}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-60 text-white text-sm font-medium transition-colors"
              >
                <RefreshCw size={14} className={running ? 'animate-spin' : ''} /> Run resolver now
              </button>
              {runMsg && <span className="text-xs text-slate-400 max-w-xs text-right">{runMsg}</span>}
            </div>
          }
        />

        {error && <ErrorBanner message={error} onRetry={load} />}
        {!error && !data && <Loading label="Loading identity overview" />}

        {data && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {(['person', 'workload', 'agent'] as const).map((t) => {
                const row = data.by_type.find((r) => r.principal_type === t);
                const M = TYPE_META[t];
                return (
                  <Card key={t} className="p-5 hover:border-slate-600 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wider text-slate-500">{M.label}</span>
                      <M.icon size={16} className={M.tone} />
                    </div>
                    <div className="text-3xl font-semibold text-slate-100 mt-3"><AnimatedNumber value={Number(row?.identities || 0)} /></div>
                    <div className="text-xs text-slate-500 mt-1"><AnimatedNumber value={Number(row?.accounts || 0)} /> source accounts</div>
                  </Card>
                );
              })}
              <Card className="p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-slate-500">Linked accounts</span>
                  <Database size={16} className="text-slate-400" />
                </div>
                <div className="text-3xl font-semibold text-slate-100 mt-3"><AnimatedNumber value={totalAccounts} /></div>
                <div className="text-xs text-slate-500 mt-1">
                  {data.resolution ? `Resolution ${data.resolution.resolution_version}` : 'Not resolved yet'}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-5 overflow-hidden">
                <div className="absolute -right-10 -top-10 w-36 h-36 rounded-full bg-teal-400/10 blur-2xl pointer-events-none" />
                <div className="relative flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-slate-500">Events processed · 24h</span>
                  <Activity size={16} className="text-teal-300" />
                </div>
                <div className="relative text-3xl font-semibold text-slate-100 mt-3">
                  {live.meta ? <AnimatedNumber value={live.meta.events_24h} /> : <span className="text-slate-600">—</span>}
                </div>
                <div className="relative flex items-center gap-2 mt-2">
                  <LiveBadge mode={live.meta?.mode} />
                  <span className="text-xs text-slate-500">Sign-ins, MFA, access changes and HR moves</span>
                </div>
              </Card>
              <Card className="lg:col-span-2 overflow-hidden flex flex-col">
                <div className="px-5 py-3.5 border-b border-slate-700/50 flex items-center gap-2">
                  <Radio size={14} className="text-teal-300" />
                  <span className="text-sm font-medium text-slate-200">Happening now</span>
                  <button onClick={() => onNavigate('id_graph')}
                    className="ml-auto inline-flex items-center gap-1 text-xs text-teal-300 hover:text-teal-200 transition-colors group">
                    Watch it on the access map <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
                  </button>
                </div>
                <div className="px-2 py-1.5 space-y-0.5 h-[196px] overflow-hidden">
                  {live.error && !live.events.length ? (
                    <div className="px-3 py-8 text-center text-xs text-red-300">{live.error}</div>
                  ) : !live.meta ? (
                    <div className="space-y-2 p-2">{[0, 1, 2].map((i) => <div key={i} className="id-skeleton h-11 rounded-xl" />)}</div>
                  ) : live.events.length === 0 ? (
                    <div className="px-3 py-8 text-center text-xs text-slate-500">No identity activity yet.</div>
                  ) : live.events.slice(0, 4).map((e) => (
                    <LiveEventRow key={e.event_id} e={e} now={now} isNew={live.freshIds.has(e.event_id)} compact />
                  ))}
                </div>
              </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <button onClick={() => onNavigate('id_review')} className="text-left">
                <Card className="p-5 h-full hover:border-teal-500/50 transition-colors group">
                  <div className="flex items-center gap-2 text-sm text-slate-300"><GitMerge size={16} className="text-teal-300" /> Matches waiting for review</div>
                  <div className="text-3xl font-semibold text-slate-100 mt-3"><AnimatedNumber value={Number(data.open_reviews) || 0} /></div>
                  <div className="text-xs text-slate-500 mt-1 group-hover:text-teal-300 transition-colors">Open Resolution Review</div>
                </Card>
              </button>
              <button onClick={() => onNavigate('id_explorer')} className="text-left">
                <Card className="p-5 h-full hover:border-amber-500/50 transition-colors group">
                  <div className="flex items-center gap-2 text-sm text-slate-300"><AlertTriangle size={16} className="text-amber-300" /> Identities with conflicting states</div>
                  <div className="text-3xl font-semibold text-slate-100 mt-3"><AnimatedNumber value={conflicts} /></div>
                  <div className="text-xs text-slate-500 mt-1 group-hover:text-amber-300 transition-colors">Disabled in one directory, active in another</div>
                </Card>
              </button>
              <Card className="p-5">
                <div className="text-sm text-slate-300 mb-3">Open identity findings</div>
                {data.findings.length === 0 ? (
                  <div className="text-xs text-slate-500">No open findings.</div>
                ) : (
                  <ul className="space-y-2">
                    {data.findings.map((f) => (
                      <li key={f.finding_type} className="flex items-center justify-between text-sm">
                        <span className="text-slate-400">{FINDING_LABEL[f.finding_type] || f.finding_type}</span>
                        <span className="font-mono text-slate-200"><AnimatedNumber value={Number(f.cnt) || 0} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            <Card>
              <div className="px-5 py-4 border-b border-slate-700/50 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-slate-200">Source health</div>
                  <div className="text-xs text-slate-500 mt-0.5">An incomplete snapshot marks missing accounts as stale, never as deleted.</div>
                </div>
                {data.resolution && <span className="text-xs text-slate-500">Last resolved {fmtTime(data.resolution.resolved_at)}</span>}
              </div>
              {data.sources.length === 0 ? (
                <Empty title="No identity sources yet" hint="Drop provider snapshots into the identity landing folder, then run the resolver." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-slate-500 uppercase tracking-wider">
                      <tr className="text-left">
                        <th className="px-5 py-3 font-medium">Source</th>
                        <th className="px-5 py-3 font-medium">Status</th>
                        <th className="px-5 py-3 font-medium text-right">Received</th>
                        <th className="px-5 py-3 font-medium text-right">Accepted</th>
                        <th className="px-5 py-3 font-medium text-right">Quarantined</th>
                        <th className="px-5 py-3 font-medium text-right">Stale / removed</th>
                        <th className="px-5 py-3 font-medium">Snapshot</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {data.sources.map((s) => (
                        <tr key={`${s.provider}-${s.tenant}`} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-3">
                            <div className="text-slate-200">{providerLabel(s.provider)}</div>
                            <div className="text-xs text-slate-500 font-mono">{s.tenant}</div>
                          </td>
                          <td className="px-5 py-3">
                            {s.status === 'healthy' ? <Tag tone="green"><CheckCircle2 size={11} /> Complete</Tag>
                              : s.status === 'incomplete' ? <Tag tone="amber"><CircleDashed size={11} /> Incomplete</Tag>
                              : <Tag tone="red"><XCircle size={11} /> {s.error_category || 'Failed'}</Tag>}
                          </td>
                          <td className="px-5 py-3 text-right font-mono">{s.records_received == null ? '—' : <AnimatedNumber value={Number(s.records_received)} />}</td>
                          <td className="px-5 py-3 text-right font-mono">{s.records_accepted == null ? '—' : <AnimatedNumber value={Number(s.records_accepted)} />}</td>
                          <td className={`px-5 py-3 text-right font-mono ${Number(s.records_quarantined) > 0 ? 'text-red-300' : ''}`}>{s.records_quarantined ?? '—'}</td>
                          <td className="px-5 py-3 text-right font-mono">{s.stale ?? 0} / {s.tombstoned ?? 0}</td>
                          <td className="px-5 py-3 text-xs text-slate-400">{fmtTime(s.snapshot_at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
