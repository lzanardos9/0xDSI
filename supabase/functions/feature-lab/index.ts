import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

async function callOpenAI(key: string, body: unknown): Promise<any> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  return res.json();
}

function classifyFeatureType(prompt: string): { category: string; feature_type: "app" | "backend"; code_language: string } {
  const p = prompt.toLowerCase();

  // EXPLICIT backend / code signals - user is asking for code, not a UI
  const explicitBackend = /\b(databricks notebook|python notebook|\.py file|dlt pipeline|delta live table|lakeflow pipeline|spark (streaming )?job|etl (script|job|pipeline)|python code|sql (query|script)|materialized view|databricks workflow|scheduled job|cron job|airflow dag|kafka (consumer|producer)|ingestion pipeline|auto loader pipeline|deploy (a |an )?(agent|pipeline|job|model))\b/;
  if (explicitBackend.test(p)) {
    const lang = /\b(sql (query|script)|materialized view|genie)\b/.test(p) ? "sql" : "python";
    return { category: "workflow", feature_type: "backend", code_language: lang };
  }

  // EXPLICIT UI / visual signals - user wants a visual app
  const visualSignals = /\b(ui|visual(i[sz]e|i[sz]ation)?|interactive|dashboard|chart|graph(?!rag)|view|screen|page|panel|heatmap|map|simulator|game|quiz|chatbot|advisor|copilot|assistant|assistant ui|interface|frontend|webapp|web app|html|tailwind|animate|animation|hover|click|drag|pivot|investigation|hunt|explorer|monitor|tracker|live feed|real[- ]?time|canvas|topology|network (view|graph|map)|world map|timeline|report|executive|briefing)\b/;

  if (visualSignals.test(p)) {
    if (/\b(chatbot|assistant|copilot|advisor)\b/.test(p)) return { category: "agent", feature_type: "app", code_language: "" };
    if (/\b(simulator|simulation|game|training|quiz)\b/.test(p)) return { category: "simulator", feature_type: "app", code_language: "" };
    if (/\b(scanner|analyzer|builder|investigation|pivot|hunt|explorer|tool)\b/.test(p)) return { category: "tool", feature_type: "app", code_language: "" };
    if (/\b(map|heatmap|topology|network|canvas|visuali[sz])/.test(p)) return { category: "visualization", feature_type: "app", code_language: "" };
    if (/\b(monitor|live|real[- ]?time|feed|tracker|stream)\b/.test(p)) return { category: "monitor", feature_type: "app", code_language: "" };
    if (/\b(report|summary|executive|briefing)\b/.test(p)) return { category: "report", feature_type: "app", code_language: "" };
    return { category: "dashboard", feature_type: "app", code_language: "" };
  }

  // DEFAULT: visual app. If the user says "agent" without "deploy/build backend", assume they want a chat UI.
  if (/\b(agent|ai)\b/.test(p)) return { category: "agent", feature_type: "app", code_language: "" };
  return { category: "dashboard", feature_type: "app", code_language: "" };
}

function extractTags(prompt: string): string[] {
  const keywords = ["pix","fraud","trojan","malware","boleto","brazil","alert","threat","incident","network","compliance","risk","identity","mule","phishing","ransomware","supply chain","ics","vulnerability","databricks","mlflow","delta","unity catalog","mosaic"];
  const p = prompt.toLowerCase();
  return keywords.filter(k => p.includes(k));
}

