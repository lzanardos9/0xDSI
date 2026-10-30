import { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarRange, Pause, Play, Radio, Route, Sparkles, X } from 'lucide-react';
import { identityApi, type LiveBucket, type LiveEvent, type LiveHistogram, type LiveWindow } from '../../lib/identityApi';
import { AnimatedNumber, TONE_COLOR, describeLiveEvent, timeAgo, useNow, type LiveState } from './identityLive';
import { needsLook } from './identityLiveRules';

type Filter = 'all' | 'risky' | 'access' | 'sign_in';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'risky', label: 'Needs a look' },
  { id: 'access', label: 'Access' },
  { id: 'sign_in', label: 'Sign-ins & MFA' },
];

const WINDOWS: LiveWindow[] = ['10m', '1h', '24h'];
const HIST_POLL_MS = 10000;

interface Range { since: string; until: string }

function matches(e: LiveEvent, f: Filter) {
  if (f === 'all') return true;
  if (f === 'risky') return needsLook(e);
  if (f === 'access') return e.category === 'access' || e.category === 'account' || e.category === 'credential';
  return e.category === 'sign_in' || e.category === 'mfa';
}

const clock = (iso: string, seconds: boolean) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', ...(seconds ? { second: '2-digit' } : {}) });

function useHistogram(win: LiveWindow, paused: boolean) {
  const [hist, setHist] = useState<LiveHistogram | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const h = await identityApi.liveHistogram(win);
        if (!h || !Array.isArray(h.buckets)) throw new Error('The activity chart returned an unexpected response');
        if (alive) { setHist(h); setError(''); }
      } catch (e) {
        if (alive) setError((e as Error).message || 'Activity chart unavailable');
      }
      if (alive && !paused) timer = setTimeout(load, HIST_POLL_MS);
    };
    load();
    return () => { alive = false; clearTimeout(timer); };
  }, [win, paused]);
  return { hist: hist?.window === win ? hist : null, error };
}

