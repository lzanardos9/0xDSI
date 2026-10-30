import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Crown, ShieldAlert, Server, Filter, Maximize2, Minimize2, Route, Network, Users, Waypoints, Radio } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { identityApi, type AccessResource, type AttackPath, type LiveEvent } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime } from './identityUi';
import { BandPill, PathChain } from './identityRiskUi';
import AccessGraphCanvas, { GraphLegend, type GraphPulse } from './AccessGraphCanvas';
import LiveFeed, { LiveBadge } from './LiveFeed';
import { AnimatedNumber, TONE_COLOR, describeLiveEvent, liveTargets, useLiveFeed } from './identityLive';
import LiveEventDrawer from './LiveEventDrawer';

const TIER_TONE: Record<string, string> = {
  tier0: 'text-red-200 bg-red-500/15 border-red-500/40',
  tier1: 'text-amber-200 bg-amber-500/15 border-amber-500/40',
};

function Stat({ icon: Icon, label, value, tone = 'text-slate-100', accent }: { icon: LucideIcon; label: string; value: string | number; tone?: string; accent: string }) {
  return (
    <Card className="p-4 overflow-hidden">
      <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-40" style={{ background: accent }} />
      <div className="relative flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <Icon size={13} style={{ color: accent }} /> {label}
      </div>
      <div className={`relative text-[28px] font-semibold leading-tight mt-1.5 tabular-nums ${tone}`}>
        {typeof value === 'number' ? <AnimatedNumber value={value} /> : value}
      </div>
    </Card>
  );
}

