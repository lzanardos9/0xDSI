import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Crown, KeyRound, Users, UserRound, Bot, Cpu, ShieldAlert } from 'lucide-react';
import type { AttackPath, RiskBand } from '../../lib/identityApi';

type NodeKind = 'identity' | 'account' | 'group' | 'resource';

interface GNode {
  id: string;
  kind: NodeKind;
  label: string;
  principal?: string;
  band?: RiskBand | null;
  privileged?: boolean;
  layer: number;
  paths: Set<string>;
  takeover: boolean;
}

interface GEdge {
  key: string;
  from: string;
  to: string;
  type: string;
  permission: string;
  takeover: boolean;
  paths: Set<string>;
}

const ROW = 62;
const TOP = 52;
const NODE_W = 164;

const KIND_COLOR: Record<NodeKind, string> = {
  identity: '#2dd4bf',
  account: '#94a3b8',
  group: '#38bdf8',
  resource: '#f59e0b',
};

const BAND_RING: Record<RiskBand, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#34d399',
};

const EDGE_LABEL: Record<string, string> = {
  has_account: 'has account',
  member_of: 'member of',
  nested_in: 'nested in',
  grants: 'grants',
  can_take_over: 'can take over',
};

const COLUMN_LABEL: Record<NodeKind, string> = {
  identity: 'People, workloads & agents',
  account: 'Accounts',
  group: 'Groups',
  resource: 'Crown jewels',
};

function buildGraph(paths: AttackPath[]) {
  const nodes = new Map<string, GNode>();
  const edges = new Map<string, GEdge>();

  const touch = (n: Omit<GNode, 'paths' | 'takeover' | 'layer'>, layer: number, pathId: string, takeover: boolean) => {
    const cur = nodes.get(n.id) ?? { ...n, layer, paths: new Set<string>(), takeover: false };
    cur.layer = Math.max(cur.layer, layer);
    cur.paths.add(pathId);
    cur.takeover = cur.takeover || takeover;
    if (n.privileged) cur.privileged = true;
    nodes.set(n.id, cur);
  };

  for (const p of paths) {
    const pid = `p:${p.canonical_id ?? p.path_id}`;
    touch({ id: pid, kind: 'identity', label: p.display_name || p.canonical_id || 'Unknown', principal: p.principal_type, band: p.band }, 0, p.path_id, p.via_takeover);
    let prev = pid;
    p.steps.forEach((s, i) => {
      touch({ id: s.id, kind: s.kind, label: s.label, privileged: s.kind === 'account' && s.persona_type === 'privileged' }, i + 1, p.path_id, p.via_takeover);
      const key = `${prev}>${s.id}`;
      const e = edges.get(key) ?? { key, from: prev, to: s.id, type: s.edge || 'has_account', permission: s.permission || '', takeover: false, paths: new Set<string>() };
      e.paths.add(p.path_id);
      e.takeover = e.takeover || s.edge === 'can_take_over';
      edges.set(key, e);
      prev = s.id;
    });
  }

  for (let pass = 0; pass < nodes.size; pass++) {
    let moved = false;
    for (const e of edges.values()) {
      const a = nodes.get(e.from)!;
      const b = nodes.get(e.to)!;
      if (b.layer <= a.layer) { b.layer = a.layer + 1; moved = true; }
    }
    if (!moved) break;
  }
  const maxLayer = Math.max(0, ...[...nodes.values()].map((n) => n.layer));
  for (const n of nodes.values()) if (n.kind === 'resource') n.layer = maxLayer;

  const columns: GNode[][] = Array.from({ length: maxLayer + 1 }, () => []);
  for (const n of nodes.values()) columns[n.layer].push(n);
  const bandRank: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  columns[0].sort((a, b) => (bandRank[a.band ?? 'low'] - bandRank[b.band ?? 'low']) || a.label.localeCompare(b.label));

  const pos = new Map<string, number>();
  const index = () => columns.forEach((col) => col.forEach((n, i) => pos.set(n.id, i - (col.length - 1) / 2)));
  index();
  const neighbours = (id: string, dir: 'in' | 'out') =>
    [...edges.values()].filter((e) => (dir === 'in' ? e.to === id : e.from === id)).map((e) => pos.get(dir === 'in' ? e.from : e.to) ?? 0);
  const bary = (n: GNode, dir: 'in' | 'out') => {
    const ns = neighbours(n.id, dir);
    return ns.length ? ns.reduce((s, v) => s + v, 0) / ns.length : pos.get(n.id) ?? 0;
  };
  for (let sweep = 0; sweep < 4; sweep++) {
    for (let l = 1; l < columns.length; l++) { columns[l].sort((a, b) => bary(a, 'in') - bary(b, 'in')); index(); }
    for (let l = columns.length - 2; l >= 1; l--) { columns[l].sort((a, b) => bary(a, 'out') - bary(b, 'out')); index(); }
  }

  const columnKinds = columns.map((col) => {
    const counts = new Map<NodeKind, number>();
    col.forEach((n) => counts.set(n.kind, (counts.get(n.kind) ?? 0) + 1));
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'account';
  });

  return { nodes, edges: [...edges.values()], columns, columnKinds };
}

