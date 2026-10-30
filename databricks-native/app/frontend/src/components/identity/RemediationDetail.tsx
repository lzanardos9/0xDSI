import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, RotateCcw, Send, ShieldCheck, ThumbsDown, ThumbsUp, Undo2, XCircle } from 'lucide-react';
import { identityApi, type RemediationDetail as Detail, type RemediationStatus } from '../../lib/identityApi';
import { Card, ErrorBanner, Loading, Tag, fmtTime, providerLabel } from './identityUi';
import { BandPill, SEVERITY_TONE } from './identityRiskUi';

type Tone = 'slate' | 'blue' | 'teal' | 'amber' | 'red' | 'green';
export const STATUS: Record<RemediationStatus, { label: string; tone: Tone }> = {
  proposed: { label: 'Proposed', tone: 'blue' },
  blocked: { label: 'Blocked', tone: 'amber' },
  pending_approval: { label: 'Awaiting approval', tone: 'amber' },
  queued: { label: 'Queued', tone: 'teal' },
  rollback_queued: { label: 'Rollback queued', tone: 'teal' },
  executed: { label: 'Executed', tone: 'green' },
  verified: { label: 'Verified', tone: 'green' },
  rolled_back: { label: 'Rolled back', tone: 'slate' },
  no_longer_needed: { label: 'No longer needed', tone: 'slate' },
  rejected: { label: 'Rejected', tone: 'red' },
  dismissed: { label: 'Dismissed', tone: 'slate' },
  superseded: { label: 'Superseded', tone: 'slate' },
  failed: { label: 'Failed', tone: 'red' },
  rollback_failed: { label: 'Rollback failed', tone: 'red' },
};

type Mode = 'request' | 'approve' | 'reject' | 'rollback' | 'dismiss';
const MODE: Record<Mode, { label: string; field: string; placeholder: string; required: boolean; icon: typeof Send; style: string }> = {
  request: { label: 'Request approval', field: 'Note for approvers', placeholder: 'Optional context, such as a ticket number', required: false, icon: Send, style: 'bg-teal-600 hover:bg-teal-500 text-white' },
  approve: { label: 'Approve', field: 'Comment', placeholder: 'Optional', required: false, icon: ThumbsUp, style: 'bg-emerald-600 hover:bg-emerald-500 text-white' },
  reject: { label: 'Reject', field: 'Reason', placeholder: 'Why this change should not go ahead', required: true, icon: ThumbsDown, style: 'bg-red-600 hover:bg-red-500 text-white' },
  rollback: { label: 'Roll back', field: 'Reason', placeholder: 'What went wrong after the change', required: true, icon: Undo2, style: 'bg-amber-600 hover:bg-amber-500 text-white' },
  dismiss: { label: 'Dismiss', field: 'Reason', placeholder: 'Why this fix is not needed', required: true, icon: XCircle, style: 'bg-slate-600 hover:bg-slate-500 text-white' },
};

