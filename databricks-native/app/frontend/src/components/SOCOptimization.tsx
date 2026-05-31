import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle,
  Zap, Shield, Users, Database, Clock, BarChart3, Target, Brain, DollarSign,
  Settings, ChevronRight, ArrowUpRight, ArrowDownRight, Minus, Eye,
} from 'lucide-react';

// --- Animated Counter Hook ---
function useAnimatedValue(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let start = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(eased * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

// --- Health Score Ring ---
function HealthScoreRing({ score }: { score: number }) {
  const animated = useAnimatedValue(score, 1600);
  const r = 80, c = 2 * Math.PI * r;
  const offset = c - (c * animated) / 100;
  const color = animated < 40 ? '#ef4444' : animated < 70 ? '#eab308' : '#22c55e';
  return (
    <div className="relative flex items-center justify-center">
      <svg width="200" height="200" className="transform -rotate-90">
        <circle cx="100" cy="100" r={r} fill="none" stroke="#1e293b" strokeWidth="12" />
        <circle cx="100" cy="100" r={r} fill="none" stroke={color} strokeWidth="12"
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
          style={{ transition: 'stroke 0.3s', filter: `drop-shadow(0 0 8px ${color}80)` }} />
      </svg>
      <div className="absolute flex flex-col items-center"
        style={{ animation: 'pulse 2s ease-in-out infinite' }}>
        <span className="text-5xl font-bold" style={{ color }}>{animated}</span>
        <span className="text-xs text-slate-400 mt-1">Health Score</span>
      </div>
    </div>
  );
}

// --- Animated Progress Bar ---
function ProgressBar({ label, value, delay = 0 }: { label: string; value: number; delay?: number }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(value), 100 + delay); return () => clearTimeout(t); }, [value, delay]);
  const color = value < 50 ? 'bg-red-500' : value < 75 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs"><span className="text-slate-300">{label}</span><span className="text-slate-400">{value}%</span></div>
      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-1000 ease-out`} style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

// --- Sparkline SVG ---
function Sparkline({ data, color = '#38bdf8' }: { data: number[]; color?: string }) {
  const max = Math.max(...data), min = Math.min(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * 80},${28 - ((v - min) / (max - min || 1)) * 24}`).join(' ');
  return (
    <svg width="80" height="30" className="inline-block">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// --- Radar / Spider Chart ---
function RadarChart({ domains }: { domains: { label: string; value: number }[] }) {
  const cx = 120, cy = 120, R = 90, n = domains.length;
  const angleOf = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const rings = [0.25, 0.5, 0.75, 1];
  const pts = domains.map((d, i) => {
    const a = angleOf(i), r = R * (d.value / 100);
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
  return (
    <svg width="240" height="240" className="mx-auto">
      {rings.map((s) => (
        <polygon key={s} points={Array.from({ length: n }, (_, i) => {
          const a = angleOf(i); return `${cx + R * s * Math.cos(a)},${cy + R * s * Math.sin(a)}`;
        }).join(' ')} fill="none" stroke="#334155" strokeWidth="0.5" />
      ))}
      {domains.map((d, i) => {
        const a = angleOf(i);
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={cx + R * Math.cos(a)} y2={cy + R * Math.sin(a)} stroke="#334155" strokeWidth="0.5" />
            <text x={cx + (R + 14) * Math.cos(a)} y={cy + (R + 14) * Math.sin(a)}
              textAnchor="middle" dominantBaseline="middle" className="fill-slate-400" style={{ fontSize: 8 }}>{d.label}</text>
          </g>
        );
      })}
      <polygon points={pts} fill="rgba(56,189,248,0.2)" stroke="#38bdf8" strokeWidth="1.5" />
    </svg>
  );
}

// --- Shift Heatmap ---
function ShiftHeatmap({ data }: { data: number[][] }) {
  return (
    <div className="grid grid-cols-24 gap-px mt-1" style={{ gridTemplateColumns: 'repeat(24, 1fr)' }}>
      {data.flat().map((v, i) => (
        <div key={i} className="w-2 h-2 rounded-sm" title={`${Math.floor(i / 24)}d ${i % 24}h`}
          style={{ backgroundColor: v === 0 ? '#1e293b' : v < 3 ? '#164e63' : v < 6 ? '#0e7490' : '#06b6d4' }} />
      ))}
    </div>
  );
}

// --- STATIC DATA ---
const recommendations = [
  { id: 1, priority: 'critical' as const, title: 'Enable EDR telemetry correlation for lateral movement detection', impact: 'Reduces MTTD by 42%' },
  { id: 2, priority: 'critical' as const, title: 'Tune authentication anomaly rules to reduce false positives', impact: 'Eliminates 180 false alerts/day' },
  { id: 3, priority: 'high' as const, title: 'Deploy UEBA behavioral baselines for privileged accounts', impact: 'Covers 23% detection gap' },
  { id: 4, priority: 'high' as const, title: 'Consolidate redundant network scan rules into unified policy', impact: 'Saves 12 analyst hours/week' },
  { id: 5, priority: 'medium' as const, title: 'Integrate cloud WAF logs for application-layer visibility', impact: 'Expands coverage to 8 new vectors' },
];

const dataSources = [
  { name: 'Endpoint', rate: '12.4K eps', lastEvent: '2s ago', health: 'healthy', data: [40, 42, 38, 45, 50, 48, 52, 49, 55, 53] },
  { name: 'Firewall', rate: '8.2K eps', lastEvent: '1s ago', health: 'healthy', data: [30, 32, 28, 35, 33, 36, 34, 38, 37, 35] },
  { name: 'Cloud Trail', rate: '3.1K eps', lastEvent: '15s ago', health: 'warning', data: [20, 18, 22, 15, 25, 12, 28, 14, 30, 16] },
  { name: 'Identity', rate: '1.8K eps', lastEvent: '3s ago', health: 'healthy', data: [10, 12, 11, 14, 13, 15, 12, 16, 14, 15] },
  { name: 'Email', rate: '2.5K eps', lastEvent: '45s ago', health: 'degraded', data: [15, 14, 10, 8, 12, 6, 14, 5, 10, 7] },
  { name: 'DNS', rate: '5.7K eps', lastEvent: '1s ago', health: 'healthy', data: [25, 28, 26, 30, 27, 32, 29, 31, 33, 30] },
];

const rules = [
  { name: 'Brute Force Detection', tp: 89, fp: 11, mttr: '4.2m', sn: 8.1, trend: 'up' as const },
  { name: 'Lateral Movement', tp: 72, fp: 28, mttr: '12.8m', sn: 2.6, trend: 'down' as const },
  { name: 'Data Exfiltration', tp: 94, fp: 6, mttr: '6.1m', sn: 15.7, trend: 'up' as const },
  { name: 'Privilege Escalation', tp: 81, fp: 19, mttr: '8.4m', sn: 4.3, trend: 'flat' as const },
  { name: 'Phishing Response', tp: 88, fp: 12, mttr: '3.7m', sn: 7.3, trend: 'up' as const },
  { name: 'Insider Threat', tp: 65, fp: 35, mttr: '18.2m', sn: 1.9, trend: 'down' as const },
];

const analysts = [
  { name: 'Alex Chen', alerts: 47, resolution: '6.2m', escalation: 12, heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 8))) },
  { name: 'Maria Lopez', alerts: 52, resolution: '5.1m', escalation: 8, heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 8))) },
  { name: 'James Park', alerts: 38, resolution: '7.8m', escalation: 18, heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 8))) },
  { name: 'Sarah Kim', alerts: 61, resolution: '4.3m', escalation: 5, heatmap: Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => Math.floor(Math.random() * 8))) },
];

