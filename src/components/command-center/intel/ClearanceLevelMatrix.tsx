import { useState } from 'react';
import { Shield, ChevronDown, ChevronUp, AlertTriangle, Check, X, Clock } from 'lucide-react';

interface Personnel {
  name: string;
  role: string;
  agency: string;
  clearance: 'TS/SCI' | 'TOP SECRET' | 'SECRET' | 'CONFIDENTIAL';
  polygraph: 'CI Poly' | 'Full Scope' | 'None' | 'Expired';
  sciAccess: string[];
  lastReview: string;
  status: 'active' | 'suspended' | 'under_review' | 'revoked';
  riskScore: number;
}

const CLEARANCE_LEVELS = [
  { level: 'TS/SCI', color: '#ef4444', count: 12, label: 'Top Secret / SCI' },
  { level: 'TOP SECRET', color: '#f97316', count: 28, label: 'Top Secret' },
  { level: 'SECRET', color: '#eab308', count: 67, label: 'Secret' },
  { level: 'CONFIDENTIAL', color: '#3b82f6', count: 143, label: 'Confidential' },
];

const MOCK_PERSONNEL: Personnel[] = [
  { name: 'ADM. James Richardson', role: 'Director of Operations', agency: 'CIA/NCS', clearance: 'TS/SCI', polygraph: 'Full Scope', sciAccess: ['TK', 'SI', 'GAMMA', 'HCS'], lastReview: '2024-01-15', status: 'active', riskScore: 8 },
  { name: 'COL. Sarah Chen', role: 'Cyber Operations Lead', agency: 'CYBERCOM', clearance: 'TS/SCI', polygraph: 'Full Scope', sciAccess: ['TK', 'SI', 'NOFORN'], lastReview: '2024-02-20', status: 'active', riskScore: 12 },
  { name: 'SAC Michael Williams', role: 'CI Division Chief', agency: 'FBI/NSD', clearance: 'TS/SCI', polygraph: 'CI Poly', sciAccess: ['SI', 'HCS', 'ORCON'], lastReview: '2023-11-30', status: 'active', riskScore: 15 },
  { name: 'Dr. Emily Nakamura', role: 'WMD Analyst', agency: 'DIA', clearance: 'TOP SECRET', polygraph: 'CI Poly', sciAccess: ['TK', 'SI'], lastReview: '2024-03-01', status: 'active', riskScore: 22 },
  { name: 'LCDR. Viktor Petrov', role: 'SIGINT Specialist', agency: 'NSA/CSS', clearance: 'TS/SCI', polygraph: 'Full Scope', sciAccess: ['SI', 'GAMMA', 'DELTA'], lastReview: '2023-09-15', status: 'under_review', riskScore: 67 },
  { name: 'Agt. David Park', role: 'Case Officer', agency: 'CIA/DO', clearance: 'TOP SECRET', polygraph: 'Full Scope', sciAccess: ['HCS'], lastReview: '2024-01-28', status: 'active', riskScore: 18 },
  { name: 'Ms. Rachel Torres', role: 'Liaison Officer', agency: 'State/INR', clearance: 'SECRET', polygraph: 'None', sciAccess: [], lastReview: '2023-12-10', status: 'active', riskScore: 31 },
  { name: 'Mr. Andrei Volkov', role: 'Translation Services', agency: 'NSA/SID', clearance: 'TS/SCI', polygraph: 'CI Poly', sciAccess: ['SI', 'COMINT'], lastReview: '2023-06-22', status: 'suspended', riskScore: 89 },
  { name: 'CAPT. Lisa Zhang', role: 'IMINT Analyst', agency: 'NRO', clearance: 'TS/SCI', polygraph: 'Full Scope', sciAccess: ['TK', 'BYEMAN'], lastReview: '2024-02-14', status: 'active', riskScore: 10 },
  { name: 'SSA. Thomas Murphy', role: 'Cyber Forensics', agency: 'FBI/CyD', clearance: 'TOP SECRET', polygraph: 'Expired', sciAccess: ['SI'], lastReview: '2023-04-18', status: 'under_review', riskScore: 54 },
];

