import { IS_DATABRICKS } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Unified LLM gateway that routes function calls to the right backend:
 * - Supabase mode: calls Edge Functions at ${SUPABASE_URL}/functions/v1/{name}
 * - Databricks mode: calls FastAPI backend at /api/{name}
 *
 * Components should use this instead of constructing fetch calls directly.
 */
export async function callFunction(
  functionName: string,
  body: Record<string, unknown>,
  options?: { timeout?: number }
): Promise<{ data: unknown; error: string | null }> {
  const timeout = options?.timeout ?? 60000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    let url: string;
    let headers: Record<string, string>;

    if (IS_DATABRICKS) {
      url = `/api/${functionName}`;
      headers = { 'Content-Type': 'application/json' };
    } else {
      url = `${SUPABASE_URL}/functions/v1/${functionName}`;
      headers = {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const message = (errBody as Record<string, string>).error || `API returned ${response.status}`;
      return { data: null, error: message };
    }

    const data = await response.json();
    return { data, error: null };
  } catch (e: unknown) {
    if ((e as Error).name === 'AbortError') {
      return { data: null, error: 'Request timed out' };
    }
    return { data: null, error: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}
