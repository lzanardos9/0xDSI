import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Layers,
  Filter,
  Zap,
  Clock,
  X,
  ChevronDown,
  Activity,
  Shield,
  ArrowRight,
} from 'lucide-react';
import {
  FUNNEL_PHASES,
  CONNECTOR_META,
  MOCK_EVENTS,
  ConnectorType,
  FunnelPhase,
  FunnelEvent,
} from './eventFunnelData';

interface AnimatedDot {
  id: string;
  x: number;
  y: number;
  targetY: number;
  phase: number;
  connector: ConnectorType;
  color: string;
  opacity: number;
  radius: number;
  speed: number;
  dropped: boolean;
  dropVelocityX: number;
  glowIntensity: number;
  trail: { x: number; y: number; opacity: number }[];
  eventRef: FunnelEvent | null;
  flash: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  info: '#06b6d4',
  low: '#22d3ee',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const VERDICT_COLORS: Record<string, string> = {
  pending: '#64748b',
  benign: '#22c55e',
  suspicious: '#eab308',
  threat: '#f97316',
  critical_threat: '#ef4444',
};

const VERDICT_LABELS: Record<string, string> = {
  pending: 'PENDING',
  benign: 'BENIGN',
  suspicious: 'SUSPICIOUS',
  threat: 'THREAT',
  critical_threat: 'CRITICAL THREAT',
};

const ALL_CONNECTORS: ConnectorType[] = Object.keys(CONNECTOR_META) as ConnectorType[];

function formatNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

function syntaxHighlightJson(raw: string): React.ReactNode[] {
  try {
    const parsed = JSON.parse(raw);
    const formatted = JSON.stringify(parsed, null, 2);
    const parts: React.ReactNode[] = [];
    let idx = 0;
    const lines = formatted.split('\n');
    for (let li = 0; li < lines.length; li++) {
      const line = lines[li];
      const keyMatch = line.match(/^(\s*)"([^"]+)"(\s*:\s*)(.*)/);
      if (keyMatch) {
        parts.push(<span key={idx++} style={{ color: '#94a3b8' }}>{keyMatch[1]}</span>);
        parts.push(<span key={idx++} style={{ color: '#22d3ee' }}>"{keyMatch[2]}"</span>);
        parts.push(<span key={idx++} style={{ color: '#94a3b8' }}>{keyMatch[3]}</span>);
        const val = keyMatch[4];
        if (val.startsWith('"')) {
          parts.push(<span key={idx++} style={{ color: '#86efac' }}>{val}</span>);
        } else if (val.match(/^(true|false|null)/)) {
          parts.push(<span key={idx++} style={{ color: '#fbbf24' }}>{val}</span>);
        } else {
          parts.push(<span key={idx++} style={{ color: '#f1f5f9' }}>{val}</span>);
        }
      } else {
        parts.push(<span key={idx++} style={{ color: '#94a3b8' }}>{line}</span>);
      }
      if (li < lines.length - 1) parts.push(<br key={idx++} />);
    }
    return parts;
  } catch {
    return [<span key="raw" style={{ color: '#86efac' }}>{raw}</span>];
  }
}

