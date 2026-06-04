import { useState, useMemo } from 'react';
import {
  X, Layers, Database, Cpu, BrainCircuit, Shield, Target,
  ArrowRight, Zap, Network, Activity, Clock, BookOpen,
  ChevronRight, Sparkles, Radio, Server, GitBranch
} from 'lucide-react';

type Proposal = {
  id: string;
  publication_id: string;
  proposed_name: string;
  proposed_type: string;
  description: string;
  rationale: string;
  mitre_coverage: string[];
  implementation_complexity: string;
  estimated_days: number;
  priority_score: number;
  status: string;
  created_at: string;
  reviewed_by: string | null;
  review_notes: string | null;
};

type Publication = {
  id: string;
  title: string;
  authors: string[];
  venue: string;
  published_date: string;
  summary_tldr: string;
  category: string;
  keywords: string[];
};

const KILL_CHAIN_PHASES = [
  { id: 'recon', label: 'Reconnaissance', techniques: ['T1595','T1592','T1589','T1590','T1591','T1598','T1597'] },
  { id: 'resource', label: 'Resource Dev', techniques: ['T1583','T1584','T1587','T1588','T1585','T1586'] },
  { id: 'initial', label: 'Initial Access', techniques: ['T1190','T1189','T1566','T1078','T1133','T1200','T1195'] },
  { id: 'execution', label: 'Execution', techniques: ['T1059','T1106','T1053','T1204','T1047'] },
  { id: 'persistence', label: 'Persistence', techniques: ['T1547','T1053','T1078','T1136','T1543','T1546'] },
  { id: 'privesc', label: 'Privilege Esc', techniques: ['T1548','T1068','T1055','T1574'] },
  { id: 'defense', label: 'Defense Evasion', techniques: ['T1027','T1036','T1055','T1140','T1218','T1001','T1205','T1572'] },
  { id: 'credential', label: 'Credential Access', techniques: ['T1110','T1555','T1003','T1558','T1550'] },
  { id: 'discovery', label: 'Discovery', techniques: ['T1046','T1040','T1082','T1083','T1069'] },
  { id: 'lateral', label: 'Lateral Movement', techniques: ['T1021','T1550','T1563','T1072','T1570','T1210'] },
  { id: 'collection', label: 'Collection', techniques: ['T1560','T1005','T1039','T1074'] },
  { id: 'c2', label: 'Command & Control', techniques: ['T1071','T1573','T1090','T1102','T1568','T1001.004'] },
  { id: 'exfil', label: 'Exfiltration', techniques: ['T1041','T1048','T1567','T1020'] },
  { id: 'impact', label: 'Impact', techniques: ['T1565','T1491','T1499','T1498','T1486'] },
];

const ARCH_LAYERS = [
  { id: 'ingestion', label: 'Ingestion Layer', sublabel: 'Kafka / EventHub / S3', color: 'amber', x: 60 },
  { id: 'bronze', label: 'Bronze', sublabel: 'Raw Events (Delta Lake)', color: 'orange', x: 200 },
  { id: 'silver', label: 'Silver', sublabel: 'Normalized / Enriched', color: 'slate', x: 340 },
  { id: 'gold', label: 'Gold', sublabel: 'Analytics & Detections', color: 'amber', x: 480 },
  { id: 'agents', label: 'Agent Mesh', sublabel: 'SOC Agents (49+)', color: 'cyan', x: 620 },
  { id: 'response', label: 'Response', sublabel: 'SOAR / Automation', color: 'emerald', x: 760 },
];

const TYPE_TO_ARCH_POSITION: Record<string, string[]> = {
  agent: ['agents'],
  detection_rule: ['gold', 'agents'],
  correlation_engine: ['silver', 'gold'],
  pipeline: ['ingestion', 'bronze', 'silver'],
  ml_model: ['gold', 'agents'],
};

