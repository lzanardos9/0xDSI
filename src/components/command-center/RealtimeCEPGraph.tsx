import { useEffect, useRef, useState } from 'react';
import { Activity, Zap, Play, Pause } from 'lucide-react';

interface CEPNode {
  id: string;
  label: string;
  type: 'event' | 'pattern' | 'alert' | 'source' | 'correlation';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  born: number;
  ttl: number;
}

interface CEPEdge {
  from: string;
  to: string;
  weight: number;
  color: string;
  born: number;
}

const EVENT_TYPES = [
  { label: 'AUTH_FAIL', type: 'event' as const, color: '#ef4444' },
  { label: 'DNS_QUERY', type: 'event' as const, color: '#22d3ee' },
  { label: 'FILE_MOD', type: 'event' as const, color: '#f97316' },
  { label: 'NET_CONN', type: 'event' as const, color: '#22d3ee' },
  { label: 'PROC_EXEC', type: 'event' as const, color: '#eab308' },
  { label: 'REG_WRITE', type: 'event' as const, color: '#a855f7' },
  { label: 'SMB_SHARE', type: 'event' as const, color: '#f97316' },
  { label: 'KERBEROS', type: 'event' as const, color: '#ef4444' },
];

const PATTERN_TYPES = [
  { label: 'Lateral Move', type: 'pattern' as const, color: '#ef4444' },
  { label: 'C2 Beacon', type: 'pattern' as const, color: '#f97316' },
  { label: 'Cred Dump', type: 'pattern' as const, color: '#ef4444' },
  { label: 'Data Exfil', type: 'pattern' as const, color: '#eab308' },
  { label: 'Recon Scan', type: 'pattern' as const, color: '#22d3ee' },
];

const SOURCES = [
  { label: 'EDR', type: 'source' as const, color: '#10b981' },
  { label: 'NDR', type: 'source' as const, color: '#10b981' },
  { label: 'SIEM', type: 'source' as const, color: '#10b981' },
  { label: 'FW', type: 'source' as const, color: '#10b981' },
];

