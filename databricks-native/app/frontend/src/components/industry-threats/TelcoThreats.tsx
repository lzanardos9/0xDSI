import { useState, useEffect, useRef } from 'react';
import {
  Radio, Phone, Wifi, Signal, AlertTriangle, Shield, Activity, MapPin,
  Users, Zap, Eye, TrendingUp, Clock, ChevronRight, Target, Lock
} from 'lucide-react';

interface SSEvent {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  source: string;
  timestamp: string;
  protocol: string;
  indicator: string;
}

interface SimSwapAttempt {
  id: string;
  msisdn: string;
  targetIMSI: string;
  sourceNode: string;
  attackType: string;
  status: 'blocked' | 'detected' | 'investigating';
  riskScore: number;
  timestamp: string;
  geoOrigin: string;
}

interface FraudRing {
  id: string;
  name: string;
  members: number;
  revenue_loss: string;
  technique: string;
  confidence: number;
  status: 'active' | 'disrupted' | 'monitoring';
  countries: string[];
}

const SS7_EVENTS: SSEvent[] = [
  { id: 'ss7-001', type: 'SendRoutingInfo Intercept', severity: 'critical', description: 'Unauthorized SRI query intercepting subscriber location via GT spoofing from non-roaming partner', source: 'GT: +49-176-HLR', timestamp: '2s ago', protocol: 'MAP', indicator: 'Category A Breach' },
  { id: 'ss7-002', type: 'InsertSubscriberData Injection', severity: 'critical', description: 'ISD command injecting call forwarding to external MSRN, bypassing HLR validation', source: 'GT: +7-495-MSC', timestamp: '8s ago', protocol: 'MAP', indicator: 'Subscriber Hijack' },
  { id: 'ss7-003', type: 'ProvideSubscriberInfo Abuse', severity: 'high', description: 'PSI query chain from unregistered STP harvesting subscriber IMEI and cell-ID data', source: 'STP: AS-54291', timestamp: '15s ago', protocol: 'MAP', indicator: 'Location Tracking' },
  { id: 'ss7-004', type: 'SendAuthInfo Extraction', severity: 'critical', description: 'SAI request extracting Ki/OPc triplets for IMSI cloning via compromised roaming hub', source: 'GT: +234-MSC', timestamp: '23s ago', protocol: 'MAP', indicator: 'Auth Vector Theft' },
  { id: 'ss7-005', type: 'Diameter S6a Manipulation', severity: 'high', description: 'Authentication-Information-Request with spoofed PLMN-ID targeting 5G SA core HSS', source: 'PLMN: 310-260', timestamp: '31s ago', protocol: 'Diameter', indicator: '5G Core Attack' },
  { id: 'ss7-006', type: 'GTP-C Tunnel Hijack', severity: 'critical', description: 'CreatePDPContext with stolen TEID redirecting user-plane through rogue PGW', source: 'SGSN: 10.44.2.1', timestamp: '45s ago', protocol: 'GTP-C', indicator: 'Data Intercept' },
  { id: 'ss7-007', type: 'CAMEL TDP Manipulation', severity: 'high', description: 'InitialDP trigger modification allowing toll-free bypass on international trunk routes', source: 'SCP: GT-US', timestamp: '52s ago', protocol: 'CAMEL', indicator: 'Revenue Fraud' },
  { id: 'ss7-008', type: 'RANAP Paging Flood', severity: 'medium', description: 'Mass paging requests causing RNC signaling congestion across 47 NodeBs', source: 'RNC: 0x1A3F', timestamp: '1m ago', protocol: 'RANAP', indicator: 'DoS Attack' },
];

