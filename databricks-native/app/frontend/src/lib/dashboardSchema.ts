export type WidgetType = 'chart' | 'table' | 'stat' | 'text' | 'map' | 'gauge' | 'custom';

export type ChartType =
  | 'line'
  | 'bar'
  | 'pie'
  | 'area'
  | 'heatmap'
  | 'scatter'
  | 'gauge'
  | 'funnel'
  | 'donut'
  | 'stacked_bar'
  | 'stacked_area'
  | 'radar'
  | 'treemap';

export type SourceTool =
  | 'grafana'
  | 'kibana'
  | 'splunk'
  | 'redash'
  | 'superset'
  | 'metabase'
  | 'opensearch'
  | 'banana'
  | 'manual';

export interface WidgetPosition {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface AxisConfig {
  label?: string;
  type?: 'linear' | 'log' | 'time' | 'category';
  min?: number;
  max?: number;
  format?: string;
}

export interface ChartConfig {
  colors?: string[];
  showLegend?: boolean;
  legendPosition?: 'top' | 'bottom' | 'left' | 'right';
  stacked?: boolean;
  fill?: boolean;
  smooth?: boolean;
  xAxis?: AxisConfig;
  yAxis?: AxisConfig;
  thresholds?: Array<{ value: number; color: string; label?: string }>;
  unitFormat?: string;
  decimals?: number;
}

export interface DataSourceConfig {
  type: 'sql' | 'lucene' | 'spl' | 'promql' | 'kql' | 'raw' | 'static';
  originalQuery: string;
  translatedSQL: string;
  refreshInterval?: number;
  timeField?: string;
  staticData?: any[];
}

export interface DashboardVariable {
  name: string;
  label?: string;
  type: 'text' | 'select' | 'time_range' | 'multi_select';
  defaultValue: string;
  options?: string[];
  query?: string;
}

export interface UniversalWidget {
  id: string;
  title: string;
  description?: string;
  widgetType: WidgetType;
  chartType?: ChartType;
  chartConfig: ChartConfig;
  dataSource: DataSourceConfig;
  position: WidgetPosition;
  originalConfig?: any;
  translationConfidence?: number;
}

export interface UniversalDashboard {
  metadata: {
    name: string;
    description: string;
    sourceTool: SourceTool;
    sourceVersion?: string;
    importedAt: string;
    tags: string[];
  };
  variables: DashboardVariable[];
  layout: {
    columns: number;
    rowHeight: number;
  };
  widgets: UniversalWidget[];
}

export interface MigrationJob {
  id: string;
  user_id: string;
  source_tool: string;
  source_filename: string;
  original_content: string;
  parsed_schema: UniversalDashboard | null;
  translated_schema: UniversalDashboard | null;
  translation_status: 'pending' | 'parsing' | 'translating' | 'review' | 'completed' | 'failed';
  widget_count: number;
  confidence_score: number;
  error_log: string;
  created_at: string;
}

export interface SavedDashboard {
  id: string;
  user_id: string;
  name: string;
  description: string;
  source_tool: string;
  layout_config: any;
  variables: DashboardVariable[];
  theme: string;
  is_published: boolean;
  tags: string[];
  created_at: string;
  updated_at: string;
  widgets?: SavedWidget[];
}

export interface SavedWidget {
  id: string;
  dashboard_id: string;
  title: string;
  widget_type: string;
  chart_type: string;
  chart_config: ChartConfig;
  data_source: DataSourceConfig;
  position: WidgetPosition;
  created_at: string;
}

export interface DashboardTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  layout_config: any;
  preview_widgets: Array<{ title: string; type: string; chartType: string }>;
  is_system: boolean;
  usage_count: number;
  created_at: string;
}

export const SOURCE_TOOL_META: Record<SourceTool, { label: string; fileTypes: string[]; description: string; color: string }> = {
  grafana: {
    label: 'Grafana',
    fileTypes: ['.json'],
    description: 'JSON dashboard model with panels, targets, and grid layout',
    color: '#F46800',
  },
  kibana: {
    label: 'Kibana / Elastic',
    fileTypes: ['.ndjson', '.json'],
    description: 'NDJSON saved objects with visualizations and index patterns',
    color: '#00BFB3',
  },
  splunk: {
    label: 'Splunk',
    fileTypes: ['.xml', '.json'],
    description: 'Simple XML dashboards or Dashboard Studio JSON',
    color: '#65A637',
  },
  redash: {
    label: 'Redash',
    fileTypes: ['.json'],
    description: 'JSON dashboard with query references and visualization configs',
    color: '#FF7964',
  },
  superset: {
    label: 'Apache Superset',
    fileTypes: ['.json', '.zip'],
    description: 'JSON dashboard metadata with slices, charts, and SQL queries',
    color: '#20A7C9',
  },
  metabase: {
    label: 'Metabase',
    fileTypes: ['.json', '.yaml'],
    description: 'Cards with dataset queries, display types, and visualization settings',
    color: '#509EE3',
  },
  opensearch: {
    label: 'OpenSearch',
    fileTypes: ['.ndjson', '.json'],
    description: 'NDJSON saved objects compatible with Kibana format',
    color: '#005EB8',
  },
  banana: {
    label: 'Banana (Solr)',
    fileTypes: ['.json'],
    description: 'JSON dashboard with rows/panels and Solr query configs',
    color: '#DB4437',
  },
  manual: {
    label: 'Manual',
    fileTypes: [],
    description: 'Created from scratch in the dashboard builder',
    color: '#3B82F6',
  },
};
