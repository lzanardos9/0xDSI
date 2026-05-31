import { useState, useEffect, useCallback } from 'react';
import { Radio, Server, RefreshCw, Plus, Terminal, Copy, CheckCircle2, AlertTriangle, XCircle, Cpu, Activity, HardDrive, Clock, Zap, Shield, Download, Trash2 } from 'lucide-react';

interface Deployment {
  deployment_id: string;
  collector_id: string;
  dna_name: string;
  dna_version: string;
  hostname: string;
  ip_address: string;
  os_type: string;
  actual_state: string;
  desired_state: string;
  binary_version: string;
  site_name: string;
  registered_at: string;
  events_per_second: number | null;
  bytes_per_second: number | null;
  error_count: number | null;
  buffer_usage_pct: number | null;
  uptime_seconds: number | null;
  cpu_percent: number | null;
  memory_mb: number | null;
  latency_ms: number | null;
  connection_status: string | null;
  last_heartbeat: string | null;
}

interface DNASpec {
  dna_id: string;
  name: string;
  version: string;
  vendor: string;
  category: string;
  description: string;
  input_type: string;
  input_protocol: string;
  input_port: number;
  input_format: string;
  auth_type: string;
  parser_engine: string;
}

interface FleetStats {
  total: number;
  running: number;
  degraded: number;
  dead: number;
  stopped: number;
}

interface InstallCommands {
  linux: string;
  docker: string;
  kubernetes: string;
  windows: string;
}

const BACKEND_URL = (window as any).__DATABRICKS_BACKEND_URL || '/api';

const STATE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  running: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', dot: 'bg-emerald-400' },
  degraded: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  dead: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400' },
  stopped: { bg: 'bg-slate-600/20', text: 'text-slate-400', dot: 'bg-slate-500' },
  pending: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  decommissioned: { bg: 'bg-slate-800/50', text: 'text-slate-600', dot: 'bg-slate-700' },
};

const CATEGORY_COLORS: Record<string, string> = {
  network_security: 'text-cyan-400',
  endpoint_security: 'text-blue-400',
  cloud: 'text-sky-400',
  infrastructure: 'text-slate-400',
  siem_integration: 'text-amber-400',
  ot_ics: 'text-orange-400',
};

