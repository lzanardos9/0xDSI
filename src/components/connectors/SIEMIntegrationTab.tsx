import { useState } from 'react';
import { Database, CheckCircle, AlertTriangle, Activity, Clock, ArrowUpDown, Shield, Zap, Layers, Server, TrendingUp, BarChart3 } from 'lucide-react';

interface SIEMConnector {
  id: string;
  name: string;
  platform: string;
  integration_type: string;
  status: 'active' | 'degraded' | 'maintenance';
  events_forwarded_24h: number;
  alerts_correlated_24h: number;
  avg_latency_ms: number;
  queue_depth: number;
  uptime_percent: number;
  last_heartbeat: string;
  log_sources: number;
  parsers_active: number;
  version: string;
}

const MOCK_SIEM_CONNECTORS: SIEMConnector[] = [
  { id: 's1', name: 'Splunk Enterprise HEC', platform: 'Splunk', integration_type: 'HTTP Event Collector', status: 'active', events_forwarded_24h: 28472938, alerts_correlated_24h: 1847, avg_latency_ms: 8, queue_depth: 234, uptime_percent: 99.98, last_heartbeat: '1s ago', log_sources: 142, parsers_active: 87, version: '9.1.3' },
  { id: 's2', name: 'Splunk Universal Forwarder', platform: 'Splunk', integration_type: 'Syslog TCP/UDP', status: 'active', events_forwarded_24h: 12847293, alerts_correlated_24h: 923, avg_latency_ms: 12, queue_depth: 89, uptime_percent: 99.95, last_heartbeat: '2s ago', log_sources: 78, parsers_active: 45, version: '9.1.3' },
  { id: 's3', name: 'QRadar SIEM Collector', platform: 'QRadar', integration_type: 'Log Source Protocol', status: 'active', events_forwarded_24h: 18293847, alerts_correlated_24h: 2384, avg_latency_ms: 15, queue_depth: 456, uptime_percent: 99.92, last_heartbeat: '3s ago', log_sources: 198, parsers_active: 112, version: '7.5.0 UP8' },
  { id: 's4', name: 'QRadar WinCollect Agent', platform: 'QRadar', integration_type: 'Windows Event Collector', status: 'active', events_forwarded_24h: 8472938, alerts_correlated_24h: 567, avg_latency_ms: 22, queue_depth: 123, uptime_percent: 99.89, last_heartbeat: '5s ago', log_sources: 64, parsers_active: 38, version: '7.5.0 UP8' },
  { id: 's5', name: 'Microsoft Sentinel', platform: 'Sentinel', integration_type: 'Log Analytics API', status: 'active', events_forwarded_24h: 9284739, alerts_correlated_24h: 1293, avg_latency_ms: 18, queue_depth: 312, uptime_percent: 99.96, last_heartbeat: '2s ago', log_sources: 112, parsers_active: 76, version: 'Latest' },
  { id: 's6', name: 'Elastic SIEM Collector', platform: 'Elastic', integration_type: 'Fleet Agent (Logstash)', status: 'degraded', events_forwarded_24h: 5847293, alerts_correlated_24h: 438, avg_latency_ms: 145, queue_depth: 8472, uptime_percent: 98.50, last_heartbeat: '45s ago', log_sources: 56, parsers_active: 34, version: '8.12.0' },
];

const FORWARDING_RULES = [
  { id: 'fr1', name: 'Critical Security Alerts', source: 'All SIEM Platforms', destination: '0xDSI Correlation Engine', filter: 'severity >= high', events_matched_24h: 4847, status: 'active', priority: 1 },
  { id: 'fr2', name: 'Authentication Events', source: 'Splunk + QRadar', destination: 'User Behavior Analytics', filter: 'event_category = authentication', events_matched_24h: 892374, status: 'active', priority: 2 },
  { id: 'fr3', name: 'Network Anomalies', source: 'QRadar + Elastic', destination: 'Pattern Discovery', filter: 'flow_type = anomalous', events_matched_24h: 12847, status: 'active', priority: 2 },
  { id: 'fr4', name: 'Endpoint Detection Events', source: 'Microsoft Sentinel', destination: 'Threat Escalation', filter: 'source_type = endpoint_detection', events_matched_24h: 38472, status: 'active', priority: 1 },
  { id: 'fr5', name: 'Compliance Audit Trail', source: 'All Platforms', destination: 'Compliance Dashboard', filter: 'audit_trail = true', events_matched_24h: 284729, status: 'active', priority: 3 },
  { id: 'fr6', name: 'Cloud Security Posture', source: 'Sentinel + Splunk', destination: 'Cloud Posture Engine', filter: 'cloud_provider != null', events_matched_24h: 1284729, status: 'active', priority: 2 },
];

