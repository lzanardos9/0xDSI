import { useState, useEffect, useRef } from 'react';
import {
  Factory, Cpu, Thermometer, AlertTriangle, Shield, Activity, Zap, Clock,
  Settings, Wrench, BarChart3, Eye, Lock, Radio, Wifi, Server
} from 'lucide-react';

interface PLCAlert {
  id: string;
  plcId: string;
  zone: string;
  type: string;
  severity: 'critical' | 'high' | 'medium';
  description: string;
  protocol: string;
  mitre_ics: string;
  timestamp: string;
  status: 'active' | 'contained' | 'investigating';
}

interface ProductionLine {
  id: string;
  name: string;
  status: 'running' | 'compromised' | 'isolated' | 'maintenance';
  plcCount: number;
  anomalies: number;
  throughput: number;
  threatLevel: number;
  lastScan: string;
}

interface OTProtocolEvent {
  protocol: string;
  count: number;
  anomalies: number;
  blocked: number;
  color: string;
}

const PLC_ALERTS: PLCAlert[] = [
  { id: 'plc-001', plcId: 'PLC-SIEM-7A2', zone: 'Zone 3 - Paint Shop', type: 'Firmware Modification', severity: 'critical', description: 'Unauthorized firmware flash detected on Siemens S7-1500 via PROFINET. Ladder logic checksum mismatch - 47 rungs modified targeting temperature PID loops.', protocol: 'S7comm', mitre_ics: 'T0839 - Module Firmware', timestamp: '12s ago', status: 'active' },
  { id: 'plc-002', plcId: 'PLC-ROB-4C1', zone: 'Zone 1 - Assembly Robot Cell', type: 'Safety System Override', severity: 'critical', description: 'SIL-3 rated safety interlock bypassed on KUKA KR-210 robot arm. Light curtain input forced to TRUE via engineering workstation exploit.', protocol: 'EtherCAT', mitre_ics: 'T0816 - Device Restart/Shutdown', timestamp: '34s ago', status: 'investigating' },
  { id: 'plc-003', plcId: 'RTU-PWR-12B', zone: 'Zone 5 - Power Distribution', type: 'Modbus Coil Write Anomaly', severity: 'high', description: 'Unauthorized FC15 Write Multiple Coils targeting circuit breaker control registers from unknown IP 10.44.2.178. 23 coils targeted.', protocol: 'Modbus TCP', mitre_ics: 'T0831 - Manipulation of Control', timestamp: '1m ago', status: 'contained' },
  { id: 'plc-004', plcId: 'HMI-CNC-09D', zone: 'Zone 2 - CNC Machining', type: 'HMI Credential Brute Force', severity: 'high', description: 'VNC brute force against Fanuc CNC controller HMI panel. 847 attempts from lateral movement origin. Default credentials still active on 3 panels.', protocol: 'VNC/OPC-UA', mitre_ics: 'T0823 - Graphical User Interface', timestamp: '2m ago', status: 'active' },
  { id: 'plc-005', plcId: 'DCS-CHEM-3F', zone: 'Zone 4 - Chemical Processing', type: 'Setpoint Manipulation', severity: 'critical', description: 'DCS setpoint for reactor vessel pressure changed from 2.4 bar to 8.7 bar via compromised OPC-UA session. Safety relief valve override attempted.', protocol: 'OPC-UA', mitre_ics: 'T0836 - Modify Parameter', timestamp: '3m ago', status: 'contained' },
  { id: 'plc-006', plcId: 'PLC-CONV-11E', zone: 'Zone 1 - Conveyor Systems', type: 'Logic Bomb Detected', severity: 'high', description: 'Timed logic bomb in Allen-Bradley ControlLogix program. Triggers motor reversal on conveyor C-11 at timestamp 2026-04-25 03:00 UTC.', protocol: 'EtherNet/IP', mitre_ics: 'T0831 - Manipulation of Control', timestamp: '5m ago', status: 'investigating' },
];

