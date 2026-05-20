import { useState } from 'react';
import { X, Settings, Shield, Activity, Clock, CheckCircle, AlertTriangle, Play, Pause, RotateCcw, Save, Trash2, Globe, Lock, Server, Zap } from 'lucide-react';
import type { CatalogConnector } from '../../lib/connectorsCatalog';

interface Props {
  connector: CatalogConnector;
  onClose: () => void;
}

export default function ConnectorConfigModal({ connector, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<'general' | 'auth' | 'ingestion' | 'parsing' | 'health'>('general');
  const [enabled, setEnabled] = useState(connector.status === 'connected');
  const [saving, setSaving] = useState(false);

  const mockConfig = generateMockConfig(connector);

  function handleSave() {
    setSaving(true);
    setTimeout(() => setSaving(false), 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-3xl bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50 bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <Settings className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-white">{connector.name}</h2>
              <p className="text-xs text-slate-400">{connector.vendor} - {connector.protocol}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              connector.status === 'connected' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
              connector.status === 'beta' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
              'bg-slate-600/30 text-slate-400 border border-slate-600/30'
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${
                connector.status === 'connected' ? 'bg-emerald-400 animate-pulse' : connector.status === 'beta' ? 'bg-amber-400' : 'bg-slate-500'
              }`} />
              {connector.status === 'connected' ? 'Active' : connector.status === 'beta' ? 'Beta' : 'Available'}
            </div>
            <button onClick={onClose} className="p-1 hover:bg-slate-700 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700/50 bg-slate-800/30 px-4">
          {([
            { id: 'general', label: 'General', icon: Settings },
            { id: 'auth', label: 'Authentication', icon: Lock },
            { id: 'ingestion', label: 'Ingestion', icon: Activity },
            { id: 'parsing', label: 'Parsing & Schema', icon: Server },
            { id: 'health', label: 'Health & Metrics', icon: Zap },
          ] as const).map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  activeSection === tab.id
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeSection === 'general' && (
            <GeneralSection connector={connector} config={mockConfig} enabled={enabled} setEnabled={setEnabled} />
          )}
          {activeSection === 'auth' && (
            <AuthSection config={mockConfig} />
          )}
          {activeSection === 'ingestion' && (
            <IngestionSection config={mockConfig} />
          )}
          {activeSection === 'parsing' && (
            <ParsingSection connector={connector} config={mockConfig} />
          )}
          {activeSection === 'health' && (
            <HealthSection connector={connector} config={mockConfig} />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-700/50 bg-slate-800/30">
          <div className="flex gap-2">
            <button className="px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 rounded-lg transition-colors flex items-center gap-1.5">
              <Trash2 className="w-3 h-3" /> Remove
            </button>
            <button className="px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-700/50 rounded-lg transition-colors flex items-center gap-1.5">
              <RotateCcw className="w-3 h-3" /> Reset Defaults
            </button>
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-1.5 text-xs text-slate-300 hover:bg-slate-700/50 rounded-lg border border-slate-600 transition-colors">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="px-4 py-1.5 text-xs bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5 disabled:opacity-50">
              <Save className="w-3 h-3" /> {saving ? 'Saving...' : 'Save Configuration'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneralSection({ connector, config, enabled, setEnabled }: { connector: CatalogConnector; config: any; enabled: boolean; setEnabled: (v: boolean) => void }) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div>
          <div className="text-sm font-medium text-white">Connector Status</div>
          <div className="text-xs text-slate-400 mt-0.5">Enable or disable data ingestion from this source</div>
        </div>
        <button onClick={() => setEnabled(!enabled)} className={`relative w-11 h-6 rounded-full transition-colors ${enabled ? 'bg-emerald-500' : 'bg-slate-600'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Connector Name" value={connector.name} />
        <Field label="Vendor" value={connector.vendor} />
        <Field label="Category" value={connector.category.replace('_', ' ').toUpperCase()} />
        <Field label="Protocol" value={connector.protocol.split('/')[0].trim()} />
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1.5">Description</label>
        <p className="text-sm text-slate-300 bg-slate-800/50 border border-slate-700/50 rounded-lg p-3">{connector.description}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Endpoint URL" value={config.endpoint} />
        <Field label="Tenant / Instance" value={config.tenant} />
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1.5">Tags</label>
        <div className="flex flex-wrap gap-1.5">
          {config.tags.map((tag: string) => (
            <span key={tag} className="px-2 py-0.5 bg-slate-700/50 rounded text-xs text-slate-300">{tag}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function AuthSection({ config }: { config: any }) {
  return (
    <div className="space-y-5">
      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-4 h-4 text-cyan-400" />
          <span className="text-sm font-medium text-white">Authentication Method</span>
        </div>
        <div className="flex gap-2">
          {['API Key', 'OAuth 2.0', 'mTLS', 'Basic Auth', 'SAML'].map(method => (
            <button key={method} className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              config.authMethod === method ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'
            }`}>{method}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="API Key / Token" value={config.apiKey} masked />
        <Field label="Client ID" value={config.clientId} />
        <Field label="Client Secret" value={config.clientSecret} masked />
        <Field label="Token Endpoint" value={config.tokenEndpoint} />
      </div>

      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-medium text-white">Certificate Configuration</span>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="CA Certificate" value={config.caCert ? 'Uploaded' : 'Not configured'} />
          <Field label="Client Certificate" value={config.clientCert ? 'Uploaded' : 'Not configured'} />
        </div>
      </div>

      <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
        <span className="text-xs text-emerald-300">Last authentication: {new Date(Date.now() - 300000).toLocaleString()} - Token valid for 58 minutes</span>
      </div>
    </div>
  );
}

function IngestionSection({ config }: { config: any }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30 text-center">
          <div className="text-lg font-bold text-white">{config.pollInterval}</div>
          <div className="text-xs text-slate-400">Poll Interval</div>
        </div>
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30 text-center">
          <div className="text-lg font-bold text-white">{config.batchSize}</div>
          <div className="text-xs text-slate-400">Batch Size</div>
        </div>
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30 text-center">
          <div className="text-lg font-bold text-white">{config.maxRetries}</div>
          <div className="text-xs text-slate-400">Max Retries</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Poll Interval (seconds)" value={config.pollInterval} />
        <Field label="Batch Size (events)" value={config.batchSize} />
        <Field label="Max Retries" value={config.maxRetries} />
        <Field label="Retry Backoff (ms)" value={config.retryBackoff} />
        <Field label="Request Timeout (ms)" value={config.timeout} />
        <Field label="Concurrent Workers" value={config.workers} />
      </div>

      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="text-sm font-medium text-white mb-3">Event Types to Ingest</div>
        <div className="flex flex-wrap gap-2">
          {config.eventTypes.map((et: string) => (
            <label key={et} className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-700 transition-colors">
              <input type="checkbox" defaultChecked className="w-3 h-3 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500/30" />
              <span className="text-xs text-slate-300">{et}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Checkpoint Strategy" value="cursor-based" />
        <Field label="Deduplication" value="content-hash (SHA-256)" />
      </div>
    </div>
  );
}

function ParsingSection({ connector, config }: { connector: CatalogConnector; config: any }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Input Format" value={config.inputFormat} />
        <Field label="Normalization Schema" value="OCSF v1.3.0" />
        <Field label="Parser Version" value={config.parserVersion} />
        <Field label="Last Updated" value={config.parserLastUpdated} />
      </div>

      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="text-sm font-medium text-white mb-3">Field Mappings (sample)</div>
        <div className="space-y-1.5 max-h-48 overflow-y-auto">
          {config.fieldMappings.map((m: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <code className="px-1.5 py-0.5 bg-slate-900/50 rounded text-slate-300 font-mono">{m.source}</code>
              <span className="text-slate-500">-&gt;</span>
              <code className="px-1.5 py-0.5 bg-cyan-500/10 rounded text-cyan-300 font-mono">{m.target}</code>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Timestamp Field" value={config.timestampField} />
        <Field label="Timestamp Format" value="ISO 8601 / epoch_ms" />
        <Field label="Enrichment" value="GeoIP, ASN, Threat Intel" />
        <Field label="Drop Conditions" value={config.dropConditions} />
      </div>
    </div>
  );
}

function HealthSection({ connector, config }: { connector: CatalogConnector; config: any }) {
  const metrics = config.healthMetrics;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-4 gap-3">
        <MetricCard label="Events/sec" value={metrics.eps} status="good" />
        <MetricCard label="Latency" value={metrics.latency} status={parseInt(metrics.latency) > 500 ? 'warn' : 'good'} />
        <MetricCard label="Uptime" value={metrics.uptime} status="good" />
        <MetricCard label="Error Rate" value={metrics.errorRate} status={parseFloat(metrics.errorRate) > 1 ? 'warn' : 'good'} />
      </div>

      <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div className="text-sm font-medium text-white mb-3">Recent Activity</div>
        <div className="space-y-2">
          {metrics.recentEvents.map((evt: any, i: number) => (
            <div key={i} className="flex items-center gap-3 text-xs">
              <span className="text-slate-500 font-mono w-16">{evt.time}</span>
              <span className={`w-1.5 h-1.5 rounded-full ${evt.type === 'success' ? 'bg-emerald-400' : evt.type === 'warning' ? 'bg-yellow-400' : 'bg-red-400'}`} />
              <span className="text-slate-300">{evt.message}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <button className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 transition-colors flex items-center gap-1.5">
          <Play className="w-3 h-3" /> Test Connection
        </button>
        <button className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-1.5">
          <RotateCcw className="w-3 h-3" /> Force Re-sync
        </button>
        <button className="px-3 py-1.5 bg-slate-700/50 border border-slate-600 rounded-lg text-xs text-slate-300 hover:bg-slate-700 transition-colors flex items-center gap-1.5">
          <Pause className="w-3 h-3" /> Pause Ingestion
        </button>
      </div>
    </div>
  );
}

function Field({ label, value, masked }: { label: string; value: string; masked?: boolean }) {
  return (
    <div>
      <label className="text-xs text-slate-400 block mb-1">{label}</label>
      <input
        type={masked ? 'password' : 'text'}
        defaultValue={value}
        className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:border-cyan-500/50 focus:outline-none font-mono"
      />
    </div>
  );
}

function MetricCard({ label, value, status }: { label: string; value: string; status: 'good' | 'warn' | 'bad' }) {
  const colors = { good: 'border-emerald-500/30 text-emerald-400', warn: 'border-yellow-500/30 text-yellow-400', bad: 'border-red-500/30 text-red-400' };
  return (
    <div className={`p-3 rounded-xl border ${colors[status]} bg-slate-800/30 text-center`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </div>
  );
}

function generateMockConfig(connector: CatalogConnector) {
  const baseEndpoint = connector.vendor.toLowerCase().replace(/\s+/g, '') + '.example.com';
  return {
    endpoint: `https://api.${baseEndpoint}/v2/events`,
    tenant: `tenant-${connector.id}-prod`,
    authMethod: 'API Key',
    apiKey: 'sk_live_' + 'x'.repeat(24),
    clientId: `client_${connector.vendor.toLowerCase().replace(/\s+/g, '_')}_prod`,
    clientSecret: 'cs_' + 'x'.repeat(32),
    tokenEndpoint: `https://auth.${baseEndpoint}/oauth2/token`,
    caCert: true,
    clientCert: connector.status === 'connected',
    pollInterval: '30',
    batchSize: '1000',
    maxRetries: '3',
    retryBackoff: '1000',
    timeout: '30000',
    workers: '4',
    eventTypes: getEventTypes(connector.category),
    inputFormat: connector.protocol.includes('CEF') ? 'CEF' : connector.protocol.includes('Syslog') ? 'Syslog RFC5424' : 'JSON',
    parserVersion: '2.4.1',
    parserLastUpdated: '2026-05-15',
    timestampField: '@timestamp',
    dropConditions: 'severity < info AND event_type = heartbeat',
    fieldMappings: generateFieldMappings(connector.category),
    tags: ['production', connector.category, connector.vendor.toLowerCase().split(' ')[0]],
    healthMetrics: {
      eps: (Math.random() * 5000 + 500).toFixed(0),
      latency: (Math.random() * 400 + 50).toFixed(0) + 'ms',
      uptime: (99 + Math.random()).toFixed(2) + '%',
      errorRate: (Math.random() * 0.5).toFixed(2) + '%',
      recentEvents: [
        { time: '14:32', type: 'success', message: `Batch processed: ${(Math.random() * 1000 + 200).toFixed(0)} events ingested` },
        { time: '14:31', type: 'success', message: 'Health check passed - connection stable' },
        { time: '14:28', type: 'warning', message: 'Elevated latency detected (450ms avg)' },
        { time: '14:25', type: 'success', message: `Schema validated against OCSF v1.3.0` },
        { time: '14:20', type: 'success', message: 'Checkpoint updated - cursor: evt_2026051420' },
      ],
    },
  };
}

function getEventTypes(category: string): string[] {
  const types: Record<string, string[]> = {
    edr: ['process_creation', 'network_connection', 'file_modification', 'registry_change', 'dns_query', 'image_load'],
    firewall: ['traffic', 'threat', 'url_filtering', 'data_filtering', 'wildfire', 'globalprotect'],
    iam: ['authentication', 'authorization', 'mfa', 'password_change', 'group_membership', 'privilege_escalation'],
    cloud_aws: ['management_event', 'data_event', 'insight_event', 'network_activity'],
    cloud_azure: ['audit_log', 'sign_in_log', 'provisioning_log', 'risk_detection'],
    casb: ['network_events', 'application_events', 'alert_events', 'page_events', 'infrastructure_events', 'connection_events', 'dlp_incidents'],
    siem: ['alert', 'correlation', 'anomaly', 'incident'],
    ndr: ['network_anomaly', 'lateral_movement', 'c2_communication', 'data_exfiltration'],
    vuln: ['vulnerability', 'compliance_check', 'asset_discovery', 'patch_status'],
    dlp: ['policy_violation', 'data_classification', 'channel_event', 'incident'],
  };
  return types[category] || ['event', 'alert', 'audit', 'metric'];
}

function generateFieldMappings(category: string): Array<{ source: string; target: string }> {
  const base = [
    { source: 'timestamp', target: 'ocsf.time' },
    { source: 'source_ip', target: 'ocsf.src_endpoint.ip' },
    { source: 'destination_ip', target: 'ocsf.dst_endpoint.ip' },
    { source: 'user', target: 'ocsf.actor.user.name' },
    { source: 'severity', target: 'ocsf.severity_id' },
    { source: 'event_type', target: 'ocsf.type_uid' },
  ];
  if (category === 'edr') {
    base.push({ source: 'process_name', target: 'ocsf.process.name' });
    base.push({ source: 'parent_pid', target: 'ocsf.process.parent_process.pid' });
  }
  if (category === 'casb') {
    base.push({ source: 'app_name', target: 'ocsf.web_resources.name' });
    base.push({ source: 'risk_level', target: 'ocsf.risk_score' });
  }
  return base;
}
