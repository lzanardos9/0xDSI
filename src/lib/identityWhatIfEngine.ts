// Browser port of notebooks/_shared/identity_whatif.py + identity_access.py for the sample-data preview.
// Kept line-for-line faithful; tools/identity_preview/check_whatif_parity.mts compares it with the Python results.
import type { RiskBand, ScenarioChange, WhatIfPath, WhatIfResult, WhatIfScoreChange } from './identityTypes';

type Ref = string | { provider?: string; tenant?: string; object_id?: string } | null | undefined;

export interface SimXref {
  account_key: string;
  canonical_id: string;
  username: string | null;
  display_name: string | null;
  provider_object_id: string | null;
  provider: string;
  normalized_state: string | null;
  principal_type: string | null;
  persona_type: string | null;
  email: string | null;
}

export interface SimInputs {
  xrefs: SimXref[];
  resources: { resource_id: string; name: string; crown_jewel?: boolean; tier?: string; owner?: string; description?: string }[];
  groups: { provider: string; tenant: string; object_id: string; name: string; owner?: string; purpose?: string; department?: string; privileged?: boolean; members?: Ref[] }[];
  edges: { edge_type: string; source: Ref; target: Ref; permission?: string | null }[];
  departments: Record<string, string>;
  leavers: string[];
  timeline: { canonical_id: string; severity: string; detail: string; status?: string }[];
  identity_findings: { canonical_id: string | null; finding_type: string; detail: string; status?: string }[];
  weights: Record<string, number | string> | null;
  access_version: string;
}

const INACTIVE = new Set(['DISABLED', 'DELETED', 'SUSPENDED']);
const MAX_CHANGES = 20;
const CHANGE_FIELDS: Record<string, string[]> = {
  remove_membership: ['group', 'member'],
  revoke_grant: ['source', 'resource_id'],
  remove_takeover: ['source', 'target'],
  disable_account: ['account'],
  delete_group: ['group'],
};
const DEFAULT_WEIGHTS: Record<string, number> = {
  crown_jewel_access: 15, crown_jewel_cap: 45, takeover_path: 20, takeover_cap: 40,
  privileged_via_standard_account: 15, standing_privilege: 5, standing_privilege_cap: 15,
  timeline_high: 25, timeline_medium: 10, behaviour_cap: 50,
  identity_finding: 10, no_mfa: 10, sod_conflict: 20, inactive_account_in_group: 5, hygiene_cap: 40,
};
const SOD_RULES = [{ resource_id: 'res-sap-fi', permissions: ['approve_payment', 'create_vendor'], label: 'Approve payments and create vendors' }];
const GROUP_SEVERITY: Record<string, string> = {
  hidden_privilege_nesting: 'high', group_owner_departed: 'high', group_no_owner: 'medium',
  member_outside_purpose: 'medium', inactive_members: 'low',
};
const HYGIENE = new Set(['state_conflict', 'orphan_nhi', 'unlinked_nhi', 'unverified_agent', 'unmapped_state']);

const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const sortStr = (xs: Iterable<string>) => [...xs].sort(cmp);

function sourceKey(provider: unknown, tenant: unknown, objectId: unknown): string {
  const parts = [clean(provider).toLowerCase(), clean(tenant).toLowerCase(), clean(objectId).toLowerCase()];
  if (!parts.every(Boolean)) throw new Error('provider, tenant and object_id are all required');
  return parts.join(':');
}

function refKey(ref: Ref): string {
  if (ref && typeof ref === 'object') return sourceKey(ref.provider ?? '', ref.tenant ?? '', ref.object_id ?? '');
  if (typeof ref === 'string') {
    const i = ref.indexOf(':');
    const j = i < 0 ? -1 : ref.indexOf(':', i + 1);
    if (j > 0 && i > 0 && j > i + 1 && j < ref.length - 1) return ref.trim().toLowerCase();
  }
  throw new Error("reference must be {provider, tenant, object_id} or 'provider:tenant:object_id'");
}

