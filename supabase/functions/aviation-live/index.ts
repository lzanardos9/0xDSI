import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// adsb.lol / readsb aircraft record (subset)
interface AdsbAircraft {
  hex?: string;
  flight?: string;
  r?: string; // registration
  t?: string; // type
  lat?: number;
  lon?: number;
  alt_baro?: number | "ground";
  gs?: number; // ground speed, knots
  track?: number; // degrees
  baro_rate?: number; // feet/min
  squawk?: string;
  emergency?: string; // "none" | "general" | "lifeguard" | "minfuel" | "nordo" | "unlawful" | "downed"
}

interface Threat {
  icao24: string;
  callsign: string;
  originCountry: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low";
  squawk: string | null;
  latitude: number | null;
  longitude: number | null;
  altitude: number | null; // meters
  velocity: number | null; // m/s
  verticalRate: number | null; // m/s
  detail: string;
}

// region center [lat, lon]; adsb.lol max radius is 250 nm
const REGIONS: Record<string, { lat: number; lon: number; bbox: [number, number, number, number] }> = {
  europe: { lat: 50, lon: 8, bbox: [42, -6, 58, 22] },
  usa: { lat: 39, lon: -98, bbox: [30, -112, 48, -84] },
  mideast: { lat: 30, lon: 45, bbox: [21, 33, 39, 57] },
  asia: { lat: 25, lon: 115, bbox: [16, 103, 34, 127] },
};

const FT_TO_M = 0.3048;
const KT_TO_MS = 0.514444;
const FTMIN_TO_MS = 0.00508;

const diag: string[] = [];

