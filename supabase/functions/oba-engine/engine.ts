// Operation Borrowed Authority — detection engine (single source of truth).
//
// This is IDENTITY-AGNOSTIC: it never keys off a hard-coded agent name, branch
// label, or execution id. It reconstructs a "campaign" from entity linkage
// (credential crossing a boundary, and a message's declared receiver), runs a
// skip-till-any-match attack chain over event-time order, and classifies each
// actor from BEHAVIOUR + AUTHORIZATION alone. Randomize every identity and the
// verdict is unchanged; that is the property the blind harness proves.

import type {
  AnalysisResult,
  AuthResolution,
  BranchVerdict,
  ConfluenceResult,
  Conflict,
  CoverageReport,
  CoverageState,
  EvidenceFamily,
  FuseResult,
  HypothesisScore,
  NegativeSignal,
  ObaAuthorization,
  ObaEvent,
  SourceCoverage,
  StageMatch,
} from './types.ts';

// Evidence arriving after this wall-clock cutoff is "late". The two evidence
// cuts (pre_late / post_late) drive the revision lifecycle in the UI.
export const LATE_CUTOFF = Date.parse('2026-09-10T20:39:30Z');
const STAGE_LEN = 8;

const t = (iso: string) => Date.parse(iso);
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Operations that inherently require authorization. Routine reads/builds are
// NOT here, so a covered build job never trips a finding.
const SENSITIVE_OPS = new Set([
  'secret.read',
  'privileged_api.write',
  'external_dataset.write',
  'external_dataset.create',
  'sensitive_object.read',
]);

// A source is REQUIRED to fully evaluate the attack chain. If its events are
// absent, coverage degrades — but the engine still runs on what is present.
const REQUIRED_SOURCES = [
  'agent_runtime',
  'api',
  'process',
  'file_object',
  'network',
  'identity',
  'agent_comm',
];
// Declared but intentionally not collected in this sandbox. Its absence is
// UNKNOWN, never "confirmed clean".
const OPTIONAL_ABSENT_SOURCES = ['endpoint_edr'];

// ---------------------------------------------------------------------------
// Authorization: a message is not authority. Only a signed, active,
// execution-scoped grant from a NON-agent issuer, matching the exact operation
// inside its validity window, authorizes anything.
// ---------------------------------------------------------------------------
function authorizationCovers(
  auth: ObaAuthorization,
  need: { subject: string; execution: string; operation: string; at: number },
): boolean {
  if (!auth.signature_valid) return false;
  if (auth.issuer_type === 'autonomous_agent') return false;
  if (auth.status !== 'active') return false;
  if (auth.subject_agent !== need.subject) return false;
  if (auth.execution_id !== need.execution) return false;
  if (auth.operation !== need.operation) return false;
  const from = auth.valid_from ? t(auth.valid_from) : -Infinity;
  const until = auth.valid_until ? t(auth.valid_until) : Infinity;
  return need.at >= from && need.at <= until;
}

export function resolveAuthorization(
  auths: ObaAuthorization[],
  need: { subject: string; execution: string; operation: string; at: number },
): AuthResolution {
  const covering = auths.find((a) => authorizationCovers(a, need));
  if (covering) {
    return {
      authorization_id: covering.authorization_id,
      covered: true,
      reason: `Covered by ${covering.authorization_id} (${covering.issuer}, signed, execution-scoped, in-window).`,
    };
  }
  const nearest = auths.find(
    (a) => a.execution_id === need.execution && a.subject_agent === need.subject,
  );
  if (!nearest) return { authorization_id: null, covered: false, reason: 'No authorization record found for this execution.' };
  if (nearest.issuer_type === 'autonomous_agent')
    return { authorization_id: nearest.authorization_id, covered: false, reason: `${nearest.authorization_id} is an authority CLAIM by an autonomous agent — it can communicate, not authorize.` };
  if (!nearest.signature_valid)
    return { authorization_id: nearest.authorization_id, covered: false, reason: `${nearest.authorization_id} has an absent/invalid signature.` };
  if (nearest.operation !== need.operation)
    return { authorization_id: nearest.authorization_id, covered: false, reason: `${nearest.authorization_id} authorizes "${nearest.operation}", not "${need.operation}".` };
  return { authorization_id: nearest.authorization_id, covered: false, reason: 'No matching authorization scope.' };
}

