import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Loader2, Inbox } from 'lucide-react';

export const PROVIDER_LABEL: Record<string, string> = {
  active_directory: 'Active Directory',
  entra_id: 'Entra ID',
  ping_directory: 'PingDirectory',
  saviynt: 'Saviynt',
  duo: 'Duo',
  app_local: 'App-local',
};

export const providerLabel = (p: string) => PROVIDER_LABEL[p] || p;

const STATE_STYLE: Record<string, string> = {
  ENABLED: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  SUSPENDED: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  LOCKED: 'text-orange-300 bg-orange-500/10 border-orange-500/30',
  DISABLED: 'text-slate-300 bg-slate-500/10 border-slate-500/30',
  DELETED: 'text-red-300 bg-red-500/10 border-red-500/30',
  UNKNOWN: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
};

export function StatePill({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium tracking-wide ${STATE_STYLE[state] || STATE_STYLE.UNKNOWN}`}>
      {state}
    </span>
  );
}

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'blue' | 'teal' | 'amber' | 'red' | 'green' }) {
  const tones = {
    slate: 'text-slate-300 bg-slate-700/40 border-slate-600/40',
    blue: 'text-blue-300 bg-blue-500/10 border-blue-500/30',
    teal: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
    amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
    red: 'text-red-300 bg-red-500/10 border-red-500/30',
    green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
  };
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[11px] ${tones[tone]}`}>{children}</span>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`bg-[#0F1D32] border border-slate-700/50 rounded-xl ${className}`}>{children}</div>;
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
          <Icon size={20} className="text-teal-300" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-100 leading-tight">{title}</h1>
          <p className="text-sm text-slate-400 mt-1 max-w-2xl leading-relaxed">{subtitle}</p>
        </div>
      </div>
      {actions}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-slate-400 text-sm">
      <Loader2 size={16} className="animate-spin" /> {label}
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-200">
      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <div className="font-medium">Could not load identity data</div>
        <div className="text-red-300/80 mt-0.5">{message}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1 rounded-md border border-red-400/40 hover:bg-red-500/20 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center text-center py-14 px-6">
      <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mb-3">
        <Inbox size={20} className="text-slate-500" />
      </div>
      <div className="text-slate-200 font-medium">{title}</div>
      <div className="text-slate-500 text-sm mt-1 max-w-md leading-relaxed">{hint}</div>
    </div>
  );
}

export const fmtTime = (v: string | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
};

export const FINDING_LABEL: Record<string, string> = {
  state_conflict: 'State conflict across directories',
  orphan_nhi: 'Orphaned non-human identity',
  unlinked_nhi: 'Non-human identity without GRC app link',
  unverified_agent: 'Unverified agent',
  unmapped_state: 'Unmapped provider state',
  blocked_match: 'Match blocked by safety rule',
};
