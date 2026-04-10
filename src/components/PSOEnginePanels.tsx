import {
  Route, Shield, AlertTriangle, Cpu, Eye, Network,
  ChevronDown, ChevronUp, TrendingUp, Crosshair, Zap
} from 'lucide-react';
import { useState } from 'react';

interface AttackPath {
  id: number;
  name: string;
  steps: string[];
  likelihood: number;
  impact: number;
  riskScore: number;
  timeToCompromiseMinutes: number;
  detectionProbability: number;
}

interface HighRiskNode {
  node: string;
  type: 'identity' | 'endpoint' | 'service' | 'cloud' | 'data';
  riskCentrality: number;
  vulnerabilityScore: number;
  exposureLevel: 'Critical' | 'High' | 'Medium' | 'Low';
  simulationAppearanceRate: string;
  controlCoverage: number;
}

interface CoverageAnalysis {
  overallCoverage: number;
  coveredPaths: number;
  totalPaths: number;
  coverageByStage: {
    reconnaissance: number;
    initialAccess: number;
    execution: number;
    persistence: number;
    lateralMovement: number;
    exfiltration: number;
  };
  improvementPotential: string;
}

interface ControlFailure {
  control: string;
  currentEffectiveness: number;
  failureImpact: string;
  attackSuccessIncrease: number;
  recommendation: string;
}

interface PredictedStep {
  step: string;
  probability: number;
  mitreTechnique: string;
  timeframeMinutes: number;
  indicator: string;
}

interface GraphEdge {
  from: string;
  to: string;
  edgeType: 'lateral_movement' | 'privilege_escalation' | 'data_access' | 'trust_relationship' | 'network_path';
  transitionProbability: number;
  modifiers: string[];
}

interface PSOEnginePanelsProps {
  topAttackPaths: AttackPath[];
  highRiskNodes: HighRiskNode[];
  coverageAnalysis: CoverageAnalysis | null;
  controlFailureSensitivity: ControlFailure[];
  predictedNextSteps: PredictedStep[];
  graphEdges: GraphEdge[];
}

function getExposureColor(level: string) {
  switch (level) {
    case 'Critical': return 'text-red-400 bg-red-500/10 border-red-500/30';
    case 'High': return 'text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'Medium': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30';
    default: return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  }
}

function getNodeTypeIcon(type: string) {
  switch (type) {
    case 'identity': return '👤';
    case 'endpoint': return '💻';
    case 'service': return '⚙️';
    case 'cloud': return '☁️';
    case 'data': return '🗄️';
    default: return '●';
  }
}

function getEdgeColor(type: string) {
  switch (type) {
    case 'lateral_movement': return 'border-red-500/40 bg-red-500/5';
    case 'privilege_escalation': return 'border-orange-500/40 bg-orange-500/5';
    case 'data_access': return 'border-cyan-500/40 bg-cyan-500/5';
    case 'trust_relationship': return 'border-emerald-500/40 bg-emerald-500/5';
    case 'network_path': return 'border-blue-500/40 bg-blue-500/5';
    default: return 'border-slate-700/40 bg-slate-800/30';
  }
}

function formatMins(m: number) {
  if (m < 60) return `${Math.round(m)}m`;
  const h = Math.floor(m / 60);
  const rm = Math.round(m % 60);
  return rm > 0 ? `${h}h ${rm}m` : `${h}h`;
}

