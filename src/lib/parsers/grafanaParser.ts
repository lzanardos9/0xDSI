import type { ParseResult, DashboardParser } from './types';
import type { UniversalWidget, ChartType, WidgetType } from '../dashboardSchema';

const GRAFANA_VIZ_MAP: Record<string, { widgetType: WidgetType; chartType: ChartType }> = {
  graph: { widgetType: 'chart', chartType: 'line' },
  timeseries: { widgetType: 'chart', chartType: 'line' },
  barchart: { widgetType: 'chart', chartType: 'bar' },
  bargauge: { widgetType: 'gauge', chartType: 'gauge' },
  gauge: { widgetType: 'gauge', chartType: 'gauge' },
  stat: { widgetType: 'stat', chartType: 'bar' },
  singlestat: { widgetType: 'stat', chartType: 'bar' },
  table: { widgetType: 'table', chartType: 'bar' },
  'table-old': { widgetType: 'table', chartType: 'bar' },
  piechart: { widgetType: 'chart', chartType: 'pie' },
  heatmap: { widgetType: 'chart', chartType: 'heatmap' },
  'heatmap-new': { widgetType: 'chart', chartType: 'heatmap' },
  text: { widgetType: 'text', chartType: 'bar' },
  geomap: { widgetType: 'map', chartType: 'bar' },
  'state-timeline': { widgetType: 'chart', chartType: 'bar' },
  'status-history': { widgetType: 'chart', chartType: 'heatmap' },
  histogram: { widgetType: 'chart', chartType: 'bar' },
  candlestick: { widgetType: 'chart', chartType: 'line' },
  'trend': { widgetType: 'chart', chartType: 'area' },
  flamegraph: { widgetType: 'chart', chartType: 'stacked_bar' },
  logs: { widgetType: 'table', chartType: 'bar' },
  nodeGraph: { widgetType: 'chart', chartType: 'scatter' },
  traces: { widgetType: 'table', chartType: 'bar' },
  xychart: { widgetType: 'chart', chartType: 'scatter' },
  datagrid: { widgetType: 'table', chartType: 'bar' },
  news: { widgetType: 'text', chartType: 'bar' },
  canvas: { widgetType: 'custom', chartType: 'bar' },
};

function extractQueryString(target: any): string {
  if (target.expr) return `PromQL: ${target.expr}`;
  if (target.rawSql) return target.rawSql;
  if (target.query) return target.query;
  if (target.rawQuery && target.target) return target.target;
  if (target.bucketAggs || target.metrics) {
    const parts: string[] = [];
    if (target.query) parts.push(`Filter: ${target.query}`);
    if (target.metrics) parts.push(`Metrics: ${JSON.stringify(target.metrics)}`);
    if (target.bucketAggs) parts.push(`Aggregations: ${JSON.stringify(target.bucketAggs)}`);
    return parts.join(' | ') || 'Elasticsearch aggregation query';
  }
  return JSON.stringify(target);
}

