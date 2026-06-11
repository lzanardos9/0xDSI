import { useState } from 'react';
import { Database, Lock, CheckCircle2, Hash, AlertTriangle, Link, Shield, Clock } from 'lucide-react';

const AUDIT_ENTRIES = [
  { id: 'entry-001', timestamp: '2026-06-11T11:14:32Z', action: 'AGENT_STATE_CHANGE', actor: 'lifecycle-orchestrator', target: 'agent:threat-hunter-v4', hash: '8f3ac792d1e5f7b2', previousHash: 'c7e4b1a90f2d3168', verified: true, category: 'lifecycle', details: 'State transition: draft -> staged (canary initiated at 10%)' },
  { id: 'entry-002', timestamp: '2026-06-11T11:12:08Z', action: 'POLICY_ENFORCEMENT', actor: 'gateway-guardian', target: 'prompt:DAN-injection-attempt', hash: 'c7e4b1a90f2d3168', previousHash: '4b7ea1f302c81954', verified: true, category: 'policy', details: 'Blocked jailbreak attempt (DAN persona injection) from j.walker@corp.com' },
  { id: 'entry-003', timestamp: '2026-06-11T11:09:45Z', action: 'IDENTITY_ROTATION', actor: 'cert-manager', target: 'agent:triage-001', hash: '4b7ea1f302c81954', previousHash: 'f7a2e84491bb6c30', verified: true, category: 'identity', details: 'Key rotation completed: Ed25519 keypair regenerated, DPoP token rebound' },
  { id: 'entry-004', timestamp: '2026-06-11T11:05:12Z', action: 'AUTONOMOUS_RESPONSE', actor: 'vanguard-response-agent', target: 'user:j.walker@corp.com', hash: 'f7a2e84491bb6c30', previousHash: '91ccb47ad30f2e45', verified: true, category: 'response', details: 'Session terminated + MFA challenge forced (insider risk score 92)' },
  { id: 'entry-005', timestamp: '2026-06-11T10:58:30Z', action: 'DATA_ACCESS_AUDIT', actor: 'enrichment-agent-002', target: 'table:threat_feeds_gold', hash: '91ccb47ad30f2e45', previousHash: '2e45d8f1a76c3390', verified: true, category: 'access', details: 'Authorized read: 847 records from threat_feeds_gold (within declared boundary)' },
  { id: 'entry-006', timestamp: '2026-06-11T10:52:18Z', action: 'BOUNDARY_VIOLATION', actor: 'enrichment-agent-002', target: 'table:hr_employee_records', hash: '2e45d8f1a76c3390', previousHash: 'd9f01188bb44c271', verified: true, category: 'access', details: 'DENIED: Agent attempted access outside declared data boundary' },
  { id: 'entry-007', timestamp: '2026-06-11T10:45:00Z', action: 'POLICY_UPDATE', actor: 'admin:luiz@0xdsi.com', target: 'policy:shadow-ai-v3', hash: 'd9f01188bb44c271', previousHash: 'a7c32f91d4e8b500', verified: true, category: 'policy', details: 'Updated DNS exfiltration threshold from 500 to 200 requests/hour' },
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  policy: { bg: 'bg-blue-500/10', text: 'text-blue-400' },
  identity: { bg: 'bg-cyan-500/10', text: 'text-cyan-400' },
  response: { bg: 'bg-red-500/10', text: 'text-red-400' },
  access: { bg: 'bg-amber-500/10', text: 'text-amber-400' },
  lifecycle: { bg: 'bg-emerald-500/10', text: 'text-emerald-400' },
};

const ImmutableAuditLedger = () => {
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const filtered = filterCategory === 'all' ? AUDIT_ENTRIES : AUDIT_ENTRIES.filter(e => e.category === filterCategory);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-500/20 to-orange-600/20 border border-amber-500/30 flex items-center justify-center">
            <Database className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Immutable Audit Ledger</h2>
            <p className="text-[10px] text-slate-500">Append-only Merkle tree with cryptographic tamper evidence</p>
          </div>
        </div>
        <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] text-emerald-400 font-medium flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> Chain Integrity: Verified
        </div>
      </div>

      {/* Stats */}
      <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/40">
        <div className="grid grid-cols-4 gap-3">
          {[{ label: 'Total Entries', value: '1,247,832' }, { label: 'Tree Depth', value: '21' }, { label: 'Last Verified', value: '2s ago' }, { label: 'Tamper Attempts', value: '0' }].map(stat => (
            <div key={stat.label} className="text-center">
              <div className="text-sm font-bold text-slate-200">{stat.value}</div>
              <div className="text-[9px] text-slate-500">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1">
        {['all', 'policy', 'identity', 'response', 'access', 'lifecycle'].map(cat => (
          <button key={cat} onClick={() => setFilterCategory(cat)}
            className={`px-2 py-1 rounded text-[9px] font-medium border transition-colors ${filterCategory === cat ? 'bg-slate-700/50 border-slate-600/50 text-white' : 'bg-slate-800/20 border-slate-700/30 text-slate-500 hover:text-slate-300'}`}>
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Entries */}
      <div className="space-y-1">
        {filtered.map((entry) => {
          const cat = CATEGORY_COLORS[entry.category];
          const isExpanded = expandedEntry === entry.id;
          return (
            <div key={entry.id} onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
              className={`p-2.5 rounded-lg border transition-all cursor-pointer ${isExpanded ? 'bg-slate-800/60 border-cyan-500/30' : 'bg-slate-800/20 border-slate-700/30 hover:border-slate-600/50'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-6 h-6 rounded flex items-center justify-center ${cat.bg}`}>
                  <Shield className={`w-3 h-3 ${cat.text}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold text-slate-200">{entry.action}</span>
                    <span className={`px-1 py-0.5 rounded text-[8px] font-medium ${cat.bg} ${cat.text}`}>{entry.category}</span>
                  </div>
                  <p className="text-[9px] text-slate-400 truncate">{entry.details}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="text-right">
                    <div className="flex items-center gap-1"><Hash className="w-2.5 h-2.5 text-slate-500" /><span className="text-[8px] text-slate-500 font-mono">{entry.hash}</span></div>
                    <span className="text-[8px] text-slate-600">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                </div>
              </div>
              {isExpanded && (
                <div className="mt-2 pt-2 border-t border-slate-700/40 ml-9 grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1"><span className="text-[8px] text-slate-500">Actor:</span><span className="text-[9px] text-slate-300 font-mono">{entry.actor}</span></div>
                    <div className="flex items-center gap-1"><span className="text-[8px] text-slate-500">Target:</span><span className="text-[9px] text-slate-300 font-mono">{entry.target}</span></div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-1"><Link className="w-2.5 h-2.5 text-slate-500" /><span className="text-[8px] text-slate-500">Hash:</span><span className="text-[9px] text-cyan-400 font-mono">{entry.hash}</span></div>
                    <div className="flex items-center gap-1"><Link className="w-2.5 h-2.5 text-slate-500" /><span className="text-[8px] text-slate-500">Prev:</span><span className="text-[9px] text-slate-400 font-mono">{entry.previousHash}</span></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Compliance */}
      <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/40">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">Compliance Certifications Met</span>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          {['SEC 17a-4', 'HIPAA Audit', 'SOC 2 Type II', 'GDPR Art.30', 'NIST AI RMF'].map(cert => (
            <div key={cert} className="flex items-center gap-1 px-2 py-1 bg-emerald-500/5 border border-emerald-500/20 rounded">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span className="text-[9px] text-emerald-300 font-medium">{cert}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ImmutableAuditLedger;
