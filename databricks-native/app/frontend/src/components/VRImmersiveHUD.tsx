import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Target, Activity, Eye, X, Glasses, ChevronRight,
  Check, XCircle, Users, Scan, Hand, Monitor, Wifi, Clock,
  Mic, MicOff, Volume2, VolumeX, MessageCircle,
} from 'lucide-react';
import { AGENT_DEFS } from '../lib/soc3dHelpers';
import { voiceEngine, type AgentUtterance } from '../lib/voiceConversation';

const VR_ROLES = [
  {
    id: 'analyst',
    name: 'SOC Analyst',
    icon: Shield,
    color: '#06b6d4',
    description: 'Review and triage alerts, validate AI agent findings, provide expert judgment on ambiguous threats',
    capabilities: ['Alert Validation', 'Threat Assessment', 'False Positive Review'],
  },
  {
    id: 'hunter',
    name: 'Threat Hunter',
    icon: Target,
    color: '#f59e0b',
    description: 'Investigate suspicious patterns, track adversary TTPs, discover hidden threats buried in the noise',
    capabilities: ['Pattern Analysis', 'TTP Tracking', 'Zero-Day Discovery'],
  },
  {
    id: 'commander',
    name: 'Incident Commander',
    icon: Activity,
    color: '#ef4444',
    description: 'Oversee response operations, authorize containment actions, coordinate cross-team escalation',
    capabilities: ['Response Authorization', 'Team Coordination', 'Escalation Mgmt'],
  },
  {
    id: 'ciso',
    name: 'CISO Observer',
    icon: Eye,
    color: '#10b981',
    description: 'Executive-level strategic oversight, real-time risk assessment, board-ready situational awareness',
    capabilities: ['Risk Overview', 'Strategic Metrics', 'Executive Briefing'],
  },
];

const HUMAN_TASKS = [
  { id: 1, title: 'Validate APT41 Attribution', priority: 'critical' as const, agent: 'Nova', agentColor: '#3b82f6', description: 'TTPs match APT41 at 72% confidence. Human validation needed before escalation.', time: '2m ago' },
  { id: 2, title: 'Approve Emergency Host Isolation', priority: 'critical' as const, agent: 'Vanguard', agentColor: '#ef4444', description: 'C2 beacon on exec laptop. Requesting authorization to isolate from network.', time: '5m ago' },
  { id: 3, title: 'Confirm False Positive', priority: 'medium' as const, agent: 'Atlas', agentColor: '#f59e0b', description: 'VPN exit node login matches known employee travel schedule.', time: '8m ago' },
  { id: 4, title: 'Authorize Subnet Block', priority: 'high' as const, agent: 'Commander', agentColor: '#06b6d4', description: 'Blocking /16 subnet may impact 3 business partners. Need approval.', time: '12m ago' },
  { id: 5, title: 'Review Threat Intel Match', priority: 'medium' as const, agent: 'Sage', agentColor: '#14b8a6', description: 'New CISA IOCs match 3 internal indicators. Confirm operational relevance.', time: '15m ago' },
];

interface ChatMessage {
  id: string;
  sender: 'user' | 'agent';
  agentName?: string;
  agentColor?: string;
  text: string;
  timestamp: number;
}

interface FeedItem {
  msg: string;
  color: string;
  time: string;
  severity: string;
}

interface Props {
  mode: 'role-select' | 'immersive';
  selectedRole: string | null;
  onSelectRole: (role: string) => void;
  onExit: () => void;
  xrSupported: boolean;
  feed: FeedItem[];
}

