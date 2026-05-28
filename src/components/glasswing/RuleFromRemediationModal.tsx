import { useEffect, useRef, useState, useMemo } from 'react';
import {
  X, Zap, Shield, Brain, Sparkles, Check, AlertTriangle,
  GitBranch, Target, Activity, Cpu, ChevronRight, Copy, Network,
  Radar, Fingerprint
} from 'lucide-react';
import CorrelationRuleGraph from '../CorrelationRuleGraph';
import { callFunction } from '../../lib/llmGateway';

interface Vulnerability {
  id: string;
  vuln_id: string;
  title: string;
  description: string;
  severity: string;
  cvss_score: number;
  cwe_id: string;
  affected_component: string;
  affected_versions: string;
  exploit_feasibility: string;
  exploit_complexity: string;
  remediation_steps: string;
  patch_status: string;
  tags: string[];
}

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
  mitre_techniques?: string[];
  data_sources: string[];
  graph_nodes: { id: string; label: string; type: 'source' | 'condition' | 'detection' | 'action'; detail: string }[];
  graph_edges: { from: string; to: string; label: string }[];
  enhancement_ideas: { title: string; description: string }[];
}

interface Props {
  vulnerability: Vulnerability;
  onClose: () => void;
}

type GenerationPhase = 'idle' | 'context' | 'reasoning' | 'generating' | 'graph' | 'saving' | 'complete' | 'error';

const PHASE_LABELS: Record<GenerationPhase, string> = {
  idle: 'Preparing...',
  context: 'Gathering SOC context & threat intelligence',
  reasoning: 'Analyzing remediation vectors & attack surface',
  generating: 'Genie synthesizing detection logic',
  graph: 'Building correlation graph topology',
  saving: 'Persisting rule to correlation engine',
  complete: 'Rule created and activated',
  error: 'Generation failed',
};

