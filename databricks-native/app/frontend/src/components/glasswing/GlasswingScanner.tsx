import { useState, useEffect, useRef } from 'react';
import { Play, Square, Zap, Server, Globe, Package, Container, Wifi, ChevronDown } from 'lucide-react';

interface ScanConfig {
  name: string;
  targetType: string;
  target: string;
  depth: string;
  model: string;
}

interface ActiveScan {
  id: string;
  scan_name: string;
  target_identifier: string;
  model_used: string;
  status: string;
  progress: number;
  started_at: string;
}

interface GlasswingScannerProps {
  activeScan: ActiveScan | null;
  onLaunchScan: (config: ScanConfig) => void;
}

const TARGET_TYPES = [
  { id: 'repository', label: 'Source Repository', icon: Globe, placeholder: 'https://github.com/org/repo' },
  { id: 'binary', label: 'Binary Analysis', icon: Package, placeholder: '/opt/libs/target-binary' },
  { id: 'endpoint', label: 'Network Endpoint', icon: Wifi, placeholder: '10.0.0.0/24 or hostname:port' },
  { id: 'container', label: 'Container Image', icon: Container, placeholder: 'registry/image:tag' },
  { id: 'server', label: 'Server Instance', icon: Server, placeholder: 'server-hostname or IP' },
];

const SCAN_DEPTHS = [
  { id: 'quick', label: 'Quick Scan', desc: 'Surface-level analysis (~15 min)', color: 'text-emerald-400' },
  { id: 'standard', label: 'Standard Scan', desc: 'Balanced depth/speed (~2 hrs)', color: 'text-cyan-400' },
  { id: 'comprehensive', label: 'Deep Comprehensive', desc: 'Full autonomous analysis (~6 hrs)', color: 'text-amber-400' },
];

