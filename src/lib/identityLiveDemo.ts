// Slow, deterministic stream of sample identity activity for the preview. The Databricks app reads identity_event instead.
import type { AttackPath, CustodyVerification, LiveBucket, LiveEvent, LiveEventDetail, LiveFeed, LiveHistogram, LiveWindow, Overview } from './identityTypes';
import type { SimXref } from './identityWhatIfEngine';
import { CANONICALIZATION, constantTimeEqual, hmacHex, keyId, recordDigest, sealMessage } from '../components/identity/identityCustody';
import { needsLook } from '../components/identity/identityLiveRules';

const SLOT_MS = 9000;
const BACKLOG = 7;
const FEED_SIZE = 25;
const POLL_MS = 2500;
const RANGE_LIMIT = 300;
const BUCKETS = 24;
const WINDOW_MS: Record<LiveWindow, number> = { '10m': 600000, '1h': 3600000, '24h': 86400000 };
const DEMO_KEY = 'preview-demo-custody-key-not-a-secret-0001';
const TENANT: Record<string, string> = { entra_id: 'aa.onmicrosoft.com', active_directory: 'corp.aa.com', okta: 'aa.okta.com' };

const COUNTRIES = ['US', 'US', 'US', 'US', 'BR', 'GB', 'IN', 'RO', 'NG', 'SG'];
const APPS = ['Microsoft 365', 'Crew Portal', 'AAdvantage Admin', 'Workday', 'ServiceNow', 'Okta Dashboard'];
const NEW_USERS = ['ext-l.okafor', 'ext-m.santos', 'ext-r.patel', 'svc-bagtag-sync', 'ext-a.kowalski', 'ext-y.tanaka', 'svc-fuel-forecast', 'ext-d.moreau'];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LiveDemo {
  feed: () => LiveFeed;
  range: (since?: string, until?: string) => LiveFeed;
  histogram: (window: LiveWindow) => LiveHistogram;
  detail: (id: string) => Promise<LiveEventDetail>;
  verify: (id: string, seal: { digest: string; signature: string | null; signed_at: string }) => Promise<CustodyVerification>;
  grow: (o: Overview) => Overview;
}

