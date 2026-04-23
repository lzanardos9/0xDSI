import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Globe, Bug, Target, AlertTriangle, Users, Link, Search, Filter,
  ChevronRight, ChevronDown, Download, Upload, RefreshCw, Clock, CheckCircle2,
  XCircle, Eye, Zap, Activity, Database, FileText, Plus, ExternalLink, X
} from 'lucide-react';

const uuid = (prefix: string, i: number) => `${prefix}--${crypto.randomUUID?.() ?? `a1b2c3d4-e5f6-4a7b-8c9d-${String(i).padStart(12, '0')}`}`;

const TLP_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  WHITE: { bg: 'bg-gray-200', text: 'text-gray-900', glow: 'shadow-[0_0_8px_rgba(255,255,255,0.5)]' },
  GREEN: { bg: 'bg-green-600', text: 'text-white', glow: 'shadow-[0_0_8px_rgba(34,197,94,0.6)]' },
  AMBER: { bg: 'bg-amber-500', text: 'text-black', glow: 'shadow-[0_0_8px_rgba(245,158,11,0.6)]' },
  RED: { bg: 'bg-red-600', text: 'text-white', glow: 'shadow-[0_0_8px_rgba(239,68,68,0.7)]' },
};

const SEVERITY_COLORS: Record<string, string> = {
  Critical: 'bg-red-600 text-white', High: 'bg-orange-500 text-white',
  Medium: 'bg-yellow-500 text-black', Low: 'bg-blue-500 text-white',
};

const STIX_TYPES = [
  { key: 'indicator', label: 'Indicators', icon: AlertTriangle, count: 14 },
  { key: 'threat-actor', label: 'Threat Actors', icon: Users, count: 8 },
  { key: 'malware', label: 'Malware', icon: Bug, count: 8 },
  { key: 'attack-pattern', label: 'Attack Patterns', icon: Target, count: 6 },
  { key: 'campaign', label: 'Campaigns', icon: Shield, count: 5 },
  { key: 'vulnerability', label: 'Vulnerabilities', icon: Zap, count: 5 },
];

const THREAT_ACTORS = ['APT-29', 'Lazarus Group', 'FIN7', 'Sandworm', 'APT-28', 'Turla', 'Carbanak', 'Kimsuky'];
const MALWARE_NAMES = ['CobaltStrike', 'Emotet', 'TrickBot', 'Ryuk', 'QakBot', 'IcedID', 'BazarLoader', 'Dridex'];
const CAMPAIGNS = ['SolarStorm', 'DarkHalo', 'GhostWriter', 'SeaTurtle', 'Skeleton Key'];
const CVES = ['CVE-2024-21762', 'CVE-2023-44228', 'CVE-2024-3400', 'CVE-2023-46805', 'CVE-2024-1709'];
const ATTACK_PATTERNS = ['Spearphishing Attachment', 'Command and Scripting', 'Credential Dumping', 'Remote Services Exploitation', 'Lateral Movement via SMB', 'DLL Side-Loading'];
const TLP_KEYS = ['WHITE', 'GREEN', 'AMBER', 'RED'] as const;

function makeObjects(type: string, count: number) {
  const names = type === 'threat-actor' ? THREAT_ACTORS : type === 'malware' ? MALWARE_NAMES
    : type === 'campaign' ? CAMPAIGNS : type === 'vulnerability' ? CVES : type === 'attack-pattern' ? ATTACK_PATTERNS : [];
  return Array.from({ length: count }, (_, i) => ({
    id: `${type}--${crypto.randomUUID?.() ?? `f${i}a1b2c3-d4e5-4f6a-7b8c-9d0e1f2a3b${String(i).padStart(2, '0')}`}`,
    type, name: names[i] || `${type.replace('-', ' ')}-${i + 1}`,
    created: `2024-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 28) + 1).padStart(2, '0')}`,
    confidence: 40 + Math.floor(Math.random() * 60),
    tlp: TLP_KEYS[i % 4],
    severity: ['Critical', 'High', 'Medium', 'Low'][i % 4],
    pattern: type === 'indicator' ? `[file:hashes.SHA-256 = '${Array(64).fill(0).map(() => '0123456789abcdef'[Math.floor(Math.random() * 16)]).join('')}']` : undefined,
    killChain: ['Reconnaissance', 'Weaponization', 'Delivery', 'Exploitation', 'Installation'][i % 5],
    matchCount: Math.floor(Math.random() * 200), lastMatch: `${Math.floor(Math.random() * 48) + 1}h ago`,
  }));
}

