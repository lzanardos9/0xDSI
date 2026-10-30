import { useCallback, useEffect, useState } from 'react';
import { FlaskConical, Plus, RotateCw, ChevronRight, AlertOctagon, Loader2, Sparkles, UserRound, ListChecks } from 'lucide-react';
import { identityApi, type WhatIfResult, type WhatIfScenario } from '../../lib/identityApi';
import { Card, Empty, ErrorBanner, Loading, PageHeader, Tag, fmtTime } from './identityUi';
import WhatIfResultView from './WhatIfResult';
import WhatIfBuilder from './WhatIfBuilder';

const POLL_MS = 1500;

const SIM_STEPS = ['Copying today\'s access map', 'Applying your changes', 'Re-tracing every route to the crown jewels', 'Re-scoring identity risk'];

function Simulating() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(SIM_STEPS.length - 1, s + 1)), 650);
    return () => clearInterval(t);
  }, []);
  return (
    <Card className="p-8 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden"><div className="h-full w-1/3 bg-gradient-to-r from-transparent via-teal-300 to-transparent animate-[idSweep_1.4s_linear_infinite]" /></div>
      <div className="flex items-center gap-3 mb-5">
        <Loader2 size={20} className="animate-spin text-teal-300" />
        <div>
          <div className="text-sm font-medium text-slate-100">Simulating on a copy of today's access data</div>
          <div className="text-xs text-slate-500 mt-0.5">Nothing changes in your real directories. The result appears here by itself.</div>
        </div>
      </div>
      <ol className="space-y-2.5">
        {SIM_STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2.5 text-sm transition-colors duration-500 ${i < step ? 'text-slate-300' : i === step ? 'text-teal-200' : 'text-slate-600'}`}>
            <span className={`w-2 h-2 rounded-full transition-all duration-500 ${i < step ? 'bg-emerald-400' : i === step ? 'bg-teal-300 shadow-[0_0_10px_rgba(94,234,212,0.9)] animate-pulse' : 'bg-slate-700'}`} />
            {label}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function StatusTag({ s }: { s: WhatIfScenario }) {
  if (s.status === 'pending') return <Tag tone="blue"><Loader2 size={10} className="animate-spin" /> evaluating</Tag>;
  if (s.status === 'failed') return <Tag tone="red">failed</Tag>;
  return null;
}

function ScenarioDetail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const [data, setData] = useState<{ scenario: WhatIfScenario; result: WhatIfResult | null } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  const load = useCallback(() => {
    identityApi.whatifDetail(id).then((d) => { setData(d); setError(''); }).catch((e: Error) => setError(e.message));
  }, [id]);

  useEffect(() => { setData(null); setNote(''); load(); }, [load]);

  const pending = data?.scenario.status === 'pending';
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(() => { load(); onChanged(); }, POLL_MS);
    return () => clearInterval(t);
  }, [pending, load, onChanged]);

  const rerun = async () => {
    setBusy(true);
    setNote('');
    try {
      const ack = await identityApi.evaluateScenario(id);
      if (!ack.triggered) setNote('The simulator job could not be started right now; it will run with the next scheduled identity refresh.');
      load();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorBanner message={error} onRetry={load} />;
  if (!data) return <Card><Loading label="Loading scenario" /></Card>;
  const s = data.scenario;
  const changes = data.result ? [...(data.result.applied ?? []), ...(data.result.rejected ?? [])] : [];

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-slate-100">{s.name}</h2>
              {s.source === 'sample' ? <Tag tone="teal"><Sparkles size={10} /> sample</Tag> : <Tag tone="blue"><UserRound size={10} /> custom</Tag>}
              <StatusTag s={s} />
            </div>
            {s.description && <p className="text-sm text-slate-400 mt-1 leading-relaxed">{s.description}</p>}
            <div className="text-xs text-slate-500 mt-2">
              {s.created_by && <>By {s.created_by} · </>}
              {s.evaluated_at ? <>Last evaluated {fmtTime(s.evaluated_at)}</> : 'Not evaluated yet'}
            </div>
          </div>
          <button onClick={rerun} disabled={busy || pending}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700/60 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-40 transition-colors">
            <RotateCw size={13} className={busy ? 'animate-spin' : ''} /> Re-run on today's data
          </button>
        </div>
        {note && <div className="mt-3 text-xs text-amber-300">{note}</div>}
        {s.error && <div className="mt-3 text-sm text-red-300">The simulation could not run: {s.error}</div>}

        <div className="mt-4 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5"><ListChecks size={12} /> Proposed changes</div>
          {(changes.length ? changes : (s.changes || [])).map((c, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-slate-300">
              <span className="text-xs text-slate-500 w-5">{i + 1}.</span>
              <span>{c.description || c.type.replace(/_/g, ' ')}</span>
              {c.reason && <Tag tone="amber">not applied</Tag>}
            </div>
          ))}
        </div>
      </Card>

      {pending ? <Simulating /> : data.result ? <div key={s.evaluated_at ?? 'r'} className="animate-slide-up"><WhatIfResultView result={data.result} /></div> : (
        <Card><Empty title="No result yet" hint="Use Re-run to evaluate this scenario against today's access data." /></Card>
      )}
    </div>
  );
}

export default function WhatIfSimulator() {
  const [scenarios, setScenarios] = useState<WhatIfScenario[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const [banner, setBanner] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  const load = useCallback(() => {
    identityApi.whatifScenarios()
      .then((d) => {
        setScenarios(d.scenarios);
        setError('');
        setSelected((cur) => cur ?? d.scenarios[0]?.scenario_id ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="identity-page">
      <PageHeader
        icon={FlaskConical}
        title="What-If Simulator"
        subtitle="Try an access change before making it. See which crown-jewel paths close, whose risk drops, who loses access as collateral, and whether anyone would be locked out."
        actions={
          <button onClick={() => setBuilding(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-500 text-slate-950 text-sm font-medium hover:bg-teal-400 transition-colors">
            <Plus size={15} /> New scenario
          </button>
        }
      />

      {error && <div className="mb-4"><ErrorBanner message={error} onRetry={load} /></div>}
      {banner && (
        <div className={`mb-4 flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm animate-slide-down ${banner.tone === 'ok' ? 'border-teal-500/40 bg-teal-500/10 text-teal-100' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
          <span className="flex-1">{banner.text}</span>
          <button onClick={() => setBanner(null)} className="text-xs opacity-70 hover:opacity-100">Dismiss</button>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(300px,380px)_1fr] gap-6">
        <Card className="overflow-hidden self-start">
          {loading ? <Loading /> : scenarios.length === 0 ? (
            <Empty title="No scenarios yet" hint="Use New scenario to try your first access change." />
          ) : (
            <div className="max-h-[75vh] overflow-y-auto divide-y divide-slate-800">
              {scenarios.map((s) => {
                const active = s.scenario_id === selected;
                const sum = s.summary;
                const net = sum ? sum.risk_points_removed - sum.risk_points_added : 0;
                return (
                  <button key={s.scenario_id} onClick={() => setSelected(s.scenario_id)}
                    className={`w-full text-left px-4 py-3 flex items-center gap-3 transition-colors ${active ? 'bg-teal-500/10' : 'hover:bg-slate-800/50'} ${fresh === s.scenario_id ? 'id-live-enter id-live-new' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-100 truncate">{s.name}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        <StatusTag s={s} />
                        {sum && (
                          <>
                            <Tag tone={net > 0 ? 'green' : net < 0 ? 'red' : 'slate'}>{net > 0 ? `-${net}` : net < 0 ? `+${-net}` : '0'} risk</Tag>
                            {sum.paths_removed > 0 && <Tag tone="green">{sum.paths_removed} path{sum.paths_removed > 1 ? 's' : ''} closed</Tag>}
                            {sum.paths_added > 0 && <Tag tone="red">{sum.paths_added} opened</Tag>}
                            {sum.lockouts > 0 && <Tag tone="red"><AlertOctagon size={10} /> lockout</Tag>}
                          </>
                        )}
                      </div>
                    </div>
                    <ChevronRight size={14} className={active ? 'text-teal-300' : 'text-slate-600'} />
                  </button>
                );
              })}
            </div>
          )}
        </Card>
        <div>
          {selected ? <ScenarioDetail id={selected} onChanged={load} /> : (
            <Card><Empty title="Pick a scenario" hint="Select a scenario on the left, or create a new one." /></Card>
          )}
        </div>
      </div>

      {building && (
        <WhatIfBuilder
          onClose={() => setBuilding(false)}
          onCreated={(id, note) => {
            setBuilding(false);
            setBanner(note ? { tone: 'warn', text: note } : { tone: 'ok', text: 'Scenario saved. The simulation is running now.' });
            setFresh(id);
            setSelected(id);
            load();
          }}
        />
      )}
    </div>
  );
}
