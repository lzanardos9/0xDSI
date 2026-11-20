import { useEffect, useState } from 'react';
import { Bot, Loader2, PenLine, RotateCcw, ShieldCheck, UserCheck, X } from 'lucide-react';
import { goLiveApi, type GoLiveDecisionType, type GoLiveItem } from '../../lib/goLiveApi';
import { fmtTime } from './identityUi';
import { StateBadge } from './GoLiveReadiness';

interface Props {
  item: GoLiveItem;
  canDecide: boolean;
  onClose: () => void;
  onDecided: () => void;
}

export default function GoLiveCheckDrawer({ item, canDecide, onClose, onDecided }: Props) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState<GoLiveDecisionType | null>(null);
  const [error, setError] = useState('');

  useEffect(() => { setNote(''); setError(''); }, [item.id]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const canSign = item.kind === 'signoff' && item.state !== 'signed';
  const canWaive = item.severity === 'advisory' && !['pass', 'waived'].includes(item.state);
  const canRevoke = !!item.decision;

  const decide = async (decision: GoLiveDecisionType) => {
    setSaving(decision);
    setError('');
    try {
      await goLiveApi.decide(item.id, decision, note);
      setNote('');
      onDecided();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={item.title}>
      <button className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]" onClick={onClose} aria-label="Close" />
      <aside className="relative w-full max-w-md h-full overflow-y-auto bg-slate-900 border-l border-slate-700/60 shadow-2xl p-6 animate-[slideIn_260ms_cubic-bezier(.2,.8,.2,1)]">
        <style>{'@keyframes slideIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}@keyframes fadeIn{from{opacity:0}to{opacity:1}}'}</style>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-slate-500">{item.group}</div>
            <h3 className="text-lg font-semibold text-slate-100 mt-1 leading-snug">{item.title}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors" aria-label="Close panel"><X size={16} /></button>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-5">
          <StateBadge state={item.state} />
          <span className={`px-2 py-0.5 rounded-full text-[11px] border ${item.severity === 'blocker' ? 'border-rose-500/30 text-rose-200' : 'border-amber-500/30 text-amber-200'}`}>
            {item.severity === 'blocker' ? 'Blocker' : 'Advisory'}
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-slate-600/50 text-slate-300">
            {item.kind === 'auto' ? <><Bot size={11} /> Measured automatically</> : <><UserCheck size={11} /> Needs a person to sign</>}
          </span>
        </div>

        <section className="space-y-4 text-sm">
          <div>
            <div className="text-xs text-slate-500 mb-1">What this proves</div>
            <p className="text-slate-200 leading-relaxed">{item.why}</p>
          </div>
          {item.detail && (
            <div>
              <div className="text-xs text-slate-500 mb-1">Latest result</div>
              <p className="text-slate-200 leading-relaxed rounded-lg bg-slate-950/50 border border-slate-700/40 px-3 py-2">{item.detail}</p>
            </div>
          )}
          {item.decision && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2.5">
              <div className="text-xs text-emerald-200 capitalize">{item.decision.decision} by {item.decision.decided_by || 'unknown'} - {fmtTime(item.decision.decided_at)}</div>
              {item.decision.note && <p className="text-slate-200 mt-1 leading-relaxed">{item.decision.note}</p>}
            </div>
          )}
        </section>

        {canDecide && (canSign || canWaive || canRevoke) && (
          <section className="mt-6 pt-5 border-t border-slate-700/50">
            {(canSign || canWaive) && (
              <>
                <label htmlFor="golive-note" className="text-xs text-slate-400">{canSign ? 'Evidence (ticket, test report, approver)' : 'Why it is acceptable to go live without this'}</label>
                <textarea id="golive-note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000}
                  className="mt-1 w-full rounded-lg bg-slate-950/60 border border-slate-700/60 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-teal-500/60 focus:ring-2 focus:ring-teal-500/20 transition"
                  placeholder="At least 10 characters" />
              </>
            )}
            {error && <p className="text-sm text-rose-300 mt-2">{error}</p>}
            <div className="flex flex-wrap gap-2 mt-3">
              {canSign && (
                <button onClick={() => decide('signed')} disabled={!!saving || note.trim().length < 10}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving === 'signed' ? <Loader2 size={14} className="animate-spin" /> : <PenLine size={14} />} Sign off
                </button>
              )}
              {canWaive && (
                <button onClick={() => decide('waived')} disabled={!!saving || note.trim().length < 10}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-sky-500/40 text-sky-100 hover:bg-sky-500/10 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                  {saving === 'waived' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Accept risk
                </button>
              )}
              {canRevoke && (
                <button onClick={() => decide('revoked')} disabled={!!saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-600/60 text-slate-300 hover:bg-slate-800 text-sm transition-colors disabled:opacity-40">
                  {saving === 'revoked' ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />} Revoke decision
                </button>
              )}
            </div>
            {item.severity === 'blocker' && item.kind === 'auto' && item.state !== 'pass' && (
              <p className="text-xs text-slate-500 mt-3">Blockers cannot be waived. Fix the cause and press Re-check.</p>
            )}
          </section>
        )}
        {!canDecide && (item.kind === 'signoff' || item.severity === 'advisory') && (
          <p className="text-xs text-slate-500 mt-6">Only admins can sign or waive checks.</p>
        )}
      </aside>
    </div>
  );
}
