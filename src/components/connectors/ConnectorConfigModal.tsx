import { useState } from 'react';
import { X, Settings, Shield, Activity, Clock, CheckCircle, AlertTriangle, Play, Pause, RotateCcw, Save, Trash2, Globe, Lock, Server, Zap, Percent, AlertOctagon, Network, Radio, HardDrive, Bug, Gauge, Sparkles, Wifi, ArrowDownToLine } from 'lucide-react';
import type { CatalogConnector } from '../../lib/connectorsCatalog';

const SAMPLING_PRIORITIES = [
  { id: 'high-severity', name: 'High Severity Events', description: 'Critical/High severity alerts, CVSS 7+, priority 1-2 events indicating active threats', icon: AlertTriangle, iconColor: 'text-red-400', iconBg: 'bg-red-500/20', activeBg: 'bg-red-500/5', activeBorder: 'border-red-500/40', examples: ['severity >= critical', 'CVSS >= 7.0'] },
  { id: 'suspicious-patterns', name: 'CEP Suspicious Patterns', description: 'Events matching known multi-step attack sequences: recon + exploit + lateral movement chains', icon: Activity, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/20', activeBg: 'bg-orange-500/5', activeBorder: 'border-orange-500/40', examples: ['kill-chain-match', 'temporal-sequence'] },
  { id: 'large-payloads', name: 'Large/Anomalous Payloads', description: 'Packets exceeding normal size thresholds - potential data exfiltration, C2 beacons, or exploit delivery', icon: HardDrive, iconColor: 'text-cyan-400', iconBg: 'bg-cyan-500/20', activeBg: 'bg-cyan-500/5', activeBorder: 'border-cyan-500/40', examples: ['payload > 10KB', 'entropy > 7.5'] },
  { id: 'graph-escalated', name: 'Graph-Escalated Entities', description: 'Events involving entities escalated by graph scoring: high PageRank, betweenness centrality spikes', icon: Network, iconColor: 'text-teal-400', iconBg: 'bg-teal-500/20', activeBg: 'bg-teal-500/5', activeBorder: 'border-teal-500/40', examples: ['entity_risk > 80', 'centrality_spike'] },
  { id: 'micro-patterns', name: 'Bad Micro-Pattern Matches', description: 'Events flagged by micro-pattern engine: beaconing intervals, DNS tunneling cadence, low-and-slow exfil', icon: Radio, iconColor: 'text-amber-400', iconBg: 'bg-amber-500/20', activeBg: 'bg-amber-500/5', activeBorder: 'border-amber-500/40', examples: ['beacon_score > 0.8', 'dns_tunnel_prob'] },
  { id: 'auth-events', name: 'Authentication & Access', description: 'All authentication attempts, privilege escalations, MFA challenges, token refreshes - never miss identity events', icon: Lock, iconColor: 'text-blue-400', iconBg: 'bg-blue-500/20', activeBg: 'bg-blue-500/5', activeBorder: 'border-blue-500/40', examples: ['login_*', 'priv_escalation', 'mfa_*'] },
  { id: 'rare-events', name: 'First-Seen / Rare Events', description: 'Events from never-before-seen IPs, new user-agent strings, first DNS lookups - novelty detection', icon: Sparkles, iconColor: 'text-emerald-400', iconBg: 'bg-emerald-500/20', activeBg: 'bg-emerald-500/5', activeBorder: 'border-emerald-500/40', examples: ['first_seen_ip', 'new_ua_string'] },
  { id: 'lateral-movement', name: 'Lateral Movement Indicators', description: 'SMB/RDP/SSH between internal hosts, service account anomalies, pass-the-hash/ticket patterns', icon: Globe, iconColor: 'text-rose-400', iconBg: 'bg-rose-500/20', activeBg: 'bg-rose-500/5', activeBorder: 'border-rose-500/40', examples: ['internal->internal', 'pth_detected'] },
  { id: 'data-exfil', name: 'Data Exfiltration Signals', description: 'Large outbound transfers, unusual destinations, encrypted blobs to rare endpoints, DNS-over-HTTPS exfil', icon: AlertOctagon, iconColor: 'text-red-400', iconBg: 'bg-red-500/20', activeBg: 'bg-red-500/5', activeBorder: 'border-red-500/40', examples: ['outbound > 50MB', 'doh_exfil'] },
  { id: 'encrypted-anomalies', name: 'TLS/Encryption Anomalies', description: 'Self-signed certs, expired certificates, JA3/JA4 fingerprint mismatches, cipher downgrade attacks', icon: Shield, iconColor: 'text-sky-400', iconBg: 'bg-sky-500/20', activeBg: 'bg-sky-500/5', activeBorder: 'border-sky-500/40', examples: ['self_signed_cert', 'ja3_mismatch'] },
  { id: 'timing-anomalies', name: 'Temporal / Timing Anomalies', description: 'Events outside business hours, impossible travel, clock skew, burst patterns at unusual times', icon: Gauge, iconColor: 'text-yellow-400', iconBg: 'bg-yellow-500/20', activeBg: 'bg-yellow-500/5', activeBorder: 'border-yellow-500/40', examples: ['off_hours_access', 'impossible_travel'] },
  { id: 'honeypot-triggered', name: 'Honeypot / Honeytoken Triggered', description: 'Any interaction with honeypots, honeytokens, canary files, or decoy credentials - guaranteed attacker activity', icon: Bug, iconColor: 'text-red-400', iconBg: 'bg-red-500/20', activeBg: 'bg-red-500/5', activeBorder: 'border-red-500/40', examples: ['canary_triggered', 'decoy_cred_used'] },
];

interface Props {
  connector: CatalogConnector;
  onClose: () => void;
}

export default function ConnectorConfigModal({ connector, onClose }: Props) {
  const [activeSection, setActiveSection] = useState<'general' | 'auth' | 'ingestion' | 'eps' | 'edge' | 'parsing' | 'health'>('general');
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
            { id: 'eps', label: 'EPS Control', icon: Percent },
            { id: 'edge', label: 'Edge / Bandwidth', icon: Wifi },
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
          {activeSection === 'eps' && (
            <EPSControlSection connector={connector} />
          )}
          {activeSection === 'edge' && (
            <EdgeBandwidthSection connector={connector} />
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

function EPSControlSection({ connector }: { connector: CatalogConnector }) {
  const [samplingEnabled, setSamplingEnabled] = useState(false);
  const [samplingRate, setSamplingRate] = useState(10);
  const [priorities, setPriorities] = useState<Set<string>>(new Set(['high-severity', 'suspicious-patterns', 'auth-events']));
  const [discardAfterGraph, setDiscardAfterGraph] = useState(false);
  const [sparkStreaming, setSparkStreaming] = useState(true);
  const [adaptiveMode, setAdaptiveMode] = useState(true);
  const [epsThreshold, setEpsThreshold] = useState(50000);

  const togglePriority = (id: string) => {
    setPriorities(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const estimatedRetention = samplingEnabled
    ? Math.min(100, samplingRate + (priorities.size * 3))
    : 100;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Percent className="w-5 h-5 text-orange-400" />
        <h3 className="text-sm font-semibold text-white">High-EPS Statistical Sampling</h3>
        <span className="ml-auto text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full">{connector.name}</span>
      </div>
      <p className="text-xs text-slate-400">
        For connectors producing extremely high event volumes (50K+ EPS), enable statistical sampling to process only a representative
        percentage while maintaining graph/trend accuracy. Priority events are ALWAYS captured at 100%.
      </p>

      {/* Enable Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div>
          <div className="text-sm font-medium text-white">Enable Statistical Sampling</div>
          <div className="text-xs text-slate-400 mt-0.5">Only collect a variable percentage of events, retaining critical ones at 100%</div>
        </div>
        <button onClick={() => setSamplingEnabled(!samplingEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${samplingEnabled ? 'bg-orange-500' : 'bg-slate-600'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${samplingEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {samplingEnabled && (
        <>
          {/* Warning */}
          <div className="p-4 bg-red-500/10 border-2 border-red-500/40 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-bold text-red-300">WARNING: DATA WILL BE DISCARDED</div>
                <p className="text-xs text-red-200/80 mt-1">
                  When sampling is enabled, {100 - samplingRate}% of non-priority raw events will be permanently discarded and CANNOT be recovered.
                  Only {samplingRate}% of routine events + 100% of priority events will be stored.
                </p>
              </div>
            </div>
          </div>

          {/* Sampling Rate Slider */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs text-slate-400">Base Sampling Rate</label>
              <span className="text-lg font-bold text-white">{samplingRate}%</span>
            </div>
            <input type="range" min={1} max={50} value={samplingRate} onChange={e => setSamplingRate(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>1% (Extreme reduction)</span>
              <span>10% (Recommended)</span>
              <span>50% (Moderate)</span>
            </div>

            {/* Adaptive + Threshold */}
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={adaptiveMode} onChange={e => setAdaptiveMode(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500/30" />
                  <div>
                    <div className="text-xs font-medium text-white">Adaptive Mode</div>
                    <div className="text-[9px] text-slate-500">Auto-adjust rate based on load</div>
                  </div>
                </label>
              </div>
              <div className="p-3 bg-slate-900/50 rounded-lg border border-slate-700/30">
                <label className="text-[10px] text-slate-400 block mb-1">EPS Activation Threshold</label>
                <input type="number" value={epsThreshold} onChange={e => setEpsThreshold(Number(e.target.value))}
                  className="w-full px-2 py-1 bg-slate-800 border border-slate-700 rounded text-xs text-white font-mono" />
                <div className="text-[9px] text-slate-500 mt-0.5">Sampling starts above this EPS</div>
              </div>
            </div>

            {/* Estimated retention */}
            <div className="flex items-center gap-3 p-2 bg-cyan-500/5 border border-cyan-500/20 rounded-lg">
              <Activity className="w-4 h-4 text-cyan-400" />
              <div className="text-xs text-cyan-300">
                <span className="font-semibold">Estimated effective retention: ~{estimatedRetention}%</span>
                <span className="text-cyan-400/60 ml-1">({samplingRate}% base + {priorities.size} priority rules)</span>
              </div>
            </div>
          </div>

          {/* Priority Capture */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-amber-400" />
              <div className="text-xs font-semibold text-white">Intelligent Priority Capture</div>
              <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-300 text-[9px] rounded font-medium">ALWAYS RETAINED</span>
              <span className="ml-auto text-[10px] text-slate-500">{priorities.size}/12 active</span>
            </div>
            <p className="text-[10px] text-slate-400 mb-3">
              Selected event types are ALWAYS captured at 100% regardless of sampling rate. These events bypass the sampling decision
              and are guaranteed to be stored. Critical security events are never lost.
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-[320px] overflow-y-auto pr-1">
              {SAMPLING_PRIORITIES.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePriority(p.id)}
                  className={`text-left p-2.5 rounded-lg border transition-all ${
                    priorities.has(p.id)
                      ? `${p.activeBorder} ${p.activeBg}`
                      : 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <div className={`w-4 h-4 rounded flex items-center justify-center ${priorities.has(p.id) ? p.iconBg : 'bg-slate-700'}`}>
                      <p.icon className={`w-2.5 h-2.5 ${priorities.has(p.id) ? p.iconColor : 'text-slate-400'}`} />
                    </div>
                    <span className={`text-[10px] font-medium ${priorities.has(p.id) ? 'text-white' : 'text-slate-400'}`}>{p.name}</span>
                    {priorities.has(p.id) && <CheckCircle className="w-3 h-3 text-emerald-400 ml-auto" />}
                  </div>
                  <p className="text-[9px] text-slate-500 leading-relaxed line-clamp-2">{p.description}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {p.examples.map(ex => (
                      <span key={ex} className="px-1 py-0.5 bg-slate-800/80 rounded text-[8px] text-slate-500 font-mono">{ex}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
            {priorities.size > 0 && (
              <div className="mt-3 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                <div className="text-[10px] text-emerald-300">
                  <span className="font-semibold">{priorities.size} priority rules active</span> - these events bypass sampling and are always stored at full fidelity.
                </div>
              </div>
            )}
          </div>

          {/* Graph-Only Mode */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={discardAfterGraph} onChange={e => setDiscardAfterGraph(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500/30" />
              <div>
                <div className="text-xs font-medium text-white">Graph-Only Mode (CET/CEP)</div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Process 100% through Correlation Event Trend (CET) and Complex Event Processing (CEP) engines
                  for graph/trend visualization, then discard raw events. Only aggregates and graph data retained.
                </p>
              </div>
            </label>
            <label className="flex items-start gap-3 cursor-pointer">
              <input type="checkbox" checked={sparkStreaming} onChange={e => setSparkStreaming(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 text-cyan-500 focus:ring-cyan-500/30" />
              <div>
                <div className="text-xs font-medium text-white">Spark Structured Streaming Pipeline</div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Route sampled events through Databricks Spark Structured Streaming for real-time micro-batch processing with exactly-once guarantees.
                </p>
              </div>
            </label>
          </div>
        </>
      )}
    </div>
  );
}

function EdgeBandwidthSection({ connector }: { connector: CatalogConnector }) {
  const [edgeEnabled, setEdgeEnabled] = useState(true);
  const [bandwidthLimit, setBandwidthLimit] = useState(100);
  const [bandwidthUnit, setBandwidthUnit] = useState<'mbps' | 'gbps' | 'kbps'>('mbps');
  const [burstAllowance, setBurstAllowance] = useState(150);
  const [compressionEnabled, setCompressionEnabled] = useState(true);
  const [compressionAlgo, setCompressionAlgo] = useState('zstd');
  const [queueStrategy, setQueueStrategy] = useState('priority');
  const [backpressureAction, setBackpressureAction] = useState('buffer');
  const [bufferSize, setBufferSize] = useState(512);
  const [ttl, setTtl] = useState(3600);
  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [offPeakMultiplier, setOffPeakMultiplier] = useState(3);
  const [metricsInterval, setMetricsInterval] = useState(30);

  const effectiveBandwidth = compressionEnabled ? Math.round(bandwidthLimit * 2.8) : bandwidthLimit;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <Wifi className="w-5 h-5 text-teal-400" />
        <h3 className="text-sm font-semibold text-white">Edge Connector & Bandwidth Control</h3>
        <span className="ml-auto text-[10px] bg-slate-700/50 text-slate-400 px-2 py-0.5 rounded-full">{connector.name}</span>
      </div>
      <p className="text-xs text-slate-400">
        Control bandwidth allocation for edge-deployed connectors. Manage data flow rates, compression, buffering, and backpressure
        to optimize performance on constrained network links (satellite, cellular, remote sites).
      </p>

      {/* Edge Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-xl border border-slate-700/50">
        <div>
          <div className="text-sm font-medium text-white">Edge Deployment Mode</div>
          <div className="text-xs text-slate-400 mt-0.5">Enable bandwidth-aware operation for edge/remote connectors</div>
        </div>
        <button onClick={() => setEdgeEnabled(!edgeEnabled)} className={`relative w-11 h-6 rounded-full transition-colors ${edgeEnabled ? 'bg-teal-500' : 'bg-slate-600'}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${edgeEnabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
        </button>
      </div>

      {edgeEnabled && (
        <>
          {/* Bandwidth Limit */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center gap-2">
              <ArrowDownToLine className="w-4 h-4 text-teal-400" />
              <span className="text-xs font-semibold text-white">Bandwidth Allocation</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <label className="text-[10px] text-slate-400 block mb-1">Max Throughput</label>
                <div className="flex gap-2">
                  <input type="number" value={bandwidthLimit} onChange={e => setBandwidthLimit(Number(e.target.value))}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono" />
                  <select value={bandwidthUnit} onChange={e => setBandwidthUnit(e.target.value as any)}
                    className="px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white">
                    <option value="kbps">Kbps</option>
                    <option value="mbps">Mbps</option>
                    <option value="gbps">Gbps</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Burst Limit (%)</label>
                <input type="number" value={burstAllowance} onChange={e => setBurstAllowance(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white font-mono" />
              </div>
            </div>

            <div className="flex items-center gap-3 p-2 bg-teal-500/5 border border-teal-500/20 rounded-lg">
              <Activity className="w-4 h-4 text-teal-400" />
              <div className="text-xs text-teal-300">
                Effective throughput with compression: <span className="font-bold">~{effectiveBandwidth} {bandwidthUnit}</span>
                <span className="text-teal-400/60 ml-1">(2.8x {compressionAlgo} ratio)</span>
              </div>
            </div>

            {/* Visual bandwidth bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[9px] text-slate-500">
                <span>0</span>
                <span>Limit: {bandwidthLimit} {bandwidthUnit}</span>
                <span>Burst: {Math.round(bandwidthLimit * burstAllowance / 100)} {bandwidthUnit}</span>
              </div>
              <div className="h-3 bg-slate-900 rounded-full overflow-hidden flex">
                <div className="bg-teal-500/60 h-full transition-all" style={{ width: '65%' }} />
                <div className="bg-teal-500/20 h-full transition-all" style={{ width: '15%' }} />
              </div>
              <div className="flex justify-between text-[9px]">
                <span className="text-teal-400">Current: ~{Math.round(bandwidthLimit * 0.65)} {bandwidthUnit}</span>
                <span className="text-slate-500">Headroom available</span>
              </div>
            </div>
          </div>

          {/* Compression */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-cyan-400" />
                <span className="text-xs font-semibold text-white">Wire Compression</span>
              </div>
              <button onClick={() => setCompressionEnabled(!compressionEnabled)} className={`relative w-9 h-5 rounded-full transition-colors ${compressionEnabled ? 'bg-cyan-500' : 'bg-slate-600'}`}>
                <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${compressionEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
              </button>
            </div>
            {compressionEnabled && (
              <div className="grid grid-cols-4 gap-2">
                {(['zstd', 'lz4', 'snappy', 'gzip'] as const).map(algo => (
                  <button key={algo} onClick={() => setCompressionAlgo(algo)}
                    className={`px-3 py-2 rounded-lg text-xs font-mono border transition-colors ${
                      compressionAlgo === algo ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'
                    }`}>
                    {algo}
                    <div className="text-[8px] text-slate-500 mt-0.5">
                      {algo === 'zstd' ? '~2.8x ratio' : algo === 'lz4' ? '~2.1x fast' : algo === 'snappy' ? '~1.7x fastest' : '~3.2x slow'}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Queuing & Backpressure */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-4">
            <div className="flex items-center gap-2">
              <Gauge className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-semibold text-white">Queue & Backpressure</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Queue Strategy</label>
                <select value={queueStrategy} onChange={e => setQueueStrategy(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white">
                  <option value="priority">Priority Queue (critical first)</option>
                  <option value="fifo">FIFO (first-in first-out)</option>
                  <option value="weighted">Weighted Fair Queue</option>
                  <option value="leaky-bucket">Leaky Bucket</option>
                  <option value="token-bucket">Token Bucket</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Backpressure Action</label>
                <select value={backpressureAction} onChange={e => setBackpressureAction(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white">
                  <option value="buffer">Buffer to Disk</option>
                  <option value="drop-lowest">Drop Lowest Priority</option>
                  <option value="sample">Apply Sampling</option>
                  <option value="throttle">Throttle Source</option>
                  <option value="spill">Spill to Object Store (S3/ADLS)</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Buffer Size (MB)</label>
                <input type="number" value={bufferSize} onChange={e => setBufferSize(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono" />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 block mb-1">Buffer TTL (seconds)</label>
                <input type="number" value={ttl} onChange={e => setTtl(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono" />
              </div>
            </div>
          </div>

          {/* Scheduling */}
          <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700/50 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={scheduleEnabled} onChange={e => setScheduleEnabled(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 text-teal-500 focus:ring-teal-500/30" />
              <div>
                <div className="text-xs font-medium text-white">Time-of-Day Bandwidth Scheduling</div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Automatically increase bandwidth during off-peak hours (22:00-06:00 local time) to flush buffered data
                </p>
              </div>
            </label>
            {scheduleEnabled && (
              <div className="grid grid-cols-2 gap-3 mt-2">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Off-Peak Multiplier</label>
                  <div className="flex items-center gap-2">
                    <input type="range" min={2} max={10} value={offPeakMultiplier} onChange={e => setOffPeakMultiplier(Number(e.target.value))}
                      className="flex-1 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500" />
                    <span className="text-xs font-bold text-white">{offPeakMultiplier}x</span>
                  </div>
                  <div className="text-[9px] text-slate-500 mt-0.5">Off-peak: {bandwidthLimit * offPeakMultiplier} {bandwidthUnit}</div>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Telemetry Interval (sec)</label>
                  <input type="number" value={metricsInterval} onChange={e => setMetricsInterval(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white font-mono" />
                </div>
              </div>
            )}
          </div>

          {/* Link Quality Indicators */}
          <div className="grid grid-cols-4 gap-2">
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-center">
              <div className="text-sm font-bold text-emerald-400">12ms</div>
              <div className="text-[9px] text-slate-400">RTT Latency</div>
            </div>
            <div className="p-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 text-center">
              <div className="text-sm font-bold text-emerald-400">0.01%</div>
              <div className="text-[9px] text-slate-400">Packet Loss</div>
            </div>
            <div className="p-2.5 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-center">
              <div className="text-sm font-bold text-cyan-400">65%</div>
              <div className="text-[9px] text-slate-400">BW Utilization</div>
            </div>
            <div className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5 text-center">
              <div className="text-sm font-bold text-amber-400">24MB</div>
              <div className="text-[9px] text-slate-400">Buffer Used</div>
            </div>
          </div>
        </>
      )}
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