const safeKey = (ref: Ref) => { try { return refKey(ref); } catch { return null; } };

export function validateChanges(changes: unknown): ScenarioChange[] {
  if (!Array.isArray(changes) || changes.length === 0) throw new Error('a scenario needs at least one change');
  if (changes.length > MAX_CHANGES) throw new Error(`a scenario can hold at most ${MAX_CHANGES} changes`);
  return changes.map((c: Record<string, unknown>, idx) => {
    const i = idx + 1;
    if (!c || typeof c !== 'object' || !CHANGE_FIELDS[c.type as string]) {
      throw new Error(`change ${i}: type must be one of ${Object.keys(CHANGE_FIELDS).sort().join(', ')}`);
    }
    const norm: Record<string, string> = { type: c.type as string };
    for (const f of CHANGE_FIELDS[c.type as string]) {
      const v = clean(c[f] || '');
      if (!v) throw new Error(`change ${i}: '${f}' is required`);
      norm[f] = f === 'resource_id' ? v : refKey(v);
    }
    if (c.type === 'revoke_grant' && c.permission) norm.permission = clean(c.permission).toLowerCase();
    return norm as unknown as ScenarioChange;
  });
}

interface Group {
  group_key: string; name: string; owner: string; department: string; privileged: boolean;
  raw: Ref[]; child_groups: string[]; direct_accounts: string[]; parent_groups: string[];
}
type Adj = [string, string, string];
interface Model {
  accounts: Map<string, SimXref>;
  resources: Map<string, { resource_id: string; name: string; crown_jewel: boolean }>;
  groups: Map<string, Group>;
  out: Map<string, Adj[]>;
}

function buildModel(xrefs: SimXref[], resources: SimInputs['resources'], groups: SimInputs['groups'], edges: SimInputs['edges']): Model {
  const accounts = new Map(xrefs.map((x) => [x.account_key, x]));
  const res = new Map<string, { resource_id: string; name: string; crown_jewel: boolean }>();
  for (const r of resources) {
    const rid = clean(r.resource_id);
    if (!rid || !clean(r.name)) continue;
    res.set(rid, { resource_id: rid, name: clean(r.name), crown_jewel: Boolean(r.crown_jewel) });
  }
  const grp = new Map<string, Group>();
  for (const g of groups) {
    let key: string;
    try { key = sourceKey(g.provider, g.tenant, g.object_id); } catch { continue; }
    if (!clean(g.name)) continue;
    grp.set(key, { group_key: key, name: clean(g.name), owner: clean(g.owner || ''), department: clean(g.department || ''),
      privileged: Boolean(g.privileged), raw: g.members || [], child_groups: [], direct_accounts: [], parent_groups: [] });
  }
  const out = new Map<string, Adj[]>();
  const add = (src: string, t: string, dst: string, perm = '') => {
    if (!out.has(src)) out.set(src, []);
    out.get(src)!.push([t, dst, perm]);
  };
  for (const [key, g] of grp) {
    for (const m of g.raw) {
      const mk = safeKey(m);
      if (mk === null) continue;
      if (grp.has(mk) && mk !== key) { g.child_groups.push(mk); add(`g:${mk}`, 'nested_in', `g:${key}`); }
      else if (accounts.has(mk)) { g.direct_accounts.push(mk); add(`a:${mk}`, 'member_of', `g:${key}`); }
    }
  }
  for (const g of grp.values()) g.parent_groups = sortStr([...grp.entries()].filter(([, p]) => p.child_groups.includes(g.group_key)).map(([k]) => k));
  for (const e of edges) {
    const t = clean(e.edge_type);
    const src = safeKey(e.source);
    if (src === null) continue;
    const sNode = grp.has(src) ? `g:${src}` : accounts.has(src) ? `a:${src}` : null;
    const perm = clean(e.permission || '').toLowerCase();
    if (t === 'grants' && sNode && res.has(String(e.target ?? ''))) add(sNode, 'grants', `r:${e.target}`, perm);
    else if (t === 'can_take_over' && sNode) {
      const dst = safeKey(e.target) ?? '';
      if (accounts.has(dst)) add(sNode, 'can_take_over', `a:${dst}`, perm);
    }
  }
  for (const adj of out.values()) adj.sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]) || cmp(a[2], b[2]));
  for (const g of grp.values()) { g.child_groups.sort(cmp); g.direct_accounts.sort(cmp); }
  return { accounts, resources: res, groups: grp, out };
}