export default function VRImmersiveHUD({ mode, selectedRole, onSelectRole, onExit, xrSupported, feed }: Props) {
  const [processedTasks, setProcessedTasks] = useState<Record<number, 'approved' | 'rejected'>>({});
  const [showWelcome, setShowWelcome] = useState(true);
  const [conversationMode, setConversationMode] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingAgent, setSpeakingAgent] = useState<string | null>(null);
  const [chatLog, setChatLog] = useState<ChatMessage[]>([]);
  const [liveCaption, setLiveCaption] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const speakCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (mode === 'immersive') {
      const t = setTimeout(() => setShowWelcome(false), 3000);
      return () => clearTimeout(t);
    }
  }, [mode]);

  const addChatMessage = useCallback((msg: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    setChatLog(prev => [...prev, { ...msg, id: crypto.randomUUID(), timestamp: Date.now() }].slice(-50));
  }, []);

  const parseVoiceTaskAction = useCallback((text: string): { taskId: number; action: 'approved' | 'rejected' } | null => {
    const lower = text.toLowerCase();
    const isApprove = /\b(approve|accept|confirm|authorize|yes|go ahead|do it|proceed)\b/.test(lower);
    const isReject = /\b(reject|deny|decline|block|no|stop|cancel|hold)\b/.test(lower);
    if (!isApprove && !isReject) return null;

    const taskKeywords: Record<number, string[]> = {
      1: ['apt', 'attribution', 'apt41', 'validate', 'first', 'task one', 'task 1'],
      2: ['isolation', 'isolate', 'host', 'emergency', 'laptop', 'second', 'task two', 'task 2'],
      3: ['false positive', 'vpn', 'confirm', 'third', 'task three', 'task 3'],
      4: ['subnet', 'block subnet', 'authorize', 'fourth', 'task four', 'task 4'],
      5: ['threat intel', 'review', 'cisa', 'fifth', 'task five', 'task 5'],
    };

    for (const [id, keywords] of Object.entries(taskKeywords)) {
      if (keywords.some(kw => lower.includes(kw))) {
        const taskId = Number(id);
        if (!processedTasks[taskId]) {
          return { taskId, action: isApprove ? 'approved' : 'rejected' };
        }
      }
    }

    const pending = HUMAN_TASKS.filter(t => !processedTasks[t.id]);
    if (pending.length === 1) {
      return { taskId: pending[0].id, action: isApprove ? 'approved' : 'rejected' };
    }

    return null;
  }, [processedTasks]);

  useEffect(() => {
    const unsub = voiceEngine.subscribe((utterance: AgentUtterance) => {
      setSpeakingAgent(utterance.agentName);
      setIsSpeaking(true);
      setLiveCaption(utterance.text);
      addChatMessage({
        sender: 'agent',
        agentName: utterance.agentName,
        agentColor: utterance.agentColor,
        text: utterance.text,
      });
    });

    voiceEngine.onUserMessage((text: string) => {
      setIsListening(false);
      addChatMessage({ sender: 'user', text });

      const taskAction = parseVoiceTaskAction(text);
      if (taskAction) {
        setProcessedTasks(prev => ({ ...prev, [taskAction.taskId]: taskAction.action }));
        const task = HUMAN_TASKS.find(t => t.id === taskAction.taskId);
        const actionWord = taskAction.action === 'approved' ? 'approved' : 'rejected';
        const response = task
          ? `Acknowledged. "${task.title}" has been ${actionWord}. ${taskAction.action === 'approved' ? 'Executing authorized action now.' : 'Action halted. Standing by for further instructions.'}`
          : `Task ${actionWord}.`;
        setTimeout(() => {
          voiceEngine.speak('Commander', response);
        }, 400);
        return;
      }

      const { agent, response } = voiceEngine.respondToUser(text);
      setTimeout(() => {
        voiceEngine.speak(agent, response);
      }, 500);
    });

    return unsub;
  }, [addChatMessage, parseVoiceTaskAction]);

  useEffect(() => {
    speakCheckRef.current = setInterval(() => {
      if (voiceEngine.isSpeaking()) {
        setIsSpeaking(true);
      } else {
        setIsSpeaking(false);
        setSpeakingAgent(null);
        setLiveCaption(null);
      }
      setIsListening(voiceEngine.isListening());
    }, 300);

    return () => {
      if (speakCheckRef.current) clearInterval(speakCheckRef.current);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatLog]);

  const toggleConversationMode = useCallback(() => {
    if (conversationMode) {
      voiceEngine.disable();
      setConversationMode(false);
      setChatLog([]);
      setLiveCaption(null);
    } else {
      voiceEngine.enable();
      setConversationMode(true);
    }
  }, [conversationMode]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      voiceEngine.stopListening();
    } else {
      voiceEngine.startListening();
    }
  }, [isListening]);

  const handleExitVR = useCallback(() => {
    voiceEngine.disable();
    setConversationMode(false);
    setChatLog([]);
    setLiveCaption(null);
    onExit();
  }, [onExit]);

  if (mode === 'role-select') {
    return <RoleSelector onSelectRole={onSelectRole} onExit={onExit} xrSupported={xrSupported} />;
  }

  const role = VR_ROLES.find(r => r.id === selectedRole);
  const RoleIcon = role?.icon || Shield;
  const pendingCount = HUMAN_TASKS.filter(t => !processedTasks[t.id]).length;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none">
      <div className="absolute inset-0 opacity-[0.025]" style={{
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(6,182,212,0.15) 2px, rgba(6,182,212,0.15) 4px)',
      }} />
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.5) 100%)',
      }} />

      {showWelcome && (
        <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none animate-pulse">
          <div className="text-center">
            <div className="text-4xl font-black tracking-widest mb-2" style={{ color: role?.color }}>
              ENTERING SOC
            </div>
            <div className="text-slate-500 text-sm tracking-[0.3em]">INITIALIZING {role?.name.toUpperCase()} INTERFACE</div>
          </div>
        </div>
      )}

      <div className="absolute top-0 left-0 right-0 pointer-events-auto">
        <div className="flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/80 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border" style={{ borderColor: role?.color + '40', backgroundColor: role?.color + '10' }}>
              <RoleIcon className="w-4 h-4" style={{ color: role?.color }} />
              <span className="text-sm font-bold" style={{ color: role?.color }}>{role?.name}</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700/50">
              <Glasses className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-xs text-slate-300 font-medium">IMMERSIVE MODE</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900/80 border border-emerald-500/30">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] text-emerald-400 font-medium">SEATED</span>
            </div>

            <button
              onClick={toggleConversationMode}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all duration-300 ${
                conversationMode
                  ? 'bg-cyan-500/15 border-cyan-400/40 shadow-lg shadow-cyan-500/10'
                  : 'bg-slate-900/80 border-slate-700/50 hover:border-slate-600/60'
              }`}
            >
              <MessageCircle className={`w-3.5 h-3.5 transition ${conversationMode ? 'text-cyan-400' : 'text-slate-500'}`} />
              <span className={`text-[10px] font-bold tracking-wider ${conversationMode ? 'text-cyan-300' : 'text-slate-500'}`}>
                VOICE {conversationMode ? 'ON' : 'OFF'}
              </span>
              {conversationMode && <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />}
            </button>
          </div>
          <div className="flex items-center gap-3">
            {xrSupported && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/30">
                <Glasses className="w-3 h-3 text-cyan-400" />
                <span className="text-[10px] text-cyan-300">Vision Pro Ready</span>
              </div>
            )}
            <button onClick={handleExitVR} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 transition text-xs text-red-400 font-bold">
              <X className="w-3.5 h-3.5" />
              EXIT VR
            </button>
          </div>
        </div>
      </div>

      <div className="absolute left-4 top-16 bottom-20 w-52 pointer-events-auto overflow-hidden">
        <div className="h-full bg-slate-950/80 backdrop-blur-xl rounded-xl border border-slate-700/40 p-3 flex flex-col">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-800">
            <Users className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[10px] font-bold text-slate-400 tracking-widest">AGENT STATUS</span>
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {AGENT_DEFS.map(agent => {
              const isCurrentlySpeaking = conversationMode && isSpeaking && speakingAgent === agent.name;
              return (
                <div
                  key={agent.id}
                  className={`p-2 rounded-lg border transition-all duration-300 ${
                    isCurrentlySpeaking
                      ? 'bg-slate-800/70 border-opacity-100'
                      : 'bg-slate-800/40 border-slate-700/20 hover:border-slate-600/40'
                  }`}
                  style={isCurrentlySpeaking ? { borderColor: agent.color + '60', boxShadow: `0 0 12px ${agent.color}15` } : undefined}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold" style={{ color: agent.color }}>{agent.name}</span>
                      {isCurrentlySpeaking && (
                        <div className="flex items-center gap-0.5">
                          <div className="w-0.5 h-2 rounded-full animate-pulse" style={{ backgroundColor: agent.color, animationDelay: '0ms' }} />
                          <div className="w-0.5 h-3 rounded-full animate-pulse" style={{ backgroundColor: agent.color, animationDelay: '150ms' }} />
                          <div className="w-0.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: agent.color, animationDelay: '300ms' }} />
                        </div>
                      )}
                    </div>
                    <span className={`w-2 h-2 rounded-full ${
                      agent.status === 'alert' ? 'bg-red-400 animate-pulse' : agent.status === 'busy' ? 'bg-amber-400' : 'bg-emerald-400'
                    }`} />
                  </div>
                  <p className="text-[9px] text-slate-500 mb-1">{agent.role}</p>
                  <div className="h-1 bg-slate-700/50 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${agent.metrics.accuracy}%`,
                      backgroundColor: agent.color,
                      boxShadow: `0 0 6px ${agent.color}40`,
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-slate-800">
            <div className="flex items-center gap-1.5 text-[9px] text-slate-600">
              <Wifi className="w-3 h-3" />
              <span>All agents operational</span>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute right-4 top-16 bottom-20 w-72 pointer-events-auto overflow-hidden">
        <div className="h-full bg-slate-950/80 backdrop-blur-xl rounded-xl border border-slate-700/40 p-3 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Scan className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] font-bold text-slate-400 tracking-widest">NEEDS YOUR INPUT</span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
              {pendingCount}
            </span>
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto">
            {HUMAN_TASKS.map(task => {
              const processed = processedTasks[task.id];
              return (
                <div key={task.id} className={`p-2.5 rounded-lg border transition-all duration-300 ${
                  processed
                    ? processed === 'approved'
                      ? 'bg-emerald-500/5 border-emerald-500/20 opacity-50'
                      : 'bg-red-500/5 border-red-500/20 opacity-50'
                    : 'bg-slate-800/40 border-slate-700/20'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.priority === 'critical' ? 'bg-red-400 animate-pulse' :
                      task.priority === 'high' ? 'bg-amber-400' : 'bg-blue-400'
                    }`} />
                    <span className="text-[11px] font-bold text-white truncate">{task.title}</span>
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px]" style={{ color: task.agentColor }}>{task.agent}</span>
                    <span className="text-[9px] text-slate-700">|</span>
                    <Clock className="w-2.5 h-2.5 text-slate-600" />
                    <span className="text-[9px] text-slate-600">{task.time}</span>
                  </div>
                  <p className="text-[9px] text-slate-500 leading-relaxed mb-2">{task.description}</p>
                  {processed ? (
                    <div className={`text-[9px] font-bold uppercase tracking-wider ${
                      processed === 'approved' ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {processed === 'approved' ? 'Approved' : 'Rejected'}
                    </div>
                  ) : (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => setProcessedTasks(prev => ({ ...prev, [task.id]: 'approved' }))}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-bold hover:bg-emerald-500/20 transition"
                      >
                        <Check className="w-2.5 h-2.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => setProcessedTasks(prev => ({ ...prev, [task.id]: 'rejected' }))}
                        className="flex-1 flex items-center justify-center gap-1 py-1 rounded bg-red-500/10 border border-red-500/30 text-red-400 text-[9px] font-bold hover:bg-red-500/20 transition"
                      >
                        <XCircle className="w-2.5 h-2.5" />
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {conversationMode && (
        <ConversationPanel
          chatLog={chatLog}
          liveCaption={liveCaption}
          isSpeaking={isSpeaking}
          isListening={isListening}
          speakingAgent={speakingAgent}
          onToggleListening={toggleListening}
          chatEndRef={chatEndRef}
        />
      )}

      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none opacity-15">
        <div className="relative w-8 h-8">
          <div className="absolute inset-0 border border-cyan-400/60 rounded-full" />
          <div className="absolute top-1/2 left-0 w-2.5 h-px bg-cyan-400/60 -translate-y-1/2" />
          <div className="absolute top-1/2 right-0 w-2.5 h-px bg-cyan-400/60 -translate-y-1/2" />
          <div className="absolute top-0 left-1/2 w-px h-2.5 bg-cyan-400/60 -translate-x-1/2" />
          <div className="absolute bottom-0 left-1/2 w-px h-2.5 bg-cyan-400/60 -translate-x-1/2" />
          <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-cyan-400/40 rounded-full -translate-x-1/2 -translate-y-1/2" />
        </div>
      </div>

      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-none">
        <div className="flex items-center gap-6 px-6 py-2.5 rounded-xl bg-slate-950/70 backdrop-blur-xl border border-slate-700/30">
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <div className="w-3 h-3 border border-slate-600 rounded" />
            <span>Drag to look around</span>
          </div>
          <div className="w-px h-3 bg-slate-800" />
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <div className="w-3 h-3 border border-slate-600 rounded-full" />
            <span>Scroll to zoom</span>
          </div>
          <div className="w-px h-3 bg-slate-800" />
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Hand className="w-3 h-3 text-slate-600" />
            <span>Interact with panels</span>
          </div>
          {conversationMode && (
            <>
              <div className="w-px h-3 bg-slate-800" />
              <div className="flex items-center gap-2 text-[10px] text-cyan-400">
                <Mic className="w-3 h-3" />
                <span>Press mic to talk</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationPanel({
  chatLog,
  liveCaption,
  isSpeaking,
  isListening,
  speakingAgent,
  onToggleListening,
  chatEndRef,
}: {
  chatLog: ChatMessage[];
  liveCaption: string | null;
  isSpeaking: boolean;
  isListening: boolean;
  speakingAgent: string | null;
  onToggleListening: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}) {
  return (
    <div className="absolute bottom-20 left-1/2 -translate-x-1/2 w-[480px] pointer-events-auto">
      <div className="bg-slate-950/90 backdrop-blur-xl rounded-2xl border border-slate-700/40 shadow-2xl shadow-black/40 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <MessageCircle className="w-4 h-4 text-cyan-400" />
              {(isSpeaking || isListening) && (
                <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              )}
            </div>
            <span className="text-[11px] font-bold text-slate-300 tracking-wider">VOICE CONVERSATION</span>
          </div>
          <div className="flex items-center gap-2">
            {isSpeaking && speakingAgent && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                <Volume2 className="w-3 h-3 text-cyan-400 animate-pulse" />
                <span className="text-[9px] text-cyan-300 font-medium">{speakingAgent} speaking</span>
              </div>
            )}
            {isListening && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20">
                <Mic className="w-3 h-3 text-red-400 animate-pulse" />
                <span className="text-[9px] text-red-300 font-medium">Listening...</span>
              </div>
            )}
          </div>
        </div>

        <div className="h-40 overflow-y-auto px-4 py-2 space-y-2 custom-scrollbar">
          {chatLog.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Volume2 className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                <p className="text-[10px] text-slate-600">Agents will narrate their actions.</p>
                <p className="text-[10px] text-slate-700">Press the mic to talk to them.</p>
              </div>
            </div>
          )}
          {chatLog.map(msg => (
            <div key={msg.id} className={`flex gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.sender === 'agent' && (
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-[8px] font-black text-white" style={{ backgroundColor: msg.agentColor }}>
                  {msg.agentName?.[0]}
                </div>
              )}
              <div className={`max-w-[85%] px-3 py-1.5 rounded-xl ${
                msg.sender === 'user'
                  ? 'bg-cyan-500/15 border border-cyan-500/20 text-cyan-100'
                  : 'bg-slate-800/60 border border-slate-700/30 text-slate-300'
              }`}>
                {msg.sender === 'agent' && (
                  <span className="text-[8px] font-bold block mb-0.5" style={{ color: msg.agentColor }}>{msg.agentName}</span>
                )}
                <p className="text-[10px] leading-relaxed">{msg.text}</p>
              </div>
              {msg.sender === 'user' && (
                <div className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[8px] font-bold text-cyan-400">U</span>
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {liveCaption && isSpeaking && (
          <div className="px-4 py-2 border-t border-slate-800/40 bg-slate-900/50">
            <div className="flex items-start gap-2">
              <div className="flex items-center gap-0.5 mt-1 flex-shrink-0">
                <div className="w-0.5 h-1.5 bg-cyan-400 rounded-full animate-pulse" />
                <div className="w-0.5 h-2.5 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '100ms' }} />
                <div className="w-0.5 h-1 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '200ms' }} />
                <div className="w-0.5 h-2 bg-cyan-400 rounded-full animate-pulse" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-[10px] text-cyan-200/80 italic leading-relaxed">{liveCaption}</p>
            </div>
          </div>
        )}

        <div className="px-4 py-3 border-t border-slate-800/60 flex items-center justify-center gap-4">
          <button
            onClick={onToggleListening}
            className={`relative group flex items-center justify-center w-12 h-12 rounded-full border-2 transition-all duration-300 ${
              isListening
                ? 'bg-red-500/20 border-red-400/60 shadow-lg shadow-red-500/20'
                : 'bg-slate-800/60 border-slate-600/40 hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:shadow-lg hover:shadow-cyan-500/10'
            }`}
          >
            {isListening ? (
              <>
                <MicOff className="w-5 h-5 text-red-400" />
                <div className="absolute inset-0 rounded-full border-2 border-red-400/30 animate-ping" />
              </>
            ) : (
              <Mic className="w-5 h-5 text-slate-400 group-hover:text-cyan-400 transition" />
            )}
          </button>
          <div className="text-center">
            <p className="text-[10px] text-slate-500">
              {isListening ? 'Listening... Speak now' : 'Tap to speak with agents'}
            </p>
            <p className="text-[8px] text-slate-700 mt-0.5">
              {isListening ? 'Will auto-stop when you finish' : 'Ask about status, threats, or give commands'}
            </p>
          </div>
          {isSpeaking ? (
            <button
              onClick={() => window.speechSynthesis?.cancel()}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/60 border border-slate-600/40 hover:border-amber-400/40 transition"
            >
              <VolumeX className="w-4 h-4 text-slate-500 hover:text-amber-400" />
            </button>
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-800/30 border border-slate-700/20 flex items-center justify-center">
              <Volume2 className="w-4 h-4 text-slate-700" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleSelector({ onSelectRole, onExit, xrSupported }: { onSelectRole: (r: string) => void; onExit: () => void; xrSupported: boolean }) {
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative z-10 max-w-4xl w-full px-6">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 bg-slate-900/90 px-6 py-3 rounded-2xl border border-cyan-500/30 shadow-lg shadow-cyan-500/5 mb-5">
            <Glasses className="w-6 h-6 text-cyan-400" />
            <span className="text-cyan-400 font-black text-lg tracking-widest">IMMERSIVE SOC</span>
          </div>
          <h2 className="text-white text-3xl font-black mb-3 tracking-tight">Choose Your Role</h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto leading-relaxed">
            Take your reserved seat in the SOC Operations Center. Each role provides
            a tailored view with unique decision-making capabilities for Human-in-the-Loop tasks.
          </p>
          {xrSupported && (
            <div className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/30">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-emerald-400 text-xs font-bold">Apple Vision Pro Detected -- Spatial Mode Available</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {VR_ROLES.map(role => {
            const Icon = role.icon;
            return (
              <button
                key={role.id}
                onClick={() => onSelectRole(role.id)}
                className="group relative text-left p-5 rounded-xl bg-slate-900/90 border border-slate-700/40 hover:border-opacity-100 transition-all duration-300 hover:scale-[1.02]"
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = role.color + '50';
                  e.currentTarget.style.boxShadow = `0 0 40px ${role.color}12, inset 0 1px 0 ${role.color}15`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.boxShadow = '';
                }}
              >
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-xl" style={{ backgroundColor: role.color + '12', boxShadow: `0 0 20px ${role.color}10` }}>
                    <Icon className="w-6 h-6" style={{ color: role.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-bold text-sm mb-1">{role.name}</h3>
                    <p className="text-slate-400 text-xs leading-relaxed mb-3">{role.description}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {role.capabilities.map(cap => (
                        <span key={cap} className="px-2 py-0.5 rounded text-[9px] font-bold border" style={{ color: role.color, borderColor: role.color + '25', backgroundColor: role.color + '08' }}>
                          {cap}
                        </span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-700 group-hover:translate-x-1 group-hover:text-slate-400 transition-all flex-shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-8 p-4 rounded-xl bg-slate-900/60 border border-slate-700/30">
          <div className="flex items-center gap-2 mb-3">
            <Glasses className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-300 tracking-wide">How It Works</span>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex items-start gap-2.5">
              <Monitor className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-300 font-bold mb-0.5">Browser Mode</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">First-person view from your reserved seat. Drag to look around, interact with floating panels, review tasks requiring human judgment.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Glasses className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-300 font-bold mb-0.5">Apple Vision Pro</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">Open in Safari on visionOS for full spatial computing. Panels float in your space. Use hand gestures to pinch, drag, and interact naturally.</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Hand className="w-4 h-4 text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[10px] text-slate-300 font-bold mb-0.5">Human-in-the-Loop</p>
                <p className="text-[9px] text-slate-500 leading-relaxed">AI agents surface decisions that need human expertise -- approve escalations, validate threat attribution, authorize containment actions.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-5">
          <button onClick={onExit} className="text-slate-600 hover:text-slate-300 text-xs transition font-medium">
            Return to orbital view
          </button>
        </div>
      </div>
    </div>
  );
}
