import { useEffect, useRef, useState, useCallback } from 'react';
import { Shield, Lock, GitBranch, Search, ShieldCheck, Eye, Radio, Bot, Wifi, WifiOff } from 'lucide-react';
import { callFunction } from '../../lib/llmGateway';

type MessageType = 'alert' | 'analysis' | 'finding' | 'hunt' | 'prediction' | 'action' | 'handoff' | 'escalation' | 'feedback' | 'dispatch' | 'task_assignment';

interface Message {
  id: string;
  from: string;
  fromAgent: string;
  to?: string;
  toAgent?: string;
  text: string;
  subject?: string;
  type: MessageType;
  timestamp: number;
  isReal: boolean;
  confidence?: number;
}

const typeBorderColors: Record<string, string> = {
  alert: '#ef4444',
  analysis: '#06b6d4',
  finding: '#f97316',
  hunt: '#22c55e',
  prediction: '#eab308',
  action: '#3b82f6',
  handoff: '#06b6d4',
  escalation: '#ef4444',
  feedback: '#22c55e',
  dispatch: '#8b5cf6',
  task_assignment: '#f97316',
};

const agentColors: Record<string, string> = {
  'triage_agent': '#ef4444',
  'enrichment_agent': '#f97316',
  'threat_hunter_agent': '#22c55e',
  'nova_investigation': '#06b6d4',
  'vanguard_response': '#3b82f6',
  'orchestrator': '#8b5cf6',
  'ciso_assistant': '#eab308',
  'pattern_discovery': '#ec4899',
};

const formatRelativeTime = (timestamp: number): string => {
  const diff = Math.floor((Date.now() - timestamp) / 1000);
  if (diff < 3) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
};

const AgentCommsPanel = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [, setTick] = useState(0);
  const feedRef = useRef<HTMLDivElement>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());

  const fetchCommunications = useCallback(async () => {
    try {
      const { data, error } = await callFunction('agent-orchestrator', {
        action: 'get_communications',
        limit: 30,
        since_minutes: 120,
      });

      if (error || !data) return;

      const comms = (data as any).communications || [];
      if (comms.length === 0) return;

      const hasReal = comms.some((c: any) => c.isReal);
      setIsLive(hasReal);

      const newMessages: Message[] = comms
        .filter((c: any) => !seenIdsRef.current.has(c.id))
        .map((c: any) => {
          seenIdsRef.current.add(c.id);
          return {
            id: c.id,
            from: c.from || '',
            fromAgent: c.fromAgent || 'Agent',
            to: c.to,
            toAgent: c.toAgent,
            text: c.message || c.narrative || '',
            subject: c.subject,
            type: (c.type || 'handoff') as MessageType,
            timestamp: c.timestamp || Date.now(),
            isReal: !!c.isReal,
            confidence: c.confidence,
          };
        });

      if (newMessages.length > 0) {
        setMessages(prev => [...prev, ...newMessages].slice(-50));
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchCommunications();
    const interval = setInterval(fetchCommunications, 5000);
    return () => clearInterval(interval);
  }, [fetchCommunications]);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  const getAgentColor = (agentId: string): string => {
    const key = agentId.replace('agent-', '');
    return agentColors[key] || '#64748b';
  };

  const uniqueAgents = [...new Set(messages.map(m => m.fromAgent))];

  return (
    <div className="enterprise-card flex flex-col" style={{ maxHeight: 350 }}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-700/40 bg-slate-800/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-cyan-400" />
            <span className="text-slate-100 text-xs font-semibold tracking-wide">AGENT COMMUNICATIONS</span>
          </div>
          {isLive && (
            <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-400 rounded text-[9px] font-mono font-bold border border-emerald-500/20">
              PRODUCTION DATA
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-500 text-[10px] font-mono">{messages.length} MSGS</span>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded">
            {isLive ? <Wifi className="w-3 h-3 text-emerald-400" /> : <WifiOff className="w-3 h-3 text-slate-500" />}
            <span className={`text-[10px] font-mono font-bold ${isLive ? 'text-emerald-400' : 'text-slate-500'}`}>
              {isLive ? 'LIVE' : 'POLLING'}
            </span>
          </div>
        </div>
      </div>

      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-1.5"
        style={{ minHeight: 0 }}
      >
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full text-slate-600 text-xs font-mono">
            Waiting for agent communications...
          </div>
        )}
        {messages.map((msg, i) => {
          const agentColor = getAgentColor(msg.from);
          const isNew = i === messages.length - 1;
          return (
            <div
              key={msg.id}
              className="flex gap-2.5 py-1.5 px-2 rounded-md transition-opacity duration-500"
              style={{
                borderLeft: `2px solid ${typeBorderColors[msg.type] || '#64748b'}`,
                backgroundColor: msg.isReal ? 'rgba(6, 182, 212, 0.03)' : 'rgba(15, 23, 42, 0.3)',
                animation: isNew ? 'agentMsgFadeIn 0.4s ease-out' : undefined,
              }}
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="w-2 h-2 rounded-full mt-1" style={{ backgroundColor: agentColor }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[11px] font-mono font-bold" style={{ color: agentColor }}>
                    {msg.fromAgent}
                  </span>
                  {msg.toAgent && (
                    <>
                      <span className="text-[9px] text-slate-600">-&gt;</span>
                      <span className="text-[10px] text-slate-400 font-mono">{msg.toAgent}</span>
                    </>
                  )}
                  <span className="text-[9px] text-slate-600 font-mono ml-auto flex-shrink-0">
                    {formatRelativeTime(msg.timestamp)}
                  </span>
                </div>
                {msg.subject && (
                  <p className="text-[10px] text-slate-400 font-medium mb-0.5">{msg.subject}</p>
                )}
                <p className="text-[11px] text-slate-300 leading-relaxed">{msg.text}</p>
                {msg.confidence != null && (
                  <span className="text-[9px] text-cyan-500/70 font-mono">conf: {(msg.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between px-4 py-2 border-t border-slate-700/40 bg-slate-800/20">
        <div className="flex items-center gap-2">
          {uniqueAgents.slice(0, 8).map(agent => (
            <div key={agent} className="relative group">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getAgentColor(messages.find(m => m.fromAgent === agent)?.from || '') }} />
            </div>
          ))}
          <span className="text-[10px] text-slate-500 font-mono ml-1.5">
            {uniqueAgents.length} AGENTS ACTIVE
          </span>
        </div>
        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-cyan-500/5 border border-cyan-500/15 rounded">
          <Radio className="w-3 h-3 text-cyan-400" />
          <span className="text-cyan-400 text-[9px] font-mono font-bold">AUTONOMOUS</span>
        </div>
      </div>

      <style>{`
        @keyframes agentMsgFadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default AgentCommsPanel;
