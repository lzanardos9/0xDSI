import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const FAMILY_KEYWORDS: Record<string, string[]> = {
  ransomware: ["ransomware", "ransom", "encrypt", "leak site", "double extortion", "lockbit", "clop", "blackcat", "alphv", "akira", "rhysida"],
  zero_day: ["zero-day", "zero day", "0day", "0-day", "unpatched", "wild exploitation"],
  supply_chain: ["supply chain", "sbom", "typosquat", "npm", "pypi", "rubygems", "dependency", "xz", "solarwinds"],
  phishing: ["phishing", "smishing", "vishing", "business email", "bec", "spear-phishing", "credential harvest"],
  cloud: ["aws", "azure", "gcp", "s3 bucket", "iam", "kubernetes", "k8s", "cloud", "ecr"],
  ai_ml: ["llm", "chatgpt", "prompt injection", "jailbreak", "model poisoning", "embedding", "rag", "vector db"],
  apt: ["apt", "nation-state", "state-sponsored", "volt typhoon", "midnight blizzard", "lazarus", "fancy bear", "salt typhoon"],
  malware: ["trojan", "stealer", "rootkit", "loader", "dropper", "rat", "botnet", "backdoor"],
  network: ["vpn", "firewall", "ivanti", "cisco asa", "fortinet", "citrix", "palo alto", "edge device"],
  identity: ["mfa", "passkey", "okta", "entra", "active directory", "kerberos", "sso", "oauth"],
  crypto_fraud: ["mixer", "tornado cash", "wallet drainer", "pig butchering", "defi", "bridge exploit"],
  insider: ["insider", "disgruntled", "exfiltration", "rogue employee"],
};

const MITRE_KEYWORDS: Record<string, string[]> = {
  "T1566": ["phishing", "email attachment", "spear-phishing"],
  "T1190": ["exploit public-facing", "web application", "unpatched web"],
  "T1133": ["external remote services", "vpn", "rdp exposed"],
  "T1078": ["valid accounts", "credential stuffing", "compromised credentials"],
  "T1059": ["powershell", "cmd.exe", "bash", "command execution", "script execution"],
  "T1486": ["ransomware", "encrypt files", "data encrypted for impact"],
  "T1041": ["exfiltration", "c2 channel", "data exfil"],
  "T1195": ["supply chain", "software supply chain"],
  "T1068": ["privilege escalation", "kernel exploit", "local privilege"],
  "T1021": ["lateral movement", "smb", "rdp lateral"],
  "T1204": ["user execution", "malicious document"],
  "T1556": ["mfa bypass", "modify authentication", "token theft"],
};

function classify(title: string, content: string) {
  const text = `${title} ${content}`.toLowerCase();
  const family = Object.entries(FAMILY_KEYWORDS)
    .map(([fam, kw]) => ({ fam, score: kw.filter(k => text.includes(k)).length }))
    .sort((a, b) => b.score - a.score)[0];
  const matchedFamily = family && family.score > 0 ? family.fam : "unclassified";

  const cves = Array.from(new Set((text.match(/cve-\d{4}-\d{4,7}/gi) || []).map(c => c.toUpperCase())));

  const mitre = Object.entries(MITRE_KEYWORDS)
    .filter(([, kw]) => kw.some(k => text.includes(k)))
    .map(([t]) => t);

  const vendors = ["microsoft", "cisco", "fortinet", "ivanti", "citrix", "vmware", "palo alto", "oracle", "sap", "apple", "google", "amazon", "okta", "cloudflare", "atlassian"].filter(v => text.includes(v));
  const products = ["exchange", "sharepoint", "windows", "active directory", "entra id", "azure ad", "office 365", "ios", "android", "chrome", "edge", "firefox", "jira", "confluence", "outlook"].filter(p => text.includes(p));

  const regions: string[] = [];
  if (/\b(brazil|brasil|br)\b/.test(text)) regions.push("BR");
  if (/\b(united states|u\.s\.|usa|america)\b/.test(text)) regions.push("US");
  if (/\b(europe|eu|european)\b/.test(text)) regions.push("EU");
  if (/\b(uk|britain|british)\b/.test(text)) regions.push("UK");
  if (/\b(china|chinese)\b/.test(text)) regions.push("CN");
  if (/\b(russia|russian)\b/.test(text)) regions.push("RU");

  let severity = "medium";
  if (cves.length >= 3 || /critical|actively exploited|in the wild|zero-day|rce remote/.test(text)) severity = "critical";
  else if (cves.length >= 1 || /high-severity|high severity|important/.test(text)) severity = "high";
  else if (/low-severity|low severity|informational/.test(text)) severity = "low";

  const confidence = Math.min(0.95, 0.5 + (family?.score || 0) * 0.08 + Math.min(0.2, cves.length * 0.1) + Math.min(0.15, mitre.length * 0.05));

  return { family: matchedFamily, severity, confidence, cves, mitre, vendors, products, regions };
}

