import { useCallback, useEffect, useState } from 'react';
import { CheckCheck, ChevronRight, ClipboardList, Hourglass, Lock, PlayCircle, RefreshCw, Archive, Wrench, UserCheck } from 'lucide-react';
import { identityApi, type RemediationList, type RemediationStage } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime } from './identityUi';
import { SEVERITY_TONE } from './identityRiskUi';
import RemediationDetail, { STATUS } from './RemediationDetail';

const STAGES: { id: RemediationStage; label: string; icon: typeof Wrench; empty: string }[] = [
  { id: 'review', label: 'Proposed', icon: ClipboardList, empty: 'No open findings need a fix right now.' },
  { id: 'approval', label: 'Awaiting approval', icon: UserCheck, empty: 'Nothing is waiting for a decision.' },
  { id: 'in_progress', label: 'In progress', icon: PlayCircle, empty: 'Nothing is queued for the executor.' },
  { id: 'done', label: 'Done', icon: CheckCheck, empty: 'No changes have been carried out yet.' },
  { id: 'closed', label: 'Closed', icon: Archive, empty: 'No rejected, dismissed or failed actions.' },
];

export default function IdentityRemediation() {
  const [stage, setStage] = useState<RemediationStage>('review');
  const [data, setData] = useState<RemediationList | null>(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback((keepSelection = false) => {
    setError('');
    identityApi.remediation(stage)
      .then((d) => {
        setData(d);
        setSelected((cur) => (keepSelection && cur ? cur : d.actions[0]?.action_id ?? null));
      })
      .catch((e: Error) => setError(e.message));
  }, [stage]);

  useEffect(() => { setData(null); load(); }, [load]);

  const counts = data?.stages;
  const current = STAGES.find((s) => s.id === stage)!;

  return (
    <div className="p-6 lg:p-8 bg-[#0A1628] min-h-full">
      <PageHeader
        icon={Wrench}
        title="Identity Remediation"
        subtitle="Fixes proposed from open findings, each simulated first. Nothing changes until someone other than the requester approves it, and every executed change can be rolled back."
        actions={
          <button onClick={() => load(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 text-sm text-slate-300 hover:bg-slate-800 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {STAGES.map((s) => {
          const on = s.id === stage;
          return (
            <button key={s.id} onClick={() => setStage(s.id)}
              className={`text-left rounded-xl border p-4 transition-all duration-200 ${on ? 'border-teal-500/50 bg-teal-500/10 shadow-lg shadow-teal-900/20' : 'border-slate-700/50 bg-slate-900/40 hover:border-slate-600 hover:-translate-y-0.5'}`}>
              <div className="flex items-center gap-2 text-xs text-slate-400"><s.icon size={13} className={on ? 'text-teal-300' : ''} /> {s.label}</div>
              <div className={`text-2xl font-semibold mt-1 ${on ? 'text-teal-100' : 'text-slate-100'}`}>{counts ? counts[s.id] ?? 0 : '—'}</div>
            </button>
          );
        })}
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => load()} /></div>}
      {!data && !error && <Card><Loading label="Loading remediation" /></Card>}

      {data && (
        data.actions.length === 0 ? (
          <Card><Empty title={`No ${current.label.toLowerCase()} actions`} hint={current.empty} /></Card>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr] gap-6">
            <div className="space-y-3 self-start">
              {stage === 'review' && data.pending_points !== null && (
                <Card className="p-4 flex items-center gap-3">
                  <Hourglass size={16} className="text-teal-300" />
                  <div className="text-sm text-slate-300">Approving every proposal here would remove <span className="text-emerald-300 font-semibold">{data.pending_points}</span> risk points.</div>
                </Card>
              )}
              <Card className="overflow-hidden">
                <div className="divide-y divide-slate-800">
                  {data.actions.map((a) => {
                    const on = a.action_id === selected;
                    const st = STATUS[a.status];
                    return (
                      <button key={a.action_id} onClick={() => setSelected(a.action_id)}
                        className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${on ? 'bg-teal-500/10' : 'hover:bg-slate-800/50'}`}>
                        {a.status === 'blocked' ? <Lock size={14} className="text-amber-300 mt-1 flex-shrink-0" />
                          : <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${a.severity === 'high' ? 'bg-red-400' : a.severity === 'medium' ? 'bg-amber-400' : 'bg-slate-500'}`} />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-slate-100 leading-snug">{a.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Tag tone={st.tone}>{st.label}</Tag>
                            <Tag tone={SEVERITY_TONE[a.severity]}>{a.severity}</Tag>
                            {(a.impact.risk_points_removed ?? 0) > 0 && <Tag tone="green">-{a.impact.risk_points_removed} pts</Tag>}
                            {a.status === 'pending_approval' && <Tag>{a.approvals}/{a.required_approvals} approvals</Tag>}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1">{a.display_name ? `${a.display_name} · ` : ''}updated {fmtTime(a.updated_at)}</div>
                        </div>
                        <ChevronRight size={14} className={`mt-1 ${on ? 'text-teal-300' : 'text-slate-600'}`} />
                      </button>
                    );
                  })}
                </div>
              </Card>
            </div>
            <div>{selected && <RemediationDetail actionId={selected} onChanged={() => load(true)} />}</div>
          </div>
        )
      )}
    </div>
  );
}
