import { useState, useEffect } from 'react';
import { Plus, CreditCard as Edit3, Trash2, X, Check, ChevronRight, ChevronLeft, Bot, Shield, Cpu, Lock, Zap, Tag, Save, AlertTriangle, Fingerprint, Activity, Server, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AgentFormData {
  agent_slug: string;
  display_name: string;
  description: string;
  agent_type: 'autonomous' | 'assistive' | 'hybrid' | 'sentinel';
  category: string;
  credential_type: string;
  max_autonomy_level: number;
  lifecycle_state: string;
  team: string;
  approval_required: boolean;
  trust_score: number;
  health_status: string;
  version: string;
  runtime: string;
  source_notebook: string;
  cost_per_execution: number;
  tags: string[];
  allowed_tools: string[];
  allowed_tables: string[];
}

const INITIAL_FORM: AgentFormData = {
  agent_slug: '',
  display_name: '',
  description: '',
  agent_type: 'autonomous',
  category: 'detection',
  credential_type: 'service_account',
  max_autonomy_level: 3,
  lifecycle_state: 'draft',
  team: '',
  approval_required: true,
  trust_score: 50,
  health_status: 'starting',
  version: '1.0.0',
  runtime: 'kubernetes',
  source_notebook: '',
  cost_per_execution: 0,
  tags: [],
  allowed_tools: [],
  allowed_tables: [],
};

const AGENT_TYPES = ['autonomous', 'assistive', 'hybrid', 'sentinel'] as const;
const CATEGORIES = ['detection', 'investigation', 'response', 'enrichment', 'correlation', 'vulnerability', 'compliance', 'ml_ops', 'orchestration', 'deception', 'red_team', 'analytics'] as const;
const CREDENTIAL_TYPES = ['service_account', 'managed_identity', 'api_key', 'oauth2', 'mtls'] as const;
const RUNTIMES = ['databricks', 'supabase_edge', 'kubernetes', 'lambda', 'local'] as const;
const LIFECYCLE_STATES = ['draft', 'pending_review', 'approved', 'active', 'degraded', 'quarantined', 'retired'] as const;
const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy', 'offline', 'starting'] as const;

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  detection: 'Identifies threats and anomalies in real-time data streams',
  investigation: 'Deep-dives into alerts and incidents for root cause analysis',
  response: 'Executes automated containment and remediation actions',
  enrichment: 'Augments data with threat intelligence and context',
  correlation: 'Links disparate events into coherent attack narratives',
  vulnerability: 'Scans and assesses security vulnerabilities',
  compliance: 'Monitors adherence to regulatory and policy requirements',
  ml_ops: 'Manages ML model lifecycle and performance monitoring',
  orchestration: 'Coordinates multi-agent workflows and pipelines',
  deception: 'Deploys and manages honeypots and decoy infrastructure',
  red_team: 'Simulates adversary tactics for proactive defense testing',
  analytics: 'Generates insights and reports from security telemetry',
};

type ViewMode = 'list' | 'create' | 'edit';

