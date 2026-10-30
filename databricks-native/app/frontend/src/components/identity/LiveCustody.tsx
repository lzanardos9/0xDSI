import { useEffect, useState } from 'react';
import { Check, Copy, Download, Fingerprint, FlaskConical, Inbox, Link2, Lock, RotateCcw, ShieldAlert, ShieldCheck, Eye, Database, type LucideIcon } from 'lucide-react';
import { identityApi, type CustodyStep, type CustodyVerification, type LiveEventDetail } from '../../lib/identityApi';
import { recordDigest } from './identityCustody';
import { fmtTime } from './identityUi';

const STEP: Record<CustodyStep['step'], { label: string; icon: LucideIcon }> = {
  received: { label: 'Received from source', icon: Inbox },
  ingested: { label: 'Ingested', icon: Database },
  linked: { label: 'Linked to identity', icon: Link2 },
  sealed: { label: 'Sealed', icon: Lock },
  accessed: { label: 'Viewed', icon: Eye },
};

function JsonView({ text }: { text: string }) {
  const parts = text.split(/("(?:\\.|[^"\\])*"(?:\s*:)?|\b-?\d+(?:\.\d+)?\b|\btrue\b|\bfalse\b|\bnull\b)/g);
  return (
    <pre className="text-[11px] leading-relaxed font-mono whitespace-pre-wrap break-all text-slate-300">
      {parts.map((p, i) => {
        if (i % 2 === 0) return p;
        const cls = p.endsWith(':') ? 'text-sky-300' : p.startsWith('"') ? 'text-teal-200' : p === 'null' ? 'text-slate-500' : 'text-amber-200';
        return <span key={i} className={cls}>{p}</span>;
      })}
    </pre>
  );
}

export function RawPanel({ detail, text, setText, original }: {
  detail: LiveEventDetail; text: string; setText: (t: string) => void; original: string;
}) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const tampered = text !== original;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const body = JSON.stringify({ raw: detail.raw, custody: detail.custody, exported_at: new Date().toISOString() }, null, 2);
    const url = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `identity-event-${detail.event.event_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const btn = 'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] transition-colors';
  return (
    <div className="space-y-3 animate-fade-in">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className={`${btn} border-slate-700/60 text-slate-300 hover:bg-slate-800`}>
          {copied ? <Check size={12} className="text-emerald-300" /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
        </button>
        <button type="button" onClick={download} className={`${btn} border-slate-700/60 text-slate-300 hover:bg-slate-800`}>
          <Download size={12} /> Download with seal
        </button>
        <button type="button" onClick={() => setEditing(!editing)} aria-pressed={editing}
          className={`${btn} ${editing ? 'border-amber-400/50 bg-amber-500/10 text-amber-100' : 'border-slate-700/60 text-slate-300 hover:bg-slate-800'}`}>
          <FlaskConical size={12} /> Tamper test
        </button>
        {tampered && (
          <button type="button" onClick={() => setText(original)} className={`${btn} border-slate-700/60 text-slate-300 hover:bg-slate-800`}>
            <RotateCcw size={12} /> Restore original
          </button>
        )}
      </div>
      {editing && (
        <p className="text-[11px] text-amber-200/90">Change any value below, then open Chain of custody and press Verify to see the seal break.</p>
      )}
      <div className={`rounded-xl border p-3 bg-slate-950/60 ${tampered ? 'border-amber-400/40' : 'border-slate-700/50'}`}>
        {editing ? (
          <textarea value={text} onChange={(ev) => setText(ev.target.value)} spellCheck={false} aria-label="Raw event record"
            className="w-full min-h-[340px] bg-transparent text-[11px] leading-relaxed font-mono text-slate-200 focus:outline-none resize-y" />
        ) : <JsonView text={text} />}
      </div>
      <p className="text-[10px] text-slate-500">Exactly as stored in the identity event table. Downloads include the digest and signature so an auditor can re-check them later.</p>
    </div>
  );
}

function Check3({ ok, label, hint }: { ok: boolean | null; label: string; hint: string }) {
  const color = ok === null ? '#94a3b8' : ok ? '#34d399' : '#f87171';
  const Icon = ok === null ? ShieldAlert : ok ? ShieldCheck : ShieldAlert;
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg border animate-scale-in" style={{ borderColor: `${color}44`, background: `${color}0d` }}>
      <Icon size={15} style={{ color }} className="mt-0.5 flex-shrink-0" />
      <div>
        <div className="text-xs font-medium" style={{ color }}>{label}</div>
        <div className="text-[11px] text-slate-400 mt-0.5">{hint}</div>
      </div>
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={`text-[11px] text-slate-200 mt-0.5 break-all ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

