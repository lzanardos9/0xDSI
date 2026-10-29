import { useCallback, useEffect, useState } from 'react';
import { Globe2, Building2, KeyRound, Network, ShieldAlert, ChevronRight, UsersRound, History, ListChecks, RefreshCw } from 'lucide-react';
import { identityApi, type FederationFinding, type FederationOverview, type FedSeverity } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime } from './identityUi';
import { SEVERITY_TONE } from './identityRiskUi';
import FederationTrustDetail, { GuestRow, KIND_LABEL } from './FederationTrustDetail';

type Tab = 'trusts' | 'guests' | 'findings';

const KIND_ICON = { cross_tenant: Building2, idp_federation: KeyRound, ad_trust: Network };

function ScoreRing({ value }: { value: number | null }) {
  const v = value ?? 0;
  const color = v >= 80 ? '#34d399' : v >= 60 ? '#fbbf24' : '#f87171';
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-20 h-20 flex-shrink-0">
      <svg viewBox="0 0 72 72" className="w-20 h-20 -rotate-90">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#1e293b" strokeWidth="6" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-lg font-semibold text-slate-100">{value === null ? '—' : `${v}%`}</div>
    </div>
  );
}

function FindingsList() {
  const [severity, setSeverity] = useState<FedSeverity | ''>('');
  const [scope, setScope] = useState('');
  const [rows, setRows] = useState<FederationFinding[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setRows(null);
    identityApi.federationFindings({ severity, scope })
      .then((d) => live && setRows(d.findings)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [severity, scope]);

  const chip = (on: boolean, label: string, click: () => void) => (
    <button onClick={click} className={`px-2.5 py-1 rounded-lg border text-xs transition-colors ${on ? 'border-teal-500/50 bg-teal-500/10 text-teal-200' : 'border-slate-700/60 text-slate-400 hover:bg-slate-800'}`}>{label}</button>
  );

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/50 flex flex-wrap gap-2">
        {chip(severity === '', 'All severities', () => setSeverity(''))}
        {(['high', 'medium', 'low'] as FedSeverity[]).map((s) => chip(severity === s, s, () => setSeverity(s)))}
        <span className="w-px bg-slate-700/60 mx-1" />
        {chip(scope === '', 'Trusts and guests', () => setScope(''))}
        {chip(scope === 'trust', 'Trusts', () => setScope('trust'))}
        {chip(scope === 'guest', 'Guests', () => setScope('guest'))}
      </div>
      {error ? <div className="p-4"><ErrorBanner message={error} /></div> : !rows ? <Loading /> : rows.length === 0 ? (
        <Empty title="No open findings" hint="Nothing matches these filters." />
      ) : (
        <div className="divide-y divide-slate-800">
          {rows.map((f) => (
            <div key={f.finding_id} className="px-5 py-3 flex gap-3">
              <ShieldAlert size={15} className={`mt-0.5 flex-shrink-0 ${f.severity === 'high' ? 'text-red-300' : f.severity === 'medium' ? 'text-amber-300' : 'text-slate-400'}`} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-100">{f.title}</span>
                  <Tag tone={SEVERITY_TONE[f.severity]}>{f.severity}</Tag>
                  <Tag tone={f.scope === 'guest' ? 'blue' : 'slate'}>{f.scope === 'guest' ? f.guest_name || 'guest' : f.partner_name || 'trust'}</Tag>
                </div>
                <div className="text-xs text-slate-400 mt-1 leading-relaxed">{f.detail}</div>
              </div>
              <div className="text-[11px] text-slate-500 flex-shrink-0">since {fmtTime(f.first_seen)}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function FederationPosture() {
  const [data, setData] = useState<FederationOverview | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('trusts');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(() => {
    setError('');
    identityApi.federation()
      .then((d) => { setData(d); setSelected((cur) => cur ?? d.trusts[0]?.trust_id ?? null); })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const sev = s?.open_by_severity || {};
  const tabs: { id: Tab; label: string; icon: typeof Globe2; count?: number }[] = [
    { id: 'trusts', label: 'Trusts', icon: Globe2, count: s?.trusts },
    { id: 'guests', label: 'Guests', icon: UsersRound, count: s?.guests },
    { id: 'findings', label: 'Findings', icon: ListChecks, count: (sev.high || 0) + (sev.medium || 0) + (sev.low || 0) },
  ];

  return (
    <div className="p-6 lg:p-8 bg-[#0A1628] min-h-full">
      <PageHeader
        icon={Globe2}
        title="Federation Posture"
        subtitle="Every partner tenant, federated sign-in and forest trust checked against a baseline, with who changed what and when. Guests are matched to their partner and checked for a live sponsor."
        actions={
          <button onClick={load} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 text-sm text-slate-300 hover:bg-slate-800 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {!data && !error && <Card><Loading label="Loading federation posture" /></Card>}

      {data && s && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-6">
            <Card className="p-4 flex items-center gap-4">
              <ScoreRing value={s.posture_score} />
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500">Baseline checks passing</div>
                <div className="text-sm text-slate-300 mt-1">{s.rules_passed} of {s.rules_total}</div>
                <div className="text-[11px] text-slate-500 mt-1">Updated {fmtTime(s.updated_at)}</div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Open findings</div>
              <div className="flex items-baseline gap-4 mt-2">
                <div><span className="text-2xl font-semibold text-red-300">{sev.high || 0}</span><span className="text-xs text-slate-500 ml-1">high</span></div>
                <div><span className="text-2xl font-semibold text-amber-300">{sev.medium || 0}</span><span className="text-xs text-slate-500 ml-1">medium</span></div>
                <div><span className="text-2xl font-semibold text-slate-300">{sev.low || 0}</span><span className="text-xs text-slate-500 ml-1">low</span></div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Trusts</div>
              <div className="text-2xl font-semibold text-slate-100 mt-1">{s.trusts}</div>
              <div className="text-[11px] text-slate-500 mt-1">{data.trusts.filter((t) => t.worst_severity === 'high').length} with a high-severity gap</div>
            </Card>
            <Card className="p-4">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">Guests</div>
              <div className="text-2xl font-semibold text-slate-100 mt-1">{s.active_guests}<span className="text-sm text-slate-500 font-normal"> active of {s.guests}</span></div>
              <div className="text-[11px] text-slate-500 mt-1">{data.guests.filter((g) => g.privileged_groups.length > 0).length} hold privileged access</div>
            </Card>
          </div>

          <div className="flex gap-1 mb-4 border-b border-slate-700/50">
            {tabs.map((t) => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${tab === t.id ? 'border-teal-400 text-teal-200' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                <t.icon size={14} /> {t.label}
                {t.count !== undefined && <span className="text-xs text-slate-500">{t.count}</span>}
              </button>
            ))}
          </div>

          {tab === 'trusts' && (
            data.trusts.length === 0 ? (
              <Card><Empty title="No trusts loaded" hint="Run the identity job once the federation feed is in place." /></Card>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-6">
                <div className="space-y-4 self-start">
                  <Card className="overflow-hidden">
                    <div className="divide-y divide-slate-800">
                      {data.trusts.map((t) => {
                        const Icon = KIND_ICON[t.kind] || Globe2;
                        const active = t.trust_id === selected;
                        const pct = t.rules_total ? (100 * t.rules_passed) / t.rules_total : 100;
                        return (
                          <button key={t.trust_id} onClick={() => setSelected(t.trust_id)}
                            className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${active ? 'bg-teal-500/10' : 'hover:bg-slate-800/50'}`}>
                            <Icon size={16} className="text-slate-400 flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-slate-100 truncate">{t.partner_name}</div>
                              <div className="text-[11px] text-slate-500">{KIND_LABEL[t.kind] || t.kind}{t.guests ? ` · ${t.guests} guest${t.guests > 1 ? 's' : ''}` : ''}</div>
                              <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
                                <div className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? 'bg-emerald-400' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${pct}%` }} />
                              </div>
                            </div>
                            {t.worst_severity ? <Tag tone={SEVERITY_TONE[t.worst_severity]}>{t.open_findings ?? 0}</Tag> : <Tag tone="green">clean</Tag>}
                            <ChevronRight size={14} className={active ? 'text-teal-300' : 'text-slate-600'} />
                          </button>
                        );
                      })}
                    </div>
                  </Card>
                  {data.recent_changes.length > 0 && (
                    <Card className="overflow-hidden">
                      <div className="px-4 py-2.5 border-b border-slate-700/50 text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><History size={12} /> Recent setting changes</div>
                      <div className="divide-y divide-slate-800">
                        {data.recent_changes.slice(0, 6).map((c) => (
                          <button key={c.change_id} onClick={() => c.trust_id && setSelected(c.trust_id)} className="w-full text-left px-4 py-2.5 hover:bg-slate-800/50 transition-colors">
                            <div className="text-xs text-slate-300"><span className="font-mono">{c.setting}</span> on {data.trusts.find((t) => t.trust_id === c.trust_id)?.partner_name || c.trust_id}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">{c.changed_by || 'unknown'} · {fmtTime(c.changed_at)}</div>
                          </button>
                        ))}
                      </div>
                    </Card>
                  )}
                </div>
                <div>{selected && <FederationTrustDetail trustId={selected} />}</div>
              </div>
            )
          )}

          {tab === 'guests' && (
            <Card className="overflow-hidden">
              {data.guests.length === 0 ? <Empty title="No guests" hint="No guest accounts are on the identity spine." /> : (
                <div className="divide-y divide-slate-800">{data.guests.map((g) => <GuestRow key={g.account_key} g={g} />)}</div>
              )}
            </Card>
          )}

          {tab === 'findings' && <FindingsList />}
        </>
      )}
    </div>
  );
}