function Stat({ label, value, tone = 'text-slate-100' }: { label: string; value: number | string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-900/40 px-3 py-2">
      <div className={`text-lg font-semibold ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );
}

function Json({ title, value }: { title: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (!value) return null;
  return (
    <div className="border-t border-slate-800">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-5 py-2.5 text-xs text-slate-400 hover:text-slate-200 transition-colors">
        {title}<ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <pre className="mx-5 mb-3 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-[11px] text-slate-300 overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>}
    </div>
  );
}

export default function RemediationDetail({ actionId, onChanged }: { actionId: string; onChanged: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<Mode | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    setError('');
    identityApi.remediationDetail(actionId).then(setData).catch((e: Error) => setError(e.message));
  }, [actionId]);

  useEffect(() => { setData(null); setMode(null); setNotice(''); load(); }, [load]);

  const submit = async () => {
    if (!mode) return;
    setBusy(true);
    setError('');
    try {
      const calls = {
        request: () => identityApi.requestRemediation(actionId, text),
        approve: () => identityApi.decideRemediation(actionId, 'approve', text),
        reject: () => identityApi.decideRemediation(actionId, 'reject', text),
        rollback: () => identityApi.rollbackRemediation(actionId, text),
        dismiss: () => identityApi.dismissRemediation(actionId, text),
      };
      const ack = await calls[mode]();
      setNotice(ack.status === 'pending_approval' && ack.approvals !== undefined
        ? `Approval recorded: ${ack.approvals} of ${ack.required}.`
        : `${STATUS[ack.status]?.label || ack.status}.${ack.triggered === false && ack.reason ? ` The executor will pick it up on its next run (${ack.reason}).` : ''}`);
      setMode(null);
      setText('');
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <Card className="p-4"><ErrorBanner message={error} onRetry={load} /></Card>;
  if (!data) return <Card><Loading label="Loading action" /></Card>;

  const { action: a, approvals, outbox, can } = data;
  const s = a.impact?.summary;
  const st = STATUS[a.status];
  const need = a.required_approvals || 1;
  const modes: Mode[] = [
    ...(can.request ? ['request' as const] : []),
    ...(can.decide ? ['approve' as const, 'reject' as const] : []),
    ...(can.rollback ? ['rollback' as const] : []),
    ...(can.dismiss ? ['dismiss' as const] : []),
  ];
  const m = mode ? MODE[mode] : null;

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-700/50">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Tag tone={st.tone}>{st.label}</Tag>
          <Tag tone={SEVERITY_TONE[a.severity]}>{a.severity}</Tag>
          <Tag>{providerLabel(a.provider)}</Tag>
          <Tag tone={need > 1 ? 'amber' : 'slate'}>{need > 1 ? 'Two-person approval' : 'One approver'}</Tag>
        </div>
        <h2 className="text-lg font-semibold text-slate-100 leading-snug">{a.title}</h2>
        {a.display_name && <div className="text-xs text-slate-400 mt-1">Affects {a.display_name}</div>}
      </div>

      {a.blocked_reason && (
        <div className="mx-5 mt-4 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-200">
          <Lock size={14} className="flex-shrink-0 mt-0.5" /> {a.blocked_reason}. Give someone else that access first, then the plan job will unblock it.
        </div>
      )}
      {a.error && (
        <div className="mx-5 mt-4 flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs text-red-200">
          <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" /> {a.error}
        </div>
      )}

      <div className="px-5 py-4">
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Why this is proposed</div>
        <ul className="space-y-2">
          {a.reasons.map((r) => (
            <li key={r.finding_id} className="flex gap-2 text-sm text-slate-300 leading-relaxed">
              <span className={`mt-2 w-1.5 h-1.5 rounded-full flex-shrink-0 ${r.severity === 'high' ? 'bg-red-400' : r.severity === 'medium' ? 'bg-amber-400' : 'bg-slate-500'}`} />
              <span>{r.detail}<span className="text-[11px] text-slate-500 ml-2">{r.finding_type.replace(/_/g, ' ')}</span></span>
            </li>
          ))}
        </ul>
      </div>

      {s && (
        <div className="px-5 pb-4">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Simulated impact</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="Risk points removed" value={s.risk_points_removed} tone="text-emerald-300" />
            <Stat label="Access paths removed" value={s.paths_removed} />
            <Stat label="Memberships lost" value={s.memberships_lost} />
            <Stat label="Would lock out" value={s.lockouts} tone={s.lockouts ? 'text-amber-300' : 'text-slate-100'} />
          </div>
          {(a.impact?.score_changes.length ?? 0) > 0 && (
            <div className="mt-3 divide-y divide-slate-800 rounded-lg border border-slate-800">
              {a.impact!.score_changes.map((c) => (
                <div key={c.canonical_id} className="px-3 py-2 flex items-center gap-3 text-sm">
                  <span className="text-slate-200 flex-1 truncate">{c.display_name}</span>
                  <BandPill band={c.band_before} /><span className="text-slate-500 text-xs">{c.score_before} to {c.score_after}</span><BandPill band={c.band_after} />
                </div>
              ))}
            </div>
          )}
          {(a.impact?.lockouts.length ?? 0) > 0 && (
            <div className="mt-2 text-xs text-amber-300">Nobody else could reach: {a.impact!.lockouts.map((l) => l.resource).join(', ')}</div>
          )}
        </div>
      )}

      <div className="px-5 py-4 border-t border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-wider text-slate-500">Approvals</div>
          <div className="text-xs text-slate-400">{a.approvals_count} of {need}</div>
        </div>
        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden mb-3">
          <div className="h-full bg-emerald-400 transition-all duration-500" style={{ width: `${Math.min(100, (100 * a.approvals_count) / need)}%` }} />
        </div>
        {a.requested_by && (
          <div className="text-xs text-slate-400 mb-2">Requested by {a.requested_by} {fmtTime(a.requested_at)}{a.request_note ? `: "${a.request_note}"` : ''}</div>
        )}
        {approvals.length === 0 ? <div className="text-xs text-slate-500">No votes yet. The person who requests a change can never approve it.</div> : (
          <ul className="space-y-1.5">
            {approvals.map((v) => (
              <li key={v.approval_id} className="flex items-start gap-2 text-xs">
                {v.verdict === 'approve' ? <CheckCircle2 size={13} className="text-emerald-400 mt-0.5" /> : <XCircle size={13} className="text-red-400 mt-0.5" />}
                <span className="text-slate-300">{v.approver}</span>
                <span className="text-slate-500">{fmtTime(v.decided_at)}</span>
                {v.action_hash !== a.action_hash && <Tag tone="amber">for an older version</Tag>}
                {v.comment && <span className="text-slate-400">"{v.comment}"</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {(modes.length > 0 || notice || error) && (
        <div className="px-5 py-4 border-t border-slate-800 bg-slate-900/30">
          {notice && <div className="mb-3 flex items-center gap-2 text-xs text-teal-200"><ShieldCheck size={13} /> {notice}</div>}
          {error && <div className="mb-3"><ErrorBanner message={error} /></div>}
          {m ? (
            <div className="space-y-2">
              <label className="block text-xs text-slate-400">{m.field}{m.required ? '' : ' (optional)'}</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={1000} placeholder={m.placeholder}
                className="w-full rounded-lg bg-slate-950/60 border border-slate-700/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-teal-500/60 transition-colors" />
              <div className="flex gap-2">
                <button disabled={busy || (m.required && !text.trim())} onClick={submit}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors disabled:opacity-40 ${m.style}`}>
                  <m.icon size={13} /> {busy ? 'Saving' : m.label}
                </button>
                <button onClick={() => { setMode(null); setText(''); }} className="px-3 py-1.5 rounded-lg text-sm text-slate-400 hover:bg-slate-800 transition-colors">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {modes.map((k) => {
                const Icon = MODE[k].icon;
                return (
                  <button key={k} onClick={() => setMode(k)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${k === modes[0] ? MODE[k].style : 'border border-slate-700/60 text-slate-300 hover:bg-slate-800'}`}>
                    <Icon size={13} /> {MODE[k].label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {outbox.length > 0 && (
        <div className="px-5 py-4 border-t border-slate-800">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">Execution</div>
          <ul className="space-y-1.5">
            {outbox.map((o) => (
              <li key={o.outbox_id} className="flex flex-wrap items-center gap-2 text-xs">
                {o.operation === 'rollback' ? <RotateCcw size={13} className="text-amber-300" /> : <Send size={13} className="text-teal-300" />}
                <span className="text-slate-300 capitalize">{o.operation}</span>
                <Tag tone={o.status === 'done' ? 'green' : o.status === 'failed' ? 'red' : 'teal'}>{o.status}</Tag>
                {o.execution_mode && <Tag tone={o.execution_mode === 'live' ? 'red' : 'slate'}>{o.execution_mode === 'live' ? 'live' : 'dry run'}</Tag>}
                <span className="text-slate-500">attempt {o.attempts} · {fmtTime(o.updated_at)}</span>
                {o.error && <span className="text-red-300">{o.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Json title="Exact change" value={a.change} />
      <Json title="Request sent to the directory" value={a.provider_request} />
      <Json title="State before the change" value={a.before_state} />
      <Json title="Rollback plan" value={a.inverse} />
    </Card>
  );
}
