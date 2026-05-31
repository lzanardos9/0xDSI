import { useEffect, useRef, useState } from 'react';

interface GraphNode {
  id: string;
  label: string;
  type: 'source' | 'condition' | 'detection' | 'action';
  detail: string;
}

interface GraphEdge {
  from: string;
  to: string;
  label: string;
}

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
  severity: string;
}

const TYPE_STYLES: Record<string, { fill: string; stroke: string; glow: string; icon: string }> = {
  source: { fill: '#0ea5e9', stroke: '#38bdf8', glow: '#0ea5e940', icon: 'S' },
  condition: { fill: '#f59e0b', stroke: '#fbbf24', glow: '#f59e0b40', icon: 'C' },
  detection: { fill: '#ef4444', stroke: '#f87171', glow: '#ef444460', icon: 'D' },
  action: { fill: '#22c55e', stroke: '#4ade80', glow: '#22c55e40', icon: 'A' },
};

export default function CorrelationRuleGraph({ nodes, edges, severity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrame = useRef<number>(0);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const particlesRef = useRef<{ edge: number; t: number; speed: number }[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    if (!nodes.length) return;

    const sources = nodes.filter(n => n.type === 'source');
    const conditions = nodes.filter(n => n.type === 'condition');
    const detections = nodes.filter(n => n.type === 'detection');
    const actions = nodes.filter(n => n.type === 'action');

    const W = 860;
    const H = 400;
    const pos: Record<string, { x: number; y: number }> = {};

    const placeColumn = (items: GraphNode[], x: number, startY: number, gap: number) => {
      items.forEach((n, i) => {
        pos[n.id] = { x, y: startY + i * gap };
      });
    };

    const colGap = W / 5;
    placeColumn(sources, colGap * 0.7, H / 2 - ((sources.length - 1) * 70) / 2, 70);
    placeColumn(conditions, colGap * 1.8, H / 2 - ((conditions.length - 1) * 65) / 2, 65);
    placeColumn(detections, colGap * 3, H / 2 - ((detections.length - 1) * 60) / 2, 60);
    placeColumn(actions, colGap * 4.2, H / 2 - ((actions.length - 1) * 65) / 2, 65);

    setPositions(pos);

    const particles: { edge: number; t: number; speed: number }[] = [];
    edges.forEach((_, i) => {
      const count = 2 + Math.floor(Math.random() * 2);
      for (let j = 0; j < count; j++) {
        particles.push({ edge: i, t: Math.random(), speed: 0.003 + Math.random() * 0.004 });
      }
    });
    particlesRef.current = particles;
  }, [nodes, edges]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !Object.keys(positions).length) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = 860 * dpr;
    canvas.height = 400 * dpr;
    canvas.style.width = '860px';
    canvas.style.height = '400px';
    ctx.scale(dpr, dpr);

    const draw = () => {
      timeRef.current += 0.016;
      const t = timeRef.current;
      ctx.clearRect(0, 0, 860, 400);

      edges.forEach((edge, eIdx) => {
        const fromPos = positions[edge.from];
        const toPos = positions[edge.to];
        if (!fromPos || !toPos) return;

        const grad = ctx.createLinearGradient(fromPos.x, fromPos.y, toPos.x, toPos.y);
        const fromNode = nodes.find(n => n.id === edge.from);
        const toNode = nodes.find(n => n.id === edge.to);
        const fromStyle = TYPE_STYLES[fromNode?.type || 'source'];
        const toStyle = TYPE_STYLES[toNode?.type || 'source'];
        grad.addColorStop(0, fromStyle.fill + '60');
        grad.addColorStop(1, toStyle.fill + '60');

        ctx.beginPath();
        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2 + (eIdx % 2 === 0 ? -15 : 15);
        ctx.moveTo(fromPos.x + 22, fromPos.y);
        ctx.quadraticCurveTo(mx, my, toPos.x - 22, toPos.y);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.lineDashOffset = -t * 30;
        ctx.stroke();
        ctx.setLineDash([]);

        const arrowT = 0.92;
        const ax = (1 - arrowT) * (1 - arrowT) * (fromPos.x + 22) + 2 * (1 - arrowT) * arrowT * mx + arrowT * arrowT * (toPos.x - 22);
        const ay = (1 - arrowT) * (1 - arrowT) * fromPos.y + 2 * (1 - arrowT) * arrowT * my + arrowT * arrowT * toPos.y;
        const angle = Math.atan2(toPos.y - my, toPos.x - 22 - mx);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4));
        ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4));
        ctx.closePath();
        ctx.fillStyle = toStyle.fill + 'aa';
        ctx.fill();

        const labelX = mx;
        const labelY = my - 8;
        ctx.font = '9px system-ui';
        ctx.fillStyle = '#64748b';
        ctx.textAlign = 'center';
        ctx.fillText(edge.label, labelX, labelY);
      });

      particlesRef.current.forEach(p => {
        p.t += p.speed;
        if (p.t > 1) p.t -= 1;

        const edge = edges[p.edge];
        if (!edge) return;
        const fromPos = positions[edge.from];
        const toPos = positions[edge.to];
        if (!fromPos || !toPos) return;

        const mx = (fromPos.x + toPos.x) / 2;
        const my = (fromPos.y + toPos.y) / 2 + (p.edge % 2 === 0 ? -15 : 15);
        const pt = p.t;
        const px = (1 - pt) * (1 - pt) * (fromPos.x + 22) + 2 * (1 - pt) * pt * mx + pt * pt * (toPos.x - 22);
        const py = (1 - pt) * (1 - pt) * fromPos.y + 2 * (1 - pt) * pt * my + pt * pt * toPos.y;

        const toNode = nodes.find(n => n.id === edge.to);
        const style = TYPE_STYLES[toNode?.type || 'source'];

        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = style.fill;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = style.fill + '30';
        ctx.fill();
      });

      nodes.forEach(node => {
        const pos = positions[node.id];
        if (!pos) return;
        const style = TYPE_STYLES[node.type];
        const isHovered = hoveredNode === node.id;
        const isDetection = node.type === 'detection';
        const baseR = isDetection ? 26 : 20;
        const r = isHovered ? baseR + 3 : baseR;
        const pulse = isDetection ? Math.sin(t * 3) * 4 : Math.sin(t * 2 + nodes.indexOf(node)) * 2;

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 12 + pulse, 0, Math.PI * 2);
        ctx.fillStyle = style.glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r + 4, 0, Math.PI * 2);
        ctx.strokeStyle = style.stroke + '40';
        ctx.lineWidth = 1;
        ctx.stroke();

        const innerGrad = ctx.createRadialGradient(pos.x - r * 0.3, pos.y - r * 0.3, 0, pos.x, pos.y, r);
        innerGrad.addColorStop(0, style.stroke);
        innerGrad.addColorStop(1, style.fill);
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
        ctx.fillStyle = innerGrad;
        ctx.fill();
        ctx.strokeStyle = style.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = `bold ${isDetection ? 14 : 12}px system-ui`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(style.icon, pos.x, pos.y);

        ctx.font = `bold 10px system-ui`;
        ctx.fillStyle = '#e2e8f0';
        ctx.textBaseline = 'top';
        const label = node.label.length > 20 ? node.label.substring(0, 18) + '..' : node.label;
        ctx.fillText(label, pos.x, pos.y + r + 8);

        if (isHovered && node.detail) {
          ctx.font = '9px system-ui';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(node.detail.substring(0, 35), pos.x, pos.y + r + 22);
        }
      });

      animFrame.current = requestAnimationFrame(draw);
    };

    animFrame.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animFrame.current);
  }, [positions, nodes, edges, hoveredNode]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let found: string | null = null;
    for (const node of nodes) {
      const pos = positions[node.id];
      if (!pos) continue;
      const dx = mx - pos.x;
      const dy = my - pos.y;
      if (dx * dx + dy * dy < 900) {
        found = node.id;
        break;
      }
    }
    setHoveredNode(found);
  };

  if (!nodes.length) return null;

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={860}
        height={400}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredNode(null)}
        className="w-full rounded-xl cursor-crosshair"
        style={{ maxWidth: '860px', height: 'auto', aspectRatio: '860/400' }}
      />
      <div className="flex items-center justify-center gap-6 mt-3">
        {Object.entries(TYPE_STYLES).map(([type, style]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: style.fill }} />
            <span className="text-[10px] text-slate-400 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
