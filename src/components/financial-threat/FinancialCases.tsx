import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Briefcase,
  Shield,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  Search,
  Filter,
  RefreshCw,
  FileText,
  MessageSquare,
  Activity,
  Target,
  DollarSign,
  Users,
  Scale,
  Eye,
  Zap,
  ShieldAlert,
  Pencil,
  Save,
  X,
  Loader2,
  Plus,
  Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import CaseEvidenceGraph from './CaseEvidenceGraph';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FinancialCase {
  id: string;
  case_number: string;
  title: string;
  description: string;
  case_type: string;
  severity: string;
  status: string;
  priority: number;
  assigned_to: string;
  assigned_team: string;
  risk_score: number;
  financial_impact_usd: number;
  affected_accounts: number;
  affected_entities: unknown;
  related_detections: unknown;
  related_simulations: unknown;
  attack_chain: unknown;
  evidence_graph: unknown;
  timeline_events: unknown;
  investigation_notes: unknown;
  response_actions: unknown;
  compliance_flags: unknown;
  sla_deadline: string | null;
  opened_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CaseEvidence {
  id: string;
  case_id: string;
  evidence_type: string;
  title: string;
  description: string;
  source_system: string;
  severity: string;
  confidence: number;
  metadata: unknown;
  collected_at: string;
  collected_by: string;
}

interface CaseComment {
  id: string;
  case_id: string;
  author: string;
  author_role: string;
  content: string;
  comment_type: string;
  is_internal: boolean;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/30',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const STATUS_STYLES: Record<string, string> = {
  open: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  investigating: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  escalated: 'bg-red-500/15 text-red-400 border-red-500/30',
  contained: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  resolved: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  closed: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
};

const CASE_TYPE_STYLES: Record<string, string> = {
  fraud: 'bg-red-500/15 text-red-400 border-red-500/30',
  insider_threat: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  account_takeover: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  money_laundering: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  credential_theft: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  market_manipulation: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
};

const ACTION_STATUS_DOT: Record<string, string> = {
  completed: 'bg-emerald-400',
  in_progress: 'bg-amber-400',
  pending: 'bg-blue-400',
  failed: 'bg-red-400',
  skipped: 'bg-slate-400',
};

const COMMENT_TYPE_COLORS: Record<string, string> = {
  analysis: 'text-cyan-400',
  update: 'text-blue-400',
  escalation: 'text-red-400',
  note: 'text-slate-400',
  resolution: 'text-emerald-400',
};

const ALL_STATUSES = ['open', 'investigating', 'escalated', 'contained', 'resolved', 'closed'];
const ALL_SEVERITIES = ['critical', 'high', 'medium', 'low'];
const ALL_CASE_TYPES = ['fraud', 'insider_threat', 'account_takeover', 'money_laundering', 'credential_theft', 'market_manipulation'];

type InnerTab = 'overview' | 'evidence' | 'investigation' | 'response';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJsonField<T>(val: unknown): T | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object') return val as T;
  if (typeof val === 'string') {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
}

function ensureArray<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val as T[];
  const parsed = parseJsonField<T[]>(val);
  return Array.isArray(parsed) ? parsed : [];
}