function formatUptime(seconds: number | null): string {
  if (!seconds) return '-';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return `${d}d ${h}h`;
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export default function EdgeDeploymentsTab() {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [stats, setStats] = useState<FleetStats>({ total: 0, running: 0, degraded: 0, dead: 0, stopped: 0 });
  const [totalEps, setTotalEps] = useState(0);
  const [dnaCatalog, setDnaCatalog] = useState<DNASpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInstall, setShowInstall] = useState(false);
  const [selectedDna, setSelectedDna] = useState('');
  const [siteName, setSiteName] = useState('');
  const [installCommands, setInstallCommands] = useState<InstallCommands | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState('');

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/edge-connectors/fleet`);
      if (resp.ok) {
        const data = await resp.json();
        setDeployments(data.deployments || []);
        setStats(data.stats || { total: 0, running: 0, degraded: 0, dead: 0, stopped: 0 });
        setTotalEps(data.total_eps || 0);
      }
    } catch {}
    setLoading(false);
  }, []);

  const fetchDNA = useCallback(async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/edge-connectors/dna-catalog`);
      if (resp.ok) {
        const data = await resp.json();
        setDnaCatalog(data.dna_catalog || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchFleet();
    fetchDNA();
  }, [fetchFleet, fetchDNA]);

  const generateToken = async () => {
    if (!selectedDna) return;
    setGenerating(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/edge-connectors/generate-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dna_name: selectedDna, site_name: siteName || 'default' }),
      });
      if (resp.ok) {
        const data = await resp.json();
        setInstallCommands(data.install_commands);
      }
    } catch {}
    setGenerating(false);
  };

  const performAction = async (collectorId: string, action: string) => {
    try {
      await fetch(`${BACKEND_URL}/edge-connectors/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collector_id: collectorId, action }),
      });
      fetchFleet();
    } catch {}
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  return (
    <div className="space-y-4">
      {/* Fleet Stats */}
      <div className="grid grid-cols-6 gap-3">
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-500 text-[10px] font-mono mb-1">TOTAL FLEET</div>
          <div className="text-2xl font-bold text-white">{stats.total}</div>
        </div>
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
          <div className="text-emerald-500 text-[10px] font-mono mb-1">RUNNING</div>
          <div className="text-2xl font-bold text-emerald-400">{stats.running}</div>
        </div>
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <div className="text-amber-500 text-[10px] font-mono mb-1">DEGRADED</div>
          <div className="text-2xl font-bold text-amber-400">{stats.degraded}</div>
        </div>
        <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-3">
          <div className="text-red-500 text-[10px] font-mono mb-1">DEAD</div>
          <div className="text-2xl font-bold text-red-400">{stats.dead}</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">
          <div className="text-slate-500 text-[10px] font-mono mb-1">STOPPED</div>
          <div className="text-2xl font-bold text-slate-400">{stats.stopped}</div>
        </div>
        <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-3">
          <div className="text-cyan-500 text-[10px] font-mono mb-1">FLEET EPS</div>
          <div className="text-2xl font-bold text-cyan-400">{totalEps.toLocaleString()}</div>
        </div>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowInstall(!showInstall)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${showInstall ? 'bg-cyan-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700'}`}
        >
          <Plus className="w-4 h-4" /> Deploy Collector
        </button>
        <button onClick={fetchFleet} className="flex items-center gap-2 px-3 py-2 bg-slate-800 border border-slate-700 text-slate-300 rounded-lg text-sm hover:bg-slate-700">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
        <div className="ml-auto text-xs text-slate-500 font-mono">
          {dnaCatalog.length} DNA specs available
        </div>
      </div>

      {/* Install Panel */}
      {showInstall && (
        <div className="bg-slate-800/70 border border-cyan-500/20 rounded-lg p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Download className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-semibold text-white">Deploy New Edge Collector</span>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Connector DNA</label>
              <select
                value={selectedDna}
                onChange={(e) => { setSelectedDna(e.target.value); setInstallCommands(null); }}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
              >
                <option value="">Select connector type...</option>
                {dnaCatalog.map(dna => (
                  <option key={dna.dna_id} value={dna.name}>
                    {dna.vendor} - {dna.name.replace(/_/g, ' ')} ({dna.input_type})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Site / Location</label>
              <input
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                placeholder="e.g., datacenter-east, branch-sp"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={generateToken}
                disabled={!selectedDna || generating}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium"
              >
                {generating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Terminal className="w-4 h-4" />}
                Generate Install Token
              </button>
            </div>
          </div>

          {installCommands && (
            <div className="space-y-2 mt-3">
              <div className="text-xs text-slate-400 font-semibold mb-2">Install Commands (choose one):</div>
              {Object.entries(installCommands).map(([method, cmd]) => (
                <div key={method} className="flex items-center gap-2 bg-slate-900 rounded-lg p-2 border border-slate-700/50">
                  <span className="text-[10px] text-slate-500 font-mono uppercase w-20 flex-shrink-0">{method}</span>
                  <code className="flex-1 text-xs text-cyan-300 font-mono overflow-x-auto whitespace-nowrap">{cmd}</code>
                  <button
                    onClick={() => copyToClipboard(cmd, method)}
                    className="flex-shrink-0 p-1.5 rounded hover:bg-slate-700"
                  >
                    {copied === method ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* DNA Catalog */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg">
        <div className="px-4 py-2.5 border-b border-slate-700/40 flex items-center gap-2">
          <Shield className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-semibold text-white">Connector DNA Catalog</span>
          <span className="text-[10px] text-slate-500 font-mono ml-2">{dnaCatalog.length} specs</span>
        </div>
        <div className="grid grid-cols-2 gap-2 p-3 max-h-[200px] overflow-y-auto">
          {dnaCatalog.map(dna => (
            <div key={dna.dna_id} className="flex items-center gap-3 bg-slate-900/50 rounded-lg p-2.5 border border-slate-800">
              <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
                <Radio className={`w-4 h-4 ${CATEGORY_COLORS[dna.category] || 'text-slate-400'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-white truncate">{dna.name.replace(/_/g, ' ')}</div>
                <div className="text-[10px] text-slate-500">{dna.vendor} | {dna.input_type}:{dna.input_port} | {dna.input_format}</div>
              </div>
              <span className="text-[9px] font-mono text-slate-600">v{dna.version}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Deployments Table */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-semibold text-white">Edge Collectors</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-mono font-bold">LIVE FLEET</span>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[320px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/60 sticky top-0">
              <tr className="text-slate-500 font-mono uppercase text-[10px]">
                <th className="text-left px-3 py-2">Collector</th>
                <th className="text-left px-3 py-2">DNA</th>
                <th className="text-center px-3 py-2">State</th>
                <th className="text-right px-3 py-2">EPS</th>
                <th className="text-right px-3 py-2">Latency</th>
                <th className="text-right px-3 py-2">CPU</th>
                <th className="text-right px-3 py-2">Uptime</th>
                <th className="text-center px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {deployments.map(d => {
                const stateStyle = STATE_COLORS[d.actual_state] || STATE_COLORS.pending;
                return (
                  <tr key={d.deployment_id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-3 py-2">
                      <div className="text-white font-medium">{d.hostname}</div>
                      <div className="text-slate-600 text-[10px] font-mono">{d.ip_address} | {d.site_name}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-slate-300">{d.dna_name.replace(/_/g, ' ')}</span>
                      <span className="text-slate-600 text-[10px] ml-1">v{d.dna_version}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${stateStyle.bg}`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${stateStyle.dot} ${d.actual_state === 'running' ? 'animate-pulse' : ''}`} />
                        <span className={`${stateStyle.text} text-[10px] font-mono`}>{d.actual_state}</span>
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-cyan-400">
                      {d.events_per_second?.toLocaleString() || '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {d.latency_ms ? `${d.latency_ms.toFixed(0)}ms` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-400">
                      {d.cpu_percent ? `${d.cpu_percent.toFixed(0)}%` : '-'}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-slate-500 text-[10px]">
                      {formatUptime(d.uptime_seconds)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {d.actual_state === 'running' && (
                          <button onClick={() => performAction(d.collector_id, 'stop')} className="p-1 rounded hover:bg-red-500/10" title="Stop">
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                          </button>
                        )}
                        {(d.actual_state === 'stopped' || d.actual_state === 'dead') && (
                          <button onClick={() => performAction(d.collector_id, 'restart')} className="p-1 rounded hover:bg-emerald-500/10" title="Restart">
                            <RefreshCw className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        )}
                        <button onClick={() => performAction(d.collector_id, 'decommission')} className="p-1 rounded hover:bg-slate-600/30" title="Decommission">
                          <Trash2 className="w-3.5 h-3.5 text-slate-600" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {deployments.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                    No edge collectors deployed yet. Click "Deploy Collector" to generate an install token.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Auto-Discovery Note */}
      <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-3">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-400 font-medium">Edge Mesh Architecture</span>
          <span className="text-slate-600">|</span>
          <span>Collectors auto-register on boot, send heartbeats every 30s, and pull config changes every 60s. Binary self-updates when a new DNA version is pushed.</span>
        </div>
      </div>
    </div>
  );
}
