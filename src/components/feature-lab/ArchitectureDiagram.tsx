import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Database, Cloud, Cpu, Zap, Brain, Server, Globe, User, Layers, GitBranch,
  Boxes, Activity, Shield, X, ZoomIn, ZoomOut, Maximize2, Download
} from 'lucide-react';

interface DiagramNode {
  id: string;
  label: string;
  type: string;
  layer: string;
  description: string;
  tech?: string[];
  databricks_product?: string | null;
  details?: {
    inputs?: string;
    outputs?: string;
    scale?: string;
    security?: string;
  };
}

interface DiagramLink {
  from: string;
  to: string;
  label?: string;
  protocol?: string;
  data?: string;
  latency?: string;
  volume?: string;
}

interface ArchitectureDiagramProps {
  nodes: DiagramNode[];
  links: DiagramLink[];
}

const LAYER_ORDER = ['ingest', 'lakehouse', 'governance', 'ml', 'serving', 'apps'];
const LAYER_LABELS: Record<string, string> = {
  ingest: 'Ingest',
  lakehouse: 'Lakehouse Storage',
  governance: 'Governance & Quality',
  ml: 'ML & AI',
  serving: 'Serving',
  apps: 'Apps & Orchestration',
};

type NodeStyle = {
  fill: string;
  border: string;
  accent: string;
  text: string;
  icon: any;
  glow: string;
  typeLabel: string;
};

const TYPE_STYLES: Record<string, NodeStyle> = {
  actor:      { fill: '#0f172a', border: '#475569', accent: '#94a3b8', text: '#e2e8f0', icon: User,     glow: 'rgba(148,163,184,0.0)',  typeLabel: 'Actor' },
  frontend:   { fill: '#083344', border: '#06b6d4', accent: '#22d3ee', text: '#a5f3fc', icon: Globe,    glow: 'rgba(34,211,238,0.15)',  typeLabel: 'Frontend' },
  api:        { fill: '#172554', border: '#3b82f6', accent: '#60a5fa', text: '#bfdbfe', icon: Server,   glow: 'rgba(96,165,250,0.15)',  typeLabel: 'API' },
  stream:     { fill: '#451a03', border: '#f59e0b', accent: '#fbbf24', text: '#fde68a', icon: Activity, glow: 'rgba(251,191,36,0.15)',  typeLabel: 'Stream' },
  storage:    { fill: '#042f2e', border: '#14b8a6', accent: '#2dd4bf', text: '#99f6e4', icon: Database, glow: 'rgba(45,212,191,0.15)',  typeLabel: 'Storage' },
  ml:         { fill: '#022c22', border: '#10b981', accent: '#34d399', text: '#a7f3d0', icon: Brain,    glow: 'rgba(52,211,153,0.18)',  typeLabel: 'ML / Model' },
  agent:      { fill: '#022c22', border: '#10b981', accent: '#34d399', text: '#a7f3d0', icon: Cpu,      glow: 'rgba(52,211,153,0.18)',  typeLabel: 'Agent' },
  databricks: { fill: '#431407', border: '#ea580c', accent: '#fb923c', text: '#fed7aa', icon: Boxes,    glow: 'rgba(251,146,60,0.25)',  typeLabel: 'Databricks' },
  external:   { fill: '#0f172a', border: '#64748b', accent: '#94a3b8', text: '#cbd5e1', icon: Cloud,    glow: 'rgba(100,116,139,0.0)',  typeLabel: 'External' },
};

const NODE_W = 200;
const NODE_H = 86;
const COL_W = 260;
const ROW_H = 112;
const PAD_TOP = 56;
const PAD_LEFT = 48;
const LANE_GAP = 20;

