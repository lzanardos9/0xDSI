import {
  Cpu, Network, Gavel, UserCheck, KeyRound, Zap, Eye, FileCheck,
  ShieldCheck, Ban, HelpCircle, ChevronDown, RefreshCw, AlertTriangle, Lock,
} from 'lucide-react';

type Stage = {
  n: number;
  Icon: typeof Cpu;
  tone: string;
  title: string;
  badge?: string;
  body: string;
  learns: string;
};

const STAGES: Stage[] = [
  {
    n: 1, Icon: Cpu, tone: 'text-slate-300 border-slate-500/30 bg-slate-500/10',
    title: 'The agent proposes — it cannot act',
    body: 'The agent never touches the workspace directly. It submits a request — “block 8.8.8.8 for finding F-1” — and nothing more. Everything after this point is out of the agent\u2019s hands.',
    learns: 'Wanting to act is not permission to act. Acting means asking.',
  },
  {
    n: 2, Icon: Network, tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
    badge: 'This tab',
    title: 'Omnigent policy overlay — ALLOW / DENY / ASK',
    body: 'Operator-written rules resolve the request to one verdict before anything else runs. If no rule matches, the answer is no. A DENY stops the action here; an ASK routes it to a human; an ALLOW lets it move on to the deeper safety checks.',
    learns: 'The boundaries are set by people, outside the agent\u2019s own code — and default to \u201cno\u201d.',
  },
  {
    n: 3, Icon: Gavel, tone: 'text-blue-300 border-blue-500/30 bg-blue-500/10',
    title: 'Authority kernel — is this within its powers?',
    body: 'Checks the agent\u2019s autonomy level, whether the target is in scope, and whether it is a safe target. An allowed request that exceeds the agent\u2019s granted authority is denied here.',
    learns: 'Even a permitted action still has to fit the authority the agent was actually given.',
  },
  {
    n: 4, Icon: UserCheck, tone: 'text-violet-300 border-violet-500/30 bg-violet-500/10',
    title: 'Human approval — a second, different person',
    body: 'A person other than the one who proposed it must approve, and the approval is locked to the exact version of the finding it was based on. If the facts change, the old approval is worthless.',
    learns: 'High-impact actions need a human, and no one approves their own work.',
  },
  {
    n: 5, Icon: KeyRound, tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10',
    title: 'Capability lease — one action, one use',
    body: 'A single-use, time-boxed token is minted for this exact action and re-checked at the last moment before the effect. If the target was quietly changed, or the token is replayed, it fails shut.',
    learns: 'Permission is for one specific act, once — never a reusable blank cheque.',
  },
  {
    n: 6, Icon: Zap, tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10',
    title: 'Execute — exactly once',
    body: 'Only now does the real side effect run, and only a single time. On every path the checks above rejected, this step is simply never reached.',
    learns: 'The real effect is unreachable on any route that wasn\u2019t fully authorized.',
  },
  {
    n: 7, Icon: Eye, tone: 'text-teal-300 border-teal-500/30 bg-teal-500/10',
    title: 'Independent verification — proof, not a claim',
    body: 'The system reads the target back to confirm the change actually took hold. A command that returned “success” but didn\u2019t take effect is recorded as failed, not a false win.',
    learns: 'Reporting “done” is not evidence; an independent observation is.',
  },
  {
    n: 8, Icon: FileCheck, tone: 'text-cyan-300 border-cyan-500/30 bg-cyan-500/10',
    title: 'Evidence ledger — a receipt for everything',
    body: 'Every attempt, allowed or refused, is written to an append-only record, tagged as simulated or live. The agent never writes its own receipt — the control plane does.',
    learns: 'Every action is accountable and auditable after the fact.',
  },
];

