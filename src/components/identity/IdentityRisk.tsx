import { useCallback, useEffect, useState } from 'react';
import { Gauge, Search, TrendingUp, TrendingDown, Minus, Route, ShieldAlert, History, ChevronRight } from 'lucide-react';
import { identityApi, type RiskBand, type RiskDetail, type RiskScore } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime } from './identityUi';
import { BAND_STYLE, BandPill, PathChain } from './identityRiskUi';

const BANDS: RiskBand[] = ['critical', 'high', 'medium', 'low'];
const CATEGORY_LABEL = { exposure: 'Exposure', behaviour: 'Behaviour', hygiene: 'Hygiene' } as const;
const CATEGORY_CAP = { exposure: 100, behaviour: 50, hygiene: 40 } as const;
const CATEGORY_BAR = { exposure: 'bg-red-400', behaviour: 'bg-amber-400', hygiene: 'bg-sky-400' } as const;

function Delta({ delta }: { delta: number | null }) {
  if (delta === null || delta === undefined) return <span className="text-[11px] text-slate-500">new</span>;
  if (delta === 0) return <Minus size={12} className="text-slate-500" />;
  const up = delta > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? 'text-red-300' : 'text-emerald-300'}`}>
      <Icon size={12} /> {up ? '+' : ''}{delta}
    </span>
  );
}

function ScoreRing({ score, band }: { score: number; band: RiskBand }) {
  const pct = Math.min(score, 100);
  const r = 34;
  const c = 2 * Math.PI * r;
  const color = { critical: '#f87171', high: '#fb923c', medium: '#fbbf24', low: '#34d399' }[band];
  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 80 80" className="w-24 h-24 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#1e293b" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c - (pct / 100) * c} className="transition-all duration-700" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-slate-100 leading-none">{score}</span>
        <span className="text-[10px] text-slate-500 mt-1">of 100</span>
      </div>
    </div>
  );
}

function Sparkline({ history }: { history: RiskDetail['history'] }) {
  if (history.length < 2) return <div className="text-xs text-slate-500">Only one scoring run so far. Drift appears after the next run.</div>;
  const w = 240;
  const h = 48;
  const pts = history.map((p, i) => `${(i / (history.length - 1)) * w},${h - (Math.min(p.score, 100) / 100) * h}`).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#2dd4bf" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DetailPanel({ id }: { id: string }) {
  const [data, setData] = useState<RiskDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    identityApi.riskDetail(id).then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [id]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <Card><Loading label="Loading risk breakdown" /></Card>;
  const s = data.score;
  const byCat = (['exposure', 'behaviour', 'hygiene'] as const).map((cat) => ({
    cat, value: s[cat], factors: s.factors.filter((f) => f.category === cat),
  }));

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-center gap-5">
          <ScoreRing score={s.score} band={s.band} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100 truncate">{s.display_name || s.canonical_id}</h2>
              <BandPill band={s.band} />
              <Tag>{s.principal_type}</Tag>
            </div>
            <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
              <span>Previous {s.previous_score ?? 'none'}</span>
              <Delta delta={s.delta} />
              <span>·</span>
              <span>Weights {s.weights_version}</span>
              <span>·</span>
              <span>{fmtTime(s.scored_at)}</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              {byCat.map(({ cat, value }) => (
                <div key={cat}>
                  <div className="flex justify-between text-[11px] text-slate-400 mb-1">
                    <span>{CATEGORY_LABEL[cat]}</span>
                    <span className="text-slate-200 font-medium">{value}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full ${CATEGORY_BAR[cat]} transition-all duration-700`} style={{ width: `${Math.min(100, (value / CATEGORY_CAP[cat]) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">Why this score</h3>
        <p className="text-xs text-slate-500 mb-4">Every point comes from a named factor with the evidence behind it. Category totals are capped before they are added.</p>
        {s.factors.length === 0 ? (
          <div className="text-sm text-slate-400">No risk factors. This identity has no crown-jewel reach, no open findings and no hygiene issues.</div>
        ) : (
          <div className="space-y-4">
            {byCat.filter((c) => c.factors.length).map(({ cat, factors }) => (
              <div key={cat}>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 mb-2">{CATEGORY_LABEL[cat]}</div>
                <div className="space-y-2">
                  {factors.map((f, i) => (
                    <div key={`${f.factor}-${i}`} className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm text-slate-200">{f.label}</div>
                        <span className="flex-shrink-0 text-sm font-semibold text-slate-100">+{f.points}</span>
                      </div>
                      {f.evidence.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {f.evidence.slice(0, 6).map((e) => (
                            <span key={e} className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] text-slate-400 font-mono break-all">{e}</span>
                          ))}
                          {f.evidence.length > 6 && <span className="text-[11px] text-slate-500">+{f.evidence.length - 6} more</span>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <Route size={15} className="text-teal-300" />
          <h3 className="text-sm font-semibold text-slate-200">Paths to crown jewels</h3>
          <span className="text-xs text-slate-500">{data.paths.length}</span>
        </div>
        {data.paths.length === 0 ? (
          <div className="text-sm text-slate-400">No route from this identity's active accounts reaches a crown-jewel system.</div>
        ) : (
          <div className="space-y-3">
            {data.paths.map((p) => (
              <div key={p.path_id} className={`rounded-lg border p-3 ${p.via_takeover ? 'border-red-500/40 bg-red-500/5' : 'border-slate-700/60 bg-slate-900/40'}`}>
                <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-slate-400">
                  <span className="text-slate-200 font-medium">{p.resource_name || p.resource_id}</span>
                  <span>{p.hops} hop{p.hops === 1 ? '' : 's'}</span>
                  {p.via_takeover && <Tag tone="red"><ShieldAlert size={11} /> takeover</Tag>}
                </div>
                <PathChain path={p} />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <History size={15} className="text-teal-300" />
          <h3 className="text-sm font-semibold text-slate-200">Score drift</h3>
        </div>
        <Sparkline history={data.history} />
      </Card>
    </div>
  );
}

export default function IdentityRisk() {
  const [scores, setScores] = useState<RiskScore[]>([]);
  const [bands, setBands] = useState<Partial<Record<RiskBand, number>>>({});
  const [meta, setMeta] = useState<{ scored_at: string | null; weights_version: string | null } | null>(null);
  const [band, setBand] = useState<RiskBand | ''>('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    identityApi
      .risk({ band, search })
      .then((d) => {
        setScores(d.scores);
        setBands(d.bands || {});
        setMeta(d.meta);
        setSelected((cur) => (cur && d.scores.some((s) => s.canonical_id === cur) ? cur : d.scores[0]?.canonical_id ?? null));
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [band, search]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <div className="identity-page">
      <PageHeader
        icon={Gauge}
        title="Identity Risk"
        subtitle="An explainable 0-100 score per identity, built from crown-jewel exposure, suspicious behaviour on the timeline and account hygiene. Click anyone to see exactly where each point comes from."
        actions={meta?.scored_at ? <div className="text-xs text-slate-500">Scored {fmtTime(meta.scored_at)} · weights {meta.weights_version}</div> : undefined}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {BANDS.map((b) => {
          const st = BAND_STYLE[b];
          const active = band === b;
          return (
            <button key={b} onClick={() => setBand(active ? '' : b)}
              className={`text-left rounded-xl border p-4 transition-all ${active ? `${st.bg} ring-2 ${st.ring}` : 'bg-slate-900/50 backdrop-blur border-slate-700/50 hover:border-slate-500/60 hover:-translate-y-0.5'}`}>
              <div className={`text-2xl font-semibold ${st.text}`}>{bands[b] ?? 0}</div>
              <div className="text-xs text-slate-400 capitalize mt-0.5">{b}</div>
            </button>
          );
        })}
      </div>

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(320px,420px)_1fr] gap-6">
        <Card className="overflow-hidden self-start">
          <div className="p-3 border-b border-slate-700/50">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name"
                className="w-full bg-slate-900/60 border border-slate-700/60 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-teal-500/60" />
            </div>
          </div>
          {loading && scores.length === 0 ? (
            <Loading />
          ) : scores.length === 0 ? (
            <Empty title="No scored identities" hint="Run the Identity 01 job to score access risk, or clear the filter." />
          ) : (
            <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-800">
              {scores.map((s, i) => {
                const active = s.canonical_id === selected;
                const top = [...s.factors].sort((a, b) => b.points - a.points)[0];
                return (
                  <button key={s.canonical_id} onClick={() => setSelected(s.canonical_id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${active ? 'bg-teal-500/10' : 'hover:bg-slate-800/50'}`}>
                    <span className="w-5 text-xs text-slate-500 text-right">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-100 truncate">{s.display_name || s.canonical_id}</span>
                        <Delta delta={s.delta} />
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{top ? top.label : 'No risk factors'}</div>
                      <div className="flex h-1 mt-2 rounded-full overflow-hidden bg-slate-800">
                        <div className="bg-red-400" style={{ width: `${s.exposure}%` }} />
                        <div className="bg-amber-400" style={{ width: `${s.behaviour}%` }} />
                        <div className="bg-sky-400" style={{ width: `${s.hygiene}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-semibold ${BAND_STYLE[s.band]?.text || 'text-slate-200'}`}>{s.score}</div>
                    </div>
                    <ChevronRight size={14} className={active ? 'text-teal-300' : 'text-slate-600'} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <div>{selected ? <DetailPanel id={selected} /> : <Card><Empty title="Pick an identity" hint="Select someone on the left to see their risk breakdown." /></Card>}</div>
      </div>
    </div>
  );
}
