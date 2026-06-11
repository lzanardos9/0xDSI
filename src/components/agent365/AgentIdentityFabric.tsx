import { useState } from 'react';
import { Fingerprint, Shield, Key, Link, CheckCircle2, AlertTriangle, Lock, Globe, Server, Clock } from 'lucide-react';

const AGENTS = [
  { id: 'agent-001', name: 'Triage Agent', did: 'did:0xdsi:agent:triage-001', certFingerprint: 'SHA-256:8f:3a:c7:92:d1:e5:...', certExpiry: '2027-03-15', trustLevel: 'critical', capabilities: ['event_read', 'alert_create', 'case_escalate'], dataBoundaries: ['events_bronze', 'alerts_silver'], attestations: 4, lastRotation: '2026-06-08T14:00:00Z', status: 'active', issuer: '0xDSI Root CA', keyAlgo: 'Ed25519', dpopBound: true },
  { id: 'agent-002', name: 'Enrichment Agent', did: 'did:0xdsi:agent:enrichment-002', certFingerprint: 'SHA-256:4b:7e:a1:f3:02:c8:...', certExpiry: '2027-01-22', trustLevel: 'high', capabilities: ['threat_intel_read', 'ioc_enrich', 'geo_lookup'], dataBoundaries: ['threat_feeds', 'ioc_store', 'geo_data'], attestations: 3, lastRotation: '2026-06-05T09:30:00Z', status: 'active', issuer: '0xDSI Root CA', keyAlgo: 'Ed25519', dpopBound: true },
  { id: 'agent-003', name: 'Threat Hunter', did: 'did:0xdsi:agent:hunter-003', certFingerprint: 'SHA-256:c2:d9:f0:11:88:3b:...', certExpiry: '2027-06-01', trustLevel: 'critical', capabilities: ['full_data_read', 'query_execute', 'vector_search', 'graph_traverse'], dataBoundaries: ['*_gold', 'vector_index', 'graph_store'], attestations: 5, lastRotation: '2026-06-10T11:15:00Z', status: 'active', issuer: '0xDSI Root CA', keyAlgo: 'Ed25519', dpopBound: true },
  { id: 'agent-004', name: 'Response Orchestrator', did: 'did:0xdsi:agent:vanguard-007', certFingerprint: 'SHA-256:f7:a2:e8:44:91:bb:...', certExpiry: '2026-12-18', trustLevel: 'critical', capabilities: ['action_execute', 'firewall_modify', 'user_disable', 'case_create'], dataBoundaries: ['response_actions', 'firewall_api', 'iam_api'], attestations: 6, lastRotation: '2026-06-09T16:45:00Z', status: 'active', issuer: '0xDSI Root CA', keyAlgo: 'Ed25519', dpopBound: true },
  { id: 'agent-005', name: 'Shadow AI Detector', did: 'did:0xdsi:agent:shadow-057', certFingerprint: 'SHA-256:91:cc:b4:7a:d3:0f:...', certExpiry: '2027-02-28', trustLevel: 'high', capabilities: ['dns_monitor', 'tls_inspect', 'network_scan'], dataBoundaries: ['network_telemetry', 'dns_logs', 'cert_store'], attestations: 3, lastRotation: '2026-06-07T08:20:00Z', status: 'degraded', issuer: '0xDSI Root CA', keyAlgo: 'Ed25519', dpopBound: true },
  { id: 'agent-006', name: 'Compliance Guardian', did: 'did:0xdsi:agent:guardian-043', certFingerprint: 'SHA-256:2e:45:d8:f1:a7:6c:...', certExpiry: '2026-09-01', trustLevel: 'high', capabilities: ['policy_read', 'audit_log_read', 'compliance_report'], dataBoundaries: ['audit_logs', 'policy_store', 'compliance_evidence'], attestations: 4, lastRotation: '2026-06-04T13:00:00Z', status: 'active', issuer: '0xDSI Root CA', keyAlgo: 'Ed25519', dpopBound: false },
];

