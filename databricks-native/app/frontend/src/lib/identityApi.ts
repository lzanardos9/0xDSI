const BASE = '/api/identity';

export type PrincipalType = 'person' | 'workload' | 'agent';

export interface IdentitySummary {
  canonical_id: string;
  principal_type: PrincipalType;
  display_name: string;
  account_count: number;
  providers: string[];
  personas: string[];
  normalized_states: string[];
  state_conflict: boolean;
  updated_at: string;
}

export interface SourceHealth {
  provider: string;
  tenant: string;
  snapshot_at: string | null;
  snapshot_complete: boolean | null;
  records_received: number | null;
  records_accepted: number | null;
  records_quarantined: number | null;
  tombstoned: number | null;
  stale: number | null;
  status: string;
  error_category: string | null;
  last_run_at: string | null;
  last_success_at: string | null;
}

export interface Overview {
  by_type: { principal_type: PrincipalType; identities: number; accounts: number; state_conflicts: number }[];
  findings: { finding_type: string; cnt: number }[];
  open_reviews: number;
  sources: SourceHealth[];
  resolution: { resolution_version: string; resolver_version: string; resolved_at: string } | null;
}

export interface Account {
  account_key: string;
  persona_id: string;
  persona_type: string;
  provider: string;
  tenant: string;
  provider_object_id: string;
  username: string | null;
  upn: string | null;
  email: string | null;
  display_name: string | null;
  employee_id: string | null;
  provider_state: string | null;
  normalized_state: string;
  state_mapping_version: string;
  owner: string | null;
  grc_application_id: string | null;
  runtime_host: string | null;
  registration_source: string | null;
  credential_fingerprint: string | null;
  credential_expires_at: string | null;
  last_seen: string | null;
  source_status: string;
  valid_from: string | null;
}

export interface Finding {
  finding_id: string;
  finding_type: string;
  account_key: string | null;
  detail: string;
  status: string;
  first_seen: string;
  last_seen: string;
}

export interface Decision {
  decision_id: string;
  left_key: string;
  right_key: string;
  rule: string;
  verdict: string;
  confidence: number;
  features: string;
  decided_at: string;
}

export interface IdentityDetail {
  identity: IdentitySummary & { resolution_version: string; resolver_version: string; first_resolved_at: string };
  accounts: Account[];
  personas: { persona_id: string; persona_type: string; account_count: number }[];
  findings: Finding[];
  relations: { relation_type: string; target_id: string; provenance: string; verification: string }[];
  decisions: Decision[];
  history: { account_key: string; canonical_id: string; resolution_version: string; recorded_at: string }[];
}

export interface ReviewItem {
  decision_id: string;
  left_key: string;
  right_key: string;
  rule: string;
  confidence: number;
  features: string;
  decided_at: string;
  left_name: string | null;
  left_provider: string;
  left_tenant: string;
  left_email: string | null;
  left_persona: string;
  left_state: string;
  right_name: string | null;
  right_provider: string;
  right_tenant: string;
  right_email: string | null;
  right_persona: string;
  right_state: string;
}

export interface StewardDecision {
  steward_decision_id: string;
  left_key: string;
  right_key: string;
  verdict: 'accept' | 'reject';
  reviewer: string;
  note: string | null;
  decided_at: string;
}

export interface NonHuman {
  account_key: string;
  canonical_id: string;
  principal_type: 'workload' | 'agent';
  provider: string;
  tenant: string;
  username: string | null;
  display_name: string | null;
  normalized_state: string;
  owner: string | null;
  grc_application_id: string | null;
  runtime_host: string | null;
  registration_source: string | null;
  credential_fingerprint: string | null;
  credential_expires_at: string | null;
  last_seen: string | null;
  source_status: string;
  credential_expired: boolean;
}

export type EventCategory = 'lifecycle' | 'account' | 'access' | 'sign_in' | 'mfa' | 'credential';
export type Severity = 'high' | 'medium' | 'low';

export interface TimelineIdentity {
  canonical_id: string;
  display_name: string | null;
  principal_type: PrincipalType;
  events: number;
  last_event_at: string | null;
  open_findings: number;
  high_findings: number;
}

