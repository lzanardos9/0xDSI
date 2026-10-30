import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Cpu, UserX, KeyRound, Link2Off, ShieldQuestion } from 'lucide-react';
import { identityApi, NonHuman } from '../../lib/identityApi';
import { Card, PageHeader, Loading, ErrorBanner, Empty, StatePill, Tag, fmtTime, providerLabel } from './identityUi';

type Filter = 'all' | 'orphan' | 'unlinked' | 'expired' | 'unverified';

const isOrphan = (n: NonHuman) => !n.owner;
const isUnlinked = (n: NonHuman) => !n.grc_application_id;
const isUnverified = (n: NonHuman) => n.principal_type === 'agent' && n.registration_source !== 'authoritative';

export default function NonHumanIdentities() {
  const [rows, setRows] = useState<NonHuman[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    setError('');
    identityApi.nhi().then((r) => setRows(r.nhis)).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const counts = useMemo(() => {
    const r = rows || [];
    return {
      all: r.length,
      orphan: r.filter(isOrphan).length,
      unlinked: r.filter(isUnlinked).length,
      expired: r.filter((n) => n.credential_expired).length,
      unverified: r.filter(isUnverified).length,
    };
  }, [rows]);

  const visible = (rows || []).filter((n) =>
    filter === 'all' ? true
      : filter === 'orphan' ? isOrphan(n)
      : filter === 'unlinked' ? isUnlinked(n)
      : filter === 'expired' ? n.credential_expired
      : isUnverified(n));

  const FILTERS: { id: Filter; label: string; icon: typeof Bot; tone: string }[] = [
    { id: 'all', label: 'All non-human', icon: Cpu, tone: 'text-teal-300' },
    { id: 'orphan', label: 'No owner', icon: UserX, tone: 'text-red-300' },
    { id: 'unlinked', label: 'No GRC application', icon: Link2Off, tone: 'text-amber-300' },
    { id: 'expired', label: 'Expired credential', icon: KeyRound, tone: 'text-orange-300' },
    { id: 'unverified', label: 'Unverified agents', icon: ShieldQuestion, tone: 'text-sky-300' },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Bot}
          title="Non-Human & Agent Identities"
          subtitle="Service accounts, API clients and AI agents. Each should have an accountable owner, a link to a governed application, and a current credential. Agents discovered outside the registry stay unverified."
        />

        {error && <ErrorBanner message={error} onRetry={load} />}
        {!error && rows === null && <Loading />}

        {rows && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {FILTERS.map((f) => (
                <button key={f.id} onClick={() => setFilter(f.id)} className="text-left">
                  <Card className={`p-4 transition-colors ${filter === f.id ? 'border-teal-500/60 bg-teal-500/5' : 'hover:border-slate-600'}`}>
                    <f.icon size={16} className={f.tone} />
                    <div className="text-2xl font-semibold text-slate-100 mt-2">{counts[f.id]}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{f.label}</div>
                  </Card>
                </button>
              ))}
            </div>

            {visible.length === 0 ? (
              <Card><Empty title="Nothing in this view" hint="No non-human identities match this filter." /></Card>
            ) : (
              <Card className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-slate-500 uppercase tracking-wider">
                    <tr className="text-left">
                      <th className="px-5 py-3 font-medium">Identity</th>
                      <th className="px-5 py-3 font-medium">Source</th>
                      <th className="px-5 py-3 font-medium">State</th>
                      <th className="px-5 py-3 font-medium">Owner</th>
                      <th className="px-5 py-3 font-medium">GRC application</th>
                      <th className="px-5 py-3 font-medium">Credential</th>
                      <th className="px-5 py-3 font-medium">Runtime</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {visible.map((n) => (
                      <tr key={n.account_key} className="hover:bg-slate-800/30 transition-colors">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            {n.principal_type === 'agent' ? <Bot size={14} className="text-amber-300" /> : <Cpu size={14} className="text-teal-300" />}
                            <span className="text-slate-100">{n.display_name || n.username}</span>
                          </div>
                          {isUnverified(n) && <div className="mt-1"><Tag tone="amber">Discovered, unverified</Tag></div>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-400">{providerLabel(n.provider)}<div className="text-slate-500">{n.tenant}</div></td>
                        <td className="px-5 py-3"><StatePill state={n.normalized_state} /></td>
                        <td className="px-5 py-3">{n.owner ? <span className="text-slate-300 text-xs">{n.owner}</span> : <Tag tone="red">No owner</Tag>}</td>
                        <td className="px-5 py-3">{n.grc_application_id ? <span className="text-slate-300 font-mono text-xs">{n.grc_application_id}</span> : <Tag tone="amber">Not linked</Tag>}</td>
                        <td className="px-5 py-3 text-xs">
                          {n.credential_fingerprint ? (
                            <>
                              <div className="font-mono text-slate-400">{n.credential_fingerprint}</div>
                              <div className={n.credential_expired ? 'text-red-300' : 'text-slate-500'}>
                                {n.credential_expired ? 'Expired ' : 'Expires '}{fmtTime(n.credential_expires_at)}
                              </div>
                            </>
                          ) : <span className="text-slate-500">—</span>}
                        </td>
                        <td className="px-5 py-3 text-xs text-slate-400 font-mono">{n.runtime_host || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
