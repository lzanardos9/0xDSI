import type { ParseResult, DashboardParser } from './types';
import type { UniversalWidget, ChartType, WidgetType } from '../dashboardSchema';

const SPLUNK_VIZ_MAP: Record<string, { widgetType: WidgetType; chartType: ChartType }> = {
  chart: { widgetType: 'chart', chartType: 'line' },
  table: { widgetType: 'table', chartType: 'bar' },
  single: { widgetType: 'stat', chartType: 'bar' },
  map: { widgetType: 'map', chartType: 'bar' },
  event: { widgetType: 'table', chartType: 'bar' },
  html: { widgetType: 'text', chartType: 'bar' },
  viz: { widgetType: 'chart', chartType: 'bar' },
  'splunk.choropleth': { widgetType: 'map', chartType: 'bar' },
  'splunk.line': { widgetType: 'chart', chartType: 'line' },
  'splunk.area': { widgetType: 'chart', chartType: 'area' },
  'splunk.bar': { widgetType: 'chart', chartType: 'bar' },
  'splunk.column': { widgetType: 'chart', chartType: 'bar' },
  'splunk.pie': { widgetType: 'chart', chartType: 'pie' },
  'splunk.scatter': { widgetType: 'chart', chartType: 'scatter' },
  'splunk.bubble': { widgetType: 'chart', chartType: 'scatter' },
  'splunk.singlevalue': { widgetType: 'stat', chartType: 'bar' },
  'splunk.table': { widgetType: 'table', chartType: 'bar' },
  'splunk.markdown': { widgetType: 'text', chartType: 'bar' },
  'splunk.fillergauge': { widgetType: 'gauge', chartType: 'gauge' },
  'splunk.markergauge': { widgetType: 'gauge', chartType: 'gauge' },
  'splunk.radialgauge': { widgetType: 'gauge', chartType: 'gauge' },
};

function parseSimpleXML(content: string): { panels: any[]; title: string; description: string } {
  const panels: any[] = [];
  const titleMatch = content.match(/<label>(.*?)<\/label>/);
  const descMatch = content.match(/<description>(.*?)<\/description>/);

  const panelRegex = /<panel>([\s\S]*?)<\/panel>/g;
  let panelMatch;
  let panelIndex = 0;

  while ((panelMatch = panelRegex.exec(content)) !== null) {
    const panelXml = panelMatch[1];

    const searchMatch = panelXml.match(/<query>([\s\S]*?)<\/query>/);
    const titleMatch = panelXml.match(/<title>(.*?)<\/title>/);

    let vizType = 'chart';
    if (panelXml.includes('<chart>') || panelXml.includes('<chart ')) vizType = 'chart';
    else if (panelXml.includes('<table>') || panelXml.includes('<table ')) vizType = 'table';
    else if (panelXml.includes('<single>') || panelXml.includes('<single ')) vizType = 'single';
    else if (panelXml.includes('<map>') || panelXml.includes('<map ')) vizType = 'map';
    else if (panelXml.includes('<event>') || panelXml.includes('<event ')) vizType = 'event';
    else if (panelXml.includes('<html>') || panelXml.includes('<html ')) vizType = 'html';

    const chartTypeMatch = panelXml.match(/<option\s+name="charting\.chart">(.*?)<\/option>/);
    let subChartType: ChartType = 'line';
    if (chartTypeMatch) {
      const ct = chartTypeMatch[1].toLowerCase();
      if (ct.includes('bar')) subChartType = 'bar';
      else if (ct.includes('area')) subChartType = 'area';
      else if (ct.includes('pie')) subChartType = 'pie';
      else if (ct.includes('scatter')) subChartType = 'scatter';
      else if (ct.includes('column')) subChartType = 'bar';
    }

    panels.push({
      title: titleMatch?.[1] || `Panel ${panelIndex + 1}`,
      vizType,
      subChartType,
      query: searchMatch?.[1]?.trim() || '',
      index: panelIndex,
    });
    panelIndex++;
  }

  return {
    panels,
    title: titleMatch?.[1] || 'Splunk Dashboard',
    description: descMatch?.[1] || '',
  };
}