export interface TimelineStats {
  events: number | null;
  unlinked: number | null;
  timeline_version: string | null;
  ingested_at: string | null;
}

export interface TimelineEvent {
  event_id: string;
  provider: string;
  tenant: string | null;
  account_key: string | null;
  event_type: string;
  category: EventCategory;
  occurred_at: string;
  actor: string | null;
  detail: Record<string, unknown>;
}

export interface TimelineFinding {
  finding_id: string;
  finding_type: string;
  severity: Severity;
  canonical_id?: string;
  display_name?: string | null;
  evidence_event_ids: string[];
  detail: string | null;
  occurred_at: string | null;
  status: 'open' | 'resolved';
  first_seen: string | null;
  last_seen: string | null;
}

export interface IdentityTimelineData {
  identity: { canonical_id: string; display_name: string | null; principal_type: PrincipalType; providers: string[]; normalized_states: string[] };
  events: TimelineEvent[];
  findings: TimelineFinding[];
}

export type RiskBand = 'critical' | 'high' | 'medium' | 'low';

export interface RiskFactor {
  factor: string;
  category: 'exposure' | 'behaviour' | 'hygiene';
  points: number;
  label: string;
  evidence: string[];
}

export interface RiskScore {
  canonical_id: string;
  display_name: string | null;
  principal_type: PrincipalType;
  score: number;
  band: RiskBand;
  exposure: number;
  behaviour: number;
  hygiene: number;
  previous_score: number | null;
  delta: number | null;
  factors: RiskFactor[];
  weights_version: string;
  scored_at: string;
}

export interface PathStep {
  kind: 'account' | 'group' | 'resource';
  id: string;
  label: string;
  edge: string | null;
  permission?: string | null;
  persona_type?: string;
}

export interface AttackPath {
  path_id: string;
  canonical_id?: string;
  display_name?: string | null;
  principal_type?: PrincipalType;
  resource_id: string;
  resource_name: string | null;
  hops: number;
  via_takeover: boolean;
  permission: string | null;
  steps: PathStep[];
  score?: number | null;
  band?: RiskBand | null;
}

export interface RiskDetail {
  score: RiskScore;
  history: { score: number; band: RiskBand; weights_version: string; scored_at: string }[];
  paths: AttackPath[];
}

export interface AccessResource {
  resource_id: string;
  name: string;
  crown_jewel: boolean;
  tier: string | null;
  owner: string | null;
  description: string | null;
  identities: number;
  via_takeover: number;
  min_hops: number | null;
}

export interface GroupSummary {
  group_key: string;
  provider: string;
  name: string;
  owner: string | null;
  owner_status: 'none' | 'team' | 'unresolved' | 'departed' | 'active';
  purpose: string | null;
  department: string | null;
  privileged: boolean;
  direct_member_count: number;
  effective_member_count: number;
  nesting_depth: number;
  parent_groups: string[];
  child_groups: string[];
  can_take_over: string[];
  open_findings: number;
  worst_severity: Severity | null;
}

export interface GroupMember {
  account_key: string;
  canonical_id: string | null;
  display_name: string | null;
  username: string | null;
  principal_type: PrincipalType | null;
  persona_type: string | null;
  normalized_state: string;
  department: string | null;
  direct: boolean;
  via: string[];
}

export interface GroupFinding {
  finding_id: string;
  finding_type: string;
  severity: Severity;
  detail: string;
  evidence: string[];
  status: 'open' | 'resolved';
  first_seen: string | null;
  last_seen: string | null;
}

export interface GroupDetail {
  group: Omit<GroupSummary, 'open_findings' | 'worst_severity'> & {
    tenant: string;
    object_id: string;
    owner_canonical_id: string | null;
    grants: { resource_id: string; resource: string; crown_jewel: boolean; permission: string | null }[];
  };
  members: GroupMember[];
  findings: GroupFinding[];
}

export type ChangeType = 'remove_membership' | 'revoke_grant' | 'remove_takeover' | 'disable_account' | 'delete_group';

