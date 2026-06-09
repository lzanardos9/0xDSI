import { useState, useEffect } from 'react';
import { Shield, ShieldCheck, ShieldAlert, ShieldBan, Lock, Search, ChevronDown, ChevronUp, Users, Clock, AlertTriangle, Brain, Plus, CreditCard as Edit2, Trash2, X, Save } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ModelAccessRule } from '../../lib/guardrailsData';
import { TIER_CONFIG, MODEL_STATUS_CONFIG } from '../../lib/guardrailsData';

const PROVIDERS = ['OpenAI', 'Anthropic', 'Google', 'Meta', 'Mistral', 'Cohere', 'Databricks', 'HuggingFace', 'Custom'];
const ROLES = ['admin', 'developer', 'analyst', 'data_scientist', 'manager', 'security', 'compliance', 'viewer'];
const DEPARTMENTS = ['engineering', 'data_science', 'security', 'compliance', 'product', 'marketing', 'finance', 'hr', 'legal', 'operations'];
const USE_CASES = ['general_qa', 'code_generation', 'data_analysis', 'summarization', 'translation', 'content_creation', 'research', 'customer_support', 'internal_tools'];
const BLOCKED_TOPICS = ['financial_advice', 'medical_advice', 'legal_counsel', 'competitor_data', 'internal_strategy', 'employee_data', 'security_exploits', 'harmful_content'];

const TEMPLATES = {
  enterprise: {
    name: 'Enterprise LLM',
    data: {
      risk_tier: 'tier1_internal',
      allowed_roles: ['admin', 'developer', 'analyst'],
      allowed_departments: ['engineering', 'data_science'],
      requires_approval: true,
      approval_chain: [{ role: 'security', required: true }, { role: 'compliance', required: false }],
      max_context_window: 128000,
      allowed_use_cases: ['general_qa', 'code_generation', 'data_analysis'],
      blocked_topics: ['competitor_data', 'financial_advice'],
      data_classification_max: 'confidential',
      status: 'approved'
    }
  },
  commercial: {
    name: 'Commercial API',
    data: {
      risk_tier: 'tier2_commercial',
      allowed_roles: ['developer', 'analyst', 'data_scientist'],
      allowed_departments: ['engineering', 'product'],
      requires_approval: false,
      approval_chain: [],
      max_context_window: 32000,
      allowed_use_cases: ['general_qa', 'code_generation'],
      blocked_topics: ['internal_strategy', 'employee_data'],
      data_classification_max: 'internal',
      status: 'approved'
    }
  },
  opensource: {
    name: 'Open Source',
    data: {
      risk_tier: 'tier3_opensource',
      allowed_roles: ['developer', 'analyst'],
      allowed_departments: ['engineering'],
      requires_approval: false,
      approval_chain: [],
      max_context_window: 8192,
      allowed_use_cases: ['general_qa', 'research'],
      blocked_topics: [],
      data_classification_max: 'public',
      status: 'approved'
    }
  },
  experimental: {
    name: 'Experimental',
    data: {
      risk_tier: 'tier4_experimental',
      allowed_roles: ['admin', 'developer'],
      allowed_departments: ['engineering'],
      requires_approval: true,
      approval_chain: [{ role: 'security', required: true }],
      max_context_window: 4096,
      allowed_use_cases: ['research'],
      blocked_topics: ['financial_advice', 'medical_advice', 'legal_counsel'],
      data_classification_max: 'public',
      status: 'under_review'
    }
  }
};

type ApprovalStep = { role: string; required: boolean };

interface FormData {
  model_name: string;
  model_provider: string;
  model_version: string;
  risk_tier: string;
  allowed_roles: string[];
  allowed_departments: string[];
  requires_approval: boolean;
  approval_chain: ApprovalStep[];
  max_context_window: number;
  allowed_use_cases: string[];
  blocked_topics: string[];
  data_classification_max: string;
  status: string;
  notes: string;
}

