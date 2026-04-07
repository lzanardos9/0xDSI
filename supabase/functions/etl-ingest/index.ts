import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const body = await req.json();
    const { source_id, source_type, raw_data, source_ip } = body;

    if (!source_id || !raw_data) {
      return new Response(
        JSON.stringify({ error: 'source_id and raw_data required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const { data: buffered, error: bufferError } = await supabase
      .from('raw_event_buffer')
      .insert({
        source_id,
        source_type: source_type || 'unknown',
        source_ip: source_ip || null,
        raw_data,
        raw_text: typeof raw_data === 'string' ? raw_data : JSON.stringify(raw_data),
        processing_status: 'pending',
        metadata: {
          ingested_via: 'api',
          user_agent: req.headers.get('user-agent') || 'unknown'
        }
      })
      .select()
      .single();

    if (bufferError) {
      console.error('Buffer insert error:', bufferError);
      return new Response(
        JSON.stringify({ error: bufferError.message, details: bufferError }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        event_id: buffered.id,
        message: 'Event buffered for processing'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('ETL Ingest error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Unknown error',
        stack: error.stack
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});