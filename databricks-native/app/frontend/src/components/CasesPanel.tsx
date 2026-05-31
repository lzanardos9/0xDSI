import { useState, useEffect, useMemo } from 'react';
import {
  Briefcase,
  Plus,
  Search,
  X,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Shield,
  Users,
  FileText,
  Activity,
  Network,
  Target,
  DollarSign,
  Tag,
  Lock,
  GitBranch,
  Crosshair,
  Eye,
  Bot,
  User,
  Hash,
  PlayCircle,
  PauseCircle,
  AlertCircle,
  ChevronRight,
  Zap,
  LayoutGrid,
  List,
  BarChart3,
  Bell,
  ShieldCheck,
  FileCheck2,
  MessageSquare,
  Link2,
  Flame,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

type CaseStatus = 'new' | 'investigating' | 'contained' | 'resolved' | 'closed';
type CasePriority = 'low' | 'medium' | 'high' | 'critical';
type TLP = 'red' | 'amber' | 'green' | 'white' | 'clear';
type SLAState = 'on_track' | 'at_risk' | 'breached' | 'met';
type ViewMode = 'kanban' | 'table' | 'metrics';
type DetailTab =
  | 'overview'
  | 'timeline'
  | 'evidence'
  | 'iocs'
  | 'attack'
  | 'actions'
  | 'audit'
  | 'collab';

interface CaseRow {
  id: string;
  case_number: string;
  title: string;
  description?: string;
  status: CaseStatus;
  priority: CasePriority;
  severity: string;
  category: string;
  assigned_to?: string;
  created_by: string;
  resolution?: string;
  related_event_ids: string[];
  related_alert_ids: string[];
  tags: string[];
  created_at: string;
  updated_at: string;
  resolved_at?: string;
  closed_at?: string;
  risk_score: number;
  confidence: number;
  financial_impact_usd: number;
  affected_assets: string[];
  affected_identities: string[];
  tlp: TLP;
  kill_chain_phase: string;
  attack_chain: unknown;
  ack_due_at?: string;
  contain_due_at?: string;
  resolve_due_at?: string;
  acknowledged_at?: string;
  contained_at?: string;
  sla_breach: SLAState;
  parent_case_id?: string;
  external_ticket_id?: string;
  originating_alert_id?: string;
  opened_at_phase: number;
  ai_summary?: string;
  playbook_id?: string;
}

interface CaseEvidence {
  id: string;
  case_id: string;
  evidence_type: string;
  title: string;
  description: string;
  source_system: string;
  collected_by: string;
  sha256: string;
  size_bytes: number;
  confidence: number;
  custody_chain: { actor: string; action: string; at: string; sha256?: string }[];
  is_sealed: boolean;
  collected_at: string;
}

interface CaseIOC {
  id: string;
  case_id: string;
  ioc_type: string;
  ioc_value: string;
  tlp: TLP;
  confidence: number;
  feed_source: string;
  is_blocked: boolean;
  notes: string;
  first_seen: string;
}

interface CaseAttack {
  id: string;
  case_id: string;
  technique_id: string;
  technique_name: string;
  tactic: string;
  confidence: number;
  evidence_summary: string;
}

interface CaseAction {
  id: string;
  case_id: string;
  action_name: string;
  action_type: string;
  status: string;
  reversible: boolean;
  requires_approval: boolean;
  approved_by: string;
  approved_at?: string;
  executed_by: string;
  executed_at?: string;
  result_summary: string;
  rollback_handle: string;
}

interface CaseWatcher {
  id: string;
  case_id: string;
  watcher_user: string;
  watcher_role: string;
}

interface CaseAudit {
  id: string;
  case_id: string;
  actor: string;
  action: string;
  field_changed: string;
  old_value: string;
  new_value: string;
  created_at: string;
}

const STATUS_META: Record<CaseStatus, { label: string; color: string; bg: string; border: string }> = {
  new: { label: 'NEW', color: '#22d3ee', bg: 'rgba(34, 211, 238, 0.12)', border: 'rgba(34, 211, 238, 0.4)' },
  investigating: { label: 'INVESTIGATING', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.4)' },
  contained: { label: 'CONTAINED', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.4)' },
  resolved: { label: 'RESOLVED', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.12)', border: 'rgba(34, 197, 94, 0.4)' },
  closed: { label: 'CLOSED', color: '#64748b', bg: 'rgba(100, 116, 139, 0.12)', border: 'rgba(100, 116, 139, 0.4)' },
};

const PRIORITY_META: Record<CasePriority, { label: string; color: string }> = {
  critical: { label: 'P1 CRITICAL', color: '#ef4444' },
  high: { label: 'P2 HIGH', color: '#f97316' },
  medium: { label: 'P3 MEDIUM', color: '#eab308' },
  low: { label: 'P4 LOW', color: '#06b6d4' },
};

const TLP_META: Record<TLP, { label: string; color: string; bg: string }> = {
  red: { label: 'TLP:RED', color: '#ffffff', bg: '#dc2626' },
  amber: { label: 'TLP:AMBER', color: '#0a0e1a', bg: '#f59e0b' },
  green: { label: 'TLP:GREEN', color: '#0a0e1a', bg: '#22c55e' },
  white: { label: 'TLP:WHITE', color: '#0a0e1a', bg: '#f1f5f9' },
  clear: { label: 'TLP:CLEAR', color: '#0a0e1a', bg: '#f1f5f9' },
};

const STATUS_ORDER: CaseStatus[] = ['new', 'investigating', 'contained', 'resolved', 'closed'];

function formatRelative(iso?: string): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) {
    const future = Math.abs(ms);
    if (future < 3600000) return `in ${Math.round(future / 60000)}m`;
    if (future < 86400000) return `in ${Math.round(future / 3600000)}h`;
    return `in ${Math.round(future / 86400000)}d`;
  }
  if (ms < 60000) return 'just now';
  if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`;
  if (ms < 86400000) return `${Math.round(ms / 3600000)}h ago`;
  return `${Math.round(ms / 86400000)}d ago`;
}

function slaProgress(start: string, due?: string): number {
  if (!due) return 0;
  const startMs = new Date(start).getTime();
  const dueMs = new Date(due).getTime();
  const now = Date.now();
  if (dueMs <= startMs) return 100;
  const pct = ((now - startMs) / (dueMs - startMs)) * 100;
  return Math.max(0, Math.min(120, pct));
}

function slaTone(pct: number, breached: SLAState): { color: string; label: string } {
  if (breached === 'breached' || pct >= 100) return { color: '#ef4444', label: 'BREACHED' };
  if (pct >= 75) return { color: '#f97316', label: 'AT RISK' };
  if (pct >= 50) return { color: '#eab308', label: 'WATCH' };
  return { color: '#22c55e', label: 'ON TRACK' };
}

export default function CasesPanel() {
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<CasePriority | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<CaseStatus | 'all'>('all');
  const [selectedCase, setSelectedCase] = useState<CaseRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    loadCases();
    const interval = setInterval(loadCases, 15000);
    return () => clearInterval(interval);
  }, []);

  const loadCases = async () => {
    const { data, error } = await supabase
      .from('cases')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!error && data) setCases(data as CaseRow[]);
    setLoading(false);
  };

  const filtered = useMemo(() => {
    return cases.filter((c) => {
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          c.case_number.toLowerCase().includes(s) ||
          c.title.toLowerCase().includes(s) ||
          (c.category || '').toLowerCase().includes(s) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(s))
        );
      }
      return true;
    });
  }, [cases, search, priorityFilter, statusFilter]);

  const metrics = useMemo(() => computeMetrics(cases), [cases]);

  return (
    <div className="bg-[#070b14] min-h-full text-slate-200">
      <Header
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        search={search}
        onSearch={setSearch}
        priorityFilter={priorityFilter}
        onPriorityFilter={setPriorityFilter}
        statusFilter={statusFilter}
        onStatusFilter={setStatusFilter}
        onCreate={() => setShowCreate(true)}
        total={cases.length}
        filtered={filtered.length}
        metrics={metrics}
      />

      {loading ? (
        <div className="p-8 text-center text-slate-500 text-sm">Loading cases…</div>
      ) : viewMode === 'kanban' ? (
        <KanbanView cases={filtered} onSelect={setSelectedCase} />
      ) : viewMode === 'table' ? (
        <TableView cases={filtered} onSelect={setSelectedCase} />
      ) : (
        <MetricsView cases={cases} />
      )}

      {selectedCase && (
        <CaseDetailDrawer
          caseRow={selectedCase}
          onClose={() => setSelectedCase(null)}
          onChange={(c) => {
            setSelectedCase(c);
            setCases((prev) => prev.map((p) => (p.id === c.id ? c : p)));
          }}
        />
      )}

      {showCreate && (
        <CreateCaseModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setCases((prev) => [c, ...prev]);
            setShowCreate(false);
          }}
        />
      )}
    </div>
  );
}

function computeMetrics(cases: CaseRow[]) {
  const open = cases.filter((c) => !['resolved', 'closed'].includes(c.status));
  const breached = cases.filter((c) => c.sla_breach === 'breached').length;
  const atRisk = cases.filter((c) => c.sla_breach === 'at_risk').length;
  const totalImpact = cases.reduce((sum, c) => sum + (c.financial_impact_usd || 0), 0);
  const critical = cases.filter((c) => c.priority === 'critical' && !['resolved', 'closed'].includes(c.status)).length;
  return { open: open.length, breached, atRisk, totalImpact, critical };
}

function Header(props: {
  viewMode: ViewMode;
  onViewModeChange: (m: ViewMode) => void;
  search: string;
  onSearch: (s: string) => void;
  priorityFilter: CasePriority | 'all';
  onPriorityFilter: (p: CasePriority | 'all') => void;
  statusFilter: CaseStatus | 'all';
  onStatusFilter: (s: CaseStatus | 'all') => void;
  onCreate: () => void;
  total: number;
  filtered: number;
  metrics: ReturnType<typeof computeMetrics>;
}) {
  return (
    <div className="border-b border-[#1e293b] bg-[#0a0e1a]">
      <div className="px-6 py-4">
        <div className="flex items-start justify-between gap-6 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Briefcase size={14} className="text-cyan-400" />
              <span className="text-[10px] font-mono font-bold tracking-[0.25em] text-cyan-400">
                CASE MANAGEMENT
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-100 tracking-tight">
              Investigation Workspace
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Every alert that survives investigation lands here. Evidence-grade, SLA-bound, and
              audit-ready.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ViewToggleGroup current={props.viewMode} onChange={props.onViewModeChange} />
            <button
              onClick={props.onCreate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono font-bold tracking-wider hover:bg-cyan-500/25 transition-colors"
            >
              <Plus size={12} />
              NEW CASE
            </button>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-5 gap-3 mb-4">
          <KPICard icon={Activity} label="OPEN CASES" value={props.metrics.open.toString()} accent="#22d3ee" />
          <KPICard icon={Flame} label="P1 ACTIVE" value={props.metrics.critical.toString()} accent="#ef4444" />
          <KPICard icon={AlertTriangle} label="SLA AT RISK" value={props.metrics.atRisk.toString()} accent="#f97316" />
          <KPICard icon={AlertCircle} label="SLA BREACHED" value={props.metrics.breached.toString()} accent="#dc2626" />
          <KPICard
            icon={DollarSign}
            label="EST. IMPACT"
            value={`$${(props.metrics.totalImpact / 1000).toFixed(0)}k`}
            accent="#eab308"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
              placeholder="Search case #, title, tag…"
              className="w-full bg-[#070b14] border border-[#1e293b] rounded-md pl-8 pr-3 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500/50"
            />
          </div>
          <FilterChip
            label="PRIORITY"
            current={props.priorityFilter}
            options={['all', 'critical', 'high', 'medium', 'low']}
            onChange={(v) => props.onPriorityFilter(v as CasePriority | 'all')}
          />
          <FilterChip
            label="STATUS"
            current={props.statusFilter}
            options={['all', ...STATUS_ORDER]}
            onChange={(v) => props.onStatusFilter(v as CaseStatus | 'all')}
          />
          <span className="text-[10px] font-mono text-slate-500 ml-2">
            {props.filtered} of {props.total}
          </span>
        </div>
      </div>
    </div>
  );
}

function KPICard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-lg border p-3"
      style={{
        backgroundColor: '#070b14',
        borderColor: '#1e293b',
      }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500">
          {label}
        </span>
        <Icon size={11} style={{ color: accent }} />
      </div>
      <div className="text-2xl font-bold tracking-tight" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function ViewToggleGroup({
  current,
  onChange,
}: {
  current: ViewMode;
  onChange: (m: ViewMode) => void;
}) {
  const opts: { mode: ViewMode; label: string; icon: typeof LayoutGrid }[] = [
    { mode: 'kanban', label: 'KANBAN', icon: LayoutGrid },
    { mode: 'table', label: 'TABLE', icon: List },
    { mode: 'metrics', label: 'METRICS', icon: BarChart3 },
  ];
  return (
    <div className="flex items-center gap-0.5 bg-[#070b14] border border-[#1e293b] rounded-md p-0.5">
      {opts.map((o) => {
        const isActive = current === o.mode;
        const Icon = o.icon;
        return (
          <button
            key={o.mode}
            onClick={() => onChange(o.mode)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider transition-colors ${
              isActive
                ? 'bg-cyan-500/15 text-cyan-300'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Icon size={11} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function FilterChip({
  label,
  current,
  options,
  onChange,
}: {
  label: string;
  current: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1 bg-[#070b14] border border-[#1e293b] rounded-md px-2 py-1">
      <span className="text-[9px] font-mono font-bold tracking-wider text-slate-500">{label}</span>
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-[10px] font-mono text-slate-200 focus:outline-none uppercase tracking-wider"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-[#0a0e1a]">
            {o.toUpperCase()}
          </option>
        ))}
      </select>
    </div>
  );
}

function KanbanView({
  cases,
  onSelect,
}: {
  cases: CaseRow[];
  onSelect: (c: CaseRow) => void;
}) {
  return (
    <div className="px-6 py-5 overflow-x-auto">
      <div className="flex gap-3 min-w-max">
        {STATUS_ORDER.map((status) => {
          const meta = STATUS_META[status];
          const items = cases.filter((c) => c.status === status);
          return (
            <div key={status} className="w-[320px] flex-shrink-0">
              <div
                className="flex items-center justify-between mb-2 px-2 py-1.5 rounded border"
                style={{ backgroundColor: meta.bg, borderColor: meta.border }}
              >
                <div className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span
                    className="text-[10px] font-mono font-bold tracking-widest"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <span
                  className="text-[10px] font-mono font-bold"
                  style={{ color: meta.color }}
                >
                  {items.length}
                </span>
              </div>
              <div className="space-y-2 max-h-[calc(100vh-360px)] overflow-y-auto pr-1">
                {items.length === 0 ? (
                  <div className="rounded border border-dashed border-[#1e293b] p-6 text-center text-[10px] font-mono text-slate-600">
                    No cases
                  </div>
                ) : (
                  items.map((c) => <KanbanCard key={c.id} caseRow={c} onSelect={onSelect} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KanbanCard({ caseRow, onSelect }: { caseRow: CaseRow; onSelect: (c: CaseRow) => void }) {
  const priorityMeta = PRIORITY_META[caseRow.priority];
  const tlpMeta = TLP_META[caseRow.tlp || 'amber'];
  const slaPct = slaProgress(caseRow.created_at, caseRow.resolve_due_at);
  const slaInfo = slaTone(slaPct, caseRow.sla_breach);

  return (
    <button
      onClick={() => onSelect(caseRow)}
      className="w-full text-left rounded-lg border border-[#1e293b] bg-[#0a0e1a] hover:border-[#334155] transition-colors p-3 group"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono text-slate-500">{caseRow.case_number}</span>
        <span
          className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider"
          style={{ backgroundColor: tlpMeta.bg, color: tlpMeta.color }}
        >
          {tlpMeta.label}
        </span>
      </div>
      <div className="text-[12px] font-bold text-slate-100 mb-2 line-clamp-2 group-hover:text-cyan-300 transition-colors">
        {caseRow.title}
      </div>
      <div className="flex items-center gap-1 mb-2 flex-wrap">
        <span
          className="px-1.5 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider"
          style={{
            backgroundColor: `${priorityMeta.color}20`,
            color: priorityMeta.color,
            border: `1px solid ${priorityMeta.color}40`,
          }}
        >
          {priorityMeta.label}
        </span>
        {caseRow.kill_chain_phase && (
          <span className="px-1.5 py-0.5 rounded text-[8px] font-mono text-slate-400 bg-slate-800/50 border border-slate-700/50">
            {caseRow.kill_chain_phase}
          </span>
        )}
      </div>

      {/* Risk + confidence + impact */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        <Mini label="RISK" value={`${caseRow.risk_score}`} accent="#ef4444" />
        <Mini label="CONF" value={`${(caseRow.confidence * 100).toFixed(0)}%`} accent="#22d3ee" />
        <Mini
          label="IMPACT"
          value={`$${((caseRow.financial_impact_usd || 0) / 1000).toFixed(0)}k`}
          accent="#eab308"
        />
      </div>

      {/* SLA bar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-mono text-slate-500 tracking-wider">SLA</span>
          <span
            className="text-[9px] font-mono font-bold tracking-wider"
            style={{ color: slaInfo.color }}
          >
            {slaInfo.label}
          </span>
        </div>
        <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${Math.min(100, slaPct)}%`,
              backgroundColor: slaInfo.color,
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
        <span className="flex items-center gap-1">
          <User size={9} />
          {caseRow.assigned_to ? caseRow.assigned_to.split('@')[0] : 'unassigned'}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={9} />
          {formatRelative(caseRow.created_at)}
        </span>
      </div>
    </button>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded border px-1.5 py-1 text-center"
      style={{
        backgroundColor: `${accent}10`,
        borderColor: `${accent}30`,
      }}
    >
      <div className="text-[8px] font-mono font-bold tracking-wider text-slate-500">{label}</div>
      <div className="text-[11px] font-bold tabular-nums" style={{ color: accent }}>
        {value}
      </div>
    </div>
  );
}

