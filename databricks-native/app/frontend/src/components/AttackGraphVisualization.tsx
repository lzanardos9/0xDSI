import { useState, useEffect, useRef, useMemo, useCallback } from 'react';

interface GraphEdge {
  from: string;
  to: string;
  edgeType: 'lateral_movement' | 'privilege_escalation' | 'data_access' | 'trust_relationship' | 'network_path';
  transitionProbability: number;
  modifiers: string[];
}

interface HighRiskNode {
  node: string;
  type: 'identity' | 'endpoint' | 'service' | 'cloud' | 'data';
  riskCentrality: number;
  vulnerabilityScore: number;
  exposureLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  simulationAppearanceRate: string;
  controlCoverage: number;
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  type: string;
  riskCentrality: number;
  exposureLevel: string;
  controlCoverage: number;
}

interface Props {
  edges: GraphEdge[];
  highRiskNodes: HighRiskNode[];
}

const EDGE_COLORS: Record<string, string> = {
  lateral_movement: '#ef4444',
  privilege_escalation: '#f97316',
  data_access: '#06b6d4',
  trust_relationship: '#10b981',
  network_path: '#3b82f6',
};

const EDGE_LABELS: Record<string, string> = {
  lateral_movement: 'LATERAL',
  privilege_escalation: 'PRIVESC',
  data_access: 'DATA',
  trust_relationship: 'TRUST',
  network_path: 'NETWORK',
};

const NODE_COLORS: Record<string, { fill: string; stroke: string; icon: string }> = {
  identity: { fill: '#7c3aed20', stroke: '#7c3aed', icon: 'ID' },
  endpoint: { fill: '#06b6d420', stroke: '#06b6d4', icon: 'EP' },
  service: { fill: '#f9731620', stroke: '#f97316', icon: 'SV' },
  cloud: { fill: '#3b82f620', stroke: '#3b82f6', icon: 'CL' },
  data: { fill: '#ef444420', stroke: '#ef4444', icon: 'DB' },
};

function getExposureRingColor(level: string) {
  switch (level) {
    case 'Critical': return '#ef4444';
    case 'High': return '#f97316';
    case 'Medium': return '#eab308';
    default: return '#22c55e';
  }
}

