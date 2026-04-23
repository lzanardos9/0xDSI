import { useMemo, useState } from 'react';
import { Database, Cloud, Cpu, Zap, Brain, Server, Globe, User, Layers, GitBranch, Boxes, Activity } from 'lucide-react';

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

const LAYER_ORDER = ['client', 'edge', 'platform', 'lakehouse', 'ml', 'external'];
const LAYER_LABELS: Record<string, string> = {
  client: 'Client / UI',
  edge: 'Edge & API',
  platform: 'Platform Services',
  lakehouse: 'Databricks Lakehouse',
  ml: 'Mosaic AI & ML',
  external: 'External Systems',
};

const TYPE_STYLES: Record<string, { bg: string; border: string; text: string; icon: any }> = {
  actor: { bg: 'bg-slate-800/80', border: 'border-slate-600', text: 'text-slate-200', icon: User },
  frontend: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/50', text: 'text-cyan-300', icon: Globe },
  api: { bg: 'bg-blue-500/10', border: 'border-blue-500/50', text: 'text-blue-300', icon: Server },
  stream: { bg: 'bg-amber-500/10', border: 'border-amber-500/50', text: 'text-amber-300', icon: Activity },
  storage: { bg: 'bg-teal-500/10', border: 'border-teal-500/50', text: 'text-teal-300', icon: Database },
  ml: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/50', text: 'text-emerald-300', icon: Brain },
  agent: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/50', text: 'text-emerald-300', icon: Cpu },
  databricks: { bg: 'bg-orange-500/10', border: 'border-orange-500/60', text: 'text-orange-300', icon: Boxes },
  external: { bg: 'bg-slate-700/40', border: 'border-slate-600', text: 'text-slate-300', icon: Cloud },
};

const NODE_W = 180;
const NODE_H = 78;
const COL_GAP = 80;
const ROW_GAP = 24;

