import { useEffect, useMemo, useState } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  User,
  ChevronRight,
  X,
  Activity,
  Target,
  Crosshair,
  RotateCcw,
  Zap,
  Bot,
  Link2,
} from 'lucide-react';
import {
  listAllApprovals,
  approveAction,
  rejectAction,
  type ResponseActionApproval,
  type ApprovalStatus,
} from '../lib/responseApprovals';

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const actionTypeColor: Record<string, { bg: string; fg: string; border: string }> = {
  isolate_host: { bg: 'bg-rose-500/15', fg: 'text-rose-300', border: 'border-rose-500/40' },
  block_ip: { bg: 'bg-amber-500/15', fg: 'text-amber-300', border: 'border-amber-500/40' },
  disable_user: { bg: 'bg-blue-500/15', fg: 'text-blue-300', border: 'border-blue-500/40' },
  rotate_credentials: { bg: 'bg-emerald-500/15', fg: 'text-emerald-300', border: 'border-emerald-500/40' },
};

const statusColor: Record<ApprovalStatus, { bg: string; fg: string; border: string; label: string }> = {
  pending: { bg: 'bg-amber-500/15', fg: 'text-amber-300', border: 'border-amber-500/40', label: 'Pending' },
  approved: { bg: 'bg-sky-500/15', fg: 'text-sky-300', border: 'border-sky-500/40', label: 'Approved' },
  executed: { bg: 'bg-emerald-500/15', fg: 'text-emerald-300', border: 'border-emerald-500/40', label: 'Executed' },
  rejected: { bg: 'bg-rose-500/15', fg: 'text-rose-300', border: 'border-rose-500/40', label: 'Rejected' },
  expired: { bg: 'bg-slate-500/15', fg: 'text-slate-300', border: 'border-slate-500/40', label: 'Expired' },
};

type Filter = 'all' | ApprovalStatus;

function riskBarColor(score: number): string {
  if (score >= 90) return 'bg-rose-500';
  if (score >= 70) return 'bg-amber-500';
  if (score >= 40) return 'bg-sky-500';
  return 'bg-emerald-500';
}

