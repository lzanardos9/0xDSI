import type { ParseResult, DashboardParser } from './types';
import type { UniversalWidget, ChartType, WidgetType } from '../dashboardSchema';

const KIBANA_VIZ_MAP: Record<string, { widgetType: WidgetType; chartType: ChartType }> = {
  'line': { widgetType: 'chart', chartType: 'line' },
  'area': { widgetType: 'chart', chartType: 'area' },
  'histogram': { widgetType: 'chart', chartType: 'bar' },
  'horizontal_bar': { widgetType: 'chart', chartType: 'bar' },
  'pie': { widgetType: 'chart', chartType: 'pie' },
  'metric': { widgetType: 'stat', chartType: 'bar' },
  'goal': { widgetType: 'gauge', chartType: 'gauge' },
  'gauge': { widgetType: 'gauge', chartType: 'gauge' },
  'table': { widgetType: 'table', chartType: 'bar' },
  'tagcloud': { widgetType: 'chart', chartType: 'treemap' },
  'heatmap': { widgetType: 'chart', chartType: 'heatmap' },
  'markdown': { widgetType: 'text', chartType: 'bar' },
  'timelion': { widgetType: 'chart', chartType: 'line' },
  'vega': { widgetType: 'chart', chartType: 'line' },
  'map': { widgetType: 'map', chartType: 'bar' },
  'tile_map': { widgetType: 'map', chartType: 'bar' },
  'region_map': { widgetType: 'map', chartType: 'bar' },
  'input_control_vis': { widgetType: 'custom', chartType: 'bar' },
  'lens': { widgetType: 'chart', chartType: 'bar' },
};

function extractKibanaQuery(visState: any): string {
  const parts: string[] = [];

  if (visState.params?.filter) {
    parts.push(`Filter: ${JSON.stringify(visState.params.filter)}`);
  }

  if (visState.aggs && visState.aggs.length > 0) {
    const aggDescriptions = visState.aggs.map((agg: any) => {
      const schema = agg.schema || 'metric';
      const type = agg.type || 'count';
      const field = agg.params?.field || '';
      return `${schema}:${type}(${field})`;
    });
    parts.push(`Aggregations: ${aggDescriptions.join(', ')}`);
  }

  if (visState.params?.series) {
    for (const series of visState.params.series) {
      if (series.metrics) {
        parts.push(`TSVB Metrics: ${JSON.stringify(series.metrics)}`);
      }
    }
  }

  if (visState.params?.spec) {
    parts.push(`Vega Spec: ${visState.params.spec.substring(0, 500)}`);
  }

  if (visState.params?.expression) {
    parts.push(`Timelion: ${visState.params.expression}`);
  }

  return parts.join('\n') || `Kibana ${visState.type || 'unknown'} visualization`;
}

function parseLensSavedObject(attributes: any): { widgetType: WidgetType; chartType: ChartType; query: string } {
  const state = attributes.state || {};
  const vizType = state.visualization?.activeId || '';

  const chartMap: Record<string, ChartType> = {
    lnsXY: 'line',
    lnsPie: 'pie',
    lnsMetric: 'bar',
    lnsGauge: 'gauge',
    lnsDatatable: 'bar',
    lnsHeatmap: 'heatmap',
    lnsPartition: 'donut',
    lnsTagcloud: 'treemap',
  };

  const layers = state.datasourceStates?.formBased?.layers || {};
  const layerDescriptions: string[] = [];
  for (const [, layer] of Object.entries(layers) as any[]) {
    const cols = Object.values(layer.columns || {}) as any[];
    layerDescriptions.push(cols.map((c: any) => `${c.operationType}(${c.sourceField || ''})`).join(', '));
  }

  return {
    widgetType: chartMap[vizType] ? 'chart' : 'stat',
    chartType: chartMap[vizType] || 'bar',
    query: `Lens: ${layerDescriptions.join(' | ')}` || 'Lens visualization',
  };
}

