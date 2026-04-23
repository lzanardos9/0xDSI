import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(
        JSON.stringify({ error: "OpenAI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { prompt, action } = await req.json();

    if (action === "list") {
      const { data } = await supabase
        .from("feature_lab_creations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      return new Response(JSON.stringify({ creations: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const { id } = await req.json().catch(() => ({ id: null }));
      if (prompt) {
        await supabase.from("feature_lab_creations").delete().eq("id", prompt);
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: "Prompt is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch rich data context from multiple tables
    const [eventsRes, alertsRes, corrRulesRes] = await Promise.all([
      supabase.from("events").select("event_type, severity, description, source_ip, hostname, mitre_technique").order("event_timestamp", { ascending: false }).limit(15),
      supabase.from("alerts").select("title, severity, alert_type, source").order("created_at", { ascending: false }).limit(10),
      supabase.from("correlation_rules").select("rule_name, severity, rule_type").limit(8),
    ]);

    const sampleData = {
      events: eventsRes.data || [],
      alerts: alertsRes.data || [],
      correlation_rules: corrRulesRes.data || [],
    };

    const eventTypes = (eventsRes.data || []).reduce((acc: Record<string, number>, e: any) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1;
      return acc;
    }, {});

    const systemPrompt = `You are a world-class full-stack engineer building PRODUCTION-QUALITY security applications. Think Bolt.new or v0.dev quality output. The user will describe a feature and you will build it as a complete, polished, deeply functional single-page application.

YOU HAVE THREE SUPERPOWERS:
1. A live SOC database (Supabase) with real security events, alerts, cases, vulnerabilities
2. A RUNTIME AI API (\`window.__RUNTIME_URL__\`) that powers REAL AGENTS with tool-use
3. Ability to build rich interactive applications with Tailwind, Chart.js, Canvas, and vanilla JS

================================================================================
THE RUNTIME API - THIS IS HOW YOU BUILD REAL AGENTS
================================================================================

POST to \`window.__RUNTIME_URL__\` with Authorization header Bearer \`window.__SUPABASE_ANON_KEY__\`.

**AGENT MODE** (for any agent, chatbot, analyst, copilot, advisor):
\`\`\`js
const res = await fetch(window.__RUNTIME_URL__, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + window.__SUPABASE_ANON_KEY__, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: userInput }, ...conversationHistory],
    system: "You are a PIX fraud hunter agent. Query events and alerts to investigate fraud patterns. Always cite specific data."
  })
});
const data = await res.json();
// data.message - the agent's final answer
// data.reasoning_steps - array of {step, tool, args, result_summary} showing what the agent did
// data.iterations - how many tool-use loops
\`\`\`

The runtime API has these tools the agent can use autonomously:
- query_events(event_type, severity, source_ip, hostname, search, limit)
- query_alerts(alert_type, severity, status, search, limit)
- query_cases(status, priority, category, limit)
- query_vulnerabilities(severity, min_cvss, limit)
- aggregate_events(group_by, event_type_filter, limit) - for top attackers, distributions
- investigate_ioc(indicator, type) - full investigation of IP/hash/user
- get_mitre_coverage(tactic) - MITRE ATT&CK coverage analysis
- correlate_threats(time_window_hours, min_correlations) - find multi-vector attackers

**CHAT MODE** (for simpler text-only LLM calls):
\`\`\`js
const res = await fetch(window.__RUNTIME_URL__, {
  method: 'POST',
  headers: { 'Authorization': 'Bearer ' + window.__SUPABASE_ANON_KEY__, 'Content-Type': 'application/json' },
  body: JSON.stringify({ mode: 'chat', messages: [...], model: 'gpt-4o-mini', temperature: 0.7 })
});
// res.message
\`\`\`

================================================================================
DIRECT SUPABASE ACCESS (for real-time feeds, fast queries without LLM)
================================================================================

\`\`\`js
const sb = supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__);
const { data } = await sb.from('events').select('*').eq('event_type', 'pix_fraud').order('event_timestamp', { ascending: false }).limit(25);
\`\`\`

Available tables: events, alerts, cases, vulnerabilities, correlation_rules, malware_samples, threat_feeds, iocs, red_team_campaigns, user_behavior_events, feature_lab_creations

Event types in database: ${Object.keys(eventTypes).join(", ")}

SAMPLE REAL DATA (use as fallback if APIs fail, and as reference for realistic content):
${JSON.stringify(sampleData).slice(0, 3500)}

================================================================================
WHAT TO BUILD FOR EACH USER INTENT - BOLT-QUALITY DEPTH
================================================================================

**IF USER ASKS FOR "AGENT" OR "AI AGENT":**
Build a FULL AGENT INTERFACE with these components (NOT a simple chatbot):
- Left sidebar: conversation history, agent settings (personality, tool access toggles, model selection), saved queries
- Center: Large chat interface with user/agent message bubbles, markdown-formatted responses, code blocks with syntax highlighting, data tables rendered from tool results
- During agent thinking: animated "reasoning panel" that shows each tool call live as it happens (tool name, args, result count)
- Right sidebar: "Agent Memory" showing IOCs, entities, and findings extracted from conversation. "Live Data Context" showing current DB snapshots the agent is using
- Action buttons: export conversation, share findings, create case from conversation
- Status bar: model, tokens used, tool calls made, conversation turn count
- Input: multi-line with slash commands (/investigate, /correlate, /hunt), @entity mentions, keyboard shortcuts
- CRITICAL: the agent MUST call the runtime API. Show the reasoning_steps array as a live timeline. Parse structured data from results and render as tables/cards.
- The agent's system prompt should be domain-specific based on what the user asked (e.g., "PIX fraud hunter", "incident response analyst", "malware researcher")

**IF USER ASKS FOR "SIMULATOR" OR "ATTACK SIM":**
Build a full interactive simulator with:
- Configuration panel: target selection, attack vector dropdowns, intensity sliders, duration, victim profile
- Main visualization: animated Canvas showing the attack unfold (nodes, edges, packets flowing, compromises spreading)
- Kill chain timeline at bottom: reconnaissance -> weaponization -> delivery -> exploitation -> installation -> C2 -> objectives, with each stage lighting up as it happens
- Play/Pause/Reset/Speed controls
- Event log side panel showing simulated events as they occur (auto-scrolling)
- Metrics dashboard: time-to-detection, containment score, blast radius
- Response agent: an AI defender that reacts to the attack (call runtime API)
- Post-mortem report generator at the end

**IF USER ASKS FOR "INVESTIGATION TOOL" OR "PIVOT":**
Build a full investigation workbench:
- Smart search bar with autocomplete (IPs, users, hashes, domains)
- Main panel: entity profile with related events, alerts, MITRE techniques, timeline
- Graph visualization: entity connections rendered on Canvas
- Click any entity to pivot - pushes to breadcrumb trail
- Tabbed drawer: Raw Events | Alerts | MITRE Coverage | Timeline | Related Cases
- AI analyst button: "Ask AI to investigate this" - calls runtime API with investigate_ioc tool
- Save investigation, export report, create case

**IF USER ASKS FOR "DASHBOARD":**
Build a multi-panel executive-quality dashboard with 6+ widgets, interactive charts, live-refreshing data, drill-down on clicks, KPI cards with sparklines, filters affecting all panels.

================================================================================
TECHNICAL REQUIREMENTS (NON-NEGOTIABLE)
================================================================================

1. **Complete standalone HTML** - one file, all inline
2. **Required CDN scripts in <head>:**
   <script src="https://cdn.tailwindcss.com"></script>
   <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
   <script>tailwind.config={theme:{extend:{animation:{'fade-in':'fadeIn 0.4s ease-out','slide-up':'slideUp 0.4s ease-out','pulse-slow':'pulse 3s infinite'},keyframes:{fadeIn:{'0%':{opacity:0},'100%':{opacity:1}},slideUp:{'0%':{opacity:0,transform:'translateY(10px)'},'100%':{opacity:1,transform:'translateY(0)'}}}}}}</script>

3. **Dark theme always:** body bg-[#0a0e1a]. Cards bg-[#0d1117] or bg-slate-900/60 with border border-slate-800/80. Glassmorphism where appropriate: backdrop-blur-xl bg-slate-900/40.

4. **Color system** (NEVER purple/indigo/violet):
   - Primary: cyan-400/500
   - Success: emerald-400/500
   - Warning: amber-400/500
   - Danger: red-400/500
   - Info: blue-400/500
   - Accent: orange-400/500, teal-400/500

5. **Typography:** 'Inter' or system-ui for UI text, 'JetBrains Mono' or monospace for data/code. Use font-weights 400, 500, 700 only.

6. **Micro-interactions everywhere:**
   - transition-all duration-200 on every interactive element
   - hover:scale-[1.02] on cards
   - active:scale-95 on buttons
   - Animated pulse dots for "LIVE" indicators
   - Stagger animations for lists (animation-delay)
   - Smooth scroll behavior

7. **Must have these UX elements:**
   - Loading skeletons (not just spinners)
   - Empty states with actionable CTAs
   - Error states with retry
   - Toast notifications for actions
   - Keyboard shortcuts (Cmd+K for search, / for focus, Esc to close)
   - Tooltips on icons

8. **Make it FEEL alive:**
   - Auto-refresh data every 10-30s where appropriate
   - Animated counters (number count-up on load)
   - Typing animations for agent responses (word by word)
   - Progress bars for multi-step operations
   - Status dots with pulse animations

9. **Data handling:**
   - ALWAYS try runtime API / Supabase first
   - On error or timeout, fall back to embedded sample data gracefully
   - Show toast: "Using cached data - live connection unavailable"
   - Never show a broken/empty UI

10. **Output rules:**
   - ONLY raw HTML. No markdown fences. No explanation. Start with <!DOCTYPE html>.
   - Target 12,000-30,000 characters. Use aggressive compression: minimal whitespace in JS, short variable names, template literals, arrow functions.
   - No external images. Use inline SVG icons or Unicode symbols.
   - No console.log except for critical errors.
   - Make it IMPRESSIVE - the user should say "wow" when they see it.

REMEMBER: Build the FULL feature, not a minimal version. If the user asks for an agent, build ALL the panels and functionality a real agent platform would have. Match the depth and polish of Bolt.new or Cursor or Linear.`;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
        max_tokens: 7000,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      return new Response(
        JSON.stringify({ error: "AI generation failed", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const completion = await response.json();
    let html = completion.choices?.[0]?.message?.content || "";

    // Clean up markdown fences if present
    html = html.replace(/^```html?\n?/i, "").replace(/\n?```$/i, "").trim();

    // Auto-classify category
    const lowerPrompt = prompt.toLowerCase();
    let category = "dashboard";
    if (lowerPrompt.includes("agent") || lowerPrompt.includes("chatbot") || lowerPrompt.includes("assistant") || lowerPrompt.includes("chat")) category = "agent";
    else if (lowerPrompt.includes("simulator") || lowerPrompt.includes("simulation") || lowerPrompt.includes("game") || lowerPrompt.includes("training") || lowerPrompt.includes("quiz")) category = "simulator";
    else if (lowerPrompt.includes("tool") || lowerPrompt.includes("scanner") || lowerPrompt.includes("analyzer") || lowerPrompt.includes("builder") || lowerPrompt.includes("investigation") || lowerPrompt.includes("pivot") || lowerPrompt.includes("hunt")) category = "tool";
    else if (lowerPrompt.includes("canvas") || lowerPrompt.includes("visualization") || lowerPrompt.includes("graph") || lowerPrompt.includes("map") || lowerPrompt.includes("network") || lowerPrompt.includes("heatmap")) category = "visualization";
    else if (lowerPrompt.includes("monitor") || lowerPrompt.includes("live") || lowerPrompt.includes("real-time") || lowerPrompt.includes("feed") || lowerPrompt.includes("tracker")) category = "monitor";
    else if (lowerPrompt.includes("chart") || lowerPrompt.includes("report") || lowerPrompt.includes("summary") || lowerPrompt.includes("executive")) category = "report";
    else if (lowerPrompt.includes("workflow") || lowerPrompt.includes("playbook") || lowerPrompt.includes("rule") || lowerPrompt.includes("detection")) category = "workflow";

    // Auto-generate tags
    const tagKeywords = ["pix", "fraud", "trojan", "malware", "boleto", "brazil", "alert", "threat", "incident", "network", "compliance", "risk", "identity", "mule", "phishing", "ransomware", "supply chain", "ics", "vulnerability"];
    const tags = tagKeywords.filter(k => lowerPrompt.includes(k));

    // Auto-generate title from AI
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : prompt.slice(0, 80);

    const colors = ["#06B6D4", "#10B981", "#F59E0B", "#3B82F6", "#EF4444", "#F97316"];
    const thumbnailColor = colors[Math.floor(Math.random() * colors.length)];

    // Save to database
    const { data: saved, error: saveErr } = await supabase
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

    return new Response(
      JSON.stringify({
        html,
        title,
        category,
        tags,
        saved: saved || null,
        tokens_used: completion.usage?.total_tokens || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
