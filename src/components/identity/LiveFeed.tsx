import { useMemo, useState } from 'react';
import { Pause, Play, Radio, Route, Sparkles } from 'lucide-react';
import type { LiveEvent } from '../../lib/identityApi';
import { AnimatedNumber, TONE_COLOR, describeLiveEvent, timeAgo, useNow, type LiveState } from './identityLive';

type Filter = 'all' | 'risky' | 'access' | 'sign_in';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'risky', label: 'Needs a look' },
  { id: 'access', label: 'Access' },
  { id: 'sign_in', label: 'Sign-ins & MFA' },
];

const BUCKETS = 24;
const BUCKET_MS = 20000;

function matches(e: LiveEvent, f: Filter) {
  if (f === 'all') return true;
  if (f === 'risky') { const t = describeLiveEvent(e).tone; return t === 'warn' || t === 'alert'; }
  if (f === 'access') return e.category === 'access' || e.category === 'account' || e.category === 'credential';
  return e.category === 'sign_in' || e.category === 'mfa';
}

function Pulse({ events, now }: { events: LiveEvent[]; now: number }) {
  const bars = useMemo(() => {
    const b = Array.from({ length: BUCKETS }, () => ({ n: 0, hot: false }));
    for (const e of events) {
      const i = BUCKETS - 1 - Math.floor((now - new Date(e.occurred_at).getTime()) / BUCKET_MS);
      if (i < 0 || i >= BUCKETS) continue;
      b[i].n += 1;
      const t = describeLiveEvent(e).tone;
      if (t === 'warn' || t === 'alert') b[i].hot = true;
    }
    return b;
  }, [events, now]);
  const max = Math.max(1, ...bars.map((b) => b.n));
  return (
    <div className="flex items-end gap-[3px] h-9" aria-hidden="true">
      {bars.map((b, i) => (
        <span key={i} className="flex-1 rounded-sm id-bar-in"
          style={{
            height: `${b.n ? 18 + (b.n / max) * 82 : 8}%`,
            background: b.n ? (b.hot ? 'linear-gradient(to top, rgba(248,113,113,0.35), #f87171)' : 'linear-gradient(to top, rgba(45,212,191,0.3), #5eead4)') : 'rgba(148,163,184,0.12)',
            boxShadow: b.n && i === BUCKETS - 1 ? '0 0 10px rgba(94,234,212,0.6)' : undefined,
            animationDelay: `${i * 18}ms`,
          }} />
      ))}
    </div>
  );
}

export function LiveEventRow({ e, now, isNew, onMap, onHover, onSelect, compact = false }: {
  e: LiveEvent; now: number; isNew: boolean; onMap?: boolean; compact?: boolean;
  onHover?: (on: boolean) => void; onSelect?: () => void;
}) {
  const v = describeLiveEvent(e);
  const color = TONE_COLOR[v.tone];
  const Icon = v.icon;
  const body = (
    <>
      <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      <span className="relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 border"
        style={{ background: `${color}14`, borderColor: `${color}40` }}>
        {isNew && <span className="absolute inset-0 rounded-xl animate-ping opacity-30" style={{ background: color }} />}
        <Icon size={14} style={{ color }} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`text-[13px] font-medium text-slate-100 ${compact ? 'truncate' : 'line-clamp-2'}`}>{v.title}</span>
          <span className="ml-auto text-[10px] text-slate-500 whitespace-nowrap tabular-nums">{timeAgo(e.occurred_at, now)}</span>
        </span>
        <span className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-400 min-w-0">
          <span className="truncate">{v.subtitle}</span>
          {onMap && <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-teal-300/90"><Route size={10} /> on map</span>}
        </span>
      </span>
    </>
  );
  const cls = `relative w-full text-left flex items-start gap-3 pl-3.5 pr-3 py-2.5 rounded-xl transition-colors ${isNew ? 'id-live-enter id-live-new bg-slate-800/40' : ''}`;
  if (!onSelect) return <div className={cls}>{body}</div>;
  return (
    <button type="button" className={`${cls} hover:bg-slate-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60`}
      onMouseEnter={() => onHover?.(true)} onMouseLeave={() => onHover?.(false)} onFocus={() => onHover?.(true)} onBlur={() => onHover?.(false)} onClick={onSelect}>
      {body}
    </button>
  );
}

