import { useState, useEffect } from 'react';
import { FileCode2, Cpu, Shield, Terminal, Upload, Copy, Check, AlertTriangle, ChevronRight, Crosshair, Binary, MemoryStick } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface CrashAnalysis {
  id: string;
  input_type: string;
  input_filename: string;
  crash_input_text: string;
  architecture: string;
  os_type: string;
  binary_name: string;
  signal_info: string;
  faulting_address: string;
  instruction_pointer: string;
  stack_pointer: string;
  registers: Record<string, string>;
  stack_trace: { frame: number; address: string; function: string; file: string }[];
  memory_maps: { start: string; end: string; perms: string; name: string }[];
  exploitability_class: string;
  exploitability_score: number;
  controlled_regions: string[];
  primitive_achieved: string;
  constraints: Record<string, unknown>;
  llm_analysis: string;
  shellcode_hex: string;
  shellcode_asm: string;
  shellcode_description: string;
  shellcode_size: number;
  shellcode_arch: string;
  shellcode_type: string;
  shellcode_bad_bytes: string;
  analysis_status: string;
  created_at: string;
}

const EXPLOITABILITY_COLORS: Record<string, string> = {
  controlled_rip: 'text-red-400 bg-red-500/10 border-red-500/30',
  write_what_where: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  heap_corruption: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  stack_bof: 'text-red-400 bg-red-500/10 border-red-500/30',
  format_string: 'text-orange-400 bg-orange-500/10 border-orange-500/30',
  null_deref: 'text-green-400 bg-green-500/10 border-green-500/30',
  unknown: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
};

const INPUT_TYPES = [
  { value: 'gdb_output', label: 'GDB Output' },
  { value: 'windbg_output', label: 'WinDbg Output' },
  { value: 'asan_report', label: 'AddressSanitizer Report' },
  { value: 'coredump', label: 'Core Dump (ELF)' },
  { value: 'minidump', label: 'Minidump (.dmp)' },
  { value: 'crash_text', label: 'Crash Report (text)' },
];

