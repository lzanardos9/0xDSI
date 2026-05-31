import { useState, useEffect, useRef } from 'react';
import { Brain, Database, Sparkles, Search, Shield, CheckCircle, Zap, Activity } from 'lucide-react';

interface AgentStep {
  id: string;
  label: string;
  detail: string;
  icon: typeof Brain;
  duration: number;
}

const AGENT_STEPS: AgentStep[] = [
  {
    id: 'analyze',
    label: 'Analyzing Intent',
    detail: 'Understanding your question and planning data retrieval strategy...',
    icon: Brain,
    duration: 2200,
  },
  {
    id: 'plan',
    label: 'Selecting Data Sources',
    detail: 'Identifying optimal database queries across SOC tables...',
    icon: Search,
    duration: 1800,
  },
  {
    id: 'query',
    label: 'Querying Live Data',
    detail: 'Executing parallel queries against security databases...',
    icon: Database,
    duration: 3500,
  },
  {
    id: 'synthesize',
    label: 'Synthesizing Intelligence',
    detail: 'Correlating findings and generating actionable insights...',
    icon: Sparkles,
    duration: 4000,
  },
];

const DATA_STREAMS = [
  'alerts', 'events', 'threat_feeds', 'vulnerabilities', 'iocs',
  'user_behavior', 'network_flows', 'correlation_rules', 'ml_models',
  'compliance', 'cases', 'malware_samples', 'asset_registry',
];

