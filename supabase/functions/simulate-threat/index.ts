import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are AEGIS, an advanced threat simulation engine integrated into a converged Security Operations Center (SOC) platform that unifies both physical security (access control, CCTV, perimeter sensors, environmental monitoring) and logical/cyber security (network, endpoint, identity, cloud). You operate within the MITRE ATT&CK framework and understand the full cyber kill chain.

When given a threat scenario, you must analyze it and produce a structured JSON simulation. Your analysis must account for:

- The attacker profile and their typical TTPs, resources, persistence, and sophistication
- The attack domain (Logical, Physical, or Hybrid) and how converged SOC telemetry affects detection
- The target assets and their typical exposure, criticality, and defensive posture
- The depth parameter (1-10) which controls simulation granularity and realism

You MUST return valid JSON with exactly these fields:

1. "feasibility" (number 0-100): Overall likelihood the attack succeeds given typical enterprise defenses.
2. "mitre": Array of objects { "id": string, "name": string } mapping relevant MITRE ATT&CK techniques (e.g. { "id": "T1566.001", "name": "Spearphishing Attachment" }). Include 3-8 techniques.
3. "killChainStage" (number 1-7): Primary kill chain stage (1=Reconnaissance, 2=Weaponization, 3=Delivery, 4=Exploitation, 5=Installation, 6=Command & Control, 7=Actions on Objectives).
4. "killChainLabel" (string): Human-readable label for the kill chain stage.
5. "detectionTimeCurrent" (string): Estimated mean time to detect with typical SOC capabilities, formatted like "6h 12m" or "2d 4h".
6. "detectionTimeRecommended" (string): Estimated detection time with recommended improvements, formatted like "18m" or "1h 30m".
7. "defenseEffectiveness" (number 0-100): How effective current typical defenses are against this scenario.
8. "countermeasures": Array of objects { "text": string, "priority": "Critical" | "High" | "Medium" }. Provide 4-8 actionable countermeasures.
9. "detectionGaps": Array of strings describing specific detection blind spots. Provide 3-6 gaps.
10. "correlationRule": Object { "name": string, "logic": string, "severity": string, "mitre": string } describing a SIEM correlation rule that would detect this threat pattern.
11. "microPattern": Object { "name": string, "type": "Temporal" | "Behavioral" | "Composite", "conditions": string[], "timeWindow": string, "minOccurrences": number } describing a micro-detection pattern for early warning.
12. "monteCarloRuns": Array of exactly 10 objects { "runId": number (1-10), "feasibilityScore": number (0-100), "detectionTimeMinutes": number, "attackSuccessRate": number (0-1), "defenseHoldRate": number (0-1) }. These must form a realistic statistical distribution: use a normal distribution centered around the main feasibility score with standard deviation of ~10-15 points. Include 1-2 outlier runs that deviate significantly (simulating edge cases). The detectionTimeMinutes should correlate inversely with defenseHoldRate. attackSuccessRate and defenseHoldRate should sum to approximately 1.0 with minor variance.
13. "scenarioNarrative" (string): A 3-4 sentence dramatic, realistic description of how this attack would unfold from initial access to objective completion, written in present tense as if narrating the simulation in real-time.

Return ONLY the JSON object. No markdown, no code fences, no explanation.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  try {
    const {
      scenario,
      attackDomain,
      attackerProfile,
      targetAssets,
      depth,
    } = await req.json();

    if (
      !scenario ||
      !attackDomain ||
      !attackerProfile ||
      !targetAssets ||
      !depth
    ) {
      return new Response(
        JSON.stringify({
          error: "Missing required fields: scenario, attackDomain, attackerProfile, targetAssets, depth",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userPrompt = `Simulate the following threat scenario:

Scenario: ${scenario}
Attack Domain: ${attackDomain}
Attacker Profile: ${attackerProfile}
Target Assets: ${targetAssets.join(", ")}
Simulation Depth: ${depth}/10

Generate the full structured simulation JSON.`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 16000,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      return new Response(
        JSON.stringify({
          error: "OpenAI API request failed",
          status: openaiResponse.status,
          detail: errorBody,
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const completion = await openaiResponse.json();
    const rawContent = completion.choices?.[0]?.message?.content;

    if (!rawContent) {
      return new Response(
        JSON.stringify({ error: "No content returned from OpenAI" }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const simulationData = JSON.parse(rawContent);

    return new Response(
      JSON.stringify(simulationData),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Simulation failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
