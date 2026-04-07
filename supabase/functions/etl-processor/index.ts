import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ParsedEvent {
  timestamp: string;
  severity: string;
  event_type: string;
  source_ip?: string;
  dest_ip?: string;
  username?: string;
  message: string;
  raw_data: any;
}

function detectFormat(rawData: any): string {
  if (typeof rawData === 'object') {
    return 'json';
  }

  const text = rawData.toString();

  if (text.match(/^<\d+>/)) {
    return 'syslog';
  }
  if (text.match(/^CEF:/)) {
    return 'cef';
  }
  try {
    JSON.parse(text);
    return 'json';
  } catch {
    return 'unknown';
  }
}

function parseJSON(data: any): ParsedEvent | null {
  try {
    const obj = typeof data === 'string' ? JSON.parse(data) : data;

    return {
      timestamp: obj.timestamp || obj['@timestamp'] || new Date().toISOString(),
      severity: (obj.severity || obj.level || 'info').toLowerCase(),
      event_type: obj.event_type || obj.type || 'unknown',
      source_ip: obj.source_ip || obj.src_ip,
      dest_ip: obj.dest_ip || obj.dst_ip,
      username: obj.username || obj.user,
      message: obj.message || obj.msg || JSON.stringify(obj),
      raw_data: obj
    };
  } catch {
    return null;
  }
}

function parseSyslog(text: string): ParsedEvent | null {
  const match = text.match(/^<(\d+)>(\w{3}\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+(\S+):\s*(.+)$/);
  if (!match) return null;

  const [, priority, timestamp, hostname, process, message] = match;
  const severity = parseInt(priority) % 8;
  const severityMap: { [key: number]: string } = {
    0: 'critical', 1: 'critical', 2: 'critical', 3: 'high',
    4: 'medium', 5: 'medium', 6: 'low', 7: 'info'
  };

  return {
    timestamp: new Date().toISOString(),
    severity: severityMap[severity] || 'info',
    event_type: 'syslog',
    source_ip: hostname,
    message,
    raw_data: { hostname, process }
  };
}

function parseCEF(text: string): ParsedEvent | null {
  const match = text.match(/^CEF:(\d+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|([^|]+)\|(.*)$/);
  if (!match) return null;

  const [, , vendor, product, , signatureId, name, severity, extension] = match;
  const extFields: any = {};
  const extRegex = /(\w+)=([^\s]+(?:\s(?!\w+=)[^\s]+)*)/g;
  let extMatch;
  while ((extMatch = extRegex.exec(extension)) !== null) {
    extFields[extMatch[1]] = extMatch[2];
  }

  const severityMap: { [key: string]: string } = {
    '0': 'low', '1': 'low', '2': 'low', '3': 'low',
    '4': 'medium', '5': 'medium', '6': 'medium',
    '7': 'high', '8': 'high', '9': 'critical', '10': 'critical'
  };

  return {
    timestamp: extFields.rt || new Date().toISOString(),
    severity: severityMap[severity] || 'medium',
    event_type: signatureId,
    source_ip: extFields.src,
    dest_ip: extFields.dst,
    username: extFields.suser || extFields.duser,
    message: name,
    raw_data: { vendor, product, extension: extFields }
  };
}

function parseEvent(rawData: any): ParsedEvent | null {
  const format = detectFormat(rawData);

  switch (format) {
    case 'syslog':
      return parseSyslog(rawData.toString());
    case 'cef':
      return parseCEF(rawData.toString());
    case 'json':
      return parseJSON(rawData);
    default:
      return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: pendingEvents } = await supabase
      .from('raw_event_buffer')
      .select('*')
      .eq('processing_status', 'pending')
      .order('received_at', { ascending: true })
      .limit(100);

    if (!pendingEvents || pendingEvents.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, message: 'No pending events' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const rawEvent of pendingEvents) {
      try {
        const parsed = parseEvent(rawEvent.raw_data);

        if (!parsed) {
          await supabase
            .from('raw_event_buffer')
            .update({ 
              processing_status: 'failed',
              error_message: 'Failed to parse event',
              processed_at: new Date().toISOString()
            })
            .eq('id', rawEvent.id);
          failed++;
          continue;
        }

        const { error: insertError } = await supabase
          .from('events')
          .insert({
            event_type: parsed.event_type,
            severity: parsed.severity,
            source_ip: parsed.source_ip,
            dest_ip: parsed.dest_ip,
            username: parsed.username,
            description: parsed.message,
            raw_data: parsed.raw_data,
            metadata: {
              original_source_id: rawEvent.source_id,
              original_source_type: rawEvent.source_type
            }
          });

        if (insertError) {
          throw insertError;
        }

        await supabase
          .from('raw_event_buffer')
          .update({ 
            processing_status: 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('id', rawEvent.id);

        processed++;
      } catch (error) {
        await supabase
          .from('raw_event_buffer')
          .update({ 
            processing_status: 'failed',
            error_message: error.message,
            processed_at: new Date().toISOString()
          })
          .eq('id', rawEvent.id);
        failed++;
      }
    }

    await supabase
      .from('processing_stats')
      .insert({
        pipeline_stage: 'parsing',
        events_processed: processed,
        events_failed: failed,
        metadata: { batch_size: pendingEvents.length }
      });

    return new Response(
      JSON.stringify({ 
        success: true,
        processed,
        failed,
        total: pendingEvents.length
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