export interface ScenarioChange {
  type: ChangeType;
  group?: string;
  member?: string;
  source?: string;
  resource_id?: string;
  permission?: string;
  target?: string;
  account?: string;
  description?: string;
  reason?: string;
}

export interface WhatIfSummary {
  changes_applied: number;
  changes_rejected: number;
  paths_before: number;
  paths_after: number;
  paths_removed: number;
  paths_added: number;
  identities_affected: number;
  risk_points_removed: number;
  risk_points_added: number;
  critical_before: number;
  critical_after: number;
  group_findings_resolved: number;
  group_findings_added: number;
  memberships_lost: number;
  lockouts: number;
}

export interface WhatIfScenario {
  scenario_id: string;
  name: string;
  description: string | null;
  changes: ScenarioChange[] | null;
  source: 'sample' | 'analyst' | string;
  status: 'pending' | 'done' | 'failed' | string;
  error: string | null;
  created_by: string | null;
  created_at: string | null;
  evaluated_at: string | null;
  summary?: WhatIfSummary | null;
  access_version?: string | null;
}

export interface WhatIfPath {
  canonical_id: string;
  display_name: string;
  resource_id: string;
  resource: string;
  permission: string;
  hops: number;
  via_takeover: boolean;
  steps: string[];
  previous_steps?: string[];
}

export interface WhatIfScoreChange {
  canonical_id: string;
  display_name: string;
  principal_type: string;
  score_before: number;
  score_after: number;
  delta: number;
  band_before: RiskBand;
  band_after: RiskBand;
  factors_cleared: string[];
  factors_added: string[];
  factors_changed: { before: string; after: string; points_before: number; points_after: number }[];
}

export interface WhatIfResult {
  version: string;
  applied: ScenarioChange[];
  rejected: ScenarioChange[];
  summary: WhatIfSummary;
  paths_removed: WhatIfPath[];
  paths_added: WhatIfPath[];
  paths_rerouted: WhatIfPath[];
  score_changes: WhatIfScoreChange[];
  memberships_lost: {
    canonical_id: string;
    display_name: string;
    account_key: string;
    username: string | null;
    group: string;
    privileged: boolean;
    direct: boolean;
  }[];
  group_findings_resolved: { finding_type: string; severity: string; group: string; detail: string }[];
  group_findings_added: { finding_type: string; severity: string; group: string; detail: string }[];
  lockouts: { resource_id: string; resource: string; people_before: number }[];
}

export interface LiveEvent {
  event_id: string;
  occurred_at: string;
  event_type: string;
  category: string;
  provider: string;
  canonical_id: string | null;
  display_name: string | null;
  principal_type: PrincipalType | null;
  account_key: string | null;
  username: string | null;
  actor: string | null;
  detail: Record<string, unknown>;
}

export interface LiveFeed {
  events: LiveEvent[];
  events_24h: number;
  as_of: string | null;
  mode: 'demo' | 'live';
  poll_ms: number;
}

export interface WhatIfOptions {
  groups: { group_key: string; name: string; privileged: boolean; effective_member_count: number }[];
  memberships: { group: string; group_name: string; member: string; member_name: string | null; member_kind: 'account' | 'group' }[];
  grants: { source: string; source_name: string; resource_id: string; resource: string; permission: string | null }[];
  takeovers: { source: string; source_name: string; target: string; target_name: string; permission: string | null }[];
  accounts: { account: string; username: string | null; display_name: string | null }[];
}

export type FedSeverity = 'high' | 'medium' | 'low';

export interface FederationTrust {
  trust_id: string;
  kind: 'cross_tenant' | 'idp_federation' | 'ad_trust';
  provider: string | null;
  tenant: string | null;
  partner_name: string;
  partner_tenant: string | null;
  partner_domains: string[];
  owner: string;
  owner_status: string;
  description: string;
  settings: Record<string, unknown>;
  rules_total: number;
  rules_passed: number;
  worst_severity: FedSeverity | null;
  guests: number;
  active_guests: number;
  updated_at: string | null;
  open_findings?: number;
}

