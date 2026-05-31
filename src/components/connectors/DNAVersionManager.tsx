import React, { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  History,
  Zap,
  CheckCircle,
  AlertCircle,
  RotateCcw,
  Search,
  Settings,
  Grid3x3,
  Code,
  Play,
} from 'lucide-react';

interface DNASpec {
  id: string;
  name: string;
  category: string;
  vendor: string;
  currentVersion: string;
  latestVersion: string;
  collectorsRunning: number;
  collectors?: string[];
}

interface UpgradeEvent {
  id: string;
  timestamp: string;
  dnaName: string;
  oldVersion: string;
  newVersion: string;
  triggeredBy: string;
  status: 'success' | 'failed' | 'rollback';
  collectorsAffected: number;
}

interface VersionDistribution {
  [key: string]: { [version: string]: number };
}

const mockDNASpecs: DNASpec[] = [
  {
    id: 'palo_alto_firewall',
    name: 'Palo Alto Firewall',
    category: 'network_firewall',
    vendor: 'Palo Alto Networks',
    currentVersion: '2.0.0',
    latestVersion: '2.1.0',
    collectorsRunning: 24,
    collectors: ['collector-01', 'collector-02', 'collector-03'],
  },
  {
    id: 'crowdstrike_edr',
    name: 'CrowdStrike EDR',
    category: 'endpoint_security',
    vendor: 'CrowdStrike',
    currentVersion: '1.4.2',
    latestVersion: '1.4.2',
    collectorsRunning: 18,
  },
  {
    id: 'okta_identity',
    name: 'Okta Identity',
    category: 'identity',
    vendor: 'Okta',
    currentVersion: '3.1.0',
    latestVersion: '3.2.0',
    collectorsRunning: 12,
  },
  {
    id: 'zeek_nds',
    name: 'Zeek NDS',
    category: 'ndr',
    vendor: 'Corelight',
    currentVersion: '1.9.1',
    latestVersion: '1.9.1',
    collectorsRunning: 8,
  },
  {
    id: 'suricata_ids',
    name: 'Suricata IDS/IPS',
    category: 'ids_ips',
    vendor: 'OISF',
    currentVersion: '7.0.0',
    latestVersion: '7.1.0',
    collectorsRunning: 16,
  },
  {
    id: 'aws_cloudtrail',
    name: 'AWS CloudTrail',
    category: 'cloud',
    vendor: 'Amazon AWS',
    currentVersion: '2.3.0',
    latestVersion: '2.3.0',
    collectorsRunning: 5,
  },
  {
    id: 'splunk_connector',
    name: 'Splunk Connector',
    category: 'siem_integration',
    vendor: 'Splunk',
    currentVersion: '1.2.1',
    latestVersion: '1.3.0',
    collectorsRunning: 14,
  },
  {
    id: 'fortinet_firewall',
    name: 'Fortinet FortiGate',
    category: 'network_firewall',
    vendor: 'Fortinet',
    currentVersion: '2.1.0',
    latestVersion: '2.1.0',
    collectorsRunning: 11,
  },
  {
    id: 'arista_monitoring',
    name: 'Arista Monitoring',
    category: 'network_monitoring',
    vendor: 'Arista',
    currentVersion: '1.5.2',
    latestVersion: '1.6.0',
    collectorsRunning: 7,
  },
  {
    id: 'cisco_asa',
    name: 'Cisco ASA',
    category: 'network_security',
    vendor: 'Cisco',
    currentVersion: '3.2.0',
    latestVersion: '3.2.0',
    collectorsRunning: 9,
  },
  {
    id: 'proofpoint_email',
    name: 'Proofpoint Email',
    category: 'email_security',
    vendor: 'Proofpoint',
    currentVersion: '2.0.0',
    latestVersion: '2.1.0',
    collectorsRunning: 6,
  },
  {
    id: 'kafka_bus',
    name: 'Apache Kafka Bus',
    category: 'message_bus',
    vendor: 'Apache',
    currentVersion: '1.8.0',
    latestVersion: '1.8.0',
    collectorsRunning: 13,
  },
];

