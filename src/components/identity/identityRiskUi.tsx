import { ArrowRight, Building2, KeyRound, ShieldAlert, Users, UserRound } from 'lucide-react';
import type { AttackPath, RiskBand, Severity } from '../../lib/identityApi';

export const BAND_STYLE: Record<RiskBand, { text: string; bg: string; bar: string; ring: string }> = {
  critical: { text: 'text-red-300', bg: 'bg-red-500/10 border-red-500/40', bar: 'bg-red-400', ring: 'ring-red-500/40' },
  high: { text: 'text-orange-300', bg: 'bg-orange-500/10 border-orange-500/40', bar: 'bg-orange-400', ring: 'ring-orange-500/40' },
  medium: { text: 'text-amber-300', bg: 'bg-amber-500/10 border-amber-500/40', bar: 'bg-amber-400', ring: 'ring-amber-500/40' },
  low: { text: 'text-emerald-300', bg: 'bg-emerald-500/10 border-emerald-500/40', bar: 'bg-emerald-400', ring: 'ring-emerald-500/40' },
};

export function BandPill({ band }: { band: RiskBand }) {
  const s = BAND_STYLE[band] || BAND_STYLE.low;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-medium uppercase tracking-wider ${s.text} ${s.bg}`}>
      {band}
    </span>
  );
}

export const SEVERITY_TONE: Record<Severity, 'red' | 'amber' | 'slate'> = { high: 'red', medium: 'amber', low: 'slate' };

const EDGE_LABEL: Record<string, string> = {
  member_of: 'member of',
  nested_in: 'nested in',
  grants: 'grants',
  can_take_over: 'can take over',
};

const STEP_ICON = { account: UserRound, group: Users, resource: Building2 };

export function PathChain({ path }: { path: AttackPath }) {
  return (
    <div className="flex flex-wrap items-center gap-y-2">
      {path.steps.map((s, i) => {
        const Icon = s.kind === 'account' && s.persona_type === 'privileged' ? KeyRound : STEP_ICON[s.kind];
        const takeover = s.edge === 'can_take_over';
        const chip =
          s.kind === 'resource'
            ? 'border-red-500/40 bg-red-500/10 text-red-200'
            : s.kind === 'group'
              ? 'border-sky-500/30 bg-sky-500/10 text-sky-200'
              : 'border-slate-600/50 bg-slate-800/60 text-slate-200';
        return (
          <div key={`${s.id}-${i}`} className="flex items-center">
            {i > 0 && (
              <div className={`flex items-center gap-1 px-2 text-[10px] uppercase tracking-wider ${takeover ? 'text-red-300' : 'text-slate-500'}`}>
                {takeover && <ShieldAlert size={11} />}
                <span>{EDGE_LABEL[s.edge || ''] || s.edge}{s.permission ? ` (${s.permission})` : ''}</span>
                <ArrowRight size={11} />
              </div>
            )}
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md border text-xs ${chip}`} title={s.id}>
              <Icon size={12} />
              {s.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}