const TRUST_COLORS: Record<string, string> = { critical: 'text-red-400 bg-red-500/10 border-red-500/20', high: 'text-amber-400 bg-amber-500/10 border-amber-500/20', medium: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
const STATUS_COLORS: Record<string, string> = { active: 'text-emerald-400', degraded: 'text-amber-400', quarantined: 'text-red-400' };

const AgentIdentityFabric = () => {
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/30 flex items-center justify-center">
            <Fingerprint className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Agent Identity Fabric</h2>
            <p className="text-[10px] text-slate-500">DID-based decentralized identity + X.509 certificates + DPoP binding</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500">{AGENTS.length} identities shown</span>
          <div className="px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[9px] text-emerald-400 font-medium">Root CA: Valid</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-2">
          {AGENTS.map((agent) => (
            <div key={agent.id} onClick={() => setSelectedAgent(agent.id === selectedAgent ? null : agent.id)}
              className={`p-3 rounded-lg border transition-all cursor-pointer ${agent.id === selectedAgent ? 'bg-slate-800/60 border-cyan-500/40 ring-1 ring-cyan-500/20' : 'bg-slate-800/30 border-slate-700/40 hover:border-slate-600/60'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-lg bg-slate-700/50 flex items-center justify-center"><Key className="w-4 h-4 text-slate-300" /></div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${agent.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-100">{agent.name}</span>
                      <span className={`text-[9px] font-medium ${STATUS_COLORS[agent.status]}`}>{agent.status.toUpperCase()}</span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">{agent.did}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${TRUST_COLORS[agent.trustLevel]}`}>{agent.trustLevel}</span>
                  <div className="flex items-center gap-1"><Shield className="w-3 h-3 text-slate-500" /><span className="text-[10px] text-slate-400">{agent.attestations}</span></div>
                  {agent.dpopBound && <Lock className="w-3 h-3 text-cyan-400" />}
                </div>
              </div>
              {agent.id === selectedAgent && (
                <div className="mt-3 pt-3 border-t border-slate-700/50 grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Capabilities</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.capabilities.map(cap => (<span key={cap} className="px-1.5 py-0.5 bg-slate-700/50 border border-slate-600/30 rounded text-[9px] text-slate-300 font-mono">{cap}</span>))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Data Boundaries</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {agent.dataBoundaries.map(db => (<span key={db} className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[9px] text-blue-300 font-mono">{db}</span>))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Certificate</span>
                    <div className="mt-1 space-y-0.5">
                      <p className="text-[10px] text-slate-300 font-mono">{agent.certFingerprint}</p>
                      <p className="text-[10px] text-slate-400">Expires: {agent.certExpiry} | Algo: {agent.keyAlgo}</p>
                    </div>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Last Key Rotation</span>
                    <p className="text-[10px] text-slate-300 mt-1">{new Date(agent.lastRotation).toLocaleString()}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Trust Chain</h3>
            <div className="space-y-2">
              {['0xDSI Root CA', 'Intermediate CA (Agent Issuing)', 'Agent Identity (Leaf)'].map((level, i) => (
                <div key={level} className="flex items-center gap-2">
                  <div className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${i === 0 ? 'bg-emerald-500/20 text-emerald-400' : i === 1 ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-700/50 text-slate-300'}`}>{i + 1}</div>
                  <span className="text-[10px] text-slate-300">{level}</span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/40 border border-slate-700/40">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Identity Stats</h3>
            <div className="space-y-2">
              {[{ label: 'Total Agents', value: '60' }, { label: 'DID Registered', value: '60/60' }, { label: 'Cert Valid', value: '58/60' }, { label: 'DPoP Bound', value: '55/60' }, { label: 'Avg Rotation', value: '72h' }].map(stat => (
                <div key={stat.label} className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-400">{stat.label}</span>
                  <span className="text-[10px] text-slate-200 font-medium">{stat.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-500/5 to-blue-600/5 border border-cyan-500/20">
            <div className="flex items-center gap-1.5 mb-1"><Globe className="w-3 h-3 text-cyan-400" /><span className="text-[10px] text-cyan-400 font-semibold">Decentralized Identity</span></div>
            <p className="text-[9px] text-slate-400 leading-relaxed">Unlike Microsoft Entra Agent ID (centralized), 0xDSI uses W3C DID + Verifiable Credentials. No vendor lock-in. Cross-platform interoperable. Self-sovereign agent identity.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentIdentityFabric;
