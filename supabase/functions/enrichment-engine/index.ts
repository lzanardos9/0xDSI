import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface GeoIPData {
  country?: string;
  country_code?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  asn?: string;
  isp?: string;
}

function mockGeoIPLookup(ip: string): GeoIPData | null {
  if (!ip || ip === 'unknown') return null;

  const ipHash = ip.split('.').reduce((acc, val) => acc + parseInt(val || '0'), 0);
  
  const countries = [
    { name: 'United States', code: 'US', lat: 37.7749, lon: -122.4194 },
    { name: 'United Kingdom', code: 'GB', lat: 51.5074, lon: -0.1278 },
    { name: 'Germany', code: 'DE', lat: 52.5200, lon: 13.4050 },
    { name: 'China', code: 'CN', lat: 39.9042, lon: 116.4074 },
    { name: 'Russia', code: 'RU', lat: 55.7558, lon: 37.6173 },
    { name: 'Brazil', code: 'BR', lat: -23.5505, lon: -46.6333 },
    { name: 'India', code: 'IN', lat: 28.6139, lon: 77.2090 },
    { name: 'Japan', code: 'JP', lat: 35.6762, lon: 139.6503 }
  ];

  const country = countries[ipHash % countries.length];
  const cities = ['New York', 'London', 'Berlin', 'Beijing', 'Moscow', 'São Paulo', 'Mumbai', 'Tokyo'];
  const isps = ['Comcast', 'AT&T', 'Verizon', 'China Telecom', 'NTT', 'Deutsche Telekom'];

  return {
    country: country.name,
    country_code: country.code,
    city: cities[ipHash % cities.length],
    latitude: country.lat,
    longitude: country.lon,
    asn: `AS${10000 + (ipHash % 50000)}`,
    isp: isps[ipHash % isps.length]
  };
}

function checkThreatIntel(ip: string, domain?: string): any {
  const suspiciousIPs = ['192.168.1.100', '10.0.0.50', '172.16.0.10'];
  const suspiciousDomains = ['evil.com', 'badactor.net', 'malware-c2.com'];

  const isThreat = suspiciousIPs.includes(ip) || (domain && suspiciousDomains.some(d => domain.includes(d)));

  if (isThreat) {
    return {
      is_malicious: true,
      threat_type: 'c2_server',
      confidence: 0.85,
      first_seen: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      last_seen: new Date().toISOString(),
      tags: ['botnet', 'malware', 'c2']
    };
  }

  return {
    is_malicious: false,
    confidence: 0.0
  };
}

async function enrichEvent(event: any, supabase: any): Promise<any> {
  const enrichments: any = {};

  if (event.source_ip) {
    const geoData = mockGeoIPLookup(event.source_ip);
    if (geoData) {
      enrichments.source_geo = geoData;
    }

    const threatData = checkThreatIntel(event.source_ip);
    if (threatData.is_malicious) {
      enrichments.source_threat_intel = threatData;
      enrichments.risk_score = (enrichments.risk_score || 0) + 30;
    }
  }

  if (event.dest_ip) {
    const geoData = mockGeoIPLookup(event.dest_ip);
    if (geoData) {
      enrichments.dest_geo = geoData;
    }
  }

  if (event.username) {
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('full_name, department, title, risk_score, clearance_level')
      .eq('user_id', event.username)
      .single();

    if (userProfile) {
      enrichments.user_context = userProfile;
      enrichments.risk_score = (enrichments.risk_score || 0) + (userProfile.risk_score || 0);
    }
  }

  if (event.source_ip) {
    const { data: asset } = await supabase
      .from('asset_registry')
      .select('asset_name, asset_type, criticality, owner_department, tags')
      .eq('ip_address', event.source_ip)
      .single();

    if (asset) {
      enrichments.asset_context = asset;
      if (asset.criticality === 'critical') {
        enrichments.risk_score = (enrichments.risk_score || 0) + 20;
      }
    }
  }

  return enrichments;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: recentEvents } = await supabase
      .from('events')
      .select('*')
      .is('metadata->enriched', null)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!recentEvents || recentEvents.length === 0) {
      return new Response(
        JSON.stringify({ enriched: 0, message: 'No events to enrich' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let enriched = 0;

    for (const event of recentEvents) {
      try {
        const enrichments = await enrichEvent(event, supabase);

        const metadata = event.metadata || {};
        metadata.enriched = true;
        metadata.enriched_at = new Date().toISOString();
        metadata.enrichments = enrichments;

        await supabase
          .from('events')
          .update({ 
            metadata,
            risk_score: enrichments.risk_score || 0
          })
          .eq('id', event.id);

        enriched++;
      } catch (error) {
        console.error(`Failed to enrich event ${event.id}:`, error);
      }
    }

    await supabase.from('processing_stats').insert({
      pipeline_stage: 'enrichment',
      events_processed: enriched,
      metadata: { total_candidates: recentEvents.length }
    });

    return new Response(
      JSON.stringify({ 
        success: true,
        enriched,
        total: recentEvents.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});