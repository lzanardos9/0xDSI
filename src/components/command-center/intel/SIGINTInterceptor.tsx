import { useEffect, useRef, useState } from 'react';
import { Satellite, Radio, Activity, Zap, Volume2, VolumeX } from 'lucide-react';

interface Intercept {
  id: string;
  timestamp: string;
  source: string;
  targetFreq: string;
  type: 'COMINT' | 'ELINT' | 'FISINT' | 'MASINT';
  classification: string;
  signal: string;
  bearing: string;
  strength: number;
  content: string;
  status: 'active' | 'recorded' | 'analyzed' | 'disseminated';
  priority: 'flash' | 'immediate' | 'priority' | 'routine';
}

const MOCK_INTERCEPTS: Intercept[] = [
  { id: 'SIG-7741', timestamp: '14:47:22', source: 'SAT-KH-12', targetFreq: '8.432 GHz', type: 'COMINT', classification: 'TS/SCI-SI', signal: 'Encrypted voice channel - GRU Main Directorate', bearing: '047.3 NE', strength: 87, content: 'Burst transmission detected. Duration: 14.2s. Encryption: military-grade COMSEC. Voice pattern matches SIGINT target VOSTOK-7.', status: 'active', priority: 'flash' },
  { id: 'SIG-7742', timestamp: '14:44:08', source: 'ECHELON-NW', targetFreq: '14.250 MHz', type: 'COMINT', classification: 'TS/SCI-SI', signal: 'HF diplomatic channel - Tehran Embassy', bearing: '112.8 SE', strength: 62, content: 'Coded message intercept. Pattern matches one-time pad usage. 847 character groups. Forwarded to cryptanalysis.', status: 'recorded', priority: 'immediate' },
  { id: 'SIG-7743', timestamp: '14:41:55', source: 'SATCOM-3', targetFreq: '2.4 GHz', type: 'ELINT', classification: 'SECRET', signal: 'Radar emission - S-400 battery activation', bearing: '023.1 N', strength: 94, content: 'S-400 Triumf fire control radar detected. Emission pattern indicates tracking mode. Grid reference: 55.7N 37.6E.', status: 'analyzed', priority: 'flash' },
  { id: 'SIG-7744', timestamp: '14:38:33', source: 'SOSUS-ATL', targetFreq: '12-50 Hz', type: 'MASINT', classification: 'TS/SCI', signal: 'Submarine acoustic signature', bearing: '284.5 W', strength: 41, content: 'Probable submarine contact. Acoustic signature analysis: 73% match to Yasen-class SSN. Depth estimate: 200-300m. Speed: 8 knots.', status: 'active', priority: 'immediate' },
  { id: 'SIG-7745', timestamp: '14:35:19', source: 'SIGINT-PKT', targetFreq: '1.8 GHz', type: 'FISINT', classification: 'SECRET', signal: 'Missile telemetry intercept', bearing: '068.7 NE', strength: 78, content: 'Ballistic missile test telemetry captured. Flight parameters indicate medium-range capability. Apogee: ~250km.', status: 'disseminated', priority: 'priority' },
  { id: 'SIG-7746', timestamp: '14:30:02', source: 'ECHELON-EU', targetFreq: '900 MHz', type: 'COMINT', classification: 'SECRET', signal: 'Cellular intercept - Target SHADOW-9', bearing: '192.4 S', strength: 55, content: 'Target SHADOW-9 mobile device geolocated. Call metadata captured. Contact with known intelligence facilitator confirmed.', status: 'analyzed', priority: 'priority' },
];

const typeColors: Record<string, string> = {
  COMINT: '#22d3ee',
  ELINT: '#f97316',
  FISINT: '#a855f7',
  MASINT: '#10b981',
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  flash: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  immediate: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  priority: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  routine: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
};

