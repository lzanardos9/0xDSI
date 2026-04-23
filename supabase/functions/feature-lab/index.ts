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
    const [eventsRes, alertsRes, casesRes, vulnsRes, trojanEventsRes, pixEventsRes, corrRulesRes] = await Promise.all([
      supabase.from("events").select("event_type, severity, description, source_ip, dest_ip, username, hostname, tags, metadata, mitre_tactic, mitre_technique, raw_log, event_timestamp").order("event_timestamp", { ascending: false }).limit(40),
      supabase.from("alerts").select("alert_id, title, description, severity, status, alert_type, source, confidence_score, source_ip, hostname, mitre_tactic, mitre_technique, tags, metadata, created_at").order("created_at", { ascending: false }).limit(25),
      supabase.from("cases").select("title, description, status, priority, severity, category, assigned_to, tags, created_at").order("created_at", { ascending: false }).limit(15),
      supabase.from("vulnerabilities").select("title, severity, status, cvss_score, discovered_at").order("cvss_score", { ascending: false }).limit(15),
      supabase.from("events").select("event_type, severity, description, metadata, tags, mitre_technique, event_timestamp").eq("event_type", "banking_trojan").order("event_timestamp", { ascending: false }).limit(10),
      supabase.from("events").select("event_type, severity, description, metadata, tags, event_timestamp").eq("event_type", "pix_fraud").order("event_timestamp", { ascending: false }).limit(10),
      supabase.from("correlation_rules").select("rule_name, description, severity, status, rule_type, match_count").limit(15),
    ]);

    const sampleData = {
      events: eventsRes.data || [],
      alerts: alertsRes.data || [],
      cases: casesRes.data || [],
      vulnerabilities: vulnsRes.data || [],
      banking_trojans: trojanEventsRes.data || [],
      pix_fraud_events: pixEventsRes.data || [],
      correlation_rules: corrRulesRes.data || [],
    };

    const eventTypes = (eventsRes.data || []).reduce((acc: Record<string, number>, e: any) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1;
      return acc;
    }, {});

    const systemPrompt = `You are an ELITE full-stack security engineer building interactive security tools. You can create ANYTHING - not just dashboards. You build agents, simulators, interactive tools, workflow builders, attack visualizations, games, chatbots, and complex multi-step applications.

You have access to a REAL SOC platform with these event types: ${Object.keys(eventTypes).join(", ")}

DATABASE TABLES YOU CAN QUERY (via Supabase JS):
- events: event_type, severity, description, source_ip, dest_ip, username, hostname, tags (jsonb), metadata (jsonb), mitre_tactic, mitre_technique, raw_log, event_timestamp
- alerts: alert_id, title, description, severity, status, alert_type, source, confidence_score, source_ip, hostname, mitre_tactic, mitre_technique, tags, metadata, created_at
- cases: title, description, status, priority, severity, category, assigned_to, tags, created_at
- vulnerabilities: title, severity, status, cvss_score, discovered_at
- correlation_rules: rule_name, description, severity, status, rule_type, match_count
- malware_samples: sample_name, severity, sandbox_status, malware_family, threat_category
- threat_feeds: feed_name, enabled, total_indicators, last_sync_at
- user_behavior_events: user_profile_id, event_type, event_category, action, anomaly_score, timestamp
- iocs: indicator_type, indicator, severity, description, first_seen, last_seen
- red_team_campaigns: campaign_name, status, attack_type, success_rate
- feature_lab_creations: title, prompt, category, created_at

SAMPLE REAL DATA (embed as fallback AND use for realistic content):
${JSON.stringify(sampleData, null, 2)}

SUPABASE CONNECTION:
- Initialize with: const sb = supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__)
- Query example: const { data } = await sb.from("events").select("*").eq("event_type", "pix_fraud").order("event_timestamp", { ascending: false }).limit(20)
- ALWAYS wrap queries in try/catch and use fallback data on error

FEATURE TYPES YOU CAN BUILD (match what the user asks for):

1. AGENTS & CHATBOTS: Build interactive AI-style agents with a chat interface, message bubbles, typing indicators, command parsing, and simulated reasoning steps. Include a text input, send button, and scrollable message history. The agent should "think" (show animated reasoning steps) then respond with data-driven answers. Parse user input for keywords and query relevant tables.

2. SIMULATORS & ATTACK TOOLS: Build interactive attack simulations with step-by-step progression, animated attack flows, start/pause/reset controls, configurable parameters (sliders, dropdowns), and real-time progress. Use requestAnimationFrame or setInterval for animations. Show kill chains, network diagrams, or decision trees that progress over time.

3. INTERACTIVE INVESTIGATION TOOLS: Build tools with search bars, filters, drill-down panels, expandable rows, tabbed interfaces, and detail modals. Include keyboard shortcuts. Let users click on entities (IPs, users, hashes) to pivot and explore relationships.

4. WORKFLOW BUILDERS: Build drag-and-drop style interfaces (simulated with click-to-add) for creating detection rules, playbooks, or automation flows. Include node-based visuals with connections, configuration panels, and save/export functionality.

5. MONITORING & LIVE FEEDS: Build real-time monitoring tools with auto-refreshing data, scrolling event feeds, animated gauges, sparklines, and status indicators. Use setInterval for simulated real-time updates.

6. CANVAS VISUALIZATIONS: Build rich canvas-based visualizations - network graphs, attack trees, entity relationship maps, geographic heatmaps, timeline views. Use HTML5 Canvas with requestAnimationFrame for smooth animations.

7. DASHBOARDS & REPORTS: Build rich dashboards with Chart.js, KPI cards, data tables, and drill-down capability. But make them INTERACTIVE - clicking a chart segment should filter the data, hovering should show tooltips.

8. GAMES & TRAINING: Build security training games, CTF-style challenges, phishing identification quizzes, or incident response decision trees with scoring and feedback.

CRITICAL TECHNICAL REQUIREMENTS:
- Generate a COMPLETE standalone HTML page - all HTML, CSS, JS in ONE file
- CDNs to include:
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
- Dark theme: body bg-[#0a0e1a], cards bg-[#0d1117] or bg-slate-900/80, borders border-slate-700/50
- Color palette: cyan-400/500, emerald-400/500, amber-400/500, red-400/500, blue-400/500, orange-400/500. NEVER use purple/indigo/violet.
- Fonts: monospace for data/code, system-ui for text
- Add smooth CSS animations: @keyframes fadeIn, slideUp, pulse. Use transition-all on interactive elements.
- Make the feature ACTUALLY FUNCTIONAL - buttons should do things, inputs should process, clicks should respond
- Include proper error states, loading states, and empty states
- Add a header bar with title, LIVE indicator, and relevant controls
- The output MUST be ONLY the raw HTML. No markdown fences, no explanation, no commentary.
- IMPORTANT: Keep total size under 15000 characters. Be efficient with code - use template literals, compact CSS, minimize whitespace in embedded data.
- IMPORTANT: Make the page work standalone - embed fallback data so it renders even if Supabase is unreachable.
- IMPORTANT: If the user asks for an agent or chatbot, the MAIN interface must be a chat/conversation UI, NOT a dashboard with a small chat panel.
- IMPORTANT: Match the user's intent precisely. If they say "agent", build an agent. If they say "simulator", build a simulator. Do NOT default to a dashboard layout unless they ask for one.`;

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
        max_tokens: 8000,
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