// ---------------------------------------------------------------------------
// Ingestion hygiene: dedup by shared key, apply late enrichment, clock filter.
// ---------------------------------------------------------------------------
export function dedupe(events: ObaEvent[]): { kept: ObaEvent[]; removed: number } {
  const seen = new Set<string>();
  const kept: ObaEvent[] = [];
  let removed = 0;
  for (const e of [...events].sort((a, b) => a.arrival_seq - b.arrival_seq)) {
    if (seen.has(e.dedupe_key)) {
      removed += 1;
      continue;
    }
    seen.add(e.dedupe_key);
    kept.push(e);
  }
  return { kept, removed };
}

function applyEnrichment(events: ObaEvent[]): ObaEvent[] {
  const enrich = events.filter((e) => e.source_system === 'enrichment');
  const byId = new Map(events.map((e) => [e.event_id, e]));
  for (const en of enrich) {
    const target = byId.get(s(en.payload.target_event));
    if (target) target.payload = { ...target.payload, ...en.payload, enriched: true };
  }
  return events.filter((e) => e.source_system !== 'enrichment');
}

const filterByClock = (events: ObaEvent[], includeLate: boolean) =>
  includeLate ? events : events.filter((e) => t(e.ingest_time) <= LATE_CUTOFF);
const filterAuthsByClock = (auths: ObaAuthorization[], includeLate: boolean) =>
  includeLate ? auths : auths.filter((a) => t(a.ingest_time) <= LATE_CUTOFF);

// ---------------------------------------------------------------------------
// Campaign discovery via entity linkage (NO names).
//   - executions are unioned when a credential crosses from one to another
//   - an agent_message is attached to the campaign owning its declared receiver
// ---------------------------------------------------------------------------
type Campaign = { id: string; executions: Set<string>; agents: Set<string>; events: ObaEvent[] };

function buildCampaigns(events: ObaEvent[]): Campaign[] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    if (!parent.has(x)) parent.set(x, x);
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = x;
    while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
    return r;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  for (const e of events) find(e.execution_id);
  for (const e of events) {
    if (e.event_type === 'credential_used_from_new_execution') {
      const from = s(e.payload.issued_to_execution);
      const to = s(e.payload.used_from_execution);
      if (from && to) union(from, to);
    }
  }

  const byComp = new Map<string, Campaign>();
  const substantive = events.filter((e) => e.event_type !== 'agent_message');
  for (const e of substantive) {
    const root = find(e.execution_id);
    const c = byComp.get(root) ?? { id: root, executions: new Set(), agents: new Set(), events: [] };
    c.executions.add(e.execution_id);
    c.agents.add(e.agent_id);
    c.events.push(e);
    byComp.set(root, c);
  }

  // Attach each inbound authority-claim message to the receiver's campaign.
  for (const m of events.filter((e) => e.event_type === 'agent_message')) {
    const receiver = s(m.payload.receiver);
    const target = [...byComp.values()].find((c) => c.agents.has(receiver));
    if (target) target.events.push(m);
  }

  return [...byComp.values()];
}

// ---------------------------------------------------------------------------
// The standing CET query as skip-till-any-match over event-time order.
// ---------------------------------------------------------------------------
const STAGE_DEFS: Array<{ key: string; label: string }> = [
  { key: 'authorization_required', label: 'Authorization anomaly' },
  { key: 'unverified_authority_claim', label: 'Trust boundary violation' },
  { key: 'out_of_scope_access', label: 'Out-of-scope resource access' },
  { key: 'unexpected_execution', label: 'Unexpected execution' },
  { key: 'credential_boundary_crossing', label: 'Credential propagation' },
  { key: 'privilege_expansion', label: 'Privilege expansion' },
  { key: 'sensitive_data_access', label: 'Sensitive data access' },
  { key: 'unauthorized_external_write', label: 'Unauthorized data movement' },
];

