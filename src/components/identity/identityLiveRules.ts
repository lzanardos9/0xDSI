// One rule for how urgent a live event is. identity_live.py RISKY_SQL mirrors the warn/alert cases.
import type { LiveEvent } from '../../lib/identityApi';

export type LiveTone = 'info' | 'notice' | 'warn' | 'alert';

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export function liveTone(e: Pick<LiveEvent, 'event_type' | 'detail'>): LiveTone {
  const d = e.detail || {};
  switch (e.event_type) {
    case 'sign_in_failure': { const c = text(d.country); return c && c !== 'US' ? 'warn' : 'notice'; }
    case 'mfa_denied': return (Number(d.attempts) || 1) >= 3 ? 'alert' : 'warn';
    case 'mfa_lockout': return 'alert';
    case 'mfa_reset':
    case 'hr_leaver': return 'warn';
    case 'password_reset': return text(d.path_id) ? 'alert' : 'notice';
    case 'entitlement_granted': return text(d.ticket) ? 'notice' : 'warn';
    case 'privilege_granted': return text(d.ticket) ? 'notice' : 'alert';
    case 'resource_access': return text(d.operation) === 'export' ? 'warn' : 'info';
    case 'account_created':
    case 'account_enabled':
    case 'hr_mover': return 'notice';
    default: return 'info';
  }
}

export const needsLook = (e: Pick<LiveEvent, 'event_type' | 'detail'>) => {
  const t = liveTone(e);
  return t === 'warn' || t === 'alert';
};