export default function CrashAnalysisPanel() {
  const [analyses, setAnalyses] = useState<CrashAnalysis[]>([]);
  const [selected, setSelected] = useState<CrashAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [detailTab, setDetailTab] = useState<'registers' | 'analysis' | 'shellcode'>('registers');
  const [copied, setCopied] = useState('');

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('crash_analyses')
      .select('*')
      .eq('analysis_status', 'complete')
      .order('exploitability_score', { ascending: false });
    setAnalyses(data || []);
    if (data && data.length > 0 && !selected) {
      setSelected(data[0]);
    }
    setLoading(false);
  };

  const submitCrashAnalysis = async (formData: CrashSubmitForm) => {
    setAnalyzing(true);
    try {
      const apiUrl = `/api/crash-analyze`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (result.id) {
        setShowUpload(false);
        await loadAnalyses();
        const { data } = await supabase
          .from('crash_analyses')
          .select('*')
          .eq('id', result.id)
          .maybeSingle();
        if (data) setSelected(data);
      }
    } catch (err) {
      console.error('Crash analysis failed:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(''), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Cpu className="w-8 h-8 text-orange-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
            <Binary className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Crash Analysis &amp; Shellcode Generation</h3>
            <p className="text-xs text-slate-400">Upload coredumps, paste debugger output, generate architecture-specific shellcode</p>
          </div>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-medium hover:from-red-700 hover:to-orange-700 transition-all flex items-center gap-2"
        >
          <Upload className="w-4 h-4" />
          Analyze Crash
        </button>
      </div>

      {/* Analysis List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {analyses.map(a => (
          <button
            key={a.id}
            onClick={() => { setSelected(a); setDetailTab('registers'); }}
            className={`text-left p-3 rounded-lg border transition-all ${
              selected?.id === a.id
                ? 'bg-slate-800 border-orange-500/60 shadow-lg shadow-orange-500/10'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-500'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-mono text-slate-300">{a.binary_name || a.input_filename}</span>
              <span className={`text-xs font-bold ${a.exploitability_score >= 80 ? 'text-red-400' : a.exploitability_score >= 60 ? 'text-orange-400' : 'text-yellow-400'}`}>
                {a.exploitability_score}%
              </span>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${EXPLOITABILITY_COLORS[a.exploitability_class] || EXPLOITABILITY_COLORS.unknown}`}>
                {a.exploitability_class.replace(/_/g, ' ')}
              </span>
              <span className="text-[10px] text-slate-500">{a.architecture} / {a.os_type}</span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1 truncate">{a.signal_info}</div>
          </button>
        ))}
      </div>

      {selected && (
        <>
          {/* Crash Overview */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Left: Crash Context */}
              <div className="lg:col-span-4 space-y-3">
                <h4 className="text-sm font-medium text-white flex items-center gap-2">
                  <Crosshair className="w-4 h-4 text-red-400" />
                  Crash Context
                </h4>
                <div className="space-y-2">
                  <InfoRow label="Binary" value={selected.binary_name} />
                  <InfoRow label="Signal" value={selected.signal_info} />
                  <InfoRow label="Faulting Addr" value={selected.faulting_address} mono />
                  <InfoRow label="RIP/EIP/PC" value={selected.instruction_pointer} mono />
                  <InfoRow label="RSP/ESP/SP" value={selected.stack_pointer} mono />
                  <InfoRow label="Architecture" value={`${selected.architecture} / ${selected.os_type}`} />
                  <InfoRow label="Input Type" value={selected.input_type.replace(/_/g, ' ')} />
                </div>
              </div>

              {/* Center: Exploitability */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center">
                <div className={`w-28 h-28 rounded-full border-4 flex flex-col items-center justify-center ${
                  selected.exploitability_score >= 80 ? 'bg-red-500/15 border-red-500/50' :
                  selected.exploitability_score >= 60 ? 'bg-orange-500/15 border-orange-500/50' :
                  'bg-yellow-500/15 border-yellow-500/50'
                }`}>
                  <span className={`text-2xl font-bold ${
                    selected.exploitability_score >= 80 ? 'text-red-400' :
                    selected.exploitability_score >= 60 ? 'text-orange-400' : 'text-yellow-400'
                  }`}>
                    {selected.exploitability_score}
                  </span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Exploitability</span>
                </div>
                <span className={`mt-3 text-xs px-2.5 py-1 rounded border ${EXPLOITABILITY_COLORS[selected.exploitability_class] || EXPLOITABILITY_COLORS.unknown}`}>
                  {selected.exploitability_class.replace(/_/g, ' ').toUpperCase()}
                </span>
                <p className="text-[11px] text-slate-400 mt-2 text-center max-w-[200px]">{selected.primitive_achieved}</p>
              </div>

              {/* Right: Controlled Regions + Constraints */}
              <div className="lg:col-span-4 space-y-3">
                <h4 className="text-sm font-medium text-white flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-orange-400" />
                  Attacker Control
                </h4>
                <div className="space-y-1">
                  {(selected.controlled_regions || []).map((r, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-red-400" />
                      <span className="text-slate-300 font-mono">{r}</span>
                    </div>
                  ))}
                </div>
                {selected.constraints && Object.keys(selected.constraints).length > 0 && (
                  <div className="mt-3">
                    <div className="text-[10px] text-slate-500 mb-1">Constraints</div>
                    <div className="flex flex-wrap gap-1">
                      {Object.entries(selected.constraints).map(([k, v]) => (
                        <span key={k} className="text-[10px] px-2 py-0.5 rounded bg-slate-900 border border-slate-600 text-slate-300">
                          {k}: {String(v)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Detail Tabs */}
          <div className="bg-slate-800 rounded-xl border border-slate-700">
            <div className="flex border-b border-slate-700">
              <button onClick={() => setDetailTab('registers')} className={`px-5 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${detailTab === 'registers' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-900' : 'text-slate-400 hover:text-white'}`}>
                <Cpu className="w-4 h-4" />
                Registers &amp; Memory
              </button>
              <button onClick={() => setDetailTab('analysis')} className={`px-5 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${detailTab === 'analysis' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-900' : 'text-slate-400 hover:text-white'}`}>
                <FileCode2 className="w-4 h-4" />
                LLM Analysis
              </button>
              <button onClick={() => setDetailTab('shellcode')} className={`px-5 py-3 text-sm font-medium flex items-center gap-2 transition-colors ${detailTab === 'shellcode' ? 'text-orange-400 border-b-2 border-orange-400 bg-slate-900' : 'text-slate-400 hover:text-white'}`}>
                <Terminal className="w-4 h-4" />
                Shellcode
              </button>
            </div>

            <div className="p-5">
              {detailTab === 'registers' && <RegistersView analysis={selected} />}
              {detailTab === 'analysis' && <AnalysisView analysis={selected} />}
              {detailTab === 'shellcode' && <ShellcodeView analysis={selected} onCopy={copyToClipboard} copied={copied} />}
            </div>
          </div>
        </>
      )}

      {/* Upload Modal */}
      {showUpload && (
        <CrashUploadModal
          onClose={() => setShowUpload(false)}
          onSubmit={submitCrashAnalysis}
          analyzing={analyzing}
        />
      )}
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-slate-500">{label}</span>
      <span className={`text-[11px] text-slate-200 ${mono ? 'font-mono' : ''}`}>{value || '-'}</span>
    </div>
  );
}

function RegistersView({ analysis }: { analysis: CrashAnalysis }) {
  const regs = analysis.registers || {};
  const controlled = analysis.controlled_regions || [];
  const regEntries = Object.entries(regs);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Register State */}
        <div>
          <h5 className="text-xs font-medium text-slate-400 mb-2">Register State at Crash</h5>
          <div className="bg-slate-950 rounded-lg border border-slate-700 p-3 font-mono text-xs space-y-1">
            {regEntries.map(([reg, val]) => {
              const isControlled = controlled.some(c => c.toLowerCase().includes(reg.toLowerCase()));
              return (
                <div key={reg} className={`flex items-center justify-between py-0.5 px-2 rounded ${isControlled ? 'bg-red-500/10 border border-red-500/20' : ''}`}>
                  <span className={isControlled ? 'text-red-400 font-bold' : 'text-slate-400'}>{reg.toUpperCase()}</span>
                  <span className={isControlled ? 'text-red-300' : 'text-green-400'}>{val}</span>
                  {isControlled && <span className="text-[9px] text-red-500 ml-2">CONTROLLED</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Stack Trace */}
        <div>
          <h5 className="text-xs font-medium text-slate-400 mb-2">Stack Backtrace</h5>
          <div className="bg-slate-950 rounded-lg border border-slate-700 p-3 font-mono text-xs space-y-1">
            {(analysis.stack_trace || []).map((frame, i) => (
              <div key={i} className="flex items-start gap-2 py-0.5">
                <span className="text-slate-600 shrink-0">#{frame.frame}</span>
                <span className="text-cyan-400 shrink-0">{frame.address}</span>
                <span className="text-slate-300 truncate">{frame.function}</span>
              </div>
            ))}
            {(!analysis.stack_trace || analysis.stack_trace.length === 0) && (
              <span className="text-slate-500">No backtrace available</span>
            )}
          </div>

          {/* Memory Maps */}
          {analysis.memory_maps && analysis.memory_maps.length > 0 && (
            <div className="mt-3">
              <h5 className="text-xs font-medium text-slate-400 mb-2">Memory Maps</h5>
              <div className="bg-slate-950 rounded-lg border border-slate-700 p-3 font-mono text-[10px] space-y-0.5">
                {analysis.memory_maps.map((m, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-slate-500">{m.start}-{m.end}</span>
                    <span className={m.perms.includes('x') ? 'text-red-400' : 'text-green-400'}>{m.perms}</span>
                    <span className="text-slate-300">{m.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function AnalysisView({ analysis }: { analysis: CrashAnalysis }) {
  return (
    <div className="space-y-4">
      <div className="bg-slate-950 rounded-lg border border-slate-700 p-5">
        <pre className="text-xs text-slate-300 whitespace-pre-wrap leading-relaxed font-mono">{analysis.llm_analysis || 'No analysis available'}</pre>
      </div>
      {analysis.crash_input_text && (
        <details className="group">
          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-300 flex items-center gap-1">
            <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
            Raw Crash Input
          </summary>
          <div className="mt-2 bg-slate-950 rounded-lg border border-slate-700 p-3 max-h-60 overflow-y-auto">
            <pre className="text-[10px] text-slate-400 whitespace-pre-wrap font-mono">{analysis.crash_input_text}</pre>
          </div>
        </details>
      )}
    </div>
  );
}

function ShellcodeView({ analysis, onCopy, copied }: { analysis: CrashAnalysis; onCopy: (text: string, key: string) => void; copied: string }) {
  if (!analysis.shellcode_hex) {
    return <div className="text-center py-12 text-slate-400">No shellcode generated for this analysis</div>;
  }

  const hexFormatted = (analysis.shellcode_hex.match(/.{1,2}/g) || []).map(b => `\\x${b}`).join('');
  const pythonPayload = `shellcode = b"${hexFormatted}"`;

  return (
    <div className="space-y-4">
      {/* Shellcode Info */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-0.5">Architecture</div>
          <div className="text-sm text-slate-200 font-mono">{analysis.shellcode_arch}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-0.5">Type</div>
          <div className="text-sm text-slate-200">{analysis.shellcode_type.replace(/_/g, ' ')}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-0.5">Size</div>
          <div className="text-sm text-slate-200">{analysis.shellcode_size} bytes</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-0.5">Bad Bytes</div>
          <div className="text-sm text-red-400 font-mono">{analysis.shellcode_bad_bytes}</div>
        </div>
        <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
          <div className="text-[10px] text-slate-500 mb-0.5">Status</div>
          <div className="text-sm text-green-400">Generated</div>
        </div>
      </div>

      {/* Description */}
      <div className="bg-slate-900 rounded-lg p-3 border border-slate-700">
        <div className="text-[10px] text-slate-500 mb-1">Description</div>
        <p className="text-xs text-slate-300">{analysis.shellcode_description}</p>
      </div>

      {/* Hex Dump */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-slate-500">Shellcode (hex)</span>
          <button
            onClick={() => onCopy(pythonPayload, 'hex')}
            className="text-[10px] text-slate-400 hover:text-orange-400 flex items-center gap-1"
          >
            {copied === 'hex' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            Copy as Python
          </button>
        </div>
        <div className="bg-slate-950 rounded-lg border border-slate-700 p-3 overflow-x-auto">
          <pre className="text-xs text-green-400 font-mono whitespace-pre-wrap break-all">{hexFormatted}</pre>
        </div>
      </div>

      {/* Assembly */}
      {analysis.shellcode_asm && (
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-slate-500">Assembly (NASM)</span>
            <button
              onClick={() => onCopy(analysis.shellcode_asm, 'asm')}
              className="text-[10px] text-slate-400 hover:text-orange-400 flex items-center gap-1"
            >
              {copied === 'asm' ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              Copy
            </button>
          </div>
          <div className="bg-slate-950 rounded-lg border border-slate-700 p-3 max-h-80 overflow-y-auto">
            <pre className="text-xs text-cyan-400 font-mono whitespace-pre-wrap">{analysis.shellcode_asm}</pre>
          </div>
        </div>
      )}

      {/* Usage Warning */}
      <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-red-300/80">
          Generated shellcode is for authorized penetration testing and security research only. Always obtain proper authorization before testing exploitation techniques against target systems.
        </p>
      </div>
    </div>
  );
}

interface CrashSubmitForm {
  input_type: string;
  crash_input_text: string;
  architecture: string;
  os_type: string;
  binary_name: string;
  shellcode_type: string;
  bad_bytes: string;
}

function CrashUploadModal({ onClose, onSubmit, analyzing }: {
  onClose: () => void;
  onSubmit: (data: CrashSubmitForm) => void;
  analyzing: boolean;
}) {
  const [form, setForm] = useState<CrashSubmitForm>({
    input_type: 'gdb_output',
    crash_input_text: '',
    architecture: 'x86_64',
    os_type: 'linux',
    binary_name: '',
    shellcode_type: 'reverse_shell',
    bad_bytes: '\\x00',
  });

  const update = (field: keyof CrashSubmitForm, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setForm(prev => ({ ...prev, crash_input_text: text, input_filename: file.name }));
    };
    reader.readAsText(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-600 to-orange-600 flex items-center justify-center">
              <Binary className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Crash Analysis</h3>
              <p className="text-xs text-slate-400">Paste debugger output or upload crash dump</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Input Type</label>
              <select value={form.input_type} onChange={e => update('input_type', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
                {INPUT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Binary Name</label>
              <input type="text" value={form.binary_name} onChange={e => update('binary_name', e.target.value)} placeholder="e.g., nginx, httpd" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Architecture</label>
              <select value={form.architecture} onChange={e => update('architecture', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
                <option value="x86_64">x86_64</option>
                <option value="x86">x86 (32-bit)</option>
                <option value="arm64">ARM64</option>
                <option value="arm32">ARM32</option>
                <option value="mips">MIPS</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">OS</label>
              <select value={form.os_type} onChange={e => update('os_type', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
                <option value="linux">Linux</option>
                <option value="windows">Windows</option>
                <option value="macos">macOS</option>
                <option value="freebsd">FreeBSD</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 block mb-1">Shellcode Type</label>
              <select value={form.shellcode_type} onChange={e => update('shellcode_type', e.target.value)} className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:border-orange-500 focus:outline-none">
                <option value="reverse_shell">Reverse Shell</option>
                <option value="bind_shell">Bind Shell</option>
                <option value="exec">Exec (/bin/sh)</option>
                <option value="stager">Stager (small)</option>
                <option value="meterpreter_stager">Meterpreter Stager</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-400 block mb-1">Bad Bytes to Avoid</label>
            <input type="text" value={form.bad_bytes} onChange={e => update('bad_bytes', e.target.value)} placeholder="e.g., \x00\x0a\x0d" className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder:text-slate-500 focus:border-orange-500 focus:outline-none" />
          </div>

          {/* File Upload */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Upload Crash File (optional)</label>
            <input type="file" onChange={handleFileUpload} accept=".txt,.log,.dmp,.core" className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-medium file:bg-slate-700 file:text-slate-300 hover:file:bg-slate-600" />
          </div>

          {/* Crash Text Input */}
          <div>
            <label className="text-xs text-slate-400 block mb-1">Crash Data (paste GDB, WinDbg, ASAN output, or crash details)</label>
            <textarea
              value={form.crash_input_text}
              onChange={e => update('crash_input_text', e.target.value)}
              placeholder={`Paste your crash data here...\n\nExamples:\n- GDB: "Program received signal SIGSEGV..."\n- WinDbg: "FAULTING_IP: ... EXCEPTION_RECORD: ..."\n- ASAN: "==PID==ERROR: AddressSanitizer: heap-buffer-overflow..."\n- Custom crash report with register state and backtrace`}
              rows={10}
              className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-orange-500 focus:outline-none resize-none font-mono"
            />
          </div>
        </div>

        <div className="flex items-center justify-between p-5 border-t border-slate-700 bg-slate-900/50 rounded-b-xl">
          <p className="text-xs text-slate-500">LLM will identify exploitable memory state and generate shellcode</p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
            <button
              onClick={() => onSubmit(form)}
              disabled={analyzing || !form.crash_input_text}
              className="px-5 py-2 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-lg text-sm font-medium hover:from-red-700 hover:to-orange-700 disabled:opacity-50 flex items-center gap-2"
            >
              {analyzing ? <><Cpu className="w-4 h-4 animate-spin" />Analyzing...</> : <><Shield className="w-4 h-4" />Analyze &amp; Generate</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
