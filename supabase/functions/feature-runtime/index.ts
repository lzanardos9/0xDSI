import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Tool definitions that generated features can use
const TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "query_events",
      description: "Query the unified events table. Filter by event_type (pix_fraud, banking_trojan, boleto_fraud, social_engineering, supply_chain_attack, ics_safety, counterfeit_detection, ip_theft, authentication, network_connection, etc.), severity, source_ip, hostname, or free-text search in description.",
      parameters: {
        type: "object",
        properties: {
          event_type: { type: "string", description: "Filter by event type" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          source_ip: { type: "string" },
          hostname: { type: "string" },
          search: { type: "string", description: "Free-text search in description" },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_alerts",
      description: "Query security alerts. Filter by alert_type, severity, status.",
      parameters: {
        type: "object",
        properties: {
          alert_type: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          status: { type: "string", enum: ["open", "investigating", "acknowledged", "resolved", "closed"] },
          search: { type: "string" },
          limit: { type: "number", default: 20 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_cases",
      description: "Query investigation cases.",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string" },
          priority: { type: "string" },
          category: { type: "string" },
          limit: { type: "number", default: 15 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_vulnerabilities",
      description: "Query vulnerabilities by CVSS severity.",
      parameters: {
        type: "object",
        properties: {
          severity: { type: "string" },
          min_cvss: { type: "number" },
          limit: { type: "number", default: 15 },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "aggregate_events",
      description: "Get aggregated statistics about events - counts grouped by type, severity, source_ip, or hostname. Use for top attackers, attack distribution, trends.",
      parameters: {
        type: "object",
        properties: {
          group_by: { type: "string", enum: ["event_type", "severity", "source_ip", "hostname", "mitre_tactic", "mitre_technique"] },
          event_type_filter: { type: "string" },
          limit: { type: "number", default: 15 },
        },
        required: ["group_by"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "investigate_ioc",
      description: "Investigate an indicator of compromise (IP, hash, domain). Returns related events, alerts, and threat intel.",
      parameters: {
        type: "object",
        properties: {
          indicator: { type: "string" },
          type: { type: "string", enum: ["ip", "hash", "domain", "user"], default: "ip" },
        },
        required: ["indicator"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_mitre_coverage",
      description: "Get MITRE ATT&CK tactic/technique coverage from recent events.",
      parameters: {
        type: "object",
        properties: {
          tactic: { type: "string", description: "Optional TA0001-TA0043 to filter" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "correlate_threats",
      description: "Find correlations between events - e.g., same IP across multiple event types, same user across trojans + PIX fraud. Returns entities with multi-category activity.",
      parameters: {
        type: "object",
        properties: {
          time_window_hours: { type: "number", default: 24 },
          min_correlations: { type: "number", default: 2 },
        },
      },
    },
  },
];

async function executeTool(sb: any, name: string, args: any): Promise<any> {
  try {
    if (name === "query_events") {
      let q = sb.from("events").select("event_type, severity, description, source_ip, dest_ip, username, hostname, tags, metadata, mitre_tactic, mitre_technique, event_timestamp").order("event_timestamp", { ascending: false });
      if (args.event_type) q = q.eq("event_type", args.event_type);
      if (args.severity) q = q.eq("severity", args.severity);
      if (args.source_ip) q = q.eq("source_ip", args.source_ip);
      if (args.hostname) q = q.ilike("hostname", `%${args.hostname}%`);
      if (args.search) q = q.ilike("description", `%${args.search}%`);
      q = q.limit(Math.min(args.limit || 20, 50));
      const { data } = await q;
      return { rows: data || [], count: data?.length || 0 };
    }

    if (name === "query_alerts") {
      let q = sb.from("alerts").select("alert_id, title, description, severity, status, alert_type, source, confidence_score, source_ip, hostname, mitre_tactic, mitre_technique, tags, metadata, created_at").order("created_at", { ascending: false });
      if (args.alert_type) q = q.eq("alert_type", args.alert_type);
      if (args.severity) q = q.eq("severity", args.severity);
      if (args.status) q = q.eq("status", args.status);
      if (args.search) q = q.ilike("title", `%${args.search}%`);
      q = q.limit(Math.min(args.limit || 20, 50));
      const { data } = await q;
      return { rows: data || [], count: data?.length || 0 };
    }

    if (name === "query_cases") {
      let q = sb.from("cases").select("title, description, status, priority, severity, category, assigned_to, tags, created_at").order("created_at", { ascending: false });
      if (args.status) q = q.eq("status", args.status);
      if (args.priority) q = q.eq("priority", args.priority);
      if (args.category) q = q.eq("category", args.category);
      q = q.limit(Math.min(args.limit || 15, 30));
      const { data } = await q;
      return { rows: data || [], count: data?.length || 0 };
    }

    if (name === "query_vulnerabilities") {
      let q = sb.from("vulnerabilities").select("title, severity, status, cvss_score, discovered_at").order("cvss_score", { ascending: false });
      if (args.severity) q = q.eq("severity", args.severity);
      if (args.min_cvss) q = q.gte("cvss_score", args.min_cvss);
      q = q.limit(Math.min(args.limit || 15, 30));
      const { data } = await q;
      return { rows: data || [], count: data?.length || 0 };
    }

    if (name === "aggregate_events") {
      let q = sb.from("events").select(`${args.group_by}, severity, event_type`);
      if (args.event_type_filter) q = q.eq("event_type", args.event_type_filter);
      q = q.limit(500);
      const { data } = await q;
      if (!data) return { rows: [], count: 0 };
      const agg: Record<string, { count: number; severities: Record<string, number>; sample_types: Set<string> }> = {};
      for (const row of data as any[]) {
        const key = row[args.group_by];
        if (!key) continue;
        if (!agg[key]) agg[key] = { count: 0, severities: {}, sample_types: new Set() };
        agg[key].count++;
        agg[key].severities[row.severity] = (agg[key].severities[row.severity] || 0) + 1;
        if (row.event_type) agg[key].sample_types.add(row.event_type);
      }
      const rows = Object.entries(agg)
        .map(([k, v]) => ({ [args.group_by]: k, count: v.count, severities: v.severities, event_types: [...v.sample_types] }))
        .sort((a, b) => b.count - a.count)
        .slice(0, args.limit || 15);
      return { rows, total_rows: data.length };
    }

    if (name === "investigate_ioc") {
      const indicator = args.indicator;
      const type = args.type || "ip";
      const field = type === "ip" ? "source_ip" : type === "hash" ? "description" : type === "user" ? "username" : "description";
      const { data: events } = await sb.from("events").select("event_type, severity, description, hostname, username, mitre_technique, event_timestamp").or(`source_ip.eq.${indicator},dest_ip.eq.${indicator},username.eq.${indicator},description.ilike.%${indicator}%`).order("event_timestamp", { ascending: false }).limit(20);
      const { data: alerts } = await sb.from("alerts").select("title, severity, alert_type, confidence_score, created_at").or(`source_ip.eq.${indicator},hostname.eq.${indicator}`).limit(10);
      return { indicator, type, events: events || [], alerts: alerts || [], event_count: events?.length || 0, alert_count: alerts?.length || 0 };
    }

    if (name === "get_mitre_coverage") {
      let q = sb.from("events").select("mitre_tactic, mitre_technique, severity, event_type").not("mitre_tactic", "is", null);
      if (args.tactic) q = q.eq("mitre_tactic", args.tactic);
      q = q.limit(300);
      const { data } = await q;
      if (!data) return { rows: [] };
      const tactics: Record<string, { count: number; techniques: Record<string, number> }> = {};
      for (const e of data as any[]) {
        if (!tactics[e.mitre_tactic]) tactics[e.mitre_tactic] = { count: 0, techniques: {} };
        tactics[e.mitre_tactic].count++;
        if (e.mitre_technique) tactics[e.mitre_tactic].techniques[e.mitre_technique] = (tactics[e.mitre_tactic].techniques[e.mitre_technique] || 0) + 1;
      }
      return { rows: Object.entries(tactics).map(([t, v]) => ({ tactic: t, event_count: v.count, techniques: v.techniques })) };
    }

    if (name === "correlate_threats") {
      const hoursAgo = new Date(Date.now() - (args.time_window_hours || 24) * 3600 * 1000).toISOString();
      const { data } = await sb.from("events").select("source_ip, username, event_type, severity, event_timestamp").gte("event_timestamp", hoursAgo).limit(500);
      if (!data) return { correlations: [] };
      const ipMap: Record<string, Set<string>> = {};
      for (const e of data as any[]) {
        if (!e.source_ip) continue;
        if (!ipMap[e.source_ip]) ipMap[e.source_ip] = new Set();
        ipMap[e.source_ip].add(e.event_type);
      }
      const correlations = Object.entries(ipMap)
        .filter(([, types]) => types.size >= (args.min_correlations || 2))
        .map(([ip, types]) => ({ entity: ip, entity_type: "source_ip", event_types: [...types], correlation_count: types.size }))
        .sort((a, b) => b.correlation_count - a.correlation_count)
        .slice(0, 15);
      return { correlations };
    }

    return { error: `Unknown tool: ${name}` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Tool execution failed" };
  }
}

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

    const body = await req.json();

    // Simple chat mode (no tools) - just text completion
    if (body.mode === "chat") {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: body.model || "gpt-4o-mini",
          messages: body.messages || [],
          temperature: body.temperature ?? 0.7,
          max_tokens: body.max_tokens || 2000,
        }),
      });
      const data = await response.json();
      return new Response(JSON.stringify({
        message: data.choices?.[0]?.message?.content || "",
        tokens: data.usage?.total_tokens || 0,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Agent mode with tool use - this is the real power
    const messages = body.messages || [];
    const systemPrompt = body.system || "You are an elite SOC analyst AI agent with access to a security platform. Query real data to answer questions. Always explain your reasoning and cite specific data points. Use tools aggressively to gather evidence before answering.";

    const allMessages = [
      { role: "system", content: systemPrompt },
      ...messages,
    ];

    const reasoningSteps: any[] = [];
    let iterations = 0;
    const MAX_ITERATIONS = 6;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: allMessages,
          tools: TOOL_DEFINITIONS,
          tool_choice: "auto",
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        return new Response(JSON.stringify({ error: "OpenAI error", details: errText }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await response.json();
      const msg = data.choices?.[0]?.message;
      if (!msg) break;

      allMessages.push(msg);

      // If no tool calls, we have the final answer
      if (!msg.tool_calls || msg.tool_calls.length === 0) {
        return new Response(JSON.stringify({
          message: msg.content || "",
          reasoning_steps: reasoningSteps,
          iterations,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Execute each tool call
      for (const tc of msg.tool_calls) {
        const toolName = tc.function.name;
        let toolArgs: any = {};
        try { toolArgs = JSON.parse(tc.function.arguments || "{}"); } catch {}

        const toolResult = await executeTool(supabase, toolName, toolArgs);

        reasoningSteps.push({
          step: reasoningSteps.length + 1,
          tool: toolName,
          args: toolArgs,
          result_summary: toolResult.error ? `ERROR: ${toolResult.error}` : `${toolResult.rows?.length || toolResult.count || Object.keys(toolResult).length} results`,
        });

        allMessages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(toolResult).slice(0, 4000),
        });
      }
    }

    // Hit max iterations
    return new Response(JSON.stringify({
      message: "Agent reached maximum iterations. Partial results available in reasoning steps.",
      reasoning_steps: reasoningSteps,
      iterations,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
