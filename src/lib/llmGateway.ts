/**
 * Unified LLM gateway that routes function calls to the FastAPI backend.
 * All calls go to /api/{name} on the Databricks App.
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
    const response = await fetch(`/api/${functionName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
