import { useState } from 'react';
import { Shield, Eye, Lock, Radio, Users, AlertTriangle, FileText, Radar, Fingerprint, Satellite } from 'lucide-react';
import ClassifiedInfoFlow from './intel/ClassifiedInfoFlow';
import ClearanceLevelMatrix from './intel/ClearanceLevelMatrix';
import SecureZoneAccessControl from './intel/SCIFAccessControl';
import NetworkSignalMonitor from './intel/SIGINTInterceptor';
import CounterIntelDashboard from './intel/CounterIntelDashboard';
import NeedToKnowCompartments from './intel/NeedToKnowCompartments';

const INTEL_TABS = [
  { key: 'classified', label: 'SENSITIVE DATA FLOW', icon: Lock, color: 'text-red-400' },
  { key: 'clearance', label: 'CLEARANCE MATRIX', icon: Shield, color: 'text-amber-400' },
  { key: 'ntk', label: 'NEED-TO-KNOW', icon: Eye, color: 'text-cyan-400' },
  { key: 'scif', label: 'SECURE ZONE ACCESS', icon: Fingerprint, color: 'text-emerald-400' },
  { key: 'sigint', label: 'NETWORK SIGNALS', icon: Satellite, color: 'text-blue-400' },
  { key: 'counterintel', label: 'INSIDER THREATS', icon: Radar, color: 'text-orange-400' },
] as const;

type IntelTab = typeof INTEL_TABS[number]['key'];

const IntelligenceMonitoring = () => {
  const [activeTab, setActiveTab] = useState<IntelTab>('classified');

  return (
    <div className="space-y-4">
      <div className="enterprise-card overflow-hidden">
        <div className="bg-slate-800/30 px-6 py-3 border-b border-slate-700/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="relative">
                <Shield className="w-5 h-5 text-red-400" />
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              </div>
              <h3 className="text-base font-semibold text-slate-100 tracking-wide">THREAT INTELLIGENCE CENTER</h3>
              <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-[9px] font-mono font-bold border border-red-500/20 animate-pulse">
                RESTRICTED
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded border border-slate-700/30">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-mono font-bold">SECURE CHANNEL</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded border border-red-500/20">
                <AlertTriangle className="w-3 h-3 text-red-400" />
                <span className="text-red-400 text-[10px] font-mono font-bold">NEED-TO-KNOW</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex border-b border-slate-800/50 bg-[#0a0e18] overflow-x-auto">
          {INTEL_TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-[10px] font-mono font-bold tracking-wider whitespace-nowrap transition-all border-b-2 ${
                activeTab === tab.key
                  ? `${tab.color} border-current bg-white/3`
                  : 'text-slate-500 border-transparent hover:text-slate-300 hover:bg-white/2'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'classified' && <ClassifiedInfoFlow />}
      {activeTab === 'clearance' && <ClearanceLevelMatrix />}
      {activeTab === 'ntk' && <NeedToKnowCompartments />}
      {activeTab === 'scif' && <SecureZoneAccessControl />}
      {activeTab === 'sigint' && <NetworkSignalMonitor />}
      {activeTab === 'counterintel' && <CounterIntelDashboard />}
    </div>
  );
};

export default IntelligenceMonitoring;
