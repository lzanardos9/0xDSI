import { useState, useEffect } from 'react';
import { Eye, EyeOff, Shield, FileText, Lock, ChevronDown, ChevronUp, Plus, CreditCard as Edit2, Trash2, Power } from 'lucide-react';
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

const ENTITY_TEMPLATES = [
  { entity_type: 'ssn', display_name: 'Social Security Number', pattern: '\\b\\d{3}-\\d{2}-\\d{4}\\b', pattern_type: 'regex' as const },
  { entity_type: 'credit_card', display_name: 'Credit Card', pattern: '\\b\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}[-\\s]?\\d{4}\\b', pattern_type: 'regex' as const },
  { entity_type: 'email', display_name: 'Email Address', pattern: '[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}', pattern_type: 'regex' as const },
  { entity_type: 'phone', display_name: 'Phone Number', pattern: '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b', pattern_type: 'regex' as const },
  { entity_type: 'api_key', display_name: 'API Key', pattern: '\\b(sk-|AKIA|ghp_|xox[bpas]-)[a-zA-Z0-9]{10,}\\b', pattern_type: 'regex' as const },
  { entity_type: 'ip_address', display_name: 'IP Address', pattern: '\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b', pattern_type: 'regex' as const },
];

interface EntityRule {
  id: string;
  entity_type: string;
  display_name: string;
  pattern: string;
  pattern_type: 'regex' | 'keyword' | 'ml_model';
  redaction_strategy: 'mask' | 'hash' | 'tokenize' | 'remove';
  mask_character: string;
  preserve_format: boolean;
  confidence_threshold: number;
  enabled: boolean;
  priority: number;
  examples: string[];
  created_at: string;
}

interface FormState {
  entity_type: string;
  display_name: string;
  pattern: string;
  pattern_type: 'regex' | 'keyword' | 'ml_model';
  redaction_strategy: 'mask' | 'hash' | 'tokenize' | 'remove';
  mask_character: string;
  preserve_format: boolean;
  confidence_threshold: number;
  priority: number;
  enabled: boolean;
  examples: string;
}

