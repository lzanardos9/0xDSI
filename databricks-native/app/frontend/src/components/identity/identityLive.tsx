import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LogIn, ShieldX, ShieldCheck, KeyRound, UserPlus, UserMinus, UserCheck, Users, RefreshCw, Download, Database,
  Briefcase, Activity, Smartphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { identityApi, type AttackPath, type LiveEvent, type LiveFeed } from '../../lib/identityApi';

export type LiveTone = 'info' | 'notice' | 'warn' | 'alert';

export const TONE_COLOR: Record<LiveTone, string> = {
  info: '#2dd4bf',
  notice: '#38bdf8',
  warn: '#fbbf24',
  alert: '#f87171',
};

export interface LiveView {
  title: string;
  subtitle: string;
  short: string;
  tone: LiveTone;
  icon: LucideIcon;
}

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

export function describeLiveEvent(e: LiveEvent): LiveView {
  const d = e.detail || {};
  const who = e.display_name || e.username || 'Unlinked account';
  const app = str(d.application) || str(d.resource);
  const country = str(d.country);
  const ticket = str(d.ticket);
  switch (e.event_type) {
    case 'sign_in_success':
      return { title: `${who} signed in`, subtitle: [app, country].filter(Boolean).join(' · ') || 'Sign-in', short: 'Signed in', tone: 'info', icon: LogIn };
    case 'sign_in_failure':
      return { title: `Failed sign-in for ${who}`, subtitle: [app, country && `from ${country}`].filter(Boolean).join(' · ') || 'Sign-in failed',
        short: 'Sign-in failed', tone: country && country !== 'US' ? 'warn' : 'notice', icon: ShieldX };
    case 'mfa_denied': {
      const n = Number(d.attempts) || 1;
      return { title: `MFA push denied by ${who}`, subtitle: `${n} prompt${n === 1 ? '' : 's'}${app ? ` · ${app}` : ''}`, short: 'MFA denied', tone: n >= 3 ? 'alert' : 'warn', icon: Smartphone };
    }
    case 'mfa_lockout':
      return { title: `${who} locked out of MFA`, subtitle: 'Too many denied prompts', short: 'MFA lockout', tone: 'alert', icon: ShieldX };
    case 'mfa_reset':
      return { title: `MFA reset for ${who}`, subtitle: e.actor ? `By ${e.actor}` : 'Factor reset', short: 'MFA reset', tone: 'warn', icon: Smartphone };
    case 'mfa_enrolled':
    case 'mfa_device_added':
      return { title: `${who} enrolled MFA`, subtitle: str(d.method) || 'New factor', short: 'MFA enrolled', tone: 'info', icon: ShieldCheck };
    case 'password_reset': {
      const target = str(d.target) || e.username || who;
      const route = Boolean(d.path_id);
      return { title: `Password reset on ${target}`, subtitle: `${e.actor ? `By ${e.actor}` : 'Reset'}${route ? ' · a takeover route to a crown jewel' : ''}`,
        short: route ? 'Takeover reset' : 'Password reset', tone: route ? 'alert' : 'notice', icon: KeyRound };
    }
    case 'credential_rotated':
      return { title: `${who} rotated a credential`, subtitle: [str(d.credential), e.actor].filter(Boolean).join(' · ') || 'Credential rotated', short: 'Key rotated', tone: 'info', icon: RefreshCw };
    case 'entitlement_granted':
    case 'privilege_granted': {
      const priv = e.event_type === 'privilege_granted';
      return { title: `${who} added to ${str(d.entitlement) || 'a group'}`, subtitle: ticket ? `Ticket ${ticket}` : 'No ticket on record',
        short: priv ? 'Privilege granted' : 'Access granted', tone: !ticket ? (priv ? 'alert' : 'warn') : 'notice', icon: UserPlus };
    }
    case 'entitlement_revoked':
    case 'privilege_revoked':
      return { title: `${who} removed from ${str(d.entitlement) || 'a group'}`, subtitle: e.actor ? `By ${e.actor}` : 'Access removed', short: 'Access removed', tone: 'info', icon: UserMinus };
    case 'account_created':
      return { title: 'New account discovered', subtitle: `${e.username || str(d.username) || 'Unknown'} · waiting to be linked`, short: 'New account', tone: 'notice', icon: UserPlus };
    case 'account_disabled':
      return { title: `Account disabled for ${who}`, subtitle: e.actor ? `By ${e.actor}` : 'Disabled', short: 'Disabled', tone: 'info', icon: UserMinus };
    case 'account_enabled':
      return { title: `Account enabled for ${who}`, subtitle: e.actor ? `By ${e.actor}` : 'Enabled', short: 'Enabled', tone: 'notice', icon: UserCheck };
    case 'resource_access': {
      const op = str(d.operation) || 'read';
      const rows = Number(d.rows);
      const verb = op === 'export' ? 'exported' : op === 'write' ? 'wrote to' : 'queried';
      return { title: `${who} ${verb} ${str(d.resource) || 'a system'}`, subtitle: rows ? `${rows.toLocaleString()} rows` : 'Data access',
        short: op === 'export' ? 'Export' : 'Data access', tone: op === 'export' ? 'warn' : 'info', icon: op === 'export' ? Download : Database };
    }
    case 'hr_joiner':
    case 'hr_rehire':
      return { title: `${who} joined`, subtitle: str(d.department) || 'New hire', short: 'Joined', tone: 'info', icon: Briefcase };
    case 'hr_mover':
      return { title: `${who} moved teams`, subtitle: str(d.to_department) || 'Department change', short: 'Moved', tone: 'notice', icon: Users };
    case 'hr_leaver':
      return { title: `${who} left the company`, subtitle: 'Access should be removed', short: 'Left', tone: 'warn', icon: UserMinus };
    default:
      return { title: `${who}: ${e.event_type.replace(/_/g, ' ')}`, subtitle: e.category.replace(/_/g, ' '), short: e.event_type.replace(/_/g, ' '), tone: 'info', icon: Activity };
  }
}

