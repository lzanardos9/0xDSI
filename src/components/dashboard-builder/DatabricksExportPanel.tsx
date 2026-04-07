import { useState } from 'react';
import {
  X, Download, Database, FileCode, LayoutGrid, BookOpen,
  ChevronDown, ChevronUp, CheckCircle2, Copy, ExternalLink, FileText
} from 'lucide-react';
import type { UniversalDashboard } from '../../lib/dashboardSchema';
import type { DatabricksConfig } from '../../lib/databricksExporter';
import {
  exportToDatabricks,
  generateSQLDashboard,
  generateLakeviewDashboard,
  generateNotebook,
  generateDDLMigration,
} from '../../lib/databricksExporter';

interface DatabricksExportPanelProps {
  dashboard: UniversalDashboard;
  onClose: () => void;
}

type ExportFormat = DatabricksConfig['export_format'];

const FORMATS: Array<{
  id: ExportFormat;
  label: string;
  description: string;
  icon: typeof Database;
  badge: string;
}> = [
  {
    id: 'sql_dashboard',
    label: 'Databricks SQL Dashboard',
    description: 'Import-ready JSON for Databricks SQL Dashboard editor with queries, visualizations, and layout',
    icon: LayoutGrid,
    badge: 'DBSQL',
  },
  {
    id: 'lakeview',
    label: 'Lakeview Dashboard',
    description: 'New-generation Databricks Lakeview format with datasets, encodings, and responsive pages',
    icon: Database,
    badge: 'Lakeview',
  },
  {
    id: 'notebook',
    label: 'Python Notebook',
    description: 'Databricks notebook with Spark SQL cells, display() visualizations, and Unity Catalog setup',
    icon: BookOpen,
    badge: '.py',
  },
  {
    id: 'all',
    label: 'Full Export Bundle',
    description: 'All formats plus a DDL migration script with catalog/schema creation and access grants',
    icon: Download,
    badge: 'ALL',
  },
];