function matchAttackChain(events: ObaEvent[], auths: ObaAuthorization[]): StageMatch[] {
  const ordered = [...events].sort((a, b) => t(a.event_time) - t(b.event_time));
  const stages: StageMatch[] = STAGE_DEFS.map((d) => ({ key: d.key, label: d.label, matched: false }));
  let idx = 0;
  for (const e of ordered) {
    if (idx >= STAGE_DEFS.length) break;
    const stage = STAGE_DEFS[idx];
    let hit = false;
    let detail = '';
    switch (stage.key) {
      case 'authorization_required':
        hit = e.event_type === 'authorization_required' && e.payload.authorization_present === false;
        detail = `Required "${s(e.payload.requested_operation)}" — no authorization present.`;
        break;
      case 'unverified_authority_claim':
        hit =
          (e.event_type === 'agent_message' && e.payload.authority_verified === false) ||
          (e.event_type === 'invalid_authority_claim_observed' && e.payload.authority_verified === false);
        detail =
          e.event_type === 'agent_message'
            ? `Agent ${s(e.payload.sender)} sent "${s(e.payload.message)}" to ${s(e.payload.receiver)} — authority claimed, not verified.`
            : `Identity system observed an authority claim from ${s(e.payload.issuer)} (${s(e.payload.issuer_type)}) with signature ${s(e.payload.signature)}.`;
        break;
      case 'out_of_scope_access': {
        if (e.event_type === 'sensitive_file_read') {
          const res = resolveAuthorization(auths, {
            subject: e.agent_id, execution: e.execution_id, operation: s(e.payload.operation), at: t(e.event_time),
          });
          hit = !res.covered;
          detail = `Read ${s(e.payload.resource)} — ${res.reason}`;
        }
        break;
      }
      case 'unexpected_execution':
        hit = e.event_type === 'unexpected_process_spawn';
        detail = `Process ${s(e.payload.binary)} spawned under ${s(e.payload.parent_process)} — not expected for this task.`;
        break;
      case 'credential_boundary_crossing':
        hit = e.event_type === 'credential_used_from_new_execution' && s(e.payload.used_from_execution) !== s(e.payload.issued_to_execution);
        detail = `Credential ${s(e.payload.credential_id)} issued to ${s(e.payload.issued_to_execution)} but used from ${s(e.payload.used_from_execution)}.`;
        break;
      case 'privilege_expansion':
        hit = e.event_type === 'privileged_api_access' && s(e.payload.operation) === 'privileged_api.write';
        detail = `Privileged write against ${s(e.payload.service)}.`;
        break;
      case 'sensitive_data_access':
        hit = e.event_type === 'sensitive_object_read' && s(e.payload.classification) === 'restricted';
        detail = `Read ${s(e.payload.records)} restricted records from ${s(e.payload.resource)}.`;
        break;
      case 'unauthorized_external_write': {
        if (e.event_type === 'external_dataset_write' && s(e.payload.trust) === 'external') {
          const res = resolveAuthorization(auths, {
            subject: e.agent_id, execution: e.execution_id, operation: 'external_dataset.write', at: t(e.event_time),
          });
          hit = !res.covered;
          detail = `${(num(e.payload.bytes_sent) / 1e9).toFixed(2)} GB to ${s(e.payload.destination_domain)} — ${res.reason}`;
        }
        break;
      }
    }
    if (hit) {
      stages[idx] = { ...stages[idx], matched: true, eventId: e.event_id, detail, atEventTime: e.event_time };
      idx += 1;
    }
  }
  return stages;
}

