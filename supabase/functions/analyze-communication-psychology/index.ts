import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const MODEL_VERSION = "psycholinguistic-core-v2.4";

const CHANNEL_LABELS: Record<string, string> = {
  email: "email message",
  slack: "Slack message",
  teams: "Microsoft Teams message",
  sms: "SMS / text message",
  call_transcript: "call recording transcript",
  chat: "chat message",
  other: "communication",
};

function clampScore(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function riskClassification(score: number): string {
  if (score >= 85) return "critical";
  if (score >= 70) return "high";
  if (score >= 45) return "elevated";
  if (score >= 25) return "moderate";
  return "low";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Assessment model is not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const text: string = typeof body.text === "string" ? body.text.trim() : "";
    const channel: string =
      typeof body.channel === "string" ? body.channel : "other";
    const subjectLabel: string =
      typeof body.subjectLabel === "string" ? body.subjectLabel.trim() : "";

    if (!text || text.length < 20) {
      return new Response(
        JSON.stringify({
          error: "Please provide at least a short passage of text to assess.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const channelLabel = CHANNEL_LABELS[channel] || CHANNEL_LABELS.other;

    const systemPrompt = `You are an internal psycholinguistic assessment engine used by a security operations team to evaluate written and transcribed communications for behavioral risk signals. You analyze the language, tone, framing, and interpersonal dynamics of a passage and estimate psychological trait indicators.

You score two established frameworks plus supporting behavioral indicators, each on a 0-100 scale:

Big Five (OCEAN):
- openness, conscientiousness, extraversion, agreeableness, neuroticism

Dark Triad:
- narcissism, machiavellianism, psychopathy

Behavioral risk indicators:
- manipulation, deception, impulsivity, aggression

Guidelines:
- Base every score strictly on linguistic and behavioral evidence in the passage. Do not invent facts about the person.
- Higher Dark Triad and behavioral scores indicate stronger risk signals; higher agreeableness and conscientiousness generally indicate lower risk.
- overall_risk_score is a holistic 0-100 estimate of behavioral risk conveyed by this text.
- confidence_score reflects how much reliable signal the passage contains (short or neutral text = lower confidence).
- key_indicators: 3-6 short phrases naming concrete linguistic or behavioral signals you observed (e.g. "blame-shifting language", "grandiose self-reference", "coercive framing").
- summary: 2-4 sentence professional narrative describing what the language suggests and the main risk considerations. Never claim clinical diagnosis; frame as indicators only.
- dominant_emotion: single word/short phrase for the primary emotional tone.
- communication_style: short descriptor (e.g. "assertive and transactional").

Respond with ONLY a valid JSON object, no markdown, no commentary, using exactly these keys:
{
  "openness": int, "conscientiousness": int, "extraversion": int, "agreeableness": int, "neuroticism": int,
  "narcissism": int, "machiavellianism": int, "psychopathy": int,
  "manipulation": int, "deception": int, "impulsivity": int, "aggression": int,
  "overall_risk_score": int, "confidence_score": int,
  "dominant_emotion": string, "communication_style": string,
  "key_indicators": string[], "summary": string
}`;

    const userPrompt = `Source channel: ${channelLabel}${
      subjectLabel ? `\nSubject: ${subjectLabel}` : ""
    }\n\nPassage to assess:\n"""\n${text.slice(0, 12000)}\n"""`;

    const aiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.2,
          max_tokens: 900,
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      return new Response(
        JSON.stringify({
          error: "The assessment model could not complete the analysis.",
          details: errText.slice(0, 500),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const completion = await aiResponse.json();
    const raw = completion.choices?.[0]?.message?.content || "{}";

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const overall = clampScore(parsed.overall_risk_score);

    const indicators = Array.isArray(parsed.key_indicators)
      ? parsed.key_indicators
          .filter((i: unknown) => typeof i === "string")
          .slice(0, 8)
      : [];

    const assessment = {
      subject_label: subjectLabel,
      source_channel: channel,
      input_text: text.slice(0, 20000),
      input_char_count: text.length,
      openness: clampScore(parsed.openness),
      conscientiousness: clampScore(parsed.conscientiousness),
      extraversion: clampScore(parsed.extraversion),
      agreeableness: clampScore(parsed.agreeableness),
      neuroticism: clampScore(parsed.neuroticism),
      narcissism: clampScore(parsed.narcissism),
      machiavellianism: clampScore(parsed.machiavellianism),
      psychopathy: clampScore(parsed.psychopathy),
      manipulation: clampScore(parsed.manipulation),
      deception: clampScore(parsed.deception),
      impulsivity: clampScore(parsed.impulsivity),
      aggression: clampScore(parsed.aggression),
      overall_risk_score: overall,
      risk_classification: riskClassification(overall),
      dominant_emotion:
        typeof parsed.dominant_emotion === "string"
          ? parsed.dominant_emotion.slice(0, 80)
          : "",
      communication_style:
        typeof parsed.communication_style === "string"
          ? parsed.communication_style.slice(0, 160)
          : "",
      summary:
        typeof parsed.summary === "string" ? parsed.summary.slice(0, 2000) : "",
      key_indicators: indicators,
      confidence_score: clampScore(parsed.confidence_score),
      model_version: MODEL_VERSION,
    };

    const { data: saved, error: dbError } = await supabase
      .from("psychometric_text_assessments")
      .insert(assessment)
      .select()
      .maybeSingle();

    if (dbError) {
      return new Response(
        JSON.stringify({
          error: "The assessment was generated but could not be saved.",
          assessment,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ assessment: saved || assessment }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