const SIM_SWAP_ATTEMPTS: SimSwapAttempt[] = [
  { id: 'sw-001', msisdn: '+1-202-***-7834', targetIMSI: '310260...4521', sourceNode: 'API-Gateway-East', attackType: 'Social Engineering + Insider', status: 'blocked', riskScore: 97, timestamp: '34s ago', geoOrigin: 'Lagos, Nigeria' },
  { id: 'sw-002', msisdn: '+44-7***-892341', targetIMSI: '234150...8872', sourceNode: 'Retail-POS-112', attackType: 'Credential Stuffing', status: 'detected', riskScore: 89, timestamp: '2m ago', geoOrigin: 'London, UK' },
  { id: 'sw-003', msisdn: '+55-11-9****-6723', targetIMSI: '724110...3345', sourceNode: 'MVNO-Partner-BR', attackType: 'OTA SMS Exploit', status: 'investigating', riskScore: 94, timestamp: '4m ago', geoOrigin: 'Sao Paulo, Brazil' },
  { id: 'sw-004', msisdn: '+91-98***-45612', targetIMSI: '404450...9901', sourceNode: 'BSS-Portal-Admin', attackType: 'Insider Threat + API Abuse', status: 'blocked', riskScore: 98, timestamp: '7m ago', geoOrigin: 'Mumbai, India' },
  { id: 'sw-005', msisdn: '+49-151-***-2298', targetIMSI: '262020...1156', sourceNode: 'eSIM-Provisioning', attackType: 'QR Code Intercept + MITM', status: 'detected', riskScore: 85, timestamp: '11m ago', geoOrigin: 'Berlin, Germany' },
];

const FRAUD_RINGS: FraudRing[] = [
  { id: 'fr-001', name: 'Wangiri 2.0 Syndicate', members: 47, revenue_loss: '$2.3M/month', technique: 'AI-generated voicemail + premium rate callback via satellite trunk', confidence: 94, status: 'active', countries: ['Philippines', 'Latvia', 'Cuba'] },
  { id: 'fr-002', name: 'IRSF Ghost Network', members: 23, revenue_loss: '$890K/month', technique: 'International Revenue Share Fraud via rogue micro-operators on leased numbering ranges', confidence: 88, status: 'monitoring', countries: ['Somalia', 'Comoros', 'Sierra Leone'] },
  { id: 'fr-003', name: 'SIM Box Cartel - West Africa', members: 156, revenue_loss: '$5.1M/month', technique: 'GSM gateway farms with AI-powered CDR pattern randomization evading FMS', confidence: 97, status: 'active', countries: ['Nigeria', 'Ghana', 'Cameroon'] },
  { id: 'fr-004', name: 'A2P Grey Route Operators', members: 34, revenue_loss: '$1.7M/month', technique: 'Bulk SMS injection via compromised SS7 SCCP connections bypassing A2P firewalls', confidence: 91, status: 'disrupted', countries: ['Bangladesh', 'Indonesia', 'Vietnam'] },
  { id: 'fr-005', name: 'Subscription Fraud Ring EU', members: 19, revenue_loss: '$340K/month', technique: 'Synthetic identity + deepfake KYC bypass for device financing fraud', confidence: 86, status: 'active', countries: ['Romania', 'Poland', 'Spain'] },
];

const NETWORK_METRICS = [
  { label: 'SS7 Anomalies / hr', value: '2,847', trend: '+12%', color: 'text-red-400' },
  { label: 'Diameter Threats', value: '1,203', trend: '+8%', color: 'text-orange-400' },
  { label: 'SIM Swaps Blocked', value: '89', trend: '-23%', color: 'text-emerald-400' },
  { label: 'Fraud Loss Prevented', value: '$4.7M', trend: '+67%', color: 'text-cyan-400' },
  { label: '5G SA Core Events', value: '456', trend: '+34%', color: 'text-amber-400' },
  { label: 'Roaming Anomalies', value: '178', trend: '-5%', color: 'text-blue-400' },
];

const sevColor = (s: string) => {
  if (s === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'high') return 'bg-orange-500/10 text-orange-400 border-orange-500/30';
  if (s === 'medium') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-green-500/10 text-green-400 border-green-500/30';
};

