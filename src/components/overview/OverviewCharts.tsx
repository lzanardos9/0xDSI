import { useId, useMemo, useState } from 'react';
import { HourPoint, SEVERITY_STYLE, Severity } from './overviewData';

export function Sparkline({ values, color, className = '' }: { values: number[]; color: string; className?: string }) {
  const id = useId().replace(/:/g, '');
  const { line, area } = useMemo(() => {
    if (values.length < 2) return { line: '', area: '' };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 28 - ((v - min) / span) * 24]);
    const l = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
    return { line: l, area: `${l} L100,32 L0,32 Z` };
  }, [values]);
  if (!line) return <div className={className} />;
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className={className} aria-hidden>
      <defs>
        <linearGradient id={`sp-${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sp-${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function ScoreRing({ score, color, size = 148 }: { score: number; color: string; size?: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="7" />
        <circle
          cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - score / 100)}
          style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1), stroke .6s', filter: `drop-shadow(0 0 6px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold text-slate-50 tabular-nums leading-none">{score}</span>
        <span className="mt-1 text-[10px] uppercase tracking-[0.18em] text-slate-400">of 100</span>
      </div>
    </div>
  );
}

const SERIES: { key: 'critical' | 'high' | 'other'; label: string; color: string }[] = [
  { key: 'other', label: 'Routine', color: '#38bdf8' },
  { key: 'high', label: 'High', color: '#fb923c' },
  { key: 'critical', label: 'Critical', color: '#f87171' },
];

export function ActivityChart({ data }: { data: HourPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600;
  const H = 200;
  const maxOther = Math.max(...data.map((d) => d.other), 1);
  const maxRisk = Math.max(...data.map((d) => d.high + d.critical), 1);
  const x = (i: number) => (i / (data.length - 1)) * W;
  const path = (vals: number[], max: number, h: number) =>
    vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${(H - (v / max) * h).toFixed(1)}`).join(' ');
  const routine = path(data.map((d) => d.other), maxOther, H * 0.82);
  const high = path(data.map((d) => d.high + d.critical), maxRisk, H * 0.55);
  const crit = path(data.map((d) => d.critical), maxRisk, H * 0.55);
  const p = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-52"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const i = Math.round(((e.clientX - rect.left) / rect.width) * (data.length - 1));
          setHover(Math.max(0, Math.min(data.length - 1, i)));
        }}
      >
        <defs>
          {SERIES.map((s) => (
            <linearGradient key={s.key} id={`ov-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={s.key === 'other' ? 0.22 : 0.4} />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="rgba(148,163,184,0.08)" strokeDasharray="3 5" />
        ))}
        <path d={`${routine} L${W},${H} L0,${H} Z`} fill="url(#ov-other)" />
        <path d={routine} fill="none" stroke="#38bdf8" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d={`${high} L${W},${H} L0,${H} Z`} fill="url(#ov-high)" />
        <path d={high} fill="none" stroke="#fb923c" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        <path d={`${crit} L${W},${H} L0,${H} Z`} fill="url(#ov-critical)" />
        <path d={crit} fill="none" stroke="#f87171" strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
        {hover != null && (
          <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="rgba(226,232,240,0.35)" vectorEffect="non-scaling-stroke" />
        )}
      </svg>
      {p && hover != null && (
        <div
          className="pointer-events-none absolute top-2 z-10 rounded-lg border border-slate-700/70 bg-slate-950/95 px-3 py-2 text-xs shadow-xl animate-fade-in"
          style={{ left: `${(hover / (data.length - 1)) * 100}%`, transform: `translateX(${hover > data.length / 2 ? '-105%' : '5%'})` }}
        >
          <p className="font-medium text-slate-200 mb-1">
            {new Date(p.hour).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-red-300 tabular-nums">{p.critical} critical</p>
          <p className="text-orange-300 tabular-nums">{p.high} high</p>
          <p className="text-sky-300 tabular-nums">{p.other.toLocaleString()} routine</p>
        </div>
      )}
      <div className="mt-2 flex justify-between text-[10px] text-slate-500 tabular-nums">
        {data.filter((_, i) => i % 6 === 0).map((d) => (
          <span key={d.hour}>{new Date(d.hour).toLocaleTimeString([], { hour: '2-digit' })}</span>
        ))}
        <span>Now</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-400">
        {SERIES.slice().reverse().map((s) => (
          <span key={s.key} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function SeverityDonut({ counts }: { counts: Record<Severity, number> }) {
  const order: Severity[] = ['critical', 'high', 'medium', 'low'];
  const total = order.reduce((a, k) => a + counts[k], 0) || 1;
  const r = 38;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-6">
      <div className="relative h-32 w-32 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="10" />
          {order.map((k) => {
            const len = (counts[k] / total) * c;
            const el = (
              <circle
                key={k} cx="50" cy="50" r={r} fill="none" stroke={SEVERITY_STYLE[k].stroke} strokeWidth="10"
                strokeDasharray={`${Math.max(len - 1.5, 0)} ${c}`} strokeDashoffset={-offset}
                style={{ transition: 'stroke-dasharray .8s ease, stroke-dashoffset .8s ease' }}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold text-slate-50 tabular-nums">{total}</span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">open</span>
        </div>
      </div>
      <ul className="flex-1 space-y-2.5">
        {order.map((k) => (
          <li key={k} className="flex items-center gap-3 text-sm">
            <span className={`h-2 w-2 rounded-full ${SEVERITY_STYLE[k].dot}`} />
            <span className="text-slate-300 flex-1">{SEVERITY_STYLE[k].label}</span>
            <span className="text-slate-100 font-medium tabular-nums">{counts[k]}</span>
            <span className="w-10 text-right text-xs text-slate-500 tabular-nums">{Math.round((counts[k] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
