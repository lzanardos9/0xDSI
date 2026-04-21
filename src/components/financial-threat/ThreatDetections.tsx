import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Brain,
  Bug,
  ChevronDown,
  ChevronUp,
  Clock,
  Eye,
  Filter,
  Fingerprint,
  Globe,
  Link2,
  Loader2,
  Lock,
  Network,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  ShieldBan,
  ShieldCheck,
  ShieldOff,
  Skull,
  Smartphone,
  Target,
  UserX,
  X,
  Zap,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ThreatAttackChainGraph from './ThreatAttackChainGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AttackChainStage {
  stage: string;
  detail: string;
}

interface ResponseAction {
  action: string;
  status: string;
  outcome?: string;
}

interface BehavioralEvidence {
  [key: string]: number | boolean | string;
}

interface GraphEvidence {
  [key: string]: number | boolean | string | string[];
}

interface ThreatDetection {
  id: string;
  detection_id: string;
  threat_type: string;
  severity: string;
  confidence: number;
  affected_entities: string[] | null;
  attack_chain: AttackChainStage[] | null;
  llm_explanation: string | null;
  llm_classification: string | null;
  behavioral_evidence: BehavioralEvidence | null;
  graph_evidence: GraphEvidence | null;
  status: string;
  response_actions: ResponseAction[] | null;
  created_at: string;
}

