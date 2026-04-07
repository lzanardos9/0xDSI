import type { ParseResult, DashboardParser } from './types';
import type { UniversalWidget, ChartType, WidgetType } from '../dashboardSchema';

const SUPERSET_VIZ_MAP: Record<string, { widgetType: WidgetType; chartType: ChartType }> = {
  line: { widgetType: 'chart', chartType: 'line' },
  bar: { widgetType: 'chart', chartType: 'bar' },
  dist_bar: { widgetType: 'chart', chartType: 'bar' },
  area: { widgetType: 'chart', chartType: 'area' },
  pie: { widgetType: 'chart', chartType: 'pie' },
  table: { widgetType: 'table', chartType: 'bar' },
  big_number: { widgetType: 'stat', chartType: 'bar' },
  big_number_total: { widgetType: 'stat', chartType: 'bar' },
  histogram: { widgetType: 'chart', chartType: 'bar' },
  heatmap: { widgetType: 'chart', chartType: 'heatmap' },
  treemap: { widgetType: 'chart', chartType: 'treemap' },
  sunburst: { widgetType: 'chart', chartType: 'pie' },
  gauge_chart: { widgetType: 'gauge', chartType: 'gauge' },
  funnel: { widgetType: 'chart', chartType: 'funnel' },
  scatter: { widgetType: 'chart', chartType: 'scatter' },
  bubble: { widgetType: 'chart', chartType: 'scatter' },
  world_map: { widgetType: 'map', chartType: 'bar' },
  country_map: { widgetType: 'map', chartType: 'bar' },
  deck_geojson: { widgetType: 'map', chartType: 'bar' },
  deck_scatter: { widgetType: 'map', chartType: 'bar' },
  pivot_table: { widgetType: 'table', chartType: 'bar' },
  pivot_table_v2: { widgetType: 'table', chartType: 'bar' },
  word_cloud: { widgetType: 'chart', chartType: 'treemap' },
  mixed_timeseries: { widgetType: 'chart', chartType: 'line' },
  echarts_timeseries_line: { widgetType: 'chart', chartType: 'line' },
  echarts_timeseries_bar: { widgetType: 'chart', chartType: 'bar' },
  echarts_timeseries_scatter: { widgetType: 'chart', chartType: 'scatter' },
  echarts_area: { widgetType: 'chart', chartType: 'area' },
  echarts_pie: { widgetType: 'chart', chartType: 'pie' },
  echarts_gauge: { widgetType: 'gauge', chartType: 'gauge' },
  echarts_funnel: { widgetType: 'chart', chartType: 'funnel' },
  radar: { widgetType: 'chart', chartType: 'radar' },
  markup: { widgetType: 'text', chartType: 'bar' },
  separator: { widgetType: 'text', chartType: 'bar' },
  filter_box: { widgetType: 'custom', chartType: 'bar' },
};

function extractSupersetQuery(slice: any): string {
  const fd = slice.params || slice.form_data || {};
  const parts: string[] = [];

  if (fd.adhoc_filters && fd.adhoc_filters.length > 0) {
    const filterDesc = fd.adhoc_filters.map((f: any) => {
      if (f.sqlExpression) return f.sqlExpression;
      return `${f.subject} ${f.operator} ${f.comparator}`;
    });
    parts.push(`Filters: ${filterDesc.join(', ')}`);
  }

  if (fd.groupby && fd.groupby.length > 0) {
    parts.push(`Group By: ${fd.groupby.join(', ')}`);
  }

  if (fd.metrics && fd.metrics.length > 0) {
    const metricsDesc = fd.metrics.map((m: any) => {
      if (typeof m === 'string') return m;
      if (m.expressionType === 'SQL') return m.sqlExpression;
      return `${m.aggregate || 'COUNT'}(${m.column?.column_name || '*'})`;
    });
    parts.push(`Metrics: ${metricsDesc.join(', ')}`);
  }

  if (fd.query) parts.push(`SQL: ${fd.query}`);
  if (fd.datasource) parts.push(`Datasource: ${fd.datasource}`);

  return parts.join('\n') || `Superset ${slice.viz_type || 'unknown'} visualization`;
}

export const supersetParser: DashboardParser = {
  sourceTool: 'superset',

  detect(content: string): boolean {
    try {
      const obj = JSON.parse(content);
      if (obj.dashboards || obj.dashboard_title || obj.slices) return true;
      if (obj.metadata && (obj.position || obj.json_metadata)) return true;
      return false;
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

    let dashboard = obj;
    if (obj.dashboards && obj.dashboards.length > 0) {
      dashboard = obj.dashboards[0];
    }

    const slices: any[] = dashboard.slices || obj.slices || [];
    const positionData = dashboard.position || {};

    if (slices.length === 0) {
      const chartIds = Object.keys(positionData).filter(k => k.startsWith('CHART-'));
      if (chartIds.length > 0) {
        warnings.push('Found chart positions but no slice data. Using position data only.');
        for (let i = 0; i < chartIds.length; i++) {
          const pos = positionData[chartIds[i]] || {};
          const meta = pos.meta || {};
          slices.push({
            slice_name: meta.sliceName || `Chart ${i + 1}`,
            viz_type: meta.chartType || 'bar',
            form_data: {},
            position: { row: pos.meta?.row || i * 4, col: pos.meta?.col || 0, size_x: pos.meta?.width || 6, size_y: pos.meta?.height || 4 },
          });
        }
      }
    }

    if (slices.length === 0) {
      errors.push('No slices/charts found in Superset dashboard');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    const widgets: UniversalWidget[] = [];
    let queryCount = 0;

    for (let i = 0; i < slices.length; i++) {
      const slice = slices[i];
      const vizType = slice.viz_type || 'table';
      const mapping = SUPERSET_VIZ_MAP[vizType] || { widgetType: 'chart' as WidgetType, chartType: 'bar' as ChartType };

      const query = extractSupersetQuery(slice);
      if (query) queryCount++;

      const pos = slice.position || {};

      widgets.push({
        id: String(slice.slice_id || i),
        title: slice.slice_name || `Slice ${i + 1}`,
        description: slice.description || '',
        widgetType: mapping.widgetType,
        chartType: mapping.chartType,
        chartConfig: {
          showLegend: true,
          legendPosition: 'bottom',
          colors: slice.form_data?.color_scheme ? [] : undefined,
        },
        dataSource: {
          type: 'sql',
          originalQuery: query,
          translatedSQL: '',
        },
        position: {
          x: Math.min(pos.col || (i % 2) * 6, 11),
          y: pos.row || Math.floor(i / 2) * 4,
          w: Math.min(Math.max(pos.size_x || 6, 1), 12),
          h: Math.max(pos.size_y || 4, 1),
        },
        originalConfig: { vizType, datasourceId: slice.datasource_id },
        translationConfidence: 0.8,
      });
    }

    return {
      success: true,
      dashboard: {
        metadata: {
          name: dashboard.dashboard_title || obj.dashboard_title || filename.replace(/\.json$/i, ''),
          description: dashboard.description || '',
          sourceTool: 'superset',
          importedAt: new Date().toISOString(),
          tags: [],
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