const RealtimeCEPGraph = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const nodesRef = useRef<CEPNode[]>([]);
  const edgesRef = useRef<CEPEdge[]>([]);
  const [streaming, setStreaming] = useState(true);
  const [eventsPerSec, setEventsPerSec] = useState(0);
  const [patternsDetected, setPatternsDetected] = useState(0);
  const [correlations, setCorrelations] = useState(0);
  const [streamLog, setStreamLog] = useState<string[]>([]);
  const eventCountRef = useRef(0);
  const patternCountRef = useRef(0);
  const corrCountRef = useRef(0);
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;

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

    SOURCES.forEach((s, i) => {
      nodesRef.current.push({
        id: `src-${i}`,
        label: s.label,
        type: s.type,
        x: 60 + i * 70,
        y: 30,
        vx: 0,
        vy: 0,
        radius: 14,
        color: s.color,
        born: Date.now(),
        ttl: Infinity,
      });
    });

    let lastSpawn = Date.now();
    let lastPatternCheck = Date.now();
    let eps = 0;

    const spawnEvent = (now: number, w: number, h: number) => {
      const et = EVENT_TYPES[Math.floor(Math.random() * EVENT_TYPES.length)];
      const sourceNode = nodesRef.current.filter(n => n.type === 'source')[Math.floor(Math.random() * SOURCES.length)];
      const id = `evt-${now}-${Math.random().toString(36).slice(2, 6)}`;
      const node: CEPNode = {
        id,
        label: et.label,
        type: et.type,
        x: sourceNode ? sourceNode.x + (Math.random() - 0.5) * 40 : Math.random() * w,
        y: 60 + Math.random() * 30,
        vx: (Math.random() - 0.5) * 0.5,
        vy: 0.3 + Math.random() * 0.5,
        radius: 5,
        color: et.color,
        born: now,
        ttl: 8000,
      };
      nodesRef.current.push(node);
      if (sourceNode) {
        edgesRef.current.push({ from: sourceNode.id, to: id, weight: 0.5, color: et.color + '40', born: now });
      }
      eventCountRef.current++;
      eps++;
    };

    const checkPatterns = (now: number, w: number, h: number) => {
      const events = nodesRef.current.filter(n => n.type === 'event' && now - n.born < 5000);
      if (events.length < 3) return;

      if (Math.random() < 0.3) {
        const pt = PATTERN_TYPES[Math.floor(Math.random() * PATTERN_TYPES.length)];
        const connected = events.slice(0, 2 + Math.floor(Math.random() * 3));
        const cx = connected.reduce((s, n) => s + n.x, 0) / connected.length;
        const cy = Math.min(connected.reduce((s, n) => s + n.y, 0) / connected.length + 40, h - 60);

        const patternId = `pat-${now}-${Math.random().toString(36).slice(2, 5)}`;
        nodesRef.current.push({
          id: patternId,
          label: pt.label,
          type: pt.type,
          x: cx + (Math.random() - 0.5) * 60,
          y: cy,
          vx: (Math.random() - 0.5) * 0.2,
          vy: 0.1,
          radius: 8,
          color: pt.color,
          born: now,
          ttl: 10000,
        });

        connected.forEach(e => {
          edgesRef.current.push({ from: e.id, to: patternId, weight: 1, color: pt.color + '50', born: now });
        });

        patternCountRef.current++;
        setPatternsDetected(patternCountRef.current);

        const logMsg = `[${new Date(now).toLocaleTimeString()}] CEP: ${pt.label} pattern detected (${connected.length} events correlated)`;
        setStreamLog(prev => [logMsg, ...prev].slice(0, 8));

        if (Math.random() < 0.4) {
          const corrId = `corr-${now}`;
          nodesRef.current.push({
            id: corrId,
            label: 'ALERT',
            type: 'alert',
            x: cx + (Math.random() - 0.5) * 30,
            y: cy + 30 + Math.random() * 20,
            vx: 0,
            vy: 0.05,
            radius: 10,
            color: '#ef4444',
            born: now,
            ttl: 12000,
          });
          edgesRef.current.push({ from: patternId, to: corrId, weight: 2, color: '#ef444480', born: now });
          corrCountRef.current++;
          setCorrelations(corrCountRef.current);
        }
      }
    };

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();

      if (streamingRef.current) {
        if (now - lastSpawn > 200 + Math.random() * 300) {
          spawnEvent(now, w, h);
          lastSpawn = now;
        }
        if (now - lastPatternCheck > 1500 + Math.random() * 2000) {
          checkPatterns(now, w, h);
          lastPatternCheck = now;
        }
      }

      nodesRef.current = nodesRef.current.filter(n => {
        if (n.ttl === Infinity) return true;
        return now - n.born < n.ttl;
      });
      edgesRef.current = edgesRef.current.filter(e => {
        return nodesRef.current.some(n => n.id === e.from) && nodesRef.current.some(n => n.id === e.to);
      });

      for (const node of nodesRef.current) {
        if (node.type === 'source') continue;
        node.x += node.vx;
        node.y += node.vy;
        node.vx *= 0.98;
        node.vy *= 0.98;
        if (node.x < 10) { node.x = 10; node.vx *= -0.5; }
        if (node.x > w - 10) { node.x = w - 10; node.vx *= -0.5; }
        if (node.y < 10) node.y = 10;
        if (node.y > h - 10) { node.y = h - 10; node.vy *= -0.3; }
      }

      for (let i = 0; i < nodesRef.current.length; i++) {
        for (let j = i + 1; j < nodesRef.current.length; j++) {
          const a = nodesRef.current[i];
          const b = nodesRef.current[j];
          if (a.type === 'source' || b.type === 'source') continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist < 30) {
            const force = (30 - dist) * 0.02;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
      }

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#050810';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.03)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }

      for (const edge of edgesRef.current) {
        const fromNode = nodesRef.current.find(n => n.id === edge.from);
        const toNode = nodesRef.current.find(n => n.id === edge.to);
        if (!fromNode || !toNode) continue;

        const age = now - edge.born;
        const alpha = Math.max(0, 1 - age / 8000);

        ctx.strokeStyle = edge.color.slice(0, 7) + Math.round(alpha * 80).toString(16).padStart(2, '0');
        ctx.lineWidth = edge.weight;
        ctx.beginPath();
        ctx.moveTo(fromNode.x, fromNode.y);
        ctx.lineTo(toNode.x, toNode.y);
        ctx.stroke();

        if (age < 500) {
          const progress = age / 500;
          const px = fromNode.x + (toNode.x - fromNode.x) * progress;
          const py = fromNode.y + (toNode.y - fromNode.y) * progress;
          ctx.fillStyle = edge.color.slice(0, 7) + 'cc';
          ctx.beginPath();
          ctx.arc(px, py, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (const node of nodesRef.current) {
        const age = now - node.born;
        const lifeRatio = node.ttl === Infinity ? 1 : Math.max(0, 1 - age / node.ttl);
        const pulse = node.type === 'alert' ? 0.7 + Math.sin(now * 0.008) * 0.3 : 1;

        ctx.globalAlpha = lifeRatio * pulse;

        if (node.type === 'alert') {
          ctx.shadowColor = '#ef4444';
          ctx.shadowBlur = 12;
        } else if (node.type === 'pattern') {
          ctx.shadowColor = node.color;
          ctx.shadowBlur = 6;
        }

        ctx.fillStyle = node.color + (node.type === 'source' ? '40' : '30');
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = node.color;
        ctx.lineWidth = node.type === 'alert' ? 2 : node.type === 'pattern' ? 1.5 : 1;
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
        ctx.stroke();

        if (node.type === 'alert' && age < 2000) {
          const ringAlpha = 1 - age / 2000;
          ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha * 0.4})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.radius + age * 0.015, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.shadowBlur = 0;

        if (node.radius >= 8 || node.type === 'source') {
          ctx.fillStyle = node.color;
          ctx.font = `bold ${node.type === 'source' ? 8 : 7}px monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(node.label, node.x, node.y);
        } else {
          ctx.fillStyle = node.color + '80';
          ctx.font = 'bold 6px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(node.label, node.x, node.y - node.radius - 4);
        }

        ctx.globalAlpha = 1;
      }

      animRef.current = requestAnimationFrame(animate);
    };

    const epsInterval = setInterval(() => {
      setEventsPerSec(eps);
      eps = 0;
    }, 1000);

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
      clearInterval(epsInterval);
    };
  }, []);

  return (
    <div className="relative w-full h-full bg-[#050810] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-cyan-500/20">
          <Activity className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-400 text-xs font-mono font-bold tracking-wider">REALTIME GRAPH ANALYSIS</span>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 bg-black/60 rounded border border-slate-700/30">
          <Zap className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400 text-[10px] font-mono">CEP ENGINE</span>
        </div>
      </div>

      <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
        <div className="flex items-center gap-3 px-3 py-1.5 bg-black/60 rounded border border-slate-700/30 text-[10px] font-mono">
          <span className="text-slate-500">EPS</span>
          <span className="text-cyan-400 font-bold">{eventsPerSec}</span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-500">PATTERNS</span>
          <span className="text-orange-400 font-bold">{patternsDetected}</span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-500">ALERTS</span>
          <span className="text-red-400 font-bold">{correlations}</span>
        </div>
        <button
          onClick={() => setStreaming(!streaming)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded border text-[10px] font-mono font-bold transition-all ${
            streaming
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
          }`}
        >
          {streaming ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
          {streaming ? 'LIVE' : 'PAUSED'}
        </button>
      </div>

      <canvas ref={canvasRef} className="w-full h-full" />

      <div className="absolute bottom-3 left-4 right-4 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 px-3 py-1.5 bg-black/70 rounded border border-slate-800/40">
            {[
              { label: 'Source', color: '#10b981' },
              { label: 'Event', color: '#22d3ee' },
              { label: 'Pattern', color: '#f97316' },
              { label: 'Alert', color: '#ef4444' },
            ].map(item => (
              <div key={item.label} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                <span className="text-[9px] font-mono text-slate-500">{item.label}</span>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-black/70 rounded border border-slate-800/40 px-3 py-1.5 max-h-[50px] overflow-hidden">
            {streamLog.slice(0, 2).map((log, i) => (
              <div key={i} className="text-[9px] font-mono text-slate-500 truncate leading-tight">{log}</div>
            ))}
            {streamLog.length === 0 && (
              <div className="text-[9px] font-mono text-slate-600">Waiting for stream data...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealtimeCEPGraph;
