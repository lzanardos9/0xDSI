import type { ParseResult, DashboardParser } from './types';
import type { UniversalWidget, ChartType, WidgetType } from '../dashboardSchema';

const METABASE_VIZ_MAP: Record<string, { widgetType: WidgetType; chartType: ChartType }> = {
  line: { widgetType: 'chart', chartType: 'line' },
  bar: { widgetType: 'chart', chartType: 'bar' },
  area: { widgetType: 'chart', chartType: 'area' },
  pie: { widgetType: 'chart', chartType: 'pie' },
  scatter: { widgetType: 'chart', chartType: 'scatter' },
  funnel: { widgetType: 'chart', chartType: 'funnel' },
  table: { widgetType: 'table', chartType: 'bar' },
  pivot: { widgetType: 'table', chartType: 'bar' },
  scalar: { widgetType: 'stat', chartType: 'bar' },
  smartscalar: { widgetType: 'stat', chartType: 'bar' },
  progress: { widgetType: 'gauge', chartType: 'gauge' },
  gauge: { widgetType: 'gauge', chartType: 'gauge' },
  row: { widgetType: 'chart', chartType: 'bar' },
  combo: { widgetType: 'chart', chartType: 'line' },
  waterfall: { widgetType: 'chart', chartType: 'bar' },
  map: { widgetType: 'map', chartType: 'bar' },
  object: { widgetType: 'table', chartType: 'bar' },
  text: { widgetType: 'text', chartType: 'bar' },
  heading: { widgetType: 'text', chartType: 'bar' },
  link: { widgetType: 'text', chartType: 'bar' },
  action: { widgetType: 'custom', chartType: 'bar' },
};

function extractMetabaseQuery(card: any): string {
  const dq = card.dataset_query || {};
  const parts: string[] = [];

  if (dq.type === 'native' && dq.native?.query) {
    parts.push(dq.native.query);
  } else if (dq.type === 'query' && dq.query) {
    const q = dq.query;
    if (q['source-table']) parts.push(`Table: ${q['source-table']}`);
    if (q.aggregation) parts.push(`Aggregation: ${JSON.stringify(q.aggregation)}`);
    if (q.breakout) parts.push(`Breakout: ${JSON.stringify(q.breakout)}`);
    if (q.filter) parts.push(`Filter: ${JSON.stringify(q.filter)}`);
    if (q['order-by']) parts.push(`Order: ${JSON.stringify(q['order-by'])}`);
    if (q.limit) parts.push(`Limit: ${q.limit}`);
  }

  return parts.join('\n') || 'Metabase query';
}

export const metabaseParser: DashboardParser = {
  sourceTool: 'metabase',

  detect(content: string): boolean {
    try {
      const obj = JSON.parse(content);
      if (obj.ordered_cards || obj.dashcards) return true;
      if (obj.cards && Array.isArray(obj.cards)) return true;
      if (obj.dashboard && (obj.dashboard.ordered_cards || obj.dashboard.dashcards)) return true;
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

    let dashboard = obj.dashboard || obj;
    const dashcards = dashboard.ordered_cards || dashboard.dashcards || obj.cards || [];

    if (dashcards.length === 0) {
      errors.push('No cards found in Metabase dashboard');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    const widgets: UniversalWidget[] = [];
    let queryCount = 0;

    for (let i = 0; i < dashcards.length; i++) {
      const dashcard = dashcards[i];
      const card = dashcard.card || dashcard;

      const display = card.display || 'table';
      const mapping = METABASE_VIZ_MAP[display] || { widgetType: 'chart' as WidgetType, chartType: 'bar' as ChartType };

      const query = extractMetabaseQuery(card);
      if (query && query !== 'Metabase query') queryCount++;

      const vizSettings = card.visualization_settings || dashcard.visualization_settings || {};

      widgets.push({
        id: String(dashcard.id || card.id || i),
        title: card.name || dashcard.card_name || `Card ${i + 1}`,
        description: card.description || '',
        widgetType: mapping.widgetType,
        chartType: mapping.chartType,
        chartConfig: {
          showLegend: vizSettings['graph.show_legend'] !== false,
          legendPosition: 'bottom',
          stacked: vizSettings['stackable.stack_type'] === 'stacked',
          colors: vizSettings['graph.colors'] || undefined,
          xAxis: vizSettings['graph.x_axis.title_text'] ? { label: vizSettings['graph.x_axis.title_text'] } : undefined,
          yAxis: vizSettings['graph.y_axis.title_text'] ? { label: vizSettings['graph.y_axis.title_text'] } : undefined,
        },
        dataSource: {
          type: card.dataset_query?.type === 'native' ? 'sql' : 'raw',
          originalQuery: query,
          translatedSQL: '',
        },
        position: {
          x: Math.min(dashcard.col || (i % 2) * 6, 11),
          y: dashcard.row || Math.floor(i / 2) * 4,
          w: Math.min(Math.max(dashcard.size_x || dashcard.sizeX || 6, 1), 12),
          h: Math.max(dashcard.size_y || dashcard.sizeY || 4, 1),
        },
        originalConfig: { display, cardId: card.id },
        translationConfidence: card.dataset_query?.type === 'native' ? 0.9 : 0.75,
      });
    }

    const params = dashboard.parameters || [];
    const variables = params.map((p: any) => ({
      name: p.slug || p.id || p.name,
      label: p.name,
      type: p.type === 'date/all-options' ? 'time_range' : p.type === 'string/=' ? 'select' : 'text',
      defaultValue: p.default || '',
      options: [],
    }));

    return {
      success: true,
      dashboard: {
        metadata: {
          name: dashboard.name || filename.replace(/\.json$/i, ''),
          description: dashboard.description || '',
          sourceTool: 'metabase',
          importedAt: new Date().toISOString(),
          tags: [],
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
