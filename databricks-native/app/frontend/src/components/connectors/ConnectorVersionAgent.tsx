import { useState, useEffect } from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, XCircle, ArrowUp, Clock, Cpu, GitBranch, Zap, ChevronDown, ChevronRight, Code, Shield } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface VersionCheck {
  id: string;
  connector_id: string;
  connector_name: string;
  vendor: string;
  category: string;
  current_version: string;
  latest_version: string;
  version_behind: number;
  changelog_summary: string;
  log_schema_changes: Array<{ field: string; action: string; version: string }>;
  parser_update_required: boolean;
  parser_patch: Record<string, unknown>;
  auto_applied: boolean;
  status: string;
  severity: string;
  checked_at: string;
}

export default function ConnectorVersionAgent() {
  const [checks, setChecks] = useState<VersionCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'outdated' | 'current' | 'updated'>('all');

  useEffect(() => { loadChecks(); }, []);

  async function loadChecks() {
    setLoading(true);
    const { data } = await supabase.from('connector_version_checks').select('*').order('checked_at', { ascending: false });
    if (data) setChecks(data);
    setLoading(false);
  }

  function simulateScan() {
    setScanning(true);
    setTimeout(() => { setScanning(false); loadChecks(); }, 3000);
  }

  const filtered = filter === 'all' ? checks : checks.filter(c => c.status === filter);
  const outdatedCount = checks.filter(c => c.status === 'outdated').length;
  const criticalCount = checks.filter(c => c.severity === 'critical').length;
  const autoApplied = checks.filter(c => c.auto_applied).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Agent Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="p-2.5 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl">
              <Cpu className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Connector Version Agent</h3>
            <p className="text-xs text-slate-400">Autonomous parser update system - monitors vendor changelogs and adapts parsers</p>
          </div>
        </div>
        <button
          onClick={simulateScan}
          disabled={scanning}
          className="px-4 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300 hover:bg-cyan-500/20 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning Vendors...' : 'Run Full Scan'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30">
          <div className="text-2xl font-bold text-white">{checks.length}</div>
          <div className="text-xs text-slate-400">Connectors Monitored</div>
        </div>
        <div className={`p-3 rounded-xl border ${outdatedCount > 0 ? 'border-orange-500/30 bg-orange-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
          <div className="text-2xl font-bold text-orange-400">{outdatedCount}</div>
          <div className="text-xs text-slate-400">Versions Behind</div>
        </div>
        <div className={`p-3 rounded-xl border ${criticalCount > 0 ? 'border-red-500/30 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/30'}`}>
          <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
          <div className="text-xs text-slate-400">Critical Updates</div>
        </div>
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="text-2xl font-bold text-emerald-400">{autoApplied}</div>
          <div className="text-xs text-slate-400">Auto-Applied Patches</div>
        </div>
      </div>

      {/* Filter */}
      <div className="flex gap-1">
        {(['all', 'outdated', 'current', 'updated'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${filter === f ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700/50'}`}>
            {f === 'all' ? `All (${checks.length})` : f === 'outdated' ? `Outdated (${outdatedCount})` : f}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="space-y-2">
        {filtered.map(check => (
          <VersionCheckCard
            key={check.id}
            check={check}
            expanded={expandedId === check.id}
            onToggle={() => setExpandedId(expandedId === check.id ? null : check.id)}
          />
        ))}
      </div>
    </div>
  );
}