export function liveTargets(e: LiveEvent, paths: AttackPath[]): { nodes: string[]; paths: string[] } {
  const pid = str(e.detail?.path_id);
  const exact = pid ? paths.filter((p) => p.path_id === pid) : [];
  const hit = exact.length ? exact : e.canonical_id ? paths.filter((p) => p.canonical_id === e.canonical_id) : [];
  const nodes = new Set<string>();
  if (e.canonical_id && hit.length) nodes.add(`p:${e.canonical_id}`);
  if (e.account_key) nodes.add(e.account_key);
  return { nodes: [...nodes], paths: hit.map((p) => p.path_id) };
}

const DRIP_MS = 1400;
const MAX_KEPT = 40;

export interface LiveState {
  events: LiveEvent[];
  fresh: LiveEvent | null;
  freshIds: Set<string>;
  meta: Pick<LiveFeed, 'events_24h' | 'mode' | 'as_of'> | null;
  error: string;
  paused: boolean;
  setPaused: (p: boolean) => void;
}

export function useLiveFeed(): LiveState {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [fresh, setFresh] = useState<LiveEvent | null>(null);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());
  const [meta, setMeta] = useState<LiveState['meta']>(null);
  const [error, setError] = useState('');
  const [paused, setPaused] = useState(false);
  const seen = useRef<Set<string> | null>(null);
  const queue = useRef<LiveEvent[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const poll = useCallback(async (): Promise<number> => {
    try {
      const feed = await identityApi.liveEvents();
      if (!feed || !Array.isArray(feed.events)) throw new Error('The live feed returned an unexpected response');
      setMeta({ events_24h: Number(feed.events_24h) || 0, mode: feed.mode, as_of: feed.as_of });
      setError('');
      if (!seen.current) {
        seen.current = new Set(feed.events.map((e) => e.event_id));
        setEvents(feed.events.slice(0, MAX_KEPT));
      } else {
        const known = seen.current;
        const incoming = feed.events.filter((e) => !known.has(e.event_id)).reverse();
        incoming.forEach((e) => known.add(e.event_id));
        queue.current.push(...incoming);
      }
      return Math.max(2000, Number(feed.poll_ms) || 15000);
    } catch (e) {
      setError((e as Error).message || 'The live feed is unavailable');
      return 30000;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const wait = await poll();
      if (alive) timer = setTimeout(loop, wait);
    };
    loop();
    return () => { alive = false; clearTimeout(timer); };
  }, [poll]);

  useEffect(() => {
    const t = setInterval(() => {
      if (pausedRef.current || !queue.current.length) return;
      const next = queue.current.shift()!;
      setEvents((cur) => [next, ...cur.filter((e) => e.event_id !== next.event_id)].slice(0, MAX_KEPT));
      setFresh(next);
      setFreshIds((cur) => new Set([...cur, next.event_id].slice(-8)));
    }, DRIP_MS);
    return () => clearInterval(t);
  }, []);

  return { events, fresh, freshIds, meta, error, paused, setPaused };
}

export function useNow(intervalMs = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function timeAgo(iso: string, now: number) {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AnimatedNumber({ value, className = '', duration = 1100 }: { value: number; className?: string; duration?: number }) {
  const [shown, setShown] = useState(0);
  const [bump, setBump] = useState(0);
  const from = useRef(0);
  const first = useRef(true);

  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const grew = !first.current && value > a;
    first.current = false;
    if (grew) setBump((b) => b + 1);
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      const v = Math.round(a + (value - a) * (1 - Math.pow(1 - k, 3)));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return <span key={bump} className={`tabular-nums ${bump ? 'id-num-bump' : ''} ${className}`}>{shown.toLocaleString()}</span>;
}
