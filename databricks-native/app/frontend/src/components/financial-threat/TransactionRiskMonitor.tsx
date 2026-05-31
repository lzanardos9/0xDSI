import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock,
  DollarSign,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SessionIntegrity {
  geo_match: boolean;
  device_match: boolean;
  session_age_min: number;
}

interface FinancialTransaction {
  id: string;
  transaction_id: string;
  transaction_type: string;
  source_entity_id: string;
  dest_entity_id: string;
  amount: number;
  currency: string;
  risk_score: number;
  risk_factors: string[] | null;
  decision: string;
  decision_reason: string | null;
  behavioral_deviation: number | null;
  dest_risk_indicators: string[] | null;
  session_integrity: SessionIntegrity | null;
  status: string;
  created_at: string;
}

type RiskRange = 'all' | 'low' | 'medium' | 'high' | 'critical';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TX_TYPE_STYLES: Record<string, string> = {
  pix: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  ted: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  wire: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  card: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  crypto: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
};

const DECISION_STYLES: Record<string, string> = {
  allowed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  stepped_up: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  delayed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  blocked: 'bg-red-500/15 text-red-400 border-red-500/30',
  alerted: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
};

const DECISION_BAR_COLORS: Record<string, string> = {
  allowed: 'bg-emerald-500',
  stepped_up: 'bg-amber-500',
  delayed: 'bg-blue-500',
  blocked: 'bg-red-500',
  alerted: 'bg-orange-500',
};

const DECISION_LABELS: Record<string, string> = {
  allowed: 'Allowed',
  stepped_up: 'Stepped Up',
  delayed: 'Delayed',
  blocked: 'Blocked',
  alerted: 'Alerted',
};

const RISK_RANGES: { key: RiskRange; label: string; min: number; max: number }[] = [
  { key: 'low', label: 'Low (0-29)', min: 0, max: 29 },
  { key: 'medium', label: 'Medium (30-69)', min: 30, max: 69 },
  { key: 'high', label: 'High (70-84)', min: 70, max: 84 },
  { key: 'critical', label: 'Critical (85+)', min: 85, max: 100 },
];

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

