import { useState } from 'react';
import { ChevronDown, ChevronUp, Wifi, Server, Monitor, Database, Globe, Key, Radio } from 'lucide-react';

interface TableProps {
  honeypots: any[];
}

const TYPE_ICONS: Record<string, typeof Wifi> = {
  ssh: Key,
  http: Globe,
  smb: Server,
  rdp: Monitor,
  database: Database,
  ftp: Server,
  dns: Radio,
  api: Wifi,
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  triggered: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  compromised: 'bg-red-500/15 text-red-400 border-red-500/30 animate-pulse',
  inactive: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const RISK_STYLES: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-amber-400',
  low: 'text-emerald-400',
};

const HoneypotTable = ({ honeypots }: TableProps) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<'interaction_count' | 'last_interaction_at' | 'risk_level'>('interaction_count');
  const [sortAsc, setSortAsc] = useState(false);

  const riskOrder: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };

  const sorted = [...honeypots].sort((a, b) => {
    if (sortBy === 'risk_level') {
      const diff = (riskOrder[b.risk_level] || 0) - (riskOrder[a.risk_level] || 0);
      return sortAsc ? -diff : diff;
    }
    if (sortBy === 'last_interaction_at') {
      const diff = new Date(b.last_interaction_at || 0).getTime() - new Date(a.last_interaction_at || 0).getTime();
      return sortAsc ? -diff : diff;
    }
    const diff = b.interaction_count - a.interaction_count;
    return sortAsc ? -diff : diff;
  });

  const handleSort = (col: typeof sortBy) => {
    if (sortBy === col) setSortAsc(!sortAsc);
    else { setSortBy(col); setSortAsc(false); }
  };

  const SortIcon = ({ col }: { col: typeof sortBy }) => (
    sortBy === col
      ? sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
      : <ChevronDown className="w-3 h-3 opacity-30" />
  );

  const timeAgo = (dt: string | null) => {
    if (!dt) return 'Never';
    const diff = Date.now() - new Date(dt).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-800/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/50 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Deployed Honeypots</h3>
        <span className="text-xs text-slate-500">{honeypots.length} active decoys</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-700/30 text-slate-400 text-xs">
              <th className="text-left px-4 py-2.5 font-medium">Honeypot</th>
              <th className="text-left px-4 py-2.5 font-medium">Type</th>
              <th className="text-left px-4 py-2.5 font-medium">Decoy Target</th>
              <th className="text-left px-4 py-2.5 font-medium">Status</th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('risk_level')}>
                <span className="flex items-center gap-1">Risk <SortIcon col="risk_level" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('interaction_count')}>
                <span className="flex items-center gap-1">Hits <SortIcon col="interaction_count" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium cursor-pointer select-none" onClick={() => handleSort('last_interaction_at')}>
                <span className="flex items-center gap-1">Last Hit <SortIcon col="last_interaction_at" /></span>
              </th>
              <th className="text-left px-4 py-2.5 font-medium">Network</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(hp => {
              const Icon = TYPE_ICONS[hp.honeypot_type] || Globe;
              const expanded = expandedId === hp.id;
              return (
                <>
                  <tr
                    key={hp.id}
                    className={`border-b border-slate-700/20 hover:bg-slate-700/20 cursor-pointer transition-colors ${
                      hp.status === 'compromised' ? 'bg-red-500/5' : ''
                    }`}
                    onClick={() => setExpandedId(expanded ? null : hp.id)}
                  >
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                        <span className="font-medium text-slate-200">{hp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-mono text-slate-400 uppercase">{hp.honeypot_type}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div>
                        <span className="text-xs text-slate-300 font-mono">{hp.decoy_ip}</span>
                        <p className="text-[10px] text-slate-500">{hp.decoy_hostname}</p>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${STATUS_STYLES[hp.status]}`}>
                        {hp.status === 'compromised' && <span className="w-1.5 h-1.5 rounded-full bg-red-400 mr-1 animate-ping" />}
                        {hp.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs font-semibold uppercase ${RISK_STYLES[hp.risk_level]}`}>{hp.risk_level}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-sm font-bold text-slate-200 tabular-nums">{hp.interaction_count.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-400">{timeAgo(hp.last_interaction_at)}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs text-slate-400">{hp.deployed_network}</span>
                    </td>
                  </tr>
                  {expanded && (
                    <tr key={`${hp.id}-detail`} className="bg-slate-900/50">
                      <td colSpan={8} className="px-6 py-4">
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Emulated OS</p>
                            <p className="text-xs text-slate-300">{hp.emulated_os}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Services</p>
                            <div className="flex flex-wrap gap-1">
                              {(hp.emulated_services || []).map((s: string) => (
                                <span key={s} className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/60 text-cyan-300 font-mono">{s}</span>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Known Attacker IPs</p>
                            <div className="flex flex-wrap gap-1">
                              {(hp.attacker_ips || []).slice(0, 5).map((ip: string) => (
                                <span key={ip} className="px-1.5 py-0.5 text-[10px] rounded bg-red-500/10 text-red-400 font-mono border border-red-500/20">{ip}</span>
                              ))}
                              {(hp.attacker_ips || []).length > 5 && (
                                <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-700/60 text-slate-400">+{hp.attacker_ips.length - 5} more</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default HoneypotTable;