type Closure = Map<string, Map<string, string[]>>;

function groupClosure(m: Model): Closure {
  const closure: Closure = new Map();
  for (const ak of m.accounts.keys()) {
    const seen = new Map<string, string[]>();
    const q: string[] = [];
    for (const [t, dst] of m.out.get(`a:${ak}`) || []) {
      if (t === 'member_of' && !seen.has(dst.slice(2))) { seen.set(dst.slice(2), [dst.slice(2)]); q.push(dst.slice(2)); }
    }
    while (q.length) {
      const gk = q.shift()!;
      for (const [t, dst] of m.out.get(`g:${gk}`) || []) {
        const k = dst.slice(2);
        if (t === 'nested_in' && !seen.has(k)) { seen.set(k, [...seen.get(gk)!, k]); q.push(k); }
      }
    }
    if (seen.size) closure.set(ak, seen);
  }
  return closure;
}

function label(m: Model, node: string): string {
  const kind = node[0];
  const key = node.slice(2);
  if (kind === 'r') return m.resources.get(key)!.name;
  if (kind === 'g') return m.groups.get(key)!.name;
  const x = m.accounts.get(key)!;
  return x.username || x.display_name || x.provider_object_id || key;
}

interface Step { kind: string; id: string; label: string; edge: string; permission: string }
interface Path { canonical_id: string; resource_id: string; hops: number; via_takeover: boolean; permission: string; steps: Step[] }

function attackPaths(m: Model): Path[] {
  const byCid = new Map<string, string[]>();
  for (const x of m.accounts.values()) {
    if (!INACTIVE.has(x.normalized_state ?? '') && x.normalized_state !== 'UNKNOWN') {
      if (!byCid.has(x.canonical_id)) byCid.set(x.canonical_id, []);
      byCid.get(x.canonical_id)!.push(x.account_key);
    }
  }
  const jewels = sortStr([...m.resources.values()].filter((r) => r.crown_jewel).map((r) => r.resource_id));
  const paths: Path[] = [];
  for (const cid of sortStr(byCid.keys())) {
    const prev = new Map<string, [string | null, string, string]>();
    const q: string[] = [];
    for (const ak of sortStr(byCid.get(cid)!)) { prev.set(`a:${ak}`, [null, 'has_account', '']); q.push(`a:${ak}`); }
    while (q.length) {
      const node = q.shift()!;
      for (const [t, dst, perm] of m.out.get(node) || []) {
        if (prev.has(dst)) continue;
        if (dst.startsWith('a:') && INACTIVE.has(m.accounts.get(dst.slice(2))!.normalized_state ?? '')) continue;
        prev.set(dst, [node, t, perm]);
        if (!dst.startsWith('r:')) q.push(dst);
      }
    }
    for (const rid of jewels) {
      let node: string | null = `r:${rid}`;
      if (!prev.has(node)) continue;
      const steps: Step[] = [];
      while (node) {
        const [parent, t, perm]: [string | null, string, string] = prev.get(node)!;
        const kind = ({ a: 'account', g: 'group', r: 'resource' } as Record<string, string>)[node[0]];
        steps.push({ kind, id: node.slice(2), label: label(m, node), edge: t, permission: perm });
        node = parent;
      }
      steps.reverse();
      paths.push({ canonical_id: cid, resource_id: rid, hops: steps.length - 1, via_takeover: steps.some((s) => s.edge === 'can_take_over'),
        permission: steps[steps.length - 1].permission, steps });
    }
  }
  return paths;
}

