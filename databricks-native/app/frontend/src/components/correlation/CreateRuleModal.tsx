import { useState, useEffect } from 'react';
import {
  X, Sparkles, PenTool, Shield, ChevronRight, AlertTriangle,
  FileCode, GitBranch, Play, Loader2, Copy, Check, Plus, Trash2,
  Brain, Network, BarChart3, Layers, Zap, Target, Eye, Activity
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface CreateRuleModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  defaultRuleType?: string;
  defaultCategory?: string;
}

type Mode = 'choose' | 'ai' | 'manual';
type Tab = 'details' | 'logic' | 'mitre' | 'dac';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const DAC_STATUSES = ['draft', 'testing', 'staging', 'production'];
const FORMATS = ['sigma', 'splunk_spl', 'elastic_kql', 'custom'];

const RULE_TYPES = [
  { id: 'deterministic', label: 'Deterministic', icon: Target, color: 'cyan', desc: 'Exact match logic with thresholds' },
  { id: 'ml_anomaly', label: 'ML Anomaly', icon: Brain, color: 'violet', desc: 'Unsupervised baseline deviation' },
  { id: 'ml_classification', label: 'ML Classification', icon: BarChart3, color: 'blue', desc: 'Supervised threat categorization' },
  { id: 'vector_similarity', label: 'Vector Similarity', icon: Activity, color: 'emerald', desc: 'Embedding-based pattern matching' },
  { id: 'graph_correlation', label: 'Graph Correlation', icon: Network, color: 'orange', desc: 'Entity relationship traversal' },
  { id: 'temporal_sequence', label: 'Temporal Sequence', icon: Layers, color: 'amber', desc: 'Ordered event chain detection' },
  { id: 'behavioral_baseline', label: 'Behavioral Baseline', icon: Eye, color: 'teal', desc: 'User/entity behavior profiling' },
  { id: 'bayesian_probabilistic', label: 'Bayesian', icon: Zap, color: 'rose', desc: 'Probabilistic confidence scoring' },
  { id: 'ensemble_multi_model', label: 'Ensemble', icon: Sparkles, color: 'sky', desc: 'Multi-model voting consensus' },
  { id: 'negative_correlation', label: 'Negative Correlation', icon: AlertTriangle, color: 'red', desc: 'Absence-based detection logic' },
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

const SEV_COLORS: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', glow: 'shadow-red-500/10' },
  high: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', glow: 'shadow-orange-500/10' },
  medium: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: 'shadow-amber-500/10' },
  low: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', glow: 'shadow-blue-500/10' },
};

const TABS_CONFIG: { key: Tab; label: string; icon: any; color: string }[] = [
  { key: 'details', label: 'Details', icon: Shield, color: 'cyan' },
  { key: 'logic', label: 'Detection Logic', icon: FileCode, color: 'emerald' },
  { key: 'mitre', label: 'MITRE & Sources', icon: AlertTriangle, color: 'amber' },
  { key: 'dac', label: 'DaC Lifecycle', icon: GitBranch, color: 'sky' },
];

