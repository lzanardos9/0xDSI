import { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck, ShieldAlert, ShieldX, Scale, Gavel, KeyRound, Radar, Ban, Pause, Play,
  CheckCircle2, XCircle, AlertTriangle, Clock, Fingerprint, Network, GitBranch, Lock,
  Eye, Activity, Cpu, FileCheck, Timer, ChevronRight, Layers, Zap, UserCheck, Skull,
} from 'lucide-react';

/**
 * 0xDSI Ethical Control Plane — operator console (DEMO / SHADOW MODE).
 *
 * IMPORTANT: every value here is mock data rendered for demonstration. Nothing in
 * this view enforces anything on a live Databricks workspace. Coverage, decisions,
 * leases and evidence are simulated so operators can see the intended experience.
 * Enforcement lives in databricks-native notebooks and is not wired here yet.
 */

type CoverageMode =
  | 'OBSERVE_ONLY' | 'ADVISORY' | 'GATEWAY_ENFORCED' | 'RUNTIME_CONTAINED' | 'FEDERATED_ENFORCEMENT';

type Autonomy = 'A0' | 'A1' | 'A2' | 'A3' | 'A4';
type Lifecycle = 'ACTIVE' | 'RESTRICTED' | 'PAUSED' | 'QUARANTINED' | 'REVOKED';
type Decision = 'PERMIT_WITH_CONSTRAINTS' | 'REQUIRE_APPROVAL' | 'REQUIRE_REVIEW' | 'SANDBOX_ONLY' | 'DENY';
type ActionState = 'PROPOSED' | 'PERMITTED' | 'DISPATCHED' | 'ACCEPTED' | 'VERIFIED' | 'BLOCKED';
type EffectClass =
  | 'disclosure' | 'external_comm' | 'access_restriction' | 'credential_use' | 'code_execution'
  | 'persistence' | 'delegation' | 'resource_commit' | 'policy_modification' | 'irreversible';

