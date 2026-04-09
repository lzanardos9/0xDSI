import { useEffect, useRef, useState } from 'react';
import { Eye, Clock, AlertTriangle, TrendingUp } from 'lucide-react';

const ATTACK_STAGES = [
  { id: 1, name: 'External Recon', abbr: 'EXT-RECON', description: 'Passive scanning, OSINT gathering' },
  { id: 2, name: 'Active Recon', abbr: 'ACT-RECON', description: 'Port scanning, service enumeration' },
  { id: 3, name: 'Weaponization', abbr: 'WEAPON', description: 'Payload creation, exploit prep' },
  { id: 4, name: 'Delivery', abbr: 'DELIVER', description: 'Phishing, watering hole, supply chain' },
  { id: 5, name: 'Exploitation', abbr: 'EXPLOIT', description: 'Vulnerability trigger, code execution' },
  { id: 6, name: 'Installation', abbr: 'INSTALL', description: 'Backdoor, persistence mechanism' },
  { id: 7, name: 'C2 Establish', abbr: 'C2-EST', description: 'Beacon, DNS tunnel, covert channel' },
  { id: 8, name: 'Privilege Esc', abbr: 'PRIV-ESC', description: 'Token theft, kernel exploit' },
  { id: 9, name: 'Lateral Move', abbr: 'LATERAL', description: 'PsExec, WMI, RDP pivot' },
  { id: 10, name: 'Collection', abbr: 'COLLECT', description: 'Data staging, archive creation' },
  { id: 11, name: 'Exfiltration', abbr: 'EXFIL', description: 'Data theft, covert transfer' },
];

interface SlowAttack {
  id: string;
  name: string;
  actor: string;
  currentStage: number;
  stageProgress: number;
  confidence: number;
  firstSeen: string;
  daysActive: number;
  indicators: number;
  velocity: 'crawling' | 'creeping' | 'advancing' | 'accelerating';
  stageHistory: { stage: number; timestamp: number }[];
  color: string;
}

const INITIAL_ATTACKS: SlowAttack[] = [
  {
    id: 'las-001',
    name: 'GHOST SPIDER',
    actor: 'APT-41',
    currentStage: 7,
    stageProgress: 0.6,
    confidence: 72,
    firstSeen: '23 days ago',
    daysActive: 23,
    indicators: 47,
    velocity: 'creeping',
    stageHistory: [
      { stage: 1, timestamp: Date.now() - 23 * 86400000 },
      { stage: 2, timestamp: Date.now() - 19 * 86400000 },
      { stage: 3, timestamp: Date.now() - 15 * 86400000 },
      { stage: 4, timestamp: Date.now() - 12 * 86400000 },
      { stage: 5, timestamp: Date.now() - 8 * 86400000 },
      { stage: 6, timestamp: Date.now() - 5 * 86400000 },
      { stage: 7, timestamp: Date.now() - 2 * 86400000 },
    ],
    color: '#ef4444',
  },
  {
    id: 'las-002',
    name: 'SILENT VIPER',
    actor: 'Lazarus Group',
    currentStage: 4,
    stageProgress: 0.3,
    confidence: 58,
    firstSeen: '14 days ago',
    daysActive: 14,
    indicators: 23,
    velocity: 'crawling',
    stageHistory: [
      { stage: 1, timestamp: Date.now() - 14 * 86400000 },
      { stage: 2, timestamp: Date.now() - 10 * 86400000 },
      { stage: 3, timestamp: Date.now() - 6 * 86400000 },
      { stage: 4, timestamp: Date.now() - 3 * 86400000 },
    ],
    color: '#f97316',
  },
  {
    id: 'las-003',
    name: 'DARK NEEDLE',
    actor: 'Unknown',
    currentStage: 2,
    stageProgress: 0.8,
    confidence: 34,
    firstSeen: '7 days ago',
    daysActive: 7,
    indicators: 11,
    velocity: 'crawling',
    stageHistory: [
      { stage: 1, timestamp: Date.now() - 7 * 86400000 },
      { stage: 2, timestamp: Date.now() - 2 * 86400000 },
    ],
    color: '#eab308',
  },
  {
    id: 'las-004',
    name: 'PHANTOM TIDE',
    actor: 'APT-28',
    currentStage: 9,
    stageProgress: 0.4,
    confidence: 87,
    firstSeen: '31 days ago',
    daysActive: 31,
    indicators: 89,
    velocity: 'advancing',
    stageHistory: [
      { stage: 1, timestamp: Date.now() - 31 * 86400000 },
      { stage: 2, timestamp: Date.now() - 28 * 86400000 },
      { stage: 3, timestamp: Date.now() - 24 * 86400000 },
      { stage: 4, timestamp: Date.now() - 20 * 86400000 },
      { stage: 5, timestamp: Date.now() - 16 * 86400000 },
      { stage: 6, timestamp: Date.now() - 13 * 86400000 },
      { stage: 7, timestamp: Date.now() - 9 * 86400000 },
      { stage: 8, timestamp: Date.now() - 5 * 86400000 },
      { stage: 9, timestamp: Date.now() - 1 * 86400000 },
    ],
    color: '#dc2626',
  },
  {
    id: 'las-005',
    name: 'MIST WALKER',
    actor: 'Suspected CN',
    currentStage: 5,
    stageProgress: 0.15,
    confidence: 45,
    firstSeen: '18 days ago',
    daysActive: 18,
    indicators: 19,
    velocity: 'creeping',
    stageHistory: [
      { stage: 1, timestamp: Date.now() - 18 * 86400000 },
      { stage: 2, timestamp: Date.now() - 15 * 86400000 },
      { stage: 3, timestamp: Date.now() - 11 * 86400000 },
      { stage: 4, timestamp: Date.now() - 7 * 86400000 },
      { stage: 5, timestamp: Date.now() - 1 * 86400000 },
    ],
    color: '#f59e0b',
  },
];

