import { useState } from 'react';
import { Eye, Lock, Users, AlertTriangle, Check, Shield } from 'lucide-react';

interface Compartment {
  id: string;
  codename: string;
  classification: string;
  description: string;
  programOwner: string;
  accessList: { name: string; role: string; granted: string; lastAccess: string }[];
  pendingRequests: number;
  violations: number;
  status: 'active' | 'restricted' | 'frozen';
}

const COMPARTMENTS: Compartment[] = [
  {
    id: 'PROG-VULN',
    codename: 'VULN SHIELD',
    classification: 'RESTRICTED',
    description: 'Vulnerability management program covering critical infrastructure scanning and zero-day tracking',
    programOwner: 'Dir. Security Engineering, R. Calvelli',
    accessList: [
      { name: 'J. Richardson', role: 'VP Security Ops', granted: '2023-06-15', lastAccess: '2024-03-15 14:22' },
      { name: 'L. Zhang', role: 'Vuln Mgmt Lead', granted: '2023-08-20', lastAccess: '2024-03-15 13:45' },
      { name: 'Dr. E. Nakamura', role: 'Risk Assessment Lead', granted: '2023-11-01', lastAccess: '2024-03-14 16:30' },
    ],
    pendingRequests: 2,
    violations: 0,
    status: 'active',
  },
  {
    id: 'PROG-INSIDER',
    codename: 'INSIDER WATCH',
    classification: 'RESTRICTED',
    description: 'Insider threat detection program monitoring privileged user behavior and data exfiltration indicators',
    programOwner: 'Sr. Insider Threat Analyst, M. Williams',
    accessList: [
      { name: 'J. Richardson', role: 'VP Security Ops', granted: '2022-01-10', lastAccess: '2024-03-15 14:30' },
      { name: 'M. Williams', role: 'Sr. Insider Threat Analyst', granted: '2023-04-22', lastAccess: '2024-03-15 12:15' },
    ],
    pendingRequests: 0,
    violations: 0,
    status: 'restricted',
  },
  {
    id: 'PROG-REDTEAM',
    codename: 'RED FORGE',
    classification: 'RESTRICTED',
    description: 'Offensive security and penetration testing program targeting internal and external attack surfaces',
    programOwner: 'Lead Security Engineer, S. Chen',
    accessList: [
      { name: 'S. Chen', role: 'Lead Security Engineer', granted: '2023-01-15', lastAccess: '2024-03-15 14:28' },
      { name: 'J. Richardson', role: 'VP Security Ops', granted: '2023-01-15', lastAccess: '2024-03-14 09:00' },
      { name: 'T. Murphy', role: 'Digital Forensics Analyst', granted: '2023-06-30', lastAccess: '2024-03-10 11:22' },
    ],
    pendingRequests: 3,
    violations: 1,
    status: 'active',
  },
  {
    id: 'PROG-THREATINTEL',
    codename: 'THREAT HORIZON',
    classification: 'RESTRICTED',
    description: 'Threat intelligence program tracking APT groups, dark web activity, and supply chain compromise indicators',
    programOwner: 'CISO, D. Berrier',
    accessList: [
      { name: 'Dr. E. Nakamura', role: 'Risk Assessment Lead', granted: '2023-03-10', lastAccess: '2024-03-15 14:41' },
      { name: 'J. Richardson', role: 'VP Security Ops', granted: '2022-11-20', lastAccess: '2024-03-15 08:00' },
    ],
    pendingRequests: 1,
    violations: 0,
    status: 'active',
  },
  {
    id: 'PROG-IRPLAN',
    codename: 'RAPID RESPONSE',
    classification: 'RESTRICTED',
    description: 'Incident response playbooks and breach containment procedures for critical business systems',
    programOwner: 'VP Security Ops, J. Richardson',
    accessList: [
      { name: 'J. Richardson', role: 'VP Security Ops', granted: '2021-06-01', lastAccess: '2024-03-15 14:32' },
    ],
    pendingRequests: 0,
    violations: 0,
    status: 'restricted',
  },
  {
    id: 'PROG-DARKWEB',
    codename: 'SHADOW WATCH',
    classification: 'RESTRICTED',
    description: 'Dark web monitoring program tracking leaked credentials, data dumps, and threat actor communications',
    programOwner: 'Dir. Threat Intel, M. Nakasone',
    accessList: [
      { name: 'V. Petrov', role: 'Network Security Analyst', granted: '2023-02-15', lastAccess: '2024-03-15 14:10' },
      { name: 'S. Chen', role: 'Lead Security Engineer', granted: '2023-05-01', lastAccess: '2024-03-14 16:00' },
      { name: 'A. Volkov', role: 'Security Ops Analyst', granted: '2023-02-20', lastAccess: '2024-03-12 09:30' },
    ],
    pendingRequests: 0,
    violations: 2,
    status: 'frozen',
  },
];

