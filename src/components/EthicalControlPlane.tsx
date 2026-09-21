import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, Scale, Gavel, KeyRound, Radar, Ban, Pause, Play,
  CheckCircle2, XCircle, AlertTriangle, Network, GitBranch, Lock,
  Eye, Activity, Cpu, FileCheck, Timer, ChevronRight, Layers, Zap, UserCheck,
  Loader2, Grid3x3, FileText,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * 0xDSI Ethical Control Plane — operator console (DEMO / SHADOW MODE).
 *
 * IMPORTANT: every value here is mock data rendered for demonstration. Nothing in
 * this view enforces anything on a live Databricks workspace. Coverage, decisions,
 * leases and evidence are simulated so operators can see the intended experience.
 * Enforcement lives in databricks-native notebooks and is not wired here yet.
 */

type CoverageMode =
  | 'OBSERVE_ONLY' | 'ADVISORY' | 'GATEWAY_ENFORCED' | 'RUNTIME_CONTAINED'
  | 'SANDBOX_ONLY' | 'SIMULATION' | 'FEDERATED_ENFORCEMENT';

type Autonomy = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
type HonestStatus = 'VERIFIED_IN_CODE' | 'PROPOSED' | 'SIMULATION';
type Lifecycle = 'ACTIVE' | 'RESTRICTED' | 'PAUSED' | 'QUARANTINED' | 'REVOKED';
type Decision = 'PERMIT_WITH_CONSTRAINTS' | 'REQUIRE_APPROVAL' | 'REQUIRE_REVIEW' | 'SANDBOX_ONLY' | 'DENY';
type ActionState = 'PROPOSED' | 'PERMITTED' | 'DISPATCHED' | 'ACCEPTED' | 'VERIFIED' | 'BLOCKED';
type EffectClass =
  | 'disclosure' | 'external_comm' | 'access_restriction' | 'credential_use' | 'code_execution'
  | 'persistence' | 'delegation' | 'resource_commit' | 'policy_modification' | 'irreversible';

interface CoverageAgent {
  file: string;
  agent_name: string;
  role: string;
  autonomy: Autonomy;
  coverage_mode: CoverageMode;
  can_act: boolean;
  honest_status: HonestStatus;
  governance: string;
  notes: string;
  sort_order: number;
}

interface ActionRow {
  id: string;
  ts: string;
  agent: string;
  tool: string;
  target: string;
  effects: EffectClass[];
  decision: Decision;
  state: ActionState;
  reason: string;
  authorizedBy: string | null;
  reasonCode: string;
}

interface LeaseRow {
  id: string;
  agent: string;
  action: string;
  audience: string;
  issuedAt: number;
  ttlSec: number;
  useCount: number;
  maxUses: number;
  revoked: boolean;
}

interface EvidenceRow {
  id: string;
  ts: string;
  source: 'BROKER' | 'EXECUTOR' | 'POLICY' | 'SENTINEL';
  label: string;
  detail: string;
  severity: 'info' | 'warn' | 'critical';
}

