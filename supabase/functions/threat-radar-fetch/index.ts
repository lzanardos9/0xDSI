import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface FeedItem {
  title: string;
  url: string;
  summary: string;
  content: string;
  published_at: string;
}

const UA = "Mozilla/5.0 (compatible; ThreatRadarAgent/1.0; +https://threatradar.local)";

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function stripHtml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function extractAll(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "gi");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function extractFirst(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}="([^"]+)"`, "i");
  const m = xml.match(re);
  return m ? m[1] : "";
}

function parseRss(xml: string): FeedItem[] {
  const items = extractAll(xml, "item");
  return items.map(raw => {
    const title = stripHtml(extractFirst(raw, "title"));
    const link = stripHtml(extractFirst(raw, "link")) || extractAttr(raw, "link", "href");
    const description = stripHtml(extractFirst(raw, "description"));
    const contentEncoded = stripHtml(extractFirst(raw, "content:encoded"));
    const pubDate = extractFirst(raw, "pubDate") || extractFirst(raw, "dc:date") || extractFirst(raw, "published");
    const published = pubDate ? new Date(stripHtml(pubDate)) : new Date();
    return {
      title,
      url: link,
      summary: description.slice(0, 500),
      content: (contentEncoded || description).slice(0, 4000),
      published_at: isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
    };
  }).filter(i => i.title && i.url);
}

function parseAtom(xml: string): FeedItem[] {
  const entries = extractAll(xml, "entry");
  return entries.map(raw => {
    const title = stripHtml(extractFirst(raw, "title"));
    const link = extractAttr(raw, "link", "href") || stripHtml(extractFirst(raw, "link"));
    const summary = stripHtml(extractFirst(raw, "summary"));
    const content = stripHtml(extractFirst(raw, "content"));
    const updated = extractFirst(raw, "updated") || extractFirst(raw, "published");
    const published = updated ? new Date(stripHtml(updated)) : new Date();
    return {
      title,
      url: link,
      summary: (summary || content).slice(0, 500),
      content: (content || summary).slice(0, 4000),
      published_at: isNaN(published.getTime()) ? new Date().toISOString() : published.toISOString(),
    };
  }).filter(i => i.title && i.url);
}

function parseCisaKev(json: any): FeedItem[] {
  const vulns: any[] = (json?.vulnerabilities || []).slice(0, 25);
  return vulns.map(v => ({
    title: `${v.cveID} - ${v.vulnerabilityName || v.shortDescription?.slice(0, 80) || v.vendorProject}`,
    url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`,
    summary: (v.shortDescription || "").slice(0, 500),
    content: [v.shortDescription, v.requiredAction, `Vendor: ${v.vendorProject}`, `Product: ${v.product}`, `Due: ${v.dueDate}`].filter(Boolean).join("\n").slice(0, 4000),
    published_at: v.dateAdded ? new Date(v.dateAdded).toISOString() : new Date().toISOString(),
  }));
}

function parseNvdJson(json: any): FeedItem[] {
  const items: any[] = (json?.vulnerabilities || []).slice(0, 25);
  return items.map(it => {
    const cve = it.cve || {};
    const id = cve.id || "CVE-UNKNOWN";
    const desc = (cve.descriptions || []).find((d: any) => d.lang === "en")?.value || "";
    const severity = cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity || "";
    return {
      title: `${id}${severity ? ` [${severity}]` : ""} - ${desc.slice(0, 100)}`,
      url: `https://nvd.nist.gov/vuln/detail/${id}`,
      summary: desc.slice(0, 500),
      content: desc.slice(0, 4000),
      published_at: cve.published ? new Date(cve.published).toISOString() : new Date().toISOString(),
    };
  });
}

