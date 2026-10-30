import { useCallback, useEffect, useState } from 'react';
import { Search, Users, X, AlertTriangle, ChevronLeft, ChevronRight, Link2, History, KeyRound } from 'lucide-react';
import { identityApi, IdentityDetail, IdentitySummary } from '../../lib/identityApi';
import { Card, PageHeader, Loading, ErrorBanner, Empty, StatePill, Tag, fmtTime, providerLabel, FINDING_LABEL } from './identityUi';

const PAGE = 25;
const PERSONA_LABEL: Record<string, string> = {
  standard: 'Standard', privileged: 'Privileged', contractor: 'Contractor', guest: 'Guest', workload: 'Workload', agent: 'Agent',
};

export default function IdentityExplorer() {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [ptype, setPtype] = useState('');
  const [conflictsOnly, setConflictsOnly] = useState(false);
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<IdentitySummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setTerm(search); setOffset(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(() => {
    setError('');
    setRows(null);
    identityApi
      .identities({ search: term, principal_type: ptype, conflicts_only: conflictsOnly, limit: PAGE, offset })
      .then((r) => { setRows(r.identities); setTotal(r.total); })
      .catch((e: Error) => setError(e.message));
  }, [term, ptype, conflictsOnly, offset]);

  useEffect(load, [load]);

  return (
    <div className="identity-page">
      <div className="max-w-7xl mx-auto">
        <PageHeader
          icon={Users}
          title="Identity Explorer"
          subtitle="Find any identity by name, username, email, employee ID or provider object ID, and see every linked account, persona and finding."
        />

        <Card className="p-4 mb-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center flex-1 min-w-[240px] bg-[#0A1628] border border-slate-700 rounded-lg px-3 py-2 focus-within:border-teal-500 transition-colors">
            <Search size={16} className="text-slate-500 mr-2" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search identities"
              className="bg-transparent flex-1 outline-none text-sm placeholder-slate-500"
            />
          </div>
          <div className="flex rounded-lg border border-slate-700 overflow-hidden text-sm">
            {[['', 'All'], ['person', 'People'], ['workload', 'Workloads'], ['agent', 'Agents']].map(([v, l]) => (
              <button
                key={v}
                onClick={() => { setPtype(v); setOffset(0); }}
                className={`px-3 py-2 transition-colors ${ptype === v ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-400 cursor-pointer select-none">
            <input type="checkbox" checked={conflictsOnly} onChange={(e) => { setConflictsOnly(e.target.checked); setOffset(0); }} className="accent-teal-500" />
            Conflicting states only
          </label>
        </Card>

        {error && <ErrorBanner message={error} onRetry={load} />}
        {!error && rows === null && <Loading />}
        {rows && rows.length === 0 && (
          <Card><Empty title="No identities match" hint="Try a different search, or run the resolver from Identity Overview if no sources have been loaded yet." /></Card>
        )}
        {rows && rows.length > 0 && (
          <Card className="overflow-hidden">
            <div className="divide-y divide-slate-800">
              {rows.map((r) => (
                <button
                  key={r.canonical_id}
                  onClick={() => setSelected(r.canonical_id)}
                  className="w-full text-left px-5 py-4 flex flex-wrap items-center gap-4 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-100 font-medium">{r.display_name || 'Unnamed identity'}</span>
                      {r.state_conflict && <Tag tone="amber"><AlertTriangle size={11} /> State conflict</Tag>}
                    </div>
                    <div className="text-xs text-slate-500 font-mono mt-0.5">{r.canonical_id}</div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {r.personas.map((p) => <Tag key={p} tone={p === 'privileged' ? 'red' : p === 'guest' ? 'amber' : 'blue'}>{PERSONA_LABEL[p] || p}</Tag>)}
                  </div>
                  <div className="text-xs text-slate-400 w-48">{r.providers.map(providerLabel).join(', ')}</div>
                  <div className="flex gap-1">{r.normalized_states.map((s) => <StatePill key={s} state={s} />)}</div>
                  <div className="text-xs text-slate-500 w-20 text-right">{r.account_count} accounts</div>
                </button>
              ))}
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-800 text-xs text-slate-500">
              <span>{offset + 1}–{offset + rows.length} of {total}</span>
              <div className="flex gap-2">
                <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))} className="p-1.5 rounded border border-slate-700 disabled:opacity-40 hover:bg-slate-800"><ChevronLeft size={14} /></button>
                <button disabled={offset + PAGE >= total} onClick={() => setOffset(offset + PAGE)} className="p-1.5 rounded border border-slate-700 disabled:opacity-40 hover:bg-slate-800"><ChevronRight size={14} /></button>
              </div>
            </div>
          </Card>
        )}
      </div>
      {selected && <IdentityDrawer id={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function IdentityDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<IdentityDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setError('');
    identityApi.detail(id).then(setData).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl h-full overflow-y-auto bg-[#0B1730] border-l border-slate-700 shadow-2xl">
        <div className="sticky top-0 bg-[#0B1730]/95 backdrop-blur px-6 py-4 border-b border-slate-800 flex items-start justify-between">
          <div>
            <div className="text-lg font-semibold text-slate-100">{data?.identity.display_name || 'Identity'}</div>
            <div className="text-xs text-slate-500 font-mono mt-0.5">{id}</div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-6">
          {error && <ErrorBanner message={error} />}
          {!error && !data && <Loading />}
          {data && (
            <>
              <div className="flex flex-wrap gap-2 text-xs">
                <Tag tone="teal">{data.identity.principal_type}</Tag>
                <Tag>Resolution {data.identity.resolution_version}</Tag>
                <Tag>First resolved {fmtTime(data.identity.first_resolved_at)}</Tag>
                {data.identity.state_conflict && <Tag tone="amber"><AlertTriangle size={11} /> Conflicting states</Tag>}
              </div>

              {data.findings.filter((f) => f.status === 'open').length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-slate-300 mb-2">Open findings</h3>
                  <div className="space-y-2">
                    {data.findings.filter((f) => f.status === 'open').map((f) => (
                      <div key={f.finding_id} className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
                        <div className="text-amber-200">{FINDING_LABEL[f.finding_type] || f.finding_type}</div>
                        <div className="text-slate-400 text-xs mt-0.5">{f.detail}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {data.personas.map((p) => (
                <section key={p.persona_id}>
                  <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                    <KeyRound size={14} className="text-teal-300" /> {PERSONA_LABEL[p.persona_type] || p.persona_type} persona
                    <span className="text-xs text-slate-500 font-normal">({p.account_count} accounts, entitlements kept separate)</span>
                  </h3>
                  <div className="space-y-2">
                    {data.accounts.filter((a) => a.persona_id === p.persona_id).map((a) => (
                      <Card key={a.account_key} className="p-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-slate-200 text-sm">{providerLabel(a.provider)} <span className="text-slate-500">· {a.tenant}</span></div>
                          <div className="flex items-center gap-2">
                            {a.source_status !== 'current' && <Tag tone="amber">{a.source_status}</Tag>}
                            <StatePill state={a.normalized_state} />
                          </div>
                        </div>
                        <dl className="grid grid-cols-2 gap-x-6 gap-y-1 mt-3 text-xs">
                          {[
                            ['Username', a.username], ['UPN / email', a.upn || a.email], ['Employee ID', a.employee_id],
                            ['Provider object ID', a.provider_object_id], ['Provider state', `${a.provider_state || '—'} (${a.state_mapping_version})`],
                            ['Owner', a.owner], ['GRC application', a.grc_application_id], ['Runtime host', a.runtime_host],
                            ['Credential', a.credential_fingerprint && `${a.credential_fingerprint} · expires ${fmtTime(a.credential_expires_at)}`],
                          ].filter(([, v]) => v).map(([k, v]) => (
                            <div key={k as string} className="flex gap-2 min-w-0"><dt className="text-slate-500 w-32 flex-shrink-0">{k}</dt><dd className="text-slate-300 font-mono truncate">{v}</dd></div>
                          ))}
                        </dl>
                      </Card>
                    ))}
                  </div>
                </section>
              ))}

              {data.relations.length > 0 && (
                <section>
                  <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2"><Link2 size={14} className="text-teal-300" /> Ownership and relations</h3>
                  <div className="flex flex-wrap gap-2">
                    {data.relations.map((r) => (
                      <Tag key={`${r.relation_type}-${r.target_id}`} tone={r.verification === 'verified' ? 'green' : 'amber'}>
                        {r.relation_type.replace(/_/g, ' ')}: {r.target_id} ({r.verification})
                      </Tag>
                    ))}
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-sm font-medium text-slate-300 mb-2 flex items-center gap-2"><History size={14} className="text-teal-300" /> Why these accounts are linked</h3>
                {data.decisions.length === 0 ? (
                  <div className="text-xs text-slate-500">Single-account identity; no match decisions.</div>
                ) : (
                  <div className="space-y-1.5">
                    {data.decisions.map((d) => (
                      <div key={d.decision_id} className="flex flex-wrap items-center gap-2 text-xs">
                        <Tag tone={d.verdict === 'ACCEPTED' ? 'green' : d.verdict === 'REVIEW_REQUIRED' ? 'amber' : 'red'}>{d.verdict.replace(/_/g, ' ')}</Tag>
                        <span className="text-slate-400">{d.rule.replace(/_/g, ' ')}</span>
                        <span className="text-slate-500 font-mono truncate max-w-[420px]">{d.left_key} ↔ {d.right_key}</span>
                        <span className="text-slate-500">{Math.round(Number(d.confidence) * 100)}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
