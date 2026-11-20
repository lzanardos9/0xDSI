import { isGoLiveReport, type GoLiveDecisionType, type GoLiveReport } from './goLiveTypes';

export * from './goLiveTypes';

async function call(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`/api/golive${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 403) throw new Error(path ? 'Only admins can sign or waive go-live checks.' : 'You need the analyst role to view go-live readiness.');
    const detail = body && typeof body === 'object' && 'detail' in body ? String((body as { detail: unknown }).detail) : '';
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return body;
}

export const goLiveApi = {
  report: async (): Promise<GoLiveReport> => {
    const body = await call('');
    if (!isGoLiveReport(body)) throw new Error('Unexpected response from the server');
    return body;
  },
  decide: async (checkId: string, decision: GoLiveDecisionType, note: string): Promise<void> => {
    await call(`/${encodeURIComponent(checkId)}`, { method: 'POST', body: JSON.stringify({ decision, note }) });
  },
};
