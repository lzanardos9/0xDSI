import {
  BarChart3, LineChart, PieChart, Table, Hash, Type,
  Gauge, Map, Activity, Layers, TrendingUp, Grid3x3
} from 'lucide-react';
import type { WidgetType, ChartType } from '../../lib/dashboardSchema';

interface PaletteItem {
  widgetType: WidgetType;
  chartType: ChartType;
  label: string;
  icon: any;
  description: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  { widgetType: 'chart', chartType: 'line', label: 'Line Chart', icon: LineChart, description: 'Time series & trends' },
  { widgetType: 'chart', chartType: 'bar', label: 'Bar Chart', icon: BarChart3, description: 'Categorical comparisons' },
  { widgetType: 'chart', chartType: 'area', label: 'Area Chart', icon: TrendingUp, description: 'Volume over time' },
  { widgetType: 'chart', chartType: 'pie', label: 'Pie Chart', icon: PieChart, description: 'Distribution breakdown' },
  { widgetType: 'chart', chartType: 'donut', label: 'Donut Chart', icon: PieChart, description: 'Distribution with center' },
  { widgetType: 'chart', chartType: 'stacked_bar', label: 'Stacked Bar', icon: Layers, description: 'Segmented categories' },
  { widgetType: 'chart', chartType: 'heatmap', label: 'Heatmap', icon: Grid3x3, description: 'Density visualization' },
  { widgetType: 'chart', chartType: 'scatter', label: 'Scatter Plot', icon: Activity, description: 'Correlation analysis' },
  { widgetType: 'stat', chartType: 'bar', label: 'Stat Card', icon: Hash, description: 'Single metric display' },
  { widgetType: 'gauge', chartType: 'gauge', label: 'Gauge', icon: Gauge, description: 'Progress or threshold' },
  { widgetType: 'table', chartType: 'bar', label: 'Data Table', icon: Table, description: 'Tabular data view' },
  { widgetType: 'text', chartType: 'bar', label: 'Text / Note', icon: Type, description: 'Markdown or plain text' },
  { widgetType: 'map', chartType: 'bar', label: 'Map', icon: Map, description: 'Geographic visualization' },
];

interface WidgetPaletteProps {
  onAdd: (widgetType: WidgetType, chartType: ChartType) => void;
}

export default function WidgetPalette({ onAdd }: WidgetPaletteProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PALETTE_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={`${item.widgetType}-${item.chartType}`}
            onClick={() => onAdd(item.widgetType, item.chartType)}
            className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/40
                       hover:border-cyan-500/40 hover:bg-slate-800/80 transition-all group text-left"
          >
            <div className="p-1.5 rounded-md bg-slate-700/50 group-hover:bg-cyan-500/10 transition-colors flex-shrink-0">
              <Icon className="w-3.5 h-3.5 text-slate-400 group-hover:text-cyan-400 transition-colors" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-slate-300 group-hover:text-slate-200 transition-colors">
                {item.label}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight mt-0.5">
                {item.description}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