interface GFinding { key: string; group_key: string; finding_type: string; severity: string; detail: string }

function groupFindings(m: Model, closure: Closure, departments: Record<string, string>, leavers: Set<string>): GFinding[] {
  const emailToCid = new Map<string, Set<string>>();
  for (const x of m.accounts.values()) {
    if (x.principal_type === 'person' && x.email) {
      const e = x.email.toLowerCase();
      if (!emailToCid.has(e)) emailToCid.set(e, new Set());
      emailToCid.get(e)!.add(x.canonical_id);
    }
  }
  const ownerStatus = (owner: string) => {
    if (!owner) return 'none';
    if (!owner.includes('@')) return 'team';
    const cids = emailToCid.get(owner.toLowerCase()) ?? new Set<string>();
    if (cids.size !== 1) return 'unresolved';
    return leavers.has([...cids][0]) ? 'departed' : 'active';
  };
  const findings: GFinding[] = [];
  for (const gk of sortStr(m.groups.keys())) {
    const g = m.groups.get(gk)!;
    const takeovers = (m.out.get(`g:${gk}`) || []).some(([t]) => t === 'can_take_over');
    const eff: { account_key: string; display_name: string; username: string | null; principal_type: string | null; state: string | null; department: string; direct: boolean }[] = [];
    for (const [ak, chains] of closure) {
      const chain = chains.get(gk);
      if (!chain) continue;
      const x = m.accounts.get(ak)!;
      eff.push({ account_key: ak, display_name: x.display_name || x.username || '', username: x.username, principal_type: x.principal_type,
        state: x.normalized_state, department: departments[x.canonical_id] || '', direct: chain.length === 1 });
    }
    const finding = (t: string, detail: string) => findings.push({ key: `${t}|${gk}`, group_key: gk, finding_type: t, severity: GROUP_SEVERITY[t], detail });
    const status = ownerStatus(g.owner);
    if (status === 'none') finding('group_no_owner', `${g.name} has no owner of record${g.privileged || takeovers ? ' and controls privileged access' : ''}`);
    else if (status === 'departed') finding('group_owner_departed', `Owner ${g.owner} has left the company; ${g.name} needs a new owner`);
    if (!g.privileged) {
      const priv = g.parent_groups.map((p) => m.groups.get(p)!).filter((p) => p.privileged);
      if (priv.length) {
        finding('hidden_privilege_nesting', `${g.name} is not marked privileged but is nested in ${sortStr(priv.map((p) => p.name)).join(', ')}; its ${eff.length} member(s) inherit that access`);
      }
    }
    if (g.department) {
      const outside = eff.filter((x) => x.direct && x.principal_type === 'person' && x.department && x.department.toLowerCase() !== g.department.toLowerCase());
      if (outside.length) finding('member_outside_purpose', `Members outside ${g.department}: ${sortStr(outside.map((x) => `${x.display_name} (${x.department})`)).join(', ')}`);
    }
    const inactive = eff.filter((x) => INACTIVE.has(x.state ?? ''));
    if (inactive.length) {
      finding('inactive_members', `${inactive.length} disabled or deleted account(s) still in the group: ${sortStr(inactive.map((x) => x.username || x.account_key)).join(', ')}`);
    }
  }
  return findings;
}

const bandFor = (s: number): RiskBand => (s >= 70 ? 'critical' : s >= 40 ? 'high' : s >= 20 ? 'medium' : 'low');

interface Score { canonical_id: string; display_name: string; principal_type: string; score: number; band: RiskBand; factors: { factor: string; points: number; label: string }[] }

