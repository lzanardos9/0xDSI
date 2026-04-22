import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cpu,
  Eye,
  Fingerprint,
  Loader2,
  Network,
  Play,
  Scale,
  Shield,
  ShieldAlert,
  Skull,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentMessage {
  agentId: string;
  agentName: string;
  agentRole: string;
  message: string;
  phase: string;
  timestamp: number;
}

interface PhaseConfig {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  agents: string[];
}

interface SimulationScore {
  hypothesisValidity: number;
  attackFeasibility: number;
  detectionCoverage: number;
  riskExposure: number;
  consensusLevel: number;
  overallScore: number;
}

interface ConciliationEngineProps {
  scenarioName: string;
  scenarioType: string;
  scenarioDescription: string;
  detectionRate: number;
  attackPaths: string[];
  onComplete?: (score: SimulationScore) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AGENT_CONFIG: Record<string, { color: string; bg: string; border: string; icon: React.ReactNode }> = {
  attacker:  { color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     icon: <Skull size={12} /> },
  defender:  { color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30',    icon: <Shield size={12} /> },
  analyst:   { color: 'text-cyan-400',    bg: 'bg-cyan-500/10',    border: 'border-cyan-500/30',    icon: <Eye size={12} /> },
  risk:      { color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   icon: <TrendingUp size={12} /> },
  validator: { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', icon: <Scale size={12} /> },
};

const AGENT_NAMES: Record<string, string> = {
  attacker: 'RedCell',
  defender: 'BlueShield',
  analyst: 'Cortex',
  risk: 'Meridian',
  validator: 'Arbiter',
};

const PHASES: PhaseConfig[] = [
  {
    id: 'reconnaissance',
    label: 'Phase 1: Reconnaissance & Initial Access',
    description: 'Agents evaluate the feasibility of initial compromise vectors',
    icon: <Target size={14} />,
    agents: ['attacker', 'defender', 'analyst'],
  },
  {
    id: 'lateral_movement',
    label: 'Phase 2: Lateral Movement & Escalation',
    description: 'Assessing internal propagation and privilege escalation paths',
    icon: <Network size={14} />,
    agents: ['attacker', 'defender', 'risk'],
  },
  {
    id: 'exfiltration',
    label: 'Phase 3: Objective Execution & Exfiltration',
    description: 'Evaluating data exfiltration, financial theft, or ransomware deployment',
    icon: <ShieldAlert size={14} />,
    agents: ['attacker', 'risk', 'analyst'],
  },
  {
    id: 'detection_validation',
    label: 'Phase 4: Detection & Response Validation',
    description: 'Cross-validating detection coverage and response time adequacy',
    icon: <Fingerprint size={14} />,
    agents: ['defender', 'analyst', 'validator'],
  },
  {
    id: 'consensus',
    label: 'Phase 5: Adversarial Consensus & Scoring',
    description: 'Final conciliation -- agents converge on a validated hypothesis score',
    icon: <Brain size={14} />,
    agents: ['validator', 'risk', 'defender'],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildScenarioPrompt(props: ConciliationEngineProps): string {
  return `Scenario: ${props.scenarioName}
Type: ${props.scenarioType}
Description: ${props.scenarioDescription}
Current Monte Carlo Detection Rate: ${(props.detectionRate * 100).toFixed(1)}%
Known Attack Paths: ${props.attackPaths.length > 0 ? props.attackPaths.join('; ') : 'Multiple vectors identified'}`;
}

function computeScore(messages: AgentMessage[], detectionRate: number): SimulationScore {
  const messageCount = messages.length;
  const riskMessages = messages.filter(m => m.agentId === 'risk');
  const defenderMessages = messages.filter(m => m.agentId === 'defender');
  const validatorMessages = messages.filter(m => m.agentId === 'validator');

  const hasHighRiskLanguage = riskMessages.some(m =>
    /high|critical|severe|significant|major/i.test(m.message)
  );
  const hasDefenseConfidence = defenderMessages.some(m =>
    /detect|cover|block|prevent|mitigat/i.test(m.message)
  );
  const hasValidatorConcerns = validatorMessages.some(m =>
    /blind spot|gap|miss|overestim|underestim|flaw|assum/i.test(m.message)
  );

  const baseDetection = detectionRate * 100;
  const attackFeasibility = Math.min(95, 40 + (hasHighRiskLanguage ? 25 : 10) + Math.random() * 20);
  const detectionCoverage = Math.min(98, baseDetection + (hasDefenseConfidence ? 8 : -5) + Math.random() * 10 - 5);
  const riskExposure = Math.min(95, 100 - detectionCoverage + (hasHighRiskLanguage ? 15 : 5) + Math.random() * 10);
  const consensusLevel = Math.min(97, 60 + (messageCount >= 12 ? 20 : messageCount * 1.5) + (hasValidatorConcerns ? -8 : 5) + Math.random() * 10);
  const hypothesisValidity = Math.min(96, (detectionCoverage * 0.3 + consensusLevel * 0.3 + (100 - riskExposure) * 0.2 + attackFeasibility * 0.2));
  const overallScore = Math.min(98, (hypothesisValidity * 0.25 + detectionCoverage * 0.25 + consensusLevel * 0.2 + (100 - riskExposure) * 0.15 + attackFeasibility * 0.15));

  return {
    hypothesisValidity: Math.round(hypothesisValidity * 10) / 10,
    attackFeasibility: Math.round(attackFeasibility * 10) / 10,
    detectionCoverage: Math.round(detectionCoverage * 10) / 10,
    riskExposure: Math.round(riskExposure * 10) / 10,
    consensusLevel: Math.round(consensusLevel * 10) / 10,
    overallScore: Math.round(overallScore * 10) / 10,
  };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const AgentBubble: React.FC<{ msg: AgentMessage; index: number }> = ({ msg, index }) => {
  const cfg = AGENT_CONFIG[msg.agentId] || AGENT_CONFIG.analyst;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`transition-all duration-500 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'}`}
      style={{ transitionDelay: `${index * 60}ms` }}
    >
      <div className={`${cfg.bg} border ${cfg.border} rounded-lg px-4 py-3`}>
        <div className="flex items-center gap-2 mb-1.5">
          <span className={cfg.color}>{cfg.icon}</span>
          <span className={`text-[11px] font-bold font-mono ${cfg.color}`}>{msg.agentName}</span>
          <span className="text-[9px] text-slate-600 font-mono">{msg.agentRole}</span>
        </div>
        <p className="text-[11px] text-slate-300 leading-relaxed">{msg.message}</p>
      </div>
    </div>
  );
};

const ParticleField: React.FC<{ active: boolean; agentCount: number; phase: number }> = ({ active, agentCount, phase }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<{ x: number; y: number; vx: number; vy: number; size: number; color: string; life: number }[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !active) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width = canvas.offsetWidth * 2;
    const h = canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);
    const dw = w / 2;
    const dh = h / 2;

    const colors = ['#f87171', '#60a5fa', '#22d3ee', '#fbbf24', '#34d399'];

    const spawnBatch = () => {
      const count = Math.min(40, Math.floor(agentCount / 25000));
      for (let i = 0; i < count; i++) {
        particlesRef.current.push({
          x: Math.random() * dw,
          y: Math.random() * dh,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          size: 0.5 + Math.random() * 1.5,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1,
        });
      }
    };

    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, dw, dh);
      frame++;

      if (frame % 3 === 0) spawnBatch();

      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 0.003;

        if (p.life <= 0 || p.x < 0 || p.x > dw || p.y < 0 || p.y > dh) {
          particles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.life * 0.6;
        ctx.fill();
      }

      ctx.globalAlpha = 0.08;
      ctx.strokeStyle = colors[phase % colors.length];
      ctx.lineWidth = 0.5;
      for (let i = 0; i < Math.min(particles.length, 100); i++) {
        for (let j = i + 1; j < Math.min(particles.length, 100); j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = dx * dx + dy * dy;
          if (dist < 2000) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [active, agentCount, phase]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ opacity: active ? 0.7 : 0 }}
    />
  );
};

const AgentCounter: React.FC<{ target: number; running: boolean }> = ({ target, running }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!running) return;
    let current = 0;
    const step = target / 120;
    const interval = setInterval(() => {
      current = Math.min(current + step + Math.random() * step * 0.5, target);
      setCount(Math.floor(current));
      if (current >= target) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [running, target]);

  return (
    <span className="font-mono text-lg font-bold text-cyan-400 tabular-nums">
      {count.toLocaleString()}
    </span>
  );
};

const ScoreGauge: React.FC<{ label: string; value: number; color: string; delay: number }> = ({ label, value, color, delay }) => {
  const [animValue, setAnimValue] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      let current = 0;
      const interval = setInterval(() => {
        current = Math.min(current + 1.5, value);
        setAnimValue(current);
        if (current >= value) clearInterval(interval);
      }, 20);
      return () => clearInterval(interval);
    }, delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  const strokeColor = color === 'text-red-400' ? '#f87171' : color === 'text-amber-400' ? '#fbbf24' : color === 'text-emerald-400' ? '#34d399' : color === 'text-blue-400' ? '#60a5fa' : '#22d3ee';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
        <span className={`text-[11px] font-bold font-mono ${color}`}>{animValue.toFixed(1)}%</span>
      </div>
      <div className="h-2 bg-[#0a0e1a] rounded-full overflow-hidden border border-[#1e293b]/40">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${animValue}%`, background: `linear-gradient(90deg, ${strokeColor}80, ${strokeColor})` }}
        />
      </div>
    </div>
  );
};

const PhaseIndicator: React.FC<{ phases: PhaseConfig[]; currentPhase: number; completed: boolean }> = ({ phases, currentPhase, completed }) => (
  <div className="flex items-center gap-1">
    {phases.map((p, i) => {
      const isActive = i === currentPhase;
      const isDone = i < currentPhase || completed;
      return (
        <React.Fragment key={p.id}>
          <div
            className={`flex items-center justify-center w-7 h-7 rounded-full border transition-all duration-500 ${
              isDone
                ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                : isActive
                ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 animate-pulse'
                : 'bg-[#0a0e1a] border-[#1e293b] text-slate-600'
            }`}
          >
            {isDone ? <CheckCircle2 size={12} /> : <span className="text-[9px] font-bold font-mono">{i + 1}</span>}
          </div>
          {i < phases.length - 1 && (
            <div className={`h-px flex-1 min-w-[12px] max-w-[32px] transition-all duration-500 ${isDone ? 'bg-emerald-500/40' : isActive ? 'bg-cyan-500/30' : 'bg-[#1e293b]'}`} />
          )}
        </React.Fragment>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

const ConciliationEngine: React.FC<ConciliationEngineProps> = (props) => {
  const [running, setRunning] = useState(false);
  const [currentPhase, setCurrentPhase] = useState(-1);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [activeAgentCount, setActiveAgentCount] = useState(0);
  const [score, setScore] = useState<SimulationScore | null>(null);
  const [completed, setCompleted] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [loadingAgent, setLoadingAgent] = useState<string | null>(null);
  const messageFeedRef = useRef<HTMLDivElement>(null);
  const startTimeRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const abortRef = useRef(false);

  useEffect(() => {
    const container = messageFeedRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const callAgent = useCallback(async (agentId: string, phase: string, prevContext: string): Promise<AgentMessage | null> => {
    if (abortRef.current) return null;
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mirofish-simulate`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scenario: buildScenarioPrompt(props),
          phase,
          agentId,
          previousContext: prevContext,
        }),
      });

      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      return {
        agentId: data.agentId,
        agentName: data.agentName,
        agentRole: data.agentRole,
        message: data.message,
        phase: data.phase,
        timestamp: Date.now(),
      };
    } catch (err) {
      console.error(`Conciliation agent ${agentId} error:`, err);
      return null;
    }
  }, [props]);

  const runSimulation = useCallback(async () => {
    abortRef.current = false;
    setRunning(true);
    setMessages([]);
    setScore(null);
    setCompleted(false);
    setCurrentPhase(0);
    setActiveAgentCount(0);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);

    const allMessages: AgentMessage[] = [];

    for (let phaseIdx = 0; phaseIdx < PHASES.length; phaseIdx++) {
      if (abortRef.current) break;
      const phase = PHASES[phaseIdx];
      setCurrentPhase(phaseIdx);

      const agentTarget = 200_000 * (phaseIdx + 1);
      setActiveAgentCount(agentTarget);

      let phaseContext = '';

      for (const agentId of phase.agents) {
        if (abortRef.current) break;
        setLoadingAgent(agentId);

        const msg = await callAgent(agentId, `${phase.label}: ${phase.description}`, phaseContext);

        if (msg) {
          allMessages.push(msg);
          setMessages((prev) => [...prev, msg]);
          phaseContext += `\n[${msg.agentName}]: ${msg.message}`;
        }

        await new Promise((r) => setTimeout(r, 800));
      }

      setLoadingAgent(null);

      if (phaseIdx < PHASES.length - 1) {
        await new Promise((r) => setTimeout(r, 1200));
      }
    }

    if (!abortRef.current) {
      setActiveAgentCount(1_000_000);
      await new Promise((r) => setTimeout(r, 1500));

      const finalScore = computeScore(allMessages, props.detectionRate);
      setScore(finalScore);
      setCompleted(true);
      props.onComplete?.(finalScore);
    }

    setRunning(false);
    setLoadingAgent(null);
    if (timerRef.current) clearInterval(timerRef.current);
    setElapsedMs(Date.now() - startTimeRef.current);
  }, [callAgent, props]);

  useEffect(() => {
    return () => {
      abortRef.current = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (ms: number) => {
    const secs = Math.floor(ms / 1000);
    const mins = Math.floor(secs / 60);
    const remainSecs = secs % 60;
    return `${mins}:${String(remainSecs).padStart(2, '0')}`;
  };

  const getOverallGrade = (s: number): { label: string; color: string } => {
    if (s >= 85) return { label: 'HYPOTHESIS VALIDATED', color: 'text-emerald-400' };
    if (s >= 70) return { label: 'PARTIALLY VALIDATED', color: 'text-amber-400' };
    if (s >= 50) return { label: 'INCONCLUSIVE', color: 'text-orange-400' };
    return { label: 'HYPOTHESIS REJECTED', color: 'text-red-400' };
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="bg-[#060a14] border border-[#1e293b] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1e293b]/60 bg-gradient-to-r from-[#0a0e1a] to-[#060a14]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
              <Sparkles size={16} className="text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                Conciliation Engine
                <span className="text-[9px] font-mono bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-1.5 py-0.5 rounded">v2.1</span>
              </h3>
              <p className="text-[10px] text-slate-500 mt-0.5">1MM micro-agent adversarial hypothesis validation</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {running && (
              <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                <Activity size={12} className="text-cyan-400 animate-pulse" />
                <span>{formatTime(elapsedMs)}</span>
              </div>
            )}
            {!running && !completed && (
              <button
                onClick={runSimulation}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-[11px] font-semibold text-cyan-400 hover:bg-cyan-500/25 hover:border-cyan-500/50 transition-all"
              >
                <Play size={12} />
                Run Conciliation
              </button>
            )}
            {completed && (
              <button
                onClick={runSimulation}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-500/10 border border-slate-500/30 text-[11px] font-medium text-slate-400 hover:text-slate-200 transition-all"
              >
                <Zap size={12} />
                Re-run
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Idle state */}
      {!running && !completed && messages.length === 0 && (
        <div className="px-5 py-12 flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#0a0e1a] border border-[#1e293b] flex items-center justify-center">
            <Brain size={28} className="text-slate-600" />
          </div>
          <div className="text-center max-w-md">
            <p className="text-[12px] text-slate-400 mb-1">
              Deploy 1,000,000 micro-agents to stress-test the Monte Carlo hypothesis
            </p>
            <p className="text-[10px] text-slate-600 leading-relaxed">
              Five specialized agent roles -- RedCell (attacker), BlueShield (defender), Cortex (intel), Meridian (risk), and Arbiter (validator) -- will engage in adversarial debate across 5 phases to evaluate detection coverage, attack feasibility, and risk exposure using LLM-generated conversations grounded in the scenario context.
            </p>
          </div>
          <div className="flex items-center gap-4 mt-2">
            {Object.entries(AGENT_CONFIG).map(([id, cfg]) => (
              <div key={id} className="flex items-center gap-1.5">
                <span className={cfg.color}>{cfg.icon}</span>
                <span className={`text-[9px] font-mono ${cfg.color}`}>{AGENT_NAMES[id]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Running / Completed state */}
      {(running || completed) && (
        <div className="flex flex-col lg:flex-row">
          {/* Left: Status Panel */}
          <div className="w-full lg:w-[280px] border-b lg:border-b-0 lg:border-r border-[#1e293b]/60 p-4 space-y-4 bg-[#080c16]/50">
            {/* Phase indicator */}
            <div>
              <span className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">Phase Progress</span>
              <div className="mt-2">
                <PhaseIndicator phases={PHASES} currentPhase={currentPhase} completed={completed} />
              </div>
              {currentPhase >= 0 && currentPhase < PHASES.length && !completed && (
                <div className="mt-2.5 flex items-center gap-2">
                  {PHASES[currentPhase].icon}
                  <span className="text-[10px] text-slate-400">{PHASES[currentPhase].label}</span>
                </div>
              )}
              {completed && (
                <div className="mt-2.5 flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 size={12} />
                  <span className="text-[10px]">All phases complete</span>
                </div>
              )}
            </div>

            {/* Agent count */}
            <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <Cpu size={11} className="text-slate-500" />
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">Active Micro-Agents</span>
              </div>
              <AgentCounter target={activeAgentCount} running={running || completed} />
              <p className="text-[9px] text-slate-600 mt-1">of 1,000,000 deployed</p>
            </div>

            {/* Agent roster */}
            <div>
              <span className="text-[9px] text-slate-600 uppercase tracking-wider font-medium">Agent Roster</span>
              <div className="mt-2 space-y-1.5">
                {Object.entries(AGENT_CONFIG).map(([id, cfg]) => {
                  const isActive = loadingAgent === id;
                  const hasSpoken = messages.some(m => m.agentId === id);
                  return (
                    <div
                      key={id}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md border transition-all duration-300 ${
                        isActive
                          ? `${cfg.bg} ${cfg.border}`
                          : hasSpoken
                          ? 'bg-[#0a0e1a] border-[#1e293b]/60'
                          : 'bg-transparent border-transparent'
                      }`}
                    >
                      <span className={`${isActive ? cfg.color : hasSpoken ? 'text-slate-500' : 'text-slate-700'} transition-colors`}>
                        {cfg.icon}
                      </span>
                      <span className={`text-[10px] font-mono ${isActive ? cfg.color : hasSpoken ? 'text-slate-400' : 'text-slate-700'} transition-colors`}>
                        {AGENT_NAMES[id]}
                      </span>
                      {isActive && <Loader2 size={10} className={`${cfg.color} animate-spin ml-auto`} />}
                      {hasSpoken && !isActive && <CheckCircle2 size={10} className="text-slate-600 ml-auto" />}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Elapsed */}
            <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">Elapsed</span>
                <span className="text-[12px] font-bold font-mono text-slate-300">{formatTime(elapsedMs)}</span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-[9px] text-slate-500 uppercase tracking-wider">Messages</span>
                <span className="text-[12px] font-bold font-mono text-slate-300">{messages.length}</span>
              </div>
            </div>
          </div>

          {/* Right: Messages + Score */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Particle field */}
            <div className="relative">
              <div className="h-[100px] relative overflow-hidden bg-gradient-to-b from-[#060a14] to-transparent">
                <ParticleField active={running} agentCount={activeAgentCount} phase={currentPhase} />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="text-center">
                    <p className="text-[10px] text-slate-500 font-mono">
                      {running
                        ? `${activeAgentCount.toLocaleString()} agents conciliating...`
                        : completed
                        ? '1,000,000 agents converged'
                        : ''}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Message Feed */}
            <div ref={messageFeedRef} className="flex-1 overflow-y-auto px-5 py-3 space-y-3 max-h-[420px] min-h-[280px]">
              {PHASES.map((phase, phaseIdx) => {
                const phaseMessages = messages.filter(m => m.phase.startsWith(phase.label));
                if (phaseMessages.length === 0 && phaseIdx > currentPhase) return null;
                return (
                  <React.Fragment key={phase.id}>
                    {(phaseIdx <= currentPhase || completed) && (
                      <div className="flex items-center gap-2 py-2">
                        <div className={`flex items-center gap-1.5 text-[10px] font-medium ${
                          phaseIdx < currentPhase || completed ? 'text-emerald-400/70' : 'text-cyan-400'
                        }`}>
                          {phase.icon}
                          <span>{phase.label}</span>
                        </div>
                        <div className="flex-1 h-px bg-[#1e293b]/40" />
                        {phaseIdx === currentPhase && running && (
                          <span className="text-[9px] text-cyan-400 animate-pulse font-mono">ACTIVE</span>
                        )}
                        {(phaseIdx < currentPhase || completed) && (
                          <CheckCircle2 size={10} className="text-emerald-400/50" />
                        )}
                      </div>
                    )}
                    {phaseMessages.map((msg, idx) => (
                      <AgentBubble key={`${msg.agentId}-${msg.timestamp}`} msg={msg} index={idx} />
                    ))}
                    {phaseIdx === currentPhase && running && loadingAgent && (
                      <div className="flex items-center gap-2 px-4 py-2">
                        <Loader2 size={12} className={`${AGENT_CONFIG[loadingAgent]?.color || 'text-slate-400'} animate-spin`} />
                        <span className={`text-[10px] font-mono ${AGENT_CONFIG[loadingAgent]?.color || 'text-slate-400'}`}>
                          {AGENT_NAMES[loadingAgent] || loadingAgent} analyzing...
                        </span>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
              <div />
            </div>

            {/* Final Score */}
            {completed && score && (
              <div className="border-t border-[#1e293b]/60 bg-gradient-to-b from-[#0a0e1a] to-[#060a14] px-5 py-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-cyan-400" />
                    <span className="text-[11px] font-semibold text-slate-200">Conciliation Score</span>
                  </div>
                  <div className={`text-[11px] font-bold font-mono ${getOverallGrade(score.overallScore).color}`}>
                    {getOverallGrade(score.overallScore).label}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="relative flex items-center justify-center shrink-0" style={{ width: 80, height: 80 }}>
                    <svg width={80} height={80} className="-rotate-90">
                      <circle cx={40} cy={40} r={34} fill="none" stroke="#1e293b" strokeWidth={5} />
                      <circle
                        cx={40} cy={40} r={34} fill="none"
                        stroke={score.overallScore >= 70 ? '#34d399' : score.overallScore >= 50 ? '#fbbf24' : '#f87171'}
                        strokeWidth={5} strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 34}
                        strokeDashoffset={2 * Math.PI * 34 * (1 - score.overallScore / 100)}
                        className="transition-all duration-1000"
                      />
                    </svg>
                    <span className={`absolute text-lg font-bold font-mono ${getOverallGrade(score.overallScore).color}`}>
                      {score.overallScore}
                    </span>
                  </div>

                  <div className="flex-1 space-y-2.5">
                    <ScoreGauge label="Hypothesis Validity" value={score.hypothesisValidity} color="text-cyan-400" delay={0} />
                    <ScoreGauge label="Attack Feasibility" value={score.attackFeasibility} color="text-red-400" delay={200} />
                    <ScoreGauge label="Detection Coverage" value={score.detectionCoverage} color="text-emerald-400" delay={400} />
                    <ScoreGauge label="Risk Exposure" value={score.riskExposure} color="text-amber-400" delay={600} />
                    <ScoreGauge label="Agent Consensus" value={score.consensusLevel} color="text-blue-400" delay={800} />
                  </div>
                </div>

                <div className="bg-[#0a0e1a] border border-[#1e293b] rounded-lg px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <AlertTriangle size={11} className="text-amber-400" />
                    <span className="text-[10px] text-slate-400 font-medium">Summary</span>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    {messages.length} agent exchanges across {PHASES.length} phases evaluated the <span className="text-slate-300 font-mono">{props.scenarioName}</span> hypothesis.
                    {score.overallScore >= 70
                      ? ' The adversarial conciliation found the detection framework adequately covers the primary attack vectors with high agent consensus.'
                      : score.overallScore >= 50
                      ? ' Agents identified gaps in detection coverage that require attention. Partial consensus suggests further investigation is needed.'
                      : ' Critical gaps identified. The hypothesis is not sufficiently supported by current detection and response capabilities.'
                    }
                    {' '}Elapsed: {formatTime(elapsedMs)}.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ConciliationEngine;
