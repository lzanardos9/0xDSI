import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

interface TranslationRequest {
  widgets: Array<{
    id: string;
    title: string;
    widgetType: string;
    chartType: string;
    dataSource: {
      type: string;
      originalQuery: string;
    };
  }>;
  sourceTool: string;
  dashboardName: string;
}

async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  responseFormat?: any
): Promise<any> {
  const body: any = {
    model: "gpt-4o",
    messages,
    temperature: 0.3,
    max_tokens: 4096,
  };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function callOpenAIVision(
  messages: Array<{ role: string; content: any }>,
  responseFormat?: any,
  maxTokens = 8192
): Promise<any> {
  const body: any = {
    model: "gpt-4o",
    messages,
    temperature: 0.3,
    max_tokens: maxTokens,
  };
  if (responseFormat) body.response_format = responseFormat;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} - ${err}`);
  }

  const data = await res.json();
  return data.choices[0].message.content;
}

async function getSchemaDescription(supabaseClient: any): Promise<string> {
  const { data: tables } = await supabaseClient.rpc("exec_sql", {
    query: `SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            LIMIT 300`,
  });

  return tables
    ? tables
        .reduce((acc: any[], row: any) => {
          let table = acc.find((t: any) => t.name === row.table_name);
          if (!table) {
            table = { name: row.table_name, columns: [] };
            acc.push(table);
          }
          table.columns.push(`${row.column_name} (${row.data_type})`);
          return acc;
        }, [])
        .map(
          (t: any) => `Table: ${t.name}\n  Columns: ${t.columns.join(", ")}`
        )
        .join("\n\n")
    : "Schema not available - generate reasonable SQL queries for a SOC/SIEM platform";
}

async function analyzeScreenshot(
  imageBase64: string,
  mimeType: string,
  filename: string,
  supabaseClient: any
): Promise<any> {
  const schemaDescription = await getSchemaDescription(supabaseClient);

  const prompt = `You are a dashboard analysis expert. Analyze this screenshot of a dashboard and extract its structure into a precise JSON format.

TARGET DATABASE SCHEMA (PostgreSQL / Supabase) for generating SQL queries:
${schemaDescription}

INSTRUCTIONS:
1. Identify every visible widget/panel/card in the dashboard
2. For each widget determine:
   - Its title (read from the screenshot, or infer from content)
   - The widget type: "chart", "table", "stat", "text", "gauge", "map", or "custom"
   - The chart type (if applicable): "line", "bar", "pie", "area", "heatmap", "scatter", "gauge", "funnel", "donut", "stacked_bar", "stacked_area", "radar", "treemap"
   - Its approximate grid position on a 12-column layout (x: 0-11, y: row index, w: width 1-12, h: height in rows 1-8)
   - A SQL query that would produce the data shown, using ONLY tables from the schema above
   - Colors visible in the widget (as hex codes)
   - Whether it has a legend, and if stacked

3. Also extract:
   - The overall dashboard name/title
   - A description of what the dashboard monitors
   - Any tags/categories that apply

RESPOND WITH ONLY VALID JSON in this exact structure:
{
  "name": "Dashboard Title",
  "description": "What this dashboard shows",
  "tags": ["tag1", "tag2"],
  "widgets": [
    {
      "title": "Widget Title",
      "widgetType": "chart",
      "chartType": "line",
      "position": { "x": 0, "y": 0, "w": 6, "h": 4 },
      "sql": "SELECT ... FROM ... GROUP BY ... ORDER BY ... LIMIT 100",
      "description": "Brief description of what this widget shows",
      "confidence": 0.85,
      "colors": ["#3B82F6", "#10B981"],
      "showLegend": true,
      "stacked": false
    }
  ]
}

RULES:
- Generate valid PostgreSQL SELECT queries using the provided schema tables
- Estimate positions so widgets tile correctly on a 12-column grid without overlap
- Confidence should reflect how certain you are about the widget type and query (0.0-1.0)
- If you cannot determine a query, use a reasonable default for the widget type
- Include ALL visible widgets, even small stat cards or text panels
- Read actual text/numbers from the screenshot where possible`;

  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`,
            detail: "high",
          },
        },
      ],
    },
  ];

  const response = await callOpenAIVision(messages, { type: "json_object" }, 8192);

  let parsed;
  try {
    parsed = JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      parsed = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Failed to parse AI response as JSON");
    }
  }

  const widgets = (parsed.widgets || []).map((w: any, idx: number) => ({
    id: `screenshot-widget-${idx}-${Date.now()}`,
    title: w.title || `Widget ${idx + 1}`,
    description: w.description || "",
    widgetType: w.widgetType || "chart",
    chartType: w.chartType || "bar",
    chartConfig: {
      colors: w.colors || [],
      showLegend: w.showLegend ?? true,
      stacked: w.stacked ?? false,
    },
    dataSource: {
      type: "sql",
      originalQuery: w.sql || "SELECT 1 as value",
      translatedSQL: w.sql || "SELECT 1 as value",
    },
    position: {
      x: w.position?.x ?? (idx % 2) * 6,
      y: w.position?.y ?? Math.floor(idx / 2) * 4,
      w: w.position?.w ?? 6,
      h: w.position?.h ?? 4,
    },
    translationConfidence: w.confidence ?? 0.7,
  }));

  const dashboard = {
    metadata: {
      name: parsed.name || `Imported from ${filename}`,
      description: parsed.description || "Dashboard recreated from screenshot",
      sourceTool: "screenshot",
      sourceVersion: "ai-vision",
      importedAt: new Date().toISOString(),
      tags: parsed.tags || ["imported", "screenshot"],
    },
    variables: [],
    layout: { columns: 12, rowHeight: 80 },
    widgets,
  };

  const warnings: string[] = [];
  if (widgets.length === 0) {
    warnings.push("No widgets could be detected in the screenshot");
  }
  const lowConfidence = widgets.filter((w: any) => w.translationConfidence < 0.5);
  if (lowConfidence.length > 0) {
    warnings.push(`${lowConfidence.length} widget(s) have low confidence and may need manual review`);
  }

  return { success: true, dashboard, warnings };
}

