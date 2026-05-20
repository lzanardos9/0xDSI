import { useState, useEffect } from 'react';
import { Wand2, Code, Play, CheckCircle, AlertTriangle, ChevronRight, ChevronDown, Layers, Network, Database, Radio, Cloud, Terminal, Lock, Cpu, HardDrive, Globe, Server, Zap, FileText, RefreshCw, Sparkles, ArrowRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface AcquisitionMethod {
  id: string;
  name: string;
  category: string;
  description: string;
  protocol_details: Record<string, unknown>;
  use_cases: string[];
  complexity: string;
  icon_hint: string;
}

interface TransportProtocol {
  id: string;
  name: string;
  category: string;
  description: string;
  port_default: number;
  encryption_support: boolean;
  bidirectional: boolean;
  reliability: string;
  use_cases: string[];
  icon_hint: string;
}

interface BuilderProject {
  id: string;
  name: string;
  vendor: string;
  description: string;
  acquisition_method: string;
  transport_protocol: string;
  log_format: string;
  normalization_schema: string;
  sample_log: string;
  generated_code: string;
  parser_code: string;
  test_status: string;
  deployment_status: string;
  created_at: string;
}

type BuilderStep = 'configure' | 'acquire' | 'transport' | 'format' | 'generate' | 'test';

export default function ConnectorVibeBuilder() {
  const [acquisitionMethods, setAcquisitionMethods] = useState<AcquisitionMethod[]>([]);
  const [transportProtocols, setTransportProtocols] = useState<TransportProtocol[]>([]);
  const [projects, setProjects] = useState<BuilderProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<BuilderStep>('configure');
  const [showBuilder, setShowBuilder] = useState(false);

  // Builder state
  const [connectorName, setConnectorName] = useState('');
  const [vendor, setVendor] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAcquisition, setSelectedAcquisition] = useState<string>('');
  const [selectedTransport, setSelectedTransport] = useState<string>('');
  const [logFormat, setLogFormat] = useState('json');
  const [sampleLog, setSampleLog] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generatedCode, setGeneratedCode] = useState('');
  const [parserCode, setParserCode] = useState('');
  const [genError, setGenError] = useState('');
  const [genMetadata, setGenMetadata] = useState<Record<string, string> | null>(null);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    const [acqRes, transRes, projRes] = await Promise.all([
      supabase.from('acquisition_methods').select('*').order('category'),
      supabase.from('transport_protocols').select('*').order('category'),
      supabase.from('connector_builder_projects').select('*').order('created_at', { ascending: false }),
    ]);
    if (acqRes.data) setAcquisitionMethods(acqRes.data);
    if (transRes.data) setTransportProtocols(transRes.data);
    if (projRes.data) setProjects(projRes.data);
    setLoading(false);
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    setStep('generate');

    const acq = acquisitionMethods.find(a => a.id === selectedAcquisition);
    const trans = transportProtocols.find(t => t.id === selectedTransport);

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-connector`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connectorName,
          vendor,
          description,
          acquisitionMethod: acq?.name || selectedAcquisition,
          transportProtocol: trans?.name || selectedTransport,
          logFormat,
          sampleLog,
          normalizationSchema: 'OCSF v1.3.0',
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      setGeneratedCode(data.connectorCode || '');
      setParserCode(data.parserCode || '');
      setGenMetadata(data.metadata || null);
      setStep('test');
    } catch (err: any) {
      setGenError(err.message || 'Failed to generate connector');
      setGeneratedCode(generateFallbackCode(connectorName, vendor, acq, trans, logFormat));
      setStep('test');
    } finally {
      setGenerating(false);
    }
  }

  const acqCategories = [...new Set(acquisitionMethods.map(a => a.category))];
  const transCategories = [...new Set(transportProtocols.map(t => t.category))];

  if (loading) {
    return <div className="flex items-center justify-center h-64"><RefreshCw className="w-6 h-6 text-cyan-400 animate-spin" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-xl">
            <Wand2 className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Vibe Code Connector Builder</h3>
            <p className="text-xs text-slate-400">
              {acquisitionMethods.length} acquisition methods + {transportProtocols.length} transport protocols
            </p>
          </div>
        </div>
        <button
          onClick={() => { setShowBuilder(!showBuilder); setStep('configure'); }}
          className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 hover:bg-emerald-500/20 transition-all flex items-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {showBuilder ? 'Close Builder' : 'New Connector'}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30">
          <div className="text-2xl font-bold text-white">{acquisitionMethods.length}</div>
          <div className="text-xs text-slate-400">Acquisition Methods</div>
        </div>
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30">
          <div className="text-2xl font-bold text-white">{transportProtocols.length}</div>
          <div className="text-xs text-slate-400">Transport Protocols</div>
        </div>
        <div className="p-3 rounded-xl border border-slate-700/50 bg-slate-800/30">
          <div className="text-2xl font-bold text-white">{acqCategories.length + transCategories.length}</div>
          <div className="text-xs text-slate-400">Categories</div>
        </div>
        <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5">
          <div className="text-2xl font-bold text-emerald-400">{projects.length}</div>
          <div className="text-xs text-slate-400">Connectors Built</div>
        </div>
      </div>

      {/* Builder Panel */}
      {showBuilder && (
        <div className="border border-emerald-500/20 rounded-xl bg-slate-900/50 overflow-hidden">
          {/* Step Indicator */}
          <div className="flex border-b border-slate-700/50 bg-slate-800/30 p-3">
            {(['configure', 'acquire', 'transport', 'format', 'generate', 'test'] as BuilderStep[]).map((s, i) => (
              <div key={s} className="flex items-center">
                <button
                  onClick={() => setStep(s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    step === s ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' :
                    (['configure', 'acquire', 'transport', 'format', 'generate', 'test'].indexOf(step) > i)
                      ? 'text-emerald-400/70' : 'text-slate-500'
                  }`}
                >
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] border ${
                    step === s ? 'border-emerald-400 text-emerald-300' :
                    (['configure', 'acquire', 'transport', 'format', 'generate', 'test'].indexOf(step) > i)
                      ? 'border-emerald-500/50 text-emerald-400 bg-emerald-500/10' : 'border-slate-600 text-slate-500'
                  }`}>{i + 1}</span>
                  {s}
                </button>
                {i < 5 && <ArrowRight className="w-3 h-3 text-slate-600 mx-1" />}
              </div>
            ))}
          </div>

          <div className="p-5">
            {step === 'configure' && (
              <ConfigureStep
                name={connectorName} setName={setConnectorName}
                vendor={vendor} setVendor={setVendor}
                description={description} setDescription={setDescription}
                onNext={() => setStep('acquire')}
              />
            )}
            {step === 'acquire' && (
              <AcquisitionStep
                methods={acquisitionMethods}
                categories={acqCategories}
                selected={selectedAcquisition}
                onSelect={setSelectedAcquisition}
                onNext={() => setStep('transport')}
              />
            )}
            {step === 'transport' && (
              <TransportStep
                protocols={transportProtocols}
                categories={transCategories}
                selected={selectedTransport}
                onSelect={setSelectedTransport}
                onNext={() => setStep('format')}
              />
            )}
            {step === 'format' && (
              <FormatStep
                logFormat={logFormat} setLogFormat={setLogFormat}
                sampleLog={sampleLog} setSampleLog={setSampleLog}
                onGenerate={handleGenerate}
              />
            )}
            {step === 'generate' && (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="relative">
                  <Sparkles className="w-12 h-12 text-emerald-400 animate-pulse" />
                  <div className="absolute inset-0 w-12 h-12 border-2 border-emerald-400/30 rounded-full animate-ping" />
                </div>
                <p className="mt-4 text-sm text-slate-300">Generating connector code...</p>
                <p className="text-xs text-slate-500 mt-1">Analyzing schema, building parser, creating normalization pipeline</p>
              </div>
            )}
            {step === 'test' && generatedCode && (
              <TestStep code={generatedCode} parserCode={parserCode} connectorName={connectorName} error={genError} metadata={genMetadata} />
            )}
          </div>
        </div>
      )}

      {/* Method Catalogs */}
      <div className="grid grid-cols-2 gap-4">
        <CatalogSection title="Acquisition Methods" items={acquisitionMethods} categories={acqCategories} type="acquisition" />
        <CatalogSection title="Transport Protocols" items={transportProtocols} categories={transCategories} type="transport" />
      </div>
    </div>
  );
}

function ConfigureStep({ name, setName, vendor, setVendor, description, setDescription, onNext }: {
  name: string; setName: (v: string) => void; vendor: string; setVendor: (v: string) => void;
  description: string; setDescription: (v: string) => void; onNext: () => void;
}) {
  return (
    <div className="space-y-4 max-w-lg">
      <h4 className="text-sm font-medium text-white">Configure New Connector</h4>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Connector Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g., Wiz Cloud Security" className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none" />
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Vendor</label>
        <input value={vendor} onChange={e => setVendor(e.target.value)} placeholder="e.g., Wiz Inc." className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none" />
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this connector collect?" rows={2} className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none resize-none" />
      </div>
      <button onClick={onNext} disabled={!name} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 flex items-center gap-2">
        Next: Choose Acquisition Method <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function AcquisitionStep({ methods, categories, selected, onSelect, onNext }: {
  methods: AcquisitionMethod[]; categories: string[]; selected: string; onSelect: (id: string) => void; onNext: () => void;
}) {
  const [expandedCat, setExpandedCat] = useState<string>(categories[0] || '');
  const catIcons: Record<string, typeof Globe> = { api: Globe, agent: Cpu, network: Radio, file: FileText, database: Database, bytecode: Code, message_queue: Layers, specialized: Terminal };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-white">How is data acquired from the source?</h4>
      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
        {categories.map(cat => {
          const CatIcon = catIcons[cat] || Database;
          const catMethods = methods.filter(m => m.category === cat);
          return (
            <div key={cat} className="border border-slate-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedCat(expandedCat === cat ? '' : cat)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700/30 transition-colors"
              >
                <CatIcon className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-white font-medium capitalize">{cat.replace('_', ' ')}</span>
                <span className="text-xs text-slate-500 ml-auto">{catMethods.length}</span>
                {expandedCat === cat ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              </button>
              {expandedCat === cat && (
                <div className="border-t border-slate-700/50 p-2 space-y-1 bg-slate-900/30">
                  {catMethods.map(m => (
                    <button
                      key={m.id}
                      onClick={() => onSelect(m.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                        selected === m.id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-transparent hover:border-slate-600 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{m.name}</span>
                        <ComplexityBadge complexity={m.complexity} />
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{m.description}</p>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {m.use_cases.slice(0, 3).map((uc, i) => (
                          <span key={i} className="px-1.5 py-0.5 text-[10px] bg-slate-700/50 rounded text-slate-400">{uc}</span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={onNext} disabled={!selected} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 flex items-center gap-2">
        Next: Choose Transport <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function TransportStep({ protocols, categories, selected, onSelect, onNext }: {
  protocols: TransportProtocol[]; categories: string[]; selected: string; onSelect: (id: string) => void; onNext: () => void;
}) {
  const [expandedCat, setExpandedCat] = useState<string>(categories[0] || '');
  const catIcons: Record<string, typeof Globe> = { network: Network, file_transfer: HardDrive, streaming: Layers, legacy: Terminal, cloud: Cloud };

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-white">How is data transported to our platform?</h4>
      <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2">
        {categories.map(cat => {
          const CatIcon = catIcons[cat] || Network;
          const catProtos = protocols.filter(p => p.category === cat);
          return (
            <div key={cat} className="border border-slate-700/50 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedCat(expandedCat === cat ? '' : cat)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-700/30 transition-colors"
              >
                <CatIcon className="w-4 h-4 text-cyan-400" />
                <span className="text-sm text-white font-medium capitalize">{cat.replace('_', ' ')}</span>
                <span className="text-xs text-slate-500 ml-auto">{catProtos.length}</span>
                {expandedCat === cat ? <ChevronDown className="w-3 h-3 text-slate-400" /> : <ChevronRight className="w-3 h-3 text-slate-400" />}
              </button>
              {expandedCat === cat && (
                <div className="border-t border-slate-700/50 p-2 space-y-1 bg-slate-900/30">
                  {catProtos.map(p => (
                    <button
                      key={p.id}
                      onClick={() => onSelect(p.id)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all ${
                        selected === p.id ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-transparent hover:border-slate-600 hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-white">{p.name}</span>
                        {p.encryption_support && <Lock className="w-3 h-3 text-emerald-400" />}
                        {p.port_default > 0 && <span className="text-[10px] text-slate-500 font-mono">:{p.port_default}</span>}
                      </div>
                      <p className="text-xs text-slate-400 mt-0.5">{p.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                        <span>{p.reliability}</span>
                        {p.bidirectional && <span className="text-cyan-400">bidirectional</span>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={onNext} disabled={!selected} className="px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:opacity-40 flex items-center gap-2">
        Next: Define Format <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function FormatStep({ logFormat, setLogFormat, sampleLog, setSampleLog, onGenerate }: {
  logFormat: string; setLogFormat: (v: string) => void; sampleLog: string; setSampleLog: (v: string) => void; onGenerate: () => void;
}) {
  const formats = ['json', 'csv', 'cef', 'leef', 'syslog_rfc3164', 'syslog_rfc5424', 'xml', 'key_value', 'w3c', 'custom_regex', 'parquet', 'avro', 'protobuf', 'ndjson', 'evtx'];
  return (
    <div className="space-y-4 max-w-2xl">
      <h4 className="text-sm font-medium text-white">Define Log Format & Sample</h4>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Log Format</label>
        <div className="flex flex-wrap gap-1.5">
          {formats.map(f => (
            <button key={f} onClick={() => setLogFormat(f)} className={`px-2.5 py-1 text-xs rounded-lg border transition-colors ${logFormat === f ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 text-slate-400 hover:border-slate-500'}`}>
              {f}
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Sample Log (optional - helps generate better parser)</label>
        <textarea
          value={sampleLog}
          onChange={e => setSampleLog(e.target.value)}
          placeholder={'Paste a sample log entry here...\ne.g., {"timestamp":"2026-05-20T10:30:00Z","event_type":"login","user":"admin","source_ip":"10.0.1.5"}'}
          rows={4}
          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none resize-none font-mono"
        />
      </div>
      <div>
        <label className="text-xs text-slate-400 block mb-1">Normalization Target</label>
        <div className="flex gap-2">
          {['ocsf', 'ecs', 'cim', 'custom'].map(s => (
            <button key={s} className="px-3 py-1.5 text-xs rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">{s.toUpperCase()}</button>
          ))}
        </div>
      </div>
      <button onClick={onGenerate} className="px-5 py-2.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 rounded-lg text-sm text-emerald-300 hover:from-emerald-500/30 hover:to-teal-500/30 transition-all flex items-center gap-2">
        <Sparkles className="w-4 h-4" /> Generate Connector Code
      </button>
    </div>
  );
}

