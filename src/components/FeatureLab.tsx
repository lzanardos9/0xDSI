import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Loader2, Maximize2, Minimize2, Pin, PinOff,
  Trash2, Eye, Code, LayoutGrid, Clock, ChevronRight,
  Zap, FlaskConical, X, RefreshCw, Download, Copy, Check,
  CheckCircle2, FileCode, Layers,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import PlanReview from './feature-lab/PlanReview';
import CodeViewer from './feature-lab/CodeViewer';
import LifecyclePanel from './feature-lab/LifecyclePanel';

interface Creation {
  id: string;
  title: string;
  prompt: string;
  generated_html: string;
  generated_code?: string;
  code_language?: string;
  feature_type?: string;
  category: string;
  tags: string[];
  thumbnail_color: string;
  is_pinned: boolean;
  view_count: number;
  created_by: string;
  created_at: string;
  architecture_plan?: any;
  databricks_features?: any[];
  status?: string;
  share_token?: string | null;
}

const EXAMPLE_PROMPTS = [
  'Build an interactive SOC analyst agent chatbot that I can ask questions about threats, and it searches events and alerts in real-time, showing reasoning steps as it works',
  'Create a ransomware attack simulator where I can pick a variant (LockBit, BlackCat, Royal), configure parameters with sliders, and watch it play out step-by-step with animations',
  'Build an IP/IOC investigation pivot tool with a search bar where I type an IP or hash and it queries events, shows related alerts, maps MITRE techniques, and lets me click entities to drill deeper',
  'Create a Databricks DLT pipeline notebook that ingests raw security events from Kafka, applies quality expectations, enriches with threat intel, and lands into a Delta Lake gold table with Unity Catalog',
  'Build a phishing email identification training game that shows me emails and I have to classify them as legit or phishing, with scoring, timer, and explanations',
  'Create a detection rule builder where I can click to add conditions (event type, severity, IP range, MITRE technique), chain them with AND/OR logic, and test against real events',
  'Build a Mosaic AI Agent Framework notebook that deploys a tool-using threat-hunting agent with Vector Search for IOC similarity and MLflow tracking',
  'Create an incident response decision tree simulator - start with an alert and walk through containment/eradication/recovery choices, with branching paths and scoring',
  'Build a real-time banking trojan tracker showing Grandoreiro, Coyote, and Casbaneiro detections on an animated world map with IOC details on click',
  'Create a MITRE ATT&CK coverage heatmap that queries real events and highlights which techniques we have detections for vs gaps, with click-to-see-events on each cell',
];

const CATEGORY_COLORS: Record<string, string> = {
  dashboard: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  agent: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  simulator: 'bg-red-500/10 text-red-400 border-red-500/30',
  tool: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  visualization: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  monitor: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  report: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
  workflow: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
};

type Phase = 'idle' | 'planning' | 'reviewing' | 'executing' | 'preview';