export default function ProposalArchitectureView({
  proposal,
  paper,
  onClose,
}: {
  proposal: Proposal;
  paper: Publication | null;
  onClose: () => void;
}) {
  const [activeView, setActiveView] = useState<'architecture' | 'attack_chain'>('architecture');

  const coveredPhases = useMemo(() => {
    return KILL_CHAIN_PHASES.map(phase => ({
      ...phase,
      active: phase.techniques.some(t => proposal.mitre_coverage.includes(t)),
      matchedTechniques: phase.techniques.filter(t => proposal.mitre_coverage.includes(t)),
    }));
  }, [proposal.mitre_coverage]);

  const archPositions = TYPE_TO_ARCH_POSITION[proposal.proposed_type] || ['agents'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-[95vw] max-w-[1400px] max-h-[90vh] overflow-hidden rounded-2xl border border-slate-700/60 bg-[#080b14] shadow-2xl shadow-cyan-500/5">
        {/* Header */}
        <div className="relative p-5 border-b border-slate-800 bg-gradient-to-r from-[#080b14] via-cyan-950/10 to-[#080b14]">
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-20 bg-cyan-500" />
            <div className="absolute -bottom-10 -left-10 w-40 h-40 rounded-full blur-3xl opacity-10 bg-emerald-500" />
          </div>
          <div className="relative flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/30">
                  <BrainCircuit className="w-4 h-4 text-cyan-400" />
                </div>
                <span className="text-[10px] uppercase tracking-[0.2em] text-cyan-300/80 font-bold">Capability Proposal Architecture</span>
              </div>
              <h2 className="text-xl font-bold text-white">{proposal.proposed_name}</h2>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">{proposal.description}</p>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 transition text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* View Toggle */}
          <div className="relative flex items-center gap-1 mt-4 p-1 rounded-xl bg-slate-900/60 border border-slate-800 w-fit">
            <button
              onClick={() => setActiveView('architecture')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeView === 'architecture'
                  ? 'bg-gradient-to-r from-cyan-500/20 to-emerald-500/10 border border-cyan-500/40 text-cyan-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Server className="w-3.5 h-3.5" />
              Databricks Architecture
            </button>
            <button
              onClick={() => setActiveView('attack_chain')}
              className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition ${
                activeView === 'attack_chain'
                  ? 'bg-gradient-to-r from-red-500/20 to-orange-500/10 border border-red-500/40 text-red-200'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Target className="w-3.5 h-3.5" />
              Attack Chain Coverage
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[calc(90vh-200px)]">
          {activeView === 'architecture' ? (
            <ArchitectureGraph proposal={proposal} archPositions={archPositions} paper={paper} />
          ) : (
            <AttackChainGraph proposal={proposal} coveredPhases={coveredPhases} paper={paper} />
          )}
        </div>
      </div>
    </div>
  );
}

function ArchitectureGraph({ proposal, archPositions, paper }: {
  proposal: Proposal;
  archPositions: string[];
  paper: Publication | null;
}) {
  return (
    <div className="space-y-6">
      {/* Architecture SVG */}
      <div className="relative rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 via-[#080b14] to-cyan-950/10 p-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-gradient-to-r from-transparent via-slate-700/30 to-transparent" />
        </div>

        <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold mb-6">Databricks Lakehouse Architecture - Integration Point</h3>

        {/* Main Architecture Flow */}
        <div className="relative">
          <svg className="w-full h-[280px]" viewBox="0 0 900 280" preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="glow-cyan">
                <feGaussianBlur stdDeviation="4" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <filter id="glow-emerald">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <linearGradient id="flow-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0" />
              </linearGradient>
              <linearGradient id="active-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.3" />
                <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="conn-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>

            {/* Connection lines between layers */}
            {ARCH_LAYERS.slice(0, -1).map((layer, i) => {
              const next = ARCH_LAYERS[i + 1];
              const isActive = archPositions.includes(layer.id) && archPositions.includes(next.id);
              return (
                <g key={`conn-${layer.id}`}>
                  <line
                    x1={layer.x + 60} y1={140}
                    x2={next.x - 10} y2={140}
                    stroke={isActive ? '#06b6d4' : '#1e293b'}
                    strokeWidth={isActive ? 2.5 : 1.5}
                    strokeDasharray={isActive ? '' : '4 4'}
                    opacity={isActive ? 0.8 : 0.4}
                  />
                  {isActive && (
                    <>
                      <circle r="3" fill="#06b6d4" opacity="0.9">
                        <animateMotion dur="2s" repeatCount="indefinite"
                          path={`M${layer.x + 60},140 L${next.x - 10},140`} />
                      </circle>
                      <circle r="2" fill="#06b6d4" opacity="0.5">
                        <animateMotion dur="2s" repeatCount="indefinite" begin="0.7s"
                          path={`M${layer.x + 60},140 L${next.x - 10},140`} />
                      </circle>
                    </>
                  )}
                </g>
              );
            })}

            {/* Layer nodes */}
            {ARCH_LAYERS.map(layer => {
              const isActive = archPositions.includes(layer.id);
              return (
                <g key={layer.id}>
                  {isActive && (
                    <rect x={layer.x - 15} y={95} width={130} height={90} rx={12}
                      fill="url(#active-grad)" stroke="#06b6d4" strokeWidth="1.5" strokeOpacity="0.6"
                      filter="url(#glow-cyan)">
                      <animate attributeName="stroke-opacity" values="0.3;0.8;0.3" dur="2.5s" repeatCount="indefinite" />
                    </rect>
                  )}
                  <rect x={layer.x - 10} y={100} width={120} height={80} rx={10}
                    fill={isActive ? '#0f172a' : '#0f1729'}
                    stroke={isActive ? '#06b6d4' : '#1e293b'}
                    strokeWidth={isActive ? 2 : 1}
                  />
                  <text x={layer.x + 50} y={130} textAnchor="middle"
                    fill={isActive ? '#e2e8f0' : '#64748b'} fontSize="11" fontWeight="700">
                    {layer.label}
                  </text>
                  <text x={layer.x + 50} y={150} textAnchor="middle"
                    fill={isActive ? '#94a3b8' : '#475569'} fontSize="8">
                    {layer.sublabel}
                  </text>
                  {isActive && (
                    <text x={layer.x + 50} y={168} textAnchor="middle"
                      fill="#06b6d4" fontSize="8" fontWeight="bold">
                      INTEGRATION
                    </text>
                  )}
                </g>
              );
            })}

            {/* Proposal node (floating above) */}
            <g>
              <rect x={350} y={10} width={200} height={60} rx={12}
                fill="#0c1524" stroke="#06b6d4" strokeWidth="2" filter="url(#glow-cyan)">
                <animate attributeName="stroke-opacity" values="0.5;1;0.5" dur="3s" repeatCount="indefinite" />
              </rect>
              <text x={450} y={33} textAnchor="middle" fill="#67e8f9" fontSize="9" fontWeight="bold" letterSpacing="0.5">
                PROPOSED CAPABILITY
              </text>
              <text x={450} y={52} textAnchor="middle" fill="#ffffff" fontSize="10" fontWeight="700">
                {proposal.proposed_name.length > 30 ? proposal.proposed_name.slice(0, 30) + '...' : proposal.proposed_name}
              </text>

              {/* Lines from proposal to integration points */}
              {archPositions.map((pos, i) => {
                const layer = ARCH_LAYERS.find(l => l.id === pos);
                if (!layer) return null;
                return (
                  <g key={`prop-conn-${pos}`}>
                    <path
                      d={`M450,70 Q450,85 ${layer.x + 50},100`}
                      fill="none" stroke="#06b6d4" strokeWidth="1.5" strokeDasharray="3 3" opacity="0.6"
                    />
                    <circle cx={layer.x + 50} cy={100} r="4" fill="#06b6d4" opacity="0.8">
                      <animate attributeName="r" values="3;5;3" dur="1.5s" repeatCount="indefinite" begin={`${i * 0.3}s`} />
                    </circle>
                  </g>
                );
              })}
            </g>

            {/* Unity Catalog (below) */}
            <rect x={300} y={220} width={300} height={40} rx={8}
              fill="#0f172a" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 3" />
            <text x={450} y={244} textAnchor="middle" fill="#475569" fontSize="9" fontWeight="600">
              Unity Catalog - Governance & Lineage
            </text>

            {/* Lines to unity catalog */}
            {[200, 340, 480, 620].map(x => (
              <line key={`uc-${x}`} x1={x + 50} y1={180} x2={x + 50} y2={220}
                stroke="#1e293b" strokeWidth="1" strokeDasharray="2 2" opacity="0.4" />
            ))}
          </svg>
        </div>
      </div>

      {/* Implementation Details */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Compute Requirements</h4>
          </div>
          <div className="space-y-2 text-xs">
            <InfoRow label="Cluster Type" value={proposal.proposed_type === 'ml_model' ? 'GPU (A100/H100)' : 'Standard (i3.xlarge)'} />
            <InfoRow label="Streaming" value={proposal.proposed_type === 'correlation_engine' ? 'Required (Structured Streaming)' : 'Optional'} />
            <InfoRow label="Delta Tables" value={`${Math.ceil(proposal.estimated_days / 10)} new tables`} />
            <InfoRow label="Est. Storage" value={proposal.implementation_complexity === 'research' ? '500GB+' : '50-200GB'} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <GitBranch className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Dependencies</h4>
          </div>
          <div className="space-y-2 text-xs">
            <InfoRow label="Notebooks" value={`${Math.ceil(proposal.estimated_days / 7)} new notebooks`} />
            <InfoRow label="Agents" value={proposal.proposed_type === 'agent' ? 'New agent registration' : 'Existing agent mesh'} />
            <InfoRow label="ML Models" value={proposal.proposed_type === 'ml_model' ? 'MLflow tracking + serving' : 'N/A'} />
            <InfoRow label="External APIs" value={proposal.mitre_coverage.length > 3 ? 'Threat Intel feeds' : 'None'} />
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Activity className="w-4 h-4 text-amber-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Delivery Timeline</h4>
          </div>
          <div className="space-y-2 text-xs">
            <InfoRow label="Complexity" value={proposal.implementation_complexity} highlight />
            <InfoRow label="Duration" value={`${proposal.estimated_days} days`} />
            <InfoRow label="Priority" value={`P${proposal.priority_score}/100`} />
            <InfoRow label="Status" value={proposal.status.replace('_', ' ').toUpperCase()} />
          </div>
          {paper && (
            <div className="mt-3 pt-3 border-t border-slate-700/40">
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                <BookOpen className="w-3 h-3" />
                Source: {paper.venue}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rationale */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">AI Rationale</h4>
        </div>
        <p className="text-sm text-slate-300 leading-relaxed">{proposal.rationale}</p>
      </div>
    </div>
  );
}

function AttackChainGraph({ proposal, coveredPhases, paper }: {
  proposal: Proposal;
  coveredPhases: Array<{ id: string; label: string; techniques: string[]; active: boolean; matchedTechniques: string[] }>;
  paper: Publication | null;
}) {
  const activeCount = coveredPhases.filter(p => p.active).length;
  const coveragePercent = Math.round((activeCount / coveredPhases.length) * 100);

  return (
    <div className="space-y-6">
      {/* Kill Chain Visualization */}
      <div className="relative rounded-xl border border-slate-800 bg-gradient-to-br from-slate-900/80 via-[#080b14] to-red-950/5 p-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-10 bg-red-500" />
        </div>

        <div className="relative flex items-center justify-between mb-6">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-bold">MITRE ATT&CK Kill Chain Coverage</h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Covering <span className="text-white font-bold">{activeCount}</span> of {coveredPhases.length} phases
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/30">
              <Target className="w-3 h-3 text-red-400" />
              <span className="text-xs font-bold text-red-300">{coveragePercent}% chain coverage</span>
            </div>
          </div>
        </div>

        {/* Kill Chain Phases */}
        <div className="relative">
          {/* Connection line */}
          <div className="absolute top-[52px] left-0 right-0 h-0.5 bg-slate-800" />
          <div className="absolute top-[52px] left-0 h-0.5 bg-gradient-to-r from-red-500 to-orange-500 transition-all duration-1000"
            style={{ width: `${(coveredPhases.findLastIndex(p => p.active) + 1) / coveredPhases.length * 100}%` }} />

          <div className="relative grid grid-cols-7 gap-1.5 mb-2">
            {coveredPhases.slice(0, 7).map((phase, i) => (
              <PhaseNode key={phase.id} phase={phase} index={i} />
            ))}
          </div>
          <div className="relative grid grid-cols-7 gap-1.5 mt-8">
            {coveredPhases.slice(7).map((phase, i) => (
              <PhaseNode key={phase.id} phase={phase} index={i + 7} />
            ))}
          </div>
        </div>
      </div>

      {/* Technique Detail Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="w-4 h-4 text-emerald-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Techniques Addressed</h4>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {proposal.mitre_coverage.map(t => (
              <span key={t} className="px-2 py-1 rounded-md text-[10px] font-mono font-bold bg-red-500/10 text-red-300 border border-red-500/20 hover:bg-red-500/20 transition cursor-default">
                {t}
              </span>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-slate-700/40 text-xs text-slate-400">
            <span className="text-white font-bold">{proposal.mitre_coverage.length}</span> techniques across{' '}
            <span className="text-white font-bold">{activeCount}</span> kill chain phases
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Network className="w-4 h-4 text-cyan-400" />
            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Detection Coverage Map</h4>
          </div>
          <div className="space-y-1.5">
            {coveredPhases.filter(p => p.active).map(phase => (
              <div key={phase.id} className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                <span className="text-xs text-slate-300 font-medium flex-1">{phase.label}</span>
                <div className="flex gap-1">
                  {phase.matchedTechniques.map(t => (
                    <span key={t} className="px-1 py-0.5 rounded text-[8px] font-mono bg-slate-800 text-slate-400">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Attack Scenario Narrative */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
        <div className="flex items-center gap-2 mb-2">
          <Zap className="w-4 h-4 text-red-400" />
          <h4 className="text-xs font-bold text-red-300 uppercase tracking-wider">Attack Scenario This Capability Defends Against</h4>
        </div>
        <div className="flex items-start gap-3">
          <div className="space-y-2 flex-1">
            <p className="text-sm text-slate-300 leading-relaxed">{proposal.rationale}</p>
            <div className="flex items-center gap-4 pt-2">
              {coveredPhases.filter(p => p.active).map((phase, i, arr) => (
                <div key={phase.id} className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-red-300/80">{phase.label}</span>
                  {i < arr.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Source Paper */}
      {paper && (
        <div className="rounded-xl border border-slate-700/40 bg-slate-900/30 p-4 flex items-start gap-3">
          <BookOpen className="w-4 h-4 text-cyan-400 mt-0.5 shrink-0" />
          <div>
            <h5 className="text-xs font-bold text-white">{paper.title}</h5>
            <p className="text-[10px] text-slate-400 mt-0.5">{paper.authors.join(', ')} - {paper.venue} ({paper.published_date})</p>
            <p className="text-[11px] text-slate-300 mt-1.5">{paper.summary_tldr}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PhaseNode({ phase, index }: {
  phase: { id: string; label: string; active: boolean; matchedTechniques: string[] };
  index: number;
}) {
  return (
    <div className={`relative flex flex-col items-center transition-all duration-500`}
      style={{ animationDelay: `${index * 100}ms` }}>
      {/* Node */}
      <div className={`relative w-full aspect-square max-w-[80px] rounded-xl border-2 flex flex-col items-center justify-center p-1.5 transition-all ${
        phase.active
          ? 'border-red-500/60 bg-red-500/10 shadow-lg shadow-red-500/20'
          : 'border-slate-700/40 bg-slate-900/40'
      }`}>
        {phase.active && (
          <div className="absolute inset-0 rounded-xl animate-pulse bg-red-500/5" />
        )}
        <div className={`w-3 h-3 rounded-full mb-1 ${phase.active ? 'bg-red-400' : 'bg-slate-700'}`}>
          {phase.active && (
            <div className="w-full h-full rounded-full animate-ping bg-red-400 opacity-50" />
          )}
        </div>
        <span className={`text-[8px] font-bold text-center leading-tight ${phase.active ? 'text-red-200' : 'text-slate-500'}`}>
          {phase.label}
        </span>
        {phase.active && (
          <span className="text-[7px] text-red-300/70 mt-0.5 font-mono">
            {phase.matchedTechniques.length}T
          </span>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium ${highlight ? 'text-amber-300' : 'text-slate-200'}`}>{value}</span>
    </div>
  );
}