const VERDICTS = [
  { label: 'ALLOW', Icon: ShieldCheck, tone: 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10', blurb: 'Proceed to the deeper safety checks' },
  { label: 'ASK', Icon: HelpCircle, tone: 'text-amber-300 border-amber-500/30 bg-amber-500/10', blurb: 'Pause and require a human decision' },
  { label: 'DENY', Icon: Ban, tone: 'text-rose-300 border-rose-500/30 bg-rose-500/10', blurb: 'Refuse before the action is ever attempted' },
];

const PRINCIPLES = [
  { title: 'Deny by default', body: 'Nothing is permitted unless a rule explicitly allows it.' },
  { title: 'Separation of duties', body: 'The approver is never the proposer.' },
  { title: 'Least privilege, single use', body: 'Authority is scoped to one action and expires after one use.' },
  { title: 'Independent verification', body: 'Effects are confirmed by observation, not by the agent\u2019s word.' },
  { title: 'Explainable refusals', body: 'Every “no” carries a stable, readable reason code.' },
  { title: 'Tamper-evident audit', body: 'An append-only ledger records who allowed what, and what happened.' },
];

export default function OmnigentArchitecture() {
  return (
    <div className="space-y-3">
      <div className="bg-[#0b0f1e] border border-cyan-500/20 rounded-xl p-4">
        <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold">
          <Network size={13} />How the control plane governs — and teaches — an agent
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
          An agent request passes through a fixed chain of gates. Each gate can only <span className="text-slate-200">narrow</span> what
          is allowed, never widen it, and the real effect sits at the very end — unreachable unless every gate before it says yes. The
          policies you manage in this tab are the <span className="text-cyan-300">first</span> gate. Read the chain top to bottom.
        </p>
      </div>

      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
        <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-2">The three verdicts your rules produce</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {VERDICTS.map((v) => {
            const VIcon = v.Icon;
            return (
              <div key={v.label} className={`rounded-lg border p-3 ${v.tone}`}>
                <div className="flex items-center gap-1.5 text-xs font-bold"><VIcon size={13} />{v.label}</div>
                <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">{v.blurb}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
        <div className="flex flex-col items-stretch">
          {STAGES.map((s, i) => {
            const SIcon = s.Icon;
            const dotTone = s.tone.split(' ')[0];
            return (
              <div key={s.n}>
                <div className="flex gap-3">
                  <div className="flex flex-col items-center shrink-0">
                    <div className={`w-9 h-9 rounded-lg border flex items-center justify-center ${s.tone}`}>
                      <SIcon size={16} />
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-mono ${dotTone}`}>{String(s.n).padStart(2, '0')}</span>
                      <span className="text-xs font-semibold text-white">{s.title}</span>
                      {s.badge && (
                        <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md border border-cyan-500/40 text-cyan-200 bg-cyan-500/10">{s.badge}</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mt-1">{s.body}</p>
                    <p className="text-[11px] leading-relaxed mt-1.5 flex items-start gap-1.5">
                      <span className={`shrink-0 font-semibold ${dotTone}`}>The agent learns:</span>
                      <span className="text-slate-300">{s.learns}</span>
                    </p>
                  </div>
                </div>
                {i < STAGES.length - 1 && (
                  <div className="flex justify-start pl-[14px] py-1">
                    <ChevronDown size={16} className="text-slate-600" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-[#0b0f1e] border border-cyan-500/30 rounded-xl p-4">
        <div className="flex items-center gap-2 text-cyan-300 text-xs font-semibold">
          <RefreshCw size={13} />The teaching loop — why every refusal is fed back
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed mt-2">
          When any gate says no, the agent does not just get a silent failure. It receives a <span className="text-slate-200">stable,
          human-readable reason</span> — which gate stopped it and why (an authority limit, a missing approval, a replayed token, a
          policy DENY). Because the reason is precise and consistent, the agent can adjust and propose a safer, in-bounds action next
          time instead of guessing. Over many actions, the boundaries become predictable, and the safe path becomes the path of least
          resistance. That feedback — refuse, explain, let it retry within the lines — is how the plane <span className="text-cyan-300">educates</span> agents
          toward safer, more ethical behaviour.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="bg-[#0b0f1e] border border-rose-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 text-rose-300 text-xs font-semibold">
            <Lock size={13} />Two things the agent can never do
          </div>
          <ul className="mt-2 space-y-1.5">
            <li className="text-[11px] text-slate-400 flex items-start gap-1.5">
              <Ban size={12} className="text-rose-300 mt-0.5 shrink-0" />Reach the workspace on its own — the effect is only ever run by the checkpoint after every gate clears.
            </li>
            <li className="text-[11px] text-slate-400 flex items-start gap-1.5">
              <Ban size={12} className="text-rose-300 mt-0.5 shrink-0" />Declare its own work verified — only an independent read-back can mark an action confirmed.
            </li>
          </ul>
        </div>
        <div className="bg-[#0b0f1e] border border-[#1e293b] rounded-xl p-4">
          <div className="flex items-center gap-2 text-slate-200 text-xs font-semibold">
            <ShieldCheck size={13} className="text-emerald-300" />The principles enforced at every step
          </div>
          <div className="grid grid-cols-1 gap-1.5 mt-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="text-[11px] leading-relaxed">
                <span className="text-slate-200 font-semibold">{p.title}. </span>
                <span className="text-slate-400">{p.body}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-amber-200/80 leading-relaxed flex items-start gap-1.5 px-1">
        <AlertTriangle size={13} className="mt-0.5 shrink-0" />
        Honest note: this chain is built and proven in code and tests. The final live-workspace step and a real Omnigent runner enforcing
        these rules on every agent path are the remaining milestones — until then, no agent is marked fully governed.
      </p>
    </div>
  );
}