export interface FederationGuest {
  account_key: string;
  canonical_id: string;
  display_name: string | null;
  username: string | null;
  email: string;
  home_tenant: string | null;
  trust_id: string | null;
  partner_name: string | null;
  sponsor: string;
  sponsor_status: string;
  normalized_state: string;
  last_seen: string | null;
  days_inactive: number | null;
  groups: string[];
  privileged_groups: string[];
}

export interface FederationFinding {
  finding_id: string;
  scope: 'trust' | 'guest';
  trust_id: string | null;
  partner_name?: string | null;
  account_key: string | null;
  guest_name?: string | null;
  finding_type: string;
  severity: FedSeverity;
  title: string;
  detail: string;
  setting: string | null;
  expected: string | null;
  actual: string | null;
  changed_by: string | null;
  changed_at: string | null;
  status: 'open' | 'resolved';
  first_seen: string | null;
  last_seen: string | null;
  resolved_at: string | null;
}

export interface FederationChange {
  change_id: string;
  trust_id?: string;
  setting: string;
  before_value: string | null;
  after_value: string | null;
  changed_at: string | null;
  changed_by: string | null;
}

export interface FederationOverview {
  trusts: FederationTrust[];
  guests: FederationGuest[];
  recent_changes: FederationChange[];
  summary: {
    trusts: number;
    guests: number;
    active_guests: number;
    open_by_severity: Partial<Record<FedSeverity, number>>;
    rules_total: number;
    rules_passed: number;
    posture_score: number | null;
    updated_at: string | null;
  };
}

export interface TrustDetail {
  trust: FederationTrust;
  findings: FederationFinding[];
  changes: FederationChange[];
  guests: FederationGuest[];
}

export type RemediationStage = 'review' | 'approval' | 'in_progress' | 'done' | 'closed';
export type RemediationStatus =
  | 'proposed' | 'blocked' | 'pending_approval' | 'queued' | 'rollback_queued' | 'executed' | 'verified'
  | 'rolled_back' | 'no_longer_needed' | 'rejected' | 'dismissed' | 'superseded' | 'failed' | 'rollback_failed';

export interface RemediationReason {
  source_kind: string;
  finding_id: string;
  finding_type: string;
  severity: Severity;
  detail: string;
}

export interface RemediationListItem {
  action_id: string;
  action_type: string;
  title: string;
  severity: Severity;
  canonical_id: string | null;
  display_name: string | null;
  provider: string;
  impact: Partial<WhatIfSummary>;
  required_approvals: number;
  approvals: number;
  status: RemediationStatus;
  blocked_reason: string | null;
  requested_by: string | null;
  requested_at: string | null;
  executed_at: string | null;
  verified_at: string | null;
  rolled_back_at: string | null;
  updated_at: string | null;
}

export interface RemediationList {
  stage: RemediationStage;
  actions: RemediationListItem[];
  stages: Record<RemediationStage, number>;
  pending_points: number | null;
}

export interface RemediationAction extends Omit<RemediationListItem, 'impact' | 'approvals'> {
  change: ScenarioChange & Record<string, unknown>;
  reasons: RemediationReason[];
  impact: {
    summary: WhatIfSummary;
    score_changes: WhatIfScoreChange[];
    lockouts: WhatIfResult['lockouts'];
    memberships_lost: WhatIfResult['memberships_lost'];
    paths_removed: WhatIfPath[];
  } | null;
  approvals_count: number;
  access_version: string | null;
  action_hash: string;
  request_note: string | null;
  execution_mode: string | null;
  before_state: Record<string, unknown> | null;
  inverse: Record<string, unknown> | null;
  provider_request: Record<string, unknown> | null;
  rollback_requested_by: string | null;
  rollback_reason: string | null;
  error: string | null;
}

export interface RemediationApproval {
  approval_id: string;
  approver: string;
  verdict: 'approve' | 'reject';
  comment: string | null;
  action_hash: string;
  decided_at: string;
}

