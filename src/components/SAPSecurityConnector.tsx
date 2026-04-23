import React, { useState, useEffect, useCallback } from 'react';
import {
  Database, Server, Shield, AlertTriangle, Users, Activity, Clock,
  CheckCircle2, XCircle, Lock, Unlock, Eye, Zap, TrendingUp,
  ChevronRight, RefreshCw, Globe, FileText, Target, BarChart3, Settings, Link,
} from 'lucide-react';

const systems = [
  { name: 'SAP S/4HANA Production', version: 'S/4HANA 2023 FPS02', eventRate: 1247, lastSync: '2s ago', health: 97, status: 'connected', icon: Server, client: '100' },
  { name: 'SAP BW/4HANA', version: 'BW/4HANA 2.0 SP08', eventRate: 438, lastSync: '5s ago', health: 92, status: 'connected', icon: Database, client: '200' },
  { name: 'SAP SuccessFactors', version: 'H2 2025 Release', eventRate: 312, lastSync: '8s ago', health: 88, status: 'degraded', icon: Users, client: 'Cloud' },
  { name: 'SAP Ariba', version: 'Ariba 2311.1', eventRate: 189, lastSync: '12s ago', health: 95, status: 'connected', icon: Globe, client: 'Cloud' },
];

const auditLog = [
  { id: 1, event: 'SU53 Authorization Failure', user: 'JMILLER', tcode: 'SU53', ts: '14:32:07', severity: 'high', client: '100', detail: 'Missing S_TCODE auth' },
  { id: 2, event: 'SE16 Table Access - USR02', user: 'ADMIN01', tcode: 'SE16', ts: '14:31:45', severity: 'critical', detail: 'Direct user master read', client: '100' },
  { id: 3, event: 'Debug Active in Production', user: 'DEVUSER3', tcode: 'SE38', ts: '14:31:22', severity: 'critical', detail: 'ABAP debugger activated', client: '100' },
  { id: 4, event: 'RFC Destination Changed', user: 'BASIS02', tcode: 'SM59', ts: '14:30:58', severity: 'high', detail: 'External RFC modified', client: '100' },
  { id: 5, event: 'User Account Unlocked', user: 'SECADMIN', tcode: 'SU01', ts: '14:30:33', severity: 'medium', detail: 'Unlocked BATCH_SVC', client: '100' },
  { id: 6, event: 'Transport Import to PRD', user: 'TMSADM', tcode: 'STMS', ts: '14:29:47', severity: 'high', detail: 'Unplanned import K900455', client: '100' },
  { id: 7, event: 'SAP_ALL Profile Assigned', user: 'EMERGADM', tcode: 'SU01', ts: '14:29:12', severity: 'critical', detail: 'Emergency access grant', client: '100' },
  { id: 8, event: 'SM30 Table Maintenance', user: 'CFGUSER', tcode: 'SM30', ts: '14:28:55', severity: 'high', detail: 'Modified TCURR rates', client: '200' },
  { id: 9, event: 'Parameter Change - login/fails', user: 'BASIS01', tcode: 'RZ10', ts: '14:28:22', severity: 'critical', detail: 'Login threshold changed', client: '100' },
  { id: 10, event: 'User Lock Event', user: 'SYSTEM', tcode: 'AUTO', ts: '14:27:58', severity: 'medium', detail: 'VENDOR_API locked', client: '100' },
  { id: 11, event: 'SU53 Auth Failure - FI Post', user: 'APUSER07', tcode: 'FB01', ts: '14:27:30', severity: 'high', detail: 'Missing F_BKPF_BUK', client: '200' },
  { id: 12, event: 'Cross-Client Config Change', user: 'ADMIN01', tcode: 'SCC4', ts: '14:27:01', severity: 'critical', detail: 'Client settings modified', client: '000' },
];

const privilegeCards = [
  { label: 'Users with SAP_ALL', value: 7, trend: 'up', icon: Shield, color: '#EF4444' },
  { label: 'Debug Auth in Prod', value: 3, trend: 'up', icon: Eye, color: '#F59E0B' },
  { label: 'Inactive + Broad Access', value: 14, trend: 'down', icon: Users, color: '#3B82F6' },
  { label: 'Cross-Client Violations', value: 5, trend: 'up', icon: Globe, color: '#A855F7' },
  { label: 'SoD Conflicts', value: 23, trend: 'up', icon: AlertTriangle, color: '#EF4444' },
];

