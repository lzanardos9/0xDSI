// Mirrors identity_custody.py: the same canonical bytes, SHA-256 digest and HMAC-SHA256 seal, so the browser can re-check a record.

export const CANONICALIZATION = 'JSON, keys sorted, no whitespace, UTF-8';

export function canonical(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return `{${Object.keys(obj).sort().map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('Records cannot hold NaN or Infinity');
  return JSON.stringify(value);
}

function subtle() {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Verification needs a secure (https) connection');
  return s;
}

const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string): Promise<string> {
  return hex(await subtle().digest('SHA-256', new TextEncoder().encode(text)));
}

export const recordDigest = (record: Record<string, unknown>) => sha256Hex(canonical(record));

export const sealMessage = (eventId: string, digest: string, signedAt: string) => `${eventId}\n${digest}\n${signedAt}`;

export async function hmacHex(key: string, message: string): Promise<string> {
  const k = await subtle().importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await subtle().sign('HMAC', k, new TextEncoder().encode(message)));
}

export async function keyId(key: string): Promise<string> {
  return `k-${(await sha256Hex(key)).slice(0, 12)}`;
}

export function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