const statusColors: Record<string, { bg: string; text: string; border: string }> = {
  active: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20' },
  restricted: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20' },
  frozen: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20' },
};

const NeedToKnowCompartments = () => {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="enterprise-card p-4 border-emerald-900/20">
          <div className="flex items-center gap-2 mb-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span className="text-[10px] font-mono font-bold text-emerald-400 tracking-wider">ACTIVE PROGRAMS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-emerald-400">{COMPARTMENTS.filter(c => c.status === 'active').length}</div>
        </div>
        <div className="enterprise-card p-4 border-amber-900/20">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] font-mono font-bold text-amber-400 tracking-wider">RESTRICTED</span>
          </div>
          <div className="text-2xl font-mono font-bold text-amber-400">{COMPARTMENTS.filter(c => c.status === 'restricted').length}</div>
        </div>
        <div className="enterprise-card p-4 border-red-900/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span className="text-[10px] font-mono font-bold text-red-400 tracking-wider">FROZEN / VIOLATIONS</span>
          </div>
          <div className="text-2xl font-mono font-bold text-red-400">{COMPARTMENTS.filter(c => c.status === 'frozen').length}</div>
        </div>
      </div>

      <div className="space-y-3">
        {COMPARTMENTS.map(comp => {
          const sc = statusColors[comp.status];
          const isExpanded = expanded === comp.id;
          return (
            <div key={comp.id} className="enterprise-card overflow-hidden">
              <div
                className="px-4 py-3 cursor-pointer hover:bg-white/2 transition-colors"
                onClick={() => setExpanded(isExpanded ? null : comp.id)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800/50 border border-slate-700/30 flex items-center justify-center">
                    <Eye className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono font-bold text-slate-200">{comp.codename}</span>
                      <span className="px-1.5 py-0.5 rounded text-[7px] font-mono font-bold bg-red-500/10 text-red-400 border border-red-500/20">{comp.classification}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[7px] font-mono font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>{comp.status.toUpperCase()}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{comp.description}</p>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono">
                    <div>
                      <span className="text-slate-600">CLEARED: </span>
                      <span className="text-cyan-400 font-bold">{comp.accessList.length}</span>
                    </div>
                    {comp.pendingRequests > 0 && (
                      <div>
                        <span className="text-slate-600">PENDING: </span>
                        <span className="text-amber-400 font-bold">{comp.pendingRequests}</span>
                      </div>
                    )}
                    {comp.violations > 0 && (
                      <div>
                        <span className="text-slate-600">VIOLATIONS: </span>
                        <span className="text-red-400 font-bold">{comp.violations}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-slate-800/30 px-4 py-3 bg-slate-900/20">
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className="w-3 h-3 text-slate-500" />
                    <span className="text-[10px] font-mono font-bold text-slate-400 tracking-wider">PROGRAM OWNER: {comp.programOwner}</span>
                  </div>
                  <div className="space-y-1.5">
                    {comp.accessList.map(person => (
                      <div key={person.name} className="flex items-center gap-3 px-3 py-2 rounded bg-slate-800/30 border border-slate-800/20">
                        <Users className="w-3 h-3 text-cyan-400" />
                        <span className="text-xs text-slate-200 w-40 truncate">{person.name}</span>
                        <span className="text-[9px] font-mono text-slate-500 w-32 truncate">{person.role}</span>
                        <span className="text-[9px] font-mono text-slate-600">Granted: {person.granted}</span>
                        <span className="text-[9px] font-mono text-cyan-400/60 ml-auto">Last: {person.lastAccess}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default NeedToKnowCompartments;
