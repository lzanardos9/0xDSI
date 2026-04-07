import { useState } from 'react';
import { Cloud, CheckCircle, AlertTriangle, Clock, Activity, Shield, Globe, Server, Zap, TrendingUp, ArrowUpDown } from 'lucide-react';

interface CloudConnector {
  id: string;
  provider: string;
  service: string;
  region: string;
  status: 'connected' | 'degraded' | 'disconnected';
  events_24h: number;
  latency_ms: number;
  api_calls_24h: number;
  error_rate: number;
  last_event: string;
  account_id: string;
  auth_method: string;
  log_types: string[];
}

const MOCK_CLOUD_CONNECTORS: CloudConnector[] = [
  { id: 'aws1', provider: 'AWS', service: 'CloudTrail', region: 'us-east-1', status: 'connected', events_24h: 2847293, latency_ms: 12, api_calls_24h: 48293, error_rate: 0.02, last_event: '2 sec ago', account_id: '123456789012', auth_method: 'IAM Role (AssumeRole)', log_types: ['Management Events', 'Data Events', 'Insights Events'] },
  { id: 'aws2', provider: 'AWS', service: 'GuardDuty', region: 'us-east-1', status: 'connected', events_24h: 342, latency_ms: 45, api_calls_24h: 12847, error_rate: 0.0, last_event: '15 sec ago', account_id: '123456789012', auth_method: 'IAM Role (AssumeRole)', log_types: ['EC2 Findings', 'S3 Findings', 'IAM Findings', 'DNS Findings'] },
  { id: 'aws3', provider: 'AWS', service: 'VPC Flow Logs', region: 'us-east-1', status: 'connected', events_24h: 18472938, latency_ms: 8, api_calls_24h: 92847, error_rate: 0.01, last_event: '1 sec ago', account_id: '123456789012', auth_method: 'IAM Role (AssumeRole)', log_types: ['Accept Logs', 'Reject Logs', 'All Traffic'] },
  { id: 'az1', provider: 'Azure', service: 'Monitor', region: 'East US 2', status: 'connected', events_24h: 1928473, latency_ms: 18, api_calls_24h: 38472, error_rate: 0.05, last_event: '3 sec ago', account_id: 'sub-a1b2c3d4-e5f6', auth_method: 'Service Principal (OAuth2)', log_types: ['Activity Logs', 'Diagnostic Logs', 'Metrics'] },
  { id: 'az2', provider: 'Azure', service: 'Sentinel', region: 'East US 2', status: 'connected', events_24h: 892374, latency_ms: 22, api_calls_24h: 28374, error_rate: 0.03, last_event: '5 sec ago', account_id: 'sub-a1b2c3d4-e5f6', auth_method: 'Service Principal (OAuth2)', log_types: ['Security Alerts', 'Incidents', 'Hunting Queries'] },
  { id: 'az3', provider: 'Azure', service: 'Defender', region: 'East US 2', status: 'degraded', events_24h: 12847, latency_ms: 340, api_calls_24h: 8472, error_rate: 2.1, last_event: '2 min ago', account_id: 'sub-a1b2c3d4-e5f6', auth_method: 'Service Principal (OAuth2)', log_types: ['Endpoint Alerts', 'Vulnerability Reports', 'Secure Score'] },
  { id: 'gcp1', provider: 'GCP', service: 'Cloud Logging', region: 'us-central1', status: 'connected', events_24h: 1284729, latency_ms: 15, api_calls_24h: 42938, error_rate: 0.01, last_event: '1 sec ago', account_id: 'proj-security-prod-001', auth_method: 'Workload Identity Federation', log_types: ['Admin Activity', 'Data Access', 'System Events'] },
  { id: 'gcp2', provider: 'GCP', service: 'Security Command Center', region: 'global', status: 'connected', events_24h: 5847, latency_ms: 28, api_calls_24h: 9847, error_rate: 0.0, last_event: '30 sec ago', account_id: 'proj-security-prod-001', auth_method: 'Workload Identity Federation', log_types: ['Findings', 'Assets', 'Attack Paths'] },
];

const RECENT_CLOUD_EVENTS = [
  { time: '14:32:18', provider: 'AWS', service: 'CloudTrail', event_type: 'ConsoleLogin', severity: 'info', source_ip: '203.0.113.42', user: 'admin@corp.com', resource: 'IAM Console', region: 'us-east-1' },
  { time: '14:32:17', provider: 'AWS', service: 'GuardDuty', event_type: 'UnauthorizedAccess:IAMUser/MaliciousIPCaller', severity: 'high', source_ip: '198.51.100.23', user: 'svc-deployment', resource: 'EC2 Instance i-0a1b2c3d', region: 'us-east-1' },
  { time: '14:32:16', provider: 'Azure', service: 'Monitor', event_type: 'ResourceGroupWrite', severity: 'info', source_ip: '10.0.1.50', user: 'devops@tenant.com', resource: 'rg-production-east', region: 'East US 2' },
  { time: '14:32:15', provider: 'Azure', service: 'Sentinel', event_type: 'SecurityAlert', severity: 'medium', source_ip: '172.16.0.34', user: 'system', resource: 'Brute Force Detection Rule', region: 'East US 2' },
  { time: '14:32:14', provider: 'GCP', service: 'Cloud Logging', event_type: 'SetIamPolicy', severity: 'warning', source_ip: '35.192.0.1', user: 'terraform@proj.iam', resource: 'storage/bucket-prod', region: 'us-central1' },
  { time: '14:32:13', provider: 'AWS', service: 'VPC Flow', event_type: 'REJECT', severity: 'low', source_ip: '192.168.1.100', user: 'N/A', resource: 'sg-0a1b2c3d4e5f6', region: 'us-east-1' },
];