export default function TelcoThreats() {
  const [tab, setTab] = useState<'ss7' | 'simswap' | 'fraud' | 'signaling'>('ss7');
  const [liveEvents, setLiveEvents] = useState(SS7_EVENTS);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveEvents(prev => {
        const shifted = [...prev];
        const first = shifted.shift()!;
        first.timestamp = 'just now';
        shifted.push(first);
        return shifted;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Signaling flow animation
  useEffect(() => {
    if (tab !== 'signaling') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.parentElement!.clientWidth;
    const H = canvas.height = 400;
    let frame = 0;

    const nodes = [
      { x: 80, y: 60, label: 'UE', color: '#67E8F9' },
      { x: 240, y: 60, label: 'gNB', color: '#34D399' },
      { x: 400, y: 60, label: 'AMF', color: '#F59E0B' },
      { x: 560, y: 60, label: 'SMF', color: '#FB923C' },
      { x: 720, y: 60, label: 'UPF', color: '#A78BFA' },
      { x: 400, y: 200, label: 'AUSF', color: '#F87171' },
      { x: 240, y: 200, label: 'UDM', color: '#60A5FA' },
      { x: 560, y: 200, label: 'PCF', color: '#34D399' },
      { x: 400, y: 340, label: 'ATTACKER', color: '#EF4444' },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // connections
      const conns = [[0,1],[1,2],[2,3],[3,4],[2,5],[5,6],[3,7]];
      conns.forEach(([a, b]) => {
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
      });

      // attack lines with pulse
      const attackConns = [[8,5],[8,6],[8,2]];
      attackConns.forEach(([a, b], i) => {
        const progress = ((frame + i * 30) % 120) / 120;
        ctx.strokeStyle = `rgba(239, 68, 68, ${0.3 + Math.sin(progress * Math.PI) * 0.4})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(nodes[a].x, nodes[a].y);
        ctx.lineTo(nodes[b].x, nodes[b].y);
        ctx.stroke();
        ctx.setLineDash([]);

        const px = nodes[a].x + (nodes[b].x - nodes[a].x) * progress;
        const py = nodes[a].y + (nodes[b].y - nodes[a].y) * progress;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#EF4444';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 8, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fill();
      });

      // signal pulses on normal connections
      conns.forEach(([a, b], i) => {
        const progress = ((frame + i * 20) % 80) / 80;
        const px = nodes[a].x + (nodes[b].x - nodes[a].x) * progress;
        const py = nodes[a].y + (nodes[b].y - nodes[a].y) * progress;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#67E8F9';
        ctx.fill();
      });

      // nodes
      nodes.forEach(n => {
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.label === 'ATTACKER' ? 22 : 18, 0, Math.PI * 2);
        ctx.fillStyle = n.label === 'ATTACKER' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(30, 41, 59, 0.8)';
        ctx.fill();
        ctx.strokeStyle = n.color;
        ctx.lineWidth = n.label === 'ATTACKER' ? 2.5 : 1.5;
        ctx.stroke();
        ctx.fillStyle = n.color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(n.label, n.x, n.y + 4);
      });

      frame++;
      requestAnimationFrame(draw);
    };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tab]);

  const TABS = [
    { id: 'ss7' as const, label: 'SS7/Diameter Threats', icon: Radio },
    { id: 'simswap' as const, label: 'SIM Swap Defense', icon: Phone },
    { id: 'fraud' as const, label: 'Fraud Intelligence', icon: Eye },
    { id: 'signaling' as const, label: '5G Signaling Map', icon: Signal },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center">
            <Radio size={20} className="text-blue-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Telecom Threat Intelligence</h2>
            <p className="text-xs text-slate-500">SS7, Diameter, GTP & 5G Core signaling security</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-red-400 tracking-wider">CRITICAL</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
            0xDSI TELECOM
          </span>
        </div>
      </div>

      {/* Metrics bar */}
      <div className="grid grid-cols-6 gap-3">
        {NETWORK_METRICS.map((m, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
            <div className="text-[10px] text-slate-500 mb-1">{m.label}</div>
            <div className={`text-lg font-bold ${m.color}`}>{m.value}</div>
            <div className={`text-[10px] ${m.trend.startsWith('+') ? 'text-red-400' : 'text-emerald-400'}`}>{m.trend}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-cyan-300 border-cyan-400 bg-cyan-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {/* SS7 / Diameter Live Feed */}
      {tab === 'ss7' && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs text-red-400 font-mono font-bold">LIVE SS7/DIAMETER THREAT FEED</span>
          </div>
          {liveEvents.map((e, i) => (
            <div key={e.id + i} className={`bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 transition-all ${i === liveEvents.length - 1 ? 'animate-pulse border-red-500/30' : ''}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${sevColor(e.severity)}`}>{e.severity.toUpperCase()}</span>
                    <span className="px-2 py-0.5 text-[10px] rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-mono">{e.protocol}</span>
                    <span className="text-xs font-semibold text-white">{e.type}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">{e.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1"><MapPin size={10} />{e.source}</span>
                    <span className="flex items-center gap-1"><Clock size={10} />{e.timestamp}</span>
                    <span className="flex items-center gap-1 text-red-400"><Target size={10} />{e.indicator}</span>
                  </div>
                </div>
                <button className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-semibold">
                  Block Source
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SIM Swap Defense */}
      {tab === 'simswap' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-emerald-400">99.7%</div>
              <div className="text-xs text-slate-500 mt-1">Block Rate (24h)</div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: '99.7%' }} />
              </div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-cyan-400">1.2s</div>
              <div className="text-xs text-slate-500 mt-1">Avg Detection Time</div>
              <div className="text-[10px] text-emerald-400 mt-1">-340ms vs last week</div>
            </div>
            <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 text-center">
              <div className="text-3xl font-bold text-amber-400">$12.4M</div>
              <div className="text-xs text-slate-500 mt-1">Protected Assets (MTD)</div>
              <div className="text-[10px] text-emerald-400 mt-1">+$3.2M vs prior month</div>
            </div>
          </div>
          {SIM_SWAP_ATTEMPTS.map(s => (
            <div key={s.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Phone size={16} className="text-amber-400" />
                  <span className="text-sm font-semibold text-white font-mono">{s.msisdn}</span>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full border ${s.status === 'blocked' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : s.status === 'detected' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'}`}>{s.status}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Risk Score</div>
                    <div className={`text-lg font-bold ${s.riskScore >= 95 ? 'text-red-400' : s.riskScore >= 85 ? 'text-orange-400' : 'text-amber-400'}`}>{s.riskScore}</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3 text-[11px] mt-2">
                <div><span className="text-slate-500">IMSI:</span> <span className="text-slate-300 font-mono">{s.targetIMSI}</span></div>
                <div><span className="text-slate-500">Source:</span> <span className="text-slate-300">{s.sourceNode}</span></div>
                <div><span className="text-slate-500">Vector:</span> <span className="text-red-400">{s.attackType}</span></div>
                <div><span className="text-slate-500">Origin:</span> <span className="text-slate-300">{s.geoOrigin}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Fraud Intelligence */}
      {tab === 'fraud' && (
        <div className="space-y-4">
          {FRAUD_RINGS.map(f => (
            <div key={f.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${f.status === 'active' ? 'bg-red-500/10' : f.status === 'disrupted' ? 'bg-emerald-500/10' : 'bg-amber-500/10'}`}>
                    <Users size={16} className={f.status === 'active' ? 'text-red-400' : f.status === 'disrupted' ? 'text-emerald-400' : 'text-amber-400'} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">{f.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`px-2 py-0.5 text-[10px] rounded-full border ${f.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/30' : f.status === 'disrupted' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{f.status}</span>
                      <span className="text-[10px] text-slate-500">{f.members} members</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-red-400">{f.revenue_loss}</div>
                  <div className="text-[10px] text-slate-500">est. monthly loss</div>
                </div>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">{f.technique}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {f.countries.map(c => (
                    <span key={c} className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-400 border border-slate-700">{c}</span>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">Confidence</span>
                  <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${f.confidence}%` }} />
                  </div>
                  <span className="text-xs text-cyan-400 font-bold">{f.confidence}%</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 5G Signaling Map */}
      {tab === 'signaling' && (
        <div className="space-y-4">
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center gap-2 mb-3">
              <Signal size={14} className="text-cyan-400" />
              <span className="text-xs font-semibold text-white">5G SA Core - Live Signaling Topology</span>
              <span className="ml-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 text-[10px] text-red-400 border border-red-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />Active Attack Detected
              </span>
            </div>
            <canvas ref={canvasRef} className="w-full" style={{ height: 400 }} />
            <div className="absolute bottom-4 left-4 right-4 grid grid-cols-3 gap-2">
              {[
                { label: 'N1/N2 Messages/s', value: '12,847', color: 'text-cyan-400' },
                { label: 'Rogue Requests', value: '23', color: 'text-red-400' },
                { label: 'Blocked by SEPP', value: '19', color: 'text-emerald-400' },
              ].map((s, i) => (
                <div key={i} className="bg-[#0A1628]/90 border border-[#1e293b] rounded-lg p-2 text-center backdrop-blur">
                  <div className={`text-sm font-bold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