type SortField = 'confidence' | 'created_at';
type SortDir = 'asc' | 'desc';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const THREAT_TYPE_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; badgeClass: string; barColor: string }> = {
  identity_theft:        { label: 'Identity Theft',        icon: Fingerprint,  color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',    barColor: 'bg-red-500' },
  pix_fraud:             { label: 'PIX Fraud',             icon: Zap,          color: 'text-orange-400', badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30', barColor: 'bg-orange-500' },
  mule_network:          { label: 'Mule Network',          icon: Network,      color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',    barColor: 'bg-red-500' },
  phishing:              { label: 'Phishing',              icon: Globe,        color: 'text-amber-400',  badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30', barColor: 'bg-amber-500' },
  banking_malware:       { label: 'Banking Malware',       icon: Bug,          color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',    barColor: 'bg-red-500' },
  account_takeover:      { label: 'Account Takeover',      icon: UserX,        color: 'text-orange-400', badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30', barColor: 'bg-orange-500' },
  ransomware_precursor:  { label: 'Ransomware Precursor',  icon: Lock,         color: 'text-red-400',    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',    barColor: 'bg-red-500' },
  supply_chain:          { label: 'Supply Chain',          icon: Link2,        color: 'text-cyan-400',   badgeClass: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30', barColor: 'bg-cyan-500' },
  identity_selling:      { label: 'Identity Selling',      icon: Skull,        color: 'text-amber-400',  badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30', barColor: 'bg-amber-500' },
  deepfake:              { label: 'Deepfake',              icon: Bot,          color: 'text-blue-400',   badgeClass: 'bg-blue-500/15 text-blue-400 border-blue-500/30', barColor: 'bg-blue-500' },
  social_engineering:    { label: 'Social Engineering',    icon: Target,       color: 'text-amber-400',  badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/30', barColor: 'bg-amber-500' },
};

const SEVERITY_STYLES: Record<string, string> = {
  info:     'bg-slate-500/15 text-slate-400 border-slate-500/30',
  low:      'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  medium:   'bg-amber-500/15 text-amber-400 border-amber-500/30',
  high:     'bg-orange-500/15 text-orange-400 border-orange-500/30',
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const STATUS_STYLES: Record<string, { className: string; icon: typeof Shield }> = {
  active:         { className: 'bg-red-500/15 text-red-400 border-red-500/30',     icon: ShieldAlert },
  investigating:  { className: 'bg-amber-500/15 text-amber-400 border-amber-500/30', icon: Search },
  contained:      { className: 'bg-blue-500/15 text-blue-400 border-blue-500/30',  icon: ShieldBan },
  resolved:       { className: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30', icon: ShieldCheck },
  false_positive: { className: 'bg-slate-500/15 text-slate-400 border-slate-500/30',      icon: ShieldOff },
};

const ACTION_STATUS_STYLES: Record<string, string> = {
  executed:  'text-emerald-400',
  pending:   'text-amber-400',
  failed:    'text-red-400',
  rolled_back: 'text-slate-400',
};

const ACTION_STATUS_DOT: Record<string, string> = {
  executed:  'bg-emerald-400',
  pending:   'bg-amber-400',
  failed:    'bg-red-400',
  rolled_back: 'bg-slate-400',
};

const ALL_THREAT_TYPES = Object.keys(THREAT_TYPE_CONFIG);
const ALL_SEVERITIES = ['info', 'low', 'medium', 'high', 'critical'];
const ALL_STATUSES = ['active', 'investigating', 'contained', 'resolved', 'false_positive'];

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

function truncateId(id: string, len = 12): string {
  if (!id) return '';
  return id.length > len ? id.slice(0, len) + '\u2026' : id;
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEvidenceValue(val: unknown): string {
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  if (typeof val === 'number') return val % 1 === 0 ? String(val) : val.toFixed(2);
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function getConfidenceColor(c: number): string {
  if (c >= 90) return 'text-red-400';
  if (c >= 70) return 'text-orange-400';
  if (c >= 50) return 'text-amber-400';
  return 'text-emerald-400';
}

function getConfidenceBarColor(c: number): string {
  if (c >= 90) return 'bg-red-500';
  if (c >= 70) return 'bg-orange-500';
  if (c >= 50) return 'bg-amber-500';
  return 'bg-emerald-500';
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
// Threat Type Distribution
// ---------------------------------------------------------------------------

const ThreatTypeDistribution: React.FC<{ detections: ThreatDetection[] }> = ({ detections }) => {
  const distribution = useMemo(() => {
    const counts: Record<string, number> = {};
    detections.forEach((d) => {
      counts[d.threat_type] = (counts[d.threat_type] || 0) + 1;
    });
    return ALL_THREAT_TYPES
      .map((tt) => ({ type: tt, count: counts[tt] || 0 }))
      .filter((d) => d.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [detections]);

  const maxCount = Math.max(...distribution.map((d) => d.count), 1);

  if (distribution.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <p className="text-[11px] text-slate-500 italic">No threat distribution data</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {distribution.map((d) => {
        const cfg = THREAT_TYPE_CONFIG[d.type];
        if (!cfg) return null;
        const Icon = cfg.icon;
        const pct = (d.count / maxCount) * 100;
        return (
          <div key={d.type} className="group">
            <div className="flex items-center gap-2 mb-1">
              <Icon size={13} className={cfg.color} />
              <span className="text-[11px] text-slate-400 w-40 truncate">{cfg.label}</span>
              <div className="flex-1 h-4 bg-[#0a0e1a] rounded-sm overflow-hidden border border-[#1e293b]/40">
                <div
                  className={`h-full ${cfg.barColor} rounded-sm transition-all duration-500 opacity-70 group-hover:opacity-100`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-[11px] font-mono text-slate-300 w-8 text-right">{d.count}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Attack Chain Visualization
// ---------------------------------------------------------------------------

const AttackChainFlow: React.FC<{ chain: AttackChainStage[]; compact?: boolean }> = ({ chain, compact = true }) => {
  if (!chain || chain.length === 0) return null;

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-1">
      {chain.map((stage, idx) => (
        <React.Fragment key={idx}>
          <div className="flex-shrink-0 group relative">
            <div className="px-2.5 py-1.5 rounded-md bg-[#0a0e1a] border border-[#1e293b] hover:border-slate-500 transition-colors cursor-default">
              <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap">
                {humanizeKey(stage.stage)}
              </span>
            </div>
            {!compact && (
              <div className="absolute bottom-full mb-1 left-0 z-50 bg-[#0f1629] border border-[#1e293b] rounded-lg p-2 shadow-xl min-w-[200px] max-w-[300px] pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[10px] text-slate-400">{stage.detail}</p>
              </div>
            )}
          </div>
          {idx < chain.length - 1 && (
            <ArrowRight size={12} className="text-slate-600 flex-shrink-0" />
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Full Detail Modal
// ---------------------------------------------------------------------------

const DetailModal: React.FC<{
  detection: ThreatDetection;
  onClose: () => void;
}> = ({ detection, onClose }) => {
  const cfg = THREAT_TYPE_CONFIG[detection.threat_type];
  const ThreatIcon = cfg?.icon || Shield;
  const statusCfg = STATUS_STYLES[detection.status] || STATUS_STYLES.active;
  const StatusIcon = statusCfg.icon;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-[#0b0f1e] border border-[#1e293b] rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e293b]">
          <div className="flex items-center gap-3">
            <ThreatIcon size={18} className={cfg?.color || 'text-slate-400'} />
            <div>
              <h2 className="text-sm font-semibold text-slate-200">Full Threat Analysis</h2>
              <span className="text-[10px] font-mono text-slate-500">{detection.detection_id}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${SEVERITY_STYLES[detection.severity] || SEVERITY_STYLES.medium}`}>
              {detection.severity.toUpperCase()}
            </span>
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${statusCfg.className}`}>
              <StatusIcon size={10} />
              {humanizeKey(detection.status)}
            </span>
            <button
              onClick={onClose}
              className="ml-2 p-1 rounded hover:bg-[#1e293b] transition-colors text-slate-400 hover:text-slate-200"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Classification */}
          {detection.llm_classification && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">LLM Classification</h3>
              <p className="text-sm font-semibold text-slate-200">{detection.llm_classification}</p>
            </div>
          )}

          {/* Full LLM Explanation */}
          {detection.llm_explanation && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">LLM Explanation</h3>
              <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-4">
                <p className="text-[12px] text-slate-300 leading-relaxed whitespace-pre-wrap">{detection.llm_explanation}</p>
              </div>
            </div>
          )}

          {/* Full Attack Chain */}
          {detection.attack_chain && detection.attack_chain.length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Attack Chain</h3>
              <div className="space-y-2">
                {detection.attack_chain.map((stage, idx) => (
                  <div key={idx} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className="w-6 h-6 rounded-full bg-[#1e293b] border border-slate-600 flex items-center justify-center shrink-0">
                        <span className="text-[9px] font-mono text-slate-400">{idx + 1}</span>
                      </div>
                      {idx < detection.attack_chain!.length - 1 && (
                        <div className="w-px h-6 bg-[#1e293b]" />
                      )}
                    </div>
                    <div className="pb-2">
                      <p className="text-[11px] font-mono font-semibold text-slate-300">{humanizeKey(stage.stage)}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{stage.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Behavioral Evidence */}
          {detection.behavioral_evidence && Object.keys(detection.behavioral_evidence).length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Behavioral Evidence</h3>
              <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(detection.behavioral_evidence).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">{humanizeKey(key)}</span>
                      <span className="text-[11px] font-mono text-slate-300">{formatEvidenceValue(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Graph Evidence */}
          {detection.graph_evidence && Object.keys(detection.graph_evidence).length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Graph Evidence</h3>
              <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-4">
                <div className="grid grid-cols-2 gap-3">
                  {Object.entries(detection.graph_evidence).map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">{humanizeKey(key)}</span>
                      <span className="text-[11px] font-mono text-slate-300">{formatEvidenceValue(val)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* All Response Actions */}
          {detection.response_actions && detection.response_actions.length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Response Actions</h3>
              <div className="space-y-2">
                {detection.response_actions.map((ra, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-[#0a0e1a] border border-[#1e293b] rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${ACTION_STATUS_DOT[ra.status] || 'bg-slate-500'}`} />
                      <span className="text-[11px] font-mono text-slate-300">{humanizeKey(ra.action)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {ra.outcome && (
                        <span className="text-[10px] text-slate-500">{ra.outcome}</span>
                      )}
                      <span className={`text-[10px] font-medium font-mono ${ACTION_STATUS_STYLES[ra.status] || 'text-slate-400'}`}>
                        {humanizeKey(ra.status)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Affected Entities */}
          {detection.affected_entities && detection.affected_entities.length > 0 && (
            <div>
              <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-2">Affected Entities</h3>
              <div className="flex flex-wrap gap-2">
                {detection.affected_entities.map((e, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-md bg-[#0a0e1a] border border-[#1e293b] text-[10px] font-mono text-slate-300">
                    {e}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Detection Card
// ---------------------------------------------------------------------------

const DetectionCard: React.FC<{
  detection: ThreatDetection;
  onViewFull: (d: ThreatDetection) => void;
}> = ({ detection, onViewFull }) => {
  const [expanded, setExpanded] = useState(false);
  const cfg = THREAT_TYPE_CONFIG[detection.threat_type];
  const ThreatIcon = cfg?.icon || Shield;
  const statusCfg = STATUS_STYLES[detection.status] || STATUS_STYLES.active;
  const StatusIcon = statusCfg.icon;

  const explanationPreview = useMemo(() => {
    if (!detection.llm_explanation) return null;
    if (detection.llm_explanation.length <= 200) return { text: detection.llm_explanation, truncated: false };
    return { text: detection.llm_explanation.slice(0, 200) + '...', truncated: true };
  }, [detection.llm_explanation]);

  return (
    <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl overflow-hidden hover:border-slate-600 transition-all duration-200">
      {/* Card Header */}
      <div className="px-5 py-4 border-b border-[#1e293b]/60">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-slate-400">{detection.detection_id}</span>
            {/* Severity badge */}
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider border ${SEVERITY_STYLES[detection.severity] || SEVERITY_STYLES.medium}`}>
              {detection.severity}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Confidence meter */}
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-slate-500 uppercase tracking-wider">Confidence</span>
              <div className="w-20 h-2 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1e293b]/40">
                <div
                  className={`h-full rounded-full ${getConfidenceBarColor(detection.confidence)} transition-all duration-500`}
                  style={{ width: `${detection.confidence}%` }}
                />
              </div>
              <span className={`text-[11px] font-mono font-bold ${getConfidenceColor(detection.confidence)}`}>
                {detection.confidence}%
              </span>
            </div>
            {/* Status badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-medium border ${statusCfg.className}`}>
              <StatusIcon size={10} />
              {humanizeKey(detection.status)}
            </span>
          </div>
        </div>
      </div>

      {/* Card Body */}
      <div className="px-5 py-4 space-y-4">
        {/* Threat type row */}
        <div className="flex items-center gap-2">
          <ThreatIcon size={14} className={cfg?.color || 'text-slate-400'} />
          <span className={`text-[11px] font-medium ${cfg?.color || 'text-slate-400'}`}>
            {cfg?.label || humanizeKey(detection.threat_type)}
          </span>
        </div>

        {/* LLM Classification */}
        {detection.llm_classification && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Classification</p>
            <p className="text-[12px] font-semibold text-slate-200">{detection.llm_classification}</p>
          </div>
        )}

        {/* LLM Explanation (collapsible) */}
        {explanationPreview && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">AI Explanation</p>
            <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                {expanded ? detection.llm_explanation : explanationPreview.text}
              </p>
              {explanationPreview.truncated && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="mt-1.5 text-[10px] text-cyan-400 hover:text-cyan-300 font-medium transition-colors flex items-center gap-1"
                >
                  {expanded ? (
                    <>Show less <ChevronUp size={10} /></>
                  ) : (
                    <>Read more <ChevronDown size={10} /></>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Attack Chain */}
        {detection.attack_chain && detection.attack_chain.length > 0 && (
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">Attack Chain</p>
            <AttackChainFlow chain={detection.attack_chain} compact={true} />
          </div>
        )}

        {/* Affected Entities */}
        {detection.affected_entities && detection.affected_entities.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {detection.affected_entities.map((entity, idx) => (
              <span key={idx} className="px-2 py-0.5 rounded bg-[#0a0e1a] border border-[#1e293b] text-[10px] font-mono text-slate-400">
                {entity}
              </span>
            ))}
          </div>
        )}

        {/* Response Actions */}
        {detection.response_actions && detection.response_actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {detection.response_actions.map((ra, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${ACTION_STATUS_DOT[ra.status] || 'bg-slate-500'}`} />
                <span className="text-[10px] font-mono text-slate-500">{humanizeKey(ra.action)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Card Footer */}
      <div className="px-5 py-3 border-t border-[#1e293b]/40 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-slate-600">
          <Clock size={11} />
          <span className="text-[10px] font-mono">{timeAgo(detection.created_at)}</span>
        </div>
        <button
          onClick={() => onViewFull(detection)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#0a0e1a] border border-[#1e293b] text-[10px] font-medium text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/30 transition-all"
        >
          <Eye size={11} />
          View Full Analysis
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ThreatDetections: React.FC = () => {
  const [detections, setDetections] = useState<ThreatDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [threatTypeFilter, setThreatTypeFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Detail modal
  const [selectedDetection, setSelectedDetection] = useState<ThreatDetection | null>(null);

  // ---------------------------------------------------------------------------
  // Data Fetching
  // ---------------------------------------------------------------------------

  const fetchDetections = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchError } = await supabase
        .from('financial_threat_detections')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setDetections((data as ThreatDetection[]) || []);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch detections';
      setError(message);
      console.error('ThreatDetections fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDetections();
  }, [fetchDetections]);

  // ---------------------------------------------------------------------------
  // Filtering & Sorting
  // ---------------------------------------------------------------------------

  const filtered = useMemo(() => {
    let result = [...detections];

    if (threatTypeFilter !== 'all') {
      result = result.filter((d) => d.threat_type === threatTypeFilter);
    }
    if (severityFilter !== 'all') {
      result = result.filter((d) => d.severity === severityFilter);
    }
    if (statusFilter !== 'all') {
      result = result.filter((d) => d.status === statusFilter);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (d) =>
          d.detection_id.toLowerCase().includes(q) ||
          (d.llm_classification && d.llm_classification.toLowerCase().includes(q)) ||
          (d.llm_explanation && d.llm_explanation.toLowerCase().includes(q)) ||
          d.threat_type.toLowerCase().includes(q) ||
          (d.affected_entities && d.affected_entities.some((e) => e.toLowerCase().includes(q)))
      );
    }

    result.sort((a, b) => {
      if (sortField === 'confidence') {
        return sortDir === 'asc' ? a.confidence - b.confidence : b.confidence - a.confidence;
      }
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sortDir === 'asc' ? aTime - bTime : bTime - aTime;
    });

    return result;
  }, [detections, threatTypeFilter, severityFilter, statusFilter, searchTerm, sortField, sortDir]);

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    const total = detections.length;
    const active = detections.filter((d) => d.status === 'active').length;
    const critical = detections.filter((d) => d.severity === 'critical').length;
    const investigating = detections.filter((d) => d.status === 'investigating').length;
    const resolved = detections.filter((d) => d.status === 'resolved').length;
    const avgConfidence = total > 0 ? Math.round(detections.reduce((sum, d) => sum + d.confidence, 0) / total) : 0;

    return { total, active, critical, investigating, resolved, avgConfidence };
  }, [detections]);

  // ---------------------------------------------------------------------------
  // Filter reset
  // ---------------------------------------------------------------------------

  const activeFilterCount = [
    threatTypeFilter !== 'all',
    severityFilter !== 'all',
    statusFilter !== 'all',
  ].filter(Boolean).length;

  const resetFilters = () => {
    setThreatTypeFilter('all');
    setSeverityFilter('all');
    setStatusFilter('all');
    setSearchTerm('');
  };

  // ---------------------------------------------------------------------------
  // Toggle sort
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
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={24} className="animate-spin text-slate-500" />
        <span className="ml-3 text-sm text-slate-500">Loading threat detections...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <AlertTriangle size={24} className="text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchDetections}
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
          <Brain size={18} className="text-cyan-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Threat Detections</h2>
            <p className="text-[10px] text-slate-500 mt-0.5">AI-powered financial threat intelligence with LLM analysis</p>
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
            onClick={fetchDetections}
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
          label="Active Threats"
          value={stats.active}
          sub={`of ${stats.total} total detections`}
          icon={<ShieldAlert size={14} className="text-red-400" />}
          valueClass="text-red-400"
        />
        <StatCard
          label="Critical Severity"
          value={stats.critical}
          sub="immediate action required"
          icon={<AlertTriangle size={14} className="text-red-400" />}
          valueClass="text-red-400"
        />
        <StatCard
          label="Avg Confidence"
          value={`${stats.avgConfidence}%`}
          sub="detection accuracy"
          icon={<Activity size={14} className="text-cyan-400" />}
          valueClass={getConfidenceColor(stats.avgConfidence)}
        />
        <StatCard
          label="Investigating"
          value={stats.investigating}
          sub="under SOC review"
          icon={<Search size={14} className="text-amber-400" />}
          valueClass="text-amber-400"
        />
        <StatCard
          label="Resolved"
          value={stats.resolved}
          sub="threats mitigated"
          icon={<ShieldCheck size={14} className="text-emerald-400" />}
          valueClass="text-emerald-400"
        />
      </div>

      {/* Attack Chain Visualization */}
      {detections.length > 0 && (
        <ThreatAttackChainGraph detections={detections} />
      )}

      {/* Threat Type Distribution */}
      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
        <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-4">Threat Type Distribution</h3>
        <ThreatTypeDistribution detections={detections} />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Filter Detections</h3>
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
                  placeholder="ID, classification, entity..."
                  className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md pl-8 pr-3 py-1.5 text-[11px] text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40 font-mono"
                />
              </div>
            </div>
            {/* Threat Type */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Threat Type</label>
              <select
                value={threatTypeFilter}
                onChange={(e) => setThreatTypeFilter(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
              >
                <option value="all">All Types</option>
                {ALL_THREAT_TYPES.map((tt) => (
                  <option key={tt} value={tt}>
                    {THREAT_TYPE_CONFIG[tt]?.label || humanizeKey(tt)}
                  </option>
                ))}
              </select>
            </div>
            {/* Severity */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Severity</label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
              >
                <option value="all">All Severities</option>
                {ALL_SEVERITIES.map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
            {/* Status */}
            <div>
              <label className="text-[10px] text-slate-500 uppercase tracking-wider font-medium block mb-1.5">Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded-md px-3 py-1.5 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer"
              >
                <option value="all">All Statuses</option>
                {ALL_STATUSES.map((s) => (
                  <option key={s} value={s}>{humanizeKey(s)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Sort Controls + Results Count */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-slate-500">
          <span className="font-mono text-slate-400">{filtered.length}</span> detection{filtered.length !== 1 ? 's' : ''}
          {activeFilterCount > 0 && <span> (filtered)</span>}
        </p>
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
            Time
            {sortField === 'created_at' && (
              sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
            )}
          </button>
          <button
            onClick={() => toggleSort('confidence')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md border text-[10px] font-medium transition-colors ${
              sortField === 'confidence'
                ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                : 'bg-[#0f1629] border-[#1e293b] text-slate-500 hover:text-slate-300'
            }`}
          >
            <Activity size={10} />
            Confidence
            {sortField === 'confidence' && (
              sortDir === 'desc' ? <ChevronDown size={10} /> : <ChevronUp size={10} />
            )}
          </button>
        </div>
      </div>

      {/* Detection Cards */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 bg-[#0b0f1e] border border-[#1e293b] rounded-xl">
          <Shield size={28} className="text-slate-700 mb-3" />
          <p className="text-[12px] text-slate-500">No detections match the current filters</p>
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
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((detection) => (
            <DetectionCard
              key={detection.id}
              detection={detection}
              onViewFull={setSelectedDetection}
            />
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedDetection && (
        <DetailModal
          detection={selectedDetection}
          onClose={() => setSelectedDetection(null)}
        />
      )}
    </div>
  );
};

export default ThreatDetections;
