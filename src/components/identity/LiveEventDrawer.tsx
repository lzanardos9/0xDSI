import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileJson, Fingerprint, LayoutList, X } from 'lucide-react';
import { identityApi, type AttackPath, type LiveEvent, type LiveEventDetail } from '../../lib/identityApi';
import { TONE_COLOR, describeLiveEvent, liveTargets, timeAgo, useNow } from './identityLive';
import { LiveEventRow } from './LiveFeed';
import LiveEventGraph from './LiveEventGraph';
import { CustodyPanel, RawPanel } from './LiveCustody';
import { fmtTime } from './identityUi';

type Tab = 'details' | 'raw' | 'custody';

const TABS: { id: Tab; label: string; icon: typeof X }[] = [
  { id: 'details', label: 'Details & graph', icon: LayoutList },
  { id: 'raw', label: 'Raw data', icon: FileJson },
  { id: 'custody', label: 'Chain of custody', icon: Fingerprint },
];

const SEVERITY = { info: 'Routine', notice: 'Notable', warn: 'Needs a look', alert: 'Urgent' } as const;

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function LiveEventDrawer({ event, paths, onClose, onOpen, onShowOnMap }: {
  event: LiveEvent | null;
  paths: AttackPath[];
  onClose: () => void;
  onOpen: (e: LiveEvent) => void;
  onShowOnMap?: (e: LiveEvent) => void;
}) {
  const [tab, setTab] = useState<Tab>('details');
  const [detail, setDetail] = useState<LiveEventDetail | null>(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const now = useNow(5000);

  useEffect(() => {
    if (!event) return;
    let alive = true;
    setDetail(null);
    setError('');
    identityApi.liveEvent(event.event_id)
      .then((d) => {
        if (!alive) return;
        if (!d || !d.raw || !d.custody || !Array.isArray(d.custody.trail)) throw new Error('The event details came back incomplete');
        setDetail(d);
        setText(JSON.stringify(d.raw, null, 2));
      })
      .catch((e: Error) => alive && setError(e.message || 'Could not load this event'));
    return () => { alive = false; };
  }, [event]);

  useEffect(() => {
    if (!event) return;
    const onKey = (k: KeyboardEvent) => k.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [event, onClose]);

  if (!event) return null;
  const e = detail?.event ?? event;
  const v = describeLiveEvent(e);
  const color = TONE_COLOR[v.tone];
  const Icon = v.icon;
  const route = paths.find((p) => p.path_id === liveTargets(e, paths).paths[0]) ?? null;
  const original = detail ? JSON.stringify(detail.raw, null, 2) : '';

  const facts: [string, string][] = [
    ['When', `${fmtTime(e.occurred_at)} (${timeAgo(e.occurred_at, now)})`],
    ['Who', e.display_name || 'Not linked to a person yet'],
    ['Account', e.username || e.account_key || '—'],
    ['Source', e.provider.replace(/_/g, ' ')],
    ['Done by', e.actor || 'The account itself'],
    ['Kind', `${e.category.replace(/_/g, ' ')} · ${e.event_type.replace(/_/g, ' ')}`],
  ];

  return createPortal(
    <div className="fixed inset-0 z-[120]" role="dialog" aria-modal="true" aria-label="Event details">
      <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <aside className="absolute right-0 top-0 bottom-0 w-full max-w-[600px] bg-slate-900 border-l border-slate-700/60 shadow-2xl flex flex-col id-drawer-in">
        <div className="relative px-5 pt-5 pb-4 border-b border-slate-700/50 overflow-hidden">
          <div className="absolute -top-24 -right-20 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: `${color}1f` }} />
          <div className="relative flex items-start gap-3">
            <span className="w-10 h-10 rounded-xl flex items-center justify-center border flex-shrink-0" style={{ background: `${color}14`, borderColor: `${color}55` }}>
              <Icon size={17} style={{ color }} />
            </span>
            <div className="min-w-0 flex-1">
              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-[0.14em] border"
                style={{ color, borderColor: `${color}55`, background: `${color}12` }}>{SEVERITY[v.tone]}</span>
              <h2 className="mt-1.5 text-base font-semibold text-slate-50 leading-snug">{v.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{v.subtitle}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-1 p-1 rounded-xl border border-slate-700/50 bg-slate-950/50" role="tablist">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
                className={`inline-flex items-center justify-center gap-1.5 px-2 py-2 rounded-lg text-[11px] font-medium transition-all ${tab === t.id ? 'bg-slate-800 text-slate-50 shadow-[inset_0_0_0_1px_rgba(94,234,212,0.25)]' : 'text-slate-400 hover:text-slate-200'}`}>
                <t.icon size={12} className={tab === t.id ? 'text-teal-300' : ''} /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-xs text-red-200">{error}</div>
          ) : tab === 'details' ? (
            <div className="space-y-5 animate-fade-in">
              <LiveEventGraph e={e} route={route} onShowOnMap={onShowOnMap && route ? () => onShowOnMap(e) : undefined} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                {facts.map(([k, val]) => (
                  <div key={k} className="min-w-0">
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">{k}</div>
                    <div className="text-xs text-slate-100 mt-0.5 break-words">{val}</div>
                  </div>
                ))}
              </div>
              {Object.keys(e.detail || {}).length > 0 && (
                <div>
                  <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">What the source reported</h3>
                  <dl className="rounded-xl border border-slate-700/50 divide-y divide-slate-800">
                    {Object.entries(e.detail).map(([k, val]) => (
                      <div key={k} className="flex gap-3 px-3 py-2 text-xs">
                        <dt className="w-32 flex-shrink-0 text-slate-500">{k.replace(/_/g, ' ')}</dt>
                        <dd className="text-slate-200 break-all">{show(val)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div>
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Other recent activity for this identity</h3>
                {!detail ? (
                  <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="id-skeleton h-11 rounded-xl" />)}</div>
                ) : detail.related.length === 0 ? (
                  <p className="text-xs text-slate-500">Nothing else in the recent window.</p>
                ) : (
                  <div className="rounded-xl border border-slate-700/50 p-1 space-y-0.5">
                    {detail.related.map((r) => <LiveEventRow key={r.event_id} e={r} now={now} isNew={false} compact onSelect={() => { setTab('details'); onOpen(r); }} />)}
                  </div>
                )}
              </div>
            </div>
          ) : !detail ? (
            <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="id-skeleton h-10 rounded-xl" />)}</div>
          ) : tab === 'raw' ? (
            <RawPanel detail={detail} text={text} setText={setText} original={original} />
          ) : (
            <CustodyPanel detail={detail} text={text} />
          )}
        </div>
        {detail && text !== original && (
          <div className="px-5 py-2.5 border-t border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-100">
            Tamper test active: the raw data has been edited in this window only. The stored record is unchanged.
          </div>
        )}
      </aside>
    </div>,
    document.body,
  );
}
