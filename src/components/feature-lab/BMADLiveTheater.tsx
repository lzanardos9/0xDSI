import { useEffect, useState, useRef } from 'react';
import {
  Microscope, ClipboardList, Layers, Palette, Code2, BookOpen,
  Gavel, CheckCircle2, AlertTriangle, Loader2, MessageSquare, ShieldCheck,
} from 'lucide-react';

type Phase = 'planning' | 'executing';

interface BMADLiveTheaterProps {
  phase: Phase;
  featureType: 'app' | 'backend';
  judgments?: Judgment[];
}

interface Judgment {
  from_agent: string;
  of_agent: string;
  topic: string;
  verdict: 'approve' | 'concerns' | 'reject';
  concerns?: string[];
  suggestions?: string[];
}

type AgentId = 'mary' | 'john' | 'winston' | 'sally' | 'amelia' | 'paige';

const AGENTS: Record<AgentId, { name: string; role: string; icon: any; color: string; accent: string; border: string; bg: string }> = {
  mary:    { name: 'Mary',    role: 'Analyst',         icon: Microscope,    color: 'cyan',    accent: 'text-cyan-300',    border: 'border-cyan-500/40',    bg: 'bg-cyan-500/10' },
  john:    { name: 'John',    role: 'Product Manager', icon: ClipboardList, color: 'blue',    accent: 'text-blue-300',    border: 'border-blue-500/40',    bg: 'bg-blue-500/10' },
  winston: { name: 'Winston', role: 'Architect',       icon: Layers,        color: 'orange',  accent: 'text-orange-300',  border: 'border-orange-500/40',  bg: 'bg-orange-500/10' },
  sally:   { name: 'Sally',   role: 'UX Designer',     icon: Palette,       color: 'emerald', accent: 'text-emerald-300', border: 'border-emerald-500/40', bg: 'bg-emerald-500/10' },
  amelia:  { name: 'Amelia',  role: 'Developer',       icon: Code2,         color: 'amber',   accent: 'text-amber-300',   border: 'border-amber-500/40',   bg: 'bg-amber-500/10' },
  paige:   { name: 'Paige',   role: 'Tech Writer',     icon: BookOpen,      color: 'teal',    accent: 'text-teal-300',    border: 'border-teal-500/40',    bg: 'bg-teal-500/10' },
};

interface ScriptEntry {
  t: number;
  kind: 'work' | 'judge' | 'system';
  agent?: AgentId;
  judge?: AgentId;
  target?: AgentId;
  text: string;
}

const PLAN_SCRIPT: ScriptEntry[] = [
  { t: 0,    kind: 'work',   agent: 'mary',    text: 'Parsing intent and scoping the security domain...' },
  { t: 1800, kind: 'work',   agent: 'mary',    text: 'Cross-referencing prior art across SOC, NDR, and CNAPP categories...' },
  { t: 3500, kind: 'work',   agent: 'mary',    text: 'Drafting risk register and domain-specific constraints...' },
  { t: 5200, kind: 'system', text: 'Analyst brief handed off to Product Manager' },

  { t: 5400, kind: 'work',   agent: 'john',    text: 'Decomposing brief into epics and user stories...' },
  { t: 7200, kind: 'judge',  judge: 'john',    target: 'mary',    text: 'Reviewing analyst brief for PRD completeness...' },
  { t: 9000, kind: 'work',   agent: 'john',    text: 'Writing Given/When/Then acceptance criteria...' },
  { t: 10500, kind: 'work',  agent: 'john',    text: 'Setting success metrics and scope boundaries...' },
  { t: 11800, kind: 'system', text: 'PRD handed off to Architect' },

  { t: 12000, kind: 'work',  agent: 'winston', text: 'Selecting Databricks products aligned to scope...' },
  { t: 13800, kind: 'judge', judge: 'winston', target: 'john',    text: 'Auditing PM epics for engineering feasibility...' },
  { t: 15800, kind: 'work',  agent: 'winston', text: 'Composing swimlane architecture and data flows...' },
  { t: 17500, kind: 'work',  agent: 'winston', text: 'Defining NFRs: latency, throughput, RBAC, lineage...' },
  { t: 19000, kind: 'judge', judge: 'mary',    target: 'john',    text: 'Challenging success metrics against domain baselines...' },
  { t: 20500, kind: 'system', text: 'Architecture handed off to UX' },

  { t: 20700, kind: 'work',  agent: 'sally',   text: 'Mapping personas to user flows...' },
  { t: 22200, kind: 'judge', judge: 'sally',   target: 'winston', text: 'Probing architecture for empty-state and error UX gaps...' },
  { t: 24000, kind: 'work',  agent: 'sally',   text: 'Designing key screens with accessibility notes...' },
  { t: 25500, kind: 'system', text: 'Consolidating judgments and preparing plan review' },
];

