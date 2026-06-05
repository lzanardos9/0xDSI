import { useState, useEffect } from 'react';
import {
  Shield, ShieldAlert, ShieldCheck, AlertTriangle, Ban,
  TrendingUp, TrendingDown, Activity, Clock, Zap, Eye,
  Lock, Unlock, FileWarning, Brain, Users, ChevronDown, ChevronUp, User
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { GuardrailPolicy, ScanResult, GuardrailIncident } from '../../lib/guardrailsData';
import { VERDICT_CONFIG, POLICY_TYPE_CONFIG } from '../../lib/guardrailsData';

const GuardrailsDashboard = () => {
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [scans, setScans] = useState<ScanResult[]>([]);
  const [incidents, setIncidents] = useState<GuardrailIncident[]>([]);
  const [liveBlockCount, setLiveBlockCount] = useState(0);
  const [liveWarnCount, setLiveWarnCount] = useState(0);
  const [livePassCount, setLivePassCount] = useState(0);
  const [liveScanRate, setLiveScanRate] = useState(47);
  const [pulseActive, setPulseActive] = useState(false);
  const [userRiskData, setUserRiskData] = useState<any[]>([]);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [userScans, setUserScans] = useState<ScanResult[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveScanRate(prev => Math.max(20, prev + (Math.random() > 0.5 ? Math.floor(Math.random() * 8) : -Math.floor(Math.random() * 5))));
      if (Math.random() > 0.7) {
        setLiveBlockCount(prev => prev + 1);
        setPulseActive(true);
        setTimeout(() => setPulseActive(false), 1000);
      }
      if (Math.random() > 0.5) setLiveWarnCount(prev => prev + 1);
      setLivePassCount(prev => prev + Math.floor(Math.random() * 3) + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    const [policiesRes, scansRes, incidentsRes] = await Promise.all([
      supabase.from('guardrail_policies').select('*').order('priority'),
      supabase.from('guardrail_scan_results').select('*').order('scanned_at', { ascending: false }).limit(50),
      supabase.from('guardrail_incidents').select('*').order('created_at', { ascending: false }).limit(20),
    ]);
    if (policiesRes.data) setPolicies(policiesRes.data);
    if (scansRes.data) setScans(scansRes.data);
    if (incidentsRes.data) setIncidents(incidentsRes.data);

    const blocks = scansRes.data?.filter(s => s.verdict === 'block').length || 0;
    const warns = scansRes.data?.filter(s => s.verdict === 'warn').length || 0;
    const passes = scansRes.data?.filter(s => s.verdict === 'pass').length || 0;
    setLiveBlockCount(blocks);
    setLiveWarnCount(warns);
    setLivePassCount(passes);

    // Build per-user risk aggregation from scan results
    if (scansRes.data) {
      const userMap = new Map<string, { email: string; scans: number; blocks: number; warns: number; redacts: number; maxRisk: number; totalRisk: number; models: Set<string>; lastScan: string }>();
      scansRes.data.forEach((s: ScanResult) => {
        const existing = userMap.get(s.user_email) || { email: s.user_email, scans: 0, blocks: 0, warns: 0, redacts: 0, maxRisk: 0, totalRisk: 0, models: new Set<string>(), lastScan: '' };
        existing.scans++;
        if (s.verdict === 'block') existing.blocks++;
        if (s.verdict === 'warn') existing.warns++;
        if (s.verdict === 'redact') existing.redacts++;
        existing.maxRisk = Math.max(existing.maxRisk, s.risk_score);
        existing.totalRisk += s.risk_score;
        existing.models.add(s.model_name);
        if (!existing.lastScan || s.scanned_at > existing.lastScan) existing.lastScan = s.scanned_at;
        userMap.set(s.user_email, existing);
      });
      const userData = Array.from(userMap.values())
        .map(u => ({ ...u, avgRisk: Math.round(u.totalRisk / u.scans), models: Array.from(u.models) }))
        .sort((a, b) => b.blocks - a.blocks || b.maxRisk - a.maxRisk);
      setUserRiskData(userData);
    }
  };

  const loadUserScans = async (email: string) => {
    const { data } = await supabase
      .from('guardrail_scan_results')
      .select('*')
      .eq('user_email', email)
      .order('scanned_at', { ascending: false })
      .limit(20);
    if (data) setUserScans(data);
  };

  const handleExpandUser = (email: string) => {
    if (expandedUser === email) {
      setExpandedUser(null);
      setUserScans([]);
    } else {
      setExpandedUser(email);
      loadUserScans(email);
    }
  };

  const totalHits = policies.reduce((sum, p) => sum + (p.hit_count || 0), 0);
  const totalBlocks = policies.reduce((sum, p) => sum + (p.block_count || 0), 0);
  const totalWarns = policies.reduce((sum, p) => sum + (p.warn_count || 0), 0);
  const activePolicies = policies.filter(p => p.enabled).length;
  const avgLatency = scans.length > 0 ? Math.round(scans.reduce((s, r) => s + (r.latency_ms || 0), 0) / scans.length) : 0;
  const blockRate = totalHits > 0 ? ((totalBlocks / totalHits) * 100).toFixed(1) : '0';
  const openIncidents = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length;
  const criticalIncidents = incidents.filter(i => i.severity === 'critical' && i.status !== 'resolved').length;

  const topPolicies = [...policies].sort((a, b) => b.hit_count - a.hit_count).slice(0, 6);

  const recentScans = scans.slice(0, 12);

  const policyTypeDistribution = Object.entries(
    policies.reduce<Record<string, number>>((acc, p) => {
      acc[p.policy_type] = (acc[p.policy_type] || 0) + p.hit_count;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1]);

  const maxPolicyHits = policyTypeDistribution.length > 0 ? policyTypeDistribution[0][1] : 1;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`relative overflow-hidden rounded-xl border p-5 transition-all duration-500 ${
          pulseActive ? 'border-red-500/50 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/30'
        }`}>
          <div className={`absolute inset-0 bg-red-500/10 transition-opacity duration-1000 ${pulseActive ? 'opacity-100' : 'opacity-0'}`} />
          <div className="relative">
            <div className="flex items-center justify-between mb-3">
              <div className="p-2.5 bg-red-500/15 rounded-lg">
                <Ban className="w-5 h-5 text-red-400" />
              </div>
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${pulseActive ? 'bg-red-400 animate-ping' : 'bg-red-400 animate-pulse'}`} />
                <span className="text-red-400 text-[10px] font-bold tracking-wider">LIVE</span>
              </div>
            </div>
            <p className="text-slate-500 text-xs font-medium mb-1">Threats Blocked</p>
            <p className="text-2xl font-bold text-white tabular-nums">{totalBlocks.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-1.5">
              <TrendingUp className="w-3 h-3 text-red-400" />
              <span className="text-red-400 text-xs">+{liveBlockCount} this session</span>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-amber-500/15 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-400" />
            </div>
            <span className="text-amber-400 text-[10px] font-bold tracking-wider flex items-center gap-1.5">
              <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" /> LIVE
            </span>
          </div>
          <p className="text-slate-500 text-xs font-medium mb-1">Warnings Issued</p>
          <p className="text-2xl font-bold text-white tabular-nums">{totalWarns.toLocaleString()}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <TrendingUp className="w-3 h-3 text-amber-400" />
            <span className="text-amber-400 text-xs">+{liveWarnCount} this session</span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="p-2.5 bg-emerald-500/15 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
            </div>
            <span className="text-xs font-semibold text-emerald-400">{activePolicies} active</span>
          </div>
          <p className="text-slate-500 text-xs font-medium mb-1">Scan Throughput</p>
          <p className="text-2xl font-bold text-white tabular-nums">{liveScanRate}<span className="text-sm text-slate-500 font-normal">/min</span></p>
          <div className="flex items-center gap-1 mt-1.5">
            <Clock className="w-3 h-3 text-emerald-400" />
            <span className="text-emerald-400 text-xs">Avg {avgLatency}ms latency</span>
          </div>
        </div>

        <div className={`rounded-xl border p-5 ${
          criticalIncidents > 0 ? 'border-red-500/40 bg-red-500/5' : 'border-slate-700/50 bg-slate-800/30'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <div className={`p-2.5 rounded-lg ${criticalIncidents > 0 ? 'bg-red-500/15' : 'bg-blue-500/15'}`}>
              <ShieldAlert className={`w-5 h-5 ${criticalIncidents > 0 ? 'text-red-400' : 'text-blue-400'}`} />
            </div>
            {criticalIncidents > 0 && (
              <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/30 rounded text-red-400 text-[10px] font-bold">
                {criticalIncidents} CRITICAL
              </span>
            )}
          </div>
          <p className="text-slate-500 text-xs font-medium mb-1">Open Incidents</p>
          <p className="text-2xl font-bold text-white tabular-nums">{openIncidents}</p>
          <div className="flex items-center gap-1 mt-1.5">
            <Activity className="w-3 h-3 text-blue-400" />
            <span className="text-blue-400 text-xs">{blockRate}% block rate</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">Live Scan Feed</h3>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-[10px] text-slate-500 font-medium">Real-time</span>
            </div>
          </div>
          <div className="divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto custom-scrollbar">
            {recentScans.map((scan) => {
              const vc = VERDICT_CONFIG[scan.verdict] || VERDICT_CONFIG.pass;
              return (
                <div key={scan.id} className="px-5 py-3 hover:bg-slate-800/40 transition-colors group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${vc.bgColor} ${vc.color} border ${vc.borderColor}`}>
                          {vc.label.toUpperCase()}
                        </span>
                        <span className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-400 font-medium">
                          {scan.scan_type}
                        </span>
                        <span className="text-[10px] text-slate-600">
                          {scan.model_name}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 truncate group-hover:whitespace-normal group-hover:text-slate-200 transition-all">
                        {scan.input_text || scan.output_text}
                      </p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-slate-500">{scan.user_email}</span>
                        <span className="text-[10px] text-slate-600">{scan.application}</span>
                        {scan.latency_ms > 0 && (
                          <span className="text-[10px] text-slate-600">{scan.latency_ms}ms</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <div className="flex items-center gap-1">
                        <div className={`w-8 h-1.5 rounded-full ${
                          scan.risk_score >= 80 ? 'bg-red-500' :
                          scan.risk_score >= 50 ? 'bg-amber-500' :
                          scan.risk_score >= 20 ? 'bg-blue-500' : 'bg-emerald-500'
                        }`} style={{ width: `${Math.max(12, scan.risk_score * 0.4)}px` }} />
                        <span className={`text-[10px] font-mono font-bold ${
                          scan.risk_score >= 80 ? 'text-red-400' :
                          scan.risk_score >= 50 ? 'text-amber-400' :
                          scan.risk_score >= 20 ? 'text-blue-400' : 'text-emerald-400'
                        }`}>{scan.risk_score}</span>
                      </div>
                      <span className="text-[10px] text-slate-600">
                        {new Date(scan.scanned_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/40 flex items-center gap-2.5">
              <Brain className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">Policy Hit Distribution</h3>
            </div>
            <div className="p-5 space-y-3">
              {policyTypeDistribution.map(([type, hits]) => {
                const config = POLICY_TYPE_CONFIG[type] || { label: type, color: 'text-slate-400', bgColor: 'bg-slate-500/10' };
                const pct = (hits / maxPolicyHits) * 100;
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{hits.toLocaleString()}</span>
                    </div>
                    <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${config.bgColor.replace('/10', '/60')}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-700/40 flex items-center gap-2.5">
              <Shield className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-200">Top Triggered Policies</h3>
            </div>
            <div className="divide-y divide-slate-800/60">
              {topPolicies.map((policy) => {
                const config = POLICY_TYPE_CONFIG[policy.policy_type];
                return (
                  <div key={policy.id} className="px-5 py-3 hover:bg-slate-800/40 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-slate-300 truncate">{policy.policy_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[10px] ${config?.color || 'text-slate-400'}`}>{config?.label || policy.policy_type}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            policy.enforcement_level === 'block' ? 'bg-red-500/10 text-red-400' :
                            policy.enforcement_level === 'warn' ? 'bg-amber-500/10 text-amber-400' :
                            'bg-slate-500/10 text-slate-400'
                          }`}>{policy.enforcement_level}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-white tabular-nums">{policy.hit_count.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500">{policy.block_count.toLocaleString()} blocked</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FileWarning className="w-4 h-4 text-red-400" />
            <h3 className="text-sm font-semibold text-slate-200">Active Incidents</h3>
          </div>
          <span className="text-xs text-slate-500">{incidents.filter(i => i.status !== 'resolved' && i.status !== 'false_positive').length} unresolved</span>
        </div>
        <div className="divide-y divide-slate-800/60">
          {incidents.filter(i => i.status !== 'resolved' && i.status !== 'false_positive').slice(0, 5).map((incident) => (
            <div key={incident.id} className="px-5 py-4 hover:bg-slate-800/40 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                      incident.severity === 'critical' ? 'bg-red-500/15 text-red-400 border-red-500/30' :
                      incident.severity === 'high' ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' :
                      incident.severity === 'medium' ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' :
                      'bg-blue-500/15 text-blue-400 border-blue-500/30'
                    }`}>{incident.severity.toUpperCase()}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                      incident.status === 'open' ? 'bg-red-500/10 text-red-400' :
                      'bg-amber-500/10 text-amber-400'
                    }`}>{incident.status}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-200">{incident.title}</p>
                  <p className="text-xs text-slate-500 mt-1">{incident.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[10px] text-slate-500">{incident.user_email}</p>
                  <p className="text-[10px] text-slate-600 mt-0.5">
                    {new Date(incident.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {userRiskData.length > 0 && (
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-slate-200">Top Risk Users</h3>
              <span className="text-[10px] text-slate-500 bg-slate-700/50 px-2 py-0.5 rounded-full">{userRiskData.length} users</span>
            </div>
            <span className="text-[10px] text-slate-500">Click to drill down</span>
          </div>
          <div className="divide-y divide-slate-800/60">
            {userRiskData.slice(0, 10).map((user) => (
              <div key={user.email}>
                <div
                  className={`px-5 py-4 cursor-pointer transition-colors ${
                    expandedUser === user.email ? 'bg-slate-800/60' : 'hover:bg-slate-800/40'
                  }`}
                  onClick={() => handleExpandUser(user.email)}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        user.blocks > 2 ? 'bg-red-500/15 border border-red-500/30' :
                        user.blocks > 0 ? 'bg-amber-500/15 border border-amber-500/30' :
                        'bg-slate-700/50 border border-slate-600/30'
                      }`}>
                        <User className={`w-4 h-4 ${
                          user.blocks > 2 ? 'text-red-400' :
                          user.blocks > 0 ? 'text-amber-400' :
                          'text-slate-400'
                        }`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{user.email}</p>
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-[10px] text-slate-500">{user.scans} scans</span>
                          <span className="text-[10px] text-slate-600">{user.models.length} model{user.models.length !== 1 ? 's' : ''}</span>
                          <span className="text-[10px] text-slate-600">Last: {new Date(user.lastScan).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        {user.blocks > 0 && (
                          <span className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] font-bold text-red-400">
                            {user.blocks} blocked
                          </span>
                        )}
                        {user.warns > 0 && (
                          <span className="px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] font-bold text-amber-400">
                            {user.warns} warned
                          </span>
                        )}
                        {user.redacts > 0 && (
                          <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] font-bold text-cyan-400">
                            {user.redacts} redacted
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-2 rounded-full overflow-hidden bg-slate-700/50`}>
                          <div className={`h-full rounded-full ${
                            user.avgRisk >= 70 ? 'bg-red-500' :
                            user.avgRisk >= 45 ? 'bg-amber-500' :
                            'bg-emerald-500'
                          }`} style={{ width: `${user.avgRisk}%` }} />
                        </div>
                        <span className={`text-xs font-mono font-bold w-6 text-right ${
                          user.avgRisk >= 70 ? 'text-red-400' :
                          user.avgRisk >= 45 ? 'text-amber-400' :
                          'text-emerald-400'
                        }`}>{user.avgRisk}</span>
                      </div>
                      {expandedUser === user.email ? (
                        <ChevronUp className="w-4 h-4 text-slate-500" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                  </div>
                </div>
                {expandedUser === user.email && (
                  <div className="bg-slate-900/40 border-t border-slate-700/30">
                    <div className="px-5 py-3 border-b border-slate-800/50">
                      <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">Models:</span>
                          {user.models.map((model: string) => (
                            <span key={model} className="px-2 py-0.5 bg-slate-700/50 rounded text-[10px] text-slate-300 font-medium">
                              {model}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-500">Peak Risk:</span>
                          <span className={`text-[10px] font-bold ${
                            user.maxRisk >= 80 ? 'text-red-400' :
                            user.maxRisk >= 50 ? 'text-amber-400' :
                            'text-emerald-400'
                          }`}>{user.maxRisk}</span>
                        </div>
                      </div>
                    </div>
                    <div className="divide-y divide-slate-800/40 max-h-[320px] overflow-y-auto custom-scrollbar">
                      {userScans.length === 0 ? (
                        <div className="px-5 py-8 text-center">
                          <div className="w-5 h-5 border-2 border-slate-600 border-t-cyan-400 rounded-full animate-spin mx-auto" />
                          <p className="text-[10px] text-slate-500 mt-2">Loading scan history...</p>
                        </div>
                      ) : (
                        userScans.map((scan) => {
                          const vc = VERDICT_CONFIG[scan.verdict] || VERDICT_CONFIG.pass;
                          return (
                            <div key={scan.id} className="px-5 py-3 hover:bg-slate-800/30 transition-colors">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${vc.bgColor} ${vc.color} border ${vc.borderColor}`}>
                                      {vc.label.toUpperCase()}
                                    </span>
                                    <span className="text-[10px] text-slate-500 font-medium">{scan.model_name}</span>
                                    <span className="text-[10px] text-slate-600">{scan.application}</span>
                                  </div>
                                  <p className="text-xs text-slate-400 leading-relaxed">
                                    {scan.input_text || scan.output_text}
                                  </p>
                                  {scan.triggered_policies && scan.triggered_policies.length > 0 && (
                                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                                      <span className="text-[9px] text-slate-600">Policies:</span>
                                      {scan.triggered_policies.map((p: any, idx: number) => (
                                        <span key={idx} className="px-1.5 py-0.5 bg-slate-700/50 rounded text-[9px] text-slate-400">
                                          {p.policy_name || p}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[10px] font-mono font-bold ${
                                      scan.risk_score >= 80 ? 'text-red-400' :
                                      scan.risk_score >= 50 ? 'text-amber-400' :
                                      'text-emerald-400'
                                    }`}>{scan.risk_score}</span>
                                  </div>
                                  <span className="text-[9px] text-slate-600">
                                    {new Date(scan.scanned_at).toLocaleString()}
                                  </span>
                                  {scan.pii_found > 0 && (
                                    <span className="px-1.5 py-0.5 bg-cyan-500/10 rounded text-[9px] text-cyan-400">
                                      {scan.pii_found} PII
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GuardrailsDashboard;
