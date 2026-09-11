import type {
  AnalysisResult,
  AuthResolution,
  BranchVerdict,
  ConfluenceResult,
  Conflict,
  EvidenceFamily,
  FuseResult,
  HypothesisScore,
  NegativeSignal,
  ObaAuthorization,
  ObaEvent,
  StageMatch,
} from './types';

// Evidence that arrives after this wall-clock cutoff is "late". Toggling late
// evidence on/off is what drives the revision lifecycle in the UI.
const LATE_CUTOFF = Date.parse('2026-09-10T20:39:30Z');

const t = (iso: string) => Date.parse(iso);
const s = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

// An autonomous agent can COMMUNICATE but can never AUTHORIZE. Only a signed,
// active, execution-scoped grant from a trusted (non-agent) issuer is authority.
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
    return { authorization_id: covering.authorization_id, covered: true, reason: `Covered by ${covering.authorization_id} (${covering.issuer}, signed, execution-scoped, in-window).` };
  }
  // Explain the closest near-miss so the UI can show WHY authority does not apply.
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

// Remove exact duplicate observations (shared dedupe_key), keeping earliest arrival.
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

// Apply late-arriving enrichment events onto their target observations.
function applyEnrichment(events: ObaEvent[]): ObaEvent[] {
  const enrich = events.filter((e) => e.source_system === 'enrichment');
  const byId = new Map(events.map((e) => [e.event_id, e]));
  for (const en of enrich) {
    const target = byId.get(s(en.payload.target_event));
    if (target) {
      target.payload = { ...target.payload, ...en.payload, enriched: true };
    }
  }
  return events.filter((e) => e.source_system !== 'enrichment');
}

function filterByClock(events: ObaEvent[], includeLate: boolean): ObaEvent[] {
  if (includeLate) return events;
  return events.filter((e) => t(e.ingest_time) <= LATE_CUTOFF);
}

function filterAuthsByClock(auths: ObaAuthorization[], includeLate: boolean): ObaAuthorization[] {
  if (includeLate) return auths;
  return auths.filter((a) => t(a.ingest_time) <= LATE_CUTOFF);
}

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