function generateFallbackScreenshotDashboard(filename: string): any {
  const now = Date.now();
  const widgets = [
    { id: `ss-fb-0-${now}`, title: "Total Events (24h)", widgetType: "stat", chartConfig: { colors: ["#3B82F6"] },
      dataSource: { type: "sql", originalQuery: "SELECT COUNT(*) as total_count FROM events WHERE event_timestamp > now() - interval '24 hours'", translatedSQL: "SELECT COUNT(*) as total_count FROM events WHERE event_timestamp > now() - interval '24 hours'" },
      position: { x: 0, y: 0, w: 3, h: 2 }, translationConfidence: 0.6 },
    { id: `ss-fb-1-${now}`, title: "Critical Alerts", widgetType: "stat", chartConfig: { colors: ["#EF4444"] },
      dataSource: { type: "sql", originalQuery: "SELECT COUNT(*) as critical_count FROM alerts WHERE severity = 'critical' AND status = 'new'", translatedSQL: "SELECT COUNT(*) as critical_count FROM alerts WHERE severity = 'critical' AND status = 'new'" },
      position: { x: 3, y: 0, w: 3, h: 2 }, translationConfidence: 0.6 },
    { id: `ss-fb-2-${now}`, title: "Open Cases", widgetType: "stat", chartConfig: { colors: ["#F59E0B"] },
      dataSource: { type: "sql", originalQuery: "SELECT COUNT(*) as open_cases FROM cases WHERE status IN ('open', 'in_progress')", translatedSQL: "SELECT COUNT(*) as open_cases FROM cases WHERE status IN ('open', 'in_progress')" },
      position: { x: 6, y: 0, w: 3, h: 2 }, translationConfidence: 0.6 },
    { id: `ss-fb-3-${now}`, title: "Risk Score", widgetType: "gauge", chartType: "gauge", chartConfig: { colors: ["#10B981", "#F59E0B", "#EF4444"] },
      dataSource: { type: "sql", originalQuery: "SELECT ROUND(AVG(CASE WHEN severity = 'critical' THEN 100 WHEN severity = 'high' THEN 75 WHEN severity = 'medium' THEN 50 ELSE 25 END)) as risk_score FROM events WHERE event_timestamp > now() - interval '1 hour'", translatedSQL: "SELECT ROUND(AVG(CASE WHEN severity = 'critical' THEN 100 WHEN severity = 'high' THEN 75 WHEN severity = 'medium' THEN 50 ELSE 25 END)) as risk_score FROM events WHERE event_timestamp > now() - interval '1 hour'" },
      position: { x: 9, y: 0, w: 3, h: 2 }, translationConfidence: 0.6 },
    { id: `ss-fb-4-${now}`, title: "Events Over Time", widgetType: "chart", chartType: "area", chartConfig: { colors: ["#3B82F6", "#10B981"], showLegend: true },
      dataSource: { type: "sql", originalQuery: "SELECT date_trunc('hour', event_timestamp) as time_bucket, COUNT(*) as event_count FROM events WHERE event_timestamp > now() - interval '24 hours' GROUP BY time_bucket ORDER BY time_bucket", translatedSQL: "SELECT date_trunc('hour', event_timestamp) as time_bucket, COUNT(*) as event_count FROM events WHERE event_timestamp > now() - interval '24 hours' GROUP BY time_bucket ORDER BY time_bucket" },
      position: { x: 0, y: 2, w: 8, h: 4 }, translationConfidence: 0.6 },
    { id: `ss-fb-5-${now}`, title: "Severity Distribution", widgetType: "chart", chartType: "donut", chartConfig: { colors: ["#EF4444", "#F59E0B", "#3B82F6", "#10B981"], showLegend: true },
      dataSource: { type: "sql", originalQuery: "SELECT severity, COUNT(*) as count FROM events GROUP BY severity ORDER BY count DESC", translatedSQL: "SELECT severity, COUNT(*) as count FROM events GROUP BY severity ORDER BY count DESC" },
      position: { x: 8, y: 2, w: 4, h: 4 }, translationConfidence: 0.6 },
    { id: `ss-fb-6-${now}`, title: "Recent Events", widgetType: "table", chartConfig: {},
      dataSource: { type: "sql", originalQuery: "SELECT id, event_type, severity, source_ip, dest_ip, event_timestamp FROM events ORDER BY event_timestamp DESC LIMIT 50", translatedSQL: "SELECT id, event_type, severity, source_ip, dest_ip, event_timestamp FROM events ORDER BY event_timestamp DESC LIMIT 50" },
      position: { x: 0, y: 6, w: 12, h: 4 }, translationConfidence: 0.6 },
  ];

  return {
    success: true,
    dashboard: {
      metadata: { name: `Imported from ${filename}`, description: "Dashboard recreated from screenshot (fallback - no AI key configured)", sourceTool: "screenshot", sourceVersion: "fallback", importedAt: new Date().toISOString(), tags: ["imported", "screenshot", "fallback"] },
      variables: [],
      layout: { columns: 12, rowHeight: 80 },
      widgets,
    },
    warnings: ["OpenAI API key not configured - using fallback template dashboard. Configure OPENAI_API_KEY for AI-powered screenshot analysis."],
  };
}