function makeShareToken(): string {
  return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let body: any = {};
    try { body = await req.json(); } catch { /* ignore */ }
    const action = body.action || "plan";

    // ---------- LIST ----------
    if (action === "list") {
      const { data } = await supabase
        .from("feature_lab_creations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return json({ creations: data || [] });
    }

    // ---------- PROMOTE (lifecycle) ----------
    if (action === "promote") {
      const { id, stage, notes } = body;
      if (!id || !stage) return json({ error: "id and stage required" }, 400);
      const update: any = { status: stage };
      if (stage === "testing") update.test_results = { started_at: new Date().toISOString(), notes };
      if (stage === "homologation") update.homolog_results = { signed_off_at: new Date().toISOString(), notes };
      if (stage === "production") update.promoted_to_production_at = new Date().toISOString();
      const { data } = await supabase.from("feature_lab_creations").update(update).eq("id", id).select().maybeSingle();
      return json({ creation: data });
    }

    if (!openaiKey) return json({ error: "OpenAI API key not configured" }, 500);

    const prompt = (body.prompt || "").toString().trim();
    if (!prompt) return json({ error: "Prompt is required" }, 400);

    // ---------- PLAN ----------
    if (action === "plan") {
      const classified = classifyFeatureType(prompt);
      // Allow the caller to force a feature_type (from UI toggle)
      const forced = body.force_feature_type as ("app" | "backend" | undefined);
      const category = classified.category;
      const feature_type = forced || classified.feature_type;
      const code_language = feature_type === "backend" ? (classified.code_language || "python") : "";

      const [eventsRes, alertsRes, corrRulesRes] = await Promise.all([
        supabase.from("events").select("event_type, severity").order("event_timestamp", { ascending: false }).limit(10),
        supabase.from("alerts").select("title, severity, alert_type").order("created_at", { ascending: false }).limit(6),
        supabase.from("correlation_rules").select("rule_name, severity").limit(5),
      ]);
      const eventTypes = [...new Set((eventsRes.data || []).map((e: any) => e.event_type))].slice(0, 20);

      const plannerSystem = `You orchestrate the BMAD Method agile multi-agent workflow to design a Databricks Lakehouse security feature. Simulate FOUR specialized agents collaborating in order. Each must contribute their distinct deliverables.

BMAD AGENTS TO SIMULATE:
1. Mary (Analyst) - conducts domain / market / technical research. Produces a concise brief with insights, risks, and prior-art references.
2. John (Product Manager) - converts the brief into a PRD: epics with user stories and acceptance criteria, success metrics, scope in/out.
3. Winston (Architect) - designs the system: components, data flows, Databricks integrations, tech choices, NFRs. OWNS the architecture diagram.
4. Sally (UX Designer) - designs personas, user flows, key screens, and accessibility notes.

Downstream agents (NOT in this call): Amelia (Developer) will implement, Paige (Tech Writer) will document.

FEATURE TYPE (CRITICAL):
- feature_type = "app": build an interactive single-page HTML application with live UI, charts, animations. This is the DEFAULT whenever the user wants something visual, interactive, or dashboard-like.
- feature_type = "backend": ONLY when the user EXPLICITLY asks for a notebook, DLT pipeline, scheduled job, SQL script, ETL code, or similar non-visual artifact.
- The caller pre-classified this as "${feature_type}". Keep it UNLESS the user's prompt unmistakably contradicts that classification. When in doubt, prefer "app".



MANDATORY: Every plan MUST integrate meaningful Databricks products. Choose from:
- Delta Lake (ACID storage of events/alerts/cases)
- Unity Catalog (RBAC, lineage, tagging across workspaces)
- Delta Live Tables / Lakeflow (streaming ETL pipelines)
- Databricks SQL + Genie (analyst queries / NL to SQL)
- MLflow (model registry, experiments, model serving)
- Mosaic AI Agent Framework (tool-using agents in production)
- Mosaic AI Model Serving (low-latency GPT-4 / Llama / custom)
- Vector Search (semantic retrieval over IOCs, rules, playbooks)
- Lakeflow Connect (Kafka, SaaS, CDC ingestion)
- Photon (vectorized SQL engine)
- Feature Store (behavioral features for fraud/anomaly)
- Lakehouse Monitoring (drift, data quality)
- AI/BI Dashboards (executive)
- Auto Loader (cloud storage streaming)
- DLT Expectations (data quality gates)
- Workflows (scheduled jobs)
- Structured Streaming
- Clean Rooms (cross-org threat intel)
- System Tables (audit)

Feature classification: ${category} (${feature_type})
Available event types: ${eventTypes.join(", ") || "n/a"}

Return STRICT JSON matching this schema:
{
  "title": "short, punchy product name",
  "category": "${category}",
  "feature_type": "${feature_type}",
  "code_language": "${code_language}",
  "summary": "2-3 sentence elevator pitch",
  "business_value": "why this matters to the SOC / CISO",
  "bmad": {
    "analyst": {
      "agent": "Mary",
      "brief": "3-4 sentence executive brief framing the problem and opportunity",
      "domain_insights": ["3-5 security domain findings that shape the solution"],
      "prior_art": ["2-3 existing tools/patterns we reference or improve upon"],
      "risks": ["3-4 risks with mitigations"]
    },
    "pm": {
      "agent": "John",
      "epics": [
        {
          "id": "E1",
          "title": "Epic title",
          "goal": "outcome in 1 sentence",
          "user_stories": [
            { "as_a": "role", "i_want": "capability", "so_that": "value", "acceptance_criteria": ["Given/When/Then style, 2-3 bullets"] }
          ]
        }
      ],
      "success_metrics": ["3-4 measurable KPIs"],
      "in_scope": ["3-5 items"],
      "out_of_scope": ["2-3 items"]
    },
    "ux": {
      "agent": "Sally",
      "personas": [{ "name": "SOC Analyst Tier 2", "goals": "...", "pain_points": "..." }],
      "user_flows": ["3-5 end-to-end flows described in one line each"],
      "screens": [{ "name": "Screen name", "description": "purpose", "key_elements": ["3-5 UI elements"] }],
      "accessibility": "WCAG notes and keyboard shortcuts"
    },
    "judgments": [
      {
        "from_agent": "Winston",
        "of_agent": "John",
        "topic": "Epic scope & acceptance criteria feasibility",
        "verdict": "approve|concerns|reject",
        "concerns": ["2-4 specific engineering concerns - cost, scale, latency, security, dependency gaps"],
        "suggestions": ["2-3 concrete changes to make it feasible"]
      },
      {
        "from_agent": "Sally",
        "of_agent": "Winston",
        "topic": "UX implications of the architecture",
        "verdict": "approve|concerns|reject",
        "concerns": ["2-3 UX gaps - missing empty states, error flows, a11y issues, latency UX"],
        "suggestions": ["2-3 concrete UX improvements"]
      },
      {
        "from_agent": "Mary",
        "of_agent": "John",
        "topic": "Success metrics realism vs. domain evidence",
        "verdict": "approve|concerns|reject",
        "concerns": ["1-3 metrics that need baselining or are unrealistic"],
        "suggestions": ["1-2 adjusted targets with justification"]
      },
      {
        "from_agent": "John",
        "of_agent": "Mary",
        "topic": "Brief completeness for PRD generation",
        "verdict": "approve|concerns|reject",
        "concerns": ["1-2 gaps in analyst brief that block PRD work"],
        "suggestions": ["1-2 follow-up research items"]
      }
    ],
  "components": ["4-8 major UI/service components with crisp descriptions"],
  "user_interactions": ["5-7 key interactions"],
  "wow_factors": ["4-6 delightful details"],
  "databricks_features": [
    {"name":"Product", "purpose":"what it does here", "why":"why it belongs"}
  ],
  "architecture_diagram": {
    "nodes": [
      {
        "id": "kebab-case",
        "label": "Display name",
        "type": "actor|frontend|api|stream|storage|ml|agent|databricks|external",
        "layer": "client|edge|platform|lakehouse|ml|external",
        "description": "1 sentence what it does",
        "tech": ["React","Tailwind"],
        "databricks_product": "Delta Lake | null",
        "details": {
          "inputs": "what comes in",
          "outputs": "what goes out",
          "scale": "throughput/latency target",
          "security": "RLS, UC, PII handling"
        }
      }
    ],
    "links": [
      {
        "from": "node-id",
        "to": "node-id",
        "label": "short verb",
        "protocol": "HTTPS|SSE|JDBC|Kafka|Delta|REST",
        "data": "what flows",
        "latency": "p50 target",
        "volume": "events/sec"
      }
    ]
  },
  "test_plan": ["3-5 validation scenarios"],
  "homologation_checklist": ["3-5 sign-off items"]
}

Constraints:
- Include AT LEAST 3 Databricks nodes in the diagram.
- Place nodes sensibly across layers for left-to-right flow.
- Keep node count to 8-14 for clarity.
- ALL fields are required.`;

      const planner = await callOpenAI(openaiKey, {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: plannerSystem },
          { role: "user", content: `Feature request:\n${prompt}\n\nReturn the JSON plan now.` },
        ],
        temperature: 0.5,
        max_tokens: 12000,
        response_format: { type: "json_object" },
      });

      let plan: any = {};
      try { plan = JSON.parse(planner.choices?.[0]?.message?.content || "{}"); } catch { plan = {}; }
      plan.category = plan.category || category;
      plan.feature_type = plan.feature_type || feature_type;
      plan.code_language = plan.code_language || code_language;

      // Defensive fallback: if architecture_diagram is missing or empty, synthesize a minimal one from components
      if (!plan.architecture_diagram || !Array.isArray(plan.architecture_diagram.nodes) || plan.architecture_diagram.nodes.length === 0) {
        const comps: string[] = Array.isArray(plan.components) ? plan.components : [];
        const dbx: any[] = Array.isArray(plan.databricks_features) ? plan.databricks_features : [];
        const synthNodes: any[] = [];
        const synthLinks: any[] = [];

        synthNodes.push({ id: "user", label: "SOC Analyst", type: "actor", layer: "client", description: "End user" });
        synthNodes.push({ id: "ui", label: plan.title || "Feature UI", type: "frontend", layer: "client", description: "React interface" });
        synthNodes.push({ id: "api", label: "Supabase Edge", type: "api", layer: "edge", description: "Authenticated API layer" });
        synthLinks.push({ from: "user", to: "ui", label: "interacts", protocol: "HTTPS" });
        synthLinks.push({ from: "ui", to: "api", label: "queries", protocol: "HTTPS" });

        comps.slice(0, 5).forEach((c, i) => {
          const id = `comp-${i}`;
          const label = (typeof c === "string" ? c : (c as any)?.name || `Component ${i + 1}`).toString().slice(0, 40);
          synthNodes.push({ id, label, type: "api", layer: "platform", description: typeof c === "string" ? c : "" });
          synthLinks.push({ from: "api", to: id, label: "routes", protocol: "REST" });
        });

        dbx.slice(0, 4).forEach((d, i) => {
          const id = `dbx-${i}`;
          synthNodes.push({
            id,
            label: d?.name || `Databricks ${i + 1}`,
            type: "databricks",
            layer: i < 2 ? "lakehouse" : "ml",
            description: d?.purpose || "",
            databricks_product: d?.name || null,
          });
          synthLinks.push({ from: "api", to: id, label: "delegates", protocol: "JDBC" });
        });

        plan.architecture_diagram = { nodes: synthNodes, links: synthLinks };
      }

      return json({ plan, tokens_used: planner.usage?.total_tokens || 0 });
    }

    // ---------- EXECUTE ----------
    if (action === "execute") {
      const plan = body.plan;
      if (!plan) return json({ error: "Approved plan is required" }, 400);

      const feature_type = plan.feature_type || "app";
      const code_language = plan.code_language || "python";

      let html = "";
      let generated_code = "";
      let tokens = 0;

      const paigeSystem = `You are Paige, the BMAD Tech Writer agent. Produce concise, production-grade documentation for the approved feature.

APPROVED PLAN:
${JSON.stringify(plan).slice(0, 4000)}

Return STRICT JSON:
{
  "readme": "Markdown README body (overview, usage, configuration, how Databricks products are used, screenshots placeholders). 400-600 words.",
  "runbook": "Markdown operations runbook: deployment steps, smoke tests, on-call procedures, rollback. 250-400 words.",
  "changelog_entry": "One paragraph describing this release for internal changelog",
  "api_contract": "Short description of inputs/outputs or a code snippet showing main interface"
}`;

      const paigePromise = callOpenAI(openaiKey, {
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: paigeSystem },
          { role: "user", content: "Write the documentation JSON now." },
        ],
        temperature: 0.4,
        max_tokens: 2500,
        response_format: { type: "json_object" },
      }).catch(() => null);

      if (feature_type === "backend") {
        const backendSystem = `You are Amelia, the BMAD Developer agent. Write PRODUCTION ${code_language.toUpperCase()} code for the Databricks Lakehouse.

APPROVED PLAN (implement precisely):
${JSON.stringify(plan)}

Requirements:
- Write real, runnable ${code_language} (Databricks notebook for Python, Databricks SQL for sql).
- USE the Databricks features listed: ${(plan.databricks_features || []).map((f: any) => f.name).join(", ")}.
- For Python: include %pip magic if needed, use spark, dlt, mlflow, databricks-vectorsearch, databricks-agents, openai, delta APIs authentically.
- For agents: use Mosaic AI Agent Framework or LangGraph on Databricks Model Serving.
- For ETL: use DLT with @dlt.table, @dlt.expect_or_drop, Auto Loader, Unity Catalog three-part names (catalog.schema.table).
- Include docstrings, type hints, config section, error handling, structured logging.
- Include a test cell / validation block at the bottom.
- Target 300-700 lines. No placeholders. No TODOs.
- Output raw code only, no markdown fences.`;

        const gen = await callOpenAI(openaiKey, {
          model: "gpt-4o",
          messages: [
            { role: "system", content: backendSystem },
            { role: "user", content: `Implement now. Output only ${code_language} code.` },
          ],
          temperature: 0.5,
          max_tokens: 7500,
        });
        generated_code = (gen.choices?.[0]?.message?.content || "").replace(/^```\w*\n?/i, "").replace(/\n?```$/i, "").trim();
        tokens = gen.usage?.total_tokens || 0;
      } else {
        const appSystem = `You are Amelia, the BMAD Developer agent. Build a PRODUCTION-QUALITY single-page security application. Match Bolt.new / v0.dev quality.

APPROVED PLAN (implement precisely):
${JSON.stringify(plan)}

DATABRICKS INTEGRATIONS (surface them prominently in the UI):
${(plan.databricks_features || []).map((f: any) => `- ${f.name}: ${f.purpose}`).join("\n")}

SUPERPOWERS:
1. Supabase live DB (events, alerts, cases, vulnerabilities, correlation_rules)
2. Runtime AI at window.__RUNTIME_URL__ (GPT-4 + tool use): POST {messages,system} returns {message,reasoning_steps}
3. Tailwind + Chart.js + Canvas + vanilla JS

NON-NEGOTIABLE:
1. Single standalone HTML, <!DOCTYPE html> first line.
2. CDNs: tailwindcss, chart.js@4.4, @supabase/supabase-js@2.
3. Dark theme bg-[#0a0e1a], cards bg-slate-900/60. No purple/indigo/violet.
4. Colors: cyan/emerald/amber/red/blue/orange/teal.
5. Inter + JetBrains Mono. 8px spacing.
6. Micro-interactions: transition-all, hover scale, pulse dots, animated counters.
7. Loading skeletons, empty states, error states, toasts, keyboard shortcuts.
8. Show Databricks logos/badges where data comes from the lakehouse.
9. Live data: try Supabase + runtime API, fall back to embedded samples gracefully.
10. Output ONLY raw HTML. No markdown fences. Target 12k-22k chars.`;

        const gen = await callOpenAI(openaiKey, {
          model: "gpt-4o",
          messages: [
            { role: "system", content: appSystem },
            { role: "user", content: `Build the feature now. Output only HTML.` },
          ],
          temperature: 0.75,
          max_tokens: 7500,
        });
        html = (gen.choices?.[0]?.message?.content || "").replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
        tokens = gen.usage?.total_tokens || 0;
        if (!html || html.length < 500) return json({ error: "AI produced empty output. Try rephrasing." }, 500);
      }

      const paigeResult = await paigePromise;
      let paige_docs: any = {};
      if (paigeResult) {
        try { paige_docs = JSON.parse(paigeResult.choices?.[0]?.message?.content || "{}"); } catch { paige_docs = {}; }
        tokens += paigeResult.usage?.total_tokens || 0;
      }

      const tags = extractTags(prompt);
      const colors = ["#06B6D4","#10B981","#F59E0B","#3B82F6","#EF4444","#F97316"];
      const thumbnailColor = colors[Math.floor(Math.random() * colors.length)];
      const share_token = makeShareToken();

      const enrichedPlan = { ...plan, paige_docs };

      const { data: saved } = await supabase
        .from("feature_lab_creations")
        .insert({
          title: (plan.title || prompt.slice(0, 80)).slice(0, 200),
          prompt,
          generated_html: html,
          generated_code,
          code_language: feature_type === "backend" ? code_language : "",
          feature_type,
          category: plan.category || "dashboard",
          tags: JSON.stringify(tags),
          thumbnail_color: thumbnailColor,
          architecture_plan: enrichedPlan,
          databricks_features: plan.databricks_features || [],
          status: "draft",
          share_token,
          created_by: "anonymous",
        })
        .select()
        .maybeSingle();

      return json({
        html,
        generated_code,
        code_language: feature_type === "backend" ? code_language : "",
        feature_type,
        title: plan.title || prompt.slice(0, 80),
        category: plan.category || "dashboard",
        tags,
        saved,
        share_token,
        paige_docs,
        tokens_used: tokens,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});
