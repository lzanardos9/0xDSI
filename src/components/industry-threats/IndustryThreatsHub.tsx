import { useState } from 'react';
import {
  Radio, Factory, Heart, Zap, ShoppingCart, Navigation, BookOpen, Package,
  DollarSign, ChevronRight, Shield, Activity, TrendingUp, AlertTriangle
} from 'lucide-react';
import TelcoThreats from './TelcoThreats';
import ManufacturingThreats from './ManufacturingThreats';
import HealthcareThreats from './HealthcareThreats';
import EnergyThreats from './EnergyThreats';
import RetailThreats from './RetailThreats';
import AviationThreats from './AviationThreats';
import EducationThreats from './EducationThreats';
import CPGThreats from './CPGThreats';

const INDUSTRIES = [
  { id: 'telco', label: 'Telecom', icon: Radio, color: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30', text: 'text-blue-400', threats: 2847, critical: 34, description: 'SS7, Diameter, SIM Swap, 5G Core' },
  { id: 'manufacturing', label: 'Manufacturing', icon: Factory, color: 'from-orange-500/20 to-red-500/20', border: 'border-orange-500/30', text: 'text-orange-400', threats: 1203, critical: 18, description: 'PLC/SCADA, OT Networks, Purdue Model' },
  { id: 'healthcare', label: 'Healthcare & Life Sciences', icon: Heart, color: 'from-red-500/20 to-rose-500/20', border: 'border-red-500/30', text: 'text-red-400', threats: 956, critical: 12, description: 'Medical Devices, PHI/HIPAA, FDA' },
  { id: 'energy', label: 'Energy & Utilities', icon: Zap, color: 'from-emerald-500/20 to-green-500/20', border: 'border-emerald-500/30', text: 'text-emerald-400', threats: 1567, critical: 23, description: 'Grid SCADA, Pipeline, Smart Meters, NERC CIP' },
  { id: 'retail', label: 'Retail & E-Commerce', icon: ShoppingCart, color: 'from-teal-500/20 to-emerald-500/20', border: 'border-teal-500/30', text: 'text-teal-400', threats: 3421, critical: 41, description: 'POS Malware, E-Commerce Fraud, PCI DSS' },
  { id: 'aviation', label: 'Aviation & Maritime', icon: Navigation, color: 'from-sky-500/20 to-blue-500/20', border: 'border-sky-500/30', text: 'text-sky-400', threats: 678, critical: 8, description: 'ADS-B, ATC Systems, Maritime VSAT' },
  { id: 'education', label: 'Education', icon: BookOpen, color: 'from-blue-500/20 to-emerald-500/20', border: 'border-blue-500/30', text: 'text-blue-400', threats: 1892, critical: 15, description: 'Student Data, Research IP, Campus Network' },
  { id: 'cpg', label: 'Consumer Packaged Goods', icon: Package, color: 'from-amber-500/20 to-orange-500/20', border: 'border-amber-500/30', text: 'text-amber-400', threats: 2134, critical: 29, description: 'Supply Chain, Anti-Counterfeit, Formula IP, Food Safety' },
] as const;

type IndustryId = typeof INDUSTRIES[number]['id'];

export default function IndustryThreatsHub({ initialIndustry }: { initialIndustry?: string }) {
  const [selected, setSelected] = useState<IndustryId | null>(
    (initialIndustry as IndustryId) || null
  );

  if (selected) {
    return (
      <div className="min-h-screen bg-[#0A1628]">
        <div className="px-6 py-3 border-b border-[#1e293b] flex items-center gap-2">
          <button onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-400 transition-colors">
            <ChevronRight size={14} className="rotate-180" />All Industries
          </button>
          <ChevronRight size={12} className="text-slate-700" />
          <span className="text-xs text-cyan-400 font-medium">
            {INDUSTRIES.find(i => i.id === selected)?.label}
          </span>
        </div>
        {selected === 'telco' && <TelcoThreats />}
        {selected === 'manufacturing' && <ManufacturingThreats />}
        {selected === 'healthcare' && <HealthcareThreats />}
        {selected === 'energy' && <EnergyThreats />}
        {selected === 'retail' && <RetailThreats />}
        {selected === 'aviation' && <AviationThreats />}
        {selected === 'education' && <EducationThreats />}
        {selected === 'cpg' && <CPGThreats />}
      </div>
    );
  }

  const totalThreats = INDUSTRIES.reduce((a, i) => a + i.threats, 0);
  const totalCritical = INDUSTRIES.reduce((a, i) => a + i.critical, 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Shield size={20} className="text-cyan-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">Industry Threat Intelligence</h2>
            <p className="text-xs text-slate-500">Sector-specific threat monitoring across {INDUSTRIES.length} industries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[10px] font-bold font-mono text-emerald-400 tracking-wider">ALL SECTORS ACTIVE</span>
          </span>
          <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
            0xDSI PLATFORM
          </span>
        </div>
      </div>

      {/* Global stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Total Industry Threats', value: totalThreats.toLocaleString(), icon: <AlertTriangle size={14} />, color: 'text-red-400' },
          { label: 'Critical Alerts', value: totalCritical.toString(), icon: <Shield size={14} />, color: 'text-orange-400' },
          { label: 'Industries Monitored', value: INDUSTRIES.length.toString(), icon: <Activity size={14} />, color: 'text-cyan-400' },
          { label: 'Threat Coverage', value: '99.4%', icon: <TrendingUp size={14} />, color: 'text-emerald-400' },
        ].map((s, i) => (
          <div key={i} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
            <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-1">{s.icon}{s.label}</div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Industry cards grid */}
      <div className="grid grid-cols-2 gap-4">
        {INDUSTRIES.map(ind => {
          const Icon = ind.icon;
          return (
            <button key={ind.id} onClick={() => setSelected(ind.id)}
              className={`bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5 text-left transition-all hover:border-slate-600 hover:bg-[#0d1424] group`}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${ind.color} border ${ind.border} flex items-center justify-center`}>
                    <Icon size={18} className={ind.text} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">{ind.label}</h3>
                    <p className="text-[10px] text-slate-500 mt-0.5">{ind.description}</p>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-600 group-hover:text-cyan-400 transition-colors mt-1" />
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex items-center justify-between text-[10px] mb-1">
                    <span className="text-slate-500">Active Threats</span>
                    <span className={ind.text}>{ind.threats.toLocaleString()}</span>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-700`}
                      style={{
                        width: `${Math.min(100, (ind.threats / 3500) * 100)}%`,
                        backgroundColor: ind.text.includes('red') ? '#EF4444' : ind.text.includes('orange') ? '#F97316' : ind.text.includes('emerald') ? '#10B981' : ind.text.includes('teal') ? '#14B8A6' : ind.text.includes('sky') ? '#0EA5E9' : '#3B82F6',
                      }} />
                  </div>
                </div>
                <div className="text-center shrink-0">
                  <div className="text-lg font-bold text-red-400">{ind.critical}</div>
                  <div className="text-[9px] text-slate-600 uppercase">Critical</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}


export default IndustryThreatsHub