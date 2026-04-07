import { useState, useCallback, useRef } from 'react';
import {
  Upload, FileJson, CheckCircle2, AlertTriangle, ArrowRight,
  ChevronRight, Loader, Zap, Eye, BarChart3, Table, Hash,
  Type, Gauge, Map, XCircle, RefreshCw, Camera, Image, Sparkles
} from 'lucide-react';
import type { SourceTool, UniversalDashboard, UniversalWidget } from '../../lib/dashboardSchema';
import { SOURCE_TOOL_META } from '../../lib/dashboardSchema';
import { parseDashboard, detectSourceTool } from '../../lib/parsers';
import type { ParseResult } from '../../lib/parsers';
import { supabase } from '../../lib/supabase';
import DatabricksExportPanel from './DatabricksExportPanel';

interface MigrationWorkflowProps {
  onComplete: (dashboard: UniversalDashboard, migrationId?: string) => void;
  onBack: () => void;
}

type Step = 'select_source' | 'upload' | 'parse_review' | 'translate' | 'complete' | 'screenshot_upload' | 'screenshot_analyzing';

const WIDGET_ICONS: Record<string, any> = {
  chart: BarChart3,
  table: Table,
  stat: Hash,
  text: Type,
  gauge: Gauge,
  map: Map,
  custom: Zap,
};

const SOURCE_TOOLS: SourceTool[] = ['grafana', 'kibana', 'splunk', 'redash', 'superset', 'metabase', 'opensearch', 'banana'];

