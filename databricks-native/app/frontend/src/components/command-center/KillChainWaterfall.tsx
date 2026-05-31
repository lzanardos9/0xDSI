import { useEffect, useRef, useState } from 'react';
import { Shield, Zap } from 'lucide-react';

interface AttackFlow {
  id: string;
  stage: number;
  x: number;
  y: number;
  blocked: boolean;
  blockedAt?: number;
  speed: number;
  color: string;
  label: string;
  particles: { x: number; y: number; vx: number; vy: number; life: number }[];
}

const KILL_CHAIN_STAGES = [
  { name: 'Reconnaissance', abbr: 'RECON', color: '#94a3b8', defense: 'Firewall' },
  { name: 'Weaponization', abbr: 'WEAPON', color: '#38bdf8', defense: 'IDS/IPS' },
  { name: 'Delivery', abbr: 'DELIVER', color: '#22d3ee', defense: 'Email Gateway' },
  { name: 'Exploitation', abbr: 'EXPLOIT', color: '#eab308', defense: 'EDR' },
  { name: 'Installation', abbr: 'INSTALL', color: '#f97316', defense: 'AV Engine' },
  { name: 'Command & Control', abbr: 'C2', color: '#ef4444', defense: 'NDR' },
  { name: 'Actions on Obj.', abbr: 'ACTION', color: '#dc2626', defense: 'DLP' },
];

