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

    // Fetch sample data from the unified events table for context
    const [eventsRes, alertsRes, casesRes] = await Promise.all([
      supabase.from("events").select("event_type, severity, description, source_ip, dest_ip, username, hostname, tags, metadata").order("event_timestamp", { ascending: false }).limit(30),
      supabase.from("alerts").select("alert_id, title, severity, status, alert_type, source, confidence_score, tags, metadata, created_at").order("created_at", { ascending: false }).limit(20),
      supabase.from("cases").select("title, status, priority, severity, category, created_at").order("created_at", { ascending: false }).limit(10),
    ]);

    const sampleData = {
      events: eventsRes.data?.slice(0, 15) || [],
      alerts: alertsRes.data?.slice(0, 10) || [],
      cases: casesRes.data?.slice(0, 5) || [],
    };

    // Fetch event type distribution for context
    const eventTypes = (eventsRes.data || []).reduce((acc: Record<string, number>, e: any) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1;
      return acc;
    }, {});

    const systemPrompt = `You are an expert security dashboard builder. The user wants to create a new security/fraud feature as a standalone HTML page.

You have access to REAL data from a SOC platform with these event types: ${Object.keys(eventTypes).join(", ")}

SAMPLE REAL DATA (use this to make realistic visualizations):
${JSON.stringify(sampleData, null, 2)}

SUPABASE CONNECTION (the page can query live data):
- URL: ${supabaseUrl}
- Anon Key: The page will receive it via window.__SUPABASE_ANON_KEY__
- URL via window.__SUPABASE_URL__

REQUIREMENTS:
1. Generate a COMPLETE standalone HTML page
2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
3. Use Chart.js for charts: <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0"></script>
4. Dark theme: bg-[#0a0e1a] as body background, use slate-800/900 cards, cyan/emerald/red/amber accents
5. The page MUST be self-contained - all HTML, CSS, JS in one file
6. Use the Supabase JS CDN for data fetching: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
7. Initialize Supabase with: const sb = supabase.createClient(window.__SUPABASE_URL__, window.__SUPABASE_ANON_KEY__)
8. Embed the sample data as fallback so the page works even without live connection
9. Make it BEAUTIFUL - smooth animations, gradients, micro-interactions, hover effects
10. Include animated elements (pulse dots, counter animations, progress bars)
11. Be creative with the layout - use CSS grid, modern card designs, glassmorphism
12. NEVER use purple/indigo/violet colors. Use cyan, emerald, blue, amber, red, orange instead
13. Add a title bar at the top with the feature name and a "LIVE" indicator
14. Make it responsive
15. The output MUST be ONLY the HTML code, nothing else. No markdown, no explanation.
16. Use monospace fonts for data, Inter/system-ui for text
17. Add smooth fade-in animations on load
18. For any data tables, use alternating row colors and hover highlights
19. Include realistic numbers and metrics based on the sample data provided
20. If the user asks for charts, use Chart.js with dark theme config (gridlines: slate-700, text: slate-400)

The generated page will be rendered inside a sandboxed iframe. Keep it under 15000 characters.`;

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
    if (lowerPrompt.includes("chart") || lowerPrompt.includes("graph") || lowerPrompt.includes("viz")) category = "chart";
    else if (lowerPrompt.includes("monitor") || lowerPrompt.includes("live") || lowerPrompt.includes("real-time")) category = "monitor";
    else if (lowerPrompt.includes("tool") || lowerPrompt.includes("scanner") || lowerPrompt.includes("analyzer")) category = "tool";
    else if (lowerPrompt.includes("report") || lowerPrompt.includes("summary") || lowerPrompt.includes("executive")) category = "report";

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