function parseDashboardStudioJSON(obj: any): { panels: any[]; title: string; description: string } {
  const panels: any[] = [];
  const dataSources = obj.dataSources || {};
  const visualizations = obj.visualizations || {};
  const layout = obj.layout || {};

  let panelIndex = 0;
  for (const [vizId, viz] of Object.entries(visualizations) as any[]) {
    const dsId = viz.dataSources?.primary;
    const ds = dsId ? dataSources[dsId] : null;

    const vizType = viz.type || 'splunk.line';
    const mapping = SPLUNK_VIZ_MAP[vizType] || { widgetType: 'chart' as WidgetType, chartType: 'line' as ChartType };

    panels.push({
      title: viz.title || viz.options?.title || `Panel ${panelIndex + 1}`,
      vizType: mapping.widgetType,
      chartType: mapping.chartType,
      query: ds?.options?.query || ds?.options?.queryString || '',
      queryType: ds?.type || 'ds.search',
      index: panelIndex,
    });
    panelIndex++;
  }

  return {
    panels,
    title: obj.title || 'Splunk Studio Dashboard',
    description: obj.description || '',
  };
}

export const splunkParser: DashboardParser = {
  sourceTool: 'splunk',

  detect(content: string): boolean {
    const trimmed = content.trim();
    if (trimmed.startsWith('<dashboard') || trimmed.startsWith('<form') || trimmed.startsWith('<?xml')) {
      return trimmed.includes('<panel>') || trimmed.includes('<search>');
    }
    try {
      const obj = JSON.parse(trimmed);
      return !!(obj.dataSources && obj.visualizations);
    } catch {
      return false;
    }
  },

  parse(content: string, filename: string): ParseResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const trimmed = content.trim();

    let panels: any[] = [];
    let title = '';
    let description = '';

    const isXml = trimmed.startsWith('<') || trimmed.startsWith('<?xml');

    if (isXml) {
      const result = parseSimpleXML(trimmed);
      panels = result.panels;
      title = result.title;
      description = result.description;
    } else {
      try {
        const obj = JSON.parse(trimmed);
        const result = parseDashboardStudioJSON(obj);
        panels = result.panels;
        title = result.title;
        description = result.description;
      } catch (e: any) {
        errors.push(`Could not parse Splunk content: ${e.message}`);
        return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
      }
    }

    if (panels.length === 0) {
      errors.push('No panels found in Splunk dashboard');
      return { success: false, dashboard: null, warnings, errors, widgetCount: 0, queryCount: 0 };
    }

    const widgets: UniversalWidget[] = panels.map((panel, i) => {
      const mapping = isXml
        ? (SPLUNK_VIZ_MAP[panel.vizType] || { widgetType: 'chart' as WidgetType, chartType: panel.subChartType || ('line' as ChartType) })
        : { widgetType: panel.vizType as WidgetType, chartType: panel.chartType as ChartType };

      return {
        id: String(i),
        title: panel.title,
        widgetType: mapping.widgetType,
        chartType: isXml ? (panel.subChartType || mapping.chartType) : mapping.chartType,
        chartConfig: {
          showLegend: true,
          legendPosition: 'bottom',
        },
        dataSource: {
          type: 'spl' as const,
          originalQuery: panel.query,
          translatedSQL: '',
        },
        position: {
          x: (i % 2) * 6,
          y: Math.floor(i / 2) * 4,
          w: 6,
          h: 4,
        },
        originalConfig: { vizType: panel.vizType, isXml },
        translationConfidence: panel.query ? 0.7 : 0.5,
      };
    });

    let queryCount = 0;
    for (const w of widgets) {
      if (w.dataSource.originalQuery) queryCount++;
    }

    return {
      success: true,
      dashboard: {
        metadata: {
          name: title || filename.replace(/\.(xml|json)$/i, ''),
          description,
          sourceTool: 'splunk',
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
