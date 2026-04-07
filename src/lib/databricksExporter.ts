import type { UniversalDashboard, UniversalWidget, ChartType } from './dashboardSchema';

export interface DatabricksConfig {
  catalog: string;
  schema: string;
  warehouse_id: string;
  export_format: 'sql_dashboard' | 'lakeview' | 'notebook' | 'all';
}

interface TableMapping {
  originalTable: string;
  databricksTable: string;
}

const DEFAULT_TABLE_MAPPINGS: Record<string, string> = {
  events: 'security_events',
  alerts: 'security_alerts',
  cases: 'security_cases',
  threat_feeds: 'threat_intelligence_feeds',
  ioc_indicators: 'ioc_indicators',
  asset_vulnerabilities: 'vulnerability_findings',
  user_behavior_profiles: 'user_behavior_analytics',
  correlation_rules: 'correlation_rules',
  malware_samples: 'malware_analysis_samples',
  response_actions: 'soar_response_actions',
  sessions: 'session_tracking',
  active_lists: 'active_context_lists',
  network_assets: 'network_asset_inventory',
  compliance_findings: 'compliance_findings',
};

function rewriteSQL(sql: string, config: DatabricksConfig): string {
  let rewritten = sql;
  const prefix = `${config.catalog}.${config.schema}`;

  const tablePattern = /\b(FROM|JOIN|INTO|UPDATE)\s+(\w+)/gi;
  rewritten = rewritten.replace(tablePattern, (match, keyword, table) => {
    const mapped = DEFAULT_TABLE_MAPPINGS[table.toLowerCase()] || table;
    return `${keyword} ${prefix}.${mapped}`;
  });

  rewritten = rewritten.replace(/now\(\)/gi, 'current_timestamp()');
  rewritten = rewritten.replace(/gen_random_uuid\(\)/gi, 'uuid()');
  rewritten = rewritten.replace(/\bILIKE\b/gi, 'LIKE');
  rewritten = rewritten.replace(/::text/gi, '');
  rewritten = rewritten.replace(/::integer/gi, '');
  rewritten = rewritten.replace(/::numeric/gi, '');
  rewritten = rewritten.replace(/::timestamptz/gi, '');
  rewritten = rewritten.replace(/::jsonb/gi, '');

  rewritten = rewritten.replace(
    /date_trunc\(\s*'(\w+)'\s*,\s*(\w+)\s*\)/gi,
    'date_trunc("$1", $2)'
  );

  rewritten = rewritten.replace(
    /(\w+)\s*>\s*now\(\)\s*-\s*interval\s*'([^']+)'/gi,
    "$1 > current_timestamp() - INTERVAL '$2'"
  );

  return rewritten;
}

function chartTypeToDbxVisualization(chartType?: ChartType): string {
  const map: Record<string, string> = {
    line: 'LINE',
    bar: 'BAR',
    area: 'AREA',
    pie: 'PIE',
    donut: 'PIE',
    stacked_bar: 'BAR',
    stacked_area: 'AREA',
    heatmap: 'HEATMAP',
    scatter: 'SCATTER',
    gauge: 'COUNTER',
    funnel: 'FUNNEL',
    radar: 'BAR',
    treemap: 'BAR',
  };
  return map[chartType || 'bar'] || 'BAR';
}

export function generateSQLDashboard(
  dashboard: UniversalDashboard,
  config: DatabricksConfig
): string {
  const queries = dashboard.widgets.map((widget, i) => {
    const sql = widget.dataSource.translatedSQL || widget.dataSource.originalQuery || 'SELECT 1 AS value';
    const rewritten = rewriteSQL(sql, config);

    return {
      id: `q_${i + 1}`,
      name: widget.title.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase(),
      query: rewritten,
      visualization: {
        type: widget.widgetType === 'table' ? 'TABLE' :
              widget.widgetType === 'stat' ? 'COUNTER' :
              widget.widgetType === 'gauge' ? 'COUNTER' :
              chartTypeToDbxVisualization(widget.chartType),
        options: {
          ...(widget.chartConfig.stacked ? { stacking: 'stack' } : {}),
          ...(widget.chartConfig.showLegend === false ? { legend: { enabled: false } } : {}),
          ...(widget.chartConfig.colors?.length ? {
            colorMapping: Object.fromEntries(
              widget.chartConfig.colors.map((c, idx) => [`series_${idx}`, c])
            ),
          } : {}),
        },
      },
      position: {
        x: widget.position.x,
        y: widget.position.y,
        width: widget.position.w,
        height: widget.position.h,
      },
    };
  });

  const dbxDashboard = {
    version: '2',
    name: dashboard.metadata.name,
    description: dashboard.metadata.description || `Migrated from ${dashboard.metadata.sourceTool}`,
    warehouse_id: config.warehouse_id || '{{WAREHOUSE_ID}}',
    tags: [
      ...dashboard.metadata.tags,
      `source:${dashboard.metadata.sourceTool}`,
      'migrated',
      'databricks-ready',
    ],
    parameters: dashboard.variables.map(v => ({
      name: v.name,
      title: v.label || v.name,
      type: v.type === 'time_range' ? 'datetime-range' : 'text',
      value: v.defaultValue,
    })),
    queries,
    layout: {
      columns: dashboard.layout.columns,
      widgets: queries.map(q => ({
        query_id: q.id,
        position: q.position,
        visualization_id: `v_${q.id}`,
      })),
    },
    created_at: new Date().toISOString(),
    metadata: {
      source_tool: dashboard.metadata.sourceTool,
      migration_date: new Date().toISOString(),
      catalog: config.catalog,
      schema: config.schema,
    },
  };

  return JSON.stringify(dbxDashboard, null, 2);
}