export default function AttackGraphVisualization({ edges, highRiskNodes }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<number | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [dragNode, setDragNode] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState(0);
  const animRef = useRef<number>(0);

  const WIDTH = 680;
  const HEIGHT = 420;

  const nodeMap = useMemo(() => {
    const map = new Map<string, { type: string; riskCentrality: number; exposureLevel: string; controlCoverage: number }>();
    highRiskNodes.forEach(n => {
      map.set(n.node, { type: n.type, riskCentrality: n.riskCentrality, exposureLevel: n.exposureLevel, controlCoverage: n.controlCoverage });
    });
    return map;
  }, [highRiskNodes]);

  const uniqueNodeIds = useMemo(() => {
    const set = new Set<string>();
    edges.forEach(e => { set.add(e.from); set.add(e.to); });
    return Array.from(set);
  }, [edges]);

  useEffect(() => {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const radius = Math.min(WIDTH, HEIGHT) * 0.32;
    const initial: GraphNode[] = uniqueNodeIds.map((id, i) => {
      const angle = (2 * Math.PI * i) / uniqueNodeIds.length - Math.PI / 2;
      const info = nodeMap.get(id);
      return {
        id,
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        vx: 0,
        vy: 0,
        type: info?.type || 'service',
        riskCentrality: info?.riskCentrality || 50,
        exposureLevel: info?.exposureLevel || 'Medium',
        controlCoverage: info?.controlCoverage || 50,
      };
    });

    const iterations = 120;
    for (let iter = 0; iter < iterations; iter++) {
      const repulsion = 8000;
      for (let i = 0; i < initial.length; i++) {
        initial[i].vx = 0;
        initial[i].vy = 0;
        for (let j = 0; j < initial.length; j++) {
          if (i === j) continue;
          const dx = initial[i].x - initial[j].x;
          const dy = initial[i].y - initial[j].y;
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const force = repulsion / (dist * dist);
          initial[i].vx += (dx / dist) * force;
          initial[i].vy += (dy / dist) * force;
        }
      }

      const springK = 0.008;
      const restLen = 140;
      edges.forEach(e => {
        const a = initial.find(n => n.id === e.from);
        const b = initial.find(n => n.id === e.to);
        if (!a || !b) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const displacement = dist - restLen;
        const force = springK * displacement;
        a.vx += (dx / dist) * force;
        a.vy += (dy / dist) * force;
        b.vx -= (dx / dist) * force;
        b.vy -= (dy / dist) * force;
      });

      const centerPull = 0.01;
      initial.forEach(n => {
        n.vx += (cx - n.x) * centerPull;
        n.vy += (cy - n.y) * centerPull;
      });

      const damping = 0.85;
      const pad = 50;
      initial.forEach(n => {
        n.x += n.vx * damping;
        n.y += n.vy * damping;
        n.x = Math.max(pad, Math.min(WIDTH - pad, n.x));
        n.y = Math.max(pad, Math.min(HEIGHT - pad, n.y));
      });
    }

    setNodes(initial);
  }, [uniqueNodeIds, edges, nodeMap]);

  useEffect(() => {
    let running = true;
    const tick = () => {
      if (!running) return;
      setAnimPhase(prev => (prev + 1) % 200);
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, []);

  const handleMouseDown = useCallback((nodeId: string) => {
    setDragNode(nodeId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragNode || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * HEIGHT;
    setNodes(prev => prev.map(n =>
      n.id === dragNode ? { ...n, x: Math.max(50, Math.min(WIDTH - 50, x)), y: Math.max(50, Math.min(HEIGHT - 50, y)) } : n
    ));
  }, [dragNode]);

  const handleMouseUp = useCallback(() => {
    setDragNode(null);
  }, []);

  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach(n => map.set(n.id, { x: n.x, y: n.y }));
    return map;
  }, [nodes]);

  if (edges.length === 0 || nodes.length === 0) return null;

  return (
    <div className="relative rounded-xl border border-slate-700/40 bg-slate-900/80 overflow-hidden">
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-2">
        {Object.entries(EDGE_LABELS).map(([key, label]) => {
          const hasType = edges.some(e => e.edgeType === key);
          if (!hasType) return null;
          return (
            <div key={key} className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/80 border border-slate-700/40 backdrop-blur-sm">
              <div className="w-3 h-0.5 rounded" style={{ background: EDGE_COLORS[key] }} />
              <span className="text-[9px] font-semibold tracking-wider text-slate-400">{label}</span>
            </div>
          );
        })}
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        style={{ minHeight: 320 }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <defs>
          <radialGradient id="graph-bg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.03" />
            <stop offset="100%" stopColor="transparent" stopOpacity="0" />
          </radialGradient>
          {Object.entries(EDGE_COLORS).map(([key, color]) => (
            <marker
              key={key}
              id={`arrow-${key}`}
              viewBox="0 0 10 6"
              refX="9"
              refY="3"
              markerWidth="8"
              markerHeight="6"
              orient="auto"
            >
              <path d="M0,0 L10,3 L0,6 Z" fill={color} opacity="0.8" />
            </marker>
          ))}
          <filter id="node-glow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="edge-glow">
            <feGaussianBlur stdDeviation="2" />
          </filter>
        </defs>

        <rect width={WIDTH} height={HEIGHT} fill="url(#graph-bg-glow)" />

        <g className="grid-lines" opacity="0.06">
          {Array.from({ length: 14 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 50} y1={0} x2={i * 50} y2={HEIGHT} stroke="#94a3b8" strokeWidth="0.5" />
          ))}
          {Array.from({ length: 9 }).map((_, i) => (
            <line key={`h${i}`} x1={0} y1={i * 50} x2={WIDTH} y2={i * 50} stroke="#94a3b8" strokeWidth="0.5" />
          ))}
        </g>

        {edges.map((edge, i) => {
          const from = nodePositions.get(edge.from);
          const to = nodePositions.get(edge.to);
          if (!from || !to) return null;

          const color = EDGE_COLORS[edge.edgeType] || '#64748b';
          const isHovered = hoveredEdge === i ||
            hoveredNode === edge.from || hoveredNode === edge.to;
          const opacity = hoveredNode
            ? (hoveredNode === edge.from || hoveredNode === edge.to ? 1 : 0.15)
            : hoveredEdge !== null
              ? (hoveredEdge === i ? 1 : 0.2)
              : 0.7;

          const dx = to.x - from.x;
          const dy = to.y - from.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const nodeR = 22;
          const ux = dx / dist;
          const uy = dy / dist;
          const x1 = from.x + ux * nodeR;
          const y1 = from.y + uy * nodeR;
          const x2 = to.x - ux * (nodeR + 8);
          const y2 = to.y - uy * (nodeR + 8);

          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const perpX = -uy * 20;
          const perpY = ux * 20;
          const cx1 = mx + perpX;
          const cy1 = my + perpY;

          const pathD = `M${x1},${y1} Q${cx1},${cy1} ${x2},${y2}`;
          const pct = ((animPhase * 0.5 + i * 30) % 100);

          return (
            <g key={i}
              onMouseEnter={() => setHoveredEdge(i)}
              onMouseLeave={() => setHoveredEdge(null)}
              style={{ cursor: 'pointer' }}
            >
              <path
                d={pathD}
                stroke={color}
                strokeWidth={isHovered ? 3 : 1.5}
                fill="none"
                opacity={opacity}
                markerEnd={`url(#arrow-${edge.edgeType})`}
                filter={isHovered ? 'url(#edge-glow)' : undefined}
                style={{ transition: 'opacity 0.3s, stroke-width 0.2s' }}
              />
              {isHovered && (
                <path d={pathD} stroke={color} strokeWidth="6" fill="none" opacity="0.1" />
              )}
              <circle r="3" fill={color} opacity={opacity * 0.9}>
                <animateMotion dur="3s" repeatCount="indefinite" begin={`${i * 0.4}s`}>
                  <mpath href={`#flow-${i}`} />
                </animateMotion>
              </circle>
              <path id={`flow-${i}`} d={pathD} fill="none" stroke="none" />

              {isHovered && (
                <g>
                  <rect
                    x={mx + perpX * 0.5 - 45}
                    y={my + perpY * 0.5 - 12}
                    width={90}
                    height={24}
                    rx={4}
                    fill="#0f172a"
                    stroke={color}
                    strokeWidth="1"
                    opacity="0.95"
                  />
                  <text
                    x={mx + perpX * 0.5}
                    y={my + perpY * 0.5 + 3}
                    textAnchor="middle"
                    fill={color}
                    fontSize="9"
                    fontWeight="700"
                    fontFamily="monospace"
                  >
                    P={`${(edge.transitionProbability * 100).toFixed(0)}%`} {EDGE_LABELS[edge.edgeType]}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {nodes.map(node => {
          const colors = NODE_COLORS[node.type] || NODE_COLORS.service;
          const isHovered = hoveredNode === node.id;
          const isDimmed = hoveredNode !== null && hoveredNode !== node.id &&
            !edges.some(e => (e.from === hoveredNode && e.to === node.id) || (e.to === hoveredNode && e.from === node.id));
          const ringColor = getExposureRingColor(node.exposureLevel);
          const radius = 18 + (node.riskCentrality / 100) * 8;
          const pulseR = radius + 4 + Math.sin(animPhase * 0.08) * 3;

          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              onMouseEnter={() => setHoveredNode(node.id)}
              onMouseLeave={() => setHoveredNode(null)}
              onMouseDown={() => handleMouseDown(node.id)}
              style={{
                cursor: dragNode === node.id ? 'grabbing' : 'grab',
                opacity: isDimmed ? 0.2 : 1,
                transition: 'opacity 0.3s',
              }}
            >
              {(node.exposureLevel === 'Critical' || isHovered) && (
                <circle
                  r={pulseR}
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="1"
                  opacity={0.25}
                />
              )}

              <circle
                r={radius}
                fill={colors.fill}
                stroke={isHovered ? '#fff' : colors.stroke}
                strokeWidth={isHovered ? 2 : 1.5}
                filter={isHovered ? 'url(#node-glow)' : undefined}
              />

              <circle
                r={radius}
                fill="none"
                stroke={ringColor}
                strokeWidth="2.5"
                strokeDasharray={`${(node.riskCentrality / 100) * 2 * Math.PI * radius} ${2 * Math.PI * radius}`}
                strokeLinecap="round"
                transform="rotate(-90)"
                opacity="0.6"
              />

              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill={colors.stroke}
                fontSize="9"
                fontWeight="800"
                fontFamily="monospace"
              >
                {colors.icon}
              </text>

              <text
                y={radius + 14}
                textAnchor="middle"
                fill={isHovered ? '#e2e8f0' : '#94a3b8'}
                fontSize="8.5"
                fontWeight="600"
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}
              >
                {node.id.length > 18 ? node.id.slice(0, 16) + '..' : node.id}
              </text>

              {isHovered && (
                <g>
                  <rect
                    x={-75}
                    y={-(radius + 42)}
                    width={150}
                    height={32}
                    rx={6}
                    fill="#0f172a"
                    stroke={colors.stroke}
                    strokeWidth="1"
                    opacity="0.95"
                  />
                  <text
                    y={-(radius + 28)}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="8.5"
                    fontWeight="700"
                  >
                    Risk: {node.riskCentrality}% | Ctrl: {node.controlCoverage}%
                  </text>
                  <text
                    y={-(radius + 17)}
                    textAnchor="middle"
                    fill={ringColor}
                    fontSize="8"
                    fontWeight="600"
                  >
                    {node.exposureLevel.toUpperCase()} EXPOSURE
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
