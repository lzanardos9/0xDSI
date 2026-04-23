import { useState } from 'react';
import { Microscope, ClipboardList, Layers, Palette, Code2, BookOpen, ChevronDown, ChevronRight, CheckCircle2, Target, AlertTriangle, Sparkles, Users, FileCode, FileText, GitBranch } from 'lucide-react';

interface BMADAgentPanelProps {
  bmad: {
    analyst?: any;
    pm?: any;
    ux?: any;
  };
  developerActive?: boolean;
  writerDocs?: any;
}

type AgentKey = 'analyst' | 'pm' | 'architect' | 'ux' | 'developer' | 'writer';

const AGENTS: Array<{
  key: AgentKey;
  name: string;
  role: string;
  initials: string;
  color: string;
  icon: any;
  bg: string;
  border: string;
  text: string;
}> = [
  { key: 'analyst', name: 'Mary', role: 'Analyst', initials: 'MA', color: 'cyan', icon: Microscope, bg: 'bg-cyan-500/10', border: 'border-cyan-500/40', text: 'text-cyan-300' },
  { key: 'pm', name: 'John', role: 'Product Manager', initials: 'JO', color: 'blue', icon: ClipboardList, bg: 'bg-blue-500/10', border: 'border-blue-500/40', text: 'text-blue-300' },
  { key: 'architect', name: 'Winston', role: 'Architect', initials: 'WI', color: 'orange', icon: Layers, bg: 'bg-orange-500/10', border: 'border-orange-500/40', text: 'text-orange-300' },
  { key: 'ux', name: 'Sally', role: 'UX Designer', initials: 'SA', color: 'emerald', icon: Palette, bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', text: 'text-emerald-300' },
  { key: 'developer', name: 'Amelia', role: 'Developer', initials: 'AM', color: 'amber', icon: Code2, bg: 'bg-amber-500/10', border: 'border-amber-500/40', text: 'text-amber-300' },
  { key: 'writer', name: 'Paige', role: 'Tech Writer', initials: 'PA', color: 'teal', icon: BookOpen, bg: 'bg-teal-500/10', border: 'border-teal-500/40', text: 'text-teal-300' },
];

export default function BMADAgentPanel({ bmad, developerActive, writerDocs }: BMADAgentPanelProps) {
  const [expanded, setExpanded] = useState<AgentKey | null>('analyst');

  const statusFor = (key: AgentKey): 'done' | 'pending' | 'active' => {
    if (key === 'analyst') return bmad?.analyst ? 'done' : 'pending';
    if (key === 'pm') return bmad?.pm ? 'done' : 'pending';
    if (key === 'architect') return 'done';
    if (key === 'ux') return bmad?.ux ? 'done' : 'pending';
    if (key === 'developer') return developerActive ? 'active' : (writerDocs ? 'done' : 'pending');
    if (key === 'writer') return writerDocs ? 'done' : 'pending';
    return 'pending';
  };

  return (
    <div className="bg-gradient-to-br from-[#0a0e1a] to-[#0b0f1e] border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 border border-cyan-500/40 flex items-center justify-center">
            <Users size={14} className="text-cyan-300" />
          </div>
          <div>
            <div className="text-sm font-bold text-white">Agent Collaboration Pipeline</div>
            <div className="text-[10px] text-slate-500">Six specialist agents collaborating on this feature</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-cyan-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>AGILE · MULTI-AGENT</span>
        </div>
      </div>

      {/* Agent track */}
      <div className="relative mb-4">
        <div className="absolute top-5 left-5 right-5 h-[2px] bg-slate-800" />
        <div className="relative flex justify-between">
          {AGENTS.map((agent, i) => {
            const Icon = agent.icon;
            const status = statusFor(agent.key);
            const done = status === 'done';
            const active = status === 'active';
            return (
              <button
                key={agent.key}
                onClick={() => setExpanded(expanded === agent.key ? null : agent.key)}
                className="flex flex-col items-center gap-1.5 relative z-10 group"
              >
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all relative ${
                  done ? `${agent.bg} ${agent.border} ${agent.text}` :
                  active ? `${agent.bg} ${agent.border} ${agent.text} animate-pulse` :
                  'bg-slate-900 border-slate-700 text-slate-600'
                } ${expanded === agent.key ? `ring-2 ring-${agent.color}-400/50` : 'group-hover:scale-110'}`}>
                  <Icon size={16} />
                  {done && (
                    <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 border-2 border-[#0b0f1e] flex items-center justify-center">
                      <CheckCircle2 size={9} className="text-white" />
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className={`text-[11px] font-bold leading-none ${done || active ? agent.text : 'text-slate-600'}`}>{agent.name}</div>
                  <div className="text-[9px] text-slate-600 mt-0.5">{agent.role}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Expanded deliverables */}
      {expanded && <AgentDetails agent={expanded} bmad={bmad} writerDocs={writerDocs} developerActive={developerActive} />}
    </div>
  );
}

function AgentDetails({ agent, bmad, writerDocs, developerActive }: { agent: AgentKey; bmad: any; writerDocs: any; developerActive?: boolean }) {
  const def = AGENTS.find(a => a.key === agent);
  if (!def) return null;
  const Icon = def.icon;

  const body = (() => {
    if (agent === 'analyst') {
      const data = bmad?.analyst;
      if (!data) return <AgentPending name={def.name} role={def.role} />;
      return (
        <div className="space-y-3">
          <Deliverable title="Executive Brief" icon={<Sparkles size={11} />}>
            <p className="text-[12px] text-slate-300 leading-relaxed">{data.brief}</p>
          </Deliverable>
          {data.domain_insights?.length > 0 && (
            <Deliverable title="Domain Insights" icon={<Microscope size={11} />}>
              <ul className="space-y-1">
                {data.domain_insights.map((i: string, k: number) => (
                  <li key={k} className="text-[11px] text-slate-400 flex items-start gap-1.5">
                    <ChevronRight size={10} className="text-cyan-500/60 mt-0.5 shrink-0" />{i}
                  </li>
                ))}
              </ul>
            </Deliverable>
          )}
          <div className="grid grid-cols-2 gap-3">
            {data.prior_art?.length > 0 && (
              <Deliverable title="Prior Art" icon={<GitBranch size={11} />}>
                {data.prior_art.map((i: string, k: number) => (
                  <div key={k} className="text-[11px] text-slate-400 mb-1">{i}</div>
                ))}
              </Deliverable>
            )}
            {data.risks?.length > 0 && (
              <Deliverable title="Risks & Mitigations" icon={<AlertTriangle size={11} />} accent="red">
                {data.risks.map((i: string, k: number) => (
                  <div key={k} className="text-[11px] text-slate-400 mb-1 flex items-start gap-1.5">
                    <span className="text-red-400 mt-0.5">&#9888;</span>{i}
                  </div>
                ))}
              </Deliverable>
            )}
          </div>
        </div>
      );
    }
    if (agent === 'pm') {
      const data = bmad?.pm;
      if (!data) return <AgentPending name={def.name} role={def.role} />;
      return (
        <div className="space-y-3">
          {data.epics?.map((epic: any, i: number) => (
            <div key={i} className="bg-[#0a0e1a] border border-blue-500/20 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[9px] font-mono font-bold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/30">{epic.id || `E${i + 1}`}</span>
                <span className="text-xs font-bold text-white">{epic.title}</span>
              </div>
              <div className="text-[11px] text-slate-400 italic mb-2">{epic.goal}</div>
              {epic.user_stories?.map((us: any, k: number) => (
                <div key={k} className="mt-2 pl-3 border-l-2 border-blue-500/30">
                  <div className="text-[11px] text-slate-300">
                    <span className="text-blue-400 font-semibold">As a</span> {us.as_a}, <span className="text-blue-400 font-semibold">I want</span> {us.i_want} <span className="text-blue-400 font-semibold">so that</span> {us.so_that}.
                  </div>
                  {us.acceptance_criteria?.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {us.acceptance_criteria.map((ac: string, m: number) => (
                        <li key={m} className="text-[10px] text-slate-500 flex items-start gap-1.5">
                          <CheckCircle2 size={9} className="text-emerald-500/70 mt-0.5 shrink-0" />{ac}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ))}
          <div className="grid grid-cols-3 gap-2">
            {data.success_metrics?.length > 0 && (
              <Deliverable title="Success Metrics" icon={<Target size={11} />}>
                {data.success_metrics.map((m: string, k: number) => (<div key={k} className="text-[11px] text-slate-400 mb-1">{m}</div>))}
              </Deliverable>
            )}
            {data.in_scope?.length > 0 && (
              <Deliverable title="In Scope" icon={<CheckCircle2 size={11} />} accent="emerald">
                {data.in_scope.map((s: string, k: number) => (<div key={k} className="text-[11px] text-slate-400 mb-1">{s}</div>))}
              </Deliverable>
            )}
            {data.out_of_scope?.length > 0 && (
              <Deliverable title="Out of Scope" icon={<AlertTriangle size={11} />} accent="slate">
                {data.out_of_scope.map((s: string, k: number) => (<div key={k} className="text-[11px] text-slate-500 mb-1">{s}</div>))}
              </Deliverable>
            )}
          </div>
        </div>
      );
    }
    if (agent === 'architect') {
      return (
        <Deliverable title="System Architecture" icon={<Layers size={11} />}>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Winston's architecture diagram, Databricks product selection, and component breakdown render in the panels below.
            Scroll down to explore the interactive diagram -- hover any node or link for deep details.
          </p>
        </Deliverable>
      );
    }
    if (agent === 'ux') {
      const data = bmad?.ux;
      if (!data) return <AgentPending name={def.name} role={def.role} />;
      return (
        <div className="space-y-3">
          {data.personas?.length > 0 && (
            <Deliverable title="Personas" icon={<Users size={11} />}>
              <div className="grid grid-cols-2 gap-2">
                {data.personas.map((p: any, k: number) => (
                  <div key={k} className="bg-[#0a0e1a] border border-emerald-500/20 rounded-lg p-2.5">
                    <div className="text-[11px] font-bold text-emerald-300">{p.name}</div>
                    {p.goals && <div className="text-[10px] text-slate-400 mt-1"><span className="text-slate-500">Goals: </span>{p.goals}</div>}
                    {p.pain_points && <div className="text-[10px] text-slate-400 mt-1"><span className="text-slate-500">Pain: </span>{p.pain_points}</div>}
                  </div>
                ))}
              </div>
            </Deliverable>
          )}
          {data.user_flows?.length > 0 && (
            <Deliverable title="User Flows" icon={<GitBranch size={11} />}>
              {data.user_flows.map((f: string, k: number) => (
                <div key={k} className="text-[11px] text-slate-400 mb-1 flex items-start gap-1.5">
                  <span className="text-emerald-500/70 font-mono">0{k + 1}</span>{f}
                </div>
              ))}
            </Deliverable>
          )}
          {data.screens?.length > 0 && (
            <Deliverable title="Screens" icon={<Palette size={11} />}>
              <div className="grid grid-cols-2 gap-2">
                {data.screens.map((s: any, k: number) => (
                  <div key={k} className="bg-[#0a0e1a] border border-emerald-500/20 rounded-lg p-2.5">
                    <div className="text-[11px] font-bold text-emerald-300">{s.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{s.description}</div>
                    {s.key_elements?.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.key_elements.map((e: string, m: number) => (
                          <span key={m} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{e}</span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Deliverable>
          )}
          {data.accessibility && (
            <Deliverable title="Accessibility" icon={<CheckCircle2 size={11} />}>
              <p className="text-[11px] text-slate-400 leading-relaxed">{data.accessibility}</p>
            </Deliverable>
          )}
        </div>
      );
    }
    if (agent === 'developer') {
      if (developerActive) return <div className="text-[11px] text-amber-300">Amelia is implementing the approved plan now...</div>;
      return (
        <Deliverable title="Implementation" icon={<FileCode size={11} />}>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Amelia (Developer) implements the approved architecture after sign-off.
            She writes production code against the plan, includes validation, and hands off to Paige for docs.
          </p>
        </Deliverable>
      );
    }
    if (agent === 'writer') {
      if (!writerDocs) {
        return (
          <Deliverable title="Documentation" icon={<BookOpen size={11} />}>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Paige writes the README, operations runbook, API contract, and changelog after Amelia ships.
              Her output becomes available on the preview screen once the build completes.
            </p>
          </Deliverable>
        );
      }
      return (
        <div className="space-y-3">
          {writerDocs.readme && (
            <Deliverable title="README" icon={<BookOpen size={11} />}>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed font-sans max-h-48 overflow-y-auto">{writerDocs.readme}</pre>
            </Deliverable>
          )}
          {writerDocs.runbook && (
            <Deliverable title="Runbook" icon={<FileText size={11} />}>
              <pre className="text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed font-sans max-h-48 overflow-y-auto">{writerDocs.runbook}</pre>
            </Deliverable>
          )}
          <div className="grid grid-cols-2 gap-3">
            {writerDocs.changelog_entry && (
              <Deliverable title="Changelog" icon={<GitBranch size={11} />}>
                <p className="text-[11px] text-slate-400 leading-relaxed">{writerDocs.changelog_entry}</p>
              </Deliverable>
            )}
            {writerDocs.api_contract && (
              <Deliverable title="API Contract" icon={<FileCode size={11} />}>
                <pre className="text-[10px] text-cyan-300 font-mono whitespace-pre-wrap">{writerDocs.api_contract}</pre>
              </Deliverable>
            )}
          </div>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className={`mt-2 ${def.bg} ${def.border} border rounded-xl p-4`}>
      <div className="flex items-center gap-3 mb-3 pb-3 border-b border-slate-800/50">
        <div className={`w-10 h-10 rounded-lg border ${def.border} ${def.bg} flex items-center justify-center`}>
          <Icon size={18} className={def.text} />
        </div>
        <div>
          <div className={`text-sm font-bold ${def.text}`}>{def.name} <span className="text-slate-500 font-normal">- {def.role}</span></div>
          <div className="text-[10px] text-slate-500">Agent {def.initials} -- deliverables below</div>
        </div>
      </div>
      {body}
    </div>
  );
}

function AgentPending({ name, role }: { name: string; role: string }) {
  return (
    <div className="text-[11px] text-slate-500 italic py-4 text-center">
      {name} ({role}) has not produced deliverables for this request yet. Try revising the plan.
    </div>
  );
}

function Deliverable({ title, icon, children, accent = 'slate' }: { title: string; icon: React.ReactNode; children: React.ReactNode; accent?: string }) {
  const accentText: Record<string, string> = {
    slate: 'text-slate-400', red: 'text-red-400', emerald: 'text-emerald-400',
  };
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-1.5 text-[10px] font-bold uppercase tracking-wider ${accentText[accent] || accentText.slate}`}>
        {icon}{title}
      </div>
      {children}
    </div>
  );
}
