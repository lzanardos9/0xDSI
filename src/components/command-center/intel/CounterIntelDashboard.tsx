import { useEffect, useRef, useState } from 'react';
import { Radar, AlertTriangle, Shield, Eye, UserX, Target, Clock } from 'lucide-react';

interface CICase {
  id: string;
  codename: string;
  type: 'mole_hunt' | 'foreign_agent' | 'insider_threat' | 'technical_surveillance' | 'double_agent';
  status: 'active' | 'surveillance' | 'neutralized' | 'escalated';
  threat: 'critical' | 'high' | 'medium';
  subject: string;
  affiliation: string;
  detectedVia: string;
  description: string;
  indicators: string[];
  daysActive: number;
}

const CI_CASES: CICase[] = [
  {
    id: 'CI-0047',
    codename: 'WINTER FOX',
    type: 'mole_hunt',
    status: 'active',
    threat: 'critical',
    subject: 'Unknown Insider - Senior Analyst Pool',
    affiliation: 'SVR (suspected)',
    detectedVia: 'Anomalous classified access patterns',
    description: 'Pattern analysis indicates unauthorized access to ORION compartment documents outside normal duty hours. Behavioral profiling narrows suspects to 3 senior analysts with TS/SCI clearance.',
    indicators: ['Off-hours SCIF access', 'Encrypted personal device usage', 'Unexplained foreign travel', 'Financial anomalies detected'],
    daysActive: 47,
  },
  {
    id: 'CI-0048',
    codename: 'IRON CURTAIN',
    type: 'foreign_agent',
    status: 'surveillance',
    threat: 'high',
    subject: 'Diplomatic Attache - Embassy Row',
    affiliation: 'GRU Unit 29155',
    detectedVia: 'HUMINT source report + SIGINT correlation',
    description: 'Foreign intelligence officer operating under diplomatic cover identified conducting dead drops and signal site communications. Counter-surveillance team deployed.',
    indicators: ['SDR (Surveillance Detection Route) pattern', 'Signal site activity at Lincoln Memorial', 'Contact with known intelligence facilitator', 'Encrypted burst transmissions'],
    daysActive: 23,
  },
  {
    id: 'CI-0049',
    codename: 'STARDUST LEAK',
    type: 'insider_threat',
    status: 'escalated',
    threat: 'critical',
    subject: 'Mr. Andrei Volkov - NSA/SID',
    affiliation: 'Under investigation',
    detectedVia: 'UEBA + polygraph inconsistency',
    description: 'Translation specialist flagged after failed polygraph questions regarding foreign contacts. UEBA detected bulk download of STARDUST compartment materials. Access suspended pending investigation.',
    indicators: ['Failed CI polygraph', 'Bulk classified download', 'Undisclosed foreign contact', 'Encrypted external communications', 'Travel to non-allied nation'],
    daysActive: 12,
  },
  {
    id: 'CI-0050',
    codename: 'GLASS EYE',
    type: 'technical_surveillance',
    status: 'active',
    threat: 'high',
    subject: 'SCIF-F2 Anomaly',
    affiliation: 'State actor (unknown)',
    detectedVia: 'TSCM sweep anomaly',
    description: 'Routine TSCM (Technical Surveillance Countermeasures) sweep detected anomalous RF emissions from Counter-Intel Vault. Possible implanted listening device. Full TEMPEST re-certification initiated.',
    indicators: ['Anomalous 1.2 GHz emission', 'RF pattern inconsistent with known devices', 'Detected during off-peak sweep', 'Wall cavity inspection ordered'],
    daysActive: 3,
  },
  {
    id: 'CI-0051',
    codename: 'MIRROR IMAGE',
    type: 'double_agent',
    status: 'surveillance',
    threat: 'medium',
    subject: 'Asset CARDINAL (controlled)',
    affiliation: 'Managed operation',
    detectedVia: 'Operational assessment',
    description: 'Double agent operation in progress. Asset CARDINAL believed to be feeding disinformation to hostile service while providing genuine intelligence. Operational security review scheduled.',
    indicators: ['Controlled information flow verified', 'Handler meetings on schedule', 'No burn indicators detected'],
    daysActive: 156,
  },
];

const typeLabels: Record<string, { label: string; color: string }> = {
  mole_hunt: { label: 'MOLE HUNT', color: '#ef4444' },
  foreign_agent: { label: 'FOREIGN AGENT', color: '#f97316' },
  insider_threat: { label: 'INSIDER THREAT', color: '#eab308' },
  technical_surveillance: { label: 'TECH SURV', color: '#3b82f6' },
  double_agent: { label: 'DOUBLE AGENT', color: '#10b981' },
};