export interface RemediationOutbox {
  outbox_id: string;
  operation: 'execute' | 'rollback';
  status: string;
  attempts: number;
  execution_mode: string | null;
  request: Record<string, unknown> | null;
  response: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface RemediationDetail {
  action: RemediationAction;
  approvals: RemediationApproval[];
  outbox: RemediationOutbox[];
  can: { request: boolean; dismiss: boolean; decide: boolean; rollback: boolean };
  you: string;
}

export interface RemediationAck {
  action_id: string;
  status: RemediationStatus;
  approvals?: number;
  required?: number;
  triggered?: boolean;
  reason?: string | null;
}

export type AnswerKind = 'identity' | 'resource' | 'group' | 'trust';
export interface AnswerEntity { kind: AnswerKind; id: string; label: string }

export interface AnswerBody {
  headline: string;
  sentences: string[];
  columns: string[];
  rows: (string | number | null)[][];
  truncated: number;
  citations: { source: string; key: string; label: string | null }[];
  link: { view: string } | null;
}

export interface AnswerResult {
  question_id: string;
  question: string;
  status: 'answer' | 'refused' | 'clarify' | 'need_entity' | 'no_match';
  intent?: string | null;
  entity?: AnswerEntity | null;
  options?: AnswerEntity[];
  kinds?: AnswerKind[];
  reason?: string;
  link?: string | null;
  answer: AnswerBody | null;
  as_of: string | null;
  version: string;
}

export interface AnswerIntent {
  intent: string;
  title: string;
  entity: AnswerKind[];
  examples: string[];
}

export interface AnswerHistoryItem {
  question_id: string;
  question: string;
  status: string;
  intent: string | null;
  asked_at: string;
}

interface RunAck {
  scenario_id: string;
  triggered: boolean;
  run_id?: number | null;
  reason?: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : '';
    if (res.status === 403) throw new Error('You need the analyst role to view identity data.');
    throw new Error(detail || `Request failed (${res.status})`);
  }
  if (body === null || typeof body !== 'object') throw new Error('Unexpected response from the server');
  return body as T;
}

