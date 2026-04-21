import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  Filter,
  FlaskConical,
  Loader2,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Target,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttackPath {
  path: string;
  probability: number;
  avg_amount?: number;
  avg_delay_hours?: number;
}

interface DetectionGap {
  gap: string;
  impact: string;
  description: string;
}

interface SuggestedRule {
  rule: string;
  confidence: number;
}

interface SimulationResults {
  detection_rate?: number;
  prevention_rate?: number;
  total_prevented?: number;
  total_attempted_theft?: number;
  total_laundered?: number;
  total_financial_impact?: number;
  false_positive_rate?: number;
  false_negatives?: number;
  [key: string]: unknown;
}

interface SimulationParameters {
  [key: string]: unknown;
}

interface ThreatSimulation {
  id: string;
  simulation_id: string;
  scenario_name: string;
  scenario_type: string;
  parameters: SimulationParameters | null;
  results: SimulationResults | null;
  attack_paths: AttackPath[] | null;
  detection_gaps: DetectionGap[] | null;
  suggested_rules: SuggestedRule[] | null;
  confidence_interval: number | null;
  iterations: number | null;
  status: string;
  created_at: string;
}

type SortField = 'detection_rate' | 'created_at';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCENARIO_TYPE_CONFIG: Record<string, { label: string; color: string; badgeClass: string }> = {
  mule_network:     { label: 'Mule Network',     color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30' },
  pix_fraud:        { label: 'PIX Fraud',         color: 'text-orange-400', badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  banking_malware:  { label: 'Banking Malware',   color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30' },
  identity_theft:   { label: 'Identity Theft',    color: 'text-amber-400',  badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  ransomware:       { label: 'Ransomware',        color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30' },
  account_takeover: { label: 'Account Takeover',  color: 'text-orange-400', badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30' },
  supply_chain:     { label: 'Supply Chain',      color: 'text-cyan-400',   badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  phishing:         { label: 'Phishing',          color: 'text-amber-400',  badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
};

const IMPACT_STYLES: Record<string, string> = {
  low:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

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

function getDetectionRate(sim: ThreatSimulation): number {
  if (!sim.results) return 0;
  const r = sim.results;
  if (typeof r.detection_rate === 'number') return r.detection_rate;
  if (typeof r.prevention_rate === 'number') return r.prevention_rate;
  return 0;
}

function getDetectionRateColor(rate: number): string {
  if (rate >= 0.9) return 'text-emerald-400';
  if (rate >= 0.75) return 'text-amber-400';
  if (rate >= 0.5) return 'text-orange-400';
  return 'text-red-400';
}

function getDetectionRateStroke(rate: number): string {
  if (rate >= 0.9) return '#34d399';
  if (rate >= 0.75) return '#fbbf24';
  if (rate >= 0.5) return '#fb923c';
  return '#f87171';
}

function formatParamValue(val: unknown): string {
  if (val === null || val === undefined) return 'N/A';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val % 1 === 0 ? String(val) : val.toFixed(2);
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

/** Pick the primary amounts from the results (attempted / prevented / laundered / impact). */
function getAmountPairs(results: SimulationResults | null): { label: string; value: number }[] {
  if (!results) return [];
  const pairs: { label: string; value: number }[] = [];
  if (typeof results.total_attempted_theft === 'number') pairs.push({ label: 'Attempted', value: results.total_attempted_theft });
  if (typeof results.total_prevented === 'number') pairs.push({ label: 'Prevented', value: results.total_prevented });
  if (typeof results.total_laundered === 'number') pairs.push({ label: 'Laundered', value: results.total_laundered });
  if (typeof results.total_financial_impact === 'number') pairs.push({ label: 'Financial Impact', value: results.total_financial_impact });
  return pairs;
}

/** Return result keys that are NOT the ones we handle specially. */
function getExtraMetrics(results: SimulationResults | null): [string, unknown][] {
  if (!results) return [];
  const skip = new Set([
    'detection_rate', 'prevention_rate', 'total_prevented',
    'total_attempted_theft', 'total_laundered', 'total_financial_impact',
    'false_positive_rate', 'false_negatives',
  ]);
  return Object.entries(results).filter(([k]) => !skip.has(k));
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
// Circular Progress Ring
// ---------------------------------------------------------------------------

const ProgressRing: React.FC<{ rate: number; size?: number; strokeWidth?: number }> = ({
  rate,
  size = 72,
  strokeWidth = 5,
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - rate * circumference;
  const pct = Math.round(rate * 100);
  const stroke = getDetectionRateStroke(rate);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <span className={`absolute text-sm font-bold font-mono ${getDetectionRateColor(rate)}`}>
        {pct}%
      </span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Attack Path Visual
// ---------------------------------------------------------------------------

const AttackPathItem: React.FC<{ attackPath: AttackPath; maxProb: number }> = ({ attackPath, maxProb }) => {
  const stages = attackPath.path.split(/\u2192|->/).map((s) => s.trim());
  const probPct = maxProb > 0 ? (attackPath.probability / maxProb) * 100 : 0;

  return (
    <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3 space-y-2">
      {/* Path stages */}
      <div className="flex items-center gap-1 flex-wrap">
        {stages.map((stage, idx) => (
          <React.Fragment key={idx}>
            <span className="px-2 py-1 rounded-md bg-[#0f1629] border border-[#1e293b] text-[10px] font-mono text-slate-300 whitespace-nowrap">
              {humanizeKey(stage)}
            </span>
            {idx < stages.length - 1 && (
              <ArrowRight size={10} className="text-slate-600 flex-shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
      {/* Probability bar + amount */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <div className="h-2 bg-[#0f1629] rounded-full overflow-hidden border border-[#1e293b]/40">
            <div
              className="h-full rounded-full bg-cyan-500/70 transition-all duration-500"
              style={{ width: `${probPct}%` }}
            />
          </div>
        </div>
        <span className="text-[10px] font-mono text-cyan-400 w-12 text-right">
          {(attackPath.probability * 100).toFixed(0)}%
        </span>
        {typeof attackPath.avg_amount === 'number' && (
          <span className="text-[10px] font-mono text-slate-500">
            avg {formatBRL(attackPath.avg_amount)}
          </span>
        )}
        {typeof attackPath.avg_delay_hours === 'number' && (
          <span className="text-[10px] font-mono text-slate-500">
            ~{attackPath.avg_delay_hours}h delay
          </span>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Simulation Card
// ---------------------------------------------------------------------------

const SimulationCard: React.FC<{ sim: ThreatSimulation }> = ({ sim }) => {
  const [expanded, setExpanded] = useState(false);
  const rate = getDetectionRate(sim);
  const scenarioCfg = SCENARIO_TYPE_CONFIG[sim.scenario_type];
  const amountPairs = getAmountPairs(sim.results);
  const extraMetrics = getExtraMetrics(sim.results);
  const attackPaths = Array.isArray(sim.attack_paths) ? sim.attack_paths : [];
  const detectionGaps = Array.isArray(sim.detection_gaps) ? sim.detection_gaps : [];
  const suggestedRules = Array.isArray(sim.suggested_rules) ? sim.suggested_rules : [];
  const maxProb = attackPaths.length > 0 ? Math.max(...attackPaths.map((p) => p.probability)) : 1;

  const rateLabel = sim.results?.detection_rate != null ? 'Detection Rate' : 'Prevention Rate';

  return (
    <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl overflow-hidden hover:border-slate-600 transition-all duration-200">
      {/* ---- Card Header ---- */}
      <div className="px-5 py-4 border-b border-[#1e293b]/60">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <FlaskConical size={14} className="text-slate-500" />
            <span className="text-[11px] font-mono text-slate-400">{sim.simulation_id}</span>
            <h3 className="text-sm font-semibold text-slate-200">{sim.scenario_name}</h3>
            {scenarioCfg && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${scenarioCfg.badgeClass}`}>
                {scenarioCfg.label}
              </span>
            )}
            {!scenarioCfg && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border bg-slate-500/15 text-slate-400 border-slate-500/30">
                {humanizeKey(sim.scenario_type)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-medium border ${
              sim.status === 'completed'
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                : sim.status === 'running'
                ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                : 'bg-slate-500/15 text-slate-400 border-slate-500/30'
            }`}>
              {humanizeKey(sim.status)}
            </span>
            <div className="flex items-center gap-1 text-slate-600">
              <Clock size={11} />
              <span className="text-[10px] font-mono">{timeAgo(sim.created_at)}</span>
            </div>
          </div>
        </div>
        {/* Iterations + Confidence */}
        <div className="flex items-center gap-4 mt-2">
          <span className="text-[10px] text-slate-500">
            <span className="font-mono text-slate-400">{sim.iterations?.toLocaleString() ?? 'N/A'}</span> iterations
          </span>
          {sim.confidence_interval != null && (
            <span className="text-[10px] text-slate-500">
              CI: <span className="font-mono text-slate-400">{(Number(sim.confidence_interval) * 100).toFixed(0)}%</span>
            </span>
          )}
        </div>
      </div>

      {/* ---- Card Body ---- */}
      <div className="px-5 py-4 space-y-5">
        {/* Key Results: Ring + Amounts + Extra Metrics */}
        <div className="flex items-start gap-6">
          {/* Detection/Prevention Ring */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <ProgressRing rate={rate} size={72} strokeWidth={5} />
            <span className="text-[9px] text-slate-500 uppercase tracking-wider font-medium">{rateLabel}</span>
          </div>

          {/* Amounts */}
          <div className="flex-1 grid grid-cols-2 gap-3">
            {amountPairs.map((pair) => (
              <div key={pair.label} className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg px-3 py-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-0.5">{pair.label}</span>
                <span className="text-sm font-bold font-mono text-slate-200">{formatBRL(pair.value)}</span>
              </div>
            ))}
            {/* Extra metrics */}
            {extraMetrics.map(([key, val]) => (
              <div key={key} className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg px-3 py-2">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-0.5">{humanizeKey(key)}</span>
                <span className="text-[11px] font-mono text-slate-300">{formatParamValue(val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Attack Paths ---- */}
        {attackPaths.length > 0 && (
          <div>
            <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
              <Target size={11} className="text-slate-500" />
              Attack Paths
              <span className="text-[9px] text-slate-600 font-normal">({attackPaths.length})</span>
            </h4>
            <div className="space-y-2">
              {attackPaths.map((ap, idx) => (
                <AttackPathItem key={idx} attackPath={ap} maxProb={maxProb} />
              ))}
            </div>
          </div>
        )}

        {/* ---- Detection Gaps ---- */}
        {detectionGaps.length > 0 && (
          <div>
            <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
              <ShieldAlert size={11} className="text-red-400" />
              Detection Gaps
              <span className="text-[9px] text-slate-600 font-normal">({detectionGaps.length})</span>
            </h4>
            <div className="space-y-2">
              {detectionGaps.map((gap, idx) => {
                const impactStyle = IMPACT_STYLES[gap.impact] || IMPACT_STYLES.medium;
                return (
                  <div key={idx} className="bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-slate-200">{gap.gap}</span>
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${impactStyle}`}>
                        {gap.impact}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">{gap.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ---- Suggested Rules ---- */}
        {suggestedRules.length > 0 && (
          <div>
            <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2 flex items-center gap-1.5">
              <ShieldCheck size={11} className="text-emerald-400" />
              Suggested Rules
              <span className="text-[9px] text-slate-600 font-normal">({suggestedRules.length})</span>
            </h4>
            <div className="space-y-2">
              {suggestedRules.map((rule, idx) => (
                <div key={idx} className="bg-emerald-500/5 border border-emerald-500/20 rounded-lg px-4 py-3">
                  <p className="text-[11px] text-slate-300 leading-relaxed mb-2">{rule.rule}</p>
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-slate-500 uppercase tracking-wider">Confidence</span>
                    <div className="flex-1 h-1.5 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1e293b]/40 max-w-[120px]">
                      <div
                        className="h-full rounded-full bg-emerald-500/70 transition-all duration-500"
                        style={{ width: `${rule.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400">{(rule.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---- Expandable Footer: Parameters & Raw Results ---- */}
      <div className="border-t border-[#1e293b]/40">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between px-5 py-3 text-[10px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <BarChart3 size={11} />
            Simulation Parameters & Raw Results
          </span>
          {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {expanded && (
          <div className="px-5 pb-5 space-y-4">
            {/* Parameters */}
            {sim.parameters && Object.keys(sim.parameters).length > 0 && (
              <div>
                <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Parameters</h4>
                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {Object.entries(sim.parameters).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">{humanizeKey(key)}</span>
                        <span className="text-[11px] font-mono text-slate-300">{formatParamValue(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Raw Results */}
            {sim.results && Object.keys(sim.results).length > 0 && (
              <div>
                <h4 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Raw Results</h4>
                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-4">
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {Object.entries(sim.results).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-500">{humanizeKey(key)}</span>
                        <span className="text-[11px] font-mono text-slate-300">{formatParamValue(val)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ThreatSimulations: React.FC = () => {
  const [simulations, setSimulations] = useState<ThreatSimulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [scenarioTypeFilter, setScenarioTypeFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchSimulations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('financial_threat_simulations')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;

      // Safely parse JSONB fields that may arrive as strings
      const parsed = ((data as ThreatSimulation[]) || []).map((row) => ({
        ...row,
        results: typeof row.results === 'string' ? JSON.parse(row.results) : row.results,
        parameters: typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters,
        attack_paths: typeof row.attack_paths === 'string' ? JSON.parse(row.attack_paths) : row.attack_paths,
        detection_gaps: typeof row.detection_gaps === 'string' ? JSON.parse(row.detection_gaps) : row.detection_gaps,
        suggested_rules: typeof row.suggested_rules === 'string' ? JSON.parse(row.suggested_rules) : row.suggested_rules,
      }));

      setSimulations(parsed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch simulations';
      setError(message);
      console.error('ThreatSimulations fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSimulations();
  }, [fetchSimulations]);

  // ---------------------------------------------------------------------------
  // Derived: unique scenario types
  // ---------------------------------------------------------------------------

  const uniqueScenarioTypes = useMemo(() => {
    const types = new Set(simulations.map((s) => s.scenario_type));
    return Array.from(types).sort();
  }, [simulations]);

  // ---------------------------------------------------------------------------
  // Filtering & Sorting
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = [...simulations];

    if (scenarioTypeFilter !== 'all') {
      result = result.filter((s) => s.scenario_type === scenarioTypeFilter);
    }

    result.sort((a, b) => {
      if (sortField === 'detection_rate') {
        const ra = getDetectionRate(a);
        const rb = getDetectionRate(b);
        return sortDir === 'asc' ? ra - rb : rb - ra;
      }
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [simulations, scenarioTypeFilter, sortField, sortDir]);

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = simulations.length;
    const totalIterations = simulations.reduce((sum, s) => sum + (s.iterations ?? 0), 0);
    const ratesAll = simulations.map(getDetectionRate).filter((r) => r > 0);
    const avgDetectionRate = ratesAll.length > 0
      ? ratesAll.reduce((sum, r) => sum + r, 0) / ratesAll.length
      : 0;
    return { total, totalIterations, avgDetectionRate };
  }, [simulations]);

  // ---------------------------------------------------------------------------
  // Sort toggle
  // ---------------------------------------------------------------------------

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  // ---------------------------------------------------------------------------
  // Render: Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-slate-500" />
        <span className="ml-3 text-sm text-slate-500">Loading threat simulations...</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Error
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertTriangle size={24} className="text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchSimulations}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0f1629] border border-[#1e293b] text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={12} />
          Retry
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: Main
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Section Title */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FlaskConical size={18} className="text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Threat Simulations</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">Monte Carlo simulation results for financial threat scenarios</p>
          </div>
        </div>
        <button
          onClick={fetchSimulations}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0f1629] border border-[#1e293b] text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={12} />
          Refresh
        </button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          label="Total Simulations"
          value={stats.total}
          sub="completed scenarios"
          icon={<FlaskConical size={14} className="text-cyan-400" />}
          valueClass="text-cyan-400"
        />
        <StatCard
          label="Total Iterations"
          value={formatCompact(stats.totalIterations)}
          sub={`${stats.totalIterations.toLocaleString()} total runs`}
          icon={<Activity size={14} className="text-slate-400" />}
        />
        <StatCard
          label="Avg Detection Rate"
          value={`${(stats.avgDetectionRate * 100).toFixed(1)}%`}
          sub="across all simulations"
          icon={<Shield size={14} className="text-emerald-400" />}
          valueClass={getDetectionRateColor(stats.avgDetectionRate)}
        />
      </div>

      {/* Filters + Sort Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Filter size={12} className="text-slate-500" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider">Scenario Type:</span>
            <select
              value={scenarioTypeFilter}
              onChange={(e) => setScenarioTypeFilter(e.target.value)}
              className="px-2.5 py-1 text-[11px] font-mono bg-[#0a0e1a] text-slate-300 border border-[#1e293b] rounded-md focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
            >
              <option value="all">All Types</option>
              {uniqueScenarioTypes.map((type) => (
                <option key={type} value={type}>
                  {SCENARIO_TYPE_CONFIG[type]?.label || humanizeKey(type)}
                </option>
              ))}
            </select>
          </div>
          {scenarioTypeFilter !== 'all' && (
            <button
              onClick={() => setScenarioTypeFilter('all')}
              className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X size={10} />
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-600">Sort by:</span>
          <button
            onClick={() => toggleSort('created_at')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] font-medium transition-colors ${
              sortField === 'created_at'
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-[#0f1629] border-[#1e293b] text-slate-500 hover:text-slate-300'
            }`}
          >
            <Clock size={10} />
            Date
            {sortField === 'created_at' && (
              sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
            )}
          </button>
          <button
            onClick={() => toggleSort('detection_rate')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] font-medium transition-colors ${
              sortField === 'detection_rate'
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-[#0f1629] border-[#1e293b] text-slate-500 hover:text-slate-300'
            }`}
          >
            <Zap size={10} />
            Detection Rate
            {sortField === 'detection_rate' && (
              sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
            )}
          </button>
        </div>
      </div>

      {/* Results Count */}
      <p className="text-[11px] text-slate-500">
        <span className="font-mono text-slate-400">{filtered.length}</span> simulation{filtered.length !== 1 ? 's' : ''}
        {scenarioTypeFilter !== 'all' && <span> (filtered)</span>}
      </p>

      {/* Simulation Cards Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0b0f1e] border border-[#1e293b] rounded-xl">
          <FlaskConical size={28} className="text-slate-700 mb-3" />
          <p className="text-[12px] text-slate-500">No simulations match the current filters</p>
          {scenarioTypeFilter !== 'all' && (
            <button
              onClick={() => setScenarioTypeFilter('all')}
              className="mt-2 text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map((sim) => (
            <SimulationCard key={sim.id} sim={sim} />
          ))}
        </div>
      )}
    </div>
  );
};

export default ThreatSimulations;