export default function FeatureLab() {
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<any>(null);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [codeLanguage, setCodeLanguage] = useState<string>('python');
  const [featureType, setFeatureType] = useState<'app' | 'backend'>('app');
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [savedCreation, setSavedCreation] = useState<Creation | null>(null);
  const [creations, setCreations] = useState<Creation[]>([]);
  const [view, setView] = useState<'create' | 'gallery'>('create');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [progressMessage, setProgressMessage] = useState('');
  const [showExamples, setShowExamples] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  useEffect(() => { loadCreations(); }, []);

  const loadCreations = async () => {
    const { data } = await supabase
      .from('feature_lab_creations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setCreations(data as Creation[]);
  };

  const injectSupabaseVars = (html: string) => {
    const injection = `<script>
      window.__SUPABASE_URL__ = "${supabaseUrl}";
      window.__SUPABASE_ANON_KEY__ = "${supabaseAnonKey}";
      window.__RUNTIME_URL__ = "${supabaseUrl}/functions/v1/feature-runtime";
    </script>`;
    if (html.includes('<head>')) return html.replace('<head>', '<head>' + injection);
    return injection + html;
  };

  const renderToIframe = useCallback((html: string) => {
    if (!iframeRef.current) return;
    const enriched = injectSupabaseVars(html);
    const blob = new Blob([enriched], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [supabaseUrl, supabaseAnonKey]);

  const callEdge = async (body: any) => {
    const res = await fetch(`${supabaseUrl}/functions/v1/feature-lab`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${supabaseAnonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  };

  const startPlan = async () => {
    if (!prompt.trim() || phase !== 'idle') return;
    setError(null);
    setPlan(null);
    setGeneratedHtml(null);
    setGeneratedCode('');
    setSavedCreation(null);
    setShowExamples(false);
    setPhase('planning');

    const messages = [
      'Parsing feature request...',
      'Querying lakehouse schema...',
      'Selecting Databricks products...',
      'Drafting architecture graph...',
      'Scoring wow-factor ideas...',
    ];
    let i = 0;
    setProgressMessage(messages[0]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1);
      setProgressMessage(messages[i]);
    }, 1400);

    try {
      const data = await callEdge({ action: 'plan', prompt: prompt.trim() });
      setPlan(data.plan);
      setFeatureType(data.plan.feature_type || 'app');
      setCodeLanguage(data.plan.code_language || 'python');
      setPhase('reviewing');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Planning failed');
      setPhase('idle');
    } finally {
      clearInterval(interval);
      setProgressMessage('');
    }
  };

  const executePlan = async () => {
    if (!plan) return;
    setError(null);
    setPhase('executing');

    const messages = featureType === 'backend' ? [
      'Scaffolding Databricks notebook...',
      'Writing Delta Lake schema...',
      'Generating DLT expectations...',
      'Wiring Unity Catalog...',
      'Adding MLflow tracking...',
      'Writing validation cell...',
    ] : [
      'Scaffolding HTML structure...',
      'Wiring Tailwind design system...',
      'Embedding Chart.js visualizations...',
      'Connecting Supabase live queries...',
      'Building runtime agent hooks...',
      'Polishing micro-interactions...',
    ];
    let i = 0;
    setProgressMessage(messages[0]);
    const interval = setInterval(() => {
      i = Math.min(i + 1, messages.length - 1);
      setProgressMessage(messages[i]);
    }, 4000);

    try {
      const data = await callEdge({ action: 'execute', prompt: prompt.trim(), plan });
      setGeneratedHtml(data.html || null);
      setGeneratedCode(data.generated_code || '');
      setCodeLanguage(data.code_language || '');
      setFeatureType(data.feature_type || 'app');
      setGeneratedTitle(data.title || plan.title || prompt.slice(0, 60));
      setSavedCreation(data.saved || null);
      setPhase('preview');
      if (data.html) setTimeout(() => renderToIframe(data.html), 100);
      loadCreations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed');
      setPhase('reviewing');
    } finally {
      clearInterval(interval);
      setProgressMessage('');
    }
  };

  const resetFlow = () => {
    setPhase('idle');
    setPlan(null);
    setGeneratedHtml(null);
    setGeneratedCode('');
    setSavedCreation(null);
    setError(null);
    setShowExamples(true);
  };

  const openCreation = (creation: Creation) => {
    setPrompt(creation.prompt);
    setPlan(creation.architecture_plan || null);
    setGeneratedHtml(creation.generated_html || null);
    setGeneratedCode(creation.generated_code || '');
    setCodeLanguage(creation.code_language || 'python');
    setFeatureType((creation.feature_type as 'app' | 'backend') || 'app');
    setGeneratedTitle(creation.title);
    setSavedCreation(creation);
    setView('create');
    setPhase('preview');
    if (creation.generated_html) setTimeout(() => renderToIframe(creation.generated_html), 100);
    supabase.from('feature_lab_creations').update({ view_count: (creation.view_count || 0) + 1 }).eq('id', creation.id).then(() => {});
  };

  const deleteCreation = async (id: string) => {
    await supabase.from('feature_lab_creations').delete().eq('id', id);
    setCreations(prev => prev.filter(c => c.id !== id));
  };

  const togglePin = async (creation: Creation) => {
    await supabase.from('feature_lab_creations').update({ is_pinned: !creation.is_pinned }).eq('id', creation.id);
    setCreations(prev => prev.map(c => c.id === creation.id ? { ...c, is_pinned: !c.is_pinned } : c));
  };

  const copyHtml = () => {
    const content = generatedHtml || generatedCode;
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadOutput = () => {
    if (generatedHtml) {
      const blob = new Blob([injectSupabaseVars(generatedHtml)], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${generatedTitle.replace(/\s+/g, '_').toLowerCase()}.html`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) startPlan();
  };

  if (isFullscreen && generatedHtml) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button onClick={copyHtml} className="p-2 bg-slate-800/90 rounded-lg border border-slate-700 hover:bg-slate-700">
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-slate-400" />}
          </button>
          <button onClick={downloadOutput} className="p-2 bg-slate-800/90 rounded-lg border border-slate-700 hover:bg-slate-700">
            <Download size={16} className="text-slate-400" />
          </button>
          <button onClick={() => setIsFullscreen(false)} className="p-2 bg-slate-800/90 rounded-lg border border-slate-700 hover:bg-slate-700">
            <Minimize2 size={16} className="text-slate-400" />
          </button>
        </div>
        <iframe ref={iframeRef} className="w-full h-full border-0" sandbox="allow-scripts allow-same-origin" title="Feature Preview" />
      </div>
    );
  }

  return (
    <div className="space-y-0 h-full">
      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl overflow-hidden flex flex-col" style={{ minHeight: 'calc(100vh - 140px)' }}>
        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-[#1e293b] shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/30 flex items-center justify-center relative">
                <FlaskConical size={20} className="text-cyan-400" />
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">Feature Lab</h2>
                <p className="text-xs text-slate-500 mt-0.5">Plan-review-build pipeline -- Databricks Lakehouse native, production-grade</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-[10px] font-mono font-bold text-orange-400 tracking-wider flex items-center gap-1.5">
                <Layers size={10} />DATABRICKS
              </span>
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Sparkles size={10} />AI BUILDER
              </span>
              <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
                {creations.length} CREATIONS
              </span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-1 mt-4 -mb-4">
            {[
              { id: 'create' as const, label: 'Create', icon: Sparkles },
              { id: 'gallery' as const, label: `Gallery (${creations.length})`, icon: LayoutGrid },
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => setView(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium rounded-t-lg transition-all duration-200 ${view === tab.id
                    ? 'bg-[#0f1629] text-cyan-300 border border-[#1e293b] border-b-transparent'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'}`}>
                  <Icon size={14} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {view === 'create' && (
            <div className="p-6 space-y-5">
              {/* Prompt input */}
              {(phase === 'idle' || phase === 'planning') && (
                <div className="relative">
                  <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-xl overflow-hidden focus-within:border-cyan-500/50 transition-colors">
                    <textarea
                      ref={textareaRef}
                      value={prompt}
                      onChange={e => setPrompt(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Describe the security feature you want to build... e.g. 'Create a real-time ransomware detection dashboard with live alert feed and risk scoring gauge'"
                      className="w-full bg-transparent px-5 pt-4 pb-16 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none"
                      rows={4}
                      disabled={phase !== 'idle'}
                    />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                      <div className="text-[10px] text-slate-600">
                        {prompt.length > 0 ? `${prompt.length} chars` : 'Ctrl+Enter to plan'}
                      </div>
                      <button
                        onClick={startPlan}
                        disabled={!prompt.trim() || phase !== 'idle'}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${phase === 'planning'
                          ? 'bg-cyan-500/20 text-cyan-400 cursor-wait'
                          : prompt.trim()
                            ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-400 hover:to-emerald-400 shadow-lg shadow-cyan-500/20'
                            : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                      >
                        {phase === 'planning' ? (<><Loader2 size={14} className="animate-spin" />Designing...</>) : (<><Zap size={14} />Design Architecture</>)}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Planning / executing progress */}
              {(phase === 'planning' || phase === 'executing') && (
                <div className="bg-[#0a0e1a] border border-cyan-500/20 rounded-xl p-5">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                      <Loader2 size={16} className="text-cyan-400 animate-spin" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-cyan-300">
                        {phase === 'planning' ? 'Designing your architecture' : 'Building your approved feature'}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">{progressMessage}</div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full animate-pulse" style={{ width: '70%' }} />
                  </div>
                  <div className="text-[10px] text-slate-500 mt-3">
                    {phase === 'planning'
                      ? 'Analyzing intent, selecting Databricks products, and generating interactive architecture graph...'
                      : 'Implementing the approved architecture into production-grade code. This takes 60-90 seconds.'}
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 flex items-center gap-3">
                  <div className="text-red-400 text-xs flex-1">{error}</div>
                  <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300"><X size={14} /></button>
                </div>
              )}

              {/* Plan review phase */}
              {phase === 'reviewing' && plan && (
                <PlanReview
                  plan={plan}
                  onApprove={executePlan}
                  onReject={resetFlow}
                  onRegenerate={() => { setPlan(null); setPhase('idle'); startPlan(); }}
                  executing={false}
                />
              )}

              {/* Preview phase */}
              {phase === 'preview' && (generatedHtml || generatedCode) && (
                <div className="space-y-4">
                  {/* Header bar */}
                  <div className="flex items-center justify-between bg-[#0a0e1a] border border-slate-800 rounded-xl px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <div>
                        <div className="text-sm font-bold text-white">{generatedTitle}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 text-[9px] rounded border ${CATEGORY_COLORS[savedCreation?.category || 'dashboard']}`}>
                            {savedCreation?.category || 'dashboard'}
                          </span>
                          {featureType === 'backend' ? (
                            <span className="px-2 py-0.5 text-[9px] rounded border bg-emerald-500/10 text-emerald-400 border-emerald-500/30 flex items-center gap-1">
                              <FileCode size={9} />Backend / {codeLanguage}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[9px] rounded border bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                              Frontend app
                            </span>
                          )}
                          <CheckCircle2 size={11} className="text-emerald-400" />
                          <span className="text-[9px] font-mono text-emerald-400">APPROVED BUILD</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button onClick={copyHtml} className="p-1.5 rounded-lg hover:bg-slate-800" title={featureType === 'backend' ? 'Copy code' : 'Copy HTML'}>
                        {copied ? <Check size={14} className="text-emerald-400" /> : <Code size={14} className="text-slate-500" />}
                      </button>
                      {generatedHtml && (
                        <>
                          <button onClick={() => renderToIframe(generatedHtml)} className="p-1.5 rounded-lg hover:bg-slate-800" title="Refresh">
                            <RefreshCw size={14} className="text-slate-500" />
                          </button>
                          <button onClick={downloadOutput} className="p-1.5 rounded-lg hover:bg-slate-800" title="Download">
                            <Download size={14} className="text-slate-500" />
                          </button>
                          <button onClick={() => setIsFullscreen(true)} className="p-1.5 rounded-lg hover:bg-slate-800" title="Fullscreen">
                            <Maximize2 size={14} className="text-slate-500" />
                          </button>
                        </>
                      )}
                      <button onClick={resetFlow} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold hover:bg-cyan-500/20">
                        <Sparkles size={10} />New
                      </button>
                    </div>
                  </div>

                  {/* Content: iframe for apps, code viewer for backend */}
                  {featureType === 'backend' && generatedCode ? (
                    <CodeViewer code={generatedCode} language={codeLanguage || 'python'} title={generatedTitle} />
                  ) : generatedHtml ? (
                    <div className="bg-black rounded-xl overflow-hidden border border-slate-800" style={{ minHeight: 600 }}>
                      <iframe
                        ref={iframeRef}
                        className="w-full border-0"
                        sandbox="allow-scripts allow-same-origin"
                        title="Feature Preview"
                        style={{ minHeight: 600, width: '100%' }}
                      />
                    </div>
                  ) : null}

                  {/* Lifecycle */}
                  {savedCreation && (
                    <LifecyclePanel
                      creationId={savedCreation.id}
                      initialStatus={savedCreation.status || 'draft'}
                      shareToken={savedCreation.share_token || null}
                      featureType={featureType}
                    />
                  )}

                  {/* Original prompt */}
                  <div className="bg-[#0a0e1a] border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
                    <span className="text-[10px] text-slate-500 shrink-0">PROMPT:</span>
                    <span className="text-[11px] text-slate-400 flex-1 truncate">{prompt}</span>
                    <button onClick={resetFlow} className="text-[10px] text-cyan-400 hover:text-cyan-300 shrink-0">New Feature</button>
                  </div>
                </div>
              )}

              {/* Example prompts */}
              {phase === 'idle' && showExamples && (
                <div className="space-y-3">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Try one of these</div>
                  <div className="grid grid-cols-2 gap-2">
                    {EXAMPLE_PROMPTS.map((ex, i) => (
                      <button key={i} onClick={() => { setPrompt(ex); textareaRef.current?.focus(); }}
                        className="text-left px-4 py-3 bg-[#0a0e1a] border border-[#1e293b] rounded-xl hover:border-cyan-500/30 hover:bg-cyan-500/[0.02] transition-all group">
                        <div className="flex items-start gap-2">
                          <ChevronRight size={12} className="text-slate-600 group-hover:text-cyan-400 mt-0.5 shrink-0 transition-colors" />
                          <span className="text-[11px] text-slate-400 group-hover:text-slate-300 leading-relaxed transition-colors">{ex}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* How it works */}
              {phase === 'idle' && showExamples && (
                <div className="grid grid-cols-5 gap-3 mt-4">
                  {[
                    { step: '1', title: 'Describe', desc: 'Type what you want in plain English', color: 'cyan' },
                    { step: '2', title: 'Architect', desc: 'AI proposes a Databricks-native design', color: 'orange' },
                    { step: '3', title: 'Approve', desc: 'Review the interactive diagram and sign off', color: 'amber' },
                    { step: '4', title: 'Build', desc: 'Production code or app generated', color: 'emerald' },
                    { step: '5', title: 'Ship', desc: 'Test, homologate, promote to production', color: 'teal' },
                  ].map(s => (
                    <div key={s.step} className="bg-[#0a0e1a] border border-[#1e293b] rounded-xl p-4 text-center">
                      <div className={`w-8 h-8 rounded-full bg-${s.color}-500/10 border border-${s.color}-500/30 flex items-center justify-center mx-auto mb-2 text-sm font-bold text-${s.color}-400`}>{s.step}</div>
                      <div className="text-xs font-bold text-slate-200 mb-1">{s.title}</div>
                      <div className="text-[10px] text-slate-500 leading-relaxed">{s.desc}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === 'gallery' && (
            <div className="p-6 space-y-4">
              {creations.length === 0 ? (
                <div className="text-center py-20">
                  <FlaskConical size={48} className="text-slate-700 mx-auto mb-4" />
                  <div className="text-slate-500 text-sm">No creations yet. Go to Create and build your first feature!</div>
                </div>
              ) : (
                <>
                  {creations.filter(c => c.is_pinned).length > 0 && (
                    <div className="space-y-2">
                      <div className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider flex items-center gap-1"><Pin size={10} />Pinned</div>
                      <div className="grid grid-cols-3 gap-3">
                        {creations.filter(c => c.is_pinned).map(c => (
                          <CreationCard key={c.id} creation={c} onOpen={openCreation} onDelete={deleteCreation} onTogglePin={togglePin} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">All Creations</div>
                    <div className="grid grid-cols-3 gap-3">
                      {creations.filter(c => !c.is_pinned).map(c => (
                        <CreationCard key={c.id} creation={c} onOpen={openCreation} onDelete={deleteCreation} onTogglePin={togglePin} />
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CreationCard({ creation, onOpen, onDelete, onTogglePin }: {
  creation: Creation;
  onOpen: (c: Creation) => void;
  onDelete: (id: string) => void;
  onTogglePin: (c: Creation) => void;
}) {
  const [showActions, setShowActions] = useState(false);

  const timeSince = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const statusColors: Record<string, string> = {
    draft: 'bg-slate-700 text-slate-300',
    testing: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    homologation: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    production: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  };

  return (
    <div
      className="bg-[#0a0e1a] border border-[#1e293b] rounded-xl overflow-hidden hover:border-slate-600 transition-all cursor-pointer group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onOpen(creation)}
    >
      <div className="h-1" style={{ backgroundColor: creation.thumbnail_color }} />
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors">{creation.title || 'Untitled'}</div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{creation.prompt}</div>
          </div>
          <div className={`flex items-center gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={e => { e.stopPropagation(); onTogglePin(creation); }} className="p-1 rounded hover:bg-slate-800">
              {creation.is_pinned ? <PinOff size={12} className="text-amber-400" /> : <Pin size={12} className="text-slate-600" />}
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(creation.id); }} className="p-1 rounded hover:bg-red-500/10">
              <Trash2 size={12} className="text-slate-600 hover:text-red-400" />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 text-[9px] rounded border ${CATEGORY_COLORS[creation.category] || CATEGORY_COLORS.dashboard}`}>{creation.category}</span>
            {creation.feature_type === 'backend' && (
              <span className="px-1.5 py-0.5 text-[9px] rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">code</span>
            )}
            {creation.status && creation.status !== 'draft' && (
              <span className={`px-1.5 py-0.5 text-[9px] rounded border ${statusColors[creation.status] || statusColors.draft}`}>{creation.status}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[9px] text-slate-600">
            <span className="flex items-center gap-0.5"><Eye size={9} />{creation.view_count}</span>
            <span className="flex items-center gap-0.5"><Clock size={9} />{timeSince(creation.created_at)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
