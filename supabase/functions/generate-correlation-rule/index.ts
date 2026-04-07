import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function gatherSOCContext(sb: any): Promise<string> {
  const results: Record<string, any> = {};

  const queries = [
    {
      key: "recent_alerts",
      fn: () =>
        sb
          .from("alerts")
          .select("title, severity, mitre_tactic, mitre_technique, source_ip, dest_ip")
          .order("created_at", { ascending: false })
          .limit(15),
    },
    {
      key: "recent_events",
      fn: () =>
        sb
          .from("events")
          .select("event_type, severity, source_ip, dest_ip, username, hostname, mitre_tactic, mitre_technique")
          .order("event_timestamp", { ascending: false })
          .limit(20),
    },
    {
      key: "existing_rules",
      fn: () =>
        sb
          .from("correlation_rules")
          .select("rule_name, severity, status, rule_logic")
          .eq("status", "active")
          .limit(10),
    },
    {
      key: "threat_feeds",
      fn: () =>
        sb
          .from("threat_feeds")
          .select("feed_name, enabled, total_indicators")
          .eq("enabled", true)
          .limit(10),
    },
    {
      key: "data_connectors",
      fn: () =>
        sb
          .from("data_connectors")
          .select("connector_name, connector_type, status")
          .eq("status", "active")
          .limit(15),
    },
  ];

  await Promise.all(
    queries.map(async (q) => {
      try {
        const { data } = await q.fn();
        results[q.key] = data || [];
      } catch {
        results[q.key] = [];
      }
    })
  );

  return JSON.stringify(results, null, 1);
}

