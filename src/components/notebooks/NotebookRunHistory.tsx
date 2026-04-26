import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, XCircle, Clock, Download, FileCode } from 'lucide-react';
import { listRecentRuns, NotebookRun } from '../../lib/notebookRuns';

const statusStyles: Record<string, { icon: typeof Activity; bg: string; fg: string; border: string }> = {
  succeeded: { icon: CheckCircle2, bg: 'bg-emerald-600/15', fg: 'text-emerald-400', border: 'border-emerald-500/30' },
  failed: { icon: XCircle, bg: 'bg-rose-600/15', fg: 'text-rose-400', border: 'border-rose-500/30' },
  running: { icon: Activity, bg: 'bg-blue-600/15', fg: 'text-blue-400', border: 'border-blue-500/30' },
  queued: { icon: Clock, bg: 'bg-slate-600/15', fg: 'text-slate-400', border: 'border-slate-500/30' },
  cancelled: { icon: XCircle, bg: 'bg-amber-600/15', fg: 'text-amber-400', border: 'border-amber-500/30' },
};

const runTypeIcon: Record<string, typeof Activity> = {
  export: Download,
  manual: FileCode,
  scheduled: Clock,
  api: Activity,
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function NotebookRunHistory() {
  const [runs, setRuns] = useState<NotebookRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await listRecentRuns(50);
        if (!cancelled) setRuns(data);
      } catch (err) {
        console.warn('Failed to load notebook runs:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 text-sm text-slate-400">
        Loading run history...
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 text-sm text-slate-400 text-center">
        No notebook runs yet. Exports and scheduled jobs appear here.
      </div>
    );
  }

  return (
    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-slate-400" />
          <h3 className="text-sm font-semibold text-white">Recent Notebook Runs</h3>
        </div>
        <span className="text-xs text-slate-500">{runs.length} runs</span>
      </div>

      <div className="divide-y divide-slate-700/40 max-h-[420px] overflow-y-auto">
        {runs.map((run) => {
          const style = statusStyles[run.status] ?? statusStyles.queued;
          const TypeIcon = runTypeIcon[run.run_type] ?? Activity;
          const StatusIcon = style.icon;
          return (
            <div key={run.id} className="px-5 py-3 hover:bg-slate-800/60 transition-colors">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center flex-shrink-0">
                  <TypeIcon className="w-4 h-4 text-slate-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white truncate">
                      {run.notebook_title || run.notebook_id}
                    </span>
                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${style.bg} ${style.fg} ${style.border}`}>
                      {run.run_type}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {run.error_message
                      ? <span className="text-rose-400">{run.error_message}</span>
                      : run.duration_seconds > 0
                        ? `${run.duration_seconds}s | ${run.rows_processed.toLocaleString()} rows`
                        : 'No metrics'}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`flex items-center gap-1 text-xs font-medium ${style.fg}`}>
                    <StatusIcon className="w-3.5 h-3.5" />
                    {run.status}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">{formatRelative(run.created_at)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