async function fetchJson(url: string, ms: number): Promise<any | null> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "0xDSI-AviationLive/1.1", Accept: "application/json" },
      signal: ac.signal,
    });
    if (!res.ok) {
      diag.push(`${url} -> HTTP ${res.status} in ${Date.now() - started}ms`);
      return null;
    }
    return await res.json();
  } catch (e) {
    diag.push(`${url} -> ${e instanceof Error ? e.name + ": " + e.message : "error"} in ${Date.now() - started}ms`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const isAirborne = (a: AdsbAircraft) => a.alt_baro !== "ground" && typeof a.alt_baro === "number";
const altM = (a: AdsbAircraft) => (typeof a.alt_baro === "number" ? a.alt_baro * FT_TO_M : null);

function detectThreat(a: AdsbAircraft): Threat | null {
  if (!a.hex) return null;
  const base = {
    icao24: a.hex.toUpperCase(),
    callsign: (a.flight || "").trim() || "—",
    originCountry: (a.r || a.t || "").trim(),
    squawk: a.squawk ?? null,
    latitude: typeof a.lat === "number" ? a.lat : null,
    longitude: typeof a.lon === "number" ? a.lon : null,
    altitude: altM(a),
    velocity: typeof a.gs === "number" ? a.gs * KT_TO_MS : null,
    verticalRate: typeof a.baro_rate === "number" ? a.baro_rate * FTMIN_TO_MS : null,
  };
  if (a.squawk === "7500" || a.emergency === "unlawful") {
    return { ...base, category: "hijack", severity: "critical", detail: "Squawk 7500 / unlawful interference — hijack code broadcast." };
  }
  if (a.squawk === "7700" || (a.emergency && a.emergency !== "none" && a.emergency !== "nordo")) {
    return { ...base, category: "emergency", severity: "critical", detail: `Squawk 7700 / emergency (${a.emergency && a.emergency !== "none" ? a.emergency : "general"}) declared.` };
  }
  if (a.squawk === "7600" || a.emergency === "nordo") {
    return { ...base, category: "radio_failure", severity: "high", detail: "Squawk 7600 / NORDO — radio communication failure." };
  }
  if (isAirborne(a) && typeof a.baro_rate === "number" && a.baro_rate < -3500) {
    return { ...base, category: "rapid_descent", severity: "medium", detail: `Rapid descent ~${Math.round(a.baro_rate)} ft/min.` };
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    diag.length = 0;
    const url = new URL(req.url);
    const regionKey = (url.searchParams.get("region") || "europe").toLowerCase();
    const region = REGIONS[regionKey] || REGIONS.europe;
    const [lamin, lomin, lamax, lomax] = region.bbox;

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey) : null;

    // Open ADS-B mirrors (no key). One request each to stay under rate limits.
    // Emergency squawks are detected from this same regional feed.
    const MIRRORS = [
      { name: "adsb.lol", base: "https://api.adsb.lol/v2" },
      { name: "adsb.fi", base: "https://opendata.adsb.fi/api/v2" },
    ];

    let sourceName = "";
    let regional: any = null;

    for (const m of MIRRORS) {
      const reg = await fetchJson(`${m.base}/lat/${region.lat}/lon/${region.lon}/dist/250`, 9000);
      if (reg && Array.isArray(reg.ac)) {
        sourceName = m.name;
        regional = reg;
        break;
      }
    }

    // Upstream rate-limited or unreachable: fall back to last good cached payload.
    if (!regional || !Array.isArray(regional.ac)) {
      if (supabase) {
        const { data: cached } = await supabase
          .from("aviation_live_cache")
          .select("payload, updated_at")
          .eq("region", regionKey)
          .maybeSingle();
        if (cached?.payload) {
          const ageSec = Math.round((Date.now() - new Date(cached.updated_at).getTime()) / 1000);
          return new Response(
            JSON.stringify({ ...cached.payload, stale: true, cacheAgeSec: ageSec, diag }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
      return new Response(
        JSON.stringify({ error: "Live ADS-B feed unavailable", region: regionKey, diag }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const regionAc: AdsbAircraft[] = regional.ac;

    let airborne = 0, onGround = 0, emergencies = 0;
    const threatMap = new Map<string, Threat>();

    for (const a of regionAc) {
      isAirborne(a) ? airborne++ : onGround++;
      if (a.squawk === "7500" || a.squawk === "7700" || a.squawk === "7600" ||
          (a.emergency && a.emergency !== "none")) {
        emergencies++;
      }
      const t = detectThreat(a);
      if (t) threatMap.set(t.icao24, t);
    }

    const threats = [...threatMap.values()].sort((x, y) => {
      const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
      return rank[x.severity] - rank[y.severity];
    });

    // Persist notable (critical/high) events for rolling history.
    let recent: unknown[] = [];
    if (supabase) {
      const notable = threats.filter((t) => t.severity === "critical" || t.severity === "high");
      if (notable.length) {
        const detectedAt = new Date().toISOString();
        await supabase.from("aviation_live_events").insert(
          notable.map((t) => ({
            icao24: t.icao24,
            callsign: t.callsign === "—" ? null : t.callsign,
            origin_country: t.originCountry || null,
            category: t.category,
            severity: t.severity,
            squawk: t.squawk,
            latitude: t.latitude,
            longitude: t.longitude,
            altitude_m: t.altitude,
            velocity_ms: t.velocity,
            vertical_rate_ms: t.verticalRate,
            detail: t.detail,
            detected_at: detectedAt,
          })),
        );
      }
      const { data: history } = await supabase
        .from("aviation_live_events")
        .select("icao24, callsign, origin_country, category, severity, squawk, latitude, longitude, altitude_m, detail, detected_at")
        .order("detected_at", { ascending: false })
        .limit(15);
      recent = history ?? [];
    }

    const sample = regionAc
      .filter((a) => typeof a.lat === "number" && typeof a.lon === "number")
      .slice(0, 600)
      .map((a) => ({
        icao24: (a.hex || "").toUpperCase(),
        callsign: (a.flight || "").trim() || "—",
        originCountry: (a.r || a.t || "").trim(),
        lat: a.lat!,
        lon: a.lon!,
        alt: altM(a),
        vel: typeof a.gs === "number" ? a.gs * KT_TO_MS : null,
        heading: typeof a.track === "number" ? a.track : null,
        onGround: !isAirborne(a),
        squawk: a.squawk ?? null,
      }));

    const payload = {
      region: regionKey,
      source: sourceName,
      bbox: { lamin, lomin, lamax, lomax },
      feedTime: Math.floor(Date.now() / 1000),
      globalEmergencies: emergencies,
      stats: { total: regionAc.length, airborne, onGround, threats: threats.length },
      aircraft: sample,
      threats,
      recent,
    };

    if (supabase) {
      await supabase
        .from("aviation_live_cache")
        .upsert({ region: regionKey, payload, updated_at: new Date().toISOString() });
    }

    return new Response(
      JSON.stringify(payload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
