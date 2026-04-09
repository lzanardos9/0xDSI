import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Camera, AlertTriangle, CheckCircle2, Clock, MapPin, Fingerprint, Shield, Radio, Lock, Crosshair, Wifi } from 'lucide-react';

interface CameraFeedModalProps {
  isOpen: boolean;
  onClose: () => void;
  node: {
    id: string;
    name: string;
    location: string;
    status: 'secure' | 'alert' | 'warning';
  } | null;
}

type ScanPhase = 'booting' | 'connecting' | 'streaming' | 'detecting' | 'tracking' | 'extracting' | 'comparing' | 'result';

const CameraFeedModal = ({ isOpen, onClose, node }: CameraFeedModalProps) => {
  const [phase, setPhase] = useState<ScanPhase>('booting');
  const [matchScore, setMatchScore] = useState(0);
  const [bootLines, setBootLines] = useState<string[]>([]);
  const [glitchActive, setGlitchActive] = useState(false);
  const [sirenFlash, setSirenFlash] = useState(false);
  const [faceBoxScale, setFaceBoxScale] = useState(0);
  const [extractProgress, setExtractProgress] = useState(0);
  const [biometricPoints, setBiometricPoints] = useState<{x: number; y: number; delay: number}[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const isAlert = node?.status === 'alert';
  const targetScore = isAlert ? 34 : 96;

  const generateBiometricPoints = useCallback(() => {
    const points = [];
    for (let i = 0; i < 24; i++) {
      points.push({
        x: 30 + Math.random() * 40,
        y: 15 + Math.random() * 50,
        delay: Math.random() * 800,
      });
    }
    setBiometricPoints(points);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      setPhase('booting');
      setMatchScore(0);
      setBootLines([]);
      setGlitchActive(false);
      setSirenFlash(false);
      setFaceBoxScale(0);
      setExtractProgress(0);
      return;
    }

    generateBiometricPoints();

    const bootSequence = [
      '[SYS] Initializing secure feed...',
      '[NET] Establishing encrypted tunnel...',
      '[CAM] Authenticating camera node...',
      '[VID] H.265 codec initialized',
      '[GPU] Neural engine loaded',
      '[AI ] Face detection model v4.2 ready',
      '[SYS] Stream active',
    ];

    let lineIdx = 0;
    const bootInterval = setInterval(() => {
      if (lineIdx < bootSequence.length) {
        setBootLines(prev => [...prev, bootSequence[lineIdx]]);
        lineIdx++;
      } else {
        clearInterval(bootInterval);
      }
    }, 200);

    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setPhase('connecting'), 400));
    timers.push(setTimeout(() => setPhase('streaming'), 1200));
    timers.push(setTimeout(() => {
      setPhase('detecting');
      setGlitchActive(true);
      setTimeout(() => setGlitchActive(false), 150);
    }, 2500));
    timers.push(setTimeout(() => {
      setPhase('tracking');
      let s = 0;
      const scaleInterval = setInterval(() => {
        s += 0.05;
        if (s >= 1) { s = 1; clearInterval(scaleInterval); }
        setFaceBoxScale(s);
      }, 20);
    }, 3200));
    timers.push(setTimeout(() => {
      setPhase('extracting');
      let p = 0;
      const extractInterval = setInterval(() => {
        p += 1.5;
        if (p >= 100) { p = 100; clearInterval(extractInterval); }
        setExtractProgress(p);
      }, 30);
    }, 4200));
    timers.push(setTimeout(() => {
      setPhase('comparing');
    }, 6500));
    timers.push(setTimeout(() => {
      setPhase('result');
      let score = 0;
      const scoreInterval = setInterval(() => {
        score += 1;
        if (score >= targetScore) {
          score = targetScore;
          clearInterval(scoreInterval);
          if (isAlert) {
            setSirenFlash(true);
            setGlitchActive(true);
            setTimeout(() => setGlitchActive(false), 300);
          }
        }
        setMatchScore(score);
      }, 20);
    }, 8000));

    return () => {
      clearInterval(bootInterval);
      timers.forEach(clearTimeout);
    };
  }, [isOpen, targetScore, isAlert, generateBiometricPoints]);

  useEffect(() => {
    if (!sirenFlash) return;
    const interval = setInterval(() => {
      setSirenFlash(prev => !prev);
    }, 500);
    return () => clearInterval(interval);
  }, [sirenFlash]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isOpen) return;
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

    const animate = () => {
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (!rect) { animRef.current = requestAnimationFrame(animate); return; }
      const w = rect.width;
      const h = rect.height;
      const now = Date.now();

      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < 80; i++) {
        ctx.fillStyle = `rgba(255, 255, 255, ${0.01 + Math.random() * 0.015})`;
        ctx.fillRect(0, (i / 80) * h, w, 1);
      }

      const scanY = ((now * 0.03) % h);
      const gradient = ctx.createLinearGradient(0, scanY - 20, 0, scanY + 20);
      gradient.addColorStop(0, 'rgba(34, 211, 238, 0)');
      gradient.addColorStop(0.5, 'rgba(34, 211, 238, 0.08)');
      gradient.addColorStop(1, 'rgba(34, 211, 238, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, scanY - 20, w, 40);

      if (Math.random() > 0.97) {
        const glitchY = Math.random() * h;
        const glitchH = 2 + Math.random() * 6;
        ctx.fillStyle = `rgba(34, 211, 238, ${0.05 + Math.random() * 0.08})`;
        ctx.fillRect(0, glitchY, w, glitchH);
      }

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < w; i += 60) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }
      for (let j = 0; j < h; j += 60) {
        ctx.beginPath();
        ctx.moveTo(0, j);
        ctx.lineTo(w, j);
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.12)';
      ctx.lineWidth = 0.5;
      const cx = w * 0.48;
      const cy = h * 0.42;
      ctx.beginPath();
      ctx.moveTo(cx - 15, cy);
      ctx.lineTo(cx + 15, cy);
      ctx.moveTo(cx, cy - 15);
      ctx.lineTo(cx, cy + 15);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(34, 211, 238, 0.06)';
      ctx.beginPath();
      ctx.arc(cx, cy, 40 + Math.sin(now * 0.002) * 5, 0, Math.PI * 2);
      ctx.stroke();

      const statusText = (() => {
        switch (phase) {
          case 'booting': return 'INITIALIZING...';
          case 'connecting': return 'CONNECTING...';
          case 'streaming': return 'LIVE FEED ACTIVE';
          case 'detecting': return 'FACE DETECTED';
          case 'tracking': return 'TRACKING TARGET';
          case 'extracting': return 'EXTRACTING BIOMETRICS';
          case 'comparing': return 'COMPARING DATABASE';
          case 'result': return isAlert ? 'MISMATCH DETECTED' : 'IDENTITY CONFIRMED';
        }
      })();

      ctx.fillStyle = phase === 'result' && isAlert ? '#ef4444' : '#22d3ee';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(statusText, 12, h - 12);

      const phaseIdx = ['booting', 'connecting', 'streaming', 'detecting', 'tracking', 'extracting', 'comparing', 'result'].indexOf(phase);
      const barW = 80;
      const barH = 3;
      const barX = 12;
      const barY = h - 22;
      ctx.fillStyle = 'rgba(51, 65, 85, 0.4)';
      ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(barX, barY, barW * ((phaseIdx + 1) / 8), barH);

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [isOpen, phase, isAlert]);

  if (!isOpen || !node) return null;

  const now = new Date();
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

  const accessLogs = [
    { time: '14:32:47', event: 'Badge scan detected', user: 'ID-4821', status: 'authorized' },
    { time: '14:32:45', event: 'Motion detected Zone B', user: 'N/A', status: 'info' },
    { time: '14:31:12', event: 'Door access granted', user: 'ID-4821', status: 'authorized' },
    { time: '14:28:55', event: isAlert ? 'Unauthorized access attempt' : 'Badge scan detected', user: isAlert ? 'UNKNOWN' : 'ID-3392', status: isAlert ? 'denied' : 'authorized' },
    { time: '14:25:03', event: 'Thermal anomaly cleared', user: 'System', status: 'info' },
    { time: '14:22:41', event: 'Perimeter check OK', user: 'System', status: 'authorized' },
    { time: '14:19:18', event: 'Tailgate attempt blocked', user: 'N/A', status: 'denied' },
    { time: '14:15:02', event: 'Badge scan detected', user: 'ID-7734', status: 'authorized' },
  ];

  const phaseNum = ['booting', 'connecting', 'streaming', 'detecting', 'tracking', 'extracting', 'comparing', 'result'].indexOf(phase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md" onClick={onClose}>
      {sirenFlash && phase === 'result' && isAlert && (
        <div className="absolute inset-0 bg-red-500/5 animate-pulse pointer-events-none" />
      )}

      <div
        className={`w-full max-w-6xl bg-[#060a14] border rounded-2xl shadow-2xl overflow-hidden transition-all duration-500 ${
          phase === 'result' && isAlert ? 'border-red-500/40 shadow-red-500/10' : 'border-slate-700/40 shadow-cyan-500/5'
        }`}
        onClick={e => e.stopPropagation()}
        style={{ animation: isOpen ? 'modalSlideIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)' : undefined }}
      >
        <style>{`
          @keyframes modalSlideIn { from { opacity: 0; transform: scale(0.95) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }
          @keyframes scanPulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
          @keyframes sirenRotate { 0% { box-shadow: -2px 0 15px rgba(239,68,68,0.4); } 50% { box-shadow: 2px 0 15px rgba(239,68,68,0.6); } 100% { box-shadow: -2px 0 15px rgba(239,68,68,0.4); } }
          @keyframes pointAppear { from { opacity: 0; transform: scale(0); } to { opacity: 1; transform: scale(1); } }
          @keyframes lineConnect { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
          @keyframes compareSlide { 0% { transform: translateX(-20px); opacity: 0; } 100% { transform: translateX(0); opacity: 1; } }
          @keyframes alertBorder { 0%, 100% { border-color: rgba(239,68,68,0.3); } 50% { border-color: rgba(239,68,68,0.7); } }
          @keyframes glitchShift { 0% { transform: translate(0); } 25% { transform: translate(2px, -1px); } 50% { transform: translate(-2px, 1px); } 75% { transform: translate(1px, 2px); } 100% { transform: translate(0); } }
        `}</style>

        <div className={`flex items-center justify-between px-5 py-2.5 border-b transition-colors duration-300 ${
          phase === 'result' && isAlert ? 'bg-red-950/30 border-red-500/20' : 'bg-[#080d1a] border-slate-800/40'
        }`}>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Camera className="w-5 h-5 text-cyan-400" />
              <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </div>
            <span className="text-slate-200 font-mono font-bold text-sm tracking-wide">{node.name}</span>
            <span className="text-slate-600">|</span>
            <MapPin className="w-3 h-3 text-slate-500" />
            <span className="text-slate-400 text-xs font-mono">{node.location}</span>
            <span className="text-slate-600">|</span>
            <Wifi className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400 text-[10px] font-mono">ENCRYPTED</span>
            <div className={`ml-3 px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider ${
              isAlert ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              node.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}
            style={isAlert && phase === 'result' ? { animation: 'alertBorder 1s infinite' } : undefined}
            >
              {isAlert && phase === 'result' ? 'ALERT - INTRUDER' : node.status.toUpperCase()}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
              <Radio className="w-3 h-3 text-red-400 animate-pulse" />
              <span className="text-red-400 text-[9px] font-mono font-bold">REC</span>
            </div>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors p-1 hover:bg-white/5 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-0">
          <div className="col-span-3 relative">
            <div className="relative aspect-video bg-black overflow-hidden" style={glitchActive ? { animation: 'glitchShift 0.1s linear infinite' } : undefined}>
              <img
                src="/datacenter-cctv.webp"
                alt="CCTV Feed"
                className={`w-full h-full object-cover transition-all duration-1000 ${
                  phaseNum < 2 ? 'opacity-0 scale-105' : 'opacity-90 scale-100'
                }`}
                style={{ filter: phaseNum < 2 ? 'brightness(0)' : glitchActive ? 'hue-rotate(90deg) contrast(1.3)' : 'none' }}
              />

              {phaseNum < 2 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 border-2 border-cyan-500/40 border-t-cyan-400 rounded-full animate-spin mb-4" />
                  <span className="text-cyan-400 text-xs font-mono animate-pulse">
                    {phase === 'booting' ? 'INITIALIZING SECURE FEED...' : 'ESTABLISHING ENCRYPTED TUNNEL...'}
                  </span>
                  <div className="mt-4 w-48 max-h-24 overflow-hidden">
                    {bootLines.map((line, i) => (
                      <div key={i} className="text-[9px] font-mono text-cyan-400/60 leading-relaxed">{line}</div>
                    ))}
                  </div>
                </div>
              )}

              <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

              {phaseNum >= 3 && (
                <div
                  className="absolute pointer-events-none transition-all duration-500"
                  style={{
                    left: '30%',
                    top: '12%',
                    width: '140px',
                    height: '180px',
                    transform: `scale(${faceBoxScale})`,
                    opacity: faceBoxScale,
                  }}
                >
                  <div
                    className="w-full h-full rounded-lg"
                    style={{
                      border: `2px solid ${isAlert && phase === 'result' ? 'rgba(239, 68, 68, 0.8)' : 'rgba(34, 211, 238, 0.7)'}`,
                      boxShadow: isAlert && phase === 'result'
                        ? '0 0 30px rgba(239,68,68,0.3), inset 0 0 30px rgba(239,68,68,0.05)'
                        : '0 0 30px rgba(34,211,238,0.2), inset 0 0 30px rgba(34,211,238,0.03)',
                      animation: phase === 'result' && isAlert ? 'alertBorder 1s infinite' : undefined,
                    }}
                  >
                    <div className="absolute -top-1 -left-1 w-4 h-4 border-t-2 border-l-2 rounded-tl" style={{ borderColor: isAlert && phase === 'result' ? '#ef4444' : '#22d3ee' }} />
                    <div className="absolute -top-1 -right-1 w-4 h-4 border-t-2 border-r-2 rounded-tr" style={{ borderColor: isAlert && phase === 'result' ? '#ef4444' : '#22d3ee' }} />
                    <div className="absolute -bottom-1 -left-1 w-4 h-4 border-b-2 border-l-2 rounded-bl" style={{ borderColor: isAlert && phase === 'result' ? '#ef4444' : '#22d3ee' }} />
                    <div className="absolute -bottom-1 -right-1 w-4 h-4 border-b-2 border-r-2 rounded-br" style={{ borderColor: isAlert && phase === 'result' ? '#ef4444' : '#22d3ee' }} />

                    <div className="absolute -top-6 left-0 right-0 text-center">
                      <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                        phase === 'result'
                          ? isAlert ? 'text-red-400 bg-red-500/20' : 'text-emerald-400 bg-emerald-500/20'
                          : 'text-cyan-400 bg-cyan-500/20'
                      }`}>
                        {phase === 'detecting' ? 'FACE DETECTED' :
                         phase === 'tracking' ? 'LOCKING ON...' :
                         phase === 'extracting' ? `EXTRACTING ${Math.round(extractProgress)}%` :
                         phase === 'comparing' ? 'COMPARING...' :
                         phase === 'result' ? (isAlert ? 'MISMATCH' : 'VERIFIED') : ''}
                      </span>
                    </div>

                    {phaseNum >= 5 && biometricPoints.map((pt, i) => (
                      <div
                        key={i}
                        className="absolute w-1 h-1 rounded-full"
                        style={{
                          left: `${pt.x}%`,
                          top: `${pt.y}%`,
                          backgroundColor: isAlert && phase === 'result' ? '#ef4444' : '#22d3ee',
                          animation: `pointAppear 0.3s ${pt.delay}ms both`,
                          boxShadow: `0 0 4px ${isAlert && phase === 'result' ? '#ef4444' : '#22d3ee'}`,
                        }}
                      />
                    ))}

                    {phaseNum >= 5 && (
                      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
                        {biometricPoints.slice(0, 12).map((pt, i) => {
                          const nextPt = biometricPoints[(i + 1) % 12];
                          return (
                            <line
                              key={i}
                              x1={pt.x} y1={pt.y}
                              x2={nextPt.x} y2={nextPt.y}
                              stroke={isAlert && phase === 'result' ? 'rgba(239,68,68,0.3)' : 'rgba(34,211,238,0.2)'}
                              strokeWidth="0.3"
                              strokeDasharray="4 3"
                              style={{ animation: `lineConnect 0.5s ${pt.delay + 300}ms both` }}
                            />
                          );
                        })}
                      </svg>
                    )}
                  </div>
                </div>
              )}

              <div className="absolute top-3 left-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white/70 text-[10px] font-mono">REC</span>
                <span className="text-white/40 text-[10px] font-mono">{node.name}</span>
              </div>
              <div className="absolute top-3 right-3 text-right">
                <div className="text-white/50 text-[10px] font-mono">{timestamp}</div>
                <div className="text-white/30 text-[8px] font-mono mt-0.5">PTZ: 045.2 / -12.8</div>
              </div>
              <div className="absolute bottom-3 left-3 flex items-center gap-3">
                <span className="text-white/40 text-[10px] font-mono">1920x1080 | 30fps | H.265</span>
                <span className="text-cyan-400/50 text-[10px] font-mono">| AI ENHANCED</span>
              </div>
              <div className="absolute bottom-3 right-3">
                <Lock className="w-3 h-3 text-emerald-500/50" />
              </div>
            </div>
          </div>

          <div className="col-span-2 border-l border-slate-800/40 flex flex-col bg-[#070b16]">
            <div className="p-4 border-b border-slate-800/30">
              <div className="flex items-center justify-center gap-2 mb-4">
                <Fingerprint className={`w-4 h-4 ${phase === 'result' && isAlert ? 'text-red-400' : 'text-cyan-400'}`} />
                <span className="text-slate-300 text-xs font-mono font-bold tracking-[0.2em]">BIOMETRIC ANALYSIS</span>
              </div>

              <div className="flex items-start justify-center gap-3">
                <div className="flex flex-col items-center" style={phaseNum >= 5 ? { animation: 'compareSlide 0.5s both' } : { opacity: phaseNum >= 3 ? 1 : 0.3 }}>
                  <div className={`relative w-[88px] h-[88px] rounded-lg overflow-hidden border-2 transition-all duration-500 ${
                    phase === 'result'
                      ? isAlert ? 'border-red-500/70 shadow-lg shadow-red-500/20' : 'border-emerald-500/70 shadow-lg shadow-emerald-500/20'
                      : 'border-cyan-500/40'
                  }`}>
                    <img
                      src="/datacenter-cctv.webp"
                      alt="Captured"
                      className="w-full h-full object-cover"
                      style={{ objectPosition: '38% 18%', transform: 'scale(2.8)' }}
                    />
                    {phaseNum >= 5 && phaseNum < 7 && (
                      <div className="absolute inset-0 bg-cyan-500/10" style={{ animation: 'scanPulse 1s infinite' }} />
                    )}
                    <div className="absolute inset-0 border border-white/5 rounded-lg" />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 mt-1.5 tracking-wider">CAPTURED</span>
                  {phaseNum >= 3 && (
                    <span className="text-[8px] font-mono text-slate-600 mt-0.5">14:32:47 UTC</span>
                  )}
                </div>

                <div className="flex flex-col items-center justify-center pt-4 min-w-[80px]">
                  {phaseNum < 7 ? (
                    <div className="flex flex-col items-center gap-1">
                      <Crosshair className="w-5 h-5 text-cyan-400 animate-spin" style={{ animationDuration: '3s' }} />
                      <span className="text-[9px] font-mono text-cyan-400/60">
                        {phase === 'detecting' ? 'DETECTING' :
                         phase === 'tracking' ? 'TRACKING' :
                         phase === 'extracting' ? 'EXTRACTING' :
                         phase === 'comparing' ? 'COMPARING' : 'WAITING'}
                      </span>
                      {phase === 'extracting' && (
                        <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden mt-1">
                          <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${extractProgress}%` }} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1">
                      <div className={`text-3xl font-mono font-black tracking-tight ${
                        matchScore > 80 ? 'text-emerald-400' : matchScore > 50 ? 'text-yellow-400' : 'text-red-400'
                      }`}>
                        {matchScore}%
                      </div>
                      <span className={`text-[9px] font-mono font-bold tracking-wider ${
                        isAlert ? 'text-red-400' : 'text-emerald-400'
                      }`}>
                        {isAlert ? 'NO MATCH' : 'MATCHED'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center" style={phaseNum >= 6 ? { animation: 'compareSlide 0.5s both' } : { opacity: 0.3 }}>
                  <div className={`relative w-[88px] h-[88px] rounded-lg overflow-hidden border-2 transition-all duration-500 ${
                    phase === 'result'
                      ? isAlert ? 'border-red-500/40' : 'border-emerald-500/70 shadow-lg shadow-emerald-500/20'
                      : 'border-slate-600/40'
                  }`}>
                    <img
                      src="/badge-photo-authorized.webp"
                      alt="Badge Photo"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 border border-white/5 rounded-lg" />
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 mt-1.5 tracking-wider">BADGE PHOTO</span>
                  <span className="text-[8px] font-mono text-slate-600 mt-0.5">ID-4821</span>
                </div>
              </div>

              {phase === 'result' && (
                <div className={`mt-4 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
                  isAlert
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}
                style={isAlert ? { animation: 'alertBorder 1.5s infinite, sirenRotate 2s infinite' } : undefined}
                >
                  {isAlert ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                      <span className="text-red-400 text-xs font-mono font-bold tracking-wider">IDENTITY MISMATCH -- ALERT RAISED</span>
                      <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-mono font-bold tracking-wider">IDENTITY VERIFIED -- AUTHORIZED</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {phase === 'result' && isAlert && (
              <div className="px-4 py-2.5 border-b border-red-500/20 bg-red-950/20">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-[9px] font-mono text-red-400/60">LOCKDOWN</div>
                    <div className="text-[11px] font-mono font-bold text-red-400">INITIATED</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-red-400/60">SEC TEAM</div>
                    <div className="text-[11px] font-mono font-bold text-orange-400">DISPATCHED</div>
                  </div>
                  <div>
                    <div className="text-[9px] font-mono text-red-400/60">DOOR</div>
                    <div className="text-[11px] font-mono font-bold text-red-400">SEALED</div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-hidden p-4">
              <div className="flex items-center gap-2 mb-2.5">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400 text-[10px] font-mono font-bold tracking-[0.15em]">ACCESS LOG</span>
                <div className="flex-1 h-px bg-slate-800/50" />
              </div>
              <div className="space-y-1.5 max-h-[230px] overflow-y-auto custom-scrollbar pr-1">
                {accessLogs.map((log, i) => (
                  <div key={i} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-[10px] font-mono border transition-all ${
                    log.status === 'denied' ? 'bg-red-500/5 border-red-500/20 text-red-300' :
                    log.status === 'authorized' ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-300' :
                    'bg-slate-500/5 border-slate-700/20 text-slate-400'
                  }`}
                  style={{ animation: `compareSlide 0.3s ${i * 50}ms both` }}
                  >
                    <span className="text-slate-600 w-14 flex-shrink-0">{log.time}</span>
                    <span className="flex-1 truncate">{log.event}</span>
                    <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[9px] font-bold ${
                      log.status === 'denied' ? 'bg-red-500/20 text-red-400' :
                      log.status === 'authorized' ? 'bg-emerald-500/15 text-emerald-400' :
                      'bg-slate-600/20 text-slate-500'
                    }`}>
                      {log.user}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-4 py-2.5 border-t border-slate-800/30 bg-[#060a14]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Shield className="w-3 h-3 text-cyan-400/60" />
                  <span className="text-[9px] font-mono text-slate-600">0xDSI LAKEWATCH v4.2.1</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[9px] font-mono text-slate-600">FEED LATENCY: 12ms</span>
                  <span className="text-[9px] font-mono text-emerald-500/60">AES-256</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraFeedModal;