export function ResponseApprovalsPanel() {
  const [approvals, setApprovals] = useState<ResponseActionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('pending');
  const [selected, setSelected] = useState<ResponseActionApproval | null>(null);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await listAllApprovals();
      setApprovals(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load approvals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const interval = setInterval(() => { void load(); }, 15_000);
    return () => clearInterval(interval);
  }, []);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: approvals.length };
    for (const a of approvals) c[a.status] = (c[a.status] ?? 0) + 1;
    return c;
  }, [approvals]);

  const visible = useMemo(() => {
    if (filter === 'all') return approvals;
    return approvals.filter((a) => a.status === filter);
  }, [approvals, filter]);

  const handleApprove = async (approval: ResponseActionApproval) => {
    setBusyId(approval.id);
    try {
      await approveAction(approval.action_id);
      await load();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Approval failed');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (approval: ResponseActionApproval) => {
    const reason = rejectionReason[approval.id]?.trim() || 'No reason provided';
    setBusyId(approval.id);
    try {
      await rejectAction(approval.action_id, reason);
      await load();
      setSelected(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Response Action Approvals</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Human-in-the-loop gate for high-impact autonomous response. Click any row for the WHY drilldown.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['pending', 'approved', 'executed', 'rejected', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filter === f
                  ? 'bg-slate-700 border-slate-500 text-white'
                  : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'all' ? 'All' : statusColor[f].label}
              <span className="ml-1.5 text-[10px] text-slate-500">{counts[f] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-sm text-rose-300">
          <AlertTriangle className="w-4 h-4" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center text-slate-400">
          Loading approvals...
        </div>
      ) : visible.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-2" />
          <p className="text-slate-300 font-medium">Nothing to show in this view</p>
          <p className="text-xs text-slate-500 mt-1">Try a different filter.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((approval) => {
            const colors = actionTypeColor[approval.action_type] ?? {
              bg: 'bg-slate-600/15', fg: 'text-slate-300', border: 'border-slate-500/40',
            };
            const stat = statusColor[approval.status];
            const scope = approval.scope_summary as Record<string, unknown>;
            const why = (scope?.why as string) ?? 'No rationale recorded.';
            const risk = Number((scope?.risk_score as number) ?? 0);
            const agent = (scope?.requested_by_agent as string) ?? 'autonomous-agent';
            const trigger = scope?.trigger as Record<string, unknown> | undefined;
            const confidence = trigger ? Number(trigger.confidence ?? 0) : 0;
            return (
              <button
                key={approval.id}
                onClick={() => setSelected(approval)}
                className="w-full text-left bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 hover:border-slate-500/60 hover:bg-slate-800/80 transition-all group"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colors.bg} ${colors.fg} ${colors.border}`}>
                        {approval.action_type}
                      </span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${stat.bg} ${stat.fg} ${stat.border}`}>
                        {stat.label}
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(approval.requested_at)}
                      </span>
                      {confidence > 0 && (
                        <span className="text-xs text-slate-500">
                          conf <span className="text-slate-300 font-mono">{confidence}%</span>
                        </span>
                      )}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white truncate">
                      Target: <span className="font-mono text-amber-300">{approval.target_entity || 'unspecified'}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 line-clamp-2">{why}</p>
                    <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1"><Bot className="w-3 h-3" />{agent}</span>
                      {risk > 0 && (
                        <span className="flex items-center gap-2">
                          risk
                          <span className="inline-flex w-20 h-1.5 bg-slate-700 rounded overflow-hidden">
                            <span className={`${riskBarColor(risk)}`} style={{ width: `${risk}%` }} />
                          </span>
                          <span className="font-mono text-slate-300">{risk}</span>
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-300 transition-colors mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <DrilldownModal
          approval={selected}
          busy={busyId === selected.id}
          rejectionReason={rejectionReason[selected.id] ?? ''}
          onChangeReason={(v) => setRejectionReason({ ...rejectionReason, [selected.id]: v })}
          onClose={() => setSelected(null)}
          onApprove={() => handleApprove(selected)}
          onReject={() => handleReject(selected)}
        />
      )}
    </div>
  );
}

interface DrilldownProps {
  approval: ResponseActionApproval;
  busy: boolean;
  rejectionReason: string;
  onChangeReason: (v: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}

function DrilldownModal({ approval, busy, rejectionReason, onChangeReason, onClose, onApprove, onReject }: DrilldownProps) {
  const scope = (approval.scope_summary ?? {}) as Record<string, unknown>;
  const why = (scope.why as string) ?? 'No rationale recorded.';
  const trigger = (scope.trigger as Record<string, unknown>) ?? {};
  const blast = (scope.blast_radius as Record<string, unknown>) ?? {};
  const mitre = (scope.mitre as string[]) ?? [];
  const evidence = (scope.evidence_links as string[]) ?? [];
  const risk = Number((scope.risk_score as number) ?? 0);
  const reversibility = (scope.reversibility as string) ?? 'unknown';
  const agent = (scope.requested_by_agent as string) ?? 'autonomous-agent';
  const recommended = (scope.recommended_action as string) ?? '';
  const latency = Number((scope.estimated_latency_ms as number) ?? 0);
  const stat = statusColor[approval.status];
  const exec = approval.execution_result as Record<string, unknown> | null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 p-5 bg-slate-900 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border bg-slate-700/40 text-slate-300 border-slate-600">
                {approval.action_type}
              </span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${stat.bg} ${stat.fg} ${stat.border}`}>
                {stat.label}
              </span>
              <code className="text-xs text-slate-500">{approval.action_id}</code>
            </div>
            <h3 className="mt-2 text-lg font-bold text-white">
              Target: <span className="font-mono text-amber-300">{approval.target_entity}</span>
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <section className="bg-amber-500/5 border border-amber-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
              <Zap className="w-4 h-4" /> Why this action
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">{why}</p>
            {recommended && (
              <p className="mt-3 text-xs text-slate-400">
                <span className="text-slate-500 uppercase tracking-wider">Recommended:</span> {recommended}
              </p>
            )}
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-bold uppercase tracking-wider mb-3">
                <Activity className="w-4 h-4" /> Trigger
              </div>
              <div className="space-y-1.5 text-xs">
                {Object.entries(trigger).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-mono text-slate-200 truncate">{String(v)}</span>
                  </div>
                ))}
                {Object.keys(trigger).length === 0 && (
                  <span className="text-slate-500">No trigger metadata.</span>
                )}
              </div>
            </section>

            <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-300 text-xs font-bold uppercase tracking-wider mb-3">
                <Target className="w-4 h-4" /> Blast radius
              </div>
              <div className="space-y-1.5 text-xs">
                {Object.entries(blast).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-slate-500">{k}</span>
                    <span className="font-mono text-slate-200 truncate text-right">
                      {Array.isArray(v) ? v.join(', ') : String(v)}
                    </span>
                  </div>
                ))}
                {Object.keys(blast).length === 0 && (
                  <span className="text-slate-500">No blast-radius metadata.</span>
                )}
              </div>
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Risk score</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold text-white">{risk}</span>
                <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                  <div className={riskBarColor(risk)} style={{ width: `${risk}%`, height: '100%' }} />
                </div>
              </div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 flex items-center gap-1">
                <RotateCcw className="w-3 h-3" /> Reversibility
              </div>
              <div className="text-sm text-slate-200 font-mono break-words">{reversibility}</div>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
              <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Estimated latency</div>
              <div className="text-2xl font-bold text-white">{latency}<span className="text-sm text-slate-500 ml-1">ms</span></div>
            </div>
          </div>

          {mitre.length > 0 && (
            <section>
              <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
                <Crosshair className="w-3.5 h-3.5" /> MITRE ATT&amp;CK
              </div>
              <div className="flex flex-wrap gap-2">
                {mitre.map((t) => (
                  <span key={t} className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs font-mono text-slate-200">
                    {t}
                  </span>
                ))}
              </div>
            </section>
          )}

          {evidence.length > 0 && (
            <section>
              <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
                <Link2 className="w-3.5 h-3.5" /> Evidence
              </div>
              <div className="space-y-1">
                {evidence.map((e) => (
                  <div key={e} className="text-xs font-mono text-sky-300 bg-slate-800/50 border border-slate-700/40 rounded px-3 py-1.5">
                    {e}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider mb-2">
              <Bot className="w-3.5 h-3.5" /> Requested by
            </div>
            <div className="text-sm font-mono text-slate-200">{agent}</div>
            <div className="mt-1 text-[11px] text-slate-500 flex items-center gap-1">
              <User className="w-3 h-3" /> TTL {approval.ttl_minutes}m · requested {formatTimeAgo(approval.requested_at)}
            </div>
          </section>

          {exec && Object.keys(exec).length > 0 && (
            <section className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
                <CheckCircle2 className="w-4 h-4" /> Execution result
              </div>
              <pre className="text-xs text-slate-200 bg-slate-900/60 border border-slate-700/40 rounded-lg p-3 overflow-x-auto">
{JSON.stringify(exec, null, 2)}
              </pre>
            </section>
          )}

          {approval.status === 'rejected' && approval.rejection_reason && (
            <section className="bg-rose-500/5 border border-rose-500/30 rounded-xl p-4">
              <div className="flex items-center gap-2 text-rose-300 text-xs font-bold uppercase tracking-wider mb-2">
                <XCircle className="w-4 h-4" /> Rejection reason
              </div>
              <p className="text-sm text-slate-200">{approval.rejection_reason}</p>
            </section>
          )}

          {approval.status === 'pending' && (
            <section className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <label className="text-xs text-slate-400 uppercase tracking-wider block mb-2">
                Decision
              </label>
              <input
                type="text"
                placeholder="Optional rejection reason..."
                value={rejectionReason}
                onChange={(e) => onChangeReason(e.target.value)}
                className="w-full px-3 py-2 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500 mb-3"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={onReject}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-600/20 text-rose-300 border border-rose-500/30 rounded-lg text-sm font-medium hover:bg-rose-600/30 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
                <button
                  onClick={onApprove}
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" /> Approve &amp; Execute
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
