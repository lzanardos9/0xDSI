import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Shield, Radio, Siren } from 'lucide-react';

type DefconLevel = 1 | 2 | 3 | 4 | 5;

interface ThreatEvent {
  id: string;
  time: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
}

const DEFCON_CONFIG: Record<DefconLevel, {
  label: string;
  subtitle: string;
  color: string;
  bgFrom: string;
  bgTo: string;
  borderColor: string;
  pulseColor: string;
  glowColor: string;
}> = {
  1: {
    label: 'DEFCON 1',
    subtitle: 'MAXIMUM FORCE READINESS',
    color: '#ef4444',
    bgFrom: 'from-red-950/80',
    bgTo: 'to-red-900/40',
    borderColor: 'border-red-500/60',
    pulseColor: 'bg-red-500',
    glowColor: 'shadow-red-500/40',
  },
  2: {
    label: 'DEFCON 2',
    subtitle: 'ARMED FORCES READY TO DEPLOY',
    color: '#f97316',
    bgFrom: 'from-orange-950/70',
    bgTo: 'to-orange-900/30',
    borderColor: 'border-orange-500/50',
    pulseColor: 'bg-orange-500',
    glowColor: 'shadow-orange-500/30',
  },
  3: {
    label: 'DEFCON 3',
    subtitle: 'INCREASE IN FORCE READINESS',
    color: '#eab308',
    bgFrom: 'from-yellow-950/60',
    bgTo: 'to-yellow-900/20',
    borderColor: 'border-yellow-500/40',
    pulseColor: 'bg-yellow-500',
    glowColor: 'shadow-yellow-500/20',
  },
  4: {
    label: 'DEFCON 4',
    subtitle: 'INCREASED INTELLIGENCE WATCH',
    color: '#3b82f6',
    bgFrom: 'from-blue-950/50',
    bgTo: 'to-blue-900/20',
    borderColor: 'border-blue-500/30',
    pulseColor: 'bg-blue-500',
    glowColor: 'shadow-blue-500/15',
  },
  5: {
    label: 'DEFCON 5',
    subtitle: 'LOWEST STATE OF READINESS',
    color: '#22d3ee',
    bgFrom: 'from-cyan-950/40',
    bgTo: 'to-cyan-900/10',
    borderColor: 'border-cyan-500/20',
    pulseColor: 'bg-cyan-500',
    glowColor: 'shadow-cyan-500/10',
  },
};