function ResourceCard({ r, active, onClick }: { r: AccessResource; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={`group relative text-left rounded-2xl border p-4 transition-all duration-300 overflow-hidden ${active
        ? 'border-amber-400/60 bg-gradient-to-br from-amber-500/15 to-slate-900/80 shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_18px_40px_-18px_rgba(245,158,11,0.6)]'
        : 'border-slate-700/50 bg-slate-900/50 backdrop-blur hover:border-slate-500/60 hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)]'}`}>
      {r.via_takeover > 0 && <span className="absolute top-0 inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-red-400 to-transparent" />}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${active ? 'bg-amber-400/20' : 'bg-amber-500/10 group-hover:bg-amber-500/15'}`}>
            <Crown size={14} className="text-amber-300" />
          </span>
          <span className="text-sm font-medium text-slate-100 truncate" title={r.name}>{r.name}</span>
        </div>
        {r.tier && <span className={`px-1.5 py-0.5 rounded-md border text-[10px] font-semibold uppercase tracking-wider ${TIER_TONE[r.tier] || 'text-slate-300 bg-slate-700/40 border-slate-600/40'}`}>{r.tier}</span>}
      </div>
      <div className="flex items-end gap-5 mt-4">
        <div>
          <div className={`text-2xl font-semibold tabular-nums ${r.identities ? 'text-slate-50' : 'text-slate-600'}`}>{r.identities}</div>
          <div className="text-[11px] text-slate-500">can reach</div>
        </div>
        {r.via_takeover > 0 && (
          <div>
            <div className="text-2xl font-semibold tabular-nums text-red-300">{r.via_takeover}</div>
            <div className="text-[11px] text-slate-500">via takeover</div>
          </div>
        )}
        {r.min_hops !== null && (
          <div className="ml-auto text-right">
            <div className="text-sm font-medium text-slate-300 tabular-nums">{r.min_hops}</div>
            <div className="text-[11px] text-slate-500">fewest hops</div>
          </div>
        )}
      </div>
    </button>
  );
}

function PathRow({ p, selected, onSelect, onHover }: { p: AttackPath; selected: boolean; onSelect: () => void; onHover: (on: boolean) => void }) {
  return (
    <button onClick={onSelect} onMouseEnter={() => onHover(true)} onMouseLeave={() => onHover(false)} aria-pressed={selected}
      className={`w-full text-left px-4 py-3.5 border-l-2 transition-all duration-200 ${selected
        ? 'bg-teal-500/10 border-teal-400'
        : p.via_takeover ? 'border-red-400/70 hover:bg-slate-800/40' : 'border-transparent hover:bg-slate-800/40'}`}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-medium text-slate-100 truncate">{p.display_name || p.canonical_id}</span>
        {p.band && <BandPill band={p.band} />}
        {p.via_takeover && <Tag tone="red"><ShieldAlert size={10} /> takeover</Tag>}
      </div>
      <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-500 min-w-0">
        <Route size={11} className="flex-shrink-0" />
        <span className="truncate">{p.resource_name || p.resource_id}</span>
        <span className="flex-shrink-0">· {p.hops} hop{p.hops === 1 ? '' : 's'}</span>
        {p.permission && <span className="flex-shrink-0 text-sky-300/80">· {p.permission}</span>}
      </div>
    </button>
  );
}

export default function AccessGraph() {
  const [resources, setResources] = useState<AccessResource[]>([]);
  const [meta, setMeta] = useState<{ edges: number; access_version: string | null; updated_at: string | null } | null>(null);
  const [paths, setPaths] = useState<AttackPath[]>([]);
  const [resourceId, setResourceId] = useState('');
  const [takeoverOnly, setTakeoverOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pathsLoading, setPathsLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [side, setSide] = useState<'live' | 'routes'>('live');
  const [pulse, setPulse] = useState<GraphPulse | null>(null);
  const [opened, setOpened] = useState<LiveEvent | null>(null);
  const live = useLiveFeed();
  const pulsedId = useRef<string | null>(null);

  const loadResources = useCallback(() => {
    setLoading(true);
    setError('');
    identityApi
      .graphResources()
      .then((d) => { setResources(d.resources); setMeta(d.meta); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(loadResources, [loadResources]);

  useEffect(() => {
    let live = true;
    setPathsLoading(true);
    setSelected(null);
    identityApi
      .graphPaths({ resource_id: resourceId, takeover_only: takeoverOnly })
      .then((d) => live && setPaths(d.paths))
      .catch((e: Error) => live && setError(e.message))
      .finally(() => live && setPathsLoading(false));
    return () => { live = false; };
  }, [resourceId, takeoverOnly]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  useEffect(() => {
    const e = live.fresh;
    if (!e || pulsedId.current === e.event_id) return;
    pulsedId.current = e.event_id;
    const t = liveTargets(e, paths);
    if (!t.paths.length && !t.nodes.length) return;
    const v = describeLiveEvent(e);
    setPulse({ id: e.event_id, paths: t.paths, nodes: t.nodes, color: TONE_COLOR[v.tone], label: v.short });
    const timer = setTimeout(() => setPulse((cur) => (cur?.id === e.event_id ? null : cur)), 3400);
    return () => clearTimeout(timer);
  }, [live.fresh, paths]);

  const activity = useMemo(() => {
    const out: Record<string, number> = {};
    for (const e of live.events) {
      if (e.canonical_id) out[`p:${e.canonical_id}`] = (out[`p:${e.canonical_id}`] ?? 0) + 1;
      if (e.account_key) out[e.account_key] = (out[e.account_key] ?? 0) + 1;
    }
    return out;
  }, [live.events]);

  const isMapped = useCallback((e: LiveEvent) => liveTargets(e, paths).paths.length > 0, [paths]);
  const hoverEvent = useCallback((e: LiveEvent | null) => setHovered(e ? liveTargets(e, paths).paths[0] ?? null : null), [paths]);
  const traceEvent = useCallback((e: LiveEvent) => {
    const t = liveTargets(e, paths);
    if (!t.paths.length) return;
    setSelected(t.paths[0]);
    const v = describeLiveEvent(e);
    setPulse({ id: `${e.event_id}-${Date.now()}`, paths: t.paths, nodes: t.nodes, color: TONE_COLOR[v.tone], label: v.short });
  }, [paths]);
  const selectEvent = useCallback((e: LiveEvent) => {
    traceEvent(e);
    setOpened(e);
  }, [traceEvent]);
  const closeEvent = useCallback(() => setOpened(null), []);
  const showOnMap = useCallback((e: LiveEvent) => {
    setOpened(null);
    traceEvent(e);
  }, [traceEvent]);

  const jewels = resources.filter((r) => r.crown_jewel);
  const others = resources.filter((r) => !r.crown_jewel);
  const selectedName = resources.find((r) => r.resource_id === resourceId)?.name;
  const selectedPath = paths.find((p) => p.path_id === selected) ?? null;

  const stats = useMemo(() => {
    const hops = jewels.map((r) => r.min_hops).filter((h): h is number => h !== null);
    return {
      jewels: jewels.length,
      exposed: jewels.reduce((s, r) => s + r.identities, 0),
      takeover: jewels.reduce((s, r) => s + r.via_takeover, 0),
      fewest: hops.length ? Math.min(...hops) : '—',
    };
  }, [jewels]);

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      {resourceId && (
        <button onClick={() => setResourceId('')} className="px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300 hover:bg-slate-800 transition-colors">
          Show all systems
        </button>
      )}
      <button onClick={() => setTakeoverOnly(!takeoverOnly)} aria-pressed={takeoverOnly}
        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors ${takeoverOnly ? 'border-red-500/50 bg-red-500/15 text-red-200' : 'border-slate-700/60 text-slate-300 hover:bg-slate-800'}`}>
        <Filter size={12} /> Takeover only
      </button>
      <button onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Exit full screen' : 'Full screen'}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 text-xs text-slate-300 hover:bg-slate-800 transition-colors">
        {expanded ? <Minimize2 size={12} /> : <Maximize2 size={12} />} {expanded ? 'Exit full screen' : 'Full screen'}
      </button>
    </div>
  );

  const graphPanel = (
    <Card className={`overflow-hidden ${expanded ? 'absolute inset-3 sm:inset-6 flex flex-col animate-scale-in' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-slate-700/40">
        <div className="flex items-center gap-3">
          <span className="w-8 h-8 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center">
            <Network size={15} className="text-teal-300" />
          </span>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">{selectedName ? `Who can reach ${selectedName}` : 'Live access map to every crown jewel'}</h2>
            <p className="text-xs text-slate-500 mt-0.5">{paths.length} route{paths.length === 1 ? '' : 's'} · hover a node to trace it, click to pin</p>
          </div>
        </div>
        {toolbar}
      </div>
      <div className={`relative bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.06),transparent_70%)] ${expanded ? 'flex-1 overflow-auto' : ''}`}>
        {pathsLoading ? <Loading label="Mapping access routes" /> : paths.length === 0 ? (
          <Empty title="No routes" hint="Nobody's active accounts reach this system with the current filter." />
        ) : (
          <div className="py-3">
            <AccessGraphCanvas paths={paths} highlightPathId={hovered ?? selected} onSelectPath={setSelected} pulse={pulse} activity={activity} />
          </div>
        )}
      </div>
      <div className="px-5 py-3 border-t border-slate-700/40 bg-slate-950/30"><GraphLegend /></div>
    </Card>
  );

  return (
    <div className="identity-page">
      <LiveEventDrawer event={opened} paths={paths} onClose={closeEvent} onOpen={selectEvent} onShowOnMap={showOnMap} />
      <PageHeader
        icon={Share2}
        title="Access Graph & Attack Paths"
        subtitle="Every route from a person, workload or agent to your crown-jewel systems, through group nesting and takeover rights such as helpdesk password resets. Disabled accounts block a route."
        actions={meta ? (
          <div className="flex items-center gap-2.5 px-3 py-2 rounded-xl border border-slate-700/50 bg-slate-900/50 text-xs text-slate-400">
            <LiveBadge mode={live.meta?.mode} paused={live.paused} />
            <span>{meta.edges} access links · built {fmtTime(meta.updated_at)}</span>
          </div>
        ) : undefined}
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={loadResources} /></div>}

      {loading ? (
        <Card><Loading label="Loading access graph" /></Card>
      ) : resources.length === 0 ? (
        <Card><Empty title="No access data yet" hint="Drop resources, groups and edges into the identity access landing folder, then run the Identity 01 job." /></Card>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat icon={Crown} label="Crown jewels" value={stats.jewels} accent="#f59e0b" />
            <Stat icon={Users} label="Identity routes in" value={stats.exposed} accent="#2dd4bf" />
            <Stat icon={ShieldAlert} label="Via takeover" value={stats.takeover} tone={stats.takeover ? 'text-red-300' : 'text-slate-100'} accent="#f87171" />
            <Stat icon={Waypoints} label="Fewest hops" value={stats.fewest} accent="#38bdf8" />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-3">
              <Crown size={14} className="text-amber-300" />
              <h2 className="text-sm font-semibold text-slate-200">Crown jewels</h2>
              <span className="text-xs text-slate-500">Choose one to focus the map</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
              {jewels.map((r) => (
                <ResourceCard key={r.resource_id} r={r} active={resourceId === r.resource_id}
                  onClick={() => setResourceId(resourceId === r.resource_id ? '' : r.resource_id)} />
              ))}
            </div>
            {others.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mt-4 text-xs text-slate-500">
                <Server size={13} />
                <span>Other mapped systems:</span>
                {others.map((r) => <Tag key={r.resource_id}>{r.name}</Tag>)}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] gap-4">
            {expanded ? <Card className="p-10"><Empty title="Map open in full screen" hint="Press Escape or Exit full screen to return." /></Card> : graphPanel}
            {expanded && createPortal(
              <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Access map, full screen">
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-sm animate-fade-in" onClick={() => setExpanded(false)} />
                {graphPanel}
              </div>,
              document.body,
            )}

            <div className="flex flex-col gap-3 min-h-0 2xl:max-h-[760px]">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl border border-slate-700/50 bg-slate-900/60" role="tablist" aria-label="Side panel">
                {([['live', 'Live feed', Radio], ['routes', `Routes (${paths.length})`, Route]] as const).map(([id, label, Icon]) => (
                  <button key={id} type="button" role="tab" aria-selected={side === id} onClick={() => setSide(id)}
                    className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${side === id ? 'bg-slate-800 text-slate-50 shadow-[inset_0_0_0_1px_rgba(94,234,212,0.25)]' : 'text-slate-400 hover:text-slate-200'}`}>
                    <Icon size={12} className={side === id ? 'text-teal-300' : ''} /> {label}
                  </button>
                ))}
              </div>

              {side === 'live' ? (
                <LiveFeed live={live} mapped={isMapped} onHoverEvent={hoverEvent} onSelectEvent={selectEvent}
                  className="h-[520px] 2xl:h-auto 2xl:flex-1 animate-fade-in" />
              ) : (
                <Card className="overflow-hidden flex flex-col 2xl:flex-1 min-h-0 animate-fade-in">
                  <div className="px-4 py-3.5 border-b border-slate-700/40">
                    <h2 className="text-sm font-semibold text-slate-100">Routes</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Takeover routes first, then the shortest.</p>
                  </div>
                  {pathsLoading ? <Loading label="Loading routes" /> : paths.length === 0 ? (
                    <Empty title="No routes" hint="Try another system or turn off Takeover only." />
                  ) : (
                    <div className="divide-y divide-slate-800/80 overflow-y-auto max-h-[420px] 2xl:max-h-none">
                      {paths.map((p) => (
                        <PathRow key={p.path_id} p={p} selected={selected === p.path_id}
                          onSelect={() => setSelected(selected === p.path_id ? null : p.path_id)}
                          onHover={(on) => setHovered(on ? p.path_id : null)} />
                      ))}
                    </div>
                  )}
                </Card>
              )}
            </div>
          </div>

          {selectedPath && (
            <Card className="p-5 animate-slide-up">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <Route size={14} className="text-teal-300" />
                <span className="text-sm font-semibold text-slate-100">{selectedPath.display_name || selectedPath.canonical_id}</span>
                <span className="text-xs text-slate-500">reaches</span>
                <span className="text-sm text-amber-200">{selectedPath.resource_name || selectedPath.resource_id}</span>
                <span className="text-xs text-slate-500">in {selectedPath.hops} hop{selectedPath.hops === 1 ? '' : 's'}</span>
                {selectedPath.via_takeover && <Tag tone="red"><ShieldAlert size={10} /> takeover</Tag>}
                <button onClick={() => setSelected(null)} className="ml-auto text-xs text-slate-400 hover:text-slate-200 transition-colors">Clear</button>
              </div>
              <PathChain path={selectedPath} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
