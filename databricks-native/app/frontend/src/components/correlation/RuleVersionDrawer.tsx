import { useState, useEffect } from 'react';
import {
  X, GitBranch, History, FlaskConical, Rocket, Shield,
  ChevronRight, CheckCircle, XCircle, Clock, AlertTriangle,
  FileCode, BookOpen, RotateCcw, ArrowUpRight, ArrowDownRight,
  ExternalLink, User, Calendar, Tag
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  DaCLifecycleBadge, ReviewBadge, TestResultBadge,
  VersionBadge, FormatBadge, GitRefBadge
} from './DaCStatusBadge';

interface RuleVersion {
  id: string;
  rule_id: string;
  version: string;
  rule_name: string;
  rule_description: string;
  rule_logic: any;
  severity: string;
  change_summary: string;
  changed_by: string;
  change_type: string;
  promoted_from: string | null;
  promoted_to: string | null;
  created_at: string;
}

interface ChangelogEntry {
  version: string;
  date: string;
  author: string;
  summary: string;
  type: string;
}

interface TestCase {
  name: string;
  description?: string;
  status: string;
  last_run: string;
}

interface DeploymentRecord {
  environment: string;
  date: string;
  deployed_by: string;
  commit?: string;
  status: string;
}

interface ComplianceMapping {
  framework: string;
  control: string;
}

interface DaCRule {
  id: string;
  rule_name: string;
  version: string;
  dac_status: string;
  review_status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  git_ref: string | null;
  source_format: string;
  test_result: string;
  last_tested_at: string | null;
  response_playbook: string | null;
  compliance_frameworks: ComplianceMapping[];
  changelog: ChangelogEntry[];
  test_cases: TestCase[];
  deployment_history: DeploymentRecord[];
}

type TabId = 'overview' | 'versions' | 'tests' | 'deployments' | 'compliance';

const LIFECYCLE_ORDER = ['draft', 'testing', 'staging', 'production'];