const COVERAGE_META: Record<CoverageMode, { label: string; tone: string; enforced: boolean }> = {
  OBSERVE_ONLY: { label: 'Observe Only', tone: 'text-slate-300 border-slate-500/30 bg-slate-500/10', enforced: false },
  ADVISORY: { label: 'Advisory', tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10', enforced: false },
  GATEWAY_ENFORCED: { label: 'Gateway Enforced', tone: 'text-sky-300 border-sky-500/30 bg-sky-500/10', enforced: true },
  RUNTIME_CONTAINED: { label: 'Runtime Contained', tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10', enforced: true },
  SANDBOX_ONLY: { label: 'Sandbox Only', tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10', enforced: true },
  SIMULATION: { label: 'Simulation', tone: 'text-violet-300 border-violet-500/30 bg-violet-500/10', enforced: false },
  FEDERATED_ENFORCEMENT: { label: 'Federated', tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10', enforced: true },
};

const HONEST_META: Record<HonestStatus, { label: string; tone: string; Icon: typeof ShieldCheck }> = {
  VERIFIED_IN_CODE: { label: 'Verified in code', tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', Icon: FileCheck },
  PROPOSED: { label: 'Proposed · review', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', Icon: AlertTriangle },
  SIMULATION: { label: 'Simulation', tone: 'text-violet-300 bg-violet-500/10 border-violet-500/30', Icon: Eye },
};

const AUTONOMY_META: Record<Autonomy, { label: string; tone: string }> = {
  A0: { label: 'A0 · Observe', tone: 'text-slate-300 bg-slate-500/10 border-slate-500/30' },
  A1: { label: 'A1 · Recommend', tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30' },
  A2: { label: 'A2 · Preapproved', tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30' },
  A3: { label: 'A3 · Scoped Defensive', tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30' },
  A4: { label: 'A4 · High-Impact', tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30' },
};

const LIFECYCLE_META: Record<Lifecycle, { tone: string; Icon: typeof ShieldCheck }> = {
  ACTIVE: { tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', Icon: CheckCircle2 },
  RESTRICTED: { tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', Icon: ShieldAlert },
  PAUSED: { tone: 'text-slate-300 bg-slate-500/10 border-slate-500/30', Icon: Pause },
  QUARANTINED: { tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30', Icon: ShieldX },
  REVOKED: { tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30', Icon: Ban },
};

const DECISION_META: Record<Decision, { tone: string; Icon: typeof ShieldCheck }> = {
  PERMIT_WITH_CONSTRAINTS: { tone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', Icon: CheckCircle2 },
  REQUIRE_APPROVAL: { tone: 'text-amber-300 bg-amber-500/10 border-amber-500/30', Icon: UserCheck },
  REQUIRE_REVIEW: { tone: 'text-sky-300 bg-sky-500/10 border-sky-500/30', Icon: Eye },
  SANDBOX_ONLY: { tone: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30', Icon: Layers },
  DENY: { tone: 'text-rose-300 bg-rose-500/10 border-rose-500/30', Icon: XCircle },
};

const STATE_ORDER: ActionState[] = ['PROPOSED', 'PERMITTED', 'DISPATCHED', 'ACCEPTED', 'VERIFIED'];

const EFFECT_TONE: Record<EffectClass, string> = {
  disclosure: 'text-sky-300 bg-sky-500/10',
  external_comm: 'text-cyan-300 bg-cyan-500/10',
  access_restriction: 'text-amber-300 bg-amber-500/10',
  credential_use: 'text-rose-300 bg-rose-500/10',
  code_execution: 'text-rose-300 bg-rose-500/10',
  persistence: 'text-amber-300 bg-amber-500/10',
  delegation: 'text-violet-300 bg-violet-500/10',
  resource_commit: 'text-emerald-300 bg-emerald-500/10',
  policy_modification: 'text-rose-300 bg-rose-500/10',
  irreversible: 'text-rose-300 bg-rose-500/10',
};

const FOUNDATIONS = [
  'Intelligence is not authority.',
  'A goal is not a grant.',
  'Confidence is not consent.',
  'Discovery does not expand scope.',
  'An approval is necessary in some cases, but never sufficient by itself.',
  'Safe inability to complete a task is a valid outcome.',
];

const AGENTS: CoverageAgent[] = [];

const ACTIONS: ActionRow[] = [
  { id: 'act-1', ts: '12:04:41', agent: 'VANGUARD Response', tool: 'isolate_host@1.4', target: 'host:WIN-FIN-204', effects: ['access_restriction', 'irreversible'], decision: 'REQUIRE_APPROVAL', state: 'PROPOSED', reason: 'High-impact containment on a production finance host requires dual approval within its risk envelope.', authorizedBy: null, reasonCode: 'ROE.IMPACT.PROD_CRITICAL' },
  { id: 'act-2', ts: '12:04:22', agent: 'SAGE Enrichment', tool: 'enrich_ioc@2.1', target: 'ioc:5.188.x.x', effects: ['disclosure', 'external_comm'], decision: 'PERMIT_WITH_CONSTRAINTS', state: 'VERIFIED', reason: 'Enrichment against allowlisted source; internal indicators redacted before egress.', authorizedBy: 'standing-policy:enrich-v3', reasonCode: 'POLICY.ENRICH.ALLOWED' },
  { id: 'act-3', ts: '12:03:58', agent: 'Threat Radar', tool: 'http_fetch@1.0', target: 'https://198.51.100.9/loot', effects: ['external_comm', 'code_execution'], decision: 'DENY', state: 'BLOCKED', reason: 'Discovered host is out of scope. Retrieved text claiming "authorized" is content, not a grant. Egress default-deny.', authorizedBy: null, reasonCode: 'ROE.SCOPE.UNAUTHORIZED_TARGET' },
  { id: 'act-4', ts: '12:03:30', agent: 'NOVA Investigation', tool: 'query_delta@3.0', target: 'uc:audit.events', effects: ['disclosure'], decision: 'PERMIT_WITH_CONSTRAINTS', state: 'ACCEPTED', reason: 'Purpose-limited read within tenant boundary; row filter applied.', authorizedBy: 'standing-policy:investigate-v2', reasonCode: 'POLICY.READ.TENANT_SCOPED' },
  { id: 'act-5', ts: '12:02:57', agent: 'Threat Simulator', tool: 'exploit_validate@0.9', target: 'replica:sandbox-77', effects: ['code_execution'], decision: 'SANDBOX_ONLY', state: 'DISPATCHED', reason: 'Exploitation stage permitted only inside isolated replica; production assets excluded.', authorizedBy: 'engagement:RT-2026-014', reasonCode: 'ROE.STAGE.SANDBOX' },
  { id: 'act-6', ts: '12:02:10', agent: 'CISO Assistant', tool: 'update_policy@1.0', target: 'policy:auto-approve', effects: ['policy_modification'], decision: 'DENY', state: 'BLOCKED', reason: 'Agent cannot modify active policy or approve itself. Protected prohibition — not overridable by approval.', authorizedBy: null, reasonCode: 'CHARTER.PROHIBITION.SELF_AUTHORIZE' },
  { id: 'act-7', ts: '12:01:44', agent: 'partner-soar-01 (external)', tool: 'delegate_task@1.1', target: 'agent:child-scan-3', effects: ['delegation'], decision: 'REQUIRE_REVIEW', state: 'PROPOSED', reason: 'Federated delegation cannot amplify authority; child scope must be the intersection of parent + policy.', authorizedBy: null, reasonCode: 'DELEGATION.INTERSECTION_ONLY' },
];

function makeLeases(): LeaseRow[] {
  const now = Date.now();
  return [
    { id: 'lease-9f2', agent: 'SAGE Enrichment', action: 'enrich_ioc@2.1', audience: 'broker:enrich', issuedAt: now - 40_000, ttlSec: 120, useCount: 1, maxUses: 1, revoked: false },
    { id: 'lease-3a7', agent: 'NOVA Investigation', action: 'query_delta@3.0', audience: 'broker:read', issuedAt: now - 15_000, ttlSec: 90, useCount: 0, maxUses: 3, revoked: false },
    { id: 'lease-c11', agent: 'VANGUARD Response', action: 'isolate_host@1.4', audience: 'broker:respond', issuedAt: now - 8_000, ttlSec: 60, useCount: 0, maxUses: 1, revoked: false },
    { id: 'lease-b40', agent: 'Threat Simulator', action: 'exploit_validate@0.9', audience: 'broker:sandbox', issuedAt: now - 5_000, ttlSec: 45, useCount: 0, maxUses: 1, revoked: true },
  ];
}

const EVIDENCE: EvidenceRow[] = [
  { id: 'ev-1', ts: '12:04:41', source: 'BROKER', label: 'ActionRequest admitted', detail: 'isolate_host bound to plan digest 0x9c…; pending dual approval.', severity: 'info' },
  { id: 'ev-2', ts: '12:03:58', source: 'POLICY', label: 'Deterministic DENY', detail: 'ROE.SCOPE.UNAUTHORIZED_TARGET — egress blocked before dispatch.', severity: 'critical' },
  { id: 'ev-3', ts: '12:03:31', source: 'EXECUTOR', label: 'Independent receipt', detail: 'query_delta receipt reconciled with agent telemetry (match).', severity: 'info' },
  { id: 'ev-4', ts: '12:02:57', source: 'SENTINEL', label: 'Scope probing observed', detail: 'Threat Simulator drift 0.41 — narrowed autonomy, review triggered.', severity: 'warn' },
  { id: 'ev-5', ts: '12:02:10', source: 'POLICY', label: 'Protected prohibition', detail: 'CHARTER.PROHIBITION.SELF_AUTHORIZE — policy edit refused.', severity: 'critical' },
];

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-md border ${tone}`}>{children}</span>;
}

function StatCard({ Icon, label, value, sub, tone }: { Icon: typeof ShieldCheck; label: string; value: string; sub: string; tone: string }) {
  return (
    <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
      <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-2"><Icon size={13} className={tone} />{label}</div>
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </div>
  );
}

interface AuthorityRule {
  reason_code: string;
  rule_name: string;
  decision: Decision;
  why: string;
  eval_order: number;
}

type TabKey = 'overview' | 'agents' | 'matrix' | 'rules' | 'timeline' | 'leases' | 'evidence';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof ShieldCheck }> = [
  { key: 'overview', label: 'Overview', Icon: Scale },
  { key: 'agents', label: 'Agent Registry', Icon: Cpu },
  { key: 'matrix', label: 'Coverage Matrix', Icon: Grid3x3 },
  { key: 'rules', label: 'Authority Rules', Icon: Gavel },
  { key: 'timeline', label: 'Action Timeline', Icon: Activity },
  { key: 'leases', label: 'Capability Leases', Icon: KeyRound },
  { key: 'evidence', label: 'Evidence Ledger', Icon: FileCheck },
];

export default function EthicalControlPlane() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [agents, setAgents] = useState<CoverageAgent[]>(AGENTS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Lifecycle>>({});
  const [rules, setRules] = useState<AuthorityRule[]>([]);
  const [selectedAction, setSelectedAction] = useState<ActionRow | null>(ACTIONS[0]);
  const [leases, setLeases] = useState<LeaseRow[]>(makeLeases);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('ecp_agent_coverage')
          .select('file, agent_name, role, autonomy, coverage_mode, can_act, honest_status, governance, notes, sort_order')
          .order('sort_order', { ascending: true });
        if (!active) return;
        if (error) { setLoadError(error.message); }
        else { setAgents((data ?? []) as CoverageAgent[]); }
      } catch (err) {
        if (active) setLoadError(err instanceof Error ? err.message : 'Failed to load coverage matrix');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('ecp_authority_rules')
        .select('reason_code, rule_name, decision, why, eval_order')
        .order('eval_order', { ascending: true });
      if (active && !error && data) setRules(data as AuthorityRule[]);
    })();
    return () => { active = false; };
  }, []);

  const stats = useMemo(() => {
    const enforced = agents.filter((a) => COVERAGE_META[a.coverage_mode]?.enforced).length;
    const actionCapable = agents.filter((a) => a.can_act).length;
    const verified = agents.filter((a) => a.honest_status === 'VERIFIED_IN_CODE').length;
    const contained = agents.filter((a) => a.coverage_mode === 'RUNTIME_CONTAINED').length;
    return { enforced, total: agents.length, actionCapable, verified, contained };
  }, [agents]);

  const coverageCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const a of agents) acc[a.coverage_mode] = (acc[a.coverage_mode] ?? 0) + 1;
    return acc;
  }, [agents]);

  const setLifecycle = (file: string, lifecycle: Lifecycle) =>
    setOverrides((prev) => ({ ...prev, [file]: lifecycle }));

  const revokeLease = (id: string) =>
    setLeases((prev) => prev.map((l) => (l.id === id ? { ...l, revoked: true } : l)));

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center">
            <Scale size={22} className="text-cyan-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">Ethical Control Plane</h1>
            <p className="text-xs text-slate-500">Bounded Agency for Autonomous Systems — authority, isolation, least privilege, verified outcomes</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="text-amber-300 border-amber-500/40 bg-amber-500/10"><Eye size={11} />SHADOW MODE</Badge>
          <Badge tone="text-slate-300 border-slate-500/40 bg-slate-500/10"><AlertTriangle size={11} />SIMULATION · NOT ENFORCED</Badge>
        </div>
      </div>

      {/* Honesty banner */}
      <div className="flex items-start gap-2 bg-amber-500/5 border border-amber-500/20 rounded-xl p-3">
        <AlertTriangle size={15} className="text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-200/80 leading-relaxed">
          Phase 0 inventory: the <span className="font-mono text-amber-200">Agent Registry</span> and <span className="font-mono text-amber-200">Coverage Matrix</span> below are the
          real agents from the <span className="font-mono text-amber-200">databricks-native</span> repository, each labelled with its honest status. The
          timeline, leases and evidence tabs remain illustrative simulation. Nothing here enforces anything on a live workspace —
          statuses are <span className="font-mono">VERIFIED_IN_CODE</span> / <span className="font-mono">PROPOSED</span> / <span className="font-mono">SIMULATION</span>, never <span className="font-mono">VERIFIED_IN_DEPLOYMENT</span>.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard Icon={Cpu} label="Agents Inventoried" value={loading ? '—' : String(stats.total)} sub="from databricks-native repo" tone="text-cyan-300" />
        <StatCard Icon={Zap} label="Action-Capable" value={loading ? '—' : String(stats.actionCapable)} sub="can change external state" tone="text-rose-300" />
        <StatCard Icon={ShieldCheck} label="Runtime Contained" value={loading ? '—' : String(stats.contained)} sub="propose → approve → verify" tone="text-emerald-300" />
        <StatCard Icon={FileCheck} label="Verified in Code" value={loading ? '—' : `${stats.verified}/${stats.total}`} sub="control exists in source" tone="text-sky-300" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-[#1e293b] overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.Icon;
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium transition-all border-b-2 whitespace-nowrap ${active ? 'text-cyan-300 border-cyan-400 bg-cyan-500/5' : 'text-slate-500 border-transparent hover:text-slate-300'}`}>
              <Icon size={14} />{t.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><Gavel size={15} className="text-cyan-300" /><h3 className="text-sm font-bold text-white">Foundational Statements</h3></div>
            <ul className="space-y-2">
              {FOUNDATIONS.map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-300"><ChevronRight size={13} className="text-cyan-400 shrink-0 mt-0.5" />{f}</li>
              ))}
            </ul>
          </div>

          <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><Layers size={15} className="text-cyan-300" /><h3 className="text-sm font-bold text-white">Four Planes</h3></div>
            <div className="space-y-2">
              {[
                { Icon: Cpu, name: 'Reasoning', desc: 'Agents, models, planning, retrieved knowledge — proposes, never dispatches.', tone: 'text-sky-300' },
                { Icon: Gavel, name: 'Authority', desc: 'Identity, policy, ROE, approvals, capability issuance, revocation.', tone: 'text-amber-300' },
                { Icon: Network, name: 'Execution', desc: 'Constrained brokers, trusted connectors, isolated runtimes.', tone: 'text-emerald-300' },
                { Icon: FileCheck, name: 'Evidence', desc: 'Independent observation, durable events, CEP/CET, audit.', tone: 'text-cyan-300' },
              ].map((p) => (
                <div key={p.name} className="flex items-start gap-3 rounded-lg border border-[#1e293b] bg-[#0a0e1a] p-3">
                  <p.Icon size={16} className={`${p.tone} shrink-0 mt-0.5`} />
                  <div><div className={`text-xs font-semibold ${p.tone}`}>{p.name} plane</div><div className="text-[11px] text-slate-500">{p.desc}</div></div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><GitBranch size={15} className="text-cyan-300" /><h3 className="text-sm font-bold text-white">Governed Path — model output never reaches privileged execution directly</h3></div>
            <div className="flex items-center gap-2 overflow-x-auto pb-2">
              {['Authenticated objective', 'Typed action', 'Deterministic checks', 'Approval / review', 'Budget + lease', 'Broker revalidate', 'Constrained connector', 'Verified outcome'].map((step, i, arr) => (
                <div key={step} className="flex items-center gap-2 shrink-0">
                  <div className="px-3 py-2 rounded-lg border border-[#1e293b] bg-[#0a0e1a] text-[11px] text-slate-300 whitespace-nowrap">{step}</div>
                  {i < arr.length - 1 && <ChevronRight size={14} className="text-slate-600 shrink-0" />}
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-2 bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3"><Radar size={15} className="text-cyan-300" /><h3 className="text-sm font-bold text-white">Coverage Modes</h3></div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-2">
              {(Object.keys(COVERAGE_META) as CoverageMode[]).map((m) => (
                <div key={m} className={`rounded-lg border p-3 ${COVERAGE_META[m].tone}`}>
                  <div className="text-[11px] font-bold">{COVERAGE_META[m].label}</div>
                  <div className="text-[10px] opacity-80 mt-1">{COVERAGE_META[m].enforced ? 'Mediated path' : 'No preventive claim'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'agents' && (
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center"><Loader2 size={16} className="animate-spin" />Loading agent inventory…</div>
          )}
          {!loading && loadError && (
            <div className="flex items-center gap-2 bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-300"><AlertTriangle size={16} />Couldn't load the agent inventory: {loadError}</div>
          )}
          {!loading && !loadError && agents.length === 0 && (
            <div className="text-sm text-slate-500 py-8 text-center">No agents recorded in the coverage matrix yet.</div>
          )}
          {!loading && !loadError && agents.map((a) => {
            const lifecycle: Lifecycle = overrides[a.file] ?? 'ACTIVE';
            const life = LIFECYCLE_META[lifecycle];
            const LifeIcon = life.Icon;
            const hs = HONEST_META[a.honest_status];
            const HsIcon = hs.Icon;
            const cov = COVERAGE_META[a.coverage_mode];
            return (
              <div key={a.file} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-800/60 border border-[#1e293b] flex items-center justify-center shrink-0">
                      {a.can_act ? <Zap size={16} className="text-rose-300" /> : <Eye size={16} className="text-slate-400" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{a.agent_name}</span>
                        <Badge tone={hs.tone}><HsIcon size={10} />{hs.label}</Badge>
                        {a.can_act
                          ? <Badge tone="text-rose-300 bg-rose-500/10 border-rose-500/30"><Zap size={10} />action-capable</Badge>
                          : <Badge tone="text-slate-300 bg-slate-500/10 border-slate-500/30"><Eye size={10} />read / analysis</Badge>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{a.role} · <span className="font-mono">{a.file}</span></div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge tone={AUTONOMY_META[a.autonomy].tone}><Zap size={10} />{AUTONOMY_META[a.autonomy].label}</Badge>
                        {cov && <Badge tone={cov.tone}><Radar size={10} />{cov.label}</Badge>}
                        {lifecycle !== 'ACTIVE' && <Badge tone={life.tone}><LifeIcon size={10} />{lifecycle}</Badge>}
                      </div>
                      {a.governance && <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">{a.governance}</p>}
                      {a.notes && <p className="text-[10px] text-amber-300/70 mt-1 flex items-start gap-1"><AlertTriangle size={10} className="shrink-0 mt-0.5" />{a.notes}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setLifecycle(a.file, lifecycle === 'PAUSED' ? 'ACTIVE' : 'PAUSED')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-[#1e293b] text-slate-300 hover:bg-slate-800/60 transition-colors">
                      {lifecycle === 'PAUSED' ? <><Play size={12} />Resume</> : <><Pause size={12} />Pause</>}
                    </button>
                    <button onClick={() => setLifecycle(a.file, 'QUARANTINED')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors">
                      <ShieldX size={12} />Quarantine
                    </button>
                    <button onClick={() => setLifecycle(a.file, 'REVOKED')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-colors">
                      <Ban size={12} />Revoke
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {!loading && !loadError && agents.length > 0 && (
            <p className="text-[10px] text-slate-600 flex items-center gap-1.5 pt-1"><Lock size={12} />Pause / quarantine / revoke are shadow controls in this demo — they change the view only and do not signal a live workspace.</p>
          )}
        </div>
      )}

      {tab === 'matrix' && (
        <div className="space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center"><Loader2 size={16} className="animate-spin" />Loading coverage matrix…</div>
          )}
          {!loading && loadError && (
            <div className="flex items-center gap-2 bg-rose-500/5 border border-rose-500/20 rounded-xl p-4 text-sm text-rose-300"><AlertTriangle size={16} />Couldn't load the coverage matrix: {loadError}</div>
          )}
          {!loading && !loadError && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                {(Object.keys(COVERAGE_META) as CoverageMode[]).filter((m) => m !== 'FEDERATED_ENFORCEMENT').map((m) => (
                  <div key={m} className={`rounded-lg border p-3 ${COVERAGE_META[m].tone}`}>
                    <div className="text-lg font-bold">{coverageCounts[m] ?? 0}</div>
                    <div className="text-[10px] font-semibold">{COVERAGE_META[m].label}</div>
                    <div className="text-[9px] opacity-80 mt-0.5">{COVERAGE_META[m].enforced ? 'mediated path' : 'no preventive claim'}</div>
                  </div>
                ))}
              </div>
              <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wide text-slate-500 border-b border-[#1e293b]">
                        <th className="px-3 py-2 font-semibold">Agent</th>
                        <th className="px-3 py-2 font-semibold">Autonomy</th>
                        <th className="px-3 py-2 font-semibold">Coverage</th>
                        <th className="px-3 py-2 font-semibold">Acts?</th>
                        <th className="px-3 py-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((a) => {
                        const hs = HONEST_META[a.honest_status];
                        const cov = COVERAGE_META[a.coverage_mode];
                        return (
                          <tr key={a.file} className="border-b border-[#131b2e] hover:bg-slate-800/30 transition-colors">
                            <td className="px-3 py-2">
                              <div className="text-xs font-medium text-white">{a.agent_name}</div>
                              <div className="text-[10px] text-slate-500 font-mono">{a.file}</div>
                            </td>
                            <td className="px-3 py-2"><Badge tone={AUTONOMY_META[a.autonomy].tone}>{a.autonomy}</Badge></td>
                            <td className="px-3 py-2">{cov && <Badge tone={cov.tone}>{cov.label}</Badge>}</td>
                            <td className="px-3 py-2">
                              {a.can_act ? <span className="text-rose-300 text-[11px] font-semibold">yes</span> : <span className="text-slate-500 text-[11px]">no</span>}
                            </td>
                            <td className="px-3 py-2"><Badge tone={hs.tone}>{hs.label}</Badge></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <p className="text-[11px] text-slate-600 flex items-center gap-1.5"><FileText size={12} />Source of truth: the coverage matrix table, mirrored in <span className="font-mono">databricks-native/docs/COVERAGE_MATRIX.md</span>. Update both when agents change.</p>
            </>
          )}
        </div>
      )}

      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3">
            <FileCheck size={15} className="text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-emerald-200/80 leading-relaxed">
              These are the exact deterministic rules the authority kernel applies, in evaluation order (first match wins) — no
              model involved. The kernel lives in <span className="font-mono text-emerald-200">databricks-native/notebooks/_shared/authority_kernel.py</span> and
              is covered by a passing test suite, so these rules are <span className="font-mono">VERIFIED_IN_CODE</span>. A confidence score never changes the outcome.
            </p>
          </div>
          {rules.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-slate-400 py-8 justify-center"><Loader2 size={16} className="animate-spin" />Loading authority rules…</div>
          ) : (
            <div className="space-y-2">
              {rules.map((r) => {
                const dm = DECISION_META[r.decision];
                const DIcon = dm?.Icon ?? FileCheck;
                return (
                  <div key={r.reason_code} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 flex items-start gap-3">
                    <div className="w-6 h-6 rounded-md bg-slate-800/60 border border-[#1e293b] flex items-center justify-center text-[10px] font-mono text-slate-400 shrink-0 mt-0.5">{r.eval_order + 1}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{r.rule_name}</span>
                        {dm && <Badge tone={dm.tone}><DIcon size={10} />{r.decision.replace(/_/g, ' ')}</Badge>}
                      </div>
                      <div className="text-[10px] font-mono text-cyan-300 mt-0.5">{r.reason_code}</div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{r.why}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'timeline' && (
        <div className="grid lg:grid-cols-5 gap-4">
          <div className="lg:col-span-3 space-y-2">
            {ACTIONS.map((a) => {
              const dm = DECISION_META[a.decision];
              const DIcon = dm.Icon;
              const active = selectedAction?.id === a.id;
              return (
                <button key={a.id} onClick={() => setSelectedAction(a)}
                  className={`w-full text-left bg-[#0b0f1e] border rounded-xl p-3 transition-colors ${active ? 'border-cyan-500/40 bg-cyan-500/5' : 'border-[#1e293b] hover:border-slate-600'}`}>
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-mono text-slate-500">{a.ts}</span>
                      <span className="text-xs font-semibold text-white truncate">{a.agent}</span>
                    </div>
                    <Badge tone={dm.tone}><DIcon size={10} />{a.decision.replace(/_/g, ' ')}</Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-400">
                    <span className="font-mono text-slate-300">{a.tool}</span><ChevronRight size={11} className="text-slate-600" /><span className="font-mono truncate">{a.target}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {a.effects.map((e) => <span key={e} className={`px-1.5 py-0.5 text-[9px] rounded ${EFFECT_TONE[e]}`}>{e.replace(/_/g, ' ')}</span>)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-2">
            {selectedAction && (
              <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4 sticky top-4">
                <div className="flex items-center gap-2 mb-3"><FileCheck size={15} className="text-cyan-300" /><h3 className="text-sm font-bold text-white">Decision Explainer</h3></div>
                {/* progress chain */}
                <div className="flex items-center gap-1 mb-4 flex-wrap">
                  {selectedAction.state === 'BLOCKED' ? (
                    <Badge tone="text-rose-300 bg-rose-500/10 border-rose-500/30"><Ban size={11} />BLOCKED before dispatch</Badge>
                  ) : (
                    STATE_ORDER.map((s) => {
                      const reached = STATE_ORDER.indexOf(s) <= STATE_ORDER.indexOf(selectedAction.state as ActionState);
                      return <span key={s} className={`px-1.5 py-0.5 text-[9px] rounded font-mono ${reached ? 'bg-cyan-500/15 text-cyan-300' : 'bg-slate-800 text-slate-600'}`}>{s}</span>;
                    })
                  )}
                </div>
                <dl className="space-y-2.5 text-[11px]">
                  <div><dt className="text-slate-500">{selectedAction.decision === 'DENY' ? 'Why denied' : 'Why allowed'}</dt><dd className="text-slate-200 mt-0.5">{selectedAction.reason}</dd></div>
                  <div><dt className="text-slate-500">Reason code</dt><dd className="text-cyan-300 font-mono mt-0.5">{selectedAction.reasonCode}</dd></div>
                  <div><dt className="text-slate-500">Who authorized</dt><dd className="mt-0.5">{selectedAction.authorizedBy ? <span className="text-emerald-300 font-mono">{selectedAction.authorizedBy}</span> : <span className="text-rose-300">no authority — held</span>}</dd></div>
                  <div>
                    <dt className="text-slate-500">Declared effects</dt>
                    <dd className="flex flex-wrap gap-1.5 mt-1">{selectedAction.effects.map((e) => <span key={e} className={`px-1.5 py-0.5 text-[9px] rounded ${EFFECT_TONE[e]}`}>{e.replace(/_/g, ' ')}</span>)}</dd>
                  </div>
                </dl>
                {selectedAction.decision === 'REQUIRE_APPROVAL' && (
                  <div className="mt-4 flex items-center gap-2">
                    <button className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-[11px] rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors"><CheckCircle2 size={12} />Approve (bind digest)</button>
                    <button className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-[11px] rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors"><XCircle size={12} />Deny</button>
                  </div>
                )}
                <p className="text-[10px] text-slate-600 mt-3">Approvals bind to the action + plan digest and expire. Silence never means consent. (Demo — no live effect.)</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'leases' && (
        <div className="space-y-2">
          {leases.map((l) => {
            const ageMs = now - l.issuedAt;
            const remaining = Math.max(0, l.ttlSec - Math.floor(ageMs / 1000));
            const expired = remaining <= 0;
            const dead = l.revoked || expired || l.useCount >= l.maxUses;
            return (
              <div key={l.id} className={`bg-[#0b0f1e] border rounded-xl p-4 ${dead ? 'border-rose-500/20 opacity-70' : 'border-[#1e293b]'}`}>
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <KeyRound size={16} className={dead ? 'text-rose-400' : 'text-cyan-300'} />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white font-mono">{l.id}</div>
                      <div className="text-[11px] text-slate-500">{l.agent} · <span className="font-mono">{l.action}</span> · aud <span className="font-mono">{l.audience}</span></div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className={`text-sm font-bold font-mono flex items-center gap-1 ${expired ? 'text-rose-300' : remaining < 20 ? 'text-amber-300' : 'text-emerald-300'}`}><Timer size={12} />{l.revoked ? 'REVOKED' : expired ? 'EXPIRED' : `${remaining}s`}</div>
                      <div className="text-[10px] text-slate-500">uses {l.useCount}/{l.maxUses}</div>
                    </div>
                    {!dead && (
                      <button onClick={() => revokeLease(l.id)} className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-colors"><Ban size={12} />Revoke</button>
                    )}
                  </div>
                </div>
                {!l.revoked && !expired && (
                  <div className="mt-2 h-1 rounded-full bg-slate-800 overflow-hidden">
                    <div className="h-full bg-cyan-500 rounded-full transition-all duration-1000" style={{ width: `${(remaining / l.ttlSec) * 100}%` }} />
                  </div>
                )}
              </div>
            );
          })}
          <p className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-1"><Lock size={12} />Leases are short-lived, audience- and action-bound. A cached lease is not sufficient for immediate revocation — the broker rechecks the revocation epoch before every side effect.</p>
        </div>
      )}

      {tab === 'evidence' && (
        <div className="space-y-2">
          {EVIDENCE.map((e) => {
            const tone = e.severity === 'critical' ? 'text-rose-300 border-rose-500/30' : e.severity === 'warn' ? 'text-amber-300 border-amber-500/30' : 'text-slate-300 border-slate-500/30';
            return (
              <div key={e.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-3 flex items-start gap-3">
                <span className="text-[10px] font-mono text-slate-500 mt-0.5 shrink-0">{e.ts}</span>
                <Badge tone={`${tone} bg-transparent`}>{e.source}</Badge>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-white">{e.label}</div>
                  <div className="text-[11px] text-slate-500">{e.detail}</div>
                </div>
              </div>
            );
          })}
          <p className="text-[11px] text-slate-600 flex items-center gap-1.5 pt-1"><FileCheck size={12} />Executor-originated receipts are reconciled against agent telemetry; the agent never authors its own authoritative receipt. (Demo ledger — mock data.)</p>
        </div>
      )}
    </div>
  );
}
