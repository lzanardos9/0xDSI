// Checks that the browser copy of the what-if simulator agrees with the Python original.
// Runs every sample scenario plus a batch of generated ones through both engines on the same inputs.
// Usage: node --experimental-strip-types tools/identity_preview/check_whatif_parity.mts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { simulate } from '../../src/lib/identityWhatIfEngine.ts';

const preview = JSON.parse(readFileSync('public/identity-preview.json', 'utf8'));
const inputs = preview.whatifInputs;
const options = preview.whatifOptions;

let seed = 7;
const rand = (n: number) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const pools = [
  options.memberships.map((m: Record<string, string>) => ({ type: 'remove_membership', group: m.group, member: m.member })),
  options.grants.map((g: Record<string, string>) => ({ type: 'revoke_grant', source: g.source, resource_id: g.resource_id, ...(g.permission ? { permission: g.permission } : {}) })),
  options.takeovers.map((t: Record<string, string>) => ({ type: 'remove_takeover', source: t.source, target: t.target })),
  options.accounts.map((a: Record<string, string>) => ({ type: 'disable_account', account: a.account })),
  options.groups.map((g: Record<string, string>) => ({ type: 'delete_group', group: g.group_key })),
].filter((p) => p.length);

const scenarios: { name: string; changes: object[] }[] = preview.whatifScenarios.scenarios.map((s: { name: string; changes: object[] }) => ({ name: s.name, changes: s.changes }));
for (let i = 0; i < 60; i++) {
  const changes = Array.from({ length: 1 + rand(3) }, () => { const p = pools[rand(pools.length)]; return p[rand(p.length)]; });
  scenarios.push({ name: `generated ${i + 1}`, changes });
}

const py = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'databricks-native/notebooks/_shared')
from identity_whatif import simulate
d = json.load(open('public/identity-preview.json'))['whatifInputs']
events = [{"canonical_id": c, "event_type": "hr_joiner", "occurred_at": "1", "detail": {"department": dep}} for c, dep in d["departments"].items()]
events += [{"canonical_id": c, "event_type": "hr_leaver", "occurred_at": "2", "detail": {}} for c in d["leavers"]]
out = []
for s in json.loads(sys.stdin.read()):
    out.append(simulate(d["xrefs"], d["resources"], d["groups"], d["edges"], s["changes"], events, d["timeline"], d["identity_findings"], d["weights"]))
print(json.dumps(out))
`], { input: JSON.stringify(scenarios), maxBuffer: 64 * 1024 * 1024 }).toString());

const canon = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(canon);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, x]) => [k, canon(x)]));
  return v;
};
const unordered = (xs: object[]) => xs.map((x) => JSON.stringify(canon(x))).sort();

let bad = 0;
scenarios.forEach((s, i) => {
  const ts = simulate(inputs, s.changes as never) as unknown as Record<string, unknown>;
  const p = py[i] as Record<string, unknown>;
  p.memberships_lost = (p.memberships_lost as Record<string, unknown>[]).map(({ group_key: _g, ...rest }) => rest);
  for (const k of ['group_findings_resolved', 'group_findings_added']) { ts[k] = unordered(ts[k] as object[]); p[k] = unordered(p[k] as object[]); }
  const a = JSON.stringify(canon(ts));
  const b = JSON.stringify(canon(p));
  if (a !== b) {
    bad += 1;
    for (const k of Object.keys(p)) {
      if (JSON.stringify(canon(ts[k])) !== JSON.stringify(canon(p[k]))) console.log(`DIFF ${s.name} :: ${k}\n  ts ${JSON.stringify(canon(ts[k])).slice(0, 600)}\n  py ${JSON.stringify(canon(p[k])).slice(0, 600)}`);
    }
  }
});
console.log(`${scenarios.length - bad}/${scenarios.length} scenarios match`);
process.exit(bad ? 1 : 0);