const mockUpgradeHistory: UpgradeEvent[] = [
  {
    id: '1',
    timestamp: '2026-05-31 14:32',
    dnaName: 'Palo Alto Firewall',
    oldVersion: '1.9.8',
    newVersion: '2.0.0',
    triggeredBy: 'admin@security.corp',
    status: 'success',
    collectorsAffected: 24,
  },
  {
    id: '2',
    timestamp: '2026-05-30 11:15',
    dnaName: 'CrowdStrike EDR',
    oldVersion: '1.4.1',
    newVersion: '1.4.2',
    triggeredBy: 'ops-team@security.corp',
    status: 'success',
    collectorsAffected: 18,
  },
  {
    id: '3',
    timestamp: '2026-05-29 09:47',
    dnaName: 'Suricata IDS/IPS',
    oldVersion: '6.9.0',
    newVersion: '7.0.0',
    triggeredBy: 'admin@security.corp',
    status: 'failed',
    collectorsAffected: 3,
  },
  {
    id: '4',
    timestamp: '2026-05-29 10:22',
    dnaName: 'Suricata IDS/IPS',
    oldVersion: '7.0.0',
    newVersion: '6.9.0',
    triggeredBy: 'system-rollback',
    status: 'rollback',
    collectorsAffected: 3,
  },
  {
    id: '5',
    timestamp: '2026-05-28 16:05',
    dnaName: 'Okta Identity',
    oldVersion: '3.0.5',
    newVersion: '3.1.0',
    triggeredBy: 'admin@security.corp',
    status: 'success',
    collectorsAffected: 12,
  },
  {
    id: '6',
    timestamp: '2026-05-27 13:40',
    dnaName: 'Splunk Connector',
    oldVersion: '1.2.0',
    newVersion: '1.2.1',
    triggeredBy: 'ops-team@security.corp',
    status: 'success',
    collectorsAffected: 14,
  },
  {
    id: '7',
    timestamp: '2026-05-26 10:15',
    dnaName: 'AWS CloudTrail',
    oldVersion: '2.2.0',
    newVersion: '2.3.0',
    triggeredBy: 'admin@security.corp',
    status: 'success',
    collectorsAffected: 5,
  },
  {
    id: '8',
    timestamp: '2026-05-25 15:30',
    dnaName: 'Zeek NDS',
    oldVersion: '1.9.0',
    newVersion: '1.9.1',
    triggeredBy: 'ops-team@security.corp',
    status: 'success',
    collectorsAffected: 8,
  },
];

const mockDNADiff = {
  name: 'palo_alto_firewall',
  oldVersion: '2.0.0',
  newVersion: '2.1.0',
  changes: [
    { type: 'add', line: '+  ocsf_mapping: enabled' },
    { type: 'add', line: '+    ocsf_version: 1.0.0' },
    { type: 'add', line: '+    class_mappings:' },
    { type: 'add', line: '+      process: 5001' },
    { type: 'remove', line: '-  parser_engine: v1.2.0' },
    { type: 'add', line: '+  parser_engine: v1.3.0' },
    { type: 'add', line: '+    optimization: parallel_processing' },
    { type: 'add', line: '+    thread_pool: 8' },
  ],
};

const mockVersionDistribution: VersionDistribution = {
  palo_alto_firewall: { '2.0.0': 20, '2.1.0': 4 },
  crowdstrike_edr: { '1.4.2': 18 },
  okta_identity: { '3.1.0': 12 },
  suricata_ids: { '7.0.0': 16 },
  aws_cloudtrail: { '2.3.0': 5 },
  splunk_connector: { '1.2.1': 14 },
  fortinet_firewall: { '2.1.0': 11 },
  zeek_nds: { '1.9.1': 8 },
  arista_monitoring: { '1.5.2': 7 },
  cisco_asa: { '3.2.0': 9 },
};

const categoryLabels: { [key: string]: string } = {
  network_security: 'Network Security',
  endpoint_security: 'Endpoint Security',
  cloud: 'Cloud',
  identity: 'Identity',
  ids_ips: 'IDS/IPS',
  ndr: 'NDR',
  siem_integration: 'SIEM Integration',
  ot_ics: 'OT/ICS',
  waf: 'WAF',
  email_security: 'Email Security',
  message_bus: 'Message Bus',
  network_monitoring: 'Network Monitoring',
  cloud_security: 'Cloud Security',
  network_firewall: 'Network Firewall',
};

