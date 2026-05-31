import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2, Globe, Users, Shield, AlertTriangle, Activity, Database,
  BarChart3, ChevronRight, ChevronDown, Check, X, Send, Layers,
  Settings, Search, Filter, TrendingUp, Clock, Zap, Eye,
} from 'lucide-react';

const TENANTS = [
  { id: 't1', name: 'Corporate HQ', color: '#3B82F6', alerts: 47, analysts: 12, health: 'green' as const, mttd: 4.2, mttr: 18, coverage: 94 },
  { id: 't2', name: 'LATAM Operations', color: '#F59E0B', alerts: 83, analysts: 6, health: 'yellow' as const, mttd: 8.1, mttr: 34, coverage: 72 },
  { id: 't3', name: 'EMEA SOC', color: '#10B981', alerts: 31, analysts: 9, health: 'green' as const, mttd: 3.8, mttr: 15, coverage: 97 },
  { id: 't4', name: 'APAC Branch', color: '#8B5CF6', alerts: 112, analysts: 4, health: 'red' as const, mttd: 12.5, mttr: 52, coverage: 58 },
  { id: 't5', name: 'Cloud Infrastructure', color: '#06B6D4', alerts: 29, analysts: 8, health: 'green' as const, mttd: 2.9, mttr: 11, coverage: 99 },
  { id: 't6', name: 'Financial Services', color: '#EC4899', alerts: 67, analysts: 7, health: 'yellow' as const, mttd: 6.3, mttr: 27, coverage: 85 },
];

const SEVERITY = ['Critical', 'High', 'Medium', 'Low'] as const;
const STATUSES = ['New', 'In Progress', 'Resolved'] as const;
const TABS = ['Overview', 'Alert Queue', 'Content Hub', 'Analytics', 'RBAC'] as const;
const TAB_ICONS = [Globe, AlertTriangle, Layers, BarChart3, Shield];

const ALERTS = TENANTS.flatMap((t, ti) =>
  Array.from({ length: 6 }, (_, i) => ({
    id: `${t.id}-a${i}`, tenant: t.id, tenantName: t.name, tenantColor: t.color,
    severity: SEVERITY[i % 4], status: STATUSES[i % 3],
    title: ['Brute Force Detected', 'Malware C2 Beacon', 'Privilege Escalation', 'Data Exfil Attempt', 'Lateral Movement', 'Credential Stuffing'][i],
    time: `${(ti * 3 + i) % 24}h ago`,
  }))
);

const PACKAGES = [
  { id: 'p1', name: 'Advanced Correlation Rules v3.2', type: 'Correlation Rules', items: 48 },
  { id: 'p2', name: 'Incident Response Playbook', type: 'Playbooks', items: 12 },
  { id: 'p3', name: 'Threat Hunting Dashboards', type: 'Dashboards', items: 8 },
  { id: 'p4', name: 'Compliance Detection Pack', type: 'Correlation Rules', items: 35 },
  { id: 'p5', name: 'Cloud Security Playbook', type: 'Playbooks', items: 15 },
];

const RBAC_USERS = [
  { name: 'Sarah Chen', role: 'Admin' }, { name: 'James Rodriguez', role: 'Analyst' },
  { name: 'Aisha Patel', role: 'Manager' }, { name: 'Marcus Webb', role: 'Viewer' },
  { name: 'Yuki Tanaka', role: 'Analyst' }, { name: 'Elena Volkov', role: 'Admin' },
];
const RBAC_MATRIX = [
  [1,1,1,1,1,1],[1,0,1,0,0,1],[1,1,1,1,0,1],[0,0,0,0,1,1],[0,1,0,1,1,0],[1,1,1,1,1,1],
];

const healthBorder = (h: string) => h === 'green' ? 'border-emerald-500' : h === 'yellow' ? 'border-yellow-500' : 'border-red-500';
const sevColor = (s: string) => s === 'Critical' ? 'bg-red-500/20 text-red-400' : s === 'High' ? 'bg-orange-500/20 text-orange-400' : s === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-blue-500/20 text-blue-400';
const roleBadge = (r: string) => r === 'Admin' ? 'bg-red-500/20 text-red-400' : r === 'Manager' ? 'bg-purple-500/20 text-purple-400' : r === 'Analyst' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-500/20 text-slate-400';

