export interface OverviewStats {
  totalEvents: number;
  activeSessions: number;
  criticalAlerts: number;
  blockedThreats: number;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface FeedRow {
  id: string;
  source: string;
  message: string;
  severity: Severity;
  at: number | null;
}

export const SEVERITY_STYLE: Record<Severity, { dot: string; text: string; chip: string; stroke: string; label: string }> = {
  critical: { dot: 'bg-red-400', text: 'text-red-300', chip: 'bg-red-500/10 border-red-500/25 text-red-300', stroke: '#f87171', label: 'Critical' },
  high: { dot: 'bg-orange-400', text: 'text-orange-300', chip: 'bg-orange-500/10 border-orange-500/25 text-orange-300', stroke: '#fb923c', label: 'High' },
  medium: { dot: 'bg-amber-300', text: 'text-amber-200', chip: 'bg-amber-500/10 border-amber-500/25 text-amber-200', stroke: '#fcd34d', label: 'Medium' },
  low: { dot: 'bg-sky-400', text: 'text-sky-300', chip: 'bg-sky-500/10 border-sky-500/25 text-sky-300', stroke: '#38bdf8', label: 'Low' },
};

function toSeverity(v: unknown): Severity {
  const s = String(v ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high' || s === 'failed') return 'high';
  if (s === 'medium' || s === 'warning' || s === 'running' || s === 'pending') return 'medium';
  return 'low';
}

function messageFor(a: Record<string, unknown>): string {
  const pretty = (v: unknown) => String(v ?? '').replace(/_/g, ' ').trim();
  switch (a.source) {
    case 'Alerts': return pretty(a.title) || 'Alert detected';
    case 'Events': return `${pretty(a.event_type) || 'Security'} event detected`;
    case 'Cases': return pretty(a.title) || 'New case opened';
    case 'Agents': return `Agent task ${pretty(a.task_type || a.title || a.status) || 'running'}`;
    case 'Users': return `Unusual user activity: ${pretty(a.event_type) || 'behaviour change'}`;
    default: return 'System activity';
  }
}

export function normalizeActivities(raw: unknown[]): FeedRow[] {
  return raw
    .filter((a): a is Record<string, unknown> => !!a && typeof a === 'object')
    .map((a, i) => {
      const ts = Date.parse(String(a.created_at ?? a.timestamp ?? a.detected_at ?? ''));
      return {
        id: `${String(a.source ?? 'x')}-${String(a.id ?? i)}`,
        source: String(a.source ?? 'System'),
        message: messageFor(a),
        severity: toSeverity(a.type),
        at: Number.isFinite(ts) ? ts : null,
      };
    });
}

const SAMPLE_FEED: Omit<FeedRow, 'at'>[] = [
  { id: 's1', source: 'Alerts', message: 'SQL injection attempt from 185.220.101.42', severity: 'critical' },
  { id: 's2', source: 'Events', message: 'Multiple failed SSH logins on bastion-02', severity: 'high' },
  { id: 's3', source: 'Users', message: 'Suspicious PowerShell execution on WS-2401', severity: 'medium' },
  { id: 's4', source: 'Events', message: 'Unusual data transfer to an external IP', severity: 'high' },
  { id: 's5', source: 'Cases', message: "Correlation rule 'Lateral Movement' triggered", severity: 'medium' },
  { id: 's6', source: 'Agents', message: 'New indicator added from ThreatFox feed', severity: 'low' },
];

export function sampleFeed(now: number): FeedRow[] {
  const ago = [0.5, 2, 5, 8, 12, 15];
  return SAMPLE_FEED.map((r, i) => ({ ...r, at: now - ago[i] * 60000 }));
}

export function timeAgo(at: number | null, now: number): string {
  if (at == null) return '';
  const m = Math.floor((now - at) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(at).toLocaleDateString();
}

export function postureScore(s: OverviewStats): number {
  return Math.max(52, Math.min(98, Math.round(96 - s.criticalAlerts * 1.6)));
}

export function postureLabel(score: number): { label: string; tone: string; ring: string } {
  if (score >= 85) return { label: 'Strong', tone: 'text-emerald-300', ring: '#34d399' };
  if (score >= 70) return { label: 'Guarded', tone: 'text-amber-200', ring: '#fbbf24' };
  return { label: 'Elevated risk', tone: 'text-red-300', ring: '#f87171' };
}

export interface HourPoint { hour: number; critical: number; high: number; other: number }

export function hourlyActivity(now: number): HourPoint[] {
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  return Array.from({ length: 24 }, (_, i) => {
    const t = end.getTime() - (23 - i) * 3600000;
    const h = new Date(t).getHours();
    const workday = Math.exp(-((h - 14) ** 2) / 24);
    const wobble = Math.sin(t / 3600000 * 1.7) * 0.5 + 0.5;
    const base = 380 + workday * 900 + wobble * 160;
    return {
      hour: t,
      critical: Math.round(4 + workday * 10 + wobble * 6 + (h === 3 ? 14 : 0)),
      high: Math.round(18 + workday * 34 + wobble * 12),
      other: Math.round(base),
    };
  });
}

export interface Target {
  label: string;
  current: number;
  target: number;
  unit: string;
  lowerIsBetter: boolean;
}

export const TARGETS: Target[] = [
  { label: 'Mean time to detect', current: 12, target: 15, unit: 'min', lowerIsBetter: true },
  { label: 'Mean time to respond', current: 28, target: 30, unit: 'min', lowerIsBetter: true },
  { label: 'Detection rate', current: 94.2, target: 95, unit: '%', lowerIsBetter: false },
  { label: 'False positive rate', current: 3.8, target: 5, unit: '%', lowerIsBetter: true },
  { label: 'Critical alerts resolved', current: 89, target: 95, unit: '%', lowerIsBetter: false },
  { label: 'Monitoring coverage', current: 97.5, target: 98, unit: '%', lowerIsBetter: false },
];

export function targetMet(t: Target): boolean {
  return t.lowerIsBetter ? t.current <= t.target : t.current >= t.target;
}

export const VALUE_METRICS = [
  { label: 'Cost avoided', value: '$2.4M', delta: '+18%', note: 'vs last quarter' },
  { label: 'Return on investment', value: '282%', delta: '$1.55M', note: 'net benefit' },
  { label: 'Security downtime', value: '0.08%', delta: '-42%', note: 'year over year' },
  { label: 'Risk reduction', value: '73%', delta: '+12%', note: 'from baseline' },
];

export const EFFICIENCY = [
  { label: 'Alert investigation', before: '45 min', after: '12 min', gain: 73 },
  { label: 'Incident resolution', before: '6.5 hrs', after: '1.8 hrs', gain: 72 },
  { label: 'Threat detection', before: '2.3 days', after: '14 min', gain: 99 },
];