const LowAndSlowTracker = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [attacks, setAttacks] = useState<SlowAttack[]>(INITIAL_ATTACKS);
  const [selectedAttack, setSelectedAttack] = useState<string | null>('las-004');
  const attacksRef = useRef(INITIAL_ATTACKS);

  useEffect(() => {
    const progressInterval = setInterval(() => {
      attacksRef.current = attacksRef.current.map(a => {
        let newProgress = a.stageProgress + (0.001 + Math.random() * 0.005);
        let newStage = a.currentStage;
        let newConfidence = a.confidence;
        const newHistory = [...a.stageHistory];

        if (newProgress >= 1 && newStage < 11) {
          newStage++;
          newProgress = 0;
          newHistory.push({ stage: newStage, timestamp: Date.now() });
          newConfidence = Math.min(99, newConfidence + 3 + Math.random() * 5);
        }

        newConfidence = Math.min(99, newConfidence + (Math.random() - 0.3) * 0.5);

        let velocity: SlowAttack['velocity'] = 'crawling';
        if (a.daysActive > 0) {
          const stagesPerDay = newStage / a.daysActive;
          if (stagesPerDay > 0.5) velocity = 'accelerating';
          else if (stagesPerDay > 0.3) velocity = 'advancing';
          else if (stagesPerDay > 0.15) velocity = 'creeping';
        }

        return {
          ...a,
          currentStage: newStage,
          stageProgress: Math.min(newProgress, 0.99),
          confidence: Math.round(newConfidence),
          velocity,
          stageHistory: newHistory,
          indicators: a.indicators + (Math.random() > 0.95 ? 1 : 0),
        };
      });
      setAttacks([...attacksRef.current]);
    }, 2000);

    return () => clearInterval(progressInterval);
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
      const now = Date.now();

      ctx.clearRect(0, 0, w, h);

      const stageW = w / 11;
      const headerH = 30;
      const laneH = (h - headerH) / attacksRef.current.length;

      for (let i = 0; i < 11; i++) {
        const x = i * stageW;
        const stage = ATTACK_STAGES[i];

        ctx.fillStyle = i % 2 === 0 ? 'rgba(15, 23, 42, 0.3)' : 'rgba(15, 23, 42, 0.15)';
        ctx.fillRect(x, 0, stageW, h);

        const dangerGrad = ctx.createLinearGradient(0, 0, w, 0);
        dangerGrad.addColorStop(0, 'rgba(34, 211, 238, 0.03)');
        dangerGrad.addColorStop(0.5, 'rgba(234, 179, 8, 0.03)');
        dangerGrad.addColorStop(1, 'rgba(239, 68, 68, 0.05)');
        ctx.fillStyle = dangerGrad;
        ctx.fillRect(x, 0, stageW, h);

        ctx.fillStyle = i < 4 ? '#22d3ee60' : i < 7 ? '#eab30860' : '#ef444460';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(stage.abbr, x + stageW / 2, 12);

        ctx.fillStyle = '#475569' + '40';
        ctx.font = '7px monospace';
        ctx.fillText(String(i + 1), x + stageW / 2, 24);

        ctx.strokeStyle = 'rgba(51, 65, 85, 0.15)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(x + stageW, 0);
        ctx.lineTo(x + stageW, h);
        ctx.stroke();
      }

      for (let aIdx = 0; aIdx < attacksRef.current.length; aIdx++) {
        const attack = attacksRef.current[aIdx];
        const laneY = headerH + aIdx * laneH;
        const laneMidY = laneY + laneH / 2;
        const isSelected = selectedAttack === attack.id;

        if (isSelected) {
          ctx.fillStyle = attack.color + '08';
          ctx.fillRect(0, laneY, w, laneH);
          ctx.strokeStyle = attack.color + '30';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(0, laneY, w, laneH);
        }

        ctx.strokeStyle = 'rgba(51, 65, 85, 0.1)';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, laneY + laneH);
        ctx.lineTo(w, laneY + laneH);
        ctx.stroke();

        if (attack.stageHistory.length > 1) {
          ctx.strokeStyle = attack.color + '25';
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let si = 0; si < attack.stageHistory.length; si++) {
            const sh = attack.stageHistory[si];
            const sx = (sh.stage - 0.5) * stageW;
            if (si === 0) ctx.moveTo(sx, laneMidY);
            else ctx.lineTo(sx, laneMidY);
          }
          const headX = (attack.currentStage - 1 + attack.stageProgress) * stageW;
          ctx.lineTo(headX, laneMidY);
          ctx.stroke();
        }

        for (const sh of attack.stageHistory) {
          const sx = (sh.stage - 0.5) * stageW;
          ctx.fillStyle = attack.color + '40';
          ctx.beginPath();
          ctx.arc(sx, laneMidY, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = attack.color;
          ctx.beginPath();
          ctx.arc(sx, laneMidY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }

        const headX = (attack.currentStage - 1 + attack.stageProgress) * stageW;
        const pulse = Math.sin(now * 0.005 + aIdx) * 0.3 + 0.7;

        ctx.fillStyle = attack.color + '20';
        ctx.beginPath();
        ctx.arc(headX, laneMidY, 12 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = attack.color + '50';
        ctx.beginPath();
        ctx.arc(headX, laneMidY, 7 * pulse, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowColor = attack.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = attack.color;
        ctx.beginPath();
        ctx.arc(headX, laneMidY, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (attack.confidence < 50) {
          ctx.setLineDash([3, 4]);
          ctx.strokeStyle = attack.color + '30';
          ctx.lineWidth = 1;
          const projectedX = Math.min(w, headX + stageW * 2);
          ctx.beginPath();
          ctx.moveTo(headX + 6, laneMidY);
          ctx.lineTo(projectedX, laneMidY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = attack.color + '40';
          ctx.font = '7px monospace';
          ctx.textAlign = 'left';
          ctx.fillText('PROJECTED', headX + 8, laneMidY - 5);
        }

        ctx.fillStyle = attack.color + 'cc';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(attack.name, 4, laneY + 12);

        ctx.fillStyle = '#64748b80';
        ctx.font = '7px monospace';
        ctx.fillText(attack.actor, 4, laneY + 22);
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [selectedAttack]);

  const selected = attacks.find(a => a.id === selectedAttack);

  const getVelocityColor = (v: string) => {
    if (v === 'accelerating') return 'text-red-400 bg-red-500/10 border-red-500/30';
    if (v === 'advancing') return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    if (v === 'creeping') return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    return 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30';
  };

  const getConfidenceColor = (c: number) => {
    if (c > 75) return 'text-red-400';
    if (c > 50) return 'text-orange-400';
    if (c > 30) return 'text-yellow-400';
    return 'text-slate-400';
  };

  return (
    <div className="relative w-full h-full bg-[#050810] rounded-xl overflow-hidden border border-slate-800/50 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg border border-yellow-500/20">
            <Eye className="w-3 h-3 text-yellow-400" />
            <span className="text-yellow-400 text-xs font-mono font-bold tracking-wider">LOW & SLOW TRACKER</span>
          </div>
          <span className="text-slate-600 text-[10px] font-mono">
            {attacks.length} SUSPECTED CAMPAIGNS
          </span>
        </div>
        <div className="flex gap-2">
          {attacks.map(a => (
            <button
              key={a.id}
              onClick={() => setSelectedAttack(selectedAttack === a.id ? null : a.id)}
              className={`px-2 py-1 rounded border text-[10px] font-mono font-bold transition-all ${
                selectedAttack === a.id
                  ? 'bg-white/10 border-white/20 text-white'
                  : 'border-slate-700/30 hover:border-slate-600/50'
              }`}
              style={{ color: selectedAttack === a.id ? a.color : a.color + '80' }}
            >
              {a.name.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 relative">
          <canvas ref={canvasRef} className="w-full h-full" />
        </div>

        {selected && (
          <div className="w-56 border-l border-slate-800/50 p-3 flex flex-col gap-3 overflow-y-auto custom-scrollbar">
            <div>
              <div className="text-xs font-mono font-bold mb-1" style={{ color: selected.color }}>
                {selected.name}
              </div>
              <div className="text-[10px] font-mono text-slate-500">{selected.actor}</div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-slate-500">Stage</span>
                <span className="text-[10px] font-mono text-slate-300">
                  {selected.currentStage}/11 ({ATTACK_STAGES[selected.currentStage - 1].abbr})
                </span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width: `${((selected.currentStage - 1 + selected.stageProgress) / 11) * 100}%`,
                    backgroundColor: selected.color,
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-800/30 rounded p-2 border border-slate-700/20">
                <div className="text-[9px] font-mono text-slate-600 mb-0.5">CONFIDENCE</div>
                <div className={`text-sm font-mono font-bold ${getConfidenceColor(selected.confidence)}`}>
                  {selected.confidence}%
                </div>
              </div>
              <div className="bg-slate-800/30 rounded p-2 border border-slate-700/20">
                <div className="text-[9px] font-mono text-slate-600 mb-0.5">INDICATORS</div>
                <div className="text-sm font-mono font-bold text-slate-300">{selected.indicators}</div>
              </div>
              <div className="bg-slate-800/30 rounded p-2 border border-slate-700/20">
                <div className="text-[9px] font-mono text-slate-600 mb-0.5">FIRST SEEN</div>
                <div className="text-[10px] font-mono text-slate-300">{selected.firstSeen}</div>
              </div>
              <div className="bg-slate-800/30 rounded p-2 border border-slate-700/20">
                <div className="text-[9px] font-mono text-slate-600 mb-0.5">DAYS ACTIVE</div>
                <div className="text-sm font-mono font-bold text-slate-300">{selected.daysActive}</div>
              </div>
            </div>

            <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded border text-[10px] font-mono font-bold ${getVelocityColor(selected.velocity)}`}>
              <TrendingUp className="w-3 h-3" />
              <span>{selected.velocity.toUpperCase()}</span>
            </div>

            <div>
              <div className="text-[9px] font-mono text-slate-600 mb-1.5">STAGE TIMELINE</div>
              <div className="space-y-1">
                {selected.stageHistory.map((sh, i) => {
                  const stage = ATTACK_STAGES[sh.stage - 1];
                  const daysAgo = Math.round((Date.now() - sh.timestamp) / 86400000);
                  return (
                    <div key={i} className="flex items-center gap-2 text-[9px] font-mono">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: selected.color }} />
                      <span className="text-slate-500 w-6">{stage.id}.</span>
                      <span className="text-slate-400 flex-1">{stage.abbr}</span>
                      <span className="text-slate-600">{daysAgo}d ago</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {selected.confidence > 70 && (
              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-red-500/10 border border-red-500/30 rounded text-[10px] font-mono text-red-400">
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span>HIGH THREAT - Recommend immediate containment</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LowAndSlowTracker;