const initials = (s: string) => s.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

function NodeChip({ n, dim, focused }: { n: GNode; dim: boolean; focused: boolean }) {
  const base = 'flex items-center gap-2 max-w-[164px] border backdrop-blur-md shadow-[0_8px_24px_-12px_rgba(0,0,0,0.8)]';
  const glow = focused ? 'ring-2 ring-white/20 scale-[1.06]' : '';
  if (n.kind === 'identity') {
    const ring = BAND_RING[n.band ?? 'low'];
    const Icon = n.principal === 'agent' ? Bot : n.principal === 'workload' ? Cpu : null;
    return (
      <div className={`${base} ${glow} pl-1 pr-3 py-1 rounded-full bg-slate-900/90 border-slate-600/50 transition-transform`} style={{ opacity: dim ? 0.18 : 1 }}>
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold text-slate-950 flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #5eead4, #38bdf8)', boxShadow: `0 0 0 2px #0b1626, 0 0 0 4px ${ring}` }}>
          {Icon ? <Icon size={13} /> : initials(n.label)}
        </span>
        <span className="min-w-0 text-xs font-medium text-slate-100 truncate">{n.label}</span>
      </div>
    );
  }
  if (n.kind === 'resource') {
    return (
      <div className="relative transition-transform" style={{ opacity: dim ? 0.18 : 1 }}>
        {n.takeover && !dim && <span className="id-pulse-ring absolute inset-0 rounded-xl border-2 border-red-400/60" />}
        <div className={`${base} ${glow} relative px-3 py-2 rounded-xl border-amber-400/50 bg-gradient-to-br from-amber-500/25 via-slate-900/90 to-slate-900/90 shadow-[0_0_30px_-8px_rgba(245,158,11,0.6)]`}>
          <Crown size={14} className="text-amber-300 flex-shrink-0" />
          <span className="min-w-0 text-xs font-semibold text-amber-50 truncate">{n.label}</span>
        </div>
      </div>
    );
  }
  const group = n.kind === 'group';
  const Icon = group ? Users : n.privileged ? KeyRound : UserRound;
  const tone = group
    ? 'border-sky-400/40 bg-sky-950/70 text-sky-100'
    : n.privileged
      ? 'border-amber-400/40 bg-slate-900/90 text-amber-100'
      : 'border-slate-600/50 bg-slate-900/90 text-slate-200';
  return (
    <div className={`${base} ${glow} ${tone} px-2.5 py-1.5 rounded-lg transition-transform`} style={{ opacity: dim ? 0.18 : 1 }}>
      <Icon size={13} className={group ? 'text-sky-300' : n.privileged ? 'text-amber-300' : 'text-slate-400'} />
      <span className="min-w-0 text-xs font-medium truncate">{n.label}</span>
    </div>
  );
}

