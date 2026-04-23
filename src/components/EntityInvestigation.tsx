import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  User, Globe, Server, FileCode, Search, Shield, AlertTriangle, Clock,
  Activity, MapPin, Network, Eye, Lock, ChevronDown, ChevronRight,
  Crosshair, Zap, TrendingUp, ExternalLink, Ban, Plus, X
} from 'lucide-react';

interface Entity {
  id: string; name: string; type: 'user' | 'ip' | 'hostname' | 'filehash';
  risk: number; classification: 'Malicious' | 'Suspicious' | 'Clean';
  firstSeen: string; lastSeen: string; relatedCount: number;
}

interface TimelineEvent {
  id: string; type: 'login' | 'alert' | 'file_access' | 'network' | 'process' | 'anomaly';
  time: string; title: string; detail: string; severity: 'critical' | 'high' | 'medium' | 'low';
}

interface RelatedNode {
  id: string; label: string; type: 'user' | 'ip' | 'hostname' | 'filehash';
  angle: number; distance: number;
}

const ENTITIES: Entity[] = [
  { id: '1', name: 'jdoe_admin', type: 'user', risk: 87, classification: 'Malicious', firstSeen: '2026-01-15', lastSeen: '2026-04-23', relatedCount: 14 },
  { id: '2', name: '198.51.100.44', type: 'ip', risk: 72, classification: 'Suspicious', firstSeen: '2026-02-08', lastSeen: '2026-04-22', relatedCount: 9 },
  { id: '3', name: 'DC-PROD-01', type: 'hostname', risk: 64, classification: 'Suspicious', firstSeen: '2025-11-20', lastSeen: '2026-04-23', relatedCount: 11 },
  { id: '4', name: 'a3f2...c8d1', type: 'filehash', risk: 95, classification: 'Malicious', firstSeen: '2026-04-18', lastSeen: '2026-04-23', relatedCount: 6 },
  { id: '5', name: '203.0.113.12', type: 'ip', risk: 34, classification: 'Clean', firstSeen: '2026-03-01', lastSeen: '2026-04-21', relatedCount: 3 },
];

const makeEvents = (eid: string): TimelineEvent[] => {
  const types: TimelineEvent['type'][] = ['login', 'alert', 'file_access', 'network', 'process', 'anomaly'];
  const sevs: TimelineEvent['severity'][] = ['critical', 'high', 'medium', 'low'];
  const titles: Record<string, string[]> = {
    login: ['Successful RDP Login', 'Failed SSH Attempt', 'Kerberos Auth'],
    alert: ['Sigma Rule Match', 'YARA Detection', 'Behavioral Alert'],
    file_access: ['Sensitive File Read', 'Config Modification', 'Binary Drop'],
    network: ['C2 Beacon Detected', 'DNS Exfil Attempt', 'Lateral Movement'],
    process: ['PowerShell Execution', 'LSASS Access', 'Service Install'],
    anomaly: ['Off-hours Activity', 'Impossible Travel', 'Privilege Spike'],
  };
  return Array.from({ length: 14 }, (_, i) => {
    const t = types[i % types.length];
    const tList = titles[t];
    return {
      id: `${eid}-ev-${i}`, type: t, severity: sevs[i % sevs.length],
      time: `2026-04-${String(10 + i).padStart(2, '0')} ${String(8 + (i * 2) % 14).padStart(2, '0')}:${String((i * 17) % 60).padStart(2, '0')}:00`,
      title: tList[i % tList.length],
      detail: `Entity ${eid} triggered ${tList[i % tList.length].toLowerCase()} event. Source context: session-${1000 + i}, rule-ref SIGMA-${2000 + i}. Analyst review recommended.`,
    };
  });
};