function VersionCheckCard({ check, expanded, onToggle }: { check: VersionCheck; expanded: boolean; onToggle: () => void }) {
  const statusConfig = {
    current: { icon: CheckCircle, color: 'text-emerald-400', bg: 'border-slate-700/50 bg-slate-800/30' },
    outdated: { icon: AlertTriangle, color: 'text-orange-400', bg: 'border-orange-500/20 bg-orange-500/5' },
    updated: { icon: ArrowUp, color: 'text-cyan-400', bg: 'border-cyan-500/20 bg-cyan-500/5' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'border-red-500/20 bg-red-500/5' },
  }[check.status] || { icon: Clock, color: 'text-slate-400', bg: 'border-slate-700/50 bg-slate-800/30' };

  const StatusIcon = statusConfig.icon;

  return (
    <div className={`border rounded-xl overflow-hidden transition-all ${statusConfig.bg}`}>
      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-slate-700/20 transition-colors" onClick={onToggle}>
        <StatusIcon className={`w-4 h-4 ${statusConfig.color} flex-shrink-0`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-white">{check.connector_name}</span>
            <span className="text-xs text-slate-500">{check.vendor}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-slate-400 font-mono">v{check.current_version}</span>
            {check.version_behind > 0 && (
              <>
                <span className="text-xs text-slate-600">→</span>
                <span className="text-xs text-cyan-400 font-mono">v{check.latest_version}</span>
                <span className="px-1.5 py-0.5 text-[10px] bg-orange-500/20 text-orange-300 rounded">
                  {check.version_behind} behind
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {check.parser_update_required && (
            <span className="px-2 py-0.5 text-[10px] bg-yellow-500/10 border border-yellow-500/30 rounded text-yellow-300 flex items-center gap-1">
              <Code className="w-3 h-3" /> Parser Update
            </span>
          )}
          {check.auto_applied && (
            <span className="px-2 py-0.5 text-[10px] bg-emerald-500/10 border border-emerald-500/30 rounded text-emerald-300 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Auto-Applied
            </span>
          )}
          <SeverityBadge severity={check.severity} />
          {expanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700/50 p-4 space-y-4 bg-slate-900/30">
          {/* Changelog */}
          {check.changelog_summary && (
            <div>
              <h4 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-cyan-400" /> Changelog Summary
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed bg-slate-800/50 rounded-lg p-3">{check.changelog_summary}</p>
            </div>
          )}

          {/* Schema Changes */}
          {check.log_schema_changes.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-orange-400" /> Schema Changes Detected
              </h4>
              <div className="space-y-1">
                {check.log_schema_changes.map((change, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className={`px-1.5 py-0.5 rounded font-mono ${
                      change.action === 'added' ? 'bg-emerald-500/10 text-emerald-300' :
                      change.action === 'modified' ? 'bg-yellow-500/10 text-yellow-300' :
                      'bg-cyan-500/10 text-cyan-300'
                    }`}>
                      {change.action}
                    </span>
                    <code className="text-slate-300">{change.field}</code>
                    <span className="text-slate-500 ml-auto">v{change.version}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Parser Patch */}
          {check.parser_update_required && Object.keys(check.parser_patch).length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-slate-300 mb-2 flex items-center gap-1.5">
                <Code className="w-3.5 h-3.5 text-cyan-400" /> Suggested Parser Patch
              </h4>
              <pre className="text-xs text-slate-400 bg-slate-900/50 rounded-lg p-3 overflow-x-auto font-mono">
                {JSON.stringify(check.parser_patch, null, 2)}
              </pre>
              {!check.auto_applied && (
                <button className="mt-2 px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5">
                  <Zap className="w-3 h-3" /> Apply Patch Automatically
                </button>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-2 border-t border-slate-700/30">
            <Clock className="w-3 h-3" />
            Last checked: {new Date(check.checked_at).toLocaleString()}
          </div>
        </div>
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const config = {
    critical: 'bg-red-500/20 text-red-300 border-red-500/30',
    high: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
    medium: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    low: 'bg-slate-600/30 text-slate-400 border-slate-600/30',
    info: 'bg-slate-600/30 text-slate-400 border-slate-600/30',
  }[severity] || 'bg-slate-600/30 text-slate-400 border-slate-600/30';

  return <span className={`px-1.5 py-0.5 text-[10px] rounded border ${config}`}>{severity}</span>;
}