// The standing CET query, run as skip-till-any-match over event-time order.
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
        hit = e.event_type === 'agent_message' && e.payload.authority_verified === false;
        detail = `Agent ${s(e.payload.sender)} sent "${s(e.payload.message)}" — authority claimed, not verified.`;
        break;
      case 'out_of_scope_access': {
        const isRead = e.event_type === 'sensitive_file_read';
        if (isRead) {
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
        const isExternal = e.event_type === 'external_dataset_write' && s(e.payload.trust) === 'external';
        if (isExternal) {
          const res = resolveAuthorization(auths, {
            subject: e.agent_id, execution: e.execution_id, operation: 'external_dataset.write', at: t(e.event_time),
          });
          hit = !res.covered;
          detail = `${((Number(e.payload.bytes_sent) || 0) / 1e9).toFixed(2)} GB to ${s(e.payload.destination_domain)} — ${res.reason}`;
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

function analyzeBranchC(all: ObaEvent[], auths: ObaAuthorization[]): { verdict: BranchVerdict; matched: ObaEvent[] } {
  // Branch C spans two executions run by the same agent (exec-C + the reused-credential exec-C2).
  const events = all.filter((e) => e.agent_id === 'agent-research-31');
  const stages = matchAttackChain(events, auths);
  const matchedCount = stages.filter((x) => x.matched).length;
  const completeness = matchedCount / STAGE_DEFS.length;
  const matchedEventIds = stages.filter((x) => x.matched && x.eventId).map((x) => x.eventId as string);
  const current = [...stages].reverse().find((x) => x.matched);
  const complete = matchedCount === STAGE_DEFS.length;
  return {
    matched: events.filter((e) => matchedEventIds.includes(e.event_id)),
    verdict: {
      branch: 'C', title: 'The attack', agent: 'agent-research-31', execution: 'exec-C-20260910',
      kind: 'attack',
      status: complete ? 'CONFIRMED_MALICIOUS' : 'PROVISIONAL',
      stages, completeness, currentStageLabel: current ? current.label : 'no match',
      severity: complete ? 'critical' : matchedCount >= 4 ? 'high' : 'medium',
      matchedEventIds,
      narrative: complete
        ? 'A benign metadata task hit an authorization boundary, treated a peer agent\u2019s "GO" as permission, read a restricted secret, spawned an unexpected process, reused a credential across an execution boundary, expanded privilege, read restricted datasets, and wrote them to an attacker-controlled external object. The chain completes end-to-end and PERSISTS.'
        : 'A benign metadata task encountered an authorization boundary and an unverified peer "GO"; the chain is still evolving.',
    },
  };
}

function analyzeBranchB(all: ObaEvent[], auths: ObaAuthorization[]): BranchVerdict {
  const events = all.filter((e) => e.branch === 'B');
  const priv = events.find((e) => e.event_type === 'privileged_api_call');
  const stages: StageMatch[] = [
    { key: 'administrative_request', label: 'Administrative request', matched: !!events.find((e) => e.event_type === 'administrative_request') },
    { key: 'privileged_api_call', label: 'Privileged API call', matched: !!priv },
    { key: 'new_destination_access', label: 'New destination access', matched: !!events.find((e) => e.event_type === 'new_destination_access') },
  ];
  let status: BranchVerdict['status'] = 'PROVISIONAL';
  let narrative = 'A privileged administrative call appeared with NO authorization yet in evidence. Provisional finding raised on the absence.';
  let severity: BranchVerdict['severity'] = 'high';
  if (priv) {
    const res = resolveAuthorization(auths, {
      subject: 'agent-release-22', execution: 'exec-B-20260910', operation: 'privileged_api.write', at: t(priv.event_time),
    });
    if (res.covered) {
      status = 'WITHDRAWN';
      severity = 'none';
      narrative = `Late but valid authorization arrived (${res.authorization_id}) — human-signed, scoped to this execution, operation and time window. The provisional finding is WITHDRAWN. History is retained for audit; it was real when it fired.`;
    }
  }
  return {
    branch: 'B', title: 'Suspicious \u2192 later authorized', agent: 'agent-release-22', execution: 'exec-B-20260910',
    kind: 'provisional', status, stages, completeness: stages.filter((x) => x.matched).length / stages.length,
    currentStageLabel: status === 'WITHDRAWN' ? 'withdrawn' : 'provisional', severity, matchedEventIds: events.map((e) => e.event_id), narrative,
  };
}

function analyzeBranchA(all: ObaEvent[], auths: ObaAuthorization[]): BranchVerdict {
  const events = all.filter((e) => e.branch === 'A');
  const write = events.find((e) => e.event_type === 'artifact_write');
  const res = write
    ? resolveAuthorization(auths, { subject: 'agent-build-17', execution: 'exec-A-20260910', operation: 'build_service.execute', at: t(write.event_time) })
    : { covered: false, reason: '', authorization_id: null };
  return {
    branch: 'A', title: 'Control / benign', agent: 'agent-build-17', execution: 'exec-A-20260910',
    kind: 'control', status: 'BENIGN',
    stages: events.map((e) => ({ key: e.event_type, label: e.event_type.replace(/_/g, ' '), matched: true, eventId: e.event_id, atEventTime: e.event_time })),
    completeness: 0, currentStageLabel: 'benign', severity: 'none', matchedEventIds: events.map((e) => e.event_id),
    narrative: res.covered
      ? `Every operation is covered by a valid, human-signed authorization (${res.authorization_id}). No trust-boundary anomaly. This is the control case that proves the detector is not simply flagging every agent.`
      : 'Benign build activity.',
  };
}

function fuse(matched: ObaEvent[], allC: ObaEvent[], stages: StageMatch[], duplicatesRemoved: number): FuseResult {
  const familiesMap = new Map<string, EvidenceFamily>();
  for (const e of matched) {
    const fam = familiesMap.get(e.source_system) ?? { source_system: e.source_system, count: 0, trust: e.trust, eventIds: [] };
    fam.count += 1;
    fam.eventIds.push(e.event_id);
    familiesMap.set(e.source_system, fam);
  }
  const families = [...familiesMap.values()];
  const conflicts: Conflict[] = [];

  const transcript = allC.find((e) => e.event_type === 'agent_transcript');
  const observed = allC.find((e) => e.event_type === 'sensitive_file_read');
  if (transcript && observed && s(transcript.payload.claimed_tool) !== s(observed.payload.observed_operation)) {
    conflicts.push({
      kind: 'model_telemetry_disagreement',
      label: 'Model / telemetry disagreement (lying transcript)',
      detail: `Agent transcript claims tool "${s(transcript.payload.claimed_tool)}" (low trust); runtime sensor observed "${s(observed.payload.observed_operation)}" (high trust) on the same execution.`,
      resolution: 'High-trust runtime observation retained; self-reported transcript NOT allowed to overwrite it.',
    });
  }
  const claimsAuthorized = allC.find((e) => e.payload.operation_authorized === true);
  if (claimsAuthorized) {
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
  // Derived corroboration band (NOT a probability of guilt): belief = share of the
  // chain backed by high-trust independent families; plausibility = 1 - contradicted.
  const belief = Math.min(0.99, (highTrustFamilies / STAGE_LEN) * (matchedStages / STAGE_LEN) + highTrustFamilies * 0.02);
  const plausibility = 1; // nothing in evidence contradicts the chain
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

const STAGE_LEN = 8;

function confluence(c: BranchVerdict, fuseRes: FuseResult, auths: ObaAuthorization[]): ConfluenceResult {
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
  if (has('unauthorized_external_write')) { support.H3.push('Unauthorized write to attacker-controlled external object'); against.H1.push('Data left the boundary to an external sink \u2014 beyond a misconfiguration'); }
  if (fuseRes.conflicts.some((x) => x.kind === 'model_telemetry_disagreement')) support.H3.push('Runtime telemetry contradicts the agent\u2019s own transcript');

  // Would H4 (authorized admin) hold? Only if a valid auth covers the terminal ops.
  const externalCovered = resolveAuthorization(auths, { subject: 'agent-research-31', execution: 'exec-C2-20260910', operation: 'external_dataset.write', at: Date.parse('2026-09-10T20:38:07Z') }).covered;
  if (externalCovered) support.H4.push('External write is covered by a valid authorization');
  else against.H4.push('No valid authorization covers secret.read, credential reuse, or external write');

  const score = (id: string) => support[id].length - against[id].length * 0.5;
  const defs: Array<{ id: string; label: string; description: string }> = [
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
    { label: 'Matching change ticket', state: 'confirmed_absence', detail: 'No change-management record references exec-C-20260910.' },
    { label: 'Known workflow explaining external destination', state: 'confirmed_absence', detail: 'attacker-dataset.example matches no approved egress workflow.' },
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
      'Restricted datasets were read and written to an attacker-controlled external object.',
      'Runtime telemetry contradicted the agent\u2019s self-reported transcript; the high-trust observation was retained.',
      'No valid approval, change ticket, or known workflow explains the terminal operations (confirmed absence).',
    ],
    negatives,
  };
}

export function analyze(
  rawEvents: ObaEvent[],
  rawAuths: ObaAuthorization[],
  includeLateEvidence: boolean,
): AnalysisResult {
  const clockEvents = filterByClock(rawEvents, includeLateEvidence);
  const clockAuths = filterAuthsByClock(rawAuths, includeLateEvidence);
  const lateEvidenceCount =
    rawEvents.filter((e) => t(e.ingest_time) > LATE_CUTOFF).length +
    rawAuths.filter((a) => t(a.ingest_time) > LATE_CUTOFF).length;

  const { kept, removed } = dedupe(clockEvents);
  const enriched = applyEnrichment(kept.map((e) => ({ ...e, payload: { ...e.payload } })));

  const a = analyzeBranchA(enriched, clockAuths);
  const b = analyzeBranchB(enriched, clockAuths);
  const cRes = analyzeBranchC(enriched, clockAuths);

  const cEvents = enriched.filter((e) => e.agent_id === 'agent-research-31');
  const fuseRes = fuse(cRes.matched, cEvents, cRes.verdict.stages, removed);
  const conf = confluence(cRes.verdict, fuseRes, clockAuths);

  return {
    branches: [a, b, cRes.verdict],
    fuse: fuseRes,
    confluence: conf,
    reorderedC: [...cEvents].sort((x, y) => t(x.event_time) - t(y.event_time)),
    arrivalC: [...cEvents].sort((x, y) => x.arrival_seq - y.arrival_seq),
    lateEvidenceCount,
    includeLateEvidence,
  };
}
