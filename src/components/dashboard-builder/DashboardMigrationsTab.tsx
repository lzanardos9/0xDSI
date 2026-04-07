import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Upload, LayoutGrid, Clock, ChevronRight, Search,
  Trash2, ExternalLink, FileJson, FolderOpen, Sparkles,
  BarChart3, Eye, Copy, Star
} from 'lucide-react';
import type { UniversalDashboard, SavedDashboard, MigrationJob, DashboardTemplate, SourceTool } from '../../lib/dashboardSchema';
import { SOURCE_TOOL_META } from '../../lib/dashboardSchema';
import { supabase } from '../../lib/supabase';
import DashboardBuilder from './DashboardBuilder';
import MigrationWorkflow from './MigrationWorkflow';
import DashboardGrid from './DashboardGrid';
import DatabricksExportPanel from './DatabricksExportPanel';

type View = 'list' | 'builder' | 'migrate' | 'view';

export default function DashboardMigrationsTab() {
  const [view, setView] = useState<View>('list');
  const [tab, setTab] = useState<'dashboards' | 'migrations' | 'templates'>('dashboards');
  const [dashboards, setDashboards] = useState<SavedDashboard[]>([]);
  const [migrations, setMigrations] = useState<MigrationJob[]>([]);
  const [templates, setTemplates] = useState<DashboardTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeDashboard, setActiveDashboard] = useState<{
    dashboard: UniversalDashboard;
    id?: string;
  } | null>(null);
  const [viewDashboard, setViewDashboard] = useState<{
    dashboard: UniversalDashboard;
    name: string;
  } | null>(null);
  const [databricksExportDash, setDatabricksExportDash] = useState<UniversalDashboard | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, migRes, tmpRes] = await Promise.all([
        supabase.from('custom_dashboards').select('*').order('updated_at', { ascending: false }),
        supabase.from('dashboard_migrations').select('*').order('created_at', { ascending: false }),
        supabase.from('dashboard_templates').select('*').order('usage_count', { ascending: false }),
      ]);

      setDashboards((dashRes.data as SavedDashboard[]) || []);
      setMigrations((migRes.data as MigrationJob[]) || []);
      setTemplates((tmpRes.data as DashboardTemplate[]) || []);
    } catch (e) {
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteDashboard = async (id: string) => {
    await supabase.from('custom_dashboards').delete().eq('id', id);
    setDashboards(prev => prev.filter(d => d.id !== id));
  };

  const handleOpenDashboard = async (dash: SavedDashboard) => {
    const { data: widgets } = await supabase
      .from('dashboard_widgets')
      .select('*')
      .eq('dashboard_id', dash.id);

    const universalWidgets = (widgets || []).map((w: any) => ({
      id: w.id,
      title: w.title,
      widgetType: w.widget_type,
      chartType: w.chart_type,
      chartConfig: w.chart_config || {},
      dataSource: w.data_source || { type: 'sql', originalQuery: '', translatedSQL: '' },
      position: w.position || { x: 0, y: 0, w: 6, h: 4 },
      translationConfidence: 1,
    }));

    setActiveDashboard({
      dashboard: {
        metadata: {
          name: dash.name,
          description: dash.description,
          sourceTool: (dash.source_tool as SourceTool) || 'manual',
          importedAt: dash.created_at,
          tags: dash.tags || [],
        },
        variables: dash.variables || [],
        layout: dash.layout_config || { columns: 12, rowHeight: 80 },
        widgets: universalWidgets,
      },
      id: dash.id,
    });
    setView('builder');
  };

  const handleViewDashboard = async (dash: SavedDashboard) => {
    const { data: widgets } = await supabase
      .from('dashboard_widgets')
      .select('*')
      .eq('dashboard_id', dash.id);

    const universalWidgets = (widgets || []).map((w: any) => ({
      id: w.id,
      title: w.title,
      widgetType: w.widget_type,
      chartType: w.chart_type,
      chartConfig: w.chart_config || {},
      dataSource: w.data_source || { type: 'sql', originalQuery: '', translatedSQL: '' },
      position: w.position || { x: 0, y: 0, w: 6, h: 4 },
      translationConfidence: 1,
    }));

    setViewDashboard({
      dashboard: {
        metadata: {
          name: dash.name,
          description: dash.description,
          sourceTool: (dash.source_tool as SourceTool) || 'manual',
          importedAt: dash.created_at,
          tags: dash.tags || [],
        },
        variables: dash.variables || [],
        layout: dash.layout_config || { columns: 12, rowHeight: 80 },
        widgets: universalWidgets,
      },
      name: dash.name,
    });
    setView('view');
  };

  const handleDatabricksExport = async (dash: SavedDashboard) => {
    const { data: widgets } = await supabase
      .from('dashboard_widgets')
      .select('*')
      .eq('dashboard_id', dash.id);

    const universalWidgets = (widgets || []).map((w: any) => ({
      id: w.id,
      title: w.title,
      widgetType: w.widget_type,
      chartType: w.chart_type,
      chartConfig: w.chart_config || {},
      dataSource: w.data_source || { type: 'sql', originalQuery: '', translatedSQL: '' },
      position: w.position || { x: 0, y: 0, w: 6, h: 4 },
      translationConfidence: 1,
    }));

    setDatabricksExportDash({
      metadata: {
        name: dash.name,
        description: dash.description,
        sourceTool: (dash.source_tool as SourceTool) || 'manual',
        importedAt: dash.created_at,
        tags: dash.tags || [],
      },
      variables: dash.variables || [],
      layout: dash.layout_config || { columns: 12, rowHeight: 80 },
      widgets: universalWidgets,
    });
  };

  const handleUseTemplate = (template: DashboardTemplate) => {
    setActiveDashboard({
      dashboard: {
        metadata: {
          name: `${template.name} (Copy)`,
          description: template.description,
          sourceTool: 'manual',
          importedAt: new Date().toISOString(),
          tags: [template.category],
        },
        variables: [],
        layout: template.layout_config || { columns: 12, rowHeight: 80 },
        widgets: (template.preview_widgets || []).map((pw: any, i: number) => ({
          id: crypto.randomUUID(),
          title: pw.title,
          widgetType: pw.type || 'chart',
          chartType: pw.chartType || 'bar',
          chartConfig: { showLegend: true, legendPosition: 'bottom' as const },
          dataSource: { type: 'sql' as const, originalQuery: '', translatedSQL: '' },
          position: { x: (i % 2) * 6, y: Math.floor(i / 2) * 4, w: 6, h: 4 },
          translationConfidence: 1,
        })),
      },
    });
    setView('builder');

    supabase.from('dashboard_templates')
      .update({ usage_count: template.usage_count + 1 })
      .eq('id', template.id)
      .then();
  };

  const handleMigrationComplete = (dashboard: UniversalDashboard) => {
    setActiveDashboard({ dashboard });
    setView('builder');
  };

  const handleBuilderSave = () => {
    loadData();
    setView('list');
    setActiveDashboard(null);
  };

  const filteredDashboards = dashboards.filter(d =>
    d.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.source_tool?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredMigrations = migrations.filter(m =>
    m.source_tool?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.source_filename?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const statusColors: Record<string, string> = {
    pending: 'bg-slate-500/10 text-slate-400',
    parsing: 'bg-cyan-500/10 text-cyan-300',
    translating: 'bg-blue-500/10 text-blue-300',
    review: 'bg-amber-500/10 text-amber-300',
    completed: 'bg-emerald-500/10 text-emerald-400',
    failed: 'bg-red-500/10 text-red-400',
  };

  if (view === 'builder' && activeDashboard) {
    return (
      <DashboardBuilder
        initialDashboard={activeDashboard.dashboard}
        dashboardId={activeDashboard.id}
        onSave={handleBuilderSave}
        onBack={() => { setView('list'); setActiveDashboard(null); }}
      />
    );
  }

  if (view === 'migrate') {
    return (
      <MigrationWorkflow
        onComplete={handleMigrationComplete}
        onBack={() => setView('list')}
      />
    );
  }

  if (view === 'view' && viewDashboard) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setView('list'); setViewDashboard(null); }}
              className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
            >
              Back
            </button>
            <h2 className="text-sm font-semibold text-slate-200">{viewDashboard.name}</h2>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
          <DashboardGrid
            widgets={viewDashboard.dashboard.widgets}
            editing={false}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/50 flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-slate-200">Dashboard Studio</h1>
          <p className="text-xs text-slate-500 mt-0.5">Create, migrate, and manage custom dashboards</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setView('migrate')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-slate-800/50 text-slate-300 border border-slate-700/40 hover:border-cyan-500/30 hover:text-cyan-300 transition-all"
          >
            <Upload className="w-3.5 h-3.5" />
            Migrate Dashboard
          </button>
          <button
            onClick={() => {
              setActiveDashboard({
                dashboard: {
                  metadata: { name: 'New Dashboard', description: '', sourceTool: 'manual', importedAt: new Date().toISOString(), tags: [] },
                  variables: [],
                  layout: { columns: 12, rowHeight: 80 },
                  widgets: [],
                },
              });
              setView('builder');
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Dashboard
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1 px-6 pt-3 flex-shrink-0">
        {(['dashboards', 'migrations', 'templates'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-t-lg text-xs font-medium transition-all border-b-2 ${
              tab === t
                ? 'text-cyan-300 border-cyan-400 bg-cyan-500/5'
                : 'text-slate-500 border-transparent hover:text-slate-300'
            }`}
          >
            {t === 'dashboards' ? `My Dashboards (${dashboards.length})` :
             t === 'migrations' ? `Migrations (${migrations.length})` :
             `Templates (${templates.length})`}
          </button>
        ))}

        <div className="flex-1" />

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-48 pl-8 pr-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/40 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/40"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="text-sm text-slate-500">Loading...</div>
          </div>
        ) : tab === 'dashboards' ? (
          filteredDashboards.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <LayoutGrid className="w-12 h-12 text-slate-700 mb-3" />
              <h3 className="text-sm font-medium text-slate-400 mb-1">No Dashboards Yet</h3>
              <p className="text-xs text-slate-600 max-w-sm mb-4">
                Create a new dashboard from scratch or migrate one from Grafana, Kibana, Splunk, and more.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setView('migrate')}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-slate-800/50 text-slate-300 border border-slate-700/40 hover:border-cyan-500/30 transition-all"
                >
                  Migrate Existing
                </button>
                <button
                  onClick={() => {
                    setActiveDashboard({
                      dashboard: {
                        metadata: { name: 'New Dashboard', description: '', sourceTool: 'manual', importedAt: new Date().toISOString(), tags: [] },
                        variables: [],
                        layout: { columns: 12, rowHeight: 80 },
                        widgets: [],
                      },
                    });
                    setView('builder');
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
                >
                  Create New
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredDashboards.map(dash => {
                const toolMeta = SOURCE_TOOL_META[(dash.source_tool as SourceTool) || 'manual'];
                return (
                  <div
                    key={dash.id}
                    className="group bg-slate-800/20 border border-slate-700/30 rounded-xl p-4 hover:border-slate-600/50 transition-all cursor-pointer"
                    onClick={() => handleOpenDashboard(dash)}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                          style={{ backgroundColor: (toolMeta?.color || '#3B82F6') + '20', color: toolMeta?.color || '#3B82F6' }}
                        >
                          {toolMeta?.label?.[0] || 'M'}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-slate-200 truncate group-hover:text-white transition-colors">
                            {dash.name}
                          </h3>
                          <div className="text-[10px] text-slate-600">{toolMeta?.label || 'Manual'}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDatabricksExport(dash); }}
                          className="p-1 text-slate-500 hover:text-[#FF3621] transition-colors"
                          title="Export to Databricks"
                        >
                          <img src="/dbricks.png" alt="" className="w-3.5 h-3.5 opacity-50 hover:opacity-100" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleViewDashboard(dash); }}
                          className="p-1 text-slate-500 hover:text-cyan-400 transition-colors"
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteDashboard(dash.id); }}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {dash.description && (
                      <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">{dash.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        {(dash.tags || []).slice(0, 3).map(t => (
                          <span key={t} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/40 text-slate-500">
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-slate-600">
                        <Clock className="w-3 h-3" />
                        {new Date(dash.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : tab === 'migrations' ? (
          filteredMigrations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <FileJson className="w-12 h-12 text-slate-700 mb-3" />
              <h3 className="text-sm font-medium text-slate-400 mb-1">No Migrations Yet</h3>
              <p className="text-xs text-slate-600 max-w-sm">
                Import dashboards from Grafana, Kibana, Splunk, Redash, Superset, or Metabase.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredMigrations.map(mig => (
                <div
                  key={mig.id}
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/20 border border-slate-700/30"
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold"
                    style={{
                      backgroundColor: (SOURCE_TOOL_META[mig.source_tool as SourceTool]?.color || '#666') + '20',
                      color: SOURCE_TOOL_META[mig.source_tool as SourceTool]?.color || '#666',
                    }}
                  >
                    {SOURCE_TOOL_META[mig.source_tool as SourceTool]?.label?.[0] || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-300 truncate">{mig.source_filename}</div>
                    <div className="text-[10px] text-slate-600 mt-0.5">
                      {SOURCE_TOOL_META[mig.source_tool as SourceTool]?.label || mig.source_tool}
                      {' - '}{mig.widget_count} widgets
                      {mig.confidence_score ? ` - ${Math.round(Number(mig.confidence_score) * 100)}% confidence` : ''}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-md text-[10px] font-medium ${statusColors[mig.translation_status] || statusColors.pending}`}>
                    {mig.translation_status}
                  </span>
                  <div className="text-[10px] text-slate-600">
                    {new Date(mig.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(tmpl => (
              <div
                key={tmpl.id}
                className="group bg-slate-800/20 border border-slate-700/30 rounded-xl p-4 hover:border-cyan-500/30 transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <h3 className="text-sm font-medium text-slate-200">{tmpl.name}</h3>
                    </div>
                    <span className="text-[9px] text-slate-600 mt-1 inline-block px-1.5 py-0.5 rounded bg-slate-700/30">
                      {tmpl.category}
                    </span>
                  </div>
                  {tmpl.is_system && (
                    <Star className="w-3.5 h-3.5 text-amber-500/50" />
                  )}
                </div>
                <p className="text-[11px] text-slate-500 mb-3 line-clamp-2">{tmpl.description}</p>
                <div className="flex flex-wrap gap-1 mb-3">
                  {(tmpl.preview_widgets || []).slice(0, 4).map((pw: any, i: number) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-slate-700/30 text-slate-500">
                      {pw.title}
                    </span>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <div className="text-[10px] text-slate-600">
                    Used {tmpl.usage_count} times
                  </div>
                  <button
                    onClick={() => handleUseTemplate(tmpl)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-medium bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 border border-cyan-500/20 transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Use Template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {databricksExportDash && (
        <DatabricksExportPanel
          dashboard={databricksExportDash}
          onClose={() => setDatabricksExportDash(null)}
        />
      )}
    </div>
  );
}
