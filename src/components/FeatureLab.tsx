import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles, Send, Loader2, Maximize2, Minimize2, Pin, PinOff,
  Trash2, Eye, Code, LayoutGrid, Clock, Tag, ChevronRight,
  Zap, FlaskConical, X, RefreshCw, Download, Copy, Check
} from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Creation {
  id: string;
  title: string;
  prompt: string;
  generated_html: string;
  category: string;
  tags: string[];
  thumbnail_color: string;
  is_pinned: boolean;
  view_count: number;
  created_by: string;
  created_at: string;
}

const EXAMPLE_PROMPTS = [
  'Create a real-time PIX fraud heatmap of Brazil showing fraud density by state with animated pulses and live counters',
  'Build a Grandoreiro trojan kill chain visualization with animated attack flow stages and IOC details',
  'Design a CISO executive summary dashboard with threat severity pie chart, top 10 alerts, and risk score gauge',
  'Create a mule cascade money flow tracker showing how funds split across accounts with animated paths',
  'Build a banking trojan comparison matrix showing Grandoreiro vs Coyote vs Casbaneiro capabilities side by side',
  'Design a PIX transaction risk scoring engine with a real-time feed showing blocked vs allowed transactions',
  'Create a boleto fraud detection dashboard with barcode validation status and monthly trend charts',
  'Build a social engineering attack timeline showing the step-by-step flow of a WhatsApp cloning attack',
  'Design an alert triage workbench with severity distribution chart and quick-action buttons',
  'Create a supply chain risk radar showing ICS safety events, counterfeit detections, and IP theft alerts',
];

const CATEGORY_COLORS: Record<string, string> = {
  dashboard: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  chart: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  monitor: 'bg-red-500/10 text-red-400 border-red-500/30',
  tool: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  report: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
};

