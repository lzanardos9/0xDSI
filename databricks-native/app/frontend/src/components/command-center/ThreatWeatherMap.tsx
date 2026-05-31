import { useEffect, useRef, useState } from 'react';
import { Cloud, CloudRain, CloudLightning, Sun, Wind } from 'lucide-react';

interface StormCell {
  x: number;
  y: number;
  radius: number;
  intensity: number;
  growing: boolean;
  label: string;
  type: 'storm' | 'rain' | 'clear' | 'lightning';
  color: string;
  particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number }[];
}

const ATTACK_SURFACES = [
  { name: 'External APIs', x: 0.15, y: 0.25 },
  { name: 'Email Gateway', x: 0.35, y: 0.15 },
  { name: 'VPN Endpoints', x: 0.55, y: 0.2 },
  { name: 'Cloud Services', x: 0.78, y: 0.15 },
  { name: 'Internal Network', x: 0.25, y: 0.5 },
  { name: 'Database Tier', x: 0.5, y: 0.45 },
  { name: 'User Endpoints', x: 0.72, y: 0.48 },
  { name: 'IoT Devices', x: 0.15, y: 0.75 },
  { name: 'CI/CD Pipeline', x: 0.42, y: 0.72 },
  { name: 'DNS Infrastructure', x: 0.65, y: 0.7 },
  { name: 'Identity Services', x: 0.85, y: 0.65 },
  { name: 'Backup Systems', x: 0.3, y: 0.88 },
];

