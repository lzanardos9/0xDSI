import { useMemo } from 'react';
import { Radar, Zap, AlertTriangle, Activity, CheckCircle2, RefreshCw } from 'lucide-react';

type Item = {
  id: string;
  title: string;
  severity: string;
  family: string;
  published_at: string;
  exposure_status: string;
  source_key: string;
};

const SEV_COLOR: Record<string, string> = {
  critical: '#ef4444',
  high: '#fb923c',
  medium: '#eab308',
  low: '#10b981',
};

export default function RadarHUD({
  items, stats, onRefresh, refreshing,
}: {
  items: Item[];
  stats: { total: number; critical: number; exposure: number; families: number; proposalsReady: number; last_sync: string | null };
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const dots = useMemo(() => {
    const now = Date.now();
    return items.slice(0, 60).map((it, i) => {
      const ageMs = now - new Date(it.published_at).getTime();
      const ageHours = Math.max(0.5, Math.min(168, ageMs / 3_600_000));
      const radius = 40 + (ageHours / 168) * 60;
      const angle = (i * 137.508) % 360;
      const rad = (angle * Math.PI) / 180;
      const cx = 120 + radius * Math.cos(rad);
      const cy = 120 + radius * Math.sin(rad);
      return { cx, cy, severity: it.severity, family: it.family, title: it.title, id: it.id, exposed: it.exposure_status !== 'unknown' && it.exposure_status !== 'clean' };
    });
  }, [items]);

  const ticker = items.slice(0, 12);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950/30 p-5">
      <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: 'radial-gradient(circle, #10b981, transparent 70%)' }} />
      <div className="relative flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40">
              <Radar className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300/80 font-bold">Threat Cortex</div>
              <h1 className="text-2xl font-bold text-white leading-tight">Predictive Intelligence Nexus</h1>
            </div>
          </div>
          <p className="text-sm text-slate-400 max-w-xl mb-4">
            Autonomous intelligence cortex scanning {stats.total > 0 ? 'live' : 'your'} feeds across CVE advisories, vendor blogs, malware trackers, bounty disclosures and academic research. Each story gets a point of view, a proposed correlation rule, and a reality check against our data.
          </p>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-4">
            <Stat icon={Activity} label="Items Tracked" value={stats.total} color="emerald" />
            <Stat icon={AlertTriangle} label="Critical" value={stats.critical} color="red" />
            <Stat icon={Zap} label="We're Exposed" value={stats.exposure} color="amber" alert={stats.exposure > 0} />
            <Stat icon={CheckCircle2} label="Proposals" value={stats.proposalsReady} color="cyan" />
            <Stat icon={Radar} label="Families" value={stats.families} color="pink" />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500/25 to-cyan-500/20 hover:from-emerald-500/40 hover:to-cyan-500/35 border border-emerald-500/40 text-emerald-100 text-sm font-semibold transition disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Scanning sources...' : 'Scan Now'}
            </button>
            {stats.last_sync && (
              <div className="text-[11px] text-slate-500">
                Last sync: <span className="text-slate-300 font-mono">{new Date(stats.last_sync).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>

        <div className="relative w-[260px] h-[260px] shrink-0 mx-auto">
          <svg viewBox="0 0 240 240" className="w-full h-full">
            <defs>
              <radialGradient id="radarGlow">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
              </radialGradient>
              <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#34d399" stopOpacity="0" />
                <stop offset="100%" stopColor="#34d399" stopOpacity="0.6" />
              </linearGradient>
            </defs>
            <circle cx="120" cy="120" r="110" fill="url(#radarGlow)" />
            {[30, 55, 80, 105].map(r => <circle key={r} cx="120" cy="120" r={r} fill="none" stroke="#10b981" strokeOpacity="0.18" strokeDasharray="2 3" />)}
            <line x1="120" y1="10" x2="120" y2="230" stroke="#10b981" strokeOpacity="0.12" />
            <line x1="10" y1="120" x2="230" y2="120" stroke="#10b981" strokeOpacity="0.12" />
            <g style={{ transformOrigin: '120px 120px', animation: 'radar-sweep 6s linear infinite' }}>
              <path d="M120 120 L120 10 A110 110 0 0 1 220 75 Z" fill="url(#sweepGrad)" opacity="0.55" />
            </g>
            {dots.map((d, i) => (
              <g key={d.id}>
                <circle cx={d.cx} cy={d.cy} r={d.exposed ? 4.5 : 3} fill={SEV_COLOR[d.severity] || '#94a3b8'} opacity="0.9">
                  {d.exposed && <animate attributeName="r" values="4;7;4" dur="1.6s" repeatCount="indefinite" />}
                </circle>
                {i % 8 === 0 && (
                  <circle cx={d.cx} cy={d.cy} r="7" fill="none" stroke={SEV_COLOR[d.severity] || '#94a3b8'} strokeOpacity="0.4">
                    <animate attributeName="r" values="3;12;3" dur="2.2s" repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.6;0;0.6" dur="2.2s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            ))}
            <circle cx="120" cy="120" r="4" fill="#34d399" />
          </svg>
          <style>{`@keyframes radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>

      {ticker.length > 0 && (
        <div className="relative mt-4 overflow-hidden rounded-lg border border-slate-800/60 bg-slate-950/60 py-2">
          <div className="flex gap-8 whitespace-nowrap" style={{ animation: 'ticker 60s linear infinite' }}>
            {[...ticker, ...ticker].map((t, i) => (
              <div key={`${t.id}-${i}`} className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: SEV_COLOR[t.severity] || '#94a3b8' }} />
                <span className="text-slate-500 uppercase tracking-wider">{t.source_key}</span>
                <span className="text-slate-200">{t.title.slice(0, 90)}</span>
              </div>
            ))}
          </div>
          <style>{`@keyframes ticker { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, color, alert }: { icon: any; label: string; value: number; color: string; alert?: boolean }) {
  const colorMap: Record<string, string> = {
    emerald: 'from-emerald-500/15 border-emerald-500/30 text-emerald-200',
    red: 'from-red-500/15 border-red-500/30 text-red-200',
    amber: 'from-amber-500/15 border-amber-500/30 text-amber-200',
    cyan: 'from-cyan-500/15 border-cyan-500/30 text-cyan-200',
    pink: 'from-pink-500/15 border-pink-500/30 text-pink-200',
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${colorMap[color]} to-slate-900/60 px-3 py-2.5 ${alert ? 'animate-pulse' : ''}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <Icon className="w-3.5 h-3.5 opacity-80" />
        <div className="text-[9px] uppercase tracking-wider font-bold opacity-80">{label}</div>
      </div>
      <div className="text-xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