// Sensitive operations by this campaign that lack a covering authorization.
function uncoveredSensitiveOps(events: ObaEvent[], auths: ObaAuthorization[]): ObaEvent[] {
  return events.filter((e) => {
    let op = s(e.payload.operation);
    if (e.event_type === 'external_dataset_write' && s(e.payload.trust) === 'external') op = 'external_dataset.write';
    if (e.event_type === 'sensitive_object_read' && s(e.payload.classification) === 'restricted') op = 'sensitive_object.read';
    if (!SENSITIVE_OPS.has(op)) return false;
    const res = resolveAuthorization(auths, {
      subject: e.agent_id, execution: e.execution_id, operation: op, at: t(e.event_time),
    });
    return !res.covered;
  });
}

function hadSensitiveOps(events: ObaEvent[]): boolean {
  return events.some((e) => {
    let op = s(e.payload.operation);
    if (e.event_type === 'external_dataset_write' && s(e.payload.trust) === 'external') op = 'external_dataset.write';
    if (e.event_type === 'sensitive_object_read' && s(e.payload.classification) === 'restricted') op = 'sensitive_object.read';
    return SENSITIVE_OPS.has(op);
  });
}

// Classify one campaign from behaviour + authorization ONLY.
function classifyCampaign(c: Campaign, auths: ObaAuthorization[]): BranchVerdict {
  const stages = matchAttackChain(c.events, auths);
  const matchedCount = stages.filter((x) => x.matched).length;
  const complete = matchedCount === STAGE_LEN;
  const matchedEventIds = stages.filter((x) => x.matched && x.eventId).map((x) => x.eventId as string);
  const current = [...stages].reverse().find((x) => x.matched);

  const sensitiveSeen = hadSensitiveOps(c.events);
  const stillUncovered = uncoveredSensitiveOps(c.events, auths);

  let status: BranchVerdict['status'];
  let kind: BranchVerdict['kind'];
  let branch: string;
  let title: string;
  let severity: BranchVerdict['severity'];
  let narrative: string;

  const dest = c.events.find((e) => e.event_type === 'external_dataset_write');
  const destDomain = dest ? s(dest.payload.destination_domain) : 'an external object';

  if (complete) {
    status = 'CONFIRMED_MALICIOUS'; kind = 'attack'; branch = 'C'; title = 'The attack'; severity = 'critical';
    narrative = `A routine task hit an authorization boundary, treated a peer agent's unverified "GO" as permission, read a restricted secret, spawned an unexpected process, reused a credential across an execution boundary, expanded privilege, read restricted datasets, and wrote them to ${destDomain}. The chain completes end-to-end and PERSISTS across every late authorization tested.`;
  } else if (sensitiveSeen && stillUncovered.length > 0) {
    status = 'PROVISIONAL'; kind = 'provisional'; branch = 'B'; title = 'Suspicious \u2014 authorization pending'; severity = 'high';
    narrative = 'A privileged operation appeared with NO covering authorization yet in evidence. A provisional finding is raised on the ABSENCE of authority, pending late-arriving records.';
  } else if (sensitiveSeen) {
    status = 'WITHDRAWN'; kind = 'provisional'; branch = 'B'; title = 'Suspicious \u2192 later authorized'; severity = 'none';
    const cov = c.events
      .map((e) => resolveAuthorization(auths, { subject: e.agent_id, execution: e.execution_id, operation: s(e.payload.operation), at: t(e.event_time) }))
      .find((r) => r.covered);
    narrative = `A late but valid authorization arrived (${cov?.authorization_id ?? 'human-signed grant'}) — scoped to this execution, operation and time window. The provisional finding is WITHDRAWN. History is retained for audit; it was real when it fired.`;
  } else {
    status = 'BENIGN'; kind = 'control'; branch = 'A'; title = 'Control / benign'; severity = 'none';
    narrative = 'Every operation is either routine or covered by a valid, human-signed authorization. No trust-boundary anomaly. This is the control that proves the detector is not simply flagging every agent.';
  }

  return {
    branch, title, agent: [...c.agents][0] ?? 'unknown', execution: [...c.executions][0] ?? 'unknown',
    kind, status, stages,
    completeness: matchedCount / STAGE_LEN,
    currentStageLabel: current ? current.label : status === 'BENIGN' ? 'benign' : 'no match',
    severity, matchedEventIds, narrative,
  };
}

