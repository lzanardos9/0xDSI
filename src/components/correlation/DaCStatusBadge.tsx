import {
  GitBranch, FlaskConical, Server, Rocket,
  Archive, AlertOctagon, CheckCircle, Clock,
  XCircle, MessageSquare
} from 'lucide-react';

const DAC_STATUS_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string; border: string }> = {
  draft: { label: 'Draft', icon: GitBranch, bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-500/30' },
  testing: { label: 'Testing', icon: FlaskConical, bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30' },
  staging: { label: 'Staging', icon: Server, bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/30' },
  production: { label: 'Production', icon: Rocket, bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
  deprecated: { label: 'Deprecated', icon: AlertOctagon, bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30' },
  archived: { label: 'Archived', icon: Archive, bg: 'bg-slate-600/15', text: 'text-slate-400', border: 'border-slate-600/30' },
};

const REVIEW_STATUS_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string }> = {
  approved: { label: 'Approved', icon: CheckCircle, bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  pending_review: { label: 'Pending Review', icon: Clock, bg: 'bg-amber-500/10', text: 'text-amber-400' },
  rejected: { label: 'Rejected', icon: XCircle, bg: 'bg-red-500/10', text: 'text-red-400' },
  changes_requested: { label: 'Changes Requested', icon: MessageSquare, bg: 'bg-orange-500/10', text: 'text-orange-400' },
};

const TEST_RESULT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pass: { label: 'Pass', bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
  fail: { label: 'Fail', bg: 'bg-red-500/10', text: 'text-red-400' },
  untested: { label: 'Untested', bg: 'bg-slate-500/10', text: 'text-slate-400' },
};

const FORMAT_CONFIG: Record<string, { label: string; color: string }> = {
  sigma: { label: 'Sigma', color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20' },
  splunk_spl: { label: 'SPL', color: 'text-green-400 bg-green-500/10 border-green-500/20' },
  elastic_kql: { label: 'KQL', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  custom: { label: 'Custom', color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

export const DaCLifecycleBadge = ({ status }: { status: string }) => {
  const cfg = DAC_STATUS_CONFIG[status] || DAC_STATUS_CONFIG.draft;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

export const ReviewBadge = ({ status }: { status: string }) => {
  const cfg = REVIEW_STATUS_CONFIG[status] || REVIEW_STATUS_CONFIG.pending_review;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

export const TestResultBadge = ({ result }: { result: string }) => {
  const cfg = TEST_RESULT_CONFIG[result] || TEST_RESULT_CONFIG.untested;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
};

export const VersionBadge = ({ version }: { version: string }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
    <GitBranch className="w-3 h-3" />
    v{version}
  </span>
);

export const FormatBadge = ({ format }: { format: string }) => {
  const cfg = FORMAT_CONFIG[format] || FORMAT_CONFIG.custom;
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border ${cfg.color}`}>
      {cfg.label}
    </span>
  );
};

export const GitRefBadge = ({ gitRef }: { gitRef: string }) => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-700/50 text-slate-400 border border-slate-600/30" title={gitRef}>
    <GitBranch className="w-3 h-3" />
    {gitRef.substring(0, 7)}
  </span>
);

export { DAC_STATUS_CONFIG, REVIEW_STATUS_CONFIG, FORMAT_CONFIG };
