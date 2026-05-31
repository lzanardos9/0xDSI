import { useState, useEffect } from 'react';
import { Shield, Plus, Search, ChevronDown, ChevronUp, ToggleLeft, ToggleRight, CreditCard as Edit3, Trash2, Copy, Clock, Zap, AlertTriangle, Lock, Filter } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { GuardrailPolicy } from '../../lib/guardrailsData';
import { POLICY_TYPE_CONFIG } from '../../lib/guardrailsData';

const PolicyManager = () => {
  const [policies, setPolicies] = useState<GuardrailPolicy[]>([]);
  const [filterType, setFilterType] = useState<string>('all');
  const [filterEnforcement, setFilterEnforcement] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPolicy, setExpandedPolicy] = useState<string | null>(null);
  const [testPrompt, setTestPrompt] = useState('');
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [testRunning, setTestRunning] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    const { data } = await supabase.from('guardrail_policies').select('*').order('priority');
    if (data) setPolicies(data);
  };

  const togglePolicy = async (id: string, enabled: boolean) => {
    setPolicies(prev => prev.map(p => p.id === id ? { ...p, enabled: !enabled } : p));
    await supabase.from('guardrail_policies').update({ enabled: !enabled }).eq('id', id);
  };

  const runTestScan = () => {
    if (!testPrompt.trim()) return;
    setTestRunning(true);
    setTimeout(() => {
      const results = policies.filter(p => p.enabled).map(policy => {
        const conditions = policy.conditions as any;
        const patterns = conditions?.patterns || conditions?.keywords || conditions?.topics || [];
        const matched = patterns.some((pat: string) =>
          testPrompt.toLowerCase().includes(pat.toLowerCase())
        );
        return {
          policy_name: policy.policy_name,
          policy_type: policy.policy_type,
          enforcement_level: policy.enforcement_level,
          matched,
          priority: policy.priority,
        };
      }).filter(r => r.matched);
      setTestResults(results);
      setTestRunning(false);
    }, 1500);
  };

  const filteredPolicies = policies.filter(p => {
    if (filterType !== 'all' && p.policy_type !== filterType) return false;
    if (filterEnforcement !== 'all' && p.enforcement_level !== filterEnforcement) return false;
    if (searchQuery && !p.policy_name.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !p.description.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const policyTypes = Array.from(new Set(policies.map(p => p.policy_type)));

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search policies..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Types</option>
            {policyTypes.map(t => (
              <option key={t} value={t}>{POLICY_TYPE_CONFIG[t]?.label || t}</option>
            ))}
          </select>
          <select
            value={filterEnforcement}
            onChange={(e) => setFilterEnforcement(e.target.value)}
            className="px-3 py-2.5 bg-slate-800/50 border border-slate-700/50 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-cyan-500/50"
          >
            <option value="all">All Enforcement</option>
            <option value="block">Block</option>
            <option value="warn">Warn</option>
            <option value="log">Log</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-500/5 to-blue-500/5 p-5">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-200">Policy Test Sandbox</h3>
          <span className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-[10px] text-cyan-400 font-medium">INTERACTIVE</span>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runTestScan()}
            placeholder="Paste a prompt to test which policies would trigger..."
            className="flex-1 px-4 py-2.5 bg-slate-900/60 border border-slate-700/50 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20"
          />
          <button
            onClick={runTestScan}
            disabled={testRunning || !testPrompt.trim()}
            className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-medium rounded-lg transition-all flex items-center gap-2"
          >
            {testRunning ? (
              <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Scanning...</>
            ) : (
              <><Shield className="w-3.5 h-3.5" /> Test</>
            )}
          </button>
        </div>
        {testResults !== null && (
          <div className="mt-3 p-3 bg-slate-900/60 rounded-lg border border-slate-700/40">
            {testResults.length === 0 ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <Shield className="w-4 h-4" /> No policies triggered. Prompt would pass through.
              </div>
            ) : (
              <div>
                <p className="text-sm text-red-400 font-medium mb-2">{testResults.length} {testResults.length === 1 ? 'policy' : 'policies'} would trigger:</p>
                <div className="space-y-1.5">
                  {testResults.map((r, i) => {
                    const config = POLICY_TYPE_CONFIG[r.policy_type];
                    return (
                      <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-800/60 rounded-lg">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config?.bgColor} ${config?.color} border ${config?.borderColor}`}>
                            {config?.label}
                          </span>
                          <span className="text-xs text-slate-300">{r.policy_name}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          r.enforcement_level === 'block' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                          r.enforcement_level === 'warn' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                          'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}>{r.enforcement_level.toUpperCase()}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {filteredPolicies.map((policy) => {
          const config = POLICY_TYPE_CONFIG[policy.policy_type];
          const isExpanded = expandedPolicy === policy.id;
          const effectiveness = policy.hit_count > 0
            ? ((policy.hit_count - policy.false_positive_count) / policy.hit_count * 100).toFixed(1)
            : '100.0';

          return (
            <div
              key={policy.id}
              className={`rounded-xl border transition-all duration-200 overflow-hidden ${
                !policy.enabled ? 'border-slate-800/50 bg-slate-900/30 opacity-60' :
                policy.enforcement_level === 'block' ? 'border-slate-700/50 bg-slate-800/20 hover:border-red-500/30' :
                policy.enforcement_level === 'warn' ? 'border-slate-700/50 bg-slate-800/20 hover:border-amber-500/30' :
                'border-slate-700/50 bg-slate-800/20 hover:border-slate-600/50'
              }`}
            >
              <div className="px-5 py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                      onClick={() => togglePolicy(policy.id, policy.enabled)}
                      className="flex-shrink-0 transition-transform hover:scale-110"
                    >
                      {policy.enabled ? (
                        <ToggleRight className="w-8 h-5 text-emerald-400" />
                      ) : (
                        <ToggleLeft className="w-8 h-5 text-slate-600" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-200">{policy.policy_name}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${config?.bgColor} ${config?.color} border ${config?.borderColor}`}>
                          {config?.label || policy.policy_type}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          policy.enforcement_level === 'block' ? 'bg-red-500/15 text-red-400 border border-red-500/30' :
                          policy.enforcement_level === 'warn' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                          'bg-slate-500/15 text-slate-400 border border-slate-500/30'
                        }`}>
                          {policy.enforcement_level === 'block' ? <Lock className="w-2.5 h-2.5 inline mr-0.5" /> : null}
                          {policy.enforcement_level.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono">P{policy.priority}</span>
                        <span className="text-[10px] text-slate-600">v{policy.version}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 truncate">{policy.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 flex-shrink-0 ml-4">
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-white tabular-nums">{policy.hit_count.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">hits total</p>
                    </div>
                    <div className="text-right hidden md:block">
                      <p className="text-sm font-bold text-red-400 tabular-nums">{policy.block_count.toLocaleString()}</p>
                      <p className="text-[10px] text-slate-500">blocked</p>
                    </div>
                    <div className="text-right hidden lg:block">
                      <p className={`text-sm font-bold tabular-nums ${
                        Number(effectiveness) >= 95 ? 'text-emerald-400' :
                        Number(effectiveness) >= 85 ? 'text-blue-400' : 'text-amber-400'
                      }`}>{effectiveness}%</p>
                      <p className="text-[10px] text-slate-500">accuracy</p>
                    </div>
                    <button
                      onClick={() => setExpandedPolicy(isExpanded ? null : policy.id)}
                      className="p-1.5 hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
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
                      <pre className="text-xs text-slate-300 bg-slate-900/60 rounded-lg p-3 overflow-x-auto font-mono max-h-40 overflow-y-auto custom-scrollbar">
                        {JSON.stringify(policy.conditions, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Actions</h4>
                      <pre className="text-xs text-slate-300 bg-slate-900/60 rounded-lg p-3 overflow-x-auto font-mono max-h-40 overflow-y-auto custom-scrollbar">
                        {JSON.stringify(policy.actions, null, 2)}
                      </pre>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-4">
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <Clock className="w-3 h-3" />
                      Last triggered: {policy.last_triggered_at ? new Date(policy.last_triggered_at).toLocaleString() : 'Never'}
                    </div>
                    <div className="text-xs text-slate-600">Created by: {policy.created_by}</div>
                    <div className="flex gap-1 flex-wrap">
                      {policy.tags?.map(tag => (
                        <span key={tag} className="px-1.5 py-0.5 bg-slate-700/40 rounded text-[10px] text-slate-400">{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 mt-4 pt-3 border-t border-slate-800/50">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">Warns:</span>
                      <span className="text-amber-400 font-bold tabular-nums">{policy.warn_count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">False Positives:</span>
                      <span className="text-orange-400 font-bold tabular-nums">{policy.false_positive_count.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-500">FP Rate:</span>
                      <span className="text-slate-300 font-bold tabular-nums">
                        {policy.hit_count > 0 ? ((policy.false_positive_count / policy.hit_count) * 100).toFixed(2) : '0.00'}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PolicyManager;