export default function ArchitectureDiagram({ nodes, links }: ArchitectureDiagramProps) {
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredLink, setHoveredLink] = useState<number | null>(null);
  const [pinnedNode, setPinnedNode] = useState<string | null>(null);

  const { layout, width, height } = useMemo(() => {
    const layers: Record<string, DiagramNode[]> = {};
    nodes.forEach(n => {
      const layer = n.layer || 'platform';
      if (!layers[layer]) layers[layer] = [];
      layers[layer].push(n);
    });

    const activeLayers = LAYER_ORDER.filter(l => layers[l]?.length);
    const positions: Record<string, { x: number; y: number; node: DiagramNode }> = {};
    let maxRows = 0;

    activeLayers.forEach((layer, colIdx) => {
      const layerNodes = layers[layer] || [];
      maxRows = Math.max(maxRows, layerNodes.length);
      layerNodes.forEach((n, rowIdx) => {
        positions[n.id] = {
          x: colIdx * (NODE_W + COL_GAP) + 40,
          y: rowIdx * (NODE_H + ROW_GAP) + 50,
          node: n,
        };
      });
    });

    const w = activeLayers.length * (NODE_W + COL_GAP) + 80;
    const h = maxRows * (NODE_H + ROW_GAP) + 80;
    return { layout: { positions, activeLayers }, width: w, height: h };
  }, [nodes]);

  const pathFor = (from: string, to: string) => {
    const a = layout.positions[from];
    const b = layout.positions[to];
    if (!a || !b) return '';
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const cx = (x1 + x2) / 2;
    return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  };

  const focusedNode = pinnedNode || hoveredNode;
  const focused = focusedNode ? layout.positions[focusedNode]?.node : null;
  const focusedLink = hoveredLink !== null ? links[hoveredLink] : null;

  const isNodeHighlighted = (id: string) => {
    if (!focusedNode) return true;
    if (id === focusedNode) return true;
    return links.some(l =>
      (l.from === focusedNode && l.to === id) ||
      (l.to === focusedNode && l.from === id)
    );
  };

  const isLinkHighlighted = (l: DiagramLink, idx: number) => {
    if (hoveredLink === idx) return true;
    if (!focusedNode) return true;
    return l.from === focusedNode || l.to === focusedNode;
  };

  return (
    <div className="relative">
      {/* Layer headers */}
      <div className="flex mb-3 px-10">
        {layout.activeLayers.map((layer) => (
          <div key={layer} style={{ width: NODE_W + COL_GAP }} className="text-[9px] font-mono font-bold text-slate-500 uppercase tracking-[0.15em]">
            {LAYER_LABELS[layer] || layer}
          </div>
        ))}
      </div>

      <div className="relative overflow-x-auto rounded-xl bg-gradient-to-br from-[#060912] to-[#0b0f1e] border border-slate-800" style={{ minHeight: height + 20 }}>
        <svg width={width} height={height} className="block">
          <defs>
            <pattern id="archgrid" width="24" height="24" patternUnits="userSpaceOnUse">
              <path d="M 24 0 L 0 0 0 24" fill="none" stroke="#0f172a" strokeWidth="1" />
            </pattern>
            <linearGradient id="edge-grad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#06B6D4" stopOpacity="0.7" />
              <stop offset="100%" stopColor="#10B981" stopOpacity="0.7" />
            </linearGradient>
            <linearGradient id="edge-grad-dim" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#475569" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#475569" stopOpacity="0.3" />
            </linearGradient>
            <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#10B981" />
            </marker>
            <marker id="arrow-dim" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" opacity="0.4" />
            </marker>
          </defs>
          <rect width={width} height={height} fill="url(#archgrid)" />

          {/* Links */}
          {links.map((l, idx) => {
            const highlighted = isLinkHighlighted(l, idx);
            const d = pathFor(l.from, l.to);
            if (!d) return null;
            return (
              <g key={idx} onMouseEnter={() => setHoveredLink(idx)} onMouseLeave={() => setHoveredLink(null)} className="cursor-pointer">
                <path d={d} stroke="transparent" strokeWidth={14} fill="none" />
                <path
                  d={d}
                  stroke={highlighted ? 'url(#edge-grad)' : 'url(#edge-grad-dim)'}
                  strokeWidth={highlighted ? 2 : 1.5}
                  fill="none"
                  strokeDasharray="5 4"
                  markerEnd={highlighted ? 'url(#arrow)' : 'url(#arrow-dim)'}
                  className={highlighted ? 'animate-[dashflow_1.2s_linear_infinite]' : ''}
                  style={{ opacity: highlighted ? 1 : 0.35 }}
                />
              </g>
            );
          })}

          {/* Nodes */}
          {Object.values(layout.positions).map(({ x, y, node }) => {
            const style = TYPE_STYLES[node.type] || TYPE_STYLES.api;
            const Icon = style.icon;
            const highlighted = isNodeHighlighted(node.id);
            const isFocused = node.id === focusedNode;
            return (
              <g
                key={node.id}
                transform={`translate(${x}, ${y})`}
                style={{ opacity: highlighted ? 1 : 0.35, cursor: 'pointer', transition: 'opacity 0.2s' }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
                onClick={() => setPinnedNode(pinnedNode === node.id ? null : node.id)}
              >
                <foreignObject width={NODE_W} height={NODE_H}>
                  <div
                    className={`w-full h-full rounded-lg border ${style.bg} ${style.border} px-3 py-2 flex flex-col justify-center gap-1 transition-all ${isFocused ? 'ring-2 ring-cyan-400 shadow-lg shadow-cyan-500/30' : ''}`}
                    style={{ backdropFilter: 'blur(4px)' }}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon size={12} className={style.text} />
                      <span className={`text-[11px] font-bold ${style.text} truncate`}>{node.label}</span>
                    </div>
                    {node.databricks_product && (
                      <div className="text-[8px] font-mono text-orange-400 bg-orange-500/10 border border-orange-500/30 rounded px-1.5 py-0.5 w-fit">
                        {node.databricks_product}
                      </div>
                    )}
                    {node.tech && node.tech.length > 0 && !node.databricks_product && (
                      <div className="text-[8px] font-mono text-slate-500 truncate">{node.tech.slice(0, 2).join(' / ')}</div>
                    )}
                  </div>
                </foreignObject>
              </g>
            );
          })}

          <style>{`
            @keyframes dashflow {
              to { stroke-dashoffset: -18; }
            }
          `}</style>
        </svg>

        {/* Detail tooltip for focused node */}
        {focused && (
          <div className="absolute top-3 right-3 w-80 bg-[#0a0e1a]/95 border border-cyan-500/40 rounded-xl p-4 shadow-2xl backdrop-blur-md pointer-events-auto">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg ${TYPE_STYLES[focused.type]?.bg || ''} border ${TYPE_STYLES[focused.type]?.border || ''} flex items-center justify-center`}>
                  {(() => {
                    const Icon = TYPE_STYLES[focused.type]?.icon || Server;
                    return <Icon size={14} className={TYPE_STYLES[focused.type]?.text} />;
                  })()}
                </div>
                <div className="text-sm font-bold text-white">{focused.label}</div>
              </div>
              <div className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">{focused.layer}</div>
            </div>
            <div className="text-[11px] text-slate-400 leading-relaxed mb-3">{focused.description}</div>
            {focused.databricks_product && (
              <div className="mb-3 flex items-center gap-2 bg-orange-500/5 border border-orange-500/30 rounded-lg px-2.5 py-1.5">
                <Layers size={12} className="text-orange-400" />
                <span className="text-[10px] font-mono font-bold text-orange-300">DATABRICKS:</span>
                <span className="text-[10px] text-orange-200">{focused.databricks_product}</span>
              </div>
            )}
            {focused.tech && focused.tech.length > 0 && (
              <div className="mb-3">
                <div className="text-[9px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Stack</div>
                <div className="flex flex-wrap gap-1">
                  {focused.tech.map(t => (
                    <span key={t} className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {focused.details && (
              <div className="space-y-1.5 pt-3 border-t border-slate-800">
                {focused.details.inputs && <DetailRow icon={<GitBranch size={10} />} label="Inputs" value={focused.details.inputs} />}
                {focused.details.outputs && <DetailRow icon={<Zap size={10} />} label="Outputs" value={focused.details.outputs} />}
                {focused.details.scale && <DetailRow icon={<Activity size={10} />} label="Scale" value={focused.details.scale} />}
                {focused.details.security && <DetailRow icon={<Cpu size={10} />} label="Security" value={focused.details.security} />}
              </div>
            )}
            {pinnedNode === focused.id && (
              <div className="mt-3 text-[9px] text-cyan-400 font-mono">Click node again to unpin</div>
            )}
          </div>
        )}

        {/* Link tooltip */}
        {focusedLink && (
          <div className="absolute bottom-3 right-3 w-72 bg-[#0a0e1a]/95 border border-emerald-500/40 rounded-xl p-3 shadow-2xl backdrop-blur-md">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/40 flex items-center justify-center">
                <GitBranch size={12} className="text-emerald-400" />
              </div>
              <div className="text-xs font-bold text-emerald-300">
                {focusedLink.from} &rarr; {focusedLink.to}
              </div>
            </div>
            {focusedLink.label && <div className="text-[11px] text-slate-300 mb-1">{focusedLink.label}</div>}
            <div className="grid grid-cols-2 gap-2 mt-2">
              {focusedLink.protocol && <div><div className="text-[8px] text-slate-500 uppercase">Protocol</div><div className="text-[10px] font-mono text-cyan-300">{focusedLink.protocol}</div></div>}
              {focusedLink.latency && <div><div className="text-[8px] text-slate-500 uppercase">Latency</div><div className="text-[10px] font-mono text-amber-300">{focusedLink.latency}</div></div>}
              {focusedLink.volume && <div><div className="text-[8px] text-slate-500 uppercase">Volume</div><div className="text-[10px] font-mono text-emerald-300">{focusedLink.volume}</div></div>}
              {focusedLink.data && <div className="col-span-2"><div className="text-[8px] text-slate-500 uppercase">Data</div><div className="text-[10px] text-slate-300">{focusedLink.data}</div></div>}
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <div className="flex items-center gap-3">
          <LegendItem color="bg-cyan-500/40 border-cyan-500" label="Frontend" />
          <LegendItem color="bg-blue-500/40 border-blue-500" label="API" />
          <LegendItem color="bg-orange-500/40 border-orange-500" label="Databricks" />
          <LegendItem color="bg-emerald-500/40 border-emerald-500" label="ML / Agent" />
          <LegendItem color="bg-teal-500/40 border-teal-500" label="Storage" />
        </div>
        <div>Hover a node or link to see details -- click to pin</div>
      </div>
    </div>
  );
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <div className="text-slate-500 mt-0.5">{icon}</div>
      <div className="flex-1">
        <div className="text-[9px] font-mono text-slate-500 uppercase">{label}</div>
        <div className="text-[10px] text-slate-300 leading-snug">{value}</div>
      </div>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={`w-2.5 h-2.5 rounded border ${color}`} />
      <span>{label}</span>
    </div>
  );
}
