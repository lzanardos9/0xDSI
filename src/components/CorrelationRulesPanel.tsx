import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Shield, Search, ChevronLeft, ChevronRight,
  Zap, AlertTriangle, Filter, X, ChevronDown,
  Activity, Target, Eye, RefreshCw, BarChart3,
  Brain, Network, Clock, Fingerprint,
  Dice1 as Dice, Layers, Swords, Merge, FileCode, History,
  Download
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';
import { DaCLifecycleBadge, VersionBadge, TestResultBadge, FormatBadge, GitRefBadge } from './correlation/DaCStatusBadge';
import RuleVersionDrawer from './correlation/RuleVersionDrawer';

interface Rule {
  id: string;
  rule_name: string;
  rule_description: string;
  category: string;
  subcategory: string;
  severity: string;
  confidence_score: number;
  mitre_tactics: string[];
  mitre_techniques: string[];
  data_sources: string[];
  rule_logic: any;
  enabled: boolean;
  tags: string[];
  author: string;
  trigger_count: number;
  false_positive_rate: number;
  last_triggered: string | null;
  rule_type: string;
  complexity_score: number;
  version: string;
  dac_status: string;
  changelog: any[];
  test_cases: any[];
  deployment_history: any[];
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  git_ref: string | null;
  source_format: string;
  compliance_frameworks: any[];
  response_playbook: string | null;
  last_tested_at: string | null;
  test_result: string;
}

interface Stats {
  total: number;
  enabled: number;
  bySeverity: Record<string, number>;
}