export default function FeatureLab() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [generatedTitle, setGeneratedTitle] = useState('');
  const [creations, setCreations] = useState<Creation[]>([]);
  const [view, setView] = useState<'create' | 'gallery' | 'preview'>('create');
  const [previewCreation, setPreviewCreation] = useState<Creation | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [generationPhase, setGenerationPhase] = useState('');
  const [showExamples, setShowExamples] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

  useEffect(() => {
    loadCreations();
  }, []);

  const loadCreations = async () => {
    const { data } = await supabase
      .from('feature_lab_creations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (data) setCreations(data);
  };

  const injectSupabaseVars = (html: string) => {
    const injection = `<script>
      window.__SUPABASE_URL__ = "${supabaseUrl}";
      window.__SUPABASE_ANON_KEY__ = "${supabaseAnonKey}";
    </script>`;
    return html.replace('<head>', '<head>' + injection).replace('</head>', injection + '</head>');
  };

  const renderToIframe = useCallback((html: string) => {
    if (!iframeRef.current) return;
    const enriched = injectSupabaseVars(html);
    const blob = new Blob([enriched], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    iframeRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [supabaseUrl, supabaseAnonKey]);

  const handleGenerate = async () => {
    if (!prompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);
    setGeneratedHtml(null);
    setShowExamples(false);

    const phases = [
      'Analyzing your prompt...',
      'Querying live security data...',
      'Designing component architecture...',
      'Generating HTML + Tailwind + Chart.js...',
      'Injecting real-time data hooks...',
      'Polishing animations & micro-interactions...',
    ];
    let phaseIdx = 0;
    setGenerationPhase(phases[0]);
    const phaseInterval = setInterval(() => {
      phaseIdx = Math.min(phaseIdx + 1, phases.length - 1);
      setGenerationPhase(phases[phaseIdx]);
    }, 2500);

    try {
      const apiUrl = `${supabaseUrl}/functions/v1/feature-lab`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseAnonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt: prompt.trim(), action: 'generate' }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Generation failed (${response.status})`);
      }

      const data = await response.json();
      if (data.error) throw new Error(data.error);

      setGeneratedHtml(data.html);
      setGeneratedTitle(data.title || prompt.slice(0, 60));
      setView('preview');

      setTimeout(() => {
        renderToIframe(data.html);
      }, 100);

      loadCreations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      clearInterval(phaseInterval);
      setIsGenerating(false);
      setGenerationPhase('');
    }
  };

  const openCreation = (creation: Creation) => {
    setPreviewCreation(creation);
    setGeneratedHtml(creation.generated_html);
    setGeneratedTitle(creation.title);
    setPrompt(creation.prompt);
    setView('preview');
    setTimeout(() => renderToIframe(creation.generated_html), 100);
    supabase
      .from('feature_lab_creations')
      .update({ view_count: (creation.view_count || 0) + 1 })
      .eq('id', creation.id)
      .then(() => {});
  };

  const deleteCreation = async (id: string) => {
    await supabase.from('feature_lab_creations').delete().eq('id', id);
    setCreations(prev => prev.filter(c => c.id !== id));
    if (previewCreation?.id === id) {
      setView('gallery');
      setPreviewCreation(null);
    }
  };

  const togglePin = async (creation: Creation) => {
    await supabase
      .from('feature_lab_creations')
      .update({ is_pinned: !creation.is_pinned })
      .eq('id', creation.id);
    setCreations(prev =>
      prev.map(c => c.id === creation.id ? { ...c, is_pinned: !c.is_pinned } : c)
    );
  };

  const copyHtml = () => {
    if (generatedHtml) {
      navigator.clipboard.writeText(generatedHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadHtml = () => {
    if (!generatedHtml) return;
    const blob = new Blob([injectSupabaseVars(generatedHtml)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedTitle.replace(/\s+/g, '_').toLowerCase()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      handleGenerate();
    }
  };

  const timeSince = (date: string) => {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  // Fullscreen preview
  if (isFullscreen && generatedHtml) {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
          <button onClick={copyHtml}
            className="p-2 bg-slate-800/90 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors">
            {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} className="text-slate-400" />}
          </button>
          <button onClick={downloadHtml}
            className="p-2 bg-slate-800/90 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors">
            <Download size={16} className="text-slate-400" />
          </button>
          <button onClick={() => setIsFullscreen(false)}
            className="p-2 bg-slate-800/90 rounded-lg border border-slate-700 hover:bg-slate-700 transition-colors">
            <Minimize2 size={16} className="text-slate-400" />
          </button>
        </div>
        <iframe
          ref={iframeRef}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
          title="Feature Preview"
        />
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
                <h2 className="text-lg font-bold text-slate-100 tracking-tight">
                  Feature Lab
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Describe any security feature and watch it come to life -- powered by AI + real platform data
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-400 tracking-wider flex items-center gap-1.5">
                <Sparkles size={10} />AI BUILDER
              </span>
              <span className="px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-[10px] font-mono font-bold text-cyan-400 tracking-wider">
                {creations.length} CREATIONS
              </span>
            </div>
          </div>

          {/* View toggle */}
          <div className="flex items-center gap-1 mt-4 -mb-4">
            {[
              { id: 'create' as const, label: 'Create', icon: Sparkles },
              { id: 'gallery' as const, label: `Gallery (${creations.length})`, icon: LayoutGrid },
              ...(generatedHtml ? [{ id: 'preview' as const, label: 'Preview', icon: Eye }] : []),
            ].map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => {
                  setView(tab.id);
                  if (tab.id === 'preview' && generatedHtml) {
                    setTimeout(() => renderToIframe(generatedHtml), 50);
                  }
                }}
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

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {/* CREATE VIEW */}
          {view === 'create' && (
            <div className="p-6 space-y-5">
              {/* Prompt input */}
              <div className="relative">
                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-xl overflow-hidden focus-within:border-cyan-500/50 transition-colors">
                  <textarea
                    ref={textareaRef}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Describe the security feature you want to build... e.g. 'Create a real-time PIX fraud monitoring dashboard with live transaction feed and risk scoring gauge'"
                    className="w-full bg-transparent px-5 pt-4 pb-16 text-sm text-slate-200 placeholder-slate-600 resize-none focus:outline-none"
                    rows={4}
                    disabled={isGenerating}
                  />
                  <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                    <div className="text-[10px] text-slate-600">
                      {prompt.length > 0 ? `${prompt.length} chars` : 'Ctrl+Enter to generate'}
                    </div>
                    <button
                      onClick={handleGenerate}
                      disabled={!prompt.trim() || isGenerating}
                      className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold transition-all duration-300 ${isGenerating
                        ? 'bg-cyan-500/20 text-cyan-400 cursor-wait'
                        : prompt.trim()
                          ? 'bg-gradient-to-r from-cyan-500 to-emerald-500 text-white hover:from-cyan-400 hover:to-emerald-400 shadow-lg shadow-cyan-500/20'
                          : 'bg-slate-800 text-slate-600 cursor-not-allowed'}`}
                    >
                      {isGenerating ? (
                        <><Loader2 size={14} className="animate-spin" />Generating...</>
                      ) : (
                        <><Zap size={14} />Generate Feature</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Generation progress */}
              {isGenerating && (
                <div className="bg-[#0a0e1a] border border-cyan-500/20 rounded-xl p-5 space-y-3 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
                      <Loader2 size={16} className="text-cyan-400 animate-spin" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-cyan-300">{generationPhase}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">AI is building your feature with real platform data</div>
                    </div>
                  </div>
                  <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-cyan-500 to-emerald-500 rounded-full animate-pulse" style={{ width: '60%', transition: 'width 2s ease' }} />
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

              {/* Example prompts */}
              {showExamples && !isGenerating && (
                <div className="space-y-3">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Try one of these</div>
                  <div className="grid grid-cols-2 gap-2">
                    {EXAMPLE_PROMPTS.map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => {
                          setPrompt(ex);
                          textareaRef.current?.focus();
                        }}
                        className="text-left px-4 py-3 bg-[#0a0e1a] border border-[#1e293b] rounded-xl hover:border-cyan-500/30 hover:bg-cyan-500/[0.02] transition-all group"
                      >
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
              {showExamples && !isGenerating && (
                <div className="grid grid-cols-4 gap-3 mt-4">
                  {[
                    { step: '1', title: 'Describe', desc: 'Type what you want to build in plain English', color: 'cyan' },
                    { step: '2', title: 'AI Generates', desc: 'GPT-4o creates a full HTML page with live data', color: 'emerald' },
                    { step: '3', title: 'Live Preview', desc: 'See your feature rendered instantly with real data', color: 'blue' },
                    { step: '4', title: 'Save & Share', desc: 'Your creation is saved to the gallery for reuse', color: 'amber' },
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

          {/* GALLERY VIEW */}
          {view === 'gallery' && (
            <div className="p-6 space-y-4">
              {creations.length === 0 ? (
                <div className="text-center py-20">
                  <FlaskConical size={48} className="text-slate-700 mx-auto mb-4" />
                  <div className="text-slate-500 text-sm">No creations yet. Go to Create and build your first feature!</div>
                </div>
              ) : (
                <>
                  {/* Pinned */}
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
                  {/* All */}
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

          {/* PREVIEW VIEW */}
          {view === 'preview' && generatedHtml && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-5 py-3 border-b border-[#1e293b] bg-[#0a0e1a] shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-sm font-bold text-white">{generatedTitle}</span>
                  {previewCreation && (
                    <span className={`px-2 py-0.5 text-[10px] rounded border ${CATEGORY_COLORS[previewCreation.category] || CATEGORY_COLORS.dashboard}`}>
                      {previewCreation.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => renderToIframe(generatedHtml)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="Refresh">
                    <RefreshCw size={14} className="text-slate-500" />
                  </button>
                  <button onClick={copyHtml}
                    className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="Copy HTML">
                    {copied ? <Check size={14} className="text-emerald-400" /> : <Code size={14} className="text-slate-500" />}
                  </button>
                  <button onClick={downloadHtml}
                    className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="Download">
                    <Download size={14} className="text-slate-500" />
                  </button>
                  <button onClick={() => setIsFullscreen(true)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors" title="Fullscreen">
                    <Maximize2 size={14} className="text-slate-500" />
                  </button>
                  <button onClick={() => { setView('create'); setShowExamples(false); }}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold hover:bg-cyan-500/20 transition-colors">
                    <Sparkles size={10} />New
                  </button>
                </div>
              </div>

              <div className="flex-1 bg-black relative" style={{ minHeight: 500 }}>
                <iframe
                  ref={iframeRef}
                  className="w-full h-full border-0 absolute inset-0"
                  sandbox="allow-scripts allow-same-origin"
                  title="Feature Preview"
                  style={{ minHeight: 500 }}
                />
              </div>

              {/* Original prompt bar */}
              <div className="px-5 py-3 border-t border-[#1e293b] bg-[#0a0e1a] shrink-0">
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-slate-500 shrink-0">PROMPT:</span>
                  <span className="text-[11px] text-slate-400 truncate flex-1">{prompt}</span>
                  <button
                    onClick={() => {
                      setView('create');
                      setShowExamples(false);
                      textareaRef.current?.focus();
                    }}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 shrink-0"
                  >
                    Edit & Regenerate
                  </button>
                </div>
              </div>
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

  return (
    <div
      className="bg-[#0a0e1a] border border-[#1e293b] rounded-xl overflow-hidden hover:border-slate-600 transition-all cursor-pointer group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      onClick={() => onOpen(creation)}
    >
      {/* Color bar */}
      <div className="h-1" style={{ backgroundColor: creation.thumbnail_color }} />

      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate group-hover:text-cyan-300 transition-colors">
              {creation.title || 'Untitled'}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5 truncate">{creation.prompt}</div>
          </div>
          <div className={`flex items-center gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0'}`}>
            <button onClick={e => { e.stopPropagation(); onTogglePin(creation); }}
              className="p-1 rounded hover:bg-slate-800">
              {creation.is_pinned ? <PinOff size={12} className="text-amber-400" /> : <Pin size={12} className="text-slate-600" />}
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(creation.id); }}
              className="p-1 rounded hover:bg-red-500/10">
              <Trash2 size={12} className="text-slate-600 hover:text-red-400" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 text-[9px] rounded border ${CATEGORY_COLORS[creation.category] || CATEGORY_COLORS.dashboard}`}>
              {creation.category}
            </span>
            {(Array.isArray(creation.tags) ? creation.tags : []).slice(0, 2).map((tag: string) => (
              <span key={tag} className="px-1.5 py-0.5 text-[9px] rounded bg-slate-800 text-slate-500 border border-slate-700">
                {tag}
              </span>
            ))}
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
