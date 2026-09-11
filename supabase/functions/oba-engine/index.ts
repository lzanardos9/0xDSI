// Operation Borrowed Authority — detection backend.
//
// The ONLY place a verdict is produced. Reads raw telemetry, runs the engine
// for both evidence cuts (pre_late / post_late), and persists findings. The
// frontend reads those rows; it cannot compute a verdict on its own.
//
// mode "demo"  -> the real seeded telemetry.
// mode "blind" -> the same telemetry with every IDENTITY randomized (names,
//                 executions, credentials, resources) but behaviour untouched.
//                 If the verdict is unchanged, the detector is behaviour-driven,
//                 not scenario-memorized.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { analyze } from './engine.ts';
import type { AnalysisResult, ObaAuthorization, ObaEvent } from './types.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

const ENGINE_VERSION = 'v2-identity-agnostic';

// Deterministic PRNG so a given seed reproduces the same blind scenario.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function tokenFactory(rng: () => number) {
  const cache = new Map<string, string>();
  return (prefix: string, original: string) => {
    if (!original) return original;
    const key = `${prefix}:${original}`;
    if (!cache.has(key)) {
      const id = Math.floor(rng() * 1e6).toString(36);
      cache.set(key, `${prefix}-${id}`);
    }
    return cache.get(key)!;
  };
}

// Remap ONLY identity fields. Behaviour fields (event_type, operation, trust,
// classification, authority_verified, signatures, times) are left untouched.
function randomizeIdentities(
  events: ObaEvent[],
  auths: ObaAuthorization[],
  seed: number,
): { events: ObaEvent[]; auths: ObaAuthorization[] } {
  const rng = mulberry32(seed);
  const tok = tokenFactory(rng);
  const agent = (v: unknown) => (v ? tok('agent', String(v)) : v);
  const exec = (v: unknown) => (v ? tok('exec', String(v)) : v);
  const cred = (v: unknown) => (v ? tok('cred', String(v)) : v);
  const evid = (v: unknown) => (v ? tok('evt', String(v)) : v);
  const dkey = (v: unknown) => (v ? tok('dk', String(v)) : v);
  const res = (v: unknown) => (v ? tok('res', String(v)) : v);
  const dom = (v: unknown) => (v ? `${tok('dst', String(v))}.example` : v);

  const mapPayload = (p: Record<string, unknown>): Record<string, unknown> => {
    const o = { ...p };
    if ('sender' in o) o.sender = agent(o.sender);
    if ('receiver' in o) o.receiver = agent(o.receiver);
    if ('principal' in o) o.principal = agent(o.principal);
    if ('issuer' in o) o.issuer = agent(o.issuer);
    if ('issued_to_execution' in o) o.issued_to_execution = exec(o.issued_to_execution);
    if ('used_from_execution' in o) o.used_from_execution = exec(o.used_from_execution);
    if ('credential_id' in o) o.credential_id = cred(o.credential_id);
    if ('target_event' in o) o.target_event = evid(o.target_event);
    if ('source_workload' in o) o.source_workload = tok('wl', String(o.source_workload));
    if ('resource' in o) o.resource = res(o.resource);
    if ('destination_domain' in o) o.destination_domain = dom(o.destination_domain);
    return o;
  };

  return {
    events: events.map((e) => ({
      ...e,
      event_id: String(evid(e.event_id)),
      dedupe_key: String(dkey(e.dedupe_key)),
      agent_id: String(agent(e.agent_id)),
      execution_id: String(exec(e.execution_id)),
      branch: 'X', // strip the label the engine must never read
      payload: mapPayload(e.payload),
    })),
    auths: auths.map((a) => ({
      ...a,
      subject_agent: String(agent(a.subject_agent)),
      execution_id: String(exec(a.execution_id)),
      resource: String(res(a.resource)),
    })),
  };
}