const initialFormData: FormData = {
  model_name: '',
  model_provider: '',
  model_version: '',
  risk_tier: 'tier2_commercial',
  allowed_roles: [],
  allowed_departments: [],
  requires_approval: false,
  approval_chain: [],
  max_context_window: 8192,
  allowed_use_cases: [],
  blocked_topics: [],
  data_classification_max: 'internal',
  status: 'under_review',
  notes: ''
};

const ModelAccessGovernance = () => {
  const [models, setModels] = useState<ModelAccessRule[]>([]);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [statusChangeId, setStatusChangeId] = useState<string | null>(null);
  const [statusChangeAction, setStatusChangeAction] = useState<'approve' | 'deprecate' | 'ban' | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, []);

  const loadModels = async () => {
    const { data } = await supabase.from('model_access_rules').select('*').order('usage_count', { ascending: false });
    if (data) setModels(data);
  };

  const filtered = models.filter(m => {
    if (filterTier !== 'all' && m.risk_tier !== filterTier) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    if (searchQuery && !m.model_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !m.model_provider.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const tierCounts = models.reduce<Record<string, number>>((acc, m) => {
    acc[m.risk_tier] = (acc[m.risk_tier] || 0) + 1;
    return acc;
  }, {});

  const statusCounts = models.reduce<Record<string, number>>((acc, m) => {
    acc[m.status] = (acc[m.status] || 0) + 1;
    return acc;
  }, {});

  const totalUsage = models.reduce((sum, m) => sum + m.usage_count, 0);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <ShieldCheck className="w-4 h-4 text-emerald-400" />;
      case 'under_review': return <Clock className="w-4 h-4 text-amber-400" />;
      case 'deprecated': return <ShieldAlert className="w-4 h-4 text-slate-400" />;
      case 'banned': return <ShieldBan className="w-4 h-4 text-red-400" />;
      default: return <Shield className="w-4 h-4 text-slate-400" />;
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setEditingId(null);
    setFormData(initialFormData);
    setShowModal(true);
  };

  const openEditModal = (model: ModelAccessRule) => {
    setModalMode('edit');
    setEditingId(model.id);
    setFormData({
      model_name: model.model_name,
      model_provider: model.model_provider,
      model_version: model.model_version,
      risk_tier: model.risk_tier,
      allowed_roles: model.allowed_roles,
      allowed_departments: model.allowed_departments,
      requires_approval: model.requires_approval,
      approval_chain: model.approval_chain as ApprovalStep[],
      max_context_window: model.max_context_window,
      allowed_use_cases: model.allowed_use_cases,
      blocked_topics: model.blocked_topics,
      data_classification_max: model.data_classification_max,
      status: model.status,
      notes: model.notes || ''
    });
    setShowModal(true);
  };

  const applyTemplate = (templateKey: keyof typeof TEMPLATES) => {
    const template = TEMPLATES[templateKey];
    setFormData({
      ...formData,
      ...template.data
    });
  };

  const handleSaveModel = async () => {
    if (!formData.model_name || !formData.model_provider) {
      alert('Please fill in model name and provider');
      return;
    }

    try {
      if (modalMode === 'create') {
        const { error } = await supabase.from('model_access_rules').insert([
          {
            ...formData,
            usage_count: 0,
            created_at: new Date().toISOString()
          }
        ]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('model_access_rules')
          .update(formData)
          .eq('id', editingId);
        if (error) throw error;
      }
      await loadModels();
      setShowModal(false);
      setFormData(initialFormData);
    } catch (error) {
      console.error('Error saving model:', error);
      alert('Failed to save model');
    }
  };

  const handleStatusChange = async (action: 'approve' | 'deprecate' | 'ban') => {
    if (!statusChangeId) return;

    try {
      const statusMap = { approve: 'approved', deprecate: 'deprecated', ban: 'banned' };
      const { error } = await supabase.from('model_access_rules')
        .update({ status: statusMap[action] })
        .eq('id', statusChangeId);
      if (error) throw error;
      await loadModels();
      setStatusChangeId(null);
      setStatusChangeAction(null);
    } catch (error) {
      console.error('Error changing status:', error);
      alert('Failed to change status');
    }
  };

  const handleDeleteModel = async () => {
    if (!deleteConfirmId) return;

    try {
      const { error } = await supabase.from('model_access_rules').delete().eq('id', deleteConfirmId);
      if (error) throw error;
      await loadModels();
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Error deleting model:', error);
      alert('Failed to delete model');
    }
  };

  const toggleMultiSelect = (value: string, array: string[]) => {
    if (array.includes(value)) {
      return array.filter(v => v !== value);
    } else {
      return [...array, value];
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-100">Model Access Governance</h2>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Register Model
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Object.entries(TIER_CONFIG).map(([key, config]) => {
          const count = tierCounts[key] || 0;
          return (
            <button
              key={key}
              onClick={() => setFilterTier(filterTier === key ? 'all' : key)}
              className={`rounded-xl border p-4 text-left transition-all ${
                filterTier === key
                  ? `${config.borderColor} ${config.bgColor}`
                  : 'border-slate-700/50 bg-slate-800/20 hover:border-slate-600/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-bold ${config.color}`}>{config.label}</span>
                {key === 'tier1_internal' && <Lock className="w-3.5 h-3.5 text-emerald-400" />}
                {key === 'tier4_experimental' && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
              </div>
              <p className="text-2xl font-bold text-white">{count}</p>
              <p className="text-[10px] text-slate-500 mt-1">models</p>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Object.entries(MODEL_STATUS_CONFIG).map(([key, config]) => (
          <div key={key} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-slate-700/40 bg-slate-800/20">
            {getStatusIcon(key)}
            <div>
              <p className={`text-sm font-bold ${config.color}`}>{statusCounts[key] || 0}</p>
              <p className="text-[10px] text-slate-500">{config.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50"
          />
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none"
        >
          <option value="all">All Status</option>
          {Object.entries(MODEL_STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((model) => {
          const tierConfig = TIER_CONFIG[model.risk_tier] || TIER_CONFIG.tier2_commercial;
          const statusConfig = MODEL_STATUS_CONFIG[model.status] || MODEL_STATUS_CONFIG.approved;
          const isExpanded = expandedModel === model.id;
          const usagePct = totalUsage > 0 ? ((model.usage_count / totalUsage) * 100).toFixed(1) : '0';

          return (
            <div
              key={model.id}
              className={`rounded-xl border overflow-hidden transition-all ${
                model.status === 'banned' ? 'border-red-500/30 bg-red-500/5' :
                model.status === 'deprecated' ? 'border-slate-600/40 bg-slate-800/10 opacity-70' :
                model.status === 'under_review' ? 'border-amber-500/20 bg-amber-500/5' :
                'border-slate-700/50 bg-slate-800/20 hover:border-slate-600/50'
              }`}
            >
              <div
                className="px-5 py-4 cursor-pointer"
                onClick={() => setExpandedModel(isExpanded ? null : model.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    {getStatusIcon(model.status)}
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200">{model.model_name}</span>
                        <span className="text-xs text-slate-500">{model.model_provider}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${tierConfig.bgColor} ${tierConfig.color} ${tierConfig.borderColor}`}>
                          {tierConfig.label}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${statusConfig.bgColor} ${statusConfig.color} ${statusConfig.borderColor}`}>
                          {statusConfig.label}
                        </span>
                        {model.requires_approval && (
                          <span className="px-1.5 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-[10px] text-amber-400 font-medium flex items-center gap-0.5">
                            <Lock className="w-2.5 h-2.5" /> Approval Required
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-0.5">{model.model_version} | Max context: {(model.max_context_window / 1000).toFixed(0)}K | Data: {model.data_classification_max}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-white tabular-nums">{model.usage_count.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">{usagePct}% of total</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-slate-700/30 pt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3 bg-slate-900/40 rounded-lg">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Users className="w-3 h-3" /> Access Control
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">Allowed Roles</p>
                          <div className="flex gap-1 flex-wrap">
                            {model.allowed_roles.map(role => (
                              <span key={role} className="px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] text-emerald-400">{role}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">Allowed Departments</p>
                          <div className="flex gap-1 flex-wrap">
                            {model.allowed_departments.map(dept => (
                              <span key={dept} className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] text-blue-400">{dept}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-900/40 rounded-lg">
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Brain className="w-3 h-3" /> Use Cases & Restrictions
                      </h4>
                      <div className="space-y-2">
                        <div>
                          <p className="text-[10px] text-slate-500 mb-1">Allowed Use Cases</p>
                          <div className="flex gap-1 flex-wrap">
                            {model.allowed_use_cases.map(uc => (
                              <span key={uc} className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] text-cyan-400">
                                {uc.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                        {model.blocked_topics.length > 0 && (
                          <div>
                            <p className="text-[10px] text-slate-500 mb-1">Blocked Topics</p>
                            <div className="flex gap-1 flex-wrap">
                              {model.blocked_topics.map(topic => (
                                <span key={topic} className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-[10px] text-red-400">
                                  {topic.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {model.requires_approval && model.approval_chain && model.approval_chain.length > 0 && (
                    <div className="p-3 bg-amber-500/5 border border-amber-500/15 rounded-lg">
                      <h4 className="text-xs font-semibold text-amber-400 mb-2">Approval Chain</h4>
                      <div className="flex items-center gap-2">
                        {(model.approval_chain as any[]).map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            {i > 0 && <div className="w-6 h-px bg-amber-500/30" />}
                            <div className="px-3 py-1.5 bg-slate-800/60 rounded-lg border border-amber-500/20">
                              <p className="text-xs text-slate-300">{step.role?.replace(/_/g, ' ')}</p>
                              <p className="text-[10px] text-amber-400">{step.required ? 'Required' : 'Optional'}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 bg-slate-900/40 rounded-lg">
                    <p className="text-xs text-slate-400">{model.notes}</p>
                    <div className="flex items-center gap-4 mt-2 text-[10px] text-slate-500">
                      {model.approved_by && <span>Approved by: {model.approved_by}</span>}
                      {model.last_used_at && <span>Last used: {new Date(model.last_used_at).toLocaleString()}</span>}
                    </div>
                  </div>

                  {model.status === 'banned' && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2">
                      <ShieldBan className="w-5 h-5 text-red-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-400">Model Banned</p>
                        <p className="text-xs text-red-400/70">This model has been permanently banned. All access requests are automatically rejected.</p>
                      </div>
                    </div>
                  )}

                  {model.status === 'deprecated' && (
                    <div className="p-3 bg-slate-500/10 border border-slate-500/20 rounded-lg flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-slate-400">Model Deprecated</p>
                        <p className="text-xs text-slate-500">This model is being phased out. Migrate to an approved alternative.</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      onClick={() => openEditModal(model)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-teal-600/20 hover:bg-teal-600/30 border border-teal-600/40 rounded-lg text-xs font-medium text-teal-300 transition-colors"
                    >
                      <Edit2 className="w-3 h-3" /> Edit
                    </button>
                    {model.status !== 'approved' && (
                      <button
                        onClick={() => { setStatusChangeId(model.id); setStatusChangeAction('approve'); }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-600/40 rounded-lg text-xs font-medium text-emerald-300 transition-colors"
                      >
                        <CheckCircle className="w-3 h-3" /> Approve
                      </button>
                    )}
                    {model.status !== 'deprecated' && (
                      <button
                        onClick={() => { setStatusChangeId(model.id); setStatusChangeAction('deprecate'); }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-slate-600/20 hover:bg-slate-600/30 border border-slate-600/40 rounded-lg text-xs font-medium text-slate-300 transition-colors"
                      >
                        <AlertTriangle className="w-3 h-3" /> Deprecate
                      </button>
                    )}
                    {model.status !== 'banned' && (
                      <button
                        onClick={() => { setStatusChangeId(model.id); setStatusChangeAction('ban'); }}
                        className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/30 border border-red-600/40 rounded-lg text-xs font-medium text-red-300 transition-colors"
                      >
                        <ShieldBan className="w-3 h-3" /> Ban
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteConfirmId(model.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-900/20 hover:bg-red-900/30 border border-red-900/40 rounded-lg text-xs font-medium text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" /> Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 flex items-center justify-between p-6 border-b border-slate-700/30 bg-slate-900">
              <h3 className="text-lg font-bold text-slate-100">
                {modalMode === 'create' ? 'Register New Model' : 'Edit Model'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {modalMode === 'create' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Quick Start Templates</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(TEMPLATES).map(([key, template]) => (
                      <button
                        key={key}
                        onClick={() => applyTemplate(key as keyof typeof TEMPLATES)}
                        className="p-2 border border-slate-700/50 hover:border-teal-500/50 rounded-lg bg-slate-800/50 hover:bg-slate-800 transition-all text-left"
                      >
                        <p className="text-xs font-semibold text-teal-400">{template.name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Auto-fill tier & settings</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Model Name</label>
                  <input
                    type="text"
                    value={formData.model_name}
                    onChange={(e) => setFormData({ ...formData, model_name: e.target.value })}
                    placeholder="e.g., GPT-4"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Provider</label>
                  <select
                    value={formData.model_provider}
                    onChange={(e) => setFormData({ ...formData, model_provider: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
                  >
                    <option value="">Select Provider</option>
                    {PROVIDERS.map(p => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Model Version</label>
                  <input
                    type="text"
                    value={formData.model_version}
                    onChange={(e) => setFormData({ ...formData, model_version: e.target.value })}
                    placeholder="e.g., 1.0.0"
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Risk Tier</label>
                  <select
                    value={formData.risk_tier}
                    onChange={(e) => setFormData({ ...formData, risk_tier: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
                  >
                    {Object.entries(TIER_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Max Context Window</label>
                  <input
                    type="number"
                    value={formData.max_context_window}
                    onChange={(e) => setFormData({ ...formData, max_context_window: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Data Classification Max</label>
                  <select
                    value={formData.data_classification_max}
                    onChange={(e) => setFormData({ ...formData, data_classification_max: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
                  >
                    {['public', 'internal', 'confidential', 'secret'].map(dc => (
                      <option key={dc} value={dc}>{dc}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-teal-500/50"
                  >
                    {Object.entries(MODEL_STATUS_CONFIG).map(([k, v]) => (
                      <option key={k} value={k}>{v.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 mb-3">
                  <input
                    type="checkbox"
                    checked={formData.requires_approval}
                    onChange={(e) => setFormData({ ...formData, requires_approval: e.target.checked })}
                    className="w-4 h-4 rounded border border-slate-600 bg-slate-800 checked:bg-teal-600 checked:border-teal-600 accent-teal-600"
                  />
                  <span className="text-sm font-semibold text-slate-300">Requires Approval</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Allowed Roles</label>
                <div className="flex flex-wrap gap-2">
                  {ROLES.map(role => (
                    <button
                      key={role}
                      onClick={() => setFormData({ ...formData, allowed_roles: toggleMultiSelect(role, formData.allowed_roles) })}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        formData.allowed_roles.includes(role)
                          ? 'bg-teal-600 text-white border border-teal-500'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600/50'
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Allowed Departments</label>
                <div className="flex flex-wrap gap-2">
                  {DEPARTMENTS.map(dept => (
                    <button
                      key={dept}
                      onClick={() => setFormData({ ...formData, allowed_departments: toggleMultiSelect(dept, formData.allowed_departments) })}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        formData.allowed_departments.includes(dept)
                          ? 'bg-teal-600 text-white border border-teal-500'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600/50'
                      }`}
                    >
                      {dept}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Allowed Use Cases</label>
                <div className="flex flex-wrap gap-2">
                  {USE_CASES.map(uc => (
                    <button
                      key={uc}
                      onClick={() => setFormData({ ...formData, allowed_use_cases: toggleMultiSelect(uc, formData.allowed_use_cases) })}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        formData.allowed_use_cases.includes(uc)
                          ? 'bg-teal-600 text-white border border-teal-500'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600/50'
                      }`}
                    >
                      {uc.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Blocked Topics</label>
                <div className="flex flex-wrap gap-2">
                  {BLOCKED_TOPICS.map(topic => (
                    <button
                      key={topic}
                      onClick={() => setFormData({ ...formData, blocked_topics: toggleMultiSelect(topic, formData.blocked_topics) })}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        formData.blocked_topics.includes(topic)
                          ? 'bg-red-600 text-white border border-red-500'
                          : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:border-slate-600/50'
                      }`}
                    >
                      {topic.replace(/_/g, ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Approval Chain</label>
                <div className="space-y-2">
                  {formData.approval_chain.map((step, i) => (
                    <div key={i} className="flex gap-2 items-end">
                      <select
                        value={step.role}
                        onChange={(e) => {
                          const newChain = [...formData.approval_chain];
                          newChain[i].role = e.target.value;
                          setFormData({ ...formData, approval_chain: newChain });
                        }}
                        className="flex-1 px-2 py-1.5 bg-slate-800/50 border border-slate-700/50 rounded text-xs text-slate-200 focus:outline-none focus:border-teal-500/50"
                      >
                        <option value="">Select Role</option>
                        {ROLES.map(r => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-1 px-2 py-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={step.required}
                          onChange={(e) => {
                            const newChain = [...formData.approval_chain];
                            newChain[i].required = e.target.checked;
                            setFormData({ ...formData, approval_chain: newChain });
                          }}
                          className="w-3 h-3 rounded border border-slate-600 bg-slate-800 checked:bg-teal-600 accent-teal-600"
                        />
                        <span className="text-slate-400">Required</span>
                      </label>
                      <button
                        onClick={() => {
                          const newChain = formData.approval_chain.filter((_, idx) => idx !== i);
                          setFormData({ ...formData, approval_chain: newChain });
                        }}
                        className="px-2 py-1.5 bg-red-900/20 hover:bg-red-900/30 border border-red-900/40 rounded text-xs text-red-400 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => setFormData({ ...formData, approval_chain: [...formData.approval_chain, { role: '', required: true }] })}
                    className="px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded text-xs text-slate-300 transition-colors"
                  >
                    Add Step
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Add any additional notes..."
                  className="w-full px-3 py-2 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-teal-500/50 resize-none"
                  rows={3}
                />
              </div>

              <div className="flex gap-3 justify-end pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveModel}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Save className="w-4 h-4" /> Save Model
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusChangeAction && statusChangeId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl max-w-sm w-full">
            <div className="p-6">
              <h3 className="text-lg font-bold text-slate-100 mb-2">Confirm Status Change</h3>
              <p className="text-sm text-slate-400 mb-6">
                Are you sure you want to {statusChangeAction} this model? This action can be reversed.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setStatusChangeId(null); setStatusChangeAction(null); }}
                  className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleStatusChange(statusChangeAction)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors ${
                    statusChangeAction === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' :
                    statusChangeAction === 'deprecate' ? 'bg-slate-600 hover:bg-slate-500' :
                    'bg-red-600 hover:bg-red-500'
                  }`}
                >
                  {statusChangeAction.charAt(0).toUpperCase() + statusChangeAction.slice(1)}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-700/50 rounded-xl max-w-sm w-full">
            <div className="p-6">
              <h3 className="text-lg font-bold text-red-400 mb-2">Delete Model</h3>
              <p className="text-sm text-slate-400 mb-6">
                This action cannot be undone. Are you sure you want to permanently delete this model?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg text-sm font-medium text-slate-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteModel}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelAccessGovernance;