function EventProcessingFunnel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<AnimatedDot[]>([]);
  const animFrameRef = useRef<number>(0);
  const lastSpawnRef = useRef<number>(0);
  const tickCountRef = useRef<number>(0);
  const threatFlashRef = useRef<number>(0);

  const [activeConnectors, setActiveConnectors] = useState<Set<ConnectorType>>(new Set(ALL_CONNECTORS));
  const [hoveredEvent, setHoveredEvent] = useState<FunnelEvent | null>(null);
  const [hoveredPhase, setHoveredPhase] = useState<number | null>(null);
  const [totalEps, setTotalEps] = useState(14203);
  const [phases, setPhases] = useState<FunnelPhase[]>(() => FUNNEL_PHASES.map(p => ({ ...p })));
  const [liveEvents, setLiveEvents] = useState<FunnelEvent[]>(() => [...MOCK_EVENTS]);
  const mousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const canvasWidth = 900;
  const canvasHeight = 700;
  const funnelTop = 30;
  const funnelBottom = canvasHeight - 30;
  const phaseSpacing = (funnelBottom - funnelTop) / (FUNNEL_PHASES.length - 1);
  const maxPipeWidth = canvasWidth * 0.72;
  const minPipeWidth = canvasWidth * 0.12;
  const centerX = canvasWidth / 2;

  const filteredPhases = useMemo(() => {
    if (activeConnectors.size === ALL_CONNECTORS.length) return phases;
    const filteredEvents = liveEvents.filter(e => activeConnectors.has(e.connector));
    return phases.map(p => {
      const eventsInPhase = filteredEvents.filter(e => e.currentPhase >= p.id).length;
      const ratio = filteredEvents.length > 0 ? eventsInPhase / filteredEvents.length : 0;
      return {
        ...p,
        activeEvents: Math.round(p.activeEvents * ratio),
        droppedEvents: Math.round(p.droppedEvents * ratio),
      };
    });
  }, [phases, activeConnectors, liveEvents]);

  const connectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    ALL_CONNECTORS.forEach(c => { counts[c] = 0; });
    liveEvents.forEach(e => { counts[e.connector] = (counts[e.connector] || 0) + 1; });
    return counts;
  }, [liveEvents]);

  const getPipeWidth = useCallback((phaseIdx: number) => {
    const phase1Active = filteredPhases[0]?.activeEvents || 1;
    const currentActive = filteredPhases[phaseIdx]?.activeEvents || 0;
    const ratio = Math.max(currentActive / phase1Active, 0.08);
    return minPipeWidth + (maxPipeWidth - minPipeWidth) * ratio;
  }, [filteredPhases, maxPipeWidth, minPipeWidth]);

  const getPhaseY = useCallback((phaseIdx: number) => {
    return funnelTop + phaseIdx * phaseSpacing;
  }, [funnelTop, phaseSpacing]);

  const toggleConnector = useCallback((connector: ConnectorType) => {
    setActiveConnectors(prev => {
      const next = new Set(prev);
      if (next.has(connector)) {
        if (next.size > 1) next.delete(connector);
      } else {
        next.add(connector);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setActiveConnectors(new Set(ALL_CONNECTORS));
  }, []);

  const selectLogicalOnly = useCallback(() => {
    const logical = ALL_CONNECTORS.filter(c => CONNECTOR_META[c].domain === 'logical' || CONNECTOR_META[c].domain === 'both');
    setActiveConnectors(new Set(logical));
  }, []);

  const selectPhysicalOnly = useCallback(() => {
    const physical = ALL_CONNECTORS.filter(c => CONNECTOR_META[c].domain === 'physical' || CONNECTOR_META[c].domain === 'both');
    setActiveConnectors(new Set(physical));
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTotalEps(prev => {
        const delta = Math.floor(Math.random() * 200) - 100;
        return Math.max(13800, Math.min(14800, prev + delta));
      });

      setPhases(prev => prev.map(p => ({
        ...p,
        activeEvents: Math.max(10, p.activeEvents + Math.floor(Math.random() * 40) - 20),
        droppedEvents: Math.max(0, p.droppedEvents + Math.floor(Math.random() * 10) - 5),
        avgLatencyMs: Math.max(1, p.avgLatencyMs + Math.floor(Math.random() * 4) - 2),
      })));

      const newCount = 3 + Math.floor(Math.random() * 3);
      const newEvents: FunnelEvent[] = [];
      for (let i = 0; i < newCount; i++) {
        const template = MOCK_EVENTS[Math.floor(Math.random() * MOCK_EVENTS.length)];
        const connectors = ALL_CONNECTORS;
        const connector = connectors[Math.floor(Math.random() * connectors.length)];
        const newEvt: FunnelEvent = {
          ...template,
          id: `EVT-${Date.now()}-${i}`,
          connector,
          currentPhase: 1 + Math.floor(Math.random() * 3),
          timestamp: new Date().toISOString(),
        };
        newEvents.push(newEvt);
      }

      setLiveEvents(prev => {
        let updated = [...prev];
        updated = updated.map(e => {
          if (Math.random() < 0.08 && e.currentPhase < 11) {
            return { ...e, currentPhase: e.currentPhase + 1 };
          }
          return e;
        });
        updated = [...updated, ...newEvents];
        if (updated.length > 120) updated = updated.slice(updated.length - 120);
        return updated;
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  const spawnDot = useCallback(() => {
    const dots = dotsRef.current;
    if (dots.length >= 200) return;

    const available = liveEvents.filter(e => activeConnectors.has(e.connector));
    if (available.length === 0) return;

    const evt = available[Math.floor(Math.random() * available.length)];
    const meta = CONNECTOR_META[evt.connector];
    const phaseIdx = evt.currentPhase - 1;
    const startPhaseIdx = Math.max(0, phaseIdx - Math.floor(Math.random() * 3));
    const startY = getPhaseY(startPhaseIdx);
    const pipeW = getPipeWidth(startPhaseIdx);
    const halfPipe = pipeW / 2;
    const startX = centerX + (Math.random() - 0.5) * halfPipe * 0.8;

    const targetPhaseIdx = Math.min(10, phaseIdx + Math.floor(Math.random() * 3));
    const targetY = getPhaseY(targetPhaseIdx);

    const willDrop = Math.random() < 0.15 && targetPhaseIdx > 3;

    const dot: AnimatedDot = {
      id: `dot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      x: startX,
      y: startY,
      targetY,
      phase: startPhaseIdx,
      connector: evt.connector,
      color: meta.color,
      opacity: 1,
      radius: 2.5 + Math.random() * 2,
      speed: 0.4 + Math.random() * 0.8,
      dropped: willDrop,
      dropVelocityX: 0,
      glowIntensity: 0.6 + Math.random() * 0.4,
      trail: [],
      eventRef: evt,
      flash: 0,
    };

    dots.push(dot);
  }, [liveEvents, activeConnectors, getPhaseY, getPipeWidth, centerX]);

  const drawFunnel = useCallback((ctx: CanvasRenderingContext2D, time: number) => {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    for (let i = 0; i < filteredPhases.length; i++) {
      const phase = filteredPhases[i];
      const y = getPhaseY(i);
      const pipeW = getPipeWidth(i);
      const halfPipe = pipeW / 2;
      const pipeHeight = phaseSpacing * 0.35;

      const gradient = ctx.createLinearGradient(centerX - halfPipe, y, centerX + halfPipe, y);
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(0.15, hexToRgba(phase.color, 0.08));
      gradient.addColorStop(0.5, hexToRgba(phase.color, 0.12));
      gradient.addColorStop(0.85, hexToRgba(phase.color, 0.08));
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(centerX - halfPipe, y - pipeHeight / 2, pipeW, pipeHeight, 4);
      ctx.fill();

      ctx.strokeStyle = hexToRgba(phase.color, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(centerX - halfPipe, y - pipeHeight / 2, pipeW, pipeHeight, 4);
      ctx.stroke();

      const edgeGlow = ctx.createRadialGradient(centerX - halfPipe, y, 0, centerX - halfPipe, y, 20);
      edgeGlow.addColorStop(0, hexToRgba(phase.color, 0.15));
      edgeGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = edgeGlow;
      ctx.fillRect(centerX - halfPipe - 20, y - 20, 40, 40);

      const edgeGlow2 = ctx.createRadialGradient(centerX + halfPipe, y, 0, centerX + halfPipe, y, 20);
      edgeGlow2.addColorStop(0, hexToRgba(phase.color, 0.15));
      edgeGlow2.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = edgeGlow2;
      ctx.fillRect(centerX + halfPipe - 20, y - 20, 40, 40);

      ctx.fillStyle = hexToRgba(phase.color, 0.9);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.beginPath();
      ctx.arc(centerX - halfPipe - 28, y, 11, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(phase.color, 0.15);
      ctx.fill();
      ctx.strokeStyle = hexToRgba(phase.color, 0.5);
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = hexToRgba(phase.color, 0.95);
      ctx.fillText(`${phase.id}`, centerX - halfPipe - 28, y);

      ctx.textAlign = 'left';
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = hexToRgba(phase.color, 0.8);
      ctx.fillText(phase.shortName, centerX - halfPipe - 28 + 16, y - 5);

      ctx.font = '9px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`${formatNumber(phase.activeEvents)} active`, centerX - halfPipe - 28 + 16, y + 7);

      if (phase.droppedEvents > 0) {
        ctx.textAlign = 'right';
        ctx.font = '9px monospace';
        ctx.fillStyle = '#ef4444';
        ctx.fillText(`-${formatNumber(phase.droppedEvents)}`, centerX + halfPipe + 50, y - 4);
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${phase.avgLatencyMs}ms`, centerX + halfPipe + 50, y + 8);
      } else {
        ctx.textAlign = 'right';
        ctx.font = '9px monospace';
        ctx.fillStyle = '#64748b';
        ctx.fillText(`${phase.avgLatencyMs}ms`, centerX + halfPipe + 50, y + 2);
      }

      if (i < filteredPhases.length - 1) {
        const nextY = getPhaseY(i + 1);
        const nextPipeW = getPipeWidth(i + 1);
        const nextHalf = nextPipeW / 2;

        ctx.beginPath();
        ctx.moveTo(centerX - halfPipe * 0.6, y + pipeHeight / 2);
        ctx.lineTo(centerX - nextHalf * 0.6, nextY - pipeHeight / 2);
        ctx.strokeStyle = hexToRgba(phase.color, 0.1);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX + halfPipe * 0.6, y + pipeHeight / 2);
        ctx.lineTo(centerX + nextHalf * 0.6, nextY - pipeHeight / 2);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX, y + pipeHeight / 2 + 4);
        ctx.lineTo(centerX - 3, y + pipeHeight / 2 + 4 + 6);
        ctx.lineTo(centerX + 3, y + pipeHeight / 2 + 4 + 6);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(phase.color, 0.2);
        ctx.fill();
      }
    }

    if (threatFlashRef.current > 0) {
      const flashAlpha = threatFlashRef.current * 0.3;
      const flashY = getPhaseY(10);
      const flashGrad = ctx.createRadialGradient(centerX, flashY, 0, centerX, flashY, 120);
      flashGrad.addColorStop(0, `rgba(239, 68, 68, ${flashAlpha})`);
      flashGrad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = flashGrad;
      ctx.fillRect(centerX - 120, flashY - 120, 240, 240);
      threatFlashRef.current = Math.max(0, threatFlashRef.current - 0.02);
    }

    const dots = dotsRef.current;
    for (let d = 0; d < dots.length; d++) {
      const dot = dots[d];
      if (dot.opacity <= 0) continue;

      if (dot.trail.length > 0) {
        for (let t = 0; t < dot.trail.length; t++) {
          const tp = dot.trail[t];
          if (tp.opacity <= 0) continue;
          ctx.beginPath();
          ctx.arc(tp.x, tp.y, dot.radius * 0.5 * tp.opacity, 0, Math.PI * 2);
          ctx.fillStyle = hexToRgba(dot.color, tp.opacity * 0.3);
          ctx.fill();
        }
      }

      const glowSize = dot.radius * 3 * dot.glowIntensity;
      const glow = ctx.createRadialGradient(dot.x, dot.y, dot.radius * 0.5, dot.x, dot.y, glowSize);
      glow.addColorStop(0, hexToRgba(dot.color, 0.4 * dot.opacity));
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(dot.x - glowSize, dot.y - glowSize, glowSize * 2, glowSize * 2);

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.radius, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(dot.color, dot.opacity * 0.9);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(dot.x, dot.y, dot.radius * 0.5, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba('#ffffff', dot.opacity * 0.5);
      ctx.fill();

      if (dot.flash > 0) {
        const flashR = dot.radius + dot.flash * 15;
        const flashGrad = ctx.createRadialGradient(dot.x, dot.y, dot.radius, dot.x, dot.y, flashR);
        flashGrad.addColorStop(0, hexToRgba(dot.color, dot.flash * 0.6));
        flashGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = flashGrad;
        ctx.fillRect(dot.x - flashR, dot.y - flashR, flashR * 2, flashR * 2);
        dot.flash = Math.max(0, dot.flash - 0.015);
      }
    }

    const scanLineY = (time * 0.03) % canvasHeight;
    ctx.fillStyle = 'rgba(34,211,238,0.02)';
    ctx.fillRect(0, scanLineY, canvasWidth, 2);
  }, [filteredPhases, getPhaseY, getPipeWidth, centerX, canvasWidth, canvasHeight, phaseSpacing]);

  const updateDots = useCallback((time: number) => {
    const dots = dotsRef.current;

    if (time - lastSpawnRef.current > 80) {
      spawnDot();
      lastSpawnRef.current = time;
    }

    for (let i = dots.length - 1; i >= 0; i--) {
      const dot = dots[i];

      if (!activeConnectors.has(dot.connector)) {
        dot.opacity -= 0.05;
        if (dot.opacity <= 0) { dots.splice(i, 1); continue; }
      }

      dot.trail.push({ x: dot.x, y: dot.y, opacity: 0.6 });
      if (dot.trail.length > 6) dot.trail.shift();
      for (let t = 0; t < dot.trail.length; t++) {
        dot.trail[t].opacity -= 0.1;
      }
      dot.trail = dot.trail.filter(t => t.opacity > 0);

      if (dot.dropped && dot.y >= dot.targetY * 0.85) {
        dot.dropVelocityX += 0.3;
        dot.x += dot.dropVelocityX;
        dot.opacity -= 0.015;
        dot.y += dot.speed * 0.2;
      } else if (dot.y < dot.targetY) {
        dot.y += dot.speed;
        const phaseIdx = Math.floor((dot.y - funnelTop) / phaseSpacing);
        const clampedIdx = Math.max(0, Math.min(10, phaseIdx));
        const pipeW = getPipeWidth(clampedIdx);
        const halfPipe = pipeW / 2;
        const leftBound = centerX - halfPipe * 0.8;
        const rightBound = centerX + halfPipe * 0.8;
        dot.x += (Math.random() - 0.5) * 0.5;
        dot.x = Math.max(leftBound, Math.min(rightBound, dot.x));

        dot.glowIntensity = 0.5 + Math.sin(time * 0.003 + i) * 0.3;
      } else {
        const finalPhaseIdx = Math.floor((dot.targetY - funnelTop) / phaseSpacing);
        if (finalPhaseIdx >= 10) {
          dot.flash = 1;
          threatFlashRef.current = 1;
        }
        dot.opacity -= 0.02;
      }

      if (dot.opacity <= 0 || dot.x > canvasWidth + 50) {
        dots.splice(i, 1);
      }
    }
  }, [activeConnectors, spawnDot, getPipeWidth, centerX, funnelTop, phaseSpacing, canvasWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    const animate = (time: number) => {
      if (!running) return;
      tickCountRef.current++;
      updateDots(time);
      drawFunnel(ctx, time);
      animFrameRef.current = requestAnimationFrame(animate);
    };
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [updateDots, drawFunnel]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvasWidth / rect.width;
    const scaleY = canvasHeight / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;
    mousePos.current = { x: mx, y: my };

    const phaseIdx = Math.round((my - funnelTop) / phaseSpacing);
    if (phaseIdx >= 0 && phaseIdx <= 10) {
      setHoveredPhase(phaseIdx);
    } else {
      setHoveredPhase(null);
    }

    let closestDot: AnimatedDot | null = null;
    let closestDist = 20;
    const dots = dotsRef.current;
    for (let i = 0; i < dots.length; i++) {
      const dot = dots[i];
      const dx = dot.x - mx;
      const dy = dot.y - my;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < closestDist) {
        closestDist = dist;
        closestDot = dot;
      }
    }

    if (closestDot && closestDot.eventRef) {
      setHoveredEvent(closestDot.eventRef);
    } else {
      setHoveredEvent(null);
    }
  }, [canvasWidth, canvasHeight, funnelTop, phaseSpacing]);

  const handleCanvasMouseLeave = useCallback(() => {
    setHoveredEvent(null);
    setHoveredPhase(null);
  }, []);

  const totalDropped = useMemo(() => filteredPhases.reduce((s, p) => s + p.droppedEvents, 0), [filteredPhases]);
  const avgLatency = useMemo(() => {
    const sum = filteredPhases.reduce((s, p) => s + p.avgLatencyMs, 0);
    return Math.round(sum / filteredPhases.length);
  }, [filteredPhases]);
  const detectionRate = useMemo(() => {
    const alerts = filteredPhases[10]?.activeEvents || 0;
    const ingested = filteredPhases[0]?.activeEvents || 1;
    return ((alerts / ingested) * 100).toFixed(2);
  }, [filteredPhases]);

  const isAllSelected = activeConnectors.size === ALL_CONNECTORS.length;
  const isLogicalOnly = ALL_CONNECTORS.filter(c => CONNECTOR_META[c].domain === 'logical' || CONNECTOR_META[c].domain === 'both').every(c => activeConnectors.has(c)) &&
    ALL_CONNECTORS.filter(c => CONNECTOR_META[c].domain === 'physical').every(c => !activeConnectors.has(c));
  const isPhysicalOnly = ALL_CONNECTORS.filter(c => CONNECTOR_META[c].domain === 'physical' || CONNECTOR_META[c].domain === 'both').every(c => activeConnectors.has(c)) &&
    ALL_CONNECTORS.filter(c => CONNECTOR_META[c].domain === 'logical').every(c => !activeConnectors.has(c));

  return (
    <div
      ref={containerRef}
      className="relative w-full bg-[#0a0e1a] border border-[#1e293b] rounded-xl overflow-hidden"
      style={{ minHeight: 960 }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        background: 'radial-gradient(ellipse at 50% 0%, rgba(34,211,238,0.03) 0%, transparent 60%)',
      }} />

      <div className="relative z-10 px-6 pt-5 pb-3 flex items-start justify-between border-b border-[#1e293b]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
              <Layers size={16} className="text-cyan-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-widest text-cyan-300 font-mono">EVENT PROCESSING PIPELINE</h2>
              <p className="text-[10px] tracking-wider text-slate-500 font-mono mt-0.5">11-PHASE THREAT EVALUATION FUNNEL</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="flex items-center gap-1.5 justify-end">
              <Activity size={12} className="text-cyan-400" />
              <span className="text-lg font-bold font-mono text-cyan-300">{totalEps.toLocaleString()}</span>
              <span className="text-[10px] text-slate-500 font-mono">/sec</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-emerald-400 tracking-wider">REAL-TIME</span>
          </div>
        </div>
      </div>

      <div className="relative z-10 px-6 py-3 border-b border-[#1e293b]">
        <div className="flex items-center gap-1.5 mb-2">
          <Filter size={11} className="text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500 tracking-wider">CONNECTOR FILTERS</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={selectAll}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider border transition-all duration-200 ${
              isAllSelected
                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                : 'bg-[#0f1629] text-slate-500 border-[#1e293b] hover:border-slate-600'
            }`}
          >
            ALL
          </button>
          <button
            onClick={selectLogicalOnly}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider border transition-all duration-200 ${
              isLogicalOnly
                ? 'bg-blue-500/15 text-blue-300 border-blue-500/40'
                : 'bg-[#0f1629] text-slate-500 border-[#1e293b] hover:border-slate-600'
            }`}
          >
            LOGICAL
          </button>
          <button
            onClick={selectPhysicalOnly}
            className={`px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider border transition-all duration-200 ${
              isPhysicalOnly
                ? 'bg-orange-500/15 text-orange-300 border-orange-500/40'
                : 'bg-[#0f1629] text-slate-500 border-[#1e293b] hover:border-slate-600'
            }`}
          >
            PHYSICAL
          </button>
          <div className="w-px h-5 bg-[#1e293b] self-center mx-1" />
          {ALL_CONNECTORS.map(connector => {
            const meta = CONNECTOR_META[connector];
            const isActive = activeConnectors.has(connector);
            return (
              <button
                key={connector}
                onClick={() => toggleConnector(connector)}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono tracking-wider border transition-all duration-200 ${
                  isActive
                    ? 'border-opacity-40 font-bold'
                    : 'bg-[#0f1629] text-slate-600 border-[#1e293b] hover:border-slate-600'
                }`}
                style={isActive ? {
                  backgroundColor: hexToRgba(meta.color, 0.12),
                  color: meta.color,
                  borderColor: hexToRgba(meta.color, 0.35),
                } : undefined}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: isActive ? meta.color : '#475569' }}
                />
                {meta.label.length > 18 ? connector : meta.label}
                <span className={`ml-0.5 ${isActive ? 'opacity-70' : 'opacity-40'}`}>
                  {connectorCounts[connector] || 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {hoveredEvent && (
        <div
          className="absolute z-30 left-6 right-6 top-[160px] rounded-lg border p-4 animate-in fade-in duration-150"
          style={{
            backgroundColor: 'rgba(10, 14, 26, 0.97)',
            borderColor: SEVERITY_COLORS[hoveredEvent.severity] || '#1e293b',
            boxShadow: `0 0 30px ${hexToRgba(SEVERITY_COLORS[hoveredEvent.severity] || '#1e293b', 0.15)}`,
          }}
        >
          <div className="flex items-start gap-6">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-xs font-mono font-bold text-slate-300">{hoveredEvent.id}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider"
                  style={{
                    backgroundColor: hexToRgba(CONNECTOR_META[hoveredEvent.connector].color, 0.15),
                    color: CONNECTOR_META[hoveredEvent.connector].color,
                  }}
                >
                  {hoveredEvent.connector}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{hoveredEvent.timestamp}</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider"
                  style={{
                    backgroundColor: hexToRgba(SEVERITY_COLORS[hoveredEvent.severity], 0.15),
                    color: SEVERITY_COLORS[hoveredEvent.severity],
                  }}
                >
                  {hoveredEvent.severity.toUpperCase()}
                </span>
              </div>
              <div className="flex items-center gap-3 mb-2 text-[11px] font-mono">
                <span className="text-slate-400">{hoveredEvent.sourceIP}</span>
                <ArrowRight size={10} className="text-slate-600" />
                <span className="text-slate-400">{hoveredEvent.destIP}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-500">{hoveredEvent.protocol}</span>
                <span className="text-slate-600">:</span>
                <span className="text-slate-500">{hoveredEvent.port}</span>
                <span className="text-slate-600">|</span>
                <span className="text-slate-500">{hoveredEvent.bytes.toLocaleString()} B</span>
              </div>
              <div className="flex items-center gap-2 mb-3">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider ${
                  hoveredEvent.domain === 'physical'
                    ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                }`}>
                  {hoveredEvent.domain.toUpperCase()}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider ${
                  hoveredEvent.isStructured
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                }`}>
                  {hoveredEvent.isStructured ? 'STRUCTURED' : 'UNSTRUCTURED'}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Phase: <span className="text-slate-300">{FUNNEL_PHASES[hoveredEvent.currentPhase - 1]?.name}</span>
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  Verdict: <span style={{ color: VERDICT_COLORS[hoveredEvent.finalVerdict] }}>{VERDICT_LABELS[hoveredEvent.finalVerdict]}</span>
                </span>
              </div>
              <div
                className="rounded border border-[#1e293b] p-3 overflow-x-auto max-h-[80px]"
                style={{ backgroundColor: 'rgba(15, 23, 42, 0.8)' }}
              >
                <pre className="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-all">
                  {syntaxHighlightJson(hoveredEvent.rawData)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 px-6 py-2">
        <canvas
          ref={canvasRef}
          width={canvasWidth}
          height={canvasHeight}
          onMouseMove={handleCanvasMouseMove}
          onMouseLeave={handleCanvasMouseLeave}
          className="w-full cursor-crosshair"
          style={{ height: 700, imageRendering: 'auto' }}
        />
      </div>

      <div className="relative z-10 px-6 py-3 border-t border-[#1e293b]">
        <div className="flex items-center gap-1.5 mb-2">
          <ChevronDown size={11} className="text-slate-500" />
          <span className="text-[10px] font-mono text-slate-500 tracking-wider">PHASE DETAIL</span>
        </div>
        <div className="grid grid-cols-11 gap-1">
          {filteredPhases.map((phase, i) => {
            const isHovered = hoveredPhase === i;
            const dropRate = phase.activeEvents > 0
              ? ((phase.droppedEvents / (phase.activeEvents + phase.droppedEvents)) * 100).toFixed(1)
              : '0.0';
            return (
              <div
                key={phase.id}
                className="rounded border p-1.5 transition-all duration-200"
                style={{
                  backgroundColor: isHovered ? hexToRgba(phase.color, 0.1) : 'rgba(15, 23, 42, 0.5)',
                  borderColor: isHovered ? hexToRgba(phase.color, 0.4) : '#1e293b',
                  boxShadow: isHovered ? `0 0 12px ${hexToRgba(phase.color, 0.1)}` : 'none',
                }}
              >
                <div className="text-[8px] font-mono font-bold tracking-wider truncate" style={{ color: phase.color }}>
                  {phase.shortName}
                </div>
                <div className="text-[9px] font-mono text-slate-400 mt-0.5">
                  {formatNumber(phase.activeEvents)}
                </div>
                <div className="text-[8px] font-mono text-red-500/70 mt-0.5">
                  {phase.droppedEvents > 0 ? `-${formatNumber(phase.droppedEvents)}` : '--'}
                </div>
                <div className="text-[8px] font-mono text-slate-600 mt-0.5">
                  {dropRate}%
                </div>
                <div className="text-[8px] font-mono text-slate-600">
                  {phase.avgLatencyMs}ms
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative z-10 px-6 py-4 border-t border-[#1e293b]">
        <div className="grid grid-cols-4 gap-4">
          <div className="rounded-lg bg-[#0f1629] border border-[#1e293b] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap size={11} className="text-cyan-400" />
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">THROUGHPUT</span>
            </div>
            <div className="text-lg font-bold font-mono text-cyan-300">
              {totalEps.toLocaleString()}
              <span className="text-[10px] text-slate-500 ml-1">/sec</span>
            </div>
          </div>
          <div className="rounded-lg bg-[#0f1629] border border-[#1e293b] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <X size={11} className="text-red-400" />
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">TOTAL DROPPED</span>
            </div>
            <div className="text-lg font-bold font-mono text-red-400">
              {totalDropped.toLocaleString()}
            </div>
          </div>
          <div className="rounded-lg bg-[#0f1629] border border-[#1e293b] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={11} className="text-amber-400" />
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">AVG LATENCY</span>
            </div>
            <div className="text-lg font-bold font-mono text-amber-300">
              {avgLatency}
              <span className="text-[10px] text-slate-500 ml-1">ms</span>
            </div>
          </div>
          <div className="rounded-lg bg-[#0f1629] border border-[#1e293b] p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Shield size={11} className="text-red-400" />
              <span className="text-[9px] font-mono text-slate-500 tracking-wider">DETECTION RATE</span>
            </div>
            <div className="text-lg font-bold font-mono text-red-400">
              {detectionRate}
              <span className="text-[10px] text-slate-500 ml-1">%</span>
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-1">
          <span className="text-[9px] font-mono text-slate-600 tracking-wider mr-2">EFFICIENCY</span>
          {filteredPhases.map((phase) => {
            const efficiency = phase.activeEvents > 0
              ? Math.min(1, phase.activeEvents / (phase.activeEvents + phase.droppedEvents))
              : 1;
            const barHeight = Math.max(2, efficiency * 20);
            return (
              <div key={phase.id} className="flex flex-col items-center gap-0.5" style={{ width: `${100 / 11}%` }}>
                <div className="w-full flex items-end justify-center" style={{ height: 22 }}>
                  <div
                    className="w-full max-w-[40px] rounded-sm"
                    style={{
                      height: barHeight,
                      backgroundColor: hexToRgba(phase.color, 0.6),
                    }}
                  />
                </div>
                <span className="text-[7px] font-mono text-slate-600">{(efficiency * 100).toFixed(0)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export default EventProcessingFunnel;