const ALL_OBJECTS = STIX_TYPES.flatMap(t => makeObjects(t.key, t.count));

const FEEDS = [
  { id: 1, name: 'AlienVault OTX', url: 'https://otx.alienvault.com/taxii', status: 'connected', collections: 12, lastPoll: '5 min ago', received: 4230 },
  { id: 2, name: 'CIRCL TAXII', url: 'https://www.circl.lu/taxii', status: 'connected', collections: 8, lastPoll: '12 min ago', received: 1870 },
  { id: 3, name: 'MITRE ATT&CK TAXII', url: 'https://cti-taxii.mitre.org/taxii', status: 'disconnected', collections: 4, lastPoll: '2h ago', received: 15420 },
  { id: 4, name: 'FS-ISAC Financial', url: 'https://taxii.fsisac.com/taxii2', status: 'connected', collections: 6, lastPoll: '30 min ago', received: 920 },
];

const GRAPH_NODES = [
  { id: 0, label: 'APT-29', type: 'threat-actor', x: 400, y: 80 },
  { id: 1, label: 'CobaltStrike', type: 'malware', x: 200, y: 200 },
  { id: 2, label: 'Spearphishing', type: 'attack-pattern', x: 600, y: 200 },
  { id: 3, label: 'CVE-2024-21762', type: 'vulnerability', x: 150, y: 350 },
  { id: 4, label: 'SolarStorm', type: 'campaign', x: 650, y: 350 },
  { id: 5, label: 'Lazarus', type: 'threat-actor', x: 400, y: 300 },
  { id: 6, label: 'Emotet', type: 'malware', x: 100, y: 180 },
  { id: 7, label: 'TrickBot', type: 'malware', x: 300, y: 400 },
  { id: 8, label: 'FIN7', type: 'threat-actor', x: 700, y: 120 },
  { id: 9, label: 'Ryuk', type: 'malware', x: 500, y: 420 },
  { id: 10, label: 'DLL Side-Loading', type: 'attack-pattern', x: 750, y: 300 },
  { id: 11, label: 'CVE-2023-44228', type: 'vulnerability', x: 50, y: 350 },
];

const GRAPH_EDGES = [
  { from: 0, to: 1, label: 'uses' }, { from: 0, to: 2, label: 'uses' },
  { from: 1, to: 3, label: 'exploits' }, { from: 0, to: 4, label: 'targets' },
  { from: 5, to: 7, label: 'uses' }, { from: 5, to: 9, label: 'delivers' },
  { from: 6, to: 7, label: 'delivers' }, { from: 8, to: 10, label: 'uses' },
  { from: 8, to: 1, label: 'uses' }, { from: 7, to: 9, label: 'delivers' },
  { from: 6, to: 11, label: 'exploits' }, { from: 5, to: 6, label: 'uses' },
];

const NODE_COLORS: Record<string, string> = {
  'threat-actor': '#ef4444', malware: '#a855f7', 'attack-pattern': '#f59e0b',
  vulnerability: '#3b82f6', campaign: '#10b981',
};