function scoreIdentities(m: Model, paths: Path[], closure: Closure, inp: SimInputs): Score[] {
  const w = { ...DEFAULT_WEIGHTS, ...(inp.weights || {}) } as Record<string, number>;
  const byCid = new Map<string, SimXref[]>();
  for (const x of m.accounts.values()) {
    if (!byCid.has(x.canonical_id)) byCid.set(x.canonical_id, []);
    byCid.get(x.canonical_id)!.push(x);
  }
  const pathsBy = new Map<string, Path[]>();
  for (const p of paths) { if (!pathsBy.has(p.canonical_id)) pathsBy.set(p.canonical_id, []); pathsBy.get(p.canonical_id)!.push(p); }
  const tlBy = new Map<string, SimInputs['timeline']>();
  for (const f of inp.timeline) if ((f.status ?? 'open') === 'open') { if (!tlBy.has(f.canonical_id)) tlBy.set(f.canonical_id, []); tlBy.get(f.canonical_id)!.push(f); }
  const idBy = new Map<string, number>();
  for (const f of inp.identity_findings) {
    if (f.canonical_id && HYGIENE.has(f.finding_type) && (f.status ?? 'open') === 'open') idBy.set(f.canonical_id, (idBy.get(f.canonical_id) ?? 0) + 1);
  }
  const scores: Score[] = [];
  for (const cid of sortStr(byCid.keys())) {
    const accts = byCid.get(cid)!;
    const active = accts.filter((x) => !INACTIVE.has(x.normalized_state ?? ''));
    const factors: { factor: string; category: string; points: number; label: string }[] = [];
    const add = (factor: string, category: string, points: number, lbl: string) => { if (points) factors.push({ factor, category, points, label: lbl }); };
    const mine = pathsBy.get(cid) || [];
    const direct = mine.filter((p) => !p.via_takeover);
    const takeover = mine.filter((p) => p.via_takeover);
    add('crown_jewel_access', 'exposure', Math.min(w.crown_jewel_cap, w.crown_jewel_access * direct.length), `Can reach ${direct.length} crown-jewel system(s)`);
    add('takeover_path', 'exposure', Math.min(w.takeover_cap, w.takeover_path * takeover.length), `Can take over another account to reach ${takeover.length} crown-jewel system(s)`);
    const privGroups = new Set<string>();
    let privOnStandard = false;
    for (const x of active) {
      for (const gk of closure.get(x.account_key)?.keys() ?? []) {
        const g = m.groups.get(gk)!;
        if (g.privileged) {
          privGroups.add(g.name);
          if (x.principal_type === 'person' && x.persona_type === 'standard') privOnStandard = true;
        }
      }
    }
    add('privileged_via_standard_account', 'exposure', privOnStandard ? w.privileged_via_standard_account : 0, 'Everyday account holds privileged access');
    add('standing_privilege', 'exposure', Math.min(w.standing_privilege_cap, w.standing_privilege * privGroups.size), `Standing member of ${privGroups.size} privileged group(s)`);
    const held = new Map<string, Set<string>>();
    for (const x of active) {
      const sources = [`a:${x.account_key}`, ...[...(closure.get(x.account_key)?.keys() ?? [])].map((g) => `g:${g}`)];
      for (const s of sources) for (const [t, d, p] of m.out.get(s) || []) {
        if (t === 'grants') { if (!held.has(d.slice(2))) held.set(d.slice(2), new Set()); held.get(d.slice(2))!.add(p); }
      }
    }
    for (const rule of SOD_RULES) {
      const h = held.get(rule.resource_id);
      if (h && rule.permissions.every((p) => h.has(p))) add('sod_conflict', 'hygiene', w.sod_conflict, `Toxic combination: ${rule.label}`);
    }
    const tl = tlBy.get(cid) || [];
    const high = tl.filter((f) => f.severity === 'high').length;
    const med = tl.filter((f) => f.severity === 'medium').length;
    add('timeline_findings', 'behaviour', Math.min(w.behaviour_cap, w.timeline_high * high + w.timeline_medium * med), `${tl.length} open timeline finding(s)`);
    const idf = idBy.get(cid) ?? 0;
    add('identity_findings', 'hygiene', w.identity_finding * idf, `${idf} identity hygiene finding(s)`);
    const home = active.filter((x) => x.persona_type !== 'guest');
    if (accts[0].principal_type === 'person' && home.length && !accts.some((x) => x.provider === 'duo' && x.normalized_state === 'ENABLED')) {
      add('no_mfa', 'hygiene', w.no_mfa, 'No active MFA enrolment found');
    }
    const stale = new Set<string>();
    for (const x of accts) {
      if (!INACTIVE.has(x.normalized_state ?? '')) continue;
      for (const g of closure.get(x.account_key)?.keys() ?? []) stale.add(`${x.username} in ${m.groups.get(g)!.name}`);
    }
    add('inactive_account_in_group', 'hygiene', Math.min(2 * w.inactive_account_in_group, w.inactive_account_in_group * stale.size), 'Disabled account still holds group memberships');
    const total = (c: string) => factors.filter((f) => f.category === c).reduce((s, f) => s + f.points, 0);
    const score = Math.min(100, total('exposure') + total('behaviour') + Math.min(w.hygiene_cap, total('hygiene')));
    const names = sortStr(new Set(accts.map((x) => x.display_name || x.username || '').filter(Boolean)));
    scores.push({ canonical_id: cid, display_name: names[0] ?? cid, principal_type: accts[0].principal_type ?? '', score, band: bandFor(score), factors });
  }
  return scores.sort((a, b) => (b.score - a.score) || cmp(a.canonical_id, b.canonical_id));
}