const correlationRules = [
  { name: 'Critical Transaction Off-Hours', detections: 18, severity: 'critical', mitre: 'T1078.004' },
  { name: 'Mass User Unlock', detections: 4, severity: 'high', mitre: 'T1098.001' },
  { name: 'Production Debug Activation', detections: 7, severity: 'critical', mitre: 'T1059.009' },
  { name: 'RFC Callback to External', detections: 3, severity: 'high', mitre: 'T1071.001' },
  { name: 'SoD Violation Chain', detections: 12, severity: 'critical', mitre: 'T1078.002' },
  { name: 'Transport Smuggling', detections: 2, severity: 'high', mitre: 'T1195.002' },
];

const sodRoles = ['FI-Posting', 'FI-Approve', 'MM-PO Create', 'MM-GR Post', 'SD-Billing', 'BASIS-Admin'];
const sodConflicts: [number, number, string][] = [
  [0, 1, 'FI post + approve = fraud risk'], [2, 3, 'PO create + goods receipt = procurement fraud'],
  [0, 4, 'FI post + billing = revenue manipulation'], [2, 1, 'PO create + FI approve = payment fraud'],
  [4, 5, 'Billing + BASIS = audit bypass'], [1, 3, 'FI approve + GR = three-way match bypass'],
  [0, 5, 'FI post + BASIS = full financial control'], [3, 4, 'GR post + billing = delivery fraud'],
];

const threatTcodes = [
  { tcode: 'SE16', label: 'Table Browser', count: 847, pct: 100 },
  { tcode: 'SU01', label: 'User Maint.', count: 623, pct: 74 },
  { tcode: 'SM59', label: 'RFC Config', count: 412, pct: 49 },
  { tcode: 'SE38', label: 'ABAP Editor', count: 389, pct: 46 },
  { tcode: 'STMS', label: 'Transport Mgmt', count: 267, pct: 32 },
  { tcode: 'SM30', label: 'Table Maint.', count: 234, pct: 28 },
  { tcode: 'RZ10', label: 'Profile Params', count: 156, pct: 18 },
];

const sevColor: Record<string, string> = {
  critical: 'text-red-400 bg-red-400/10', high: 'text-orange-400 bg-orange-400/10',
  medium: 'text-yellow-400 bg-yellow-400/10', low: 'text-green-400 bg-green-400/10',
};