export default function MultiTenantManager() {
  const [tab, setTab] = useState<typeof TABS[number]>('Overview');
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [activeTenant, setActiveTenant] = useState<string>('all');
  const [globalView, setGlobalView] = useState(true);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [eventVolumes, setEventVolumes] = useState<Record<string, number>>(() =>
    Object.fromEntries(TENANTS.map(t => [t.id, Math.floor(Math.random() * 500000) + 100000]))
  );
  const [ingestionRates] = useState<Record<string, number>>(() =>
    Object.fromEntries(TENANTS.map(t => [t.id, Math.floor(Math.random() * 5000) + 500]))
  );
  const [alertFilter, setAlertFilter] = useState({ tenant: 'all', severity: 'all' });
  const [contentChecks, setContentChecks] = useState<Record<string, Set<string>>>(() =>
    Object.fromEntries(PACKAGES.map(p => [p.id, new Set<string>()]))
  );
  const [deployProgress, setDeployProgress] = useState<Record<string, Record<string, number>>>({});
  const [deploying, setDeploying] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [searchQ, setSearchQ] = useState('');

  useEffect(() => {
    const iv = setInterval(() => {
      setEventVolumes(prev => {
        const next = { ...prev };
        TENANTS.forEach(t => { next[t.id] = prev[t.id] + Math.floor(Math.random() * 50) + 5; });
        return next;
      });
    }, 800);
    return () => clearInterval(iv);
  }, []);

  const switchTenant = useCallback((id: string) => {
    setTransitioning(true);
    setSwitcherOpen(false);
    setTimeout(() => {
      setActiveTenant(id);
      setGlobalView(id === 'all');
      setTransitioning(false);
    }, 400);
  }, []);

  const toggleCheck = (pkgId: string, tenantId: string) => {
    setContentChecks(prev => {
      const s = new Set(prev[pkgId]);
      s.has(tenantId) ? s.delete(tenantId) : s.add(tenantId);
      return { ...prev, [pkgId]: s };
    });
  };

  const deploy = (pkgId: string) => {
    const targets = Array.from(contentChecks[pkgId]);
    if (!targets.length) return;
    setDeploying(pkgId);
    const prog: Record<string, number> = {};
    targets.forEach(t => { prog[t] = 0; });
    setDeployProgress(prev => ({ ...prev, [pkgId]: prog }));
    targets.forEach(t => {
      const speed = 300 + Math.random() * 700;
      const iv = setInterval(() => {
        setDeployProgress(prev => {
          const cur = prev[pkgId]?.[t] ?? 0;
          if (cur >= 100) { clearInterval(iv); return prev; }
          return { ...prev, [pkgId]: { ...prev[pkgId], [t]: Math.min(100, cur + Math.floor(Math.random() * 15) + 5) } };
        });
      }, speed);
    });
    setTimeout(() => setDeploying(null), 8000);
  };

  const visibleTenants = activeTenant === 'all' ? TENANTS : TENANTS.filter(t => t.id === activeTenant);
  const filteredAlerts = ALERTS.filter(a =>
    (alertFilter.tenant === 'all' || a.tenant === alertFilter.tenant) &&
    (alertFilter.severity === 'all' || a.severity === alertFilter.severity) &&
    (activeTenant === 'all' || a.tenant === activeTenant) &&
    (!searchQ || a.title.toLowerCase().includes(searchQ.toLowerCase()))
  );

  const maxVol = Math.max(...TENANTS.map(t => eventVolumes[t.id]));
  const maxAlert = Math.max(...TENANTS.map(t => t.alerts));
  const maxMttd = Math.max(...TENANTS.map(t => t.mttd));

  return (
    <div className="min-h-screen bg-[#0A1628] text-slate-200 font-sans">
      {transitioning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A1628]/80 backdrop-blur-sm">
          <div className="relative"><span className="absolute inline-flex h-16 w-16 rounded-full bg-cyan-400 opacity-75 animate-ping" /><span className="relative inline-flex h-16 w-16 rounded-full bg-cyan-500 items-center justify-center"><Globe className="w-8 h-8 text-white" /></span></div>
        </div>
      )}

      <header className="border-b border-slate-700/50 bg-[#0D1B2A]/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Shield className="w-6 h-6 text-cyan-400" />
            <h1 className="text-lg font-bold tracking-tight">Multi-Tenant SOC Manager</h1>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => switchTenant(globalView ? TENANTS[0].id : 'all')}
              className="px-3 py-1.5 text-xs rounded-lg border border-slate-600 hover:border-cyan-500 transition-all flex items-center gap-2">
              <Eye className="w-3.5 h-3.5" />{globalView ? 'Global View' : 'Tenant View'}
            </button>
            <div className="relative">
              <button onClick={() => setSwitcherOpen(!switcherOpen)}
                className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-600 hover:border-cyan-500 transition-all flex items-center gap-2 min-w-[180px]">
                <Building2 className="w-3.5 h-3.5 text-cyan-400" />
                {activeTenant === 'all' ? 'All Tenants' : TENANTS.find(t => t.id === activeTenant)?.name}
                <ChevronDown className="w-3.5 h-3.5 ml-auto" />
              </button>
              {switcherOpen && (
                <div className="absolute top-full right-0 mt-1 bg-[#0D1B2A] border border-slate-700 rounded-lg shadow-xl w-56 py-1 z-50">
                  <button onClick={() => switchTenant('all')} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-cyan-400" />All Tenants
                  </button>
                  {TENANTS.map(t => (
                    <button key={t.id} onClick={() => switchTenant(t.id)} className="w-full px-3 py-2 text-left text-xs hover:bg-slate-800 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto px-6 flex gap-1">
          {TABS.map((t, i) => {
            const Icon = TAB_ICONS[i];
            return (
              <button key={t} onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-xs font-medium flex items-center gap-2 border-b-2 transition-all ${tab === t ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
                <Icon className="w-3.5 h-3.5" />{t}
              </button>
            );
          })}
        </div>
      </header>

      <main className={`max-w-[1400px] mx-auto p-6 transition-opacity duration-300 ${transitioning ? 'opacity-0' : 'opacity-100'}`}>
        {tab === 'Overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {visibleTenants.map(t => (
                <div key={t.id} className="group" style={{ perspective: '1000px' }}
                  onMouseEnter={() => setHoveredCard(t.id)} onMouseLeave={() => setHoveredCard(null)}>
                  <div className={`relative w-full transition-transform duration-500 ${hoveredCard === t.id ? '[transform:rotateY(180deg)]' : ''}`}
                    style={{ transformStyle: 'preserve-3d' }}>
                    {/* Front */}
                    <div className={`rounded-xl border-2 ${healthBorder(t.health)} bg-[#0D1B2A] p-5`}
                      style={{ backfaceVisibility: 'hidden' }}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <span className="w-3 h-3 rounded-full" style={{ background: t.color }} />
                          <h3 className="font-semibold text-sm">{t.name}</h3>
                        </div>
                        <span className={`w-2 h-2 rounded-full ${t.health === 'green' ? 'bg-emerald-400' : t.health === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'} animate-pulse`} />
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div className="bg-slate-800/50 rounded-lg p-2.5">
                          <div className="text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />Alerts</div>
                          <div className="text-lg font-bold mt-1" style={{ color: t.color }}>{t.alerts}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2.5">
                          <div className="text-slate-400 flex items-center gap-1"><Activity className="w-3 h-3" />Events</div>
                          <div className="text-lg font-bold mt-1 tabular-nums" style={{ color: t.color }}>{eventVolumes[t.id]?.toLocaleString()}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2.5">
                          <div className="text-slate-400 flex items-center gap-1"><Database className="w-3 h-3" />EPS</div>
                          <div className="text-lg font-bold mt-1">{ingestionRates[t.id]?.toLocaleString()}</div>
                        </div>
                        <div className="bg-slate-800/50 rounded-lg p-2.5">
                          <div className="text-slate-400 flex items-center gap-1"><Users className="w-3 h-3" />Analysts</div>
                          <div className="text-lg font-bold mt-1">{t.analysts}</div>
                        </div>
                      </div>
                    </div>
                    {/* Back */}
                    <div className={`absolute inset-0 rounded-xl border-2 ${healthBorder(t.health)} bg-[#0D1B2A] p-5 [transform:rotateY(180deg)]`}
                      style={{ backfaceVisibility: 'hidden' }}>
                      <h3 className="font-semibold text-sm mb-4 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" style={{ color: t.color }} />Performance Metrics
                      </h3>
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between"><span className="text-slate-400">MTTD</span><span className="font-bold">{t.mttd} min</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">MTTR</span><span className="font-bold">{t.mttr} min</span></div>
                        <div>
                          <div className="flex justify-between mb-1"><span className="text-slate-400">Coverage Score</span><span className="font-bold">{t.coverage}%</span></div>
                          <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${t.coverage}%`, background: t.color }} />
                          </div>
                        </div>
                        <div className="flex justify-between"><span className="text-slate-400">Health</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${t.health === 'green' ? 'bg-emerald-500/20 text-emerald-400' : t.health === 'yellow' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                            {t.health.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><Zap className="w-3.5 h-3.5 text-cyan-400" />Total Events</div>
                <div className="text-2xl font-bold tabular-nums">{Object.values(eventVolumes).reduce((a, b) => a + b, 0).toLocaleString()}</div>
              </div>
              <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><AlertTriangle className="w-3.5 h-3.5 text-red-400" />Total Alerts</div>
                <div className="text-2xl font-bold">{TENANTS.reduce((a, t) => a + t.alerts, 0)}</div>
              </div>
              <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-slate-400 mb-1"><Users className="w-3.5 h-3.5 text-purple-400" />Total Analysts</div>
                <div className="text-2xl font-bold">{TENANTS.reduce((a, t) => a + t.analysts, 0)}</div>
              </div>
            </div>
          </div>
        )}

        {tab === 'Alert Queue' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search alerts..."
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:border-cyan-500" />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-slate-400" />
                <select value={alertFilter.tenant} onChange={e => setAlertFilter(p => ({ ...p, tenant: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-500">
                  <option value="all">All Tenants</option>
                  {TENANTS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select value={alertFilter.severity} onChange={e => setAlertFilter(p => ({ ...p, severity: e.target.value }))}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-cyan-500">
                  <option value="all">All Severities</option>
                  {SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_120px_90px_90px_80px] gap-2 px-4 py-2.5 bg-slate-800/50 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <span>Alert</span><span>Tenant</span><span>Severity</span><span>Status</span><span>Time</span>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
                {filteredAlerts.map(a => (
                  <div key={a.id} className="grid grid-cols-[1fr_120px_90px_90px_80px] gap-2 px-4 py-2.5 border-t border-slate-800 hover:bg-slate-800/30 transition-colors items-center text-xs">
                    <span className="font-medium truncate">{a.title}</span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.tenantColor }} />
                      <span className="truncate text-[11px]">{a.tenantName.split(' ')[0]}</span>
                    </span>
                    <span><span className={`px-2 py-0.5 rounded text-[10px] font-medium ${sevColor(a.severity)}`}>{a.severity}</span></span>
                    <span className="text-slate-400">{a.status}</span>
                    <span className="text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="text-xs text-slate-500 text-right">{filteredAlerts.length} alerts</div>
          </div>
        )}

        {tab === 'Content Hub' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-5 h-5 text-cyan-400" />
              <h2 className="font-semibold">Content Distribution Hub</h2>
            </div>
            {PACKAGES.map(pkg => (
              <div key={pkg.id} className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold">{pkg.name}</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">{pkg.type} - {pkg.items} items</p>
                  </div>
                  <button onClick={() => deploy(pkg.id)} disabled={deploying === pkg.id || !contentChecks[pkg.id].size}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                    <Send className="w-3.5 h-3.5" />Deploy
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
                  {TENANTS.map(t => (
                    <div key={t.id} className="space-y-1.5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs group">
                        <button onClick={() => toggleCheck(pkg.id, t.id)}
                          className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${contentChecks[pkg.id].has(t.id) ? 'border-cyan-500 bg-cyan-500/20' : 'border-slate-600 hover:border-slate-400'}`}>
                          {contentChecks[pkg.id].has(t.id) && <Check className="w-3 h-3 text-cyan-400" />}
                        </button>
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                        <span className="truncate text-slate-300 group-hover:text-white transition-colors">{t.name.split(' ')[0]}</span>
                      </label>
                      {deployProgress[pkg.id]?.[t.id] !== undefined && (
                        <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${deployProgress[pkg.id][t.id]}%`, background: t.color }} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'Analytics' && (
          <div className="space-y-6">
            <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-5">
              <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-cyan-400" />Event Volume by Tenant</h3>
              <div className="space-y-3">
                {TENANTS.map(t => (
                  <div key={t.id} className="flex items-center gap-3 text-xs">
                    <span className="w-28 truncate text-slate-400">{t.name.split(' ')[0]}</span>
                    <div className="flex-1 h-6 bg-slate-800 rounded overflow-hidden relative">
                      <div className="h-full rounded transition-all duration-700 flex items-center px-2"
                        style={{ width: `${(eventVolumes[t.id] / maxVol) * 100}%`, background: `${t.color}33` }}>
                        <div className="h-full absolute left-0 top-0 rounded" style={{ width: '100%', background: `linear-gradient(90deg, ${t.color}66, ${t.color}22)` }} />
                      </div>
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono tabular-nums">{eventVolumes[t.id]?.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" />Alert Count</h3>
                <div className="flex items-end gap-3 h-40">
                  {TENANTS.map(t => (
                    <div key={t.id} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-bold">{t.alerts}</span>
                      <div className="w-full rounded-t transition-all duration-700 relative overflow-hidden"
                        style={{ height: `${(t.alerts / maxAlert) * 100}%`, background: `${t.color}44` }}>
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${t.color}88, ${t.color}22)` }} />
                      </div>
                      <span className="text-[9px] text-slate-500 truncate w-full text-center">{t.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl p-5">
                <h3 className="text-sm font-semibold mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-400" />MTTD Comparison (min)</h3>
                <div className="flex items-end gap-3 h-40">
                  {TENANTS.map(t => (
                    <div key={t.id} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-bold">{t.mttd}</span>
                      <div className="w-full rounded-t transition-all duration-700 relative overflow-hidden"
                        style={{ height: `${(t.mttd / maxMttd) * 100}%`, background: `${t.color}44` }}>
                        <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${t.color}88, ${t.color}22)` }} />
                      </div>
                      <span className="text-[9px] text-slate-500 truncate w-full text-center">{t.name.split(' ')[0]}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'RBAC' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-cyan-400" />
              <h2 className="font-semibold">Role-Based Access Control Matrix</h2>
            </div>
            <div className="bg-[#0D1B2A] border border-slate-700/50 rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-800/50">
                    <th className="text-left px-4 py-3 font-semibold text-slate-400">User</th>
                    <th className="text-left px-4 py-3 font-semibold text-slate-400">Role</th>
                    {TENANTS.map(t => (
                      <th key={t.id} className="px-3 py-3 text-center">
                        <div className="flex flex-col items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: t.color }} />
                          <span className="text-[10px] text-slate-400 font-medium">{t.name.split(' ')[0]}</span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {RBAC_USERS.map((u, ui) => (
                    <tr key={u.name} className="border-t border-slate-800 hover:bg-slate-800/20 transition-colors">
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <Users className="w-3.5 h-3.5 text-slate-500" />{u.name}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${roleBadge(u.role)}`}>{u.role}</span>
                      </td>
                      {TENANTS.map((t, ti) => (
                        <td key={t.id} className="px-3 py-3 text-center">
                          {RBAC_MATRIX[ui][ti] ? (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/10">
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-500/10">
                              <X className="w-3.5 h-3.5 text-red-400" />
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex gap-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1"><Check className="w-3 h-3 text-emerald-400" />Access granted</span>
              <span className="flex items-center gap-1"><X className="w-3 h-3 text-red-400" />No access</span>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}