function truncateId(id: string, len = 8): string {
  if (!id) return '';
  return id.length > len ? id.slice(0, len) + '\u2026' : id;
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function getRiskScoreColor(score: number): string {
  if (score < 30) return 'text-emerald-400';
  if (score < 70) return 'text-amber-400';
  if (score < 85) return 'text-orange-400';
  return 'text-red-400';
}

function getRiskScoreBarColor(score: number): string {
  if (score < 30) return 'bg-emerald-500';
  if (score < 70) return 'bg-amber-500';
  if (score < 85) return 'bg-orange-500';
  return 'bg-red-500';
}

function getRiskScoreDotColor(score: number): string {
  if (score < 30) return '#34d399';
  if (score < 70) return '#fbbf24';
  if (score < 85) return '#fb923c';
  return '#f87171';
}

function humanizeRiskFactor(factor: string): string {
  return factor
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
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
// Risk Score Timeline
// ---------------------------------------------------------------------------

const RiskScoreTimeline: React.FC<{ transactions: FinancialTransaction[] }> = ({ transactions }) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const recent = useMemo(() => {
    return transactions.slice(0, 60);
  }, [transactions]);

  if (recent.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-slate-500 italic">No transaction data for timeline</p>
      </div>
    );
  }

  const maxAmount = Math.max(...recent.map((t) => t.amount), 1);

  return (
    <div className="relative">
      <div className="flex items-end gap-[3px] h-24 overflow-x-auto pb-1 px-1">
        {recent.map((tx, idx) => {
          const size = Math.max(8, Math.min(28, (tx.amount / maxAmount) * 28));
          const color = getRiskScoreDotColor(tx.risk_score);
          const isHovered = hoveredIdx === idx;

          return (
            <div
              key={tx.id}
              className="relative flex flex-col items-center justify-end shrink-0"
              style={{ height: '100%' }}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {isHovered && (
                <div className="absolute bottom-full mb-2 z-50 bg-[#0f1629] border border-[#1e293b] rounded-lg p-2.5 shadow-xl min-w-[180px] pointer-events-none">
                  <div className="text-[10px] text-slate-500 font-mono mb-1">{tx.transaction_id}</div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">Amount</span>
                    <span className="text-[11px] text-slate-200 font-mono font-bold">{formatBRL(tx.amount)}</span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">Risk</span>
                    <span className={`text-[11px] font-mono font-bold ${getRiskScoreColor(tx.risk_score)}`}>
                      {tx.risk_score}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-slate-400">Type</span>
                    <span className="text-[11px] text-slate-300 font-mono uppercase">{tx.transaction_type}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">Decision</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium font-mono border ${
                        DECISION_STYLES[tx.decision] || DECISION_STYLES.allowed
                      }`}
                    >
                      {tx.decision}
                    </span>
                  </div>
                  <div className="text-[9px] text-slate-600 font-mono mt-1">{timeAgo(tx.created_at)}</div>
                </div>
              )}
              <div
                className="rounded-full cursor-pointer transition-all duration-150"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: color,
                  opacity: isHovered ? 1 : 0.7,
                  transform: isHovered ? 'scale(1.3)' : 'scale(1)',
                  boxShadow: isHovered ? `0 0 8px ${color}` : 'none',
                }}
              />
            </div>
          );
        })}
      </div>
      {/* Timeline base line */}
      <div className="h-px bg-[#1e293b] mt-1" />
      <div className="flex items-center justify-between mt-1.5">
        <span className="text-[9px] text-slate-600 font-mono">Latest</span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[9px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> &lt;30
          </span>
          <span className="flex items-center gap-1 text-[9px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" /> 30-70
          </span>
          <span className="flex items-center gap-1 text-[9px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> 70-85
          </span>
          <span className="flex items-center gap-1 text-[9px] text-slate-600">
            <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> &gt;85
          </span>
        </div>
        <span className="text-[9px] text-slate-600 font-mono">Oldest</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Decision Breakdown Bar
// ---------------------------------------------------------------------------

const DecisionBreakdown: React.FC<{ transactions: FinancialTransaction[] }> = ({ transactions }) => {
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    transactions.forEach((tx) => {
      counts[tx.decision] = (counts[tx.decision] || 0) + 1;
    });
    const total = transactions.length || 1;
    const ordered = ['allowed', 'stepped_up', 'delayed', 'blocked', 'alerted'];
    return ordered
      .filter((d) => counts[d])
      .map((d) => ({
        decision: d,
        count: counts[d] || 0,
        pct: ((counts[d] || 0) / total) * 100,
      }));
  }, [transactions]);

  if (breakdown.length === 0) {
    return (
      <div className="flex items-center justify-center py-6">
        <p className="text-[11px] text-slate-500 italic">No decision data available</p>
      </div>
    );
  }

  return (
    <div>
      {/* Stacked bar */}
      <div className="flex h-6 rounded-md overflow-hidden border border-[#1e293b]/50">
        {breakdown.map((b) => (
          <div
            key={b.decision}
            className={`${DECISION_BAR_COLORS[b.decision] || 'bg-slate-500'} transition-all duration-500 relative group`}
            style={{ width: `${b.pct}%`, opacity: 0.8 }}
            title={`${DECISION_LABELS[b.decision] || b.decision}: ${b.count} (${b.pct.toFixed(1)}%)`}
          >
            {b.pct > 8 && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-mono font-bold text-white/90">
                {b.pct.toFixed(0)}%
              </span>
            )}
          </div>
        ))}
      </div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5">
        {breakdown.map((b) => (
          <div key={b.decision} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-sm ${DECISION_BAR_COLORS[b.decision] || 'bg-slate-500'}`} />
            <span className="text-[10px] text-slate-400 font-mono">
              {DECISION_LABELS[b.decision] || b.decision}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {b.count} ({b.pct.toFixed(1)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Expanded Row Detail
// ---------------------------------------------------------------------------

const ExpandedRowDetail: React.FC<{ tx: FinancialTransaction }> = ({ tx }) => {
  const riskFactors = tx.risk_factors || [];
  const destIndicators = tx.dest_risk_indicators || [];
  const session = tx.session_integrity;
  const deviation = tx.behavioral_deviation;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4 bg-[#080c16] border-t border-[#1e293b]">
      {/* Risk Factors */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          Risk Factors
          {riskFactors.length > 0 && (
            <span className="text-[10px] text-slate-500 font-normal">({riskFactors.length})</span>
          )}
        </h4>
        {riskFactors.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {riskFactors.map((factor, idx) => (
              <span
                key={idx}
                className="inline-flex items-center px-2 py-1 rounded text-[10px] font-mono bg-[#0a0e1a] text-slate-300 border border-[#1e293b]/50"
              >
                {humanizeRiskFactor(factor)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No risk factors recorded</p>
        )}
      </div>

      {/* Decision Reason & Behavioral Deviation */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Shield className="w-3 h-3" />
          Decision Analysis
        </h4>
        <div className="space-y-3">
          {/* Decision Reason */}
          <div>
            <span className="text-[10px] text-slate-500 block mb-0.5">Decision Reason</span>
            <p className="text-[11px] text-slate-300 font-mono leading-relaxed">
              {tx.decision_reason || 'No reason provided'}
            </p>
          </div>
          {/* Behavioral Deviation Meter */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-slate-500">Behavioral Deviation</span>
              <span
                className={`text-[11px] font-mono font-bold ${
                  deviation == null
                    ? 'text-slate-500'
                    : deviation <= 3
                    ? 'text-emerald-400'
                    : deviation <= 6
                    ? 'text-amber-400'
                    : deviation <= 8
                    ? 'text-orange-400'
                    : 'text-red-400'
                }`}
              >
                {deviation != null ? `${deviation.toFixed(1)} / 10` : 'N/A'}
              </span>
            </div>
            {deviation != null && (
              <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1e293b]/50">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    deviation <= 3
                      ? 'bg-emerald-500'
                      : deviation <= 6
                      ? 'bg-amber-500'
                      : deviation <= 8
                      ? 'bg-orange-500'
                      : 'bg-red-500'
                  }`}
                  style={{ width: `${(deviation / 10) * 100}%` }}
                />
              </div>
            )}
            {deviation != null && (
              <div className="flex justify-between mt-0.5">
                <span className="text-[8px] text-slate-600 font-mono">0 Normal</span>
                <span className="text-[8px] text-slate-600 font-mono">10 Extreme</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Destination Risk Indicators */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <ShieldAlert className="w-3 h-3" />
          Destination Risk Indicators
          {destIndicators.length > 0 && (
            <span className="text-[10px] text-slate-500 font-normal">({destIndicators.length})</span>
          )}
        </h4>
        {destIndicators.length > 0 ? (
          <div className="space-y-1.5">
            {destIndicators.map((indicator, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 bg-[#0a0e1a] rounded px-2 py-1.5 border border-[#1e293b]/50"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                <span className="text-[11px] text-slate-300 font-mono">
                  {humanizeRiskFactor(indicator)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-emerald-400/60 italic">No destination risk indicators</p>
        )}
      </div>

      {/* Session Integrity */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Zap className="w-3 h-3" />
          Session Integrity
        </h4>
        {session ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between bg-[#0a0e1a] rounded px-2 py-1.5 border border-[#1e293b]/50">
              <span className="text-[11px] text-slate-400">Geo Match</span>
              <span
                className={`text-[11px] font-mono font-bold ${
                  session.geo_match ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {session.geo_match ? 'MATCH' : 'MISMATCH'}
              </span>
            </div>
            <div className="flex items-center justify-between bg-[#0a0e1a] rounded px-2 py-1.5 border border-[#1e293b]/50">
              <span className="text-[11px] text-slate-400">Device Match</span>
              <span
                className={`text-[11px] font-mono font-bold ${
                  session.device_match ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {session.device_match ? 'MATCH' : 'MISMATCH'}
              </span>
            </div>
            <div className="flex items-center justify-between bg-[#0a0e1a] rounded px-2 py-1.5 border border-[#1e293b]/50">
              <span className="text-[11px] text-slate-400">Session Age</span>
              <span
                className={`text-[11px] font-mono font-bold ${
                  session.session_age_min >= 5
                    ? 'text-emerald-400'
                    : session.session_age_min >= 2
                    ? 'text-amber-400'
                    : 'text-red-400'
                }`}
              >
                {session.session_age_min} min
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No session integrity data</p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const TransactionRiskMonitor: React.FC = () => {
  const [transactions, setTransactions] = useState<FinancialTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [decisionFilter, setDecisionFilter] = useState<string>('all');
  const [riskRangeFilter, setRiskRangeFilter] = useState<RiskRange>('all');
  const [showFilters, setShowFilters] = useState(false);

  // -------------------------------------------------------------------------
  // Data Fetching
  // -------------------------------------------------------------------------

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('financial_transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setTransactions((data as FinancialTransaction[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch financial transactions:', err);
      setError(err?.message || 'Failed to load transactions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // -------------------------------------------------------------------------
  // Computed data
  // -------------------------------------------------------------------------

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (tx) =>
          (tx.transaction_id && tx.transaction_id.toLowerCase().includes(q)) ||
          (tx.source_entity_id && tx.source_entity_id.toLowerCase().includes(q)) ||
          (tx.dest_entity_id && tx.dest_entity_id.toLowerCase().includes(q))
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      result = result.filter((tx) => tx.transaction_type === typeFilter);
    }

    // Decision filter
    if (decisionFilter !== 'all') {
      result = result.filter((tx) => tx.decision === decisionFilter);
    }

    // Risk range filter
    if (riskRangeFilter !== 'all') {
      const range = RISK_RANGES.find((r) => r.key === riskRangeFilter);
      if (range) {
        result = result.filter((tx) => tx.risk_score >= range.min && tx.risk_score <= range.max);
      }
    }

    return result;
  }, [transactions, searchQuery, typeFilter, decisionFilter, riskRangeFilter]);

  const stats = useMemo(() => {
    const total = transactions.length;
    const blocked = transactions.filter((tx) => tx.decision === 'blocked');
    const blockedCount = blocked.length;
    const avgRisk =
      total > 0 ? Math.round(transactions.reduce((sum, tx) => sum + (tx.risk_score ?? 0), 0) / total) : 0;
    const totalProtected = blocked.reduce((sum, tx) => sum + (tx.amount ?? 0), 0);
    return { total, blockedCount, avgRisk, totalProtected };
  }, [transactions]);

  const uniqueTypes = useMemo(() => {
    const types = new Set(transactions.map((tx) => tx.transaction_type));
    return Array.from(types).sort();
  }, [transactions]);

  const uniqueDecisions = useMemo(() => {
    const decisions = new Set(transactions.map((tx) => tx.decision));
    return Array.from(decisions).sort();
  }, [transactions]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (typeFilter !== 'all') count++;
    if (decisionFilter !== 'all') count++;
    if (riskRangeFilter !== 'all') count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [typeFilter, decisionFilter, riskRangeFilter, searchQuery]);

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setTypeFilter('all');
    setDecisionFilter('all');
    setRiskRangeFilter('all');
  }, []);

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-[#0a0e1a] rounded-xl border border-[#1e293b]">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
        <p className="text-sm text-slate-400">Loading financial transactions...</p>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Error state
  // -------------------------------------------------------------------------

  if (error) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-[#0a0e1a] rounded-xl border border-[#1e293b]">
        <ShieldAlert className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-red-400 mb-1">Failed to load transactions</p>
        <p className="text-xs text-slate-500 mb-4">{error}</p>
        <button
          onClick={fetchTransactions}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-[#0f1629] border border-[#1e293b] rounded-lg hover:bg-[#141c32] transition-all duration-200"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* ---- Stats Bar ---- */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          label="Total Transactions"
          value={stats.total.toLocaleString()}
          sub="All monitored transactions"
          icon={<Activity className="w-4 h-4 text-slate-500" />}
        />
        <StatCard
          label="Blocked"
          value={stats.blockedCount.toLocaleString()}
          sub="Transactions blocked"
          icon={<ShieldBan className="w-4 h-4 text-red-400" />}
          valueClass={stats.blockedCount > 0 ? 'text-red-400' : 'text-slate-100'}
        />
        <StatCard
          label="Avg Risk Score"
          value={stats.avgRisk}
          sub="Across all transactions"
          icon={<TrendingUp className="w-4 h-4 text-slate-500" />}
          valueClass={getRiskScoreColor(stats.avgRisk)}
        />
        <StatCard
          label="Amount Protected"
          value={formatBRL(stats.totalProtected)}
          sub="Sum of blocked amounts"
          icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
          valueClass="text-emerald-400"
        />
      </div>

      {/* ---- Risk Score Timeline ---- */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          Risk Score Timeline
        </h3>
        <RiskScoreTimeline transactions={transactions} />
      </div>

      {/* ---- Decision Breakdown ---- */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-slate-500" />
          Decision Breakdown
        </h3>
        <DecisionBreakdown transactions={transactions} />
      </div>

      {/* ---- Search & Filters ---- */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by transaction ID or entity ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs text-slate-300 bg-[#0a0e1a] border border-[#1e293b] rounded-lg placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-all duration-200 font-mono"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border transition-all duration-200 ${
                showFilters || activeFilterCount > 0
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-[#0a0e1a] text-slate-400 border-[#1e293b] hover:border-slate-600'
              }`}
            >
              <Filter className="w-3 h-3" />
              Filters
              {activeFilterCount > 0 && (
                <span className="flex items-center justify-center w-4 h-4 rounded-full bg-cyan-500/20 text-[9px] text-cyan-400 font-bold">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Clear filters */}
            {activeFilterCount > 0 && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 px-2 py-1.5 text-[11px] text-slate-400 bg-[#0a0e1a] border border-[#1e293b] rounded-lg hover:border-slate-600 transition-all duration-200"
              >
                <X className="w-3 h-3" />
                Clear
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={fetchTransactions}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-400 bg-[#0a0e1a] border border-[#1e293b] rounded-lg hover:border-slate-600 transition-all duration-200"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex flex-wrap items-center gap-3 mt-2 pt-2 border-t border-[#1e293b]/50">
            {/* Transaction type dropdown */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase whitespace-nowrap">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-2 py-1 text-[11px] font-mono bg-[#0a0e1a] text-slate-300 border border-[#1e293b] rounded-lg focus:outline-none focus:border-cyan-500/50 transition-all duration-200 appearance-none cursor-pointer"
              >
                <option value="all">All Types</option>
                {uniqueTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Decision filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase whitespace-nowrap">Decision:</span>
              <select
                value={decisionFilter}
                onChange={(e) => setDecisionFilter(e.target.value)}
                className="px-2 py-1 text-[11px] font-mono bg-[#0a0e1a] text-slate-300 border border-[#1e293b] rounded-lg focus:outline-none focus:border-cyan-500/50 transition-all duration-200 appearance-none cursor-pointer"
              >
                <option value="all">All Decisions</option>
                {uniqueDecisions.map((decision) => (
                  <option key={decision} value={decision}>
                    {DECISION_LABELS[decision] || decision}
                  </option>
                ))}
              </select>
            </div>

            {/* Risk score range */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase whitespace-nowrap">Risk:</span>
              {(['all', ...RISK_RANGES.map((r) => r.key)] as RiskRange[]).map((key) => {
                const range = RISK_RANGES.find((r) => r.key === key);
                const riskBtnStyles: Record<RiskRange, string> = {
                  all: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
                  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
                  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
                  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
                };
                return (
                  <button
                    key={key}
                    onClick={() => setRiskRangeFilter(key)}
                    className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-all duration-200 ${
                      riskRangeFilter === key
                        ? riskBtnStyles[key]
                        : 'bg-[#0a0e1a] text-slate-500 border-[#1e293b] hover:border-slate-600'
                    }`}
                  >
                    {key === 'all' ? 'all' : range?.label.split(' ')[0].toLowerCase()}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ---- Transactions Table ---- */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#1e293b] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-500" />
            Transactions
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">
            {filteredTransactions.length} of {transactions.length} transactions
          </span>
        </div>

        {/* Empty state */}
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Activity className="w-10 h-10 text-slate-700 mb-3" />
            <p className="text-sm text-slate-500 mb-1">
              {transactions.length === 0
                ? 'No transactions found'
                : 'No transactions match your filters'}
            </p>
            <p className="text-[11px] text-slate-600">
              {transactions.length === 0
                ? 'Financial transactions will appear once data is available.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Table Header */}
            <div className="grid grid-cols-[110px_68px_100px_90px_140px_86px_1fr_72px] gap-2 px-4 py-2 border-b border-[#1e293b]/50 bg-[#0a0e1a]/50 min-w-[860px]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Transaction ID
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Type
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium text-right">
                Amount
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Risk Score
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Source / Dest
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Decision
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Risk Factors
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium text-right">
                Time
              </span>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[#1e293b]/30 min-w-[860px]">
              {filteredTransactions.map((tx) => {
                const isExpanded = expandedId === tx.id;
                const factors = tx.risk_factors || [];
                const topFactors = factors.slice(0, 3);

                return (
                  <React.Fragment key={tx.id}>
                    <div
                      className={`grid grid-cols-[110px_68px_100px_90px_140px_86px_1fr_72px] gap-2 px-4 py-2.5 items-center cursor-pointer transition-all duration-200 hover:bg-[#141c32] ${
                        isExpanded ? 'bg-[#0d1425]' : ''
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                    >
                      {/* Transaction ID */}
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ChevronRight
                          className={`w-3 h-3 text-slate-600 shrink-0 transition-transform duration-200 ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <span className="text-[11px] text-slate-300 font-mono truncate" title={tx.transaction_id}>
                          {truncateId(tx.transaction_id, 10)}
                        </span>
                      </div>

                      {/* Type badge */}
                      <div>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono uppercase border ${
                            TX_TYPE_STYLES[tx.transaction_type] || 'bg-slate-500/15 text-slate-400 border-slate-500/30'
                          }`}
                        >
                          {tx.transaction_type}
                        </span>
                      </div>

                      {/* Amount */}
                      <div className="text-right">
                        <span className="text-[11px] text-slate-200 font-mono">{formatBRL(tx.amount)}</span>
                      </div>

                      {/* Risk Score */}
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1 h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1e293b]/30">
                          <div
                            className={`h-full rounded-full ${getRiskScoreBarColor(tx.risk_score)}`}
                            style={{ width: `${tx.risk_score}%`, opacity: 0.8 }}
                          />
                        </div>
                        <span className={`text-[11px] font-mono font-bold w-6 text-right ${getRiskScoreColor(tx.risk_score)}`}>
                          {tx.risk_score}
                        </span>
                      </div>

                      {/* Source -> Dest */}
                      <div className="flex items-center gap-1 min-w-0">
                        <span
                          className="text-[10px] text-slate-400 font-mono truncate"
                          title={tx.source_entity_id}
                        >
                          {truncateId(tx.source_entity_id, 8)}
                        </span>
                        <ArrowRight className="w-3 h-3 text-slate-600 shrink-0" />
                        <span
                          className="text-[10px] text-slate-400 font-mono truncate"
                          title={tx.dest_entity_id}
                        >
                          {truncateId(tx.dest_entity_id, 8)}
                        </span>
                      </div>

                      {/* Decision */}
                      <div>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono border ${
                            DECISION_STYLES[tx.decision] || DECISION_STYLES.allowed
                          }`}
                        >
                          {tx.decision}
                        </span>
                      </div>

                      {/* Risk Factors */}
                      <div className="flex flex-wrap gap-1 min-w-0">
                        {topFactors.map((factor, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono bg-[#0a0e1a] text-slate-400 border border-[#1e293b]/50 truncate max-w-[120px]"
                            title={humanizeRiskFactor(factor)}
                          >
                            {humanizeRiskFactor(factor)}
                          </span>
                        ))}
                        {factors.length > 3 && (
                          <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-mono text-slate-500">
                            +{factors.length - 3}
                          </span>
                        )}
                      </div>

                      {/* Time */}
                      <div className="text-right">
                        <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3 text-slate-600" />
                          {timeAgo(tx.created_at)}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && <ExpandedRowDetail tx={tx} />}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TransactionRiskMonitor;