function VersionRegistryPanel() {
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(['network_firewall', 'endpoint_security', 'identity'])
  );
  const [searchTerm, setSearchTerm] = useState('');

  const groupedSpecs = useMemo(() => {
    const grouped: { [key: string]: DNASpec[] } = {};
    mockDNASpecs.forEach((spec) => {
      if (!grouped[spec.category]) {
        grouped[spec.category] = [];
      }
      grouped[spec.category].push(spec);
    });
    return grouped;
  }, []);

  const toggleCategory = (category: string) => {
    const newSet = new Set(expandedCategories);
    if (newSet.has(category)) {
      newSet.delete(category);
    } else {
      newSet.add(category);
    }
    setExpandedCategories(newSet);
  };

  const hasUpgrade = (spec: DNASpec) => spec.currentVersion !== spec.latestVersion;

  return (
    <div className="bg-slate-800 rounded-lg p-4 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-cyan-400 font-semibold mb-3 flex items-center gap-2">
          <GitBranch size={18} />
          DNA Version Registry
        </h3>
        <div className="relative">
          <Search
            size={16}
            className="absolute left-2 top-2.5 text-slate-500"
          />
          <input
            type="text"
            placeholder="Search DNA specs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {Object.entries(groupedSpecs).map(([category, specs]) => (
          <div key={category}>
            <button
              onClick={() => toggleCategory(category)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-slate-700 rounded transition-colors text-slate-300 text-sm font-medium"
            >
              {expandedCategories.has(category) ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
              <span>{categoryLabels[category]}</span>
              <span className="ml-auto text-xs bg-slate-700 px-2 py-1 rounded">
                {specs.length}
              </span>
            </button>

            {expandedCategories.has(category) && (
              <div className="ml-4 space-y-1">
                {specs.map((spec) => (
                  <div
                    key={spec.id}
                    className="px-3 py-2 bg-slate-700/50 rounded text-xs hover:bg-slate-700 transition-colors"
                  >
                    <div className="font-mono text-cyan-300 mb-1">
                      {spec.name}
                    </div>
                    <div className="text-slate-400 mb-2">{spec.vendor}</div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-emerald-900/40 text-emerald-300 px-2 py-0.5 rounded font-mono text-xs">
                        v{spec.currentVersion}
                      </span>
                      {hasUpgrade(spec) && (
                        <span className="bg-amber-900/40 text-amber-300 px-2 py-0.5 rounded font-mono text-xs">
                          v{spec.latestVersion}
                        </span>
                      )}
                      <span className="ml-auto text-slate-500">
                        {spec.collectorsRunning} collectors
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function UpgradeOrchestrationPanel() {
  const [targetDNA, setTargetDNA] = useState('palo_alto_firewall');
  const [targetVersion, setTargetVersion] = useState('2.1.0');
  const [strategy, setStrategy] = useState<
    'rolling' | 'canary' | 'all_at_once'
  >('rolling');
  const [siteFilter, setSiteFilter] = useState('');
  const [upgradeProgress, setUpgradeProgress] = useState(0);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const selectedSpec = mockDNASpecs.find((s) => s.id === targetDNA);

  const handleUpgrade = () => {
    setIsUpgrading(true);
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      if (progress >= 100) {
        progress = 100;
        clearInterval(interval);
        setTimeout(() => setIsUpgrading(false), 1500);
      }
      setUpgradeProgress(progress);
    }, 400);
  };

  const strategyDescriptions: {
    [key in 'rolling' | 'canary' | 'all_at_once']: string;
  } = {
    rolling: 'Rolling (batch of 5)',
    canary: 'Canary (1 collector first)',
    all_at_once: 'All at once',
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 space-y-4">
      <h3 className="text-cyan-400 font-semibold flex items-center gap-2">
        <Zap size={18} />
        Upgrade Orchestration
      </h3>

      <div className="space-y-3">
        <div>
          <label className="block text-slate-300 text-sm mb-2">
            Target DNA
          </label>
          <select
            value={targetDNA}
            onChange={(e) => {
              setTargetDNA(e.target.value);
              const spec = mockDNASpecs.find((s) => s.id === e.target.value);
              setTargetVersion(spec?.latestVersion || '');
            }}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
          >
            {mockDNASpecs.map((spec) => (
              <option key={spec.id} value={spec.id}>
                {spec.name}
              </option>
            ))}
          </select>
        </div>

        {selectedSpec && (
          <div className="bg-slate-700/50 rounded p-3 text-xs text-slate-300">
            <div>
              Current: <span className="text-emerald-300 font-mono">v{selectedSpec.currentVersion}</span>
            </div>
            <div>
              Latest: <span className="text-cyan-300 font-mono">v{selectedSpec.latestVersion}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-slate-300 text-sm mb-2">
            Target Version
          </label>
          <input
            type="text"
            value={targetVersion}
            onChange={(e) => setTargetVersion(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200 font-mono text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>

        <div>
          <label className="block text-slate-300 text-sm mb-2">
            Upgrade Strategy
          </label>
          <div className="space-y-2">
            {(['rolling', 'canary', 'all_at_once'] as const).map((strat) => (
              <label key={strat} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="strategy"
                  value={strat}
                  checked={strategy === strat}
                  onChange={(e) =>
                    setStrategy(e.target.value as typeof strategy)
                  }
                  className="accent-cyan-500"
                />
                <span className="text-sm text-slate-300">
                  {strategyDescriptions[strat]}
                </span>
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-slate-300 text-sm mb-2">
            Site Filter (optional)
          </label>
          <input
            type="text"
            placeholder="e.g., us-west-1, eu-central"
            value={siteFilter}
            onChange={(e) => setSiteFilter(e.target.value)}
            className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded text-slate-200 text-sm focus:outline-none focus:border-cyan-500"
          />
        </div>

        {selectedSpec && (
          <div className="bg-slate-700/50 rounded p-3 text-xs text-slate-300">
            <div className="mb-1">Collectors affected: {selectedSpec.collectorsRunning}</div>
            <div>Strategy: {strategyDescriptions[strategy]}</div>
          </div>
        )}

        <button
          onClick={handleUpgrade}
          disabled={isUpgrading}
          className="w-full bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-600 text-white font-semibold py-2 rounded transition-colors flex items-center justify-center gap-2"
        >
          <Play size={16} />
          Push Upgrade
        </button>

        {isUpgrading && (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Upgrade Progress</span>
              <span>
                {Math.round(upgradeProgress)}/{(selectedSpec?.collectorsRunning || 0)}
              </span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
              <div
                className="bg-cyan-500 h-full transition-all duration-300"
                style={{ width: `${upgradeProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function VersionHistoryTimeline() {
  const [expandedHistory, setExpandedHistory] = useState<Set<string>>(
    new Set()
  );

  const toggleHistory = (id: string) => {
    const newSet = new Set(expandedHistory);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setExpandedHistory(newSet);
  };

  const statusConfig = {
    success: {
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/10',
      icon: CheckCircle,
    },
    failed: {
      color: 'text-red-400',
      bgColor: 'bg-red-500/10',
      icon: AlertCircle,
    },
    rollback: {
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/10',
      icon: RotateCcw,
    },
  };

  return (
    <div className="bg-slate-800 rounded-lg p-4 mt-4">
      <h3 className="text-cyan-400 font-semibold flex items-center gap-2 mb-4">
        <History size={18} />
        Version History Timeline
      </h3>

      <div className="space-y-2">
        {mockUpgradeHistory.map((event, idx) => {
          const config = statusConfig[event.status];
          const StatusIcon = config.icon;

          return (
            <div
              key={event.id}
              className={`${config.bgColor} border border-slate-700 rounded p-3 cursor-pointer hover:border-slate-600 transition-colors`}
            >
              <div
                className="flex items-start justify-between"
                onClick={() => toggleHistory(event.id)}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusIcon size={16} className={config.color} />
                    <span className="font-mono text-sm text-slate-200">
                      {event.dnaName}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mb-2">
                    {event.timestamp} • by {event.triggeredBy}
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="bg-slate-700/50 px-2 py-1 rounded font-mono">
                      v{event.oldVersion}
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="bg-slate-700/50 px-2 py-1 rounded font-mono">
                      v{event.newVersion}
                    </span>
                    <span className="ml-auto text-slate-500">
                      {event.collectorsAffected} collectors
                    </span>
                  </div>
                </div>
              </div>

              {expandedHistory.has(event.id) && (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-2">
                  <div className="text-xs text-slate-400">
                    <strong>Status:</strong>{' '}
                    <span className={config.color}>{event.status}</span>
                  </div>
                  {event.status === 'failed' && (
                    <button className="w-full bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 transition-colors">
                      <RotateCcw size={14} />
                      Rollback Version
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DNADiffViewer() {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="bg-slate-800 rounded-lg p-4 mt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <h3 className="text-cyan-400 font-semibold flex items-center gap-2">
          <Code size={18} />
          DNA Diff Viewer
        </h3>
        <ChevronDown
          size={18}
          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="mt-4 bg-slate-900 rounded p-4 font-mono text-xs overflow-x-auto">
          <div className="text-slate-400 mb-3">
            <span className="text-slate-500">
              {mockDNADiff.name}:{' '}
            </span>
            <span className="text-slate-300 font-semibold">
              v{mockDNADiff.oldVersion}
            </span>
            <span className="text-slate-500"> → </span>
            <span className="text-slate-300 font-semibold">
              v{mockDNADiff.newVersion}
            </span>
          </div>

          <div className="border-t border-slate-700 pt-3 space-y-1">
            {mockDNADiff.changes.map((change, idx) => (
              <div
                key={idx}
                className={`${
                  change.type === 'add'
                    ? 'bg-emerald-500/10 text-emerald-300'
                    : 'bg-red-500/10 text-red-300'
                } px-2 py-0.5 rounded`}
              >
                {change.line}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FleetCoverageMatrix() {
  const [isExpanded, setIsExpanded] = useState(false);

  const topDNAs = Object.entries(mockVersionDistribution)
    .sort(
      ([, a], [, b]) =>
        Object.values(b).reduce((sum, val) => sum + val, 0) -
        Object.values(a).reduce((sum, val) => sum + val, 0)
    )
    .slice(0, 10);

  const allVersions = Array.from(
    new Set(
      topDNAs.flatMap(([, versions]) => Object.keys(versions))
    )
  ).sort();

  const maxCollectors = Math.max(
    ...topDNAs.flatMap(([, versions]) => Object.values(versions))
  );

  return (
    <div className="bg-slate-800 rounded-lg p-4 mt-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <h3 className="text-cyan-400 font-semibold flex items-center gap-2">
          <Grid3x3 size={18} />
          Fleet Coverage Matrix
        </h3>
        <ChevronDown
          size={18}
          className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="mt-4 overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex gap-1">
              <div className="w-32 flex-shrink-0">
                <div className="text-xs text-slate-400 h-8 flex items-end pb-1 font-semibold">
                  DNA
                </div>
                {topDNAs.map(([dnaId]) => {
                  const spec = mockDNASpecs.find((s) => s.id === dnaId);
                  return (
                    <div
                      key={dnaId}
                      className="h-8 flex items-center text-xs text-slate-300 truncate border-b border-slate-700 px-2"
                      title={spec?.name}
                    >
                      {spec?.name}
                    </div>
                  );
                })}
              </div>

              {allVersions.map((version) => (
                <div key={version} className="flex-shrink-0">
                  <div className="text-xs text-slate-400 h-8 flex items-end justify-center pb-1 font-semibold w-12">
                    {version.split('.')[0]}
                  </div>
                  {topDNAs.map(([dnaId]) => {
                    const count =
                      mockVersionDistribution[dnaId]?.[version] || 0;
                    const intensity = count > 0 ? count / maxCollectors : 0;
                    const color =
                      intensity > 0.7
                        ? 'bg-cyan-600'
                        : intensity > 0.4
                          ? 'bg-cyan-500'
                          : intensity > 0
                            ? 'bg-cyan-400/40'
                            : 'bg-slate-700/30';

                    return (
                      <div
                        key={`${dnaId}-${version}`}
                        className={`w-12 h-8 flex items-center justify-center text-xs font-mono text-slate-200 border border-slate-700 ${color}`}
                        title={`${count} collectors on ${dnaId} v${version}`}
                      >
                        {count > 0 ? count : ''}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DNAVersionManager() {
  return (
    <div className="bg-slate-900 min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-cyan-400 flex items-center gap-3 mb-2">
            <GitBranch size={32} />
            DNA Version Manager
          </h1>
          <p className="text-slate-400 text-sm">
            Manage and orchestrate DNA connector version upgrades across your
            edge fleet
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-1">
            <VersionRegistryPanel />
          </div>
          <div className="lg:col-span-2">
            <UpgradeOrchestrationPanel />
          </div>
        </div>

        <VersionHistoryTimeline />
        <DNADiffViewer />
        <FleetCoverageMatrix />
      </div>
    </div>
  );
}
