// Checks that the browser custody helpers produce the same canonical bytes, digest and seal as identity_custody.py.
// Usage: node --experimental-strip-types tools/identity_preview/check_custody_parity.mts
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { canonical, hmacHex, keyId, recordDigest, sealMessage } from '../../src/components/identity/identityCustody.ts';

const KEY = 'preview-parity-key-0123456789abcdef';
const preview = JSON.parse(readFileSync('public/identity-preview.json', 'utf8'));
const xrefs: Record<string, unknown>[] = preview.whatifInputs.xrefs.slice(0, 20);
const records: Record<string, unknown>[] = xrefs.map((x, i) => ({
  event_id: `evt-${i}`, occurred_at: `2026-10-30T14:${String(i).padStart(2, '0')}:05Z`, provider: x.provider, tenant: i % 3 ? null : 'aa.com',
  canonical_id: x.canonical_id, account_key: x.account_key, event_type: 'sign_in_failure', category: 'sign_in',
  detail: JSON.stringify({ country: ['US', 'BR', 'IN'][i % 3], application: 'Crew Portal', rows: i * 37 }), link_status: 'linked',
  actor: i % 2 ? `Jo\u00e3o "${x.username}" \\ admin\n` : null, nested: { z: [1, 2.5, -3, true, null], a: { k: 'v\u00e9', emoji: '\u2713' } },
}));

const py = JSON.parse(execFileSync('python3', ['-c', `
import json, sys
sys.path.insert(0, 'databricks-native/app/backend')
import identity_custody as C
key = sys.argv[1].encode()
out = []
for r in json.loads(sys.stdin.read()):
    s = C.seal(r, key, "2026-10-30T15:00:00Z")
    out.append({"canonical": C.canonical(r), "digest": s["digest"], "signature": s["signature"], "key_id": s["key_id"]})
print(json.dumps(out))
`, KEY], { input: JSON.stringify(records) }).toString());

let ok = 0;
for (let i = 0; i < records.length; i++) {
  const r = records[i];
  const digest = await recordDigest(r);
  const signature = await hmacHex(KEY, sealMessage(String(r.event_id), digest, '2026-10-30T15:00:00Z'));
  const kid = await keyId(KEY);
  const same = canonical(r) === py[i].canonical && digest === py[i].digest && signature === py[i].signature && kid === py[i].key_id;
  if (same) ok++;
  else console.log(`MISMATCH ${r.event_id}\n  ts ${canonical(r)}\n  py ${py[i].canonical}`);
}
console.log(`${ok}/${records.length} records seal the same`);
if (ok !== records.length) process.exit(1);