export default function SAPSecurityConnector() {
  const [totalEvents, setTotalEvents] = useState(284719);
  const [visibleRows, setVisibleRows] = useState(0);
  const [hoveredCell, setHoveredCell] = useState<string | null>(null);
  const [pulseMap, setPulseMap] = useState<Record<number, boolean>>({});
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => {
      setTotalEvents(p => p + Math.floor(Math.random() * 5) + 1);
      setTick(t => t + 1);
      setPulseMap(() => {
        const m: Record<number, boolean> = {};
        systems.forEach((_, i) => { m[i] = Math.random() > 0.3; });
        return m;
      });
    }, 1200);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (visibleRows < auditLog.length) {
      const t = setTimeout(() => setVisibleRows(v => v + 1), 120);
      return () => clearTimeout(t);
    }
  }, [visibleRows]);

  const isConflict = useCallback((r: number, c: number) =>
    sodConflicts.some(([a, b]) => (a === r && b === c) || (a === c && b === r)), []);

  const getConflictDetail = useCallback((r: number, c: number) =>
    sodConflicts.find(([a, b]) => (a === r && b === c) || (a === c && b === r))?.[2] || '', []);

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-200 p-4 font-mono">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Shield className="w-8 h-8 text-cyan-400" />
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-ping" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">SAP Security Connector</h1>
            <p className="text-xs text-gray-500">Enterprise Threat Monitoring & SoD Analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <RefreshCw className={`w-3.5 h-3.5 ${tick % 2 === 0 ? 'animate-spin' : ''}`} />
          <span>Live | {new Date().toLocaleTimeString()}</span>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Total Events', value: totalEvents.toLocaleString(), icon: Activity, color: 'text-cyan-400' },
          { label: 'Critical Findings', value: '34', icon: AlertTriangle, color: 'text-red-400' },
          { label: 'SoD Violations', value: '23', icon: XCircle, color: 'text-orange-400' },
          { label: 'Privileged Users', value: '42', icon: Lock, color: 'text-yellow-400' },
        ].map((s, i) => (
          <div key={i} className="bg-[#0F1F35] border border-gray-800 rounded-lg p-3 flex items-center gap-3">
            <s.icon className={`w-5 h-5 ${s.color}`} />
            <div>
              <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* SAP System Landscape */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-2">
          <Link className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">SAP System Landscape</h2>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {systems.map((sys, i) => (
            <div key={i} className={`bg-[#0F1F35] border rounded-lg p-3 transition-all duration-300 ${
              pulseMap[i] ? 'border-cyan-500/50 shadow-[0_0_15px_rgba(6,182,212,0.15)]' : 'border-gray-800'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <sys.icon className="w-4 h-4 text-cyan-400" />
                <div className="flex items-center gap-1.5">
                  <div className={`w-2 h-2 rounded-full ${
                    sys.status === 'connected' ? 'bg-green-400' : 'bg-yellow-400 animate-pulse'
                  }`} />
                  <span className="text-[10px] text-gray-500 capitalize">{sys.status}</span>
                </div>
              </div>
              <div className="text-xs font-semibold text-white mb-0.5 truncate">{sys.name}</div>
              <div className="text-[10px] text-gray-500 mb-2">{sys.version}</div>
              <div className="flex justify-between text-[10px] mb-1.5">
                <span className="text-gray-500">Events/min</span>
                <span className="text-cyan-400 font-semibold">{sys.eventRate + (pulseMap[i] ? Math.floor(Math.random() * 20) : 0)}</span>
              </div>
              <div className="flex justify-between text-[10px] mb-2">
                <span className="text-gray-500">Last Sync</span>
                <span className="text-gray-400">{sys.lastSync}</span>
              </div>
              <div className="w-full bg-gray-800 rounded-full h-1.5">
                <div className="h-1.5 rounded-full transition-all duration-500" style={{
                  width: `${sys.health}%`,
                  background: sys.health > 90 ? '#34D399' : sys.health > 80 ? '#FBBF24' : '#EF4444',
                }} />
              </div>
              <div className="text-[10px] text-gray-500 mt-1 text-right">Health {sys.health}%</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Audit Log */}
        <div className="col-span-2 bg-[#0F1F35] border border-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">SAP Security Audit Log</h2>
          </div>
          <div className="overflow-hidden max-h-[280px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-gray-500 border-b border-gray-800">
                  {['Time', 'Event', 'User', 'TCode', 'Client', 'Severity'].map(h => (
                    <th key={h} className="text-left py-1.5 px-1 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auditLog.slice(0, visibleRows).map((e, i) => (
                  <tr key={e.id} className="border-b border-gray-800/50 hover:bg-cyan-400/5 transition-all duration-300"
                    style={{ animation: `slideIn 0.4s ease-out ${i * 0.08}s both` }}>
                    <td className="py-1.5 px-1 text-gray-500 whitespace-nowrap">
                      <Clock className="w-3 h-3 inline mr-0.5 opacity-50" />{e.ts}
                    </td>
                    <td className="py-1.5 px-1 text-gray-300 max-w-[180px] truncate">{e.event}</td>
                    <td className="py-1.5 px-1 text-cyan-400 font-semibold">{e.user}</td>
                    <td className="py-1.5 px-1"><span className="bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">{e.tcode}</span></td>
                    <td className="py-1.5 px-1 text-gray-400">{e.client}</td>
                    <td className="py-1.5 px-1">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${sevColor[e.severity]}`}>{e.severity}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Privilege Analysis */}
        <div className="bg-[#0F1F35] border border-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Privilege Analysis</h2>
          </div>
          <div className="space-y-2">
            {privilegeCards.map((card, i) => (
              <div key={i} className="bg-[#0A1628] border border-gray-800 rounded-lg p-2.5 flex items-center justify-between hover:border-gray-700 transition-colors">
                <div className="flex items-center gap-2">
                  <card.icon className="w-4 h-4" style={{ color: card.color }} />
                  <span className="text-[11px] text-gray-400">{card.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-bold" style={{ color: card.color }}>{card.value}</span>
                  <TrendingUp className={`w-3 h-3 ${card.trend === 'up' ? 'text-red-400' : 'text-green-400 rotate-180'}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* Correlation Rules */}
        <div className="bg-[#0F1F35] border border-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">Correlation Rules</h2>
          </div>
          <div className="space-y-1.5">
            {correlationRules.map((rule, i) => (
              <div key={i} className="bg-[#0A1628] border border-gray-800 rounded p-2 hover:border-gray-700 transition-colors">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-gray-300 font-medium truncate mr-2">{rule.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold ${sevColor[rule.severity]}`}>{rule.severity}</span>
                </div>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-500">Detections: <span className="text-cyan-400 font-semibold">{rule.detections}</span></span>
                  <span className="text-gray-600 font-mono">{rule.mitre}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SoD Conflict Matrix */}
        <div className="bg-[#0F1F35] border border-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">SoD Conflict Matrix</h2>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-[9px]">
              <thead>
                <tr>
                  <th className="p-0.5" />
                  {sodRoles.map((r, i) => (
                    <th key={i} className="p-0.5 text-gray-500 font-normal truncate max-w-[50px]" title={r}>
                      {r.split('-')[1] || r.slice(0, 4)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sodRoles.map((role, r) => (
                  <tr key={r}>
                    <td className="p-0.5 text-gray-500 text-right pr-1 whitespace-nowrap">{role.split('-')[0]}</td>
                    {sodRoles.map((_, c) => {
                      const key = `${r}-${c}`;
                      const conflict = isConflict(r, c);
                      const hovered = hoveredCell === key;
                      return (
                        <td key={c} className="p-0.5 relative"
                          onMouseEnter={() => setHoveredCell(key)}
                          onMouseLeave={() => setHoveredCell(null)}>
                          <div className={`w-full aspect-square rounded-sm transition-all duration-200 cursor-pointer ${
                            r === c ? 'bg-gray-800'
                              : conflict
                                ? `bg-red-500/30 border border-red-500/50 ${hovered ? 'shadow-[0_0_12px_rgba(239,68,68,0.5)] scale-110' : ''}`
                                : 'bg-gray-800/50 hover:bg-gray-700/50'
                          }`} />
                          {hovered && conflict && (
                            <div className="absolute z-20 bottom-full left-1/2 -translate-x-1/2 mb-1 bg-gray-900 border border-red-500/50 rounded px-2 py-1 text-[9px] text-red-300 whitespace-nowrap shadow-lg">
                              {getConflictDetail(r, c)}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Transaction Code Threat Heatmap */}
        <div className="bg-[#0F1F35] border border-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <Settings className="w-4 h-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">TCode Threat Map</h2>
          </div>
          <div className="space-y-2">
            {threatTcodes.map((t, i) => (
              <div key={i} className="group">
                <div className="flex items-center justify-between text-[10px] mb-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-cyan-400 font-bold w-8">{t.tcode}</span>
                    <span className="text-gray-500">{t.label}</span>
                  </div>
                  <span className="text-gray-400">{t.count}</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700 group-hover:brightness-125" style={{
                    width: `${t.pct}%`,
                    background: t.pct > 70 ? 'linear-gradient(90deg, #EF4444, #F87171)'
                      : t.pct > 40 ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                        : 'linear-gradient(90deg, #06B6D4, #22D3EE)',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Connection Animation Lines */}
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none z-0 opacity-20" aria-hidden="true">
        <defs>
          <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#06B6D4" stopOpacity="0" />
            <stop offset="50%" stopColor="#06B6D4" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#06B6D4" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: #1E3A5F; border-radius: 2px; }
      `}</style>
    </div>
  );
}