export function CustodyPanel({ detail, text }: { detail: LiveEventDetail; text: string }) {
  const c = detail.custody;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ local: string; local_ok: boolean; server: CustodyVerification } | null>(null);

  useEffect(() => { setResult(null); setError(''); }, [text, detail.event.event_id]);

  const verify = async () => {
    setBusy(true);
    setError('');
    try {
      let parsed: unknown;
      try { parsed = JSON.parse(text); } catch { throw new Error('The raw data is no longer valid JSON, so it cannot match its seal'); }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The raw data must be a single record');
      const local = await recordDigest(parsed as Record<string, unknown>);
      const server = await identityApi.verifyLiveEvent(detail.event.event_id, { digest: local, signature: c.signature, signed_at: c.signed_at });
      if (!server || typeof server.record_matches !== 'boolean') throw new Error('The verifier returned an unexpected response');
      setResult({ local, local_ok: local === c.digest, server });
    } catch (e) {
      setError((e as Error).message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const all = result && result.local_ok && result.server.record_matches && result.server.signature_valid !== false;

  return (
    <div className="space-y-4 animate-fade-in">
      <ol className="relative ml-3 border-l border-slate-700/60 space-y-3">
        {c.trail.map((s, i) => {
          const m = STEP[s.step] ?? { label: s.step, icon: Fingerprint };
          return (
            <li key={`${s.step}-${i}`} className="relative pl-5 animate-slide-up" style={{ animationDelay: `${i * 60}ms` }}>
              <span className="absolute -left-[13px] top-0 w-6 h-6 rounded-full bg-slate-900 border border-teal-400/40 flex items-center justify-center">
                <m.icon size={11} className="text-teal-200" />
              </span>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs font-medium text-slate-100">{m.label}</span>
                <span className="text-[10px] text-slate-500 tabular-nums">{fmtTime(s.at)}</span>
              </div>
              <div className="text-[11px] text-slate-400">{s.by}{s.detail ? ` · ${s.detail}` : ''}</div>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border border-slate-700/50 bg-slate-950/50 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2"><Field label={`Digest (${c.digest_algorithm})`} value={c.digest} mono /></div>
        <div className="sm:col-span-2"><Field label={`Signature (${c.algorithm ?? 'none'})`} value={c.signature ?? 'Not signed. Add a custody signing key to sign records.'} mono={!!c.signature} /></div>
        <Field label="Key" value={c.key_id ? `${c.key_id}${c.signer ? ` · ${c.signer}` : ''}` : 'No key configured'} />
        <Field label="Sealed at" value={fmtTime(c.signed_at)} />
        <div className="sm:col-span-2"><Field label="Canonical form" value={c.canonicalization} /></div>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={verify} disabled={busy}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-teal-500/90 hover:bg-teal-400 text-slate-950 text-xs font-semibold transition-colors disabled:opacity-60">
          <ShieldCheck size={14} /> {busy ? 'Verifying…' : 'Verify integrity'}
        </button>
        {result && (
          <span className={`text-xs font-medium ${all ? 'text-emerald-300' : 'text-red-300'}`}>
            {all ? 'Chain of custody intact' : 'Seal broken: this record was changed'}
          </span>
        )}
      </div>
      {error && <p className="text-xs text-red-300">{error}</p>}
      {result && (
        <div className="grid gap-2">
          <Check3 ok={result.local_ok} label={result.local_ok ? 'Data matches its digest' : 'Data does not match its digest'}
            hint={`Recomputed in your browser: ${result.local.slice(0, 16)}…`} />
          <Check3 ok={result.server.record_matches} label={result.server.record_matches ? 'Matches the stored row' : 'Differs from the stored row'}
            hint={`Server re-read the row at ${fmtTime(result.server.checked_at)} (${result.server.stored_digest.slice(0, 16)}…)`} />
          <Check3 ok={result.server.signature_valid}
            label={result.server.signature_valid === null ? 'No signature to check' : result.server.signature_valid ? 'Signature is valid' : 'Signature does not match'}
            hint={result.server.signature_valid === null ? 'Records are hashed but not signed until a signing key is added.' : `Checked by ${result.server.checked_by}`} />
        </div>
      )}
    </div>
  );
}