const KillChainWaterfall = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const flows = useRef<AttackFlow[]>([]);
  const [stageStats, setStageStats] = useState<{ blocked: number; passed: number }[]>(
    KILL_CHAIN_STAGES.map(() => ({ blocked: 0, passed: 0 }))
  );
  const lastSpawn = useRef(0);

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

    const attackLabels = [
      'APT-29', 'Lazarus', 'Phishing', 'RCE', 'SQLi', 'XSS', 'DDoS',
      'Ransomware', 'Worm', 'Trojan', 'Rootkit', 'Backdoor',
    ];

    const spawnFlow = () => {
      const flow: AttackFlow = {
        id: Math.random().toString(36).substr(2, 9),
        stage: 0,
        x: 0.1 + Math.random() * 0.8,
        y: 0,
        blocked: false,
        speed: 0.3 + Math.random() * 0.4,
        color: KILL_CHAIN_STAGES[0].color,
        label: attackLabels[Math.floor(Math.random() * attackLabels.length)],
        particles: [],
      };
      flows.current.push(flow);
    };

    for (let i = 0; i < 5; i++) {
      const f: AttackFlow = {
        id: Math.random().toString(36).substr(2, 9),
        stage: Math.floor(Math.random() * 4),
        x: 0.1 + Math.random() * 0.8,
        y: 0,
        blocked: false,
        speed: 0.3 + Math.random() * 0.4,
        color: KILL_CHAIN_STAGES[0].color,
        label: attackLabels[Math.floor(Math.random() * attackLabels.length)],
        particles: [],
      };
      f.y = (f.stage / KILL_CHAIN_STAGES.length) + Math.random() * (1 / KILL_CHAIN_STAGES.length);
      flows.current.push(f);
    }

    const statsRef = KILL_CHAIN_STAGES.map(() => ({ blocked: 0, passed: 0 }));

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;

      ctx.clearRect(0, 0, w, h);

      const stageH = h / KILL_CHAIN_STAGES.length;
      for (let i = 0; i < KILL_CHAIN_STAGES.length; i++) {
        const y = i * stageH;
        const stage = KILL_CHAIN_STAGES[i];

        ctx.fillStyle = i % 2 === 0 ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0.15)';
        ctx.fillRect(0, y, w, stageH);

        const damY = y + stageH - 2;
        const gradient = ctx.createLinearGradient(0, damY - 3, 0, damY + 3);
        gradient.addColorStop(0, stage.color + '00');
        gradient.addColorStop(0.5, stage.color + '40');
        gradient.addColorStop(1, stage.color + '00');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, damY - 3, w, 6);

        ctx.fillStyle = stage.color + '15';
        ctx.fillRect(w - 90, y + 4, 86, stageH - 8);
        ctx.strokeStyle = stage.color + '30';
        ctx.lineWidth = 0.5;
        ctx.strokeRect(w - 90, y + 4, 86, stageH - 8);

        ctx.fillStyle = stage.color + '90';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(stage.abbr, w - 8, y + 16);
        ctx.fillStyle = stage.color + '50';
        ctx.font = '8px monospace';
        ctx.fillText(stage.defense, w - 8, y + stageH - 10);

        ctx.fillStyle = stage.color + '20';
        ctx.font = '8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`B:${statsRef[i].blocked} P:${statsRef[i].passed}`, 6, y + 14);
      }

      const now = Date.now();
      if (now - lastSpawn.current > 1500 + Math.random() * 2000) {
        spawnFlow();
        lastSpawn.current = now;
      }

      flows.current = flows.current.filter(flow => {
        if (flow.blocked) {
          flow.particles = flow.particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.05;
            p.vx *= 0.99;
            p.life--;
            if (p.life <= 0) return false;
            const alpha = p.life / 40;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
            return true;
          });
          return flow.particles.length > 0;
        }

        flow.y += flow.speed * 0.002;
        const currentStage = Math.floor(flow.y * KILL_CHAIN_STAGES.length);

        if (currentStage > flow.stage && currentStage < KILL_CHAIN_STAGES.length) {
          const blockChance = 0.3 + (currentStage * 0.08);
          if (Math.random() < blockChance) {
            flow.blocked = true;
            flow.blockedAt = now;
            statsRef[flow.stage].blocked++;
            const px = flow.x * (w - 100);
            const py = flow.y * h;
            for (let i = 0; i < 15; i++) {
              const angle = Math.random() * Math.PI * 2;
              const speed = 1 + Math.random() * 2;
              flow.particles.push({
                x: px, y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 20 + Math.random() * 20,
              });
            }
            setStageStats([...statsRef]);
            return true;
          }
          statsRef[flow.stage].passed++;
          flow.stage = currentStage;
          flow.color = KILL_CHAIN_STAGES[Math.min(currentStage, KILL_CHAIN_STAGES.length - 1)].color;
          setStageStats([...statsRef]);
        }

        if (flow.y > 1) return false;

        const fx = flow.x * (w - 100);
        const fy = flow.y * h;

        ctx.shadowColor = flow.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = flow.color;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(fx, fy, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(fx, fy, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(fx, fy, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = flow.color + '30';
        ctx.lineWidth = 0.5;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(fx, fy - 20);
        ctx.lineTo(fx, fy);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = flow.color + '80';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(flow.label, fx, fy - 10);

        return true;
      });

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const totalBlocked = stageStats.reduce((s, st) => s + st.blocked, 0);
  const totalPassed = stageStats.reduce((s, st) => s + st.passed, 0);
  const blockRate = totalBlocked + totalPassed > 0
    ? Math.round((totalBlocked / (totalBlocked + totalPassed)) * 100)
    : 0;

  return (
    <div className="relative w-full h-full bg-[#060810] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-slate-700/30">
          <Zap className="w-3 h-3 text-yellow-400" />
          <span className="text-slate-300 text-xs font-mono font-bold tracking-wider">KILL CHAIN</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400 text-[10px] font-mono font-bold">{blockRate}% BLOCKED</span>
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10 flex gap-2">
        <div className="px-2 py-1 bg-black/60 rounded border border-emerald-500/30">
          <span className="text-emerald-400 text-[10px] font-mono">STOPPED: {totalBlocked}</span>
        </div>
        <div className="px-2 py-1 bg-black/60 rounded border border-red-500/30">
          <span className="text-red-400 text-[10px] font-mono">PASSED: {totalPassed}</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
};

export default KillChainWaterfall;
