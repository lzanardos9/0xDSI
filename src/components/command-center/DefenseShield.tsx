import { useEffect, useRef, useState } from 'react';
import { Shield } from 'lucide-react';

interface ShieldHex {
  x: number;
  y: number;
  health: number;
  maxHealth: number;
  repairing: boolean;
  lastHit: number;
  label: string;
  sector: string;
}

interface Impact {
  x: number;
  y: number;
  time: number;
  strength: number;
  particles: { x: number; y: number; vx: number; vy: number; life: number }[];
}

const DefenseShield = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const hexesRef = useRef<ShieldHex[]>([]);
  const impactsRef = useRef<Impact[]>([]);
  const [overallHealth, setOverallHealth] = useState(100);
  const [shieldStatus, setShieldStatus] = useState('NOMINAL');

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
        ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    const sectors = ['Firewall', 'IDS', 'EDR', 'SIEM', 'NDR', 'WAF', 'DLP', 'IAM', 'Email Sec', 'Cloud Sec', 'Endpoint', 'Backup'];
    const hexRadius = 28;
    const hexHeight = hexRadius * Math.sqrt(3);
    const rows = 4;
    const cols = 4;

    const buildHexGrid = (w: number, h: number) => {
      hexesRef.current = [];
      const offsetX = w / 2 - (cols * hexRadius * 1.5) / 2;
      const offsetY = h / 2 - (rows * hexHeight) / 2;
      let idx = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          if (idx >= sectors.length) break;
          const x = offsetX + col * hexRadius * 1.6 + (row % 2) * hexRadius * 0.8;
          const y = offsetY + row * hexHeight * 0.9;
          hexesRef.current.push({
            x, y,
            health: 100,
            maxHealth: 100,
            repairing: false,
            lastHit: 0,
            label: sectors[idx],
            sector: sectors[idx],
          });
          idx++;
        }
      }
    };

    const drawHex = (cx: number, cy: number, r: number, health: number, label: string, lastHit: number, now: number) => {
      const healthPct = health / 100;
      const hitAge = now - lastHit;
      const isRecentHit = hitAge < 500;

      const color = healthPct > 0.7 ? '#22d3ee' : healthPct > 0.4 ? '#eab308' : '#ef4444';
      const alpha = 0.3 + healthPct * 0.5;

      ctx.save();

      if (isRecentHit) {
        const shake = (1 - hitAge / 500) * 2;
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 6;
        const hx = cx + r * Math.cos(angle);
        const hy = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(hx, hy);
        else ctx.lineTo(hx, hy);
      }
      ctx.closePath();

      const fillAlpha = Math.round(alpha * 0.2 * 255).toString(16).padStart(2, '0');
      ctx.fillStyle = color + fillAlpha;
      ctx.fill();

      ctx.strokeStyle = color + Math.round(alpha * 255).toString(16).padStart(2, '0');
      ctx.lineWidth = isRecentHit ? 2.5 : 1.5;
      ctx.stroke();

      if (healthPct < 1) {
        const crackCount = Math.floor((1 - healthPct) * 4);
        ctx.strokeStyle = color + '30';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < crackCount; i++) {
          const startAngle = (Math.PI / 3) * (i % 6) - Math.PI / 6;
          const sx = cx + r * 0.3 * Math.cos(startAngle);
          const sy = cy + r * 0.3 * Math.sin(startAngle);
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(sx, sy);
          let crackX = sx;
          let crackY = sy;
          for (let j = 0; j < 3; j++) {
            crackX += (Math.random() - 0.5) * 10;
            crackY += (Math.random() - 0.5) * 10;
            ctx.lineTo(crackX, crackY);
          }
          ctx.stroke();
        }
      }

      ctx.fillStyle = color + '90';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(label, cx, cy - 4);

      ctx.fillStyle = healthPct > 0.7 ? '#22d3ee80' : healthPct > 0.4 ? '#eab30880' : '#ef444480';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`${Math.round(health)}%`, cx, cy + 8);

      const barWidth = r * 1.2;
      const barHeight = 3;
      const barX = cx - barWidth / 2;
      const barY = cy + 14;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);
      ctx.fillStyle = color;
      ctx.fillRect(barX, barY, barWidth * healthPct, barHeight);

      ctx.restore();
    };

    let initialized = false;

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();

      if (!initialized) {
        buildHexGrid(w, h);
        initialized = true;
      }

      ctx.clearRect(0, 0, w, h);

      if (Math.random() < 0.02) {
        const target = hexesRef.current[Math.floor(Math.random() * hexesRef.current.length)];
        const damage = 5 + Math.random() * 15;
        target.health = Math.max(0, target.health - damage);
        target.lastHit = now;
        target.repairing = false;

        const impactParticles = [];
        for (let i = 0; i < 12; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = 1 + Math.random() * 3;
          impactParticles.push({
            x: target.x, y: target.y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            life: 30 + Math.random() * 20,
          });
        }
        impactsRef.current.push({
          x: target.x, y: target.y,
          time: now, strength: damage,
          particles: impactParticles,
        });
      }

      for (const hex of hexesRef.current) {
        if (hex.health < hex.maxHealth && now - hex.lastHit > 2000) {
          hex.repairing = true;
          hex.health = Math.min(hex.maxHealth, hex.health + 0.08);
        }
      }

      const cx = w / 2;
      const cy = h / 2;
      const shieldRadius = Math.min(w, h) * 0.45;
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, shieldRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy, shieldRadius * 0.7, 0, Math.PI * 2);
      ctx.stroke();

      const outerGrad = ctx.createRadialGradient(cx, cy, shieldRadius * 0.8, cx, cy, shieldRadius);
      outerGrad.addColorStop(0, 'rgba(34, 211, 238, 0)');
      outerGrad.addColorStop(1, 'rgba(34, 211, 238, 0.03)');
      ctx.fillStyle = outerGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, shieldRadius, 0, Math.PI * 2);
      ctx.fill();

      for (const hex of hexesRef.current) {
        drawHex(hex.x, hex.y, hexRadius, hex.health, hex.label, hex.lastHit, now);

        if (hex.repairing) {
          ctx.globalAlpha = 0.3 + Math.sin(now * 0.01) * 0.15;
          ctx.strokeStyle = '#22d3ee30';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([2, 3]);
          ctx.beginPath();
          ctx.arc(hex.x, hex.y, hexRadius + 4, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }

      impactsRef.current = impactsRef.current.filter(impact => {
        const age = now - impact.time;
        if (age > 2000) return false;

        impact.particles = impact.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.96;
          p.vy *= 0.96;
          p.life--;
          if (p.life <= 0) return false;
          const alpha = p.life / 50;
          ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`;
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 1.5 * alpha, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          return true;
        });

        if (age < 200) {
          const ringAlpha = 1 - age / 200;
          ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha * 0.5})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(impact.x, impact.y, hexRadius + age * 0.1, 0, Math.PI * 2);
          ctx.stroke();
        }

        return impact.particles.length > 0 || age < 200;
      });

      const total = hexesRef.current.reduce((s, h) => s + h.health, 0);
      const avg = total / hexesRef.current.length;
      setOverallHealth(Math.round(avg));
      if (avg > 80) setShieldStatus('NOMINAL');
      else if (avg > 60) setShieldStatus('DEGRADED');
      else if (avg > 40) setShieldStatus('CRITICAL');
      else setShieldStatus('FAILING');

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const statusColor = overallHealth > 80 ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' :
    overallHealth > 60 ? 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10' :
    'text-red-400 border-red-500/30 bg-red-500/10';

  return (
    <div className="relative w-full h-full bg-[#050810] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-cyan-500/20">
          <Shield className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-400 text-xs font-mono font-bold tracking-wider">DEFENSE SHIELD</span>
        </div>
        <div className={`px-2.5 py-1 rounded border ${statusColor}`}>
          <span className="text-[10px] font-mono font-bold">{shieldStatus}</span>
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10 flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded border border-slate-700/30">
        <span className="text-slate-500 text-[10px] font-mono">INTEGRITY</span>
        <span className={`text-xl font-mono font-bold ${overallHealth > 80 ? 'text-cyan-400' : overallHealth > 60 ? 'text-yellow-400' : 'text-red-400'}`}>
          {overallHealth}%
        </span>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default DefenseShield;
