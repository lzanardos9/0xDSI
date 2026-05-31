import { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, Shield, Building2, Upload, ClipboardPaste, X, AlertTriangle, CheckCircle, TrendingUp, TrendingDown, ArrowRight, Copy, RotateCcw, FileSearch, AlertCircle, Star, Bookmark, Network, Scale, FileWarning, Bug, ClipboardCheck, Lock, Database, Loader2, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { callFunction } from '../lib/llmGateway';

interface Finding {
  title: string;
  severity: string;
  description: string;
  cvss_score?: number;
  affected_assets: string[];
  remediation: string;
  category: string;
  rto_hours?: number;
  rpo_hours?: number;
  financial_impact?: string;
}

interface AssetEnrichment {
  asset_name: string;
  new_vulnerabilities: string[];
  risk_change: 'increased' | 'decreased' | 'unchanged';
  notes: string;
}

interface AnalysisResult {
  analysis: {
    summary: string;
    risk_rating: string;
    findings: Finding[];
    asset_enrichments: AssetEnrichment[];
    executive_recommendations: string[];
    compliance_impacts: { framework: string; impact: string }[];
  };
  document_name: string;
  document_type: string;
  tokens_used: number;
  analyzed_at: string;
}

type DocumentType = 'penetration_test' | 'business_impact' | 'network_diagram' | 'security_policy' | 'legal_agreement' | 'incident_report' | 'vulnerability_assessment' | 'compliance_audit';
type InputMode = 'upload' | 'paste';

const PHASES = ['Reading document...', 'Extracting security findings...', 'Correlating with existing assets...', 'Generating recommendations...'];

const sevColor = (s: string) => {
  const k = s?.toLowerCase();
  return k === 'critical' ? 'bg-red-500/20 text-red-400 border-red-500/30'
    : k === 'high' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
    : k === 'medium' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    : k === 'low' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    : 'bg-slate-500/20 text-slate-400 border-slate-500/30';
};

const riskColor = (r: string) => {
  const k = r?.toLowerCase();
  return k === 'critical' ? 'bg-red-600 text-white' : k === 'high' ? 'bg-amber-600 text-white'
    : k === 'medium' ? 'bg-yellow-600 text-black' : k === 'low' ? 'bg-emerald-600 text-white'
    : 'bg-cyan-600 text-white';
};

export default function DocumentAnalysis() {
  const [docType, setDocType] = useState<DocumentType>('penetration_test');
  const [inputMode, setInputMode] = useState<InputMode>('upload');
  const [documentText, setDocumentText] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [phase, setPhase] = useState(0);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState<number | null>(null);
  const [applyingAll, setApplyingAll] = useState(false);
  const [enrichMsg, setEnrichMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const timers = useRef<ReturnType<typeof setInterval>[]>([]);

  useEffect(() => () => timers.current.forEach(clearInterval), []);

  const readFile = useCallback((file: File) => {
    setDocumentName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => setDocumentText((e.target?.result as string) || '');
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  }, [readFile]);

  const startAnalysis = async () => {
    if (!documentText.trim()) return;
    setAnalyzing(true);
    setError(null);
    setPhase(0);
    setProgress(0);
    timers.current.forEach(clearInterval);
    timers.current = [
      setInterval(() => setPhase(p => Math.min(p + 1, PHASES.length - 1)), 3000),
      setInterval(() => setProgress(p => p < 92 ? p + Math.random() * 8 : p), 400),
    ];
    try {
      const { data, error } = await callFunction('analyze-document', {
        documentText: documentText.trim(),
        documentName: documentName || 'Untitled Document',
        documentType: docType,
      });
      if (error) throw new Error(error);
      const result = data as AnalysisResult;
      setProgress(100);
      setTimeout(() => setResult(result), 300);
    } catch (err: any) {
      setError(err.message || 'Analysis failed');
    } finally {
      timers.current.forEach(clearInterval);
      setAnalyzing(false);
    }
  };

  const applyEnrichment = async (ae: AssetEnrichment, idx: number) => {
    if (applied.has(idx) || !result) return;
    setApplying(idx);
    setEnrichMsg(null);
    try {
      const { data: assets } = await supabase
        .from('asset_registry')
        .select('id, asset_name, known_vulnerabilities, criticality, metadata, doc_enrichment_count')
        .or(`asset_name.ilike.%${ae.asset_name}%,ip_address.eq.${ae.asset_name}`)
        .limit(1);

      if (assets && assets.length > 0) {
        const asset = assets[0];
        const currentVulns: string[] = asset.known_vulnerabilities || [];
        const newVulns = [...new Set([...currentVulns, ...(ae.new_vulnerabilities || [])])];
        const currentMeta = (asset.metadata || {}) as Record<string, unknown>;
        const nextCriticality = ae.risk_change === 'increased'
          ? (asset.criticality === 'low' ? 'medium' : asset.criticality === 'medium' ? 'high' : asset.criticality === 'high' ? 'very_high' : asset.criticality)
          : asset.criticality;

        await supabase.from('asset_registry').update({
          known_vulnerabilities: newVulns,
          criticality: nextCriticality,
          metadata: { ...currentMeta, doc_intel_notes: ae.notes, last_enrichment_source: result.document_name },
          doc_enrichment_count: ((asset.doc_enrichment_count as number) || 0) + 1,
          last_doc_enrichment: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', asset.id);

        await supabase.from('asset_enrichment_log').insert({
          asset_id: asset.id,
          asset_name: asset.asset_name,
          document_name: result.document_name,
          document_type: result.document_type,
          enrichment_type: 'update_existing',
          changes_applied: { new_vulnerabilities: ae.new_vulnerabilities, risk_change: ae.risk_change, notes: ae.notes, previous_criticality: asset.criticality, new_criticality: nextCriticality },
        });

        setApplied(prev => new Set(prev).add(idx));
        setEnrichMsg(`Updated "${asset.asset_name}" in Asset Registry`);
      } else {
        await supabase.from('asset_registry').insert({
          asset_name: ae.asset_name,
          asset_type: 'server',
          ip_address: '0.0.0.0',
          location: 'Internal',
          criticality: ae.risk_change === 'increased' ? 'high' : 'medium',
          known_vulnerabilities: ae.new_vulnerabilities || [],
          metadata: { doc_intel_notes: ae.notes, source_document: result.document_name, needs_ip_assignment: true },
          doc_enrichment_count: 1,
          last_doc_enrichment: new Date().toISOString(),
        });

        await supabase.from('asset_enrichment_log').insert({
          asset_name: ae.asset_name,
          document_name: result.document_name,
          document_type: result.document_type,
          enrichment_type: 'add_new',
          changes_applied: { new_vulnerabilities: ae.new_vulnerabilities, risk_change: ae.risk_change, notes: ae.notes },
        });

        setApplied(prev => new Set(prev).add(idx));
        setEnrichMsg(`Created new asset "${ae.asset_name}" in Asset Registry`);
      }
    } catch (err: unknown) {
      setEnrichMsg(`Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setApplying(null);
    }
  };

  const applyAllEnrichments = async () => {
    if (!result) return;
    setApplyingAll(true);
    setEnrichMsg(null);
    let count = 0;
    for (let i = 0; i < result.analysis.asset_enrichments.length; i++) {
      if (!applied.has(i)) {
        await applyEnrichment(result.analysis.asset_enrichments[i], i);
        count++;
      }
    }
    setApplyingAll(false);
    setEnrichMsg(`Applied ${count} enrichment${count !== 1 ? 's' : ''} to the Asset Registry`);
  };

  const reset = () => { setResult(null); setDocumentText(''); setDocumentName(''); setError(null); setPhase(0); setProgress(0); setApplied(new Set()); setEnrichMsg(null); };

  if (result) {
    const { analysis: a } = result;
    return (
      <div className="min-h-screen bg-slate-950 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
              <FileSearch className="w-6 h-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Analysis Results</h1>
              <p className="text-sm text-slate-400">{result.document_name}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))} className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:bg-slate-700 transition-colors text-sm">
              <Copy className="w-4 h-4" /> Export JSON
            </button>
            <button onClick={reset} className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-lg text-white transition-colors text-sm font-medium">
              <RotateCcw className="w-4 h-4" /> Analyze Another
            </button>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${riskColor(a.risk_rating)}`}>{a.risk_rating} Risk</span>
            <span className="text-xs text-slate-500">{new Date(result.analyzed_at).toLocaleString()}</span>
            <span className="text-xs text-slate-600">{result.tokens_used.toLocaleString()} tokens</span>
          </div>
          <p className="text-slate-300 leading-relaxed mb-4">{a.summary}</p>
          <div className="flex gap-6 pt-4 border-t border-slate-800">
            {[['Findings', a.findings.length], ['Assets', a.asset_enrichments.length], ['Compliance', a.compliance_impacts.length], ['Actions', a.executive_recommendations.length]].map(([label, count]) => (
              <div key={label as string} className="text-center">
                <div className="text-2xl font-bold text-white">{count}</div>
                <div className="text-xs text-slate-500">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {a.findings.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Findings
            </h2>
            <div className="grid gap-4">
              {a.findings.map((f, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${sevColor(f.severity)}`}>{f.severity}</span>
                      <h3 className="text-white font-medium">{f.title}</h3>
                      {f.cvss_score !== undefined && <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded">CVSS {f.cvss_score}</span>}
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs bg-slate-800 text-slate-400 border border-slate-700 whitespace-nowrap">{f.category}</span>
                  </div>
                  <p className="text-sm text-slate-400 mb-3">{f.description}</p>
                  {(f.rto_hours !== undefined || f.rpo_hours !== undefined || f.financial_impact) && (
                    <div className="flex gap-4 mb-3 flex-wrap">
                      {f.rto_hours !== undefined && <div className="bg-slate-800/50 rounded-lg px-3 py-1.5"><span className="text-xs text-slate-500">RTO</span><span className="text-sm text-white ml-2">{f.rto_hours}h</span></div>}
                      {f.rpo_hours !== undefined && <div className="bg-slate-800/50 rounded-lg px-3 py-1.5"><span className="text-xs text-slate-500">RPO</span><span className="text-sm text-white ml-2">{f.rpo_hours}h</span></div>}
                      {f.financial_impact && <div className="bg-slate-800/50 rounded-lg px-3 py-1.5"><span className="text-xs text-slate-500">Impact</span><span className="text-sm text-amber-400 ml-2">{f.financial_impact}</span></div>}
                    </div>
                  )}
                  {f.affected_assets.length > 0 && (
                    <div className="mb-3">
                      <span className="text-xs text-slate-500 mb-1 block">Affected Assets</span>
                      <div className="flex flex-wrap gap-1.5">
                        {f.affected_assets.map((asset, j) => <span key={j} className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded px-2 py-0.5">{asset}</span>)}
                      </div>
                    </div>
                  )}
                  <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3">
                    <span className="text-xs font-medium text-emerald-400 block mb-1">Remediation</span>
                    <p className="text-sm text-slate-300">{f.remediation}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {a.asset_enrichments.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white flex items-center gap-2"><Database className="w-5 h-5 text-cyan-400" /> Asset Enrichments</h2>
              {applied.size < a.asset_enrichments.length && (
                <button
                  onClick={applyAllEnrichments}
                  disabled={applyingAll}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 rounded-lg text-white text-sm font-medium transition-colors"
                >
                  {applyingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
                  Apply All to Asset Registry
                </button>
              )}
              {applied.size === a.asset_enrichments.length && a.asset_enrichments.length > 0 && (
                <span className="flex items-center gap-2 text-sm text-emerald-400 font-medium">
                  <CheckCircle className="w-4 h-4" /> All enrichments applied
                </span>
              )}
            </div>
            {enrichMsg && (
              <div className={`flex items-center gap-2 mb-3 px-4 py-2.5 rounded-lg text-sm ${enrichMsg.startsWith('Failed') ? 'bg-red-500/10 border border-red-500/20 text-red-400' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'}`}>
                {enrichMsg.startsWith('Failed') ? <AlertCircle className="w-4 h-4 flex-shrink-0" /> : <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                {enrichMsg}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-2">
              {a.asset_enrichments.map((ae, i) => (
                <div key={i} className={`bg-slate-900 border rounded-xl p-4 transition-all ${applied.has(i) ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-slate-800'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium">{ae.asset_name}</span>
                    <span className={`flex items-center gap-1 text-xs font-medium ${ae.risk_change === 'increased' ? 'text-red-400' : ae.risk_change === 'decreased' ? 'text-emerald-400' : 'text-slate-400'}`}>
                      {ae.risk_change === 'increased' && <TrendingUp className="w-3 h-3" />}
                      {ae.risk_change === 'decreased' && <TrendingDown className="w-3 h-3" />}
                      {ae.risk_change}
                    </span>
                  </div>
                  {ae.new_vulnerabilities && ae.new_vulnerabilities.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {ae.new_vulnerabilities.map((v, j) => <span key={j} className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 rounded px-2 py-0.5">{v}</span>)}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mb-3">{ae.notes}</p>
                  {applied.has(i) ? (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Applied to Asset Registry
                    </div>
                  ) : (
                    <button
                      onClick={() => applyEnrichment(ae, i)}
                      disabled={applying === i}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 rounded-lg text-cyan-400 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {applying === i ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                      {applying === i ? 'Applying...' : 'Apply to Asset Registry'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {a.executive_recommendations.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Star className="w-5 h-5 text-amber-400" /> Executive Recommendations</h2>
            <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
              {a.executive_recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-4 p-4">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-sm font-bold text-cyan-400">{i + 1}</span>
                  <p className="text-sm text-slate-300 leading-relaxed pt-1">{rec}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {a.compliance_impacts.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2"><Bookmark className="w-5 h-5 text-blue-400" /> Compliance Impacts</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {a.compliance_impacts.map((ci, i) => (
                <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                  <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5 inline-block mb-2">{ci.framework}</span>
                  <p className="text-sm text-slate-400">{ci.impact}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-6 space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
          <FileSearch className="w-6 h-6 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white">Document Intelligence</h1>
          <p className="text-sm text-slate-400">Upload security documents for AI-powered analysis, risk extraction, and compliance mapping</p>
        </div>
      </div>

      <div>
        <label className="text-sm font-medium text-slate-400 block mb-3">Document Type</label>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {([
            { type: 'penetration_test' as const, icon: Shield, title: 'Penetration Test Report', desc: 'Vulnerability findings, CVSS scores, and remediation from pentest reports' },
            { type: 'business_impact' as const, icon: Building2, title: 'Business Impact Analysis', desc: 'RTO/RPO targets, financial impacts, and critical process dependencies' },
            { type: 'network_diagram' as const, icon: Network, title: 'Network Architecture', desc: 'Topology diagrams, segmentation analysis, and attack surface mapping' },
            { type: 'security_policy' as const, icon: Lock, title: 'Security Policy', desc: 'Security standards, access control policies, and procedure documents' },
            { type: 'legal_agreement' as const, icon: Scale, title: 'Legal Agreement', desc: 'NDAs, DPAs, vendor contracts, and regulatory compliance clauses' },
            { type: 'incident_report' as const, icon: FileWarning, title: 'Incident Report', desc: 'Post-mortem analysis, root cause findings, and response timeline' },
            { type: 'vulnerability_assessment' as const, icon: Bug, title: 'Vulnerability Assessment', desc: 'Scan results, CVE analysis, patch prioritization, and risk scoring' },
            { type: 'compliance_audit' as const, icon: ClipboardCheck, title: 'Compliance Audit', desc: 'SOC 2, ISO 27001, PCI-DSS, HIPAA audit findings and gap analysis' },
          ]).map(({ type, icon: Icon, title, desc }) => (
            <button key={type} onClick={() => setDocType(type)} className={`relative p-4 rounded-xl border-2 text-left transition-all ${docType === type ? 'border-cyan-500 bg-cyan-500/5' : 'border-slate-700 bg-slate-900 hover:border-slate-600'}`}>
              {docType === type && <div className="absolute top-2.5 right-2.5"><CheckCircle className="w-4 h-4 text-cyan-400" /></div>}
              <Icon className={`w-6 h-6 mb-2 ${docType === type ? 'text-cyan-400' : 'text-slate-500'}`} />
              <div className={`text-sm font-semibold mb-0.5 ${docType === type ? 'text-white' : 'text-slate-300'}`}>{title}</div>
              <p className="text-xs text-slate-500 leading-relaxed">{desc}</p>
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2 mb-3">
          <label className="text-sm font-medium text-slate-400">Document Input</label>
          <div className="flex ml-auto bg-slate-800 rounded-lg p-0.5">
            {([
              { mode: 'upload' as const, icon: Upload, label: 'Upload File' },
              { mode: 'paste' as const, icon: ClipboardPaste, label: 'Paste Text' },
            ]).map(({ mode, icon: Icon, label }) => (
              <button key={mode} onClick={() => setInputMode(mode)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${inputMode === mode ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>

        {inputMode === 'upload' ? (
          <div>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${dragOver ? 'border-cyan-400 bg-cyan-500/5' : 'border-slate-700 hover:border-slate-500 bg-slate-900/50'}`}
            >
              <input ref={fileRef} type="file" accept=".pdf,.txt,.csv,.doc" onChange={(e) => { if (e.target.files?.[0]) readFile(e.target.files[0]); }} className="hidden" />
              <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-cyan-400' : 'text-slate-500'}`} />
              <p className="text-sm text-slate-300 font-medium mb-1">{documentName || 'Drop file here or click to browse'}</p>
              <p className="text-xs text-slate-500">Supports PDF, TXT, CSV, DOC files</p>
            </div>
            {documentName && (
              <div className="mt-3 flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg p-3">
                <FileText className="w-4 h-4 text-cyan-400 flex-shrink-0" />
                <span className="text-sm text-slate-300 truncate flex-1">{documentName}</span>
                <span className="text-xs text-slate-500">{(documentText.length / 1024).toFixed(1)} KB</span>
                <button onClick={() => { setDocumentName(''); setDocumentText(''); }} className="text-slate-500 hover:text-red-400 transition-colors"><X className="w-4 h-4" /></button>
              </div>
            )}
            <p className="mt-2 text-xs text-slate-600">For best results with PDF files, paste the text content directly using the Paste Text tab.</p>
          </div>
        ) : (
          <textarea
            value={documentText}
            onChange={(e) => setDocumentText(e.target.value)}
            placeholder="Paste your document text here..."
            className="w-full h-64 bg-slate-900 border border-slate-700 rounded-xl p-4 text-sm text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none font-mono"
          />
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="w-4 h-4" /></button>
        </div>
      )}

      {analyzing ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-8">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="w-16 h-16 rounded-full border-4 border-slate-700 border-t-cyan-400 animate-spin" />
              <div className="absolute inset-0 flex items-center justify-center"><FileSearch className="w-6 h-6 text-cyan-400" /></div>
            </div>
            <p className="text-white font-medium mb-2">{PHASES[phase]}</p>
            <div className="w-full max-w-md">
              <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                <span>Progress</span><span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              {PHASES.map((_, i) => <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i <= phase ? 'bg-cyan-400' : 'bg-slate-700'}`} />)}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={startAnalysis}
          disabled={!documentText.trim()}
          className={`w-full py-3.5 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-all ${documentText.trim() ? 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-500/20' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}
        >
          <FileSearch className="w-4 h-4" /> Analyze Document <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