function findingsRows(runId: string, cut: string, a: AnalysisResult) {
  return a.branches.map((b) => ({
    run_id: runId,
    evidence_cut: cut,
    kind: b.kind,
    status: b.status,
    severity: b.severity,
    subject_agent: b.agent,
    execution_id: b.execution,
    completeness: b.completeness,
    coverage_state: a.coverage.overall,
    belief: b.kind === 'attack' ? a.fuse.belief : 0,
    plausibility: b.kind === 'attack' ? a.fuse.plausibility : 0,
    uncertainty: b.kind === 'attack' ? a.fuse.uncertainty : 0,
    winning_hypothesis: b.kind === 'attack' ? `${a.confluence.winner.id} \u00b7 ${a.confluence.winner.label}` : null,
    narrative: b.narrative,
    matched_event_ids: b.matchedEventIds,
  }));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let body: { mode?: string; seed?: number } = {};
    if (req.method === 'POST') {
      try { body = await req.json(); } catch { body = {}; }
    }
    const mode = body.mode === 'blind' ? 'blind' : 'demo';
    const seed = mode === 'blind' ? (body.seed ?? Math.floor(Math.random() * 1e9)) : null;

    const [evRes, auRes] = await Promise.all([
      supabase.from('oba_events').select('*'),
      supabase.from('oba_authorizations').select('*'),
    ]);
    if (evRes.error) throw new Error(`telemetry read failed: ${evRes.error.message}`);
    if (auRes.error) throw new Error(`authorization read failed: ${auRes.error.message}`);

    let events = (evRes.data ?? []) as ObaEvent[];
    let auths = (auRes.data ?? []) as ObaAuthorization[];
    if (!events.length) throw new Error('no raw telemetry to analyze');

    if (mode === 'blind' && seed != null) {
      const scrambled = randomizeIdentities(events, auths, seed);
      events = scrambled.events;
      auths = scrambled.auths;
    }

    const pre = analyze(events, auths, false);
    const post = analyze(events, auths, true);
    const primaryStatus = post.branches.find((b) => b.kind === 'attack')?.status
      ?? post.branches[0]?.status ?? null;

    // Deactivate prior runs, then persist this one.
    await supabase.from('oba_analysis_runs').update({ is_active: false }).eq('is_active', true);
    const runIns = await supabase
      .from('oba_analysis_runs')
      .insert({
        label_mode: mode,
        identity_seed: seed != null ? String(seed) : null,
        engine_version: ENGINE_VERSION,
        primary_status: primaryStatus,
        is_active: true,
        notes: mode === 'blind'
          ? 'Identities randomized; no branch labels given to the engine.'
          : 'Real seeded telemetry.',
      })
      .select('run_id')
      .single();
    if (runIns.error) throw new Error(`run insert failed: ${runIns.error.message}`);
    const runId = runIns.data.run_id as string;

    const snapIns = await supabase.from('oba_analysis_snapshots').insert([
      { run_id: runId, evidence_cut: 'pre_late', payload: pre },
      { run_id: runId, evidence_cut: 'post_late', payload: post },
    ]);
    if (snapIns.error) throw new Error(`snapshot insert failed: ${snapIns.error.message}`);

    const findIns = await supabase.from('oba_findings').insert([
      ...findingsRows(runId, 'pre_late', pre),
      ...findingsRows(runId, 'post_late', post),
    ]);
    if (findIns.error) throw new Error(`findings insert failed: ${findIns.error.message}`);

    const covIns = await supabase.from('oba_coverage').insert(
      post.coverage.sources.map((sc) => ({
        run_id: runId,
        source_system: sc.source_system,
        required: sc.required,
        state: sc.state,
        observed_events: sc.observedEvents,
        detail: sc.detail,
      })),
    );
    if (covIns.error) throw new Error(`coverage insert failed: ${covIns.error.message}`);

    return new Response(
      JSON.stringify({
        run_id: runId,
        mode,
        seed,
        engine_version: ENGINE_VERSION,
        primary_status: primaryStatus,
        branches: post.branches.map((b) => ({ status: b.status, kind: b.kind, agent: b.agent, completeness: b.completeness })),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