const SYSTEM_PROMPT = `You are an expert security correlation rule engineer for a SOC (Security Operations Center) platform. You generate production-quality correlation rules based on user requests.

You have access to real-time SOC context data including active alerts, events, existing rules, threat feeds, and data connectors.

When generating a rule, you MUST return a valid JSON object with EXACTLY this structure:
{
  "rule_name": "Short descriptive rule name",
  "rule_description": "Detailed description of what this rule detects and why it matters",
  "severity": "critical|high|medium|low",
  "confidence_score": 0.85,
  "rule_logic": {
    "conditions": [
      {
        "field": "field_name",
        "operator": "==|!=|>=|<=|>|<|in|not_in|matches|contains",
        "value": "value_or_pattern",
        "window": "optional time window like 5m, 1h"
      }
    ],
    "sequence": ["ordered_event_types_if_applicable"],
    "time_window": "overall detection window",
    "threshold": { "field": "count_field", "operator": ">=", "value": 3 },
    "aggregation": "group_by field if applicable",
    "pseudo_code": "Human-readable pseudo-code of the detection logic using WHEN/AND/OR/THEN syntax"
  },
  "mitre_tactics": ["TA0001 - Initial Access", "T1566 - Phishing"],
  "data_sources": ["EDR Telemetry", "Authentication Logs", "Network Flow"],
  "graph_nodes": [
    { "id": "src1", "label": "Data Source Name", "type": "source", "detail": "Brief detail" },
    { "id": "cond1", "label": "Condition Name", "type": "condition", "detail": "What it checks" },
    { "id": "detect", "label": "Detection Name", "type": "detection", "detail": "Core detection" },
    { "id": "action1", "label": "Action Name", "type": "action", "detail": "Response action" }
  ],
  "graph_edges": [
    { "from": "src1", "to": "cond1", "label": "feeds" },
    { "from": "cond1", "to": "detect", "label": "triggers" },
    { "from": "detect", "to": "action1", "label": "executes" }
  ],
  "enhancement_ideas": [
    { "title": "Enhancement Name", "description": "How this could be enhanced" }
  ]
}

AVAILABLE DATA SOURCES IN THIS SOC ENVIRONMENT (use these when relevant):
- Traditional: EDR Telemetry, Firewall/IDS Logs, Authentication Logs (AD, LDAP, SSO), Network Flow/NetFlow, DNS Query Logs, Proxy Logs, Cloud Audit Trails (AWS CloudTrail, Azure Activity, GCP Audit), Email Gateway Logs, SIEM Correlation Events, Vulnerability Scanners, Threat Intelligence Feeds, DLP Sensors
- Physical & Surveillance: CCTV Video Analytics (facial recognition, behavior analysis, object detection, tailgating detection), Audio Sensors (directional microphones for ambient noise analysis, keyword spotting, ultrasonic communication detection, acoustic emanation capture), Physical Access Control (badge readers, door sensors, mantrap systems, biometric scanners), Environmental Sensors (temperature, humidity, electromagnetic interference, vibration)
- Advanced/Exotic: RF Spectrum Monitoring (detecting rogue wireless, Bluetooth exfiltration, SDR attacks), Power Consumption Analysis (side-channel detection via smart PDU monitoring), Acoustic Emanation Analysis (keyboard acoustic attacks, HDD/CPU coil whine data leakage), Satellite/Drone Imagery (perimeter breach, physical intrusion), IoT Sensor Networks (smart building systems, HVAC anomalies), Biometric Data Streams (gait analysis, voice print matching, behavioral biometrics), Screen Content Analysis (OCR-based DLP on CCTV feeds of monitors), Electromagnetic Side-Channel (TEMPEST-style monitoring)
- Behavioral: User & Entity Behavior Analytics (UEBA), Insider Threat Risk Scoring, Psychological Profiling Baselines, Session Behavioral Fingerprinting, Mouse/Keyboard Dynamics

Rules for generating:
1. ALWAYS generate graph_nodes with at least 6-10 nodes: 2-3 data sources, 2-3 conditions, 1 detection hub, 2-3 actions
2. Graph edges must connect sources → conditions → detection → actions in a logical flow
3. Use REAL MITRE ATT&CK tactic/technique IDs (TA#### and T####)
4. Base severity and confidence on the actual threat described
5. The pseudo_code should be detailed and realistic, not generic
6. Use the SOC context data to reference real data sources and event types from the environment
7. Make conditions specific with real field names, operators, and thresholds
8. Include at least 3-5 conditions that would realistically detect the threat
9. When the threat scenario involves physical or exotic vectors, USE the exotic data sources (CCTV, audio, RF, etc.) in graph_nodes and conditions
10. ALWAYS return ONLY the JSON object, no markdown, no code fences, no extra text`;

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
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const { userRequest, conversationHistory = [] } = await req.json();

    if (!userRequest) {
      return new Response(
        JSON.stringify({ error: "userRequest is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const socContext = await gatherSOCContext(sb);

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "system",
        content: `Current SOC Environment Context:\n${socContext}`,
      },
      ...conversationHistory.slice(-4).map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user", content: userRequest },
    ];

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages,
          temperature: 0.4,
          max_tokens: 3000,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const completion = await openaiResponse.json();
    const raw = completion.choices?.[0]?.message?.content || "{}";

    let rule;
    try {
      rule = JSON.parse(raw);
    } catch {
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { error: dbError } = await sb.from("correlation_rules").insert({
      rule_name: rule.rule_name || "AI-Generated Rule",
      rule_description: rule.rule_description || "",
      rule_logic: rule.rule_logic || {},
      severity: rule.severity || "medium",
      status: "active",
      confidence_score: rule.confidence_score || 0.8,
      generated_by: "ai_agent",
      agent_reasoning: `Generated from user request: "${userRequest.substring(0, 200)}". Model: gpt-4o. MITRE: ${(rule.mitre_tactics || []).join(", ")}`,
      tags: ["ai-generated", rule.severity || "medium", ...(rule.mitre_tactics || []).slice(0, 3)],
    });

    return new Response(
      JSON.stringify({
        rule,
        saved: !dbError,
        save_error: dbError?.message || null,
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
