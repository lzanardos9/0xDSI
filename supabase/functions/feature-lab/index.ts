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

type DbxEntry = { name: string; layer: string; purpose: string };

function pickRelevantProducts(prompt: string, plan: any, allowlist: DbxEntry[]): DbxEntry[] {
  const text = `${prompt} ${plan?.title || ""} ${plan?.summary || ""} ${(plan?.components || []).join(" ")}`.toLowerCase();
  const hints: Array<[RegExp, string]> = [
    [/\b(kafka|stream|realtime|real[- ]time|sse|webhook)\b/, "Structured Streaming"],
    [/\b(kafka|ingest|collect|tap|connector|siem|edr)\b/, "Lakeflow Connect"],
    [/\b(cloud storage|s3|adls|blob|parquet|csv dump|batch load)\b/, "Auto Loader"],
    [/\b(pipeline|etl|dlt|medallion|bronze|silver|gold)\b/, "Delta Live Tables"],
    [/\b(data quality|expectations|validate|great expectations)\b/, "DLT Expectations"],
    [/\b(store|table|warehouse|lake|delta)\b/, "Delta Lake"],
    [/\b(governance|rbac|audit|lineage|pii|clearance)\b/, "Unity Catalog"],
    [/\b(drift|quality monitor|metric monitoring|model monitor)\b/, "Lakehouse Monitoring"],
    [/\b(audit|billing|system log)\b/, "System Tables"],
    [/\b(feature|behavioral|ubem|baseline|ml feature)\b/, "Feature Store"],
    [/\b(mlflow|experiment|model registry|train|retrain)\b/, "MLflow"],
    [/\b(vector|embed|semantic|similarity|rag|graphrag|ioc match|hunt)\b/, "Vector Search"],
    [/\b(llm|chat|assistant|copilot|gpt|model serving|inference|endpoint)\b/, "Mosaic AI Model Serving"],
    [/\b(agent|tool[- ]using|autonomous|orchestrat|planner|react)\b/, "Mosaic AI Agent Framework"],
    [/\b(sql|query|warehouse|photon|analyst)\b/, "Databricks SQL"],
    [/\b(natural language|nl2sql|ask a question|genie)\b/, "Genie"],
    [/\b(dashboard|chart|exec|kpi|bi|ai\/bi)\b/, "AI/BI Dashboards"],
    [/\b(app|interactive|ui|webapp|page)\b/, "Databricks Apps"],
    [/\b(schedule|cron|workflow|job|orchestrat|dag)\b/, "Workflows"],
    [/\b(clean room|share|cross[- ]org|consortium)\b/, "Clean Rooms"],
  ];

  const picks = new Map<string, DbxEntry>();
  for (const [re, name] of hints) {
    if (re.test(text)) {
      const entry = allowlist.find(a => a.name === name);
      if (entry) picks.set(entry.name, entry);
    }
  }
  // Always include the spine
  ["Delta Lake", "Unity Catalog"].forEach(n => {
    const e = allowlist.find(a => a.name === n);
    if (e) picks.set(n, e);
  });
  // Fill to 8 if sparse
  const fillers = ["Lakeflow Connect", "Delta Live Tables", "DLT Expectations", "MLflow", "Mosaic AI Model Serving", "Databricks SQL", "AI/BI Dashboards", "Workflows"];
  for (const n of fillers) {
    if (picks.size >= 10) break;
    const e = allowlist.find(a => a.name === n);
    if (e && !picks.has(n)) picks.set(n, e);
  }
  return Array.from(picks.values());
}