export function createLiveDemo(paths: AttackPath[], xrefs: SimXref[], groupNames: string[], baseEvents: number, startedAt = Date.now()): LiveDemo {
  const people = xrefs.filter((x) => x.principal_type === 'person' && x.normalized_state === 'ENABLED');
  const machines = xrefs.filter((x) => x.principal_type !== 'person' && x.normalized_state === 'ENABLED');
  const byKey = new Map(xrefs.map((x) => [x.account_key, x]));
  const cache = new Map<number, LiveEvent>();

  const at = (k: number) => {
    if (k === BACKLOG) return startedAt + 3500;
    const jitter = Math.floor(rng(k * 7919 + 13)() * 4000) - 2000;
    return startedAt + (k - BACKLOG) * SLOT_MS + jitter;
  };

  const countUntil = (now: number) => {
    let k = Math.floor((now - startedAt) / SLOT_MS) + BACKLOG - 1;
    while (at(k - 1) > now) k--;
    while (at(k) <= now) k++;
    return k;
  };

  const make = (k: number, seed = k): LiveEvent => {
    const r = rng(seed * 2654435761 + 97);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const base = { event_id: `live-${startedAt}-${k}`, occurred_at: new Date(at(k)).toISOString(), actor: null as string | null };
    const who = (x: SimXref) => ({ canonical_id: x.canonical_id, display_name: x.display_name, principal_type: x.principal_type as LiveEvent['principal_type'],
      account_key: x.account_key, username: x.username, provider: x.provider });
    const roll = r();

    if (roll < 0.52 && paths.length) {
      const p = pick(paths);
      const acct = byKey.get(p.steps[0]?.id ?? '');
      if (!acct) return make(k, seed + 100000);
      const ident = who(acct);
      const onPath = { resource_id: p.resource_id, resource: p.resource_name, path_id: p.path_id };
      const take = p.steps.findIndex((s) => s.edge === 'can_take_over');
      if (take > 0 && r() < 0.6) {
        return { ...base, ...ident, event_type: 'password_reset', category: 'credential', actor: p.steps[take - 1].label,
          detail: { ...onPath, target: p.steps[take].label, via: p.steps[take - 1].label } };
      }
      if (p.principal_type !== 'person') {
        const exporting = p.permission === 'export';
        return { ...base, ...ident, event_type: 'resource_access', category: 'access',
          detail: { ...onPath, operation: exporting ? 'export' : p.permission === 'write' ? 'write' : 'read', rows: 400 + Math.floor(r() * 4800) } };
      }
      if (r() < 0.25) {
        return { ...base, ...ident, event_type: 'mfa_denied', category: 'mfa', detail: { ...onPath, method: 'push', application: p.resource_name, attempts: 1 + Math.floor(r() * 3) } };
      }
      return { ...base, ...ident, event_type: 'sign_in_success', category: 'sign_in',
        detail: { ...onPath, application: p.resource_name, country: 'US', ip: `10.${20 + Math.floor(r() * 30)}.${Math.floor(r() * 250)}.${Math.floor(r() * 250)}` } };
    }
    if (roll < 0.64 && people.length) {
      const x = pick(people);
      const country = pick(COUNTRIES);
      return { ...base, ...who(x), event_type: 'sign_in_failure', category: 'sign_in', detail: { application: pick(APPS), country } };
    }
    if (roll < 0.74 && people.length && groupNames.length) {
      const x = pick(people);
      const ticketed = r() < 0.75;
      return { ...base, ...who(x), event_type: ticketed ? 'entitlement_granted' : 'privilege_granted', category: 'access', actor: ticketed ? 'saviynt-request' : 'adm-console',
        detail: { entitlement: pick(groupNames), ...(ticketed ? { ticket: `REQ-${45600 + Math.floor(r() * 900)}` } : {}) } };
    }
    if (roll < 0.84 && machines.length) {
      const x = pick(machines);
      return { ...base, ...who(x), event_type: 'credential_rotated', category: 'credential', actor: 'vault-rotation', detail: { credential: x.principal_type === 'agent' ? 'API key' : 'client secret' } };
    }
    if (roll < 0.92) {
      const username = `${pick(NEW_USERS)}${Math.floor(r() * 90) + 10}`;
      const provider = username.startsWith('svc-') ? 'entra_id' : pick(['entra_id', 'active_directory']);
      return { ...base, canonical_id: null, display_name: null, principal_type: username.startsWith('svc-') ? 'workload' : 'person', account_key: null, username, provider,
        event_type: 'account_created', category: 'account', actor: 'directory-sync', detail: { new: true, username } };
    }
    const x = pick(people.length ? people : xrefs);
    return { ...base, ...who(x), event_type: 'mfa_enrolled', category: 'mfa', detail: { method: 'Duo push' } };
  };

  const event = (k: number) => {
    if (!cache.has(k)) cache.set(k, make(k));
    return cache.get(k)!;
  };

  const slotOf = (id: string) => {
    const prefix = `live-${startedAt}-`;
    if (!id.startsWith(prefix)) return null;
    const k = Number(id.slice(prefix.length));
    return Number.isInteger(k) && k < countUntil(Date.now()) ? k : null;
  };

  const raw = (k: number): Record<string, unknown> => {
    const e = event(k);
    const occurred = new Date(e.occurred_at).getTime();
    return {
      event_id: e.event_id, source_event_id: `${e.provider}-${(k * 2654435761 >>> 0).toString(16)}`, canonical_id: e.canonical_id,
      persona_id: null, account_key: e.account_key, employee_id: null, provider: e.provider, tenant: TENANT[e.provider] ?? null,
      event_type: e.event_type, category: e.category, occurred_at: e.occurred_at, actor: e.actor, detail: JSON.stringify(e.detail),
      link_status: e.canonical_id ? 'linked' : 'unlinked', timeline_version: 'tl-preview', ingested_at: new Date(occurred + 1400).toISOString(),
    };
  };

  const between = (lo: number, hi: number) => {
    const out: LiveEvent[] = [];
    for (let k = countUntil(hi) - 1; k >= countUntil(lo); k--) out.push(event(k));
    return out;
  };

  const feedOf = (events: LiveEvent[], truncated = false): LiveFeed => ({
    events: structuredClone(events), events_24h: baseEvents + countUntil(Date.now()), as_of: new Date().toISOString(),
    mode: 'demo', poll_ms: POLL_MS, truncated,
  });

  return {
    feed: () => {
      const n = countUntil(Date.now());
      const events: LiveEvent[] = [];
      for (let k = n - 1; k >= n - FEED_SIZE; k--) events.push(event(k));
      return feedOf(events);
    },
    range: (since, until) => {
      const now = Date.now();
      const lo = since ? new Date(since).getTime() : now - WINDOW_MS['24h'];
      const hi = Math.min(now, until ? new Date(until).getTime() : now);
      if (Number.isNaN(lo) || Number.isNaN(hi)) throw new Error('Pick a valid time range');
      if (hi <= lo) return feedOf([]);
      const events = between(lo, hi);
      return feedOf(events.slice(0, RANGE_LIMIT), events.length > RANGE_LIMIT);
    },
    histogram: (window) => {
      const span = WINDOW_MS[window];
      if (!span) throw new Error('Unknown time window');
      const top = Date.now();
      const size = span / BUCKETS;
      const buckets: LiveBucket[] = Array.from({ length: BUCKETS }, (_, i) => ({
        start: new Date(top - span + i * size).toISOString(), end: new Date(top - span + (i + 1) * size).toISOString(), total: 0, risky: 0,
      }));
      for (const e of between(top - span, top)) {
        const b = BUCKETS - 1 - Math.floor((top - new Date(e.occurred_at).getTime()) / size);
        if (b < 0 || b >= BUCKETS) continue;
        buckets[b].total += 1;
        if (needsLook(e)) buckets[b].risky += 1;
      }
      return { window, since: new Date(top - span).toISOString(), until: new Date(top).toISOString(), buckets };
    },
    detail: async (id) => {
      const k = slotOf(id);
      if (k === null) throw new Error('Event not found');
      const e = event(k);
      const record = raw(k);
      const signed_at = new Date().toISOString();
      const digest = await recordDigest(record);
      const signature = await hmacHex(DEMO_KEY, sealMessage(e.event_id, digest, signed_at));
      const kid = await keyId(DEMO_KEY);
      const related = e.canonical_id
        ? between(Date.now() - WINDOW_MS['1h'], Date.now()).filter((x) => x.canonical_id === e.canonical_id && x.event_id !== e.event_id).slice(0, 8)
        : [];
      return structuredClone({
        event: e, raw: record, related,
        custody: {
          algorithm: 'HMAC-SHA256' as const, digest_algorithm: 'SHA-256' as const, canonicalization: CANONICALIZATION, digest, signature,
          key_id: kid, signed_at, signer: 'Preview demo key (not secret)',
          trail: [
            { step: 'received' as const, at: e.occurred_at, by: e.provider, detail: `Source event ${record.source_event_id} from tenant ${record.tenant ?? 'unknown'}` },
            { step: 'ingested' as const, at: String(record.ingested_at), by: 'Identity 01 job', detail: 'Landed in the identity_event Delta table' },
            { step: 'linked' as const, at: String(record.ingested_at), by: 'Identity resolver', detail: `Link status ${record.link_status}, timeline tl-preview` },
            { step: 'sealed' as const, at: signed_at, by: kid, detail: 'Digest and signature computed from the stored row' },
            { step: 'accessed' as const, at: signed_at, by: 'You (preview)', detail: 'View recorded in the audit log' },
          ],
        },
      });
    },
    verify: async (id, seal) => {
      const k = slotOf(id);
      if (k === null) throw new Error('Event not found');
      const stored = await recordDigest(raw(k));
      const expected = await hmacHex(DEMO_KEY, sealMessage(id, seal.digest, seal.signed_at));
      return {
        record_matches: stored === seal.digest, signature_valid: !!seal.signature && constantTimeEqual(expected, seal.signature),
        stored_digest: stored, checked_at: new Date().toISOString(), checked_by: 'Preview verifier',
      };
    },
    grow: (o) => {
      const n = countUntil(Date.now());
      const created: Record<string, number> = {};
      const seen: Record<string, number> = {};
      for (let k = BACKLOG; k < n; k++) {
        const e = event(k);
        seen[e.provider] = (seen[e.provider] ?? 0) + 1;
        if (e.event_type === 'account_created') created[e.principal_type ?? 'person'] = (created[e.principal_type ?? 'person'] ?? 0) + 1;
      }
      return {
        ...o,
        by_type: o.by_type.map((t) => ({ ...t, accounts: Number(t.accounts || 0) + (created[t.principal_type] ?? 0) })),
        sources: o.sources.map((s) => {
          const add = Math.floor((seen[s.provider] ?? 0) / 2);
          return { ...s, records_received: s.records_received === null ? null : Number(s.records_received) + add,
            records_accepted: s.records_accepted === null ? null : Number(s.records_accepted) + add };
        }),
      };
    },
  };
}