function applyChanges(inp: SimInputs, changes: ScenarioChange[], names: Map<string, string>) {
  const xrefs = inp.xrefs.map((x) => ({ ...x }));
  let groups = inp.groups.map((g) => ({ ...g, members: [...(g.members || [])] }));
  let edges = inp.edges.map((e) => ({ ...e }));
  const accBy = new Map(xrefs.map((x) => [x.account_key, x]));
  const grpBy = new Map<string, (typeof groups)[number]>();
  for (const g of groups) { const k = safeKey(g); if (k) grpBy.set(k, g); }
  const n = (k?: string) => names.get(k ?? '') ?? k ?? '';
  const describe = (c: ScenarioChange) => {
    switch (c.type) {
      case 'remove_membership': return `Remove ${n(c.member)} from ${n(c.group)}`;
      case 'revoke_grant': return `Revoke${c.permission ? ` '${c.permission}'` : ''} access to ${n(c.resource_id)} from ${n(c.source)}`;
      case 'remove_takeover': return `Remove ${n(c.source)}'s ability to take over ${n(c.target)}`;
      case 'disable_account': return `Disable account ${n(c.account)}`;
      default: return `Delete group ${n(c.group)}`;
    }
  };
  const applied: ScenarioChange[] = [];
  const rejected: ScenarioChange[] = [];
  for (const c of validateChanges(changes)) {
    let hit = 0;
    if (c.type === 'disable_account' && accBy.has(c.account!)) {
      const x = accBy.get(c.account!)!;
      hit = INACTIVE.has(x.normalized_state ?? '') ? 0 : 1;
      x.normalized_state = 'DISABLED';
    } else if (c.type === 'remove_membership' && grpBy.has(c.group!)) {
      const g = grpBy.get(c.group!)!;
      const before = g.members.length;
      g.members = g.members.filter((mm) => safeKey(mm) !== c.member);
      hit = before - g.members.length;
    } else if (c.type === 'delete_group' && grpBy.has(c.group!)) {
      const doomed = grpBy.get(c.group!)!;
      grpBy.delete(c.group!);
      groups = groups.filter((g) => g !== doomed);
      for (const g of groups) g.members = g.members.filter((mm) => safeKey(mm) !== c.group);
      edges = edges.filter((e) => safeKey(e.source) !== c.group);
      hit = 1;
    } else if (c.type === 'revoke_grant' || c.type === 'remove_takeover') {
      const match = (e: (typeof edges)[number]) => {
        if (safeKey(e.source) !== c.source) return false;
        if (c.type === 'revoke_grant') {
          return e.edge_type === 'grants' && String(e.target) === c.resource_id && (!c.permission || String(e.permission || '').toLowerCase() === c.permission);
        }
        return e.edge_type === 'can_take_over' && safeKey(e.target) === c.target;
      };
      const kept = edges.filter((e) => !match(e));
      hit = edges.length - kept.length;
      edges = kept;
    }
    const entry = { ...c, description: describe(c) };
    if (hit) applied.push(entry);
    else rejected.push({ ...entry, reason: 'Nothing matched this change in the current access data' });
  }
  return { xrefs, groups, edges, applied, rejected };
}