const makeRelated = (eid: string): RelatedNode[] => {
  const items: [string, string, RelatedNode['type']][] = [
    ['srv-web-03', 'srv-web-03', 'hostname'], ['10.0.0.55', '10.0.0.55', 'ip'],
    ['admin_svc', 'admin_svc', 'user'], ['b7e4...d2f0', 'b7e4...d2f0', 'filehash'],
    ['192.168.1.10', '192.168.1.10', 'ip'], ['jsmith', 'jsmith', 'user'],
    ['DC-BACKUP-02', 'DC-BACKUP-02', 'hostname'], ['c9a1...f3e7', 'c9a1...f3e7', 'filehash'],
  ];
  return items.map(([id, label, type], i) => ({
    id: `${eid}-rel-${id}`, label, type,
    angle: (i / items.length) * Math.PI * 2,
    distance: 100 + (i % 3) * 20,
  }));
};

const ANOMALIES = [
  { id: 'a1', title: 'Impossible Travel', icon: MapPin, score: 92, desc: 'Login from NYC then London within 14 minutes' },
  { id: 'a2', title: 'Off-Hours Access', icon: Clock, score: 78, desc: 'Accessed sensitive systems at 03:47 UTC on Sunday' },
  { id: 'a3', title: 'Privilege Escalation', icon: TrendingUp, score: 85, desc: 'Elevated to domain admin without change ticket' },
  { id: 'a4', title: 'Data Exfiltration', icon: ExternalLink, score: 68, desc: '4.2 GB uploaded to external endpoint in 12 minutes' },
];

const typeIcon = (t: string) => {
  const m: Record<string, React.ReactNode> = {
    user: <User size={14} />, ip: <Globe size={14} />,
    hostname: <Server size={14} />, filehash: <FileCode size={14} />,
    login: <Lock size={14} />, alert: <AlertTriangle size={14} />,
    file_access: <FileCode size={14} />, network: <Network size={14} />,
    process: <Activity size={14} />, anomaly: <Zap size={14} />,
  };
  return m[t] || <Eye size={14} />;
};

const typeColor = (t: string) => {
  const m: Record<string, string> = {
    user: '#3B82F6', ip: '#10B981', hostname: '#F59E0B',
    filehash: '#EF4444', login: '#6366F1', alert: '#EF4444',
    file_access: '#F59E0B', network: '#10B981', process: '#8B5CF6', anomaly: '#EC4899',
  };
  return m[t] || '#64748B';
};

const sevColor = (s: string) => ({ critical: '#EF4444', high: '#F97316', medium: '#EAB308', low: '#22C55E' }[s] || '#64748B');
const classColor = (c: string) => ({ Malicious: '#EF4444', Suspicious: '#F59E0B', Clean: '#22C55E' }[c] || '#64748B');

