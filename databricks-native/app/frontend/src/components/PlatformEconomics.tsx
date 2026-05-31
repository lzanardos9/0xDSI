import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, Database, Zap, Shield,
  AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight, Calculator,
  Target, Clock, Settings, ChevronRight, Activity, Download, Brain, Minus, Plus, Eye,
} from 'lucide-react';

const useAnimatedCounter = (end: number, duration = 1400, decimals = 0) => {
  const [val, setVal] = useState(0);
  const ref = useRef<number>(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(parseFloat((eased * end).toFixed(decimals)));
      if (t < 1) ref.current = requestAnimationFrame(tick);
    };
    ref.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(ref.current);
  }, [end, duration, decimals]);
  return val;
};

const useInView = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => e.isIntersecting && setVisible(true), { threshold: 0.15 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
};

const ingestion = [
  { name: 'Endpoint', gb: 450, color: '#3B82F6' },
  { name: 'Network', gb: 320, color: '#8B5CF6' },
  { name: 'Cloud', gb: 180, color: '#06B6D4' },
  { name: 'Identity', gb: 95, color: '#F59E0B' },
  { name: 'Email', gb: 65, color: '#EF4444' },
  { name: 'Custom', gb: 40, color: '#10B981' },
];
const totalGB = ingestion.reduce((s, i) => s + i.gb, 0);

const billingRows = [
  { item: 'Compute (vCPU-hours)', units: '2,400 hrs', rate: '$0.0042/hr', cost: 10080 },
  { item: 'Hot Storage (SSD)', units: '12 TB', rate: '$0.23/GB/mo', cost: 2760 },
  { item: 'Cold Storage (Archive)', units: '84 TB', rate: '$0.004/GB/mo', cost: 336 },
  { item: 'API Calls', units: '48M calls', rate: '$0.035/10K', cost: 168 },
  { item: 'Edge Functions', units: '1.2M inv.', rate: '$0.60/M', cost: 720 },
  { item: 'ML Inference', units: '840K inf.', rate: '$12.80/1K', cost: 10752 },
];

const optimizations = [
  { title: 'Cold-tier endpoint telemetry after 72h', savings: 8400, pct: 78, icon: Database },
  { title: 'Deduplicate network flow logs', savings: 3200, pct: 62, icon: Activity },
  { title: 'Compress identity audit payloads', savings: 2100, pct: 45, icon: Shield },
  { title: 'Drop debug-level email headers', savings: 1800, pct: 38, icon: Settings },
];