const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  'Splunk': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', gradient: 'from-emerald-500 to-green-600' },
  'QRadar': { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', gradient: 'from-blue-500 to-blue-700' },
  'Sentinel': { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', gradient: 'from-cyan-500 to-teal-600' },
  'Elastic': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', gradient: 'from-amber-500 to-orange-600' },
};

function formatNumber(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

export default function SIEMIntegrationTab() {
  const [selectedPlatform, setSelectedPlatform] = useState<string | null>(null);

  const filtered = selectedPlatform
    ? MOCK_SIEM_CONNECTORS.filter(c => c.platform === selectedPlatform)
    : MOCK_SIEM_CONNECTORS;

  const platforms = [...new Set(MOCK_SIEM_CONNECTORS.map(c => c.platform))];
  const totalForwarded = MOCK_SIEM_CONNECTORS.reduce((s, c) => s + c.events_forwarded_24h, 0);
  const totalAlerts = MOCK_SIEM_CONNECTORS.reduce((s, c) => s + c.alerts_correlated_24h, 0);
  const totalSources = MOCK_SIEM_CONNECTORS.reduce((s, c) => s + c.log_sources, 0);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-emerald-900 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Layers className="w-7 h-7 text-emerald-400" />
              SIEM Integration Hub
            </h3>
            <p className="text-slate-300 mt-1 text-sm">Bi-directional integration with enterprise SIEM platforms</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{MOCK_SIEM_CONNECTORS.length}</div>
              <div className="text-xs text-slate-400">SIEM Connectors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{formatNumber(totalForwarded)}</div>
              <div className="text-xs text-slate-400">Events Forwarded (24h)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{formatNumber(totalAlerts)}</div>
              <div className="text-xs text-slate-400">Alerts Correlated</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-cyan-400">{totalSources}</div>
              <div className="text-xs text-slate-400">Log Sources</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setSelectedPlatform(null)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            !selectedPlatform ? 'bg-emerald-100 text-emerald-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          All Platforms
        </button>
        {platforms.map((p) => {
          const cfg = PLATFORM_COLORS[p];
          const count = MOCK_SIEM_CONNECTORS.filter(c => c.platform === p).length;
          return (
            <button
              key={p}
              onClick={() => setSelectedPlatform(selectedPlatform === p ? null : p)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedPlatform === p ? `${cfg.bg} ${cfg.text} shadow-sm` : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Database className="w-4 h-4" />
              {p}
              <span className="text-xs bg-white/50 px-1.5 py-0.5 rounded">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map((conn) => {
          const cfg = PLATFORM_COLORS[conn.platform];
          return (
            <div key={conn.id} className={`bg-white rounded-xl border ${cfg.border} p-5 transition-all hover:shadow-lg`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                    <Database className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{conn.name}</div>
                    <div className="text-xs text-slate-500">{conn.integration_type} -- v{conn.version}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {conn.status === 'active' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className={`text-xs font-medium ${conn.status === 'active' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {conn.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-4">
                {[
                  { label: 'Events Forwarded', value: formatNumber(conn.events_forwarded_24h), icon: ArrowUpDown },
                  { label: 'Alerts Correlated', value: formatNumber(conn.alerts_correlated_24h), icon: Shield },
                  { label: 'Latency', value: `${conn.avg_latency_ms}ms`, icon: Clock },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2.5 text-center">
                    <Icon className="w-3.5 h-3.5 text-slate-400 mx-auto mb-1" />
                    <div className="text-sm font-bold text-slate-900">{value}</div>
                    <div className="text-[10px] text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="text-center">
                  <div className="text-slate-500">Queue</div>
                  <div className={`font-bold ${conn.queue_depth > 5000 ? 'text-red-600' : 'text-slate-900'}`}>{formatNumber(conn.queue_depth)}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500">Uptime</div>
                  <div className="font-bold text-emerald-600">{conn.uptime_percent}%</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500">Sources</div>
                  <div className="font-bold text-slate-900">{conn.log_sources}</div>
                </div>
                <div className="text-center">
                  <div className="text-slate-500">Parsers</div>
                  <div className="font-bold text-slate-900">{conn.parsers_active}</div>
                </div>
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Activity className="w-3 h-3" />
                  Heartbeat: {conn.last_heartbeat}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.text}`}>{conn.platform}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50">
          <h4 className="font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-amber-600" />
            Event Forwarding Rules
          </h4>
          <p className="text-xs text-slate-500 mt-1">Automated routing and correlation rules between SIEM platforms and 0xDSI engines</p>
        </div>
        <div className="divide-y divide-slate-100">
          {FORWARDING_RULES.map((rule) => (
            <div key={rule.id} className="p-4 hover:bg-slate-50 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    rule.priority === 1 ? 'bg-red-100 text-red-700' : rule.priority === 2 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    P{rule.priority}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{rule.name}</div>
                    <div className="text-xs text-slate-500">{rule.source} → {rule.destination}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900">{formatNumber(rule.events_matched_24h)}</div>
                    <div className="text-[10px] text-slate-500">Matched (24h)</div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">{rule.status}</span>
                </div>
              </div>
              <div className="ml-9 flex items-center gap-2">
                <Server className="w-3 h-3 text-slate-400" />
                <code className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded font-mono">{rule.filter}</code>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { title: 'Ingestion Pipeline', icon: TrendingUp, value: '99.7%', subtitle: 'Pipeline Efficiency', detail: 'Zero-loss event forwarding with automatic retry', color: 'text-emerald-600' },
          { title: 'Parser Coverage', icon: BarChart3, value: `${MOCK_SIEM_CONNECTORS.reduce((s, c) => s + c.parsers_active, 0)}`, subtitle: 'Active Parsers', detail: 'Custom and vendor-supplied log parsers', color: 'text-blue-600' },
          { title: 'Correlation Depth', icon: Shield, value: '3.2x', subtitle: 'Enrichment Factor', detail: 'Cross-platform alert correlation and enrichment', color: 'text-amber-600' },
        ].map(({ title, icon: Icon, value, subtitle, detail, color }) => (
          <div key={title} className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center gap-2 mb-3">
              <Icon className={`w-5 h-5 ${color}`} />
              <span className="text-sm font-bold text-slate-900">{title}</span>
            </div>
            <div className={`text-3xl font-bold ${color} mb-1`}>{value}</div>
            <div className="text-xs font-medium text-slate-700">{subtitle}</div>
            <div className="text-xs text-slate-500 mt-1">{detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