function fmtDate(dt: string | null | undefined): string {
  if (!dt) return 'N/A';
  return new Date(dt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtCurrency(val: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
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

function humanizeKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRiskColor(score: number): string {
  if (score >= 85) return '#ef4444';
  if (score >= 70) return '#f97316';
  if (score >= 50) return '#f59e0b';
  return '#34d399';
}

function getRiskTextColor(score: number): string {
  if (score >= 85) return 'text-red-400';
  if (score >= 70) return 'text-orange-400';
  if (score >= 50) return 'text-amber-400';
  return 'text-emerald-400';
}

function getSlaStatus(deadline: string | null): { label: string; overdue: boolean; className: string } {
  if (!deadline) return { label: 'No SLA', overdue: false, className: 'text-slate-500' };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff < 0) {
    const hrs = Math.abs(Math.floor(diff / 3600000));
    return { label: `${hrs}h overdue`, overdue: true, className: 'text-red-400' };
  }
  const hrs = Math.floor(diff / 3600000);
  if (hrs < 4) return { label: `${hrs}h remaining`, overdue: false, className: 'text-amber-400' };
  return { label: `${hrs}h remaining`, overdue: false, className: 'text-slate-400' };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const Badge: React.FC<{ text: string; styles?: string }> = ({ text, styles }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[10px] font-medium ${styles || 'bg-slate-500/15 text-slate-400 border-slate-500/30'}`}>
    {humanizeKey(text)}
  </span>
);

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

const RiskRing: React.FC<{ value: number; size?: number; label?: string }> = ({ value, size = 44, label }) => {
  const sw = 3.5;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const off = circ - (value / 100) * circ;
  const color = getRiskColor(value);
  const trackColor = `${color}22`;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }} title={label || `Risk: ${value}`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={trackColor} strokeWidth={sw} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={sw}
          strokeDasharray={circ} strokeDashoffset={off} strokeLinecap="round" className="transition-all duration-500" />
      </svg>
      <span className="absolute text-[10px] font-bold font-mono" style={{ color }}>{value}</span>
    </div>
  );
};

const PriorityDots: React.FC<{ priority: number }> = ({ priority }) => {
  const count = Math.min(Math.max(priority, 1), 5);
  return (
    <div className="flex items-center gap-0.5" title={`Priority ${count}/5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className={`w-1.5 h-1.5 rounded-full ${i < count ? 'bg-amber-400' : 'bg-slate-700'}`} />
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Attack Chain Visualization
// ---------------------------------------------------------------------------

interface AttackChainStage {
  stage: string;
  detail?: string;
  status?: string;
}

const AttackChainFlow: React.FC<{ chain: AttackChainStage[] }> = ({ chain }) => {
  if (!chain || chain.length === 0) return <p className="text-[11px] text-slate-500 italic">No attack chain data</p>;
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-2">
      {chain.map((stage, idx) => (
        <React.Fragment key={idx}>
          <div className="flex-shrink-0 group relative">
            <div className={`px-3 py-2 rounded-lg border transition-colors cursor-default ${
              stage.status === 'completed' ? 'bg-red-500/10 border-red-500/30' :
              stage.status === 'in_progress' ? 'bg-amber-500/10 border-amber-500/30' :
              'bg-[#0a0e1a] border-[#1e293b] hover:border-slate-500'
            }`}>
              <span className="text-[10px] font-mono text-slate-300 whitespace-nowrap block">{humanizeKey(stage.stage)}</span>
              {stage.detail && (
                <span className="text-[9px] text-slate-500 whitespace-nowrap block mt-0.5">{stage.detail}</span>
              )}
            </div>
          </div>
          {idx < chain.length - 1 && (
            <div className="flex-shrink-0 text-slate-600">
              <svg width="16" height="12" viewBox="0 0 16 12"><path d="M0 6h12m0 0l-4-4m4 4l-4 4" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inner Tab: Overview
// ---------------------------------------------------------------------------

const OverviewTab: React.FC<{ c: FinancialCase }> = ({ c }) => {
  const chain = ensureArray<AttackChainStage>(c.attack_chain);
  const timeline = ensureArray<{ event: string; timestamp: string; detail?: string }>(c.timeline_events);
  const flags = ensureArray<string>(c.compliance_flags);

  return (
    <div className="space-y-5">
      {/* Description */}
      <div>
        <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Description</h4>
        <p className="text-[12px] text-slate-300 leading-relaxed">{c.description || 'No description provided.'}</p>
      </div>

      {/* Attack Chain */}
      <div>
        <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Attack Chain</h4>
        <AttackChainFlow chain={chain} />
      </div>

      {/* Timeline Events */}
      {timeline.length > 0 && (
        <div>
          <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Timeline Events</h4>
          <div className="relative pl-4 border-l border-[#1e293b] space-y-3">
            {timeline.map((evt, idx) => (
              <div key={idx} className="relative">
                <div className="absolute -left-[17px] top-1.5 w-2 h-2 rounded-full bg-cyan-500" />
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] font-mono text-slate-500">{fmtDate(evt.timestamp)}</span>
                  <span className="text-[11px] text-slate-300">{evt.event}</span>
                </div>
                {evt.detail && <p className="text-[10px] text-slate-500 mt-0.5">{evt.detail}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compliance Flags */}
      {flags.length > 0 && (
        <div>
          <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Compliance Flags</h4>
          <div className="flex flex-wrap gap-1.5">
            {flags.map((flag, idx) => (
              <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/10 border border-rose-500/25 text-[10px] text-rose-400">
                <Scale size={10} /> {flag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Affected Entities */}
      {c.affected_entities && (
        <div>
          <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Affected Entities</h4>
          <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
            <pre className="text-[10px] text-slate-400 font-mono whitespace-pre-wrap overflow-x-auto">
              {JSON.stringify(parseJsonField(c.affected_entities), null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inner Tab: Evidence
// ---------------------------------------------------------------------------

const EvidenceTab: React.FC<{ c: FinancialCase; evidence: CaseEvidence[] }> = ({ c, evidence }) => {
  const graphData = parseJsonField<{ nodes: unknown[]; edges: unknown[] }>(c.evidence_graph);

  return (
    <div className="space-y-5">
      {/* Evidence Graph */}
      {graphData && graphData.nodes && graphData.edges && (
        <div>
          <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Evidence Graph</h4>
          <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg overflow-hidden" style={{ height: 320 }}>
            <CaseEvidenceGraph nodes={graphData.nodes} edges={graphData.edges} />
          </div>
        </div>
      )}

      {/* Evidence Items */}
      <div>
        <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
          Evidence Items ({evidence.length})
        </h4>
        {evidence.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic">No evidence items collected.</p>
        ) : (
          <div className="space-y-2">
            {evidence.map((e) => (
              <div key={e.id} className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3 hover:border-slate-600 transition-colors">
                <div className="flex items-center gap-2 mb-1.5">
                  <FileText size={12} className="text-slate-500" />
                  <span className="text-[12px] font-semibold text-slate-200">{e.title}</span>
                  <Badge text={e.evidence_type} />
                  <Badge text={e.severity} styles={SEVERITY_STYLES[e.severity]} />
                  <div className="ml-auto flex items-center gap-2">
                    <RiskRing value={Math.round(e.confidence)} size={28} label={`Confidence: ${e.confidence}%`} />
                    <span className="text-[10px] text-slate-500 font-mono">{e.source_system}</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">{e.description}</p>
                <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-500">
                  <span>Collected by {e.collected_by}</span>
                  <span>{fmtDate(e.collected_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inner Tab: Investigation
// ---------------------------------------------------------------------------

const InvestigationTab: React.FC<{ c: FinancialCase; comments: CaseComment[] }> = ({ c, comments }) => {
  const notes = ensureArray<{ note: string; author?: string; timestamp?: string }>(c.investigation_notes);

  return (
    <div className="space-y-5">
      {/* Comments Thread */}
      <div>
        <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">
          <MessageSquare size={11} className="inline mr-1" />
          Comments ({comments.length})
        </h4>
        {comments.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic">No comments yet.</p>
        ) : (
          <div className="space-y-2">
            {comments.map((cm) => (
              <div key={cm.id} className={`bg-[#0a0e1a] border rounded-lg p-3 ${cm.is_internal ? 'border-amber-500/20' : 'border-[#1e293b]'}`}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[11px] font-semibold text-slate-200">{cm.author}</span>
                  <span className="text-[10px] text-slate-500">{cm.author_role}</span>
                  <Badge text={cm.comment_type} styles={`bg-slate-500/10 border-slate-500/20 ${COMMENT_TYPE_COLORS[cm.comment_type] || 'text-slate-400'}`} />
                  {cm.is_internal && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">INTERNAL</span>
                  )}
                  <span className="ml-auto text-[10px] text-slate-500">{timeAgo(cm.created_at)}</span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed whitespace-pre-wrap">{cm.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Investigation Notes */}
      {notes.length > 0 && (
        <div>
          <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Investigation Notes</h4>
          <div className="space-y-2">
            {notes.map((n, idx) => (
              <div key={idx} className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  {n.author && <span className="text-[10px] font-semibold text-slate-300">{n.author}</span>}
                  {n.timestamp && <span className="text-[10px] text-slate-500">{fmtDate(n.timestamp)}</span>}
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">{n.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Inner Tab: Response
// ---------------------------------------------------------------------------

interface ResponseAction {
  action: string;
  status: string;
  assigned_to?: string;
  started_at?: string;
  completed_at?: string;
  outcome?: string;
}

const ResponseTab: React.FC<{ c: FinancialCase }> = ({ c }) => {
  const actions = ensureArray<ResponseAction>(c.response_actions);
  const detections = ensureArray<string>(c.related_detections);
  const simulations = ensureArray<string>(c.related_simulations);
  const sla = getSlaStatus(c.sla_deadline);

  return (
    <div className="space-y-5">
      {/* SLA Tracking */}
      <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-4">
        <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">SLA Status</h4>
        <div className="flex items-center gap-4">
          <Clock size={16} className={sla.overdue ? 'text-red-400' : 'text-slate-400'} />
          <div>
            <p className={`text-sm font-mono font-semibold ${sla.className}`}>{sla.label}</p>
            {c.sla_deadline && (
              <p className="text-[10px] text-slate-500">Deadline: {fmtDate(c.sla_deadline)}</p>
            )}
          </div>
          {c.resolved_at && (
            <div className="ml-auto text-right">
              <p className="text-[10px] text-slate-500">Resolved</p>
              <p className="text-[11px] text-emerald-400 font-mono">{fmtDate(c.resolved_at)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Response Actions */}
      <div>
        <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Response Actions ({actions.length})</h4>
        {actions.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic">No response actions recorded.</p>
        ) : (
          <div className="space-y-2">
            {actions.map((a, idx) => (
              <div key={idx} className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3 flex items-center gap-3">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ACTION_STATUS_DOT[a.status] || 'bg-slate-400'}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-200">{humanizeKey(a.action)}</span>
                    <Badge text={a.status} />
                  </div>
                  {a.outcome && <p className="text-[10px] text-slate-500 mt-0.5">{a.outcome}</p>}
                </div>
                <div className="text-right flex-shrink-0">
                  {a.assigned_to && <p className="text-[10px] text-slate-500">{a.assigned_to}</p>}
                  {a.completed_at && <p className="text-[10px] text-slate-500 font-mono">{timeAgo(a.completed_at)}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Related Links */}
      {(detections.length > 0 || simulations.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {detections.length > 0 && (
            <div>
              <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Related Detections</h4>
              <div className="space-y-1">
                {detections.map((d, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-[#0a0e1a] border border-[#1e293b] rounded-md">
                    <ShieldAlert size={11} className="text-red-400" />
                    <span className="text-[10px] font-mono text-slate-400 truncate">{String(d)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {simulations.length > 0 && (
            <div>
              <h4 className="text-[11px] text-slate-500 uppercase tracking-wider mb-2">Related Simulations</h4>
              <div className="space-y-1">
                {simulations.map((s, idx) => (
                  <div key={idx} className="flex items-center gap-2 px-2 py-1.5 bg-[#0a0e1a] border border-[#1e293b] rounded-md">
                    <Target size={11} className="text-cyan-400" />
                    <span className="text-[10px] font-mono text-slate-400 truncate">{String(s)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Edit Form for Case fields
// ---------------------------------------------------------------------------

interface EditFormData {
  title: string;
  description: string;
  severity: string;
  status: string;
  priority: number;
  assigned_to: string;
  assigned_team: string;
  risk_score: number;
  financial_impact_usd: number;
  affected_accounts: number;
  case_type: string;
}

const EditCaseForm: React.FC<{
  c: FinancialCase;
  onSave: (data: EditFormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}> = ({ c, onSave, onCancel, saving }) => {
  const [form, setForm] = useState<EditFormData>({
    title: c.title,
    description: c.description,
    severity: c.severity,
    status: c.status,
    priority: c.priority,
    assigned_to: c.assigned_to,
    assigned_team: c.assigned_team,
    risk_score: c.risk_score,
    financial_impact_usd: c.financial_impact_usd,
    affected_accounts: c.affected_accounts,
    case_type: c.case_type,
  });

  const set = (key: keyof EditFormData, val: string | number) => setForm(prev => ({ ...prev, [key]: val }));

  const inputClass = 'w-full px-3 py-2 bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[12px] text-slate-200 focus:outline-none focus:border-cyan-500/50 transition-colors';
  const selectClass = 'w-full px-3 py-2 bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[12px] text-slate-200 focus:outline-none focus:border-cyan-500/50';
  const labelClass = 'text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1 block';

  return (
    <div className="border-t border-cyan-500/30 bg-[#0b1020] px-5 py-5 space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Pencil size={14} className="text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">Edit Case</h3>
          <span className="text-[10px] font-mono text-slate-500">{c.case_number}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e293b] text-slate-400 text-[11px] hover:border-slate-500 hover:text-slate-200 transition-colors disabled:opacity-50"
          >
            <X size={12} /> Cancel
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Title */}
      <div>
        <label className={labelClass}>Title</label>
        <input type="text" value={form.title} onChange={e => set('title', e.target.value)} className={inputClass} />
      </div>

      {/* Description */}
      <div>
        <label className={labelClass}>Description</label>
        <textarea value={form.description} onChange={e => set('description', e.target.value)}
          rows={3} className={`${inputClass} resize-y`} />
      </div>

      {/* Row: severity, status, case_type, priority */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className={labelClass}>Severity</label>
          <select value={form.severity} onChange={e => set('severity', e.target.value)} className={selectClass}>
            {ALL_SEVERITIES.map(s => <option key={s} value={s}>{humanizeKey(s)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <select value={form.status} onChange={e => set('status', e.target.value)} className={selectClass}>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{humanizeKey(s)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Case Type</label>
          <select value={form.case_type} onChange={e => set('case_type', e.target.value)} className={selectClass}>
            {ALL_CASE_TYPES.map(t => <option key={t} value={t}>{humanizeKey(t)}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Priority (1-5)</label>
          <input type="number" min={1} max={5} value={form.priority}
            onChange={e => set('priority', Math.max(1, Math.min(5, Number(e.target.value) || 1)))}
            className={inputClass} />
        </div>
      </div>

      {/* Row: assigned_to, assigned_team */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Assigned To</label>
          <input type="text" value={form.assigned_to} onChange={e => set('assigned_to', e.target.value)} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Assigned Team</label>
          <input type="text" value={form.assigned_team} onChange={e => set('assigned_team', e.target.value)} className={inputClass} />
        </div>
      </div>

      {/* Row: risk_score, financial_impact, affected_accounts */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelClass}>Risk Score (0-100)</label>
          <input type="number" min={0} max={100} value={form.risk_score}
            onChange={e => set('risk_score', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
            className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Financial Impact (USD)</label>
          <input type="number" min={0} value={form.financial_impact_usd}
            onChange={e => set('financial_impact_usd', Math.max(0, Number(e.target.value) || 0))}
            className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Affected Accounts</label>
          <input type="number" min={0} value={form.affected_accounts}
            onChange={e => set('affected_accounts', Math.max(0, Number(e.target.value) || 0))}
            className={inputClass} />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Add Comment Form
// ---------------------------------------------------------------------------

const AddCommentForm: React.FC<{
  onSubmit: (content: string, commentType: string) => Promise<void>;
  submitting: boolean;
}> = ({ onSubmit, submitting }) => {
  const [content, setContent] = useState('');
  const [commentType, setCommentType] = useState('note');

  const handleSubmit = async () => {
    if (!content.trim()) return;
    await onSubmit(content.trim(), commentType);
    setContent('');
  };

  return (
    <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2">
        <Plus size={12} className="text-cyan-400" />
        <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Add Comment</span>
      </div>
      <textarea
        value={content}
        onChange={e => setContent(e.target.value)}
        placeholder="Write a comment or investigation note..."
        rows={2}
        className="w-full px-3 py-2 bg-[#080c16] border border-[#1e293b] rounded-lg text-[12px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 resize-y"
      />
      <div className="flex items-center justify-between">
        <select
          value={commentType}
          onChange={e => setCommentType(e.target.value)}
          className="bg-[#080c16] border border-[#1e293b] rounded-lg text-[11px] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="note">Note</option>
          <option value="update">Update</option>
          <option value="escalation">Escalation</option>
          <option value="analysis">Analysis</option>
          <option value="resolution">Resolution</option>
        </select>
        <button
          onClick={handleSubmit}
          disabled={submitting || !content.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          {submitting ? 'Sending...' : 'Post'}
        </button>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Expanded Case Card
// ---------------------------------------------------------------------------

const ExpandedCase: React.FC<{
  c: FinancialCase;
  evidence: CaseEvidence[];
  comments: CaseComment[];
  onSaveCase: (id: string, data: EditFormData) => Promise<void>;
  onAddComment: (caseId: string, content: string, commentType: string) => Promise<void>;
}> = ({ c, evidence, comments, onSaveCase, onAddComment }) => {
  const [tab, setTab] = useState<InnerTab>('overview');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);

  const handleSave = async (data: EditFormData) => {
    setSaving(true);
    try {
      await onSaveCase(c.id, data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handleAddComment = async (content: string, commentType: string) => {
    setSubmittingComment(true);
    try {
      await onAddComment(c.id, content, commentType);
    } finally {
      setSubmittingComment(false);
    }
  };

  const tabs: { key: InnerTab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Eye size={12} /> },
    { key: 'evidence', label: 'Evidence', icon: <FileText size={12} /> },
    { key: 'investigation', label: 'Investigation', icon: <MessageSquare size={12} /> },
    { key: 'response', label: 'Response', icon: <Zap size={12} /> },
  ];

  if (editing) {
    return <EditCaseForm c={c} onSave={handleSave} onCancel={() => setEditing(false)} saving={saving} />;
  }

  return (
    <div className="border-t border-[#1e293b] px-4 py-4">
      {/* Inner Tabs + Edit button */}
      <div className="flex items-center justify-between mb-4 border-b border-[#1e293b] pb-2">
        <div className="flex items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-md text-[11px] font-medium transition-colors ${
                tab === t.key
                  ? 'bg-[#1e293b] text-slate-100 border-b-2 border-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEditing(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#1e293b] text-slate-400 text-[11px] hover:border-cyan-500/40 hover:text-cyan-400 transition-colors"
        >
          <Pencil size={11} /> Edit Case
        </button>
      </div>

      {/* Tab Content */}
      {tab === 'overview' && <OverviewTab c={c} />}
      {tab === 'evidence' && <EvidenceTab c={c} evidence={evidence} />}
      {tab === 'investigation' && (
        <div className="space-y-5">
          <InvestigationTab c={c} comments={comments} />
          <AddCommentForm onSubmit={handleAddComment} submitting={submittingComment} />
        </div>
      )}
      {tab === 'response' && <ResponseTab c={c} />}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Case Card
// ---------------------------------------------------------------------------

const CaseCard: React.FC<{
  c: FinancialCase;
  evidence: CaseEvidence[];
  comments: CaseComment[];
  expanded: boolean;
  onToggle: () => void;
  onSaveCase: (id: string, data: EditFormData) => Promise<void>;
  onAddComment: (caseId: string, content: string, commentType: string) => Promise<void>;
}> = ({ c, evidence, comments, expanded, onToggle, onSaveCase, onAddComment }) => {
  const sla = getSlaStatus(c.sla_deadline);

  return (
    <div className={`bg-[#0f1629] border rounded-xl overflow-hidden transition-colors ${expanded ? 'border-cyan-500/30' : 'border-[#1e293b] hover:border-[#2a3a5c]'}`}>
      {/* Collapsed Header */}
      <button onClick={onToggle} className="w-full text-left px-4 py-3 flex items-center gap-3">
        <div className="flex items-center text-slate-500">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </div>

        <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{c.case_number}</span>
        <span className="text-[12px] font-semibold text-slate-100 truncate max-w-[200px]">{c.title}</span>

        <Badge text={c.severity} styles={SEVERITY_STYLES[c.severity]} />
        <Badge text={c.status} styles={STATUS_STYLES[c.status]} />
        <Badge text={c.case_type} styles={CASE_TYPE_STYLES[c.case_type]} />

        <PriorityDots priority={c.priority} />

        <div className="flex items-center gap-1 text-[10px] text-slate-400 flex-shrink-0">
          <Users size={10} /> {c.assigned_to}
        </div>
        <span className="text-[10px] text-slate-500 flex-shrink-0">{c.assigned_team}</span>

        <RiskRing value={c.risk_score} size={32} />

        <span className="text-[10px] font-mono text-slate-300 flex-shrink-0">
          <DollarSign size={10} className="inline text-emerald-400" />
          {fmtCurrency(c.financial_impact_usd)}
        </span>

        <span className="text-[10px] text-slate-400 flex-shrink-0">
          {c.affected_accounts} accts
        </span>

        <span className={`text-[10px] font-mono flex-shrink-0 flex items-center gap-1 ${sla.className}`}>
          <Clock size={10} /> {sla.label}
        </span>

        <span className="ml-auto text-[10px] text-slate-500 flex items-center gap-1 flex-shrink-0">
          {timeAgo(c.opened_at)}
        </span>
      </button>

      {/* Expanded */}
      {expanded && (
        <ExpandedCase
          c={c}
          evidence={evidence}
          comments={comments}
          onSaveCase={onSaveCase}
          onAddComment={onAddComment}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function FinancialCases() {
  const [cases, setCases] = useState<FinancialCase[]>([]);
  const [allEvidence, setAllEvidence] = useState<CaseEvidence[]>([]);
  const [allComments, setAllComments] = useState<CaseComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [assignedFilter, setAssignedFilter] = useState('all');

  // ---------------------------------------------------------------------------
  // Fetch
  // ---------------------------------------------------------------------------

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [casesRes, evidenceRes, commentsRes] = await Promise.all([
        supabase.from('financial_cases').select('*').order('opened_at', { ascending: false }),
        supabase.from('financial_case_evidence').select('*').order('collected_at', { ascending: false }),
        supabase.from('financial_case_comments').select('*').order('created_at', { ascending: true }),
      ]);

      if (casesRes.error) throw casesRes.error;
      if (evidenceRes.error) throw evidenceRes.error;
      if (commentsRes.error) throw commentsRes.error;

      setCases(casesRes.data || []);
      setAllEvidence(evidenceRes.data || []);
      setAllComments(commentsRes.data || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch case data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------

  const assignees = useMemo(() => {
    const set = new Set<string>();
    cases.forEach((c) => { if (c.assigned_to) set.add(c.assigned_to); });
    return Array.from(set).sort();
  }, [cases]);

  const filtered = useMemo(() => {
    let list = cases;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (c) =>
          c.case_number.toLowerCase().includes(q) ||
          c.title.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.assigned_to?.toLowerCase().includes(q)
      );
    }
    if (statusFilter !== 'all') list = list.filter((c) => c.status === statusFilter);
    if (severityFilter !== 'all') list = list.filter((c) => c.severity === severityFilter);
    if (typeFilter !== 'all') list = list.filter((c) => c.case_type === typeFilter);
    if (assignedFilter !== 'all') list = list.filter((c) => c.assigned_to === assignedFilter);
    return list;
  }, [cases, search, statusFilter, severityFilter, typeFilter, assignedFilter]);

  const stats = useMemo(() => {
    const total = cases.length;
    const open = cases.filter((c) => c.status === 'open').length;
    const investigating = cases.filter((c) => c.status === 'investigating').length;
    const escalated = cases.filter((c) => c.status === 'escalated').length;
    const resolved = cases.filter((c) => c.status === 'resolved').length;
    const critical = cases.filter((c) => c.severity === 'critical').length;
    const avgRisk = total > 0 ? Math.round(cases.reduce((sum, c) => sum + (c.risk_score || 0), 0) / total) : 0;

    // Average SLA hours remaining for open cases with deadlines
    const openWithSla = cases.filter((c) => c.sla_deadline && !['resolved', 'closed'].includes(c.status));
    let avgSlaHrs = 0;
    if (openWithSla.length > 0) {
      const totalHrs = openWithSla.reduce((sum, c) => {
        const diff = (new Date(c.sla_deadline!).getTime() - Date.now()) / 3600000;
        return sum + diff;
      }, 0);
      avgSlaHrs = Math.round(totalHrs / openWithSla.length);
    }

    return { total, open, investigating, escalated, resolved, critical, avgRisk, avgSlaHrs };
  }, [cases]);

  const evidenceForCase = useCallback(
    (caseId: string) => allEvidence.filter((e) => e.case_id === caseId),
    [allEvidence]
  );

  const commentsForCase = useCallback(
    (caseId: string) => allComments.filter((c) => c.case_id === caseId),
    [allComments]
  );

  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const handleSaveCase = useCallback(async (id: string, data: EditFormData) => {
    const { error: err } = await supabase
      .from('financial_cases')
      .update({
        title: data.title,
        description: data.description,
        severity: data.severity,
        status: data.status,
        priority: data.priority,
        assigned_to: data.assigned_to,
        assigned_team: data.assigned_team,
        risk_score: data.risk_score,
        financial_impact_usd: data.financial_impact_usd,
        affected_accounts: data.affected_accounts,
        case_type: data.case_type,
        updated_at: new Date().toISOString(),
        resolved_at: data.status === 'resolved' || data.status === 'closed' ? new Date().toISOString() : null,
      })
      .eq('id', id);

    if (err) throw err;

    setCases(prev => prev.map(c =>
      c.id === id
        ? { ...c, ...data, updated_at: new Date().toISOString(), resolved_at: data.status === 'resolved' || data.status === 'closed' ? new Date().toISOString() : c.resolved_at }
        : c
    ));
  }, []);

  const handleAddComment = useCallback(async (caseId: string, content: string, commentType: string) => {
    const newComment = {
      case_id: caseId,
      author: 'Current User',
      author_role: 'analyst',
      content,
      comment_type: commentType,
      is_internal: false,
    };
    const { data, error: err } = await supabase
      .from('financial_case_comments')
      .insert(newComment)
      .select()
      .maybeSingle();

    if (err) throw err;
    if (data) {
      setAllComments(prev => [...prev, data]);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <RefreshCw size={24} className="animate-spin text-cyan-400" />
        <span className="ml-3 text-sm text-slate-400">Loading financial cases...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-4">
        <AlertTriangle size={32} className="text-red-400" />
        <p className="text-sm text-red-400">{error}</p>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0f1629] border border-[#1e293b] text-slate-300 text-sm hover:border-slate-500 transition-colors"
        >
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase size={20} className="text-cyan-400" />
          <h2 className="text-lg font-bold text-slate-100">Financial Case Management</h2>
          <span className="text-[10px] font-mono bg-slate-500/15 text-slate-400 border border-slate-500/30 rounded-md px-2 py-0.5">
            {stats.total} total
          </span>
          <span className="text-[10px] font-mono bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-md px-2 py-0.5">
            {stats.open} open
          </span>
          <span className="text-[10px] font-mono bg-red-500/15 text-red-400 border border-red-500/30 rounded-md px-2 py-0.5">
            {stats.critical} critical
          </span>
          <span className="text-[10px] font-mono bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 rounded-md px-2 py-0.5">
            avg risk {stats.avgRisk}
          </span>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0f1629] border border-[#1e293b] text-slate-400 text-[11px] hover:border-slate-500 hover:text-slate-200 transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total Cases" value={stats.total} sub={`${filtered.length} shown`} icon={<Briefcase size={14} className="text-slate-500" />} />
        <StatCard label="Open" value={stats.open} sub="Awaiting triage" icon={<Activity size={14} className="text-blue-400" />} valueClass="text-blue-400" />
        <StatCard label="Investigating" value={stats.investigating} sub="Active analysis" icon={<Search size={14} className="text-cyan-400" />} valueClass="text-cyan-400" />
        <StatCard label="Escalated" value={stats.escalated} sub="Requires attention" icon={<AlertTriangle size={14} className="text-red-400" />} valueClass="text-red-400" />
        <StatCard label="Resolved" value={stats.resolved} sub="Successfully closed" icon={<Shield size={14} className="text-emerald-400" />} valueClass="text-emerald-400" />
        <StatCard
          label="Avg SLA"
          value={stats.avgSlaHrs > 0 ? `${stats.avgSlaHrs}h` : 'N/A'}
          sub="Open case average"
          icon={<Clock size={14} className={stats.avgSlaHrs < 0 ? 'text-red-400' : 'text-slate-500'} />}
          valueClass={stats.avgSlaHrs < 0 ? 'text-red-400' : 'text-slate-100'}
        />
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 bg-[#0f1629] border border-[#1e293b] rounded-xl p-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cases..."
            className="w-full pl-8 pr-3 py-1.5 bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[11px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50"
          />
        </div>

        <Filter size={13} className="text-slate-500" />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[11px] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="all">All Statuses</option>
          {ALL_STATUSES.map((s) => (
            <option key={s} value={s}>{humanizeKey(s)}</option>
          ))}
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[11px] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="all">All Severities</option>
          {ALL_SEVERITIES.map((s) => (
            <option key={s} value={s}>{humanizeKey(s)}</option>
          ))}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[11px] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="all">All Types</option>
          {ALL_CASE_TYPES.map((t) => (
            <option key={t} value={t}>{humanizeKey(t)}</option>
          ))}
        </select>

        <select
          value={assignedFilter}
          onChange={(e) => setAssignedFilter(e.target.value)}
          className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg text-[11px] text-slate-300 px-2 py-1.5 focus:outline-none focus:border-cyan-500/50"
        >
          <option value="all">All Assignees</option>
          {assignees.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* Case List */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <Briefcase size={32} className="text-slate-600 mb-3" />
          <p className="text-sm text-slate-500">No cases match the current filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <CaseCard
              key={c.id}
              c={c}
              evidence={evidenceForCase(c.id)}
              comments={commentsForCase(c.id)}
              expanded={expandedId === c.id}
              onToggle={() => handleToggle(c.id)}
              onSaveCase={handleSaveCase}
              onAddComment={handleAddComment}
            />
          ))}
        </div>
      )}
    </div>
  );
}