const AgentStepLoader = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [streamItems, setStreamItems] = useState<string[]>([]);
  const [particles, setParticles] = useState<{ id: number; x: number; y: number; delay: number }[]>([]);
  const [pulseRing, setPulseRing] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    const newParticles = Array.from({ length: 12 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      delay: Math.random() * 3,
    }));
    setParticles(newParticles);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (mountedRef.current) setPulseRing(p => (p + 1) % 3);
    }, 800);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let stepTimeout: ReturnType<typeof setTimeout>;
    let elapsed = 0;

    const advanceStep = (idx: number) => {
      if (!mountedRef.current || idx >= AGENT_STEPS.length) return;
      setCurrentStep(idx);

      stepTimeout = setTimeout(() => {
        if (!mountedRef.current) return;
        setCompletedSteps(prev => new Set([...prev, idx]));
        advanceStep(idx + 1);
      }, AGENT_STEPS[idx].duration);

      elapsed += AGENT_STEPS[idx].duration;
    };

    advanceStep(0);
    return () => clearTimeout(stepTimeout);
  }, []);

  useEffect(() => {
    if (currentStep < 2) return;
    let idx = 0;
    const interval = setInterval(() => {
      if (!mountedRef.current) { clearInterval(interval); return; }
      if (idx < DATA_STREAMS.length) {
        const item = DATA_STREAMS[idx];
        setStreamItems(prev => prev.includes(item) ? prev : [...prev, item]);
        idx++;
      } else {
        clearInterval(interval);
      }
    }, 280);
    return () => clearInterval(interval);
  }, [currentStep]);

  const getStepStatus = (idx: number) => {
    if (completedSteps.has(idx)) return 'completed';
    if (idx === currentStep) return 'active';
    return 'pending';
  };

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-slate-800/60 border border-slate-700/50 backdrop-blur-sm">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {particles.map(p => (
          <div
            key={p.id}
            className="absolute w-1 h-1 rounded-full bg-cyan-400/30"
            style={{
              left: `${p.x}%`,
              top: `${p.y}%`,
              animation: `agentFloat ${3 + p.delay}s ease-in-out infinite`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}

        <div
          className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent"
          style={{ animation: 'agentScanline 2s linear infinite' }}
        />
      </div>

      <div className="relative px-5 pt-4 pb-2">
        <div className="flex items-center gap-2 mb-3">
          <div className="relative">
            <Shield className="w-4 h-4 text-cyan-400" />
            <div className="absolute inset-0 animate-ping">
              <Shield className="w-4 h-4 text-cyan-400/30" />
            </div>
          </div>
          <span className="text-xs font-semibold tracking-widest uppercase text-cyan-400/90">
            Genie Agent Pipeline
          </span>
          <div className="flex gap-1 ml-auto">
            {[0, 1, 2].map(i => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-cyan-400"
                style={{
                  animation: 'agentDotPulse 1.4s ease-in-out infinite',
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-1">
          {AGENT_STEPS.map((step, idx) => {
            const status = getStepStatus(idx);
            const StepIcon = step.icon;
            const isActive = status === 'active';
            const isCompleted = status === 'completed';
            const isPending = status === 'pending';

            return (
              <div
                key={step.id}
                className={`relative flex items-start gap-3 py-2 px-3 rounded-lg transition-all duration-500 ${
                  isActive
                    ? 'bg-cyan-500/8 border border-cyan-500/20'
                    : isCompleted
                    ? 'bg-emerald-500/5 border border-transparent'
                    : 'border border-transparent opacity-40'
                }`}
              >
                <div className="relative flex-shrink-0 mt-0.5">
                  {isCompleted ? (
                    <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                    </div>
                  ) : isActive ? (
                    <div className="relative w-6 h-6">
                      <div className="absolute inset-0 rounded-full bg-cyan-500/20 animate-ping" />
                      <div className="relative w-6 h-6 rounded-full bg-cyan-500/20 flex items-center justify-center border border-cyan-500/40">
                        <StepIcon className="w-3.5 h-3.5 text-cyan-400" style={{ animation: 'agentIconSpin 2s linear infinite' }} />
                      </div>
                    </div>
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-slate-700/50 flex items-center justify-center border border-slate-600/30">
                      <StepIcon className="w-3.5 h-3.5 text-slate-500" />
                    </div>
                  )}

                  {idx < AGENT_STEPS.length - 1 && (
                    <div className={`absolute top-7 left-3 w-[1px] h-4 transition-colors duration-500 ${
                      isCompleted ? 'bg-emerald-500/40' : isActive ? 'bg-cyan-500/30' : 'bg-slate-700/30'
                    }`} />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium transition-colors duration-300 ${
                      isCompleted ? 'text-emerald-400' : isActive ? 'text-cyan-300' : 'text-slate-500'
                    }`}>
                      {step.label}
                    </span>
                    {isCompleted && (
                      <span className="text-[10px] text-emerald-500/70 font-mono">done</span>
                    )}
                    {isActive && (
                      <Activity className="w-3 h-3 text-cyan-400" style={{ animation: 'agentPulse 1s ease-in-out infinite' }} />
                    )}
                  </div>
                  {(isActive || isCompleted) && (
                    <p className={`text-xs mt-0.5 transition-colors duration-300 ${
                      isCompleted ? 'text-emerald-500/50' : 'text-slate-400/80'
                    }`}>
                      {step.detail}
                    </p>
                  )}
                </div>

                {isActive && (
                  <div className="flex-shrink-0 self-center">
                    <div className="w-8 h-1 rounded-full bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-cyan-300"
                        style={{ animation: `agentProgress ${step.duration}ms ease-out forwards` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {currentStep >= 2 && streamItems.length > 0 && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3 h-3 text-amber-400" />
            <span className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">
              Live Data Streams
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {streamItems.map((item, i) => (
              <span
                key={item}
                className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-slate-700/60 border border-slate-600/40 text-cyan-300/80"
                style={{
                  animation: 'agentTagAppear 0.3s ease-out forwards',
                  animationDelay: `${i * 0.05}s`,
                }}
              >
                <span className="w-1 h-1 rounded-full bg-cyan-400 mr-1.5 animate-pulse" />
                {item}
              </span>
            ))}
          </div>
        </div>
      )}

      <style>{`
        @keyframes agentFloat {
          0%, 100% { transform: translateY(0) scale(1); opacity: 0.3; }
          50% { transform: translateY(-8px) scale(1.5); opacity: 0.7; }
        }
        @keyframes agentScanline {
          0% { transform: translateY(-1px); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(200px); opacity: 0; }
        }
        @keyframes agentDotPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        @keyframes agentIconSpin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes agentPulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        @keyframes agentProgress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        @keyframes agentTagAppear {
          0% { opacity: 0; transform: scale(0.8) translateY(4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
};

export default AgentStepLoader;