interface AgentRow {
  id: string;
  name: string;
  role: string;
  autonomy: Autonomy;
  lifecycle: Lifecycle;
  coverage: CoverageMode;
  identityVerified: boolean;
  tenant: string;
  budgetUsed: number;
  budgetMax: number;
  drift: number;
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
  FEDERATED_ENFORCEMENT: { label: 'Federated', tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10', enforced: true },
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

const AGENTS: AgentRow[] = [
  { id: 'ag-radar', name: 'Threat Radar', role: 'Intel Collection', autonomy: 'A1', lifecycle: 'ACTIVE', coverage: 'GATEWAY_ENFORCED', identityVerified: true, tenant: 'core', budgetUsed: 38, budgetMax: 100, drift: 0.06 },
  { id: 'ag-sage', name: 'SAGE Enrichment', role: 'Enrichment', autonomy: 'A2', lifecycle: 'ACTIVE', coverage: 'GATEWAY_ENFORCED', identityVerified: true, tenant: 'core', budgetUsed: 61, budgetMax: 100, drift: 0.11 },
  { id: 'ag-nova', name: 'NOVA Investigation', role: 'Investigation', autonomy: 'A2', lifecycle: 'ACTIVE', coverage: 'RUNTIME_CONTAINED', identityVerified: true, tenant: 'core', budgetUsed: 47, budgetMax: 100, drift: 0.09 },
  { id: 'ag-ciso', name: 'CISO Assistant', role: 'Exec Analysis', autonomy: 'A1', lifecycle: 'RESTRICTED', coverage: 'ADVISORY', identityVerified: true, tenant: 'core', budgetUsed: 22, budgetMax: 100, drift: 0.04 },
  { id: 'ag-vanguard', name: 'VANGUARD Response', role: 'Response', autonomy: 'A3', lifecycle: 'ACTIVE', coverage: 'RUNTIME_CONTAINED', identityVerified: true, tenant: 'core', budgetUsed: 73, budgetMax: 100, drift: 0.18 },
  { id: 'ag-sim', name: 'Threat Simulator', role: 'Adversary Sim', autonomy: 'A2', lifecycle: 'QUARANTINED', coverage: 'RUNTIME_CONTAINED', identityVerified: true, tenant: 'redlab', budgetUsed: 12, budgetMax: 60, drift: 0.41 },
  { id: 'ag-ext', name: 'partner-soar-01 (external)', role: 'Federated', autonomy: 'A2', lifecycle: 'ACTIVE', coverage: 'FEDERATED_ENFORCEMENT', identityVerified: false, tenant: 'partner', budgetUsed: 30, budgetMax: 80, drift: 0.22 },
];

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

type TabKey = 'overview' | 'agents' | 'timeline' | 'leases' | 'evidence';

const TABS: Array<{ key: TabKey; label: string; Icon: typeof ShieldCheck }> = [
  { key: 'overview', label: 'Overview', Icon: Scale },
  { key: 'agents', label: 'Agent Registry', Icon: Cpu },
  { key: 'timeline', label: 'Action Timeline', Icon: Activity },
  { key: 'leases', label: 'Capability Leases', Icon: KeyRound },
  { key: 'evidence', label: 'Evidence Ledger', Icon: FileCheck },
];

export default function EthicalControlPlane() {
  const [tab, setTab] = useState<TabKey>('overview');
  const [agents, setAgents] = useState<AgentRow[]>(AGENTS);
  const [selectedAction, setSelectedAction] = useState<ActionRow | null>(ACTIONS[0]);
  const [leases, setLeases] = useState<LeaseRow[]>(makeLeases);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const stats = useMemo(() => {
    const enforced = agents.filter((a) => COVERAGE_META[a.coverage].enforced).length;
    const blocked = ACTIONS.filter((a) => a.state === 'BLOCKED').length;
    const pending = ACTIONS.filter((a) => a.decision === 'REQUIRE_APPROVAL' || a.decision === 'REQUIRE_REVIEW').length;
    return { enforced, total: agents.length, blocked, pending };
  }, [agents]);

  const setLifecycle = (id: string, lifecycle: Lifecycle) =>
    setAgents((prev) => prev.map((a) => (a.id === id ? { ...a, lifecycle } : a)));

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
          Demonstration console with mock data. Coverage, decisions, leases and evidence shown here are simulated — this view does not
          enforce anything on a live workspace. Real enforcement lives in the <span className="font-mono text-amber-200">databricks-native</span> notebooks
          and is not connected yet. Statuses are <span className="font-mono">PROPOSED</span> / <span className="font-mono">VERIFIED_IN_CODE</span>, never <span className="font-mono">VERIFIED_IN_DEPLOYMENT</span>.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard Icon={ShieldCheck} label="Enforced Coverage" value={`${stats.enforced}/${stats.total}`} sub="agents on a mediated path" tone="text-emerald-300" />
        <StatCard Icon={Ban} label="Blocked Before Effect" value={String(stats.blocked)} sub="deterministic denials (sim)" tone="text-rose-300" />
        <StatCard Icon={UserCheck} label="Awaiting Authority" value={String(stats.pending)} sub="approval / review required" tone="text-amber-300" />
        <StatCard Icon={KeyRound} label="Active Leases" value={String(leases.filter((l) => !l.revoked).length)} sub="short-lived, action-bound" tone="text-cyan-300" />
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
          {agents.map((a) => {
            const life = LIFECYCLE_META[a.lifecycle];
            const LifeIcon = life.Icon;
            const budgetPct = Math.round((a.budgetUsed / a.budgetMax) * 100);
            return (
              <div key={a.id} className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-slate-800/60 border border-[#1e293b] flex items-center justify-center shrink-0"><Cpu size={16} className="text-cyan-300" /></div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{a.name}</span>
                        {a.identityVerified
                          ? <Badge tone="text-emerald-300 bg-emerald-500/10 border-emerald-500/30"><Fingerprint size={10} />identity verified</Badge>
                          : <Badge tone="text-amber-300 bg-amber-500/10 border-amber-500/30"><AlertTriangle size={10} />attribution only</Badge>}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{a.role} · tenant <span className="font-mono">{a.tenant}</span></div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge tone={AUTONOMY_META[a.autonomy].tone}><Zap size={10} />{AUTONOMY_META[a.autonomy].label}</Badge>
                        <Badge tone={COVERAGE_META[a.coverage].tone}><Radar size={10} />{COVERAGE_META[a.coverage].label}</Badge>
                        <Badge tone={life.tone}><LifeIcon size={10} />{a.lifecycle}</Badge>
                        {a.drift > 0.3 && <Badge tone="text-rose-300 bg-rose-500/10 border-rose-500/30"><Skull size={10} />drift {a.drift.toFixed(2)}</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => setLifecycle(a.id, a.lifecycle === 'PAUSED' ? 'ACTIVE' : 'PAUSED')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-[#1e293b] text-slate-300 hover:bg-slate-800/60 transition-colors">
                      {a.lifecycle === 'PAUSED' ? <><Play size={12} />Resume</> : <><Pause size={12} />Pause</>}
                    </button>
                    <button onClick={() => setLifecycle(a.id, 'QUARANTINED')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-amber-500/30 text-amber-300 hover:bg-amber-500/10 transition-colors">
                      <ShieldX size={12} />Quarantine
                    </button>
                    <button onClick={() => setLifecycle(a.id, 'REVOKED')}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 transition-colors">
                      <Ban size={12} />Revoke
                    </button>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1"><span>Risk budget</span><span>{a.budgetUsed}/{a.budgetMax}</span></div>
                  <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                    <div className={`h-full rounded-full ${budgetPct > 80 ? 'bg-rose-500' : budgetPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${budgetPct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
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
