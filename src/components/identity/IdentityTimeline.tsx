import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Clock, Search, UserRound, KeyRound, ShieldCheck, LogIn, Smartphone, Briefcase, AlertTriangle,
  ChevronRight, Filter, Eye, EyeOff, Unlink, Activity,
} from 'lucide-react';
import {
  identityApi, type EventCategory, type IdentityTimelineData, type TimelineEvent, type TimelineFinding,
  type TimelineIdentity, type TimelineStats,
} from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime, providerLabel } from './identityUi';

const CATEGORY: Record<EventCategory, { label: string; icon: LucideIcon; tone: string }> = {
  lifecycle: { label: 'HR lifecycle', icon: Briefcase, tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  account: { label: 'Account', icon: UserRound, tone: 'text-slate-200 bg-slate-500/10 border-slate-500/30' },
  access: { label: 'Access', icon: ShieldCheck, tone: 'text-teal-300 bg-teal-500/10 border-teal-500/30' },
  sign_in: { label: 'Sign-in', icon: LogIn, tone: 'text-blue-300 bg-blue-500/10 border-blue-500/30' },
  mfa: { label: 'MFA', icon: Smartphone, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  credential: { label: 'Credential', icon: KeyRound, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
};

const EVENT_LABEL: Record<string, string> = {
  hr_joiner: 'Joined', hr_mover: 'Changed role', hr_leaver: 'Left the company', hr_rehire: 'Rehired',
  hr_conversion: 'Converted to employee', account_created: 'Account created', account_enabled: 'Account enabled',
  account_disabled: 'Account disabled', entitlement_granted: 'Access granted', entitlement_revoked: 'Access removed',
  privilege_granted: 'Privileged access granted', privilege_revoked: 'Privileged access removed',
  sign_in_success: 'Signed in', sign_in_failure: 'Sign-in failed', mfa_enrolled: 'MFA enrolled',
  mfa_device_added: 'MFA device added', mfa_reset: 'MFA reset', mfa_denied: 'MFA push denied',
  mfa_lockout: 'Locked out by MFA', password_reset: 'Password reset', credential_rotated: 'Credential rotated',
};

const FINDING_TEXT: Record<string, { title: string; why: string }> = {
  post_termination_activity: { title: 'Activity after termination', why: 'Someone signed in after HR recorded this person as a leaver.' },
  leaver_access_remaining: { title: 'Leaver still has live accounts', why: 'At least one account was not disabled after the leave date.' },
  mover_access_retained: { title: 'Mover kept old access', why: 'Access tied to the previous department was never removed.' },
  mfa_fatigue: { title: 'MFA fatigue pattern', why: 'Repeated push denials in a short window often mean an attacker has the password.' },
  mfa_reset_new_location: { title: 'MFA reset, then new country', why: 'A sign-in from an unseen country soon after an MFA reset.' },
  privilege_without_ticket: { title: 'Privilege without a ticket', why: 'Privileged access was granted with no change reference.' },
  owner_departed: { title: 'Owner has left', why: 'This workload identity is owned by someone who left the company.' },
};

const SEVERITY_STYLE: Record<string, { tag: 'red' | 'amber' | 'slate'; bar: string }> = {
  high: { tag: 'red', bar: 'bg-red-400' },
  medium: { tag: 'amber', bar: 'bg-amber-400' },
  low: { tag: 'slate', bar: 'bg-slate-400' },
};

const dayKey = (iso: string) => iso.slice(0, 10);
const fmtDay = (key: string) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
const fmtClock = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function detailChips(detail: Record<string, unknown>) {
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== '' && typeof v !== 'object')
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${String(v)}`);
}

function Stat({ icon: Icon, label, value, tone = 'text-slate-100' }: { icon: LucideIcon; label: string; value: number | string; tone?: string }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center">
        <Icon size={16} className="text-slate-400" />
      </div>
      <div>
        <div className={`text-xl font-semibold leading-tight ${tone}`}>{value}</div>
        <div className="text-xs text-slate-500">{label}</div>
      </div>
    </Card>
  );
}

function FindingCard({ f, active, onToggle }: { f: TimelineFinding; active: boolean; onToggle: () => void }) {
  const text = FINDING_TEXT[f.finding_type] || { title: f.finding_type, why: '' };
  const sev = SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.low;
  return (
    <div className={`relative overflow-hidden rounded-lg border p-4 pl-5 transition-colors ${active ? 'border-amber-400/60 bg-amber-500/5' : 'border-slate-700/60 bg-slate-900/40'} ${f.status === 'resolved' ? 'opacity-60' : ''}`}>
      <span className={`absolute left-0 top-0 bottom-0 w-1 ${sev.bar}`} />
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-100">{text.title}</span>
        <Tag tone={sev.tag}>{f.severity}</Tag>
        {f.status === 'resolved' && <Tag tone="green">resolved</Tag>}
      </div>
      {f.detail && <p className="text-sm text-slate-300 mt-2 leading-relaxed">{f.detail}</p>}
      {text.why && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{text.why}</p>}
      <button onClick={onToggle}
        className="mt-3 inline-flex items-center gap-1.5 text-xs text-teal-300 hover:text-teal-200 transition-colors">
        {active ? <EyeOff size={13} /> : <Eye size={13} />}
        {active ? 'Hide evidence' : `Show ${f.evidence_event_ids.length} evidence event${f.evidence_event_ids.length === 1 ? '' : 's'}`}
      </button>
    </div>
  );
}

function EventRow({ e, highlighted }: { e: TimelineEvent; highlighted: boolean }) {
  const cat = CATEGORY[e.category] || CATEGORY.account;
  const Icon = cat.icon;
  const chips = detailChips(e.detail);
  return (
    <li className="relative pl-12 pb-5 last:pb-0">
      <span className="absolute left-[19px] top-10 bottom-0 w-px bg-slate-700/60" />
      <span className={`absolute left-0 top-0 w-10 h-10 rounded-full border flex items-center justify-center ${cat.tone} ${highlighted ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-[#0F1D32]' : ''}`}>
        <Icon size={16} />
      </span>
      <div className={`rounded-lg border px-4 py-3 transition-all duration-300 ${highlighted ? 'border-amber-400/60 bg-amber-500/5' : 'border-transparent hover:border-slate-700/60 hover:bg-slate-900/40'}`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-medium text-slate-100">{EVENT_LABEL[e.event_type] || e.event_type}</span>
          <span className="text-xs text-slate-500 tabular-nums">{fmtClock(e.occurred_at)} UTC</span>
          <span className="text-xs text-slate-400">{providerLabel(e.provider)}</span>
          {e.actor && <span className="text-xs text-slate-500">by {e.actor}</span>}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {chips.map((c) => <span key={c} className="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">{c}</span>)}
          </div>
        )}
      </div>
    </li>
  );
}

function TimelineDetail({ id }: { id: string }) {
  const [data, setData] = useState<IdentityTimelineData | null>(null);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<EventCategory | ''>('');
  const [evidenceFor, setEvidenceFor] = useState<string | null>(null);

  const load = useCallback(() => {
    let live = true;
    setData(null);
    setError('');
    setEvidenceFor(null);
    identityApi.identityTimeline(id)
      .then((d) => { if (live) setData(d); })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [id]);

  useEffect(load, [load]);

  const evidence = useMemo(() => {
    const f = data?.findings.find((x) => x.finding_id === evidenceFor);
    return new Set(f?.evidence_event_ids || []);
  }, [data, evidenceFor]);

  const days = useMemo(() => {
    const groups: [string, TimelineEvent[]][] = [];
    for (const e of data?.events || []) {
      if (category && e.category !== category) continue;
      if (evidence.size && !evidence.has(e.event_id)) continue;
      const k = dayKey(e.occurred_at);
      const last = groups[groups.length - 1];
      if (last && last[0] === k) last[1].push(e);
      else groups.push([k, [e]]);
    }
    return groups;
  }, [data, category, evidence]);

  if (error) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return <Card><Loading label="Loading timeline" /></Card>;

  const counts = data.events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.category]: (acc[e.category] || 0) + 1 }), {});
  const open = data.findings.filter((f) => f.status === 'open');

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-lg font-semibold text-slate-100">{data.identity.display_name || data.identity.canonical_id}</div>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Tag tone="teal">{data.identity.principal_type}</Tag>
              {data.identity.providers.map((p) => <Tag key={p}>{providerLabel(p)}</Tag>)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold text-slate-100 tabular-nums">{data.events.length}</div>
            <div className="text-xs text-slate-500">events on record</div>
          </div>
        </div>
      </Card>

      {data.findings.length > 0 ? (
        <div className="space-y-3">
          <div className="text-xs uppercase tracking-wider text-slate-500">
            {open.length} open finding{open.length === 1 ? '' : 's'}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {data.findings.map((f) => (
              <FindingCard key={f.finding_id} f={f} active={evidenceFor === f.finding_id}
                onToggle={() => setEvidenceFor(evidenceFor === f.finding_id ? null : f.finding_id)} />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-sm text-emerald-200">
          <ShieldCheck size={16} /> No timeline findings. Lifecycle, access and sign-in history look consistent.
        </div>
      )}

      <Card className="p-5">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Filter size={14} className="text-slate-500 mr-1" />
          <button onClick={() => setCategory('')}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${!category ? 'border-teal-400/60 bg-teal-500/10 text-teal-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>
            All ({data.events.length})
          </button>
          {(Object.keys(CATEGORY) as EventCategory[]).filter((c) => counts[c]).map((c) => (
            <button key={c} onClick={() => setCategory(category === c ? '' : c)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${category === c ? 'border-teal-400/60 bg-teal-500/10 text-teal-200' : 'border-slate-700 text-slate-400 hover:text-slate-200'}`}>
              {CATEGORY[c].label} ({counts[c]})
            </button>
          ))}
          {evidence.size > 0 && <Tag tone="amber">Showing evidence only</Tag>}
        </div>
        {days.length === 0 ? (
          <Empty title="No events match" hint="Clear the filter to see the full history." />
        ) : (
          <div className="space-y-6">
            {days.map(([day, evs]) => (
              <section key={day}>
                <div className="sticky top-0 z-10 bg-[#0F1D32]/95 backdrop-blur py-1 mb-3 text-xs font-medium uppercase tracking-wider text-slate-400">
                  {fmtDay(day)}
                </div>
                <ol>{evs.map((e) => <EventRow key={e.event_id} e={e} highlighted={evidence.has(e.event_id)} />)}</ol>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function IdentityTimeline() {
  const [people, setPeople] = useState<TimelineIdentity[] | null>(null);
  const [stats, setStats] = useState<TimelineStats | null>(null);
  const [findings, setFindings] = useState<TimelineFinding[]>([]);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback((q: string) => {
    let live = true;
    setError('');
    Promise.all([identityApi.timelineIdentities(q), identityApi.timelineFindings()])
      .then(([p, f]) => {
        if (!live) return;
        setPeople(p.identities);
        setStats(p.stats);
        setFindings(f.findings);
        setSelected((cur) => cur ?? p.identities[0]?.canonical_id ?? null);
      })
      .catch((e: Error) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search, load]);

  const high = findings.filter((f) => f.severity === 'high').length;

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 p-6">
      <div className="max-w-7xl mx-auto">
        <PageHeader icon={Clock} title="Identity Timeline"
          subtitle="One chronological story per identity across HR, directories, access governance and MFA, with lifecycle and sign-in risks called out." />

        {error && <div className="mb-6"><ErrorBanner message={error} onRetry={() => load(search.trim())} /></div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Stat icon={Activity} label="Events linked" value={stats ? Math.max(0, (stats.events || 0) - (stats.unlinked || 0)) : '—'} />
          <Stat icon={AlertTriangle} label="High-severity findings" value={high} tone={high ? 'text-red-300' : 'text-slate-100'} />
          <Stat icon={ShieldCheck} label="Open findings" value={findings.length} tone={findings.length ? 'text-amber-300' : 'text-slate-100'} />
          <Stat icon={Unlink} label="Events with no matching identity" value={stats?.unlinked ?? '—'} />
        </div>

        {people === null && !error ? (
          <Card><Loading label="Loading identities" /></Card>
        ) : people && people.length === 0 && !search ? (
          <Card>
            <Empty title="No timeline events yet"
              hint="Events appear after the identity job runs with HR, directory, access and MFA event feeds in place. Demo environments load sample events automatically." />
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <Card className="p-3">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, username, email, employee id"
                    className="w-full bg-slate-900/60 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60 transition-colors" />
                </div>
                <ul className="mt-3 max-h-[60vh] overflow-y-auto -mx-1">
                  {(people || []).map((p) => (
                    <li key={p.canonical_id}>
                      <button onClick={() => setSelected(p.canonical_id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${selected === p.canonical_id ? 'bg-teal-500/10 border border-teal-500/30' : 'border border-transparent hover:bg-slate-800/60'}`}>
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-300 flex-shrink-0">
                          {(p.display_name || '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm text-slate-100 truncate">{p.display_name || p.canonical_id}</div>
                          <div className="text-xs text-slate-500">{p.events} events · last {fmtTime(p.last_event_at)}</div>
                        </div>
                        {p.high_findings > 0 ? <Tag tone="red">{p.open_findings}</Tag> : p.open_findings > 0 ? <Tag tone="amber">{p.open_findings}</Tag> : null}
                        <ChevronRight size={14} className="text-slate-600" />
                      </button>
                    </li>
                  ))}
                  {people && people.length === 0 && <li className="px-3 py-6 text-center text-sm text-slate-500">No identities match "{search}"</li>}
                </ul>
              </Card>

              {findings.length > 0 && (
                <Card className="p-4">
                  <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">All open findings</div>
                  <ul className="space-y-1">
                    {findings.slice(0, 12).map((f) => (
                      <li key={f.finding_id}>
                        <button onClick={() => setSelected(f.canonical_id || null)}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-slate-800/60 transition-colors">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${(SEVERITY_STYLE[f.severity] || SEVERITY_STYLE.low).bar}`} />
                          <span className="text-xs text-slate-300 truncate flex-1">{FINDING_TEXT[f.finding_type]?.title || f.finding_type}</span>
                          <span className="text-xs text-slate-500 truncate max-w-[110px]">{f.display_name}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>

            <div>{selected ? <TimelineDetail id={selected} /> : <Card><Empty title="Pick an identity" hint="Choose someone on the left to see their history." /></Card>}</div>
          </div>
        )}
      </div>
    </div>
  );
}
