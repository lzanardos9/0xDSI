import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const SYSTEM_PROMPT = `You are the PSO Engine (Predictive Security Operations Engine) — a production-grade threat simulation system integrated into 0xDSI's converged SOC platform. You combine Monte Carlo attack simulation, graph-based attack path modeling, and simulation-driven correlation rule generation.

You operate within the MITRE ATT&CK framework and model the environment as a security graph where nodes are identities, endpoints, services, cloud resources, and data assets, and edges are trust relationships, access paths, network connectivity, and privilege escalation paths.

When given a threat scenario, produce a structured JSON simulation. Your analysis must account for:

- The attacker profile and their typical TTPs, resources, persistence, and sophistication level
- The attack domain (Logical, Physical, or Hybrid) and converged SOC telemetry coverage
- The target assets, their exposure, criticality, vulnerability scores, and defensive posture
- The depth parameter (1-10) controlling simulation granularity
- Graph-based attack path modeling with transition probabilities influenced by vulnerabilities, identity privileges, control effectiveness, and historical patterns
- Stochastic simulation across multiple paths with probabilistic outcomes

Return valid JSON with exactly these fields:

1. "feasibility" (number 0-100): Overall attack success likelihood.

2. "mitre": Array of { "id": string, "name": string } for 3-8 relevant MITRE ATT&CK techniques.

3. "killChainStage" (number 1-7): Primary kill chain stage reached.

4. "killChainLabel" (string): Human-readable kill chain stage label.

5. "detectionTimeCurrent" (string): Mean time to detect with current SOC, e.g. "6h 12m".

6. "detectionTimeRecommended" (string): Detection time with improvements, e.g. "18m".

7. "defenseEffectiveness" (number 0-100): Current defense effectiveness against this scenario.

8. "countermeasures": Array of { "text": string, "priority": "Critical" | "High" | "Medium" }. 4-8 items.

9. "detectionGaps": Array of 3-6 strings describing detection blind spots.

10. "correlationRule": { "name": string, "logic": string, "severity": string, "mitre": string }.

11. "microPattern": { "name": string, "type": "Temporal" | "Behavioral" | "Composite", "conditions": string[], "timeWindow": string, "minOccurrences": number }.

12. "monteCarloRuns": Array of exactly 10 objects { "runId": number (1-10), "feasibilityScore": number (0-100), "detectionTimeMinutes": number, "attackSuccessRate": number (0-1), "defenseHoldRate": number (0-1) }. Normal distribution centered on feasibility, stdDev ~10-15. 1-2 outliers. attackSuccessRate + defenseHoldRate ≈ 1.0.

13. "scenarioNarrative" (string): 3-4 sentence dramatic present-tense narration of the attack unfolding.

14. "topAttackPaths": Array of 3-5 objects representing the most likely attack paths from simulation. Each: { "id": number, "name": string (short path name), "steps": string[] (array of 3-6 step descriptions like "Phishing email delivered to target"), "likelihood": number (0-100), "impact": number (0-100), "riskScore": number (likelihood * impact / 100, rounded), "timeToCompromiseMinutes": number, "detectionProbability": number (0-1, chance current defenses detect this path) }. Rank by riskScore descending. These represent stochastic simulation outputs — different ways the attacker could achieve objectives.

15. "highRiskNodes": Array of 4-6 objects representing graph nodes with highest risk centrality. Each: { "node": string (asset/identity name), "type": "identity" | "endpoint" | "service" | "cloud" | "data", "riskCentrality": number (0-100, how often this node appears in high-impact simulated paths), "vulnerabilityScore": number (0-10), "exposureLevel": "Critical" | "High" | "Medium" | "Low", "simulationAppearanceRate": string (e.g. "34% of attack paths"), "controlCoverage": number (0-100, detection/control coverage for this node) }. These are nodes that appear most frequently in simulated attack paths.

16. "coverageAnalysis": { "overallCoverage": number (0-100, % of likely attack paths covered by current detections), "coveredPaths": number, "totalPaths": number, "coverageByStage": { "reconnaissance": number (0-100), "initialAccess": number (0-100), "execution": number (0-100), "persistence": number (0-100), "lateralMovement": number (0-100), "exfiltration": number (0-100) }, "improvementPotential": string (e.g. "Deploying these 5 rules increases early detection probability by 41%") }.

17. "controlFailureSensitivity": Array of 3-5 objects. Each: { "control": string (control name), "currentEffectiveness": number (0-100), "failureImpact": string ("Critical" | "High" | "Medium"), "attackSuccessIncrease": number (percentage points increase in attack success if this control fails), "recommendation": string }. Shows which control failures would most increase attack success.

18. "predictedNextSteps": Array of 3-4 objects. Each: { "step": string, "probability": number (0-100), "mitreTechnique": string (technique ID), "timeframeMinutes": number, "indicator": string (what to look for in telemetry) }. If the attack reaches the current kill chain stage, what would the attacker do next?

19. "graphEdges": Array of 4-6 objects representing key edges in the attack graph. Each: { "from": string, "to": string, "edgeType": "lateral_movement" | "privilege_escalation" | "data_access" | "trust_relationship" | "network_path", "transitionProbability": number (0-1), "modifiers": string[] (e.g. ["MFA reduces by 60%", "EDR coverage reduces by 40%"]) }.

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

    const userPrompt = `Simulate the following threat scenario using the PSO Engine:

Scenario: ${scenario}
Attack Domain: ${attackDomain}
Attacker Profile: ${attackerProfile}
Target Assets: ${targetAssets.join(", ")}
Simulation Depth: ${depth}/10

Model the environment as a security graph. Run stochastic simulations to identify top attack paths, high-risk nodes, coverage gaps, and generate predictive intelligence. Produce the full PSO Engine structured simulation JSON.`;

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
