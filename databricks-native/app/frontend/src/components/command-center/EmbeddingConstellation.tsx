import { useEffect, useRef, useState } from 'react';
import { Brain } from 'lucide-react';

interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  brightness: number;
  label: string;
  category: string;
  connections: string[];
  spawnTime: number;
  pulsePhase: number;
  color: string;
}

const CATEGORIES: Record<string, string> = {
  'Lateral Movement': '#ef4444',
  'Data Exfiltration': '#f97316',
  'Credential Theft': '#eab308',
  'C2 Communication': '#22d3ee',
  'Persistence': '#10b981',
  'Privilege Escalation': '#3b82f6',
  'Reconnaissance': '#8b5cf6',
  'Ransomware': '#ec4899',
};

const PATTERN_LABELS = [
  'kerberoast_spike', 'dns_tunnel_entropy', 'smb_lateral_hop', 'psexec_chain',
  'mimikatz_signature', 'cobalt_beacon_jitter', 'dga_domain_cluster', 'exfil_bursts',
  'rdp_brute_cascade', 'ntlm_relay_pattern', 'golden_ticket_forge', 'dcsync_attempt',
  'wmi_persistence_key', 'scheduled_task_drop', 'registry_run_key', 'dll_sideload',
  'process_hollow_sig', 'reflective_load', 'amsi_bypass_pattern', 'etw_tamper_sig',
  'token_impersonation', 'named_pipe_pivot', 'zerologon_pattern', 'printnightmare',
  'log4shell_payload', 'spring4shell_sig', 'sql_union_chain', 'xss_dom_mutation',
  'ssrf_redirect_chain', 'deserialization_rce', 'jwt_forge_pattern', 'oauth_abuse_flow',
];

