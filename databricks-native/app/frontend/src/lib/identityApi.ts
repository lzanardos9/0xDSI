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
};
