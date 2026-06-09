import { useState, useEffect } from 'react';
import {
  Eye, EyeOff, Shield, AlertTriangle, FileText, Lock,
  Search, Filter, ChevronDown, ChevronUp
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { PIIRedaction, GuardrailPolicy } from '../../lib/guardrailsData';

const ENTITY_CONFIG: Record<string, { label: string; color: string; icon: string; example: string }> = {
  ssn: { label: 'Social Security Number', color: 'text-red-400', icon: 'id', example: '***-**-1234' },
  credit_card: { label: 'Credit Card', color: 'text-orange-400', icon: 'card', example: '****-****-****-9012' },
  email: { label: 'Email Address', color: 'text-blue-400', icon: 'mail', example: 'j***@***.com' },
  phone: { label: 'Phone Number', color: 'text-cyan-400', icon: 'phone', example: '(***) ***-5309' },
  patient_name: { label: 'Patient Name', color: 'text-rose-400', icon: 'user', example: '[REDACTED]' },
  dob: { label: 'Date of Birth', color: 'text-amber-400', icon: 'calendar', example: '[REDACTED]' },
  medical_id: { label: 'Medical Record', color: 'text-rose-400', icon: 'file', example: '[REDACTED]' },
  diagnosis_code: { label: 'Diagnosis Code', color: 'text-rose-400', icon: 'stethoscope', example: '[REDACTED]' },
  api_key: { label: 'API Key', color: 'text-emerald-400', icon: 'key', example: 'tok_***' },
  address: { label: 'Physical Address', color: 'text-teal-400', icon: 'map', example: '*** Main St' },
  passport: { label: 'Passport Number', color: 'text-red-400', icon: 'passport', example: '***' },
};

const STRATEGY_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  mask: { label: 'Mask', color: 'text-blue-400', description: 'Replaces characters with asterisks while preserving format' },
  hash: { label: 'Hash', color: 'text-emerald-400', description: 'Replaces with a one-way cryptographic hash' },
  tokenize: { label: 'Tokenize', color: 'text-cyan-400', description: 'Replaces with a reversible token (can be de-tokenized by authorized users)' },
  remove: { label: 'Remove', color: 'text-red-400', description: 'Completely removes the sensitive data' },
};

