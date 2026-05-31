import { useState, useEffect, useRef } from 'react';
import { Brain, Zap, GitBranch, Eye, Target, Shield, Activity, TrendingUp, Search, Layers, ChevronRight } from 'lucide-react';
import MLModelExplainer from './MLModelExplainer';
import { ML_MODELS } from '../lib/mlModelData';

interface MicroPattern {
  id: string;
  name: string;
  description: string;
  category: string;
  embedding_dim: number;
  vector_magnitude: number;
  confidence: number;
  match_count: number;
  last_matched: string;
  enabled: boolean;
  threshold: number;
  tags: string[];
  reasoning_weight: number;
  correlations_used_in: number;
  sample_indicators: string[];
}

interface ReasoningNode {
  id: string;
  label: string;
  type: 'pattern' | 'correlation' | 'decision' | 'output';
  x: number;
  y: number;
  confidence: number;
}

interface ReasoningEdge {
  from: string;
  to: string;
  weight: number;
  label: string;
}

const mockMicroPatterns: MicroPattern[] = [
  {
    id: 'mp-1', name: 'Credential Spray Burst', description: 'Rapid authentication attempts across multiple accounts from single source within 60-second window',
    category: 'Identity', embedding_dim: 1536, vector_magnitude: 0.9847, confidence: 94.2, match_count: 847, last_matched: '2 min ago',
    enabled: true, threshold: 0.82, tags: ['brute-force', 'T1110', 'identity'], reasoning_weight: 0.91,
    correlations_used_in: 12, sample_indicators: ['auth_failure_rate > 15/min', 'unique_accounts > 5', 'single_source_ip']
  },
  {
    id: 'mp-2', name: 'Lateral Pivot Sequence', description: 'Sequential authentication to multiple internal hosts using service account credentials with RDP/SMB',
    category: 'Movement', embedding_dim: 1536, vector_magnitude: 0.9723, confidence: 91.8, match_count: 312, last_matched: '8 min ago',
    enabled: true, threshold: 0.85, tags: ['lateral-movement', 'T1021', 'pivoting'], reasoning_weight: 0.88,
    correlations_used_in: 9, sample_indicators: ['sequential_host_auth', 'service_account_misuse', 'rdp_smb_chain']
  },
  {
    id: 'mp-3', name: 'DNS Tunnel Beacon', description: 'Periodic DNS queries with high-entropy subdomains to rare TLDs suggesting C2 communication channel',
    category: 'Exfiltration', embedding_dim: 1536, vector_magnitude: 0.9651, confidence: 89.5, match_count: 156, last_matched: '23 min ago',
    enabled: true, threshold: 0.87, tags: ['dns-tunneling', 'T1071', 'c2'], reasoning_weight: 0.85,
    correlations_used_in: 7, sample_indicators: ['dns_entropy > 3.8', 'query_periodicity < 5s', 'rare_tld']
  },
  {
    id: 'mp-4', name: 'Privilege Token Forge', description: 'Kerberos ticket creation with anomalous lifetime or SPN targeting sensitive service accounts',
    category: 'Escalation', embedding_dim: 1536, vector_magnitude: 0.9812, confidence: 96.1, match_count: 42, last_matched: '1 hr ago',
    enabled: true, threshold: 0.90, tags: ['golden-ticket', 'T1558', 'kerberos'], reasoning_weight: 0.95,
    correlations_used_in: 5, sample_indicators: ['ticket_lifetime_anomaly', 'spn_sensitive_target', 'non_dc_origin']
  },
  {
    id: 'mp-5', name: 'File Staging Cluster', description: 'Multiple sensitive files copied to single staging directory followed by compression or encryption activity',
    category: 'Exfiltration', embedding_dim: 1536, vector_magnitude: 0.9534, confidence: 87.3, match_count: 98, last_matched: '45 min ago',
    enabled: true, threshold: 0.83, tags: ['staging', 'T1074', 'collection'], reasoning_weight: 0.82,
    correlations_used_in: 8, sample_indicators: ['file_copy_burst', 'staging_dir_created', 'compression_follows']
  },
  {
    id: 'mp-6', name: 'Process Injection Chain', description: 'Parent-child process anomaly with memory write operations to remote process followed by thread creation',
    category: 'Execution', embedding_dim: 1536, vector_magnitude: 0.9678, confidence: 92.7, match_count: 67, last_matched: '1.5 hr ago',
    enabled: false, threshold: 0.88, tags: ['injection', 'T1055', 'execution'], reasoning_weight: 0.89,
    correlations_used_in: 6, sample_indicators: ['cross_process_write', 'remote_thread_create', 'parent_child_anomaly']
  },
  {
    id: 'mp-7', name: 'Cloud API Abuse Burst', description: 'Unusual volume of cloud management API calls targeting IAM, S3, or Lambda from non-admin identity',
    category: 'Cloud', embedding_dim: 1536, vector_magnitude: 0.9401, confidence: 85.9, match_count: 203, last_matched: '12 min ago',
    enabled: true, threshold: 0.80, tags: ['cloud-abuse', 'T1078', 'iam'], reasoning_weight: 0.78,
    correlations_used_in: 11, sample_indicators: ['api_call_burst > 50/min', 'non_admin_caller', 'sensitive_service_target']
  },
  {
    id: 'mp-8', name: 'Insider Data Harvest', description: 'After-hours bulk access to sensitive file shares by user with recent HR flags or termination notice',
    category: 'Insider', embedding_dim: 1536, vector_magnitude: 0.9756, confidence: 93.4, match_count: 28, last_matched: '3 hr ago',
    enabled: true, threshold: 0.86, tags: ['insider-threat', 'T1213', 'data-theft'], reasoning_weight: 0.92,
    correlations_used_in: 4, sample_indicators: ['after_hours_access', 'bulk_file_read', 'hr_flag_correlation']
  },
];

