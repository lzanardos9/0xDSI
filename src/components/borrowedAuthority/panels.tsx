import {
  AlertTriangle,
  ArrowRight,
  Ban,
  CheckCircle2,
  Clock,
  Fingerprint,
  Layers,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Cpu,
  KeyRound,
  Database,
  Radio,
  Scale,
} from 'lucide-react';
import type { AnalysisResult, BranchVerdict } from '../../lib/borrowedAuthority/types';
import {
  CEP_RULES,
  CET_QUERY,
  PRINCIPLES,
  REAL_CASE,
  RESPONSE_ACTIONS,
  RESPONSE_STATES,
  VANTAGE_POINTS,
} from '../../lib/borrowedAuthority/scenarioMeta';

const card = 'rounded-2xl border border-slate-700/60 bg-slate-900/60 p-5';
const chip = 'text-[10px] px-2 py-0.5 rounded-full border';

export function severityBadge(sev: string) {
  if (sev === 'critical') return 'bg-rose-500/15 text-rose-300 border-rose-500/30';
  if (sev === 'high') return 'bg-orange-500/15 text-orange-300 border-orange-500/30';
  if (sev === 'medium') return 'bg-amber-500/15 text-amber-300 border-amber-500/30';
  return 'bg-slate-700/40 text-slate-300 border-slate-600/40';
}

