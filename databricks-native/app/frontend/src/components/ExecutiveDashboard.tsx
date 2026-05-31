import { useState, useEffect, useMemo } from 'react';
import {
  ShieldCheck,
  Radar,
  Crosshair,
  Brain,
  Sparkles,
  Gauge,
  ScrollText,
  Timer,
  CircuitBoard,
  Banknote,
  Users,
  FlaskConical,
  Activity,
  ShieldAlert,
  GitBranch,
  Bot,
  Network,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  CheckCircle2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import CISOAssistant from './CISOAssistant';

type Counts = {
  totalAlerts: number;
  criticalAlerts: number;
  newAlerts: number;
  resolvedAlerts: number;
  totalCases: number;
  openCases: number;
  closedCases: number;
  mttrHours: number | null;
  ackPctOnTime: number | null;
  totalVulns: number;
  criticalVulns: number;
  patchedVulns: number;
  highRiskUsers: number;
  totalUsers: number;
  totalRules: number;
  enabledRules: number;
  totalFeeds: number;
  activeFeeds: number;
  totalIocs: number;
  activeIocs: number;
  responseActions: number;
  responseSuccess: number;
  attackChains: number;
  containedChains: number;
  verdictsP1: number;
  verdictsTotal: number;
  complianceTotal: number;
  complianceImplemented: number;
  frameworks: { code: string; name: string; pct: number }[];
  attackTimeline: { day: string; count: number }[];
  killChainBuckets: Record<string, number>;
  financialImpact: number;
};

const initialCounts: Counts = {
  totalAlerts: 0,
  criticalAlerts: 0,
  newAlerts: 0,
  resolvedAlerts: 0,
  totalCases: 0,
  openCases: 0,
  closedCases: 0,
  mttrHours: null,
  ackPctOnTime: null,
  totalVulns: 0,
  criticalVulns: 0,
  patchedVulns: 0,
  highRiskUsers: 0,
  totalUsers: 0,
  totalRules: 0,
  enabledRules: 0,
  totalFeeds: 0,
  activeFeeds: 0,
  totalIocs: 0,
  activeIocs: 0,
  responseActions: 0,
  responseSuccess: 0,
  attackChains: 0,
  containedChains: 0,
  verdictsP1: 0,
  verdictsTotal: 0,
  complianceTotal: 0,
  complianceImplemented: 0,
  frameworks: [],
  attackTimeline: [],
  killChainBuckets: {},
  financialImpact: 0,
};

const ExecutiveDashboard = () => {
  const [c, setC] = useState<Counts>(initialCounts);
  const [showAi, setShowAi] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [
          alertsAll,
          casesAll,
          vulnsAll,
          users,
          rules,
          feeds,
          iocs,
          actions,
          chains,
          verdicts,
          frameworks,
          controls,
        ] = await Promise.all([
          supabase.from('alerts').select('severity,status,created_at,resolved_at,false_positive'),
          supabase.from('cases').select('status,severity,priority,created_at,acknowledged_at,ack_due_at,resolved_at,closed_at,kill_chain_phase,financial_impact_usd'),
          supabase.from('asset_vulnerabilities').select('severity,status'),
          supabase.from('user_profiles').select('id,role'),
          supabase.from('correlation_rules').select('status,severity'),
          supabase.from('threat_feeds').select('enabled,total_indicators'),
          supabase.from('iocs').select('is_active'),
          supabase.from('response_actions').select('action_status'),
          supabase.from('confluence_attack_chains').select('containment_status,fused_score,kill_chain_stages'),
          supabase.from('confluence_verdicts').select('priority,status,fused_score,kill_chain_stage,created_at'),
          supabase.from('compliance_frameworks').select('id,framework_code,framework_name'),
          supabase.from('compliance_controls').select('framework_id,implementation_status'),
        ]);

        const a = alertsAll.data ?? [];
        const cs = casesAll.data ?? [];
        const vs = vulnsAll.data ?? [];
        const us = users.data ?? [];
        const rs = rules.data ?? [];
        const fs = feeds.data ?? [];
        const ios = iocs.data ?? [];
        const acts = actions.data ?? [];
        const ch = chains.data ?? [];
        const vd = verdicts.data ?? [];
        const fr = frameworks.data ?? [];
        const ctrl = controls.data ?? [];

        const closedCases = cs.filter((x: any) => x.resolved_at || x.closed_at);
        let mttrSum = 0;
        let mttrN = 0;
        for (const r of closedCases) {
          const start = r.created_at ? Date.parse(r.created_at) : NaN;
          const end = r.resolved_at ? Date.parse(r.resolved_at) : r.closed_at ? Date.parse(r.closed_at) : NaN;
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            mttrSum += (end - start) / 36e5;
            mttrN++;
          }
        }
        const mttr = mttrN ? mttrSum / mttrN : null;

        const ackEligible = cs.filter((x: any) => x.ack_due_at && x.acknowledged_at);
        const ackOnTime = ackEligible.filter((x: any) => Date.parse(x.acknowledged_at) <= Date.parse(x.ack_due_at)).length;
        const ackPct = ackEligible.length ? (ackOnTime / ackEligible.length) * 100 : null;

        const frameworkScores = fr.map((f: any) => {
          const own = ctrl.filter((x: any) => x.framework_id === f.id);
          const impl = own.filter((x: any) => x.implementation_status === 'implemented').length;
          return {
            code: f.framework_code,
            name: f.framework_name,
            pct: own.length ? Math.round((impl / own.length) * 100) : 0,
          };
        });

        const days: { day: string; count: number }[] = [];
        const now = Date.now();
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now - i * 86400000);
          const key = d.toISOString().slice(0, 10);
          const count = a.filter((x: any) => x.created_at?.slice(0, 10) === key).length;
          days.push({ day: key.slice(5), count });
        }

        const kcBuckets: Record<string, number> = {};
        for (const v of vd) {
          const k = (v as any).kill_chain_stage || 'unknown';
          kcBuckets[k] = (kcBuckets[k] ?? 0) + 1;
        }

        const finImpact = cs.reduce((s: number, x: any) => s + (Number(x.financial_impact_usd) || 0), 0);

        if (!mounted) return;
        setC({
          totalAlerts: a.length,
          criticalAlerts: a.filter((x: any) => x.severity === 'critical').length,
          newAlerts: a.filter((x: any) => x.status === 'new').length,
          resolvedAlerts: a.filter((x: any) => x.status === 'resolved' || x.resolved_at).length,
          totalCases: cs.length,
          openCases: cs.filter((x: any) => ['open', 'in_progress', 'investigating', 'containment'].includes(x.status)).length,
          closedCases: closedCases.length,
          mttrHours: mttr,
          ackPctOnTime: ackPct,
          totalVulns: vs.length,
          criticalVulns: vs.filter((x: any) => x.severity === 'critical' && x.status !== 'resolved' && x.status !== 'patched').length,
          patchedVulns: vs.filter((x: any) => x.status === 'patched' || x.status === 'resolved').length,
          highRiskUsers: us.filter((x: any) => x.role === 'admin' || x.role === 'analyst').length,
          totalUsers: us.length,
          totalRules: rs.length,
          enabledRules: rs.filter((x: any) => x.status === 'active' || x.status === 'enabled' || x.status === 'approved').length,
          totalFeeds: fs.length,
          activeFeeds: fs.filter((x: any) => x.enabled).length,
          totalIocs: ios.length,
          activeIocs: ios.filter((x: any) => x.is_active).length,
          responseActions: acts.length,
          responseSuccess: acts.filter((x: any) => x.action_status === 'success' || x.action_status === 'completed').length,
          attackChains: ch.length,
          containedChains: ch.filter((x: any) => x.containment_status === 'contained' || x.containment_status === 'remediated').length,
          verdictsP1: vd.filter((x: any) => x.priority === 'P1' || x.priority === 'critical').length,
          verdictsTotal: vd.length,
          complianceTotal: ctrl.length,
          complianceImplemented: ctrl.filter((x: any) => x.implementation_status === 'implemented').length,
          frameworks: frameworkScores,
          attackTimeline: days,
          killChainBuckets: kcBuckets,
          financialImpact: finImpact,
        });
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [refreshTick]);

  useEffect(() => {
    const ch = supabase
      .channel('exec-dashboard-stream')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alerts' }, () => setRefreshTick((t) => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cases' }, () => setRefreshTick((t) => t + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'confluence_attack_chains' }, () => setRefreshTick((t) => t + 1))
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const securityScore = useMemo(() => {
    if (!c.totalAlerts && !c.totalVulns && !c.totalCases) return 0;
    const alertWeight = c.totalAlerts ? 1 - c.criticalAlerts / Math.max(c.totalAlerts, 1) : 1;
    const vulnWeight = c.totalVulns ? 1 - c.criticalVulns / Math.max(c.totalVulns, 1) : 1;
    const caseWeight = c.totalCases ? c.closedCases / Math.max(c.totalCases, 1) : 1;
    const ruleWeight = c.totalRules ? c.enabledRules / Math.max(c.totalRules, 1) : 1;
    const compWeight = c.complianceTotal ? c.complianceImplemented / Math.max(c.complianceTotal, 1) : 1;
    return Math.round(((alertWeight * 0.2) + (vulnWeight * 0.25) + (caseWeight * 0.2) + (ruleWeight * 0.15) + (compWeight * 0.2)) * 100);
  }, [c]);

  const complianceScore = useMemo(() => {
    return c.complianceTotal ? Math.round((c.complianceImplemented / c.complianceTotal) * 1000) / 10 : 0;
  }, [c]);

  const automationCoverage = useMemo(() => {
    return c.responseActions ? Math.round((c.responseSuccess / c.responseActions) * 100) : 0;
  }, [c]);

  const detectionEfficacy = useMemo(() => {
    if (!c.totalRules) return 0;
    return Math.round((c.enabledRules / c.totalRules) * 100);
  }, [c]);

  const fmtMttr = c.mttrHours == null ? '—' : c.mttrHours < 1 ? `${Math.round(c.mttrHours * 60)}m` : `${c.mttrHours.toFixed(1)}h`;
  const fmtFin = c.financialImpact ? `$${(c.financialImpact / 1_000_000).toFixed(2)}M` : '$0';
  const maxTimeline = Math.max(1, ...c.attackTimeline.map((d) => d.count));

  return (
    <div className="space-y-6">
      {showAi && (
        <div className="enterprise-card overflow-hidden h-[600px]">
          <CISOAssistant />
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-slate-700/60 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-cyan-500/10 p-3 ring-1 ring-blue-500/30">
              <ShieldCheck className="h-8 w-8 text-blue-300" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-slate-50 tracking-tight">Executive Security Posture</h2>
              <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Live telemetry from {c.totalAlerts + c.totalCases + c.totalVulns} signals across {c.totalFeeds} feeds
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowAi((v) => !v)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ring-1 ${
              showAi
                ? 'bg-blue-500 text-white ring-blue-400'
                : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700 ring-slate-600/60'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">CISO Advisor</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ScoreRing
          label="Security Posture"
          value={securityScore}
          suffix="/100"
          icon={Gauge}
          gradient="from-blue-500 to-cyan-400"
          sub={`${c.enabledRules} active detections / ${c.totalRules}`}
        />
        <ScoreRing
          label="Compliance Coverage"
          value={complianceScore}
          suffix="%"
          icon={ScrollText}
          gradient="from-emerald-500 to-teal-400"
          sub={`${c.complianceImplemented}/${c.complianceTotal} controls implemented`}
        />
        <ScoreRing
          label="Automation Coverage"
          value={automationCoverage}
          suffix="%"
          icon={CircuitBoard}
          gradient="from-amber-500 to-orange-400"
          sub={`${c.responseSuccess}/${c.responseActions} actions executed`}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile
          icon={ShieldAlert}
          label="Critical Alerts"
          value={c.criticalAlerts}
          delta={c.totalAlerts ? Math.round((c.criticalAlerts / c.totalAlerts) * 100) : 0}
          deltaLabel="of all alerts"
          color="red"
          trendDown
        />
        <Tile
          icon={Timer}
          label="Mean Time to Resolve"
          value={fmtMttr}
          delta={c.ackPctOnTime != null ? Math.round(c.ackPctOnTime) : 0}
          deltaLabel="acks on SLA"
          color="amber"
          trendDown
        />
        <Tile
          icon={Crosshair}
          label="Critical Vulnerabilities"
          value={c.criticalVulns}
          delta={c.totalVulns ? Math.round((c.patchedVulns / c.totalVulns) * 100) : 0}
          deltaLabel="patched"
          color="orange"
          trendDown
        />
        <Tile
          icon={Banknote}
          label="Financial Exposure"
          value={fmtFin}
          delta={c.containedChains}
          deltaLabel="campaigns contained"
          color="emerald"
          trendDown
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Tile icon={Bot} label="Active Cases" value={c.openCases} delta={c.closedCases} deltaLabel="resolved" color="cyan" />
        <Tile icon={Network} label="Attack Campaigns" value={c.attackChains} delta={c.verdictsP1} deltaLabel="P1 verdicts" color="rose" />
        <Tile icon={Radar} label="Threat Feeds" value={c.activeFeeds} delta={c.totalIocs} deltaLabel="IOCs ingested" color="blue" />
        <Tile icon={Users} label="Identities Monitored" value={c.totalUsers} delta={c.highRiskUsers} deltaLabel="privileged" color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 enterprise-card p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-blue-400" />
              <h3 className="text-lg font-semibold text-slate-100">Alert Volume — last 14 days</h3>
            </div>
            <span className="text-xs text-slate-500">{c.totalAlerts} total events</span>
          </div>
          <div className="flex items-end gap-2 h-44">
            {c.attackTimeline.map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full rounded-t bg-gradient-to-t from-blue-600/80 to-cyan-400/80 group-hover:from-blue-500 group-hover:to-cyan-300 transition-all"
                  style={{ height: `${(d.count / maxTimeline) * 100}%`, minHeight: d.count ? '6px' : '2px' }}
                  title={`${d.day}: ${d.count} alerts`}
                />
                <span className="text-[10px] text-slate-500 tabular-nums">{d.day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="enterprise-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <Layers className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-100">Kill Chain Distribution</h3>
          </div>
          <div className="space-y-3">
            {Object.entries(c.killChainBuckets).slice(0, 7).map(([stage, n]) => {
              const max = Math.max(1, ...Object.values(c.killChainBuckets));
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-slate-300 capitalize">{stage.replaceAll('_', ' ')}</span>
                    <span className="text-xs font-semibold text-slate-100 tabular-nums">{n}</span>
                  </div>
                  <div className="w-full bg-slate-800/60 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-300 rounded-full"
                      style={{ width: `${(n / max) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(c.killChainBuckets).length === 0 && (
              <p className="text-xs text-slate-500">No verdicts emitted yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="enterprise-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <ScrollText className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-slate-100">Compliance Frameworks</h3>
          </div>
          <div className="space-y-3">
            {c.frameworks.map((f) => (
              <div key={f.code} className="rounded-lg border border-slate-700/60 bg-slate-800/30 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-medium text-slate-100">{f.code}</p>
                    <p className="text-[10px] text-slate-500">{f.name}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      f.pct >= 90 ? 'text-emerald-400' : f.pct >= 70 ? 'text-amber-400' : 'text-orange-400'
                    }`}
                  >
                    {f.pct}%
                  </span>
                </div>
                <div className="w-full bg-slate-900/60 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${
                      f.pct >= 90 ? 'from-emerald-500 to-teal-400' : f.pct >= 70 ? 'from-amber-500 to-orange-400' : 'from-orange-500 to-red-400'
                    }`}
                    style={{ width: `${f.pct}%` }}
                  />
                </div>
              </div>
            ))}
            {c.frameworks.length === 0 && <p className="text-xs text-slate-500">No frameworks configured.</p>}
          </div>
        </div>

        <div className="enterprise-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <Zap className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-semibold text-slate-100">SOC Performance</h3>
          </div>
          <div className="space-y-4">
            <Bar label="Detection Efficacy" pct={detectionEfficacy} hint={`${c.enabledRules}/${c.totalRules} rules active`} color="emerald" />
            <Bar label="Automation Coverage" pct={automationCoverage} hint={`${c.responseSuccess} successful actions`} color="blue" />
            <Bar label="SLA Acknowledge" pct={Math.round(c.ackPctOnTime ?? 0)} hint={c.ackPctOnTime == null ? 'no SLA data' : 'acks within window'} color="cyan" />
            <Bar label="Threat Feed Health" pct={c.totalFeeds ? Math.round((c.activeFeeds / c.totalFeeds) * 100) : 0} hint={`${c.activeFeeds}/${c.totalFeeds} sources online`} color="amber" />
            <Bar
              label="Containment Rate"
              pct={c.attackChains ? Math.round((c.containedChains / c.attackChains) * 100) : 0}
              hint={`${c.containedChains}/${c.attackChains} campaigns neutralized`}
              color="rose"
            />
          </div>
        </div>

        <div className="enterprise-card p-6">
          <div className="flex items-center gap-3 mb-5">
            <Brain className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg font-semibold text-slate-100">AI Defense Stack</h3>
          </div>
          <div className="space-y-3 text-sm">
            <Row icon={GitBranch} label="Correlation Rules" v={`${c.enabledRules} active`} sub={`${c.totalRules} total`} />
            <Row icon={Network} label="Attack Campaigns" v={`${c.attackChains}`} sub={`${c.containedChains} contained`} />
            <Row icon={Bot} label="Confluence Verdicts" v={`${c.verdictsTotal}`} sub={`${c.verdictsP1} P1 priority`} />
            <Row icon={Crosshair} label="IOC Database" v={`${c.activeIocs}`} sub={`${c.totalIocs} total seen`} />
            <Row icon={FlaskConical} label="Identities" v={`${c.totalUsers}`} sub={`${c.highRiskUsers} privileged`} />
            <Row icon={CheckCircle2} label="Cases Resolved" v={`${c.closedCases}`} sub={`MTTR ${fmtMttr}`} />
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-center text-xs text-slate-500">Loading executive telemetry…</div>
      )}
    </div>
  );
};

const ScoreRing = ({
  label,
  value,
  suffix,
  icon: Icon,
  gradient,
  sub,
}: {
  label: string;
  value: number;
  suffix: string;
  icon: any;
  gradient: string;
  sub: string;
}) => {
  const pct = Math.max(0, Math.min(100, value));
  const circumference = 2 * Math.PI * 44;
  const dash = (pct / 100) * circumference;
  return (
    <div className="enterprise-card p-6 relative overflow-hidden">
      <div className={`absolute -right-12 -top-12 h-40 w-40 rounded-full bg-gradient-to-br ${gradient} opacity-10 blur-2xl`} />
      <div className="flex items-center justify-between relative">
        <div>
          <p className="text-xs uppercase tracking-wider text-slate-400 font-medium">{label}</p>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="text-4xl font-bold text-slate-50 tabular-nums">{value}</span>
            <span className="text-sm text-slate-400">{suffix}</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">{sub}</p>
        </div>
        <div className="relative">
          <svg width="104" height="104" className="-rotate-90">
            <circle cx="52" cy="52" r="44" stroke="rgba(148,163,184,0.15)" strokeWidth="8" fill="none" />
            <circle
              cx="52"
              cy="52"
              r="44"
              stroke="url(#g)"
              strokeWidth="8"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={`${dash} ${circumference - dash}`}
            />
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="currentColor" className="text-blue-400" />
                <stop offset="100%" stopColor="currentColor" className="text-cyan-300" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className={`h-7 w-7 bg-gradient-to-br ${gradient} bg-clip-text text-transparent`} strokeWidth={1.75} />
          </div>
        </div>
      </div>
    </div>
  );
};

const colorMap: Record<string, { bg: string; text: string; ring: string }> = {
  red: { bg: 'bg-red-500/10', text: 'text-red-300', ring: 'ring-red-500/30' },
  amber: { bg: 'bg-amber-500/10', text: 'text-amber-300', ring: 'ring-amber-500/30' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-300', ring: 'ring-orange-500/30' },
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-300', ring: 'ring-emerald-500/30' },
  cyan: { bg: 'bg-cyan-500/10', text: 'text-cyan-300', ring: 'ring-cyan-500/30' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-300', ring: 'ring-rose-500/30' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-300', ring: 'ring-blue-500/30' },
  violet: { bg: 'bg-slate-500/10', text: 'text-slate-300', ring: 'ring-slate-500/30' },
};

const Tile = ({
  icon: Icon,
  label,
  value,
  delta,
  deltaLabel,
  color,
  trendDown,
}: {
  icon: any;
  label: string;
  value: number | string;
  delta: number;
  deltaLabel: string;
  color: keyof typeof colorMap | string;
  trendDown?: boolean;
}) => {
  const cls = colorMap[color as string] ?? colorMap.blue;
  return (
    <div className="enterprise-card p-5 hover:translate-y-[-1px] hover:shadow-xl transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-lg ${cls.bg} ring-1 ${cls.ring}`}>
          <Icon className={`w-5 h-5 ${cls.text}`} />
        </div>
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
            trendDown ? 'bg-emerald-500/10 text-emerald-300' : 'bg-blue-500/10 text-blue-300'
          }`}
        >
          {trendDown ? <ArrowDownRight className="w-3 h-3" /> : <ArrowUpRight className="w-3 h-3" />}
          <span className="tabular-nums">{typeof delta === 'number' ? delta : 0}</span>
          {typeof delta === 'number' && deltaLabel.toLowerCase().includes('%') ? '' : ''}
        </div>
      </div>
      <p className="text-xs text-slate-400 font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-50 tabular-nums">{value}</p>
      <p className="text-[11px] text-slate-500 mt-1">{deltaLabel}</p>
    </div>
  );
};

const Bar = ({ label, pct, hint, color }: { label: string; pct: number; hint: string; color: string }) => {
  const grad =
    color === 'emerald'
      ? 'from-emerald-500 to-teal-400'
      : color === 'blue'
      ? 'from-blue-500 to-cyan-400'
      : color === 'cyan'
      ? 'from-cyan-500 to-sky-400'
      : color === 'amber'
      ? 'from-amber-500 to-orange-400'
      : 'from-rose-500 to-pink-400';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs text-slate-300">{label}</span>
        <span className="text-xs font-semibold text-slate-100 tabular-nums">{pct}%</span>
      </div>
      <div className="w-full bg-slate-800/60 rounded-full h-2 overflow-hidden">
        <div className={`h-full bg-gradient-to-r ${grad} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[10px] text-slate-500 mt-1">{hint}</p>
    </div>
  );
};

const Row = ({ icon: Icon, label, v, sub }: { icon: any; label: string; v: string; sub: string }) => (
  <div className="flex items-center justify-between rounded-lg border border-slate-700/50 bg-slate-800/30 px-3 py-2.5">
    <div className="flex items-center gap-2.5">
      <Icon className="w-4 h-4 text-slate-400" />
      <div>
        <p className="text-xs font-medium text-slate-200">{label}</p>
        <p className="text-[10px] text-slate-500">{sub}</p>
      </div>
    </div>
    <span className="text-sm font-semibold text-slate-100 tabular-nums">{v}</span>
  </div>
);

export default ExecutiveDashboard;