const Card = ({ icon: Icon, label, value, prefix, trend, avg, color, delay }: any) => {
  const counter = useAnimatedCounter(value, 1400 + delay, value < 1 ? 4 : 0);
  const [show, setShow] = useState(false);
  useEffect(() => { const t = setTimeout(() => setShow(true), delay); return () => clearTimeout(t); }, [delay]);
  const up = trend > 0;
  return (
    <div className={`relative overflow-hidden rounded-xl border border-white/10 p-5 transition-all duration-700 ${show ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
      style={{ background: `linear-gradient(135deg, ${color}22, ${color}08)` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="p-2 rounded-lg" style={{ background: `${color}30` }}><Icon size={18} style={{ color }} /></div>
        <span className={`flex items-center text-xs font-medium ${up ? 'text-emerald-400' : 'text-red-400'}`}>
          {up ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(trend)}%
        </span>
      </div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-2xl font-bold text-white">{prefix}{value >= 1000 ? counter.toLocaleString() : counter}</p>
      <p className="text-[10px] text-slate-500 mt-2">Industry avg: {avg}</p>
    </div>
  );
};

export default function PlatformEconomics() {
  const [mounted, setMounted] = useState(false);
  const [savingsRevealed, setSavingsRevealed] = useState(false);
  const [roiInputs, setRoiInputs] = useState({ team: 8, salary: 95000, incidents: 42, incidentCost: 18500 });
  const [pulse, setPulse] = useState(false);
  const [chartDrawn, setChartDrawn] = useState(false);
  const { ref: chartRef, visible: chartVisible } = useInView();

  useEffect(() => { setMounted(true); const t = setTimeout(() => setSavingsRevealed(true), 1800); return () => clearTimeout(t); }, []);
  useEffect(() => { if (chartVisible) { const t = setTimeout(() => setChartDrawn(true), 200); return () => clearTimeout(t); } }, [chartVisible]);

  const updateRoi = useCallback((key: string, delta: number) => {
    setRoiInputs(p => ({ ...p, [key]: Math.max(1, (p as any)[key] + delta) }));
    setPulse(true);
    setTimeout(() => setPulse(false), 600);
  }, []);

  const hoursSaved = roiInputs.team * 12 + roiInputs.incidents * 2.4;
  const costSaved = (hoursSaved * roiInputs.salary / 2080) + (roiInputs.incidents * roiInputs.incidentCost * 0.34);
  const roiPct = ((costSaved - 24800) / 24800 * 100);
  const payback = roiPct > 0 ? (24800 / (costSaved / 12)).toFixed(1) : 'N/A';

  const sentinelAnalytics = totalGB * 2.46 * 30;
  const sentinelLake = totalGB * 0.05 * 30;
  const oxdsi = 24800;
  const savingsPct = ((sentinelAnalytics - oxdsi) / sentinelAnalytics * 100).toFixed(0);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const budgetCap = 28000;
  const currentLine = [22000,23100,23800,24800,25900,27200,28600,30100,31800,33600,35500,37500];
  const optimizedLine = [22000,22400,22200,21800,21500,21200,20800,20500,20200,19800,19500,19200];
  const toSVG = (vals: number[]) => vals.map((v, i) => `${60 + i * 56},${180 - ((v - 18000) / 22000) * 160}`).join(' ');

  let runningTotal = 0;

  return (
    <div className="min-h-screen bg-[#0A1628] text-white p-6 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="text-emerald-400" size={28} /> Platform Economics
            </h1>
            <p className="text-sm text-slate-400 mt-1">Cost intelligence & optimization dashboard</p>
          </div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-slate-300 hover:bg-white/10 flex items-center gap-1"><Download size={14}/>Export</button>
            <button className="px-3 py-1.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/30 flex items-center gap-1"><Eye size={14}/>Live</button>
          </div>
        </div>

        {/* Cost Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card icon={DollarSign} label="Monthly Cost" value={24800} prefix="$" trend={-3.2} avg="$31,200" color="#3B82F6" delay={0} />
          <Card icon={Zap} label="Cost / Event" value={0.0023} prefix="$" trend={-8.1} avg="$0.0041" color="#8B5CF6" delay={100} />
          <Card icon={AlertTriangle} label="Cost / Alert" value={4.72} prefix="$" trend={5.3} avg="$8.90" color="#F59E0B" delay={200} />
          <Card icon={Target} label="Projected Annual" value={285600} prefix="$" trend={-3.2} avg="$374,400" color="#06B6D4" delay={300} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Ingestion Volume */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-5"><BarChart3 size={16} className="text-cyan-400"/>Ingestion Volume Breakdown</h2>
            <div className="space-y-3">
              {ingestion.map((src, i) => {
                const pct = (src.gb / ingestion[0].gb) * 100;
                return (
                  <div key={src.name} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-300">{src.name}</span>
                      <span className="text-slate-400">{src.gb} GB/d <span className="text-slate-500">({((src.gb / totalGB) * 100).toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-3 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full transition-all ease-out" style={{
                        width: mounted ? `${pct}%` : '0%',
                        background: `linear-gradient(90deg, ${src.color}, ${src.color}AA)`,
                        transitionDuration: `${800 + i * 150}ms`,
                        transitionDelay: `${300 + i * 100}ms`,
                      }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 mt-4 flex items-center gap-1"><Database size={12}/> Total: {totalGB.toLocaleString()} GB/day ({(totalGB * 30 / 1000).toFixed(1)} TB/mo)</p>
          </div>

          {/* Cost Comparison */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-5"><TrendingDown size={16} className="text-emerald-400"/>Cost vs Sentinel Comparison</h2>
            <div className="space-y-4">
              {[
                { label: 'Sentinel Analytics', rate: '$2.46/GB', total: sentinelAnalytics, color: '#EF4444' },
                { label: 'Sentinel Data Lake', rate: '$0.05/GB', total: sentinelLake, color: '#F59E0B' },
                { label: '0xDSI Platform', rate: 'flat', total: oxdsi, color: '#10B981' },
              ].map((p) => (
                <div key={p.label} className="flex items-center justify-between p-3 rounded-lg bg-white/[0.03] border border-white/5">
                  <div>
                    <p className="text-xs text-slate-400">{p.label}</p>
                    <p className="text-sm font-mono text-slate-300">{p.rate}</p>
                  </div>
                  <p className="text-lg font-bold" style={{ color: p.color }}>${p.total.toLocaleString()}/mo</p>
                </div>
              ))}
            </div>
            <div className={`mt-4 p-3 rounded-lg border text-center transition-all duration-700 ${savingsRevealed ? 'opacity-100 scale-100 border-emerald-500/40 bg-emerald-500/10' : 'opacity-0 scale-90 border-transparent'}`}>
              <p className="text-xs text-emerald-300">Compared to Sentinel Analytics</p>
              <p className="text-2xl font-bold text-emerald-400 mt-1">You save {savingsPct}%</p>
              <p className="text-xs text-slate-400">${(sentinelAnalytics - oxdsi).toLocaleString()}/mo less</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Cost Optimizer */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-5"><Brain size={16} className="text-purple-400"/>AI Cost Optimizer</h2>
            <div className="space-y-3">
              {optimizations.map((opt, i) => (
                <div key={i} className="p-3 rounded-lg bg-white/[0.03] border border-white/5">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <opt.icon size={14} className="text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-xs text-slate-300">{opt.title}</span>
                    </div>
                    <span className="text-sm font-bold text-emerald-400 whitespace-nowrap">${opt.savings.toLocaleString()}/mo</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-white/5 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-emerald-500 transition-all ease-out"
                        style={{ width: mounted ? `${opt.pct}%` : '0%', transitionDuration: '1200ms', transitionDelay: `${600 + i * 200}ms` }} />
                    </div>
                    <button className="px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 flex items-center gap-0.5">
                      <CheckCircle2 size={10}/>Apply
                    </button>
                  </div>
                </div>
              ))}
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-2"><Zap size={12} className="text-yellow-500"/>Total potential: <span className="text-emerald-400 font-semibold">${optimizations.reduce((s, o) => s + o.savings, 0).toLocaleString()}/mo</span></p>
            </div>
          </div>

          {/* Budget Forecast */}
          <div ref={chartRef} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><TrendingUp size={16} className="text-amber-400"/>12-Month Budget Forecast</h2>
            <svg viewBox="0 0 720 210" className="w-full">
              {/* Grid */}
              {[0, 1, 2, 3, 4].map(i => (
                <g key={i}>
                  <line x1="60" y1={20 + i * 40} x2="690" y2={20 + i * 40} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                  <text x="50" y={25 + i * 40} textAnchor="end" fill="#475569" fontSize="9">${((38000 - i * 5500) / 1000).toFixed(0)}k</text>
                </g>
              ))}
              {months.map((m, i) => (
                <text key={m} x={60 + i * 56} y={200} textAnchor="middle" fill="#475569" fontSize="9">{m}</text>
              ))}
              {/* Budget cap */}
              <line x1="60" y1={180 - ((budgetCap - 18000) / 22000) * 160} x2="690" y2={180 - ((budgetCap - 18000) / 22000) * 160}
                stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="6 4" opacity="0.6" />
              <text x="695" y={180 - ((budgetCap - 18000) / 22000) * 160 + 3} fill="#F59E0B" fontSize="8">Budget</text>
              {/* Current trajectory */}
              <polyline points={toSVG(currentLine)} fill="none" stroke="#EF4444" strokeWidth="2"
                strokeDasharray="800" strokeDashoffset={chartDrawn ? 0 : 800}
                style={{ transition: 'stroke-dashoffset 2s ease-out' }} />
              {/* Optimized */}
              <polyline points={toSVG(optimizedLine)} fill="none" stroke="#10B981" strokeWidth="2"
                strokeDasharray="800" strokeDashoffset={chartDrawn ? 0 : 800}
                style={{ transition: 'stroke-dashoffset 2.5s ease-out 0.3s' }} />
              {/* Legend */}
              <circle cx="80" cy="8" r="4" fill="#EF4444" /><text x="88" y="11" fill="#94A3B8" fontSize="9">Current</text>
              <circle cx="140" cy="8" r="4" fill="#10B981" /><text x="148" y="11" fill="#94A3B8" fontSize="9">Optimized</text>
              <line x1="200" y1="8" x2="220" y2="8" stroke="#F59E0B" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x="225" y="11" fill="#94A3B8" fontSize="9">Budget Cap</text>
            </svg>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ROI Calculator */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-5"><Calculator size={16} className="text-blue-400"/>ROI Calculator</h2>
            <div className="grid grid-cols-2 gap-3 mb-5">
              {[
                { key: 'team', label: 'Team Size', val: roiInputs.team, step: 1 },
                { key: 'salary', label: 'Avg Salary ($)', val: roiInputs.salary, step: 5000 },
                { key: 'incidents', label: 'Incidents/mo', val: roiInputs.incidents, step: 5 },
                { key: 'incidentCost', label: 'Avg Incident Cost ($)', val: roiInputs.incidentCost, step: 1000 },
              ].map(f => (
                <div key={f.key} className="p-2.5 rounded-lg bg-white/[0.03] border border-white/5">
                  <p className="text-[10px] text-slate-500 mb-1.5">{f.label}</p>
                  <div className="flex items-center justify-between">
                    <button onClick={() => updateRoi(f.key, -f.step)} className="w-6 h-6 rounded bg-white/10 flex items-center justify-center hover:bg-white/20"><Minus size={12}/></button>
                    <span className="text-sm font-mono font-bold text-white">{f.val.toLocaleString()}</span>
                    <button onClick={() => updateRoi(f.key, f.step)} className="w-6 h-6 rounded bg-white/10 flex items-center justify-center hover:bg-white/20"><Plus size={12}/></button>
                  </div>
                </div>
              ))}
            </div>
            <div className={`grid grid-cols-2 gap-3 transition-all duration-500 ${pulse ? 'scale-[1.02] brightness-125' : 'scale-100'}`}>
              {[
                { label: 'Hours Saved/mo', value: `${hoursSaved.toFixed(0)}h`, icon: Clock, color: '#3B82F6' },
                { label: 'Cost Saved/mo', value: `$${(costSaved / 1000).toFixed(0)}K`, icon: DollarSign, color: '#10B981' },
                { label: 'ROI', value: `${roiPct.toFixed(0)}%`, icon: TrendingUp, color: '#8B5CF6' },
                { label: 'Payback Period', value: `${payback} mo`, icon: Target, color: '#06B6D4' },
              ].map(r => (
                <div key={r.label} className="p-3 rounded-lg border border-white/5" style={{ background: `${r.color}10` }}>
                  <div className="flex items-center gap-1 mb-1"><r.icon size={12} style={{ color: r.color }}/><span className="text-[10px] text-slate-500">{r.label}</span></div>
                  <p className="text-lg font-bold" style={{ color: r.color }}>{r.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Billing Details */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-4"><ChevronRight size={16} className="text-slate-400"/>Billing Details</h2>
            <div className="overflow-hidden rounded-lg border border-white/5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="text-left p-2.5 text-slate-500 font-medium">Line Item</th>
                    <th className="text-right p-2.5 text-slate-500 font-medium">Usage</th>
                    <th className="text-right p-2.5 text-slate-500 font-medium">Rate</th>
                    <th className="text-right p-2.5 text-slate-500 font-medium">Cost</th>
                    <th className="text-right p-2.5 text-slate-500 font-medium">Running</th>
                  </tr>
                </thead>
                <tbody>
                  {billingRows.map((row) => {
                    runningTotal += row.cost;
                    return (
                      <tr key={row.item} className="border-t border-white/5 hover:bg-white/[0.02]">
                        <td className="p-2.5 text-slate-300">{row.item}</td>
                        <td className="p-2.5 text-right text-slate-400 font-mono">{row.units}</td>
                        <td className="p-2.5 text-right text-slate-500 font-mono">{row.rate}</td>
                        <td className="p-2.5 text-right text-white font-mono font-medium">${row.cost.toLocaleString()}</td>
                        <td className="p-2.5 text-right text-slate-400 font-mono">${runningTotal.toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-white/10 bg-white/[0.03]">
                    <td colSpan={3} className="p-2.5 text-slate-300 font-semibold">Total</td>
                    <td className="p-2.5 text-right text-emerald-400 font-bold font-mono">${billingRows.reduce((s, r) => s + r.cost, 0).toLocaleString()}</td>
                    <td className="p-2.5"></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}