export default function ArchitectureDiagram({ nodes, links }: ArchitectureDiagramProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [pinnedNode, setPinnedNode] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const { positions, activeLayers, width, height, laneBounds } = useMemo(() => {
    const byLayer: Record<string, DiagramNode[]> = {};
    nodes.forEach(n => {
      const l = n.layer && LAYER_ORDER.includes(n.layer) ? n.layer : 'lakehouse';
      (byLayer[l] ||= []).push(n);
    });

    const active = LAYER_ORDER.filter(l => byLayer[l]?.length);
    const pos: Record<string, { x: number; y: number; node: DiagramNode; colIdx: number }> = {};
    let maxRows = 1;
    const lanes: Record<string, { x: number; w: number }> = {};

    active.forEach((layer, colIdx) => {
      const list = byLayer[layer] || [];
      maxRows = Math.max(maxRows, list.length);
      const x = PAD_LEFT + colIdx * COL_W;
      lanes[layer] = { x: x - 16, w: NODE_W + 32 };
      list.forEach((n, rowIdx) => {
        pos[n.id] = {
          x,
          y: PAD_TOP + rowIdx * ROW_H,
          node: n,
          colIdx,
        };
      });
    });

    const w = active.length * COL_W + PAD_LEFT + 40;
    const h = PAD_TOP + maxRows * ROW_H + 60;
    return { positions: pos, activeLayers: active, width: w, height: h, laneBounds: lanes };
  }, [nodes]);

  const focusedId = pinnedNode || hoveredNode;
  const focused = focusedId ? positions[focusedId]?.node : null;
  const focusedLink = hoveredLink !== null ? links[hoveredLink] : null;

  const adjacency = useMemo(() => {
    const adj: Record<string, Set<string>> = {};
    links.forEach(l => {
      (adj[l.from] ||= new Set()).add(l.to);
      (adj[l.to] ||= new Set()).add(l.from);
    });
    return adj;
  }, [links]);

  const isNodeDim = (id: string) => {
    if (!focusedId) return false;
    if (id === focusedId) return false;
    return !adjacency[focusedId]?.has(id);
  };

  const isLinkActive = (l: DiagramLink, idx: number) => {
    if (hoveredLink === idx) return true;
    if (!focusedId) return true;
    return l.from === focusedId || l.to === focusedId;
  };

  const pathFor = (from: string, to: string) => {
    const a = positions[from];
    const b = positions[to];
    if (!a || !b) return '';
    const sameCol = a.colIdx === b.colIdx;
    if (sameCol) {
      const x = a.x + NODE_W / 2;
      const y1 = a.y + NODE_H;
      const y2 = b.y;
      if (y1 === y2) return `M ${x} ${y1} L ${x} ${y2}`;
      const offset = a.y < b.y ? 30 : -30;
      return `M ${x} ${y1} C ${x + offset * 2} ${y1 + offset}, ${x + offset * 2} ${y2 - offset}, ${x} ${y2}`;
    }
    const forward = a.colIdx < b.colIdx;
    const x1 = forward ? a.x + NODE_W : a.x;
    const y1 = a.y + NODE_H / 2;
    const x2 = forward ? b.x : b.x + NODE_W;
    const y2 = b.y + NODE_H / 2;
    const dx = Math.abs(x2 - x1);
    const cx1 = x1 + (forward ? 1 : -1) * Math.max(60, dx * 0.45);
    const cx2 = x2 - (forward ? 1 : -1) * Math.max(60, dx * 0.45);
    return `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
  };

  const midpoint = (from: string, to: string): { x: number; y: number } | null => {
    const a = positions[from];
    const b = positions[to];
    if (!a || !b) return null;
    return {
      x: (a.x + b.x + NODE_W) / 2,
      y: (a.y + b.y + NODE_H) / 2,
    };
  };

  // auto-zoom to fit on first render
  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const ratio = Math.min(1, (container.clientWidth - 24) / width);
    setZoom(Math.max(0.55, Math.min(1, ratio)));
  }, [width]);

  const zoomIn = () => setZoom(z => Math.min(1.4, z + 0.1));
  const zoomOut = () => setZoom(z => Math.max(0.45, z - 0.1));
  const zoomReset = () => setZoom(1);

  const exportSvg = () => {
    const svg = containerRef.current?.querySelector('svg');
    if (!svg) return;
    const source = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([source], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architecture.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="relative">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
          <Shield size={11} className="text-cyan-400" />
          <span>{nodes.length} components</span>
          <span className="text-slate-700">|</span>
          <GitBranch size={11} className="text-emerald-400" />
          <span>{links.length} data flows</span>
          <span className="text-slate-700">|</span>
          <Boxes size={11} className="text-orange-400" />
          <span>{nodes.filter(n => n.databricks_product).length} Databricks nodes</span>
        </div>
        <div className="flex items-center gap-1 bg-[#060912] border border-slate-800 rounded-lg p-1">
          <button onClick={zoomOut} className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" title="Zoom out">
            <ZoomOut size={13} />
          </button>
          <button onClick={zoomReset} className="px-2 h-7 rounded text-[10px] font-mono text-slate-400 hover:bg-slate-800 hover:text-white transition-colors min-w-[46px]" title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={zoomIn} className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" title="Zoom in">
            <ZoomIn size={13} />
          </button>
          <div className="w-px h-4 bg-slate-800 mx-1" />
          <button onClick={() => setPinnedNode(null)} className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" title="Fit" disabled={!pinnedNode}>
            <Maximize2 size={13} />
          </button>
          <button onClick={exportSvg} className="w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:bg-slate-800 hover:text-white transition-colors" title="Export SVG">
            <Download size={13} />
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-auto rounded-xl border border-slate-800"
        style={{
          background: 'radial-gradient(circle at 20% 10%, rgba(6,182,212,0.04), transparent 45%), radial-gradient(circle at 85% 80%, rgba(16,185,129,0.04), transparent 45%), linear-gradient(to bottom, #060912, #0a0e1a)',
          minHeight: 400,
          maxHeight: '75vh',
        }}
      >
        <div
          style={{
            width: width * zoom,
            height: height * zoom,
            position: 'relative',
          }}
        >
          <div
            style={{
              width,
              height,
              position: 'absolute',
              top: 0,
              left: 0,
              transform: `scale(${zoom})`,
              transformOrigin: 'top left',
            }}
          >
            {/* SVG layer: swimlanes + links */}
            <svg width={width} height={height} className="absolute top-0 left-0 pointer-events-none" style={{ overflow: 'visible' }}>
              <defs>
                <pattern id="archgrid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#0f172a" strokeWidth="0.6" />
                </pattern>
                <linearGradient id="flow-active" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#06b6d4" />
                  <stop offset="100%" stopColor="#10b981" />
                </linearGradient>
                <linearGradient id="flow-dbx" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#ea580c" />
                  <stop offset="100%" stopColor="#fbbf24" />
                </linearGradient>
                <linearGradient id="flow-dim" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="#334155" />
                  <stop offset="100%" stopColor="#334155" />
                </linearGradient>
                <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#10b981" />
                </marker>
                <marker id="arrow-dbx" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#fbbf24" />
                </marker>
                <marker id="arrow-dim" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
                </marker>
                <filter id="dbx-glow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="b" />
                  <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {/* Background grid */}
              <rect width={width} height={height} fill="url(#archgrid)" opacity="0.5" />

              {/* Swimlanes */}
              {activeLayers.map(layer => {
                const bounds = laneBounds[layer];
                if (!bounds) return null;
                const isDbx = true;
                return (
                  <g key={layer}>
                    <rect
                      x={bounds.x}
                      y={PAD_TOP - 40}
                      width={bounds.w}
                      height={height - PAD_TOP + 20}
                      fill={isDbx ? 'rgba(234,88,12,0.035)' : 'rgba(15,23,42,0.3)'}
                      stroke={isDbx ? 'rgba(234,88,12,0.15)' : 'rgba(30,41,59,0.6)'}
                      strokeWidth="1"
                      rx="10"
                    />
                    <text
                      x={bounds.x + bounds.w / 2}
                      y={PAD_TOP - 22}
                      textAnchor="middle"
                      fill={isDbx ? '#fb923c' : '#64748b'}
                      fontSize="10"
                      fontWeight="700"
                      fontFamily="ui-monospace, SFMono-Regular, monospace"
                      letterSpacing="1.5"
                    >
                      {(LAYER_LABELS[layer] || layer).toUpperCase()}
                    </text>
                  </g>
                );
              })}

              {/* Links */}
              <g>
                {links.map((l, idx) => {
                  const d = pathFor(l.from, l.to);
                  if (!d) return null;
                  const active = isLinkActive(l, idx);
                  const fromNode = positions[l.from]?.node;
                  const toNode = positions[l.to]?.node;
                  const touchesDbx = fromNode?.type === 'databricks' || toNode?.type === 'databricks';
                  const stroke = active ? (touchesDbx ? 'url(#flow-dbx)' : 'url(#flow-active)') : 'url(#flow-dim)';
                  const marker = active ? (touchesDbx ? 'url(#arrow-dbx)' : 'url(#arrow-active)') : 'url(#arrow-dim)';
                  return (
                    <g key={idx} className="pointer-events-auto" onMouseEnter={() => setHoveredLink(idx)} onMouseLeave={() => setHoveredLink(null)}>
                      <path d={d} stroke="transparent" strokeWidth="16" fill="none" style={{ cursor: 'pointer' }} />
                      <path
                        d={d}
                        stroke={stroke}
                        strokeWidth={active ? 2 : 1.2}
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={active ? '6 3' : '3 4'}
                        markerEnd={marker}
                        style={{
                          opacity: active ? 1 : 0.4,
                          filter: active && touchesDbx ? 'drop-shadow(0 0 4px rgba(251,146,60,0.5))' : 'none',
                        }}
                        className={active ? 'arch-flow' : ''}
                      />
                    </g>
                  );
                })}
              </g>

              {/* Link labels at midpoints (only show for active/hovered) */}
              <g className="pointer-events-none">
                {links.map((l, idx) => {
                  if (!l.label) return null;
                  const active = isLinkActive(l, idx);
                  if (!active) return null;
                  const mid = midpoint(l.from, l.to);
                  if (!mid) return null;
                  const label = l.label.slice(0, 22);
                  const w = label.length * 5.5 + 12;
                  return (
                    <g key={`lbl-${idx}`} transform={`translate(${mid.x - w / 2}, ${mid.y - 8})`}>
                      <rect width={w} height={16} rx={8} fill="#0a0e1a" stroke="#1e293b" strokeWidth="1" />
                      <text x={w / 2} y={11} textAnchor="middle" fill="#cbd5e1" fontSize="9" fontFamily="ui-monospace, monospace" fontWeight="600">
                        {label}
                      </text>
                    </g>
                  );
                })}
              </g>
            </svg>

            {/* HTML node layer (positioned over SVG) */}
            <div className="absolute top-0 left-0" style={{ width, height }}>
              {Object.values(positions).map(({ x, y, node }) => {
                const style = TYPE_STYLES[node.type] || TYPE_STYLES.api;
                const Icon = style.icon;
                const dim = isNodeDim(node.id);
                const isFocused = node.id === focusedId;
                const isDbx = node.type === 'databricks';

                return (
                  <div
                    key={node.id}
                    onMouseEnter={() => setHoveredNode(node.id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onClick={() => setPinnedNode(pinnedNode === node.id ? null : node.id)}
                    style={{
                      position: 'absolute',
                      left: x,
                      top: y,
                      width: NODE_W,
                      height: NODE_H,
                      opacity: dim ? 0.28 : 1,
                      transition: 'opacity 0.2s, transform 0.2s, box-shadow 0.2s',
                      transform: isFocused ? 'scale(1.04)' : 'scale(1)',
                      cursor: 'pointer',
                      zIndex: isFocused ? 10 : 1,
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        background: `linear-gradient(135deg, ${style.fill}ee, ${style.fill}b3)`,
                        border: `1.5px solid ${style.border}`,
                        borderRadius: 10,
                        padding: '8px 10px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 4,
                        boxShadow: isFocused
                          ? `0 0 0 2px ${style.accent}60, 0 10px 30px ${style.glow}, 0 0 20px ${style.glow}`
                          : isDbx
                            ? `0 0 14px ${style.glow}, inset 0 0 0 1px rgba(251,146,60,0.1)`
                            : '0 2px 8px rgba(0,0,0,0.3)',
                        backdropFilter: 'blur(6px)',
                      }}
                    >
                      {/* Top row: icon + type label */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: 5,
                          background: `${style.border}22`,
                          border: `1px solid ${style.border}66`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <Icon size={13} style={{ color: style.accent }} />
                        </div>
                        <div style={{
                          fontSize: 8, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase',
                          color: style.accent, opacity: 0.8, fontFamily: 'ui-monospace, monospace',
                        }}>
                          {style.typeLabel}
                        </div>
                      </div>

                      {/* Label */}
                      <div style={{
                        fontSize: 12, fontWeight: 700, color: style.text,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        lineHeight: 1.2,
                      }}>
                        {node.label}
                      </div>

                      {/* Bottom: databricks badge OR tech stack */}
                      {node.databricks_product ? (
                        <div style={{
                          fontSize: 9, fontWeight: 700,
                          color: '#fed7aa',
                          background: 'rgba(234,88,12,0.18)',
                          border: '1px solid rgba(251,146,60,0.4)',
                          borderRadius: 4,
                          padding: '2px 6px',
                          width: 'fit-content',
                          maxWidth: '100%',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                          fontFamily: 'ui-monospace, monospace',
                          letterSpacing: 0.3,
                        }}>
                          {node.databricks_product}
                        </div>
                      ) : node.tech && node.tech.length > 0 ? (
                        <div style={{
                          fontSize: 9, color: '#64748b', fontFamily: 'ui-monospace, monospace',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {node.tech.slice(0, 3).join(' · ')}
                        </div>
                      ) : (
                        <div style={{ height: 14 }} />
                      )}

                      {/* Connection indicator dots */}
                      <div style={{
                        position: 'absolute', right: -4, top: NODE_H / 2 - 4,
                        width: 7, height: 7, borderRadius: '50%',
                        background: style.border, border: '1.5px solid #0a0e1a',
                        opacity: (adjacency[node.id]?.size || 0) > 0 ? 1 : 0,
                      }} />
                      <div style={{
                        position: 'absolute', left: -4, top: NODE_H / 2 - 4,
                        width: 7, height: 7, borderRadius: '50%',
                        background: style.border, border: '1.5px solid #0a0e1a',
                        opacity: (adjacency[node.id]?.size || 0) > 0 ? 1 : 0,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Floating detail panel for focused node */}
        {focused && (
          <div
            className="absolute top-4 right-4 w-[320px] bg-[#0a0e1a]/97 border rounded-xl shadow-2xl backdrop-blur-md animate-[fadeIn_0.15s_ease-out]"
            style={{
              borderColor: TYPE_STYLES[focused.type]?.border || '#06b6d4',
              boxShadow: `0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px ${TYPE_STYLES[focused.type]?.border}40`,
              zIndex: 20,
            }}
          >
            <div className="flex items-start justify-between p-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{
                    background: `${TYPE_STYLES[focused.type]?.border}20`,
                    border: `1px solid ${TYPE_STYLES[focused.type]?.border}80`,
                  }}
                >
                  {(() => {
                    const Icon = TYPE_STYLES[focused.type]?.icon || Server;
                    return <Icon size={17} style={{ color: TYPE_STYLES[focused.type]?.accent }} />;
                  })()}
                </div>
                <div>
                  <div className="text-[9px] font-mono font-bold uppercase tracking-wider" style={{ color: TYPE_STYLES[focused.type]?.accent }}>
                    {TYPE_STYLES[focused.type]?.typeLabel} &middot; {focused.layer}
                  </div>
                  <div className="text-sm font-bold text-white leading-tight mt-0.5">{focused.label}</div>
                </div>
              </div>
              <button
                onClick={() => { setPinnedNode(null); setHoveredNode(null); }}
                className="w-6 h-6 rounded hover:bg-slate-800 flex items-center justify-center text-slate-500 hover:text-white transition-colors"
              >
                <X size={13} />
              </button>
            </div>
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
              <div className="text-[11px] text-slate-300 leading-relaxed">{focused.description}</div>

              {focused.databricks_product && (
                <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-lg px-3 py-2">
                  <Layers size={13} className="text-orange-400 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-orange-400">Databricks Product</div>
                    <div className="text-[11px] font-semibold text-orange-200 truncate">{focused.databricks_product}</div>
                  </div>
                </div>
              )}

              {focused.tech && focused.tech.length > 0 && (
                <div>
                  <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Stack</div>
                  <div className="flex flex-wrap gap-1">
                    {focused.tech.map(t => (
                      <span key={t} className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800/80 text-slate-200 border border-slate-700">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {focused.details && (
                <div className="grid grid-cols-2 gap-2 pt-3 border-t border-slate-800">
                  {focused.details.inputs && <DetailCell icon={<GitBranch size={10} />} label="Inputs" value={focused.details.inputs} color="cyan" />}
                  {focused.details.outputs && <DetailCell icon={<Zap size={10} />} label="Outputs" value={focused.details.outputs} color="emerald" />}
                  {focused.details.scale && <DetailCell icon={<Activity size={10} />} label="Scale" value={focused.details.scale} color="amber" />}
                  {focused.details.security && <DetailCell icon={<Shield size={10} />} label="Security" value={focused.details.security} color="red" />}
                </div>
              )}

              <div className="pt-3 border-t border-slate-800">
                <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">Connections</div>
                <div className="flex flex-wrap gap-1">
                  {Array.from(adjacency[focused.id] || []).slice(0, 8).map(id => (
                    <span key={id} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono">
                      {positions[id]?.node.label || id}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 text-[9px] text-slate-600 font-mono">
                {pinnedNode === focused.id ? 'Click node again to unpin' : 'Click node to pin this panel'}
              </div>
            </div>
          </div>
        )}

        {/* Floating link panel */}
        {focusedLink && !focused && (
          <div className="absolute bottom-4 right-4 w-[300px] bg-[#0a0e1a]/97 border border-emerald-500/40 rounded-xl shadow-2xl backdrop-blur-md p-4 space-y-2" style={{ zIndex: 20 }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-md bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center">
                <GitBranch size={14} className="text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] font-mono font-bold uppercase tracking-wider text-emerald-400">Data Flow</div>
                <div className="text-xs font-bold text-white truncate">
                  {positions[focusedLink.from]?.node.label} &rarr; {positions[focusedLink.to]?.node.label}
                </div>
              </div>
            </div>
            {focusedLink.label && <div className="text-[11px] text-slate-300">{focusedLink.label}</div>}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800">
              {focusedLink.protocol && <MiniStat label="Protocol" value={focusedLink.protocol} color="cyan" />}
              {focusedLink.latency && <MiniStat label="Latency" value={focusedLink.latency} color="amber" />}
              {focusedLink.volume && <MiniStat label="Volume" value={focusedLink.volume} color="emerald" />}
            </div>
            {focusedLink.data && (
              <div className="pt-2 border-t border-slate-800">
                <div className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-0.5">Payload</div>
                <div className="text-[10px] text-slate-300">{focusedLink.data}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-mono flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          {Object.entries({
            Frontend: TYPE_STYLES.frontend,
            API: TYPE_STYLES.api,
            Databricks: TYPE_STYLES.databricks,
            'ML / Agent': TYPE_STYLES.ml,
            Storage: TYPE_STYLES.storage,
            Stream: TYPE_STYLES.stream,
          }).map(([name, s]) => (
            <div key={name} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ background: s.fill, border: `1.5px solid ${s.border}` }}
              />
              <span>{name}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-slate-600">
          <span>Hover for details</span>
          <span className="text-slate-800">|</span>
          <span>Click to pin</span>
          <span className="text-slate-800">|</span>
          <span>Scroll to pan</span>
        </div>
      </div>

      <style>{`
        @keyframes dashflow { to { stroke-dashoffset: -18; } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
        .arch-flow { animation: dashflow 1.2s linear infinite; }
      `}</style>
    </div>
  );
}

function DetailCell({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    cyan: 'text-cyan-400', emerald: 'text-emerald-400', amber: 'text-amber-400', red: 'text-red-400',
  };
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-md p-2">
      <div className={`flex items-center gap-1 text-[9px] font-mono font-bold uppercase tracking-wider mb-0.5 ${colors[color]}`}>
        {icon}{label}
      </div>
      <div className="text-[10px] text-slate-300 leading-tight">{value}</div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  const colors: Record<string, string> = {
    cyan: 'text-cyan-300', amber: 'text-amber-300', emerald: 'text-emerald-300',
  };
  return (
    <div>
      <div className="text-[8px] text-slate-500 uppercase font-mono">{label}</div>
      <div className={`text-[10px] font-mono font-semibold ${colors[color]} truncate`}>{value}</div>
    </div>
  );
}
