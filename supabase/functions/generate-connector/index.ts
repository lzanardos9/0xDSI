import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const body = await req.json();
    const {
      connectorName,
      vendor,
      description,
      acquisitionMethod,
      transportProtocol,
      logFormat,
      sampleLog,
      normalizationSchema,
      customContract,
      kernelLevel,
      dataQuality,
      sampling,
    } = body;

    if (!connectorName || !acquisitionMethod || !transportProtocol) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: connectorName, acquisitionMethod, transportProtocol" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isCustomContract = normalizationSchema === 'custom-contract-proposal' || !!customContract;
    const isKernel = kernelLevel === true;

    const systemPrompt = `You are a world-class security data engineering expert specializing in SIEM connector development.
You produce production-grade TypeScript connector code that:
- Follows the 0xDSI connector SDK patterns
- Implements proper error handling, retry logic, and rate limiting
- Normalizes output to ${normalizationSchema || 'OCSF'} schema
- Includes comprehensive type definitions
- Handles authentication, pagination, and checkpointing
${isKernel ? '- Implements kernel-level eBPF/XDP hooks with BPF CO-RE for portability\n- Uses ring buffers for kernel-to-userspace event delivery\n- Handles BTF type info and verifier constraints' : ''}
${sampling ? `- Implements statistical reservoir sampling at ${sampling.rate}% retention rate\n- ${sampling.discardAfterGraph ? 'Processes 100% through CET/CEP graph engine before discarding' : ''}\n- ${sampling.sparkStreaming ? 'Integrates with Spark Structured Streaming for windowed aggregation' : ''}` : ''}
${dataQuality ? '- Includes DataQualityValidator with schema validation, field presence monitoring, timestamp drift detection, schema evolution tracking, volume anomaly detection, and duplicate detection' : ''}
${isCustomContract ? '- Outputs a proposed data contract/schema based on sample data analysis' : ''}
- Is ready for deployment without modification

Output ONLY the code - no markdown fences, no explanations.`;

    const userPrompt = `Generate a production-ready connector for:

**Connector**: ${connectorName}
**Vendor**: ${vendor || 'Unknown'}
**Description**: ${description || 'Security data connector'}
**Data Acquisition Method**: ${acquisitionMethod}
**Transport Protocol**: ${transportProtocol}
**Log Format**: ${logFormat || 'JSON'}
**Normalization Target**: ${normalizationSchema || 'OCSF v1.3.0'}
${sampleLog ? `\n**Sample Log**:\n${sampleLog}` : ''}
${customContract ? `\n**Custom Data Contract**:\n${customContract}` : ''}
${isKernel ? '\n**KERNEL-LEVEL CONNECTOR**: Implement eBPF/XDP with BPF CO-RE, ring buffers, BTF support, and proper verifier-safe code.' : ''}
${sampling ? `\n**STATISTICAL SAMPLING**: Implement reservoir sampling at ${sampling.rate}% rate. ${sampling.discardAfterGraph ? 'Route 100% through CET/CEP graph engine, discard raw after graph computation.' : ''} ${sampling.sparkStreaming ? 'Integrate with Spark Structured Streaming (foreachBatch sink) for windowed aggregation before discard.' : ''}` : ''}
${dataQuality ? '\n**DATA QUALITY**: Include DataQualityValidator class with: schema validation per-event, field presence % monitoring with alerting threshold, timestamp drift detection (>5min), schema evolution tracking (new/removed fields), volume anomaly detection (stddev-based), content-hash deduplication with sliding window.' : ''}

Requirements:
1. TypeScript with full type definitions
2. ConnectorBase class extending pattern with lifecycle methods (connect, poll, disconnect)
3. Proper ${acquisitionMethod} implementation with authentication
4. ${transportProtocol} transport handling with TLS/encryption
5. Parser that handles ${logFormat} format with field extraction
6. ${isCustomContract ? 'Use the provided custom data contract for normalization' : 'OCSF normalization with class_uid mapping for detected event types'}
7. Checkpoint/cursor management for resumable ingestion
8. Rate limiting and exponential backoff retry logic
9. Health check endpoint
10. Metrics collection (events processed, errors, latency)
11. Graceful shutdown handling
12. Configuration validation on startup
${isKernel ? '13. eBPF program with CO-RE relocations\n14. XDP hook attachment with fallback to TC\n15. Perf/ring buffer for kernel-to-userspace delivery\n16. BTF type information handling' : ''}
${sampling ? '13. StatisticalSampler class with configurable rate\n14. ReservoirSampling algorithm implementation\n15. Metrics for discarded vs retained events' : ''}`;

    const openaiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${openaiResponse.status}`, details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const generatedCode = openaiData.choices?.[0]?.message?.content || "";

    // Also generate a parser separately for the specific log format
    const parserPrompt = `Generate a standalone parser module for ${logFormat || 'JSON'} logs from ${connectorName} (${vendor}).
${sampleLog ? `Sample log:\n${sampleLog}\n` : ''}
The parser should:
1. Extract all fields from the log format
2. Handle malformed input gracefully
3. Return typed ParsedEvent objects
4. Include timestamp normalization
5. Map to OCSF fields where applicable

Output ONLY the TypeScript code.`;

    const parserResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a log parsing expert. Output only production TypeScript code." },
          { role: "user", content: parserPrompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
      }),
    });

    let parserCode = "";
    if (parserResponse.ok) {
      const parserData = await parserResponse.json();
      parserCode = parserData.choices?.[0]?.message?.content || "";
    }

    return new Response(
      JSON.stringify({
        success: true,
        connectorCode: generatedCode,
        parserCode,
        metadata: {
          connectorName,
          vendor,
          acquisitionMethod,
          transportProtocol,
          logFormat,
          normalizationSchema: normalizationSchema || "OCSF v1.3.0",
          generatedAt: new Date().toISOString(),
          model: "gpt-4o",
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