const RULE_TYPE_CONFIG: Record<string, { label: string; icon: any; bg: string; text: string; border: string; short: string }> = {
  deterministic: { label: 'Deterministic', icon: Shield, bg: 'bg-slate-500/15', text: 'text-slate-300', border: 'border-slate-500/30', short: 'DET' },
  ml_anomaly: { label: 'ML Anomaly Detection', icon: Brain, bg: 'bg-cyan-500/15', text: 'text-cyan-300', border: 'border-cyan-500/30', short: 'ML-AD' },
  ml_classification: { label: 'ML Classification', icon: Brain, bg: 'bg-teal-500/15', text: 'text-teal-300', border: 'border-teal-500/30', short: 'ML-CL' },
  vector_similarity: { label: 'Vector Micro-Pattern', icon: Target, bg: 'bg-blue-500/15', text: 'text-blue-300', border: 'border-blue-500/30', short: 'VEC' },
  graph_correlation: { label: 'Graph Correlation', icon: Network, bg: 'bg-amber-500/15', text: 'text-amber-300', border: 'border-amber-500/30', short: 'GRAPH' },
  temporal_sequence: { label: 'Temporal Sequence', icon: Clock, bg: 'bg-sky-500/15', text: 'text-sky-300', border: 'border-sky-500/30', short: 'TEMP' },
  behavioral_baseline: { label: 'Behavioral Baseline', icon: Fingerprint, bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30', short: 'BEHAV' },
  bayesian_probabilistic: { label: 'Bayesian Probabilistic', icon: Dice, bg: 'bg-rose-500/15', text: 'text-rose-300', border: 'border-rose-500/30', short: 'BAYES' },
  ensemble_multi_model: { label: 'Ensemble Multi-Model', icon: Layers, bg: 'bg-orange-500/15', text: 'text-orange-300', border: 'border-orange-500/30', short: 'ENS' },
  adversarial_simulation: { label: 'Adversarial Simulation', icon: Swords, bg: 'bg-red-500/15', text: 'text-red-300', border: 'border-red-500/30', short: 'ADVSIM' },
  cross_domain_fusion: { label: 'Cross-Domain Fusion', icon: Merge, bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-300', border: 'border-fuchsia-500/30', short: 'FUSION' },
};

const RULE_TYPES = Object.keys(RULE_TYPE_CONFIG);

function ruleToYaml(rule: Rule): string {
  const indent = (str: string, level: number) => str.split('\n').map(l => '  '.repeat(level) + l).join('\n');

  const logic = rule.rule_logic || {};
  const pseudoCode = logic.pseudo_code ? `\n${indent(logic.pseudo_code, 2)}` : ' ""';
  const window = logic.time_window || logic.window || '5m';
  const threshold = logic.threshold ?? logic.count_threshold ?? 1;
  const groupBy = logic.group_by ? `\n    - "${logic.group_by}"` : '\n    - "source_ip"';
  const conditions = logic.conditions
    ? '\n' + (Array.isArray(logic.conditions) ? logic.conditions : [logic.conditions]).map((c: string) => `    - "${c}"`).join('\n')
    : '';

  const lines = [
    `title: "${rule.rule_name}"`,
    `id: ${rule.id}`,
    `status: ${rule.dac_status || 'production'}`,
    `version: "${rule.version || '1.0.0'}"`,
    `description: |`,
    `  ${rule.rule_description}`,
    `author: "${rule.author}"`,
    `severity: ${rule.severity}`,
    `confidence: ${rule.confidence_score}`,
    `rule_type: ${rule.rule_type || 'deterministic'}`,
    `source_format: ${rule.source_format || 'custom'}`,
    `date: "${new Date().toISOString().split('T')[0]}"`,
    `tags:`,
    ...(rule.tags || []).map(t => `  - "${t}"`),
    ...(rule.mitre_tactics || []).map(t => `  - "attack.${t.toLowerCase().replace(/\s+/g, '_')}"`),
    `mitre:`,
    `  tactics:`,
    ...(rule.mitre_tactics || []).map(t => `    - "${t}"`),
    `  techniques:`,
    ...(rule.mitre_techniques || []).map(t => `    - "${t}"`),
    `data_sources:`,
    ...(rule.data_sources || []).map(d => `  - "${d}"`),
    `detection:`,
    `  logic: |${pseudoCode}`,
    `  time_window: "${window}"`,
    `  threshold: ${threshold}`,
    `  group_by:${groupBy}`,
    ...(conditions ? [`  conditions:${conditions}`] : []),
    `false_positive_rate: ${rule.false_positive_rate}`,
    `trigger_count: ${rule.trigger_count}`,
    ...(rule.compliance_frameworks && rule.compliance_frameworks.length > 0 ? [
      `compliance:`,
      ...rule.compliance_frameworks.map((f: any) => `  - "${typeof f === 'string' ? f : f.name || f.framework || JSON.stringify(f)}"`),
    ] : []),
    ...(rule.response_playbook ? [`response_playbook: "${rule.response_playbook}"`] : []),
  ];

  return lines.join('\n');
}

function downloadYaml(rule: Rule) {
  const yaml = ruleToYaml(rule);
  const slug = rule.rule_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.yml`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadAllYaml(rules: Rule[]) {
  const yaml = rules.map(r => ruleToYaml(r)).join('\n\n---\n\n');
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `correlation_rules_${new Date().toISOString().split('T')[0]}.yml`;
  a.click();
  URL.revokeObjectURL(url);
}

const PAGE_SIZE = 50;

const SEV: Record<string, { bg: string; border: string; text: string; dot: string; badge: string }> = {
  critical: { bg: 'bg-red-500/10', border: 'border-l-red-500', text: 'text-red-400', dot: 'bg-red-500', badge: 'bg-red-500/20 text-red-300 border-red-500/30' },
  high: { bg: 'bg-orange-500/10', border: 'border-l-orange-500', text: 'text-orange-400', dot: 'bg-orange-500', badge: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  medium: { bg: 'bg-amber-500/10', border: 'border-l-amber-500', text: 'text-amber-400', dot: 'bg-amber-500', badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  low: { bg: 'bg-emerald-500/10', border: 'border-l-emerald-500', text: 'text-emerald-400', dot: 'bg-emerald-500', badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
};

const CorrelationRulesPanel = () => {
  const [stats, setStats] = useState<Stats>({ total: 0, enabled: 0, bySeverity: {} });
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [selectedRuleType, setSelectedRuleType] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showRuleTypeDropdown, setShowRuleTypeDropdown] = useState(false);
  const [selectedDacStatus, setSelectedDacStatus] = useState('');
  const [showDacDropdown, setShowDacDropdown] = useState(false);
  const [drawerRule, setDrawerRule] = useState<Rule | null>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const loadStats = useCallback(async () => {
    const { data } = await supabase
      .from('correlation_rules_library')
      .select('severity, enabled, category')
      .limit(50000);
    if (data) {
      const total = data.length;
      const enabled = data.filter(r => r.enabled).length;
      const bySev: Record<string, number> = {};
      for (const r of data) {
        bySev[r.severity] = (bySev[r.severity] || 0) + 1;
      }
      setStats({ total, enabled, bySeverity: bySev });
      const unique = [...new Set(data.map((d: any) => d.category).filter(Boolean))].sort() as string[];
      if (unique.length > 0) setCategories(unique);
    }
  }, []);

  const loadCategories = useCallback(async () => {
    if (categories.length > 0) return;
    const { data } = await supabase
      .from('correlation_rules_library')
      .select('category')
      .limit(50000);
    if (data) {
      const unique = [...new Set(data.map(d => d.category).filter(Boolean))].sort();
      setCategories(unique);
    }
  }, [categories.length]);

  const loadRules = useCallback(async () => {
    setLoading(true);
    const columns = 'id,rule_name,rule_description,category,subcategory,severity,confidence_score,mitre_tactics,mitre_techniques,data_sources,rule_logic,enabled,tags,author,trigger_count,false_positive_rate,last_triggered,rule_type,complexity_score,version,dac_status,changelog,test_cases,deployment_history,review_status,reviewed_by,reviewed_at,git_ref,source_format,compliance_frameworks,response_playbook,last_tested_at,test_result';
    let query = supabase
      .from('correlation_rules_library')
      .select(columns, { count: 'estimated' })
      .order('confidence_score', { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    if (searchQuery) {
      query = query.or(`rule_name.ilike.%${searchQuery}%,rule_description.ilike.%${searchQuery}%`);
    }
    if (selectedCategory) {
      query = query.eq('category', selectedCategory);
    }
    if (selectedSeverity) {
      query = query.eq('severity', selectedSeverity);
    }
    if (enabledFilter === 'enabled') {
      query = query.eq('enabled', true);
    } else if (enabledFilter === 'disabled') {
      query = query.eq('enabled', false);
    }
    if (selectedRuleType) {
      query = query.eq('rule_type', selectedRuleType);
    }
    if (selectedDacStatus) {
      query = query.eq('dac_status', selectedDacStatus);
    }

    const { data, count, error } = await query;
    if (!error && data) {
      setRules(data);
      setTotalCount(count || 0);
    }
    setLoading(false);
  }, [page, searchQuery, selectedCategory, selectedSeverity, enabledFilter, selectedRuleType, selectedDacStatus]);

  useEffect(() => { loadStats(); loadCategories(); }, [loadStats, loadCategories]);
  useEffect(() => { loadRules(); }, [loadRules]);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      setSearchQuery(value);
      setPage(0);
    }, 400);
  };

  const toggleRule = async (ruleId: string, currentEnabled: boolean) => {
    setToggling(ruleId);
    const { error } = await supabase
      .from('correlation_rules_library')
      .update({ enabled: !currentEnabled, updated_at: new Date().toISOString() })
      .eq('id', ruleId);
    if (!error) {
      setRules(prev => prev.map(r => r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
      setStats(prev => ({
        ...prev,
        enabled: currentEnabled ? prev.enabled - 1 : prev.enabled + 1,
      }));
    }
    setToggling(null);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearchQuery('');
    setSelectedCategory('');
    setSelectedSeverity('');
    setSelectedRuleType('');
    setSelectedDacStatus('');
    setEnabledFilter('all');
    setPage(0);
  };

  const hasFilters = searchQuery || selectedCategory || selectedSeverity || selectedRuleType || selectedDacStatus || enabledFilter !== 'all';

  const handlePromote = async (ruleId: string, targetStatus: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const parts = rule.version.split('.').map(Number);
    if (targetStatus === 'production') parts[0]++;
    else parts[1]++;
    parts[2] = 0;
    const newVersion = parts.join('.');

    await supabase.from('correlation_rule_versions').insert({
      rule_id: ruleId,
      version: newVersion,
      rule_name: rule.rule_name,
      rule_description: rule.rule_description,
      rule_logic: rule.rule_logic,
      severity: rule.severity,
      category: rule.category,
      enabled: rule.enabled,
      change_summary: `Promoted from ${rule.dac_status} to ${targetStatus}`,
      changed_by: 'admin',
      change_type: 'promoted',
      promoted_from: rule.dac_status,
      promoted_to: targetStatus,
    });

    const newChangelog = [
      ...(rule.changelog || []),
      { version: newVersion, date: new Date().toISOString().split('T')[0], author: 'admin', summary: `Promoted to ${targetStatus}`, type: 'promoted' }
    ];
    const newDeploy = [
      ...(rule.deployment_history || []),
      { environment: targetStatus, date: new Date().toISOString(), deployed_by: 'admin', status: 'success' }
    ];

    await supabase.from('correlation_rules_library').update({
      dac_status: targetStatus,
      version: newVersion,
      changelog: newChangelog,
      deployment_history: newDeploy,
      review_status: targetStatus === 'production' ? 'approved' : 'pending_review',
      updated_at: new Date().toISOString(),
    }).eq('id', ruleId);

    setRules(prev => prev.map(r => r.id === ruleId ? { ...r, dac_status: targetStatus, version: newVersion, changelog: newChangelog, deployment_history: newDeploy } : r));
    if (drawerRule?.id === ruleId) setDrawerRule(prev => prev ? { ...prev, dac_status: targetStatus, version: newVersion, changelog: newChangelog, deployment_history: newDeploy } : null);
  };

  const handleRollback = async (ruleId: string, versionId: string) => {
    const { data: versionData } = await supabase.from('correlation_rule_versions').select('*').eq('id', versionId).maybeSingle();
    if (!versionData) return;

    await supabase.from('correlation_rules_library').update({
      rule_name: versionData.rule_name,
      rule_description: versionData.rule_description,
      rule_logic: versionData.rule_logic,
      severity: versionData.severity,
      version: versionData.version,
      updated_at: new Date().toISOString(),
    }).eq('id', ruleId);

    await supabase.from('correlation_rule_versions').insert({
      rule_id: ruleId,
      version: versionData.version,
      rule_name: versionData.rule_name,
      rule_description: versionData.rule_description,
      rule_logic: versionData.rule_logic,
      severity: versionData.severity,
      category: versionData.category,
      enabled: versionData.enabled,
      change_summary: `Rolled back to v${versionData.version}`,
      changed_by: 'admin',
      change_type: 'reverted',
    });

    loadRules();
    if (drawerRule?.id === ruleId) setDrawerRule(null);
  };
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6 h-[calc(100vh-180px)] overflow-y-auto custom-scrollbar pr-1">
      <MLModelExplainer {...ML_MODELS.correlationRules} />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="Total Rules" value={stats.total} icon={<Shield className="w-5 h-5" />} color="blue" />
        <StatCard label="Enabled" value={stats.enabled} icon={<Zap className="w-5 h-5" />} color="emerald" />
        <StatCard label="Critical" value={stats.bySeverity.critical || 0} icon={<AlertTriangle className="w-5 h-5" />} color="red" />
        <StatCard label="High" value={stats.bySeverity.high || 0} icon={<Target className="w-5 h-5" />} color="orange" />
        <StatCard label="Medium" value={stats.bySeverity.medium || 0} icon={<Activity className="w-5 h-5" />} color="amber" />
        <StatCard label="Low" value={stats.bySeverity.low || 0} icon={<Eye className="w-5 h-5" />} color="emerald" />
      </div>

      <div className="enterprise-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search 50,000+ rules..."
              value={searchInput}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors"
            />
          </div>

          <div className="relative">
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                selectedCategory
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700/50'
              }`}
            >
              <Filter className="w-4 h-4" />
              {selectedCategory || 'Category'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showCategoryDropdown && (
              <div className="absolute top-full mt-1 left-0 z-50 w-72 max-h-80 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-2xl">
                <button
                  onClick={() => { setSelectedCategory(''); setShowCategoryDropdown(false); setPage(0); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
                >
                  All Categories
                </button>
                {categories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => { setSelectedCategory(cat); setShowCategoryDropdown(false); setPage(0); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedCategory === cat ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowRuleTypeDropdown(!showRuleTypeDropdown)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                selectedRuleType
                  ? `${RULE_TYPE_CONFIG[selectedRuleType]?.bg || ''} ${RULE_TYPE_CONFIG[selectedRuleType]?.border || ''} ${RULE_TYPE_CONFIG[selectedRuleType]?.text || ''}`
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700/50'
              }`}
            >
              {selectedRuleType ? (() => { const Ic = RULE_TYPE_CONFIG[selectedRuleType]?.icon; return Ic ? <Ic className="w-4 h-4" /> : null; })() : <Brain className="w-4 h-4" />}
              {selectedRuleType ? RULE_TYPE_CONFIG[selectedRuleType]?.short || selectedRuleType : 'Rule Type'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showRuleTypeDropdown && (
              <div className="absolute top-full mt-1 left-0 z-50 w-72 max-h-80 overflow-y-auto bg-slate-800 border border-slate-700 rounded-xl shadow-2xl">
                <button
                  onClick={() => { setSelectedRuleType(''); setShowRuleTypeDropdown(false); setPage(0); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
                >
                  All Rule Types
                </button>
                {RULE_TYPES.map(rt => {
                  const cfg = RULE_TYPE_CONFIG[rt];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={rt}
                      onClick={() => { setSelectedRuleType(rt); setShowRuleTypeDropdown(false); setPage(0); }}
                      className={`w-full flex items-center gap-2 text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedRuleType === rt ? `${cfg.bg} ${cfg.text}` : 'text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="relative">
            <button
              onClick={() => setShowDacDropdown(!showDacDropdown)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                selectedDacStatus
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                  : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700/50'
              }`}
            >
              <FileCode className="w-4 h-4" />
              {selectedDacStatus ? selectedDacStatus.charAt(0).toUpperCase() + selectedDacStatus.slice(1) : 'DaC Status'}
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {showDacDropdown && (
              <div className="absolute top-full mt-1 left-0 z-50 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl">
                <button
                  onClick={() => { setSelectedDacStatus(''); setShowDacDropdown(false); setPage(0); }}
                  className="w-full text-left px-4 py-2.5 text-sm text-slate-300 hover:bg-slate-700/50 transition-colors"
                >
                  All Statuses
                </button>
                {['draft', 'testing', 'staging', 'production', 'deprecated', 'archived'].map(s => (
                  <button
                    key={s}
                    onClick={() => { setSelectedDacStatus(s); setShowDacDropdown(false); setPage(0); }}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      selectedDacStatus === s ? 'bg-cyan-500/10 text-cyan-400' : 'text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
            {['', 'critical', 'high', 'medium', 'low'].map(sev => (
              <button
                key={sev}
                onClick={() => { setSelectedSeverity(sev); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  selectedSeverity === sev
                    ? sev ? `${SEV[sev]?.badge} border` : 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                {sev ? sev.charAt(0).toUpperCase() + sev.slice(1) : 'All'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-800/50 border border-slate-700 rounded-lg p-1">
            {(['all', 'enabled', 'disabled'] as const).map(filter => (
              <button
                key={filter}
                onClick={() => { setEnabledFilter(filter); setPage(0); }}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  enabledFilter === filter
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/50'
                }`}
              >
                {filter.charAt(0).toUpperCase() + filter.slice(1)}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium text-red-400 hover:text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          )}

          <button
            onClick={() => rules.length > 0 && downloadAllYaml(rules)}
            disabled={rules.length === 0}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="Download current page as YAML"
          >
            <Download className="w-4 h-4" />
            YAML
          </button>

          <button
            onClick={() => { loadRules(); loadStats(); }}
            className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {hasFilters && (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <BarChart3 className="w-3.5 h-3.5" />
            <span>{totalCount.toLocaleString()} rules match current filters</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {loading && rules.length === 0 ? (
          <div className="enterprise-card p-16 text-center">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
            <p className="text-slate-400 text-sm">Loading correlation rules...</p>
          </div>
        ) : rules.length === 0 ? (
          <div className="enterprise-card p-16 text-center">
            <Shield className="w-8 h-8 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400 text-sm">No rules match your filters</p>
          </div>
        ) : (
          rules.map(rule => (
            <RuleCard
              key={rule.id}
              rule={rule}
              expanded={expandedRule === rule.id}
              onToggle={() => setExpandedRule(expandedRule === rule.id ? null : rule.id)}
              onEnableToggle={() => toggleRule(rule.id, rule.enabled)}
              onOpenDaC={() => setDrawerRule(rule)}
              toggling={toggling === rule.id}
            />
          ))
        )}
      </div>

      {drawerRule && (
        <RuleVersionDrawer
          rule={drawerRule}
          onClose={() => setDrawerRule(null)}
          onPromote={handlePromote}
          onRollback={handleRollback}
        />
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between enterprise-card p-4">
          <div className="text-sm text-slate-400">
            Showing <span className="text-slate-200 font-semibold">{(page * PAGE_SIZE + 1).toLocaleString()}</span>
            {' '}-{' '}
            <span className="text-slate-200 font-semibold">{Math.min((page + 1) * PAGE_SIZE, totalCount).toLocaleString()}</span>
            {' '}of{' '}
            <span className="text-cyan-400 font-semibold">{totalCount.toLocaleString()}</span> rules
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(0)}
              disabled={page === 0}
              className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              First
            </button>
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {getPageNumbers(page, totalPages).map((p, i) =>
                p === -1 ? (
                  <span key={`ellipsis-${i}`} className="px-2 text-slate-600">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`w-9 h-9 rounded-lg text-xs font-semibold transition-all ${
                      page === p
                        ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                        : 'bg-slate-800/50 border border-slate-700 text-slate-400 hover:bg-slate-700/50'
                    }`}
                  >
                    {p + 1}
                  </button>
                )
              )}
            </div>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1}
              className="px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 text-xs font-medium hover:bg-slate-700/50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Last
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i);
  const pages: number[] = [];
  pages.push(0);
  if (current > 3) pages.push(-1);
  const start = Math.max(1, current - 1);
  const end = Math.min(total - 2, current + 1);
  for (let i = start; i <= end; i++) pages.push(i);
  if (current < total - 4) pages.push(-1);
  pages.push(total - 1);
  return pages;
}

const StatCard = ({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) => {
  const colors: Record<string, string> = {
    blue: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
    red: 'text-red-400 bg-red-500/10 border-red-500/20',
    orange: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  };
  const c = colors[color] || colors.blue;
  return (
    <div className={`enterprise-card p-4 border ${c.split(' ')[2]}`}>
      <div className={`p-2 rounded-lg ${c.split(' ')[1]} ${c.split(' ')[0]} w-fit mb-2`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-100 tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs text-slate-500 font-medium mt-0.5">{label}</p>
    </div>
  );
};

const RuleCard = ({
  rule,
  expanded,
  onToggle,
  onEnableToggle,
  onOpenDaC,
  toggling,
}: {
  rule: Rule;
  expanded: boolean;
  onToggle: () => void;
  onEnableToggle: () => void;
  onOpenDaC: () => void;
  toggling: boolean;
}) => {
  const sev = SEV[rule.severity] || SEV.medium;
  const confidencePct = Math.round((rule.confidence_score || 0) * 100);

  return (
    <div className={`enterprise-card border-l-4 ${sev.border} overflow-hidden transition-all duration-200 ${
      rule.enabled ? 'opacity-100' : 'opacity-60'
    }`}>
      <div className="p-4">
        <div className="flex items-start gap-4">
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onToggle}>
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${sev.badge}`}>
                {rule.severity}
              </span>
              {rule.rule_type && RULE_TYPE_CONFIG[rule.rule_type] && (() => {
                const rtCfg = RULE_TYPE_CONFIG[rule.rule_type];
                const RtIcon = rtCfg.icon;
                return (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${rtCfg.bg} ${rtCfg.text} ${rtCfg.border}`}>
                    <RtIcon className="w-3 h-3" />
                    {rtCfg.short}
                  </span>
                );
              })()}
              <VersionBadge version={rule.version || '1.0.0'} />
              <DaCLifecycleBadge status={rule.dac_status || 'production'} />
              <TestResultBadge result={rule.test_result || 'untested'} />
              {rule.source_format && <FormatBadge format={rule.source_format} />}
              <span className="text-[10px] text-slate-500 font-mono">{rule.category}</span>
              {rule.subcategory && (
                <>
                  <ChevronRight className="w-3 h-3 text-slate-600" />
                  <span className="text-[10px] text-slate-500 font-mono">{rule.subcategory}</span>
                </>
              )}
            </div>
            <h4 className="text-sm font-semibold text-slate-100 mb-1 truncate pr-4">{rule.rule_name}</h4>
            <p className="text-xs text-slate-400 line-clamp-1">{rule.rule_description}</p>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="text-right hidden lg:block">
              <div className="flex items-center gap-1.5 mb-1">
                <div className="w-20 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      confidencePct >= 80 ? 'bg-emerald-500' : confidencePct >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${confidencePct}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-400 font-mono w-8 text-right">{confidencePct}%</span>
              </div>
              {rule.git_ref && <GitRefBadge gitRef={rule.git_ref} />}
            </div>

            <button
              onClick={(e) => { e.stopPropagation(); downloadYaml(rule); }}
              className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-colors"
              title="Download as YAML"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onOpenDaC(); }}
              className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors"
              title="Detection as Code"
            >
              <History className="w-4 h-4" />
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); onEnableToggle(); }}
              disabled={toggling}
              className={`relative w-11 h-6 rounded-full transition-all duration-300 ${
                rule.enabled
                  ? 'bg-emerald-500 shadow-lg shadow-emerald-500/30'
                  : 'bg-slate-700'
              } ${toggling ? 'opacity-50' : ''}`}
            >
              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
                rule.enabled ? 'left-[22px]' : 'left-0.5'
              }`} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2.5 flex-wrap">
          {(rule.mitre_tactics || []).slice(0, 4).map((t, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/20">
              {t}
            </span>
          ))}
          {(rule.mitre_tactics || []).length > 4 && (
            <span className="text-[9px] text-slate-500">+{rule.mitre_tactics.length - 4} more</span>
          )}
          {(rule.data_sources || []).slice(0, 3).map((d, i) => (
            <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20">
              {d}
            </span>
          ))}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-slate-700/50 bg-slate-900/40 p-4 space-y-4">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Full Description</p>
            <p className="text-xs text-slate-300 leading-relaxed">{rule.rule_description}</p>
          </div>

          {rule.rule_logic?.pseudo_code && (
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1">Rule Logic</p>
              <pre className="text-xs text-emerald-300 bg-slate-900/60 rounded-lg p-3 font-mono leading-relaxed border border-slate-700/30 overflow-x-auto whitespace-pre-wrap">
                {rule.rule_logic.pseudo_code}
              </pre>
            </div>
          )}

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">MITRE Tactics</p>
              <div className="flex flex-wrap gap-1">
                {(rule.mitre_tactics || []).map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/20">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Techniques</p>
              <div className="flex flex-wrap gap-1">
                {(rule.mitre_techniques || []).map((t, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-orange-500/10 text-orange-300 border border-orange-500/20">{t}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Data Sources</p>
              <div className="flex flex-wrap gap-1">
                {(rule.data_sources || []).map((d, i) => (
                  <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20">{d}</span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-1.5">Metadata</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Confidence</span>
                  <span className="text-slate-200 font-semibold">{confidencePct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">FP Rate</span>
                  <span className="text-slate-200 font-semibold">{(rule.false_positive_rate * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Author</span>
                  <span className="text-slate-200">{rule.author}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Triggers</span>
                  <span className="text-slate-200 font-semibold">{rule.trigger_count.toLocaleString()}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/40 rounded-lg border border-slate-700/30 p-3">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold mb-2">Detection as Code</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-slate-500 block mb-0.5">Version</span>
                <span className="text-blue-300 font-mono font-semibold">v{rule.version || '1.0.0'}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Lifecycle</span>
                <DaCLifecycleBadge status={rule.dac_status || 'production'} />
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Reviewed By</span>
                <span className="text-slate-200">{rule.reviewed_by || 'Unreviewed'}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Tests</span>
                <TestResultBadge result={rule.test_result || 'untested'} />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={(e) => { e.stopPropagation(); onOpenDaC(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold hover:bg-blue-500/20 transition-colors"
              >
                <History className="w-3 h-3" />
                View Full DaC Details
              </button>
              {rule.git_ref && <GitRefBadge gitRef={rule.git_ref} />}
              {rule.source_format && <FormatBadge format={rule.source_format} />}
            </div>
          </div>

          {(rule.tags || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-700/30">
              {rule.tags.map((tag, i) => (
                <span key={i} className="px-2 py-0.5 rounded-full text-[9px] bg-slate-700/50 text-slate-400 border border-slate-600/30">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CorrelationRulesPanel;