function AttackPathsPanel({ paths }: { paths: AttackPath[] }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  if (paths.length === 0) return null;

  return (
    <div className="enterprise-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Route className="w-4 h-4 text-red-400" />
        <span className="text-sm font-semibold text-slate-200">TOP ATTACK PATHS</span>
        <span className="ml-auto px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-500/10 border border-red-500/20 rounded text-red-400">
          {paths.length} PATHS
        </span>
      </div>
      <div className="space-y-2">
        {paths.map((path) => (
          <div key={path.id} className="rounded-lg border border-slate-700/40 bg-slate-800/20 overflow-hidden">
            <button
              onClick={() => setExpanded(expanded === path.id ? null : path.id)}
              className="w-full px-3 py-2.5 flex items-center gap-3 hover:bg-slate-700/20 transition-colors"
            >
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <span className="text-xs font-bold text-red-400">#{path.id}</span>
              </div>
              <div className="flex-1 text-left min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{path.name}</p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-slate-500">Risk: <span className="text-red-400 font-bold">{path.riskScore}</span></span>
                  <span className="text-[10px] text-slate-500">TTC: <span className="text-amber-400 font-semibold">{formatMins(path.timeToCompromiseMinutes)}</span></span>
                  <span className="text-[10px] text-slate-500">Det: <span className="text-cyan-400 font-semibold">{(path.detectionProbability * 100).toFixed(0)}%</span></span>
                </div>
              </div>
              <div className="flex-shrink-0 flex items-center gap-2">
                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${path.riskScore}%`,
                      background: path.riskScore > 60 ? '#ef4444' : path.riskScore > 35 ? '#f59e0b' : '#22d3ee'
                    }}
                  />
                </div>
                {expanded === path.id ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
              </div>
            </button>
            {expanded === path.id && (
              <div className="px-3 pb-3 border-t border-slate-700/30">
                <div className="grid grid-cols-2 gap-2 mt-2 mb-3">
                  <div className="p-2 rounded bg-slate-800/40">
                    <p className="text-[9px] text-slate-500 uppercase">Likelihood</p>
                    <p className="text-sm font-bold text-slate-200">{path.likelihood}%</p>
                  </div>
                  <div className="p-2 rounded bg-slate-800/40">
                    <p className="text-[9px] text-slate-500 uppercase">Impact</p>
                    <p className="text-sm font-bold text-slate-200">{path.impact}%</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  {path.steps.map((step, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="flex-shrink-0 mt-1 flex flex-col items-center">
                        <div className="w-2 h-2 rounded-full bg-red-400/60" />
                        {i < path.steps.length - 1 && <div className="w-px h-4 bg-slate-700/60" />}
                      </div>
                      <span className="text-[11px] text-slate-400 leading-relaxed">{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HighRiskNodesPanel({ nodes }: { nodes: HighRiskNode[] }) {
  if (nodes.length === 0) return null;

  return (
    <div className="enterprise-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Crosshair className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-semibold text-slate-200">HIGH-RISK NODES</span>
        <span className="ml-auto px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-orange-500/10 border border-orange-500/20 rounded text-orange-400">
          GRAPH CENTRALITY
        </span>
      </div>
      <div className="space-y-2">
        {nodes.map((node, i) => (
          <div key={i} className="p-2.5 rounded-lg border border-slate-700/30 bg-slate-800/20">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm">{getNodeTypeIcon(node.type)}</span>
              <span className="text-xs font-semibold text-slate-200 flex-1">{node.node}</span>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${getExposureColor(node.exposureLevel)}`}>
                {node.exposureLevel}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <div>
                <p className="text-[9px] text-slate-500 uppercase">Risk Centrality</p>
                <p className="text-xs font-bold text-red-400">{node.riskCentrality}%</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase">Vuln Score</p>
                <p className="text-xs font-bold text-amber-400">{node.vulnerabilityScore}/10</p>
              </div>
              <div>
                <p className="text-[9px] text-slate-500 uppercase">Control</p>
                <p className="text-xs font-bold text-cyan-400">{node.controlCoverage}%</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 to-red-500"
                  style={{ width: `${node.riskCentrality}%` }}
                />
              </div>
              <span className="text-[10px] text-slate-500">{node.simulationAppearanceRate}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CoveragePanel({ coverage }: { coverage: CoverageAnalysis }) {
  const stages = [
    { key: 'reconnaissance', label: 'Recon' },
    { key: 'initialAccess', label: 'Initial Access' },
    { key: 'execution', label: 'Execution' },
    { key: 'persistence', label: 'Persistence' },
    { key: 'lateralMovement', label: 'Lat. Movement' },
    { key: 'exfiltration', label: 'Exfiltration' },
  ] as const;

  return (
    <div className="enterprise-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-semibold text-slate-200">DETECTION COVERAGE</span>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-2xl font-bold" style={{
            color: coverage.overallCoverage > 60 ? '#34d399' : coverage.overallCoverage > 35 ? '#fbbf24' : '#f87171'
          }}>
            {coverage.overallCoverage}%
          </p>
          <p className="text-[10px] text-slate-500">{coverage.coveredPaths}/{coverage.totalPaths} paths covered</p>
        </div>
        <div className="w-16 h-16 relative">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(51,65,85,0.5)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15" fill="none"
              stroke={coverage.overallCoverage > 60 ? '#34d399' : coverage.overallCoverage > 35 ? '#fbbf24' : '#f87171'}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${coverage.overallCoverage * 0.9425} ${94.25 - coverage.overallCoverage * 0.9425}`}
            />
          </svg>
        </div>
      </div>

      <div className="space-y-1.5 mb-3">
        {stages.map(({ key, label }) => {
          const val = coverage.coverageByStage[key];
          return (
            <div key={key} className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500 w-20 flex-shrink-0">{label}</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${val}%`,
                    background: val > 60 ? '#34d399' : val > 35 ? '#fbbf24' : '#f87171'
                  }}
                />
              </div>
              <span className="text-[10px] font-semibold text-slate-400 w-8 text-right">{val}%</span>
            </div>
          );
        })}
      </div>

      <div className="p-2.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-cyan-400 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-cyan-300/80 leading-relaxed">{coverage.improvementPotential}</p>
        </div>
      </div>
    </div>
  );
}