function statusBadge(status: BranchVerdict['status']) {
  switch (status) {
    case 'CONFIRMED_MALICIOUS': return { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30', Icon: ShieldX };
    case 'WITHDRAWN': return { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', Icon: ShieldCheck };
    case 'PROVISIONAL': return { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30', Icon: Clock };
    default: return { cls: 'bg-slate-700/40 text-slate-300 border-slate-600/40', Icon: CheckCircle2 };
  }
}

// ------------------------------------------------------------------ Overview
export function OverviewPanel() {
  return (
    <div className="space-y-5">
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Scale className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">The core distinction</h3>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">
          0xDSI does not need an indicator that says &ldquo;this is an AI attack.&rdquo; It recognizes a violation of
          trust relationships. Throughout the evidence model, these are never collapsed:
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {PRINCIPLES.map((p) => (
            <div key={p.a} className="flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-950/40 px-3 py-2">
              <span className="text-[11px] font-semibold text-slate-200">{p.a}</span>
              <span className="text-rose-400 font-bold">&ne;</span>
              <span className="text-[11px] font-semibold text-slate-200">{p.b}</span>
            </div>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">{REAL_CASE.headline}</h3>
        </div>
        <p className="text-[11px] text-slate-400 mb-3">{REAL_CASE.disclosure}</p>
        <p className="text-sm text-slate-300 leading-relaxed mb-4">{REAL_CASE.summary}</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {REAL_CASE.misalignment.map((m) => (
            <span key={m} className={`${chip} bg-slate-800/60 text-slate-300 border-slate-600/40`}>{m}</span>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {REAL_CASE.mapping.map((m, i) => (
            <div key={i} className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
              <p className="text-[11px] text-slate-400 mb-1"><span className="text-slate-500">Real&nbsp;incident:</span> {m.real}</p>
              <p className="text-[11px] text-cyan-300 flex items-start gap-1"><ArrowRight className="w-3 h-3 mt-0.5 flex-shrink-0" /> {m.demo}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-emerald-300/80 border-t border-slate-700/40 pt-3 flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" /> {REAL_CASE.disclaimer}
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {VANTAGE_POINTS.map((v) => (
          <div key={v.id} className={card}>
            <h3 className="text-sm font-semibold text-slate-100 mb-1">{v.role}</h3>
            <p className="text-[11px] text-cyan-300 mb-3">Earliest signal &middot; {v.earliest}</p>
            <ul className="space-y-1.5 mb-3">
              {v.catches.map((c, i) => (
                <li key={i} className="text-[12px] text-slate-300 flex items-start gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" /> {c}
                </li>
              ))}
            </ul>
            <p className="text-[12px] text-slate-300"><span className="text-slate-500">Containment:</span> {v.containment}</p>
            <p className="mt-2 text-[12px] text-amber-200/90 italic">{v.lesson}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Branches
export function BranchesPanel({ analysis }: { analysis: AnalysisResult }) {
  return (
    <div className="space-y-4">
      <p className="text-[12px] text-slate-400">
        Three executions run at the same time. The detector is not told which is malicious &mdash; it reaches a
        different conclusion for each. This proves correlation, not blanket flagging of every agent.
      </p>
      <div className="grid lg:grid-cols-3 gap-4">
        {analysis.branches.map((b) => {
          const sb = statusBadge(b.status);
          return (
            <div key={b.branch} className={`${card} ${b.kind === 'attack' ? 'ring-1 ring-rose-500/30' : ''}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-slate-500">Execution {b.branch}</span>
                <span className={`${chip} ${sb.cls} inline-flex items-center gap-1`}>
                  <sb.Icon className="w-3 h-3" /> {b.status.replace(/_/g, ' ')}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-100">{b.title}</h3>
              <p className="text-[11px] text-slate-500 font-mono mb-3">{b.agent}</p>

              {b.kind === 'attack' && (
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                    <span>chain completeness</span>
                    <span className="text-rose-300 font-semibold">{Math.round(b.completeness * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-amber-500 to-rose-500 transition-all duration-500" style={{ width: `${b.completeness * 100}%` }} />
                  </div>
                </div>
              )}

              <ul className="space-y-1">
                {b.stages.map((st) => (
                  <li key={st.key} className="flex items-start gap-2 text-[11px]">
                    {st.matched
                      ? <CheckCircle2 className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${b.kind === 'attack' ? 'text-rose-400' : 'text-emerald-400'}`} />
                      : <div className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 rounded-full border border-slate-600" />}
                    <span className={st.matched ? 'text-slate-300' : 'text-slate-600'}>{st.label}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-relaxed text-slate-400 border-t border-slate-700/40 pt-3">{b.narrative}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Timeline
export function TimelinePanel({ analysis }: { analysis: AnalysisResult }) {
  const fmt = (iso: string) => new Date(iso).toISOString().slice(11, 19);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">As received (arrival order)</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">Real streams are imperfect: some evidence lands late and out of order.</p>
        <ol className="space-y-1.5">
          {analysis.arrivalC.map((e) => {
            const late = new Date(e.ingest_time).getTime() - new Date(e.event_time).getTime() > 60000;
            return (
              <li key={e.event_id} className="flex items-center gap-2 text-[11px]">
                <span className="font-mono text-slate-500 w-14">{fmt(e.ingest_time)}</span>
                <span className="text-slate-300 flex-1 truncate">{e.event_type.replace(/_/g, ' ')}</span>
                {late && <span className={`${chip} bg-amber-500/15 text-amber-300 border-amber-500/30`}>late</span>}
              </li>
            );
          })}
        </ol>
      </div>
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Re-ordered on event-time</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-3">The engine sorts by true event-time before matching, so late arrivals slot into place.</p>
        <ol className="space-y-1.5">
          {analysis.reorderedC.map((e) => (
            <li key={e.event_id} className="flex items-center gap-2 text-[11px]">
              <span className="font-mono text-cyan-400/80 w-14">{fmt(e.event_time)}</span>
              <span className="text-slate-300 flex-1 truncate">{e.event_type.replace(/_/g, ' ')}</span>
              <span className="font-mono text-slate-600">{e.source_system}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Evidence / FUSE
export function EvidencePanel({ analysis }: { analysis: AnalysisResult }) {
  const f = analysis.fuse;
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-4 gap-3">
        {[
          { label: 'Raw observations', value: f.totalObservations, sub: 'before dedup' },
          { label: 'Distinct', value: f.distinctObservations, sub: `${f.duplicatesRemoved} duplicate removed` },
          { label: 'Independent families', value: f.independentFamilies, sub: 'not the same as alert count' },
          { label: 'Disagreements', value: f.conflicts.length, sub: 'surfaced, not merged' },
        ].map((s) => (
          <div key={s.label} className={card}>
            <p className="text-[10px] uppercase tracking-wide text-slate-500">{s.label}</p>
            <p className="text-2xl font-semibold text-slate-100">{s.value}</p>
            <p className="text-[10px] text-slate-500">{s.sub}</p>
          </div>
        ))}
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Evidence families</h3>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {f.families.map((fam) => (
            <div key={fam.source_system} className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
              <p className="text-[12px] font-semibold text-slate-200">{fam.source_system.replace(/_/g, ' ')}</p>
              <p className="text-[11px] text-slate-500">{fam.count} observation(s) &middot; trust {fam.trust}</p>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
            <span>Corroboration band (belief &rarr; plausibility)</span>
            <span className="text-slate-300">{Math.round(f.belief * 100)}% &ndash; {Math.round(f.plausibility * 100)}%</span>
          </div>
          <div className="relative h-2 rounded-full bg-slate-800 overflow-hidden">
            <div className="absolute h-full bg-slate-600/50" style={{ left: 0, width: `${f.plausibility * 100}%` }} />
            <div className="absolute h-full bg-gradient-to-r from-cyan-500 to-emerald-500" style={{ left: 0, width: `${f.belief * 100}%` }} />
          </div>
          <p className="mt-1.5 text-[10px] text-slate-500">{f.beliefLabel} This is a corroboration measure, not a probability of guilt; the gap is unresolved uncertainty.</p>
        </div>
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-4 h-4 text-amber-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Conflicts (never silently resolved)</h3>
        </div>
        <div className="space-y-2">
          {f.conflicts.map((c, i) => (
            <div key={i} className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3">
              <p className="text-[12px] font-semibold text-amber-200">{c.label}</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{c.detail}</p>
              <p className="text-[11px] text-emerald-300/80 mt-1 flex items-start gap-1"><ShieldCheck className="w-3 h-3 mt-0.5 flex-shrink-0" /> {c.resolution}</p>
            </div>
          ))}
          {f.conflicts.length === 0 && <p className="text-[12px] text-slate-500">No disagreements at this evidence cut.</p>}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Confluence
export function ConfluencePanel({ analysis }: { analysis: AnalysisResult }) {
  const c = analysis.confluence;
  const max = Math.max(1, ...c.hypotheses.map((h) => h.score));
  return (
    <div className="space-y-4">
      <div className={`${card} border-rose-500/30`}>
        <div className="flex items-center gap-2 mb-2">
          <ShieldAlert className="w-4 h-4 text-rose-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Decision</h3>
        </div>
        <p className="text-sm text-rose-200 font-medium">{c.verdict}</p>
        <p className="text-[11px] text-slate-400 mt-1">Selected hypothesis: <span className="text-slate-200 font-semibold">{c.winner.id} &middot; {c.winner.label}</span></p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase mb-3">Hypotheses</h3>
          <div className="space-y-2.5">
            {c.hypotheses.map((h) => (
              <div key={h.id}>
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className={h.id === c.winner.id ? 'text-rose-300 font-semibold' : 'text-slate-300'}>{h.id} &middot; {h.label}</span>
                  <span className="text-slate-500">{h.score.toFixed(1)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div className={`h-full ${h.id === c.winner.id ? 'bg-rose-500' : 'bg-slate-600'}`} style={{ width: `${(h.score / max) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={card}>
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase mb-3">Why (evidence-backed)</h3>
          <ul className="space-y-1.5">
            {c.rationale.map((r, i) => (
              <li key={i} className="text-[12px] text-slate-300 flex items-start gap-2">
                <ArrowRight className="w-3 h-3 text-rose-400 mt-1 flex-shrink-0" /> {r}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={card}>
        <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase mb-3">Negative correlation</h3>
        <p className="text-[11px] text-slate-500 mb-3">Confirmed absence is evidence. Unavailable telemetry is NOT &mdash; the two are never conflated.</p>
        <div className="grid sm:grid-cols-2 gap-2">
          {c.negatives.map((n, i) => (
            <div key={i} className={`rounded-lg border p-3 ${n.state === 'confirmed_absence' ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-slate-600/40 bg-slate-800/30'}`}>
              <p className="text-[12px] font-semibold text-slate-200 flex items-center gap-1.5">
                {n.state === 'confirmed_absence' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />}
                {n.label}
              </p>
              <p className="text-[11px] text-slate-400 mt-0.5">{n.detail}</p>
              <span className={`${chip} mt-2 inline-block ${n.state === 'confirmed_absence' ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-slate-700/40 text-slate-400 border-slate-600/40'}`}>
                {n.state.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Response
export function ResponsePanel({
  states, advance,
}: { states: Record<string, number>; advance: (id: string) => void }) {
  return (
    <div className="space-y-4">
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <Ban className="w-4 h-4 text-rose-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">Bounded containment (simulated)</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-4">
          VANGUARD proposes; a mock executor advances each action through discrete states. Nothing is ever
          marked EXECUTED merely because it was requested &mdash; verification is a separate, explicit step.
        </p>
        <div className="space-y-3">
          {RESPONSE_ACTIONS.map((a) => {
            const idx = states[a.id] ?? -1;
            return (
              <div key={a.id} className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-[12px] font-semibold text-slate-200">{a.label}</p>
                    <p className="text-[10px] font-mono text-slate-500">{a.target}</p>
                  </div>
                  <button
                    onClick={() => advance(a.id)}
                    disabled={idx >= RESPONSE_STATES.length - 1}
                    className="text-[11px] px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {idx >= RESPONSE_STATES.length - 1 ? 'Verified' : idx < 0 ? 'Request' : 'Advance'}
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {RESPONSE_STATES.map((st, i) => (
                    <div key={st} className="flex-1 flex flex-col items-center">
                      <div className={`w-full h-1 rounded-full ${i <= idx ? 'bg-emerald-500' : 'bg-slate-700'}`} />
                      <span className={`mt-1 text-[9px] ${i <= idx ? 'text-emerald-300' : 'text-slate-600'}`}>{st}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid sm:grid-cols-2 gap-2">
          <VerificationTile ok={(states['revoke_mock_credential'] ?? -1) >= RESPONSE_STATES.length - 1} label="credential_status" onText="revoked" offText="active" Icon={KeyRound} />
          <VerificationTile ok={(states['isolate_execution'] ?? -1) >= RESPONSE_STATES.length - 1} label="execution_network_status" onText="isolated" offText="connected" Icon={Fingerprint} />
        </div>
      </div>
    </div>
  );
}

function VerificationTile({ ok, label, onText, offText, Icon }: { ok: boolean; label: string; onText: string; offText: string; Icon: typeof KeyRound }) {
  return (
    <div className={`rounded-lg border p-3 flex items-center gap-3 ${ok ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-600/40 bg-slate-800/30'}`}>
      <Icon className={`w-4 h-4 ${ok ? 'text-emerald-400' : 'text-slate-500'}`} />
      <div>
        <p className="text-[10px] font-mono text-slate-500">{label}</p>
        <p className={`text-[12px] font-semibold ${ok ? 'text-emerald-300' : 'text-slate-400'}`}>{ok ? onText : offText}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Detectors reference (shared)
export function DetectorReference() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Cpu className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">{CET_QUERY.query_id}</h3>
        </div>
        <p className="text-[11px] text-slate-500 mb-2">{CET_QUERY.semantics}</p>
        <pre className="text-[10px] leading-relaxed text-slate-300 bg-slate-950/60 rounded-lg p-3 overflow-x-auto custom-scrollbar">{CET_QUERY.yaml}</pre>
      </div>
      <div className={card}>
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-cyan-300" />
          <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">CEP detections</h3>
        </div>
        <div className="space-y-2">
          {CEP_RULES.map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-700/50 bg-slate-950/40 p-2.5">
              <p className="text-[11px] font-mono text-cyan-300">{r.id}</p>
              <p className="text-[12px] text-slate-200">{r.title}</p>
              <p className="text-[11px] text-slate-500">{r.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MessageNotAuthority() {
  return (
    <div className={`${card} border-amber-500/30`}>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="w-4 h-4 text-amber-300" />
        <h3 className="text-sm font-semibold text-slate-100 tracking-wide uppercase">The pivotal event</h3>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-center">
          <p className="text-[10px] text-slate-500">agent-helper-44 &rarr; agent-research-31</p>
          <p className="text-2xl font-bold text-amber-200">&ldquo;GO&rdquo;</p>
          <p className="text-[10px] text-slate-500">inter-agent board</p>
        </div>
        <div className="flex-1 space-y-1.5 text-[12px]">
          <p className="text-slate-300 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> <b>CAN_COMMUNICATE_WITH</b> &mdash; agents may message each other</p>
          <p className="text-slate-300 flex items-center gap-2"><ShieldX className="w-4 h-4 text-rose-400" /> <b>CANNOT_AUTHORIZE</b> &mdash; no signature, no scope, no approval record</p>
          <p className="text-slate-500 text-[11px]">authority_claimed = true &middot; authority_verified = <span className="text-rose-300">false</span></p>
        </div>
      </div>
    </div>
  );
}