function buildPov(title: string, c: ReturnType<typeof classify>, summary: string) {
  const famLabel = c.family.replace(/_/g, " ");
  const vendorList = c.vendors.length ? c.vendors.map(v => v[0].toUpperCase() + v.slice(1)).join(", ") : "broad vendor exposure";
  const cveList = c.cves.length ? c.cves.slice(0, 4).join(", ") : "no specific CVE";

  const pov = `${title} represents a ${c.severity}-severity ${famLabel} development affecting ${vendorList}. ${summary.slice(0, 220)}. The reporting strongly maps to this threat class based on the language patterns, indicators (${cveList}), and targeted-product signals extracted from the article.`;

  const why = `Our environment has measurable exposure to this threat class because we operate comparable ${c.products.length ? c.products.slice(0, 3).join("/") : "enterprise workloads"} and our identity and network surface overlaps with the victim profile described. If the TTPs described here replay against us, the likely entry vectors are ${c.mitre.length ? c.mitre.slice(0, 3).join(", ") : "exposed services, phishing, and valid accounts"}, and our blast radius would expand through lateral movement and credential reuse before detection.`;

  const chain = `Kill-chain hypothesis: initial access (${c.mitre[0] || "T1190/T1566"}) -> execution (${c.mitre[1] || "T1059"}) -> persistence -> privilege escalation -> lateral movement (${c.mitre.includes("T1021") ? "T1021" : "T1021"}) -> exfiltration or impact (${c.family === "ransomware" ? "T1486" : "T1041"}). Detection opportunity is highest at the first pivot from initial access to execution, where commandline anomalies and parent-child process rarity diverge from the user's baseline.`;

  return { pov, why, chain };
}

function buildProposal(item: any, c: ReturnType<typeof classify>) {
  const famLabel = c.family.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
  const name = `${famLabel} - ${item.title.slice(0, 60)}`;
  const severity = c.severity;
  const engineType = c.family === "ransomware" || c.family === "supply_chain" || c.family === "crypto_fraud" ? "graph" : c.family === "insider" || c.family === "identity" ? "user" : "hybrid";

  const nodes = [
    { id: "actor", label: "External Actor", type: "external", risk: 0.9 },
    { id: "entry", label: c.mitre[0] === "T1566" ? "Phishing Email" : "Exposed Service", type: "vector", risk: 0.7 },
    { id: "endpoint", label: "User Endpoint", type: "asset", risk: 0.5 },
    { id: "identity", label: "User Account", type: "identity", risk: 0.6 },
    { id: "data", label: c.family === "ransomware" ? "File Share" : "Crown Jewel Data", type: "data", risk: 0.85 },
  ];
  const edges = [
    { from: "actor", to: "entry", label: c.mitre[0] || "T1190/T1566", weight: 0.9 },
    { from: "entry", to: "endpoint", label: c.mitre[1] || "T1204", weight: 0.8 },
    { from: "endpoint", to: "identity", label: "T1078", weight: 0.7 },
    { from: "identity", to: "data", label: c.family === "ransomware" ? "T1486" : "T1041", weight: 0.9 },
  ];

  const detectionRule = [
    `rule: ${name}`,
    `severity: ${severity}`,
    `window: 30m`,
    `conditions:`,
    `  - event_class in (auth_event, process_chain, network_flow)`,
    c.cves.length ? `  - vulnerability.cve any_of [${c.cves.slice(0, 5).map(x => `"${x}"`).join(", ")}]` : `  - process.commandline matches suspicious_patterns`,
    c.vendors.length ? `  - asset.vendor any_of [${c.vendors.slice(0, 3).map(v => `"${v}"`).join(", ")}]` : `  - asset.criticality >= 0.7`,
    `  - sequence: ${edges.map(e => `${e.from}->${e.to}`).join(" -> ")}`,
    `action: open case, enrich with threat intel, notify duty SOC`,
  ].join("\n");

  const huntQuery = c.cves.length
    ? `SELECT e.* FROM events e\nLEFT JOIN asset_vulnerabilities v ON v.asset_id = e.source_asset\nWHERE v.cve_id IN (${c.cves.slice(0, 5).map(x => `'${x}'`).join(",")})\n  AND e.event_time > now() - INTERVAL '7 days'\nORDER BY e.event_time DESC;`
    : `SELECT e.* FROM events e\nWHERE lower(e.raw_event) ~ '(${(c.family.split("_").concat(c.vendors).concat(c.products).filter(Boolean).slice(0, 6)).join("|") || "suspicious"})'\n  AND e.event_time > now() - INTERVAL '7 days'\nORDER BY e.event_time DESC;`;

  const mitreTechniques = c.mitre.length ? c.mitre : ["T1190", "T1059", "T1078"];

  const rationale = `Auto-generated from threat radar. The external article describes ${c.family.replace(/_/g, " ")} activity with ${c.cves.length} referenced CVE(s) and ${mitreTechniques.length} mapped ATT&CK technique(s). This rule focuses on the first detectable pivot (initial access into execution) with entity-criticality weighting to suppress noise on low-value assets.`;

  return {
    proposal_name: name,
    proposal_type: "correlation_rule",
    severity,
    engine_type: engineType,
    description: `Preemptive correlation rule derived from emerging ${c.family.replace(/_/g, " ")} reporting.`,
    rationale,
    graph_pattern: { nodes, edges, temporal_window_min: 30, scoring: { graph_rarity: 0.2, threat_intel_hits: 0.25, entity_criticality: 0.2, behavioral_anomaly: 0.2, base_confidence: 0.15 } },
    detection_rule: detectionRule,
    hunt_query: huntQuery,
    mitre_techniques: mitreTechniques,
    confidence: c.confidence,
    expected_fp_rate: Math.max(0.03, 0.15 - c.cves.length * 0.02),
    status: "draft",
  };
}