async function generateBespokeArchitecture(args: {
  openaiKey: string;
  prompt: string;
  plan: any;
  allowlist: DbxEntry[];
}): Promise<{ nodes: any[]; links: any[] } | null> {
  const { openaiKey, prompt, plan, allowlist } = args;
  const catalog = allowlist.map(a => `- ${a.name} (${a.layer}): ${a.purpose}`).join("\n");
  const planCtx = JSON.stringify({
    title: plan?.title,
    summary: plan?.summary,
    category: plan?.category,
    components: plan?.components,
    databricks_features: plan?.databricks_features,
  });

  const system = `You are a senior Databricks solutions architect. Design a realistic, bespoke Lakehouse architecture for the feature described by the user. The diagram MUST vary based on the specifics of the ask - no two diagrams should look the same.

RULES:
1. Select 8-14 Databricks products from this allowlist (ONLY these - no generic services):
${catalog}
2. Pick products that are TRULY RELEVANT to the feature - if the feature is a chatbot pick Mosaic AI Model Serving and Vector Search; if it is a streaming monitor pick Structured Streaming; if it is a batch report pick Databricks SQL; etc. Do NOT include products that do not serve the feature.
3. Each node's "label" should be the product name PLUS a short tailored descriptor, e.g. "Vector Search: IOC embeddings" or "Delta Live Tables: PIX fraud pipeline". Max 44 chars.
4. Description must be 1 sentence and reference the specific feature.
5. Links must describe REAL data flows between the chosen products for this feature - never generic "flows to".
6. Layers must be one of: ingest | lakehouse | governance | ml | serving | apps.

Return JSON:
{
  "nodes": [
    {"id": "kebab-case","label":"Product: tailored","type":"databricks","layer":"...","description":"...","databricks_product":"<exact allowlist name>","details":{"inputs":"","outputs":"","scale":"","security":""}}
  ],
  "links": [
    {"from":"id","to":"id","label":"verb phrase","protocol":"Delta|UC|REST|SQL|Vector|Stream","data":"what flows","latency":"","volume":""}
  ]
}`;

  const res = await callOpenAI(openaiKey, {
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Feature request:\n${prompt}\n\nPlanner context:\n${planCtx}\n\nReturn the tailored architecture JSON now.` },
    ],
    temperature: 0.6,
    max_tokens: 3000,
    response_format: { type: "json_object" },
  });

  let parsed: any = {};
  try { parsed = JSON.parse(res.choices?.[0]?.message?.content || "{}"); } catch { return null; }
  const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
  const links = Array.isArray(parsed.links) ? parsed.links : [];

  const allowLayers = new Set(["ingest", "lakehouse", "governance", "ml", "serving", "apps"]);
  const normalized = nodes
    .map((n: any) => {
      const productName = (n.databricks_product || n.label || "").toString();
      const match = allowlist.find(d => productName.toLowerCase().includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(productName.toLowerCase()));
      if (!match) return null;
      return {
        id: (n.id || match.name).toString().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        label: (n.label || match.name).toString().slice(0, 44),
        type: "databricks",
        layer: allowLayers.has(n.layer) ? n.layer : match.layer,
        description: n.description || match.purpose,
        databricks_product: match.name,
        details: n.details || { inputs: "", outputs: "", scale: "", security: "Unity Catalog governed" },
      };
    })
    .filter(Boolean);

  const ids = new Set(normalized.map((n: any) => n.id));
  const safeLinks = links.filter((l: any) => ids.has(l.from) && ids.has(l.to));
  return { nodes: normalized, links: safeLinks };
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

      const plannerSystem = `You orchestrate an agile multi-agent workflow to design a Databricks Lakehouse security feature. Simulate FOUR specialized agents collaborating in order. Each must contribute their distinct deliverables.

AGENTS TO SIMULATE:
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
- ARCHITECTURE DIAGRAM MUST USE ONLY DATABRICKS PRODUCTS AS NODES. No generic "Frontend", "API Gateway", "Database", "User", etc. Every node must be a real Databricks service from the allowlist above (Delta Lake, Unity Catalog, DLT, Databricks SQL, Genie, MLflow, Mosaic AI Agent Framework, Mosaic AI Model Serving, Vector Search, Lakeflow Connect, Photon, Feature Store, Lakehouse Monitoring, AI/BI Dashboards, Auto Loader, DLT Expectations, Workflows, Structured Streaming, Clean Rooms, System Tables, Databricks Apps).
- Every node MUST have type: "databricks" and a non-null databricks_product field naming the exact product.
- Every node MUST have layer in {"ingest","lakehouse","ml","serving","governance","apps"} only - no "client" or "external".
- Include 8-14 Databricks nodes covering ingest -> storage/governance -> ML/AI -> serving/apps.
- Links describe real data flows between Databricks services using Delta, Unity Catalog, SQL Warehouse, Model Serving endpoints, Vector Search indexes, etc.
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

      // Enforce Databricks-only architecture diagram. Strip any non-Databricks node and rebuild if empty.
      const DBX_ALLOWLIST: Array<{ name: string; layer: string; purpose: string }> = [
        { name: "Lakeflow Connect",              layer: "ingest",     purpose: "Streaming ingest from Kafka / SaaS / CDC" },
        { name: "Auto Loader",                   layer: "ingest",     purpose: "Cloud storage incremental ingestion" },
        { name: "Structured Streaming",          layer: "ingest",     purpose: "Low-latency stream processing" },
        { name: "Delta Live Tables",             layer: "lakehouse",  purpose: "Declarative ETL pipelines with expectations" },
        { name: "Delta Lake",                    layer: "lakehouse",  purpose: "ACID storage of raw/silver/gold tables" },
        { name: "Unity Catalog",                 layer: "governance", purpose: "RBAC, lineage, tagging, audit" },
        { name: "DLT Expectations",              layer: "governance", purpose: "Data quality gates" },
        { name: "Lakehouse Monitoring",          layer: "governance", purpose: "Drift and quality telemetry" },
        { name: "System Tables",                 layer: "governance", purpose: "Platform audit and billing logs" },
        { name: "Feature Store",                 layer: "ml",         purpose: "Behavioral features for ML models" },
        { name: "MLflow",                        layer: "ml",         purpose: "Experiment tracking and model registry" },
        { name: "Vector Search",                 layer: "ml",         purpose: "Semantic retrieval over IOCs and rules" },
        { name: "Mosaic AI Model Serving",       layer: "serving",    purpose: "Low-latency LLM and model endpoints" },
        { name: "Mosaic AI Agent Framework",     layer: "serving",    purpose: "Production tool-using agents" },
        { name: "Databricks SQL",                layer: "serving",    purpose: "Analyst queries via Photon warehouse" },
        { name: "Genie",                         layer: "serving",    purpose: "Natural-language to SQL interface" },
        { name: "AI/BI Dashboards",              layer: "apps",       purpose: "Executive dashboards" },
        { name: "Databricks Apps",               layer: "apps",       purpose: "Hosted interactive application" },
        { name: "Workflows",                     layer: "apps",       purpose: "Scheduled orchestration" },
        { name: "Clean Rooms",                   layer: "apps",       purpose: "Cross-org threat intel collaboration" },
      ];
      const DBX_NAMES = new Set(DBX_ALLOWLIST.map(d => d.name.toLowerCase()));
      const ALLOWED_LAYERS = new Set(["ingest", "lakehouse", "governance", "ml", "serving", "apps"]);

      const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

      const originalNodes: any[] = Array.isArray(plan.architecture_diagram?.nodes) ? plan.architecture_diagram.nodes : [];
      const originalLinks: any[] = Array.isArray(plan.architecture_diagram?.links) ? plan.architecture_diagram.links : [];

      // Keep nodes that map to a Databricks product, but preserve the LLM's
      // bespoke label/description so each diagram is tailored to the prompt.
      const keptNodes = originalNodes
        .map(n => {
          const productName = (n.databricks_product || n.label || "").toString();
          const match = DBX_ALLOWLIST.find(d => productName.toLowerCase().includes(d.name.toLowerCase()) || d.name.toLowerCase().includes(productName.toLowerCase()));
          if (!match) return null;
          const originalLabel = (n.label || "").toString().trim();
          const keepOriginal = originalLabel && originalLabel.toLowerCase() !== match.name.toLowerCase();
          return {
            ...n,
            type: "databricks",
            layer: ALLOWED_LAYERS.has(n.layer) ? n.layer : match.layer,
            databricks_product: match.name,
            label: keepOriginal ? `${match.name}: ${originalLabel}`.slice(0, 44) : match.name,
            description: n.description || match.purpose,
          };
        })
        .filter(Boolean);

      const keptIds = new Set(keptNodes.map((n: any) => n.id));
      const keptLinks = originalLinks.filter(l => keptIds.has(l.from) && keptIds.has(l.to));

      let finalNodes: any[] = keptNodes as any[];
      let finalLinks: any[] = keptLinks;

      // If the LLM's first pass lost too many nodes, make a dedicated bespoke
      // architecture call so the diagram relates specifically to THIS prompt.
      if (finalNodes.length < 6) {
        const bespoke = await generateBespokeArchitecture({
          openaiKey,
          prompt,
          plan,
          allowlist: DBX_ALLOWLIST,
        }).catch(() => null);

        if (bespoke && Array.isArray(bespoke.nodes) && bespoke.nodes.length >= 4) {
          finalNodes = bespoke.nodes;
          finalLinks = Array.isArray(bespoke.links) ? bespoke.links : [];
        } else {
          // Last-resort deterministic scaffold, but with products selected from
          // the prompt's keywords so it still varies per feature.
          const picks = pickRelevantProducts(prompt, plan, DBX_ALLOWLIST);
          finalNodes = picks.map(d => ({
            id: slug(d.name),
            label: d.name,
            type: "databricks",
            layer: d.layer,
            description: `${d.purpose} for: ${plan.title || prompt.slice(0, 60)}`,
            databricks_product: d.name,
            details: { inputs: "", outputs: "", scale: "", security: "Unity Catalog governed" },
          }));
          const byLayer = (layer: string) => finalNodes.filter(n => n.layer === layer);
          const chain = [
            ...byLayer("ingest"),
            ...byLayer("lakehouse"),
            ...byLayer("governance"),
            ...byLayer("ml"),
            ...byLayer("serving"),
            ...byLayer("apps"),
          ];
          finalLinks = [];
          for (let i = 0; i < chain.length - 1; i++) {
            finalLinks.push({
              from: chain[i].id,
              to: chain[i + 1].id,
              label: "flows to",
              protocol: "Delta",
              data: "events",
              latency: "",
              volume: "",
            });
          }
          const uc = finalNodes.find(n => n.label === "Unity Catalog");
          if (uc) {
            finalNodes.filter(n => ["lakehouse", "ml", "serving"].includes(n.layer) && n.id !== uc.id).forEach(n => {
              finalLinks.push({ from: uc.id, to: n.id, label: "governs", protocol: "UC" });
            });
          }
        }
      }

      plan.architecture_diagram = { nodes: finalNodes, links: finalLinks };

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

      // Pull REAL sample data from Supabase so the generated app is never empty.
      const safe = async <T,>(p: Promise<{ data: T | null }>) => p.then(r => r.data || []).catch(() => []) as Promise<any[]>;
      const [evSample, alSample, caSample, vuSample, crSample, iocSample, asSample, ubSample] = await Promise.all([
        safe(supabase.from("events").select("id, event_type, severity, source_ip, destination_ip, username, event_timestamp").order("event_timestamp", { ascending: false }).limit(40) as any),
        safe(supabase.from("alerts").select("id, title, severity, alert_type, status, created_at, description").order("created_at", { ascending: false }).limit(30) as any),
        safe(supabase.from("cases").select("id, title, status, priority, created_at").order("created_at", { ascending: false }).limit(20) as any),
        safe(supabase.from("vulnerabilities").select("id, cve_id, title, severity, cvss_score, status").order("cvss_score", { ascending: false }).limit(30) as any),
        safe(supabase.from("correlation_rules").select("id, rule_name, severity, description, rule_type, confidence_score").limit(20) as any),
        safe(supabase.from("iocs").select("id, indicator, indicator_type, threat_type, severity, confidence_score, first_seen").limit(25) as any),
        safe(supabase.from("asset_registry").select("id, asset_name, asset_type, criticality, ip_address, os, status").limit(25) as any),
        safe(supabase.from("user_behavior_events").select("id, event_type, event_category, timestamp, ip_address, anomaly_score, outcome").order("timestamp", { ascending: false }).limit(20) as any),
      ]);

      const sampleData = {
        events: evSample.slice(0, 30),
        alerts: alSample.slice(0, 20),
        cases: caSample.slice(0, 15),
        vulnerabilities: vuSample.slice(0, 20),
        correlation_rules: crSample.slice(0, 15),
        iocs: iocSample.slice(0, 20),
        asset_registry: asSample.slice(0, 20),
        user_behavior_events: ubSample.slice(0, 15),
      };

      const paigeSystem = `You are Paige, the Tech Writer agent. Produce concise, production-grade documentation for the approved feature.

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
        const backendSystem = `You are Amelia, the Developer agent. Write PRODUCTION ${code_language.toUpperCase()} code for the Databricks Lakehouse.

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
        const appSystem = `You are Amelia, the Developer agent. Build a PRODUCTION-QUALITY single-page security application that looks like it ships from Linear, Vercel, Stripe, or Datadog - not a prototype. Visual quality bar: newsroom-grade.

APPROVED PLAN (implement precisely):
${JSON.stringify(plan)}

DATABRICKS INTEGRATIONS (surface them prominently in the UI):
${(plan.databricks_features || []).map((f: any) => `- ${f.name}: ${f.purpose}`).join("\n")}

REAL SEED DATA FROM THE LAKEHOUSE (you MUST embed this verbatim as JS constants and render it everywhere):
\`\`\`json
${JSON.stringify(sampleData).slice(0, 18000)}
\`\`\`

DATA POPULATION RULES (non-negotiable):
- Create a top-level <script> that defines: const SEED = { events, alerts, cases, vulnerabilities, correlation_rules, iocs, asset_registry, user_behavior_events } using the REAL data above.
- Every table, chart, KPI, and drawer MUST render from SEED immediately on page load - the UI is NEVER empty on first paint.
- THEN optionally refresh from the Databricks Lakehouse gateway (window.__SUPABASE_URL__ + window.__SUPABASE_ANON_KEY__ are the internal credentials - DO NOT expose the word "Supabase" anywhere in the UI, status text, tooltips, or comments visible to the user; always label the data source as "Databricks Lakehouse", "Databricks SQL", "Delta Lake", or "Unity Catalog"). If the fetch succeeds, merge over SEED. If it fails, keep SEED silently. Never show a blank state because of a fetch miss.
- KPIs must be computed from SEED (counts, averages, severity breakdowns, trend from timestamps).
- Charts must plot SEED series: time-series from events/alerts timestamps, severity distribution from alerts, CVSS from vulnerabilities, risk scores from user_behavior_anomalies.
- Tables must render at least 10 rows from SEED with real values (titles, IPs, usernames, CVEs, timestamps formatted relative).
- The inspector drawer must show a real SEED record with all its fields on row click.
- If a SEED array is empty, fall back to a realistic hardcoded 10-row array (do not leave it blank).

SUPERPOWERS:
1. Databricks Lakehouse live tables (events, alerts, cases, vulnerabilities, correlation_rules) accessed through an internal gateway
2. Runtime AI at window.__RUNTIME_URL__ (GPT-4 + tool use): POST {messages,system} returns {message,reasoning_steps}
3. Tailwind + Chart.js + Canvas + vanilla JS

LAYOUT (mandatory):
- App shell: left sidebar (240px) with a wordmark text header (NO logos, NO images, NO icon-only brand marks), nav groups, status; top bar with breadcrumbs, search, time range, user; main canvas.
- Main canvas uses CSS grid with at least THREE clearly distinct zones (KPI strip, primary visualization, secondary panels). No single-column dumps.
- KPI strip: 4-6 stat cards with number + trend sparkline + delta (green/red) + label + subtle icon.
- Primary visualization area: large chart (line/area/heatmap/sankey/network) with proper legend, axis labels, units, and hover tooltips.
- Secondary panels: tables with sortable columns, filter chips, row detail drawer, and pagination.
- Right-side context panel (inspector) that opens on row click with tabs (Overview / Timeline / Related / Databricks Lineage).
- Footer ribbon: connection status, tenant, data freshness timestamp, "Governed by Unity Catalog" badge.

VISUAL SYSTEM (mandatory):
- Dark theme only. Page background #05070D. Card background bg-slate-900/60 with backdrop-blur-xl and border border-slate-800/60.
- Elevated cards use box-shadow 0 1px 0 0 rgba(255,255,255,0.04) inset AND 0 24px 48px -24px rgba(0,0,0,0.6).
- Accent ramps only: cyan(#06B6D4), emerald(#10B981), amber(#F59E0B), red(#EF4444), blue(#3B82F6), orange(#F97316), teal(#14B8A6). NEVER purple/indigo/violet.
- Typography: Inter for UI (font weights 400/500/600/700 only), JetBrains Mono for numbers/IDs/code. Headings tracking-tight. Body text-slate-300, muted text-slate-500, labels uppercase text-[10px] tracking-[0.14em] text-slate-500 font-semibold.
- Spacing on the 8px grid. Radii: 8px (inputs), 12px (cards), 16px (sections). Borders hairline (1px) with border-slate-800/60.
- Gradients: subtle only (from-slate-900 via-slate-900 to-slate-950, or accent-tinted overlays at 5-10% opacity). No loud gradients.
- Dividers are 1px slate-800 or gradient-to-r from-transparent via-slate-800 to-transparent.

COMPONENT DETAILS (mandatory):
- Every stat card: animated number count-up on mount, 24-point sparkline mini-canvas, trend arrow (up/down/flat), delta chip (bg-emerald-500/10 text-emerald-400 border-emerald-500/30).
- Every chart: gridlines at #1f2937, axis tick text-slate-500 font-mono text-[10px], series colors from accent ramp, smooth tension 0.35, filled gradient under lines, 300-360px tall, responsive.
- Tables: sticky header, zebra rows (slate-900/30 on odd), row hover bg-slate-800/40, row selection ring-1 ring-cyan-500/40, status pills (pill = px-2 py-0.5 rounded-full text-[10px] font-mono border), severity dots.
- Filter chips: inline pill row with active/inactive state, clearable X. Multi-select dropdown with search.
- Buttons: primary bg-cyan-500 text-slate-950 hover:bg-cyan-400 font-semibold; secondary bg-slate-800 hover:bg-slate-700 border-slate-700; ghost text-slate-400 hover:text-white.
- Inputs: bg-slate-950/60 border-slate-800 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 rounded-md px-3 py-2 text-sm.
- Empty state: centered illustration glyph + heading + 1-line description + primary action button. No blank cards.
- Loading state: skeleton shimmer bars matching the final shape (never a generic spinner alone).
- Error state: inline toast OR inline banner with red accent, retry button, and a "why this happened" hint.
- Toasts: bottom-right stack, slide-in 180ms, auto-dismiss 4s, dismissible.
- Keyboard shortcuts: "/" focuses search, "Esc" closes drawers, "j/k" row navigation, "?" shows shortcut cheatsheet overlay.

DATABRICKS SURFACING (mandatory):
- A persistent "Lakehouse Lineage" chip on every data panel showing the upstream Databricks product (e.g. "Delta Lake -> Unity Catalog -> Vector Search") with a hover popover of the full flow.
- A compact Databricks status widget in the sidebar listing governed tables, last DLT run, and Vector Search index status.
- At least one chart backed by a "Databricks SQL" label, at least one AI panel backed by "Mosaic AI Model Serving".

INTERACTIONS (mandatory):
- Row click opens right drawer with 160ms translate-x animation and focus trap.
- Chart hover shows a crosshair + tooltip with series values and timestamps.
- Command palette (Ctrl+K) listing actions and entities with fuzzy matching.
- All transitions 150-200ms ease-out. Hover states on every interactive element. Focus rings always visible.
- At least 3 animated micro-interactions: live pulse on "LIVE" indicator, count-up numbers, chart line draw-in on mount.

DATA (mandatory):
- Render SEED first. Attempt Databricks Lakehouse refresh in the background. Fall back to embedded sample datasets (8-15 rows each) so the UI is never empty. Label the data source only as "Databricks Lakehouse" or "Databricks SQL" in the UI.
- Timestamps: relative ("2m ago") with absolute on hover.
- Severities: Critical/High/Medium/Low with consistent color + icon.
- Numbers: locale-formatted with thousand separators and units.

NON-NEGOTIABLE:
0. NO LOGOS of any kind. Do not include <img> brand logos, SVG corporate marks, the Databricks logo, customer logos, tool logos, or placeholder logo squares. Use text wordmarks and Lucide-style inline SVG glyphs only when an icon is needed.
1. Single standalone HTML, <!DOCTYPE html> first line.
2. CDNs: tailwindcss, chart.js@4.4, @supabase/supabase-js@2.
3. Use Tailwind via <script src="https://cdn.tailwindcss.com"></script> with inline tailwind.config to register the Inter + JetBrains Mono fonts.
4. Load fonts from fonts.googleapis: Inter (400,500,600,700) and JetBrains Mono (400,500).
5. Minimum 3 real Chart.js charts wired with realistic data.
6. Minimum 1 searchable, sortable data table with at least 8 rows.
7. Minimum 1 detail drawer that opens on row click.
8. Sidebar + topbar + main + inspector layout present.
9. Every section has explicit loading / empty / error states wired up.
10. Output ONLY raw HTML. No markdown fences. Target 18k-32k chars.`;

        const gen = await callOpenAI(openaiKey, {
          model: "gpt-4o",
          messages: [
            { role: "system", content: appSystem },
            { role: "user", content: `Build the feature now. Output only HTML.` },
          ],
          temperature: 0.6,
          max_tokens: 14000,
        });
        html = (gen.choices?.[0]?.message?.content || "").replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
        tokens = gen.usage?.total_tokens || 0;
        if (!html || html.length < 500) return json({ error: "AI produced empty output. Try rephrasing." }, 500);

        // POLISH PASS: Sally (UX) critiques Amelia's draft and rewrites it for visual perfection.
        const polishSystem = `You are Sally, the UX/Design agent. You receive a single-page HTML app written by Amelia and your job is to audit it against a design rubric and return a VISUALLY PERFECTED rewrite.

AUDIT CHECKLIST (fix anything failing):
- NO LOGOS: strip any <img> logo, brand SVG mark, Databricks logo, customer logos. Replace with a text wordmark.
- NO "SUPABASE" STRINGS in any user-visible text or comment. Relabel as "Databricks Lakehouse" / "Databricks SQL" / "Delta Lake" / "Unity Catalog".
- DATA POPULATION: every KPI, chart, and table MUST render real values from the embedded SEED constant on first paint. No empty cards, no placeholder zeros, no "---" values. If a section is empty, populate it from SEED or a hardcoded 10-row fallback.
- Data refresh must be non-blocking: SEED renders first, then a background fetch to the Databricks Lakehouse gateway can upgrade it. The word "Supabase" must NEVER appear in any user-visible string, status, tooltip, label, or comment - relabel every occurrence as "Databricks Lakehouse", "Databricks SQL", "Delta Lake", or "Unity Catalog".
- App shell present: sidebar (240px) + topbar + main + right inspector drawer.
- KPI strip: 4-6 stat cards with sparkline canvas, animated count-up, delta chip.
- Primary chart area: real Chart.js chart, 300-360px tall, gradient fill, proper legend, hover tooltip, axis units.
- Tables: sticky header, zebra rows, hover, sortable headers, severity pills, status dots, row-click drawer.
- Every section has explicit loading / empty / error states (not just an empty div).
- Typography: Inter UI, JetBrains Mono numerics, Google Fonts loaded. Uppercase tracked labels for section headers.
- Color discipline: dark #05070D bg, slate-900/60 cards with backdrop-blur, accent ramp only. Zero purple/indigo/violet.
- Spacing on 8px grid, 12px card radii, hairline slate-800 borders, elevated shadows.
- Micro-interactions: 150-200ms transitions, hover states on every interactive, focus rings, LIVE pulse dot.
- Keyboard shortcuts: "/" focus search, "Esc" close drawer, "?" show cheatsheet.
- Databricks Lakehouse Lineage chip and sidebar Databricks status widget are visible.
- Layout does NOT collapse to a single-column dump. Multi-zone grid enforced.
- Output length minimum 16k chars, target 22k-34k. Expand thin sections until perfect.

RULES:
- Preserve Amelia's feature semantics and data wiring. Do not remove features.
- Upgrade weak sections; do not regress strong ones.
- Return ONLY the final raw HTML (full document). No markdown fences. No commentary.
- Keep all CDN <script> tags. Keep window.__RUNTIME_URL__ and the internal gateway fetch logic intact, but strip any user-visible mention of "Supabase".`;

        const polish = await callOpenAI(openaiKey, {
          model: "gpt-4o",
          messages: [
            { role: "system", content: polishSystem },
            { role: "user", content: `Audit and perfect this HTML. Return ONLY the final polished HTML document.\n\n---\n${html}` },
          ],
          temperature: 0.45,
          max_tokens: 14000,
        }).catch(() => null);

        if (polish) {
          const polished = (polish.choices?.[0]?.message?.content || "").replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();
          if (polished && polished.length >= html.length * 0.9 && polished.toLowerCase().startsWith("<!doctype")) {
            html = polished;
            tokens += polish.usage?.total_tokens || 0;
          }
        }
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