const threatColor = (t: string) => {
  switch (t) {
    case 'critical': return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
    case 'high': return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' };
    default: return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' };
  }
};

const statusStyle = (s: string) => {
  switch (s) {
    case 'active': return { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20' };
    case 'surveillance': return { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' };
    case 'neutralized': return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' };
    case 'escalated': return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' };
    default: return { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' };
  }
};

const CounterIntelDashboard = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [expandedCase, setExpandedCase] = useState<string | null>(null);

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

    const targets = CI_CASES.map((c, i) => ({
      angle: (i / CI_CASES.length) * Math.PI * 2 - Math.PI / 2,
      dist: c.threat === 'critical' ? 0.25 : c.threat === 'high' ? 0.5 : 0.7,
      color: typeLabels[c.type].color,
      label: c.codename,
      pulse: c.status === 'active' || c.status === 'escalated',
    }));

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();
      const cx = w / 2;
      const cy = h / 2;
      const maxR = Math.min(w, h) * 0.42;

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#060a12';
      ctx.fillRect(0, 0, w, h);

      for (let r = maxR; r > 0; r -= maxR / 4) {
        ctx.strokeStyle = r <= maxR * 0.3 ? 'rgba(239, 68, 68, 0.08)' : r <= maxR * 0.6 ? 'rgba(249, 115, 22, 0.06)' : 'rgba(34, 211, 238, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      for (let a = 0; a < 12; a++) {
        const angle = (a / 12) * Math.PI * 2;
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.04)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * maxR, cy + Math.sin(angle) * maxR);
        ctx.stroke();
      }

      const sweepAngle = (now * 0.0008) % (Math.PI * 2);
      const sweepGradient = ctx.createConicGradient(sweepAngle - 0.5, cx, cy);
      sweepGradient.addColorStop(0, 'rgba(249, 115, 22, 0)');
      sweepGradient.addColorStop(0.08, 'rgba(249, 115, 22, 0.06)');
      sweepGradient.addColorStop(0.15, 'rgba(249, 115, 22, 0)');
      sweepGradient.addColorStop(1, 'rgba(249, 115, 22, 0)');
      ctx.fillStyle = sweepGradient;
      ctx.beginPath();
      ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#f9731660';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(sweepAngle) * maxR, cy + Math.sin(sweepAngle) * maxR);
      ctx.stroke();

      for (const t of targets) {
        const tx = cx + Math.cos(t.angle) * (maxR * t.dist);
        const ty = cy + Math.sin(t.angle) * (maxR * t.dist);

        if (t.pulse) {
          const pulseR = 8 + Math.sin(now * 0.004) * 3;
          ctx.strokeStyle = t.color + '30';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(tx, ty, pulseR, 0, Math.PI * 2);
          ctx.stroke();
        }

        ctx.shadowColor = t.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = t.color + '60';
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = t.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tx, ty, 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.fillStyle = t.color;
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(t.label, tx, ty - 10);
      }

      ctx.fillStyle = '#f9731650';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      const zoneLabels = [
        { label: 'CRITICAL', r: maxR * 0.15 },
        { label: 'HIGH', r: maxR * 0.4 },
        { label: 'MEDIUM', r: maxR * 0.65 },
        { label: 'LOW', r: maxR * 0.85 },
      ];
      for (const zl of zoneLabels) {
        ctx.fillText(zl.label, cx, cy - zl.r - 4);
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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="relative h-[380px] rounded-xl overflow-hidden border border-orange-900/20">
          <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-lg border border-orange-500/20">
              <Radar className="w-3 h-3 text-orange-400" />
              <span className="text-orange-400 text-[10px] font-mono font-bold tracking-wider">COUNTER-INTELLIGENCE RADAR</span>
            </div>
          </div>
          <div className="absolute top-3 right-4 z-10">
            <div className="px-2 py-1 bg-black/70 rounded border border-red-500/20 text-[9px] font-mono">
              <span className="text-slate-500">ACTIVE CASES: </span>
              <span className="text-red-400 font-bold">{CI_CASES.filter(c => c.status !== 'neutralized').length}</span>
            </div>
          </div>
          <canvas ref={canvasRef} className="w-full h-full" />
          <div className="absolute bottom-3 left-4 z-10 flex items-center gap-3 px-3 py-1.5 bg-black/70 rounded border border-slate-800/40">
            {Object.entries(typeLabels).map(([_, v]) => (
              <div key={v.label} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                <span className="text-[7px] font-mono text-slate-500">{v.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="enterprise-card p-4 border-red-900/20">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-4 h-4 text-red-400" />
              <span className="text-[10px] font-mono font-bold text-red-400 tracking-wider">MOLE HUNTS</span>
            </div>
            <div className="text-2xl font-mono font-bold text-red-400">{CI_CASES.filter(c => c.type === 'mole_hunt').length}</div>
            <div className="text-[9px] font-mono text-slate-500 mt-1">Active investigations</div>
          </div>
          <div className="enterprise-card p-4 border-orange-900/20">
            <div className="flex items-center gap-2 mb-2">
              <UserX className="w-4 h-4 text-orange-400" />
              <span className="text-[10px] font-mono font-bold text-orange-400 tracking-wider">FOREIGN AGENTS</span>
            </div>
            <div className="text-2xl font-mono font-bold text-orange-400">{CI_CASES.filter(c => c.type === 'foreign_agent').length}</div>
            <div className="text-[9px] font-mono text-slate-500 mt-1">Under surveillance</div>
          </div>
          <div className="enterprise-card p-4 border-yellow-900/20">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400" />
              <span className="text-[10px] font-mono font-bold text-yellow-400 tracking-wider">INSIDER THREATS</span>
            </div>
            <div className="text-2xl font-mono font-bold text-yellow-400">{CI_CASES.filter(c => c.type === 'insider_threat').length}</div>
            <div className="text-[9px] font-mono text-slate-500 mt-1">Flagged personnel</div>
          </div>
          <div className="enterprise-card p-4 border-blue-900/20">
            <div className="flex items-center gap-2 mb-2">
              <Eye className="w-4 h-4 text-blue-400" />
              <span className="text-[10px] font-mono font-bold text-blue-400 tracking-wider">TECH SURVEILLANCE</span>
            </div>
            <div className="text-2xl font-mono font-bold text-blue-400">{CI_CASES.filter(c => c.type === 'technical_surveillance').length}</div>
            <div className="text-[9px] font-mono text-slate-500 mt-1">TSCM anomalies</div>
          </div>
        </div>
      </div>

      <div className="enterprise-card overflow-hidden">
        <div className="bg-slate-800/20 px-4 py-2 border-b border-slate-800/30 flex items-center gap-2">
          <Shield className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">ACTIVE CI CASES</span>
          <span className="ml-2 px-1.5 py-0.5 rounded text-[7px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">
            EYES ONLY
          </span>
        </div>
        <div className="divide-y divide-slate-800/20 max-h-[400px] overflow-y-auto custom-scrollbar">
          {CI_CASES.map(c => {
            const tl = typeLabels[c.type];
            const tc = threatColor(c.threat);
            const ss = statusStyle(c.status);
            const isExpanded = expandedCase === c.id;

            return (
              <div
                key={c.id}
                className={`px-4 py-3 hover:bg-white/2 cursor-pointer transition-colors ${c.status === 'escalated' ? 'bg-red-500/3' : ''}`}
                onClick={() => setExpandedCase(isExpanded ? null : c.id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-slate-500 w-14">{c.id}</span>
                  <span className="text-sm font-mono font-bold text-slate-200">{c.codename}</span>
                  <span className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold" style={{ backgroundColor: tl.color + '15', color: tl.color, border: `1px solid ${tl.color}30` }}>
                    {tl.label}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border ${tc.bg} ${tc.text} ${tc.border}`}>
                    {c.threat.toUpperCase()}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border ${ss.bg} ${ss.text} ${ss.border}`}>
                    {c.status.toUpperCase()}
                  </span>
                  <span className="ml-auto flex items-center gap-1 text-[9px] font-mono text-slate-500">
                    <Clock className="w-3 h-3" /> {c.daysActive}d
                  </span>
                </div>
                <div className="mt-1 ml-14 text-[10px] text-slate-500 truncate">{c.subject} - {c.affiliation}</div>

                {isExpanded && (
                  <div className="mt-3 ml-14 space-y-3">
                    <div className="bg-slate-900/40 rounded p-3 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-1">CASE SUMMARY</div>
                      <p className="text-[10px] text-slate-300 leading-relaxed">{c.description}</p>
                    </div>
                    <div className="bg-slate-900/40 rounded p-3 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-1">DETECTED VIA</div>
                      <p className="text-[10px] font-mono text-cyan-400">{c.detectedVia}</p>
                    </div>
                    <div>
                      <div className="text-[8px] font-mono text-slate-600 mb-1.5">INDICATORS</div>
                      <div className="flex flex-wrap gap-1.5">
                        {c.indicators.map(ind => (
                          <span key={ind} className="px-2 py-0.5 rounded bg-slate-800/50 text-[9px] font-mono text-slate-400 border border-slate-700/30">
                            {ind}
                          </span>
                        ))}
                      </div>
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

export default CounterIntelDashboard;
