import type { ParseResult, DashboardParser } from './types';
import type { UniversalWidget, ChartType, WidgetType } from '../dashboardSchema';

const REDASH_VIZ_MAP: Record<string, { widgetType: WidgetType; chartType: ChartType }> = {
  CHART: { widgetType: 'chart', chartType: 'line' },
  TABLE: { widgetType: 'table', chartType: 'bar' },
  COUNTER: { widgetType: 'stat', chartType: 'bar' },
  COHORT: { widgetType: 'chart', chartType: 'heatmap' },
  FUNNEL: { widgetType: 'chart', chartType: 'funnel' },
  MAP: { widgetType: 'map', chartType: 'bar' },
  PIVOT: { widgetType: 'table', chartType: 'bar' },
  SANKEY: { widgetType: 'chart', chartType: 'bar' },
  SUNBURST: { widgetType: 'chart', chartType: 'pie' },
  WORD_CLOUD: { widgetType: 'chart', chartType: 'treemap' },
  DETAILS: { widgetType: 'table', chartType: 'bar' },
};

const REDASH_CHART_SUBTYPE: Record<string, ChartType> = {
  line: 'line',
  column: 'bar',
  bar: 'bar',
  area: 'area',
  pie: 'pie',
  scatter: 'scatter',
  bubble: 'scatter',
  heatmap: 'heatmap',
  box: 'bar',
};

function isRedashLike(obj: any): boolean {
  if (obj.dashboard_filters_enabled !== undefined) return true;
  if (obj.slug && (obj.widgets || obj.queries)) return true;
  if (obj.name && obj.widgets) return true;
  if (obj.dashboard && obj.dashboard.widgets) return true;
  if (obj.name && obj.queries && Array.isArray(obj.queries)) return true;
  if (obj.visualizations && obj.queries) return true;
  return false;
}

function extractDashboardRoot(obj: any): any {
  if (obj.dashboard && typeof obj.dashboard === 'object') return obj.dashboard;
  if (obj.result && typeof obj.result === 'object' && obj.result.widgets) return obj.result;
  return obj;
}

function extractWidgets(root: any): any[] {
  if (Array.isArray(root.widgets) && root.widgets.length > 0) return root.widgets;

  if (Array.isArray(root.queries) && root.queries.length > 0) {
    return root.queries.map((q: any, i: number) => {
      const vis = Array.isArray(q.visualizations) && q.visualizations.length > 0
        ? q.visualizations[0]
        : {};
      return {
        id: q.id || i,
        visualization: { ...vis, query: { id: q.id, query: q.query, data_source_id: q.data_source_id } },
        options: { position: { col: (i % 2) * 6, row: Math.floor(i / 2) * 4, sizeX: 6, sizeY: 4 } },
      };
    });
  }

  if (root.visualizations && Array.isArray(root.visualizations)) {
    return root.visualizations.map((vis: any, i: number) => ({
      id: vis.id || i,
      visualization: vis,
      options: { position: { col: (i % 2) * 6, row: Math.floor(i / 2) * 4, sizeX: 6, sizeY: 4 } },
    }));
  }

  if (Array.isArray(root.widgets) && root.widgets.length === 0 && Array.isArray(root.queries)) {
    return root.queries.map((q: any, i: number) => {
      const vis = Array.isArray(q.visualizations) ? q.visualizations[0] : {};
      return {
        id: q.id || i,
        visualization: { ...(vis || {}), query: { id: q.id, query: q.query, data_source_id: q.data_source_id } },
        options: { position: { col: (i % 2) * 6, row: Math.floor(i / 2) * 4, sizeX: 6, sizeY: 4 } },
      };
    });
  }

  return [];
}

function parseWidget(rw: any, index: number): UniversalWidget {
  const vis = rw.visualization || {};
  const query = vis.query || rw.query || {};
  const visType = (vis.type || rw.type || 'TABLE').toUpperCase();
  const mapping = REDASH_VIZ_MAP[visType] || { widgetType: 'chart' as WidgetType, chartType: 'bar' as ChartType };

  let chartType = mapping.chartType;
  if (visType === 'CHART' && vis.options?.globalSeriesType) {
    chartType = REDASH_CHART_SUBTYPE[vis.options.globalSeriesType] || 'line';
  }

  const options = rw.options || {};
  const pos = options.position || {};

  const originalQuery = query.query || rw.query_text || '';

  return {
    id: String(rw.id || index),
    title: vis.name || rw.name || rw.text || `Widget ${index + 1}`,
    widgetType: rw.text && !vis.type ? 'text' : mapping.widgetType,
    chartType,
    chartConfig: {
      showLegend: vis.options?.legend?.enabled !== false,
      legendPosition: 'bottom',
      stacked: vis.options?.series?.stacking === 'stack',
      colors: vis.options?.seriesOptions
        ? Object.values(vis.options.seriesOptions as any).map((s: any) => s.color).filter(Boolean)
        : undefined,
    },
    dataSource: {
      type: 'sql',
      originalQuery,
      translatedSQL: '',
    },
    position: {
      x: Math.min(pos.col || 0, 11),
      y: pos.row || Math.floor(index / 2) * 4,
      w: Math.min(Math.max(pos.sizeX || pos.width || 6, 1), 12),
      h: Math.max(pos.sizeY || pos.height || 4, 1),
    },
    originalConfig: { visType, queryId: query.id, dataSourceId: query.data_source_id },
    translationConfidence: originalQuery ? 0.9 : 0.5,
  };
}

export const redashParser: DashboardParser = {
  sourceTool: 'redash',

  detect(content: string): boolean {
    try {
      const obj = JSON.parse(content);
      return isRedashLike(obj);
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

    const root = extractDashboardRoot(obj);
    const rawWidgets = extractWidgets(root);

    if (rawWidgets.length === 0) {
      errors.push('No widgets or queries found in Redash dashboard. Expected "widgets", "queries", or "visualizations" array.');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    if (!Array.isArray(root.widgets) || root.widgets.length === 0) {
      warnings.push('Widgets were reconstructed from queries/visualizations (no direct widget layout found).');
    }

    const widgets: UniversalWidget[] = [];
    let queryCount = 0;

    for (let i = 0; i < rawWidgets.length; i++) {
      try {
        const widget = parseWidget(rawWidgets[i], i);
        widgets.push(widget);
        if (widget.dataSource.originalQuery) queryCount++;
      } catch (e: any) {
        warnings.push(`Skipped widget ${i}: ${e.message}`);
      }
    }

    if (widgets.length === 0) {
      errors.push('All widgets failed to parse');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    const dashName = root.name || obj.name || filename.replace(/\.json$/i, '');
    const dashDesc = root.description || obj.description || '';
    const dashTags = root.tags || obj.tags || [];

    return {
      success: true,
      dashboard: {
        metadata: {
          name: dashName,
          description: dashDesc,
          sourceTool: 'redash',
          importedAt: new Date().toISOString(),
          tags: Array.isArray(dashTags) ? dashTags : [],
        },
        variables: [],
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
