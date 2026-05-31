import { useEffect, useRef, useState } from 'react';

interface HeartbeatEvent {
  timestamp: number;
  amplitude: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  label: string;
}

const ThreatHeartbeat = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const dataPoints = useRef<number[]>([]);
  const events = useRef<HeartbeatEvent[]>([]);
  const [riskLevel, setRiskLevel] = useState(42);
  const [bpm, setBpm] = useState(72);
  const timeOffset = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    for (let i = 0; i < 300; i++) dataPoints.current.push(0);

    const getColor = (risk: number): string => {
      if (risk > 75) return '#ef4444';
      if (risk > 50) return '#f97316';
      if (risk > 30) return '#eab308';
      return '#22d3ee';
    };

    const getGlowColor = (risk: number): string => {
      if (risk > 75) return 'rgba(239, 68, 68, 0.15)';
      if (risk > 50) return 'rgba(249, 115, 22, 0.12)';
      if (risk > 30) return 'rgba(234, 179, 8, 0.08)';
      return 'rgba(34, 211, 238, 0.06)';
    };

    let currentRisk = 42;
    let targetRisk = 42;
    let spikeTimer = 0;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = getGlowColor(currentRisk);
      ctx.fillRect(0, 0, w, h);

      timeOffset.current += 0.03;
      spikeTimer++;

      if (spikeTimer > 120 + Math.random() * 200) {
        spikeTimer = 0;
        if (Math.random() > 0.4) {
          targetRisk = Math.min(100, currentRisk + 10 + Math.random() * 30);
          const severities: HeartbeatEvent['severity'][] = ['critical', 'high', 'medium'];
          const sev = severities[Math.floor(Math.random() * severities.length)];
          events.current.push({
            timestamp: Date.now(),
            amplitude: targetRisk,
            severity: sev,
            label: ['Ransomware', 'APT Activity', 'Data Exfil', 'Brute Force', 'C2 Beacon'][Math.floor(Math.random() * 5)],
          });
          if (events.current.length > 5) events.current.shift();
        } else {
          targetRisk = Math.max(15, currentRisk - 15 - Math.random() * 20);
        }
      }

      currentRisk += (targetRisk - currentRisk) * 0.02;
      setRiskLevel(Math.round(currentRisk));
      setBpm(Math.round(60 + currentRisk * 0.8));

      const t = timeOffset.current;
      const heartbeat = (phase: number): number => {
        const p = phase % (Math.PI * 2);
        const intensity = currentRisk / 100;
        let val = 0;
        val += Math.sin(p * 2) * 0.1;
        if (p > 1.2 && p < 1.6) val += Math.sin((p - 1.2) * Math.PI / 0.4) * (0.3 + intensity * 0.5);
        if (p > 1.8 && p < 2.4) val -= Math.sin((p - 1.8) * Math.PI / 0.6) * 0.15;
        if (p > 2.6 && p < 3.2) val += Math.sin((p - 2.6) * Math.PI / 0.6) * (0.2 + intensity * 0.3);
        val += (Math.random() - 0.5) * 0.02 * intensity;
        return val;
      };

      const newVal = heartbeat(t) * (h * 0.35);
      dataPoints.current.push(newVal);
      if (dataPoints.current.length > 300) dataPoints.current.shift();

      const color = getColor(currentRisk);
      const points = dataPoints.current;
      const stepX = w / (points.length - 1);

      ctx.shadowColor = color;
      ctx.shadowBlur = 12;

      ctx.strokeStyle = color + '30';
      ctx.lineWidth = 8;
      ctx.beginPath();
      const midY = h * 0.5;
      for (let i = 0; i < points.length; i++) {
        const x = i * stepX;
        const y = midY - points[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = color + '60';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = i * stepX;
        const y = midY - points[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = i * stepX;
        const y = midY - points[i];
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      const headX = (points.length - 1) * stepX;
      const headY = midY - points[points.length - 1];
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 15;
      ctx.beginPath();
      ctx.arc(headX, headY, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = 'rgba(100, 116, 139, 0.1)';
      ctx.lineWidth = 0.5;
      for (let y = 0; y < h; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const riskColor = riskLevel > 75 ? 'text-red-400' : riskLevel > 50 ? 'text-orange-400' : riskLevel > 30 ? 'text-yellow-400' : 'text-cyan-400';
  const riskBg = riskLevel > 75 ? 'bg-red-500/10 border-red-500/30' : riskLevel > 50 ? 'bg-orange-500/10 border-orange-500/30' : riskLevel > 30 ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-cyan-500/10 border-cyan-500/30';
  const statusLabel = riskLevel > 75 ? 'UNDER ATTACK' : riskLevel > 50 ? 'ELEVATED' : riskLevel > 30 ? 'GUARDED' : 'NOMINAL';

  return (
    <div className="relative w-full h-full bg-[#060a10] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-slate-700/30">
          <div className={`w-2 h-2 rounded-full animate-pulse ${riskLevel > 50 ? 'bg-red-400' : 'bg-cyan-400'}`} />
          <span className="text-slate-300 text-xs font-mono font-bold tracking-wider">THREAT PULSE</span>
        </div>
        <div className={`px-2.5 py-1 rounded border ${riskBg}`}>
          <span className={`text-[10px] font-mono font-bold ${riskColor}`}>{statusLabel}</span>
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10 flex items-center gap-3">
        <div className="text-right">
          <div className={`text-2xl font-mono font-bold ${riskColor}`}>{riskLevel}</div>
          <div className="text-slate-600 text-[9px] font-mono">RISK INDEX</div>
        </div>
        <div className="w-px h-8 bg-slate-800" />
        <div className="text-right">
          <div className="text-lg font-mono font-bold text-slate-300">{bpm}</div>
          <div className="text-slate-600 text-[9px] font-mono">THREAT/MIN</div>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-4 right-4 z-10 flex gap-2 overflow-hidden">
        {events.current.slice(-3).map((evt, i) => {
          const sevColor = evt.severity === 'critical' ? 'text-red-400 border-red-500/30 bg-red-500/10' :
            evt.severity === 'high' ? 'text-orange-400 border-orange-500/30 bg-orange-500/10' :
            'text-yellow-400 border-yellow-500/30 bg-yellow-500/10';
          return (
            <div key={i} className={`px-2 py-1 rounded border text-[10px] font-mono ${sevColor}`}>
              {evt.label}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ThreatHeartbeat;
