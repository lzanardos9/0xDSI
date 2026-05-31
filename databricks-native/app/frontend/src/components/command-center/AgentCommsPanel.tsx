import { useEffect, useRef, useState } from 'react';
import { Shield, Lock, GitBranch, Search, ShieldCheck, Eye, Radio, Bot } from 'lucide-react';

type MessageType = 'alert' | 'analysis' | 'finding' | 'hunt' | 'prediction' | 'action';

interface Agent {
  id: string;
  role: string;
  color: string;
  icon: typeof Shield;
}

interface Message {
  agent: string;
  text: string;
  type: MessageType;
  timestamp: number;
}

const agents: Agent[] = [
  { id: 'SENTINEL', role: 'Threat Detection Lead', color: '#ef4444', icon: Shield },
  { id: 'CIPHER', role: 'Cryptanalysis & Decryption', color: '#f97316', icon: Lock },
  { id: 'NEXUS', role: 'Correlation Engine', color: '#06b6d4', icon: GitBranch },
  { id: 'PHANTOM', role: 'Threat Hunter', color: '#22c55e', icon: Search },
  { id: 'AEGIS', role: 'Defense Orchestrator', color: '#3b82f6', icon: ShieldCheck },
  { id: 'ORACLE', role: 'Predictive Analytics', color: '#eab308', icon: Eye },
];

const conversationScript = [
  { agent: 'SENTINEL', text: "I'm picking up a weird beacon pattern on WKS-FIN-042 -- every 120 seconds with about 15 seconds of jitter. Flagging it for correlation.", type: 'alert' as MessageType },
  { agent: 'NEXUS', text: "Got it. I'm seeing three other signals that line up with this. Pattern's matching the APT-29 TTP cluster at 94% confidence. Let me pull the IOC database.", type: 'analysis' as MessageType },
  { agent: 'CIPHER', text: "Just cracked the C2 channel headers. The JA3 fingerprint e7d705a3 is a match for the Cozy Bear toolkit -- working on extracting payload signatures now.", type: 'finding' as MessageType },
  { agent: 'PHANTOM', text: "I went hunting across the east subnet proactively and found two more endpoints with the same beacon behavior. This is wider than we thought.", type: 'hunt' as MessageType },
  { agent: 'ORACLE', text: "Ran the Monte Carlo sim -- 87% chance of lateral movement within four hours at current trajectory. I'd strongly recommend preemptive isolation.", type: 'prediction' as MessageType },
  { agent: 'AEGIS', text: "On it. Kicking off containment playbook ALPHA-7 right now. Isolating the affected segment and deploying an EDR sweep across VLAN 42.", type: 'action' as MessageType },
  { agent: 'SENTINEL', text: "Heads up, second alert just fired -- Mimikatz signature on SRV-DC-01. Something's accessing LSASS memory through an injected process.", type: 'alert' as MessageType },
  { agent: 'NEXUS', text: "That credential dump ties directly back to the original C2 beacon. I've reconstructed the chain: Initial Access, then Execution, then Credential Access. We're at kill chain stage five.", type: 'analysis' as MessageType },
  { agent: 'AEGIS', text: "This just escalated. I'm forcing password rotation on fourteen accounts and revoking all Kerberos tickets for the affected scope.", type: 'action' as MessageType },
  { agent: 'PHANTOM', text: "Deep scan's finished. Good news -- no additional lateral movement beyond what we already found. Perimeter's holding. I'll keep watching.", type: 'hunt' as MessageType },
  { agent: 'ORACLE', text: "Updated the forecast. Containment effectiveness is at 96.2% and residual risk is dropping. Should have full remediation wrapped up in about two and a half hours.", type: 'prediction' as MessageType },
  { agent: 'CIPHER', text: "Pulled four unique IOCs out of the payload analysis. Pushing them to the threat feed now so they get blocked enterprise-wide.", type: 'finding' as MessageType },
];

const typeBorderColors: Record<MessageType, string> = {
  alert: '#ef4444',
  analysis: '#06b6d4',
  finding: '#f97316',
  hunt: '#22c55e',
  prediction: '#eab308',
  action: '#3b82f6',
};

const formatRelativeTime = (timestamp: number): string => {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 3) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 120) return '1m ago';
  return `${Math.floor(diff / 60)}m ago`;
};

const AgentCommsPanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [, setTick] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const nextIndexRef = useRef(3);

  useEffect(() => {
    const now = Date.now();
    const initial: Message[] = conversationScript.slice(0, 3).map((m, i) => ({
      ...m,
      timestamp: now - (3 - i) * 3500,
    }));
    setMessages(initial);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      const idx = nextIndexRef.current % conversationScript.length;
      const script = conversationScript[idx];
      nextIndexRef.current++;
      setMessages(prev => [
        ...prev,
        { ...script, timestamp: Date.now() },
      ]);
    }, 3500);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const agentMap = new Map(agents.map(a => [a.id, a]));

  return (
    <div className="enterprise-card flex flex-col" style={{ maxHeight: 350 }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/40 bg-slate-800/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-100 text-xs font-semibold tracking-wide">AGENT COMMUNICATIONS</span>
          </div>
          <span className="px-2 py-0.5 bg-cyan-500/10 text-cyan-400 rounded text-[9px] font-mono font-bold border border-cyan-500/20">
            MULTI-AGENT SOC
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-[10px] font-mono">{agents.length} AGENTS</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-[10px] font-mono font-bold">LIVE</span>
          </div>
        </div>
      </div>

      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5"
        style={{ minHeight: 0 }}
      >
        {messages.map((msg, i) => {
          const agent = agentMap.get(msg.agent);
          if (!agent) return null;
          const isNew = i === messages.length - 1;
          return (
            <div
              key={`${i}-${msg.timestamp}`}
              className="flex gap-2.5 py-1.5 px-2 rounded-md transition-opacity duration-500"
              style={{
                borderLeft: `2px solid ${typeBorderColors[msg.type]}`,
                backgroundColor: 'rgba(15, 23, 42, 0.3)',
                opacity: 1,
                animation: isNew ? 'agentMsgFadeIn 0.4s ease-out' : undefined,
              }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <div
                  className="w-2 h-2 rounded-full mt-1"
                  style={{ backgroundColor: agent.color }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span
                    className="text-[11px] font-mono font-bold"
                    style={{ color: agent.color }}
                  >
                    {agent.id}
                  </span>
                  <span className="text-[9px] text-slate-600 font-mono truncate">
                    {agent.role}
                  </span>
                  <span className="text-[9px] text-slate-600 font-mono ml-auto flex-shrink-0">
                    {formatRelativeTime(msg.timestamp)}
                  </span>
                </div>
                <p className="text-[11px] text-slate-300 leading-relaxed">
                  {msg.text}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700/40 bg-slate-800/20">
        <div className="flex items-center gap-2">
          {agents.map(agent => (
            <div key={agent.id} className="relative group">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: agent.color }}
              />
              <div
                className="absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-40"
                style={{ backgroundColor: agent.color }}
              />
            </div>
          ))}
          <span className="text-[10px] text-slate-500 font-mono ml-1.5">ALL ACTIVE</span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/5 border border-cyan-500/15 rounded">
          <Radio className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-400 text-[9px] font-mono font-bold">AUTONOMOUS MODE</span>
        </div>
      </div>

      <style>{`
        @keyframes agentMsgFadeIn {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
};

export default AgentCommsPanel;
