import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Users,
  Search,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  AlertTriangle,
  Skull,
  Fingerprint,
  MapPin,
  Clock,
  Activity,
  Filter,
  ArrowUpDown,
  RefreshCw,
  Loader2,
  UserCheck,
  Bot,
  Building2,
  User,
  Smartphone,
  Monitor,
  Globe,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DeviceFingerprint {
  device_id: string;
  device_type: string;
  os: string;
  browser: string;
  trust_score: number;
  last_seen: string;
}

interface GeoPattern {
  primary_city: string;
  primary_country: string;
  impossible_travel_incidents: number;
  recent_locations: string[];
}

interface BehavioralBaseline {
  avg_transaction_amount: number;
  transaction_frequency: string;
  primary_hours: string;
  avg_session_duration_min: number;
}

interface AnomalyFlag {
  id: string;
  flag_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
  detected_at: string;
}

interface IdentityProfile {
  id: string;
  entity_id: string;
  name: string;
  entity_type: 'person' | 'business' | 'api_integration';
  trust_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  identity_status: 'verified' | 'suspicious' | 'compromised' | 'synthetic' | 'mule';
  behavioral_baseline: BehavioralBaseline | null;
  device_fingerprints: DeviceFingerprint[] | null;
  geo_patterns: GeoPattern | null;
  anomaly_flags: AnomalyFlag[] | null;
  last_activity: string;
  created_at: string;
  updated_at: string;
}

