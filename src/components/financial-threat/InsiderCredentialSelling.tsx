import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Shield,
  AlertTriangle,
  Eye,
  UserX,
  Key,
  Globe,
  DollarSign,
  Clock,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  Fingerprint,
  CreditCard,
  Skull,
  Star,
  ShieldAlert,
  FileWarning,
  Activity,
  RefreshCw,
  Brain,
  TrendingUp,
  Zap,
  Target,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type {
  CredentialSellingCase,
  DarkWebHit,
  BehavioralFingerprint,
  HandoffEvent,
  FinancialIndicator,
  MultiOperatorEvidence,
  NetworkConnection,
  PsychologicalAssessment,
} from './InsiderCredentialTypes';
import CredentialSellingGraph from './CredentialSellingGraph';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ACCOUNT_TYPE_STYLES: Record<string, string> = {
  banking: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  api_key: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  internal_access: 'bg-red-500/15 text-red-400 border-red-500/30',
  vpn: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  email: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  monitoring: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  suspected: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  confirmed: 'bg-red-500/15 text-red-400 border-red-500/30',
  neutralized: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  false_positive: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const RISK_STYLES: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const MOUSE_PATTERN_COLORS: Record<string, string> = {
  organic: 'text-emerald-400',
  'semi-organic': 'text-amber-400',
  scripted: 'text-orange-400',
  bot: 'text-red-400',
};

const TIMELINE_COLORS: Record<string, { dot: string; line: string }> = {
  dark_web: { dot: 'bg-red-500', line: 'border-red-500/30' },
  handoff: { dot: 'bg-orange-500', line: 'border-orange-500/30' },
  credential_rotation: { dot: 'bg-amber-500', line: 'border-amber-500/30' },
  detection: { dot: 'bg-cyan-500', line: 'border-cyan-500/30' },
};

const MARKETPLACE_COLORS: Record<string, string> = {
  BreachForums: 'bg-red-500/15 text-red-400 border-red-500/30',
  'Telegram Channel': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'Russian Forum': 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  Genesis: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  '2easy': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
};

const LISTING_TYPE_STYLES: Record<string, string> = {
  banking_credentials: 'bg-red-500/15 text-red-400 border-red-500/30',
  api_key: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  vpn_access: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  internal_system: 'bg-red-500/15 text-red-400 border-red-500/30',
  full_identity: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const FRESHNESS_STYLES: Record<string, string> = {
  current: 'bg-red-500/15 text-red-400 border-red-500/30',
  recent: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  stale: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  unknown: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const CONFIDENCE_RANGES = [
  { label: '0-25', min: 0, max: 25, color: 'bg-emerald-500', textColor: 'text-emerald-400' },
  { label: '25-50', min: 25, max: 50, color: 'bg-amber-500', textColor: 'text-amber-400' },
  { label: '50-75', min: 50, max: 75, color: 'bg-orange-500', textColor: 'text-orange-400' },
  { label: '75-100', min: 75, max: 100, color: 'bg-red-500', textColor: 'text-red-400' },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonField<T>(val: unknown): T | null {
  if (val == null) return null;
  if (typeof val === 'string') {
    try { return JSON.parse(val) as T; } catch { return null; }
  }
  return val as T;
}

function ensureArray<T>(val: unknown): T[] {
  const parsed = parseJsonField<T[]>(val);
  return Array.isArray(parsed) ? parsed : [];
}

function timeAgo(dt: string | null | undefined): string {
  if (!dt) return 'Never';
  const diff = Date.now() - new Date(dt).getTime();
  if (diff < 0) return 'Just now';
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

function fmtDate(dt: string | null | undefined): string {
  if (!dt) return '--';
  return new Date(dt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtCurrency(val: number | null | undefined, currency = 'USD'): string {
  if (val == null) return '$0';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(val);
}

function getConfidenceColor(c: number): string {
  if (c >= 75) return '#f87171';
  if (c >= 50) return '#fb923c';
  if (c >= 25) return '#fbbf24';
  return '#34d399';
}

function getConfidenceTrack(c: number): string {
  if (c >= 75) return 'rgba(248,113,113,0.15)';
  if (c >= 50) return 'rgba(251,146,60,0.15)';
  if (c >= 25) return 'rgba(251,191,36,0.15)';
  return 'rgba(52,211,153,0.15)';
}

function getTimelineCategory(event: string): string {
  const e = event.toLowerCase();
  if (e.includes('dark_web') || e.includes('listing') || e.includes('telegram')) return 'dark_web';
  if (e.includes('handoff') || e.includes('buyer') || e.includes('external') || e.includes('owner')) return 'handoff';
  if (e.includes('rotation') || e.includes('password') || e.includes('credential') || e.includes('api_key')) return 'credential_rotation';
  return 'detection';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const ConfidenceRing: React.FC<{ value: number; size?: number }> = ({ value, size = 44 }) => {
  const sw = 3.5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (value / 100) * circ;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={getConfidenceTrack(value)} strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={getConfidenceColor(value)} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono" style={{ color: getConfidenceColor(value) }}>{value}%</span>
    </div>
  );
};

const Badge: React.FC<{ text: string; styles?: string }> = ({ text, styles }) => (
  <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium font-mono border ${styles || 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
    {text}
  </span>
);

// ---------------------------------------------------------------------------
// Operator Profile Card
// ---------------------------------------------------------------------------

const OperatorCard: React.FC<{ fp: BehavioralFingerprint; isOriginal: boolean }> = ({ fp, isOriginal }) => {
  const borderColor = isOriginal ? 'border-emerald-500/50' : 'border-red-500/50';
  const labelColor = isOriginal ? 'text-emerald-400' : 'text-red-400';
  const maxWpm = 120;
  const maxClick = 4;

  return (
    <div className={`bg-[#080c16] border ${borderColor} rounded-lg p-3 min-w-[200px]`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Fingerprint size={12} className={labelColor} />
          <span className={`text-[11px] font-bold font-mono ${labelColor}`}>{fp.operator_id}</span>
        </div>
        <span className="text-[10px] text-slate-400">{fp.label}</span>
      </div>

      <div className="space-y-1.5">
        <div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Typing</span>
            <span className="text-slate-300 font-mono">{fp.typing_wpm} WPM</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full mt-0.5 overflow-hidden">
            <div className="h-full bg-cyan-500/60 rounded-full transition-all" style={{ width: `${Math.min((fp.typing_wpm / maxWpm) * 100, 100)}%` }} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">Click Vel.</span>
            <span className="text-slate-300 font-mono">{fp.click_velocity}</span>
          </div>
          <div className="h-1 bg-slate-800 rounded-full mt-0.5 overflow-hidden">
            <div className="h-full bg-amber-500/60 rounded-full transition-all" style={{ width: `${Math.min((fp.click_velocity / maxClick) * 100, 100)}%` }} />
          </div>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Mouse</span>
          <span className={`font-mono ${MOUSE_PATTERN_COLORS[fp.mouse_pattern] || 'text-slate-400'}`}>{fp.mouse_pattern}</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Hours</span>
          <span className="text-slate-300 font-mono">{fp.active_hours[0]}:00 - {fp.active_hours[1]}:00</span>
        </div>

        <div className="flex items-center justify-between text-[10px]">
          <span className="text-slate-500">Sessions (30d)</span>
          <span className="text-slate-300 font-mono">{fp.sessions_last_30d}</span>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Handoff Timeline
// ---------------------------------------------------------------------------

const HandoffTimeline: React.FC<{ events: HandoffEvent[] }> = ({ events }) => (
  <div className="relative pl-5 space-y-3">
    {events.map((ev, i) => {
      const cat = getTimelineCategory(ev.event);
      const colors = TIMELINE_COLORS[cat] || TIMELINE_COLORS.detection;
      return (
        <div key={i} className="relative">
          <div className={`absolute -left-5 top-1 w-2.5 h-2.5 rounded-full ${colors.dot} ring-2 ring-[#0f1629]`} />
          {i < events.length - 1 && <div className={`absolute -left-[14px] top-4 w-px h-[calc(100%+8px)] border-l ${colors.line}`} />}
          <div>
            <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-0.5">
              <Clock size={10} />
              <span>{fmtDate(ev.timestamp)}</span>
            </div>
            <p className="text-[11px] font-semibold text-slate-200 capitalize">{ev.event.replace(/_/g, ' ')}</p>
            <p className="text-[10px] text-slate-400 leading-relaxed mt-0.5">{ev.detail}</p>
          </div>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Financial Indicators
// ---------------------------------------------------------------------------

const FinancialIndicators: React.FC<{ items: FinancialIndicator[] }> = ({ items }) => (
  <div className="space-y-2">
    {items.map((fi, i) => {
      const Icon = fi.type === 'crypto_receipt' ? Key : fi.type === 'pix_incoming' ? CreditCard : DollarSign;
      const amount = fi.amount_usd ? fmtCurrency(fi.amount_usd, 'USD') : fi.amount_brl ? fmtCurrency(fi.amount_brl, 'BRL') : '--';
      return (
        <div key={i} className="flex items-start gap-2.5 bg-[#080c16] rounded-lg p-2.5 border border-[#1e293b]">
          <div className="mt-0.5"><Icon size={14} className="text-amber-400" /></div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-[10px]">
              <Badge text={fi.type.replace(/_/g, ' ')} styles="bg-amber-500/15 text-amber-400 border-amber-500/30" />
              <span className="font-mono font-bold text-slate-200">{amount}</span>
              <span className="text-slate-500 ml-auto">{fmtDate(fi.timestamp)}</span>
            </div>
            {fi.source && <p className="text-[10px] text-slate-500 mt-0.5">Source: <span className="font-mono text-slate-400">{fi.source}</span></p>}
            <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{fi.detail}</p>
          </div>
        </div>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Typing Fingerprint Panel
// ---------------------------------------------------------------------------

interface TypingOperator {
  operator_id: string;
  label: string;
  keystrokes_analyzed: number;
  sessions_analyzed: number;
  metrics: Record<string, number>;
  digraph_signature?: Record<string, number>;
  emotional_inference?: {
    baseline_stress?: number | null;
    current_stress?: number;
    stress_trend?: string;
    anxiety_markers?: number;
    confidence_in_typing?: number;
    coaching_indicators?: number;
    emotional_state?: string;
    detail?: string;
  };
  temporal_drift?: {
    wpm_30d_trend?: number[];
    error_rate_30d_trend?: number[];
    rhythm_30d_trend?: number[];
    interpretation?: string;
  };
}

interface SimilarityEntry {
  similarity: number;
  confidence: number;
  verdict: string;
  key_differences: string[];
}

interface TypingBiometrics {
  analysis_version?: string;
  total_keystrokes_analyzed?: number;
  analysis_period_days?: number;
  operators?: TypingOperator[];
  cross_operator_similarity_matrix?: Record<string, SimilarityEntry>;
  aggregate_insights?: {
    multi_operator_confirmed?: boolean;
    distinct_operators?: number;
    detection_confidence?: number;
    primary_evidence?: string;
    psychological_insight?: string;
  };
}

const EMOTION_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  cold_and_detached: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  calculated_professional: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  confident_and_practiced: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30' },
  professional_and_practiced: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  experienced_operator: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/30' },
  mildly_anxious: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  cautious_and_methodical: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/30' },
  stressed_and_conflicted: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  rushed_and_unfamiliar: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30' },
  coached_and_uncertain: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
  heavily_coached: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30' },
};

const Sparkline: React.FC<{ data: number[]; color: string; height?: number; width?: number }> = ({ data, color, height = 24, width = 100 }) => {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={width} height={height} className="shrink-0">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={(data.length - 1) / (data.length - 1) * width} cy={height - ((data[data.length - 1] - min) / range) * (height - 4) - 2} r="2" fill={color} />
    </svg>
  );
};

const TypingFingerprintPanel: React.FC<{ biometrics: TypingBiometrics | null }> = ({ biometrics }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!biometrics || !biometrics.operators || biometrics.operators.length === 0) return null;

  const { operators, cross_operator_similarity_matrix: simMatrix, aggregate_insights: insights } = biometrics;

  const metricLabels: { key: string; label: string; unit: string; higherIsBad?: boolean }[] = [
    { key: 'avg_wpm', label: 'WPM', unit: '', higherIsBad: false },
    { key: 'avg_dwell_time_ms', label: 'Key Dwell', unit: 'ms', higherIsBad: false },
    { key: 'avg_flight_time_ms', label: 'Flight Time', unit: 'ms', higherIsBad: false },
    { key: 'key_hold_consistency', label: 'Hold Consistency', unit: '', higherIsBad: false },
    { key: 'rhythm_regularity', label: 'Rhythm', unit: '', higherIsBad: false },
    { key: 'error_rate_pct', label: 'Error Rate', unit: '%', higherIsBad: true },
    { key: 'pause_frequency_per_min', label: 'Pauses/min', unit: '', higherIsBad: true },
    { key: 'burst_typing_ratio', label: 'Burst Ratio', unit: '', higherIsBad: false },
  ];

  const getMaxForMetric = (key: string) => {
    const vals = operators.map(op => op.metrics[key] || 0);
    return Math.max(...vals, 1);
  };

  const operatorColors = ['#22d3ee', '#f97316', '#f43f5e', '#a3e635'];

  return (
    <div className="bg-gradient-to-br from-[#0a1628] to-[#0f1629] border border-cyan-500/20 rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0b0f1e] flex items-center justify-center border border-cyan-500/30">
            <Fingerprint size={16} className="text-cyan-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-100">Keystroke Dynamics Analysis</h4>
            <p className="text-[10px] text-slate-500">
              {(biometrics.total_keystrokes_analyzed || 0).toLocaleString()} keystrokes analyzed over {biometrics.analysis_period_days || 0} days
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {insights?.multi_operator_confirmed && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
              {insights.distinct_operators} DISTINCT OPERATORS
            </span>
          )}
          {insights?.detection_confidence && (
            <span className="text-[10px] font-mono text-slate-500">{(insights.detection_confidence * 100).toFixed(0)}% conf</span>
          )}
          <button onClick={() => setShowDetails(!showDetails)} className="text-slate-500 hover:text-slate-300 transition-colors">
            {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        </div>
      </div>

      {/* Operator Comparison Bars */}
      <div>
        <div className="flex items-center gap-4 mb-3">
          {operators.map((op, i) => (
            <div key={op.operator_id} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: operatorColors[i] || '#94a3b8' }} />
              <span className="text-[10px] text-slate-400">{op.label}</span>
              <span className="text-[9px] font-mono text-slate-600">({op.keystrokes_analyzed?.toLocaleString()} keys)</span>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          {metricLabels.map(ml => {
            const maxVal = getMaxForMetric(ml.key);
            return (
              <div key={ml.key} className="flex items-center gap-2">
                <span className="text-[9px] text-slate-500 w-24 text-right shrink-0">{ml.label}</span>
                <div className="flex-1 flex items-center gap-1">
                  {operators.map((op, i) => {
                    const val = op.metrics[ml.key] || 0;
                    const pct = ml.key === 'key_hold_consistency' || ml.key === 'rhythm_regularity' || ml.key === 'burst_typing_ratio'
                      ? val * 100
                      : (val / maxVal) * 100;
                    return (
                      <div key={op.operator_id} className="flex-1">
                        <div className="h-2 bg-slate-800/50 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: operatorColors[i] || '#94a3b8', opacity: 0.8 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="flex gap-1 shrink-0">
                  {operators.map((op, i) => (
                    <span key={op.operator_id} className="text-[8px] font-mono w-8 text-right" style={{ color: operatorColors[i] || '#94a3b8' }}>
                      {ml.key === 'key_hold_consistency' || ml.key === 'rhythm_regularity' || ml.key === 'burst_typing_ratio'
                        ? (op.metrics[ml.key] || 0).toFixed(2)
                        : (op.metrics[ml.key] || 0).toFixed(ml.key.includes('pct') ? 1 : 0)
                      }
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Emotional State + Similarity Matrix (compact row) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Emotional States */}
        <div className="space-y-1.5">
          <h5 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Emotional State Inference</h5>
          {operators.map((op, i) => {
            const em = op.emotional_inference;
            if (!em) return null;
            const emotionKey = em.emotional_state || '';
            const ec = EMOTION_COLORS[emotionKey] || { bg: 'bg-slate-500/10', text: 'text-slate-400', border: 'border-slate-500/30' };
            return (
              <div key={op.operator_id} className={`${ec.bg} border ${ec.border} rounded-lg px-3 py-2`}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: operatorColors[i] }} />
                    <span className="text-[10px] font-semibold text-slate-200">{op.label}</span>
                  </div>
                  <span className={`text-[9px] font-bold uppercase ${ec.text}`}>
                    {emotionKey.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  {em.current_stress != null && (
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-slate-500">Stress</span>
                      <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${em.current_stress >= 0.6 ? 'bg-red-500' : em.current_stress >= 0.3 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                          style={{ width: `${em.current_stress * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-slate-500">{(em.current_stress * 100).toFixed(0)}%</span>
                    </div>
                  )}
                  {em.coaching_indicators != null && em.coaching_indicators > 0.1 && (
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-red-400">Coaching</span>
                      <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-red-500 rounded-full" style={{ width: `${em.coaching_indicators * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-red-400">{(em.coaching_indicators * 100).toFixed(0)}%</span>
                    </div>
                  )}
                  {em.confidence_in_typing != null && (
                    <div className="flex items-center gap-1">
                      <span className="text-[8px] text-slate-500">Confidence</span>
                      <div className="w-10 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${em.confidence_in_typing * 100}%` }} />
                      </div>
                      <span className="text-[8px] font-mono text-slate-500">{(em.confidence_in_typing * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Similarity Matrix */}
        {simMatrix && Object.keys(simMatrix).length > 0 && (
          <div className="space-y-1.5">
            <h5 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Cross-Operator Similarity</h5>
            {Object.entries(simMatrix).map(([pair, entry]) => {
              const sim = entry as SimilarityEntry;
              const verdictColor = sim.verdict === 'DIFFERENT_PERSON' ? 'text-red-400 bg-red-500/10 border-red-500/30' : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
              return (
                <div key={pair} className="bg-[#080c16] border border-[#1e293b] rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-mono text-slate-400">{pair.replace(/_vs_/g, ' vs ')}</span>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border ${verdictColor}`}>
                      {sim.verdict.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[8px] text-slate-500">Similarity</span>
                    <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${sim.similarity < 0.3 ? 'bg-red-500' : sim.similarity < 0.6 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                        style={{ width: `${sim.similarity * 100}%` }} />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-slate-300">{(sim.similarity * 100).toFixed(0)}%</span>
                    <span className="text-[8px] font-mono text-slate-600">({(sim.confidence * 100).toFixed(0)}% conf)</span>
                  </div>
                  {sim.key_differences && showDetails && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {sim.key_differences.map((d, i) => (
                        <span key={i} className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">{d}</span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Expanded: Temporal Drift + Insights */}
      {showDetails && (
        <div className="space-y-4 pt-2 border-t border-[#1e293b]">
          {/* Temporal Drift Sparklines */}
          <div>
            <h5 className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">Temporal Drift (30-day trends)</h5>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {['wpm_30d_trend', 'error_rate_30d_trend', 'rhythm_30d_trend'].map(trendKey => {
                const label = trendKey === 'wpm_30d_trend' ? 'WPM' : trendKey === 'error_rate_30d_trend' ? 'Error Rate %' : 'Rhythm Score';
                return (
                  <div key={trendKey} className="bg-[#080c16] border border-[#1e293b] rounded-lg p-2">
                    <span className="text-[8px] text-slate-500 uppercase">{label}</span>
                    <div className="flex items-end gap-2 mt-1">
                      {operators.map((op, i) => {
                        const drift = op.temporal_drift;
                        const data = drift ? (drift as Record<string, number[]>)[trendKey] : null;
                        if (!data || data.length < 2) return null;
                        return (
                          <div key={op.operator_id} className="flex-1 flex flex-col items-center">
                            <Sparkline data={data} color={operatorColors[i]} width={80} height={20} />
                            <span className="text-[7px] mt-0.5" style={{ color: operatorColors[i] }}>{op.operator_id}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Operator Emotional Details */}
          {operators.map((op, i) => {
            const em = op.emotional_inference;
            const drift = op.temporal_drift;
            if (!em?.detail && !drift?.interpretation) return null;
            return (
              <div key={op.operator_id} className="bg-[#080c16] border border-[#1e293b] rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: operatorColors[i] }} />
                  <span className="text-[10px] font-semibold text-slate-200">{op.label}</span>
                </div>
                {em?.detail && <p className="text-[10px] text-slate-400 leading-relaxed">{em.detail}</p>}
                {drift?.interpretation && <p className="text-[10px] text-slate-500 leading-relaxed mt-1 italic">{drift.interpretation}</p>}
              </div>
            );
          })}

          {/* Aggregate Insight */}
          {insights?.psychological_insight && (
            <div className="bg-[#080c16] border border-cyan-500/20 rounded-lg p-3">
              <h5 className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Brain size={10} /> Keystroke Psychology Insight
              </h5>
              <p className="text-[10px] text-slate-300 leading-relaxed">{insights.psychological_insight}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Psychological Risk Panel
// ---------------------------------------------------------------------------

const SEVERITY_PSYCH: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  info: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
};

const TRAIT_COLOR = (v: number) => {
  if (v >= 75) return { bar: 'bg-red-500', text: 'text-red-400' };
  if (v >= 50) return { bar: 'bg-orange-500', text: 'text-orange-400' };
  if (v >= 30) return { bar: 'bg-amber-500', text: 'text-amber-400' };
  return { bar: 'bg-emerald-500', text: 'text-emerald-400' };
};

const PsychologicalRiskPanel: React.FC<{ assessment: PsychologicalAssessment | null; entityName: string }> = ({ assessment, entityName }) => {
  const [showNarrative, setShowNarrative] = useState(false);
  const [showPredictive, setShowPredictive] = useState(false);

  if (!assessment || !assessment.risk_score) return null;

  const { personality_profile: pp, behavioral_signals, llm_narrative, predictive_factors, recommended_interventions, cross_platform_patterns, risk_score, risk_label, confidence } = assessment;
  const bigFive = pp?.big_five;
  const darkTriad = pp?.dark_triad;
  const riskIndicators = pp?.risk_indicators;

  const riskColor = risk_score >= 80 ? 'text-red-400' : risk_score >= 60 ? 'text-orange-400' : risk_score >= 40 ? 'text-amber-400' : 'text-emerald-400';
  const riskBg = risk_score >= 80 ? 'from-red-500/10 to-red-900/5 border-red-500/30' : risk_score >= 60 ? 'from-orange-500/10 to-orange-900/5 border-orange-500/30' : risk_score >= 40 ? 'from-amber-500/10 to-amber-900/5 border-amber-500/30' : 'from-emerald-500/10 to-emerald-900/5 border-emerald-500/30';

  const TraitBar = ({ label, value, maxLabel }: { label: string; value: number; maxLabel?: string }) => {
    const c = TRAIT_COLOR(value);
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 w-24 text-right truncate">{label}</span>
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div className={`h-full ${c.bar} rounded-full transition-all duration-500`} style={{ width: `${value}%` }} />
        </div>
        <span className={`text-[10px] font-mono font-bold w-7 ${c.text}`}>{value}</span>
      </div>
    );
  };

  return (
    <div className={`bg-gradient-to-br ${riskBg} border rounded-xl p-4 space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[#0b0f1e] flex items-center justify-center border border-[#1e293b]">
            <Brain size={16} className={riskColor} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-slate-100">LLM Psychological Risk Assessment</h4>
            <p className="text-[10px] text-slate-500">Multi-source behavioral + personality analysis</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className={`text-lg font-bold font-mono ${riskColor}`}>{risk_score}</div>
            <div className="text-[9px] text-slate-500 uppercase tracking-wider">risk score</div>
          </div>
          <div className="text-right">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${risk_score >= 80 ? 'bg-red-500/15 text-red-400 border-red-500/30' : risk_score >= 60 ? 'bg-orange-500/15 text-orange-400 border-orange-500/30' : 'bg-amber-500/15 text-amber-400 border-amber-500/30'}`}>
              {risk_label}
            </span>
            <div className="text-[9px] text-slate-600 mt-0.5 font-mono">{(confidence * 100).toFixed(0)}% conf</div>
          </div>
        </div>
      </div>

      {/* Personality Traits Grid */}
      {(bigFive || darkTriad) && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Big Five */}
          {bigFive && (
            <div className="bg-[#080c16] rounded-lg p-3 border border-[#1e293b]">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Big Five (OCEAN)</h5>
              <div className="space-y-1.5">
                <TraitBar label="Openness" value={bigFive.openness} />
                <TraitBar label="Conscientiousness" value={bigFive.conscientiousness} />
                <TraitBar label="Extraversion" value={bigFive.extraversion} />
                <TraitBar label="Agreeableness" value={bigFive.agreeableness} />
                <TraitBar label="Neuroticism" value={bigFive.neuroticism} />
              </div>
            </div>
          )}

          {/* Dark Triad */}
          {darkTriad && (
            <div className="bg-[#080c16] rounded-lg p-3 border border-[#1e293b]">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Skull size={10} className="text-red-400" /> Dark Triad
              </h5>
              <div className="space-y-1.5">
                <TraitBar label="Narcissism" value={darkTriad.narcissism} />
                <TraitBar label="Machiavellianism" value={darkTriad.machiavellianism} />
                <TraitBar label="Psychopathy" value={darkTriad.psychopathy} />
              </div>
              {(darkTriad.machiavellianism >= 70 || darkTriad.psychopathy >= 60) && (
                <div className="mt-2 flex items-center gap-1 px-2 py-1 rounded bg-red-500/10 border border-red-500/20">
                  <AlertTriangle size={10} className="text-red-400" />
                  <span className="text-[9px] text-red-400 font-bold">Elevated Dark Triad -- High manipulation/deception risk</span>
                </div>
              )}
            </div>
          )}

          {/* Risk Indicators */}
          {riskIndicators && (
            <div className="bg-[#080c16] rounded-lg p-3 border border-[#1e293b]">
              <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Target size={10} className="text-orange-400" /> Risk Indicators
              </h5>
              <div className="space-y-1.5">
                {Object.entries(riskIndicators).map(([key, val]) => (
                  <TraitBar key={key} label={key.replace(/_/g, ' ')} value={val} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Behavioral Signals */}
      {behavioral_signals.length > 0 && (
        <div>
          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <Zap size={10} className="text-cyan-400" /> Behavioral Signals
          </h5>
          <div className="space-y-2">
            {behavioral_signals.map((sig, i) => (
              <div key={i} className="flex items-start gap-2 bg-[#080c16] rounded-lg px-3 py-2 border border-[#1e293b]">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border mt-0.5 shrink-0 ${SEVERITY_PSYCH[sig.severity] || SEVERITY_PSYCH.medium}`}>
                  {sig.severity.toUpperCase()}
                </span>
                <div className="min-w-0">
                  <span className="text-[11px] font-semibold text-slate-200">{sig.signal}</span>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{sig.detail}</p>
                </div>
                <span className="text-[9px] font-mono text-slate-600 shrink-0 mt-0.5">{(sig.confidence * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LLM Narrative */}
      {llm_narrative && (
        <div>
          <button onClick={() => setShowNarrative(!showNarrative)} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 hover:text-slate-200 transition-colors">
            <Brain size={10} className="text-cyan-400" />
            LLM Psychological Narrative
            {showNarrative ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
          </button>
          {showNarrative && (
            <div className="mt-2 bg-[#080c16] rounded-lg p-3 border border-cyan-500/20">
              <p className="text-[11px] text-slate-300 leading-relaxed">{llm_narrative}</p>
              {assessment.assessed_at && (
                <div className="mt-2 flex items-center gap-2 text-[9px] text-slate-600">
                  <Clock size={9} /> Assessed {fmtDate(assessment.assessed_at)}
                  {assessment.model_version && <span className="font-mono">| {assessment.model_version}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Predictive Factors + Cross-Platform */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Predictive Factors */}
        {predictive_factors.length > 0 && (
          <div>
            <button onClick={() => setShowPredictive(!showPredictive)} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 hover:text-slate-200 transition-colors mb-2">
              <TrendingUp size={10} className="text-amber-400" />
              Predictive Factors
              {showPredictive ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
            </button>
            {showPredictive && (
              <div className="space-y-1.5">
                {predictive_factors.map((pf, i) => (
                  <div key={i} className="bg-[#080c16] rounded-lg px-3 py-2 border border-[#1e293b]">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${SEVERITY_PSYCH[pf.level] || SEVERITY_PSYCH.medium}`}>
                        {pf.level.toUpperCase()}
                      </span>
                      <span className="text-[11px] font-semibold text-slate-200">{pf.factor}</span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1">{pf.detail}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Cross-Platform Patterns */}
        {cross_platform_patterns.length > 0 && (
          <div>
            <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
              <Activity size={10} className="text-emerald-400" /> Cross-Platform Correlations
            </h5>
            <div className="space-y-1.5">
              {cross_platform_patterns.map((cp, i) => (
                <div key={i} className="flex items-center gap-2 bg-[#080c16] rounded-lg px-3 py-2 border border-[#1e293b]">
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] text-slate-200">{cp.pattern}</span>
                    <div className="text-[9px] text-slate-500 font-mono">{cp.source}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${cp.correlation >= 0.9 ? 'bg-red-500' : cp.correlation >= 0.7 ? 'bg-orange-500' : 'bg-amber-500'}`} style={{ width: `${cp.correlation * 100}%` }} />
                    </div>
                    <span className="text-[9px] font-mono font-bold text-slate-400">{(cp.correlation * 100).toFixed(0)}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recommended Interventions */}
      {recommended_interventions.length > 0 && (
        <div>
          <h5 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1">
            <ShieldAlert size={10} className="text-red-400" /> Recommended Interventions
          </h5>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
            {recommended_interventions.map((ri, i) => (
              <div key={i} className="flex items-start gap-2 text-[10px] text-slate-300">
                <span className="text-cyan-500 mt-0.5 shrink-0">{i + 1}.</span>
                <span>{ri}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Case Card
// ---------------------------------------------------------------------------

const CaseCard: React.FC<{ c: CredentialSellingCase }> = ({ c }) => {
  const [expanded, setExpanded] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  const fingerprints = ensureArray<BehavioralFingerprint>(c.behavioral_fingerprints);
  const timeline = ensureArray<HandoffEvent>(c.handoff_timeline);
  const financials = ensureArray<FinancialIndicator>(c.financial_indicators);
  const connections = ensureArray<NetworkConnection>(c.network_connections);
  const multiOp = parseJsonField<MultiOperatorEvidence>(c.multi_operator_evidence);

  return (
    <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl overflow-hidden hover:border-[#2a3a5c] transition-colors">
      {/* Header */}
      <button onClick={() => setExpanded(!expanded)} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-1 text-slate-500">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        <span className="text-[11px] font-mono text-slate-500">{c.case_id}</span>
        <span className="text-sm font-semibold text-slate-100">{c.entity_name}</span>

        <Badge text={c.account_type.replace(/_/g, ' ')} styles={ACCOUNT_TYPE_STYLES[c.account_type]} />

        <ConfidenceRing value={c.seller_confidence} size={36} />

        <Badge text={c.risk_tier} styles={RISK_STYLES[c.risk_tier]} />
        <Badge text={c.status} styles={STATUS_STYLES[c.status]} />
        <Badge text={c.detection_method.replace(/_/g, ' ')} styles="bg-slate-500/15 text-slate-400 border-slate-500/30" />

        <span className="ml-auto text-[10px] text-slate-500 flex items-center gap-1">
          <Clock size={10} />
          {timeAgo(c.first_indicator_at)}
        </span>
      </button>

      {/* Expanded Detail */}
      {expanded && (
        <div className="border-t border-[#1e293b] px-4 py-4 space-y-5">

          {/* Multi-Operator Behavioral Analysis */}
          {fingerprints.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-3">
                <Fingerprint size={13} className="text-cyan-400" />
                Multi-Operator Behavioral Analysis
                {multiOp?.behavioral_divergence_score != null && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-mono bg-red-500/15 text-red-400 border border-red-500/30">
                    Divergence: {(multiOp.behavioral_divergence_score * 100).toFixed(0)}%
                  </span>
                )}
                {multiOp && (
                  <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30">
                    {multiOp.total_operators_detected} operators &middot; {multiOp.evidence_strength}
                  </span>
                )}
              </h4>
              <div className="flex gap-3 overflow-x-auto pb-1">
                {fingerprints.map((fp, i) => (
                  <OperatorCard key={fp.operator_id || i} fp={fp} isOriginal={i === 0} />
                ))}
              </div>
            </div>
          )}

          {/* Handoff Timeline */}
          {timeline.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-3">
                <Activity size={13} className="text-cyan-400" />
                Handoff Timeline
              </h4>
              <HandoffTimeline events={timeline} />
            </div>
          )}

          {/* Financial Indicators */}
          {financials.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-3">
                <DollarSign size={13} className="text-amber-400" />
                Financial Indicators
              </h4>
              <FinancialIndicators items={financials} />
            </div>
          )}

          {/* Network Connections */}
          {connections.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-3">
                <Globe size={13} className="text-cyan-400" />
                Network Connections
              </h4>
              <div className="flex flex-wrap gap-2">
                {connections.map((nc, i) => (
                  <div key={i} className="bg-[#080c16] border border-[#1e293b] rounded-lg px-3 py-2 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-slate-300">{nc.entity}</span>
                    <Badge text={nc.type.replace(/_/g, ' ')} />
                    <Badge text={nc.relationship.replace(/_/g, ' ')} />
                    <div className="flex items-center gap-1">
                      <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-cyan-500/60 rounded-full" style={{ width: `${(nc.confidence * 100)}%` }} />
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">{(nc.confidence * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Typing Fingerprint Analysis */}
          <TypingFingerprintPanel biometrics={parseJsonField<TypingBiometrics>(c.typing_biometrics)} />

          {/* Psychological Risk Assessment */}
          <PsychologicalRiskPanel assessment={parseJsonField<PsychologicalAssessment>(c.psychological_assessment)} entityName={c.entity_name} />

          {/* Investigation Notes */}
          {c.investigation_notes && (
            <div>
              <button onClick={() => setShowNotes(!showNotes)} className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 hover:text-slate-100 transition-colors">
                <FileWarning size={13} className="text-amber-400" />
                Investigation Notes
                {showNotes ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
              </button>
              {showNotes && (
                <div className="mt-2 bg-[#0d1117] border border-[#1e293b] rounded-lg p-3 font-mono text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap"
                  style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(30,41,59,0.3) 19px, rgba(30,41,59,0.3) 20px)' }}>
                  {c.investigation_notes}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dark Web Hit Row
// ---------------------------------------------------------------------------

const DarkWebRow: React.FC<{ hit: DarkWebHit }> = ({ hit }) => {
  const [expanded, setExpanded] = useState(false);
  const stars = Math.round(Number(hit.seller_reputation) || 0);
  const mpStyle = MARKETPLACE_COLORS[hit.marketplace] || 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  const ltStyle = LISTING_TYPE_STYLES[hit.listing_type] || 'bg-slate-500/15 text-slate-400 border-slate-500/30';
  const frStyle = FRESHNESS_STYLES[hit.credential_freshness] || FRESHNESS_STYLES.unknown;

  return (
    <>
      <tr onClick={() => setExpanded(!expanded)} className="border-b border-[#1e293b]/50 hover:bg-[#131b33] cursor-pointer transition-colors text-[11px]">
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            {expanded ? <ChevronDown size={12} className="text-slate-500" /> : <ChevronRight size={12} className="text-slate-500" />}
            <span className="font-mono text-slate-400">{hit.hit_id}</span>
          </div>
        </td>
        <td className="px-3 py-2.5"><Badge text={hit.marketplace} styles={mpStyle} /></td>
        <td className="px-3 py-2.5"><Badge text={hit.listing_type.replace(/_/g, ' ')} styles={ltStyle} /></td>
        <td className="px-3 py-2.5 font-mono text-slate-300 text-[10px]">{hit.entity_id}</td>
        <td className="px-3 py-2.5 font-mono font-bold text-slate-200">{fmtCurrency(Number(hit.listing_price), hit.currency)}</td>
        <td className="px-3 py-2.5">
          <div className="flex items-center gap-1">
            <span className="font-mono text-slate-300">{hit.seller_handle}</span>
            <div className="flex">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={8} className={i < stars ? 'text-amber-400 fill-amber-400' : 'text-slate-700'} />)}</div>
          </div>
        </td>
        <td className="px-3 py-2.5"><Badge text={hit.verification_status.replace(/_/g, ' ')} /></td>
        <td className="px-3 py-2.5"><Badge text={hit.credential_freshness} styles={frStyle} /></td>
        <td className="px-3 py-2.5 text-center">{hit.includes_2fa_bypass ? <ShieldAlert size={14} className="text-red-400 mx-auto" /> : <span className="text-slate-600">--</span>}</td>
        <td className="px-3 py-2.5 text-slate-500">{timeAgo(hit.discovered_at)}</td>
      </tr>
      {expanded && (
        <tr className="border-b border-[#1e293b]/50">
          <td colSpan={10} className="px-6 py-4 bg-[#080c16]">
            <div className="space-y-3">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Listing Description</span>
                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">{hit.listing_description || 'No description available.'}</p>
              </div>
              {hit.sample_data && Object.keys(hit.sample_data).length > 0 && (
                <div>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider">Sample Data (Redacted)</span>
                  <pre className="mt-1 bg-[#0b0f1e] border border-[#1e293b] rounded p-2 text-[10px] font-mono text-slate-400 overflow-x-auto">
                    {JSON.stringify(hit.sample_data, null, 2)}
                  </pre>
                </div>
              )}
              <div className="flex items-center gap-4 text-[10px] text-slate-500">
                <span>Last checked: {fmtDate(hit.last_checked_at)}</span>
                <span>Discovered: {fmtDate(hit.discovered_at)}</span>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function InsiderCredentialSelling() {
  const [cases, setCases] = useState<CredentialSellingCase[]>([]);
  const [hits, setHits] = useState<DarkWebHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'cases' | 'darkweb'>('cases');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [riskFilter, setRiskFilter] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [casesRes, hitsRes] = await Promise.all([
        supabase.from('credential_selling_cases').select('*').order('created_at', { ascending: false }),
        supabase.from('credential_dark_web_hits').select('*').order('discovered_at', { ascending: false }),
      ]);
      if (casesRes.error) throw casesRes.error;
      if (hitsRes.error) throw hitsRes.error;
      setCases(casesRes.data || []);
      setHits(hitsRes.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ---- Computed values ----

  const caseStats = useMemo(() => {
    const total = cases.length;
    const confirmed = cases.filter(c => c.status === 'confirmed').length;
    const critical = cases.filter(c => c.risk_tier === 'critical').length;
    const monitoring = cases.filter(c => c.status === 'monitoring').length;
    const neutralized = cases.filter(c => c.status === 'neutralized').length;
    const avgConf = total ? Math.round(cases.reduce((s, c) => s + (c.seller_confidence || 0), 0) / total) : 0;
    return { total, confirmed, critical, monitoring, neutralized, avgConf };
  }, [cases]);

  const confidenceDistribution = useMemo(() => {
    return CONFIDENCE_RANGES.map(r => ({
      ...r,
      count: cases.filter(c => c.seller_confidence >= r.min && c.seller_confidence < (r.max === 100 ? 101 : r.max)).length,
    }));
  }, [cases]);

  const filteredCases = useMemo(() => {
    return cases.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        if (!c.case_id.toLowerCase().includes(q) && !c.entity_name.toLowerCase().includes(q) && !c.entity_id.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (riskFilter !== 'all' && c.risk_tier !== riskFilter) return false;
      return true;
    });
  }, [cases, search, statusFilter, riskFilter]);

  const dwStats = useMemo(() => {
    const total = hits.length;
    const active = hits.filter(h => h.verification_status.includes('active')).length;
    const matched = hits.filter(h => h.verification_status === 'credential_match').length;
    const avgPrice = total ? hits.reduce((s, h) => s + (Number(h.listing_price) || 0), 0) / total : 0;
    return { total, active, matched, avgPrice };
  }, [hits]);

  const marketplaceDist = useMemo(() => {
    const map = new Map<string, number>();
    hits.forEach(h => map.set(h.marketplace, (map.get(h.marketplace) || 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [hits]);

  const filteredHits = useMemo(() => {
    return hits.filter(h => {
      if (search) {
        const q = search.toLowerCase();
        if (!h.hit_id.toLowerCase().includes(q) && !h.entity_id.toLowerCase().includes(q) && !h.seller_handle.toLowerCase().includes(q) && !h.marketplace.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== 'all' && h.verification_status !== statusFilter) return false;
      if (riskFilter !== 'all' && h.marketplace !== riskFilter) return false;
      return true;
    });
  }, [hits, search, statusFilter, riskFilter]);

  // ---- Status / Marketplace options for filters ----

  const caseStatusOptions = useMemo(() => {
    const s = new Set(cases.map(c => c.status));
    return ['all', ...Array.from(s)];
  }, [cases]);

  const caseRiskOptions = useMemo(() => {
    const s = new Set(cases.map(c => c.risk_tier));
    return ['all', ...Array.from(s)];
  }, [cases]);

  const dwStatusOptions = useMemo(() => {
    const s = new Set(hits.map(h => h.verification_status));
    return ['all', ...Array.from(s)];
  }, [hits]);

  const dwMarketplaceOptions = useMemo(() => {
    const s = new Set(hits.map(h => h.marketplace));
    return ['all', ...Array.from(s)];
  }, [hits]);

  // Reset filters when switching tabs
  useEffect(() => {
    setSearch('');
    setStatusFilter('all');
    setRiskFilter('all');
  }, [activeTab]);

  // ---- Render ----

  if (loading) {
    return (
      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-12 flex items-center justify-center">
        <RefreshCw size={20} className="text-cyan-400 animate-spin mr-2" />
        <span className="text-sm text-slate-400">Loading credential selling intelligence...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-[#0b0f1e] border border-red-500/30 rounded-xl p-8 text-center">
        <AlertTriangle size={24} className="text-red-400 mx-auto mb-2" />
        <p className="text-sm text-red-400">{error}</p>
        <button onClick={fetchData} className="mt-3 text-xs text-cyan-400 hover:text-cyan-300 underline">Retry</button>
      </div>
    );
  }

  return (
    <div className="bg-[#0a0e1a] rounded-xl border border-[#1e293b] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-[#1e293b]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-red-500/20 to-amber-500/20 border border-red-500/30 flex items-center justify-center">
              <UserX size={18} className="text-red-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 tracking-tight">Insider Credential Selling</h2>
              <p className="text-[10px] text-slate-500 mt-0.5">Behavioral multi-operator analysis and dark web credential monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} className="p-1.5 rounded-lg hover:bg-white/5 text-slate-500 hover:text-slate-300 transition-colors">
              <RefreshCw size={14} />
            </button>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span className="text-[10px] font-bold font-mono text-red-400 tracking-wider">ACTIVE</span>
            </span>
          </div>
        </div>

        {/* Tab Nav */}
        <div className="flex gap-1 mt-3 -mb-3">
          {([
            { id: 'cases' as const, label: 'Selling Cases', icon: Shield },
            { id: 'darkweb' as const, label: 'Dark Web Monitor', icon: Skull },
          ]).map(tab => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-t-lg transition-all duration-200 ${active ? 'bg-[#0f1629] text-cyan-300 border border-[#1e293b] border-b-transparent' : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]'}`}>
                <Icon size={13} className={active ? 'text-cyan-400' : ''} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="p-5 space-y-5">
        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Search cases, entities, IDs..." value={search} onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#0f1629] border border-[#1e293b] rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 transition-colors" />
          </div>
          <div className="flex items-center gap-1 text-slate-500">
            <Filter size={12} />
            <span className="text-[10px]">Filter:</span>
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="bg-[#0f1629] border border-[#1e293b] rounded-lg text-xs text-slate-300 px-2.5 py-2 focus:outline-none focus:border-cyan-500/40">
            {(activeTab === 'cases' ? caseStatusOptions : dwStatusOptions).map(o => <option key={o} value={o}>{o === 'all' ? 'All Status' : o.replace(/_/g, ' ')}</option>)}
          </select>
          <select value={riskFilter} onChange={e => setRiskFilter(e.target.value)}
            className="bg-[#0f1629] border border-[#1e293b] rounded-lg text-xs text-slate-300 px-2.5 py-2 focus:outline-none focus:border-cyan-500/40">
            {(activeTab === 'cases' ? caseRiskOptions : dwMarketplaceOptions).map(o => <option key={o} value={o}>{o === 'all' ? (activeTab === 'cases' ? 'All Risk' : 'All Marketplaces') : o}</option>)}
          </select>
        </div>

        {/* ============ SELLING CASES TAB ============ */}
        {activeTab === 'cases' && (
          <div className="space-y-5">
            {/* Credential Selling Network Graph */}
            {cases.length > 0 && (
              <CredentialSellingGraph cases={cases as any} darkWebHits={hits as any} />
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: 'Total Cases', value: caseStats.total, color: 'text-slate-100', bg: '' },
                { label: 'Confirmed Sellers', value: caseStats.confirmed, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20' },
                { label: 'Critical Risk', value: caseStats.critical, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20' },
                { label: 'Active Monitoring', value: caseStats.monitoring, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20' },
                { label: 'Avg Confidence', value: caseStats.avgConf, color: '', bg: '', isRing: true },
                { label: 'Neutralized', value: caseStats.neutralized, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20' },
              ].map((stat, i) => (
                <div key={i} className={`rounded-xl border p-3 ${stat.bg || 'bg-[#0f1629] border-[#1e293b]'} ${!stat.bg ? 'border-[#1e293b]' : ''}`}>
                  <p className="text-[10px] text-slate-500 mb-1">{stat.label}</p>
                  {stat.isRing ? (
                    <ConfidenceRing value={stat.value as number} size={40} />
                  ) : (
                    <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  )}
                </div>
              ))}
            </div>

            {/* Confidence Distribution */}
            <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-300 mb-3">Seller Confidence Distribution</h3>
              <div className="flex items-center gap-1 h-6 rounded-full overflow-hidden bg-slate-800">
                {confidenceDistribution.map(r => {
                  const pct = caseStats.total ? (r.count / caseStats.total) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div key={r.label} className={`h-full ${r.color} transition-all duration-500 relative group`} style={{ width: `${pct}%` }}>
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] font-bold text-white drop-shadow">{r.count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-2">
                {confidenceDistribution.map(r => (
                  <div key={r.label} className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-sm ${r.color}`} />
                    <span className={`text-[10px] ${r.textColor}`}>{r.label}</span>
                    <span className="text-[10px] text-slate-600 font-mono">({r.count})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Case Cards */}
            {filteredCases.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Eye size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No cases match your filters.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredCases.map(c => <CaseCard key={c.id} c={c} />)}
              </div>
            )}
          </div>
        )}

        {/* ============ DARK WEB MONITOR TAB ============ */}
        {activeTab === 'darkweb' && (
          <div className="space-y-5">
            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Total Hits', value: dwStats.total, color: 'text-slate-100', icon: Globe },
                { label: 'Active Listings', value: dwStats.active, color: 'text-red-400', icon: Skull },
                { label: 'Credential Matches', value: dwStats.matched, color: 'text-amber-400', icon: Key },
                { label: 'Avg Listing Price', value: fmtCurrency(dwStats.avgPrice), color: 'text-emerald-400', icon: DollarSign },
              ].map((stat, i) => {
                const Icon = stat.icon;
                return (
                  <div key={i} className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Icon size={12} className="text-slate-500" />
                      <p className="text-[10px] text-slate-500">{stat.label}</p>
                    </div>
                    <p className={`text-xl font-bold font-mono ${stat.color}`}>{stat.value}</p>
                  </div>
                );
              })}
            </div>

            {/* Marketplace Distribution */}
            {marketplaceDist.length > 0 && (
              <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-slate-300 mb-3">Marketplace Distribution</h3>
                <div className="space-y-2">
                  {marketplaceDist.map(([mp, count]) => {
                    const pct = dwStats.total ? (count / dwStats.total) * 100 : 0;
                    const barColor = MARKETPLACE_COLORS[mp] ? (mp === 'BreachForums' ? 'bg-red-500/60' : mp === 'Telegram Channel' ? 'bg-blue-500/60' : mp === 'Russian Forum' ? 'bg-orange-500/60' : 'bg-amber-500/60') : 'bg-cyan-500/60';
                    return (
                      <div key={mp} className="flex items-center gap-3">
                        <span className="text-[11px] text-slate-400 w-36 truncate">{mp}</span>
                        <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[10px] font-mono text-slate-500 w-8 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dark Web Hits Table */}
            {filteredHits.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Skull size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No dark web hits match your filters.</p>
              </div>
            ) : (
              <div className="bg-[#0f1629] border border-[#1e293b] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-[#1e293b] text-[10px] uppercase tracking-wider text-slate-500">
                        <th className="px-3 py-2.5 font-medium">Hit ID</th>
                        <th className="px-3 py-2.5 font-medium">Marketplace</th>
                        <th className="px-3 py-2.5 font-medium">Type</th>
                        <th className="px-3 py-2.5 font-medium">Entity</th>
                        <th className="px-3 py-2.5 font-medium">Price</th>
                        <th className="px-3 py-2.5 font-medium">Seller</th>
                        <th className="px-3 py-2.5 font-medium">Verification</th>
                        <th className="px-3 py-2.5 font-medium">Freshness</th>
                        <th className="px-3 py-2.5 font-medium text-center">2FA</th>
                        <th className="px-3 py-2.5 font-medium">Discovered</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredHits.map(hit => <DarkWebRow key={hit.id} hit={hit} />)}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