const SIGINTInterceptor = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [selectedIntercept, setSelectedIntercept] = useState<Intercept | null>(null);
  const [monitoring, setMonitoring] = useState(true);

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

    const waveformData: number[][] = Array.from({ length: 4 }, () => Array.from({ length: 200 }, () => 0));

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#050a14';
      ctx.fillRect(0, 0, w, h);

      const colors = ['#22d3ee', '#f97316', '#10b981', '#ef4444'];
      const labels = ['COMINT', 'ELINT', 'MASINT', 'FLASH'];
      const channelH = (h - 30) / 4;

      for (let ch = 0; ch < 4; ch++) {
        const cy = 25 + ch * channelH + channelH / 2;

        ctx.strokeStyle = colors[ch] + '10';
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, cy);
        ctx.lineTo(w, cy);
        ctx.stroke();

        ctx.fillStyle = colors[ch] + '40';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(labels[ch], 6, cy - channelH / 2 + 12);

        for (let i = waveformData[ch].length - 1; i > 0; i--) {
          waveformData[ch][i] = waveformData[ch][i - 1];
        }

        const baseFreq = (ch + 1) * 0.3;
        const noise = (Math.random() - 0.5) * 8;
        const signal = Math.sin(now * 0.002 * baseFreq) * (channelH * 0.25) +
          Math.sin(now * 0.005 * (ch + 1)) * (channelH * 0.1) + noise;

        const burst = Math.random() < 0.02 ? (Math.random() - 0.5) * channelH * 0.6 : 0;
        waveformData[ch][0] = signal + burst;

        ctx.strokeStyle = colors[ch];
        ctx.lineWidth = 1.5;
        ctx.shadowColor = colors[ch];
        ctx.shadowBlur = 4;
        ctx.beginPath();

        const step = w / waveformData[ch].length;
        for (let i = 0; i < waveformData[ch].length; i++) {
          const x = w - i * step;
          const y = cy + waveformData[ch][i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        ctx.strokeStyle = colors[ch] + '08';
        ctx.lineWidth = channelH * 0.4;
        ctx.beginPath();
        for (let i = 0; i < waveformData[ch].length; i++) {
          const x = w - i * step;
          const y = cy + waveformData[ch][i];
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        ctx.strokeStyle = colors[ch] + '15';
        ctx.lineWidth = 0.5;
        for (let y2 = cy - channelH / 2; y2 < cy + channelH / 2; y2 += channelH / 6) {
          ctx.setLineDash([2, 4]);
          ctx.beginPath();
          ctx.moveTo(0, y2);
          ctx.lineTo(w, y2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const scanX = (now * 0.05) % w;
      const gradient = ctx.createLinearGradient(scanX - 40, 0, scanX + 2, 0);
      gradient.addColorStop(0, 'rgba(34, 211, 238, 0)');
      gradient.addColorStop(1, 'rgba(34, 211, 238, 0.08)');
      ctx.fillStyle = gradient;
      ctx.fillRect(scanX - 40, 0, 42, h);

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
      <div className="relative h-[300px] rounded-xl overflow-hidden border border-blue-900/20">
        <div className="absolute top-3 left-4 z-10 flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-black/70 rounded-lg border border-blue-500/20">
            <Radio className="w-3 h-3 text-blue-400 animate-pulse" />
            <span className="text-blue-400 text-[10px] font-mono font-bold tracking-wider">SIGINT / ELINT INTERCEPT</span>
          </div>
        </div>
        <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
          <div className="px-2 py-1 bg-black/70 rounded border border-slate-700/30 text-[9px] font-mono text-slate-500">
            CHANNELS: <span className="text-cyan-400 font-bold">4</span>
          </div>
          <button
            onClick={() => setMonitoring(!monitoring)}
            className={`flex items-center gap-1 px-2 py-1 rounded border text-[9px] font-mono font-bold ${
              monitoring ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-500/10 border-slate-500/30 text-slate-400'
            }`}
          >
            {monitoring ? <Volume2 className="w-3 h-3" /> : <VolumeX className="w-3 h-3" />}
            {monitoring ? 'MONITORING' : 'MUTED'}
          </button>
        </div>
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>

      <div className="enterprise-card overflow-hidden">
        <div className="bg-slate-800/20 px-4 py-2 border-b border-slate-800/30 flex items-center gap-2">
          <Satellite className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">INTERCEPT LOG</span>
          <div className="ml-auto flex items-center gap-3 text-[9px] font-mono">
            {Object.entries(typeColors).map(([type, color]) => (
              <div key={type} className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-slate-500">{type}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="divide-y divide-slate-800/20 max-h-[350px] overflow-y-auto custom-scrollbar">
          {MOCK_INTERCEPTS.map(ic => {
            const pc = priorityColors[ic.priority];
            const tc = typeColors[ic.type];
            const isSelected = selectedIntercept?.id === ic.id;
            return (
              <div
                key={ic.id}
                className={`px-4 py-2.5 hover:bg-white/2 cursor-pointer transition-colors ${ic.priority === 'flash' ? 'bg-red-500/3' : ''}`}
                onClick={() => setSelectedIntercept(isSelected ? null : ic)}
              >
                <div className="flex items-center gap-3">
                  <Activity className="w-3 h-3" style={{ color: tc }} />
                  <span className="text-[10px] font-mono text-slate-500 w-16">{ic.id}</span>
                  <span className="text-[10px] font-mono text-slate-600 w-16">{ic.timestamp}</span>
                  <span className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold" style={{ backgroundColor: tc + '15', color: tc, border: `1px solid ${tc}30` }}>
                    {ic.type}
                  </span>
                  <span className="text-xs text-slate-200 flex-1 truncate">{ic.signal}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border ${pc.bg} ${pc.text} ${pc.border}`}>
                    {ic.priority.toUpperCase()}
                  </span>
                  <div className="w-16 flex items-center gap-1">
                    <div className="flex-1 h-1 rounded bg-slate-800">
                      <div className="h-1 rounded" style={{ width: `${ic.strength}%`, backgroundColor: tc }} />
                    </div>
                    <span className="text-[8px] font-mono text-slate-500">{ic.strength}%</span>
                  </div>
                </div>
                {isSelected && (
                  <div className="mt-3 ml-6 space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">SOURCE</div>
                        <div className="text-[10px] font-mono text-cyan-400">{ic.source}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">FREQUENCY</div>
                        <div className="text-[10px] font-mono text-slate-300">{ic.targetFreq}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">BEARING</div>
                        <div className="text-[10px] font-mono text-emerald-400">{ic.bearing}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">CLASSIFICATION</div>
                        <div className="text-[10px] font-mono text-red-400">{ic.classification}</div>
                      </div>
                    </div>
                    <div className="bg-black/40 rounded p-3 border border-slate-800/30">
                      <div className="text-[7px] font-mono text-slate-600 mb-1">INTERCEPT CONTENT</div>
                      <p className="text-[10px] font-mono text-slate-300 leading-relaxed">{ic.content}</p>
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

export default SIGINTInterceptor;
