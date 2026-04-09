import { useEffect, useRef, useState } from 'react';
import { Fingerprint, MapPin, Shield, Clock, AlertTriangle, Check, Smartphone } from 'lucide-react';

interface SCIFZone {
  id: string;
  name: string;
  location: string;
  classification: string;
  status: 'secure' | 'occupied' | 'alert' | 'maintenance';
  occupancy: number;
  maxOccupancy: number;
  lastSweep: string;
  rfShielding: number;
  tempestRating: string;
}

interface AccessLog {
  timestamp: string;
  person: string;
  zone: string;
  action: 'entry' | 'exit' | 'denied' | 'tailgate_alert';
  method: 'badge+bio' | 'badge+pin' | 'escort' | 'unauthorized';
  deviceCheck: 'clean' | 'device_detected' | 'n/a';
}

const SCIF_ZONES: SCIFZone[] = [
  { id: 'SCIF-A1', name: 'Situation Room Alpha', location: 'Sub-Level 3, Wing A', classification: 'TS/SCI', status: 'occupied', occupancy: 4, maxOccupancy: 12, lastSweep: '14:00 UTC', rfShielding: 99.7, tempestRating: 'Zone A' },
  { id: 'SCIF-B2', name: 'SIGINT Analysis Center', location: 'Sub-Level 2, Wing B', classification: 'TS/SCI', status: 'occupied', occupancy: 7, maxOccupancy: 20, lastSweep: '13:30 UTC', rfShielding: 99.9, tempestRating: 'Zone A' },
  { id: 'SCIF-C1', name: 'HUMINT Briefing Room', location: 'Level 1, Wing C', classification: 'TS/SCI', status: 'secure', occupancy: 0, maxOccupancy: 8, lastSweep: '14:15 UTC', rfShielding: 99.5, tempestRating: 'Zone B' },
  { id: 'SCIF-D3', name: 'Cyber Operations Vault', location: 'Sub-Level 4, Wing D', classification: 'TS/SCI', status: 'occupied', occupancy: 3, maxOccupancy: 6, lastSweep: '12:00 UTC', rfShielding: 99.8, tempestRating: 'Zone A' },
  { id: 'SCIF-E1', name: 'Executive Brief Room', location: 'Level 2, Executive Wing', classification: 'TOP SECRET', status: 'secure', occupancy: 0, maxOccupancy: 16, lastSweep: '14:30 UTC', rfShielding: 98.2, tempestRating: 'Zone B' },
  { id: 'SCIF-F2', name: 'Counter-Intel Vault', location: 'Sub-Level 5, Wing F', classification: 'TS/SCI', status: 'alert', occupancy: 1, maxOccupancy: 4, lastSweep: '11:00 UTC', rfShielding: 99.9, tempestRating: 'Zone A' },
];

const ACCESS_LOG: AccessLog[] = [
  { timestamp: '14:47:33', person: 'ADM. Richardson', zone: 'SCIF-A1', action: 'entry', method: 'badge+bio', deviceCheck: 'clean' },
  { timestamp: '14:45:11', person: 'COL. Chen', zone: 'SCIF-D3', action: 'entry', method: 'badge+bio', deviceCheck: 'clean' },
  { timestamp: '14:42:08', person: 'UNKNOWN', zone: 'SCIF-F2', action: 'tailgate_alert', method: 'unauthorized', deviceCheck: 'n/a' },
  { timestamp: '14:38:55', person: 'Mr. Volkov', zone: 'SCIF-B2', action: 'denied', method: 'badge+pin', deviceCheck: 'device_detected' },
  { timestamp: '14:35:22', person: 'LCDR. Petrov', zone: 'SCIF-B2', action: 'exit', method: 'badge+bio', deviceCheck: 'clean' },
  { timestamp: '14:30:44', person: 'Dr. Nakamura', zone: 'SCIF-A1', action: 'entry', method: 'badge+bio', deviceCheck: 'clean' },
  { timestamp: '14:28:19', person: 'SAC Williams', zone: 'SCIF-C1', action: 'exit', method: 'badge+bio', deviceCheck: 'clean' },
  { timestamp: '14:22:03', person: 'Agt. Park', zone: 'SCIF-C1', action: 'entry', method: 'escort', deviceCheck: 'clean' },
  { timestamp: '14:15:41', person: 'SSA. Murphy', zone: 'SCIF-D3', action: 'denied', method: 'badge+pin', deviceCheck: 'n/a' },
  { timestamp: '14:10:09', person: 'CAPT. Zhang', zone: 'SCIF-B2', action: 'entry', method: 'badge+bio', deviceCheck: 'clean' },
];

