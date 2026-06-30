import { useState } from 'react';
import {
  X, Sparkles, PenTool, Shield, ChevronRight, AlertTriangle,
  FileCode, GitBranch, Play, Loader2, Copy, Check, Plus, Trash2
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CreateRuleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

type Mode = 'choose' | 'ai' | 'manual';
type Tab = 'details' | 'logic' | 'mitre' | 'dac';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DAC_STATUSES = ['draft', 'testing', 'staging', 'production'];
const FORMATS = ['sigma', 'splunk_spl', 'elastic_kql', 'custom'];
const RULE_TYPES = [
  'deterministic', 'ml_anomaly', 'ml_classification', 'vector_similarity',
  'graph_correlation', 'temporal_sequence', 'behavioral_baseline',
  'bayesian_probabilistic', 'ensemble_multi_model', 'negative_correlation'
];

const MITRE_TACTICS = [
  'Reconnaissance', 'Resource Development', 'Initial Access', 'Execution',
  'Persistence', 'Privilege Escalation', 'Defense Evasion', 'Credential Access',
  'Discovery', 'Lateral Movement', 'Collection', 'Command and Control',
  'Exfiltration', 'Impact'
];

const CATEGORIES = [
  'Threat Detection', 'Identity & Access', 'Network Security', 'Endpoint Security',
  'Cloud Security', 'Data Protection', 'Insider Threat', 'Application Security',
  'Supply Chain', 'Compliance', 'Fraud Detection', 'OT/ICS Security'
];

interface RuleForm {
  rule_name: string;
  rule_description: string;
  category: string;
  subcategory: string;
  severity: string;
  confidence_score: number;
  rule_type: string;
  enabled: boolean;
  tags: string[];
  mitre_tactics: string[];
  mitre_techniques: string[];
  data_sources: string[];
  rule_logic: {
    pseudo_code: string;
    time_window: string;
    threshold: number;
    group_by: string;
    conditions: string[];
  };
  source_format: string;
  dac_status: string;
  author: string;
  response_playbook: string;
}

const DEFAULT_FORM: RuleForm = {
  rule_name: '',
  rule_description: '',
  category: 'Threat Detection',
  subcategory: '',
  severity: 'medium',
  confidence_score: 75,
  rule_type: 'deterministic',
  enabled: false,
  tags: [],
  mitre_tactics: [],
  mitre_techniques: [],
  data_sources: [],
  rule_logic: {
    pseudo_code: '',
    time_window: '5m',
    threshold: 1,
    group_by: 'source_ip',
    conditions: [],
  },
  source_format: 'sigma',
  dac_status: 'draft',
  author: '',
  response_playbook: '',
};

function generateYamlPreview(form: RuleForm): string {
  const lines = [
    `title: "${form.rule_name}"`,
    `status: ${form.dac_status}`,
    `version: "1.0.0"`,
    `description: |`,
    `  ${form.rule_description || '(no description)'}`,
    `author: "${form.author || 'analyst'}"`,
    `severity: ${form.severity}`,
    `confidence: ${form.confidence_score}`,
    `rule_type: ${form.rule_type}`,
    `source_format: ${form.source_format}`,
    `date: "${new Date().toISOString().split('T')[0]}"`,
    `tags:`,
    ...(form.tags.length > 0 ? form.tags.map(t => `  - "${t}"`) : ['  # (none)']),
    `mitre:`,
    `  tactics:`,
    ...(form.mitre_tactics.length > 0 ? form.mitre_tactics.map(t => `    - "${t}"`) : ['    # (none)']),
    `  techniques:`,
    ...(form.mitre_techniques.length > 0 ? form.mitre_techniques.map(t => `    - "${t}"`) : ['    # (none)']),
    `data_sources:`,
    ...(form.data_sources.length > 0 ? form.data_sources.map(d => `  - "${d}"`) : ['  # (none)']),
    `detection:`,
    `  logic: |`,
    ...(form.rule_logic.pseudo_code ? form.rule_logic.pseudo_code.split('\n').map(l => `    ${l}`) : ['    # (no logic defined)']),
    `  time_window: "${form.rule_logic.time_window}"`,
    `  threshold: ${form.rule_logic.threshold}`,
    `  group_by:`,
    `    - "${form.rule_logic.group_by}"`,
    ...(form.rule_logic.conditions.length > 0 ? [`  conditions:`, ...form.rule_logic.conditions.map(c => `    - "${c}"`)] : []),
    ...(form.response_playbook ? [`response_playbook: "${form.response_playbook}"`] : []),
  ];
  return lines.join('\n');
}

export default function CreateRuleModal({ open, onClose, onCreated }: CreateRuleModalProps) {
  const [mode, setMode] = useState<Mode>('choose');
  const [tab, setTab] = useState<Tab>('details');
  const [form, setForm] = useState<RuleForm>({ ...DEFAULT_FORM });
  const [saving, setSaving] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [techInput, setTechInput] = useState('');
  const [dsInput, setDsInput] = useState('');
  const [condInput, setCondInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  if (!open) return null;

  const resetAll = () => {
    setMode('choose');
    setTab('details');
    setForm({ ...DEFAULT_FORM });
    setAiPrompt('');
    setAiGenerated(false);
    setError('');
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setError('');

    // Simulate AI generation with intelligent defaults based on the prompt
    await new Promise(r => setTimeout(r, 1500));

    const prompt = aiPrompt.toLowerCase();
    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    if (prompt.includes('ransomware') || prompt.includes('exfiltration') || prompt.includes('zero-day')) severity = 'critical';
    else if (prompt.includes('lateral') || prompt.includes('escalation') || prompt.includes('credential')) severity = 'high';
    else if (prompt.includes('scan') || prompt.includes('recon')) severity = 'low';

    let ruleType = 'deterministic';
    if (prompt.includes('anomaly') || prompt.includes('baseline') || prompt.includes('unusual')) ruleType = 'behavioral_baseline';
    else if (prompt.includes('sequence') || prompt.includes('chain') || prompt.includes('after')) ruleType = 'temporal_sequence';
    else if (prompt.includes('graph') || prompt.includes('lateral') || prompt.includes('path')) ruleType = 'graph_correlation';
    else if (prompt.includes('similar') || prompt.includes('pattern')) ruleType = 'vector_similarity';

    let category = 'Threat Detection';
    if (prompt.includes('identity') || prompt.includes('login') || prompt.includes('auth')) category = 'Identity & Access';
    else if (prompt.includes('network') || prompt.includes('traffic') || prompt.includes('dns')) category = 'Network Security';
    else if (prompt.includes('endpoint') || prompt.includes('process') || prompt.includes('file')) category = 'Endpoint Security';
    else if (prompt.includes('cloud') || prompt.includes('aws') || prompt.includes('azure')) category = 'Cloud Security';
    else if (prompt.includes('insider') || prompt.includes('employee')) category = 'Insider Threat';

    const tactics: string[] = [];
    if (prompt.includes('recon')) tactics.push('Reconnaissance');
    if (prompt.includes('initial access') || prompt.includes('phishing')) tactics.push('Initial Access');
    if (prompt.includes('execution') || prompt.includes('run') || prompt.includes('execute')) tactics.push('Execution');
    if (prompt.includes('persistence') || prompt.includes('persist')) tactics.push('Persistence');
    if (prompt.includes('privilege') || prompt.includes('escalat')) tactics.push('Privilege Escalation');
    if (prompt.includes('evas') || prompt.includes('bypass')) tactics.push('Defense Evasion');
    if (prompt.includes('credential') || prompt.includes('password') || prompt.includes('brute')) tactics.push('Credential Access');
    if (prompt.includes('lateral') || prompt.includes('move')) tactics.push('Lateral Movement');
    if (prompt.includes('exfiltrat') || prompt.includes('steal') || prompt.includes('data')) tactics.push('Exfiltration');
    if (prompt.includes('impact') || prompt.includes('ransom') || prompt.includes('destroy')) tactics.push('Impact');
    if (tactics.length === 0) tactics.push('Execution');

    const words = aiPrompt.trim().split(/\s+/);
    const ruleName = words.length > 6
      ? words.slice(0, 6).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
      : aiPrompt.trim().charAt(0).toUpperCase() + aiPrompt.trim().slice(1);

    const pseudoCode = generatePseudoCode(aiPrompt, ruleType);

    setForm({
      ...DEFAULT_FORM,
      rule_name: ruleName.length > 80 ? ruleName.substring(0, 80) : ruleName,
      rule_description: aiPrompt.trim(),
      category,
      severity,
      confidence_score: severity === 'critical' ? 90 : severity === 'high' ? 80 : 70,
      rule_type: ruleType,
      mitre_tactics: tactics,
      tags: [severity, ruleType.replace(/_/g, '-'), category.toLowerCase().replace(/\s+/g, '-')],
      rule_logic: {
        pseudo_code: pseudoCode,
        time_window: ruleType === 'temporal_sequence' ? '10m' : '5m',
        threshold: severity === 'critical' ? 1 : severity === 'high' ? 3 : 5,
        group_by: category === 'Identity & Access' ? 'username' : 'source_ip',
        conditions: [],
      },
      source_format: 'sigma',
      dac_status: 'draft',
      author: 'ai-assistant',
    });

    setAiGenerating(false);
    setAiGenerated(true);
    setTab('details');
  };

  const handleSave = async () => {
    if (!form.rule_name.trim()) {
      setError('Rule name is required');
      setTab('details');
      return;
    }
    if (!form.rule_logic.pseudo_code.trim()) {
      setError('Detection logic is required');
      setTab('logic');
      return;
    }

    setSaving(true);
    setError('');

    const now = new Date().toISOString();
    const ruleData = {
      rule_name: form.rule_name.trim(),
      rule_description: form.rule_description.trim(),
      category: form.category,
      subcategory: form.subcategory || null,
      severity: form.severity,
      confidence_score: form.confidence_score,
      rule_type: form.rule_type,
      enabled: form.enabled,
      tags: form.tags,
      mitre_tactics: form.mitre_tactics,
      mitre_techniques: form.mitre_techniques,
      data_sources: form.data_sources,
      rule_logic: form.rule_logic,
      source_format: form.source_format,
      dac_status: form.dac_status,
      author: form.author || 'analyst',
      version: '1.0.0',
      trigger_count: 0,
      false_positive_rate: 0,
      complexity_score: Math.min(10, Math.max(1, Math.round(form.rule_logic.pseudo_code.split('\n').length / 3))),
      review_status: form.dac_status === 'draft' ? 'pending_review' : 'approved',
      test_result: 'untested',
      changelog: [{ version: '1.0.0', date: now.split('T')[0], author: form.author || 'analyst', summary: 'Initial creation', type: 'created' }],
      test_cases: [],
      deployment_history: [{ environment: form.dac_status, date: now, deployed_by: form.author || 'analyst', status: 'success' }],
      compliance_frameworks: [],
      response_playbook: form.response_playbook || null,
      created_at: now,
      updated_at: now,
    };

    const { error: insertError } = await supabase
      .from('correlation_rules_library')
      .insert(ruleData);

    if (insertError) {
      setError(insertError.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    handleClose();
    onCreated();
  };

  const addToList = (field: 'tags' | 'mitre_techniques' | 'data_sources', value: string, setter: (v: string) => void) => {
    if (!value.trim()) return;
    setForm(prev => ({ ...prev, [field]: [...prev[field], value.trim()] }));
    setter('');
  };

  const addCondition = (value: string) => {
    if (!value.trim()) return;
    setForm(prev => ({
      ...prev,
      rule_logic: { ...prev.rule_logic, conditions: [...prev.rule_logic.conditions, value.trim()] }
    }));
    setCondInput('');
  };

  const removeFromList = (field: 'tags' | 'mitre_techniques' | 'data_sources' | 'mitre_tactics', idx: number) => {
    setForm(prev => ({ ...prev, [field]: prev[field].filter((_, i) => i !== idx) }));
  };

  const removeCondition = (idx: number) => {
    setForm(prev => ({
      ...prev,
      rule_logic: { ...prev.rule_logic, conditions: prev.rule_logic.conditions.filter((_, i) => i !== idx) }
    }));
  };

  const copyYaml = () => {
    navigator.clipboard.writeText(generateYamlPreview(form));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={handleClose} />
      <div className="relative w-full max-w-5xl max-h-[90vh] overflow-hidden bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
              <Shield className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Create Correlation Rule</h2>
              <p className="text-xs text-slate-400">
                {mode === 'choose' ? 'Choose creation method' : mode === 'ai' && !aiGenerated ? 'Describe what you want to detect' : 'Configure your rule'}
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'choose' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto py-8">
              <button
                onClick={() => setMode('ai')}
                className="group flex flex-col items-center gap-4 p-8 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-cyan-500/50 hover:bg-cyan-500/5 transition-all duration-200"
              >
                <div className="p-4 rounded-full bg-cyan-500/10 border border-cyan-500/20 group-hover:scale-110 transition-transform">
                  <Sparkles className="w-8 h-8 text-cyan-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">AI-Assisted</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Describe the threat scenario in plain English. AI generates the rule logic, MITRE mapping, and detection parameters.
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              </button>

              <button
                onClick={() => { setMode('manual'); setTab('details'); }}
                className="group flex flex-col items-center gap-4 p-8 rounded-xl border border-slate-700 bg-slate-800/50 hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all duration-200"
              >
                <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/20 group-hover:scale-110 transition-transform">
                  <PenTool className="w-8 h-8 text-emerald-400" />
                </div>
                <div className="text-center">
                  <h3 className="text-lg font-semibold text-white mb-2">Manual</h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Full control over every field. Write detection logic, set thresholds, map to MITRE, and configure DaC lifecycle.
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </button>
            </div>
          )}

          {mode === 'ai' && !aiGenerated && (
            <div className="max-w-2xl mx-auto py-6 space-y-6">
              <div className="text-center mb-6">
                <Sparkles className="w-10 h-10 text-cyan-400 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-white">Describe the Threat Scenario</h3>
                <p className="text-sm text-slate-400 mt-1">Write what you want to detect. The AI will generate a complete rule.</p>
              </div>
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="e.g., Detect brute force attacks where more than 5 failed login attempts from the same IP occur within 2 minutes followed by a successful login..."
                rows={6}
                className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/30 resize-none"
              />
              <div className="flex flex-wrap gap-2">
                {['Brute force login detection', 'Data exfiltration over DNS', 'Lateral movement via RDP', 'Privilege escalation chain', 'Insider threat data hoarding'].map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => setAiPrompt(suggestion)}
                    className="px-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={!aiPrompt.trim() || aiGenerating}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold transition-colors"
              >
                {aiGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {aiGenerating ? 'Generating Rule...' : 'Generate Rule'}
              </button>
            </div>
          )}

          {(mode === 'manual' || aiGenerated) && (
            <div className="flex gap-6">
              {/* Tabs */}
              <div className="w-48 shrink-0">
                <nav className="space-y-1">
                  {([
                    { key: 'details', label: 'Details', icon: Shield },
                    { key: 'logic', label: 'Detection Logic', icon: FileCode },
                    { key: 'mitre', label: 'MITRE & Sources', icon: AlertTriangle },
                    { key: 'dac', label: 'DaC & Lifecycle', icon: GitBranch },
                  ] as { key: Tab; label: string; icon: any }[]).map(({ key, label, icon: Icon }) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                        tab === key
                          ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </nav>

                {/* YAML Preview Toggle */}
                <div className="mt-6 pt-4 border-t border-slate-700/50">
                  <button
                    onClick={copyYaml}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-xs font-medium text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy YAML'}
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-w-0">
                {tab === 'details' && (
                  <div className="space-y-4">
                    <FormField label="Rule Name *">
                      <input
                        type="text"
                        value={form.rule_name}
                        onChange={(e) => setForm(prev => ({ ...prev, rule_name: e.target.value }))}
                        placeholder="e.g., Brute Force Login Detection"
                        className="form-input"
                      />
                    </FormField>
                    <FormField label="Description">
                      <textarea
                        value={form.rule_description}
                        onChange={(e) => setForm(prev => ({ ...prev, rule_description: e.target.value }))}
                        placeholder="What does this rule detect and why is it important?"
                        rows={3}
                        className="form-input resize-none"
                      />
                    </FormField>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Category">
                        <select
                          value={form.category}
                          onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                          className="form-input"
                        >
                          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Subcategory">
                        <input
                          type="text"
                          value={form.subcategory}
                          onChange={(e) => setForm(prev => ({ ...prev, subcategory: e.target.value }))}
                          placeholder="e.g., Brute Force"
                          className="form-input"
                        />
                      </FormField>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField label="Severity">
                        <select
                          value={form.severity}
                          onChange={(e) => setForm(prev => ({ ...prev, severity: e.target.value }))}
                          className="form-input"
                        >
                          {SEVERITIES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Confidence (0-100)">
                        <input
                          type="number"
                          min={0} max={100}
                          value={form.confidence_score}
                          onChange={(e) => setForm(prev => ({ ...prev, confidence_score: Number(e.target.value) }))}
                          className="form-input"
                        />
                      </FormField>
                      <FormField label="Rule Type">
                        <select
                          value={form.rule_type}
                          onChange={(e) => setForm(prev => ({ ...prev, rule_type: e.target.value }))}
                          className="form-input"
                        >
                          {RULE_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                        </select>
                      </FormField>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Author">
                        <input
                          type="text"
                          value={form.author}
                          onChange={(e) => setForm(prev => ({ ...prev, author: e.target.value }))}
                          placeholder="analyst@company.com"
                          className="form-input"
                        />
                      </FormField>
                      <FormField label="Response Playbook">
                        <input
                          type="text"
                          value={form.response_playbook}
                          onChange={(e) => setForm(prev => ({ ...prev, response_playbook: e.target.value }))}
                          placeholder="e.g., PB-001-BruteForce"
                          className="form-input"
                        />
                      </FormField>
                    </div>
                    <FormField label="Tags">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList('tags', tagInput, setTagInput))}
                          placeholder="Add tag and press Enter"
                          className="form-input flex-1"
                        />
                        <button onClick={() => addToList('tags', tagInput, setTagInput)} className="px-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {form.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.tags.map((tag, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-slate-700/50 text-slate-300 border border-slate-600/50">
                              {tag}
                              <button onClick={() => removeFromList('tags', i)} className="text-slate-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </FormField>
                  </div>
                )}

                {tab === 'logic' && (
                  <div className="space-y-4">
                    <FormField label="Detection Logic (Pseudo-code / Query) *">
                      <textarea
                        value={form.rule_logic.pseudo_code}
                        onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, pseudo_code: e.target.value } }))}
                        placeholder={`# Example:\nSELECT source_ip, COUNT(*) as attempts\nFROM auth_events\nWHERE event_type = 'login_failure'\nGROUP BY source_ip\nHAVING attempts > threshold\nWITHIN time_window`}
                        rows={10}
                        className="form-input resize-none font-mono text-xs"
                      />
                    </FormField>
                    <div className="grid grid-cols-3 gap-4">
                      <FormField label="Time Window">
                        <input
                          type="text"
                          value={form.rule_logic.time_window}
                          onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, time_window: e.target.value } }))}
                          placeholder="5m, 1h, 24h"
                          className="form-input"
                        />
                      </FormField>
                      <FormField label="Threshold">
                        <input
                          type="number"
                          min={1}
                          value={form.rule_logic.threshold}
                          onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, threshold: Number(e.target.value) } }))}
                          className="form-input"
                        />
                      </FormField>
                      <FormField label="Group By">
                        <input
                          type="text"
                          value={form.rule_logic.group_by}
                          onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, group_by: e.target.value } }))}
                          placeholder="source_ip"
                          className="form-input"
                        />
                      </FormField>
                    </div>
                    <FormField label="Conditions">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={condInput}
                          onChange={(e) => setCondInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCondition(condInput))}
                          placeholder="e.g., event_type = 'authentication_failure'"
                          className="form-input flex-1 font-mono text-xs"
                        />
                        <button onClick={() => addCondition(condInput)} className="px-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {form.rule_logic.conditions.length > 0 && (
                        <div className="space-y-1 mt-2">
                          {form.rule_logic.conditions.map((cond, i) => (
                            <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-800/50 border border-slate-700/50">
                              <code className="text-xs text-slate-300 flex-1">{cond}</code>
                              <button onClick={() => removeCondition(i)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                        </div>
                      )}
                    </FormField>

                    {/* Live YAML Preview */}
                    <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-700/50">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">YAML Preview (DaC Export)</span>
                        <button onClick={copyYaml} className="text-xs text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors">
                          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copied ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <pre className="text-[11px] text-slate-400 font-mono whitespace-pre-wrap max-h-48 overflow-y-auto custom-scrollbar leading-relaxed">
                        {generateYamlPreview(form)}
                      </pre>
                    </div>
                  </div>
                )}

                {tab === 'mitre' && (
                  <div className="space-y-4">
                    <FormField label="MITRE ATT&CK Tactics">
                      <div className="grid grid-cols-2 gap-1.5">
                        {MITRE_TACTICS.map(tactic => (
                          <button
                            key={tactic}
                            onClick={() => {
                              setForm(prev => ({
                                ...prev,
                                mitre_tactics: prev.mitre_tactics.includes(tactic)
                                  ? prev.mitre_tactics.filter(t => t !== tactic)
                                  : [...prev.mitre_tactics, tactic]
                              }));
                            }}
                            className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                              form.mitre_tactics.includes(tactic)
                                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
                                : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600'
                            }`}
                          >
                            {tactic}
                          </button>
                        ))}
                      </div>
                    </FormField>
                    <FormField label="MITRE Techniques">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={techInput}
                          onChange={(e) => setTechInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList('mitre_techniques', techInput, setTechInput))}
                          placeholder="e.g., T1110.001 (Password Guessing)"
                          className="form-input flex-1"
                        />
                        <button onClick={() => addToList('mitre_techniques', techInput, setTechInput)} className="px-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {form.mitre_techniques.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.mitre_techniques.map((t, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20">
                              {t}
                              <button onClick={() => removeFromList('mitre_techniques', i)} className="text-amber-500/50 hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </FormField>
                    <FormField label="Data Sources">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={dsInput}
                          onChange={(e) => setDsInput(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addToList('data_sources', dsInput, setDsInput))}
                          placeholder="e.g., windows_security_log, auth_events"
                          className="form-input flex-1"
                        />
                        <button onClick={() => addToList('data_sources', dsInput, setDsInput)} className="px-3 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                      {form.data_sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {form.data_sources.map((d, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20">
                              {d}
                              <button onClick={() => removeFromList('data_sources', i)} className="text-blue-500/50 hover:text-red-400"><X className="w-3 h-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}
                    </FormField>
                  </div>
                )}

                {tab === 'dac' && (
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <GitBranch className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm font-semibold text-emerald-400">Detection-as-Code Ready</span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        This rule will be created with full DaC lifecycle tracking: version history, promotion pipeline (draft → testing → staging → production), review workflow, and YAML export for git storage.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <FormField label="Initial DaC Status">
                        <select
                          value={form.dac_status}
                          onChange={(e) => setForm(prev => ({ ...prev, dac_status: e.target.value }))}
                          className="form-input"
                        >
                          {DAC_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                        </select>
                      </FormField>
                      <FormField label="Source Format">
                        <select
                          value={form.source_format}
                          onChange={(e) => setForm(prev => ({ ...prev, source_format: e.target.value }))}
                          className="form-input"
                        >
                          {FORMATS.map(f => <option key={f} value={f}>{f === 'splunk_spl' ? 'Splunk SPL' : f === 'elastic_kql' ? 'Elastic KQL' : f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                        </select>
                      </FormField>
                    </div>
                    <FormField label="Enable Rule on Creation">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={form.enabled}
                            onChange={(e) => setForm(prev => ({ ...prev, enabled: e.target.checked }))}
                            className="sr-only peer"
                          />
                          <div className="w-10 h-5 bg-slate-700 rounded-full peer-checked:bg-cyan-600 transition-colors" />
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-5" />
                        </div>
                        <span className="text-sm text-slate-300">{form.enabled ? 'Enabled (will fire in production)' : 'Disabled (safe to deploy without triggering)'}</span>
                      </label>
                    </FormField>

                    {/* DaC Lifecycle Visual */}
                    <div className="mt-4">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">Promotion Pipeline</span>
                      <div className="flex items-center gap-2">
                        {DAC_STATUSES.map((status, i) => (
                          <div key={status} className="flex items-center gap-2">
                            <div className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                              form.dac_status === status
                                ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                                : DAC_STATUSES.indexOf(form.dac_status) > i
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : 'bg-slate-800/50 text-slate-500 border-slate-700/50'
                            }`}>
                              {status.charAt(0).toUpperCase() + status.slice(1)}
                            </div>
                            {i < DAC_STATUSES.length - 1 && (
                              <ChevronRight className={`w-4 h-4 ${DAC_STATUSES.indexOf(form.dac_status) > i ? 'text-emerald-500' : 'text-slate-700'}`} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(mode === 'manual' || aiGenerated) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/50 bg-slate-900/80">
            <div className="flex items-center gap-3">
              {error && (
                <span className="text-xs text-red-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {error}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white bg-slate-800 border border-slate-700 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold text-white bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {saving ? 'Creating...' : `Create as ${form.dac_status.charAt(0).toUpperCase() + form.dac_status.slice(1)}`}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .form-input {
          width: 100%;
          background: rgb(30 41 59 / 0.5);
          border: 1px solid rgb(51 65 85);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: rgb(226 232 240);
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .form-input:focus {
          border-color: rgb(6 182 212 / 0.5);
          box-shadow: 0 0 0 1px rgb(6 182 212 / 0.3);
        }
        .form-input::placeholder {
          color: rgb(100 116 139);
        }
      `}</style>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function generatePseudoCode(prompt: string, ruleType: string): string {
  const lower = prompt.toLowerCase();

  if (lower.includes('brute force') || lower.includes('failed login')) {
    return `# Brute Force Detection\nSELECT source_ip, username, COUNT(*) as failed_attempts\nFROM auth_events\nWHERE event_type = 'authentication_failure'\n  AND timestamp > NOW() - INTERVAL time_window\nGROUP BY source_ip, username\nHAVING failed_attempts >= threshold\n\n# Correlate with subsequent success\nJOIN auth_events success\n  ON success.source_ip = source_ip\n  AND success.event_type = 'authentication_success'\n  AND success.timestamp > MAX(failure.timestamp)\n  AND success.timestamp < MAX(failure.timestamp) + INTERVAL '5 minutes'`;
  }

  if (lower.includes('exfiltration') || lower.includes('dns')) {
    return `# Data Exfiltration via DNS\nSELECT source_ip, dest_domain,\n  SUM(query_length) as total_bytes,\n  COUNT(DISTINCT subdomain) as unique_subdomains\nFROM dns_events\nWHERE timestamp > NOW() - INTERVAL time_window\n  AND query_type IN ('TXT', 'NULL', 'CNAME')\nGROUP BY source_ip, dest_domain\nHAVING total_bytes > 10000\n  OR unique_subdomains > 50`;
  }

  if (lower.includes('lateral') || lower.includes('rdp')) {
    return `# Lateral Movement Detection\nSELECT source_ip, dest_ip, username,\n  COUNT(DISTINCT dest_ip) as unique_targets\nFROM network_events\nWHERE event_type IN ('rdp_connect', 'smb_connect', 'wmi_exec')\n  AND timestamp > NOW() - INTERVAL time_window\n  AND source_ip != dest_ip\nGROUP BY source_ip, username\nHAVING unique_targets >= threshold`;
  }

  if (lower.includes('privilege') || lower.includes('escalat')) {
    return `# Privilege Escalation Chain\nSELECT username, source_host,\n  ARRAY_AGG(action ORDER BY timestamp) as action_chain\nFROM endpoint_events\nWHERE event_type IN ('token_manipulation', 'service_creation',\n  'scheduled_task', 'registry_modification')\n  AND timestamp > NOW() - INTERVAL time_window\nGROUP BY username, source_host\nHAVING COUNT(*) >= threshold\n  AND action_chain OVERLAPS ['token_elevation', 'impersonation']`;
  }

  if (ruleType === 'behavioral_baseline') {
    return `# Behavioral Baseline Deviation\nWITH baseline AS (\n  SELECT entity_id,\n    AVG(event_count) as avg_count,\n    STDDEV(event_count) as std_count\n  FROM entity_daily_stats\n  WHERE date > NOW() - INTERVAL '30 days'\n  GROUP BY entity_id\n)\nSELECT e.entity_id, e.event_count, b.avg_count\nFROM today_stats e\nJOIN baseline b ON e.entity_id = b.entity_id\nWHERE e.event_count > b.avg_count + (3 * b.std_count)`;
  }

  return `# Detection Rule\n# Describe: ${prompt.substring(0, 80)}\nSELECT source_entity, COUNT(*) as occurrences\nFROM events\nWHERE event_type = 'suspicious_activity'\n  AND timestamp > NOW() - INTERVAL time_window\nGROUP BY source_entity\nHAVING occurrences >= threshold`;
}