async function tryLLM(title: string, content: string): Promise<null | { pov: string; why: string; chain: string }> {
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) return null;

  const systemPrompt = `You are the SOC's senior threat intelligence analyst. Return ONLY a valid JSON object with keys pov, why, chain. Each value is a 2-3 sentence paragraph. pov = plain-English summary of what this threat is. why = why our enterprise should care specifically (reference likely assets, identity, or data impact). chain = hypothesized attacker kill chain with MITRE ATT&CK technique IDs and the best detection opportunity.`;
  const userPrompt = `ARTICLE TITLE: ${title}\n\nARTICLE CONTENT:\n${content.slice(0, 3000)}`;

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) return null;
    const j = await r.json();
    const text = j.choices?.[0]?.message?.content || "";
    const parsed = JSON.parse(text);
    const coerce = (v: any): string => {
      if (v == null) return "";
      if (typeof v === "string") return v;
      if (Array.isArray(v)) return v.map(coerce).filter(Boolean).join(" ");
      if (typeof v === "object") {
        return Object.entries(v).map(([k, val]) => `${k}: ${coerce(val)}`).join("; ");
      }
      return String(v);
    };
    const pov = coerce(parsed.pov);
    const why = coerce(parsed.why);
    const chain = coerce(parsed.chain);
    if (pov && why && chain) return { pov, why, chain };
  } catch { /* fall back to deterministic */ }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(50, body.limit || 20);
    const itemId: string | undefined = body.item_id;

    const started = Date.now();
    const { data: runRow } = await supabase.from("threat_radar_runs").insert({ run_type: "analyze", status: "running", started_at: new Date().toISOString() }).select("id").maybeSingle();
    const runId = runRow?.id;

    let q = supabase.from("threat_radar_items").select("*").limit(limit);
    if (itemId) q = q.eq("id", itemId);
    else q = q.eq("analysis_status", "pending").order("published_at", { ascending: false });

    const { data: items } = await q;

    let analyzed = 0;
    let proposalsCreated = 0;

    for (const item of items || []) {
      const fullText = `${item.title} ${item.summary || ""} ${item.content || ""}`;
      const classified = classify(item.title, fullText);
      let povData = buildPov(item.title, classified, item.summary || item.content || item.title);
      const llmResult = await tryLLM(item.title, item.content || item.summary || "");
      if (llmResult) povData = llmResult;

      await supabase.from("threat_radar_items").update({
        family: classified.family,
        severity: classified.severity,
        confidence: classified.confidence,
        cves: classified.cves,
        vendors: classified.vendors,
        products: classified.products,
        mitre_techniques: classified.mitre,
        regions: classified.regions,
        tags: Array.from(new Set([classified.family, ...classified.vendors.slice(0, 2), ...classified.products.slice(0, 2)])),
        point_of_view: povData.pov,
        why_care: povData.why,
        attack_chain: povData.chain,
        analysis_status: "analyzed",
        analyzed_at: new Date().toISOString(),
      }).eq("id", item.id);

      const proposal = buildProposal(item, classified);
      const { error: pErr } = await supabase.from("threat_radar_proposals").insert({ item_id: item.id, ...proposal });
      if (!pErr) proposalsCreated++;
      analyzed++;
    }

    if (runId) {
      await supabase.from("threat_radar_runs").update({
        finished_at: new Date().toISOString(),
        status: "ok",
        items_analyzed: analyzed,
        proposals_created: proposalsCreated,
        summary: `Analyzed ${analyzed} items, created ${proposalsCreated} proposals in ${Date.now() - started}ms`,
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({ ok: true, analyzed, proposals_created: proposalsCreated, duration_ms: Date.now() - started }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