const EmbeddingConstellation = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const [timelinePos, setTimelinePos] = useState(0.7);
  const [stats, setStats] = useState({ patterns: 0, connections: 0, clusters: 0 });
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const timeRef = useRef(0);

  useEffect(() => {
    const categories = Object.keys(CATEGORIES);
    for (let i = 0; i < 45; i++) {
      const cat = categories[Math.floor(Math.random() * categories.length)];
      const clusterX = 0.15 + (categories.indexOf(cat) % 4) * 0.2 + (Math.random() - 0.5) * 0.12;
      const clusterY = 0.2 + Math.floor(categories.indexOf(cat) / 4) * 0.35 + (Math.random() - 0.5) * 0.15;
      starsRef.current.push({
        id: `s-${i}`,
        x: Math.max(0.05, Math.min(0.95, clusterX)),
        y: Math.max(0.08, Math.min(0.92, clusterY)),
        size: 1.5 + Math.random() * 3,
        brightness: 0.4 + Math.random() * 0.6,
        label: PATTERN_LABELS[i % PATTERN_LABELS.length],
        category: cat,
        connections: [],
        spawnTime: Math.random() * 0.7,
        pulsePhase: Math.random() * Math.PI * 2,
        color: CATEGORIES[cat],
      });
    }

    const stars = starsRef.current;
    for (const star of stars) {
      const nearby = stars
        .filter(s => s.id !== star.id && s.category === star.category)
        .sort((a, b) => {
          const da = Math.hypot(a.x - star.x, a.y - star.y);
          const db = Math.hypot(b.x - star.x, b.y - star.y);
          return da - db;
        })
        .slice(0, 2);
      star.connections = nearby.map(s => s.id);
    }

    for (let i = 0; i < 8; i++) {
      const a = stars[Math.floor(Math.random() * stars.length)];
      const b = stars.filter(s => s.category !== a.category)[Math.floor(Math.random() * 10)];
      if (b && !a.connections.includes(b.id)) {
        a.connections.push(b.id);
      }
    }
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
      const h = rect.height - 50;

      ctx.clearRect(0, 0, rect.width, rect.height);

      timeRef.current += 0.001;
      const now = Date.now();

      const visibleStars = starsRef.current.filter(s => s.spawnTime <= timelinePos);
      let connectionCount = 0;

      for (const star of visibleStars) {
        if (activeCategory && star.category !== activeCategory) continue;
        for (const connId of star.connections) {
          const target = starsRef.current.find(s => s.id === connId);
          if (!target || target.spawnTime > timelinePos) continue;
          if (activeCategory && target.category !== activeCategory) continue;

          const sx = star.x * w;
          const sy = star.y * h;
          const tx = target.x * w;
          const ty = target.y * h;

          const isCrossCategory = star.category !== target.category;
          ctx.strokeStyle = isCrossCategory
            ? 'rgba(148, 163, 184, 0.08)'
            : star.color + '18';
          ctx.lineWidth = isCrossCategory ? 0.5 : 0.8;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          connectionCount++;

          if (Math.random() < 0.01) {
            const t = Math.random();
            const px = sx + (tx - sx) * t;
            const py = sy + (ty - sy) * t;
            ctx.fillStyle = star.color;
            ctx.globalAlpha = 0.6;
            ctx.beginPath();
            ctx.arc(px, py, 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
        }
      }

      for (const star of visibleStars) {
        if (activeCategory && star.category !== activeCategory) continue;

        const sx = star.x * w;
        const sy = star.y * h;
        const pulse = Math.sin(now * 0.003 + star.pulsePhase) * 0.3 + 0.7;
        const size = star.size * pulse;

        ctx.globalAlpha = 0.15 * star.brightness;
        ctx.fillStyle = star.color;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.4 * star.brightness;
        ctx.beginPath();
        ctx.arc(sx, sy, size * 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = star.brightness;
        ctx.shadowColor = star.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(sx, sy, size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        const isRecent = star.spawnTime > timelinePos - 0.1;
        if (isRecent) {
          ctx.strokeStyle = star.color + '40';
          ctx.lineWidth = 0.5;
          const ringSize = size * 3 + Math.sin(now * 0.005) * 3;
          ctx.beginPath();
          ctx.arc(sx, sy, ringSize, 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      const clusterCounts: Record<string, number> = {};
      for (const s of visibleStars) {
        clusterCounts[s.category] = (clusterCounts[s.category] || 0) + 1;
      }

      setStats({
        patterns: visibleStars.length,
        connections: connectionCount,
        clusters: Object.keys(clusterCounts).filter(k => clusterCounts[k] > 2).length,
      });

      const tlY = h + 25;
      ctx.fillStyle = 'rgba(30, 41, 59, 0.5)';
      ctx.fillRect(40, tlY - 2, w - 80, 4);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(40, tlY - 2, (w - 80) * timelinePos, 4);
      ctx.beginPath();
      ctx.arc(40 + (w - 80) * timelinePos, tlY, 6, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.fill();
      ctx.strokeStyle = '#0e7490';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('30 DAYS AGO', 40, tlY + 16);
      ctx.textAlign = 'right';
      ctx.fillText('NOW', w - 40, tlY + 16);
      ctx.textAlign = 'center';
      ctx.fillText(`DAY ${Math.round(timelinePos * 30)}`, 40 + (w - 80) * timelinePos, tlY + 16);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [timelinePos, activeCategory]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const parentRect = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!parentRect) return;
    const w = parentRect.width;
    const h = parentRect.height - 50;
    const y = e.clientY - rect.top;
    if (y > h) {
      const x = e.clientX - rect.left;
      const pos = Math.max(0, Math.min(1, (x - 40) / (w - 80)));
      setTimelinePos(pos);
    }
  };

  return (
    <div className="relative w-full h-full bg-[#04060c] rounded-xl overflow-hidden border border-slate-800/50">
      <div className="absolute top-3 left-4 z-10 flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-slate-700/30">
          <Brain className="w-3 h-3 text-blue-400" />
          <span className="text-slate-300 text-xs font-mono font-bold tracking-wider">EMBEDDING CONSTELLATION</span>
        </div>
      </div>
      <div className="absolute top-3 right-4 z-10 flex gap-2">
        <div className="px-2 py-1 bg-black/60 rounded border border-blue-500/30">
          <span className="text-blue-400 text-[10px] font-mono">PATTERNS: {stats.patterns}</span>
        </div>
        <div className="px-2 py-1 bg-black/60 rounded border border-cyan-500/30">
          <span className="text-cyan-400 text-[10px] font-mono">LINKS: {stats.connections}</span>
        </div>
        <div className="px-2 py-1 bg-black/60 rounded border border-emerald-500/30">
          <span className="text-emerald-400 text-[10px] font-mono">CLUSTERS: {stats.clusters}</span>
        </div>
      </div>

      <div className="absolute top-12 left-4 z-10 flex flex-wrap gap-1.5 max-w-[300px]">
        {Object.entries(CATEGORIES).map(([cat, color]) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-mono border transition-all ${
              activeCategory === cat
                ? 'border-white/30 bg-white/10'
                : activeCategory === null
                ? 'border-slate-700/30 bg-black/40 hover:bg-black/60'
                : 'border-slate-800/20 bg-black/20 opacity-30'
            }`}
          >
            <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            <span style={{ color: color + 'cc' }}>{cat}</span>
          </button>
        ))}
      </div>

      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-pointer"
        onClick={handleTimelineClick}
      />
    </div>
  );
};

export default EmbeddingConstellation;
