import { useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpRight, Award, Bot, Briefcase, CheckCircle2, Clock, Crosshair,
  FileText, Fingerprint, FolderOpen, Globe, Grid3x3, Radar, Shield, ShieldCheck, Sparkles, TrendingDown, TrendingUp, Users,
} from 'lucide-react';
import CISOAssistant from '../CISOAssistant';
import ThreatGlobe from '../ThreatGlobe';
import ComplianceDashboard from '../ComplianceDashboard';
import RiskOverview from '../RiskOverview';
import BusinessOverview from '../BusinessOverview';
import PublicSectorOverview from '../PublicSectorOverview';
import AttackUniverse from '../AttackUniverse';
import { ActivityChart, ScoreRing, SeverityDonut, Sparkline } from './OverviewCharts';
import {
  EFFICIENCY, OverviewStats, SEVERITY_STYLE, Severity, TARGETS, VALUE_METRICS,
  hourlyActivity, normalizeActivities, postureLabel, postureScore, sampleFeed, targetMet, timeAgo,
} from './overviewData';

type Threat = { source: { lat: number; lon: number }; target: { lat: number; lon: number }; severity: 'critical' | 'high' | 'medium' };

interface Props {
  stats: OverviewStats;
  activities: unknown[];
  threats: Threat[];
  userName?: string;
  onNavigate: (view: string) => void;
}

type KpiKey = keyof OverviewStats;

const KPIS: { key: KpiKey; label: string; hint: string; icon: ComponentType<{ className?: string }>; color: string; tint: string; view: string; upIsGood: boolean }[] = [
  { key: 'totalEvents', label: 'Events analysed', hint: 'across all sources', icon: Activity, color: '#38bdf8', tint: 'text-sky-300 bg-sky-500/10 ring-sky-500/25', view: 'events', upIsGood: true },
  { key: 'activeSessions', label: 'Active sessions', hint: 'signed-in users', icon: Users, color: '#2dd4bf', tint: 'text-teal-300 bg-teal-500/10 ring-teal-500/25', view: 'userbehavior', upIsGood: true },
  { key: 'criticalAlerts', label: 'Critical alerts', hint: 'waiting for triage', icon: AlertTriangle, color: '#f87171', tint: 'text-red-300 bg-red-500/10 ring-red-500/25', view: 'alerts', upIsGood: false },
  { key: 'blockedThreats', label: 'Threats stopped', hint: 'automatic responses', icon: ShieldCheck, color: '#34d399', tint: 'text-emerald-300 bg-emerald-500/10 ring-emerald-500/25', view: 'responses', upIsGood: true },
];

const SHORTCUTS = [
  { view: 'alerts', label: 'Alerts', desc: 'Triage the queue', icon: AlertTriangle },
  { view: 'cases', label: 'Cases', desc: 'Open investigations', icon: FolderOpen },
  { view: 'id_overview', label: 'Identity', desc: 'Who can reach what', icon: Fingerprint },
  { view: 'advancedhunt', label: 'Threat hunting', desc: 'Search every event', icon: Crosshair },
  { view: 'mitre', label: 'MITRE ATT&CK', desc: 'Detection coverage', icon: Grid3x3 },
  { view: 'reports', label: 'Reports', desc: 'Share with leadership', icon: FileText },
];

const DEEP_DIVES = [
  { id: 'assistant', label: 'AI Assistant', icon: Bot },
  { id: 'globe', label: 'Threat Map', icon: Globe },
  { id: 'risk', label: 'Risk', icon: Shield },
  { id: 'compliance', label: 'Compliance', icon: Award },
  { id: 'scorecards', label: 'Scorecards', icon: Briefcase },
  { id: 'universe', label: 'Attack Universe', icon: Sparkles },
] as const;

type DeepDive = typeof DEEP_DIVES[number]['id'];

const HISTORY_LEN = 24;