export function generateLakeviewDashboard(
  dashboard: UniversalDashboard,
  config: DatabricksConfig
): string {
  const datasets = dashboard.widgets.map((widget, i) => {
    const sql = widget.dataSource.translatedSQL || widget.dataSource.originalQuery || 'SELECT 1 AS value';
    const rewritten = rewriteSQL(sql, config);

    return {
      name: `dataset_${i}`,
      displayName: widget.title,
      query: rewritten,
    };
  });

  const pages = [{
    name: 'page_1',
    displayName: dashboard.metadata.name,
    layout: dashboard.widgets.map((widget, i) => {
      const vizType = widget.widgetType === 'table' ? 'table' :
                      widget.widgetType === 'stat' ? 'counter' :
                      widget.widgetType === 'text' ? 'text' :
                      widget.widgetType === 'gauge' ? 'counter' :
                      chartTypeToDbxVisualization(widget.chartType).toLowerCase();

      return {
        widget: {
          name: `widget_${i}`,
          textbox_spec: widget.widgetType === 'text' ? widget.title : undefined,
          queries: widget.widgetType !== 'text' ? [{
            name: `query_${i}`,
            query: {
              datasetName: `dataset_${i}`,
              fields: [],
              disaggregated: false,
            },
          }] : undefined,
          spec: {
            version: 3,
            widgetType: vizType,
            encodings: buildLakeviewEncodings(widget),
            frame: {
              showTitle: true,
              title: widget.title,
              showDescription: !!widget.description,
              description: widget.description || '',
            },
          },
        },
        position: {
          x: widget.position.x,
          y: widget.position.y,
          width: widget.position.w,
          height: widget.position.h,
        },
      };
    }),
  }];

  const lakeviewDashboard = {
    displayName: dashboard.metadata.name,
    warehouse_id: config.warehouse_id || '{{WAREHOUSE_ID}}',
    datasets,
    pages,
    metadata: {
      source_tool: dashboard.metadata.sourceTool,
      migration_date: new Date().toISOString(),
      catalog: config.catalog,
      schema: config.schema,
    },
  };

  return JSON.stringify(lakeviewDashboard, null, 2);
}

function buildLakeviewEncodings(widget: UniversalWidget): Record<string, any> {
  const encodings: Record<string, any> = {};

  if (widget.widgetType === 'chart') {
    encodings.x = { fieldName: '', scale: { type: 'categorical' } };
    encodings.y = { fieldName: '', scale: { type: 'quantitative' } };
    if (widget.chartConfig.colors?.length) {
      encodings.color = { fieldName: '', scale: { range: widget.chartConfig.colors } };
    }
  }

  if (widget.widgetType === 'stat' || widget.widgetType === 'gauge') {
    encodings.value = { fieldName: '' };
  }

  return encodings;
}