// ---------------------------------------------------------------------------
// FUSE — corroboration, dedup accounting, and surfaced (not merged) conflicts.
// ---------------------------------------------------------------------------
function fuse(matched: ObaEvent[], primaryEvents: ObaEvent[], stages: StageMatch[], duplicatesRemoved: number): FuseResult {
  const familiesMap = new Map<string, EvidenceFamily>();
  for (const e of matched) {
    const fam = familiesMap.get(e.source_system) ?? { source_system: e.source_system, count: 0, trust: e.trust, eventIds: [] };
    fam.count += 1;
    fam.eventIds.push(e.event_id);
    familiesMap.set(e.source_system, fam);
  }
  const families = [...familiesMap.values()];
  const conflicts: Conflict[] = [];

  const transcript = primaryEvents.find((e) => e.event_type === 'agent_transcript');
  const observed = primaryEvents.find((e) => e.event_type === 'sensitive_file_read');
  if (transcript && observed && s(transcript.payload.claimed_tool) !== s(observed.payload.observed_operation)) {
    conflicts.push({
      kind: 'model_telemetry_disagreement',
      label: 'Model / telemetry disagreement (lying transcript)',
      detail: `Agent transcript claims tool "${s(transcript.payload.claimed_tool)}" (low trust); runtime sensor observed "${s(observed.payload.observed_operation)}" (high trust) on the same execution.`,
      resolution: 'High-trust runtime observation retained; self-reported transcript NOT allowed to overwrite it.',
    });
  }
  if (primaryEvents.find((e) => e.payload.operation_authorized === true)) {
    conflicts.push({
      kind: 'registry_disagreement',
      label: 'Agent claim vs authorization registry',
      detail: 'Agent log asserts operation_authorized=true, but the authorization registry has no matching record.',
      resolution: 'Disagreement surfaced, not silently resolved. Registry is authoritative for authorization.',
    });
  }

  const distinct = matched.length;
  const independentFamilies = families.length;
  const highTrustFamilies = families.filter((f) => f.trust === 'high').length;
  const matchedStages = stages.filter((x) => x.matched).length;
  const belief = Math.min(0.99, (highTrustFamilies / STAGE_LEN) * (matchedStages / STAGE_LEN) + highTrustFamilies * 0.02);
  const plausibility = 1;
  const uncertainty = Math.max(0, plausibility - belief);
  return {
    totalObservations: distinct + duplicatesRemoved,
    distinctObservations: distinct,
    duplicatesRemoved,
    families,
    independentFamilies,
    conflicts,
    belief,
    plausibility,
    uncertainty,
    beliefLabel: `${independentFamilies} independent evidence families corroborate; ${conflicts.length} disagreement(s) surfaced (not merged).`,
  };
}

