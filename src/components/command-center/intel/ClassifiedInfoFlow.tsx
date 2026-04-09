import { useEffect, useRef, useState } from 'react';
import { Lock, ArrowDown, Shield } from 'lucide-react';

interface ClassifiedDoc {
  id: string;
  title: string;
  classification: 'TOP SECRET' | 'SECRET' | 'CONFIDENTIAL' | 'UNCLASSIFIED';
  codeword: string;
  compartment: string;
  originator: string;
  handler: string;
  status: 'in_transit' | 'accessed' | 'archived' | 'flagged';
  timestamp: string;
  destination: string;
}

const CLASSIFICATION_COLORS: Record<string, { bg: string; border: string; text: string; hex: string }> = {
  'TOP SECRET': { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', hex: '#ef4444' },
  'SECRET': { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', hex: '#f97316' },
  'CONFIDENTIAL': { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', hex: '#3b82f6' },
  'UNCLASSIFIED': { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', hex: '#10b981' },
};

const MOCK_DOCS: ClassifiedDoc[] = [
  { id: 'TS-2024-0147', title: 'OPERATION MIDNIGHT FALCON - Phase III Brief', classification: 'TOP SECRET', codeword: 'GAMMA/ORION', compartment: 'SCI-TALENT KEYHOLE', originator: 'CIA/NCS', handler: 'ADM. Richardson', status: 'in_transit', timestamp: '14:32:47 UTC', destination: 'NSC Situation Room' },
  { id: 'TS-2024-0148', title: 'SIGINT Intercept - Tehran Station', classification: 'TOP SECRET', codeword: 'COMINT/DELTA', compartment: 'SCI-SPECIAL INTEL', originator: 'NSA/CSS', handler: 'DIR. Nakasone', status: 'accessed', timestamp: '14:28:19 UTC', destination: 'DNI Briefing Room' },
  { id: 'S-2024-0892', title: 'Counterintelligence Assessment - Moscow Ops', classification: 'SECRET', codeword: 'NOFORN', compartment: 'CI/HUMINT', originator: 'FBI/CI Division', handler: 'SAC Williams', status: 'flagged', timestamp: '14:15:03 UTC', destination: 'FBI SCIF Level 3' },
  { id: 'S-2024-0893', title: 'Threat Actor Profile - APT-29 Update', classification: 'SECRET', codeword: 'REL FVEY', compartment: 'CYBER/THREAT', originator: 'CYBERCOM', handler: 'COL. Chen', status: 'archived', timestamp: '13:58:41 UTC', destination: 'Pentagon JWICS' },
  { id: 'C-2024-2341', title: 'Embassy Security Assessment - Kyiv', classification: 'CONFIDENTIAL', codeword: '', compartment: 'DS/SECURITY', originator: 'State/DS', handler: 'RSO Petrov', status: 'in_transit', timestamp: '14:05:22 UTC', destination: 'Regional Security Office' },
  { id: 'TS-2024-0149', title: 'Satellite Imagery - Facility 47 Changes', classification: 'TOP SECRET', codeword: 'TALENT KEYHOLE', compartment: 'SCI-IMINT', originator: 'NRO', handler: 'DIR. Calvelli', status: 'accessed', timestamp: '14:41:08 UTC', destination: 'GEOINT Analysis Center' },
  { id: 'S-2024-0894', title: 'HUMINT Source Report - CARDINAL', classification: 'SECRET', codeword: 'NOFORN/ORCON', compartment: 'HUMINT/CASE', originator: 'CIA/DO', handler: 'COS Berlin', status: 'in_transit', timestamp: '14:22:56 UTC', destination: 'Counterintelligence Center' },
  { id: 'TS-2024-0150', title: 'Nuclear Proliferation Alert - Site OMEGA', classification: 'TOP SECRET', codeword: 'GAMMA/RESTRICTED', compartment: 'WMD/NUCLEAR', originator: 'DIA', handler: 'GEN. Berrier', status: 'flagged', timestamp: '14:47:33 UTC', destination: 'White House Situation Room' },
];

const ClassifiedInfoFlow = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [selectedDoc, setSelectedDoc] = useState<ClassifiedDoc | null>(null);

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

    interface Particle {
      x: number;
      y: number;
      vy: number;
      color: string;
      size: number;
      alpha: number;
      classification: string;
    }

    const particles: Particle[] = [];
    let lastSpawn = 0;

    const classColors = ['#ef4444', '#f97316', '#3b82f6', '#10b981'];
    const classLabels = ['TS', 'S', 'C', 'U'];

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();

      if (now - lastSpawn > 400 + Math.random() * 600) {
        const colIdx = Math.random() < 0.3 ? 0 : Math.random() < 0.5 ? 1 : Math.random() < 0.7 ? 2 : 3;
        particles.push({
          x: 20 + Math.random() * (w - 40),
          y: -10,
          vy: 0.4 + Math.random() * 0.6,
          color: classColors[colIdx],
          size: 3 + Math.random() * 3,
          alpha: 0.8,
          classification: classLabels[colIdx],
        });
        lastSpawn = now;
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].y += particles[i].vy;
        particles[i].alpha -= 0.001;
        if (particles[i].y > h + 10 || particles[i].alpha <= 0) {
          particles.splice(i, 1);
        }
      }

      ctx.clearRect(0, 0, w, h);

      ctx.fillStyle = '#060a14';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(239, 68, 68, 0.03)';
      ctx.lineWidth = 0.5;
      for (let y = 0; y < h; y += 20) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let x = 0; x < w; x += 20) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }

      const levels = [
        { label: 'TOP SECRET / SCI', y: h * 0.15, color: '#ef4444' },
        { label: 'SECRET', y: h * 0.4, color: '#f97316' },
        { label: 'CONFIDENTIAL', y: h * 0.65, color: '#3b82f6' },
        { label: 'UNCLASSIFIED', y: h * 0.88, color: '#10b981' },
      ];

      for (const level of levels) {
        ctx.strokeStyle = level.color + '15';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 8]);
        ctx.beginPath();
        ctx.moveTo(0, level.y);
        ctx.lineTo(w, level.y);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = level.color + '20';
        ctx.fillRect(0, level.y - 2, w, 4);

        ctx.fillStyle = level.color + '60';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'right';
        ctx.fillText(level.label, w - 8, level.y - 6);
      }

      for (const p of particles) {
        ctx.globalAlpha = p.alpha;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 6;
        ctx.fillStyle = p.color + '40';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = p.color;
        ctx.font = 'bold 6px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.classification, p.x, p.y);
      }

      ctx.globalAlpha = 1;

      const scanY = (now * 0.03) % h;
      const gradient = ctx.createLinearGradient(0, scanY - 30, 0, scanY + 2);
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0.06)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, scanY - 30, w, 32);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const statusStyle = (s: string) => {
    switch (s) {
      case 'in_transit': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'accessed': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'archived': return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
      case 'flagged': return 'bg-red-500/10 text-red-400 border-red-500/20 animate-pulse';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative h-[280px] rounded-xl overflow-hidden border border-red-900/20">
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-lg border border-red-500/20">
            <Lock className="w-3 h-3 text-red-400" />
            <span className="text-red-400 text-[10px] font-mono font-bold tracking-wider">CLASSIFIED INFORMATION FLOW</span>
          </div>
        </div>
        <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
          <div className="px-2 py-1 bg-black/70 rounded border border-slate-700/30 text-[9px] font-mono text-slate-500">
            DOCS IN TRANSIT: <span className="text-cyan-400 font-bold">{MOCK_DOCS.filter(d => d.status === 'in_transit').length}</span>
          </div>
          <div className="px-2 py-1 bg-black/70 rounded border border-red-500/20 text-[9px] font-mono text-slate-500">
            FLAGGED: <span className="text-red-400 font-bold">{MOCK_DOCS.filter(d => d.status === 'flagged').length}</span>
          </div>
        </div>
        <canvas ref={canvasRef} className="w-full h-full" />
        <div className="absolute bottom-3 left-4 z-10 flex items-center gap-3 px-3 py-1.5 bg-black/70 rounded border border-slate-800/40">
          {Object.entries(CLASSIFICATION_COLORS).map(([label, c]) => (
            <div key={label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.hex }} />
              <span className="text-[8px] font-mono text-slate-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="enterprise-card overflow-hidden">
        <div className="bg-slate-800/20 px-4 py-2 border-b border-slate-800/30 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">DOCUMENT CHAIN OF CUSTODY</span>
          <ArrowDown className="w-3 h-3 text-slate-600" />
        </div>
        <div className="divide-y divide-slate-800/30 max-h-[400px] overflow-y-auto custom-scrollbar">
          {MOCK_DOCS.map(doc => {
            const cc = CLASSIFICATION_COLORS[doc.classification];
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(selectedDoc?.id === doc.id ? null : doc)}
                className="px-4 py-3 hover:bg-white/2 cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${cc.bg} ${cc.border} ${cc.text}`}>
                    {doc.classification === 'TOP SECRET' ? 'TS' : doc.classification === 'SECRET' ? 'S' : doc.classification === 'CONFIDENTIAL' ? 'C' : 'U'}
                  </div>
                  <span className="text-[10px] font-mono text-slate-500">{doc.id}</span>
                  <span className="text-xs text-slate-200 flex-1 truncate">{doc.title}</span>
                  <span className={`px-2 py-0.5 rounded text-[8px] font-mono font-bold border ${statusStyle(doc.status)}`}>
                    {doc.status.toUpperCase().replace('_', ' ')}
                  </span>
                  <span className="text-[10px] font-mono text-slate-600">{doc.timestamp}</span>
                </div>
                {doc.codeword && (
                  <div className="mt-1 ml-9 flex items-center gap-2">
                    <span className="text-[9px] font-mono text-red-400/60">{doc.codeword}</span>
                    <span className="text-[9px] font-mono text-slate-600">|</span>
                    <span className="text-[9px] font-mono text-slate-500">{doc.compartment}</span>
                  </div>
                )}
                {selectedDoc?.id === doc.id && (
                  <div className="mt-3 ml-9 grid grid-cols-2 gap-3">
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">ORIGINATOR</div>
                      <div className="text-[10px] font-mono text-slate-300">{doc.originator}</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">HANDLER</div>
                      <div className="text-[10px] font-mono text-slate-300">{doc.handler}</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">DESTINATION</div>
                      <div className="text-[10px] font-mono text-cyan-400">{doc.destination}</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">COMPARTMENT</div>
                      <div className="text-[10px] font-mono text-orange-400">{doc.compartment}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ClassifiedInfoFlow;
