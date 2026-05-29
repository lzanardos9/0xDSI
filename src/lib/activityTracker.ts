import { supabase } from './supabase';

const SESSION_KEY = 'activity_session_id';
const TOKEN_KEY = 'activity_session_token';

type EventInput = {
  eventType: 'login' | 'logout' | 'view' | 'navigate' | 'click' | 'action' | 'error';
  category?: 'auth' | 'navigation' | 'interaction' | 'system';
  viewId?: string;
  viewLabel?: string;
  targetId?: string;
  targetLabel?: string;
  targetKind?: string;
  referrerView?: string;
  properties?: Record<string, unknown>;
  durationMs?: number;
};

let cachedSessionId: string | null = null;
let cachedSessionToken: string | null = null;
let cachedUser: { id: string | null; username: string } = { id: null, username: 'anonymous' };
let lastEventId: string | null = null;
let lastViewId: string | null = null;
let lastEventAt: number = Date.now();

const queue: Array<() => Promise<void>> = [];
let flushing = false;

async function drain() {
  if (flushing) return;
  flushing = true;
  while (queue.length) {
    const fn = queue.shift();
    if (fn) {
      try { await fn(); } catch { /* swallow */ }
    }
  }
  flushing = false;
}

function enqueue(fn: () => Promise<void>) {
  queue.push(fn);
  void drain();
}

function getOrCreateToken(): string {
  let t = sessionStorage.getItem(TOKEN_KEY);
  if (!t) {
    t = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    sessionStorage.setItem(TOKEN_KEY, t);
  }
  return t;
}

async function getIp(): Promise<string> {
  try {
    const r = await fetch('https://api.ipify.org?format=json', { cache: 'force-cache' });
    if (!r.ok) return 'unknown';
    const j = await r.json();
    return j.ip ?? 'unknown';
  } catch {
    return 'unknown';
  }
}

export function setActivityUser(user: { id: string | null; username: string }) {
  cachedUser = user;
}

export async function ensureSession(): Promise<string> {
  if (cachedSessionId) return cachedSessionId;
  const fromStorage = sessionStorage.getItem(SESSION_KEY);
  if (fromStorage) {
    cachedSessionId = fromStorage;
    cachedSessionToken = getOrCreateToken();
    return fromStorage;
  }
  const token = getOrCreateToken();
  const ip = await getIp();
  const { data } = await supabase
    .from('user_activity_sessions')
    .insert({
      user_id: cachedUser.id,
      username: cachedUser.username,
      session_token: token,
      ip_address: ip,
      user_agent: navigator.userAgent.slice(0, 500),
      device_type: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'web',
    })
    .select('id')
    .maybeSingle();
  if (data?.id) {
    cachedSessionId = data.id as string;
    cachedSessionToken = token;
    sessionStorage.setItem(SESSION_KEY, cachedSessionId);
  }
  return cachedSessionId ?? '';
}

export async function attachSessionToUser(userId: string, username: string) {
  cachedUser = { id: userId, username };
  const sid = await ensureSession();
  if (!sid) return;
  await supabase
    .from('user_activity_sessions')
    .update({ user_id: userId, username })
    .eq('id', sid);
}

export async function endSession() {
  const sid = cachedSessionId;
  if (!sid) return;
  await supabase
    .from('user_activity_sessions')
    .update({ ended_at: new Date().toISOString(), is_active: false })
    .eq('id', sid);
  cachedSessionId = null;
  cachedSessionToken = null;
  sessionStorage.removeItem(SESSION_KEY);
}

export function trackEvent(input: EventInput) {
  enqueue(async () => {
    const sid = await ensureSession();
    if (!sid) return;
    const now = Date.now();
    const delta = now - lastEventAt;
    lastEventAt = now;

    const payload = {
      session_id: sid,
      user_id: cachedUser.id,
      username: cachedUser.username,
      event_type: input.eventType,
      event_category: input.category ?? 'interaction',
      view_id: input.viewId ?? lastViewId ?? '',
      view_label: input.viewLabel ?? '',
      target_id: input.targetId ?? '',
      target_label: input.targetLabel ?? '',
      target_kind: input.targetKind ?? 'unknown',
      parent_event_id: lastEventId,
      path: location.pathname + location.hash,
      referrer_view: input.referrerView ?? lastViewId ?? '',
      user_agent: navigator.userAgent.slice(0, 500),
      properties: input.properties ?? {},
      duration_ms: input.durationMs ?? 0,
    };

    const { data: ev } = await supabase
      .from('user_activity_events')
      .insert(payload)
      .select('id, view_id')
      .maybeSingle();

    if (!ev) return;

    if (lastEventId && lastViewId !== payload.view_id) {
      await supabase.from('user_activity_lineage').insert({
        user_id: cachedUser.id,
        username: cachedUser.username,
        from_event_id: lastEventId,
        to_event_id: ev.id,
        from_view: lastViewId ?? '',
        to_view: payload.view_id,
        edge_type: input.eventType === 'navigate' ? 'navigated_to' : 'led_to',
        delta_ms: delta,
      });
    }

    lastEventId = ev.id as string;
    if (payload.view_id) lastViewId = payload.view_id;

    const incCol =
      input.eventType === 'click' ? 'click_count'
      : input.eventType === 'view' || input.eventType === 'navigate' ? 'view_count'
      : null;

    const updates: Record<string, unknown> = { last_active_at: new Date().toISOString() };
    const { data: cur } = await supabase
      .from('user_activity_sessions')
      .select('event_count,click_count,view_count')
      .eq('id', sid)
      .maybeSingle();
    if (cur) {
      updates.event_count = (cur.event_count ?? 0) + 1;
      if (incCol) updates[incCol] = (cur[incCol as keyof typeof cur] as number ?? 0) + 1;
      await supabase.from('user_activity_sessions').update(updates).eq('id', sid);
    }
  });
}

