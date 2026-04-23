import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function callOpenAI(key: string, body: unknown): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return res.json();
}

function classify(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/(agent|chatbot|assistant|copilot|advisor)/.test(p)) return "agent";
  if (/(simulator|simulation|game|training|quiz)/.test(p)) return "simulator";
  if (/(scanner|analyzer|builder|investigation|pivot|hunt|tool)/.test(p)) return "tool";
  if (/(canvas|visualization|graph|map|network|heatmap|topology)/.test(p)) return "visualization";
  if (/(monitor|live|real.?time|feed|tracker|stream)/.test(p)) return "monitor";
  if (/(report|summary|executive|briefing)/.test(p)) return "report";
  if (/(workflow|playbook|rule|detection|automation)/.test(p)) return "workflow";
  return "dashboard";
}

function extractTags(prompt: string): string[] {
  const keywords = ["pix", "fraud", "trojan", "malware", "boleto", "brazil", "alert", "threat", "incident", "network", "compliance", "risk", "identity", "mule", "phishing", "ransomware", "supply chain", "ics", "vulnerability"];
  const p = prompt.toLowerCase();
  return keywords.filter(k => p.includes(k));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  // Non-streaming utility actions
  if (body.action === "list") {
    const { data } = await supabase
      .from("feature_lab_creations")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    return new Response(JSON.stringify({ creations: data || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!openaiKey) {
    return new Response(JSON.stringify({ error: "OpenAI API key not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const prompt = (body.prompt || "").toString().trim();
  if (!prompt) {
    return new Response(JSON.stringify({ error: "Prompt is required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Stream multi-step progress as Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        try { controller.enqueue(enc.encode(`data: ${JSON.stringify(data)}\n\n`)); }
        catch { /* closed */ }
      };
      const fail = (message: string) => {
        send({ type: "error", message });
        try { controller.close(); } catch { /* ignore */ }
      };

      try {
        const category = classify(prompt);
        const tags = extractTags(prompt);

        // ---------------- STEP 1: Analyze & plan ----------------
        send({
          type: "step", step: 1, total: 5,
          label: "Analyzing your request",
          detail: `Detected feature type: ${category}. Extracting requirements, data sources, and interaction model...`,
        });

        const [eventsRes, alertsRes, corrRulesRes] = await Promise.all([
          supabase.from("events").select("event_type, severity, description, source_ip, hostname, mitre_technique").order("event_timestamp", { ascending: false }).limit(12),
          supabase.from("alerts").select("title, severity, alert_type, source").order("created_at", { ascending: false }).limit(8),
          supabase.from("correlation_rules").select("rule_name, severity, rule_type").limit(6),
        ]);

        const sampleData = {
          events: eventsRes.data || [],
          alerts: alertsRes.data || [],
          correlation_rules: corrRulesRes.data || [],
        };
        const eventTypes = [...new Set((eventsRes.data || []).map((e: any) => e.event_type))];

        send({
          type: "step", step: 2, total: 5,
          label: "Designing architecture",
          detail: "Planning components, data flows, and AI tool integrations for a production build...",
        });

        const planner = await callOpenAI(openaiKey, {
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `You are a senior architect. Produce a concise technical plan (max 500 words) for building a production-grade single-page HTML security feature.

Output STRICT JSON:
{
  "title": "short title",
  "category": "${category}",
  "summary": "2 sentence what it does",
  "components": ["list of 4-8 UI panels/components"],
  "data_sources": ["which Supabase tables and runtime-API tools to use"],
  "interactions": ["key user interactions and keyboard shortcuts"],
  "wow_factors": ["3-5 standout details that make this impressive"]
}

Available Supabase tables: events, alerts, cases, vulnerabilities, correlation_rules.
Event types: ${eventTypes.join(", ")}.
Runtime API tools (agent mode): query_events, query_alerts, query_cases, query_vulnerabilities, aggregate_events, investigate_ioc, get_mitre_coverage, correlate_threats.`,
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.4,
          max_tokens: 700,
          response_format: { type: "json_object" },
        });

        let plan: any = {};
        try { plan = JSON.parse(planner.choices?.[0]?.message?.content || "{}"); } catch { plan = {}; }

        send({
          type: "step", step: 3, total: 5,
          label: "Plan ready",
          detail: plan.summary || "Architecture complete. Components: " + (plan.components || []).join(", "),
          plan,
        });

        // ---------------- STEP 4: Generate HTML ----------------
        send({
          type: "step", step: 4, total: 5,
          label: "Generating production code",
          detail: "Writing HTML + Tailwind + Chart.js + runtime API wiring. This is the heavy step (~60-90s)...",
        });

        const systemPrompt = `You are a world-class full-stack engineer building PRODUCTION-QUALITY single-page security applications. Match the quality of Bolt.new, v0.dev, Linear, or Cursor.

ARCHITECTURE PLAN TO IMPLEMENT (follow it precisely):
${JSON.stringify(plan, null, 2)}

YOU HAVE THREE SUPERPOWERS:
1. Live Supabase DB with real events, alerts, cases, vulnerabilities, correlation_rules.
2. Runtime AI API at window.__RUNTIME_URL__ with real GPT-4o + tool use.
3. Tailwind + Chart.js + Canvas + vanilla JS.

============================================================
RUNTIME API - USE THIS FOR REAL AGENTS (not fake chatbots)
============================================================
POST window.__RUNTIME_URL__ with Authorization: Bearer window.__SUPABASE_ANON_KEY__
AGENT MODE body: { messages: [{role,content}], system: "domain prompt" }
Response: { message, reasoning_steps: [{step,tool,args,result_summary}], iterations }
Tools agent has: query_events, query_alerts, query_cases, query_vulnerabilities, aggregate_events, investigate_ioc, get_mitre_coverage, correlate_threats.
CHAT MODE body: { mode: 'chat', messages, model: 'gpt-4o-mini', temperature }

============================================================
DIRECT SUPABASE (fast reads)
============================================================
const sb = supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__);
const { data } = await sb.from('events').select('*').limit(25);
Event types: ${eventTypes.join(", ")}

SAMPLE DATA (fallback reference):
${JSON.stringify(sampleData).slice(0, 2500)}

============================================================
NON-NEGOTIABLE REQUIREMENTS
============================================================
1. Single standalone HTML file starting with <!DOCTYPE html>.
2. CDNs in <head>:
   <script src="https://cdn.tailwindcss.com"></script>
   <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
3. Dark theme: body bg-[#0a0e1a]. Cards bg-slate-900/60 border-slate-800. Glassmorphism where appropriate.
4. Color system (NEVER purple/indigo/violet): cyan/emerald/amber/red/blue/orange/teal.
5. Inter for UI, JetBrains Mono for data.
6. Micro-interactions: transition-all duration-200, hover:scale-[1.02], active:scale-95, animated pulse dots.
7. Required UX: loading skeletons, empty states, error states with retry, toasts, keyboard shortcuts (Cmd+K, /, Esc), tooltips.
8. Feels alive: auto-refresh, animated counters, typing animation for agent, progress bars.
9. Data: try runtime API / Supabase first, fall back to embedded sample gracefully. Never broken/empty UI.
10. For AGENT features: full interface - left sidebar with history/settings, center chat with markdown+code blocks, reasoning panel showing tool calls live, right sidebar with memory+live data, action buttons, status bar, slash commands. The agent MUST call runtime API and render reasoning_steps as a live timeline.
11. For SIMULATOR: config panel, animated Canvas, kill chain timeline, play/pause/speed, event log, metrics, AI defender calling runtime API, post-mortem report.
12. For INVESTIGATION: smart search, entity profile, Canvas graph, tabbed drawer, AI analyst button.
13. Output: ONLY raw HTML. No markdown fences. No explanation. Target 10,000-25,000 chars. Compress JS aggressively.

Build the FULL feature with WOW factors. Match Bolt.new depth.`;

        const gen = await callOpenAI(openaiKey, {
          model: "gpt-4o",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Build: ${prompt}\n\nImplement the plan above with maximum depth and polish.` },
          ],
          temperature: 0.75,
          max_tokens: 7500,
        });

        let html = gen.choices?.[0]?.message?.content || "";
        html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

        if (!html || html.length < 500) {
          return fail("AI produced an empty or invalid response. Try rephrasing your prompt.");
        }

        // ---------------- STEP 5: Save ----------------
        send({
          type: "step", step: 5, total: 5,
          label: "Saving to gallery",
          detail: `Persisting ${html.length.toLocaleString()} chars of generated code to Supabase...`,
        });

        const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
        const title = (plan.title || (titleMatch ? titleMatch[1].trim() : prompt.slice(0, 80))).slice(0, 200);

        const colors = ["#06B6D4", "#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#F97316"];
        const thumbnailColor = colors[Math.floor(Math.random() * colors.length)];

        const { data: saved } = await supabase
          .from("feature_lab_creations")
          .insert({
            title,
            prompt,
            generated_html: html,
            category,
            tags: JSON.stringify(tags),
            thumbnail_color: thumbnailColor,
            created_by: "anonymous",
          })
          .select()
          .maybeSingle();

        send({
          type: "complete",
          html,
          title,
          category,
          tags,
          saved: saved || null,
          tokens_used: (planner.usage?.total_tokens || 0) + (gen.usage?.total_tokens || 0),
          plan,
        });
        try { controller.close(); } catch { /* ignore */ }
      } catch (err) {
        fail(err instanceof Error ? err.message : "Unknown generation error");
      }
    },
  });

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
});