const EXECUTE_SCRIPT_APP: ScriptEntry[] = [
  { t: 0,     kind: 'system', text: 'Amelia received the approved architecture' },
  { t: 400,   kind: 'work',   agent: 'amelia',  text: 'Scaffolding HTML shell with dark design tokens...' },
  { t: 4000,  kind: 'work',   agent: 'amelia',  text: 'Wiring Tailwind design system and responsive layout...' },
  { t: 8000,  kind: 'judge',  judge: 'winston', target: 'amelia',  text: 'Spot-checking component count matches architecture...' },
  { t: 12000, kind: 'work',   agent: 'amelia',  text: 'Embedding Chart.js visualizations and micro-interactions...' },
  { t: 18000, kind: 'work',   agent: 'amelia',  text: 'Hooking live Supabase queries for events, alerts, cases...' },
  { t: 26000, kind: 'judge',  judge: 'sally',   target: 'amelia',  text: 'Reviewing UX: loading, empty, and error states...' },
  { t: 32000, kind: 'work',   agent: 'amelia',  text: 'Adding keyboard shortcuts and focus rings...' },
  { t: 40000, kind: 'work',   agent: 'paige',   text: 'Drafting README, runbook, and API contract in parallel...' },
  { t: 50000, kind: 'judge',  judge: 'paige',   target: 'amelia',  text: 'Auditing feature-to-documentation coverage...' },
  { t: 60000, kind: 'work',   agent: 'amelia',  text: 'Final polish: hover states, transitions, toasts...' },
  { t: 70000, kind: 'system', text: 'Pre-release sign-off from Winston and Sally' },
];

const EXECUTE_SCRIPT_BACKEND: ScriptEntry[] = [
  { t: 0,     kind: 'system', text: 'Amelia received the approved architecture' },
  { t: 400,   kind: 'work',   agent: 'amelia',  text: 'Scaffolding Databricks notebook with config cell...' },
  { t: 4000,  kind: 'work',   agent: 'amelia',  text: 'Writing Delta Lake schema and Unity Catalog three-part names...' },
  { t: 9000,  kind: 'judge',  judge: 'winston', target: 'amelia',  text: 'Verifying DLT expectations match NFRs...' },
  { t: 14000, kind: 'work',   agent: 'amelia',  text: 'Implementing streaming transforms with Auto Loader...' },
  { t: 22000, kind: 'work',   agent: 'amelia',  text: 'Adding MLflow tracking and model serving hooks...' },
  { t: 30000, kind: 'judge',  judge: 'mary',    target: 'amelia',  text: 'Sanity-checking detection logic against threat model...' },
  { t: 38000, kind: 'work',   agent: 'amelia',  text: 'Writing validation cell and synthetic smoke test...' },
  { t: 46000, kind: 'work',   agent: 'paige',   text: 'Producing README, operations runbook, API contract...' },
  { t: 55000, kind: 'judge',  judge: 'paige',   target: 'amelia',  text: 'Cross-referencing generated code against documentation...' },
  { t: 65000, kind: 'system', text: 'Pre-release sign-off from Winston' },
];