async function translateQueries(
  req: TranslationRequest,
  supabase: any
): Promise<any[]> {
  const { data: tables } = await supabase.rpc("exec_sql", {
    query: `SELECT table_name, column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = 'public'
            ORDER BY table_name, ordinal_position
            LIMIT 300`,
  });

  const schemaDescription = tables
    ? tables
        .reduce((acc: any[], row: any) => {
          let table = acc.find((t: any) => t.name === row.table_name);
          if (!table) {
            table = { name: row.table_name, columns: [] };
            acc.push(table);
          }
          table.columns.push(`${row.column_name} (${row.data_type})`);
          return acc;
        }, [])
        .map(
          (t: any) => `Table: ${t.name}\n  Columns: ${t.columns.join(", ")}`
        )
        .join("\n\n")
    : "Schema not available - generate reasonable SQL queries for a SOC/SIEM platform";

  const widgetsWithQueries = req.widgets.filter(
    (w) => w.dataSource.originalQuery && w.dataSource.originalQuery.trim()
  );

  if (widgetsWithQueries.length === 0) {
    return req.widgets.map((w) => ({
      id: w.id,
      translatedSQL: "SELECT 1 as value",
      confidence: 0.5,
      notes: "No original query to translate",
    }));
  }

  const batchSize = 8;
  const results: any[] = [];

  for (let i = 0; i < widgetsWithQueries.length; i += batchSize) {
    const batch = widgetsWithQueries.slice(i, i + batchSize);

    const prompt = `You are a database query translator for a Security Operations Center (SOC) platform.

TARGET DATABASE SCHEMA (PostgreSQL / Supabase):
${schemaDescription}

SOURCE TOOL: ${req.sourceTool}
DASHBOARD: ${req.dashboardName}

Translate each widget's original query into a valid PostgreSQL SELECT statement that works with the target schema above.

RULES:
- Output ONLY valid PostgreSQL SELECT statements
- If the original query references tables/fields not in the schema, find the closest equivalent
- For PromQL metrics, translate to time-series SELECT with date_trunc grouping
- For SPL queries, translate search commands to SQL WHERE/GROUP BY/ORDER BY
- For Lucene/KQL, translate to SQL with LIKE/ILIKE or text search
- For aggregations (count, sum, avg), use SQL aggregate functions
- Always include a reasonable LIMIT (max 1000)
- If translation is impossible, return a sensible mock query with a comment explaining why
- Return valid JSON array

WIDGETS TO TRANSLATE:
${batch
  .map(
    (w, idx) => `[${idx}] Title: "${w.title}"
  Type: ${w.widgetType} / ${w.chartType}
  Query Language: ${w.dataSource.type}
  Original Query:
  ${w.dataSource.originalQuery.substring(0, 800)}`
  )
  .join("\n\n")}

Respond with a JSON array where each element has:
- "id": the widget id
- "translatedSQL": the PostgreSQL query
- "confidence": 0.0-1.0 confidence score
- "notes": brief explanation of translation choices`;

    try {
      const response = await callOpenAI(
        [{ role: "user", content: prompt }],
        { type: "json_object" }
      );

      let parsed;
      try {
        parsed = JSON.parse(response);
      } catch {
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
      }

      const translations = parsed.translations || parsed.results || parsed;
      if (Array.isArray(translations)) {
        results.push(...translations);
      }
    } catch (error: any) {
      for (const w of batch) {
        results.push({
          id: w.id,
          translatedSQL: `/* Translation failed: ${error.message} */\nSELECT 1 as value`,
          confidence: 0.1,
          notes: `Error: ${error.message}`,
        });
      }
    }
  }

  const translationMap = new Map(results.map((r: any) => [r.id, r]));
  return req.widgets.map((w) => {
    const translation = translationMap.get(w.id);
    if (translation) return translation;
    return {
      id: w.id,
      translatedSQL: "SELECT 1 as value",
      confidence: 0.5,
      notes: "No query to translate",
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const body = await req.json();
    const { action } = body;

    if (action === "analyze_screenshot") {
      const { image_base64, mime_type, filename } = body;

      if (!image_base64) {
        return new Response(
          JSON.stringify({ success: false, error: "No image data provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!OPENAI_API_KEY) {
        const fallback = generateFallbackScreenshotDashboard(filename || "screenshot.png");
        return new Response(JSON.stringify(fallback), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const result = await analyzeScreenshot(
        image_base64,
        mime_type || "image/png",
        filename || "screenshot.png",
        supabase
      );

      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "translate") {
      if (!OPENAI_API_KEY) {
        return new Response(
          JSON.stringify({
            success: false,
            error: "OpenAI API key not configured",
            translations: body.widgets.map((w: any) => ({
              id: w.id,
              translatedSQL: generateFallbackSQL(w),
              confidence: 0.6,
              notes: "Generated using rule-based translation (no LLM available)",
            })),
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const translations = await translateQueries(body, supabase);
      return new Response(
        JSON.stringify({ success: true, translations }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "save_migration") {
      const { migration_id, status, translated_schema, confidence_score } =
        body;
      const { error } = await supabase
        .from("dashboard_migrations")
        .update({
          translation_status: status,
          translated_schema,
          confidence_score,
        })
        .eq("id", migration_id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ success: true }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "generate_widget_query") {
      const { description, widgetType, chartType } = body;

      if (!OPENAI_API_KEY) {
        return new Response(
          JSON.stringify({
            success: true,
            sql: generateFallbackFromDescription(description, widgetType),
            confidence: 0.6,
          }),
          {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const { data: tables } = await supabase.rpc("exec_sql", {
        query: `SELECT table_name, column_name, data_type
                FROM information_schema.columns
                WHERE table_schema = 'public'
                ORDER BY table_name, ordinal_position
                LIMIT 300`,
      });

      const schemaDescription = tables
        ? tables
            .reduce((acc: any[], row: any) => {
              let table = acc.find((t: any) => t.name === row.table_name);
              if (!table) {
                table = { name: row.table_name, columns: [] };
                acc.push(table);
              }
              table.columns.push(`${row.column_name} (${row.data_type})`);
              return acc;
            }, [])
            .map(
              (t: any) =>
                `Table: ${t.name}\n  Columns: ${t.columns.join(", ")}`
            )
            .join("\n\n")
        : "";

      const response = await callOpenAI([
        {
          role: "user",
          content: `You are a SQL query generator for a SOC/SIEM platform dashboard.

DATABASE SCHEMA:
${schemaDescription}

Generate a PostgreSQL SELECT query for this dashboard widget:
- Description: ${description}
- Widget Type: ${widgetType}
- Chart Type: ${chartType}

Rules:
- Return ONLY the SQL query, no explanations
- Include appropriate GROUP BY for charts
- Include ORDER BY for meaningful ordering
- LIMIT to reasonable row count
- Use tables/columns that exist in the schema`,
        },
      ]);

      const sql = response
        .replace(/```sql\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      return new Response(
        JSON.stringify({ success: true, sql, confidence: 0.85 }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateFallbackSQL(widget: any): string {
  const type = widget.widgetType;
  const chart = widget.chartType;

  if (type === "stat") {
    return "SELECT COUNT(*) as total_count FROM events WHERE event_timestamp > now() - interval '24 hours'";
  }
  if (type === "table") {
    return "SELECT id, event_type, severity, source_ip, dest_ip, event_timestamp FROM events ORDER BY event_timestamp DESC LIMIT 50";
  }
  if (chart === "pie" || chart === "donut") {
    return "SELECT severity, COUNT(*) as count FROM events GROUP BY severity ORDER BY count DESC";
  }
  if (chart === "line" || chart === "area") {
    return "SELECT date_trunc('hour', event_timestamp) as time_bucket, COUNT(*) as event_count FROM events WHERE event_timestamp > now() - interval '24 hours' GROUP BY time_bucket ORDER BY time_bucket";
  }
  if (chart === "bar" || chart === "stacked_bar") {
    return "SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type ORDER BY count DESC LIMIT 10";
  }
  if (chart === "heatmap") {
    return "SELECT date_trunc('hour', event_timestamp) as hour, severity, COUNT(*) as count FROM events GROUP BY hour, severity ORDER BY hour";
  }
  if (type === "gauge") {
    return "SELECT ROUND(AVG(CASE WHEN severity = 'critical' THEN 100 WHEN severity = 'high' THEN 75 WHEN severity = 'medium' THEN 50 ELSE 25 END)) as risk_score FROM events WHERE event_timestamp > now() - interval '1 hour'";
  }
  return "SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type ORDER BY count DESC LIMIT 10";
}

function generateFallbackFromDescription(
  description: string,
  widgetType: string
): string {
  const desc = description.toLowerCase();
  if (desc.includes("alert")) {
    if (widgetType === "stat")
      return "SELECT COUNT(*) as total FROM alerts WHERE status = 'new'";
    return "SELECT severity, COUNT(*) as count FROM alerts GROUP BY severity ORDER BY count DESC";
  }
  if (desc.includes("event")) {
    if (widgetType === "stat")
      return "SELECT COUNT(*) as total FROM events WHERE event_timestamp > now() - interval '24 hours'";
    return "SELECT date_trunc('hour', event_timestamp) as time_bucket, COUNT(*) as count FROM events WHERE event_timestamp > now() - interval '24 hours' GROUP BY time_bucket ORDER BY time_bucket";
  }
  if (desc.includes("case") || desc.includes("incident")) {
    return "SELECT status, COUNT(*) as count FROM cases GROUP BY status ORDER BY count DESC";
  }
  if (desc.includes("user") || desc.includes("behavior")) {
    return "SELECT risk_level, COUNT(*) as count FROM user_behavior_profiles GROUP BY risk_level ORDER BY count DESC";
  }
  if (desc.includes("vulnerab") || desc.includes("cve")) {
    return "SELECT severity, COUNT(*) as count FROM asset_vulnerabilities GROUP BY severity ORDER BY count DESC";
  }
  return "SELECT event_type, COUNT(*) as count FROM events GROUP BY event_type ORDER BY count DESC LIMIT 10";
}