export const identityApi = {
  overview: () => request<Overview>('/overview'),
  identities: (p: { search?: string; principal_type?: string; conflicts_only?: boolean; limit?: number; offset?: number }) => {
    const q = new URLSearchParams();
    if (p.search) q.set('search', p.search);
    if (p.principal_type) q.set('principal_type', p.principal_type);
    if (p.conflicts_only) q.set('conflicts_only', 'true');
    q.set('limit', String(p.limit ?? 50));
    q.set('offset', String(p.offset ?? 0));
    return request<{ identities: IdentitySummary[]; total: number }>(`/identities?${q}`);
  },
  detail: (id: string) => request<IdentityDetail>(`/identities/${encodeURIComponent(id)}`),
  reviews: () => request<{ reviews: ReviewItem[]; recent_decisions: StewardDecision[] }>('/reviews'),
  decide: (decisionId: string, verdict: 'accept' | 'reject', note: string) =>
    request<{ steward_decision_id: string }>(`/reviews/${encodeURIComponent(decisionId)}`, {
      method: 'POST',
      body: JSON.stringify({ verdict, note }),
    }),
  nhi: () => request<{ nhis: NonHuman[] }>('/nhi'),
  runResolver: () => request<{ triggered: boolean; run_id?: number }>('/run-resolver', { method: 'POST' }),
  timelineIdentities: (search: string) => {
    const q = new URLSearchParams({ limit: '100' });
    if (search) q.set('search', search);
    return request<{ identities: TimelineIdentity[]; stats: TimelineStats | null }>(`/timeline/identities?${q}`);
  },
  timelineFindings: () => request<{ findings: TimelineFinding[] }>('/timeline/findings?status=open&limit=200'),
  identityTimeline: (id: string) =>
    request<IdentityTimelineData>(`/identities/${encodeURIComponent(id)}/timeline`),
  risk: (p: { band?: string; search?: string }) => {
    const q = new URLSearchParams({ limit: '200' });
    if (p.band) q.set('band', p.band);
    if (p.search) q.set('search', p.search);
    return request<{
      scores: RiskScore[];
      total: number;
      bands: Partial<Record<RiskBand, number>>;
      meta: { scored_at: string | null; weights_version: string | null; access_version: string | null } | null;
    }>(`/risk?${q}`);
  },
  riskDetail: (id: string) => request<RiskDetail>(`/risk/${encodeURIComponent(id)}`),
  graphResources: () =>
    request<{ resources: AccessResource[]; meta: { edges: number; access_version: string | null; updated_at: string | null } | null }>(
      '/graph/resources',
    ),
  graphPaths: (p: { resource_id?: string; takeover_only?: boolean }) => {
    const q = new URLSearchParams({ limit: '200' });
    if (p.resource_id) q.set('resource_id', p.resource_id);
    if (p.takeover_only) q.set('takeover_only', 'true');
    return request<{ paths: AttackPath[] }>(`/graph/paths?${q}`);
  },
  groups: (p: { search?: string; findings_only?: boolean; privileged_only?: boolean }) => {
    const q = new URLSearchParams();
    if (p.search) q.set('search', p.search);
    if (p.findings_only) q.set('findings_only', 'true');
    if (p.privileged_only) q.set('privileged_only', 'true');
    return request<{ groups: GroupSummary[] }>(`/groups?${q}`);
  },
  groupDetail: (key: string) => request<GroupDetail>(`/groups/${encodeURIComponent(key)}`),
  whatifScenarios: () =>
    request<{ scenarios: WhatIfScenario[]; current_access_version: string | null }>('/whatif/scenarios'),
  whatifDetail: (id: string) =>
    request<{ scenario: WhatIfScenario; result: WhatIfResult | null }>(`/whatif/scenarios/${encodeURIComponent(id)}`),
  whatifOptions: () => request<WhatIfOptions>('/whatif/options'),
  liveEvents: () => request<LiveFeed>('/live'),
  createScenario: (body: { name: string; description: string; changes: ScenarioChange[] }) =>
    request<RunAck>('/whatif/scenarios', { method: 'POST', body: JSON.stringify(body) }),
  evaluateScenario: (id: string) =>
    request<RunAck>(`/whatif/scenarios/${encodeURIComponent(id)}/evaluate`, { method: 'POST' }),
  federation: () => request<FederationOverview>('/federation'),
  trustDetail: (id: string) => request<TrustDetail>(`/federation/trusts/${encodeURIComponent(id)}`),
  federationFindings: (p: { severity?: string; scope?: string }) => {
    const q = new URLSearchParams({ status: 'open' });
    if (p.severity) q.set('severity', p.severity);
    if (p.scope) q.set('scope', p.scope);
    return request<{ findings: FederationFinding[] }>(`/federation/findings?${q}`);
  },
  remediation: (stage: RemediationStage) =>
    request<RemediationList>(`/remediation?stage=${encodeURIComponent(stage)}&limit=200`),
  remediationDetail: (id: string) => request<RemediationDetail>(`/remediation/${encodeURIComponent(id)}`),
  requestRemediation: (id: string, note: string) =>
    request<RemediationAck>(`/remediation/${encodeURIComponent(id)}/request`, { method: 'POST', body: JSON.stringify({ note }) }),
  decideRemediation: (id: string, verdict: 'approve' | 'reject', comment: string) =>
    request<RemediationAck>(`/remediation/${encodeURIComponent(id)}/decide`, {
      method: 'POST',
      body: JSON.stringify({ verdict, comment }),
    }),
  rollbackRemediation: (id: string, reason: string) =>
    request<RemediationAck>(`/remediation/${encodeURIComponent(id)}/rollback`, { method: 'POST', body: JSON.stringify({ reason }) }),
  dismissRemediation: (id: string, reason: string) =>
    request<RemediationAck>(`/remediation/${encodeURIComponent(id)}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) }),
  answerCatalog: () => request<{ version: string; max_question: number; intents: AnswerIntent[] }>('/answers/catalog'),
  ask: (question: string) => request<AnswerResult>('/answers/ask', { method: 'POST', body: JSON.stringify({ question }) }),
  answerHistory: () => request<{ questions: AnswerHistoryItem[] }>('/answers/history'),
};
