import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Send,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  Timer,
  User,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ResponseDecision {
  id: string;
  decision_id: string;
  action: string;
  trigger_type: string;
  trigger_id: string;
  entity_id: string;
  risk_score: number;
  reasoning: string | null;
  outcome: string;
  responded_by: string;
  response_time_ms: number;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACTION_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; badgeClass: string; barColor: string }> = {
  allow:         { label: 'Allow',         icon: CheckCircle2, color: 'text-emerald-400', badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', barColor: 'bg-emerald-500' },
  step_up_auth:  { label: 'Step-Up Auth',  icon: ShieldAlert,  color: 'text-amber-400',   badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30',       barColor: 'bg-amber-500' },
  delay:         { label: 'Delay',         icon: Timer,        color: 'text-blue-400',    badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30',           barColor: 'bg-blue-500' },
  block:         { label: 'Block',         icon: Ban,          color: 'text-red-400',     badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',              barColor: 'bg-red-500' },
  alert_soc:     { label: 'Alert SOC',     icon: Send,         color: 'text-orange-400',  badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',     barColor: 'bg-orange-500' },
  freeze_account:{ label: 'Freeze Account',icon: Lock,         color: 'text-cyan-400',    badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',           barColor: 'bg-cyan-500' },
};

const OUTCOME_STYLES: Record<string, { label: string; className: string }> = {
  executed:   { label: 'Executed',   className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  overridden: { label: 'Overridden', className: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  expired:    { label: 'Expired',    className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
  escalated:  { label: 'Escalated',  className: 'bg-red-500/15 text-red-400 border-red-500/30' },
};

const TRIGGER_TYPES = ['transaction', 'session', 'detection', 'rule'];
const ALL_ACTIONS = Object.keys(ACTION_CONFIG);
const ALL_OUTCOMES = Object.keys(OUTCOME_STYLES);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return 'N/A';
  const diff = Date.now() - new Date(dt).getTime();
  if (diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'Just now';
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatResponseTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function getRiskColor(score: number): string {
  if (score >= 85) return 'text-red-400';
  if (score >= 70) return 'text-orange-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-emerald-400';
}

function getRiskBarColor(score: number): string {
  if (score >= 85) return 'bg-red-500';
  if (score >= 70) return 'bg-orange-500';
  if (score >= 40) return 'bg-amber-500';
  return 'bg-emerald-500';
}

function isAutoResponse(respondedBy: string): boolean {
  return respondedBy === 'system' || respondedBy.toLowerCase() === 'auto';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatCard: React.FC<{
  label: string;
  value: string | number;
  sub: string;
  icon: React.ReactNode;
  valueClass?: string;
}> = ({ label, value, sub, icon, valueClass = 'text-slate-100' }) => (
  <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4 transition-all duration-200 hover:border-slate-600">
    <div className="flex items-center justify-between mb-2">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">{label}</span>
      {icon}
    </div>
    <p className={`text-2xl font-bold font-mono ${valueClass}`}>{value}</p>
    <p className="text-[10px] text-slate-500 mt-1">{sub}</p>
  </div>
);

// ---------------------------------------------------------------------------
// Action Distribution Bar
// ---------------------------------------------------------------------------

const ActionDistributionBar: React.FC<{ decisions: ResponseDecision[] }> = ({ decisions }) => {
  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    decisions.forEach((d) => {
      counts[d.action] = (counts[d.action] || 0) + 1;
    });
    const total = decisions.length;
    return ALL_ACTIONS
      .map((action) => ({
        action,
        count: counts[action] || 0,
        pct: total > 0 ? ((counts[action] || 0) / total) * 100 : 0,
      }))
      .filter((d) => d.count > 0);
  }, [decisions]);

  const total = decisions.length;

  if (distribution.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-[11px] text-slate-500 italic">No action distribution data</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Segmented bar */}
      <div className="h-8 flex rounded-lg overflow-hidden border border-[#1e293b]/40">
        {distribution.map((d) => {
          const cfg = ACTION_CONFIG[d.action];
          if (!cfg) return null;
          return (
            <div
              key={d.action}
              className={`${cfg.barColor} opacity-70 hover:opacity-100 transition-opacity relative group cursor-default`}
              style={{ width: `${d.pct}%`, minWidth: d.pct > 0 ? '2px' : '0' }}
              title={`${cfg.label}: ${d.count} (${d.pct.toFixed(1)}%)`}
            >
              {d.pct >= 8 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 font-mono">
                  {d.pct.toFixed(0)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {distribution.map((d) => {
          const cfg = ACTION_CONFIG[d.action];
          if (!cfg) return null;
          const Icon = cfg.icon;
          return (
            <div key={d.action} className="flex items-center gap-2">
              <div className={`w-2.5 h-2.5 rounded-sm ${cfg.barColor}`} />
              <Icon size={12} className={cfg.color} />
              <span className="text-[11px] text-slate-400">{cfg.label}</span>
              <span className="text-[11px] font-mono text-slate-300">{d.count}</span>
              <span className="text-[10px] text-slate-600">({d.pct.toFixed(1)}%)</span>
            </div>
          );
        })}
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-[10px] text-slate-600">Total:</span>
          <span className="text-[11px] font-mono text-slate-400">{total}</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Timeline Decision Card
// ---------------------------------------------------------------------------

const TimelineCard: React.FC<{ decision: ResponseDecision }> = ({ decision }) => {
  const [expanded, setExpanded] = useState(false);
  const actionCfg = ACTION_CONFIG[decision.action] || ACTION_CONFIG.allow;
  const ActionIcon = actionCfg.icon;
  const outcomeCfg = OUTCOME_STYLES[decision.outcome] || OUTCOME_STYLES.executed;
  const isAuto = isAutoResponse(decision.responded_by);

  return (
    <div className="relative flex gap-4 group">
      {/* Timeline left indicator */}
      <div className="flex flex-col items-center flex-shrink-0 w-20">
        <span className="text-[10px] font-mono text-slate-500 text-right w-full pr-2 pt-3">
          {timeAgo(decision.created_at)}
        </span>
      </div>

      {/* Timeline connector */}
      <div className="flex flex-col items-center flex-shrink-0">
        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center mt-2 ${
          decision.action === 'block' ? 'border-red-500/50 bg-red-500/10' :
          decision.action === 'step_up_auth' ? 'border-amber-500/50 bg-amber-500/10' :
          decision.action === 'freeze_account' ? 'border-cyan-500/50 bg-cyan-500/10' :
          decision.action === 'alert_soc' ? 'border-orange-500/50 bg-orange-500/10' :
          decision.action === 'delay' ? 'border-blue-500/50 bg-blue-500/10' :
          'border-emerald-500/50 bg-emerald-500/10'
        }`}>
          <ActionIcon size={14} className={actionCfg.color} />
        </div>
        <div className="w-px flex-1 bg-[#1e293b] min-h-[16px]" />
      </div>

      {/* Card content */}
      <div className="flex-1 pb-6">
        <div
          className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl overflow-hidden hover:border-slate-600 transition-all duration-200 cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {/* Card header */}
          <div className="px-4 py-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              {/* Action badge */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold uppercase tracking-wider border ${actionCfg.badgeClass}`}>
                <ActionIcon size={11} />
                {actionCfg.label}
              </span>
              {/* Outcome badge */}
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium border ${outcomeCfg.className}`}>
                {outcomeCfg.label}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Response time */}
              <div className="flex items-center gap-1">
                <Timer size={10} className="text-slate-600" />
                <span className="text-[10px] font-mono text-slate-400">{formatResponseTime(decision.response_time_ms)}</span>
              </div>
              {/* Auto vs Manual indicator */}
              <div className="flex items-center gap-1">
                {isAuto ? (
                  <Bot size={11} className="text-blue-400" />
                ) : (
                  <User size={11} className="text-emerald-400" />
                )}
                <span className={`text-[10px] font-mono ${isAuto ? 'text-blue-400' : 'text-emerald-400'}`}>
                  {isAuto ? 'Auto' : decision.responded_by.replace('analyst:', '')}
                </span>
              </div>
              {/* Expand toggle */}
              {expanded ? (
                <ChevronUp size={14} className="text-slate-600" />
              ) : (
                <ChevronDown size={14} className="text-slate-600" />
              )}
            </div>
          </div>

          {/* Card body - always visible summary */}
          <div className="px-4 pb-3 space-y-2">
            <div className="flex items-center gap-4 flex-wrap">
              {/* Decision ID */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">ID</span>
                <span className="text-[10px] font-mono text-slate-400">{decision.decision_id}</span>
              </div>
              {/* Trigger */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">Trigger</span>
                <span className="text-[10px] font-mono text-slate-400">
                  {humanizeKey(decision.trigger_type)}
                </span>
                <span className="text-[10px] font-mono text-slate-500">{decision.trigger_id}</span>
              </div>
              {/* Entity */}
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] text-slate-600 uppercase tracking-wider">Entity</span>
                <span className="text-[10px] font-mono text-slate-400">{decision.entity_id}</span>
              </div>
            </div>

            {/* Risk Score mini bar */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-600 uppercase tracking-wider w-14">Risk</span>
              <div className="w-32 h-2 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1e293b]/40">
                <div
                  className={`h-full rounded-full ${getRiskBarColor(decision.risk_score)} transition-all duration-500`}
                  style={{ width: `${decision.risk_score}%` }}
                />
              </div>
              <span className={`text-[11px] font-mono font-bold ${getRiskColor(decision.risk_score)}`}>
                {decision.risk_score}
              </span>
            </div>
          </div>

          {/* Expanded details */}
          {expanded && (
            <div className="px-4 pb-4 pt-1 border-t border-[#1e293b]/40 space-y-3">
              {/* Reasoning */}
              {decision.reasoning && (
                <div>
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider font-medium mb-1">Reasoning</p>
                  <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
                    <p className="text-[11px] text-slate-400 leading-relaxed">{decision.reasoning}</p>
                  </div>
                </div>
              )}

              {/* Detail grid */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Response Time</p>
                  <p className="text-[12px] font-mono text-slate-300">{decision.response_time_ms}ms</p>
                </div>
                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Responded By</p>
                  <div className="flex items-center gap-1.5">
                    {isAuto ? <Bot size={12} className="text-blue-400" /> : <User size={12} className="text-emerald-400" />}
                    <p className="text-[12px] font-mono text-slate-300">{decision.responded_by}</p>
                  </div>
                </div>
                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
                  <p className="text-[9px] text-slate-600 uppercase tracking-wider mb-1">Timestamp</p>
                  <p className="text-[12px] font-mono text-slate-300">
                    {new Date(decision.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ResponseDecisions: React.FC = () => {
  const [decisions, setDecisions] = useState<ResponseDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [triggerTypeFilter, setTriggerTypeFilter] = useState<string>('all');
  const [outcomeFilter, setOutcomeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchDecisions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('financial_response_decisions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setDecisions((data as ResponseDecision[]) || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch response decisions';
      setError(message);
      console.error('ResponseDecisions fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDecisions();
  }, [fetchDecisions]);

  // ---------------------------------------------------------------------------
  // Filtering
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = [...decisions];

    if (actionFilter !== 'all') {
      result = result.filter((d) => d.action === actionFilter);
    }
    if (triggerTypeFilter !== 'all') {
      result = result.filter((d) => d.trigger_type === triggerTypeFilter);
    }
    if (outcomeFilter !== 'all') {
      result = result.filter((d) => d.outcome === outcomeFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (d) =>
          d.decision_id.toLowerCase().includes(q) ||
          d.entity_id.toLowerCase().includes(q)
      );
    }

    return result;
  }, [decisions, actionFilter, triggerTypeFilter, outcomeFilter, searchTerm]);

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = decisions.length;
    const autoBlocked = decisions.filter((d) => d.action === 'block').length;
    const stepUpAuth = decisions.filter((d) => d.action === 'step_up_auth').length;
    const frozenAccounts = decisions.filter((d) => d.action === 'freeze_account').length;
    const avgResponseMs = total > 0
      ? Math.round(decisions.reduce((sum, d) => sum + d.response_time_ms, 0) / total)
      : 0;

    return { total, autoBlocked, stepUpAuth, frozenAccounts, avgResponseMs };
  }, [decisions]);

  // ---------------------------------------------------------------------------
  // Auto vs Manual split
  // ---------------------------------------------------------------------------

  const autoManualSplit = useMemo(() => {
    const auto = decisions.filter((d) => isAutoResponse(d.responded_by)).length;
    const manual = decisions.length - auto;
    return { auto, manual };
  }, [decisions]);

  // ---------------------------------------------------------------------------
  // Filter state
  // ---------------------------------------------------------------------------

  const activeFilterCount = [
    actionFilter !== 'all',
    triggerTypeFilter !== 'all',
    outcomeFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setActionFilter('all');
    setTriggerTypeFilter('all');
    setOutcomeFilter('all');
    setSearchTerm('');
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-slate-500" />
        <span className="ml-3 text-sm text-slate-500">Loading response decisions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertTriangle size={24} className="text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchDecisions}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0f1629] border border-[#1e293b] text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Zap size={18} className="text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Response Decisions</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Orchestrated response actions log -- automated and manual decisions</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-[11px] font-medium transition-colors ${
              showFilters || activeFilterCount > 0
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-[#0f1629] border-[#1e293b] text-slate-400 hover:text-slate-200'
            }`}
          >
            <Filter size={12} />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-[9px] font-mono text-cyan-400">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={fetchDecisions}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0f1629] border border-[#1e293b] text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard
          label="Total Decisions"
          value={stats.total}
          sub="all response actions"
          icon={<Activity size={14} className="text-slate-400" />}
        />
        <StatCard
          label="Auto-Blocked"
          value={stats.autoBlocked}
          sub="transactions blocked"
          icon={<Ban size={14} className="text-red-400" />}
          valueClass="text-red-400"
        />
        <StatCard
          label="Step-Up Auth"
          value={stats.stepUpAuth}
          sub="additional verification"
          icon={<ShieldAlert size={14} className="text-amber-400" />}
          valueClass="text-amber-400"
        />
        <StatCard
          label="Accounts Frozen"
          value={stats.frozenAccounts}
          sub="accounts locked down"
          icon={<Lock size={14} className="text-blue-400" />}
          valueClass="text-blue-400"
        />
        <StatCard
          label="Avg Response Time"
          value={formatResponseTime(stats.avgResponseMs)}
          sub={`${stats.avgResponseMs}ms average`}
          icon={<Timer size={14} className="text-cyan-400" />}
          valueClass="text-cyan-400"
        />
      </div>

      {/* Action Distribution */}
      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-4">Action Distribution</h3>
        <ActionDistributionBar decisions={decisions} />
      </div>

      {/* Auto vs Manual Split */}
      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Response Origin</h3>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Bot size={13} className="text-blue-400" />
              <span className="text-[11px] text-slate-400">Automated</span>
              <span className="text-[13px] font-mono font-bold text-blue-400">{autoManualSplit.auto}</span>
              {decisions.length > 0 && (
                <span className="text-[10px] text-slate-600">
                  ({((autoManualSplit.auto / decisions.length) * 100).toFixed(0)}%)
                </span>
              )}
            </div>
            <div className="w-px h-4 bg-[#1e293b]" />
            <div className="flex items-center gap-2">
              <User size={13} className="text-emerald-400" />
              <span className="text-[11px] text-slate-400">Manual (Analyst)</span>
              <span className="text-[13px] font-mono font-bold text-emerald-400">{autoManualSplit.manual}</span>
              {decisions.length > 0 && (
                <span className="text-[10px] text-slate-600">
                  ({((autoManualSplit.manual / decisions.length) * 100).toFixed(0)}%)
                </span>
              )}
            </div>
          </div>
        </div>
        {/* Mini split bar */}
        {decisions.length > 0 && (
          <div className="mt-3 h-2 flex rounded-full overflow-hidden border border-[#1e293b]/40">
            <div
              className="bg-blue-500 transition-all duration-500"
              style={{ width: `${(autoManualSplit.auto / decisions.length) * 100}%` }}
            />
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${(autoManualSplit.manual / decisions.length) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Filter Decisions</h3>
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={10} />
                Clear all
              </button>
            )}
          </div>
          <div className="grid grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Search</label>
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-600" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Decision ID, entity ID..."
                  className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md pl-8 pr-3 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 font-mono"
                />
              </div>
            </div>
            {/* Action Type */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Action Type</label>
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
              >
                <option value="all">All Actions</option>
                {ALL_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_CONFIG[a]?.label || humanizeKey(a)}
                  </option>
                ))}
              </select>
            </div>
            {/* Trigger Type */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Trigger Type</label>
              <select
                value={triggerTypeFilter}
                onChange={(e) => setTriggerTypeFilter(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
              >
                <option value="all">All Triggers</option>
                {TRIGGER_TYPES.map((t) => (
                  <option key={t} value={t}>{humanizeKey(t)}</option>
                ))}
              </select>
            </div>
            {/* Outcome */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Outcome</label>
              <select
                value={outcomeFilter}
                onChange={(e) => setOutcomeFilter(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
              >
                <option value="all">All Outcomes</option>
                {ALL_OUTCOMES.map((o) => (
                  <option key={o} value={o}>{OUTCOME_STYLES[o]?.label || humanizeKey(o)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          <span className="font-mono text-slate-400">{filtered.length}</span> decision{filtered.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && <span> (filtered)</span>}
        </p>
      </div>

      {/* Response Timeline */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0b0f1e] border border-[#1e293b] rounded-xl">
          <Shield size={28} className="text-slate-700 mb-3" />
          <p className="text-[12px] text-slate-500">No decisions match the current filters</p>
          {activeFilterCount > 0 && (
            <button
              onClick={resetFilters}
              className="mt-2 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
          <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-6">Response Timeline</h3>
          <div className="relative">
            {filtered.map((decision) => (
              <TimelineCard key={decision.id} decision={decision} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResponseDecisions;
