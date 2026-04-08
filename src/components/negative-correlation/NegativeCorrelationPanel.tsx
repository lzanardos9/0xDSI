import { useState, useEffect, useCallback } from 'react';
import { Shield, BookOpen, AlertTriangle, GitBranch, Clock, Eye, EyeOff, Zap, MapPin, Activity, Download, History, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { DaCLifecycleBadge, VersionBadge, TestResultBadge, FormatBadge, GitRefBadge } from '../correlation/DaCStatusBadge';
import RuleVersionDrawer from '../correlation/RuleVersionDrawer';
import NegativeCorrelationRules from './NegativeCorrelationRules';
import NegativeCorrelationDetections from './NegativeCorrelationDetections';
import NegativeCorrelationGraph from './NegativeCorrelationGraph';
import NegativeCorrelationTimeline from './NegativeCorrelationTimeline';

type Tab = 'overview' | 'rules' | 'detections' | 'graph';

interface LibraryRule {
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

interface NegRule {
  id: string;
  rule_name: string;
  rule_code: string;
  category: string;
  description: string;
  observed_event: string;
  expected_event: string;
  time_window_seconds: number;
  constraint_logic: string;
  constraint_query: string;
  severity: string;
  confidence_base: number;
  mitre_techniques: string[];
  false_positive_notes: string;
  enabled: boolean;
  detection_count: number;
  last_fired_at: string;
}

interface Detection {
  id: string;
  rule_id: string;
  detection_time: string;
  observed_event_detail: any;
  missing_event_detail: any;
  entity_type: string;
  entity_id: string;
  confidence_score: number;
  severity: string;
  status: string;
  evidence_chain: any[];
  analyst_notes: string;
  time_gap_seconds: number;
  physics_violation: any;
  rule_name?: string;
  rule_code?: string;
  rule_category?: string;
}

const TABS: { id: Tab; label: string; icon: typeof Shield }[] = [
  { id: 'overview', label: 'Overview', icon: Activity },
  { id: 'rules', label: 'Rules & DaC', icon: BookOpen },
  { id: 'detections', label: 'Live Detections', icon: AlertTriangle },
  { id: 'graph', label: 'Absence Graph', icon: GitBranch },
];

const SUBCATEGORY_STATS: Record<string, { icon: typeof Eye; color: string; bg: string; label: string }> = {
  'Missing Prerequisite': { icon: GitBranch, color: 'text-red-400', bg: 'bg-red-950/30 border-red-500/20', label: 'Missing Prerequisite' },
  'Impossible Coexistence': { icon: Zap, color: 'text-amber-400', bg: 'bg-amber-950/30 border-amber-500/20', label: 'Impossible Coexistence' },
  'Missing Consequence': { icon: EyeOff, color: 'text-cyan-400', bg: 'bg-cyan-950/30 border-cyan-500/20', label: 'Missing Consequence' },
  'Temporal Impossibility': { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-950/30 border-orange-500/20', label: 'Temporal Impossibility' },
  'Physics Violation': { icon: MapPin, color: 'text-rose-400', bg: 'bg-rose-950/30 border-rose-500/20', label: 'Physics Violation' },
};

const OLD_TO_NEW_CATEGORY: Record<string, string> = {
  'missing_prerequisite': 'Missing Prerequisite',
  'impossible_coexistence': 'Impossible Coexistence',
  'missing_consequence': 'Missing Consequence',
  'temporal_impossibility': 'Temporal Impossibility',
  'physics_violation': 'Physics Violation',
};

const DAC_STATUS_ORDER = ['draft', 'testing', 'staging', 'production'];
const DAC_STATUS_COLORS: Record<string, string> = {
  draft: 'bg-slate-800 text-slate-400',
  testing: 'bg-amber-900/30 text-amber-400',
  staging: 'bg-sky-900/30 text-sky-400',
  production: 'bg-emerald-900/30 text-emerald-400',
  deprecated: 'bg-orange-900/30 text-orange-400',
  archived: 'bg-slate-900 text-slate-500',
};

function ruleToYaml(rule: LibraryRule): string {
  const logic = rule.rule_logic || {};
  const nc = logic.negative_constraint || {};
  let yaml = `title: "${rule.rule_name}"\n`;
  yaml += `id: ${rule.id}\n`;
  yaml += `status: ${rule.dac_status}\n`;
  yaml += `version: ${rule.version}\n`;
  yaml += `type: negative_correlation\n`;
  yaml += `subcategory: ${rule.subcategory}\n`;
  yaml += `description: |\n  ${rule.rule_description}\n`;
  yaml += `author: ${rule.author}\n`;
  yaml += `severity: ${rule.severity}\n`;
  yaml += `confidence: ${Math.round(rule.confidence_score * 100)}%\n`;
  yaml += `date: ${new Date().toISOString().split('T')[0]}\n`;
  if (rule.tags?.length) yaml += `tags:\n${rule.tags.map(t => `  - "${t}"`).join('\n')}\n`;
  if (rule.mitre_tactics?.length) yaml += `mitre_tactics:\n${rule.mitre_tactics.map(t => `  - "${t}"`).join('\n')}\n`;
  if (rule.mitre_techniques?.length) yaml += `mitre_techniques:\n${rule.mitre_techniques.map(t => `  - "${t}"`).join('\n')}\n`;
  if (rule.data_sources?.length) yaml += `data_sources:\n${rule.data_sources.map(s => `  - "${s}"`).join('\n')}\n`;
  yaml += `detection:\n`;
  yaml += `  negative_constraint:\n`;
  yaml += `    observed: "${nc.observed || ''}"\n`;
  yaml += `    expected_missing: "${nc.expected_missing || ''}"\n`;
  yaml += `    relationship: "${nc.relationship || ''}"\n`;
  if (logic.pseudo_code) yaml += `  pseudo_code: |\n    ${logic.pseudo_code.replace(/\n/g, '\n    ')}\n`;
  yaml += `  time_window: "${logic.time_window || 'instant'}"\n`;
  yaml += `  threshold: ${logic.threshold || 1}\n`;
  if (logic.group_by) yaml += `  group_by: "${logic.group_by}"\n`;
  yaml += `false_positive_rate: ${rule.false_positive_rate}\n`;
  yaml += `trigger_count: ${rule.trigger_count}\n`;
  if (rule.compliance_frameworks?.length) {
    yaml += `compliance:\n`;
    rule.compliance_frameworks.forEach((cf: any) => {
      yaml += `  - framework: "${cf.framework}"\n    control: "${cf.control}"\n`;
    });
  }
  if (rule.response_playbook) yaml += `response_playbook: "${rule.response_playbook}"\n`;
  return yaml;
}

export default function NegativeCorrelationPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [libraryRules, setLibraryRules] = useState<LibraryRule[]>([]);
  const [negRules, setNegRules] = useState<NegRule[]>([]);
  const [detections, setDetections] = useState<Detection[]>([]);
  const [drawerRule, setDrawerRule] = useState<LibraryRule | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [libRes, negRes, detRes] = await Promise.all([
        supabase.from('correlation_rules_library')
          .select('*')
          .eq('rule_type', 'negative_correlation')
          .order('confidence_score', { ascending: false }),
        supabase.from('negative_correlation_rules')
          .select('*')
          .order('detection_count', { ascending: false }),
        supabase.from('negative_correlation_detections')
          .select('*')
          .order('detection_time', { ascending: false }),
      ]);

      const libData = libRes.data || [];
      const negData = negRes.data || [];
      const detData = detRes.data || [];

      setLibraryRules(libData);
      setNegRules(negData);

      const ruleMap = new Map(negData.map(r => [r.id, r]));
      setDetections(detData.map(d => ({
        ...d,
        rule_name: ruleMap.get(d.rule_id)?.rule_name || '',
        rule_code: ruleMap.get(d.rule_id)?.rule_code || '',
        rule_category: ruleMap.get(d.rule_id)?.category || '',
      })));
    } catch (err) {
      console.error('Error loading negative correlation data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePromote = async (rule: LibraryRule) => {
    const currentIdx = DAC_STATUS_ORDER.indexOf(rule.dac_status);
    if (currentIdx < 0 || currentIdx >= DAC_STATUS_ORDER.length - 1) return;
    const nextStatus = DAC_STATUS_ORDER[currentIdx + 1];
    const isProduction = nextStatus === 'production';
    const parts = rule.version.split('.').map(Number);
    const newVersion = isProduction ? `${parts[0] + 1}.0.0` : `${parts[0]}.${parts[1] + 1}.0`;

    await supabase.from('correlation_rule_versions').insert({
      rule_id: rule.id,
      version: newVersion,
      rule_name: rule.rule_name,
      rule_description: rule.rule_description,
      rule_logic: rule.rule_logic,
      severity: rule.severity,
      change_summary: `Promoted from ${rule.dac_status} to ${nextStatus}`,
      changed_by: 'current_user',
      change_type: 'promoted',
      promoted_from: rule.dac_status,
      promoted_to: nextStatus,
    });

    const newChangelog = [...(rule.changelog || []), {
      version: newVersion,
      date: new Date().toISOString().split('T')[0],
      type: 'promoted',
      summary: `Promoted from ${rule.dac_status} to ${nextStatus}`,
    }];

    const newDeployHistory = [...(rule.deployment_history || []), {
      environment: nextStatus,
      deployed_at: new Date().toISOString(),
      deployed_by: 'current_user',
      version: newVersion,
      status: 'success',
      commit: rule.git_ref,
    }];

    await supabase.from('correlation_rules_library')
      .update({
        dac_status: nextStatus,
        version: newVersion,
        changelog: newChangelog,
        deployment_history: newDeployHistory,
      })
      .eq('id', rule.id);

    loadData();
  };

  const handleDownloadYaml = (rule: LibraryRule) => {
    const yaml = ruleToYaml(rule);
    const blob = new Blob([yaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${rule.rule_name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.yml`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAll = () => {
    const allYaml = libraryRules.map(r => ruleToYaml(r)).join('\n---\n\n');
    const blob = new Blob([allYaml], { type: 'text/yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'negative_correlation_rules.yml';
    a.click();
    URL.revokeObjectURL(url);
  };

  const openDetections = detections.filter(d => d.status === 'open');
  const criticalDetections = detections.filter(d => d.severity === 'critical');
  const subcategoryCounts = libraryRules.reduce((acc, r) => {
    acc[r.subcategory] = (acc[r.subcategory] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const categoryDetections = detections.reduce((acc, d) => {
    const cat = OLD_TO_NEW_CATEGORY[d.rule_category || ''] || d.rule_category || '';
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const totalTriggerCount = libraryRules.reduce((sum, r) => sum + r.trigger_count, 0);
  const prodRules = libraryRules.filter(r => r.dac_status === 'production');
  const testingRules = libraryRules.filter(r => r.dac_status === 'testing' || r.dac_status === 'staging');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-red-600 to-amber-600 flex items-center justify-center shadow-lg shadow-red-500/20">
              <NegativeIcon />
            </div>
            {openDetections.length > 0 && (
              <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center border-2 border-slate-950">
                <span className="text-[8px] font-bold text-white">{openDetections.length}</span>
              </div>
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white">Negative Correlation Engine</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-900/30 text-red-400 border border-red-500/20 font-medium">
                {openDetections.length} Open
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-900/30 text-emerald-400 border border-emerald-500/20 font-medium">
                {prodRules.length} Production
              </span>
              {testingRules.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-900/30 text-amber-400 border border-amber-500/20 font-medium">
                  {testingRules.length} Testing
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">Detecting the dog that didn't bark -- finding threats by what's missing</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs">
          <div className="text-right">
            <p className="text-lg font-bold text-white">{libraryRules.length}</p>
            <p className="text-[10px] text-slate-500">Rules Total</p>
          </div>
          <div className="w-px h-8 bg-slate-700/30" />
          <div className="text-right">
            <p className="text-lg font-bold text-red-400">{criticalDetections.length}</p>
            <p className="text-[10px] text-slate-500">Critical</p>
          </div>
          <div className="w-px h-8 bg-slate-700/30" />
          <div className="text-right">
            <p className="text-lg font-bold text-slate-300">{totalTriggerCount.toLocaleString()}</p>
            <p className="text-[10px] text-slate-500">Total Firings</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-slate-700/30">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-all relative ${
              activeTab === tab.id ? 'text-red-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.id === 'detections' && openDetections.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-900/30 text-red-400 ml-1">
                {openDetections.length}
              </span>
            )}
            {tab.id === 'rules' && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 ml-1">
                {libraryRules.length}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-red-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-3">
            {Object.entries(SUBCATEGORY_STATS).map(([key, config]) => {
              const Icon = config.icon;
              return (
                <div key={key} className={`${config.bg} border rounded-xl p-3 hover:scale-[1.02] transition-transform`}>
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className={`text-lg font-bold ${config.color}`}>{subcategoryCounts[key] || 0}</span>
                  </div>
                  <p className="text-[10px] text-slate-400">{config.label}</p>
                  <p className="text-[9px] text-slate-600 mt-1">{categoryDetections[key] || 0} active detections</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-4 gap-3">
            {DAC_STATUS_ORDER.map(status => {
              const count = libraryRules.filter(r => r.dac_status === status).length;
              return (
                <div key={status} className={`${DAC_STATUS_COLORS[status]} rounded-xl p-3 border border-slate-700/20`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider">{status}</span>
                    <span className="text-lg font-bold">{count}</span>
                  </div>
                  <p className="text-[9px] text-slate-600 mt-1">DaC lifecycle</p>
                </div>
              );
            })}
          </div>

          <NegativeCorrelationTimeline detections={detections} loading={loading} />

          <div>
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Recent Critical Detections
            </h3>
            <NegativeCorrelationDetections
              detections={detections.filter(d => d.severity === 'critical').slice(0, 5)}
              loading={loading}
            />
          </div>
        </div>
      )}

      {activeTab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{libraryRules.length} negative correlation rules with Detection-as-Code lifecycle</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:text-white text-xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export All YAML
              </button>
              <button
                onClick={loadData}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-400 hover:text-white text-xs transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              libraryRules.map(rule => {
                const nc = rule.rule_logic?.negative_constraint || {};
                const subcatConfig = SUBCATEGORY_STATS[rule.subcategory];
                const SubIcon = subcatConfig?.icon || Shield;

                return (
                  <DaCRuleCard
                    key={rule.id}
                    rule={rule}
                    nc={nc}
                    SubIcon={SubIcon}
                    subcatConfig={subcatConfig}
                    onOpenDrawer={() => setDrawerRule(rule)}
                    onDownloadYaml={() => handleDownloadYaml(rule)}
                    onPromote={() => handlePromote(rule)}
                  />
                );
              })
            )}
          </div>

          <div className="border-t border-slate-700/30 pt-6">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Eye className="w-4 h-4 text-cyan-400" />
              Original Detection Rules (Detailed View)
            </h3>
            <NegativeCorrelationRules rules={negRules} loading={loading} />
          </div>
        </div>
      )}

      {activeTab === 'detections' && (
        <NegativeCorrelationDetections detections={detections} loading={loading} />
      )}

      {activeTab === 'graph' && (
        <NegativeCorrelationGraph detections={detections} loading={loading} />
      )}

      {drawerRule && (
        <RuleVersionDrawer
          rule={drawerRule}
          onClose={() => setDrawerRule(null)}
          onPromote={async (ruleId: string, _targetStatus: string) => {
            const rule = libraryRules.find(r => r.id === ruleId);
            if (rule) await handlePromote(rule);
          }}
          onRollback={async (_ruleId: string, _versionId: string) => { loadData(); }}
        />
      )}
    </div>
  );
}

function DaCRuleCard({ rule, nc, SubIcon, subcatConfig, onOpenDrawer, onDownloadYaml, onPromote }: {
  rule: LibraryRule;
  nc: any;
  SubIcon: any;
  subcatConfig: any;
  onOpenDrawer: () => void;
  onDownloadYaml: () => void;
  onPromote: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const severityColor = rule.severity === 'critical' ? 'border-l-red-500' : rule.severity === 'high' ? 'border-l-orange-500' : 'border-l-amber-500';

  return (
    <div className={`border-l-2 ${severityColor} bg-slate-900/40 border border-slate-700/20 rounded-r-xl overflow-hidden hover:border-slate-600/40 transition-all`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${subcatConfig?.bg || 'bg-slate-800'}`}>
            <SubIcon className={`w-4 h-4 ${subcatConfig?.color || 'text-slate-400'}`} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                rule.severity === 'critical' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                rule.severity === 'high' ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' :
                'bg-amber-500/20 text-amber-400 border border-amber-500/30'
              }`}>{rule.severity}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/30">NEG</span>
              <VersionBadge version={rule.version} />
              <DaCLifecycleBadge status={rule.dac_status} />
              <TestResultBadge result={rule.test_result} />
              <FormatBadge format={rule.source_format} />
              {rule.git_ref && <GitRefBadge gitRef={rule.git_ref} />}
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{rule.subcategory}</span>
            </div>
            <button onClick={() => setExpanded(!expanded)} className="text-left">
              <p className="text-sm font-medium text-white">{rule.rule_name}</p>
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{rule.rule_description}</p>
            </button>

            <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center gap-1">
                <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      rule.confidence_score >= 0.9 ? 'bg-emerald-500' :
                      rule.confidence_score >= 0.7 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${rule.confidence_score * 100}%` }}
                  />
                </div>
                <span className="text-[10px] text-slate-500">{Math.round(rule.confidence_score * 100)}%</span>
              </div>
              <span className="text-[10px] text-slate-600">|</span>
              <span className="text-[10px] text-slate-500">{rule.trigger_count.toLocaleString()} triggers</span>
              <span className="text-[10px] text-slate-600">|</span>
              <span className="text-[10px] text-slate-500">FP: {(rule.false_positive_rate * 100).toFixed(0)}%</span>
              {rule.last_triggered && (
                <>
                  <span className="text-[10px] text-slate-600">|</span>
                  <span className="text-[10px] text-slate-500">Last: {new Date(rule.last_triggered).toLocaleString()}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={onDownloadYaml}
              className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-500 hover:text-cyan-400 transition-colors"
              title="Download YAML"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onOpenDrawer}
              className="p-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30 text-slate-500 hover:text-cyan-400 transition-colors"
              title="DaC Version History"
            >
              <History className="w-3.5 h-3.5" />
            </button>
            {rule.dac_status !== 'production' && rule.dac_status !== 'deprecated' && rule.dac_status !== 'archived' && (
              <button
                onClick={onPromote}
                className="px-2 py-1 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-500/20 text-[10px] font-medium transition-colors"
              >
                Promote
              </button>
            )}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 pt-4 border-t border-slate-700/20 space-y-3">
            <p className="text-xs text-slate-400 leading-relaxed">{rule.rule_description}</p>

            {nc.observed && (
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/50 rounded-lg p-3 border border-emerald-500/10">
                  <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">Observed Event</p>
                  <p className="text-xs text-slate-300">{nc.observed}</p>
                </div>
                <div className="bg-slate-950/50 rounded-lg p-3 border border-red-500/10">
                  <p className="text-[10px] font-semibold text-red-400 uppercase tracking-wider mb-1">Expected Missing</p>
                  <p className="text-xs text-slate-300">{nc.expected_missing}</p>
                </div>
              </div>
            )}

            {rule.rule_logic?.pseudo_code && (
              <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-700/20">
                <p className="text-[10px] font-semibold text-cyan-400 uppercase tracking-wider mb-1">Detection Logic</p>
                <pre className="text-[11px] text-slate-300 font-mono whitespace-pre-wrap">{rule.rule_logic.pseudo_code}</pre>
              </div>
            )}

            <div className="flex flex-wrap gap-1">
              {rule.mitre_techniques?.map(t => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">{t}</span>
              ))}
              {rule.data_sources?.map(s => (
                <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950/30 text-cyan-400/70">{s}</span>
              ))}
            </div>

            {rule.compliance_frameworks?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {rule.compliance_frameworks.map((cf: any, i: number) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                    {cf.framework}: {cf.control}
                  </span>
                ))}
              </div>
            )}

            <div className="bg-slate-950/30 rounded-lg p-3 border border-slate-700/15">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">DaC Summary</p>
              <div className="grid grid-cols-4 gap-2 text-[10px]">
                <div>
                  <span className="text-slate-600">Author:</span>
                  <span className="text-slate-300 ml-1">{rule.author}</span>
                </div>
                <div>
                  <span className="text-slate-600">Reviewed by:</span>
                  <span className="text-slate-300 ml-1">{rule.reviewed_by || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-slate-600">Review:</span>
                  <span className={`ml-1 ${
                    rule.review_status === 'approved' ? 'text-emerald-400' :
                    rule.review_status === 'pending_review' ? 'text-amber-400' :
                    rule.review_status === 'rejected' ? 'text-red-400' : 'text-orange-400'
                  }`}>{rule.review_status}</span>
                </div>
                <div>
                  <span className="text-slate-600">Playbook:</span>
                  <span className="text-cyan-400 ml-1">{rule.response_playbook || 'None'}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NegativeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-white">
      <circle cx="12" cy="12" r="9" strokeDasharray="4 2" />
      <line x1="8" y1="12" x2="16" y2="12" strokeWidth="2" />
      <circle cx="12" cy="12" r="3" fill="currentColor" opacity="0.3" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" opacity="0.4" strokeWidth="1" />
    </svg>
  );
}
