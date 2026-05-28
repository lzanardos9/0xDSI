import { useState, useRef, useEffect, useCallback } from 'react';
import { Mic, MicOff, Send, Volume2, VolumeX, Bot, Sparkles, Brain, Zap, Shield, CheckCircle, AlertTriangle, Target, Activity, ChevronDown, ChevronRight, Network, FileCode } from 'lucide-react';
import AgentStepLoader from './AgentStepLoader';
import CorrelationRuleGraph from './CorrelationRuleGraph';
import DaCInspectorModal from './DaCInspectorModal';

interface AIGeneratedRule {
  rule_name: string;
  rule_description: string;
  severity: string;
  confidence_score: number;
  rule_logic: {
    conditions: { field: string; operator: string; value: string; window?: string }[];
    sequence?: string[];
    time_window?: string;
    threshold?: { field: string; operator: string; value: number };
    aggregation?: string;
    pseudo_code: string;
  };
  mitre_tactics: string[];
  data_sources: string[];
  graph_nodes: { id: string; label: string; type: 'source' | 'condition' | 'detection' | 'action'; detail: string }[];
  graph_edges: { from: string; to: string; label: string }[];
  enhancement_ideas: { title: string; description: string }[];
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  queriesUsed?: string[];
  correlationRule?: AIGeneratedRule;
  ruleSaved?: boolean;
}

import { callFunction } from '../lib/llmGateway';

