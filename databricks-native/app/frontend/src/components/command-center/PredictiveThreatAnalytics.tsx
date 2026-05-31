import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Shield, Activity, Radio, Zap, Clock, AlertTriangle, Eye, Crosshair, Cpu, Waves } from 'lucide-react';

interface Prediction {
  id: string;
  title: string;
  probability: number;
  status: 'IMMINENT' | 'DEVELOPING' | 'EMERGING' | 'MONITORING';
  eta: string;
  tactic: string;
  signals: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface Signal {
  id: string;
  type: string;
  time: string;
  prediction: string;
}

const PREDICTIONS: Prediction[] = [
  { id: 'PRE-001', title: 'Coordinated Ransomware Deployment', probability: 94, status: 'IMMINENT', eta: '2h 14m', tactic: 'Impact (TA0040)', signals: ['Volume shadow copy enumeration on 3 hosts', 'Backup service disruption attempts', 'Lateral movement via compromised service account', 'Encrypted C2 channel with 120s beacon'], severity: 'critical' },
  { id: 'PRE-002', title: 'Supply Chain Compromise via CI/CD', probability: 71, status: 'DEVELOPING', eta: '18h 42m', tactic: 'Initial Access (TA0001)', signals: ['Anomalous commits to build pipeline', 'New dependency with low trust score', 'Build artifact hash mismatch'], severity: 'high' },
  { id: 'PRE-003', title: 'Data Exfiltration - Finance Division', probability: 67, status: 'DEVELOPING', eta: '24h 05m', tactic: 'Exfiltration (TA0010)', signals: ['Unusual database query patterns', 'DNS tunneling indicators', 'After-hours VPN activity from finance user', 'Large archive creation detected'], severity: 'high' },
  { id: 'PRE-004', title: 'Cloud Infrastructure Takeover', probability: 45, status: 'EMERGING', eta: '48h 30m', tactic: 'Persistence (TA0003)', signals: ['Leaked AWS keys on dark web forum', 'Reconnaissance scans from known APT infra', 'IAM policy probing detected'], severity: 'medium' },
  { id: 'PRE-005', title: 'Zero-Day Exploit Chain - Edge Devices', probability: 32, status: 'MONITORING', eta: '72h+', tactic: 'Initial Access (TA0001)', signals: ['Vendor advisory pre-disclosure signal', 'Exploit broker chatter increase', 'Matching vulnerability scan patterns'], severity: 'medium' },
  { id: 'PRE-006', title: 'Insider Threat - Privileged User Anomaly', probability: 28, status: 'MONITORING', eta: '96h+', tactic: 'Collection (TA0009)', signals: ['Behavioral deviation score increase', 'Access to resources outside normal pattern'], severity: 'low' },
];

const SIGNALS: Signal[] = [
  { id: 'SIG-01', type: 'DNS Anomaly', time: '-5h 20m', prediction: 'PRE-003' },
  { id: 'SIG-02', type: 'Credential Abuse', time: '-4h 45m', prediction: 'PRE-001' },
  { id: 'SIG-03', type: 'Lateral Movement', time: '-3h 30m', prediction: 'PRE-001' },
  { id: 'SIG-04', type: 'Build Pipeline', time: '-3h 10m', prediction: 'PRE-002' },
  { id: 'SIG-05', type: 'Dark Web Intel', time: '-2h 55m', prediction: 'PRE-004' },
  { id: 'SIG-06', type: 'Data Staging', time: '-2h 10m', prediction: 'PRE-003' },
  { id: 'SIG-07', type: 'C2 Pattern', time: '-1h 40m', prediction: 'PRE-001' },
  { id: 'SIG-08', type: 'VPN Anomaly', time: '-1h 05m', prediction: 'PRE-003' },
  { id: 'SIG-09', type: 'Vuln Scan', time: '-45m', prediction: 'PRE-005' },
  { id: 'SIG-10', type: 'Backup Disruption', time: '-20m', prediction: 'PRE-001' },
];

const STATUS_COLORS: Record<string, string> = {
  IMMINENT: '#ef4444',
  DEVELOPING: '#f97316',
  EMERGING: '#eab308',
  MONITORING: '#06b6d4',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#06b6d4',
};

const PREDICTION_COLORS: Record<string, string> = {
  'PRE-001': '#ef4444',
  'PRE-002': '#f97316',
  'PRE-003': '#f97316',
  'PRE-004': '#eab308',
  'PRE-005': '#eab308',
  'PRE-006': '#06b6d4',
};

function getStatusTailwind(status: string): string {
  switch (status) {
    case 'IMMINENT': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'DEVELOPING': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'EMERGING': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    case 'MONITORING': return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
    default: return 'text-slate-400 bg-slate-500/10 border-slate-500/30';
  }
}

function getSeverityTailwind(severity: string): string {
  switch (severity) {
    case 'critical': return 'text-red-400';
    case 'high': return 'text-orange-400';
    case 'medium': return 'text-yellow-400';
    case 'low': return 'text-cyan-400';
    default: return 'text-slate-400';
  }
}

function getSeverityGlowTailwind(severity: string): string {
  switch (severity) {
    case 'critical': return 'shadow-[0_0_20px_rgba(239,68,68,0.3)]';
    case 'high': return 'shadow-[0_0_20px_rgba(249,115,22,0.3)]';
    case 'medium': return 'shadow-[0_0_15px_rgba(234,179,8,0.2)]';
    case 'low': return 'shadow-[0_0_15px_rgba(6,182,212,0.2)]';
    default: return '';
  }
}

function getBarGlowColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.6)]';
    case 'high': return 'bg-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.6)]';
    case 'medium': return 'bg-yellow-500 shadow-[0_0_10px_rgba(234,179,8,0.5)]';
    case 'low': return 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.5)]';
    default: return 'bg-slate-500';
  }
}

function getBarTrackColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-500/10';
    case 'high': return 'bg-orange-500/10';
    case 'medium': return 'bg-yellow-500/10';
    case 'low': return 'bg-cyan-500/10';
    default: return 'bg-slate-500/10';
  }
}

function getActiveBorderColor(severity: string): string {
  switch (severity) {
    case 'critical': return 'border-red-500/40';
    case 'high': return 'border-orange-500/40';
    case 'medium': return 'border-yellow-500/40';
    case 'low': return 'border-cyan-500/40';
    default: return 'border-slate-500/40';
  }
}

const PredictiveThreatAnalytics: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoveredPrediction, setHoveredPrediction] = useState<string | null>(null);
  const [selectedPrediction, setSelectedPrediction] = useState<string | null>(null);
  const [canvasHoveredOrb, setCanvasHoveredOrb] = useState<string | null>(null);
  const [pulsePhase, setPulsePhase] = useState(0);

  const activePrediction = canvasHoveredOrb || hoveredPrediction || selectedPrediction;

  useEffect(() => {
    const interval = setInterval(() => {
      setPulsePhase(p => (p + 1) % 360);
    }, 50);
    return () => clearInterval(interval);
  }, []);

  const getOrbPositions = useCallback((cx: number, cy: number, maxRadius: number) => {
    const positions: { x: number; y: number; prediction: Prediction; radius: number }[] = [];
    const angleOffsets = [0, 1.2, 2.5, 3.8, 4.6, 5.5];

    PREDICTIONS.forEach((pred, i) => {
      const distFromCenter = maxRadius * (1 - pred.probability / 100) * 0.85 + maxRadius * 0.08;
      const angle = angleOffsets[i] + Math.sin(Date.now() / 8000 + i) * 0.1;
      const x = cx + Math.cos(angle) * distFromCenter;
      const y = cy + Math.sin(angle) * distFromCenter;
      const radius = 8 + (pred.probability / 100) * 18;
      positions.push({ x, y, prediction: pred, radius });
    });

    return positions;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;

    const resizeCanvas = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = 350 * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = '350px';
      ctx.scale(dpr, dpr);
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const particles: { x: number; y: number; vx: number; vy: number; alpha: number; size: number }[] = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * 2000,
        y: Math.random() * 350,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.4 + 0.1,
        size: Math.random() * 1.5 + 0.5,
      });
    }

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handleClick = () => {
      if (canvasHoveredOrb) {
        setSelectedPrediction(prev => prev === canvasHoveredOrb ? null : canvasHoveredOrb);
      }
    };

    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('click', handleClick);

    let startTime = Date.now();

    const draw = () => {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const elapsed = (Date.now() - startTime) / 1000;
      const cx = w / 2;
      const cy = h / 2 - 10;
      const maxRingRadius = Math.min(w / 2 - 40, h / 2 - 30);

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#060a14';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(59,130,246,0.03)';
      ctx.lineWidth = 0.5;
      const gridSpacing = 30;
      for (let x = 0; x < w; x += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += gridSpacing) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      const ringRadii = [0.2, 0.4, 0.6, 0.8, 1.0].map(f => f * maxRingRadius);
      const ringLabels = ['+24h', 'NOW', '-24h', '-48h', '-72h'];
      const ringSpeeds = [0.15, -0.1, 0.08, -0.05, 0.03];

      ringRadii.forEach((r, i) => {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(elapsed * ringSpeeds[i]);

        const alpha = 0.08 + (1 - i / 5) * 0.12;
        ctx.strokeStyle = `rgba(59,130,246,${alpha})`;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 6]);
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.restore();

        ctx.save();
        ctx.font = '9px monospace';
        ctx.fillStyle = `rgba(148,163,184,${0.4 + (1 - i / 5) * 0.3})`;
        ctx.textAlign = 'center';
        const labelAngle = elapsed * ringSpeeds[i] * 0.3 - Math.PI / 2;
        const lx = cx + Math.cos(labelAngle) * (r + 12);
        const ly = cy + Math.sin(labelAngle) * (r + 12);
        ctx.fillText(ringLabels[i], lx, ly);
        ctx.restore();
      });

      const sweepAngle = elapsed * 0.8;
      const sweepGrad = ctx.createConicGradient(sweepAngle, cx, cy);
      sweepGrad.addColorStop(0, 'rgba(59,130,246,0.12)');
      sweepGrad.addColorStop(0.06, 'rgba(59,130,246,0.01)');
      sweepGrad.addColorStop(0.94, 'rgba(59,130,246,0.0)');
      sweepGrad.addColorStop(1, 'rgba(59,130,246,0.12)');

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, maxRingRadius, sweepAngle - 0.4, sweepAngle);
      ctx.closePath();
      ctx.fillStyle = sweepGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      const sx = cx + Math.cos(sweepAngle) * maxRingRadius;
      const sy = cy + Math.sin(sweepAngle) * maxRingRadius;
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = 'rgba(59,130,246,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 25);
      const corePulse = 0.3 + Math.sin(elapsed * 2) * 0.15;
      coreGlow.addColorStop(0, `rgba(59,130,246,${corePulse + 0.3})`);
      coreGlow.addColorStop(0.3, `rgba(59,130,246,${corePulse})`);
      coreGlow.addColorStop(0.7, 'rgba(59,130,246,0.05)');
      coreGlow.addColorStop(1, 'rgba(59,130,246,0)');
      ctx.beginPath();
      ctx.arc(cx, cy, 25, 0, Math.PI * 2);
      ctx.fillStyle = coreGlow;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, 4 + Math.sin(elapsed * 3) * 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(147,197,253,0.9)';
      ctx.fill();

      particles.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;

        const flicker = p.alpha * (0.7 + Math.sin(elapsed * 2 + p.x * 0.01) * 0.3);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(148,163,184,${flicker})`;
        ctx.fill();
      });

      const orbs = getOrbPositions(cx, cy, maxRingRadius);

      let foundHover: string | null = null;

      for (let i = 0; i < orbs.length; i++) {
        for (let j = i + 1; j < orbs.length; j++) {
          const a = orbs[i];
          const b = orbs[j];
          const predA = a.prediction;
          const predB = b.prediction;

          const sharedSignals = SIGNALS.filter(
            s => s.prediction === predA.id || s.prediction === predB.id
          );
          if (sharedSignals.length > 0) {
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < maxRingRadius * 1.2) {
              const lineAlpha = 0.03 + Math.sin(elapsed * 1.5 + i + j) * 0.02;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.strokeStyle = `rgba(148,163,184,${lineAlpha})`;
              ctx.lineWidth = 0.5;
              ctx.stroke();
            }
          }
        }
      }

      orbs.forEach(({ x, y, prediction, radius }) => {
        const color = SEVERITY_COLORS[prediction.severity];
        const pulse = Math.sin(elapsed * 2.5 + PREDICTIONS.indexOf(prediction)) * 0.3 + 0.7;
        const isHovered = activePrediction === prediction.id;
        const displayRadius = isHovered ? radius * 1.3 : radius * (0.9 + pulse * 0.1);

        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const distToMouse = Math.hypot(mx - x, my - y);
        if (distToMouse < displayRadius + 8) {
          foundHover = prediction.id;
        }

        const cr = parseInt(color.slice(1, 3), 16);
        const cg = parseInt(color.slice(3, 5), 16);
        const cb = parseInt(color.slice(5, 7), 16);

        if (prediction.probability > 80) {
          const rayCount = 6;
          for (let ri = 0; ri < rayCount; ri++) {
            const rayAngle = (ri / rayCount) * Math.PI * 2 + elapsed * 0.5;
            const rayLen = displayRadius * 2.5 + Math.sin(elapsed * 3 + ri) * 8;
            const rGrad = ctx.createLinearGradient(x, y, x + Math.cos(rayAngle) * rayLen, y + Math.sin(rayAngle) * rayLen);
            rGrad.addColorStop(0, `rgba(${cr},${cg},${cb},${0.4 * pulse})`);
            rGrad.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + Math.cos(rayAngle) * rayLen, y + Math.sin(rayAngle) * rayLen);
            ctx.strokeStyle = rGrad;
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        const outerGlow = ctx.createRadialGradient(x, y, 0, x, y, displayRadius * 3);
        const r = cr;
        const g = cg;
        const b = cb;
        outerGlow.addColorStop(0, `rgba(${r},${g},${b},${0.25 * pulse})`);
        outerGlow.addColorStop(0.4, `rgba(${r},${g},${b},${0.08 * pulse})`);
        outerGlow.addColorStop(1, `rgba(${r},${g},${b},0)`);
        ctx.beginPath();
        ctx.arc(x, y, displayRadius * 3, 0, Math.PI * 2);
        ctx.fillStyle = outerGlow;
        ctx.fill();

        const orbGrad = ctx.createRadialGradient(x, y, 0, x, y, displayRadius);
        orbGrad.addColorStop(0, `rgba(${r},${g},${b},${0.9 * pulse})`);
        orbGrad.addColorStop(0.5, `rgba(${r},${g},${b},${0.4 * pulse})`);
        orbGrad.addColorStop(1, `rgba(${r},${g},${b},${0.15 * pulse})`);
        ctx.beginPath();
        ctx.arc(x, y, displayRadius, 0, Math.PI * 2);
        ctx.fillStyle = orbGrad;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, displayRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${r},${g},${b},${0.6 * pulse})`;
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = `rgba(255,255,255,${0.85 * pulse})`;
        ctx.textAlign = 'center';
        ctx.fillText(`${prediction.probability}%`, x, y + 3.5);

        ctx.font = '8px monospace';
        ctx.fillStyle = `rgba(${r},${g},${b},${0.7 * pulse})`;
        ctx.fillText(prediction.id, x, y - displayRadius - 6);

        if (isHovered) {
          ctx.font = '9px sans-serif';
          ctx.fillStyle = 'rgba(226,232,240,0.9)';
          const titleLines = prediction.title.length > 28
            ? [prediction.title.substring(0, 28), prediction.title.substring(28)]
            : [prediction.title];
          titleLines.forEach((line, li) => {
            ctx.fillText(line, x, y + displayRadius + 16 + li * 12);
          });
        }
      });

      setCanvasHoveredOrb(foundHover);
      canvas.style.cursor = foundHover ? 'pointer' : 'default';

      const bottomGrad = ctx.createLinearGradient(0, h - 60, 0, h);
      bottomGrad.addColorStop(0, 'rgba(6,10,20,0)');
      bottomGrad.addColorStop(1, 'rgba(6,10,20,1)');
      ctx.fillStyle = bottomGrad;
      ctx.fillRect(0, h - 60, w, 60);

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText('PRE-COMPROMISE ENGINE v4.2', 16, 24);

      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.4)';
      ctx.fillText(`ACTIVE PREDICTIONS: ${PREDICTIONS.length}`, 16, 38);

      const livePulse = Math.sin(elapsed * 4) * 0.4 + 0.6;
      ctx.textAlign = 'right';
      ctx.beginPath();
      ctx.arc(w - 52, 20, 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(239,68,68,${livePulse})`;
      ctx.fill();

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = `rgba(239,68,68,${0.5 + livePulse * 0.3})`;
      ctx.fillText('LIVE', w - 16, 24);

      ctx.font = '9px monospace';
      ctx.fillStyle = 'rgba(148,163,184,0.4)';
      ctx.textAlign = 'right';
      ctx.fillText(`SCAN CYCLE: ${Math.floor(elapsed * 10) % 1000}`, w - 16, 38);

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resizeCanvas);
      canvas.removeEventListener('mousemove', handleMouseMove);
      canvas.removeEventListener('click', handleClick);
    };
  }, [getOrbPositions, activePrediction]);

  const pulseScale = Math.sin((pulsePhase * Math.PI) / 180);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Eye className="w-5 h-5 text-blue-400" />
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200 tracking-wide">PREDICTIVE THREAT ANALYTICS</h2>
            <p className="text-[10px] font-mono text-slate-500 tracking-widest">PRE-COMPROMISE INTELLIGENCE ENGINE</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-500">
            <Cpu className="w-3 h-3 text-blue-400/60" />
            <span>BAYESIAN NET v3.1</span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400/70">
            <Activity className="w-3 h-3" />
            <span>CORRELATION ACTIVE</span>
          </div>
        </div>
      </div>

      <div ref={containerRef} className="enterprise-card relative rounded-lg overflow-hidden border border-slate-700/50">
        <canvas
          ref={canvasRef}
          className="w-full block"
          onMouseLeave={() => setCanvasHoveredOrb(null)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {PREDICTIONS.map((pred) => {
          const isActive = activePrediction === pred.id;
          const probPulse = pred.severity === 'critical' ? 1 + pulseScale * 0.05 : 1;

          return (
            <div
              key={pred.id}
              className={`enterprise-card rounded-lg border transition-all duration-300 cursor-pointer ${
                isActive
                  ? `${getActiveBorderColor(pred.severity)} ${getSeverityGlowTailwind(pred.severity)}`
                  : 'border-slate-700/40'
              } bg-slate-900/80 backdrop-blur-sm p-3`}
              onMouseEnter={() => setHoveredPrediction(pred.id)}
              onMouseLeave={() => setHoveredPrediction(null)}
              onClick={() => setSelectedPrediction(prev => prev === pred.id ? null : pred.id)}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-slate-500">{pred.id}</span>
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${getStatusTailwind(pred.status)}`}>
                    {pred.status}
                  </span>
                </div>
                {pred.severity === 'critical' && (
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 animate-pulse" />
                )}
              </div>

              <h3 className="text-xs font-semibold text-slate-200 mb-2 leading-tight line-clamp-2">
                {pred.title}
              </h3>

              <div className="flex items-baseline gap-1 mb-2">
                <span
                  className={`text-2xl font-bold font-mono ${getSeverityTailwind(pred.severity)} tabular-nums`}
                  style={{ transform: `scale(${probPulse})`, display: 'inline-block' }}
                >
                  {pred.probability}
                </span>
                <span className={`text-xs font-mono ${getSeverityTailwind(pred.severity)} opacity-60`}>%</span>
                <span className="text-[10px] font-mono text-slate-600 ml-1">probability</span>
              </div>

              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Materialization</span>
                  <span className={`text-[9px] font-mono ${getSeverityTailwind(pred.severity)}`}>{pred.probability}%</span>
                </div>
                <div className={`h-1.5 rounded-full ${getBarTrackColor(pred.severity)} overflow-hidden`}>
                  <div
                    className={`h-full rounded-full ${getBarGlowColor(pred.severity)} transition-all duration-1000`}
                    style={{ width: `${pred.probability}%` }}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 mb-2 text-[10px] font-mono">
                <div className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span>ETA {pred.eta}</span>
                </div>
                <div className="flex items-center gap-1 text-blue-400/70">
                  <Crosshair className="w-3 h-3" />
                  <span className="truncate">{pred.tactic}</span>
                </div>
              </div>

              <div className="border-t border-slate-700/30 pt-2 mt-1">
                <div className="flex items-center gap-1 mb-1.5">
                  <Radio className="w-3 h-3 text-slate-500" />
                  <span className="text-[9px] font-mono text-slate-500 uppercase tracking-wider">Signal Feeds</span>
                  <span className="text-[9px] font-mono text-slate-600 ml-auto">{pred.signals.length}</span>
                </div>
                <div className="space-y-1">
                  {pred.signals.map((signal, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <span className={`mt-1.5 w-1 h-1 rounded-full flex-shrink-0 ${
                        pred.severity === 'critical' ? 'bg-red-400/60' :
                        pred.severity === 'high' ? 'bg-orange-400/60' :
                        pred.severity === 'medium' ? 'bg-yellow-400/60' : 'bg-cyan-400/60'
                      }`} />
                      <span className="text-[10px] text-slate-400 leading-tight">{signal}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="enterprise-card rounded-lg border border-slate-700/40 bg-slate-900/80 backdrop-blur-sm p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-blue-400/70" />
            <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest">Signal Timeline</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[9px] font-mono text-slate-500">TEMPORAL RANGE: -6h to +4h</span>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[9px] font-mono text-emerald-400/70">SYNCED</span>
            </div>
          </div>
        </div>

        <div className="relative h-20">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full h-px bg-slate-700/50" />
          </div>

          <div
            className="absolute top-0 bottom-0 right-0 bg-blue-500/[0.04] border-l border-blue-500/20"
            style={{ left: '60%' }}
          >
            <span className="absolute top-0 left-2 text-[8px] font-mono text-blue-400/50 uppercase tracking-wider">
              Prediction Zone
            </span>
          </div>

          {['-6h', '-4h', '-2h', 'NOW', '+2h', '+4h'].map((label, i) => {
            const pos = (i / 5) * 100;
            const isNow = label === 'NOW';
            return (
              <div
                key={label}
                className="absolute top-0 bottom-0 flex flex-col items-center justify-center"
                style={{ left: `${pos}%` }}
              >
                <div className={`w-px h-full ${isNow ? 'bg-blue-400/40' : 'bg-slate-700/30'}`} />
                <span className={`absolute bottom-0 text-[9px] font-mono ${
                  isNow ? 'text-blue-400 font-bold' : 'text-slate-600'
                }`}>
                  {label}
                </span>
              </div>
            );
          })}

          {SIGNALS.map((signal, i) => {
            const timeStr = signal.time;
            const hoursMatch = timeStr.match(/-?(\d+)h/);
            const minsMatch = timeStr.match(/(\d+)m/);
            const hours = hoursMatch ? parseFloat(hoursMatch[1]) : 0;
            const mins = minsMatch ? parseFloat(minsMatch[1]) / 60 : 0;
            const totalHours = hours + mins;
            const posPercent = ((6 - totalHours) / 10) * 100;

            const color = PREDICTION_COLORS[signal.prediction] || '#94a3b8';
            const isLinked = activePrediction === signal.prediction;
            const r = parseInt(color.slice(1, 3), 16);
            const g = parseInt(color.slice(3, 5), 16);
            const b = parseInt(color.slice(5, 7), 16);

            return (
              <div
                key={signal.id}
                className="absolute flex flex-col items-center group"
                style={{
                  left: `${posPercent}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                }}
              >
                {isLinked && (
                  <div
                    className="absolute w-6 h-6 rounded-full animate-ping"
                    style={{ backgroundColor: `rgba(${r},${g},${b},0.2)` }}
                  />
                )}
                <div
                  className={`w-3 h-3 rounded-full border-2 transition-all duration-300 ${
                    isLinked ? 'scale-150' : 'scale-100'
                  }`}
                  style={{
                    backgroundColor: `rgba(${r},${g},${b},${isLinked ? 0.9 : 0.5})`,
                    borderColor: `rgba(${r},${g},${b},${isLinked ? 1 : 0.6})`,
                    boxShadow: isLinked ? `0 0 12px rgba(${r},${g},${b},0.6)` : 'none',
                  }}
                />
                <div className={`absolute -top-7 whitespace-nowrap transition-opacity duration-200 ${
                  isLinked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  <div className="text-[9px] font-mono text-slate-300 bg-slate-800/90 border border-slate-700/50 rounded px-1.5 py-0.5">
                    {signal.type}
                  </div>
                </div>
                <div className={`absolute top-5 whitespace-nowrap transition-opacity duration-200 ${
                  isLinked ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}>
                  <span className="text-[8px] font-mono text-slate-500">{signal.time}</span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700/30">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-yellow-400/60" />
              <span className="text-[10px] font-mono text-slate-500">
                ACTIVE SIGNALS: <span className="text-slate-300">{SIGNALS.length}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3 h-3 text-blue-400/60" />
              <span className="text-[10px] font-mono text-slate-500">
                PREDICTIONS: <span className="text-slate-300">{PREDICTIONS.length}</span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity className="w-3 h-3 text-emerald-400/60" />
              <span className="text-[10px] font-mono text-slate-500">
                CRITICAL: <span className="text-red-400">{PREDICTIONS.filter(p => p.severity === 'critical').length}</span>
              </span>
            </div>
          </div>
          <div className="text-[9px] font-mono text-slate-600 tracking-wider">
            CORRELATION ENGINE: BAYESIAN NETWORK v3.1
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictiveThreatAnalytics;