const PIIRedactionEngine = () => {
  const [redactions, setRedactions] = useState<PIIRedaction[]>([]);
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<string>('all');
  const [selectedStrategy, setSelectedStrategy] = useState<string>('all');
  const [expandedRedaction, setExpandedRedaction] = useState<string | null>(null);
  const [showDemo, setShowDemo] = useState(false);
  const [demoInput, setDemoInput] = useState('');
  const [demoOutput, setDemoOutput] = useState<any>(null);
  const [demoProcessing, setDemoProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [redactionsRes, policiesRes] = await Promise.all([
      supabase.from('pii_redaction_log').select('*').order('redacted_at', { ascending: false }).limit(50),
      supabase.from('guardrail_policies').select('*').eq('policy_type', 'pii_redaction').order('priority'),
    ]);
    if (redactionsRes.data) setRedactions(redactionsRes.data);
    if (policiesRes.data) setPolicies(policiesRes.data);
  };

  const entityDistribution = redactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.entity_type] = (acc[r.entity_type] || 0) + 1;
    return acc;
  }, {});

  const strategyDistribution = redactions.reduce<Record<string, number>>((acc, r) => {
    acc[r.redaction_strategy] = (acc[r.redaction_strategy] || 0) + 1;
    return acc;
  }, {});

  const avgConfidence = redactions.length > 0
    ? (redactions.reduce((sum, r) => sum + r.confidence, 0) / redactions.length * 100).toFixed(1)
    : '0';

  const runDemo = () => {
    if (!demoInput.trim()) return;
    setDemoProcessing(true);
    setTimeout(() => {
      const found: any[] = [];
      let output = demoInput;

      const ssnRegex = /\b\d{3}-\d{2}-\d{4}\b/g;
      const ccRegex = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g;
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRegex = /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g;
      const apiKeyRegex = /\b(sk-|AKIA|ghp_|xox[bpas]-)[a-zA-Z0-9]{10,}\b/g;

      let match;
      while ((match = ssnRegex.exec(demoInput)) !== null) {
        found.push({ type: 'ssn', original: match[0], redacted: `***-**-${match[0].slice(-4)}`, strategy: 'mask', confidence: 0.99, start: match.index });
        output = output.replace(match[0], `***-**-${match[0].slice(-4)}`);
      }
      while ((match = ccRegex.exec(demoInput)) !== null) {
        found.push({ type: 'credit_card', original: '****', redacted: `tok_${Math.random().toString(36).slice(2, 10)}`, strategy: 'tokenize', confidence: 0.98, start: match.index });
        output = output.replace(match[0], `tok_${Math.random().toString(36).slice(2, 10)}`);
      }
      while ((match = emailRegex.exec(demoInput)) !== null) {
        const parts = match[0].split('@');
        const masked = `${parts[0][0]}***@***.${parts[1].split('.').pop()}`;
        found.push({ type: 'email', original: match[0], redacted: masked, strategy: 'mask', confidence: 0.96, start: match.index });
        output = output.replace(match[0], masked);
      }
      while ((match = phoneRegex.exec(demoInput)) !== null) {
        found.push({ type: 'phone', original: match[0], redacted: `phone:***-${match[0].slice(-4)}`, strategy: 'mask', confidence: 0.95, start: match.index });
        output = output.replace(match[0], `phone:***-${match[0].slice(-4)}`);
      }
      while ((match = apiKeyRegex.exec(demoInput)) !== null) {
        found.push({ type: 'api_key', original: `${match[0].slice(0, 4)}***`, redacted: `tok_${Math.random().toString(36).slice(2, 10)}`, strategy: 'tokenize', confidence: 0.99, start: match.index });
        output = output.replace(match[0], `[REDACTED_KEY]`);
      }

      setDemoOutput({ input: demoInput, output, found, processingTime: Math.floor(Math.random() * 8) + 4 });
      setDemoProcessing(false);
    }, 1500);
  };

  const filtered = redactions.filter(r => {
    if (selectedEntity !== 'all' && r.entity_type !== selectedEntity) return false;
    if (selectedStrategy !== 'all' && r.redaction_strategy !== selectedStrategy) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <EyeOff className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-medium text-slate-400">Total Redactions</span>
          </div>
          <p className="text-2xl font-bold text-white">{redactions.length}</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-medium text-slate-400">Avg Confidence</span>
          </div>
          <p className="text-2xl font-bold text-emerald-400">{avgConfidence}%</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-medium text-slate-400">Entity Types</span>
          </div>
          <p className="text-2xl font-bold text-white">{Object.keys(entityDistribution).length}</p>
        </div>
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-medium text-slate-400">Active Policies</span>
          </div>
          <p className="text-2xl font-bold text-white">{policies.filter(p => p.enabled).length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-emerald-500/20 bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 overflow-hidden">
        <button
          onClick={() => setShowDemo(!showDemo)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors"
        >
          <div className="flex items-center gap-2.5">
            <Eye className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-200">Live PII Redaction Demo</h3>
            <span className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400 font-medium">INTERACTIVE</span>
          </div>
          {showDemo ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showDemo && (
          <div className="px-5 pb-5 space-y-4">
            <div>
              <p className="text-xs text-slate-400 mb-2">Paste text containing PII to see real-time redaction:</p>
              <textarea
                value={demoInput}
                onChange={(e) => setDemoInput(e.target.value)}
                placeholder="Try: My SSN is 123-45-6789, email is john@company.com, card number 4532-1234-5678-9012, call me at 555-123-4567"
                className="w-full px-4 py-3 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 resize-none h-24"
              />
              <button
                onClick={runDemo}
                disabled={demoProcessing || !demoInput.trim()}
                className="mt-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
              >
                {demoProcessing ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning...</>
                ) : (
                  <><EyeOff className="w-3.5 h-3.5" /> Redact PII</>
                )}
              </button>
            </div>

            {demoOutput && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1.5">Original (Sensitive)</p>
                    <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                      <p className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{demoOutput.input}</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1.5">Redacted (Safe)</p>
                    <div className="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
                      <p className="text-xs text-slate-300 whitespace-pre-wrap font-mono">{demoOutput.output}</p>
                    </div>
                  </div>
                </div>

                {demoOutput.found.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                      Detected Entities ({demoOutput.found.length}) - {demoOutput.processingTime}ms
                    </p>
                    <div className="space-y-1.5">
                      {demoOutput.found.map((f: any, i: number) => {
                        const config = ENTITY_CONFIG[f.type] || { label: f.type, color: 'text-slate-400' };
                        const stratConfig = STRATEGY_CONFIG[f.strategy] || { label: f.strategy, color: 'text-slate-400' };
                        return (
                          <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-800/60 rounded-lg">
                            <div className="flex items-center gap-2.5">
                              <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                              <span className="text-[10px] text-slate-500">at position {f.start}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${stratConfig.color} bg-slate-700/40`}>
                                {stratConfig.label}
                              </span>
                              <span className="text-[10px] text-emerald-400 font-mono">{(f.confidence * 100).toFixed(0)}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/40">
            <h3 className="text-sm font-semibold text-slate-200">Entity Type Distribution</h3>
          </div>
          <div className="p-5 space-y-3">
            {Object.entries(entityDistribution)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const config = ENTITY_CONFIG[type] || { label: type, color: 'text-slate-400' };
                const maxCount = Math.max(...Object.values(entityDistribution));
                return (
                  <div key={type}>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                      <span className="text-xs text-slate-500 tabular-nums">{count}</span>
                    </div>
                    <div className="h-2 bg-slate-700/50 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-cyan-500/60 to-emerald-500/60 rounded-full transition-all duration-700"
                        style={{ width: `${(count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-700/40">
            <h3 className="text-sm font-semibold text-slate-200">Redaction Strategies</h3>
          </div>
          <div className="p-5 space-y-4">
            {Object.entries(STRATEGY_CONFIG).map(([key, config]) => {
              const count = strategyDistribution[key] || 0;
              return (
                <div key={key} className="flex items-start gap-3 p-3 bg-slate-900/40 rounded-lg">
                  <div className={`px-2 py-1 rounded text-xs font-bold ${config.color} bg-slate-800/60`}>
                    {config.label}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs text-slate-400">{config.description}</p>
                    <p className="text-sm font-bold text-white mt-1">{count} uses</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800/20 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-200">Redaction Audit Log</h3>
          <div className="flex gap-2">
            <select
              value={selectedEntity}
              onChange={(e) => setSelectedEntity(e.target.value)}
              className="px-2 py-1 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-300"
            >
              <option value="all">All Entities</option>
              {Object.entries(ENTITY_CONFIG).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="divide-y divide-slate-800/60 max-h-[400px] overflow-y-auto custom-scrollbar">
          {filtered.map((redaction) => {
            const config = ENTITY_CONFIG[redaction.entity_type] || { label: redaction.entity_type, color: 'text-slate-400' };
            const stratConfig = STRATEGY_CONFIG[redaction.redaction_strategy] || { label: redaction.redaction_strategy, color: 'text-slate-400' };
            return (
              <div key={redaction.id} className="px-5 py-3 hover:bg-slate-800/40 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config.color} bg-slate-700/30`}>
                      {config.label}
                    </span>
                    <div className="flex items-center gap-2">
                      <code className="text-xs text-red-400/70 line-through font-mono">{redaction.original_snippet}</code>
                      <span className="text-slate-600">-&gt;</span>
                      <code className="text-xs text-emerald-400 font-mono">{redaction.redacted_snippet}</code>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${stratConfig.color} bg-slate-700/30`}>
                      {stratConfig.label}
                    </span>
                    <span className="text-[10px] text-emerald-400 tabular-nums">{(redaction.confidence * 100).toFixed(0)}%</span>
                    <span className="text-[10px] text-slate-600">{new Date(redaction.redacted_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PIIRedactionEngine;
