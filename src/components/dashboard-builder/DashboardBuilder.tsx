import { useState, useCallback } from 'react';
import {
  Save, Plus, Eye, EyeOff, RotateCcw, Download, Upload, Tag
} from 'lucide-react';
import type { UniversalWidget, WidgetType, ChartType, UniversalDashboard } from '../../lib/dashboardSchema';
import DashboardGrid from './DashboardGrid';
import WidgetPalette from './WidgetPalette';
import WidgetEditor from './WidgetEditor';
import { supabase } from '../../lib/supabase';
import DatabricksExportPanel from './DatabricksExportPanel';

interface DashboardBuilderProps {
  initialDashboard?: UniversalDashboard;
  dashboardId?: string;
  onSave?: (dashboard: UniversalDashboard, id?: string) => void;
  onBack?: () => void;
}

export default function DashboardBuilder({ initialDashboard, dashboardId, onSave, onBack }: DashboardBuilderProps) {
  const [name, setName] = useState(initialDashboard?.metadata.name || 'Untitled Dashboard');
  const [description, setDescription] = useState(initialDashboard?.metadata.description || '');
  const [widgets, setWidgets] = useState<UniversalWidget[]>(initialDashboard?.widgets || []);
  const [editing, setEditing] = useState(true);
  const [editingWidget, setEditingWidget] = useState<UniversalWidget | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tags, setTags] = useState<string[]>(initialDashboard?.metadata.tags || []);
  const [tagInput, setTagInput] = useState('');
  const [showDatabricksExport, setShowDatabricksExport] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleAddWidget = useCallback((widgetType: WidgetType, chartType: ChartType) => {
    const maxY = widgets.reduce((max, w) => Math.max(max, w.position.y + w.position.h), 0);
    const existingInRow = widgets.filter(w => w.position.y >= maxY - 4 && w.position.y < maxY);
    const usedX = existingInRow.reduce((max, w) => Math.max(max, w.position.x + w.position.w), 0);

    let x = usedX;
    let y = maxY;
    if (x + 6 > 12) {
      x = 0;
      y = maxY;
    }

    const newWidget: UniversalWidget = {
      id: crypto.randomUUID(),
      title: `New ${widgetType === 'chart' ? chartType : widgetType} widget`,
      widgetType,
      chartType,
      chartConfig: {
        showLegend: true,
        legendPosition: 'bottom',
      },
      dataSource: {
        type: 'sql',
        originalQuery: '',
        translatedSQL: '',
      },
      position: { x, y, w: 6, h: 4 },
      translationConfidence: 1,
    };

    setWidgets(prev => [...prev, newWidget]);
    setEditingWidget(newWidget);
    setShowPalette(false);
  }, [widgets]);

  const handleWidgetUpdate = useCallback((updated: UniversalWidget) => {
    setWidgets(prev => prev.map(w => w.id === updated.id ? updated : w));
    setEditingWidget(null);
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const dashboard: UniversalDashboard = {
        metadata: {
          name,
          description,
          sourceTool: initialDashboard?.metadata.sourceTool || 'manual',
          importedAt: initialDashboard?.metadata.importedAt || new Date().toISOString(),
          tags,
        },
        variables: initialDashboard?.variables || [],
        layout: { columns: 12, rowHeight: 80 },
        widgets,
      };

      if (dashboardId) {
        await supabase
          .from('custom_dashboards')
          .update({
            name,
            description,
            layout_config: dashboard.layout,
            variables: dashboard.variables,
            tags,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dashboardId);

        await supabase.from('dashboard_widgets').delete().eq('dashboard_id', dashboardId);

        if (widgets.length > 0) {
          await supabase.from('dashboard_widgets').insert(
            widgets.map(w => ({
              dashboard_id: dashboardId,
              title: w.title,
              widget_type: w.widgetType,
              chart_type: w.chartType || 'bar',
              chart_config: w.chartConfig,
              data_source: w.dataSource,
              position: w.position,
            }))
          );
        }
      } else {
        const { data: newDash } = await supabase
          .from('custom_dashboards')
          .insert({
            name,
            description,
            source_tool: dashboard.metadata.sourceTool,
            layout_config: dashboard.layout,
            variables: dashboard.variables,
            tags,
          })
          .select('id')
          .maybeSingle();

        if (newDash && widgets.length > 0) {
          await supabase.from('dashboard_widgets').insert(
            widgets.map(w => ({
              dashboard_id: newDash.id,
              title: w.title,
              widget_type: w.widgetType,
              chart_type: w.chartType || 'bar',
              chart_config: w.chartConfig,
              data_source: w.dataSource,
              position: w.position,
            }))
          );
        }
      }

      onSave?.(dashboard, dashboardId);
    } catch (e: any) {
      console.error('Failed to save dashboard:', e);
    } finally {
      setSaving(false);
    }
  };

  const handleExportJSON = () => {
    const dashboard: UniversalDashboard = {
      metadata: { name, description, sourceTool: 'manual', importedAt: new Date().toISOString(), tags },
      variables: [],
      layout: { columns: 12, rowHeight: 80 },
      widgets,
    };
    const blob = new Blob([JSON.stringify(dashboard, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name.replace(/\s+/g, '_').toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) {
      setTags(prev => [...prev, t]);
      setTagInput('');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 bg-[#0C1222]/80 backdrop-blur-sm flex-shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0"
            >
              Back
            </button>
          )}
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-transparent text-base font-semibold text-slate-200 focus:outline-none border-b border-transparent focus:border-cyan-500/50 min-w-0 max-w-xs"
            placeholder="Dashboard name..."
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            {tags.map(t => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/50 text-slate-400 cursor-pointer hover:bg-red-500/20 hover:text-red-300 transition-colors"
                onClick={() => setTags(prev => prev.filter(x => x !== t))}
              >
                {t}
              </span>
            ))}
            <div className="flex items-center">
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTag()}
                placeholder="+ tag"
                className="w-14 bg-transparent text-[10px] text-slate-500 focus:outline-none focus:text-slate-300 placeholder:text-slate-700"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setEditing(!editing)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              editing
                ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30'
                : 'bg-slate-800/50 text-slate-400 border border-slate-700/40'
            }`}
          >
            {editing ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {editing ? 'Preview' : 'Edit'}
          </button>

          <button
            onClick={() => setShowPalette(!showPalette)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800/50 text-slate-300 border border-slate-700/40 hover:border-cyan-500/30 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Widget
          </button>

          <button
            onClick={handleExportJSON}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
            title="Export JSON"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowDatabricksExport(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[#FF3621]/10 text-[#FF3621] border border-[#FF3621]/30 hover:bg-[#FF3621]/20 transition-all"
            title="Export to Databricks"
          >
            <img src="/dbricks.png" alt="" className="w-3.5 h-3.5" />
            Databricks
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {description !== undefined && editing && (
        <div className="px-4 py-2 border-b border-slate-800/30">
          <input
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Dashboard description..."
            className="w-full bg-transparent text-xs text-slate-500 focus:outline-none focus:text-slate-400"
          />
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="flex">
          <div className={`flex-1 p-4 transition-all ${showPalette ? 'mr-64' : ''}`}>
            {widgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/50 border border-slate-700/40 flex items-center justify-center mb-4">
                  <Plus className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-sm font-medium text-slate-400 mb-1">Empty Dashboard</h3>
                <p className="text-xs text-slate-600 mb-4 max-w-xs">
                  Click "Add Widget" to start building your dashboard or import a migrated dashboard.
                </p>
                <button
                  onClick={() => setShowPalette(true)}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600/20 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors"
                >
                  Add Your First Widget
                </button>
              </div>
            ) : (
              <DashboardGrid
                widgets={widgets}
                editing={editing}
                onWidgetsChange={setWidgets}
                onEditWidget={setEditingWidget}
              />
            )}
          </div>

          {showPalette && (
            <div className="fixed right-0 top-0 h-full w-64 bg-[#0C1222] border-l border-slate-800/50 p-4 overflow-y-auto z-40 shadow-2xl">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-semibold text-slate-300">Widget Palette</h3>
                <button onClick={() => setShowPalette(false)} className="text-slate-500 hover:text-slate-300">
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
              <WidgetPalette onAdd={handleAddWidget} />
            </div>
          )}
        </div>
      </div>

      {editingWidget && (
        <WidgetEditor
          widget={editingWidget}
          onSave={handleWidgetUpdate}
          onClose={() => setEditingWidget(null)}
          supabaseUrl={supabaseUrl}
          supabaseKey={supabaseKey}
        />
      )}

      {showDatabricksExport && (
        <DatabricksExportPanel
          dashboard={{
            metadata: {
              name,
              description,
              sourceTool: initialDashboard?.metadata.sourceTool || 'manual',
              importedAt: initialDashboard?.metadata.importedAt || new Date().toISOString(),
              tags,
            },
            variables: initialDashboard?.variables || [],
            layout: { columns: 12, rowHeight: 80 },
            widgets,
          }}
          onClose={() => setShowDatabricksExport(false)}
        />
      )}
    </div>
  );
}