export default function CreateRuleModal({ open, onClose, onCreated, defaultRuleType, defaultCategory }: CreateRuleModalProps) {
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
  const [showYamlPanel, setShowYamlPanel] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (open) {
      setAnimateIn(false);
      requestAnimationFrame(() => setAnimateIn(true));
      if (defaultRuleType) {
        setForm(prev => ({ ...prev, rule_type: defaultRuleType }));
      }
      if (defaultCategory) {
        setForm(prev => ({ ...prev, category: defaultCategory }));
      }
    }
  }, [open, defaultRuleType, defaultCategory]);

  if (!open) return null;

  const resetAll = () => {
    setMode('choose');
    setTab('details');
    setForm({ ...DEFAULT_FORM });
    setAiPrompt('');
    setAiGenerated(false);
    setError('');
    setShowYamlPanel(false);
  };

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiGenerating(true);
    setError('');

    await new Promise(r => setTimeout(r, 1500));

    const prompt = aiPrompt.toLowerCase();
    let severity: 'critical' | 'high' | 'medium' | 'low' = 'medium';
    if (prompt.includes('ransomware') || prompt.includes('exfiltration') || prompt.includes('zero-day')) severity = 'critical';
    else if (prompt.includes('lateral') || prompt.includes('escalation') || prompt.includes('credential')) severity = 'high';
    else if (prompt.includes('scan') || prompt.includes('recon')) severity = 'low';

    let ruleType = defaultRuleType || 'deterministic';
    if (prompt.includes('anomaly') || prompt.includes('baseline') || prompt.includes('unusual')) ruleType = 'behavioral_baseline';
    else if (prompt.includes('sequence') || prompt.includes('chain') || prompt.includes('after')) ruleType = 'temporal_sequence';
    else if (prompt.includes('graph') || prompt.includes('lateral') || prompt.includes('path')) ruleType = 'graph_correlation';
    else if (prompt.includes('similar') || prompt.includes('pattern')) ruleType = 'vector_similarity';
    else if (prompt.includes('missing') || prompt.includes('absence') || prompt.includes('didn\'t')) ruleType = 'negative_correlation';

    let category = defaultCategory || 'Threat Detection';
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

  const completionScore = (() => {
    let score = 0;
    if (form.rule_name.trim()) score += 20;
    if (form.rule_description.trim()) score += 15;
    if (form.rule_logic.pseudo_code.trim()) score += 25;
    if (form.mitre_tactics.length > 0) score += 15;
    if (form.tags.length > 0) score += 10;
    if (form.data_sources.length > 0) score += 10;
    if (form.author.trim()) score += 5;
    return Math.min(100, score);
  })();

  const currentTabIdx = TABS_CONFIG.findIndex(t => t.key === tab);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={handleClose} />
      <div className={`relative w-full max-w-6xl max-h-[92vh] overflow-hidden bg-[#0a0f1e] border border-slate-700/50 rounded-2xl shadow-2xl shadow-black/50 flex flex-col transition-all duration-300 ${animateIn ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>

        {/* Animated gradient header */}
        <div className="relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-600/20 via-blue-600/10 to-emerald-600/20 animate-gradient-x" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(6,182,212,0.15),transparent_50%)]" />
          <div className="relative flex items-center justify-between px-6 py-4 border-b border-slate-700/30">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/30">
                  <Shield className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0a0f1e] flex items-center justify-center">
                  <Plus className="w-2.5 h-2.5 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white tracking-tight">Create Correlation Rule</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  {mode === 'choose' ? 'Choose your creation method' : mode === 'ai' && !aiGenerated ? 'Describe the threat scenario' : 'Configure detection parameters'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {(mode === 'manual' || aiGenerated) && (
                <div className="flex items-center gap-2 mr-2">
                  <div className="h-1.5 w-24 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500 transition-all duration-500"
                      style={{ width: `${completionScore}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-medium text-slate-500">{completionScore}%</span>
                </div>
              )}
              <button onClick={handleClose} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/50 transition-all duration-200">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {mode === 'choose' && (
            <div className="p-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto">
                <button
                  onClick={() => setMode('ai')}
                  className="group relative flex flex-col items-center gap-5 p-8 rounded-2xl border border-slate-700/50 bg-gradient-to-b from-slate-800/30 to-slate-900/50 hover:border-cyan-500/40 hover:from-cyan-500/5 hover:to-slate-900/50 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-500/10 border border-cyan-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-cyan-500/20 transition-all duration-300">
                    <Sparkles className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div className="text-center relative">
                    <h3 className="text-lg font-bold text-white mb-2">AI-Assisted</h3>
                    <p className="text-sm text-slate-400 leading-relaxed max-w-[220px]">
                      Describe the threat in natural language. AI generates logic, MITRE mapping, and parameters.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-cyan-400 transition-colors">
                    <span>Get started</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>

                <button
                  onClick={() => { setMode('manual'); setTab('details'); }}
                  className="group relative flex flex-col items-center gap-5 p-8 rounded-2xl border border-slate-700/50 bg-gradient-to-b from-slate-800/30 to-slate-900/50 hover:border-emerald-500/40 hover:from-emerald-500/5 hover:to-slate-900/50 transition-all duration-300 overflow-hidden"
                >
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative p-5 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/10 border border-emerald-500/20 group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-emerald-500/20 transition-all duration-300">
                    <PenTool className="w-8 h-8 text-emerald-400" />
                  </div>
                  <div className="text-center relative">
                    <h3 className="text-lg font-bold text-white mb-2">Manual Builder</h3>
                    <p className="text-sm text-slate-400 leading-relaxed max-w-[220px]">
                      Full control: write logic, map to MITRE, set DaC lifecycle, and choose rule type.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 group-hover:text-emerald-400 transition-colors">
                    <span>Get started</span>
                    <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </button>
              </div>
            </div>
          )}

          {mode === 'ai' && !aiGenerated && (
            <div className="p-8 max-w-3xl mx-auto space-y-6">
              <div className="text-center mb-8">
                <div className="relative inline-block mb-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 border border-cyan-500/20 flex items-center justify-center mx-auto">
                    <Sparkles className="w-8 h-8 text-cyan-400" />
                  </div>
                  <div className="absolute -inset-4 bg-cyan-500/5 rounded-full blur-xl" />
                </div>
                <h3 className="text-xl font-bold text-white">Describe the Threat Scenario</h3>
                <p className="text-sm text-slate-400 mt-2 max-w-md mx-auto">Write what you want to detect. The AI will generate a complete correlation rule with MITRE mapping and detection logic.</p>
              </div>
              <div className="relative">
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="e.g., Detect brute force attacks where more than 5 failed login attempts from the same IP occur within 2 minutes followed by a successful login..."
                  rows={5}
                  className="w-full bg-slate-800/30 border border-slate-700/50 rounded-xl px-5 py-4 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-2 focus:ring-cyan-500/10 resize-none transition-all"
                />
                <div className="absolute bottom-3 right-3 text-[10px] text-slate-600">{aiPrompt.length} chars</div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Quick Templates</span>
                <div className="flex flex-wrap gap-2">
                  {['Brute force login detection', 'Data exfiltration over DNS', 'Lateral movement via RDP', 'Privilege escalation chain', 'Insider threat data hoarding', 'Missing MFA after password change'].map(suggestion => (
                    <button
                      key={suggestion}
                      onClick={() => setAiPrompt(suggestion)}
                      className="px-3 py-1.5 text-xs rounded-lg bg-slate-800/50 border border-slate-700/50 text-slate-400 hover:text-cyan-300 hover:border-cyan-500/30 hover:bg-cyan-500/5 transition-all duration-200"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
              <button
                onClick={handleAiGenerate}
                disabled={!aiPrompt.trim() || aiGenerating}
                className="w-full flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold transition-all duration-200 shadow-lg shadow-cyan-600/20 disabled:shadow-none"
              >
                {aiGenerating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
                {aiGenerating ? 'Generating Rule...' : 'Generate Correlation Rule'}
              </button>
            </div>
          )}

          {(mode === 'manual' || aiGenerated) && (
            <div className="flex h-full">
              {/* Left sidebar with step tabs */}
              <div className="w-56 shrink-0 border-r border-slate-700/30 p-4 bg-slate-900/30">
                <nav className="space-y-1">
                  {TABS_CONFIG.map(({ key, label, icon: Icon, color }, idx) => (
                    <button
                      key={key}
                      onClick={() => setTab(key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                        tab === key
                          ? `bg-${color}-500/10 text-${color}-400 border border-${color}-500/20 shadow-sm`
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 border border-transparent'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                        tab === key ? `bg-${color}-500/20 text-${color}-400` :
                        currentTabIdx > idx ? 'bg-emerald-500/15 text-emerald-400' : 'bg-slate-800 text-slate-500'
                      }`}>
                        {currentTabIdx > idx ? <Check className="w-3 h-3" /> : idx + 1}
                      </div>
                      <span>{label}</span>
                    </button>
                  ))}
                </nav>

                {/* Severity indicator */}
                <div className="mt-6 pt-4 border-t border-slate-700/30">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-2">Severity</span>
                  <div className="flex gap-1">
                    {SEVERITIES.map(s => {
                      const c = SEV_COLORS[s];
                      return (
                        <button
                          key={s}
                          onClick={() => setForm(prev => ({ ...prev, severity: s }))}
                          className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold uppercase border transition-all ${
                            form.severity === s ? `${c.bg} ${c.border} ${c.text}` : 'bg-slate-800/50 border-slate-700/30 text-slate-600 hover:text-slate-400'
                          }`}
                        >
                          {s.charAt(0)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* YAML toggle */}
                <div className="mt-4">
                  <button
                    onClick={() => setShowYamlPanel(!showYamlPanel)}
                    className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                      showYamlPanel ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/20'
                    }`}
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    {showYamlPanel ? 'Hide YAML' : 'Show YAML'}
                  </button>
                </div>

                <div className="mt-3">
                  <button
                    onClick={copyYaml}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/30 text-xs font-medium text-slate-400 hover:text-cyan-400 hover:border-cyan-500/20 transition-all"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied!' : 'Copy YAML'}
                  </button>
                </div>
              </div>

              {/* Main content area */}
              <div className="flex-1 min-w-0 flex">
                <div className={`flex-1 p-6 overflow-y-auto ${showYamlPanel ? 'border-r border-slate-700/30' : ''}`}>
                  {tab === 'details' && (
                    <div className="space-y-5">
                      <FormField label="Rule Name" required>
                        <input
                          type="text"
                          value={form.rule_name}
                          onChange={(e) => setForm(prev => ({ ...prev, rule_name: e.target.value }))}
                          placeholder="e.g., Brute Force Login Detection"
                          className="form-input-premium"
                        />
                      </FormField>
                      <FormField label="Description">
                        <textarea
                          value={form.rule_description}
                          onChange={(e) => setForm(prev => ({ ...prev, rule_description: e.target.value }))}
                          placeholder="What does this rule detect and why is it important?"
                          rows={3}
                          className="form-input-premium resize-none"
                        />
                      </FormField>

                      {/* Rule Type Selector - Visual Cards */}
                      <FormField label="Rule Type">
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
                          {RULE_TYPES.map(rt => {
                            const Icon = rt.icon;
                            const isSelected = form.rule_type === rt.id;
                            return (
                              <button
                                key={rt.id}
                                onClick={() => setForm(prev => ({ ...prev, rule_type: rt.id }))}
                                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl text-center transition-all duration-200 border ${
                                  isSelected
                                    ? `bg-${rt.color}-500/10 border-${rt.color}-500/30 shadow-sm`
                                    : 'bg-slate-800/30 border-slate-700/30 hover:border-slate-600 hover:bg-slate-800/50'
                                }`}
                              >
                                <Icon className={`w-4 h-4 ${isSelected ? `text-${rt.color}-400` : 'text-slate-500'}`} />
                                <span className={`text-[10px] font-semibold leading-tight ${isSelected ? 'text-slate-200' : 'text-slate-400'}`}>
                                  {rt.label}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </FormField>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Category">
                          <select
                            value={form.category}
                            onChange={(e) => setForm(prev => ({ ...prev, category: e.target.value }))}
                            className="form-input-premium"
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
                            className="form-input-premium"
                          />
                        </FormField>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Confidence (0-100)">
                          <div className="space-y-2">
                            <input
                              type="range"
                              min={0} max={100}
                              value={form.confidence_score}
                              onChange={(e) => setForm(prev => ({ ...prev, confidence_score: Number(e.target.value) }))}
                              className="w-full h-1.5 rounded-full bg-slate-700 appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-cyan-500/30"
                            />
                            <div className="flex justify-between text-[10px] text-slate-500">
                              <span>Low</span>
                              <span className="text-cyan-400 font-bold">{form.confidence_score}%</span>
                              <span>High</span>
                            </div>
                          </div>
                        </FormField>
                        <FormField label="Author">
                          <input
                            type="text"
                            value={form.author}
                            onChange={(e) => setForm(prev => ({ ...prev, author: e.target.value }))}
                            placeholder="analyst@company.com"
                            className="form-input-premium"
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
                            className="form-input-premium flex-1"
                          />
                          <button onClick={() => addToList('tags', tagInput, setTagInput)} className="px-3 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/50 transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {form.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {form.tags.map((tag, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-slate-800/50 text-slate-300 border border-slate-600/30 hover:border-red-500/30 transition-colors group">
                                {tag}
                                <button onClick={() => removeFromList('tags', i)} className="text-slate-500 group-hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </FormField>
                    </div>
                  )}

                  {tab === 'logic' && (
                    <div className="space-y-5">
                      <FormField label="Detection Logic (Pseudo-code / Query)" required>
                        <div className="relative">
                          <textarea
                            value={form.rule_logic.pseudo_code}
                            onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, pseudo_code: e.target.value } }))}
                            placeholder={`# Example:\nSELECT source_ip, COUNT(*) as attempts\nFROM auth_events\nWHERE event_type = 'login_failure'\nGROUP BY source_ip\nHAVING attempts > threshold\nWITHIN time_window`}
                            rows={12}
                            className="form-input-premium resize-none font-mono text-xs leading-relaxed"
                          />
                          <div className="absolute top-2 right-2 text-[9px] text-slate-600 bg-slate-800/80 px-2 py-0.5 rounded">
                            {form.rule_logic.pseudo_code.split('\n').length} lines
                          </div>
                        </div>
                      </FormField>
                      <div className="grid grid-cols-3 gap-4">
                        <FormField label="Time Window">
                          <input
                            type="text"
                            value={form.rule_logic.time_window}
                            onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, time_window: e.target.value } }))}
                            placeholder="5m, 1h, 24h"
                            className="form-input-premium"
                          />
                        </FormField>
                        <FormField label="Threshold">
                          <input
                            type="number"
                            min={1}
                            value={form.rule_logic.threshold}
                            onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, threshold: Number(e.target.value) } }))}
                            className="form-input-premium"
                          />
                        </FormField>
                        <FormField label="Group By">
                          <input
                            type="text"
                            value={form.rule_logic.group_by}
                            onChange={(e) => setForm(prev => ({ ...prev, rule_logic: { ...prev.rule_logic, group_by: e.target.value } }))}
                            placeholder="source_ip"
                            className="form-input-premium"
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
                            className="form-input-premium flex-1 font-mono text-xs"
                          />
                          <button onClick={() => addCondition(condInput)} className="px-3 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/50 transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {form.rule_logic.conditions.length > 0 && (
                          <div className="space-y-1.5 mt-2">
                            {form.rule_logic.conditions.map((cond, i) => (
                              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/30 border border-slate-700/30 group">
                                <code className="text-xs text-slate-300 flex-1 font-mono">{cond}</code>
                                <button onClick={() => removeCondition(i)} className="text-slate-600 group-hover:text-red-400 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                          </div>
                        )}
                      </FormField>
                    </div>
                  )}

                  {tab === 'mitre' && (
                    <div className="space-y-5">
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
                              className={`text-left px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200 border ${
                                form.mitre_tactics.includes(tactic)
                                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                                  : 'bg-slate-800/30 text-slate-400 border-slate-700/30 hover:border-slate-600 hover:text-slate-300'
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
                            className="form-input-premium flex-1"
                          />
                          <button onClick={() => addToList('mitre_techniques', techInput, setTechInput)} className="px-3 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/50 transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {form.mitre_techniques.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {form.mitre_techniques.map((t, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-amber-500/10 text-amber-300 border border-amber-500/20 group">
                                {t}
                                <button onClick={() => removeFromList('mitre_techniques', i)} className="text-amber-500/40 group-hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
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
                            className="form-input-premium flex-1"
                          />
                          <button onClick={() => addToList('data_sources', dsInput, setDsInput)} className="px-3 rounded-lg bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 border border-slate-600/50 transition-colors">
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                        {form.data_sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {form.data_sources.map((d, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-blue-500/10 text-blue-300 border border-blue-500/20 group">
                                {d}
                                <button onClick={() => removeFromList('data_sources', i)} className="text-blue-500/40 group-hover:text-red-400 transition-colors"><X className="w-3 h-3" /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </FormField>
                    </div>
                  )}

                  {tab === 'dac' && (
                    <div className="space-y-5">
                      <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/5 to-cyan-500/5 border border-emerald-500/20">
                        <div className="flex items-center gap-2 mb-2">
                          <GitBranch className="w-4 h-4 text-emerald-400" />
                          <span className="text-sm font-bold text-emerald-400">Detection-as-Code Ready</span>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          Full DaC lifecycle: version history, promotion pipeline (draft - testing - staging - production), review workflow, and YAML export for git storage.
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <FormField label="Initial DaC Status">
                          <select
                            value={form.dac_status}
                            onChange={(e) => setForm(prev => ({ ...prev, dac_status: e.target.value }))}
                            className="form-input-premium"
                          >
                            {DAC_STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                          </select>
                        </FormField>
                        <FormField label="Source Format">
                          <select
                            value={form.source_format}
                            onChange={(e) => setForm(prev => ({ ...prev, source_format: e.target.value }))}
                            className="form-input-premium"
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
                            <div className="w-11 h-6 bg-slate-700 rounded-full peer-checked:bg-cyan-600 transition-all duration-200" />
                            <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition-all duration-200 peer-checked:translate-x-5 shadow-sm" />
                          </div>
                          <span className="text-sm text-slate-300">{form.enabled ? 'Enabled (will fire in production)' : 'Disabled (safe to deploy)'}</span>
                        </label>
                      </FormField>

                      <FormField label="Response Playbook">
                        <input
                          type="text"
                          value={form.response_playbook}
                          onChange={(e) => setForm(prev => ({ ...prev, response_playbook: e.target.value }))}
                          placeholder="e.g., PB-001-BruteForce"
                          className="form-input-premium"
                        />
                      </FormField>

                      {/* DaC Pipeline Visualization */}
                      <div className="mt-6">
                        <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3 block">Promotion Pipeline</span>
                        <div className="flex items-center gap-1">
                          {DAC_STATUSES.map((status, i) => {
                            const isActive = form.dac_status === status;
                            const isPassed = DAC_STATUSES.indexOf(form.dac_status) > i;
                            return (
                              <div key={status} className="flex items-center gap-1 flex-1">
                                <div className={`flex-1 flex items-center justify-center px-2 py-2.5 rounded-xl text-[11px] font-bold uppercase tracking-wide border transition-all ${
                                  isActive
                                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 shadow-sm shadow-cyan-500/10'
                                    : isPassed
                                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                      : 'bg-slate-800/30 text-slate-500 border-slate-700/30'
                                }`}>
                                  {status}
                                </div>
                                {i < DAC_STATUSES.length - 1 && (
                                  <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 ${isPassed ? 'text-emerald-500' : 'text-slate-700'}`} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Live YAML Panel (toggle) */}
                {showYamlPanel && (
                  <div className="w-80 shrink-0 p-4 bg-slate-950/50 overflow-y-auto">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Live YAML Preview</span>
                      <button onClick={copyYaml} className="text-[10px] text-slate-500 hover:text-emerald-400 flex items-center gap-1 transition-colors">
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap leading-relaxed">
                      {generateYamlPreview(form)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {(mode === 'manual' || aiGenerated) && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/30 bg-slate-900/50 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              {error && (
                <span className="text-xs text-red-400 flex items-center gap-1.5 bg-red-500/10 px-3 py-1.5 rounded-lg border border-red-500/20">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  {error}
                </span>
              )}
              {!error && form.rule_name && (
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${SEV_COLORS[form.severity]?.text || 'text-slate-500'} ${form.severity === 'critical' ? 'bg-red-500' : form.severity === 'high' ? 'bg-orange-500' : form.severity === 'medium' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                  <span className="text-xs text-slate-400 font-medium">{form.rule_name}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleClose}
                className="px-4 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-white bg-slate-800/50 border border-slate-700/50 hover:bg-slate-700/50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 shadow-lg shadow-cyan-600/20 disabled:shadow-none transition-all"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {saving ? 'Creating...' : `Create as ${form.dac_status.charAt(0).toUpperCase() + form.dac_status.slice(1)}`}
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .form-input-premium {
          width: 100%;
          background: rgb(15 23 42 / 0.5);
          border: 1px solid rgb(51 65 85 / 0.5);
          border-radius: 0.75rem;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: rgb(226 232 240);
          outline: none;
          transition: all 0.2s;
        }
        .form-input-premium:focus {
          border-color: rgb(6 182 212 / 0.5);
          box-shadow: 0 0 0 3px rgb(6 182 212 / 0.1);
          background: rgb(15 23 42 / 0.8);
        }
        .form-input-premium::placeholder {
          color: rgb(71 85 105);
        }
        @keyframes gradient-x {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
        .animate-gradient-x {
          background-size: 200% 100%;
          animation: gradient-x 8s ease infinite;
        }
      `}</style>
    </div>
  );
}

function FormField({ label, children, required }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-400 mb-2">
        {label}
        {required && <span className="text-cyan-400 ml-0.5">*</span>}
      </label>
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

  if (lower.includes('missing') || lower.includes('absence') || ruleType === 'negative_correlation') {
    return `# Negative Correlation - Absence Detection\n# Observed: Event A occurs\n# Expected: Event B should follow within time_window\n# Alert: When B is MISSING after A\n\nWITH observed AS (\n  SELECT entity_id, timestamp as observed_at\n  FROM events\n  WHERE event_type = 'observed_event'\n  AND timestamp > NOW() - INTERVAL time_window\n),\nexpected AS (\n  SELECT entity_id, timestamp as expected_at\n  FROM events\n  WHERE event_type = 'expected_follow_up'\n)\nSELECT o.entity_id, o.observed_at\nFROM observed o\nLEFT JOIN expected e\n  ON o.entity_id = e.entity_id\n  AND e.expected_at BETWEEN o.observed_at AND o.observed_at + INTERVAL time_window\nWHERE e.entity_id IS NULL`;
  }

  if (ruleType === 'behavioral_baseline') {
    return `# Behavioral Baseline Deviation\nWITH baseline AS (\n  SELECT entity_id,\n    AVG(event_count) as avg_count,\n    STDDEV(event_count) as std_count\n  FROM entity_daily_stats\n  WHERE date > NOW() - INTERVAL '30 days'\n  GROUP BY entity_id\n)\nSELECT e.entity_id, e.event_count, b.avg_count\nFROM today_stats e\nJOIN baseline b ON e.entity_id = b.entity_id\nWHERE e.event_count > b.avg_count + (3 * b.std_count)`;
  }

  return `# Detection Rule\n# Describe: ${prompt.substring(0, 80)}\nSELECT source_entity, COUNT(*) as occurrences\nFROM events\nWHERE event_type = 'suspicious_activity'\n  AND timestamp > NOW() - INTERVAL time_window\nGROUP BY source_entity\nHAVING occurrences >= threshold`;
}
