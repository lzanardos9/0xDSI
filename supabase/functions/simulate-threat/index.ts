import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are the PSO Engine (Predictive Security Operations Engine) for 0xDSI's converged SOC. You combine Monte Carlo simulation, graph-based attack path modeling, and correlation rule generation.

Return ONLY valid JSON with these fields:

"feasibility": number 0-100
"mitre": [{id,name}] 3-8 techniques
"killChainStage": 1-7
"killChainLabel": string
"detectionTimeCurrent": string e.g. "6h 12m"
"detectionTimeRecommended": string e.g. "18m"
"defenseEffectiveness": 0-100
"countermeasures": [{text,priority:"Critical"|"High"|"Medium"}] 4-8 items
"detectionGaps": string[] 3-6 items
"correlationRule": {name,logic,severity,mitre}
"microPattern": {name,type:"Temporal"|"Behavioral"|"Composite",conditions:string[],timeWindow,minOccurrences}
"monteCarloRuns": [{runId:1-10,feasibilityScore:0-100,detectionTimeMinutes,attackSuccessRate:0-1,defenseHoldRate:0-1}] exactly 10, normal dist around feasibility
"scenarioNarrative": 3-4 sentences, dramatic present-tense
"topAttackPaths": [{id,name,steps:string[],likelihood:0-100,impact:0-100,riskScore:likelihood*impact/100,timeToCompromiseMinutes,detectionProbability:0-1}] 3-5 paths ranked by riskScore
"highRiskNodes": [{node,type:"identity"|"endpoint"|"service"|"cloud"|"data",riskCentrality:0-100,vulnerabilityScore:0-10,exposureLevel:"Critical"|"High"|"Medium"|"Low",simulationAppearanceRate:string,controlCoverage:0-100}] 4-6 nodes
"coverageAnalysis": {overallCoverage:0-100,coveredPaths,totalPaths,coverageByStage:{reconnaissance,initialAccess,execution,persistence,lateralMovement,exfiltration},improvementPotential:string}
"controlFailureSensitivity": [{control,currentEffectiveness:0-100,failureImpact:"Critical"|"High"|"Medium",attackSuccessIncrease:number,recommendation}] 3-5
"predictedNextSteps": [{step,probability:0-100,mitreTechnique,timeframeMinutes,indicator}] 3-4
"graphEdges": [{from,to,edgeType:"lateral_movement"|"privilege_escalation"|"data_access"|"trust_relationship"|"network_path",transitionProbability:0-1,modifiers:string[]}] 4-6

No markdown, no code fences.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { scenario, attackDomain, attackerProfile, targetAssets, depth } = await req.json();

    if (!scenario || !attackDomain || !attackerProfile || !targetAssets || !depth) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userPrompt = `PSO Engine simulation:
Scenario: ${scenario}
Domain: ${attackDomain} | Profile: ${attackerProfile}
Targets: ${targetAssets.join(", ")} | Depth: ${depth}/10
Generate full structured JSON.`;

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
          max_tokens: 8000,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errorBody = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: "OpenAI API request failed", status: openaiResponse.status, detail: errorBody }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const completion = await openaiResponse.json();
    const rawContent = completion.choices?.[0]?.message?.content;

    if (!rawContent) {
      return new Response(
        JSON.stringify({ error: "No content returned from OpenAI" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(rawContent, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Simulation failed", detail: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