export default function DatabricksExportPanel({ dashboard, onClose }: DatabricksExportPanelProps) {
  const [catalog, setCatalog] = useState('soc_analytics');
  const [schema, setSchema] = useState('security_data');
  const [warehouseId, setWarehouseId] = useState('');
  const [exportFormat, setExportFormat] = useState<ExportFormat>('sql_dashboard');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [previewTitle, setPreviewTitle] = useState('');
  const [exported, setExported] = useState(false);
  const [copied, setCopied] = useState(false);

  const config: DatabricksConfig = {
    catalog,
    schema,
    warehouse_id: warehouseId,
    export_format: exportFormat,
  };

  const widgetsWithQueries = dashboard.widgets.filter(
    w => w.dataSource.translatedSQL || w.dataSource.originalQuery
  );

  const handleExport = () => {
    exportToDatabricks(dashboard, config);
    setExported(true);
    setTimeout(() => setExported(false), 3000);
  };

  const handlePreview = (format: ExportFormat) => {
    let content = '';
    let title = '';

    if (format === 'sql_dashboard') {
      content = generateSQLDashboard(dashboard, config);
      title = 'Databricks SQL Dashboard JSON';
    } else if (format === 'lakeview') {
      content = generateLakeviewDashboard(dashboard, config);
      title = 'Lakeview Dashboard JSON';
    } else if (format === 'notebook') {
      content = generateNotebook(dashboard, config);
      title = 'Python Notebook';
    } else {
      content = generateDDLMigration(dashboard, config);
      title = 'DDL Migration Script';
    }

    setPreviewContent(content);
    setPreviewTitle(title);
    setShowPreview(true);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(previewContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0C1222] border border-slate-700/50 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-slate-800/60 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#FF3621]/10 flex items-center justify-center">
              <img src="/dbricks.png" alt="" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200">Export to Databricks</h3>
              <p className="text-[10px] text-slate-500">Make this dashboard Databricks-ready</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-5">
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#FF3621]/5 to-orange-500/5 border border-[#FF3621]/20">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-medium text-slate-300">Dashboard Summary</div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Ready
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <div className="text-lg font-bold text-slate-200">{dashboard.widgets.length}</div>
                <div className="text-[10px] text-slate-500">Widgets</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-cyan-300">{widgetsWithQueries.length}</div>
                <div className="text-[10px] text-slate-500">SQL Queries</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-amber-300">{dashboard.metadata.sourceTool}</div>
                <div className="text-[10px] text-slate-500">Source</div>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-2">Unity Catalog Target</label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Catalog</label>
                <input
                  value={catalog}
                  onChange={e => setCatalog(e.target.value)}
                  placeholder="soc_analytics"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
                />
              </div>
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">Schema</label>
                <input
                  value={schema}
                  onChange={e => setSchema(e.target.value)}
                  placeholder="security_data"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
                />
              </div>
            </div>
            <div className="mt-2 text-[10px] text-slate-600 font-mono">
              Tables will be mapped to: {catalog}.{schema}.[table_name]
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-2">Export Format</label>
            <div className="grid grid-cols-2 gap-2">
              {FORMATS.map(fmt => {
                const Icon = fmt.icon;
                const selected = exportFormat === fmt.id;
                return (
                  <button
                    key={fmt.id}
                    onClick={() => setExportFormat(fmt.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? 'border-cyan-500/40 bg-cyan-500/5 ring-1 ring-cyan-500/20'
                        : 'border-slate-700/40 bg-slate-800/20 hover:border-slate-600/50'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg flex-shrink-0 mt-0.5 ${
                      selected ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-700/40 text-slate-500'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium ${selected ? 'text-cyan-300' : 'text-slate-300'}`}>
                          {fmt.label}
                        </span>
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-mono ${
                          selected ? 'bg-cyan-500/10 text-cyan-400' : 'bg-slate-700/40 text-slate-500'
                        }`}>
                          {fmt.badge}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">{fmt.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Advanced Settings
          </button>

          {showAdvanced && (
            <div className="space-y-3 pl-3 border-l-2 border-slate-800">
              <div>
                <label className="block text-[10px] text-slate-500 mb-1">SQL Warehouse ID (optional)</label>
                <input
                  value={warehouseId}
                  onChange={e => setWarehouseId(e.target.value)}
                  placeholder="abc123def456"
                  className="w-full bg-slate-900/60 border border-slate-700/50 rounded-lg px-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50"
                />
                <div className="text-[9px] text-slate-600 mt-1">
                  Leave empty to use placeholder. You can set it in Databricks after import.
                </div>
              </div>

              <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/20">
                <div className="text-[10px] font-medium text-slate-400 mb-2">Table Mappings</div>
                <div className="space-y-1">
                  {Object.entries(
                    dashboard.widgets.reduce((acc, w) => {
                      const sql = w.dataSource.translatedSQL || w.dataSource.originalQuery || '';
                      const matches = sql.match(/\bFROM\s+(\w+)/gi);
                      if (matches) {
                        matches.forEach(m => {
                          const table = m.replace(/FROM\s+/i, '').toLowerCase();
                          acc[table] = true;
                        });
                      }
                      return acc;
                    }, {} as Record<string, boolean>)
                  ).map(([table]) => (
                    <div key={table} className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500 font-mono">{table}</span>
                      <span className="text-slate-700">-&gt;</span>
                      <span className="text-cyan-400 font-mono">
                        {catalog}.{schema}.{table}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-500">Preview:</span>
            <button
              onClick={() => handlePreview('sql_dashboard')}
              className="text-[10px] px-2 py-1 rounded bg-slate-800/50 text-slate-400 hover:text-cyan-300 border border-slate-700/30 hover:border-cyan-500/30 transition-colors"
            >
              SQL Dashboard
            </button>
            <button
              onClick={() => handlePreview('lakeview')}
              className="text-[10px] px-2 py-1 rounded bg-slate-800/50 text-slate-400 hover:text-cyan-300 border border-slate-700/30 hover:border-cyan-500/30 transition-colors"
            >
              Lakeview
            </button>
            <button
              onClick={() => handlePreview('notebook')}
              className="text-[10px] px-2 py-1 rounded bg-slate-800/50 text-slate-400 hover:text-cyan-300 border border-slate-700/30 hover:border-cyan-500/30 transition-colors"
            >
              Notebook
            </button>
            <button
              onClick={() => handlePreview('all')}
              className="text-[10px] px-2 py-1 rounded bg-slate-800/50 text-slate-400 hover:text-cyan-300 border border-slate-700/30 hover:border-cyan-500/30 transition-colors"
            >
              DDL Script
            </button>
          </div>

          {showPreview && (
            <div className="rounded-xl bg-slate-900/80 border border-slate-700/30 overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-800/50 border-b border-slate-700/30">
                <div className="flex items-center gap-2">
                  <FileText className="w-3 h-3 text-slate-500" />
                  <span className="text-[10px] font-medium text-slate-400">{previewTitle}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[9px] text-slate-400 hover:text-cyan-300 bg-slate-700/30 hover:bg-slate-700/50 transition-colors"
                  >
                    {copied ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    onClick={() => setShowPreview(false)}
                    className="p-0.5 text-slate-500 hover:text-slate-300"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <pre className="p-3 text-[10px] text-slate-400 font-mono overflow-x-auto max-h-64 custom-scrollbar leading-relaxed">
                {previewContent.substring(0, 5000)}
                {previewContent.length > 5000 && '\n\n... (truncated)'}
              </pre>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between p-4 border-t border-slate-800/60 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={exported}
            className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium transition-all ${
              exported
                ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                : 'bg-[#FF3621] text-white hover:bg-[#FF3621]/90'
            }`}
          >
            {exported ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Exported
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5" />
                Export to Databricks
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