export const kibanaParser: DashboardParser = {
  sourceTool: 'kibana',

  detect(content: string): boolean {
    if (content.includes('"type":"dashboard"') && content.includes('"type":"visualization"')) return true;
    if (content.includes('"type":"dashboard"') && content.includes('"type":"lens"')) return true;
    try {
      const lines = content.trim().split('\n');
      for (const line of lines.slice(0, 5)) {
        const obj = JSON.parse(line);
        if (obj.type === 'dashboard' || obj.type === 'visualization' || obj.type === 'lens') return true;
      }
    } catch { /* not ndjson */ }
    try {
      const obj = JSON.parse(content);
      if (obj.saved_objects && Array.isArray(obj.saved_objects)) return true;
    } catch { /* not json */ }
    return false;
  },

  parse(content: string, filename: string): ParseResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const savedObjects: any[] = [];

    const lines = content.trim().split('\n');
    for (const line of lines) {
      try {
        const obj = JSON.parse(line.trim());
        if (obj.type) {
          savedObjects.push(obj);
        } else if (obj.saved_objects) {
          savedObjects.push(...obj.saved_objects);
        }
      } catch { /* skip invalid lines */ }
    }

    if (savedObjects.length === 0) {
      try {
        const obj = JSON.parse(content);
        if (obj.saved_objects) savedObjects.push(...obj.saved_objects);
        else if (obj.type) savedObjects.push(obj);
      } catch (e: any) {
        errors.push(`Could not parse content: ${e.message}`);
        return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
      }
    }

    const dashboardObj = savedObjects.find(o => o.type === 'dashboard');
    const vizObjects = savedObjects.filter(o => o.type === 'visualization' || o.type === 'lens' || o.type === 'search');
    const vizMap = new Map<string, any>();
    for (const viz of vizObjects) {
      vizMap.set(viz.id, viz);
    }

    let panelRefs: any[] = [];
    if (dashboardObj?.attributes?.panelsJSON) {
      try {
        panelRefs = JSON.parse(dashboardObj.attributes.panelsJSON);
      } catch {
        warnings.push('Could not parse dashboard panelsJSON');
      }
    }

    if (panelRefs.length === 0 && vizObjects.length > 0) {
      panelRefs = vizObjects.map((v, i) => ({
        panelIndex: String(i),
        id: v.id,
        type: v.type,
        gridData: { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 },
      }));
    }

    if (panelRefs.length === 0) {
      errors.push('No panels or visualizations found');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    const widgets: UniversalWidget[] = [];
    let queryCount = 0;

    for (const panelRef of panelRefs) {
      const vizId = panelRef.id || panelRef.panelRefName;
      const viz = vizMap.get(vizId);
      const grid = panelRef.gridData || { x: 0, y: 0, w: 6, h: 4 };

      if (panelRef.embeddableConfig?.savedVis || viz) {
        const attrs = viz?.attributes || panelRef.embeddableConfig?.savedVis || {};
        let visState: any = {};
        try {
          visState = typeof attrs.visState === 'string' ? JSON.parse(attrs.visState) : (attrs.visState || {});
        } catch { /* empty state */ }

        const vizType = visState.type || panelRef.type || 'metric';

        let widgetType: WidgetType = 'chart';
        let chartType: ChartType = 'bar';
        let query = '';

        if (vizType === 'lens' || panelRef.type === 'lens') {
          const lens = parseLensSavedObject(attrs);
          widgetType = lens.widgetType;
          chartType = lens.chartType;
          query = lens.query;
        } else {
          const mapping = KIBANA_VIZ_MAP[vizType] || { widgetType: 'chart' as WidgetType, chartType: 'bar' as ChartType };
          widgetType = mapping.widgetType;
          chartType = mapping.chartType;
          query = extractKibanaQuery(visState);
        }

        queryCount++;

        widgets.push({
          id: panelRef.panelIndex || String(widgets.length),
          title: attrs.title || visState.title || `Panel ${widgets.length + 1}`,
          widgetType,
          chartType,
          chartConfig: {
            showLegend: true,
            legendPosition: 'bottom',
          },
          dataSource: {
            type: 'lucene',
            originalQuery: query,
            translatedSQL: '',
          },
          position: {
            x: Math.min(grid.x || 0, 11),
            y: grid.y || 0,
            w: Math.min(Math.max(grid.w || 6, 1), 12),
            h: Math.max(grid.h || 4, 1),
          },
          originalConfig: { vizType, panelRef },
          translationConfidence: 0.75,
        });
      } else {
        warnings.push(`Could not resolve visualization for panel ${vizId}`);
      }
    }

    const dashTitle = dashboardObj?.attributes?.title || filename.replace(/\.(ndjson|json)$/i, '');

    return {
      success: widgets.length > 0,
      dashboard: {
        metadata: {
          name: dashTitle,
          description: dashboardObj?.attributes?.description || '',
          sourceTool: 'kibana',
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