const RuleVersionDrawer = ({
  rule,
  onClose,
  onPromote,
  onRollback,
}: {
  rule: DaCRule;
  onClose: () => void;
  onPromote: (ruleId: string, targetStatus: string) => void;
  onRollback: (ruleId: string, versionId: string) => void;
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [versions, setVersions] = useState<RuleVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  useEffect(() => {
    if (activeTab === 'versions') loadVersions();
  }, [activeTab, rule.id]);

  const loadVersions = async () => {
    setLoadingVersions(true);
    const { data } = await supabase
      .from('correlation_rule_versions')
      .select('*')
      .eq('rule_id', rule.id)
      .order('created_at', { ascending: false })
      .limit(20);
    if (data) setVersions(data);
    setLoadingVersions(false);
  };

  const currentIdx = LIFECYCLE_ORDER.indexOf(rule.dac_status);
  const nextStatus = currentIdx >= 0 && currentIdx < LIFECYCLE_ORDER.length - 1
    ? LIFECYCLE_ORDER[currentIdx + 1] : null;
  const prevStatus = currentIdx > 0 ? LIFECYCLE_ORDER[currentIdx - 1] : null;

  const tabs: { id: TabId; label: string; icon: any }[] = [
    { id: 'overview', label: 'Overview', icon: Shield },
    { id: 'versions', label: 'Versions', icon: History },
    { id: 'tests', label: 'Tests', icon: FlaskConical },
    { id: 'deployments', label: 'Deployments', icon: Rocket },
    { id: 'compliance', label: 'Compliance', icon: BookOpen },
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-slate-900 border-l border-slate-700 shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-right">
        <div className="flex items-center justify-between p-5 border-b border-slate-700/50 bg-slate-900/80">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <VersionBadge version={rule.version} />
              <DaCLifecycleBadge status={rule.dac_status} />
              <ReviewBadge status={rule.review_status} />
              <FormatBadge format={rule.source_format} />
            </div>
            <h2 className="text-lg font-bold text-white truncate">{rule.rule_name}</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors ml-4">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex border-b border-slate-700/50 bg-slate-800/30">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-semibold transition-all border-b-2 ${
                  activeTab === tab.id
                    ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                    : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-700/30'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
          {activeTab === 'overview' && (
            <OverviewTab
              rule={rule}
              nextStatus={nextStatus}
              prevStatus={prevStatus}
              onPromote={onPromote}
            />
          )}
          {activeTab === 'versions' && (
            <VersionsTab
              versions={versions}
              loading={loadingVersions}
              onRollback={(versionId) => onRollback(rule.id, versionId)}
            />
          )}
          {activeTab === 'tests' && <TestsTab rule={rule} />}
          {activeTab === 'deployments' && <DeploymentsTab rule={rule} />}
          {activeTab === 'compliance' && <ComplianceTab rule={rule} />}
        </div>
      </div>
    </div>
  );
};

const OverviewTab = ({
  rule, nextStatus, prevStatus, onPromote
}: {
  rule: DaCRule;
  nextStatus: string | null;
  prevStatus: string | null;
  onPromote: (ruleId: string, target: string) => void;
}) => (
  <>
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
      <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Lifecycle Pipeline</h3>
      <div className="flex items-center gap-1">
        {['draft', 'testing', 'staging', 'production'].map((stage, i) => {
          const isActive = stage === rule.dac_status;
          const isPassed = LIFECYCLE_ORDER.indexOf(stage) < LIFECYCLE_ORDER.indexOf(rule.dac_status);
          return (
            <div key={stage} className="flex items-center flex-1">
              <div className={`flex-1 rounded-lg p-3 text-center transition-all ${
                isActive
                  ? 'bg-cyan-500/20 border-2 border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                  : isPassed
                    ? 'bg-emerald-500/10 border border-emerald-500/30'
                    : 'bg-slate-800/80 border border-slate-700/50'
              }`}>
                <div className={`text-[10px] font-bold uppercase tracking-wider ${
                  isActive ? 'text-cyan-400' : isPassed ? 'text-emerald-400' : 'text-slate-500'
                }`}>
                  {stage}
                </div>
                {isActive && <div className="w-2 h-2 rounded-full bg-cyan-400 mx-auto mt-1.5 animate-pulse" />}
                {isPassed && <CheckCircle className="w-3.5 h-3.5 text-emerald-400 mx-auto mt-1" />}
              </div>
              {i < 3 && (
                <ChevronRight className={`w-4 h-4 flex-shrink-0 mx-0.5 ${
                  isPassed ? 'text-emerald-500' : 'text-slate-700'
                }`} />
              )}
            </div>
          );
        })}
      </div>
      {rule.dac_status !== 'deprecated' && rule.dac_status !== 'archived' && (
        <div className="flex items-center gap-2 mt-4">
          {nextStatus && (
            <button
              onClick={() => onPromote(rule.id, nextStatus)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-cyan-600/20 border border-cyan-500/30 text-cyan-400 text-xs font-semibold hover:bg-cyan-600/30 transition-colors"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Promote to {nextStatus}
            </button>
          )}
          {prevStatus && (
            <button
              onClick={() => onPromote(rule.id, prevStatus)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-700/50 border border-slate-600/30 text-slate-400 text-xs font-semibold hover:bg-slate-700 transition-colors"
            >
              <ArrowDownRight className="w-3.5 h-3.5" />
              Demote to {prevStatus}
            </button>
          )}
        </div>
      )}
    </div>

    <div className="grid grid-cols-2 gap-3">
      <InfoCard label="Version" value={`v${rule.version}`} icon={<GitBranch className="w-4 h-4" />} />
      <InfoCard label="Source Format" value={rule.source_format.toUpperCase()} icon={<FileCode className="w-4 h-4" />} />
      <InfoCard label="Reviewed By" value={rule.reviewed_by || 'Unreviewed'} icon={<User className="w-4 h-4" />} />
      <InfoCard
        label="Last Review"
        value={rule.reviewed_at ? new Date(rule.reviewed_at).toLocaleDateString() : 'Never'}
        icon={<Calendar className="w-4 h-4" />}
      />
      <InfoCard label="Test Result" value={rule.test_result.toUpperCase()} icon={<FlaskConical className="w-4 h-4" />} />
      <InfoCard
        label="Git Ref"
        value={rule.git_ref ? rule.git_ref.substring(0, 7) : 'N/A'}
        icon={<GitBranch className="w-4 h-4" />}
      />
    </div>

    {rule.response_playbook && (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Response Playbook</h3>
        <div className="flex items-center gap-2 text-sm text-blue-400">
          <ExternalLink className="w-4 h-4" />
          <span className="font-mono text-xs">{rule.response_playbook}</span>
        </div>
      </div>
    )}

    {(rule.changelog || []).length > 0 && (
      <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
        <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-3">Recent Changes</h3>
        <div className="space-y-3">
          {rule.changelog.slice(0, 5).map((entry, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-1">
                <ChangeTypeIcon type={entry.type} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-mono font-bold text-blue-300">v{entry.version}</span>
                  <span className="text-[10px] text-slate-500">{entry.date}</span>
                  <span className="text-[10px] text-slate-600">by {entry.author}</span>
                </div>
                <p className="text-xs text-slate-300">{entry.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </>
);

const VersionsTab = ({
  versions, loading, onRollback
}: {
  versions: RuleVersion[];
  loading: boolean;
  onRollback: (versionId: string) => void;
}) => {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-slate-400">Loading version history...</p>
      </div>
    );
  }

  if (versions.length === 0) {
    return (
      <div className="text-center py-12">
        <History className="w-8 h-8 text-slate-600 mx-auto mb-3" />
        <p className="text-sm text-slate-400">No version history available</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
          {versions.length} Version{versions.length !== 1 ? 's' : ''} Recorded
        </h3>
      </div>
      {versions.map((v, i) => (
        <div key={v.id} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-blue-300 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                v{v.version}
              </span>
              <ChangeTypeBadge type={v.change_type} />
              {v.promoted_from && v.promoted_to && (
                <span className="text-[9px] text-slate-500">
                  {v.promoted_from} → {v.promoted_to}
                </span>
              )}
            </div>
            {i > 0 && (
              <button
                onClick={() => onRollback(v.id)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-semibold hover:bg-amber-500/20 transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Rollback
              </button>
            )}
          </div>
          <p className="text-xs text-slate-300 mb-2">{v.change_summary}</p>
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span className="flex items-center gap-1">
              <User className="w-3 h-3" />
              {v.changed_by}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(v.created_at).toLocaleDateString()}
            </span>
            <span className="flex items-center gap-1">
              <Tag className="w-3 h-3" />
              {v.severity}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

const TestsTab = ({ rule }: { rule: DaCRule }) => {
  const tests = rule.test_cases || [];
  const passCount = tests.filter(t => t.status === 'pass').length;
  const failCount = tests.filter(t => t.status === 'fail').length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 text-center">
          <p className="text-2xl font-bold text-white">{tests.length}</p>
          <p className="text-[10px] text-slate-500 uppercase font-semibold">Total Tests</p>
        </div>
        <div className="bg-emerald-500/5 rounded-xl border border-emerald-500/20 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{passCount}</p>
          <p className="text-[10px] text-emerald-500 uppercase font-semibold">Passing</p>
        </div>
        <div className={`rounded-xl border p-4 text-center ${
          failCount > 0 ? 'bg-red-500/5 border-red-500/20' : 'bg-slate-800/50 border-slate-700/50'
        }`}>
          <p className={`text-2xl font-bold ${failCount > 0 ? 'text-red-400' : 'text-slate-400'}`}>{failCount}</p>
          <p className={`text-[10px] uppercase font-semibold ${failCount > 0 ? 'text-red-500' : 'text-slate-500'}`}>Failing</p>
        </div>
      </div>

      {tests.length > 0 && (
        <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden flex">
          {passCount > 0 && (
            <div className="bg-emerald-500 h-full transition-all" style={{ width: `${(passCount / tests.length) * 100}%` }} />
          )}
          {failCount > 0 && (
            <div className="bg-red-500 h-full transition-all" style={{ width: `${(failCount / tests.length) * 100}%` }} />
          )}
        </div>
      )}

      <div className="space-y-2">
        {tests.map((tc, i) => (
          <div key={i} className={`rounded-xl border p-4 ${
            tc.status === 'pass'
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : tc.status === 'fail'
                ? 'bg-red-500/5 border-red-500/20'
                : 'bg-slate-800/50 border-slate-700/50'
          }`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {tc.status === 'pass' ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                ) : tc.status === 'fail' ? (
                  <XCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-500" />
                )}
                <span className="text-sm font-semibold text-slate-200">{tc.name}</span>
              </div>
              <span className={`text-[10px] font-bold uppercase ${
                tc.status === 'pass' ? 'text-emerald-400' : tc.status === 'fail' ? 'text-red-400' : 'text-slate-500'
              }`}>
                {tc.status}
              </span>
            </div>
            {tc.description && (
              <p className="text-xs text-slate-400 ml-6">{tc.description}</p>
            )}
            {tc.last_run && (
              <p className="text-[10px] text-slate-600 ml-6 mt-1">Last run: {tc.last_run}</p>
            )}
          </div>
        ))}
      </div>

      {rule.last_tested_at && (
        <p className="text-[10px] text-slate-600 text-center">
          Last test suite execution: {new Date(rule.last_tested_at).toLocaleString()}
        </p>
      )}
    </div>
  );
};

const DeploymentsTab = ({ rule }: { rule: DaCRule }) => {
  const deploys = rule.deployment_history || [];

  return (
    <div className="space-y-4">
      <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
        Deployment History ({deploys.length} records)
      </h3>
      {deploys.length === 0 ? (
        <div className="text-center py-8">
          <Rocket className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No deployments recorded</p>
        </div>
      ) : (
        <div className="relative">
          <div className="absolute left-[18px] top-4 bottom-4 w-0.5 bg-slate-700" />
          <div className="space-y-4">
            {deploys.map((d, i) => (
              <div key={i} className="relative flex items-start gap-4 pl-1">
                <div className={`relative z-10 w-[28px] h-[28px] rounded-full flex items-center justify-center flex-shrink-0 ${
                  d.status === 'success' ? 'bg-emerald-500/20 border-2 border-emerald-500/50' : 'bg-red-500/20 border-2 border-red-500/50'
                }`}>
                  {d.status === 'success' ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                <div className="flex-1 bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-bold uppercase ${
                      d.environment === 'production' ? 'text-emerald-400'
                        : d.environment === 'staging' ? 'text-sky-400'
                          : 'text-slate-400'
                    }`}>
                      {d.environment}
                    </span>
                    <span className="text-[10px] text-slate-500">{new Date(d.date).toLocaleString()}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500">
                    <span>by {d.deployed_by}</span>
                    {d.commit && (
                      <span className="font-mono bg-slate-700/50 px-1.5 py-0.5 rounded">{d.commit}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const ComplianceTab = ({ rule }: { rule: DaCRule }) => {
  const frameworks = rule.compliance_frameworks || [];

  return (
    <div className="space-y-4">
      <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
        Compliance Mappings ({frameworks.length})
      </h3>
      {frameworks.length === 0 ? (
        <div className="text-center py-8">
          <BookOpen className="w-8 h-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-400">No compliance mappings</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {frameworks.map((cf, i) => (
            <div key={i} className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{cf.framework}</p>
                <p className="text-xs text-slate-400 mt-0.5">Control: {cf.control}</p>
              </div>
              <div className="px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-xs font-mono font-bold text-blue-300">{cf.control}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {rule.response_playbook && (
        <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
          <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">Response Playbook</h3>
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-mono text-blue-300">{rule.response_playbook}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoCard = ({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) => (
  <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-3">
    <div className="flex items-center gap-2 mb-1 text-slate-500">{icon}<span className="text-[10px] uppercase font-semibold">{label}</span></div>
    <p className="text-sm font-semibold text-white">{value}</p>
  </div>
);

const ChangeTypeIcon = ({ type }: { type: string }) => {
  const config: Record<string, { icon: any; color: string }> = {
    created: { icon: GitBranch, color: 'text-emerald-400' },
    updated: { icon: FileCode, color: 'text-blue-400' },
    promoted: { icon: ArrowUpRight, color: 'text-cyan-400' },
    reverted: { icon: RotateCcw, color: 'text-amber-400' },
    deprecated: { icon: AlertTriangle, color: 'text-orange-400' },
  };
  const cfg = config[type] || config.updated;
  const Icon = cfg.icon;
  return <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />;
};

const ChangeTypeBadge = ({ type }: { type: string }) => {
  const config: Record<string, { bg: string; text: string }> = {
    created: { bg: 'bg-emerald-500/10 border-emerald-500/20', text: 'text-emerald-400' },
    updated: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
    promoted: { bg: 'bg-cyan-500/10 border-cyan-500/20', text: 'text-cyan-400' },
    reverted: { bg: 'bg-amber-500/10 border-amber-500/20', text: 'text-amber-400' },
    deprecated: { bg: 'bg-orange-500/10 border-orange-500/20', text: 'text-orange-400' },
  };
  const cfg = config[type] || config.updated;
  return (
    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.text}`}>
      {type}
    </span>
  );
};

export default RuleVersionDrawer;