const clearanceColor = (c: string) => {
  switch (c) {
    case 'TS/SCI': return { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400' };
    case 'TOP SECRET': return { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400' };
    case 'SECRET': return { bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', text: 'text-yellow-400' };
    default: return { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400' };
  }
};

const statusIcon = (s: string) => {
  switch (s) {
    case 'active': return <Check className="w-3 h-3 text-emerald-400" />;
    case 'suspended': return <X className="w-3 h-3 text-red-400" />;
    case 'under_review': return <Clock className="w-3 h-3 text-amber-400 animate-pulse" />;
    case 'revoked': return <AlertTriangle className="w-3 h-3 text-red-500" />;
    default: return null;
  }
};

const ClearanceLevelMatrix = () => {
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'risk' | 'name' | 'clearance'>('risk');

  const sorted = [...MOCK_PERSONNEL].sort((a, b) => {
    if (sortBy === 'risk') return b.riskScore - a.riskScore;
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    const order = ['TS/SCI', 'TOP SECRET', 'SECRET', 'CONFIDENTIAL'];
    return order.indexOf(a.clearance) - order.indexOf(b.clearance);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {CLEARANCE_LEVELS.map(cl => (
          <div key={cl.level} className="enterprise-card p-4" style={{ borderColor: cl.color + '20' }}>
            <div className="flex items-center justify-between mb-2">
              <Shield className="w-4 h-4" style={{ color: cl.color }} />
              <span className="text-xl font-mono font-bold" style={{ color: cl.color }}>{cl.count}</span>
            </div>
            <div className="text-[10px] font-mono font-bold tracking-wider" style={{ color: cl.color }}>{cl.level}</div>
            <div className="text-[9px] font-mono text-slate-500">{cl.label}</div>
            <div className="mt-2 h-1 rounded-full bg-slate-800">
              <div className="h-1 rounded-full transition-all" style={{ backgroundColor: cl.color + '60', width: `${(cl.count / 143) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className="enterprise-card overflow-hidden">
        <div className="bg-slate-800/20 px-4 py-2 border-b border-slate-800/30 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-mono font-bold text-slate-300 tracking-wider">PERSONNEL CLEARANCE REGISTRY</span>
          </div>
          <div className="flex items-center gap-1">
            {(['risk', 'name', 'clearance'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all ${
                  sortBy === s ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {s.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-800/20 max-h-[450px] overflow-y-auto custom-scrollbar">
          {sorted.map(p => {
            const cc = clearanceColor(p.clearance);
            const isExpanded = expandedPerson === p.name;
            const riskColor = p.riskScore >= 70 ? 'text-red-400' : p.riskScore >= 40 ? 'text-amber-400' : p.riskScore >= 20 ? 'text-yellow-400' : 'text-emerald-400';
            const riskBg = p.riskScore >= 70 ? 'bg-red-500/10' : p.riskScore >= 40 ? 'bg-amber-500/10' : p.riskScore >= 20 ? 'bg-yellow-500/10' : 'bg-emerald-500/10';

            return (
              <div
                key={p.name}
                className={`px-4 py-2.5 hover:bg-white/2 cursor-pointer transition-colors ${p.status === 'suspended' ? 'opacity-70' : ''}`}
                onClick={() => setExpandedPerson(isExpanded ? null : p.name)}
              >
                <div className="flex items-center gap-3">
                  {statusIcon(p.status)}
                  <span className="text-xs text-slate-200 font-medium w-48 truncate">{p.name}</span>
                  <span className="text-[10px] font-mono text-slate-500 w-28 truncate">{p.agency}</span>
                  <div className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold border ${cc.bg} ${cc.border} ${cc.text}`}>
                    {p.clearance}
                  </div>
                  <div className="flex-1 flex items-center gap-1">
                    {p.sciAccess.map(sci => (
                      <span key={sci} className="px-1 py-0.5 rounded bg-slate-800/50 text-[7px] font-mono text-slate-400 border border-slate-700/30">
                        {sci}
                      </span>
                    ))}
                  </div>
                  <div className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${riskBg} ${riskColor}`}>
                    RISK: {p.riskScore}
                  </div>
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                </div>

                {isExpanded && (
                  <div className="mt-3 ml-6 grid grid-cols-3 gap-3">
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">ROLE</div>
                      <div className="text-[10px] font-mono text-slate-300">{p.role}</div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">POLYGRAPH</div>
                      <div className={`text-[10px] font-mono ${p.polygraph === 'Expired' ? 'text-red-400' : p.polygraph === 'None' ? 'text-slate-400' : 'text-emerald-400'}`}>
                        {p.polygraph}
                      </div>
                    </div>
                    <div className="bg-slate-900/40 rounded p-2 border border-slate-800/30">
                      <div className="text-[8px] font-mono text-slate-600 mb-0.5">LAST REVIEW</div>
                      <div className="text-[10px] font-mono text-slate-300">{p.lastReview}</div>
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

export default ClearanceLevelMatrix;
