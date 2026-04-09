import { useEffect, useRef, useState } from 'react';
import { Satellite, Radio, Activity, Zap, Volume2, VolumeX } from 'lucide-react';

interface SignalEvent {
  id: string;
  timestamp: string;
  source: string;
  targetFreq: string;
  type: 'NETFLOW' | 'DNS_ANALYSIS' | 'PAYLOAD_INSPECTION' | 'ANOMALY_DETECTION';
  classification: string;
  signal: string;
  bearing: string;
  strength: number;
  content: string;
  status: 'active' | 'recorded' | 'analyzed' | 'disseminated';
  priority: 'flash' | 'immediate' | 'priority' | 'routine';
}

const MOCK_SIGNALS: SignalEvent[] = [
  { id: 'NET-7741', timestamp: '14:47:22', source: 'NDR-SENSOR-01', targetFreq: '443/TCP', type: 'NETFLOW', classification: 'RESTRICTED', signal: 'Encrypted C2 beacon - suspicious outbound traffic pattern', bearing: 'VLAN 47 - Server Segment', strength: 87, content: 'Anomalous encrypted outbound traffic detected. Duration: 14.2s intervals. TLS fingerprint matches known malware family. Destination IP correlates with threat intel IOC feed.', status: 'active', priority: 'flash' },
  { id: 'NET-7742', timestamp: '14:44:08', source: 'DNS-FIREWALL-NW', targetFreq: '53/UDP', type: 'DNS_ANALYSIS', classification: 'RESTRICTED', signal: 'DNS tunneling attempt - high-entropy subdomain queries', bearing: 'VLAN 12 - Corporate LAN', strength: 62, content: 'Suspicious DNS query pattern detected. High entropy subdomain names indicative of DNS tunneling. 847 unique subdomains queried in 10 minutes. Forwarded to threat analysis.', status: 'recorded', priority: 'immediate' },
  { id: 'NET-7743', timestamp: '14:41:55', source: 'IDS-SENSOR-03', targetFreq: '8080/TCP', type: 'PAYLOAD_INSPECTION', classification: 'INTERNAL', signal: 'SQL injection attempt - web application firewall alert', bearing: 'DMZ - Web Servers', strength: 94, content: 'SQL injection payload detected in POST request to /api/auth endpoint. Attack signature matches automated scanning tool. Source IP: external cloud provider.', status: 'analyzed', priority: 'flash' },
  { id: 'NET-7744', timestamp: '14:38:33', source: 'PCAP-ENGINE-ATL', targetFreq: '4443/TCP', type: 'ANOMALY_DETECTION', classification: 'RESTRICTED', signal: 'Lateral movement pattern - internal reconnaissance', bearing: 'VLAN 88 - Development Segment', strength: 41, content: 'Probable lateral movement detected. Single workstation scanning sequential internal IPs on management ports. Behavior consistent with post-exploitation reconnaissance. Speed: 8 hosts/second.', status: 'active', priority: 'immediate' },
  { id: 'NET-7745', timestamp: '14:35:19', source: 'IPS-INLINE-02', targetFreq: '445/TCP', type: 'PAYLOAD_INSPECTION', classification: 'INTERNAL', signal: 'SMB exploit attempt - EternalBlue variant detected', bearing: 'VLAN 22 - Legacy Systems', strength: 78, content: 'SMB exploit attempt captured. Payload analysis indicates EternalBlue variant targeting unpatched Windows systems. Attack blocked by IPS inline.', status: 'disseminated', priority: 'priority' },
  { id: 'NET-7746', timestamp: '14:30:02', source: 'NDR-SENSOR-EU', targetFreq: '22/TCP', type: 'NETFLOW', classification: 'INTERNAL', signal: 'Anomalous SSH session - data exfiltration indicator', bearing: 'VLAN 55 - Database Segment', strength: 55, content: 'Unusual SSH session with high data transfer volume to external IP. Session duration and volume inconsistent with normal admin activity. Correlated with watchlisted user account.', status: 'analyzed', priority: 'priority' },
];

const typeColors: Record<string, string> = {
  NETFLOW: '#22d3ee',
  DNS_ANALYSIS: '#f97316',
  PAYLOAD_INSPECTION: '#a855f7',
  ANOMALY_DETECTION: '#10b981',
};

const priorityColors: Record<string, { bg: string; text: string; border: string }> = {
  flash: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
  immediate: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
  priority: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20' },
  routine: { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/20' },
};

const NetworkSignalMonitor = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const [selectedSignal, setSelectedSignal] = useState<SignalEvent | null>(null);
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
      const labels = ['NETFLOW', 'DNS', 'ANOMALY', 'CRITICAL'];
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
            <span className="text-blue-400 text-[10px] font-mono font-bold tracking-wider">NETWORK SIGNAL MONITOR</span>
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
          <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">SIGNAL EVENT LOG</span>
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
          {MOCK_SIGNALS.map(ic => {
            const pc = priorityColors[ic.priority];
            const tc = typeColors[ic.type];
            const isSelected = selectedSignal?.id === ic.id;
            return (
              <div
                key={ic.id}
                className={`px-4 py-2.5 hover:bg-white/2 cursor-pointer transition-colors ${ic.priority === 'flash' ? 'bg-red-500/3' : ''}`}
                onClick={() => setSelectedSignal(isSelected ? null : ic)}
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
                        <div className="text-[7px] font-mono text-slate-600">PORT/PROTOCOL</div>
                        <div className="text-[10px] font-mono text-slate-300">{ic.targetFreq}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">NETWORK SEGMENT</div>
                        <div className="text-[10px] font-mono text-emerald-400">{ic.bearing}</div>
                      </div>
                      <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                        <div className="text-[7px] font-mono text-slate-600">CLASSIFICATION</div>
                        <div className="text-[10px] font-mono text-red-400">{ic.classification}</div>
                      </div>
                    </div>
                    <div className="bg-black/40 rounded p-3 border border-slate-800/30">
                      <div className="text-[7px] font-mono text-slate-600 mb-1">SIGNAL ANALYSIS</div>
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

export default NetworkSignalMonitor;