export default function StixTaxiiManager() {
  const [tab, setTab] = useState('objects');
  const [stixTab, setStixTab] = useState('indicator');
  const [tlpFilter, setTlpFilter] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<typeof ALL_OBJECTS[0] | null>(null);
  const [syncing, setSyncing] = useState<number | null>(null);
  const [syncCount, setSyncCount] = useState(0);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [visibleCards, setVisibleCards] = useState<Set<string>>(new Set());

  const filtered = ALL_OBJECTS.filter(o =>
    o.type === stixTab &&
    (!tlpFilter || o.tlp === tlpFilter) &&
    (!search || o.name.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    setVisibleCards(new Set());
    const ids = filtered.map(o => o.id);
    ids.forEach((id, i) => {
      setTimeout(() => setVisibleCards(prev => new Set(prev).add(id)), i * 60);
    });
  }, [stixTab, tlpFilter, search]);

  const handleSync = useCallback((feedId: number) => {
    setSyncing(feedId); setSyncCount(0);
    const iv = setInterval(() => setSyncCount(p => p + Math.floor(Math.random() * 30) + 10), 200);
    setTimeout(() => { clearInterval(iv); setSyncing(null); }, 3000);
  }, []);

  const totalObjects = ALL_OBJECTS.length;
  const critCount = ALL_OBJECTS.filter(o => o.severity === 'Critical').length;
  const activeActors = THREAT_ACTORS.length;

  const mainTabs = [
    { key: 'objects', label: 'Objects', icon: Database },
    { key: 'feeds', label: 'Feeds', icon: Globe },
    { key: 'graph', label: 'Graph', icon: Link },
    { key: 'matching', label: 'Matching', icon: Search },
  ];

  return (
    <div className="min-h-screen bg-[#0A1628] text-gray-100 font-sans">
      {/* Summary Bar */}
      <div className="bg-[#0D1B2A] border-b border-cyan-900/40 px-6 py-3 flex items-center gap-6 text-sm">
        <div className="flex items-center gap-2"><Shield className="w-5 h-5 text-cyan-400" /><span className="font-bold text-cyan-300 text-lg">STIX/TAXII Manager</span></div>
        <div className="ml-auto flex items-center gap-6">
          <span className="flex items-center gap-1"><Database className="w-4 h-4 text-blue-400" />{totalObjects} Objects</span>
          <span className="flex items-center gap-1"><AlertTriangle className="w-4 h-4 text-red-400" />{critCount} Critical</span>
          <span className="flex items-center gap-1"><Users className="w-4 h-4 text-amber-400" />{activeActors} Active Actors</span>
          <span className="flex items-center gap-1"><Activity className="w-4 h-4 text-green-400" />{FEEDS.filter(f => f.status === 'connected').length}/{FEEDS.length} Feeds</span>
          <button className="flex items-center gap-1 px-3 py-1 bg-cyan-700/30 border border-cyan-600/40 rounded hover:bg-cyan-700/50 transition"><Upload className="w-4 h-4" />Import</button>
          <button className="flex items-center gap-1 px-3 py-1 bg-cyan-700/30 border border-cyan-600/40 rounded hover:bg-cyan-700/50 transition"><Download className="w-4 h-4" />Export</button>
        </div>
      </div>

      {/* TLP Filter + Search */}
      <div className="px-6 py-3 flex items-center gap-3 bg-[#0D1B2A]/60 border-b border-cyan-900/20">
        <Filter className="w-4 h-4 text-gray-400" />
        <span className="text-xs text-gray-400 mr-1">TLP:</span>
        {['WHITE', 'GREEN', 'AMBER', 'RED'].map(t => (
          <button key={t} onClick={() => setTlpFilter(tlpFilter === t ? null : t)}
            className={`px-2 py-0.5 rounded text-xs font-bold transition ${TLP_COLORS[t].bg} ${TLP_COLORS[t].text} ${tlpFilter === t ? TLP_COLORS[t].glow + ' ring-2 ring-white/30' : 'opacity-60 hover:opacity-100'}`}>
            {t}
          </button>
        ))}
        <div className="ml-auto relative">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-gray-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search objects..."
            className="bg-[#0A1628] border border-cyan-900/40 rounded pl-8 pr-3 py-1 text-sm focus:outline-none focus:border-cyan-500 w-64" />
        </div>
      </div>

      {/* Main Tabs */}
      <div className="flex border-b border-cyan-900/30 px-6">
        {mainTabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all border-b-2 ${tab === t.key ? 'border-cyan-400 text-cyan-300' : 'border-transparent text-gray-500 hover:text-gray-300'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      <div className="p-6">
        {/* OBJECTS TAB */}
        {tab === 'objects' && (
          <div>
            <div className="flex gap-2 mb-4 flex-wrap">
              {STIX_TYPES.map(t => (
                <button key={t.key} onClick={() => setStixTab(t.key)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm transition ${stixTab === t.key ? 'bg-cyan-700/40 text-cyan-200 border border-cyan-500/50' : 'bg-[#0D1B2A] text-gray-400 border border-cyan-900/30 hover:border-cyan-700/50'}`}>
                  <t.icon className="w-4 h-4" />{t.label}<span className="text-xs opacity-60">({t.count})</span>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {filtered.map(obj => {
                const Icon = STIX_TYPES.find(t => t.key === obj.type)?.icon || FileText;
                return (
                  <div key={obj.id} onClick={() => setDetail(obj)}
                    className={`bg-[#0D1B2A] border border-cyan-900/30 rounded-lg p-4 cursor-pointer hover:border-cyan-500/50 hover:bg-[#112240] transition-all duration-300 ${visibleCards.has(obj.id) ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="w-5 h-5 text-cyan-400" />
                        <span className="font-semibold text-sm">{obj.name}</span>
                      </div>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TLP_COLORS[obj.tlp].bg} ${TLP_COLORS[obj.tlp].text} ${TLP_COLORS[obj.tlp].glow}`}>
                        TLP:{obj.tlp}
                      </span>
                    </div>
                    <div className="text-[11px] text-gray-500 font-mono mb-2 truncate">{obj.id}</div>
                    <div className="flex items-center gap-3 text-xs text-gray-400 mb-2">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{obj.created}</span>
                      <span className={`px-1.5 py-0.5 rounded ${SEVERITY_COLORS[obj.severity]} text-[10px] font-bold`}>{obj.severity}</span>
                    </div>
                    <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${obj.confidence}%`, background: `linear-gradient(90deg, #06b6d4, ${obj.confidence > 70 ? '#10b981' : '#f59e0b'})` }} />
                    </div>
                    <div className="text-[10px] text-gray-500 mt-1">Confidence: {obj.confidence}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* FEEDS TAB */}
        {tab === 'feeds' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold text-cyan-300">TAXII Feed Management</h2>
              <button onClick={() => setShowAddFeed(true)} className="flex items-center gap-2 px-3 py-1.5 bg-cyan-700/40 border border-cyan-500/50 rounded text-sm hover:bg-cyan-700/60 transition">
                <Plus className="w-4 h-4" />Add Feed
              </button>
            </div>
            <div className="space-y-3">
              {FEEDS.map(f => (
                <div key={f.id} className="bg-[#0D1B2A] border border-cyan-900/30 rounded-lg p-4 hover:border-cyan-700/40 transition">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-cyan-400" />
                      <div>
                        <div className="font-semibold">{f.name}</div>
                        <div className="text-xs text-gray-500 font-mono">{f.url}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={`flex items-center gap-1 text-xs ${f.status === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
                        {f.status === 'connected' ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                        {f.status}
                      </span>
                      <span className="text-xs text-gray-400">{f.collections} collections</span>
                      <span className="text-xs text-gray-400 flex items-center gap-1"><Clock className="w-3 h-3" />{f.lastPoll}</span>
                      <span className="text-xs text-cyan-400">{syncing === f.id ? syncCount : f.received} objects</span>
                      <button onClick={() => handleSync(f.id)}
                        className="flex items-center gap-1 px-2 py-1 bg-cyan-800/40 border border-cyan-700/40 rounded text-xs hover:bg-cyan-700/50 transition">
                        <RefreshCw className={`w-3.5 h-3.5 ${syncing === f.id ? 'animate-spin' : ''}`} />Sync
                      </button>
                      <ExternalLink className="w-4 h-4 text-gray-500 cursor-pointer hover:text-cyan-400 transition" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {showAddFeed && (
              <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowAddFeed(false)}>
                <div className="bg-[#0D1B2A] border border-cyan-700/50 rounded-xl p-6 w-[440px]" onClick={e => e.stopPropagation()}>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold text-cyan-300">Add TAXII Feed</h3>
                    <X className="w-5 h-5 cursor-pointer text-gray-500 hover:text-white" onClick={() => setShowAddFeed(false)} />
                  </div>
                  {['Feed Name', 'Discovery URL', 'API Root', 'Username'].map(lbl => (
                    <div key={lbl} className="mb-3">
                      <label className="block text-xs text-gray-400 mb-1">{lbl}</label>
                      <input className="w-full bg-[#0A1628] border border-cyan-900/50 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-cyan-500" />
                    </div>
                  ))}
                  <div className="flex justify-end gap-2 mt-4">
                    <button onClick={() => setShowAddFeed(false)} className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition">Cancel</button>
                    <button onClick={() => setShowAddFeed(false)} className="px-4 py-1.5 bg-cyan-600 rounded text-sm font-medium hover:bg-cyan-500 transition">Connect</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* GRAPH TAB */}
        {tab === 'graph' && (
          <div>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">STIX Relationship Graph</h2>
            <div className="bg-[#0D1B2A] border border-cyan-900/30 rounded-lg overflow-hidden">
              <svg viewBox="0 0 820 480" className="w-full h-[460px]">
                <defs>
                  <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6" fill="#06b6d4" opacity="0.6" /></marker>
                </defs>
                {GRAPH_EDGES.map((e, i) => {
                  const a = GRAPH_NODES[e.from], b = GRAPH_NODES[e.to];
                  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
                  return (
                    <g key={i}>
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#06b6d4" strokeWidth="1.5" opacity="0.3" markerEnd="url(#arrow)" />
                      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#06b6d4" strokeWidth="1.5" opacity="0.7"
                        strokeDasharray="6 4" strokeDashoffset="0">
                        <animate attributeName="stroke-dashoffset" from="0" to="-20" dur={`${1.5 + i * 0.2}s`} repeatCount="indefinite" />
                      </line>
                      <text x={mx} y={my - 6} textAnchor="middle" fontSize="9" fill="#67e8f9" opacity="0.8">{e.label}</text>
                    </g>
                  );
                })}
                {GRAPH_NODES.map(n => (
                  <g key={n.id} onClick={() => setSelectedNode(selectedNode === n.id ? null : n.id)} className="cursor-pointer">
                    <circle cx={n.x} cy={n.y} r={selectedNode === n.id ? 26 : 22} fill={NODE_COLORS[n.type] || '#6b7280'} opacity={0.2} />
                    <circle cx={n.x} cy={n.y} r={selectedNode === n.id ? 20 : 16} fill={NODE_COLORS[n.type] || '#6b7280'} stroke={selectedNode === n.id ? '#fff' : NODE_COLORS[n.type]} strokeWidth={selectedNode === n.id ? 2 : 1} />
                    <text x={n.x} y={n.y + 3} textAnchor="middle" fontSize="8" fill="white" fontWeight="bold">{n.label.substring(0, 6)}</text>
                    <text x={n.x} y={n.y + 36} textAnchor="middle" fontSize="8" fill="#94a3b8">{n.type}</text>
                  </g>
                ))}
              </svg>
            </div>
            {selectedNode !== null && (
              <div className="mt-3 bg-[#0D1B2A] border border-cyan-900/30 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Eye className="w-4 h-4 text-cyan-400" /><span className="font-semibold">{GRAPH_NODES[selectedNode].label}</span>
                  <span className="text-xs text-gray-500 ml-2">{GRAPH_NODES[selectedNode].type}</span>
                </div>
                <div className="text-xs text-gray-400">
                  Relationships: {GRAPH_EDGES.filter(e => e.from === selectedNode || e.to === selectedNode)
                    .map(e => `${e.label} ${GRAPH_NODES[e.from === selectedNode ? e.to : e.from].label}`).join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* MATCHING TAB */}
        {tab === 'matching' && (
          <div>
            <h2 className="text-lg font-semibold text-cyan-300 mb-3">IOC Matching Results</h2>
            <div className="space-y-2">
              {ALL_OBJECTS.filter(o => o.type === 'indicator').map(obj => (
                <div key={obj.id} onClick={() => setDetail(obj)}
                  className="bg-[#0D1B2A] border border-cyan-900/30 rounded-lg p-3 flex items-center justify-between cursor-pointer hover:border-cyan-600/50 transition">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-cyan-400" />
                    <div>
                      <div className="text-sm font-medium">{obj.name}</div>
                      <div className="text-[11px] text-gray-500 font-mono">{obj.id}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 flex items-center gap-1"><Zap className="w-3 h-3 text-amber-400" />{obj.matchCount} matches</span>
                    <span className="text-xs text-gray-500 flex items-center gap-1"><Clock className="w-3 h-3" />{obj.lastMatch}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${SEVERITY_COLORS[obj.severity]}`}>{obj.severity}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${TLP_COLORS[obj.tlp].bg} ${TLP_COLORS[obj.tlp].text} ${TLP_COLORS[obj.tlp].glow}`}>TLP:{obj.tlp}</span>
                    <ChevronRight className="w-4 h-4 text-gray-600" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Detail Slide-Out */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end" onClick={() => setDetail(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative w-[480px] bg-[#0D1B2A] border-l border-cyan-900/40 h-full overflow-y-auto animate-[slideIn_0.25s_ease-out]"
            onClick={e => e.stopPropagation()}>
            <style>{`@keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}`}</style>
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-cyan-300">{detail.name}</h3>
                <X className="w-5 h-5 cursor-pointer text-gray-500 hover:text-white transition" onClick={() => setDetail(null)} />
              </div>
              <div className="space-y-4">
                {[
                  ['STIX ID', detail.id],
                  ['Type', detail.type],
                  ['Created', detail.created],
                  ['Confidence', `${detail.confidence}%`],
                  ['Severity', detail.severity],
                  ['Kill Chain Phase', detail.killChain],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <div className="text-xs text-gray-500 mb-1">{label}</div>
                    <div className="text-sm font-mono bg-[#0A1628] rounded px-3 py-1.5 border border-cyan-900/20">{value}</div>
                  </div>
                ))}
                <div>
                  <div className="text-xs text-gray-500 mb-1">TLP Marking</div>
                  <span className={`px-2 py-1 rounded text-xs font-bold ${TLP_COLORS[detail.tlp].bg} ${TLP_COLORS[detail.tlp].text} ${TLP_COLORS[detail.tlp].glow}`}>
                    TLP:{detail.tlp}
                  </span>
                </div>
                {detail.pattern && (
                  <div>
                    <div className="text-xs text-gray-500 mb-1">STIX Pattern</div>
                    <div className="text-xs font-mono bg-[#0A1628] rounded px-3 py-2 border border-cyan-900/20 break-all text-cyan-300">{detail.pattern}</div>
                  </div>
                )}
                <div>
                  <div className="text-xs text-gray-500 mb-1">Confidence</div>
                  <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${detail.confidence}%`, background: 'linear-gradient(90deg, #06b6d4, #10b981)' }} />
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-2">Related Objects</div>
                  {ALL_OBJECTS.filter(o => o.type !== detail.type).slice(0, 3).map(r => (
                    <div key={r.id} onClick={() => setDetail(r)}
                      className="flex items-center gap-2 p-2 rounded bg-[#0A1628] border border-cyan-900/20 mb-1 cursor-pointer hover:border-cyan-600/40 transition text-sm">
                      <Link className="w-3.5 h-3.5 text-cyan-500" />{r.name}
                      <span className="text-xs text-gray-500 ml-auto">{r.type}</span>
                      <ChevronRight className="w-3 h-3 text-gray-600" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
