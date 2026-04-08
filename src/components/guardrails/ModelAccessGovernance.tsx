import { useState, useEffect } from 'react';
import {
  Shield, ShieldCheck, ShieldAlert, ShieldBan, Lock, Unlock,
  Search, ChevronDown, ChevronUp, Users, Building2, CheckCircle,
  XCircle, Clock, AlertTriangle, Brain, ExternalLink
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { ModelAccessRule } from '../../lib/guardrailsData';
import { TIER_CONFIG, MODEL_STATUS_CONFIG } from '../../lib/guardrailsData';

const ModelAccessGovernance = () => {
  const [models, setModels] = useState<ModelAccessRule[]>([]);
  const [expandedModel, setExpandedModel] = useState<string | null>(null);
  const [filterTier, setFilterTier] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

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

  return (
    <div className="space-y-6">
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
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50"
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
                  <div className="flex items-center gap-3">
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ModelAccessGovernance;
