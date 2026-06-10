import { useState, useEffect } from 'react';
import { Shield, Plus, Search, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, CreditCard as Edit3, Trash2, Copy, Clock, Zap, AlertTriangle, Lock, Filter, X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { GuardrailPolicy } from '../../lib/guardrailsData';
import { POLICY_TYPE_CONFIG } from '../../lib/guardrailsData';

const POLICY_TEMPLATES = [
  { name: 'Prompt Injection Shield', data: { policy_name: 'Prompt Injection Detection', policy_type: 'prompt_injection', description: 'Detects and blocks common prompt injection patterns including DAN, jailbreak, and system prompt leakage attempts', enforcement_level: 'block' as const, priority: 1, conditions: JSON.stringify({ patterns: ["ignore previous", "DAN mode", "system prompt", "pretend you are"], threshold: 0.85 }, null, 2), actions: JSON.stringify({ action: "block", notify: ["security-team@0xdsi.com"], log_level: "critical" }, null, 2), tags: 'security,injection,critical', created_by: 'sarah.chen@0xdsi.com' } },
  { name: 'PII Exfiltration Guard', data: { policy_name: 'PII Exfiltration Prevention', policy_type: 'pii_redaction', description: 'Prevents sensitive personal data from being included in prompts sent to external LLMs', enforcement_level: 'block' as const, priority: 2, conditions: JSON.stringify({ entity_types: ["ssn", "credit_card", "passport", "bank_account"], min_confidence: 0.9 }, null, 2), actions: JSON.stringify({ action: "redact_and_warn", redaction_strategy: "tokenize", notify: ["dpo@0xdsi.com"] }, null, 2), tags: 'privacy,pii,compliance', created_by: 'aisha.patel@0xdsi.com' } },
  { name: 'Topic Boundary Enforcer', data: { policy_name: 'Forbidden Topic Enforcer', policy_type: 'topic_block', description: 'Prevents queries about restricted topics including competitor analysis and M&A activities', enforcement_level: 'warn' as const, priority: 5, conditions: JSON.stringify({ topics: ["competitor_analysis", "legal_advice", "merger_acquisition"], semantic_match: true }, null, 2), actions: JSON.stringify({ action: "warn_user", message: "This topic is restricted by corporate policy" }, null, 2), tags: 'compliance,topics,corporate', created_by: 'marcus.rodriguez@0xdsi.com' } },
  { name: 'Rate Limit Controller', data: { policy_name: 'API Rate Limiter', policy_type: 'rate_limit', description: 'Enforces per-user and per-department rate limits to prevent cost overruns', enforcement_level: 'block' as const, priority: 3, conditions: JSON.stringify({ max_requests_per_minute: 30, max_tokens_per_hour: 100000 }, null, 2), actions: JSON.stringify({ action: "throttle", retry_after_seconds: 60, escalate_after: 3 }, null, 2), tags: 'rate-limit,cost,abuse-prevention', created_by: 'david.kim@0xdsi.com' } },
  { name: 'Output Content Filter', data: { policy_name: 'Response Safety Filter', policy_type: 'output_filter', description: 'Scans LLM responses for harmful or biased content before delivery', enforcement_level: 'warn' as const, priority: 4, conditions: JSON.stringify({ categories: ["harmful", "biased", "offensive"], threshold: 0.7 }, null, 2), actions: JSON.stringify({ action: "flag_and_review", add_disclaimer: true }, null, 2), tags: 'safety,content,output', created_by: 'emily.watson@0xdsi.com' } },
  { name: 'Cost Overrun Protection', data: { policy_name: 'Cost Ceiling Enforcer', policy_type: 'cost_limit', description: 'Hard cost ceiling per department per billing cycle', enforcement_level: 'block' as const, priority: 2, conditions: JSON.stringify({ max_cost_per_day: 500, max_cost_per_month: 10000, warn_at_pct: 80 }, null, 2), actions: JSON.stringify({ action: "block_and_notify", notify: ["finance@0xdsi.com"], fallback_model: "gpt-3.5-turbo" }, null, 2), tags: 'cost,budget,finance', created_by: 'james.park@0xdsi.com' } },
];

const EMPTY_FORM = { policy_name: '', policy_type: 'prompt_injection', description: '', enforcement_level: 'warn' as const, priority: 10, conditions: '{}', actions: '{}', tags: '', created_by: 'sarah.chen@0xdsi.com' };

const PolicyManager = () => {
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterEnforcement, setFilterEnforcement] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState('');
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<GuardrailPolicy | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { loadPolicies(); }, []);

  const loadPolicies = async () => {
    const { data } = await supabase.from('guardrail_policies').select('*').order('priority');
    if (data) setPolicies(data);
  };

  const togglePolicy = async (id: string, enabled: boolean) => {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, enabled: !enabled } : p));
    await supabase.from('guardrail_policies').update({ enabled: !enabled }).eq('id', id);
  };

  const openCreate = (tpl?: any) => {
    setEditingPolicy(null);
    setFormData(tpl ? { ...EMPTY_FORM, ...tpl } : EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (policy: GuardrailPolicy) => {
    setEditingPolicy(policy);
    setFormData({ policy_name: policy.policy_name, policy_type: policy.policy_type, description: policy.description, enforcement_level: policy.enforcement_level, priority: policy.priority, conditions: JSON.stringify(policy.conditions, null, 2), actions: JSON.stringify(policy.actions, null, 2), tags: (policy.tags || []).join(', '), created_by: policy.created_by });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formData.policy_name.trim()) return;
    setSaving(true);
    let conditions: any = {}; let actions: any = {};
    try { conditions = JSON.parse(formData.conditions); } catch { conditions = {}; }
    try { actions = JSON.parse(formData.actions); } catch { actions = {}; }
    const payload = { policy_name: formData.policy_name.trim(), policy_type: formData.policy_type, description: formData.description.trim(), enforcement_level: formData.enforcement_level, priority: formData.priority, conditions, actions, tags: formData.tags.split(',').map(t => t.trim()).filter(Boolean), created_by: formData.created_by };
    if (editingPolicy) {
      const { data } = await supabase.from('guardrail_policies').update({ ...payload, version: editingPolicy.version + 1, updated_at: new Date().toISOString() }).eq('id', editingPolicy.id).select().single();
      if (data) setPolicies(prev => prev.map(p => p.id === data.id ? data : p));
    } else {
      const { data } = await supabase.from('guardrail_policies').insert({ ...payload, enabled: true, version: 1, hit_count: 0, block_count: 0, warn_count: 0, false_positive_count: 0 }).select().single();
      if (data) setPolicies(prev => [data, ...prev]);
    }
    setSaving(false);
    setShowModal(false);
  };

  const handleDelete = async (id: string) => {
    await supabase.from('guardrail_policies').delete().eq('id', id);
    setPolicies(prev => prev.filter(p => p.id !== id));
    setDeleteConfirm(null);
  };

  const duplicatePolicy = (policy: GuardrailPolicy) => openCreate({ policy_name: `${policy.policy_name} (Copy)`, policy_type: policy.policy_type, description: policy.description, enforcement_level: policy.enforcement_level, priority: policy.priority + 1, conditions: JSON.stringify(policy.conditions, null, 2), actions: JSON.stringify(policy.actions, null, 2), tags: (policy.tags || []).join(', '), created_by: policy.created_by });

  const runTestScan = () => {
    if (!testPrompt.trim()) return;
    setTestRunning(true);
    setTimeout(() => {
      const results = policies.filter(p => p.enabled).map(policy => {
        const conditions = policy.conditions as any;
        const patterns = conditions?.patterns || conditions?.keywords || conditions?.topics || [];
        const matched = patterns.some((pat: string) => testPrompt.toLowerCase().includes(pat.toLowerCase()));
        return { policy_name: policy.policy_name, policy_type: policy.policy_type, enforcement_level: policy.enforcement_level, matched, priority: policy.priority };
      }).filter(r => r.matched);
      setTestResults(results);
      setTestRunning(false);
    }, 1500);
  };

  const filteredPolicies = policies.filter(p => {
    if (filterType !== 'all' && p.policy_type !== filterType) return false;
    if (filterEnforcement !== 'all' && p.enforcement_level !== filterEnforcement) return false;
    if (searchQuery && !p.policy_name.toLowerCase().includes(searchQuery.toLowerCase()) && !p.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const policyTypes = Array.from(new Set(policies.map(p => p.policy_type)));

  return (
    <div className="space-y-6">
      {/* CRUD Header */}
      <div className="rounded-xl border border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-cyan-500/5 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-200">Quick Deploy Templates</h3>
            <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-400 font-medium">DATABRICKS DASF</span>
          </div>
          <button onClick={() => openCreate()} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2">
            <Plus className="w-4 h-4" /> New Policy
          </button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          {POLICY_TEMPLATES.map((tpl) => (
            <button key={tpl.name} onClick={() => openCreate(tpl.data)} className="px-3 py-2 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700/40 hover:border-blue-500/30 rounded-lg text-[11px] text-slate-300 hover:text-white transition-all text-left">
              {tpl.name}
            </button>
          ))}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search policies..." className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20" />
        </div>
        <div className="flex gap-2">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50">
            <option value="all">All Types</option>
            {policyTypes.map(t => <option key={t} value={t}>{POLICY_TYPE_CONFIG[t]?.label || t}</option>)}
          </select>
          <select value={filterEnforcement} onChange={(e) => setFilterEnforcement(e.target.value)} className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50">
            <option value="all">All Enforcement</option>
            <option value="block">Block</option>
            <option value="warn">Warn</option>
            <option value="log">Log</option>
          </select>
        </div>
      </div>

      {/* Test Sandbox */}
      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Policy Test Sandbox</h3>
          <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] text-cyan-400 font-medium">INTERACTIVE</span>
        </div>
        <div className="flex gap-3">
          <input type="text" value={testPrompt} onChange={(e) => setTestPrompt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && runTestScan()} placeholder="Paste a prompt to test which policies would trigger..." className="flex-1 px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20" />
          <button onClick={runTestScan} disabled={testRunning || !testPrompt.trim()} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2">
            {testRunning ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning...</> : <><Shield className="w-3.5 h-3.5" /> Test</>}
          </button>
        </div>
        {testResults !== null && (
          <div className="mt-3 p-3 bg-slate-900/60 rounded-lg border border-slate-700/40">
            {testResults.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm"><Shield className="w-4 h-4" /> No policies triggered. Prompt would pass through.</div>
            ) : (
              <div>
                <p className="text-sm text-red-400 font-medium mb-2">{testResults.length} {testResults.length === 1 ? 'policy' : 'policies'} would trigger:</p>
                <div className="space-y-1.5">
                  {testResults.map((r, i) => {
                    const config = POLICY_TYPE_CONFIG[r.policy_type];
                    return (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-800/60 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config?.bgColor} ${config?.color} border ${config?.borderColor}`}>{config?.label}</span>
                          <span className="text-xs text-slate-300">{r.policy_name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.enforcement_level === 'block' ? 'bg-red-500/15 text-red-400 border border-red-500/30' : r.enforcement_level === 'warn' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}`}>{r.enforcement_level.toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Policy List */}
      <div className="space-y-3">
        {filteredPolicies.map((policy) => {
          const config = POLICY_TYPE_CONFIG[policy.policy_type];
          const isExpanded = expandedPolicy === policy.id;
          const effectiveness = policy.hit_count > 0 ? ((policy.hit_count - policy.false_positive_count) / policy.hit_count * 100).toFixed(1) : '100.0';

          return (
            <div key={policy.id} className={`rounded-xl border transition-all duration-200 overflow-hidden ${!policy.enabled ? 'border-slate-800/50 bg-slate-900/30 opacity-60' : policy.enforcement_level === 'block' ? 'border-slate-700/50 bg-slate-800/20 hover:border-red-500/30' : policy.enforcement_level === 'warn' ? 'border-slate-700/50 bg-slate-800/20 hover:border-amber-500/30' : 'border-slate-700/50 bg-slate-800/20 hover:border-slate-600/50'}`}>
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button onClick={() => togglePolicy(policy.id, policy.enabled)} className="flex-shrink-0 transition-transform hover:scale-110">
                      {policy.enabled ? <ToggleRight className="w-8 h-5 text-emerald-400" /> : <ToggleLeft className="w-8 h-5 text-slate-600" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200">{policy.policy_name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config?.bgColor} ${config?.color} border ${config?.borderColor}`}>{config?.label || policy.policy_type}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${policy.enforcement_level === 'block' ? 'bg-red-500/15 text-red-400 border border-red-500/30' : policy.enforcement_level === 'warn' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' : 'bg-slate-500/15 text-slate-400 border border-slate-500/30'}`}>
                          {policy.enforcement_level === 'block' ? <Lock className="w-2.5 h-2.5 inline mr-0.5" /> : null}{policy.enforcement_level.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono">P{policy.priority}</span>
                        <span className="text-[10px] text-slate-600">v{policy.version}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">{policy.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-white tabular-nums">{policy.hit_count.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">hits total</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-red-400 tabular-nums">{policy.block_count.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">blocked</p>
                    </div>
                    <div className="text-right hidden lg:block">
                      <p className={`text-sm font-bold tabular-nums ${Number(effectiveness) >= 95 ? 'text-emerald-400' : Number(effectiveness) >= 85 ? 'text-blue-400' : 'text-amber-400'}`}>{effectiveness}%</p>
                      <p className="text-[10px] text-slate-500">accuracy</p>
                    </div>
                    <button onClick={() => openEdit(policy)} className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-cyan-400 transition-colors" title="Edit"><Edit3 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => duplicatePolicy(policy)} className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-blue-400 transition-colors" title="Duplicate"><Copy className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setDeleteConfirm(policy.id)} className="p-1.5 hover:bg-slate-700/50 rounded-lg text-slate-400 hover:text-red-400 transition-colors" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setExpandedPolicy(isExpanded ? null : policy.id)} className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </button>
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-slate-700/30 pt-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Conditions</h4>
                      <pre className="text-xs text-slate-300 bg-slate-900/60 rounded-lg p-3 overflow-x-auto font-mono max-h-40 overflow-y-auto custom-scrollbar">{JSON.stringify(policy.conditions, null, 2)}</pre>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Actions</h4>
                      <pre className="text-xs text-slate-300 bg-slate-900/60 rounded-lg p-3 overflow-x-auto font-mono max-h-40 overflow-y-auto custom-scrollbar">{JSON.stringify(policy.actions, null, 2)}</pre>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex items-center gap-1 text-xs text-slate-500"><Clock className="w-3 h-3" />Last triggered: {policy.last_triggered_at ? new Date(policy.last_triggered_at).toLocaleString() : 'Never'}</div>
                    <div className="text-xs text-slate-600">Created by: {policy.created_by}</div>
                    <div className="flex gap-1 flex-wrap">{policy.tags?.map(tag => <span key={tag} className="px-1.5 py-0.5 bg-slate-700/40 rounded text-[10px] text-slate-400">{tag}</span>)}</div>
                  </div>
                  <div className="flex items-center gap-6 mt-4 pt-3 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 text-xs"><span className="text-slate-500">Warns:</span><span className="text-amber-400 font-bold tabular-nums">{policy.warn_count.toLocaleString()}</span></div>
                    <div className="flex items-center gap-2 text-xs"><span className="text-slate-500">False Positives:</span><span className="text-orange-400 font-bold tabular-nums">{policy.false_positive_count.toLocaleString()}</span></div>
                    <div className="flex items-center gap-2 text-xs"><span className="text-slate-500">FP Rate:</span><span className="text-slate-300 font-bold tabular-nums">{policy.hit_count > 0 ? ((policy.false_positive_count / policy.hit_count) * 100).toFixed(2) : '0.00'}%</span></div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-[#0f1a2e] border border-slate-700/60 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#0f1a2e] border-b border-slate-700/40 px-6 py-4 flex items-center justify-between z-10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center"><Shield className="w-4 h-4 text-cyan-400" /></div>
                <h2 className="text-lg font-bold text-white">{editingPolicy ? 'Edit Policy' : 'Create New Policy'}</h2>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-slate-700/50 rounded-lg transition-colors"><X className="w-5 h-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Policy Name</label>
                  <input type="text" value={formData.policy_name} onChange={(e) => setFormData(p => ({ ...p, policy_name: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20" placeholder="e.g., Prompt Injection Shield" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Policy Type</label>
                  <select value={formData.policy_type} onChange={(e) => setFormData(p => ({ ...p, policy_type: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    {Object.entries(POLICY_TYPE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData(p => ({ ...p, description: e.target.value }))} rows={2} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none" placeholder="Describe what this policy does..." />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Enforcement</label>
                  <select value={formData.enforcement_level} onChange={(e) => setFormData(p => ({ ...p, enforcement_level: e.target.value as any }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    <option value="log">Log Only</option><option value="warn">Warn</option><option value="block">Block</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Priority</label>
                  <input type="number" value={formData.priority} onChange={(e) => setFormData(p => ({ ...p, priority: Number(e.target.value) }))} min={1} max={100} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Created By</label>
                  <select value={formData.created_by} onChange={(e) => setFormData(p => ({ ...p, created_by: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50">
                    <option value="sarah.chen@0xdsi.com">sarah.chen@0xdsi.com</option>
                    <option value="david.kim@0xdsi.com">david.kim@0xdsi.com</option>
                    <option value="marcus.rodriguez@0xdsi.com">marcus.rodriguez@0xdsi.com</option>
                    <option value="aisha.patel@0xdsi.com">aisha.patel@0xdsi.com</option>
                    <option value="james.park@0xdsi.com">james.park@0xdsi.com</option>
                    <option value="emily.watson@0xdsi.com">emily.watson@0xdsi.com</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Conditions (JSON)</label>
                <textarea value={formData.conditions} onChange={(e) => setFormData(p => ({ ...p, conditions: e.target.value }))} rows={5} className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Actions (JSON)</label>
                <textarea value={formData.actions} onChange={(e) => setFormData(p => ({ ...p, actions: e.target.value }))} rows={4} className="w-full px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-lg text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 block">Tags (comma separated)</label>
                <input type="text" value={formData.tags} onChange={(e) => setFormData(p => ({ ...p, tags: e.target.value }))} className="w-full px-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20" placeholder="security, injection, critical" />
              </div>
            </div>
            <div className="sticky bottom-0 bg-[#0f1a2e] border-t border-slate-700/40 px-6 py-4 flex items-center justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-5 py-2.5 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">Cancel</button>
              <button onClick={handleSave} disabled={saving || !formData.policy_name.trim()} className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2">
                {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Saving...</> : <><Save className="w-4 h-4" /> {editingPolicy ? 'Update Policy' : 'Create Policy'}</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-[#0f1a2e] border border-red-500/30 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-white mb-2">Delete Policy?</h3>
            <p className="text-sm text-slate-400 mb-5">This action cannot be undone. The policy will be permanently removed from enforcement.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 bg-slate-700/50 hover:bg-slate-700 text-slate-300 text-sm rounded-lg">Cancel</button>
              <button onClick={() => handleDelete(deleteConfirm)} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm rounded-lg flex items-center gap-2"><Trash2 className="w-3.5 h-3.5" /> Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PolicyManager;