export default function MigrationWorkflow({ onComplete, onBack }: MigrationWorkflowProps) {
  const [step, setStep] = useState<Step>('select_source');
  const [sourceTool, setSourceTool] = useState<SourceTool | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [fileName, setFileName] = useState('');
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translatedDashboard, setTranslatedDashboard] = useState<UniversalDashboard | null>(null);
  const [migrationId, setMigrationId] = useState<string | null>(null);
  const [translationProgress, setTranslationProgress] = useState(0);
  const [dragActive, setDragActive] = useState(false);
  const [showDatabricksExport, setShowDatabricksExport] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const screenshotRef = useRef<HTMLInputElement>(null);

  const [screenshotBase64, setScreenshotBase64] = useState<string>('');
  const [screenshotPreview, setScreenshotPreview] = useState<string>('');
  const [screenshotFileName, setScreenshotFileName] = useState('');
  const [analyzingProgress, setAnalyzingProgress] = useState(0);
  const [analysisError, setAnalysisError] = useState<string>('');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const handleFileRead = useCallback((file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);

      if (!sourceTool) {
        const detected = detectSourceTool(content);
        if (detected) setSourceTool(detected);
      }
    };
    reader.readAsText(file);
  }, [sourceTool]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileRead(file);
  }, [handleFileRead]);

  const handleParse = useCallback(() => {
    if (!fileContent || !sourceTool) return;

    const result = parseDashboard(fileContent, fileName, sourceTool);
    setParseResult(result);

    if (result.success) {
      supabase.from('dashboard_migrations').insert({
        source_tool: sourceTool,
        source_filename: fileName,
        original_content: fileContent.substring(0, 50000),
        parsed_schema: result.dashboard,
        translation_status: 'parsing',
        widget_count: result.widgetCount,
      }).select('id').maybeSingle().then(({ data }) => {
        if (data) setMigrationId(data.id);
      });

      setStep('parse_review');
    }
  }, [fileContent, fileName, sourceTool]);

  const handleScreenshotRead = useCallback((file: File) => {
    setScreenshotFileName(file.name);
    setAnalysisError('');
    const previewReader = new FileReader();
    previewReader.onload = (e) => setScreenshotPreview(e.target?.result as string);
    previewReader.readAsDataURL(file);
    const base64Reader = new FileReader();
    base64Reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setScreenshotBase64(dataUrl.split(',')[1]);
    };
    base64Reader.readAsDataURL(file);
  }, []);

  const handleScreenshotAnalyze = async () => {
    if (!screenshotBase64) return;
    setStep('screenshot_analyzing');
    setAnalyzingProgress(0);
    setAnalysisError('');

    const progressTimer = setInterval(() => {
      setAnalyzingProgress(prev => {
        if (prev >= 85) { clearInterval(progressTimer); return 85; }
        return prev + Math.random() * 8 + 2;
      });
    }, 600);

    try {
      const ext = screenshotFileName.split('.').pop()?.toLowerCase() || 'png';
      const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png';

      const response = await fetch(`${supabaseUrl}/functions/v1/migrate-dashboard`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'analyze_screenshot',
          image_base64: screenshotBase64,
          mime_type: mimeType,
          filename: screenshotFileName,
        }),
      });

      clearInterval(progressTimer);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Screenshot analysis failed');
      }

      setAnalyzingProgress(95);
      const dashboard: UniversalDashboard = data.dashboard;
      const result: ParseResult = {
        success: true,
        dashboard,
        warnings: data.warnings || [],
        errors: [],
        widgetCount: dashboard.widgets.length,
        queryCount: dashboard.widgets.filter(w => w.dataSource.translatedSQL || w.dataSource.originalQuery).length,
      };
      setParseResult(result);

      supabase.from('dashboard_migrations').insert({
        source_tool: 'screenshot',
        source_filename: screenshotFileName,
        original_content: `[Screenshot: ${screenshotFileName}]`,
        parsed_schema: dashboard,
        translation_status: 'parsing',
        widget_count: dashboard.widgets.length,
      }).select('id').maybeSingle().then(({ data: migData }) => {
        if (migData) setMigrationId(migData.id);
      });

      setAnalyzingProgress(100);
      setTimeout(() => setStep('parse_review'), 400);
    } catch (err: any) {
      clearInterval(progressTimer);
      setAnalysisError(err.message || 'Analysis failed');
      setStep('screenshot_upload');
    }
  };

  const handleTranslate = async () => {
    if (!parseResult?.dashboard) return;
    setTranslating(true);
    setTranslationProgress(0);

    try {
      const dashboard = parseResult.dashboard;
      const widgetsToTranslate = dashboard.widgets.filter(
        w => w.dataSource.originalQuery && w.dataSource.type !== 'static'
      );

      setTranslationProgress(10);

      if (widgetsToTranslate.length === 0) {
        setTranslatedDashboard(dashboard);
        setStep('complete');
        return;
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/migrate-dashboard`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'translate',
          widgets: widgetsToTranslate.map(w => ({
            id: w.id,
            title: w.title,
            widgetType: w.widgetType,
            chartType: w.chartType,
            dataSource: w.dataSource,
          })),
          sourceTool: dashboard.metadata.sourceTool,
          dashboardName: dashboard.metadata.name,
        }),
      });

      setTranslationProgress(60);
      const data = await response.json();

      if (data.translations) {
        const translationMap = new Map(data.translations.map((t: any) => [t.id, t]));
        const translatedWidgets = dashboard.widgets.map(w => {
          const translation = translationMap.get(w.id);
          if (translation) {
            return {
              ...w,
              dataSource: {
                ...w.dataSource,
                translatedSQL: translation.translatedSQL,
              },
              translationConfidence: translation.confidence,
            };
          }
          return w;
        });

        const result: UniversalDashboard = {
          ...dashboard,
          widgets: translatedWidgets,
        };

        setTranslatedDashboard(result);

        const avgConfidence = translatedWidgets.reduce((sum, w) => sum + (w.translationConfidence || 0), 0) / translatedWidgets.length;

        if (migrationId) {
          await supabase.from('dashboard_migrations').update({
            translation_status: 'completed',
            translated_schema: result,
            confidence_score: avgConfidence,
          }).eq('id', migrationId);
        }
      } else {
        setTranslatedDashboard(dashboard);
      }

      setTranslationProgress(100);
      setStep('complete');
    } catch (e: any) {
      console.error('Translation error:', e);
      setTranslatedDashboard(parseResult.dashboard);
      setStep('complete');
    } finally {
      setTranslating(false);
    }
  };

  const renderStepIndicator = () => {
    const steps: { key: Step; label: string }[] = sourceTool === 'screenshot'
      ? [
        { key: 'select_source', label: 'Source' },
        { key: 'screenshot_upload', label: 'Upload' },
        { key: 'screenshot_analyzing', label: 'Analyze' },
        { key: 'parse_review', label: 'Review' },
        { key: 'translate', label: 'Translate' },
        { key: 'complete', label: 'Complete' },
      ]
      : [
        { key: 'select_source', label: 'Source' },
        { key: 'upload', label: 'Upload' },
        { key: 'parse_review', label: 'Parse' },
        { key: 'translate', label: 'Translate' },
        { key: 'complete', label: 'Complete' },
      ];
    const currentIdx = steps.findIndex(s => s.key === step);

    return (
      <div className="flex items-center gap-1 px-4 py-3 border-b border-slate-800/50">
        {steps.map((s, i) => (
          <div key={s.key} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
              i < currentIdx ? 'bg-emerald-500/10 text-emerald-400' :
              i === currentIdx ? 'bg-cyan-500/10 text-cyan-300 ring-1 ring-cyan-500/30' :
              'bg-slate-800/30 text-slate-600'
            }`}>
              {i < currentIdx ? <CheckCircle2 className="w-3 h-3" /> : null}
              {s.label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-700 mx-1" />}
          </div>
        ))}
      </div>
    );
  };

  const renderSelectSource = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-200 mb-1">Select Source Platform</h2>
      <p className="text-xs text-slate-500 mb-6">Choose the tool your dashboard was exported from, or upload a screenshot</p>

      <button
        onClick={() => { setSourceTool('screenshot'); setStep('screenshot_upload'); }}
        className="w-full flex items-center gap-4 p-4 rounded-xl border border-orange-500/30 bg-gradient-to-r from-orange-500/5 to-amber-500/5 hover:from-orange-500/10 hover:to-amber-500/10 hover:border-orange-400/50 transition-all group mb-4"
      >
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 flex items-center justify-center flex-shrink-0 group-hover:from-orange-500/30 group-hover:to-amber-500/30 transition-all">
          <Camera className="w-6 h-6 text-orange-400" />
        </div>
        <div className="text-left flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Upload Screenshot</span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-500/20 text-orange-300 uppercase tracking-wider">AI Vision</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
            Take a screenshot of any dashboard from any tool -- AI will analyze it and recreate the layout, charts, and queries automatically
          </div>
          <div className="text-[10px] text-slate-600 mt-1">Accepts: PNG, JPG, JPEG, WebP</div>
        </div>
        <Sparkles className="w-5 h-5 text-orange-400/50 group-hover:text-orange-300 transition-colors" />
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-slate-800/50" />
        <span className="text-[10px] text-slate-600 uppercase tracking-widest">or select platform</span>
        <div className="flex-1 h-px bg-slate-800/50" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {SOURCE_TOOLS.map(tool => {
          const meta = SOURCE_TOOL_META[tool];
          return (
            <button
              key={tool}
              onClick={() => { setSourceTool(tool); setStep('upload'); }}
              className={`flex flex-col items-start p-4 rounded-xl border transition-all text-left group ${
                sourceTool === tool
                  ? 'border-cyan-500/50 bg-cyan-500/5'
                  : 'border-slate-700/40 bg-slate-800/20 hover:border-slate-600/60 hover:bg-slate-800/40'
              }`}
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center mb-3 text-white font-bold text-sm"
                style={{ backgroundColor: meta.color + '30', color: meta.color }}
              >
                {meta.label[0]}
              </div>
              <div className="text-sm font-medium text-slate-200 group-hover:text-white transition-colors">
                {meta.label}
              </div>
              <div className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                {meta.description}
              </div>
              <div className="text-[9px] text-slate-600 mt-2">
                Accepts: {meta.fileTypes.join(', ')}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-slate-800/20 border border-slate-700/30">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-xs font-medium text-slate-300 mb-1">Auto-Detection Available</div>
            <div className="text-[11px] text-slate-500">
              You can also skip this step and upload directly - the system will attempt to auto-detect the source format from the file content.
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderScreenshotUpload = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-200 mb-1">Upload Dashboard Screenshot</h2>
      <p className="text-xs text-slate-500 mb-6">Upload a screenshot of an existing dashboard from any tool. AI will analyze the layout, identify chart types, and recreate them.</p>

      <div
        className={`relative border-2 border-dashed rounded-xl transition-all cursor-pointer overflow-hidden ${
          dragActive ? 'border-orange-400 bg-orange-500/5'
          : screenshotPreview ? 'border-emerald-500/40 bg-slate-900/50'
          : 'border-slate-700/50 hover:border-slate-600/60 bg-slate-800/10'
        }`}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={e => { e.preventDefault(); setDragActive(false); const f = e.dataTransfer.files[0]; if (f) handleScreenshotRead(f); }}
        onClick={() => screenshotRef.current?.click()}
      >
        <input ref={screenshotRef} type="file" accept="image/png,image/jpeg,image/jpg,image/webp" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleScreenshotRead(f); }} />

        {screenshotPreview ? (
          <div className="relative">
            <img src={screenshotPreview} alt="Dashboard screenshot" className="w-full max-h-80 object-contain" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-transparent to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium text-emerald-300">{screenshotFileName}</span>
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Click or drop to replace</div>
            </div>
          </div>
        ) : (
          <div className="p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 flex items-center justify-center mx-auto mb-4">
              <Image className="w-8 h-8 text-orange-400/60" />
            </div>
            <div className="text-sm text-slate-400">Drop your dashboard screenshot here</div>
            <div className="text-[11px] text-slate-600 mt-1">or click to browse</div>
            <div className="text-[10px] text-slate-700 mt-3">PNG, JPG, JPEG, or WebP</div>
          </div>
        )}
      </div>

      {analysisError && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-xs font-medium text-red-300 mb-1"><XCircle className="w-3.5 h-3.5" /> Analysis Failed</div>
          <div className="text-[11px] text-red-400/80">{analysisError}</div>
        </div>
      )}

      <div className="mt-4 p-4 rounded-xl bg-slate-800/20 border border-slate-700/30">
        <div className="text-xs font-medium text-slate-300 mb-2">How it works</div>
        <div className="space-y-2">
          {[
            { n: '1', text: 'AI Vision analyzes the screenshot to identify each widget' },
            { n: '2', text: 'Chart types, layouts, and titles are automatically detected' },
            { n: '3', text: 'SQL queries are generated based on your database schema' },
            { n: '4', text: 'You review and fine-tune in the dashboard builder' },
          ].map(item => (
            <div key={item.n} className="flex items-start gap-2">
              <span className="w-4 h-4 rounded-full bg-orange-500/10 text-orange-400 text-[10px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{item.n}</span>
              <span className="text-[11px] text-slate-500">{item.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button onClick={() => { setSourceTool(null); setStep('select_source'); }}
          className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors">Back</button>
        <button onClick={handleScreenshotAnalyze} disabled={!screenshotBase64}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-orange-600 text-white hover:bg-orange-500 disabled:opacity-40 transition-colors">
          <Sparkles className="w-3.5 h-3.5" /> Analyze with AI <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );

  const renderScreenshotAnalyzing = () => (
    <div className="p-6 flex flex-col items-center justify-center min-h-[400px]">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500/10 to-amber-500/10 flex items-center justify-center">
          <div className="absolute inset-0 rounded-2xl border border-orange-500/20 animate-pulse" />
          <Sparkles className="w-8 h-8 text-orange-400 animate-pulse" />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Analyzing Dashboard Screenshot</h3>
      <p className="text-xs text-slate-500 mb-2 text-center max-w-xs">AI Vision is examining the screenshot to identify widgets, chart types, and layout structure...</p>

      <div className="w-80 space-y-3 mt-4">
        {[
          { label: 'Detecting widgets and layout', threshold: 20 },
          { label: 'Identifying chart types', threshold: 40 },
          { label: 'Extracting titles and labels', threshold: 55 },
          { label: 'Generating SQL queries', threshold: 70 },
          { label: 'Building dashboard schema', threshold: 85 },
        ].map(phase => {
          const isActive = analyzingProgress >= phase.threshold - 15 && analyzingProgress < phase.threshold + 10;
          const isDone = analyzingProgress > phase.threshold + 5;
          return (
            <div key={phase.label} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isDone ? 'bg-emerald-500/20' : isActive ? 'bg-orange-500/20' : 'bg-slate-800/50'}`}>
                {isDone ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : isActive ? <Loader className="w-3 h-3 text-orange-400 animate-spin" /> : <div className="w-1.5 h-1.5 rounded-full bg-slate-700" />}
              </div>
              <span className={`text-[11px] transition-colors ${isDone ? 'text-emerald-400' : isActive ? 'text-orange-300' : 'text-slate-600'}`}>{phase.label}</span>
            </div>
          );
        })}
      </div>

      <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden mt-6">
        <div className="h-full bg-gradient-to-r from-orange-500 to-amber-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(analyzingProgress, 100)}%` }} />
      </div>
      <div className="text-[10px] text-slate-600 mt-2">{Math.round(analyzingProgress)}%</div>

      {screenshotPreview && (
        <div className="mt-6 w-48 h-28 rounded-lg overflow-hidden border border-slate-700/30 opacity-40">
          <img src={screenshotPreview} alt="" className="w-full h-full object-cover" />
        </div>
      )}
    </div>
  );

  const renderUpload = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold text-slate-200 mb-1">
        Upload {sourceTool ? SOURCE_TOOL_META[sourceTool].label : ''} Dashboard
      </h2>
      <p className="text-xs text-slate-500 mb-6">
        Upload the exported dashboard file ({sourceTool ? SOURCE_TOOL_META[sourceTool].fileTypes.join(', ') : 'JSON, NDJSON, XML'})
      </p>

      <div
        className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer ${
          dragActive
            ? 'border-cyan-400 bg-cyan-500/5'
            : fileContent
              ? 'border-emerald-500/40 bg-emerald-500/5'
              : 'border-slate-700/50 hover:border-slate-600/60 bg-slate-800/10'
        }`}
        onDragOver={e => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".json,.ndjson,.xml,.yaml,.yml,.zip"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFileRead(file);
          }}
        />

        {fileContent ? (
          <div>
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
            <div className="text-sm font-medium text-emerald-300">{fileName}</div>
            <div className="text-[11px] text-slate-500 mt-1">
              {(fileContent.length / 1024).toFixed(1)} KB loaded
              {sourceTool && ` - Detected as ${SOURCE_TOOL_META[sourceTool].label}`}
            </div>
            <div className="text-[10px] text-slate-600 mt-2">Click or drop to replace</div>
          </div>
        ) : (
          <div>
            <Upload className="w-10 h-10 text-slate-600 mx-auto mb-3" />
            <div className="text-sm text-slate-400">Drop your dashboard file here</div>
            <div className="text-[11px] text-slate-600 mt-1">or click to browse</div>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          onClick={() => setStep('select_source')}
          className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={handleParse}
          disabled={!fileContent}
          className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-40 transition-colors"
        >
          Parse Dashboard
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {parseResult && !parseResult.success && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
          <div className="flex items-center gap-2 text-xs font-medium text-red-300 mb-1">
            <XCircle className="w-3.5 h-3.5" />
            Parse Failed
          </div>
          {parseResult.errors.map((err, i) => (
            <div key={i} className="text-[11px] text-red-400/80">{err}</div>
          ))}
        </div>
      )}
    </div>
  );

  const renderParseReview = () => {
    if (!parseResult?.dashboard) return null;
    const db = parseResult.dashboard;
    const isFromScreenshot = sourceTool === 'screenshot';

    return (
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-200">{db.metadata.name}</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {db.widgets.length} widgets detected{isFromScreenshot ? ' from screenshot analysis' : ` from ${SOURCE_TOOL_META[db.metadata.sourceTool]?.label || db.metadata.sourceTool}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 rounded-md text-[10px] font-medium bg-emerald-500/10 text-emerald-400">
              {parseResult.widgetCount} widgets
            </span>
            <span className="px-2 py-1 rounded-md text-[10px] font-medium bg-cyan-500/10 text-cyan-300">
              {parseResult.queryCount} queries
            </span>
            {isFromScreenshot && (
              <span className="px-2 py-1 rounded-md text-[10px] font-medium bg-orange-500/10 text-orange-300">AI Generated</span>
            )}
          </div>
        </div>

        {parseResult.warnings.length > 0 && (
          <div className="mb-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <div className="text-[11px] font-medium text-amber-300 mb-1">Warnings</div>
            {parseResult.warnings.map((w, i) => (
              <div key={i} className="text-[10px] text-amber-400/70">{w}</div>
            ))}
          </div>
        )}

        <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar mb-6">
          {db.widgets.map((widget, i) => {
            const Icon = WIDGET_ICONS[widget.widgetType] || BarChart3;
            return (
              <div
                key={widget.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30"
              >
                <div className="p-1.5 rounded-md bg-slate-700/50 flex-shrink-0">
                  <Icon className="w-3.5 h-3.5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-300 truncate">{widget.title}</div>
                  <div className="text-[10px] text-slate-600 truncate mt-0.5">
                    {widget.widgetType} / {widget.chartType || '-'}
                    {widget.dataSource.originalQuery && ' - Has query'}
                    {widget.dataSource.translatedSQL && ' - SQL ready'}
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 flex-shrink-0">
                  {widget.position.w}x{widget.position.h}
                </div>
                {widget.translationConfidence != null && (
                  <div className={`text-[10px] font-medium flex-shrink-0 ${
                    widget.translationConfidence > 0.8 ? 'text-emerald-400' :
                    widget.translationConfidence > 0.5 ? 'text-amber-400' : 'text-red-400'
                  }`}>{Math.round(widget.translationConfidence * 100)}%</div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => setStep(isFromScreenshot ? 'screenshot_upload' : 'upload')}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            Back
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setTranslatedDashboard(db);
                setStep('complete');
              }}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 border border-slate-700/40 hover:border-slate-600/50 transition-colors"
            >
              {isFromScreenshot ? 'Use As-Is' : 'Skip Translation'}
            </button>
            <button
              onClick={() => { setStep('translate'); handleTranslate(); }}
              className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
            >
              <Zap className="w-3.5 h-3.5" />
              {isFromScreenshot ? 'Refine Queries with AI' : 'Translate Queries with AI'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderTranslating = () => (
    <div className="p-6 flex flex-col items-center justify-center min-h-[300px]">
      <div className="relative mb-6">
        <Loader className="w-12 h-12 text-cyan-400 animate-spin" />
        <div className="absolute inset-0 flex items-center justify-center">
          <Zap className="w-5 h-5 text-cyan-300" />
        </div>
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">Translating Queries</h3>
      <p className="text-xs text-slate-500 mb-4">
        AI is converting queries to work with your database schema...
      </p>
      <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500"
          style={{ width: `${translationProgress}%` }}
        />
      </div>
      <div className="text-[10px] text-slate-600 mt-2">{translationProgress}%</div>
    </div>
  );

  const renderComplete = () => {
    if (!translatedDashboard) return null;

    const avgConfidence = translatedDashboard.widgets.reduce(
      (sum, w) => sum + (w.translationConfidence || 0), 0
    ) / translatedDashboard.widgets.length;

    return (
      <div className="p-6">
        <div className="text-center mb-6">
          <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <h2 className="text-lg font-semibold text-slate-200">Migration Complete</h2>
          <p className="text-xs text-slate-500 mt-1">
            {translatedDashboard.widgets.length} widgets ready for your dashboard
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 text-center">
            <div className="text-xl font-bold text-cyan-300">{translatedDashboard.widgets.length}</div>
            <div className="text-[10px] text-slate-500 mt-1">Widgets</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 text-center">
            <div className="text-xl font-bold text-emerald-300">{Math.round(avgConfidence * 100)}%</div>
            <div className="text-[10px] text-slate-500 mt-1">Confidence</div>
          </div>
          <div className="p-3 rounded-lg bg-slate-800/30 border border-slate-700/30 text-center">
            <div className="text-xl font-bold text-amber-300">
              {translatedDashboard.widgets.filter(w => w.dataSource.translatedSQL).length}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Translated</div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onBack}
            className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-300 hover:bg-slate-800/50 transition-colors"
          >
            Back to List
          </button>
          <button
            onClick={() => setShowDatabricksExport(true)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-[#FF3621]/10 text-[#FF3621] border border-[#FF3621]/30 hover:bg-[#FF3621]/20 transition-all"
          >
            <img src="/dbricks.png" alt="" className="w-3.5 h-3.5" />
            Make Databricks Ready
          </button>
          <button
            onClick={() => onComplete(translatedDashboard, migrationId || undefined)}
            className="flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-500 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            Open in Builder
          </button>
        </div>

        {showDatabricksExport && (
          <DatabricksExportPanel
            dashboard={translatedDashboard}
            onClose={() => setShowDatabricksExport(false)}
          />
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-xs text-slate-500 hover:text-slate-300 transition-colors">
            Back
          </button>
          <h2 className="text-sm font-semibold text-slate-200">Dashboard Migration</h2>
        </div>
      </div>

      {renderStepIndicator()}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {step === 'select_source' && renderSelectSource()}
        {step === 'upload' && renderUpload()}
        {step === 'screenshot_upload' && renderScreenshotUpload()}
        {step === 'screenshot_analyzing' && renderScreenshotAnalyzing()}
        {step === 'parse_review' && renderParseReview()}
        {step === 'translate' && renderTranslating()}
        {step === 'complete' && renderComplete()}
      </div>
    </div>
  );
}