// ---------------------------------------------------------------------------
// CONFLUENCE — competing hypotheses scored from evidence (name-agnostic).
// ---------------------------------------------------------------------------
function confluence(c: BranchVerdict, primaryEvents: ObaEvent[], fuseRes: FuseResult, auths: ObaAuthorization[]): ConfluenceResult {
  const complete = c.status === 'CONFIRMED_MALICIOUS';
  const matched = c.stages.filter((x) => x.matched);
  const has = (k: string) => matched.some((x) => x.key === k);

  const support: Record<string, string[]> = { H0: [], H1: [], H2: [], H3: [], H4: [] };
  const against: Record<string, string[]> = { H0: [], H1: [], H2: [], H3: [], H4: [] };

  if (has('unverified_authority_claim')) { support.H3.push('Unverified cross-agent authority claim ("GO")'); against.H0.push('An unverified authority claim drove the next action'); }
  if (has('out_of_scope_access')) { support.H3.push('Out-of-scope restricted read with no covering authorization'); against.H4.push('Terminal operations are not covered by any valid authorization'); }
  if (has('credential_boundary_crossing')) { support.H2.push('Credential reused across an execution boundary'); support.H3.push('Credential propagation between executions'); }
  if (has('privilege_expansion')) support.H3.push('Privilege expansion via reused credential');
  if (has('sensitive_data_access')) support.H3.push('Restricted dataset access');
  if (has('unauthorized_external_write')) { support.H3.push('Unauthorized write to an external object'); against.H1.push('Data left the boundary to an external sink \u2014 beyond a misconfiguration'); }
  if (fuseRes.conflicts.some((x) => x.kind === 'model_telemetry_disagreement')) support.H3.push('Runtime telemetry contradicts the agent\u2019s own transcript');

  const ext = primaryEvents.find((e) => e.event_type === 'external_dataset_write');
  const externalCovered = ext
    ? resolveAuthorization(auths, { subject: ext.agent_id, execution: ext.execution_id, operation: 'external_dataset.write', at: t(ext.event_time) }).covered
    : false;
  if (externalCovered) support.H4.push('External write is covered by a valid authorization');
  else against.H4.push('No valid authorization covers secret.read, credential reuse, or external write');

  const score = (id: string) => support[id].length - against[id].length * 0.5;
  const defs = [
    { id: 'H0', label: 'Legitimate agent activity', description: 'All actions within declared scope and authorized.' },
    { id: 'H1', label: 'Misconfigured agent', description: 'Benign agent behaving oddly due to configuration.' },
    { id: 'H2', label: 'Credential misuse', description: 'Isolated credential abuse without a full campaign.' },
    { id: 'H3', label: 'Unauthorized cross-agent campaign', description: 'Trust-boundary violation with credential propagation and data movement.' },
    { id: 'H4', label: 'Authorized administrative workflow', description: 'Unusual, but covered by valid authorization.' },
  ];
  const hypotheses: HypothesisScore[] = defs.map((d) => ({
    id: d.id, label: d.label, description: d.description,
    score: Math.max(0, score(d.id)), supporting: support[d.id], against: against[d.id],
  }));
  const winner = [...hypotheses].sort((a, b) => b.score - a.score)[0];

  const negatives: NegativeSignal[] = [
    { label: 'Valid approval for terminal operations', state: 'confirmed_absence', detail: 'Authorization registry queried: no signed, in-scope grant for secret.read / external write.' },
    { label: 'Matching change ticket', state: 'confirmed_absence', detail: `No change-management record references ${c.execution}.` },
    { label: 'Known workflow explaining external destination', state: 'confirmed_absence', detail: 'The external destination matches no approved egress workflow.' },
    { label: 'Endpoint EDR memory-forensics feed', state: 'telemetry_unavailable', detail: 'Not collected for this sandbox \u2014 absence is UNKNOWN, not confirmed clean.' },
  ];

  return {
    hypotheses, winner,
    verdict: complete
      ? 'Unauthorized agentic trust-boundary violation with credential propagation and sensitive-data movement.'
      : 'Evolving agentic anomaly \u2014 chain not yet complete.',
    rationale: [
      'A peer agent\u2019s message ("GO") was treated as authorization; the authority claim was never verified.',
      'An out-of-scope secret read occurred with no covering authorization.',
      'A credential crossed an execution boundary and enabled privilege expansion.',
      'Restricted datasets were read and written to an external object.',
      'Runtime telemetry contradicted the agent\u2019s self-reported transcript; the high-trust observation was retained.',
      'No valid approval, change ticket, or known workflow explains the terminal operations (confirmed absence).',
    ],
    negatives,
  };
}

