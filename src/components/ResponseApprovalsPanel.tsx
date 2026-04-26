import { useEffect, useState } from 'react';
import { ShieldAlert, CheckCircle2, XCircle, Clock, AlertTriangle, User } from 'lucide-react';
import {
  listPendingApprovals,
  approveAction,
  rejectAction,
  type ResponseActionApproval,
} from '../lib/responseApprovals';

function formatTimeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

const actionTypeColor: Record<string, { bg: string; fg: string; border: string }> = {
  isolate_host: { bg: 'bg-rose-500/15', fg: 'text-rose-300', border: 'border-rose-500/40' },
  block_ip: { bg: 'bg-amber-500/15', fg: 'text-amber-300', border: 'border-amber-500/40' },
  disable_user: { bg: 'bg-blue-500/15', fg: 'text-blue-300', border: 'border-blue-500/40' },
  rotate_credentials: { bg: 'bg-emerald-500/15', fg: 'text-emerald-300', border: 'border-emerald-500/40' },
};

export function ResponseApprovalsPanel() {
  const [approvals, setApprovals] = useState<ResponseActionApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const data = await listPendingApprovals();
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
    const interval = setInterval(() => { void load(); }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleApprove = async (approval: ResponseActionApproval) => {
    setBusyId(approval.id);
    try {
      await approveAction(approval.action_id);
      await load();
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rejection failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-400" />
            <h2 className="text-xl font-bold text-white">Response Action Approvals</h2>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Approve or reject high-impact automated response actions before they execute.
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/60 rounded-lg border border-slate-700/50">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-300">{approvals.length} pending</span>
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
      ) : approvals.length === 0 ? (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-8 text-center">
          <CheckCircle2 className="w-10 h-10 text-emerald-500/60 mx-auto mb-2" />
          <p className="text-slate-300 font-medium">No pending approvals</p>
          <p className="text-xs text-slate-500 mt-1">All response actions are either auto-executed or already reviewed.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((approval) => {
            const colors = actionTypeColor[approval.action_type] ?? {
              bg: 'bg-slate-600/15', fg: 'text-slate-300', border: 'border-slate-500/40',
            };
            return (
              <div
                key={approval.id}
                className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-5 hover:border-slate-600/60 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${colors.bg} ${colors.fg} ${colors.border}`}>
                        {approval.action_type}
                      </span>
                      <span className="text-xs text-slate-500">
                        Action ID: <code className="text-slate-400">{approval.action_id.slice(0, 12)}</code>
                      </span>
                      <span className="text-xs text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatTimeAgo(approval.requested_at)}
                      </span>
                    </div>

                    <div className="mt-3">
                      <div className="text-sm font-semibold text-white">
                        Target: <span className="font-mono text-amber-300">{approval.target_entity || 'unspecified'}</span>
                      </div>
                      {Object.keys(approval.scope_summary || {}).length > 0 && (
                        <pre className="mt-2 text-xs text-slate-400 bg-slate-900/60 border border-slate-700/40 rounded-lg p-3 overflow-x-auto">
                          {JSON.stringify(approval.scope_summary, null, 2)}
                        </pre>
                      )}
                    </div>

                    <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                      <User className="w-3 h-3" />
                      Requested by agent. TTL {approval.ttl_minutes}m.
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Optional rejection reason..."
                    value={rejectionReason[approval.id] ?? ''}
                    onChange={(e) =>
                      setRejectionReason({ ...rejectionReason, [approval.id]: e.target.value })
                    }
                    className="flex-1 px-3 py-1.5 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-500"
                  />
                  <button
                    onClick={() => handleReject(approval)}
                    disabled={busyId === approval.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600/20 text-rose-300 border border-rose-500/30 rounded-lg text-sm font-medium hover:bg-rose-600/30 transition-colors disabled:opacity-50"
                  >
                    <XCircle className="w-4 h-4" /> Reject
                  </button>
                  <button
                    onClick={() => handleApprove(approval)}
                    disabled={busyId === approval.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Approve
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
