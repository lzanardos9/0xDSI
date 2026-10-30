import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { AlertTriangle, Loader2, Inbox } from 'lucide-react';
import './identity.css';

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
  ENABLED: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30 [--dot:theme(colors.emerald.400)]',
  SUSPENDED: 'text-amber-300 bg-amber-500/10 border-amber-500/30 [--dot:theme(colors.amber.400)]',
  LOCKED: 'text-orange-300 bg-orange-500/10 border-orange-500/30 [--dot:theme(colors.orange.400)]',
  DISABLED: 'text-slate-300 bg-slate-500/10 border-slate-500/30 [--dot:theme(colors.slate.400)]',
  DELETED: 'text-red-300 bg-red-500/10 border-red-500/30 [--dot:theme(colors.red.400)]',
  UNKNOWN: 'text-sky-300 bg-sky-500/10 border-sky-500/30 [--dot:theme(colors.sky.400)]',
};

export function StatePill({ state }: { state: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium tracking-wide ${STATE_STYLE[state] || STATE_STYLE.UNKNOWN}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-[var(--dot)] shadow-[0_0_8px_var(--dot)]" />
      {state}
    </span>
  );
}

const TAG_TONES = {
  slate: 'text-slate-300 bg-slate-700/30 border-slate-600/40',
  blue: 'text-sky-300 bg-sky-500/10 border-sky-500/30',
  teal: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
  amber: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
  red: 'text-red-300 bg-red-500/10 border-red-500/30',
  green: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
};

export function Tag({ children, tone = 'slate' }: { children: ReactNode; tone?: keyof typeof TAG_TONES }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium leading-4 ${TAG_TONES[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`id-card ${/\b(absolute|fixed)\b/.test(className) ? '' : 'relative'} ${className}`}>{children}</div>;
}

export function PageHeader({ icon: Icon, title, subtitle, actions }: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-6 mb-8">
      <div className="flex items-start gap-4 min-w-0">
        <div className="id-icon-tile flex-shrink-0">
          <Icon size={22} className="text-teal-200" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-teal-300/80">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shadow-[0_0_10px_rgba(45,212,191,0.9)]" />
            Identity
          </div>
          <h1 className="id-title text-2xl lg:text-[28px] font-semibold tracking-tight leading-tight mt-1">{title}</h1>
          <p className="text-sm text-slate-400 mt-2 max-w-3xl leading-relaxed">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
  );
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="p-6 space-y-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-4">
        <Loader2 size={15} className="animate-spin text-teal-300" /> {label}
      </div>
      <div className="id-skeleton h-4 w-2/3" />
      <div className="id-skeleton h-4 w-full" />
      <div className="id-skeleton h-4 w-5/6" />
    </div>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl border border-red-500/30 bg-gradient-to-r from-red-500/15 to-red-500/5 text-sm text-red-100 shadow-[0_10px_30px_-15px_rgba(239,68,68,0.5)]">
      <div className="w-8 h-8 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center flex-shrink-0">
        <AlertTriangle size={15} className="text-red-300" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">Could not load identity data</div>
        <div className="text-red-200/80 mt-0.5 break-words">{message}</div>
      </div>
      {onRetry && (
        <button onClick={onRetry} className="px-3 py-1.5 rounded-lg border border-red-400/40 text-red-100 hover:bg-red-500/20 transition-colors">
          Retry
        </button>
      )}
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center text-center py-16 px-6">
      <div className="relative w-14 h-14 mb-4">
        <div className="absolute inset-0 rounded-2xl bg-teal-500/10 blur-xl" />
        <div className="relative w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-700/60 to-slate-800/80 border border-slate-600/40 flex items-center justify-center">
          <Inbox size={22} className="text-slate-400" />
        </div>
      </div>
      <div className="text-slate-100 font-medium">{title}</div>
      <div className="text-slate-500 text-sm mt-1.5 max-w-md leading-relaxed">{hint}</div>
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