const PRODUCTION_LINES: ProductionLine[] = [
  { id: 'pl-1', name: 'Assembly Line A - Main Body', status: 'running', plcCount: 34, anomalies: 2, throughput: 98.4, threatLevel: 15, lastScan: '2m ago' },
  { id: 'pl-2', name: 'Assembly Line B - Sub-Assembly', status: 'compromised', plcCount: 28, anomalies: 7, throughput: 45.2, threatLevel: 89, lastScan: '30s ago' },
  { id: 'pl-3', name: 'Paint Shop - Robotic Cell', status: 'isolated', plcCount: 16, anomalies: 12, throughput: 0, threatLevel: 97, lastScan: '15s ago' },
  { id: 'pl-4', name: 'CNC Machining Center', status: 'running', plcCount: 22, anomalies: 1, throughput: 99.1, threatLevel: 8, lastScan: '5m ago' },
  { id: 'pl-5', name: 'Chemical Processing Unit', status: 'maintenance', plcCount: 18, anomalies: 3, throughput: 0, threatLevel: 34, lastScan: '1m ago' },
  { id: 'pl-6', name: 'Quality Inspection Cell', status: 'running', plcCount: 12, anomalies: 0, throughput: 100, threatLevel: 3, lastScan: '8m ago' },
  { id: 'pl-7', name: 'Packaging & Shipping', status: 'running', plcCount: 20, anomalies: 1, throughput: 97.8, threatLevel: 11, lastScan: '3m ago' },
];

const OT_PROTOCOLS: OTProtocolEvent[] = [
  { protocol: 'Modbus TCP', count: 45_230, anomalies: 234, blocked: 89, color: '#F59E0B' },
  { protocol: 'S7comm', count: 32_890, anomalies: 156, blocked: 67, color: '#EF4444' },
  { protocol: 'EtherNet/IP', count: 28_450, anomalies: 89, blocked: 34, color: '#3B82F6' },
  { protocol: 'OPC-UA', count: 21_340, anomalies: 178, blocked: 123, color: '#10B981' },
  { protocol: 'PROFINET', count: 18_920, anomalies: 67, blocked: 45, color: '#8B5CF6' },
  { protocol: 'EtherCAT', count: 15_670, anomalies: 34, blocked: 12, color: '#F97316' },
  { protocol: 'DNP3', count: 8_450, anomalies: 23, blocked: 18, color: '#06B6D4' },
  { protocol: 'BACnet', count: 5_230, anomalies: 12, blocked: 8, color: '#84CC16' },
];

const statusColor = (s: string) => {
  if (s === 'running') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
  if (s === 'compromised') return 'bg-red-500/10 text-red-400 border-red-500/30';
  if (s === 'isolated') return 'bg-amber-500/10 text-amber-400 border-amber-500/30';
  return 'bg-blue-500/10 text-blue-400 border-blue-500/30';
};

