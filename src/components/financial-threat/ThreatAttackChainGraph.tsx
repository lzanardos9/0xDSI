import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Activity } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Detection {
  detection_id: string;
  threat_type: string;
  severity: string;
  confidence: number;
  attack_chain: Array<{
    stage: string;
    detail: string;
    timestamp: string;
    confidence: number;
  }>;
  status: string;
}

interface NodeLayout {
  x: number;
  y: number;
  radius: number;
  stageIndex: number;
  detectionIndex: number;
  detection: Detection;
  chainEntry: Detection['attack_chain'][number];
  color: string;
}

interface Edge {
  from: NodeLayout;
  to: NodeLayout;
  color: string;
}

interface Particle {
  edge: Edge;
  t: number;
  speed: number;
  size: number;
}

interface TooltipData {
  x: number;
  y: number;
  detection: Detection;
  chainEntry: Detection['attack_chain'][number];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KILL_CHAIN_STAGES = [
  'Reconnaissance',
  'Weaponization',
  'Delivery',
  'Exploitation',
  'Installation',
  'C2',
  'Actions',
];

const STAGE_ABBR: Record<string, string> = {
  Reconnaissance: 'RECON',
  Weaponization: 'WEAPON',
  Delivery: 'DELIVER',
  Exploitation: 'EXPLOIT',
  Installation: 'INSTALL',
  C2: 'C2',
  Actions: 'ACTIONS',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#f87171',
  high: '#fb923c',
  medium: '#fbbf24',
  low: '#34d399',
};

const CANVAS_BG = '#080c16';
const HEADER_COLOR = 'rgba(148, 163, 184, 0.7)';
const LABEL_COLOR = 'rgba(148, 163, 184, 0.5)';
const STAGE_DIVIDER_COLOR = 'rgba(30, 41, 59, 0.6)';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapStage(stage: string): number {
  const lower = stage.toLowerCase().replace(/[^a-z0-9]/g, '');
  const mappings: Record<string, number> = {
    reconnaissance: 0, recon: 0, scanning: 0, discovery: 0,
    weaponization: 1, weapon: 1, arming: 1, crafting: 1,
    delivery: 2, deliver: 2, phishing: 2, distribution: 2,
    exploitation: 3, exploit: 3, execution: 3,
    installation: 4, install: 4, persistence: 4, implant: 4,
    c2: 5, commandcontrol: 5, commandandcontrol: 5, command: 5, callback: 5,
    actions: 6, actionsonobjectives: 6, exfiltration: 6, impact: 6, objective: 6,
  };
  return mappings[lower] ?? -1;
}

function severityColor(severity: string): string {
  return SEVERITY_COLORS[severity.toLowerCase()] ?? '#64748b';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ThreatAttackChainGraph({
  detections,
}: {
  detections: Detection[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<NodeLayout[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const timeRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: -999, y: -999 });
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  // Build layout from detections
  const buildLayout = useCallback(
    (w: number, h: number) => {
      const nodes: NodeLayout[] = [];
      const edges: Edge[] = [];

      const headerH = 28;
      const legendH = 28;
      const graphH = h - headerH - legendH;
      const stageW = w / KILL_CHAIN_STAGES.length;

      // Track how many nodes per stage so we can spread vertically
      const stageSlots: number[] = KILL_CHAIN_STAGES.map(() => 0);

      // First pass: count nodes per stage
      for (const det of detections) {
        if (!det.attack_chain) continue;
        for (const entry of det.attack_chain) {
          const si = mapStage(entry.stage);
          if (si >= 0) stageSlots[si]++;
        }
      }

      // Second pass: place nodes
      const stageCounters = KILL_CHAIN_STAGES.map(() => 0);
      const detNodeMap = new Map<string, NodeLayout[]>();

      for (let di = 0; di < detections.length; di++) {
        const det = detections[di];
        if (!det.attack_chain) continue;
        const chainNodes: NodeLayout[] = [];

        for (const entry of det.attack_chain) {
          const si = mapStage(entry.stage);
          if (si < 0) continue;

          const total = stageSlots[si];
          const idx = stageCounters[si];
          stageCounters[si]++;

          const cx = stageW * si + stageW / 2;
          const spacing = Math.min(
            (graphH - 20) / (total + 1),
            36
          );
          const blockH = spacing * (total + 1);
          const startY = headerH + (graphH - blockH) / 2 + spacing;
          const cy = startY + idx * spacing;

          const baseR = 5 + (det.confidence / 100) * 5;
          const node: NodeLayout = {
            x: cx,
            y: cy,
            radius: baseR,
            stageIndex: si,
            detectionIndex: di,
            detection: det,
            chainEntry: entry,
            color: severityColor(det.severity),
          };
          nodes.push(node);
          chainNodes.push(node);
        }

        // Sort chain nodes by stage index so edges flow left to right
        chainNodes.sort((a, b) => a.stageIndex - b.stageIndex);
        detNodeMap.set(det.detection_id, chainNodes);

        // Build edges between consecutive chain entries
        for (let i = 0; i < chainNodes.length - 1; i++) {
          edges.push({
            from: chainNodes[i],
            to: chainNodes[i + 1],
            color: chainNodes[i].color,
          });
        }
      }

      // Build particles
      const particles: Particle[] = [];
      for (const edge of edges) {
        const count = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) {
          particles.push({
            edge,
            t: Math.random(),
            speed: 0.002 + Math.random() * 0.004,
            size: 1 + Math.random() * 1.5,
          });
        }
      }

      nodesRef.current = nodes;
      edgesRef.current = edges;
      particlesRef.current = particles;
    },
    [detections]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let dpr = window.devicePixelRatio || 1;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildLayout(rect.width, rect.height);
    };

    resize();
    window.addEventListener('resize', resize);

    // Mouse tracking
    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };
    const onMouseLeave = () => {
      mouseRef.current = { x: -999, y: -999 };
      setTooltip(null);
    };
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // Animation loop
    const animate = () => {
      const rect = container.getBoundingClientRect();
      if (!rect) {
        animRef.current = requestAnimationFrame(animate);
        return;
      }
      const w = rect.width;
      const h = rect.height;
      const headerH = 28;
      const legendH = 28;
      const graphH = h - headerH - legendH;
      const stageW = w / KILL_CHAIN_STAGES.length;
      const time = timeRef.current++;

      // Clear
      ctx.fillStyle = CANVAS_BG;
      ctx.fillRect(0, 0, w, h);

      // --- Stage columns ---
      for (let i = 0; i < KILL_CHAIN_STAGES.length; i++) {
        const sx = i * stageW;

        // Alternate background
        if (i % 2 === 0) {
          ctx.fillStyle = 'rgba(15, 22, 41, 0.25)';
          ctx.fillRect(sx, headerH, stageW, graphH);
        }

        // Divider line
        if (i > 0) {
          ctx.strokeStyle = STAGE_DIVIDER_COLOR;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(sx, headerH);
          ctx.lineTo(sx, headerH + graphH);
          ctx.stroke();
        }

        // Stage header label
        ctx.fillStyle = HEADER_COLOR;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          STAGE_ABBR[KILL_CHAIN_STAGES[i]] || KILL_CHAIN_STAGES[i],
          sx + stageW / 2,
          headerH / 2
        );

        // Subtle stage number
        ctx.fillStyle = LABEL_COLOR;
        ctx.font = '8px monospace';
        ctx.fillText(`${i + 1}`, sx + stageW / 2, headerH + graphH + 10);
      }

      // Top divider
      ctx.strokeStyle = STAGE_DIVIDER_COLOR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, headerH);
      ctx.lineTo(w, headerH);
      ctx.stroke();

