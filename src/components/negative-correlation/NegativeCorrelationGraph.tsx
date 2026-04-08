import { useEffect, useRef, useState } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';

interface Detection {
  id: string;
  rule_name?: string;
  rule_code?: string;
  rule_category?: string;
  entity_type: string;
  entity_id: string;
  confidence_score: number;
  severity: string;
  status: string;
  observed_event_detail: any;
  missing_event_detail: any;
  physics_violation: any;
}

interface Props {
  detections: Detection[];
  loading: boolean;
}

interface GNode {
  id: string;
  label: string;
  type: 'entity' | 'observed' | 'missing' | 'rule';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  glow: string;
  pulse?: boolean;
  detection?: Detection;
}

interface GEdge {
  from: string;
  to: string;
  color: string;
  dashed: boolean;
  label?: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  missing_prerequisite: '#ef4444',
  impossible_coexistence: '#f59e0b',
  missing_consequence: '#06b6d4',
  temporal_impossibility: '#f97316',
  physics_violation: '#f43f5e',
};

export default function NegativeCorrelationGraph({ detections, loading }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef(0);
  const nodesRef = useRef<GNode[]>([]);
  const edgesRef = useRef<GEdge[]>([]);
  const frameRef = useRef(0);
  const hoveredRef = useRef<GNode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedDetection, setSelectedDetection] = useState<Detection | null>(null);

  useEffect(() => {
    if (!detections.length) return;

    const nodes: GNode[] = [];
    const edges: GEdge[] = [];
    const entitySet = new Set<string>();
    const w = 800, h = 500;

    detections.forEach((det, di) => {
      const angle = (di / detections.length) * Math.PI * 2;
      const radius = 180;
      const cx = w / 2 + Math.cos(angle) * radius;
      const cy = h / 2 + Math.sin(angle) * radius;
      const catColor = CATEGORY_COLORS[det.rule_category || ''] || '#06b6d4';

      const entityKey = `entity-${det.entity_type}-${det.entity_id}`;
      if (!entitySet.has(entityKey)) {
        entitySet.add(entityKey);
        const eAngle = angle + Math.PI * 0.1;
        nodes.push({
          id: entityKey,
          label: det.entity_id,
          type: 'entity',
          x: w / 2 + Math.cos(eAngle) * (radius - 60) + (Math.random() - 0.5) * 30,
          y: h / 2 + Math.sin(eAngle) * (radius - 60) + (Math.random() - 0.5) * 30,
          vx: 0, vy: 0,
          radius: 14,
          color: '#3b82f6',
          glow: 'rgba(59, 130, 246, 0.2)',
        });
      }

      const obsId = `obs-${det.id}`;
      nodes.push({
        id: obsId,
        label: det.rule_code || 'OBS',
        type: 'observed',
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 40,
        vx: 0, vy: 0,
        radius: 10,
        color: '#10b981',
        glow: 'rgba(16, 185, 129, 0.2)',
        detection: det,
      });

      const misId = `mis-${det.id}`;
      nodes.push({
        id: misId,
        label: 'ABSENT',
        type: 'missing',
        x: cx + Math.cos(angle) * 50 + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(angle) * 50 + (Math.random() - 0.5) * 20,
        vx: 0, vy: 0,
        radius: 10,
        color: catColor,
        glow: `${catColor}33`,
        pulse: true,
        detection: det,
      });

      edges.push({
        from: `entity-${det.entity_type}-${det.entity_id}`,
        to: obsId,
        color: '#10b98188',
        dashed: false,
        label: 'generated',
      });

      edges.push({
        from: obsId,
        to: misId,
        color: `${catColor}66`,
        dashed: true,
        label: 'expected',
      });
    });

    nodesRef.current = nodes;
    edgesRef.current = edges;
  }, [detections]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.scale(2, 2);
    };
    resize();
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let found: GNode | null = null;
      for (const node of nodesRef.current) {
        const dx = mx - node.x;
        const dy = my - node.y;
        if (Math.sqrt(dx * dx + dy * dy) < node.radius + 4) {
          found = node;
          break;
        }
      }
      hoveredRef.current = found;
      canvas.style.cursor = found ? 'pointer' : 'default';
    };

    const handleClick = () => {
      const h = hoveredRef.current;
      if (h?.detection) setSelectedDetection(h.detection);
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    const animate = () => {
      frameRef.current++;
      ctx.clearRect(0, 0, w, h);
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const nodeMap = new Map(nodes.map(n => [n.id, n]));

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minD = nodes[i].radius + nodes[j].radius + 25;
          if (dist < minD) {
            const f = (minD - dist) * 0.015;
            nodes[i].vx -= (dx / dist) * f;
            nodes[i].vy -= (dy / dist) * f;
            nodes[j].vx += (dx / dist) * f;
            nodes[j].vy += (dy / dist) * f;
          }
        }
        nodes[i].vx += (w / 2 - nodes[i].x) * 0.0002;
        nodes[i].vy += (h / 2 - nodes[i].y) * 0.0002;
        nodes[i].vx *= 0.93;
        nodes[i].vy *= 0.93;
        nodes[i].x = Math.max(20, Math.min(w - 20, nodes[i].x + nodes[i].vx));
        nodes[i].y = Math.max(20, Math.min(h - 20, nodes[i].y + nodes[i].vy));
      }

      for (const edge of edges) {
        const from = nodeMap.get(edge.from);
        const to = nodeMap.get(edge.to);
        if (!from || !to) continue;

        ctx.beginPath();
        if (edge.dashed) {
          ctx.setLineDash([4, 4]);
          const dashOffset = frameRef.current * 0.5;
          ctx.lineDashOffset = -dashOffset;
        } else {
          ctx.setLineDash([]);
        }
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.strokeStyle = edge.color;
        ctx.lineWidth = edge.dashed ? 1.5 : 1;
        ctx.stroke();
        ctx.setLineDash([]);

        if (edge.dashed) {
          const mx = (from.x + to.x) / 2;
          const my = (from.y + to.y) / 2;
          const pulse = Math.sin(frameRef.current * 0.08) * 0.4 + 0.6;
          ctx.beginPath();
          ctx.arc(mx, my, 3, 0, Math.PI * 2);
          ctx.fillStyle = edge.color.replace(/[\d.]+\)$/, `${pulse})`);
          ctx.fill();
        }
      }

      for (const node of nodes) {
        const isHovered = hoveredRef.current === node;

        if (node.type === 'missing') {
          const pulse = Math.sin(frameRef.current * 0.06 + parseFloat(node.id.slice(-4)) * 0.1) * 4 + 4;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + pulse, 0, Math.PI * 2);
          ctx.strokeStyle = node.color + '22';
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
          ctx.fillStyle = node.glow;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);

        if (node.type === 'missing') {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
          ctx.fill();
          ctx.strokeStyle = node.color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 2]);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = node.color;
          ctx.font = 'bold 7px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('?', node.x, node.y);
        } else {
          const grad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.radius);
          grad.addColorStop(0, node.color + 'cc');
          grad.addColorStop(1, node.color + '44');
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.strokeStyle = node.color + (isHovered ? 'ff' : '88');
          ctx.lineWidth = isHovered ? 2 : 1;
          ctx.stroke();

          ctx.fillStyle = '#fff';
          ctx.font = `${node.type === 'entity' ? 'bold ' : ''}${node.type === 'entity' ? 8 : 7}px Inter, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const lbl = node.label.length > 12 ? node.label.slice(0, 11) + '..' : node.label;
          ctx.fillText(lbl, node.x, node.y);
        }
      }

      if (hoveredRef.current && hoveredRef.current.detection) {
        const node = hoveredRef.current;
        const det = node.detection!;
        const tx = Math.min(node.x + 15, w - 220);
        const ty = Math.max(node.y - 50, 10);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tx, ty, 200, 50, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(det.rule_name || '', tx + 8, ty + 15);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '8px Inter, sans-serif';
        ctx.fillText(`${det.entity_type}: ${det.entity_id}`, tx + 8, ty + 30);
        ctx.fillText(`Confidence: ${det.confidence_score}%`, tx + 8, ty + 42);
      }

      animRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animRef.current);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [detections]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative bg-slate-950/50 border border-slate-700/30 rounded-xl overflow-hidden" style={{ height: isFullscreen ? '75vh' : '480px' }}>
        <canvas ref={canvasRef} className="w-full h-full" />

        <div className="absolute top-3 left-3 bg-slate-900/80 backdrop-blur-sm rounded-lg p-2 border border-slate-700/30">
          <p className="text-[10px] font-semibold text-slate-400 mb-1.5">Absence Graph</p>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-500/60" />
              <span className="text-[9px] text-slate-500">Entity (User/Host)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-emerald-500/60" />
              <span className="text-[9px] text-slate-500">Observed Event</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full border border-dashed border-red-500/60 bg-transparent" />
              <span className="text-[9px] text-slate-500">Missing (Absent) Event</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-6 border-t border-dashed border-red-500/40" />
              <span className="text-[9px] text-slate-500">Expected link (broken)</span>
            </div>
          </div>
        </div>

        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="absolute top-3 right-3 p-1.5 rounded-lg bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-white transition-colors"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {selectedDetection && (
        <div className="bg-slate-900/50 border border-cyan-500/20 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-cyan-400">{selectedDetection.rule_code}</span>
              <span className="text-sm font-semibold text-white">{selectedDetection.rule_name}</span>
            </div>
            <button
              onClick={() => setSelectedDetection(null)}
              className="text-xs text-slate-500 hover:text-white transition-colors"
            >
              Close
            </button>
          </div>
          <p className="text-xs text-slate-400">
            Entity: <span className="text-white font-mono">{selectedDetection.entity_id}</span> |
            Confidence: <span className="text-white">{selectedDetection.confidence_score}%</span> |
            Status: <span className="text-white">{selectedDetection.status}</span>
          </p>
        </div>
      )}
    </div>
  );
}