export default function ManufacturingThreats() {
  const [tab, setTab] = useState<'plc' | 'lines' | 'protocols' | 'purdue'>('plc');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 2000);
    return () => clearInterval(iv);
  }, []);

  // Purdue model animation
  useEffect(() => {
    if (tab !== 'purdue') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const W = canvas.width = canvas.parentElement!.clientWidth;
    const H = canvas.height = 500;
    let frame = 0;

    const levels = [
      { y: 40, label: 'Level 5 - Enterprise', color: '#3B82F6', items: ['ERP', 'CRM', 'PLM', 'Email'] },
      { y: 110, label: 'Level 4 - Site Business', color: '#60A5FA', items: ['MES', 'Historian', 'LIMS'] },
      { y: 180, label: 'Level 3.5 - DMZ', color: '#F59E0B', items: ['Firewall', 'Jump Server', 'Patch Server'] },
      { y: 250, label: 'Level 3 - Operations', color: '#10B981', items: ['OPC-UA Server', 'Eng Workstation', 'APC'] },
      { y: 320, label: 'Level 2 - Control', color: '#14B8A6', items: ['SCADA', 'DCS', 'HMI'] },
      { y: 390, label: 'Level 1 - Basic Control', color: '#F97316', items: ['PLC', 'RTU', 'SIS'] },
      { y: 460, label: 'Level 0 - Process', color: '#EF4444', items: ['Sensors', 'Actuators', 'Motors'] },
    ];

    const draw = () => {
      ctx.clearRect(0, 0, W, H);

      levels.forEach((lvl, li) => {
        ctx.fillStyle = `${lvl.color}08`;
        ctx.fillRect(20, lvl.y - 15, W - 40, 55);
        ctx.strokeStyle = `${lvl.color}30`;
        ctx.strokeRect(20, lvl.y - 15, W - 40, 55);

        ctx.fillStyle = lvl.color;
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(lvl.label, 30, lvl.y + 5);

        lvl.items.forEach((item, ii) => {
          const x = 250 + ii * 130;
          ctx.fillStyle = `${lvl.color}20`;
          ctx.fillRect(x, lvl.y - 8, 100, 30);
          ctx.strokeStyle = `${lvl.color}50`;
          ctx.strokeRect(x, lvl.y - 8, 100, 30);
          ctx.fillStyle = lvl.color;
          ctx.font = '10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(item, x + 50, lvl.y + 12);
        });

        if (li < levels.length - 1) {
          ctx.strokeStyle = '#1E293B';
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(W / 2, lvl.y + 40);
          ctx.lineTo(W / 2, levels[li + 1].y - 15);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });

      // Attack path animation
      const attackPath = [0, 1, 2, 3, 4, 5];
      const progress = (frame % 180) / 180;
      const segment = Math.floor(progress * attackPath.length);
      const segProgress = (progress * attackPath.length) % 1;

      if (segment < attackPath.length - 1) {
        const fromY = levels[attackPath[segment]].y + 20;
        const toY = levels[attackPath[segment + 1]].y + 20;
        const py = fromY + (toY - fromY) * segProgress;
        const px = W / 2 + 50;

        ctx.beginPath();
        ctx.arc(px, py, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(px, py, 12, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
        ctx.fill();

        ctx.fillStyle = '#EF4444';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'left';
        ctx.fillText('ATTACK TRAVERSAL', px + 16, py + 4);
      }

      frame++;
      requestAnimationFrame(draw);
    };
    const raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [tab]);

  const TABS = [
    { id: 'plc' as const, label: 'PLC/SCADA Alerts', icon: Cpu },
    { id: 'lines' as const, label: 'Production Lines', icon: Factory },
    { id: 'protocols' as const, label: 'OT Protocols', icon: Radio },
    { id: 'purdue' as const, label: 'Purdue Model', icon: Wrench },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-orange-500/20 to-red-500/20 border border-orange-500/30 flex items-center justify-center">
            <Factory size={20} className="text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Manufacturing & ICS Threats</h2>
            <p className="text-xs text-slate-500">OT/ICS network monitoring, PLC integrity, Purdue model defense</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-orange-400 tracking-wider">OT ACTIVE</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
            0xDSI INDUSTRIAL
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[#1e293b]">
        {TABS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 ${tab === t.id ? 'text-orange-300 border-orange-400 bg-orange-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'plc' && (
        <div className="space-y-3">
          {PLC_ALERTS.map(a => (
            <div key={a.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${a.severity === 'critical' ? 'border-red-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Cpu size={14} className="text-orange-400" />
                    <span className="text-xs font-bold text-white font-mono">{a.plcId}</span>
                    <span className="text-[10px] text-slate-500">{a.zone}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${a.severity === 'critical' ? 'bg-red-500/10 text-red-400 border-red-500/30' : a.severity === 'high' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>{a.severity}</span>
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${a.status === 'active' ? 'bg-red-500/10 text-red-400 border-red-500/20' : a.status === 'contained' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'}`}>{a.status}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-white mb-1">{a.type}</h4>
                  <p className="text-xs text-slate-400 leading-relaxed">{a.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-[10px]">
                    <span className="text-blue-400 font-mono">{a.protocol}</span>
                    <span className="text-amber-400">{a.mitre_ics}</span>
                    <span className="text-slate-500">{a.timestamp}</span>
                  </div>
                </div>
                {a.status === 'active' && (
                  <button className="px-3 py-1.5 text-[10px] rounded-lg bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-colors font-semibold shrink-0 ml-3">
                    Emergency Stop
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'lines' && (
        <div className="space-y-3">
          {PRODUCTION_LINES.map(pl => (
            <div key={pl.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${pl.status === 'compromised' ? 'border-red-500/30' : pl.status === 'isolated' ? 'border-amber-500/30' : 'border-[#1e293b]'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Factory size={16} className={pl.status === 'running' ? 'text-emerald-400' : pl.status === 'compromised' ? 'text-red-400' : 'text-amber-400'} />
                  <div>
                    <h4 className="text-sm font-semibold text-white">{pl.name}</h4>
                    <span className={`px-2 py-0.5 text-[10px] rounded-full border ${statusColor(pl.status)}`}>{pl.status}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-center">
                    <div className="text-xs text-slate-500">Threat</div>
                    <div className={`text-lg font-bold ${pl.threatLevel > 80 ? 'text-red-400' : pl.threatLevel > 30 ? 'text-amber-400' : 'text-emerald-400'}`}>{pl.threatLevel}</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xs text-slate-500">Throughput</div>
                    <div className={`text-lg font-bold ${pl.throughput > 90 ? 'text-emerald-400' : pl.throughput > 0 ? 'text-amber-400' : 'text-slate-500'}`}>{pl.throughput}%</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-[11px] text-slate-500">
                <span>{pl.plcCount} PLCs</span>
                <span className={pl.anomalies > 5 ? 'text-red-400' : pl.anomalies > 0 ? 'text-amber-400' : 'text-emerald-400'}>{pl.anomalies} anomalies</span>
                <span>Last scan: {pl.lastScan}</span>
              </div>
              <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-1000 ${pl.threatLevel > 80 ? 'bg-red-500' : pl.threatLevel > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                  style={{ width: `${pl.threatLevel}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'protocols' && (
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[
              { l: 'Total OT Traffic', v: '176K/s', c: 'text-cyan-400' },
              { l: 'Anomalous Packets', v: '793', c: 'text-red-400' },
              { l: 'Blocked Commands', v: '396', c: 'text-amber-400' },
              { l: 'Unknown Devices', v: '12', c: 'text-orange-400' },
            ].map((s, i) => (
              <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 text-center">
                <div className="text-[10px] text-slate-500">{s.l}</div>
                <div className={`text-xl font-bold ${s.c}`}>{s.v}</div>
              </div>
            ))}
          </div>
          {OT_PROTOCOLS.map(p => (
            <div key={p.protocol} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: p.color }} />
                  <span className="text-sm font-semibold text-white">{p.protocol}</span>
                </div>
                <span className="text-xs text-slate-500">{p.count.toLocaleString()} events/hr</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(p.count / 50000) * 100}%`, backgroundColor: p.color }} />
                </div>
                <div className="flex gap-3 text-[10px]">
                  <span className="text-red-400">{p.anomalies} anomalies</span>
                  <span className="text-amber-400">{p.blocked} blocked</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'purdue' && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 mb-2">
            <Wrench size={14} className="text-orange-400" />
            <span className="text-xs font-semibold text-white">Purdue Model - Live Attack Traversal</span>
          </div>
          <canvas ref={canvasRef} className="w-full" style={{ height: 500 }} />
        </div>
      )}
    </div>
  );
}