function Timeline({ buckets, range, seconds, onPick }: {
  buckets: LiveBucket[]; range: Range | null; seconds: boolean; onPick: (r: Range) => void;
}) {
  const [drag, setDrag] = useState<{ a: number; b: number } | null>(null);
  const anchor = useRef<number | null>(null);
  const max = Math.max(1, ...buckets.map((b) => b.total));

  const commit = useCallback((a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    onPick({ since: buckets[lo].start, until: buckets[hi].end });
  }, [buckets, onPick]);

  useEffect(() => {
    if (!drag) return;
    const up = () => { commit(drag.a, drag.b); setDrag(null); };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, [drag, commit]);

  const inRange = (b: LiveBucket, i: number) => {
    if (drag) return i >= Math.min(drag.a, drag.b) && i <= Math.max(drag.a, drag.b);
    return !!range && b.end > range.since && b.start < range.until;
  };
  const anySelected = !!drag || !!range;

  return (
    <div className="relative select-none">
      <div className="flex items-end gap-[3px] h-12" role="group" aria-label="Activity over time. Click a bar, or drag across bars, to view that time.">
        {buckets.map((b, i) => {
          const sel = inRange(b, i);
          const hot = b.risky > 0;
          const fill = !b.total ? 'rgba(148,163,184,0.12)'
            : hot ? 'linear-gradient(to top, rgba(248,113,113,0.35), #f87171)' : 'linear-gradient(to top, rgba(45,212,191,0.3), #5eead4)';
          return (
            <button key={b.start} type="button"
              title={`${clock(b.start, seconds)}–${clock(b.end, seconds)} · ${b.total} event${b.total === 1 ? '' : 's'}${b.risky ? ` · ${b.risky} need a look` : ''}`}
              aria-label={`${clock(b.start, seconds)} to ${clock(b.end, seconds)}, ${b.total} events, ${b.risky} need a look`}
              aria-pressed={sel}
              onMouseDown={(ev) => {
                if (ev.button !== 0) return;
                if (ev.shiftKey && anchor.current !== null) { commit(anchor.current, i); return; }
                anchor.current = i;
                setDrag({ a: i, b: i });
              }}
              onMouseEnter={() => drag && setDrag({ ...drag, b: i })}
              onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); anchor.current = i; commit(i, i); } }}
              className="group flex-1 h-full flex items-end cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400/60 rounded-sm">
              <span className="w-full rounded-sm id-bar-in transition-all duration-200 group-hover:brightness-125"
                style={{
                  height: `${b.total ? 18 + (b.total / max) * 82 : 8}%`,
                  background: fill,
                  opacity: anySelected && !sel ? 0.3 : 1,
                  boxShadow: sel ? `0 0 0 1px ${hot ? '#fca5a5' : '#99f6e4'}, 0 0 12px ${hot ? 'rgba(248,113,113,0.55)' : 'rgba(94,234,212,0.5)'}`
                    : hot && b.total ? '0 0 8px rgba(248,113,113,0.35)' : undefined,
                  animationDelay: `${i * 18}ms`,
                }} />
            </button>
          );
        })}
      </div>
      {buckets.length > 0 && (
        <div className="flex justify-between mt-1 text-[9px] text-slate-600 tabular-nums">
          <span>{clock(buckets[0].start, seconds)}</span>
          <span>{clock(buckets[Math.floor(buckets.length / 2)].start, seconds)}</span>
          <span>now</span>
        </div>
      )}
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
  const [win, setWin] = useState<LiveWindow>('10m');
  const [range, setRange] = useState<Range | null>(null);
  const [rangeEvents, setRangeEvents] = useState<LiveEvent[] | null>(null);
  const [rangeInfo, setRangeInfo] = useState<{ truncated: boolean; error: string }>({ truncated: false, error: '' });
  const now = useNow(4000);
  const { hist, error: histError } = useHistogram(win, live.paused);

  useEffect(() => {
    if (!range) { setRangeEvents(null); return; }
    let alive = true;
    setRangeEvents(null);
    setRangeInfo({ truncated: false, error: '' });
    identityApi.liveEvents(range)
      .then((f) => {
        if (!alive) return;
        if (!f || !Array.isArray(f.events)) throw new Error('That time range returned an unexpected response');
        setRangeEvents(f.events);
        setRangeInfo({ truncated: !!f.truncated, error: '' });
      })
      .catch((e: Error) => alive && (setRangeEvents([]), setRangeInfo({ truncated: false, error: e.message || 'Could not load that time range' })));
    return () => { alive = false; };
  }, [range]);

  const pickWindow = (w: LiveWindow) => { setWin(w); setRange(null); };
  const source = range ? rangeEvents ?? [] : live.events;
  const shown = source.filter((e) => matches(e, filter));
  const risky = source.filter((e) => matches(e, 'risky')).length;
  const seconds = win === '10m';

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
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[10px] uppercase tracking-wider text-slate-500">Activity · click or drag to zoom in</span>
          <div className="flex gap-0.5 p-0.5 rounded-lg border border-slate-700/60 bg-slate-950/40" role="radiogroup" aria-label="Chart window">
            {WINDOWS.map((w) => (
              <button key={w} type="button" role="radio" aria-checked={win === w} onClick={() => pickWindow(w)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${win === w ? 'bg-slate-700 text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}>
                {w}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-2 flex items-end gap-3">
          <div className="flex-1 min-w-0">
            {hist ? <Timeline buckets={hist.buckets} range={range} seconds={seconds} onPick={setRange} />
              : histError ? <div className="h-12 flex items-center text-[11px] text-red-300">{histError}</div>
              : <div className="id-skeleton h-12 rounded-md" />}
          </div>
          <button type="button" onClick={() => setFilter(filter === 'risky' ? 'all' : 'risky')} aria-pressed={filter === 'risky'}
            className="text-right rounded-lg px-1.5 py-1 hover:bg-slate-800/60 transition-colors">
            <div className="text-lg font-semibold leading-none text-amber-200"><AnimatedNumber value={risky} /></div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">need a look</div>
          </button>
        </div>
        {range && (
          <div className="mt-3 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-teal-400/40 bg-teal-500/10 text-[11px] text-teal-50 animate-scale-in">
            <CalendarRange size={12} className="text-teal-300 flex-shrink-0" />
            <span className="truncate">
              Viewing {clock(range.since, seconds)}–{clock(range.until, seconds)}
              {rangeEvents ? ` · ${rangeEvents.length}${rangeInfo.truncated ? '+' : ''} event${rangeEvents.length === 1 ? '' : 's'}` : ' · loading'}
            </span>
            <button type="button" onClick={() => setRange(null)} aria-label="Back to live"
              className="ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-teal-100 hover:bg-teal-500/20 transition-colors">
              <X size={11} /> Back to live
            </button>
          </div>
        )}
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
        {range && rangeInfo.error ? (
          <div className="px-4 py-8 text-center text-xs text-red-300">{rangeInfo.error}</div>
        ) : range && !rangeEvents ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="id-skeleton h-12 rounded-xl" />)}</div>
        ) : !range && live.error && !live.events.length ? (
          <div className="px-4 py-8 text-center text-xs text-red-300">{live.error}</div>
        ) : !range && !live.meta ? (
          <div className="space-y-2 p-2">{[0, 1, 2, 3].map((i) => <div key={i} className="id-skeleton h-12 rounded-xl" />)}</div>
        ) : shown.length === 0 ? (
          <div className="px-4 py-10 text-center text-xs text-slate-500">
            {range ? 'Nothing matches in this time range.' : 'Nothing here yet. New activity appears as it happens.'}
          </div>
        ) : shown.map((e) => (
          <LiveEventRow key={e.event_id} e={e} now={now} isNew={!range && live.freshIds.has(e.event_id)} onMap={mapped(e)}
            onHover={(on) => onHoverEvent(on ? e : null)} onSelect={() => onSelectEvent(e)} />
        ))}
        {range && rangeInfo.truncated && (
          <p className="px-3 py-2 text-[10px] text-slate-500 text-center">Showing the newest 300. Drag a narrower range to see the rest.</p>
        )}
      </div>

      <div className="relative px-4 py-2.5 border-t border-slate-700/40 text-[10px] text-slate-500 flex items-center gap-1.5">
        <Sparkles size={11} className="text-slate-600" />
        {live.meta?.mode === 'demo'
          ? 'Sample activity generated for the preview. Click an event for details, its graph and signed raw data.'
          : 'From your identity event feed. Click an event for details, its graph and signed raw data.'}
      </div>
    </div>
  );
}