export function AgentRegistrationCRUD({ onAgentChange }: { onAgentChange?: () => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState<AgentFormData>(INITIAL_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [wizardStep, setWizardStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const [toolInput, setToolInput] = useState('');
  const [tableInput, setTableInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  useEffect(() => { loadAgents(); }, []);

  async function loadAgents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('agent_identities')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setAgents(data);
    if (error) setError(error.message);
    setLoading(false);
  }

  const filteredAgents = agents.filter(a =>
    searchQuery === '' ||
    a.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.agent_slug?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.category?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleCreate() {
    setSaving(true);
    setError(null);
    const payload = {
      ...formData,
      allowed_tools: JSON.stringify(formData.allowed_tools),
      allowed_tables: JSON.stringify(formData.allowed_tables),
      permissions_manifest: JSON.stringify([]),
      dependencies: JSON.stringify([]),
    };
    const { error } = await supabase.from('agent_identities').insert([payload]);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(`Agent "${formData.display_name}" registered successfully`);
      setFormData(INITIAL_FORM);
      setWizardStep(0);
      setViewMode('list');
      loadAgents();
      onAgentChange?.();
    }
    setSaving(false);
  }

  async function handleUpdate() {
    if (!editingId) return;
    setSaving(true);
    setError(null);
    const payload = {
      ...formData,
      allowed_tools: JSON.stringify(formData.allowed_tools),
      allowed_tables: JSON.stringify(formData.allowed_tables),
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('agent_identities').update(payload).eq('id', editingId);
    if (error) {
      setError(error.message);
    } else {
      setSuccess(`Agent "${formData.display_name}" updated successfully`);
      setViewMode('list');
      setEditingId(null);
      loadAgents();
      onAgentChange?.();
    }
    setSaving(false);
  }

  async function handleDelete(id: string) {
    const { error } = await supabase.from('agent_identities').delete().eq('id', id);
    if (error) {
      setError(error.message);
    } else {
      setSuccess('Agent deleted successfully');
      setDeleteConfirm(null);
      loadAgents();
      onAgentChange?.();
    }
  }

  function startEdit(agent: any) {
    setFormData({
      agent_slug: agent.agent_slug || '',
      display_name: agent.display_name || '',
      description: agent.description || '',
      agent_type: agent.agent_type || 'autonomous',
      category: agent.category || 'detection',
      credential_type: agent.credential_type || 'service_account',
      max_autonomy_level: agent.max_autonomy_level || 3,
      lifecycle_state: agent.lifecycle_state || 'draft',
      team: agent.team || '',
      approval_required: agent.approval_required ?? true,
      trust_score: agent.trust_score || 50,
      health_status: agent.health_status || 'starting',
      version: agent.version || '1.0.0',
      runtime: agent.runtime || 'kubernetes',
      source_notebook: agent.source_notebook || '',
      cost_per_execution: agent.cost_per_execution || 0,
      tags: agent.tags || [],
      allowed_tools: Array.isArray(agent.allowed_tools) ? agent.allowed_tools : [],
      allowed_tables: Array.isArray(agent.allowed_tables) ? agent.allowed_tables : [],
    });
    setEditingId(agent.id);
    setWizardStep(0);
    setViewMode('edit');
  }

  function startCreate() {
    setFormData(INITIAL_FORM);
    setEditingId(null);
    setWizardStep(0);
    setViewMode('create');
    setError(null);
  }

  const wizardSteps = [
    { label: 'Identity', icon: Fingerprint },
    { label: 'Classification', icon: Bot },
    { label: 'Security', icon: Shield },
    { label: 'Runtime', icon: Server },
    { label: 'Review', icon: Eye },
  ];

  function addTag() {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData(prev => ({ ...prev, tags: [...prev.tags, tagInput.trim()] }));
      setTagInput('');
    }
  }

  function addTool() {
    if (toolInput.trim() && !formData.allowed_tools.includes(toolInput.trim())) {
      setFormData(prev => ({ ...prev, allowed_tools: [...prev.allowed_tools, toolInput.trim()] }));
      setToolInput('');
    }
  }

  function addTable() {
    if (tableInput.trim() && !formData.allowed_tables.includes(tableInput.trim())) {
      setFormData(prev => ({ ...prev, allowed_tables: [...prev.allowed_tables, tableInput.trim()] }));
      setTableInput('');
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'autonomous': return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
      case 'assistive': return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'hybrid': return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
      case 'sentinel': return 'bg-red-500/20 text-red-300 border-red-500/30';
      default: return 'bg-slate-500/20 text-slate-300 border-slate-500/30';
    }
  };

  const getStateColor = (state: string) => {
    switch (state) {
      case 'active': return 'bg-emerald-500/20 text-emerald-300';
      case 'approved': return 'bg-blue-500/20 text-blue-300';
      case 'pending_review': return 'bg-amber-500/20 text-amber-300';
      case 'quarantined': return 'bg-red-500/20 text-red-300';
      case 'retired': return 'bg-slate-600/50 text-slate-400';
      case 'draft': return 'bg-slate-500/20 text-slate-300';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  // Notifications
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(null), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  return (
    <div className="h-full overflow-y-auto pr-1">
      {/* Success/Error Notifications */}
      {success && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg animate-in slide-in-from-top-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-emerald-300">{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto text-emerald-400 hover:text-emerald-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}
      {error && (
        <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-300">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Plus className="w-4 h-4 text-cyan-400" /> Agent Registration & Management
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">Register, configure, and manage agents in the control plane</p>
            </div>
            <button
              onClick={startCreate}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded-lg text-xs font-semibold hover:bg-cyan-500/30 transition-all border border-cyan-500/30 hover:border-cyan-500/50 hover:shadow-lg hover:shadow-cyan-500/10"
            >
              <Plus className="w-4 h-4" /> Register New Agent
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search agents by name, slug, or category..."
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Agent List */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Activity className="w-5 h-5 text-cyan-400 animate-spin" />
              <span className="ml-2 text-sm text-slate-400">Loading agents...</span>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-16">
              <Bot className="w-10 h-10 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{searchQuery ? 'No agents match your search' : 'No agents registered yet'}</p>
              <button onClick={startCreate} className="mt-4 px-4 py-2 bg-cyan-500/20 text-cyan-300 rounded text-xs hover:bg-cyan-500/30 transition-all border border-cyan-500/30">
                Register your first agent
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAgents.map(agent => (
                <div
                  key={agent.id}
                  className="bg-slate-800/30 border border-slate-700/30 rounded-lg hover:border-slate-600/50 transition-all group"
                >
                  <div
                    className="flex items-center gap-4 px-4 py-3 cursor-pointer"
                    onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                  >
                    {/* Agent Icon */}
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center border ${getTypeColor(agent.agent_type)}`}>
                      <Bot className="w-4.5 h-4.5" />
                    </div>

                    {/* Agent Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-medium text-slate-200 truncate">{agent.display_name}</h4>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${getTypeColor(agent.agent_type)}`}>{agent.agent_type}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${getStateColor(agent.lifecycle_state)}`}>{agent.lifecycle_state}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-[11px] text-slate-500 font-mono">{agent.agent_slug}</span>
                        <span className="text-[11px] text-slate-500">{agent.category}</span>
                        <span className="text-[11px] text-slate-500">{agent.runtime}</span>
                      </div>
                    </div>

                    {/* Trust & Health */}
                    <div className="flex items-center gap-4 text-xs">
                      <div className="text-center">
                        <div className={`font-semibold ${Number(agent.trust_score) >= 80 ? 'text-emerald-400' : Number(agent.trust_score) >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                          {Number(agent.trust_score).toFixed(0)}%
                        </div>
                        <div className="text-[10px] text-slate-500">Trust</div>
                      </div>
                      <div className="text-center">
                        <div className={`font-semibold ${agent.health_status === 'healthy' ? 'text-emerald-400' : agent.health_status === 'degraded' ? 'text-amber-400' : 'text-red-400'}`}>
                          {agent.health_status}
                        </div>
                        <div className="text-[10px] text-slate-500">Health</div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => { e.stopPropagation(); startEdit(agent); }}
                        className="p-1.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-cyan-300 transition-colors"
                        title="Edit agent"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteConfirm(agent.id); }}
                        className="p-1.5 rounded hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete agent"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedAgent === agent.id && (
                    <div className="px-4 pb-3 pt-1 border-t border-slate-700/30">
                      <div className="grid grid-cols-4 gap-4 text-[11px]">
                        <div>
                          <span className="text-slate-500">Version:</span>
                          <span className="ml-1 text-slate-300">{agent.version}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Autonomy:</span>
                          <span className="ml-1 text-slate-300">Level {agent.max_autonomy_level}/5</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Credential:</span>
                          <span className="ml-1 text-slate-300">{agent.credential_type}</span>
                        </div>
                        <div>
                          <span className="text-slate-500">Cost/exec:</span>
                          <span className="ml-1 text-slate-300">${Number(agent.cost_per_execution || 0).toFixed(4)}</span>
                        </div>
                        <div className="col-span-4">
                          <span className="text-slate-500">Description:</span>
                          <span className="ml-1 text-slate-400">{agent.description || 'No description'}</span>
                        </div>
                        {agent.tags?.length > 0 && (
                          <div className="col-span-4 flex items-center gap-1 flex-wrap">
                            <span className="text-slate-500">Tags:</span>
                            {agent.tags.map((t: string) => (
                              <span key={t} className="px-1.5 py-0.5 bg-slate-700/50 text-slate-400 rounded text-[10px]">{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Delete Confirmation */}
                  {deleteConfirm === agent.id && (
                    <div className="px-4 pb-3 pt-2 border-t border-red-500/20 bg-red-500/5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 text-red-400" />
                          <span className="text-xs text-red-300">Permanently delete "{agent.display_name}"?</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded bg-slate-700/50 hover:bg-slate-700 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleDelete(agent.id)}
                            className="px-3 py-1.5 text-xs text-red-300 rounded bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 transition-colors"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create / Edit Form */}
      {(viewMode === 'create' || viewMode === 'edit') && (
        <div className="space-y-4">
          {/* Form Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                {viewMode === 'create' ? <Plus className="w-4 h-4 text-cyan-400" /> : <Edit3 className="w-4 h-4 text-cyan-400" />}
                {viewMode === 'create' ? 'Register New Agent' : `Edit: ${formData.display_name}`}
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {viewMode === 'create' ? 'Configure and deploy a new agent into the control plane' : 'Modify agent configuration and governance settings'}
              </p>
            </div>
            <button
              onClick={() => { setViewMode('list'); setEditingId(null); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 rounded bg-slate-700/50 hover:bg-slate-700 transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>

          {/* Wizard Steps */}
          <div className="flex items-center gap-1 bg-slate-800/40 p-1.5 rounded-lg border border-slate-700/30">
            {wizardSteps.map((step, i) => (
              <button
                key={i}
                onClick={() => setWizardStep(i)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium transition-all flex-1 justify-center ${
                  wizardStep === i
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                    : wizardStep > i
                    ? 'text-emerald-400 bg-emerald-500/10'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                }`}
              >
                {wizardStep > i ? <Check className="w-3.5 h-3.5" /> : <step.icon className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{step.label}</span>
              </button>
            ))}
          </div>

          {/* Step Content */}
          <div className="bg-slate-800/30 border border-slate-700/30 rounded-lg p-5">
            {wizardStep === 0 && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Agent Identity</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Display Name *</label>
                    <input
                      type="text"
                      value={formData.display_name}
                      onChange={e => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
                      placeholder="e.g. Threat Hunter Pro"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Agent Slug * <span className="text-slate-600">(unique identifier)</span></label>
                    <input
                      type="text"
                      value={formData.agent_slug}
                      onChange={e => setFormData(prev => ({ ...prev, agent_slug: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '_') }))}
                      placeholder="e.g. threat_hunter_pro"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Describe the agent's purpose, capabilities, and operational scope..."
                    rows={3}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Team / Owner</label>
                    <input
                      type="text"
                      value={formData.team}
                      onChange={e => setFormData(prev => ({ ...prev, team: e.target.value }))}
                      placeholder="e.g. Security Operations"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Version</label>
                    <input
                      type="text"
                      value={formData.version}
                      onChange={e => setFormData(prev => ({ ...prev, version: e.target.value }))}
                      placeholder="1.0.0"
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                  </div>
                </div>
                {/* Tags */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Tags</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={e => setTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Add tag and press Enter"
                      className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                    <button onClick={addTag} className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-md text-xs hover:bg-slate-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formData.tags.map(tag => (
                        <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs">
                          <Tag className="w-3 h-3 text-slate-500" />{tag}
                          <button onClick={() => setFormData(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }))} className="ml-0.5 text-slate-500 hover:text-red-400">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 1 && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Agent Classification</h4>
                {/* Agent Type */}
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Agent Type *</label>
                  <div className="grid grid-cols-4 gap-2">
                    {AGENT_TYPES.map(type => (
                      <button
                        key={type}
                        onClick={() => setFormData(prev => ({ ...prev, agent_type: type }))}
                        className={`p-3 rounded-lg border text-center transition-all ${
                          formData.agent_type === type
                            ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                            : 'border-slate-700/50 bg-slate-900/30 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                        }`}
                      >
                        <Bot className="w-5 h-5 mx-auto mb-1" />
                        <div className="text-xs font-medium capitalize">{type}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Category */}
                <div>
                  <label className="block text-xs text-slate-400 mb-2">Operational Category *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CATEGORIES.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setFormData(prev => ({ ...prev, category: cat }))}
                        className={`px-3 py-2 rounded-lg border text-left transition-all ${
                          formData.category === cat
                            ? 'border-cyan-500/50 bg-cyan-500/10'
                            : 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600'
                        }`}
                      >
                        <div className={`text-xs font-medium capitalize ${formData.category === cat ? 'text-cyan-300' : 'text-slate-300'}`}>
                          {cat.replace('_', ' ')}
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{CATEGORY_DESCRIPTIONS[cat]}</div>
                      </button>
                    ))}
                  </div>
                </div>
                {/* Lifecycle State */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Initial Lifecycle State</label>
                  <select
                    value={formData.lifecycle_state}
                    onChange={e => setFormData(prev => ({ ...prev, lifecycle_state: e.target.value }))}
                    className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 appearance-none"
                  >
                    {LIFECYCLE_STATES.map(s => <option key={s} value={s} className="bg-slate-900">{s.replace('_', ' ')}</option>)}
                  </select>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Security & Governance</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Credential Type</label>
                    <select
                      value={formData.credential_type}
                      onChange={e => setFormData(prev => ({ ...prev, credential_type: e.target.value }))}
                      className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 appearance-none"
                    >
                      {CREDENTIAL_TYPES.map(c => <option key={c} value={c} className="bg-slate-900">{c.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Max Autonomy Level (1-5)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={formData.max_autonomy_level}
                        onChange={e => setFormData(prev => ({ ...prev, max_autonomy_level: Number(e.target.value) }))}
                        className="flex-1 accent-cyan-500"
                      />
                      <span className="text-sm font-semibold text-cyan-300 w-6 text-center">{formData.max_autonomy_level}</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-600 mt-0.5">
                      <span>Advisory</span><span>Full Auto</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1.5">Initial Trust Score</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={formData.trust_score}
                        onChange={e => setFormData(prev => ({ ...prev, trust_score: Number(e.target.value) }))}
                        className="flex-1 accent-cyan-500"
                      />
                      <span className="text-sm font-semibold text-cyan-300 w-10 text-center">{formData.trust_score}%</span>
                    </div>
                  </div>
                  <div className="flex items-end">
                    <label className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-slate-700/30 transition-colors">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={formData.approval_required}
                          onChange={e => setFormData(prev => ({ ...prev, approval_required: e.target.checked }))}
                          className="sr-only"
                        />
                        <div className={`w-9 h-5 rounded-full transition-colors ${formData.approval_required ? 'bg-cyan-500' : 'bg-slate-600'}`}>
                          <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform ${formData.approval_required ? 'translate-x-4' : ''}`} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-300">Require Approval for Deployment</span>
                    </label>
                  </div>
                </div>
                {/* Allowed Tools */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Allowed Tools</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={toolInput}
                      onChange={e => setToolInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTool())}
                      placeholder="e.g. supabase_query, slack_notify"
                      className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                    <button onClick={addTool} className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-md text-xs hover:bg-slate-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {formData.allowed_tools.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formData.allowed_tools.map(tool => (
                        <span key={tool} className="flex items-center gap-1 px-2 py-1 bg-cyan-500/10 text-cyan-300 rounded text-xs border border-cyan-500/20">
                          <Zap className="w-3 h-3" />{tool}
                          <button onClick={() => setFormData(prev => ({ ...prev, allowed_tools: prev.allowed_tools.filter(t => t !== tool) }))} className="ml-0.5 text-cyan-400 hover:text-red-400">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Allowed Tables */}
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5">Allowed Data Tables</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={tableInput}
                      onChange={e => setTableInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTable())}
                      placeholder="e.g. security_events, threat_intel"
                      className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                    />
                    <button onClick={addTable} className="px-3 py-2 bg-slate-700/50 text-slate-300 rounded-md text-xs hover:bg-slate-700 transition-colors">
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {formData.allowed_tables.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {formData.allowed_tables.map(table => (
                        <span key={table} className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 text-emerald-300 rounded text-xs border border-emerald-500/20">
                          <Lock className="w-3 h-3" />{table}
                          <button onClick={() => setFormData(prev => ({ ...prev, allowed_tables: prev.allowed_tables.filter(t => t !== table) }))} className="ml-0.5 text-emerald-400 hover:text-red-400">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Runtime Configuration</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-2">Runtime Environment</label>
                    <div className="grid grid-cols-1 gap-2">
                      {RUNTIMES.map(rt => (
                        <button
                          key={rt}
                          onClick={() => setFormData(prev => ({ ...prev, runtime: rt }))}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                            formData.runtime === rt
                              ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-300'
                              : 'border-slate-700/50 bg-slate-900/30 text-slate-400 hover:border-slate-600 hover:text-slate-300'
                          }`}
                        >
                          <Cpu className="w-4 h-4" />
                          <span className="text-xs font-medium capitalize">{rt.replace('_', ' ')}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Health Status</label>
                      <select
                        value={formData.health_status}
                        onChange={e => setFormData(prev => ({ ...prev, health_status: e.target.value }))}
                        className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 appearance-none"
                      >
                        {HEALTH_STATUSES.map(h => <option key={h} value={h} className="bg-slate-900">{h}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Source Notebook / Repo</label>
                      <input
                        type="text"
                        value={formData.source_notebook}
                        onChange={e => setFormData(prev => ({ ...prev, source_notebook: e.target.value }))}
                        placeholder="e.g. /repos/security/agents/threat_hunter.py"
                        className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-400 mb-1.5">Cost Per Execution (USD)</label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0"
                        value={formData.cost_per_execution}
                        onChange={e => setFormData(prev => ({ ...prev, cost_per_execution: Number(e.target.value) }))}
                        className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded-md text-sm text-slate-200 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-4">Review & Confirm</h4>
                <div className="grid grid-cols-2 gap-6">
                  {/* Left Column */}
                  <div className="space-y-3">
                    <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-700/30">
                      <h5 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5"><Fingerprint className="w-3.5 h-3.5" /> Identity</h5>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Name:</span><span className="text-slate-200">{formData.display_name || '---'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Slug:</span><span className="text-slate-200 font-mono">{formData.agent_slug || '---'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Team:</span><span className="text-slate-200">{formData.team || '---'}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Version:</span><span className="text-slate-200">{formData.version}</span></div>
                      </div>
                    </div>
                    <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-700/30">
                      <h5 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> Classification</h5>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Type:</span><span className={`px-1.5 py-0.5 rounded border ${getTypeColor(formData.agent_type)}`}>{formData.agent_type}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Category:</span><span className="text-slate-200 capitalize">{formData.category.replace('_', ' ')}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">State:</span><span className={`px-1.5 py-0.5 rounded ${getStateColor(formData.lifecycle_state)}`}>{formData.lifecycle_state}</span></div>
                      </div>
                    </div>
                  </div>
                  {/* Right Column */}
                  <div className="space-y-3">
                    <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-700/30">
                      <h5 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5"><Shield className="w-3.5 h-3.5" /> Security</h5>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Credential:</span><span className="text-slate-200">{formData.credential_type.replace('_', ' ')}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Autonomy:</span><span className="text-slate-200">Level {formData.max_autonomy_level}/5</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Trust:</span><span className="text-slate-200">{formData.trust_score}%</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Approval:</span><span className={formData.approval_required ? 'text-amber-300' : 'text-emerald-300'}>{formData.approval_required ? 'Required' : 'Not Required'}</span></div>
                        {formData.allowed_tools.length > 0 && (
                          <div><span className="text-slate-500">Tools:</span><span className="ml-1 text-slate-300">{formData.allowed_tools.join(', ')}</span></div>
                        )}
                      </div>
                    </div>
                    <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-700/30">
                      <h5 className="text-xs font-medium text-slate-400 mb-3 flex items-center gap-1.5"><Server className="w-3.5 h-3.5" /> Runtime</h5>
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between"><span className="text-slate-500">Runtime:</span><span className="text-slate-200 capitalize">{formData.runtime.replace('_', ' ')}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Health:</span><span className="text-slate-200">{formData.health_status}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Cost/exec:</span><span className="text-slate-200">${formData.cost_per_execution.toFixed(4)}</span></div>
                        {formData.source_notebook && (
                          <div><span className="text-slate-500">Source:</span><span className="ml-1 text-slate-300 font-mono text-[10px]">{formData.source_notebook}</span></div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {formData.description && (
                  <div className="bg-slate-900/40 rounded-lg p-4 border border-slate-700/30">
                    <h5 className="text-xs font-medium text-slate-400 mb-2">Description</h5>
                    <p className="text-xs text-slate-300">{formData.description}</p>
                  </div>
                )}
                {formData.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {formData.tags.map(tag => (
                      <span key={tag} className="px-2 py-1 bg-slate-700/50 text-slate-300 rounded text-xs">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => setWizardStep(Math.max(0, wizardStep - 1))}
              disabled={wizardStep === 0}
              className="flex items-center gap-1.5 px-4 py-2 text-xs text-slate-400 hover:text-slate-200 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-slate-600/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <div className="flex items-center gap-2">
              {wizardStep < 4 ? (
                <button
                  onClick={() => setWizardStep(Math.min(4, wizardStep + 1))}
                  className="flex items-center gap-1.5 px-5 py-2 text-xs font-medium text-cyan-300 bg-cyan-500/20 rounded-lg border border-cyan-500/30 hover:bg-cyan-500/30 hover:border-cyan-500/50 transition-all"
                >
                  Next <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  onClick={viewMode === 'create' ? handleCreate : handleUpdate}
                  disabled={saving || !formData.display_name || !formData.agent_slug}
                  className="flex items-center gap-2 px-6 py-2.5 text-xs font-semibold text-white bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg hover:from-cyan-400 hover:to-blue-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30"
                >
                  {saving ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Save className="w-4 h-4" /> {viewMode === 'create' ? 'Register Agent' : 'Save Changes'}</>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
