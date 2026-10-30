import type {
  AccessResource, AnswerHistoryItem, AnswerResult, AnswerBody, AttackPath, FederationFinding, FederationOverview, GroupDetail,
  GroupSummary, IdentityDetail, IdentitySummary, IdentityTimelineData, NonHuman, Overview, RemediationAck, RemediationDetail,
  RemediationList, RemediationStage, ReviewItem, RiskBand, RiskDetail, RiskScore, ScenarioChange, StewardDecision,
  TimelineFinding, TimelineIdentity, TimelineStats, TrustDetail, WhatIfOptions, WhatIfResult, WhatIfScenario, LiveFeed,
} from './identityTypes';
import { parse, type AnswerCatalog } from './identityAnswerParser';
import { simulate, validateChanges, type SimInputs } from './identityWhatIfEngine';
import { createLiveDemo, type LiveDemo } from './identityLiveDemo';

export * from './identityTypes';

interface RunAck {
  scenario_id: string;
  triggered: boolean;
  run_id?: number | null;
  reason?: string | null;
}

interface PreviewData {
  overview: Overview;
  identities: { identities: IdentitySummary[]; total: number };
  details: Record<string, IdentityDetail>;
  reviews: { reviews: ReviewItem[]; recent_decisions: StewardDecision[] };
  nhi: { nhis: NonHuman[] };
  timeline: { identities: TimelineIdentity[]; stats: TimelineStats | null };
  timelineFindings: { findings: TimelineFinding[] };
  timelines: Record<string, IdentityTimelineData>;
  risk: {
    scores: RiskScore[];
    total: number;
    bands: Partial<Record<RiskBand, number>>;
    meta: { scored_at: string | null; weights_version: string | null; access_version: string | null } | null;
  };
  riskDetails: Record<string, RiskDetail>;
  graphResources: { resources: AccessResource[]; meta: { edges: number; access_version: string | null; updated_at: string | null } | null };
  graphPaths: { paths: AttackPath[] };
  groups: { groups: GroupSummary[] };
  groupDetails: Record<string, GroupDetail>;
  whatifScenarios: { scenarios: WhatIfScenario[]; current_access_version: string | null };
  whatifDetails: Record<string, { scenario: WhatIfScenario; result: WhatIfResult | null }>;
  whatifOptions: WhatIfOptions;
  whatifInputs: SimInputs;
  federation: FederationOverview;
  trustDetails: Record<string, TrustDetail>;
  federationFindings: { findings: FederationFinding[] };
  remediation: Record<RemediationStage, RemediationList>;
  remediationDetails: Record<string, RemediationDetail>;
  answerCatalog: AnswerCatalog;
  answers: Record<string, AnswerBody>;
  answersAsOf: string | null;
}

const PREVIEW_URL = '/identity-preview.json';
const READ_ONLY = 'This is the preview with sample data. Running jobs and saving changes happens in the Databricks workspace.';
const SIGNED_STEPS = 'This is the preview with sample data. Requests, approvals and rollbacks are signed by real people in the Databricks app, and nobody can approve their own request.';
const askedHere: AnswerHistoryItem[] = [];

let cache: Promise<PreviewData> | null = null;

