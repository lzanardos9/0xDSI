import { useState, useEffect, useRef, useCallback } from 'react';
import {
  GripVertical, X, Settings, Maximize2, Minimize2, RefreshCw, Database
} from 'lucide-react';
import type { UniversalWidget, ChartConfig, ChartType } from '../../lib/dashboardSchema';
import ChartRenderer from './ChartRenderer';
import StatWidget from './StatWidget';
import TableWidget from './TableWidget';
import TextWidget from './TextWidget';
import { supabase } from '../../lib/supabase';

interface WidgetCardProps {
  widget: UniversalWidget;
  editing: boolean;
  onRemove?: () => void;
  onEdit?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  style?: React.CSSProperties;
}

export default function WidgetCard({ widget, editing, onRemove, onEdit, onDragStart, style }: WidgetCardProps) {
  const [data, setData] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 300, height: 200 });

  const fetchData = useCallback(async () => {
    const sql = widget.dataSource.translatedSQL || widget.dataSource.originalQuery;
    if (!sql || widget.dataSource.type === 'static') {
      if (widget.dataSource.staticData) {
        setData(widget.dataSource.staticData);
      }
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { data: result, error: queryError } = await supabase.rpc('exec_sql', { query: sql });
      if (queryError) {
        const tableName = sql.match(/FROM\s+(\w+)/i)?.[1] || 'events';
        const { data: fallback, error: fbError } = await supabase
          .from(tableName)
          .select('*')
          .limit(20);
        if (fbError) throw new Error(queryError.message);
        setData(fallback || []);
      } else {
        setData(result || []);
      }
    } catch (e: any) {
      setError(e.message);
      setData(generateMockData(widget));
    } finally {
      setLoading(false);
    }
  }, [widget.dataSource]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(entries => {
      for (const entry of entries) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const confidenceColor = (widget.translationConfidence || 0) > 0.8
    ? 'text-emerald-400'
    : (widget.translationConfidence || 0) > 0.5
      ? 'text-yellow-400'
      : 'text-red-400';

  const renderContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-full gap-2">
          <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin" />
          <span className="text-slate-500 text-xs">Loading...</span>
        </div>
      );
    }

    const displayData = data || generateMockData(widget);

    switch (widget.widgetType) {
      case 'stat': {
        const val = displayData.length > 0 ? Object.values(displayData[0])[0] : 0;
        return (
          <StatWidget
            value={val as string | number}
            label={widget.title}
            color={widget.chartConfig.colors?.[0] || '#3B82F6'}
            unitFormat={widget.chartConfig.unitFormat}
          />
        );
      }
      case 'table':
        return <TableWidget data={displayData} />;
      case 'text':
        return <TextWidget content={widget.dataSource.originalQuery || widget.description || ''} />;
      case 'gauge': {
        return (
          <ChartRenderer
            chartType="gauge"
            data={displayData}
            config={widget.chartConfig}
            width={dimensions.width - 8}
            height={dimensions.height - 40}
          />
        );
      }
      default:
        return (
          <ChartRenderer
            chartType={widget.chartType || 'bar'}
            data={displayData}
            config={widget.chartConfig}
            width={dimensions.width - 8}
            height={dimensions.height - 40}
          />
        );
    }
  };

  return (
    <div
      ref={containerRef}
      style={style}
      className={`bg-[#0F1A2E] border rounded-lg overflow-hidden flex flex-col transition-all duration-200 ${
        expanded ? 'fixed inset-8 z-50 border-cyan-500/50' : 'border-slate-700/40 hover:border-slate-600/60'
      } ${editing ? 'ring-1 ring-cyan-500/20' : ''}`}
      draggable={editing}
      onDragStart={onDragStart}
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800/50 bg-slate-900/40 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {editing && (
            <GripVertical className="w-3.5 h-3.5 text-slate-600 cursor-grab flex-shrink-0" />
          )}
          <h3 className="text-xs font-medium text-slate-300 truncate">{widget.title}</h3>
          {widget.translationConfidence !== undefined && widget.translationConfidence < 1 && (
            <span className={`text-[9px] ${confidenceColor} flex-shrink-0`} title="Translation confidence">
              {Math.round(widget.translationConfidence * 100)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {error && (
            <span className="text-[9px] text-amber-400" title={error}>
              mock
            </span>
          )}
          {widget.dataSource.originalQuery && (
            <Database className="w-3 h-3 text-slate-600" title="Has data source" />
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {expanded ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
          </button>
          <button
            onClick={() => fetchData()}
            className="p-0.5 text-slate-500 hover:text-slate-300 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
          {editing && (
            <>
              <button onClick={onEdit} className="p-0.5 text-slate-500 hover:text-cyan-400 transition-colors">
                <Settings className="w-3 h-3" />
              </button>
              <button onClick={onRemove} className="p-0.5 text-slate-500 hover:text-red-400 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 p-1">
        {renderContent()}
      </div>

      {expanded && (
        <div className="fixed inset-0 bg-black/60 -z-10" onClick={() => setExpanded(false)} />
      )}
    </div>
  );
}

function generateMockData(widget: UniversalWidget): any[] {
  const type = widget.widgetType;
  const chart = widget.chartType;

  if (type === 'stat') {
    return [{ value: Math.floor(Math.random() * 10000) }];
  }

  if (type === 'table') {
    return Array.from({ length: 8 }, (_, i) => ({
      id: `EVT-${1000 + i}`,
      event_type: ['Login', 'Firewall', 'DNS', 'Auth', 'Scan'][i % 5],
      severity: ['critical', 'high', 'medium', 'low'][i % 4],
      source_ip: `10.0.${i}.${Math.floor(Math.random() * 255)}`,
      timestamp: new Date(Date.now() - i * 3600000).toISOString().slice(0, 19),
    }));
  }

  if (chart === 'pie' || chart === 'donut') {
    return [
      { label: 'Critical', count: 15 },
      { label: 'High', count: 35 },
      { label: 'Medium', count: 85 },
      { label: 'Low', count: 120 },
    ];
  }

  if (chart === 'gauge') {
    return [{ risk_score: Math.floor(Math.random() * 100) }];
  }

  if (chart === 'heatmap') {
    const result: any[] = [];
    for (let h = 0; h < 6; h++) {
      for (const sev of ['low', 'medium', 'high', 'critical']) {
        result.push({ hour: `${h * 4}:00`, severity: sev, count: Math.floor(Math.random() * 50) });
      }
    }
    return result;
  }

  if (chart === 'scatter') {
    return Array.from({ length: 30 }, () => ({
      x: Math.floor(Math.random() * 100),
      y: Math.floor(Math.random() * 100),
    }));
  }

  return Array.from({ length: 12 }, (_, i) => ({
    label: `${String(i).padStart(2, '0')}:00`,
    events: Math.floor(Math.random() * 200 + 50),
    alerts: Math.floor(Math.random() * 30),
  }));
}