const toSnakeCase = (str: string): string => {
  return str.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
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

  const [viewMode, setViewMode] = useState<'redaction_log' | 'entity_rules'>('redaction_log');
  const [entityRules, setEntityRules] = useState<EntityRule[]>([]);
  const [showEntityModal, setShowEntityModal] = useState(false);
  const [editingRule, setEditingRule] = useState<EntityRule | null>(null);
  const [formState, setFormState] = useState<FormState>({
    entity_type: '',
    display_name: '',
    pattern: '',
    pattern_type: 'regex',
    redaction_strategy: 'mask',
    mask_character: '*',
    preserve_format: true,
    confidence_threshold: 0.8,
    priority: 50,
    enabled: true,
    examples: '',
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [redactionsRes, policiesRes, rulesRes] = await Promise.all([
      supabase.from('pii_redaction_log').select('*').order('redacted_at', { ascending: false }).limit(50),
      supabase.from('guardrail_policies').select('*').eq('policy_type', 'pii_redaction').order('priority'),
      supabase.from('pii_entity_rules').select('*').order('priority', { ascending: false }),
    ]);
    if (redactionsRes.data) setRedactions(redactionsRes.data);
    if (policiesRes.data) setPolicies(policiesRes.data);
    if (rulesRes.data) setEntityRules(rulesRes.data);
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

  const openEntityModal = (rule?: EntityRule) => {
    if (rule) {
      setEditingRule(rule);
      setFormState({
        entity_type: rule.entity_type,
        display_name: rule.display_name,
        pattern: rule.pattern,
        pattern_type: rule.pattern_type,
        redaction_strategy: rule.redaction_strategy,
        mask_character: rule.mask_character,
        preserve_format: rule.preserve_format,
        confidence_threshold: rule.confidence_threshold,
        priority: rule.priority,
        enabled: rule.enabled,
        examples: rule.examples.join(', '),
      });
    } else {
      setEditingRule(null);
      setFormState({
        entity_type: '',
        display_name: '',
        pattern: '',
        pattern_type: 'regex',
        redaction_strategy: 'mask',
        mask_character: '*',
        preserve_format: true,
        confidence_threshold: 0.8,
        priority: 50,
        enabled: true,
        examples: '',
      });
    }
    setShowEntityModal(true);
  };

  const saveEntityRule = async () => {
    if (!formState.entity_type.trim() || !formState.display_name.trim() || !formState.pattern.trim()) {
      alert('Please fill in required fields');
      return;
    }

    const ruleData = {
      entity_type: formState.entity_type,
      display_name: formState.display_name,
      pattern: formState.pattern,
      pattern_type: formState.pattern_type,
      redaction_strategy: formState.redaction_strategy,
      mask_character: formState.mask_character,
      preserve_format: formState.preserve_format,
      confidence_threshold: formState.confidence_threshold,
      priority: formState.priority,
      enabled: formState.enabled,
      examples: formState.examples.split(',').map(e => e.trim()).filter(Boolean),
    };

    if (editingRule) {
      const { error } = await supabase
        .from('pii_entity_rules')
        .update(ruleData)
        .eq('id', editingRule.id);
      if (error) {
        alert('Error updating rule: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from('pii_entity_rules')
        .insert([ruleData]);
      if (error) {
        alert('Error creating rule: ' + error.message);
        return;
      }
    }

    setShowEntityModal(false);
    loadData();
  };

  const deleteEntityRule = async (id: string) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    const { error } = await supabase
      .from('pii_entity_rules')
      .delete()
      .eq('id', id);
    if (error) {
      alert('Error deleting rule: ' + error.message);
      return;
    }
    loadData();
  };

  const toggleEntityRule = async (rule: EntityRule) => {
    const { error } = await supabase
      .from('pii_entity_rules')
      .update({ enabled: !rule.enabled })
      .eq('id', rule.id);
    if (error) {
      alert('Error toggling rule: ' + error.message);
      return;
    }
    loadData();
  };

  const applyTemplate = (template: typeof ENTITY_TEMPLATES[0]) => {
    setFormState(prev => ({
      ...prev,
      entity_type: template.entity_type,
      display_name: template.display_name,
      pattern: template.pattern,
      pattern_type: template.pattern_type,
    }));
  };

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
          <h3 className="text-sm font-semibold text-slate-200">
            {viewMode === 'redaction_log' ? 'Redaction Audit Log' : 'Entity Detection Rules'}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('redaction_log')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'redaction_log'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800/70'
              }`}
            >
              Redaction Log
            </button>
            <button
              onClick={() => setViewMode('entity_rules')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                viewMode === 'entity_rules'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-800/70'
              }`}
            >
              Entity Rules
            </button>
          </div>
        </div>

        {viewMode === 'redaction_log' ? (
          <div>
            <div className="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
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
        ) : (
          <div>
            <div className="px-5 py-4 border-b border-slate-700/40">
              <button
                onClick={() => openEntityModal()}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                New Entity Rule
              </button>
            </div>
            <div className="divide-y divide-slate-800/60 max-h-[400px] overflow-y-auto custom-scrollbar">
              {entityRules.length === 0 ? (
                <div className="px-5 py-8 text-center text-slate-500 text-sm">
                  No entity rules created yet. Click "New Entity Rule" to get started.
                </div>
              ) : (
                entityRules.map((rule) => (
                  <div key={rule.id} className="px-5 py-4 hover:bg-slate-800/40 transition-colors">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-slate-100">{rule.display_name}</span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-900/60">
                            {rule.entity_type}
                          </span>
                        </div>
                        <button
                          onClick={() => toggleEntityRule(rule)}
                          className={`px-2.5 py-1.5 rounded transition-colors ${
                            rule.enabled
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-slate-700/40 text-slate-500 border border-slate-700/50'
                          }`}
                        >
                          <Power className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center flex-wrap gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${rule.pattern_type === 'regex' ? 'text-blue-400 bg-blue-500/10' : rule.pattern_type === 'keyword' ? 'text-cyan-400 bg-cyan-500/10' : 'text-violet-400 bg-violet-500/10'}`}>
                          {rule.pattern_type}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${STRATEGY_CONFIG[rule.redaction_strategy]?.color || 'text-slate-400'} bg-slate-700/30`}>
                          {STRATEGY_CONFIG[rule.redaction_strategy]?.label || rule.redaction_strategy}
                        </span>
                        <span className="text-[10px] text-slate-500">Priority: {rule.priority}</span>
                        <span className="text-[10px] text-slate-500">Confidence: {(rule.confidence_threshold * 100).toFixed(0)}%</span>
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono break-all">
                        {rule.pattern}
                      </div>
                      {rule.examples.length > 0 && (
                        <div className="text-[10px] text-slate-500">
                          Examples: {rule.examples.join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                      <button
                        onClick={() => openEntityModal(rule)}
                        className="px-2 py-1 bg-slate-700/40 hover:bg-slate-700/60 text-slate-300 text-xs rounded transition-colors flex items-center gap-1.5"
                      >
                        <Edit2 className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => deleteEntityRule(rule.id)}
                        className="px-2 py-1 bg-slate-700/40 hover:bg-red-500/20 text-slate-300 hover:text-red-400 text-xs rounded transition-colors flex items-center gap-1.5"
                      >
                        <Trash2 className="w-3 h-3" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {showEntityModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between sticky top-0 bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-100">
                {editingRule ? 'Edit Entity Rule' : 'Create Entity Rule'}
              </h2>
              <button
                onClick={() => setShowEntityModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Entity Type</label>
                <input
                  type="text"
                  value={formState.entity_type}
                  onChange={(e) => setFormState({ ...formState, entity_type: toSnakeCase(e.target.value) })}
                  placeholder="e.g., ssn, credit_card"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                />
                <p className="text-[10px] text-slate-500 mt-1">Auto-converted to snake_case</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Display Name</label>
                <input
                  type="text"
                  value={formState.display_name}
                  onChange={(e) => setFormState({ ...formState, display_name: e.target.value })}
                  placeholder="e.g., Social Security Number"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Pattern Type</label>
                  <select
                    value={formState.pattern_type}
                    onChange={(e) => setFormState({ ...formState, pattern_type: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="regex">Regex</option>
                    <option value="keyword">Keyword</option>
                    <option value="ml_model">ML Model</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Redaction Strategy</label>
                  <select
                    value={formState.redaction_strategy}
                    onChange={(e) => setFormState({ ...formState, redaction_strategy: e.target.value as any })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="mask">Mask</option>
                    <option value="hash">Hash</option>
                    <option value="tokenize">Tokenize</option>
                    <option value="remove">Remove</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Pattern</label>
                <textarea
                  value={formState.pattern}
                  onChange={(e) => setFormState({ ...formState, pattern: e.target.value })}
                  placeholder="e.g., \\b\\d{3}-\\d{2}-\\d{4}\\b"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 font-mono resize-none h-20"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Mask Character</label>
                  <input
                    type="text"
                    maxLength={1}
                    value={formState.mask_character}
                    onChange={(e) => setFormState({ ...formState, mask_character: e.target.value || '*' })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 text-center"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Confidence Threshold</label>
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.1"
                    value={formState.confidence_threshold}
                    onChange={(e) => setFormState({ ...formState, confidence_threshold: parseFloat(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-2">Priority</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formState.priority}
                    onChange={(e) => setFormState({ ...formState, priority: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.preserve_format}
                    onChange={(e) => setFormState({ ...formState, preserve_format: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700/50 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-medium text-slate-300">Preserve Format</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formState.enabled}
                    onChange={(e) => setFormState({ ...formState, enabled: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700/50 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="text-xs font-medium text-slate-300">Enabled</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">Examples (comma-separated)</label>
                <input
                  type="text"
                  value={formState.examples}
                  onChange={(e) => setFormState({ ...formState, examples: e.target.value })}
                  placeholder="e.g., 123-45-6789, 987-65-4321"
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
                />
              </div>

              {!editingRule && (
                <div>
                  <p className="text-xs font-semibold text-slate-300 mb-2">Quick Templates</p>
                  <div className="grid grid-cols-2 gap-2">
                    {ENTITY_TEMPLATES.map((template) => (
                      <button
                        key={template.entity_type}
                        onClick={() => applyTemplate(template)}
                        className="px-2.5 py-1.5 bg-slate-800/50 border border-slate-700/50 hover:border-amber-500/50 rounded text-xs text-slate-300 hover:text-amber-400 transition-colors text-left"
                      >
                        {template.display_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-700 flex items-center justify-end gap-3 sticky bottom-0 bg-slate-900">
              <button
                onClick={() => setShowEntityModal(false)}
                className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded text-sm text-slate-300 font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={saveEntityRule}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 rounded text-sm text-white font-medium transition-colors"
              >
                {editingRule ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PIIRedactionEngine;