const categoryColors: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  Identity: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-400', glow: '#3b82f6' },
  Movement: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-400', glow: '#f59e0b' },
  Exfiltration: { bg: 'bg-red-500/10', border: 'border-red-500/30', text: 'text-red-400', glow: '#ef4444' },
  Escalation: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-400', glow: '#f97316' },
  Execution: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-400', glow: '#f43f5e' },
  Cloud: { bg: 'bg-cyan-500/10', border: 'border-cyan-500/30', text: 'text-cyan-400', glow: '#06b6d4' },
  Insider: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-400', glow: '#10b981' },
};

const MicroPatternsPanel = () => {
  const [patterns, setPatterns] = useState(mockMicroPatterns);
  const [selectedPattern, setSelectedPattern] = useState<MicroPattern | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'reasoning'>('grid');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [animatingNodes, setAnimatingNodes] = useState<Set<string>>(new Set());
  const [activeEdges, setActiveEdges] = useState<Set<string>>(new Set());
  const [reasoningStep, setReasoningStep] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);

  const categories = ['all', ...Array.from(new Set(patterns.map(p => p.category)))];

  const filtered = patterns.filter(p => {
    const matchCategory = filterCategory === 'all' || p.category === filterCategory;
    const matchSearch = !searchTerm || p.name.toLowerCase().includes(searchTerm.toLowerCase()) || p.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchCategory && matchSearch;
  });

  const totalEnabled = patterns.filter(p => p.enabled).length;
  const avgConfidence = patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length;
  const totalMatches = patterns.reduce((sum, p) => sum + p.match_count, 0);
  const totalCorrelations = patterns.reduce((sum, p) => sum + p.correlations_used_in, 0);

  const togglePattern = (id: string) => {
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, enabled: !p.enabled } : p));
  };

  const updateThreshold = (id: string, val: number) => {
    setPatterns(prev => prev.map(p => p.id === id ? { ...p, threshold: val } : p));
  };

  const reasoningNodes: ReasoningNode[] = [
    { id: 'event', label: 'Incoming Event', type: 'pattern', x: 80, y: 200, confidence: 1 },
    { id: 'embed', label: 'Vector Embedding', type: 'pattern', x: 230, y: 120, confidence: 0.99 },
    { id: 'normalize', label: 'Normalization', type: 'pattern', x: 230, y: 280, confidence: 0.98 },
    { id: 'mp-search', label: 'Micro Pattern Search', type: 'correlation', x: 420, y: 80, confidence: 0.95 },
    { id: 'similarity', label: 'Cosine Similarity', type: 'correlation', x: 420, y: 200, confidence: 0.92 },
    { id: 'context', label: 'Context Enrichment', type: 'correlation', x: 420, y: 320, confidence: 0.90 },
    { id: 'aggregate', label: 'Pattern Aggregation', type: 'decision', x: 610, y: 140, confidence: 0.88 },
    { id: 'threshold', label: 'Threshold Gate', type: 'decision', x: 610, y: 280, confidence: 0.85 },
    { id: 'correlate', label: 'Correlation Engine', type: 'decision', x: 780, y: 200, confidence: 0.91 },
    { id: 'alert', label: 'Alert / Action', type: 'output', x: 930, y: 200, confidence: 0.94 },
  ];

  const reasoningEdges: ReasoningEdge[] = [
    { from: 'event', to: 'embed', weight: 1.0, label: 'encode' },
    { from: 'event', to: 'normalize', weight: 0.95, label: 'parse' },
    { from: 'embed', to: 'mp-search', weight: 0.92, label: 'query VectorDB' },
    { from: 'embed', to: 'similarity', weight: 0.90, label: 'compare' },
    { from: 'normalize', to: 'context', weight: 0.88, label: 'enrich' },
    { from: 'normalize', to: 'similarity', weight: 0.85, label: 'features' },
    { from: 'mp-search', to: 'aggregate', weight: 0.91, label: 'top-K matches' },
    { from: 'similarity', to: 'aggregate', weight: 0.89, label: 'scores' },
    { from: 'context', to: 'threshold', weight: 0.87, label: 'context' },
    { from: 'aggregate', to: 'correlate', weight: 0.93, label: 'weighted sum' },
    { from: 'threshold', to: 'correlate', weight: 0.86, label: 'gate pass' },
    { from: 'correlate', to: 'alert', weight: 0.94, label: 'trigger' },
  ];

  const animationOrder = [
    ['event'],
    ['embed', 'normalize'],
    ['mp-search', 'similarity', 'context'],
    ['aggregate', 'threshold'],
    ['correlate'],
    ['alert'],
  ];

  useEffect(() => {
    if (viewMode !== 'reasoning') return;

    setReasoningStep(0);
    setAnimatingNodes(new Set());
    setActiveEdges(new Set());

    let step = 0;
    const interval = setInterval(() => {
      if (step >= animationOrder.length) {
        step = 0;
        setAnimatingNodes(new Set());
        setActiveEdges(new Set());
        setReasoningStep(0);
      }

      const currentNodes = new Set(animationOrder.slice(0, step + 1).flat());
      setAnimatingNodes(currentNodes);
      setReasoningStep(step);

      const currentEdges = new Set<string>();
      reasoningEdges.forEach(e => {
        if (currentNodes.has(e.from) && currentNodes.has(e.to)) {
          currentEdges.add(`${e.from}-${e.to}`);
        }
      });
      setActiveEdges(currentEdges);

      step++;
    }, 1200);

    return () => clearInterval(interval);
  }, [viewMode]);

  const nodeTypeStyles: Record<string, { fill: string; stroke: string; glow: string }> = {
    pattern: { fill: '#1e3a5f', stroke: '#3b82f6', glow: '#3b82f680' },
    correlation: { fill: '#3b1f2b', stroke: '#f43f5e', glow: '#f43f5e80' },
    decision: { fill: '#2d1f0f', stroke: '#f59e0b', glow: '#f59e0b80' },
    output: { fill: '#0f2d1f', stroke: '#10b981', glow: '#10b98180' },
  };

  return (
    <div className="space-y-6">
      <MLModelExplainer {...ML_MODELS.microPatterns} />

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-600/15 to-blue-800/10 border border-blue-500/25 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Layers className="w-5 h-5 text-blue-400" />
            <span className="text-[10px] text-blue-400 font-semibold px-2 py-0.5 rounded bg-blue-500/10">VectorDB</span>
          </div>
          <p className="text-2xl font-bold text-white">{totalEnabled}/{patterns.length}</p>
          <p className="text-xs text-slate-400 mt-1">Active Micro Patterns</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-600/15 to-emerald-800/10 border border-emerald-500/25 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Brain className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold text-white">{avgConfidence.toFixed(1)}%</p>
          <p className="text-xs text-slate-400 mt-1">Avg Confidence</p>
        </div>
        <div className="bg-gradient-to-br from-amber-600/15 to-amber-800/10 border border-amber-500/25 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-5 h-5 text-amber-400" />
          </div>
          <p className="text-2xl font-bold text-white">{totalMatches.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-1">Total Matches</p>
        </div>
        <div className="bg-gradient-to-br from-rose-600/15 to-rose-800/10 border border-rose-500/25 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <GitBranch className="w-5 h-5 text-rose-400" />
          </div>
          <p className="text-2xl font-bold text-white">{totalCorrelations}</p>
          <p className="text-xs text-slate-400 mt-1">Correlation Links</p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search patterns..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white placeholder-slate-500 w-64 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 border border-slate-700/50">
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  filterCategory === cat
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700/40'
                }`}
              >
                {cat === 'all' ? 'All' : cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1 bg-slate-800/40 rounded-lg p-1 border border-slate-700/50">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" /> Patterns
          </button>
          <button
            onClick={() => setViewMode('reasoning')}
            className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 ${
              viewMode === 'reasoning' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" /> Reasoning Flow
          </button>
        </div>
      </div>

      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map(pattern => {
            const colors = categoryColors[pattern.category] || categoryColors.Identity;
            const isSelected = selectedPattern?.id === pattern.id;

            return (
              <div
                key={pattern.id}
                onClick={() => setSelectedPattern(isSelected ? null : pattern)}
                className={`group rounded-xl border transition-all duration-300 cursor-pointer ${
                  isSelected
                    ? `${colors.border} bg-slate-800/60 shadow-lg`
                    : 'border-slate-700/50 bg-slate-800/30 hover:bg-slate-800/50 hover:border-slate-600/60'
                } ${!pattern.enabled ? 'opacity-60' : ''}`}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`p-2 rounded-lg ${colors.bg} ${colors.border} border`}>
                        <Brain className={`w-4 h-4 ${colors.text}`} />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-white">{pattern.name}</h4>
                        <span className={`text-[10px] font-semibold ${colors.text}`}>{pattern.category}</span>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); togglePattern(pattern.id); }}
                      className={`relative w-10 h-5 rounded-full transition-all ${
                        pattern.enabled ? 'bg-emerald-500' : 'bg-slate-600'
                      }`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${
                        pattern.enabled ? 'left-5' : 'left-0.5'
                      }`} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 mb-3 leading-relaxed">{pattern.description}</p>

                  <div className="grid grid-cols-4 gap-2 mb-3">
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{pattern.confidence.toFixed(1)}%</p>
                      <p className="text-[10px] text-slate-500">Confidence</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{pattern.match_count}</p>
                      <p className="text-[10px] text-slate-500">Matches</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{(pattern.threshold * 100).toFixed(0)}%</p>
                      <p className="text-[10px] text-slate-500">Threshold</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-bold text-white">{pattern.correlations_used_in}</p>
                      <p className="text-[10px] text-slate-500">Correlations</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] text-slate-500">Reasoning Weight</span>
                    <span className="text-[10px] font-semibold text-white">{(pattern.reasoning_weight * 100).toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1.5 mb-3">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        pattern.reasoning_weight > 0.9 ? 'bg-emerald-500' :
                        pattern.reasoning_weight > 0.8 ? 'bg-blue-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${pattern.reasoning_weight * 100}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap gap-1 mb-2">
                    {pattern.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-700/50 text-slate-400 border border-slate-600/30">
                        {tag}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span>dim={pattern.embedding_dim} | mag={pattern.vector_magnitude.toFixed(4)}</span>
                    <span>Last: {pattern.last_matched}</span>
                  </div>
                </div>

                {isSelected && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-700/30 pt-3">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Similarity Threshold</label>
                      <div className="flex items-center gap-3">
                        <input
                          type="range"
                          min="0.70"
                          max="0.98"
                          step="0.01"
                          value={pattern.threshold}
                          onClick={e => e.stopPropagation()}
                          onChange={e => { e.stopPropagation(); updateThreshold(pattern.id, parseFloat(e.target.value)); }}
                          className="flex-1 accent-blue-500"
                        />
                        <span className="text-white text-sm font-semibold w-12">{(pattern.threshold * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] text-slate-400 mb-1.5">Sample Indicators</p>
                      <div className="space-y-1">
                        {pattern.sample_indicators.map((ind, i) => (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <ChevronRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                            <code className="text-emerald-300 font-mono">{ind}</code>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-slate-900/50 rounded-lg p-3">
                      <p className="text-[10px] text-slate-400 mb-2">Vector Embedding Visualization</p>
                      <EmbeddingMiniViz magnitude={pattern.vector_magnitude} confidence={pattern.confidence} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewMode === 'reasoning' && (
        <div className="space-y-4">
          <div className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-2 overflow-hidden">
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-blue-400" />
                <h3 className="text-sm font-semibold text-white">Reasoning Pipeline</h3>
                <span className="text-[10px] text-slate-500 ml-2">
                  Step {reasoningStep + 1} / {animationOrder.length}
                </span>
              </div>
              <div className="flex items-center gap-4 text-[10px]">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Pattern</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Correlation</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Decision</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Output</span>
              </div>
            </div>
            <svg ref={svgRef} viewBox="0 0 1020 400" className="w-full h-[360px]">
              <defs>
                {Object.entries(nodeTypeStyles).map(([type, style]) => (
                  <filter key={type} id={`glow-${type}`} x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feFlood floodColor={style.glow} result="color" />
                    <feComposite in="color" in2="blur" operator="in" result="glow" />
                    <feMerge>
                      <feMergeNode in="glow" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                ))}
                <marker id="arrow-active" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="#3b82f6" />
                </marker>
                <marker id="arrow-inactive" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
                  <path d="M0,0 L8,3 L0,6" fill="#334155" />
                </marker>
              </defs>

              {reasoningEdges.map(edge => {
                const fromNode = reasoningNodes.find(n => n.id === edge.from)!;
                const toNode = reasoningNodes.find(n => n.id === edge.to)!;
                const isActive = activeEdges.has(`${edge.from}-${edge.to}`);
                const midX = (fromNode.x + toNode.x) / 2;
                const midY = (fromNode.y + toNode.y) / 2 - 15;

                return (
                  <g key={`${edge.from}-${edge.to}`}>
                    <line
                      x1={fromNode.x} y1={fromNode.y}
                      x2={toNode.x} y2={toNode.y}
                      stroke={isActive ? '#3b82f6' : '#1e293b'}
                      strokeWidth={isActive ? 2 : 1}
                      strokeDasharray={isActive ? 'none' : '4,4'}
                      markerEnd={isActive ? 'url(#arrow-active)' : 'url(#arrow-inactive)'}
                      className="transition-all duration-500"
                      opacity={isActive ? 0.8 : 0.3}
                    />
                    {isActive && (
                      <circle r="3" fill="#3b82f6" opacity="0.9">
                        <animateMotion
                          dur="1.5s"
                          repeatCount="indefinite"
                          path={`M${fromNode.x},${fromNode.y} L${toNode.x},${toNode.y}`}
                        />
                      </circle>
                    )}
                    {isActive && (
                      <text x={midX} y={midY} textAnchor="middle" className="text-[9px] fill-slate-400 font-mono">
                        {edge.label}
                      </text>
                    )}
                  </g>
                );
              })}

              {reasoningNodes.map(node => {
                const style = nodeTypeStyles[node.type];
                const isActive = animatingNodes.has(node.id);
                const r = 28;

                return (
                  <g key={node.id} className="transition-all duration-500" opacity={isActive ? 1 : 0.35}>
                    {isActive && (
                      <circle cx={node.x} cy={node.y} r={r + 8} fill="none" stroke={style.stroke} strokeWidth="1" opacity="0.3">
                        <animate attributeName="r" values={`${r + 4};${r + 12};${r + 4}`} dur="2s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.3;0.1;0.3" dur="2s" repeatCount="indefinite" />
                      </circle>
                    )}
                    <circle
                      cx={node.x} cy={node.y} r={r}
                      fill={style.fill}
                      stroke={style.stroke}
                      strokeWidth={isActive ? 2 : 1}
                      filter={isActive ? `url(#glow-${node.type})` : undefined}
                    />
                    <text x={node.x} y={node.y - 4} textAnchor="middle" className="text-[9px] fill-white font-semibold" style={{ pointerEvents: 'none' }}>
                      {node.label.split(' ').slice(0, 2).join(' ')}
                    </text>
                    {node.label.split(' ').length > 2 && (
                      <text x={node.x} y={node.y + 8} textAnchor="middle" className="text-[9px] fill-white font-semibold" style={{ pointerEvents: 'none' }}>
                        {node.label.split(' ').slice(2).join(' ')}
                      </text>
                    )}
                    {isActive && (
                      <text x={node.x} y={node.y + 22} textAnchor="middle" className="text-[8px] fill-slate-400 font-mono">
                        {(node.confidence * 100).toFixed(0)}%
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Layers className="w-4 h-4 text-blue-400" />
                Pattern Matching Layer
              </h4>
              <p className="text-xs text-slate-400 mb-3">
                Incoming events are converted to vector embeddings (dim=1536) and compared against all active micro patterns using cosine similarity.
              </p>
              <div className="space-y-2">
                {patterns.filter(p => p.enabled).slice(0, 4).map(p => (
                  <div key={p.id} className="flex items-center justify-between text-[11px] bg-slate-900/40 rounded p-2">
                    <span className="text-slate-300">{p.name}</span>
                    <span className={`font-mono font-semibold ${p.reasoning_weight > 0.9 ? 'text-emerald-400' : 'text-blue-400'}`}>
                      w={p.reasoning_weight.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Reasoning Engine
              </h4>
              <p className="text-xs text-slate-400 mb-3">
                Matched patterns are aggregated with weighted scoring. Context enrichment adds temporal, behavioral, and entity-based signals.
              </p>
              <div className="space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-300">
                  <span>Weighted Pattern Score</span>
                  <span className="font-mono text-amber-400">SUM(w_i * sim_i)</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Context Bonus</span>
                  <span className="font-mono text-amber-400">+temporal_decay</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Threshold Gate</span>
                  <span className="font-mono text-amber-400">score {">"} threshold</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Multi-Pattern Boost</span>
                  <span className="font-mono text-amber-400">n_patterns * 1.15</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Correlation Output
              </h4>
              <p className="text-xs text-slate-400 mb-3">
                Patterns that pass the threshold gate feed into the correlation engine, linking related events into attack narratives.
              </p>
              <div className="space-y-2">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-2">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-emerald-400 font-semibold">Active Correlations</span>
                    <span className="text-white font-bold">{totalCorrelations}</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1">
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: '78%' }} />
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded p-2">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-blue-400 font-semibold">Pattern Overlap</span>
                    <span className="text-white font-bold">34%</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: '34%' }} />
                  </div>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded p-2">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span className="text-amber-400 font-semibold">False Positive Rate</span>
                    <span className="text-white font-bold">2.1%</span>
                  </div>
                  <div className="w-full bg-slate-700/50 rounded-full h-1">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: '2.1%' }} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const EmbeddingMiniViz = ({ magnitude, confidence }: { magnitude: number; confidence: number }) => {
  const bars = 32;
  const heights = Array.from({ length: bars }, (_, i) => {
    const base = Math.sin(i * 0.6) * 0.4 + 0.5;
    const noise = Math.sin(i * 2.3 + magnitude * 100) * 0.2;
    return Math.max(0.1, Math.min(1, base + noise)) * magnitude;
  });

  return (
    <div className="flex items-end gap-px h-10">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-sm transition-all duration-500"
          style={{
            height: `${h * 100}%`,
            backgroundColor: confidence > 90
              ? `rgba(16, 185, 129, ${0.3 + h * 0.7})`
              : confidence > 80
                ? `rgba(59, 130, 246, ${0.3 + h * 0.7})`
                : `rgba(245, 158, 11, ${0.3 + h * 0.7})`,
          }}
        />
      ))}
    </div>
  );
};

export default MicroPatternsPanel;
