import { AlertOctagon, ArrowDown, ArrowRight, ArrowUp, CheckCircle2, Crown, MinusCircle, PlusCircle, Route, ShieldCheck, Users, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { WhatIfPath, WhatIfResult } from '../../lib/identityApi';
import { Card, Tag } from './identityUi';
import { BAND_STYLE, BandPill } from './identityRiskUi';

function Stat({ label, value, hint, tone = 'slate' }: { label: string; value: ReactNode; hint?: string; tone?: 'slate' | 'green' | 'red' | 'amber' }) {
  const color = { slate: 'text-slate-100', green: 'text-emerald-300', red: 'text-red-300', amber: 'text-amber-300' }[tone];
  return (
    <Card className="p-4">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-2xl font-semibold mt-1 ${color}`}>{value}</div>
      {hint && <div className="text-[11px] text-slate-500 mt-1">{hint}</div>}
    </Card>
  );
}

function Section({ title, icon: Icon, count, children }: { title: string; icon: typeof Route; count: number; children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/50 flex items-center gap-2">
        <Icon size={15} className="text-teal-300" />
        <h3 className="text-sm font-medium text-slate-100">{title}</h3>
        <span className="text-xs text-slate-500">{count}</span>
      </div>
      {children}
    </Card>
  );
}

function Steps({ steps, muted }: { steps: string[]; muted?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center gap-1 text-xs ${muted ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-300'}`}>
      {steps.map((s, i) => (
        <span key={`${s}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ArrowRight size={10} className="text-slate-600" />}
          <span className={`px-1.5 py-0.5 rounded border ${i === steps.length - 1 ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-slate-700/60 bg-slate-800/50'}`}>{s}</span>
        </span>
      ))}
    </div>
  );
}

function PathRow({ p, kind }: { p: WhatIfPath; kind: 'removed' | 'added' | 'rerouted' }) {
  const Icon = kind === 'removed' ? MinusCircle : kind === 'added' ? PlusCircle : Route;
  const tone = kind === 'removed' ? 'text-emerald-300' : kind === 'added' ? 'text-red-300' : 'text-amber-300';
  return (
    <div className="px-5 py-3 flex gap-3">
      <Icon size={16} className={`${tone} flex-shrink-0 mt-0.5`} />
      <div className="min-w-0 space-y-1.5">
        <div className="text-sm text-slate-200">
          <span className="font-medium">{p.display_name}</span>
          <span className="text-slate-500"> {kind === 'added' ? 'would gain' : kind === 'removed' ? 'loses' : 'keeps, by another route,'} </span>
          <span className="font-medium">{p.resource}</span>
          {p.via_takeover && <span className="ml-2"><Tag tone="red">via takeover</Tag></span>}
        </div>
        {kind === 'rerouted' && p.previous_steps && <Steps steps={p.previous_steps} muted />}
        <Steps steps={p.steps} muted={kind === 'removed'} />
      </div>
    </div>
  );
}

export default function WhatIfResultView({ result }: { result: WhatIfResult }) {
  const s = result.summary;
  const net = s.risk_points_removed - s.risk_points_added;
  return (
    <div className="space-y-4">
      {result.lockouts.length > 0 && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-4 flex gap-3">
          <AlertOctagon size={18} className="text-red-300 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-red-200">Lockout warning</div>
            <p className="text-sm text-red-200/80 mt-0.5 leading-relaxed">
              After this change nobody could reach {result.lockouts.map((l) => `${l.resource} (${l.people_before} today)`).join(', ')}.
              Make sure a break-glass route exists before doing this for real.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Net risk change" value={net > 0 ? `-${net}` : net < 0 ? `+${-net}` : '0'} tone={net > 0 ? 'green' : net < 0 ? 'red' : 'slate'}
          hint={`${s.identities_affected} identit${s.identities_affected === 1 ? 'y' : 'ies'} affected`} />
        <Stat label="Crown-jewel paths" value={<span>{s.paths_before}<ArrowRight size={16} className="inline mx-1 text-slate-500" />{s.paths_after}</span>}
          hint={`${s.paths_removed} closed · ${s.paths_added} opened`} tone={s.paths_added ? 'amber' : s.paths_removed ? 'green' : 'slate'} />
        <Stat label="Critical identities" value={<span>{s.critical_before}<ArrowRight size={16} className="inline mx-1 text-slate-500" />{s.critical_after}</span>}
          tone={s.critical_after < s.critical_before ? 'green' : s.critical_after > s.critical_before ? 'red' : 'slate'} />
        <Stat label="Memberships removed" value={s.memberships_lost} hint="Including inherited ones" tone={s.memberships_lost ? 'amber' : 'slate'} />
      </div>

      {result.rejected.length > 0 && (
        <Card className="p-4 space-y-2">
          {result.rejected.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <XCircle size={15} className="text-amber-300 mt-0.5 flex-shrink-0" />
              <span className="text-slate-300">{c.description}<span className="text-slate-500"> — {c.reason}</span></span>
            </div>
          ))}
        </Card>
      )}

      <Section title="Risk score changes" icon={ShieldCheck} count={result.score_changes.length}>
        {result.score_changes.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">No identity's risk score would change.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {result.score_changes.map((c) => (
              <div key={c.canonical_id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-slate-100 min-w-[140px]">{c.display_name}</span>
                  <div className="flex items-center gap-2 text-sm">
                    <span className={BAND_STYLE[c.band_before]?.text}>{c.score_before}</span>
                    <ArrowRight size={13} className="text-slate-600" />
                    <span className={`font-semibold ${BAND_STYLE[c.band_after]?.text}`}>{c.score_after}</span>
                    <span className={`inline-flex items-center text-xs ${c.delta < 0 ? 'text-emerald-300' : c.delta > 0 ? 'text-red-300' : 'text-slate-500'}`}>
                      {c.delta < 0 ? <ArrowDown size={12} /> : c.delta > 0 ? <ArrowUp size={12} /> : null}{Math.abs(c.delta)}
                    </span>
                  </div>
                  {c.band_before !== c.band_after && (
                    <span className="flex items-center gap-1"><BandPill band={c.band_before} /><ArrowRight size={11} className="text-slate-600" /><BandPill band={c.band_after} /></span>
                  )}
                </div>
                <div className="mt-2 space-y-1 text-xs">
                  {c.factors_cleared.map((f) => <div key={f} className="flex items-center gap-1.5 text-emerald-300/90"><CheckCircle2 size={12} /> Clears: {f}</div>)}
                  {c.factors_changed.map((f) => (
                    <div key={f.before} className="flex items-center gap-1.5 text-slate-400"><Route size={12} /> {f.before} ({f.points_before} pts) → {f.after} ({f.points_after} pts)</div>
                  ))}
                  {c.factors_added.map((f) => <div key={f} className="flex items-center gap-1.5 text-red-300/90"><PlusCircle size={12} /> Adds: {f}</div>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Crown-jewel paths" icon={Route} count={s.paths_removed + s.paths_added + result.paths_rerouted.length}>
        {s.paths_removed + s.paths_added + result.paths_rerouted.length === 0 ? (
          <div className="px-5 py-6 text-sm text-slate-500">No path to a crown-jewel system would open, close or change.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {result.paths_removed.map((p) => <PathRow key={`r-${p.canonical_id}-${p.resource_id}`} p={p} kind="removed" />)}
            {result.paths_added.map((p) => <PathRow key={`a-${p.canonical_id}-${p.resource_id}`} p={p} kind="added" />)}
            {result.paths_rerouted.map((p) => <PathRow key={`x-${p.canonical_id}-${p.resource_id}`} p={p} kind="rerouted" />)}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Who loses group membership" icon={Users} count={result.memberships_lost.length}>
          {result.memberships_lost.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500">Nobody loses a group membership.</div>
          ) : (
            <div className="divide-y divide-slate-800 max-h-80 overflow-y-auto">
              {result.memberships_lost.map((m) => (
                <div key={`${m.account_key}-${m.group}`} className="px-5 py-2.5 flex items-center gap-2 text-sm">
                  <span className="text-slate-200 truncate">{m.display_name}</span>
                  <span className="text-slate-500 text-xs truncate">{m.username}</span>
                  <span className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                    {m.privileged && <Crown size={12} className="text-amber-300" />}
                    <span className="text-slate-300 text-xs">{m.group}</span>
                    {!m.direct && <Tag tone="blue">inherited</Tag>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>
        <Section title="Group findings" icon={CheckCircle2} count={result.group_findings_resolved.length + result.group_findings_added.length}>
          {result.group_findings_resolved.length + result.group_findings_added.length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500">No group finding would be resolved or raised.</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {result.group_findings_resolved.map((f) => (
                <div key={`r-${f.group}-${f.finding_type}`} className="px-5 py-2.5 flex gap-2 text-sm">
                  <CheckCircle2 size={14} className="text-emerald-300 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-300"><span className="text-emerald-300">Resolved</span> · {f.detail}</span>
                </div>
              ))}
              {result.group_findings_added.map((f) => (
                <div key={`a-${f.group}-${f.finding_type}`} className="px-5 py-2.5 flex gap-2 text-sm">
                  <PlusCircle size={14} className="text-red-300 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-300"><span className="text-red-300">New</span> · {f.detail}</span>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
