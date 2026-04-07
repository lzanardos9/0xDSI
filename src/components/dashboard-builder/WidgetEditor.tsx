import { useState } from 'react';
import {
  X, Wand2, Play, ChevronDown, ChevronUp, Database, Palette
} from 'lucide-react';
import type { UniversalWidget, ChartType } from '../../lib/dashboardSchema';
import { supabase } from '../../lib/supabase';

interface WidgetEditorProps {
  widget: UniversalWidget;
  onSave: (updated: UniversalWidget) => void;
  onClose: () => void;
  supabaseUrl: string;
  supabaseKey: string;
}

const CHART_TYPES: Array<{ value: ChartType; label: string }> = [
  { value: 'line', label: 'Line' },
  { value: 'bar', label: 'Bar' },
  { value: 'area', label: 'Area' },
  { value: 'pie', label: 'Pie' },
  { value: 'donut', label: 'Donut' },
  { value: 'stacked_bar', label: 'Stacked Bar' },
  { value: 'heatmap', label: 'Heatmap' },
  { value: 'scatter', label: 'Scatter' },
  { value: 'gauge', label: 'Gauge' },
  { value: 'funnel', label: 'Funnel' },
  { value: 'radar', label: 'Radar' },
];

export default function WidgetEditor({ widget, onSave, onClose, supabaseUrl, supabaseKey }: WidgetEditorProps) {
  const [title, setTitle] = useState(widget.title);
  const [chartType, setChartType] = useState<ChartType>(widget.chartType || 'bar');
  const [sql, setSql] = useState(widget.dataSource.translatedSQL || widget.dataSource.originalQuery || '');
  const [aiPrompt, setAiPrompt] = useState('');
  const [generating, setGenerating] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [colors, setColors] = useState((widget.chartConfig.colors || []).join(', '));
  const [showLegend, setShowLegend] = useState(widget.chartConfig.showLegend !== false);
  const [stacked, setStacked] = useState(widget.chartConfig.stacked || false);
  const [posW, setPosW] = useState(widget.position.w);
  const [posH, setPosH] = useState(widget.position.h);

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/migrate-dashboard`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'generate_widget_query',
          description: aiPrompt,
          widgetType: widget.widgetType,
          chartType,
        }),
      });
      const data = await res.json();
      if (data.sql) {
        setSql(data.sql);
      }
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleTestQuery = async () => {
    if (!sql.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await supabase.rpc('exec_sql', { query: sql });
      if (error) {
        setTestResult(`Error: ${error.message}`);
      } else {
        const rows = Array.isArray(data) ? data.length : 0;
        setTestResult(`OK - ${rows} rows returned`);
      }
    } catch (e: any) {
      setTestResult(`Error: ${e.message}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const colorArr = colors.split(',').map(c => c.trim()).filter(Boolean);
    onSave({
      ...widget,
      title,
      chartType,
      chartConfig: {
        ...widget.chartConfig,
        colors: colorArr.length > 0 ? colorArr : undefined,
        showLegend,
        stacked,
      },
      dataSource: {
        ...widget.dataSource,
        translatedSQL: sql,
      },
      position: {
        ...widget.position,
        w: Math.min(Math.max(posW, 1), 12),
        h: Math.max(posH, 1),
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0C1222] border border-slate-700/50 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800/60">
          <h3 className="text-sm font-semibold text-slate-200">Edit Widget</h3>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">Title</label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          {widget.widgetType === 'chart' && (
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">Chart Type</label>
              <div className="grid grid-cols-4 gap-1.5">
                {CHART_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    onClick={() => setChartType(ct.value)}
                    className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-all ${
                      chartType === ct.value
                        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                        : 'bg-slate-800/50 text-slate-400 border border-slate-700/30 hover:border-slate-600/50'
                    }`}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
                <Database className="w-3 h-3" /> SQL Query
              </label>
              <button
                onClick={handleTestQuery}
                disabled={testing || !sql.trim()}
                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-slate-700/50 text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
              >
                <Play className="w-3 h-3" />
                {testing ? 'Testing...' : 'Test'}
              </button>
            </div>
            <textarea
              value={sql}
              onChange={e => setSql(e.target.value)}
              rows={4}
              className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 resize-y"
              placeholder="SELECT severity, COUNT(*) as count FROM events GROUP BY severity"
            />
            {testResult && (
              <div className={`mt-1 text-[10px] ${testResult.startsWith('Error') ? 'text-red-400' : 'text-emerald-400'}`}>
                {testResult}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1 flex items-center gap-1">
              <Wand2 className="w-3 h-3" /> AI Query Generator
            </label>
            <div className="flex gap-2">
              <input
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
                placeholder="Describe what data you want to see..."
                className="flex-1 bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-cyan-500/50"
                onKeyDown={e => e.key === 'Enter' && handleAIGenerate()}
              />
              <button
                onClick={handleAIGenerate}
                disabled={generating || !aiPrompt.trim()}
                className="px-3 py-2 rounded-lg bg-cyan-600/20 text-cyan-300 text-xs font-medium hover:bg-cyan-600/30 disabled:opacity-40 transition-colors border border-cyan-500/30 flex-shrink-0"
              >
                {generating ? 'Generating...' : 'Generate'}
              </button>
            </div>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            <Palette className="w-3 h-3" />
            Advanced Options
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-2 border-l-2 border-slate-800">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Width (1-12 cols)</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    value={posW}
                    onChange={e => setPosW(Number(e.target.value))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">Height (rows)</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={posH}
                    onChange={e => setPosH(Number(e.target.value))}
                    className="w-full bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Colors (comma-separated hex)</label>
                <input
                  value={colors}
                  onChange={e => setColors(e.target.value)}
                  placeholder="#3B82F6, #10B981, #F59E0B"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded px-2 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showLegend}
                    onChange={e => setShowLegend(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  Show Legend
                </label>
                <label className="flex items-center gap-2 text-[11px] text-slate-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={stacked}
                    onChange={e => setStacked(e.target.checked)}
                    className="rounded border-slate-600"
                  />
                  Stacked
                </label>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t border-slate-800/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
          >
            Save Widget
          </button>
        </div>
      </div>
    </div>
  );
}
