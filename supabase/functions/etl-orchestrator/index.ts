import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

async function callFunction(functionName: string, supabaseUrl: string, anonKey: string): Promise<any> {
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${anonKey}`
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    throw new Error(`${functionName} failed: ${response.statusText}`);
  }

  return await response.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const startTime = Date.now();
    const results: any = {
      orchestrator_started_at: new Date().toISOString(),
      pipeline_stages: []
    };

    console.log('ETL Orchestrator started');

    try {
      const parsingResult = await callFunction('etl-processor', supabaseUrl, supabaseAnonKey);
      results.pipeline_stages.push({
        stage: 'parsing',
        status: 'completed',
        ...parsingResult
      });
      console.log('Parsing completed:', parsingResult);
    } catch (error) {
      results.pipeline_stages.push({
        stage: 'parsing',
        status: 'failed',
        error: error.message
      });
      console.error('Parsing failed:', error);
    }

    try {
      const enrichmentResult = await callFunction('enrichment-engine', supabaseUrl, supabaseAnonKey);
      results.pipeline_stages.push({
        stage: 'enrichment',
        status: 'completed',
        ...enrichmentResult
      });
      console.log('Enrichment completed:', enrichmentResult);
    } catch (error) {
      results.pipeline_stages.push({
        stage: 'enrichment',
        status: 'failed',
        error: error.message
      });
      console.error('Enrichment failed:', error);
    }

    try {
      const correlationResult = await callFunction('correlation-engine', supabaseUrl, supabaseAnonKey);
      results.pipeline_stages.push({
        stage: 'correlation',
        status: 'completed',
        ...correlationResult
      });
      console.log('Correlation completed:', correlationResult);
    } catch (error) {
      results.pipeline_stages.push({
        stage: 'correlation',
        status: 'failed',
        error: error.message
      });
      console.error('Correlation failed:', error);
    }

    const executionTime = Date.now() - startTime;
    results.total_execution_time_ms = executionTime;
    results.orchestrator_completed_at = new Date().toISOString();

    const successfulStages = results.pipeline_stages.filter((s: any) => s.status === 'completed').length;
    const failedStages = results.pipeline_stages.filter((s: any) => s.status === 'failed').length;

    results.summary = {
      total_stages: results.pipeline_stages.length,
      successful_stages: successfulStages,
      failed_stages: failedStages,
      execution_time_ms: executionTime
    };

    console.log('ETL Orchestrator completed:', results.summary);

    return new Response(
      JSON.stringify(results),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: failedStages > 0 ? 207 : 200
      }
    );
  } catch (error) {
    console.error('Orchestrator error:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        stack: error.stack
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});