export default function GlasswingScanner({ activeScan, onLaunchScan }: GlasswingScannerProps) {
  const [config, setConfig] = useState<ScanConfig>({
    name: '',
    targetType: 'repository',
    target: '',
    depth: 'comprehensive',
    model: 'mythos-preview',
  });
  const [showTargetDropdown, setShowTargetDropdown] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
      ctx.scale(2, 2);
    };
    resize();

    const particles: { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; size: number }[] = [];
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;

    let frame = 0;
    const animate = () => {
      ctx.clearRect(0, 0, w, h);
      frame++;

      if (activeScan && frame % 3 === 0) {
        particles.push({
          x: Math.random() * w,
          y: h + 5,
          vx: (Math.random() - 0.5) * 1.5,
          vy: -Math.random() * 2 - 1,
          life: 0,
          maxLife: 60 + Math.random() * 40,
          size: Math.random() * 2 + 1,
        });
      }

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life++;
        const alpha = 1 - p.life / p.maxLife;
        if (alpha <= 0) { particles.splice(i, 1); continue; }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(6, 182, 212, ${alpha * 0.6})`;
        ctx.fill();
      }

      if (activeScan) {
        const scanY = h * (1 - (activeScan.progress / 100));
        ctx.beginPath();
        ctx.moveTo(0, scanY);
        for (let x = 0; x < w; x += 2) {
          ctx.lineTo(x, scanY + Math.sin((x + frame * 2) * 0.02) * 3);
        }
        ctx.strokeStyle = `rgba(6, 182, 212, ${0.3 + Math.sin(frame * 0.05) * 0.2})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      animFrameRef.current = requestAnimationFrame(animate);
    };
    animate();

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [activeScan]);

  const currentTargetType = TARGET_TYPES.find(t => t.id === config.targetType) || TARGET_TYPES[0];

  const handleLaunch = () => {
    if (!config.target) return;
    onLaunchScan({
      ...config,
      name: config.name || `${currentTargetType.label} Scan - ${new Date().toLocaleDateString()}`,
    });
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none opacity-40"
      />

      <div className="relative z-10 space-y-5">
        {activeScan && (
          <div className="bg-gradient-to-r from-cyan-950/50 to-slate-800/50 border border-cyan-500/30 rounded-xl p-5 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 rounded-full bg-cyan-400 animate-pulse" />
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-cyan-400 animate-ping" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">{activeScan.scan_name}</p>
                  <p className="text-xs text-slate-400">{activeScan.target_identifier}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-cyan-400 bg-cyan-950/50 px-2 py-1 rounded">
                  {activeScan.model_used}
                </span>
                <span className="text-lg font-bold text-white">{activeScan.progress}%</span>
              </div>
            </div>

            <div className="relative h-2 bg-slate-700/50 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                style={{
                  width: `${activeScan.progress}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #22d3ee, #06b6d4)',
                  backgroundSize: '200% 100%',
                  animation: 'shimmer 2s linear infinite',
                }}
              />
              <div
                className="absolute inset-y-0 left-0 rounded-full opacity-50 blur-sm"
                style={{
                  width: `${activeScan.progress}%`,
                  background: 'linear-gradient(90deg, #06b6d4, #22d3ee)',
                }}
              />
            </div>

            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-slate-500">
                {activeScan.status === 'scanning' ? 'Autonomous vulnerability analysis in progress...' :
                 activeScan.status === 'analyzing' ? 'Generating exploit feasibility assessments...' :
                 'Initializing model context...'}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                {activeScan.started_at ? `${Math.round((Date.now() - new Date(activeScan.started_at).getTime()) / 60000)}m elapsed` : ''}
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Scan Name (optional)</label>
              <input
                type="text"
                value={config.name}
                onChange={e => setConfig({ ...config, name: e.target.value })}
                placeholder="e.g. Production API Security Audit"
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Target Type</label>
              <div className="relative">
                <button
                  onClick={() => setShowTargetDropdown(!showTargetDropdown)}
                  className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white flex items-center justify-between hover:border-slate-600/50 transition-all"
                >
                  <div className="flex items-center gap-2">
                    <currentTargetType.icon className="w-4 h-4 text-cyan-400" />
                    <span>{currentTargetType.label}</span>
                  </div>
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                </button>
                {showTargetDropdown && (
                  <div className="absolute z-20 w-full mt-1 bg-slate-800 border border-slate-700/50 rounded-lg shadow-xl overflow-hidden">
                    {TARGET_TYPES.map(type => (
                      <button
                        key={type.id}
                        onClick={() => {
                          setConfig({ ...config, targetType: type.id });
                          setShowTargetDropdown(false);
                        }}
                        className="w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-slate-700/50 transition-colors"
                      >
                        <type.icon className="w-4 h-4 text-cyan-400" />
                        <span className={config.targetType === type.id ? 'text-cyan-400' : 'text-white'}>{type.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Target</label>
              <input
                type="text"
                value={config.target}
                onChange={e => setConfig({ ...config, target: e.target.value })}
                placeholder={currentTargetType.placeholder}
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all font-mono"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Scan Depth</label>
              <div className="space-y-2">
                {SCAN_DEPTHS.map(depth => (
                  <button
                    key={depth.id}
                    onClick={() => setConfig({ ...config, depth: depth.id })}
                    className={`w-full px-3 py-2.5 rounded-lg border text-left transition-all ${
                      config.depth === depth.id
                        ? 'border-cyan-500/50 bg-cyan-950/30'
                        : 'border-slate-700/30 bg-slate-800/30 hover:border-slate-600/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${config.depth === depth.id ? 'text-cyan-400' : 'text-white'}`}>
                        {depth.label}
                      </span>
                      {config.depth === depth.id && (
                        <div className="w-2 h-2 rounded-full bg-cyan-400" />
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{depth.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Model</label>
              <div className="flex gap-2">
                {['mythos-preview', 'opus', 'sonnet'].map(model => (
                  <button
                    key={model}
                    onClick={() => setConfig({ ...config, model })}
                    className={`flex-1 px-3 py-2 rounded-lg border text-xs font-mono transition-all ${
                      config.model === model
                        ? model === 'mythos-preview'
                          ? 'border-amber-500/50 bg-amber-950/30 text-amber-400'
                          : 'border-cyan-500/50 bg-cyan-950/30 text-cyan-400'
                        : 'border-slate-700/30 bg-slate-800/30 text-slate-400 hover:border-slate-600/50'
                    }`}
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-600">
            {config.model === 'mythos-preview' ? 'Mythos Preview: 83.1% CyberGym vulnerability reproduction rate' :
             config.model === 'opus' ? 'Opus 4.6: 66.6% CyberGym vulnerability reproduction rate' :
             'Sonnet: General purpose scanning'}
          </p>
          <button
            onClick={handleLaunch}
            disabled={!config.target || !!activeScan}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
              !config.target || !!activeScan
                ? 'bg-slate-700/50 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-600 to-teal-600 text-white hover:from-cyan-500 hover:to-teal-500 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/40'
            }`}
          >
            {activeScan ? (
              <>
                <Square className="w-4 h-4" />
                Scan in Progress
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Launch Glasswing Scan
              </>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