async function fetchFeed(source: any): Promise<{ items: FeedItem[]; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(source.url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/json, text/xml;q=0.9,*/*;q=0.8" },
    signal: AbortSignal.timeout(20000),
  });
  const latencyMs = Date.now() - started;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();

  if (source.source_key === "cisa_kev" || source.url.endsWith(".json") || source.url.includes("nvd.nist.gov/rest")) {
    try {
      const json = JSON.parse(text);
      if (source.source_key === "cisa_kev") return { items: parseCisaKev(json), latencyMs };
      return { items: parseNvdJson(json), latencyMs };
    } catch {
      /* fall through to xml */
    }
  }

  const isAtom = /<feed[\s>]/i.test(text) || source.source_type === "atom";
  const items = isAtom ? parseAtom(text) : parseRss(text);
  return { items, latencyMs };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const sourceFilter: string[] | null = body.sources || null;
    const limit: number = body.limit || 50;

    const runStart = Date.now();
    const { data: runRow } = await supabase
      .from("threat_radar_runs")
      .insert({ run_type: "fetch", status: "running", started_at: new Date().toISOString() })
      .select("id")
      .maybeSingle();
    const runId = runRow?.id;

    let q = supabase.from("threat_radar_sources").select("*").eq("is_active", true);
    if (sourceFilter && sourceFilter.length) q = q.in("source_key", sourceFilter);
    const { data: sources } = await q;

    let sourcesOk = 0;
    let sourcesAttempted = 0;
    let itemsNew = 0;
    let itemsDuplicate = 0;
    const errors: string[] = [];
    const sourceResults: any[] = [];

    for (const src of sources || []) {
      sourcesAttempted++;
      try {
        const { items, latencyMs } = await fetchFeed(src);
        let added = 0, dup = 0;
        for (const it of items.slice(0, limit)) {
          const urlHash = await sha256(it.url);
          const { error: insErr } = await supabase.from("threat_radar_items").insert({
            source_key: src.source_key,
            source_name: src.source_name,
            title: it.title,
            url: it.url,
            url_hash: urlHash,
            summary: it.summary,
            content: it.content,
            published_at: it.published_at,
            analysis_status: "pending",
            exposure_status: "unknown",
          });
          if (insErr) {
            if (insErr.code === "23505") dup++;
            else errors.push(`${src.source_key}: ${insErr.message}`);
          } else {
            added++;
          }
        }
        itemsNew += added;
        itemsDuplicate += dup;
        sourcesOk++;
        await supabase.from("threat_radar_sources").update({
          last_fetched_at: new Date().toISOString(),
          last_success_at: new Date().toISOString(),
          consecutive_failures: 0,
          total_items: (src.total_items || 0) + added,
          avg_latency_ms: Math.round(((src.avg_latency_ms || latencyMs) + latencyMs) / 2),
        }).eq("source_key", src.source_key);
        sourceResults.push({ source_key: src.source_key, ok: true, added, dup, latencyMs });
      } catch (err: any) {
        errors.push(`${src.source_key}: ${err.message}`);
        await supabase.from("threat_radar_sources").update({
          last_fetched_at: new Date().toISOString(),
          consecutive_failures: (src.consecutive_failures || 0) + 1,
        }).eq("source_key", src.source_key);
        sourceResults.push({ source_key: src.source_key, ok: false, error: err.message });
      }
    }

    const finishedAt = new Date().toISOString();
    if (runId) {
      await supabase.from("threat_radar_runs").update({
        finished_at: finishedAt,
        status: errors.length === sourcesAttempted ? "failed" : "ok",
        sources_attempted: sourcesAttempted,
        sources_ok: sourcesOk,
        items_new: itemsNew,
        items_duplicate: itemsDuplicate,
        error_detail: errors.join("\n").slice(0, 2000),
        summary: `Fetched ${itemsNew} new items from ${sourcesOk}/${sourcesAttempted} sources in ${Date.now() - runStart}ms`,
      }).eq("id", runId);
    }

    return new Response(JSON.stringify({
      ok: true,
      run_id: runId,
      sources_attempted: sourcesAttempted,
      sources_ok: sourcesOk,
      items_new: itemsNew,
      items_duplicate: itemsDuplicate,
      duration_ms: Date.now() - runStart,
      source_results: sourceResults,
      errors,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
