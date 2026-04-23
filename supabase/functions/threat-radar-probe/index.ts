import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function tableExists(supabase: any, name: string): Promise<boolean> {
  const { error } = await supabase.from(name).select("*", { count: "exact", head: true }).limit(1);
  return !error;
}

async function probeItem(supabase: any, item: any): Promise<{ hits: any[]; exposure: string }> {
  const hits: any[] = [];
  const cves: string[] = item.cves || [];
  const vendors: string[] = (item.vendors || []).map((v: string) => v.toLowerCase());
  const products: string[] = (item.products || []).map((p: string) => p.toLowerCase());
  const keywords: string[] = Array.from(new Set([...(item.tags || []), item.family, ...vendors, ...products].filter(Boolean).map((s: string) => s.toLowerCase())));

  // 1) CVE matches in asset_vulnerabilities
  if (cves.length && await tableExists(supabase, "asset_vulnerabilities")) {
    const { data } = await supabase.from("asset_vulnerabilities").select("*").in("cve_id", cves).limit(25);
    for (const v of data || []) {
      hits.push({
        item_id: item.id,
        hit_type: "cve_match",
        hit_severity: v.severity || item.severity || "high",
        entity_type: "asset",
        entity_id: v.asset_id || null,
        entity_name: v.asset_name || v.host_name || v.cve_id,
        matched_field: "cve_id",
        matched_value: v.cve_id,
        evidence_summary: `Known exploited CVE ${v.cve_id} present on asset ${v.asset_name || v.asset_id}`,
        evidence_detail: { cvss: v.cvss_score, status: v.status, patched: v.is_patched, detected_at: v.detected_at },
      });
    }
  }

  // 2) IOC matches in threat_feeds table (if any IOC string in article)
  const content = `${item.title} ${item.summary || ""} ${item.content || ""}`;
  const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
  const domainRegex = /\b[a-z0-9][a-z0-9-]{1,62}\.(?:com|net|org|io|co|ru|cn|top|xyz|info)\b/gi;
  const shaRegex = /\b[a-f0-9]{64}\b/gi;
  const foundIocs = [
    ...Array.from(content.matchAll(ipRegex)).map(m => ({ type: "ip", value: m[0] })),
    ...Array.from(content.matchAll(domainRegex)).map(m => ({ type: "domain", value: m[0] })),
    ...Array.from(content.matchAll(shaRegex)).map(m => ({ type: "sha256", value: m[0] })),
  ].slice(0, 20);

  if (foundIocs.length && await tableExists(supabase, "events")) {
    for (const ioc of foundIocs.slice(0, 5)) {
      const { data } = await supabase.from("events").select("id, event_time, event_type, source_ip, dest_ip, raw_event").ilike("raw_event", `%${ioc.value}%`).limit(5);
      for (const e of data || []) {
        hits.push({
          item_id: item.id,
          hit_type: "ioc_match",
          hit_severity: item.severity || "high",
          entity_type: "event",
          entity_id: e.id,
          entity_name: e.event_type || "event",
          matched_field: ioc.type,
          matched_value: ioc.value,
          evidence_summary: `Event raw data contains IOC ${ioc.value} (${ioc.type})`,
          evidence_detail: { event_time: e.event_time, source_ip: e.source_ip, dest_ip: e.dest_ip },
        });
      }
    }
  }

  // 3) Vendor/product exposure in assets
  if ((vendors.length || products.length) && await tableExists(supabase, "assets")) {
    const terms = Array.from(new Set([...vendors, ...products])).filter(t => t.length > 3).slice(0, 5);
    for (const term of terms) {
      const { data } = await supabase.from("assets").select("id, asset_name, asset_type, criticality, metadata").or(`asset_name.ilike.%${term}%,asset_type.ilike.%${term}%`).limit(5);
      for (const a of data || []) {
        hits.push({
          item_id: item.id,
          hit_type: "asset_exposure",
          hit_severity: a.criticality && a.criticality > 0.7 ? "high" : "medium",
          entity_type: "asset",
          entity_id: a.id,
          entity_name: a.asset_name,
          matched_field: "asset_signature",
          matched_value: term,
          evidence_summary: `Asset ${a.asset_name} (${a.asset_type}) matches vendor/product signature ${term}`,
          evidence_detail: { criticality: a.criticality, metadata: a.metadata },
        });
      }
    }
  }

  // 4) Alert correlation by keyword
  if (keywords.length && await tableExists(supabase, "alerts")) {
    const term = keywords[0];
    if (term && term.length > 3) {
      const { data } = await supabase.from("alerts").select("id, alert_name, severity, created_at").ilike("alert_name", `%${term}%`).limit(5);
      for (const a of data || []) {
        hits.push({
          item_id: item.id,
          hit_type: "alert_overlap",
          hit_severity: a.severity || "medium",
          entity_type: "alert",
          entity_id: a.id,
          entity_name: a.alert_name,
          matched_field: "keyword",
          matched_value: term,
          evidence_summary: `Existing alert "${a.alert_name}" overlaps with threat family ${term}`,
          evidence_detail: { created_at: a.created_at },
        });
      }
    }
  }

  // 5) User behavior anomalies (if family suggests insider/identity)
  if ((item.family === "identity" || item.family === "insider" || item.family === "phishing") && await tableExists(supabase, "user_behavior_anomalies")) {
    const { data } = await supabase.from("user_behavior_anomalies").select("id, user_id, anomaly_type, severity, detected_at").gte("detected_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()).limit(5);
    for (const u of data || []) {
      hits.push({
        item_id: item.id,
        hit_type: "behavior_overlap",
        hit_severity: u.severity || "medium",
        entity_type: "user",
        entity_id: u.user_id,
        entity_name: u.anomaly_type,
        matched_field: "anomaly_type",
        matched_value: u.anomaly_type,
        evidence_summary: `Recent user anomaly (${u.anomaly_type}) aligns with this threat family`,
        evidence_detail: { detected_at: u.detected_at },
      });
    }
  }

  let exposure = "clean";
  const criticalHits = hits.filter(h => h.hit_severity === "critical").length;
  const highHits = hits.filter(h => h.hit_severity === "high").length;
  if (criticalHits > 0 || hits.length >= 5) exposure = "active";
  else if (highHits > 0 || hits.length >= 2) exposure = "at_risk";
  else if (hits.length > 0) exposure = "indicators";

  return { hits, exposure };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const limit = Math.min(50, body.limit || 10);
    const itemId: string | undefined = body.item_id;

    const started = Date.now();
    const { data: runRow } = await supabase.from("threat_radar_runs").insert({ run_type: "probe", status: "running", started_at: new Date().toISOString() }).select("id").maybeSingle();
    const runId = runRow?.id;

    let q = supabase.from("threat_radar_items").select("*");
    if (itemId) q = q.eq("id", itemId);
    else q = q.eq("analysis_status", "analyzed").eq("exposure_status", "unknown").order("published_at", { ascending: false }).limit(limit);

    const { data: items } = await q;

    let probed = 0;
    let totalHits = 0;

    for (const item of items || []) {
      if (itemId) {
        await supabase.from("threat_radar_exposure_hits").delete().eq("item_id", item.id);
      }
      const { hits, exposure } = await probeItem(supabase, item);
      if (hits.length) {
        await supabase.from("threat_radar_exposure_hits").insert(hits);
      }
      await supabase.from("threat_radar_items").update({
        exposure_status: exposure,
        exposure_hit_count: hits.length,
        probed_at: new Date().toISOString(),
      }).eq("id", item.id);
      probed++;
      totalHits += hits.length;
    }

    if (runId) {
      await supabase.from("threat_radar_runs").update({
        finished_at: new Date().toISOString(),
        status: "ok",
        exposure_hits: totalHits,
        summary: `Probed ${probed} items, found ${totalHits} exposure hits in ${Date.now() - started}ms`,
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({ ok: true, probed, hits: totalHits, duration_ms: Date.now() - started }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