export function simulate(inp: SimInputs, changes: ScenarioChange[]): WhatIfResult {
  const names = new Map<string, string>(inp.resources.map((r) => [r.resource_id, r.name]));
  for (const g of inp.groups) { const k = safeKey(g); if (k) names.set(k, g.name); }
  for (const x of inp.xrefs) names.set(x.account_key, x.username || x.display_name || x.account_key);
  const leavers = new Set(inp.leavers);
  const run = (xrefs: SimXref[], groups: SimInputs['groups'], edges: SimInputs['edges']) => {
    const m = buildModel(xrefs, inp.resources, groups, edges);
    const paths = attackPaths(m);
    const closure = groupClosure(m);
    return { m, paths, closure, findings: groupFindings(m, closure, inp.departments, leavers), scores: scoreIdentities(m, paths, closure, inp) };
  };
  const r0 = run(inp.xrefs, inp.groups, inp.edges);
  const changed = applyChanges(inp, changes, names);
  const r1 = run(changed.xrefs, changed.groups, changed.edges);

  const display = new Map(r0.scores.map((s) => [s.canonical_id, s.display_name]));
  const pathRow = (p: Path, m: Model): WhatIfPath => ({
    canonical_id: p.canonical_id, display_name: display.get(p.canonical_id) ?? p.canonical_id, resource_id: p.resource_id,
    resource: m.resources.get(p.resource_id)!.name, permission: p.permission, hops: p.hops, via_takeover: p.via_takeover,
    steps: p.steps.map((s) => s.label),
  });
  const keyOf = (p: Path) => `${p.canonical_id}\u0000${p.resource_id}`;
  const before = new Map(r0.paths.map((p) => [keyOf(p), p]));
  const after = new Map(r1.paths.map((p) => [keyOf(p), p]));
  const removed = sortStr([...before.keys()].filter((k) => !after.has(k))).map((k) => pathRow(before.get(k)!, r0.m));
  const added = sortStr([...after.keys()].filter((k) => !before.has(k))).map((k) => pathRow(after.get(k)!, r1.m));
  const rerouted: WhatIfPath[] = [];
  for (const k of sortStr([...before.keys()].filter((k) => after.has(k)))) {
    const old = pathRow(before.get(k)!, r0.m);
    const neu = pathRow(after.get(k)!, r1.m);
    if (old.steps.join('\u0000') !== neu.steps.join('\u0000')) rerouted.push({ ...neu, previous_steps: old.steps });
  }

  const sAfter = new Map(r1.scores.map((s) => [s.canonical_id, s]));
  const scoreChanges: WhatIfScoreChange[] = [];
  for (const s of r0.scores) {
    const a = sAfter.get(s.canonical_id);
    if (!a) continue;
    const f0 = new Map(s.factors.map((f) => [f.factor, f]));
    const f1 = new Map(a.factors.map((f) => [f.factor, f]));
    const cleared = sortStr([...f0.keys()].filter((k) => !f1.has(k))).map((k) => f0.get(k)!.label);
    const neu = sortStr([...f1.keys()].filter((k) => !f0.has(k))).map((k) => f1.get(k)!.label);
    const ch = sortStr([...f0.keys()].filter((k) => f1.has(k)))
      .filter((k) => f0.get(k)!.points !== f1.get(k)!.points || f0.get(k)!.label !== f1.get(k)!.label)
      .map((k) => ({ before: f0.get(k)!.label, after: f1.get(k)!.label, points_before: f0.get(k)!.points, points_after: f1.get(k)!.points }));
    if (a.score !== s.score || cleared.length || neu.length || ch.length) {
      scoreChanges.push({ canonical_id: s.canonical_id, display_name: s.display_name, principal_type: s.principal_type,
        score_before: s.score, score_after: a.score, delta: a.score - s.score, band_before: s.band, band_after: a.band,
        factors_cleared: cleared, factors_added: neu, factors_changed: ch });
    }
  }
  scoreChanges.sort((x, y) => (x.delta - y.delta) || cmp(x.display_name, y.display_name));

  const membershipsLost: WhatIfResult['memberships_lost'] = [];
  for (const [ak, chains] of r0.closure) {
    const now = r1.closure.get(ak);
    const x = r0.m.accounts.get(ak)!;
    for (const gk of sortStr([...chains.keys()].filter((g) => !now?.has(g)))) {
      const g = r0.m.groups.get(gk)!;
      membershipsLost.push({ canonical_id: x.canonical_id, display_name: display.get(x.canonical_id) ?? x.canonical_id, account_key: ak,
        username: x.username, group: g.name, privileged: g.privileged, direct: chains.get(gk)!.length === 1 });
    }
  }
  membershipsLost.sort((a, b) => cmp(a.display_name, b.display_name) || cmp(a.group, b.group));

  const fmt = (f: GFinding, m: Model) => ({ finding_type: f.finding_type, severity: f.severity, group: m.groups.get(f.group_key)?.name ?? f.group_key, detail: f.detail });
  const fAfter = new Set(r1.findings.map((f) => f.key));
  const fBefore = new Set(r0.findings.map((f) => f.key));
  const resolved = r0.findings.filter((f) => !fAfter.has(f.key)).map((f) => fmt(f, r0.m));
  const fAdded = r1.findings.filter((f) => !fBefore.has(f.key)).map((f) => fmt(f, r0.m));

  const people = (paths: Path[], m: Model) => {
    const personCids = new Set([...m.accounts.values()].filter((x) => x.principal_type === 'person').map((x) => x.canonical_id));
    const out = new Map<string, Set<string>>();
    for (const p of paths) if (personCids.has(p.canonical_id)) { if (!out.has(p.resource_id)) out.set(p.resource_id, new Set()); out.get(p.resource_id)!.add(p.canonical_id); }
    return out;
  };
  const pp0 = people(r0.paths, r0.m);
  const pp1 = people(r1.paths, r1.m);
  const lockouts = sortStr(pp0.keys()).filter((rid) => !pp1.get(rid)?.size)
    .map((rid) => ({ resource_id: rid, resource: r0.m.resources.get(rid)!.name, people_before: pp0.get(rid)!.size }));

  const affected = new Set([...scoreChanges.map((r) => r.canonical_id), ...membershipsLost.map((r) => r.canonical_id)]);
  return {
    version: 'identity-whatif-v1', applied: changed.applied, rejected: changed.rejected,
    summary: {
      changes_applied: changed.applied.length, changes_rejected: changed.rejected.length,
      paths_before: r0.paths.length, paths_after: r1.paths.length, paths_removed: removed.length, paths_added: added.length,
      identities_affected: affected.size,
      risk_points_removed: -scoreChanges.filter((r) => r.delta < 0).reduce((s, r) => s + r.delta, 0),
      risk_points_added: scoreChanges.filter((r) => r.delta > 0).reduce((s, r) => s + r.delta, 0),
      critical_before: r0.scores.filter((s) => s.band === 'critical').length,
      critical_after: r1.scores.filter((s) => s.band === 'critical').length,
      group_findings_resolved: resolved.length, group_findings_added: fAdded.length,
      memberships_lost: membershipsLost.length, lockouts: lockouts.length,
    },
    paths_removed: removed, paths_added: added, paths_rerouted: rerouted, score_changes: scoreChanges,
    memberships_lost: membershipsLost, group_findings_resolved: resolved, group_findings_added: fAdded, lockouts,
  };
}