export default function AccessGraphCanvas({ paths, highlightPathId, onSelectPath }: {
  paths: AttackPath[];
  highlightPathId: string | null;
  onSelectPath: (id: string | null) => void;
}) {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  const [hoverNode, setHoverNode] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => buildGraph(paths), [paths]);
  const signature = useMemo(() => paths.map((p) => p.path_id).join('|'), [paths]);
  useEffect(() => { setPinned(null); setHoverNode(null); }, [signature]);

  const L = graph.columns.length;
  const W = Math.max(width, L * (NODE_W + 14));
  const padX = NODE_W / 2 + 12;
  const tallest = Math.max(1, ...graph.columns.map((c) => c.length));
  const H = TOP + tallest * ROW + 24;
  const colX = (l: number) => (L <= 1 ? W / 2 : padX + (l * (W - 2 * padX)) / (L - 1));
  const coords = new Map<string, { x: number; y: number }>();
  graph.columns.forEach((col, l) => {
    const offset = TOP + ((tallest - col.length) * ROW) / 2 + ROW / 2;
    col.forEach((n, i) => coords.set(n.id, { x: colX(l), y: offset + i * ROW }));
  });

  const focusNode = hoverNode ?? pinned;
  const active: Set<string> | null = focusNode
    ? graph.nodes.get(focusNode)?.paths ?? null
    : highlightPathId ? new Set([highlightPathId]) : null;
  const isActive = (s: Set<string>) => !active || [...s].some((p) => active.has(p));
  const single = active && active.size === 1;
  const focus = focusNode ? graph.nodes.get(focusNode) : null;

  if (!paths.length) return null;

  return (
    <div className="relative">
    <div ref={wrapRef} className="relative w-full overflow-x-auto overflow-y-hidden">
      <div className="relative" style={{ width: W, height: H }} onMouseLeave={() => setHoverNode(null)}>
        <svg key={signature} width={W} height={H} className="absolute inset-0" aria-hidden="true">
          <defs>
            <filter id={`${uid}-glow`} x="-20%" y="-50%" width="140%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
            {graph.edges.map((e, i) => {
              const a = coords.get(e.from)!;
              const b = coords.get(e.to)!;
              const from = e.takeover ? '#f87171' : KIND_COLOR[graph.nodes.get(e.from)!.kind];
              const to = e.takeover ? '#ef4444' : KIND_COLOR[graph.nodes.get(e.to)!.kind];
              return (
                <linearGradient key={e.key} id={`${uid}-g${i}`} gradientUnits="userSpaceOnUse" x1={a.x} y1={a.y} x2={b.x} y2={b.y}>
                  <stop offset="0%" stopColor={from} />
                  <stop offset="100%" stopColor={to} />
                </linearGradient>
              );
            })}
          </defs>

          {graph.columns.map((_, l) => (
            <line key={l} x1={colX(l)} x2={colX(l)} y1={TOP - 8} y2={H - 12} stroke="rgba(148,163,184,0.07)" strokeDasharray="2 6" />
          ))}

          {graph.edges.map((e, i) => {
            const a = coords.get(e.from)!;
            const b = coords.get(e.to)!;
            const dx = Math.max(40, (b.x - a.x) * 0.5);
            const d = `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
            const on = isActive(e.paths);
            const weight = Math.min(4, 1.25 + e.paths.size * 0.35);
            return (
              <g key={e.key} className="id-graph-edge" style={{ opacity: on ? 1 : 0.07 }}>
                <path d={d} fill="none" stroke={`url(#${uid}-g${i})`} strokeWidth={active && on ? weight + 1 : weight} strokeOpacity={active ? 0.95 : 0.55}
                  className="id-graph-edge-draw" style={{ animationDelay: `${graph.nodes.get(e.from)!.layer * 120}ms` }}
                  filter={active && on ? `url(#${uid}-glow)` : undefined} />
                {e.takeover && <path d={d} fill="none" stroke="#fecaca" strokeWidth={1.5} className="id-graph-flow" strokeOpacity={0.9} />}
                {on && (active || e.takeover) && (
                  <circle r={e.takeover ? 3.5 : 2.75} fill={e.takeover ? '#fca5a5' : '#99f6e4'} filter={`url(#${uid}-glow)`}>
                    <animateMotion dur={e.takeover ? '1.4s' : '2.2s'} repeatCount="indefinite" path={d} />
                  </circle>
                )}
              </g>
            );
          })}
        </svg>

        {graph.columns.map((_, l) => (
          <div key={l} className="absolute top-2 -translate-x-1/2 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 whitespace-nowrap"
            style={{ left: colX(l) }}>
            {l === 0 ? COLUMN_LABEL.identity : l === L - 1 ? COLUMN_LABEL.resource : COLUMN_LABEL[graph.columnKinds[l]]}
          </div>
        ))}

        {single && graph.edges.filter((e) => isActive(e.paths)).map((e) => {
          const a = coords.get(e.from)!;
          const b = coords.get(e.to)!;
          return (
            <div key={`lbl-${e.key}`} className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none animate-fade-in"
              style={{ left: (a.x + b.x) / 2, top: (a.y + b.y) / 2 - 12 }}>
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider whitespace-nowrap border ${e.takeover ? 'bg-red-950/90 text-red-200 border-red-500/40' : 'bg-slate-950/90 text-slate-300 border-slate-700/60'}`}>
                {e.takeover && <ShieldAlert size={9} />}
                {EDGE_LABEL[e.type] || e.type.replace(/_/g, ' ')}{e.permission ? ` · ${e.permission}` : ''}
              </span>
            </div>
          );
        })}

        {[...graph.nodes.values()].map((n, i) => {
          const c = coords.get(n.id)!;
          const on = isActive(n.paths);
          return (
            <button key={`${signature}-${n.id}`} type="button"
              className="id-graph-node id-graph-node-in absolute focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 rounded-full"
              style={{ left: c.x, top: c.y, maxWidth: NODE_W, transform: 'translate(-50%, -50%)', animationDelay: `${n.layer * 120 + (i % 6) * 25}ms`, zIndex: focusNode === n.id ? 3 : on ? 2 : 1 }}
              onMouseEnter={() => setHoverNode(n.id)}
              onFocus={() => setHoverNode(n.id)}
              onBlur={() => setHoverNode(null)}
              onClick={() => {
                setPinned(pinned === n.id ? null : n.id);
                if (n.paths.size === 1) onSelectPath([...n.paths][0]);
              }}
              aria-label={`${n.label}, on ${n.paths.size} path${n.paths.size === 1 ? '' : 's'}`}
              title={n.label}>
              <NodeChip n={n} dim={!on} focused={focusNode === n.id} />
            </button>
          );
        })}
      </div>
    </div>

      {focus && (
        <div className="absolute left-3 bottom-3 inline-flex items-center gap-3 px-3.5 py-2 rounded-xl bg-slate-950/90 border border-slate-700/60 backdrop-blur text-xs text-slate-300 shadow-xl pointer-events-none animate-fade-in">
          <span className="w-2 h-2 rounded-full" style={{ background: KIND_COLOR[focus.kind] }} />
          <span className="font-semibold text-slate-100">{focus.label}</span>
          <span className="text-slate-500">on {focus.paths.size} path{focus.paths.size === 1 ? '' : 's'}</span>
          {focus.takeover && <span className="inline-flex items-center gap-1 text-red-300"><ShieldAlert size={11} /> takeover route</span>}
          {pinned === focus.id && <span className="text-teal-300">pinned · click again to release</span>}
        </div>
      )}
    </div>
  );
}

export function GraphLegend() {
  const item = (color: string, label: string) => (
    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />{label}</span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-slate-400">
      {item(KIND_COLOR.identity, 'Identity')}
      {item(KIND_COLOR.account, 'Account')}
      {item('#fbbf24', 'Privileged account')}
      {item(KIND_COLOR.group, 'Group')}
      {item(KIND_COLOR.resource, 'Crown jewel')}
      <span className="inline-flex items-center gap-1.5">
        <svg width="26" height="6" aria-hidden="true"><line x1="0" y1="3" x2="26" y2="3" stroke="#f87171" strokeWidth="2" strokeDasharray="4 4" className="id-graph-flow" /></svg>
        Takeover route
      </span>
      <span className="text-slate-500">Ring colour shows the identity's risk level. Hover or click a node to trace it.</span>
    </div>
  );
}
