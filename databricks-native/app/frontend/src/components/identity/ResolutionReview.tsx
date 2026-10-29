import { useCallback, useEffect, useState } from 'react';
import { GitMerge, Check, X, ArrowLeftRight, ShieldCheck } from 'lucide-react';
import { identityApi, ReviewItem, StewardDecision } from '../../lib/identityApi';
import { Card, PageHeader, Loading, ErrorBanner, Empty, StatePill, Tag, fmtTime, providerLabel } from './identityUi';

function parseFeatures(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export default function ResolutionReview() {
  const [reviews, setReviews] = useState<ReviewItem[] | null>(null);
  const [recent, setRecent] = useState<StewardDecision[]>([]);
  const [error, setError] = useState('');
  const [active, setActive] = useState<ReviewItem | null>(null);

  const load = useCallback(() => {
    setError('');
    identityApi
      .reviews()
      .then((r) => { setReviews(r.reviews); setRecent(r.recent_decisions); })
      .catch((e: Error) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 p-6">
      <div className="max-w-6xl mx-auto">
        <PageHeader
          icon={GitMerge}
          title="Resolution Review"
          subtitle="Possible matches the resolver will not link on its own. Accepting requires a note with the evidence. Decisions take effect on the next resolver run and can be traced in each identity's history."
        />

        {error && <ErrorBanner message={error} onRetry={load} />}
        {!error && reviews === null && <Loading label="Loading review queue" />}

        {reviews && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-3">
              {reviews.length === 0 ? (
                <Card><Empty title="Review queue is clear" hint="No ambiguous matches are waiting. New ones appear after each resolver run." /></Card>
              ) : (
                reviews.map((r) => (
                  <button key={r.decision_id} onClick={() => setActive(r)} className="w-full text-left">
                    <Card className="p-4 hover:border-teal-500/50 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <Tag tone="amber">{r.rule.replace(/_/g, ' ')}</Tag>
                        <span className="text-xs text-slate-400">{Math.round(Number(r.confidence) * 100)}% similarity</span>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                        <Side name={r.left_name} provider={r.left_provider} tenant={r.left_tenant} email={r.left_email} persona={r.left_persona} state={r.left_state} />
                        <ArrowLeftRight size={16} className="text-slate-600" />
                        <Side name={r.right_name} provider={r.right_provider} tenant={r.right_tenant} email={r.right_email} persona={r.right_persona} state={r.right_state} />
                      </div>
                    </Card>
                  </button>
                ))
              )}
            </div>

            <Card className="p-5 h-fit">
              <div className="text-sm font-medium text-slate-200 mb-3 flex items-center gap-2"><ShieldCheck size={14} className="text-teal-300" /> Recent steward decisions</div>
              {recent.length === 0 ? (
                <div className="text-xs text-slate-500">No decisions yet.</div>
              ) : (
                <ul className="space-y-3">
                  {recent.map((d) => (
                    <li key={d.steward_decision_id} className="text-xs">
                      <div className="flex items-center gap-2">
                        <Tag tone={d.verdict === 'accept' ? 'green' : 'red'}>{d.verdict === 'accept' ? 'Linked' : 'Kept separate'}</Tag>
                        <span className="text-slate-500">{fmtTime(d.decided_at)}</span>
                      </div>
                      <div className="text-slate-400 mt-1">{d.reviewer}</div>
                      {d.note && <div className="text-slate-500 mt-0.5 italic">"{d.note}"</div>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )}
      </div>
      {active && <DecisionModal item={active} onClose={() => setActive(null)} onDone={() => { setActive(null); load(); }} />}
    </div>
  );
}

function Side(p: { name: string | null; provider: string; tenant: string; email: string | null; persona: string; state: string }) {
  return (
    <div className="min-w-0">
      <div className="text-slate-100 text-sm font-medium truncate">{p.name || 'Unnamed'}</div>
      <div className="text-xs text-slate-400 truncate">{providerLabel(p.provider)} · {p.tenant}</div>
      <div className="text-xs text-slate-500 font-mono truncate">{p.email || '—'}</div>
      <div className="flex gap-1.5 mt-1.5"><Tag>{p.persona}</Tag><StatePill state={p.state} /></div>
    </div>
  );
}

function DecisionModal({ item, onClose, onDone }: { item: ReviewItem; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'accept' | 'reject' | null>(null);
  const [error, setError] = useState('');
  const features = parseFeatures(item.features);

  const submit = async (verdict: 'accept' | 'reject') => {
    if (verdict === 'accept' && !note.trim()) {
      setError('Add a note describing the evidence before linking these accounts.');
      return;
    }
    setBusy(verdict);
    setError('');
    try {
      await identityApi.decide(item.decision_id, verdict, note.trim());
      onDone();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-[#0B1730] border border-slate-700 rounded-2xl shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="text-base font-semibold text-slate-100">Are these the same identity?</div>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-800 text-slate-400"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-4"><Side name={item.left_name} provider={item.left_provider} tenant={item.left_tenant} email={item.left_email} persona={item.left_persona} state={item.left_state} /></Card>
            <Card className="p-4"><Side name={item.right_name} provider={item.right_provider} tenant={item.right_tenant} email={item.right_email} persona={item.right_persona} state={item.right_state} /></Card>
          </div>
          {Object.keys(features).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">Evidence the resolver found</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(features).map(([k, v]) => (
                  <Tag key={k}>{k.replace(/_/g, ' ')}: {typeof v === 'object' ? JSON.stringify(v) : String(v)}</Tag>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs uppercase tracking-wider text-slate-500 mb-2 block">Reviewer note</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="e.g. Confirmed with HR record W-2207; same person, name change after marriage."
              className="w-full bg-[#0A1628] border border-slate-700 focus:border-teal-500 rounded-lg p-3 text-sm outline-none transition-colors placeholder-slate-600"
            />
          </div>
          {error && <div className="text-sm text-red-300">{error}</div>}
        </div>
        <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-3">
          <button
            onClick={() => submit('reject')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 disabled:opacity-60 text-sm transition-colors"
          >
            <X size={14} /> {busy === 'reject' ? 'Saving' : 'Keep separate'}
          </button>
          <button
            onClick={() => submit('accept')}
            disabled={busy !== null}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-60 text-sm font-medium transition-colors"
          >
            <Check size={14} /> {busy === 'accept' ? 'Saving' : 'Link as same identity'}
          </button>
        </div>
      </div>
    </div>
  );
}
