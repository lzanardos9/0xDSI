import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, PenLine, RefreshCw, Rocket, ShieldAlert, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';
import { goLiveApi, DONE_STATES, type GoLiveItem, type GoLiveReport, type GoLiveState, type GoLiveVerdict } from '../../lib/goLiveApi';
import { Card, ErrorBanner, Loading, PageHeader, fmtTime } from './identityUi';
import GoLiveCheckDrawer from './GoLiveCheckDrawer';

export const STATE_STYLE: Record<GoLiveState, { label: string; icon: LucideIcon; tone: string }> = {
  pass: { label: 'Passing', icon: CheckCircle2, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  signed: { label: 'Signed', icon: PenLine, tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30' },
  waived: { label: 'Waived', icon: ShieldCheck, tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  warn: { label: 'Needs attention', icon: AlertTriangle, tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  pending: { label: 'Awaiting sign-off', icon: CircleDashed, tone: 'text-slate-300 bg-slate-500/10 border-slate-500/30' },
  fail: { label: 'Failing', icon: XCircle, tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
  unknown: { label: 'Not measured', icon: CircleDashed, tone: 'text-slate-400 bg-slate-500/10 border-slate-600/40' },
};

const VERDICT: Record<GoLiveVerdict, { label: string; hint: string; ring: string; text: string; icon: LucideIcon }> = {
  go: { label: 'Ready to go live', hint: 'Every blocker passes or is signed, and no advisory is open.', ring: '#34d399', text: 'text-emerald-200', icon: Rocket },
  go_with_risks: { label: 'Go, with accepted risks', hint: 'All blockers are cleared. Some advisories are still open; waive them with a reason or fix them.', ring: '#fbbf24', text: 'text-amber-200', icon: ShieldCheck },
  no_go: { label: 'Not ready', hint: 'At least one blocker is failing, unmeasured or unsigned.', ring: '#fb7185', text: 'text-rose-200', icon: ShieldAlert },
};

function ScoreRing({ score, color }: { score: number; color: string }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 128 128" className="w-32 h-32 shrink-0" role="img" aria-label={`Readiness ${score} percent`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="10" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)} transform="rotate(-90 64 64)"
        style={{ transition: 'stroke-dashoffset 900ms cubic-bezier(.2,.8,.2,1)' }} />
      <text x="64" y="62" textAnchor="middle" className="fill-slate-100" style={{ fontSize: 28, fontWeight: 600 }}>{score}</text>
      <text x="64" y="82" textAnchor="middle" className="fill-slate-400" style={{ fontSize: 11 }}>percent</text>
    </svg>
  );
}

export function StateBadge({ state }: { state: GoLiveState }) {
  const s = STATE_STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium whitespace-nowrap ${s.tone}`}>
      <s.icon size={11} /> {s.label}
    </span>
  );
}

export default function GoLiveReadiness() {
  const [report, setReport] = useState<GoLiveReport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open'>('all');

  const load = useCallback(() => {
    setBusy(true);
    setError('');
    goLiveApi.report()
      .then(setReport)
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => {
    const out = new Map<string, GoLiveItem[]>();
    (report?.items ?? [])
      .filter((i) => filter === 'all' || !DONE_STATES.includes(i.state))
      .forEach((i) => out.set(i.group, [...(out.get(i.group) ?? []), i]));
    return [...out.entries()];
  }, [report, filter]);

  const current = report?.items.find((i) => i.id === selected) ?? null;
  const v = report ? VERDICT[report.verdict] : null;

  return (
    <div className="identity-page">
      <PageHeader
        icon={Rocket}
        title="Go-Live Readiness"
        subtitle="One place to decide whether this deployment can carry production load. Automated checks are measured live; manual checks need a named person to sign them."
        actions={
          <button onClick={load} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 text-sm text-slate-300 hover:bg-slate-800 transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> Re-check
          </button>
        }
      />

      {error && <ErrorBanner message={error} onRetry={load} />}
      {!report && !error && <Loading label="Measuring readiness" />}

      {report && v && (
        <>
          {report.sample && (
            <div className="flex items-start gap-2 mb-4 px-4 py-3 rounded-xl border border-sky-500/30 bg-sky-500/5 text-sm text-sky-100">
              <FlaskConical size={15} className="mt-0.5 shrink-0" />
              <span>Automated checks show a sample staging environment. Sign-offs you record here are saved for real.</span>
            </div>
          )}

          <Card className="p-6 mb-6 overflow-hidden relative">
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full blur-3xl opacity-20 pointer-events-none" style={{ background: v.ring }} />
            <div className="flex flex-col md:flex-row md:items-center gap-6 relative">
              <ScoreRing score={report.score} color={v.ring} />
              <div className="flex-1 min-w-0">
                <div className={`flex items-center gap-2 text-2xl font-semibold ${v.text}`}><v.icon size={22} /> {v.label}</div>
                <p className="text-sm text-slate-400 mt-1 max-w-xl leading-relaxed">{v.hint}</p>
                <p className="text-xs text-slate-500 mt-3">Measured {fmtTime(report.evaluated_at)}{report.can_decide ? '' : ' - you can view but not sign'}</p>
              </div>
              <div className="grid grid-cols-3 gap-3 md:w-80">
                {[
                  { label: 'Blockers open', value: report.blockers_open.length, tone: report.blockers_open.length ? 'text-rose-200' : 'text-emerald-200' },
                  { label: 'Advisories open', value: report.advisories_open.length, tone: report.advisories_open.length ? 'text-amber-200' : 'text-emerald-200' },
                  { label: 'Cleared', value: report.items.filter((i) => DONE_STATES.includes(i.state)).length, tone: 'text-slate-100' },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3">
                    <div className={`text-2xl font-semibold ${s.tone}`}>{s.value}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 leading-tight">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="flex items-center gap-2 mb-4">
            {(['all', 'open'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${filter === f ? 'border-teal-500/50 bg-teal-500/10 text-teal-100' : 'border-slate-700/50 text-slate-400 hover:text-slate-200 hover:border-slate-600'}`}>
                {f === 'all' ? 'All checks' : 'Still open'}
              </button>
            ))}
          </div>

          {groups.length === 0 && (
            <Card className="p-8 text-center text-slate-300">
              <CheckCircle2 className="mx-auto text-emerald-300 mb-2" size={28} />
              Nothing is open. Every check is passing, signed or waived.
            </Card>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {groups.map(([group, items]) => (
              <Card key={group} className="p-4">
                <div className="text-xs uppercase tracking-wider text-slate-500 mb-3">{group}</div>
                <ul className="space-y-2">
                  {items.map((i) => (
                    <li key={i.id}>
                      <button onClick={() => setSelected(i.id)}
                        className="w-full text-left flex items-center gap-3 rounded-lg border border-slate-700/40 bg-slate-950/30 px-3 py-2.5 hover:border-slate-500/60 hover:bg-slate-900/60 hover:-translate-y-px transition-all duration-200">
                        <span className={`w-1.5 self-stretch rounded-full ${i.severity === 'blocker' ? 'bg-rose-400/70' : 'bg-amber-300/60'}`} aria-hidden />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-slate-100 truncate">{i.title}</span>
                          <span className="block text-xs text-slate-500 truncate">{i.detail || i.why}</span>
                        </span>
                        <StateBadge state={i.state} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}

      {current && report && (
        <GoLiveCheckDrawer item={current} canDecide={report.can_decide} onClose={() => setSelected(null)} onDecided={load} />
      )}
    </div>
  );
}