const statusColor = (s: string) => {
  switch (s) {
    case 'secure': return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' };
    case 'occupied': return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', dot: 'bg-cyan-500' };
    case 'alert': return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-500 animate-pulse' };
    case 'maintenance': return { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-500' };
    default: return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20', dot: 'bg-slate-500' };
  }
};

const SCIFAccessControl = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [selectedZone, setSelectedZone] = useState<SCIFZone | null>(null);

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

    const zones = SCIF_ZONES.map((z, i) => ({
      ...z,
      cx: 0,
      cy: 0,
      w: 0,
      h: 0,
      col: i % 3,
      row: Math.floor(i / 3),
    }));

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#060a14';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(16, 185, 129, 0.03)';
      ctx.lineWidth = 0.5;
      for (let x = 0; x < w; x += 25) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
      for (let y = 0; y < h; y += 25) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

      const padding = 20;
      const gap = 12;
      const cols = 3;
      const rows = 2;
      const cellW = (w - padding * 2 - gap * (cols - 1)) / cols;
      const cellH = (h - padding * 2 - gap * (rows - 1) - 30) / rows;

      ctx.fillStyle = '#10b98130';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('FACILITY FLOOR PLAN - SCIF ZONES', w / 2, 18);

      for (const zone of zones) {
        const x = padding + zone.col * (cellW + gap);
        const y = 30 + padding + zone.row * (cellH + gap);
        zone.cx = x + cellW / 2;
        zone.cy = y + cellH / 2;
        zone.w = cellW;
        zone.h = cellH;

        const isAlert = zone.status === 'alert';
        const isOccupied = zone.status === 'occupied';
        const pulse = isAlert ? 0.4 + Math.sin(now * 0.005) * 0.2 : 0;

        ctx.fillStyle = isAlert ? `rgba(239, 68, 68, ${0.05 + pulse})` : isOccupied ? 'rgba(34, 211, 238, 0.04)' : 'rgba(16, 185, 129, 0.03)';
        ctx.fillRect(x, y, cellW, cellH);

        ctx.strokeStyle = isAlert ? `rgba(239, 68, 68, ${0.3 + pulse})` : isOccupied ? 'rgba(34, 211, 238, 0.15)' : 'rgba(16, 185, 129, 0.1)';
        ctx.lineWidth = isAlert ? 2 : 1;
        ctx.strokeRect(x, y, cellW, cellH);

        ctx.fillStyle = isAlert ? '#ef4444' : isOccupied ? '#22d3ee' : '#10b981';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(zone.id, zone.cx, y + 18);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '8px monospace';
        ctx.fillText(zone.name, zone.cx, y + 32);

        const occRatio = zone.occupancy / zone.maxOccupancy;
        const barW = cellW * 0.6;
        const barH = 4;
        const barX = zone.cx - barW / 2;
        const barY = y + cellH - 20;

        ctx.fillStyle = 'rgba(100, 116, 139, 0.2)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = occRatio > 0.8 ? '#ef4444' : occRatio > 0.5 ? '#eab308' : '#10b981';
        ctx.fillRect(barX, barY, barW * occRatio, barH);

        ctx.fillStyle = '#64748b';
        ctx.font = '7px monospace';
        ctx.fillText(`${zone.occupancy}/${zone.maxOccupancy}`, zone.cx, barY + 12);

        if (isAlert) {
          const ringR = Math.min(cellW, cellH) * 0.3;
          const ringAlpha = 0.1 + Math.sin(now * 0.004) * 0.1;
          ctx.strokeStyle = `rgba(239, 68, 68, ${ringAlpha})`;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.arc(zone.cx, zone.cy, ringR + (now * 0.01 % 20), 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        if (isOccupied) {
          for (let p = 0; p < zone.occupancy; p++) {
            const angle = (p / zone.occupancy) * Math.PI * 2 + now * 0.0003;
            const pr = Math.min(cellW, cellH) * 0.2;
            const px = zone.cx + Math.cos(angle) * pr;
            const py = zone.cy + Math.sin(angle) * pr;
            ctx.fillStyle = '#22d3ee';
            ctx.beginPath();
            ctx.arc(px, py, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="relative h-[320px] rounded-xl overflow-hidden border border-emerald-900/20">
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-lg border border-emerald-500/20">
            <Fingerprint className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400 text-[10px] font-mono font-bold tracking-wider">SCIF ACCESS CONTROL</span>
          </div>
        </div>
        <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
          <div className="px-2 py-1 bg-black/70 rounded border border-red-500/20 text-[9px] font-mono text-red-400 font-bold animate-pulse">
            1 ALERT
          </div>
        </div>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="enterprise-card overflow-hidden">
          <div className="bg-slate-800/20 px-4 py-2 border-b border-slate-800/30 flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">ZONE STATUS</span>
          </div>
          <div className="divide-y divide-slate-800/20 max-h-[300px] overflow-y-auto custom-scrollbar">
            {SCIF_ZONES.map(zone => {
              const sc = statusColor(zone.status);
              return (
                <div
                  key={zone.id}
                  className="px-4 py-2.5 hover:bg-white/2 cursor-pointer transition-colors"
                  onClick={() => setSelectedZone(selectedZone?.id === zone.id ? null : zone)}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${sc.dot}`} />
                    <span className="text-[10px] font-mono text-cyan-400 w-16">{zone.id}</span>
                    <span className="text-xs text-slate-200 flex-1 truncate">{zone.name}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                      {zone.status.toUpperCase()}
                    </span>
                  </div>
                  {selectedZone?.id === zone.id && (
                    <div className="mt-2 ml-5 grid grid-cols-2 gap-2">
                      <div className="bg-slate-900/40 rounded p-1.5 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">RF SHIELDING</div>
                        <div className="text-[10px] font-mono text-emerald-400">{zone.rfShielding}%</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-1.5 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">TEMPEST</div>
                        <div className="text-[10px] font-mono text-cyan-400">{zone.tempestRating}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-1.5 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">LAST SWEEP</div>
                        <div className="text-[10px] font-mono text-slate-300">{zone.lastSweep}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-1.5 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">LOCATION</div>
                        <div className="text-[10px] font-mono text-slate-300">{zone.location}</div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="enterprise-card overflow-hidden">
          <div className="bg-slate-800/20 px-4 py-2 border-b border-slate-800/30 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">ACCESS LOG</span>
          </div>
          <div className="divide-y divide-slate-800/20 max-h-[300px] overflow-y-auto custom-scrollbar">
            {ACCESS_LOG.map((log, i) => {
              const isAlert = log.action === 'denied' || log.action === 'tailgate_alert';
              const isDevice = log.deviceCheck === 'device_detected';
              return (
                <div key={i} className={`px-4 py-2 ${isAlert ? 'bg-red-500/3' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-600 w-16">{log.timestamp}</span>
                    {log.action === 'entry' && <Check className="w-3 h-3 text-emerald-400" />}
                    {log.action === 'exit' && <Shield className="w-3 h-3 text-cyan-400" />}
                    {log.action === 'denied' && <AlertTriangle className="w-3 h-3 text-red-400" />}
                    {log.action === 'tailgate_alert' && <AlertTriangle className="w-3 h-3 text-red-500 animate-pulse" />}
                    <span className={`text-xs ${isAlert ? 'text-red-300' : 'text-slate-200'} w-32 truncate`}>{log.person}</span>
                    <span className="text-[10px] font-mono text-cyan-400/60">{log.zone}</span>
                    <span className={`ml-auto px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border ${
                      log.action === 'entry' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      log.action === 'exit' ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20' :
                      'bg-red-500/10 text-red-400 border-red-500/20'
                    }`}>
                      {log.action.toUpperCase().replace('_', ' ')}
                    </span>
                    {isDevice && <Smartphone className="w-3 h-3 text-red-400" />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SCIFAccessControl;