const ThreatWeatherMap = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const stormsRef = useRef<StormCell[]>([]);
  const [forecast, setForecast] = useState('Partly Cloudy');
  const [severity, setSeverity] = useState(35);

  useEffect(() => {
    const initialStorms: StormCell[] = ATTACK_SURFACES.map(surface => ({
      x: surface.x,
      y: surface.y,
      radius: 20 + Math.random() * 40,
      intensity: Math.random() * 0.7,
      growing: Math.random() > 0.5,
      label: surface.name,
      type: Math.random() > 0.7 ? 'storm' : Math.random() > 0.4 ? 'rain' : 'clear',
      color: Math.random() > 0.7 ? '#ef4444' : Math.random() > 0.4 ? '#eab308' : '#22d3ee',
      particles: [],
    }));
    stormsRef.current = initialStorms;
  }, []);

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

    let frame = 0;
    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      frame++;

      ctx.clearRect(0, 0, w, h);

      const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
      bgGrad.addColorStop(0, 'rgba(8, 15, 25, 0.5)');
      bgGrad.addColorStop(1, 'rgba(5, 10, 18, 0.3)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(51, 65, 85, 0.08)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      for (let y = 0; y < h; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      let totalIntensity = 0;
      let stormCount = 0;

      for (const storm of stormsRef.current) {
        if (storm.growing) {
          storm.intensity = Math.min(1, storm.intensity + 0.001 + Math.random() * 0.002);
          if (storm.intensity > 0.9) storm.growing = false;
        } else {
          storm.intensity = Math.max(0, storm.intensity - 0.0008);
          if (storm.intensity < 0.1) storm.growing = true;
        }

        if (Math.random() < 0.002) {
          const types: StormCell['type'][] = ['storm', 'rain', 'clear', 'lightning'];
          storm.type = types[Math.floor(Math.random() * types.length)];
          storm.color = storm.type === 'storm' || storm.type === 'lightning' ? '#ef4444' :
            storm.type === 'rain' ? '#eab308' : '#22d3ee';
        }

        totalIntensity += storm.intensity;
        if (storm.type === 'storm' || storm.type === 'lightning') stormCount++;

        const sx = storm.x * w;
        const sy = storm.y * h;
        const r = storm.radius + storm.intensity * 30;

        for (let ring = 3; ring >= 0; ring--) {
          const ringR = r * (1 + ring * 0.4);
          const alpha = storm.intensity * 0.06 * (1 - ring * 0.2);
          const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, ringR);
          grad.addColorStop(0, storm.color + Math.round(alpha * 255).toString(16).padStart(2, '0'));
          grad.addColorStop(0.7, storm.color + '08');
          grad.addColorStop(1, storm.color + '00');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(sx, sy, ringR, 0, Math.PI * 2);
          ctx.fill();
        }

        if (storm.type === 'lightning' && frame % 60 < 3 && storm.intensity > 0.5) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 15;
          ctx.beginPath();
          let lx = sx;
          let ly = sy - r * 0.8;
          ctx.moveTo(lx, ly);
          for (let j = 0; j < 5; j++) {
            lx += (Math.random() - 0.5) * 20;
            ly += r * 0.3;
            ctx.lineTo(lx, ly);
          }
          ctx.stroke();
          ctx.shadowBlur = 0;
        }

        if (storm.type === 'rain' || storm.type === 'storm') {
          for (let i = 0; i < Math.floor(storm.intensity * 3); i++) {
            storm.particles.push({
              x: sx + (Math.random() - 0.5) * r * 2,
              y: sy - r + Math.random() * r * 0.5,
              vx: (Math.random() - 0.5) * 0.5,
              vy: 1 + Math.random() * 2,
              life: 0,
              maxLife: 30 + Math.random() * 20,
            });
          }
        }

        storm.particles = storm.particles.filter(p => {
          p.x += p.vx;
          p.y += p.vy;
          p.life++;
          if (p.life >= p.maxLife) return false;
          const alpha = 1 - p.life / p.maxLife;
          ctx.fillStyle = storm.color;
          ctx.globalAlpha = alpha * 0.4;
          ctx.fillRect(p.x, p.y, 1, 3);
          ctx.globalAlpha = 1;
          return true;
        });

        ctx.fillStyle = storm.color + '90';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(storm.label, sx, sy + r + 16);

        const icon = storm.type === 'storm' ? 'S' : storm.type === 'lightning' ? 'L' : storm.type === 'rain' ? 'R' : 'C';
        ctx.fillStyle = storm.color;
        ctx.font = 'bold 11px monospace';
        ctx.fillText(icon, sx, sy - r - 6);
      }

      const avgIntensity = totalIntensity / stormsRef.current.length;
      const sev = Math.round(avgIntensity * 100);
      setSeverity(sev);
      if (stormCount > 4) setForecast('Severe Storms');
      else if (stormCount > 2) setForecast('Thunderstorms');
      else if (avgIntensity > 0.5) setForecast('Heavy Rain');
      else if (avgIntensity > 0.3) setForecast('Partly Cloudy');
      else setForecast('Clear Skies');

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const getForecastIcon = () => {
    if (forecast.includes('Severe')) return <CloudLightning className="w-4 h-4 text-red-400" />;
    if (forecast.includes('Thunder')) return <CloudLightning className="w-4 h-4 text-orange-400" />;
    if (forecast.includes('Rain')) return <CloudRain className="w-4 h-4 text-yellow-400" />;
    if (forecast.includes('Cloudy')) return <Cloud className="w-4 h-4 text-slate-400" />;
    return <Sun className="w-4 h-4 text-cyan-400" />;
  };

  const sevColor = severity > 60 ? 'text-red-400' : severity > 35 ? 'text-yellow-400' : 'text-cyan-400';

  return (
    <div className="relative w-full h-full bg-[#050a14] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-slate-700/30">
          <Wind className="w-3 h-3 text-cyan-400" />
          <span className="text-slate-300 text-xs font-mono font-bold tracking-wider">THREAT WEATHER</span>
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-black/60 rounded border border-slate-700/30">
          {getForecastIcon()}
          <span className="text-slate-300 text-[10px] font-mono">{forecast}</span>
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded border border-slate-700/30">
          <span className="text-slate-500 text-[10px] font-mono">THREAT INDEX</span>
          <span className={`text-lg font-mono font-bold ${sevColor}`}>{severity}</span>
        </div>
      </div>
      <canvas ref={canvasRef} className="w-full h-full" />
      <div className="absolute bottom-3 left-4 z-10 flex gap-3">
        {[
          { icon: <CloudLightning className="w-3 h-3" />, label: 'Storm', color: 'text-red-400' },
          { icon: <CloudRain className="w-3 h-3" />, label: 'Rain', color: 'text-yellow-400' },
          { icon: <Cloud className="w-3 h-3" />, label: 'Cloudy', color: 'text-slate-400' },
          { icon: <Sun className="w-3 h-3" />, label: 'Clear', color: 'text-cyan-400' },
        ].map(item => (
          <div key={item.label} className={`flex items-center gap-1 ${item.color}`}>
            {item.icon}
            <span className="text-[9px] font-mono">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ThreatWeatherMap;