function ControlSensitivityPanel({ controls }: { controls: ControlFailure[] }) {
  if (controls.length === 0) return null;

  return (
    <div className="enterprise-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-semibold text-slate-200">CONTROL FAILURE SENSITIVITY</span>
      </div>
      <div className="space-y-2">
        {controls.map((ctrl, i) => (
          <div key={i} className="p-2.5 rounded-lg border border-slate-700/30 bg-slate-800/20">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-200">{ctrl.control}</span>
              <span className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded border ${
                ctrl.failureImpact === 'Critical' ? 'text-red-400 bg-red-500/10 border-red-500/30' :
                ctrl.failureImpact === 'High' ? 'text-orange-400 bg-orange-500/10 border-orange-500/30' :
                'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
              }`}>
                {ctrl.failureImpact}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-1.5">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[9px] text-slate-500">Current Effectiveness</span>
                  <span className="text-[10px] font-semibold text-slate-400">{ctrl.currentEffectiveness}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500/60" style={{ width: `${ctrl.currentEffectiveness}%` }} />
                </div>
              </div>
              <div className="flex-shrink-0 text-center px-2">
                <p className="text-[9px] text-slate-500">If Fails</p>
                <p className="text-sm font-bold text-red-400">+{ctrl.attackSuccessIncrease}%</p>
              </div>
            </div>
            <p className="text-[10px] text-slate-500 leading-relaxed">{ctrl.recommendation}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictedNextPanel({ steps }: { steps: PredictedStep[] }) {
  if (steps.length === 0) return null;

  return (
    <div className="enterprise-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="w-4 h-4 text-emerald-400" />
        <span className="text-sm font-semibold text-slate-200">PREDICTED NEXT STEPS</span>
        <span className="ml-auto px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400">
          PREDICTIVE
        </span>
      </div>
      <div className="space-y-2">
        {steps.map((s, i) => (
          <div key={i} className="p-2.5 rounded-lg border border-slate-700/30 bg-slate-800/20">
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex-shrink-0 w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-emerald-400">{i + 1}</span>
              </div>
              <span className="text-xs font-semibold text-slate-200 flex-1">{s.step}</span>
            </div>
            <div className="flex items-center gap-3 mb-1.5">
              <span className="text-[10px] text-slate-500">Probability: <span className="text-emerald-400 font-bold">{s.probability}%</span></span>
              <span className="text-[10px] font-mono text-red-400 bg-red-500/10 px-1 py-0.5 rounded">{s.mitreTechnique}</span>
              <span className="text-[10px] text-slate-500">ETA: <span className="text-amber-400 font-semibold">{formatMins(s.timeframeMinutes)}</span></span>
            </div>
            <div className="flex items-start gap-1.5 p-1.5 rounded bg-slate-800/40">
              <AlertTriangle className="w-3 h-3 text-amber-400/60 flex-shrink-0 mt-0.5" />
              <span className="text-[10px] text-slate-500 leading-relaxed">{s.indicator}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GraphEdgesPanel({ edges }: { edges: GraphEdge[] }) {
  if (edges.length === 0) return null;

  const edgeLabels: Record<string, string> = {
    lateral_movement: 'Lateral Move',
    privilege_escalation: 'Priv. Escalation',
    data_access: 'Data Access',
    trust_relationship: 'Trust',
    network_path: 'Network Path',
  };

  return (
    <div className="enterprise-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Network className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-semibold text-slate-200">ATTACK GRAPH EDGES</span>
      </div>
      <div className="space-y-2">
        {edges.map((edge, i) => (
          <div key={i} className={`p-2.5 rounded-lg border ${getEdgeColor(edge.edgeType)}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-semibold text-slate-200">{edge.from}</span>
              <span className="text-slate-600">→</span>
              <span className="text-[11px] font-semibold text-slate-200">{edge.to}</span>
              <span className="ml-auto text-[9px] font-bold uppercase tracking-wider text-slate-500">
                {edgeLabels[edge.edgeType] || edge.edgeType}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[10px] text-slate-500">Transition P:</span>
              <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-500/60"
                  style={{ width: `${edge.transitionProbability * 100}%` }}
                />
              </div>
              <span className="text-[10px] font-semibold text-blue-400">{(edge.transitionProbability * 100).toFixed(0)}%</span>
            </div>
            {edge.modifiers.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {edge.modifiers.map((mod, j) => (
                  <span key={j} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/60 border border-slate-700/40 text-slate-500">{mod}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PSOEnginePanels({
  topAttackPaths,
  highRiskNodes,
  coverageAnalysis,
  controlFailureSensitivity,
  predictedNextSteps,
  graphEdges,
}: PSOEnginePanelsProps) {
  const hasPSOData = topAttackPaths.length > 0 || highRiskNodes.length > 0 || coverageAnalysis || predictedNextSteps.length > 0;

  if (!hasPSOData) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 px-1">
        <Cpu className="w-4 h-4 text-cyan-400" />
        <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">PSO ENGINE — PREDICTIVE INTELLIGENCE</span>
      </div>
      <AttackPathsPanel paths={topAttackPaths} />
      {coverageAnalysis && <CoveragePanel coverage={coverageAnalysis} />}
      <HighRiskNodesPanel nodes={highRiskNodes} />
      <PredictedNextPanel steps={predictedNextSteps} />
      <ControlSensitivityPanel controls={controlFailureSensitivity} />
      <GraphEdgesPanel edges={graphEdges} />
    </div>
  );
}