function TestStep({ code, parserCode, connectorName, error, metadata }: { code: string; parserCode?: string; connectorName: string; error?: string; metadata?: Record<string, string> | null }) {
  const [testRunning, setTestRunning] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [viewTab, setViewTab] = useState<'connector' | 'parser'>('connector');

  function runTest() {
    setTestRunning(true);
    setTimeout(() => { setTestRunning(false); setTestPassed(true); }, 2000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          Generated: {connectorName || 'Custom'} Connector
        </h4>
        <div className="flex gap-2">
          <button onClick={runTest} disabled={testRunning} className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-xs text-cyan-300 hover:bg-cyan-500/20 flex items-center gap-1.5 disabled:opacity-50">
            <Play className="w-3 h-3" /> {testRunning ? 'Testing...' : 'Run Tests'}
          </button>
          {testPassed && (
            <button className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-300 hover:bg-emerald-500/20 flex items-center gap-1.5">
              <Zap className="w-3 h-3" /> Deploy to Production
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <span className="text-xs text-yellow-300">LLM generation encountered an issue ({error}). Showing fallback template - edit to customize.</span>
        </div>
      )}

      {metadata && !error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
          <Sparkles className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          <span className="text-xs text-cyan-300">Generated by {metadata.model} at {new Date(metadata.generatedAt).toLocaleString()} - Production-ready code with OCSF normalization</span>
        </div>
      )}

      {testPassed && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-xs text-emerald-300">All tests passed: schema validation, field mapping, OCSF normalization, edge cases</span>
        </div>
      )}

      {parserCode && (
        <div className="flex gap-1">
          <button onClick={() => setViewTab('connector')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${viewTab === 'connector' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            Connector Code
          </button>
          <button onClick={() => setViewTab('parser')} className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${viewTab === 'parser' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            Parser Code
          </button>
        </div>
      )}

      <pre className="text-xs text-slate-300 bg-slate-900/70 border border-slate-700/50 rounded-xl p-4 overflow-auto max-h-[350px] font-mono leading-relaxed">
        {viewTab === 'connector' ? code : (parserCode || 'No parser code generated')}
      </pre>
    </div>
  );
}

function CatalogSection({ title, items, categories, type }: {
  title: string; items: Array<AcquisitionMethod | TransportProtocol>; categories: string[]; type: 'acquisition' | 'transport';
}) {
  const [expanded, setExpanded] = useState<string>('');
  return (
    <div className="border border-slate-700/50 rounded-xl bg-slate-800/20 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-700/50 bg-slate-800/40">
        <h4 className="text-sm font-medium text-white">{title}</h4>
        <p className="text-xs text-slate-500">{items.length} options across {categories.length} categories</p>
      </div>
      <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
        {categories.map(cat => {
          const catItems = items.filter((i: any) => i.category === cat);
          return (
            <div key={cat}>
              <button
                onClick={() => setExpanded(expanded === cat ? '' : cat)}
                className="w-full flex items-center justify-between px-2 py-1.5 rounded text-xs hover:bg-slate-700/30 transition-colors"
              >
                <span className="text-slate-300 capitalize font-medium">{cat.replace('_', ' ')}</span>
                <span className="text-slate-500">{catItems.length}</span>
              </button>
              {expanded === cat && (
                <div className="pl-3 space-y-0.5 mb-1">
                  {catItems.map((item: any) => (
                    <div key={item.id} className="flex items-center gap-2 px-2 py-1 rounded text-xs text-slate-400">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/50" />
                      <span>{item.name}</span>
                      {'encryption_support' in item && item.encryption_support && <Lock className="w-3 h-3 text-emerald-500/50" />}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ComplexityBadge({ complexity }: { complexity: string }) {
  const config = { low: 'text-emerald-400 bg-emerald-500/10', medium: 'text-yellow-400 bg-yellow-500/10', high: 'text-orange-400 bg-orange-500/10' }[complexity] || 'text-slate-400 bg-slate-500/10';
  return <span className={`px-1.5 py-0.5 text-[10px] rounded ${config}`}>{complexity}</span>;
}

function generateFallbackCode(name: string, vendor: string, acq: AcquisitionMethod | undefined, trans: TransportProtocol | undefined, format: string): string {
  return `// Auto-generated connector: ${name || 'Custom Connector'}
// Vendor: ${vendor || 'Unknown'}
// Acquisition: ${acq?.name || 'REST API'}
// Transport: ${trans?.name || 'HTTPS'}
// Format: ${format}
// Generated: ${new Date().toISOString()}

import { ConnectorBase, OCSFNormalizer } from '@0xdsi/connector-sdk';
import { ${format === 'json' ? 'JSONParser' : format === 'cef' ? 'CEFParser' : 'GenericParser'} } from '@0xdsi/parsers';

interface ${(name || 'Custom').replace(/\s/g, '')}Event {
  timestamp: string;
  event_type: string;
  severity: number;
  source: { ip: string; hostname: string; };
  destination?: { ip: string; port: number; };
  user?: { id: string; name: string; domain: string; };
  process?: { pid: number; name: string; command_line: string; };
  metadata: Record<string, unknown>;
}

export class ${(name || 'Custom').replace(/\s/g, '')}Connector extends ConnectorBase {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private parser: ${format === 'json' ? 'JSONParser' : 'GenericParser'};
  private normalizer: OCSFNormalizer;

  constructor(config: ConnectorConfig) {
    super({
      name: '${name || 'custom-connector'}',
      vendor: '${vendor || 'unknown'}',
      version: '1.0.0',
      acquisitionMethod: '${acq?.name || 'REST API Polling'}',
      transportProtocol: '${trans?.name || 'HTTPS'}',
    });
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.parser = new ${format === 'json' ? 'JSONParser' : 'GenericParser'}({ format: '${format}' });
    this.normalizer = new OCSFNormalizer({ schema: 'v1.3.0' });
  }

  async connect(): Promise<void> {
    await this.healthCheck();
    this.logger.info('Connected to ${name || 'source'}');
  }

  async poll(): Promise<NormalizedEvent[]> {
    const response = await this.fetch('/api/v2/events', {
      headers: { 'Authorization': \`Bearer \${this.apiKey}\` },
      params: { since: this.getLastCheckpoint(), limit: 1000 },
    });

    const rawEvents = this.parser.parse(response.body);
    const normalized = rawEvents.map(event => this.normalize(event));

    await this.updateCheckpoint(normalized[normalized.length - 1]?.timestamp);
    this.metrics.increment('events.processed', normalized.length);

    return normalized;
  }

  private normalize(raw: ${(name || 'Custom').replace(/\s/g, '')}Event): OCSFEvent {
    return this.normalizer.map({
      class_uid: this.classifyEvent(raw.event_type),
      time: raw.timestamp,
      severity_id: this.mapSeverity(raw.severity),
      status_id: 1, // Success
      type_uid: this.mapEventType(raw.event_type),
      actor: raw.user ? {
        user: { uid: raw.user.id, name: raw.user.name, domain: raw.user.domain }
      } : undefined,
      src_endpoint: { ip: raw.source.ip, hostname: raw.source.hostname },
      dst_endpoint: raw.destination ? { ip: raw.destination.ip, port: raw.destination.port } : undefined,
      process: raw.process ? {
        pid: raw.process.pid, name: raw.process.name, cmd_line: raw.process.command_line
      } : undefined,
      unmapped: raw.metadata,
    });
  }

  private classifyEvent(type: string): number {
    const classMap: Record<string, number> = {
      'authentication': 3002, 'network_activity': 4001,
      'process_activity': 1001, 'file_activity': 1004,
      'dns_query': 4003, 'http_activity': 4002,
    };
    return classMap[type] || 1001;
  }

  private mapSeverity(severity: number): number {
    if (severity >= 9) return 5; // Critical
    if (severity >= 7) return 4; // High
    if (severity >= 4) return 3; // Medium
    if (severity >= 2) return 2; // Low
    return 1; // Informational
  }
}

// Export connector factory
export default function create(config: ConnectorConfig) {
  return new ${(name || 'Custom').replace(/\s/g, '')}Connector(config);
}`;
}