function mapPanel(panel: any, yOffset: number): UniversalWidget {
  const vizType = panel.type || 'graph';
  const mapping = GRAFANA_VIZ_MAP[vizType] || { widgetType: 'chart' as WidgetType, chartType: 'bar' as ChartType };

  const targets = panel.targets || [];
  const queryStrings = targets.map((t: any) => extractQueryString(t));
  const originalQuery = queryStrings.join('\n---\n') || '';

  const gridPos = panel.gridPos || { x: 0, y: yOffset, w: 12, h: 4 };

  const colors: string[] = [];
  if (panel.fieldConfig?.defaults?.color?.fixedColor) {
    colors.push(panel.fieldConfig.defaults.color.fixedColor);
  }
  if (panel.fieldConfig?.overrides) {
    for (const override of panel.fieldConfig.overrides) {
      for (const prop of override.properties || []) {
        if (prop.id === 'color' && prop.value?.fixedColor) {
          colors.push(prop.value.fixedColor);
        }
      }
    }
  }

  return {
    id: String(panel.id || Math.random().toString(36).slice(2)),
    title: panel.title || 'Untitled Panel',
    description: panel.description || '',
    widgetType: mapping.widgetType,
    chartType: mapping.chartType,
    chartConfig: {
      colors: colors.length > 0 ? colors : undefined,
      showLegend: panel.options?.legend?.displayMode !== 'hidden',
      legendPosition: panel.options?.legend?.placement || 'bottom',
      stacked: panel.fieldConfig?.defaults?.custom?.stacking?.mode === 'normal',
      fill: panel.fieldConfig?.defaults?.custom?.fillOpacity ? panel.fieldConfig.defaults.custom.fillOpacity > 0 : false,
      smooth: panel.fieldConfig?.defaults?.custom?.lineInterpolation === 'smooth',
      unitFormat: panel.fieldConfig?.defaults?.unit || undefined,
      decimals: panel.fieldConfig?.defaults?.decimals ?? undefined,
      thresholds: panel.fieldConfig?.defaults?.thresholds?.steps
        ?.filter((s: any) => s.value !== null)
        .map((s: any) => ({ value: s.value, color: s.color, label: '' })) || [],
    },
    dataSource: {
      type: targets[0]?.expr ? 'promql' : targets[0]?.rawSql ? 'sql' : 'raw',
      originalQuery,
      translatedSQL: '',
      refreshInterval: panel.interval ? parseInt(panel.interval) : undefined,
    },
    position: {
      x: Math.min(gridPos.x || 0, 11),
      y: (gridPos.y || yOffset),
      w: Math.min(Math.max(gridPos.w || 6, 1), 12),
      h: Math.max(gridPos.h || 4, 1),
    },
    originalConfig: { type: vizType, datasource: panel.datasource },
    translationConfidence: 0.85,
  };
}

export const grafanaParser: DashboardParser = {
  sourceTool: 'grafana',

  detect(content: string): boolean {
    try {
      const obj = JSON.parse(content);
      return !!(obj.panels || obj.rows || obj.__inputs || obj.templating || obj.schemaVersion);
    } catch {
      return false;
    }
  },

  parse(content: string, filename: string): ParseResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    let obj: any;
    try {
      obj = JSON.parse(content);
    } catch (e: any) {
      return { success: false, dashboard: null, warnings: [], errors: [`Invalid JSON: ${e.message}`], widgetCount: 0, queryCount: 0 };
    }

    const allPanels: any[] = [];

    if (obj.panels) {
      for (const panel of obj.panels) {
        if (panel.type === 'row' && panel.panels) {
          allPanels.push(...panel.panels);
        } else if (panel.type !== 'row') {
          allPanels.push(panel);
        }
      }
    }

    if (obj.rows) {
      for (const row of obj.rows) {
        if (row.panels) {
          allPanels.push(...row.panels);
        }
      }
    }

    if (allPanels.length === 0) {
      errors.push('No panels found in Grafana dashboard');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    const widgets: UniversalWidget[] = [];
    let queryCount = 0;

    for (let i = 0; i < allPanels.length; i++) {
      const panel = allPanels[i];
      try {
        const widget = mapPanel(panel, i * 4);
        widgets.push(widget);
        if (widget.dataSource.originalQuery) queryCount++;
      } catch (e: any) {
        warnings.push(`Skipped panel "${panel.title || i}": ${e.message}`);
      }
    }

    const variables = (obj.templating?.list || []).map((v: any) => ({
      name: v.name,
      label: v.label || v.name,
      type: v.type === 'query' ? 'select' : v.type === 'custom' ? 'select' : v.type === 'interval' ? 'select' : 'text',
      defaultValue: v.current?.value || v.current?.text || '',
      options: v.options?.map((o: any) => o.value || o.text) || [],
      query: v.query || '',
    }));

    return {
      success: true,
      dashboard: {
        metadata: {
          name: obj.title || filename.replace(/\.json$/i, ''),
          description: obj.description || '',
          sourceTool: 'grafana',
          sourceVersion: obj.schemaVersion ? `Schema v${obj.schemaVersion}` : undefined,
          importedAt: new Date().toISOString(),
          tags: obj.tags || [],
        },
        variables,
        layout: { columns: 12, rowHeight: 80 },
        widgets,
      },
      warnings,
      errors,
      widgetCount: widgets.length,
      queryCount,
    };
  },
};