      // Bottom divider (above legend)
      ctx.beginPath();
      ctx.moveTo(0, headerH + graphH);
      ctx.lineTo(w, headerH + graphH);
      ctx.stroke();

      // --- Draw edges ---
      for (const edge of edgesRef.current) {
        const { from, to, color } = edge;
        const rgb = hexToRgb(color);

        // Curved edge
        const cpx1 = from.x + (to.x - from.x) * 0.4;
        const cpy1 = from.y;
        const cpx2 = from.x + (to.x - from.x) * 0.6;
        const cpy2 = to.y;

        // Edge glow
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.06)`;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, to.x, to.y);
        ctx.stroke();

        // Edge line
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, to.x, to.y);
        ctx.stroke();
      }

      // --- Draw particles ---
      for (const p of particlesRef.current) {
        p.t += p.speed;
        if (p.t > 1) p.t -= 1;

        const { from, to, color } = p.edge;
        const rgb = hexToRgb(color);

        // Bezier point calculation
        const cpx1 = from.x + (to.x - from.x) * 0.4;
        const cpy1 = from.y;
        const cpx2 = from.x + (to.x - from.x) * 0.6;
        const cpy2 = to.y;

        const t = p.t;
        const mt = 1 - t;
        const px =
          mt * mt * mt * from.x +
          3 * mt * mt * t * cpx1 +
          3 * mt * t * t * cpx2 +
          t * t * t * to.x;
        const py =
          mt * mt * mt * from.y +
          3 * mt * mt * t * cpy1 +
          3 * mt * t * t * cpy2 +
          t * t * t * to.y;

        // Particle glow
        const glowAlpha = 0.3 + 0.2 * Math.sin(time * 0.1 + p.t * Math.PI * 4);
        ctx.shadowColor = color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${glowAlpha})`;
        ctx.beginPath();
        ctx.arc(px, py, p.size + 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Particle core
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.9)`;
        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Particle trail
        const trailLen = 3;
        for (let ti = 1; ti <= trailLen; ti++) {
          const tt = p.t - ti * 0.015;
          if (tt < 0) continue;
          const tmt = 1 - tt;
          const tx =
            tmt * tmt * tmt * from.x +
            3 * tmt * tmt * tt * cpx1 +
            3 * tmt * tt * tt * cpx2 +
            tt * tt * tt * to.x;
          const ty =
            tmt * tmt * tmt * from.y +
            3 * tmt * tmt * tt * cpy1 +
            3 * tmt * tt * tt * cpy2 +
            tt * tt * tt * to.y;
          const ta = 0.4 * (1 - ti / (trailLen + 1));
          ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${ta})`;
          ctx.beginPath();
          ctx.arc(tx, ty, p.size * (1 - ti * 0.2), 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // --- Draw nodes ---
      let hoveredNode: NodeLayout | null = null;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      for (const node of nodesRef.current) {
        const { x, y, radius, color } = node;
        const rgb = hexToRgb(color);

        // Pulsing glow
        const pulse =
          0.4 + 0.3 * Math.sin(time * 0.05 + node.detectionIndex * 1.3);
        const glowR = radius + 8 + pulse * 6;

        // Outer glow
        const glowGrad = ctx.createRadialGradient(x, y, radius * 0.5, x, y, glowR);
        glowGrad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.25 * pulse})`);
        glowGrad.addColorStop(0.5, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.08 * pulse})`);
        glowGrad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx.fillStyle = glowGrad;
        ctx.beginPath();
        ctx.arc(x, y, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Node shadow
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;

        // Node body (filled circle)
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.7)`;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Bright core
        ctx.shadowBlur = 0;
        ctx.fillStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        ctx.beginPath();
        ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Ring
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${0.5 + pulse * 0.3})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(x, y, radius + 2, 0, Math.PI * 2);
        ctx.stroke();

        // Hover detection
        const dx = mx - x;
        const dy = my - y;
        if (dx * dx + dy * dy < (radius + 8) * (radius + 8)) {
          hoveredNode = node;
        }
      }

      // Hover highlight ring
      if (hoveredNode) {
        const { x, y, radius, color } = hoveredNode;
        const rgb = hexToRgb(color);
        ctx.strokeStyle = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
        ctx.lineWidth = 2;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // Also highlight connected edges
        for (const edge of edgesRef.current) {
          if (
            edge.from.detection.detection_id ===
              hoveredNode.detection.detection_id ||
            edge.to.detection.detection_id ===
              hoveredNode.detection.detection_id
          ) {
            const { from, to } = edge;
            const eRgb = hexToRgb(edge.color);
            const cpx1 = from.x + (to.x - from.x) * 0.4;
            const cpy1 = from.y;
            const cpx2 = from.x + (to.x - from.x) * 0.6;
            const cpy2 = to.y;
            ctx.strokeStyle = `rgba(${eRgb.r}, ${eRgb.g}, ${eRgb.b}, 0.6)`;
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(from.x, from.y);
            ctx.bezierCurveTo(cpx1, cpy1, cpx2, cpy2, to.x, to.y);
            ctx.stroke();
          }
        }
      }

      // Update tooltip state (throttled)
      if (time % 3 === 0) {
        if (hoveredNode) {
          setTooltip({
            x: hoveredNode.x,
            y: hoveredNode.y,
            detection: hoveredNode.detection,
            chainEntry: hoveredNode.chainEntry,
          });
        } else {
          setTooltip(null);
        }
      }

      // --- Legend (inside canvas, bottom bar) ---
      const legendY = headerH + graphH + 2;
      ctx.fillStyle = 'rgba(8, 12, 22, 0.9)';
      ctx.fillRect(0, legendY, w, legendH);

      const severities = ['critical', 'high', 'medium', 'low'];
      const legendLabels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
      const totalLegendW = severities.length * 80;
      const legendStart = (w - totalLegendW) / 2;

      for (let i = 0; i < severities.length; i++) {
        const lx = legendStart + i * 80;
        const c = SEVERITY_COLORS[severities[i]];
        const lRgb = hexToRgb(c);

        // Color dot
        ctx.fillStyle = c;
        ctx.shadowColor = c;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(lx + 6, legendY + legendH / 2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = `rgba(${lRgb.r}, ${lRgb.g}, ${lRgb.b}, 0.8)`;
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(legendLabels[i], lx + 14, legendY + legendH / 2);
      }

      // Stage count badges
      const stageCounts = KILL_CHAIN_STAGES.map(() => 0);
      for (const n of nodesRef.current) {
        stageCounts[n.stageIndex]++;
      }
      for (let i = 0; i < KILL_CHAIN_STAGES.length; i++) {
        if (stageCounts[i] > 0) {
          const bx = i * stageW + stageW / 2;
          const by = headerH + 10;
          ctx.fillStyle = 'rgba(30, 41, 59, 0.6)';
          ctx.beginPath();
          ctx.roundRect(bx - 10, by - 6, 20, 12, 3);
          ctx.fill();
          ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
          ctx.font = '8px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${stageCounts[i]}`, bx, by);
        }
      }

      // Ambient scan line
      const scanY =
        headerH +
        ((time * 0.4) % graphH);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.04)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, scanY);
      ctx.lineTo(w, scanY);
      ctx.stroke();

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
    };
  }, [buildLayout]);

  // Severity summary
  const severityCounts = detections.reduce(
    (acc, d) => {
      const s = d.severity.toLowerCase();
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="relative w-full bg-[#0f1629] rounded-xl border border-[#1e293b] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#1e293b]">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-slate-300 text-xs font-mono font-bold tracking-wider">
            ATTACK CHAIN GRAPH
          </span>
          <span className="text-slate-500 text-[10px] font-mono ml-2">
            {detections.length} detection{detections.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {['critical', 'high', 'medium', 'low'].map((s) =>
            (severityCounts[s] ?? 0) > 0 ? (
              <span
                key={s}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold"
                style={{
                  color: SEVERITY_COLORS[s],
                  backgroundColor: SEVERITY_COLORS[s] + '15',
                  borderWidth: 1,
                  borderColor: SEVERITY_COLORS[s] + '30',
                  borderStyle: 'solid',
                }}
              >
                {severityCounts[s]} {s.toUpperCase()}
              </span>
            ) : null
          )}
        </div>
      </div>

      {/* Canvas container */}
      <div ref={containerRef} className="relative w-full" style={{ height: 320 }}>
        <canvas ref={canvasRef} className="w-full h-full" />

        {/* Tooltip overlay */}
        {tooltip && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              left: Math.min(
                tooltip.x + 12,
                (containerRef.current?.getBoundingClientRect().width ?? 400) - 240
              ),
              top: Math.max(tooltip.y - 60, 4),
            }}
          >
            <div
              className="px-3 py-2 rounded-lg border text-[10px] font-mono leading-relaxed"
              style={{
                backgroundColor: 'rgba(8, 12, 22, 0.95)',
                borderColor: severityColor(tooltip.detection.severity) + '40',
                backdropFilter: 'blur(8px)',
                maxWidth: 230,
              }}
            >
              <div
                className="font-bold text-xs mb-1"
                style={{ color: severityColor(tooltip.detection.severity) }}
              >
                {tooltip.detection.threat_type}
              </div>
              <div className="text-slate-400">
                <span className="text-slate-500">ID:</span>{' '}
                {tooltip.detection.detection_id}
              </div>
              <div className="text-slate-400">
                <span className="text-slate-500">Stage:</span>{' '}
                {tooltip.chainEntry.stage}
              </div>
              <div className="text-slate-400">
                <span className="text-slate-500">Detail:</span>{' '}
                {tooltip.chainEntry.detail}
              </div>
              <div className="text-slate-400">
                <span className="text-slate-500">Severity:</span>{' '}
                <span style={{ color: severityColor(tooltip.detection.severity) }}>
                  {tooltip.detection.severity.toUpperCase()}
                </span>
              </div>
              <div className="text-slate-400">
                <span className="text-slate-500">Confidence:</span>{' '}
                {tooltip.detection.confidence}%
                {' / Stage: '}
                {tooltip.chainEntry.confidence}%
              </div>
              <div className="text-slate-400">
                <span className="text-slate-500">Status:</span>{' '}
                {tooltip.detection.status}
              </div>
            </div>
          </div>
        )}

        {/* Empty state */}
        {detections.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-slate-500 text-xs font-mono">
              No attack chain data available
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
