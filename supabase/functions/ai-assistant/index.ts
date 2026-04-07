import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const QUERY_CATALOG: Record<
  string,
  { description: string; run: (sb: any) => Promise<any> }
> = {
  top_source_ips: {
    description:
      "Top source IPs by event count - useful for attacker IPs, threat origins, most active attackers",
    run: async (sb) => {
      const { data } = await sb.rpc("exec_sql", {
        query: `SELECT source_ip, COUNT(*) as event_count,
                array_agg(DISTINCT severity) as severities,
                array_agg(DISTINCT event_type) as event_types
                FROM events WHERE source_ip IS NOT NULL
                GROUP BY source_ip ORDER BY event_count DESC LIMIT 15`,
      });
      if (data) return data;
      const { data: fallback } = await sb
        .from("events")
        .select("source_ip, severity, event_type")
        .not("source_ip", "is", null)
        .order("event_timestamp", { ascending: false })
        .limit(200);
      if (!fallback) return [];
      const ipMap: Record<string, { count: number; severities: Set<string>; types: Set<string> }> = {};
      for (const e of fallback) {
        if (!e.source_ip) continue;
        if (!ipMap[e.source_ip]) ipMap[e.source_ip] = { count: 0, severities: new Set(), types: new Set() };
        ipMap[e.source_ip].count++;
        if (e.severity) ipMap[e.source_ip].severities.add(e.severity);
        if (e.event_type) ipMap[e.source_ip].types.add(e.event_type);
      }
      return Object.entries(ipMap)
        .map(([ip, v]) => ({
          source_ip: ip,
          event_count: v.count,
          severities: [...v.severities],
          event_types: [...v.types],
        }))
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, 15);
    },
  },

  top_dest_ips: {
    description:
      "Top destination IPs targeted - useful for attacked targets, victim IPs, most targeted systems",
    run: async (sb) => {
      const { data } = await sb
        .from("events")
        .select("dest_ip, severity, event_type")
        .not("dest_ip", "is", null)
        .order("event_timestamp", { ascending: false })
        .limit(200);
      if (!data) return [];
      const ipMap: Record<string, { count: number; severities: Set<string> }> = {};
      for (const e of data) {
        if (!e.dest_ip) continue;
        if (!ipMap[e.dest_ip]) ipMap[e.dest_ip] = { count: 0, severities: new Set() };
        ipMap[e.dest_ip].count++;
        if (e.severity) ipMap[e.dest_ip].severities.add(e.severity);
      }
      return Object.entries(ipMap)
        .map(([ip, v]) => ({ dest_ip: ip, event_count: v.count, severities: [...v.severities] }))
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, 15);
    },
  },

  critical_alerts: {
    description:
      "Recent critical and high severity alerts with details - useful for active threats, urgent issues",
    run: async (sb) => {
      const { data } = await sb
        .from("alerts")
        .select(
          "id, title, severity, status, source_ip, dest_ip, hostname, mitre_tactic, mitre_technique, confidence_score, created_at"
        )
        .in("severity", ["critical", "high"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  },

  alerts_summary: {
    description:
      "Alert counts grouped by severity and status - useful for security posture overview, alert statistics",
    run: async (sb) => {
      const { data: all } = await sb
        .from("alerts")
        .select("severity, status")
        .limit(500);
      if (!all) return {};
      const bySeverity: Record<string, number> = {};
      const byStatus: Record<string, number> = {};
      for (const a of all) {
        bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
        byStatus[a.status] = (byStatus[a.status] || 0) + 1;
      }
      return { total: all.length, by_severity: bySeverity, by_status: byStatus };
    },
  },

  recent_events: {
    description:
      "Most recent security events with full details - useful for latest activity, what just happened",
    run: async (sb) => {
      const { data } = await sb
        .from("events")
        .select(
          "event_type, severity, source_ip, dest_ip, username, hostname, description, mitre_tactic, mitre_technique, event_timestamp"
        )
        .order("event_timestamp", { ascending: false })
        .limit(25);
      return data || [];
    },
  },

  events_by_type: {
    description:
      "Event counts grouped by type and severity - useful for event distribution, attack patterns",
    run: async (sb) => {
      const { data } = await sb
        .from("events")
        .select("event_type, severity")
        .limit(500);
      if (!data) return {};
      const byType: Record<string, { count: number; severities: Record<string, number> }> = {};
      for (const e of data) {
        if (!byType[e.event_type]) byType[e.event_type] = { count: 0, severities: {} };
        byType[e.event_type].count++;
        if (e.severity) byType[e.event_type].severities[e.severity] = (byType[e.event_type].severities[e.severity] || 0) + 1;
      }
      return { total: data.length, by_type: byType };
    },
  },

  open_cases: {
    description:
      "Active investigation cases - useful for ongoing investigations, case workload",
    run: async (sb) => {
      const { data } = await sb
        .from("cases")
        .select("id, title, status, priority, severity, category, created_at")
        .in("status", ["open", "in_progress", "investigating"])
        .order("created_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  },

  all_cases: {
    description:
      "All cases including closed - useful for case history, trends, total case counts",
    run: async (sb) => {
      const { data } = await sb
        .from("cases")
        .select("id, title, status, priority, severity, category, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      return data || [];
    },
  },

  vulnerabilities: {
    description:
      "Current vulnerabilities with CVSS scores - useful for vulnerability assessment, patching priorities",
    run: async (sb) => {
      const { data } = await sb
        .from("vulnerabilities")
        .select("id, title, severity, status, cvss_score, discovered_at")
        .order("cvss_score", { ascending: false })
        .limit(25);
      return data || [];
    },
  },

  ml_models: {
    description:
      "ML model health and poisoning risk - useful for AI/ML security, model integrity",
    run: async (sb) => {
      const { data } = await sb
        .from("ml_model_registry")
        .select(
          "model_name, model_type, status, poisoning_risk, integrity_score, accuracy_current, drift_score"
        );
      return data || [];
    },
  },

  poisoning_detections: {
    description:
      "Model poisoning detection events - useful for AI threats, model tampering",
    run: async (sb) => {
      const { data } = await sb
        .from("poisoning_detections")
        .select("detection_type, severity, confidence, status, description, detected_at")
        .order("detected_at", { ascending: false })
        .limit(15);
      return data || [];
    },
  },

  threat_feeds: {
    description:
      "Threat intelligence feed status - useful for threat intel sources, IOC feeds",
    run: async (sb) => {
      const { data } = await sb
        .from("threat_feeds")
        .select("feed_name, enabled, total_indicators, last_sync_at")
        .limit(20);
      return data || [];
    },
  },

  user_behavior: {
    description:
      "User behavior events and anomalies - useful for insider threats, unusual activity, user risk, UEBA",
    run: async (sb) => {
      const { data: events } = await sb
        .from("user_behavior_events")
        .select("user_profile_id, event_type, event_category, action, resource_accessed, outcome, anomaly_score, details, timestamp")
        .order("timestamp", { ascending: false })
        .limit(40);

      const { data: profiles } = await sb
        .from("user_profiles")
        .select("id, full_name, department, risk_score, status")
        .order("risk_score", { ascending: false })
        .limit(20);

      const { data: assessments } = await sb
        .from("user_risk_assessments")
        .select("user_profile_id, risk_score, risk_level, risk_factors, assessment_time")
        .order("assessment_time", { ascending: false })
        .limit(20);

      const { data: correlations } = await sb
        .from("behavior_correlations")
        .select("user_profile_id, correlation_type, correlation_score, description, severity, detected_at")
        .order("detected_at", { ascending: false })
        .limit(20);

      const profileMap = Object.fromEntries((profiles || []).map((p: Record<string, unknown>) => [p.id, p]));
      const enrichedEvents = (events || []).map((e: Record<string, unknown>) => ({
        ...e,
        user: profileMap[e.user_profile_id as string] || null,
      }));

      return { events: enrichedEvents, profiles: profiles || [], risk_assessments: assessments || [], correlations: correlations || [] };
    },
  },

  malware_samples: {
    description:
      "Malware sandbox analysis results - useful for malware threats, file analysis",
    run: async (sb) => {
      const { data } = await sb
        .from("malware_samples")
        .select("sample_name, severity, sandbox_status, malware_family, threat_category, capture_timestamp")
        .order("capture_timestamp", { ascending: false })
        .limit(20);
      return data || [];
    },
  },

  red_team: {
    description:
      "Red team campaign results - useful for pentest findings, attack simulations",
    run: async (sb) => {
      const { data } = await sb
        .from("red_team_campaigns")
        .select("campaign_name, status, attack_type, success_rate, started_at")
        .order("started_at", { ascending: false })
        .limit(10);
      return data || [];
    },
  },

  compliance: {
    description:
      "Compliance framework scores - useful for audit readiness, regulatory status",
    run: async (sb) => {
      const { data } = await sb
        .from("compliance_frameworks")
        .select("name, compliance_score, total_controls, passing_controls")
        .limit(10);
      return data || [];
    },
  },

  assets: {
    description:
      "Asset registry - useful for network inventory, infrastructure, host details",
    run: async (sb) => {
      const { data } = await sb
        .from("asset_registry")
        .select("hostname, asset_type, criticality, status, os_type")
        .limit(30);
      return data || [];
    },
  },

  connectors: {
    description:
      "Data connector status - useful for integrations, data sources, ingestion health",
    run: async (sb) => {
      const { data } = await sb
        .from("data_connectors")
        .select("connector_name, connector_type, status, events_ingested")
        .limit(20);
      return data || [];
    },
  },

  iocs: {
    description:
      "Indicators of compromise - useful for IOCs, threat indicators, known bad IPs/domains/hashes",
    run: async (sb) => {
      const { data } = await sb
        .from("iocs")
        .select("indicator_type, indicator, severity, description, first_seen, last_seen")
        .order("last_seen", { ascending: false })
        .limit(25);
      return data || [];
    },
  },

  threat_campaigns: {
    description:
      "Active threat campaigns - useful for APT groups, ongoing attacks, campaign tracking",
    run: async (sb) => {
      const { data } = await sb
        .from("threat_campaigns")
        .select("campaign_name, threat_actor, status, severity, first_seen, last_activity")
        .order("last_activity", { ascending: false })
        .limit(15);
      return data || [];
    },
  },

  response_actions: {
    description:
      "Automated response actions taken - useful for incident response, automation status",
    run: async (sb) => {
      const { data } = await sb
        .from("response_actions")
        .select("action_type, status, target, result, executed_at")
        .order("executed_at", { ascending: false })
        .limit(20);
      return data || [];
    },
  },

  mitre_coverage: {
    description:
      "MITRE ATT&CK tactic and technique coverage from events - useful for attack framework mapping, gaps",
    run: async (sb) => {
      const { data } = await sb
        .from("events")
        .select("mitre_tactic, mitre_technique, severity")
        .not("mitre_tactic", "is", null)
        .limit(300);
      if (!data) return {};
      const tactics: Record<string, { count: number; techniques: Set<string> }> = {};
      for (const e of data) {
        if (!e.mitre_tactic) continue;
        if (!tactics[e.mitre_tactic]) tactics[e.mitre_tactic] = { count: 0, techniques: new Set() };
        tactics[e.mitre_tactic].count++;
        if (e.mitre_technique) tactics[e.mitre_tactic].techniques.add(e.mitre_technique);
      }
      return Object.entries(tactics).map(([tactic, v]) => ({
        tactic,
        event_count: v.count,
        techniques: [...v.techniques],
      }));
    },
  },

  llm_risk: {
    description:
      "LLM usage risk profiles and incidents - useful for AI risk, LLM security, prompt injection",
    run: async (sb) => {
      const [profiles, incidents] = await Promise.all([
        sb.from("llm_risk_profiles").select("model_name, risk_level, risk_score, total_requests").limit(10),
        sb.from("llm_risk_incidents").select("incident_type, severity, model_name, description, detected_at").order("detected_at", { ascending: false }).limit(10),
      ]);
      return { profiles: profiles.data || [], incidents: incidents.data || [] };
    },
  },

  network_flows: {
    description:
      "DPI/network flow data - useful for network traffic, protocol analysis, bandwidth",
    run: async (sb) => {
      const { data } = await sb
        .from("dpi_flows")
        .select("source_ip, dest_ip, protocol, app_protocol, bytes_total, risk_score, detected_at")
        .order("detected_at", { ascending: false })
        .limit(25);
      return data || [];
    },
  },

  top_attacked_hosts: {
    description:
      "Most targeted hostnames in events - useful for which servers are attacked most",
    run: async (sb) => {
      const { data } = await sb
        .from("events")
        .select("hostname, severity, event_type")
        .not("hostname", "is", null)
        .order("event_timestamp", { ascending: false })
        .limit(300);
      if (!data) return [];
      const hostMap: Record<string, { count: number; severities: Set<string> }> = {};
      for (const e of data) {
        if (!e.hostname) continue;
        if (!hostMap[e.hostname]) hostMap[e.hostname] = { count: 0, severities: new Set() };
        hostMap[e.hostname].count++;
        if (e.severity) hostMap[e.hostname].severities.add(e.severity);
      }
      return Object.entries(hostMap)
        .map(([h, v]) => ({ hostname: h, event_count: v.count, severities: [...v.severities] }))
        .sort((a, b) => b.event_count - a.event_count)
        .slice(0, 15);
    },
  },

  escalation_rules: {
    description:
      "Threat escalation rules and formulas - useful for escalation policies, automation rules",
    run: async (sb) => {
      const { data } = await sb
        .from("escalation_rules")
        .select("rule_name, description, priority_threshold, actions, enabled, trigger_count, last_triggered_at")
        .limit(15);
      return data || [];
    },
  },

  correlation_rules: {
    description:
      "Correlation rules and recent matches - useful for detection logic, correlation engine, rule health",
    run: async (sb) => {
      const [rules, matches] = await Promise.all([
        sb.from("correlation_rules").select("rule_name, severity, status, rule_type, match_count").limit(15),
        sb.from("correlation_rule_matches").select("rule_id, matched_events, severity, match_timestamp").order("match_timestamp", { ascending: false }).limit(10),
      ]);
      return { rules: rules.data || [], recent_matches: matches.data || [] };
    },
  },
};

const CATALOG_DESCRIPTIONS = Object.entries(QUERY_CATALOG)
  .map(([key, val]) => `- ${key}: ${val.description}`)
  .join("\n");

async function selectQueries(
  openaiKey: string,
  question: string
): Promise<string[]> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a query planner for a SOC (Security Operations Center) AI assistant. Given a user question, select which data queries are needed to fully answer it. Return ONLY a JSON array of query keys. Select 2-6 queries that are most relevant. Always include at least the most directly relevant query.

Available queries:
${CATALOG_DESCRIPTIONS}

Rules:
- Return ONLY a valid JSON array of strings, no other text
- Pick queries that directly answer the question
- Also pick supporting context queries when useful
- For broad questions like "security posture", pick alerts_summary, vulnerabilities, open_cases, compliance
- For IP-related questions, always include top_source_ips and/or top_dest_ips
- For attack questions, include critical_alerts and mitre_coverage
- Always try to include at least one query that provides concrete data points`,
        },
        { role: "user", content: question },
      ],
      temperature: 0,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    return ["alerts_summary", "critical_alerts", "recent_events"];
  }

  const completion = await response.json();
  const raw = completion.choices?.[0]?.message?.content || "[]";

  try {
    const match = raw.match(/\[[\s\S]*?\]/);
    if (!match) return ["alerts_summary", "critical_alerts", "recent_events"];
    const parsed = JSON.parse(match[0]);
    const valid = parsed.filter(
      (k: string) => typeof k === "string" && QUERY_CATALOG[k]
    );
    return valid.length > 0
      ? valid.slice(0, 6)
      : ["alerts_summary", "critical_alerts", "recent_events"];
  } catch {
    return ["alerts_summary", "critical_alerts", "recent_events"];
  }
}

async function executeQueries(
  supabase: any,
  queryKeys: string[]
): Promise<Record<string, any>> {
  const results: Record<string, any> = {};
  const promises = queryKeys.map(async (key) => {
    try {
      results[key] = await QUERY_CATALOG[key].run(supabase);
    } catch (err) {
      results[key] = { error: `Query failed: ${err}` };
    }
  });
  await Promise.all(promises);
  return results;
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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { question, conversationHistory = [] } = await req.json();

    if (!question) {
      return new Response(
        JSON.stringify({ error: "Question is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const queryKeys = await selectQueries(openaiKey, question);

    const securityData = await executeQueries(supabase, queryKeys);

    const systemPrompt = `You are the AI Security Advisor (codenamed "Genie") for a Security Operations Center (SOC) Intelligence Platform built on Databricks. You have access to REAL-TIME security data from the organization's SIEM system.

Your role:
- Analyze security data and provide actionable insights
- Help CISOs and security analysts understand their security posture
- Identify threats, risks, and anomalies in the data
- Provide strategic recommendations based on actual metrics
- Reference specific numbers, IPs, hostnames, and data points from the context
- Be concise but thorough - use bullet points and structured formatting
- When presenting lists (top IPs, top vulnerabilities, etc.), use numbered lists with details

AVAILABLE DATA SOURCES IN THIS SOC (beyond traditional SIEM):
- Physical & Surveillance: CCTV Video Analytics (facial recognition, behavior analysis, object detection, tailgating detection), Audio Sensors (directional microphones for ambient noise analysis, keyword spotting, ultrasonic communication detection, acoustic emanation capture from sensitive areas), Physical Access Control (badge readers, door sensors, mantrap systems, biometric scanners), Environmental Sensors (temperature, humidity, EM interference, vibration)
- Advanced/Exotic: RF Spectrum Monitoring (rogue wireless detection, Bluetooth exfiltration, SDR attacks), Power Consumption Analysis (side-channel via smart PDU), Acoustic Emanation Analysis (keyboard acoustic attacks, HDD/CPU coil whine data leakage), Satellite/Drone Perimeter Imagery, IoT Sensor Networks (smart building, HVAC anomalies), Biometric Data Streams (gait analysis, voice print matching, behavioral biometrics), Screen Content Analysis (OCR-based DLP on CCTV of monitors), Electromagnetic Side-Channel (TEMPEST monitoring)
- Behavioral: UEBA, Insider Threat Risk Scoring, Psychological Profiling Baselines, Session Behavioral Fingerprinting, Mouse/Keyboard Dynamics
When users ask about data sources, detection capabilities, or what the platform can monitor, reference ALL of these including the exotic ones. The platform has full convergence of cyber and physical security.

IMPORTANT: Always base your answers on the actual data provided. If the data doesn't fully cover a topic, state what you found and note any gaps. Never fabricate data points.

Data queries executed for this question: ${queryKeys.join(", ")}

LIVE Security Data:
${JSON.stringify(securityData, null, 2)}`;

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-6).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: question },
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
          temperature: 0.7,
          max_tokens: 2000,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errBody }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const completion = await openaiResponse.json();
    const answer =
      completion.choices?.[0]?.message?.content ||
      "I was unable to generate a response. Please try again.";

    return new Response(
      JSON.stringify({
        answer,
        queries_used: queryKeys,
        tokens_used: completion.usage?.total_tokens || 0,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