const CISOAssistant = () => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: "Hello! I'm your AI security advisor powered by Genie with real-time access to your SOC data. Ask me anything about alerts, threats, vulnerabilities, ML model health, user behavior, compliance, or any security metric in your environment. I can also generate real correlation rules -- just ask me to create one!",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(false);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const preferredVoiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const loaderRef = useRef<HTMLDivElement>(null);
  const scrollLockedRef = useRef(false);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
      };

      recognitionRef.current.onerror = () => setIsListening(false);
      recognitionRef.current.onend = () => setIsListening(false);
    }

    if ('speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        if (!voices.length) return;
        const femaleKeywords = ['samantha', 'karen', 'victoria', 'moira', 'fiona', 'tessa', 'veena', 'female', 'zira', 'hazel', 'susan', 'kate', 'ava', 'allison', 'nicky'];
        const naturalKeywords = ['natural', 'premium', 'enhanced', 'neural', 'online'];
        const englishVoices = voices.filter(v => v.lang.startsWith('en'));
        let best: SpeechSynthesisVoice | null = null;
        let bestScore = -1;
        for (const v of englishVoices) {
          const name = v.name.toLowerCase();
          let score = 0;
          if (femaleKeywords.some(k => name.includes(k))) score += 10;
          if (naturalKeywords.some(k => name.includes(k))) score += 5;
          if (name.includes('google') && name.includes('female')) score += 8;
          if (name.includes('samantha')) score += 12;
          if (name.includes('karen')) score += 7;
          if (v.localService === false) score += 2;
          if (score > bestScore) { bestScore = score; best = v; }
        }
        if (!best && englishVoices.length) {
          best = englishVoices.find(v => {
            const n = v.name.toLowerCase();
            return !['male', 'david', 'daniel', 'james', 'fred', 'ralph', 'junior'].some(k => n.includes(k));
          }) || englishVoices[0];
        }
        preferredVoiceRef.current = best;
      };
      pickVoice();
      window.speechSynthesis.addEventListener('voiceschanged', pickVoice);
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (synthRef.current) synthRef.current.cancel();
    };
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior,
      });
    }
  }, []);

  useEffect(() => {
    if (!isProcessing && !scrollLockedRef.current) {
      scrollToBottom();
    }
  }, [messages, scrollToBottom, isProcessing]);

  useEffect(() => {
    if (isProcessing && loaderRef.current && chatContainerRef.current) {
      const container = chatContainerRef.current;
      const loader = loaderRef.current;
      const loaderTop = loader.offsetTop;
      const containerScroll = container.scrollTop;
      const containerHeight = container.clientHeight;

      if (loaderTop > containerScroll + containerHeight) {
        container.scrollTo({
          top: loaderTop - 20,
          behavior: 'smooth',
        });
      }
    }
  }, [isProcessing]);

  const toggleListening = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const speak = (text: string) => {
    if (!synthRef.current) return;
    synthRef.current.cancel();
    const cleaned = text.replace(/[*#_`]/g, '').replace(/\n{2,}/g, '. ').replace(/\n/g, ', ');
    const utterance = new SpeechSynthesisUtterance(cleaned);
    if (preferredVoiceRef.current) utterance.voice = preferredVoiceRef.current;
    utterance.rate = 0.92;
    utterance.pitch = 1.02;
    utterance.volume = 0.9;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    synthRef.current.speak(utterance);
  };

  const stopSpeaking = () => {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsSpeaking(false);
    }
  };

  const generateResponse = async (userMessage: string): Promise<{ answer: string; queriesUsed?: string[] }> => {
    try {
      const conversationHistory = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await callFunction('ai-assistant', {
        question: userMessage,
        conversationHistory,
      });

      if (error || !data) {
        throw new Error(error || 'No response from AI service');
      }

      const result = data as { answer: string; queries_used?: string[] };
      return { answer: result.answer, queriesUsed: result.queries_used };
    } catch (error) {
      console.error('AI Assistant error:', error);
      return { answer: 'I encountered an issue connecting to the AI service. Please try again in a moment.' };
    }
  };

  const generateCorrelationRule = async (userRequest: string): Promise<{ rule: AIGeneratedRule | null; saved: boolean; error?: string }> => {
    try {
      const conversationHistory = messages.slice(-6).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const { data, error } = await callFunction('generate-correlation-rule', {
        userRequest,
        conversationHistory,
      });

      if (error || !data) {
        throw new Error(error || 'No response');
      }

      const result = data as { rule: AIGeneratedRule; saved: boolean };
      return { rule: result.rule, saved: result.saved };
    } catch (error) {
      console.error('Rule generation error:', error);
      return { rule: null, saved: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  };

  const isCorrelationRequest = (text: string): boolean => {
    const keywords = ['correlation rule', 'create rule', 'detect when', 'create a rule', 'detection rule', 'build a rule', 'create correlation', 'new rule for', 'rule to detect', 'write a rule', 'make a rule', 'generate a rule', 'generate rule'];
    const lower = text.toLowerCase();
    return keywords.some(k => lower.includes(k));
  };

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    scrollLockedRef.current = true;
    setMessages(prev => [...prev, userMessage]);
    const capturedInput = input;
    setInput('');
    setIsProcessing(true);

    requestAnimationFrame(() => {
      if (chatContainerRef.current) {
        const container = chatContainerRef.current;
        const maxScroll = container.scrollHeight - container.clientHeight;
        if (container.scrollTop >= maxScroll - 200) {
          scrollToBottom();
        }
      }
    });

    if (isCorrelationRequest(capturedInput)) {
      const { rule, saved, error } = await generateCorrelationRule(capturedInput);

      let content: string;
      if (rule) {
        content = `I've analyzed your SOC environment and generated a **${(rule.severity || 'high').toUpperCase()}** severity correlation rule:\n\n**${rule.rule_name}**\n\n${rule.rule_description}\n\nThe rule has been ${saved ? 'saved and activated' : 'generated (save pending)'}. See the detection graph and rule logic below.`;
      } else {
        content = `I wasn't able to generate the correlation rule${error ? `: ${error}` : ''}. Please try rephrasing your request or check the AI service connection.`;
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content,
        timestamp: new Date(),
        correlationRule: rule || undefined,
        ruleSaved: saved,
      };

      scrollLockedRef.current = false;
      setMessages(prev => [...prev, assistantMessage]);
      setIsProcessing(false);
      requestAnimationFrame(() => scrollToBottom());
      if (autoSpeak) speak(content);
      return;
    }

    const { answer, queriesUsed } = await generateResponse(capturedInput);

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: answer,
      timestamp: new Date(),
      queriesUsed,
    };

    scrollLockedRef.current = false;
    setMessages(prev => [...prev, assistantMessage]);
    setIsProcessing(false);

    requestAnimationFrame(() => {
      scrollToBottom();
    });

    if (autoSpeak) speak(answer);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessageContent = (content: string) => {
    const lines = content.split('\n');
    return lines.map((line, i) => {
      const boldParsed = line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
      const bulletLine = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      const numberedLine = /^\d+\.\s/.test(line.trim());
      if (bulletLine) {
        return (
          <div key={i} className="flex gap-2 ml-2 my-0.5">
            <span className="text-cyan-400 mt-0.5 flex-shrink-0">&#8226;</span>
            <span dangerouslySetInnerHTML={{ __html: boldParsed.replace(/^[-*]\s*/, '') }} />
          </div>
        );
      }
      if (numberedLine) {
        return (
          <div key={i} className="flex gap-2 ml-1 my-0.5">
            <span dangerouslySetInnerHTML={{ __html: boldParsed }} />
          </div>
        );
      }
      if (line.trim() === '') return <div key={i} className="h-2" />;
      return <p key={i} className="my-0.5" dangerouslySetInnerHTML={{ __html: boldParsed }} />;
    });
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl border border-slate-700/50 shadow-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 bg-slate-800/30 border-b border-slate-700/50 backdrop-blur-sm">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/30">
              <Sparkles className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-800 animate-pulse" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-slate-200">AI Security Advisor</h3>
            <p className="text-xs text-cyan-400/80">
              {isProcessing ? 'Agent pipeline active...' : 'Genie -- Live SOC Data Access'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setAutoSpeak(!autoSpeak)}
          className={`p-2 rounded-lg border transition-colors ${
            autoSpeak
              ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
              : 'bg-slate-800/50 border-slate-700 text-slate-400'
          }`}
          title={autoSpeak ? 'Auto-speak enabled' : 'Auto-speak disabled'}
        >
          {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
        </button>
      </div>

      <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] rounded-2xl px-5 py-3 ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white'
                  : 'bg-slate-800/80 border border-slate-700/50 text-slate-200'
              }`}
            >
              <div className="flex items-start space-x-2">
                {message.role === 'assistant' && (
                  <Bot className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                )}
                <div className="flex-1 text-sm leading-relaxed">
                  {message.role === 'assistant'
                    ? renderMessageContent(message.content)
                    : <p>{message.content}</p>
                  }
                  {message.correlationRule && (
                    <CorrelationRuleVisual rule={message.correlationRule} saved={message.ruleSaved} />
                  )}
                  <div className="flex items-center gap-3 mt-1.5">
                    <p className={`text-xs ${
                      message.role === 'user' ? 'text-blue-200' : 'text-slate-500'
                    }`}>
                      {message.timestamp.toLocaleTimeString()}
                    </p>
                    {message.queriesUsed && message.queriesUsed.length > 0 && (
                      <span className="text-[10px] text-cyan-500/60 font-mono">
                        {message.queriesUsed.length} data source{message.queriesUsed.length !== 1 ? 's' : ''} queried
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div ref={loaderRef} className="flex justify-start">
            <div className="w-full max-w-[90%]">
              <AgentStepLoader />
            </div>
          </div>
        )}
      </div>

      <div className="px-6 py-4 bg-slate-900/50 border-t border-slate-700/50 backdrop-blur-sm">
        <div className="flex items-end space-x-3">
          <button
            onClick={toggleListening}
            disabled={isProcessing}
            className={`flex-shrink-0 p-3 rounded-xl border transition-all ${
              isListening
                ? 'bg-red-500/20 border-red-500/40 text-red-400 animate-pulse'
                : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700/50 hover:text-slate-300'
            } disabled:opacity-50`}
            title={isListening ? 'Stop listening' : 'Start voice input'}
          >
            {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything about your security data..."
              disabled={isProcessing}
              className="w-full bg-slate-800/50 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/50 transition-colors disabled:opacity-50"
              rows={2}
            />
          </div>

          <button
            onClick={handleSend}
            disabled={!input.trim() || isProcessing}
            className="flex-shrink-0 p-3 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>

          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="flex-shrink-0 p-3 bg-red-500/20 border border-red-500/40 text-red-400 rounded-xl hover:bg-red-500/30 transition-colors animate-pulse"
              title="Stop speaking"
            >
              <VolumeX className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {[
            'Show me the top critical alerts and their root cause analysis across all SOC data sources',
            'What is our current compliance posture for SOC2, HIPAA, and GDPR regulations?',
            'Create a rule to detect APT-29 multi-stage supply chain compromise via DLL sideloading with delayed C2 beacon and OAuth token theft',
            'Analyze the riskiest user behavior patterns and insider threat indicators from the past 7 days',
            'Build a detection for Volt Typhoon Living-off-the-Land attack chains combining LOTL binaries and credential dumping',
            'Which vulnerabilities have active exploits in the wild and what is our patch coverage?',
            'Give me an executive summary of security posture with incident trends and mean time to detect',
            'Detect nation-state pre-positioning: dormant firmware implants, DNS beaconing, and ICS recon',
          ].map((prompt) => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              disabled={isProcessing}
              className="px-3 py-1.5 bg-slate-800/50 hover:bg-slate-700/50 border border-slate-700 text-slate-300 text-xs rounded-lg transition-colors disabled:opacity-40"
            >
              {prompt.length > 55 ? prompt.substring(0, 55) + '...' : prompt}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

const CorrelationRuleVisual = ({ rule, saved }: { rule: AIGeneratedRule; saved?: boolean }) => {
  const [showGraph, setShowGraph] = useState(true);
  const [expandedIdeas, setExpandedIdeas] = useState(false);
  const [showDaCInspector, setShowDaCInspector] = useState(false);
  const [dacPromotionStatus, setDacPromotionStatus] = useState<string | null>(null);

  const severityColors: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    critical: { bg: 'from-red-600/20 to-red-800/10', border: 'border-red-500/40', text: 'text-red-400', badge: 'bg-red-500/20 text-red-300' },
    high: { bg: 'from-orange-600/20 to-orange-800/10', border: 'border-orange-500/40', text: 'text-orange-400', badge: 'bg-orange-500/20 text-orange-300' },
    medium: { bg: 'from-amber-600/20 to-amber-800/10', border: 'border-amber-500/40', text: 'text-amber-400', badge: 'bg-amber-500/20 text-amber-300' },
    low: { bg: 'from-blue-600/20 to-blue-800/10', border: 'border-blue-500/40', text: 'text-blue-400', badge: 'bg-blue-500/20 text-blue-300' },
  };
  const colors = severityColors[rule.severity] || severityColors.high;

  const iconMap: Record<string, React.ReactNode> = {
    brain: <Brain className="w-4 h-4" />,
    zap: <Zap className="w-4 h-4" />,
    shield: <Shield className="w-4 h-4" />,
    target: <Target className="w-4 h-4" />,
    activity: <Activity className="w-4 h-4" />,
    network: <Network className="w-4 h-4" />,
  };

  return (
    <div className={`mt-4 rounded-xl border ${colors.border} bg-gradient-to-br ${colors.bg} overflow-hidden`}>
      <div className="p-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${colors.badge}`}>
              <Shield className="w-4 h-4" />
            </div>
            <h4 className="text-sm font-bold text-white">{rule.rule_name}</h4>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${colors.badge}`}>
              {rule.severity}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300">
              {Math.round((rule.confidence_score || 0.85) * 100)}% confidence
            </span>
            {saved && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Saved
              </span>
            )}
            {dacPromotionStatus && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-500/20 text-cyan-300 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> {dacPromotionStatus}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowDaCInspector(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 text-[10px] font-semibold hover:bg-blue-500/20 hover:border-blue-400/40 transition-all group"
          >
            <FileCode className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
            Inspect DaC Logic
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {rule.graph_nodes?.length > 0 && (
          <div>
            <button
              onClick={() => setShowGraph(!showGraph)}
              className="flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors mb-3 w-full"
            >
              <Network className="w-3.5 h-3.5" />
              <span className="font-semibold">Detection Flow Graph ({rule.graph_nodes.length} nodes)</span>
              {showGraph ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
            </button>
            {showGraph && (
              <div className="bg-slate-900/60 rounded-xl border border-slate-700/30 p-3 overflow-x-auto">
                <CorrelationRuleGraph
                  nodes={rule.graph_nodes}
                  edges={rule.graph_edges || []}
                  severity={rule.severity}
                />
              </div>
            )}
          </div>
        )}

        <div>
          <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1 font-semibold">Rule Logic</p>
          <pre className="text-xs text-emerald-300 bg-slate-900/60 rounded-lg p-3 font-mono leading-relaxed border border-slate-700/30 overflow-x-auto whitespace-pre-wrap">
            {rule.rule_logic?.pseudo_code || 'No pseudo-code available'}
          </pre>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">Conditions</p>
            <div className="space-y-1">
              {(rule.rule_logic?.conditions || []).map((c, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[11px]">
                  <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                  <span className="text-slate-300">
                    <span className="text-cyan-400 font-mono">{c.field}</span>{' '}
                    <span className="text-slate-500">{c.operator}</span>{' '}
                    <span className="text-amber-400 font-mono">{c.value}</span>
                    {c.window && <span className="text-slate-500 ml-1">({c.window})</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-1.5 font-semibold">MITRE ATT&CK</p>
            <div className="flex flex-wrap gap-1">
              {(rule.mitre_tactics || []).map((t, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-red-500/10 text-red-300 border border-red-500/20">
                  {t}
                </span>
              ))}
            </div>
            <p className="text-[10px] text-slate-400 uppercase tracking-wider mt-3 mb-1.5 font-semibold">Data Sources</p>
            <div className="flex flex-wrap gap-1">
              {(rule.data_sources || []).map((d, i) => (
                <span key={i} className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  {d}
                </span>
              ))}
            </div>
          </div>
        </div>

        {rule.enhancement_ideas?.length > 0 && (
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={() => setExpandedIdeas(!expandedIdeas)}
              className="flex items-center gap-2 text-xs text-cyan-400 hover:text-cyan-300 transition-colors w-full"
            >
              <Zap className="w-3.5 h-3.5" />
              <span className="font-semibold">Enhancement Ideas ({rule.enhancement_ideas.length})</span>
              {expandedIdeas ? <ChevronDown className="w-3.5 h-3.5 ml-auto" /> : <ChevronRight className="w-3.5 h-3.5 ml-auto" />}
            </button>

            {expandedIdeas && (
              <div className="grid grid-cols-2 gap-2 mt-3">
                {rule.enhancement_ideas.map((idea, i) => (
                  <div key={i} className="bg-slate-800/40 border border-slate-700/30 rounded-lg p-2.5 hover:border-cyan-500/30 transition-colors group">
                    <div className="flex items-start gap-2">
                      <div className="p-1 rounded bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20 transition-colors flex-shrink-0">
                        {iconMap[Object.keys(iconMap)[i % Object.keys(iconMap).length]] || <Zap className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-white">{idea.title}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{idea.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {showDaCInspector && (
        <DaCInspectorModal
          rule={rule}
          onClose={() => setShowDaCInspector(false)}
          onRuleSaved={(_ruleId, stage) => {
            setDacPromotionStatus(stage === 'draft' ? 'Draft saved' : `In ${stage}`);
          }}
        />
      )}
    </div>
  );
};

export default CISOAssistant;