const DefconAlert = () => {
  const [level, setLevel] = useState<DefconLevel>(3);
  const [transitioning, setTransitioning] = useState(false);
  const [events, setEvents] = useState<ThreatEvent[]>([]);
  const [tickerOffset, setTickerOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const flashRef = useRef(0);

  useEffect(() => {
    const initialEvents: ThreatEvent[] = [
      { id: '1', time: '14:32:47', message: 'APT-29 C2 beacon detected on DC-CORE-01', severity: 'critical' },
      { id: '2', time: '14:31:12', message: 'Lateral movement via PsExec across 3 hosts', severity: 'critical' },
      { id: '3', time: '14:29:55', message: 'Credential dump attempt blocked on AD controller', severity: 'high' },
      { id: '4', time: '14:28:03', message: 'Suspicious DNS tunneling to known C2 domain', severity: 'high' },
      { id: '5', time: '14:26:41', message: 'Anomalous data transfer spike: 2.4GB outbound', severity: 'medium' },
    ];
    setEvents(initialEvents);

    const eventInterval = setInterval(() => {
      const newMessages = [
        'Kerberoasting attempt detected against SVC accounts',
        'Golden Ticket forgery signature in Kerberos traffic',
        'DCSync replication request from unauthorized host',
        'AMSI bypass detected in PowerShell session',
        'Reflective DLL injection in lsass.exe',
        'WMI persistence mechanism installed',
        'Scheduled task created with encoded payload',
        'Registry run key modified for persistence',
        'NTLM relay attack in progress on segment 10.0.2.x',
        'Cobalt Strike Malleable C2 profile detected',
        'DGA domain resolution cluster identified',
        'Process hollowing detected in svchost.exe',
      ];
      const severities: ThreatEvent['severity'][] = ['critical', 'high', 'medium'];
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
      setEvents(prev => [{
        id: Math.random().toString(36).substr(2, 9),
        time,
        message: newMessages[Math.floor(Math.random() * newMessages.length)],
        severity: severities[Math.floor(Math.random() * severities.length)],
      }, ...prev].slice(0, 8));
    }, 4000);

    const levelInterval = setInterval(() => {
      setLevel(prev => {
        const delta = Math.random() > 0.6 ? -1 : Math.random() > 0.3 ? 1 : 0;
        const next = Math.max(1, Math.min(5, prev + delta)) as DefconLevel;
        if (next !== prev) setTransitioning(true);
        return next;
      });
    }, 8000);

    return () => {
      clearInterval(eventInterval);
      clearInterval(levelInterval);
    };
  }, []);

  useEffect(() => {
    if (transitioning) {
      const t = setTimeout(() => setTransitioning(false), 1500);
      return () => clearTimeout(t);
    }
  }, [transitioning]);

  useEffect(() => {
    const tickerInterval = setInterval(() => {
      setTickerOffset(prev => prev + 1);
    }, 50);
    return () => clearInterval(tickerInterval);
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

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const config = DEFCON_CONFIG[level];
      const now = Date.now();

      ctx.clearRect(0, 0, w, h);

      flashRef.current += 0.02;
      if (level <= 2) {
        const flashAlpha = (Math.sin(flashRef.current * 3) * 0.5 + 0.5) * (level === 1 ? 0.08 : 0.04);
        ctx.fillStyle = config.color + Math.round(flashAlpha * 255).toString(16).padStart(2, '0');
        ctx.fillRect(0, 0, w, h);
      }

      const segmentW = w / 5;
      for (let i = 0; i < 5; i++) {
        const defconNum = (5 - i) as DefconLevel;
        const isActive = defconNum === level;
        const isPassed = defconNum > level;
        const segConfig = DEFCON_CONFIG[defconNum];

        const x = i * segmentW;
        const pad = 2;

        if (isActive) {
          const pulse = Math.sin(now * 0.004) * 0.15 + 0.85;
          ctx.fillStyle = segConfig.color + Math.round(pulse * 0.4 * 255).toString(16).padStart(2, '0');
          ctx.fillRect(x + pad, pad, segmentW - pad * 2, h - pad * 2);

          ctx.strokeStyle = segConfig.color + '80';
          ctx.lineWidth = 2;
          ctx.strokeRect(x + pad, pad, segmentW - pad * 2, h - pad * 2);
        } else if (isPassed) {
          ctx.fillStyle = segConfig.color + '0a';
          ctx.fillRect(x + pad, pad, segmentW - pad * 2, h - pad * 2);
          ctx.strokeStyle = segConfig.color + '20';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(x + pad, pad, segmentW - pad * 2, h - pad * 2);
        } else {
          ctx.fillStyle = segConfig.color + '18';
          ctx.fillRect(x + pad, pad, segmentW - pad * 2, h - pad * 2);
          ctx.strokeStyle = segConfig.color + '30';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + pad, pad, segmentW - pad * 2, h - pad * 2);
        }

        ctx.fillStyle = isActive ? segConfig.color : (isPassed ? segConfig.color + '30' : segConfig.color + '60');
        ctx.font = `bold ${isActive ? 16 : 12}px monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(String(defconNum), x + segmentW / 2, h / 2 + (isActive ? 6 : 4));

        if (isActive) {
          ctx.fillStyle = segConfig.color + '80';
          ctx.font = 'bold 7px monospace';
          ctx.fillText('ACTIVE', x + segmentW / 2, h - 6);
        }
      }

      if (transitioning) {
        const transAlpha = Math.sin(now * 0.015) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255, 255, 255, ${transAlpha * 0.1})`;
        ctx.fillRect(0, 0, w, h);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [level, transitioning]);

  const config = DEFCON_CONFIG[level];

  const tickerText = events.map(e => `[${e.time}] ${e.message}`).join('  ///  ');

  return (
    <div className={`relative w-full rounded-xl overflow-hidden border ${config.borderColor} bg-gradient-to-r ${config.bgFrom} ${config.bgTo} shadow-lg ${config.glowColor}`}>
      {transitioning && (
        <div className="absolute inset-0 z-20 pointer-events-none animate-pulse bg-white/5" />
      )}

      <div className="relative z-10">
        <div className="flex items-stretch">
          <div className="flex-shrink-0 flex flex-col items-center justify-center px-6 py-4 border-r border-white/5">
            <div className="flex items-center gap-2 mb-1">
              {level <= 2 && <Siren className="w-5 h-5 animate-pulse" style={{ color: config.color }} />}
              <span className="text-2xl font-mono font-black tracking-widest" style={{ color: config.color }}>
                {config.label}
              </span>
              {level <= 2 && <Siren className="w-5 h-5 animate-pulse" style={{ color: config.color }} />}
            </div>
            <span className="text-[9px] font-mono tracking-[0.2em] opacity-60" style={{ color: config.color }}>
              {config.subtitle}
            </span>
            <div className="flex items-center gap-1.5 mt-2">
              {[5, 4, 3, 2, 1].map(n => (
                <div
                  key={n}
                  className={`w-2.5 h-2.5 rounded-sm transition-all duration-500 ${
                    n >= level ? '' : 'opacity-20'
                  } ${n === level ? 'animate-pulse scale-125' : ''}`}
                  style={{ backgroundColor: DEFCON_CONFIG[n as DefconLevel].color + (n >= level ? 'ff' : '40') }}
                />
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="relative h-[50px] overflow-hidden">
              <canvas ref={canvasRef} className="w-full h-full" />
            </div>

            <div className="border-t border-white/5 px-3 py-1.5 overflow-hidden">
              <div className="flex items-center gap-2">
                <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30">
                  <Radio className="w-3 h-3 text-red-400 animate-pulse" />
                  <span className="text-red-400 text-[9px] font-mono font-bold">LIVE</span>
                </div>
                <div className="flex-1 overflow-hidden whitespace-nowrap">
                  <div
                    className="inline-block text-[10px] font-mono text-slate-400 transition-none"
                    style={{ transform: `translateX(-${tickerOffset % (tickerText.length * 6)}px)` }}
                  >
                    {tickerText}  ///  {tickerText}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0 flex flex-col justify-center px-5 border-l border-white/5 gap-1.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <span className="text-[10px] font-mono text-slate-400">Active Threats</span>
              <span className="text-sm font-mono font-bold text-red-400">{events.filter(e => e.severity === 'critical').length}</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-[10px] font-mono text-slate-400">Shields Active</span>
              <span className="text-sm font-mono font-bold text-emerald-400">12/12</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DefconAlert;
