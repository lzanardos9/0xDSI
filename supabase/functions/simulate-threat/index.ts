import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const STEP1_SYSTEM = `You are the PSO Engine for a converged SOC platform. Analyze an attack scenario and return ONLY valid JSON with these fields:

"feasibility": number 0-100
"mitre": [{id,name}] 3-6 MITRE ATT&CK techniques
"killChainStage": 1-7
"killChainLabel": string
"detectionTimeCurrent": string e.g. "6h 12m"
"detectionTimeRecommended": string e.g. "18m"
"defenseEffectiveness": 0-100
"scenarioNarrative": 3-4 sentences, dramatic present-tense narrative

No markdown, no code fences. Only JSON.`;

const STEP2_SYSTEM = `You are the PSO Engine for a converged SOC platform. Given attack context, return ONLY valid JSON with these fields:

"countermeasures": [{text,priority:"Critical"|"High"|"Medium"}] 4-6 items
"detectionGaps": string[] 3-5 items
"correlationRule": {name,logic,severity,mitre}
"microPattern": {name,type:"Temporal"|"Behavioral"|"Composite",conditions:string[],timeWindow,minOccurrences}
"monteCarloRuns": [{runId:1-10,feasibilityScore:0-100,detectionTimeMinutes,attackSuccessRate:0-1,defenseHoldRate:0-1}] exactly 10 runs with normal distribution around feasibility

No markdown, no code fences. Only JSON.`;

const STEP3_SYSTEM = `You are the PSO Engine for a converged SOC platform. Given attack context, return ONLY valid JSON with these fields:

"topAttackPaths": [{id,name,steps:string[],likelihood:0-100,impact:0-100,riskScore,timeToCompromiseMinutes,detectionProbability:0-1}] 3-4 paths
"highRiskNodes": [{node,type:"identity"|"endpoint"|"service"|"cloud"|"data",riskCentrality:0-100,vulnerabilityScore:0-10,exposureLevel:"Critical"|"High"|"Medium"|"Low",simulationAppearanceRate:string,controlCoverage:0-100}] 4-5 nodes
"coverageAnalysis": {overallCoverage:0-100,coveredPaths,totalPaths,coverageByStage:{reconnaissance,initialAccess,execution,persistence,lateralMovement,exfiltration},improvementPotential:string}
"controlFailureSensitivity": [{control,currentEffectiveness:0-100,failureImpact:"Critical"|"High"|"Medium",attackSuccessIncrease:number,recommendation}] 3-4
"predictedNextSteps": [{step,probability:0-100,mitreTechnique,timeframeMinutes,indicator}] 3-4
"graphEdges": [{from,to,edgeType:"lateral_movement"|"privilege_escalation"|"data_access"|"trust_relationship"|"network_path",transitionProbability:0-1,modifiers:string[]}] 4-6

No markdown, no code fences. Only JSON.`;

async function callOpenAI(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<Record<string, unknown>> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenAI ${response.status}: ${errText}`);
  }

  const completion = await response.json();
  const raw = completion.choices?.[0]?.message?.content;
  if (!raw) throw new Error("No content from OpenAI");

  return JSON.parse(raw);
}

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
    const body = await req.json();
    const { scenario, attackDomain, attackerProfile, targetAssets, depth, step, context } = body;

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

    const currentStep = step || 1;
    const basePrompt = `Scenario: ${scenario}\nDomain: ${attackDomain} | Profile: ${attackerProfile}\nTargets: ${targetAssets.join(", ")} | Depth: ${depth}/10`;

    let systemPrompt: string;
    let userPrompt: string;
    let maxTokens: number;

    if (currentStep === 1) {
      systemPrompt = STEP1_SYSTEM;
      userPrompt = `Analyze this attack scenario:\n${basePrompt}`;
      maxTokens = 2000;
    } else if (currentStep === 2) {
      systemPrompt = STEP2_SYSTEM;
      const ctx = context || {};
      userPrompt = `Attack context from step 1:\n${basePrompt}\nFeasibility: ${ctx.feasibility || 50}\nKill Chain: ${ctx.killChainLabel || "Exploitation"}\nMITRE: ${(ctx.mitre || []).map((m: { id: string }) => m.id).join(", ")}\nDefense Effectiveness: ${ctx.defenseEffectiveness || 40}\n\nGenerate countermeasures, detection gaps, correlation rule, micro-pattern, and Monte Carlo runs.`;
      maxTokens = 3000;
    } else {
      systemPrompt = STEP3_SYSTEM;
      const ctx = context || {};
      userPrompt = `Attack context:\n${basePrompt}\nFeasibility: ${ctx.feasibility || 50}\nKill Chain: ${ctx.killChainLabel || "Exploitation"}\nMITRE: ${(ctx.mitre || []).map((m: { id: string }) => m.id).join(", ")}\nDefense Effectiveness: ${ctx.defenseEffectiveness || 40}\n\nGenerate attack paths, high-risk nodes, coverage analysis, control sensitivity, predicted steps, and graph edges.`;
      maxTokens = 3500;
    }

    const result = await callOpenAI(openaiApiKey, systemPrompt, userPrompt, maxTokens);

    return new Response(
      JSON.stringify({ step: currentStep, data: result }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "Simulation step failed",
        detail: err instanceof Error ? err.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