const radarDomains = [
  { label: 'Endpoint', value: 82 }, { label: 'Network', value: 71 }, { label: 'Identity', value: 58 },
  { label: 'Cloud', value: 45 }, { label: 'Email', value: 76 }, { label: 'Data', value: 39 },
  { label: 'Application', value: 63 }, { label: 'IoT/OT', value: 28 },
];

const priorityStyle = { critical: 'bg-red-500/20 text-red-400 border-red-500/30', high: 'bg-amber-500/20 text-amber-400 border-amber-500/30', medium: 'bg-blue-500/20 text-blue-400 border-blue-500/30' };
const healthDot = { healthy: 'bg-emerald-400', warning: 'bg-yellow-400', degraded: 'bg-red-400' };
const sourceIcons: Record<string, React.ReactNode> = {
  Endpoint: <Shield size={16} />, Firewall: <Activity size={16} />, 'Cloud Trail': <Database size={16} />,
  Identity: <Users size={16} />, Email: <Eye size={16} />, DNS: <BarChart3 size={16} />,
};

// --- MAIN COMPONENT ---
export default function SOCOptimization() {
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [visible, setVisible] = useState(false);

  useEffect(() => { setVisible(true); }, []);

  const handleApply = (id: number) => setApplied((prev) => new Set(prev).add(id));

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-6 space-y-6">
      <style>{`
        @keyframes pulse-glow { 0%,100% { filter: drop-shadow(0 0 6px rgba(34,197,94,0.3)); } 50% { filter: drop-shadow(0 0 18px rgba(34,197,94,0.6)); } }
        @keyframes heartbeat { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.8); opacity: 0; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-24px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes ripple { to { transform: scale(2.5); opacity: 0; } }
        .pulse-ring { animation: pulse-glow 2s ease-in-out infinite; }
        .heartbeat-ping { animation: heartbeat 1.5s ease-in-out infinite; }
      `}</style>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg"><Brain size={24} className="text-cyan-400" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">SOC Optimization & Health</h1>
            <p className="text-sm text-slate-400">AI-driven operational intelligence</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock size={14} /> Last updated: 12s ago
        </div>
      </div>

      {/* Top Row: Health Score + Sub-metrics + Recommendations */}
      <div className="grid grid-cols-12 gap-6">
        {/* Health Score */}
        <div className="col-span-3 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5 flex flex-col items-center gap-4">
          <div className="pulse-ring"><HealthScoreRing score={67} /></div>
          <div className="w-full space-y-3">
            <ProgressBar label="Detection" value={74} delay={0} />
            <ProgressBar label="Response" value={81} delay={150} />
            <ProgressBar label="Coverage" value={52} delay={300} />
          </div>
        </div>

        {/* AI Recommendations */}
        <div className="col-span-9 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-4"><Zap size={16} className="text-amber-400" /><h2 className="text-sm font-semibold">AI Optimization Recommendations</h2></div>
          <div className="space-y-2">
            {recommendations.map((rec, i) => (
              <div key={rec.id}
                className="flex items-center gap-3 p-3 bg-slate-900/50 rounded-lg border border-slate-700/30"
                style={visible ? { animation: `slideIn 0.4s ease-out ${i * 100}ms both` } : { opacity: 0 }}>
                <span className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded border ${priorityStyle[rec.priority]}`}>{rec.priority}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{rec.title}</p>
                  <p className="text-xs text-slate-500 flex items-center gap-1"><Target size={10} />{rec.impact}</p>
                </div>
                <button onClick={() => handleApply(rec.id)}
                  className={`relative overflow-hidden px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-300 ${
                    applied.has(rec.id) ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 border border-cyan-500/30'
                  }`}>
                  {applied.has(rec.id) ? <span className="flex items-center gap-1"><CheckCircle2 size={12} />Applied</span> : <span className="flex items-center gap-1"><Settings size={12} />Apply</span>}
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Data Source Health */}
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
        <div className="flex items-center gap-2 mb-4"><Database size={16} className="text-blue-400" /><h2 className="text-sm font-semibold">Data Source Health Monitor</h2></div>
        <div className="grid grid-cols-6 gap-3">
          {dataSources.map((ds) => (
            <div key={ds.name} className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/30 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-300">{sourceIcons[ds.name]}<span className="text-xs font-medium">{ds.name}</span></div>
                <div className="relative flex items-center justify-center w-3 h-3">
                  <span className={`absolute w-2 h-2 rounded-full ${healthDot[ds.health as keyof typeof healthDot]}`} />
                  <span className={`absolute w-2 h-2 rounded-full ${healthDot[ds.health as keyof typeof healthDot]} heartbeat-ping`} />
                </div>
              </div>
              <div className="text-lg font-bold text-white">{ds.rate}</div>
              <Sparkline data={ds.data} color={ds.health === 'healthy' ? '#34d399' : ds.health === 'warning' ? '#facc15' : '#f87171'} />
              <div className="text-[10px] text-slate-500 flex items-center gap-1"><Clock size={9} />{ds.lastEvent}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Middle Row: Rule Effectiveness + Analyst Performance */}
      <div className="grid grid-cols-12 gap-6">
        {/* Rule Effectiveness */}
        <div className="col-span-7 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-4"><BarChart3 size={16} className="text-violet-400" /><h2 className="text-sm font-semibold">Rule Effectiveness Scorecard</h2></div>
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b border-slate-700/50">
              <th className="pb-2 text-left font-medium">Rule</th><th className="pb-2 text-right font-medium">TP%</th>
              <th className="pb-2 text-right font-medium">FP%</th><th className="pb-2 text-right font-medium">MTTR</th>
              <th className="pb-2 text-right font-medium">S/N</th><th className="pb-2 text-center font-medium">Trend</th>
            </tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.name} className="border-b border-slate-700/20 hover:bg-slate-700/20 transition-colors">
                  <td className="py-2.5 text-slate-300">{r.name}</td>
                  <td className="py-2.5 text-right"><span className={r.tp >= 85 ? 'text-emerald-400' : r.tp >= 70 ? 'text-yellow-400' : 'text-red-400'}>{r.tp}%</span></td>
                  <td className="py-2.5 text-right"><span className={r.fp <= 10 ? 'text-emerald-400' : r.fp <= 20 ? 'text-yellow-400' : 'text-red-400'}>{r.fp}%</span></td>
                  <td className="py-2.5 text-right text-slate-400">{r.mttr}</td>
                  <td className="py-2.5 text-right text-slate-300">{r.sn}</td>
                  <td className="py-2.5 text-center">
                    {r.trend === 'up' ? <ArrowUpRight size={14} className="inline text-emerald-400" /> :
                     r.trend === 'down' ? <ArrowDownRight size={14} className="inline text-red-400" /> :
                     <Minus size={14} className="inline text-slate-500" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Analyst Performance */}
        <div className="col-span-5 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-4"><Users size={16} className="text-pink-400" /><h2 className="text-sm font-semibold">Analyst Performance</h2></div>
          <div className="grid grid-cols-2 gap-3">
            {analysts.map((a) => (
              <div key={a.name} className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/30 space-y-2">
                <div className="text-xs font-semibold text-slate-200">{a.name}</div>
                <div className="grid grid-cols-3 gap-1 text-[10px]">
                  <div><span className="text-slate-500 block">Alerts/d</span><span className="text-cyan-400 font-bold">{a.alerts}</span></div>
                  <div><span className="text-slate-500 block">Avg Res</span><span className="text-emerald-400 font-bold">{a.resolution}</span></div>
                  <div><span className="text-slate-500 block">Esc %</span><span className={`font-bold ${a.escalation <= 10 ? 'text-emerald-400' : a.escalation <= 15 ? 'text-yellow-400' : 'text-red-400'}`}>{a.escalation}%</span></div>
                </div>
                <ShiftHeatmap data={a.heatmap} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Row: Cost Optimization + Coverage Radar */}
      <div className="grid grid-cols-12 gap-6">
        {/* Cost Optimization */}
        <div className="col-span-7 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-4"><DollarSign size={16} className="text-green-400" /><h2 className="text-sm font-semibold">Cost Optimization</h2></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/30 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Current Spend</p>
              <p className="text-2xl font-bold text-red-400">$24,800</p>
              <p className="text-[10px] text-slate-500">/month</p>
            </div>
            <div className="bg-slate-900/60 rounded-lg p-4 border border-slate-700/30 text-center">
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">Optimized</p>
              <p className="text-2xl font-bold text-emerald-400">$18,200</p>
              <p className="text-[10px] text-slate-500">/month</p>
            </div>
            <div className="bg-emerald-500/10 rounded-lg p-4 border border-emerald-500/30 text-center flex flex-col justify-center">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wide mb-1">Savings</p>
              <p className="text-2xl font-bold text-emerald-300">$6,600</p>
              <p className="text-xs text-emerald-400 flex items-center justify-center gap-1 mt-1"><TrendingDown size={12} />26.6% reduction</p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[
              { tier: 'Hot Storage', current: '$9,200', opt: '$7,100', action: 'Reduce retention from 90d to 30d for low-value logs' },
              { tier: 'SIEM Licensing', current: '$8,400', opt: '$5,800', action: 'Consolidate duplicate log sources, drop debug-level' },
              { tier: 'Cloud Compute', current: '$4,800', opt: '$3,500', action: 'Right-size detection engine nodes, enable auto-scaling' },
              { tier: 'Third-party Feeds', current: '$2,400', opt: '$1,800', action: 'Drop 2 underperforming threat intel feeds' },
            ].map((t) => (
              <div key={t.tier} className="flex items-center gap-3 text-xs bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/20">
                <span className="w-28 text-slate-400 font-medium">{t.tier}</span>
                <span className="w-16 text-right text-red-400/70">{t.current}</span>
                <ChevronRight size={12} className="text-slate-600" />
                <span className="w-16 text-right text-emerald-400">{t.opt}</span>
                <span className="flex-1 text-slate-500 truncate">{t.action}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Coverage Gap Radar */}
        <div className="col-span-5 bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
          <div className="flex items-center gap-2 mb-4"><Target size={16} className="text-cyan-400" /><h2 className="text-sm font-semibold">Coverage Gap Analysis</h2></div>
          <RadarChart domains={radarDomains} />
          <div className="grid grid-cols-2 gap-2 mt-3">
            {radarDomains.map((d) => (
              <div key={d.label} className="flex items-center justify-between text-[10px] px-2 py-1 bg-slate-900/40 rounded">
                <span className="text-slate-400">{d.label}</span>
                <span className={d.value >= 70 ? 'text-emerald-400' : d.value >= 50 ? 'text-yellow-400' : 'text-red-400'}>{d.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