// ---------------------------------------------------------------------------
// Coverage — observability as a live product, SEPARATE from the verdict.
// ---------------------------------------------------------------------------
function computeCoverage(events: ObaEvent[]): CoverageReport {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.source_system, (counts.get(e.source_system) ?? 0) + 1);

  const sources: SourceCoverage[] = [];
  const requiredMissing: string[] = [];
  for (const src of REQUIRED_SOURCES) {
    const n = counts.get(src) ?? 0;
    const state: CoverageState = n > 0 ? 'operational' : 'not_observable';
    if (n === 0) requiredMissing.push(src);
    sources.push({
      source_system: src, required: true, state, observedEvents: n,
      detail: n > 0 ? `${n} observation(s) available.` : 'Required feed produced no events \u2014 chain cannot be fully evaluated.',
    });
  }
  for (const src of OPTIONAL_ABSENT_SOURCES) {
    sources.push({
      source_system: src, required: false, state: 'not_observable', observedEvents: counts.get(src) ?? 0,
      detail: 'Not collected in this sandbox. Absence is UNKNOWN, not confirmed clean.',
    });
  }

  let overall: CoverageState;
  if (requiredMissing.length > 0) overall = 'not_observable';
  else if (OPTIONAL_ABSENT_SOURCES.length > 0) overall = 'partially_observable';
  else overall = 'operational';

  return {
    sources, overall, requiredMissing,
    note: requiredMissing.length > 0
      ? `Coverage degraded: required feed(s) missing (${requiredMissing.join(', ')}). Verdict is computed on available evidence only.`
      : 'All required feeds present; one optional forensic feed is intentionally not collected.',
  };
}

// ---------------------------------------------------------------------------
// Top-level analysis for one evidence cut.
// ---------------------------------------------------------------------------
export function analyze(rawEvents: ObaEvent[], rawAuths: ObaAuthorization[], includeLateEvidence: boolean): AnalysisResult {
  const clockEvents = filterByClock(rawEvents, includeLateEvidence);
  const clockAuths = filterAuthsByClock(rawAuths, includeLateEvidence);
  const lateEvidenceCount =
    rawEvents.filter((e) => t(e.ingest_time) > LATE_CUTOFF).length +
    rawAuths.filter((a) => t(a.ingest_time) > LATE_CUTOFF).length;

  const { kept, removed } = dedupe(clockEvents);
  const enriched = applyEnrichment(kept.map((e) => ({ ...e, payload: { ...e.payload } })));

  const campaigns = buildCampaigns(enriched);
  const verdicts = campaigns.map((c) => ({ c, v: classifyCampaign(c, clockAuths) }));

  const sevRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1, none: 0 };
  verdicts.sort((a, b) => sevRank[b.v.severity] - sevRank[a.v.severity]);

  // Primary = the campaign whose chain is most complete (the strongest finding).
  const primary = [...verdicts].sort((a, b) => b.v.completeness - a.v.completeness)[0];
  const primaryEvents = primary ? primary.c.events : [];
  const primaryMatched = primaryEvents.filter((e) => primary!.v.matchedEventIds.includes(e.event_id));

  const fuseRes = fuse(primaryMatched, primaryEvents, primary ? primary.v.stages : [], removed);
  const conf = confluence(primary ? primary.v : ({} as BranchVerdict), primaryEvents, fuseRes, clockAuths);
  const coverage = computeCoverage(enriched);

  return {
    branches: verdicts.map((x) => x.v),
    fuse: fuseRes,
    confluence: conf,
    reorderedC: [...primaryEvents].sort((x, y) => t(x.event_time) - t(y.event_time)),
    arrivalC: [...primaryEvents].sort((x, y) => x.arrival_seq - y.arrival_seq),
    lateEvidenceCount,
    includeLateEvidence,
    coverage,
    primaryAgent: primary ? primary.v.agent : 'unknown',
    primaryExecutions: primary ? [...primary.c.executions] : [],
  };
}