function seedHistory(v: number): number[] {
  return Array.from({ length: HISTORY_LEN }, (_, i) => {
    const f = 1 - (HISTORY_LEN - 1 - i) * 0.006;
    return Math.max(0, v * f + Math.sin(i * 1.3) * Math.max(1, v * 0.004));
  });
}

function useStatHistory(stats: OverviewStats) {
  const latest = useRef(stats);
  latest.current = stats;
  const [history, setHistory] = useState<Record<KpiKey, number[]>>(() => ({
    totalEvents: seedHistory(stats.totalEvents),
    activeSessions: seedHistory(stats.activeSessions),
    criticalAlerts: seedHistory(stats.criticalAlerts),
    blockedThreats: seedHistory(stats.blockedThreats),
  }));
  useEffect(() => {
    const t = setInterval(() => {
      setHistory((h) => {
        const next = { ...h };
        (Object.keys(h) as KpiKey[]).forEach((k) => { next[k] = [...h[k].slice(1), latest.current[k]]; });
        return next;
      });
    }, 3000);
    return () => clearInterval(t);
  }, []);
  return history;
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-800/80 bg-slate-900/50 backdrop-blur-sm ${className}`}>
      {children}
    </section>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 px-6 pt-6 pb-4">
      <div>
        <h3 className="text-base font-semibold text-slate-100 tracking-tight">{title}</h3>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const OverviewDashboard = ({ stats, activities, threats, userName, onNavigate }: Props) => {
  const now = useNow(30000);
  const history = useStatHistory(stats);
  const [dive, setDive] = useState<DeepDive>('assistant');
  const [scorecard, setScorecard] = useState<'business' | 'publicsector'>('business');

  const score = postureScore(stats);
  const posture = postureLabel(score);
  const hourly = useMemo(() => hourlyActivity(now), [Math.floor(now / 3600000)]);
  const feed = useMemo(() => {
    const rows = normalizeActivities(activities);
    return (rows.length ? rows : sampleFeed(now)).slice(0, 8);
  }, [activities, now]);

  const counts = useMemo<Record<Severity, number>>(() => {
    const c: Record<Severity, number> = { critical: stats.criticalAlerts, high: 14, medium: 31, low: 52 };
    feed.forEach((r) => { if (r.severity !== 'critical') c[r.severity] += 1; });
    return c;
  }, [feed, stats.criticalAlerts]);

  const met = TARGETS.filter(targetMet).length;
  const last24 = hourly.reduce((a, d) => a + d.critical + d.high, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <Card className="relative overflow-hidden">
        <div className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" />
        <div className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[1fr_auto] items-center">
          <div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              All systems monitored
              <span className="text-slate-600">/</span>
              {new Date(now).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}
            </div>
            <h1 className="mt-3 text-3xl md:text-4xl font-semibold text-slate-50 tracking-tight leading-tight">
              {greeting(now)}{userName ? `, ${userName.split(' ')[0]}` : ''}.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400 leading-relaxed">
              {stats.criticalAlerts > 0
                ? <>You have <span className="text-red-300 font-medium">{stats.criticalAlerts} critical alert{stats.criticalAlerts === 1 ? '' : 's'}</span> waiting and <span className="text-slate-200 font-medium">{met} of {TARGETS.length}</span> response targets on track.</>
                : <>No critical alerts are waiting. <span className="text-slate-200 font-medium">{met} of {TARGETS.length}</span> response targets are on track.</>}
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => onNavigate('alerts')}
                className="group inline-flex items-center gap-2 rounded-xl bg-teal-500 px-4 py-2.5 text-sm font-medium text-slate-950 shadow-lg shadow-teal-500/20 transition hover:bg-teal-400"
              >
                Review critical alerts
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => onNavigate('cases')}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/50 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800"
              >
                Open cases
              </button>
              <button
                onClick={() => onNavigate('executive')}
                className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-400 transition hover:text-slate-100"
              >
                Executive summary
              </button>
            </div>
          </div>
          <div className="flex items-center gap-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-5">
            <ScoreRing score={score} color={posture.ring} />
            <div className="space-y-3 min-w-[150px]">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Security posture</p>
                <p className={`mt-1 text-lg font-semibold ${posture.tone}`}>{posture.label}</p>
              </div>
              {[
                { label: 'Time to detect', value: '12 min' },
                { label: 'Time to respond', value: '28 min' },
                { label: 'Coverage', value: '97.5%' },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-4 text-xs">
                  <span className="text-slate-500">{r.label}</span>
                  <span className="text-slate-200 font-medium tabular-nums">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {KPIS.map((k, i) => {
          const h = history[k.key];
          const delta = stats[k.key] - Math.round(h[0]);
          const good = delta === 0 ? null : (delta > 0) === k.upIsGood;
          const Icon = k.icon;
          return (
            <button
              key={k.key}
              onClick={() => onNavigate(k.view)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 p-5 text-left transition hover:-translate-y-0.5 hover:border-slate-700 hover:shadow-xl hover:shadow-black/30 animate-slide-up"
            >
              <div className="flex items-center justify-between">
                <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${k.tint}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-600 transition group-hover:text-slate-300" />
              </div>
              <p className="mt-4 text-xs font-medium text-slate-400">{k.label}</p>
              <p className="mt-1 text-3xl font-semibold text-slate-50 tabular-nums tracking-tight">{stats[k.key].toLocaleString()}</p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                {good !== null && (
                  <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${good ? 'text-emerald-300' : 'text-red-300'}`}>
                    {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {delta > 0 ? '+' : ''}{delta.toLocaleString()}
                  </span>
                )}
                <span className="text-slate-500">{k.hint}</span>
              </div>
              <Sparkline values={h} color={k.color} className="mt-4 h-10 w-full" />
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Detection activity"
            subtitle={`Last 24 hours · ${last24.toLocaleString()} high and critical detections`}
            action={<span className="rounded-lg border border-slate-800 bg-slate-950/50 px-2.5 py-1 text-xs text-slate-400">24h</span>}
          />
          <div className="px-6 pb-6"><ActivityChart data={hourly} /></div>
        </Card>
        <Card>
          <CardHeader title="Open alerts by severity" subtitle="Everything still waiting for a decision" />
          <div className="px-6 pb-6">
            <SeverityDonut counts={counts} />
            <button
              onClick={() => onNavigate('alerts')}
              className="mt-6 flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-3 text-sm text-slate-300 transition hover:border-slate-700 hover:text-slate-100"
            >
              Go to the alert queue
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Live activity"
            subtitle="Newest signals from alerts, events, cases, agents and users"
            action={
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
              </span>
            }
          />
          <ul className="px-3 pb-4">
            {feed.map((r) => (
              <li key={r.id} className="group flex items-center gap-4 rounded-xl px-3 py-3 transition hover:bg-slate-800/40 animate-fade-in">
                <span className={`h-2 w-2 shrink-0 rounded-full ${SEVERITY_STYLE[r.severity].dot}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-slate-200">{r.message}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{r.source}</p>
                </div>
                <span className={`hidden sm:inline-flex rounded-md border px-2 py-0.5 text-[11px] font-medium ${SEVERITY_STYLE[r.severity].chip}`}>
                  {SEVERITY_STYLE[r.severity].label}
                </span>
                <span className="flex w-20 shrink-0 items-center justify-end gap-1 text-xs text-slate-500 tabular-nums">
                  <Clock className="h-3 w-3" />{timeAgo(r.at, now)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Response targets" subtitle={`${met} of ${TARGETS.length} on track`} />
          <ul className="space-y-4 px-6 pb-6">
            {TARGETS.map((t) => {
              const ok = targetMet(t);
              const pct = Math.min(100, t.lowerIsBetter ? (t.target / Math.max(t.current, 0.01)) * 100 : (t.current / t.target) * 100);
              return (
                <li key={t.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-300">{t.label}</span>
                    <span className="tabular-nums text-slate-100 font-medium">
                      {t.current}<span className="text-slate-500 font-normal">{t.unit === '%' ? '%' : ` ${t.unit}`}</span>
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div className={`h-full rounded-full ${ok ? 'bg-emerald-400' : 'bg-amber-400'} id-bar-in`} style={{ width: `${pct}%` }} />
                  </div>
                  <p className={`mt-1 text-[11px] ${ok ? 'text-emerald-300/80' : 'text-amber-200/80'}`}>
                    {ok ? 'On track' : 'At risk'} · target {t.lowerIsBetter ? 'under' : 'above'} {t.target}{t.unit === '%' ? '%' : ` ${t.unit}`}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card>
        <CardHeader title="Business value" subtitle="What the security programme is returning this quarter" />
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6 px-6 pb-6">
          <div className="grid grid-cols-2 gap-4">
            {VALUE_METRICS.map((m) => (
              <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                <p className="text-xs text-slate-500">{m.label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-50 tabular-nums">{m.value}</p>
                <p className="mt-1 text-xs"><span className="text-emerald-300 font-medium">{m.delta}</span> <span className="text-slate-500">{m.note}</span></p>
              </div>
            ))}
          </div>
          <div className="space-y-4">
            {EFFICIENCY.map((e) => (
              <div key={e.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{e.label}</span>
                  <span className="text-emerald-300 font-medium tabular-nums">{e.gain}% faster</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 id-bar-in" style={{ width: `${e.gain}%` }} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500 tabular-nums">{e.before} <ArrowRight className="inline h-3 w-3" /> <span className="text-slate-300">{e.after}</span></p>
              </div>
            ))}
            <p className="flex items-start gap-2 pt-1 text-xs text-slate-400 leading-relaxed">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              Automation saves the team about 2,400 hours a month.
            </p>
          </div>
        </div>
      </Card>

      <div>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-slate-500">Jump to</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          {SHORTCUTS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.view}
                onClick={() => onNavigate(s.view)}
                className="group rounded-xl border border-slate-800/80 bg-slate-900/50 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-500/40 hover:bg-slate-900"
              >
                <Icon className="h-5 w-5 text-slate-400 transition group-hover:text-teal-300" />
                <p className="mt-3 text-sm font-medium text-slate-100">{s.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{s.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-slate-800/80 px-6 pt-6 pb-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-100 tracking-tight flex items-center gap-2">
              <Radar className="h-4 w-4 text-teal-300" /> Deep dive
            </h3>
            <p className="mt-1 text-xs text-slate-500">Open one detailed view at a time</p>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl border border-slate-800 bg-slate-950/50 p-1">
            {DEEP_DIVES.map((d) => {
              const Icon = d.icon;
              const active = dive === d.id;
              return (
                <button
                  key={d.id}
                  onClick={() => setDive(d.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${active ? 'bg-slate-800 text-slate-50 shadow' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Icon className="h-3.5 w-3.5" />{d.label}
                </button>
              );
            })}
          </div>
        </div>
        <div key={dive} className="p-6 animate-fade-in">
          {dive === 'assistant' && <div className="h-[600px]"><CISOAssistant /></div>}
          {dive === 'globe' && <div className="h-[520px] overflow-hidden rounded-xl"><ThreatGlobe threats={threats} /></div>}
          {dive === 'risk' && <RiskOverview />}
          {dive === 'compliance' && <ComplianceDashboard />}
          {dive === 'universe' && <AttackUniverse />}
          {dive === 'scorecards' && (
            <>
              <div className="mb-6 inline-flex rounded-xl border border-slate-800 bg-slate-950/50 p-1">
                {(['business', 'publicsector'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScorecard(s)}
                    className={`rounded-lg px-4 py-1.5 text-xs font-medium transition ${scorecard === s ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-200'}`}
                  >
                    {s === 'business' ? 'Business' : 'Public sector'}
                  </button>
                ))}
              </div>
              {scorecard === 'business' ? <BusinessOverview /> : <PublicSectorOverview />}
            </>
          )}
        </div>
      </Card>
    </div>
  );
};

export default OverviewDashboard;