export function LiveBadge({ mode, paused = false }: { mode: 'demo' | 'live' | undefined; paused?: boolean }) {
  const color = paused ? '#94a3b8' : mode === 'demo' ? '#fbbf24' : '#34d399';
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-semibold uppercase tracking-[0.14em]"
      style={{ color, borderColor: `${color}55`, background: `${color}12` }}>
      <span className="relative flex w-1.5 h-1.5">
        {!paused && <span className="absolute inset-0 rounded-full animate-ping" style={{ background: color }} />}
        <span className="relative w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      </span>
      {paused ? 'Paused' : mode === 'demo' ? 'Sample live' : 'Live'}
    </span>
  );
}

export default function LiveFeed({ live, mapped, onHoverEvent, onSelectEvent, className = '' }: {
  live: LiveState;
  mapped: (e: LiveEvent) => boolean;
  onHoverEvent: (e: LiveEvent | null) => void;
  onSelectEvent: (e: LiveEvent) => void;
  className?: string;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const now = useNow(4000);
  const shown = live.events.filter((e) => matches(e, filter));
  const risky = live.events.filter((e) => matches(e, 'risky')).length;

  return (
    <div className={`id-card relative rounded-2xl overflow-hidden flex flex-col ${className}`}>
      <div className="absolute -top-20 -right-16 w-56 h-56 rounded-full bg-teal-400/10 blur-3xl pointer-events-none" />
      <div className="relative px-4 pt-4 pb-3 border-b border-slate-700/40">
        <div className="flex items-center gap-3">
          <span className="relative w-9 h-9 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center overflow-hidden">
            <span className="id-radar absolute inset-0" style={{ background: 'conic-gradient(from 0deg, transparent 70%, rgba(94,234,212,0.45))' }} />
            <Radio size={15} className="relative text-teal-200" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-100">Live feed</h2>
              <LiveBadge mode={live.meta?.mode} paused={live.paused} />
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {live.meta ? <><AnimatedNumber value={live.meta.events_24h} className="text-slate-300 font-medium" /> identity events in the last 24 hours</> : 'Connecting…'}
            </p>
          </div>
          <button type="button" onClick={() => live.setPaused(!live.paused)} aria-label={live.paused ? 'Resume feed' : 'Pause feed'}
            className="ml-auto p-2 rounded-lg border border-slate-700/60 text-slate-300 hover:bg-slate-800 transition-colors">
            {live.paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
        </div>
        <div className="mt-3 flex items-end gap-3">
          <div className="flex-1"><Pulse events={live.events} now={now} /></div>
          <div className="text-right">
            <div className="text-lg font-semibold leading-none text-amber-200"><AnimatedNumber value={risky} /></div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">need a look</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 mt-3">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} aria-pressed={filter === f.id}
              className={`px-2.5 py-1 rounded-full text-[11px] border transition-colors ${filter === f.id ? 'border-teal-400/50 bg-teal-500/15 text-teal-100' : 'border-slate-700/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative flex-1 min-h-0 overflow-y-auto px-1.5 py-1.5 space-y-0.5">
        {live.error && !live.events.length ? (
          <div className="px-4 py-8 text-center text-xs text-red-300">{live.error}</div>
        ) : !live.meta ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="id-skeleton h-12 rounded-xl" />)}</div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500">Nothing here yet. New activity appears as it happens.</div>
        ) : shown.map((e) => (
          <LiveEventRow key={e.event_id} e={e} now={now} isNew={live.freshIds.has(e.event_id)} onMap={mapped(e)}
            onHover={(on) => onHoverEvent(on ? e : null)} onSelect={() => onSelectEvent(e)} />
        ))}
      </div>

      <div className="relative px-4 py-2.5 border-t border-slate-700/40 text-[10px] text-slate-500 flex items-center gap-1.5">
        <Sparkles size={11} className="text-slate-600" />
        {live.meta?.mode === 'demo'
          ? 'Sample activity generated for the preview. Click an event to trace it on the map.'
          : 'From your identity event feed. Click an event to trace it on the map.'}
      </div>
    </div>
  );
}
