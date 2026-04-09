import { useState, useEffect, useRef } from 'react';
import { X, Camera, AlertTriangle, CheckCircle2, Clock, MapPin, Fingerprint, ScanLine } from 'lucide-react';

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

const CameraFeedModal = ({ isOpen, onClose, node }: CameraFeedModalProps) => {
  const [scanPhase, setScanPhase] = useState<'scanning' | 'analyzing' | 'complete'>('scanning');
  const [matchScore, setMatchScore] = useState(0);
  const [scanLineY, setScanLineY] = useState(0);
  const scanInterval = useRef<ReturnType<typeof setInterval>>();
  const isAlert = node?.status === 'alert';
  const targetScore = isAlert ? 34 : 96;

  useEffect(() => {
    if (!isOpen) {
      setScanPhase('scanning');
      setMatchScore(0);
      setScanLineY(0);
      return;
    }

    let y = 0;
    scanInterval.current = setInterval(() => {
      y += 2;
      if (y > 100) y = 0;
      setScanLineY(y);
    }, 30);

    const t1 = setTimeout(() => setScanPhase('analyzing'), 2000);
    const t2 = setTimeout(() => {
      setScanPhase('complete');
      let score = 0;
      const scoreInterval = setInterval(() => {
        score += 2;
        if (score >= targetScore) {
          score = targetScore;
          clearInterval(scoreInterval);
        }
        setMatchScore(score);
      }, 30);
    }, 3500);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      if (scanInterval.current) clearInterval(scanInterval.current);
    };
  }, [isOpen, targetScore]);

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
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-5xl bg-[#0a0e18] border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-3 bg-[#0c1020] border-b border-slate-800/50">
          <div className="flex items-center gap-3">
            <Camera className="w-5 h-5 text-cyan-400" />
            <span className="text-slate-200 font-mono font-bold text-sm">{node.name}</span>
            <span className="text-slate-500 text-xs font-mono">|</span>
            <MapPin className="w-3 h-3 text-slate-500" />
            <span className="text-slate-400 text-xs font-mono">{node.location}</span>
            <div className={`ml-3 px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
              isAlert ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              node.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {node.status.toUpperCase()}
            </div>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-5 gap-0">
          <div className="col-span-3 relative">
            <div className="relative aspect-video bg-black overflow-hidden">
              <img
                src="/datacenter-cctv.webp"
                alt="CCTV Feed"
                className="w-full h-full object-cover opacity-90"
              />

              <div className="absolute inset-0 pointer-events-none">
                {Array.from({ length: 40 }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-full h-px bg-white/[0.02]"
                    style={{ top: `${(i / 40) * 100}%` }}
                  />
                ))}
              </div>

              <div
                className="absolute left-0 right-0 h-[2px] pointer-events-none transition-none"
                style={{
                  top: `${scanLineY}%`,
                  background: scanPhase === 'scanning'
                    ? 'linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.6), transparent)'
                    : 'transparent',
                  boxShadow: scanPhase === 'scanning' ? '0 0 20px rgba(34, 211, 238, 0.3)' : 'none',
                }}
              />

              {scanPhase !== 'scanning' && (
                <div className="absolute top-[20%] left-[35%] w-[120px] h-[160px] border-2 rounded-lg animate-pulse pointer-events-none"
                  style={{
                    borderColor: isAlert ? 'rgba(239, 68, 68, 0.7)' : 'rgba(34, 211, 238, 0.7)',
                    boxShadow: isAlert ? '0 0 20px rgba(239,68,68,0.3)' : '0 0 20px rgba(34,211,238,0.3)',
                  }}
                >
                  <div className="absolute -top-5 left-0 right-0 text-center">
                    <span className={`text-[10px] font-mono font-bold ${isAlert ? 'text-red-400' : 'text-cyan-400'}`}>
                      {scanPhase === 'analyzing' ? 'ANALYZING...' : isAlert ? 'MISMATCH' : 'MATCH FOUND'}
                    </span>
                  </div>
                  <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 rounded-tl" style={{ borderColor: isAlert ? '#ef4444' : '#22d3ee' }} />
                  <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 rounded-tr" style={{ borderColor: isAlert ? '#ef4444' : '#22d3ee' }} />
                  <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 rounded-bl" style={{ borderColor: isAlert ? '#ef4444' : '#22d3ee' }} />
                  <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 rounded-br" style={{ borderColor: isAlert ? '#ef4444' : '#22d3ee' }} />
                </div>
              )}

              <div className="absolute top-2 left-3 flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-white/70 text-[10px] font-mono">REC</span>
                <span className="text-white/50 text-[10px] font-mono">{node.name}</span>
              </div>
              <div className="absolute top-2 right-3">
                <span className="text-white/50 text-[10px] font-mono">{timestamp}</span>
              </div>
              <div className="absolute bottom-2 left-3">
                <span className="text-white/40 text-[10px] font-mono">1920x1080 | 30fps | H.265</span>
              </div>
            </div>
          </div>

          <div className="col-span-2 p-4 border-l border-slate-800/50 flex flex-col gap-4">
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Fingerprint className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-300 text-xs font-mono font-bold tracking-wider">FACE RECOGNITION</span>
              </div>

              <div className="flex items-center justify-center gap-4 mb-3">
                <div className="relative">
                  <div className={`w-20 h-20 rounded-lg border-2 overflow-hidden ${isAlert ? 'border-red-500/50' : 'border-cyan-500/50'}`}>
                    <img src="/datacenter-cctv.webp" alt="Captured" className="w-full h-full object-cover object-[35%_20%] scale-[2.5]" />
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1 text-center">CAPTURED</div>
                </div>

                <div className="flex flex-col items-center gap-1">
                  <ScanLine className={`w-5 h-5 ${scanPhase === 'complete' ? (isAlert ? 'text-red-400' : 'text-emerald-400') : 'text-cyan-400 animate-pulse'}`} />
                  <span className={`text-lg font-mono font-bold ${
                    scanPhase !== 'complete' ? 'text-cyan-400' : isAlert ? 'text-red-400' : 'text-emerald-400'
                  }`}>
                    {matchScore}%
                  </span>
                </div>

                <div className="relative">
                  <div className={`w-20 h-20 rounded-lg border-2 overflow-hidden ${isAlert ? 'border-red-500/50' : 'border-emerald-500/50'}`}>
                    <img src="/badge-photo-authorized.webp" alt="Authorized" className="w-full h-full object-cover" />
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1 text-center">BADGE PHOTO</div>
                </div>
              </div>

              {scanPhase === 'complete' && (
                <div className={`flex items-center justify-center gap-2 px-3 py-2 rounded-lg border ${
                  isAlert
                    ? 'bg-red-500/10 border-red-500/30'
                    : 'bg-emerald-500/10 border-emerald-500/30'
                }`}>
                  {isAlert ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-red-400 text-xs font-mono font-bold">IDENTITY MISMATCH - ALERT RAISED</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400 text-xs font-mono font-bold">IDENTITY VERIFIED - AUTHORIZED</span>
                    </>
                  )}
                </div>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-slate-500" />
                <span className="text-slate-400 text-[10px] font-mono font-bold tracking-wider">ACCESS LOG</span>
              </div>
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto custom-scrollbar pr-1">
                {accessLogs.map((log, i) => (
                  <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded text-[10px] font-mono border ${
                    log.status === 'denied' ? 'bg-red-500/5 border-red-500/20 text-red-300' :
                    log.status === 'authorized' ? 'bg-emerald-500/5 border-emerald-500/15 text-emerald-300' :
                    'bg-slate-500/5 border-slate-700/30 text-slate-400'
                  }`}>
                    <span className="text-slate-600 w-12 flex-shrink-0">{log.time}</span>
                    <span className="flex-1 truncate">{log.event}</span>
                    <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      log.status === 'denied' ? 'bg-red-500/20 text-red-400' :
                      log.status === 'authorized' ? 'bg-emerald-500/20 text-emerald-400' :
                      'bg-slate-600/20 text-slate-500'
                    }`}>
                      {log.user}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CameraFeedModal;
