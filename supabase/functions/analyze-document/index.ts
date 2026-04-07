import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { documentText, documentName, documentType = "penetration_test" } =
      await req.json();

    if (!documentText) {
      return new Response(
        JSON.stringify({ error: "documentText is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: existingAssets } = await supabase
      .from("asset_registry")
      .select("id, hostname, asset_type, criticality, ip_address, os_type")
      .limit(100);

    const { data: existingVulns } = await supabase
      .from("vulnerabilities")
      .select("id, title, severity, status, cvss_score, affected_asset")
      .limit(100);

    const analysisPrompt =
      documentType === "penetration_test"
        ? `You are a senior security analyst reviewing a penetration test report. Analyze the following document and extract structured security findings.

EXISTING ASSETS IN OUR SYSTEM:
${JSON.stringify(existingAssets || [], null, 2)}

EXISTING VULNERABILITIES IN OUR SYSTEM:
${JSON.stringify(existingVulns || [], null, 2)}

DOCUMENT TO ANALYZE:
---
${documentText.substring(0, 12000)}
---

Extract and return a JSON object with this exact structure:
{
  "summary": "Brief executive summary of the report (2-3 sentences)",
  "risk_rating": "critical|high|medium|low",
  "findings": [
    {
      "title": "Finding title",
      "severity": "critical|high|medium|low",
      "cvss_score": 0.0,
      "description": "Detailed description",
      "affected_assets": ["hostname or IP that matches existing assets if possible"],
      "remediation": "Recommended fix",
      "category": "network|application|infrastructure|social_engineering|physical"
    }
  ],
  "asset_enrichments": [
    {
      "asset_identifier": "hostname or IP matching an existing asset",
      "new_vulnerabilities": ["list of vulnerability titles found for this asset"],
      "risk_change": "increased|decreased|unchanged",
      "notes": "Additional context from the pentest about this asset"
    }
  ],
  "executive_recommendations": [
    "Prioritized recommendation 1",
    "Prioritized recommendation 2"
  ],
  "compliance_impacts": [
    {
      "framework": "SOC2|ISO27001|HIPAA|GDPR|PCI-DSS",
      "impact": "Description of compliance impact"
    }
  ]
}`
        : `You are a senior security analyst reviewing a Business Impact Analysis (BIA) document. Analyze the following document and extract structured findings.

EXISTING ASSETS IN OUR SYSTEM:
${JSON.stringify(existingAssets || [], null, 2)}

DOCUMENT TO ANALYZE:
---
${documentText.substring(0, 12000)}
---

Extract and return a JSON object with this exact structure:
{
  "summary": "Brief executive summary of the BIA (2-3 sentences)",
  "risk_rating": "critical|high|medium|low",
  "findings": [
    {
      "title": "Business process or system identified",
      "severity": "critical|high|medium|low",
      "description": "Impact description",
      "affected_assets": ["hostname or system name matching existing assets if possible"],
      "rto_hours": 0,
      "rpo_hours": 0,
      "financial_impact": "$X per hour/day",
      "category": "financial|operational|reputational|regulatory"
    }
  ],
  "asset_enrichments": [
    {
      "asset_identifier": "hostname or system matching an existing asset",
      "business_criticality": "critical|high|medium|low",
      "dependencies": ["other systems this depends on"],
      "notes": "Business context from the BIA about this asset"
    }
  ],
  "executive_recommendations": [
    "Prioritized recommendation 1",
    "Prioritized recommendation 2"
  ],
  "compliance_impacts": [
    {
      "framework": "SOC2|ISO27001|HIPAA|GDPR|PCI-DSS",
      "impact": "Description of compliance impact"
    }
  ]
}`;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content:
                "You are a cybersecurity document analyst. Always respond with valid JSON only, no markdown fences or extra text.",
            },
            { role: "user", content: analysisPrompt },
          ],
          temperature: 0.3,
          max_tokens: 4000,
          response_format: { type: "json_object" },
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      return new Response(
        JSON.stringify({ error: "OpenAI API error", details: errBody }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const completion = await openaiResponse.json();
    const rawContent =
      completion.choices?.[0]?.message?.content || "{}";

    let analysis;
    try {
      analysis = JSON.parse(rawContent);
    } catch {
      analysis = { summary: rawContent, findings: [], asset_enrichments: [] };
    }

    return new Response(
      JSON.stringify({
        analysis,
        document_name: documentName,
        document_type: documentType,
        tokens_used: completion.usage?.total_tokens || 0,
        analyzed_at: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