const PROVIDER_CONFIG: Record<string, { color: string; bg: string; border: string; gradient: string }> = {
  'AWS': { color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200', gradient: 'from-amber-500 to-orange-500' },
  'Azure': { color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', gradient: 'from-blue-500 to-cyan-500' },
  'GCP': { color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', gradient: 'from-red-500 to-rose-500' },
};

const sevColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  warning: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-700',
  info: 'bg-slate-100 text-slate-600',
};

function formatNumber(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toString();
}

export default function CloudAPIsTab() {
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const filtered = selectedProvider
    ? MOCK_CLOUD_CONNECTORS.filter(c => c.provider === selectedProvider)
    : MOCK_CLOUD_CONNECTORS;

  const providers = ['AWS', 'Azure', 'GCP'];
  const totalEvents = MOCK_CLOUD_CONNECTORS.reduce((s, c) => s + c.events_24h, 0);
  const avgLatency = Math.round(MOCK_CLOUD_CONNECTORS.reduce((s, c) => s + c.latency_ms, 0) / MOCK_CLOUD_CONNECTORS.length);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-slate-800 to-blue-900 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold flex items-center gap-2">
              <Cloud className="w-7 h-7 text-blue-400" />
              Cloud API Integrations
            </h3>
            <p className="text-slate-300 mt-1 text-sm">Multi-cloud security event ingestion via native APIs</p>
          </div>
          <div className="flex gap-8">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{MOCK_CLOUD_CONNECTORS.length}</div>
              <div className="text-xs text-slate-400">Connectors</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{formatNumber(totalEvents)}</div>
              <div className="text-xs text-slate-400">Events (24h)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-amber-400">{avgLatency}ms</div>
              <div className="text-xs text-slate-400">Avg Latency</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setSelectedProvider(null)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            !selectedProvider ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
          }`}
        >
          All Providers
        </button>
        {providers.map((p) => {
          const cfg = PROVIDER_CONFIG[p];
          const count = MOCK_CLOUD_CONNECTORS.filter(c => c.provider === p).length;
          return (
            <button
              key={p}
              onClick={() => setSelectedProvider(selectedProvider === p ? null : p)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                selectedProvider === p ? `${cfg.bg} ${cfg.color} shadow-sm` : 'text-slate-600 hover:bg-slate-50 border border-slate-200'
              }`}
            >
              <Globe className="w-4 h-4" />
              {p}
              <span className="text-xs bg-white/50 px-1.5 py-0.5 rounded">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {filtered.map((conn) => {
          const cfg = PROVIDER_CONFIG[conn.provider];
          return (
            <div key={conn.id} className={`bg-white rounded-xl border ${cfg.border} p-5 transition-all hover:shadow-lg`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${cfg.gradient} flex items-center justify-center`}>
                    <Cloud className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{conn.provider} {conn.service}</div>
                    <div className="text-xs text-slate-500">{conn.region}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {conn.status === 'connected' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                  )}
                  <span className={`text-xs font-medium ${conn.status === 'connected' ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {conn.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: 'Events 24h', value: formatNumber(conn.events_24h), icon: Activity },
                  { label: 'Latency', value: `${conn.latency_ms}ms`, icon: Clock },
                  { label: 'API Calls', value: formatNumber(conn.api_calls_24h), icon: ArrowUpDown },
                  { label: 'Error Rate', value: `${conn.error_rate}%`, icon: AlertTriangle },
                ].map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-slate-50 rounded-lg p-2 text-center">
                    <Icon className="w-3 h-3 text-slate-400 mx-auto mb-1" />
                    <div className="text-xs font-bold text-slate-900">{value}</div>
                    <div className="text-[10px] text-slate-500">{label}</div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-3 h-3 text-slate-400" />
                <span className="text-xs text-slate-500">Auth:</span>
                <span className="text-xs font-medium text-slate-700">{conn.auth_method}</span>
              </div>

              <div className="flex flex-wrap gap-1">
                {conn.log_types.map((lt) => (
                  <span key={lt} className={`text-[10px] px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} font-medium`}>{lt}</span>
                ))}
              </div>

              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last event: {conn.last_event}
                </div>
                <span className="text-xs text-slate-400 font-mono">{conn.account_id}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-lg border border-slate-200">
        <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <h4 className="font-bold text-slate-900 flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-600" />
            Recent Cloud Security Events
          </h4>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs text-emerald-600 font-medium">Streaming</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Time</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Provider</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Event Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Severity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Source</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-600 uppercase">Resource</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {RECENT_CLOUD_EVENTS.map((evt, i) => {
                const cfg = PROVIDER_CONFIG[evt.provider];
                return (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-600">{evt.time}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.bg} ${cfg.color}`}>{evt.provider}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-medium text-slate-700">{evt.service}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-slate-900">{evt.event_type}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sevColor[evt.severity] || sevColor.info}`}>{evt.severity}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-blue-600">{evt.source_ip}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 max-w-xs truncate">{evt.resource}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
