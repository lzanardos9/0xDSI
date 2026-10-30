// Slow, deterministic stream of sample identity activity for the preview. The Databricks app reads identity_event instead.
import type { AttackPath, LiveEvent, LiveFeed, Overview } from './identityTypes';
import type { SimXref } from './identityWhatIfEngine';

const SLOT_MS = 9000;
const BACKLOG = 7;
const FEED_SIZE = 25;
const POLL_MS = 2500;

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
    let k = Math.max(0, Math.floor((now - startedAt) / SLOT_MS) + BACKLOG - 1);
    while (k > 0 && at(k - 1) > now) k--;
    while (at(k) <= now) k++;
    return k;
  };

  const make = (k: number): LiveEvent => {
    const r = rng(k * 2654435761 + 97);
    const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
    const base = { event_id: `live-${startedAt}-${k}`, occurred_at: new Date(at(k)).toISOString(), actor: null as string | null };
    const who = (x: SimXref) => ({ canonical_id: x.canonical_id, display_name: x.display_name, principal_type: x.principal_type as LiveEvent['principal_type'],
      account_key: x.account_key, username: x.username, provider: x.provider });
    const roll = r();

    if (roll < 0.52 && paths.length) {
      const p = pick(paths);
      const acct = byKey.get(p.steps[0]?.id ?? '');
      if (!acct) return make(k + 100000);
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

  return {
    feed: () => {
      const n = countUntil(Date.now());
      const events: LiveEvent[] = [];
      for (let k = n - 1; k >= Math.max(0, n - FEED_SIZE); k--) events.push(structuredClone(event(k)));
      return { events, events_24h: baseEvents + n, as_of: new Date().toISOString(), mode: 'demo', poll_ms: POLL_MS };
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