function TableView({ cases, onSelect }: { cases: CaseRow[]; onSelect: (c: CaseRow) => void }) {
  return (
    <div className="px-6 py-4 overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left border-b border-[#1e293b] text-[9px] font-mono font-bold tracking-widest text-slate-500">
            <th className="py-2 pr-3">CASE</th>
            <th className="py-2 pr-3">TITLE</th>
            <th className="py-2 pr-3">PRIORITY</th>
            <th className="py-2 pr-3">STATUS</th>
            <th className="py-2 pr-3">RISK</th>
            <th className="py-2 pr-3">SLA</th>
            <th className="py-2 pr-3">IMPACT</th>
            <th className="py-2 pr-3">ASSIGNEE</th>
            <th className="py-2 pr-3">OPENED</th>
          </tr>
        </thead>
        <tbody>
          {cases.map((c) => {
            const sm = STATUS_META[c.status];
            const pm = PRIORITY_META[c.priority];
            const slaPct = slaProgress(c.created_at, c.resolve_due_at);
            const slaInfo = slaTone(slaPct, c.sla_breach);
            return (
              <tr
                key={c.id}
                onClick={() => onSelect(c)}
                className="border-b border-[#0f172a] hover:bg-[#0a0e1a] cursor-pointer transition-colors"
              >
                <td className="py-2 pr-3 font-mono text-slate-400">{c.case_number}</td>
                <td className="py-2 pr-3 text-slate-100 font-medium">{c.title}</td>
                <td className="py-2 pr-3">
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
                    style={{
                      backgroundColor: `${pm.color}15`,
                      color: pm.color,
                    }}
                  >
                    {pm.label}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
                    style={{ backgroundColor: sm.bg, color: sm.color }}
                  >
                    {sm.label}
                  </span>
                </td>
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-2">
                    <div className="w-12 h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full"
                        style={{
                          width: `${c.risk_score}%`,
                          backgroundColor: c.risk_score > 70 ? '#ef4444' : c.risk_score > 40 ? '#f97316' : '#22c55e',
                        }}
                      />
                    </div>
                    <span className="font-mono text-slate-300 tabular-nums">{c.risk_score}</span>
                  </div>
                </td>
                <td className="py-2 pr-3">
                  <span
                    className="font-mono font-bold text-[10px] tracking-wider"
                    style={{ color: slaInfo.color }}
                  >
                    {slaInfo.label}
                  </span>
                </td>
                <td className="py-2 pr-3 font-mono text-slate-300 tabular-nums">
                  ${((c.financial_impact_usd || 0) / 1000).toFixed(0)}k
                </td>
                <td className="py-2 pr-3 font-mono text-slate-400 text-[10px]">
                  {c.assigned_to ? c.assigned_to.split('@')[0] : '—'}
                </td>
                <td className="py-2 pr-3 font-mono text-slate-500 text-[10px]">
                  {formatRelative(c.created_at)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MetricsView({ cases }: { cases: CaseRow[] }) {
  const byPriority = useMemo(() => {
    const map: Record<CasePriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    cases.forEach((c) => {
      map[c.priority] = (map[c.priority] || 0) + 1;
    });
    return map;
  }, [cases]);

  const byStatus = useMemo(() => {
    const map: Record<CaseStatus, number> = {
      new: 0,
      investigating: 0,
      contained: 0,
      resolved: 0,
      closed: 0,
    };
    cases.forEach((c) => {
      map[c.status] = (map[c.status] || 0) + 1;
    });
    return map;
  }, [cases]);

  const mttr = useMemo(() => {
    const resolved = cases.filter((c) => c.resolved_at);
    if (resolved.length === 0) return 0;
    const total = resolved.reduce((sum, c) => {
      return sum + (new Date(c.resolved_at!).getTime() - new Date(c.created_at).getTime());
    }, 0);
    return total / resolved.length / 3600000;
  }, [cases]);

  const mtta = useMemo(() => {
    const ack = cases.filter((c) => c.acknowledged_at);
    if (ack.length === 0) return 0;
    const total = ack.reduce((sum, c) => {
      return sum + (new Date(c.acknowledged_at!).getTime() - new Date(c.created_at).getTime());
    }, 0);
    return total / ack.length / 60000;
  }, [cases]);

  return (
    <div className="px-6 py-5 space-y-4">
      <div className="grid grid-cols-4 gap-3">
        <BigStat label="MTTA" value={mtta > 0 ? `${mtta.toFixed(1)}m` : '—'} sublabel="Mean time to acknowledge" accent="#22d3ee" />
        <BigStat label="MTTR" value={mttr > 0 ? `${mttr.toFixed(1)}h` : '—'} sublabel="Mean time to resolve" accent="#22c55e" />
        <BigStat
          label="SLA HEALTH"
          value={`${Math.round((cases.filter((c) => c.sla_breach !== 'breached').length / Math.max(cases.length, 1)) * 100)}%`}
          sublabel="Cases on track or met"
          accent="#eab308"
        />
        <BigStat
          label="P1 BACKLOG"
          value={cases.filter((c) => c.priority === 'critical' && !['resolved', 'closed'].includes(c.status)).length.toString()}
          sublabel="Active critical cases"
          accent="#ef4444"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[#1e293b] bg-[#0a0e1a] p-4">
          <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-3">
            BY PRIORITY
          </div>
          <div className="space-y-2">
            {(['critical', 'high', 'medium', 'low'] as CasePriority[]).map((p) => {
              const meta = PRIORITY_META[p];
              const count = byPriority[p] || 0;
              const pct = cases.length > 0 ? (count / cases.length) * 100 : 0;
              return (
                <div key={p}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold tracking-wider" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                      {count}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[#1e293b] bg-[#0a0e1a] p-4">
          <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-3">
            BY STATUS
          </div>
          <div className="space-y-2">
            {STATUS_ORDER.map((s) => {
              const meta = STATUS_META[s];
              const count = byStatus[s] || 0;
              const pct = cases.length > 0 ? (count / cases.length) * 100 : 0;
              return (
                <div key={s}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-mono font-bold tracking-wider" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400 tabular-nums">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function BigStat({
  label,
  value,
  sublabel,
  accent,
}: {
  label: string;
  value: string;
  sublabel: string;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#0a0e1a] p-4">
      <div className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1">
        {label}
      </div>
      <div className="text-3xl font-bold tracking-tight tabular-nums" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-slate-400 mt-1">{sublabel}</div>
    </div>
  );
}

// ----- Detail Drawer -------------------------------------------------------

function CaseDetailDrawer({
  caseRow,
  onClose,
  onChange,
}: {
  caseRow: CaseRow;
  onClose: () => void;
  onChange: (c: CaseRow) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [evidence, setEvidence] = useState<CaseEvidence[]>([]);
  const [iocs, setIocs] = useState<CaseIOC[]>([]);
  const [attack, setAttack] = useState<CaseAttack[]>([]);
  const [actions, setActions] = useState<CaseAction[]>([]);
  const [watchers, setWatchers] = useState<CaseWatcher[]>([]);
  const [audit, setAudit] = useState<CaseAudit[]>([]);

  useEffect(() => {
    loadAll();
  }, [caseRow.id]);

  const loadAll = async () => {
    const [ev, io, at, ac, wa, au] = await Promise.all([
      supabase.from('case_evidence').select('*').eq('case_id', caseRow.id).order('collected_at', { ascending: false }),
      supabase.from('case_iocs').select('*').eq('case_id', caseRow.id).order('first_seen', { ascending: false }),
      supabase.from('case_attack_techniques').select('*').eq('case_id', caseRow.id),
      supabase.from('case_actions').select('*').eq('case_id', caseRow.id).order('created_at', { ascending: false }),
      supabase.from('case_watchers').select('*').eq('case_id', caseRow.id),
      supabase.from('case_audit_log').select('*').eq('case_id', caseRow.id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (ev.data) setEvidence(ev.data as CaseEvidence[]);
    if (io.data) setIocs(io.data as CaseIOC[]);
    if (at.data) setAttack(at.data as CaseAttack[]);
    if (ac.data) setActions(ac.data as CaseAction[]);
    if (wa.data) setWatchers(wa.data as CaseWatcher[]);
    if (au.data) setAudit(au.data as CaseAudit[]);
  };

  const updateStatus = async (newStatus: CaseStatus) => {
    const update: Partial<CaseRow> = { status: newStatus };
    if (newStatus === 'investigating' && !caseRow.acknowledged_at) {
      update.acknowledged_at = new Date().toISOString();
    }
    if (newStatus === 'contained' && !caseRow.contained_at) {
      update.contained_at = new Date().toISOString();
    }
    if (newStatus === 'resolved') {
      update.resolved_at = new Date().toISOString();
    }
    if (newStatus === 'closed') {
      update.closed_at = new Date().toISOString();
    }
    const { data, error } = await supabase
      .from('cases')
      .update(update)
      .eq('id', caseRow.id)
      .select()
      .maybeSingle();
    if (!error && data) {
      onChange(data as CaseRow);
      await supabase.from('case_audit_log').insert({
        case_id: caseRow.id,
        actor: 'analyst@acme.com',
        action: 'status.changed',
        field_changed: 'status',
        old_value: caseRow.status,
        new_value: newStatus,
        metadata: {},
      });
      loadAll();
    }
  };

  const tabs: { id: DetailTab; label: string; icon: typeof Eye; count?: number }[] = [
    { id: 'overview', label: 'Overview', icon: Eye },
    { id: 'timeline', label: 'Timeline', icon: Clock },
    { id: 'evidence', label: 'Evidence', icon: FileCheck2, count: evidence.length },
    { id: 'iocs', label: 'IOCs', icon: Crosshair, count: iocs.length },
    { id: 'attack', label: 'ATT&CK', icon: Target, count: attack.length },
    { id: 'actions', label: 'Actions', icon: Zap, count: actions.length },
    { id: 'collab', label: 'Collab', icon: MessageSquare, count: watchers.length },
    { id: 'audit', label: 'Audit', icon: Lock, count: audit.length },
  ];

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-slate-950/70 backdrop-blur-sm" onClick={onClose} />
      <div className="w-[68%] max-w-[1300px] bg-[#0a0e1a] border-l border-[#1e293b] flex flex-col overflow-hidden">
        {/* Drawer header */}
        <DrawerHeader
          caseRow={caseRow}
          onClose={onClose}
          onUpdateStatus={updateStatus}
        />

        {/* Tabs */}
        <div className="flex items-center gap-0 border-b border-[#1e293b] bg-[#070b14] px-4 overflow-x-auto">
          {tabs.map((t) => {
            const Icon = t.icon;
            const isActive = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2.5 text-[10px] font-mono font-bold tracking-wider border-b-2 transition-colors whitespace-nowrap ${
                  isActive
                    ? 'border-cyan-400 text-cyan-300'
                    : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}
              >
                <Icon size={11} />
                {t.label.toUpperCase()}
                {t.count !== undefined && (
                  <span className="px-1 py-0.5 rounded bg-slate-800 text-slate-400 text-[8px] tabular-nums">
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'overview' && <OverviewTab caseRow={caseRow} attack={attack} iocs={iocs} />}
          {tab === 'timeline' && <TimelineTab caseRow={caseRow} audit={audit} actions={actions} />}
          {tab === 'evidence' && <EvidenceTab evidence={evidence} />}
          {tab === 'iocs' && <IOCTab iocs={iocs} />}
          {tab === 'attack' && <AttackTab attack={attack} />}
          {tab === 'actions' && <ActionsTab actions={actions} caseId={caseRow.id} onChange={loadAll} />}
          {tab === 'collab' && <CollabTab caseId={caseRow.id} watchers={watchers} onChange={loadAll} />}
          {tab === 'audit' && <AuditTab audit={audit} />}
        </div>
      </div>
    </div>
  );
}

function DrawerHeader({
  caseRow,
  onClose,
  onUpdateStatus,
}: {
  caseRow: CaseRow;
  onClose: () => void;
  onUpdateStatus: (s: CaseStatus) => void;
}) {
  const sm = STATUS_META[caseRow.status];
  const pm = PRIORITY_META[caseRow.priority];
  const tlp = TLP_META[caseRow.tlp || 'amber'];
  const slaPct = slaProgress(caseRow.created_at, caseRow.resolve_due_at);
  const slaInfo = slaTone(slaPct, caseRow.sla_breach);

  return (
    <div className="border-b border-[#1e293b] bg-[#0a0e1a] p-5">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className="font-mono text-[11px] text-slate-400">{caseRow.case_number}</span>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
              style={{ backgroundColor: tlp.bg, color: tlp.color }}
            >
              {tlp.label}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
              style={{ backgroundColor: `${pm.color}15`, color: pm.color, border: `1px solid ${pm.color}40` }}
            >
              {pm.label}
            </span>
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
              style={{ backgroundColor: sm.bg, color: sm.color }}
            >
              {sm.label}
            </span>
            {caseRow.parent_case_id && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-slate-800/50 border border-slate-700/50 flex items-center gap-1">
                <Link2 size={9} />
                child case
              </span>
            )}
          </div>
          <h3 className="text-xl font-bold text-slate-100 tracking-tight mb-1">{caseRow.title}</h3>
          {caseRow.description && (
            <p className="text-[12px] text-slate-400 leading-relaxed">{caseRow.description}</p>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Metric strip */}
      <div className="grid grid-cols-6 gap-2 mb-3">
        <Mini label="RISK" value={`${caseRow.risk_score}/100`} accent="#ef4444" />
        <Mini label="CONFIDENCE" value={`${(caseRow.confidence * 100).toFixed(0)}%`} accent="#22d3ee" />
        <Mini label="IMPACT" value={`$${((caseRow.financial_impact_usd || 0) / 1000).toFixed(0)}k`} accent="#eab308" />
        <Mini label="ASSETS" value={`${(caseRow.affected_assets || []).length}`} accent="#3b82f6" />
        <Mini label="IDENTITIES" value={`${(caseRow.affected_identities || []).length}`} accent="#a855f7" />
        <Mini label="OPENED" value={`P${caseRow.opened_at_phase}`} accent="#22c55e" />
      </div>

      {/* SLA bars */}
      <div className="space-y-2">
        <SLAStrip
          label="ACKNOWLEDGE"
          start={caseRow.created_at}
          due={caseRow.ack_due_at}
          met={!!caseRow.acknowledged_at}
        />
        <SLAStrip
          label="CONTAIN"
          start={caseRow.created_at}
          due={caseRow.contain_due_at}
          met={!!caseRow.contained_at}
        />
        <SLAStrip
          label="RESOLVE"
          start={caseRow.created_at}
          due={caseRow.resolve_due_at}
          met={!!caseRow.resolved_at}
        />
      </div>

      {/* Status actions */}
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-[#1e293b]">
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500">
            ADVANCE STATUS:
          </span>
          {STATUS_ORDER.map((s) => {
            if (s === caseRow.status) return null;
            const meta = STATUS_META[s];
            return (
              <button
                key={s}
                onClick={() => onUpdateStatus(s)}
                className="px-2 py-1 rounded text-[10px] font-mono font-bold tracking-wider hover:opacity-80 transition-opacity"
                style={{ backgroundColor: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
        <span
          className="text-[10px] font-mono font-bold tracking-wider"
          style={{ color: slaInfo.color }}
        >
          SLA {slaInfo.label}
        </span>
      </div>
    </div>
  );
}

function SLAStrip({
  label,
  start,
  due,
  met,
}: {
  label: string;
  start: string;
  due?: string;
  met: boolean;
}) {
  const pct = slaProgress(start, due);
  const info = slaTone(pct, met ? 'met' : 'on_track');
  const color = met ? '#22c55e' : info.color;
  return (
    <div>
      <div className="flex items-center justify-between mb-1 text-[9px] font-mono">
        <span className="text-slate-500 tracking-widest">{label}</span>
        <span className="tabular-nums" style={{ color }}>
          {met ? `met · ${formatRelative(start)}` : due ? `due ${formatRelative(due)}` : '—'}
        </span>
      </div>
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full transition-all"
          style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ----- Tabs ----------------------------------------------------------------

function OverviewTab({
  caseRow,
  attack,
  iocs,
}: {
  caseRow: CaseRow;
  attack: CaseAttack[];
  iocs: CaseIOC[];
}) {
  return (
    <div className="space-y-5">
      {/* AI summary */}
      {caseRow.ai_summary && (
        <SectionCard
          icon={Bot}
          accent="#22d3ee"
          title="AI INVESTIGATION SUMMARY"
          subtitle="Generated by Investigation Agent · grounded in evidence bundle"
        >
          <p className="text-[12px] text-slate-200 leading-relaxed">{caseRow.ai_summary}</p>
        </SectionCard>
      )}

      <div className="grid grid-cols-2 gap-4">
        <SectionCard icon={Network} accent="#3b82f6" title="AFFECTED ASSETS" subtitle="Resources touched by this incident">
          {(caseRow.affected_assets || []).length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No assets bound yet.</p>
          ) : (
            <div className="space-y-1.5">
              {caseRow.affected_assets.map((a) => (
                <div
                  key={a}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/40 border border-slate-700/40 text-[11px] font-mono text-slate-200"
                >
                  <Hash size={10} className="text-slate-500" />
                  {a}
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Users} accent="#a855f7" title="AFFECTED IDENTITIES" subtitle="Users / service principals">
          {(caseRow.affected_identities || []).length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No identities bound yet.</p>
          ) : (
            <div className="space-y-1.5">
              {caseRow.affected_identities.map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/40 border border-slate-700/40 text-[11px] font-mono text-slate-200"
                >
                  <User size={10} className="text-slate-500" />
                  {i}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <SectionCard icon={Target} accent="#ef4444" title="MITRE ATT&CK COVERAGE" subtitle="Mapped techniques with confidence">
          {attack.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No techniques mapped yet.</p>
          ) : (
            <div className="space-y-2">
              {attack.slice(0, 4).map((a) => (
                <div key={a.id} className="rounded border border-[#1e293b] bg-[#070b14] p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-mono font-bold text-red-400">
                      {a.technique_id}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">
                      {(a.confidence * 100).toFixed(0)}% conf
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-200">{a.technique_name}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{a.tactic}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard icon={Crosshair} accent="#eab308" title="KEY INDICATORS" subtitle="Top IOCs by confidence">
          {iocs.length === 0 ? (
            <p className="text-[11px] text-slate-500 italic">No indicators yet.</p>
          ) : (
            <div className="space-y-1.5">
              {iocs.slice(0, 5).map((i) => {
                const tlp = TLP_META[i.tlp] || TLP_META.amber;
                return (
                  <div
                    key={i.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/40 border border-slate-700/40"
                  >
                    <span
                      className="px-1 py-0.5 rounded text-[8px] font-mono font-bold tracking-wider"
                      style={{ backgroundColor: tlp.bg, color: tlp.color }}
                    >
                      {i.ioc_type.toUpperCase()}
                    </span>
                    <span className="text-[11px] font-mono text-slate-200 truncate flex-1">
                      {i.ioc_value}
                    </span>
                    {i.is_blocked && (
                      <ShieldCheck size={11} className="text-green-400 flex-shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>

      {/* Provenance */}
      <SectionCard icon={GitBranch} accent="#22c55e" title="CASE PROVENANCE" subtitle="How this case was born">
        <div className="grid grid-cols-3 gap-3 text-[11px]">
          <ProvenanceCell label="Originating Alert" value={caseRow.originating_alert_id || '—'} icon={Bell} />
          <ProvenanceCell label="Opened at Phase" value={`Phase ${caseRow.opened_at_phase}`} icon={Activity} />
          <ProvenanceCell label="Playbook" value={caseRow.playbook_id || '—'} icon={PlayCircle} />
          <ProvenanceCell label="External Ticket" value={caseRow.external_ticket_id || '—'} icon={Link2} />
          <ProvenanceCell label="Kill Chain Phase" value={caseRow.kill_chain_phase || '—'} icon={Target} />
          <ProvenanceCell label="Created By" value={caseRow.created_by || '—'} icon={User} />
        </div>
      </SectionCard>
    </div>
  );
}

function ProvenanceCell({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Eye;
}) {
  return (
    <div className="rounded border border-[#1e293b] bg-[#070b14] p-2.5">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon size={10} className="text-slate-500" />
        <span className="text-[9px] font-mono font-bold tracking-widest text-slate-500">
          {label}
        </span>
      </div>
      <div className="text-[12px] font-mono text-slate-200 truncate">{value}</div>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  accent,
  title,
  subtitle,
  children,
}: {
  icon: typeof Eye;
  accent: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border p-4"
      style={{
        backgroundColor: '#070b14',
        borderColor: `${accent}33`,
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Icon size={12} style={{ color: accent }} />
        <span
          className="text-[10px] font-mono font-bold tracking-widest"
          style={{ color: accent }}
        >
          {title}
        </span>
        {subtitle && <span className="text-[10px] text-slate-500">· {subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function TimelineTab({
  caseRow,
  audit,
  actions,
}: {
  caseRow: CaseRow;
  audit: CaseAudit[];
  actions: CaseAction[];
}) {
  const merged = useMemo(() => {
    type Entry = { at: string; kind: 'birth' | 'audit' | 'action'; title: string; body: string; actor: string };
    const list: Entry[] = [];
    list.push({
      at: caseRow.created_at,
      kind: 'birth',
      title: 'Case opened',
      body: `Born from alert ${caseRow.originating_alert_id || '—'} at pipeline phase ${caseRow.opened_at_phase}.`,
      actor: 'system',
    });
    audit.forEach((a) => {
      list.push({
        at: a.created_at,
        kind: 'audit',
        title: a.action,
        body: a.field_changed ? `${a.field_changed}: ${a.old_value} -> ${a.new_value}` : '',
        actor: a.actor,
      });
    });
    actions.forEach((a) => {
      list.push({
        at: a.executed_at || a.approved_at || a.created_at || new Date().toISOString(),
        kind: 'action',
        title: `${a.action_name}`,
        body: a.result_summary || `${a.action_type} · ${a.status}`,
        actor: a.executed_by || a.approved_by || 'pending',
      });
    });
    list.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return list;
  }, [caseRow, audit, actions]);

  return (
    <div className="relative">
      <div className="absolute left-[15px] top-1 bottom-1 w-px bg-[#1e293b]" />
      <div className="space-y-3">
        {merged.map((entry, i) => {
          const accent =
            entry.kind === 'birth' ? '#22c55e' : entry.kind === 'action' ? '#f97316' : '#22d3ee';
          const Icon = entry.kind === 'birth' ? Briefcase : entry.kind === 'action' ? Zap : FileText;
          return (
            <div key={i} className="flex items-start gap-3">
              <div
                className="relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center flex-shrink-0 border-2"
                style={{
                  backgroundColor: '#070b14',
                  borderColor: accent,
                  color: accent,
                }}
              >
                <Icon size={11} />
              </div>
              <div className="flex-1 rounded border border-[#1e293b] bg-[#070b14] p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-bold text-slate-100">{entry.title}</span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {formatRelative(entry.at)}
                  </span>
                </div>
                {entry.body && <p className="text-[11px] text-slate-400">{entry.body}</p>}
                <div className="text-[9px] font-mono text-slate-500 mt-1">by {entry.actor}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EvidenceTab({ evidence }: { evidence: CaseEvidence[] }) {
  if (evidence.length === 0) {
    return <Empty icon={FileCheck2} message="No evidence collected yet." />;
  }
  return (
    <div className="space-y-3">
      {evidence.map((e) => (
        <div
          key={e.id}
          className="rounded-lg border border-[#1e293b] bg-[#070b14] p-3"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <FileCheck2 size={12} className="text-cyan-400" />
              <span className="text-[12px] font-bold text-slate-100">{e.title}</span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/50 uppercase tracking-wider">
                {e.evidence_type}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {e.is_sealed && (
                <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-green-500/10 text-green-400 border border-green-500/30">
                  <Lock size={9} />
                  SEALED
                </span>
              )}
              <span className="text-[9px] font-mono text-slate-500">
                {(e.confidence * 100).toFixed(0)}% conf
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-300 mb-2">{e.description}</p>
          <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mb-2">
            <div>
              <span className="text-slate-500">Source: </span>
              <span className="text-slate-200">{e.source_system}</span>
            </div>
            <div>
              <span className="text-slate-500">Collected: </span>
              <span className="text-slate-200">{formatRelative(e.collected_at)}</span>
            </div>
            <div>
              <span className="text-slate-500">Size: </span>
              <span className="text-slate-200">{(e.size_bytes / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <div className="rounded bg-slate-900 border border-slate-800 p-2 mb-2">
            <div className="text-[9px] font-mono text-slate-500 mb-0.5">SHA-256</div>
            <div className="text-[10px] font-mono text-slate-300 truncate">{e.sha256}</div>
          </div>
          {Array.isArray(e.custody_chain) && e.custody_chain.length > 0 && (
            <div>
              <div className="text-[9px] font-mono font-bold tracking-widest text-slate-500 mb-1">
                CHAIN OF CUSTODY
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {e.custody_chain.map((c, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-slate-800/50 border border-slate-700/50 text-[9px] font-mono"
                  >
                    <Bot size={9} className="text-cyan-400" />
                    <span className="text-slate-300">{c.actor}</span>
                    <span className="text-slate-500">·</span>
                    <span className="text-slate-400">{c.action}</span>
                    {i < e.custody_chain.length - 1 && (
                      <ChevronRight size={9} className="text-slate-600" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function IOCTab({ iocs }: { iocs: CaseIOC[] }) {
  if (iocs.length === 0) return <Empty icon={Crosshair} message="No indicators yet." />;
  return (
    <div className="space-y-2">
      {iocs.map((i) => {
        const tlp = TLP_META[i.tlp] || TLP_META.amber;
        return (
          <div
            key={i.id}
            className="flex items-center gap-3 rounded border border-[#1e293b] bg-[#070b14] p-3"
          >
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-mono font-bold tracking-wider"
              style={{ backgroundColor: tlp.bg, color: tlp.color }}
            >
              {tlp.label}
            </span>
            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/50 uppercase tracking-wider">
              {i.ioc_type}
            </span>
            <span className="text-[12px] font-mono text-slate-100 flex-1 truncate">
              {i.ioc_value}
            </span>
            <span className="text-[10px] font-mono text-slate-400">{i.feed_source}</span>
            <span className="text-[10px] font-mono text-slate-500">
              {(i.confidence * 100).toFixed(0)}%
            </span>
            {i.is_blocked ? (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-green-500/10 text-green-400 border border-green-500/30">
                <Shield size={9} />
                BLOCKED
              </span>
            ) : (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-700/30 text-slate-400 border border-slate-700/40">
                MONITOR
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AttackTab({ attack }: { attack: CaseAttack[] }) {
  if (attack.length === 0) return <Empty icon={Target} message="No ATT&CK techniques mapped yet." />;
  const tactics = useMemo(() => {
    const map: Record<string, CaseAttack[]> = {};
    attack.forEach((a) => {
      const k = a.tactic || 'Other';
      if (!map[k]) map[k] = [];
      map[k].push(a);
    });
    return map;
  }, [attack]);

  return (
    <div className="space-y-3">
      {Object.entries(tactics).map(([tactic, items]) => (
        <div
          key={tactic}
          className="rounded-lg border border-[#1e293b] bg-[#070b14] p-3"
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Target size={11} className="text-red-400" />
            <span className="text-[11px] font-mono font-bold tracking-widest text-red-400">
              {tactic.toUpperCase()}
            </span>
            <span className="text-[9px] font-mono text-slate-500">{items.length} technique(s)</span>
          </div>
          <div className="space-y-2">
            {items.map((a) => (
              <div key={a.id} className="rounded border border-slate-800 bg-slate-900/40 p-2.5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-mono font-bold text-red-400">
                    {a.technique_id}
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full bg-red-400"
                        style={{ width: `${a.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[9px] font-mono text-slate-400 tabular-nums">
                      {(a.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <div className="text-[12px] text-slate-100 mb-1">{a.technique_name}</div>
                {a.evidence_summary && (
                  <p className="text-[10px] text-slate-400">{a.evidence_summary}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionsTab({
  actions,
  caseId,
  onChange,
}: {
  actions: CaseAction[];
  caseId: string;
  onChange: () => void;
}) {
  const approve = async (id: string) => {
    await supabase
      .from('case_actions')
      .update({ status: 'approved', approved_by: 'analyst@acme.com', approved_at: new Date().toISOString() })
      .eq('id', id);
    await supabase.from('case_audit_log').insert({
      case_id: caseId,
      actor: 'analyst@acme.com',
      action: 'action.approved',
      field_changed: 'status',
      new_value: 'approved',
    });
    onChange();
  };

  const execute = async (id: string) => {
    await supabase
      .from('case_actions')
      .update({ status: 'completed', executed_by: 'response-agent', executed_at: new Date().toISOString(), result_summary: 'Executed via SOAR connector with audit trail.' })
      .eq('id', id);
    onChange();
  };

  if (actions.length === 0) return <Empty icon={Zap} message="No response actions yet." />;
  return (
    <div className="space-y-2">
      {actions.map((a) => {
        const statusColor =
          a.status === 'completed'
            ? '#22c55e'
            : a.status === 'failed' || a.status === 'rejected' || a.status === 'rolled_back'
              ? '#ef4444'
              : a.status === 'executing'
                ? '#22d3ee'
                : a.status === 'approved'
                  ? '#3b82f6'
                  : '#eab308';
        return (
          <div
            key={a.id}
            className="rounded-lg border border-[#1e293b] bg-[#070b14] p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap size={11} className="text-orange-400" />
                <span className="text-[12px] font-bold text-slate-100">{a.action_name}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-slate-400 bg-slate-800/60 border border-slate-700/50 uppercase tracking-wider">
                  {a.action_type}
                </span>
                {a.requires_approval && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <ShieldCheck size={9} />
                    APPROVAL
                  </span>
                )}
                {a.reversible ? (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-green-400 bg-green-500/10 border border-green-500/30">
                    REVERSIBLE
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-mono text-red-400 bg-red-500/10 border border-red-500/30">
                    IRREVERSIBLE
                  </span>
                )}
              </div>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-mono font-bold tracking-wider uppercase"
                style={{ backgroundColor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}40` }}
              >
                {a.status}
              </span>
            </div>
            {a.result_summary && (
              <p className="text-[11px] text-slate-300 mb-2">{a.result_summary}</p>
            )}
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              {a.approved_by && (
                <div>
                  <span className="text-slate-500">Approved by: </span>
                  <span className="text-slate-200">{a.approved_by}</span>
                </div>
              )}
              {a.executed_by && (
                <div>
                  <span className="text-slate-500">Executed by: </span>
                  <span className="text-slate-200">{a.executed_by}</span>
                </div>
              )}
              {a.executed_at && (
                <div>
                  <span className="text-slate-500">When: </span>
                  <span className="text-slate-200">{formatRelative(a.executed_at)}</span>
                </div>
              )}
              {a.rollback_handle && (
                <div>
                  <span className="text-slate-500">Rollback: </span>
                  <span className="text-slate-200">{a.rollback_handle}</span>
                </div>
              )}
            </div>
            {a.status === 'pending' && a.requires_approval && (
              <div className="mt-2 pt-2 border-t border-[#1e293b] flex items-center gap-2">
                <button
                  onClick={() => approve(a.id)}
                  className="px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider bg-blue-500/15 text-blue-400 border border-blue-500/40 hover:bg-blue-500/25 transition-colors"
                >
                  APPROVE
                </button>
                <span className="text-[10px] font-mono text-slate-500">
                  Held at the approval gate · awaiting analyst sign-off
                </span>
              </div>
            )}
            {a.status === 'approved' && (
              <div className="mt-2 pt-2 border-t border-[#1e293b] flex items-center gap-2">
                <button
                  onClick={() => execute(a.id)}
                  className="px-2.5 py-1 rounded text-[10px] font-mono font-bold tracking-wider bg-orange-500/15 text-orange-400 border border-orange-500/40 hover:bg-orange-500/25 transition-colors flex items-center gap-1.5"
                >
                  <PlayCircle size={11} />
                  EXECUTE
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CollabTab({
  caseId,
  watchers,
  onChange,
}: {
  caseId: string;
  watchers: CaseWatcher[];
  onChange: () => void;
}) {
  const [comments, setComments] = useState<{ id: string; author: string; comment: string; created_at: string }[]>([]);
  const [body, setBody] = useState('');

  useEffect(() => {
    supabase
      .from('case_comments')
      .select('*')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setComments(data || []));
  }, [caseId]);

  const post = async () => {
    if (!body.trim()) return;
    const { data } = await supabase
      .from('case_comments')
      .insert({ case_id: caseId, author: 'analyst@acme.com', comment: body, is_internal: true })
      .select()
      .maybeSingle();
    if (data) {
      setComments((c) => [data as typeof comments[0], ...c]);
      setBody('');
      await supabase.from('case_audit_log').insert({
        case_id: caseId,
        actor: 'analyst@acme.com',
        action: 'comment.added',
      });
      onChange();
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard icon={Users} accent="#a855f7" title="WATCHERS" subtitle="Subscribed for updates">
        {watchers.length === 0 ? (
          <p className="text-[11px] text-slate-500 italic">No watchers.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {watchers.map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded bg-slate-800/40 border border-slate-700/40 text-[11px] font-mono"
              >
                <User size={10} className="text-slate-400" />
                <span className="text-slate-200">{w.watcher_user}</span>
                <span className="text-slate-500">· {w.watcher_role}</span>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard icon={MessageSquare} accent="#22d3ee" title="ANALYST NOTES" subtitle="Threaded collaboration">
        <div className="mb-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Add an investigation note…"
            className="w-full bg-[#0a0e1a] border border-[#1e293b] rounded p-2 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500/50 min-h-[60px]"
          />
          <button
            onClick={post}
            className="mt-2 px-3 py-1.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[10px] font-mono font-bold tracking-wider hover:bg-cyan-500/25 transition-colors"
          >
            POST NOTE
          </button>
        </div>
        <div className="space-y-2">
          {comments.map((c) => (
            <div key={c.id} className="rounded border border-[#1e293b] bg-[#0a0e1a] p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-slate-300">{c.author}</span>
                <span className="text-[9px] font-mono text-slate-500">
                  {formatRelative(c.created_at)}
                </span>
              </div>
              <p className="text-[11px] text-slate-200 whitespace-pre-wrap">{c.comment}</p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

function AuditTab({ audit }: { audit: CaseAudit[] }) {
  if (audit.length === 0) return <Empty icon={Lock} message="No audit entries yet." />;
  return (
    <div className="rounded-lg border border-[#1e293b] bg-[#070b14] overflow-hidden">
      <div className="px-3 py-2 bg-[#0a0e1a] border-b border-[#1e293b] flex items-center gap-2">
        <Lock size={11} className="text-slate-400" />
        <span className="text-[10px] font-mono font-bold tracking-widest text-slate-400">
          IMMUTABLE AUDIT TRAIL
        </span>
      </div>
      <div className="divide-y divide-[#0f172a]">
        {audit.map((a) => (
          <div key={a.id} className="px-3 py-2 grid grid-cols-12 gap-3 text-[10px] font-mono">
            <span className="col-span-2 text-slate-500">{formatRelative(a.created_at)}</span>
            <span className="col-span-2 text-slate-300">{a.actor}</span>
            <span className="col-span-2 text-cyan-400">{a.action}</span>
            <span className="col-span-2 text-slate-400">{a.field_changed || '—'}</span>
            <span className="col-span-4 text-slate-300 truncate">
              {a.old_value && (
                <>
                  <span className="text-slate-600">{a.old_value}</span>
                  <span className="text-slate-500"> -&gt; </span>
                </>
              )}
              <span>{a.new_value || '—'}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({ icon: Icon, message }: { icon: typeof Eye; message: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[#1e293b] bg-[#070b14] p-12 text-center">
      <Icon size={28} className="mx-auto mb-3 text-slate-600" />
      <p className="text-[11px] text-slate-500">{message}</p>
    </div>
  );
}

// ----- Create Modal --------------------------------------------------------

interface CaseTemplate {
  id: string;
  template_name: string;
  case_type: string;
  default_priority: string;
  default_severity: string;
  ack_minutes: number;
  contain_minutes: number;
  resolve_minutes: number;
  default_playbook_id: string;
  default_attack_techniques: string[];
  description: string;
}

function CreateCaseModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (c: CaseRow) => void;
}) {
  const [templates, setTemplates] = useState<CaseTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<CaseTemplate | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<CasePriority>('high');
  const [tlp, setTlp] = useState<TLP>('amber');

  useEffect(() => {
    supabase
      .from('case_templates')
      .select('*')
      .order('template_name')
      .then(({ data }) => setTemplates((data as CaseTemplate[]) || []));
  }, []);

  const applyTemplate = (t: CaseTemplate) => {
    setSelectedTemplate(t);
    if (!title) setTitle(t.template_name);
    if (!description) setDescription(t.description);
    setPriority((t.default_priority as CasePriority) || 'high');
  };

  const create = async () => {
    if (!title.trim()) return;
    const now = new Date();
    const ackMin = selectedTemplate?.ack_minutes || 30;
    const containMin = selectedTemplate?.contain_minutes || 240;
    const resolveMin = selectedTemplate?.resolve_minutes || 1440;
    const caseNumber = `CASE-${now.getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`;
    const { data, error } = await supabase
      .from('cases')
      .insert({
        case_number: caseNumber,
        title,
        description,
        status: 'new',
        priority,
        severity: priority,
        category: selectedTemplate?.case_type || 'general',
        created_by: 'analyst@acme.com',
        tlp,
        risk_score: priority === 'critical' ? 90 : priority === 'high' ? 70 : priority === 'medium' ? 45 : 20,
        confidence: 0.7,
        playbook_id: selectedTemplate?.default_playbook_id || '',
        ack_due_at: new Date(now.getTime() + ackMin * 60000).toISOString(),
        contain_due_at: new Date(now.getTime() + containMin * 60000).toISOString(),
        resolve_due_at: new Date(now.getTime() + resolveMin * 60000).toISOString(),
        opened_at_phase: 7,
      })
      .select()
      .maybeSingle();

    if (!error && data) {
      const newCase = data as CaseRow;
      if (selectedTemplate?.default_attack_techniques?.length) {
        await Promise.all(
          selectedTemplate.default_attack_techniques.map((tid) =>
            supabase.from('case_attack_techniques').insert({
              case_id: newCase.id,
              technique_id: tid,
              technique_name: tid,
              tactic: 'From template',
              confidence: 0.6,
            }),
          ),
        );
      }
      await supabase.from('case_audit_log').insert({
        case_id: newCase.id,
        actor: 'analyst@acme.com',
        action: 'case.created',
        field_changed: 'status',
        new_value: 'new',
        metadata: { template: selectedTemplate?.template_name || null },
      });
      onCreated(newCase);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-6">
      <div className="w-full max-w-2xl bg-[#0a0e1a] border border-[#1e293b] rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-[#1e293b] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Briefcase size={14} className="text-cyan-400" />
            <span className="text-[11px] font-mono font-bold tracking-widest text-cyan-400">
              NEW CASE
            </span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-200 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1.5 block">
              START FROM TEMPLATE
            </label>
            <div className="grid grid-cols-1 gap-2">
              {templates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => applyTemplate(t)}
                  className={`text-left rounded border p-2.5 transition-colors ${
                    selectedTemplate?.id === t.id
                      ? 'border-cyan-400/60 bg-cyan-500/5'
                      : 'border-[#1e293b] bg-[#070b14] hover:border-[#334155]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[12px] font-bold text-slate-100">{t.template_name}</span>
                    <span className="text-[9px] font-mono text-slate-500 uppercase">
                      {t.case_type.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">{t.description}</p>
                  <div className="flex items-center gap-2 mt-1.5 text-[9px] font-mono text-slate-500">
                    <span>ack {t.ack_minutes}m</span>
                    <span>·</span>
                    <span>contain {t.contain_minutes}m</span>
                    <span>·</span>
                    <span>resolve {t.resolve_minutes}m</span>
                    <span>·</span>
                    <span className="text-slate-400">{t.default_playbook_id}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1.5 block">
              TITLE
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Concise case title"
              className="w-full bg-[#070b14] border border-[#1e293b] rounded px-2.5 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-cyan-500/50"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1.5 block">
              DESCRIPTION
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened, what's the suspected blast radius, and what's already known?"
              className="w-full bg-[#070b14] border border-[#1e293b] rounded px-2.5 py-1.5 text-[11px] text-slate-200 focus:outline-none focus:border-cyan-500/50 min-h-[100px]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1.5 block">
                PRIORITY
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as CasePriority)}
                className="w-full bg-[#070b14] border border-[#1e293b] rounded px-2.5 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="critical">P1 Critical</option>
                <option value="high">P2 High</option>
                <option value="medium">P3 Medium</option>
                <option value="low">P4 Low</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold tracking-widest text-slate-500 mb-1.5 block">
                TLP
              </label>
              <select
                value={tlp}
                onChange={(e) => setTlp(e.target.value as TLP)}
                className="w-full bg-[#070b14] border border-[#1e293b] rounded px-2.5 py-1.5 text-[12px] text-slate-200 focus:outline-none focus:border-cyan-500/50"
              >
                <option value="red">TLP:RED</option>
                <option value="amber">TLP:AMBER</option>
                <option value="green">TLP:GREEN</option>
                <option value="white">TLP:WHITE</option>
              </select>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-[#1e293b] flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
          >
            CANCEL
          </button>
          <button
            onClick={create}
            disabled={!title.trim()}
            className="px-3 py-1.5 rounded text-[10px] font-mono font-bold tracking-wider bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/25 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            OPEN CASE
          </button>
        </div>
      </div>
    </div>
  );
}