export function trackView(viewId: string, viewLabel: string, properties?: Record<string, unknown>) {
  trackEvent({
    eventType: 'navigate',
    category: 'navigation',
    viewId,
    viewLabel,
    targetKind: 'view',
    targetId: viewId,
    targetLabel: viewLabel,
    properties,
  });
}

export function trackClick(target: { id?: string; label?: string; kind?: string }, properties?: Record<string, unknown>) {
  trackEvent({
    eventType: 'click',
    category: 'interaction',
    targetId: target.id ?? '',
    targetLabel: target.label ?? '',
    targetKind: target.kind ?? 'button',
    properties,
  });
}

export function trackLogin(userId: string, username: string) {
  cachedUser = { id: userId, username };
  enqueue(async () => {
    await attachSessionToUser(userId, username);
  });
  trackEvent({
    eventType: 'login',
    category: 'auth',
    viewId: 'auth',
    viewLabel: 'Login',
    targetKind: 'auth_event',
    properties: { username },
  });
}

export function trackLogout() {
  trackEvent({
    eventType: 'logout',
    category: 'auth',
    viewId: 'auth',
    viewLabel: 'Logout',
    targetKind: 'auth_event',
  });
  enqueue(async () => {
    await endSession();
  });
}

export function getSessionInfo() {
  return { sessionId: cachedSessionId, sessionToken: cachedSessionToken, user: cachedUser };
}

let globalListenersInstalled = false;
let lastViewLabel = '';

export function setCurrentView(viewId: string, viewLabel: string) {
  lastViewId = viewId;
  lastViewLabel = viewLabel;
}

function describeElement(el: Element): { id: string; label: string; kind: string } {
  const t = el as HTMLElement;
  const dataId = t.getAttribute('data-track-id') ?? t.id ?? '';
  const dataLabel = t.getAttribute('data-track-label') ?? t.getAttribute('aria-label') ?? '';
  const tag = t.tagName.toLowerCase();
  const role = t.getAttribute('role') ?? '';
  const text = (t.innerText || t.textContent || '').trim().slice(0, 80);
  const kind =
    tag === 'a' ? 'link'
    : tag === 'button' || role === 'button' ? 'button'
    : tag === 'input' ? `input:${(t as HTMLInputElement).type || 'text'}`
    : tag === 'select' ? 'select'
    : tag === 'textarea' ? 'textarea'
    : role || tag;
  return {
    id: dataId,
    label: dataLabel || text || (tag === 'a' ? (t as HTMLAnchorElement).href : ''),
    kind,
  };
}

export function installGlobalActivityTracking() {
  if (globalListenersInstalled || typeof document === 'undefined') return;
  globalListenersInstalled = true;

  document.addEventListener('click', (ev) => {
    const path = ev.composedPath();
    let target: Element | null = null;
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      const tag = node.tagName.toLowerCase();
      if (
        tag === 'button' || tag === 'a' || tag === 'select' ||
        node.getAttribute('role') === 'button' ||
        node.hasAttribute('data-track-id') ||
        node.hasAttribute('onclick')
      ) {
        target = node;
        break;
      }
    }
    if (!target) target = ev.target as Element | null;
    if (!target) return;
    const info = describeElement(target);
    trackEvent({
      eventType: 'click',
      category: 'interaction',
      viewId: lastViewId ?? '',
      viewLabel: lastViewLabel,
      targetId: info.id,
      targetLabel: info.label,
      targetKind: info.kind,
      properties: {
        x: ev.clientX,
        y: ev.clientY,
        button: ev.button,
        meta: ev.metaKey,
        ctrl: ev.ctrlKey,
        shift: ev.shiftKey,
      },
    });
  }, { capture: true });

  document.addEventListener('submit', (ev) => {
    const t = ev.target as HTMLFormElement | null;
    if (!t) return;
    trackEvent({
      eventType: 'action',
      category: 'interaction',
      viewId: lastViewId ?? '',
      targetId: t.id || t.getAttribute('name') || 'form',
      targetLabel: t.getAttribute('aria-label') ?? 'form_submit',
      targetKind: 'form',
    });
  }, { capture: true });

  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      trackEvent({
        eventType: 'action',
        category: 'system',
        targetKind: 'visibility',
        targetLabel: 'tab_hidden',
      });
    } else if (document.visibilityState === 'visible') {
      const away = hiddenAt ? Date.now() - hiddenAt : 0;
      hiddenAt = null;
      trackEvent({
        eventType: 'action',
        category: 'system',
        targetKind: 'visibility',
        targetLabel: 'tab_visible',
        durationMs: away,
      });
    }
  });

  window.addEventListener('error', (ev) => {
    trackEvent({
      eventType: 'error',
      category: 'system',
      targetKind: 'js_error',
      targetLabel: ev.message?.slice(0, 200) ?? 'error',
      properties: { filename: ev.filename, lineno: ev.lineno, colno: ev.colno },
    });
  });

  window.addEventListener('beforeunload', () => {
    const sid = cachedSessionId;
    if (!sid) return;
    try {
      const body = JSON.stringify({ ended_at: new Date().toISOString(), is_active: false, last_active_at: new Date().toISOString() });
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon?.(`/api/mutate/user_activity_sessions?id=eq.${sid}`, blob);
    } catch { /* ignore */ }
  });
}