export function generateNotebook(
  dashboard: UniversalDashboard,
  config: DatabricksConfig
): string {
  const cells: string[] = [];

  cells.push(`# Databricks notebook source
# MAGIC %md
# MAGIC # ${dashboard.metadata.name}
# MAGIC ## Dashboard Notebook - Databricks Ready
# MAGIC
# MAGIC **Source:** ${dashboard.metadata.sourceTool} | **Migrated:** ${new Date().toISOString().split('T')[0]}
# MAGIC
# MAGIC **Catalog:** \`${config.catalog}\` | **Schema:** \`${config.schema}\`
# MAGIC
# MAGIC This notebook was auto-generated from a migrated dashboard.
# MAGIC Each cell contains a widget query that can be visualized using Databricks native charting.
# MAGIC
# MAGIC ---`);

  cells.push(`# COMMAND ----------

# MAGIC %md
# MAGIC ### Setup: Configure Unity Catalog Context`);

  cells.push(`# COMMAND ----------

spark.sql("USE CATALOG ${config.catalog}")
spark.sql("USE SCHEMA ${config.schema}")
print(f"Context set: ${config.catalog}.${config.schema}")`);

  const tableCreations = new Set<string>();
  dashboard.widgets.forEach(widget => {
    const sql = widget.dataSource.translatedSQL || widget.dataSource.originalQuery || '';
    const tableMatches = sql.match(/\bFROM\s+(\w+)/gi);
    if (tableMatches) {
      tableMatches.forEach(m => {
        const table = m.replace(/FROM\s+/i, '').toLowerCase();
        if (DEFAULT_TABLE_MAPPINGS[table]) {
          tableCreations.add(table);
        }
      });
    }
  });

  if (tableCreations.size > 0) {
    cells.push(`# COMMAND ----------

# MAGIC %md
# MAGIC ### Delta Table Verification
# MAGIC Ensure all required tables exist in Unity Catalog`);

    cells.push(`# COMMAND ----------

required_tables = [
${Array.from(tableCreations).map(t => {
    const mapped = DEFAULT_TABLE_MAPPINGS[t] || t;
    return `    "${mapped}",`;
  }).join('\n')}
]

for table in required_tables:
    try:
        count = spark.table(f"${config.catalog}.${config.schema}.{table}").count()
        print(f"  {table}: {count:,} rows")
    except Exception as e:
        print(f"  {table}: NOT FOUND - {str(e)[:80]}")`);
  }

  dashboard.widgets.forEach((widget, i) => {
    const sql = widget.dataSource.translatedSQL || widget.dataSource.originalQuery;
    if (!sql) return;

    const rewritten = rewriteSQL(sql, config);

    cells.push(`# COMMAND ----------

# MAGIC %md
# MAGIC ### Widget ${i + 1}: ${widget.title}
# MAGIC **Type:** ${widget.widgetType}${widget.chartType ? ` / ${widget.chartType}` : ''}${
      widget.description ? `\n# MAGIC \n# MAGIC ${widget.description}` : ''
    }`);

    if (widget.widgetType === 'table' || widget.widgetType === 'text') {
      cells.push(`# COMMAND ----------

# MAGIC %sql
${rewritten.split('\n').map(line => `# MAGIC ${line}`).join('\n')}`);
    } else {
      const dfName = `df_widget_${i + 1}`;
      cells.push(`# COMMAND ----------

${dfName} = spark.sql("""
${rewritten}
""")
display(${dfName})`);
    }
  });

  cells.push(`# COMMAND ----------

# MAGIC %md
# MAGIC ---
# MAGIC ### Export Summary
# MAGIC
# MAGIC | Metric | Value |
# MAGIC |--------|-------|
# MAGIC | Total Widgets | ${dashboard.widgets.length} |
# MAGIC | Source Platform | ${dashboard.metadata.sourceTool} |
# MAGIC | Target Catalog | ${config.catalog} |
# MAGIC | Target Schema | ${config.schema} |
# MAGIC | Generated | ${new Date().toISOString()} |`);

  return cells.join('\n\n');
}

export function generateDDLMigration(
  dashboard: UniversalDashboard,
  config: DatabricksConfig
): string {
  const tables = new Set<string>();
  dashboard.widgets.forEach(widget => {
    const sql = widget.dataSource.translatedSQL || widget.dataSource.originalQuery || '';
    const matches = sql.match(/\bFROM\s+(\w+)/gi);
    if (matches) {
      matches.forEach(m => {
        tables.add(m.replace(/FROM\s+/i, '').toLowerCase());
      });
    }
  });

  const lines = [
    `-- DDL Migration Script for: ${dashboard.metadata.name}`,
    `-- Source: ${dashboard.metadata.sourceTool}`,
    `-- Generated: ${new Date().toISOString()}`,
    `-- Target: ${config.catalog}.${config.schema}`,
    '',
    `CREATE CATALOG IF NOT EXISTS ${config.catalog};`,
    `CREATE SCHEMA IF NOT EXISTS ${config.catalog}.${config.schema};`,
    `USE CATALOG ${config.catalog};`,
    `USE SCHEMA ${config.schema};`,
    '',
  ];

  tables.forEach(table => {
    const mapped = DEFAULT_TABLE_MAPPINGS[table] || table;
    lines.push(`-- Table: ${mapped} (mapped from: ${table})`);
    lines.push(`-- CREATE TABLE IF NOT EXISTS ${config.catalog}.${config.schema}.${mapped} USING DELTA;`);
    lines.push('');
  });

  lines.push('-- Grant access to analysts');
  lines.push(`-- GRANT SELECT ON SCHEMA ${config.catalog}.${config.schema} TO \`soc_analysts\`;`);
  lines.push(`-- GRANT SELECT ON SCHEMA ${config.catalog}.${config.schema} TO \`security_engineers\`;`);
  lines.push('');

  return lines.join('\n');
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportToDatabricks(
  dashboard: UniversalDashboard,
  config: DatabricksConfig
) {
  const baseName = dashboard.metadata.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();

  if (config.export_format === 'sql_dashboard' || config.export_format === 'all') {
    const content = generateSQLDashboard(dashboard, config);
    downloadFile(content, `${baseName}_sql_dashboard.json`, 'application/json');
  }

  if (config.export_format === 'lakeview' || config.export_format === 'all') {
    const content = generateLakeviewDashboard(dashboard, config);
    downloadFile(content, `${baseName}_lakeview.json`, 'application/json');
  }

  if (config.export_format === 'notebook' || config.export_format === 'all') {
    const content = generateNotebook(dashboard, config);
    downloadFile(content, `${baseName}_notebook.py`, 'text/x-python');
  }

  if (config.export_format === 'all') {
    const ddl = generateDDLMigration(dashboard, config);
    downloadFile(ddl, `${baseName}_ddl_migration.sql`, 'text/sql');
  }
}