// --- Risk Gauge ---
const RiskGauge: React.FC<{ risk: number; color: string }> = ({ risk, color }) => {
  const [animVal, setAnimVal] = useState(0);
  useEffect(() => {
    setAnimVal(0);
    let frame: number; let start: number;
    const dur = 1200;
    const tick = (ts: number) => {
      if (!start) start = ts;
      const p = Math.min((ts - start) / dur, 1);
      setAnimVal(Math.round(risk * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [risk]);

  const r = 54, circ = 2 * Math.PI * r, offset = circ - (animVal / 100) * circ;
  return (
    <svg width="140" height="140" viewBox="0 0 140 140">
      <circle cx="70" cy="70" r={r} fill="none" stroke="#1E293B" strokeWidth="10" />
      <circle cx="70" cy="70" r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        transform="rotate(-90 70 70)" style={{ transition: 'stroke-dashoffset 0.05s linear' }}>
        <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x="70" y="66" textAnchor="middle" fill={color} fontSize="28" fontWeight="bold">{animVal}</text>
      <text x="70" y="86" textAnchor="middle" fill="#64748B" fontSize="11">RISK SCORE</text>
    </svg>
  );
};

// --- Relationship Graph ---
const RelGraph: React.FC<{ nodes: RelatedNode[]; centerLabel: string; centerType: string }> = ({ nodes, centerLabel, centerType }) => {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setPulse(p => (p + 1) % 100), 50);
    return () => clearInterval(iv);
  }, []);
  const cx = 200, cy = 200, pr = 18 + Math.sin(pulse * 0.06) * 3;
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 400">
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor={typeColor(centerType)} stopOpacity="0.4" />
          <stop offset="100%" stopColor={typeColor(centerType)} stopOpacity="0" />
        </radialGradient>
      </defs>
      {nodes.map((n, i) => {
        const nx = cx + Math.cos(n.angle) * n.distance;
        const ny = cy + Math.sin(n.angle) * n.distance;
        const dashOff = (pulse * 0.5 + i * 10) % 20;
        return (
          <g key={n.id}>
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={typeColor(n.type)}
              strokeWidth="1.5" strokeDasharray="6 4" strokeDashoffset={dashOff} opacity="0.6" />
            <circle cx={nx} cy={ny} r="22" fill="#0F1D32" stroke={typeColor(n.type)} strokeWidth="2">
              <animate attributeName="r" values="22;24;22" dur={`${2 + i * 0.3}s`} repeatCount="indefinite" />
            </circle>
            <text x={nx} y={ny + 1} textAnchor="middle" fill="#CBD5E1" fontSize="8">{n.label}</text>
            <text x={nx} y={ny + 12} textAnchor="middle" fill={typeColor(n.type)} fontSize="7">{n.type}</text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r="40" fill="url(#glow)" />
      <circle cx={cx} cy={cy} r={pr} fill="#0F1D32" stroke={typeColor(centerType)} strokeWidth="3">
        <animate attributeName="stroke-opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </circle>
      <text x={cx} y={cy - 2} textAnchor="middle" fill="#F1F5F9" fontSize="9" fontWeight="bold">{centerLabel}</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={typeColor(centerType)} fontSize="8">{centerType}</text>
    </svg>
  );
};

// --- Main Component ---
export default function EntityInvestigation() {
  const [query, setQuery] = useState('');
  const [showAC, setShowAC] = useState(false);
  const [selected, setSelected] = useState<Entity>(ENTITIES[0]);
  const [tab, setTab] = useState<'timeline' | 'graph' | 'anomalies'>('timeline');
  const [expandedEv, setExpandedEv] = useState<Set<string>>(new Set());
  const [eventCount, setEventCount] = useState(0);
  const [visibleEvts, setVisibleEvts] = useState<Set<string>>(new Set());
  const timelineRef = useRef<HTMLDivElement>(null);

  const events = makeEvents(selected.id);
  const related = makeRelated(selected.id);

  const filtered = query.trim()
    ? ENTITIES.filter(e => e.name.toLowerCase().includes(query.toLowerCase()))
    : ENTITIES;

  // Real-time event counter
  useEffect(() => {
    setEventCount(0);
    const target = events.length + Math.floor(Math.random() * 40) + 20;
    let count = 0;
    const iv = setInterval(() => {
      count += Math.ceil(Math.random() * 3);
      if (count >= target) { count = target; clearInterval(iv); }
      setEventCount(count);
    }, 80);
    return () => clearInterval(iv);
  }, [selected.id]);

  // Staggered timeline reveal
  useEffect(() => {
    setVisibleEvts(new Set());
    events.forEach((ev, i) => {
      setTimeout(() => setVisibleEvts(prev => new Set(prev).add(ev.id)), 100 + i * 80);
    });
  }, [selected.id]);

  const selectEntity = useCallback((e: Entity) => {
    setSelected(e); setQuery(''); setShowAC(false);
    setExpandedEv(new Set()); setTab('timeline');
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedEv(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };

  const riskColor = selected.risk >= 80 ? '#EF4444' : selected.risk >= 50 ? '#F59E0B' : '#22C55E';

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 p-4 font-sans">
      {/* Search Bar */}
      <div className="relative max-w-2xl mx-auto mb-6">
        <div className="flex items-center bg-[#0F1D32] border border-slate-700 rounded-lg px-4 py-2.5 focus-within:border-blue-500 transition-colors">
          <Search size={18} className="text-slate-500 mr-3 flex-shrink-0" />
          <input
            className="bg-transparent flex-1 outline-none text-slate-200 placeholder-slate-500 text-sm"
            placeholder="Search entities: users, IPs, hostnames, file hashes..."
            value={query}
            onChange={e => { setQuery(e.target.value); setShowAC(true); }}
            onFocus={() => setShowAC(true)}
            onBlur={() => setTimeout(() => setShowAC(false), 200)}
          />
          {query && <button onClick={() => { setQuery(''); setShowAC(false); }}><X size={16} className="text-slate-500 hover:text-slate-300" /></button>}
        </div>
        {showAC && filtered.length > 0 && (
          <div className="absolute z-50 w-full mt-1 bg-[#0F1D32] border border-slate-700 rounded-lg shadow-2xl overflow-hidden">
            {filtered.map(e => (
              <button key={e.id} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#162340] text-left transition-colors"
                onMouseDown={() => selectEntity(e)}>
                <span style={{ color: typeColor(e.type) }}>{typeIcon(e.type)}</span>
                <span className="flex-1 text-sm text-slate-200">{e.name}</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ color: typeColor(e.type), background: typeColor(e.type) + '18' }}>{e.type}</span>
                <span className="text-xs font-mono" style={{ color: e.risk >= 80 ? '#EF4444' : e.risk >= 50 ? '#F59E0B' : '#22C55E' }}>
                  {e.risk}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Crosshair size={20} className="text-blue-400" />
            <h1 className="text-lg font-bold text-slate-100">Entity Investigation</h1>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <Activity size={14} className="text-emerald-400 animate-pulse" />
            <span className="text-emerald-400 font-mono">{eventCount}</span>
            <span className="text-slate-500">events tracked</span>
          </div>
        </div>

        {/* Entity Profile Card */}
        <div className="bg-[#0F1D32] border border-slate-700/50 rounded-xl p-5 mb-5">
          <div className="flex flex-wrap items-start gap-6">
            <RiskGauge risk={selected.risk} color={riskColor} />
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-3 mb-2">
                <span style={{ color: typeColor(selected.type) }}>{typeIcon(selected.type)}</span>
                <h2 className="text-xl font-bold text-white">{selected.name}</h2>
                <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded font-medium"
                  style={{ color: classColor(selected.classification), background: classColor(selected.classification) + '20', border: `1px solid ${classColor(selected.classification)}40` }}>
                  {selected.classification}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 text-xs">
                <div><span className="text-slate-500 block">Type</span><span className="text-slate-300 capitalize">{selected.type}</span></div>
                <div><span className="text-slate-500 block">First Seen</span><span className="text-slate-300">{selected.firstSeen}</span></div>
                <div><span className="text-slate-500 block">Last Seen</span><span className="text-slate-300">{selected.lastSeen}</span></div>
                <div><span className="text-slate-500 block">Related Entities</span><span className="text-blue-400 font-medium">{selected.relatedCount}</span></div>
              </div>
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2 mt-4">
                {[
                  { label: 'Isolate', icon: Shield, color: '#EF4444' },
                  { label: 'Block', icon: Ban, color: '#F97316' },
                  { label: 'Watchlist', icon: Eye, color: '#3B82F6' },
                  { label: 'Escalate', icon: Zap, color: '#A855F7' },
                ].map(a => (
                  <button key={a.label} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:scale-105 active:scale-95"
                    style={{ color: a.color, background: a.color + '15', border: `1px solid ${a.color}30` }}>
                    <a.icon size={13} />{a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 bg-[#0F1D32] rounded-lg p-1 w-fit">
          {(['timeline', 'graph', 'anomalies'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-md text-xs font-medium transition-all capitalize ${tab === t ? 'bg-blue-600/20 text-blue-400 shadow-lg shadow-blue-500/10' : 'text-slate-400 hover:text-slate-200'}`}>
              {t === 'timeline' && <Clock size={13} className="inline mr-1.5 -mt-0.5" />}
              {t === 'graph' && <Network size={13} className="inline mr-1.5 -mt-0.5" />}
              {t === 'anomalies' && <AlertTriangle size={13} className="inline mr-1.5 -mt-0.5" />}
              {t}
            </button>
          ))}
        </div>

        {/* Tab Content with crossfade */}
        <div className="relative">
          {/* Timeline */}
          <div className={`transition-all duration-300 ${tab === 'timeline' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}>
            <div ref={timelineRef} className="space-y-0">
              {events.map((ev) => {
                const visible = visibleEvts.has(ev.id);
                const expanded = expandedEv.has(ev.id);
                return (
                  <div key={ev.id}
                    className="flex gap-4 transition-all duration-500"
                    style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateX(0)' : 'translateX(-30px)' }}>
                    {/* Vertical line + icon */}
                    <div className="flex flex-col items-center w-8 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center border-2"
                        style={{ borderColor: typeColor(ev.type), background: typeColor(ev.type) + '15' }}>
                        <span style={{ color: typeColor(ev.type) }}>{typeIcon(ev.type)}</span>
                      </div>
                      <div className="w-px flex-1 min-h-[20px]" style={{ background: `linear-gradient(to bottom, ${typeColor(ev.type)}40, transparent)` }} />
                    </div>
                    {/* Content */}
                    <div className="flex-1 pb-4">
                      <button className="w-full text-left bg-[#0F1D32] border border-slate-700/40 rounded-lg p-3 hover:border-slate-600 transition-colors"
                        onClick={() => toggleExpand(ev.id)}>
                        <div className="flex items-center gap-2 flex-wrap">
                          {expanded ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                          <span className="text-sm font-medium text-slate-200">{ev.title}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase tracking-wider"
                            style={{ color: sevColor(ev.severity), background: sevColor(ev.severity) + '18' }}>
                            {ev.severity}
                          </span>
                          <span className="ml-auto text-[11px] text-slate-500 font-mono">{ev.time}</span>
                        </div>
                        {expanded && (
                          <div className="mt-2 pt-2 border-t border-slate-700/30 text-xs text-slate-400 leading-relaxed">
                            {ev.detail}
                          </div>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Graph */}
          <div className={`transition-all duration-300 ${tab === 'graph' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}>
            <div className="bg-[#0F1D32] border border-slate-700/50 rounded-xl p-4" style={{ height: 420 }}>
              <RelGraph nodes={related} centerLabel={selected.name} centerType={selected.type} />
            </div>
          </div>

          {/* Anomalies */}
          <div className={`transition-all duration-300 ${tab === 'anomalies' ? 'opacity-100' : 'opacity-0 absolute inset-0 pointer-events-none'}`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {ANOMALIES.map(a => (
                <div key={a.id} className="bg-[#0F1D32] border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center"
                      style={{ background: a.score >= 80 ? '#EF444418' : '#F59E0B18' }}>
                      <a.icon size={18} style={{ color: a.score >= 80 ? '#EF4444' : '#F59E0B' }} />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-slate-200">{a.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{a.desc}</p>
                    </div>
                    <span className="text-lg font-bold font-mono" style={{ color: a.score >= 80 ? '#EF4444' : '#F59E0B' }}>
                      {a.score}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <AnomalyBar score={a.score} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const AnomalyBar: React.FC<{ score: number }> = ({ score }) => {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setWidth(score), 100);
    return () => clearTimeout(t);
  }, [score]);
  const color = score >= 80 ? '#EF4444' : score >= 50 ? '#F59E0B' : '#22C55E';
  return (
    <div className="h-full rounded-full transition-all duration-1000 ease-out"
      style={{ width: `${width}%`, background: `linear-gradient(90deg, ${color}80, ${color})` }} />
  );
};
