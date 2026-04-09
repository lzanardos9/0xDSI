import { useEffect, useRef, useState } from 'react';

interface ThreatBlip {
  id: string;
  x: number;
  y: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  label: string;
  angle: number;
  distance: number;
  alive: boolean;
  destroyedAt?: number;
  spawnedAt: number;
  pulsePhase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22d3ee',
};

const THREAT_LABELS = [
  'APT-29 C2', 'Cobalt Strike', 'Mimikatz', 'BloodHound', 'Ransomware',
  'SQL Injection', 'XSS Payload', 'Brute Force', 'Phishing Kit', 'Rootkit',
  'Keylogger', 'DDoS Bot', 'Cryptominer', 'Backdoor', 'Trojan',
  'Zero-Day', 'Lateral Move', 'Exfiltration', 'Privilege Esc', 'Persistence',
];

const ThreatRadar = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const sweepAngle = useRef(0);
  const blips = useRef<ThreatBlip[]>([]);
  const particles = useRef<Particle[]>([]);
  const [stats, setStats] = useState({ active: 0, destroyed: 0, critical: 0 });
  const lastSpawn = useRef(0);
  const destroyedCount = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const spawnBlip = () => {
      const severities: ThreatBlip['severity'][] = ['critical', 'high', 'medium', 'low'];
      const severity = severities[Math.floor(Math.random() * severities.length)];
      const angle = Math.random() * Math.PI * 2;
      const distance = 0.3 + Math.random() * 0.65;
      const blip: ThreatBlip = {
        id: Math.random().toString(36).substr(2, 9),
        x: 0, y: 0,
        severity,
        label: THREAT_LABELS[Math.floor(Math.random() * THREAT_LABELS.length)],
        angle,
        distance,
        alive: true,
        spawnedAt: Date.now(),
        pulsePhase: Math.random() * Math.PI * 2,
      };
      blips.current.push(blip);
    };

    for (let i = 0; i < 12; i++) spawnBlip();

    const destroyBlip = (blip: ThreatBlip, cx: number, cy: number, radius: number) => {
      blip.alive = false;
      blip.destroyedAt = Date.now();
      destroyedCount.current++;
      const bx = cx + Math.cos(blip.angle) * blip.distance * radius;
      const by = cy + Math.sin(blip.angle) * blip.distance * radius;
      const color = SEVERITY_COLORS[blip.severity];
      for (let i = 0; i < 20; i++) {
        const a = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 3;
        particles.current.push({
          x: bx, y: by,
          vx: Math.cos(a) * speed,
          vy: Math.sin(a) * speed,
          life: 1, maxLife: 40 + Math.random() * 30,
          color,
          size: 1 + Math.random() * 3,
        });
      }
    };

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w, h) * 0.42;

      ctx.clearRect(0, 0, w, h);

      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 1.2);
      grad.addColorStop(0, 'rgba(0, 30, 20, 0.3)');
      grad.addColorStop(1, 'rgba(0, 10, 5, 0.1)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(34, 211, 154, 0.12)';
      ctx.lineWidth = 1;
      for (let i = 1; i <= 5; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, radius * (i / 5), 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(34, 211, 154, 0.06)';
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
        ctx.stroke();
      }

      const zoneLabels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'PERIMETER'];
      const zoneColors = ['#ef4444', '#f97316', '#eab308', '#22d3ee', '#10b981'];
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = zoneColors[i] + '40';
        ctx.fillText(zoneLabels[i], cx, cy - radius * ((i + 1) / 5) + 12);
      }

      sweepAngle.current += 0.012;
      if (sweepAngle.current > Math.PI * 2) sweepAngle.current -= Math.PI * 2;

      const sweepGrad = (ctx as any).createConicGradient?.(sweepAngle.current, cx, cy);
      if (!sweepGrad) {
        const sa = sweepAngle.current;
        for (let i = 0; i < 40; i++) {
          const a = sa - (i / 40) * 0.8;
          const alpha = (1 - i / 40) * 0.15;
          ctx.strokeStyle = `rgba(34, 211, 154, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius);
          ctx.stroke();
        }
      }

      ctx.strokeStyle = 'rgba(34, 211, 154, 0.8)';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#22d39a';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(
        cx + Math.cos(sweepAngle.current) * radius,
        cy + Math.sin(sweepAngle.current) * radius
      );
      ctx.stroke();
      ctx.shadowBlur = 0;

      const now = Date.now();
      if (now - lastSpawn.current > 2000 + Math.random() * 3000) {
        spawnBlip();
        lastSpawn.current = now;
      }

      if (Math.random() < 0.008) {
        const aliveBlips = blips.current.filter(b => b.alive);
        if (aliveBlips.length > 3) {
          const target = aliveBlips[Math.floor(Math.random() * aliveBlips.length)];
          destroyBlip(target, cx, cy, radius);
        }
      }

      let activeCount = 0;
      let criticalCount = 0;

      blips.current = blips.current.filter(b => {
        if (!b.alive && b.destroyedAt && now - b.destroyedAt > 2000) return false;
        return true;
      });

      for (const blip of blips.current) {
        const bx = cx + Math.cos(blip.angle) * blip.distance * radius;
        const by = cy + Math.sin(blip.angle) * blip.distance * radius;
        blip.x = bx;
        blip.y = by;

        if (!blip.alive) {
          if (blip.destroyedAt) {
            const elapsed = now - blip.destroyedAt;
            const fade = Math.max(0, 1 - elapsed / 1500);
            if (fade > 0) {
              ctx.globalAlpha = fade * 0.5;
              ctx.beginPath();
              ctx.arc(bx, by, 8 + (1 - fade) * 20, 0, Math.PI * 2);
              ctx.fillStyle = SEVERITY_COLORS[blip.severity];
              ctx.fill();
              ctx.globalAlpha = 1;
            }
          }
          continue;
        }

        activeCount++;
        if (blip.severity === 'critical') criticalCount++;

        const pulse = Math.sin(now * 0.004 + blip.pulsePhase) * 0.3 + 0.7;
        const color = SEVERITY_COLORS[blip.severity];
        const baseSize = blip.severity === 'critical' ? 7 : blip.severity === 'high' ? 5.5 : 4;
        const size = baseSize * pulse;

        ctx.shadowColor = color;
        ctx.shadowBlur = blip.severity === 'critical' ? 15 : 8;

        ctx.fillStyle = color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(bx, by, size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(bx, by, size * 1.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(bx, by, size, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;

        if (blip.severity === 'critical') {
          const ringSize = size * 3 + Math.sin(now * 0.006) * 4;
          ctx.strokeStyle = color + '60';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(bx, by, ringSize, 0, Math.PI * 2);
          ctx.stroke();
        }

        const age = now - blip.spawnedAt;
        if (age < 800) {
          const revealAlpha = Math.min(1, age / 800);
          ctx.globalAlpha = revealAlpha * 0.7;
          ctx.fillStyle = '#94a3b8';
          ctx.font = '9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(blip.label, bx + size + 6, by + 3);
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.7;
          ctx.fillStyle = '#94a3b8';
          ctx.font = '9px monospace';
          ctx.textAlign = 'left';
          ctx.fillText(blip.label, bx + size + 6, by + 3);
          ctx.globalAlpha = 1;
        }
      }

      particles.current = particles.current.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.life++;
        const alpha = Math.max(0, 1 - p.life / p.maxLife);
        if (alpha <= 0) return false;
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
        return true;
      });

      ctx.strokeStyle = 'rgba(34, 211, 154, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = 'rgba(34, 211, 154, 0.9)';
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();

      setStats({ active: activeCount, destroyed: destroyedCount.current, critical: criticalCount });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-[#050d0a] rounded-xl overflow-hidden border border-emerald-900/30">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-emerald-500/20">
          <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
          <span className="text-emerald-400 text-xs font-mono font-bold tracking-wider">THREAT RADAR</span>
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10 flex gap-2">
        <div className="px-2.5 py-1 bg-black/60 rounded border border-red-500/30">
          <span className="text-red-400 text-[10px] font-mono">CRIT: {stats.critical}</span>
        </div>
        <div className="px-2.5 py-1 bg-black/60 rounded border border-cyan-500/30">
          <span className="text-cyan-400 text-[10px] font-mono">ACTIVE: {stats.active}</span>
        </div>
        <div className="px-2.5 py-1 bg-black/60 rounded border border-emerald-500/30">
          <span className="text-emerald-400 text-[10px] font-mono">NEUTRALIZED: {stats.destroyed}</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-4 z-10 flex gap-3">
        {[
          { color: '#ef4444', label: 'Critical' },
          { color: '#f97316', label: 'High' },
          { color: '#eab308', label: 'Medium' },
          { color: '#22d3ee', label: 'Low' },
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-slate-500 text-[10px] font-mono">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThreatRadar;
