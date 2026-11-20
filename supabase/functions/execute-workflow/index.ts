import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1\]?$|.*\.internal$|.*\.local$)/i;

function safeTarget(raw: string | null): URL | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (PRIVATE_HOST.test(url.hostname)) return null;
    return url;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(jwt);
    if (!userData?.user) return json({ error: "Sign in to run workflows" }, 401);

    const body = await req.json().catch(() => null);
    const workflowId = typeof body?.workflow_id === "string" ? body.workflow_id : "";
    if (!/^[0-9a-f-]{36}$/i.test(workflowId)) return json({ error: "A valid workflow_id is required" }, 400);

    const { data: wf, error: wfErr } = await admin
      .from("n8n_workflows")
      .select("id, enabled, n8n_webhook_url, auth_method, auth_credentials")
      .eq("id", workflowId)
      .maybeSingle();
    if (wfErr) return json({ error: "Could not load the workflow" }, 500);
    if (!wf) return json({ error: "Workflow not found" }, 404);
    if (!wf.enabled) return json({ error: "Workflow is disabled" }, 409);

    const target = safeTarget(wf.n8n_webhook_url);
    if (!target) return json({ error: "Workflow webhook must be a public https address" }, 400);

    const startedAt = new Date();
    const { data: exec, error: execErr } = await admin
      .from("workflow_executions")
      .insert([{
        workflow_id: wf.id,
        execution_status: "running",
        trigger_data: { manual: true, triggered_by: userData.user.id, timestamp: startedAt.toISOString() },
        started_at: startedAt.toISOString(),
      }])
      .select("id")
      .maybeSingle();
    if (execErr || !exec) return json({ error: "Could not record the execution" }, 500);

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = wf.auth_method === "header" ? wf.auth_credentials?.token : null;
    if (typeof token === "string" && token) headers.Authorization = `Bearer ${token}`;

    let status = 0;
    let responseData: unknown = null;
    let errorMessage: string | null = null;
    try {
      const res = await fetch(target, {
        method: "POST",
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ execution_id: exec.id, workflow_id: wf.id, trigger_type: "manual", timestamp: startedAt.toISOString() }),
      });
      status = res.status;
      const text = (await res.text()).slice(0, 20000);
      try { responseData = JSON.parse(text); } catch { responseData = { text: text.slice(0, 2000) }; }
      if (!res.ok) errorMessage = `Webhook answered with status ${res.status}`;
    } catch {
      errorMessage = "Webhook could not be reached";
    }

    const ok = status >= 200 && status < 300;
    await admin.from("workflow_executions").update({
      execution_status: ok ? "success" : "failed",
      response_data: responseData,
      error_message: errorMessage,
      execution_time_ms: Date.now() - startedAt.getTime(),
      completed_at: new Date().toISOString(),
    }).eq("id", exec.id);

    return json({ ok, status, execution_id: exec.id, error: errorMessage });
  } catch {
    return json({ error: "Workflow execution failed" }, 500);
  }
});