function load(): Promise<PreviewData> {
  if (!cache) {
    cache = fetch(PREVIEW_URL)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Sample identity data could not be loaded (${res.status})`);
        const body: unknown = await res.json();
        if (!body || typeof body !== 'object' || !('overview' in body)) throw new Error('Sample identity data is malformed');
        return body as PreviewData;
      })
      .catch((e) => {
        cache = null;
        throw e;
      });
  }
  return cache;
}

const SCENARIO_STORE = 'identity-preview-scenarios-v1';
const EVALUATE_MS = 2600;

interface StoredScenario { scenario: WhatIfScenario; result: WhatIfResult | null; ready_at: number }

function storedScenarios(): Record<string, StoredScenario> {
  try {
    const raw = JSON.parse(localStorage.getItem(SCENARIO_STORE) || '{}');
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  } catch {
    return {};
  }
}

function saveScenarios(all: Record<string, StoredScenario>) {
  try {
    localStorage.setItem(SCENARIO_STORE, JSON.stringify(all));
  } catch {
    throw new Error('This browser would not let the preview save your scenario. Free some site storage and try again.');
  }
}

function evaluate(d: PreviewData, scenario: WhatIfScenario): StoredScenario {
  const ready = Date.now() + EVALUATE_MS;
  try {
    return { scenario: { ...scenario, status: 'pending', error: null }, result: simulate(d.whatifInputs, scenario.changes || []), ready_at: ready };
  } catch (e) {
    return { scenario: { ...scenario, status: 'failed', error: (e as Error).message, evaluated_at: new Date(ready).toISOString() }, result: null, ready_at: ready };
  }
}

function settled(s: StoredScenario, accessVersion: string): { scenario: WhatIfScenario; result: WhatIfResult | null } {
  if (s.scenario.status === 'failed') return { scenario: s.scenario, result: null };
  if (Date.now() < s.ready_at) return { scenario: { ...s.scenario, status: 'pending', summary: null }, result: null };
  const evaluated_at = new Date(s.ready_at).toISOString();
  return {
    scenario: { ...s.scenario, status: 'done', evaluated_at, summary: s.result?.summary ?? null, access_version: accessVersion },
    result: s.result ? ({ ...s.result, access_version: accessVersion, evaluated_at } as WhatIfResult) : null,
  };
}

let demo: LiveDemo | null = null;
function liveDemo(d: PreviewData): LiveDemo {
  if (!demo) {
    demo = createLiveDemo(d.graphPaths.paths, d.whatifInputs.xrefs, d.whatifOptions.groups.filter((g) => !g.privileged).map((g) => g.name),
      d.timeline.stats?.events ?? 0);
  }
  return demo;
}

async function read<T>(pick: (d: PreviewData) => T | undefined): Promise<T> {
  const value = pick(await load());
  if (value === undefined) throw new Error('Not found');
  return structuredClone(value);
}

const has = (q: string, ...values: (string | null | undefined)[]) => values.some((v) => (v || '').toLowerCase().includes(q));

function accountsMatch(d: PreviewData, id: string, q: string, fields: ('username' | 'upn' | 'email' | 'employee_id' | 'provider_object_id')[]) {
  return (d.details[id]?.accounts || []).some((a) => fields.some((f) => has(q, (a as unknown as Record<string, string | null>)[f])));
}

export const identityApi = {
  overview: async () => {
    const d = await load();
    return liveDemo(d).grow(structuredClone(d.overview));
  },
  liveEvents: async (): Promise<LiveFeed> => liveDemo(await load()).feed(),
  identities: async (p: { search?: string; principal_type?: string; conflicts_only?: boolean; limit?: number; offset?: number }) => {
    const d = await load();
    const q = (p.search || '').trim().toLowerCase();
    const rows = d.identities.identities.filter((i) =>
      (!p.principal_type || i.principal_type === p.principal_type) &&
      (!p.conflicts_only || i.state_conflict) &&
      (!q || has(q, i.display_name) || accountsMatch(d, i.canonical_id, q, ['username', 'upn', 'email', 'employee_id', 'provider_object_id'])));
    const offset = p.offset ?? 0;
    return structuredClone({ identities: rows.slice(offset, offset + (p.limit ?? 50)), total: rows.length });
  },
  detail: (id: string) => read((d) => d.details[id]),
  reviews: () => read((d) => d.reviews),
  decide: async (decisionId: string, verdict: 'accept' | 'reject', note: string) => {
    const d = await load();
    const idx = d.reviews.reviews.findIndex((r) => r.decision_id === decisionId);
    if (idx < 0) throw new Error('Review item not found');
    if (verdict === 'accept' && !note) throw new Error('A note explaining the evidence is required to accept a match');
    const [item] = d.reviews.reviews.splice(idx, 1);
    const sid = `preview-${Date.now()}`;
    d.reviews.recent_decisions.unshift({
      steward_decision_id: sid, left_key: item.left_key, right_key: item.right_key, verdict,
      reviewer: 'you (preview)', note: note || null, decided_at: new Date().toISOString(),
    } as StewardDecision);
    return { steward_decision_id: sid };
  },
  nhi: () => read((d) => d.nhi),
  runResolver: async (): Promise<{ triggered: boolean; run_id?: number }> => {
    throw new Error(READ_ONLY);
  },
  timelineIdentities: async (search: string) => {
    const d = await load();
    const q = search.trim().toLowerCase();
    const identities = d.timeline.identities.filter((i) =>
      !q || has(q, i.display_name) || accountsMatch(d, i.canonical_id, q, ['username', 'email', 'employee_id']));
    return structuredClone({ identities: identities.slice(0, 100), stats: d.timeline.stats });
  },
  timelineFindings: () => read((d) => d.timelineFindings),
  identityTimeline: (id: string) => read((d) => d.timelines[id]),
  risk: async (p: { band?: string; search?: string }) => {
    const d = await load();
    const q = (p.search || '').trim().toLowerCase();
    const scores = d.risk.scores.filter((s) => (!p.band || s.band === p.band) && (!q || has(q, s.display_name)));
    return structuredClone({ ...d.risk, scores: scores.slice(0, 200), total: scores.length });
  },
  riskDetail: (id: string) => read((d) => d.riskDetails[id]),
  graphResources: () => read((d) => d.graphResources),
  graphPaths: async (p: { resource_id?: string; takeover_only?: boolean }) => {
    const d = await load();
    const paths = d.graphPaths.paths.filter((x) => (!p.resource_id || x.resource_id === p.resource_id) && (!p.takeover_only || x.via_takeover));
    return structuredClone({ paths });
  },
  groups: async (p: { search?: string; findings_only?: boolean; privileged_only?: boolean }) => {
    const d = await load();
    const q = (p.search || '').trim().toLowerCase();
    const groups = d.groups.groups.filter((g) =>
      (!q || has(q, g.name, g.owner, g.purpose)) && (!p.findings_only || g.open_findings > 0) && (!p.privileged_only || g.privileged));
    return structuredClone({ groups });
  },
  groupDetail: (key: string) => read((d) => d.groupDetails[key]),
  whatifScenarios: async () => {
    const d = await load();
    const local = storedScenarios();
    const av = d.whatifInputs.access_version;
    const mine = Object.values(local).filter((s) => !d.whatifDetails[s.scenario.scenario_id])
      .sort((a, b) => (b.scenario.created_at || '').localeCompare(a.scenario.created_at || ''))
      .map((s) => settled(s, av).scenario);
    const samples = d.whatifScenarios.scenarios.map((s) => (local[s.scenario_id] ? settled(local[s.scenario_id], av).scenario : s));
    return structuredClone({ ...d.whatifScenarios, scenarios: [...mine, ...samples] });
  },
  whatifDetail: async (id: string) => {
    const d = await load();
    const local = storedScenarios()[id];
    if (local) return structuredClone(settled(local, d.whatifInputs.access_version));
    const found = d.whatifDetails[id];
    if (!found) throw new Error('Not found');
    return structuredClone(found);
  },
  whatifOptions: () => read((d) => d.whatifOptions),
  createScenario: async (body: { name: string; description: string; changes: ScenarioChange[] }): Promise<RunAck> => {
    const d = await load();
    const name = body.name.trim();
    if (!name) throw new Error('Give the scenario a name');
    if (name.length > 200) throw new Error('The name can be at most 200 characters');
    if ((body.description || '').length > 1000) throw new Error('The description can be at most 1000 characters');
    const changes = validateChanges(body.changes);
    const scenario_id = `wi-local-${crypto.randomUUID().slice(0, 8)}`;
    const now = new Date().toISOString();
    const all = storedScenarios();
    all[scenario_id] = evaluate(d, {
      scenario_id, name, description: body.description.trim() || null, changes, source: 'analyst', status: 'pending',
      error: null, created_by: 'You (preview)', created_at: now, evaluated_at: null,
    });
    saveScenarios(all);
    return { scenario_id, triggered: true };
  },
  evaluateScenario: async (id: string): Promise<RunAck> => {
    const d = await load();
    const all = storedScenarios();
    const scenario = all[id]?.scenario ?? d.whatifDetails[id]?.scenario;
    if (!scenario) throw new Error('Not found');
    all[id] = evaluate(d, scenario);
    saveScenarios(all);
    return { scenario_id: id, triggered: true };
  },
  federation: () => read((d) => d.federation),
  trustDetail: (id: string) => read((d) => d.trustDetails[id]),
  federationFindings: async (p: { severity?: string; scope?: string }) => {
    const d = await load();
    const findings = d.federationFindings.findings.filter((f) => (!p.severity || f.severity === p.severity) && (!p.scope || f.scope === p.scope));
    return structuredClone({ findings });
  },
  remediation: (stage: RemediationStage) => read((d) => d.remediation[stage]),
  remediationDetail: (id: string) => read((d) => d.remediationDetails[id]),
  requestRemediation: async (_id: string, _note: string): Promise<RemediationAck> => { throw new Error(SIGNED_STEPS); },
  decideRemediation: async (_id: string, _verdict: 'approve' | 'reject', _comment: string): Promise<RemediationAck> => {
    throw new Error(SIGNED_STEPS);
  },
  rollbackRemediation: async (_id: string, _reason: string): Promise<RemediationAck> => { throw new Error(SIGNED_STEPS); },
  dismissRemediation: async (_id: string, _reason: string): Promise<RemediationAck> => { throw new Error(SIGNED_STEPS); },
  answerCatalog: () => read((d) => ({ version: d.answerCatalog.version, max_question: d.answerCatalog.max_question, intents: d.answerCatalog.intents })),
  ask: async (question: string): Promise<AnswerResult> => {
    const d = await load();
    const text = question.trim();
    if (!text) throw new Error('Type a question');
    if (text.length > d.answerCatalog.max_question) throw new Error(`Keep questions under ${d.answerCatalog.max_question} characters`);
    const parsed = parse(text, d.answerCatalog);
    let answer: AnswerBody | null = null;
    if (parsed.status === 'answer') {
      const key = parsed.entity ? `${parsed.intent}|${parsed.entity.kind}|${parsed.entity.id}` : String(parsed.intent);
      answer = d.answers[key] ?? null;
      if (!answer) throw new Error('No sample answer is available for that question');
    }
    const id = crypto.randomUUID();
    askedHere.unshift({ question_id: id, question: text, status: parsed.status, intent: parsed.intent ?? null, asked_at: new Date().toISOString() });
    askedHere.splice(20);
    return structuredClone({ question_id: id, question: text, ...parsed, answer, as_of: d.answersAsOf, version: d.answerCatalog.version });
  },
  answerHistory: async () => ({ questions: askedHere.slice() }),
};