export default function BMADLiveTheater({ phase, featureType, judgments }: BMADLiveTheaterProps) {
  const [now, setNow] = useState(0);
  const [feed, setFeed] = useState<Array<ScriptEntry & { id: number }>>([]);
  const feedEndRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<number>(Date.now());
  const idRef = useRef(0);
  const emittedRef = useRef<Set<number>>(new Set());

  const script = phase === 'planning'
    ? PLAN_SCRIPT
    : featureType === 'backend' ? EXECUTE_SCRIPT_BACKEND : EXECUTE_SCRIPT_APP;

  useEffect(() => {
    startRef.current = Date.now();
    emittedRef.current = new Set();
    idRef.current = 0;
    setFeed([]);
    setNow(0);
  }, [phase, featureType]);

  useEffect(() => {
    const i = setInterval(() => setNow(Date.now() - startRef.current), 250);
    return () => clearInterval(i);
  }, [phase, featureType]);

  useEffect(() => {
    script.forEach((entry, idx) => {
      if (entry.t <= now && !emittedRef.current.has(idx)) {
        emittedRef.current.add(idx);
        const withId = { ...entry, id: ++idRef.current };
        setFeed(prev => [...prev.slice(-40), withId]);
      }
    });
  }, [now, script]);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [feed.length]);

  const activeAgent: AgentId | null = (() => {
    const lastWork = [...feed].reverse().find(e => e.kind === 'work');
    return (lastWork?.agent as AgentId) || null;
  })();

  const agentList: AgentId[] = phase === 'planning'
    ? ['mary', 'john', 'winston', 'sally']
    : ['amelia', 'paige', 'winston', 'sally', 'mary'];

  const activeIdx = activeAgent ? agentList.indexOf(activeAgent) : -1;

  const realJudgments = judgments || [];

  return (
    <div className="bg-gradient-to-br from-[#060912] to-[#0a0e1a] border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-900/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center">
            <ShieldCheck size={14} className="text-cyan-300" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">
              {phase === 'planning' ? 'Agents Designing the Plan' : 'Agents Building the Feature'}
            </div>
            <div className="text-[10px] text-slate-500 font-mono">
              {phase === 'planning' ? 'Mary -> John -> Winston -> Sally, with cross-agent peer review' : 'Amelia implementing, Paige documenting, Winston and Sally auditing'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-mono text-emerald-400">LIVE</span>
        </div>
      </div>

      {/* Agent track */}
      <div className="px-5 py-4 border-b border-slate-800">
        <div className="relative">
          <div className="absolute top-5 left-5 right-5 h-[2px] bg-slate-800" />
          <div className="relative flex justify-between">
            {agentList.map((id, i) => {
              const a = AGENTS[id];
              const Icon = a.icon;
              const active = id === activeAgent;
              const past = activeIdx >= 0 && i < activeIdx;
              return (
                <div key={id} className="flex flex-col items-center gap-1.5 z-10">
                  <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                    active ? `${a.bg} ${a.border} ${a.accent} scale-110 shadow-lg` :
                    past ? `${a.bg} ${a.border} ${a.accent}` :
                    'bg-slate-900 border-slate-700 text-slate-600'
                  }`}>
                    {active ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
                    {active && <div className={`absolute inset-0 rounded-full ${a.border} border-2 animate-ping opacity-40`} />}
                  </div>
                  <div className="text-center">
                    <div className={`text-[11px] font-bold leading-none ${active || past ? a.accent : 'text-slate-600'}`}>{a.name}</div>
                    <div className="text-[9px] text-slate-600 mt-0.5">{a.role}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Activity feed */}
      <div className="px-5 py-3 max-h-[220px] overflow-y-auto space-y-1.5" style={{ scrollBehavior: 'smooth' }}>
        {feed.length === 0 && (
          <div className="text-[11px] text-slate-500 italic py-4 text-center">Initializing agent pipeline...</div>
        )}
        {feed.map(entry => (
          <FeedRow key={entry.id} entry={entry} />
        ))}
        <div ref={feedEndRef} />
      </div>

      {/* Real judgments reveal (once API returns them) */}
      {realJudgments.length > 0 && (
        <div className="border-t border-slate-800 bg-slate-900/30">
          <div className="px-5 py-2.5 flex items-center gap-2 border-b border-slate-800/50">
            <Gavel size={12} className="text-amber-400" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Peer Review Verdicts</span>
            <span className="text-[10px] font-mono text-slate-500 ml-auto">{realJudgments.length} cross-agent reviews</span>
          </div>
          <div className="px-5 py-3 space-y-2 max-h-[280px] overflow-y-auto">
            {realJudgments.map((j, i) => <JudgmentCard key={i} j={j} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function FeedRow({ entry }: { entry: ScriptEntry & { id: number } }) {
  if (entry.kind === 'system') {
    return (
      <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500 py-1">
        <div className="flex-1 h-px bg-slate-800" />
        <span className="uppercase tracking-wider">{entry.text}</span>
        <div className="flex-1 h-px bg-slate-800" />
      </div>
    );
  }
  if (entry.kind === 'judge' && entry.judge && entry.target) {
    const jA = AGENTS[entry.judge];
    const tA = AGENTS[entry.target];
    const JIcon = jA.icon;
    return (
      <div className={`flex items-start gap-2 py-1.5 px-2 rounded-md border ${jA.border} ${jA.bg}`}>
        <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${jA.bg} ${jA.border} border`}>
          <Gavel size={10} className={jA.accent} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-[10px]">
            <span className={`font-bold ${jA.accent}`}>{jA.name}</span>
            <span className="text-slate-600">reviewing</span>
            <span className={`font-bold ${tA.accent}`}>{tA.name}</span>
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5">{entry.text}</div>
        </div>
        <JIcon size={11} className={`${jA.accent} opacity-40 mt-0.5`} />
      </div>
    );
  }
  const a = entry.agent ? AGENTS[entry.agent] : null;
  if (!a) return null;
  const Icon = a.icon;
  return (
    <div className="flex items-start gap-2 py-1">
      <div className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${a.bg} ${a.border} border`}>
        <Icon size={10} className={a.accent} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-slate-300">
          <span className={`font-bold ${a.accent}`}>{a.name}</span>
          <span className="text-slate-600 ml-1">({a.role}):</span>
          <span className="text-slate-300 ml-1">{entry.text}</span>
        </div>
      </div>
    </div>
  );
}

function JudgmentCard({ j }: { j: Judgment }) {
  const fromKey = j.from_agent.toLowerCase() as AgentId;
  const ofKey = j.of_agent.toLowerCase() as AgentId;
  const from = AGENTS[fromKey];
  const of = AGENTS[ofKey];
  if (!from || !of) return null;
  const FIcon = from.icon;

  const verdict = j.verdict || 'approve';
  const verdictStyle = {
    approve:  { label: 'APPROVED',      color: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', icon: CheckCircle2 },
    concerns: { label: 'CONCERNS',      color: 'text-amber-300',   bg: 'bg-amber-500/10',   border: 'border-amber-500/40',   icon: AlertTriangle },
    reject:   { label: 'BLOCK',         color: 'text-red-300',     bg: 'bg-red-500/10',     border: 'border-red-500/40',     icon: AlertTriangle },
  }[verdict] || { label: 'REVIEWED', color: 'text-slate-300', bg: 'bg-slate-800', border: 'border-slate-700', icon: MessageSquare };
  const VIcon = verdictStyle.icon;

  return (
    <div className={`rounded-lg border ${from.border} ${from.bg} p-3`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-md ${from.bg} ${from.border} border flex items-center justify-center`}>
            <FIcon size={11} className={from.accent} />
          </div>
          <div className="text-[10px] font-mono">
            <span className={`font-bold ${from.accent}`}>{from.name}</span>
            <span className="text-slate-600"> on </span>
            <span className={`font-bold ${of.accent}`}>{of.name}</span>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold font-mono border ${verdictStyle.bg} ${verdictStyle.border} ${verdictStyle.color}`}>
          <VIcon size={9} />
          {verdictStyle.label}
        </div>
      </div>
      <div className="text-[11px] font-semibold text-slate-200 mb-2">{j.topic}</div>
      {j.concerns && j.concerns.length > 0 && (
        <div className="mb-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400 mb-1">Concerns</div>
          <ul className="space-y-0.5">
            {j.concerns.map((c, i) => (
              <li key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                <AlertTriangle size={9} className="text-amber-400 shrink-0 mt-0.5" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}
      {j.suggestions && j.suggestions.length > 0 && (
        <div>
          <div className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 mb-1">Suggestions</div>
          <ul className="space-y-0.5">
            {j.suggestions.map((s, i) => (
              <li key={i} className="text-[11px] text-slate-300 flex items-start gap-1.5">
                <CheckCircle2 size={9} className="text-emerald-400 shrink-0 mt-0.5" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