type SortDirection = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  verified: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  suspicious: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  compromised: 'bg-red-500/15 text-red-400 border-red-500/30',
  synthetic: 'bg-red-500/15 text-red-400 border-red-500/30',
  mule: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const ENTITY_TYPE_CONFIG: Record<string, { icon: typeof User; label: string; className: string }> = {
  person: { icon: User, label: 'Person', className: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30' },
  business: { icon: Building2, label: 'Business', className: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  api_integration: { icon: Bot, label: 'API', className: 'bg-slate-500/15 text-slate-400 border-slate-500/30' },
};

const TRUST_SCORE_RANGES = [
  { label: '0-20', min: 0, max: 20, color: 'bg-red-500', textColor: 'text-red-400' },
  { label: '20-40', min: 20, max: 40, color: 'bg-orange-500', textColor: 'text-orange-400' },
  { label: '40-60', min: 40, max: 60, color: 'bg-amber-500', textColor: 'text-amber-400' },
  { label: '60-80', min: 60, max: 80, color: 'bg-cyan-500', textColor: 'text-cyan-400' },
  { label: '80-100', min: 80, max: 100, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
];

const DEVICE_TYPE_ICONS: Record<string, typeof Smartphone> = {
  mobile: Smartphone,
  desktop: Monitor,
  tablet: Smartphone,
  api: Globe,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return 'Never';
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

function getTrustScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-cyan-400';
  if (score >= 40) return 'text-amber-400';
  if (score >= 20) return 'text-orange-400';
  return 'text-red-400';
}

function getTrustScoreRingColor(score: number): string {
  if (score >= 80) return '#34d399';
  if (score >= 60) return '#22d3ee';
  if (score >= 40) return '#fbbf24';
  if (score >= 20) return '#fb923c';
  return '#f87171';
}

function getTrustScoreTrackColor(score: number): string {
  if (score >= 80) return 'rgba(52, 211, 153, 0.15)';
  if (score >= 60) return 'rgba(34, 211, 238, 0.15)';
  if (score >= 40) return 'rgba(251, 191, 36, 0.15)';
  if (score >= 20) return 'rgba(251, 146, 60, 0.15)';
  return 'rgba(248, 113, 113, 0.15)';
}

function truncateId(id: string, len = 8): string {
  if (!id) return '';
  return id.length > len ? id.slice(0, len) + '...' : id;
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TrustScoreRing: React.FC<{ score: number; size?: number }> = ({ score, size = 40 }) => {
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getTrustScoreTrackColor(score)}
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getTrustScoreRingColor(score)}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <span
        className={`absolute text-[10px] font-bold font-mono ${getTrustScoreColor(score)}`}
      >
        {score}
      </span>
    </div>
  );
};

const SeverityBadge: React.FC<{ severity: string }> = ({ severity }) => {
  const styles: Record<string, string> = {
    low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
    high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  };

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono border ${styles[severity] || styles.low}`}
    >
      {severity}
    </span>
  );
};

// ---------------------------------------------------------------------------
// Expanded Row Detail
// ---------------------------------------------------------------------------

const RowDetail: React.FC<{ profile: IdentityProfile }> = ({ profile }) => {
  const baseline = profile.behavioral_baseline;
  const devices = profile.device_fingerprints || [];
  const geo = profile.geo_patterns;
  const anomalies = profile.anomaly_flags || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 p-4 bg-[#080c16] border-t border-[#1e293b]">
      {/* Behavioral Baseline */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Activity className="w-3 h-3" />
          Behavioral Baseline
        </h4>
        {baseline ? (
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-slate-500 block">Avg Tx Amount</span>
              <span className="text-xs text-slate-200 font-mono">
                {formatCurrency(baseline.avg_transaction_amount)}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Frequency</span>
              <span className="text-xs text-slate-200 font-mono">
                {baseline.transaction_frequency || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Primary Hours</span>
              <span className="text-xs text-slate-200 font-mono">
                {baseline.primary_hours || 'N/A'}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block">Avg Session</span>
              <span className="text-xs text-slate-200 font-mono">
                {baseline.avg_session_duration_min != null
                  ? `${baseline.avg_session_duration_min}m`
                  : 'N/A'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No baseline data available</p>
        )}
      </div>

      {/* Device Fingerprints */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Fingerprint className="w-3 h-3" />
          Device Fingerprints
          {devices.length > 0 && (
            <span className="text-[10px] text-slate-500 font-normal">({devices.length})</span>
          )}
        </h4>
        {devices.length > 0 ? (
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {devices.map((device, idx) => {
              const DeviceIcon = DEVICE_TYPE_ICONS[device.device_type] || Monitor;
              return (
                <div
                  key={device.device_id || idx}
                  className="flex items-center justify-between bg-[#0a0e1a] rounded px-2 py-1.5 border border-[#1e293b]/50"
                >
                  <div className="flex items-center gap-2">
                    <DeviceIcon className="w-3 h-3 text-slate-500" />
                    <div>
                      <span className="text-[11px] text-slate-300 block">
                        {device.os} / {device.browser}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {truncateId(device.device_id, 12)}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] font-mono font-bold ${getTrustScoreColor(device.trust_score)}`}>
                      {device.trust_score}
                    </span>
                    <span className="text-[10px] text-slate-500 block">{timeAgo(device.last_seen)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No device data available</p>
        )}
      </div>

      {/* Geo Patterns */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <MapPin className="w-3 h-3" />
          Geo Patterns
        </h4>
        {geo ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-slate-500 block">Primary City</span>
                <span className="text-xs text-slate-200 font-mono">
                  {geo.primary_city || 'Unknown'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 block">Country</span>
                <span className="text-xs text-slate-200 font-mono">
                  {geo.primary_country || 'Unknown'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-[10px] text-slate-500 block mb-1">Impossible Travel</span>
              <span
                className={`text-xs font-mono font-bold ${
                  geo.impossible_travel_incidents > 0 ? 'text-red-400' : 'text-emerald-400'
                }`}
              >
                {geo.impossible_travel_incidents} incident{geo.impossible_travel_incidents !== 1 ? 's' : ''}
              </span>
            </div>
            {geo.recent_locations && geo.recent_locations.length > 0 && (
              <div>
                <span className="text-[10px] text-slate-500 block mb-1">Recent Locations</span>
                <div className="flex flex-wrap gap-1">
                  {geo.recent_locations.map((loc, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-700/40 text-slate-400 border border-[#1e293b]/50"
                    >
                      {loc}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No geo data available</p>
        )}
      </div>

      {/* Anomaly Flags */}
      <div className="bg-[#0f1629] rounded-lg border border-[#1e293b] p-3">
        <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <AlertTriangle className="w-3 h-3" />
          Anomaly Flags
          {anomalies.length > 0 && (
            <span className="text-[10px] text-slate-500 font-normal">({anomalies.length})</span>
          )}
        </h4>
        {anomalies.length > 0 ? (
          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {anomalies.map((flag, idx) => (
              <div
                key={flag.id || idx}
                className="bg-[#0a0e1a] rounded px-2 py-1.5 border border-[#1e293b]/50"
              >
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[11px] text-slate-300 font-medium">{flag.flag_type}</span>
                  <SeverityBadge severity={flag.severity} />
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{flag.detail}</p>
                {flag.detected_at && (
                  <span className="text-[9px] text-slate-600 font-mono mt-0.5 block">
                    {timeAgo(flag.detected_at)}
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-500 italic">No anomalies detected</p>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const IdentityTrustScores: React.FC = () => {
  const [profiles, setProfiles] = useState<IdentityProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [riskFilter, setRiskFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // -----------------------------------------------------------------------
  // Data Fetching
  // -----------------------------------------------------------------------

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('financial_identity_profiles')
        .select('*');

      if (fetchError) {
        throw fetchError;
      }

      setProfiles((data as IdentityProfile[]) || []);
    } catch (err: any) {
      console.error('Failed to fetch identity profiles:', err);
      setError(err?.message || 'Failed to load identity profiles');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfiles();
  }, [fetchProfiles]);

  // -----------------------------------------------------------------------
  // Computed data
  // -----------------------------------------------------------------------

  const filteredProfiles = useMemo(() => {
    let result = [...profiles];

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          (p.name && p.name.toLowerCase().includes(q)) ||
          (p.entity_id && p.entity_id.toLowerCase().includes(q))
      );
    }

    // Risk level filter
    if (riskFilter !== 'all') {
      result = result.filter((p) => p.risk_level === riskFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((p) => p.identity_status === statusFilter);
    }

    // Sort by trust score
    result.sort((a, b) => {
      const diff = (a.trust_score ?? 0) - (b.trust_score ?? 0);
      return sortDirection === 'asc' ? diff : -diff;
    });

    return result;
  }, [profiles, searchQuery, riskFilter, statusFilter, sortDirection]);

  const stats = useMemo(() => {
    const total = profiles.length;
    const avgScore =
      total > 0 ? Math.round(profiles.reduce((sum, p) => sum + (p.trust_score ?? 0), 0) / total) : 0;
    const compromised = profiles.filter((p) => p.identity_status === 'compromised').length;
    const synthetic = profiles.filter((p) => p.identity_status === 'synthetic').length;
    return { total, avgScore, compromised, synthetic };
  }, [profiles]);

  const trustDistribution = useMemo(() => {
    const counts = TRUST_SCORE_RANGES.map((range) => ({
      ...range,
      count: profiles.filter((p) => {
        const s = p.trust_score ?? 0;
        return s >= range.min && (range.max === 100 ? s <= range.max : s < range.max);
      }).length,
    }));
    const maxCount = Math.max(...counts.map((c) => c.count), 1);
    return counts.map((c) => ({ ...c, pct: (c.count / maxCount) * 100 }));
  }, [profiles]);

  // -----------------------------------------------------------------------
  // Render helpers
  // -----------------------------------------------------------------------

  const renderStatusBadge = (status: string) => {
    const statusStyle = STATUS_STYLES[status] || STATUS_STYLES.verified;
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium font-mono border ${statusStyle}`}
      >
        {status === 'synthetic' && <Skull className="w-2.5 h-2.5" />}
        {status === 'verified' && <ShieldCheck className="w-2.5 h-2.5" />}
        {status}
      </span>
    );
  };

  const renderEntityTypeBadge = (type: string) => {
    const config = ENTITY_TYPE_CONFIG[type] || ENTITY_TYPE_CONFIG.person;
    const Icon = config.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${config.className}`}
      >
        <Icon className="w-2.5 h-2.5" />
        {config.label}
      </span>
    );
  };

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-[#0a0e1a] rounded-xl border border-[#1e293b]">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin mb-3" />
        <p className="text-sm text-slate-400">Loading identity profiles...</p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Error state
  // -----------------------------------------------------------------------

  if (error) {
    return (
      <div className="min-h-[400px] flex flex-col items-center justify-center bg-[#0a0e1a] rounded-xl border border-[#1e293b]">
        <ShieldAlert className="w-8 h-8 text-red-400 mb-3" />
        <p className="text-sm text-red-400 mb-1">Failed to load identity profiles</p>
        <p className="text-xs text-slate-500 mb-4">{error}</p>
        <button
          onClick={fetchProfiles}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-[#0f1629] border border-[#1e293b] rounded-lg hover:bg-[#141c32] transition-all duration-200"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Top Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Total Identities */}
        <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4 transition-all duration-200 hover:border-slate-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Total Identities
            </span>
            <Users className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-2xl font-bold text-slate-100 font-mono">{stats.total}</p>
          <p className="text-[10px] text-slate-500 mt-1">Monitored profiles</p>
        </div>

        {/* Average Trust Score */}
        <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4 transition-all duration-200 hover:border-slate-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Avg Trust Score
            </span>
            <Shield className="w-4 h-4 text-slate-500" />
          </div>
          <p className={`text-2xl font-bold font-mono ${getTrustScoreColor(stats.avgScore)}`}>
            {stats.avgScore}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Across all profiles</p>
        </div>

        {/* Compromised Accounts */}
        <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4 transition-all duration-200 hover:border-slate-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Compromised
            </span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <p className={`text-2xl font-bold font-mono ${stats.compromised > 0 ? 'text-red-400' : 'text-slate-100'}`}>
            {stats.compromised}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Compromised accounts</p>
        </div>

        {/* Synthetic Identities */}
        <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4 transition-all duration-200 hover:border-slate-600">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Synthetic IDs
            </span>
            <Skull className="w-4 h-4 text-red-400" />
          </div>
          <p className={`text-2xl font-bold font-mono ${stats.synthetic > 0 ? 'text-red-400' : 'text-slate-100'}`}>
            {stats.synthetic}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Synthetic identities</p>
        </div>
      </div>

      {/* Trust Score Distribution */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4">
        <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3 flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-slate-500" />
          Trust Score Distribution
        </h3>
        {profiles.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic text-center py-4">No data available</p>
        ) : (
          <div className="space-y-2">
            {trustDistribution.map((range) => (
              <div key={range.label} className="flex items-center gap-3">
                <span className={`text-[11px] font-mono w-12 text-right ${range.textColor}`}>
                  {range.label}
                </span>
                <div className="flex-1 h-5 bg-[#0a0e1a] rounded-sm overflow-hidden border border-[#1e293b]/50">
                  <div
                    className={`h-full ${range.color} rounded-sm transition-all duration-500`}
                    style={{ width: `${range.pct}%`, opacity: 0.7 }}
                  />
                </div>
                <span className="text-[11px] font-mono text-slate-400 w-8 text-right">
                  {range.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search & Filters */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 w-full">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Search by name or entity ID..."
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
                showFilters
                  ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  : 'bg-[#0a0e1a] text-slate-400 border-[#1e293b] hover:border-slate-600'
              }`}
            >
              <Filter className="w-3 h-3" />
              Filters
            </button>

            {/* Sort toggle */}
            <button
              onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-400 bg-[#0a0e1a] border border-[#1e293b] rounded-lg hover:border-slate-600 transition-all duration-200"
            >
              <ArrowUpDown className="w-3 h-3" />
              Score {sortDirection === 'asc' ? 'Low-High' : 'High-Low'}
            </button>

            {/* Refresh */}
            <button
              onClick={fetchProfiles}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-slate-400 bg-[#0a0e1a] border border-[#1e293b] rounded-lg hover:border-slate-600 transition-all duration-200"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Expanded filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-[#1e293b]/50">
            {/* Risk level filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase">Risk:</span>
              {['all', 'low', 'medium', 'high', 'critical'].map((level) => (
                <button
                  key={level}
                  onClick={() => setRiskFilter(level)}
                  className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-all duration-200 ${
                    riskFilter === level
                      ? level === 'all'
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                        : RISK_STYLES[level]
                      : 'bg-[#0a0e1a] text-slate-500 border-[#1e293b] hover:border-slate-600'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase">Status:</span>
              {['all', 'verified', 'suspicious', 'compromised', 'synthetic', 'mule'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-2 py-0.5 text-[10px] rounded border font-mono transition-all duration-200 ${
                    statusFilter === status
                      ? status === 'all'
                        ? 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30'
                        : STATUS_STYLES[status] || ''
                      : 'bg-[#0a0e1a] text-slate-500 border-[#1e293b] hover:border-slate-600'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Identity Profiles Table */}
      <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl overflow-hidden">
        {/* Header */}
        <div className="px-4 py-2.5 border-b border-[#1e293b] flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5 text-slate-500" />
            Identity Profiles
          </h3>
          <span className="text-[10px] text-slate-500 font-mono">
            {filteredProfiles.length} of {profiles.length} profiles
          </span>
        </div>

        {/* Empty state */}
        {filteredProfiles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Users className="w-10 h-10 text-slate-700 mb-3" />
            <p className="text-sm text-slate-500 mb-1">
              {profiles.length === 0 ? 'No identity profiles found' : 'No profiles match your filters'}
            </p>
            <p className="text-[11px] text-slate-600">
              {profiles.length === 0
                ? 'Identity profiles will appear once data is available.'
                : 'Try adjusting your search or filter criteria.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Table Header */}
            <div className="grid grid-cols-[1fr_90px_70px_80px_100px_70px_80px] gap-2 px-4 py-2 border-b border-[#1e293b]/50 bg-[#0a0e1a]/50 min-w-[700px]">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Entity
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Type
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium text-center">
                Trust
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Risk
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
                Status
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium text-center">
                Alerts
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium text-right">
                Last Active
              </span>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-[#1e293b]/30 min-w-[700px]">
              {filteredProfiles.map((profile) => {
                const isExpanded = expandedId === profile.id;
                const anomalyCount = (profile.anomaly_flags || []).length;

                return (
                  <React.Fragment key={profile.id}>
                    <div
                      className={`grid grid-cols-[1fr_90px_70px_80px_100px_70px_80px] gap-2 px-4 py-2.5 items-center cursor-pointer transition-all duration-200 hover:bg-[#141c32] ${
                        isExpanded ? 'bg-[#0d1425]' : ''
                      }`}
                      onClick={() => setExpandedId(isExpanded ? null : profile.id)}
                    >
                      {/* Entity */}
                      <div className="flex items-center gap-2 min-w-0">
                        <ChevronRight
                          className={`w-3 h-3 text-slate-600 shrink-0 transition-transform duration-200 ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-200 font-medium truncate">
                            {profile.name || 'Unknown'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-mono truncate">
                            {truncateId(profile.entity_id, 16)}
                          </p>
                        </div>
                      </div>

                      {/* Type */}
                      <div>{renderEntityTypeBadge(profile.entity_type)}</div>

                      {/* Trust Score */}
                      <div className="flex justify-center">
                        <TrustScoreRing score={profile.trust_score ?? 0} size={36} />
                      </div>

                      {/* Risk Level */}
                      <div>
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono border ${
                            RISK_STYLES[profile.risk_level] || RISK_STYLES.low
                          }`}
                        >
                          {profile.risk_level}
                        </span>
                      </div>

                      {/* Status */}
                      <div>{renderStatusBadge(profile.identity_status)}</div>

                      {/* Active Anomalies */}
                      <div className="text-center">
                        <span
                          className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold font-mono ${
                            anomalyCount === 0
                              ? 'bg-slate-700/30 text-slate-500'
                              : anomalyCount <= 2
                              ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/15 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {anomalyCount}
                        </span>
                      </div>

                      {/* Last Activity */}
                      <div className="text-right">
                        <span className="text-[11px] text-slate-400 font-mono flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3 text-slate-600" />
                          {timeAgo(profile.last_activity)}
                        </span>
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && <RowDetail profile={profile} />}
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

export default IdentityTrustScores;