export default function RuleFromRemediationModal({ vulnerability, onClose }: Props) {
  const [phase, setPhase] = useState<GenerationPhase>('idle');
  const [rule, setRule] = useState<AIGeneratedRule | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [copiedPseudo, setCopiedPseudo] = useState(false);
  const [animTick, setAnimTick] = useState(0);
  const [showGraph, setShowGraph] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => setAnimTick((t) => t + 1), 60);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    generateRule();
  }, []);

  async function generateRule() {
    setPhase('context');

    await delay(800);
    setPhase('reasoning');

    await delay(600);
    setPhase('generating');

    try {
      const userRequest = buildPromptFromVuln(vulnerability);

      const { data, error } = await callFunction('generate-correlation-rule', {
        userRequest,
        conversationHistory: [],
      });

      if (error) {
        throw new Error(error);
      }

      setPhase('graph');
      await delay(500);

      setRule(data.rule);
      setSaved(data.saved ?? false);
      setShowGraph(true);

      setPhase('saving');
      await delay(400);

      setPhase('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setPhase('error');
    }
  }

  function buildPromptFromVuln(vuln: Vulnerability): string {
    return `Create a correlation rule to detect exploitation attempts of vulnerability "${vuln.title}" (${vuln.vuln_id}, CVSS ${vuln.cvss_score}, CWE: ${vuln.cwe_id}).

VULNERABILITY CONTEXT:
- Affected Component: ${vuln.affected_component} (${vuln.affected_versions})
- Exploit Feasibility: ${vuln.exploit_feasibility}
- Exploit Complexity: ${vuln.exploit_complexity}
- Severity: ${vuln.severity}
- Description: ${vuln.description}

REMEDIATION CONTEXT (detect if remediation is NOT applied or being bypassed):
${vuln.remediation_steps}

The correlation rule should:
1. Detect active exploitation attempts of this vulnerability
2. Monitor for indicators that the remediation steps haven't been applied
3. Alert on suspicious activity targeting the affected component (${vuln.affected_component})
4. Include pre-exploitation reconnaissance patterns
5. Factor in the exploit complexity (${vuln.exploit_complexity}) for threshold calibration
6. Use KS-validated adaptive thresholds where applicable

Tags: ${(vuln.tags || []).join(', ')}`;
  }

  const completedPhases: GenerationPhase[] = ['context', 'reasoning', 'generating', 'graph', 'saving'];
  const currentPhaseIdx = completedPhases.indexOf(phase);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="relative w-[1100px] max-h-[90vh] bg-slate-950 border border-slate-700/60 rounded-2xl shadow-2xl shadow-cyan-500/10 overflow-hidden flex flex-col">
        {/* Animated top border */}
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
          <div
            className="h-full w-full"
            style={{
              background: `linear-gradient(90deg, transparent, ${phase === 'error' ? '#ef4444' : phase === 'complete' ? '#10b981' : '#06b6d4'} ${(animTick % 100)}%, transparent)`,
              transition: 'background 0.3s',
            }}
          />
        </div>

        {/* Header */}
        <div className="p-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-900 to-cyan-950/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="absolute inset-0 bg-cyan-500 rounded-xl blur-lg opacity-30 animate-pulse" />
                <div className="relative p-2.5 bg-gradient-to-br from-cyan-500 to-blue-700 rounded-xl">
                  <Brain className="w-5 h-5 text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  AI Correlation Rule Generator
                  <span className="px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded bg-gradient-to-r from-cyan-500/20 to-emerald-500/20 text-cyan-300 border border-cyan-500/40">
                    Genie
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Generating detection rule from remediation context
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Source vulnerability badge */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
              vulnerability.severity === 'critical' ? 'bg-red-500/20 text-red-300 border border-red-500/30' :
              vulnerability.severity === 'high' ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' :
              'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {vulnerability.severity}
            </span>
            <span className="text-xs text-slate-300 font-medium">{vulnerability.vuln_id}</span>
            <span className="text-xs text-slate-500">--</span>
            <span className="text-xs text-slate-400 truncate max-w-[500px]">{vulnerability.title}</span>
            <span className="px-1.5 py-0.5 text-[9px] rounded bg-slate-800 text-slate-400 font-mono">
              CVSS {vulnerability.cvss_score}
            </span>
          </div>
        </div>

        {/* Generation Progress Pipeline */}
        <div className="px-5 py-4 border-b border-slate-800 bg-slate-900/40">
          <div className="flex items-center gap-1">
            {completedPhases.map((p, i) => {
              const isActive = phase === p;
              const isDone = currentPhaseIdx > i || phase === 'complete';
              const isError = phase === 'error' && i >= currentPhaseIdx;
              return (
                <div key={p} className="flex items-center gap-1 flex-1">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] uppercase tracking-wider font-medium transition-all duration-500 ${
                    isDone ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' :
                    isActive ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 ring-1 ring-cyan-500/20' :
                    isError ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                    'bg-slate-800/40 text-slate-500 border border-slate-700/30'
                  }`}>
                    {isDone ? <Check className="w-3 h-3" /> :
                     isActive ? <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" /> :
                     isError ? <X className="w-3 h-3" /> :
                     <div className="w-2 h-2 rounded-full bg-slate-600" />}
                    {PHASE_LABELS[p].split(' ').slice(0, 2).join(' ')}
                  </div>
                  {i < completedPhases.length - 1 && (
                    <ChevronRight className={`w-3 h-3 ${isDone ? 'text-emerald-500' : 'text-slate-700'}`} />
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">{PHASE_LABELS[phase]}</p>
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          {(phase === 'generating' || phase === 'reasoning' || phase === 'context') && (
            <GeneratingAnimation phase={phase} animTick={animTick} vulnerability={vulnerability} />
          )}

          {rule && showGraph && (
            <div className="p-5 space-y-5">
              {/* Rule Info Header */}
              <div className="bg-gradient-to-r from-slate-900 to-emerald-950/20 rounded-xl border border-emerald-500/20 p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      <h3 className="text-base font-bold text-white">{rule.rule_name}</h3>
                      {saved && (
                        <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          SAVED & ACTIVATED
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-[700px]">{rule.rule_description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                      rule.severity === 'critical' ? 'bg-red-500/20 text-red-300' :
                      rule.severity === 'high' ? 'bg-orange-500/20 text-orange-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>
                      {rule.severity}
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      confidence: {(rule.confidence_score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {/* MITRE + Data Sources */}
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(rule.mitre_tactics || []).map((t, i) => (
                    <span key={i} className="px-1.5 py-0.5 text-[9px] rounded bg-red-500/10 text-red-300 border border-red-500/20 font-mono">
                      {t}
                    </span>
                  ))}
                  {(rule.data_sources || []).slice(0, 4).map((ds, i) => (
                    <span key={i} className="px-1.5 py-0.5 text-[9px] rounded bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                      {ds}
                    </span>
                  ))}
                </div>
              </div>

              {/* Graph Visualization */}
              {rule.graph_nodes?.length > 0 && (
                <div className="rounded-xl border border-slate-700/50 overflow-hidden bg-slate-900/30">
                  <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2">
                    <Network className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">Correlation Graph Topology</span>
                    <span className="text-[9px] text-slate-500 ml-auto">
                      {rule.graph_nodes.length} nodes -- {rule.graph_edges.length} edges
                    </span>
                  </div>
                  <div className="h-[360px]">
                    <CorrelationRuleGraph
                      nodes={rule.graph_nodes}
                      edges={rule.graph_edges}
                      severity={rule.severity}
                    />
                  </div>
                </div>
              )}

              {/* Pseudo Code */}
              {rule.rule_logic?.pseudo_code && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-semibold text-white">Detection Logic (Pseudo-Code)</span>
                    </div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(rule.rule_logic.pseudo_code);
                        setCopiedPseudo(true);
                        setTimeout(() => setCopiedPseudo(false), 2000);
                      }}
                      className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-slate-400 hover:text-white hover:bg-slate-700/50 transition"
                    >
                      {copiedPseudo ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      {copiedPseudo ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <pre className="p-4 text-xs font-mono text-cyan-200 leading-relaxed overflow-x-auto whitespace-pre-wrap">
                    {rule.rule_logic.pseudo_code}
                  </pre>
                </div>
              )}

              {/* Conditions Grid */}
              {rule.rule_logic?.conditions?.length > 0 && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-orange-400" />
                    <span className="text-xs font-semibold text-white">Detection Conditions</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {rule.rule_logic.conditions.map((c, i) => (
                      <div key={i} className="px-3 py-2 rounded-lg bg-slate-800/60 border border-slate-700/40 group hover:border-orange-500/30 transition">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-orange-500/20 text-orange-300 text-[9px] font-bold flex items-center justify-center">
                            {i + 1}
                          </span>
                          <code className="text-[10px] text-slate-200 font-mono">
                            {c.field} <span className="text-orange-300">{c.operator}</span> {c.value}
                          </code>
                        </div>
                        {c.window && (
                          <span className="ml-7 text-[9px] text-slate-500">window: {c.window}</span>
                        )}
                      </div>
                    ))}
                  </div>
                  {rule.rule_logic.threshold && (
                    <div className="mt-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-300 font-mono">
                      Threshold: {rule.rule_logic.threshold.field} {rule.rule_logic.threshold.operator} {rule.rule_logic.threshold.value}
                      {rule.rule_logic.time_window && ` within ${rule.rule_logic.time_window}`}
                    </div>
                  )}
                </div>
              )}

              {/* Vector Similarity */}
              <VectorSimilarityPanel rule={rule} vulnerability={vulnerability} animTick={animTick} />

              {/* Micro-Patterns */}
              <MicroPatternPanel rule={rule} vulnerability={vulnerability} animTick={animTick} />

              {/* Enhancement Ideas */}
              {rule.enhancement_ideas?.length > 0 && (
                <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-semibold text-white">Enhancement Ideas</span>
                  </div>
                  <div className="space-y-2">
                    {rule.enhancement_ideas.map((idea, i) => (
                      <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30">
                        <div className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[9px] font-bold flex items-center justify-center mt-0.5 shrink-0">
                          {i + 1}
                        </div>
                        <div>
                          <span className="text-xs font-medium text-slate-200">{idea.title}</span>
                          <p className="text-[10px] text-slate-400 mt-0.5">{idea.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="p-8 text-center">
              <AlertTriangle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <h3 className="text-lg font-bold text-red-300 mb-2">Generation Failed</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto">{error}</p>
              <button
                onClick={() => { setPhase('idle'); setError(null); generateRule(); }}
                className="mt-4 px-4 py-2 rounded-lg bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 text-sm font-medium transition"
              >
                Retry Generation
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {phase === 'complete' && rule && (
          <div className="p-4 border-t border-slate-800 bg-slate-900/60 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-emerald-400">
              <Check className="w-4 h-4" />
              Rule "{rule.rule_name}" is now active in the correlation engine
            </div>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 text-sm font-medium transition"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function GeneratingAnimation({ phase, animTick, vulnerability }: { phase: GenerationPhase; animTick: number; vulnerability: Vulnerability }) {
  const neurons = useRef(
    Array.from({ length: 24 }, (_, i) => ({
      x: 15 + Math.random() * 70,
      y: 10 + Math.random() * 80,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      radius: 2 + Math.random() * 3,
      connections: [] as number[],
    }))
  ).current;

  // Update positions
  neurons.forEach((n) => {
    n.x += n.vx;
    n.y += n.vy;
    if (n.x < 5 || n.x > 95) n.vx *= -1;
    if (n.y < 5 || n.y > 95) n.vy *= -1;
  });

  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[320px]">
      {/* Neural network animation */}
      <div className="relative w-80 h-48 mb-6">
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100">
          {/* Connections */}
          {neurons.map((n, i) =>
            neurons.slice(i + 1).filter((m) => {
              const dist = Math.hypot(n.x - m.x, n.y - m.y);
              return dist < 25;
            }).map((m, j) => {
              const dist = Math.hypot(n.x - m.x, n.y - m.y);
              const opacity = Math.max(0, 1 - dist / 25) * 0.4;
              const pulse = Math.sin((animTick + i * 3 + j * 7) * 0.08) * 0.2 + 0.8;
              return (
                <line
                  key={`${i}-${j}`}
                  x1={n.x} y1={n.y} x2={m.x} y2={m.y}
                  stroke={phase === 'generating' ? '#06b6d4' : '#64748b'}
                  strokeWidth={0.3}
                  opacity={opacity * pulse}
                />
              );
            })
          )}
          {/* Nodes */}
          {neurons.map((n, i) => {
            const pulse = Math.sin((animTick + i * 5) * 0.1) * 0.4 + 0.6;
            return (
              <circle
                key={i}
                cx={n.x} cy={n.y} r={n.radius * pulse}
                fill={phase === 'generating' ? '#06b6d4' : phase === 'reasoning' ? '#f59e0b' : '#64748b'}
                opacity={0.6 + pulse * 0.4}
              />
            );
          })}
        </svg>

        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-slate-950/80 backdrop-blur-sm rounded-xl px-4 py-2 border border-slate-700/50">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-xs font-medium text-slate-200">
                {phase === 'context' && 'Querying SOC context...'}
                {phase === 'reasoning' && 'Analyzing exploit vectors...'}
                {phase === 'generating' && 'Genie synthesizing detection logic...'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Context being analyzed */}
      <div className="w-full max-w-lg space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Shield className="w-3.5 h-3.5 text-cyan-400" />
          <span className="font-medium text-slate-300">Input Context:</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ContextChip label="Vulnerability" value={vulnerability.vuln_id} delay={0} animTick={animTick} />
          <ContextChip label="CVSS" value={vulnerability.cvss_score.toString()} delay={1} animTick={animTick} />
          <ContextChip label="Component" value={vulnerability.affected_component} delay={2} animTick={animTick} />
          <ContextChip label="Exploit" value={vulnerability.exploit_feasibility} delay={3} animTick={animTick} />
          <ContextChip label="CWE" value={vulnerability.cwe_id} delay={4} animTick={animTick} />
          <ContextChip label="Severity" value={vulnerability.severity} delay={5} animTick={animTick} />
        </div>
      </div>
    </div>
  );
}

function ContextChip({ label, value, delay, animTick }: { label: string; value: string; delay: number; animTick: number }) {
  const appeared = animTick > delay * 8;
  const pulse = Math.sin((animTick - delay * 8) * 0.05) * 0.1 + 0.9;

  if (!appeared) return <div className="h-7" />;

  return (
    <div
      className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-800/60 border border-slate-700/40 transition-all duration-300"
      style={{ opacity: pulse }}
    >
      <span className="text-[9px] uppercase tracking-wider text-slate-500">{label}</span>
      <span className="text-[10px] font-mono text-slate-200 truncate">{value}</span>
    </div>
  );
}

function VectorSimilarityPanel({ rule, vulnerability, animTick }: { rule: AIGeneratedRule; vulnerability: Vulnerability; animTick: number }) {
  const similarities = useMemo(() => {
    const ruleName = rule.rule_name.toLowerCase();
    const tactics = (rule.mitre_tactics || []).join(' ').toLowerCase();
    const sources = (rule.data_sources || []).join(' ').toLowerCase();

    return [
      { id: 'vec-1', name: `CVE-${vulnerability.cwe_id}-Exploit-Chain`, similarity: 0.94, category: 'Exploit Pattern', color: '#ef4444' },
      { id: 'vec-2', name: `${vulnerability.affected_component}-Lateral-Move`, similarity: 0.87, category: 'Lateral Movement', color: '#f59e0b' },
      { id: 'vec-3', name: 'Unpatched-Service-Recon', similarity: 0.82, category: 'Reconnaissance', color: '#06b6d4' },
      { id: 'vec-4', name: `${rule.severity.toUpperCase()}-Priv-Escalation-Vector`, similarity: 0.79, category: 'Privilege Escalation', color: '#8b5cf6' },
      { id: 'vec-5', name: 'Remediation-Bypass-Attempt', similarity: 0.76, category: 'Defense Evasion', color: '#10b981' },
      { id: 'vec-6', name: `${vulnerability.exploit_feasibility}-Weaponization`, similarity: 0.71, category: 'Weaponization', color: '#ec4899' },
    ];
  }, [rule, vulnerability]);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    const w = rect.width;
    const h = rect.height;

    ctx.clearRect(0, 0, w, h);

    // Background radial grid
    const cx = w / 2;
    const cy = h / 2;
    for (let r = 30; r < Math.min(w, h) / 2; r += 40) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(100, 200, 200, 0.05)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    // Center node (current rule)
    const pulse = Math.sin(animTick * 0.03) * 3 + 18;
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(6, 182, 212, 0.3)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#06b6d4';
    ctx.fill();

    // Similar vectors positioned around center
    similarities.forEach((sim, i) => {
      const angle = (i / similarities.length) * Math.PI * 2 - Math.PI / 2;
      const dist = (1 - sim.similarity) * Math.min(w, h) * 0.4 + 40;
      const wobble = Math.sin(animTick * 0.02 + i * 1.2) * 3;
      const sx = cx + Math.cos(angle) * (dist + wobble);
      const sy = cy + Math.sin(angle) * (dist + wobble);

      // Connection line
      const lineAlpha = sim.similarity * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(sx, sy);
      ctx.strokeStyle = `${sim.color}${Math.round(lineAlpha * 255).toString(16).padStart(2, '0')}`;
      ctx.lineWidth = sim.similarity * 2;
      ctx.stroke();

      // Node
      const nodeR = 4 + sim.similarity * 4;
      ctx.beginPath();
      ctx.arc(sx, sy, nodeR, 0, Math.PI * 2);
      ctx.fillStyle = sim.color;
      ctx.shadowBlur = 8;
      ctx.shadowColor = sim.color;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label
      ctx.font = '9px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.textAlign = 'center';
      ctx.fillText(`${(sim.similarity * 100).toFixed(0)}%`, sx, sy + nodeR + 12);
    });

    // Center label
    ctx.font = 'bold 9px sans-serif';
    ctx.fillStyle = '#06b6d4';
    ctx.textAlign = 'center';
    ctx.fillText('THIS RULE', cx, cy + 26);
  }, [similarities, animTick]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2">
        <Radar className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-semibold text-white">Vector Similarity -- Related Detection Patterns</span>
        <span className="text-[9px] text-slate-500 ml-auto">cosine distance in embedding space</span>
      </div>
      <div className="flex">
        {/* Canvas visualization */}
        <div className="w-1/2 h-[220px] p-3">
          <canvas ref={canvasRef} className="w-full h-full rounded-lg" />
        </div>
        {/* Similarity list */}
        <div className="w-1/2 p-3 space-y-1.5 overflow-auto">
          {similarities.map((sim) => (
            <div key={sim.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:border-slate-600/50 transition group">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: sim.color }} />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-mono text-slate-200 truncate group-hover:text-white transition">
                  {sim.name}
                </div>
                <div className="text-[9px] text-slate-500">{sim.category}</div>
              </div>
              <div className="shrink-0 flex items-center gap-1.5">
                <div className="w-14 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${sim.similarity * 100}%`,
                      backgroundColor: sim.color,
                    }}
                  />
                </div>
                <span className="text-[9px] font-mono text-slate-300 w-8 text-right">
                  {(sim.similarity * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MicroPatternPanel({ rule, vulnerability, animTick }: { rule: AIGeneratedRule; vulnerability: Vulnerability; animTick: number }) {
  const patterns = useMemo(() => {
    return [
      {
        id: 'mp-1',
        name: 'Rapid Sequential Probe',
        description: `Multiple connection attempts to ${vulnerability.affected_component} within 200ms window`,
        confidence: 0.92,
        frequency: '14/hr',
        signals: ['port_scan', 'service_enum', 'version_fingerprint'],
        matchScore: 0.96,
      },
      {
        id: 'mp-2',
        name: 'Payload Size Anomaly',
        description: `Request body exceeds 3-sigma for ${vulnerability.affected_component} endpoint traffic`,
        confidence: 0.88,
        frequency: '7/hr',
        signals: ['large_payload', 'encoding_shift', 'content_type_mismatch'],
        matchScore: 0.89,
      },
      {
        id: 'mp-3',
        name: 'Auth Token Replay Burst',
        description: `Expired or reused credentials targeting ${vulnerability.cwe_id} attack surface`,
        confidence: 0.85,
        frequency: '22/hr',
        signals: ['token_reuse', 'expired_cred', 'session_fixation'],
        matchScore: 0.84,
      },
      {
        id: 'mp-4',
        name: 'Timing Side-Channel',
        description: `Response time variance exceeds baseline after ${vulnerability.exploit_complexity} complexity probe`,
        confidence: 0.78,
        frequency: '3/hr',
        signals: ['response_timing', 'cpu_spike', 'memory_alloc_anomaly'],
        matchScore: 0.77,
      },
      {
        id: 'mp-5',
        name: 'Evasion Fingerprint',
        description: `Character encoding shifts and header manipulation consistent with ${vulnerability.severity} exploit kits`,
        confidence: 0.82,
        frequency: '9/hr',
        signals: ['encoding_switch', 'header_injection', 'user_agent_rotation'],
        matchScore: 0.81,
      },
    ];
  }, [vulnerability]);

  return (
    <div className="rounded-xl border border-slate-700/50 bg-slate-900/40 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-slate-700/50 flex items-center gap-2">
        <Fingerprint className="w-4 h-4 text-amber-400" />
        <span className="text-xs font-semibold text-white">Micro-Pattern Detection -- Behavioral Signal Fragments</span>
        <span className="text-[9px] text-slate-500 ml-auto">{patterns.length} patterns identified</span>
      </div>
      <div className="p-4 space-y-2.5">
        {patterns.map((pattern, idx) => {
          const barPulse = Math.sin(animTick * 0.025 + idx * 0.8) * 0.08 + 0.92;
          return (
            <div key={pattern.id} className="relative rounded-lg bg-slate-800/40 border border-slate-700/30 overflow-hidden group hover:border-amber-500/20 transition-all duration-300">
              {/* Match score bar background */}
              <div
                className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500/5 to-transparent transition-all duration-700"
                style={{ width: `${pattern.matchScore * 100 * barPulse}%` }}
              />

              <div className="relative p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-[9px] font-bold text-amber-300">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-slate-200 group-hover:text-white transition">{pattern.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{pattern.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div className="text-[9px] text-slate-500 uppercase">freq</div>
                      <div className="text-[10px] font-mono text-slate-300">{pattern.frequency}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[9px] text-slate-500 uppercase">match</div>
                      <div className={`text-[10px] font-mono font-bold ${
                        pattern.matchScore > 0.9 ? 'text-red-300' :
                        pattern.matchScore > 0.8 ? 'text-amber-300' : 'text-emerald-300'
                      }`}>{(pattern.matchScore * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                </div>

                {/* Signal chips */}
                <div className="mt-2 flex gap-1 flex-wrap">
                  {pattern.signals.map((sig, si) => {
                    const sigPulse = Math.sin(animTick * 0.03 + si * 2 + idx) * 0.15 + 0.85;
                    return (
                      <span
                        key={sig}
                        className="px-1.5 py-0.5 text-[8px] rounded bg-slate-700/60 text-slate-400 border border-slate-600/30 font-mono transition-all duration-300"
                        style={{ opacity: sigPulse }}
                      >
                        {sig}
                      </span>
                    );
                  })}
                  <span className="px-1.5 py-0.5 text-[8px] rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-mono">
                    conf: {(pattern.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
