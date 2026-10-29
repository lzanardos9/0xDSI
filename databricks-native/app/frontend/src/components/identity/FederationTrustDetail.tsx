import { useEffect, useState } from 'react';
import { CheckCircle2, History, UserRound, XCircle } from 'lucide-react';
import { identityApi, type FederationGuest, type TrustDetail } from '../../lib/identityApi';
import { Card, ErrorBanner, Loading, StatePill, Tag, fmtTime } from './identityUi';
import { SEVERITY_TONE } from './identityRiskUi';

export const KIND_LABEL: Record<string, string> = {
  cross_tenant: 'Partner tenant',
  idp_federation: 'Federated sign-in',
  ad_trust: 'AD forest trust',
};

export const SPONSOR_TONE: Record<string, 'green' | 'red' | 'amber' | 'blue'> = {
  active: 'green', departed: 'red', none: 'amber', unresolved: 'amber', team: 'blue',
};

const showValue = (v: unknown) => {
  if (v === null || v === undefined || v === '') return 'not reported';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
};

const parseValue = (raw: string | null) => {
  try {
    return showValue(raw === null ? null : JSON.parse(raw));
  } catch {
    return raw ?? 'not reported';
  }
};

export function GuestRow({ g }: { g: FederationGuest }) {
  return (
    <div className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm text-slate-100">{g.display_name || g.username}</div>
        <div className="text-xs text-slate-500 truncate">{g.email || g.username}</div>
      </div>
      <div className="text-xs text-slate-400 min-w-[150px]">{g.partner_name || <span className="text-amber-300">No matching partner</span>}</div>
      <div className="min-w-[170px]">
        <div className="text-xs text-slate-300 truncate">{g.sponsor || 'No sponsor'}</div>
        <Tag tone={SPONSOR_TONE[g.sponsor_status] || 'amber'}>sponsor {g.sponsor_status}</Tag>
      </div>
      <div className="text-xs text-slate-400 w-28">
        {g.days_inactive === null ? 'never signed in' : g.days_inactive === 0 ? 'active today' : `${g.days_inactive} days idle`}
      </div>
      <div className="flex flex-wrap gap-1 min-w-[120px]">
        {g.privileged_groups.map((p) => <Tag key={p} tone="red">{p}</Tag>)}
      </div>
      <StatePill state={g.normalized_state} />
    </div>
  );
}

export default function FederationTrustDetail({ trustId }: { trustId: string }) {
  const [data, setData] = useState<TrustDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    identityApi.trustDetail(trustId).then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [trustId]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Card><Loading label="Loading trust" /></Card>;
  const t = data.trust;
  const open = data.findings.filter((f) => f.status === 'open');
  const bySetting = new Map(open.filter((f) => f.setting).map((f) => [f.setting as string, f]));
  const ownerFinding = open.find((f) => f.finding_type.startsWith('trust_'));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-100">{t.partner_name}</h2>
          <Tag tone="blue">{KIND_LABEL[t.kind] || t.kind}</Tag>
        </div>
        {t.description && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{t.description}</p>}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          <div>
            <div className="text-[11px] text-slate-500">Owner</div>
            <div className="text-slate-200 truncate">{t.owner || '—'}</div>
            <div className="mt-1"><Tag tone={SPONSOR_TONE[t.owner_status] || 'amber'}>{t.owner_status === 'none' ? 'no owner' : `owner ${t.owner_status}`}</Tag></div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Our side</div>
            <div className="text-slate-200 truncate">{t.tenant || '—'}</div>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Partner side</div>
            <div className="text-slate-200 truncate">{t.partner_tenant || '—'}</div>
            {t.partner_domains.length > 0 && <div className="text-xs text-slate-500 truncate">{t.partner_domains.join(', ')}</div>}
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Baseline</div>
            <div className="text-slate-200">{t.rules_passed} of {t.rules_total} checks pass</div>
          </div>
        </div>
        {ownerFinding && <div className="mt-4 text-sm text-red-300">{ownerFinding.detail}</div>}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-700/50 text-sm font-medium text-slate-100">Settings against the baseline</div>
        <div className="divide-y divide-slate-800">
          {Object.entries(t.settings).map(([k, v]) => {
            const f = bySetting.get(k);
            return (
              <div key={k} className="px-5 py-3 flex gap-3">
                {f ? <XCircle size={16} className="text-red-300 mt-0.5 flex-shrink-0" /> : <CheckCircle2 size={16} className="text-emerald-300 mt-0.5 flex-shrink-0" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-200 font-mono">{k}</span>
                    <span className="text-sm text-slate-400">{showValue(v)}</span>
                    {f && <Tag tone={SEVERITY_TONE[f.severity]}>{f.severity}</Tag>}
                  </div>
                  {f && (
                    <div className="text-xs text-slate-400 mt-1">
                      {f.title}. Expected {f.expected}.
                      {f.changed_by && <span className="text-amber-300"> Changed by {f.changed_by} on {fmtTime(f.changed_at)}.</span>}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {[...bySetting.values()].filter((f) => !(f.setting! in t.settings)).map((f) => (
            <div key={f.finding_id} className="px-5 py-3 flex gap-3">
              <XCircle size={16} className="text-red-300 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-slate-300"><span className="font-mono">{f.setting}</span> not reported by the source. {f.title}.</div>
            </div>
          ))}
        </div>
      </Card>

      {data.changes.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50 text-sm font-medium text-slate-100 flex items-center gap-2"><History size={14} className="text-teal-300" /> Change history</div>
          <div className="divide-y divide-slate-800">
            {data.changes.map((c) => (
              <div key={c.change_id} className="px-5 py-2.5 text-sm flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-slate-500 w-36">{fmtTime(c.changed_at)}</span>
                <span className="font-mono text-slate-200">{c.setting}</span>
                <span className="text-slate-500">{parseValue(c.before_value)}</span>
                <span className="text-slate-600">→</span>
                <span className="text-slate-200">{parseValue(c.after_value)}</span>
                <span className="ml-auto text-xs text-slate-400 inline-flex items-center gap-1"><UserRound size={11} /> {c.changed_by || 'unknown'}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.guests.length > 0 && (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-700/50 text-sm font-medium text-slate-100">Guests from this partner</div>
          <div className="divide-y divide-slate-800">{data.guests.map((g) => <GuestRow key={g.account_key} g={g} />)}</div>
        </Card>
      )}
    </div>
  );
}
